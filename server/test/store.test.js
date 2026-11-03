// Sessions survive a restart (same store, new app instance), and the Postgres store keeps
// only hashed ids and encrypted data. The Postgres tests run when TEST_DATABASE_URL is set
// (CI starts a Postgres service; locally: any empty database).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { startFakePortal, TWO_FACTOR_CODE } from '../../capture/test/e2e/fake-portal.js';
import { createApp } from '../src/app.js';
import { MemoryStore, PgStore, encrypt, decrypt, parseKey, hashSid } from '../src/store.js';

let portal;
before(async () => (portal = await startFakePortal({ twoFactor: true })));
after(() => portal.close());

async function start(store) {
  const app = createApp({ portalUrl: portal.url, secureCookies: false, store, warm: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

async function call(base, method, path, body, cookie = '') {
  const res = await fetch(base + path, {
    method,
    headers: { 'x-requested-with': 'mcfe', 'content-type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] || cookie };
}

async function restartScenario(store) {
  const one = await start(store);
  let r = await call(one.base, 'POST', '/auth/login', { email: 'test@example.com', password: 'pw' });
  const remembered = r.body.status === 'signed-in';
  if (!remembered) {
    assert.equal(r.body.status, 'code');
    r = await call(one.base, 'POST', '/auth/code', { code: TWO_FACTOR_CODE }, r.cookie);
    assert.equal(r.body.status, 'signed-in');
  }
  const cookie = r.cookie;
  one.close();

  // "Restart": a new app instance with nothing in memory, same store.
  const two = await start(store);
  assert.equal((await call(two.base, 'GET', '/auth/me', null, cookie)).body.email, 'test@example.com');
  assert.equal((await call(two.base, 'GET', '/api/schedule?date=2026-11-02', null, cookie)).status, 200);
  // The 2FA "remember this browser" cookie survived too: a new sign-in needs no code.
  assert.equal((await call(two.base, 'POST', '/auth/login', { email: 'test@example.com', password: 'pw' })).body.status, 'signed-in');
  // Sign out removes the session from the store.
  await call(two.base, 'POST', '/auth/logout', {}, cookie);
  assert.equal((await call(two.base, 'GET', '/auth/me', null, cookie)).body.email, null);
  two.close();
  return cookie;
}

test('memory store: a session survives a new app instance', async () => {
  await restartScenario(new MemoryStore());
});

test('encryption: round trip; tampering, another row or another key fail', () => {
  const key = crypto.randomBytes(32);
  const blob = encrypt(key, { jar: [['a', { value: 'b' }]] }, 'session:x');
  assert.deepEqual(decrypt(key, blob, 'session:x'), { jar: [['a', { value: 'b' }]] });
  assert.throws(() => decrypt(key, blob, 'session:y'));
  assert.throws(() => decrypt(crypto.randomBytes(32), blob, 'session:x'));
  const bad = Buffer.from(blob);
  bad[bad.length - 1] ^= 1;
  assert.throws(() => decrypt(key, bad, 'session:x'));
  assert.equal(parseKey('ab'.repeat(32)).length, 32);
  assert.throws(() => parseKey('short'));
});

const DB = process.env.TEST_DATABASE_URL;
test('postgres store: survives restart; only hashes and ciphertext are stored', { skip: !DB && 'set TEST_DATABASE_URL' }, async () => {
  const pool = new pg.Pool({ connectionString: DB });
  await pool.query('drop table if exists app_sessions, remembered_browsers');
  const store = new PgStore(pool, crypto.randomBytes(32));
  await store.init();
  await store.init(); // idempotent
  try {
    const cookie = await restartScenario(store);
    const sid = cookie.split('=')[1];
    // Logged out: that row is gone. Another sign-in's row holds no readable secrets.
    const { rows } = await pool.query('select sid_hash, email, data from app_sessions');
    assert.ok(rows.length >= 1);
    assert.ok(!rows.some((r) => r.sid_hash === sid || r.sid_hash === hashSid(sid)));
    for (const r of rows) {
      assert.match(r.sid_hash, /^[0-9a-f]{64}$/);
      const raw = r.data.toString('latin1');
      for (const secret of ['ApplicationCookie', 'TwoFactorRememberBrowser', 'session=ok']) assert.ok(!raw.includes(secret), `plaintext ${secret} in row`);
    }
    const rb = await pool.query('select data from remembered_browsers');
    assert.equal(rb.rows.length, 1);
    assert.ok(!rb.rows[0].data.toString('latin1').includes('TwoFactorRememberBrowser'));
    // A store with a different key treats rows as signed out instead of failing.
    const other = new PgStore(pool, crypto.randomBytes(32));
    assert.equal(await other.getSession(rows[0].sid_hash), null);
    assert.equal(await other.getRemembered('test@example.com'), null);
    // Expired rows are cleaned up.
    await pool.query("update app_sessions set expires_at = now() - interval '1 minute'");
    await store.cleanup();
    assert.equal((await pool.query('select count(*)::int as n from app_sessions')).rows[0].n, 0);
  } finally {
    await pool.end();
  }
});
