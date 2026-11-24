# Khách hàng – Dịch vụ – Quyền – Hồ sơ (V4.2) — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chủ gán dịch vụ + cấp quyền cho từng khách trong Quản trị; khách có tên + ảnh đại diện ngay sau đăng ký và thấy dịch vụ đang dùng ở Tổng quan; mục chưa cấp hiện khóa.

**Architecture:** Thêm `users.avatar` (data URL ≤ 32 000 ký tự) và bộ sưu tập `customerServices/{uid}` (chỉ admin ghi). Khách và quản trị *gộp lúc hiển thị*: customerServices + đơn đã trả + TKQC đã gắn + khóa đã mua → một hàm thuần `mergeServices()` dùng chung hai phía. Giao diện giữ phong cách; Chi tiết khách là trang con `#khach-hang/<uid>` có tab.

**Tech Stack:** Astro (static), TypeScript DOM thuần (`h()` trong `src/lib/ui/dom.ts`), Firebase Auth + Firestore Lite, rules test bằng `@firebase/rules-unit-testing` + node:test trên emulator, preview bằng Playwright harness `scratchpad/e2e-v4`.

**Spec:** `docs/superpowers/specs/2026-11-24-khach-hang-dich-vu-quyen-design.md`

## Global Constraints

- Không đổi màu/kiểu chữ/khung chung; dùng biến CSS và lớp sẵn có (`.panel`, `.btn`, `.adm-item`, `.badge`, `.confirm-dialog`).
- Ảnh đại diện: cắt vuông, 128×128, `image/webp` (fallback jpeg) chất lượng 0.8; chuỗi `data:image/…;base64,` ≤ 32 000 ký tự; khách ghi vào `users/{uid}.avatar`; rỗng = xóa ảnh.
- `customerServices/{uid}`: chỉ `isAdmin()` ghi; `services` ≤ 30 phần tử; `id ∈ {ai-starter, ai-sales, ads, agency-account, ad-budget, automation, web, training, other}`; `status ∈ {active, paused, ended}`; `since` khớp `^\d{4}-\d{2}-\d{2}$`; `access` chỉ có 4 khóa bool `ads, courses, keys, guides`.
- Khách không tự ghi `customerServices`. Không Cloud Function. Không Storage.
- Mọi chữ có bản vi + en (bảng `T` theo kiểu `src/lib/account/ad-topup.ts`).
- Mỗi đợt: `cd firebase && npm test` (toàn bộ, đạt 100%), `npm run build`, ảnh xem trước 390 + 1440, rồi **chờ chủ duyệt** trước khi `git push site …:main`.
- Commit message tiếng Việt, kết bằng 2 dòng attribution của phiên.

## Review Focus

1. Ảnh quá lớn / không phải ảnh (PDF, HEIC không decode được): phải báo "Không đọc được ảnh" và giữ ảnh cũ — test ở Task 3.
2. Khách tạo tài khoản bằng Google đã có `photoURL`: hộp thoại hoàn thiện hồ sơ vẫn hiện nếu chưa có tên trong users, nhưng không ép tải ảnh; ảnh Google vẫn hiện khi chưa có `avatar` — test ở Task 4.
3. Khách có TKQC đã gắn nhưng `access.ads=false` (hoặc chưa có doc customerServices): mục Báo cáo quảng cáo phải **mở**, không khóa — test `mergeServices`/`isOpen` ở Task 5.
4. Trang Chi tiết khách mở bằng link `#khach-hang/<uid>` với uid không tồn tại: hiện "Không tìm thấy khách" + nút Quay lại, không treo "Đang tải…" — test ở Task 7.
5. Khách có dịch vụ cùng id vừa gán tay vừa có đơn đã mua: Tổng quan chỉ hiện **một** thẻ (ưu tiên bản gán tay, ghi "+1 đơn") — test `mergeServices` ở Task 5.

---

## ĐỢT 1 — Luật + hồ sơ (tên, ảnh đại diện, hoàn thiện hồ sơ)

### Task 1: Luật Firestore `users.avatar` + `customerServices`

**Files:**
- Modify: `firestore.rules` (validProfile ~dòng 113; thêm match `/customerServices/{uid}` sau `/users`)
- Test: `firebase/test/profile-services.test.mjs` (mới); `firebase/package.json` thêm file vào script `test`

