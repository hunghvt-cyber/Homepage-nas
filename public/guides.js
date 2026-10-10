(() => {
  const slug = document.body?.dataset.guideSlug || document.querySelector('[data-guide-slug]')?.dataset.guideSlug;
  if (!slug) return;
  const $ = id => document.getElementById(id); const api = (...a) => window.PortalAccount.api(...a);
  let current, revision, busy = false, dirty = false;
  const p = text => {const el = document.createElement('p'); el.textContent = text; el.style.whiteSpace = 'pre-line'; return el;};
  function render(g) {
    $('guide-title').textContent = g.title; document.title = g.title; $('guide-area').textContent = g.area; $('guide-summary').textContent = g.summary;
    if ($('guide-cleaned')) $('guide-cleaned').textContent = g.last_cleaned || 'Chưa ghi nhận';
    $('guide-steps').replaceChildren(...g.steps.map(s => {const li = document.createElement('li'); li.textContent = s; return li;}));
    $('guide-notes').textContent = g.notes || ''; $('guide-details').replaceChildren(...(g.details || []).map(d => {const el = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = d.title; el.append(summary, p(d.body)); return el;}));
  }
  function fill() {
    for (const f of ['title','area','summary','notes','last_cleaned']) $('edit-' + f).value = current[f] || '';
    $('edit-steps').value = current.steps.join('\n'); $('edit-details').replaceChildren();
    for (const d of current.details || []) addDetail(d); dirty = false;
  }
  function addDetail(d = {title: '', body: ''}) {
    const row = document.createElement('fieldset'); const title = document.createElement('input'); title.value = d.title; title.placeholder = 'Tên mục'; title.setAttribute('aria-label', 'Tên mục bổ sung');
    const content = document.createElement('textarea'); content.value = d.body; content.rows = 5; content.setAttribute('aria-label', 'Nội dung mục bổ sung');
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Bỏ mục'; remove.onclick = () => {row.remove(); dirty = true;}; row.append(title,content,remove); $('edit-details').append(row);
  }
  async function load() {const r = await api('/api/guides?slug=' + encodeURIComponent(slug)); current = r.guide; revision = r.revision; render(current);}
  $('guide-edit').addEventListener('click', () => {
    if (!window.PortalAccount.state.authenticated) {window.PortalAccount.login(); return;}
    if (!current) return; if (!$('guide-editor').hidden && dirty) return; fill(); $('guide-editor').hidden = false; $('guide-editor').scrollIntoView({behavior:'smooth'});
  });
  $('guide-cancel').addEventListener('click', () => {if(dirty && !confirm('Bỏ thay đổi chưa lưu?')) return; dirty = false; $('guide-editor').hidden = true;});
  $('guide-add-detail').addEventListener('click', () => {addDetail(); dirty = true;});
  $('guide-editor').addEventListener('input', () => {dirty = true;});
  $('guide-form').addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return; busy = true; $('guide-save').disabled = true; $('guide-message').textContent = 'Đang lưu…';
    try {
      const guide = {...current}; for(const f of ['title','area','summary','notes','last_cleaned']) guide[f] = $('edit-' + f).value;
      guide.steps = $('edit-steps').value.split('\n').filter(s => s.trim()); guide.details = [...$('edit-details').children].map(row => ({title: row.querySelector('input').value, body: row.querySelector('textarea').value}));
      const r = await api('/api/guides?slug=' + encodeURIComponent(slug), {guide, revision}); current = r.guide; revision = r.revision; render(current); dirty = false; $('guide-message').textContent = 'Đã lưu hướng dẫn.';
    } catch(e) {$('guide-message').textContent = e.message;} finally {busy = false; $('guide-save').disabled = false;}
  });
  window.addEventListener('account-change', e => {if(!e.detail.authenticated) $('guide-editor').hidden = true;});
  window.addEventListener('beforeunload', e => {if(dirty) {e.preventDefault(); e.returnValue = '';}});
  load().catch(() => {$('guide-message').textContent = 'Không tải được bản cập nhật. Đang hiển thị bản hướng dẫn gốc.';});
})();
