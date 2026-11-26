# Đăng nhập / tạo tài khoản bằng Facebook — kế hoạch (26/11/2026)

Chủ tịch duyệt 26/11 08:52 ("ĐỒNG Ý LÀM ĐĂNG NHẬP FACEBOOK").

## Mục tiêu
- Thêm nút "Tiếp tục với Facebook" ở trang Đăng nhập (`/dang-nhap/`, `/en/sign-in/`) và Đăng ký (`/dang-ky/`, `/en/sign-up/`), ngay dưới nút Google hiện có.
- Trên máy tính: cửa sổ nhỏ mở trong trình duyệt đang đăng nhập Facebook, khách bấm "Tiếp tục dưới tên …".
- Trên điện thoại:
  - Trong trình duyệt của app Facebook, khách đã đăng nhập sẵn → bấm 1 lần là xong.
  - Trong Safari/Chrome → trang đăng nhập Facebook mở trong trình duyệt đó.
  - Web KHÔNG mở được app Facebook. Không được hứa điều này trong chữ.

## Hiện trạng (đọc trước)
- Firebase Auth, `src/config/firebase.ts`: `authDomain: 'ads-nolimit-web.firebaseapp.com'`.
- Google đăng nhập dùng `signInWithPopup` gọi NGAY trong lúc bấm, xem:
  - `src/lib/auth/sign-in.ts` khoảng dòng 80–90.
  - `src/lib/auth/sign-up.ts` khoảng dòng 127.
  - `src/lib/auth/client.ts`, hàm `googleProvider()`.
- Làm theo đúng cách nút Google tạo/ghép hồ sơ khách trong Firestore sau lần đăng nhập đầu (getAdditionalUserInfo …).
- Luật Firestore `firestore.rules` (~dòng 796, 880): quyền "cùng xem TKQC" đòi `email_verified == true`.
  - Email từ Facebook thường KHÔNG được Firebase đánh dấu đã xác minh. KHÔNG nới luật; thay vào đó khách Facebook phải xác minh email.
  - Có sẵn luồng cho tài khoản chưa xác minh email, xem `e2e/nhieu-nguoi-xem/e2e-chinh-chua-xac-minh.cjs`.

## Việc cần làm
1. **Bật/tắt bằng cấu hình** `src/config/site.ts`:
   ```ts
   export const authProviders = { facebook: (import.meta.env.PUBLIC_FB_LOGIN ?? 'off') === 'on' } as const;
   ```
   Mặc định TẮT để lên web lúc nào cũng an toàn. Tổng giám đốc bật sau khi Firebase đã cấu hình. Khi tắt thì không có nút, không nạp mã Facebook.
2. `client.ts`: thêm `facebookProvider()` = `new FacebookAuthProvider()` + `addScope('email')`, `addScope('public_profile')`, `setCustomParameters({ display: 'popup' })`.
3. **Nút** "Tiếp tục với Facebook" (en: "Continue with Facebook"):
   - Biểu tượng chữ "f" màu Facebook #1877F2, nền trắng, viền như nút Google (theo hướng dẫn thương hiệu Meta: không đổi màu logo).
   - Gọi `signInWithPopup(auth, facebookProvider())` ngay trong lúc bấm, không có `await` trước đó.
4. **Lỗi**, thêm vào chỗ đang dịch mã lỗi auth (tìm `auth/popup-closed-by-user`…):
   - `auth/popup-closed-by-user`, `auth/cancelled-popup-request`: im lặng.
   - `auth/popup-blocked`: báo cho phép cửa sổ bật lên, hoặc thử lại.
   - `auth/operation-not-allowed`: "Đăng nhập bằng Facebook đang được bật, bạn dùng Google hoặc email tạm thời nhé".
   - `auth/account-exists-with-different-credential`:
     - Lấy `FacebookAuthProvider.credentialFromError(err)` và `err.customData.email`.
     - Giữ credential trong bộ nhớ trang (KHÔNG lưu localStorage).
     - Báo: "Email {email} đã có tài khoản ADS-Nolimit. Bạn đăng nhập bằng cách cũ (Google hoặc email & mật khẩu) ngay bên dưới, chúng tôi sẽ tự nối Facebook vào tài khoản đó."
     - Khi khách đăng nhập thành công bằng cách khác trên cùng trang: gọi `linkWithCredential(user, pending)`, báo đã nối, rồi đi tiếp như thường. Nối lỗi thì chỉ báo nhẹ, không chặn đăng nhập.
   - `auth/web-storage-unsupported`, lỗi mạng: thông báo chung.
5. **Facebook không trả email** (tài khoản Facebook đăng ký bằng số điện thoại):
   - Sau khi đăng nhập, ở trang Tài khoản hiện khối bắt buộc nhưng không chặn xem: "Thêm email để nhận thông báo và được cấp quyền xem báo cáo".
   - Ô email + nút → `verifyBeforeUpdateEmail(user, email)` (Firebase gửi thư xác minh; xác minh xong email được đặt và đã xác minh).
   - Xem chỗ nào trong Tài khoản/Quản trị đang dùng `user.email` hoặc trường email của hồ sơ, đảm bảo không hỏng khi email rỗng (hiện "Chưa có email").
