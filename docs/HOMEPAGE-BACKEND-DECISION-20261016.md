# Phương án chung Notes + NAS + backup Actions — 16/10/2026

Trạng thái: **đề xuất để thử nghiệm, chưa chọn backend production**. Ưu tiên
Cloudflare Workers + D1; Drive làm bản sao/khôi phục độc lập. Không chuyển
production, migration dữ liệu thật, sửa NAS, workflow backup hoặc Blob trong
lượt nghiên cứu này. Google OAuth hiện có không cấp quyền Cloudflare.

## Bằng chứng và phạm vi đã đọc

Homepage main vẫn `a09b63b2c520312a70c8e13b645537f62fb7711a`.
Đã đọc `content/site.json`, `public/status.js`, `public/backup-status.js`,
`scripts/publish_status.py`, `public/notes.js`, storage/ETag/index Notes;
workflows/publisher trong my-backup-gdrive-koofr và google-photos-koofr;
template publisher service/timer trong 0219nas-aio. Không truy cập NAS runtime
hoặc đọc secrets. Template không chứng minh timer hiện tại trên NAS đang chạy.

GAS benchmark đã chạy: save n13 p50 4.335 ms, p95 5.911 ms, nhóm create/load/
readback Drive gần 60% roundtrip; ping không đọc Drive p50 1.185 ms. Một get
6.323 ms dù serverTotal 1.062 ms. Xem NOTES-GAS-PROFILING-20261016.md và JSON.
Đây không chứng minh D1 nhanh hơn khi chưa đo D1 hoặc Blob cùng điều kiện.

## Inventory và hợp đồng giữ lại

| Nhóm | Nguồn hiện tại đã xác minh bằng code | Đường đích đề xuất |
| --- | --- | --- |
| Notes, checklist, folder/workspace, shares | Vercel API, phiên mật khẩu, Blob private, conditional ETag | Vercel session API -> Notes Worker -> D1 Notes private |
| NAS: camera/dung lượng | cam1/cam2/nas của nas-status.json | Reports Worker, view nas.overview |
| NAS: sức khỏe | health root/vol1/RAM/swap cùng nas-status.json | view nas.health |
| NAS: bảo trì/dọn retention | maintenance/retention, measured_at riêng, cùng nas-status.json | view nas.maintenance |
| Backup Drive <-> Koofr | my-backup-gdrive-koofr/.github/workflows/bisync.yml, gdrive-backup-latest.json | Publisher summary -> Reports Worker |
| Backup Photos -> Koofr | google-photos-koofr/.github/workflows/daily.yml, gphotos-backup-latest.json | Publisher health summary -> Reports Worker |

Ba nhóm NAS hiện **cùng một feed**, không phải ba backend độc lập. Giữ một
POST snapshot NAS để cập nhật ba view cùng generation, tránh nhân ba tải NAS.
Timer template 5 phút; UI refresh 5 phút, stale snapshot sau 15 phút. Kết quả
maintenance/retention có measured_at theo lịch công việc, không giả là đo mới
mỗi 5 phút. Hai backup giữ nguyên xử lý rclone/Koofr. Chỉ báo cáo JSON nhỏ tới
backend mới, không chuyển file backup thực lên Cloudflare.

Bisync cron 19:00 UTC hằng ngày (02:00 VN ngày sau). Photos daily cron 20:17 UTC
(03:17 VN ngày sau). Photos backfill cron 21:45 UTC CN/Thứ 3/5/7, reconcile
19:41 UTC ngày 1 tháng 1/4/7/10; hai workflow này có report riêng nhưng chưa
thấy publisher Blob trong mã đã đọc. Không ghi đè báo cáo daily bằng tiến trình
backfill một cách vô điều kiện. Không coi GitHub schedule là bảo đảm chạy đúng
phút hoặc tình trạng job hiện tại; chưa đọc live run để kết luận backup đạt.

## Kiến trúc đề xuất

- Homepage/static/QR và đăng nhập tiếp tục ở Vercel. Preview API mới tách
  production. Notes Worker nhận signed server request từ Vercel; gọi D1 bằng
  **Worker binding**, không dùng management REST API làm đường query Notes.
