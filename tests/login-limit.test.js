import test from 'node:test';
import assert from 'node:assert/strict';
import {createLimiter} from '../lib/login-limit.js';
import {HttpError} from '../lib/security.js';
test('durable login limits reject attempt six, reset after window and never store raw IP',async()=>{
 process.env.SESSION_PASSWORD='test-session-secret-at-least-32-characters';const data=new Map();let now=1000000,v=0;
 const limit=createLimiter({now:()=>now,load:async p=>structuredClone(data.get(p)||null),persist:async(p,value,etag)=>{if(data.has(p)&&data.get(p).etag!==etag)throw new HttpError(409,'race');data.set(p,{value,etag:String(++v)});}});
 const req={headers:{'x-vercel-forwarded-for':'192.0.2.123'}};
 for(let i=0;i<5;i++)await limit(req);await assert.rejects(limit(req),{status:429});assert.ok([...data.keys()].every(p=>!p.includes('192.0.2.123')));
 now+=15*60000;await limit(req);
});
test('limit fails closed when storage is down or conditional writes keep conflicting',async()=>{
 process.env.SESSION_PASSWORD='test-session-secret-at-least-32-characters';
 const unavailable=createLimiter({load:async()=>{throw new Error('down');}});await assert.rejects(unavailable({headers:{}}));
 const conflict=createLimiter({load:async()=>null,persist:async()=>{throw new HttpError(409,'race');}});await assert.rejects(conflict({headers:{}}),{status:429});
});
