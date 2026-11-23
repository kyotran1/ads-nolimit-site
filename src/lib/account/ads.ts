/**
 * Báo cáo quảng cáo của khách (#bao-cao-ads): thẻ từng TKQC, và báo cáo tháng (#bao-cao-ads/<act_…>)
 * bố cục giống tab trang tính: khối nạp ngân sách, bảng chi tiêu từng ngày, khối tổng.
 * Dữ liệu: adAccounts + adReports (Apps Script trong trang tính bot 3 ghi). Khách chỉ đọc.
 */
import { byId, h, icon } from "../ui/dom";
import type { AdAccount, AdReport } from "../ads/report";
import { dmy, my } from "../ads/report";
import {
  go,
  isVisible,
  lang,
  loadError,
  money,
  register,
  route,
  when,
} from "./ctx";
import { ensure, errors, isLoaded, on, reload, state } from "./store";
import { selectCard } from "./services";
import QRCode from "qrcode";
import { buildVietQr } from "../vietqr";

const T = {
  vi: {
    balance: "Số dư",
    spendYesterday: "Chi tiêu hôm qua",
    avg7: "TB 7 ngày",
    daysLeft: "Còn khoảng",
    days: (n: number) => `${n} ngày`,
    low: "Số dư thấp — nên nạp thêm",
    lowBanner: (names: string) =>
      `Số dư tài khoản quảng cáo sắp hết: ${names}. Nạp thêm để quảng cáo không bị dừng.`,
    open: "Xem báo cáo",
    updated: "Cập nhật",
    topupBlock: "Top up ngân sách ads",
    date: "Ngày",
    amount: "Số tiền",
    comment: "Comment",
    inbox: "Inbox",
    data: "Tổng data",
    cpd: "Giá / data",
    spend: "Chi tiêu",
    total: "Tổng",
    totalTopup: "Tổng tiền nạp",
    totalSpend: "Tổng chi tiêu",
    month: "Tháng",
    addBudget: "Nạp thêm ngân sách",
    noReport: "Chưa có báo cáo cho tháng này.",
    service: {
      ads: "Quảng cáo hiệu suất",
      "agency-account": "Tài khoản Agency BM2500",
      "ad-budget": "Nạp ngân sách quảng cáo",
    },
    notFound: "Không tìm thấy tài khoản quảng cáo này.",
    tableLabel: "Chi tiêu và kết quả từng ngày",
    account: "STK NHẬN TIỀN",
    qr: "MÃ QR",
    scan: "Quét mã để chuyển tiền đến",
    qrAlt: "Mã QR chuyển khoản nạp ngân sách quảng cáo",
    zoomIn: "Phóng to",
    zoomOut: "Thu nhỏ",
    fit: "Vừa màn hình",
    hint: "Chụm 2 ngón để phóng to, kéo để xem",
    tabs: "Các tài khoản quảng cáo",
  },
  en: {
    balance: "Balance",
    spendYesterday: "Spent yesterday",
    avg7: "7-day average",
    daysLeft: "Lasts about",
    days: (n: number) => `${n} day${n === 1 ? "" : "s"}`,
    low: "Low balance — top up soon",
    lowBanner: (names: string) =>
      `Ad account balance is running low: ${names}. Top up so your ads keep running.`,
    open: "View report",
    updated: "Updated",
    topupBlock: "Ad budget top-ups",
    date: "Date",
    amount: "Amount",
    comment: "Comments",
    inbox: "Messages",
    data: "Total leads",
    cpd: "Cost / lead",
    spend: "Spend",
    total: "Total",
    totalTopup: "Total topped up",
    totalSpend: "Total spend",
    month: "Month",
    addBudget: "Add ad budget",
    noReport: "No report for this month yet.",
    service: {
      ads: "Performance ads",
      "agency-account": "Agency ad account BM2500",
      "ad-budget": "Ad budget top-up",
    },
    notFound: "This ad account was not found.",
    tableLabel: "Daily spend and results",
    account: "ACCOUNT NO.",
    qr: "QR CODE",
    scan: "Scan to transfer to",
    qrAlt: "Bank transfer QR code for ad budget top-ups",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fit: "Fit",
    hint: "Pinch to zoom, drag to scroll",
    tabs: "Ad accounts",
  },
}[lang];

