// Logs into the MaidCentral admin portal, visits every page it can reach, opens tabs,
// forms and modals, and records every request the portal makes (XHR, fetch, page loads
// and form posts). Read-only by default: see safety.js.
//
//   npm run capture                       # headless, logs in with MC_EMAIL / MC_PASSWORD
//   npm run capture -- --headed           # watch it; log in by hand (2FA) if needed
//   npm run capture                       # headless with 2FA: write the code to capture/.auth/2fa-code
//   npm run capture -- --max-pages 50 --per-template 2
//
// Raw output (client/employee data, gitignored): capture/output/
// Redacted catalog (committed):                  docs/api-catalog.json, docs/API.md
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { pageTemplate, templateHost } from './routes.js';
import { decideRequest, isReadPost, parseReadPosts, isLoginRequest, isMaidCentralHost, isSkippedLink, isUnsafeClick, STUB_HOSTS, PASSWORD_INPUT, TWO_FACTOR_INPUT } from './safety.js';
import { summarizeDom, hiddenLinks, clickCandidates, storageKeys } from './dom.js';
import { buildCatalog } from './catalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY_CHARS = 300_000;
const STATIC_FILE = /\.(css|js|mjs|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|mp4|mp3)$/i;

const { values: args } = parseArgs({
  options: {
    headed: { type: 'boolean', default: false },
    start: { type: 'string', default: process.env.MC_PORTAL_START || '/' },
    // Path prefixes the crawler may visit (comma-separated).
    scope: { type: 'string', default: process.env.MC_PORTAL_SCOPE || '/' },
    'max-pages': { type: 'string', default: '300' },
    'per-template': { type: 'string', default: '2' },
    // Tabs/buttons/modal openers clicked per page (0 = don't explore).
    'max-clicks': { type: 'string', default: '12' },
    'allow-writes': { type: 'boolean', default: false },
    seeds: { type: 'string', default: path.join(HERE, 'seeds.txt') },
    // Reviewed POST endpoints that only read data (see read-posts.txt and safety.js).
    'read-posts': { type: 'string', default: path.join(HERE, 'read-posts.txt') },
    fresh: { type: 'boolean', default: false },
    output: { type: 'string', default: path.join(HERE, 'output') },
    docs: { type: 'string', default: path.join(HERE, '..', 'docs') },
    'auth-state': { type: 'string', default: path.join(HERE, '.auth', 'state.json') },
    // Headless 2FA: the crawler waits for the verification code to appear in this file.
    'code-file': { type: 'string', default: path.join(HERE, '.auth', '2fa-code') },
  },
});

if (!process.env.MC_PORTAL_URL) {
  console.error('Set MC_PORTAL_URL to the admin portal address (https://<company>.maidcentral.com/).');
  process.exit(2);
}
const PORTAL = new URL(process.env.MC_PORTAL_URL);
const ORIGIN = PORTAL.origin;
const PORTAL_HOST = PORTAL.host;
const MAX_PAGES = Number(args['max-pages']);
const PER_TEMPLATE = Number(args['per-template']);
const MAX_CLICKS = Number(args['max-clicks']);
const SCOPE = args.scope.split(',').map((s) => s.trim()).filter(Boolean);
const ALLOW_WRITES = args['allow-writes'];
const HAVE_CREDENTIALS = Boolean(process.env.MC_EMAIL && process.env.MC_PASSWORD);
const OUTPUT = path.resolve(args.output);
const AUTH_STATE = path.resolve(args['auth-state']);
const CODE_FILE = path.resolve(args['code-file']);
const READ_POSTS = fs.existsSync(args['read-posts']) ? parseReadPosts(fs.readFileSync(args['read-posts'], 'utf8')) : [];

if (ALLOW_WRITES) console.warn('!! --allow-writes: requests that change data WILL be sent to MaidCentral.');

