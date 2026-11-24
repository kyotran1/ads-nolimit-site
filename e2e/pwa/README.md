# Kiểm thử đầu-cuối cho PWA (Playwright, tài khoản giả, emulator Firestore)

Không tạo tài khoản thật, không đụng dữ liệu thật. Cần `npm run build` trước.

1. Phục vụ bản build: `e2e/pwa/serve.sh 4330 <đường dẫn>/dist` (sửa đường dẫn log trong `serve.sh` nếu thư mục tạm khác).
2. Nền PWA (manifest, service worker, trang không có mạng): `node e2e/pwa/e2e-nen.cjs`
   — đầu tệp có cổng, thư mục `dist` và thư mục ảnh viết cứng: sửa cho đúng máy đang chạy. Kịch bản tự dừng/chạy lại máy chủ để giả mất mạng
   (Playwright `setOffline` không chặn được yêu cầu của service worker) và tự trả `dist` về như cũ.
3. Thẻ mời cài + tự tải lại số liệu (chạy trong emulator, từ thư mục `firebase/`):
   `npx firebase --config ../firebase.json emulators:exec --only firestore --project demo-ads-nolimit "WEB_PORT=4330 EMU_PORT=8080 SHOTS_DIR=<thư mục ảnh> node ../e2e/pwa/e2e-install.cjs && WEB_PORT=4330 EMU_PORT=8080 node ../e2e/pwa/e2e-refresh.cjs"`

Chưa kiểm được bằng máy: Safari/iPhone thật, lời mời cài thật của Chrome, đăng nhập Google trong app iPhone.
