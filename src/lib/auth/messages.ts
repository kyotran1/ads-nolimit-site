/**
 * Chữ hiện ra TRONG LÚC dùng các trang tài khoản (báo lỗi, đang xử lý, thông báo thành công),
 * hai ngôn ngữ. Chữ cố định trên trang (tiêu đề, nhãn ô nhập) nằm trong từng view ở src/views/.
 *
 * File này được nạp ở trình duyệt, chỉ trên 4 trang tài khoản.
 */
export type Lang = 'vi' | 'en';
type Text = Record<Lang, string>;

/** Ngôn ngữ của trang hiện tại (theo <html lang>). */
export const pageLang = (): Lang => (document.documentElement.lang === 'en' ? 'en' : 'vi');

const pick = (text: Text) => text[pageLang()];

/* ---------- Lỗi Firebase Authentication ---------- */

const authErrors: Record<string, Text> = {
  'invalid-credential': {
    vi: 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại, hoặc bấm “Quên mật khẩu?” để đặt lại. Nếu trước đây bạn đăng ký bằng Google, hãy bấm “Đăng nhập với Google”.',
    en: 'The email or password is incorrect. Check them and try again, or use “Forgot password?”. If you signed up with Google, use “Sign in with Google”.',
  },
  'email-already-in-use': {
    vi: 'Email này đã có tài khoản. Bạn đăng nhập, hoặc bấm “Quên mật khẩu?” nếu không nhớ mật khẩu.',
    en: 'This email already has an account. Sign in instead, or use “Forgot password?” if you do not remember the password.',
  },
  'weak-password': {
    vi: 'Mật khẩu quá yếu. Bạn dùng ít nhất 8 ký tự, nên có cả chữ và số.',
    en: 'That password is too weak. Use at least 8 characters, ideally with letters and numbers.',
  },
  'password-does-not-meet-requirements': {
    vi: 'Mật khẩu chưa đạt yêu cầu bảo mật. Bạn dùng ít nhất 8 ký tự, có cả chữ hoa, chữ thường và số.',
    en: 'That password does not meet the security requirements. Use at least 8 characters with upper- and lower-case letters and numbers.',
  },
  'invalid-email': { vi: 'Email chưa đúng định dạng.', en: 'Please enter a valid email address.' },
  'missing-password': { vi: 'Vui lòng nhập mật khẩu.', en: 'Please enter your password.' },
  'missing-email': { vi: 'Vui lòng nhập email.', en: 'Please enter your email.' },
  'too-many-requests': {
    vi: 'Có quá nhiều lần thử. Vui lòng đợi vài phút rồi thử lại.',
    en: 'Too many attempts. Please wait a few minutes and try again.',
  },
  'network-request-failed': {
    vi: 'Không kết nối được. Vui lòng kiểm tra kết nối mạng rồi thử lại.',
    en: 'Could not connect. Check your internet connection and try again.',
  },
  'popup-closed-by-user': {
    vi: 'Cửa sổ Google đã đóng trước khi hoàn tất. Bạn bấm lại để thử lần nữa.',
    en: 'The Google window was closed before finishing. Click the button to try again.',
  },
  'popup-blocked': {
    vi: 'Trình duyệt đã chặn cửa sổ đăng nhập Google. Bạn cho phép cửa sổ bật lên (pop-up) cho trang này rồi bấm lại, hoặc dùng email và mật khẩu.',
    en: 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and click again, or use your email and password.',
  },
  'requires-recent-login': {
    vi: 'Vì lý do bảo mật, bạn cần xác nhận lại mật khẩu (hoặc tài khoản Google) trước khi làm thao tác này.',
    en: 'For security, please confirm your password (or Google account) again before doing this.',
  },
  'account-exists-with-different-credential': {
    vi: 'Email này đã đăng ký bằng cách khác. Bạn đăng nhập bằng email và mật khẩu đã dùng trước đây.',
    en: 'This email is registered with a different sign-in method. Sign in with the email and password you used before.',
  },
  'credential-already-in-use': {
    vi: 'Tài khoản Google này đã gắn với một tài khoản ADS-Nolimit khác.',
    en: 'This Google account is already linked to another ADS-Nolimit account.',
  },
  'user-disabled': {
    vi: 'Tài khoản này đã bị khóa. Vui lòng liên hệ ADS-Nolimit để được hỗ trợ.',
    en: 'This account has been disabled. Please contact ADS-Nolimit for help.',
  },
  'user-mismatch': {
    vi: 'Tài khoản vừa xác nhận không khớp với tài khoản đang đăng nhập. Bạn chọn đúng tài khoản rồi thử lại.',
    en: 'The account you confirmed does not match the one you are signed in with. Choose the right account and try again.',
  },
  'user-token-expired': {
    vi: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    en: 'Your session has expired. Please sign in again.',
  },
  'operation-not-allowed': {
    vi: 'Cách đăng nhập này tạm thời chưa mở. Vui lòng liên hệ ADS-Nolimit để được hỗ trợ.',
    en: 'This sign-in method is not available right now. Please contact ADS-Nolimit.',
  },
  'unauthorized-domain': {
    vi: 'Trang này chưa được phép đăng nhập bằng Google. Bạn dùng email và mật khẩu, hoặc liên hệ ADS-Nolimit.',
    en: 'Google sign-in is not enabled for this address. Use your email and password, or contact ADS-Nolimit.',
  },
  'web-storage-unsupported': {
    vi: 'Trình duyệt đang chặn lưu dữ liệu đăng nhập (có thể do chế độ riêng tư). Bạn mở bằng trình duyệt thường rồi thử lại.',
    en: 'Your browser is blocking sign-in storage (perhaps private mode). Open the page in a normal window and try again.',
  },
  generic: {
    vi: 'Có lỗi xảy ra. Bạn thử lại sau ít phút; nếu vẫn lỗi, nhắn ADS-Nolimit để được hỗ trợ.',
    en: 'Something went wrong. Please try again in a few minutes, and contact ADS-Nolimit if it keeps happening.',
  },
};

