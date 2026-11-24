/**
 * Quản trị — người xem thêm của một TKQC (adAccounts: viewerUids, viewerEmails, memberUids).
 * Hàm thuần, không phụ thuộc trình duyệt/Firebase để test được bằng Node.
 */
export const MAX_VIEWERS = 10;

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Tách ô nhập "mỗi dòng một email" → danh sách email chuẩn (chữ thường, không trùng) + lỗi nêu đúng email sai. */
export const parseViewerEmails = (text: string, mainEmail: string): { emails: string[]; errors: string[] } => {
  const main = mainEmail.trim().toLowerCase();
  const emails: string[] = [];
  const errors: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase();
    if (!e || emails.includes(e)) continue;
    if (!EMAIL.test(e)) errors.push(`"${raw.trim()}" không phải địa chỉ email.`);
    else if (e === main) errors.push(`${e} là email khách chính, không cần nhập lại ở ô người xem thêm.`);
    else emails.push(e);
  }
  if (emails.length > MAX_VIEWERS) errors.push(`Chỉ được thêm tối đa ${MAX_VIEWERS} người xem (đang nhập ${emails.length}).`);
  return { emails, errors };
};

/** Đọc mảng chuỗi từ dữ liệu Firestore; sai kiểu → rỗng; bỏ phần tử không phải chuỗi / rỗng. */
export const readStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);

/** Ba trường ghi vào adAccounts: chính luôn đứng đầu memberUids; bỏ người xem trùng nhau hoặc trùng chính. */
export const buildMembers = (mainUid: string, viewers: { uid: string; email: string }[]) => {
  const seen = new Set<string>([mainUid]);
  const kept: { uid: string; email: string }[] = [];
  for (const v of viewers) {
    if (seen.has(v.uid)) continue;
    seen.add(v.uid);
    kept.push(v);
  }
  const viewerUids = kept.map((v) => v.uid);
  return { viewerUids, viewerEmails: kept.map((v) => v.email), memberUids: [mainUid, ...viewerUids] };
};

/** Vai của một uid trong một TKQC (dữ liệu thô Firestore): tài khoản chính, người xem thêm, hoặc không thuộc. */
export const roleInAccount = (raw: { uid?: unknown; memberUids?: unknown }, uid: string): 'main' | 'viewer' | null => {
  if (raw.uid === uid) return 'main';
  return readStrings(raw.memberUids).includes(uid) ? 'viewer' : null;
};
