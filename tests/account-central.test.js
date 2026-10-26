import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
const script=fs.readFileSync('public/account.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
test('homepage owns login/change/logout forms and subpages only link to it',async()=>{
 const html=fs.readFileSync('dist/index.html','utf8');let authenticated=false,changed=false;const calls=[];
 const dom=new JSDOM(html,{url:'https://homepage-nas.vercel.app/',runScripts:'outside-only'}),w=dom.window;
 w.fetch=async(url,o)=>{if(o?.body){const b=JSON.parse(o.body);calls.push(b);if(b.action==='login')authenticated=true;if(b.action==='logout')authenticated=false;if(b.action==='change-password'){changed=true;authenticated=false;}}return {ok:true,json:async()=>({authenticated})};};
 w.eval(script);await tick();w.document.querySelector('#account-login').click();assert.equal(w.document.querySelector('#password-form').hidden,false);
 w.document.querySelector('#account-password').value='test-long-password';w.document.querySelector('#password-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(w.PortalAccount.state.authenticated,true);
 w.document.querySelector('#account-change-password').click();assert.equal(w.document.querySelector('#change-password-form').hidden,false);
 for(const [id,value] of [['current-password','test-long-password'],['new-password','replacement-password'],['confirm-password','replacement-password']])w.document.getElementById(id).value=value;
 w.document.querySelector('#change-password-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(changed,true);assert.equal(w.PortalAccount.state.authenticated,false);assert.equal(w.document.querySelector('#new-password').value,'');assert.equal(w.document.querySelector('#password-form').hidden,false);
 for(const path of ['dist/chi-tieu/index.html','dist/gemini/index.html','dist/do-vat/xe-yamaha-nvx-v1/index.html']){if(!fs.existsSync(path))continue;const s=fs.readFileSync(path,'utf8');assert.ok(!s.includes('id="password-form"'));assert.ok(s.includes('href="/#portal-account"'));}
 assert.equal(calls.length,2);dom.window.close();
});
