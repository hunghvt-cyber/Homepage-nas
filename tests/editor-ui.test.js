import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
execFileSync('python3',['scripts/build.py'],{env:{...process.env,PORTAL_BASE_URL:''}});
const flush = async () => {for(let i=0;i<5;i++) await new Promise(r=>setImmediate(r));};
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
