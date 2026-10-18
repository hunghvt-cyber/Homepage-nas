import { createHash, timingSafeEqual } from 'node:crypto';
import { read, write } from '../lib/storage.js';
import { sameOrigin, body, reply, fail, HttpError } from '../lib/security.js';
import { noteInput } from '../lib/validation.js';
import {sameEtag} from '../lib/etag.js';
const digest=s=>createHash('sha256').update(s).digest('hex');
export function createPublicShare(deps={}){
 const load=deps.load||read,persist=deps.persist||write;
 return async(req,res)=>{
  try{
   res.setHeader('Referrer-Policy','no-referrer');
   if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Phương thức không hỗ trợ.');
   const b=req.method==='POST'?(sameOrigin(req),body(req)):req.query;
   const token=b.token;
   if(typeof token!=='string'||!/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token))throw new HttpError(404,'Liên kết không hợp lệ.');
   const [id,secret]=token.split('.');
   const share=await load('shares/'+id+'.json');
   if(!share||share.value.revoked||share.value.type||typeof share.value.tokenHash!=='string'||!timingSafeEqual(Buffer.from(digest(secret),'hex'),Buffer.from(share.value.tokenHash,'hex')))throw new HttpError(404,'Liên kết đã hết hạn hoặc bị thu hồi.');
   const path='notes/'+share.value.noteId+'.json',note=await load(path);
   if(!note||note.value.deleted)throw new HttpError(404,'Note không còn tồn tại.');
   if(req.method==='GET')return reply(res,200,{title:note.value.title,text:note.value.text,checklist:note.value.checklist||[],revision:note.etag,updatedAt:note.value.updatedAt});
   if(typeof b.revision!=='string'||!sameEtag(b.revision,note.etag))throw new HttpError(409,'Note đã thay đổi. Hãy tải lại trước khi lưu.');
   const input=noteInput({title:b.title,text:b.text,checklist:b.checklist??note.value.checklist??[],pinned:note.value.pinned,folder:note.value.folder||''});
   const history=[{title:note.value.title,text:note.value.text,checklist:note.value.checklist||[],folder:note.value.folder||'',updatedAt:note.value.updatedAt},...(note.value.history||[])].slice(0,5);
   const updated={...note.value,title:input.title,text:input.text,checklist:input.checklist,updatedAt:new Date().toISOString(),history};
   while(Buffer.byteLength(JSON.stringify(updated))>3000000&&history.length)history.pop();
   if(Buffer.byteLength(JSON.stringify(updated))>3000000)throw new HttpError(413,'Nội dung quá dài.');
   // Revalidate the capability before write to narrow the revoke race.
   const latest=await load('shares/'+id+'.json');
   if(!latest||latest.value.revoked)throw new HttpError(403,'Liên kết không còn hiệu lực.');
   const saved=await persist(path,updated,note.etag);
   return reply(res,200,{title:updated.title,text:updated.text,checklist:updated.checklist,revision:saved.etag,updatedAt:updated.updatedAt,expiresAt:share.value.expiresAt});
  }catch(e){return fail(res,e);}
 };
}
export {default} from '../lib/retired-notes.js';


