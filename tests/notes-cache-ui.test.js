import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const a={id:'a',title:'A',text:'server A',revision:'a1',folder:'',updatedAt:'2026-10-15T00:00:00Z',history:[]};
const b={...a,id:'b',title:'B',text:'server B',revision:'b1'};
function setup(api){
 const dom=new JSDOM(readFileSync('dist/notes/index.html','utf8'),{url:'https://homepage-nas.vercel.app/notes/',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 w.confirm=()=>true;w.PortalAccount={state:{authenticated:true},api};w.eval(readFileSync('public/notes.js','utf8'));
 w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:true}}));
 return {dom,w,$};
}
test('prefetch makes cached opening immediate; revalidation never replaces typed draft and 409 keeps it',async()=>{
 let reads=0,resolveRemote,saved;
 const {dom,w,$}=setup(async(url,payload)=>{
  if(payload){saved=payload;throw Object.assign(new Error('Note đã thay đổi'),{status:409});}
  if(url.includes('?known='))return {delta:true,notes:[a,b],removed:[]};
  reads++;
  if(reads<=2)return url.includes('id=a')?a:b;
  return new Promise(resolve=>resolveRemote=resolve);
 });
 await flush();assert.equal(reads,2);
 $('note-list').querySelector('button').click();
 assert.equal($('note-text').value,'server A');assert.equal($('note-title').disabled,false);
 $('note-text').value='local draft';$('note-text').dispatchEvent(new w.Event('input'));
 resolveRemote({...a,text:'new remote',revision:'a2'});await flush();
 assert.equal($('note-text').value,'local draft');assert.match($('note-message').textContent,/thiết bị khác/);
 $('note-save').click();await flush();assert.equal(saved.revision,'a1');assert.equal(saved.takeover,undefined);assert.equal($('note-text').value,'local draft');assert.match($('note-message').textContent,/sao chép bản nháp/);
 const stored=JSON.parse(w.localStorage.getItem('homepage-notes-preview-v1'));assert.equal(stored.notes.some(n=>'history' in n||'checklist' in n),false);
 dom.window.close();
});
test('delta applies edit, creation and removal without duplicating unchanged notes',async()=>{
 let syncs=0;
 const {dom,w,$}=setup(async url=>url.includes('?known=')?(++syncs===1?{delta:true,notes:[a,b],removed:[]}:{delta:true,notes:[{...b,title:'B updated',revision:'b2'},{...a,id:'c',title:'C',revision:'c1'}],removed:['a']}):(url.includes('id=b')?b:a));
 await flush();assert.equal($('note-list').querySelectorAll('button').length,2);
 w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:true}}));await flush();
 assert.deepEqual([...$('note-list').querySelectorAll('strong')].map(n=>n.textContent).sort(),['B updated','C']);dom.window.close();
});
test('older detail response cannot overwrite newly saved editor or a new Note',async()=>{
 let resolveRemote,reads=0;
 const {dom,w,$}=setup(async(url,payload)=>{
  if(payload)return {...a,...payload,revision:'a2',history:[],updatedAt:'2026-10-15T01:00:00Z'};
  if(url.includes('?known='))return {delta:true,notes:[a],removed:[]};
  if(++reads===1)return a;
  return new Promise(r=>resolveRemote=r);
 });
 await flush();$('note-list').querySelector('button').click();$('note-text').value='saved new';$('note-text').dispatchEvent(new w.Event('input'));$('note-save').click();await flush();
 resolveRemote(a);await flush();assert.equal($('note-text').value,'saved new');assert.match($('note-message').textContent,/Đã lưu/);
 $('note-new').click();assert.equal($('note-text').value,'');assert.equal($('note-progress').hidden,true);dom.window.close();
});
test('lock clears content cache and ignores a pending response from the previous session',async()=>{
 let resolveRemote,reads=0;
 const {dom,w,$}=setup(async url=>{
  if(url.includes('?known='))return {delta:true,notes:[a],removed:[]};
  if(++reads===1)return a;
  return new Promise(r=>resolveRemote=r);
 });
 await flush();$('note-list').querySelector('button').click();
 w.PortalAccount.state.authenticated=false;w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:false}}));
 resolveRemote({...a,text:'late old session'});await flush();assert.equal($('note-text').value,'');assert.equal($('notes-workspace').hidden,true);assert.equal(w.localStorage.getItem('homepage-notes-preview-v1'),null);dom.window.close();
});
