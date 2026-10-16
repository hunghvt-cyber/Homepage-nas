# Cấp quyền một lần trên iPad, tự cập nhật Google từ GitHub

Yêu cầu người dùng ngày 16/10/2026: không tiếp tục yêu cầu chép source Apps Script cho mỗi lần sửa. Chuyển sang thiết lập OAuth deployment một lần. Chưa có credential hoặc quyền live cho updater; mã đã chuẩn bị, mặc định tắt, không thay production.

## Phương án đã chọn

GitHub Actions → OAuth refresh token riêng → Apps Script REST API: đọc project/source, updateContent, đọc lại, versions.create, deployments.update, đọc lại và signed health. Dùng Node built-in fetch, không cần cài công cụ trên iPad, không phụ thuộc NAS hoặc token lấy qua chat. Google chính thức cũng hướng dẫn CI/CD qua clasp; gọi REST trực tiếp cho phép kiểm soát project/source/rollback rõ hơn và không cần ghi token xuống .clasprc.json.

Kết nối Google Drive hiện tại không có scope script.projects/script.deployments. Đã tìm plugin Apps Script, chưa thấy plugin phù hợp; không yêu cầu cài Gmail/Calendar vì không giải quyết quyền deploy. Thiết lập dưới đây có thể thực hiện bằng Safari, qua giao diện Google/GitHub. Đây là cấu hình ban đầu nhiều bước, không phải lời hứa một lần bấm là xong.

## Bước 1 — Bật Apps Script API, lấy script ID

1. Mở https://script.google.com/home/usersettings → **Google Apps Script API** → bật **On** cho đúng tài khoản sở hữu project thử.
2. Mở project Homepage Notes Prototype → Project Settings → Script ID. Lưu/chia sẻ ID hoặc URL editor để chỉ định đúng target. Script ID không phải khóa HMAC/OAuth credential.

Bật API chỉ cho phép các ứng dụng có OAuth grant thích hợp gọi API; không tự cấp quyền cho ChatGPT/GitHub. Không phải bước cho phép chuyển production.

## Bước 2 — OAuth client của chính chủ tài khoản

1. Mở https://console.cloud.google.com/ bằng Safari. Tạo/chọn **Cloud project riêng** tên Homepage Automation; không đổi project chi tiêu/Gemini, không bật billing.
2. APIs & Services → Library → **Google Apps Script API** → Enable trong Cloud project này.
3. Google Auth Platform/OAuth consent screen: cấu hình tên Homepage Automation, support/contact email của mình; audience phù hợp tài khoản (Gmail cá nhân thường External). Chỉ tài khoản của mình dùng.
4. Scopes cho pipeline: `https://www.googleapis.com/auth/script.projects` và `https://www.googleapis.com/auth/script.deployments`. Không xin Gmail/Sheets/Cloud Platform scopes. Runtime Drive grant của script hiện có tách riêng, không chép scope deployment vào appsscript.json.
5. Với External: cấu hình publishing status phù hợp để vận hành lâu dài, **không để Testing** nếu muốn refresh token không tự hết sau 7 ngày. In production trên OAuth consent screen là trạng thái app cấp quyền, KHÔNG phải chuyển Notes production. Nếu Google yêu cầu bước verification/policy không thể hoàn thành, dừng và đối chiếu, không giả tuyên bố token bền lâu.
6. Clients/Credentials → Create OAuth client ID → **Web application** → tên Homepage GitHub Automation. Authorized redirect URI chính xác: `https://developers.google.com/oauthplayground` (không thêm slash cuối).
7. Giữ Client ID/Client secret riêng. Không paste vào chat, PR, source hoặc ảnh gửi AI.

Scopes OAuth này có quyền với các Apps Script project mà tài khoản được phép sửa, không được Google giới hạn cứng theo một script ID. Guard trong workflow chỉ là hàng rào ứng dụng. Chỉ lưu trong repo riêng tư đáng tin; người sửa workflow có thể khai thác quyền token. Dùng tài khoản triển khai ít quyền hơn nếu cần thu hẹp blast radius, nhưng chưa tự tạo/chia sẻ tài khoản trong lượt này.

## Bước 3 — Consent bằng OAuth Playground chính thức

1. Mở https://developers.google.com/oauthplayground/ trên Safari.
2. Bấm bánh răng Configuration → **Use your own OAuth credentials**, nhập Client ID/secret vừa tạo. Giữ endpoints Google, flow Server-side, Access type **Offline**, Force prompt **Consent Screen**.
3. Step 1 nhập đúng hai scopes ở bước 2, cách nhau bằng dấu cách → Authorize APIs → chọn tài khoản chủ project → xem và cấp đúng quyền.
4. Step 2 → Exchange authorization code for tokens. Chép **refresh token** vào nơi lưu riêng để đưa vào GitHub Secret. Không dùng access token ngắn hạn thay cho refresh token.
5. Không bật tùy chọn tạo link kèm OAuth credentials/tokens; không gửi URL có token/code cho AI. Không dùng OAuth client mặc định Playground, vì Playground công bố tự revoke refresh token sau 24 giờ nếu không dùng client riêng.

