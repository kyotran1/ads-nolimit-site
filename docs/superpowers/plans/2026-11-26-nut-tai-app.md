# Nút "Tải app" dễ thấy + bấm là có kết quả trên mọi máy — kế hoạch (26/11/2026)

Chủ tịch báo 26/11 08:19 (điện thoại, có vẻ iPhone Safari iOS 26):
- Trang chủ và trang Tài khoản không có nút tải app. Chỉ thấy ở Hồ sơ.
- Bấm nút tải ở Hồ sơ thì không có gì xảy ra.

Yêu cầu: nút hoặc biểu tượng tải app dễ thấy, bấm vào thì tự cài app lên màn hình chính.

## Sự thật kỹ thuật (phải giữ trung thực trong chữ trên web)
- **Android Chrome/Edge/Samsung (và máy tính Chrome/Edge):**
  - Trình duyệt bắn `beforeinstallprompt`. `PwaHead.astro` giữ sự kiện ở `window.__adsnlInstall` và phát `adsnl-install-ready`.
  - Gọi `.prompt()` sẽ mở hộp "Cài đặt" của trình duyệt. Khách bấm 1 lần là xong.
  - Sự kiện chỉ dùng một lần. Nếu khách từng bấm "Hủy", trình duyệt có thể không bắn lại một thời gian.
- **iPhone/iPad, mọi trình duyệt:**
  - Apple KHÔNG cho trang web tự cài. Khách phải tự làm Chia sẻ → "Thêm vào MH chính" → Thêm.
  - Safari iOS 26 (UA có `Version/26`): thanh dưới gọn, nút Chia sẻ nằm trong nút "⋯" ở góc dưới phải.
  - Safari iOS ≤ 18: nút Chia sẻ ⬆ ở thanh dưới.
  - Chrome iOS (`CriOS`): nút Chia sẻ ⬆ ở cuối thanh địa chỉ (trên cùng), rồi "Thêm vào màn hình chính".
  - Cốc Cốc iOS (`coc_coc_browser`), Edge iOS (`EdgiOS`), Firefox iOS (`FxiOS`): thử menu/Chia sẻ → "Thêm vào MH chính". Nếu không có thì mở bằng Safari.
  - Trình duyệt trong app Facebook/Messenger/Instagram/Zalo/Line/TikTok (`FBAN|FBAV|FB_IAB|Instagram|Zalo|Line/|musical_ly|BytedanceWebview`):
    - Không cài được. Nút "Mở bằng Safari" dùng `x-safari-https://www.ads-nolimit.agency<đường dẫn hiện tại>` (chạy trên iOS 17+).
    - Có thêm nút "Sao chép link".
- **Android trong app Facebook/Zalo…:**
  - Nút "Mở bằng Chrome" dùng `intent://www.ads-nolimit.agency<path>#Intent;scheme=https;package=com.android.chrome;end`.
  - Có thêm nút "Sao chép link".
- **Android không có sự kiện cài** (Cốc Cốc Android `coc_coc_browser`, Firefox Android, Chrome đã từ chối gần đây): hướng dẫn menu ⋮ (hoặc ≡) → "Thêm vào màn hình chính" / "Cài đặt ứng dụng".
- **Máy tính không có sự kiện cài:**
  - Chrome/Edge/Cốc Cốc: biểu tượng cài ⊕ ở cuối thanh địa chỉ, hoặc menu ⋮ → "Truyền, lưu và chia sẻ" → "Cài đặt trang dưới dạng ứng dụng".
  - Safari Mac: Tệp → "Thêm vào Dock".
  - Firefox: chưa hỗ trợ, nên mở bằng Chrome/Edge.
- **Đang ở trong app đã cài** (`display-mode: standalone` hoặc `navigator.standalone`): ẩn MỌI nút tải app.

## Thiết kế
- Một bảng hướng dẫn dùng chung cho mọi trang: `src/lib/pwa/install-sheet.ts` (tải chậm khi bấm). Mọi phần tử có thuộc tính `data-install-app` là nút mở.
- **Khi bấm nút:**
  - Có `window.__adsnlInstall` → gọi `promptInstall()` NGAY trong sự kiện bấm (không mở bảng trước, để giữ "user gesture"):
    - Khách chấp nhận → hiện thông báo nhỏ "Đã cài…" (dùng chữ `installDone`).
    - Khách từ chối → không làm gì thêm.
    - Lỗi hoặc không mở được → mở bảng hướng dẫn.
  - Không có sự kiện → mở bảng hướng dẫn theo nền tảng.
