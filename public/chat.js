(() => {
 const workspace=document.getElementById('chat-workspace'),log=document.getElementById('chat-log'),input=document.getElementById('chat-input'),status=document.getElementById('chat-status'),send=document.getElementById('chat-send');
 let messages=[],busy=false,controller=null,generation=0;
 const model=document.getElementById('chat-model'),modelStatus=document.getElementById('chat-model-status'),refresh=document.getElementById('chat-model-refresh');
 let catalogGeneration=0,catalogController=null;
 function modelInfo(text){if(modelStatus)modelStatus.textContent=text;}
 async function loadModels(forceRefresh=false){
  if(!model||!window.PortalAccount.state.authenticated)return;
  catalogController?.abort();catalogController=new AbortController();const current=++catalogGeneration;
  refresh.disabled=true;modelInfo('Đang tải danh sách model…');
  try{
   const response=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'models',refresh:forceRefresh===true}),signal:catalogController.signal});
   const data=await response.json();if(current!==catalogGeneration)return;
   if(!response.ok)throw new Error(data.error||'Chưa tải được danh sách model.');
   if(!Array.isArray(data.models))throw new Error('Chưa tải được danh sách model.');
   const selected=model.value;model.replaceChildren(new Option('Mặc định · '+data.defaultModel,''));
   data.models.forEach(id=>model.add(new Option(id,id)));
   if(data.models.includes(selected))model.value=selected;
   else if(selected){const unavailable=new Option(selected+' · không còn trong danh sách',selected,true,true);unavailable.disabled=true;model.add(unavailable);model.value=selected;}
   modelInfo(selected&&!data.models.includes(selected)?'Model đã chọn không còn trong danh sách. Hãy chủ động chọn Mặc định hoặc model khác.':'Google có liệt kê các model này; quota được kiểm tra khi gửi. Chưa có câu trả lời để xác minh phiên bản thực tế.');
  }catch(err){if(current===catalogGeneration&&err.name!=='AbortError')modelInfo(err.message+' Có thể tiếp tục với Mặc định.');}
  finally{if(current===catalogGeneration){refresh.disabled=false;catalogController=null;}}
 }
 refresh?.addEventListener('click',()=>loadModels(true));
 model?.addEventListener('change',()=>modelInfo('Đã chọn '+(model.value||'Mặc định')+'. Áp dụng cho câu hỏi tiếp theo; chưa xác minh phiên bản.'));
 function line(role,text){const article=document.createElement('article');article.className='chat-message';const label=document.createElement('strong'),p=document.createElement('p');label.textContent=role==='user'?'Bạn':'Gemini';p.textContent=text;article.append(label,p);log.append(article);article.scrollIntoView?.({block:'nearest'});}
 function reset(){generation++;controller?.abort();controller=null;messages=[];busy=false;send.disabled=false;if(model)model.disabled=false;if(refresh)refresh.disabled=false;log.replaceChildren();input.value='';status.textContent='';modelInfo('Chưa có câu trả lời để xác minh phiên bản thực tế.');}
 window.addEventListener('account-change',e=>{workspace.hidden=!e.detail.authenticated;if(!e.detail.authenticated){reset();catalogGeneration++;catalogController?.abort();catalogController=null;if(model){model.replaceChildren(new Option('Mặc định',''));model.disabled=false;refresh.disabled=false;}modelInfo('Chưa xác minh model.');}else loadModels();});
 document.getElementById('chat-new').addEventListener('click',()=>{reset();input.focus();});
 document.getElementById('chat-stop').addEventListener('click',()=>{if(busy){generation++;controller?.abort();busy=false;send.disabled=false;if(model)model.disabled=false;if(refresh)refresh.disabled=false;status.textContent='Đã dừng chờ câu trả lời.';}});
 document.getElementById('chat-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!window.PortalAccount.state.authenticated)return;
  const text=input.value.trim();if(!text)return;
  const next=[...messages,{role:'user',text}];
  if(next.length>19 || next.reduce((n,m)=>n+m.text.length,0)>24000){status.textContent='Cuộc trò chuyện đã dài. Bấm Cuộc trò chuyện mới.';return;}
  busy=true;send.disabled=true;status.textContent='Gemini đang trả lời…';
  catalogGeneration++;catalogController?.abort();catalogController=null;if(refresh)refresh.disabled=true;
  if(model)model.disabled=true;
  controller=new AbortController();const current=++generation;
  try{
   const response=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:next,...(model?.value?{model:model.value}:{})}),signal:controller.signal});
   const data=await response.json();if(current!==generation)return;
   if(!response.ok){if(response.status===401){reset();workspace.hidden=true;window.PortalAccount.login();}throw new Error(data.error||'Chưa nhận được câu trả lời.');}
   messages=[...next,{role:'model',text:data.text}];line('user',text);line('model',data.text);input.value='';status.textContent='';
   const identity=data.modelVersion?'Google xác nhận phiên bản: '+data.modelVersion+(data.requestedModel?' · Yêu cầu: '+data.requestedModel:''):(data.requestedModel?'Model yêu cầu: '+data.requestedModel+' · Google chưa trả tên phiên bản.':'Chưa nhận được metadata model từ backend.');
   modelInfo(identity);
   if(modelStatus){const detail=document.createElement('small');detail.textContent=identity;log.lastElementChild.append(detail);}
  }catch(err){if(current===generation)status.textContent=err.name==='AbortError'?'Đã dừng chờ câu trả lời.':err.message;}
  finally{if(current===generation){busy=false;send.disabled=false;if(model)model.disabled=false;if(refresh)refresh.disabled=false;controller=null;}}
 });
})();