- Hai Worker và hai D1 binding riêng: Notes private và Reports. Publisher báo
  cáo không có quyền đọc/sửa Notes; route public chỉ nhận source allowlist,
  không có SQL tùy ý. D1/quota request vẫn dùng chung account, không coi tách DB
  là tách quota. Preview/prod tách resources/credentials và deploy targets.
- Ban đầu Notes đọc primary có thẩm quyền; không bật replica chỉ vì muốn nhanh.
  Nếu dùng replica, phải kiểm chứng bookmark/session cho read-your-writes và
  đọc ACL/revoke tại primary trong giao dịch, không dựa vào bookmark cũ của
  thiết bị khác. Private/share responses không CDN cache.
- Reports latest/history trong D1 Reports; public GET qua edge cache ngắn
  (mục tiêu 30-60s) theo generation, ETag/304. Chấp nhận cửa sổ stale có ghi
  rõ thời gian đo. Cache miss trở về DB; không coi cache là dữ liệu bền vững.
- Không thêm Worker KV ở pha đầu: eventual consistency không phù hợp làm nguồn
  revision/ACL, quota write 1.000/ngày Free cũng kém dư địa hơn nếu nhân báo cáo.
- Đặt location hint APAC cho DB thử, kiểm tra served_by_region thực tế; hint
  không bảo đảm thành phố hay khu vực mong muốn. Đo thêm vị trí Vercel API mới
  trong preview; không thay region production hoặc chuyển toàn bộ hosting vội.
- Google Apps Script/Drive giữ cho backup/export hoặc automation phù hợp. Không
  đưa GAS HTTP + Drive snapshot vào đường lưu tương tác mới. Chi tiêu/Gemini
  nguyên trạng; grant Apps Script đã có không bị xóa.

## Làm Notes mượt mà vẫn giữ an toàn

Giao diện và durable save là hai chỉ tiêu khác nhau. Mục tiêu UX: thao tác
trong bộ nhớ phản hồi dưới 100 ms; API p95 read/save <=1 giây từ iPad/mạng
thực tế là **mục tiêu thử**, không phải số đo đã đạt hay SLA dịch vụ.

Mã hiện tại đã có preview cache, detail memory cache, prefetch giới hạn, delta
và đồng bộ khi focus. Dùng lại nền này: hiển thị thẻ cache ngay, tải summary
nhẹ/pagination/delta; chỉ tải body khi mở; cập nhật thẻ trong bộ nhớ khi bấm
Lưu, vẫn ghi rõ đang lưu. Không tự bật autosave hoặc polling nền trái hành vi
hiện tại. Chỉ báo đã lưu sau durable commit; lỗi giữ bản nhập. Không mở rộng
localStorage từ title/preview sang toàn bộ nội dung. Offline editing bền vững
đầy đủ sẽ cần quyết định riêng về dữ liệu lưu trên thiết bị, không mặc định.

Schema đề xuất: notes (body/checklist JSON, revision/tombstone), summaries,
history (mỗi revision một row), shares/folder scopes, changes/cursor, receipts
và audit metadata. Giữ folder theo hợp đồng hiện có; không đổi nhầm semantics
workspace sang Google Drive sharing. D1 Free row/BLOB tối đa 2MB: không gói
năm history lớn vào một row; kiểm tra limit hiện tại trước khi chốt schema.

Mỗi mutation phải kiểm tra expectedRevision và ACL, cập nhật Note/summary/
history/cursor/receipt trong một giao dịch. `batch()` có rollback khi statement
lỗi nhưng UPDATE không trúng row **không tự là lỗi**: phải chứng minh guard và
các statement phụ thuộc cùng kết quả CAS, không publish receipt/history cho
save thua. Retry dùng cùng requestId/payload fingerprint; không replay receipt
cho share đã bị revoke. Revoke-save và folder-move-save phải có thứ tự giao
 dịch đúng. Không dùng last-write-wins để tạo cảm giác nhanh.