for (const dir of ['screens', 'html', 'js']) fs.mkdirSync(path.join(OUTPUT, dir), { recursive: true });
fs.mkdirSync(path.dirname(AUTH_STATE), { recursive: true });
const rawFile = path.join(OUTPUT, 'requests.jsonl');
fs.writeFileSync(rawFile, '');

const browser = await chromium.launch({ headless: !args.headed, executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({
  storageState: !args.fresh && fs.existsSync(AUTH_STATE) ? AUTH_STATE : undefined,
  viewport: { width: 1440, height: 900 },
  acceptDownloads: false,
});

// 'login' while signing in (everything allowed, nothing recorded in detail), then 'crawl'.
let phase = 'login';
let currentPage = '(login)';
let via = 'load';
let htmlCount = 0;
let page = null; // the one tab the crawler drives
const savedScripts = new Set();
const popupUrls = [];

await context.route('**/*', async (route) => {
  const req = route.request();
  const url = req.url();
  if (!/^https?:/.test(url)) return route.continue();
  // Telemetry, chat and analytics are answered locally first: nothing reaches them.
  const reqHost = new URL(url).host;
  if (!isMaidCentralHost(reqHost, PORTAL_HOST) && STUB_HOSTS.test(reqHost)) {
    return route.fulfill({ status: 200, body: '', contentType: req.resourceType() === 'script' ? 'application/javascript' : 'text/plain' });
  }
  const decision = decideRequest({ method: req.method(), url, resourceType: req.resourceType(), phase, allowWrites: ALLOW_WRITES, portalHost: PORTAL_HOST, readPosts: READ_POSTS });
  if (decision.action === 'block') {
    record({
      page: pageOf(req),
      via,
      method: req.method(),
      url,
      resourceType: req.resourceType(),
      auth: req.headers().authorization ? req.headers().authorization.split(' ')[0] : null,
      tokenHeaders: Object.keys(req.headers()).filter((h) => /csrf|xsrf|forgery|verification/i.test(h)),
      requestHeaders: pick(req.headers(), ['content-type', 'accept', 'x-requested-with']),
      requestBody: req.postData(),
      blocked: decision.reason,
    });
    console.log(`   blocked (${decision.reason}): ${req.method()} ${pageTemplate(url)}`);
    return route.abort('blockedbyclient');
  }
  return route.continue();
});

context.on('response', async (response) => {
  const req = response.request();
  const type = req.resourceType();
  const url = req.url();
  if (!/^https?:/.test(url)) return;
  const host = new URL(url).host;
  const mc = isMaidCentralHost(host, PORTAL_HOST);
  if (type === 'script' && mc) return saveScript(response);
  if (!['xhr', 'fetch', 'document'].includes(type)) return;
  if (!mc && (type === 'document' || STUB_HOSTS.test(host))) return;

  // While signing in, the sign-in requests themselves are marked 'login'; the page the
  // portal lands on afterwards is recorded like any other page.
  const readPost = isReadPost({ method: req.method(), url, resourceType: type, portalHost: PORTAL_HOST, readPosts: READ_POSTS });
  const entryPhase = phase === 'login' && !readPost && isLoginRequest(req.method(), url) ? 'login' : 'crawl';
  const entry = { page: pageOf(req), via, phase: entryPhase, method: req.method(), url, resourceType: type, status: response.status() };
  if (readPost) entry.readPost = true;
  try {
    const headers = await req.allHeaders();
    entry.auth = headers.authorization ? headers.authorization.split(' ')[0] : null;
    entry.cookieNames = headers.cookie ? headers.cookie.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean) : [];
    entry.tokenHeaders = Object.keys(headers).filter((h) => /csrf|xsrf|forgery|verification/i.test(h));
    entry.requestHeaders = pick(headers, ['content-type', 'accept', 'x-requested-with']);
    entry.setsCookies = (await response.headerValues('set-cookie')).flatMap((v) => v.split('\n')).map((c) => c.split('=')[0].trim());
    const location = response.headers().location;
    if (location) entry.redirect = new URL(location, url).href;
  } catch {}

  // While logging in, keep only method/URL/status: bodies hold the password or tokens.
  if (entryPhase === 'login') return record(entry);

  entry.requestBody = req.postData();
  const contentType = response.headers()['content-type'] || '';
  try {
    if (response.status() >= 300 && response.status() < 400) {
      entry.responseKind = 'redirect';
    } else if (contentType.includes('json')) {
      entry.responseKind = 'json';
      entry.responseBody = truncate(await response.json());
    } else if (contentType.includes('html')) {
      entry.responseKind = 'html';
      const html = await response.text();
      if (type === 'document') {
        const file = `html/${String(++htmlCount).padStart(4, '0')}.html`;
        fs.writeFileSync(path.join(OUTPUT, file), html);
        entry.htmlFile = file;
      } else {
        // An HTML partial loaded by XHR (server-rendered app): summarize its forms/tables.
        entry.responseBody = html.slice(0, MAX_BODY_CHARS);
        entry.htmlSummary = page ? await page.evaluate(summarizeDom, html).catch(() => null) : null;
      }
    } else {
      const text = await response.text();
      entry.responseKind = text ? 'text' : 'empty';
      entry.responseBody = text.slice(0, 5000);
    }
  } catch {
    // Redirects and aborted requests have no body.
  }
  record(entry);
});

function pageOf(req) {
  try {
    if (req.isNavigationRequest() && page && req.frame() === page.mainFrame()) return pageTemplate(req.url());
    const frameUrl = req.frame().url();
    if (frameUrl.startsWith(ORIGIN)) return pageTemplate(frameUrl);
  } catch {}
  return currentPage;
}

function record(entry) {
  fs.appendFileSync(rawFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

async function saveScript(response) {
  const url = response.url().split('?')[0];
  if (savedScripts.has(url)) return;
  savedScripts.add(url);
  try {
    const body = await response.body();
    if (body.length > 15_000_000) return;
    const name = path.basename(new URL(url).pathname).replace(/[^\w.-]/g, '_').slice(0, 60) || 'script';
    const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 8);
    fs.writeFileSync(path.join(OUTPUT, 'js', `${hash}-${name}`), body);
  } catch {}
}

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj[k]).map((k) => [k, obj[k]]));
}

