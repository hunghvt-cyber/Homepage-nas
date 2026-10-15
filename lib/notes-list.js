import {read, write, listMetadata} from './storage.js';
import {HttpError} from './security.js';
const INDEX_PATH = 'indexes/notes-list-v2.json';
import {canonicalEtag as contentTag} from './etag.js';
const signature = entries => JSON.stringify(entries.map(e => [e.pathname, String(e.uploadedAt), e.size, e.etag || '']).sort((a,b)=>a[0].localeCompare(b[0])));
const validNote = n => n === null || n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.text === 'string' && typeof n.updatedAt === 'string' && typeof n.folder === 'string';
const validIndex = value => value?.version === 2 && Array.isArray(value.rows) && value.rows.every(r=>r && typeof r.path === 'string' && typeof r.stamp === 'string' && validNote(r.note)) && new Set(value.rows.map(r=>r.path)).size === value.rows.length;
function summarize(record) {
 if (!record || record.value.deleted) return null;
 const {id,title,text='',pinned,updatedAt,folder='',checklist=[]}=record.value;
 return {id,title,text:[text,...checklist.map(x=>(x.checked?'☑ ':'☐ ')+x.text)].filter(Boolean).join('\n'),pinned,updatedAt,folder,...(record.etag?{revision:record.etag}:{})};
}
export async function notesList(deps={}) {
 const started=Date.now();let sourceReads=0;
 const finish=(notes,cache)=>{
  const event={cache,sourceReads,durationMs:Date.now()-started,count:notes.length};
  try{if(deps.observeList)deps.observeList(event);else console.info('notes-list',JSON.stringify(event));}catch{}
  return notes;
 };
 const load=deps.load||read, metadata=deps.listMetadata||listMetadata;
 const [listing, cached]=await Promise.allSettled([metadata('notes/'), (deps.loadIndex||read)(INDEX_PATH)]);
 if(listing.status==='rejected')throw listing.reason;
 const index=cached.status==='fulfilled'?cached.value:null;
 const old=validIndex(index?.value)?new Map(index.value.rows.map(r=>[r.path,r])):new Map();
 for(let attempt=0;attempt<2;attempt++){
  const entries=attempt===0?listing.value:await metadata('notes/'),stamp=signature(entries);
  if(entries.every(e=>typeof e.etag==='string'&&e.etag)&&validIndex(index?.value)&&index.value.stamp===stamp)return finish(index.value.rows.map(r=>r.note).filter(Boolean).sort(order),'hit');
  const rows=[];
  for(let i=0;i<entries.length;i+=15){
   rows.push(...await Promise.all(entries.slice(i,i+15).map(async e=>{
    const key=signature([e]),cached=old.get(e.pathname);
    // ETags identify content even when size and upload timestamp are identical.
    if(e.etag&&cached?.stamp===key)return cached;
    sourceReads++;const record=await load(e.pathname);
    return {path:e.pathname,stamp:key,note:summarize(record),consistent:!e.etag || contentTag(record?.etag)===contentTag(e.etag)};
   })));
  }
  const after=await metadata('notes/');
  if(signature(after)!==stamp)continue;
  // If a provider uses incompatible ETag representations, serve fresh source rows
  // without publishing an index whose content identity we cannot prove.
  if(rows.some(r=>r.consistent===false))return finish(rows.map(r=>r.note).filter(Boolean).sort(order),'source-fallback');
  const clean=rows.map(({path,stamp,note})=>({path,stamp,note}));
  try{await (deps.saveIndex||write)(INDEX_PATH,{version:2,stamp,rows:clean},index?.etag);}catch{}
  return finish(clean.map(r=>r.note).filter(Boolean).sort(order),'rebuilt');
 }
 throw new HttpError(503,'Notes đang thay đổi. Hãy thử tải lại; bản đang nhập vẫn được giữ.');
}
const order=(a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt);
export function listResponse(notes, known) {
 if(known===undefined)return {notes};
 if(typeof known!=='string'||known.length>6000)throw new HttpError(400,'Yêu cầu đồng bộ không hợp lệ.');
 let pairs;try{pairs=JSON.parse(known);}catch{throw new HttpError(400,'Yêu cầu đồng bộ không hợp lệ.');}
 if(!Array.isArray(pairs)||pairs.length>500||pairs.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='string'||v.length>200)))throw new HttpError(400,'Yêu cầu đồng bộ không hợp lệ.');
 const versions=new Map(pairs),ids=new Set(notes.map(n=>n.id));
 return {delta:true,notes:notes.filter(n=>!n.revision||versions.get(n.id)!==n.revision),removed:[...versions.keys()].filter(id=>!ids.has(id))};
}
