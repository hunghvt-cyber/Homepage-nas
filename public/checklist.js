(() => {
  window.NoteChecklist = (root, onChange) => {
    let items = [], disabled = false;
    const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Chèn checklist';
    const pending = document.createElement('div'), completed = document.createElement('div'), heading = document.createElement('p');
    pending.className = 'checklist-items'; completed.className = 'checklist-items'; heading.className = 'muted';
    root.append(add, pending, heading, completed);
    const changed = () => onChange();
    const render = () => {
      pending.replaceChildren(); completed.replaceChildren();
      const done = items.filter(item => item.checked).length;
      heading.textContent = 'Đã hoàn thành (' + done + ')'; heading.hidden = !done;
      add.disabled = disabled || items.length >= 200;
      for (const item of items) {
        const row = document.createElement('div'); row.className = 'checklist-row' + (item.checked ? ' completed' : '');
        const tick = document.createElement('input'); tick.type = 'checkbox'; tick.checked = item.checked; tick.disabled = disabled; tick.setAttribute('aria-label', 'Hoàn thành: ' + (item.text || 'Mục mới'));
        const text = document.createElement('textarea'); text.rows = 1; text.maxLength = 2000; text.value = item.text; text.disabled = disabled; text.setAttribute('aria-label', 'Nội dung checklist');
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.disabled = disabled; remove.setAttribute('aria-label', 'Xóa mục checklist');
        tick.addEventListener('change', () => { item.checked = tick.checked; changed(); render(); root.querySelector('[data-item="' + item.id + '"] input')?.focus(); });
        text.addEventListener('input', () => { item.text = text.value; tick.setAttribute('aria-label', 'Hoàn thành: ' + (item.text || 'Mục mới')); text.style.height = 'auto'; text.style.height = text.scrollHeight + 'px'; changed(); });
        text.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); insert(item.id); } });
        remove.addEventListener('click', () => { items = items.filter(x => x.id !== item.id); changed(); render(); });
        row.dataset.item = item.id; row.append(tick, text, remove); (item.checked ? completed : pending).append(row);
      }
      for (const text of root.querySelectorAll('.checklist-row textarea')) { text.style.height = 'auto'; text.style.height = Math.max(40, text.scrollHeight) + 'px'; }
    };
    const insert = after => {
      if (disabled || items.length >= 200) return;
      const item = {id: crypto.randomUUID(), text: '', checked: false};
      const index = items.findIndex(x => x.id === after); items.splice(index < 0 ? items.length : index + 1, 0, item);
      changed(); render(); root.querySelector('[data-item="' + item.id + '"] textarea')?.focus();
    };
    add.addEventListener('click', () => insert());
    render();
    return {load(value = []) { items = value.map(x => ({id:x.id,text:x.text,checked:x.checked === true})); render(); }, value() { return items.map(x => ({...x})); }, disabled(value) {disabled = value; render();}};
  };
})();
