(() => {
  const $ = id => document.getElementById(id);
  const api = (...args) => window.PortalAccount.api(...args);
  let activeFolder = '', list = [], selected = null, dirty = false, busy = false, loadCounter = 0;
  let listLoaded = false, cachedPreview = false, refreshSequence = 0, wasExpired = false;
  const CACHE_KEY='homepage-notes-preview-v1';
  function storePreview(){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),notes:list.map(n=>({id:n.id,title:String(n.title||'').slice(0,200),text:String(n.text||'').slice(0,180),folder:String(n.folder||'').slice(0,80),pinned:!!n.pinned,updatedAt:n.updatedAt}))}));}catch{}
  }
  function restorePreview(){
    try{
      const data=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(!data||!Array.isArray(data.notes)||Date.now()-data.savedAt>7*86400000)return;
      list=data.notes.filter(n=>typeof n.id==='string'&&typeof n.title==='string'&&typeof n.text==='string'&&typeof n.folder==='string'&&typeof n.updatedAt==='string');
      cachedPreview=true;renderFolders();renderList();
    }catch{}
  }
  function erasePreview(){try{localStorage.removeItem(CACHE_KEY);}catch{}}

  const checklist = window.NoteChecklist?.($('note-checklist'), () => change());
  const progress = $('note-progress');
  function loading(on) { if (progress) { progress.hidden = !on; progress.setAttribute('aria-busy', String(on)); } }
  const workspace = $('notes-workspace');
  const folderToggle = $('note-folders-toggle');
  function closeFolders() {
    workspace.classList.remove('notes-folders-open');
    folderToggle.setAttribute('aria-expanded', 'false');
  }
  function showEditor() {
    workspace.classList.add('notes-editing');
    closeFolders();
  }
  folderToggle.addEventListener('click', () => {
    const expanded = workspace.classList.toggle('notes-folders-open');
    folderToggle.setAttribute('aria-expanded', String(expanded));
  });
  $('note-back').addEventListener('click', () => {
    // Returning to the list preserves unsaved content in this editor.
    workspace.classList.remove('notes-editing');
    $('note-new').focus();
  });
  const message = value => {$('note-message').textContent = value; $('notes-status').textContent = value;};
  const disable = () => { checklist?.disabled(!window.PortalAccount.state.authenticated); for (const id of ['note-save','note-delete','note-new','note-title','note-text','note-pinned','note-history']) $(id).disabled = (!['note-title','note-text','note-pinned','note-folder'].includes(id) && busy) || !window.PortalAccount.state.authenticated; };
  const folders=()=>[...new Set(list.map(n=>n.folder||'').filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
  function renderFolders(){
    const el=$('note-folders');el.replaceChildren();
    for(const name of ['',...folders()]){
      const button=document.createElement('button');button.type='button';button.textContent=name||'Tất cả';
      button.className='note-folder-button';button.setAttribute('aria-pressed',String(activeFolder===name));
      button.addEventListener('click',()=>{activeFolder=name;renderFolders();renderList();closeFolders();});el.append(button);
    }
    const manage=$('folder-manage-select'),oldManage=manage.value;
    manage.replaceChildren(new Option('Chọn thư mục…',''),...folders().map(name=>new Option(name,name)));
    if(folders().includes(oldManage))manage.value=oldManage;
    $('folder-remove').disabled=!manage.value||busy;
    const select=$('note-folder-existing'),old=select.value;
    select.replaceChildren(new Option('Chưa phân loại',''),...folders().map(name=>new Option(name,name)),new Option('+ Tạo thư mục mới…','__new__'));
    if(old==='__new__'||folders().includes(old))select.value=old;
  }
  function folderValue(){return $('note-folder-existing').value==='__new__'?$('note-folder').value.trim():$('note-folder-existing').value;}
  function chooseFolder(name){
    if(name&&!folders().includes(name)){$('note-folder-existing').value='__new__';$('note-folder').value=name;$('note-folder').hidden=false;}
    else{$('note-folder-existing').value=name||'';$('note-folder').value='';$('note-folder').hidden=true;}
  }
  function renderList() {
    const q = $('note-search').value.toLocaleLowerCase(); $('note-list').replaceChildren();
    $('notes-list-heading').textContent = activeFolder || 'Tất cả ghi chú';
    for (const n of list.filter(n => (!activeFolder || n.folder === activeFolder) && [n.title,n.text,n.folder].some(value => String(value||'').toLocaleLowerCase().includes(q)))) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'note-card'; button.setAttribute('aria-pressed', String(selected?.id === n.id)); const heading = document.createElement('strong'); heading.className='note-card-title'; heading.textContent=(n.pinned ? '📌 ' : '') + (n.title || 'Không tiêu đề'); const preview=document.createElement('span'); preview.className='note-card-preview'; preview.textContent=n.text || ''; button.append(heading,preview); button.addEventListener('click', () => open(n.id)); $('note-list').append(button);
    }
    if (!list.length) $('note-list').textContent = 'Chưa có note. Bấm “Note mới” để bắt đầu.';
    if(cachedPreview)message('Đang hiển thị bản xem trước trên thiết bị; đang cập nhật từ máy chủ.');
  }
  async function refresh() {
    const seq=++refreshSequence,r=await api('/api/notes');
    if(seq!==refreshSequence)return;
    list=r.notes;listLoaded=true;cachedPreview=false;storePreview();renderFolders();renderList();
  }
  function fill(n) {
    selected = n; checklist?.load(n?.checklist || []); $('note-title').value = n?.title || ''; $('note-text').value = n?.text || ''; $('note-pinned').checked = n?.pinned || false; chooseFolder(n?.folder || ''); dirty = false;
    renderList();
    $('note-history').replaceChildren(new Option('Lịch sử sửa', ''));
    for (const [i,h] of (n?.history || []).entries()) $('note-history').add(new Option(new Date(h.updatedAt).toLocaleString('vi-VN'), String(i)));
    message(n ? 'Đã tải bản lưu ' + new Date(n.updatedAt).toLocaleString('vi-VN') : 'Note mới — nhập nội dung rồi lưu.');
  }
  async function open(id) {
    if (busy || dirty && !confirm('Nội dung chưa lưu. Bỏ thay đổi để mở note khác?')) return;
    const sequence = ++loadCounter; busy = true; loading(true); disable();
    try {const r = await api('/api/notes?id=' + encodeURIComponent(id)); if(sequence === loadCounter && window.PortalAccount.state.authenticated) {fill(r); showEditor();}} catch(e) {message(e.message);} finally {busy = false; loading(false); disable();}
  }
  async function save() {
    if (busy || !dirty || !window.PortalAccount.state.authenticated) return;
    busy = true; loading(true); disable(); message('Đang lưu…');
    try {
      const snapshot = {title: $('note-title').value, text: $('note-text').value, pinned: $('note-pinned').checked, folder: folderValue(), ...(checklist ? {checklist:checklist.value()} : {})};
      const r = await api('/api/notes-save', {action: 'save', id: selected?.id, revision: selected?.revision, takeover: true, ...snapshot});
      if (!window.PortalAccount.state.authenticated) return;
      if (snapshot.title === $('note-title').value && snapshot.text === $('note-text').value && snapshot.pinned === $('note-pinned').checked && snapshot.folder === folderValue() && JSON.stringify(snapshot.checklist || []) === JSON.stringify(checklist?.value() || [])) fill(r); else {selected = r; dirty = true;}
      message(dirty ? 'Đã lưu bản trước; bấm Lưu để lưu thay đổi mới.' : 'Đã lưu.');
      list = [{...r, text:[r.text, ...(r.checklist || []).map(x => (x.checked ? '☑ ' : '☐ ') + x.text)].filter(Boolean).join('\n')}, ...list.filter(n=>n.id!==r.id)]; list.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt.localeCompare(a.updatedAt)); storePreview(); renderFolders(); renderList();
    } catch(e) {message(e.message + ' Nội dung đang nhập vẫn được giữ. Bấm Lưu để thử lại. Mã hỗ trợ: ' + (e.reference || 'N4-khong-co-phan-hoi') + '.');} finally {busy = false; loading(false); disable();}
  }
  function change() {dirty = true; message('Chưa lưu — bấm Lưu để lưu thay đổi.');}
  for (const id of ['note-title','note-text','note-pinned','note-folder']) $(id).addEventListener('input', change);
  $('note-folder-existing').addEventListener('change',()=>{$('note-folder').hidden=$('note-folder-existing').value!=='__new__';if(!$('note-folder').hidden)$('note-folder').focus();change();});
  $('folder-manage-select').addEventListener('change',()=>{$('folder-remove').disabled=!$('folder-manage-select').value||busy;});
  $('folder-remove').addEventListener('click',async()=>{
    const folder=$('folder-manage-select').value,deleteNotes=$('folder-delete-notes').checked;
    if(!folder||busy||!window.PortalAccount.state.authenticated)return;
    if(dirty){message('Lưu hoặc bỏ thay đổi Note trước khi quản lý thư mục.');return;}
    const count=list.filter(n=>n.folder===folder).length;
    const warning=deleteNotes?'XÓA '+count+' NOTE trong thư mục “'+folder+'”. Bạn chắc chắn?':'Xóa thư mục “'+folder+'”, GIỮ '+count+' Note và chuyển về chưa phân loại?';
    if(!confirm(warning))return;
    busy=true;loading(true);disable();$('folder-remove').disabled=true;
    try{
      const r=await api('/api/notes',{action:'folderDelete',folder,deleteNotes});
      if(selected?.folder===folder)fill(null);
      if(activeFolder===folder)activeFolder='';
      await refresh();$('folder-delete-notes').checked=false;
      message(deleteNotes?'Đã xóa thư mục và '+r.changed+' Note.':'Đã xóa thư mục; giữ lại '+r.changed+' Note.');
    }catch(e){message('Thao tác thư mục chưa hoàn tất: '+e.message+'. Có thể đã xử lý một phần; kiểm tra danh sách trước khi thử lại.');try{await refresh();}catch{}}
    finally{busy=false;loading(false);disable();$('folder-remove').disabled=!$('folder-manage-select').value;}
  });
  $('note-save').addEventListener('click', save);
  $('note-new').addEventListener('click', () => {if (busy || dirty && !confirm('Bỏ nội dung chưa lưu để tạo note mới?')) return; ++loadCounter; fill(null); showEditor(); $('note-title').focus();});
  $('note-delete').addEventListener('click', async () => {
    if (!selected || busy || !confirm('Xóa note “' + selected.title + '”?')) return; busy = true; loading(true); disable();
    try {
      const id = selected.id;
      await api('/api/notes', {action: 'delete', id});
      list = list.filter(n => n.id !== id); storePreview(); fill(null); workspace.classList.remove('notes-editing'); renderFolders(); renderList(); message('Đã xóa note.');

    } catch(e) {message(e.message + ' Mã hỗ trợ: ' + (e.reference || 'N4-khong-co-phan-hoi') + '.');} finally {busy = false; disable();}
  });
  $('note-copy').addEventListener('click', async () => { try {await navigator.clipboard.writeText([$('note-text').value, ...(checklist?.value() || []).map(x => (x.checked ? '[x] ' : '[ ] ') + x.text)].filter(Boolean).join('\n')); message('Đã copy toàn bộ nội dung.');} catch { $('note-text').focus(); $('note-text').select(); message('Đã chọn toàn bộ — nhấn Ctrl+C hoặc chọn Sao chép.'); } });
  $('note-search').addEventListener('input', renderList);
  $('note-history').addEventListener('change', () => {const h = selected?.history?.[Number($('note-history').value)]; if ($('note-history').value === '' || !h) return; if (dirty && !confirm('Thay nội dung đang nhập bằng bản lịch sử?')) return; $('note-title').value = h.title; $('note-text').value = h.text; checklist?.load(h.checklist || []); chooseFolder(h.folder || ''); change();});
  window.addEventListener('beforeunload', e => {if(dirty) {e.preventDefault(); e.returnValue = '';}});
  window.addEventListener('account-change', e => {
    disable(); $('notes-workspace').hidden = !e.detail.authenticated;
    if (e.detail.authenticated) {
      if(wasExpired){selected=null;dirty=false;$('note-title').value='';$('note-text').value='';checklist?.load([]);wasExpired=false;}
      if(listLoaded){renderFolders();renderList();}else restorePreview();
      if(!dirty && !selected){$('note-title').value='';$('note-text').value='';}
      loading(true);refresh().catch(e=>message(e.message)).finally(()=>loading(false));
    } else {
      workspace.classList.remove('notes-editing');closeFolders();
      ++refreshSequence;++loadCounter;list=[];listLoaded=false;cachedPreview=false;
      $('note-list').replaceChildren();
      wasExpired=!!e.detail.expired;
      if(!e.detail.expired){selected=null;dirty=false;$('note-title').value='';$('note-text').value='';checklist?.load([]);$('note-history').replaceChildren();erasePreview();}
    }
  });

  const shareMessage=s=>{$('note-share-message').textContent=s;};
  const shareStatus=link=>link.revoked?'Đã ngừng chia sẻ · Link cũ không còn dùng được':'Đang chia sẻ · Không hết hạn';
  function sharingSummary(container,links){
    if(links.some(link=>!link.revoked))return;
    const status=document.createElement('p');status.textContent='Hiện không chia sẻ';container.append(status);
  }
  async function listShares(){
    $('note-share-list').replaceChildren();
    if(!selected?.id)return;
    try{
      const r=await api('/api/note-share?noteId='+encodeURIComponent(selected.id));
      sharingSummary($('note-share-list'),r.links);
      for(const link of r.links){
        const row=document.createElement('div');
        const label=document.createElement('span');
        label.textContent=shareStatus(link)+' ';
        row.append(label);
        if(!link.revoked){
          const revoke=document.createElement('button');revoke.type='button';revoke.textContent='Ngừng chia sẻ';
          revoke.addEventListener('click',async()=>{
            if(!confirm('Ngừng chia sẻ Note này? Link cũ sẽ không còn dùng được.'))return;
            try{await api('/api/note-share',{action:'revoke',noteId:selected.id,id:link.id});shareMessage('Đã ngừng chia sẻ. Link cũ không còn dùng được.');await listShares();}
            catch(e){shareMessage(e.message);}
          });row.append(revoke);
        }
        $('note-share-list').append(row);
      }
    }catch(e){shareMessage(e.message);}
  }
  $('note-share-panel').addEventListener('toggle',()=>{if($('note-share-panel').open)listShares();});
  $('note-share-create').addEventListener('click',async()=>{
    if(!selected?.id){shareMessage('Lưu Note trước khi chia sẻ.');return;}
    if(dirty){shareMessage('Lưu thay đổi trước khi tạo link.');return;}
    if(!confirm('Người có link sẽ xem và SỬA được Note này không giới hạn thời gian. Tiếp tục?'))return;
    try{
      const r=await api('/api/note-share',{action:'create',noteId:selected.id});
      $('note-share-link').value=location.origin+'/share/?token='+r.token;
      shareMessage('Đã tạo link không hết hạn.');
      await listShares();
    }catch(e){shareMessage(e.message);}
  });
  $('note-share-copy').addEventListener('click',async()=>{
    if(!$('note-share-link').value){shareMessage('Hãy tạo link trước.');return;}
    try{await navigator.clipboard.writeText($('note-share-link').value);shareMessage('Đã sao chép link.');}
    catch{ $('note-share-link').select();shareMessage('Đã chọn link để sao chép.');}
  });

  function folderSharePicker(){
    const select=$('folder-share-select'),current=select.value;
    select.replaceChildren(new Option('Chọn thư mục…',''),...folders().map(name=>new Option(name,name)));
    if(folders().includes(current))select.value=current;
  }
  async function folderShares(){
    const folder=$('folder-share-select').value,el=$('folder-share-list');el.replaceChildren();
    if(!folder)return;
    try{
      const r=await api('/api/note-share?folder='+encodeURIComponent(folder));
      sharingSummary(el,r.links);
      for(const link of r.links){
        const line=document.createElement('div'),label=document.createElement('span');
        label.textContent=shareStatus(link)+' ';
        line.append(label);
        if(!link.revoked){
          const button=document.createElement('button');button.type='button';button.textContent='Ngừng chia sẻ';
          button.addEventListener('click',async()=>{
            if(!confirm('Ngừng chia sẻ thư mục? Link cũ sẽ không thể dùng lại.'))return;
            try{await api('/api/note-share',{action:'revoke',folder,id:link.id});$('folder-share-message').textContent='Đã ngừng chia sẻ.';await folderShares();}
            catch(e){$('folder-share-message').textContent=e.message;}
          });line.append(button);
        }
        el.append(line);
      }
    }catch(e){$('folder-share-message').textContent=e.message;}
  }
  $('folder-share-panel').addEventListener('toggle',()=>{if($('folder-share-panel').open){folderSharePicker();folderShares();}});
  $('folder-share-select').addEventListener('change',folderShares);
  $('folder-share-create').addEventListener('click',async()=>{
    const folder=$('folder-share-select').value;
    if(!folder){$('folder-share-message').textContent='Chọn thư mục trước.';return;}
    if(!confirm('Ai có link đều có thể xem, TẠO và SỬA Note trong thư mục này cho đến khi bạn thu hồi. Tiếp tục?'))return;
    try{
      const r=await api('/api/note-share',{action:'create',folder});
      $('folder-share-link').value=location.origin+'/workspace/?token='+r.token;
      $('folder-share-message').textContent='Đã tạo link chia sẻ thư mục không hết hạn.';
      await folderShares();
    }catch(e){$('folder-share-message').textContent=e.message;}
  });
  $('folder-share-copy').addEventListener('click',async()=>{
    const value=$('folder-share-link').value;if(!value)return;
    try{await navigator.clipboard.writeText(value);$('folder-share-message').textContent='Đã sao chép link.';}
    catch{$('folder-share-link').select();$('folder-share-message').textContent='Đã chọn link để sao chép.';}
  });
  disable();
})();



