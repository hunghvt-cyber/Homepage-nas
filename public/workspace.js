(()=>{
 const $=id=>document.getElementById(id),token=new URLSearchParams(location.search).get('token');
 let id=null,revision=null,dirty=false,busy=false;
 const status=s=>{$('workspace-status').textContent=s;};
 const checklist = window.NoteChecklist?.($('workspace-checklist'),()=>{dirty=true;status('Chưa lưu thay đổi.');});
 const api=async(query={},post=false)=>{
  const url='/api/shared-folder'+(post?'':'?'+new URLSearchParams({token,...query}));
  const r=await fetch(url,{cache:'no-store',credentials:'omit',...(post?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...query})}:{})});
  const data=await r.json();if(!r.ok)throw new Error(data.error||'Không thể tải workspace.');return data;
 };
 const confirmDiscard=()=>!dirty||confirm('Bỏ thay đổi chưa lưu?');
 const fill=n=>{id=n?.id||null;revision=n?.revision||null;$('workspace-title').value=n?.title||'';$('workspace-text').value=n?.text||'';checklist?.load(n?.checklist||[]);dirty=false;};
 const list=async()=>{
  const data=await api();$('workspace-heading').textContent='Workspace: '+data.folder;
  $('workspace-list').replaceChildren();
  for(const note of data.notes){
   const button=document.createElement('button');button.type='button';button.className='note-card';
   const title=document.createElement('strong');title.textContent=note.title;
   const preview=document.createElement('span');preview.textContent=note.text;button.append(title,preview);
   button.addEventListener('click',async()=>{if(busy||!confirmDiscard())return;busy=true;try{fill(await api({id:note.id}));status('Đã tải Note mới nhất.');}catch(e){status(e.message);}finally{busy=false;}});
   $('workspace-list').append(button);
  }
  status('Đã tải '+data.notes.length+' Note.');
 };
 $('workspace-new').addEventListener('click',()=>{if(!busy&&confirmDiscard()){fill(null);status('Note mới — nhập và bấm Lưu.');}});
 $('workspace-reload').addEventListener('click',()=>{if(!busy&&confirmDiscard())list().catch(e=>status(e.message));});
 for(const key of ['workspace-title','workspace-text'])$(key).addEventListener('input',()=>{dirty=true;status('Chưa lưu.');});
 $('workspace-save').addEventListener('click',async()=>{
  if(busy||!dirty)return;busy=true;status('Đang lưu…');
  try{const title=$('workspace-title').value,text=$('workspace-text').value,items=checklist?.value();
   const result=await api({action:'save',id,revision,title,text,checklist:items},true);
   id=result.id;revision=result.revision;dirty=title!==$('workspace-title').value||text!==$('workspace-text').value||JSON.stringify(items||[])!==JSON.stringify(checklist?.value()||[]);
   status(dirty?'Đã lưu bản trước, còn thay đổi mới chưa lưu.':'Đã lưu.');
   const previous=status;await list();if(!dirty)previous('Đã lưu.');
  }catch(e){status(e.message+' Nội dung đang nhập vẫn được giữ.');}finally{busy=false;}
 });
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 if(token)list().catch(e=>status(e.message));else status('Thiếu mã chia sẻ.');
})();

