# Audit Notes và phương án Apps Script + Drive — 16/10/2026

## Bằng chứng nguồn và giới hạn audit

Đọc main **a09b63b2c520312a70c8e13b645537f62fb7711a** qua GitHub connector, bao gồm toàn bộ 66 tệp text và 6 ảnh. Git HTTPS trong runtime không có credential, nên source được materialize qua connector, không giả nhận là clone đủ lịch sử. PR dùng Git Data API dựa trên commit main thật; không đẩy commit snapshot cục bộ.

Vercel `get_project(homepage-nas)` trả project `prj_3CCmGVbfaymDVoO66d6MPU1CQ1nw`, deployment production `dpl_7za4an7HSpysQLAEmzUPwLMa6dXq` READY. Đây chỉ là trạng thái deployment, **không chứng minh Blob đọc/ghi được**. Không có Notes store ID/token tại runtime; chưa có kiểm tra private Blob độc lập. Không đọc/decrypt secrets production, không thử ghi Note thật. Thông tin hai public store bị khóa là bối cảnh người dùng cung cấp, chưa tái xác minh trong lượt audit này.

Kết nối Google Drive Primary đọc profile thành công. Connector có công cụ Drive nhưng không có Apps Script Projects/Content/Deployments API. Quyền đọc Drive qua connector không đồng nghĩa đã có OAuth scope để triển khai Apps Script. Chưa tạo tài nguyên Google, chưa cấp quyền Apps Script, chưa có benchmark mạng thật.

## Hành vi main hiện tại

| Thành phần | Bằng chứng mã nguồn / hành vi |
| --- | --- |
| Xác thực | `lib/security.js`, `api/auth.js`: mật khẩu dùng chung; iron-session cookie `__Host-homepage`, HTTPS/HttpOnly/SameSite=lax, 7 ngày; authVersion là SHA256 mật khẩu; đổi mật khẩu vô hiệu phiên cũ |
| Request | POST cùng origin PORTAL_BASE_URL, application/json; JSON tối đa 3 MB |
| Lưu | `lib/storage.js`: private Blob qua PORTAL_PRIVATE_BLOB_TOKEN; đọc useCache:false; tạo allowOverwrite:false; sửa ifMatch với ETag canonical; lỗi điều kiện => 409 |
| Note | `api/notes.js`, `lib/validation.js`: id UUID, title <=200, text <=1 triệu ký tự, tổng UTF-8 text/checklist <=1 triệu byte; pinned, folder <=80; checklist <=200, id riêng, text <=2000; updatedAt, history <=5, cả record <=3 triệu byte |
| Xóa | Soft-delete. Hiện delete lấy bản mới nhất server, không bắt revision phía client. Prototype siết lại: delete cũng cần revision |
| Folder | Tên nằm trong từng Note; không có folder rỗng độc lập. folderDelete bỏ folder hoặc soft-delete từng Note; chặn khi folder đang chia sẻ; main không có giao dịch bulk |
| Workspace | `api/shared-folder.js`: capability folder; list/get/create/save; không được đọc Note ngoài folder; quyền gắn theo tên folder |
| Chia sẻ | `api/note-share.js`, `api/shared-note.js`, `lib/note-sharing.js`: token 16-byte id + 32-byte secret, chỉ lưu SHA256(secret); không hết hạn tự động; thu hồi và tạo token mới; link Note xem/sửa; link folder tạo/sửa. Main tái kiểm tra link trước ghi nhưng còn khe race thu hồi/ghi |
| Revision | Owner/shared save kiểm revision, Blob conditional write là hàng rào cuối. Không thể thay bằng chỉ timestamp hoặc thao tác đọc-rồi-ghi không khóa |
| Index | `lib/notes-list.js`: index v2 có stamp metadata/path/upload/size/etag; tải body thay đổi, xác minh metadata lại; index lỗi có fallback, không là nguồn dữ liệu duy nhất |
| Đồng bộ/UI | `public/notes.js`: delta known id/revision, GET chi tiết conditional, bộ nhớ chi tiết tạm và prefetch; cache localStorage chỉ title/preview <=180, không ghi toàn văn; tìm kiếm dựa trên dữ liệu list. Prototype index chỉ preview nên có search toàn văn riêng, chưa nối UI |
| Tích hợp khác | `api/chat.js`, `api/expenses.js` và cấu hình hiện tại không sửa; không đổi Apps Script/secret của chúng |

