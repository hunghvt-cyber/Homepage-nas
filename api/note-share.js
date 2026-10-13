import { randomBytes, createHash } from 'node:crypto';
import { owner, sameOrigin, body, reply, fail, HttpError } from '../lib/security.js';
import { read, write, paths } from '../lib/storage.js';
import { validId } from '../lib/validation.js';
const digest=s=>createHash('sha256').update(s).digest('hex');
export function createShareManagement(deps={}){
 const authorize=deps.authorize||owner, load=deps.load||read, persist=deps.persist||write, enumerate=deps.enumerate||paths;
 return async (req,res)=>{
  try{
   await authorize(req,res);
   if(req.method==='GET'){
    const noteId=validId(req.query.noteId),entries=await enumerate('shares/'),links=[];
    for(const path of entries){const r=await load(path);if(r?.value.noteId===noteId)links.push({id:path.slice(7,-5),expiresAt:r.value.expiresAt,revoked:!!r.value.revoked});}
    return reply(res,200,{links});
   }
   if(req.method!=='POST')throw new HttpError(405,'Phương thức không hỗ trợ.');
   sameOrigin(req);const b=body(req);
   if(!['create','revoke'].includes(b.action))throw new HttpError(400,'Thao tác không hợp lệ.');
   const noteId=validId(b.noteId);
   const note=await load('notes/'+noteId+'.json');
   if(!note||note.value.deleted)throw new HttpError(404,'Không tìm thấy Note.');
   if(b.action==='create'){
    const id=randomBytes(16).toString('hex'),secret=randomBytes(32).toString('hex');
    const expiresAt=new Date(Date.now()+30*86400000).toISOString();
    await persist('shares/'+id+'.json',{noteId,tokenHash:digest(secret),expiresAt,revoked:false},null);
    return reply(res,200,{token:id+'.'+secret,expiresAt});
   }
   if(typeof b.token!=='string'||!/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(b.token))throw new HttpError(400,'Liên kết không hợp lệ.');
   const [id,secret]=b.token.split('.');
   const entry=await load('shares/'+id+'.json');
   if(!entry||entry.value.noteId!==noteId)throw new HttpError(404,'Không tìm thấy liên kết.');
   if(!entry.value.revoked)await persist('shares/'+id+'.json',{...entry.value,revoked:true},entry.etag);
   return reply(res,200,{revoked:true});
  }catch(e){return fail(res,e);}
 };
}
export default createShareManagement();
