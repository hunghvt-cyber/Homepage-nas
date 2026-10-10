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
