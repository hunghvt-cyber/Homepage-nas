/* Read-only integrity check after the failed performance trial; not a benchmark. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGasClient,newRequest} from '../adapter.mjs';
const report={kind:'READ_ONLY_SYNTHETIC_INTEGRITY_NOT_BENCHMARK',at:new Date().toISOString(),passed:false,errors:[]};
const client=createGasClient({url:process.env.NOTES_GAS_URL,key:process.env.NOTES_GAS_HMAC_KEY,timeoutMs:30000,attempts:3});
try{
 const health=await client(newRequest('health'));report.health={build:health.build,revision:health.revision,activeNotes:health.activeNotes,readVerified:health.readVerified};
 assert.equal(health.readVerified,true);assert.equal(health.revision,119);assert.equal(health.activeNotes,100);
 const data=await client(newRequest('backup'));assert.equal(data.revision,119);
 const entries=Object.entries(data.notes),active=entries.filter(([,n])=>!n.deleted);assert.equal(active.length,100);assert.equal(entries.length,100);
 let unicode=0,checked=0;
 for(const [id,n] of entries){assert.equal(n.id,id);assert.ok(n.title.startsWith('SYNTHETIC'));assert.equal(typeof n.text,'string');assert.equal(typeof n.folder,'string');assert.ok(/^r\d+$/.test(n.revision));assert.ok(Number(n.revision.slice(1))<=119);assert.ok(Array.isArray(n.history)&&n.history.length<=5);assert.ok(Array.isArray(n.checklist));assert.equal(new Set(n.checklist.map(x=>x.id)).size,n.checklist.length);for(const x of n.checklist){assert.equal(typeof x.text,'string');assert.equal(typeof x.checked,'boolean');if(x.checked)checked++;}if(/[^\x00-\x7F]/.test(n.text))unicode++;}
 assert.equal(data.index.length,100);assert.equal(new Set(data.index.map(x=>x.id)).size,100);
 for(const row of data.index){assert.equal(row.revision,data.notes[row.id].revision);assert.equal(row.folder,data.notes[row.id].folder);}
 report.export={records:entries.length,active:active.length,indexRows:data.index.length,unicodeNotes:unicode,checkedItems:checked,bytes:Buffer.byteLength(JSON.stringify(data)),sha256:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
 const logs=await client(newRequest('logs'));report.journal={count:logs.events.length,hasMetadata:logs.events.every(x=>typeof x.operation==='string'&&typeof x.code==='string')};report.passed=true;
}catch(e){report.errors.push({code:/^[A-Z_]{1,80}$/.test(e.message)?e.message:'ASSERTION_OR_REQUEST_FAILED',status:e.status||null});}
await writeFile(new URL('../final-integrity-result.local.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
