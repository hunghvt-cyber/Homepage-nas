# Homepage và QR trên Vercel

Website tĩnh độc lập; text và ảnh trong GitHub. Không Firebase SDK, Firestore, Auth hay API Home-AI. Chỉ dist được phục vụ; Home-AI là dự án riêng; Homepage chỉ chứa shortcut đến ứng dụng đó.

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
