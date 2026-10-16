# Bằng chứng kiểm thử Notes Google prototype

Ngày 16/10/2026. Base main: `a09b63b2c520312a70c8e13b645537f62fb7711a`.

## Kết quả cục bộ

| Hạng mục | Kết quả |
| --- | --- |
| JS hiện có, sau build | `npm test`: 55/55 pass |
| Python hiện có | `python3 -m unittest discover -s tests -p 'test_*.py'`: 12/12 pass |
| Syntax và liên kết | Tất cả JS/MJS parse được; HTML nội bộ không có resource hỏng |
| Build | `python3 scripts/build.py`: 6 guides, QR enabled |
| Prototype | `node --test experiments/notes-gas/test/*.test.mjs`: 18/18 pass (mô phỏng, gồm logging/health/operations) |
| Google triển khai | CHƯA — cần tạo project và consent Google |
| Benchmark Google thật | CHƯA — không có p50/p95 mạng được xác minh |
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
