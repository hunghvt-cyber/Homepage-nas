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
test('long multilingual messages and 20 turns are accepted with explicit bounds',()=>{
 assert.equal(validateMessages([{role:'user',text:'Thông tin tiếng Việt\n'.repeat(2000)}]).length,1);
 assert.equal(validateMessages([{role:'user',text:'x'.repeat(50000)}])[0].text.length,50000);
 assert.throws(()=>validateMessages([{role:'user',text:'x'.repeat(50001)}]));
 assert.equal(validateMessages(Array.from({length:39},(_,i)=>({role:i%2?'model':'user',text:'x'}))).length,39);
 const total=[{role:'user',text:'a'.repeat(50000)},{role:'model',text:'b'.repeat(16000)},{role:'user',text:'c'.repeat(50000)},{role:'model',text:'d'.repeat(16000)},{role:'user',text:'e'.repeat(50000)},{role:'model',text:'f'.repeat(16000)},{role:'user',text:'g'.repeat(2000)}];
 assert.equal(validateMessages(total).length,7);total[6].text+='g';assert.throws(()=>validateMessages(total));
});
test('model listing and selection are authenticated, signed and validated',async()=>{
 const requests=[];
 const handler=createChatHandler({authorize:()=>{},request:async(url,options)=>{
  const env=JSON.parse(options.body);assert.equal(env.signature,createHmac('sha256',process.env.EXPENSES_API_SECRET).update(env.payload).digest('hex'));
  const payload=JSON.parse(env.payload);requests.push(payload);
  return {ok:true,json:async()=>payload.operation==='models'?{ok:true,defaultModel:'gemini-test',models:['gemini-test']}:{ok:true,text:'Tôi là 1.5 Pro',requestedModel:'gemini-test',modelVersion:'gemini-test-002',secret:'private'}};
 }});
 const list=req();list.body={operation:'models'};const l=response();await handler(list,l);assert.equal(l.code,200);assert.deepEqual(l.data.models,['gemini-test']);
 const chat=req();chat.body.model='gemini-test';const r=response();await handler(chat,r);assert.equal(r.data.modelVersion,'gemini-test-002');assert.equal(requests[1].model,'gemini-test');assert.ok(!JSON.stringify(r.data).includes('private'));
 chat.body.model='../../secret';const bad=response();await handler(chat,bad);assert.equal(bad.code,400);assert.equal(requests.length,2);
});
test('upstream model failures do not retry or fallback',async()=>{
 for(const [data,status,pattern] of [[{reason:'MODEL_UNAVAILABLE'},400,/Mặc định/],[{reason:'HTTP',upstreamStatus:404},502,/404/],[{code:429},429,/hạn mức/],[{reason:'HTTP',upstreamStatus:503},502,/503/]]){
  let calls=0;const handler=createChatHandler({authorize:()=>{},request:async()=>{calls++;return {ok:true,json:async()=>({ok:false,...data})};}}),r=response();await handler(req(),r);assert.equal(r.code,status);assert.match(r.data.error,pattern);assert.equal(calls,1);
 }
});
test('chat denies unauthorized and cross-origin requests before calling Gemini',async()=>{
 let called=0;
 const denied=createChatHandler({authorize:()=>{const e=new Error('locked');e.status=401;throw e;},request:()=>{called++;}}),res=response();await denied(req(),res);assert.equal(res.code,401);
 const handler=createChatHandler({authorize:()=>{},request:()=>{called++;}}),other=req();other.headers.origin='https://other.example';const r=response();await handler(other,r);assert.equal(r.code,403);assert.equal(called,0);
});
test('chat validates turn order and history limits',()=>{
 for(const messages of [[],[{role:'model',text:'x'}],[{role:'user',text:''}],[{role:'user',text:'x'.repeat(50001)}],Array.from({length:43},(_,i)=>({role:i%2?'model':'user',text:'x'}))])assert.throws(()=>validateMessages(messages));
 assert.equal(validateMessages([{role:'user',text:' x '}])[0].text,'x');
});
test('chat signs full action/history and hides upstream details',async()=>{
 const handler=createChatHandler({authorize:()=>{},request:async(url,options)=>{
  assert.equal(url.hostname,'script.google.com');const envelope=JSON.parse(options.body),payload=JSON.parse(envelope.payload);
  assert.equal(payload.action,'homepage_chat');assert.equal(envelope.signature,createHmac('sha256',process.env.EXPENSES_API_SECRET).update(envelope.payload).digest('hex'));
  return {ok:true,json:async()=>({ok:true,text:'Xin chào'})};
 }}),r=response();await handler(req(),r);assert.equal(r.code,200);assert.deepEqual(r.data,{text:'Xin chào',requestedModel:null,modelVersion:null});
 const quota=createChatHandler({authorize:()=>{},request:async()=>({ok:true,json:async()=>({ok:false,code:429,key:'private'})})}),q=response();await quota(req(),q);assert.equal(q.code,429);assert.equal(JSON.stringify(q.data).includes('private'),false);
});

