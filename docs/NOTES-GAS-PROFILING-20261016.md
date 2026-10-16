# Đo điểm nghẽn GAS Notes — 16/10/2026

Mục đích: phân biệt độ trễ endpoint/platform với đọc/ghi Drive, xử lý Core,
khóa và durable journal. Không suy từ 7,5 giây rằng toàn bộ là CPU GAS hoặc
chỉ do ghi snapshot toàn kho. Chưa có baseline Blob đo cùng môi trường.

## Phương pháp

- Cùng endpoint thử nghiệm đã ghim, cùng OAuth/HMAC; không sửa production.
- Chạy trên kho giả có revision 10 và 10 Note đã xác minh; dừng nếu trạng thái
  đầu không đúng. Không reset hoặc sửa 10 Note cũ.
- Signed owner-only `ping` đi qua xác thực, ScriptLock và cùng journal nhưng
  không đọc/ghi Drive. Đây là baseline đầy đủ auth/log, không phải endpoint rỗng.
- 10 ping, 10 list, 6 create + 6 update Note giả mới, 10 get một Note của lượt
  này, một save mới rồi một save revision cũ để xác minh 409. Một health đầu/cuối.
- Mỗi request có profile=true: chỉ owner nhận timings có chữ ký. Shared actor
  không nhận timing. Journal chỉ metadata/timing, không nội dung, ID Note hay key.
- Đo phía client: POST tới response headers, redirect GET tới headers, đọc body,
  kiểm chữ ký/parse, tổng từng attempt và tổng request. Không ghi redirect URL,
  signed envelope, header Authorization hoặc credential.
- Đo server: auth, chờ lock, auditStart/auditEnd; headRead/fileLookup/
  fileValidation/snapshotRead/loadTotal; Core; snapshotSerialize/folderLookup/
  snapshotCreate/snapshotReadback/headPrecondition/headPublish/commitTotal;
  serverTotal. Timings tổng lồng nhau: không cộng loadTotal với các bước con.
- serverTotal tính từ đầu doPost tới sau journal trước ký response/ContentService.
  `clientFinalAttempt - serverTotal` còn startup/queue, response signing/output,
  network và redirect. Không gọi phần này là thời gian mạng thuần.
- Các service proxy có thể thực hiện I/O trì hoãn. Đây là wall time từng vùng
  mã, không phải tracing nội bộ hạ tầng Google hay phép tách từng RPC chính xác.

## Timeout và giới hạn kết luận

Giữ 12 giây/attempt, hai attempt như benchmark trước. Lưu checkpoint request
synthetic trước khi ghi. Nếu lỗi 503, thêm một lượt đối soát 60 giây bằng đúng
requestId/issuedAt/payload; ghi riêng diagnostic=true, không xóa lỗi chính khỏi
bằng chứng hoặc dùng kết quả đó để tuyên bố đạt SLA 12 giây. Timeout client không
hủy commit phía Google. Mọi thay đổi của lượt thử được giữ nguyên để phân tích.

Mẫu tuần tự nhỏ, cùng runner, không phải Vercel/iPad. Không gọi request đầu là
cold start đã kiểm soát; không giả định những lần sau luôn warm. CPU/network
khác môi trường production. Không so sánh raw p95 n=10 với số đo Blob chưa có.
Chưa thay snapshot, cache, revision guard, ACL, readback hoặc cơ chế commit để
đạt số đẹp. Instrumentation/journal thêm timing có overhead riêng.

## Đối chiếu mã và nguồn nghiên cứu

`lib/storage.js` ghi mỗi Note bằng ifMatch ETag của Blob. GAS prototype hiện
đọc và ghi immutable snapshot toàn kho, readback rồi publish HEAD và giữ
ScriptLock cho cả reads. Vì vậy hai đường chưa tương đương về lượng I/O.

JsonDbApp ưu tiên giảm lượt Drive và gom thao tác trong bộ nhớ; tài liệu
PERFORMANCE_FINDINGS của chính repo cũng phát hiện chi phí clone toàn collection,
metadata/coordination và logging, nhưng ghi rõ chưa benchmark runtime. SpeedStore
quảng bá thời gian đọc Properties đầu khoảng 50ms; không phải web roundtrip hoặc
đảm bảo Drive write. GSheetDB dùng cache/range/batch và khuyên cache ngắn hoặc
không cache cho dữ liệu cần cập nhật tức thời. Không dùng những tuyên bố đó
làm bằng chứng GAS đạt tốc độ Blob.

