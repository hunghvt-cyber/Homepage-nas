(() => {
  const $ = id => document.getElementById(id);
  const api = (...args) => window.PortalAccount.api(...args);
  let activeFolder = '', list = [], selected = null, dirty = false, busy = false, loadCounter = 0;
  let view = 'auto';
  const progress = $('note-progress');
  function loading(on) { if (progress) { progress.hidden = !on; progress.setAttribute('aria-busy', String(on)); } }
  const viewButton = $('note-view');
  function applyView() {
    $('notes-workspace').classList.toggle('notes-phone-view', view === 'phone');
    viewButton.textContent = view === 'phone' ? 'Giao diện máy tính' : 'Giao diện điện thoại';
    viewButton.setAttribute('aria-pressed', String(view === 'phone'));
  }
  viewButton.addEventListener('click', () => { view = view === 'phone' ? 'desktop' : 'phone'; applyView(); });
  applyView();
  const message = value => {$('note-message').textContent = value;};
  const disable = () => { for (const id of ['note-save','note-delete','note-new','note-title','note-text','note-pinned','note-history']) $(id).disabled = (!['note-title','note-text','note-pinned','note-folder'].includes(id) && busy) || !window.PortalAccount.state.authenticated; };
  function renderFolders() { const el=$('note-folders'); el.replaceChildren(); for(const name of ['',...new Set(list.map(n=>n.folder||'').filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'))) { const button=document.createElement('button');button.type='button';button.textContent=name||'Tất cả';button.className='note-folder-button';button.setAttribute('aria-pressed',String(activeFolder===name));button.addEventListener('click',()=>{activeFolder=name;renderFolders();renderList();});el.append(button); } }
  function renderList() {
    const q = $('note-search').value.toLocaleLowerCase(); $('note-list').replaceChildren();
    for (const n of list.filter(n => (!activeFolder || n.folder === activeFolder) && n.title.toLocaleLowerCase().includes(q))) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'note-card'; button.textContent = (n.pinned ? '📌 ' : '') + n.title; button.addEventListener('click', () => open(n.id)); $('note-list').append(button);
    }
    if (!list.length) $('note-list').textContent = 'Chưa có note. Bấm “Note mới” để bắt đầu.';
  }
  async function refresh() {const r = await api('/api/notes'); list = r.notes; const suggestions=$('note-folder-suggestions'); suggestions.replaceChildren(...[...new Set(list.map(n=>n.folder).filter(Boolean))].map(name=>new Option(name,name))); renderFolders(); renderList();}
  function fill(n) {
    selected = n; $('note-title').value = n?.title || ''; $('note-text').value = n?.text || ''; $('note-pinned').checked = n?.pinned || false; $('note-folder').value = n?.folder || ''; dirty = false;
    $('note-history').replaceChildren(new Option('Lịch sử sửa', ''));
    for (const [i,h] of (n?.history || []).entries()) $('note-history').add(new Option(new Date(h.updatedAt).toLocaleString('vi-VN'), String(i)));
    message(n ? 'Đã tải bản lưu ' + new Date(n.updatedAt).toLocaleString('vi-VN') : 'Note mới — nhập nội dung rồi lưu.');
  }
  async function open(id) {
    if (busy || dirty && !confirm('Nội dung chưa lưu. Bỏ thay đổi để mở note khác?')) return;
    const sequence = ++loadCounter; busy = true; loading(true); disable();
    try {const r = await api('/api/notes?id=' + encodeURIComponent(id)); if(sequence === loadCounter) fill(r);} catch(e) {message(e.message);} finally {busy = false; loading(false); disable();}
  }
  async function save() {
    if (busy || !dirty || !window.PortalAccount.state.authenticated) return;
    busy = true; disable(); message('Đang lưu…');
    try {
      const snapshot = {title: $('note-title').value, text: $('note-text').value, pinned: $('note-pinned').checked, folder: $('note-folder').value.trim()};
      const r = await api('/api/notes-save', {action: 'save', id: selected?.id, revision: selected?.revision, takeover: true, ...snapshot});
      if (!window.PortalAccount.state.authenticated) return;
      if (snapshot.title === $('note-title').value && snapshot.text === $('note-text').value && snapshot.pinned === $('note-pinned').checked && snapshot.folder === $('note-folder').value.trim()) fill(r); else {selected = r; dirty = true;}
      message(dirty ? 'Đã lưu bản trước; bấm Lưu để lưu thay đổi mới.' : 'Đã lưu.');
      try { await refresh(); } catch { message(dirty ? 'Đã lưu bản trước; bấm Lưu để lưu thay đổi mới.' : 'Đã lưu. Danh sách chưa cập nhật; tải lại trang khi cần.'); }
    } catch(e) {message(e.message + ' Nội dung đang nhập vẫn được giữ. Bấm Lưu để thử lại. Mã hỗ trợ: ' + (e.reference || 'N4-khong-co-phan-hoi') + '.');} finally {busy = false; disable();}
  }
  function change() {dirty = true; message('Chưa lưu — bấm Lưu để lưu thay đổi.');}
  for (const id of ['note-title','note-text','note-pinned']) $(id).addEventListener('input', change);
  $('note-save').addEventListener('click', save);
  $('note-new').addEventListener('click', () => {if (busy || dirty && !confirm('Bỏ nội dung chưa lưu để tạo note mới?')) return; ++loadCounter; fill(null); $('note-title').focus();});
  $('note-delete').addEventListener('click', async () => {
    if (!selected || busy || !confirm('Xóa note “' + selected.title + '”?')) return; busy = true; disable();
    try {
      const id = selected.id;
      await api('/api/notes', {action: 'delete', id});
      list = list.filter(n => n.id !== id); fill(null); renderFolders(); renderList(); message('Đã xóa note.');
      try { await refresh(); } catch { message('Đã xóa note. Danh sách chưa cập nhật; tải lại trang khi cần.'); }
    } catch(e) {message(e.message + ' Mã hỗ trợ: ' + (e.reference || 'N4-khong-co-phan-hoi') + '.');} finally {busy = false; disable();}
  });
  $('note-copy').addEventListener('click', async () => { try {await navigator.clipboard.writeText($('note-text').value); message('Đã copy toàn bộ nội dung.');} catch { $('note-text').focus(); $('note-text').select(); message('Đã chọn toàn bộ — nhấn Ctrl+C hoặc chọn Sao chép.'); } });
  $('note-search').addEventListener('input', renderList);
  $('note-history').addEventListener('change', () => {const h = selected?.history?.[Number($('note-history').value)]; if ($('note-history').value === '' || !h) return; if (dirty && !confirm('Thay nội dung đang nhập bằng bản lịch sử?')) return; $('note-title').value = h.title; $('note-text').value = h.text; $('note-folder').value = h.folder || ''; change();});
  window.addEventListener('beforeunload', e => {if(dirty) {e.preventDefault(); e.returnValue = '';}});
  window.addEventListener('account-change', e => {
    disable(); $('notes-workspace').hidden = !e.detail.authenticated;
    if (e.detail.authenticated) { loading(true); refresh().catch(e => message(e.message)).finally(() => loading(false)); } else if (!e.detail.expired) {++loadCounter; list = []; selected = null; dirty = false; $('note-list').replaceChildren(); $('note-title').value = ''; $('note-text').value = ''; $('note-history').replaceChildren();}
  });
  disable();
})();

