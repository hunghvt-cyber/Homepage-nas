import test from 'node:test';
import assert from 'node:assert/strict';
import { sameOrigin, passwordVersion, verifyPassword, HttpError } from '../lib/security.js';
import { guideInput, noteInput } from '../lib/validation.js';
import { createNotesHandler } from '../api/notes.js';
const response = () => ({headers: {}, setHeader(k,v){this.headers[k]=v;}, status(s){this.code=s; return this;}, json(v){this.value=v; return this;}});
process.env.PORTAL_BASE_URL = 'https://homepage-nas.vercel.app';
process.env.GOOGLE_CLIENT_ID = 'test-client';
test('shared password rejects wrong, missing and oversized input; rotation changes sessions', () => {
 process.env.PORTAL_PASSWORD='test-password-long';const old=passwordVersion();assert.equal(verifyPassword('test-password-long'),true);for(const v of ['wrong',null,'x'.repeat(257)])assert.equal(verifyPassword(v),false);
 process.env.PORTAL_PASSWORD='replacement-password';assert.notEqual(passwordVersion(),old);
});
test('cross-origin writes and non-JSON writes are rejected', () => {
  assert.throws(()=>sameOrigin({headers:{origin:'https://evil.example','content-type':'application/json'}}),{status:403});
  assert.throws(()=>sameOrigin({headers:{origin:process.env.PORTAL_BASE_URL,'content-type':'text/plain'}}),{status:415});
});
test('anonymous GET and POST cannot reach Notes storage', async () => {
  let touched = false;
  const h = createNotesHandler({authorize:async()=>{throw new HttpError(401,'login');},load:async()=>{touched=true;},enumerate:async()=>{touched=true;}});
  for(const method of ['GET','POST']) {const res=response(); await h({method,query:{},headers:{}},res); assert.equal(res.code,401); assert.equal(res.headers['Cache-Control'],'no-store');}
  assert.equal(touched,false);
});
test('Notes byte limit handles Unicode; QR slug and original images stay fixed', () => {
  assert.throws(()=>noteInput({title:'x',text:'ệ'.repeat(400000)}),{status:413});
  const original={slug:'bep',images:[{src:'/images/test.webp'}]};
  const edited=guideInput({slug:'bep',title:'Bếp',area:'Bếp',summary:'',steps:['Bật'],details:[],images:[]},original);
  assert.deepEqual(edited.images,original.images);
  assert.throws(()=>guideInput({...edited,slug:'other'},original),{status:400});
});
test('encrypted session grants access and password rotation revokes the same cookie',async()=>{
 const {sealData}=await import('iron-session');const {owner}=await import('../lib/security.js');
 process.env.SESSION_PASSWORD='a-strong-test-session-secret-more-than-32-characters';process.env.PORTAL_PASSWORD='session-test-password';
 const sealed=await sealData({authVersion:passwordVersion()},{password:process.env.SESSION_PASSWORD,ttl:7*86400});const req={headers:{cookie:'__Host-homepage='+sealed}};const res=response();res.getHeader=k=>res.headers[k];
 await owner(req,res);process.env.PORTAL_PASSWORD='rotated-session-password';await assert.rejects(owner(req,res),{status:401});
 await assert.rejects(owner({headers:{cookie:'__Host-homepage=forged'}},res),{status:401});
});

test('Notes failure reference identifies the stage without logging private inputs or errors',async()=>{
 const events=[],id='12345678-1234-1234-1234-123456789abc',privateValue='private-test-value-do-not-log';
 const h=createNotesHandler({authorize:async()=>{},load:async()=>null,persistNote:async()=>{throw new Error(privateValue);},observe:event=>events.push(event),saveOnly:true}),r=response();
 await h({method:'POST',query:{},headers:{origin:process.env.PORTAL_BASE_URL,'content-type':'application/json',cookie:privateValue},body:{action:'save',id,title:privateValue,text:privateValue,revision:privateValue}},r);
 assert.equal(r.code,503);assert.match(r.value.reference,/^N4-[0-9a-f]{8}$/);assert.equal(r.headers['X-Notes-Request'],r.value.reference);
 assert.deepEqual(events,[{writer:'revision-v5',reference:r.value.reference,operation:'save',stage:'persist',status:503}]);
 assert.doesNotMatch(JSON.stringify({events,response:r.value}),new RegExp(privateValue+'|'+id));
});
