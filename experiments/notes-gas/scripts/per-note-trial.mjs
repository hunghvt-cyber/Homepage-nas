/* Synthetic new namespace only. Never reset/replay an old mutation workload. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createGasClient,newRequest,prepareRequest} from '../adapter.mjs';
if(process.env.NOTES_GAS_PER_NOTE_TRIAL!=='ISOLATED_SYNTHETIC_ONLY')throw Error('TRIAL_DISABLED');
const path=new URL('../per-note-result.local.json',import.meta.url);
const report={kind:'LIVE_GOOGLE_PER_NOTE_NOT_VERCEL_OR_IPAD',at:new Date().toISOString(),completed:false,calls:[],checks:{},errors:[]};
const save=()=>writeFile(path,JSON.stringify(report,null,2)+'\n');
function make(timeoutMs,attempts){let last;const tries=[];const call=createGasClient({url:process.env.NOTES_GAS_URL,key:process.env.NOTES_GAS_HMAC_KEY,timeoutMs,attempts,observe:x=>{last=x;},onAttempt:x=>tries.push(x)});return async(req,label)=>{last=null;tries.length=0;const start=performance.now();try{const data=await call(req);report.calls.push({label,ok:true,ms:performance.now()-start,timings:last?.timings,attempts:structuredClone(tries)});await save();return data;}catch(e){report.calls.push({label,ok:false,ms:performance.now()-start,code:e.message,status:e.status,attempts:structuredClone(tries)});await save();throw e;}};}
// Concurrent calls use separate client metrics buffers.
const diagnostic=(req,label)=>make(180000,1)(req,label);
const live=(req,label)=>make(12000,2)(req,label);
const request=(op,payload={},actor='owner')=>newRequest(op,{...payload,perNote:true,profile:true},actor);
async function confirmed(req,label){try{return await live(req,label);}catch(e){if(e.status!==503)throw e;return diagnostic(req,label+'-diagnostic-same-id');}}
const fixture=(id=randomUUID(),folder='trial-workspace')=>({id,title:'SYNTHETIC per-note '+id.slice(0,8),text:'Tiếng Việt 日本語 😀\n'+'Nội dung thử nghiệm. '.repeat(80),folder,pinned:false,checklist:[{id:'one',text:'Việc đã xong ✅',checked:true},{id:'two',text:'Việc tiếp theo',checked:false}]});
async function expectStatus(req,status,label){try{await diagnostic(req,label);assert.fail('EXPECTED_ERROR');}catch(e){assert.equal(e.status,status);}}
try{
 report.originalBefore=await diagnostic(newRequest('health'),'original-health-before');assert.equal(report.originalBefore.revision,119);assert.equal(report.originalBefore.activeNotes,100);
 assert.equal(report.originalBefore.build,'notes-gas-per-note-v5');
 const init=await diagnostic(request('shardInit'),'shard-init');assert.equal(init.existing,false,'REFUSE_USED_SHARD_NAMESPACE');
 let a=await confirmed(request('save',fixture()),'functional-create-a');let b=await confirmed(request('save',fixture()),'functional-create-b');
 async function raced(req,label){for(let attempt=0;attempt<5;attempt++){try{return await diagnostic(req,label+'-attempt-'+attempt);}catch(e){if(e.status!==503||attempt===4)throw e;await new Promise(r=>setTimeout(r,300));}}}
 const common={...a,title:'SYNTHETIC simultaneous'},pair=[request('save',common),request('save',{...common,text:common.text+' other'})];
 const same=await Promise.allSettled(pair.map((req,i)=>raced(req,'same-note-'+i)));assert.equal(same.filter(x=>x.status==='fulfilled').length,1);assert.equal(same.find(x=>x.status==='rejected').reason.status,409);a=await diagnostic(request('get',{id:a.id}),'after-same-note');report.checks.sameNoteOneWinner=true;
 const different=await Promise.allSettled([request('save',{...a,title:'SYNTHETIC different A'}),request('save',{...b,title:'SYNTHETIC different B'})].map((req,i)=>raced(req,'different-note-'+i)));
 // A concurrent writer may return BUSY; resolve with the SAME request and do not count it as a benchmark success.
 for(let i=0;i<different.length;i++)assert.equal(different[i].status,'fulfilled');report.checks.differentNotesBothRetained=true;a=await diagnostic(request('get',{id:a.id}),'get-a');b=await diagnostic(request('get',{id:b.id}),'get-b');
 const replayReq=request('save',{...a,title:'SYNTHETIC replay'}),once=await confirmed(replayReq,'replay-first'),twice=await diagnostic(replayReq,'replay-same-id');assert.deepEqual(twice,once);a=once;report.checks.idempotency=true;
 const prepared=prepareRequest(request('shareCreate',{folder:'trial-workspace'}),process.env.NOTES_GAS_HMAC_KEY),token=prepared.token;
 await confirmed(prepared.req,'workspace-share');const shared=await diagnostic(request('get',{id:a.id,token},'share'),'shared-get');assert.equal(shared.history,undefined);
 const sharedReq=request('save',{...a,title:'SYNTHETIC shared save',token},'share');await confirmed(sharedReq,'shared-save');
 await confirmed(request('shareRevoke',{shareId:prepared.req.payload.shareId}),'revoke');await expectStatus(sharedReq,404,'revoked-replay');report.checks.workspaceShareRevokeReplay=true;
 a=await diagnostic(request('get',{id:a.id}),'owner-get-after-share');a=await confirmed(request('restore',{id:a.id,revision:a.revision,historyIndex:0}),'history-restore');
 await confirmed(request('delete',{id:b.id,revision:b.revision}),'delete');await expectStatus(request('get',{id:b.id}),404,'deleted-get');
 b=await confirmed(request('restore',{id:b.id,revision:(await diagnostic(request('shardExport'),'export-for-deleted-revision')).notes[b.id].revision,historyIndex:0}),'undelete');
 let list=await diagnostic(request('list'),'before-folder-delete');await confirmed(request('folderDelete',{folder:'trial-workspace',revision:list.revision,deleteNotes:false}),'folder-delete');
 assert.equal((await diagnostic(request('get',{id:a.id}),'after-folder-delete')).folder,'');report.checks.historyDeleteFolder=true;
 // Small complete recovery rehearsal BEFORE long capacity/latency phase.
 const portable=await diagnostic(request('shardExport'),'portable-export');await diagnostic(request('shardRestore',{shardStore:'recovery',backup:portable}),'restore-empty-recovery');const recovered=await diagnostic(request('shardExport',{shardStore:'recovery'}),'recovery-export');assert.deepEqual(recovered,portable);report.checks.fullStoreRestoreSmall=true;report.restoreRecords=Object.keys(portable.notes).length;
 const total=100;for(let i=portable.index.length;i<total;){const count=Math.min(5,total-i),req=request('shardSeed',{notes:Array.from({length:count},()=>fixture())});await diagnostic(req,'seed-'+i);i+=count;}
 const health=await diagnostic(request('health'),'at100-manifest-health');assert.equal(health.activeNotes,100);report.at100={revision:health.revision,activeNotes:health.activeNotes};
 // Read, list, save samples at 100. Stop short of 500 live if latency fails.
 a=await diagnostic(request('get',{id:a.id}),'before-benchmark-get');
 for(let i=0;i<20;i++){
  await confirmed(newRequest('ping',{profile:true}),'ping');await confirmed(request('list'),'list-100');await confirmed(request('get',{id:a.id}),'get-100');
  a=await confirmed(request('save',{...a,title:'SYNTHETIC measured '+i}),'save-100');
 }
 const data=await diagnostic(request('shardExport'),'integrity-export-100');assert.equal(Object.keys(data.notes).length,100);assert.equal(data.index.length,100);
 for(const row of data.index){const n=data.notes[row.id];assert.equal(n.id,row.id);assert.equal(n.revision,row.revision);assert.deepEqual(n.checklist.map(x=>x.id),['one','two']);assert.ok(n.text.includes('Tiếng Việt'));}
 report.checks.integrity100=true;report.export={records:100,bytes:Buffer.byteLength(JSON.stringify(data)),sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
 report.completed=true;
}catch(e){report.errors.push({code:/^[A-Z_]{1,80}$/.test(e.message)?e.message:'ASSERTION_OR_REQUEST_FAILED',status:e.status||null});}
finally{
 try{report.originalAfter=await diagnostic(newRequest('health'),'original-health-after');assert.equal(report.originalAfter.revision,119);assert.equal(report.originalAfter.activeNotes,100);report.checks.originalUnchanged=true;}catch{report.errors.push({code:'ORIGINAL_HEALTH_UNVERIFIED'});}
 for(const label of ['ping','list-100','get-100','save-100']){const all=report.calls.filter(x=>x.label===label),values=all.filter(x=>x.ok).map(x=>x.ms).sort((a,b)=>a-b),pct=p=>values[Math.max(0,Math.ceil(p*values.length)-1)]??null;(report.summary??={})[label]={attempted:all.length,success:values.length,p50:pct(.5),p95:pct(.95)};}
 report.live500='NOT_RUN: first validate n100; no automatic stress escalation';await save();console.log(JSON.stringify({completed:report.completed,checks:report.checks,summary:report.summary,errors:report.errors}));
}
if(!report.completed||report.errors.length)process.exitCode=1;