## Giới hạn Google kiểm tra ngày 16/10/2026

Chỉ dẫn chính thức có thể thay đổi; cần kiểm tra lại tại ngày triển khai. Không dùng số 12.000 request/phút từ tài liệu cũ.

| Giới hạn công bố | Consumer / Workspace | Ảnh hưởng |
| --- | --- | --- |
| Apps Script runtime | 6 phút/lần | Adapter dừng chờ trước Google; timeout không có nghĩa server chưa commit |
| Concurrent execution | 30/user; 1.000/script | Quota tài khoản có thể dùng chung với chi tiêu/Gemini dù project tách riêng |
| Properties read/write | 50.000 / 500.000 mỗi ngày | HEAD/config đọc mỗi request; theo dõi usage thật, không coi là số request cho Notes |
| Properties storage | 9 KB/value, 500 KB/store | Chỉ lưu khóa, folder ID và HEAD nhỏ; không nhét Note/index/receipt vào Properties |
| URL Fetch | 20.000 / 100.000 mỗi ngày | Đây là Apps Script gọi ra ngoài, KHÔNG phải quota request Vercel gọi vào. Prototype dùng DriveApp, không dùng UrlFetchApp |
| Trigger runtime | 90 phút / 6 giờ mỗi ngày | Không áp hạn trigger này cho tổng runtime web app; prototype không tạo trigger |
| Versions | 200/script | Version triển khai cần quản lý; không tạo version mỗi lượt lưu |
| Drive REST quotas hiện công bố | 1.000.000 quota units/phút/project, 325.000/user/project; egress 1 TB/ngày/project; threshold 400.000.000 units/ngày | Là units theo method, không phải số request. Không suy ra DriveApp 1:1 với REST quotas; vẫn chịu service throttling |
| Drive REST giá | Standard usage không thu thêm hiện tại; tài liệu nói có kế hoạch thu vượt quota về sau trong 2026, báo trước ít nhất 90 ngày | Không cam kết miễn phí vĩnh viễn. Không bật billing/tăng quota trong thử nghiệm |
| Storage tài khoản | Dùng chung Drive/Gmail/Photos, kiểm tra quota tài khoản thực tế | Snapshot/history/receipt cộng dồn; không giả định dung lượng còn trống |
| Không hoạt động | Không tìm thấy chính sách Apps Script tự pause sau vài ngày ít request; Google có chính sách tài khoản không hoạt động >=2 năm | Không hứa luôn hoạt động; quota, thu hồi OAuth, tài khoản/admin policy có thể làm ngừng |

Nguồn chính thức:

- https://developers.google.com/apps-script/guides/services/quotas
- https://developers.google.com/workspace/drive/api/guides/limits (trang cập nhật 11/09/2026)
- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/content
- https://developers.google.com/apps-script/reference/lock/lock-service
- https://developers.google.com/apps-script/reference/properties/properties-service
- https://developers.google.com/apps-script/reference/drive/drive-app
- https://support.google.com/drive/answer/6374270
- https://support.google.com/accounts/answer/12418290

## Quyết định thiết kế thử nghiệm

Một project Apps Script mới + một folder private mới. Không phụ thuộc NAS. GitHub là nguồn mã; không gắn tự deploy Google để tránh cần OAuth credential dài hạn trong Actions lúc chưa chứng minh được giải pháp.

Vercel giữ session/CSRF, ký yêu cầu HMAC gửi server-to-server qua HTTPS. Google web app chạy dưới chủ sở hữu, access Anyone để Vercel không cần Google login mỗi request. **Anyone chỉ được gọi endpoint; dữ liệu vẫn cần HMAC và quyền nghiệp vụ.** Secret không ở browser/URL/log. Public endpoint vẫn có thể bị gọi rác làm tiêu quota; HMAC không chống DoS trước khi script chạy. Không mở JSONP/CORS đọc trực tiếp.

ContentService redirect sang script.googleusercontent.com: client kiểm host, đổi sang GET để lấy response, không forward body/headers có secret. JSON response ký HMAC, adapter chuyển status nghiệp vụ. Không dựa vào custom HTTP header/ETag trên Google; revision là chuỗi `r<global revision>` trong JSON. Protocol mới thử nghiệm riêng, không drop-in replacement cho /api/notes.

