import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migrateGuides} from '../scripts/migrate-guides-koofr.mjs';
import {initializeGuidesOnce,approvedDigest} from '../scripts/initialize-guides-once.mjs';
const originals=JSON.parse(readFileSync('content/guides.json','utf8'));
const manifest={version:1,source:'owner-verified-originals',sourceVerified:true,guides:originals.map(guide=>({guide,history:[]}))};
function davHarness(existing=false,corrupt=false){
 const records=new Map(existing?[[originals[0].slug+'.json','existing']]:[]);let writes=0,unlocks=0;
 return {records,get writes(){return writes;},get unlocks(){return unlocks;},connect:()=>({close(){},async request(method,file,headers,text){
  if(method==='MKCOL')return {status:201};
  if(method==='LOCK')return {status:200,headers:{'lock-token':'<test-lock>'}};
  if(method==='UNLOCK'){unlocks++;return {status:204};}
  if(method==='GET')return {status:records.has(file)?200:404,text:corrupt?'{}':records.get(file)};
  if(method==='PUT'){assert.equal(headers['If-None-Match'],'*');assert.equal(headers.If,'(<test-lock>)');assert.equal(records.has(file),false);records.set(file,text);writes++;return {status:201};}
  throw Error('unexpected method');
 }})};
}
test('guide initialization requires exact approval, production project and disabled READY',async()=>{
 let calls=0;const migrate=async()=>{calls++;throw Error('should not run');};
 assert.deepEqual(await initializeGuidesOnce({env:{},migrate}),{skipped:true});
 const env={VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_3CCmGVbfaymDVoO66d6MPU1CQ1nw',KOOFR_GUIDES_READY:'false',KOOFR_GUIDES_IMPORT_SHA256:approvedDigest};
 for(const bad of [{VERCEL_ENV:'preview'},{VERCEL_PROJECT_ID:'notes'},{KOOFR_GUIDES_READY:'true'},{KOOFR_GUIDES_IMPORT_SHA256:'wrong'}])
  await assert.rejects(initializeGuidesOnce({env:{...env,...bad},migrate}),/IMPORT_GUARD_REJECTED/);
 assert.equal(calls,0);
});
test('migration writes and verifies every accepted guide, never overwrites existing data',async()=>{
 const h=davHarness();assert.deepEqual(await migrateGuides(manifest,{connect:h.connect}),{verified:originals.length,readyToEnable:true});
 assert.equal(h.writes,originals.length);assert.equal(h.unlocks,1);
 const occupied=davHarness(true);await assert.rejects(migrateGuides(manifest,{connect:occupied.connect}),/DESTINATION_NOT_EMPTY/);
 assert.equal(occupied.writes,0);assert.equal(occupied.unlocks,1);
});
test('migration rejects unverified/incomplete manifests before connection and rejects corrupt readback',async()=>{
 const connect=()=>{throw Error('must not connect');};
 for(const bad of [{...manifest,sourceVerified:false},{...manifest,guides:manifest.guides.slice(1)}])
  await assert.rejects(migrateGuides(bad,{connect}),/VERIFIED_COMPLETE_EXPORT_REQUIRED/);
 const h=davHarness(false,true);await assert.rejects(migrateGuides(manifest,{connect:h.connect}),/READBACK_FAILED_DO_NOT_ENABLE/);
 assert.equal(h.writes,1);assert.equal(h.unlocks,1);
});
