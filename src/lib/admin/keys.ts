/**
 * Quản trị — Key & máy (ADS-NOLIMIT AI Office): cấp key cho khách theo email, đặt lại máy, thu hồi / mở lại key,
 * xử lý yêu cầu đổi máy của khách.
 */
import { collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore/lite';
import type { DocumentData } from 'firebase/firestore/lite';
import { confirmDialog, copyButton, h, icon, toast } from '../ui/dom';
import { badge, buildForm, customerByEmail, db, errText, loadCustomers, me, num, ops, str, time, when, who } from './shared';

const copyLabels = { copy: 'Chép', copied: 'Đã chép', failed: 'Lỗi' };

export const renderKeys = async (root: HTMLElement) => {
  const f = buildForm(
    [
      { name: 'email', label: 'Email khách', type: 'email', required: true, placeholder: 'khach@example.com', hint: 'Khách cần đăng nhập trang tài khoản ít nhất một lần để có trong danh sách.' },
      { name: 'plan', label: 'Gói', required: true, value: 'AI Office', maxlength: 60 },
      { name: 'maxMachines', label: 'Số máy tối đa', type: 'number', required: true, value: 1, inputmode: 'numeric' },
      { name: 'note', label: 'Ghi chú nội bộ', maxlength: 300 },
    ],
    'Cấp key',
  );
  const issued = h('div', { class: 'adm-issued', 'aria-live': 'polite' });
  f.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.clearErrors();
    f.alert.replaceChildren();
    const max = Number(f.value('maxMachines'));
    if (!f.value('email')) f.setError('email', 'Nhập email khách.');
    if (!f.value('plan')) f.setError('plan', 'Nhập tên gói.');
    if (!Number.isInteger(max) || max < 1 || max > 50) f.setError('maxMachines', 'Từ 1 đến 50 máy.');
    if (f.focusFirstError()) return;
    f.submit.disabled = true;
    try {
      const c = await customerByEmail(f.value('email'));
      if (!c) {
        f.setError('email', 'Không tìm thấy khách với email này.');
        f.focusFirstError();
        return;
      }
      const key = await ops.issueKey(me(), { uid: c.uid, email: c.email, plan: f.value('plan'), maxMachines: max, note: f.value('note') || undefined });
      issued.replaceChildren(
        h('div', { class: 'auth-alert', 'data-kind': 'success' }, h('p', {}, 'Đã cấp key cho ', h('strong', { text: c.email }), ':'), h('p', { class: 'adm-code' }, h('strong', { class: 'mono', text: key }), copyButton(() => key, copyLabels, 'key'))),
      );
      toast('Đã cấp key.');
      void drawLists();
    } catch (err) {
      f.alert.replaceChildren(h('p', { text: errText(err) }));
    } finally {
      f.submit.disabled = false;
    }
  });

  const requests = h('div', { class: 'adm-list' });
  const keys = h('div', { class: 'adm-list' });
  root.replaceChildren(
    h('p', { class: 'view-lead', text: 'Key bản quyền ADS-NOLIMIT AI Office (dạng AINO-XXXX-XXXX-XXXX). Khách thấy key, gói và các máy đã kích hoạt ở mục Key & máy.' }),
    h('section', { class: 'panel' }, h('h2', { text: 'Cấp key mới' }), f.form, issued),
    h('section', {}, h('h2', { class: 'sub-title', text: 'Yêu cầu đổi máy' }), requests),
    h('section', {}, h('h2', { class: 'sub-title', text: 'Tất cả key' }), keys),
  );

  const drawLists = async () => {
    requests.replaceChildren(h('p', { class: 'row-loading', text: 'Đang tải…' }));
    keys.replaceChildren();
    let keyDocs: (DocumentData & { id: string })[];
    let reqDocs: (DocumentData & { id: string })[];
    try {
      await loadCustomers();
      [keyDocs, reqDocs] = await Promise.all(
        ['keys', 'keyRequests'].map(async (c) => (await getDocs(collection(db, c))).docs.map((d) => ({ id: d.id, ...d.data() }) as DocumentData & { id: string }).sort((a, b) => time(b) - time(a))),
      );
    } catch (err) {
      requests.replaceChildren(h('div', { class: 'auth-alert', role: 'alert', text: errText(err) }));
      return;
    }
    const pending = reqDocs.filter((r) => str(r, 'status') === 'new');
    requests.replaceChildren(
      ...(pending.length
        ? pending.map((r) => {
            const done = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, icon('refresh'), 'Đặt lại máy & xong');
            done.addEventListener('click', async () => {
              done.disabled = true;
              try {
                await ops.resetMachines(str(r, 'keyId'));
                await updateDoc(doc(db, 'keyRequests', r.id), { status: 'done', decidedAt: serverTimestamp(), adminNote: 'Đã đặt lại danh sách máy.' });
                toast('Đã đặt lại máy.');
                void drawLists();
              } catch (err) {
                toast(errText(err), 'error');
                done.disabled = false;
              }
            });
            const reject = h('button', { type: 'button', class: 'btn btn-sm btn-danger', text: 'Không xử lý' });
            reject.addEventListener('click', async () => {
              const ok = await confirmDialog({ title: 'Không xử lý yêu cầu đổi máy?', confirm: 'Xác nhận', cancel: 'Quay lại', danger: true, input: { label: 'Lý do (khách thấy được)', maxlength: 300 } });
              if (!ok.ok) return;
              try {
                await updateDoc(doc(db, 'keyRequests', r.id), { status: 'rejected', decidedAt: serverTimestamp(), adminNote: ok.value });
                void drawLists();
              } catch (err) {
                toast(errText(err), 'error');
              }
            });
            return h(
              'article',
              { class: 'adm-item' },
              h('div', { class: 'adm-item-head' }, h('strong', { class: 'mono', text: str(r, 'keyId') }), badge('new')),
              h('dl', { class: 'adm-facts' }, h('div', {}, h('dt', { text: 'Khách' }), h('dd', { text: who(str(r, 'uid'), str(r, 'email')) })), h('div', {}, h('dt', { text: 'Gửi lúc' }), h('dd', { text: when(r.createdAt) }))),
              r.note ? h('p', { class: 'adm-note pre', text: str(r, 'note') }) : null,
              h('div', { class: 'adm-actions' }, done, reject),
            );
          })
        : [h('p', { class: 'adm-empty', text: 'Không có yêu cầu đổi máy nào đang chờ.' })]),
    );
    keys.replaceChildren(
      ...(keyDocs.length
        ? keyDocs.map((k) => {
            const machines = Array.isArray(k.machines) ? (k.machines as DocumentData[]) : [];
            const active = str(k, 'status') === 'active';
            const reset = h('button', { type: 'button', class: 'btn btn-sm', disabled: machines.length === 0 }, icon('refresh'), 'Đặt lại máy');
            reset.addEventListener('click', async () => {
              const ok = await confirmDialog({ title: `Gỡ ${machines.length} máy khỏi ${k.id}?`, confirm: 'Đặt lại', cancel: 'Quay lại' });
              if (!ok.ok) return;
              try {
                await ops.resetMachines(k.id);
                toast('Đã đặt lại máy.');
                void drawLists();
              } catch (err) {
                toast(errText(err), 'error');
              }
            });
            const status = h('button', { type: 'button', class: `btn btn-sm${active ? ' btn-danger' : ''}`, text: active ? 'Thu hồi' : 'Mở lại' });
            status.addEventListener('click', async () => {
              const ok = await confirmDialog({ title: active ? `Thu hồi key ${k.id}?` : `Mở lại key ${k.id}?`, confirm: active ? 'Thu hồi' : 'Mở lại', cancel: 'Quay lại', danger: active });
              if (!ok.ok) return;
              try {
                await ops.setKeyStatus(k.id, active ? 'revoked' : 'active');
                void drawLists();
              } catch (err) {
                toast(errText(err), 'error');
              }
            });
            return h(
              'article',
              { class: 'adm-item', 'data-key': k.id },
              h('div', { class: 'adm-item-head' }, h('div', { class: 'adm-code' }, h('strong', { class: 'mono', text: k.id }), copyButton(() => k.id, copyLabels, 'key')), badge(str(k, 'status'))),
              h(
                'dl',
                { class: 'adm-facts' },
                h('div', {}, h('dt', { text: 'Khách' }), h('dd', { text: who(str(k, 'uid'), str(k, 'email')) })),
                h('div', {}, h('dt', { text: 'Gói' }), h('dd', { text: str(k, 'plan') })),
                h('div', {}, h('dt', { text: 'Máy' }), h('dd', { text: `${machines.length}/${num(k, 'maxMachines')}` })),
                h('div', {}, h('dt', { text: 'Cấp lúc' }), h('dd', { text: when(k.createdAt) })),
              ),
              machines.length ? h('ul', { class: 'machine-list' }, ...machines.map((m) => h('li', {}, icon('monitor'), h('span', { class: 'machine-name', text: str(m, 'name') || str(m, 'id') }), h('span', { class: 'machine-date', text: when(m.activatedAt) })))) : null,
              h('div', { class: 'adm-actions' }, reset, status),
            );
          })
        : [h('p', { class: 'adm-empty', text: 'Chưa cấp key nào.' })]),
    );
  };
  void drawLists();
};
