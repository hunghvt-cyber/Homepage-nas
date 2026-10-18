/* Dedicated NAS reporting project. No Notes, expense or Gemini handlers. */
var NAS_BUILD='nas-drive-reports-v1';
function nrProps_(){return PropertiesService.getScriptProperties();}
function nrHash_(s){return nrHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8));}
function nrHex_(b){return b.map(function(x){return ('0'+((x+256)%256).toString(16)).slice(-2);}).join('');}
function nrMac_(s,key){return nrHex_(Utilities.computeHmacSha256Signature(s,key,Utilities.Charset.UTF_8));}
function nrSame_(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==64||b.length!==64)return false;var n=0;for(var i=0;i<64;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
function nrOutput_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function nrAssert_(ok,code){if(!ok)throw new Error(code);}
function nrKey_(){var key=nrProps_().getProperty('NAS_REPORT_KEY');nrAssert_(/^[a-f0-9]{64}$/.test(key||''),'NOT_CONFIGURED');return key;}
function nrHead_(){var s=nrProps_().getProperty('NAS_REPORT_HEAD');return s?JSON.parse(s):null;}
function nrRead_(head){
 nrAssert_(head&&head.current,'NO_REPORT');
 var raw=DriveApp.getFileById(head.current.fileId).getBlob().getDataAsString('UTF-8');
 nrAssert_(nrHash_(raw)===head.current.hash,'REPORT_HASH_MISMATCH');
 NasReportSchema.validate(JSON.parse(raw));return {ok:true,service:NAS_BUILD,payload:raw,sha256:head.current.hash,received_at:head.current.received_at||null};
}
function nrLog_(reference,op,code,started){
 var event={at:new Date().toISOString(),reference:reference,op:op,code:code,ms:Date.now()-started};
 try{console.log(JSON.stringify(event));}catch(_){}
 try{var p=nrProps_(),rows=JSON.parse(p.getProperty('NAS_REPORT_LOG')||'[]');rows.push(event);p.setProperty('NAS_REPORT_LOG',JSON.stringify(rows.slice(-30)));}catch(_){}
}
function initializeNasReports(){
 var lock=LockService.getScriptLock();lock.waitLock(5000);
 try{var p=nrProps_();if(!p.getProperty('NAS_REPORT_KEY'))p.setProperty('NAS_REPORT_KEY',(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''));
  nrKey_();if(!p.getProperty('NAS_REPORT_FOLDER'))p.setProperty('NAS_REPORT_FOLDER',DriveApp.createFolder('Homepage NAS Reports').getId());
  console.log(JSON.stringify({service:NAS_BUILD,configured:true,hasReport:!!p.getProperty('NAS_REPORT_HEAD')}));
 }finally{lock.releaseLock();}
}
function doGet(e){
 if(e&&e.parameter&&(e.parameter.source==='gdrive'||e.parameter.source==='gphotos')&&typeof bkGet_==='function')return bkGet_(e.parameter.source);
 try{
  nrAssert_(e&&e.parameter&&e.parameter.source==='nas','INVALID_SOURCE');
  var cached;try{cached=CacheService.getScriptCache().get('nas-report');}catch(_){}
  if(cached)return nrOutput_(JSON.parse(cached));
  var head=nrHead_(),result;
  try{result=nrRead_(head);}catch(error){if(!head||!head.previous)throw error;result=nrRead_({current:head.previous});result.recoveredPrevious=true;}
  try{CacheService.getScriptCache().put('nas-report',JSON.stringify(result),240);}catch(_){}
  return nrOutput_(result);
 }catch(error){return nrOutput_({ok:false,service:NAS_BUILD,code:['NO_REPORT','INVALID_SOURCE','REPORT_HASH_MISMATCH'].indexOf(error.message)>=0?error.message:'READ_UNAVAILABLE'});}
}
function doPost(e){
 // Route untrusted source only to a fixed handler with its own HMAC key.
 var routedSource;
 if(typeof bkPost_==='function'&&e&&e.postData&&typeof e.postData.contents==='string'&&e.postData.contents.length<=16384){
  try{routedSource=JSON.parse(JSON.parse(e.postData.contents).payload).source;}catch(_){}
  if(routedSource==='gdrive'||routedSource==='gphotos')return bkPost_(e,routedSource);
 }
 return nrPost_(e);
}
function nrPost_(e){
 var started=Date.now(),reference='NR-'+Utilities.getUuid().slice(0,8),op='invalid',signed=false,lock,owns=false,requestId=null,key;
 try{
  nrAssert_(e&&e.postData&&typeof e.postData.contents==='string'&&e.postData.contents.length<=8192,'INVALID_REQUEST');
  var envelope=JSON.parse(e.postData.contents);key=nrKey_();
  nrAssert_(typeof envelope.payload==='string'&&nrSame_(envelope.signature,nrMac_(envelope.payload,key)),'AUTH_DENIED');
  var req=JSON.parse(envelope.payload);nrAssert_(req.version===1&&Number.isSafeInteger(req.issuedAt)&&Math.abs(Date.now()-req.issuedAt)<=300000,'REQUEST_EXPIRED');
  nrAssert_(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(req.requestId||''),'INVALID_REQUEST');
  signed=true;requestId=req.requestId;nrAssert_(req.op==='publish'||req.op==='logs','INVALID_OPERATION');op=req.op;
  lock=LockService.getScriptLock();nrAssert_(lock.tryLock(3000),'BUSY');owns=true;
  if(op==='logs')return nrAck_({ok:true,requestId:requestId,events:JSON.parse(nrProps_().getProperty('NAS_REPORT_LOG')||'[]')},key);
  nrLog_(reference,op,'STARTED',started);
  nrAssert_(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(req.generation||'')&&Number.isSafeInteger(req.sequence)&&req.sequence>0,'INVALID_SEQUENCE');
  nrAssert_(typeof req.snapshotText==='string'&&req.snapshotText.length<=4096,'INVALID_SNAPSHOT');
  var raw=req.snapshotText;NasReportSchema.validate(JSON.parse(raw));var hash=nrHash_(raw),head=nrHead_(),old=head&&head.current;
  if(old){
   nrAssert_(old.generation===req.generation,'GENERATION_MISMATCH');
   if(old.requestId===requestId){nrAssert_(old.sequence===req.sequence&&old.hash===hash,'IDEMPOTENCY_MISMATCH');nrRead_(head);nrLog_(reference,op,'REPLAY',started);return nrAck_({ok:true,requestId:requestId,sequence:old.sequence,sha256:hash,replay:true},key);}
   nrAssert_(req.sequence>old.sequence,'STALE_SEQUENCE');
  }
  var folderId=nrProps_().getProperty('NAS_REPORT_FOLDER');nrAssert_(!!folderId,'NOT_CONFIGURED');
  var file=DriveApp.getFolderById(folderId).createFile('nas-'+requestId+'.json',raw,MimeType.PLAIN_TEXT),id=file.getId();
  nrAssert_(nrHash_(file.getBlob().getDataAsString('UTF-8'))===hash,'WRITE_READBACK_FAILED');
  var current={fileId:id,hash:hash,requestId:requestId,generation:req.generation,sequence:req.sequence,received_at:new Date().toISOString()},next={current:current,previous:old||null};
  try{nrProps_().setProperty('NAS_REPORT_HEAD',JSON.stringify(next));}catch(error){var actual=nrHead_();if(!actual||actual.current.fileId!==id)throw error;}
  nrAssert_(nrHead_().current.fileId===id,'COMMIT_UNCONFIRMED');
  try{CacheService.getScriptCache().remove('nas-report');}catch(_){}
  nrLog_(reference,op,'COMMITTED',started);
  if(head&&head.previous)try{DriveApp.getFileById(head.previous.fileId).setTrashed(true);}catch(_){nrLog_(reference,op,'RETENTION_DEFERRED',started);}
  return nrAck_({ok:true,requestId:requestId,sequence:req.sequence,sha256:hash,replay:false},key);
 }catch(error){
  var code=/^[A-Z_]{1,64}$/.test(error.message)?error.message:'REQUEST_FAILED';
  if(signed&&owns)nrLog_(reference,op,code,started);
  if(!owns)try{console.log(JSON.stringify({at:new Date().toISOString(),reference:reference,op:op,code:code,ms:Date.now()-started}));}catch(_){}
  var result={ok:false,requestId:requestId,reference:reference,code:code};return signed?nrAck_(result,key):nrOutput_({ok:false,reference:reference,code:code});
 }finally{if(owns)lock.releaseLock();}
}
function nrAck_(body,key){var payload=JSON.stringify(body);return nrOutput_({payload:payload,signature:nrMac_(payload,key)});}
