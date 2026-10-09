# Sửa hướng dẫn trên web bằng GitHub

Màn hình `/sua/` dùng HTML/CSS/Vanilla JS. Vercel Function `api/editor.js` xử lý GitHub OAuth và chỉ ghi `content/guides.json` lên main. Không dùng NAS, database hoặc Home-AI. Trang đọc và status feed không tải editor.js.

## Cấu hình một lần

1. Tạo GitHub OAuth App tại https://github.com/settings/applications/new
   - Application name: Homepage AIO Editor
   - Homepage URL: https://homepage-nas.vercel.app
   - Authorization callback URL: https://homepage-nas.vercel.app/api/editor?action=callback
2. Trong Vercel **project homepage-nas**, thêm biến môi trường Production:
   - `GITHUB_CLIENT_ID`: Client ID của app.
   - `GITHUB_CLIENT_SECRET`: Client secret của app.
   - `EDITOR_SESSION_SECRET`: chuỗi ngẫu nhiên tối thiểu 32 ký tự; có thể sinh bằng `openssl rand -hex 32`.
3. Redeploy project Homepage. Không gửi secret vào chat hoặc commit vào repo.

OAuth scope `repo` cần thiết cho repo private. Đây là quyền rộng của GitHub OAuth; server chỉ truy cập repo cố định và ghi file hướng dẫn cố định. Token GitHub được mã hóa AES-256-GCM trong cookie HttpOnly/Secure/SameSite=Lax, hết phiên sau 1 giờ. Cookie state hết hạn 10 phút; callback kiểm tra state. Không log token, không gửi token cho JavaScript trình duyệt. API kiểm tra quyền push ở mỗi lần đọc/lưu. POST chỉ nhận đúng Origin production. Đổi session secret sẽ vô hiệu các phiên đang có.

## Dùng

Mở hướng dẫn → Sửa hướng dẫn → Đăng nhập GitHub → chọn đồ vật → sửa các ô → Xem thử nội dung → Lưu lên GitHub. Website tự deploy sau commit; phải chờ Vercel hoàn tất mới thấy bản mới ở trang đọc. Trang sửa đọc trực tiếp bản mới nhất của file GitHub. Mỗi dòng ở ô thao tác là một thao tác. Ngày vệ sinh để trống khi chưa biết. Mục bổ sung được thu gọn trên trang đọc.

URL/slug không sửa được. Ảnh và trường ngoài biểu mẫu được giữ nguyên. Bản đầu chưa thêm/xóa đồ vật và chưa tải ảnh; thêm đồ vật/ảnh qua source. Nếu file có thay đổi đồng thời, lưu bị chặn và phần đang nhập được giữ lại để sao chép trước khi tải lại. Mỗi lần Lưu tạo commit; muốn khôi phục, revert commit nội dung trên GitHub và chờ deploy (không rewrite history).

## Kiểm tra

`node --test tests/editor.test.js`; `node --check api/editor.js`; `node --check public/editor.js`; `python3 scripts/build.py`.

OAuth App không thể được tạo bằng connector repo hiện có. Đăng nhập/lưu thật chỉ kiểm chứng được sau khi owner tạo App và cấu hình ba biến môi trường. Không coi mock tests là kiểm chứng OAuth production.
