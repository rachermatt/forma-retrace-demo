import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModelDataStore } from '../server/model-data.ts';
import { sampleModelDataset, sampleModelProfile } from '../server/model-data-fixtures.ts';
import { modelElementKey, roomKey, toWorldBounds } from '../shared/model-data.ts';
import { canonicalJson } from '../server/domain.ts';

type Json = Record<string, any>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function store(t: TestContext, workspace: 'fixture' | 'local' = 'local') {
  const result = createModelDataStore({ dbPath: ':memory:', workspace });
  t.after(() => result.close());
  return result;
}
function imported(): Json { return { ...sampleModelDataset(), data_mode: 'imported', title: 'TEST ONLY · authored import mechanism fixture', source_description: 'Synthetic values imported solely to exercise the private JSON mechanism; not representative project data.' }; }
function setup(t: TestContext, change?: (input: Json) => void) {
  const s = store(t), input = imported(); change?.(input);
  const dataset = s.importDataset(input), profile = s.saveProfile(sampleModelProfile());
  const run = s.run({ dataset_id: dataset.dataset_id, profile_id: profile.profile_id });
  return { s, dataset, profile, run };
}
function profileInput(profile: Json, change: Json = {}): Json {
  return { profile_id: profile.profile_id, previous_revision_id: profile.revision_id, name: profile.name, category: profile.category, fields: clone(profile.fields), classification_rules: clone(profile.classification_rules), metrics: clone(profile.metrics), spatial: clone(profile.spatial), ...change };
}
function row(run: Json, id: string): Json { const result = run.results.find((r: Json) => r.element.external_id === id); assert.ok(result, id); return result; }
function metric(result: Json, id: string): Json { const found = result.assignments.flatMap((a: Json) => a.metrics).find((m: Json) => m.metric_id === id); assert.ok(found, id); return found; }
function statusError(fn: () => unknown, expected: number, pattern?: RegExp) {
  assert.throws(fn, (error: any) => error.status === expected && (!pattern || pattern.test(error.message)));
}

test('public fixture initialization is deterministic, rich and isolated from empty local storage', t => {
  const a = store(t, 'fixture'), b = store(t, 'fixture'), local = store(t);
  assert.deepEqual(a.bootstrap(), b.bootstrap());
  const boot = a.bootstrap(); assert.equal(boot.datasets.length, 1); assert.equal(boot.datasets[0].models.length, 3);
  assert.equal(boot.datasets[0].element_count, 6); assert.equal(boot.datasets[0].room_count, 3);
  assert.equal(boot.groups.length, 2); assert.equal(boot.exports.length, 1);
  assert.equal(local.bootstrap().datasets.length, 0); assert.equal(local.bootstrap().runs.length, 0);
  const first = a.getRun(boot.runs[0].run_id); assert.equal(first.processing.elapsed_ms, null); assert.match(first.processing.method, /not measured/);
  assert.deepEqual(a.getExport(boot.exports[0].export_id), b.getExport(boot.exports[0].export_id));
  assert.equal(first.data_mode, 'synthetic'); assert.equal(boot.capabilities.external_writes_enabled, false);
  statusError(() => a.importDataset(imported()), 409);
  statusError(() => local.importDataset(sampleModelDataset()), 409);
});

