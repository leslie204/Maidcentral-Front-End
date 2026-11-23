import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideRequest, isSkippedLink, isUnsafeClick, isUnsafeUrl } from '../../safety.js';

const portalHost = 'acme.maidcentral.com';
const decide = (method, url, extra = {}) => decideRequest({ method, url, phase: 'crawl', allowWrites: false, portalHost, ...extra }).action;

test('after login every write is blocked, wherever it goes', () => {
  assert.equal(decide('POST', 'https://acme.maidcentral.com/Job/Save'), 'block');
  assert.equal(decide('PUT', 'https://api.maidcentral.com/api/clients/1'), 'block');
  assert.equal(decide('DELETE', 'https://acme.maidcentral.com/api/notes/1'), 'block');
  assert.equal(decide('POST', 'https://www.google-analytics.com/collect'), 'block');
  assert.equal(decide('GET', 'https://acme.maidcentral.com/Client/Details/1'), 'continue');
  assert.equal(decide('OPTIONS', 'https://api.maidcentral.com/api/clients'), 'continue');
});

test('login traffic is allowed; --allow-writes turns blocking off', () => {
  assert.equal(decide('POST', 'https://acme.maidcentral.com/Account/Login', { phase: 'login', resourceType: 'document' }), 'continue');
  assert.equal(decide('POST', 'https://acme.maidcentral.com/api/auth/signin', { phase: 'login', resourceType: 'xhr' }), 'continue');
  assert.equal(decide('POST', 'https://acme.maidcentral.com/Account/VerifyCode', { phase: 'login', resourceType: 'fetch' }), 'continue');
  // The page reached right after login may fire writes of its own: still blocked.
  assert.equal(decide('POST', 'https://acme.maidcentral.com/api/activity/seen', { phase: 'login', resourceType: 'fetch' }), 'block');
  assert.equal(decide('POST', 'https://acme.maidcentral.com/Job/Save', { allowWrites: true }), 'continue');
});

test('GETs to MaidCentral that name an action are blocked', () => {
  for (const path of ['/Job/Cancel?id=5', '/Client/Delete/9', '/Account/LogOff', '/Invoice/Send/3', '/Payroll/Process', '/Card/Charge?amount=1', '/Clients/Export', '/Employee/Impersonate/2']) {
    assert.equal(decide('GET', `https://acme.maidcentral.com${path}`), 'block', path);
  }
  // Lists and lookups whose names merely contain those words are fine.
  for (const path of ['/Jobs/Cancelled', '/Lookups/CancellationReasons', '/Clients/Deleted', '/Reports/Charges']) {
    assert.equal(decide('GET', `https://acme.maidcentral.com${path}`), 'continue', path);
  }
  // Third-party GETs aren't judged by their wording.
  assert.equal(decide('GET', 'https://maps.googleapis.com/maps/api/js?callback=removeMarkers'), 'continue');
});

test('links into payroll and file downloads are never followed', () => {
  assert.ok(isSkippedLink('https://acme.maidcentral.com/Payroll/Index'));
  assert.ok(isSkippedLink('https://acme.maidcentral.com/Reports/Jobs.csv'));
  assert.ok(isUnsafeUrl('https://acme.maidcentral.com/x#/jobs/5/cancel'));
  assert.ok(!isSkippedLink('https://acme.maidcentral.com/Clients'));
});

test('buttons that save, send, charge or delete are never clicked', () => {
  for (const d of ['Save | btn btn-primary', 'Send Reminder | ', 'Charge Card | ', 'Delete | ', 'x | onclick deleteJob(5)', 'Log Out | ', 'Cancel Job | ', 'Email Client | ', 'Clock In | ']) {
    assert.ok(isUnsafeClick(d), d);
  }
  for (const d of ['Notes | role tab', '+ New Client | data-toggle modal', 'Edit | btn', 'Week | view-week']) {
    assert.ok(!isUnsafeClick(d), d);
  }
});

test('POSTs that only read are let through; everything else that writes stays blocked', async () => {
  const { parseReadPosts } = await import('../../safety.js');
  const readPosts = parseReadPosts('# comment\n/Job/MonthlyData\n/Schedule/AbsentEmployees/  # trailing slash\n');
  const post = (url, resourceType = 'xhr') => decideRequest({ method: 'POST', url, resourceType, phase: 'crawl', allowWrites: false, portalHost, readPosts }).action;
  // Query-named actions and reviewed paths (case and trailing slash ignored).
  assert.equal(post('https://acme.maidcentral.com/Estimate/GetPipelineData'), 'continue');
  assert.equal(post('https://acme.maidcentral.com/report/getTimeChangeRequests?skipCount=0'), 'continue');
  assert.equal(post('https://acme.maidcentral.com/Customer/SearchCustomers', 'fetch'), 'continue');
  assert.equal(post('https://acme.maidcentral.com/job/monthlydata'), 'continue');
  assert.equal(post('https://acme.maidcentral.com/Schedule/AbsentEmployees/'), 'continue');
  // Still blocked: actions, look-alikes, form posts, other hosts, PUT/DELETE.
  for (const url of [
    'https://acme.maidcentral.com/Company/BroadcastMessage',
    'https://acme.maidcentral.com/Event/CreateOrEditEvent',
    'https://acme.maidcentral.com/Estimate/Step1',
    'https://acme.maidcentral.com/Job/GetAndSendReminders',
    'https://acme.maidcentral.com/Job/GetDeleteList',
    'https://acme.maidcentral.com/Job/JobResendNotificationFlags/',
    'https://acme.maidcentral.com/Payroll/GetPayrollRun',
    'https://acme.maidcentral.com/Job/Getaway',
    'https://acme.maidcentral.com/Job/Gettysburg',
    'https://evil.example.com/Job/GetJobs',
  ]) assert.equal(post(url), 'block', url);
  assert.equal(post('https://acme.maidcentral.com/Job/GetJobs', 'document'), 'block');
  assert.equal(decideRequest({ method: 'DELETE', url: 'https://acme.maidcentral.com/Job/GetJobs', resourceType: 'xhr', phase: 'crawl', allowWrites: false, portalHost, readPosts }).action, 'block');
});

test('static assets are never blocked as unsafe GETs', () => {
  assert.equal(decide('GET', 'https://acme.maidcentral.com/img/remove-icon-small.png'), 'continue');
  assert.equal(decide('GET', 'https://acme.maidcentral.com/img/syncfusion-icons.png'), 'continue');
  assert.equal(decide('GET', 'https://acme.maidcentral.com/plugins/tinymce/plugins/importcss/plugin.min.js'), 'continue');
  assert.equal(decide('GET', 'https://acme.maidcentral.com/Reports/Export.csv'), 'block');
  assert.equal(decide('GET', 'https://acme.maidcentral.com/Job/Delete/5'), 'block');
});
