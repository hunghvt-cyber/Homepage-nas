import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotesAuthHandler} from '../api/notes-auth.js';
test('service requires independent secret before accessing password store; exposes only version and match result',async()=>{
 let reads=0,attempts=0;const key='a'.repeat(64),handler=createNotesAuthHandler({env:()=>({VERCEL_ENV:'production',NOTES_AUTH_SERVICE_KEY:key}),passwordStore:{current:async()=>{reads++;return {version:'v1',hash:'never-return'};},matches:async password=>password==='correct'},limit:async()=>{attempts++;}});
 const call=async(body,auth='Bearer '+key)=>{let status,result;const res={setHeader(){},status(s){status=s;return this;},json(b){result=b;}};await handler({method:'POST',headers:{authorization:auth,'content-type':'application/json'},body},res);return {status,result};};
 assert.equal((await call({action:'version'},'bad')).status,401);assert.equal(reads,0);
 assert.deepEqual((await call({action:'version'})).result,{version:'v1'});assert.equal(attempts,0);
 assert.deepEqual((await call({action:'verify',password:'wrong',clientIp:'test'})).result,{version:'v1',valid:false});assert.equal(attempts,1);
 assert.equal((await call({action:'verify',password:'correct',clientIp:'test'})).result.valid,true);
 assert.equal((await call({action:'change-password'})).status,400);
});
