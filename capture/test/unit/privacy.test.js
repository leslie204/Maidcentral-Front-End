// Fails if the COMMITTED catalog (docs/API.md, docs/api-catalog.json) contains anything
// that looks like personal data or a secret. This repo is public.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPersonalData, auditCatalog, auditText } from '../../privacy.js';

const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs');

test('committed api-catalog.json has no personal data', (t) => {
  const file = path.join(DOCS, 'api-catalog.json');
  if (!fs.existsSync(file)) return t.skip('no catalog yet');
  assert.deepEqual(auditCatalog(JSON.parse(fs.readFileSync(file, 'utf8'))), []);
});

test('committed API.md and WRITE_API.md have no personal data', (t) => {
  let checked = 0;
  for (const name of ['API.md', 'WRITE_API.md']) {
    const file = path.join(DOCS, name);
    if (!fs.existsSync(file)) continue;
    checked += 1;
    // WRITE_API.md may show the throwaway test record (example.com, 555 numbers).
    const text = fs.readFileSync(file, 'utf8').replace(/[\w.+-]+@example\.com/g, '').replace(/\b\d{3}-555-\d{4}\b/g, '');
    assert.deepEqual(auditText(text, name), []);
  }
  if (!checked) t.skip('no docs yet');
});

test('detector catches each kind of personal data', () => {
  const cases = {
    'email address': 'reach jane.doe@gmail.com',
    'phone number': 'call (613) 555-0199',
    'postal code': 'K1N 1H7',
    'zip+4 code': '90210-1234',
    'street address': '12 Elm Street',
    'money amount': 'rate $22.50',
    'card number': '4111 1111 1111 1111',
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc',
    'secret-looking string': 'CfDJ8Abc123xyz456defGHI789jklMNO012pqrSTU345vwx',
  };
  for (const [kind, text] of Object.entries(cases)) assert.ok(findPersonalData(text).includes(kind), `${kind}: ${text}`);
});

test('detector leaves catalog vocabulary alone', () => {
  for (const text of [
    'GET {tenant}.maidcentral.com/Scheduling/GetScheduleViewDataForEmployeesAndTeams/:id',
    'Status: 200, 302 · Auth: Bearer · Seen 14×',
    'Generated 2026-11-02T15:14:27.471Z by `npm run catalog`',
    '`take` (25, 50); `date` (:date)',
  ]) {
    assert.deepEqual(findPersonalData(text), [], text);
  }
});

test('catalog audit rejects values in shapes and unsafe query examples', () => {
  const problems = auditCatalog({
    portal: { endpoints: [{ responseShape: { Name: 'Jane Doe', Id: 'number' }, query: { sort: ['asc'], who: ['Smith'] } }] },
  });
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p) => !p.includes('Jane') && !p.includes('Smith')), 'findings must not repeat the value');
});
