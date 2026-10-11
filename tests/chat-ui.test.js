import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
test('chat uses text rendering, keeps failed drafts, and clears history on lock',async()=>{
 const dom=new JSDOM('<div id="chat-workspace" hidden><div id="chat-log"></div><form id="chat-form"><textarea id="chat-input"></textarea><button id="chat-send"></button></form><p id="chat-status"></p><button id="chat-new"></button><button id="chat-stop"></button></div>',{runScripts:'outside-only',url:'https://homepage-nas.vercel.app/gemini/'});
 const w=dom.window;w.PortalAccount={state:{authenticated:true},login(){}};w.AbortController=AbortController;
 let sent=[];w.fetch=async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({text:'<img src=x onerror=alert(1)>'})};};
 w.eval(readFileSync(new URL('../public/chat.js',import.meta.url),'utf8'));
 w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:true}}));assert.equal(w.document.getElementById('chat-workspace').hidden,false);
 const input=w.document.getElementById('chat-input'),form=w.document.getElementById('chat-form');input.value='Chào';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setImmediate(r));
 assert.equal(w.document.querySelector('#chat-log img'),null);assert.match(w.document.getElementById('chat-log').textContent,/<img/);
 w.fetch=async()=>({ok:false,json:async()=>({error:'Hết hạn mức'})});input.value='Giữ bản nháp';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setImmediate(r));assert.equal(input.value,'Giữ bản nháp');
 w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:false}}));assert.equal(w.document.getElementById('chat-workspace').hidden,true);assert.equal(w.document.getElementById('chat-log').textContent,'');assert.equal(input.value,'');
 dom.window.close();
});
