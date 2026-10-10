import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createExpensesHandler } from '../api/expenses.js';
import { HttpError } from '../lib/security.js';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(value){this.value=value;return this;}});
test('expense data requires shared session before reaching source',async()=>{
 let called=false;const h=createExpensesHandler({authorize:async()=>{throw new HttpError(401,'locked');},request:async()=>{called=true;}}),r=response();await h({method:'GET',query:{month:'2026-10'}},r);assert.equal(r.code,401);assert.equal(called,false);assert.equal(r.headers['Cache-Control'],'no-store');
});
test('expense proxy signs requests and returns only chart fields',async()=>{
 process.env.EXPENSES_API_URL='https://script.google.com/macros/s/test/exec';process.env.EXPENSES_API_SECRET='test-only-secret-more-than-32-characters';
 let envelope;const h=createExpensesHandler({authorize:async()=>{},request:async(url,options)=>{envelope=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true,month:'2026-10',measuredAt:'2026-10-10T00:00:00Z',transactions:[{day:'2026-10-10',amount:35000,type:'ChiTieu',category:'Ăn uống',payer:'A',payerId:'1',description:'private original message'}]})};}}),r=response();await h({method:'GET',query:{month:'2026-10'}},r);assert.equal(r.code,200);assert.equal(envelope.signature,createHmac('sha256',process.env.EXPENSES_API_SECRET).update(envelope.payload).digest('hex'));assert.equal(r.value.transactions[0].description,undefined);
 const bad=response();await h({method:'GET',query:{month:'2026-13'}},bad);assert.equal(bad.code,400);
});
