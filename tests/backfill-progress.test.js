import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';
import {validateProgress,currentRun,SNAPSHOT_URL,RUNS_URL} from '../lib/backfill-progress.js';
import {createBackfillProgressHandler} from '../api/backfill-progress.js';
const snapshot=()=>({schema_version:1,source:'gphotos-backfill',run_id:10,run_number:14,run_attempt:1,run_url:'https://github.com/hunghvt-cyber/google-photos-koofr/actions/runs/10',source_sha:'a'.repeat(40),measured_at:'2026-10-21T05:12:03Z',outcome:'failure',metrics:{uploaded_total:1640,pending_seen:45515,pending_errors:105,inventoried_total:47247,albums:49,album_memberships:25299,attempted_this_run:390,uploaded_this_run:362,errors_this_run:28,inventory_complete:false}});
const running=()=>({workflow_runs:[{id:11,head_branch:'main',path:'.github/workflows/backfill.yml',status:'in_progress',html_url:'https://github.com/hunghvt-cyber/google-photos-koofr/actions/runs/11',run_started_at:'2026-10-22T00:14:54Z'}]});
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(d){this.data=d;return this}}}
test('only aggregate schema, exact run links and finite nonnegative counts are accepted',()=>{
 assert.equal(validateProgress(snapshot()).metrics.uploaded_total,1640);
 for(const mutate of [d=>d.cookie='secret',d=>d.metrics.pending_errors=-1,d=>d.metrics.uploaded_total=true,d=>d.run_url='https://other.invalid',d=>d.measured_at='2999-01-01T00:00:00Z']){const d=snapshot();mutate(d);assert.throws(()=>validateProgress(d));}
});
test('current run must be the fixed Backfill workflow on main',()=>{
 assert.equal(currentRun(running()).run_id,11);const d=running();d.workflow_runs[0].path='.github/workflows/daily.yml';assert.throws(()=>currentRun(d));
});
test('API keeps prior terminal snapshot and currently running job separate',async()=>{
 const r=res(),urls=[];await createBackfillProgressHandler({request:async url=>{urls.push(url);return Response.json(url===SNAPSHOT_URL?snapshot():running())}})({method:'GET'},r);
 assert.equal(r.code,200);assert.equal(r.data.snapshot.run_id,10);assert.equal(r.data.current.run_id,11);assert.equal(r.data.current.status,'in_progress');assert.deepEqual(urls,[SNAPSHOT_URL,RUNS_URL]);
});
test('snapshot can survive transient GitHub status failure without inventing current health',async()=>{
 const r=res();await createBackfillProgressHandler({request:async url=>{if(url===RUNS_URL)throw Error('rate limit');return Response.json(snapshot())}})({method:'GET'},r);
 assert.equal(r.code,200);assert.equal(r.data.current,null);assert.equal(r.data.current_available,false);assert.ok(r.data.snapshot);
});
test('corrupt or oversized snapshot is rejected; complete source failure is uncacheable',async()=>{
 const r=res();await createBackfillProgressHandler({request:async url=>Response.json(url===SNAPSHOT_URL?{...snapshot(),raw:'x'.repeat(9000)}:{unexpected:true})})({method:'GET'},r);
 assert.equal(r.code,502);assert.equal(r.headers['Cache-Control'],'no-store');
});
test('UI labels old snapshot during running job and avoids whole-library success or percent',async()=>{
 const ids=['state','run-time','snapshot','uploaded','pending','errors','inventory','albums','recent','coverage','note'];
 const dom=new JSDOM(ids.map(id=>'<span id="backfill-'+id+'"></span>').join('')+'<a id="backfill-link"></a>',{runScripts:'outside-only'});
 dom.window.AbortSignal=AbortSignal;dom.window.fetch=async()=>Response.json({snapshot:snapshot(),current:currentRun(running())});
 dom.window.eval(readFileSync('public/backfill-progress.js','utf8'));for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));
 assert.match(dom.window.document.getElementById('backfill-state').textContent,/đang chạy/);
 assert.match(dom.window.document.getElementById('backfill-snapshot').textContent,/lượt trước/);
 assert.match(dom.window.document.getElementById('backfill-coverage').textContent,/Chưa duyệt hết/);
 assert.equal(dom.window.document.getElementById('backfill-uploaded').textContent,'1.640');
 assert.ok(!dom.window.document.body.textContent.includes('%'));dom.window.close();
});
