# Chung nguồn mật khẩu Homepage và Notes
Trạng thái **ĐÃ TRIỂN KHAI PRODUCTION**, ngày 26/10/2026 (Asia/Ho_Chi_Minh).

## Hành vi
Homepage là nơi duy nhất quản lý/đổi mật khẩu. Notes dùng mật khẩu Homepage hiện tại; NOTES_PASSWORD cũ không còn được dùng khi NOTES_AUTH_MODE=homepage-v1. Mỗi trang vẫn mở khóa riêng, không SSO. Session secret/cookie hai ứng dụng riêng biệt; không thay đổi mật khẩu hiện có.

Mỗi yêu cầu owner của Notes lấy password version trực tiếp từ Homepage, không cache version. Phiên cũ bị từ chối ở lần kiểm tra tiếp theo khi version đổi; không bảo đảm hủy yêu cầu đang xử lý trước thời điểm đổi mật khẩu. Dịch vụ lỗi thì đóng với 503, không fallback mật khẩu cũ. Link chia sẻ Notes và Code Inbox vẫn độc lập.

## Kỹ thuật
- Homepage: POST /api/auth/?service=notes, action version hoặc verify. Dùng lại API có sẵn để giữ trong giới hạn 12 Functions của Vercel Hobby.
- Chỉ xác thực service bằng NOTES_AUTH_SERVICE_KEY (sensitive, Production, hai project); key này khác session secrets và không đưa ra browser.
- Verify giữ limiter Supabase Homepage, nhận IP từ Notes server; Notes vẫn có limiter riêng. Không trả hash/salt/mật khẩu.
- Nguồn quản lý mật khẩu vẫn lib/password-store.js/portal-auth.json trên Koofr như trước.
- Notes: lib/shared-auth.mjs gọi URL HTTPS cố định, redirect:error, timeout; NOTES_AUTH_MODE=homepage-v1. URL cần dấu / sau auth để tránh redirect theo trailingSlash của Homepage.
- Bản nháp, nội dung, CAS/ACL/khóa Koofr không thay đổi. Không xóa secret Notes cũ; hiện để rollback có chủ đích, không phải fallback tự động.

## Bằng chứng
- Homepage PR #32; source cuối 737897f4d441e30004b64d972a7cafd0aeea3a40, deployment dpl_7uRsAYTHB3i578uiHMUYDMz9tqSD READY, alias homepage-nas.vercel.app.
- Notes PR #15 và sửa URL canonical; source 0c8c0761c2625ae2be747e448a7259f974dccb34, deployment dpl_EESNjsEpJkd2N7V45rkJ28mn3kwf READY, alias hunghvt-notes.vercel.app.
- Local Notes 139/139 tests PASS; thêm test service Homepage PASS. CI Homepage 40287406971 success; CI Notes 40287414406 Node/Chromium success trước sửa URL canonical (sửa URL đã chạy lại Node local).
- Live GET Notes auth 200/authenticated:false, KP-88a9862d: luồng này đã gọi và kiểm version nguồn Homepage thật trước khi kiểm cookie; chứng minh liên lạc server-to-server hoạt động.
- Sai mật khẩu, phiên được seal, đổi password version làm phiên cũ bị từ chối và lỗi authority/rate-limit đã kiểm thử fixture.
- Chưa nhập mật khẩu người dùng hoặc đổi mật khẩu thật trong phiên triển khai; không coi fixture là nghiệm thu đăng nhập/đổi pass trên iPad. Không thay/xóa Notes thật để thử.

## Xác nhận chủ hệ thống ngày 27/10/2026

Trong hội thoại vận hành, chủ hệ thống xác nhận mục nghiệm thu đăng nhập chung
Homepage/Notes và thu hồi phiên sau đổi mật khẩu là OK (“Xác nhận mục 2 ok”).
Đây là xác nhận người dùng, không phải một smoke test mới do AI đăng nhập hoặc
đổi mật khẩu thật. Không mở lại yêu cầu nghiệm thu này chỉ vì giới hạn của phiên
triển khai 26/10 bên dưới; giữ nguyên bằng chứng fixture và deployment theo ngày.
