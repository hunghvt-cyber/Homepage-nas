import { getIronSession } from 'iron-session';
import { createHash, timingSafeEqual } from 'node:crypto';
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function requireConfig(...names) { if (names.some(n => !process.env[n])) throw new HttpError(503, 'Chưa cấu hình mật khẩu hoặc kho lưu riêng tư.'); }
export function passwordVersion() { requireConfig('PORTAL_PASSWORD'); return createHash('sha256').update(process.env.PORTAL_PASSWORD).digest('hex'); }
export function verifyPassword(value) {
  if (typeof value !== 'string' || value.length > 256) return false;
  return timingSafeEqual(createHash('sha256').update(value).digest(), Buffer.from(passwordVersion(), 'hex'));
}
export async function session(req, res) {
  requireConfig('SESSION_PASSWORD');
  if (process.env.SESSION_PASSWORD.length < 32) throw new HttpError(503, 'Cấu hình phiên đăng nhập chưa hợp lệ.');
  return getIronSession(req, res, {password: process.env.SESSION_PASSWORD, cookieName: '__Host-homepage', ttl: 7 * 86400, cookieOptions: {secure: true, httpOnly: true, sameSite: 'lax', path: '/'}});
}
export async function owner(req, res) {
  const s = await session(req, res);
  if (!s.authVersion || s.authVersion !== passwordVersion()) throw new HttpError(401, 'Vui lòng nhập mật khẩu để mở khóa.');
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
export function reply(res, status, value) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); return res.status(status).json(value); }
export function fail(res, e, details = {}) { return reply(res, e.status || 503, {...details, error: e.status ? e.message : 'Không thể kết nối dịch vụ lưu trữ. Nội dung chưa được lưu.'}); }