test('imports validate trust, units, limits, affine transforms and dangerous property names', t => {
  const s = store(t), input = imported();
  statusError(() => s.importDataset({ ...input, data_mode: 'aps' }), 403, /receipt/);
  statusError(() => s.importDataset({ ...input, verified_source: true }), 400);
  const trusted = s.importDataset({ ...input, data_mode: 'aps' }, { verifiedSource: true });
  assert.equal(trusted.verified_source, true); assert.equal(trusted.data_mode, 'aps');
  const unknown = clone(input); unknown.models[1].length_unit = 'unknown';
  statusError(() => s.importDataset(unknown), 400, /bounds/);
  unknown.elements.forEach((e: Json) => { if (e.model_key === 'mechanical') delete e.bounds; });
  assert.equal(s.importDataset(unknown).models[1].length_unit, 'unknown');
  const many = clone(input); many.elements[0].properties = Object.fromEntries(Array.from({ length: 501 }, (_, n) => [`P${n}`, { value: n }]));
  statusError(() => s.importDataset(many), 400, /500/);
  statusError(() => s.importDataset({ ...input, elements: Array(10001).fill(input.elements[0]) }), 400, /10000/);
  const bad = clone(input); bad.models[0].transform = Array(16).fill(0);
  statusError(() => s.importDataset(bad), 400, /affine/);
  bad.models[0].transform = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1];
  statusError(() => s.importDataset(bad), 400, /singular/);
  const dangerous = clone(input); dangerous.elements[0].properties = JSON.parse('{"__proto__":{"value":123}}');
  statusError(() => s.importDataset(dangerous), 400, /Unsupported/);
  const infinite = clone(input); infinite.elements[0].properties.Power.value = Infinity;
  statusError(() => s.importDataset(infinite), 400, /finite/);
  const malformedIdentity = clone(input); malformedIdentity.models[0].model_id = '\ud800';
  statusError(() => s.importDataset(malformedIdentity), 400, /Unicode/);
  const forgedUrl = clone(input); forgedUrl.models[0].source_url = 'https://secret:token@example.com/file';
  statusError(() => s.importDataset(forgedUrl), 400, /credentials/);
});

test('logical import retries ignore volatile extraction timestamps without rewriting provenance', t => {
  const s = store(t), a = imported(); a.models.forEach((m: Json) => m.extracted_at = '2026-11-01T10:00:00-04:00');
  const first = s.importDataset(a);
  const retry = clone(a); retry.title = 'A newer receipt label'; retry.source_description = 'Fresh authorized extraction receipt on another date.'; retry.models.forEach((m: Json) => m.extracted_at = '2026-11-02T15:00:00Z');
  const repeated = s.importDataset(retry); assert.equal(repeated.dataset_id, first.dataset_id); assert.equal(repeated.models[0].extracted_at, '2026-11-01T10:00:00-04:00');
  retry.elements[0].properties.Power.value = 8;
  assert.notEqual(s.importDataset(retry).dataset_id, first.dataset_id);
  const version = clone(a); version.models[1].version_id = 'mep-v8';
  assert.notEqual(s.importDataset(version).dataset_id, first.dataset_id);
  const invalidTime = clone(a); invalidTime.models[0].extracted_at = '2026-11-01T10:00:00';
  statusError(() => s.importDataset(invalidTime), 400, /timezone/);
});

test('compound identities separate projects and versions and reject accidental duplicate aliases', t => {
  const input = imported(), source = input.models[1], element = input.elements[0];
  assert.notEqual(modelElementKey(source, element), modelElementKey({ ...source, project_id: 'other-project' }, element));
  assert.notEqual(modelElementKey(source, element), modelElementKey({ ...source, version_id: 'next-version' }, element));
  const s = store(t), aliases = clone(input); aliases.models.push({ ...source, model_key: 'duplicate-alias' });
  statusError(() => s.importDataset(aliases), 400, /duplicate identities/);
  const duplicate = clone(input); duplicate.elements.push(clone(duplicate.elements[0]));
  statusError(() => s.importDataset(duplicate), 400, /duplicate identities/);
  const instance = clone(input); instance.models.push({ ...source, model_key: 'translated-instance', transform: [1,0,0,0,0,1,0,0,0,0,1,0,20,0,0,1] });
  instance.elements.push({ ...clone(element), model_key: 'translated-instance', physical_asset_id: 'different-physical-instance' });
  assert.equal(s.importDataset(instance).models.length, 4);
  const mixedVersions = clone(input); mixedVersions.models.push({ ...source, model_key: 'historical-version', version_id: 'mep-v6' });
  statusError(() => s.importDataset(mixedVersions), 400, /one exact version/);
});

test('roll-ups keep project and source designation separate even when metric units match', t => {
  const { run } = setup(t, input => {
    const source = input.models[1], ahu = input.elements[0];
    input.models.push({ ...clone(source), model_key: 'record-model', model_id: 'separate-record-model', designation: 'for_record' });
    input.elements.push({ ...clone(ahu), model_key: 'record-model', external_id: 'AHU-RECORD', physical_asset_id: 'separate-record-equipment' });
    input.models.push({ ...clone(source), model_key: 'other-project', project_id: 'other-project', project_name: 'Other source project' });
    input.elements.push({ ...clone(ahu), model_key: 'other-project', external_id: 'AHU-OTHER-PROJECT' });
  });
  const buckets = run.aggregates.filter((a: Json) => !a.group_id && a.metric_id === 'equipment-count');
  assert.equal(buckets.length, 3); assert.deepEqual(buckets.map((b: Json) => b.value).sort(), [1,1,2]);
  assert.ok(buckets.every((b: Json) => b.project_id && b.source_designation && b.source_versions.length));
  assert.equal(row(run, 'AHU-OTHER-PROJECT').exceptions.some((e: Json) => e.kind === 'duplicate'), false, 'physical labels are project-scoped, not assumed global equivalence');
});

