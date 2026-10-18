# Phụ thuộc Vercel Blob và khả năng chuyển sang GAS/Drive

Audit mã nguồn ngày 18/10/2026, không phải kiểm kê object/byte hay usage của store.
Homepage main `a09b63b2c520312a70c8e13b645537f62fb7711a`;
PR NAS #21 baseline `3de70b6a2f3907d4ed26a2caca7b3c76a21fae23`.
Drive backup main `186f2f4af8445fbb0084b54935015fb7996029c7`;
Photos backup main `e8f0a84116df39c8f348e804ee7d9a3c4057e89c`.

## Đang phụ thuộc trực tiếp

| Nhóm | Dữ liệu/đường dẫn | Mã liên quan | Đánh giá GAS + Drive |
| --- | --- | --- | --- |
| Camera + sức khỏe NAS | public `nas-status.json`, gồm cam1/cam2, dung lượng, RAM/swap, maintenance/retention | content/site.json, public/status.js, scripts/publish_status.py | Ưu tiên 1; JSON nhỏ, nguồn ghi duy nhất. PR #21 đã có transport; điều chỉnh sang event + heartbeat 30 phút trước rollout |
| Drive ↔ Koofr: báo cáo | public `gdrive-backup-latest.json` | repo my-backup-gdrive-koofr: scripts/publish_blob_report.py; Homepage public/backup-status.js | Phù hợp, ưu tiên 2; gửi khi workflow kết thúc/paused/failure, giữ run ID/attempt và thời điểm thật; không tạo workflow chỉ để polling |
| Photos → Koofr: báo cáo | public `gphotos-backup-latest.json` | repo google-photos-koofr: scripts/publish_blob_report.py; Homepage public/backup-status.js | Phù hợp, ưu tiên 2; chỉ aggregate daily; historical backfill/reconcile không tự thay nghĩa báo cáo daily |
| Hướng dẫn QR đã sửa và lịch sử | private `guides/<slug>.json` | api/guides.js → lib/storage.js | Có thể, ưu tiên 3; ghi thưa, cần revision/ScriptLock, xác thực owner và history. Giữ slug/QR và bản hướng dẫn static độc lập |
| Chống dò mật khẩu Homepage | private `login-attempts/global.json` và `login-attempts/<HMAC-IP>.json` | lib/login-limit.js → lib/storage.js; api/auth.js | Có thể về kỹ thuật, nhưng là security state: phải giữ cập nhật atomic, quota global/IP, 15 phút và fail-closed. Không đưa vào feed public hoặc tắt limiter để bỏ Blob |
| Notes cũ, checklist, lịch sử và folder metadata | private `notes/<id>.json`; folder gắn trong Note | api/notes.js, api/notes-save.js, lib/storage.js | Giữ làm rollback/nguồn đối chiếu. Đã có app Koofr riêng; không chuyển Notes sang GAS trong phương án này |
| Quyền chia sẻ Notes/folder/workspace cũ | private `shares/<id>.json` | api/note-share.js, api/shared-note.js, api/shared-folder.js, lib/note-sharing.js | Giữ cùng backend Notes cũ; token/revocation phải kiểm bản sống. Không di chuyển riêng sang GAS vì tạo hai nguồn quyền dễ lệch |
| Index danh sách Notes cũ | private `indexes/notes-list-v2.json` | lib/notes-list.js | Cache dựng lại được, không phải dữ liệu cần migration sang GAS. Giữ khi Notes cũ còn hoạt động; không xóa khi đang cần rollback |

Ba file public đã được kiểm tra trong lượt audit trước và đều trả 403 “Your store
is blocked”. Điều này không chứng minh store private chứa Notes/guides/limiter
cũng bị khóa; chưa xác minh độc lập trạng thái store private trong lượt này.

Hai publisher backup đang dùng secret BLOB_READ_WRITE_TOKEN của repo tương ứng.
Đổi publisher báo cáo không sửa được engine backup bị chặn vì Actions private
hết hạn mức. Dữ liệu ảnh/Drive thật được backup/sync với Koofr, không nằm trong
hai JSON báo cáo Blob. Không chuyển engine truyền media sang GAS chỉ vì đổi feed.

## Phụ thuộc gián tiếp đáng lưu ý

Phiên đăng nhập Homepage là cookie mã hóa bởi iron-session, không lưu session
trong Blob. Tuy nhiên đăng nhập mới phải cập nhật limiter trên Blob, và api/auth.js
hiện yêu cầu cấu hình PORTAL_PRIVATE_BLOB_TOKEN cả khi đọc trạng thái đăng nhập.

Chi tiêu và Gemini gọi GAS hiện có, không dùng Blob để lưu giao dịch/chat qua
hai API hiện tại. Chúng vẫn cần phiên Homepage; lỗi limiter có thể chặn lần mở
khóa mới. Cookie hợp lệ đang có không đồng nghĩa mỗi request chi tiêu phải gọi
Blob. Vì vậy chuyển ba feed báo cáo chưa đủ để bỏ toàn bộ phụ thuộc Blob của
Homepage, cũng chưa được gỡ package/token chung.

Public hướng dẫn QR static nằm trong content/guides.json và output build. API
overrides đọc Blob nếu có token; thiếu token cho đọc bản gốc và không editable.
Khi có token nhưng Blob lỗi, API có thể lỗi; cần kiểm fallback UI trước khi
decommission guides store. Không đổi printed QR URL.

## Không cần chuyển sang GAS/Drive trong phạm vi này

| Thành phần | Nguồn hiện có |
| --- | --- |
| Notes mới tại hunghvt-notes.vercel.app | Koofr WebDAV; package/runtime không dùng @vercel/blob |
| HTML/CSS/JS, ảnh static và QR build | GitHub + hosting Vercel, khác Vercel Blob |
| Nội dung hướng dẫn gốc | Git-tracked content/guides.json |
| Luồng xem camera và trang quản trị NAS | Shortcut trực tiếp đến dịch vụ NAS; báo cáo trạng thái là phần khác |
| Chi tiêu/Gemini | GAS hiện có + auth Homepage như lưu ý ở trên; không sửa project này |
| Dữ liệu backup Photos và Drive | Engine backup/sync với Koofr; cần runner khi Actions private hết hạn mức |

Home-AI là project khác và chỉ có shortcut trong Homepage; audit này không kết
luận backend riêng của Home-AI có hay không có Blob. Các env store/webhook cũ
không tự chứng minh có đường dữ liệu đang hoạt động; không xóa env chỉ dựa tên.

## Thứ tự đề xuất

1. NAS/camera: event + heartbeat, freshness mới, hai chu kỳ Google/NAS thật rồi cutover.
2. Hai feed backup: cùng contract aggregate, nhưng file và khóa writer tách theo
   nguồn; chống report run cũ đến sau run mới, retry/idempotency và log metadata.
   Cần giải quyết runner riêng để có báo cáo mới từ backup thực.
3. Hướng dẫn QR overrides nếu muốn giảm tiếp Blob; xử lý limiter đăng nhập như
   một migration bảo mật riêng, không chung project/feed public. Kiểm quyền,
   concurrency, fail-closed, quota và latency trước thay backend.
4. Notes cũ/shares/index giữ nguyên đến khi chuyển dữ liệu và rollback được
   đối chiếu đầy đủ. Không xóa Blob trong kế hoạch hiện tại.

Chưa đo operation count/byte/quota từng object, chưa migration dữ liệu thật và
chưa thay backend auth/QR trong đợt audit. Chỉ thống kê các đường phụ thuộc có
bằng chứng mã nguồn và mức phù hợp kỹ thuật, không tuyên bố đã triển khai.
