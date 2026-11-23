// The Sales Hub's own MaidCentral user. The placement API reads MaidCentral as this user, not
// as whichever person is signed in to this app, so reps in the Hub never need a MaidCentral
// login and the Hub sees exactly what that user is allowed to see.
//
// Signing it in: someone signed in to this app opens Sales Hub connection and enters the
// user's email and password (and MaidCentral's code, the first time on this server). Its
// MaidCentral cookies are kept like any session (encrypted, see store.js), so restarts don't
// sign it out. Optionally MC_HUB_EMAIL and MC_HUB_PASSWORD let the app sign it back in by
// itself (with the remembered browser, no code is asked for 30 days).
//
// Keeping it alive: MaidCentral ends a session after 12 hours without use, so it's used every
// 10 minutes; while the Hub is placing customers, openings are kept fresh every 2 minutes
// so availability answers at once.
import { McSession, McError } from '../mc.js';
import { localToday } from '../geo.js';
import { hashSid } from '../store.js';

const KEY = hashSid('placement:hub-user');
const KEEP_MS = 30 * 24 * 60 * 60 * 1000; // stored this long; MaidCentral decides when it really ends
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const ALIVE_MS = 10 * 60 * 1000;
const WARM_MS = 2 * 60 * 1000;
const ACTIVE_MS = 30 * 60 * 1000;

export function createHubUser({ portalUrl, store, fetchImpl, autoEmail = null, autoPassword = null, prewarm = () => {}, log = console, now = () => Date.now() }) {
  let mc = null;
  let email = null;
  let since = null;
  let lastUsed = 0;
  let lastError = null;
  let saved = null;
  let signingIn = null;

  const state = () => (mc?.signedIn ? 'signed_in' : mc?.pendingForm ? 'code' : 'signed_out');

  async function save() {
    if (!mc) return;
    const json = JSON.stringify(mc.toState());
    if (json === saved) return;
    await store.saveSession(KEY, { email, state: mc.toState(), expiresAt: now() + KEEP_MS });
    saved = json;
  }

  async function signIn(userEmail, password) {
    const e = String(userEmail || '').trim().toLowerCase();
    if (!e || !password) throw new McError('input', 'Enter the Hub user’s MaidCentral email and password.');
    const next = new McSession(portalUrl, { fetchImpl });
    const result = await next.login(e, password, await store.getRemembered(e));
    mc = next;
    email = e;
    saved = null;
    lastError = null;
    if (result.status === 'signed-in') since = now();
    await save();
    log.info?.(`placement: Hub user ${result.status === 'signed-in' ? 'signed in' : 'waiting for a code'}`);
    return { status: result.status === 'signed-in' ? 'signed_in' : 'code', sentTo: result.sentTo || null };
  }

  async function code(value) {
    if (!mc?.pendingForm) throw new McError('state', 'Sign the Hub user in first: no code was asked for.');
    const result = await mc.verify(String(value || ''));
    if (result.rememberCookie) await store.saveRemembered(email, result.rememberCookie, result.rememberCookie.expires || now() + REMEMBER_MS);
    since = now();
    lastError = null;
    await save();
    return { status: 'signed_in' };
  }

  async function signOut() {
    mc = null;
    email = null;
    since = null;
    saved = null;
    await store.deleteSession(KEY);
  }

  // Signs back in by itself when MC_HUB_EMAIL / MC_HUB_PASSWORD are set (one attempt at a time).
  function autoSignIn() {
    if (!autoEmail || !autoPassword || signingIn) return signingIn;
    signingIn = signIn(autoEmail, autoPassword)
      .catch((e) => {
        lastError = e.message;
        log.warn?.(`placement: Hub user could not sign in by itself: ${e.message}`);
      })
      .finally(() => {
        signingIn = null;
      });
    return signingIn;
  }

  // MaidCentral ended the session: note it and try to sign back in.
  function lost(e) {
    if (mc) mc.signedIn = false;
    lastError = e.message;
    since = null;
    log.warn?.(`placement: Hub user signed out by MaidCentral (${e.message})`);
    save().catch(() => {});
    autoSignIn();
  }

  async function init() {
    const rec = await store.getSession(KEY).catch(() => null);
    if (rec) {
      mc = McSession.fromState(portalUrl, rec.state, { fetchImpl });
      email = rec.email;
      saved = JSON.stringify(rec.state);
      if (mc.signedIn) since = now();
    }
    if (!mc?.signedIn) await autoSignIn();
  }

  /** The MaidCentral session to read with; throws when the Hub user isn't signed in. */
  function session() {
    if (!mc?.signedIn) {
      autoSignIn();
      const e = new McError('hub_user', state() === 'code'
        ? 'Clean Bee’s Sales Hub connection is waiting for a MaidCentral code: open Sales Hub connection in the Clean Bee app.'
        : 'Clean Bee’s Sales Hub connection is signed out of MaidCentral: sign the Hub user in again (Clean Bee app → Sales Hub connection).');
      throw e;
    }
    lastUsed = now();
    return mc;
  }

  /** Runs fn(mc); notices a lost session and saves renewed cookies afterwards. */
  async function use(fn) {
    const s = session();
    try {
      return await fn(s);
    } catch (e) {
      if (e?.code === 'expired' || !s.signedIn) lost(e);
      throw e;
    } finally {
      save().catch((e) => log.warn?.(`placement: could not save the Hub user’s session: ${e.message}`));
    }
  }

  async function keepAlive() {
    if (!mc?.signedIn) return autoSignIn();
    try {
      const [y, m, d] = localToday().split('-').map(Number);
      await mc.getJson('/Job/TeamMonitorTeams', { date: `${m}/${d}/${y}`, view: 'HalfHourView' });
      await save();
    } catch (e) {
      if (e?.code === 'expired' || !mc.signedIn) lost(e);
      else lastError = e.message;
    }
  }

  function start() {
    const alive = setInterval(() => keepAlive().catch(() => {}), ALIVE_MS);
    const warm = setInterval(() => {
      if (mc?.signedIn && now() - lastUsed < ACTIVE_MS) prewarm(mc);
    }, WARM_MS);
    alive.unref?.();
    warm.unref?.();
    return () => {
      clearInterval(alive);
      clearInterval(warm);
    };
  }

  function status() {
    return {
      state: state(),
      email,
      since: since ? new Date(since).toISOString() : null,
      lastUsed: lastUsed ? new Date(lastUsed).toISOString() : null,
      error: state() === 'signed_in' ? null : lastError,
      signsInByItself: Boolean(autoEmail && autoPassword),
    };
  }

  return { init, start, signIn, code, signOut, session, use, keepAlive, status, signedIn: () => Boolean(mc?.signedIn) };
}
