/**
 * Báo cáo quảng cáo của khách (#bao-cao-ads): thẻ từng TKQC, và báo cáo tháng (#bao-cao-ads/<act_…>)
 * bố cục giống tab trang tính: khối nạp ngân sách, bảng chi tiêu từng ngày, khối tổng.
 * Dữ liệu: adAccounts + adReports (Apps Script trong trang tính bot 3 ghi). Khách chỉ đọc.
 */
import { byId, h, icon } from '../ui/dom';
import type { AdAccount, AdReport } from '../ads/report';
import { dmy, my } from '../ads/report';
import { go, isVisible, lang, loadError, money, register, route, when } from './ctx';
import { ensure, errors, isLoaded, on, reload, state } from './store';
import { selectCard } from './services';

const T = {
  vi: {
    balance: 'Số dư',
    spendYesterday: 'Chi tiêu hôm qua',
    avg7: 'TB 7 ngày',
    daysLeft: 'Còn khoảng',
    days: (n: number) => `${n} ngày`,
    low: 'Số dư thấp — nên nạp thêm',
    lowBanner: (names: string) => `Số dư tài khoản quảng cáo sắp hết: ${names}. Nạp thêm để quảng cáo không bị dừng.`,
    open: 'Xem báo cáo',
    updated: 'Cập nhật',
    topupBlock: 'Top up ngân sách ads',
    date: 'Ngày',
    amount: 'Số tiền',
    comment: 'Comment',
    inbox: 'Inbox',
    data: 'Tổng data',
    cpd: 'Giá / data',
    spend: 'Chi tiêu',
    total: 'Tổng',
    totalTopup: 'Tổng tiền nạp',
    totalSpend: 'Tổng chi tiêu',
    month: 'Tháng',
    addBudget: 'Nạp thêm ngân sách',
    noReport: 'Chưa có báo cáo cho tháng này.',
    service: { ads: 'Quảng cáo hiệu suất', 'agency-account': 'Tài khoản Agency BM2500', 'ad-budget': 'Nạp ngân sách quảng cáo' },
    notFound: 'Không tìm thấy tài khoản quảng cáo này.',
    tableLabel: 'Chi tiêu và kết quả từng ngày',
  },
  en: {
    balance: 'Balance',
    spendYesterday: 'Spent yesterday',
    avg7: '7-day average',
    daysLeft: 'Lasts about',
    days: (n: number) => `${n} day${n === 1 ? '' : 's'}`,
    low: 'Low balance — top up soon',
    lowBanner: (names: string) => `Ad account balance is running low: ${names}. Top up so your ads keep running.`,
    open: 'View report',
    updated: 'Updated',
    topupBlock: 'Ad budget top-ups',
    date: 'Date',
    amount: 'Amount',
    comment: 'Comments',
    inbox: 'Messages',
    data: 'Total leads',
    cpd: 'Cost / lead',
    spend: 'Spend',
    total: 'Total',
    totalTopup: 'Total topped up',
    totalSpend: 'Total spend',
    month: 'Month',
    addBudget: 'Add ad budget',
    noReport: 'No report for this month yet.',
    service: { ads: 'Performance ads', 'agency-account': 'Agency ad account BM2500', 'ad-budget': 'Ad budget top-up' },
    notFound: 'This ad account was not found.',
    tableLabel: 'Daily spend and results',
  },
}[lang];

const listView = byId('ads-list-view');
const reportView = byId('ads-report-view');
const cards = byId('ad-cards');
const empty = byId('ads-empty');
const box = byId('ads-report');
const alert = byId('ads-alert');
const num = (n: number) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(n);

let month = '';

const fact = (label: string, value: string, cls = '') =>
  h('div', { class: `ad-fact ${cls}` }, h('dt', { text: label }), h('dd', { text: value }));

const addBudget = () => {
  selectCard('ad-budget');
  go('services');
};

