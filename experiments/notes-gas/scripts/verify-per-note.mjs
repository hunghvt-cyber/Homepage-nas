/* Bounded read-only reconciliation after transport failure. No seed/restore/write. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGasClient,newRequest,prepareRequest} from '../adapter.mjs';
const report={kind:'READ_ONLY_PER_NOTE_RECONCILIATION_NOT_BENCHMARK',at:new Date().toISOString(),passed:false,checks:{},errors:[],attempts:[]};
const client=createGasClient({url:process.env.NOTES_GAS_URL,key:process.env.NOTES_GAS_HMAC_KEY,timeoutMs:30000,attempts:3,onAttempt:x=>report.attempts.push(x)});
async function check(name,fn){try{await fn();report.checks[name]=true;}catch(e){report.errors.push({check:name,code:/^[A-Z_]{1,80}$/.test(e.message)?e.message:'ASSERTION_FAILED',status:e.status||null});}}
await check('original',async()=>{const h=await client(newRequest('health'));assert.equal(h.revision,119);assert.equal(h.activeNotes,100);assert.equal(h.readVerified,true);report.original={build:h.build,revision:h.revision,activeNotes:h.activeNotes,readVerified:true};});
await check('perNoteIntegrity',async()=>{
 const data=await client(newRequest('shardExport',{perNote:true}));assert.equal(data.revision,11);assert.equal(Object.keys(data.notes).length,2);assert.equal(data.index.length,2);assert.equal(Object.keys(data.receipts).length,11);
 const notes=Object.values(data.notes);assert.deepEqual(notes.map(n=>n.title).sort(),['SYNTHETIC different B','SYNTHETIC shared save']);
 for(const row of data.index){const n=data.notes[row.id];assert.equal(row.revision,n.revision);assert.equal(n.folder,'trial-workspace');assert.equal(n.checklist.length,2);assert.ok(n.text.includes('Tiếng Việt'));assert.ok(n.history.length<=5);}
 const shares=Object.values(data.shares);assert.equal(shares.length,1);assert.equal(shares[0].revoked,true);
 report.perNote={revision:11,records:2,indexRows:2,receipts:11,revokedShares:1,bytes:Buffer.byteLength(JSON.stringify(data)),sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
 // Reconstruct the synthetic capability inside runner memory; never log it.
 const cap=prepareRequest({requestId:'58978210-3a6c-4089-95ec-e74ac6f2cb05',issuedAt:0,op:'shareCreate',actor:'owner',payload:{}},process.env.NOTES_GAS_HMAC_KEY);
 assert.equal(data.shares[cap.req.payload.shareId].revoked,true);
 try{await client(newRequest('get',{perNote:true,id:notes[0].id,token:cap.token},'share'));assert.fail('REVOKED_LINK_ACCEPTED');}catch(e){assert.equal(e.status,404);}
 report.revokedReadDenied=true;
});
await check('journal',async()=>{const log=await client(newRequest('logs'));report.journal={events:log.events.length,builds:[...new Set(log.events.map(x=>x.build))],lastCodes:log.events.slice(-8).map(x=>({operation:x.operation,code:x.code,status:x.status}))};});
report.passed=Object.keys(report.checks).length===3&&!report.errors.length;
await writeFile(new URL('../per-note-integrity.local.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