Index query theo scope/folder/cursor, tìm kiếm Unicode có test riêng. Không
quét toàn body/history để render list. Chưa quyết định bật FTS5: phải thử
semantics tiếng Việt/CJK, row-size/CPU/rows scanned và export/restore trước.

## Publisher báo cáo và GitHub quản lý tập trung

Mỗi nguồn có publisher credential riêng, giới hạn đúng source; credential deploy
khác credential ingest. Khóa nằm trong GitHub Secrets/tài khoản publisher hiện
có, không ở trình duyệt hoặc chat. Source+requestId+payload hash chống trùng;
signedAt chống replay, observed_at không bị thay bằng received_at để làm giả
độ mới. Latest nhận generation mới hơn theo hợp đồng mỗi source, lưu lịch sử
nhỏ có retention. Job cũ hoàn tất muộn không được ghi đè snapshot mới.

Giữ last attempt, last success và publish result tách biệt: backup thành công
nhưng publish fail không được đổi thành backup hỏng, cũng không được che lỗi
publish. Artifact summary vẫn được upload khi ingest lỗi; link run có repo
allowlist. Web chỉ nhận số liệu đã lọc, không file path/account/token/raw error.

Các repo backup chỉ thêm/thay bước gửi summary sau khi review; không đổi thuật
toán bisync, filters, lịch hoặc upload thực. NAS chỉ thay đích của publisher
hiện tại sau phê duyệt, không thêm daemon/tunnel/container hoặc collector. Code
Worker/schema/client publisher/runbook và workflow deploy tập trung tại GitHub;
workflow/script dùng chung phải pin version/commit để review được thay đổi.

## Log, backup và rollback

Log structured: reference, operation/source, stage/status, server/DB duration,
rows_read/rows_written, deployment version. Không Note body, share token,
request HMAC, account/email, file paths hoặc log nguyên payload. Workers Logs
Free hiện 3 ngày; durable audit ngắn/retention trong DB và report snapshot
artifact độc lập, không coi console là lưu trữ lâu dài. Có thông báo thay đổi
pricing Workers Logs từ 01/12/2026; kiểm tra lại trước vận hành dài hạn.

D1 Time Travel Free 7 ngày không thay backup độc lập. Chuẩn bị export mã hóa
vào Drive qua workflow/project riêng với quyền đủ; Google token hiện có chỉ
script.projects/deployments, **chưa chứng minh có grant upload Drive cho runner**.
Không hứa tự backup được chỉ vì Apps Script đã kết nối. Full restore vào DB
khác phải kiểm tra note/checklist/folder/history/receipt/ACL; không làm sống lại
share đã revoke khi khôi phục snapshot cũ. Chốt durable revocation recovery
trước cutover. Rollback code không tự rollback data; migration có checkpoint,
kiểm checksum, cửa sổ read-only/final sync và kế hoạch rollback write rõ ràng.
Chưa thực hiện migration nào.

## Free quota và sizing (xác minh 16/10/2026)

| Tài nguyên | Free hiện hành | Ý nghĩa |
| --- | --- | --- |
| Workers | 100.000 request/ngày/account, CPU 10ms/invocation | Không phải 200.000 request; con số 200.000 là quota log events |
| D1 read/write | 5 triệu rows read/ngày, 100.000 rows write/ngày | Scan/index/history/receipt đều phải tính; vượt quota có lỗi |
| D1 storage | 500MB/database, 5GB tổng account, tối đa 10 database | Không được quảng bá 5GB cho từng database Free |
| D1 row/params | 2MB/row/BLOB, 100 bound params/query | History tách row, batch giới hạn |
| D1 recovery | Time Travel 7 ngày Free | Không có nghĩa backup độc lập vĩnh viễn |
| Workers Logs | 200.000 events/ngày, lưu 3 ngày Free | Dự kiến pricing đổi 01/12/2026 theo docs |

