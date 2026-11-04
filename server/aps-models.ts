import { randomBytes } from 'node:crypto';
import type { DatasetInput } from '../shared/model-data.ts';

type Json = Record<string, any>;
type Options = {
  hubId: string;
  read: (sessionId: string | undefined, path: string) => Promise<unknown>;
  projects: (sessionId?: string) => Promise<{ data: { id: string; attributes: { name: string } }[] }>;
  fail: (status: number, message: string) => never;
  now?: () => number;
};
type Grant = { folders: Set<string>; items: Map<string, Json>; versions: Map<string, Json>; viewables: Map<string, Set<string>>; expires: number };
const ORIGIN = 'https://developer.api.autodesk.com';
const MAX_PAGES = 100;
const MAX_ROWS = 20_000;
const MAX_ELEMENTS = 10_000;
const MAX_SOURCE_PROPERTIES = 498; // Two additional fields retain identifier provenance.
const GRANT_TTL = 30 * 60_000;
const RECEIPT_TTL = 10 * 60_000;
const object = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);

/** Read-only model browsing. No arbitrary upstream URL, derivative URN or access token is exposed. */
export function createApsModels(options: Options) {
  const now = options.now ?? Date.now;
  const grants = new Map<string, Grant>();
  const receipts = new Map<string, { sessionId: string; projectId: string; versionId: string; expires: number; input: DatasetInput }>();
  const fail = options.fail;
  function id(value: unknown, label: string) {
    if (typeof value !== 'string' || !value || value.length > 1000 || value.trim() !== value || ['.', '..'].includes(value) || /[\u0000-\u001f\u007f/\\#]/.test(value) || /^https?:/i.test(value)) fail(400, `Invalid ${label}.`);
    return value as string;
  }
  function sourceText(value: unknown, label: string, maximum = 1000): string {
    if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(413, `The source ${label} is empty or exceeds the supported text field limit (${maximum} characters). Use an approved property subset.`);
    return value as string;
  }
  const key = (sessionId: string, projectId: string) => `${sessionId}\0${projectId}`;
  function purge() {
    for (const [k, value] of grants) if (value.expires <= now()) grants.delete(k);
    for (const [k, value] of receipts) if (value.expires <= now()) receipts.delete(k);
  }
  async function project(sessionId: string | undefined, projectId: unknown) {
    const selected = id(projectId, 'project reference');
    // Recheck configured-hub membership rather than trusting a project ID in a browser URL.
    const result = await options.projects(sessionId);
    const found = result.data.find(p => p.id === selected);
    if (!found) fail(404, 'The selected project is not accessible in the configured hub.');
    purge();
    const k = key(sessionId!, selected);
    let grant = grants.get(k);
    if (!grant) {
      if (grants.size >= 1000) fail(429, 'Too many model browsing contexts. Wait before retrying.');
      grant = { folders: new Set(), items: new Map(), versions: new Map(), viewables: new Map(), expires: now() + GRANT_TTL };
      grants.set(k, grant);
    }
    return { project: found!, grant, projectId: selected };
  }
  async function collection(sessionId: string | undefined, path: string): Promise<Json[]> {
    const rows = new Map<string, Json>(); const visited = new Set<string>(); let next: string | undefined = path;
    while (next) {
      if (visited.has(next) || visited.size >= MAX_PAGES) fail(502, 'APS model pagination exceeded the safety limit. No partial result was returned.');
      visited.add(next);
      const payload = await options.read(sessionId, next);
      if (!object(payload) || !Array.isArray(payload.data)) fail(502, 'APS returned an invalid model resource list.');
      for (const row of (payload as Json).data) {
        if (!object(row) || typeof row.id !== 'string' || !row.id || !object(row.attributes)) fail(502, 'APS returned an invalid model resource.');
        rows.set(row.id, row);
        if (rows.size > MAX_ROWS) fail(413, 'The selected resource exceeds the local import limit. Select a smaller source or an approved subset.');
      }
      const links = (payload as Json).links;
      if (links !== undefined && !object(links)) fail(502, 'APS returned invalid model pagination.');
      const value = links?.next;
      if (value === undefined || value === null) next = undefined;
      else {
        const href = object(value) ? value.href : undefined;
        if (typeof href !== 'string') fail(502, 'APS returned invalid model pagination.');
        let url: URL;
        try { url = new URL(href, ORIGIN); } catch { fail(502, 'APS returned invalid model pagination.'); }
        let samePath = false;
        try { samePath = decodeURIComponent(url!.pathname) === decodeURIComponent(new URL(path, ORIGIN).pathname); } catch { fail(502, 'APS returned invalid model pagination.'); }
        if (url!.origin !== ORIGIN || !samePath || url!.username || url!.password || url!.hash || [...url!.searchParams.keys()].some(k => !['page[number]', 'page[limit]'].includes(k))) fail(502, 'APS model pagination left the selected source.');
        next = `${url!.pathname}${url!.search}`;
      }
    }
    return [...rows.values()];
  }
  function safeWebView(row: Json): string | null {
    const value = row.links?.webView?.href;
    if (typeof value !== 'string' || value.length > 2000) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.port || url.username || url.password || !['acc.autodesk.com', 'docs.b360.autodesk.com', 'bim360docs.b360.autodesk.com', 'a360.autodesk.com'].includes(url.hostname)) return null;
      return url.href;
    } catch { return null; }
  }
  function resource(row: Json) {
    return { id: row.id, type: row.type, name: String(row.attributes.displayName ?? row.attributes.name ?? row.id), version_number: row.attributes.versionNumber ?? null, modified_at: row.attributes.lastModifiedTime ?? null, web_view_url: safeWebView(row) };
  }
  async function version(sessionId: string | undefined, projectId: string, versionId: string) {
    const context = await project(sessionId, projectId);
    const selected = id(versionId, 'version reference');
    const known = context.grant.versions.get(selected);
    if (!known) fail(409, 'Select the exact model version from the authorized source browser first.');
    const payload = await options.read(sessionId, `/data/v1/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(selected)}`);
    if (!object(payload) || !object(payload.data) || payload.data.type !== 'versions' || payload.data.id !== selected || !object(payload.data.attributes)) fail(502, 'APS returned a different or invalid source version.');
    const row = (payload as Json).data;
    if (row.relationships?.item?.data?.id !== known!.relationships?.item?.data?.id) fail(409, 'The source version no longer matches the selected model. Browse the source again.');
    context.grant.versions.set(selected, row);
    const derivativeUrn = row.relationships?.derivatives?.data?.id;
    if (typeof derivativeUrn !== 'string' || !/^[A-Za-z0-9_-]{12,1000}={0,2}$/.test(derivativeUrn)) fail(409, 'This exact version has no usable derivative reference. Verify model format, processing and View + Download permission in Autodesk.');
    return { ...context, row, derivativeUrn: derivativeUrn.replace(/=+$/, '') };
  }
  function clearSession(sessionId?: string) {
    if (!sessionId) return;
    for (const k of grants.keys()) if (k.startsWith(`${sessionId}\0`)) grants.delete(k);
    for (const [k, r] of receipts) if (r.sessionId === sessionId) receipts.delete(k);
  }
  return {
    clearSession,
    async modelTopFolders(sessionId: string | undefined, projectId: string) {
      const c = await project(sessionId, projectId);
      const rows = await collection(sessionId, `/project/v1/hubs/${options.hubId}/projects/${encodeURIComponent(projectId)}/topFolders`);
      const folders = rows.filter(row => row.type === 'folders' && row.attributes.hidden !== true);
      for (const row of folders) c.grant.folders.add(row.id);
      return { project: { id: c.project.id, name: c.project.attributes.name }, entries: folders.map(resource) };
    },
    async modelFolderContents(sessionId: string | undefined, projectId: string, folderId: string) {
      const c = await project(sessionId, projectId); const selected = id(folderId, 'folder reference');
      if (!c.grant.folders.has(selected)) fail(409, 'Choose an accessible folder from the authorized source browser first.');
      const rows = await collection(sessionId, `/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(selected)}/contents`);
      const visible = rows.filter(row => ['folders', 'items'].includes(row.type) && row.attributes.hidden !== true);
      for (const row of visible) { if (row.type === 'folders') c.grant.folders.add(row.id); else c.grant.items.set(row.id, row); }
      return { folder_id: selected, entries: visible.map(resource) };
    },
    async modelItemVersions(sessionId: string | undefined, projectId: string, itemId: string) {
      const c = await project(sessionId, projectId); const selected = id(itemId, 'model item reference');
      if (!c.grant.items.has(selected)) fail(409, 'Choose a model item from the authorized source browser first.');
      const rows = await collection(sessionId, `/data/v1/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(selected)}/versions`);
      for (const row of rows) {
        if (row.type !== 'versions' || row.relationships?.item?.data?.id !== selected) fail(502, 'APS returned a version outside the selected model item.');
        c.grant.versions.set(row.id, row);
      }
      return { item_id: selected, entries: rows.map(resource) };
    },
    async modelViewables(sessionId: string | undefined, projectId: string, versionId: string) {
      const c = await version(sessionId, projectId, versionId);
      const prefix = `/modelderivative/v2/designdata/${encodeURIComponent(c.derivativeUrn)}`;
      const manifest = await options.read(sessionId, `${prefix}/manifest`);
      if (!object(manifest) || !['success', 'complete'].includes(String(manifest.status))) fail(409, 'The selected model derivative is not ready. Verify its processing status in Autodesk and retry.');
      const payload = await options.read(sessionId, `${prefix}/metadata`);
      if (!object(payload) || !object(payload.data) || !Array.isArray(payload.data.metadata)) fail(502, 'APS returned invalid model viewables.');
      const views = (payload as Json).data.metadata.filter((v: unknown) => object(v) && v.role === '3d' && typeof v.guid === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(v.guid)).map((v: Json) => ({ id: v.guid, name: String(v.name ?? v.guid), role: '3d' }));
      c.grant.viewables.set(versionId, new Set(views.map((v: Json) => v.id)));
      return { project_id: projectId, version_id: versionId, derivative_urn: c.derivativeUrn, entries: views, web_view_url: safeWebView(c.row), embedded_viewer_available: false, viewer_dependency: 'Embedded APS Viewer requires a qualified per-model/version derivative and WebSocket proxy that keeps APS tokens on the server. Use the authorized Autodesk model viewer link when supplied.' };
    },
    async modelProperties(sessionId: string | undefined, projectId: string, versionId: string, viewableId: string) {
      const c = await version(sessionId, projectId, versionId); const viewable = id(viewableId, 'viewable reference');
      if (!c.grant.viewables.get(versionId)?.has(viewable)) fail(409, 'Select a 3D viewable from this exact authorized model version first.');
      const payload = await options.read(sessionId, `/modelderivative/v2/designdata/${encodeURIComponent(c.derivativeUrn)}/metadata/${encodeURIComponent(viewable)}/properties?forceget=true`);
      if (!object(payload) || !object(payload.data) || !Array.isArray(payload.data.collection)) fail(502, 'APS returned invalid model properties.');
      if ((payload as Json).data.collection.length > MAX_ELEMENTS) fail(413, 'This property extract exceeds 10,000 elements. Use an approved category subset export.');
      if (!(payload as Json).data.collection.length) fail(409, 'The selected model viewable returned no element properties. Verify its processing, format and property access before importing.');
      const elementIds = new Set<string>(); let transient = 0;
      const elements = (payload as Json).data.collection.map((entry: unknown) => {
        if (!object(entry) || !Number.isSafeInteger(entry.objectid) || entry.objectid < 0 || !object(entry.properties)) fail(502, 'APS returned an invalid element-property record.');
        const row = entry as Json; const properties: Record<string, { value: string | number | boolean | null; unit: null }> = Object.create(null); let propertyCount = 0;
        const flatten = (value: unknown, path: string, depth: number) => {
          if (depth > 8 || path.length > 200) fail(413, 'The selected property structure exceeds the local safety limit (eight levels and 200-character property paths).');
          if (object(value)) { for (const [k, v] of Object.entries(value)) { if (['__proto__', 'constructor', 'prototype'].includes(k)) fail(400, 'The source contains an unsupported reserved property key. Export an approved subset.'); flatten(v, path ? `${path}/${k}` : k, depth + 1); } }
          else {
            if (propertyCount >= MAX_SOURCE_PROPERTIES) fail(413, 'An element exceeds 498 source properties. Export an approved property-profile subset; no properties were silently truncated.');
            sourceText(path, 'property path', 200);
            const scalar = value === null || ['string', 'number', 'boolean'].includes(typeof value) ? value as string | number | boolean | null : JSON.stringify(value);
            if (typeof scalar === 'number' && (!Number.isFinite(scalar) || Math.abs(scalar) > 1e15)) fail(413, 'A source property exceeds the supported finite numeric range.');
            if (typeof scalar === 'string' && scalar.length > 10000) fail(413, 'A source property exceeds the local text limit.');
            if (Object.hasOwn(properties, path)) fail(409, 'The source has colliding flattened property paths. Use a qualified property subset.');
            properties[path] = { value: scalar ?? null, unit: null };
            propertyCount++;
          }
        };
        flatten(row.properties, '', 0);
        const stable = typeof row.externalId === 'string' && row.externalId.trim() ? row.externalId : null;
        const externalId = stable ?? `viewable:${viewable}:objectid:${row.objectid}`;
        sourceText(externalId, 'element identifier'); sourceText(String(row.name ?? externalId), 'element label');
        if (externalId.trim() !== externalId) fail(409, 'The source uses whitespace-padded element identifiers. Qualify source identities before importing; identifiers were not silently changed.');
        if (!stable) transient++;
        if (elementIds.has(externalId)) fail(409, 'The property extract contains ambiguous duplicate element identifiers. Qualify the model instance identities before import.');
        elementIds.add(externalId);
        if (Object.hasOwn(properties, 'APS/Identifier basis') || Object.hasOwn(properties, 'APS/External ID')) fail(409, 'The source uses reserved APS identifier provenance paths. Export a qualified property subset; source properties were not overwritten.');
        properties['APS/Identifier basis'] = { value: stable ? 'source_external_id' : 'version_viewable_objectid_only', unit: null };
        properties['APS/External ID'] = { value: stable, unit: null };
        const prop = (name: string) => Object.entries(properties).find(([k]) => k.toLowerCase().split('/').at(-1) === name)?.[1].value;
        const optional = (name: string) => { const value = prop(name); return value == null || !String(value).trim() ? undefined : sourceText(String(value), `element ${name}`); };
        return { model_key: 'aps-source', external_id: externalId, db_id: row.objectid, name: String(row.name ?? externalId), category: optional('category') ?? 'Unspecified', family: optional('family'), type: optional('type'), level: optional('level'), properties };
      });
      const modelId = String(c.row.relationships.item.data.id); const modelName = String(c.row.attributes.displayName ?? c.row.attributes.name ?? c.grant.items.get(modelId)?.attributes.displayName ?? modelId);
      sourceText(c.project.id, 'project identity'); sourceText(c.project.attributes.name, 'project name'); sourceText(modelId, 'model identity'); sourceText(modelName, 'model name');
      const extracted = new Date(now()).toISOString();
      const input: DatasetInput = { title: `${modelName} · authorized property extract`.slice(0, 200), data_mode: 'aps', source_description: `Model Derivative property snapshot fetched server-side from the signed-in user's authorized project and exact model version on ${extracted}. No geometric bounds or parameter units are inferred. ${transient} object(s) lack source external IDs and use explicitly marked version/viewable object IDs; these are not global or cross-version identities.`, models: [{ model_key: 'aps-source', project_id: c.project.id, project_name: c.project.attributes.name, model_id: modelId, model_name: modelName, version_id: versionId, format: modelName.includes('.') ? modelName.split('.').at(-1)!.toUpperCase() || 'Unknown' : 'Unknown', designation: 'unverified', designation_basis: 'Source access was checked; For-Record/As-Built designation has not been verified.', length_unit: 'unknown', transform_validation: 'unverified', derivative_urn: c.derivativeUrn, viewable_id: viewable, extracted_at: extracted, source_url: safeWebView(c.row) ?? undefined }], elements, rooms: [] };
      purge(); if (receipts.size >= 100) fail(429, 'Too many pending property extracts. Wait before extracting again.');
      const receiptId = randomBytes(24).toString('base64url');
      receipts.set(receiptId, { sessionId: sessionId!, projectId, versionId, expires: now() + RECEIPT_TTL, input });
      return { extract_receipt_id: receiptId, expires_at: new Date(now() + RECEIPT_TTL).toISOString(), preview: { title: input.title, model: input.models[0], element_count: elements.length, transient_identifier_count: transient, categories: [...new Set(elements.map((e: Json) => e.category))].sort(), limitations: ['Parameter units remain unknown unless independently mapped by an approved profile.', 'No geometry or spatial registration is inferred.', 'For-Record/As-Built status needs a recorded designation basis.'] } };
    },
    async takeModelExtract(sessionId: string | undefined, receiptId: string): Promise<DatasetInput> {
      purge(); const receipt = receipts.get(id(receiptId, 'property-extract receipt'));
      if (!receipt || receipt.sessionId !== sessionId) fail(404, 'The property-extract receipt is unavailable or belongs to another session. Extract the selected version again.');
      // Re-read the version to catch source access revocation before persisting a trusted APS import.
      await version(sessionId, receipt!.projectId, receipt!.versionId);
      return structuredClone(receipt!.input);
    },
  };
}