**Interfaces:**
- Produces: tài liệu `customerServices/{uid}` {services: [{id,label,status,since,note,source}], access: {ads,courses,keys,guides}, updatedAt, updatedBy}; `users.avatar: string`.

- [ ] **Step 1: Viết test thất bại** — theo mẫu `firebase/test/ads.test.mjs` (helper `as(ALICE)`, `as(OWNER)`, `seed…`). Các bài:
  - `khách lưu avatar data:image/webp;base64,… (≤32000) → thành công`; `avatar 'https://…' → thất bại`; `avatar dài 32001 → thất bại`; `avatar '' → thành công (xóa)`.
  - `customerServices: khách đọc của mình OK, của người khác FAIL, khách ghi FAIL`.
  - `admin set đúng dạng → OK`; `services 31 phần tử → FAIL`; `services không phải list → FAIL`; `access có khóa lạ 'orders' → FAIL`; `access.ads không phải bool → FAIL`; `updatedBy ≠ auth.uid → FAIL`; `thiếu updatedAt → FAIL`. (Hình dạng từng phần tử — id/status/since — rules không lặp được, kiểm ở `parseCustomerServices`, Task 5.)
- [ ] **Step 2: Chạy** `cd firebase && node --test test/profile-services.test.mjs` (trong `emulators:exec`) → FAIL (permission).
- [ ] **Step 3: Sửa rules**: thêm `'avatar'` vào `hasOnly` của validProfile + `(!('avatar' in d) || (d.avatar is string && d.avatar.size() <= 32000 && (d.avatar == '' || d.avatar.matches('^data:image/.*'))))`. Thêm `validCustomerServices(d)`: `keys().hasOnly(['services','access','updatedAt','updatedBy']) && hasAll(…) && d.services is list && d.services.size() <= 30 && d.access.keys().hasOnly(['ads','courses','keys','guides']) && (4 khóa đều `is bool` nếu có) && d.updatedAt == request.time && d.updatedBy == request.auth.uid`. `match /customerServices/{uid} { allow read: if isMe(uid) || isAdmin(); allow create, update: if isAdmin() && validCustomerServices(request.resource.data); allow delete: if isAdmin(); }`. Comment: hình dạng từng phần tử kiểm ở web (ghi) + `parseCustomerServices` (đọc).
- [ ] **Step 4: Chạy toàn bộ** `npm test` → tất cả đạt (168 + bài mới).
- [ ] **Step 5: Commit** `firestore.rules firebase/test/profile-services.test.mjs firebase/package.json` — "Luật: ảnh đại diện trong hồ sơ + customerServices (chỉ quản trị ghi)".

### Task 2: Thu nhỏ ảnh trên trình duyệt

**Files:**
- Create: `src/lib/ui/avatar-image.ts`
- Test: `firebase/test/avatar-image.test.mjs` (node:test, dùng `canvas`? **không** — test thuần logic: tách phần tính khung cắt vào hàm thuần)

**Interfaces:**
- Produces: `cropSquare(w: number, h: number): {sx:number, sy:number, size:number}` (thuần); `fileToAvatarDataUrl(file: File, size = 128): Promise<string>` (trình duyệt; throw `Error('unreadable')` nếu không decode được, `Error('too-large')` nếu kết quả > 32 000 ký tự sau khi đã thử webp q0.8 → jpeg q0.7 → jpeg q0.5).

- [ ] **Step 1: Test** `cropSquare(400,300) → {sx:50, sy:0, size:300}`; `cropSquare(300,400) → {sx:0, sy:50, size:300}`; `cropSquare(128,128) → {sx:0,sy:0,size:128}`.
- [ ] **Step 2: Chạy** → FAIL (module không có).
- [ ] **Step 3: Viết** `avatar-image.ts`: `cropSquare` thuần; `fileToAvatarDataUrl` dùng `createImageBitmap(file)` (fallback `new Image()` + `URL.createObjectURL`), vẽ lên `canvas` 128×128 với `cropSquare`, `canvas.toDataURL('image/webp', 0.8)`; nếu trình duyệt trả `data:image/png` (không hỗ trợ webp) → dùng jpeg.
- [ ] **Step 4: Chạy test** → PASS. `npx tsc --noEmit -p .` không lỗi mới.
- [ ] **Step 5: Commit** — "Thu nhỏ ảnh đại diện 128px trên trình duyệt".

### Task 3: Ảnh đại diện trong mục Hồ sơ + hiện ở menu

