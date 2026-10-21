# QR → Koofr: kết quả 21/10/2026

**Đã hoàn tất khởi tạo và kích hoạt Koofr cho sáu hướng dẫn.**
Chủ hệ thống đã cấu hình credential riêng và chấp nhận dùng toàn bộ sáu bản nền
Git hiện tại. Không coi việc này là phục hồi overrides/history Blob cũ.

## Bằng chứng

| Kiểm tra | Kết quả |
| --- | --- |
| Nhập dữ liệu | 6/6 guide, không ghi đè file hiện hữu, đọc lại và đối chiếu hash/nội dung |
| Lưu thực tế qua Koofr adapter | Lưu nội dung không đổi của hop-do-mau, mở lại đúng revision mới |
| Retry cùng operation ID | Không ghi lặp, revision giữ nguyên |
| API production công khai | 6/6 source=koofr, editable=true, revision hợp lệ, nội dung khớp bản được chấp nhận; không lộ history/receipt/credential |
| Trang hướng dẫn và SVG QR | 6/6 trang + 6/6 SVG trả 200 không cần đăng nhập; URL giữ nguyên |
| Chặn ghi ẩn danh | POST /api/guides/?slug=hop-do-mau trả 401 |
| Kiểm thử local | 78 JavaScript tests PASS, gồm 9 test guide/migration; build, syntax và liên kết/asset nội bộ PASS |
| GitHub Actions | [39536452557](https://github.com/hunghvt-cyber/Homepage-nas/actions/runs/39536452557) và [39536574426](https://github.com/hunghvt-cyber/Homepage-nas/actions/runs/39536574426) success |

Nhập dữ liệu tại source `f3212b1048214178a032f2d49f2d96873ea275b4`, deployment
`dpl_DrYnvViaiXSjcq84G6famB6eqQBt`. Bật READY và khôi phục build thông thường tại
source `88d688e87e0df0b2ce18bc3873d971259bac7ec9`, deployment
`dpl_ESVfa9UoMPUAHN59i9J4V6vGmkSY`, READY và gắn alias
https://homepage-nas.vercel.app/.

Bằng chứng có thời điểm và hash: [qr-koofr-activation-20261021.json](results/qr-koofr-activation-20261021.json).

## Sau triển khai

- KOOFR_GUIDES_READY=true. Hai credential chỉ nằm trong Vercel Production.
- Cờ nhập dữ liệu đã rỗng; hook khởi tạo đã gỡ khỏi build. Không tự nhập lại ở deploy sau.
- Giữ script vận hành và test trong source để tham khảo/phục hồi sang namespace mới;
  không chạy lại trên kho đang dùng.
- Trang vẫn có bản nền để đọc khi Koofr lỗi, kèm cảnh báo bản này có thể chưa mới nhất.
- Không thay đổi NAS, Notes, backup engines, dữ liệu ôn thi hoặc xóa dữ liệu/key Blob cũ.

Giới hạn: đã kiểm chứng lưu/mở lại thực tế qua adapter Koofr và quyền ghi ẩn danh
qua HTTP; chưa thao tác đăng nhập và bấm Lưu bằng phiên trình duyệt thật của chủ
hệ thống. Các luồng editor/cookie/origin được kiểm thử tự động, không thay thế bằng
chứng trình duyệt thật. Lịch sử cùng kho chưa phải backup độc lập.

Mục 5 không còn bị chặn bởi Actions, credential hoặc nhập dữ liệu. Mục 1–4 đã
được chủ hệ thống xác nhận hoàn thành; xem [backlog đã chốt](QR-RESUME-20261021.md).
