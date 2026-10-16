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

## Kết quả thật — rollout Notes vẫn NO-GO

Commit thí nghiệm `10ee27f805da3ba0b576f814ff877c720be4abf5`, Google version8,
workflow https://github.com/hunghvt-cyber/Homepage-nas/actions/runs/38881262408,
job final-gas-trial 116908474149, artifact12038168357. Bản ghi timing đầy đủ
(không checkpoint payload) ở `experiments/notes-gas/results/google-final-trial-20261016.json`.

| Nhóm A/B | Primary thành công/đã gọi | p50 ms | p95 ms |
| --- | ---: | ---: | ---: |
| List không cache | 12/12 | 1.694 | 2.803 |
| List cache | 12/12 | 1.127 | 1.964 |
| Save immutable cũ | 11/12 | 4.128 | 5.893 |
| Save pool + seed cache | 11/12 | 6.297 | 18.251 |
| 72 create bổ sung bằng pool | 72/72 | 5.954 | 8.110 |

p50/p95 nearest-rank trên primary calls thành công, gồm retry bên trong call;
primary timeout không được biến thành success nhờ diagnostic. Mỗi nhánh save
A/B có một primary NETWORK_OR_TIMEOUT sau khoảng24,3s; cả hai được đối soát
bằng cùng request, receipt trả lại và **không commit lại** (timing không có
commitTotal). Cache list p50 giảm khoảng33,5%, pool save p50 tăng52,6%; không có
cơ sở giữ pool như tối ưu tốc độ. Save pool gồm thêm candidate lookup/validation
và seed index, chưa chứng minh riêng primitive setContent tệ ở mọi workload;
ở đây setContent p50 1.842ms so với create p50 1.334ms, commitTotal pool p50
2.919ms so với immutable2.024ms. Core p50 quanh91-101ms không là thủ phạm chính.

**Đã đạt 100 active Notes giả, revision119**, đúng từ revision23 cộng24 A/B
save và72 fill, không tăng revision do replay. Nhưng job **completed=false**:
đo list ở100 Note mới chạy3 baseline thành công và3 optimized thành công, rồi
optimized primary timeout và diagnostic cũng NETWORK_OR_TIMEOUT. Diagnostic
được cấu hình60s nhưng lỗi kết nối trả về sau12,1s; tăng budget không bảo đảm
transport sẽ chờ đủ60s. Không gọi lỗi này là cold start đã xác minh.

Toàn lượt có148 call records (144 primary,4 diagnostic),14 failed transport
attempts. Có4 primary failures (warmup health, hai save, at100 list),3 đối soát
thành công và1 thất bại. Operational-probe độc lập đầu workflow cũng có health
NETWORK_OR_TIMEOUT; không được báo toàn workflow pass. Chưa tới phase functional:
concurrency/share/revoke/workspace/history/delete/folder/backup suite dự kiến
chưa chạy trong lượt này; chúng chỉ có mô phỏng hiện tại. At100 list mẫu nhỏ và
độ trễ ngoài server lớn, không dùng3 mẫu để quảng cáo p95 hay quy hết lỗi cho
Drive. Không có benchmark Vercel/iPad.

## Quyết định sau số đo

- Giữ owner-preview cache làm ứng viên review; không đổi production. Cache
  không chữa được đuôi độ trễ endpoint/mạng. Không cache body, share ACL hoặc
  dùng preview để quyết định revision ghi.
- **Loại pool khỏi cờ optimized mặc định**: v4 chỉ cho pool khi có thêm
  poolTrial=true tường minh. Cờ optimized=true đơn thuần dùng writer immutable
  cũ, kể cả đã có NOTES_POOL. Code thử giữ lại để tái hiện, không xóa/thu hồi
  file pool vì HEAD119 còn tham chiếu chúng. Không rerun workload v3 trên store
  đã thay đổi; guard build/revision chủ động từ chối.
- Thêm kiểm thử đảm bảo optimized không tự bật pool và file candidate bị chuyển
  folder/trash thì chặn trước overwrite. Tổng40 test mô phỏng pass.
- Kiểm tra integrity100 Notes bằng health + backup read-only (30s budget, ba
  attempts), báo riêng là diagnostic chứ không benchmark. Chỉ ghi counts/hash,
  không xuất nội dung/secret ra báo cáo. Không reset, không sửa100 Notes để đạt
  kiểm thử. Kết quả read-only được ghi riêng khi workflow hoàn thành.

Với đường snapshot GAS/Drive đã thử, chưa đạt mục tiêu Notes tương tác như Keep.
Không tiếp tục ghi pool chỉ để có đủ functional test khi hiệu năng đã fail.
Báo cáo NAS/backup là workload nhỏ khác, chưa có bản triển khai/test intake trong
lượt này và chưa được phép chuyển production. Không mở Cloudflare/Firebase;
phạm vi hệ thống hiện có được giữ nguyên.
