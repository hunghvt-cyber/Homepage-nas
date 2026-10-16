/* Opt-in per-note experiment. Concatenated into Server on deploy; separate HEADs.
 * Bodies are immutable; one immutable manifest commits bodies/index/ACL/receipts.
 * Index is authoritative in this design, not merely an eventually-consistent cache.
 * All callers must hold the existing ScriptLock, including shared reads/revoke. */
function ngShardSummary_(n) {
  return {id:n.id,title:n.title,text:[n.text].concat(n.checklist.map(function(x){return (x.checked?'☑ ':'☐ ')+x.text;})).join('\n').slice(0,180),folder:n.folder,pinned:n.pinned,updatedAt:n.updatedAt,revision:n.revision};
}
function ngShardPublic_(n) {return {id:n.id,title:n.title,text:n.text,checklist:n.checklist,updatedAt:n.updatedAt,revision:n.revision};}
function ngShardRepository_(props,timings,recovery) {
  var key=recovery?'NOTES_SHARD_RESTORE_HEAD':'NOTES_SHARD_HEAD';
  var folderId=props.getProperty('NOTES_ROOT_FOLDER_ID'),verified={};
  function read(ref,kind) {
    var cacheKey=ref&&ref.id+':'+ref.hash;if(verified[cacheKey])return JSON.parse(JSON.stringify(verified[cacheKey]));
    return ngTimed_(timings,kind+'Read',function(){
      if(!ref||typeof ref.id!=='string'||!/^[a-f0-9]{64}$/.test(ref.hash||''))ngError_(503,'SHARD_REFERENCE_INVALID');
      var file=DriveApp.getFileById(ref.id),parents=file.getParents(),inside=false;
      while(parents.hasNext())if(parents.next().getId()===folderId)inside=true;
      if(!inside||file.isTrashed())ngError_(503,'SHARD_FILE_UNAVAILABLE');
      var data=file.getBlob().getDataAsString('UTF-8');if(ngHash_(data)!==ref.hash)ngError_(503,'SHARD_HASH_MISMATCH');
      var value=JSON.parse(data);verified[cacheKey]=value;return JSON.parse(JSON.stringify(value));
    });
  }
  function write(value,kind) {
    return ngTimed_(timings,kind+'Write',function(){
      var data=JSON.stringify(value);if(ngBytes_(data)>3000000)ngError_(413,'SHARD_FILE_CAPACITY');
      var file=DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(data,'application/json','shard-'+kind+'-'+Utilities.getUuid()+'.json'));
      if(ngHash_(file.getBlob().getDataAsString('UTF-8'))!==ngHash_(data))ngError_(503,'WRITE_VERIFY_FAILED');
      return {id:file.getId(),hash:ngHash_(data)};
    });
  }
  function receiptResult(r) {
    if(!r.resultRef)return r.result;
    var doc=read(r.resultRef,'receipt');if(doc.schema!==2||!doc.note)ngError_(503,'SHARD_NOTE_INVALID');
    return r.public?ngShardPublic_(doc.note):doc.note;
  }
  function load(req,full) {
    var raw=props.getProperty(key);if(!raw)ngError_(503,'SHARD_NOT_INITIALIZED');
    var head=JSON.parse(raw),m=read(head,'manifest');
    if(m.schema!==2||m.revision!==head.revision||!m.records||!m.shares||!m.receipts||!Array.isArray(m.index))ngError_(503,'SHARD_MANIFEST_INVALID');
    var state={schema:1,revision:m.revision,notes:{},shares:m.shares,index:m.index,receipts:JSON.parse(JSON.stringify(m.receipts))},rows={};
    m.index.forEach(function(row){rows[row.id]=row;});
    Object.keys(m.records).forEach(function(id){
      var r=m.records[id],row=rows[id];
      if(r.deleted===false&&!row||row&&row.revision!==r.revision)ngError_(503,'SHARD_INDEX_INVALID');
      state.notes[id]=Object.assign({id:id,title:'',text:'',folder:'',pinned:false,updatedAt:'',checklist:[],history:[]},row||{}, {revision:r.revision,deleted:r.deleted});
    });
    if(m.index.some(function(row){return !m.records[row.id]||m.records[row.id].deleted;}))ngError_(503,'SHARD_INDEX_INVALID');
    var b=req&&req.payload||{},ids=full?Object.keys(m.records):b.id&&m.records[b.id]?[b.id]:[];
    ids.forEach(function(id){var doc=read(m.records[id].ref,'note');if(doc.schema!==2||!doc.note||doc.note.id!==id||doc.note.revision!==m.records[id].revision)ngError_(503,'SHARD_NOTE_INVALID');state.notes[id]=doc.note;});
    if(full)Object.keys(state.receipts).forEach(function(id){state.receipts[id].result=receiptResult(state.receipts[id]);});
    else if(req&&state.receipts[req.requestId])state.receipts[req.requestId].result=receiptResult(state.receipts[req.requestId]);
    return {state:state,manifest:m,head:head,raw:raw,loaded:ids};
  }
  function commit(state,previous,restoreHash) {
    var before=previous&&previous.manifest,records=JSON.parse(JSON.stringify(before?before.records:{})),receipts=JSON.parse(JSON.stringify(state.receipts));
    if(Object.keys(state.notes).length>500)ngError_(413,'NOTE_CAPACITY');
    Object.keys(state.notes).forEach(function(id){
      var n=state.notes[id],old=records[id];
      if(!old||old.revision!==n.revision)records[id]={revision:n.revision,deleted:!!n.deleted,bytes:ngBytes_(JSON.stringify(n)),ref:write({schema:2,note:n},'note')};
    });
    Object.keys(receipts).forEach(function(id){
      // Preserve old immutable receipt refs, even when its note has since changed.
      if(before&&before.receipts[id]){receipts[id]=before.receipts[id];return;}
      var r=receipts[id],n=r.result;
      if(n&&n.id&&records[n.id]&&n.revision===records[n.id].revision){r.resultRef=records[n.id].ref;r.public=!Object.prototype.hasOwnProperty.call(n,'history');delete r.result;}
    });
    var m={schema:2,revision:state.revision,records:records,index:state.index,shares:state.shares,receipts:receipts};
    if(Object.values(records).reduce(function(sum,r){return sum+r.bytes;},0)+ngBytes_(JSON.stringify(m))>20000000)ngError_(413,'SNAPSHOT_CAPACITY');
    var ref=write(m,'manifest');ref.revision=state.revision;ref.previous=previous&&previous.head.id||null;if(restoreHash)ref.restoreHash=restoreHash;
    if(props.getProperty(key)!==(previous?previous.raw:null))ngError_(409,'HEAD_CHANGED');
    var raw=JSON.stringify(ref);ngTimed_(timings,'shardPublish',function(){props.setProperty(key,raw);if(props.getProperty(key)!==raw)ngError_(503,'COMMIT_UNCERTAIN');});
  }
  function initialize() {
    if(props.getProperty(key))return {initialized:true,existing:true};
    if(!folderId||DriveApp.getFolderById(folderId).getSharingAccess()!==DriveApp.Access.PRIVATE)ngError_(503,'FOLDER_MUST_BE_PRIVATE');
    commit(NotesCore.empty(),null);return {initialized:true,existing:false};
  }
  function restore(state) {
    if(!recovery)ngError_(409,'RESTORE_TARGET_NOT_EMPTY');
    var restoreHash=ngHash_(JSON.stringify(state)),existing=props.getProperty(key);
    if(existing){if(JSON.parse(existing).restoreHash===restoreHash)return {restored:true,existing:true,revision:JSON.parse(existing).revision};ngError_(409,'RESTORE_TARGET_NOT_EMPTY');}
    if(!state||state.schema!==1||!Number.isSafeInteger(state.revision)||state.revision<0||!state.notes||!state.shares||!state.receipts||!Array.isArray(state.index))ngError_(400,'INVALID_BACKUP');
    Object.values(state.notes).forEach(function(n){NotesCore.validateRecord(n,ngBytes_);if(!/^r[1-9][0-9]*$/.test(n.revision||'')||Number(n.revision.slice(1))>state.revision||!Number.isFinite(Date.parse(n.updatedAt)))ngError_(400,'INVALID_BACKUP');});
    Object.entries(state.shares).forEach(function(pair){var id=pair[0],r=pair[1];if(!/^[a-f0-9]{32}$/.test(id)||!/^[a-f0-9]{64}$/.test(r.tokenHash||'')||typeof r.revoked!=='boolean'||['note','folder'].indexOf(r.type)<0||r.type==='note'&&!state.notes[r.noteId]||r.type==='folder'&&(typeof r.folder!=='string'||!r.folder||r.folder.length>80))ngError_(400,'INVALID_BACKUP');});
    if(Object.keys(state.receipts).length>2000)ngError_(400,'INVALID_BACKUP');
    Object.entries(state.receipts).forEach(function(pair){var r=pair[1];if(!/^[0-9a-f-]{36}$/.test(pair[0])||!Number.isSafeInteger(r.at)||!/^[a-f0-9]{64}$/.test(r.fingerprint||''))ngError_(400,'INVALID_BACKUP');});
    var rows=Object.values(state.notes).filter(function(n){return !n.deleted;}).map(ngShardSummary_).sort(function(a,b){return Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id);});
    if(JSON.stringify(rows)!==JSON.stringify(state.index)||Object.keys(state.notes).some(function(id){return state.notes[id].id!==id;}))ngError_(400,'INVALID_BACKUP');
    Object.values(state.receipts).forEach(function(r){if(!Object.prototype.hasOwnProperty.call(r,'result'))ngError_(400,'BACKUP_RECEIPT_MISSING');delete r.resultRef;delete r.public;});
    commit(state,null,restoreHash);return {restored:true,revision:state.revision,records:Object.keys(state.notes).length};
  }
  return {load:load,commit:commit,initialize:initialize,restore:restore};
}
function ngShardExecute_(props,timings,req) {
  var b=req.payload||{},recovery=b.shardStore==='recovery',repo=ngShardRepository_(props,timings,recovery);
  if(['shardInit','shardSeed','shardRestore','shardExport'].indexOf(req.op)>=0&&req.actor!=='owner')ngError_(403,'OP_FORBIDDEN');
  if(req.op==='shardInit')return repo.initialize();
  if(req.op==='shardRestore')return repo.restore(b.backup);
  var full=['search','backup','folderDelete','shardExport'].indexOf(req.op)>=0;
  var current=ngTimed_(timings,'shardLoad',function(){return repo.load(req,full);});
  if(req.op==='health')return {build:NG_BUILD_,revision:current.state.revision,activeNotes:current.state.index.length,records:Object.keys(current.state.notes).length,manifestVerified:true,readVerified:false};
  if(req.op==='shardExport'){Object.values(current.state.receipts).forEach(function(r){delete r.resultRef;delete r.public;});return {schema:1,revision:current.state.revision,notes:current.state.notes,shares:current.state.shares,index:current.state.index,receipts:current.state.receipts};}
  if(req.op==='shardSeed'){
    if(!Array.isArray(b.notes)||b.notes.length<1||b.notes.length>5)ngError_(400,'INVALID_SEED');
    // Resumable synthetic seeding: deterministic child IDs and issuedAt; no old notes overwritten.
    var state=current.state,changed=false;
    b.notes.forEach(function(n){if(!n.title||!n.title.startsWith('SYNTHETIC'))ngError_(400,'SYNTHETIC_ONLY');var child={op:'save',actor:'owner',requestId:n.id,issuedAt:req.issuedAt,payload:n};if(current.manifest.records[n.id]){var loaded=repo.load(child,false);state.notes[n.id]=loaded.state.notes[n.id];state.receipts[n.id]=loaded.state.receipts[n.id];}var out=NotesCore.execute(state,child,{now:Date.now,hash:ngHash_,equal:ngEqual_,bytes:ngBytes_});state=out.state;changed=changed||out.changed;});
    if(changed)repo.commit(state,current);return {seeded:b.notes.length,revision:state.revision,activeNotes:state.index.length};
  }
  var canonical=JSON.parse(JSON.stringify(req));delete canonical.payload.perNote;delete canonical.payload.shardStore;delete canonical.payload.profile;
  var out=ngTimed_(timings,'core',function(){return NotesCore.execute(current.state,canonical,{now:Date.now,hash:ngHash_,equal:ngEqual_,bytes:ngBytes_});});
  if(ngBytes_(JSON.stringify(out.result))>3900000)ngError_(413,'RESPONSE_TOO_LARGE');
  if(out.changed)ngTimed_(timings,'shardCommit',function(){repo.commit(out.state,current);});
  return out.result;
}
