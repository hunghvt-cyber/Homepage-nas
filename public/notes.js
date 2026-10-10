(() => {
  const $ = id => document.getElementById(id);
  const api = (...args) => window.PortalAccount.api(...args);
  let list = [], selected = null, dirty = false, busy = false, timer, loadCounter = 0;
  const message = value => {$('note-message').textContent = value;};
  const disable = () => { for (const id of ['note-save','note-delete','note-new','note-title','note-text','note-pinned','note-history']) $(id).disabled = (!['note-title','note-text','note-pinned'].includes(id) && busy) || !window.PortalAccount.state.authenticated; };
  function renderList() {
    const q = $('note-search').value.toLocaleLowerCase(); $('note-list').replaceChildren();
    for (const n of list.filter(n => n.title.toLocaleLowerCase().includes(q))) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'note-card'; button.textContent = (n.pinned ? '📌 ' : '') + n.title; button.addEventListener('click', () => open(n.id)); $('note-list').append(button);
    }
    if (!list.length) $('note-list').textContent = 'Chưa có note. Bấm “Note mới” để bắt đầu.';
  }
  async function refresh() {const r = await api('/api/notes'); list = r.notes; renderList();}
  function fill(n) {
    selected = n; $('note-title').value = n?.title || ''; $('note-text').value = n?.text || ''; $('note-pinned').checked = n?.pinned || false; dirty = false;
    $('note-history').replaceChildren(new Option('Lịch sử sửa', ''));
    for (const [i,h] of (n?.history || []).entries()) $('note-history').add(new Option(new Date(h.updatedAt).toLocaleString('vi-VN'), String(i)));
    message(n ? 'Đã tải bản lưu ' + new Date(n.updatedAt).toLocaleString('vi-VN') : 'Note mới — nhập nội dung rồi lưu.');
  }
  async function open(id) {
    if (busy || dirty && !confirm('Nội dung chưa lưu. Bỏ thay đổi để mở note khác?')) return;
    clearTimeout(timer); const sequence = ++loadCounter; busy = true; disable();
    try {const r = await api('/api/notes?id=' + encodeURIComponent(id)); if(sequence === loadCounter) fill(r);} catch(e) {message(e.message);} finally {busy = false; disable();}
  }
  async function save() {
    clearTimeout(timer); if (busy || !dirty || !window.PortalAccount.state.authenticated) return;
    busy = true; disable(); message('Đang lưu…');
    try {
      const snapshot = {title: $('note-title').value, text: $('note-text').value, pinned: $('note-pinned').checked};
      const r = await api('/api/notes', {action: 'save', id: selected?.id, revision: selected?.revision, ...snapshot});
      if (!window.PortalAccount.state.authenticated) return;
      if (snapshot.title === $('note-title').value && snapshot.text === $('note-text').value && snapshot.pinned === $('note-pinned').checked) fill(r); else {selected = r; dirty = true; clearTimeout(timer); timer = setTimeout(save, 2000);}
      await refresh(); message(dirty ? 'Đã lưu bản trước; đang có thay đổi mới.' : 'Đã lưu.');
    } catch(e) {message(e.message + ' Nội dung đang nhập vẫn được giữ.');} finally {busy = false; disable();}
  }
  function change() {dirty = true; message('Chưa lưu.'); clearTimeout(timer); if ($('note-title').value.trim()) timer = setTimeout(save, 2000);}
  for (const id of ['note-title','note-text','note-pinned']) $(id).addEventListener('input', change);
  $('note-save').addEventListener('click', save);
  $('note-new').addEventListener('click', () => {if (busy || dirty && !confirm('Bỏ nội dung chưa lưu để tạo note mới?')) return; clearTimeout(timer); ++loadCounter; fill(null); $('note-title').focus();});
  $('note-delete').addEventListener('click', async () => {
    if (!selected || busy || !confirm('Xóa note “' + selected.title + '”?')) return; clearTimeout(timer); busy = true; disable();
    try {await api('/api/notes', {action: 'delete', id: selected.id, revision: selected.revision}); fill(null); await refresh(); message('Đã xóa note.');} catch(e) {message(e.message);} finally {busy = false; disable();}
  });
  $('note-copy').addEventListener('click', async () => { try {await navigator.clipboard.writeText($('note-text').value); message('Đã copy toàn bộ nội dung.');} catch { $('note-text').focus(); $('note-text').select(); message('Đã chọn toàn bộ — nhấn Ctrl+C hoặc chọn Sao chép.'); } });
  $('note-search').addEventListener('input', renderList);
  $('note-refresh').addEventListener('click', () => {if(!busy) refresh().catch(e => message(e.message));});
  $('note-history').addEventListener('change', () => {const h = selected?.history?.[Number($('note-history').value)]; if ($('note-history').value === '' || !h) return; if (dirty && !confirm('Thay nội dung đang nhập bằng bản lịch sử?')) return; $('note-title').value = h.title; $('note-text').value = h.text; change();});
  window.addEventListener('beforeunload', e => {if(dirty) {e.preventDefault(); e.returnValue = '';}});
  window.addEventListener('account-change', e => {
    clearTimeout(timer); disable(); $('notes-workspace').hidden = !e.detail.authenticated;
    if (e.detail.authenticated) refresh().catch(e => message(e.message)); else if (!e.detail.expired) {++loadCounter; list = []; selected = null; dirty = false; $('note-list').replaceChildren(); $('note-title').value = ''; $('note-text').value = ''; $('note-history').replaceChildren();}
  });
  disable();
})();
