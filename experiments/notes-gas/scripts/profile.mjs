/* Live diagnostic workload: retained synthetic-only store, no reset or real migration. */
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createGasClient,newRequest} from '../adapter.mjs';
if(process.env.NOTES_GAS_PROFILE_ONLY!=='RETAINED_SYNTHETIC_PROJECT')throw Error('PROFILE_OPT_IN_REQUIRED');
const url=process.env.NOTES_GAS_URL,key=process.env.NOTES_GAS_HMAC_KEY;
const report={kind:'LIVE_GOOGLE_STAGE_PROFILE',at:new Date().toISOString(),path:'GitHub runner -> GAS ContentService -> Drive; not Vercel/browser',timeoutMs:12000,attempts:2,samples:[],checkpoints:[],diagnosticJournal:[],assertions:{},completed:false};
const file=new URL('../profile-result.local.json',import.meta.url);
const persist=()=>writeFile(file,JSON.stringify(report,null,2)+'\n');
const round=x=>Math.round(x*100)/100;
const code=e=>/^[A-Z_]{1,64}$/.test(e.message)?e.message:'ERROR';
const timings=x=>Object.fromEntries(Object.entries(x||{}).filter(([k,v])=>/^[A-Za-z]{1,32}$/.test(k)&&Number.isFinite(v)&&v>=0));
async function run(req,{diagnostic=false}={}){
 if(req.op==='save'&&!report.checkpoints.some(x=>x.request.requestId===req.requestId)){report.checkpoints.push({request:req});await persist();}
 const sample={operation:req.op,...(req.op==='save'?{writeMode:req.payload.revision?'update':'create'}:{}),diagnostic,attempts:[]};let observed;
 const client=createGasClient({url,key,timeoutMs:diagnostic?60000:12000,attempts:diagnostic?1:2,observe:x=>{observed=x;},onAttempt:x=>sample.attempts.push({...x,durationMs:round(x.durationMs)})});
 const start=performance.now();let result,error;
 try{result=await client(req);sample.ok=true;}catch(e){error=e;sample.ok=false;sample.code=code(e);sample.status=e.status;}
 sample.elapsedMs=round(performance.now()-start);
 if(observed?.timings)sample.serverMs=timings(observed.timings);
 if(Number.isFinite(sample.serverMs?.serverTotal)){
  // For a successful final attempt only; excludes earlier failed attempts/backoff.
  sample.outsideMeasuredServerMs=round(sample.attempts.at(-1).durationMs-sample.serverMs.serverTotal);
 }
 report.samples.push(sample);await persist();console.log(JSON.stringify({progress:report.samples.length,operation:sample.operation,diagnostic,ok:sample.ok,elapsedMs:sample.elapsedMs,serverMs:sample.serverMs,code:sample.code}));
 return {result,error};
}
async function invoke(op,payload={}){
 const req=newRequest(op,{...payload,profile:true});
 if(op==='save'){
  // A checkpoint with the exact synthetic operation allows retry after lost response.
  report.checkpoints.push({request:req});await persist();
 }
 let r=await run(req);
 if(r.error?.status===503){
  // Keep primary failure in evidence. Same request ID/issuedAt/payload, never new save.
  const d=await run(req,{diagnostic:true});
  if(op==='save')report.checkpoints.at(-1).resolved=!d.error;
  r=d;
 }
 if(r.error)throw r.error;
 if(op==='save'){report.checkpoints.at(-1).resolved=true;await persist();}
 return r.result;
}
try{
 const before=await invoke('health');report.initialHealth={revision:before.revision,activeNotes:before.activeNotes,build:before.build};
 if(before.activeNotes!==10||before.revision!==10)throw Error('UNEXPECTED_SYNTHETIC_STATE');
 // No old Note bodies read or rewritten. Only this run's UUIDs are touched.
 for(let i=0;i<10;i++)await invoke('ping');
 for(let i=0;i<10;i++)await invoke('list');
 let saved;
 for(let i=0;i<6;i++){
  saved=await invoke('save',{id:randomUUID(),title:'SYNTHETIC PROFILE '+i,text:('Tiếng Việt 日本語 🧡 dòng mới\n').repeat(100),folder:'SYNTHETIC PROFILE',checklist:[{id:'a',text:'Kiểm tra',checked:false}]});
  for(let j=0;j<1;j++)saved=await invoke('save',{...saved,text:saved.text+'\nSYNTHETIC update',checklist:[{id:'a',text:'Kiểm tra',checked:true}]});
 }
 for(let i=0;i<10;i++)await invoke('get',{id:saved.id});
 const stale=await run(newRequest('save',{...saved,text:'SYNTHETIC winner',profile:true}));
 if(stale.error)throw stale.error;
 const conflict=await run(newRequest('save',{...saved,text:'SYNTHETIC stale',profile:true}));report.assertions.staleRejected=conflict.error?.status===409;
 if(!report.assertions.staleRejected)throw Error('CONFLICT_GUARD_FAILED');
 const health=await invoke('health');report.finalHealth={revision:health.revision,activeNotes:health.activeNotes,build:health.build};report.completed=true;
}catch(e){report.error={code:code(e),status:e.status||null};}
try{
 const client=createGasClient({url,key,timeoutMs:60000,attempts:1});
 const journal=await client(newRequest('logs'));
 report.diagnosticJournal=(journal.events||[]).map(x=>({at:x.at,operation:x.operation,stage:x.stage,status:x.status,code:x.code,durationMs:x.durationMs,...(x.timings?{timings:timings(x.timings)}:{})}));
}catch(e){report.journalError=code(e);}
const q=(xs,p)=>xs.length?round([...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1]):null;
report.summary={};
for(const op of new Set(report.samples.filter(x=>!x.diagnostic).map(x=>x.operation))){
 const samples=report.samples.filter(x=>x.operation===op&&!x.diagnostic),success=samples.filter(x=>x.ok);
 const stageNames=[...new Set(success.flatMap(x=>Object.keys(x.serverMs||{})))];
 report.summary[op]={count:samples.length,success:success.length,p50Ms:q(success.map(x=>x.elapsedMs),.5),p95Ms:q(success.map(x=>x.elapsedMs),.95),stages:Object.fromEntries(stageNames.map(k=>[k,{p50Ms:q(success.map(x=>x.serverMs?.[k]).filter(Number.isFinite),.5),p95Ms:q(success.map(x=>x.serverMs?.[k]).filter(Number.isFinite),.95)}]))};
}
report.caveats=['Stage timers are wall clock, nested totals must not be summed with children.','OutsideMeasuredServer includes platform startup, response signing/output, network, redirect; it is not pure network.','60-second same-request reconciliation is separate diagnostic evidence; primary 12-second failures remain.','Small sequential sample, no cold-start guarantee, no production Blob comparison yet.'];
await persist();console.log(JSON.stringify({completed:report.completed,error:report.error,summary:report.summary}));
if(!report.completed)process.exitCode=1;
