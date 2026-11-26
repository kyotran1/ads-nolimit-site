/**
 * Quản trị — "Nhắc qua Zalo": hàng đợi tin nhắc ngân sách thấp (zaloQueue) do Apps Script bot 3 ghi.
 * Zalo không có cách chính thức cho số cá nhân gửi tự động, nên hệ thống chỉ SOẠN SẴN: Chủ tịch bấm
 * "Chép tin & mở Zalo", dán và gửi bằng tay từ số 0888 88 2823, rồi bấm "Đã gửi". (Thiết kế 26/11/2026.)
 */
import '../../styles/notify.css';
import { collection, deleteField, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore/lite';
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

  // Hai bước, để chạy được trên iPhone Safari và Chrome Android (trình duyệt điện thoại chặn cửa sổ mở sau khi đã chờ):
  //  1) bấm "Chép tin & mở Zalo": chờ chép xong, rồi nút này đổi thành một liên kết thật "Mở Zalo";
  //  2) bấm liên kết (thao tác bấm thật, target=_blank) → Zalo mở, dán tin rồi gửi.
  const main = h('button', { type: 'button', class: 'btn btn-primary zq-main', 'data-act': 'copy-open' }, 'Chép tin & mở Zalo') as HTMLButtonElement;
  const openZalo = h('a', { class: 'btn btn-primary zq-main', href: zaloLink(phone), target: '_blank', rel: 'noopener', 'data-act': 'open-zalo', hidden: true }, 'Mở Zalo');
  main.addEventListener('click', async () => {
    main.disabled = true;
    const ok = await copyText(text);
    main.hidden = true;
    main.disabled = false;
    openZalo.hidden = false;
    if (ok) {
      note.textContent = 'Đã chép — bấm Mở Zalo, dán tin rồi bấm Gửi.';
      toast('Đã chép tin — bấm Mở Zalo.');
    } else {
      note.textContent = 'Chưa chép được. Chọn chữ trong khung tin ở trên, chép tay, rồi bấm Mở Zalo và dán vào.';
      toast('Chưa chép được tin, hãy chép tay từ khung tin.', 'error');
    }
    openZalo.focus();
  });

  const actions =
    status === 'cho'
      ? h(
          'div',
          { class: 'zq-actions' },
          main,
          openZalo,
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
    if (tab === 'cho') {
      const snap = await getDocs(query(coll, where('status', '==', 'cho')));
      rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => time(b) - time(a));
    } else {
      // Tab "Đã xử lý": chỉ lấy 100 tin mới nhất (cần chỉ mục status + createdAt, xem firestore.indexes.json).
      const done = ['da-gui', 'bo-qua'];
      try {
        rows = (await getDocs(query(coll, where('status', 'in', done), orderBy('createdAt', 'desc'), limit(100)))).docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (err) {
        // Chỉ mục chưa được triển khai: lấy theo trạng thái rồi sắp xếp và cắt 100 tại trình duyệt
        if (!String((err as { code?: string })?.code ?? '').includes('failed-precondition')) throw err;
        rows = (await getDocs(query(coll, where('status', 'in', done)))).docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => time(b) - time(a));
        rows = rows.slice(0, 100);
      }
    }
  } catch (err) {
    const retry = h('button', { type: 'button', class: 'btn btn-sm', text: 'Thử lại' });
    retry.addEventListener('click', () => void renderZaloQueue(root));
    list.replaceChildren(h('p', { class: 'adm-empty', text: errText(err) }), retry);
    return;
  }
  list.replaceChildren(...(rows.length ? rows.slice(0, tab === 'cho' ? 200 : 100).map((r) => item(r, () => void renderZaloQueue(root))) : [empty(tab === 'cho' ? 'Chưa có tin nào cần gửi.' : 'Chưa có tin nào đã xử lý.')]));
};
