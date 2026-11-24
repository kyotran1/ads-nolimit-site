# Nhiều người xem TKQC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một TKQC có một tài khoản chính + tối đa 10 người xem thêm; người xem thêm thấy TKQC, báo cáo, thẻ dịch vụ và tạo được lệnh nạp.

**Architecture:** Thêm `viewerUids`, `viewerEmails`, `memberUids` vào `adAccounts`; `memberUids` vào `adReports` (Apps Script ghi). Luật cho đọc theo `uid` hoặc `memberUids`. Trang khách hỏi hai kiểu rồi gộp. Quản trị nhập email người xem thêm.

**Tech Stack:** Astro 7 static, TypeScript DOM (`h()`), Firestore Lite, @firebase/rules-unit-testing, node:test, Playwright + emulator.

**Spec:** `docs/superpowers/specs/2026-11-24-nhieu-nguoi-xem-tkqc-design.md`

## Global Constraints

- Đọc `claude/quy-tac-van-hanh.md` (bản sao: xem lời giao việc) trước khi làm.
- Tên trường nguyên văn: `viewerUids`, `viewerEmails`, `memberUids`. `memberUids[0]` luôn là `uid` (tài khoản chính). Tối đa 10 người xem thêm.
- Tài liệu cũ không có 3 trường này phải chạy như trước (đọc được, sửa được, hiển thị đúng).
- Không thêm thư viện. Không đổi giao diện ngoài phần nêu trong kế hoạch. Chữ hiển thị cho khách có vi + en; trang quản trị chỉ tiếng Việt.
- Không đẩy `site main`, không tạo tài khoản thật, không đọc `.env`. Commit trên nhánh được giao.

## Review Focus

1. Người không thuộc `memberUids` và không phải `uid`: `get` và mọi kiểu `list` trên `adAccounts`/`adReports` đều bị từ chối.
2. Truy vấn `where('memberUids','array-contains', mình)` và `where('uid','==', mình)` đều được luật chấp nhận; truy vấn không lọc bị từ chối (trừ quản trị).
3. Quản trị không ghi được `memberUids` lệch (`memberUids[0] != uid`, thiếu người xem, thừa người, > 10, `viewerEmails` lệch độ dài).
4. Người xem thêm tạo được `adTopups` cho TKQC đó; người ngoài và người vừa bị gỡ thì không.
5. Trang khách gộp hai truy vấn không tạo thẻ TKQC / báo cáo trùng khi tài liệu khớp cả hai (tài khoản chính có cả `uid` lẫn nằm trong `memberUids`).
6. Tài liệu cũ (không có 3 trường) vẫn hiện và sửa được trong Quản trị; lưu lại thì có đủ 3 trường.

---

### Task 1: Luật + trang khách (nhánh `nx-luat-khach`, worktree `/home/claude/wt-nx-a`, cổng web 4331, emulator 8081)

**Files:**
- Modify: `firestore.rules` (adConfigKeys, validAdConfig, đọc `adAccounts`/`adReports`, `newAdTopup`)
- Modify: `firebase/test/ad-viewers.test.mjs` (đã có sẵn tệp giữ chỗ trong `package.json`; viết test vào đây)
- Modify: `src/lib/ads/report.ts` (`AdAccount` thêm `viewerUids: string[]`, `viewerEmails: string[]`, `memberUids: string[]`; `parseAdAccount` đọc 3 trường, thiếu → `[]`/`[]`/`[uid]`)
- Modify: `src/lib/account/store.ts` (bộ nạp `adAccounts`, `adReports`)
- Test thêm: `firebase/test/unit-ad-members.test.mjs`
- KHÔNG đụng: `src/lib/admin/*`, `src/views/*`, `src/lib/account/main.ts`, `src/styles/*`, `firebase/package.json`

**Interfaces:**
- Produces: `AdAccount.viewerUids`, `.viewerEmails`, `.memberUids` (Task 2 dùng); hàm thuần `mergeById<T extends { id: string }>(a: T[], b: T[]): T[]` trong `src/lib/ads/report.ts` (giữ thứ tự của `a`, thêm phần tử của `b` chưa có).

