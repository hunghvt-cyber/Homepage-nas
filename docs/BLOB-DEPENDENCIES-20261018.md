# Trạng thái các phụ thuộc Blob

Cập nhật hiện hành: 19/10/2026. Đọc [OPERATIONS.md](OPERATIONS.md) và
[data-sources.json](data-sources.json) để tra toàn bộ hệ thống. Tên file giữ
ngày cũ để các link sẵn có tiếp tục hoạt động.

| Thành phần | Nguồn hiện tại | Vai trò Blob còn lại |
| --- | --- | --- |
| Camera/NAS, sức khỏe, bảo trì, retention tổng hợp | NAS → GAS reporting/Drive → /api/nas-report | URL Blob còn làm build default cũ; production đã override sang API |
| Báo cáo Drive ↔ Koofr | Homepage chọn /api/backup-report?source=gdrive → GAS/Drive | Publisher vẫn có nhánh Blob dự phòng; adapter hiện NO_REPORT |
| Báo cáo Photos → Koofr | Homepage chọn /api/backup-report?source=gphotos → GAS/Drive | Publisher vẫn có nhánh Blob dự phòng; adapter hiện NO_REPORT |
| Bộ đếm đăng nhập Homepage | Supabase homepage_login.state từ ccb4fb2 | Code limiter Blob giữ để chuyển lại khi hoạt động được; không tự fallback |
| Guide overrides/history | Private Blob guides/<slug>.json | **Vẫn phụ thuộc thực sự**; chưa chuyển backend hoặc xác minh ghi trong đợt này |
| Legacy Notes/share/index | API nghỉ, 410; đã có bằng chứng cleanup trước | Không khôi phục writer hoặc coi dữ liệu đã xóa là backup |
| Notes hiện dùng | Koofr qua hunghvt-notes project riêng | Không ghi Notes mới vào Blob |
| Chi tiêu/Gemini | GAS bridge + Sheets/Gemini | Không dùng Blob cho dữ liệu này |
| Media và state backup | Google Drive/Photos + Koofr + Actions | Report Blob cũ không phải media/state backup |

## Quyết định và giới hạn hiện tại

- Người dùng chọn Supabase cho bộ đếm tạm; sau khi Blob hoạt động lại sẽ đánh giá
  đưa bộ đếm về Blob. Chưa cấu hình tự động chuyển backend.
- Mong muốn dùng Blob riêng cho bộ đếm **chưa hoàn tất**, vì guide overrides vẫn
  đọc/ghi Blob. Không xóa PORTAL_PRIVATE_BLOB_TOKEN hay package @vercel/blob.
- NAS/backup production build đang chọn GAS. Giá trị URL Blob trong site.json
  không phải bằng chứng website đang đọc Blob; kiểm generated config.js.
- Hai feed backup trả NO_REPORT và hai run mới nhất failure tại lần kiểm 19/10.
  Source/cấu hình đã chuyển không chứng minh publisher thực sự chạy thành công.
- Giữ Blob cũ làm dự phòng không đồng nghĩa có rollback khả dụng. Cần kiểm tra
  đọc/ghi thực trước khi chuyển, và không âm thầm dùng JSON cũ như dữ liệu mới.
- Mốc mở lại 14/11/2026 là thông báo quota ghi nhận trước đó, chưa xác minh lại
  dashboard trong đợt tài liệu này. Public/private store phải được kiểm riêng.

## Bằng chứng xóa legacy Notes — lịch sử 18/10/2026

Inventory in the existing Homepage production build environment found 25 Notes,
1 share and 1 Notes index. Cleanup deployment `dpl_Ey844A3Z5XhF2f5DNkT73u7JyyWK`
(source `eb88cfeb8a32462fa0de6cd700fc38c0f1b1c483`) logged
`{"event":"retired-notes-cleanup","deleted":27,"remaining":0}`.
The script's exact allowlist excludes `guides/` and `login-attempts/`.
This is not a deletion of the private store. Its successful inventory proves
private Blob access worked during this run; public report store failures do not
establish that the private store is blocked.

Main retirement commit: `b1f643428e06237b44d9d38544a15d3be55f7992`, PR #22.
Browser readback confirmed the legacy API's NOTES_RETIRED response and `/notes/`
navigation to Koofr. Old editor assets were removed. Historical backend factories
remain in source for regression tests; their deployed defaults terminate at 410.

Những ghi nhận trên chỉ áp dụng vào lần cleanup đó. Chúng không chứng minh
Blob đang đọc/ghi bình thường hôm nay và không chứng minh Notes Koofr đã có
backup tự động. Đợt cập nhật tài liệu này không xóa thêm object nào.
