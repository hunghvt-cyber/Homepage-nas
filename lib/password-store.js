import {randomBytes, randomUUID, scrypt as rawScrypt, timingSafeEqual, createHmac} from 'node:crypto';
import {promisify} from 'node:util';
import {createGuideDav} from './guide-store.js';
import {HttpError, passwordVersion, verifyPassword, requireConfig} from './security.js';
const scrypt=promisify(rawScrypt),file='portal-auth.json';
const unavailable=()=>new HttpError(503,'Chưa đọc được cấu hình mật khẩu. Vui lòng thử lại sau.');
const signature=data=>createHmac('sha256',process.env.SESSION_PASSWORD).update(JSON.stringify(data)).digest('hex');
export function createPasswordStore({connect=()=>createGuideDav()}={}){
 async function read(dav){
  const r=await dav.request('GET',file);
  if(r.status===404)return {version:passwordVersion(),initial:true};
  if(r.status!==200)throw unavailable();
  let v;try{v=JSON.parse(r.text);}catch{throw unavailable();}
  const {mac,...data}=v;
  if(data.schema!==1||typeof data.version!=='string'||!/^[a-f0-9]{32}$/.test(data.salt||'')||!/^[a-f0-9]{128}$/.test(data.hash||'')||!/^.{36}$/.test(data.version)||!/^[a-f0-9]{64}$/.test(mac||'')||!timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(signature(data),'hex')))throw unavailable();
  return data;
 }
 async function matches(value,state){if(typeof value!=='string'||value.length>256)return false;if(state.initial)return verifyPassword(value);const hash=await scrypt(value,state.salt,64);return timingSafeEqual(hash,Buffer.from(state.hash,'hex'));}
 return {
  async current(){requireConfig('SESSION_PASSWORD');const dav=connect();try{return await read(dav);}finally{dav.close();}},matches,
  async change(expectedVersion,currentPassword,newPassword){
   if(typeof newPassword!=='string'||newPassword.length<12||newPassword.length>256)throw new HttpError(400,'Mật khẩu mới cần từ 12 đến 256 ký tự.');
   const dav=connect();let token;
   try{
    const lock=await dav.request('LOCK','',{'Depth':'infinity','Timeout':'Second-60','Content-Type':'application/xml'},'<?xml version="1.0"?><D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>');
    if(lock.status===423)throw new HttpError(409,'Có thay đổi khác đang lưu. Vui lòng thử lại.');
    token=lock.headers['lock-token'];if(![200,201].includes(lock.status)||!/^<[^<>\r\n]{1,500}>$/.test(token||'')){token=undefined;throw unavailable();}
    const state=await read(dav);
    if(state.version!==expectedVersion)throw new HttpError(401,'Mật khẩu đã đổi. Vui lòng mở khóa lại.');
    if(!await matches(currentPassword,state))throw new HttpError(401,'Mật khẩu hiện tại không đúng.');
    if(await matches(newPassword,state))throw new HttpError(400,'Mật khẩu mới phải khác mật khẩu hiện tại.');
    const salt=randomBytes(16).toString('hex');const value={schema:1,version:randomUUID(),salt,hash:(await scrypt(newPassword,salt,64)).toString('hex')};const text=JSON.stringify({...value,mac:signature(value)});
    try{await dav.request('PUT',file,{'If':'('+token+')','Content-Type':'application/json'},text);}catch{}
    const confirmed=await read(dav);if(confirmed.version!==value.version||confirmed.hash!==value.hash)throw unavailable();
    return confirmed;
   }finally{if(token){try{await dav.request('UNLOCK','',{'Lock-Token':token});}catch{}}dav.close();}
  }
 };
}
export const passwords=createPasswordStore();
