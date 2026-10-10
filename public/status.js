const labels={ok:'Hoạt động',pass:'Đạt',warn:'Cần kiểm tra',fail:'Có lỗi',unknown:'Chưa xác minh'};
const time=value=>{if(!value)return null;const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):null};
async function refresh(){
  const stamp=document.getElementById('updated');
  try{
    const response=await fetch(window.PORTAL_STATUS_URL||'/status.json',{cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('HTTP');
    const data=await response.json();
    if(data.schema!==1)throw new Error('schema');
    const snapshotTime=time(data.updated_at);
    const age=snapshotTime?Date.now()-new Date(data.updated_at).getTime():Infinity;
    const stale=!!snapshotTime&&(age>15*60*1000||age< -5*60*1000);
    for(const key of ['cam1','cam2','nas','maintenance','retention']){
      const item=data[key]||{};
      const el=document.getElementById(key);
      if(key==='maintenance'||key==='retention'){
        el.textContent=key==='retention'?({pass:'Đã dọn xong',ok:'Đã dọn xong',warn:'Cần kiểm tra',fail:'Dọn chưa thành công',unknown:'Chưa có kết quả xác nhận'}[item.state]||'Chưa có kết quả xác nhận'):(labels[item.state]||'Chưa có kết quả xác nhận');
        const detail=document.getElementById(key+'-time');
        const measured=time(item.measured_at);
        detail.textContent=measured?'Kết quả gần nhất · '+measured:'Chưa có thời điểm kết quả';
      }else {
        const label=labels[item.state]||labels.unknown;
        el.textContent=label;
      }
    }
    stamp.textContent=snapshotTime?'Báo cáo gần nhất: '+snapshotTime+(stale?' · Chưa nhận được báo cáo mới.':''):'Chưa có thời gian báo cáo';
  }catch{stamp.textContent='Không tải được trạng thái. Các link và hướng dẫn vẫn dùng được.';}
}
refresh();
setInterval(refresh,300000);
