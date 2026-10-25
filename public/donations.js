/* Public MB donation feed only. Never read the private expense ledger in browser. */
(()=>{
 const $=id=>document.getElementById(id),desk=$('cat-desk');if(!desk)return;
 const money=n=>n.toLocaleString('vi-VN')+'đ';
 const when=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
 let initialized=false,seen=new Set(),queue=[],playing=false,items=[],visible=10,cursor=null,requestPending=false,feedHealthy=false,audio;
 const sound=$('donate-sound');
 sound.addEventListener('click',async()=>{
  if(sound.getAttribute('aria-pressed')==='true'){sound.setAttribute('aria-pressed','false');sound.textContent='Bật tiếng ting ting';return;}
  try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();await audio.resume();sound.setAttribute('aria-pressed','true');sound.textContent='Tắt tiếng ting ting';}catch{sound.textContent='Trình duyệt chưa bật được tiếng';}
 });
 function ding(){if(!audio||sound.getAttribute('aria-pressed')!=='true')return;try{for(const [offset,freq] of [[0,880],[.14,1175]]){const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+offset;o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.1,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+.5);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.52);}}catch{}}
 function show(item,live){
  $('donate-amount').textContent=(live?'Ting ting! +':'+')+money(item.amount);
  $('donate-message').textContent=item.message||'Một đại ca giấu tên vừa cho mèo ăn.';
  $('donate-thanks').textContent=item.thanks;
  if(live){desk.classList.add('donate-celebrate');ding();}
 }
 async function play(){if(playing)return;playing=true;while(queue.length){const item=queue.shift();if(!document.hidden){show(item,true);await new Promise(resolve=>setTimeout(resolve,10000));desk.classList.remove('donate-celebrate');}}playing=false;}
 function history(){
  const list=$('donate-history');list.replaceChildren();
  for(const item of items.slice(0,visible)){
   const li=document.createElement('li'),amount=document.createElement('strong'),time=document.createElement('time'),message=document.createElement('p'),thanks=document.createElement('small');
   amount.textContent='🐟 +'+money(item.amount);time.textContent=when(item.received_at);time.dateTime=item.received_at;message.textContent=item.message||'Không kèm lời nhắn';thanks.textContent=item.thanks;
   li.append(amount,time,message,thanks);list.append(li);
  }
  $('donate-history-state').textContent=items.length?'Đã ghi nhận '+items.length+' khoản trong sổ hiển thị.':'Chưa có donate được xác nhận. Mèo vẫn kiên nhẫn ngồi chờ.';
  $('donate-more').hidden=visible>=items.length;
 }
 $('donate-more').addEventListener('click',()=>{visible+=20;history();});
 function validate(data){
  if(data?.schema!==1||data.bank!=='MB'||!Array.isArray(data.items)||data.items.length>5000||typeof data.enabled!=='boolean'||!Number.isFinite(Date.parse(data.server_time)))throw Error('feed');
  const ids=new Set();for(const item of data.items){if(!/^[a-f0-9]{64}$/.test(item.id)||ids.has(item.id)||!Number.isSafeInteger(item.amount)||item.amount<=0||item.amount>1e12||!Number.isFinite(Date.parse(item.received_at))||typeof item.message!=='string'||item.message.length>400||typeof item.thanks!=='string'||item.thanks.length>300)throw Error('item');ids.add(item.id);}
  return data;
 }
 async function refresh(){
  if(requestPending||document.hidden)return;requestPending=true;
  try{
   const response=await fetch('/api/backfill-progress?feed=donations',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('HTTP');const data=validate(await response.json());
   const latest=data.items.slice().sort((a,b)=>Date.parse(b.received_at)-Date.parse(a.received_at)||b.id.localeCompare(a.id));
   const server=Date.parse(data.server_time);
   if(initialized&&feedHealthy){for(const item of latest.slice().reverse()){const at=Date.parse(item.received_at);if(!seen.has(item.id)&&cursor!==null&&at>=cursor&&server-at<=120000&&server-at>=-300000)queue.push(item);}}
   const resetBaseline=!initialized||!feedHealthy;
   seen=new Set(latest.map(item=>item.id));if(resetBaseline)cursor=server;items=latest;initialized=true;feedHealthy=true;
   if(latest.length&&!playing&&!queue.length)show(latest[0],false);
   if(!latest.length){$('donate-amount').textContent='Chờ ting ting…';$('donate-message').textContent='Ai cho ăn thì mèo cảm ơn. Ai chưa cho ăn, mèo vẫn nhìn.';$('donate-thanks').textContent='MB 566766 · lời nhắn chuyển khoản tùy ý.';}
   $('donate-connection').textContent=data.enabled?'Đã kết nối · '+when(data.server_time)+(resetBaseline?' · chỉ reo các khoản mới khi trang đang mở.':''):'Đang chờ bật bộ nhận thông báo MB.';
   history();play();
  }catch{feedHealthy=false;queue=[];$('donate-connection').textContent='Chưa tải được sổ donate mới; không thể xác nhận khoản mới.';if(!initialized)$('donate-history-state').textContent='Chưa kết nối được sổ donate. Không có số liệu được xác minh.';}
  finally{requestPending=false;}
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden){feedHealthy=false;queue=[];}else refresh();});
 const dialog=$('donate-dialog');document.querySelectorAll('[data-donate-zoom]').forEach(button=>button.addEventListener('click',()=>dialog.showModal()));$('donate-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 $('donate-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText('566766');$('donate-copy-state').textContent='Đã sao chép 566766';}catch{$('donate-copy-state').textContent='Số tài khoản: 566766';}});
 refresh();setInterval(refresh,10000);
})();
