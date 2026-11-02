// Calls the official MaidCentral API with the API user, GET only.
//
//   npm run probe -- /api/SomeList /api/Other?take=1          # production (api.maidcentral.com)
//   npm run probe -- --sandbox /api/SomeList                  # sandbox (api.maidcentral.net)
//
// Prints status and response SHAPE (types only) for each path. Never prints the token
// or any values. Full responses go to capture/output/official-probe.jsonl (gitignored),
// which npm run catalog turns into shapes for docs/API.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { shapeOf } from './catalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sandbox: { type: 'boolean', default: false },
    output: { type: 'string', default: path.join(HERE, 'output') },
    // Print only the top level of each shape.
    brief: { type: 'boolean', default: false },
  },
});

const env = args.sandbox ? 'sandbox' : 'production';
// MC_API_BASE overrides the address (used by the tests' local fake API).
const BASE = process.env.MC_API_BASE || (args.sandbox ? 'https://api.maidcentral.net' : 'https://api.maidcentral.com');
const USER = args.sandbox ? process.env.MC_SANDBOX_API_USERNAME : process.env.MC_API_USERNAME;
const PASS = args.sandbox ? process.env.MC_SANDBOX_API_PASSWORD : process.env.MC_API_PASSWORD;
const prefix = args.sandbox ? 'MC_SANDBOX_API' : 'MC_API';

if (!USER || !PASS) {
  console.error(`Set ${prefix}_USERNAME and ${prefix}_PASSWORD.`);
  process.exit(2);
}
for (const p of positionals) {
  if (!p.startsWith('/') || p.startsWith('//')) {
    console.error(`Paths must start with a single "/": ${p}`);
    process.exit(2);
  }
}

fs.mkdirSync(args.output, { recursive: true });
const outFile = path.join(args.output, 'official-probe.jsonl');

// Token: OAuth-style password grant, form-encoded.
const tokenRes = await fetch(`${BASE}/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: new URLSearchParams({ grant_type: 'password', username: USER, password: PASS }),
});
const tokenBody = await tokenRes.json().catch(() => null);
console.log(`POST /token (${env}) -> ${tokenRes.status}`);
console.log(`  shape: ${JSON.stringify(shapeOf(tokenBody))}`);
fs.appendFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), env, method: 'POST', path: '/token', status: tokenRes.status, responseBody: tokenBody && Object.fromEntries(Object.keys(tokenBody).map((k) => [k, typeof tokenBody[k]])) }) + '\n');
const token = tokenBody?.access_token;
if (!tokenRes.ok || !token) {
  console.error('No access_token. Check the API user credentials (and that the user is enabled in MaidCentral).');
  process.exit(1);
}
if (tokenBody.expires_in) console.log(`  token lifetime: ${Math.round(tokenBody.expires_in / 60)} minutes${tokenBody.refresh_token ? ', refresh token issued' : ''}`);

for (const p of positionals) {
  const res = await fetch(BASE + p, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  const type = res.headers.get('content-type') || '';
  let body = null;
  try {
    body = type.includes('json') ? await res.json() : (await res.text()).slice(0, 2000);
  } catch {}
  const pathOnly = p.split('?')[0];
  fs.appendFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), env, method: 'GET', path: pathOnly, query: p.includes('?') ? p.slice(p.indexOf('?') + 1) : '', status: res.status, contentType: type, responseBody: body }) + '\n');
  let shape = shapeOf(body);
  if (args.brief && shape && typeof shape === 'object') shape = Array.isArray(shape) ? ['…'] : Object.keys(shape);
  console.log(`GET ${pathOnly} -> ${res.status} ${type.split(';')[0]}`);
  console.log(`  shape: ${JSON.stringify(shape)}`);
}
