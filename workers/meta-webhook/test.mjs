// Kiểm trạm Worker bằng Node (không cài gói): node workers/meta-webhook/test.mjs
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker, { sameText } from './index.js';

const ENV = { META_APP_SECRET: 'bi-mat-thu-nghiem', META_VERIFY_TOKEN: 'ma-xac-minh-thu', GAS_URL: 'https://script.example.test/macros/s/XYZ/exec', GAS_KEY: 'khoa-chung-thu' };
const sign = (raw, secret = ENV.META_APP_SECRET) => 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
const EVENT = { object: 'page', entry: [{ id: '1', messaging: [{ sender: { id: '777' }, message: { text: 'Nối thông báo NOI-AB12CD34EF' } }] }] };

let calls;
let waits;
const realFetch = globalThis.fetch;
const run = (req, env = ENV) => worker.fetch(req, env, { waitUntil: (p) => waits.push(p) });
const post = (raw, headers = {}, path = '/meta') => new Request('https://tram.example.test' + path, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', ...headers } });

beforeEach(() => {
  calls = [];
  waits = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response('{"ok":true}', { status: 200 });
  };
});
process.on('exit', () => (globalThis.fetch = realFetch));

describe('GET /meta (Meta xác minh webhook)', () => {
  const get = (q) => new Request('https://tram.example.test/meta?' + q);
  test('đúng mode + token → 200, trả đúng hub.challenge, text/plain', async () => {
    const r = await run(get('hub.mode=subscribe&hub.verify_token=ma-xac-minh-thu&hub.challenge=123456789'));
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '123456789');
    assert.match(r.headers.get('content-type'), /^text\/plain/);
  });
  test('sai token → 403, không lộ challenge', async () => {
    const r = await run(get('hub.mode=subscribe&hub.verify_token=sai&hub.challenge=123'));
    assert.equal(r.status, 403);
    assert.equal(await r.text(), 'Forbidden');
  });
  test('sai mode → 403', async () => {
    assert.equal((await run(get('hub.mode=unsubscribe&hub.verify_token=ma-xac-minh-thu&hub.challenge=1'))).status, 403);
  });
  test('thiếu token → 403', async () => {
    assert.equal((await run(get('hub.mode=subscribe&hub.challenge=1'))).status, 403);
  });
  test('chưa cấu hình META_VERIFY_TOKEN: token rỗng không qua được', async () => {
    assert.equal((await run(get('hub.mode=subscribe&hub.verify_token=&hub.challenge=1'), { ...ENV, META_VERIFY_TOKEN: '' })).status, 403);
  });
});