test('normalization retains raw typed values and units, unknowns and actual zero', t => {
  const { run } = setup(t, input => input.elements[2].properties.Length.unit = 'millimetres');
  const ahu = row(run, 'AHU-01'), unknown = row(run, 'AHU-02'), foundation = row(run, 'FOUNDATION-02'), duct = row(run, 'DUCT-01');
  assert.equal(ahu.normalized.airflow.value, 1.5); assert.equal(ahu.normalized.airflow.raw_value, 1500); assert.equal(ahu.normalized.airflow.raw_unit, 'L/s');
  assert.equal(ahu.normalized.power.value, 7500); assert.equal(unknown.normalized.power.value, 11000); assert.equal(unknown.normalized.power.raw_value, '11');
  assert.equal(unknown.normalized.airflow.value, null); assert.equal(unknown.normalized.airflow.status, 'unknown');
  assert.equal(unknown.normalized.pressure.value, 0); assert.equal(unknown.normalized.pressure.status, 'known');
  assert.equal(foundation.normalized.volume.value, null); assert.equal(foundation.normalized.volume.raw_value, 2400); assert.equal(foundation.normalized.volume.raw_unit, 'unknown'); assert.equal(foundation.normalized.volume.status, 'invalid');
  assert.equal(duct.normalized.length.value, 6.4); assert.equal(duct.normalized.length.raw_unit, 'millimetres'); assert.equal(duct.element.properties.Length.unit, 'millimetres');
});

test('independent classifications retain distinct metric definitions and unknown totals', t => {
  const { run } = setup(t), foundation = row(run, 'FOUNDATION-01');
  assert.equal(foundation.assignments.length, 2); assert.equal(metric(foundation, 'concrete-volume').value, 2.4); assert.equal(metric(foundation, 'concrete-volume').unit, 'm3');
  assert.equal(metric(foundation, 'formwork-area').value, 8.8); assert.equal(metric(foundation, 'formwork-area').unit, 'm2');
  const concrete = run.aggregates.find((a: Json) => !a.group_id && a.metric_id === 'concrete-volume');
  assert.equal(concrete.value, null); assert.equal(concrete.known_subtotal, 2.4); assert.equal(concrete.unknown_count, 1); assert.equal(concrete.element_count, 2);
  assert.equal(run.aggregates.some((a: Json) => a.metric_id === 'airflow'), false, 'descriptive performance property is not summed');
  assert.ok(Math.abs(metric(row(run, 'DUCT-01'), 'duct-area').value - 16.64) < 1e-10);
});

test('rules deduplicate one classification and metric targets cannot be ambiguous across versions', t => {
  const s = store(t), d = s.importDataset(imported()), p = sampleModelProfile();
  p.classification_rules.push({ ...p.classification_rules[0], rule_id: 'equipment-second-rule' });
  const saved = s.saveProfile(p), result = s.run({ dataset_id: d.dataset_id, profile_id: saved.profile_id });
  assert.equal(row(result, 'AHU-01').assignments.filter((a: Json) => a.code === 'MECH-EQUIPMENT').length, 1);
  assert.equal(result.aggregates.find((a: Json) => !a.group_id && a.metric_id === 'equipment-count').value, 2);
  const ambiguous = sampleModelProfile(); ambiguous.classification_rules.push({ ...ambiguous.classification_rules[0], rule_id: 'new-library-version', system_version: '2027.1' });
  statusError(() => s.saveProfile(ambiguous), 400, /unambiguous/);
  ambiguous.metrics[0].system_version = '2026.1'; assert.ok(s.saveProfile(ambiguous).revision_id);
});

