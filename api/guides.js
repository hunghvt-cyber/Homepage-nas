import {readFileSync} from 'node:fs';
import {owner,sameOrigin,body,reply,fail,HttpError} from '../lib/security.js';
import {guideInput} from '../lib/validation.js';
import {createGuideStore} from '../lib/guide-store.js';
const originals=JSON.parse(readFileSync(new URL('../content/guides.json',import.meta.url),'utf8'));
const store=createGuideStore({slugs:originals.map(g=>g.slug)});
export function createGuidesHandler({storage=store,authorize=owner}={}) {
 return async function handler(req,res) {
  try {
   const original=originals.find(g=>g.slug===req.query.slug);
   if(!original)throw new HttpError(404,'Không tìm thấy hướng dẫn.');
   if(req.method==='GET') {
    try {
     const r=await storage.read(original.slug);
     return reply(res,200,{guide:guideInput({...r.guide,details:r.guide.details??[]},original),revision:r.revision,editable:true,source:'koofr'});
    }catch{
     return reply(res,200,{guide:original,revision:null,editable:false,source:'original',warning:'Chưa tải được bản cập nhật. Đang hiển thị bản hướng dẫn gốc; bản này có thể chưa mới nhất.'});
    }
   }
   if(req.method!=='POST')throw new HttpError(405,'Phương thức không hỗ trợ.');
   await authorize(req,res);sameOrigin(req);const b=body(req);
   const guide=guideInput(b.guide,original);
   const r=await storage.save(original.slug,guide,b.revision,b.operationId);
   return reply(res,200,{guide:guideInput({...r.guide,details:r.guide.details??[]},original),revision:r.revision});
  }catch(e){return fail(res,e);}
 };
}
export default createGuidesHandler();

