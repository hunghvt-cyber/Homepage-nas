import test from 'node:test';
import assert from 'node:assert/strict';
import { OAuth2Client } from 'google-auth-library';
import { authorizeClaims, sameOrigin, verifyGoogle, OWNER, HttpError } from '../lib/security.js';
import { guideInput, noteInput } from '../lib/validation.js';
import { createNotesHandler } from '../api/notes.js';
const response = () => ({headers: {}, setHeader(k,v){this.headers[k]=v;}, status(s){this.code=s; return this;}, json(v){this.value=v; return this;}});
process.env.PORTAL_BASE_URL = 'https://homepage-nas.vercel.app';
process.env.GOOGLE_CLIENT_ID = 'test-client';
test('only exact verified Gmail is authorized, case insensitive', () => {
  assert.equal(authorizeClaims({sub:'123',email:OWNER.toUpperCase(),email_verified:true}).email, OWNER);
  for(const p of [{sub:'123',email:OWNER,email_verified:false},{sub:'123',email:'other@gmail.com',email_verified:true},{email:OWNER,email_verified:true}]) assert.throws(() => authorizeClaims(p), {status:403});
});
test('Google verification uses configured audience and validates nonce; invalid tokens fail closed', async t => {
  const mock = t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async args => {assert.equal(args.audience,'test-client'); return {getPayload:()=>({sub:'123',email:OWNER,email_verified:true,nonce:'challenge'})};});
  assert.equal((await verifyGoogle('credential','challenge')).email, OWNER);
  await assert.rejects(verifyGoogle('credential','wrong'),{status:401});
  mock.mock.mockImplementation(async () => {throw new Error('bad signature');});
  await assert.rejects(verifyGoogle('forged','challenge'),{status:401});
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
test('Notes keep code verbatim, preserve history and reject stale device writes', async () => {
  const records = new Map(); let version=0;
  const h = createNotesHandler({authorize:async()=>({email:OWNER}),load:async p=>structuredClone(records.get(p)||null),persist:async(p,value,etag)=>{if(records.has(p)&&records.get(p).etag!==etag) throw new HttpError(409,'conflict'); const result={etag:String(++version)}; records.set(p,{value:structuredClone(value),...result}); return result;},enumerate:async()=>[...records.keys()]});
  const run=async b=>{const res=response();await h({method:'POST',query:{},headers:{origin:process.env.PORTAL_BASE_URL,'content-type':'application/json'},body:b},res);return res;};
  const code='\tMsgBox, "<script> $HOME `n"\r\n  return\n';
  const first=await run({action:'save',title:'AHK',text:code}); assert.equal(first.code,200);assert.equal(first.value.text,code);
  const next=await run({action:'save',id:first.value.id,revision:first.value.revision,title:'AHK 2',text:'new'});assert.equal(next.value.history[0].text,code);
  const stale=await run({action:'save',id:first.value.id,revision:first.value.revision,title:'stale',text:'lost'});assert.equal(stale.code,409);
  const deleted=await run({action:'delete',id:next.value.id,revision:next.value.revision});assert.equal(deleted.code,200);
  const res=response();await h({method:'GET',query:{id:next.value.id}},res);assert.equal(res.code,404);
});
test('Notes byte limit handles Unicode; QR slug and original images stay fixed', () => {
  assert.throws(()=>noteInput({title:'x',text:'ệ'.repeat(400000)}),{status:413});
  const original={slug:'bep',images:[{src:'/images/test.webp'}]};
  const edited=guideInput({slug:'bep',title:'Bếp',area:'Bếp',summary:'',steps:['Bật'],details:[],images:[]},original);
  assert.deepEqual(edited.images,original.images);
  assert.throws(()=>guideInput({...edited,slug:'other'},original),{status:400});
});