const listView = byId("ads-list-view");
const reportView = byId("ads-report-view");
const cards = byId("ad-cards");
const empty = byId("ads-empty");
const box = byId("ads-report");
const alert = byId("ads-alert");
const num = (n: number) =>
  new Intl.NumberFormat(lang === "en" ? "en-US" : "vi-VN").format(n);

let month = "";

const fact = (label: string, value: string, cls = "") =>
  h(
    "div",
    { class: `ad-fact ${cls}` },
    h("dt", { text: label }),
    h("dd", { text: value }),
  );

const addBudget = () => {
  selectCard("ad-budget");
  go("services");
};

const accountCard = (a: AdAccount) => {
  const l = a.latest;
  const link = h(
    "a",
    {
      class: `ad-card${l?.low ? " is-low" : ""}`,
      href: "#",
      "data-glow": true,
    },
    h(
      "div",
      { class: "ad-card-head" },
      h(
        "span",
        { class: "icon-tile tone-violet", "aria-hidden": "true" },
        icon("chart"),
      ),
      h(
        "div",
        { class: "ad-card-name" },
        h("strong", { text: a.label || a.accountName }),
        h("span", { text: a.label ? a.accountName : T.service[a.service] }),
      ),
    ),
    h(
      "p",
      { class: "ad-card-balance" },
      h("small", { text: T.balance }),
      h("strong", { text: l ? money(l.balance) : "—" }),
    ),
    l?.low
      ? h("p", { class: "ad-low" }, icon("bell"), h("span", { text: T.low }))
      : null,
    h(
      "dl",
      { class: "ad-facts" },
      fact(T.spendYesterday, l ? money(l.spendYesterday) : "—"),
      fact(T.avg7, l ? money(l.avg7) : "—"),
      fact(T.daysLeft, l && l.daysLeft !== null ? T.days(l.daysLeft) : "—"),
    ),
    h(
      "p",
      { class: "ad-card-foot" },
      h("span", {
        text: l?.updatedAt ? `${T.updated} ${when(l.updatedAt)}` : "",
      }),
      h("span", { class: "stat-sub" }, T.open, icon("arrow")),
    ),
  );
  link.addEventListener("click", (e) => {
    e.preventDefault();
    month = "";
    go("ads", a.id);
  });
  return h("li", {}, link);
};

const renderList = () => {
  listView.hidden = false;
  reportView.hidden = true;
  if (!isLoaded("adAccounts")) return;
  empty.hidden = state.adAccounts.length > 0;
  cards.replaceChildren(...state.adAccounts.map(accountCard));
};

/* ---------- Báo cáo tháng: dựng lại đúng tab trang tính (màu, khối, viền) ---------- */

const td = (
  text: string,
  cls = "",
  attrs: Record<string, string | number> = {},
) => h("td", { class: cls, text, ...attrs });
const th = (
  text: string,
  cls = "",
  attrs: Record<string, string | number> = {},
) => h("th", { class: cls, text, scope: "col", ...attrs });

/** Dòng chữ xanh dương trên cùng của tab (ghi chú chuyển khoản + cảm ơn), "[ ADS-NOLIMIT.AGENCY ]" tô xanh lá. */
const banner = (note: string) => {
  const lines = note
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  return h(
    "div",
    { class: "xl-banner" },
    ...lines.map((line) => {
      const m = /^(.*?)(ADS-NOLIMIT\.AGENCY)(.*)$/i.exec(line);
      return m
        ? h("p", {}, m[1], h("span", { class: "xl-brand", text: m[2] }), m[3])
        : h("p", { text: line });
    }),
  );
};

const topupTable = (r: AdReport) => {
  const rows = r.topups.map((t) => {
    if (!t.date) {
      const cls = t.amount < 0 ? "xl-red" : "xl-g1";
      return h(
        "tr",
        { class: cls },
        td(t.label, "xl-label"),
        td(money(t.amount)),
      );
    }
    return h("tr", {}, td(dmy(t.date), "xl-date"), td(money(t.amount)));
  });
  return h(
    "table",
    { class: "xl-t xl-topup" },
    h("caption", { class: "visually-hidden", text: T.topupBlock }),
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        th(T.topupBlock.toUpperCase(), "xl-g1 xl-title", { colspan: 2 }),
      ),
      h(
        "tr",
        {},
        th(T.date.toUpperCase(), "xl-g2"),
        th(T.amount.toUpperCase(), "xl-g2"),
      ),
    ),
    h("tbody", {}, ...rows),
  );
};

