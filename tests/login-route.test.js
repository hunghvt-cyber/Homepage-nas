import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import auth,{createAuthHandler} from '../api/auth.js';

process.env.PORTAL_BASE_URL='https://homepage-nas.vercel.app';
process.env.PORTAL_PASSWORD='synthetic-test-password';
process.env.SESSION_PASSWORD='synthetic-session-key-at-least-32-characters';
process.env.PORTAL_PRIVATE_BLOB_TOKEN='test-only-not-used';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(n){this.code=n;return this;},json(v){this.data=v;return this;}});
const request=(action,password=process.env.PORTAL_PASSWORD)=>({method:'POST',headers:{origin:process.env.PORTAL_BASE_URL,'content-type':'application/json'},body:{action,password}});
test('dedicated login counts attempts before password verification and retains encrypted sessions',async()=>{
 let calls=0;const handler=createAuthHandler({loginOnly:true,limit:async()=>{calls++;}});
 let res=response();await handler(request('login','wrong'),res);assert.equal(res.code,401);assert.equal(calls,1);
 res=response();await handler(request('login'),res);assert.equal(res.code,200);assert.equal(calls,2);assert.equal(res.data.authenticated,true);
 assert.ok(res.headers['set-cookie']);
 res=response();await handler(request('logout'),res);assert.equal(res.code,400);assert.equal(calls,2);
 res=response();await handler({...request('login'),method:'GET'},res);assert.equal(res.code,405);assert.equal(calls,2);
 res=response();await handler({...request('login'),headers:{origin:'https://other.example','content-type':'application/json'}},res);assert.equal(res.code,403);assert.equal(calls,2);
});
test('old auth login is closed; session checks/logout bypass attempt counting',async()=>{
 let res=response();await auth(request('login'),res);assert.equal(res.code,410);
 const handler=createAuthHandler({allowLogin:false,limit:async()=>{throw Error('must not count');}});
 res=response();await handler({...request('logout'),method:'GET'},res);assert.equal(res.code,200);assert.equal(res.data.authenticated,false);
 res=response();await handler(request('logout'),res);assert.equal(res.code,200);assert.equal(res.data.authenticated,false);
});
test('login remains fail closed when the retained durable limiter is unavailable',async()=>{
 const handler=createAuthHandler({loginOnly:true,limit:async()=>{throw Error('storage unavailable');}}),res=response();
 await handler(request('login'),res);assert.equal(res.code,503);assert.equal(res.data.authenticated,undefined);assert.equal(res.headers['set-cookie'],undefined);
});
test('browser uses dedicated login and renders WAF non-JSON 429 without a JSON parsing error',async()=>{
 const dom=new JSDOM('<span id="account-state"></span><button id="account-login"></button><button id="account-logout"></button><form id="password-form"><input id="account-password"><button id="password-submit"></button></form><p id="account-message"></p>',{url:process.env.PORTAL_BASE_URL,runScripts:'outside-only'}),w=dom.window,calls=[];
 w.fetch=async(url,options)=>{calls.push({url,options});if(!options.method)return {ok:true,json:async()=>({authenticated:false})};return {ok:false,status:429,json:async()=>{throw Error('HTML from WAF');}};};
 w.eval(readFileSync('public/account.js','utf8'));await new Promise(r=>setImmediate(r));
 w.document.getElementById('account-password').value='synthetic';w.document.getElementById('password-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
 for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));
 assert.equal(calls[1].url,'/api/login');assert.match(w.document.getElementById('account-message').textContent,/quá nhiều lần/);assert.equal(w.document.getElementById('password-submit').disabled,false);dom.window.close();
});
