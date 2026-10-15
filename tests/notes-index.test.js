import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotesHandler} from '../api/notes.js';
const entry=(name,time='2026-10-15T00:00:00Z')=>({pathname:'notes/'+name+'.json',uploadedAt:time,size:120});
const note=(id,title)=>({value:{id,title,text:'body '+title,updatedAt:'2026-10-15T00:00:00Z',folder:'',checklist:[]}});
function harness(){
 let entries=[entry('a')], index=null, reads=0, writes=0;
 const values={'notes/a.json':note('a','A')};
 const handler=createNotesHandler({authorize:async()=>{},listMetadata:async()=>entries,load:async p=>{reads++;return values[p]||null;},loadIndex:async()=>index,saveIndex:async(_p,value)=>{writes++;index={value};}});
 const get=async()=>{let result;const res={setHeader(){},status(n){this.code=n;return this;},json(v){result=v;return v;}};await handler({method:'GET',query:{}},res);assert.equal(res.code,200);return result;};
 return {get,values,setEntries:e=>entries=e,stats:()=>({reads,writes}),setIndex:v=>index={value:v}};
}
test('first request builds index, second reads no note bodies',async()=>{
 const h=harness();assert.equal((await h.get()).notes[0].title,'A');assert.equal(h.stats().reads,1);
 assert.equal((await h.get()).notes[0].title,'A');assert.equal(h.stats().reads,1);
});
test('changed metadata invalidates index and refreshes content',async()=>{
 const h=harness();await h.get();h.values['notes/a.json']=note('a','Updated');h.setEntries([entry('a','2026-10-15T00:01:00Z')]);
 assert.equal((await h.get()).notes[0].title,'Updated');assert.equal(h.stats().reads,2);
});
test('corrupted index falls back to authoritative reads',async()=>{
 const h=harness();h.setIndex({version:1,stamp:'invalid',notes:[{title:'stale'}]});
 assert.equal((await h.get()).notes[0].title,'A');
});
