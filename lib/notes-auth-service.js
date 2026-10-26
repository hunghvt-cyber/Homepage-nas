import {timingSafeEqual,createHash} from 'node:crypto';
import {passwords} from './password-store.js';
import {checkAttempts} from './login-limit.js';
import {reply,HttpError} from './security.js';
const digest=s=>createHash('sha256').update(s).digest();
export function createNotesAuthHandler({env=()=>process.env,passwordStore=passwords,limit=checkAttempts}={}){
 return async(req,res)=>{
  try{
   const e=env(),key=e.NOTES_AUTH_SERVICE_KEY;
   if(e.VERCEL_ENV!=='production'||!key||key.length<64)throw new HttpError(503,'AUTH_DISABLED');
   const bearer=req.headers.authorization;
   if(typeof bearer!=='string'||!timingSafeEqual(digest(bearer),digest('Bearer '+key)))throw new HttpError(401,'SERVICE_UNAUTHORIZED');
   if(req.method!=='POST')throw new HttpError(405,'METHOD_NOT_ALLOWED');
   if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'JSON_REQUIRED');
   let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{}
   if(!b||!['version','verify'].includes(b.action)||Buffer.byteLength(JSON.stringify(b))>2048)throw new HttpError(400,'INVALID_REQUEST');
   if(b.action==='verify'){
    if(typeof b.password!=='string'||b.password.length>256||typeof b.clientIp!=='string'||b.clientIp.length>100)throw new HttpError(400,'INVALID_REQUEST');
    await limit({headers:{'x-vercel-forwarded-for':b.clientIp}});
   }
   const state=await passwordStore.current();
   return reply(res,200,{version:state.version,...(b.action==='verify'?{valid:await passwordStore.matches(b.password,state)}:{})});
  }catch(e){return reply(res,e.status||503,{code:e.status&&/^[A-Z_]+$/.test(e.message)?e.message:e.status===429?'RATE_LIMITED':'AUTH_UNAVAILABLE'});}
 };
}
export default createNotesAuthHandler();
