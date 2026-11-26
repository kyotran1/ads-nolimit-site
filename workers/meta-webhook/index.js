/**
 * Trạm trung gian "adsnl-meta" (Cloudflare Worker, JS module, không thư viện ngoài).
 *
 * Việc duy nhất: nhận webhook của Meta (Messenger), kiểm chữ ký, rồi chuyển nội dung đã kiểm sang
 * Apps Script bot 3 (doPost?meta=1). Apps Script tự nó không đọc được header chữ ký của Meta và trả 302
 * cho mọi yêu cầu, nên cần trạm này đứng giữa.
 *
 *   GET  /meta  Meta xác minh webhook: hub.mode=subscribe + hub.verify_token đúng → trả hub.challenge (text/plain).
 *   POST /meta  Kiểm X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(thân yêu cầu thô, META_APP_SECRET).
 *               Sai → 401. Đúng → trả 200 "EVENT_RECEIVED" NGAY (Meta cần trả nhanh), việc chuyển tiếp chạy nền.
 *   Đường khác → 404.
 *
 * Biến môi trường (Chủ tịch tự dán trong Cloudflare, KHÔNG có trong mã nguồn này):
 *   META_APP_SECRET   App Secret của ứng dụng Meta (loại Secret)
 *   META_VERIFY_TOKEN chuỗi tự đặt, dán cùng chuỗi vào ô "Verify token" khi đăng ký webhook (loại Secret)
 *   GAS_URL           địa chỉ ứng dụng web Apps Script của bot 3 (…/exec)
 *   GAS_KEY           khóa chung với Apps Script (Thuộc tính tập lệnh GAS_KEY) (loại Secret)
 */

const MAX_BODY = 1024 * 1024; // 1 MB: webhook Messenger thật chỉ vài KB

const text = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

const enc = new TextEncoder();

/** So hai chuỗi trong thời gian không phụ thuộc vào chỗ khác nhau đầu tiên. */
export const sameText = (a, b) => {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

const hexToBytes = (hex) => {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** Chữ ký đúng khi header = "sha256=" + HMAC-SHA256(thân thô, secret). Dùng crypto.subtle.verify (so sánh thời gian hằng). */
export const signatureOk = async (header, rawBody, secret) => {
  if (!secret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const sig = hexToBytes(header.slice(7));
  if (!sig) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, sig, rawBody);
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/meta') return text('Not found', 404);

    if (request.method === 'GET') {
      const ok =
        env.META_VERIFY_TOKEN &&
        url.searchParams.get('hub.mode') === 'subscribe' &&
        sameText(url.searchParams.get('hub.verify_token') ?? '', env.META_VERIFY_TOKEN);
      const challenge = url.searchParams.get('hub.challenge') ?? '';
      return ok ? text(challenge, 200) : text('Forbidden', 403);
    }

    if (request.method !== 'POST') return text('Method not allowed', 405);

    if (!env.META_APP_SECRET || !env.GAS_URL || !env.GAS_KEY) return text('Not configured', 503);

    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_BODY) return text('Payload too large', 413);
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY) return text('Payload too large', 413);

    if (!(await signatureOk(request.headers.get('x-hub-signature-256'), raw, env.META_APP_SECRET))) return text('Invalid signature', 401);

    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return text('Bad request', 400);
    }

    // Chuyển tiếp nền: Apps Script trả 302 sang script.googleusercontent.com, fetch theo chuyển hướng để doPost chạy xong.
    const forward = fetch(env.GAS_URL + '?meta=1', {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: env.GAS_KEY, body }),
      redirect: 'follow',
    })
      .then((res) => {
        // Chỉ ghi mã trạng thái, KHÔNG ghi nội dung tin / thân phản hồi
        if (res.status !== 200) console.log('forward status', res.status);
      })
      .catch((e) => console.log('forward error', String(e)));
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(forward);

    return text('EVENT_RECEIVED', 200);
  },
};
