# Bằng chứng kiểm thử Notes Google prototype

Ngày 16/10/2026. Base main: `a09b63b2c520312a70c8e13b645537f62fb7711a`.

**Trạng thái mới nhất (16/10,17:42 VN):**47/47 test mô phỏng pass, gồm mốc
100/500 Notes. Google version11/buildv6 đã tự cập nhật. Per-note bodies + atomic
manifest đã xác minh live CAS cùng Note, giữ thay đổi khác Note, replay idempotent,
workspace share/revoke. Nhưng timeout liên tiếp làm dừng trước history/delete/
folder/restore và trước seed100; chưa có benchmark100 Notes cho biến thể này.
Read-only đối soát sau đó pass: kho legacy119/100; kho per-note11/2,11 receipts,
share revoked bị từ chối, journal30 events. Lượt đối soát vẫn có một timeout30s
trước retry thành công. Notes production vẫn NO-GO.
Chi tiết: [NOTES-GAS-PER-NOTE-20261016.md](NOTES-GAS-PER-NOTE-20261016.md).

Lượt snapshot/cache/pool trước đó có100 Notes thật và cache list p50
1.694→1.127ms; pool save p50 4.128→6.297ms bị loại khỏi optimized mặc định:
[NOTES-GAS-FINAL-TRIAL-20261016.md](NOTES-GAS-FINAL-TRIAL-20261016.md).
Các bảng/ghi chú bên dưới là lịch sử, không thay thế kết luận mới nhất.

## Kết quả cục bộ

| Hạng mục | Kết quả |
| --- | --- |
| JS hiện có, sau build | `npm test`: 55/55 pass |
| Python hiện có | `python3 -m unittest discover -s tests -p 'test_*.py'`: 12/12 pass |
| Syntax và liên kết | Tất cả JS/MJS parse được; HTML nội bộ không có resource hỏng |
| Build | `python3 scripts/build.py`: 6 guides, QR enabled |
| Prototype | `node --test experiments/notes-gas/test/*.test.mjs`: 30/30 pass (mô phỏng, gồm logging/health/operations và source/deployment updater) |
| Google triển khai | Đã xác minh endpoint, tự cập nhật version 5 và signed health/log |
| Benchmark Google thật | FAIL một phần: 9 save xác nhận, p50 7.535 ms, p95 8.929 ms; lần 10 timeout, chưa đủ 100 Note |
| Vercel Preview end-to-end | CHƯA — adapter hiện là template không deploy |
| UI PC/iPad/điện thoại | CHƯA nối prototype; production UI giữ nguyên |
| Private Blob Notes | CHƯA xác minh độc lập; không kết luận khóa/mất dữ liệu |

Test mô phỏng dùng cùng `Core.js` và `Server.js`, chạy trong Node VM với Drive/Properties/Lock/Utilities giả lập. Không dùng kết quả ~1 giây của test suite để quảng cáo backend nhanh.

Các tình huống đã lập trình: 100 Note giả Unicode; CRUD/index/delta/tìm toàn văn; checklist/history restore; hai revision cũ/mới, conditional delete; note-share scope/không lộ history; folder workspace tạo/sửa và scope; revoke/rotate; chặn retry sau revoke; bulk folder precondition; giới hạn input; HMAC/time window; HEAD thiếu/hỏng; khóa bận; crash lúc tạo file/trước cập nhật HEAD/sau cập nhật HEAD; mất response sau commit; retry cùng request, key trùng payload khác; Google redirect đổi GET; chặn redirect lạ/login HTML/response giả; timeout và BUSY retry; guard production/CSRF/session ở template.

Mô phỏng sequential stale writes không chứng minh khóa phân tán Google thật. Live benchmark có Promise.allSettled hai request cùng revision và yêu cầu đúng một thành công; vẫn cần chạy thật, lặp nhiều lượt và kiểm tra nội dung server sau lỗi. Network-loss mock/response-discard khác lỗi mạng thật trong Drive commit.

## Điều kiện tiếp tục thử, chưa phải phê duyệt production

Ngưỡng sau là đề xuất để quyết định sau benchmark, chưa phải số đo:

