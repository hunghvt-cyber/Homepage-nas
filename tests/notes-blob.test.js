import test from 'node:test';
import assert from 'node:assert/strict';
import {MockAgent,setGlobalDispatcher,getGlobalDispatcher} from 'undici';
import {createNotesHandler} from '../api/notes.js';
const id='12345678-1234-1234-1234-123456789abc',path='notes/'+id+'.json';
const headers={origin:'https://homepage-nas.vercel.app','content-type':'application/json'};
process.env.PORTAL_BASE_URL=headers.origin;
process.env.PORTAL_PRIVATE_BLOB_TOKEN='vercel_blob_rw_teststore_fake';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.value=v;return this;}});
const request=async(h,b)=>{const r=response();await h({method:'POST',headers,query:{},body:b},r);return r;};
test('real SDK conditionally saves: stale and missing revisions never write, takeover cannot bypass',async()=>{
 const previous=getGlobalDispatcher(),agent=new MockAgent();agent.disableNetConnect();setGlobalDispatcher(agent);
 let current={etag:'old',value:{id,title:'server',text:'original',updatedAt:'2026-10-10T00:00:00Z'}},writes=0;
 try{
  agent.get('https://vercel.com').intercept({path:'/api/blob/?pathname='+encodeURIComponent(path),method:'PUT'}).reply(200,options=>{
   const h=new Headers(options.headers);assert.equal(h.get('x-if-match'),'old');assert.equal(h.get('x-allow-overwrite'),'1');assert.equal(h.get('x-vercel-blob-access'),'private');
   current={value:JSON.parse(options.body),etag:'new'};writes++;
   return {url:'https://teststore.private.blob.vercel-storage.com/'+path,pathname:path,etag:'new',contentType:'application/json'};
  });
  const h=createNotesHandler({authorize:async()=>{},load:async()=>structuredClone(current),observe:()=>{}});
  assert.equal((await request(h,{action:'save',id,revision:'old',title:'A',text:'device A'})).code,200);
  for(const revision of ['old',undefined])assert.equal((await request(h,{action:'save',id,revision,takeover:true,title:'B',text:'device B'})).code,409);
  assert.equal(current.value.text,'device A');assert.equal(current.value.history[0].text,'original');assert.equal(writes,1);agent.assertNoPendingInterceptors();
 }finally{setGlobalDispatcher(previous);await agent.close();}
});
test('atomic SDK precondition failure returns 409 if another device wins between read and write',async()=>{
 const previous=getGlobalDispatcher(),agent=new MockAgent();agent.disableNetConnect();setGlobalDispatcher(agent);
 try{
  agent.get('https://vercel.com').intercept({path:'/api/blob/?pathname='+encodeURIComponent(path),method:'PUT'}).reply(412,{error:{code:'precondition_failed',message:'precondition'}});
  const h=createNotesHandler({authorize:async()=>{},load:async()=>({etag:'old',value:{id,title:'old',text:'old',updatedAt:'2026-10-10T00:00:00Z'}}),observe:()=>{}});
  const r=await request(h,{action:'save',id,revision:'old',title:'B',text:'draft'});assert.equal(r.code,409);agent.assertNoPendingInterceptors();
 }finally{setGlobalDispatcher(previous);await agent.close();}
});
test('soft-delete uses CAS on latest server copy, retries without writing and never revives',async()=>{
 let current={etag:'latest',value:{id,title:'latest',text:'latest server',updatedAt:'2026-10-10T00:00:00Z'}},writes=0;
 const h=createNotesHandler({authorize:async()=>{},load:async()=>structuredClone(current),enumerate:async()=>[path],persistNote:async(_p,value,etag)=>{assert.equal(etag,'latest');current={value,etag:'deleted'};writes++;return current;},observe:()=>{}});
 for(let i=0;i<2;i++)assert.equal((await request(h,{action:'delete',id})).code,200);
 assert.equal(writes,1);assert.equal(current.value.text,'latest server');assert.equal(current.value.deleted,true);
 assert.equal((await request(h,{action:'save',id,revision:'latest',title:'revive',text:'draft'})).code,409);
});
test('detail revalidation sends If-None-Match and a 304 skips the content body',async()=>{
 const {read}=await import('../lib/storage.js');
 const previous=getGlobalDispatcher(),agent=new MockAgent();agent.disableNetConnect();setGlobalDispatcher(agent);
 try{
  agent.get('https://teststore.private.blob.vercel-storage.com').intercept({path:'/'+path+'?cache=0',method:'GET'}).reply(options=>{
   const h=new Headers(options.headers);assert.equal(h.get('if-none-match'),'same-etag');
   return {statusCode:304,data:'',responseOptions:{headers:{etag:'same-etag'}}};
  });
  assert.deepEqual(await read(path,'same-etag'),{notModified:true,etag:'same-etag'});agent.assertNoPendingInterceptors();
 }finally{setGlobalDispatcher(previous);await agent.close();}
});
test('real SDK roundtrip after reopening compressed content uses canonical CAS tokens and rejects a truly stale writer',async()=>{
 const previous=getGlobalDispatcher(),agent=new MockAgent();agent.disableNetConnect();setGlobalDispatcher(agent);
 let current={id,title:'Long note',text:'original long text',history:[],updatedAt:'2026-10-15T00:00:00Z'},version='original',writes=0;
 try{
  agent.get('https://teststore.private.blob.vercel-storage.com').intercept({path:'/'+path+'?cache=0',method:'GET'}).reply(()=>({statusCode:200,data:JSON.stringify(current),responseOptions:{headers:{etag:'W/"'+version+'"','content-type':'application/json'}}})).times(3);
  agent.get('https://vercel.com').intercept({path:'/api/blob/?pathname='+encodeURIComponent(path),method:'PUT'}).reply(200,options=>{
   const h=new Headers(options.headers);assert.equal(h.get('x-if-match'),version);assert.equal(h.get('x-allow-overwrite'),'1');
   current=JSON.parse(options.body);version='saved-'+(++writes);
   return {url:'https://teststore.private.blob.vercel-storage.com/'+path,pathname:path,etag:version,contentType:'application/json'};
  }).times(2);
  const handler=createNotesHandler({authorize:async()=>{},observe:()=>{}});
  const first=await request(handler,{action:'save',id,revision:'W/"original"',title:'Long note',text:'first update'});assert.equal(first.code,200,JSON.stringify(first.value));
  const next=await request(handler,{action:'save',id,revision:first.value.revision,title:'Long note',text:'second update'});assert.equal(next.code,200,JSON.stringify(next.value));
  const stale=await request(handler,{action:'save',id,revision:'W/"original"',title:'Stale',text:'must not overwrite'});assert.equal(stale.code,409);
  assert.equal(writes,2);assert.equal(current.text,'second update');assert.equal(current.history[0].text,'first update');agent.assertNoPendingInterceptors();
 }finally{setGlobalDispatcher(previous);await agent.close();}
});
