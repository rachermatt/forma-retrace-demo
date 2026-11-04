import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Cloud, Download, ExternalLink, FolderClosed, LoaderCircle } from 'lucide-react';
import './model-source.css';

type Json = Record<string, any>;
type Entry = { id: string; name: string; type?: string; version_number?: number | null; modified_at?: string | null; web_view_url?: string | null };
type Props = { csrfToken: string; mode: 'fixture' | 'live'; onImport?: (input: any) => Promise<void>; onImported?: (dataset: any) => void };

/** The import action submits a server receipt, never a browser-authored APS provenance claim. */
export default function ModelSourceBrowser({ csrfToken, mode, onImported }: Props) {
  const [projects, setProjects] = useState<Entry[]>([]), [project, setProject] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]), [trail, setTrail] = useState<Entry[]>([]), [item, setItem] = useState<Entry | null>(null);
  const [versions, setVersions] = useState<Entry[]>([]), [version, setVersion] = useState(''), [views, setViews] = useState<Entry[]>([]), [view, setView] = useState('');
  const [viewContext, setViewContext] = useState<Json | null>(null), [extract, setExtract] = useState<Json | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const abort = useRef<AbortController | null>(null), sequence = useRef(0);
  useEffect(() => () => { sequence.current++; abort.current?.abort(); }, []);
  useEffect(() => { sequence.current++; abort.current?.abort(); setProjects([]); setProject(''); setEntries([]); setTrail([]); setItem(null); setVersions([]); setVersion(''); setViews([]); setView(''); setViewContext(null); setExtract(null); setError(''); setNotice(''); setBusy(false); }, [mode]);
  async function perform(action: (call: (path: string, body?: Json) => Promise<Json>) => Promise<void>) {
    if (busy) return;
    const serial = ++sequence.current;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(''); setNotice('');
    const call = async (path: string, body?: Json) => {
      const response = await fetch(`/api/model-source/${path}`, { credentials: 'same-origin', signal: controller.signal, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), headers: { 'Content-Type': 'application/json', ...(body === undefined ? {} : { 'X-CSRF-Token': csrfToken }) } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Autodesk source request failed (${response.status}).`);
      if (sequence.current !== serial) throw new DOMException('Source selection changed.', 'AbortError');
      return result;
    };
    try { await action(call); }
    catch (cause) { if (sequence.current === serial && (cause as Error).name !== 'AbortError') setError((cause as Error).message); }
    finally { if (sequence.current === serial) setBusy(false); }
  }
  const query = (values: Record<string, string>) => new URLSearchParams(values).toString();
  const resetModel = () => { setItem(null); setVersions([]); setVersion(''); setViews([]); setView(''); setViewContext(null); setExtract(null); };
  function chooseProject(value: string) {
    setProject(value); setTrail([]); setEntries([]); resetModel();
    if (value) void perform(async call => { const data = await call(`top-folders?${query({ project_id: value })}`); setEntries(data.entries); });
  }
  function folder(entry?: Entry, parent = false) {
    const next = parent ? trail.slice(0, -1) : [...trail, entry!];
    resetModel();
    void perform(async call => {
      const path = next.length ? `folder-contents?${query({ project_id: project, folder_id: next.at(-1)!.id })}` : `top-folders?${query({ project_id: project })}`;
      const data = await call(path); setTrail(next); setEntries(data.entries);
    });
  }
  function chooseItem(entry: Entry) {
    resetModel(); setItem(entry);
    void perform(async call => { const data = await call(`versions?${query({ project_id: project, item_id: entry.id })}`); setVersions(data.entries); });
  }
  function chooseVersion(value: string) {
    setVersion(value); setViews([]); setView(''); setViewContext(null); setExtract(null);
    if (value) void perform(async call => { const data = await call(`viewables?${query({ project_id: project, version_id: value })}`); setViews(data.entries); setViewContext(data); if (data.entries.length === 1) setView(data.entries[0].id); });
  }

  return <section className="wb-panel model-source-panel">
    <div className="wb-panel-head"><div><h2><Cloud size={18}/> Autodesk model sources</h2><p>Browse the signed-in user's permitted projects, folders, models and exact source versions. Source files remain in Autodesk.</p></div></div>
    <div className="wb-panel-body">
      {mode !== 'live' ? <div className="wb-info"><strong>Live source browsing requires live mode.</strong><p>The synthetic demonstration makes no Autodesk requests. To use authorized model data, run the local application in live mode, configure server-side APS credentials and the intended hub, and sign in through <a href="#/aps-connection?workspace=fixture">APS connection</a>. JSON property extracts can be imported into the separate local model-data workspace without claiming a live connection.</p></div> : <>
        <p className="model-source-note">Your Autodesk sign-in and folder/model permissions are checked independently of local dataset access. Imported snapshots are stored on this computer; no external Autodesk record is created.</p>
        {error && <p role="alert" className="wb-inline-error">{error}</p>}
        {notice && <p role="status" className="wb-info">{notice}</p>}
        <fieldset disabled={busy} className="model-source-controls"><legend className="sr-only">Authorized model source selection</legend>
          <div className="model-source-project-row"><button className="button" type="button" onClick={() => void perform(async call => { const data = await call('projects'); const rows = data.entries ?? data.data ?? data.projects ?? []; setProjects(rows.map((p: Json) => ({ id: p.id, name: p.attributes?.name ?? p.name }))); setNotice(rows.length ? 'Authorized projects loaded. Select a project to browse its folders.' : 'No accessible projects were returned for the configured hub.'); })}>Read authorized projects</button><label className="wb-field"><span>Autodesk project</span><select value={project} onChange={e => chooseProject(e.target.value)}><option value="">Choose an authorized project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
          {project && <div className="model-source-browser"><div className="model-source-breadcrumb"><button type="button" className="button ghost tiny" disabled={!trail.length} onClick={() => folder(undefined, true)}><ArrowLeft size={14}/>Parent folder</button><span>{trail.map(t => t.name).join(' / ') || 'Project top folders'}</span></div><div className="model-source-entry-list">{entries.length ? entries.map(e => <button type="button" key={`${e.type}:${e.id}`} className={`model-source-entry ${item?.id === e.id ? 'selected' : ''}`} onClick={() => e.type === 'folders' ? folder(e) : chooseItem(e)}>{e.type === 'folders' ? <FolderClosed size={16}/> : <Download size={16}/>}<span>{e.name}<small>{e.type === 'folders' ? 'Folder' : 'Model/file item'}</small></span></button>) : <p className="wb-muted">No visible folders or model items in this selection.</p>}</div></div>}
          {item && <div className="model-source-version-grid"><label className="wb-field"><span>Exact version · {item.name}</span><select value={version} onChange={e => chooseVersion(e.target.value)}><option value="">Choose a source version</option>{versions.map(v => <option value={v.id} key={v.id}>{v.version_number == null ? v.name : `Version ${v.version_number} · ${v.name}`}{v.modified_at ? ` · ${v.modified_at}` : ''}</option>)}</select></label><label className="wb-field"><span>3D property viewable</span><select value={view} onChange={e => { setView(e.target.value); setExtract(null); }}><option value="">Choose a processed 3D viewable</option>{views.map(v => <option value={v.id} key={v.id}>{v.name}</option>)}</select></label></div>}
          {version && <p className="model-source-reference">Source version: <code>{version}</code></p>}
          {viewContext && <div className="wb-info"><strong>Embedded Viewer dependency</strong><p>{viewContext.viewer_dependency}</p>{viewContext.web_view_url && <a className="button" href={viewContext.web_view_url} target="_blank" rel="noreferrer">Open authorized Autodesk model <ExternalLink size={14}/></a>}{!views.length && <p>No processed 3D property viewable was returned for this source version. Check source format, derivative processing and access in Autodesk.</p>}</div>}
          <button type="button" className="button primary" disabled={!project || !version || !view} onClick={() => void perform(async call => { const data = await call('properties', { project_id: project, version_id: version, viewable_id: view }); setExtract(data); setNotice('Server-side property extract prepared. Review its exact provenance before importing.'); })}>Extract selected version's properties</button>
          {extract && <div className="model-source-preview"><h3>Authorized property snapshot</h3><dl className="wb-metadata"><div><dt>Model</dt><dd>{extract.preview.title}</dd></div><div><dt>Elements</dt><dd>{extract.preview.element_count}</dd></div><div><dt>Source version</dt><dd><code>{extract.preview.model.version_id}</code></dd></div><div><dt>Designation</dt><dd>Unverified · requires a source designation basis</dd></div></dl><p>Categories: {extract.preview.categories.join(', ') || 'Not supplied'}</p>{extract.preview.limitations.map((limitation: string) => <p className="wb-small-note" key={limitation}>{limitation}</p>)}{extract.preview.transient_identifier_count > 0 && <p className="wb-info">Some objects lack source external IDs. Their explicitly marked viewable object IDs are exact-version references and cannot be assumed stable across model versions.</p>}<p className="wb-small-note">Prepared extract expires {extract.expires_at}. Import rechecks access and consumes the server-held source snapshot; browser-edited JSON cannot claim verified APS provenance.</p><button className="button primary" type="button" onClick={() => void perform(async call => { const data = await call('import', { extract_receipt_id: extract.extract_receipt_id }); const dataset = data.dataset ?? data; onImported?.(dataset); setExtract(null); setNotice('Authorized source snapshot imported into the local model-data workspace. For-Record/As-Built designation and quantity approval remain separate decisions.'); })}>Import this authorized snapshot</button></div>}
        </fieldset>
        {busy && <p className="model-source-loading" role="status"><LoaderCircle size={15} className="spin"/> Reading the selected Autodesk source…</p>}
      </>}
    </div>
  </section>;
}
