import {createHmac} from 'node:crypto';
import {HttpError} from './security.js';

export function createSupabaseLimiter({request = (...args) => fetch(...args), env = process.env} = {}) {
 return async function check(req) {
  const unavailable = () => new HttpError(503, 'Chưa thể mở khóa: dịch vụ giới hạn đăng nhập đang không khả dụng. Vui lòng thử lại sau.');
  try {
   if (!env.LOGIN_LIMIT_SUPABASE_URL || !env.LOGIN_LIMIT_SUPABASE_KEY || !/^[a-f0-9]{64}$/.test(env.LOGIN_LIMIT_TOKEN || '') || !env.SESSION_PASSWORD) throw unavailable();
   const origin = new URL(env.LOGIN_LIMIT_SUPABASE_URL);
   if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.supabase.co') || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw unavailable();
   const ip = String(req.headers['x-vercel-forwarded-for'] || 'unknown').split(',')[0].trim();
   const ipHash = createHmac('sha256', env.SESSION_PASSWORD).update(ip).digest('hex');
   const response = await request(new URL('/rest/v1/rpc/homepage_consume_login_attempt', origin), {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
    headers: {'Content-Type': 'application/json', apikey: env.LOGIN_LIMIT_SUPABASE_KEY},
    body: JSON.stringify({p_token: env.LOGIN_LIMIT_TOKEN, p_ip_hash: ipHash})
   });
   if (!response.ok) throw unavailable();
   const data = await response.json();
   if (!data || typeof data.allowed !== 'boolean' || !Number.isInteger(data.retry_after) || data.retry_after < 1 || data.retry_after > 900) throw unavailable();
   if (!data.allowed) throw new HttpError(429, 'Nhập mật khẩu quá nhiều lần. Thử lại sau tối đa 15 phút.');
  } catch(error) {
   if (error.status === 429) throw error;
   console.error(JSON.stringify({operation: 'login', stage: 'attempt-limit', backend: 'supabase', reason: 'unavailable'}));
   throw unavailable();
  }
 };
}
export const checkSupabaseAttempts = createSupabaseLimiter();
