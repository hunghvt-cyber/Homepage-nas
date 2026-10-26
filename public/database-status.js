(()=>{
 const state=document.getElementById('database-state'),time=document.getElementById('database-time'),button=document.getElementById('database-refresh');
 if(!state)return;
 async function check(){button.disabled=true;state.textContent='Đang kiểm tra kết nối API…';try{const r=await fetch('/api/auth/?health=supabase',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const d=await r.json();if(typeof d.reachable!=='boolean'||!Number.isFinite(Date.parse(d.checkedAt)))throw Error();state.textContent=d.reachable?'🟢 API Supabase đang phản hồi':'🟠 Chưa kết nối được API · có thể đang tạm dừng hoặc gặp lỗi';time.textContent='Kiểm tra lúc '+new Date(d.checkedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});}catch{state.textContent='Chưa kiểm tra được trạng thái Supabase';time.textContent='Bấm kiểm tra lại hoặc mở trang quản trị Supabase.';}finally{button.disabled=false;}}
 button.addEventListener('click',check);check();
})();
