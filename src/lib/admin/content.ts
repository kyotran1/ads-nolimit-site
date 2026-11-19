/**
 * Quản trị — Khóa học & Hướng dẫn: thêm/sửa/xóa khóa học, bài học (video), cấp / thu hồi quyền học,
 * thêm/sửa/xóa bài hướng dẫn. Khách chỉ thấy khóa học / bài hướng dẫn đã bật "Đăng".
 */
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore/lite';
import type { DocumentData } from 'firebase/firestore/lite';
import { confirmDialog, h, icon, toast } from '../ui/dom';
import { badge, buildForm, customerByEmail, db, errText, loadCustomers, me, money, num, parseVnd, slugify, str, when, who } from './shared';

type Row = DocumentData & { id: string };
const COVERS = [
  ['aurora', 'Tím → xanh dương → xanh ngọc'],
  ['ocean', 'Xanh dương → xanh ngọc'],
  ['sunset', 'Tím → hồng → cam'],
  ['forest', 'Xanh ngọc → xanh lá'],
  ['violet', 'Tím'],
  ['gold', 'Vàng'],
] as const;
const DURATION_RE = /^\d{1,3}(:\d{1,2}){0,2}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const okUrl = (u: string) => !u || /^https:\/\/\S+$/.test(u);

const list = async (path: string) =>
  (await getDocs(collection(db, path))).docs.map((d) => ({ id: d.id, ...d.data() }) as Row).sort((a, b) => num(a, 'sort') - num(b, 'sort') || str(a, 'title').localeCompare(str(b, 'title')));

let editingCourse = '';
let editingGuide = '';

