// Test harness: serves the built site, fakes Firebase Auth (Identity Toolkit + Secure Token),
// and proxies Firestore REST calls to the LOCAL Firestore emulator (project demo-ads-nolimit) so
// the real firestore.rules are enforced. Nothing is allowed to leave the machine.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:' + (process.env.WEB_PORT || '4330');
const EMU = 'http://127.0.0.1:' + (process.env.EMU_PORT || '8080');
const REAL_PROJECT = 'ads-nolimit-web';
const EMU_PROJECT = 'demo-ads-nolimit';
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const unb64 = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

// ---------------- Fake Firebase Auth ----------------
class FakeAuth {
  constructor() {
    this.users = new Map(); // uid -> user
    this.tokens = new Map(); // idToken/refreshToken -> uid
    this.calls = []; // { endpoint, body }
    this.nextError = {}; // endpoint -> server error message (one shot)
    this.abortNext = {}; // endpoint -> true (simulate network failure, one shot)
    this.seq = 0;
  }
  addUser({ email, password, displayName = '', provider = 'password', emailVerified = false, photoUrl = '' }) {
    const uid = `uid${++this.seq}x${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const u = { uid, email, password, displayName, provider, emailVerified, photoUrl, createdAt: now - 86400000, lastLoginAt: now };
    this.users.set(uid, u);
    return u;
  }
  byEmail(email) {
    return [...this.users.values()].find((u) => u.email.toLowerCase() === String(email).toLowerCase());
  }
  token(u) {
    const now = Math.floor(Date.now() / 1000);
    const idToken =
      b64({ alg: 'none', typ: 'JWT' }) +
      '.' +
      b64({
        iss: `https://securetoken.google.com/${REAL_PROJECT}`,
        aud: REAL_PROJECT,
        auth_time: now,
        user_id: u.uid,
        sub: u.uid,
        iat: now,
        exp: now + 3600,
        email: u.email,
        email_verified: u.emailVerified,
        firebase: { identities: { email: [u.email] }, sign_in_provider: u.provider },
      }) +
      '.fakesig' +
      ++this.seq;
    const refreshToken = `refresh-${u.uid}-${this.seq}`;
    this.tokens.set(idToken, u.uid);
    this.tokens.set(refreshToken, u.uid);
    return { idToken, refreshToken, expiresIn: '3600' };
  }
  userFromToken(t) {
    const uid = this.tokens.get(t);
    return uid ? this.users.get(uid) : undefined;
  }
  info(u) {
    const providerUserInfo =
      u.provider === 'google.com'
        ? [{ providerId: 'google.com', email: u.email, federatedId: `g-${u.uid}`, rawId: `g-${u.uid}`, displayName: u.displayName, photoUrl: u.photoUrl }]
        : [{ providerId: 'password', email: u.email, federatedId: u.email, rawId: u.email, displayName: u.displayName }];
    return {
      localId: u.uid,
      email: u.email,
      emailVerified: u.emailVerified,
      displayName: u.displayName || undefined,
      photoUrl: u.photoUrl || undefined,
      providerUserInfo,
      passwordHash: u.provider === 'password' ? 'UkVEQUNURUQ=' : undefined,
      passwordUpdatedAt: u.createdAt,
      validSince: String(Math.floor(u.createdAt / 1000)),
      lastLoginAt: String(u.lastLoginAt),
      createdAt: String(u.createdAt),
      lastRefreshAt: new Date().toISOString(),
    };
  }
  err(message) {
    return { status: 400, body: { error: { code: 400, message, errors: [{ message, domain: 'global', reason: 'invalid' }] } } };
  }
  handle(endpoint, body) {
    this.calls.push({ endpoint, body });
    if (this.nextError[endpoint]) {
      const msg = this.nextError[endpoint];
      delete this.nextError[endpoint];
      return this.err(msg);
    }
    switch (endpoint) {
      case 'accounts:signInWithPassword': {
        const u = this.byEmail(body.email);
        if (!u || u.password !== body.password) return this.err('INVALID_LOGIN_CREDENTIALS');
        u.lastLoginAt = Date.now();
        return { status: 200, body: { kind: 'identitytoolkit#VerifyPasswordResponse', localId: u.uid, email: u.email, displayName: u.displayName, registered: true, ...this.token(u) } };
      }
      case 'accounts:signUp': {
        if (this.byEmail(body.email)) return this.err('EMAIL_EXISTS');
        if (!body.password || body.password.length < 6) return this.err('WEAK_PASSWORD : Password should be at least 6 characters');
        const u = this.addUser({ email: body.email, password: body.password });
        return { status: 200, body: { kind: 'identitytoolkit#SignupNewUserResponse', localId: u.uid, email: u.email, ...this.token(u) } };
      }
      case 'accounts:lookup': {
        const u = this.userFromToken(body.idToken);
        if (!u) return this.err('INVALID_ID_TOKEN');
        return { status: 200, body: { kind: 'identitytoolkit#GetAccountInfoResponse', users: [this.info(u)] } };
      }
      case 'accounts:update': {
        const u = this.userFromToken(body.idToken);
        if (!u) return this.err('INVALID_ID_TOKEN');
        if (typeof body.displayName === 'string') u.displayName = body.displayName;
        if (typeof body.password === 'string') {
          if (body.password.length < 6) return this.err('WEAK_PASSWORD : Password should be at least 6 characters');
          u.password = body.password;
        }
        const extra = body.returnSecureToken ? this.token(u) : {};
        const info = this.info(u);
        return { status: 200, body: { kind: 'identitytoolkit#SetAccountInfoResponse', ...info, ...extra } };
      }
      case 'accounts:sendOobCode': {
        if (body.requestType === 'VERIFY_EMAIL') {
          const u = this.userFromToken(body.idToken);
          if (!u) return this.err('INVALID_ID_TOKEN');
          return { status: 200, body: { kind: 'identitytoolkit#GetOobConfirmationCodeResponse', email: u.email } };
        }
        if (body.requestType === 'PASSWORD_RESET') {
          if (!this.byEmail(body.email)) return this.err('EMAIL_NOT_FOUND');
          return { status: 200, body: { kind: 'identitytoolkit#GetOobConfirmationCodeResponse', email: body.email } };
        }
        return this.err('INVALID_REQ_TYPE');
      }
      case 'accounts:delete': {
        const u = this.userFromToken(body.idToken);
        if (!u) return this.err('INVALID_ID_TOKEN');
        this.users.delete(u.uid);
        return { status: 200, body: { kind: 'identitytoolkit#DeleteAccountResponse' } };
      }
      case 'projects':
        return { status: 200, body: { projectId: REAL_PROJECT, authorizedDomains: ['localhost', '127.0.0.1', 'www.ads-nolimit.agency'] } };
      case 'token': {
        const u = this.userFromToken(body.refresh_token);
        if (!u) return this.err('INVALID_REFRESH_TOKEN');
        const t = this.token(u);
        return {
          status: 200,
          body: { access_token: t.idToken, expires_in: '3600', token_type: 'Bearer', refresh_token: t.refreshToken, id_token: t.idToken, user_id: u.uid, project_id: '605653074969' },
        };
      }
      default:
        return this.err('UNSUPPORTED_IN_TEST_' + endpoint);
    }
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};

