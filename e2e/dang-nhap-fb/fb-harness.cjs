// Mở rộng harness (e2e/pwa/harness.cjs) cho đăng nhập Facebook — KHÔNG sửa harness gốc, chỉ vá FakeAuth.prototype tại đây:
//  - accounts:signInWithIdp (đăng nhập / nối nhà cung cấp, email trùng → needConfirmation như Firebase thật),
//  - accounts:update với deleteProvider (bỏ nối), accounts:sendOobCode VERIFY_AND_CHANGE_EMAIL (thêm email),
//  - danh sách nhà cung cấp theo từng khách (providerUserInfo), khách không có email.
// Cửa sổ popup: window.open bị thay bằng bản ghi (url + userActivation.isActive tại thời điểm gọi) và gapi giả có register(),
// để test tự "hoàn tất" cửa sổ Facebook bằng sự kiện authEvent như trang /__/auth/handler thật sẽ gửi về.
// Không gọi Firebase/Facebook thật: mọi yêu cầu ra ngoài đều bị harness chặn hoặc trả bằng bản giả.
const { FakeAuth } = require('../pwa/harness.cjs');

const defaultProviders = (u) =>
  u.provider === 'google.com'
    ? [{ providerId: 'google.com', rawId: `g-${u.uid}`, email: u.email, displayName: u.displayName }]
    : [{ providerId: 'password', rawId: u.email, email: u.email, displayName: u.displayName }];
const ensureProviders = (u) => (u.providers ||= defaultProviders(u));

const origInfo = FakeAuth.prototype.info;
FakeAuth.prototype.info = function (u) {
  const base = origInfo.call(this, u);
  if (u.providers) {
    base.providerUserInfo = u.providers.map((p) => ({ providerId: p.providerId, federatedId: p.rawId, rawId: p.rawId, email: p.email || undefined, displayName: p.displayName || undefined, photoUrl: p.photoUrl || undefined }));
    base.passwordHash = u.providers.some((p) => p.providerId === 'password') ? 'UkVEQUNURUQ=' : undefined;
  }
  if (!u.email) delete base.email;
  return base;
};

const origByEmail = FakeAuth.prototype.byEmail;
FakeAuth.prototype.byEmail = function (email) {
  if (!email) return undefined;
  return origByEmail.call(this, email);
};

/** Đăng ký "tài khoản Facebook" giả: access_token → hồ sơ Facebook. */
FakeAuth.prototype.addFacebookProfile = function (token, profile) {
  (this.idpProfiles ||= {})[token] = { providerId: 'facebook.com', rawId: `fb-${token}`, email: '', displayName: 'Khách Facebook', emailVerified: false, ...profile };
};
/** Hồ sơ Google giả (để thử "đăng nhập Google sau khi Facebook báo email trùng"). */
FakeAuth.prototype.addGoogleProfile = function (token, user) {
  (this.idpProfiles ||= {})[token] = { providerId: 'google.com', rawId: `g-${user.uid}`, email: user.email, displayName: user.displayName, emailVerified: true };
};

/** Giả lập khách bấm link trong thư "xác minh email mới": email được đặt và đã xác minh. */
FakeAuth.prototype.confirmPendingEmail = function (u) {
  u.email = u.pendingEmail;
  u.emailVerified = true;
  ensureProviders(u).forEach((p) => (p.email ||= u.email));
  delete u.pendingEmail;
};

FakeAuth.prototype.facebookUser = function (token) {
  return [...this.users.values()].find((u) => (u.providers || []).some((p) => p.providerId === 'facebook.com' && p.rawId === `fb-${token}`));
};

const origHandle = FakeAuth.prototype.handle;
FakeAuth.prototype.handle = function (endpoint, body) {
  if (endpoint === 'accounts:signInWithIdp') {
    this.calls.push({ endpoint, body });
    if (this.nextError[endpoint]) {
      const msg = this.nextError[endpoint];
      delete this.nextError[endpoint];
      return this.err(msg);
    }
    const token = new URLSearchParams(body.postBody || '').get('access_token');
    const prof = this.idpProfiles && this.idpProfiles[token];
    if (!prof) return this.err('INVALID_IDP_RESPONSE');
    const entry = { providerId: prof.providerId, rawId: prof.rawId, email: prof.email, displayName: prof.displayName };
    const owner = [...this.users.values()].find((x) => ensureProviders(x).some((p) => p.providerId === prof.providerId && p.rawId === prof.rawId));
    let u;
    let isNew = false;
    if (body.idToken) {
      u = this.userFromToken(body.idToken);
      if (!u) return this.err('INVALID_ID_TOKEN');
      if (owner && owner.uid !== u.uid) return this.err('FEDERATED_USER_ID_ALREADY_LINKED');
      if (!owner) ensureProviders(u).push(entry);
    } else if (owner) {
      u = owner;
    } else {
      const same = prof.email && this.byEmail(prof.email);
      if (same) {
        // Firebase thật: email đã thuộc tài khoản khác (đặt "một tài khoản cho mỗi email") → buộc đăng nhập cách cũ rồi nối.
        return { status: 200, body: { kind: 'identitytoolkit#VerifyAssertionResponse', needConfirmation: true, email: prof.email, providerId: prof.providerId, oauthAccessToken: token, verifiedProvider: ['password'] } };
      }
      u = this.addUser({ email: prof.email, password: '', displayName: prof.displayName, provider: prof.providerId, emailVerified: !!prof.emailVerified });
      u.providers = [entry];
      isNew = true;
    }
    u.lastLoginAt = Date.now();
    return {
      status: 200,
      body: { kind: 'identitytoolkit#VerifyAssertionResponse', federatedId: prof.rawId, providerId: prof.providerId, localId: u.uid, emailVerified: u.emailVerified, email: u.email || undefined, oauthAccessToken: token, displayName: u.displayName, isNewUser: isNew, rawUserInfo: '{}', ...this.token(u) },
    };
  }
  if (endpoint === 'accounts:update' && Array.isArray(body.deleteProvider)) {
    const u = this.userFromToken(body.idToken);
    if (u) ensureProviders(u).splice(0, u.providers.length, ...u.providers.filter((p) => !body.deleteProvider.includes(p.providerId)));
  }
  if (endpoint === 'accounts:sendOobCode' && body.requestType === 'VERIFY_AND_CHANGE_EMAIL') {
    this.calls.push({ endpoint, body });
    const u = this.userFromToken(body.idToken);
    if (!u) return this.err('INVALID_ID_TOKEN');
    if (this.byEmail(body.newEmail)) return this.err('EMAIL_EXISTS');
    u.pendingEmail = body.newEmail;
    return { status: 200, body: { kind: 'identitytoolkit#GetOobConfirmationCodeResponse', email: body.newEmail } };
  }
  return origHandle.call(this, endpoint, body);
};

