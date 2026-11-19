/**
 * DANH MỤC BÁN BẰNG SỐ DƯ + Ô CHỌN DỊCH VỤ ở trang tài khoản (mục "Dịch vụ").
 *
 * Giá KHÔNG viết ở đây: mọi số tiền lấy từ src/data/pricing.ts (getRawPrice), nên đổi giá ở pricing.ts
 * là đổi ở mọi nơi. Sau khi đổi giá/thêm sản phẩm: vào /quan-tri/ → Cài đặt → "Đồng bộ bảng giá"
 * để ghi bảng giá mới vào Firestore (products/) — luật bảo mật kiểm tra giá đơn hàng theo bảng đó.
 *
 * - `sellable`: dòng giá nào được "Thanh toán bằng số dư". Chỉ dòng giá CỐ ĐỊNH (có số tiền, không có chữ "từ").
 * - Gói chỉ có giá "từ…" hoặc "Liên hệ báo giá" (tự động hóa, website, tài khoản BM2500, quảng cáo
 *   hiệu suất): chỉ "Gửi yêu cầu tư vấn".
 * - "Nạp ngân sách quảng cáo": số tiền khách tự nhập (tối thiểu AD_BUDGET_MIN), trừ thẳng vào số dư.
 */
import type { Lang } from '../config/i18n';
import type { IconName } from '../components/icon-paths';
import { getPlans, getRawPrice, priceInline, vnd, usd } from './pricing';

type Text = Record<Lang, string>;

/** Ngân sách quảng cáo tối thiểu mỗi lần nạp (VNĐ). Khớp AD_BUDGET_MIN trong src/lib/ledger/ops.ts. */
export const AD_BUDGET_MIN = 500_000;
export const AD_BUDGET_MAX = 500_000_000;

export type GroupId = 'ai' | 'ads' | 'automation' | 'web' | 'training' | 'other';

const groups: { id: GroupId; label: Text }[] = [
  { id: 'ai', label: { vi: 'AI Agent', en: 'AI agents' } },
  { id: 'ads', label: { vi: 'Quảng cáo', en: 'Advertising' } },
  { id: 'automation', label: { vi: 'Tự động hóa', en: 'Automation' } },
  { id: 'web', label: { vi: 'Website & phần mềm', en: 'Websites & software' } },
  { id: 'training', label: { vi: 'Đào tạo', en: 'Training' } },
  { id: 'other', label: { vi: 'Khác', en: 'Other' } },
];

interface SellableSpec {
  /** id sản phẩm trong Firestore products/ */
  id: string;
  /** vị trí dòng giá trong `prices` của gói (src/data/pricing.ts) */
  priceIndex: number;
  /** số lượng tối đa mỗi đơn (ví dụ 12 tháng duy trì, 20 người học) */
  maxQty: number;
  /** đơn vị số lượng, hiện cạnh ô chọn số lượng */
  qtyUnit?: Text;
}

interface CardSpec {
  /** id gói trong pricing.ts (cũng là planId của yêu cầu tư vấn), hoặc 'ad-budget' / 'other' */
  id: string;
  group: GroupId;
  icon: IconName;
  sellable?: SellableSpec[];
}

const cards: CardSpec[] = [
  {
    id: 'ai-starter',
    group: 'ai',
    icon: 'chat',
    sellable: [
      { id: 'ai-starter-setup', priceIndex: 0, maxQty: 1 },
      { id: 'ai-starter-monthly', priceIndex: 1, maxQty: 12, qtyUnit: { vi: 'tháng', en: 'months' } },
    ],
  },
  {
    id: 'ai-sales',
    group: 'ai',
    icon: 'bolt',
    sellable: [
      { id: 'ai-sales-setup', priceIndex: 0, maxQty: 1 },
      { id: 'ai-sales-monthly', priceIndex: 1, maxQty: 12, qtyUnit: { vi: 'tháng', en: 'months' } },
    ],
  },
  { id: 'ads', group: 'ads', icon: 'chart' },
  { id: 'agency-account', group: 'ads', icon: 'shield' },
  { id: 'ad-budget', group: 'ads', icon: 'ads' },
  { id: 'automation', group: 'automation', icon: 'refresh' },
  { id: 'web', group: 'web', icon: 'code' },
  {
    id: 'training',
    group: 'training',
    icon: 'school',
    sellable: [{ id: 'training-workshop', priceIndex: 0, maxQty: 20, qtyUnit: { vi: 'người', en: 'people' } }],
  },
  { id: 'other', group: 'other', icon: 'spark' },
];

const adBudget = {
  name: { vi: 'Nạp ngân sách quảng cáo', en: 'Ad budget top-up' },
  summary: {
    vi: 'Nạp tiền chạy quảng cáo vào tài khoản Agency (BM2500) bạn đang thuê của ADS-Nolimit, trừ thẳng từ số dư.',
    en: 'Add ad spend to the Agency ad account (BM2500) you rent from ADS-Nolimit, paid straight from your balance.',
  },
  priceLine: {
    vi: `Từ ${vnd(AD_BUDGET_MIN)}, bạn tự nhập số tiền`,
    en: `From ${new Intl.NumberFormat('en-US').format(AD_BUDGET_MIN)} VND, you choose the amount`,
  },
  features: {
    vi: ['Nhập ID tài khoản quảng cáo và số tiền cần nạp', 'ADS-Nolimit nạp vào tài khoản và báo lại cho bạn'],
    en: ['Enter your ad account ID and the amount', 'ADS-Nolimit adds it to the account and lets you know'],
  },
};

