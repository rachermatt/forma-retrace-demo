import { createHash } from 'node:crypto';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { canonicalJson, DomainError } from '../server/domain.ts';
import { createModelDataStore } from '../server/model-data.ts';

type Json = Record<string, any>;
export type ProcessingOptions = { dataDir: string; datasetId: string; profileId: string; profileRevisionId?: string; publishTitle?: string; reviewer?: string; reason?: string; includeUnresolved: boolean };
export const MODEL_DATA_PROCESS_USAGE = `Process already saved local model data without opening a browser.

node scripts/model-data-process.ts --data-dir <existing app data directory> \\
  --dataset-id <saved dataset ID> --profile-id <saved profile ID> \\
  [--profile-revision-id <exact saved revision>] \\
  [--publish-title <title> --reviewer <name> --reason <basis> --include-unresolved]

Only model-data-local.sqlite in the chosen directory is used. Save an authorized
property extract and profile in the application first. No files are imported,
no profiles are revised, no APS credentials are read and no network calls occur.
Without --profile-revision-id, the latest saved profile revision is selected and
its exact revision is reported. Current saved room-group revisions are included.
Identical run inputs are reused. Optional fixed publications are retained in the
same SQLite database and reused when snapshot/title/reviewer/basis match.
Unknown quantities and unresolved exceptions remain explicit. Publications require
--include-unresolved when open exceptions exist. Reviewer identity is self-asserted;
this command provides no inspection acceptance or quantity certification.
This is a local synchronous command, not a durable or production service worker.
`;

class CliError extends Error {}
const values = new Set(['--data-dir', '--dataset-id', '--profile-id', '--profile-revision-id', '--publish-title', '--reviewer', '--reason']);
export function parseModelDataArgs(args: string[]): ProcessingOptions | null {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return null;
  const supplied = new Map<string, string>(); let includeUnresolved = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--include-unresolved') { if (includeUnresolved) throw new CliError('Repeated --include-unresolved option.'); includeUnresolved = true; continue; }
    if (!values.has(flag)) throw new CliError(`Unsupported option: ${flag}. Use --help.`);
    if (supplied.has(flag)) throw new CliError(`Repeated ${flag} option.`);
    const value = args[++index];
    if (!value || value.startsWith('--') || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw new CliError(`Supply one nonempty value for ${flag}.`);
    const maximum = flag === '--reason' ? 2000 : flag === '--data-dir' ? 4096 : 300;
    if (value.length > maximum) throw new CliError(`${flag} exceeds ${maximum} characters.`);
    supplied.set(flag, flag === '--data-dir' ? value : value.trim());
  }
  for (const flag of ['--data-dir', '--dataset-id', '--profile-id']) if (!supplied.has(flag)) throw new CliError(`Missing ${flag}. Use --help.`);
  const publishTitle = supplied.get('--publish-title'), reviewer = supplied.get('--reviewer'), reason = supplied.get('--reason');
  if (publishTitle && (!reviewer || !reason)) throw new CliError('Publication requires --publish-title, --reviewer and --reason.');
  if (!publishTitle && (reviewer || reason || includeUnresolved)) throw new CliError('Publication options require --publish-title.');
  return { dataDir: supplied.get('--data-dir')!, datasetId: supplied.get('--dataset-id')!, profileId: supplied.get('--profile-id')!, profileRevisionId: supplied.get('--profile-revision-id'), publishTitle, reviewer, reason, includeUnresolved };
}

