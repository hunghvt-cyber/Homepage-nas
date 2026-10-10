"""Build independent static portal; QR URLs require a confirmed HTTPS origin."""
import html, json, os, re, shutil
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
esc = lambda value: html.escape(str(value), quote=True)
site = json.loads((ROOT / 'content/site.json').read_text())
guides = json.loads((ROOT / 'content/guides.json').read_text())
base = os.getenv('PORTAL_BASE_URL', site.get('base_url', '')).rstrip('/')
if base:
    parsed = urlparse(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.path not in ('', '/') or parsed.query or parsed.fragment or parsed.username:
        raise ValueError('PORTAL_BASE_URL must be an HTTPS origin')
if OUT.exists():
    shutil.rmtree(OUT)
shutil.copytree(ROOT / 'public', OUT)

def page(title, body):
    return '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><link rel="stylesheet" href="/style.css"><main>'+body+'<footer>'+esc(site['title'])+' · Hướng dẫn ngắn, dễ dùng.</footer></main></html>'

ACCOUNT = '<div class="account noprint"><span id="account-state">Chưa mở khóa</span><div class="account-actions"><button id="account-login" type="button">Nhập mật khẩu</button><button id="account-logout" type="button" hidden>Khóa lại</button></div><form id="password-form" hidden><label for="account-password">Mật khẩu chung</label><input id="account-password" type="password" autocomplete="current-password" maxlength="256" required><button id="password-submit" type="submit">Mở khóa</button></form><p id="account-message" role="status"></p></div>'
EDITOR = '<section id="guide-editor" class="noprint" hidden><h2>Sửa hướng dẫn</h2><form id="guide-form">' + ''.join('<label for="edit-'+key+'">'+label+'</label><'+('textarea rows="4"' if key in ('summary','notes','steps') else 'input')+' id="edit-'+key+'" '+('required' if key in ('title','area','steps') else '')+'>'+('</textarea>' if key in ('summary','notes','steps') else '') for key,label in [('title','Tên đồ vật'),('area','Khu vực'),('summary','Mô tả ngắn'),('steps','Các bước — mỗi dòng một bước'),('notes','Lưu ý'),('last_cleaned','Vệ sinh kỹ gần nhất')]) + '<h3>Mục bổ sung</h3><div id="edit-details"></div><button id="guide-add-detail" type="button">Thêm mục</button><div class="editor-actions"><button id="guide-save" type="submit">Lưu hướng dẫn</button><button id="guide-cancel" type="button">Đóng</button></div></form></section>'

def write(path, content):
    dest = OUT / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content, encoding='utf-8')

status_url = site.get('status_url', '/status.json')
if status_url != '/status.json' and (urlparse(status_url).scheme != 'https' or not urlparse(status_url).hostname):
    raise ValueError('Status source must be HTTPS')
write('config.js', 'window.PORTAL_STATUS_URL = '+json.dumps(status_url)+';\n')

links = []
for link in site['links']:
    url = link['url']
    if url and urlparse(url).scheme not in ('https', 'http'):
        raise ValueError('Invalid shortcut URL')
    content = '<strong>'+esc(link['label'])+'</strong><small>'+esc(link['description'])+'</small>'
    links.append('<a class="shortcut" href="'+esc(url)+'">'+content+'</a>' if url else '<div class="shortcut disabled">'+content+'<br><small>Chưa cấu hình link</small></div>')
