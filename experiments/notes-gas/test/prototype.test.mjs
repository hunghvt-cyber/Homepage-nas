import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {harness,key,hash,mac} from './harness.mjs';
import {createGasClient,newRequest,prepareRequest} from '../adapter.mjs';
import {createPrototypeHandler} from '../vercel-api/notes-prototype.mjs';
const note=(id=randomUUID())=>({id,title:'Ghi chú tiếng Việt 🧡',text:'Nội dung 日本語\nDòng 2 <script>alert(1)</script>',folder:'Gia đình',checklist:[{id:'a',text:'Mua sữa 🥛',checked:false}],pinned:false});
const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.result;};
function shared(h,scope) {
  const req=prepareRequest({...newRequest('shareCreate',scope)},key);ok(h.send(req.req));return req.token;
}

test('100 synthetic Notes: create/read/update/delete, Unicode, index, delta, full-text search, checklist and history recovery',()=>{
  const h=harness(),ids=[];
  for(let i=0;i<100;i++){const b=note();b.title+=' '+i;b.text+=' keyword-'+i;ids.push(b.id);ok(h.call('save',b));}
  let list=ok(h.call('list'));assert.equal(list.notes.length,100);assert.ok(list.notes.every(n=>n.text.length<=180&&!('history' in n)));
  const known=list.notes.map(n=>[n.id,n.revision]);assert.equal(ok(h.call('list',{known})).notes.length,0);
  assert.equal(ok(h.call('search',{query:'keyword-99'})).notes.length,1);
  let n=ok(h.call('get',{id:ids[0]}));assert.equal(n.text.includes('日本語'),true);
  assert.equal(ok(h.call('get',{id:n.id,revision:n.revision})).notModified,true);
  n=ok(h.call('save',{...n,text:'Đã đổi',checklist:[{id:'a',text:'Mua sữa 🥛',checked:true}]}));
  assert.equal(n.checklist[0].checked,true);assert.equal(n.history.length,1);
  assert.equal(ok(h.call('list',{known})).notes.length,1);
  n=ok(h.call('restore',{id:n.id,revision:n.revision,historyIndex:0}));assert.match(n.text,/日本語/);assert.equal(n.checklist[0].checked,false);
  ok(h.call('delete',{id:n.id,revision:n.revision}));assert.equal(h.call('get',{id:n.id}).status,404);
  assert.deepEqual(ok(h.call('list',{known})).removed,[n.id]);
  assert.equal(ok(h.call('backup')).index.length,99);
});

test('stale writers, conditional delete and duplicate create protection',()=>{
  const h=harness(),b=note(),a=ok(h.call('save',b));
  const newer=ok(h.call('save',{...a,text:'PC'}));
  assert.equal(h.call('save',{...a,text:'iPad'}).status,409);
  assert.equal(h.call('delete',{id:a.id,revision:a.revision}).status,409);
  assert.equal(h.call('save',b).status,409);assert.equal(ok(h.call('get',{id:a.id})).text,'PC');
  assert.notEqual(a.revision,newer.revision);
});

test('note capabilities: scope, edits, no history disclosure, revoke and rotation',()=>{
  const h=harness(),a=ok(h.call('save',note())),b=ok(h.call('save',note()));
  const token=shared(h,{noteId:a.id}),get=()=>h.call('get',{id:a.id,token},'share');
  const view=ok(get());assert.equal('history' in view,false);assert.equal('folder' in view,false);
  assert.equal(h.call('get',{id:b.id,token},'share').status,404);
  assert.equal(h.call('list',{token},'share').status,403);
  const req=h.request('save',{...a,token,text:'Shared',folder:'Evil',pinned:true},'share');ok(h.send(req));
  const changed=ok(h.call('get',{id:a.id}));assert.equal(changed.folder,a.folder);assert.equal(changed.pinned,false);
  assert.equal(h.call('save',{...changed,token,id:randomUUID()},'share').status,403);
  assert.equal(h.call('backup',{token},'share').status,403);
  ok(h.call('shareRevoke',{shareId:token.split('.')[0]}));assert.equal(get().status,404);assert.equal(h.send(req).status,404);
  const replacement=shared(h,{noteId:a.id});assert.notEqual(replacement,token);ok(h.call('get',{id:a.id,token:replacement},'share'));
  assert.equal(JSON.stringify(h.state()).includes(token.split('.')[1]),false);
});

