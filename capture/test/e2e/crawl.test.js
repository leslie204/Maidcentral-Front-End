// Runs the real crawler (headless Chromium) against the fake portal and checks that it
// (1) finds pages, tabs, modals and partials, (2) never sends a write or an unsafe GET,
// and (3) produces a catalog with no personal data.
//   npm run test:e2e
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startFakePortal, TWO_FACTOR_CODE } from './fake-portal.js';

const CAPTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('crawler captures the portal read-only and the catalog stays clean', { timeout: 240_000 }, async () => {
  const portal = await startFakePortal();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-e2e-'));
  const seeds = path.join(dir, 'seeds.txt');
  fs.writeFileSync(seeds, '# test seeds\n/Schedule\n/Clients/Delete/101\n');
  try {
    // Async spawn: the fake portal runs in this process and must keep answering.
    const run = await runNode(
      ['crawl.js', '--output', path.join(dir, 'output'), '--docs', path.join(dir, 'docs'), '--seeds', seeds, '--auth-state', path.join(dir, 'auth.json'), '--max-pages', '30'],
      { cwd: CAPTURE, env: { ...process.env, MC_PORTAL_URL: portal.url, MC_EMAIL: 'test@example.com', MC_PASSWORD: 'pw' } },
    );
    assert.equal(run.status, 0, `crawler failed:\n${run.stdout}\n${run.stderr}`);

    // 1. Read-only: the only POSTs the portal received are the login and reads sent as
    //    POST (a query-named action and one from read-posts.txt). Each read ran once per
    //    dashboard visit; "BroadcastMessage" and "activity/seen" never arrived.
    const writes = [...new Set(portal.log.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.path}`))];
    assert.deepEqual(writes.sort(), ['POST /Account/Login', 'POST /Dashboard/GetPipelineData', 'POST /Job/MonthlyData']);
    const gets = portal.log.map((r) => r.path);
    for (const unsafe of ['/Account/LogOff', '/Clients/Delete/101', '/Jobs/Cancel?id=5', '/Payroll/Run', '/Reports/Jobs.csv']) {
      assert.ok(!gets.includes(unsafe), `crawler requested ${unsafe}`);
    }

    // 2. Coverage: pages from links, a seed, a hidden onclick link; per-template limit of 2.
    const out = path.join(dir, 'output');
    const pages = JSON.parse(fs.readFileSync(path.join(out, 'pages.json'), 'utf8'));
    const templates = pages.map((p) => p.template);
    for (const t of ['/Dashboard', '/Clients', '/Jobs', '/Jobs/Edit/:id', '/Schedule']) assert.ok(templates.includes(t), `missed ${t}`);
    assert.equal(templates.filter((t) => t === '/Clients/Details/:id').length, 2);

    const requests = fs.readFileSync(path.join(out, 'requests.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const seen = (re) => requests.some((r) => re.test(`${r.method} ${new URL(r.url).pathname}`));
    assert.ok(seen(/^GET \/api\/clients\/\d+\/notes$/), 'tab click not captured');
    assert.ok(seen(/^GET \/api\/lookups\/client-types$/), 'modal opener not captured');
    assert.ok(seen(/^GET \/api\/schedule$/), 'view button not captured');
    assert.ok(requests.some((r) => r.htmlSummary?.forms?.[0]?.action === '/Job/Reschedule/77'), 'HTML partial not summarized');
    const blocked = requests.filter((r) => r.blocked).map((r) => `${r.method} ${new URL(r.url).pathname}`);
    assert.ok(blocked.includes('POST /api/activity/seen'), 'write on page load not logged as blocked');
    assert.ok(blocked.includes('POST /Company/BroadcastMessage'), 'BroadcastMessage not blocked');
    assert.ok(requests.some((r) => r.readPost && /GetPipelineData/.test(r.url) && r.responseBody), 'read via POST not captured');
    assert.ok(!requests.some((r) => r.phase === 'login' && r.requestBody), 'login body was recorded');

    const { skipped } = JSON.parse(fs.readFileSync(path.join(out, 'failures.json'), 'utf8'));
    for (const t of ['/Account/LogOff', '/Clients/Delete/:id', '/Payroll/Run']) assert.ok(skipped.includes(t), `${t} not reported as skipped`);

    // 3. The committed artefacts carry no personal data and no record names as headings.
    const json = fs.readFileSync(path.join(dir, 'docs', 'api-catalog.json'), 'utf8');
    const md = fs.readFileSync(path.join(dir, 'docs', 'API.md'), 'utf8');
    for (const leaked of ['Jane', 'John', 'Ali', 'gmail', '555-0199', 'Elm', 'K1N', '4471']) {
      assert.ok(!json.includes(leaked) && !md.includes(leaked), `catalog leaked ${leaked}`);
    }
    assert.match(md, /POST 127\.0\.0\.1:\d+\/api\/activity\/seen` \[xhr\] \(blocked during capture: write\)/);
    assert.match(md, /`\/Clients\/Details\/:id`\n/, 'record page heading should be dropped');
    assert.match(md, /`\/Dashboard` — Dashboard/);
    assert.match(md, /POST 127\.0\.0\.1:\d+\/Job\/MonthlyData` \[xhr\] \(read via POST\)/);
    assert.match(md, /Anti-forgery \/ CSRF headers: `requestverificationtoken`/);
    assert.match(md, /`Jobs\[:id\]\.TeamId:text`/);
    assert.match(md, /Cookies \(names only\): `session` httpOnly session/);
    assert.match(md, /Login requests: `GET 127\.0\.0\.1:\d+\/Account\/Login`, `POST 127\.0\.0\.1:\d+\/Account\/Login`\n/);
  } finally {
    portal.close();
  }
});

test('headless crawl gets past 2FA with the code file and remembers the browser', { timeout: 120_000 }, async () => {
  const portal = await startFakePortal({ twoFactor: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-e2e-2fa-'));
  const codeFile = path.join(dir, '2fa-code');
  const authState = path.join(dir, 'auth.json');
  let written = false;
  try {
    const run = await runNode(
      ['crawl.js', '--output', path.join(dir, 'output'), '--docs', path.join(dir, 'docs'), '--seeds', path.join(dir, 'none.txt'), '--auth-state', authState, '--code-file', codeFile, '--max-pages', '2', '--max-clicks', '0'],
      { cwd: CAPTURE, env: { ...process.env, MC_PORTAL_URL: portal.url, MC_EMAIL: 'test@example.com', MC_PASSWORD: 'pw' } },
      // A person reads the code from their email and writes it to the file.
      (out) => {
        if (written || !out.includes('Write it to')) return;
        written = true;
        fs.writeFileSync(codeFile, `${TWO_FACTOR_CODE}\n`);
      },
    );
    assert.equal(run.status, 0, `crawler failed:\n${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /Asked MaidCentral to send a verification code/);
    const writes = portal.log.filter((r) => r.method !== 'GET' && r.path.startsWith('/Account/'));
    assert.deepEqual(writes.map((r) => `${r.method} ${r.path}`), ['POST /Account/Login', 'POST /Account/SendCode', 'POST /Account/VerifyCode']);
    assert.match(writes[2].body, /RememberBrowser=on/, '"Remember this browser" not ticked');
    assert.ok(!fs.existsSync(codeFile), 'code file not removed after use');
    const cookies = JSON.parse(fs.readFileSync(authState, 'utf8')).cookies.map((c) => c.name);
    assert.ok(cookies.includes('TwoFactorRememberBrowser') && cookies.includes('session'), `saved cookies: ${cookies}`);
  } finally {
    portal.close();
  }
});

function runNode(args, options, onStdout = () => {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
      onStdout(stdout);
    });
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 220_000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}
