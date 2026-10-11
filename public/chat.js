(() => {
 const workspace=document.getElementById('chat-workspace'),log=document.getElementById('chat-log'),input=document.getElementById('chat-input'),status=document.getElementById('chat-status'),send=document.getElementById('chat-send');
 let messages=[],busy=false,controller=null,generation=0;
 function line(role,text){const article=document.createElement('article');article.className='chat-message';const label=document.createElement('strong'),p=document.createElement('p');label.textContent=role==='user'?'Bạn':'Gemini';p.textContent=text;article.append(label,p);log.append(article);article.scrollIntoView?.({block:'nearest'});}
 function reset(){generation++;controller?.abort();controller=null;messages=[];busy=false;send.disabled=false;log.replaceChildren();input.value='';status.textContent='';}
 window.addEventListener('account-change',e=>{workspace.hidden=!e.detail.authenticated;if(!e.detail.authenticated)reset();});
 document.getElementById('chat-new').addEventListener('click',()=>{reset();input.focus();});
 document.getElementById('chat-stop').addEventListener('click',()=>{if(busy){generation++;controller?.abort();busy=false;send.disabled=false;status.textContent='Đã dừng chờ câu trả lời.';}});
 document.getElementById('chat-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!window.PortalAccount.state.authenticated)return;
  const text=input.value.trim();if(!text)return;
  const next=[...messages,{role:'user',text}];
  if(next.length>19 || next.reduce((n,m)=>n+m.text.length,0)>24000){status.textContent='Cuộc trò chuyện đã dài. Bấm Cuộc trò chuyện mới.';return;}
  busy=true;send.disabled=true;status.textContent='Gemini đang trả lời…';
  controller=new AbortController();const current=++generation;
  try{
   const response=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:next}),signal:controller.signal});
   const data=await response.json();if(current!==generation)return;
   if(!response.ok){if(response.status===401){reset();workspace.hidden=true;window.PortalAccount.login();}throw new Error(data.error||'Chưa nhận được câu trả lời.');}
   messages=[...next,{role:'model',text:data.text}];line('user',text);line('model',data.text);input.value='';status.textContent='';
  }catch(err){if(current===generation)status.textContent=err.name==='AbortError'?'Đã dừng chờ câu trả lời.':err.message;}
  finally{if(current===generation){busy=false;send.disabled=false;controller=null;}}
 });
})();
