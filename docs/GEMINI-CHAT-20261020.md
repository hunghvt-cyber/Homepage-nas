# Gemini: chọn model và nhập nội dung dài

## Hành vi

- Mỗi tin người dùng: tối đa 50.000 đơn vị ký tự JavaScript (UTF-16), thay 4.000.
- Tổng lịch sử gửi: 200.000 ký tự, thay 24.000; tối đa 20 lượt, thay 10.
  Không tự cắt lịch sử hoặc chia request; vượt giới hạn thì giữ nháp và báo rõ.
- Ô nhập cao 10 dòng và bộ đếm độ dài/ngữ cảnh; hội thoại chỉ giữ trong tab.
- Bộ chọn model giữ Mặc định từ GAS. Danh sách là giao của allowlist đã review
  với Google models.list có generateContent bằng khóa hiện có. Danh sách này
  không cam kết còn quota. Không tự fallback/retry hoặc đổi model quét bill.
- Hiện requestedModel và Google modelVersion theo từng câu trả lời; không dùng
  nội dung AI tự giới thiệu để xác định model. Thiếu metadata thì báo chưa xác minh.
- Lựa chọn không ghi Script Properties. Lỗi Google giữ nháp; model bị gỡ cần
  người dùng chọn lại. Xác thực và hạn mức số request/ngày giữ nguyên.

## Triển khai

GAS bridge poorman-telebot/main triển khai trước qua deploy-apps-script.yml;
Homepage main/Vercel triển khai sau. Đây là bridge được giữ cho Homepage,
không phải project Telegram webhook hoặc GAS báo cáo NAS/backup.

PR Homepage #25 là bản chọn model cũ còn mở; bản thay đổi này lấy main mới nhất,
giữ cải tiến Chi tiêu/QR hiện có và thay thế phần mã chat của PR cũ.

## Kiểm chứng

Tests bao phủ giới hạn đúng ngưỡng/vượt ngưỡng 50k và 200k, 39 message cho 20
lượt, envelope chứa ký tự JSON cần escape, HMAC/auth/origin, model metadata,
picker và xử lý phản hồi muộn. Tests dùng Google mock không chứng minh quota.
Phải đối chiếu workflow GAS thành công, source/alias production và HTML/JS
triển khai; chỉ gọi Google thật nếu có phiên người dùng hợp lệ.

Trạng thái chuẩn bị: GAS đã có model catalog trong run 39299313309 thành công;
bản giới hạn mới chưa triển khai tại thời điểm soạn tài liệu.
