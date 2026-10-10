(() => {
  let state = {authenticated: false};
  let pending;
  async function api(url, value) {
    const r = await fetch(url, {credentials: 'same-origin', cache: 'no-store', ...(value ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)} : {})});
    const data = await r.json(); if (!r.ok) { if (r.status === 401) { state = {authenticated: false, expired: true}; update(); } throw new Error(data.error || 'Không thể thực hiện.'); } return data;
  }
  const show = message => { const el = document.getElementById('account-message'); if (el) el.textContent = message; };
  const update = () => {
    const el = document.getElementById('account-state'); if (el) el.textContent = state.authenticated ? state.email : 'Chưa đăng nhập';
    const logout = document.getElementById('account-logout'); if (logout) logout.hidden = !state.authenticated;
    const login = document.getElementById('account-login'); if (login) login.hidden = state.authenticated;
    window.dispatchEvent(new CustomEvent('account-change', {detail: state}));
  };
  async function login() {
    if (pending) return pending;
    pending = (async () => {
      show('Đang mở đăng nhập Google…');
      const challenge = await api('/api/auth?action=challenge');
      if (!window.google?.accounts?.id) await new Promise((resolve, reject) => {
        const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.onload = resolve; script.onerror = () => reject(new Error('Không tải được trang đăng nhập Google.')); document.head.append(script);
      });
      const mount = document.getElementById('google-signin'); mount.replaceChildren();
      window.google.accounts.id.initialize({client_id: challenge.clientId, nonce: challenge.nonce, callback: async response => {
        try { state = await api('/api/auth', {credential: response.credential}); mount.replaceChildren(); show('Đã đăng nhập.'); update(); } catch(e) { show(e.message); }
      }});
      window.google.accounts.id.renderButton(mount, {theme: 'outline', size: 'large', text: 'signin_with'}); show('Chọn tài khoản Google của đại ca.');
    })().catch(e => show(e.message)).finally(() => {pending = null;}); return pending;
  }
  window.PortalAccount = {api, get state() {return state;}, login};
  document.getElementById('account-login')?.addEventListener('click', login);
  document.getElementById('account-logout')?.addEventListener('click', async () => { try { state = await api('/api/auth', {action: 'logout'}); show('Đã đăng xuất.'); update(); } catch(e) {show(e.message);} });
  api('/api/auth').then(s => {state = s; update();}).catch(e => {show(e.message); update();});
})();
