import { HttpError } from './security.js';
export function text(value, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new HttpError(400, 'Nội dung trống hoặc quá dài.');
  return value;
}
export const validId = id => { if (!/^[0-9a-f-]{36}$/.test(id || '')) throw new HttpError(400, 'Mã note không hợp lệ.'); return id; };
export function checklistInput(value = []) {
  if (!Array.isArray(value) || value.length > 200) throw new HttpError(400, 'Checklist tối đa 200 mục.');
  const ids = new Set();
  return value.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id) || typeof item.checked !== 'boolean') throw new HttpError(400, 'Mục checklist không hợp lệ.');
    ids.add(item.id); return {id:item.id, text:text(item.text, 2000), checked:item.checked};
  });
}
export function noteInput(b) {
  const v = {title:text(b.title,200,true), text:text(b.text,1000000), pinned:b.pinned===true, folder:text(b.folder ?? '',80).trim(), checklist:checklistInput(b.checklist)};
  if (Buffer.byteLength(v.text) + Buffer.byteLength(JSON.stringify(v.checklist)) > 1000000) throw new HttpError(413, 'Mỗi note tối đa 1 MB nội dung.');
  return v;
}
export function guideInput(b, original) {
  if (b.slug !== original.slug) throw new HttpError(400, 'Không được đổi đường dẫn QR.');
  if (!Array.isArray(b.steps) || !b.steps.length || b.steps.length > 100 || !Array.isArray(b.details) || b.details.length > 30) throw new HttpError(400, 'Các bước hoặc mục bổ sung không hợp lệ.');
  return {...original, title: text(b.title, 200, true), area: text(b.area, 200, true), summary: text(b.summary, 2000), notes: text(b.notes || '', 10000), last_cleaned: text(b.last_cleaned || '', 100), steps: b.steps.map(s => text(s, 10000, true)), details: b.details.map(d => ({title: text(d.title, 200, true), body: text(d.body, 50000)}))};
}
export function revision(current, incoming) { if (current && incoming !== current.etag) throw new HttpError(409, 'Bản này đã cũ. Tải lại trước khi sửa; nội dung đang nhập được giữ nguyên.'); if (!current && incoming) throw new HttpError(409, 'Bản này không còn tồn tại.'); }

