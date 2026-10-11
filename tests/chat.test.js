import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createChatHandler,validateMessages} from '../api/chat.js';
import {createHmac} from 'node:crypto';
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};}
const origin='https://homepage-nas.vercel.app';
process.env.PORTAL_BASE_URL=origin;
process.env.EXPENSES_API_URL='https://script.google.com/macros/s/example/exec';
process.env.EXPENSES_API_SECRET='x'.repeat(32);
const req=()=>({method:'POST',headers:{origin,'content-type':'application/json'},body:{messages:[{role:'user',text:'Chào'}]}});
test('chat denies unauthorized and cross-origin requests before calling Gemini',async()=>{
 let called=0;
 const denied=createChatHandler({authorize:()=>{const e=new Error('locked');e.status=401;throw e;},request:()=>{called++;}}),res=response();await denied(req(),res);assert.equal(res.code,401);
 const handler=createChatHandler({authorize:()=>{},request:()=>{called++;}}),other=req();other.headers.origin='https://other.example';const r=response();await handler(other,r);assert.equal(r.code,403);assert.equal(called,0);
});
test('chat validates turn order and history limits',()=>{
 for(const messages of [[],[{role:'model',text:'x'}],[{role:'user',text:''}],[{role:'user',text:'x'.repeat(4001)}],Array.from({length:23},(_,i)=>({role:i%2?'model':'user',text:'x'}))])assert.throws(()=>validateMessages(messages));
 assert.equal(validateMessages([{role:'user',text:' x '}])[0].text,'x');
});
test('chat signs full action/history and hides upstream details',async()=>{
 const handler=createChatHandler({authorize:()=>{},request:async(url,options)=>{
  assert.equal(url.hostname,'script.google.com');const envelope=JSON.parse(options.body),payload=JSON.parse(envelope.payload);
  assert.equal(payload.action,'homepage_chat');assert.equal(envelope.signature,createHmac('sha256',process.env.EXPENSES_API_SECRET).update(envelope.payload).digest('hex'));
  return {ok:true,json:async()=>({ok:true,text:'Xin chào'})};
 }}),r=response();await handler(req(),r);assert.equal(r.code,200);assert.deepEqual(r.data,{text:'Xin chào'});
 const quota=createChatHandler({authorize:()=>{},request:async()=>({ok:true,json:async()=>({ok:false,code:429,key:'private'})})}),q=response();await quota(req(),q);assert.equal(q.code,429);assert.equal(JSON.stringify(q.data).includes('private'),false);
});