export const renderContent = async (root: HTMLElement) => {
  const courses = h('div', { class: 'adm-list' }, h('p', { class: 'row-loading', text: 'Đang tải…' }));
  const editor = h('div', { class: 'adm-editor' });
  const guides = h('div', { class: 'adm-list' });
  const guideEditor = h('div', { class: 'adm-editor' });
  const addCourse = h('button', { type: 'button', class: 'btn btn-sm' }, icon('plus'), 'Khóa học mới');
  addCourse.addEventListener('click', () => {
    editingCourse = '';
    void courseEditor(editor, null, reload);
    editor.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  const addGuide = h('button', { type: 'button', class: 'btn btn-sm' }, icon('plus'), 'Bài hướng dẫn mới');
  addGuide.addEventListener('click', () => {
    editingGuide = '';
    guideForm(guideEditor, null, reload);
    guideEditor.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  root.replaceChildren(
    h('p', { class: 'view-lead', text: 'Khóa học: khách mua bằng số dư (hoặc bạn cấp quyền), bài học chỉ mở cho người có quyền. Hướng dẫn: mọi khách đã đăng nhập đọc được. Chỉ mục đã bật "Đăng" mới hiện cho khách.' }),
    h('section', {}, h('div', { class: 'panel-head' }, h('h2', { class: 'sub-title', text: 'Khóa học' }), addCourse), courses, editor),
    h('section', {}, h('div', { class: 'panel-head' }, h('h2', { class: 'sub-title', text: 'Hướng dẫn sử dụng' }), addGuide), guides, guideEditor),
  );

  const reload = async () => {
    let cs: Row[];
    let gs: Row[];
    try {
      [cs, gs] = await Promise.all([list('courses'), list('guides')]);
    } catch (err) {
      courses.replaceChildren(h('div', { class: 'auth-alert', role: 'alert', text: errText(err) }));
      return;
    }
    courses.replaceChildren(
      ...(cs.length
        ? cs.map((c) => {
            const edit = h('button', { type: 'button', class: 'btn btn-sm', text: 'Sửa / bài học / quyền học' });
            edit.addEventListener('click', () => {
              editingCourse = c.id;
              void courseEditor(editor, c, reload);
              editor.scrollIntoView({ block: 'start', behavior: 'smooth' });
            });
            const outline = Array.isArray(c.outline) ? c.outline.length : 0;
            return h(
              'article',
              { class: 'adm-item', 'data-course': c.id },
              h('div', { class: 'adm-item-head' }, h('strong', { class: 'adm-title', text: str(c, 'title') }), h('span', { class: `badge ${c.published ? 'badge--active' : 'badge--cancelled'}`, text: c.published ? 'Đã đăng' : 'Nháp' })),
              h('p', { class: 'muted small', text: `${c.id} · ${num(c, 'price') ? money(num(c, 'price')) : 'Miễn phí'} · ${outline} bài` }),
              h('div', { class: 'adm-actions' }, edit),
            );
          })
        : [h('p', { class: 'adm-empty', text: 'Chưa có khóa học nào. Bấm "Khóa học mới" để thêm.' })]),
    );
    guides.replaceChildren(
      ...(gs.length
        ? gs.map((g) => {
            const edit = h('button', { type: 'button', class: 'btn btn-sm', text: 'Sửa' });
            edit.addEventListener('click', () => {
              editingGuide = g.id;
              guideForm(guideEditor, g, reload);
              guideEditor.scrollIntoView({ block: 'start', behavior: 'smooth' });
            });
            return h(
              'article',
              { class: 'adm-item', 'data-guide': g.id },
              h('div', { class: 'adm-item-head' }, h('strong', { class: 'adm-title', text: str(g, 'title') }), h('span', { class: `badge ${g.published ? 'badge--active' : 'badge--cancelled'}`, text: g.published ? 'Đã đăng' : 'Nháp' })),
              h('p', { class: 'muted small', text: `${g.id} · ${str(g, 'category')}` }),
              h('div', { class: 'adm-actions' }, edit),
            );
          })
        : [h('p', { class: 'adm-empty', text: 'Chưa có bài hướng dẫn nào.' })]),
    );
    if (editingCourse) {
      const c = cs.find((x) => x.id === editingCourse);
      if (c && !editor.childElementCount) void courseEditor(editor, c, reload);
    }
  };
  await reload();
};

/* ---------- Khóa học ---------- */

const courseEditor = async (box: HTMLElement, c: Row | null, reload: () => Promise<void>) => {
  const isNew = !c;
  const f = buildForm(
    [
      { name: 'title', label: 'Tên khóa học (tiếng Việt)', required: true, maxlength: 160, value: c ? str(c, 'title') : '', wide: true },
      { name: 'titleEn', label: 'Tên tiếng Anh', maxlength: 160, value: c ? str(c, 'titleEn') : '', wide: true },
      { name: 'id', label: 'Mã khóa học (đường dẫn)', required: true, maxlength: 60, value: c ? c.id : '', hint: isNew ? 'Chữ thường không dấu, số, gạch nối. Để trống: tự tạo từ tên.' : 'Không đổi được sau khi tạo.' },
      { name: 'sort', label: 'Thứ tự', type: 'number', value: c ? num(c, 'sort') : 1 },
      { name: 'price', label: 'Giá (VNĐ, 0 = miễn phí)', type: 'number', required: true, value: c ? num(c, 'price') : 990000 },
      { name: 'priceUsd', label: 'Giá USD (hiện trên trang tiếng Anh)', type: 'number', value: c && typeof c.priceUsd === 'number' ? c.priceUsd : '' },
      { name: 'cover', label: 'Màu bìa', type: 'select', value: c ? str(c, 'cover') || 'aurora' : 'aurora', options: COVERS.map(([v, l]) => ({ value: v, label: l })) },
      { name: 'published', label: 'Đăng (khách thấy khóa học này)', type: 'checkbox', value: c ? c.published === true : false },
      { name: 'description', label: 'Mô tả (tiếng Việt)', type: 'textarea', maxlength: 2000, rows: 3, value: c ? str(c, 'description') : '' },
      { name: 'descriptionEn', label: 'Mô tả tiếng Anh', type: 'textarea', maxlength: 2000, rows: 3, value: c ? str(c, 'descriptionEn') : '' },
    ],
    isNew ? 'Tạo khóa học' : 'Lưu khóa học',
  );
  if (!isNew) (f.inputs.get('id') as HTMLInputElement).readOnly = true;
  f.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.clearErrors();
    f.alert.replaceChildren();
    const id = isNew ? f.value('id') || slugify(f.value('title')) : c!.id;
    const price = parseVnd(f.value('price'));
    const usd = f.value('priceUsd') ? Number(f.value('priceUsd')) : null;
    const sort = Number(f.value('sort') || 0);
    if (!f.value('title')) f.setError('title', 'Nhập tên khóa học.');
    if (!ID_RE.test(id)) f.setError('id', 'Mã chỉ gồm chữ thường không dấu, số và gạch nối.');
    if (!Number.isInteger(price) || price < 0) f.setError('price', 'Giá là số nguyên ≥ 0.');
    if (usd !== null && (!Number.isFinite(usd) || usd < 0)) f.setError('priceUsd', 'Giá USD không hợp lệ.');
    if (!Number.isInteger(sort)) f.setError('sort', 'Thứ tự là số nguyên.');
    if (f.focusFirstError()) return;
    const data: Record<string, unknown> = {
      title: f.value('title'),
      titleEn: f.value('titleEn'),
      description: f.value('description'),
      descriptionEn: f.value('descriptionEn'),
      price,
      cover: f.value('cover'),
      published: f.checked('published'),
      sort,
      updatedAt: serverTimestamp(),
    };
    if (usd !== null) data.priceUsd = usd;
    if (isNew) {
      data.createdAt = serverTimestamp();
      data.outline = [];
    }
    f.submit.disabled = true;
    try {
      await setDoc(doc(db, 'courses', id), data, { merge: true });
      toast(isNew ? 'Đã tạo khóa học.' : 'Đã lưu khóa học.');
      editingCourse = id;
      box.replaceChildren();
      await reload();
    } catch (err) {
      f.alert.replaceChildren(h('p', { text: errText(err) }));
    } finally {
      f.submit.disabled = false;
    }
  });
  const parts: Node[] = [h('h3', { class: 'adm-sub', text: isNew ? 'Khóa học mới' : `Sửa: ${str(c!, 'title')}` }), f.form];
  if (!isNew) {
    const del = h('button', { type: 'button', class: 'btn btn-sm btn-danger' }, icon('x'), 'Xóa khóa học');
    del.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: `Xóa khóa học "${str(c!, 'title')}"?`, body: ['Xóa cả bài học. Quyền học đã cấp vẫn còn trong dữ liệu nhưng không dùng được. Khách đã mua sẽ không vào học được nữa — nên hoàn tiền trước.'], confirm: 'Xóa', cancel: 'Quay lại', danger: true });
      if (!ok.ok) return;
      try {
        const lessons = await getDocs(collection(db, 'courses', c!.id, 'lessons'));
        for (const l of lessons.docs) await deleteDoc(l.ref);
        await deleteDoc(doc(db, 'courses', c!.id));
        editingCourse = '';
        box.replaceChildren();
        toast('Đã xóa khóa học.');
        await reload();
      } catch (err) {
        toast(errText(err), 'error');
      }
    });
    parts.push(h('div', { class: 'adm-actions' }, del));
    const lessonsBox = h('div', {});
    const accessBox = h('div', {});
    parts.push(h('h3', { class: 'adm-sub', text: 'Bài học' }), lessonsBox, h('h3', { class: 'adm-sub', text: 'Quyền học' }), accessBox);
    void lessonsEditor(lessonsBox, c!.id, reload);
    void accessEditor(accessBox, c!.id);
  }
  box.replaceChildren(h('div', { class: 'panel' }, ...parts));
};

