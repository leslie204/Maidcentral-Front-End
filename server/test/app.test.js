// The server against the fake MaidCentral portal (with 2FA): sign-in, code, remembered
// browser, read-only API, and the guards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFakePortal, TWO_FACTOR_CODE } from '../../capture/test/e2e/fake-portal.js';
import { createApp } from '../src/app.js';
import { assertRead, mcDate } from '../src/mc.js';
import { readForms } from '../src/forms.js';

let portal;
let server;
let base;

before(async () => {
  portal = await startFakePortal({ twoFactor: true });
  const app = createApp({ portalUrl: portal.url, secureCookies: false });
  await new Promise((resolve) => (server = app.listen(0, '127.0.0.1', resolve)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  portal.close();
});

function client() {
  let cookie = '';
  return async (method, path, body, { header = true } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(header ? { 'x-requested-with': 'mcfe' } : {}), ...(body ? { 'content-type': 'application/json' } : {}), cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

test('sign-in with 2FA, then read-only data; the browser is remembered next time', async () => {
  const call = client();
  assert.equal((await call('GET', '/api/schedule?date=2026-11-02')).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'test@example.com', password: 'nope' })).status, 401);

  const first = await call('POST', '/auth/login', { email: 'test@example.com', password: 'pw' });
  assert.equal(first.body.status, 'code');
  assert.equal((await call('POST', '/auth/code', { code: '000000' })).status, 401);
  const verified = await call('POST', '/auth/code', { code: TWO_FACTOR_CODE });
  assert.equal(verified.body.status, 'signed-in');
  assert.equal((await call('GET', '/auth/me')).body.email, 'test@example.com');

  const day = await call('GET', '/api/schedule?date=2026-11-02');
  assert.equal(day.status, 200);
  assert.deepEqual(day.body.jobs[0], { id: 7, teamId: 1, title: 'Jane Doe - Weekly', start: 1793610000000, end: 1793617200000, allowedHours: 2, statusId: 2, color: null, frequencyColor: null, instructions: null, tags: null, recurring: true });
  assert.equal(day.body.teams[0].name, 'Team A');
  assert.equal((await call('GET', '/api/schedule?date=nope')).status, 400);

  // A new sign-in skips 2FA: the server kept MaidCentral's "remember this browser" cookie.
  const again = client();
  assert.equal((await again('POST', '/auth/login', { email: 'test@example.com', password: 'pw' })).body.status, 'signed-in');

  // Only the login and 2FA posts ever reached MaidCentral.
  const posts = [...new Set(portal.log.filter((r) => r.method !== 'GET').map((r) => r.path))];
  assert.deepEqual(posts.sort(), ['/Account/Login', '/Account/SendCode', '/Account/VerifyCode']);
});

test('state changes need the app header', async () => {
  const call = client();
  assert.equal((await call('POST', '/auth/login', { email: 'test@example.com', password: 'pw' }, { header: false })).status, 403);
});

test('read-only guard: GETs that name actions and unreviewed POSTs are refused', () => {
  const host = 'acme.maidcentral.com';
  assert.doesNotThrow(() => assertRead('GET', 'https://acme.maidcentral.com/Job/ReadJobs?date=1/1/2026', host));
  assert.doesNotThrow(() => assertRead('POST', 'https://acme.maidcentral.com/Customer/Jobs', host, { 'x-requested-with': 'XMLHttpRequest' }));
  assert.throws(() => assertRead('GET', 'https://acme.maidcentral.com/Job/Delete/5', host), /looks like an action/);
  assert.throws(() => assertRead('POST', 'https://acme.maidcentral.com/Company/BroadcastMessage', host, { 'x-requested-with': 'XMLHttpRequest' }), /not a reviewed read/);
  assert.throws(() => assertRead('POST', 'https://acme.maidcentral.com/Customer/Jobs', host), /not a reviewed read/);
  assert.throws(() => assertRead('DELETE', 'https://acme.maidcentral.com/Customer/Jobs', host, { 'x-requested-with': 'XMLHttpRequest' }), /not a reviewed read/);
});

test('helpers: MaidCentral dates and form reading', () => {
  assert.equal(mcDate('/Date(1793609100000)/'), 1793609100000);
  assert.equal(mcDate(null), null);
  const [form] = readForms('<form method="post" action="/Account/SendCode"><input type="hidden" name="__RequestVerificationToken" value="t"><select name="SelectedProvider"><option value="Phone">Text</option><option value="Email">Email</option></select><input type="checkbox" name="RememberMe" value="true"><input type="hidden" name="RememberMe" value="false"><button type="submit">Send</button></form>', 'https://x.maidcentral.com/Account/SendCode?ReturnUrl=%2F');
  assert.equal(form.action, 'https://x.maidcentral.com/Account/SendCode');
  assert.deepEqual(form.fields, [['__RequestVerificationToken', 't'], ['SelectedProvider', 'Phone'], ['RememberMe', 'false']]);
});
