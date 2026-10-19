# Notes và sửa QR bằng mật khẩu chung

> **Cập nhật 19/10/2026 — đọc [OPERATIONS.md](OPERATIONS.md) trước.** Kiến trúc Notes Blob lịch sử đã nghỉ. /notes/ hiện mở ứng dụng Koofr riêng; API Notes cũ trả 410. Guide overrides vẫn dùng private Blob; mật khẩu/cookie Homepage vẫn giữ, bộ đếm đã chuyển Supabase. Không khôi phục Notes writer cũ.

## Nội dung lưu trữ lịch sử

Người dùng đã thay yêu cầu Gmail/Google login bằng một mật khẩu chung cho Notes và sửa hướng dẫn QR. Không còn Google Client ID, OAuth, tài khoản GitHub hoặc email allowlist trong runtime. Ai biết mật khẩu đều có quyền này. QR vẫn đọc công khai.

## Chức năng
Notes: nội dung tối đa 1 MB UTF-8; tự lưu, copy toàn bộ, ghim, tìm theo tiêu đề, giữ tối đa 5 bản trước trong giới hạn 3 MB mỗi note gồm lịch sử. Không dùng localStorage. Xóa mềm; chưa có giao diện khôi phục note đã xóa.
QR: sửa ngay trên web, giữ slug/ảnh. Nội dung sửa lưu override riêng trong private Blob; GitHub giữ nội dung nền. Revert code không rollback dữ liệu. Khi tắt JS, đọc bản nền; lỗi tải bản sửa có thông báo.

## Xác thực
Mật khẩu đặt trong biến môi trường server PORTAL_PASSWORD, tối thiểu 12 và tối đa 256 ký tự. Không đưa vào mã nguồn, public output hoặc chat. So sánh digest SHA-256 bằng timingSafeEqual; digest chỉ dùng so sánh trong RAM, không phải kho hash mật khẩu công khai. Secret thật nằm trong biến môi trường Vercel.
Phiên iron-session 7 ngày, Secure/HttpOnly/SameSite=Lax, cookie __Host-homepage. Session gắn fingerprint mật khẩu: đổi PORTAL_PASSWORD sẽ vô hiệu phiên cũ. POST yêu cầu JSON và Origin production chính xác. Không CORS.
Giới hạn bền vững trong private Blob: 5 lần thử/địa chỉ IP mỗi cửa sổ 15 phút, 30 lần thử tổng cộng/cửa sổ. Tính mọi lần thử, kể cả thành công. IP được HMAC, không lưu IP thô. Nếu thiếu địa chỉ từ header Vercel, dùng bucket chung bảo thủ. Có thể khiến nhiều người cùng mạng phải đợi; không phải giới hạn chỉ riêng lần nhập sai. Blob lỗi thì không cho đăng nhập. ETag conditional writes ngăn nhiều instance bỏ qua hạn mức.

## Kích hoạt
Project Homepage: homepage-nas, team hunghvt. Tạo Blob store PRIVATE riêng; không dùng store public phục vụ nas-status.json. Vercel Settings → Environment Variables → Production:
- PORTAL_PASSWORD: mật khẩu do chủ tài khoản chọn, 12–256 ký tự.
- SESSION_PASSWORD: chuỗi ngẫu nhiên mạnh >=32 ký tự, khác mật khẩu truy cập.
- PORTAL_PRIVATE_BLOB_TOKEN: token của store PRIVATE, nhập trực tiếp Vercel.
- PORTAL_BASE_URL: https://homepage-nas.vercel.app.
Không cần Google Cloud project nữa. Không gửi mật khẩu/token qua chat. Khi Preview được test, origin Preview phải khớp PORTAL_BASE_URL của Preview; không đổi QR production sang URL preview.

## Trạng thái và kiểm chứng
Mã trên nhánh notes-google-auth (giữ tên nhánh để tiếp tục PR #1). Chưa đưa vào main vì chưa cấu hình secret/private store. Vercel connector trước đó trả 403 thiếu quyền team; người dùng chưa xác nhận đã kết nối lại.
Tests kiểm tra password, rotation, rate limit/cửa sổ/lỗi storage, quyền Notes, chống ghi đè, code/DOM và XSS. Cần kiểm chứng thật login, private Blob, đổi thiết bị và QR sửa xong đọc bởi khách sau cấu hình. Giữ production hiện tại đến khi hoàn tất.
