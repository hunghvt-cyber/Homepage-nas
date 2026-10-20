import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
const wait=()=>new Promise(r=>setImmediate(r));
function modelUI(){
 const dom=new JSDOM('<div id="chat-workspace" hidden><select id="chat-model"><option value="">Mặc định</option></select><button id="chat-model-refresh"></button><p id="chat-model-status"></p><div id="chat-log"></div><form id="chat-form"><textarea id="chat-input"></textarea><button id="chat-send"></button></form><p id="chat-status"></p><button id="chat-new"></button><button id="chat-stop"></button></div>',{runScripts:'outside-only',url:'https://homepage-nas.vercel.app/gemini/'});
 const w=dom.window;w.PortalAccount={state:{authenticated:true},login(){}};w.AbortController=AbortController;
 return {dom,w,start(){w.eval(readFileSync(new URL('../public/chat.js',import.meta.url),'utf8'));w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:true}}));}};
}
test('picker signs selection, shows API identity instead of self-description, preserves failed draft',async()=>{
 const {dom,w,start}=modelUI(),sent=[];
 w.fetch=async(url,options)=>{const body=JSON.parse(options.body);sent.push(body);return {ok:true,json:async()=>body.operation==='models'?{defaultModel:'gemini-default',models:['gemini-other']}:{text:'Tôi là 1.5 Pro',requestedModel:'gemini-other',modelVersion:'gemini-other-001'}};};
 start();await wait();const d=w.document,model=d.getElementById('chat-model'),input=d.getElementById('chat-input'),form=d.getElementById('chat-form');model.value='gemini-other';input.value='Chào';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();
 assert.equal(sent.at(-1).model,'gemini-other');assert.match(d.getElementById('chat-model-status').textContent,/Google xác nhận phiên bản: gemini-other-001/);assert.match(d.querySelector('#chat-log small').textContent,/gemini-other-001/);
 w.fetch=async()=>({ok:false,json:async()=>({error:'Google đang quá tải (503).'})});input.value='Giữ câu hỏi';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await wait();assert.equal(input.value,'Giữ câu hỏi');assert.equal(model.value,'gemini-other');assert.equal(model.disabled,false);
 dom.window.close();
});
test('late catalog/chat responses cannot restore state after stop or lock',async()=>{
 const {dom,w,start}=modelUI();let resolve;
 w.fetch=()=>new Promise(r=>resolve=r);start();w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:false}}));resolve({ok:true,json:async()=>({defaultModel:'gemini-late',models:['gemini-late']})});await wait();assert.equal(w.document.getElementById('chat-model').options.length,1);
 w.fetch=async()=>({ok:false,json:async()=>({error:'Catalog unavailable'})});w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:true}}));await wait();
 w.fetch=()=>new Promise(r=>resolve=r);const d=w.document;d.getElementById('chat-input').value='Câu hỏi';d.getElementById('chat-form').dispatchEvent(new w.Event('submit',{cancelable:true}));d.getElementById('chat-stop').click();resolve({ok:true,json:async()=>({text:'Late',modelVersion:'gemini-late'})});await wait();assert.equal(d.getElementById('chat-log').textContent,'');assert.equal(d.getElementById('chat-input').value,'Câu hỏi');assert.equal(d.getElementById('chat-model-refresh').disabled,false);dom.window.close();
});
test('refresh never silently switches a removed selection to the default',async()=>{
 const {dom,w,start}=modelUI();let available=['gemini-other'],last;
 w.fetch=async(url,options)=>{last=JSON.parse(options.body);return {ok:true,json:async()=>({defaultModel:'gemini-default',models:available})};};start();await wait();const d=w.document;d.getElementById('chat-model').value='gemini-other';available=[];d.getElementById('chat-model-refresh').click();await wait();assert.equal(last.refresh,true);assert.equal(d.getElementById('chat-model').value,'gemini-other');assert.match(d.getElementById('chat-model-status').textContent,/chủ động chọn/);dom.window.close();
});
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

