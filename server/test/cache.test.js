// One switch clears every kept copy for a person; nothing else is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perSession, keyed, forget, FRESH } from '../src/cache.js';
import { dayData } from '../src/planner.js';
import { boardRows } from '../src/prices.js';

test('forget clears every store for that person only', () => {
  const a = perSession();
  const b = perSession();
  const me = {};
  const other = {};
  a.set(me, 1);
  b.set(me, 2);
  a.set(other, 3);
  forget(me);
  assert.equal(a.has(me), false);
  assert.equal(b.has(me), false);
  assert.equal(a.get(other), 3);
});

test('schedule data is never kept long', () => {
  assert.ok(FRESH.schedule <= 2 * 60_000);
  assert.ok(FRESH.fourWeeksMax <= 10 * 60_000);
  assert.ok(FRESH.report <= 2 * 60_000);
});

test('keyed: one read in flight per key, kept for its ttl, cleared by forget', async () => {
  const cached = keyed();
  const me = {};
  let reads = 0;
  const slow = () => new Promise((ok) => setTimeout(() => ok(++reads), 10));
  const [a, b] = await Promise.all([cached(me, 'x', 1000, slow), cached(me, 'x', 1000, slow)]);
  assert.deepEqual([a, b, reads], [1, 1, 1], 'two callers at once share one read');
  assert.equal(await cached(me, 'x', 1000, slow), 1, 'kept');
  assert.equal(await cached(me, 'x', 0, slow), 2, 'expired: read again');
  forget(me);
  assert.equal(await cached(me, 'x', 1000, slow), 3);
  // A failed read isn't kept, and the next caller tries again.
  await assert.rejects(cached(me, 'y', 1000, async () => { throw new Error('down'); }), /down/);
  assert.equal(await cached(me, 'y', 1000, async () => 'ok'), 'ok');
});

test('a day: cleaners\' names are read once and shared; a missing team name comes from another day', async () => {
  const calls = {};
  const mc = {
    async getHtml() { return '<ul></ul>'; },
    async getJson(path, q) {
      calls[path] = (calls[path] || 0) + 1;
      const day2 = q.date === '11/11/2026';
      if (path === '/Job/ReadJobs') return [{ JobInformationId: 1, TeamID: 7, Title: 'A Home - A', Start: '/Date(1794304800000)/', End: '/Date(1794312000000)/' }];
      if (path === '/Job/TeamMonitorTeams') return day2 ? [] : [{ TeamID: 7, TeamName: 'Yellow', Color: '#ff0' }];
      if (path === '/Schedule/Read') return [{ EmployeeID: day2 ? 2 : 1, TeamID: 7, Start: '/Date(1794297600000)/', End: '/Date(1794330000000)/' }];
      if (path === '/Schedule/ReadEmployees') return day2 ? [{ EmployeeID: 1, text: 'Ann' }, { EmployeeID: 2, text: 'Bo' }] : [{ EmployeeID: 1, text: 'Ann' }];
      return [];
    },
  };
  const d = (iso) => Date.parse(`${iso}T00:00:00Z`);
  const [one, same] = await Promise.all([dayData(mc, d('2026-11-10')), dayData(mc, d('2026-11-10'))]);
  assert.equal(calls['/Job/ReadJobs'], 1, 'the same day asked twice at once is read once');
  assert.equal(calls['/Schedule/ReadEmployees'], 1);
  assert.equal(one.employees.length, 1);
  assert.equal(same.jobs, one.jobs);
  // Another day with only known cleaners: no new read of the list.
  await dayData(mc, d('2026-11-12'));
  assert.equal(calls['/Schedule/ReadEmployees'], 1);
  // A day with someone new: that day's list is read, once.
  const two = await dayData(mc, d('2026-11-11'));
  assert.equal(calls['/Schedule/ReadEmployees'], 2);
  assert.ok(two.employees.some((e) => e.text === 'Bo'));
  // MaidCentral left Yellow off that day's team list: its name is known from another day.
  assert.equal(two.known.get(7).TeamName, 'Yellow');
});

test('Dispatch Board: read as calendar weeks, each kept on its own and shared', async () => {
  process.env.TODAY = '2026-11-12';
  try {
    const asked = [];
    const HEAD = ['Job ID', 'Customer', 'Phone', 'Freq.', 'Scheduled', 'Team', 'Alwd. Hours', 'Bill Rate', 'Status'];
    const mc = {
      async postFormHtml(path, f) {
        asked.push(`${f.StartDate}-${f.EndDate}`);
        const [m, dd, y] = f.StartDate.split('/');
        // One booking on each week's Monday, and one stray row from another week.
        const row = (id, when) => `<tr>${[id, `Cust ${id}`, '555', 'Single', `${when} 9:00 AM - 11:00 AM`, 'Blue', '4.00', '$200.00', 'Pending'].map((x) => `<td>${x}</td>`).join('')}</tr>`;
        return `<table><thead><tr>${HEAD.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${row(`${y}${m}${dd}`, f.StartDate)}${row('stray', '1/5/2026')}</tbody></table>`;
      },
    };
    const r = await boardRows(mc, '2026-11-11', '2026-11-24');
    assert.deepEqual(asked.sort(), ['11/09/2026-11/15/2026', '11/16/2026-11/22/2026', '11/23/2026-11/29/2026'], 'whole weeks, Monday to Sunday');
    assert.deepEqual(r.rows.map((x) => x.date), ['2026-11-16', '2026-11-23'], 'only rows inside the range asked for (11/9 is before it; the stray row is dropped)');
    // A wider range re-reads nothing it already has.
    await boardRows(mc, '2026-11-09', '2026-12-06');
    assert.equal(asked.length, 4);
    // "fresh" reads again.
    await boardRows(mc, '2026-11-09', '2026-11-15', { fresh: true });
    assert.equal(asked.length, 5);
  } finally {
    delete process.env.TODAY;
  }
});
