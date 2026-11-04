import test from 'node:test';
import assert from 'node:assert/strict';
import { createAps, ApsError } from '../server/aps.ts';
import { createModelDataStore } from '../server/model-data.ts';

const API = 'https://developer.api.autodesk.com';
const HUB = '31bbf700-27f1-47cc-b30c-2e8048443ee8';
const PROJECT = 'b.11111111-1111-4111-8111-111111111111';
const FOLDER = 'urn:adsk.wipprod:fs.folder:co.model-folder';
const ITEM = 'urn:adsk.wipprod:dm.lineage:model-item';
const VERSION = 'urn:adsk.wipprod:fs.file:vf.model-item?version=7';
const URN = Buffer.from(VERSION).toString('base64url');
const VIEW = 'viewable-123';
const PROJECTS = `/project/v1/hubs/b.${HUB}/projects`;
const TOP = `${PROJECTS}/${encodeURIComponent(PROJECT)}/topFolders`;
const CONTENTS = `/data/v1/projects/${encodeURIComponent(PROJECT)}/folders/${encodeURIComponent(FOLDER)}/contents`;
const VERSIONS = `/data/v1/projects/${encodeURIComponent(PROJECT)}/items/${encodeURIComponent(ITEM)}/versions`;
const VERSION_PATH = `/data/v1/projects/${encodeURIComponent(PROJECT)}/versions/${encodeURIComponent(VERSION)}`;
const MD = `/modelderivative/v2/designdata/${URN}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const versionRow = () => ({ id: VERSION, type: 'versions', attributes: { displayName: 'Mechanical.rvt', versionNumber: 7 }, relationships: { item: { data: { id: ITEM, type: 'items' } }, derivatives: { data: { id: URN, type: 'derivatives' } } }, links: { webView: { href: 'https://acc.autodesk.com/docs/files/projects/project-id' } } });
const element = () => ({ objectid: 42, externalId: 'AHU-EXTERNAL-1', name: 'Air handling unit', properties: { 'Identity Data': { Category: 'Mechanical Equipment', Manufacturer: 'Example fixture manufacturer', Model: 'Test unit' }, Dimensions: { Airflow: 2500, Weight: null, Note: 'Do not infer a unit from this fixture value' } } });
type Override = (path: string, init: RequestInit) => Response | Promise<Response> | undefined;

function setup(override: Override = () => undefined) {
  let clock = 1_000_000, tokenCount = 0;
  const calls: { path: string; init: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input)); assert.equal(url.origin, API);
    const path = url.pathname + url.search; calls.push({ path, init });
    const custom = await override(path, init); if (custom) return custom;
    if (url.pathname === '/authentication/v2/token') { tokenCount++; return json({ access_token: `test-access-${tokenCount}`, refresh_token: 'test-refresh', token_type: 'Bearer', expires_in: 3600 }); }
    if (url.pathname === PROJECTS) return json({ data: [{ id: PROJECT, type: 'projects', attributes: { name: 'Authorized test project' } }] });
    if (path === TOP) return json({ data: [{ id: FOLDER, type: 'folders', attributes: { displayName: 'Project files' } }, { id: 'hidden', type: 'folders', attributes: { displayName: 'Hidden', hidden: true } }] });
    if (path === CONTENTS) return json({ data: [{ id: ITEM, type: 'items', attributes: { displayName: 'Mechanical.rvt' } }] });
    if (path === VERSIONS) return json({ data: [versionRow()] });
    if (path === VERSION_PATH) return json({ data: versionRow() });
    if (path === `${MD}/manifest`) return json({ status: 'success', derivatives: [{ outputType: 'svf2' }] });
    if (path === `${MD}/metadata`) return json({ data: { metadata: [{ guid: VIEW, role: '3d', name: 'Coordination view' }, { guid: 'sheet', role: '2d', name: 'Sheet' }] } });
    if (path === `${MD}/metadata/${VIEW}/properties?forceget=true`) return json({ data: { collection: [element()] } });
    throw new Error(`Unexpected test request ${path}`);
  }) as typeof fetch;
  const options = { mode: 'live' as const, clientId: 'test-client', clientSecret: 'test-secret', callback: 'http://localhost:8080/', hubId: HUB, fetchImpl, now: () => clock };
  const aps = createAps(options);
  return { aps, options, calls, advance: (ms: number) => { clock += ms; } };
}
async function signIn(aps: ReturnType<typeof createAps>) { const { state } = aps.login(); return (await aps.callback('test-code', state, state)).sessionId; }
async function browse(aps: ReturnType<typeof createAps>, session: string) {
  await aps.modelTopFolders(session, PROJECT); await aps.modelFolderContents(session, PROJECT, FOLDER); await aps.modelItemVersions(session, PROJECT, ITEM); return aps.modelViewables(session, PROJECT, VERSION);
}
const errorStatus = (status: number) => (error: unknown) => error instanceof ApsError && error.status === status;

test('live model browsing requires a server session and fixture mode performs no upstream model requests', async () => {
  const { options, calls } = setup(); const fixture = createAps({ ...options, mode: 'fixture' });
  await assert.rejects(() => fixture.modelTopFolders('invented', PROJECT), errorStatus(409));
  const live = createAps(options); await assert.rejects(() => live.modelTopFolders(undefined, PROJECT), errorStatus(401));
  assert.equal(calls.length, 0);
});

test('authorized source browsing retains exact version provenance, raw properties and a server-held APS import receipt', async () => {
  const { aps, calls } = setup(); const session = await signIn(aps);
  const folders = await aps.modelTopFolders(session, PROJECT); assert.equal(folders.entries.length, 1); assert.equal(folders.entries[0].id, FOLDER);
  await aps.modelFolderContents(session, PROJECT, FOLDER); await aps.modelItemVersions(session, PROJECT, ITEM);
  const viewables = await aps.modelViewables(session, PROJECT, VERSION);
  assert.deepEqual(viewables.entries, [{ id: VIEW, name: 'Coordination view', role: '3d' }]);
  assert.equal(viewables.embedded_viewer_available, false); assert.match(viewables.viewer_dependency, /proxy/);
  assert.match(viewables.web_view_url!, /^https:\/\/acc\.autodesk\.com\//);
  const receipt = await aps.modelProperties(session, PROJECT, VERSION, VIEW);
  assert.equal(receipt.preview.element_count, 1); assert.equal(receipt.preview.transient_identifier_count, 0);
  assert.doesNotMatch(JSON.stringify(receipt), /test-access|test-refresh|test-secret|test-client/);
  const input = await aps.takeModelExtract(session, receipt.extract_receipt_id);
  assert.equal(input.data_mode, 'aps'); assert.equal(input.models[0].project_id, PROJECT); assert.equal(input.models[0].model_id, ITEM); assert.equal(input.models[0].version_id, VERSION);
  assert.equal(input.models[0].derivative_urn, URN); assert.equal(input.models[0].viewable_id, VIEW); assert.equal(input.models[0].designation, 'unverified'); assert.equal(input.models[0].length_unit, 'unknown');
  assert.equal(input.elements[0].external_id, 'AHU-EXTERNAL-1'); assert.equal(input.elements[0].db_id, 42); assert.equal(input.elements[0].category, 'Mechanical Equipment');
  assert.deepEqual(input.elements[0].properties['Dimensions/Airflow'], { value: 2500, unit: null }); assert.equal(input.elements[0].properties['Dimensions/Weight'].value, null); assert.equal(input.elements[0].bounds, undefined);
  assert.deepEqual(await aps.takeModelExtract(session, receipt.extract_receipt_id), input, 'Receipt retries reuse the exact server snapshot.');
  const store = createModelDataStore({ dbPath: ':memory:', workspace: 'local' });
  try {
    assert.throws(() => store.importDataset(input), /authorized server-side extraction receipt/);
    const saved = store.importDataset(input, { verifiedSource: true });
    assert.equal(saved.verified_source, true); assert.equal(saved.models[0].version_id, VERSION);
    assert.equal(saved.elements[0].properties['Dimensions/Weight'].value, null);
    assert.equal(store.importDataset({ ...input, models: input.models.map(model => ({ ...model, extracted_at: '2026-11-04T16:00:00Z' })) }, { verifiedSource: true }).dataset_id, saved.dataset_id, 'Repeated extraction of identical source content does not duplicate the dataset.');
  } finally { store.close(); }
  for (const call of calls.filter(c => c.path !== '/authentication/v2/token')) { assert.equal(call.init.method, 'GET'); assert.equal(call.init.redirect, 'error'); assert.match(new Headers(call.init.headers).get('authorization')!, /^Bearer test-access-/); }
});

test('foreign projects, unbrowsed resources, arbitrary URLs and guessed viewables fail before source extraction', async () => {
  const { aps, calls } = setup(); const session = await signIn(aps);
  await assert.rejects(() => aps.modelTopFolders(session, 'foreign-project'), errorStatus(404));
  await assert.rejects(() => aps.modelTopFolders(session, 'https://attacker.example'), errorStatus(400));
  await assert.rejects(() => aps.modelFolderContents(session, PROJECT, '../../escape'), errorStatus(400));
  await assert.rejects(() => aps.modelFolderContents(session, PROJECT, FOLDER), errorStatus(409));
  await assert.rejects(() => aps.modelItemVersions(session, PROJECT, ITEM), errorStatus(409));
  await assert.rejects(() => aps.modelViewables(session, PROJECT, VERSION), errorStatus(409));
  await browse(aps, session);
  await assert.rejects(() => aps.modelProperties(session, PROJECT, VERSION, 'foreign-guid'), errorStatus(409));
  assert.equal(calls.filter(c => c.path.includes('/properties')).length, 0);
});

test('source pagination follows only the same selected resource and returns no partial foreign results', async () => {
  const { aps } = setup(path => path === TOP ? json({ data: [{ id: FOLDER, type: 'folders', attributes: { displayName: 'First' } }], links: { next: { href: `${API}${TOP}?page[number]=1&page[limit]=100` } } }) : path === `${TOP}?page[number]=1&page[limit]=100` ? json({ data: [{ id: 'second-folder', type: 'folders', attributes: { displayName: 'Second' } }] }) : undefined);
  const session = await signIn(aps); assert.equal((await aps.modelTopFolders(session, PROJECT)).entries.length, 2);
  for (const next of [`https://attacker.example${TOP}`, `${API}${TOP.replace(PROJECT, 'foreign-project')}`, `${API}${TOP}?unexpected=1`, `${API}${TOP}`]) {
    const s = setup(path => path === TOP ? json({ data: [{ id: FOLDER, type: 'folders', attributes: { displayName: 'First' } }], links: { next: { href: next } } }) : undefined);
    const sid = await signIn(s.aps); await assert.rejects(() => s.aps.modelTopFolders(sid, PROJECT), errorStatus(502));
  }
});

