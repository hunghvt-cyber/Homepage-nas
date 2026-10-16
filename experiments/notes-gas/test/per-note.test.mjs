import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {harness,hash} from './harness.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(){const h=harness(),original=h.props.get('NOTES_HEAD');const call=(op,p={},actor='owner')=>h.call(op,{...p,perNote:true},actor);assert.equal(call('shardInit').ok,true);return {...h,call,original};}
const note=(id=randomUUID(),folder='work')=>({id,title:'SYNTHETIC tiếng Việt 日本語 😀',text:'Nội dung đầy đủ '+ '💡'.repeat(200),folder,pinned:false,checklist:[{id:'one',text:'việc cần làm',checked:true}]});
const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.result;};
test('per-note commits isolate original store; reads one body and index survives partial hydration',()=>{
 const h=setup(),a=ok(h.call('save',note())),b=ok(h.call('save',note()));
 const head=JSON.parse(h.props.get('NOTES_SHARD_HEAD')),m=JSON.parse(h.files.get(head.id).data),oldRef=m.records[b.id].ref.id;
 const c=ok(h.call('save',{...a,title:'SYNTHETIC changed'}));assert.notEqual(c.revision,a.revision);
 const after=JSON.parse(h.files.get(JSON.parse(h.props.get('NOTES_SHARD_HEAD')).id).data);assert.equal(after.records[b.id].ref.id,oldRef);
 assert.equal(ok(h.call('get',{id:b.id})).text,b.text);assert.equal(ok(h.call('list')).notes.length,2);assert.equal(h.props.get('NOTES_HEAD'),h.original);
});
test('same-note stale update loses, different-note updates both succeed, replay uses old immutable receipt',()=>{
 const h=setup(),a=ok(h.call('save',note())),b=ok(h.call('save',note()));
 const req=h.request('save',{...a,title:'SYNTHETIC A1',perNote:true});const a1=ok(h.send(req));
 assert.equal(h.call('save',{...a,title:'SYNTHETIC stale'}).status,409);
 ok(h.call('save',{...b,title:'SYNTHETIC B1'}));ok(h.call('save',{...a1,title:'SYNTHETIC A2'}));
 const pointer=h.props.get('NOTES_SHARD_HEAD');assert.deepEqual(ok(h.send(req)),a1);assert.equal(h.props.get('NOTES_SHARD_HEAD'),pointer);
});
test('failed candidate or HEAD publication never exposes partial folder mutation; committed timeout retries once',()=>{
 const h=setup(),a=ok(h.call('save',note())),b=ok(h.call('save',note()));
 const before=h.props.get('NOTES_SHARD_HEAD');h.setFailure('beforeHead');assert.equal(h.call('folderDelete',{folder:'work',revision:'2',deleteNotes:false}).status,503);h.setFailure('');
 assert.equal(h.props.get('NOTES_SHARD_HEAD'),before);assert.equal(ok(h.call('get',{id:a.id})).folder,'work');assert.equal(ok(h.call('get',{id:b.id})).folder,'work');
 const req=h.request('save',{...a,title:'SYNTHETIC uncertain',perNote:true});h.setFailure('afterHead');assert.equal(h.send(req).status,503);h.setFailure('');const committed=h.props.get('NOTES_SHARD_HEAD');ok(h.send(req));assert.equal(h.props.get('NOTES_SHARD_HEAD'),committed);
 h.setFailure('manifest');assert.equal(h.call('save',note()).status,503);h.setFailure('');assert.equal(h.props.get('NOTES_SHARD_HEAD'),committed);
 h.setFailure('create');assert.equal(h.call('save',note()).status,503);h.setFailure('');assert.equal(h.props.get('NOTES_SHARD_HEAD'),committed);
});
test('workspace ACL is live, revoke precedes receipt, folder move changes scope; history restore and delete',()=>{
 const h=setup(),a=ok(h.call('save',note())),secret='a'.repeat(64),shareId='c'.repeat(32),token=shareId+'.'+secret;
 ok(h.call('shareCreate',{folder:'work',shareId,tokenHash:hash(secret)}));
 const req=h.request('save',{...a,title:'SYNTHETIC shared',token,perNote:true},'share');const changed=ok(h.send(req));assert.equal(changed.history,undefined);
 ok(h.call('shareRevoke',{shareId}));assert.equal(h.send(req).status,404);
 const n=ok(h.call('get',{id:a.id}));const restored=ok(h.call('restore',{id:a.id,revision:n.revision,historyIndex:0}));assert.equal(restored.title,a.title);
 ok(h.call('delete',{id:a.id,revision:restored.revision}));assert.equal(h.call('get',{id:a.id}).status,404);
});
test('export/restore to empty recovery namespace preserves revision, history, revoked ACL and idempotency',()=>{
 const h=setup(),req=h.request('save',{...note(),perNote:true}),a=ok(h.send(req));ok(h.call('save',{...a,title:'SYNTHETIC newer'}));
 const backup=ok(h.call('shardExport')),original=h.props.get('NOTES_SHARD_HEAD');
 ok(h.call('shardRestore',{shardStore:'recovery',backup}));ok(h.call('shardRestore',{shardStore:'recovery',backup}));assert.equal(h.call('shardRestore',{shardStore:'recovery',backup:{...backup,revision:3}}).status,409);
 assert.deepEqual(ok(h.call('shardExport',{shardStore:'recovery'})),backup);assert.equal(h.props.get('NOTES_SHARD_HEAD'),original);
 const replay={...req,payload:{...req.payload,shardStore:'recovery'}};assert.deepEqual(ok(h.send(replay)),a);
});
test('100 then 500 simulated notes preserve full text search and index; 501st fails; seed replay does not commit',()=>{
 const h=setup(),first=h.request('shardSeed',{perNote:true,notes:[{...note(),text:'Unicode 😀'},{...note(),text:'Unicode 😀'}]}),before=h.props.get('NOTES_HEAD');ok(h.send(first));const head=h.props.get('NOTES_SHARD_HEAD');ok(h.send(first));assert.equal(h.props.get('NOTES_SHARD_HEAD'),head);
 for(let i=2;i<500;){const size=Math.min(i<100?100-i:500-i,5),batch=Array.from({length:size},()=>({...note(),text:'Nội dung đầy đủ 😀'}));ok(h.call('shardSeed',{notes:batch}));i+=size;if(i===100)assert.equal(ok(h.call('list')).notes.length,100);}
 assert.equal(ok(h.call('list')).notes.length,500);assert.equal(h.call('save',note()).status,413);assert.equal(ok(h.call('search',{query:'đầy đủ'})).notes.length,498);assert.equal(h.props.get('NOTES_HEAD'),before);
});
test('corrupt body fails detail and full export; shared actor cannot init/seed/restore/export',()=>{
 const h=setup(),a=ok(h.call('save',note())),m=JSON.parse(h.files.get(JSON.parse(h.props.get('NOTES_SHARD_HEAD')).id).data);h.files.get(m.records[a.id].ref.id).data='{}';
 assert.equal(h.call('get',{id:a.id}).status,503);assert.equal(h.call('shardExport').status,503);
 for(const op of ['shardInit','shardSeed','shardRestore','shardExport','health'])assert.equal(h.call(op,{},'share').status,403);
});
