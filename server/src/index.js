// Starts the proof-of-concept server. Serves the built web app (web/dist) and the API.
//   MC_PORTAL_URL   the tenant portal, e.g. https://<company>.maidcentral.com/
//   DATABASE_URL    Postgres for sessions (Railway: ${{Postgres.DATABASE_URL}}). Without it,
//                   sessions live in memory and a restart signs everyone out.
//   SESSION_KEY     32 random bytes (64 hex characters) that encrypt stored sessions.
//                   Required with DATABASE_URL. Changing it signs everyone out.
//   ALLOWED_EMAILS  optional comma-separated list of who may sign in
//   PORT            set by Railway
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createApp } from './app.js';
import { checkRouting } from './routing.js';
import { MemoryStore, PgStore, parseKey } from './store.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const portalUrl = process.env.MC_PORTAL_URL;
if (!portalUrl) {
  console.error('Set MC_PORTAL_URL (https://<company>.maidcentral.com/).');
  process.exit(2);
}

let store;
if (process.env.DATABASE_URL) {
  if (!process.env.SESSION_KEY) {
    console.error('DATABASE_URL is set but SESSION_KEY is not. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(2);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  pool.on('error', (e) => console.error('postgres:', e.message));
  store = new PgStore(pool, parseKey(process.env.SESSION_KEY));
  await store.init();
  console.log('Sessions: Postgres (encrypted)');
} else {
  if (process.env.NODE_ENV === 'production') console.warn('No DATABASE_URL: sessions are kept in memory and a restart signs everyone out.');
  store = new MemoryStore();
}
setInterval(() => store.cleanup().catch((e) => console.error('cleanup:', e.message)), 60 * 60 * 1000).unref();

const staticDir = path.join(HERE, '..', '..', 'web', 'dist');
const app = createApp({
  portalUrl,
  store,
  allowedEmails: (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  secureCookies: process.env.NODE_ENV === 'production',
  staticDir: fs.existsSync(staticDir) ? staticDir : undefined,
});
const port = Number(process.env.PORT || 8787);
const server = app.listen(port, () => console.log(`MaidCentral front end on :${port} (portal ${new URL(portalUrl).host})`));
checkRouting();

// Railway sends SIGTERM on redeploy: finish requests, close the pool.
process.on('SIGTERM', () => {
  server.close(() => store.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 10_000).unref();
});
