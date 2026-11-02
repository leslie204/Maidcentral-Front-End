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
import { startFakePortal } from './fake-portal.js';

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

    // 1. Read-only: the only write the portal received is the login.
    const writes = portal.log.filter((r) => r.method !== 'GET');
    assert.deepEqual(writes.map((r) => `${r.method} ${r.path}`), ['POST /Account/Login']);
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
    assert.match(md, /Anti-forgery \/ CSRF headers: `requestverificationtoken`/);
    assert.match(md, /`Jobs\[:id\]\.TeamId:text`/);
    assert.match(md, /Cookies \(names only\): `session` httpOnly session/);
    assert.match(md, /Login requests: `GET 127\.0\.0\.1:\d+\/Account\/Login`, `POST 127\.0\.0\.1:\d+\/Account\/Login`\n/);
  } finally {
    portal.close();
  }
});

function runNode(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 220_000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}
