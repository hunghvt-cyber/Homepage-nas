import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
const ids=['updated','cam1','cam2','nas','maintenance','retention','maintenance-time','retention-time','health-updated','health-root-used','health-root-free','health-vol1-used','health-vol1-free','health-ram','health-swap-usage','health-swap-percent'];
async function run(data){
 const dom=new JSDOM(ids.map(x=>`<span id="${x}">old</span>`).join(''),{runScripts:'outside-only'}),w=dom.window;
 w.AbortSignal=AbortSignal;w.setInterval=()=>{};w.fetch=async()=>{if(data instanceof Error)throw data;return {ok:true,json:async()=>data};};
 w.eval(readFileSync('public/status.js','utf8'));for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));return id=>w.document.getElementById(id).textContent;
}
test('stale telemetry cannot present camera/NAS as currently healthy',async()=>{
 const get=await run({schema:1,updated_at:'2026-01-01T00:00:00Z',cam1:{state:'ok'},cam2:{state:'ok'},nas:{state:'ok'},maintenance:{state:'pass',measured_at:'2026-01-01T00:00:00Z'},retention:{state:'unknown'}});
 for(const id of ['cam1','cam2','nas'])assert.match(get(id),/Dữ liệu cũ/);
 assert.equal(get('maintenance'),'Đạt');assert.match(get('maintenance-time'),/Kết quả gần nhất/);
});
test('network error clears current telemetry and health confirmation',async()=>{
 const get=await run(Error('offline'));assert.equal(get('cam1'),'Chưa xác minh');assert.equal(get('nas'),'Chưa xác minh');assert.equal(get('health-ram'),'Chưa có dữ liệu mới');
});