/** Ghi lại danh sách bài (tên + thời lượng) vào khóa học để khách chưa mở khóa vẫn xem được đề cương. */
const syncOutline = async (courseId: string) => {
  const lessons = await list(`courses/${courseId}/lessons`);
  await updateDoc(doc(db, 'courses', courseId), {
    outline: lessons.map((l) => ({ title: str(l, 'title'), titleEn: str(l, 'titleEn'), duration: str(l, 'duration') })),
    updatedAt: serverTimestamp(),
  });
};

const lessonsEditor = async (box: HTMLElement, courseId: string, reload: () => Promise<void>) => {
  let lessons: Row[];
  try {
    lessons = await list(`courses/${courseId}/lessons`);
  } catch (err) {
    box.replaceChildren(h('div', { class: 'auth-alert', role: 'alert', text: errText(err) }));
    return;
  }
  const formBox = h('div', {});
  const showForm = (l: Row | null) => {
    const f = buildForm(
      [
        { name: 'title', label: 'Tên bài (tiếng Việt)', required: true, maxlength: 160, value: l ? str(l, 'title') : '', wide: true },
        { name: 'titleEn', label: 'Tên tiếng Anh', maxlength: 160, value: l ? str(l, 'titleEn') : '', wide: true },
        { name: 'videoUrl', label: 'Link video', type: 'url', maxlength: 500, value: l ? str(l, 'videoUrl') : '', wide: true, hint: 'YouTube, Google Drive (chia sẻ "Bất kỳ ai có đường liên kết"), Vimeo, hoặc file .mp4 (https).' },
        { name: 'duration', label: 'Thời lượng (phút:giây)', maxlength: 12, value: l ? str(l, 'duration') : '', placeholder: '12:30' },
        { name: 'sort', label: 'Thứ tự', type: 'number', value: l ? num(l, 'sort') : lessons.length + 1 },
      ],
      l ? 'Lưu bài học' : 'Thêm bài học',
    );
    f.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      f.clearErrors();
      if (!f.value('title')) f.setError('title', 'Nhập tên bài.');
      if (!okUrl(f.value('videoUrl'))) f.setError('videoUrl', 'Link phải bắt đầu bằng https://');
      if (f.value('duration') && !DURATION_RE.test(f.value('duration'))) f.setError('duration', 'Dạng 12:30 hoặc 1:02:03.');
      if (!Number.isInteger(Number(f.value('sort') || 0))) f.setError('sort', 'Số nguyên.');
      if (f.focusFirstError()) return;
      const id = l ? l.id : `l${Date.now().toString(36)}`;
      f.submit.disabled = true;
      try {
        await setDoc(doc(db, 'courses', courseId, 'lessons', id), {
          title: f.value('title'),
          titleEn: f.value('titleEn'),
          videoUrl: f.value('videoUrl'),
          duration: f.value('duration'),
          sort: Number(f.value('sort') || 0),
          updatedAt: serverTimestamp(),
        });
        await syncOutline(courseId);
        toast('Đã lưu bài học.');
        void lessonsEditor(box, courseId, reload);
        void reload();
      } catch (err) {
        f.alert.replaceChildren(h('p', { text: errText(err) }));
        f.submit.disabled = false;
      }
    });
    formBox.replaceChildren(f.form);
  };
  box.replaceChildren(
    lessons.length
      ? h(
          'ol',
          { class: 'adm-lessons' },
          ...lessons.map((l) => {
            const edit = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: 'Sửa' });
            edit.addEventListener('click', () => showForm(l));
            const del = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: 'Xóa' });
            del.addEventListener('click', async () => {
              const ok = await confirmDialog({ title: `Xóa bài "${str(l, 'title')}"?`, confirm: 'Xóa', cancel: 'Quay lại', danger: true });
              if (!ok.ok) return;
              try {
                await deleteDoc(doc(db, 'courses', courseId, 'lessons', l.id));
                await syncOutline(courseId);
                void lessonsEditor(box, courseId, reload);
                void reload();
              } catch (err) {
                toast(errText(err), 'error');
              }
            });
            return h('li', {}, h('span', { class: 'adm-lesson-title', text: `${str(l, 'title')}${str(l, 'duration') ? ` · ${str(l, 'duration')}` : ''}` }), h('span', { class: 'muted small', text: str(l, 'videoUrl') || '(chưa có video)' }), h('span', { class: 'adm-actions' }, edit, del));
          }),
        )
      : h('p', { class: 'adm-empty', text: 'Chưa có bài học.' }),
    formBox,
  );
  showForm(null);
};

