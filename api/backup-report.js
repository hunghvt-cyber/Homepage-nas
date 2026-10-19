import {createHash} from 'node:crypto';
import schema from '../reporting/backup-schema.cjs';
async function boundedText(response){
 if(Number(response.headers.get('content-length')||0)>16384)throw Error('RESPONSE_TOO_LARGE');
 const reader=response.body?.getReader();if(!reader)throw Error('EMPTY_RESPONSE');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw Error('RESPONSE_TOO_LARGE');}chunks.push(Buffer.from(value));}
 return Buffer.concat(chunks).toString('utf8');
}
export function createBackupReportHandler({env=process.env,request=fetch}={}){
 return async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  const fail=(status,code)=>{res.setHeader('Cache-Control','no-store');return res.status(status).json({error:'Chưa tải được báo cáo backup.',code});};
  if(req.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED');
  const source=req.query?.source;if(source!=='gdrive'&&source!=='gphotos')return fail(400,'INVALID_SOURCE');
  let url;try{url=new URL(env.BACKUP_REPORT_GAS_URL);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[\w-]{20,200}\/exec$/.test(url.pathname)||url.search||url.hash||url.username||url.password||url.port)throw Error();url.searchParams.set('source',source);}catch{return fail(503,'REPORT_NOT_CONFIGURED');}
  try{
   const signal=AbortSignal.timeout(12000);let r=await request(url,{redirect:'manual',signal});
   if([301,302,303].includes(r.status)){
    const next=new URL(r.headers.get('location'));if(next.protocol!=='https:'||next.hostname!=='script.googleusercontent.com'||next.username||next.password||next.port)throw Error('REDIRECT_FORBIDDEN');
    r=await request(next,{redirect:'error',signal});
   }
   if(!r.ok)throw Error('UPSTREAM_ERROR');const data=JSON.parse(await boundedText(r));
   if(data.ok!==true||data.service!=='homepage-backup-reports-v1'||data.source!==source||typeof data.payload!=='string'||Buffer.byteLength(data.payload)>8192)throw Error('INVALID_REPORT');
   if(createHash('sha256').update(data.payload).digest('hex')!==data.sha256)throw Error('HASH_MISMATCH');
   const report=schema.validate(JSON.parse(data.payload),source),received=Date.parse(data.received_at);
   if(typeof data.received_at!=='string'||!Number.isFinite(received)||received>Date.now()+300000||Date.parse(report.finished_at)>received+300000)throw Error('INVALID_RECEIVED_TIME');
   report._report={received_at:new Date(received).toISOString(),recovered_previous:data.recoveredPrevious===true};
   res.setHeader('Cache-Control',data.recoveredPrevious?'public, s-maxage=30':'public, s-maxage=60, stale-while-revalidate=240');
   res.setHeader('X-Report-Recovery',data.recoveredPrevious?'previous':'current');return res.status(200).json(report);
  }catch{return fail(502,'REPORT_UNAVAILABLE');}
 };
}
export default createBackupReportHandler();