- Trên ít nhất 100 Note nhỏ và bộ Note gần giới hạn: không mất thay đổi, duplicate, mất checklist hoặc hồi sinh link đã thu hồi.
- Repeated concurrency: một revision chỉ cho đúng một người thắng; người thua 409, giữ bản nháp; thử cả revoke ↔ save, folder move ↔ workspace edit.
- p95 list warm mục tiêu <=2 giây, detail <=2 giây, save <=3 giây qua Vercel ở điều kiện mạng thực tế đại ca dùng; cold ghi riêng, tối thiểu 20 sample/loại sau warm-up và nhiều thời điểm. Chậm hơn phải trình số liệu, không gắn nhãn đạt.
- Tỷ lệ lỗi ngoài lỗi cố ý: mục tiêu 0 trong rehearsal nhỏ; cần soak test nhiều ngày trước bất kỳ cutover. Không có sample không tính là 0 lỗi.
- Thử khôi phục từ backup độc lập, HEAD mất/hỏng, permission loss/quota, timeout; giữ ACL thu hồi và monotonic revision. Full-store recovery chưa hoàn thiện =>NO-GO.
- Kiểm tra lưu lượng Notes không ảnh hưởng quota/account của chi tiêu/Gemini. Không chạy stress test trên tài khoản đó khi chưa có lịch thử phù hợp.
- Đánh giá scope full Drive, quota DoS public endpoint, tốc độ snapshot và dung lượng retention; chưa có GC hoặc vận hành backup tự động =>NO-GO dài hạn.
- Xác nhận lại quota/pricing ngày triển khai. Không cam kết Google không ngừng dịch vụ hoặc miễn phí mãi.

Nếu không đạt, giữ nhánh Google làm bằng chứng và đánh giá D1/Firestore theo cùng workload và điều kiện bảo toàn dữ liệu. Không tự chuyển provider production.

Bổ sung: journal giới hạn 30 event/8.000 byte; không lộ Note/secret; log failure không đổi kết quả commit; log vẫn đọc được khi HEAD hỏng; share bị chặn ops; auth/BUSY không flood Properties; editor check chạy lặp không đổi HEAD; operations tiếp tục lấy log khi health lỗi và lọc output. Job Google operational-probe thiếu secrets chỉ SKIP, không phải live pass. Google init do người dùng xác nhận, chưa có độc lập health/hash readback.

Updater: thêm 6 test mô phỏng cho enable/branch/target guard, exact source replace + readback/version/deploy, chặn wrong project/extra file/concurrent edit, rollback khi health fail hoặc update timeout đã commit, source-only và chặn scope expansion, OAuth error không lộ token. Chưa OAuth/live source sync hoặc deploy Google.

Live OAuth source sync rehearsal: first run 38869304653 obtained access and read the target project, then correctly blocked TARGET_MISMATCH before source writes. Diagnostic run 38869465990 confirmed exact user-supplied Script ID and title with four leading spaces. Title comparison now trims only whitespace; Script ID and substantive title guard remain. No need to rename the project or reauthorize OAuth. Final source readback result recorded separately after retry.

## Live source management verified — 16/10/2026 14:49 VN

Workflow https://github.com/hunghvt-cyber/Homepage-nas/actions/runs/38869637124 completed simulation and source-update successfully. Authenticated Google metadata matched the exact Script ID supplied by the owner; leading title whitespace was normalized. Source was uploaded and read back with canonical source hash `17a6ee85ca4dbd1937b48f9dd5eeee905276c62ed0ab49ea2a36e989e08b2559`.

Result phase: `source_verified_deployment_not_configured`, sourceUpdated=true, deployed=false. This is real Google OAuth/source read-write evidence, not a mock. No Script Properties, Notes Drive snapshots or production Blob were changed by source sync. Runtime web app deployment, health, CRUD benchmark and recovery are still unverified. The operational-probe job was green because runtime URL/key were absent and its script explicitly skipped; it is NOT evidence of live backend health.

