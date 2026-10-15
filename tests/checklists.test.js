import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {noteInput} from '../lib/validation.js';
import {createNotesHandler} from '../api/notes.js';
import {createPublicShare} from '../api/shared-note.js';
import {createWorkspace} from '../api/shared-folder.js';
import {createShareManagement} from '../api/note-share.js';
const item={id:'item-1',text:'Mua giấy',checked:false};
const id='12345678-1234-1234-1234-123456789abc';
const headers={origin:'https://homepage-nas.vercel.app','content-type':'application/json'};
const res=()=>({setHeader(){},status(n){this.code=n;return this;},json(v){this.data=v;return this;}});
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
test('checklist limits reject malformed records and count Unicode bytes',()=>{
 assert.deepEqual(noteInput({title:'Old',text:''}).checklist,[]);
 for(const checklist of [[item,item],[{...item,checked:'yes'}],[{...item,id:'<script>'}],Array.from({length:201},(_,i)=>({...item,id:'i'+i}))])assert.throws(()=>noteInput({title:'X',text:'',checklist}));
 assert.throws(()=>noteInput({title:'X',text:'é'.repeat(499990),checklist:[item]}),/1 MB/);
});
test('owner save roundtrips checklist, history and older-client saves preserve it',async()=>{
 process.env.PORTAL_BASE_URL=headers.origin;const db=new Map();let version=0;
 const handler=createNotesHandler({authorize:async()=>{},load:async p=>db.get(p),enumerate:async()=>[...db.keys()],persistNote:async(p,value)=>{const row={value,etag:String(++version)};db.set(p,row);return row;},observe:()=>{}});
 const call=async body=>{const r=res();await handler({method:'POST',headers,body:{action:'save',id,revision:db.get('notes/'+id+'.json')?.etag,title:'N',text:'Text',...body}},r);assert.equal(r.code,200);return r.data;};
 await call({checklist:[item]});let saved=await call({checklist:[{...item,checked:true}]});assert.equal(saved.checklist[0].checked,true);assert.equal(saved.history[0].checklist[0].checked,false);
 saved=await call({text:'Older client'});assert.equal(saved.checklist[0].checked,true);
 saved=await call({checklist:[]});assert.deepEqual(saved.checklist,[]);
});
test('shared Note and folder save and return checklist with revision checks',async()=>{
 process.env.PORTAL_BASE_URL=headers.origin;const db=new Map([['notes/'+id+'.json',{value:{id,title:'N',text:'',folder:'Work',checklist:[item],history:[],updatedAt:new Date().toISOString()},etag:'1'}]]);let v=1;
 const load=async p=>db.get(p),enumerate=async prefix=>[...db.keys()].filter(p=>p.startsWith(prefix)),persist=async(p,value,etag)=>{if(etag&&etag!==db.get(p)?.etag)throw Object.assign(new Error('Conflict'),{status:409});const row={value,etag:String(++v)};db.set(p,row);return row;};
 const manage=createShareManagement({authorize:async()=>{},load,persist,enumerate});
 for(const folder of [false,true]){let r=res();await manage({method:'POST',headers,body:{action:'create',...(folder?{folder:'Work'}:{noteId:id})}},r);assert.equal(r.code,200);const token=r.data.token,api=folder?createWorkspace({load,persist,enumerate}):createPublicShare({load,persist});r=res();await api({method:'GET',query:{token,...(folder?{id}:{})}},r);assert.equal(r.data.checklist[0].text,item.text);const revision=r.data.revision;r=res();await api({method:'POST',headers,body:{token,id,action:'save',revision,title:'N',text:'',checklist:[{...item,checked:true}]}},r);assert.equal(r.code,200);assert.equal(r.data.checklist[0].checked,true);r=res();await api({method:'POST',headers,body:{token,id,action:'save',revision,title:'N',text:'',checklist:[]}},r);assert.equal(r.code,409);}
});
test('Notes checklist inserts, moves checked rows down, saves and restores history',async()=>{
 const d=new JSDOM(readFileSync('dist/notes/index.html','utf8'),{url:headers.origin+'/notes/',runScripts:'outside-only'}),w=d.window,$=id=>w.document.getElementById(id);let saved;
 const state={authenticated:true};w.confirm=()=>true;w.PortalAccount={state,api:async(url,b)=>b?(saved={...b,id,revision:'2',updatedAt:new Date().toISOString(),history:[{title:'Before',text:'',checklist:[item],updatedAt:new Date().toISOString()}]}):{notes:[]}};
 w.eval(readFileSync('public/checklist.js','utf8'));w.eval(readFileSync('public/notes.js','utf8'));w.dispatchEvent(new w.CustomEvent('account-change',{detail:state}));await flush();$('note-new').click();$('note-title').value='Checklist';$('note-title').dispatchEvent(new w.Event('input'));
 $('note-checklist').querySelector('button').click();let field=$('note-checklist').querySelector('textarea');field.value='Mua giấy';field.dispatchEvent(new w.Event('input'));field.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal($('note-checklist').querySelectorAll('textarea').length,2);
 let tick=$('note-checklist').querySelector('input');tick.checked=true;tick.dispatchEvent(new w.Event('change'));assert.equal($('note-checklist').querySelector('.completed textarea').value,'Mua giấy');assert.equal($('note-checklist').querySelector('.checklist-items textarea').value,'');$('note-save').click();await flush();assert.equal(saved.checklist[0].checked,true);assert.equal(saved.checklist.length,2);$('note-history').value='0';$('note-history').dispatchEvent(new w.Event('change'));assert.equal($('note-checklist').querySelector('input').checked,false);assert.equal($('note-checklist').querySelectorAll('textarea').length,1);d.window.close();
});
