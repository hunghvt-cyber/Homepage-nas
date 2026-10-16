/* Deploy only as a NEW standalone Apps Script project. No existing integrations. */
function ngHash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}
function ngMac_(s,key) {
  return Utilities.computeHmacSha256Signature(s,key,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}
function ngEqual_(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
function ngBytes_(s) {return Utilities.newBlob(s).getBytes().length;}
function ngError_(status,code) {var e=new Error(code);e.status=status;throw e;}
function ngTimed_(timings,name,fn) {
  var started=Date.now();try{return fn();}finally{if(timings)timings[name]=(timings[name]||0)+Date.now()-started;}
}
// Optional owner-list preview cache only. Writes/details/ACL always load Drive.
function ngIndexCache_(props,state) {
  try {
    var raw=props.getProperty('NOTES_HEAD');if(!raw)return null;
    var head=JSON.parse(raw),cache=CacheService.getScriptCache(),key='ng-index-'+ngHash_(raw);
    if(state){
      if(state.revision!==head.revision)return null;
      var data=JSON.stringify({schema:1,revision:state.revision,index:state.index}),parts=[],offset=0;
      while(offset<data.length){var end=Math.min(offset+20000,data.length);if(end<data.length&&/[\uD800-\uDBFF]/.test(data.charAt(end-1)))end--;parts.push(data.slice(offset,end));offset=end;}
      if(parts.length>30)return null;
      var values={};values[key]=JSON.stringify({count:parts.length,hash:ngHash_(data)});
      parts.forEach(function(part,i){values[key+'-'+i]=part;});cache.putAll(values,300);return null;
    }
    var meta=JSON.parse(cache.get(key)||'null');if(!meta||!Number.isInteger(meta.count)||meta.count<1||meta.count>30)return null;
    var keys=[];for(var i=0;i<meta.count;i++)keys.push(key+'-'+i);
    var found=cache.getAll(keys);if(keys.some(function(k){return typeof found[k]!=='string';}))return null;
    var data=keys.map(function(k){return found[k];}).join('');if(ngHash_(data)!==meta.hash)return null;
    var value=JSON.parse(data);if(value.schema!==1||value.revision!==head.revision||!Array.isArray(value.index))return null;
    return {state:{schema:1,revision:value.revision,index:value.index,notes:{},shares:{},receipts:{}},raw:raw,head:head};
  }catch(_){return null;}
}
function ngPreparePool_(props) {
  var raw=props.getProperty('NOTES_POOL');
  if(raw){var ids=JSON.parse(raw);if(!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3)ngError_(503,'POOL_INVALID');return ids;}
  var folder=DriveApp.getFolderById(props.getProperty('NOTES_ROOT_FOLDER_ID'));
  if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE)ngError_(503,'FOLDER_MUST_BE_PRIVATE');
  var ids=[];for(var i=0;i<3;i++)ids.push(folder.createFile(Utilities.newBlob('{"unused":true}','application/json','notes-trial-slot-'+i+'.json')).getId());
  props.setProperty('NOTES_POOL',JSON.stringify(ids));return ids;
}
function ngRepository_(props,timings,options) {
  return {
    load:function() {
      var raw=ngTimed_(timings,'headRead',function(){return props.getProperty('NOTES_HEAD');});
      if(!raw)ngError_(503,'NOT_INITIALIZED');
      var head=JSON.parse(raw), file=ngTimed_(timings,'fileLookup',function(){return DriveApp.getFileById(head.id);});
      ngTimed_(timings,'fileValidation',function(){
        var folderId=props.getProperty('NOTES_ROOT_FOLDER_ID'),parents=file.getParents(),found=false;
        while(parents.hasNext())if(parents.next().getId()===folderId)found=true;
        if(!found||file.isTrashed())ngError_(503,'HEAD_UNAVAILABLE');
      });
      var data=ngTimed_(timings,'snapshotRead',function(){return file.getBlob().getDataAsString('UTF-8');});
      if(ngHash_(data)!==head.hash)ngError_(503,'SNAPSHOT_CORRUPT');
      var state=JSON.parse(data);
      if(state.schema!==1||state.revision!==head.revision||!Array.isArray(state.index)||!state.notes||!state.shares||!state.receipts)ngError_(503,'SNAPSHOT_CORRUPT');
      return {state:state,head:head,raw:raw};
    },
    commit:function(state,previous) {
      var data=ngTimed_(timings,'snapshotSerialize',function(){return JSON.stringify(state);}),hash=ngHash_(data);
      if(ngBytes_(data)>20000000)ngError_(413,'SNAPSHOT_CAPACITY');
      // Immutable candidate: a failed create/read-back never moves HEAD.
      var folder=ngTimed_(timings,'folderLookup',function(){return DriveApp.getFolderById(props.getProperty('NOTES_ROOT_FOLDER_ID'));});
      var file;
      if(options&&options.pool&&ngBytes_(data)<=9000000){
        var ids=ngPreparePool_(props),candidate=ids.filter(function(id){return id!==previous.head.id&&id!==previous.head.previous;})[0];
        if(!candidate)ngError_(503,'POOL_NO_SAFE_SLOT');
        file=DriveApp.getFileById(candidate);
        var parents=file.getParents(),inside=false;while(parents.hasNext())if(parents.next().getId()===folder.getId())inside=true;
        if(!inside||file.isTrashed())ngError_(503,'POOL_UNAVAILABLE');
        if(props.getProperty('NOTES_HEAD')!==previous.raw)ngError_(409,'HEAD_CHANGED');
        ngTimed_(timings,'snapshotOverwrite',function(){file.setContent(data);});
      }else file=ngTimed_(timings,'snapshotCreate',function(){return folder.createFile(Utilities.newBlob(data,'application/json','snapshot-'+state.revision+'-'+Utilities.getUuid()+'.json'));});
      ngTimed_(timings,'snapshotReadback',function(){if(ngHash_(file.getBlob().getDataAsString('UTF-8'))!==hash)ngError_(503,'WRITE_VERIFY_FAILED');});
      ngTimed_(timings,'headPrecondition',function(){if(props.getProperty('NOTES_HEAD')!==previous.raw)ngError_(409,'HEAD_CHANGED');});
      var head={id:file.getId(),hash:hash,revision:state.revision,previous:previous.head.id};
      var raw=JSON.stringify(head);
      // Single commit pointer; exceptions here are ambiguous, resolved by retry/load.
      ngTimed_(timings,'headPublish',function(){props.setProperty('NOTES_HEAD',raw);if(props.getProperty('NOTES_HEAD')!==raw)ngError_(503,'COMMIT_UNCERTAIN');});
    }
  };
}
// Bounded operational journal; independent of Drive/HEAD so corruption remains diagnosable.
var NG_BUILD_ = 'notes-gas-per-note-v5';
function ngAuditRead_(props) {
  var raw=props.getProperty('NOTES_OPS_LOG');
  if(!raw)return {schema:1,events:[]};
  var log=JSON.parse(raw);
  if(log.schema!==1||!Array.isArray(log.events))ngError_(503,'AUDIT_UNAVAILABLE');
  return log;
}
function ngAudit_(props,event,held,authenticated) {
  // Construct a fresh allowlisted record. Never stringify a request or raw error.
  var row={at:new Date().toISOString(),reference:event.reference,build:NG_BUILD_,
    operation:event.operation,stage:event.stage,status:event.status,code:event.code,
    durationMs:Math.max(0,Date.now()-event.started)};
  if(event.timings){row.timings={};['auth','lockWait','auditStart','headRead','fileLookup','fileValidation','snapshotRead','loadTotal','core','snapshotSerialize','folderLookup','snapshotCreate','snapshotOverwrite','indexCacheRead','indexCacheSeed','snapshotReadback','headPrecondition','headPublish','commitTotal','manifestRead','manifestWrite','noteRead','noteWrite','receiptRead','shardLoad','shardCommit','shardPublish'].forEach(function(name){var value=event.timings[name];if(Number.isFinite(value)&&value>=0)row.timings[name]=value;});}
  try {console.log(JSON.stringify(row));}catch(_){}
  // Reject noise before persisting. Do not acquire/wait for another lock just to log.
  if(!held||!authenticated)return false;
  try {
    var log;try{log=ngAuditRead_(props);}catch(_){return false;}
    log.events.push(row);log.events=log.events.slice(-30);
    while(ngBytes_(JSON.stringify(log))>8000&&log.events.length>1)log.events.shift();
    props.setProperty('NOTES_OPS_LOG',JSON.stringify(log));
    if(row.status>=400)props.setProperty('NOTES_LAST_ERROR',JSON.stringify(row));
    return true;
  }catch(_){return false;}
}
function ngHealth_(props,repo) {
  var current=repo.load(),last=props.getProperty('NOTES_LAST_ERROR');
  return {service:'notes-prototype',build:NG_BUILD_,schema:current.state.schema,
    revision:current.state.revision,activeNotes:current.state.index.length,
    records:Object.keys(current.state.notes).length,readVerified:true,
    journalAvailable:!!props.getProperty('NOTES_OPS_LOG'),lastError:last?JSON.parse(last):null};
}
// Safe editor check for existing stores. Does not reinitialize or change HEAD.
function checkNotesPrototype() {
  var props=PropertiesService.getScriptProperties(),lock=LockService.getScriptLock();
  lock.waitLock(1500);
  var event={reference:'GAS-'+Utilities.getUuid().slice(0,8),operation:'health',stage:'read',status:200,code:'OK',started:Date.now()};
  try {
    var health=ngHealth_(props,ngRepository_(props));
    console.log(JSON.stringify(health));
  }catch(err){event.status=err.status||503;event.code=err.status?err.message:'STORAGE_UNAVAILABLE';throw new Error(event.code);}
  finally{ngAudit_(props,event,true,true);lock.releaseLock();}
}
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ok:false,status:405,code:'POST_REQUIRED'})).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  var key,requestId='',result,lock,authenticated=false,timings={};
  var event={reference:'GAS-'+Utilities.getUuid().slice(0,8),operation:'unknown',stage:'auth',status:503,code:'STORAGE_UNAVAILABLE',started:Date.now()};
  try {
    var props=PropertiesService.getScriptProperties();
    key=props.getProperty('NOTES_HMAC_KEY');
    if(!key||!/^[a-f0-9]{64}$/.test(key))ngError_(503,'NOT_CONFIGURED');
    var raw=e&&e.postData&&e.postData.contents;
    if(typeof raw!=='string'||ngBytes_(raw)>3100000)ngError_(413,'REQUEST_TOO_LARGE');
    var envelope;try{envelope=JSON.parse(raw);}catch(_){ngError_(400,'INVALID_JSON');}
    if(envelope.v!==1||typeof envelope.request!=='string'||!Number.isSafeInteger(envelope.sentAt)||Math.abs(Date.now()-envelope.sentAt)>300000)ngError_(401,'AUTH_EXPIRED');
    if(!ngEqual_(ngMac_('request\n'+envelope.sentAt+'\n'+envelope.request,key),envelope.signature))ngError_(401,'AUTH_INVALID');
    var req;try{req=JSON.parse(envelope.request);}catch(_){ngError_(400,'INVALID_JSON');}
    if(!/^[0-9a-f-]{36}$/.test(req.requestId||''))ngError_(400,'REQUEST_ID_REQUIRED');
    requestId=req.requestId;authenticated=true;timings.auth=Date.now()-event.started;
    var ops=['list','get','save','delete','restore','folderDelete','shareCreate','shareRevoke','shareList','backup','search','health','logs','ping','preparePool','shardInit','shardSeed','shardRestore','shardExport'];
    event.operation=ops.indexOf(req.op)>=0?req.op:'unsupported';event.stage='lock';
    // Lock reads too: permission validation and snapshot publication share one order.
    lock=LockService.getScriptLock();ngTimed_(timings,'lockWait',function(){if(!lock.tryLock(1500))ngError_(503,'BUSY');});
    ngTimed_(timings,'auditStart',function(){ngAudit_(props,{reference:event.reference,operation:event.operation,stage:'start',status:102,code:'STARTED',started:event.started},true,true);});
    var optimized=!!(req.payload&&req.payload.optimized===true),repo=ngRepository_(props,timings,{pool:optimized&&req.payload.poolTrial===true}),output;event.stage='read';
    if(req.payload&&req.payload.perNote===true){
      if(req.op==='health'&&req.actor!=='owner')ngError_(403,'OP_FORBIDDEN');
      result={ok:true,status:200,result:ngShardExecute_(props,timings,req)};
    }else if(req.op==='health'||req.op==='logs'||req.op==='ping'||req.op==='preparePool'){
      if(req.actor!=='owner')ngError_(403,'OP_FORBIDDEN');
      result={ok:true,status:200,result:req.op==='preparePool'?{prepared:ngPreparePool_(props).length===3,build:NG_BUILD_}:req.op==='ping'?{service:'notes-prototype',build:NG_BUILD_,pong:true}:req.op==='health'?ngHealth_(props,repo):ngAuditRead_(props)};
    }else{
      var current;
      if(optimized&&req.actor==='owner'&&req.op==='list')current=ngTimed_(timings,'indexCacheRead',function(){return ngIndexCache_(props);});
      timings.indexCacheHit=current?1:0;
      if(!current)current=ngTimed_(timings,'loadTotal',function(){return repo.load();});
      event.stage='validate';
      output=ngTimed_(timings,'core',function(){return NotesCore.execute(current.state,req,{now:Date.now,hash:ngHash_,equal:ngEqual_,bytes:ngBytes_});});
      result={ok:true,status:200,result:output.result};
    }
    // Reject oversized wire responses before publishing any mutation.
    if(ngBytes_(JSON.stringify({body:JSON.stringify(result),signature:'0'.repeat(64)}))>3999000)ngError_(413,'RESPONSE_TOO_LARGE');
    if(output&&output.changed){event.stage='commit';ngTimed_(timings,'commitTotal',function(){repo.commit(output.state,current);});}
    if(optimized&&output&&req.actor==='owner'&&(output.changed||req.op==='list'&&!timings.indexCacheHit))ngTimed_(timings,'indexCacheSeed',function(){ngIndexCache_(props,output.state);});
    event.stage='complete';event.status=200;event.code='OK';
  } catch(err) {
    // No raw Drive errors, secrets, IDs or note content in logs/responses.
    result={ok:false,status:err.status||503,code:err.status?err.message:'STORAGE_UNAVAILABLE'};
    event.status=result.status;event.code=result.code;
  } finally {
    var held=!!(lock&&lock.hasLock());
    if(authenticated&&req.actor==='owner'&&req.payload&&req.payload.profile===true)event.timings=timings;
    var persisted=ngTimed_(timings,'auditEnd',function(){return ngAudit_(props,event,held,authenticated);});
    if(result)result.observability={reference:event.reference,persisted:persisted,build:NG_BUILD_};
    if(held)lock.releaseLock();
    if(result&&authenticated&&req.actor==='owner'&&req.payload&&req.payload.profile===true){timings.serverTotal=Date.now()-event.started;result.observability.timings=timings;}
  }
  var body=JSON.stringify(result);
  return ContentService.createTextOutput(JSON.stringify({body:body,signature:key?ngMac_('response\n'+requestId+'\n'+body,key):''})).setMimeType(ContentService.MimeType.JSON);
}
/* Run once from the editor after setting NOTES_HMAC_KEY. Never called over HTTP. */
function initializeNotesPrototype() {
  var lock=LockService.getScriptLock();lock.waitLock(1500);
  try {
    var props=PropertiesService.getScriptProperties();
    if(props.getProperty('NOTES_ROOT_FOLDER_ID')||props.getProperty('NOTES_HEAD'))throw new Error('ALREADY_INITIALIZED');
    if(!/^[a-f0-9]{64}$/.test(props.getProperty('NOTES_HMAC_KEY')||''))throw new Error('SET_NOTES_HMAC_KEY_FIRST');
    var folder=DriveApp.createFolder('Homepage Notes PROTOTYPE - synthetic data only');
    if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE)throw new Error('FOLDER_MUST_BE_PRIVATE');
    props.setProperty('NOTES_ROOT_FOLDER_ID',folder.getId());
    // A failure leaves the project blocked for inspection, never silently reset.
    ngRepository_(props).commit(NotesCore.empty(),{raw:null,head:{id:null}});
    ngAudit_(props,{reference:'GAS-'+Utilities.getUuid().slice(0,8),operation:'initialize',stage:'complete',status:200,code:'OK',started:Date.now()},true,true);
    console.log('Prototype initialized: private folder and empty revision 0.');
  } finally {lock.releaseLock();}
}