const accessEditor = async (box: HTMLElement, courseId: string) => {
  let rows: Row[];
  try {
    await loadCustomers();
    rows = (await getDocs(query(collection(db, 'courseAccess'), where('courseId', '==', courseId)))).docs.map((d) => ({ id: d.id, ...d.data() }) as Row);
  } catch (err) {
    box.replaceChildren(h('div', { class: 'auth-alert', role: 'alert', text: errText(err) }));
    return;
  }
  const f = buildForm([{ name: 'email', label: 'Cấp quyền học cho email', type: 'email', required: true, placeholder: 'khach@example.com' }], 'Cấp quyền');
  f.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.clearErrors();
    const c = await customerByEmail(f.value('email'));
    if (!c) {
      f.setError('email', 'Không tìm thấy khách với email này.');
      f.focusFirstError();
      return;
    }
    try {
      await setDoc(doc(db, 'courseAccess', `${c.uid}_${courseId}`), { uid: c.uid, courseId, source: 'admin', by: me(), createdAt: serverTimestamp() });
      toast(`Đã cấp quyền học cho ${c.email}.`);
      void accessEditor(box, courseId);
    } catch (err) {
      f.alert.replaceChildren(h('p', { text: errText(err) }));
    }
  });
  box.replaceChildren(
    rows.length
      ? h(
          'ul',
          { class: 'adm-lessons' },
          ...rows.map((r) => {
            const revoke = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', text: 'Thu hồi' });
            revoke.addEventListener('click', async () => {
              const ok = await confirmDialog({ title: 'Thu hồi quyền học?', body: [who(str(r, 'uid')), str(r, 'source') === 'purchase' ? 'Khách đã TRẢ TIỀN cho khóa này: nên dùng "Hoàn tiền" ở mục Đơn hàng (tự thu hồi quyền học).' : ''], confirm: 'Thu hồi', cancel: 'Quay lại', danger: true });
              if (!ok.ok) return;
              try {
                await deleteDoc(doc(db, 'courseAccess', r.id));
                void accessEditor(box, courseId);
              } catch (err) {
                toast(errText(err), 'error');
              }
            });
            const source = { purchase: 'Mua bằng số dư', admin: 'Bạn cấp', free: 'Khóa miễn phí' }[str(r, 'source')] ?? str(r, 'source');
            return h('li', {}, h('span', { class: 'adm-lesson-title', text: who(str(r, 'uid')) }), h('span', { class: 'muted small', text: `${source} · ${when(r.createdAt)}` }), h('span', { class: 'adm-actions' }, revoke));
          }),
        )
      : h('p', { class: 'adm-empty', text: 'Chưa ai có quyền học khóa này.' }),
    f.form,
  );
};