function truncate(body) {
  if (body == null) return body;
  const text = JSON.stringify(body);
  return text.length > MAX_BODY_CHARS ? { _truncated: true, preview: text.slice(0, MAX_BODY_CHARS) } : body;
}

async function settle(p, timeout = 15_000) {
  await p.waitForLoadState('networkidle', { timeout }).catch(() => {});
  await p.waitForTimeout(400);
}

async function visibleCount(p, selector) {
  return p.locator(selector).filter({ visible: true }).count().catch(() => 0);
}

async function onLoginPage(p) {
  return (await visibleCount(p, PASSWORD_INPUT)) > 0;
}

async function onTwoFactorPage(p) {
  return /(log_?in|sign_?in|account|auth|verif|two|2fa|mfa|otp)/i.test(new URL(p.url()).pathname) && (await visibleCount(p, TWO_FACTOR_INPUT)) > 0;
}

// Headless 2FA. The code file is read once and deleted, so a wrong code can be replaced
// by writing a new one.
function readCode() {
  try {
    const code = fs.readFileSync(CODE_FILE, 'utf8').replace(/\s+/g, '');
    fs.rmSync(CODE_FILE, { force: true });
    return code || null;
  } catch {
    return null;
  }
}

// Some 2FA pages only send the code after "Send code" is clicked. That's part of signing
// in, so it's allowed here (the crawl itself never clicks "send"). Email is preferred
// over text when both are offered.
async function requestTwoFactorCode(p) {
  const buttons = p.locator('button, input[type="submit"], input[type="button"], a').filter({ visible: true }).filter({ hasText: /send|get|email|text/i });
  const values = p.locator('input[type="submit"], input[type="button"]').filter({ visible: true });
  const candidates = [];
  for (const loc of [buttons, values]) {
    for (let i = 0; i < (await loc.count()); i++) {
      const el = loc.nth(i);
      const label = `${await el.innerText().catch(() => '')} ${await el.getAttribute('value').catch(() => '')}`.trim();
      if (/(send|get|email|text).*code|code.*(send|email|text)/i.test(label)) candidates.push({ el, label });
    }
  }
  if (!candidates.length) return false;
  const pick = candidates.find((c) => /email/i.test(c.label)) || candidates[0];
  await pick.el.click({ timeout: 5000 }).catch(() => {});
  await settle(p);
  return true;
}

