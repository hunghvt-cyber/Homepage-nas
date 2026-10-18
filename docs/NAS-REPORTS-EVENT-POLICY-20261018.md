# Policy camera/NAS: sự kiện và heartbeat

Đã thống nhất với người dùng ngày 18/10/2026. Policy đã có mã trong
`scripts/nas_report_policy.py` và kiểm thử mô phỏng; chưa chạy trên NAS thật.
Scope là báo cáo tổng hợp hiện có.

Kết quả mô phỏng mới: 288 lượt kiểm tra trong 24 giờ ổn định tạo 48 lần gửi,
không cấp sequence ở lượt skip; kiểm thử mất ack/restart giữ đúng UUID,
sequence và payload. Số này là mô phỏng lịch, không phải benchmark Google.
Pending được retry trước; nếu trạng thái mới xuất hiện trong lúc retry, nó được
so với baseline vừa ack ở lượt timer kế tiếp. RAM/swap numeric alert bands và
hysteresis chưa bật: cần xác minh ngưỡng trên NAS trước khi cấu hình; mất/có lại
số đo đã là event. Backoff thực tế 1/2/5/15 phút, lượng tử theo timer 5 phút,
chưa thêm jitter. Không coi phần còn thiếu này là đã hoàn tất qualification.

## Khi nào gửi

Giữ collector và timer publisher 5 phút. Timer chỉ đọc cache/state cục bộ, tạo
snapshot allowlist và quyết định gửi hay bỏ qua. Không có request Google/Blob
khi skip; không thêm Actions hay lần scan NAS. Bỏ timestamp khỏi phép so sánh
thay đổi, nếu không updated_at mới mỗi lần sẽ khiến mọi lần kiểm tra đều gửi.

| Tình huống | Quyết định |
| --- | --- |
| Lần đầu, chưa có lần gửi được xác nhận | Gửi snapshot hiện có, kể cả trạng thái unknown |
| cam1/cam2/nas đổi state, mất dữ liệu hoặc có lại dữ liệu | Gửi tại lượt kiểm tra phát hiện thay đổi |
| Có kết quả bảo trì/retention mới | Gửi khi state hoặc measured_at của kết quả thay đổi |
| Đĩa thay đổi đáng kể so với bản đã gửi thành công | Gửi; mặc định dự kiến chênh ít nhất 1 điểm phần trăm used_percent, cấu hình theo NAS thực |
| RAM/swap chỉ dao động số đo | Không gửi mỗi dao động; gửi heartbeat hoặc khi vượt/về khỏi ngưỡng cảnh báo đã xác minh trên NAS |
| 30 phút kể từ lần gửi được xác nhận gần nhất | Gửi snapshot đầy đủ làm heartbeat |
| Chỉ updated_at thay đổi, nội dung ổn định và chưa tới heartbeat | Skip |
| Gửi lỗi hoặc chưa xác minh ack | Giữ yêu cầu cần gửi và bản so sánh cũ để retry |

Ngưỡng RAM/swap cần Codex trên NAS đối chiếu bộ nhớ thực và ngưỡng cảnh báo đã
dùng; không tự tạo trạng thái khỏe từ một ngưỡng tùy ý. Áp dụng hysteresis khi
cảnh báo để số đo sát ngưỡng không bật/tắt liên tục. Mọi metric vẫn có trong bản
snapshot đầy đủ; heartbeat không chỉ là một gói ping.

So sánh số đo với **bản được máy chủ xác nhận**, không so với lượt kiểm tra local
liền trước. Như vậy nhiều thay đổi nhỏ tích lũy vẫn được phát hiện. Gộp các thay
đổi đang chờ thành một snapshot mới nhất; state lỗi và phục hồi đều là sự kiện.
Nếu nguồn đang flapping có thể gửi thường xuyên hơn 30 phút; 48/ngày là mức nền
định kỳ khi ổn định, không phải giới hạn tuyệt đối hay số đo hiệu năng.

“Gửi khi thay đổi” ở giai đoạn đầu có độ trễ phát hiện khoảng 5 phút theo timer
hiện có, cộng thời gian mạng. Muốn gần thời gian thực cần nối hook thông báo đã
có trên NAS; Codex phải kiểm tra hook đó trước. Không hứa phát hiện tức thời và
không thêm một collector/daemon mới chỉ để đạt mục tiêu này.

## State và retry

Giữ generation + sequence + request UUID và HMAC của PR #21. Lưu thêm state local
0600: snapshot/hash đã ack, thời điểm ack, request đang chờ nếu có và số lỗi liên
tiếp. Cập nhật state qua fsync/rename trong file lock publisher hiện tại.