rows = ''.join('<div class="row"><span>'+name+'</span><span id="'+key+'">Chưa có dữ liệu</span></div>' for key, name in [('cam1','Camera 1'),('cam2','Camera 2'),('nas','NAS')])
maintenance = ''.join('<div class="row"><span>'+name+'<br><small id="'+key+'-time">Chưa có thời gian ghi nhận</small></span><span id="'+key+'">Chưa có dữ liệu</span></div>' for key,name in [('maintenance','Bảo trì gần nhất'),('retention','Dọn video cũ')])
write('index.html',page(site['title'],'<header><span class="badge">TRANG CHỦ</span><h1>'+esc(site['title'])+'</h1><p>'+esc(site.get('subtitle',''))+'</p></header><nav class="home-shortcuts" aria-label="Lối tắt">'+''.join(links)+'<a class="shortcut" href="/huong-dan/"><strong>Hướng dẫn đồ vật</strong><small>Hướng dẫn và QR</small></a><a class="shortcut" href="/notes/"><strong>Notes</strong><small>Ghi chú và code</small></a><a class="shortcut" href="/chi-tieu/"><strong>Chi tiêu</strong><small>Thống kê gia đình</small></a></nav><section><div class="bar"><h2>Trạng thái camera & NAS - Theo báo cáo gần nhất</h2></div><div class="body">'+rows+'<h3 class="maintenance-heading">Bảo trì hằng ngày</h3>'+maintenance+'<p id="updated" class="muted">Chưa kết nối nguồn trạng thái.</p><noscript>Trạng thái cần JavaScript; link và hướng dẫn vẫn dùng được.</noscript></div></section><script src="/config.js" defer></script><script src="/status.js" defer></script>'))
cards=[]
seen=set()
for guide in guides:
    slug=guide['slug']
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',slug) or slug in seen:
        raise ValueError('Invalid/duplicate guide slug')
    seen.add(slug)
    path='/do-vat/'+slug+'/'
    images=[]
    for image in guide.get('images',[]):
        src=image['src']
        if not src.startswith('/images/') or '..' in src or not (OUT/src.lstrip('/')).is_file():
            raise ValueError('Guide image must exist under public/images')
        images.append('<figure><img loading="lazy" decoding="async" src="'+esc(src)+'" alt="'+esc(image['alt'])+'"><figcaption>'+esc(image.get('caption',''))+'</figcaption></figure>')
    qr='<p class="muted">QR chưa được tạo: cần xác nhận địa chỉ website trước.</p>'
    if base:
        import qrcode, qrcode.image.svg
        output=OUT/'qr'/f'{slug}.svg'
        output.parent.mkdir(exist_ok=True)
        qrcode.make(base+path,image_factory=qrcode.image.svg.SvgPathImage,border=4).save(output)
        qr='<details class="noprint"><summary>QR cho trang này</summary><p><img width="220" height="220" src="/qr/'+slug+'.svg" alt="QR mở hướng dẫn"></p><a download href="/qr/'+slug+'.svg">Tải QR SVG để in</a><p>'+esc(base+path)+'</p></details>'
    extra = ''.join('<details><summary>'+esc(item['title'])+'</summary><div class="body"><p style="white-space:pre-line">'+esc(item['body'])+'</p></div></details>' for item in guide.get('details', []))
    care = '<p><strong>Vệ sinh kỹ gần nhất:</strong> <span id="guide-cleaned">'+esc(guide.get('last_cleaned') or 'Chưa ghi nhận')+'</span></p>' if 'last_cleaned' in guide else ''
    edit = ACCOUNT + '<p class="noprint"><button id="guide-edit" type="button">Sửa hướng dẫn</button></p><p id="guide-message" role="status"></p>' + EDITOR + '<script src="/account.js" defer></script><script src="/guides.js" defer></script>'
    write('do-vat/'+slug+'/index.html',page(guide['title'],'<header data-guide-slug="'+esc(slug)+'"><a href="/huong-dan/">← Hướng dẫn</a><h1 id="guide-title">'+esc(guide['title'])+'</h1><span class="badge" id="guide-area">'+esc(guide['area'])+'</span><p id="guide-summary">'+esc(guide['summary'])+'</p>'+care+'</header><section><div class="bar"><h2>Cách sử dụng</h2></div><div class="body"><ol id="guide-steps">'+''.join('<li>'+esc(step)+'</li>' for step in guide['steps'])+'</ol>'+''.join(images)+'<p><strong>Lưu ý:</strong> <span id="guide-notes">'+esc(guide.get('notes',''))+'</span></p>'+'</div></section><div id="guide-details">'+extra+'</div>'+edit+qr))
    cards.append('<a class="shortcut" href="'+path+'"><strong>'+esc(guide['title'])+'</strong><small>'+esc(guide['area'])+'</small></a>')
write('huong-dan/index.html',page('Hướng dẫn đồ vật','<header><a href="/">← Trang chủ</a><h1>Hướng dẫn đồ vật</h1><p>Chọn đồ vật để xem hướng dẫn ngắn.</p></header>'+''.join(cards)+'<p>Để sửa, mở đồ vật và chọn “Sửa hướng dẫn”.</p>'))
write('404.html',page('Không tìm thấy','<h1>Chưa có hướng dẫn này</h1><p>Kiểm tra lại đường dẫn hoặc mở danh mục.</p><a href="/huong-dan/">Danh mục hướng dẫn</a>'))
print(f'Built {len(guides)} guides; QR '+('enabled' if base else 'pending confirmed origin'))



write('notes/index.html',page('Notes','<header><a href="/">← Trang chủ</a><h1>Notes</h1><p>Ghi chú dài và code. Chỉ chủ tài khoản được đọc và sửa.</p></header>'+ACCOUNT+'<div id="notes-workspace" hidden><div class="editor-actions"><button id="note-new" type="button">Note mới</button></div><div class="notes-layout"><aside><label for="note-search">Tìm theo tiêu đề</label><input id="note-search" type="search"><div id="note-list"></div></aside><section class="body"><label for="note-title">Tiêu đề</label><input id="note-title" maxlength="200"><label><input id="note-pinned" type="checkbox"> Ghim note</label><label for="note-text">Nội dung · Tối đa 1 MB/note</label><textarea id="note-text" spellcheck="false" wrap="off"></textarea><div class="editor-actions"><button id="note-save" type="button">Lưu</button><button id="note-copy" type="button">Copy toàn bộ</button><button id="note-delete" type="button">Xóa</button></div><label for="note-history">Khôi phục bản trước</label><select id="note-history"></select><p id="note-message" role="status"></p><small>Bấm Lưu để lưu thay đổi. Chờ “Đã lưu” trước khi đóng. Giữ tối đa 5 bản trước, trong giới hạn 3 MB mỗi note gồm lịch sử.</small></section></div></div><script src="/account.js" defer></script><script src="/notes.js?v=manual-save-20261010" defer></script>'))


write('chi-tieu/index.html',page('Chi tiêu gia đình','<header><a href="/">← Trang chủ</a><h1>Chi tiêu gia đình</h1></header>'+ACCOUNT+'<div id="expenses-workspace" hidden><section><div class="bar"><h2>Thống kê</h2></div><div class="body"><label for="expense-month">Tháng</label><input id="expense-month" type="month"><label for="expense-payer">Người chi</label><select id="expense-payer"><option value="">Cả nhà</option></select><button id="expense-refresh" type="button">Làm mới</button><p id="expense-message" role="status"></p><div id="expense-summary" class="expense-summary"></div><h3>Chi theo ngày</h3><div id="expense-days"></div><h3>Theo danh mục</h3><div id="expense-categories"></div><p id="expense-updated" class="muted"></p></div></section></div><script src="/account.js" defer></script><script src="/expenses.js" defer></script>'))
