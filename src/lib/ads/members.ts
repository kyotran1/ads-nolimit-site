/**
 * Nhiều tài khoản cùng xem một TKQC: các hàm thuần (chạy được trong Node, có test đơn vị).
 * adAccounts/{actId}: uid (tài khoản chính) + viewerUids/viewerEmails (người xem thêm, ≤ 10) + memberUids = [uid, ...viewerUids].
 * adReports: Apps Script ghi memberUids (lấy từ TKQC). Tài liệu cũ chưa có 3 trường → [] / [] / [uid].
 */

export interface AdMembers {
  viewerUids: string[];
  viewerEmails: string[];
  memberUids: string[];
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []);

/** Đọc 3 trường người xem từ tài liệu Firestore; memberUids luôn bắt đầu bằng uid chính, không trùng. */
export const parseMembers = (d: { uid?: unknown; viewerUids?: unknown; viewerEmails?: unknown; memberUids?: unknown }): AdMembers => {
  const uid = typeof d.uid === 'string' ? d.uid : '';
  const memberUids = [...new Set([...(uid ? [uid] : []), ...strings(d.memberUids)])];
  return { viewerUids: strings(d.viewerUids), viewerEmails: strings(d.viewerEmails), memberUids };
};

/** Gộp hai danh sách theo id: giữ thứ tự của a, thêm phần tử của b chưa có. */
export const mergeById = <T extends { id: string }>(a: T[], b: T[]): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of [...a, ...b]) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
};

/**
 * Gộp kết quả hai truy vấn chạy song song (uid == mình, memberUids array-contains mình).
 * Một truy vấn lỗi thì vẫn dùng kết quả truy vấn kia; chỉ khi cả hai lỗi mới ném lỗi của truy vấn đầu.
 */
export const mergeSettled = <T extends { id: string }>(results: [PromiseSettledResult<T[]>, PromiseSettledResult<T[]>]): T[] => {
  const [a, b] = results;
  if (a.status === 'rejected' && b.status === 'rejected') throw a.reason;
  return mergeById(a.status === 'fulfilled' ? a.value : [], b.status === 'fulfilled' ? b.value : []);
};