6. **Email có nhưng chưa xác minh:** khách Facebook thấy đúng lời nhắc + nút "Gửi email xác minh" như khách email chưa xác minh hiện nay. Kiểm rằng lời nhắc có hiện.
7. **Bảo mật (`/tai-khoan/#bao-mat`):**
   - Hiện "Đăng nhập bằng: Google / Facebook / Email" theo `user.providerData`.
   - Nút "Nối Facebook" (`linkWithPopup`), chỉ khi bật cấu hình và chưa nối.
   - Nút "Bỏ nối Facebook" (`unlink`), chỉ khi còn ít nhất một cách đăng nhập khác.
8. **Trình duyệt trong app** (Facebook/Zalo/Messenger…), dùng `installPlatform()` trong `src/lib/pwa/install.ts`: Google CHẶN đăng nhập ở đây (lỗi `disallowed_useragent`). Ở trang Đăng nhập/Đăng ký:
   - Trong app Facebook/Messenger: đưa nút Facebook lên trên nút Google, và thêm dòng nhỏ dưới nút Google: "Google không cho đăng nhập trong app này — bạn dùng Facebook, email, hoặc mở bằng Safari/Chrome".
   - Trong Zalo: giữ thứ tự, vẫn có dòng nhắc.
9. **Trang hướng dẫn xóa dữ liệu** (Meta bắt buộc có URL): `/xoa-du-lieu/` và `/en/data-deletion/`. Nội dung:
   - Cách xóa tài khoản trong Tài khoản → Bảo mật → Xóa tài khoản (đang có).
   - Hoặc gửi email contact-support@ads-nolimit.agency, xử lý trong 30 ngày.
   - Cách gỡ ứng dụng ADS-Nolimit khỏi Facebook: Cài đặt → Ứng dụng và trang web.
   - Dữ liệu lấy từ Facebook chỉ có tên, email, ảnh đại diện; không đăng bài, không đọc bạn bè.

   Thêm mục "Đăng nhập bằng Facebook" vào trang Chính sách bảo mật (vi + en), có liên kết tới trang này. Thêm trang vào sitemap nếu sitemap tự sinh.
10. **Chữ:** tiếng Việt xưng "bạn", có bản tiếng Anh đầy đủ.

## Ràng buộc chung
- Đọc phần quy tắc trong `docs/superpowers/plans/2026-11-26-nut-tai-app.md` (mục "Ràng buộc chung") — áp dụng y hệt:
  - Không đặt tên có ad/ads/banner.
  - Giao diện tối giữ nguyên ở vùng không sửa; đọc rõ ở cả giao diện sáng và tối.
  - Nút ≥ 44px.
  - Không chạy astro check.
  - Không tạo tài khoản thật, không đọc .env, không đẩy web, không cài gói.
- **Tệp cấm đụng:** `firestore.rules` (không nới luật), `src/lib/tro-ly/**`, `apps-script/**`, `src/lib/admin/**` (trừ khi chỉ hiển thị "Chưa có email" — ghi rõ trong báo cáo), `public/sw.js`, `package*.json`.
- Không dùng Facebook JS SDK (connect.facebook.net); chỉ dùng Firebase Auth.

## Kiểm thử phải có
1. **Unit** (`firebase/test/unit-dang-nhap-fb.test.mjs`):
   - Bảng dịch lỗi → chữ (vi/en).
   - Hàm quyết định thứ tự nút theo nền tảng (trong app Facebook → Facebook trước).
   - Hàm hiển thị phương thức đăng nhập từ providerData.
2. **E2E** (`e2e/dang-nhap-fb/`), giả Firebase Auth theo cách harness đang giả Google (`FakeAuth` trong `e2e/pwa/harness.cjs`; mở rộng nếu cần, không phá test cũ):
   - Cờ tắt: không có nút ở cả 4 trang.
   - Cờ bật: nút có ở cả 4 trang, đúng chữ vi/en, ≥ 44px, ở 390/430/1440 sáng + tối.
   - Bấm → gọi đúng popup Facebook ngay trong lúc bấm (`userActivation.isActive`).
   - Đăng nhập Facebook có email → vào Tài khoản.
   - Facebook không email → khối "Thêm email" hiện.
   - Lỗi trùng email → thông báo đúng; đăng nhập email/mật khẩu sau đó → `linkWithCredential` được gọi.
   - UA trong app Facebook iOS → nút Facebook ở trên nút Google + dòng nhắc Google.
   - Trang xóa dữ liệu vi/en có đủ nội dung, có trong chân trang hoặc Chính sách bảo mật.
3. Chạy lại: `firebase && npm test`, `e2e/nut-dang-nhap`, `e2e/tai-app` (cổng/emulator riêng), `e2e/chan-quang-cao`, tương phản `e2e/sang-toi/tuong-phan.cjs` trên trang đăng nhập/đăng ký có nút mới.

## Mẫu báo cáo
Commit cuối · từng mục ĐẠT/KHÔNG + số liệu · ảnh (đăng nhập 430 sáng/tối, đăng nhập trong app Facebook, khối Thêm email, Bảo mật, trang xóa dữ liệu) · điều chưa kiểm được · chỗ khác kế hoạch.
