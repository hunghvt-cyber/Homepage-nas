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
function ngRepository_(props) {
  return {
    load:function() {
      var raw=props.getProperty('NOTES_HEAD');
      if(!raw)ngError_(503,'NOT_INITIALIZED');
      var head=JSON.parse(raw), file=DriveApp.getFileById(head.id);
      var folderId=props.getProperty('NOTES_ROOT_FOLDER_ID'),parents=file.getParents(),found=false;
      while(parents.hasNext())if(parents.next().getId()===folderId)found=true;
      if(!found||file.isTrashed())ngError_(503,'HEAD_UNAVAILABLE');
      var data=file.getBlob().getDataAsString('UTF-8');
      if(ngHash_(data)!==head.hash)ngError_(503,'SNAPSHOT_CORRUPT');
      var state=JSON.parse(data);
      if(state.schema!==1||state.revision!==head.revision||!Array.isArray(state.index)||!state.notes||!state.shares||!state.receipts)ngError_(503,'SNAPSHOT_CORRUPT');
      return {state:state,head:head,raw:raw};
    },
    commit:function(state,previous) {
      var data=JSON.stringify(state),hash=ngHash_(data);
      if(ngBytes_(data)>20000000)ngError_(413,'SNAPSHOT_CAPACITY');
      // Immutable candidate: a failed create/read-back never moves HEAD.
      var folder=DriveApp.getFolderById(props.getProperty('NOTES_ROOT_FOLDER_ID'));
      var file=folder.createFile(Utilities.newBlob(data,'application/json','snapshot-'+state.revision+'-'+Utilities.getUuid()+'.json'));
      if(ngHash_(file.getBlob().getDataAsString('UTF-8'))!==hash)ngError_(503,'WRITE_VERIFY_FAILED');
      if(props.getProperty('NOTES_HEAD')!==previous.raw)ngError_(409,'HEAD_CHANGED');
      var head={id:file.getId(),hash:hash,revision:state.revision,previous:previous.head.id};
      var raw=JSON.stringify(head);
      // Single commit pointer; exceptions here are ambiguous, resolved by retry/load.
      props.setProperty('NOTES_HEAD',raw);
      if(props.getProperty('NOTES_HEAD')!==raw)ngError_(503,'COMMIT_UNCERTAIN');
    }
  };
}
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ok:false,status:405,code:'POST_REQUIRED'})).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  var key,requestId='',result,lock;
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
    requestId=req.requestId;
    // Lock reads too: permission validation and snapshot publication share one order.
    lock=LockService.getScriptLock();if(!lock.tryLock(1500))ngError_(503,'BUSY');
    var repo=ngRepository_(props),current=repo.load();
    var output=NotesCore.execute(current.state,req,{now:Date.now,hash:ngHash_,equal:ngEqual_,bytes:ngBytes_});
    result={ok:true,status:200,result:output.result};
    // Reject oversized wire responses before publishing any mutation.
    if(ngBytes_(JSON.stringify({body:JSON.stringify(result),signature:'0'.repeat(64)}))>4000000)ngError_(413,'RESPONSE_TOO_LARGE');
    if(output.changed)repo.commit(output.state,current);
  } catch(err) {
    // No raw Drive errors, secrets, IDs or note content in logs/responses.
    result={ok:false,status:err.status||503,code:err.status?err.message:'STORAGE_UNAVAILABLE'};
  } finally {if(lock&&lock.hasLock())lock.releaseLock();}
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
  } finally {lock.releaseLock();}
}
