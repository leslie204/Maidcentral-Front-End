// Starts the proof-of-concept server. Serves the built web app (web/dist) and the API.
//   MC_PORTAL_URL   the tenant portal, e.g. https://<company>.maidcentral.com/
//   DATABASE_URL    Postgres for sessions (Railway: ${{Postgres.DATABASE_URL}}). Without it,
//                   sessions live in memory and a restart signs everyone out.
//   SESSION_KEY     32 random bytes (64 hex characters) that encrypt stored sessions.
//                   Required with DATABASE_URL. Changing it signs everyone out.
//   ALLOWED_EMAILS  optional comma-separated list of who may sign in
// Placement API for the Sales Hub (docs/placement.md); off until PLACEMENT_TOKENS is set:
//   PLACEMENT_TOKENS       who may call it: "sales-hub:sha256:<fingerprint>" (npm run placement-token)
//   PLACEMENT_BRAND        the Hub's key for this brand (default cleanbee)
//   CB_RATE_RECURRING      dollars per hour on site for regular cleans (default 122)
//   CB_RATE_ONE_TIME       dollars per hour on site for a one-time clean (default 130)
//   MC_HUB_EMAIL, MC_HUB_PASSWORD  optional: lets the Hub's MaidCentral user sign back in by itself
//   PORT            set by Railway
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createApp } from './app.js';
import { checkRouting } from './routing.js';
import { searchAddress } from './geo.js';
import { MemoryStore, PgStore, parseKey } from './store.js';
import { createHash } from 'node:crypto';
import { prewarm } from './territory.js';
import { parseTokens } from './placement/tokens.js';
import { createHubUser } from './placement/hub-user.js';
import { createPlacement } from './placement/service.js';
import { createPlacementRouter } from './placement/api.js';
import { MemoryPlacementStore, PgPlacementStore } from './placement/store.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const portalUrl = process.env.MC_PORTAL_URL;
if (!portalUrl) {
  console.error('Set MC_PORTAL_URL (https://<company>.maidcentral.com/).');
  process.exit(2);
}

let store;
let pool = null;
if (process.env.DATABASE_URL) {
  if (!process.env.SESSION_KEY) {
    console.error('DATABASE_URL is set but SESSION_KEY is not. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(2);
  }
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  pool.on('error', (e) => console.error('postgres:', e.message));
  store = new PgStore(pool, parseKey(process.env.SESSION_KEY));
  await store.init();
  console.log('Sessions: Postgres (encrypted)');
} else {
  if (process.env.NODE_ENV === 'production') console.warn('No DATABASE_URL: sessions are kept in memory and a restart signs everyone out.');
  store = new MemoryStore();
}
setInterval(() => store.cleanup().catch((e) => console.error('cleanup:', e.message)), 60 * 60 * 1000).unref();

// Placement API for the Sales Hub.
const log = {
  info: (m, o) => console.log(m, o ? JSON.stringify(o) : ''),
  warn: (m, o) => console.warn(m, o ? JSON.stringify(o) : ''),
  error: (m, o) => console.error(m, o ? JSON.stringify(o) : ''),
};
const { tokens, bad: badTokens } = parseTokens(process.env.PLACEMENT_TOKENS);
if (badTokens.length) console.warn(`PLACEMENT_TOKENS: ignoring ${badTokens.join(', ')} (each entry is name:sha256:<64 hex> or name:<token of 32+ characters>).`);
const hubUser = createHubUser({ portalUrl, store, autoEmail: process.env.MC_HUB_EMAIL || null, autoPassword: process.env.MC_HUB_PASSWORD || null, prewarm, log });
let placement = { hubUser, callers: tokens.map((t) => t.name), badTokens, brand: process.env.PLACEMENT_BRAND || 'cleanbee' };
if (tokens.length) {
  const placementStore = pool ? new PgPlacementStore(pool) : new MemoryPlacementStore();
  await placementStore.init();
  setInterval(() => placementStore.cleanup().catch((e) => console.error('placement cleanup:', e.message)), 60 * 60 * 1000).unref();
  const rate = (v, d) => (Number(v) > 0 ? Number(v) : d);
  const service = createPlacement({
    store: placementStore,
    hubUser,
    config: {
      brand: placement.brand,
      timezone: process.env.TENANT_TZ || 'America/Los_Angeles',
      currency: 'USD',
      rateRecurring: rate(process.env.CB_RATE_RECURRING, 122),
      rateOneTime: rate(process.env.CB_RATE_ONE_TIME, 130),
      // Slot tokens are signed with a key derived from SESSION_KEY (random without one).
      signingKey: createHash('sha256').update(`placement-slots:${process.env.SESSION_KEY || Math.random()}`).digest(),
    },
  });
  placement = { ...placement, router: createPlacementRouter({ placement: service, config: { tokens, production: process.env.NODE_ENV === 'production' }, log }) };
  console.log(`Placement API on for ${placement.brand} (callers: ${placement.callers.join(', ')})`);
}
await hubUser.init().catch((e) => console.warn('placement: Hub user:', e.message));
hubUser.start();

const staticDir = path.join(HERE, '..', '..', 'web', 'dist');
const app = createApp({
  portalUrl,
  store,
  allowedEmails: (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  secureCookies: process.env.NODE_ENV === 'production',
  staticDir: fs.existsSync(staticDir) ? staticDir : undefined,
  placement,
});
const port = Number(process.env.PORT || 8787);
const server = app.listen(port, () => console.log(`MaidCentral front end on :${port} (portal ${new URL(portalUrl).host})`));
checkRouting();
// Check the address search answers (logs counts per source).
searchAddress('623 N Hogan St').catch((e) => console.warn(`Address search check failed: ${e.message}`));

// Railway sends SIGTERM on redeploy: finish requests, close the pool.
process.on('SIGTERM', () => {
  server.close(() => store.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 10_000).unref();
});
