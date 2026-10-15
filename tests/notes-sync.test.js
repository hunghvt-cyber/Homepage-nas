import test from 'node:test';
import assert from 'node:assert/strict';
import {notesList,listResponse} from '../lib/notes-list.js';
import {HttpError} from '../lib/security.js';
const entry=(id,etag)=>({pathname:'notes/'+id+'.json',uploadedAt:'same time',size:120,etag});
const row=(id,etag,extra={})=>({etag,value:{id,title:id,text:'body',pinned:false,folder:'Work',updatedAt:'2026-10-15T00:00:00Z',...extra}});
test('ETag catches same-size same-time edits; rebuild reads only changed entries; delta removes deleted notes',async()=>{
 let entries=[entry('a','a1'),entry('b','b1')],index=null,reads=[];
 const records=new Map([['notes/a.json',row('a','a1')],['notes/b.json',row('b','b1')]]);
 const deps={listMetadata:async()=>entries,loadIndex:async()=>index,load:async p=>{reads.push(p);return records.get(p);},saveIndex:async(_p,value)=>{index={value,etag:'index-etag'};}};
 const before=await notesList(deps);assert.equal(reads.length,2);
 reads=[];assert.deepEqual(await notesList(deps),before);assert.deepEqual(reads,[]);
 entries=[entry('a','a2'),entry('b','b1')];records.set('notes/a.json',row('a','a2',{text:'edited',folder:'Other',checklist:[{text:'done',checked:true}]}));
 const after=await notesList(deps);assert.deepEqual(reads,['notes/a.json']);
 const delta=listResponse(after,JSON.stringify(before.map(n=>[n.id,n.revision])));assert.deepEqual(delta.removed,[]);assert.equal(delta.notes.length,1);assert.equal(delta.notes[0].text,'edited\n☑ done');assert.equal(delta.notes[0].folder,'Other');
 records.set('notes/b.json',row('b','b2',{deleted:true}));entries=[entry('a','a2'),entry('b','b2')];
 const deleted=await notesList(deps);const result=listResponse(deleted,JSON.stringify(after.map(n=>[n.id,n.revision])));assert.deepEqual(result.removed,['b']);assert.deepEqual(result.notes,[]);
 assert.deepEqual(listResponse(deleted,JSON.stringify(deleted.map(n=>[n.id,n.revision]))),{delta:true,notes:[],removed:[]});
});
test('unstable listing fails without publishing a mixed index',async()=>{
 let n=0,writes=0;
 await assert.rejects(notesList({listMetadata:async()=>[entry('a',String(++n))],loadIndex:async()=>null,load:async()=>row('a','different'),saveIndex:async()=>{writes++;}}),{status:503});
 assert.equal(writes,0);
});
test('delta validates clients and authorization happens before reading metadata',async()=>{
 for(const known of ['no JSON','{}','[null]','[["a", 3]]','x'.repeat(6001)])assert.throws(()=>listResponse([],known),{status:400});
 const {createNotesHandler}=await import('../api/notes.js');let touched=false;
 const handler=createNotesHandler({authorize:async()=>{throw new HttpError(401,'locked');},listMetadata:async()=>{touched=true;return [];},observe:()=>{}});
 const r={setHeader(){},status(n){this.code=n;return this;},json(v){this.value=v;}};
 await handler({method:'GET',query:{known:'[]'}},r);assert.equal(r.code,401);assert.equal(touched,false);
});
test('two simultaneous owner saves from one revision: exactly one wins',async()=>{
 const {createNotesHandler}=await import('../api/notes.js');const id='12345678-1234-1234-1234-123456789abc';
 let current=row(id,'r1'),release;const bothRead=new Promise(r=>release=r);let reads=0,writes=0;
 const handler=createNotesHandler({authorize:async()=>{},load:async()=>{const snapshot=structuredClone(current);if(++reads===2)release();await bothRead;return snapshot;},persistNote:async(_p,value,etag)=>{if(etag!==current.etag)throw new HttpError(409,'conflict');current={value,etag:'r2'};writes++;return current;},observe:()=>{}});
 process.env.PORTAL_BASE_URL='https://homepage-nas.vercel.app';
 const run=async text=>{const r={setHeader(){},status(n){this.code=n;return this;},json(v){this.value=v;}};await handler({method:'POST',headers:{origin:process.env.PORTAL_BASE_URL,'content-type':'application/json'},body:{action:'save',id,revision:'r1',title:'N',text}},r);return r;};
 const results=await Promise.all([run('A'),run('B')]);assert.deepEqual(results.map(r=>r.code).sort(),[200,409]);assert.equal(writes,1);assert.equal(current.value.history[0].text,'body');
});
test('missing metadata ETags bypass cached summaries and read authoritative bodies each time',async()=>{
 let index=null,version='v1',reads=0;
 const deps={listMetadata:async()=>[{pathname:'notes/a.json',uploadedAt:'same time',size:120}],loadIndex:async()=>index,load:async()=>{reads++;return row('a',version,{text:version});},saveIndex:async(_p,value)=>{index={value,etag:'index'};}};
 assert.equal((await notesList(deps))[0].text,'v1');version='v2';assert.equal((await notesList(deps))[0].text,'v2');assert.equal(reads,2);
});
