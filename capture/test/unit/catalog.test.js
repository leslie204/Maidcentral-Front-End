import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shapeOf, mergeShapes, shapeKey, bodyShape, genericHeading, buildCatalog } from '../../catalog.js';
import { extractRoutes } from '../../bundle-routes.js';

test('shapes strip values and merge across samples', () => {
  const a = shapeOf([{ id: 1, name: 'Jo', team: null }, { id: 2, name: 'Al', team: { id: 3 } }]);
  assert.deepEqual(a, [{ id: 'number', name: 'string', team: 'null|object' }]);
  assert.deepEqual(mergeShapes({ a: 'string' }, { b: 'number' }), { a: 'string', b: 'number' });
});

test('dictionary keys that are data collapse to placeholders', () => {
  assert.equal(shapeKey('12345'), ':id');
  assert.equal(shapeKey('2026-11-02'), ':date');
  assert.equal(shapeKey('Jane Doe'), '<key>');
  assert.equal(shapeKey('jane@example.com'), '<key>');
  assert.equal(shapeKey('ClientId'), 'ClientId');
  assert.deepEqual(shapeOf({ 'Jane Doe': 1, 'John Roe': 2, 101: { x: 'y' } }), { '<key>': 'number', ':id': { x: 'string' } });
});

test('form posts keep field names only', () => {
  assert.deepEqual(bodyShape('__RequestVerificationToken=abc&Client.FirstName=Jane&Jobs%5B3%5D.Id=7'), {
    __RequestVerificationToken: 'string',
    'Client.FirstName': 'string',
    'Jobs[:id].Id': 'string',
  });
  assert.deepEqual(bodyShape('{"note":"call Jane","jobId":5}'), { note: 'string', jobId: 'number' });
});

test('headings keep no names or counts', () => {
  assert.equal(genericHeading('Client: Jane Doe'), 'Client');
  assert.equal(genericHeading('Clients / Jane Doe'), 'Clients');
  assert.equal(genericHeading('Jobs (120)'), 'Jobs');
  assert.equal(genericHeading('Employee - Jane Doe'), 'Employee');
});

test('bundle route extraction finds SPA, MVC and API paths', () => {
  const src = `const r=[{path:'clients/:id',component:A},{path:"**"}];$routeProvider.when('/jobs',{});x("/Schedule/Index");fetch('/api/clients/'+id);`;
  const r = extractRoutes(src);
  assert.deepEqual(r.pages, ['/Schedule/Index', '/clients/:id', '/jobs']);
  assert.deepEqual(r.api, ['/api/clients/:id']);
});

// End-to-end through the generator: raw capture full of personal data in, nothing personal out.
test('catalog built from raw captures contains no personal data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-catalog-'));
  const out = path.join(dir, 'output');
  const docs = path.join(dir, 'docs');
  fs.mkdirSync(out);
  const T = 'https://acme.maidcentral.com';
  const lines = [
    { phase: 'login', page: '(login)', method: 'POST', url: `${T}/Account/Login`, resourceType: 'document', status: 302 },
    {
      phase: 'crawl', page: '/Clients/Details/:id', method: 'GET', url: `${T}/api/clients/4411?search=Jane%20Doe&take=25&sort=asc`, resourceType: 'xhr', status: 200,
      responseKind: 'json',
      responseBody: { ClientId: 4411, Name: 'Jane Doe', Email: 'jane.doe@gmail.com', Phone: '(613) 555-0199', Address: '12 Elm Street', PostalCode: 'K1N 1H7', PayRate: '$22.50', Notes: 'Gate code 4471', Homes: { 'Jane Doe Cottage': { Id: 2 } } },
    },
    {
      phase: 'crawl', page: '/Clients/Details/:id', method: 'POST', url: `${T}/Client/AddNote`, resourceType: 'xhr', blocked: 'write',
      requestHeaders: { 'content-type': 'application/x-www-form-urlencoded' }, requestBody: 'ClientId=4411&Note=Jane%20prefers%20mornings&__RequestVerificationToken=CfDJ8Abc123xyz456defGHI789jklMNO012pqrSTU345vwx',
    },
    {
      phase: 'crawl', page: '/Schedule', method: 'GET', url: `${T}/Schedule/Partial?date=2026-11-02`, resourceType: 'xhr', status: 200, responseKind: 'html',
      htmlSummary: { forms: [{ method: 'post', action: '/Job/Move/77', fields: [{ name: 'Jobs[3].EmployeeId', type: 'hidden' }] }], tables: [{ columns: 3, headers: ['Jane Doe', 'John Roe', 'Ali Khan'] }] },
    },
  ];
  fs.writeFileSync(path.join(out, 'requests.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n'));
  fs.writeFileSync(path.join(out, 'pages.json'), JSON.stringify([
    { template: '/Clients/Details/:id', heading: 'Jane Doe', status: 200, summary: { forms: [], tables: [{ columns: 2, headers: ['Jane Doe', 'x'] }], framework: { jquery: '3.6.0' } } },
    { template: '/Schedule', heading: 'Schedule', status: 200, summary: { forms: [], tables: [], antiForgeryField: true, framework: {} } },
  ]));
  fs.writeFileSync(path.join(out, 'session.json'), JSON.stringify({ cookies: [{ name: '.AspNetCore.Session', domain: '{tenant}.maidcentral.com', httpOnly: true, session: true }], storage: { localStorage: [], sessionStorage: [] } }));

  const r = buildCatalog({ output: out, docs });
  const json = fs.readFileSync(path.join(docs, 'api-catalog.json'), 'utf8');
  const md = fs.readFileSync(path.join(docs, 'API.md'), 'utf8');
  for (const leaked of ['Jane', 'John', 'Ali Khan', 'gmail', '555-0199', 'Elm', 'K1N', '22.50', '4471', '4411', 'acme', 'prefers', 'CfDJ8']) {
    assert.ok(!json.includes(leaked), `api-catalog.json leaked ${leaked}`);
    assert.ok(!md.includes(leaked), `API.md leaked ${leaked}`);
  }
  // Still useful: shapes, field names, blocked writes, heading rule, coverage.
  assert.match(json, /"Email": "string"/);
  assert.match(md, /POST \{tenant\}\.maidcentral\.com\/Client\/AddNote` \[xhr\] \(blocked during capture: write\)/);
  assert.match(md, /`Jobs\[:id\]\.EmployeeId:hidden`/);
  assert.match(md, /`\/Schedule` — Schedule/);
  assert.match(md, /`\/Clients\/Details\/:id`\n/);
  assert.equal(r.coverage.find((c) => c.capability === 'clients').status, 'portal only');
});

test('the generator refuses to write a catalog that fails the audit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-catalog-'));
  const out = path.join(dir, 'output');
  fs.mkdirSync(out);
  // A path segment that is an email address would survive templating.
  fs.writeFileSync(path.join(out, 'requests.jsonl'), JSON.stringify({ phase: 'crawl', page: '/x', method: 'GET', url: 'https://acme.maidcentral.com/lookup/jane@gmail.com', resourceType: 'xhr', status: 200 }));
  assert.throws(() => buildCatalog({ output: out, docs: path.join(dir, 'docs') }), /Catalog not written/);
  assert.ok(!fs.existsSync(path.join(dir, 'docs', 'API.md')));
});
