import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createGuideStore,createGuideDav,seedGuide} from '../lib/guide-store.js';
import {createGuidesHandler} from '../api/guides.js';
const original=JSON.parse(readFileSync('content/guides.json','utf8'))[1];
function harness() {
 let value=seedGuide(original),locked=false,writes=0,loseAck=false,expire=false,broken=false;
 const store=createGuideStore({slugs:[original.slug],ready:()=>true,connect:()=>({close(){},async request(method,file,headers,text){
  if(method==='LOCK'){if(locked)return {status:423,headers:{}};locked=true;return {status:200,headers:{'lock-token':'<test-lock>'}};}
  if(method==='UNLOCK'){locked=false;return {status:204};}
  if(method==='GET')return {status:broken?503:200,text:JSON.stringify(value)};
  if(method==='PUT'){
   assert.equal(headers.If,'(<test-lock>)');assert.equal(file,original.slug+'.json');
   if(expire)return {status:412};assert.equal(locked,true);value=JSON.parse(text);writes++;
   if(loseAck)throw Error('ack lost');return {status:204};
  }
  throw Error('unexpected');
 }})});
 return {store,get value(){return value;},get writes(){return writes;},loseAck(){loseAck=true;},expire(){expire=true;},break(){broken=true;}};
}
test('Koofr save preserves bounded history and rejects stale, missing, and concurrent revisions',async()=>{
 const h=harness(),revision=h.value.revision;
 const results=await Promise.allSettled(['A','B'].map(title=>h.store.save(original.slug,{...original,title},revision,randomUUID())));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(h.writes,1);
 assert.equal(h.value.history[0].guide.title,original.title);
 await assert.rejects(h.store.save(original.slug,original,revision,randomUUID()),{status:409});
 await assert.rejects(h.store.save(original.slug,original,undefined,randomUUID()),{status:409});
 for(let i=0;i<8;i++)await h.store.save(original.slug,{...original,title:String(i)},h.value.revision,randomUUID());
 assert.equal(h.value.history.length,5);
});
test('lost PUT acknowledgement is reconciled; retry cannot duplicate or overwrite a newer save',async()=>{
 const h=harness(),revision=h.value.revision,id=randomUUID(),guide={...original,title:'A'};h.loseAck();
 await h.store.save(original.slug,guide,revision,id);assert.equal(h.writes,1);
 await h.store.save(original.slug,guide,revision,id);assert.equal(h.writes,1);
 await h.store.save(original.slug,{...guide,title:'B'},h.value.revision,randomUUID());
 const replay=await h.store.save(original.slug,guide,revision,id);assert.equal(replay.guide.title,'B');assert.equal(h.writes,2);
 await assert.rejects(h.store.save(original.slug,{...guide,title:'different'},revision,id),{status:409});
});
test('expired lock, corrupt/missing provider response and unverified setup fail closed',async()=>{
 const h=harness();h.expire();await assert.rejects(h.store.save(original.slug,original,h.value.revision,randomUUID()),{status:409});assert.equal(h.writes,0);
 h.break();await assert.rejects(h.store.read(original.slug),{status:503});
 const off=createGuideStore({slugs:[original.slug],ready:()=>false,connect:()=>{throw Error('must not connect');}});
 await assert.rejects(off.read(original.slug),{status:503});
 for(const status of [401,404,429,503,302,200]) {
  const bad=createGuideStore({slugs:[original.slug],ready:()=>true,connect:()=>({close(){},request:async()=>({status,text:'{}'})})});
  await assert.rejects(bad.read(original.slug),{status:503});
 }
});
test('DAV config rejects preview, wrong project and traversal before touching the network',()=>{
 const env={KOOFR_GUIDES_USER:'test',KOOFR_GUIDES_APP_PASSWORD:'test',KOOFR_GUIDES_NAMESPACE:'Homepage-Guides-'+randomUUID()};
 for(const bad of [{...env,VERCEL_ENV:'preview'},{...env,VERCEL_PROJECT_ID:'notes-project'},{...env,KOOFR_GUIDES_NAMESPACE:'../Notes'}])assert.throws(()=>createGuideDav(bad),{status:503});
 const dav=createGuideDav(env);assert.throws(()=>dav.request('GET','../notes.json'),{status:503});dav.close();
});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.value=v;return this;}});
test('QR GET is public; storage errors show an explicit read-only original and writes require owner',async()=>{
 let auth=0,writes=0;
 const handler=createGuidesHandler({authorize:async()=>{auth++;throw Object.assign(Error('login'),{status:401});},storage:{read:async()=>{throw Error('private provider message');},save:async()=>writes++}});
 const r=response();await handler({method:'GET',query:{slug:original.slug}},r);
 assert.equal(r.code,200);assert.equal(auth,0);assert.equal(r.value.source,'original');assert.equal(r.value.editable,false);assert.match(r.value.warning,/chưa mới nhất/);assert.equal(r.value.guide.slug,original.slug);
 assert.doesNotMatch(JSON.stringify(r.value),/private provider/);
 const denied=response();await handler({method:'POST',query:{slug:original.slug}},denied);assert.equal(denied.code,401);assert.equal(writes,0);
 const invalid=response();await handler({method:'GET',query:{slug:'../notes'}},invalid);assert.equal(invalid.code,404);
});
test('public Koofr read exposes neither history nor receipts and retains original images',async()=>{
 const value=seedGuide({...original,title:'Updated'});value.history=[{private:'history'}];value.receipts=[{private:'receipt'}];
 const r=response();await createGuidesHandler({storage:{read:async()=>value}})({method:'GET',query:{slug:original.slug}},r);
 assert.equal(r.code,200);assert.equal(r.value.editable,true);assert.equal(r.value.source,'koofr');assert.equal(r.value.guide.title,'Updated');
 assert.deepEqual(r.value.guide.images,original.images);assert.doesNotMatch(JSON.stringify(r.value),/private|receipts|history/);
});