- **Bảng hướng dẫn:**
  - `<dialog>` dạng tấm trượt từ dưới lên trên điện thoại, hộp giữa màn hình trên máy tính.
  - Có tiêu đề "Tải app ADS-Nolimit về điện thoại", biểu tượng app (`/icon-192.png`) và các bước đánh số. Mỗi bước có biểu tượng vẽ bằng SVG giống thật: Chia sẻ ⬆, ⋯, ⋮, ô "Thêm vào MH chính" ⊞.
  - Có nút "Sao chép link" khi cần. Có nút "Đã hiểu" để đóng. Đóng được bằng Esc và khi bấm ra ngoài.
  - Có dòng nhỏ: "Đã cài rồi? Mở ADS-Nolimit từ màn hình chính."
  - Không có hình ảnh từ bên ngoài, không gọi mạng.
- **Hàm thuần có test:** `installPlatform(ua: string, maxTouchPoints: number): InstallPlatform` trong `src/lib/pwa/install.ts`.
  - `InstallPlatform = 'ios-safari' | 'ios-safari-26' | 'ios-chrome' | 'ios-other' | 'ios-inapp' | 'android-inapp' | 'android' | 'desktop-safari' | 'desktop-firefox' | 'desktop'`.
  - Hàm `isIosSafari` cũ GIỮ NGUYÊN chữ ký, vì đang có test. Có thể viết lại hàm cũ dựa trên hàm mới, miễn test cũ vẫn đạt.
- **Vị trí nút** (đều có `data-install-app`; ẩn khi standalone bằng class `install-entry` cùng một đoạn mã đặt `hidden`):
  1. **Hàng dưới thanh đầu trang (< 1080px, `Header.astro` `.row2-inner`):**
     - Thêm nút thứ 3 sau "Tạo tài khoản": `<button type="button" class="btn row2-app install-entry" data-install-app>` gồm biểu tượng `download` và chữ "Tải app" (en: "Get app").
     - Cột lưới: `1fr 1fr auto`. Đã đăng nhập: `1fr auto` (nút Tài khoản chiếm phần còn lại).
     - ≤ 359px: nút app chỉ còn biểu tượng, nhãn ẩn cho trình đọc màn hình, cao ≥ 44px.
     - Hàng dưới hiện có ở cả trang /tai-khoan/? KHÔNG — giữ quy tắc cũ, không có ở trang tài khoản/đăng nhập/đăng ký.
  2. **Menu điện thoại, nhóm Tài khoản (`.mobile-acct`):** thêm một dòng nút rộng hết hàng "Tải app về điện thoại" (`install-entry`, `data-install-app`), bên dưới hai nút Đăng nhập/Tạo tài khoản. Bấm thì đóng menu (`details.open=false`) rồi mở bảng.
  3. **Trang Tài khoản:**
     - Thẻ mời ở Tổng quan (`install-ui.ts`, chế độ `card`) LUÔN có nút "Tải app" (mở `data-install-app` flow) cho mọi nền tảng chưa cài. Bỏ trạng thái 'hidden' khi không có sự kiện; "Để sau" vẫn ẩn thẻ 30 ngày.
     - Khối ở Hồ sơ (`profile`) cũng luôn có nút đó. Bỏ các đoạn hướng dẫn chữ cũ trong thẻ, vì hướng dẫn nằm trong bảng.
     - Thêm một nút nhỏ cố định "Tải app" ở đầu trang Tài khoản trên điện thoại, nơi dễ thấy (gần lời chào / thẻ số dư). Ẩn khi standalone. Không bị "Để sau" ẩn.
  4. **Chân trang (`Footer`):** một liên kết dạng nút "Tải app ADS-Nolimit", cho cả máy tính.
- **Chữ:** thêm vào đúng nơi đang chứa chữ cho từng phần: `src/config/i18n.ts` cho Header/Footer, `src/lib/account/text.ts` cho Tài khoản. Bảng hướng dẫn nhận chữ qua một khối JSON do `InstallSheetText.astro` (mới) in vào trang theo `lang`, hoặc qua một module chữ có cả vi/en. Chọn một cách và giải thích trong báo cáo. Xưng "bạn".