The three OAuth GitHub secrets are confirmed usable without revealing their values. Runtime HMAC secret is separate: owner must copy the existing Apps Script NOTES_HMAC_KEY into GitHub Secret NOTES_GAS_HMAC_KEY, not into chat. This is the remaining credential setup before live endpoint tests; no need to reauthorize OAuth or paste source files again.

### 2026-10-16 15:07 ICT — endpoint bootstrap blocked safely

Commit `12d37355879a21b67261dedc3adfb4431071117d`, workflow
https://github.com/hunghvt-cyber/Homepage-nas/actions/runs/38871589532:
29 simulated tests passed. Source-update failed with `RUNTIME_KEY_REQUIRED` before
OAuth or Google mutations because Actions resolved `NOTES_GAS_HMAC_KEY` to empty.
No endpoint was created and no real benchmark ran. User must add the existing GAS
runtime key as a repository **Actions secret**, not a variable or another GAS
Script Property. No credential value was read or disclosed.

### 2026-10-16 15:19 ICT — real endpoint and automatic update verified

Runtime secret is now available to Actions (masked, never read by the agent).
Retry of https://github.com/hunghvt-cyber/Homepage-nas/actions/runs/38871725839
created a version-1 managed web app and verified its signed health response.
Deployment ID:
`AKfycbwnIO4-cED9dRdNH0ik4FR9os_9kM4XDXqaNdn0iorb5JoiNRIg8dgp0fWEJYurLWAwPA`.

Follow-up update rehearsals exposed delayed deployment readback and a timed-out
Google API request. Immediate readback was insufficient: an apparent old version
was followed by the new version on a subsequent run. The updater now polls only
old-to-desired convergence, refuses unexpected versions, allows 60 seconds per
management API request, and retains fixed diagnostic codes. No Notes state was
changed by these deployment operations. This is evidence of management-plane
latency, not a measured Notes write latency.

Commit `d861db2566ec1bc28f3cb29e678092bb6e80fd6a`, workflow
https://github.com/hunghvt-cyber/Homepage-nas/actions/runs/38872811251:
source/deployment job verified version 5 from previous version 4, same endpoint,
canonical source hash unchanged. Separate signed health AND durable journal
inspection passed: healthy=true, readVerified=true, revision=0, activeNotes=0,
journalAvailable=true, errors=[]. Simulation: 30 tests. Synthetic 100-Note live
benchmark was started in this run; its result is recorded separately when known.
This is not approval to migrate Notes, modify reports, merge main or change
production. Initial runtime credential setup is complete; routine source/version
updates now use automatic OAuth refresh and the pinned deployment ID.

### Live benchmark result — NO-GO for Notes cutover

Completed 2026-10-16 15:20:49 ICT. Persisted evidence:
`experiments/notes-gas/results/google-live-20261016.json`.
The same workflow's benchmark failed after 9 confirmed saves out of 10 attempted
saves, before reaching the required 100 synthetic Notes. Empty-store list: one
sample, 4,896 ms (not a statistically useful list p95). Successful save sample:
n=9, p50 7,535 ms, p95 8,929 ms. Tenth save failed with NETWORK_OR_TIMEOUT/503
after 24,292 ms including adapter retries. The failed request may have committed;
these numbers do not prove exactly nine records exist. Preserve the synthetic
store and inspect metadata; do not reinitialize, delete snapshots or replay a
fresh request with a different ID to resolve an ambiguous write.

Measurement path: GitHub-hosted runner -> signed Node adapter -> GAS web app ->
Drive. This is real Google performance, NOT a Vercel/iPad end-to-end benchmark.
There was no attempt to tune away failures or increase runtime timeouts simply
to label this run passed. Live checklist/workspace/sharing/concurrency/recovery
stages were not reached. Those capabilities remain covered by simulation only.
The adapter timeout does not cancel a server-side Drive commit. The next trial
must persist request IDs/checkpoints if resumability is required.

Decision: stop Google Notes rollout; no production/migration approval. This
single partial sample cannot characterize all GAS implementations, but this
snapshot prototype fails the project's responsiveness and completion criteria.
Runtime access and automatic deployment succeeded; suitability of GAS as the
Notes database did not. Reports/expenses/Gemini were not changed.
