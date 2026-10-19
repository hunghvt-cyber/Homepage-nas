# Camera và sức khỏe NAS qua Apps Script + Drive

## Điều chỉnh đã thống nhất: gửi theo thay đổi + heartbeat 30 phút

Yêu cầu người dùng ngày 18/10/2026 thay nhịp upload cố định 5 phút bằng policy
trong [NAS-REPORTS-EVENT-POLICY-20261018.md](NAS-REPORTS-EVENT-POLICY-20261018.md).
Timer 5 phút hiện có chỉ đọc cache và quyết định có cần gửi. Chỉ upload khi có
sự kiện đáng kể, lúc khởi động/chưa có ack hoặc đã 30 phút từ lần gửi được xác
nhận gần nhất. Một sự kiện được xác nhận cũng thay heartbeat; không gửi thêm
bản định kỳ trùng lúc. Mức nền là khoảng 48 lượt/ngày cộng sự kiện, không phải
trần 48 lượt. Cần sửa freshness cùng policy, không chỉ kéo dài timer.

**Trạng thái hiện tại (cập nhật 19/10/2026):** policy đã chạy trên NAS ở
2be7d18; Google v12 NAS-only đang nhận báo cáo thật, có hai heartbeat và skip.
Fault injection qua endpoint thật đã xác minh pending/retry và phục hồi bằng
tiến trình mới; mất mạng thực tế và state transition tự nhiên chưa xác minh.
Preview Vercel đã kiểm JSON/cache/UI; production vẫn dùng Blob.
Xem [bằng chứng và gate còn lại](results/nas-publisher-recovery-20261019.md).

Kiểm kê phụ thuộc Blob và thứ tự chuyển:
[BLOB-DEPENDENCIES-20261018.md](BLOB-DEPENDENCIES-20261018.md).

Nguồn mới dành cho snapshot camera, dung lượng, RAM/swap và kết quả bảo trì/
retention đã có. Không thêm collector, scan, timer hay GitHub Actions mỗi lần gửi.
Hai workflow backup Drive/Photos là nguồn khác, chưa đổi trong bản này.

## Luồng và trạng thái triển khai

Publisher hiện có → HTTPS POST có HMAC → Apps Script → file JSON bất biến trong
Drive → HEAD nhỏ trong Script Properties. Homepage GET `/api/nas-report` → GAS
read cache → Drive. Vercel cache 60 giây, cho phép stale-while-revalidate 240 giây;
GAS cache tối đa 240 giây (có thể bị evict). UI vẫn xét timestamp nguồn và refresh
5 phút. Metadata received/upload không được thay thế updated_at của collector.

Google v12 NAS-only và NAS publisher đã chạy thật. Chưa chuyển nguồn production
Homepage. Các lần thử không phải benchmark dài hạn.
Mã giữ default backend Blob cho tới khi cấu hình gas-drive. Build đổi nguồn bằng
`NAS_REPORT_STATUS_URL=/api/nas-report`; API lấy endpoint từ `NAS_REPORT_GAS_URL`.
Vercel reader không cần hoặc nhận writer key.

## Chống sai thứ tự và ghi dở

NAS có generation UUID và sequence bền trong `report-sequence.json`, được reserve
bằng fsync + rename trước gửi, trong file lock cũ của publisher. Không xóa/reset
file đó khi đang dùng generation hiện tại. GAS pin generation ở lần ghi đầu;
sequence lùi và generation khác bị từ chối. Reset cần quy trình owner có đối
chiếu HEAD, không tự chấp nhận để vượt 409.

Mỗi request có UUID, thời gian (5 phút), signed JSON và snapshotText ASCII chính
xác; SHA-256 được tính trên chuỗi gốc để Python 80.0 và JS 80 không làm lệch hash.
Replay của request hiện tại chỉ ack khi hash/sequence khớp; replay cũ hơn HEAD
bị từ chối. Transport gửi trong deadline giới hạn; khi mất phản hồi, policy giữ pending và
lần retry dùng cùng mutation UUID, sequence và snapshot. Có thể ký lại issuedAt
khi cần mà không đổi danh tính mutation. Chỉ mutation mới cấp sequence mới.

ScriptLock kiểm sequence và serialize commit. Tạo file mới, đọc lại xác minh hash,
rồi đổi một HEAD property. Đọc lại HEAD khi setProperty mất phản hồi. Giữ current
và previous; chuyển bản cũ hơn vào Drive trash sau commit. Lỗi cleanup không đảo
ngược commit. Ghi dở trước HEAD có thể để file mồ côi; hiện chưa có GC tự động cho
nhóm mồ côi. Không có bảo đảm phục hồi sau hết retention của Drive trash.

GAS read fallback previous khi current hỏng; timestamp vẫn là thời điểm nguồn
của bản trước. API kiểm schema + hash trước xuất. UI xét received_at tối đa 45 phút và tuổi phép đo tại lúc nhận tối đa 15 phút,
cùng kiểm tra clock skew; lỗi mạng xóa nhãn khỏe hiện tại. Không dùng giờ tải
trang để làm mới timestamp nguồn.

## Log và quota