/** Uses saved local records only; this entrypoint cannot assert new APS provenance. */
export function processSavedModelData(options: ProcessingOptions): Json {
  const requested = resolve(options.dataDir);
  if (!existsSync(requested) || !statSync(requested).isDirectory()) throw new CliError('Choose an existing application data directory. This command does not create a new workspace.');
  const directory = realpathSync(requested), dbPath = join(directory, 'model-data-local.sqlite');
  if (!existsSync(dbPath) || !statSync(dbPath).isFile()) throw new CliError('The chosen directory has no model-data-local.sqlite. Import authorized source data and save a profile in the local application first.');
  if (realpathSync(dbPath) !== dbPath) throw new CliError('The local model-data database must stay inside the chosen directory; database symlinks are not followed.');
  // Refuse empty/foreign files before the application store can initialize a schema.
  let check: DatabaseSync | undefined;
  try {
    check = new DatabaseSync(dbPath, { readOnly: true });
    const tables = check.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
    if (!['model_data_metadata', 'model_data_records', 'model_data_exports'].every(name => tables.includes(name)) || check.prepare('SELECT value FROM model_data_metadata WHERE key=?').get('workspace')?.value !== 'local') throw new Error('Not a saved local workspace.');
  } catch { throw new CliError('The chosen file is not an initialized local model-data database. Use the application to save local source data first.'); }
  finally { check?.close(); }
  const store = createModelDataStore({ dbPath, workspace: 'local' });
  try {
    const dataset = store.dataset(options.datasetId);
    if (dataset.workspace !== 'local' || !['imported', 'aps'].includes(dataset.data_mode) || dataset.data_mode === 'aps' && dataset.verified_source !== true) throw new CliError('Only previously saved imported data or server-verified APS extracts may be processed in this local workspace.');
    const before = store.bootstrap();
    const run = store.run({ dataset_id: options.datasetId, profile_id: options.profileId, ...(options.profileRevisionId ? { profile_revision_id: options.profileRevisionId } : {}) });
    let publication: Json | null = null, publicationReused = false;
    if (options.publishTitle && run.status !== 'failed') {
      const open = run.exceptions.filter((exception: Json) => exception.status === 'open');
      if (open.length && !options.includeUnresolved) throw new CliError(`Run ${run.run_id} retains ${open.length} open exception(s). Review them in the application or explicitly pass --include-unresolved before publication.`);
      const snapshotHash = createHash('sha256').update(canonicalJson(run)).digest('hex');
      for (const summary of before.exports) {
        if (summary.run_id !== run.run_id || summary.snapshot_sha256 !== snapshotHash || summary.title !== options.publishTitle) continue;
        const saved = store.getExport(summary.export_id).manifest;
        if (saved.reviewer === options.reviewer && saved.reason === options.reason && saved.unresolved_included === (open.length > 0)) { publication = summary; publicationReused = true; break; }
      }
      if (!publication) publication = store.publish({ run_id: run.run_id, title: options.publishTitle, reviewer: options.reviewer, reason: options.reason, include_unresolved: options.includeUnresolved });
    }
    return {
      schema_version: 'forma-retrace.model-data-cli/1', workspace: 'local', data_mode: run.data_mode,
      dataset_id: run.dataset_id, profile_id: run.profile_id, profile_revision_id: run.profile_revision_id, group_revision_ids: run.groups.map((group: Json) => group.revision_id),
      run_id: run.run_id, status: run.status, input_sha256: run.input_sha256, run_reused: before.runs.some((previous: Json) => previous.run_id === run.run_id),
      result_count: run.results.length, open_exception_count: run.exceptions.filter((exception: Json) => exception.status === 'open').length,
      publication, publication_reused: publicationReused, external_writes_enabled: false,
      limitations: [...run.limitations, 'Local synchronous processing only; no durable queue, scheduled worker, APS fetch or enterprise dataset authorization is provided.', 'Publication reviewer identity is self-asserted; a fixed snapshot does not certify source data, installation, quantities, acceptance or payment.'],
    };
  } finally { store.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseModelDataArgs(process.argv.slice(2));
    if (!options) process.stdout.write(MODEL_DATA_PROCESS_USAGE);
    else { const result = processSavedModelData(options); process.stdout.write(JSON.stringify(result, null, 2) + '\n'); if (result.status === 'failed') process.exitCode = 1; }
  } catch (error) {
    const message = error instanceof CliError || error instanceof DomainError ? error.message : 'Local processing failed. Check the existing data directory and saved dataset/profile IDs.';
    process.stderr.write(JSON.stringify({ error: message }) + '\n'); process.exitCode = 1;
  }
}