const daysTable = (r: AdReport) => {
  const cols = [T.comment, T.inbox, T.data, T.cpd, T.spend].map((x) =>
    x.toUpperCase(),
  );
  const t = r.totals;
  return h(
    "div",
    {
      class: "xl-scroll",
      tabindex: 0,
      role: "region",
      "aria-label": T.tableLabel,
    },
    h(
      "table",
      { class: "xl-t xl-days" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          th(`NAME TKQC : ${r.accountName}`, "xl-g2 xl-name", { colspan: 6 }),
        ),
        h(
          "tr",
          {},
          th(T.date.toUpperCase(), "xl-g2 xl-daycol", { rowspan: 2 }),
          ...cols.map((c) => th(c, "xl-g2")),
        ),
        h(
          "tr",
          { class: "xl-y" },
          td(num(t.comment)),
          td(num(t.inbox)),
          td(num(t.data)),
          td(money(t.cpd)),
          td(money(t.spend)),
        ),
      ),
      h(
        "tbody",
        {},
        ...r.days.map((d) =>
          h(
            "tr",
            {},
            h("th", {
              scope: "row",
              class: "xl-date xl-daycol",
              text: dmy(d.date),
            }),
            td(num(d.comment)),
            td(num(d.inbox)),
            td(num(d.data)),
            td(money(d.cpd)),
            td(money(d.spend)),
          ),
        ),
      ),
    ),
  );
};

const sideBlock = (r: AdReport) => {
  const p = state.payment;
  const sum = h(
    "table",
    { class: "xl-t xl-sum" },
    h(
      "tbody",
      {},
      h(
        "tr",
        { class: "xl-g1" },
        h("th", { scope: "row", text: T.totalTopup.toUpperCase() }),
        td(money(r.totals.topup)),
      ),
      h(
        "tr",
        { class: "xl-y" },
        h("th", { scope: "row", text: T.totalSpend.toUpperCase() }),
        td(money(r.totals.spend)),
      ),
      h(
        "tr",
        { class: "xl-g1" },
        h("th", { scope: "row", text: T.balance.toUpperCase() }),
        td(money(r.totals.balance)),
      ),
    ),
  );
  if (!p) return h("div", { class: "xl-side" }, sum);
  const qr = h("div", { class: "xl-qr", role: "img", "aria-label": T.qrAlt });
  try {
    const payload = buildVietQr({ bin: p.bankBin, account: p.accountNumber });
    void QRCode.toString(payload, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#000000ff", light: "#ffffffff" },
    }).then((svg: string) => {
      // SVG do thư viện tạo từ chuỗi VietQR (không chứa dữ liệu người dùng dạng HTML)
      qr.innerHTML = svg;
      qr.querySelector("svg")?.setAttribute("aria-hidden", "true");
    });
  } catch {
    /* thiếu thông tin ngân hàng hợp lệ: bỏ QR */
  }
  const bank = h(
    "table",
    { class: "xl-t xl-bank" },
    h(
      "tbody",
      {},
      h(
        "tr",
        { class: "xl-red" },
        td(p.bankName.toUpperCase()),
        td(p.accountName),
      ),
      h("tr", { class: "xl-red" }, td(T.account), td(p.accountNumber)),
      h("tr", {}, td(T.qr, "xl-qrtitle", { colspan: 2 })),
      h(
        "tr",
        {},
        h(
          "td",
          { colspan: 2, class: "xl-qrcell" },
          h(
            "p",
            { class: "xl-qrnote" },
            T.scan,
            h("br"),
            h("strong", { text: p.accountName }),
            h("br"),
            h("strong", { text: p.accountNumber }),
          ),
          qr,
        ),
      ),
    ),
  );
  return h("div", { class: "xl-side" }, sum, bank);
};

const sheetView = (r: AdReport) =>
  h(
    "div",
    { class: "xl" },
    banner(r.note),
    h(
      "div",
      { class: "xl-grid" },
      topupTable(r),
      h("div", { class: "xl-days-wrap" }, daysTable(r)),
      sideBlock(r),
    ),
  );

