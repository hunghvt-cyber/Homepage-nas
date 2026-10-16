/* Opt-in LIVE integration test. New empty prototype project only. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {createGasClient,newRequest,prepareRequest} from '../adapter.mjs';
if(process.env.NOTES_GAS_TEST_ONLY!=='SYNTHETIC_EMPTY_PROJECT')throw Error('Set NOTES_GAS_TEST_ONLY=SYNTHETIC_EMPTY_PROJECT for a new empty prototype only.');
const key=process.env.NOTES_GAS_HMAC_KEY,client=createGasClient({url:process.env.NOTES_GAS_URL,key});
const samples=[],notes=[];
async function call(op,payload={},token) {
  const command=prepareRequest({...newRequest(op,payload),...(token?{token}:{})},key);
  const start=performance.now();
  try {const result=await client(command.req);samples.push({operation:op,ms:performance.now()-start,ok:true});return {...result,...(command.token?{token:command.token}:{})};}
  catch(e){samples.push({operation:op,ms:performance.now()-start,ok:false,code:e.message});throw e;}
}
let error;
try {
  const initial=await call('list');
  assert.equal(initial.notes.length,0,'Refusing nonempty store');
  assert.equal(initial.revision,'0','Refusing previously used store, including hidden tombstones/shares');
  for(let i=0;i<100;i++)notes.push(await call('save',{id:randomUUID(),title:'SYNTHETIC '+i,text:('Tiếng Việt 日本語 🧡 dòng mới\n').repeat(100),folder:i<50?'Workspace thử':'Folder khác',checklist:[{id:'a',text:'Kiểm tra',checked:false}]}));
  const listed=await call('list');assert.equal(listed.notes.length,100);
  for(let i=0;i<20;i++)await call('list');
  for(let i=0;i<20;i++)await call('get',{id:notes[i].id});
  assert.equal((await call('search',{query:'SYNTHETIC 99'})).notes.length,1);
  const original=await call('get',{id:notes[0].id});
  const concurrent=await Promise.allSettled([call('save',{...original,text:'Writer A'}),call('save',{...original,text:'Writer B'})]);
  assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(concurrent.find(x=>x.status==='rejected').reason.status,409);
  const newest=await call('get',{id:original.id});
  await call('restore',{id:original.id,revision:newest.revision,historyIndex:0});
  const noteShare=await call('shareCreate',{noteId:original.id});
  const shared=await call('get',{id:original.id},noteShare.token);assert.equal('history' in shared,false);
  await call('save',{...shared,text:'Shared write',checklist:[{id:'a',text:'Đã tick',checked:true}]},noteShare.token);
  await call('shareRevoke',{shareId:noteShare.id});
  await assert.rejects(call('get',{id:original.id},noteShare.token),e=>e.status===404);
  const folderShare=await call('shareCreate',{folder:'Workspace thử'});
  assert.equal((await call('list',{},folderShare.token)).notes.length,50);
  await call('save',{id:randomUUID(),title:'SYNTHETIC workspace create',text:'Unicode 🧡',checklist:[]},folderShare.token);
  const changed=await call('get',{id:notes[1].id},folderShare.token);await call('save',{...changed,text:'Workspace edit'},folderShare.token);
  await call('shareRevoke',{shareId:folderShare.id});
  await assert.rejects(call('list',{},folderShare.token),e=>e.status===404);
  const victim=await call('get',{id:notes[2].id});await call('delete',{id:victim.id,revision:victim.revision});
  const current=await call('list');assert.equal(current.notes.length,100);
  const delta=await call('list',{known:listed.notes.map(n=>[n.id,n.revision])});assert.ok(delta.removed.includes(victim.id));
  const bulkRev=(await call('list')).revision;await call('folderDelete',{folder:'Folder khác',deleteNotes:false,revision:bulkRev});
  const backup=await call('backup');assert.equal(Object.keys(backup.notes).length,101);
  // Network-loss resolution with same signed operation after the first response is discarded.
  const replay=newRequest('save',{id:randomUUID(),title:'SYNTHETIC replay',text:'Only once',checklist:[]});
  const first=await client(replay),second=await client(replay);assert.equal(first.revision,second.revision);
} catch(e) {error={code:e.message,status:e.status||null};}
const summary=Object.fromEntries([...new Set(samples.map(s=>s.operation))].map(op=>{
  const all=samples.filter(s=>s.operation===op),values=all.filter(s=>s.ok).map(s=>s.ms).sort((a,b)=>a-b);
  const percentile=p=>values.length?Math.round(values[Math.min(values.length-1,Math.ceil(values.length*p)-1)]):null;
  return [op,{count:all.length,success:values.length,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:values.length?Math.round(values.at(-1)):null}];
}));
const report={kind:'LIVE_GOOGLE_NOT_SIMULATION',at:new Date().toISOString(),passed:!error,error,summary,samples,
  caveat:'Expected conflict/revocation errors included. No Vercel/browser latency unless run inside isolated Vercel. Retained synthetic data; no cleanup of Drive snapshots.'};
await writeFile(new URL('../benchmark-result.local.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:!error,summary,error},null,2));if(error)process.exitCode=1;