/** gapi giả (có register để nhận authEvent) + window.open ghi lại thay vì mở cửa sổ thật. */
const FAKE_GAPI = `(function () {
  var cb = new URL(document.currentScript.src).searchParams.get('onload');
  var handlers = {};
  var frame = {
    restyle: function () { return Promise.resolve(); },
    ping: function () { return Promise.resolve(); },
    register: function (name, fn) { handlers[name] = fn; },
    send: function (type, data, done) { setTimeout(function () { try { done([{ webStorageSupport: true }]); } catch (e) {} }, 0); },
  };
  window.__emitAuthEvent = function (ev) { return handlers.authEvent({ authEvent: ev }); };
  window.gapi = {
    load: function (name, opts) { setTimeout(opts.callback, 0); },
    iframes: {
      CROSS_ORIGIN_IFRAMES_FILTER: function () { return true; },
      getContext: function () { return { open: function (params, onOpen) { return onOpen(frame); } }; },
    },
  };
  if (cb && window[cb]) window[cb]();
})();`;

const OPEN_RECORDER = `
  window.__opens = [];
  window.__blockPopups = false;
  window.open = function (url, name, features) {
    window.__opens.push({ url: String(url), name: String(name), active: navigator.userActivation ? navigator.userActivation.isActive : null, t: Date.now() });
    if (window.__blockPopups) return null;
    var w = { closed: false, focus: function () {}, close: function () { this.closed = true; } };
    window.__lastPopup = w;
    return w;
  };`;

/** Cài vào một context đã tạo bằng setupContext. */
async function installFacebookPopup(ctx) {
  await ctx.addInitScript(OPEN_RECORDER);
  // Đăng ký SAU route chung của harness → được xử lý trước nó.
  await ctx.route('https://apis.google.com/js/api.js*', (route) => {
    ctx.external.push({ url: route.request().url(), action: 'mock-gapi-facebook' });
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: FAKE_GAPI });
  });
}

/** Tham số của cửa sổ Facebook vừa mở (lần mở cuối). */
async function lastOpen(page) {
  const o = await page.evaluate(() => window.__opens[window.__opens.length - 1] || null);
  if (!o) return null;
  const url = new URL(o.url);
  return { ...o, host: url.host, path: url.pathname, eventId: url.searchParams.get('eventId'), authType: url.searchParams.get('authType'), providerId: url.searchParams.get('providerId'), scopes: (url.searchParams.get('scopes') || '').split(','), custom: JSON.parse(url.searchParams.get('customParameters') || '{}') };
}

/** Trang /__/auth/handler giả gửi kết quả về: type = signInViaPopup | linkViaPopup | reauthViaPopup; error = lỗi giả. */
async function finishPopup(page, { token = '', type, error, providerId = 'facebook.com' } = {}) {
  const open = await lastOpen(page);
  if (!open) throw new Error('chưa có cửa sổ Facebook nào được mở');
  const t = type || { signInViaPopup: 'signInViaPopup', linkViaPopup: 'linkViaPopup', reauthViaPopup: 'reauthViaPopup' }[open.authType] || open.authType;
  await page.evaluate(
    ({ eventId, t, token, error, providerId }) =>
      window.__emitAuthEvent(
        error
          ? { type: t, eventId, error }
          : { type: t, eventId, urlResponse: 'https://ads-nolimit-web.firebaseapp.com/__/auth/handler?code=fake', sessionId: 'sess-' + eventId, postBody: `access_token=${token}&providerId=${providerId}` },
      ),
    { eventId: open.eventId, t, token, error, providerId },
  );
}

module.exports = { installFacebookPopup, lastOpen, finishPopup, ensureProviders };