const FAKE_GAPI = `(function () {
  var cb = new URL(document.currentScript.src).searchParams.get('onload');
  var frame = {
    restyle: function () { return Promise.resolve(); },
    ping: function () { return Promise.resolve(); },
    register: function () {},
    send: function (type, data, done) { setTimeout(function () { try { done([{ webStorageSupport: true }]); } catch (e) {} }, 0); },
  };
  window.gapi = {
    load: function (name, opts) { setTimeout(opts.callback, 0); },
    iframes: {
      CROSS_ORIGIN_IFRAMES_FILTER: function () { return true; },
      getContext: function () { return { open: function (params, onOpen) { return onOpen(frame); } }; },
    },
  };
  if (cb && window[cb]) window[cb]();
})();`;

const tinyPng = fs.readFileSync('/home/claude/ads-nolimit-v4/public/favicon-32.png');

/** Rewrite the fake ID token's aud/iss to the emulator project (signature is not checked by the emulator). */
const emuAuthHeader = (h) => {
  if (!h || !h.startsWith('Bearer ')) return h;
  const parts = h.slice(7).split('.');
  if (parts.length < 2) return h;
  try {
    const p = unb64(parts[1]);
    p.aud = EMU_PROJECT;
    p.iss = `https://securetoken.google.com/${EMU_PROJECT}`;
    return `Bearer ${parts[0]}.${b64(p)}.`;
  } catch {
    return h;
  }
};

