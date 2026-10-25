import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
function scene(){
 const dom=new JSDOM(readFileSync('scripts/templates/cat-desk.html','utf8'),{runScripts:'outside-only'});
 const w=dom.window;let expire;
 w.setTimeout=callback=>{expire=callback;return 1;};w.clearTimeout=()=>{};w.setInterval=()=>{};
 w.eval(readFileSync('public/cat-desk.js','utf8'));
 return {w,dom,desk:w.document.getElementById('cat-desk'),text:id=>w.document.getElementById(id).textContent,send:detail=>w.dispatchEvent(new w.CustomEvent('portal:nas-status',{detail})),expire:()=>expire()};
}
const report=()=>({data:{updated_at:new Date().toISOString(),cam1:{state:'ok'},cam2:{state:'ok'},nas:{state:'ok'},health:{vol1:{available_bytes:100*1024**3}}},stale:false,snapshotTime:'test time'});
test('keeper only confirms a fresh complete report; expiry removes confirmation',()=>{
 const s=scene();s.send(report());assert.equal(s.desk.dataset.mood,'ok');assert.match(s.text('cat-screen-storage'),/100.0 GiB/);
 s.expire();assert.equal(s.desk.dataset.mood,'waiting');assert.match(s.text('cat-screen-cameras'),/chưa rõ/);s.dom.window.close();
});
test('warnings, missing data, stale reports and failed requests have honest moods',()=>{
 const s=scene();const detail=report();detail.data.cam2.state='fail';s.send(detail);assert.equal(s.desk.dataset.mood,'warn');assert.match(s.text('cat-screen-cameras'),/cần kiểm tra/);
 delete detail.data.cam2;s.send(detail);assert.equal(s.desk.dataset.mood,'waiting');
 s.send({...report(),stale:true});assert.equal(s.desk.dataset.mood,'waiting');assert.match(s.text('cat-report-time'),/Chưa xác minh/);
 s.send({error:true});assert.equal(s.desk.dataset.mood,'waiting');assert.match(s.text('cat-screen-storage'),/chưa rõ/);s.dom.window.close();
});
test('motion toggle works by keyboard-native button without fetching data',()=>{
 const s=scene(),button=s.w.document.getElementById('cat-motion');button.click();assert.equal(button.getAttribute('aria-pressed'),'true');assert.ok(s.desk.classList.contains('motion-paused'));button.click();assert.equal(button.getAttribute('aria-pressed'),'false');s.dom.window.close();
});