const accountCard = (a: AdAccount) => {
  const l = a.latest;
  const link = h(
    'a',
    { class: `ad-card${l?.low ? ' is-low' : ''}`, href: '#', 'data-glow': true },
    h(
      'div',
      { class: 'ad-card-head' },
      h('span', { class: 'icon-tile tone-violet', 'aria-hidden': 'true' }, icon('chart')),
      h('div', { class: 'ad-card-name' }, h('strong', { text: a.label || a.accountName }), h('span', { text: a.label ? a.accountName : T.service[a.service] })),
    ),
    h('p', { class: 'ad-card-balance' }, h('small', { text: T.balance }), h('strong', { text: l ? money(l.balance) : '—' })),
    l?.low ? h('p', { class: 'ad-low' }, icon('bell'), h('span', { text: T.low })) : null,
    h(
      'dl',
      { class: 'ad-facts' },
      fact(T.spendYesterday, l ? money(l.spendYesterday) : '—'),
      fact(T.avg7, l ? money(l.avg7) : '—'),
      fact(T.daysLeft, l && l.daysLeft !== null ? T.days(l.daysLeft) : '—'),
    ),
    h('p', { class: 'ad-card-foot' }, h('span', { text: l?.updatedAt ? `${T.updated} ${when(l.updatedAt)}` : '' }), h('span', { class: 'stat-sub' }, T.open, icon('arrow'))),
  );
  link.addEventListener('click', (e) => {
    e.preventDefault();
    month = '';
    go('ads', a.id);
  });
  return h('li', {}, link);
};

const renderList = () => {
  listView.hidden = false;
  reportView.hidden = true;
  if (!isLoaded('adAccounts')) return;
  empty.hidden = state.adAccounts.length > 0;
  cards.replaceChildren(...state.adAccounts.map(accountCard));
};

const topupBlock = (r: AdReport) =>
  h(
    'section',
    { class: 'ad-block ad-topups', 'aria-label': T.topupBlock },
    h('h3', { class: 'ad-block-title', text: T.topupBlock }),
    h(
      'table',
      { class: 'ad-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: T.date }), h('th', { scope: 'col', class: 'num', text: T.amount }))),
      h(
        'tbody',
        {},
        ...r.topups
          .filter((t) => t.amount !== 0 || !t.date)
          .map((t) => h('tr', { class: t.date ? '' : 'is-label' }, h('td', { text: t.date ? dmy(t.date) : t.label }), h('td', { class: 'num', text: money(t.amount) }))),
      ),
    ),
  );

const daysTable = (r: AdReport) => {
  const head = [T.date, T.comment, T.inbox, T.data, T.cpd, T.spend];
  return h(
    'section',
    { class: 'ad-block ad-days' },
    h('h3', { class: 'ad-block-title', text: r.accountName }),
    h(
      'div',
      { class: 'ad-scroll', tabindex: 0, role: 'region', 'aria-label': T.tableLabel },
      h(
        'table',
        { class: 'ad-table ad-table--days' },
        h('thead', {}, h('tr', {}, ...head.map((x, i) => h('th', { scope: 'col', class: i ? 'num' : '', text: x })))),
        h(
          'tbody',
          {},
          h(
            'tr',
            { class: 'is-total' },
            h('th', { scope: 'row', text: T.total }),
            h('td', { class: 'num', text: num(r.totals.comment) }),
            h('td', { class: 'num', text: num(r.totals.inbox) }),
            h('td', { class: 'num', text: num(r.totals.data) }),
            h('td', { class: 'num', text: money(r.totals.cpd) }),
            h('td', { class: 'num', text: money(r.totals.spend) }),
          ),
          ...r.days.map((d) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row', text: dmy(d.date) }),
              h('td', { class: 'num', text: num(d.comment) }),
              h('td', { class: 'num', text: num(d.inbox) }),
              h('td', { class: 'num', text: num(d.data) }),
              h('td', { class: 'num', text: money(d.cpd) }),
              h('td', { class: 'num', text: money(d.spend) }),
            ),
          ),
        ),
      ),
    ),
  );
};

