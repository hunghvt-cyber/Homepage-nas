/* Final snapshots and currently running work are deliberately displayed separately. */
(async()=>{
 const put=(id,value)=>{const el=document.getElementById('backfill-'+id);if(el)el.textContent=String(value)};
 const when=value=>new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
 try{
  const response=await fetch('/api/backfill-progress',{signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!response.ok)throw Error('unavailable');const data=await response.json();
  const report=data.snapshot,current=data.current;
  if(current){
   const active=['queued','pending','waiting','in_progress','requested'].includes(current.status);
   put('state',active?(current.status==='in_progress'?'Backfill đang chạy':'Backfill đang chờ chạy'):(current.conclusion==='success'?'Lượt gần nhất đã kết thúc':current.conclusion==='cancelled'?'Lượt gần nhất đã bị dừng':'Lượt gần nhất kết thúc có lỗi')); 
   put('run-time',(active?'Bắt đầu: ':'Lượt gần nhất bắt đầu: ')+when(current.started_at));
   const link=document.getElementById('backfill-link');
   if(link&&current.run_url==='https://github.com/hunghvt-cyber/google-photos-koofr/actions/runs/'+current.run_id)link.href=current.run_url;
  }else put('state','Chưa xác minh được lượt đang chạy');
  if(!report){put('snapshot','Chưa có báo cáo tiến độ đã xác minh.');return;}
  if(report.source!=='gphotos-backfill'||!report.metrics)throw Error('invalid');
  const metrics=report.metrics;
  for(const [id,key] of [['uploaded','uploaded_total'],['pending','pending_seen'],['errors','pending_errors'],['inventory','inventoried_total'],['albums','albums'],['recent','uploaded_this_run']]){
   if(!Number.isSafeInteger(metrics[key])||metrics[key]<0)throw Error('invalid');put(id,metrics[key].toLocaleString('vi-VN'));
  }
  put('snapshot','Số liệu chốt lúc '+when(report.measured_at)+(current&&current.run_id!==report.run_id?' · thuộc lượt trước.':'.'));
  put('coverage',metrics.inventory_complete?'Đã duyệt xong một vòng kiểm kê; còn phải đối chiếu mục chờ và lỗi.':'Chưa duyệt hết thư viện.');
  const age=Date.now()-Date.parse(report.measured_at);
  put('note',(age>36*3600000?'Báo cáo đã quá 36 giờ. ':'')+'Số đã lưu là số manifest ghi nhận, còn cần kiểm chứng bản gốc. Không cộng các nhóm để suy ra tổng thư viện.');
 }catch{
  put('state','Chưa tải được tiến độ Backfill');
  put('snapshot','Không có số liệu mới được xác minh.');
  for(const id of ['uploaded','pending','errors','inventory','albums','recent'])put(id,'—');
 }
})();
