// Starts the proof-of-concept server. Serves the built web app (web/dist) and the API.
//   MC_PORTAL_URL   the tenant portal, e.g. https://<company>.maidcentral.com/
//   ALLOWED_EMAILS  optional comma-separated list of who may sign in
//   PORT            set by Railway
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const portalUrl = process.env.MC_PORTAL_URL;
if (!portalUrl) {
  console.error('Set MC_PORTAL_URL (https://<company>.maidcentral.com/).');
  process.exit(2);
}
const staticDir = path.join(HERE, '..', '..', 'web', 'dist');
const app = createApp({
  portalUrl,
  allowedEmails: (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  secureCookies: process.env.NODE_ENV === 'production',
  staticDir: fs.existsSync(staticDir) ? staticDir : undefined,
});
const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`MaidCentral front end on :${port} (portal ${new URL(portalUrl).host})`));