test('safe formulas reject code, dimension mismatch and divide-by-zero as explicit exceptions', t => {
  const s = store(t), d = s.importDataset(imported()), code = sampleModelProfile(); code.metrics[3].formula = 'process.exit()';
  statusError(() => s.saveProfile(code), 400, /normalized field/);
  const mismatch = sampleModelProfile(); mismatch.metrics[3].formula = 'width + height';
  const p = s.saveProfile(mismatch), a = s.run({ dataset_id: d.dataset_id, profile_id: p.profile_id });
  assert.equal(metric(row(a, 'DUCT-01'), 'duct-area').value, null); assert.match(metric(row(a, 'DUCT-01'), 'duct-area').basis, /dimensions/);
  const divided = s.saveProfile(profileInput(p, { metrics: p.metrics.map((m: Json) => m.metric_id === 'duct-area' ? { ...m, formula: 'length / (width - width)' } : m) }));
  const b = s.run({ dataset_id: d.dataset_id, profile_id: divided.profile_id });
  assert.match(metric(row(b, 'DUCT-01'), 'duct-area').basis, /divides by zero/);
  assert.equal(b.status, 'completed_with_exceptions'); assert.ok(b.exceptions.some((e: Json) => e.kind === 'metric'));
});

test('declared repeated physical assets remain unresolved rather than double-counted', t => {
  const { run } = setup(t, input => input.elements[1].physical_asset_id = input.elements[0].physical_asset_id);
  assert.equal(metric(row(run, 'AHU-01'), 'equipment-count').value, null); assert.equal(metric(row(run, 'AHU-02'), 'equipment-count').value, null);
  assert.equal(run.exceptions.filter((e: Json) => e.kind === 'duplicate').length, 2);
  const total = run.aggregates.find((a: Json) => !a.group_id && a.metric_id === 'equipment-count');
  assert.equal(total.value, null); assert.equal(total.unknown_count, 2); assert.equal(total.known_subtotal, 0);
});

test('shared world bounds use model units, all transformed corners and metre translations', () => {
  assert.deepEqual(toWorldBounds({ length_unit: 'mm' }, { min: [1000,2000,0], max: [2000,3000,500] }), { min: [1,2,0], max: [2,3,.5] });
  const rotate = [0,1,0,0,-1,0,0,0,0,0,1,0,10,20,0,1];
  assert.deepEqual(toWorldBounds({ length_unit: 'm', transform: rotate }, { min: [1,2,0], max: [3,5,1] }), { min: [5,21,0], max: [8,23,1] });
  assert.equal(toWorldBounds({ length_unit: 'unknown' }, { min: [0,0,0], max: [1,1,1] }), null);
});

test('spatial output covers contained, intersecting, adjacent, multi-room, unassigned and unknown candidates honestly', t => {
  const { run } = setup(t, input => {
    const base = clone(input.elements[0]); delete base.physical_asset_id;
    input.elements.push({ ...clone(base), external_id: 'INTERSECT', bounds: { min: [-1000,1000,0], max: [1000,2000,1000] } });
    input.elements.push({ ...clone(base), external_id: 'OUTSIDE', bounds: { min: [20000,20000,0], max: [21000,21000,1000] } });
  });
  assert.equal(row(run, 'AHU-01').spatial.relationship, 'contained'); assert.equal(row(run, 'INTERSECT').spatial.relationship, 'intersecting');
  assert.equal(row(run, 'FOUNDATION-01').spatial.relationship, 'adjacent'); assert.equal(row(run, 'AHU-02').spatial.relationship, 'multi_room');
  assert.equal(row(run, 'OUTSIDE').spatial.relationship, 'unassigned'); assert.equal(row(run, 'DUCT-02').spatial.relationship, 'unknown');
  assert.ok(run.results.every((r: Json) => r.spatial.validation === 'unverified')); assert.match(row(run, 'AHU-01').spatial.note, /not validated room-solid/);
});