describe('POST /meta (sự kiện Messenger)', () => {
  const raw = JSON.stringify(EVENT);
  test('chữ ký đúng → 200 EVENT_RECEIVED và chuyển tiếp sang Apps Script đúng định dạng', async () => {
    const r = await run(post(raw, { 'x-hub-signature-256': sign(raw) }));
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'EVENT_RECEIVED');
    await Promise.all(waits);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, ENV.GAS_URL + '?meta=1');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.redirect, 'follow');
    assert.deepEqual(JSON.parse(calls[0].init.body), { key: ENV.GAS_KEY, body: EVENT });
  });
  test('trả lời không chờ chuyển tiếp xong (Meta cần trả nhanh), việc nền đi qua waitUntil', async () => {
    let release;
    globalThis.fetch = (url, init) => {
      calls.push({ url: String(url), init });
      return new Promise((res) => (release = () => res(new Response('{}'))));
    };
    const r = await run(post(raw, { 'x-hub-signature-256': sign(raw) }));
    assert.equal(r.status, 200);
    assert.equal(waits.length, 1);
    release();
    await Promise.all(waits);
  });
  test('Apps Script lỗi mạng → vẫn trả 200 cho Meta, không văng lỗi', async () => {
    globalThis.fetch = async () => {
      throw new Error('mang hong');
    };
    const r = await run(post(raw, { 'x-hub-signature-256': sign(raw) }));
    assert.equal(r.status, 200);
    await Promise.all(waits);
  });
  test('không có header chữ ký → 401, không chuyển tiếp', async () => {
    const r = await run(post(raw));
    assert.equal(r.status, 401);
    await Promise.all(waits);
    assert.equal(calls.length, 0);
  });
  test('chữ ký ký bằng khóa khác → 401', async () => {
    assert.equal((await run(post(raw, { 'x-hub-signature-256': sign(raw, 'khoa-gia') }))).status, 401);
    assert.equal(calls.length, 0);
  });
  test('thân bị sửa sau khi ký (đổi 1 ký tự) → 401', async () => {
    const sig = sign(raw);
    assert.equal((await run(post(raw.replace('777', '778'), { 'x-hub-signature-256': sig }))).status, 401);
    assert.equal(calls.length, 0);
  });
  test('chữ ký sai định dạng (không sha256=, ngắn, không phải hex, sha1) → 401', async () => {
    const hex = sign(raw).slice(7);
    for (const bad of [hex, 'sha256=' + hex.slice(2), 'sha256=' + 'z'.repeat(64), 'sha1=' + hex, 'sha256=', '', 'sha256=' + hex + '00']) {
      assert.equal((await run(post(raw, { 'x-hub-signature-256': bad }))).status, 401, bad.slice(0, 20));
    }
    assert.equal(calls.length, 0);
  });
  test('chữ ký chữ hoa vẫn đúng (hex không phân biệt hoa thường)', async () => {
    const sig = 'sha256=' + sign(raw).slice(7).toUpperCase();
    assert.equal((await run(post(raw, { 'x-hub-signature-256': sig }))).status, 200);
  });
  test('thân tiếng Việt có dấu (UTF-8): ký trên byte thô, vẫn đúng', async () => {
    const viet = JSON.stringify({ object: 'page', entry: [{ messaging: [{ message: { text: 'Nối thông báo NOI-AB12CD34EF — đã gửi' } }] }] });
    assert.equal((await run(post(viet, { 'x-hub-signature-256': sign(viet) }))).status, 200);
    await Promise.all(waits);
    assert.equal(JSON.parse(calls[0].init.body).body.entry[0].messaging[0].message.text, 'Nối thông báo NOI-AB12CD34EF — đã gửi');
  });
  test('chữ ký đúng nhưng thân không phải JSON → 400, không chuyển tiếp', async () => {
    const bad = 'khong phai json';
    assert.equal((await run(post(bad, { 'x-hub-signature-256': sign(bad) }))).status, 400);
    assert.equal(calls.length, 0);
  });
  test('thân quá lớn → 413 (không kiểm chữ ký, không chuyển tiếp)', async () => {
    const big = 'x'.repeat(1024 * 1024 + 1);
    assert.equal((await run(post(big, { 'x-hub-signature-256': sign(big) }))).status, 413);
    assert.equal(calls.length, 0);
  });
  test('thiếu cấu hình (không có META_APP_SECRET / GAS_URL / GAS_KEY) → 503, không chuyển tiếp', async () => {
    for (const k of ['META_APP_SECRET', 'GAS_URL', 'GAS_KEY']) {
      const env = { ...ENV, [k]: undefined };
      assert.equal((await run(post(raw, { 'x-hub-signature-256': sign(raw) }), env)).status, 503, k);
    }
    assert.equal(calls.length, 0);
  });
  test('App Secret rỗng không bao giờ cho qua (chữ ký của khóa rỗng)', async () => {
    const env = { ...ENV, META_APP_SECRET: '' };
    assert.equal((await run(post(raw, { 'x-hub-signature-256': sign(raw, '') }), env)).status, 503);
  });
});

describe('đường và phương thức khác', () => {
  test('đường khác /meta → 404 (GET, POST)', async () => {
    for (const p of ['/', '/meta/', '/metaa', '/admin', '/meta/x']) {
      assert.equal((await run(new Request('https://tram.example.test' + p))).status, 404, p);
      assert.equal((await run(post('{}', {}, p))).status, 404, p);
    }
  });
  test('PUT/DELETE trên /meta → 405', async () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) assert.equal((await run(new Request('https://tram.example.test/meta', { method }))).status, 405, method);
  });
});

describe('sameText', () => {
  test('so khớp đúng/sai, khác độ dài, rỗng', () => {
    assert.equal(sameText('abc', 'abc'), true);
    assert.equal(sameText('abc', 'abd'), false);
    assert.equal(sameText('abc', 'abcd'), false);
    assert.equal(sameText('', ''), true);
    assert.equal(sameText('', 'a'), false);
  });
});
