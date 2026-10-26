import test from 'node:test';
import assert from 'node:assert/strict';
import {createPasswordStore} from '../lib/password-store.js';
import {passwordVersion} from '../lib/security.js';
import {createAuthHandler} from '../api/auth.js';
Object.assign(process.env,{PORTAL_PASSWORD:'original-long-password',SESSION_PASSWORD:'test-session-secret-at-least-32-characters',PORTAL_BASE_URL:'https://homepage-nas.vercel.app'});
function fixture(){let value,locked=false,broken=false,loseAck=false;const store=createPasswordStore({connect:()=>({close(){},async request(method,file,headers,text){if(broken)return {status:500};if(method==='GET')return value?{status:200,text:value}:{status:404};if(method==='LOCK'){if(locked)return {status:423,headers:{}};locked=true;return {status:200,headers:{'lock-token':'<test-lock>'}};}if(method==='UNLOCK'){locked=false;return {status:204};}if(method==='PUT'){value=text;if(loseAck)throw Error('lost ack');return {status:204};}}})});return {store,get value(){return value;},set value(v){value=v;},set broken(v){broken=v;},set loseAck(v){loseAck=v;}};}
test('password rotation persists only a salted verifier, revokes old password/version, survives lost PUT acknowledgement',async()=>{
 const f=fixture(),old=await f.store.current();assert.equal(old.version,passwordVersion());f.loseAck=true;
 const next=await f.store.change(old.version,process.env.PORTAL_PASSWORD,'replacement-long-password');
 assert.notEqual(next.version,old.version);assert.equal(await f.store.matches('replacement-long-password',await f.store.current()),true);assert.equal(await f.store.matches(process.env.PORTAL_PASSWORD,await f.store.current()),false);assert.doesNotMatch(f.value,/replacement-long-password|original-long-password/);
 await assert.rejects(f.store.change(old.version,process.env.PORTAL_PASSWORD,'another-long-password'),{status:401});
});
test('wrong password, short/reused password, unavailable and tampered storage fail closed',async()=>{
 const f=fixture(),old=await f.store.current();await assert.rejects(f.store.change(old.version,'wrong','replacement-long-password'),{status:401});assert.equal(f.value,undefined);
 await assert.rejects(f.store.change(old.version,process.env.PORTAL_PASSWORD,'short'),{status:400});await assert.rejects(f.store.change(old.version,process.env.PORTAL_PASSWORD,process.env.PORTAL_PASSWORD),{status:400});
 await f.store.change(old.version,process.env.PORTAL_PASSWORD,'replacement-long-password');f.value=f.value.replace('"schema":1','"schema":2');await assert.rejects(f.store.current(),{status:503});f.broken=true;await assert.rejects(f.store.current(),{status:503});
});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(code){this.code=code;return this;},json(v){this.value=v;return this;}});
const cookie=r=>{const c=r.headers['set-cookie'];return (Array.isArray(c)?c[0]:c).split(';')[0];};
test('change API requires valid session, origin, current password and limiter; old cookies are rejected after change',async()=>{
 const f=fixture();let attempts=0;const h=createAuthHandler({passwordStore:f.store,limit:async()=>{attempts++;}});const headers={origin:process.env.PORTAL_BASE_URL,'content-type':'application/json'};
 const run=async(body,c='',origin=headers.origin)=>{const r=response();await h({method:'POST',headers:{...headers,origin,cookie:c},body},r);return r;};
 assert.equal((await run({action:'change-password',newPassword:'replacement-long-password',confirmPassword:'replacement-long-password'})).code,401);assert.equal(attempts,0);
 const login=await run({action:'login',password:process.env.PORTAL_PASSWORD});assert.equal(login.code,200);const c=cookie(login);
 assert.equal((await run({action:'change-password'},c,'https://evil.example')).code,403);
 assert.equal((await run({action:'change-password',currentPassword:'wrong',newPassword:'replacement-long-password',confirmPassword:'replacement-long-password'},c)).code,401);
 const changed=await run({action:'change-password',currentPassword:process.env.PORTAL_PASSWORD,newPassword:'replacement-long-password',confirmPassword:'replacement-long-password'},c);assert.equal(changed.code,200);assert.equal(changed.value.authenticated,false);assert.ok(cookie(changed).includes('__Host-homepage='));
 const check=response();await h({method:'GET',headers:{cookie:c}},check);assert.equal(check.value.authenticated,false);
 assert.equal((await run({action:'login',password:process.env.PORTAL_PASSWORD})).code,401);assert.equal((await run({action:'login',password:'replacement-long-password'})).code,200);
});
