// Test đơn vị thuần cho thẻ mời cài ứng dụng (src/lib/pwa/install.ts). Chạy: npm run test:unit
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installMode, isIosSafari, SNOOZE_MS } from '../../src/lib/pwa/install.ts';

const now = 1_800_000_000_000;
const env = (o = {}) => ({ standalone: false, installed: false, canPrompt: false, iosSafari: false, snoozedUntil: 0, now, ...o });

describe('installMode', () => {
  test('đang chạy như app hoặc đã cài → hidden ở cả card và profile', () => {
    for (const where of ['card', 'profile']) {
      assert.equal(installMode(env({ standalone: true, canPrompt: true }), where), 'hidden');
      assert.equal(installMode(env({ installed: true, iosSafari: true }), where), 'hidden');
    }
  });
  test('card: đang hoãn → hidden; canPrompt → prompt; iosSafari → ios; còn lại → hidden', () => {
    assert.equal(installMode(env({ canPrompt: true, snoozedUntil: now + 1 }), 'card'), 'hidden');
    assert.equal(installMode(env({ iosSafari: true, snoozedUntil: now + 1 }), 'card'), 'hidden');
    assert.equal(installMode(env({ canPrompt: true, snoozedUntil: now }), 'card'), 'prompt');
    assert.equal(installMode(env({ canPrompt: true }), 'card'), 'prompt');
    assert.equal(installMode(env({ iosSafari: true }), 'card'), 'ios');
    assert.equal(installMode(env(), 'card'), 'hidden');
  });
  test('profile: bỏ qua hoãn; prompt / ios / manual', () => {
    assert.equal(installMode(env({ canPrompt: true, snoozedUntil: now + SNOOZE_MS }), 'profile'), 'prompt');
    assert.equal(installMode(env({ iosSafari: true, snoozedUntil: now + SNOOZE_MS }), 'profile'), 'ios');
    assert.equal(installMode(env({ snoozedUntil: now + SNOOZE_MS }), 'profile'), 'manual');
    assert.equal(installMode(env(), 'profile'), 'manual');
  });
  test('canPrompt và iosSafari cùng true → prompt', () => {
    assert.equal(installMode(env({ canPrompt: true, iosSafari: true }), 'card'), 'prompt');
    assert.equal(installMode(env({ canPrompt: true, iosSafari: true }), 'profile'), 'prompt');
  });
  test('SNOOZE_MS = 30 ngày', () => assert.equal(SNOOZE_MS, 30 * 24 * 3600 * 1000));
});

describe('isIosSafari', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const ipadDesktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  test('iPhone Safari → true', () => assert.equal(isIosSafari(iphone, 5), true));
  test('iPad kiểu máy tính (Macintosh + 5 điểm chạm) → true', () => assert.equal(isIosSafari(ipadDesktop, 5), true));
  test('Chrome / Firefox trên iOS → false', () => {
    assert.equal(isIosSafari(iphone.replace('Version/17.5', 'CriOS/126.0') , 5), false);
    assert.equal(isIosSafari(iphone + ' FxiOS/127.0', 5), false);
  });
  test('Facebook / Zalo in-app → false', () => {
    assert.equal(isIosSafari(iphone + ' [FBAN/FBIOS;FBAV/450.0]', 5), false);
    assert.equal(isIosSafari(iphone + ' FBAV/450.0', 5), false);
    assert.equal(isIosSafari(iphone + ' Zalo/12.0', 5), false);
  });
  test('Mac thật (0 điểm chạm) → false', () => assert.equal(isIosSafari(ipadDesktop, 0), false));
  test('Android Chrome → false', () => {
    assert.equal(isIosSafari('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36', 5), false);
  });
});
