# Bộ đếm đăng nhập Homepage trên Supabase

Thay bộ đếm Blob đang lỗi bằng PostgreSQL trong dự án CongchungVND hiện có.
Chỉ bộ đếm thay đổi. Mật khẩu chung, cookie mã hóa, Gemini và dữ liệu ôn thi
giữ nguyên. Không tạo project, nâng gói hoặc thêm thẻ thanh toán.

## Phạm vi và quyền

- Schema `homepage_login`, bảng `state` có đúng một bản ghi. Bucket 15 phút,
  tối đa 30 lượt tổng, 5 lượt/IP. IP được HMAC tại Vercel trước khi gửi.
- Một giao dịch khóa bản ghi để kiểm tra và tăng cả hai giới hạn. Đồng hồ
  PostgreSQL quyết định bucket; phía gọi không thể chọn thời gian hoặc mức giới hạn.
- Bản đồ IP có tối đa 30 mục; khi đổi bucket thì thay nội dung cũ. Không cần Cron.
- `anon`/`authenticated` không có quyền đọc hay sửa bảng. RLS bật, không có policy
  công khai (advisory INFO về thiếu policy là chủ ý chặn truy cập trực tiếp).
- RPC public là `SECURITY INVOKER`; implementation `SECURITY DEFINER` nằm trong
  schema không expose, owner là role NOLOGIN riêng, search_path rỗng. Nó kiểm tra
  machine token 256-bit trước khi khóa/sửa bộ đếm. Token chỉ lưu dạng SHA-256 trong DB.
- Vercel chỉ giữ publishable key và machine token riêng; không dùng service_role,
  mật khẩu database hay quyền quản trị dự án. Không thay quyền/bảng ôn thi hiện có.
- Sai token, lỗi mạng, thiếu cấu hình hoặc response sai đều chặn đăng nhập (503).
  Vượt số lượt trả 429. GET session/logout không dùng bộ đếm.

## Cấu hình production

`LOGIN_LIMIT_BACKEND=supabase`, `LOGIN_LIMIT_SUPABASE_URL`,
`LOGIN_LIMIT_SUPABASE_KEY`, `LOGIN_LIMIT_TOKEN`. Key/token lưu dưới dạng Secret
ở Vercel production; không cấp quyền production cho preview.

SQL triển khai: `deploy/supabase/homepage-login-limiter.sql`. Sau khi tạo schema,
provision một token ngẫu nhiên 32 byte; chỉ ghi SHA-256 vào `state.token_hash`,
token gốc vào Vercel Secret. SQL không chứa token triển khai.

## Kiểm chứng

- SQL transaction rollback: sai token, quyền bảng, wrapper invoker, chặn lượt 6,
  chặn lượt tổng 31 và đổi bucket cho phép đăng nhập lại.
- HTTP Supabase thật: nhiều yêu cầu cùng lúc; không vượt mức IP/global.
- Node: bảo mật IP, lỗi/response sai, cookie login/session/logout và fail-closed.
- Supabase advisors: không có ERROR/WARN mới; INFO RLS không policy là chủ ý.

## Chuyển lại Blob

Khi Blob hoạt động lại, kiểm tra đọc/ghi và giới hạn thật trước. Sau đó đổi
`LOGIN_LIMIT_BACKEND=blob` và redeploy. Không tự đổi backend khi lỗi vì hai bộ đếm
độc lập có thể cho phép nhiều lượt hơn mức dự kiến. Chỉ thu hồi token/quyền và gỡ
schema của bộ đếm sau khi xác minh chuyển lại; không tác động schema ôn thi.

Supabase Free có thể pause khi ít hoạt động trong 7 ngày. Khi pause/outage,
đăng nhập mới bị chặn; cookie còn hợp lệ vẫn kiểm tra cục bộ trên Vercel.