/* ---------- Hướng dẫn ---------- */

const guideForm = (box: HTMLElement, g: Row | null, reload: () => Promise<void>) => {
  const isNew = !g;
  const f = buildForm(
    [
      { name: 'title', label: 'Tiêu đề (tiếng Việt)', required: true, maxlength: 160, value: g ? str(g, 'title') : '', wide: true },
      { name: 'titleEn', label: 'Tiêu đề tiếng Anh', maxlength: 160, value: g ? str(g, 'titleEn') : '', wide: true },
      { name: 'id', label: 'Mã bài (đường dẫn)', required: true, maxlength: 60, value: g ? g.id : '', hint: isNew ? 'Để trống: tự tạo từ tiêu đề.' : 'Không đổi được sau khi tạo.' },
      { name: 'sort', label: 'Thứ tự', type: 'number', value: g ? num(g, 'sort') : 1 },
      { name: 'category', label: 'Chủ đề (tiếng Việt)', required: true, maxlength: 60, value: g ? str(g, 'category') : '', placeholder: 'Ví dụ: Tài khoản & số dư' },
      { name: 'categoryEn', label: 'Chủ đề tiếng Anh', maxlength: 60, value: g ? str(g, 'categoryEn') : '' },
      { name: 'videoUrl', label: 'Link video', type: 'url', maxlength: 500, value: g ? str(g, 'videoUrl') : '', wide: true },
      { name: 'published', label: 'Đăng (khách thấy bài này)', type: 'checkbox', value: g ? g.published === true : false },
      { name: 'body', label: 'Nội dung (tiếng Việt)', type: 'textarea', maxlength: 20000, rows: 10, value: g ? str(g, 'body') : '', hint: 'Viết thường hoặc Markdown đơn giản: # Tiêu đề, - gạch đầu dòng, 1. đánh số, **đậm**, *nghiêng*, [chữ](https://link).' },
      { name: 'bodyEn', label: 'Nội dung tiếng Anh', type: 'textarea', maxlength: 20000, rows: 6, value: g ? str(g, 'bodyEn') : '' },
    ],
    isNew ? 'Tạo bài hướng dẫn' : 'Lưu bài hướng dẫn',
  );
  if (!isNew) (f.inputs.get('id') as HTMLInputElement).readOnly = true;
  f.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.clearErrors();
    const id = isNew ? f.value('id') || slugify(f.value('title')) : g!.id;
    if (!f.value('title')) f.setError('title', 'Nhập tiêu đề.');
    if (!f.value('category')) f.setError('category', 'Nhập chủ đề.');
    if (!ID_RE.test(id)) f.setError('id', 'Mã chỉ gồm chữ thường không dấu, số và gạch nối.');
    if (!okUrl(f.value('videoUrl'))) f.setError('videoUrl', 'Link phải bắt đầu bằng https://');
    if (f.focusFirstError()) return;
    const data: Record<string, unknown> = {
      title: f.value('title'),
      titleEn: f.value('titleEn'),
      category: f.value('category'),
      categoryEn: f.value('categoryEn'),
      body: f.value('body'),
      bodyEn: f.value('bodyEn'),
      videoUrl: f.value('videoUrl'),
      published: f.checked('published'),
      sort: Number(f.value('sort') || 0),
      updatedAt: serverTimestamp(),
    };
    if (isNew) data.createdAt = serverTimestamp();
    f.submit.disabled = true;
    try {
      await setDoc(doc(db, 'guides', id), data, { merge: true });
      toast('Đã lưu bài hướng dẫn.');
      editingGuide = id;
      box.replaceChildren();
      await reload();
    } catch (err) {
      f.alert.replaceChildren(h('p', { text: errText(err) }));
    } finally {
      f.submit.disabled = false;
    }
  });
  const parts: Node[] = [h('h3', { class: 'adm-sub', text: isNew ? 'Bài hướng dẫn mới' : `Sửa: ${str(g!, 'title')}` }), f.form];
  if (!isNew) {
    const del = h('button', { type: 'button', class: 'btn btn-sm btn-danger' }, icon('x'), 'Xóa bài');
    del.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: `Xóa bài "${str(g!, 'title')}"?`, confirm: 'Xóa', cancel: 'Quay lại', danger: true });
      if (!ok.ok) return;
      try {
        await deleteDoc(doc(db, 'guides', g!.id));
        box.replaceChildren();
        await reload();
      } catch (err) {
        toast(errText(err), 'error');
      }
    });
    parts.push(h('div', { class: 'adm-actions' }, del));
  }
  box.replaceChildren(h('div', { class: 'panel' }, ...parts));
};

export { badge };