## Ràng buộc chung
- ĐỌC TRƯỚC: `claude/quy-tac-van-hanh.md`. Bản sao trong kho: `/home/claude/ads-nolimit-content/docs/` có `facebook-content-rules.md`. Sổ quy tắc vận hành nằm ở dự án; các điểm chính được chép dưới đây.
  - **Không** đặt class/id/tên tệp chứa `ad`, `ads`, `advert`, `banner`, `sponsor` (trình chặn quảng cáo ẩn). Tiền tố cho phần mới: `install-` / `row2-app` / `isheet-`.
  - Giao diện tối giữ nguyên từng điểm ảnh ở các vùng không sửa. Màu dùng biến (`var(--text)`, `rgb(var(--ov)/x)`, `rgb(var(--scrim)/x)`). Trong `linear-gradient()` thì ghi màu cứng, và đè riêng bằng `:root[data-theme='light']`.
  - Bảng hướng dẫn phải đọc rõ ở cả giao diện sáng và tối. Kiểm bằng `e2e/sang-toi/tuong-phan.cjs` (≥ 4,5).
  - Mọi nút trên thanh đầu trang đặt `flex: none`, kích thước ≥ 44×44. Kiểm ở 320/360/375/390/430/768/1079/1080/1440.
  - Không chạy `npx astro check`. Dùng `npm run build` và `cd firebase && npm test`.
- **Tệp CẤM đụng:** `src/lib/tro-ly/**`, `apps-script/**`, `firestore.rules`, `src/lib/admin/**`, `AdminPage`, `src/pages/offline.astro`, `package*.json`, `public/sw.js`, `public/site.webmanifest`.
- Không tạo tài khoản thật, không đọc `.env`, không đẩy web, không cài gói.

## Kiểm thử phải có (viết trước, đặt trong `e2e/tai-app/` và `firebase/test/unit-tai-app.test.mjs`)
1. **Unit:** `installPlatform()` với UA thật, mỗi loại ít nhất một:
   - iPhone Safari 17 và 26, iPad (Macintosh + touch).
   - Chrome iOS, Cốc Cốc iOS, Edge iOS.
   - Facebook iOS, Zalo iOS, Facebook Android.
   - Chrome Android, Cốc Cốc Android, Samsung Internet.
   - Chrome máy tính, Cốc Cốc máy tính, Safari Mac, Firefox máy tính.
   - Test `isIosSafari` cũ vẫn đạt.
2. **E2E (Playwright, giả UA + `isMobile` + `hasTouch`)** trên `/`, `/en/`, `/bang-gia/` và trang Tài khoản (đăng nhập giả bằng harness `e2e/pwa/harness.cjs` + seed):
   - Nút "Tải app" hiện ở hàng dưới thanh đầu trang (< 1080), trong Menu, ở Tài khoản (đầu trang và thẻ) và ở chân trang. Ẩn hết khi giả `display-mode: standalone` (`emulateMedia` không giả được thì dùng `addInitScript` ghi đè `matchMedia`).
   - **Có sự kiện cài:** giả bằng `addInitScript` tạo một `Event('beforeinstallprompt')` có `prompt()` ghi nhận lời gọi và `userChoice` = `accepted`. Bấm nút → `prompt()` được gọi đúng 1 lần, không mở bảng, hiện thông báo đã cài, các nút ẩn đi.
   - **Có sự kiện nhưng `prompt()` lỗi:** bấm nút → mở bảng.
   - **Không có sự kiện:** với mỗi loại nền tảng chính, bấm → bảng mở, có đúng các bước của nền tảng đó (dò chữ khóa), không có lỗi JS. Đóng được bằng nút, Esc, bấm nền.
   - Nút "Sao chép link" ghi đúng địa chỉ trang (cấp quyền clipboard trong context).
   - Nút "Mở bằng Safari" (iOS trong app) có `href` bắt đầu `x-safari-https://www.ads-nolimit.agency`. Nút "Mở bằng Chrome" (Android trong app) có `href` dạng `intent://…;package=com.android.chrome;end`.
   - Thanh đầu trang không tràn, không chồng ở các khổ liệt kê. Chạy lại `e2e/nut-dang-nhap/e2e-nut-dang-nhap.cjs` (sửa kỳ vọng nếu cần, nhưng không bỏ kiểm tra).
3. **Tương phản:** bảng mở ở cả sáng/tối (390 và 1440) bằng `tuong-phan.cjs`, hoặc một kiểm riêng cùng thuật toán.
4. **Chặn quảng cáo:** `e2e/chan-quang-cao/` vẫn đạt.
5. **Ảnh để Tổng giám đốc xem:** iPhone 390 (Safari 26) bảng mở, Android 390 bảng mở (không sự kiện), thanh đầu trang 320/390 sáng + tối, menu mở, Tài khoản đầu trang.

## Mẫu báo cáo
- Commit cuối.
- Từng mục kiểm thử: ĐẠT/KHÔNG, kèm số liệu.
- Đường dẫn ảnh.
- Điều chưa kiểm được.
- Chỗ làm khác kế hoạch.
