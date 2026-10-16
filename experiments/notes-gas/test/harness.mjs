import vm from 'node:vm';
import fs from 'node:fs';
import {createHash,createHmac,randomUUID} from 'node:crypto';
export const key='b'.repeat(64);
export const hash=s=>createHash('sha256').update(s).digest('hex');
export const mac=s=>createHmac('sha256',key).update(s).digest('hex');
export function harness() {
  let locked=false, fail='', clock=Date.now();
  const consoleRows=[];
  const props=new Map([['NOTES_HMAC_KEY',key]]),files=new Map(),folders=new Set();
  const iterator=a=>{let i=0;return {hasNext:()=>i<a.length,next:()=>a[i++]};};
  const blob=data=>({getBytes:()=>[...Buffer.from(data)],getDataAsString:()=>data});
  const folder=id=>({getId:()=>id,getSharingAccess:()=> 'PRIVATE',createFile:b=>{
    if(fail==='create')throw Error('injected');
    const fileId=randomUUID(),data=b.getDataAsString(),file={id:fileId,data,parent:id,trashed:false};files.set(fileId,file);return wrap(file);
  }});
  const wrap=f=>({getId:()=>f.id,isTrashed:()=>f.trashed,getParents:()=>iterator([folder(f.parent)]),getBlob:()=>blob(f.data)});
  const context=vm.createContext({console:{log:value=>consoleRows.push(value)},Date,JSON,Set,Map,Object,Number,Error,Utilities:{
    DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},getUuid:randomUUID,
    computeDigest:(_,s)=>[...Buffer.from(hash(s),'hex')],computeHmacSha256Signature:(s,k)=>[...createHmac('sha256',k).update(s).digest()],newBlob:blob
  },PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)??null,setProperty:(k,v)=>{
    if(k==='NOTES_OPS_LOG'&&fail==='audit')throw Error('audit quota');
    if(k==='NOTES_HEAD'&&fail==='beforeHead')throw Error('injected');
    props.set(k,v);if(k==='NOTES_HEAD'&&fail==='afterHead')throw Error('injected');
  }})},DriveApp:{Access:{PRIVATE:'PRIVATE'},createFolder:()=>{const id=randomUUID();folders.add(id);return folder(id);},getFolderById:id=>folder(id),getFileById:id=>{if(!files.has(id))throw Error('missing');return wrap(files.get(id));}},LockService:{getScriptLock:()=>{let held=false;return {tryLock:()=>{if(locked)return false;locked=true;held=true;return true;},waitLock:()=>{if(locked)throw Error('busy');locked=true;held=true;},hasLock:()=>held,releaseLock:()=>{if(held){locked=false;held=false;}}};}},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:s=>({setMimeType:()=>s})}});
  for(const file of ['Core.js','Server.js'])vm.runInContext(fs.readFileSync(new URL('../apps-script/'+file,import.meta.url),'utf8'),context);
  context.initializeNotesPrototype();
  const request=(op,payload={},actor='owner')=>({requestId:randomUUID(),issuedAt:clock,op,payload,actor});
  const send=(req,change={})=>{
    const sentAt=Date.now(),request=JSON.stringify(req),envelope={v:1,sentAt,request,signature:mac('request\n'+sentAt+'\n'+request),...change};
    const wire=JSON.parse(context.doPost({postData:{contents:JSON.stringify(envelope)}}));
    return JSON.parse(wire.body);
  };
  const call=(op,payload={},actor='owner')=>send(request(op,payload,actor));
  const state=()=>JSON.parse(files.get(JSON.parse(props.get('NOTES_HEAD')).id).data);
  return {context,props,files,call,send,request,state,consoleRows,setFailure:x=>{fail=x;},setLocked:x=>{locked=x;},key};
}
