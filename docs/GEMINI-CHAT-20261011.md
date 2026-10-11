# Chat Gemini trên Homepage

## Kết nối đã kiểm tra

Home-AI dùng Vercel `api/gemini.js` gọi Gemini Developer API bằng `GEMINI_API_KEY`, xác thực Firebase. Không dùng Gemini CLI. Metadata Vercel xác nhận biến khóa tồn tại; không đọc hoặc sao chép giá trị khóa.

Homepage dùng cùng cách gọi Gemini API nhưng qua botchitieu, tận dụng khóa/model đang cấu hình trong Apps Script và kết nối HMAC của trang Chi tiêu. Không phụ thuộc API hoặc Firebase Home-AI; không thay đổi Home-AI, NAS hay thanh toán.

Luồng: trình duyệt `/gemini/` → phiên mật khẩu chung → Vercel `/api/chat` → Apps Script `homepage_chat` → Gemini. Khóa Gemini chỉ ở Script Properties. `EXPENSES_API_URL` và `EXPENSES_API_SECRET` hiện có được dùng lại; HMAC ký cả action, lịch sử và timestamp, hết hạn sau 60 giây. Backend kiểm tra thứ tự lượt, độ dài và số lượt trước khi gọi AI.

## Giao diện và hạn mức

- Gửi câu hỏi, mở cuộc trò chuyện mới, dừng chờ câu trả lời.
- Trả lời hiện khi hoàn tất, chưa có streaming.
- Lịch sử trong bộ nhớ của trang, không lưu Blob hoặc Sheets; khóa lại xóa lịch sử và hủy chờ.
- Dừng chờ không bảo đảm hủy request đã đến Google.
- Tối đa 10 lượt/cuộc trò chuyện, 4.000 ký tự/câu hỏi, 24.000 ký tự toàn bộ lịch sử; 30 request/ngày cho cả nhà theo giờ Việt Nam.
- Không tự retry hoặc chuyển model trả phí. Dùng `GEMINI_MODEL` sẵn có của botchitieu.

Không bật thanh toán hoặc tạo dịch vụ trả phí. Chưa xác minh được billing tier của Google Cloud; giới hạn trong mã không biến khóa đang trả phí thành miễn phí. Nếu project của khóa đang ở Free Tier, hết hạn mức Google sẽ báo giới hạn. Cả chat và scan bill cùng tiêu thụ quota của khóa botchitieu.

## Triển khai và kiểm tra

Triển khai Apps Script trước rồi Homepage qua Git integration. Giữ deployment URL, Script Properties và polling trigger hiện có, không bootstrap. Kiểm tra `/api/chat` yêu cầu mở khóa, `/gemini/` có nút gửi; gửi câu hỏi ngắn để kiểm tra Gemini thật.

Kiểm thử local: `npm test`, build Python, cú pháp JavaScript và liên kết nội bộ. Test bao phủ auth/origin, HMAC, thứ tự lượt, quota, render bằng text, giữ bản nháp khi lỗi và xóa lịch sử khi khóa. Test mock không chứng minh khóa Google hiện tại còn quota hay billing tier. Rollback bằng revert commit của Homepage và botchitieu, không xóa dữ liệu chi tiêu.
