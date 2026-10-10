import { createHmac } from 'node:crypto';
import { owner, reply, fail, HttpError, requireConfig } from '../lib/security.js';
export function createExpensesHandler({authorize = owner, request = fetch} = {}) {
 return async (req, res) => {
  try {
   await authorize(req,res);
   if(req.method !== 'GET') throw new HttpError(405,'Phương thức không hỗ trợ.');
   const month=String(req.query.month || '');
   if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400,'Tháng không hợp lệ.');
   requireConfig('EXPENSES_API_URL','EXPENSES_API_SECRET');
   if(process.env.EXPENSES_API_SECRET.length<32) throw new HttpError(503,'Chưa cấu hình khóa thống kê.');
   const url=new URL(process.env.EXPENSES_API_URL);
   if(url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)) throw new HttpError(503,'Chưa cấu hình nguồn thống kê.');
   const payload=JSON.stringify({month,timestamp:Date.now()});
   const signature=createHmac('sha256',process.env.EXPENSES_API_SECRET).update(payload).digest('hex');
   const response=await request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'homepage_stats',payload,signature}),signal:AbortSignal.timeout(20000)});
   if(!response.ok) throw new HttpError(502,'Nguồn thống kê chưa phản hồi.');
   const data=await response.json();
   if(!data.ok || data.month !== month || !Array.isArray(data.transactions) || data.transactions.length > 100000) throw new HttpError(502,'Chưa đọc được thống kê từ Botchitieu.');
   const transactions=data.transactions.map(r=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.day) || !r.day.startsWith(month+'-') || !Number.isFinite(r.amount) || r.amount < 0 || !['ChiTieu','ThuNhap'].includes(r.type) || typeof r.payer !== 'string' || typeof r.payerId !== 'string' || typeof r.category !== 'string') throw new HttpError(502,'Dữ liệu thống kê không hợp lệ.');
    return {day:r.day,amount:r.amount,type:r.type,payer:r.payer.slice(0,200),payerId:r.payerId.slice(0,100),category:r.category.slice(0,100)};
   });
   return reply(res,200,{month,transactions,measuredAt:data.measuredAt});
  } catch(e) {if(!e.status) e=new HttpError(502,'Không kết nối được nguồn thống kê. Thử làm mới sau.'); return fail(res,e);}
 };
}
export default createExpensesHandler();