**Files:**
- Modify: `src/components/account/Profile.astro` (thêm khối ảnh: `<div class="avatar avatar--lg" id="p-avatar">`, input file ẩn `#p-avatar-file` accept="image/*", nút "Chọn ảnh" / "Xóa ảnh", `<p id="p-avatar-err" class="field-error">`)
- Modify: `src/lib/account/profile.ts` (đọc/ghi `avatar`; export `avatarUrl(): string`), `src/lib/account/main.ts:76-88` (`renderAvatar` ưu tiên `avatarUrl()` rồi `photoURL`), `src/lib/auth/user-cache.ts` (cache thêm `avatar` để menu hiện ngay khi tải trang)
- Modify: `src/styles/dashboard.css` (`.avatar--lg` 6rem; `.avatar img` object-fit cover — kiểm tra đã có)
- Test: ảnh xem trước harness `look-profile.cjs` (mới, scratchpad) — chọn file `shots/fixture-avatar.jpg` qua `setInputFiles`, bấm Lưu, chụp 390/1440; thử file `.txt` → thấy chữ "Không đọc được ảnh".

**Interfaces:**
- Consumes: `fileToAvatarDataUrl` (Task 2).
- Produces: `profile.ts`: `export const avatarUrl = () => string` (data URL hiện tại hoặc ''); `export const saveAvatar = (dataUrl: string) => Promise<void>` (ghi `updateDoc(users/{uid}, {avatar, updatedAt})`, cập nhật cache, gọi `onRenamed`).

- [ ] **Step 1: Viết harness** `look-profile.cjs` (copy khung từ `look-ads.cjs`), tạo fixture 600×400 JPEG bằng Playwright `page.screenshot` hoặc PIL; chạy → FAIL (chưa có `#p-avatar-file`).
- [ ] **Step 2: Làm UI + logic** như Files. Lỗi: `unreadable` → T.avatarUnreadable ("Không đọc được ảnh. Chọn ảnh JPG/PNG khác."); `too-large` → T.avatarTooLarge. Khi chọn file: hiện xem trước ngay, bấm **Lưu hồ sơ** mới ghi (dùng chung nút lưu hiện có; `avatar` đưa vào cùng `setDoc/updateDoc`). Nút Xóa ảnh → avatar = ''.
- [ ] **Step 3: Chạy harness** → ảnh 390/1440 có ảnh tròn ở menu trái và mục Hồ sơ; file .txt hiện lỗi; không console error.
- [ ] **Step 4:** `npm run build` OK. **Commit** — "Hồ sơ: ảnh đại diện (lưu trong hồ sơ), hiện ở menu".

### Task 4: Hộp thoại "Hoàn thiện hồ sơ" sau đăng ký

**Files:**
- Create: `src/lib/account/onboarding.ts` — `export const maybeOnboard = (user: User, profile: {displayName: string; avatar: string}) => void`
- Modify: `src/lib/account/profile.ts:49-80` (`loadProfile` trả về `{displayName, avatar, exists}` và gọi `maybeOnboard` khi `displayName === ''` **hoặc** `params.welcome` có mặt — đọc `welcome` **trước** khi `main.ts` xóa param: main.ts gọi `loadProfile` trước `readParams`, hoặc `readParams` để lại cờ `window.__welcome` — chọn: `main.ts` truyền `welcome: boolean` vào `loadProfile(user, renamed, welcome)`)
- Modify: `src/lib/account/main.ts` (truyền cờ), `src/styles/dashboard.css` (`.ob-dialog` dùng `.confirm-dialog`)
- Test: harness `look-onboarding.cjs`: vào `/tai-khoan/?welcome=1` với user giả chưa có tên → hộp thoại hiện; điền tên, chọn ảnh, bấm "Bắt đầu" → Firestore `users/{uid}` có `displayName` + `avatar`; vào lại không có `welcome` và đã có tên → không hiện; user có `photoURL` Google và tên rỗng → hộp thoại hiện với ảnh Google làm mặc định, không lỗi.

**Interfaces:**
- Consumes: `fileToAvatarDataUrl`, `saveAvatar`, hàm lưu hồ sơ hiện có (tách `saveProfileFields({displayName, phone})` từ submit handler trong profile.ts).

