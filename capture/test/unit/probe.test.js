// The probe talks to the real API with the shared API user. It must never print the
// token or any response values, and must only send GETs after /token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CAPTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKEN = 'secret-token-abc123secret-token-abc123';

test('probe prints shapes only and never the token', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/token') return res.end(JSON.stringify({ access_token: TOKEN, token_type: 'bearer', expires_in: 86399 }));
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(401).end('{}');
      res.end(JSON.stringify([{ ClientId: 7, Name: 'Jane Doe', Email: 'jane@gmail.com' }]));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-probe-'));
  try {
    const { status, stdout, stderr } = await new Promise((resolve) => {
      const child = spawn(process.execPath, ['probe.js', '--output', dir, '/api/Clients?take=1'], {
        cwd: CAPTURE,
        env: { ...process.env, MC_API_BASE: `http://127.0.0.1:${server.address().port}`, MC_API_USERNAME: 'apiuser', MC_API_PASSWORD: 'apipass' },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('close', (code) => resolve({ status: code, stdout, stderr }));
    });
    assert.equal(status, 0, stderr);
    const printed = stdout + stderr;
    for (const secret of [TOKEN, 'apipass', 'Jane', 'gmail']) assert.ok(!printed.includes(secret), `printed ${secret}`);
    assert.match(stdout, /GET \/api\/Clients -> 200/);
    assert.match(stdout, /"Email":"string"/);
    assert.deepEqual(seen.map((r) => r.method), ['POST', 'GET']);
    assert.equal(new URLSearchParams(seen[0].body).get('grant_type'), 'password');
    // The raw file keeps responses (gitignored) but not the token.
    assert.ok(!fs.readFileSync(path.join(dir, 'official-probe.jsonl'), 'utf8').includes(TOKEN));
  } finally {
    server.close();
  }
});