async function enterTwoFactorCode(p, code) {
  const boxes = p.locator(TWO_FACTOR_INPUT).filter({ visible: true });
  const single = p.locator('input[maxlength="1"]').filter({ visible: true });
  if ((await single.count()) >= code.length && (await boxes.count()) !== 1) {
    for (let i = 0; i < code.length; i++) await single.nth(i).fill(code[i]);
  } else {
    await boxes.first().fill(code);
  }
  // "Remember this browser" keeps the saved session past 2FA for 30 days.
  const remember = p.locator('input[type="checkbox"]').filter({ visible: true });
  for (let i = 0; i < (await remember.count()); i++) {
    const box = remember.nth(i);
    const id = await box.getAttribute('id');
    const label = [await box.getAttribute('name'), id, id ? await p.locator(`label[for="${id}"]`).innerText().catch(() => '') : '', await box.locator('xpath=ancestor::label').innerText().catch(() => '')].join(' ');
    if (/remember|trust/i.test(label)) await box.check().catch(() => {});
  }
  await boxes.first().press('Enter').catch(() => {});
  await settle(p);
}

async function login(p) {
  phase = 'login';
  currentPage = '(login)';
  await p.goto(new URL(args.start, ORIGIN).href, { waitUntil: 'domcontentloaded' });
  await settle(p);
  if (!(await onLoginPage(p))) {
    phase = 'crawl';
    return;
  }

  if (HAVE_CREDENTIALS) {
    console.log('Logging in with MC_EMAIL');
    const userBox = p
      .locator('input[type="email"], input[name*="email" i], input[id*="email" i], input[name*="user" i], input[id*="user" i], input[autocomplete="username"]')
      .filter({ visible: true });
    const box = (await userBox.count()) ? userBox : p.locator('input[type="text"]').filter({ visible: true });
    await box.first().fill(process.env.MC_EMAIL);
    await p.locator(PASSWORD_INPUT).filter({ visible: true }).first().fill(process.env.MC_PASSWORD);
    await p.locator(PASSWORD_INPUT).filter({ visible: true }).first().press('Enter');
  } else if (args.headed) {
    console.log('No MC_EMAIL / MC_PASSWORD set: log in in the browser window (waiting up to 5 minutes).');
  } else {
    throw new Error('Login page shown and no credentials set. Set MC_EMAIL / MC_PASSWORD or run with --headed.');
  }

  let deadline = Date.now() + (HAVE_CREDENTIALS && !args.headed ? 60_000 : 5 * 60_000);
  let warned2fa = false;
  for (;;) {
    await p.waitForTimeout(1000);
    await p.waitForLoadState('domcontentloaded').catch(() => {});
    if (await onTwoFactorPage(p)) {
      if (args.headed) {
        if (!warned2fa) console.log('Enter the verification code in the browser window.');
      } else {
        if (!warned2fa) {
          // A person has to read the code from their email or phone; give them time.
          deadline = Date.now() + 10 * 60_000;
          fs.rmSync(CODE_FILE, { force: true }); // ignore a code left over from an earlier run
          if (await requestTwoFactorCode(p)) console.log('Asked MaidCentral to send a verification code.');
          await p.screenshot({ path: path.join(OUTPUT, 'screens', '_2fa.png') }).catch(() => {});
          console.log(`MaidCentral asks for a verification code (2FA). Write it to ${CODE_FILE} (waiting up to 10 minutes).`);
        }
        const code = readCode();
        if (code) {
          await enterTwoFactorCode(p, code);
          console.log('Verification code entered.');
        }
      }
      warned2fa = true;
    } else if (!(await onLoginPage(p))) {
      break;
    }
    if (Date.now() > deadline) {
      throw new Error(warned2fa ? 'Still waiting for 2FA. Write the code sooner, or run with --headed.' : 'Still on the login page. Check MC_EMAIL / MC_PASSWORD (quote values containing #).');
    }
  }
  await settle(p);
  await context.storageState({ path: AUTH_STATE });
  phase = 'crawl';
  console.log('Logged in; session saved for next run (capture/.auth/, gitignored).');
}

