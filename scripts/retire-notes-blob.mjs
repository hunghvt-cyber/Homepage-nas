import {list, del} from '@vercel/blob';
import {pathToFileURL} from 'node:url';

const PROJECT = 'prj_3CCmGVbfaymDVoO66d6MPU1CQ1nw';
export function isRetiredNotePath(path) {
  return /^notes\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.json$/.test(path)
    || /^shares\/[a-f0-9]{32}\.json$/.test(path)
    || path === 'indexes/notes-list-v2.json';
}

export async function retireNotes({env=process.env, enumerate=list, remove=del, log=console.log}={}) {
  const execute = env.NOTES_BLOB_CLEANUP === 'DELETE_RETIRED_NOTES_20261018';
  if (env.VERCEL_PROJECT_ID !== PROJECT || env.VERCEL_ENV !== 'production') throw Error('WRONG_PROJECT_OR_ENVIRONMENT');
  const token = env.PORTAL_PRIVATE_BLOB_TOKEN;
  if (!token) throw Error('PRIVATE_BLOB_NOT_CONFIGURED');
  async function inventory() {
    const rows=[];
    for (const prefix of ['notes/', 'shares/', 'indexes/notes-list-v2.json']) {
      let cursor;
      do {
        const result=await enumerate({prefix, cursor, limit:1000, token});
        for(const row of result.blobs) {
          if (!isRetiredNotePath(row.pathname)) throw Error('UNEXPECTED_PATH_ABORTED');
          rows.push(row);
        }
        if(result.hasMore && (!result.cursor || result.cursor===cursor)) throw Error('INVALID_CURSOR');
        cursor=result.hasMore?result.cursor:undefined;
      } while(cursor);
    }
    return rows;
  }
  // Complete inventory and validate all paths before the first deletion.
  const rows=await inventory();
  const counts={notes:0, shares:0, indexes:0};
  for(const row of rows) counts[row.pathname.split('/')[0]]++;
  log(JSON.stringify({event:'retired-notes-inventory',execute,counts}));
  if(!execute) return {counts, deleted:0};
  let deleted=0;
  for(const row of rows) {
    await remove(row.url,{token});
    deleted++;
  }
  const remaining=(await inventory()).length;
  log(JSON.stringify({event:'retired-notes-cleanup',deleted,remaining}));
  if(remaining) throw Error('CLEANUP_INCOMPLETE');
  return {counts,deleted,remaining};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  retireNotes().catch(()=>{console.error('RETIRED_NOTES_CLEANUP_FAILED');process.exitCode=1;});
}
