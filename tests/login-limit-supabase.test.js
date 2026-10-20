import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseLimiter} from '../lib/login-limit-supabase.js';
import {createAuthHandler} from '../api/auth.js';

const env={LOGIN_LIMIT_SUPABASE_URL:'https://test-project.supabase.co',LOGIN_LIMIT_SUPABASE_KEY:'test-publishable-key',LOGIN_LIMIT_TOKEN:'a'.repeat(64),SESSION_PASSWORD:'test-session-at-least-32-characters'};
test('Supabase limiter sends only a keyed IP hash and accepts an explicit allowance',async()=>{
 let sent;
 const limit=createSupabaseLimiter({env,request:async(url,options)=>{sent={url:String(url),options};return {ok:true,json:async()=>({allowed:true,retry_after:300})};}});
 await limit({headers:{'x-vercel-forwarded-for':'192.0.2.123, 198.51.100.1'}});
 const body=JSON.parse(sent.options.body);
 assert.match(body.p_ip_hash,/^[a-f0-9]{64}$/);
 assert.doesNotMatch(sent.options.body,/192\.0\.2\.123|198\.51\.100\.1/);
 assert.equal(body.p_token,env.LOGIN_LIMIT_TOKEN);
 assert.equal(sent.options.redirect,'error');
 assert.match(sent.url,/\/rest\/v1\/rpc\/homepage_consume_login_attempt$/);
});
test('quota denial is 429 and unavailable, malformed or missing configuration fails closed',async()=>{
 const req={headers:{}};
 await assert.rejects(createSupabaseLimiter({env,request:async()=>({ok:true,json:async()=>({allowed:false,retry_after:123})})})(req),{status:429});
 for(const request of [async()=>{throw new Error('network');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({allowed:'true',retry_after:123})}),async()=>({ok:true,json:async()=>({allowed:true,retry_after:901})})]){
  await assert.rejects(createSupabaseLimiter({env,request})(req),{status:503});
 }
 let called=false;
 await assert.rejects(createSupabaseLimiter({env:{...env,LOGIN_LIMIT_TOKEN:''},request:async()=>{called=true;}})(req),{status:503});
 assert.equal(called,false);
});
test('Supabase allowance retains encrypted login cookie, session GET, and logout; limiter failure never authenticates',async()=>{
 Object.assign(process.env,{PORTAL_PASSWORD:'test-correct-long-password',SESSION_PASSWORD:env.SESSION_PASSWORD,PORTAL_BASE_URL:'https://homepage-nas.vercel.app'});
 delete process.env.PORTAL_PRIVATE_BLOB_TOKEN;
 const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(code){this.code=code;return this;},json(value){this.value=value;return this;}});
 const req={method:'POST',headers:{origin:process.env.PORTAL_BASE_URL,'content-type':'application/json'},body:{action:'login',password:process.env.PORTAL_PASSWORD}};
 let calls=0;
 const limit=createSupabaseLimiter({env,request:async()=>{calls++;return {ok:true,json:async()=>({allowed:true,retry_after:200})};}});
 const handler=createAuthHandler({limit}),login=res();await handler(req,login);
 assert.equal(login.code,200);assert.equal(login.value.authenticated,true);assert.equal(calls,1);
 const cookies=login.headers['set-cookie'];const cookie=(Array.isArray(cookies)?cookies[0]:cookies).split(';')[0];
 const check=res();await handler({method:'GET',headers:{cookie}},check);assert.equal(check.value.authenticated,true);assert.equal(calls,1);
 const logout=res();await handler({...req,headers:{...req.headers,cookie},body:{action:'logout'}},logout);assert.equal(logout.value.authenticated,false);assert.equal(calls,1);
 const denied=res();await createAuthHandler({limit:createSupabaseLimiter({env,request:async()=>({ok:false})})})(req,denied);
 assert.equal(denied.code,503);assert.notEqual(denied.value.authenticated,true);assert.equal(denied.headers['set-cookie'],undefined);
});

