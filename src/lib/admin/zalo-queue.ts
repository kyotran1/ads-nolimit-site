/**
 * Quản trị — "Nhắc qua Zalo": hàng đợi tin nhắc ngân sách thấp (zaloQueue) do Apps Script bot 3 ghi.
 * Zalo không có cách chính thức cho số cá nhân gửi tự động, nên hệ thống chỉ SOẠN SẴN: Chủ tịch bấm
 * "Chép tin & mở Zalo", dán và gửi bằng tay từ số 0888 88 2823, rồi bấm "Đã gửi". (Thiết kế 26/11/2026.)
 */
import '../../styles/notify.css';
import { collection, deleteField, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore/lite';
import type { DocumentData } from 'firebase/firestore/lite';
import { copyText, h, toast } from '../ui/dom';
import { db, errText, str, time, when } from './shared';

type Status = 'cho' | 'da-gui' | 'bo-qua';
let tab: 'cho' | 'xong' = 'cho';

const statusText: Record<Status, string> = { cho: 'Chờ gửi', 'da-gui': 'Đã gửi', 'bo-qua': 'Bỏ qua' };
const statusBadge: Record<Status, string> = { cho: 'new', 'da-gui': 'done', 'bo-qua': 'cancelled' };

const loading = () => h('p', { class: 'row-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Đang tải…');
const empty = (text: string) => h('p', { class: 'adm-empty', text });

type Row = DocumentData & { id: string };

/** Mở Zalo của khách: https://zalo.me/<số 0xxxxxxxxx>. */
export const zaloLink = (phone: string) => `https://zalo.me/${phone}`;

const item = (r: Row, redraw: () => void) => {
  const status = (['cho', 'da-gui', 'bo-qua'].includes(str(r, 'status')) ? str(r, 'status') : 'cho') as Status;
  const phone = str(r, 'phone');
  const text = str(r, 'text');
  const note = h('p', { class: 'zq-note', role: 'status' });
  const setStatus = async (next: Status, label: string, btn: HTMLButtonElement) => {
    btn.disabled = true;
    try {
      await updateDoc(doc(db, 'zaloQueue', r.id), next === 'cho' ? { status: next, doneAt: deleteField() } : { status: next, doneAt: serverTimestamp() });
      toast(label);
      redraw();
    } catch (err) {
      toast(errText(err), 'error');
      btn.disabled = false;
    }
  };

  const main = h('button', { type: 'button', class: 'btn btn-primary zq-main', 'data-act': 'copy-open' }, 'Chép tin & mở Zalo') as HTMLButtonElement;
  main.addEventListener('click', () => {
    // Bắt đầu chép NGAY trong lúc bấm (trình duyệt điện thoại chỉ cho phép khi đang có thao tác bấm), rồi mở Zalo ở thẻ mới.
    const copying = copyText(text);
    window.open(zaloLink(phone), '_blank', 'noopener');
    void copying.then((ok) => {
      if (ok) {
        note.textContent = 'Đã chép tin. Dán vào Zalo rồi bấm Gửi.';
        toast('Đã chép tin — dán vào Zalo rồi Gửi.');
      } else {
        note.textContent = 'Chưa chép được. Chọn chữ trong khung tin ở trên, chép tay rồi dán vào Zalo.';
        toast('Chưa chép được tin, hãy chép tay từ khung tin.', 'error');
      }
    });
  });

  const actions =
    status === 'cho'
      ? h(
          'div',
          { class: 'zq-actions' },
          main,
          h(
            'div',
            { class: 'zq-sub' },
            (() => {
              const b = h('button', { type: 'button', class: 'btn', 'data-act': 'sent', text: 'Đã gửi' }) as HTMLButtonElement;
              b.addEventListener('click', () => void setStatus('da-gui', 'Đã đánh dấu: đã gửi.', b));
              return b;
            })(),
            (() => {
              const b = h('button', { type: 'button', class: 'btn btn-ghost', 'data-act': 'skip', text: 'Bỏ qua' }) as HTMLButtonElement;
              b.addEventListener('click', () => void setStatus('bo-qua', 'Đã bỏ qua tin này.', b));
              return b;
            })(),
          ),
        )
      : h(
          'div',
          { class: 'zq-actions' },
          (() => {
            const b = h('button', { type: 'button', class: 'btn', 'data-act': 'undo', text: 'Đưa lại vào hàng chờ' }) as HTMLButtonElement;
            b.addEventListener('click', () => void setStatus('cho', 'Đã đưa lại vào hàng chờ.', b));
            return b;
          })(),
        );

  return h(
    'article',
    { class: 'zq-item', 'data-status': status },
    h(
      'div',
      { class: 'zq-item-head' },
      h('h3', { class: 'zq-who', text: str(r, 'name') || str(r, 'uid') || 'Khách' }),
      h('span', { class: `badge badge--${statusBadge[status]}`, text: statusText[status] }),
    ),
    h(
      'dl',
      { class: 'zq-facts' },
      h('div', {}, h('dt', { text: 'Tài khoản quảng cáo' }), h('dd', { text: str(r, 'accountName') || str(r, 'actId') })),
      h('div', {}, h('dt', { text: 'Số Zalo của khách' }), h('dd', { class: 'zq-phone', text: phone })),
      h('div', {}, h('dt', { text: status === 'cho' ? 'Tạo lúc' : 'Xử lý lúc' }), h('dd', { text: when(status === 'cho' ? r.createdAt : (r.doneAt ?? r.createdAt)) })),
    ),
    h('p', { class: 'zq-text', text }),
    actions,
    note,
  );
};

export const renderZaloQueue = async (root: HTMLElement) => {
  const list = h('div', { class: 'zq-list' }, loading());
  const tabBtn = (id: 'cho' | 'xong', label: string) => {
    const b = h('button', { type: 'button', class: 'chip', 'data-zq-tab': id, 'aria-pressed': String(tab === id), text: label });
    b.addEventListener('click', () => {
      tab = id;
      void renderZaloQueue(root);
    });
    return b;
  };
  root.replaceChildren(
    h('p', {
      class: 'view-lead',
      text: 'Khách bật "Nhắc qua Zalo" sẽ có tin soạn sẵn ở đây khi tài khoản quảng cáo sắp hết ngân sách. Bấm "Chép tin & mở Zalo", dán và gửi từ số 0888 88 2823, rồi bấm "Đã gửi".',
    }),
    h('div', { class: 'zq-tabs chips', role: 'group', 'aria-label': 'Lọc' }, tabBtn('cho', 'Cần gửi'), tabBtn('xong', 'Đã xử lý')),
    list,
  );
  let rows: Row[];
  try {
    const coll = collection(db, 'zaloQueue');
    const snap = await getDocs(tab === 'cho' ? query(coll, where('status', '==', 'cho')) : query(coll, where('status', 'in', ['da-gui', 'bo-qua'])));
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    const retry = h('button', { type: 'button', class: 'btn btn-sm', text: 'Thử lại' });
    retry.addEventListener('click', () => void renderZaloQueue(root));
    list.replaceChildren(h('p', { class: 'adm-empty', text: errText(err) }), retry);
    return;
  }
  // mới nhất trước (tab đã xử lý: theo lúc xử lý)
  rows.sort((a, b) => (tab === 'cho' ? time(b) - time(a) : time(b, 'doneAt') - time(a, 'doneAt')));
  list.replaceChildren(...(rows.length ? rows.slice(0, 200).map((r) => item(r, () => void renderZaloQueue(root))) : [empty(tab === 'cho' ? 'Chưa có tin nào cần gửi.' : 'Chưa có tin nào đã xử lý.')]));
};