test('versioned nested groups prevent cycles and duplicate roll-up, without inventing allocation', t => {
  const { s, dataset, profile, run } = setup(t), room201 = roomKey(dataset.rooms[0]), room202 = roomKey(dataset.rooms[1]);
  const left = s.saveGroup({ dataset_id: dataset.dataset_id, name: 'Room 201', room_keys: [room201], child_group_ids: [] });
  const right = s.saveGroup({ dataset_id: dataset.dataset_id, name: 'Room 202', room_keys: [room202], child_group_ids: [] });
  const root = s.saveGroup({ dataset_id: dataset.dataset_id, name: 'Nested union with overlapping direct membership', room_keys: [room201], child_group_ids: [left.group_id, right.group_id] });
  statusError(() => s.saveGroup({ group_id: left.group_id, previous_revision_id: left.revision_id, dataset_id: dataset.dataset_id, name: left.name, room_keys: [room201], child_group_ids: [root.group_id] }), 400, /cycle/);
  statusError(() => s.saveGroup({ dataset_id: dataset.dataset_id, name: 'Invalid membership', room_keys: ['elsewhere::room'], child_group_ids: [] }), 400);
  const grouped = s.run({ dataset_id: dataset.dataset_id, profile_id: profile.profile_id }); assert.notEqual(grouped.run_id, run.run_id);
  const union = grouped.aggregates.find((a: Json) => a.group_id === root.group_id && a.metric_id === 'equipment-count');
  assert.equal(union.element_count, 2); assert.equal(union.known_subtotal, 2); assert.equal(union.value, null); assert.equal(union.association_unverified_count, 2);
  const partial = grouped.aggregates.find((a: Json) => a.group_id === left.group_id && a.metric_id === 'equipment-count'); assert.equal(partial.allocation_unresolved_count, 1);
  for (const id of ['AHU-01','AHU-02']) s.override({ run_id: grouped.run_id, element_key: row(grouped, id).element_key, target: 'spatial', key: 'room_keys', value: id === 'AHU-01' ? [room201] : [room201,room202], reviewer: 'Named reviewer', reason: 'Manual location association; not verified solid containment.' });
  const reviewed = s.getRun(grouped.run_id);
  assert.equal(reviewed.aggregates.find((a: Json) => a.group_id === root.group_id && a.metric_id === 'equipment-count').value, 2);
  const stillUnsplit = reviewed.aggregates.find((a: Json) => a.group_id === left.group_id && a.metric_id === 'equipment-count'); assert.equal(stillUnsplit.value, null); assert.equal(stillUnsplit.allocation_unresolved_count, 1);
  assert.equal(s.getRun(run.run_id).groups.length, 0, 'later business spaces do not rewrite old run scope');
});

test('profile revisions and idempotent run selection retain exact historical configurations and explicit failures', t => {
  const { s, dataset, profile, run } = setup(t);
  assert.equal(s.run({ dataset_id: dataset.dataset_id, profile_id: profile.profile_id }).run_id, run.run_id);
  const changed = s.saveProfile(profileInput(profile, { name: 'Agreed next profile revision' })); assert.equal(changed.revision, 2); assert.equal(changed.previous_revision_id, profile.revision_id);
  statusError(() => s.saveProfile(profileInput(profile)), 409, /changed/);
  const next = s.run({ dataset_id: dataset.dataset_id, profile_id: profile.profile_id }); assert.notEqual(next.run_id, run.run_id); assert.equal(next.profile_revision_id, changed.revision_id);
  assert.equal(s.getRun(run.run_id).profile.name, profile.name);
  assert.equal(s.run({ dataset_id: dataset.dataset_id, profile_id: profile.profile_id, profile_revision_id: profile.revision_id }).run_id, run.run_id);
  const emptyProfile = s.saveProfile(profileInput(changed, { category: 'No such imported category' })); const failed = s.run({ dataset_id: dataset.dataset_id, profile_id: profile.profile_id });
  assert.equal(failed.status, 'failed'); assert.equal(failed.profile_revision_id, emptyProfile.revision_id); assert.equal(failed.processing.processed, 0); assert.equal(failed.exceptions[0].kind, 'processing');
  assert.equal(s.getRun(failed.run_id).status, 'failed'); assert.equal(s.search().results.length, dataset.elements.length, 'search retains latest completed run instead of hiding data behind a failed attempt');
  statusError(() => s.publish({ run_id: failed.run_id, title: 'Cannot publish failed run', reviewer: 'Reviewer', reason: 'Must remain a processing failure.', include_unresolved: true }), 409, /failed processing/);
});

