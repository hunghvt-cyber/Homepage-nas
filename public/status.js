const labels={ok:'Hoạt động',pass:'Đạt',warn:'Cần kiểm tra',fail:'Có lỗi',unknown:'Chưa xác minh'};
const time=value=>{if(!value)return null;const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):null};
async function refresh(initial=false){
  const stamp=document.getElementById('updated');
  try{
    const response=await fetch(window.PORTAL_STATUS_URL||'/status.json',{cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error('HTTP');
    const data=await response.json();
    if(data.schema!==1||!time(data.updated_at))throw new Error('schema');
    const age=Date.now()-new Date(data.updated_at).getTime();
    const stale=age>15*60*1000||age< -5*60*1000;
    for(const key of ['cam1','cam2','nas','maintenance','retention']){
      if(!initial&&(key==='maintenance'||key==='retention'))continue;
      const item=data[key]||{};
      const el=document.getElementById(key);
      el.textContent=stale?'Dữ liệu cũ':(labels[item.state]||labels.unknown);
      if(key==='maintenance'||key==='retention'){
        const detail=document.getElementById(key+'-time');
        detail.textContent=time(item.measured_at)||'Chưa có thời điểm kết quả';
      }
    }
    stamp.textContent=(stale?'Dữ liệu cũ · ':'Cập nhật · ')+time(data.updated_at);
  }catch{stamp.textContent='Không tải được trạng thái. Các link và hướng dẫn vẫn dùng được.';}
}
refresh(true);
setInterval(refresh,300000);
