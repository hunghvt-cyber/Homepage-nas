import { randomUUID } from 'node:crypto';
import { owner, sameOrigin, body, reply, fail, HttpError } from '../lib/security.js';
import { read, paths, overwriteNote } from '../lib/storage.js';
import { validId, noteInput } from '../lib/validation.js';
export function createNotesHandler(deps = {}) {
 const {authorize = owner, load = read, enumerate = paths, saveOnly = false,
   observe = event => console.info('notes', JSON.stringify(event))} = deps;
 const persistNote = deps.persistNote || (deps.persist ? (path,value) => deps.persist(path,value,undefined,{overwrite:true}) : overwriteNote);
 return async function handler(req, res) {
  const reference = 'N4-' + randomUUID().slice(0,8);
  let operation = req.method === 'GET' ? 'read' : 'write', stage = 'authorize';
  const report = status => {
    // Never record bodies, note IDs/paths, revisions, credentials or raw errors.
    try { observe({writer: 'manual-v4', reference, operation, stage, status}); } catch {}
  };
  try {
    res.setHeader('X-Notes-Writer', 'manual-v4');
    res.setHeader('X-Notes-Request', reference);
    await authorize(req, res);
    stage = 'method';
    if (saveOnly && req.method !== 'POST') throw new HttpError(405, 'Chỉ hỗ trợ lưu note.');
    if (req.method === 'GET') {
      stage = 'read';
      if (req.query.id) { const r = await load('notes/' + validId(req.query.id) + '.json'); if (!r || r.value.deleted) throw new HttpError(404, 'Không tìm thấy note.'); return reply(res, 200, {...r.value, revision: r.etag}); }
      const names = await enumerate('notes/'); const notes = [];
      // Read in bounded groups: no burst of one request for every stored note.
      for (let i = 0; i < names.length; i += 5) { const rows = await Promise.all(names.slice(i, i + 5).map(load)); for (const r of rows) if (r && !r.value.deleted) { const {id, title, text = '', pinned, updatedAt, folder = ''} = r.value; notes.push({id, title, text, pinned, updatedAt, folder}); } }
      notes.sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)); return reply(res, 200, {notes});
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Phương thức không hỗ trợ.');
    stage = 'validate'; sameOrigin(req); const b = body(req);
    operation = ['save','delete'].includes(b.action) ? b.action : 'unsupported';
    if (operation === 'unsupported' || saveOnly && b.action !== 'save') throw new HttpError(400, 'Thao tác không hợp lệ.');
    if (b.action === 'delete') validId(b.id);
    const id = b.id ? validId(b.id) : randomUUID(); const path = 'notes/' + id + '.json';
    stage = 'read'; const current = await load(path); stage = 'validate';
    if (b.action === 'delete') {
      // A confirmed Delete acts on the latest server copy, including from older pages.
      // Retrying an already completed soft-delete is successful without another write.
      if (current && !current.value.deleted) {
        stage = 'persist';
        await persistNote(path, {...current.value, deleted: true, updatedAt: new Date().toISOString()});
      }
      report(200); return reply(res, 200, {deleted: true});
    }
    if (current?.value.deleted) throw new HttpError(409, 'Note đã bị xóa trên thiết bị khác.');
    const input = noteInput(b);
    const history = current ? [{title: current.value.title, text: current.value.text, folder: current.value.folder || '', updatedAt: current.value.updatedAt}, ...(current.value.history || [])].slice(0,5) : [];
    const value = {id, ...input, updatedAt: new Date().toISOString(), history};
    while (Buffer.byteLength(JSON.stringify(value)) > 3000000 && history.length) history.pop();
    if (Buffer.byteLength(JSON.stringify(value)) > 3000000) throw new HttpError(413, 'Nội dung sau mã hóa quá dài để lưu.');
    stage = 'persist'; const saved = await persistNote(path, value); report(200);
    return reply(res, 200, {...value, revision: saved.etag});
  } catch(e) { report(e.status || 503); return fail(res, e, {reference}); }
}

}
export default createNotesHandler();

