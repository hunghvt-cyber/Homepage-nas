import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';
import {validateProgress,currentRun,SNAPSHOT_URL,RUNS_URL,BACKFILL_REPO} from '../lib/backfill-progress.js';
import {createBackfillProgressHandler} from '../api/backfill-progress.js';
const snapshot=()=>({schema_version:1,source:'gphotos-backfill',run_id:10,run_number:14,run_attempt:1,run_url:'https://github.com/hunghvt-cyber/google-photos-koofr/actions/runs/10',source_sha:'a'.repeat(40),measured_at:'2026-10-21T05:12:03Z',outcome:'failure',metrics:{uploaded_total:1640,pending_seen:45515,pending_errors:105,inventoried_total:47247,albums:49,album_memberships:25299,attempted_this_run:390,uploaded_this_run:362,errors_this_run:28,inventory_complete:false}});
const running=()=>({workflow_runs:[{id:11,head_branch:'main',path:'.github/workflows/backfill.yml',status:'in_progress',html_url:'https://github.com/hunghvt-cyber/backup-drive/actions/runs/11',run_started_at:'2026-10-22T00:14:54Z'}]});
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
 assert.match(dom.window.document.getElementById('backfill-state').textContent,/Đang backup/);
 assert.match(dom.window.document.getElementById('backfill-snapshot').textContent,/lượt trước/);
 assert.match(dom.window.document.getElementById('backfill-coverage').textContent,/Chưa duyệt hết/);
 assert.equal(dom.window.document.getElementById('backfill-uploaded').textContent,'1.640');
 assert.equal(dom.window.document.getElementById('backfill-pending').textContent,'45.620');
 assert.ok(!dom.window.document.body.textContent.includes('%'));dom.window.close();
});

test('Photos totals fail closed for missing pending errors or overflow, without inventing zero',async()=>{
 for(const mutate of [d=>delete d.metrics.pending_errors,d=>{d.metrics.pending_seen=Number.MAX_SAFE_INTEGER;d.metrics.pending_errors=1;}]){
  const data=snapshot();mutate(data);
  const dom=new JSDOM(['state','snapshot','uploaded','pending','coverage','note'].map(id=>'<span id="backfill-'+id+'"></span>').join(''),{runScripts:'outside-only'});
  dom.window.AbortSignal=AbortSignal;dom.window.fetch=async()=>Response.json({snapshot:data,current:null});
  dom.window.eval(readFileSync('public/backfill-progress.js','utf8'));for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));
  assert.equal(dom.window.document.getElementById('backfill-pending').textContent,'—');
  assert.equal(dom.window.document.getElementById('backfill-uploaded').textContent,'—');dom.window.close();
 }
});

test('canonical endpoints avoid renamed repo redirects while old snapshots stay unchanged',()=>{
 assert.equal(BACKFILL_REPO,'hunghvt-cyber/backup-drive');
 assert.match(SNAPSHOT_URL,/^https:\/\/raw\.githubusercontent\.com\/hunghvt-cyber\/backup-drive\//);
 assert.match(RUNS_URL,/^https:\/\/api\.github\.com\/repos\/hunghvt-cyber\/backup-drive\//);
 const old=snapshot(),raw=JSON.stringify(old);
 assert.equal(validateProgress(old).measured_at,'2026-10-21T05:12:03Z');
 assert.equal(JSON.stringify(old),raw);
 const canonical={...old,run_url:'https://github.com/hunghvt-cyber/backup-drive/actions/runs/10'};
 assert.equal(validateProgress(canonical).run_id,10);
 for(const repo of ['backup-photos','unrelated','google-photos-koofr.evil']){
  assert.throws(()=>validateProgress({...old,run_url:'https://github.com/hunghvt-cyber/'+repo+'/actions/runs/10'}));
 }
 assert.throws(()=>validateProgress({...old,run_url:'https://github.com/hunghvt-cyber/backup-drive/actions/runs/999'}));
});
test('current run keeps canonical links and rejects malformed metadata or other repositories',()=>{
 assert.equal(currentRun(running()).run_url,'https://github.com/hunghvt-cyber/backup-drive/actions/runs/11');
 assert.equal(currentRun({workflow_runs:[]}),null);
 assert.throws(()=>currentRun({}));
 const bad=running();bad.workflow_runs[0].html_url='https://github.com/hunghvt-cyber/backup-photos/actions/runs/11';
 assert.throws(()=>currentRun(bad));
});
test('API requests stay redirect-forbidden on canonical sources',async()=>{
 const r=res();
 await createBackfillProgressHandler({request:async(url,options)=>{
  assert.equal(options.redirect,'error');
  assert.ok(url.includes('/hunghvt-cyber/backup-drive/'));
  return Response.json(url===SNAPSHOT_URL?snapshot():running());
 }})({method:'GET'},r);
 assert.equal(r.code,200);assert.equal(r.data.current_available,true);
});