test('versions and derivative processing are pinned to browsed source identity', async () => {
  const bad = setup(path => path === VERSIONS ? json({ data: [{ ...versionRow(), relationships: { item: { data: { id: 'foreign-item' } } } }] }) : undefined);
  const sid = await signIn(bad.aps); await bad.aps.modelTopFolders(sid, PROJECT); await bad.aps.modelFolderContents(sid, PROJECT, FOLDER);
  await assert.rejects(() => bad.aps.modelItemVersions(sid, PROJECT, ITEM), errorStatus(502));
  const pending = setup(path => path === `${MD}/manifest` ? json({ status: 'inprogress' }) : undefined);
  const pendingId = await signIn(pending.aps); await assert.rejects(() => browse(pending.aps, pendingId), errorStatus(409));
  const invalid = setup(path => path === VERSION_PATH ? json({ data: { ...versionRow(), id: VERSION + '-different' } }) : undefined);
  const invalidId = await signIn(invalid.aps); await assert.rejects(() => browse(invalid.aps, invalidId), errorStatus(502));
});

test('extract receipts are session-bound, expire, and recheck source access before a trusted import', async () => {
  let denied = false; const { aps, advance } = setup(path => path === VERSION_PATH && denied ? json({ error: 'upstream test-secret' }, 403) : undefined);
  const sid = await signIn(aps); await browse(aps, sid); const receipt = await aps.modelProperties(sid, PROJECT, VERSION, VIEW);
  const other = await signIn(aps); await assert.rejects(() => aps.takeModelExtract(other, receipt.extract_receipt_id), errorStatus(404));
  denied = true; await assert.rejects(() => aps.takeModelExtract(sid, receipt.extract_receipt_id), error => errorStatus(403)(error) && !String(error).includes('test-secret'));
  denied = false; advance(10 * 60_000 + 1); await assert.rejects(() => aps.takeModelExtract(sid, receipt.extract_receipt_id), errorStatus(404));
  await browse(aps, sid); const next = await aps.modelProperties(sid, PROJECT, VERSION, VIEW); aps.logout(sid);
  await assert.rejects(() => aps.takeModelExtract(sid, next.extract_receipt_id), errorStatus(404));
  await assert.rejects(() => aps.modelTopFolders(sid, PROJECT), errorStatus(401));
});