- [ ] **Step 1: Test luật viết trước (FAIL)** trong `firebase/test/ad-viewers.test.mjs`, theo cách `firebase/test/ads.test.mjs` đang dựng dữ liệu:
  - TKQC `act_11111` với `uid: 'chinh'`, `viewerUids: ['xem1']`, `viewerEmails: ['x1@e.com']`, `memberUids: ['chinh','xem1']`; báo cáo `act_11111_2026-11` có `uid: 'chinh'`, `memberUids: ['chinh','xem1']`.
  - `xem1`: `get` TKQC ✓, `get` báo cáo ✓, list `where('memberUids','array-contains','xem1')` trên cả hai ✓.
  - `chinh`: list `where('uid','==','chinh')` ✓ và `array-contains` ✓.
  - `ngoai`: `get` ✗, list `array-contains 'ngoai'` trả rỗng (không lỗi), list `array-contains 'xem1'` ✗, list không lọc ✗.
  - Tài liệu cũ (không có `memberUids`): chủ đọc ✓, `xem1` ✗.
  - Quản trị ghi: hợp lệ ✓; `memberUids[0] != uid` ✗; thiếu một người xem trong `memberUids` ✗; 11 người xem ✗; `viewerEmails` lệch độ dài ✗; không có cả 3 trường ✓ (cũ).
  - `adTopups`: `xem1` tạo cho `act_11111` ✓ (dùng đúng bộ trường hợp lệ như test hiện có); `ngoai` ✗; sau khi quản trị gỡ `xem1` khỏi TKQC → `xem1` ✗.
- [ ] **Step 2: Sửa `firestore.rules`** cho tới khi test qua; toàn bộ `npm test` trong `firebase/` vẫn qua (174 test cũ không được sửa nghĩa).
- [ ] **Step 3: Test đơn vị (FAIL trước)** `unit-ad-members.test.mjs`: `mergeById` (trùng id chỉ giữ một, giữ thứ tự `a`), `parseAdAccount` với tài liệu cũ → `memberUids` = `[uid]`, tài liệu mới giữ nguyên 3 trường, bỏ phần tử không phải chuỗi.
- [ ] **Step 4: `report.ts` + `store.ts`**: bộ nạp `adAccounts` và `adReports` chạy song song hai truy vấn (`uid ==` và `memberUids array-contains state.uid`) rồi `mergeById`; một truy vấn lỗi quyền thì vẫn dùng kết quả truy vấn kia (không làm hỏng cả mục).
- [ ] **Step 5: E2E emulator** (script để trong scratchpad của bạn, dùng `e2e/pwa/harness.cjs` + `seed.cjs`): tạo 3 khách giả (chính, xem thêm, ngoài) + TKQC + báo cáo tháng hiện tại; kiểm: người xem thêm mở `/tai-khoan/#bao-cao-ads` thấy thẻ TKQC và mở được báo cáo (không phải "Chưa có báo cáo"), Tổng quan có thẻ dịch vụ tự động, mục Báo cáo quảng cáo không khóa; người ngoài không thấy; tài khoản chính thấy đúng 1 thẻ (không trùng). Chụp ảnh trang người xem thêm ở 390 và 1440.
- [ ] **Step 6: Commit.**

### Task 2: Quản trị (nhánh `nx-quan-tri`, worktree `/home/claude/wt-nx-b`, cổng web 4332, emulator 8082)

**Files:**
- Modify: `src/lib/admin/ads.ts` (form + lưu + thẻ danh sách), `src/lib/admin/customer.ts` (tab TKQC + dịch vụ tự động), `src/lib/admin/shared.ts` (đếm TKQC theo thành viên), `src/styles/admin.css` nếu cần
- Test: `firebase/test/unit-ad-viewers-form.test.mjs`
- KHÔNG đụng: `firestore.rules`, `firebase/test/ad-viewers.test.mjs`, `src/lib/ads/report.ts`, `src/lib/account/*`, `src/views/*`, `firebase/package.json`

