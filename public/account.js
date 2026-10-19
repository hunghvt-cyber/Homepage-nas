(() => {
 let state={authenticated:false}; let busy=false;
 const show = text => {document.getElementById('account-message').textContent=text;};
 const update=()=>{
  document.getElementById('account-state').textContent=state.authenticated?'Đã mở khóa':'Chưa mở khóa';
  document.getElementById('account-login').hidden=state.authenticated;
  document.getElementById('account-logout').hidden=!state.authenticated;
  document.getElementById('password-form').hidden=state.authenticated;
  window.dispatchEvent(new CustomEvent('account-change',{detail:state}));
 };
 async function api(url,value) {
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...(value?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}:{})});
  // WAF may reject with a non-JSON response before the API executes.
  const data=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401){state={authenticated:false,expired:true};update();}const error=new Error(typeof data.error==='string'?data.error:r.status===429?'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ rồi thử lại.':'Không thể thực hiện.');error.status=r.status;error.reference=/^N4-[0-9a-f]{8}$/.test(data.reference||'')?data.reference:null;throw error;}return data;
 }
 function login(){document.getElementById('password-form').hidden=false;document.getElementById('account-password').focus();}
 window.PortalAccount={api,get state(){return state;},login};
 document.getElementById('account-login').addEventListener('click',login);
 document.getElementById('password-form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;document.getElementById('password-submit').disabled=true;
  const input=document.getElementById('account-password');
  try{state=await api('/api/login',{action:'login',password:input.value});input.value='';show('Đã mở khóa.');update();}catch(e){show(e.message);}finally{busy=false;document.getElementById('password-submit').disabled=false;}
 });
 document.getElementById('account-logout').addEventListener('click',async()=>{try{state=await api('/api/auth',{action:'logout'});document.getElementById('account-password').value='';show('Đã khóa lại.');update();}catch(e){show(e.message);}});
 api('/api/auth').then(s=>{state=s;update();}).catch(e=>{show(e.message);update();});
})();