### Commit và lỗi ghi một phần

1. Xác minh HMAC/time window (5 phút).
2. Lấy ScriptLock (chờ tối đa 1,5 giây), dùng cho cả đọc và ghi.
3. Đọc HEAD ở Script Properties và snapshot được trỏ tới; xác minh SHA256, revision, schema, folder membership.
4. Kiểm capability/quyền, expected revision, idempotency trong cùng khóa.
5. Tạo state mới gồm notes, index, shares và receipt. Kiểm kích thước response trước khi ghi.
6. Tạo file JSON snapshot bất biến mới; đọc lại và kiểm hash.
7. Cập nhật **một** property HEAD rồi đọc lại. Chỉ sau đó trả thành công.

File tạo được nhưng HEAD chưa đổi là orphan, không tự nhận làm dữ liệu thật. HEAD đã đổi mà response mất: retry cùng requestId/payload/issuedAt nhận receipt, không ghi lần hai. HEAD thiếu/hỏng hoặc hash sai: báo lỗi, không tự tạo store rỗng/rollback sang snapshot cũ. Không tự phục hồi ACL từ bản cũ vì sẽ hồi sinh link đã thu hồi.

PropertiesService không được Google mô tả như database giao dịch có CAS/durability SLA. Khóa chỉ có hiệu lực trong **cùng một script project**; không cho project thứ hai, người hoặc công cụ khác sửa HEAD/snapshot. Đây vẫn là rủi ro phải đánh giá thực tế, chưa thể tuyên bố độ an toàn tương đương Blob conditional write.

### Schema và giới hạn có chủ ý

Snapshot `{schema:1,revision,notes:{id:Note},shares:{id:Capability},index:[Preview],receipts:{requestId:Receipt}}`.

Note giữ checklist/folder/pinned, history <=5. Folder/workspace giữ ngữ nghĩa main theo tên, chưa có folder rỗng hoặc ACL thành viên Google. Capability có type note/folder, tokenHash, revoked, createdAt; không lưu secret raw. Adapter sinh capability qua HMAC theo requestId để retry tạo link có cùng kết quả. Đổi HMAC key không tự đổi/revoke link đang có; request tạo link đang chờ có thể không replay được qua lần đổi key, cần kết thúc trước khi rotate.

Receipt ràng buộc actor/op/payload/issuedAt, giữ >=24 giờ; key dùng lại với dữ liệu khác =>409; issuedAt quá 24 giờ =>400; tối đa 2.000 receipt đang giữ. Tái kiểm capability trước receipt để retry sau thu hồi vẫn bị chặn.

Giới hạn thử nghiệm: tối đa 500 Note tính cả tombstone; snapshot <=20 triệu byte; raw request <=3,1 triệu byte; signed response <=4 triệu byte; response quá lớn bị chặn trước commit. Giữ phần lớn giới hạn mỗi Note hiện có nhưng escaping/envelope/history có thể chạm trần response trước. Backup API lớn phải thay bằng tải file snapshot private trong Drive. Không có garbage collection tự động. Không coi đây là thiết kế cho toàn bộ dung lượng Notes hiện tại.

Index nhẹ trong response (preview <=180), nhưng Google vẫn đọc cả snapshot; list/search/write đều O(tổng dữ liệu); write còn tạo snapshot mới. Toàn bộ đọc/ghi tuần tự dưới khóa nên p95 và contention có thể không đạt. Đây là đánh đổi dễ kiểm toán cho prototype, không quảng cáo tốc độ ngang Keep.

## Trạng thái quyết định

**NO-GO chuyển production** cho đến khi có môi trường Google, kiểm chứng concurrency/crash/khôi phục/quota và benchmark qua Vercel. Không dựng migration thật ở giai đoạn này.

Nếu p95/đồng bộ/tin cậy/bảo mật không qua tiêu chí nghiệm thu, dừng nhánh Google; đối chiếu Cloudflare D1 và Firebase Firestore bằng audit pricing/quota hiện hành riêng. D1 cần kiểm tra transaction/conditional update và idempotency; Firestore cần kiểm tra transaction, offline sync, rules và quota/billing. Chưa có benchmark so sánh hay khuyến nghị chọn một trong hai; repo AGENTS hiện không thêm Firestore dependency và prototype tôn trọng điều đó.
