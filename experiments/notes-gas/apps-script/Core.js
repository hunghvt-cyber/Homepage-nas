/* Pure state machine. Same source runs on Apps Script V8 and in Node VM tests. */
var NotesCore = (function () {
  'use strict';
  const DAY = 86400000;
  const fail = (status, code) => { const e = new Error(code); e.status = status; throw e; };
  const clone = x => JSON.parse(JSON.stringify(x));
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function str(x, max, required) {
    if (typeof x !== 'string' || x.length > max || (required && !x.trim())) fail(400, 'INVALID_TEXT');
    return x;
  }
  function id(x) { if (typeof x !== 'string' || !/^[0-9a-f-]{36}$/.test(x)) fail(400, 'INVALID_ID'); return x; }
  function input(b, bytes) {
    const seen = new Set();
    const items=b.checklist===undefined?[]:b.checklist;
    if (!Array.isArray(items) || items.length > 200) fail(400, 'INVALID_CHECKLIST');
    const checklist = items.map(x => {
      if (!x || typeof x.id!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(x.id) || seen.has(x.id) || typeof x.checked !== 'boolean') fail(400, 'INVALID_CHECKLIST');
      seen.add(x.id); return {id:x.id, text:str(x.text,2000), checked:x.checked};
    });
    const n = {title:str(b.title,200,true),text:str(b.text,1000000),folder:str(b.folder ?? '',80).trim(),pinned:b.pinned===true,checklist};
    if (bytes(n.text)+bytes(JSON.stringify(checklist))>1000000) fail(413,'NOTE_TOO_LARGE');
    return n;
  }
  function empty() { return {schema:1, revision:0, notes:{}, shares:{}, index:[], receipts:{}}; }
  function summary(n) {
    return {id:n.id,title:n.title,text:[n.text,...n.checklist.map(x=>(x.checked?'☑ ':'☐ ')+x.text)].join('\n').slice(0,180),folder:n.folder,pinned:n.pinned,updatedAt:n.updatedAt,revision:n.revision};
  }
  function publicNote(n) { return {id:n.id,title:n.title,text:n.text,checklist:n.checklist,updatedAt:n.updatedAt,revision:n.revision}; }
  function active(s, key) { const n = s.notes[id(key)]; if (!n || n.deleted) fail(404,'NOTE_NOT_FOUND'); return n; }
  function match(n, revision) { if (n && revision !== n.revision || !n && revision) fail(409,'REVISION_CONFLICT'); }
  function share(s, token, env) {
    if (typeof token!=='string' || !/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) fail(404,'SHARE_NOT_FOUND');
    const [key,secret]=token.split('.'), r=s.shares[key];
    if (!r || r.revoked || !env.equal(env.hash(secret),r.tokenHash)) fail(404,'SHARE_NOT_FOUND');
    return r;
  }
  function execute(source, req, env) {
    const s=clone(source), b=req.payload || {}, now=env.now(), at=new Date(now).toISOString();
    if (s.schema!==1) fail(503,'SCHEMA_UNSUPPORTED');
    const shared=req.actor==='share';
    if (!shared && req.actor!=='owner') fail(403,'ACTOR_REQUIRED');
    const cap=shared ? share(s,b.token,env) : null;
    const allowed=shared ? ['list','get','save','search'] : ['list','get','save','delete','folderDelete','shareCreate','shareRevoke','shareList','restore','backup','search'];
    if (!allowed.includes(req.op)) fail(403,'OP_FORBIDDEN');
    const scoped = n => !cap || (cap.type==='folder' ? n.folder===cap.folder : n.id===cap.noteId);
    const get = key => { const n=active(s,key); if(!scoped(n))fail(404,'NOTE_NOT_FOUND'); return n; };
    const mutating=!['list','get','shareList','backup','search'].includes(req.op);
    if (mutating) {
      if (!/^[0-9a-f-]{36}$/.test(req.requestId || '') || !Number.isSafeInteger(req.issuedAt) || req.issuedAt>now+60000 || now-req.issuedAt>DAY) fail(400,'IDEMPOTENCY_EXPIRED_OR_INVALID');
      // Include actor, capability and issuedAt; never reuse a key with another operation.
      const fingerprint=env.hash(JSON.stringify({actor:req.actor,op:req.op,payload:b,issuedAt:req.issuedAt}));
      const receipt=s.receipts[req.requestId];
      if (receipt) {
        if (receipt.fingerprint!==fingerprint) fail(409,'IDEMPOTENCY_KEY_REUSED');
        return {state:source, changed:false, result:clone(receipt.result)};
      }
      for (const key of Object.keys(s.receipts)) if(now-s.receipts[key].at>DAY+60000)delete s.receipts[key];
      if(Object.keys(s.receipts).length>=2000)fail(503,'RECEIPT_CAPACITY');
    }
    let result;
    if (req.op==='list' || req.op==='search') {
      if(cap && cap.type!=='folder')fail(403,'FOLDER_CAPABILITY_REQUIRED');
      const q=str(b.query ?? '',200).toLocaleLowerCase();
      let notes=s.index.filter(n=>scoped(n)&&(!b.folder||n.folder===b.folder));
      if(req.op==='search')notes=notes.filter(n=>{const v=s.notes[n.id];return [v.title,v.text,v.folder,...v.checklist.map(x=>x.text)].join('\n').toLocaleLowerCase().includes(q);});
      if(b.known!==undefined) {
        if(!Array.isArray(b.known)||b.known.length>500||b.known.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='string'||v.length>200)))fail(400,'INVALID_KNOWN');
        const known=new Map(b.known), ids=new Set(notes.map(n=>n.id));
        result={delta:true,notes:notes.filter(n=>known.get(n.id)!==n.revision),removed:b.known.map(p=>p[0]).filter(key=>!ids.has(key)),revision:String(s.revision)};
      } else result={notes,revision:String(s.revision)};
    } else if(req.op==='get') {
      const n=get(b.id); result=b.revision===n.revision ? {notModified:true,revision:n.revision} : shared?publicNote(n):n;
    } else if(req.op==='backup') {
      result={schema:s.schema,revision:s.revision,notes:s.notes,shares:s.shares,index:s.index,exportedAt:at};
    } else if(req.op==='shareList') {
      result={links:Object.entries(s.shares).filter(([,r])=>b.folder?r.type==='folder'&&r.folder===b.folder:r.noteId===b.noteId).map(([key,r])=>({id:key,revoked:r.revoked,type:r.type}))};
    } else if(req.op==='shareCreate') {
      if(!/^[a-f0-9]{32}$/.test(b.shareId || '')||!/^[a-f0-9]{64}$/.test(b.tokenHash || ''))fail(400,'INVALID_SHARE');
      if(own(s.shares,b.shareId))fail(409,'SHARE_EXISTS');
      let scope;
      if(b.folder) {const folder=str(b.folder,80,true).trim();if(!s.index.some(n=>n.folder===folder))fail(404,'FOLDER_NOT_FOUND');scope={type:'folder',folder};}
      else {get(b.noteId);scope={type:'note',noteId:b.noteId};}
      s.shares[b.shareId]={...scope,tokenHash:b.tokenHash,revoked:false,createdAt:at};result={id:b.shareId};
    } else if(req.op==='shareRevoke') {
      if(!/^[a-f0-9]{32}$/.test(b.shareId || '')||!s.shares[b.shareId])fail(404,'SHARE_NOT_FOUND');
      s.shares[b.shareId].revoked=true;result={revoked:true};
    } else if(req.op==='folderDelete') {
      const folder=str(b.folder,80,true).trim();
      if(typeof b.deleteNotes!=='boolean')fail(400,'INVALID_DELETE_OPTION');
      // Whole-store precondition prevents bulk edits from silently targeting newer notes.
      if(b.revision!==String(s.revision))fail(409,'REVISION_CONFLICT');
      if(Object.values(s.shares).some(r=>r.type==='folder'&&r.folder===folder&&!r.revoked))fail(409,'REVOKE_FOLDER_FIRST');
      let changed=0;
      for(const n of Object.values(s.notes))if(!n.deleted&&n.folder===folder){n.history=[clone({...n,history:undefined}),...n.history].slice(0,5);if(b.deleteNotes)n.deleted=true;else n.folder='';n.revision='r'+(s.revision+1);n.updatedAt=at;changed++;}
      result={changed};
    } else if(req.op==='delete') {
      const n=get(b.id);match(n,b.revision);n.history=[clone({...n,history:undefined}),...n.history].slice(0,5);n.deleted=true;n.revision='r'+(s.revision+1);n.updatedAt=at;result={deleted:true};
    } else {
      const key=id(b.id), old=s.notes[key];
      if(old && (old.deleted && req.op!=='restore' || !scoped(old)))fail(409,'NOTE_UNAVAILABLE');
      if(req.op==='restore'&&!old)fail(404,'NOTE_NOT_FOUND');
      if(shared&&cap.type==='note'&&!old)fail(403,'CREATE_FORBIDDEN');
      match(old,b.revision);
      if(!old&&Object.keys(s.notes).length>=500)fail(413,'NOTE_CAPACITY');
      let data=b;
      if(req.op==='restore') {
        if(!Number.isInteger(b.historyIndex)||b.historyIndex<0||!old.history[b.historyIndex])fail(400,'INVALID_HISTORY');
        data={...old,...old.history[b.historyIndex]};
      }
      if(shared) {
        if(cap.type==='note'&&!old)fail(403,'CREATE_FORBIDDEN');
        data={...data,folder:cap.type==='folder'?cap.folder:old.folder,pinned:old?.pinned||false};
      }
      const v=input({...data,checklist:data.checklist??old?.checklist??[]},env.bytes);
      const history=old?[clone({...old,history:undefined}),...old.history].slice(0,5):[];
      const n={id:key,...v,revision:'r'+(s.revision+1),updatedAt:at,history};
      while(env.bytes(JSON.stringify(n))>3000000&&history.length)history.pop();
      if(env.bytes(JSON.stringify(n))>3000000)fail(413,'NOTE_TOO_LARGE');
      s.notes[key]=n; result=shared?publicNote(n):n;
    }
    if(mutating) {
      s.revision++;
      s.index=Object.values(s.notes).filter(n=>!n.deleted).map(summary).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
      // Receipt contains only the result, never raw capability secrets.
      s.receipts[req.requestId]={at:now,fingerprint:env.hash(JSON.stringify({actor:req.actor,op:req.op,payload:b,issuedAt:req.issuedAt})),result};
      if(env.bytes(JSON.stringify(s))>20000000)fail(413,'SNAPSHOT_CAPACITY');
    }
    return {state:s,changed:mutating,result:clone(result)};
  }
  return {empty,execute,validateRecord:function(n,bytes){id(n.id);input(n,bytes);if(!Array.isArray(n.history)||n.history.length>5)fail(400,'INVALID_BACKUP');n.history.forEach(function(h){input(h,bytes);});}};
}());