- [ ] **Step 1: Viết harness** 3 tình huống trên → FAIL.
- [ ] **Step 2: Làm** `onboarding.ts`: dialog `showModal()`, tiêu đề T.obTitle ("Hoàn thiện hồ sơ của bạn"), ảnh tròn + "Chọn ảnh", ô Tên hiển thị (bắt buộc, ≤60), ô Điện thoại/Zalo (tùy chọn), nút chính T.obStart ("Bắt đầu"), nút phụ T.obLater ("Để sau"). "Để sau" đặt `sessionStorage['adsnl-ob-skip']=1` (try/catch) → không hiện lại trong phiên.
- [ ] **Step 3: Chạy harness** → PASS 3 tình huống; ảnh 390/1440.
- [ ] **Step 4:** `npm test` (rules) vẫn đạt; `npm run build`. **Commit** — "Hoàn thiện hồ sơ sau đăng ký: tên + ảnh + điện thoại".

**→ Dừng, gửi ảnh xem trước, chờ chủ duyệt đợt 1 (từ khóa: DUYỆT ĐỢT 1). Lên web thật: luật (console, so hash) rồi `git push site …:main`.**

---

## ĐỢT 2 — Quản trị: Khách hàng, Chi tiết, Dịch vụ & quyền

### Task 5: Kiểu dữ liệu + gộp dịch vụ (dùng chung)

**Files:**
- Create: `src/lib/customer/services.ts`
- Test: `firebase/test/customer-services.test.mjs` (node:test, import ESM qua `tsx`? — dự án không có tsx: viết file `.ts` thuần không phụ thuộc DOM/Firebase và test bằng `node --experimental-strip-types`; kiểm tra `node --version` ≥ 22.6; nếu không có → `npx tsx`)

**Interfaces:**
- Produces:
  - `type ServiceId = 'ai-starter'|'ai-sales'|'ads'|'agency-account'|'ad-budget'|'automation'|'web'|'training'|'other'`; `SERVICE_IDS: readonly ServiceId[]`; `serviceName(id, lang): string` (tên theo `src/data/pricing.ts` + 'ad-budget' = "Nạp ngân sách quảng cáo", 'other' = "Dịch vụ khác").
  - `interface ManualService {id: ServiceId; label: string; status: 'active'|'paused'|'ended'; since: string; note: string; source: 'manual'}`
  - `interface Access {ads: boolean; courses: boolean; keys: boolean; guides: boolean}`; `ACCESS_KEYS`.
  - `interface CustomerServices {services: ManualService[]; access: Access; updatedAt: Date|null; updatedBy: string}`; `EMPTY_SERVICES`.
  - `parseCustomerServices(d: DocumentData|undefined): CustomerServices` — bỏ phần tử sai id/status/since; access thiếu khóa → false.
  - `interface AutoFacts {paidOrders: {productId: string; name: string; createdAt: Date|null}[]; adAccounts: {label: string}[]; courses: number; keys: number}`
  - `interface ServiceCard {id: ServiceId; label: string; status: 'active'|'paused'|'ended'; since: string; source: 'manual'|'order'|'ad'|'course'|'key'; extra: string; goto: SectionId|null}`
  - `mergeServices(cs: CustomerServices, auto: AutoFacts, lang): ServiceCard[]` — thứ tự: active → paused → ended; gộp trùng id (ưu tiên manual, `extra` = "+N đơn"); TKQC → id 'ads' (hoặc 'agency-account' nếu `service` của adAccount là agency-account) goto 'ads'; khóa học → 'training' goto 'courses'; key → 'other' label "Phần mềm & key" goto 'keys'. productId của đơn → ServiceId qua bảng `productToService` (đơn `ad-budget`→'ad-budget', `course-*`→'training', mặc định 'other').
  - `isOpen(key: keyof Access, cs: CustomerServices, auto: AutoFacts): boolean` — `cs.access[key] || (key==='ads' && auto.adAccounts.length>0) || (key==='courses' && auto.courses>0) || (key==='keys' && auto.keys>0)`; `guides` chỉ theo access.

- [ ] **Step 1: Test** các bài: parse bỏ phần tử `id:'xyz'`; parse `since:'24/11/2026'` → bỏ; `mergeServices` trùng id → 1 thẻ với extra "+1 đơn"; TKQC không access → `isOpen('ads')` true; không gì → `isOpen('guides')` false; sắp xếp active trước ended.
- [ ] **Step 2: Chạy** → FAIL. **Step 3: Viết** `services.ts`. **Step 4: Chạy** → PASS; thêm lệnh test vào `firebase/package.json` script `test:unit`. **Step 5: Commit** — "Dịch vụ khách: kiểu dữ liệu, parse, gộp tự động".