test('model reads refresh rejected server tokens without leaking them or reviving logout', async () => {
  let first = true; const { aps, calls } = setup(path => path === TOP && first ? (first = false, json({}, 401)) : undefined);
  const sid = await signIn(aps); assert.equal((await aps.modelTopFolders(sid, PROJECT)).entries.length, 1);
  assert.equal(calls.filter(c => c.path === '/authentication/v2/token').length, 2);
  const requests = calls.filter(c => c.path === TOP); assert.equal(new Headers(requests[1].init.headers).get('authorization'), 'Bearer test-access-2');
  assert.doesNotMatch(JSON.stringify(aps.status(sid)), /test-access|test-refresh|test-secret/);
  let release: ((response: Response) => void) | undefined;
  const pending = setup(path => path === TOP ? new Promise<Response>(accept => { release = accept; }) : undefined);
  const otherSid = await signIn(pending.aps); const operation = pending.aps.modelTopFolders(otherSid, PROJECT);
  for (let i = 0; i < 20 && !release; i++) await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(release); pending.aps.logout(otherSid); release!(json({ data: [] }));
  await assert.rejects(() => operation, errorStatus(401));
});

test('metadata-only imports retain uncertainty, reject unsafe keys and expose no unverified native links', async () => {
  const fallback = setup(path => path === `${MD}/metadata/${VIEW}/properties?forceget=true` ? json({ data: { collection: [{ ...element(), externalId: undefined }] } }) : path === VERSION_PATH ? json({ data: { ...versionRow(), links: { webView: { href: 'https://attacker.example/model' } } } }) : undefined);
  const sid = await signIn(fallback.aps); const viewables = await browse(fallback.aps, sid); assert.equal(viewables.web_view_url, null);
  const receipt = await fallback.aps.modelProperties(sid, PROJECT, VERSION, VIEW); assert.equal(receipt.preview.transient_identifier_count, 1);
  const input = await fallback.aps.takeModelExtract(sid, receipt.extract_receipt_id); assert.match(input.elements[0].external_id, /^viewable:viewable-123:objectid:42$/); assert.equal(input.elements[0].properties['APS/External ID'].value, null);
  const unsafeProperties = JSON.parse('{"__proto__":{"polluted":"no"}}');
  const unsafe = setup(path => path === `${MD}/metadata/${VIEW}/properties?forceget=true` ? json({ data: { collection: [{ ...element(), properties: unsafeProperties }] } }) : undefined);
  const unsafeId = await signIn(unsafe.aps); await browse(unsafe.aps, unsafeId); await assert.rejects(() => unsafe.aps.modelProperties(unsafeId, PROJECT, VERSION, VIEW), errorStatus(400));
  assert.equal(({} as any).polluted, undefined);
});

