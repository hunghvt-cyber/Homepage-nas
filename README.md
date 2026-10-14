# Homepage và QR trên Vercel

Homepage độc lập; nội dung nền và ảnh trong GitHub. Không Firebase SDK, Firestore hay API Home-AI. Trang QR đọc công khai; sửa hướng dẫn và Notes riêng tư dùng mật khẩu chung, chỉ cho người biết mật khẩu. API chạy trên Vercel và dữ liệu lưu trong Blob PRIVATE riêng. Chỉ dist được phục vụ; Home-AI là dự án riêng; Homepage chỉ chứa shortcut đến ứng dụng đó.

## Nội dung
- content/site.json: tên trang và shortcut. Link trống là chưa cấu hình. Viewer/FnNAS chỉ điền đường Tailscale đã xác minh; Home-AI giữ truy cập/đăng nhập hiện tại.
- content/guides.json: slug cố định, tên, khu vực, tóm tắt, các bước, lưu ý và ảnh. Không đổi slug sau khi in QR.
- Ảnh nén trong public/images; khai báo {"src":"/images/ten.webp","alt":"Mô tả","caption":"Chú thích"}. Ưu tiên ảnh 100–300 KB vẫn rõ chữ, tránh video/ảnh gốc lớn. Chỉ đưa nội dung muốn công khai.
- Hộp đồ là trang mẫu, không phải đồ vật thật. Trang hướng dẫn đọc được khi tắt JavaScript.

## Project Vercel riêng
Trong account đang có Home-AI, tạo project Homepage riêng, kết nối repo hunghvt-cyber/Homepage-nas:
- Root Directory: để trống (root repo)
- Framework: Other
- Production Branch: main
- Install/build/output: lấy từ vercel.json
- Không sao chép env/secret Home-AI.
- Production công khai không cần Vercel login; kiểm tra Deployment Protection của đúng project Homepage, không chỉnh Home-AI.

Git integration tự deploy khi push; không cần workflow Firebase hoặc token trong repo. Repo riêng phát triển độc lập với Home-AI.

Sau deploy đầu, xác nhận domain production thật và đặt PORTAL_BASE_URL=https://TEN-PROJECT.vercel.app cho build Production/Preview, rồi redeploy để có QR. Không dùng VERCEL_URL vì mỗi deployment có URL khác. In thử và quét kiểm chứng trước khi dán. Nếu đổi domain phải giữ domain cũ hoặc redirect để QR cũ tiếp tục dùng.

## Build local
Không tạo QR: python3 scripts/build.py.
Tạo QR: pip install -r requirements.txt, chạy build với PORTAL_BASE_URL là HTTPS origin đã xác nhận. QR SVG nằm trong dist/qr, có link tải ở từng hướng dẫn. Thư viện QR chỉ dùng khi build.

## Trạng thái NAS
Homepage đọc snapshot JSON công khai tối thiểu từ Vercel Blob; `content/site.json` giữ URL nguồn. Publisher Python lấy cache collector sẵn có, không quét NAS lại, và chạy bằng user systemd timer mỗi 5 phút. Snapshot được ghi đè tại pathname cố định; không commit cache vận hành hoặc snapshot.
State: ok/pass/warn/fail/unknown. `updated_at` theo cache nguồn; maintenance/retention giữ kết quả lần chạy gần nhất cùng `measured_at`. Snapshot quá 15 phút đánh dấu camera/NAS cũ nhưng không xóa kết quả maintenance/retention. Camera/NAS làm mới 5 phút một lần; maintenance/retention chỉ khi mở/reload.
Publisher dùng Blob SDK và token đọc từ `~/.config/homepage-nas/blob-token`. Không đẩy GitHub theo lịch, mở tunnel, hoặc xuất IP, đường dẫn recording, event, secret hay thông tin quản trị. Chi tiết và kiểm chứng: [báo cáo status feed](docs/NAS-STATUS-FEED-20261009.md).

## Kiểm chứng và quay lại
Build, syntax, link nội bộ/404, ảnh và QR trước khi commit. Kiểm tra điện thoại không đăng nhập Vercel, dữ liệu cũ, link Tailscale sau deploy. Revert commit hoặc rollback Vercel; giữ Homepage/tunnel cũ đến khi bản mới được kiểm chứng.

## Trạng thái
Đã bỏ cấu hình/workflow Firebase Hosting. Source sẵn sàng chưa có nghĩa website đã live; cần quyền tạo project đúng account Vercel.


## Notes và sửa hướng dẫn bằng mật khẩu

Mở `/notes/` để tạo, sửa và copy ghi chú/code. Ở trang đồ vật, chọn “Sửa hướng dẫn”, đăng nhập mật khẩu rồi sửa trực tiếp trên web. Chỉ người biết mật khẩu chung được truy cập Notes và sửa QR; đọc QR vẫn công khai. Không cần GitHub login.

Sửa trên web lưu override riêng trong private Blob; không tự commit GitHub. Nội dung nền vẫn trong content/guides.json. Rollback code không rollback dữ liệu Blob. Xem [cấu hình, quyền truy cập và giới hạn](docs/NOTES-PASSWORD-AUTH-20261010.md).

Chức năng riêng tư cần PORTAL_PASSWORD, SESSION_PASSWORD, PORTAL_BASE_URL và PORTAL_PRIVATE_BLOB_TOKEN. Khi thiếu cấu hình, API từ chối truy cập và giao diện báo chưa cấu hình. Không dùng Blob public đang phục vụ NAS status để lưu Notes.

Cài dependency Node: `npm ci --ignore-scripts`. Kiểm tra API: `npm test`.


## Chat Gemini

Trong Notes chọn **Mở chat Gemini**, hoặc mở `/gemini/`. Dùng mật khẩu chung và kết nối Apps Script của trang Chi tiêu; không thêm khóa Gemini vào Homepage. [Kiến trúc và giới hạn](docs/GEMINI-CHAT-20261011.md).


## Checklist trong Notes

Chọn **Chèn checklist** để thêm mục bên cạnh nội dung chữ; Enter thêm mục tiếp theo, Shift+Enter xuống dòng trong một mục. Tick chuyển mục xuống phần **Đã hoàn thành**, bỏ tick đưa trở lại phía trên. Bấm **Lưu** để lưu cả nội dung và checklist; Copy toàn bộ kèm ký hiệu `[ ]` / `[x]`.

Checklist có tối đa 200 mục, 2.000 ký tự/mục và tính vào giới hạn nội dung Note 1 MB. Hỗ trợ Note riêng, link Note, thư mục chia sẻ và lịch sử khôi phục. Note cũ mặc định không có checklist; trang cũ không gửi trường checklist sẽ giữ checklist đã có trên máy chủ.
