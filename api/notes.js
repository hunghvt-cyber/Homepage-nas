import { randomUUID } from 'node:crypto';
import { owner, sameOrigin, body, reply, fail, HttpError } from '../lib/security.js';
import { read, write, paths, overwriteNote } from '../lib/storage.js';
import { validId, noteInput, revision } from '../lib/validation.js';
export function createNotesHandler(deps = {}) {
 const {authorize = owner, load = read, persist = write, enumerate = paths, saveOnly = false} = deps;
 const persistNote = deps.persistNote || (deps.persist ? (path,value) => persist(path,value,undefined,{overwrite:true}) : overwriteNote);
 return async function handler(req, res) {
  try {
    await authorize(req, res);
    res.setHeader('X-Notes-Writer', 'manual-v3');
    if (saveOnly && req.method !== 'POST') throw new HttpError(405, 'Chỉ hỗ trợ lưu note.');
    if (req.method === 'GET') {
      if (req.query.id) { const r = await load('notes/' + validId(req.query.id) + '.json'); if (!r || r.value.deleted) throw new HttpError(404, 'Không tìm thấy note.'); return reply(res, 200, {...r.value, revision: r.etag}); }
      const names = await enumerate('notes/'); const notes = [];
      // Read in bounded groups: no burst of one request for every stored note.
      for (let i = 0; i < names.length; i += 5) { const rows = await Promise.all(names.slice(i, i + 5).map(load)); for (const r of rows) if (r && !r.value.deleted) { const {id, title, pinned, updatedAt} = r.value; notes.push({id, title, pinned, updatedAt}); } }
      notes.sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)); return reply(res, 200, {notes});
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Phương thức không hỗ trợ.');
    sameOrigin(req); const b = body(req); const id = b.id ? validId(b.id) : randomUUID(); const path = 'notes/' + id + '.json'; const current = await load(path);
    if (saveOnly && b.action !== 'save') throw new HttpError(400, 'Thao tác không hợp lệ.');
    if (b.action !== 'save') revision(current, b.revision);
    if (b.action === 'delete') { if (!current || current.value.deleted) throw new HttpError(404, 'Không tìm thấy note.'); await persist(path, {...current.value, deleted: true, updatedAt: new Date().toISOString()}, current.etag); return reply(res, 200, {deleted: true}); }
    if (b.action !== 'save') throw new HttpError(400, 'Thao tác không hợp lệ.');
    if (current?.value.deleted) throw new HttpError(409, 'Note đã bị xóa trên thiết bị khác.');
    const input = noteInput(b);
    const history = current ? [{title: current.value.title, text: current.value.text, updatedAt: current.value.updatedAt}, ...(current.value.history || [])].slice(0,5) : [];
    const value = {id, ...input, updatedAt: new Date().toISOString(), history};
    while (Buffer.byteLength(JSON.stringify(value)) > 3000000 && history.length) history.pop();
    if (Buffer.byteLength(JSON.stringify(value)) > 3000000) throw new HttpError(413, 'Nội dung sau mã hóa quá dài để lưu.');
    const saved = await persistNote(path, value);
    return reply(res, 200, {...value, revision: saved.etag});
  } catch(e) { return fail(res, e); }
}

}
export default createNotesHandler();

