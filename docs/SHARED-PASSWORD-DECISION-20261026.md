# Quyết định: dùng chung nguồn mật khẩu Homepage và Notes

Ngày duyệt: **26/10/2026** (Asia/Ho_Chi_Minh).
Trạng thái: **ĐÃ ĐƯỢC NGƯỜI DÙNG ĐỒNG Ý — CHƯA TRIỂN KHAI**.
Lượt này chỉ ghi nhận quyết định, không đổi code, mật khẩu, biến môi trường hoặc cấu hình xác thực.

## Lý do
Đổi mật khẩu trên Homepage hiện không cập nhật Notes. Người dùng muốn đổi tại một nơi để dễ quản lý, không thêm dịch vụ quản trị mới.

## Hiện trạng đã đối chiếu mã
- Homepage: `api/auth.js` dùng `lib/password-store.js`; mật khẩu đổi qua UI được lưu dạng bản băm scrypt có version trong `portal-auth.json` của Koofr guide adapter. Có kiểm tra chữ ký HMAC, khóa và readback. Nếu chưa có record thì dùng cấu hình khởi đầu. Phiên đăng nhập gắn authVersion.
- Notes: `lib/app-config.mjs` và `lib/preview-api.mjs` kiểm tra `NOTES_PASSWORD` của project Vercel Notes; cookie/session secret riêng.
- Hai ứng dụng hiện vẫn độc lập. Không hiểu “đã duyệt” là đã đồng bộ.

## Phương án đã chọn
1. **Homepage là nơi duy nhất quản lý và đổi mật khẩu chung.**
2. Notes sẽ xác thực mật khẩu qua dịch vụ của Homepage; không đồng bộ bản rõ sang hai biến môi trường và không chia sẻ quyền đọc trực tiếp kho Koofr của Homepage.
3. Hai ứng dụng giữ session secret/cookie riêng; người dùng vẫn mở khóa riêng trên từng trang bằng cùng mật khẩu.
4. Đổi mật khẩu tại Homepage sẽ thu hồi phiên cũ của cả Homepage và Notes thông qua version chung.
5. Không thêm GAS, database, nhà cung cấp đăng nhập hoặc dịch vụ mới.
6. **Chưa làm SSO/đăng nhập một lần.** Muốn mở khóa Homepage rồi sang Notes không nhập lại cần quyết định và phạm vi riêng.

## Ràng buộc cho đợt triển khai sau
- Thiết kế endpoint server-to-server có xác thực riêng; không mở API kiểm tra mật khẩu công khai, không đưa service credential ra browser.
- Khóa phiên Notes vẫn riêng. Không sao chép SESSION_PASSWORD của Homepage sang Notes.
- Giữ giới hạn thử đăng nhập, kiểm tra nguồn yêu cầu và chế độ đóng khi dịch vụ chung không khả dụng; không fallback âm thầm sang mật khẩu Notes cũ.
- Xác định cách lấy/revalidate password version cho phiên Notes, giới hạn độ trễ thu hồi, cache và hành vi khi Homepage/Koofr lỗi. Đây là chi tiết chưa thiết kế, chưa có cam kết thu hồi tức thời.
- Kiểm thử đổi mật khẩu → phiên cũ của cả hai ứng dụng bị từ chối, mật khẩu mới hoạt động; phân biệt mật khẩu không khớp với phiên hết hạn.
- Giữ mọi bản nháp Notes, revision/CAS/khóa/ACL/chia sẻ và dữ liệu Koofr; không sửa schema Supabase ôn thi.
- Kết nối xuất code Notes bằng GitHub OIDC (Code Inbox) tiếp tục độc lập; đổi mật khẩu UI không cấp thêm hoặc thu hồi nhầm quyền của kết nối này.
- Đăng nhập/mở khóa Notes sẽ thêm phụ thuộc vào Homepage. Cần thông báo lỗi đúng, không coi hỏng dịch vụ xác thực là sai mật khẩu hoặc mất dữ liệu.
- Chỉ bỏ phụ thuộc runtime vào NOTES_PASSWORD sau khi kiểm thử và cutover thành công; không tự xóa secret/config hiện tại trong đợt ghi tài liệu.

## Khi tiếp tục
Đọc mã và cấu hình hiện hành của cả hai repo; lập thay đổi cụ thể, kiểm thử rồi triển khai theo phạm vi được người dùng yêu cầu ở lượt tiếp theo. Không triển khai chỉ vì tài liệu này ghi “đã duyệt”.

Repo Notes: [Hunghvt-notes / release/minimal-notes](https://github.com/hunghvt-cyber/Hunghvt-notes/tree/release/minimal-notes).