GAS ghi console metadata và vòng 30 event trong NAS_REPORT_LOG: thời gian,
reference, thao tác, mã lỗi và thời lượng. Không ghi key, request body, địa chỉ,
đường dẫn camera, file ID hay log hệ thống thô. Signed op logs đọc vòng này;
không có public log endpoint. Nếu Properties/log quota lỗi, log là best effort.

Nhịp kiểm tra 5 phút tương đương 288 lượt quyết định/ngày. Policy heartbeat
30 phút cho mức nền khoảng 48 lần gửi/ngày cộng sự kiện. Đây là tính toán lịch,
chưa phải số đo quota dài hạn. Properties consumer hiện có quota 50.000 lượt
read/write/ngày; quota dùng chung theo tài khoản, không riêng project. Cần đo
Google thật, kể cả cache miss/eviction, trước khi kết luận đáp ứng dài hạn.

## Thiết lập Google một lần

Phần dưới là hướng dẫn khởi tạo; hệ thống hiện đã dùng lại prototype Notes nghỉ
hoạt động làm project báo cáo riêng. Không khởi tạo lại hoặc đổi project
chi tiêu/Gemini. Google v12 dùng Core.gs từ schema và Server.gs của commit e3f914f;
không nạp Server.gs HEAD nhánh có dispatcher backup mà thiếu bộ file/phân quyền.

Với một cài đặt mới: tạo project riêng tên `Homepage NAS Reports`.
Nạp `reporting/nas-schema.cjs` vào file `Schema.gs`,
`reporting/apps-script/Server.gs` vào `Server.gs`, và manifest appsscript.json
đã cung cấp. Chạy `initializeNasReports` một lần và cấp quyền Drive. Hàm chỉ tạo
folder riêng nếu chưa có, giữ HEAD/key đã tồn tại; không reset dữ liệu.

Deploy Web app: execute as owner, access Anyone. GET chỉ xuất snapshot allowlist
đang vốn là public trên Homepage; POST cần HMAC. Folder Drive vẫn riêng tư.
Key NAS_REPORT_KEY được tạo trong Script Properties, không in vào execution log.
Chuyển key trực tiếp vào prompt trên NAS, không gửi chat/GitHub/Vercel/browser JS.

Nếu tổ chức không cho phép Anyone, dừng bước public deployment và chọn phương án
reader có OAuth; không tự đổi chính sách tài khoản. Việc tự cập nhật source qua
OAuth/GitHub cần pipeline riêng; Actions private hiện hết hạn mức nên chưa thể
cam kết updater Google chạy được. Không xuất secrets OAuth để vượt hạn mức.

## Thiết lập publisher NAS một lần, sau khi source đã được đưa lên NAS

Chạy bằng user đang sở hữu `homepage-status-publish.service`:

```sh
python3 scripts/configure_nas_reports.py
```

Script hỏi URL /exec và key không echo, tạo config 0600 riêng với generation bền.
Giữ config và sequence state khi update source. Chưa đổi timer ở bước này.
Chạy thử publisher với `STATUS_BACKEND=gas-drive`; kiểm ack published true và
GAS GET `?source=nas` khớp snapshot thật. Không nhận response 200 đơn thuần là ack:
publisher kiểm HMAC, request UUID, sequence và SHA của nội dung.

Khi đã kiểm chứng, cài drop-in mẫu
`deploy/systemd/homepage-status-publish.service.d/gas-drive.conf.example`
vào user unit directory dưới tên `gas-drive.conf`, reload user systemd và chạy
service. Giữ timer 5 phút hiện có. Không sửa collector/maintenance/tunnels.
Không cần cài Python Blob SDK cho transport mới; stdlib là đủ.

Chỉ sau khi các gate trong hồ sơ recovery đã đóng/được giải quyết rõ và có
ủy quyền cutover: cấu hình NAS_REPORT_GAS_URL và NAS_REPORT_STATUS_URL cho
Production, build/deploy đúng project Homepage. Kiểm API public, UI và timestamp
nguồn/nhận, rồi kiểm lại sau chu kỳ refresh. Hai lần gửi đơn thuần chưa đủ gate.

## Rollback và tiêu chí hoàn thành

Gỡ drop-in gas-drive, reload user systemd, phục hồi nguồn đọc cũ trên Homepage nếu
cần. Blob đang bị khóa nên rollback về Blob không bảo đảm có báo cáo mới. Không
xóa file token Blob hay file snapshot local trong lần cutover. Khôi phục phiên
bản code tốt hoặc HEAD previous sau đối chiếu hash nếu nguồn Drive lỗi.

Gate live: ghi/đọc Google thật; wrong HMAC, stale sequence và retry không ghi trùng;
2 chu kỳ NAS thật; so hash/timestamp với snapshot local; API và trình duyệt đọc
được; giả lập mạng lỗi không có nhãn khỏe mới; không ảnh hưởng timer collector.
Mô phỏng không thay thế các gate này.

Nguồn chính thức:
- https://developers.google.com/apps-script/guides/content
- https://developers.google.com/apps-script/guides/services/quotas
- https://developers.google.com/apps-script/reference/lock/lock-service
