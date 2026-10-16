# Vận hành tập trung Google cho Homepage — phạm vi thử nghiệm

Cập nhật theo yêu cầu 16/10/2026: thiết kế để AI tự kiểm tra/chẩn đoán qua GitHub sau cấu hình một lần; bao gồm báo cáo Homepage, không chỉ Notes. Đây là mở rộng kiến trúc trên PR thử nghiệm, chưa đổi nguồn production.

## Tình trạng Google

Người dùng xác nhận đã tạo project, nạp Core/Server, lưu manifest và khóa riêng; hàm initializeNotesPrototype báo Execution started 11:08:02 và Execution completed 11:08:10 (giờ Việt Nam). Đây là xác nhận chạy thành công từ người dùng, chưa phải benchmark backend hoặc kiểm chứng snapshot/hash/quyền độc lập. Kết nối Drive Primary tìm tên folder thử hai cách chưa trả kết quả; chưa suy đoán nguyên nhân hoặc tự tìm trong tài khoản khác.

Sau cập nhật Server.js, chạy **checkNotesPrototype** để đọc/verify HEAD và in metadata an toàn. Không chạy lại initializeNotesPrototype. Không thay Core, manifest hay khóa cho bản cập nhật logger. Chưa deploy /exec, chưa có secret ở GitHub, nên live operational probe hiện **skip**, không tính là healthy/pass Google thật.

## Những nguồn Homepage đã audit từ mã main

| Nguồn | Nơi tạo / định dạng hiện tại | Cách Homepage đọc | Phương án tiếp theo (chưa triển khai) |
| --- | --- | --- | --- |
| Camera/NAS, dung lượng root/vol1, RAM/swap | scripts/publish_status.py lấy các collector/cache hiện có; schema=1, updated_at, cam1/cam2/nas, health | content/site.json status_url → config.js → public/status.js; 5 phút/lượt khi trang mở | namespace nas-status; giữ schema và freshness. Không cài thêm dịch vụ/timer/collector trên NAS; nếu đổi nơi nhận chỉ đổi publisher hiện có sau phê duyệt |
| Bảo trì/retention | cùng snapshot NAS; có measured_at riêng | cùng thẻ camera, giữ thời gian kết quả riêng | cùng namespace nas-status; không suy từ thời điểm upload thành thời điểm bảo trì |
| Drive ↔ Koofr | repo my-backup-gdrive-koofr, bisync.yml → summary → publish_blob_report.py theo hồ sơ BACKUP-REPORTING | public Blob gdrive-backup-latest.json; schema_version=1, source=gdrive-koofr | namespace gdrive-koofr; publisher sau backup; lỗi báo cáo không đổi thành lỗi backup |
| Photos → Koofr | repo google-photos-koofr, daily.yml → health/summary → publish_blob_report.py theo hồ sơ BACKUP-REPORTING | public Blob gphotos-backup-latest.json; schema_version=1, source=gphotos-koofr | namespace gphotos-koofr; không gộp quarterly reconcile vào báo cáo daily |
| Chi tiêu | api/expenses.js ký action homepage_stats đến GAS hiện có; month/transactions | API có session, bí mật server-only | giữ nguyên project/contract. Sau này chỉ thêm health adapter độc lập, không nhập giao dịch vào hub báo cáo công khai |
| Gemini | api/chat.js dùng cùng EXPENSES_API_URL/SECRET, action homepage_chat | private POST, có kiểm nội dung | giữ nguyên; theo dõi lỗi mã hóa an toàn, không lưu prompt/response vào log chung |
| Notes/checklist/workspace/share | private Blob hiện tại; prototype GAS riêng | /api/notes và API chia sẻ hiện tại | tiếp tục prototype riêng; không chung file snapshot với các feed công khai |
| QR guides | content/guides.json + overrides private Blob qua api/guides.js | public static/QR; edit có session | không đổi đường dẫn QR, chưa chuyển overrides |
| Home-AI và shortcuts | liên kết | trình duyệt mở trực tiếp | không đưa vào backend mới |

Code của hai repo backup được mô tả trong hồ sơ của Homepage; chưa audit lại implementation HEAD của từng repo trong lượt này. Phải đối chiếu trước khi sửa publisher.

## Kiến trúc đề xuất cho báo cáo