/** Mã lỗi Firebase tương đương nhau → một thông báo. */
const aliases: Record<string, string> = {
  'wrong-password': 'invalid-credential',
  'user-not-found': 'invalid-credential',
  'invalid-login-credentials': 'invalid-credential',
  'invalid-password': 'weak-password',
  'cancelled-popup-request': 'popup-closed-by-user',
  'user-cancelled': 'popup-closed-by-user',
  'invalid-user-token': 'user-token-expired',
  'admin-restricted-operation': 'operation-not-allowed',
  timeout: 'network-request-failed',
};

/** Lỗi khi xác nhận lại mật khẩu (đổi mật khẩu, xóa tài khoản): nói rõ là "mật khẩu hiện tại". */
const reauthErrors: Record<string, Text> = {
  'invalid-credential': {
    vi: 'Mật khẩu hiện tại chưa đúng.',
    en: 'Your current password is incorrect.',
  },
};

export const errorCode = (err: unknown): string => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code.replace(/^auth\//, '') : '';
};

/** Thông báo dễ hiểu cho một lỗi Firebase Authentication. */
export const authErrorMessage = (err: unknown, context: 'default' | 'reauth' = 'default'): string => {
  const raw = errorCode(err);
  const code = aliases[raw] ?? raw;
  if (context === 'reauth' && reauthErrors[code]) return pick(reauthErrors[code]);
  return pick(authErrors[code] ?? authErrors.generic);
};

/* ---------- Lỗi Firestore (hồ sơ, yêu cầu dịch vụ) ---------- */

const dataErrors: Record<string, Text> = {
  'permission-denied': {
    vi: 'Chưa có quyền lưu hoặc đọc dữ liệu này. Bạn tải lại trang hoặc đăng nhập lại; nếu vẫn lỗi, nhắn ADS-Nolimit.',
    en: 'You do not have permission to read or save this. Reload the page or sign in again; if it still fails, contact ADS-Nolimit.',
  },
  unauthenticated: {
    vi: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    en: 'Your session has expired. Please sign in again.',
  },
  unavailable: {
    vi: 'Không kết nối được máy chủ dữ liệu. Vui lòng kiểm tra kết nối mạng rồi thử lại.',
    en: 'Could not reach the data server. Check your connection and try again.',
  },
  'resource-exhausted': {
    vi: 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.',
    en: 'The system is busy. Please try again in a few minutes.',
  },
  generic: {
    vi: 'Chưa lưu hoặc tải được dữ liệu. Bạn thử lại sau ít phút; nếu vẫn lỗi, nhắn ADS-Nolimit.',
    en: 'Could not load or save your data. Please try again in a few minutes, and contact ADS-Nolimit if it keeps failing.',
  },
};

