import {createHash} from 'node:crypto';
import schema from '../reporting/nas-schema.cjs';
function endpoint(value){
 const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='script.google.com'||!/^\/macros\/s\/[\w-]{20,200}\/exec$/.test(u.pathname)||u.search||u.hash||u.username||u.password||u.port)throw Error('INVALID_URL');
 u.searchParams.set('source','nas');return u;
}
export function createNasReportHandler({env=process.env,request=fetch}={}){
 return async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  const fail=(status,code)=>{res.setHeader('Cache-Control','no-store');return res.status(status).json({error:'Chưa nhận được báo cáo NAS. Không có số liệu mới được xác nhận.',code});};
  if(req.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED');
  let url;try{url=endpoint(env.NAS_REPORT_GAS_URL);}catch{return fail(503,'REPORT_NOT_CONFIGURED');}
  try{
   const signal=AbortSignal.timeout(12000);let r=await request(url,{redirect:'manual',signal});
   if([301,302,303].includes(r.status)){
    const next=new URL(r.headers.get('location'));if(next.protocol!=='https:'||next.hostname!=='script.googleusercontent.com'||next.username||next.password||next.port)throw Error('REDIRECT_FORBIDDEN');
    r=await request(next,{redirect:'error',signal});
   }
   if(!r.ok||Number(r.headers.get('content-length')||0)>10000)throw Error('UPSTREAM_ERROR');
   const text=await r.text();if(Buffer.byteLength(text)>10000)throw Error('UPSTREAM_TOO_LARGE');
   const data=JSON.parse(text);if(data.ok!==true||data.service!=='nas-drive-reports-v1')throw Error('NO_REPORT');
   if(typeof data.payload!=='string'||Buffer.byteLength(data.payload)>4096)throw Error('INVALID_REPORT');
   if(createHash('sha256').update(data.payload).digest('hex')!==data.sha256)throw Error('HASH_MISMATCH');
   const snapshot=schema.validate(JSON.parse(data.payload));
   const received=Date.parse(data.received_at);
   if(typeof data.received_at!=='string'||!Number.isFinite(received)||received>Date.now()+300000)throw Error('INVALID_RECEIVED_TIME');
   snapshot._report={received_at:new Date(received).toISOString(),recovered_previous:data.recoveredPrevious===true};
   res.setHeader('Cache-Control',data.recoveredPrevious?'public, s-maxage=30':'public, s-maxage=60, stale-while-revalidate=240');
   res.setHeader('X-Report-Recovery',data.recoveredPrevious?'previous':'current');
   return res.status(200).json(snapshot);
  }catch{return fail(502,'REPORT_UNAVAILABLE');}
 };
}
export default createNasReportHandler();