const summaryBlock = (a: AdAccount, r: AdReport) =>
  h(
    'section',
    { class: `ad-block ad-summary${a.latest?.low && r.month === a.latest.month ? ' is-low' : ''}` },
    h(
      'dl',
      { class: 'ad-sum' },
      h('div', {}, h('dt', { text: T.totalTopup }), h('dd', { text: money(r.totals.topup) })),
      h('div', {}, h('dt', { text: T.totalSpend }), h('dd', { text: money(r.totals.spend) })),
      h('div', { class: 'ad-sum-balance' }, h('dt', { text: T.balance }), h('dd', { text: money(r.totals.balance) })),
    ),
    a.latest?.low && r.month === a.latest.month ? h('p', { class: 'ad-low' }, icon('bell'), h('span', { text: T.low })) : null,
    h('button', { type: 'button', class: 'btn btn-primary', onclick: addBudget }, icon('plus'), T.addBudget),
    r.note ? h('p', { class: 'ad-note', text: r.note }) : null,
    r.updatedAt ? h('p', { class: 'muted small', text: `${T.updated} ${when(r.updatedAt)}` }) : null,
  );

const renderReport = (actId: string) => {
  listView.hidden = true;
  reportView.hidden = false;
  if (!isLoaded('adAccounts') || !isLoaded('adReports')) return;
  const a = state.adAccounts.find((x) => x.id === actId);
  if (!a) {
    box.replaceChildren(h('p', { class: 'muted', text: T.notFound }));
    return;
  }
  const reports = state.adReports.filter((r) => r.actId === actId);
  if (!month || !reports.some((r) => r.month === month)) month = reports[0]?.month ?? '';
  const r = reports.find((x) => x.month === month);

  const select = h('select', { class: 'ad-month', 'aria-label': T.month }, ...reports.map((x) => h('option', { value: x.month, text: `${T.month} ${my(x.month)}` })));
  (select as HTMLSelectElement).value = month;
  select.addEventListener('change', () => {
    month = (select as HTMLSelectElement).value;
    renderReport(actId);
  });

  box.replaceChildren(
    h(
      'div',
      { class: 'ad-report-head' },
      h('div', {}, h('h2', { class: 'sub-title', text: a.label || a.accountName }), h('p', { class: 'muted small', text: `${a.accountName} · ${T.service[a.service]}` })),
      reports.length > 1 ? select : reports.length ? h('span', { class: 'chip', text: `${T.month} ${my(month)}` }) : null,
    ),
    r ? h('div', { class: 'ad-sheet' }, summaryBlock(a, r), topupBlock(r), daysTable(r)) : h('p', { class: 'muted', text: T.noReport }),
  );
};

const render = () => {
  const err = errors.get('adAccounts') ?? errors.get('adReports');
  if (err) {
    loadError(alert, err, () => void reload('adAccounts', 'adReports'));
    return;
  }
  alert.replaceChildren();
  const sub = route().sub;
  if (sub) renderReport(sub);
  else renderList();
};

byId('ads-back').addEventListener('click', (e) => {
  e.preventDefault();
  go('ads');
});

on(['adAccounts', 'adReports'], () => {
  if (isVisible('ads')) render();
  renderBanner();
});

/** Banner đỏ ở Tổng quan khi có TKQC số dư thấp. */
const renderBanner = () => {
  const slot = document.getElementById('ov-ads-low');
  if (!slot) return;
  const low = state.adAccounts.filter((a) => a.latest?.low);
  slot.hidden = low.length === 0;
  if (!low.length) return;
  const btn = h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => go('ads', low.length === 1 ? low[0].id : '') }, T.open);
  slot.replaceChildren(icon('bell'), h('p', { text: T.lowBanner(low.map((a) => a.label || a.accountName).join(', ')) }), btn);
};

register('ads', {
  enter() {
    render();
    void ensure('adAccounts', 'adReports');
  },
});
