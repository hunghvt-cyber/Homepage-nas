import { readFileSync } from 'node:fs';
import { owner, sameOrigin, body, reply, fail, HttpError } from '../lib/security.js';
import { read, write } from '../lib/storage.js';
import { guideInput, revision } from '../lib/validation.js';
const originals = JSON.parse(readFileSync(new URL('../content/guides.json', import.meta.url), 'utf8'));
export default async function handler(req, res) {
  try {
    const slug = req.query.slug; const original = originals.find(g => g.slug === slug);
    if (!original) throw new HttpError(404, 'Không tìm thấy hướng dẫn.');
    if (req.method === 'GET') {
      // Public reads may only expose guide records, never notes or arbitrary paths.
      if (!process.env.PORTAL_PRIVATE_BLOB_TOKEN) return reply(res, 200, {guide: original, revision: null, editable: false});
      const r = await read('guides/' + slug + '.json'); return reply(res, 200, {guide: r ? r.value.guide : original, revision: r?.etag || null, editable: true});
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Phương thức không hỗ trợ.');
    await owner(req, res); sameOrigin(req); const b = body(req); const current = await read('guides/' + slug + '.json'); revision(current, b.revision);
    const guide = guideInput(b.guide, original); const history = current ? [{guide: current.value.guide, updatedAt: current.value.updatedAt}, ...(current.value.history || [])].slice(0,5) : [{guide: original, updatedAt: null}];
    const value = {guide, history, updatedAt: new Date().toISOString()};
    if (Buffer.byteLength(JSON.stringify(value)) > 3000000) throw new HttpError(413, 'Hướng dẫn quá dài.');
    const saved = await write('guides/' + slug + '.json', value, current?.etag); return reply(res, 200, {guide, revision: saved.etag});
  } catch(e) { return fail(res, e); }
}
