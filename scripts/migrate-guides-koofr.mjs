// Run once with a verified six-guide export, from a trusted production environment.
// No Blob credentials or SDK. Never initializes from GitHub silently.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createGuideDav,seedGuide} from '../lib/guide-store.js';
import {guideInput} from '../lib/validation.js';
const originals=JSON.parse(readFileSync(new URL('../content/guides.json',import.meta.url),'utf8'));
export async function migrateGuides(manifest,{connect=()=>createGuideDav()}={}) {
 if(manifest?.version!==1 || manifest.sourceVerified!==true || !['blob-export','owner-verified-originals'].includes(manifest.source) ||
    !Array.isArray(manifest.guides) || manifest.guides.length!==originals.length)throw Error('VERIFIED_COMPLETE_EXPORT_REQUIRED');
 const seeds=originals.map(original=>{
  const rows=manifest.guides.filter(r=>r.guide?.slug===original.slug);
  if(rows.length!==1)throw Error('MISSING_OR_DUPLICATE_GUIDE');const row=rows[0];
  if(!Array.isArray(row.history)||row.history.length>5)throw Error('INVALID_HISTORY');
  const guide=guideInput({...row.guide,details:row.guide.details??[]},original);
  const history=row.history.map(h=>({guide:guideInput({...h.guide,details:h.guide.details??[]},original),updatedAt:h.updatedAt??null}));
  const seed=seedGuide(guide,history,row.updatedAt??null);
  if(Buffer.byteLength(JSON.stringify(seed))>3000000)throw Error('EXPORT_TOO_LARGE');
  return seed;
 });
 const dav=connect();let token;
 try {
  const mkdir=await dav.request('MKCOL');if(![201,405].includes(mkdir.status))throw Error('COLLECTION_UNAVAILABLE');
  const lock=await dav.request('LOCK','',{'Depth':'infinity','Timeout':'Second-120','Content-Type':'application/xml'},
   '<?xml version="1.0"?><D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>');
  token=lock.headers?.['lock-token'];if(![200,201].includes(lock.status)||!/^<[^<>\r\n]{1,500}>$/.test(token||'')){token=undefined;throw Error('LOCK_UNAVAILABLE');}
  // Preflight all files: never overwrite any prior import or a live edit.
  for(const seed of seeds){const r=await dav.request('GET',seed.guide.slug+'.json');if(r.status!==404)throw Error('DESTINATION_NOT_EMPTY');}
  for(const seed of seeds){
   const file=seed.guide.slug+'.json',text=JSON.stringify(seed);
   await dav.request('PUT',file,{'If':'('+token+')','If-None-Match':'*','Content-Type':'application/json'},text);
   const r=await dav.request('GET',file);if(r.status!==200||r.text!==text)throw Error('READBACK_FAILED_DO_NOT_ENABLE');
  }
  return {verified:seeds.length,readyToEnable:true};
 }finally{if(token){try{await dav.request('UNLOCK','',{'Lock-Token':token});}catch{}}dav.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(!process.argv[2])throw Error('EXPORT_REQUIRED');const result=await migrateGuides(JSON.parse(readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify(result));}
 catch{console.error('GUIDE_MIGRATION_NOT_CONFIRMED; keep KOOFR_GUIDES_READY=false');process.exitCode=1;}
}
