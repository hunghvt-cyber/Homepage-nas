import { randomUUID } from 'node:crypto';
import { owner, sameOrigin, body, reply, fail, HttpError } from '../lib/security.js';
import { read, paths, write } from '../lib/storage.js';
import { validId, noteInput } from '../lib/validation.js';
import {sameEtag} from '../lib/etag.js';
import {notesList, listResponse} from '../lib/notes-list.js';
export function createNotesHandler(deps = {}) {
 const {authorize = owner, load = read, enumerate = paths, saveOnly = false,
   observe = event => console.info('notes', JSON.stringify(event))} = deps;
 const persistNote = deps.persistNote || deps.persist || write;
 return async function handler(req, res) {
  const reference = 'N4-' + randomUUID().slice(0,8);
  let operation = req.method === 'GET' ? 'read' : 'write', stage = 'authorize';
  const report = status => {
    // Never record bodies, note IDs/paths, revisions, credentials or raw errors.
    try { observe({writer: 'revision-v5', reference, operation, stage, status}); } catch {}
  };
  try {
    res.setHeader('X-Notes-Writer', 'revision-v5');
    res.setHeader('X-Notes-Request', reference);
    await authorize(req, res);
    stage = 'method';
    if (saveOnly && req.method !== 'POST') throw new HttpError(405, 'Chỉ hỗ trợ lưu note.');
    if (req.method === 'GET') {
      stage = 'read';
      if (req.query.id) {
        const revision = req.query.revision;
        if (revision !== undefined && (typeof revision !== 'string' || revision.length > 200)) throw new HttpError(400, 'Phiên bản không hợp lệ.');
        const r = await load('notes/' + validId(req.query.id) + '.json', revision);
        if (r?.notModified) return reply(res, 200, {notModified:true, revision:r.etag});
        if (!r || r.value.deleted) throw new HttpError(404, 'Không tìm thấy note.');
        return reply(res, 200, {...r.value, revision:r.etag});
      }
      const indexDeps = {...deps};
      // Older injected storage adapters enumerate paths without a metadata API.
      if (deps.enumerate && !deps.listMetadata) {
        indexDeps.listMetadata = async prefix => (await enumerate(prefix)).map(pathname=>({pathname,uploadedAt:'',size:0}));
        indexDeps.loadIndex ||= async () => null;
        indexDeps.saveIndex ||= async () => {};
      }
      return reply(res, 200, listResponse(await notesList(indexDeps), req.query.known));
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Phương thức không hỗ trợ.');
    stage = 'validate'; sameOrigin(req); const b = body(req);
    operation = ['save','delete','folderDelete'].includes(b.action) ? b.action : 'unsupported';
    if (operation === 'unsupported' || saveOnly && b.action !== 'save') throw new HttpError(400, 'Thao tác không hợp lệ.');
    if (b.action === 'folderDelete') {
      const folder = typeof b.folder === 'string' ? b.folder.trim() : '';
      if (!folder || folder.length > 80 || typeof b.deleteNotes !== 'boolean') throw new HttpError(400, 'Thư mục hoặc tùy chọn xóa không hợp lệ.');
      const links = await enumerate('shares/');
      for(const p of links){const r=await load(p);if(r?.value.type==='folder'&&r.value.folder===folder&&!r.value.revoked)throw new HttpError(409,'Hãy ngừng chia sẻ thư mục trước khi xóa.');}
      stage = 'read';
      const names = await enumerate('notes/');
      let changed = 0;
      for (const name of names) {
        const current = await load(name);
        if (!current || current.value.deleted || current.value.folder !== folder) continue;
        stage = 'persist';
        await persistNote(name, b.deleteNotes
          ? {...current.value, deleted: true, updatedAt: new Date().toISOString()}
          : {...current.value, folder: '', updatedAt: new Date().toISOString()}, current.etag);
        changed++;
      }
      report(200); return reply(res, 200, {changed, deleteNotes: b.deleteNotes});
    }
    if (b.action === 'delete') validId(b.id);
    const id = b.id ? validId(b.id) : randomUUID(); const path = 'notes/' + id + '.json';
    stage = 'read'; const current = await load(path); stage = 'validate';
    if (b.action === 'delete') {
      // A confirmed Delete acts on the latest server copy, including from older pages.
      // Retrying an already completed soft-delete is successful without another write.
      if (current && !current.value.deleted) {
        stage = 'persist';
        await persistNote(path, {...current.value, deleted: true, updatedAt: new Date().toISOString()}, current.etag);
      }
      report(200); return reply(res, 200, {deleted: true});
    }
    if (current?.value.deleted) throw new HttpError(409, 'Note đã bị xóa trên thiết bị khác.');
    if (current && (typeof b.revision !== 'string' || !sameEtag(b.revision, current.etag))) throw new HttpError(409, 'Note đã thay đổi trên thiết bị khác. Bản đang nhập vẫn được giữ; tải lại bản mới trước khi lưu.');
    const input = noteInput({...b, checklist:b.checklist ?? current?.value.checklist ?? []});
    const history = current ? [{title: current.value.title, text: current.value.text, checklist:current.value.checklist || [], folder: current.value.folder || '', updatedAt: current.value.updatedAt}, ...(current.value.history || [])].slice(0,5) : [];
    const value = {id, ...input, updatedAt: new Date().toISOString(), history};
    while (Buffer.byteLength(JSON.stringify(value)) > 3000000 && history.length) history.pop();
    if (Buffer.byteLength(JSON.stringify(value)) > 3000000) throw new HttpError(413, 'Nội dung sau mã hóa quá dài để lưu.');
    stage = 'persist'; const saved = await persistNote(path, value, current?.etag); report(200);
    return reply(res, 200, {...value, revision: saved.etag});
  } catch(e) { report(e.status || 503); return fail(res, e, {reference}); }
}

}
export {default} from '../lib/retired-notes.js';



