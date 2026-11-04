export type ModelWorkspace = 'fixture' | 'local';
export type DataMode = 'synthetic' | 'imported' | 'aps';
export type JsonValue = string | number | boolean | null;
export type PropertyValue = { value: JsonValue; unit?: string | null };
export type Bounds = { min: [number, number, number]; max: [number, number, number] };
export type ModelSource = { model_key: string; project_id: string; project_name: string; model_id: string; model_name: string; version_id: string; format: string; designation: 'for_record' | 'as_built' | 'unverified'; designation_basis: string; length_unit: string; transform?: number[]; transform_validation?: 'unverified' | 'reviewer_confirmed'; derivative_urn?: string; viewable_id?: string; folder_id?: string; extracted_at?: string; source_url?: string };
export type ModelElement = { model_key: string; external_id: string; db_id?: number; name: string; category: string; family?: string; type?: string; level?: string; physical_asset_id?: string; properties: Record<string, PropertyValue>; bounds?: Bounds };
export type ModelRoom = { model_key: string; room_id: string; name: string; kind?: 'room' | 'space'; bounds: Bounds };
export type DatasetInput = { schema_version?: string; title: string; data_mode: DataMode; source_description: string; models: ModelSource[]; elements: ModelElement[]; rooms?: ModelRoom[] };
export type Dataset = DatasetInput & { dataset_id: string; workspace: ModelWorkspace; created_at: string; content_sha256: string; models: ModelSource[]; rooms: ModelRoom[] };
export type FieldDefinition = { key: string; label: string; source_names: string[]; type: 'text' | 'number' | 'boolean'; unit?: string; required: boolean; category?: string };
export type ClassificationRule = { rule_id: string; system_id: string; system_version: string; code: string; label: string; category?: string; property?: string; operator: 'equals' | 'contains' | 'exists'; value?: JsonValue };
export type MetricDefinition = { metric_id: string; system_id: string; system_version?: string; code: string; label: string; method: 'count' | 'property' | 'formula'; property?: string; formula?: string; unit: string; basis: string; aggregation?: 'sum' | 'none' };
export type ProfileInput = { profile_id?: string; previous_revision_id?: string | null; name: string; category: string; fields: FieldDefinition[]; classification_rules: ClassificationRule[]; metrics: MetricDefinition[]; spatial: { enabled: boolean; adjacency_tolerance_m: number; containment_tolerance_m: number } };
export type Profile = ProfileInput & { profile_id: string; revision_id: string; revision: number; previous_revision_id: string | null; workspace: ModelWorkspace; recorded_at: string };
export type GroupInput = { group_id?: string; previous_revision_id?: string | null; dataset_id: string; name: string; room_keys: string[]; child_group_ids: string[] };
export type ModelGroup = GroupInput & { group_id: string; revision_id: string; revision: number; previous_revision_id: string | null; recorded_at: string };
export type NormalizedProperty = { key: string; label: string; value: JsonValue; unit: string | null; status: 'known' | 'unknown' | 'invalid' | 'manual_override'; raw_value: JsonValue; raw_unit: string | null; source_name: string | null; basis: string };
export type MetricResult = { metric_key: string; metric_id: string; label: string; method: string; value: number | null; unit: string; status: string; basis: string; definition_basis?: string; aggregation: 'sum' | 'none' };
export type Assignment = { assignment_key: string; system_id: string; system_version: string; code: string; label: string; rule_id: string; match_basis: string; metrics: MetricResult[] };
export type SpatialResult = { relationship: 'contained' | 'intersecting' | 'adjacent' | 'multi_room' | 'unassigned' | 'unknown'; candidate_room_keys: string[]; method: 'bounding_box_candidate' | 'manual_association'; validation: 'unverified' | 'reviewer_confirmed'; note: string; world_bounds: Bounds | null };
export type ModelException = { exception_id: string; element_key: string; kind: string; key: string | null; message: string; status: 'open' | 'reviewed'; resolution?: string };
export type ElementResult = { element_key: string; element: ModelElement; source: ModelSource; normalized: Record<string, NormalizedProperty>; assignments: Assignment[]; spatial: SpatialResult; group_ids: string[]; exceptions: ModelException[] };
export type OverrideInput = { run_id: string; element_key: string; target: 'property' | 'metric' | 'spatial' | 'exception'; key: string; value: unknown; unit?: string; reason: string; reviewer: string; previous_override_id?: string | null };
export type ModelOverride = OverrideInput & { override_id: string; revision: number; previous_override_id: string | null; recorded_at: string };
export type ModelAggregate = { group_id: string | null; group_name: string; project_id: string; source_designation: ModelSource['designation']; source_versions: Array<{ model_id: string; version_id: string }>; system_id: string; system_version: string; code: string; metric_id: string; unit: string; value: number | null; known_subtotal: number; unknown_count: number; association_unverified_count: number; allocation_unresolved_count: number; element_count: number; basis: string };
export type RunInput = { dataset_id: string; profile_id: string; profile_revision_id?: string; reviewer?: string };
export type ModelRun = { run_id: string; workspace: ModelWorkspace; data_mode: DataMode; dataset_id: string; profile_id: string; profile_revision_id: string; created_at: string; status: 'completed' | 'completed_with_exceptions' | 'failed'; input_sha256: string; dataset: Dataset; profile: Profile; groups: ModelGroup[]; original_results: ElementResult[]; results: ElementResult[]; exceptions: ModelException[]; overrides: ModelOverride[]; aggregates: ModelAggregate[]; processing: { processed: number; total: number; elapsed_ms: number | null; attempts: number; method: string }; limitations: string[] };
export type PublicationInput = { run_id: string; title: string; reviewer: string; reason: string; include_unresolved?: boolean };
export type ModelPublication = { export_id: string; run_id: string; dataset_id: string; title: string; created_at: string; snapshot_sha256: string; result_count: number; exception_count: number; manifest_url: string; csv_url: string; html_url: string };
export type DatasetSummary = { dataset_id: string; title: string; data_mode: DataMode; created_at: string; content_sha256: string; element_count: number; room_count: number; models: ModelSource[] };
export type RunSummary = { run_id: string; dataset_id: string; profile_id: string; profile_revision_id: string; created_at: string; status: string; result_count: number; exception_count: number };
export type ModelBootstrap = { schema_version: string; workspace: ModelWorkspace; data_mode: string; datasets: DatasetSummary[]; profiles: Profile[]; profile_revisions: Profile[]; groups: ModelGroup[]; group_revisions: ModelGroup[]; runs: RunSummary[]; exports: ModelPublication[]; capabilities: Record<string, unknown>; limitations: string[] };
export const roomKey = (room: Pick<ModelRoom, 'model_key' | 'room_id'>): string => `${encodeURIComponent(room.model_key)}::${encodeURIComponent(room.room_id)}`;
export const modelElementKey = (source: ModelSource, element: Pick<ModelElement, 'model_key' | 'external_id'>): string => [source.project_id, source.model_id, source.version_id, element.model_key, element.external_id].map(encodeURIComponent).join('::');
/** Source coordinates use model units; the column-major transform translates in common-frame metres. */
export function toWorldBounds(source: Pick<ModelSource, 'length_unit' | 'transform'>, bounds: Bounds | undefined): Bounds | null {
  const factors: Record<string, number> = { m: 1, mm: .001, cm: .01, ft: .3048, in: .0254 };
  const factor = factors[source.length_unit];
  if (!bounds || !factor) return null;
  const transform = source.transform ?? [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const points: number[][] = [];
  for (let mask = 0; mask < 8; mask++) {
    const p = [0,1,2].map(axis => (mask & (1 << axis) ? bounds.max[axis] : bounds.min[axis]) * factor);
    points.push([0,1,2].map(axis => transform[axis] * p[0] + transform[4 + axis] * p[1] + transform[8 + axis] * p[2] + transform[12 + axis]));
  }
  if (points.some(p => p.some(v => !Number.isFinite(v)))) return null;
  return { min: [0,1,2].map(axis => Math.min(...points.map(p => p[axis]))) as Bounds['min'], max: [0,1,2].map(axis => Math.max(...points.map(p => p[axis]))) as Bounds['max'] };
}
