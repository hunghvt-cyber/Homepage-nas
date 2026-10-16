# Đối chiếu sau benchmark GAS — 16/10/2026

**Kết luận:** chưa chọn backend cuối cùng. Không chuyển Notes production.
Prototype GAS + snapshot Drive có 9 lần save thành công p50 7.535 ms,
p95 8.929 ms; lần thứ 10 timeout, bộ 100 Note chưa hoàn thành. Số đo runner
GitHub không thay thế benchmark Vercel/iPad. Xem JSON và VALIDATION cùng repo.

| Tiêu chí | GAS + Drive hiện tại | Cloudflare D1 + Worker | Firebase Firestore |
| --- | --- | --- | --- |
| Bằng chứng chạy | Endpoint, source sync, signed health/log đã chạy thật; benchmark fail | Chưa dựng/chưa đo | Chưa dựng/chưa đo |
| Mỗi lần sửa | Đọc/ghi snapshot toàn kho, global ScriptLock | Đề xuất cập nhật row có điều kiện theo revision; index tách riêng | Đề xuất transaction từng Note, summary tách nội dung |
| Chống xung đột | Core revision + HEAD commit; chưa đạt live suite | CAS SQL phải kiểm tra số row đổi, receipt/history/ACL trong cùng transaction; `batch()` không tự coi zero-row UPDATE là lỗi | Transaction có đọc revision/ACL, receipt/history và retry có giới hạn; cần thử race revoke-save |
| Free quota hiện hành | Xem audit Google; quota account dùng chung | 5 triệu row read/ngày, 100.000 row write/ngày, tổng 5 GB; còn quota Worker riêng | 1 GiB, 50.000 document read/ngày, 20.000 write/ngày, 20.000 delete/ngày, 10 GiB outbound/tháng; một database free/project |
| Hết quota | Có lỗi, không coi miễn phí là vô hạn | Query Free bị chặn khi vượt quota; cần index tránh quét cả bảng | Quota không bao gồm backup/PITR/restore; tính trước phương án backup |
| Tự quản lý | OAuth refresh + GitHub đã chứng minh | Cần quyền Cloudflare CI riêng, không có sẵn từ Google OAuth | Cần IAM/OAuth CI riêng, không suy ra quyền từ grant Apps Script |
| Báo cáo Homepage | Chưa triển khai; không dùng cùng snapshot/lock Notes | Có thể tách database/namespaces và writer keys | Có thể tách collections/IAM và writer keys |

Ưu tiên **đánh giá D1 tiếp theo** là suy luận kiến trúc: cập nhật có điều kiện
và index theo row phù hợp hơn việc viết lại toàn snapshot; không phải lời hứa
D1 nhanh hơn khi chưa benchmark. Firestore là đối chứng khả thi về transaction,
nhưng AGENTS.md hiện ghi không thêm phụ thuộc Firestore; cần thống nhất thay đổi
ràng buộc đó trước khi triển khai. Không tạo tài khoản/billing hay xin token
trong chat. Không sửa API production để thực hiện so sánh.

Không nguồn nào dưới đây là bảo đảm dịch vụ miễn phí vĩnh viễn hay không có
cold start. Không phát hiện chính sách tự pause do ít dùng trong các trang
quota đã đối chiếu, nhưng chưa đủ cơ sở cam kết không bao giờ bị đình chỉ.
Cần kiểm tra chính sách hiện hành khi tạo môi trường và xác minh bằng workload.

Điều kiện thử tiếp: 100 Note Unicode, cùng checklist/folder/workspace/share/revoke,
CAS đồng thời, retry cùng request ID, log không chứa nội dung/secret, khôi phục
backup độc lập. Đo cùng vị trí runner rồi Vercel preview/iPad; ghi latency/lỗi
và cold/warm riêng. Tách ghi báo cáo định kỳ khỏi Notes; không thay NAS.

Nguồn chính thức kiểm tra ngày 16/10/2026:
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://firebase.google.com/docs/firestore/quotas
- https://firebase.google.com/docs/firestore/pricing

Quota row và document không so sánh trực tiếp: SQL scan/index maintenance,
transaction retry, summaries/receipts/history làm tăng lượt tính phí. Chưa ước
tính chi phí theo tải thật vì chưa có inventory/lưu lượng được xác minh.