const other = {
  name: { vi: 'Khác / chưa chắc chọn gói nào', en: 'Other / not sure which plan' },
  summary: {
    vi: 'Mô tả nhu cầu, ADS-Nolimit tư vấn gói phù hợp và báo giá chi tiết.',
    en: 'Tell us what you need and ADS-Nolimit will suggest the right plan with a detailed quote.',
  },
  priceLine: { vi: 'Tư vấn miễn phí', en: 'Free consultation' },
};

/* ---------- Sản phẩm cho Firestore products/ (trang quản trị "Đồng bộ bảng giá") ---------- */

export interface ProductDoc {
  id: string;
  planId: string;
  type: 'service' | 'ad_budget' | 'key';
  pricing: 'fixed' | 'variable';
  price?: number;
  priceUsd?: number;
  maxQty?: number;
  minAmount?: number;
  maxAmount?: number;
  name: Text;
  unit?: Text;
  active: boolean;
  sort: number;
}

const productName = (planId: string, priceIndex: number): Text => {
  const raw = getRawPrice(planId, priceIndex);
  return { vi: `${raw.planName.vi} — ${raw.label.vi}`, en: `${raw.planName.en} — ${raw.label.en}` };
};

export const catalogProducts = (): ProductDoc[] => {
  const out: ProductDoc[] = [];
  let sort = 1;
  for (const card of cards) {
    for (const s of card.sellable ?? []) {
      const raw = getRawPrice(card.id, s.priceIndex);
      if (raw.amount === undefined || raw.usd === undefined || raw.from)
        throw new Error(`catalog: dòng giá ${s.priceIndex} của "${card.id}" không phải giá cố định, không bán bằng số dư được`);
      const doc: ProductDoc = {
        id: s.id,
        planId: card.id,
        type: 'service',
        pricing: 'fixed',
        price: raw.amount,
        priceUsd: raw.usd,
        maxQty: s.maxQty,
        name: productName(card.id, s.priceIndex),
        active: true,
        sort: sort++,
      };
      if (s.qtyUnit) doc.unit = s.qtyUnit;
      out.push(doc);
    }
  }
  out.push({
    id: 'ad-budget',
    planId: 'ad-budget',
    type: 'ad_budget',
    pricing: 'variable',
    minAmount: AD_BUDGET_MIN,
    maxAmount: AD_BUDGET_MAX,
    name: adBudget.name,
    active: true,
    sort: sort++,
  });
  return out;
};

/* ---------- Ô chọn dịch vụ (đã chuyển ngữ, in ra trang tài khoản dạng JSON) ---------- */

export interface PickerProduct {
  id: string;
  /** Nhãn ngắn: "Cài đặt", "Duy trì", "Học phí" */
  label: string;
  /** Tên lưu vào đơn hàng */
  name: string;
  /** Giá VNĐ trừ vào số dư */
  price: number;
  /** Giá hiển thị theo ngôn ngữ trang (vi: VNĐ, en: USD) */
  display: string;
  /** Đơn vị hiển thị sau giá, ví dụ "/tháng" */
  per?: string;
  maxQty: number;
  qtyUnit?: string;
}

export interface PickerCard {
  id: string;
  group: GroupId;
  icon: IconName;
  name: string;
  summary: string;
  priceLine: string;
  features: string[];
  href?: string;
  /** buy: có thể thanh toán bằng số dư; quote: chỉ yêu cầu tư vấn; budget: nạp ngân sách quảng cáo; other: khác */
  mode: 'buy' | 'quote' | 'budget' | 'other';
  products: PickerProduct[];
}

export interface PickerGroup {
  id: GroupId;
  label: string;
  cards: PickerCard[];
}

export const pickerGroups = (lang: Lang): PickerGroup[] => {
  const plans = getPlans(lang);
  const toCard = (spec: CardSpec): PickerCard => {
    if (spec.id === 'ad-budget')
      return {
        id: spec.id,
        group: spec.group,
        icon: spec.icon,
        name: adBudget.name[lang],
        summary: adBudget.summary[lang],
        priceLine: adBudget.priceLine[lang],
        features: adBudget.features[lang],
        mode: 'budget',
        products: [],
      };
    if (spec.id === 'other')
      return {
        id: spec.id,
        group: spec.group,
        icon: spec.icon,
        name: other.name[lang],
        summary: other.summary[lang],
        priceLine: other.priceLine[lang],
        features: [],
        mode: 'other',
        products: [],
      };
    const plan = plans.find((p) => p.id === spec.id);
    if (!plan) throw new Error(`catalog: không có gói "${spec.id}" trong src/data/pricing.ts`);
    const products: PickerProduct[] = (spec.sellable ?? []).map((s) => {
      const raw = getRawPrice(spec.id, s.priceIndex);
      return {
        id: s.id,
        label: raw.label[lang],
        name: productName(spec.id, s.priceIndex)[lang],
        price: raw.amount as number,
        display: lang === 'en' ? usd(raw.usd as number) : vnd(raw.amount as number),
        per: raw.unit?.[lang],
        maxQty: s.maxQty,
        qtyUnit: s.qtyUnit?.[lang],
      };
    });
    return {
      id: plan.id,
      group: spec.group,
      icon: spec.icon,
      name: plan.name,
      summary: plan.summary,
      priceLine: priceInline(plan, lang),
      features: plan.features,
      href: plan.href,
      mode: products.length ? 'buy' : 'quote',
      products,
    };
  };
  return groups
    .map((g) => ({ id: g.id, label: g.label[lang], cards: cards.filter((c) => c.group === g.id).map(toCard) }))
    .filter((g) => g.cards.length > 0);
};