/* ---------- Khung xem kiểu ứng dụng Trang tính: phóng to/thu nhỏ, cuộn, tab tài khoản ở chân ---------- */

const ZKEY = "adsnl-xv-zoom";
const CANVAS_REM = 74;
let zoom = 0; // 0 = chưa đặt → vừa màn hình
const readZoom = () => {
  try {
    const z = Number(localStorage.getItem(ZKEY));
    return z >= 0.3 && z <= 2 ? z : 0;
  } catch {
    return 0;
  }
};
const saveZoom = (z: number) => {
  try {
    localStorage.setItem(ZKEY, String(z));
  } catch {
    /* trình duyệt chặn bộ nhớ: bỏ qua */
  }
};

const viewer = (r: AdReport, actId: string) => {
  const canvas = h("div", { class: "xv-canvas" }, sheetView(r));
  const view = h(
    "div",
    {
      class: "xv-view",
      tabindex: 0,
      role: "region",
      "aria-label": T.tableLabel,
    },
    canvas,
  );
  const label = h("span", { class: "xv-zoom", "aria-live": "polite" });
  const canvasPx = () =>
    CANVAS_REM *
    parseFloat(getComputedStyle(document.documentElement).fontSize || "16");
  const fit = () =>
    Math.max(0.3, Math.min(1, (view.clientWidth - 2) / canvasPx()));
  const apply = (z: number, keep?: { x: number; y: number }) => {
    const old =
      parseFloat(
        (canvas.style as CSSStyleDeclaration & { zoom: string }).zoom || "1",
      ) || 1;
    const nz = Math.round(Math.max(0.3, Math.min(2, z)) * 100) / 100;
    (canvas.style as CSSStyleDeclaration & { zoom: string }).zoom = String(nz);
    label.textContent = `${Math.round(nz * 100)}%`;
    if (keep) {
      // giữ điểm đang nhìn (giữa 2 ngón tay / giữa khung) đứng yên khi đổi cỡ
      const k = nz / old;
      view.scrollLeft = (view.scrollLeft + keep.x) * k - keep.x;
      view.scrollTop = (view.scrollTop + keep.y) * k - keep.y;
    }
    zoom = nz;
  };
  const center = () => ({
    x: view.clientWidth / 2,
    y: Math.min(view.clientHeight, 300) / 2,
  });
  const btn = (text: string, aria: string, run: () => void) =>
    h("button", { type: "button", "aria-label": aria, text, onclick: run });
  const bar = h(
    "div",
    { class: "xv-bar" },
    btn("−", T.zoomOut, () => {
      apply(zoom - 0.1, center());
      saveZoom(zoom);
    }),
    label,
    btn("+", T.zoomIn, () => {
      apply(zoom + 0.1, center());
      saveZoom(zoom);
    }),
    btn(T.fit, T.fit, () => {
      apply(fit());
      view.scrollLeft = 0;
      saveZoom(0);
    }),
    btn("100%", "100%", () => {
      apply(1, center());
      saveZoom(1);
    }),
    h("span", { class: "xv-hint", text: T.hint }),
  );

  // Chụm 2 ngón để phóng to/thu nhỏ trong khung (không phóng cả trang web)
  let pinch: { d: number; z: number; x: number; y: number } | null = null;
  const dist = (t: TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  view.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        const rect = view.getBoundingClientRect();
        pinch = {
          d: dist(e.touches),
          z: zoom,
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
        };
      }
    },
    { passive: true },
  );
  view.addEventListener(
    "touchmove",
    (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      apply(pinch.z * (dist(e.touches) / pinch.d), { x: pinch.x, y: pinch.y });
    },
    { passive: false },
  );
  view.addEventListener("touchend", (e) => {
    if (pinch && e.touches.length < 2) {
      pinch = null;
      saveZoom(zoom);
    }
  });
  // Ctrl + lăn chuột trên máy tính
  view.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = view.getBoundingClientRect();
      apply(zoom * (e.deltaY < 0 ? 1.1 : 0.9), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      saveZoom(zoom);
    },
    { passive: false },
  );

  const tabs = h(
    "nav",
    { class: "xv-tabs", "aria-label": T.tabs },
    ...state.adAccounts.map((acc) => {
      const rep =
        state.adReports.find(
          (x) => x.actId === acc.id && x.month === r.month,
        ) ?? state.adReports.find((x) => x.actId === acc.id);
      const name = (rep?.tab || acc.label || acc.accountName).trim();
      return h("button", {
        type: "button",
        class: "xv-tab",
        "aria-current": acc.id === actId ? "page" : null,
        text: name,
        title: name,
        onclick: () => go("ads", acc.id),
      });
    }),
  );

  requestAnimationFrame(() => {
    const saved = zoom || readZoom();
    apply(saved || fit());
  });
  return h("div", { class: "xv" }, bar, view, tabs);
};

