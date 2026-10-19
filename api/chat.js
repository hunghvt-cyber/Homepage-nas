import { createHmac } from 'node:crypto';
import { owner, sameOrigin, body, reply, fail, HttpError, requireConfig } from '../lib/security.js';

export function validateMessages(messages) {
 if (!Array.isArray(messages) || !messages.length || messages.length > 19) throw new HttpError(400, 'Tối đa 10 lượt trao đổi; hãy mở cuộc trò chuyện mới.');
 let total=0;
 const normalized=messages.map((m,i)=>{
  if (!m || m.role !== (i%2 ? 'model' : 'user') || typeof m.text !== 'string' || !m.text.trim() || m.text.length>(m.role==='user'?4000:16000)) throw new HttpError(400,'Tin nhắn không hợp lệ hoặc dài quá 4.000 ký tự.');
  total+=m.text.length; return {role:m.role,text:m.text.trim()};
 });
 if(normalized.at(-1).role!=='user' || total>24000) throw new HttpError(400,'Cuộc trò chuyện quá dài; hãy mở cuộc trò chuyện mới.');
 return normalized;
}
export function createChatHandler({authorize=owner,request=fetch}={}) {
 return async(req,res)=>{
  try {
   await authorize(req,res);
   if(req.method!=='POST') throw new HttpError(405,'Phương thức không hỗ trợ.');
   sameOrigin(req);
   const input=body(req),operation=input.operation||'chat';
   if(!['chat','models'].includes(operation))throw new HttpError(400,'Thao tác không hợp lệ.');
   const messages=operation==='chat'?validateMessages(input.messages):undefined;
   if(input.model!==undefined&&(typeof input.model!=='string'||!/^gemini-[a-zA-Z0-9._-]{1,100}$/.test(input.model)))throw new HttpError(400,'Model không hợp lệ.');
   requireConfig('EXPENSES_API_URL','EXPENSES_API_SECRET');
   if(process.env.EXPENSES_API_SECRET.length<32) throw new HttpError(503,'Chưa cấu hình kết nối Gemini.');
   const url=new URL(process.env.EXPENSES_API_URL);
   if(url.protocol!=='https:' || url.hostname!=='script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) throw new HttpError(503,'Kết nối Gemini chưa hợp lệ.');
   const payload=JSON.stringify({action:'homepage_chat',operation,messages,model:operation==='chat'?input.model:undefined,refresh:operation==='models'&&input.refresh===true,timestamp:Date.now()});
   const signature=createHmac('sha256',process.env.EXPENSES_API_SECRET).update(payload).digest('hex');
   const response=await request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'homepage_chat',payload,signature}),signal:AbortSignal.timeout(55000)});
   if(!response.ok) throw new HttpError(502,'Gemini chưa phản hồi. Thử lại sau.');
   const data=await response.json();
   if(!data.ok) {
    if(data.reason==='MODEL_UNAVAILABLE')throw new HttpError(400,'Model không còn khả dụng. Làm mới danh sách hoặc chọn Mặc định.');
    if(data.reason==='HTTP'&&data.upstreamStatus===404)throw new HttpError(502,'Model không còn được Google hỗ trợ hoặc khóa hiện tại không truy cập được (404). Chọn Mặc định hoặc làm mới danh sách.');
    if(data.reason==='HTTP'&&data.upstreamStatus===503)throw new HttpError(502,'Google đang quá tải (503). Giữ câu hỏi và thử lại sau.');
    const error=data.code===429?'Đã hết hạn mức hoặc đang quá tải. Hãy thử lại sau.':data.reason==='CONFIG'?'Botchitieu chưa cấu hình khóa Gemini.':data.reason==='INCOMPLETE'?'Gemini trả lời chưa đầy đủ. Thử câu hỏi ngắn hơn.':data.reason==='HTTP'&&Number.isInteger(data.upstreamStatus)?'Gemini báo lỗi HTTP '+data.upstreamStatus+'. Kiểm tra khóa hoặc model.':'Không kết nối được Gemini. Kiểm tra cấu hình botchitieu.';
    throw new HttpError(data.code===429?429:502,error);
   }
   const modelId=value=>typeof value==='string'&&/^gemini-[a-zA-Z0-9._-]{1,100}$/.test(value)?value:null;
   if(operation==='models'){
    if(!modelId(data.defaultModel)||!Array.isArray(data.models)||data.models.length>10||data.models.some(m=>!modelId(m)))throw new HttpError(502,'Chưa tải được danh sách model. Vẫn có thể dùng Mặc định.');
    return reply(res,200,{defaultModel:data.defaultModel,models:[...new Set(data.models)]});
   }
   if(typeof data.text!=='string' || !data.text.trim() || data.text.length>16000) throw new HttpError(502,'Câu trả lời không hợp lệ.');
   return reply(res,200,{text:data.text,requestedModel:modelId(data.requestedModel),modelVersion:modelId(data.modelVersion)});
  } catch(e) {if(!e.status)e=new HttpError(502,'Không kết nối được Gemini. Thử lại sau.');return fail(res,e);}
 };
}
export default createChatHandler();