function inScope(u) {
  return u.origin === ORIGIN && SCOPE.some((prefix) => u.pathname.startsWith(prefix)) && !STATIC_FILE.test(u.pathname);
}

const skipped = new Set();

function acceptLink(href) {
  let u;
  try {
    u = new URL(href, ORIGIN);
  } catch {
    return null;
  }
  if (!inScope(u)) return null;
  if (isSkippedLink(u.href)) {
    skipped.add(pageTemplate(u.href));
    return null;
  }
  return u.href;
}

async function collectLinks(p) {
  const anchors = await p.$$eval('a[href], area[href]', (els) => els.map((a) => a.href)).catch(() => []);
  const hidden = await p.evaluate(hiddenLinks).catch(() => []);
  return [...new Set([...anchors, ...hidden].map(acceptLink).filter(Boolean))];
}

async function closeOverlays(p) {
  await p.keyboard.press('Escape').catch(() => {});
  const closers = p
    .locator('[data-dismiss="modal"], [data-bs-dismiss="modal"], .modal .close, .modal .btn-close, .k-window-action .k-i-close, .k-window-titlebar-action, .ui-dialog-titlebar-close, [aria-label="Close"]')
    .filter({ visible: true });
  const n = Math.min(await closers.count().catch(() => 0), 3);
  for (let i = 0; i < n; i++) await closers.nth(0).click({ timeout: 1000 }).catch(() => {});
}

// Clicks tabs, "New/Add/Edit/View" buttons and modal openers so their lookup calls are
// recorded. Saves are never clicked, and any write they would send is blocked anyway.
async function explore(p) {
  const discovered = [];
  if (!MAX_CLICKS) return { discovered, clicks: 0 };
  const startUrl = p.url();
  const candidates = await p.evaluate(clickCandidates, MAX_CLICKS * 3).catch(() => []);
  let clicks = 0;
  for (const c of candidates) {
    if (clicks >= MAX_CLICKS) break;
    if (isUnsafeClick(c.description)) continue;
    via = `click: ${c.description.split('|')[0].trim().slice(0, 60)}`;
    try {
      await p.locator(`[data-capture-idx="${c.idx}"]`).first().click({ timeout: 3000 });
    } catch {
      continue;
    }
    clicks += 1;
    await settle(p, 6000);
    if (p.url() !== startUrl) {
      const link = acceptLink(p.url());
      if (link) discovered.push(link);
      await p.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
      await settle(p);
      await p.evaluate(clickCandidates, MAX_CLICKS * 3).catch(() => {});
    } else {
      await closeOverlays(p);
    }
  }
  via = 'load';
  return { discovered, clicks };
}

page = await context.newPage();
// confirm()/prompt() are dismissed (= "Cancel"); leaving a page with unsaved changes is fine.
page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}));
// A link or button opened a new tab/window: note its URL and close it.
page.on('popup', async (p) => {
  await p.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
  if (/^https?:/.test(p.url())) popupUrls.push(p.url());
  await p.close().catch(() => {});
});
await login(page);

const seeds = fs.existsSync(args.seeds)
  ? fs.readFileSync(args.seeds, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => new URL(l, ORIGIN).href)
  : [];
const queue = [page.url(), ...seeds];
const seenUrls = new Set();
const visitsPerTemplate = new Map();
const pages = [];
const failures = [];
let storage = { localStorage: [], sessionStorage: [] };
let relogins = 0;