Chỉ cập nhật last_ack và baseline sau khi HMAC ack, UUID, sequence, hash đều khớp.
Không đổi last_ack khi ghi file local, khi gửi request hoặc khi chỉ nhận HTTP
200. Retry request chưa rõ kết quả dùng cùng UUID/sequence/nội dung; nếu request
hết cửa sổ thời gian, có thể ký lại issuedAt nhưng vẫn giữ danh tính mutation.
Payload mới dùng sequence cao hơn. Không replay snapshot cũ để đẩy lùi bản mới.

Restart đọc lại state bền; state thiếu/hỏng không được đánh dấu đã đồng bộ.
Nếu mất sequence state, giữ cơ chế từ chối sequence/generation của server và
hướng dẫn phục hồi, không tự reset HEAD. Một lần retry hoặc một sự kiện đã ack
cũng là lần liên lạc xác nhận để tính lịch heartbeat kế tiếp.

Đề xuất retry có backoff 1/2/5/15 phút, có jitter, trong khả năng timer/hook hiện
có. Với timer 5 phút chưa thêm hook, chỉ thực hiện ở lượt timer kế tiếp phù hợp;
không sleep trong service để giả đạt lịch retry từng phút và không tạo timer mới.

## Freshness và giao diện

Phân biệt ba mốc, tất cả dùng UTC ISO và hiển thị theo giờ Việt Nam:

- measured_at: updated_at thật của collector, không được sửa thành thời điểm gửi.
- received_at: thời điểm GAS commit thành công, do GAS đặt, không nhận từ publisher.
- thời điểm trình duyệt tải: chỉ phục vụ hiển thị, không chứng minh NAS còn sống.

GAS HEAD/envelope đã bổ sung received_at; API xuất metadata
nhỏ riêng (ví dụ `_report`) bên cạnh schema snapshot đã kiểm hash. Không công
khai file ID, khóa, raw log, generation hay địa chỉ NAS. Các trường public mới
phải được validator và adapter kiểm riêng, không nới lỏng snapshot allowlist.

| Tình trạng | Cách hiển thị |
| --- | --- |
| received_at không quá 45 phút, phép đo phù hợp thời điểm nhận và state có căn cứ | Hiển thị trạng thái theo lần đo, kèm “đo lúc … / nhận lúc …” |
| Publisher còn gửi, nhưng lúc nhận phép đo đã cũ quá 15 phút hoặc thiếu timestamp | “NAS còn gửi báo cáo · dữ liệu thu thập cũ/chưa xác minh”; không gán camera khỏe |
| received_at quá 45 phút, thiếu hoặc ở tương lai bất hợp lệ | “Mất liên lạc/chưa xác minh”; không kết luận camera hay NAS chắc chắn hỏng |
| Trình duyệt/API lỗi | Báo không tải được nguồn; không biến giờ tải thành heartbeat |
| Đọc fallback previous | Hiển thị mốc của previous và dấu hiệu đang dùng bản trước; không làm mới received_at |

45 phút là ngưỡng đề xuất gồm chu kỳ 30 phút và khoảng đệm 15 phút. Đây là đánh
đổi: phát hiện publisher im lặng chậm hơn phương án upload 5 phút. State camera
là kết quả lần đo gần nhất, không phải khẳng định đang hoạt động ở từng thời điểm.
Không giữ rule quá 15 phút của bản UI cũ cho mọi heartbeat 30 phút, và cũng không
chỉ đổi 15 thành 45 mà bỏ kiểm tra chất lượng phép đo lúc nhận.

Bảo trì/retention là kết quả lịch sử, giữ measured_at riêng; không gắn tuổi heartbeat
thành tuổi kết quả bảo trì. Clock skew vẫn phải được xử lý, không dùng giờ trình
duyệt để thay source timestamp.

## Gate trước cutover

1. Cài policy và state bền; skip thực sự không gọi network hay cấp sequence mới.
2. Mô phỏng hệ thống ổn định 24 giờ: heartbeat đúng hạn, khoảng 48 bản nền, không
   gửi vì timestamp thay đổi. Kiểm ngưỡng tích lũy, mất/có lại metric và bảo trì mới.
3. Mất phản hồi sau commit, retry, restart và ghi state lỗi không làm mất pending
   hoặc ghi đè HEAD mới. Lỗi mạng không đẩy last_ack lên.
4. Kiểm UI với publisher sống/collector hỏng, heartbeat im lặng, clock skew và
   fallback previous. Giữ đúng measured_at/received_at của bản đọc được.
5. Trên NAS/Google thật: sự kiện lỗi/phục hồi và ít nhất hai chu kỳ heartbeat
   (tối thiểu khoảng 60 phút quan sát), so hash/time với snapshot local.

Các test 64 Node +17 Python đã có là baseline của PR trước policy này; không
được gán lại thành bằng chứng event/heartbeat đã qua. Chưa đổi runtime production.