Một registry trong GitHub quản lý version, namespace, schema, nguồn, freshness và nơi triển khai. Hai nhóm dữ liệu độc lập:

- Notes: project/folder/HEAD/khóa và ScriptLock riêng.
- Reporting: project/folder riêng; mỗi nguồn có credential publisher riêng, chỉ được ghi namespace của mình. Reader của Vercel có khóa read-only riêng. Publisher báo cáo không có quyền Notes. Tách project không tách quota tài khoản Google.

Mỗi nguồn giữ `{source, schemaVersion, generation, eventId, sourceRevision, measuredAt, receivedAt, payloadHash, payload}`. Đây là schema **đề xuất**, chưa có endpoint hỗ trợ.

Ingestion cần: HMAC kèm namespace, chống replay/idempotency, từ chối sourceRevision thấp hơn bản hiện hành, eventId dùng lại với nội dung khác =>409, schema allowlist và giới hạn kích thước. Đối với GitHub backup dùng generation/sourceRevision gắn workflow run/attempt, không dùng timestamp nhận để phân xử. Với NAS cần counter bền hoặc generation rõ khi reset, không coi clock NAS là bộ đếm revision. Thử out-of-order và retry trước rollout.

Read path đề xuất: Vercel public read adapter chỉ xuất allowlist số liệu, có cache TTL phù hợp; không trả HEAD/file ID/khóa/raw log. NAS mới hơn 15 phút vẫn theo UI hiện tại; báo cáo backup giữ thời gian hoàn tất thực, bổ sung freshness theo lịch daily thực tế sau audit. Cache không được cập nhật measuredAt hay giả số 0. Có last-known report, hiển thị dữ liệu cũ khi nguồn lỗi. Không lưu/copy Note vào cache công khai.

Không dùng redirect Apps Script trực tiếp từ browser, không public-share folder Drive. Không thay content/site.json hoặc public/status.js/backup-status.js cho đến khi thử nghiệm adapter và publisher đủ điều kiện.

## Logging đã triển khai cho prototype Notes

- `console.log` chỉ metadata allowlist, hiển thị trong Execution log và cơ chế Cloud Logging tùy cấu hình Google. GAS có logging; hai dòng Notice trước đó chỉ vì phiên bản đầu chưa emit application log.
- `NOTES_OPS_LOG` là journal bền qua các lần chạy trong Script Properties, tối đa **30 event** / **8.000 byte**; là vòng đệm, không phải lịch sử toàn bộ. `NOTES_LAST_ERROR` giữ lỗi gần nhất dù success đẩy lỗi cũ khỏi vòng đệm.
- Signed request sau khi lấy khóa ghi STARTED trước đọc/ghi dữ liệu; ghi completion/error ở finally. Một lần gọi có thể tạo 2 event. STARTED chưa có completion là dấu vết điều tra, không kết luận chắc chắn server chưa commit.
- Không lưu title/text/checklist/history, note ID/path, request body, token/hash token, HMAC, account/email, raw error/stack. Mỗi invocation có reference `GAS-xxxxxxxx` riêng, trả trong signed response observability. Adapter Vercel có X-Prototype-Request và X-Prototype-Log.
- Journal độc lập HEAD/Drive, owner signed op `logs` đọc được khi snapshot hỏng; `health` xác minh hash/HEAD và trả build/revision/count. Share không được dùng health/logs.
- Nếu lỗi ghi log: ghi console best-effort và trả observability.persisted=false; không biến một save đã commit thành save thất bại. Nếu quota Properties cạn thì có thể mất cả journal; không tuyên bố log là tuyệt đối đầy đủ. Nếu process bị kill trước STARTED, không có breadcrumb; Google executions vẫn cần để điều tra.
- Request chưa xác thực hoặc BUSY không ghi Properties để tránh tăng quota và giành lock; console best-effort vẫn có status/stage. Logger không chờ khóa riêng và không đọc toàn bộ Note.
- Thêm tối đa 2 lần ghi property/journal cho mỗi request đã xác thực có lock và 1 lần LAST_ERROR khi lỗi; tính vào quota user, cần đo thật. Không mở trigger hoặc ghi file Drive chỉ để log mỗi lượt đọc.

