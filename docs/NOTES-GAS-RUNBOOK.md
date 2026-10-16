# Triển khai thử và vận hành Notes Google

**Chỉ dữ liệu giả lập. Không merge main, không đổi production, không nhập Note thật.** Không dùng Apps Script hay thư mục của chi tiêu/Gemini. Đã xác minh kết nối Drive Primary; công cụ hiện tại chưa có Apps Script deployment API. Các bước Google dưới đây cần chủ tài khoản thực hiện; không gửi mật khẩu/OAuth token/secret vào chat.

## 1. Bước người dùng thực hiện trước

1. Mở https://script.google.com/home bằng tài khoản Google dự định lưu Notes.
2. Chọn **New project / Dự án mới**.
3. Đặt tên **Homepage Notes Prototype**.

Dừng tại đây nếu đang được hướng dẫn từng bước. Báo “Đã tạo project”; chưa cần tạo deployment hay sửa ứng dụng cũ. Link project không phải OAuth credential, có thể dùng để xác định project nếu cần, nhưng không chia sẻ quyền editor công khai.

## 2. Nạp source và cấp quyền (sau bước 1)

1. Từ nhánh/commit PR đã review, tạo file script `Core` rồi chép nguyên `experiments/notes-gas/apps-script/Core.js`; tạo file `Server` rồi chép `Server.js`. Google editor hiển thị `.gs` là bình thường. Xóa nội dung Code.gs mặc định nếu chỉ là myFunction trống, không đụng project cũ.
2. Project Settings: bật **Show appsscript.json manifest file in editor**, thay manifest bằng `appsscript.json` trong nhánh thử. Không thêm Spreadsheet/Telegram/Gemini scopes.
3. Tạo khóa mới 32 byte bằng trình sinh mật khẩu/crypto đáng tin cậy trên máy của mình. Nếu có Node: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Lưu khóa trong password manager, không paste vào chat/GitHub. Đây là chuỗi 64 ký tự hex.
4. Project Settings → Script Properties → thêm `NOTES_HMAC_KEY` bằng khóa mới. Không dùng khóa production nào có sẵn. Không cần nhập folder ID: bootstrap tạo folder riêng.
5. Chọn hàm **initializeNotesPrototype** trong editor → Run → Review permissions → chọn đúng tài khoản → kiểm tra quyền Drive trước khi Allow. Scope hiện là full Drive do dùng DriveApp; connector Drive có sẵn không thay thế consent này. Nếu không muốn cấp quyền rộng, dừng để thiết kế phiên bản dùng Drive API/drive.file riêng; không hạ guard.
6. Vào Drive xác minh xuất hiện folder **Homepage Notes PROTOTYPE - synthetic data only**, Restricted, không có editor/viewer khác, có một snapshot JSON revision 0. Script Properties phải có `NOTES_ROOT_FOLDER_ID` và `NOTES_HEAD` tự sinh. Không tự sửa HEAD, không chạy init lần hai.
7. Nếu init lỗi: giữ nguyên folder/properties để kiểm tra. Không xóa HEAD hoặc init lại nhằm bỏ qua lỗi. Chưa có dữ liệu thật nên có thể chuẩn bị project thử mới sau khi xác định nguyên nhân, nhưng không coi việc reset là recovery test.

DriveApp scope có thể đọc nhiều tệp hơn folder riêng. Mã chỉ dùng folder tạo mới và file ID trong HEAD; không đưa ID của dữ liệu cũ vào config. Scope rộng là rủi ro còn tồn tại.

## 3. Deploy web app Google mới

1. Deploy → New deployment → loại **Web app**.
2. Description ghi commit GitHub thử nghiệm. Execute as **Me**; Who has access **Anyone** (anonymous, không phải “Anyone with Google account”). Đây là public transport có HMAC kiểm mọi request; folder Drive vẫn Restricted.
3. Nếu tài khoản/domain không cho Anyone, dừng, không sửa chính sách tổ chức hay đưa OAuth token vào source. Cần phương án xác thực khác trước khi tiếp tục.
4. Deploy, lưu URL dạng `https://script.google.com/macros/s/.../exec`. Không dùng `/dev`.
5. Ghi mapping commit ↔ Apps Script version ↔ deployment ID trong nhật ký nội bộ. URL /exec có thể gửi trong chat để tiếp tục kiểm tra; **khóa HMAC không gửi**.

