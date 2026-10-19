/* Public, read-only, versioned backup reports. No GitHub credentials in browser. */
(async()=>{
  const put=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=String(value)};
  const base=window.BACKUP_REPORTS_BASE_URL||'';
  const api=window.BACKUP_REPORTS_API_URL||'';
  const when=v=>v?new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa có dữ liệu';
  const val=v=>v==null?'Chưa có dữ liệu':v;
  const sources=[
    {key:'gdrive',file:'gdrive-backup-latest.json',source:'gdrive-koofr',prefix:'backup',repo:'my-backup-gdrive-koofr'},
    {key:'gphotos',file:'gphotos-backup-latest.json',source:'gphotos-koofr',prefix:'photos',repo:'google-photos-koofr'}
  ];
  for(const item of sources){
    const p=item.prefix;
    if(!base&&!api){put(p+'-state','Chưa cấu hình nguồn báo cáo');continue;}
    try{
      const response=await fetch(api?api+'?source='+item.key:base+'/'+item.file,{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(!response.ok){
        if(api&&data.code==='NO_REPORT'){
          put(p+'-state','Chưa có báo cáo từ workflow');
          put(p+'-note','Nguồn GAS đã sẵn sàng; chờ workflow gửi kết quả.');
          continue;
        }
        throw new Error('HTTP '+response.status);
      }
      if(data.schema_version!==1||data.source!==item.source||!data.metrics||typeof data.metrics!=='object')throw new Error('Schema mismatch');
      const states={success:'Backup thành công',paused:'Tạm dừng theo giới hạn thời gian',failure:'Backup thất bại',unknown:'Chưa xác minh'};
      put(p+'-state',states[data.status]||states.unknown);
      put(p+'-time',when(data.finished_at));
      if(p==='backup'){
        put('backup-bytes',data.metrics.transferred_gib==null?'Chưa có dữ liệu':Number(data.metrics.transferred_gib).toFixed(3)+' GiB');
        put('backup-speed',data.metrics.speed_mib_s==null?'Chưa có dữ liệu':Number(data.metrics.speed_mib_s).toFixed(3)+' MiB/s');
        put('backup-ignored',val(data.metrics.ignored_count));
      }else{
        put('photos-uploaded',val(data.metrics.uploaded));
        put('photos-skipped',val(data.metrics.skipped));
        put('photos-errors',val(data.metrics.errors));
      }
      const warning=Array.isArray(data.warnings)?data.warnings.filter(x=>typeof x==='string').join(' '):'';
      put(p+'-note',warning||'Số liệu của lần chạy gần nhất.');
      const expected='https://github.com/hunghvt-cyber/'+item.repo+'/actions/runs/';
      if(Number.isInteger(data.run_id)&&data.run_id>0&&data.run_url===expected+data.run_id){
        document.getElementById(p+'-link').href=data.run_url;
      }
    }catch(err){put(p+'-state','Chưa tải được báo cáo; kiểm tra nguồn báo cáo');}
  }
})();