Exception logging manifest vẫn NONE để tránh raw unhandled error tự động lộ chi tiết. Logger chủ động ghi JSON metadata. Nếu chuyển sang Cloud Error Reporting, review scrubber và standard Cloud project riêng trước. Không bật billing trong lượt này.

## Tự vận hành và quyền một lần

Đã chuẩn bị `scripts/operations.mjs` và job operational-probe trong workflow prototype. Khi nhánh được push và mô phỏng qua, job đọc **health + logs** bằng signed request, xuất artifact metadata đã lọc, giữ 7 ngày. Không truy xuất Note body hay tự tạo/delete dữ liệu. Thiếu secrets =>skip rõ ràng, không giả báo đạt. Không chạy từ pull_request/fork và không tạo lịch polling.

Sau khi deploy Google thử, chủ tài khoản thêm **NOTES_GAS_URL** và **NOTES_GAS_HMAC_KEY** vào GitHub Repository Secrets (Settings → Secrets and variables → Actions). Không gửi khóa trong chat. Workflow/runtime có thể dùng secret, AI đọc kết quả/logs an toàn, không cần biết giá trị. Khóa hiện là quyền owner của prototype; người sửa workflow có thể dùng quyền đó, nên chỉ chạy nhánh thử đáng tin và không cấp secret qua pull_request/fork. Để thử tay từ máy có env: `node experiments/notes-gas/scripts/operations.mjs`.

Workflow và script đã được viết/kiểm thử mô phỏng; Google live check chưa chạy. Kết nối hiện tại có công cụ đọc workflows/logs/artifacts và push GitHub, chưa có callable dispatch API, nên chưa hứa điều khiển mọi workflow bằng connector. Push nhánh thử sau thay đổi đã review sẽ tự chạy job probe khi secrets đã có.

**Tự cập nhật source Google chưa được cấu hình.** Tự quản lý runtime bằng HMAC khác với quyền thay source/deployment. Triển khai mã từ GitHub cần Apps Script API/clasp OAuth hoặc connector có Projects/Deployments scopes. Refresh token có quyền sửa scripts phải lưu riêng trong GitHub Environment Secrets, giới hạn script ID và nhánh, chạy test trước deploy version, verify readback; không thể giả lấy quyền đó từ Drive connector. Chưa tạo OAuth client, chưa nhận credential, chưa bật API hoặc cài tự động deploy. Trên iPad cần hướng dẫn consent từng bước khi chọn đường cấp quyền; không yêu cầu cài PowerShell/Node.

Không triển khai cơ chế remote eval/tự tải và chạy mã từ GitHub chỉ để bỏ qua OAuth. Không sửa project chi tiêu/Gemini để làm cầu cấp quyền. Trước mắt chỉ cần một lần cập nhật Server.gs có logger rồi chạy checkNotesPrototype, sau đó deploy /exec thử.

Nguồn chính thức:
- https://developers.google.com/apps-script/guides/logging
- https://developers.google.com/apps-script/guides/clasp
- https://developers.google.com/apps-script/guides/services/quotas

## Các mốc còn lại

1. Cập nhật Server.gs và xác minh health trên project hiện có (không init lại).
2. Deploy Google prototype + cấu hình secrets GitHub một lần; probe đọc-only và live benchmark 100 synthetic Notes.
3. Xác minh backup/recovery và hoạt động PC/iPad/điện thoại; nếu không đạt, đối chiếu D1/Firestore.
4. Sau khi quyết định kiến trúc chung, viết báo cáo backend/publisher thử riêng và kiểm schema/out-of-order/đồng bộ/cache/quota. Chưa đổi NAS services, backup workflows hoặc production source.
5. Thiết kế OAuth deployment từ GitHub riêng. Mọi cutover/migration/dọn Blob vẫn cần phê duyệt mới.

### Bổ sung: yêu cầu cấp quyền một lần

Đã viết updater REST và job source-update (mặc định tắt) cùng [hướng dẫn OAuth trên iPad](NOTES-GAS-ONE-TIME-AUTH.md). Thay vì chép Server.gs tiếp, ưu tiên cấu hình OAuth này rồi pipeline tự đồng bộ. Phần trên mô tả trạng thái trước bổ sung; hiện code updater đã có nhưng credential/live deployment vẫn chưa thiết lập. Mọi hứa hẹn tự deploy chỉ có hiệu lực sau rehearsal thành công.