Chưa tạo trigger/cron, chưa tự deploy Google qua GitHub Actions. Mã quản lý tập trung ở GitHub; deployment Google thủ công có version cố định. Việc tự động hóa bằng clasp/API là phần sau, cần OAuth scopes/quản lý credential riêng.

## 4. Adapter Vercel thử nghiệm tách biệt

Không thêm secrets vào project homepage-nas hiện hành. Tạo project sandbox riêng sau khi Google đã chạy được; không link domain production, không dùng Home-AI project.

- Template ở ngoài `/api` nên hiện không có endpoint mới trên homepage-nas, kể cả Vercel tự tạo preview cho PR.
- Trong checkout/project sandbox riêng, chép template thành `api/notes-prototype.mjs`; đổi hai import theo comment đầu file. Giữ `api/auth.js` và `lib/security.js` cho session thử; dùng shared password/session secret **riêng**.
- Thiết lập các biến trong `.env.example` chỉ cho **Preview/Development**, `PORTAL_BASE_URL` đúng origin thử. Bật `NOTES_GAS_PROTOTYPE_ENABLED=true` ở sandbox. Không cấu hình PORTAL_PRIVATE_BLOB_TOKEN; adapter không cần Blob.
- Guard chặn khi VERCEL_ENV=production. Để benchmark qua Vercel, dùng Preview URL; xác minh session và Origin bằng request thực. Nếu Preview có Vercel Authentication, xử lý deployment protection theo quyền sandbox; không tắt bảo vệ project cũ.
- Dùng Node 24. Timeout mỗi lần Google tối đa 12 giây, tối đa hai lần và jitter; tổng request có thể gần 25 giây. Sandbox cần function timeout đủ (thí dụ 35 giây trong phạm vi plan cho phép), kiểm tra giới hạn thực tế trước deploy. Không đổi timeout của API production.
- API frontend chưa nối; client test gửi POST `{requestId, issuedAt, op, payload, token?}`. `requestId`/`issuedAt`/payload giữ nguyên đến khi biết kết quả. Owner dùng session mới; token xác định actor share. Lỗi 409 không retry tự động.

## 5. Chạy integration/benchmark thật

Chỉ khi đã xác minh folder revision 0, dữ liệu rỗng, quyền private. Từ checkout local Node 24, cấu hình environment riêng trên máy, không đưa giá trị vào chat hoặc command log. `adapter.mjs` dùng env do caller truyền; không tự đọc `.env`.

```sh
NOTES_GAS_TEST_ONLY=SYNTHETIC_EMPTY_PROJECT node experiments/notes-gas/scripts/benchmark.mjs
```

Script đọc NOTES_GAS_URL và NOTES_GAS_HMAC_KEY đã cấu hình ở máy; dừng nếu list không rỗng; tạo ít nhất 100 Note giả; chạy CRUD/checklist, search/delta, workspace, chia sẻ/thu hồi, hai request cập nhật cùng revision, replay, backup. Kết quả riêng tư `experiments/notes-gas/benchmark-result.local.json` được gitignore. Không xóa dữ liệu/snapshot sau khi chạy. Đừng chạy lại trên store này như một store mới.

Benchmark script đo đường Node → Google; cần thêm lượt qua Vercel Preview → Google, đo UI trên PC/iPad/điện thoại mới đánh giá đầy đủ. Kết quả cold đầu tiên là cold candidate, không khẳng định cold start Google. Lỗi 409/404 cố ý cũng được ghi, phân loại trước tính error rate.

