import { getIronSession } from 'iron-session';
import { OAuth2Client } from 'google-auth-library';
export const OWNER = 'thanhhunga4.wtf@gmail.com';
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function requireConfig(...names) { if (names.some(n => !process.env[n])) throw new HttpError(503, 'Chưa cấu hình đăng nhập hoặc kho lưu riêng tư.'); }
export function authorizeClaims(p) {
  if (!p || p.email_verified !== true || p.email?.toLowerCase() !== OWNER || !p.sub) throw new HttpError(403, 'Tài khoản này không có quyền truy cập.');
  return {email: OWNER, sub: p.sub};
}
export async function session(req, res) {
  requireConfig('SESSION_PASSWORD');
  if (process.env.SESSION_PASSWORD.length < 32) throw new HttpError(503, 'Cấu hình phiên đăng nhập chưa hợp lệ.');
  return getIronSession(req, res, {password: process.env.SESSION_PASSWORD, cookieName: '__Host-homepage', ttl: 7 * 86400, cookieOptions: {secure: true, httpOnly: true, sameSite: 'lax', path: '/'}});
}
export async function owner(req, res) {
  const s = await session(req, res);
  if (s.email !== OWNER || !s.sub) throw new HttpError(401, 'Vui lòng đăng nhập bằng Google.');
  return s;
}
export function sameOrigin(req) {
  requireConfig('PORTAL_BASE_URL');
  if (req.headers.origin !== new URL(process.env.PORTAL_BASE_URL).origin) throw new HttpError(403, 'Yêu cầu không cùng nguồn.');
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Yêu cầu phải là JSON.');
}
export function body(req) {
  let b; try { b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw new HttpError(400, 'JSON không hợp lệ.'); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'Nội dung không hợp lệ.');
  if (Buffer.byteLength(JSON.stringify(b)) > 3000000) throw new HttpError(413, 'Nội dung quá dài.');
  return b;
}
export async function verifyGoogle(credential, nonce) {
  requireConfig('GOOGLE_CLIENT_ID');
  if (typeof credential !== 'string' || credential.length > 10000 || !nonce) throw new HttpError(401, 'Phiên đăng nhập không hợp lệ.');
  let ticket; try { ticket = await new OAuth2Client().verifyIdToken({idToken: credential, audience: process.env.GOOGLE_CLIENT_ID}); } catch { throw new HttpError(401, 'Không xác minh được tài khoản Google.'); }
  const p = ticket.getPayload();
  if (p.nonce !== nonce) throw new HttpError(401, 'Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
  return authorizeClaims(p);
}
export function reply(res, status, value) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); return res.status(status).json(value); }
export function fail(res, e) { return reply(res, e.status || 503, {error: e.status ? e.message : 'Không thể kết nối dịch vụ lưu trữ. Nội dung chưa được lưu.'}); }
