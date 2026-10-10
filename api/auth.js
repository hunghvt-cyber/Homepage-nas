import { session, owner, sameOrigin, body, requireConfig, reply, fail, HttpError, passwordVersion, verifyPassword } from '../lib/security.js';
import { checkAttempts } from '../lib/login-limit.js';
export function createAuthHandler({limit = checkAttempts} = {}) {
 return async function handler(req, res) {
  try {
    requireConfig('PORTAL_PASSWORD', 'SESSION_PASSWORD', 'PORTAL_BASE_URL', 'PORTAL_PRIVATE_BLOB_TOKEN');
    if (process.env.PORTAL_PASSWORD.length < 12 || process.env.PORTAL_PASSWORD.length > 256) throw new HttpError(503, 'Mật khẩu quản trị cần từ 12 đến 256 ký tự.');
    if (req.method === 'GET') {
      try {await owner(req, res); return reply(res, 200, {authenticated: true});} catch(e) {if(e.status !== 401) throw e; return reply(res, 200, {authenticated: false});}
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Phương thức không hỗ trợ.');
    sameOrigin(req); const b = body(req); const s = await session(req, res);
    if (b.action === 'logout') {s.destroy(); return reply(res, 200, {authenticated: false});}
    if (b.action !== 'login') throw new HttpError(400, 'Thao tác không hợp lệ.');
    await limit(req);
    if (!verifyPassword(b.password)) throw new HttpError(401, 'Mật khẩu không đúng.');
    s.authVersion = passwordVersion(); await s.save(); return reply(res, 200, {authenticated: true});
  } catch(e) {return fail(res,e);}
 };
}
export default createAuthHandler();