test('reasoned corrections preserve originals, stale-write protection, metric reassessment and review history', t => {
  const { s, run } = setup(t), r = row(run, 'AHU-01');
  const correction = { run_id: run.run_id, element_key: r.element_key, target: 'property', key: 'power', value: 8000, unit: 'W', reason: 'Source schedule checked; reviewed authored power corrected.', reviewer: 'Reviewer A' };
  statusError(() => s.override({ ...correction, reason: '' }), 400); statusError(() => s.override({ ...correction, unit: 'kW' }), 400);
  const first = s.override(correction); assert.ok(first.override_id); statusError(() => s.override({ ...correction, value: 9000 }), 409);
  const second = s.override({ ...correction, value: 9000, reviewer: 'Reviewer B', reason: 'Subsequent schedule clarification retained separately.', previous_override_id: first.override_id });
  const updated = s.getRun(run.run_id); assert.equal(updated.overrides.length, 2); assert.equal(second.revision, 2);
  assert.equal(row(updated, 'AHU-01').normalized.power.value, 9000); assert.equal(row(updated, 'AHU-01').normalized.power.raw_value, 7.5);
  assert.equal(row({ results: updated.original_results }, 'AHU-01').normalized.power.value, 7500);
  assert.equal(metric(row(updated, 'AHU-01'), 'equipment-count').value, null); assert.equal(metric(row(updated, 'AHU-01'), 'equipment-count').status, 'requires_reassessment');
  const count = metric(r, 'equipment-count'); statusError(() => s.override({ run_id: run.run_id, element_key: r.element_key, target: 'metric', key: count.metric_key, value: -1, reason: 'Invalid negative count test', reviewer: 'Reviewer' }), 400);
  s.override({ run_id: run.run_id, element_key: r.element_key, target: 'metric', key: count.metric_key, value: 1, reason: 'Count independently rechecked after property correction.', reviewer: 'Reviewer B' });
  assert.equal(metric(row(s.getRun(run.run_id), 'AHU-01'), 'equipment-count').value, 1);
  const exception = row(s.getRun(run.run_id), 'AHU-02').exceptions.find((e: Json) => e.kind === 'property');
  s.override({ run_id: run.run_id, element_key: row(run, 'AHU-02').element_key, target: 'exception', key: exception.exception_id, value: 'acknowledged', reason: 'Missing source airflow accepted as an explicitly unresolved data gap.', reviewer: 'Reviewer B' });
  assert.equal(row(s.getRun(run.run_id), 'AHU-02').normalized.airflow.value, null);
});

test('publications are immutable, CSV-safe and contain the identical structured snapshot in HTML', t => {
  const { s, run } = setup(t, input => { input.elements[0].name = '=HYPERLINK("https://example.com")'; input.elements[0].properties.Manufacturer.value = '</script><img src=x onerror=alert(1)> & source text'; });
  const request = { run_id: run.run_id, title: 'Reviewed model snapshot', reviewer: 'Named local reviewer', reason: 'Fixed metadata review with unresolved source gaps included.' };
  statusError(() => s.publish(request), 409, /unresolved/);
  const exported = s.publish({ ...request, include_unresolved: true }), original = s.getExport(exported.export_id);
  assert.equal(original.manifest.approval_status, 'reviewed_snapshot_not_certified'); assert.equal(original.manifest.authority, 'self_asserted_local_reviewer');
  assert.equal(createHash('sha256').update(canonicalJson(original.manifest.snapshot)).digest('hex'), original.manifest.snapshot_sha256);
  const embedded = original.html.match(/<script type="application\/json" id="model-data-manifest">([\s\S]*?)<\/script>/); assert.ok(embedded); assert.deepEqual(JSON.parse(embedded[1]), original.manifest);
  assert.equal(original.html.includes('</script><img'), false); assert.ok(original.html.includes('&lt;img'));
  assert.ok(original.csv.includes('"\'=HYPERLINK('), 'spreadsheet-leading formula text is explicitly a string');
  const r = row(run, 'AHU-01'); s.override({ run_id: run.run_id, element_key: r.element_key, target: 'property', key: 'manufacturer', value: 'Later corrected manufacturer', reason: 'Later correction must not alter the fixed packet.', reviewer: 'Another reviewer' });
  assert.deepEqual(s.getExport(exported.export_id), original);
  const later = s.publish({ ...request, title: 'Later correction snapshot', include_unresolved: true }); assert.notEqual(later.snapshot_sha256, exported.snapshot_sha256);
  assert.equal(s.getExport(later.export_id).manifest.snapshot.overrides.length, 1); assert.equal(original.manifest.snapshot.overrides.length, 0);
  assert.throws(() => s.db.exec("UPDATE model_data_exports SET csv_text='rewritten'"), /immutable/);
  assert.throws(() => s.db.exec('DELETE FROM model_data_records'), /immutable/);
});

