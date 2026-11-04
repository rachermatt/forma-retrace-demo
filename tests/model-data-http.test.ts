import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, loadConfig } from '../server/index.ts';
import { sampleModelDataset, sampleModelProfile } from '../server/model-data-fixtures.ts';
import { setupDemo } from '../scripts/demo-setup.ts';

type Json=Record<string,any>;
type Result={status:number;headers:http.IncomingHttpHeaders;body:Buffer;json:()=>Json};
async function serving(t:{after:(fn:()=>Promise<void>)=>void},options:{publicDemo?:boolean;mode?:'fixture'|'live';seed?:boolean}={}) {
  const directory=mkdtempSync(join(tmpdir(),'forma-retrace-model-http-'));const dataDir=join(directory,'data');
  if(options.seed)setupDemo({targetDir:dataDir});
  const mode=options.mode??'fixture',publicHost='forma-retrace.vercel.app';
  let app:ReturnType<typeof createApp>;let port=0,cookie='',csrf='';
  const start=async()=>{app=createApp(loadConfig({APP_MODE:mode,PORT:'0',DATA_DIR:dataDir,APS_CLIENT_ID:'',APS_CLIENT_SECRET:'',APS_HUB_ID:''}),options.publicDemo?{deployment:{kind:'public_demo',read_only:true,label:'Public synthetic demo',persistence:'fixed_snapshot',allowedOrigins:[`https://${publicHost}`]}}:{});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const address=app.server.address();assert.ok(address&&typeof address!=='string');port=address.port;};
  const stop=async()=>{await new Promise<void>(done=>app.server.close(()=>done()));app.close();};
  t.after(async()=>{await stop();rmSync(directory,{recursive:true,force:true});});await start();
  const raw=(path:string,input?:unknown,extra:Record<string,string>={}):Promise<Result>=>new Promise((accept,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,method:input===undefined?'GET':'POST',headers:{...(options.publicDemo?{Host:publicHost}:{}),...(cookie?{Cookie:cookie}:{}),...(input===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf}),...extra}},res=>{const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(Buffer.from(chunk)));res.on('end',()=>{const body=Buffer.concat(chunks);accept({status:res.statusCode??0,headers:res.headers,body,json:()=>JSON.parse(body.toString())});});});req.on('error',reject);req.end(input===undefined?undefined:JSON.stringify(input));});
  const session=async()=>{const r=await raw('/api/bootstrap');assert.equal(r.status,200);cookie=(r.headers['set-cookie']??[]).map(value=>value.split(';')[0]).join('; ');csrf=r.json().csrfToken;return r.json();};
  const call=async(path:string,input?:unknown)=>{const r=await raw(path,input);assert.ok(r.status>=200&&r.status<300,`${path}: ${r.status} ${r.body.toString().slice(0,500)}`);return r.json();};
  return {raw,call,session,restart:async()=>{await stop();cookie='';csrf='';await start();await session();}};
}

