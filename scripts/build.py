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
maintenance = ''.join('<div class="row"><span>'+name+'<br><small id="'+key+'-time">Chưa có thời điểm kết quả</small></span><span id="'+key+'">Chưa có dữ liệu</span></div>' for key,name in [('maintenance','Bảo trì gần nhất'),('retention','Retention đã xác minh')])
write('index.html',page(site['title'],'<header><span class="badge">TRANG CHỦ</span><h1>'+esc(site['title'])+'</h1><p>'+esc(site.get('subtitle',''))+'</p></header><nav>'+''.join(links)+'</nav><section><div class="bar"><h2>Trạng thái camera & NAS</h2></div><div class="body">'+rows+'<p id="updated" class="muted">Chưa kết nối nguồn trạng thái.</p><noscript>Trạng thái cần JavaScript; link và hướng dẫn vẫn dùng được.</noscript></div></section><section><div class="bar"><h2>Bảo trì hằng ngày</h2></div><div class="body">'+maintenance+'<p class="muted">Kết quả tải khi mở hoặc tải lại trang.</p></div></section><section><div class="bar"><h2>Hướng dẫn đồ vật</h2></div><div class="body"><p>Quét QR trên đồ vật để xem các bước sử dụng.</p><a class="button" href="/huong-dan/">Mở danh mục hướng dẫn</a></div></section><script src="/config.js" defer></script><script src="/status.js" defer></script>'))
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
    care = '<p><strong>Vệ sinh kỹ gần nhất:</strong> '+esc(guide.get('last_cleaned') or 'Chưa ghi nhận')+'</p>' if 'last_cleaned' in guide else ''
    edit = '<p class="noprint"><a class="button" href="https://github.com/hunghvt-cyber/Homepage-nas/edit/main/content/guides.json" target="_blank" rel="noopener">Sửa trên GitHub</a></p>'
    write('do-vat/'+slug+'/index.html',page(guide['title'],'<header><a href="/huong-dan/">← Hướng dẫn</a><h1>'+esc(guide['title'])+'</h1><span class="badge">'+esc(guide['area'])+'</span><p>'+esc(guide['summary'])+'</p>'+care+'</header><section><div class="bar"><h2>Cách sử dụng</h2></div><div class="body"><ol>'+''.join('<li>'+esc(step)+'</li>' for step in guide['steps'])+'</ol>'+''.join(images)+(('<p><strong>Lưu ý:</strong> '+esc(guide['notes'])+'</p>') if guide.get('notes') else '')+'</div></section>'+extra+edit+qr))
    cards.append('<a class="shortcut" href="'+path+'"><strong>'+esc(guide['title'])+'</strong><small>'+esc(guide['area'])+'</small></a>')
write('huong-dan/index.html',page('Hướng dẫn đồ vật','<header><a href="/">← Trang chủ</a><h1>Hướng dẫn đồ vật</h1><p>Chọn đồ vật để xem hướng dẫn ngắn.</p></header>'+''.join(cards)+'<p class="noprint"><a class="button" href="https://github.com/hunghvt-cyber/Homepage-nas/edit/main/content/guides.json" target="_blank" rel="noopener">Sửa trên GitHub</a></p>'))
write('404.html',page('Không tìm thấy','<h1>Chưa có hướng dẫn này</h1><p>Kiểm tra lại đường dẫn hoặc mở danh mục.</p><a href="/huong-dan/">Danh mục hướng dẫn</a>'))
print(f'Built {len(guides)} guides; QR '+('enabled' if base else 'pending confirmed origin'))

