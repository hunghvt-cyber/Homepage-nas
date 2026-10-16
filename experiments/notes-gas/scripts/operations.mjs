/* Read-only health + bounded metadata journal. No Notes bodies/backup exported. */
import {writeFile} from 'node:fs/promises';
import {createGasClient,newRequest} from '../adapter.mjs';
const codes=new Set(['NETWORK_OR_TIMEOUT','UPSTREAM_HTTP','UPSTREAM_NOT_JSON','RESPONSE_AUTH_INVALID','UNEXPECTED_REDIRECT','NOT_INITIALIZED','SNAPSHOT_CORRUPT','HEAD_UNAVAILABLE','BUSY','AUDIT_UNAVAILABLE','NOT_CONFIGURED','AUTH_INVALID','AUTH_EXPIRED','PROTOTYPE_NOT_CONFIGURED']);
export async function inspect(client) {
  const report={kind:'LIVE_GOOGLE_OPERATIONAL_METADATA',checkedAt:new Date().toISOString(),healthy:false,health:null,journal:null,errors:[]};
  for(const op of ['health','logs']) {
    try {
      const result=await client(newRequest(op));
      if(op==='health'){
        // Select fields rather than blindly printing arbitrary server output.
        report.health={service:result.service==='notes-prototype'?result.service:'unknown',build:String(result.build||'unknown').slice(0,60),readVerified:result.readVerified===true,revision:Number.isSafeInteger(result.revision)?result.revision:null,activeNotes:Number.isSafeInteger(result.activeNotes)?result.activeNotes:null,journalAvailable:result.journalAvailable===true};
      }else{
        const allowedOps=new Set(['initialize','list','get','save','delete','restore','folderDelete','shareCreate','shareRevoke','shareList','backup','search','health','logs','unsupported','unknown']);
        const stages=new Set(['start','auth','lock','read','validate','commit','complete']);
        report.journal={events:(Array.isArray(result.events)?result.events:[]).slice(-30).map(x=>({at:/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(x.at)?x.at:null,reference:/^GAS-[a-f0-9]{8}$/.test(x.reference)?x.reference:null,operation:allowedOps.has(x.operation)?x.operation:'unknown',stage:stages.has(x.stage)?x.stage:'unknown',status:Number.isInteger(x.status)?x.status:503,code:/^[A-Z_]{1,64}$/.test(x.code)?x.code:'UNKNOWN',durationMs:Number.isFinite(x.durationMs)?x.durationMs:null}))};
      }
    } catch(e) {report.errors.push({operation:op,status:Number.isInteger(e.status)?e.status:503,code:codes.has(e.message)?e.message:'OPERATION_FAILED'});}
  }
  report.healthy=!!report.health?.readVerified&&!!report.journal&&report.errors.length===0;
  return report;
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]) {
  // Workflow can run safely before secrets are configured, with an honest skip.
  if(!process.env.NOTES_GAS_URL||!process.env.NOTES_GAS_HMAC_KEY) {
    console.log('Google prototype operational probe skipped: missing configuration. No live check performed.');
  }else{
    let client;try{client=createGasClient({url:process.env.NOTES_GAS_URL,key:process.env.NOTES_GAS_HMAC_KEY});}catch{console.error('Invalid prototype configuration.');process.exitCode=1;}
    if(client){
      const report=await inspect(client);
      await writeFile(new URL('../ops-result.local.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
      console.log(JSON.stringify({healthy:report.healthy,health:report.health,errors:report.errors},null,2));
      if(!report.healthy)process.exitCode=1;
    }
  }
}