async function setupContext(browser, opts = {}) {
  const context = await browser.newContext(opts);
  const fake = opts.fake || new FakeAuth();
  const external = []; // every non-local request: { url, action }
  context.fake = fake;
  context.external = external;
  context.firestoreFailure = null; // e.g. 'PERMISSION_DENIED' to simulate
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === BASE) return route.continue();
    if (req.method() === 'OPTIONS') {
      external.push({ url: req.url(), action: 'preflight' });
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (url.hostname === 'identitytoolkit.googleapis.com' || url.hostname === 'securetoken.googleapis.com') {
      let endpoint = url.pathname.replace(/^\/v\d\//, '');
      if (url.hostname === 'securetoken.googleapis.com') endpoint = 'token';
      if (fake.abortNext[endpoint]) {
        delete fake.abortNext[endpoint];
        external.push({ url: req.url(), action: 'aborted-on-purpose' });
        return route.abort('internetdisconnected');
      }
      let body = {};
      const raw = req.postData();
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = Object.fromEntries(new URLSearchParams(raw));
        }
      }
      const res = fake.handle(endpoint, body);
      external.push({ url: req.url(), action: `mock ${endpoint} ${res.status}` });
      return route.fulfill({ status: res.status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(res.body) });
    }
    if (url.hostname === 'firestore.googleapis.com') {
      if (context.firestoreFailure) {
        external.push({ url: req.url(), action: 'firestore-simulated-' + context.firestoreFailure });
        return route.fulfill({
          status: 403,
          headers: { ...CORS, 'content-type': 'application/json' },
          body: JSON.stringify({ error: { code: 403, message: 'Missing or insufficient permissions.', status: context.firestoreFailure } }),
        });
      }
      const target = EMU + url.pathname.split(REAL_PROJECT).join(EMU_PROJECT) + url.search;
      const headers = { 'content-type': 'application/json' };
      const auth = req.headers()['authorization'];
      if (auth) headers.authorization = emuAuthHeader(auth);
      const postData = req.postData();
      const resp = await fetch(target, {
        method: req.method(),
        headers,
        body: postData ? postData.split(REAL_PROJECT).join(EMU_PROJECT) : undefined,
      });
      const text = (await resp.text()).split(EMU_PROJECT).join(REAL_PROJECT);
      external.push({ url: req.url(), action: `emulator ${resp.status}` });
      return route.fulfill({ status: resp.status, headers: { ...CORS, 'content-type': 'application/json' }, body: text });
    }
    if (url.hostname === 'apis.google.com' && url.pathname === '/js/api.js' && context.gapiMode !== 'block') {
      // Minimal local stand-in for Google's gapi iframe loader, so the Firebase popup code can reach window.open().
      external.push({ url: req.url(), action: 'mock-gapi' });
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: FAKE_GAPI });
    }
    if (url.hostname.endsWith('googleusercontent.com')) {
      external.push({ url: req.url(), action: 'mock-photo' });
      return route.fulfill({ status: 200, headers: { 'content-type': 'image/png' }, body: tinyPng });
    }
    external.push({ url: req.url(), action: 'BLOCKED' });
    return route.abort('blockedbyclient');
  });
  return context;
}

// Emulator admin helpers ("Bearer owner" bypasses rules in the emulator).
const emuDocs = `${EMU}/v1/projects/${EMU_PROJECT}/databases/(default)/documents`;
const emu = {
  async clear() {
    await fetch(`${EMU}/emulator/v1/projects/${EMU_PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  },
  async get(p) {
    const r = await fetch(`${emuDocs}/${p}`, { headers: { authorization: 'Bearer owner' } });
    return r.status === 200 ? r.json() : null;
  },
  async list(coll) {
    const r = await fetch(`${emuDocs}/${coll}?pageSize=100`, { headers: { authorization: 'Bearer owner' } });
    const j = await r.json();
    return j.documents || [];
  },
  async patch(p, fields) {
    const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
    const r = await fetch(`${emuDocs}/${p}?${mask}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    return r.status;
  },
};

// ---------------- Tiny test runner ----------------
const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('  ✔', name);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log('  ✖', name, '\n     ', e.message.split('\n').slice(0, 4).join('\n      '));
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const eq = (a, b, msg) => assert(a === b, `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const has = (a, b, msg) => assert(String(a).includes(b), `${msg}: expected to contain ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

function watchConsole(page, bucket) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') bucket.push(`[${m.type()}] ${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => bucket.push(`[pageerror] ${page.url()} :: ${e.message}`));
}

// ---------- REST value conversion (seeding / reading the emulator as "owner") ----------
const toValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
};
const fromValue = (v) => {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
  return v;
};
emu.set = async (p, obj) => {
  const r = await fetch(`${emuDocs}/${p}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, toValue(x)])) }),
  });
  if (r.status !== 200) throw new Error(`emu.set ${p}: ${r.status} ${await r.text()}`);
};
emu.obj = async (p) => {
  const d = await emu.get(p);
  return d ? Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, fromValue(x)])) : null;
};
emu.all = async (coll) => (await emu.list(coll)).map((d) => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, fromValue(x)])) }));
emu.del = async (p) => fetch(`${emuDocs}/${p}`, { method: 'DELETE', headers: { authorization: 'Bearer owner' } });

async function signIn(page, email, password, next = '/tai-khoan/') {
  const signInPath = next.startsWith('/en/') ? '/en/sign-in/' : '/dang-nhap/';
  await page.goto(BASE + signInPath + '?next=' + encodeURIComponent(next));
  await page.fill('#signin-email', email);
  await page.fill('#signin-password', password);
  await Promise.all([page.waitForURL((u) => u.pathname === next.split('#')[0].split('?')[0]), page.click('#signin-form button[type=submit]')]);
}

module.exports = { toValue, fromValue, signIn, BASE, SHOTS, FakeAuth, setupContext, emu, step, assert, eq, has, results, watchConsole, chromium, unb64 };