export const dataErrorMessage = (err: unknown): string => {
  const raw = errorCode(err).replace(/^firestore\//, '');
  const code = raw === 'deadline-exceeded' || raw === 'network-request-failed' ? 'unavailable' : raw;
  return pick(dataErrors[code] ?? dataErrors.generic);
};

/* ---------- Chữ giao diện động ---------- */

const text = {
  // Kiểm tra ô nhập
  emailRequired: { vi: 'Vui lòng nhập email.', en: 'Please enter your email.' },
  emailInvalid: {
    vi: 'Email chưa đúng định dạng, ví dụ ten@congty.vn.',
    en: 'Please enter a valid email, for example name@company.com.',
  },
  passwordRequired: { vi: 'Vui lòng nhập mật khẩu.', en: 'Please enter your password.' },
  currentPasswordRequired: { vi: 'Vui lòng nhập mật khẩu hiện tại.', en: 'Please enter your current password.' },
  passwordShort: { vi: 'Mật khẩu cần ít nhất 8 ký tự.', en: 'Your password needs at least 8 characters.' },
  passwordMismatch: { vi: 'Hai mật khẩu chưa khớp nhau.', en: 'The two passwords do not match.' },
  passwordSame: {
    vi: 'Mật khẩu mới cần khác mật khẩu hiện tại.',
    en: 'Your new password must be different from the current one.',
  },
  nameRequired: { vi: 'Vui lòng nhập tên hiển thị.', en: 'Please enter a display name.' },
  nameLong: { vi: 'Tên hiển thị tối đa 60 ký tự.', en: 'Display name can be at most 60 characters.' },
  consentRequired: {
    vi: 'Bạn cần đồng ý với Chính sách bảo mật để tạo tài khoản.',
    en: 'Please agree to the privacy policy to create an account.',
  },
  phoneInvalid: {
    vi: 'Số điện thoại chưa đúng, ví dụ 0912 345 678.',
    en: 'Please enter a valid phone number, for example +84 912 345 678.',
  },
  tooLong: { vi: 'Tối đa {n} ký tự.', en: 'At most {n} characters.' },
  planRequired: { vi: 'Vui lòng chọn dịch vụ cần tư vấn.', en: 'Please choose a service.' },
  noteRequiredOther: {
    vi: 'Bạn ghi vài dòng về nhu cầu để ADS-Nolimit tư vấn đúng.',
    en: 'Please write a few lines about what you need.',
  },
  deleteConfirm: { vi: 'Vui lòng gõ đúng chữ {word} để xác nhận.', en: 'Type {word} to confirm.' },
  formHasErrors: { vi: 'Vui lòng kiểm tra lại các ô được đánh dấu.', en: 'Please check the highlighted fields.' },

  // Đang xử lý
  busySignIn: { vi: 'Đang đăng nhập…', en: 'Signing in…' },
  busySignUp: { vi: 'Đang tạo tài khoản…', en: 'Creating account…' },
  busyGoogle: { vi: 'Đang mở Google…', en: 'Opening Google…' },
  busySend: { vi: 'Đang gửi…', en: 'Sending…' },
  busySave: { vi: 'Đang lưu…', en: 'Saving…' },
  busyCheck: { vi: 'Đang kiểm tra…', en: 'Checking…' },
  busyDelete: { vi: 'Đang xóa…', en: 'Deleting…' },
  busyCancel: { vi: 'Đang hủy…', en: 'Cancelling…' },
  busySignOut: { vi: 'Đang đăng xuất…', en: 'Signing out…' },

  // Thông báo
  resetSent: {
    vi: 'Nếu email {email} đã có tài khoản ADS-Nolimit, bạn sẽ nhận được link đặt lại mật khẩu trong vài phút. Nhớ xem cả thư mục Spam/Quảng cáo.',
    en: 'If {email} has an ADS-Nolimit account, a password reset link will arrive in a few minutes. Remember to check your spam folder.',
  },
  resetDone: {
    vi: 'Mật khẩu của bạn đã được đặt lại. Bạn đăng nhập bằng mật khẩu mới nhé.',
    en: 'Your password has been reset. Sign in with your new password.',
  },
  alreadySignedIn: { vi: 'Bạn đang đăng nhập với {email}.', en: 'You are signed in as {email}.' },
  goToAccount: { vi: 'Vào trang tài khoản', en: 'Go to my account' },
  welcome: {
    vi: 'Đã tạo tài khoản. ADS-Nolimit vừa gửi email xác minh tới {email}: vui lòng kiểm tra email của bạn và bấm link để xác minh (nhớ xem cả thư mục Spam).',
    en: 'Your account is ready. We sent a verification email to {email}: open it and click the link to verify (check your spam folder too).',
  },
  welcomeNoVerify: {
    vi: 'Đã tạo tài khoản. Chưa gửi được email xác minh, bạn bấm “Gửi lại email xác minh” bên dưới nhé.',
    en: 'Your account is ready. We could not send the verification email yet: use “Resend verification email” below.',
  },
  welcomeGoogle: { vi: 'Chào mừng bạn đến với ADS-Nolimit!', en: 'Welcome to ADS-Nolimit!' },
  verifyResent: {
    vi: 'Đã gửi lại email xác minh tới {email}. Bạn mở email và bấm link, rồi bấm “Tôi đã xác minh”.',
    en: 'Verification email sent to {email}. Click the link in it, then press “I have verified”.',
  },
  verifyStill: {
    vi: 'Email vẫn chưa được xác minh. Bạn bấm link trong email rồi thử lại.',
    en: 'Your email is not verified yet. Click the link in the email, then try again.',
  },
  verifyDone: { vi: 'Email đã được xác minh. Cảm ơn bạn!', en: 'Your email is verified. Thank you!' },
  profileSaved: { vi: 'Đã lưu hồ sơ.', en: 'Profile saved.' },
  passwordChanged: { vi: 'Đã đổi mật khẩu.', en: 'Password changed.' },
  requestSent: {
    vi: 'Đã gửi yêu cầu. ADS-Nolimit sẽ xem và liên hệ lại với bạn. Cần gấp, bạn nhắn Zalo hoặc gọi hotline.',
    en: 'Request sent. ADS-Nolimit will review it and get back to you. If it is urgent, message us on Telegram or Zalo.',
  },
  requestCancelled: { vi: 'Đã hủy yêu cầu.', en: 'Request cancelled.' },
  noRequests: {
    vi: 'Bạn chưa gửi yêu cầu nào.',
    en: 'You have not sent any requests yet.',
  },
  loadFailed: {
    vi: 'Chưa tải được dữ liệu.',
    en: 'Could not load your data.',
  },
  retry: { vi: 'Thử lại', en: 'Try again' },
  cancelRequest: { vi: 'Hủy yêu cầu', en: 'Cancel request' },
  cancelConfirm: { vi: 'Hủy yêu cầu này?', en: 'Cancel this request?' },
  cancelYes: { vi: 'Có, hủy', en: 'Yes, cancel' },
  cancelNo: { vi: 'Không', en: 'No' },
  sentAt: { vi: 'Gửi lúc {date}', en: 'Sent {date}' },
  contactLabel: { vi: 'Liên hệ', en: 'Contact' },
  hello: { vi: 'Xin chào, {name}!', en: 'Hello, {name}!' },
  verified: { vi: 'Đã xác minh', en: 'Verified' },
  unverified: { vi: 'Chưa xác minh', en: 'Not verified' },
  providerPassword: { vi: 'Email & mật khẩu', en: 'Email & password' },
  providerGoogle: { vi: 'Google', en: 'Google' },
  and: { vi: ' và ', en: ' and ' },
  show: { vi: 'Hiện mật khẩu', en: 'Show password' },
  hide: { vi: 'Ẩn mật khẩu', en: 'Hide password' },
} satisfies Record<string, Text>;

export type MessageKey = keyof typeof text;

/** Chữ theo ngôn ngữ trang; thay {tên} bằng giá trị trong `vars`. */
export const m = (key: MessageKey, vars: Record<string, string | number> = {}): string =>
  pick(text[key]).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''));

/* ---------- Trạng thái yêu cầu dịch vụ ---------- */

export const requestStatuses = ['new', 'contacted', 'in_progress', 'done', 'cancelled'] as const;
export type RequestStatus = (typeof requestStatuses)[number];

const statusText: Record<RequestStatus, Text> = {
  new: { vi: 'Mới', en: 'New' },
  contacted: { vi: 'Đã liên hệ', en: 'Contacted' },
  in_progress: { vi: 'Đang triển khai', en: 'In progress' },
  done: { vi: 'Hoàn thành', en: 'Done' },
  cancelled: { vi: 'Đã hủy', en: 'Cancelled' },
};

export const statusLabel = (status: string): string =>
  (requestStatuses as readonly string[]).includes(status) ? pick(statusText[status as RequestStatus]) : status;

/** Ngày giờ theo giờ Việt Nam: 19/11/2026 16:20 (vi) hoặc 19 Nov 2026, 16:20 (en). */
export const formatDateTime = (date: Date): string =>
  new Intl.DateTimeFormat(pageLang() === 'en' ? 'en-GB' : 'vi-VN', {
    day: pageLang() === 'en' ? 'numeric' : '2-digit',
    month: pageLang() === 'en' ? 'short' : '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
