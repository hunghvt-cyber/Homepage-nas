(()=>{
 const panel=document.querySelector('.home-gemini'),frame=panel?.querySelector('iframe[data-src]');
 if(panel&&frame)panel.addEventListener('toggle',()=>{if(panel.open&&!frame.getAttribute('src'))frame.src=frame.dataset.src;});
 if(location.hash==='#portal-account'){const account=document.getElementById('portal-account');if(account)account.open=true;}
 window.addEventListener('hashchange',()=>{if(location.hash==='#portal-account'){const account=document.getElementById('portal-account');if(account)account.open=true;}});
})();
