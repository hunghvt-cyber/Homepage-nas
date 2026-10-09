const $=id=>document.getElementById(id);
let guides=[],sha='',current=null,dirty=false;
const tell=text=>{$('message').textContent=text;};
async function api(action,body){
  const r=await fetch('/api/editor?action='+action,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await r.json();
  if(!r.ok){const e=new Error(data.error||'Không tải được dữ liệu.');e.status=r.status;throw e;}return data;
}
function detail(title='',body=''){
  const field=document.createElement('fieldset');
  const heading=document.createElement('input');heading.value=title;heading.maxLength=200;heading.setAttribute('aria-label','Tên mục bổ sung');heading.placeholder='Ví dụ: Vệ sinh và chăm sóc';
  const text=document.createElement('textarea');text.value=body;text.maxLength=8000;text.setAttribute('aria-label','Nội dung mục bổ sung');
  const remove=document.createElement('button');remove.type='button';remove.textContent='Bỏ mục này';remove.onclick=()=>{field.remove();dirty=true;};
  field.append(heading,text,remove);$('details').append(field);
}
function display(slug){
  current=guides.find(g=>g.slug===slug)||guides[0];if(!current)return;
  for(const id of ['title','area','summary','notes','last_cleaned'])$(id).value=current[id]||'';
  $('steps').value=current.steps.join('\n');$('details').replaceChildren();
  for(const item of current.details||[])detail(item.title,item.body);
  $('guide-link').href='/do-vat/'+current.slug+'/';$('guide-link').textContent=$('guide-link').getAttribute('href');$('preview-section').hidden=true;dirty=false;
}
function value(){return {...current,...Object.fromEntries(['title','area','summary','notes','last_cleaned'].map(id=>[id,$(id).value])),steps:$('steps').value.split('\n').map(x=>x.trim()).filter(Boolean),details:[...$('details').children].map(x=>({title:x.querySelector('input').value,body:x.querySelector('textarea').value}))};}
$('form').oninput=()=>{dirty=true;};
$('choose').onchange=()=>{if(dirty&&!confirm('Bỏ thay đổi chưa lưu để chuyển đồ vật?')){$('choose').value=current.slug;return;}display($('choose').value);};
$('add').onclick=()=>{if($('details').children.length>=12)return;tell('Đã thêm mục bổ sung.');detail();dirty=true;};
$('preview-button').onclick=()=>{const g=value();$('preview').textContent=[g.title,g.summary,'Vệ sinh kỹ gần nhất: '+(g.last_cleaned||'Chưa ghi nhận'),...g.steps.map((s,i)=>(i+1)+'. '+s),g.notes,...g.details.map(d=>d.title+'\n'+d.body)].join('\n\n');$('preview-section').hidden=false;};
$('form').onsubmit=async e=>{e.preventDefault();$('save').disabled=true;try{const g=value(),r=await api('save',{sha,guide:g});sha=r.sha;guides[guides.findIndex(x=>x.slug===g.slug)]=g;dirty=false;tell('Đã lưu lên GitHub. Website sẽ tự cập nhật sau khi triển khai hoàn tất.');const a=document.createElement('a');a.href=r.commit;a.textContent=' Xem bản lưu';a.target='_blank';a.rel='noopener';$('message').append(a);}catch(e){tell(e.message+(e.status===409?' Nội dung đang nhập được giữ lại; sao chép trước khi tải lại trang.':''));if(e.status===401)$('login').hidden=false;}finally{$('save').disabled=false;}};
$('logout').onclick=async()=>{if(dirty&&!confirm('Đăng xuất và bỏ thay đổi chưa lưu?'))return;try{await api('logout',{});dirty=false;location.reload();}catch(e){tell(e.message);}};
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
(async()=>{try{const r=await api('load');guides=r.guides;sha=r.sha;$('account').textContent='Đang đăng nhập: '+r.login;for(const g of guides){const o=document.createElement('option');o.value=g.slug;o.textContent=g.title;$('choose').append(o);}const requested=new URLSearchParams(location.search).get('guide');$('choose').value=guides.some(g=>g.slug===requested)?requested:guides[0]?.slug;display($('choose').value);$('editor').hidden=false;tell('Chọn đồ vật, sửa nội dung rồi bấm Lưu lên GitHub.');}catch(e){tell(e.message);$('login').hidden=false;}})();
