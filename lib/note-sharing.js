import {createHash,timingSafeEqual,randomBytes} from 'node:crypto';
import {HttpError} from './security.js';
export const hashToken=s=>createHash('sha256').update(s).digest('hex');
export const newToken=()=>({id:randomBytes(16).toString('hex'),secret:randomBytes(32).toString('hex')});
export function tokenParts(token){
 if(typeof token!=='string'||!/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token))throw new HttpError(404,'Liên kết không hợp lệ.');
 return token.split('.');
}
export async function capability(token,load){
 const [id,secret]=tokenParts(token),path='shares/'+id+'.json',r=await load(path);
 if(!r||r.value.revoked||typeof r.value.tokenHash!=='string'||!timingSafeEqual(Buffer.from(hashToken(secret),'hex'),Buffer.from(r.value.tokenHash,'hex')))throw new HttpError(404,'Liên kết đã bị thu hồi hoặc hết hạn.');
 return {id,record:r.value};
}
export function scopeFolder(folder){
 if(typeof folder!=='string'||!folder.trim()||folder.length>80)throw new HttpError(400,'Tên thư mục không hợp lệ.');
 return folder.trim();
}
