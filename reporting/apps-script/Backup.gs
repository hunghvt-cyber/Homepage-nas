/* Aggregate feeds only. Same project, separate keys/folders/HEAD/log per source. */
function bkPrefix_(source){nrAssert_(source==='gdrive'||source==='gphotos','INVALID_SOURCE');return 'BACKUP_'+source.toUpperCase()+'_';}
function bkKey_(source){var key=nrProps_().getProperty(bkPrefix_(source)+'KEY');nrAssert_(/^[a-f0-9]{64}$/.test(key||''),'NOT_CONFIGURED');return key;}
function bkHead_(source){var s=nrProps_().getProperty(bkPrefix_(source)+'HEAD');return s?JSON.parse(s):null;}
function bkRead_(source,current){
 nrAssert_(!!current,'NO_REPORT');var raw=DriveApp.getFileById(current.fileId).getBlob().getDataAsString('UTF-8');
 nrAssert_(nrHash_(raw)===current.hash,'REPORT_HASH_MISMATCH');BackupReportSchema.validate(JSON.parse(raw),source);
 return {ok:true,service:'homepage-backup-reports-v1',source:source,payload:raw,sha256:current.hash,received_at:current.received_at};
}
function bkLog_(source,reference,code,started){
 var event={at:new Date().toISOString(),reference:reference,source:source,code:code,ms:Date.now()-started};
 try{console.log(JSON.stringify(event));}catch(_){}
 try{var p=nrProps_(),k=bkPrefix_(source)+'LOG',rows=JSON.parse(p.getProperty(k)||'[]');rows.push(event);p.setProperty(k,JSON.stringify(rows.slice(-30)));}catch(_){}
}
function initializeBackupReports(){
 var lock=LockService.getScriptLock();lock.waitLock(5000);
 try{['gdrive','gphotos'].forEach(function(source){var p=nrProps_(),prefix=bkPrefix_(source);
  if(!p.getProperty(prefix+'KEY'))p.setProperty(prefix+'KEY',(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''));
  bkKey_(source);if(!p.getProperty(prefix+'FOLDER'))p.setProperty(prefix+'FOLDER',DriveApp.createFolder('Homepage backup reports - '+source).getId());
  console.log(JSON.stringify({service:'homepage-backup-reports-v1',source:source,configured:true,hasReport:!!p.getProperty(prefix+'HEAD')}));
 });}finally{lock.releaseLock();}
}
function bkGet_(source){
 try{var cacheKey='backup-'+source,cached;try{cached=CacheService.getScriptCache().get(cacheKey);}catch(_){}
  if(cached)return nrOutput_(JSON.parse(cached));
  var head=bkHead_(source),result;nrAssert_(!!head,'NO_REPORT');
  try{result=bkRead_(source,head.current);}catch(error){if(!head.previous)throw error;result=bkRead_(source,head.previous);result.recoveredPrevious=true;}
  try{CacheService.getScriptCache().put(cacheKey,JSON.stringify(result),240);}catch(_){}
  return nrOutput_(result);
 }catch(error){return nrOutput_({ok:false,service:'homepage-backup-reports-v1',source:source,code:error.message==='NO_REPORT'?'NO_REPORT':'READ_UNAVAILABLE'});}
}
function bkPost_(e,source){
 var started=Date.now(),reference='BR-'+Utilities.getUuid().slice(0,8),signed=false,key,requestId=null,lock,owns=false;
 try{
  nrAssert_(e&&e.postData&&typeof e.postData.contents==='string'&&e.postData.contents.length<=16384,'INVALID_REQUEST');
  var envelope=JSON.parse(e.postData.contents);key=bkKey_(source);
  nrAssert_(typeof envelope.payload==='string'&&nrSame_(envelope.signature,nrMac_(envelope.payload,key)),'AUTH_DENIED');
  var req=JSON.parse(envelope.payload);nrAssert_(req.version===1&&req.source===source&&Number.isSafeInteger(req.issuedAt)&&Math.abs(Date.now()-req.issuedAt)<=300000,'REQUEST_EXPIRED');
  nrAssert_(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(req.requestId||''),'INVALID_REQUEST');
  signed=true;requestId=req.requestId;nrAssert_(req.op==='publish'||req.op==='logs','INVALID_OPERATION');
  lock=LockService.getScriptLock();nrAssert_(lock.tryLock(3000),'BUSY');owns=true;
  if(req.op==='logs')return nrAck_({ok:true,requestId:requestId,events:JSON.parse(nrProps_().getProperty(bkPrefix_(source)+'LOG')||'[]')},key);
  nrAssert_(typeof req.reportText==='string'&&req.reportText.length<=8192,'INVALID_BACKUP_REPORT');
  var raw=req.reportText,report=BackupReportSchema.validate(JSON.parse(raw),source),hash=nrHash_(raw),head=bkHead_(source),old=head&&head.current;
  if(old){
   if(old.requestId===requestId)nrAssert_(old.hash===hash,'IDEMPOTENCY_MISMATCH');
   nrAssert_(report.run_number>=old.run_number,'STALE_REPORT');
   if(report.run_number===old.run_number){
    nrAssert_(report.run_id===old.run_id,'RUN_ID_MISMATCH');nrAssert_(report.run_attempt>=old.run_attempt,'STALE_REPORT');
    if(report.run_attempt===old.run_attempt){nrAssert_(old.hash===hash,'REPORT_CONFLICT');bkRead_(source,old);bkLog_(source,reference,'REPLAY',started);return nrAck_({ok:true,requestId:requestId,sha256:hash,run_id:report.run_id,run_number:report.run_number,run_attempt:report.run_attempt,replay:true},key);}
   }
  }
  bkLog_(source,reference,'STARTED',started);
  var folder=nrProps_().getProperty(bkPrefix_(source)+'FOLDER');nrAssert_(!!folder,'NOT_CONFIGURED');
  var file=DriveApp.getFolderById(folder).createFile('report-'+requestId+'.json',raw,MimeType.PLAIN_TEXT),id=file.getId();
  nrAssert_(nrHash_(file.getBlob().getDataAsString('UTF-8'))===hash,'WRITE_READBACK_FAILED');
  var current={fileId:id,hash:hash,requestId:requestId,run_id:report.run_id,run_number:report.run_number,run_attempt:report.run_attempt,received_at:new Date().toISOString()};
  try{nrProps_().setProperty(bkPrefix_(source)+'HEAD',JSON.stringify({current:current,previous:old||null}));}catch(error){var actual=bkHead_(source);if(!actual||actual.current.fileId!==id)throw error;}
  nrAssert_(bkHead_(source).current.fileId===id,'COMMIT_UNCONFIRMED');
  try{CacheService.getScriptCache().remove('backup-'+source);}catch(_){}
  bkLog_(source,reference,'COMMITTED',started);
  if(head&&head.previous)try{DriveApp.getFileById(head.previous.fileId).setTrashed(true);}catch(_){bkLog_(source,reference,'RETENTION_DEFERRED',started);}
  return nrAck_({ok:true,requestId:requestId,sha256:hash,run_id:report.run_id,run_number:report.run_number,run_attempt:report.run_attempt,replay:false},key);
 }catch(error){var code=/^[A-Z_]{1,64}$/.test(error.message)?error.message:'REQUEST_FAILED';if(signed&&owns)bkLog_(source,reference,code,started);
  var value={ok:false,requestId:requestId,reference:reference,code:code};return signed?nrAck_(value,key):nrOutput_({ok:false,reference:reference,code:code});
 }finally{if(owns)lock.releaseLock();}
}
