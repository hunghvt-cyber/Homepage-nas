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

test('checklist previews contain real line breaks',async()=>{
 const h=harness();h.values['notes/a.json'].value.checklist=[{text:'todo',checked:false},{text:'done',checked:true}];
 assert.equal((await h.get()).notes[0].text,'body A\n☐ todo\n☑ done');
});
test('mutation during first rebuild retries with fresh metadata',async()=>{
 let listings=0,writes=0,result;
 const h=createNotesHandler({authorize:async()=>{},listMetadata:async()=>[entry('a',++listings===1?'old':'new')],load:async()=>note('a','A'),loadIndex:async()=>null,saveIndex:async()=>{writes++;}});
 await h({method:'GET',query:{}},{setHeader(){},status(n){assert.equal(n,200);return this;},json(v){result=v;}});
 assert.equal(listings,4);assert.equal(writes,1);assert.equal(result.notes[0].title,'A');
});
test('old builder cannot overwrite a newer index (conditional write)',async()=>{
 let current={value:{version:1,stamp:'old',notes:[]},etag:'old-etag'},writes=0,result;
 const h=createNotesHandler({authorize:async()=>{},listMetadata:async()=>[entry('a')],loadIndex:async()=>structuredClone(current),load:async()=>{current={value:{version:1,stamp:'new',notes:[]},etag:'new-etag'};return note('a','A');},saveIndex:async(_p,_v,etag,options)=>{assert.equal(etag,'old-etag');assert.equal(options,undefined);writes++;if(etag!==current.etag)throw Error('precondition');}});
 await h({method:'GET',query:{}},{setHeader(){},status(n){assert.equal(n,200);return this;},json(v){result=v;}});
 assert.equal(writes,1);assert.equal(current.etag,'new-etag');assert.equal(result.notes[0].title,'A');
});
test('cache storage failure does not fail the source list',async()=>{
 let result;
 const h=createNotesHandler({authorize:async()=>{},listMetadata:async()=>[entry('a')],load:async()=>note('a','A'),loadIndex:async()=>{throw Error('unavailable');},saveIndex:async(_p,_v,etag,opts)=>{assert.equal(etag,undefined);assert.equal(opts,undefined);throw Error('unavailable');}});
 await h({method:'GET',query:{}},{setHeader(){},status(n){assert.equal(n,200);return this;},json(v){result=v;}});
 assert.equal(result.notes[0].title,'A');
});
test('matching stamp with malformed rows rebuilds rather than serving corrupt data',async()=>{
 const h=harness();await h.get();
 h.setIndex({version:1,stamp:JSON.stringify([['notes/a.json','2026-10-15T00:00:00Z',120]]),notes:[null]});
 assert.equal((await h.get()).notes[0].title,'A');assert.equal(h.stats().reads,2);
});
