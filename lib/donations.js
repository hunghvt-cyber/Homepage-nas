import {reply,fail,HttpError} from './security.js';
export const DONATION_FEED_URL='https://script.google.com/macros/s/AKfycby9V-wbbucC9zTBRfMdCM5Tf8qsJRlMVeQtOfyKmrtuOVmLs1USBcTTMbe4J2ExhpQn/exec?action=homepage_donations';
export function validateDonationFeed(data){
 const bad=()=>new HttpError(502,'Sổ donate chưa phản hồi dữ liệu hợp lệ.');
 if(data?.schema!==1||data.bank!=='MB'||typeof data.enabled!=='boolean'||!Array.isArray(data.items)||data.items.length>5000||!Number.isFinite(Date.parse(data.server_time)))throw bad();
 const ids=new Set(),items=data.items.map(item=>{
  if(!item||!/^[a-f0-9]{64}$/.test(item.id||'')||ids.has(item.id)||!Number.isSafeInteger(item.amount)||item.amount<=0||item.amount>1e12||!Number.isFinite(Date.parse(item.received_at))||typeof item.message!=='string'||item.message.length>400||typeof item.thanks!=='string'||!item.thanks.trim()||item.thanks.length>300)throw bad();
  ids.add(item.id);return {id:item.id,amount:item.amount,received_at:item.received_at,message:item.message,thanks:item.thanks};
 });
 const now=Date.parse(data.server_time);
 if(items.some(item=>Date.parse(item.received_at)>now+300000))throw bad();
 items.sort((a,b)=>Date.parse(b.received_at)-Date.parse(a.received_at)||b.id.localeCompare(a.id));
 // 24 rolling hours OR newest ten, with no invented rows if fewer exist.
 return {schema:1,bank:'MB',enabled:data.enabled,server_time:data.server_time,items:items.filter((item,index)=>index<10||Date.parse(item.received_at)>=now-86400000)};
}
export async function fetchDonationFeed(request=fetch){
 let response=await request(DONATION_FEED_URL,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(18000)});
 if([301,302,303,307,308].includes(response.status)){
  let url;try{url=new URL(response.headers.get('location'));}catch{throw new HttpError(502,'Sổ donate chưa phản hồi.');}
  if(url.protocol!=='https:'||url.hostname!=='script.googleusercontent.com'||url.username||url.password||url.port)throw new HttpError(502,'Nguồn sổ donate không hợp lệ.');
  response=await request(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(18000)});
 }
 if(!response.ok)throw new HttpError(502,'Chưa tải được sổ donate.');
 const text=await response.text();if(Buffer.byteLength(text)>3000000)throw new HttpError(502,'Sổ donate quá lớn.');
 let data;try{data=JSON.parse(text);}catch{throw new HttpError(502,'Chưa đọc được sổ donate.');}
 return validateDonationFeed(data);
}

export function createDonationsHandler({request=fetch}={}){
 return async(req,res)=>{
  try{
   if(req.method!=='GET')throw new HttpError(405,'Chỉ hỗ trợ đọc sổ donate.');
   // Fixed, public sanitized GAS feed. No private ledger or Gemini call on reads.
   return reply(res,200,await fetchDonationFeed(request));
  }catch(error){return fail(res,error.status?error:new HttpError(502,'Chưa kết nối được sổ donate.'));}
 };
}
