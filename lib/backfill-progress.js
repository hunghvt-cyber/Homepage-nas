export const BACKFILL_REPO='hunghvt-cyber/google-photos-koofr';
export const SNAPSHOT_URL='https://raw.githubusercontent.com/'+BACKFILL_REPO+'/reports/backfill/backfill-latest.json';
export const RUNS_URL='https://api.github.com/repos/'+BACKFILL_REPO+'/actions/workflows/backfill.yml/runs?branch=main&per_page=1';
const fields=['uploaded_total','pending_seen','pending_errors','inventoried_total','albums','album_memberships','attempted_this_run','uploaded_this_run','errors_this_run'];
const exact=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...names].sort().join('|');
export function validateProgress(d,now=Date.now()){
 const fail=()=>{throw Error('INVALID_BACKFILL_PROGRESS')};
 if(!exact(d,['schema_version','source','run_id','run_number','run_attempt','run_url','source_sha','measured_at','outcome','metrics']))fail();
 if(d.schema_version!==1||d.source!=='gphotos-backfill'||!['success','failure','cancelled'].includes(d.outcome))fail();
 for(const key of ['run_id','run_number','run_attempt'])if(!Number.isSafeInteger(d[key])||d[key]<=0)fail();
 if(d.run_url!=='https://github.com/'+BACKFILL_REPO+'/actions/runs/'+d.run_id||!/^[a-f0-9]{40}$/.test(d.source_sha))fail();
 if(typeof d.measured_at!=='string'||!Number.isFinite(Date.parse(d.measured_at))||Date.parse(d.measured_at)>now+300000)fail();
 if(!exact(d.metrics,[...fields,'inventory_complete'])||typeof d.metrics.inventory_complete!=='boolean')fail();
 for(const key of fields)if(!Number.isSafeInteger(d.metrics[key])||d.metrics[key]<0)fail();
 if(d.metrics.uploaded_this_run+d.metrics.errors_this_run>d.metrics.attempted_this_run)fail();
 return d;
}
export function currentRun(data){
 const run=data?.workflow_runs?.[0];if(!run)return null;
 if(run.head_branch!=='main'||run.path!=='.github/workflows/backfill.yml'||!Number.isSafeInteger(run.id)||run.id<=0||!['queued','pending','waiting','in_progress','completed','requested'].includes(run.status))throw Error('INVALID_CURRENT_RUN');
 const link='https://github.com/'+BACKFILL_REPO+'/actions/runs/'+run.id;
 if(run.html_url!==link||!Number.isFinite(Date.parse(run.run_started_at||run.created_at)))throw Error('INVALID_CURRENT_RUN');
 return {run_id:run.id,run_url:link,status:run.status,conclusion:run.status==='completed'?run.conclusion:null,started_at:run.run_started_at||run.created_at};
}
export async function boundedJson(response,limit){
 if(!response.ok)throw Error('SOURCE_UNAVAILABLE');
 const reader=response.body?.getReader();if(!reader)throw Error('EMPTY_RESPONSE');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('SOURCE_TOO_LARGE')}chunks.push(Buffer.from(value));}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
