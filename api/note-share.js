import { randomBytes, createHash } from 'node:crypto';
import { owner, sameOrigin, body, reply, fail, HttpError } from '../lib/security.js';
import { read, write, paths } from '../lib/storage.js';
import { validId } from '../lib/validation.js';
import {scopeFolder} from '../lib/note-sharing.js';
const digest=s=>createHash('sha256').update(s).digest('hex');
export function createShareManagement(deps={}){
 const authorize=deps.authorize||owner, load=deps.load||read, persist=deps.persist||write, enumerate=deps.enumerate||paths;
 return async (req,res)=>{
  try{
   await authorize(req,res);
   if(req.method==='GET'){
    const folder=req.query.folder?scopeFolder(req.query.folder):null,noteId=folder?null:validId(req.query.noteId),entries=await enumerate('shares/'),links=[];
    for(const path of entries){const r=await load(path);if(r&&(folder?r.value.folder===folder&&r.value.type==='folder':r.value.noteId===noteId&&!r.value.type))links.push({id:path.slice(7,-5),revoked:!!r.value.revoked});}
    return reply(res,200,{links});
   }
   if(req.method!=='POST')throw new HttpError(405,'Phương thức không hỗ trợ.');
   sameOrigin(req);const b=body(req);
   if(!['create','revoke'].includes(b.action))throw new HttpError(400,'Thao tác không hợp lệ.');
   const folder=b.folder?scopeFolder(b.folder):null,noteId=folder?null:validId(b.noteId);
   if(!folder){const note=await load('notes/'+noteId+'.json');if(!note||note.value.deleted)throw new HttpError(404,'Không tìm thấy Note.');}
   if(folder){const names=await enumerate('notes/');let found=false;for(const path of names){const n=await load(path);if(n&&!n.value.deleted&&n.value.folder===folder){found=true;break;}}if(!found)throw new HttpError(404,'Thư mục chưa có Note.');}
   if(b.action==='create'){
    const id=randomBytes(16).toString('hex'),secret=randomBytes(32).toString('hex');
    await persist('shares/'+id+'.json',{...(folder?{type:'folder',folder}:{noteId}),tokenHash:digest(secret),revoked:false},null);
    return reply(res,200,{token:id+'.'+secret});
   }
   if(typeof b.id!=='string'||!/^[a-f0-9]{32}$/.test(b.id))throw new HttpError(400,'Liên kết không hợp lệ.');
   const id=b.id;
   const entry=await load('shares/'+id+'.json');
   if(!entry||(folder?entry.value.folder!==folder||entry.value.type!=='folder':entry.value.noteId!==noteId||!!entry.value.type))throw new HttpError(404,'Không tìm thấy liên kết.');
   if(!entry.value.revoked)await persist('shares/'+id+'.json',{...entry.value,revoked:true},entry.etag);
   return reply(res,200,{revoked:true});
  }catch(e){return fail(res,e);}
 };
}
export default createShareManagement();
