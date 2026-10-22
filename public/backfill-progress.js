/* One Photos total from the shared manifest; never sum per-run counters. */
(async()=>{
 const put=(id,value)=>{const el=document.getElementById('backfill-'+id);if(el)el.textContent=String(value)};
 const when=value=>new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
 try{
  const response=await fetch('/api/backfill-progress',{signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!response.ok)throw Error('unavailable');const data=await response.json();
  const report=data.snapshot,current=data.current;
  if(current){
   const active=['queued','pending','waiting','in_progress','requested'].includes(current.status);
   put('state',active?(current.status==='in_progress'?'Đang backup ảnh và video':'Đang chờ backup'):(current.conclusion==='success'?'Lượt gần nhất đã kết thúc':current.conclusion==='cancelled'?'Lượt gần nhất đã bị dừng':'Tiến độ backup đã cập nhật; một số mục cần thử lại'));
   const link=document.getElementById('backfill-link');
   if(link&&current.run_url==='https://github.com/hunghvt-cyber/google-photos-koofr/actions/runs/'+current.run_id)link.href=current.run_url;
  }else put('state','Chưa xác minh được lượt đang chạy');
  if(!report){put('snapshot','Chưa có báo cáo tiến độ đã xác minh.');return;}
  if(report.source!=='gphotos-backfill'||!report.metrics)throw Error('invalid');
  const metrics=report.metrics;
  for(const key of ['uploaded_total','pending_seen','pending_errors']){
   if(!Number.isSafeInteger(metrics[key])||metrics[key]<0)throw Error('invalid');
  }
  const remaining=metrics.pending_seen+metrics.pending_errors;
  if(!Number.isSafeInteger(remaining))throw Error('invalid');
  put('uploaded',metrics.uploaded_total.toLocaleString('vi-VN'));
  put('pending',remaining.toLocaleString('vi-VN'));
  put('snapshot','Cập nhật: '+when(report.measured_at)+(current&&current.run_id!==report.run_id?' · thuộc lượt trước.':'.'));
  put('coverage',metrics.inventory_complete?'':'Chưa duyệt hết thư viện; số còn cần upload có thể tăng.');
  const age=Date.now()-Date.parse(report.measured_at);
  put('note',(age>36*3600000?'Báo cáo đã quá 36 giờ. ':'')+'Số liệu cập nhật sau khi lượt backup kết thúc. Chưa xác minh lại toàn bộ bản gốc.');
 }catch{
  put('state','Chưa tải được tiến độ backup');
  put('snapshot','Không có số liệu mới được xác minh.');
  for(const id of ['uploaded','pending'])put(id,'—');
 }
})();
