import test from 'node:test';
import assert from 'node:assert/strict';
import { noteInput } from '../lib/validation.js';
import { createNotesHandler } from '../api/notes.js';

test('optional folder preserves compatibility with legacy notes', () => {
  assert.equal(noteInput({title:'Old',text:'body',pinned:false}).folder,'');
  assert.equal(noteInput({title:'New',text:'body',folder:' Công việc '}).folder,'Công việc');
  assert.throws(()=>noteInput({title:'X',text:'',folder:'x'.repeat(81)}),/quá dài/);
});
test('notes list returns folder and legacy notes use empty folder',async()=>{
 const id1='00000000-0000-0000-0000-000000000001',id2='00000000-0000-0000-0000-000000000002';
 const data={['notes/'+id1+'.json']:{id:id1,title:'Legacy',pinned:false,updatedAt:'2026-01-01T00:00:00Z'},['notes/'+id2+'.json']:{id:id2,title:'New',folder:'Work',pinned:false,updatedAt:'2026-01-02T00:00:00Z'}};
 const handler=createNotesHandler({authorize:async()=>{},enumerate:async()=>Object.keys(data),load:async path=>({value:data[path],etag:'x'}),observe:()=>{}});
 const req={method:'GET',query:{}};let result;
 const res={setHeader(){},status(n){assert.equal(n,200);return this},json(v){result=v;return this}};
 await handler(req,res);
 assert.deepEqual(result.notes.map(n=>n.folder),['Work','']);
});

test('folder removal can preserve notes or soft-delete them, leaving other folders untouched',async()=>{
 const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003'];
 const data=Object.fromEntries(ids.map((id,i)=>['notes/'+id+'.json',{id,title:'N'+i,text:'body',folder:i===2?'Other':'Work',updatedAt:'2026-01-01T00:00:00Z'}]));
 const changes=[];
 const handler=createNotesHandler({authorize:async()=>{},enumerate:async()=>Object.keys(data),load:async path=>({value:data[path],etag:'x'}),persistNote:async(path,value)=>{data[path]=value;changes.push(path);return {etag:'new'};},observe:()=>{}});
 process.env.PORTAL_BASE_URL='https://homepage-nas.vercel.app';
 const call=async deleteNotes=>{
  let status,output;
  await handler({method:'POST',headers:{origin:'https://homepage-nas.vercel.app','content-type':'application/json'},body:{action:'folderDelete',folder:'Work',deleteNotes}}, {setHeader(){},status(n){status=n;return this},json(v){output=v;return this}});
  assert.equal(status,200);return output;
 };
 assert.equal((await call(false)).changed,2);
 assert.equal(data['notes/'+ids[0]+'.json'].folder,'');
 assert.equal(data['notes/'+ids[1]+'.json'].deleted,undefined);
 assert.equal(data['notes/'+ids[2]+'.json'].folder,'Other');
 data['notes/'+ids[0]+'.json'].folder='Work';data['notes/'+ids[1]+'.json'].folder='Work';
 assert.equal((await call(true)).changed,2);
 assert.equal(data['notes/'+ids[0]+'.json'].deleted,true);
 assert.equal(data['notes/'+ids[1]+'.json'].deleted,true);
 assert.equal(data['notes/'+ids[2]+'.json'].deleted,undefined);
 assert.equal((await call(true)).changed,0);
 assert.equal(changes.length,4);
});
