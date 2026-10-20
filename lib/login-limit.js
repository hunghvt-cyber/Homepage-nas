import {HttpError} from './security.js';
import {checkSupabaseAttempts} from './login-limit-supabase.js';
export async function checkAttempts(req) {
 if((process.env.LOGIN_LIMIT_BACKEND||'supabase')!=='supabase')throw new HttpError(503,'Cấu hình giới hạn đăng nhập chưa hợp lệ.');
 return checkSupabaseAttempts(req);
}


