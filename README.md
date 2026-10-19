# Homepage AIO — quản trị và vận hành

Trang chính: https://homepage-nas.vercel.app/
Cập nhật trạng thái: 19/10/2026, múi giờ Việt Nam.

**AI tiếp quản đọc [Hồ sơ vận hành hiện tại](docs/OPERATIONS.md) trước.**
[Bản đồ nguồn dữ liệu JSON](docs/data-sources.json) dùng để tra cứu có cấu trúc;
[bằng chứng kiểm tra](docs/results/operations-20261019.json) phân biệt cấu hình,
kiểm tra production và những phần chưa xác minh.

## Sáu nhóm phụ thuộc

| Nhóm | Vai trò hiện tại |
| --- | --- |
| NAS | Nguồn đo camera, dung lượng, sức khỏe và kết quả bảo trì/dọn video; không host Homepage |
| GitHub | Mã nguồn/tài liệu; Actions chạy backup Drive/Photos → Koofr |
| Vercel | Website tĩnh và API; Blob là dịch vụ con, vẫn còn dùng cho guide overrides |
| Supabase | Bộ đếm đăng nhập Homepage, tách trong schema riêng của dự án CongchungVND |
| Google: GAS, Drive, Sheets, Photos, Gemini | GAS/Drive phục vụ báo cáo; GAS/Sheets phục vụ chi tiêu; GAS gọi Gemini |
| Koofr | Dữ liệu Notes độc lập, bản sao Drive/Photos và trạng thái của các bộ backup |

Telegram là nguồn ghi chi tiêu; Tailscale phục vụ hai shortcut NAS. Home-AI là
ứng dụng riêng được liên kết, không phải backend của Homepage.

## Trạng thái đang dùng

- Camera/NAS: trình duyệt → `/api/nas-report` → GAS reporting → Drive.
- Hai báo cáo backup: `/api/backup-report?source=gdrive|gphotos` → cùng GAS reporting.
  Kiểm tra 19/10/2026 vẫn trả `503 NO_REPORT`; chưa có báo cáo thật để xác nhận hoàn tất.
- Đăng nhập: mật khẩu chung và cookie mã hóa tại Vercel; bộ đếm Supabase
  từ commit `ccb4fb2`, giới hạn 5 lượt/IP và 30 lượt tổng/15 phút.
- Notes: `/notes/` mở https://hunghvt-notes.vercel.app/; repo
  [Hunghvt-notes, nhánh release/minimal-notes](https://github.com/hunghvt-cyber/Hunghvt-notes/tree/release/minimal-notes).
  Backend Koofr và phiên đăng nhập riêng. API Notes cũ trả `410 NOTES_RETIRED`.
- Hướng dẫn đồ vật: nội dung nền/ảnh ở GitHub; phần sửa trên web vẫn dùng private Blob.
  Chưa hoàn tất mục tiêu dành Blob riêng cho bộ đếm đăng nhập sau này.
- Chi tiêu/Gemini: API Vercel gọi GAS bridge hiện có bằng HMAC; dữ liệu chi tiêu ở Sheets.
  GAS bridge này khác GAS reporting và khác GAS webhook của bot hiện hành.

## Đường dẫn cần đọc

- [Vận hành, nguồn dữ liệu, cấu hình và xử lý lỗi](docs/OPERATIONS.md)
- [Danh mục nguồn dữ liệu có cấu trúc](docs/data-sources.json)
- [Bộ đếm Supabase, quyền và cách chuyển lại Blob](docs/LOGIN-LIMITER-SUPABASE-20261019.md)
- [Trạng thái phụ thuộc Blob](docs/BLOB-DEPENDENCIES-20261018.md)
- [Notes cũ đã nghỉ và bằng chứng dọn dữ liệu](docs/NOTES-RETIREMENT-20261018.md)

Tài liệu có ngày cũ là lịch sử khi mâu thuẫn với hồ sơ hiện tại; không dùng
README/handoff cũ để tự khôi phục Notes Blob hoặc bật lại bot polling.

## Phát triển

Giữ HTML/CSS/JavaScript thuần; Python sinh `dist/`. Build:

```sh
npm ci --ignore-scripts
python3 -m pip install -r requirements.txt
python3 scripts/build.py
npm test
```

`vercel.json` là nguồn cấu hình install/build/output. Vercel project
`homepage-nas`, production branch `main`. Push main tự tạo deployment;
commit tài liệu không đồng nghĩa có thay đổi runtime.

`content/site.json` có URL Blob cũ làm mặc định; production đang chọn GAS bằng
biến môi trường build. Luôn kiểm tra `/config.js` và `/backup-config.js` thực tế
trước khi kết luận nguồn đang dùng. Không đổi slug/domain QR đã in.

