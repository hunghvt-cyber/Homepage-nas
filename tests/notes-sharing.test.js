import test from 'node:test';
import assert from 'node:assert/strict';
import {createShareManagement} from '../api/note-share.js';
import {createPublicShare} from '../api/shared-note.js';
const noteId='12345678-1234-1234-1234-123456789abc';
const makeRes=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.data=v;return this;}});
test('shared link can read, edit with revision, revoke and reject stale edits',async()=>{
 const records=new Map([['notes/'+noteId+'.json',{value:{id:noteId,title:'Original',text:'One',pinned:false,folder:'',updatedAt:new Date().toISOString(),history:[]},etag:'v1'}]]);
 let count=1;
 const load=async path=>records.get(path)||null;
 const persist=async(path,value,etag)=>{
  const old=records.get(path);
  if(etag&&old?.etag!==etag){const e=new Error('Conflict');e.status=409;throw e;}
  if(!etag&&old){const e=new Error('Exists');e.status=409;throw e;}
  const next={value,etag:'v'+(++count)};records.set(path,next);return next;
 };
 const authorize=async()=>{},sameOriginHeaders={origin:'https://homepage-nas.vercel.app','content-type':'application/json'};
 const manage=createShareManagement({authorize,load,persist,enumerate:async()=>[...records.keys()].filter(x=>x.startsWith('shares/'))});
 const publicApi=createPublicShare({load,persist});
 let res=makeRes();
 await manage({method:'POST',headers:sameOriginHeaders,body:{action:'create',noteId}},res);
 assert.equal(res.statusCode,200);const token=res.data.token;
 res=makeRes();await publicApi({method:'GET',query:{token}},res);assert.equal(res.data.text,'One');
 const revision=res.data.revision;
 res=makeRes();await publicApi({method:'POST',headers:sameOriginHeaders,body:{token,revision,title:'Updated',text:'Two'}},res);assert.equal(res.statusCode,200);
 res=makeRes();await publicApi({method:'POST',headers:sameOriginHeaders,body:{token,revision,title:'Stale',text:'Three'}},res);assert.equal(res.statusCode,409);
 res=makeRes();await manage({method:'POST',headers:sameOriginHeaders,body:{action:'revoke',noteId,id:token.split('.')[0]}},res);assert.equal(res.statusCode,200);
 res=makeRes();await publicApi({method:'GET',query:{token}},res);assert.equal(res.statusCode,404);
});