test('search filters exact local sources and never implies enterprise authorization or cross-dataset totals', t => {
  const { s, dataset, profile, run } = setup(t); const second = imported(); second.models.forEach((m: Json) => { m.project_id = 'other-project'; m.project_name = 'Other permitted local source'; });
  const d2 = s.importDataset(second); s.run({ dataset_id: d2.dataset_id, profile_id: profile.profile_id });
  assert.equal(s.search().count, 12); assert.equal(s.search({ project_id: dataset.models[0].project_id }).count, 6);
  const result = s.search({ q: 'AHU', category: 'Air Handling Units', designation: 'as_built', classification: 'AIR-HANDLING' }); assert.equal(result.count, 4); assert.ok(result.results.some((r: Json) => r.run_id === run.run_id));
  assert.match(result.access_basis, /not an enterprise/); assert.equal(result.aggregates, undefined); assert.match(result.selection_policy, /Latest completed/);
  statusError(() => s.search({ grant_all: true }), 400);
});

test('reopening preserves records, correction history and publications and rejects a workspace switch', t => {
  const folder = mkdtempSync(join(tmpdir(), 'forma-retrace-model-data-')); t.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, 'model.sqlite'); const a = createModelDataStore({ dbPath: path, workspace: 'local' });
  const d = a.importDataset(imported()), p = a.saveProfile(sampleModelProfile()), run = a.run({ dataset_id: d.dataset_id, profile_id: p.profile_id }), r = row(run, 'AHU-01');
  a.override({ run_id: run.run_id, element_key: r.element_key, target: 'property', key: 'manufacturer', value: 'Persisted correction', reason: 'Reason retained through closing and reopening SQLite.', reviewer: 'Persistence reviewer' });
  const packet = a.publish({ run_id: run.run_id, title: 'Persistence snapshot', reviewer: 'Persistence reviewer', reason: 'Durable snapshot verification.', include_unresolved: true }); const frozen = a.getExport(packet.export_id); a.close();
  const b = createModelDataStore({ dbPath: path, workspace: 'local' }); t.after(() => b.close());
  assert.equal(b.bootstrap().datasets.length, 1); assert.equal(b.getRun(run.run_id).overrides.length, 1); assert.equal(row(b.getRun(run.run_id), 'AHU-01').normalized.manufacturer.value, 'Persisted correction'); assert.deepEqual(b.getExport(packet.export_id), frozen);
  statusError(() => createModelDataStore({ dbPath: path, workspace: 'fixture' }), 409, /another workspace/);
});


test('implicit normalized units canonicalize supported source aliases for formulas and corrections', t => {
  const s = store(t), input = imported(), profileInput = sampleModelProfile() as Json;
  input.elements.find((e: Json) => e.external_id === 'DUCT-01').properties.Length = { value: 2, unit: 'metres' };
  delete profileInput.fields.find((f: Json) => f.key === 'length').unit;
  const dataset = s.importDataset(input), profile = s.saveProfile(profileInput);
  const run = s.run({ dataset_id: dataset.dataset_id, profile_id: profile.profile_id });
  const duct = row(run, 'DUCT-01');
  assert.equal(duct.normalized.length.raw_unit, 'metres');
  assert.equal(duct.normalized.length.unit, 'm');
  assert.equal(duct.normalized.length.value, 2);
  assert.equal(metric(duct, 'duct-area').value, 5.2);
  s.override({ run_id: run.run_id, element_key: duct.element_key, target: 'property', key: 'length', value: 3, reason: 'Test a value correction without changing the supported source unit.', reviewer: 'Local unit test reviewer' });
  const corrected = row(s.getRun(run.run_id), 'DUCT-01');
  assert.equal(corrected.normalized.length.value, 3);
  assert.equal(corrected.normalized.length.unit, 'm');
  assert.equal(corrected.normalized.length.raw_unit, 'metres');
  assert.equal(corrected.normalized.length.raw_value, 2);
});
