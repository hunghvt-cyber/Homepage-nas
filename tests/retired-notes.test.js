import test from 'node:test';
import assert from 'node:assert/strict';
import retired from '../lib/retired-notes.js';
import {retireNotes,isRetiredNotePath} from '../scripts/retire-notes-blob.mjs';
import {readFileSync,existsSync} from 'node:fs';

test('all deployed legacy endpoints stop before storage, for reads and writes', async()=>{
 for(const path of ['notes','notes-save','note-share','shared-note','shared-folder']) {
  assert.equal((await import('../api/'+path+'.js')).default,retired);
  for(const method of ['GET','POST','DELETE']) {
   const res={setHeader(){},status(n){assert.equal(n,410);return this;},json(body){assert.equal(body.code,'NOTES_RETIRED');}};
   retired({method},res);
  }
 }
});
test('cleanup allows only retired Notes paths and validates the entire inventory before deleting',async()=>{
 for(const path of ['guides/camera.json','login-attempts/global.json','notes/../guides/x.json','indexes/other.json']) assert.equal(isRetiredNotePath(path),false);
 const env={VERCEL_PROJECT_ID:'prj_3CCmGVbfaymDVoO66d6MPU1CQ1nw',VERCEL_ENV:'production',PORTAL_PRIVATE_BLOB_TOKEN:'test-only',NOTES_BLOB_CLEANUP:'DELETE_RETIRED_NOTES_20261018'};
 let removed=0;
 await assert.rejects(retireNotes({env,log(){},enumerate:async({prefix})=>({blobs:prefix==='shares/'?[{pathname:'shares/unexpected',url:'invalid'}]:[{pathname:'notes/12345678-1234-1234-1234-123456789abc.json',url:'valid'}]}),remove:async()=>removed++}),/UNEXPECTED_PATH/);
 assert.equal(removed,0);
 await assert.rejects(retireNotes({env:{...env,VERCEL_ENV:'preview'}}),/WRONG_PROJECT/);
 let rows=[{pathname:'notes/12345678-1234-1234-1234-123456789abc.json',url:'synthetic'}];
 const enumerate=async({prefix})=>({blobs:rows.filter(r=>r.pathname.startsWith(prefix))});
 assert.equal((await retireNotes({env:{...env,NOTES_BLOB_CLEANUP:''},enumerate,remove:async()=>removed++,log(){}})).deleted,0);
 assert.equal(removed,0);
 const result=await retireNotes({env,enumerate,remove:async(url)=>{assert.equal(url,'synthetic');rows=[];removed++;},log(){}});
 assert.equal(result.remaining,0);assert.equal(removed,1);
});
test('built pages expose Koofr and retire old shares without forwarding their tokens',()=>{
 const page=readFileSync('dist/notes/index.html','utf8');
 assert.match(page,/location.replace\("https:\/\/hunghvt-notes.vercel.app\/"\)/);
 assert.doesNotMatch(page,/location.search|location.hash|account.js|notes.js/);
 for(const path of ['share','workspace']) assert.doesNotMatch(readFileSync('dist/'+path+'/index.html','utf8'),/location.replace|textarea|account.js/);
 for(const name of ['notes','shared-note','workspace','checklist']) assert.equal(existsSync('dist/'+name+'.js'),false);
});
