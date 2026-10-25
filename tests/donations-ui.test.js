import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';
const stamp=Date.now(),gift=(id,ms=0)=>({id:id.toString(16).padStart(64,'0'),amount:50000,received_at:new Date(stamp+ms).toISOString(),message:'<img src=x onerror=alert(1)>',thanks:'Pate đến rồi!'});
async function flush(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}
async function setup(first){
 const dom=new JSDOM(readFileSync('scripts/templates/cat-desk.html','utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'https://homepage.test/'}),w=dom.window;let data=first,poll;
 w.AbortSignal=AbortSignal;w.setInterval=fn=>{poll=fn;};w.setTimeout=()=>{};w.fetch=async()=>({ok:true,json:async()=>data});w.eval(readFileSync('public/donations.js','utf8'));await flush();
 return {dom,w,set:async next=>{data=next;await poll();await flush();},text:id=>w.document.getElementById(id).textContent};
}
const feed=(items,delta=0)=>({schema:1,bank:'MB',enabled:true,server_time:new Date(stamp+delta).toISOString(),items});
test('initial history does not replay donations and arbitrary donor content renders only as text',async()=>{
 const x=await setup(feed([gift(1,-10000)]));assert.equal(x.text('donate-amount'),'+50.000đ');assert.ok(!x.text('donate-amount').includes('Ting'));assert.equal(x.w.document.querySelectorAll('#donate-history img').length,0);assert.match(x.text('donate-history'),/<img/);x.dom.window.close();
});
test('fresh new MB donation alerts but old catch-up does not',async()=>{
 const x=await setup(feed([gift(1,-10000)]));await x.set(feed([gift(2,1000),gift(1,-10000)],2000));assert.match(x.text('donate-amount'),/Ting ting! \+50.000đ/);assert.ok(x.w.document.getElementById('cat-desk').classList.contains('donate-celebrate'));x.dom.window.close();
 const y=await setup(feed([]));await y.set(feed([gift(3,-3600000)],2000));assert.ok(!y.text('donate-amount').includes('Ting'));y.dom.window.close();
});
test('unavailable feed never invents zero gifts or a successful new gift',async()=>{
 const x=await setup({error:'unavailable'});assert.match(x.text('donate-connection'),/Chưa tải được/);assert.match(x.text('donate-history-state'),/Không có số liệu được xác minh/);x.dom.window.close();
});
