(() => {
 const $=id=>document.getElementById(id), money=n=>Math.round(n).toLocaleString('vi-VN')+'đ';
 let rows=[],sequence=0;
 const now=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 $('expense-month').value=now.find(p=>p.type==='year').value+'-'+now.find(p=>p.type==='month').value;
 function bars(id,values){
  const target=$(id);target.replaceChildren();const entries=Object.entries(values), max=Math.max(1,...entries.map(e=>e[1]));
  if(!entries.length){target.textContent='Chưa có chi tiêu.';return;}
  for(const [label,value] of entries){const row=document.createElement('div');row.className='expense-bar-row';const caption=document.createElement('span');caption.textContent=label;const track=document.createElement('div');track.className='expense-track';const bar=document.createElement('div');bar.className='expense-bar';bar.style.width=(value/max*100)+'%';track.append(bar);const amount=document.createElement('small');amount.textContent=money(value);row.append(caption,track,amount);target.append(row);}
 }
 function render(){
  const payer=$('expense-payer').value;let expense=0,income=0;const days=Object.create(null),cats=Object.create(null);
  for(const r of rows){if(payer && r.payerId!==payer)continue;if(r.type==='ThuNhap'){income+=r.amount;continue;}expense+=r.amount;days[r.day.slice(8)]=(days[r.day.slice(8)]||0)+r.amount;cats[r.category]=(cats[r.category]||0)+r.amount;}
  $('expense-summary').replaceChildren();for(const [label,value] of [['Tổng chi',expense],['Thu nhập',income],['Chênh lệch',income-expense]]){const tile=document.createElement('div'),title=document.createElement('small'),amount=document.createElement('strong');title.textContent=label;amount.textContent=money(value);tile.append(title,amount);$('expense-summary').append(tile);}
  bars('expense-days',Object.fromEntries(Object.entries(days).sort((a,b)=>Number(a[0])-Number(b[0]))));bars('expense-categories',Object.fromEntries(Object.entries(cats).sort((a,b)=>b[1]-a[1])));
 }
 async function load(){const ticket=++sequence;$('expense-message').textContent='Đang tải…';$('expense-refresh').disabled=true;
  try{const data=await window.PortalAccount.api('/api/expenses?month='+encodeURIComponent($('expense-month').value));if(ticket!==sequence || !window.PortalAccount.state.authenticated)return;rows=data.transactions;const selected=$('expense-payer').value;$('expense-payer').replaceChildren(new Option('Cả nhà',''));const payers=new Map(rows.map(r=>[r.payerId,r.payer]));for(const [id,name] of payers)$('expense-payer').add(new Option(name,id));if(payers.has(selected))$('expense-payer').value=selected;render();$('expense-message').textContent=rows.length?'':'Chưa có giao dịch trong tháng này.';const date=new Date(data.measuredAt);$('expense-updated').textContent=Number.isNaN(date.getTime())?'':'Cập nhật: '+date.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
  }catch(e){if(ticket===sequence){rows=[];for(const id of ['expense-summary','expense-days','expense-categories','expense-updated'])$(id).replaceChildren();$('expense-message').textContent=e.status===503?'Chưa kết nối dữ liệu Botchitieu.':e.message;}}
  finally{if(ticket===sequence)$('expense-refresh').disabled=false;}
 }
 $('expense-refresh').addEventListener('click',load);$('expense-month').addEventListener('change',load);$('expense-payer').addEventListener('change',render);
 window.addEventListener('account-change',e=>{$('expenses-workspace').hidden=!e.detail.authenticated;if(e.detail.authenticated)load();else{++sequence;rows=[];for(const id of ['expense-summary','expense-days','expense-categories','expense-updated'])$(id).replaceChildren();$('expense-payer').replaceChildren(new Option('Cả nhà',''));}});
})();