Ví dụ sizing, không phải số đo tải thật: NAS 1 snapshot/5 phút =288 POST/ngày,
hai backup daily thêm khoảng 2 POST, chưa tính retry/backfill. Nếu dùng 3 POST
NAS thì 864+2; nên giữ feed gộp. Với giả định 10 row write/ingest, 290 ingest
~2.900 row write/ngày; phải đo meta để tính index/audit/purge thực tế. Nếu một
người mở trang 24h và fetch từng 5 view mỗi 5 phút, ~1.440 public GET/ngày;
một feed gộp ~288. Cache giảm đọc D1 nhưng request đi qua Worker vẫn tính quota.
Public traffic/abuse và Notes phát sinh chưa được inventory nên không cam kết
miễn phí vô hạn; đặt rate limits và theo dõi meta trước production. Workers
CPU 10ms là điểm phải benchmark với Note Unicode/JSON/HMAC gần giới hạn.

D1 serverless không cần VPS hoặc NAS chạy backend. Không thấy yêu cầu dashboard
manual resume do ít dùng trong tài liệu đối chiếu; scale-to-zero không phải
cam kết luôn warm hay không bao giờ bị suspend do quota/policy.

## So sánh quyết định

| Phương án | Mặt mạnh | Vì sao chưa chọn cuối cùng |
| --- | --- | --- |
| GAS + Drive tối ưu | Đã cấp quyền, rẻ, phù hợp export/automation | Đã đo nhiều giây; bớt read chưa xóa create/endpoint tail latency |
| Workers + D1 | CAS/transaction SQL, query index/summary nhỏ, cùng nền tảng cho reports | Chưa có live benchmark, quyền deploy và restore rehearsal |
| Firestore | SDK cache/offline/listeners và transactions | Offline mặc định last-write-wins; transaction fail offline; cần thiết kế lại auth/rules/quota. AGENTS.md không cho thêm Firestore dependency, không triển khai trong nhánh này |
| Chỉ KV/cache | Reports đọc nhanh | Không giữ atomic CAS/revoke, không làm nguồn Notes chính |

Khuyến nghị là suy luận từ bottleneck đã đo và tính năng được tài liệu hóa,
không phải chứng minh D1 mượt bằng Google Keep. Không thể sửa backend đơn thuần
rồi hứa cùng trải nghiệm, hay báo đã lưu trước commit để làm số đẹp.

## Bước thử và điều kiện đi tiếp

1. Tạo prototype Worker/D1 tách biệt, chưa trỏ production, test SQL/ACL/CAS,
   idempotency và publisher schema bằng dữ liệu giả; không thêm phụ thuộc UI.
2. 100 Note thực sự trên môi trường thử + nhiều lần race/revoke/timeout/restore;
   5 report view và hai publisher Actions giả, generation/out-of-order/schema
   invalid/ingest failure, stale cache/freshness. Không stress tài khoản dùng
   chung bừa bãi. Không coi mock SQL là chứng minh D1 remote.
3. Đo trực tiếp Worker, qua Vercel preview, iPad và nhiều thời điểm. Tách
   UI paint/server/SQL/network, cold/warm; meta rows+CPU; so cùng payload với
   GAS và Blob test store riêng khi đủ quyền. Báo cả lỗi và outlier.
4. Rehearsal backup/restore độc lập và quota failure. Review PR với bằng chứng.
   Chỉ chuyển từng nguồn sau chấp thuận production rõ ràng; không merge main
   hay xóa Blob theo tài liệu đề xuất này.

Chưa triển khai D1/Workers hoặc sửa workflow backup. Không yêu cầu người dùng
cấp quyền mới trong bước nghiên cứu. Trước live trial, chuẩn bị đủ code/tests
và cấu hình review được rồi mới hướng dẫn quyền Cloudflare một lần trên iPad.

## Nguồn chính thức đã đối chiếu

- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/d1/worker-api/return-object/
- https://developers.cloudflare.com/d1/configuration/data-location/
- https://developers.cloudflare.com/d1/best-practices/read-replication/
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- https://developers.cloudflare.com/workers/runtime-apis/cache/
- https://developers.cloudflare.com/kv/concepts/how-kv-works/
- https://developers.cloudflare.com/kv/platform/limits/
- https://firebase.google.com/docs/firestore/manage-data/enable-offline
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://developers.cloudflare.com/d1/best-practices/use-indexes/