Nguồn chính thức/tác giả đã đọc:
- https://github.com/h-arnold/JsonDbApp
- https://github.com/h-arnold/JsonDbApp/blob/main/PERFORMANCE_FINDINGS.md
- https://github.com/joshsny/SpeedStore
- https://github.com/codewithmark/GSheetDB
- https://developers.google.com/apps-script/guides/support/best-practices
- https://developers.google.com/apps-script/reference/cache/cache
- https://developers.google.com/apps-script/guides/content
- https://developers.google.com/workspace/drive/api/guides/performance

Cache theo revision có thể giảm đọc, nhưng cache không phải durable commit hoặc
nguồn ACL có thẩm quyền sau revoke. Tách file mỗi Note có thể giảm bytes nhưng
làm tăng lượt metadata/index/history; chỉ quyết định sau số đo. Không dùng batching
bất đồng bộ để báo đã lưu trước khi có durable acknowledgment.

Kết quả live được bổ sung sau khi workflow hoàn thành, không coi test mô phỏng
là số đo thực tế.

## Lượt đầu: dừng trước khi ghi

Commit `561ac52e5b2818a569ac3373deb8c3f4fd2b572e`, workflow
https://github.com/hunghvt-cyber/Homepage-nas/actions/runs/38874636334
đã cập nhật source/profile và version 7, signed health pass. Lượt profile đầu
(artifact 12033904857) chạy 1 health và 5 ping thành công, rồi ping thứ 6 trả
OP_FORBIDDEN/403 có chữ ký hợp lệ, không có các timings mới. Journal ghi operation
unsupported ở request đó, trong khi mã mới nhận ping riêng và luôn trả timing
cho signed owner profile. Đây là dấu hiệu phản hồi từ logic phiên bản cũ, chưa
chứng minh được cơ chế nội bộ Google gây ra. Không tự kết luận lỗi ACL.

Không có save/checkpoint nào trong lượt đầu; initial revision vẫn 10. Đã giữ
JSON kết quả, chỉ rerun job đo sau đó mà không cập nhật source/deployment thêm.
5 ping thành công: p50 1.360 ms, p95 1.907 ms; serverTotal p50 442 ms, p95
1.034 ms. Mẫu quá nhỏ để xem là SLA. Health đọc file: lookup 244 ms, validation
198 ms, snapshot read 449 ms; serverTotal 1.238 ms, roundtrip 2.019 ms.
Không dùng các số này thay cho benchmark save.

## Lượt chạy lại: hoàn thành, không deploy chen ngang

Cùng workflow, rerun job stage-profile, artifact 12035126124.
JSON: `experiments/notes-gas/results/google-profile-20261016.json`.
32 kiểm thử mô phỏng pass, static build pass. Lượt live có 46 request: 45 thành
công và một stale save bị chặn đúng 409; không có timeout/retry hoặc lượt đối
soát 60 giây. Kho đi từ revision 10/10 Note tới revision 23/16 Note, đúng 6
create mới + 7 update (gồm save thắng trước phép thử stale). Đây là stale write
tuần tự, không được gọi là kiểm thử hai writer đồng thời. Chưa đủ bộ 100 Note.

| Phép gọi | Số mẫu thành công | p50 ms | p95 ms |
| --- | ---: | ---: | ---: |
| ping | 10 | 1185 | 1417 |
| list | 10 | 1831 | 2539 |
| save | 13 | 4335 | 5911 |
| get | 10 | 1996 | 6323 |

p50/p95 dùng nearest-rank, không gộp diagnostic và không gộp lỗi 409 vào latency
thành công. n=10/13 rất nhỏ; p95 ở đây chính là mẫu chậm nhất, chưa phải SLA.
Không coi việc save p50 từ 7.535 ms lần trước xuống 4.335 ms là hiệu quả tối ưu:
lượt này mới thêm đo, chưa đổi storage; dữ liệu/thời điểm/backend conditions
khác nhau. Sự biến thiên giữa các lượt là vấn đề cần tiếp tục đo.

### Tỷ trọng các vùng mã trong 13 save thành công

Tỷ trọng tính tổng thời gian vùng mã chia tổng 13 roundtrip; các hàng dưới không
lồng nhau. Số ms là trung bình để cùng phép tính tỷ trọng, không phải p50.

| Vùng mã | Trung bình ms/save | Tỷ trọng roundtrip |
| --- | ---: | ---: |
| Tạo snapshot Drive mới | 1601 | 35.9% |
| Đọc snapshot cũ (loadTotal) | 755 | 17.0% |
| Đọc xác minh file mới | 317 | 7.1% |
| Lấy thư mục Drive | 185 | 4.2% |
| Journal đầu | 117 | 2.6% |
| Journal cuối | 115 | 2.6% |
| Publish và readback HEAD | 102 | 2.3% |
| Logic Core | 84 | 1.9% |
| Chờ lấy khóa | 80 | 1.8% |
| Xác thực | 43 | 1.0% |
| Ngoài serverTotal đã đo | 807 | 18.1% |