const renderReport = (actId: string) => {
  listView.hidden = true;
  reportView.hidden = false;
  if (!isLoaded("adAccounts") || !isLoaded("adReports")) return;
  const a = state.adAccounts.find((x) => x.id === actId);
  if (!a) {
    box.replaceChildren(h("p", { class: "muted", text: T.notFound }));
    return;
  }
  const reports = state.adReports.filter((r) => r.actId === actId);
  if (!month || !reports.some((r) => r.month === month))
    month = reports[0]?.month ?? "";
  const r = reports.find((x) => x.month === month);

  const select = h(
    "select",
    { class: "ad-month", "aria-label": T.month },
    ...reports.map((x) =>
      h("option", { value: x.month, text: `${T.month} ${my(x.month)}` }),
    ),
  );
  (select as HTMLSelectElement).value = month;
  select.addEventListener("change", () => {
    month = (select as HTMLSelectElement).value;
    renderReport(actId);
  });
  const low = a.latest?.low && r?.month === a.latest.month;

  const parts: (Node | null)[] = [
    h(
      "div",
      { class: "ad-report-head" },
      h(
        "div",
        {},
        h("h2", { class: "sub-title", text: a.label || a.accountName }),
        h("p", {
          class: "muted small",
          text: `${a.accountName} · ${T.service[a.service]}`,
        }),
      ),
      reports.length > 1
        ? select
        : reports.length
          ? h("span", { class: "chip", text: `${T.month} ${my(month)}` })
          : null,
    ),
    low
      ? h("p", { class: "ad-low" }, icon("bell"), h("span", { text: T.low }))
      : null,
    r ? viewer(r, actId) : h("p", { class: "muted", text: T.noReport }),
    r
      ? h(
          "div",
          { class: "ad-report-foot" },
          h(
            "button",
            { type: "button", class: "btn btn-primary", onclick: addBudget },
            icon("plus"),
            T.addBudget,
          ),
          r.updatedAt
            ? h("p", {
                class: "muted small",
                text: `${T.updated} ${when(r.updatedAt)}`,
              })
            : null,
        )
      : null,
  ];
  box.replaceChildren(...parts.filter((x): x is Node => x !== null));
};

const render = () => {
  const err = errors.get("adAccounts") ?? errors.get("adReports");
  if (err) {
    loadError(alert, err, () => void reload("adAccounts", "adReports"));
    return;
  }
  alert.replaceChildren();
  const sub = route().sub;
  if (sub) renderReport(sub);
  else renderList();
};

byId("ads-back").addEventListener("click", (e) => {
  e.preventDefault();
  go("ads");
});

on(["adAccounts", "adReports", "payment"], () => {
  if (isVisible("ads")) render();
  renderBanner();
});

/** Banner đỏ ở Tổng quan khi có TKQC số dư thấp. */
const renderBanner = () => {
  const slot = document.getElementById("ov-ads-low");
  if (!slot) return;
  const low = state.adAccounts.filter((a) => a.latest?.low);
  slot.hidden = low.length === 0;
  if (!low.length) return;
  const btn = h(
    "button",
    {
      type: "button",
      class: "btn btn-sm btn-primary",
      onclick: () => go("ads", low.length === 1 ? low[0].id : ""),
    },
    T.open,
  );
  slot.replaceChildren(
    icon("bell"),
    h("p", {
      text: T.lowBanner(low.map((a) => a.label || a.accountName).join(", ")),
    }),
    btn,
  );
};

register("ads", {
  enter() {
    render();
    void ensure("adAccounts", "adReports", "payment");
  },
});