**Interfaces:**
- Consumes: 3 trường của Task 1 (đọc thẳng từ dữ liệu Firestore bằng các hàm `str`/mảng sẵn có trong admin; KHÔNG phụ thuộc mã của Task 1 để hai nhánh gộp không xung đột).
- Produces: hàm thuần trong tệp mới `src/lib/admin/viewers.ts`:
  `parseViewerEmails(text: string, mainEmail: string): { emails: string[]; errors: string[] }` — tách theo dòng/dấu phẩy/chấm phẩy/khoảng trắng, hạ chữ thường, bỏ rỗng, bỏ trùng; lỗi khi sai dạng email, trùng `mainEmail`, hoặc > 10.

- [ ] **Step 1: Test đơn vị viết trước (FAIL)** cho `parseViewerEmails`: nhiều dòng + dấu phẩy; chữ hoa → thường; trùng nhau giữ một; trùng email chính → lỗi nêu email đó; `khong-phai-email` → lỗi nêu chuỗi đó; 11 email → lỗi "tối đa 10"; chuỗi rỗng → `emails: []`, không lỗi.
- [ ] **Step 2: `viewers.ts`** → test qua.
- [ ] **Step 3: Form TKQC** (`ads.ts`): thêm trường `textarea` tên `viewers`, nhãn "Email người xem thêm (mỗi dòng một email, tối đa 10)", gợi ý "Cổ đông/nhân sự của khách. Mỗi người phải đã tạo tài khoản trên web.". Khi sửa TKQC điền sẵn `viewerEmails`. Khi lưu: `parseViewerEmails` → lỗi thì hiện dưới ô; tra từng email bằng `customerByEmail`; email nào chưa có tài khoản → lỗi nêu đúng email đó, không lưu. Ghi `viewerUids`, `viewerEmails` (email chuẩn của khách), `memberUids: [uidChinh, ...viewerUids]` (bỏ trùng với chính). Giữ nguyên lệnh `syncBtn.click()` sau khi lưu.
- [ ] **Step 4: Hiển thị**: thẻ TKQC trong danh sách thêm dòng "Người xem thêm: tên/email, …" (không có thì không hiện dòng). Chi tiết khách → tab "Tài khoản quảng cáo" và dịch vụ tự động: lấy cả TKQC mà khách ∈ `memberUids` (hai truy vấn, gộp theo id), TKQC mà khách chỉ là người xem thêm ghi nhãn "người xem thêm". `shared.ts`: số TKQC của khách đếm theo `memberUids` (thiếu thì theo `uid`).
- [ ] **Step 5: E2E emulator** (script trong scratchpad của bạn, theo `look-admin-customers.cjs` trong `/tmp/claude-0/-home-claude/518e96b9-6704-53d2-abe0-181328bc886f/scratchpad/e2e-v4/`): tài khoản quản trị giả mở `/quan-tri/#tai-khoan-quang-cao`, sửa một TKQC, nhập 2 email hợp lệ + 1 email chưa đăng ký → thấy lỗi nêu đúng email; sửa lại 2 email hợp lệ → lưu; đọc lại tài liệu trong emulator thấy đủ 3 trường đúng; mở chi tiết khách là người xem thêm → tab TKQC có TKQC đó kèm nhãn. Lưu ý: emulator dùng `firestore.rules` của nhánh bạn (CHƯA có 3 khóa mới) nên lệnh ghi sẽ bị luật từ chối — để kiểm phần ghi, tạo bản sao `firebase.json` + `firestore.rules` riêng trong scratchpad của bạn, thêm 3 khóa vào `adConfigKeys()` trong bản sao, và chạy emulator bằng `--config` bản sao đó. Chụp ảnh form và thẻ ở 390 và 1440.
- [ ] **Step 6: Commit.**

### Task 3 (phiên chính): nút Làm mới, Apps Script, gộp, kiểm tra độc lập, ảnh xem trước
