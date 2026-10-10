# Notes và chỉnh sửa QR bằng Google

## Quyền và dữ liệu
Chỉ `thanhhunga4.wtf@gmail.com` đã được Google xác minh (không phân biệt hoa/thường) được đọc/tạo/sửa/xóa Notes và sửa hướng dẫn QR. Đọc QR vẫn công khai. Slug/ảnh giữ nguyên. Không dùng NAS, Firebase, Firestore hay API Home-AI.

Google token được google-auth-library xác minh chữ ký, audience, issuer, expiry; backend kiểm tra nonce, email_verified và email chính xác. Phiên iron-session 7 ngày: cookie __Host-homepage, Secure, HttpOnly, SameSite=Lax. POST chỉ nhận JSON cùng origin đã cấu hình. Không dùng localStorage để lưu note.

Dùng Blob store **PRIVATE riêng**. Không dùng store PUBLIC của nas-status.json. Token chỉ ở backend. API public của QR chỉ xuất guide, không đọc note hay pathname tùy ý. Reads useCache:false; writes ETag ifMatch; thiết bị sửa bản cũ bị từ chối 409 và giữ nội dung đang nhập.

Notes: tối đa 1 MB UTF-8 nội dung/note (JSON lưu tối đa 3 MB); giữ tối đa 5 bản trước trong giới hạn 3 MB. Tự lưu sau 2 giây ngừng nhập khi có tiêu đề. Tìm theo tiêu đề, ghim, Copy và khôi phục lịch sử. Chờ Đã lưu trước khi đóng. Xóa mềm: API ẩn note đã xóa; chưa có giao diện khôi phục note đã xóa.

QR: sửa trực tiếp bằng form, không cần GitHub login. Bản sửa lưu override trong Blob; content/guides.json vẫn là nội dung nền. Khi tắt JS, trang hiển thị bản nền; lỗi tải cập nhật có thông báo. Không upload ảnh ở bản này. Giữ tối đa 5 bản trước trong Blob, khôi phục thủ công bằng API có revision hiện tại hoặc xóa đúng guide override bằng quyền quản trị Blob.

Rollback GitHub/Vercel không rollback dữ liệu Blob. Không xóa store để rollback.

## Cấu hình kích hoạt
Project Homepage: `homepage-nas` / `prj_3CCmGVbfaymDVoO66d6MPU1CQ1nw`; team `team_gCsQcRiaCja0GafKj8JZLINI`. Không chỉnh Home-AI.

1. Google Cloud Console → Google Auth Platform → tạo OAuth client **Web application**. Authorized JavaScript origins: `https://homepage-nas.vercel.app` (origin production trong content/site.json, không có path). Nếu app ở Testing, thêm Gmail chủ tài khoản vào Test users. Luồng GIS popup không cần client secret hay redirect URI.
2. Vercel → homepage-nas → Storage → tạo store **Private** riêng, rồi cấu hình Environment Variables của project:
   - GOOGLE_CLIENT_ID: Client ID của OAuth client ở bước 1; đây là giá trị công khai.
   - SESSION_PASSWORD: chuỗi ngẫu nhiên mạnh >=32 ký tự, tạo bằng password manager. Không gửi qua chat.
   - PORTAL_BASE_URL: https://homepage-nas.vercel.app (origin production cố định, cũng dùng tạo QR).
   - PORTAL_PRIVATE_BLOB_TOKEN: token đọc/ghi của store PRIVATE riêng. Chỉ nhập trực tiếp Vercel, không gửi qua chat.
3. Merge nhánh tính năng rồi redeploy Production. Không đổi token NAS status publisher. Không đổi domain/slug QR.

Nếu thử Preview, cần origin riêng được Google cho phép và PORTAL_BASE_URL Preview khớp origin đó; không đổi URL QR production để test. Khi thiếu cấu hình API đóng quyền truy cập, giao diện báo chưa cấu hình.

## Kiểm chứng
Local: 8/8 Node/API/DOM tests và 6/6 Python status tests đạt; npm test; build Python với qrcode; JS syntax; HTML IDs và link nội bộ; bộ kiểm tra NAS status hiện có. Auth unit tests giả lập Google verifier, không thay thế login thật. Notes tests giả lập persistence với ETag, không thay thế private Blob thật.

Cần test thật trước khi coi đã hoạt động: Gmail khác bị từ chối; khách không đọc được Notes; chủ tài khoản tạo/reload/copy/khôi phục code trên hai thiết bị; sửa QR và mở lại với khách; hai tab sửa cùng bản phải có 409; kiểm tra giao diện điện thoại.

Trong phiên thực hiện, Vercel connector đọc project trả 403 thiếu quyền scope hunghvt; CLI Vercel không có trong môi trường. Chưa tạo private store, chưa cấu hình Google Client ID/secret, chưa kiểm chứng Google login, private Blob hoặc trình duyệt thật. Nhánh riêng giữ production hiện tại.

Quota/chi phí phụ thuộc Vercel Blob. Lần sửa mã này không tạo store, thay billing hay dịch vụ NAS.
