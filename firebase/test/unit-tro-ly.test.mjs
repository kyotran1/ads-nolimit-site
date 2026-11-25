import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cleanInput, newSid, isSid, buildRequest, errKind, safeHref, parseInline, parseReply, MAX_INPUT } from '../../src/lib/tro-ly/core.ts';
import { stripHtml } from '../../src/lib/tro-ly/strip.ts';

describe('trợ lý AI — phía web', () => {
  test('cleanInput: bỏ khoảng trắng thừa, gộp dòng trống, cắt 800 ký tự', () => {
    assert.equal(cleanInput('  chào \r\n\r\n\r\n\r\nbạn  '), 'chào\n\nbạn');
    assert.equal(cleanInput('x'.repeat(900)).length, MAX_INPUT);
  });
  test('newSid đúng định dạng trạm chấp nhận', () => {
    const s = newSid();
    assert.equal(s.length, 20);
    assert.ok(isSid(s));
    assert.ok(!isSid('ngắn'));
    assert.ok(!isSid(undefined));
  });
  test('buildRequest: 12 tin gần nhất, luôn bắt đầu bằng khách, bỏ tin rỗng', () => {
    const h = [{ role: 'assistant', content: 'chào' }];
    for (let i = 0; i < 15; i++) h.push({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` });
    h.push({ role: 'user', content: '  ' });
    const r = buildRequest('abcDEF123456', 'vi', '/bang-gia/', h);
    assert.equal(r.v, 1);
    assert.ok(r.messages.length <= 12);
    assert.equal(r.messages[0].role, 'user');
    assert.equal(r.messages.at(-1).content, 'm14');
  });
  test('errKind: mã lạ → down', () => {
    assert.equal(errKind('limit'), 'limit');
    assert.equal(errKind('daily'), 'daily');
    assert.equal(errKind('setup'), 'down');
    assert.equal(errKind(undefined), 'down');
  });
  test('safeHref: chỉ https tới web ADS-Nolimit và Zalo/Telegram/Messenger', () => {
    assert.equal(safeHref('https://www.ads-nolimit.agency/bang-gia/'), 'https://www.ads-nolimit.agency/bang-gia/');
    assert.equal(safeHref('https://zalo.me/0888882823'), 'https://zalo.me/0888882823');
    for (const bad of ['http://www.ads-nolimit.agency/', 'https://ads-nolimit.agency.evil.com/', 'javascript:alert(1)', 'https://evil.com/?u=ads-nolimit.agency', 'https://user:pw@zalo.me/', 'data:text/html,x'])
      assert.equal(safeHref(bad), null, bad);
  });
  test('parseInline: in đậm, link markdown, link trần; link lạ thành chữ thường; không có HTML', () => {
    assert.deepEqual(parseInline('Gói **Khởi đầu** xem [bảng giá](https://www.ads-nolimit.agency/bang-gia/).'), [
      { t: 'text', text: 'Gói ' },
      { t: 'b', text: 'Khởi đầu' },
      { t: 'text', text: ' xem ' },
      { t: 'a', text: 'bảng giá', href: 'https://www.ads-nolimit.agency/bang-gia/' },
      { t: 'text', text: '.' },
    ]);
    assert.deepEqual(parseInline('Nhắn https://zalo.me/0888882823.'), [
      { t: 'text', text: 'Nhắn ' },
      { t: 'a', text: 'zalo.me/0888882823', href: 'https://zalo.me/0888882823' },
      { t: 'text', text: '.' },
    ]);
    assert.deepEqual(parseInline('[bấm](https://evil.com/x) <img src=x onerror=alert(1)>'), [{ t: 'text', text: 'bấm <img src=x onerror=alert(1)>' }]);
  });
  test('parseReply: đoạn văn, gạch đầu dòng, danh sách số; bỏ tiêu đề # và ```', () => {
    const b = parseReply('## Giá\nGói A:\n- Cài đặt **4.900.000đ**\n- Duy trì 990.000đ\n\n1. Bước một\n2) Bước hai\n```\nHết.');
    assert.deepEqual(b.map((x) => x.t), ['p', 'ul', 'ol', 'p']);
    assert.equal(b[0].parts[0].text, 'Giá\nGói A:');
    assert.equal(b[1].items.length, 2);
    assert.deepEqual(b[1].items[0][1], { t: 'b', text: '4.900.000đ' });
    assert.equal(b[2].items[1][0].text, 'Bước hai');
    assert.equal(b[3].parts[0].text, 'Hết.');
  });
  test('stripHtml (kiến thức): link thành "chữ (địa chỉ đầy đủ)", bỏ thẻ', () => {
    assert.equal(stripHtml('Xem <a href="/bang-gia/">bảng giá</a> &amp; <strong>ưu đãi</strong>.'), 'Xem bảng giá (https://www.ads-nolimit.agency/bang-gia/) & ưu đãi.');
  });
});
