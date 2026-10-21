// One-off operator task. Owner accepted all six Git originals on 2026-10-21.
// Credentials stay in the Homepage Vercel production environment.
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {migrateGuides} from './migrate-guides-koofr.mjs';
import {createGuideStore} from '../lib/guide-store.js';
import {guideInput} from '../lib/validation.js';
const input=readFileSync(new URL('../content/guides.json',import.meta.url),'utf8');
export const approvedDigest=createHash('sha256').update(input).digest('hex');
export async function initializeGuidesOnce({env=process.env,migrate=migrateGuides,store}={}) {
  if(!env.KOOFR_GUIDES_IMPORT_SHA256)return {skipped:true};
  if(env.VERCEL_ENV!=='production' || env.VERCEL_PROJECT_ID!=='prj_3CCmGVbfaymDVoO66d6MPU1CQ1nw' ||
     env.KOOFR_GUIDES_READY==='true' || env.KOOFR_GUIDES_IMPORT_SHA256!==approvedDigest)throw Error('IMPORT_GUARD_REJECTED');
  const originals=JSON.parse(input);
  const result=await migrate({version:1,source:'owner-verified-originals',sourceVerified:true,
    guides:originals.map(guide=>({guide,history:[],updatedAt:null}))});
  if(result.verified!==6 || !result.readyToEnable)throw Error('IMPORT_INCOMPLETE');
  const destination=store??createGuideStore({slugs:originals.map(g=>g.slug),ready:()=>true});
  const checks=[];
  for(const original of originals){
    const record=await destination.read(original.slug);
    const expected=guideInput({...original,details:original.details??[]},original);
    if(JSON.stringify(record.guide)!==JSON.stringify(expected))throw Error('IMPORT_CONTENT_MISMATCH');
    checks.push({slug:original.slug,sha256:record.sha256});
  }
  // Save the same content once, then reopen: no visible content or care dates change.
  const slug=originals[0].slug,before=await destination.read(slug),operationId=randomUUID();
  const saved=await destination.save(slug,before.guide,before.revision,operationId);
  const reopened=await destination.read(slug);
  if(saved.revision===before.revision || reopened.revision!==saved.revision ||
     JSON.stringify(reopened.guide)!==JSON.stringify(before.guide))throw Error('SAVE_REOPEN_FAILED');
  const retried=await destination.save(slug,before.guide,before.revision,operationId);
  if(retried.revision!==saved.revision)throw Error('SAVE_RETRY_FAILED');
  return {verified:checks.length,source:'owner-verified-originals',approvedDigest,checks,
    liveSaveReopen:true,idempotentRetry:true,visibleContentUnchanged:true,readyToEnable:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log('GUIDE_INITIALIZATION '+JSON.stringify(await initializeGuidesOnce()));}
  catch(error){
    const allowed=['IMPORT_GUARD_REJECTED','IMPORT_INCOMPLETE','IMPORT_CONTENT_MISMATCH','SAVE_REOPEN_FAILED','SAVE_RETRY_FAILED',
      'VERIFIED_COMPLETE_EXPORT_REQUIRED','MISSING_OR_DUPLICATE_GUIDE','INVALID_HISTORY','EXPORT_TOO_LARGE',
      'COLLECTION_UNAVAILABLE','LOCK_UNAVAILABLE','DESTINATION_NOT_EMPTY','READBACK_FAILED_DO_NOT_ENABLE'];
    console.error('GUIDE_INITIALIZATION_FAILED '+(allowed.includes(error.message)?error.message:'PROVIDER_UNAVAILABLE')+'; keep READY=false');
    process.exitCode=1;
  }
}
