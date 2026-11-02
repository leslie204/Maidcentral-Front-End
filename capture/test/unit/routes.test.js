import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTemplate, endpointTemplate, templateHost, templateFieldName, redact } from '../../routes.js';

test('paths collapse ids, GUIDs, dates and opaque tokens', () => {
  assert.equal(endpointTemplate('https://acme.maidcentral.com/Client/Details/12345'), '{tenant}.maidcentral.com/Client/Details/:id');
  assert.equal(endpointTemplate('https://api.maidcentral.com/api/jobs/3f2b8c1e-1d2a-4b5c-9e8f-0123456789ab'), 'api.maidcentral.com/api/jobs/:id');
  assert.equal(endpointTemplate('https://acme.maidcentral.com/Schedule/2026-11-02'), '{tenant}.maidcentral.com/Schedule/:date');
  assert.equal(endpointTemplate('https://acme.maidcentral.com/r/aB3dE5gH7jK9mN1pQ3sT5vW7'), '{tenant}.maidcentral.com/r/:token');
});

test('page templates keep query keys but not their free-text values', () => {
  assert.equal(pageTemplate('https://acme.maidcentral.com/Clients?search=Jane%20Doe&page=2&tab=notes'), '/Clients?page=:id&search=*&tab=notes');
  assert.equal(pageTemplate('https://acme.maidcentral.com/Job/Edit?jobId=991&date=11/02/2026'), '/Job/Edit?date=:date&jobId=:id');
  // A capitalized word for an unknown key could be a name: dropped.
  assert.equal(pageTemplate('https://acme.maidcentral.com/x?c=Smith'), '/x?c=*');
});

test('SPA hash routes are part of the page identity', () => {
  assert.equal(pageTemplate('https://acme.maidcentral.com/app#/clients/55/jobs?view=week'), '/app#/clients/:id/jobs?view=week');
});

test('the company subdomain is hidden, shared MaidCentral hosts are kept', () => {
  assert.equal(templateHost('cleanco.maidcentral.com'), '{tenant}.maidcentral.com');
  assert.equal(templateHost('api.maidcentral.com'), 'api.maidcentral.com');
  assert.equal(templateHost('maps.googleapis.com'), 'maps.googleapis.com');
});

test('form field names lose their indexes', () => {
  assert.equal(templateFieldName('Jobs[12].Employees[3].Id'), 'Jobs[:id].Employees[:id].Id');
});

test('redacts emails and phone numbers', () => {
  assert.equal(redact('Jo jo@ex.com +1 (416) 555-0100'), 'Jo <email> <phone>');
});
