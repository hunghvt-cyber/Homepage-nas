import test from 'node:test';
import assert from 'node:assert/strict';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import { createNotesHandler } from '../api/notes.js';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(value){this.value=value;return this;}});
const id='12345678-1234-1234-1234-123456789abc', path='notes/'+id+'.json';
process.env.PORTAL_BASE_URL='https://homepage-nas.vercel.app';
// This is a fake test credential. MockAgent blocks every real network request.
process.env.PORTAL_PRIVATE_BLOB_TOKEN='vercel_blob_rw_teststore_fake';
test('real Blob SDK sends unconditional private writes for two stale manual clients',async()=>{
 const previous=getGlobalDispatcher(),agent=new MockAgent();agent.disableNetConnect();setGlobalDispatcher(agent);
 let current={etag:'old',value:{id,title:'server',text:'original',history:[],updatedAt:'2026-10-10T00:00:00Z'}}, writes=0;
 try{
  agent.get('https://vercel.com').intercept({path:'/api/blob/?pathname='+encodeURIComponent(path),method:'PUT'}).reply(200,options=>{
   const h=new Headers(options.headers);assert.equal(h.get('x-allow-overwrite'),'1');assert.equal(h.get('x-vercel-blob-access'),'private');assert.equal(h.has('x-if-match'),false);assert.equal(h.has('if-match'),false);assert.equal(h.has('if-none-match'),false);
   const value=JSON.parse(options.body);current={value,etag:'version-'+(++writes)};
   return {url:'https://teststore.private.blob.vercel-storage.com/'+path,pathname:path,etag:current.etag,contentType:'application/json'};
  }).times(2);
  const h=createNotesHandler({authorize:async()=>{},saveOnly:true,load:async()=>structuredClone(current)});
  for(const text of ['device A','device B']){const r=response();await h({method:'POST',headers:{origin:process.env.PORTAL_BASE_URL,'content-type':'application/json'},query:{},body:{action:'save',id,revision:'stale-revision',title:'note',text}},r);assert.equal(r.code,200,JSON.stringify(r.value));assert.equal(r.headers['X-Notes-Writer'],'manual-v4');assert.equal(r.value.text,text);}
  assert.equal(current.value.history[0].text,'device A');assert.equal(writes,2);agent.assertNoPendingInterceptors();
 }finally{setGlobalDispatcher(previous);await agent.close();}
});
test('Blob rejects an unconditional write: return storage error, never blame another device',async()=>{
 const previous=getGlobalDispatcher(),agent=new MockAgent();agent.disableNetConnect();setGlobalDispatcher(agent);
 try{
  agent.get('https://vercel.com').intercept({path:'/api/blob/?pathname='+encodeURIComponent(path),method:'PUT'}).reply(412,{error:{code:'precondition_failed',message:'precondition'}});
  const h=createNotesHandler({authorize:async()=>{},saveOnly:true,load:async()=>null}),r=response();await h({method:'POST',headers:{origin:process.env.PORTAL_BASE_URL,'content-type':'application/json'},query:{},body:{action:'save',id,title:'note',text:'keep draft'}},r);assert.equal(r.code,503);assert.match(r.value.error,/NOTE_STORE_REJECTED/);assert.doesNotMatch(r.value.error,/thiết bị khác/);agent.assertNoPendingInterceptors();
 }finally{setGlobalDispatcher(previous);await agent.close();}
});