test('model-data import, analysis and fixed publications persist without changing historical evidence packets',async t=>{
  const app=await serving(t,{seed:true});const legacy=await app.session();const evidence=await app.call('/api/v2/fixture/bootstrap');
  const oldPackets=[...legacy.exports,...evidence.exports];const oldReports=await Promise.all(oldPackets.map(async(p:Json)=>({path:p.html_url,body:(await app.raw(p.html_url)).body})));
  const base='/api/model-data/local';const empty=await app.call(base+'/bootstrap');assert.equal(empty.datasets.length,0);
  const input={...sampleModelDataset(),data_mode:'imported',title:'Imported test property extract',source_description:'Clearly labeled synthetic test values used only to validate the private JSON-import mechanism.'};
  const imported=await app.call(base+'/datasets',input);assert.ok(imported.dataset_id);assert.equal(imported.data_mode,'imported');
  const repeated=await app.call(base+'/datasets',input);assert.equal(repeated.dataset_id,imported.dataset_id);
  const profile=await app.call(base+'/profiles',sampleModelProfile());const run=await app.call(base+'/runs',{dataset_id:imported.dataset_id,profile_id:profile.profile_id});assert.ok(run.run_id);assert.ok(run.results.length>0);
  assert.ok(run.results.every((r:Json)=>r.source.version_id&&r.element_key));assert.ok(run.results.some((r:Json)=>r.assignments.length>1));
  const duplicateRun=await app.call(base+'/runs',{dataset_id:imported.dataset_id,profile_id:profile.profile_id});assert.equal(duplicateRun.run_id,run.run_id);
  const exported=await app.call(base+'/exports',{run_id:run.run_id,title:'Model-data test snapshot',reviewer:'Named local test reviewer',reason:'Fixed validation snapshot; no verified physical quantity or external approval.',include_unresolved:true});
  const fixed=await app.call(exported.manifest_url);const html=await app.raw(exported.html_url+'?inline=1');const csv=await app.raw(exported.csv_url);assert.equal(html.status,200);assert.equal(csv.status,200);assert.match(String(csv.headers['content-type']),/text\/csv/);assert.match(String(html.headers['content-security-policy']),/sandbox/);assert.match(String(html.headers['content-disposition']),/^inline/);
  const search=await app.call(base+'/search?q='+encodeURIComponent(run.results[0].element.name));assert.ok(search.results.some((r:Json)=>r.run_id===run.run_id&&r.dataset_id===imported.dataset_id));
  const result=run.results.find((r:Json)=>Object.keys(r.normalized).length);assert.ok(result);const key=Object.keys(result.normalized).find(k=>result.normalized[k].value!==null);assert.ok(key);
  const oldValue=result.normalized[key].value;const correctedValue=typeof oldValue==='number'?oldValue+1:typeof oldValue==='boolean'?!oldValue:String(oldValue)+' corrected';
  await app.call(base+'/overrides',{run_id:run.run_id,element_key:result.element_key,target:'property',key,value:correctedValue,unit:result.normalized[key].unit??undefined,reason:'Reasoned test correction recorded after fixed export.',reviewer:'Local test reviewer'});
  const corrected=await app.call(base+'/runs/'+run.run_id);assert.equal(corrected.results.find((r:Json)=>r.element_key===result.element_key).normalized[key].value,correctedValue);
  assert.deepEqual(await app.call(exported.manifest_url),fixed);assert.deepEqual((await app.raw(exported.html_url)).body,html.body);assert.deepEqual((await app.raw(exported.csv_url)).body,csv.body);
  await app.restart();assert.equal((await app.call(base+'/bootstrap')).datasets.length,1);assert.equal((await app.call(base+'/runs/'+run.run_id)).overrides.length,1);assert.deepEqual(await app.call(exported.manifest_url),fixed);
  for(const packet of oldReports)assert.deepEqual((await app.raw(packet.path)).body,packet.body);
});

test('model-data workspace and trusted-source boundaries preserve sessions, CSRF and mode isolation',async t=>{
  const app=await serving(t);assert.equal((await app.raw('/api/model-data/local/bootstrap')).status,401);await app.session();
  const input={...sampleModelDataset(),data_mode:'imported'};
  assert.equal((await app.raw('/api/model-data/local/datasets',input,{'X-CSRF-Token':'forged'})).status,403);
  assert.equal((await app.raw('/api/model-data/local/datasets',input,{Origin:'https://attacker.example'})).status,403);
  assert.equal((await app.raw('/api/model-data/fixture/datasets',input)).status,409);
  assert.equal((await app.raw('/api/model-data/local/datasets',{...input,data_mode:'aps'})).status,403);
  const imported=await app.call('/api/model-data/local/datasets',input);assert.equal((await app.raw('/api/model-data/fixture/datasets/'+imported.dataset_id)).status,404);
  assert.equal((await app.raw('/api/model-data/local/search?unexpected=1')).status,400);assert.equal((await app.raw('/api/model-data/local/search?q=a&q=b')).status,400);
  assert.equal((await app.raw('/api/model-source/projects')).status,409);
  const live=await serving(t,{mode:'live'});await live.session();assert.equal((await live.raw('/api/model-data/fixture/bootstrap')).status,409);assert.equal((await live.call('/api/model-data/local/bootstrap')).datasets.length,0);assert.equal((await live.raw('/api/model-source/projects')).status,503);
});

test('public model-data views expose deterministic synthetic results and exports while rejecting all private imports and edits',async t=>{
  const first=await serving(t,{publicDemo:true}),second=await serving(t,{publicDemo:true});await first.session();await second.session();
  const a=await first.call('/api/model-data/fixture/bootstrap'),b=await second.call('/api/model-data/fixture/bootstrap');assert.ok(a.datasets.length&&a.runs.length&&a.exports.length);assert.deepEqual(a,b);assert.equal(a.deployment.read_only,true);
  const run=await first.call('/api/model-data/fixture/runs/'+a.runs[0].run_id);assert.equal(run.data_mode,'synthetic');
  assert.equal((await first.raw('/api/model-data/local/bootstrap')).status,409);assert.equal((await first.raw('/api/model-source/projects')).status,403);
  for(const route of ['datasets','profiles','groups','runs','overrides','exports'])assert.equal((await first.raw('/api/model-data/fixture/'+route,{})).status,405);
  for(const link of ['manifest_url','csv_url','html_url']){const x=await first.raw(a.exports[0][link]),y=await second.raw(b.exports[0][link]);assert.equal(x.status,200);assert.deepEqual(x.body,y.body);assert.equal(x.headers['set-cookie'],undefined);}
});