Đây là Google OAuth Playground, không phải trang ChatGPT. Credential được gửi đến server Google để trao đổi token theo cơ chế của công cụ này, không tuyên bố chỉ chạy local. Không gửi refresh token/mật khẩu/OAuth secret cho AI.

## Bước 4 — Lưu cấu hình GitHub một lần

Trong repo Homepage-nas, Settings → Secrets and variables → Actions:

| Loại | Tên | Giá trị |
| --- | --- | --- |
| Secret | GAS_OAUTH_CLIENT_ID | client ID của mình |
| Secret | GAS_OAUTH_CLIENT_SECRET | client secret |
| Secret | GAS_OAUTH_REFRESH_TOKEN | refresh token vừa cấp |
| Variable | NOTES_GAS_SCRIPT_ID | Script ID project Homepage Notes Prototype |
| Variable | NOTES_GAS_AUTODEPLOY | để false trong khi chưa xác minh cấu hình; chuyển true khi sẵn sàng thử source-sync |
| Variable | NOTES_GAS_DEPLOYMENT_ID | chưa có thì để trống; updater chỉ đồng bộ source, chưa đổi deployment |
| Secret | NOTES_GAS_URL | URL /exec sau deploy đầu tiên |
| Secret | NOTES_GAS_HMAC_KEY | khóa runtime đã lưu trong Script Properties, không phải OAuth secret |

Sau khi các secret/ID đúng và bật AUTODEPLOY=true, push nhánh prototype chạy updater sau simulation. Không cần merge main để kích hoạt. AI có thể push thay đổi được phép, đọc Actions/metadata; không cần biết giá trị các secret.

Đợt đầu chưa có /exec: updater chỉ đồng bộ source và verify, không tạo/sửa deployment; rồi chủ project làm consent/deploy web app đầu tiên qua Google UI, lưu deployment ID/URL như trên. Đây là phần cấu hình ban đầu, không lặp mỗi lần cập nhật. Không đổi tên project khỏi **Homepage Notes Prototype**, vì updater đối chiếu cả title lẫn script ID.

## Hành vi updater đã lập trình

- Chỉ chạy khi enabled=true, đúng nhánh prototype, sau tests pass. Không chạy main hoặc pull_request. Chỉ nhận một script ID cố định từ Variables; title phải khớp.
- Upload đủ Core/Server/appsscript. updateContent của Google xóa/ghi lại toàn bộ file source, nên nếu remote có file lạ thì dừng trước ghi, tránh xóa nhầm. Remote source đọc lại trước update để phát hiện thay đổi chen ngang; chưa có CAS nguyên tử ở API này, nên không sửa tay editor cùng lúc pipeline.
- Không mở rộng runtime scopes khỏi Drive scope đã review. Không sửa Script Properties/HEAD/folder/Note data, không gọi init/migration.
- Sau source PUT đọc lại hash; khi PUT timeout, đọc lại để phân giải trước tiếp tục. Chưa có deployment ID thì dừng ở source_verified_deployment_not_configured.
- Có deployment ID thì đọc bản cũ, tạo immutable version, kiểm hash của version, kiểm version cũ chưa bị người khác đổi, update đúng deployment ID, readback và health signed. Không đổi URL /exec nếu chỉ update đúng deployment hiện hữu.
- Nếu update timeout/health lỗi: đọc version thực tế; chỉ rollback khi nó chính là version vừa tạo, rồi đọc lại xác minh. Nếu người khác đã đổi version thì không ghi đè; báo blocked_external_change/uncertain.
- Rollback này là code deployment, không phải rollback dữ liệu Notes. HEAD source có thể đã là code mới dù deployment phục vụ code cũ; không tự ghi đè editor/source cũ khi thiếu bằng chứng concurrent update. Nếu có triggers thì chúng dùng HEAD, do đó updater này chỉ cho prototype không có trigger; không áp dụng cho bot chi tiêu/Gemini.
- Giữ concurrency group để Actions không deploy chen nhau; không thể khóa các công cụ ngoài GitHub. Không tự xóa version cũ để vượt quota 200 versions/script.
- Artifact chỉ hash/phase/version/rollback, không token, API body, raw remote source hay dữ liệu Notes. Không upload credentials dưới dạng file.

## Giới hạn lời hứa “cấp quyền một lần”

Cập nhật bình thường trong cùng scopes dùng refresh token tự lấy access token, không cần người dùng đăng nhập/lưu file lại. Nếu Google thu hồi quyền, token không dùng 6 tháng, người dùng revoke, admin policy hoặc runtime cần scope mới thì có thể phải cấp lại. Không cam kết vĩnh viễn không consent lại. Pipeline không tự mở rộng quyền hoặc vượt bước phê duyệt production/migration ban đầu.

Chưa chạy OAuth/live deploy: không coi unit/mock tests là chứng minh Google deployment đã hoạt động. Cần thử source readback trên project rỗng, initial deploy, sau đó hai lần update cùng URL + health và rehearsal rollback synthetic.

Nguồn chính thức:
- https://developers.google.com/apps-script/api/reference/rest/v1/projects/updateContent
- https://developers.google.com/apps-script/api/reference/rest/v1/projects.versions/create
- https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments/update
- https://developers.google.com/apps-script/guides/clasp
- https://developers.google.com/oauthplayground/
- https://developers.google.com/identity/protocols/oauth2#expiration
