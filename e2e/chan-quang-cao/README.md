# Kiểm tra với trình chặn quảng cáo

Lỗi thật 25/11/2026: khách dùng Cốc Cốc (có sẵn trình chặn quảng cáo) thấy trang "Báo cáo quảng cáo" trống,
vì class `ad-card` nằm trong danh sách EasyList (`##.ad-card`). Chrome không chặn nên không ai thấy lỗi khi kiểm.

Quy tắc: không đặt class / id / tên tệp có phần `ad`, `ads`, `advert`, `sponsor`, `banner`… (dùng tiền tố trung tính, vd `rpt-`).
Hàng rào rẻ chạy mỗi lần `npm test`: `firebase/test/unit-ten-phan-tu.test.mjs`.

Kiểm tra đầy đủ (chạy trước mỗi lần lên web có đổi giao diện):

1. Tải danh sách chặn về một thư mục tạm (không đưa vào kho mã):
   - `https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_general_hide.txt`
   - `https://raw.githubusercontent.com/abpvn/abpvn/master/filter/abpvn.txt` (danh sách tiếng Việt)
   - tùy chọn: `fanboy-addon/fanboy_annoyance_general_hide.txt`, `fanboy-addon/fanboy_social_general_hide.txt`, `easylist_cookie/easylist_cookie_general_hide.txt`
2. `npm run build`, phục vụ bản build: `e2e/pwa/serve.sh 4330 <đường dẫn>/dist`
3. Từ thư mục `firebase/`:
   `npx firebase --config ../firebase.json emulators:exec --only firestore --project demo-ads-nolimit "ADBLOCK_LISTS=<tệp1>,<tệp2> DIST_DIR=<đường dẫn>/dist WEB_PORT=4330 EMU_PORT=8080 SHOTS_DIR=<thư mục ảnh> node ../e2e/chan-quang-cao/e2e-chan-quang-cao.cjs"`

Kịch bản quét mọi trang tĩnh, các mục trang Tài khoản (có TKQC, báo cáo, hộp nạp ngân sách) và trang Quản trị;
báo từng phần tử khớp danh sách chặn, rồi giả trình chặn (ẩn mọi phần tử khớp) và kiểm thẻ TKQC + bảng báo cáo vẫn nhìn thấy.

Chưa kiểm được bằng máy: danh sách riêng của Cốc Cốc (không công khai) — cần thử trên Cốc Cốc thật sau khi lên web.
