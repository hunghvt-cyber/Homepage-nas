# Lượt thử tối ưu GAS cuối — 16/10/2026

Người dùng yêu cầu giữ quanh hệ thống hiện tại, không mở thêm ứng dụng/nền tảng
quản lý. D1/Firestore mới chỉ là đối chiếu, không triển khai. Homepage/GitHub/
GAS/Drive hiện có là phạm vi lượt này; không đụng production, NAS hoặc hai
workflow backup. Chưa tuyên bố đạt trước số đo live.

## Hai thay đổi opt-in trong prototype

1. Cache chỉ **owner list preview**. Đọc HEAD mới dưới ScriptLock, key SHA256
   toàn raw HEAD (ID/hash/revision/previous). Cache chunk có checksum; miss,
   eviction, dữ liệu sai đều trở về Drive. Cache không chứa full Note/history,
   không làm nguồn commit/ACL. Shared list/search/get, owner get và tất cả
   writes/health vẫn đọc Drive, kiểm tra folder/trashed/hash/schema như trước.
   Do đó có thể hiển thị preview đã commit khi file Drive đang hỏng; health/get
   vẫn báo lỗi, không được coi list cache là bằng chứng kho dữ liệu khỏe. Đây
   là cache preview tương tự UX hiện có, không sửa/che lỗi ghi.
2. Pool ba file mới chỉ cho dữ liệu giả, riêng trong folder prototype private.
   Chọn file không phải HEAD hiện hành và không phải previous ID; kiểm tra
   parent/trashed, HEAD chưa đổi, setContent candidate, readback hash rồi mới
   publish HEAD. Không ghi đè snapshot immutable cũ hoặc file current/previous.
   File candidate cũ hơn previous có thể được tái sử dụng; vì vậy pool chỉ giữ
   hai snapshot gần nhất, **không tương đương lịch sử full-store immutable vô
   hạn**. Note history và receipts vẫn nằm trong state đầy đủ. Chưa đủ backup/
   full-store restore để đưa production. >9MB fallback đường create cũ, vì
   DriveApp setContent có giới hạn 10MB; không giảm limit snapshot20MB.

Chỉ active khi payload optimized=true. Không thay default prototype adapter
hoặc API production. Không bỏ readback, ScriptLock, expected revision hoặc
HMAC. Cùng schema Core nên rollback code về đường immutable cũ vẫn đọc HEAD
pool được, nhưng chưa được xóa pool file còn tham chiếu.

## Kiểm thử trước live

37 test mô phỏng pass, build pass. Thêm cache keyed HEAD/eviction/corruption,
share không được dùng owner cache; pool không sửa current/previous/baseline;
fault trước/sau overwrite và trước/sau HEAD; retry idempotent; cache failure
không đổi kết quả save. Cache body/details không được dùng để né kiểm tra
file corruption. Không coi thời gian VM là latency Google.

## Live workload được chuẩn bị

- Chờ sau deploy, kiểm tra build; từ revision23/16 Note giả đã xác minh, dừng
  nếu trạng thái khác. Không reset hoặc sửa 16 Note cũ.
- preparePool tạo ba candidate rỗng, ngoài số đo A/B.
- 12 cặp list baseline/optimized xen kẽ thứ tự.
- 6 cặp create + 6 cặp update: baseline immutable so với optimized pool, cùng
  payload Unicode; get đối chứng. Store tăng dần nên không coi randomized trial.
- Tạo thêm Note giả cùng cỡ tới **100 active Notes**, đo list hai mode ở n100.
- Kiểm tra hai writer cùng revision, checklist/history restore, note/workspace
  share và revoke, Unicode/search, delete, folderDelete, backup export, replay
  cùng request sau khi bỏ response. Full-store restore độc lập chưa có.
- Timeout12s/hai attempts giữ nguyên. Lỗi503 được đối soát60s cùng requestId,
  ghi diagnostic riêng, không xóa failure khỏi số đo. Checkpoints được ghi
  trước mutation; share token không lưu artifact. Không tự rerun workload trên
  store đã thay đổi khi guard revision không còn khớp.
- Artifact giữ timing/metadata; token/key/header/request signatures không log.

Kết quả live sẽ ghi riêng bên dưới. Nếu chậm hơn hoặc lợi ích không đủ, giữ
bằng chứng và dừng rollout, không nâng timeout để tuyên bố đạt.

Nguồn API đối chiếu:
- https://developers.google.com/apps-script/reference/drive/file#setContent(String)
- https://developers.google.com/apps-script/reference/cache/cache