Không tính các tỷ trọng này thành dự báo mức cải thiện khi bỏ một bước. Ngoài
các vùng trên còn hash/serialize/validation/response preflight và thời gian không
gắn timer. Đặc biệt không bỏ readback, ACL hoặc revision để tiết kiệm thời gian.

### Kết luận điểm nghẽn

1. **Drive write path là nhóm lớn nhất:** create trung bình 1.601 ms (35,9%),
   load cũ 755 ms (17,0%) và readback mới 317 ms (7,1%). Gom ba vùng chiếm gần
   60% tổng roundtrip; còn folder lookup khoảng 4,2%. Core chỉ khoảng 1,9%.
   Tối ưu stringify/checklist/search trước là sai ưu tiên ở workload này.
2. **Endpoint/platform/network còn độ trễ nền:** ping p50 1.185 ms dù không
   chạm Drive; serverTotal ping p50 445 ms. Phần ngoài serverTotal save khoảng
   18,1% tổng thời gian, bao gồm startup/queue/output/network/redirect. Không đủ
   dữ liệu để phân tách chúng hoặc quy hết cho cold start. Redirect GET p50
   khoảng 172 ms ở save; bỏ redirect không giải quyết toàn bộ 4,3 giây.
3. **Một outlier get không nằm trong logic Drive/Core:** roundtrip 6.323 ms,
   serverTotal 1.062 ms, bên ngoài vùng đo 5.261 ms, POST tới headers 6.140 ms,
   redirect 181 ms. Không có retry. Cache Drive sẽ không xóa được loại outlier
   này. Chưa thể gọi đây là bằng chứng chính xác về cold start hay mất mạng.
4. **Journal có overhead đo được nhưng không phải thủ phạm chính:** trung bình
   232 ms cho đầu+cuối, khoảng 5,2% roundtrip save. Không cần bỏ logging; có thể
   giảm số lần get/set Properties và đo lại, giữ thông tin lỗi/commit mơ hồ.
5. **Chưa có tranh chấp khóa trong lượt tuần tự:** lockWait trung bình 80 ms.
   Không được suy ra hiệu năng khi nhiều thiết bị cùng ghi; global lock đang
   giữ cả lúc Drive I/O, nên rủi ro contention vẫn còn.

### Thứ tự thử tối ưu đề xuất

A. Thử cache immutable snapshot/index **gắn với HEAD/hash đã đọc mới**, cache
miss luôn quay về Drive; xác thực ACL/revision theo version hiện hành. Không
cache trần theo Note ID hoặc actor, không dùng cache làm nơi commit. Ước lượng
chỉ vùng có thể ảnh hưởng: load khoảng 0,75 giây trung bình trong save; phải đo
cache API/chunk overhead và eviction trước khi kết luận lợi ích.

B. Thiết kế thử đường ghi giảm createFile: per-note immutable files hoặc journal
bền vững + compact/backup định kỳ, với commit record/index/receipt/ACL nhất quán.
Không được dùng file overwrite đơn thuần rồi coi là tương đương ETag CAS; không
bỏ recovery khi lỗi ghi một phần. Lưu từng Note nhưng vẫn tạo file mới có thể
vẫn trả cùng chi phí create; phải so sánh tối thiểu các primitive riêng.

C. Batch journal property operations nếu đo cho thấy có lợi, vẫn giữ log và
trạng thái lỗi độc lập với HEAD. Không hứa cắt được toàn bộ 232 ms.

D. Đo thêm nhiều thời điểm, dữ liệu 100 Note và Vercel preview cùng vùng, có
request ID/checkpoint. So sánh Blob trên kho giả riêng khi có quyền phù hợp,
không lấy dữ liệu production làm bộ thử. Mục tiêu vẫn save p95 <=3 giây; hiện
p95 5,9 giây và outlier get 6,3 giây chưa đạt.

Không triển khai thay đổi storage trong lượt profiling này. Production, các
báo cáo, chi tiêu, Gemini và NAS không thay đổi. Chưa tuyên bố GAS hoặc D1 tốt
hơn Blob khi chưa có benchmark tương đương.

## Không tạo version khi chỉ cập nhật tài liệu

Updater được sửa để so hash nội dung của immutable deployed version với source
muốn triển khai. Nếu giống nhau, chỉ kiểm tra signed health, không tạo version
và không cập nhật deployment. Điều này tránh tiêu quota version và tránh gây
rollout chen ngang khi lưu báo cáo. Không chỉ dựa vào description chứa commit
SHA. Có test chặn Google source/version/deployment mutation trên đường reuse.
Suite sau sửa: 33 test mô phỏng. Đây là sửa vận hành, không tối ưu latency Note.
