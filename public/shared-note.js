(()=>{
 const $=id=>document.getElementById(id),token=new URLSearchParams(location.search).get('token');
 let revision='',dirty=false,busy=false;
 const status=s=>{$('shared-status').textContent=s;};
 const checklist = window.NoteChecklist?.($('shared-checklist'),()=>{dirty=true;status('Chưa lưu thay đổi.');});
 const api=async(payload)=>{
  const r=await fetch('/api/shared-note'+(payload?'':'?token='+encodeURIComponent(token||'')),{credentials:'omit',cache:'no-store',...(payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...payload})}:{})});
  const d=await r.json();if(!r.ok)throw new Error(d.error||'Không thể truy cập Note.');return d;
 };
 const load=async()=>{
  if(dirty&&!confirm('Bỏ thay đổi chưa lưu để tải lại?'))return;
  busy=true;try{const d=await api();revision=d.revision;$('shared-title').value=d.title;$('shared-text').value=d.text;checklist?.load(d.checklist||[]);dirty=false;status('Đã tải bản mới nhất. Link hoạt động đến khi chủ sở hữu ngừng chia sẻ.');}catch(e){status(e.message);}finally{busy=false;}
 };
 for(const id of ['shared-title','shared-text'])$(id).addEventListener('input',()=>{dirty=true;status('Chưa lưu thay đổi.');});
 $('shared-refresh').addEventListener('click',load);
 $('shared-save').addEventListener('click',async()=>{
  if(busy||!dirty)return;busy=true;status('Đang lưu…');
  try{
   const title=$('shared-title').value,text=$('shared-text').value,items=checklist?.value();
   const d=await api({revision,title,text,checklist:items});revision=d.revision;dirty=title!==$('shared-title').value||text!==$('shared-text').value||JSON.stringify(items||[])!==JSON.stringify(checklist?.value()||[]);
   status(dirty?'Đã lưu bản trước. Cần lưu tiếp thay đổi mới.':'Đã lưu.'); 
  }catch(e){status(e.message+' Nội dung đang nhập vẫn được giữ.');}
  finally{busy=false;}
 });
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 if(!token){status('Thiếu mã chia sẻ.');return;}load();
})();

