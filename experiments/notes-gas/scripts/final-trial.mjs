/* Authorized last GAS trial: existing synthetic store only. No reset or production. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createGasClient,newRequest,prepareRequest} from '../adapter.mjs';
if(process.env.NOTES_GAS_FINAL_TRIAL!=='SYNTHETIC_CACHE_POOL_ONLY')throw Error('OPT_IN_REQUIRED');
const key=process.env.NOTES_GAS_HMAC_KEY,url=process.env.NOTES_GAS_URL,build='notes-gas-final-trial-v3';
const report={kind:'LIVE_GOOGLE_CACHE_POOL_AB',at:new Date().toISOString(),completed:false,samples:[],checkpoints:[],assertions:{},caveats:['GitHub runner -> GAS/Drive, not iPad/Vercel.','Preview cache is owner-list only; details/writes/ACL still load Drive.','Pool has three dedicated trial slots; only current/previous snapshots retained in these slots; old immutable baseline untouched.','A/B interleaved, store grows; no claim of randomized controlled experiment.','12-second primary failures retained; 60-second same-request resolution separate.']};
const out=new URL('../final-trial-result.local.json',import.meta.url);let pendingWrite=Promise.resolve();const persist=()=>{const data=JSON.stringify(report,null,2)+'\n';pendingWrite=pendingWrite.then(()=>writeFile(out,data));return pendingWrite;};
const fixed=e=>/^[A-Z_]{1,80}$/.test(e.message)?e.message:'ASSERTION_OR_REQUEST_FAILED';
let phase='warmup';
async function run(req,mode,{diagnostic=false,expect}={}){
 const sample={phase,operation:req.op,mode,diagnostic,attempts:[]};let obs;
 const client=createGasClient({url,key,timeoutMs:diagnostic?60000:12000,attempts:diagnostic?1:2,observe:x=>obs=x,onAttempt:x=>sample.attempts.push(x)});
 if(!diagnostic&&!['list','get','search','health','logs','ping'].includes(req.op)){
  const payload={...req.payload};delete payload.token;
  report.checkpoints.push({request:{...req,payload},shareSecretOmitted:req.actor==='share'});await persist();
 }
 const start=performance.now();let result,error;
 try{result=await client(req);sample.ok=true;}catch(e){sample.ok=false;error=e;sample.code=fixed(e);sample.status=e.status;}
 sample.elapsedMs=performance.now()-start;
 if(obs){sample.build=obs.build||null;sample.timings=obs.timings;sample.reference=obs.reference;}
 report.samples.push(sample);await persist();
 console.log(JSON.stringify({phase,op:req.op,mode,diagnostic,ok:sample.ok,ms:Math.round(sample.elapsedMs),build:sample.build,code:sample.code,cacheHit:sample.timings?.indexCacheHit}));
 if(expect){assert.equal(error?.status,expect);return {expected:true};}
 if(error?.status===503&&!diagnostic){
  const resolved=await run(req,mode,{diagnostic:true});sample.reconciled=true;await persist();return resolved;
 }
 if(error)throw error;
 if(obs?.build!==build)throw Error('BUILD_NOT_CONVERGED');
 return result;
}
async function call(op,payload={},mode='optimized',token){
 const command=prepareRequest({...newRequest(op,{...payload,profile:true,optimized:mode==='optimized'}),...(token?{token}:{})},key);
 const result=await run(command.req,mode);return {...result,...(command.token?{token:command.token}:{})};
}
try{
 // Let management-plane rollout settle before interpreting latency samples.
 await new Promise(r=>setTimeout(r,30000));
 let before;
 for(let i=0;i<8;i++){
  try{before=await call('health',{},'control');break;}catch(e){if(e.message!=='BUILD_NOT_CONVERGED')throw e;if(i===7)throw e;await new Promise(r=>setTimeout(r,2000));}
 }
 assert.equal(before.revision,23,'Refuse unexpected store revision');assert.equal(before.activeNotes,16,'Refuse unexpected store count');
 report.initial={revision:before.revision,activeNotes:before.activeNotes,build:before.build};
 await call('preparePool',{},'control');await call('list');
 phase='ab-list';
 for(let i=0;i<12;i++)for(const mode of (i%2?['optimized','baseline']:['baseline','optimized']))await call('list',{},mode);
 phase='ab-write';const made={baseline:[],optimized:[]};
 for(let i=0;i<6;i++)for(const mode of (i%2?['optimized','baseline']:['baseline','optimized'])){
  const n=await call('save',{id:randomUUID(),title:'SYNTHETIC FINAL '+mode+' '+i,text:('Tiếng Việt 日本語 🧡 dòng mới\n').repeat(100),folder:'SYNTHETIC FINAL',checklist:[{id:'a',text:'Kiểm tra',checked:false}]},mode);made[mode].push(n);
 }
 for(let i=0;i<6;i++)for(const mode of (i%2?['baseline','optimized']:['optimized','baseline']))made[mode][i]=await call('save',{...made[mode][i],text:made[mode][i].text+'\nSYNTHETIC edited',checklist:[{id:'a',text:'Kiểm tra',checked:true}]},mode);
 phase='ab-get';for(let i=0;i<6;i++)for(const mode of ['baseline','optimized'])await call('get',{id:made[mode][i].id},mode);
 phase='fill-100';let health=await call('health');
 while(health.activeNotes<100){
  await call('save',{id:randomUUID(),title:'SYNTHETIC FILL '+health.activeNotes,text:('Tiếng Việt 日本語 🧡 dòng mới\n').repeat(100),folder:'SYNTHETIC FINAL',checklist:[{id:'a',text:'Kiểm tra',checked:false}]});health.activeNotes++;
 }
 health=await call('health');assert.equal(health.activeNotes,100);report.at100={revision:health.revision,activeNotes:health.activeNotes};
 phase='at100-list';for(let i=0;i<8;i++)for(const mode of (i%2?['optimized','baseline']:['baseline','optimized']))await call('list',{},mode);
 phase='functional';const target=made.optimized[0];let current=await call('get',{id:target.id});
 const writerA=prepareRequest(newRequest('save',{...current,text:'SYNTHETIC concurrent A',profile:true,optimized:true}),key).req;
 const writerB=prepareRequest(newRequest('save',{...current,text:'SYNTHETIC concurrent B',profile:true,optimized:true}),key).req;
 const race=await Promise.allSettled([run(writerA,'optimized'),run(writerB,'optimized')]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.find(x=>x.status==='rejected').reason.status,409);report.assertions.concurrentRevision=true;
 current=await call('get',{id:target.id});await call('restore',{id:current.id,revision:current.revision,historyIndex:0});report.assertions.historyRestore=true;
 const share=await call('shareCreate',{noteId:target.id});let shared=await call('get',{id:target.id},'optimized',share.token);assert.equal('history' in shared,false);
 shared=await call('save',{...shared,text:'SYNTHETIC shared edit',checklist:[{id:'a',text:'Đã tick',checked:true}]},'optimized',share.token);assert.equal(shared.checklist[0].checked,true);
 await call('shareRevoke',{shareId:share.id});await assert.rejects(call('get',{id:target.id},'optimized',share.token),e=>e.status===404);report.assertions.noteShareRevoke=true;
 const workspace=await call('shareCreate',{folder:'SYNTHETIC FINAL'});assert.ok((await call('list',{},'optimized',workspace.token)).notes.length>0);
 let w=await call('save',{id:randomUUID(),title:'SYNTHETIC workspace',text:'Unicode 🧡',checklist:[]},'optimized',workspace.token);
 await call('shareRevoke',{shareId:workspace.id});await assert.rejects(call('list',{},'optimized',workspace.token),e=>e.status===404);report.assertions.workspaceRevoke=true;
 await call('delete',{id:w.id,revision:w.revision});assert.ok((await call('search',{query:'SYNTHETIC FINAL'})).notes.length>0);
 const backup=await call('backup');assert.equal(Object.values(backup.notes).filter(n=>!n.deleted).length,100);report.assertions.backupExport=true;
 const replay=prepareRequest(newRequest('save',{id:randomUUID(),title:'SYNTHETIC discarded response',text:'Only once',checklist:[],profile:true,optimized:true}),key).req;
 const first=await run(replay,'optimized'),second=await run(replay,'optimized');assert.equal(first.revision,second.revision);await call('delete',{id:first.id,revision:first.revision});report.assertions.idempotentReplay=true;
 const listing=await call('list');await call('folderDelete',{folder:'SYNTHETIC FINAL',deleteNotes:false,revision:listing.revision});assert.equal((await call('list',{folder:'SYNTHETIC FINAL'})).notes.length,0);report.assertions.folderRemoval=true;
 const end=await call('health');report.final={revision:end.revision,activeNotes:end.activeNotes,readVerified:end.readVerified};report.completed=true;
}catch(e){report.error={code:fixed(e),status:e.status||null};}
try{const client=createGasClient({url,key,timeoutMs:60000,attempts:1});report.journal=(await client(newRequest('logs'))).events.map(x=>({at:x.at,operation:x.operation,stage:x.stage,status:x.status,code:x.code,durationMs:x.durationMs,timings:x.timings}));}catch(e){report.journalError=fixed(e);}
const percentile=(v,p)=>v.length?[...v].sort((a,b)=>a-b)[Math.ceil(v.length*p)-1]:null;
report.summary={};
for(const s of report.samples){if(s.diagnostic)continue;const group=[s.phase,s.operation,s.mode].join('/');(report.summary[group]??=[]).push(s);}
for(const [k,v] of Object.entries(report.summary)){
 const good=v.filter(x=>x.ok&&x.build===build);report.summary[k]={count:v.length,success:good.length,failures:v.filter(x=>!x.ok).length,p50Ms:percentile(good.map(x=>x.elapsedMs),.5),p95Ms:percentile(good.map(x=>x.elapsedMs),.95),cacheHits:good.filter(x=>x.timings?.indexCacheHit===1).length,retries:v.filter(x=>x.attempts.length>1).length,stages:Object.fromEntries([...new Set(good.flatMap(x=>Object.keys(x.timings||{})))].filter(x=>x!=='indexCacheHit').map(stage=>[stage,{p50Ms:percentile(good.map(x=>x.timings?.[stage]).filter(Number.isFinite),.5),p95Ms:percentile(good.map(x=>x.timings?.[stage]).filter(Number.isFinite),.95)}]))};
}
await persist();console.log(JSON.stringify({completed:report.completed,error:report.error,at100:report.at100,final:report.final,assertions:report.assertions,summary:report.summary}));if(!report.completed)process.exitCode=1;
