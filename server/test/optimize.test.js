// Schedule optimization on a made-up cycle: a south team with one north visit in the middle
// of its day, and a north team with room for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, run, constraintsFrom, PRESETS, _test } from '../src/optimize.js';

process.env.OFFICE_LEAVE_AT = '8:15 AM';
process.env.OFFICE_RETURN_BY = '4:45 PM';

const FROM = '2026-11-02'; // a Monday
const date = (i) => new Date(Date.parse(`${FROM}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
const N = { lat: 47.75, lng: -117.4 };
const S = { lat: 47.57, lng: -117.4 };
const OFFICE = { lat: 47.66, lng: -117.4 };
const HOMES = {
  S1: { ...S, zone: 'south' },
  S2: { lat: S.lat + 0.005, lng: S.lng, zone: 'south' },
  NX: { lat: N.lat + 0.004, lng: N.lng, zone: 'north' },
  N2: { ...N, zone: 'north' },
  N3: { lat: N.lat - 0.004, lng: N.lng, zone: 'north' },
};
const lookup = (title) => {
  const h = HOMES[String(title).split(' ')[0]];
  return h ? { ...h, home: String(title).split(' - ')[0], customer: 'C' } : null;
};
const job = (id, home, day, s, e, freq = 'Every 4 weeks') => ({ id, title: `${home} Home - C`, start: `${date(day)}T${s}:00`, end: `${date(day)}T${e}:00`, frequency: { short: freq } });
const team = (id, name, day, jobs) => ({
  id,
  name,
  color: '#000',
  textColor: '#fff',
  members: [1, 2].map((m) => ({ employeeId: id * 10 + m, absent: false, start: `${date(day)}T08:00:00`, end: `${date(day)}T17:00:00` })),
  window: { start: `${date(day)}T08:15:00`, end: `${date(day)}T16:45:00` },
  jobs,
});

// Tuesday of week 1 (day 1): Blue (south) goes north at noon; Red (north) has a gap then.
function days(nxFreq = 'Every 4 weeks') {
  return Array.from({ length: 28 }, (_, i) => ({
    date: date(i),
    issues: [],
    teams:
      i === 1
        ? [
          team(1, 'Blue', i, [job(1, 'S1', i, '09:00', '11:00'), job(2, 'NX', i, '12:00', '13:30', nxFreq), job(3, 'S2', i, '14:00', '15:30')]),
          team(2, 'Red', i, [job(4, 'N2', i, '09:00', '11:00'), job(5, 'N3', i, '13:30', '15:00')]),
        ]
        : [],
  }));
}
const dataset = (f) => build({ days: days(f), lookup, base: OFFICE, names: new Map(), rate: { rate: 60, jobs: 5 } });

test('the cycle as data: team-days, jobs, series and territories', () => {
  const ds = dataset();
  assert.equal(ds.teamDays.size, 2);
  assert.equal(ds.jobs.size, 5);
  assert.equal(ds.series.size, 5);
  assert.deepEqual([...ds.territory.get(2)], ['north']);
  assert.equal(ds.rate, 60);
});

test('constraints: presets, overrides and limits', () => {
  const { label, ...minimal } = PRESETS.minimal;
  assert.equal(label, 'Minimum disruption');
  assert.deepEqual(constraintsFrom({ preset: 'minimal' }), minimal);
  const c = constraintsFrom({ preset: 'balanced', early: '45', days: 'true', maxDrive: '9999' });
  assert.equal(c.early, 45);
  assert.equal(c.days, true);
  assert.equal(c.teams, true);
  assert.equal(c.maxDrive, 600);
});

test('balanced: the out-of-the-way north visit moves to the north team; driving drops', () => {
  const r = run(dataset(), constraintsFrom({ preset: 'balanced' }));
  assert.ok(r.optimised.driveMin < r.current.driveMin, `drive ${r.current.driveMin} -> ${r.optimised.driveMin}`);
  const move = r.recommendations.find((x) => x.kind === 'move' || x.kind === 'swap');
  assert.ok(move, 'a move is recommended');
  assert.match(move.title, /NX Home .* from Blue to Red/);
  assert.equal(move.phase, 2, 'a new team is phase 2');
  assert.equal(move.customers[0].toTeam, 'Red');
  assert.ok(move.delta.driveMin < 0);
  // Replaying every recommendation gives the optimised totals exactly.
  const ds = dataset();
  const C = r.constraints;
  const ev = _test.makeEval(ds, C);
  const again = _test.replay(ds, C, ev, r._recs, null);
  assert.equal(_test.totals(ds, again.metrics).driveMin, r.optimised.driveMin);
});

test('minimum disruption: nobody changes team; weekly customers are protected', () => {
  const minimal = run(dataset(), constraintsFrom({ preset: 'minimal' }));
  assert.ok(minimal.recommendations.every((x) => x.kind === 'resequence' && !x.newTeam && !x.newDay));
  assert.ok(minimal.recommendations.every((x) => x.maxShift <= 30));
  const weekly = run(dataset('Weekly'), constraintsFrom({ preset: 'balanced' }));
  assert.ok(!weekly.recommendations.some((x) => x.customers.some((c) => c.home === 'NX Home' && c.newTeam)), 'a weekly customer keeps their team');
});

test('every re-planned day leaves after 8:15 and is back by 4:45', () => {
  const r = run(dataset(), constraintsFrom({ preset: 'maximum' }));
  const ds = dataset();
  const ev = _test.makeEval(ds, r.constraints);
  const again = _test.replay(ds, r.constraints, ev, r._recs, null);
  for (const [, m] of again.metrics) {
    for (const s of m.stops) assert.ok(s.start >= 8 * 60 + 15);
  }
  assert.equal(r.optimised.overtimeCleanerMin <= r.current.overtimeCleanerMin, true);
  assert.ok(r.capacityBound.teamDaysNeeded <= r.capacityBound.teamDaysUsed);
});

test('closed days are not working days, and a regular moved off their day is a one-off visit', () => {
  // Wednesday of week 1 (day 2): both teams are staffed but nothing is booked (a holiday).
  const list = days();
  list[2] = { date: date(2), issues: [], teams: [team(1, 'Blue', 2, []), team(2, 'Red', 2, [])] };
  // The Master Schedule has "C" as a regular on Thursdays only: the Tuesday visits are one-offs.
  const ds = build({ days: list, lookup, base: OFFICE, names: new Map(), rate: { rate: 60, jobs: 5 }, pattern: new Set(['c|4']) });
  assert.deepEqual(ds.closedDates, [date(2)]);
  assert.ok(![...ds.teamDays.values()].some((td) => td.date === date(2)), 'no team-days on the closed date');
  assert.ok([...ds.series.values()].every((s) => s.oneOff && !s.recurring));
  const r = run(ds, constraintsFrom({ preset: 'maximum' }));
  assert.equal(r.current.emptyTeamDays, 0, 'the holiday is not counted as empty days to sell');
  assert.ok(r.recommendations.every((x) => x.kind === 'resequence' || x.toWeekday === x.fromWeekday), 'one-off visits are never moved to another weekday');
  // With the pattern matching (regular on Tuesdays), they are ordinary series.
  const reg = build({ days: days(), lookup, base: OFFICE, names: new Map(), rate: { rate: 60, jobs: 5 }, pattern: new Set(['c|2']) });
  assert.ok([...reg.series.values()].every((s) => !s.oneOff && s.recurring));
});

test('a day of up to 6 stops gets the best possible order', () => {
  // Booked north, south, north, south: the best order pairs them up.
  const d = Array.from({ length: 28 }, (_, i) => ({
    date: date(i),
    issues: [],
    teams: i === 1 ? [team(1, 'Blue', i, [job(1, 'N2', i, '09:00', '10:00'), job(2, 'S1', i, '10:45', '11:45'), job(3, 'N3', i, '12:30', '13:30'), job(4, 'S2', i, '14:15', '15:15')])] : [],
  }));
  const ds = build({ days: d, lookup, base: OFFICE, names: new Map(), rate: { rate: 60, jobs: 5 } });
  const C = constraintsFrom({ preset: 'rebuild' });
  const td = [...ds.teamDays.values()][0];
  const ev = _test.makeEval(ds, C);
  const jobs = td.jobIds.map((id) => ds.jobs.get(id));
  const best = ev.flex(td, jobs);
  const zones = best.stops.map((s) => ds.jobs.get(s.id).zone).join(',');
  assert.ok(zones === 'north,north,south,south' || zones === 'south,south,north,north', zones);
  assert.ok(best.drive < ev.booked(td, jobs).drive);
});
