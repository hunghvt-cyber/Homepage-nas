# Donate MB — source đã hoàn thiện, xác minh production riêng

Chủ hệ thống chọn chỉ MB tài khoản 566766, lời nhắn tự do. Màn hình cạnh mèo dành cho số tiền/lời nhắn/câu cảm ơn; NAS/camera đưa xuống ngoài màn hình. Dùng QR chủ hệ thống đã cung cấp, không yêu cầu nội dung chuyển tiền theo mẫu.

## Luồng

MacroDroid Durable Relay đang dùng → intake BANK-NOTIFY-1 đã xác thực của GAS bot đang hoạt động → bộ nhận MB tiền vào đúng tài khoản → Sheet riêng HomepageDonations → GET công khai đã lọc homepage_donations → /api/backfill-progress?feed=donations của Homepage → màn hình và lịch sử.

Không lấy dữ liệu từ Transactions để công khai. Không tự duyệt/ghi sổ thu chi gia đình; giữ luồng Telegram hiện hành. Không thêm macro song song hoặc thay khóa MD. Nhánh bot phải nằm trên nền experiment/gas-webhook-isolated, thư mục experiments/gas-webhook, không triển khai vào bridge main.

Thông báo công khai: số tiền, lời nhắn tối đa 400 ký tự, thời điểm nhận thông báo và câu cảm ơn. Không có tên người chuyển trích từ ngân hàng, số dư, số tài khoản đối ứng, raw notification hoặc secret. Các ghi chú người chuyển nhập được coi là văn bản; không chèn HTML, không biến thành công thức Sheets. Hộp QR báo trước lời nhắn sẽ hiển thị công khai.

Lịch sử: toàn bộ 24 giờ lăn gần nhất HOẶC ít nhất 10 khoản mới nhất; nếu mới có dưới 10 khoản thì hiển thị đúng số hiện có. Dedupe vẫn lưu riêng lâu dài trong Sheet JSON, không xóa theo cửa sổ hiển thị. Feed quá 5000 khoản báo lỗi rõ, không âm thầm cắt thiếu.

Gemini chỉ được gọi khi ghi mới một khoản đã xác minh, dùng API key/model hiện có của GAS và hạn mức DONATE_THANKS riêng 50/ngày. Chỉ đưa số tiền và seed phong cách vào prompt, không đưa lời nhắn hoặc raw ngân hàng. Lưu tiền và câu dự phòng trước gọi Gemini; Gemini thất bại không làm mất tiền hoặc chặn thông báo. Retry không gọi model lại.

Homepage thăm dò mỗi 10 giây khi tab đang hiện. Khi mở trang, quay lại tab hoặc hồi phục sau mất kết nối, chốt mốc và không phát lại khoản cũ. Chỉ reo khoản mới, không quá hai phút tuổi, xếp hàng 10 giây/khoản. Tiếng cần bấm bật. Hiệu ứng tôn trọng nút dừng và reduced motion. Lịch sử vẫn hiển thị khoản đến chậm.

## Bằng chứng và triển khai

Ảnh thông báo MB/VCB thật đã được chủ hệ thống cung cấp 25/10/2026. Đã thêm parser xác định cho com.mbmobile và com.VCB (đối chiếu package với snapshot MacroDroid); MB chỉ ghi donate tiền vào đúng 566766, dùng mã ngân hàng chống trùng, loại metadata đối ứng khỏi lời nhắn. Telegram vẫn nhận thu và chi. Bộ donate có mốc kích hoạt cố định, không nhập lại thông báo cũ.

Bot PR #17 đã merge vào nhánh active; workflow 40197876852 qua 135 tests và cập nhật GAS deployment revision 41 thành công. Chưa có giao dịch mới sau triển khai để kiểm chứng end-to-end nhận tiền/Gemini/Sheet. Homepage local qua 95 tests; preview deploy đầu có lỗi nên đã gom route donate vào function backfill hiện có qua query feed=donations, giữ tổng 12 function như production. Hai handler độc lập, không đổi nguồn/backfill data. Không khẳng định nguyên nhân lỗi Vercel nếu chưa có log build.


QR đã giải mã từ ảnh gốc: BIN 970422, payload có tài khoản định danh VietQR; SVG được tạo từ đúng payload gốc, không tự thay alias bằng số tài khoản. Trên giao diện giữ số tài khoản 566766 như chủ hệ thống cung cấp. Nội dung mẫu có sẵn trong QR gốc được giữ nguyên; người gửi có thể sửa lời nhắn trong ứng dụng ngân hàng.

Kiểm tra production đầu: route alias rewrite trả 404 trong cấu hình trailingSlash. Client chuyển sang gọi thẳng function hiện có với query feed=donations; bỏ rewrite, giữ nguồn public feed và số function.

QR ngoài trang: mã MB luôn hiện sẵn trong khối cạnh mèo, 220×220 CSS px, vùng trắng giữ nguyên SVG gốc. Bấm mã hoặc nút Phóng to QR mở cùng hộp phóng lớn; Enter/Space dùng được bằng button native. Không đổi payload, tài khoản hoặc backend.
