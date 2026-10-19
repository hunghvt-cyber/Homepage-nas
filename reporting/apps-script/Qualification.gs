/* Owner-run qualification only. Separate property namespace and disposable folder.
   Uses real Drive/Lock/Crypto inside GAS; not a Vercel/network benchmark. */
function qualifyNasReportsSynthetic(){
 var original=nrProps_,prefix='NAS_QUAL_'+Utilities.getUuid()+'_',rawProps=PropertiesService.getScriptProperties(),folderId=null,checks=0,timings=[];
 function expect(ok){checks++;if(!ok)throw new Error('QUALIFICATION_FAILED');}
 nrProps_=function(){return {getProperty:function(k){return rawProps.getProperty(prefix+k);},setProperty:function(k,v){rawProps.setProperty(prefix+k,v);return this;}};};
 function send(req,wrong){
  var payload=JSON.stringify(req),key=nrKey_(),envelope={payload:payload,signature:nrMac_(payload,wrong?'wrong-test-key':key)},at=Date.now();
  var result=JSON.parse(doPost({postData:{contents:JSON.stringify(envelope)}}).getContent());timings.push(Date.now()-at);
  if(result.payload){expect(nrSame_(result.signature,nrMac_(result.payload,key)));return JSON.parse(result.payload);}return result;
 }
 try{
  initializeNasReports();folderId=nrProps_().getProperty('NAS_REPORT_FOLDER');
  var snapshot={schema:1,updated_at:new Date().toISOString(),cam1:{state:'unknown'},cam2:{state:'unknown'},nas:{state:'unknown'},health:{root:{used_percent:20,available_bytes:100},vol1:{used_percent:30,available_bytes:200},ram:{available_bytes:100},swap:{used_bytes:0,total_bytes:100}},maintenance:{state:'unknown',measured_at:null},retention:{state:'unknown',measured_at:null}};
  var req={version:1,op:'publish',issuedAt:Date.now(),requestId:Utilities.getUuid(),generation:Utilities.getUuid(),sequence:1,snapshotText:JSON.stringify(snapshot)};
  expect(send(req,true).code==='AUTH_DENIED');expect(nrHead_()===null);
  expect(send(req).ok===true);expect(send(req).replay===true);
  var first=nrHead_().current;
  expect(nrRead_(nrHead_()).sha256===nrHash_(req.snapshotText));
  var stale=Object.assign({},req,{requestId:Utilities.getUuid()});expect(send(stale).code==='STALE_SEQUENCE');
  var expired=Object.assign({},req,{issuedAt:Date.now()-600000});expect(send(expired).code==='REQUEST_EXPIRED');
  var second=Object.assign({},req,{requestId:Utilities.getUuid(),sequence:2});expect(send(second).ok===true);
  var head=nrHead_();expect(head.previous.fileId===first.fileId);expect(typeof head.current.received_at==='string');
  DriveApp.getFileById(head.current.fileId).setContent('synthetic-corruption');
  var rejected=false;try{nrRead_(head);}catch(e){rejected=e.message==='REPORT_HASH_MISMATCH';}expect(rejected);
  expect(nrRead_({current:head.previous}).sha256===nrHash_(req.snapshotText));
  var logs=JSON.parse(nrProps_().getProperty('NAS_REPORT_LOG')||'[]');expect(logs.some(function(e){return e.code==='COMMITTED';}));
 }finally{
  nrProps_=original;
  if(folderId)DriveApp.getFolderById(folderId).setTrashed(true);
  ['NAS_REPORT_KEY','NAS_REPORT_FOLDER','NAS_REPORT_HEAD','NAS_REPORT_LOG'].forEach(function(k){rawProps.deleteProperty(prefix+k);});
 }
 console.log(JSON.stringify({service:NAS_BUILD,qualification:'real-drive-in-process',checks:checks,cleanup:true,requestMs:timings,networkBenchmark:false}));
}
