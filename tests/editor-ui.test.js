import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
execFileSync('python3',['scripts/build.py'],{env:{...process.env,PORTAL_BASE_URL:''}});
const flush = async () => {for(let i=0;i<5;i++) await new Promise(r=>setImmediate(r));};
test('Notes remains hidden for guest; owner can create, copy code and recover history', async () => {
  const dom = new JSDOM(readFileSync('dist/notes/index.html','utf8'),{url:'https://homepage-nas.vercel.app/notes/',runScripts:'outside-only'});
  const w=dom.window; const $=id=>w.document.getElementById(id); const state={authenticated:false}; let saved, copied;
  w.confirm=()=>true; w.setTimeout=()=>1; w.clearTimeout=()=>{};
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});
  w.PortalAccount={state,api:async(url,b)=>{if(b) {saved={...b,id:'12345678-1234-1234-1234-123456789abc',revision:'1',updatedAt:'2026-10-10T00:00:00Z',history:[{title:'before',text:'old code',updatedAt:'2026-10-09T00:00:00Z'}]};return saved;}return {notes:[]};}};
  w.eval(readFileSync('public/notes.js','utf8'));
  assert.equal($('notes-workspace').hidden,true); assert.equal($('note-title').disabled,true);
  state.authenticated=true;w.dispatchEvent(new w.CustomEvent('account-change',{detail:state}));await flush();assert.equal($('notes-workspace').hidden,false);
  $('note-title').value='AHK';$('note-text').value='\tMsgBox, <script>\r\n  return';$('note-text').dispatchEvent(new w.Event('input'));$('note-save').click();await flush();assert.equal(saved.text,$('note-text').value);assert.equal($('note-message').textContent,'Đã lưu.');
  $('note-copy').click();await flush();assert.equal(copied,$('note-text').value);
  $('note-history').value='0';$('note-history').dispatchEvent(new w.Event('change'));assert.equal($('note-text').value,'old code');assert.equal($('note-title').value,'before');
  // Expired sessions hide private DOM but keep an unsaved draft for relogin.
  state.authenticated=false;w.dispatchEvent(new w.CustomEvent('account-change',{detail:{...state,expired:true}}));assert.equal($('notes-workspace').hidden,true);assert.equal($('note-text').value,'old code');
  w.dispatchEvent(new w.CustomEvent('account-change',{detail:state}));assert.equal($('note-text').value,'');dom.window.close();
});
test('QR override renders as text; editor requires owner and preserves slug on save', async () => {
 const dom=new JSDOM(readFileSync('dist/do-vat/bep-sunhouse-shb82191-vmc/index.html','utf8'),{url:'https://homepage-nas.vercel.app/do-vat/bep-sunhouse-shb82191-vmc/',runScripts:'outside-only'});
 const w=dom.window;const $=id=>w.document.getElementById(id);const original=JSON.parse(readFileSync('content/guides.json','utf8')).find(g=>g.slug==='bep-sunhouse-shb82191-vmc');let logins=0,saved;
 const guide={...original,title:'<img src=x onerror=alert(1)>',steps:['<script>evil</script>'],details:[]};
 w.PortalAccount={state:{authenticated:false},login:()=>{logins++;},api:async(url,b)=>{if(b){saved=b;return {guide:b.guide,revision:'next'};}return {guide,revision:'first'};}};
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
 w.eval(readFileSync('public/guides.js','utf8'));await flush();assert.equal($('guide-title').textContent,guide.title);assert.equal($('guide-title').children.length,0);
 $('guide-edit').click();assert.equal(logins,1);assert.equal($('guide-editor').hidden,true);
 w.PortalAccount.state.authenticated=true;$('guide-edit').click();assert.equal($('guide-editor').hidden,false);$('edit-title').value='Bếp mới';$('guide-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await flush();assert.equal(saved.guide.slug,original.slug);assert.equal(saved.revision,'first');assert.equal($('guide-title').textContent,'Bếp mới');dom.window.close();
});

test('Notes never schedules autosave or polling; manual save keeps the draft', async()=>{
 const dom=new JSDOM(readFileSync('dist/notes/index.html','utf8'),{url:'https://homepage-nas.vercel.app/notes/',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 let sent, timers=0, polls=0;
 w.setTimeout=()=>{timers++;};w.setInterval=()=>{polls++;};w.confirm=()=>true;
 w.PortalAccount={state:{authenticated:true},api:async(url,b)=>{if(b){sent=b;return {...b,id:'12345678-1234-1234-1234-123456789abc',revision:'3',history:[],updatedAt:'2026-10-10T00:00:00Z'};}return {notes:[]};}};
 w.eval(readFileSync('public/notes.js','utf8'));w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:true}}));await flush();
 $('note-title').value='manual';$('note-text').value='local draft';$('note-text').dispatchEvent(new w.Event('input'));await flush();assert.equal(sent,undefined);assert.equal(timers,0);assert.equal(polls,0);assert.equal($('note-refresh'),null);
 $('note-save').click();await flush();assert.equal(sent.takeover,true);assert.equal(sent.text,'local draft');assert.equal($('note-message').textContent,'Đã lưu.');dom.window.close();
});
test('confirmed Notes save remains successful when subsequent list read fails',async()=>{
 const dom=new JSDOM(readFileSync('dist/notes/index.html','utf8'),{url:'https://homepage-nas.vercel.app/notes/',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);let saved=false;
 w.PortalAccount={state:{authenticated:true},api:async(url,b)=>{if(b){assert.equal(url,'/api/notes-save');saved=true;return {...b,id:'12345678-1234-1234-1234-123456789abc',revision:'new',history:[],updatedAt:'2026-10-10T00:00:00Z'};}if(saved)throw new Error('list read failed');return {notes:[]};}};
 w.eval(readFileSync('public/notes.js','utf8'));w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:true}}));await flush();$('note-title').value='note';$('note-text').value='draft';$('note-text').dispatchEvent(new w.Event('input'));$('note-save').click();await flush();assert.match($('note-message').textContent,/^Đã lưu\./);assert.doesNotMatch($('note-message').textContent,/chưa được lưu|thiết bị khác/);assert.equal($('note-text').value,'draft');dom.window.close();
});