while (queue.length && pages.length < MAX_PAGES) {
  const url = queue.shift();
  if (seenUrls.has(url)) continue;
  seenUrls.add(url);
  if (!acceptLink(url)) continue;

  const template = pageTemplate(url);
  const visits = visitsPerTemplate.get(template) || 0;
  if (visits >= PER_TEMPLATE) continue;
  visitsPerTemplate.set(template, visits + 1);

  currentPage = template;
  via = 'load';
  let status = null;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    status = response ? response.status() : null;
    await settle(page);
  } catch (err) {
    failures.push({ template, error: err.message.split('\n')[0].replace(url, '<url>') });
    console.warn(`! ${template}: ${err.message.split('\n')[0]}`);
    continue;
  }

  if (await onLoginPage(page)) {
    if (!HAVE_CREDENTIALS || relogins >= 2) throw new Error(`Session lost at ${template} (login form shown). Re-run with --fresh.`);
    relogins += 1;
    console.log('Session expired; logging in again.');
    await context.clearCookies();
    await login(page);
    seenUrls.delete(url);
    visitsPerTemplate.set(template, visits);
    queue.unshift(url);
    continue;
  }

  const finalTemplate = pageTemplate(page.url());
  currentPage = finalTemplate;
  const title = await page.title().catch(() => '');
  const heading = await page.locator('h1, h2, .page-title, .page-header').first().textContent({ timeout: 1000 }).catch(() => null);
  const summary = await page.evaluate(summarizeDom).catch(() => null);
  const keys = await page.evaluate(storageKeys).catch(() => null);
  if (keys) {
    storage = {
      localStorage: [...new Set([...storage.localStorage, ...keys.localStorage])],
      sessionStorage: [...new Set([...storage.sessionStorage, ...keys.sessionStorage])],
    };
  }
  const screenshot = `screens/${String(pages.length).padStart(3, '0')}.png`;
  await page.screenshot({ path: path.join(OUTPUT, screenshot), fullPage: true }).catch(() => {});
  const links = await collectLinks(page);
  const { discovered, clicks } = await explore(page);
  pages.push({ url, template: finalTemplate, requested: template, status, title, heading: heading?.replace(/\s+/g, ' ').trim() || null, screenshot, summary, clicks });
  if (status && status >= 400) failures.push({ template: finalTemplate, error: `HTTP ${status}` });
  console.log(`[${pages.length}] ${finalTemplate}  (${status ?? '?'}, ${clicks} clicks)`);

  for (const link of [...links, ...discovered, ...popupUrls.splice(0).map(acceptLink).filter(Boolean)]) {
    if (!seenUrls.has(link)) queue.push(link);
  }
}

const cookies = (await context.cookies())
  .filter((c) => isMaidCentralHost(c.domain.replace(/^\./, ''), PORTAL.hostname))
  .map((c) => ({ name: c.name, domain: templateHost(c.domain.replace(/^\./, '')), path: c.path, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite, session: c.expires === -1 }));
fs.writeFileSync(path.join(OUTPUT, 'pages.json'), JSON.stringify(pages, null, 2));
fs.writeFileSync(path.join(OUTPUT, 'session.json'), JSON.stringify({ cookies, storage }, null, 2));
fs.writeFileSync(path.join(OUTPUT, 'failures.json'), JSON.stringify({ failures, skipped: [...skipped].sort(), queueLeft: queue.length }, null, 2));
await context.storageState({ path: AUTH_STATE });
await browser.close();

const result = buildCatalog({ output: OUTPUT, docs: path.resolve(args.docs) });
console.log(`\nVisited ${pages.length} pages (${failures.length} failed, ${skipped.size} unsafe links skipped${queue.length ? `, ${queue.length} left in queue: raise --max-pages` : ''}).`);
console.log(`Catalog: ${result.endpointCount} endpoints -> docs/api-catalog.json, docs/API.md  |  Raw data + screenshots: capture/output/`);
