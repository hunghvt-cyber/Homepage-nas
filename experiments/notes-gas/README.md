# Notes: Apps Script + Drive prototype

**Trạng thái: thử nghiệm, CHƯA đủ điều kiện chuyển production.** Không migration dữ liệu thật. Không thay hoặc xóa Blob. Mã này không kết nối chi tiêu/Gemini, không dùng NAS.

- [Quản lý chung Homepage và logging](../../docs/NOTES-GAS-HOMEPAGE-OPERATIONS.md)
- [Audit, quota và quyết định kiến trúc](../../docs/NOTES-GAS-AUDIT-20261016.md)
- [Cấp quyền, triển khai thử, backup và rollback](../../docs/NOTES-GAS-RUNBOOK.md)
- [Kết quả kiểm thử và điều kiện nghiệm thu](../../docs/NOTES-GAS-VALIDATION.md)

## Tệp và cách chạy

| Tệp | Vai trò |
| --- | --- |
| `apps-script/Core.js` | State machine/schema/quyền/revision/index/idempotency |
| `apps-script/Server.js` | HMAC, khóa, đọc/ghi snapshot Drive, bootstrap thủ công |
| `apps-script/appsscript.json` | V8 và scope Drive cho project mới |
| `adapter.mjs` | Node 24 client, timeout/retry/redirect, xác minh response |
| `vercel-api/notes-prototype.mjs` | Template API có guard production; ngoài `/api` |
| `test/` | Chạy cùng mã Apps Script trong VM, Drive/Properties/Lock giả lập |
| `scripts/benchmark.mjs` | Integration/benchmark Google thật, chỉ chạy opt-in |
| `.env.example` | Tên biến, không chứa secret |

```sh
npm ci --ignore-scripts
node --test experiments/notes-gas/test/*.test.mjs
```

Không cần Google hoặc secrets để chạy mô phỏng. CI không chạy benchmark thật. Không thêm script này vào Apps Script chi tiêu/Gemini.

## Protocol

Vercel xác minh session chủ sở hữu hoặc gửi `actor: share` với capability. Không tin actor do browser gửi. Mọi operation đi qua POST có HMAC SHA-256; không có API trực tiếp cho browser trên Google.

```js
{
  requestId: 'UUID-stable-across-retries',
  issuedAt: 1792110000000, // giữ nguyên khi retry; hạn 24 giờ
  actor: 'owner', // hoặc share; do adapter xác định
  op: 'save',
  payload: {id: 'UUID', title: 'Ví dụ', text: 'Unicode 🧡', folder: '', checklist: [], revision: 'r1'}
}
```

`adapter.mjs` bọc request thành `{v:1, sentAt, request:<JSON string>, signature}`. Ký chính xác `request\n<sentAt>\n<request>` bằng **chuỗi khóa hex 64 ký tự** (không decode hex thành bytes). `sentAt` có thể mới ở mỗi retry; `request` phải giống hệt. Response `{body:<JSON string>, signature}` ký `response\n<requestId>\n<body>`. Lỗi nghiệp vụ nằm trong body với `status`; Google ContentService không được coi là nguồn HTTP status/ETag.

| Operation | Payload chính | Quyền |
| --- | --- | --- |
| `save` | id, title, text, checklist, folder, pinned, revision khi cập nhật | owner; link Note sửa đúng Note; link folder tạo/sửa trong folder |
| `get` | id, revision tùy chọn | owner hoặc link trong scope |
| `list` | folder tùy chọn, known tùy chọn | owner hoặc link folder |
| `search` | query, folder/known tùy chọn | như list; tìm cả toàn văn/checklist |
| `delete` | id, revision bắt buộc | owner; soft-delete |
| `restore` | id, revision, historyIndex | owner; tạo revision mới từ lịch sử |
| `folderDelete` | folder, deleteNotes, revision của toàn store | owner; phải thu hồi link folder trước |
| `shareCreate` | noteId hoặc folder; adapter điền shareId/tokenHash | owner; link xem/sửa không hết hạn |
| `shareRevoke` | shareId | owner |
| `shareList` | noteId hoặc folder | owner; chỉ metadata link |
| `health` / `logs` | rỗng | owner; health kiểm snapshot, logs đọc journal độc lập HEAD |
| `backup` | rỗng | owner; chỉ dữ liệu thử, có giới hạn response |

Mọi lần gọi có requestId UUID. Mọi mutation còn cần issuedAt. Khi tạo Note mới, adapter dùng requestId làm id nếu thiếu; idempotency mới nghĩa là thao tác mới. Client phải giữ requestId + issuedAt + payload đến khi biết kết quả; sau 24 giờ tải lại trước khi quyết định, không tự phát lại thành thao tác mới.
