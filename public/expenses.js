(() => {
 const $=id=>document.getElementById(id), money=n=>Math.round(n).toLocaleString('vi-VN')+'đ';
 let rows=[],sequence=0,selection=null;
 const now=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 $('expense-month').value=now.find(p=>p.type==='year').value+'-'+now.find(p=>p.type==='month').value;
 function filtered(){const payer=$('expense-payer').value;return rows.filter(r=>!payer || r.payerId===payer);}
 function details(){
  const panel=$('expense-details');panel.hidden=!selection;if(!selection)return;
  $('expense-detail-title').textContent=selection.label;
  const list=filtered().filter(selection.match).sort((a,b)=>b.day.localeCompare(a.day));
  $('expense-detail-count').textContent=list.length+' giao dịch';
  const body=$('expense-transactions');body.replaceChildren();
  for(const r of list){const tr=document.createElement('tr');for(const value of [r.day.split('-').reverse().join('/'),r.type==='ThuNhap'?'Thu nhập':'Chi tiêu',r.category,r.description || 'Chưa có diễn giải',r.payer,money(r.amount)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}
 }
 function choose(label,match){selection={label,match};details();$('expense-details').scrollIntoView?.({behavior:'smooth',block:'nearest'});}
 function bars(id,entries,kind){
  const target=$(id);target.replaceChildren();const max=Math.max(1,...entries.map(e=>e[1]));
  if(!entries.length){target.textContent='Chưa có chi tiêu.';return;}
  for(const [key,value] of entries){const label=kind==='day'?key.split('-').reverse().join('/'):key;const row=document.createElement('button');row.type='button';row.className='expense-bar-row';row.setAttribute('aria-label',label+': '+money(value)+', xem giao dịch');const caption=document.createElement('span');caption.textContent=label;const track=document.createElement('span');track.className='expense-track';const bar=document.createElement('span');bar.className='expense-bar';bar.style.width=(value/max*100)+'%';track.append(bar);const amount=document.createElement('small');amount.textContent=money(value);row.append(caption,track,amount);row.addEventListener('click',()=>choose((kind==='day'?'Ngày ':'Danh mục: ')+label,r=>r.type==='ChiTieu' && (kind==='day'?r.day===key:r.category===key)));target.append(row);}
 }
 function render(){
  let expense=0,income=0;const days=new Map(),cats=new Map();
  for(const r of filtered()){if(r.type==='ThuNhap'){income+=r.amount;continue;}expense+=r.amount;days.set(r.day,(days.get(r.day)||0)+r.amount);cats.set(r.category,(cats.get(r.category)||0)+r.amount);}
  $('expense-summary').replaceChildren();for(const [label,value,type] of [['Tổng chi',expense,'ChiTieu'],['Thu nhập',income,'ThuNhap'],['Chênh lệch',income-expense,null]]){const tile=document.createElement('button'),title=document.createElement('small'),amount=document.createElement('strong');tile.type='button';title.textContent=label;amount.textContent=money(value);tile.append(title,amount);tile.addEventListener('click',()=>choose(type?label:'Toàn bộ thu và chi',r=>!type || r.type===type));$('expense-summary').append(tile);}
  const sort=$('expense-sort').value;
  bars('expense-days',[...days].sort((a,b)=>sort==='amount'?b[1]-a[1] || b[0].localeCompare(a[0]):b[0].localeCompare(a[0])),'day');bars('expense-categories',[...cats].sort((a,b)=>b[1]-a[1]),'category');details();
 }
 async function load(){selection=null;details();const ticket=++sequence;$('expense-message').textContent='Đang tải…';$('expense-refresh').disabled=true;
  try{const data=await window.PortalAccount.api('/api/expenses?month='+encodeURIComponent($('expense-month').value));if(ticket!==sequence || !window.PortalAccount.state.authenticated)return;rows=data.transactions;const selected=$('expense-payer').value;$('expense-payer').replaceChildren(new Option('Cả nhà',''));const payers=new Map(rows.map(r=>[r.payerId,r.payer]));for(const [id,name] of payers)$('expense-payer').add(new Option(name,id));if(payers.has(selected))$('expense-payer').value=selected;render();$('expense-message').textContent=rows.length?'':'Chưa có giao dịch trong tháng này.';const date=new Date(data.measuredAt);$('expense-updated').textContent=Number.isNaN(date.getTime())?'':'Cập nhật: '+date.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
  }catch(e){if(ticket===sequence){rows=[];for(const id of ['expense-summary','expense-days','expense-categories','expense-updated','expense-transactions'])$(id).replaceChildren();$('expense-message').textContent=e.status===503?'Chưa kết nối dữ liệu Botchitieu.':e.message;}}
  finally{if(ticket===sequence)$('expense-refresh').disabled=false;}
 }
 $('expense-sort').addEventListener('change',render);$('expense-detail-close').addEventListener('click',()=>{selection=null;details();});
 $('expense-refresh').addEventListener('click',load);$('expense-month').addEventListener('change',load);$('expense-payer').addEventListener('change',render);
 window.addEventListener('account-change',e=>{$('expenses-workspace').hidden=!e.detail.authenticated;if(e.detail.authenticated)load();else{++sequence;rows=[];selection=null;details();for(const id of ['expense-summary','expense-days','expense-categories','expense-updated','expense-transactions'])$(id).replaceChildren();$('expense-payer').replaceChildren(new Option('Cả nhà',''));}});
})();