test('oversized property subsets and processing responses fail explicitly without a partial import receipt', async () => {
  const tooMany = setup(path => path === `${MD}/metadata/${VIEW}/properties?forceget=true` ? json({ data: { collection: [{ ...element(), properties: Object.fromEntries(Array.from({ length: 499 }, (_, i) => [`p${i}`, i])) }] } }) : undefined);
  const sid = await signIn(tooMany.aps); await browse(tooMany.aps, sid); await assert.rejects(() => tooMany.aps.modelProperties(sid, PROJECT, VERSION, VIEW), errorStatus(413));
  const pending = setup(path => path === `${MD}/metadata/${VIEW}/properties?forceget=true` ? json({ status: 'processing' }, 202) : undefined);
  const pendingId = await signIn(pending.aps); await browse(pending.aps, pendingId); await assert.rejects(() => pending.aps.modelProperties(pendingId, PROJECT, VERSION, VIEW), errorStatus(409));
});

test('empty extracts, ambiguous identifiers and lossy property mappings fail before a receipt is offered', async () => {
  const cases: { records: unknown[]; status: number }[] = [
    { records: [], status: 409 },
    { records: [element(), { ...element(), objectid: 43 }], status: 409 },
    { records: [{ ...element(), properties: { APS: { 'Identifier basis': 'source-defined value' } } }], status: 409 },
    { records: [{ ...element(), properties: { 'A/B': 1, A: { B: 2 } } }], status: 409 },
    { records: [{ ...element(), properties: { ['x'.repeat(201)]: 1 } }], status: 413 },
    { records: [{ ...element(), properties: { Category: 'x'.repeat(1001) } }], status: 413 },
    { records: [{ ...element(), properties: { OverRange: 1e16 } }], status: 413 },
  ];
  for (const example of cases) {
    const source = setup(path => path === `${MD}/metadata/${VIEW}/properties?forceget=true` ? json({ data: { collection: example.records } }) : undefined);
    const session = await signIn(source.aps); await browse(source.aps, session);
    await assert.rejects(() => source.aps.modelProperties(session, PROJECT, VERSION, VIEW), errorStatus(example.status));
  }
});

test('oversized source responses and redirects are rejected without following an upstream location', async () => {
  const tooLarge = setup(path => path === TOP ? new Response('{}', { headers: { 'content-length': String(31 * 1024 * 1024) } }) : undefined);
  const session = await signIn(tooLarge.aps); await assert.rejects(() => tooLarge.aps.modelTopFolders(session, PROJECT), errorStatus(413));
  const redirect = setup(path => path === TOP ? new Response(null, { status: 302, headers: { location: 'https://attacker.example' } }) : undefined);
  const other = await signIn(redirect.aps); await assert.rejects(() => redirect.aps.modelTopFolders(other, PROJECT), errorStatus(502));
});
