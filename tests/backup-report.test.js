import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import schema from '../reporting/backup-schema.cjs';
import {createBackupReportHandler} from '../api/backup-report.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const mac=(s,k)=>createHmac('sha256',k).update(s).digest('hex');
const keys={nas:'a'.repeat(64),gdrive:'b'.repeat(64),gphotos:'c'.repeat(64)};
const report=(source='gdrive',run_number=1,run_attempt=1)=>({schema_version:1,source:source==='gdrive'?'gdrive-koofr':'gphotos-koofr',run_id:100+run_number,run_number,run_attempt,run_url:'https://github.com/hunghvt-cyber/'+(source==='gdrive'?'my-backup-gdrive-koofr':'google-photos-koofr')+'/actions/runs/'+(100+run_number),status:'success',started_at:null,finished_at:new Date().toISOString(),metrics:source==='gdrive'?{transferred_gib:1.2,speed_mib_s:2,ignored_count:0,new_ignored_count:null}:{discovered:2,attempted:2,uploaded:2,skipped:0,errors:0,boundary_seen:true,bootstrap_complete:true},warnings:[]});
function harness(){
 const props=new Map(),files=new Map(),folders=new Map(),cache=new Map(),logs=[];let busy=false,ambiguous=false,failCreate=false;
 const file=id=>({getId:()=>id,getBlob:()=>({getDataAsString:()=>files.get(id).raw}),setTrashed:()=>{files.get(id).trashed=true;}});
 const folder=()=>{const id=randomUUID(),f={getId:()=>id,createFile(name,raw){if(failCreate)throw Error('synthetic-write-failure');const n=randomUUID();files.set(n,{raw,folder:id,trashed:false});return file(n);}};folders.set(id,f);return f;};
 const p={getProperty:k=>props.get(k)||null,setProperty(k,v){props.set(k,v);if(ambiguous&&k.endsWith('_HEAD')){ambiguous=false;throw Error('synthetic-lost-ack');}return this;}};
 const ctx=vm.createContext({console:{log:s=>logs.push(JSON.parse(s))},PropertiesService:{getScriptProperties:()=>p},DriveApp:{createFolder:folder,getFolderById:id=>folders.get(id),getFileById:file},LockService:{getScriptLock:()=>({waitLock(){assert.equal(busy,false);},tryLock:()=>!busy,releaseLock(){}})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_a,s)=>[...createHash('sha256').update(s).digest()],computeHmacSha256Signature:(s,k)=>[...createHmac('sha256',k).update(s).digest()]},MimeType:{PLAIN_TEXT:'text/plain'},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:s=>({setMimeType:()=>s})}});
 for(const path of ['reporting/nas-schema.cjs','reporting/backup-schema.cjs','reporting/apps-script/Server.gs','reporting/apps-script/Backup.gs'])vm.runInContext(readFileSync(path,'utf8'),ctx);
 ctx.initializeNasReports();ctx.initializeBackupReports();props.set('NAS_REPORT_KEY',keys.nas);for(const s of ['gdrive','gphotos'])props.set('BACKUP_'+s.toUpperCase()+'_KEY',keys[s]);
 const request=(source='gdrive',r=report(source))=>({version:1,source,op:'publish',issuedAt:Date.now(),requestId:randomUUID(),reportText:JSON.stringify(r)});
 const post=(req,key=keys[req.source]||keys.nas)=>{const payload=JSON.stringify(req);const out=JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({payload,signature:mac(payload,key)})}}));if(out.payload){assert.equal(out.signature,mac(out.payload,key));return JSON.parse(out.payload);}return out;};
 return {ctx,props,files,cache,logs,request,post,get:s=>JSON.parse(ctx.doGet({parameter:{source:s}})),busy:v=>busy=v,ambiguous:()=>ambiguous=true,failCreate:()=>failCreate=true};
}
test('backup schema allowlists public aggregates and fixes run URL/source',()=>{
 for(const s of ['gdrive','gphotos'])assert.equal(schema.validate(report(s),s).schema_version,1);
 for(const mutate of [r=>r.private_path='/private',r=>r.run_url='https://other.example',r=>r.metrics.ignored_count=true,r=>r.warnings=['private filename'],r=>r.run_attempt=0]){const r=report();mutate(r);assert.throws(()=>schema.validate(r,'gdrive'));}
});
test('source keys/heads/folders are isolated and cannot authenticate each other',()=>{
 const h=harness();assert.equal(h.post(h.request(),keys.nas).code,'AUTH_DENIED');assert.equal(h.files.size,0);
 assert.equal(h.post(h.request('gdrive')).ok,true);assert.equal(h.post(h.request('gphotos')).ok,true);
 assert.equal(h.files.size,2);assert.equal(new Set([...h.files.values()].map(f=>f.folder)).size,2);assert.equal(h.get('nas').code,'NO_REPORT');
 assert.ok(h.logs.every(e=>![...Object.values(keys)].some(k=>JSON.stringify(e).includes(k))));
});
test('NAS publish/replay/recovery still work with backup dispatcher and globals loaded',()=>{
 const h=harness(),snapshot={schema:1,updated_at:new Date().toISOString(),cam1:{state:'ok'},cam2:{state:'ok'},nas:{state:'ok'},health:{root:{used_percent:20,available_bytes:40},vol1:{used_percent:50,available_bytes:100},ram:{available_bytes:30},swap:{used_bytes:1,total_bytes:10}},maintenance:{state:'pass',measured_at:null},retention:{state:'unknown',measured_at:null}};
 const first={version:1,op:'publish',issuedAt:Date.now(),requestId:randomUUID(),generation:randomUUID(),sequence:1,snapshotText:JSON.stringify(snapshot)};
 assert.equal(h.post(first).ok,true);assert.equal(h.post(first).replay,true);
 assert.equal(h.post(h.request('gdrive')).ok,true);
 const second={...first,requestId:randomUUID(),sequence:2,snapshotText:JSON.stringify({...snapshot,cam1:{state:'warn'}})};
 assert.equal(h.post(second).ok,true);assert.equal(h.get('nas').sha256,hash(second.snapshotText));
 const head=JSON.parse(h.props.get('NAS_REPORT_HEAD'));h.files.get(head.current.fileId).raw='corrupt';h.cache.clear();
 const restored=h.get('nas');assert.equal(restored.recoveredPrevious,true);assert.equal(restored.payload,first.snapshotText);
 assert.equal(h.get('gdrive').ok,true);
});
test('exact replay does not double-commit and older runs/attempts cannot overwrite',()=>{
 const h=harness(),first=h.request();assert.equal(h.post(first).ok,true);assert.equal(h.post(first).replay,true);assert.equal(h.files.size,1);
 assert.equal(h.post({...first,requestId:randomUUID()}).replay,true);assert.equal(h.files.size,1);
 const conflict={...JSON.parse(first.reportText),status:'failure'};assert.equal(h.post(h.request('gdrive',conflict)).code,'REPORT_CONFLICT');
 assert.equal(h.post(h.request('gdrive',report('gdrive',1,2))).ok,true);
 assert.equal(h.post(first).code,'STALE_REPORT');assert.equal(h.post(h.request('gdrive',report('gdrive',2))).ok,true);
 assert.equal(h.post(h.request('gdrive',report('gdrive',1,3))).code,'STALE_REPORT');
 assert.equal([...h.files.values()].filter(x=>!x.trashed).length,2);
});
test('busy/expired/invalid reports do not write; ambiguous commit reconciles and replay verifies',()=>{
 const h=harness(),req=h.request();h.busy(true);assert.equal(h.post(req).code,'BUSY');h.busy(false);
 assert.equal(h.post({...req,issuedAt:Date.now()-600000}).code,'REQUEST_EXPIRED');assert.equal(h.files.size,0);
 h.ambiguous();assert.equal(h.post(req).ok,true);assert.equal(h.post(req).replay,true);
 const head=h.props.get('BACKUP_GDRIVE_HEAD');h.failCreate();assert.equal(h.post(h.request('gdrive',report('gdrive',2))).ok,false);assert.equal(h.props.get('BACKUP_GDRIVE_HEAD'),head);
});
test('corrupted current falls back to previous without refreshing received_at',()=>{
 const h=harness(),first=h.request();h.post(first);h.post(h.request('gdrive',report('gdrive',2)));
 const head=JSON.parse(h.props.get('BACKUP_GDRIVE_HEAD'));h.files.get(head.current.fileId).raw='corrupt';h.cache.clear();
 const result=h.get('gdrive');assert.equal(result.recoveredPrevious,true);assert.equal(result.payload,first.reportText);assert.equal(result.received_at,head.previous.received_at);
});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.data=v;return this;}});
const env={BACKUP_REPORT_GAS_URL:'https://script.google.com/macros/s/'+'x'.repeat(30)+'/exec'};
test('Vercel adapter validates source, hash, schema, redirect and trusted received time',async()=>{
 const r=report(),payload=JSON.stringify(r);let calls=0;
 const handler=createBackupReportHandler({env,request:async(url,options)=>{calls++;if(calls===1){assert.equal(new URL(url).searchParams.get('source'),'gdrive');return new Response(null,{status:302,headers:{location:'https://script.googleusercontent.com/test'}});}assert.equal(options.redirect,'error');return Response.json({ok:true,service:'homepage-backup-reports-v1',source:'gdrive',payload,sha256:hash(payload),received_at:r.finished_at});}}),res=response();
 await handler({method:'GET',query:{source:'gdrive'}},res);assert.equal(res.code,200);assert.equal(res.data.run_number,1);assert.equal(res.data._report.received_at,r.finished_at);assert.match(res.headers['Cache-Control'],/s-maxage=60/);
 for(const request of [async()=>new Response(null,{status:302,headers:{location:'https://other.example'}}),async()=>new Response('x'.repeat(20000)),async()=>Response.json({ok:true,service:'homepage-backup-reports-v1',source:'gphotos',payload,sha256:hash(payload)})]){
  const bad=response();await createBackupReportHandler({env,request})({method:'GET',query:{source:'gdrive'}},bad);assert.equal(bad.code,502);assert.equal(bad.headers['Cache-Control'],'no-store');
 }
 const bad=response();await handler({method:'GET',query:{source:'arbitrary'}},bad);assert.equal(bad.code,400);
});
test('Homepage can select backup API without falling back silently to blocked Blob',async()=>{
 const ids=['backup','photos'].flatMap(p=>['state','time','note','link',...(p==='backup'?['bytes','speed','ignored']:['uploaded','skipped','errors'])].map(x=>p+'-'+x));
 const dom=new JSDOM(ids.map(id=>id.endsWith('-link')?'<a id="'+id+'"></a>':'<span id="'+id+'"></span>').join(''),{runScripts:'outside-only'}),w=dom.window,calls=[];
 w.AbortSignal=AbortSignal;w.BACKUP_REPORTS_API_URL='/api/backup-report';w.BACKUP_REPORTS_BASE_URL='https://legacy.invalid';w.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>report(url.endsWith('gdrive')?'gdrive':'gphotos')};};
 w.eval(readFileSync('public/backup-status.js','utf8'));for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,['/api/backup-report?source=gdrive','/api/backup-report?source=gphotos']);assert.equal(w.document.getElementById('backup-state').textContent,'Backup thành công');dom.window.close();
});
test('configured GAS without a terminal report stays uncacheable and never claims success',async()=>{
 const res=response();
 await createBackupReportHandler({env,request:async()=>Response.json({ok:false,service:'homepage-backup-reports-v1',source:'gdrive',code:'NO_REPORT'})})({method:'GET',query:{source:'gdrive'}},res);
 assert.equal(res.code,503);assert.equal(res.data.code,'NO_REPORT');assert.equal(res.headers['Cache-Control'],'no-store');
 const ids=['backup','photos'].flatMap(p=>['state','time','note','link'].map(x=>p+'-'+x));
 const dom=new JSDOM(ids.map(id=>'<span id="'+id+'"></span>').join(''),{runScripts:'outside-only'}),w=dom.window,calls=[];
 w.AbortSignal=AbortSignal;w.BACKUP_REPORTS_API_URL='/api/backup-report';w.BACKUP_REPORTS_BASE_URL='https://legacy.invalid';
 w.fetch=async url=>{calls.push(url);return {ok:false,json:async()=>({code:'NO_REPORT'})};};
 w.eval(readFileSync('public/backup-status.js','utf8'));for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));
 assert.equal(calls.length,2);for(const p of ['backup','photos'])assert.equal(w.document.getElementById(p+'-state').textContent,'Chưa có báo cáo từ workflow');
 assert.ok(calls.every(x=>x.startsWith('/api/backup-report?')));dom.window.close();
});

