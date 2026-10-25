# Donate MB — đang chuẩn bị, chưa bật production

Chủ hệ thống chọn chỉ MB tài khoản 566766, lời nhắn tự do. Màn hình cạnh mèo dành cho số tiền/lời nhắn/câu cảm ơn; NAS/camera đưa xuống ngoài màn hình. Dùng QR chủ hệ thống đã cung cấp, không yêu cầu nội dung chuyển tiền theo mẫu.

## Luồng

MacroDroid Durable Relay đang dùng → intake BANK-NOTIFY-1 đã xác thực của GAS bot đang hoạt động → bộ nhận MB tiền vào đúng tài khoản → Sheet riêng HomepageDonations → GET công khai đã lọc homepage_donations → /api/donations của Homepage → màn hình và lịch sử.

Không lấy dữ liệu từ Transactions để công khai. Không tự duyệt/ghi sổ thu chi gia đình; giữ luồng Telegram hiện hành. Không thêm macro song song hoặc thay khóa MD. Nhánh bot phải nằm trên nền experiment/gas-webhook-isolated, thư mục experiments/gas-webhook, không triển khai vào bridge main.

Thông báo công khai: số tiền, lời nhắn tối đa 400 ký tự, thời điểm nhận thông báo và câu cảm ơn. Không có tên người chuyển trích từ ngân hàng, số dư, số tài khoản đối ứng, raw notification hoặc secret. Các ghi chú người chuyển nhập được coi là văn bản; không chèn HTML, không biến thành công thức Sheets. Hộp QR báo trước lời nhắn sẽ hiển thị công khai.

Lịch sử: toàn bộ 24 giờ lăn gần nhất HOẶC ít nhất 10 khoản mới nhất; nếu mới có dưới 10 khoản thì hiển thị đúng số hiện có. Dedupe vẫn lưu riêng lâu dài trong Sheet JSON, không xóa theo cửa sổ hiển thị. Feed quá 5000 khoản báo lỗi rõ, không âm thầm cắt thiếu.

Gemini chỉ được gọi khi ghi mới một khoản đã xác minh, dùng API key/model hiện có của GAS và hạn mức DONATE_THANKS riêng 50/ngày. Chỉ đưa số tiền và seed phong cách vào prompt, không đưa lời nhắn hoặc raw ngân hàng. Lưu tiền và câu dự phòng trước gọi Gemini; Gemini thất bại không làm mất tiền hoặc chặn thông báo. Retry không gọi model lại.

Homepage thăm dò mỗi 10 giây khi tab đang hiện. Khi mở trang, quay lại tab hoặc hồi phục sau mất kết nối, chốt mốc và không phát lại khoản cũ. Chỉ reo khoản mới, không quá hai phút tuổi, xếp hàng 10 giây/khoản. Tiếng cần bấm bật. Hiệu ứng tôn trọng nút dừng và reduced motion. Lịch sử vẫn hiển thị khoản đến chậm.

## Trạng thái và chặn kích hoạt

Chưa có mẫu thông báo MB thực tế. `DONATE_MB_FORMAT_VERIFIED_=false` và `donationFromMB_` luôn trả null; không thể coi mock parser là bằng chứng runtime. Cần đọc ảnh/thông báo chủ hệ thống sắp cung cấp để khớp package, tài khoản, dấu chiều, số tiền, nội dung và ID/thời gian giao dịch. Không tự suy số tiền hoặc chiều từ Gemini để công khai giao dịch.

Chưa xuất bản giao diện này và chưa triển khai nhánh bot. Kiểm thử local: 95 Node tests Homepage đạt; 128 tests GAS gồm lưu/dedupe/retention/fallback đạt trước khi có parser MB thật. Browser QA và quét QR cần ghi bằng chứng riêng.

QR đã giải mã từ ảnh gốc: BIN 970422, payload có tài khoản định danh VietQR; SVG được tạo từ đúng payload gốc, không tự thay alias bằng số tài khoản. Trên giao diện giữ số tài khoản 566766 như chủ hệ thống cung cấp. Nội dung mẫu có sẵn trong QR gốc được giữ nguyên; người gửi có thể sửa lời nhắn trong ứng dụng ngân hàng.
