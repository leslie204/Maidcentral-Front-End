// Price check: rates worked out from price and allowed hours, per customer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoard, audit, kindOf } from '../src/prices.js';

const HEAD = ['Job ID', 'Customer', 'Billing Terms', 'Phone', 'Address', 'Freq.', 'Scheduled', 'Team', 'Act. Start', 'Act. End', 'Act. Hrs', 'Alwd. Hours', 'Alwd. - Act. Hrs.', 'Norm. Alwd. Hrs.', 'Norm. Alwd. - Act. Hrs.', 'Team Size', 'Billing Type', 'Bill Rate', 'Bill Rate/Act. Hours', 'Status', 'Scorecard'];
const row = (id, who, freq, when, hrs, price, extra = {}) => {
  const v = { 'Job ID': id, Customer: who, Address: `${who} St`, 'Freq.': freq, Scheduled: when, Team: 'Blue', 'Alwd. Hours': hrs, 'Team Size': '2', 'Billing Type': 'Fixed', 'Bill Rate': price, Status: 'Pending', ...extra };
  return `<tr>${HEAD.map((h) => `<td>${v[h] ?? ''}</td>`).join('')}</tr>`;
};
const html = `<table><thead><tr>${HEAD.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
${row(1, 'Doug Jones', 'Every Two Weeks', '11/4/2026 8:45 AM - 11:15 AM', '5.00', '$305.00')}
${row(2, 'Doug Jones', 'Every Two Weeks', '11/18/2026 8:45 AM - 11:15 AM', '5.00', '$305.00')}
${row(3, 'Amanda Moore', 'Every Four Weeks', '11/4/2026 9:50 AM - 11:20 AM', '3.00', '$172.50')}
${row(4, 'Aunja Fiala', 'Every Four Weeks', '11/4/2026 1:00 PM - 2:30 PM', '3.00', '$183.00')}
${row(5, 'Aunja Fiala', 'Every Four Weeks', '12/2/2026 1:00 PM - 2:30 PM', '3.00', '$172.50')}
${row(6, 'Kaylie Dilly', 'Single', '11/6/2026 9:00 AM - 10:00 AM', '2.00', '$130.00')}
${row(7, 'Rex One', 'Single', '11/6/2026 11:00 AM - 1:00 PM', '4.00', '$230.00')}
${row(8, 'Free Clean', 'Every Week', '11/7/2026 9:00 AM - 10:00 AM', '2.00', '$0.00')}
${row(9, 'Gone', 'Every Week', '11/7/2026 9:00 AM - 10:00 AM', '2.00', '$100.00', { Status: 'Cancelled' })}
${row(10, 'Linda Bonuccelli', 'Every Two Weeks', '11/5/2026 9:00 AM - 10:30 AM', '3.00', '$172.50', { Status: 'Skipped' })}
${row(11, 'Doug Jones', 'Every Two Weeks', '11/11/2026 8:45 AM - 11:15 AM', '5.00', '$287.50', { Status: 'Moved' })}
${row(12, 'Done Today', 'Every Week', '11/4/2026 8:00 AM - 9:00 AM', '2.00', '$122.00', { Status: 'Completed' })}
</tbody></table>`;

test('Dispatch Board rows become bookings', () => {
  const b = parseBoard(html);
  assert.equal(b.length, 12);
  assert.deepEqual([b[0].date, b[0].time, b[0].allowedHours, b[0].price], ['2026-11-04', '8:45 AM', 5, 305]);
  assert.equal(kindOf('Every Two Weeks'), 'recurring');
  assert.equal(kindOf('Single'), 'one-time');
  assert.equal(kindOf('On Demand'), 'one-time');
});

test('rate = price ÷ (allowed hours ÷ 2), checked per customer', () => {
  const r = audit(parseBoard(html), { recurring: 122, oneTime: 130 });
  const by = (name) => r.customers.find((c) => c.customer === name);
  assert.equal(by('Doug Jones').state, 'ok');
  assert.equal(by('Doug Jones').rate, 122);
  assert.equal(by('Doug Jones').bookings.length, 2);
  // Still at the old $115: should be $183.
  assert.deepEqual([by('Amanda Moore').state, by('Amanda Moore').rate, by('Amanda Moore').should], ['low', 115, 183]);
  // Next booking right, a later one wrong: the row shows the wrong one.
  const f = by('Aunja Fiala');
  assert.deepEqual([f.state, f.wrong, f.price, f.firstWrong.date], ['low', 1, 172.5, '2026-12-02']);
  // One-time at $130/hr: 2 allowed hours = 1 team hour = $130.
  assert.equal(by('Kaylie Dilly').state, 'ok');
  assert.deepEqual([by('Rex One').state, by('Rex One').rate, by('Rex One').should], ['low', 115, 260]);
  assert.equal(by('Free Clean').state, 'no-price');
  assert.ok(!by('Gone'), 'cancelled bookings are left out');
  assert.ok(!by('Linda Bonuccelli'), 'skipped visits are left out');
  assert.equal(by('Doug Jones').bookings.length, 2, 'the old copy of a moved booking is left out');
  assert.equal(by('Done Today').state, 'ok', 'completed visits count');
  assert.deepEqual(r.summary.leftOut, { Cancelled: 1, Skipped: 1, Moved: 1 });
  assert.equal(r.summary.bookings, 9);
  assert.equal(r.summary.customersToFix, 4);
  assert.equal(r.summary.missingRevenue, 10.5 + 10.5 + 30);
  assert.equal(r.customers[0].state, 'low', 'the ones to fix come first');
  // Tolerance: $115 is within $10 of $122.
  assert.equal(audit(parseBoard(html), { recurring: 122, oneTime: 130, tolerance: 10 }).customers.find((c) => c.customer === 'Amanda Moore').state, 'ok');
});

test('only real visits and active homes count elsewhere too', async () => {
  const { isVisit } = await import('../src/prices.js');
  const { active } = await import('../src/territory.js');
  assert.deepEqual(['Pending', 'In Progress', 'Completed', 'Skipped', 'Moved', 'Cancelled', 'Canceled'].map(isVisit), [true, true, true, false, false, false, false]);
  assert.deepEqual(active([{ home: 'A', paused: false }, { home: 'B', paused: true }]).map((h) => h.home), ['A']);
});
