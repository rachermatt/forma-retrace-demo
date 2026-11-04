import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createModelDataStore } from '../server/model-data.ts';
import { sampleModelDataset, sampleModelProfile } from '../server/model-data-fixtures.ts';
import { parseModelDataArgs, processSavedModelData, type ProcessingOptions } from '../scripts/model-data-process.ts';

function prepared(t: { after: (cleanup: () => void) => void }) {
  const directory = mkdtempSync(join(tmpdir(), 'forma-retrace-model-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = createModelDataStore({ dbPath: join(directory, 'model-data-local.sqlite'), workspace: 'local' });
  const dataset = store.importDataset({ ...sampleModelDataset(), data_mode: 'imported', source_description: 'Clearly labeled test properties; no live customer source or quantity certification.' });
  const profile = store.saveProfile(sampleModelProfile()); store.close();
  const options: ProcessingOptions = { dataDir: directory, datasetId: dataset.dataset_id, profileId: profile.profile_id, profileRevisionId: profile.revision_id, includeUnresolved: false };
  return { directory, dataset, profile, options };
}

test('CLI accepts only saved IDs and explicit publication disclosure options', () => {
  assert.equal(parseModelDataArgs(['--help']), null);
  const required = ['--data-dir', '/chosen/path', '--dataset-id', 'dataset-1', '--profile-id', 'profile-1'];
  assert.equal(parseModelDataArgs(required)!.datasetId, 'dataset-1');
  for (const extra of [['--input', '/some/file.json'], ['--profile', '/some/profile.json'], ['--data-dir', '/again'], ['--publish-title', 'Snapshot'], ['--include-unresolved'], ['--profile-revision-id']]) assert.throws(() => parseModelDataArgs([...required, ...extra]));
  assert.throws(() => parseModelDataArgs([]), /Missing --data-dir/);
});

test('saved local processing pins exact profile revision and reuses runs without profile revisions or network calls', t => {
  const { directory, options, profile } = prepared(t); writeFileSync(join(directory, 'fixture.sqlite'), 'unrelated historical fixture sentinel');
  const previousFetch = globalThis.fetch; globalThis.fetch = (() => { throw Error('The local CLI must not fetch any URL.'); }) as typeof fetch;
  let first: Record<string, any>;
  try { first = processSavedModelData(options); const repeated = processSavedModelData(options); assert.equal(repeated.run_id, first.run_id); assert.equal(repeated.run_reused, true); } finally { globalThis.fetch = previousFetch; }
  assert.equal(first!.profile_revision_id, profile.revision_id); assert.equal(first!.data_mode, 'imported'); assert.equal(first!.external_writes_enabled, false); assert.equal(first!.publication, null);
  const store = createModelDataStore({ dbPath: join(directory, 'model-data-local.sqlite'), workspace: 'local' });
  try { assert.equal(store.bootstrap().profile_revisions.length, 1); assert.equal(store.bootstrap().runs.length, 1); } finally { store.close(); }
  assert.equal(readFileSync(join(directory, 'fixture.sqlite'), 'utf8'), 'unrelated historical fixture sentinel');
});

test('publication requires unresolved acknowledgment, reuses identical snapshots and preserves exports after correction', t => {
  const { directory, options } = prepared(t);
  const publication = { ...options, publishTitle: 'Local batch test snapshot', reviewer: 'Named local reviewer', reason: 'Source-property validation only; unresolved exceptions explicitly included.' };
  assert.throws(() => processSavedModelData(publication), /--include-unresolved/);
  const first = processSavedModelData({ ...publication, includeUnresolved: true }), repeated = processSavedModelData({ ...publication, includeUnresolved: true });
  assert.equal(repeated.publication.export_id, first.publication.export_id); assert.equal(repeated.publication_reused, true);
  const store = createModelDataStore({ dbPath: join(directory, 'model-data-local.sqlite'), workspace: 'local' });
  let before: Record<string, any>;
  try {
    before = store.getExport(first.publication.export_id); const run = store.getRun(first.run_id); const result = run.results.find((row: any) => Object.keys(row.normalized).length);
    const key = Object.keys(result.normalized)[0];
    store.override({ run_id: run.run_id, element_key: result.element_key, target: 'property', key, value: result.normalized[key].value, unit: result.normalized[key].unit ?? undefined, reviewer: 'Independent local reviewer', reason: 'Reconfirmed source property after the first fixed publication.' });
  } finally { store.close(); }
  const corrected = processSavedModelData({ ...publication, includeUnresolved: true }); assert.notEqual(corrected.publication.export_id, first.publication.export_id);
  const reopened = createModelDataStore({ dbPath: join(directory, 'model-data-local.sqlite'), workspace: 'local' });
  try { assert.deepEqual(reopened.getExport(first.publication.export_id), before!); assert.equal(reopened.bootstrap().exports.length, 2); } finally { reopened.close(); }
});

test('missing and symlink-escaped databases are rejected without creating a new workspace', t => {
  const { directory, options } = prepared(t); const missing = join(directory, 'not-created');
  assert.throws(() => processSavedModelData({ ...options, dataDir: missing }), /existing application data directory/); assert.equal(existsSync(missing), false);
  const other = mkdtempSync(join(tmpdir(), 'forma-retrace-model-cli-other-')); t.after(() => rmSync(other, { recursive: true, force: true }));
  assert.throws(() => processSavedModelData({ ...options, dataDir: other }), /no model-data-local.sqlite/); assert.equal(existsSync(join(other, 'model-data-local.sqlite')), false);
  const foreign = join(other, 'model-data-local.sqlite'); writeFileSync(foreign, 'unrelated database sentinel');
  assert.throws(() => processSavedModelData({ ...options, dataDir: other }), /not an initialized local model-data database/); assert.equal(readFileSync(foreign, 'utf8'), 'unrelated database sentinel'); rmSync(foreign);
  symlinkSync(join(directory, 'model-data-local.sqlite'), join(other, 'model-data-local.sqlite'));
  assert.throws(() => processSavedModelData({ ...options, dataDir: other }), /symlinks are not followed/);
});

test('command-line entrypoint emits JSON and returns nonzero for invalid IDs and failed category processing', t => {
  const { directory, options } = prepared(t); const script = resolve('scripts/model-data-process.ts');
  const args = ['--data-dir', directory, '--dataset-id', options.datasetId, '--profile-id', options.profileId, '--profile-revision-id', options.profileRevisionId!];
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, APS_CLIENT_SECRET: 'must-not-be-used-or-printed' } });
  assert.equal(result.status, 0, result.stderr); assert.ok(JSON.parse(result.stdout).run_id); assert.doesNotMatch(result.stdout + result.stderr, /must-not-be-used-or-printed/);
  const invalid = spawnSync(process.execPath, [script, '--data-dir', directory, '--dataset-id', 'missing', '--profile-id', options.profileId], { encoding: 'utf8' });
  assert.equal(invalid.status, 1); assert.match(JSON.parse(invalid.stderr).error, /unavailable/);
  const store = createModelDataStore({ dbPath: join(directory, 'model-data-local.sqlite'), workspace: 'local' });
  let profile: Record<string, any>;
  try { profile = store.saveProfile({ ...sampleModelProfile(), category: 'No matching test category' }); } finally { store.close(); }
  const failed = spawnSync(process.execPath, [script, '--data-dir', directory, '--dataset-id', options.datasetId, '--profile-id', profile!.profile_id, '--publish-title', 'Must not publish', '--reviewer', 'Local test reviewer', '--reason', 'Failed category test', '--include-unresolved'], { encoding: 'utf8' });
  assert.equal(failed.status, 1); const body = JSON.parse(failed.stdout); assert.equal(body.status, 'failed'); assert.equal(body.publication, null); assert.equal(body.open_exception_count, 1);
});