### Task 6: Quản trị – danh sách khách mới

**Files:**
- Modify: `src/lib/admin/money.ts:410-440` (`renderCustomers`), `src/lib/admin/shared.ts:102-146` (`Customer` thêm `avatar: string`, `servicesCount: number` — tải `customerServices` cùng lúc với users/wallets; thêm `loadCustomerServices(uid)`), `src/styles/admin.css`
- Test: harness `look-admin-customers.cjs`: seed 3 khách (1 có avatar, 1 có 2 dịch vụ, 1 mới) → ảnh 390/1440; bộ lọc "Có số dư" chỉ còn khách số dư >0.

- [ ] **Step 1: Harness** → FAIL (chưa có `.adm-filter`).
- [ ] **Step 2: Làm**: toolbar = ô tìm + 3 nút lọc toggle (`Có số dư` / `Có TKQC` / `Mới 7 ngày`); dòng khách = `<a href="#khach-hang/<uid>" class="adm-row">` với avatar/chữ cái, tên, email, `Số dư`, `N dịch vụ`, ngày tạo. Bỏ nút Chi tiết/Đóng và detail inline.
- [ ] **Step 3: Harness** → PASS. **Step 4: Commit** — "Quản trị: danh sách khách gọn, lọc, mở trang chi tiết".

### Task 7: Quản trị – trang Chi tiết khách (hash con) + tab

**Files:**
- Create: `src/lib/admin/customer.ts` — `export const renderCustomer = (root: HTMLElement, uid: string) => Promise<void>`
- Modify: `src/lib/admin/main.ts:17-46` (`show`: hash `khach-hang/<uid>` → `renderCustomer`; nav highlight `khach-hang`; title "Khách hàng · <tên>")
- Move: form điều chỉnh số dư + sổ giao dịch từ `money.ts customerItem` sang tab "Số dư & giao dịch" trong `customer.ts` (export `balancePanel(c)` từ money.ts để tái dùng).
- Test: harness: `#khach-hang/<uid thật seed>` → đầu trang có tên/số dư, 5 tab; `#khach-hang/khong-co` → "Không tìm thấy khách" + nút Quay lại; tab Đơn hàng liệt kê đơn seed; tab TKQC liệt kê adAccounts seed (link `#tai-khoan-quang-cao`); tab Yêu cầu liệt kê requests seed.

**Interfaces:**
- Consumes: `loadCustomers`, `docsOf(query(collection(db,'orders'|'adAccounts'|'requests'), where('uid','==',uid)))`, `balancePanel`.
- Produces: tab "Dịch vụ & quyền" gọi `servicesPanel(c)` của Task 8 (tạm placeholder "Đang làm").

- [ ] **Step 1: Harness** → FAIL. **Step 2: Làm** header (`.adm-cust-head`: avatar lớn, tên, email · điện thoại · công ty, số dư, nút "Điều chỉnh số dư" (nhảy tab 2), "Gắn TKQC" (link `#tai-khoan-quang-cao`)); tab bằng `role="tablist"` + hash phụ `#khach-hang/<uid>/<tab>` (`dich-vu|so-du|don-hang|tkqc|yeu-cau`). Nút "← Khách hàng" về `#khach-hang`.
- [ ] **Step 3: Harness** → PASS, ảnh 390/1440. **Step 4: Commit** — "Quản trị: trang chi tiết khách có tab".

### Task 8: Tab Dịch vụ & quyền

**Files:**
- Modify: `src/lib/admin/customer.ts` (`servicesPanel`), `src/lib/admin/shared.ts` (`saveCustomerServices(uid, cs)` → `setDoc(customerServices/{uid}, {...cs, updatedAt: serverTimestamp(), updatedBy: me()})`)
- Test: harness: bấm "Thêm dịch vụ" → chọn `ads`, since hôm nay, ghi chú → lưu → Firestore có 1 phần tử; đổi trạng thái → paused; bật công tắc `courses` → access.courses true; phần tự động (đơn seed, TKQC seed) hiện với nhãn "Tự động" không có nút sửa.