test('folder workspace membership, create/edit, revoke, atomic folder removal',()=>{
  const h=harness(),a=ok(h.call('save',note())),other=ok(h.call('save',{...note(),folder:'Khác'}));
  const token=shared(h,{folder:'Gia đình'});
  assert.equal(ok(h.call('list',{token},'share')).notes.length,1);
  assert.equal(h.call('get',{id:other.id,token},'share').status,404);
  const created=ok(h.call('save',{...note(),token,folder:'Outside'},'share'));assert.equal(ok(h.call('get',{id:created.id})).folder,'Gia đình');
  assert.equal(h.call('folderDelete',{folder:'Gia đình',deleteNotes:false,revision:String(h.state().revision)}).status,409);
  ok(h.call('shareRevoke',{shareId:token.split('.')[0]}));
  assert.equal(h.call('folderDelete',{folder:'Gia đình',deleteNotes:false,revision:'0'}).status,409);
  ok(h.call('folderDelete',{folder:'Gia đình',deleteNotes:false,revision:String(h.state().revision)}));
  assert.equal(ok(h.call('get',{id:a.id})).folder,'');assert.equal(h.call('list',{token},'share').status,404);
  ok(h.call('folderDelete',{folder:'Khác',deleteNotes:true,revision:String(h.state().revision)}));assert.equal(h.call('get',{id:other.id}).status,404);
});

for(const phase of ['create','beforeHead','afterHead'])test('crash injection at '+phase+'; retry resolves uncertainty without duplicates',()=>{
  const h=harness(),req=h.request('save',note()),before=h.state().revision;
  h.setFailure(phase);assert.equal(h.send(req).status,503);h.setFailure('');
  assert.equal(h.state().revision,before+(phase==='afterHead'?1:0));
  const result=ok(h.send(req));assert.equal(ok(h.send(req)).revision,result.revision);assert.equal(h.state().index.length,1);assert.equal(h.state().revision,before+1);
  assert.equal(h.send({...req,payload:{...req.payload,text:'different'}}).status,409);
});

test('fail closed: corrupted/missing HEAD, busy lock, invalid signature/time/idempotency',()=>{
  const h=harness(),req=h.request('save',note());
  assert.equal(h.send(req,{signature:'0'.repeat(64)}).status,401);
  assert.equal(h.send(req,{sentAt:0}).status,401);
  assert.equal(h.send({...req,issuedAt:Date.now()-86400001}).status,400);
  h.setLocked(true);assert.equal(h.send(req).status,503);h.setLocked(false);
  const head=JSON.parse(h.props.get('NOTES_HEAD'));h.files.get(head.id).data='{}';assert.equal(h.send(req).status,503);
  h.props.delete('NOTES_HEAD');assert.equal(h.send(req).status,503);assert.equal(h.files.size,1);
});

test('validation: UTF-8 size, duplicate checklist IDs, unknown operations, >5 history revisions',()=>{
  const h=harness();assert.equal(h.call('save',{...note(),text:'🧡'.repeat(250001)}).status,413);
  assert.equal(h.call('save',{...note(),checklist:[{id:'a',text:'a',checked:true},{id:'a',text:'b',checked:false}]}).status,400);
  assert.equal(h.call('__proto__').status,403);
  let n=ok(h.call('save',note()));for(let i=0;i<8;i++)n=ok(h.call('save',{...n,text:String(i)}));assert.equal(n.history.length,5);
});

