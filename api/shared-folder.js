import {randomUUID} from 'node:crypto';
import {read,write,paths} from '../lib/storage.js';
import {sameOrigin,body,reply,fail,HttpError} from '../lib/security.js';
import {validId,noteInput} from '../lib/validation.js';
import {sameEtag} from '../lib/etag.js';
import {capability} from '../lib/note-sharing.js';
export function createWorkspace(deps={}){
 const load=deps.load||read,persist=deps.persist||write,enumerate=deps.enumerate||paths;
 return async(req,res)=>{
  try{
   res.setHeader('Referrer-Policy','no-referrer');
   if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Phương thức không hỗ trợ.');
   const b=req.method==='POST'?(sameOrigin(req),body(req)):req.query;
   const {record}=await capability(b.token,load);
   if(record.type!=='folder')throw new HttpError(403,'Link không có quyền truy cập workspace.');
   const folder=record.folder;
   if(req.method==='GET'&&!b.id){
    const names=await enumerate('notes/'),notes=[];
    for(let i=0;i<names.length;i+=15)for(const n of await Promise.all(names.slice(i,i+15).map(load)))if(n&&!n.value.deleted&&n.value.folder===folder)notes.push({id:n.value.id,title:n.value.title,text:String(n.value.text||'').slice(0,180),updatedAt:n.value.updatedAt});
    notes.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    return reply(res,200,{folder,notes});
   }
   const id=b.id?validId(b.id):null,path=id?'notes/'+id+'.json':null;
   const current=id?await load(path):null;
   if(id&&(!current||current.value.deleted||current.value.folder!==folder))throw new HttpError(404,'Note không thuộc workspace.');
   if(req.method==='GET')return reply(res,200,{id,title:current.value.title,text:current.value.text,checklist:current.value.checklist||[],revision:current.etag,updatedAt:current.value.updatedAt});
   if(b.action!=='save')throw new HttpError(400,'Thao tác không hợp lệ.');
   if(id&&!sameEtag(b.revision,current.etag))throw new HttpError(409,'Note đã được sửa. Tải lại trước khi lưu.');
   const input=noteInput({title:b.title,text:b.text,checklist:b.checklist??current?.value.checklist??[],pinned:current?.value.pinned||false,folder});
   const history=current?[{title:current.value.title,text:current.value.text,checklist:current.value.checklist||[],folder,updatedAt:current.value.updatedAt},...(current.value.history||[])].slice(0,5):[];
   const newId=id||randomUUID(),updated={...(current?.value||{}),id:newId,...input,updatedAt:new Date().toISOString(),history};
   while(Buffer.byteLength(JSON.stringify(updated))>3000000&&history.length)history.pop();
   if(Buffer.byteLength(JSON.stringify(updated))>3000000)throw new HttpError(413,'Nội dung quá dài.');
   // Check that the link has not been revoked while editing.
   await capability(b.token,load);
   const saved=await persist('notes/'+newId+'.json',updated,current?.etag);
   return reply(res,200,{id:newId,title:updated.title,text:updated.text,checklist:updated.checklist,revision:saved.etag,updatedAt:updated.updatedAt});
  }catch(e){return fail(res,e);}
 };
}
export {default} from '../lib/retired-notes.js';


