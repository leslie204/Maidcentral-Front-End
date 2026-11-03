// Rescheduling on made-up days: a holiday Thursday with three bookings, and the days
// around it with room in some routes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, bookingsOf, optionsFor, planFor } from '../src/reschedule.js';

process.env.OFFICE_LEAVE_AT = '8:15 AM';
process.env.OFFICE_RETURN_BY = '4:45 PM';

const HOLIDAY = '2026-11-26'; // Thursday
const dates = ['2026-11-23', '2026-11-24', '2026-11-25', HOLIDAY, '2026-11-27', '2026-11-28', '2026-11-29'];
const N = { lat: 47.73, lng: -117.41 };
const S = { lat: 47.6, lng: -117.4 };
const OFFICE = { lat: 47.66, lng: -117.4 };
const HOMES = { Ann: N, Bo: { lat: N.lat + 0.005, lng: N.lng }, Cy: S, Di: { lat: N.lat - 0.004, lng: N.lng }, Ed: { lat: S.lat + 0.004, lng: S.lng } };
const lookup = (title) => {
  const h = HOMES[String(title).split(' ')[0]];
  return h ? { ...h, zone: h === S || title.startsWith('Ed') ? 'south' : 'north' } : null;
};
const at = (d, hm) => `${d}T${hm}:00`;
const team = (id, name, d, jobs, crew = 2) => ({
  id,
  name,
  color: '#000',
  members: Array.from({ length: crew }, (_, i) => ({ employeeId: id * 10 + i, absent: false, start: at(d, '08:00'), end: at(d, '17:00') })),
  window: crew ? { start: at(d, '08:15'), end: at(d, '16:45') } : null,
  jobs,
});
const job = (id, home, d, s, e, freq = 'Every 2 weeks') => ({ id, title: `${home} Home - X`, start: at(d, s), end: at(d, e), frequency: { short: freq } });
function ctx() {
  const analysed = dates.map((d) => {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) return { date: d, teams: [] };
    if (d === HOLIDAY) {
      return { date: d, teams: [team(1, 'Blue', d, [job(1, 'Ann', d, '09:00', '11:00'), job(2, 'Bo', d, '12:00', '14:00', 'Weekly')]), team(2, 'Red', d, [job(3, 'Cy', d, '09:00', '11:00')])] };
    }
    // Other days: Blue (north) has the afternoon free; Red (south) the morning.
    return { date: d, teams: [team(1, 'Blue', d, [job(100 + dates.indexOf(d), 'Di', d, '09:00', '11:30')]), team(2, 'Red', d, [job(200 + dates.indexOf(d), 'Ed', d, '13:00', '15:00')])] };
  });
  return build({ date: HOLIDAY, dates, analysed, lookup, names: new Map(), base: OFFICE });
}
const TODAY = '2026-11-20';

test('bookings on the date', () => {
  const b = bookingsOf(ctx());
  assert.deepEqual(b.map((x) => x.home), ['Ann Home', 'Cy Home', 'Bo Home']);
  assert.equal(b[0].cleanerMin, 240);
});

test('one booking: same team, nearby, usual time first; never on the date itself', () => {
  const r = optionsFor(ctx(), { job: '1', today: TODAY });
  assert.ok(r.slots.length > 0);
  const best = r.slots[0];
  assert.equal(best.team, 'Blue');
  assert.ok(best.sameTeam);
  assert.ok(Math.abs(best.daysAway) === 1, 'the day before or after');
  assert.ok(r.slots.every((s) => s.date !== HOLIDAY));
  assert.ok(r.slots.every((s) => s.start >= 8 * 60 + 15 && s.end <= 16 * 60 + 45));
  // Before only / after only.
  assert.ok(optionsFor(ctx(), { job: '1', today: TODAY, dir: 'before' }).slots.every((s) => s.daysAway < 0));
  assert.ok(optionsFor(ctx(), { job: '1', today: TODAY, dir: 'after' }).slots.every((s) => s.daysAway > 0));
  // Not in the past.
  assert.ok(optionsFor(ctx(), { job: '1', today: '2026-11-24' }).slots.every((s) => s.date > '2026-11-24'));
});

test('a weekly customer is not moved right next to their other visits', () => {
  const r = optionsFor(ctx(), { job: '2', today: TODAY });
  const far = r.slots.find((s) => Math.abs(s.daysAway) >= 3);
  if (far) assert.ok(far.reasons.some((x) => /days from their/.test(x.text)));
  assert.ok(Math.abs(r.slots[0].daysAway) <= 2);
});

test('the whole day: every booking placed, no two in the same slot; office picks are kept', () => {
  const p = planFor(ctx(), { today: TODAY });
  assert.equal(p.rows.length, 3);
  assert.equal(p.unplaced, 0);
  const taken = p.rows.map((r) => r.pick);
  for (let i = 0; i < taken.length; i++) {
    for (let k = i + 1; k < taken.length; k++) {
      const a = taken[i];
      const b = taken[k];
      if (a.date === b.date && a.teamId === b.teamId) assert.ok(a.end <= b.start || b.end <= a.start, 'no overlap');
    }
  }
  const fixed = planFor(ctx(), { today: TODAY, picks: JSON.stringify({ 1: { date: '2026-11-27', teamId: 2, start: 540 } }) });
  const row = fixed.rows.find((r) => r.booking.id === 1);
  assert.equal(row.pick.date, '2026-11-27');
  assert.equal(row.pick.fixed, true);
  assert.equal(row.pick.start, 540);
  assert.ok(fixed.rows.filter((r) => r.booking.id !== 1).every((r) => !(r.pick.date === '2026-11-27' && r.pick.teamId === 2 && r.pick.start < 540 + 120 && r.pick.end > 540)));
});

test('skipped visits stay listed but take no slot', () => {
  const p = planFor(ctx(), { today: TODAY, skip: '2' });
  const row = p.rows.find((r) => r.booking.id === 2);
  assert.equal(row.skipped, true);
  assert.equal(row.pick, null);
  assert.equal(p.unplaced, 0);
});
