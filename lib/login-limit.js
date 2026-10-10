import { createHmac } from 'node:crypto';
import { read, write } from './storage.js';
import { HttpError, requireConfig } from './security.js';
export function createLimiter({load = read, persist = write, now = Date.now} = {}) {
 return async function check(req) {
  requireConfig('SESSION_PASSWORD');
  const bucket = Math.floor(now() / (15 * 60000));
  // Vercel supplies this header; missing address shares a conservative fallback bucket.
  const ip = String(req.headers['x-vercel-forwarded-for'] || 'unknown').split(',')[0].trim();
  const key = createHmac('sha256',process.env.SESSION_PASSWORD).update(ip).digest('hex');
  for (const [id,max] of [['global',30],[key,5]]) {
   const path = 'login-attempts/' + id + '.json'; let done = false;
   for (let retry=0;retry<5;retry++) {
    const r=await load(path); const count = r?.value.bucket === bucket ? r.value.count : 0;
    if(count>=max) throw new HttpError(429, 'Nhập mật khẩu quá nhiều lần. Thử lại sau tối đa 15 phút.');
    try {await persist(path,{bucket,count:count+1},r?.etag);done=true;break;} catch(e) {if(e.status!==409) throw e;}
   }
   if(!done) throw new HttpError(429,'Có nhiều lượt đăng nhập cùng lúc. Vui lòng thử lại sau.');
  }
 };
}
export const checkAttempts = createLimiter();