Cần chạy thủ công bổ sung: lỗi mạng thật khi đang lưu, hai thiết bị chỉnh/sửa checklist, thu hồi trong lúc lưu, timeout ở các giai đoạn Drive, hỏng/mất quyền snapshot, thiếu storage/quota. Không cố tiêu hết quota tài khoản đang chạy bot; mô phỏng quota trước, theo dõi usage thật với tải nhỏ. Bộ fault injection hiện có chỉ chứng minh model mô phỏng.

## 6. Backup và khôi phục

Mỗi mutation giữ một snapshot bất biến; snapshot ở cùng Drive **không phải backup độc lập**.

- Lưu bản sao HEAD/config (không public HMAC) và snapshot được HEAD trỏ tới, kiểm SHA256 trùng HEAD. Tải từ folder Drive private hoặc `backup` API khi response dưới 4 triệu byte. Không copy candidate/orphan rồi gọi đó là committed backup.
- Ghi thời gian, revision, hash và commit code. Lưu backup vào kho riêng có kiểm soát truy cập; không commit JSON dữ liệu, capability hash hoặc HEAD thật vào repo. Kiểm tra tải xuống/parse/hash độc lập; định kỳ diễn tập trong project thử riêng.
- Khôi phục một Note: owner đọc Note kèm revision/history, gọi restore với historyIndex; revision cũ =>409. Soft-delete giữ dữ liệu và lịch sử. Có thể lấy nội dung từ snapshot qua kiểm tra thủ công nếu Note không có history phù hợp.
- HEAD thiếu/hỏng: dừng ghi, lưu hiện trạng, xác định last committed snapshot bằng nhật ký/backup. Không tự chọn file tên lớn nhất, vì có orphan sau commit lỗi. Chưa có full-store restore API tự động; thiếu bằng chứng thì giữ lỗi và báo người vận hành.
- Khôi phục toàn store có nguy cơ hồi sinh link đã thu hồi. Phương án phải giữ tập thu hồi hoặc vô hiệu toàn bộ capability cũ và dùng revision/generation mới. Không sửa HEAD về bản cũ dưới traffic. Đây là gate chưa hoàn thành; chỉ diễn tập synthetic trong project riêng, không triển khai thật.
- Không GC/xóa snapshot tự động. Theo dõi dung lượng; dự toán khoảng tổng kích thước tất cả snapshot, không chỉ HEAD. Khi cần retention phải thêm inventory committed/orphan, backup verified và review riêng trước xóa. Hiện đầy Drive sẽ dừng ghi, không xóa để “cứu” quota.

## 7. Rollback

Prototype chưa đụng production nên rollback triển khai = tắt NOTES_GAS_PROTOTYPE_ENABLED ở sandbox, dừng client benchmark; archive Google test deployment, giữ folder/snapshot để điều tra. Không cần khôi phục Blob vì chưa thay đổi nó.

Rollback code Google chỉ dùng version schema tương thích đã kiểm thử, luôn giữ HEAD mới nhất và danh sách thu hồi. Không đưa HEAD về bản cũ. Nếu code/schema không tương thích, dừng web app trước, không thử sửa dữ liệu cho chạy bằng được.

Chưa có kế hoạch cutover/migration được phép chạy. Chỉ sau phê duyệt riêng mới thiết kế export Blob read-only, kiểm kê/hash, rehearsal vào namespace thử, read-only freeze, đối soát, cutover có rollback. Không dual-write dữ liệu thật trong prototype.

## 8. Bản cập nhật vận hành sau khi đã init

Xem [quản lý chung Homepage](NOTES-GAS-HOMEPAGE-OPERATIONS.md). Chỉ thay Server.gs bằng Server.js mới của PR, lưu, chạy checkNotesPrototype. Không chạy initializeNotesPrototype lần hai, không đổi HMAC/HEAD/folder/manifest. Console và journal chỉ metadata. Sau deploy mới đặt GitHub secrets để AI đọc kết quả health/log qua workflow. Tự cập nhật source bằng OAuth/clasp chưa cấu hình.
