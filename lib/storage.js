import { get, put, list, BlobPreconditionFailedError } from '@vercel/blob';
import { HttpError, requireConfig } from './security.js';
const options = () => { requireConfig('PORTAL_PRIVATE_BLOB_TOKEN'); return {access: 'private', token: process.env.PORTAL_PRIVATE_BLOB_TOKEN}; };
export async function read(path) {
  const r = await get(path, {...options(), useCache: false});
  if (!r) return null;
  if (r.statusCode !== 200) throw new HttpError(503, 'Không đọc được dữ liệu.');
  return {value: JSON.parse(await new Response(r.stream).text()), etag: r.blob.etag};
}
export async function write(path, value, etag, {overwrite = false} = {}) {
  try { return await put(path, JSON.stringify(value), {...options(), addRandomSuffix: false, contentType: 'application/json', ...(overwrite ? {allowOverwrite: true} : etag ? {allowOverwrite: true, ifMatch: etag} : {allowOverwrite: false})}); }
  catch (e) { if (e instanceof BlobPreconditionFailedError) throw new HttpError(409, 'Nội dung đã thay đổi trên thiết bị khác. Hãy tải lại trước khi sửa.'); throw e; }
}
export async function paths(prefix) {
  const results = []; let cursor;
  do { const r = await list({prefix, cursor, limit: 100, token: options().token}); results.push(...r.blobs.map(b => b.pathname)); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return results;
}


// Notes are manual-save only: the last completed Save is authoritative.
// This path never sends If-Match or If-None-Match conditions.
export async function overwriteNote(path, value) {
  try {
    return await put(path, JSON.stringify(value), {...options(), addRandomSuffix: false,
      contentType: 'application/json', allowOverwrite: true});
  } catch (e) {
    if (e instanceof BlobPreconditionFailedError) {
      throw new HttpError(503, 'Kho lưu từ chối ghi note. Nội dung chưa được lưu. [NOTE_STORE_REJECTED]');
    }
    throw e;
  }
}