- [ ] **Step 1: Harness** → FAIL. **Step 2: Làm**: khối "Dịch vụ đang dùng" (dùng `mergeServices`; manual có nút Sửa/Kết thúc; form thêm = `buildForm` với select id, label tự điền theo `serviceName`, select status, date since (mặc định hôm nay VN), note); khối "Quyền truy cập" 4 công tắc (checkbox `role="switch"`) + chú thích "(đang mở vì đã có TKQC)" khi `isOpen` nhờ dữ liệu; mọi thay đổi → `saveCustomerServices` → toast.
- [ ] **Step 3: Harness** → PASS. **Step 4: Commit** — "Quản trị: gán dịch vụ, cấp quyền cho khách".

### Task 9: Mục Tài khoản quảng cáo – link "Xem khách"

**Files:** Modify `src/lib/admin/ads.ts:184-187` (thêm `h('a',{href:'#khach-hang/'+a.uid, class:'btn btn-sm btn-ghost', text:'Xem khách'})`).
- [ ] Làm, build, commit — "Quản trị: link từ TKQC sang chi tiết khách".

**→ Dừng, ảnh xem trước, chờ DUYỆT ĐỢT 2, rồi lên web thật.**

---

## ĐỢT 3 — Khách: Tổng quan mới + mục bị khóa

### Task 10: Store khách tải `customerServices` + facts tự động

**Files:**
- Modify: `src/lib/account/store.ts` (state `customerServices: CustomerServices`, loader `'customerServices'` = `getDoc(customerServices/{uid})` → `parseCustomerServices`; `export const autoFacts = (): AutoFacts` từ state.orders/adAccounts/access/keys)
- Test: unit nhỏ cho `autoFacts` nếu tách được thuần (`autoFactsFrom(orders, adAccounts, accessSize, keys)` trong `src/lib/customer/services.ts`) — thêm vào test Task 5.

- [ ] Test → FAIL → làm → PASS → commit "Store khách: dịch vụ & quyền".

### Task 11: Tổng quan mới

**Files:**
- Modify: `src/components/account/Overview.astro` (bố cục: hàng chào + avatar; 3 stat; khối `#ov-services` với tiêu đề T.ovServices; khối lệnh nạp chờ; giao dịch gần đây giới hạn 5 + link "Xem tất cả"), `src/lib/account/overview.ts` (vẽ `#ov-services` từ `mergeServices(state.customerServices, autoFacts(), lang)`; rỗng → thẻ gợi ý "Bạn chưa dùng dịch vụ nào" + nút "Chọn dịch vụ" → `go('services')`; mỗi thẻ: tên, badge trạng thái, "từ dd/mm/yyyy", nút "Mở" → `go(goto)` nếu có), `src/styles/dashboard.css` (`.ov-services` grid 2 cột ≥860px)
- Test: harness `look-overview.cjs`: seed customerServices 2 dịch vụ + 1 TKQC → 3 thẻ (ads gộp, không trùng); khách trống → thẻ gợi ý; ảnh 390/1440.

- [ ] Harness → FAIL → làm → PASS → `npm run build` → commit "Tổng quan: thẻ dịch vụ đang dùng, gọn hơn".

### Task 12: Mục bị khóa

**Files:**
- Create: `src/lib/account/locked.ts` — `export const lockedView = (id: 'ads'|'courses'|'keys'|'guides') => HTMLElement` (giới thiệu 2 câu/mục từ `T`, nút Zalo `links.zalo` + nút "Xem dịch vụ" → `go('services')`)
- Modify: `src/lib/account/main.ts` (khi vào section ∈ 4 mục và `!isOpen(key, state.customerServices, autoFacts())` → thay nội dung view bằng `lockedView`; menu: thêm `<span class="side-lock">` biểu tượng khóa `icon('lock')` — thêm `lock` vào `icon-paths.ts` nếu chưa có), `src/styles/dashboard.css`
- Test: harness: khách không quyền → vào `#bao-cao-ads` thấy "Liên hệ để mở", menu có khóa; khách có TKQC → mở bình thường; admin bật `access.guides` (seed) → Hướng dẫn mở.

- [ ] Harness → FAIL → làm → PASS → build → commit "Mục chưa cấp: hiện khóa + liên hệ để mở".

**→ Dừng, ảnh xem trước, chờ DUYỆT ĐỢT 3, rồi lên web thật; cập nhật `claude/website-v41-bao-cao-ads.md` (mục 16) và sao lưu luật.**