test('HTTP adapter follows Google redirect with GET, stable retries and authenticated response',async()=>{
  const h=harness(),req=newRequest('save',note()),seen=[];let first=true;
  const fetcher=async(url,options)=>{
    seen.push({url,options});
    if(options.method==='POST'){
      const wire=h.context.doPost({postData:{contents:options.body}});
      // Simulate successful commit followed by lost network response.
      if(first){first=false;throw Error('network lost');}
      h.response=wire;return new Response(null,{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?user_content_key=fake'}});
    }
    return new Response(h.response,{headers:{'Content-Type':'application/json'}});
  };
  const client=createGasClient({url:'https://script.google.com/macros/s/fake/exec',key,fetcher,wait:async()=>{}});
  await client(req);assert.equal(h.state().index.length,1);assert.equal(h.state().revision,1);
  const posts=seen.filter(x=>x.options.method==='POST');assert.equal(JSON.parse(posts[0].options.body).request,JSON.parse(posts[1].options.body).request);
  const get=seen.at(-1);assert.equal(get.options.method,'GET');assert.equal(get.options.body,undefined);assert.equal(get.options.headers,undefined);
});

test('HTTP adapter refuses bad redirects, login HTML, forged response, handles timeout and BUSY retry',async()=>{
  const req=newRequest('list'),url='https://script.google.com/macros/s/fake/exec';
  for(const response of [new Response(null,{status:302,headers:{location:'https://evil.example/'}}),new Response('<html>login</html>',{headers:{'Content-Type':'text/html'}}),new Response(JSON.stringify({body:'{}',signature:'0'.repeat(64)}),{headers:{'Content-Type':'application/json'}})]) {
    await assert.rejects(createGasClient({url,key,fetcher:async()=>response})(req),e=>e.status===502);
  }
  let count=0;await assert.rejects(createGasClient({url,key,fetcher:async()=>{count++;throw new DOMException('timeout','TimeoutError');},wait:async()=>{}})(req),e=>e.status===503);assert.equal(count,2);
  const h=harness();h.setLocked(true);count=0;
  const fetcher=async(_,o)=>{count++;const data=h.context.doPost({postData:{contents:o.body}});h.setLocked(false);return new Response(data,{headers:{'Content-Type':'application/json'}});};
  await createGasClient({url,key,fetcher,wait:async()=>{}})(req);assert.equal(count,2);
});

test('Vercel adapter disabled on production, owner auth, same origin and share actor enforcement',async()=>{
  process.env.PORTAL_BASE_URL='https://preview.example';let auth=0,received;
  const res=()=>({setHeader(){},status(status){this.code=status;return this;},json(value){this.value=value;return this;}});
  const env={NOTES_GAS_PROTOTYPE_ENABLED:'true',NOTES_GAS_HMAC_KEY:key,VERCEL_ENV:'preview'};
  const handler=createPrototypeHandler({env,authorize:async()=>{auth++;},client:async r=>{received=r;return {notes:[]};}});
  const req={method:'POST',headers:{origin:'https://preview.example','content-type':'application/json'},body:newRequest('list')};
  let r=res();await handler(req,r);assert.equal(r.code,200);assert.equal(auth,1);assert.equal(received.actor,'owner');
  r=res();await handler({...req,body:{...req.body,token:'fake'}},r);assert.equal(received.actor,'share');assert.equal(auth,1);
  r=res();await handler({...req,headers:{...req.headers,origin:'https://evil.example'}},r);assert.equal(r.code,403);
  r=res();await createPrototypeHandler({env:{...env,VERCEL_ENV:'production'}})(req,r);assert.equal(r.code,404);
});

test('soft-deleted content can be restored with a fresh revision; an old save cannot resurrect it',()=>{
  const h=harness(),a=ok(h.call('save',note()));
  ok(h.call('delete',{id:a.id,revision:a.revision}));
  assert.equal(h.call('save',{...a,text:'stale'}).status,409);
  const tombstone=h.state().notes[a.id];
  const restored=ok(h.call('restore',{id:a.id,revision:tombstone.revision,historyIndex:0}));
  assert.equal(restored.text,a.text);assert.notEqual(restored.revision,a.revision);ok(h.call('get',{id:a.id}));
});

test('wire response capacity fails before commit; bounded receipts reject overload safely',()=>{
  const h=harness(),before=h.props.get('NOTES_HEAD');
  // Worst-case JSON escaping: accepted note size, rejected transport size.
  const out=h.call('save',{...note(),text:'\\'.repeat(999000),checklist:[]});
  assert.equal(out.status,413);assert.equal(h.props.get('NOTES_HEAD'),before);assert.equal(h.state().revision,0);
  const context=h.context,state=context.NotesCore.empty(),now=Date.now();
  for(let i=0;i<2000;i++)state.receipts[randomUUID()]={at:now,fingerprint:'fake',result:{}};
  const env={now:()=>now,hash,equal:(a,b)=>a===b,bytes:s=>Buffer.byteLength(s)};
  assert.throws(()=>context.NotesCore.execute(state,h.request('save',note()),env),e=>e.status===503);
  for(const r of Object.values(state.receipts))r.at=now-86400000-60001;
  const output=context.NotesCore.execute(state,h.request('save',note()),env);assert.equal(Object.keys(output.state.receipts).length,1);
  assert.equal(h.call('save',{...note(),checklist:[{id:42,text:'bad',checked:true}]}).status,400);
});

test('bounded durable journal has no note/token/secret content; health never mutates Notes',()=>{
  const h=harness(),secretText='PRIVATE NOTE MUST NOT BE LOGGED',req=h.request('save',{...note(),text:secretText});
  ok(h.send(req));const head=h.props.get('NOTES_HEAD'),files=h.files.size;
  const health=ok(h.call('health'));assert.equal(health.readVerified,true);assert.equal(health.revision,1);
  for(let i=0;i<35;i++)ok(h.call('logs'));
  const journal=ok(h.call('logs'));assert.ok(journal.events.length<=30);assert.ok(Buffer.byteLength(h.props.get('NOTES_OPS_LOG'))<=8000);
  const all=JSON.stringify(journal)+h.consoleRows.join('\n');assert.equal(all.includes(secretText),false);assert.equal(all.includes(req.payload.id),false);assert.equal(all.includes(key),false);
  assert.equal(h.props.get('NOTES_HEAD'),head);assert.equal(h.files.size,files);
  const token=shared(h,{noteId:req.payload.id});assert.equal(h.call('logs',{token},'share').status,403);assert.equal(h.call('health',{token},'share').status,403);
});

test('journal survives HEAD corruption; log failure cannot turn a committed save into a failure',()=>{
  const h=harness();h.setFailure('audit');const result=h.send(h.request('save',note()));assert.equal(result.ok,true);assert.equal(result.observability.persisted,false);assert.equal(h.state().revision,1);
  h.setFailure('');const head=JSON.parse(h.props.get('NOTES_HEAD'));h.files.get(head.id).data='corrupted';
  assert.equal(h.call('health').status,503);const journal=ok(h.call('logs'));assert.ok(journal.events.some(x=>x.code==='SNAPSHOT_CORRUPT'&&x.stage==='read'));
  assert.equal(JSON.parse(h.props.get('NOTES_LAST_ERROR')).code,'SNAPSHOT_CORRUPT');
});

test('bad authentication and lock contention cannot flood durable journal; editor check is idempotent',()=>{
  const h=harness(),req=h.request('list');const prior=h.props.get('NOTES_OPS_LOG');
  assert.equal(h.send(req,{signature:'0'.repeat(64)}).status,401);assert.equal(h.props.get('NOTES_OPS_LOG'),prior);
  h.setLocked(true);const busy=h.send(req);assert.equal(busy.status,503);assert.equal(busy.observability.persisted,false);assert.equal(h.props.get('NOTES_OPS_LOG'),prior);h.setLocked(false);
  const head=h.props.get('NOTES_HEAD');h.context.checkNotesPrototype();h.context.checkNotesPrototype();assert.equal(h.props.get('NOTES_HEAD'),head);
  assert.ok(h.consoleRows.some(x=>x.includes('readVerified')));
});

test('operational probe continues to fetch journal when health fails and returns no Note bodies',async()=>{
  const {inspect}=await import('../scripts/operations.mjs');const calls=[];
  const report=await inspect(async req=>{calls.push(req.op);if(req.op==='health')throw Object.assign(new Error('SNAPSHOT_CORRUPT'),{status:503});return {events:[{at:'2026-10-16T04:00:00.000Z',reference:'GAS-1234abcd',operation:'health',stage:'read',status:503,code:'SNAPSHOT_CORRUPT',durationMs:8,text:'DO NOT EXPORT',token:'DO NOT EXPORT'}]};});
  assert.deepEqual(calls,['health','logs']);assert.equal(report.healthy,false);assert.equal(report.journal.events.length,1);assert.equal(JSON.stringify(report).includes('DO NOT EXPORT'),false);
});

test('owner profiling preserves semantics and ping isolates storage-free path',()=>{
 const h=harness();const ping=h.call('ping',{profile:true});assert.equal(ping.result.pong,true);assert.ok(ping.observability.timings.serverTotal>=0);assert.equal('snapshotRead' in ping.observability.timings,false);
 const saved=h.call('save',{id:randomUUID(),title:'SYNTHETIC profile',text:'Tiếng Việt',profile:true});assert.equal(saved.ok,true);for(const label of ['snapshotCreate','snapshotReadback','headPublish','loadTotal','core','auditEnd'])assert.ok(saved.observability.timings[label]>=0,label);
 assert.equal(h.call('ping',{profile:true},'share').status,403);assert.equal(h.call('list').observability.timings,undefined);
 h.props.set('NOTES_HEAD','broken');assert.equal(h.call('ping',{profile:true}).ok,true);assert.equal(h.call('list',{profile:true}).ok,false);
});

test('transport profiling emits attempt stages without payload or URLs and observer errors are harmless',async()=>{
 const h=harness(),attempts=[],req=newRequest('ping',{profile:true});
 const result=await createGasClient({url:'https://script.google.com/macros/s/fake/exec',key,onAttempt:x=>attempts.push(x),fetcher:async(_,o)=>new Response(h.context.doPost({postData:{contents:o.body}}),{headers:{'content-type':'application/json'}})})(req);
 assert.equal(result.pong,true);assert.equal(attempts.length,1);assert.equal(attempts[0].ok,true);assert.ok(attempts[0].postMs>=0);assert.ok(attempts[0].bodyMs>=0);assert.equal(JSON.stringify(attempts).includes('http'),false);assert.equal(JSON.stringify(attempts).includes(key),false);
 await createGasClient({url:'https://script.google.com/macros/s/fake/exec',key,onAttempt:()=>{throw Error('observer');},fetcher:async(_,o)=>new Response(h.context.doPost({postData:{contents:o.body}}),{headers:{'content-type':'application/json'}})})(newRequest('ping'));
});