test('Notes storage failure carries the support reference to the UI and keeps the draft',async()=>{
 const dom=new JSDOM(readFileSync('dist/notes/index.html','utf8'),{url:'https://homepage-nas.vercel.app/notes/',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 w.fetch=async(url,options)=>url==='/api/auth'?{ok:true,json:async()=>({authenticated:true})}:options?.method==='POST'?{ok:false,status:503,json:async()=>({error:'Kho lưu từ chối ghi note.',reference:'N4-1234abcd'})}:{ok:true,json:async()=>({notes:[]})};
 w.eval(readFileSync('public/account.js','utf8'));w.eval(readFileSync('public/notes.js','utf8'));await flush();
 $('note-title').value='test';$('note-text').value='keep this draft';$('note-text').dispatchEvent(new w.Event('input'));$('note-save').click();await flush();
 assert.equal($('note-text').value,'keep this draft');assert.match($('note-message').textContent,/Kho lưu từ chối ghi note.*N4-1234abcd/);assert.equal($('note-save').disabled,false);dom.window.close();
});

test('confirmed Delete removes the cached card and stays successful when list refresh fails',async()=>{
 const dom=new JSDOM(readFileSync('dist/notes/index.html','utf8'),{url:'https://homepage-nas.vercel.app/notes/',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 const note={id:'12345678-1234-1234-1234-123456789abc',title:'test delete',text:'test content',revision:'old',updatedAt:'2026-10-10T00:00:00Z',history:[]};let deleted=false;
 w.confirm=()=>true;
 w.PortalAccount={state:{authenticated:true},api:async(url,b)=>{
  if(b){assert.deepEqual(JSON.parse(JSON.stringify(b)),{action:'delete',id:note.id});deleted=true;return {deleted:true};}
  if(url.includes('?id='))return note;
  if(deleted)throw new Error('list read failed');return {notes:[note]};
 }};
 w.eval(readFileSync('public/notes.js','utf8'));w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:true}}));await flush();
 $('note-list').querySelector('button').click();await flush();$('note-delete').click();await flush();
 assert.equal(deleted,true);assert.match($('note-message').textContent,/^Đã xóa note\./);assert.doesNotMatch($('note-message').textContent,/list read failed/);
 assert.equal($('note-list').querySelector('button'),null);assert.equal($('note-title').value,'');assert.equal($('note-text').value,'');dom.window.close();
});

test('failed Delete preserves the editor and card and displays its support reference',async()=>{
 const dom=new JSDOM(readFileSync('dist/notes/index.html','utf8'),{url:'https://homepage-nas.vercel.app/notes/',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 const note={id:'12345678-1234-1234-1234-123456789abc',title:'test delete',text:'saved text',revision:'old',updatedAt:'2026-10-10T00:00:00Z',history:[]};
 w.confirm=()=>true;
 w.PortalAccount={state:{authenticated:true},api:async(url,b)=>{if(b)throw Object.assign(new Error('Kho lưu chưa cập nhật.'),{reference:'N4-1234abcd'});if(url.includes('?id='))return note;return {notes:[note]};}};
 w.eval(readFileSync('public/notes.js','utf8'));w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:true}}));await flush();
 $('note-list').querySelector('button').click();await flush();$('note-text').value='local draft';$('note-text').dispatchEvent(new w.Event('input'));$('note-delete').click();await flush();
 assert.match($('note-message').textContent,/Kho lưu chưa cập nhật.*N4-1234abcd/);assert.equal($('note-text').value,'local draft');assert.equal($('note-list').querySelector('.note-card-title').textContent,note.title);assert.equal($('note-delete').disabled,false);dom.window.close();
});
