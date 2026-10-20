# Gemini: chọn model và xác minh phiên bản

## Hành vi mới

- `/gemini/` và khung chat trang chủ dùng cùng giao diện. Model ban đầu vẫn là
  **Mặc định**, lấy `GEMINI_SHARED_MODEL` tại GAS bridge; không ghi đổi Script Properties.
- Danh sách chọn là giao của danh sách Google trả cho khóa hiện tại, khả năng
  `generateContent` và các model đã giới hạn phía GAS: model mặc định hiện có,
  `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`.
- Không tự thêm Pro, preview, image/audio, alias `latest` hoặc tự fallback.
  Danh sách Google xác nhận model tồn tại, **không xác nhận quota, billing hoặc
  một lần generate thành công**. Các lựa chọn Flash-Lite trên có Free Tier trong
  bảng giá Google đọc ngày 19/10/2026; khóa ở Paid Tier vẫn có thể tính phí.
- Danh sách cache 5 phút trong GAS. Nút Làm mới bỏ qua cache. Lỗi tải danh sách
  không ngăn gửi câu hỏi bằng Mặc định. Chỉ model được giới hạn và còn trong
  danh sách Google mới được gửi bằng lựa chọn tường minh.
- Mỗi câu trả lời ghi `requestedModel` từ request thực và `modelVersion` từ
  `GenerateContentResponse` của Google. Không lấy tên từ nội dung AI tự giới thiệu.
  Thiếu metadata thì hiển thị chưa xác minh, không lấy tên yêu cầu làm phiên bản thật.
- Lựa chọn chỉ áp dụng cho câu hỏi tiếp theo trong tab hiện tại; giữ lịch sử hội thoại,
  không lưu nội dung vào kho dữ liệu. Model quét bill vẫn dùng cấu hình cũ.
- 404/model bị gỡ: chọn Mặc định hoặc làm mới; 429: quota/quá tải; 503: thử lại sau.
  Không retry tự động. Giữ nháp khi lỗi, chặn phản hồi muộn sau Dừng/Khóa lại.

## Triển khai theo thứ tự

1. Cập nhật `poorman-telebot/main:GeminiShared.gs`, chạy tests.
2. Chạy thủ công workflow `deploy-apps-script.yml` trên **main** để cập nhật
   deployment GAS bridge hiện có, giữ nguyên URL, quyền và Script Properties.
   Workflow không bootstrap/polling, không sửa webhook bot hiện hành.
3. Chỉ sau workflow GAS thành công mới đưa thay đổi Homepage vào main/Vercel.
   Không copy secret production sang Preview. Homepage mới vẫn gửi được chat
   mặc định qua GAS cũ nhưng chưa có metadata/danh sách, không coi là triển khai đủ.
4. Mở khóa Homepage, kiểm danh sách, gửi câu ngắn ở Mặc định và một lựa chọn khác.
   Đối chiếu tên model yêu cầu và phiên bản Google trả. Kiểm phản hồi Google lỗi
   nếu xảy ra tự nhiên; không thay key hoặc cố làm hết quota để tạo lỗi production.

## Kiểm thử và giới hạn

Tests local bao phủ HMAC/action/model, auth/origin, allowlist, danh sách không có
generateContent, thiếu metadata, 404/429/503 không retry, model chọn không thay
quét bill, nháp, khóa/Dừng và phản hồi muộn. Tests dùng Google/GAS mô phỏng;
không chứng minh deployment hoặc khóa hiện tại còn quota.

Nguồn Google:
- https://ai.google.dev/api/generate-content#GenerateContentResponse
- https://ai.google.dev/api/models
- https://ai.google.dev/gemini-api/docs/pricing

Trạng thái khi chuẩn bị thay đổi: chưa triển khai GAS/Frontend mới, chưa xác minh
model runtime. Không gọi câu AI tự giới thiệu là bằng chứng vận hành.
