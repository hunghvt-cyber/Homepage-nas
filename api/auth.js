import { randomBytes } from 'node:crypto';
import { session, owner, sameOrigin, body, verifyGoogle, requireConfig, reply, fail, HttpError } from '../lib/security.js';
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      requireConfig('GOOGLE_CLIENT_ID', 'SESSION_PASSWORD', 'PORTAL_BASE_URL', 'PORTAL_PRIVATE_BLOB_TOKEN');
      const s = await session(req, res);
      if (req.query.action === 'challenge') { s.nonce = randomBytes(32).toString('hex'); s.nonceAt = Date.now(); await s.save(); return reply(res, 200, {clientId: process.env.GOOGLE_CLIENT_ID, nonce: s.nonce}); }
      try { const u = await owner(req, res); return reply(res, 200, {authenticated: true, email: u.email}); } catch(e) { if (e.status !== 401) throw e; return reply(res, 200, {authenticated: false}); }
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Phương thức không hỗ trợ.');
    sameOrigin(req); const b = body(req); const s = await session(req, res);
    if (b.action === 'logout') { s.destroy(); return reply(res, 200, {authenticated: false}); }
    if (!s.nonceAt || Date.now() - s.nonceAt > 10 * 60000) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn.');
    const u = await verifyGoogle(b.credential, s.nonce);
    s.email = u.email; s.sub = u.sub; delete s.nonce; delete s.nonceAt; await s.save();
    return reply(res, 200, {authenticated: true, email: u.email});
  } catch(e) { return fail(res, e); }
}
