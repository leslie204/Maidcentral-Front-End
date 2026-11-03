// The planner's maths on a made-up day: windows, gaps, issues, slots, continuity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseDay, planOverview, findSlots, continuity } from '../src/planner.js';

// MaidCentral style: wall-clock times as if UTC.
const at = (day, hhmm) => `/Date(${Date.parse(`${day}T${hhmm}:00Z`)})/`;
const DAYS = ['2026-11-09', '2026-11-10'];
function fixture(day) {
  return {
    jobs: [
      { JobInformationId: 1, TeamID: 10, Title: 'Ana Lee - Lee Home', Start: at(day, '09:00'), End: at(day, '11:00'), AllowedTime: 2 },
      { JobInformationId: 2, TeamID: 10, Title: 'Bo Chan - Chan Home', Start: at(day, '13:00'), End: at(day, '15:00'), AllowedTime: 2 },
      { JobInformationId: 3, TeamID: 20, Title: 'Cy Park - Park Home', Start: at(day, '07:00'), End: at(day, '09:30'), AllowedTime: 2.5 },
      { JobInformationId: 4, TeamID: 20, Title: 'Di Ross - Ross Home', Start: at(day, '09:00'), End: at(day, '10:00'), AllowedTime: 1 },
      { JobInformationId: 5, TeamID: 0, Title: 'Ed Wu - Wu Home', Start: at(day, '10:00'), End: at(day, '12:00'), AllowedTime: 2 },
    ],
    teams: [{ TeamID: 10, TeamName: 'Blue' }, { TeamID: 20, TeamName: 'Red' }],
    shifts: [
      { EmployeeID: 1, TeamID: 10, Start: at(day, '08:00'), End: at(day, '17:00') },
      { EmployeeID: 2, TeamID: 10, Start: at(day, '08:30'), End: at(day, '16:00') },
      { EmployeeID: 3, TeamID: 20, Start: at(day, '08:00'), End: at(day, '12:00') },
      { EmployeeID: 4, TeamID: 20, Start: at(day, '08:00'), End: at(day, '12:00'), Absent: true, Reason: 'Sick' },
      { EmployeeID: 5, TeamID: 0, Start: at(day, '08:00'), End: at(day, '16:00') },
    ],
    employees: [1, 2, 3, 4, 5].map((id) => ({ EmployeeID: id, text: `Cleaner ${id}` })),
  };
}

// A stand-in for McSession: answers the four day calls from the fixture.
const fakeMc = (overrides = {}) => ({
  async getJson(path, q) {
    const [m, d, y] = q.date.split('/').map(Number);
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const f = overrides[iso] || fixture(iso);
    return { '/Job/ReadJobs': f.jobs, '/Job/TeamMonitorTeams': f.teams, '/Schedule/Read': f.shifts, '/Schedule/ReadEmployees': f.employees }[path];
  },
});

test('analyseDay: windows, booked hours, gaps and issues', () => {
  const a = analyseDay({ iso: DAYS[0], ...fixture(DAYS[0]) });
  const blue = a.teams.find((t) => t.name === 'Blue');
  assert.deepEqual(blue.window, { start: '2026-11-09T08:00:00', end: '2026-11-09T17:00:00' });
  assert.equal(blue.bookedHours, 4);
  assert.equal(blue.capacityHours, 9);
  assert.equal(blue.utilisation, 44);
  assert.deepEqual(blue.gaps.map((g) => [g.start.slice(11, 16), g.end.slice(11, 16)]), [['08:00', '09:00'], ['11:00', '13:00'], ['15:00', '17:00']]);
  const kinds = a.issues.map((i) => i.kind).sort();
  assert.deepEqual(kinds, ['absent', 'outside_hours', 'overlap', 'unassigned']);
  assert.match(a.issues.find((i) => i.kind === 'absent').title, /Cleaner 4 is absent from Red \(Sick\)/);
  assert.deepEqual(a.spare.map((s) => s.name), ['Cleaner 5']);
});

test('team colours: hex kept, stray semicolons removed, junk dropped', async () => {
  const { cssColor } = await import('../src/planner.js');
  assert.equal(cssColor('#fbf60d'), '#fbf60d');
  assert.equal(cssColor('rgb(251, 246, 13);'), 'rgb(251, 246, 13)');
  assert.equal(cssColor('red; background:url(x)'), null);
  assert.equal(cssColor(null), null);
});

test('overview: capacity grid per team and day, issues across days', async () => {
  const o = await planOverview(fakeMc(), DAYS[0], 2);
  assert.deepEqual(o.days, DAYS);
  assert.deepEqual(o.teams.map((t) => t.name), ['Blue', 'Red']);
  assert.equal(o.teams[0].cells[1].capacity, 9);
  assert.equal(o.issues.filter((i) => i.kind === 'unassigned').length, 2);
  assert.equal(o.totals[0].jobs, 4);
  assert.equal(o.spare.length, 2);
});

test('slots: fits a 2 h job into gaps, best first; morning filter; familiar team ranks first', async () => {
  const s = await findSlots(fakeMc(), { from: DAYS[0], days: 2, duration: 2, now: '2026-11-09T00:00' });
  assert.ok(s.slots.length > 0);
  assert.ok(s.slots.every((x) => Date.parse(`${x.end}Z`) - Date.parse(`${x.start}Z`) === 2 * 3600e3));
  assert.equal(s.slots[0].date, DAYS[0], 'earlier days rank first');
  assert.ok(s.slots[0].reasons.some((r) => /Fills the gap exactly|Next to another job/.test(r.text)));
  const morning = await findSlots(fakeMc(), { from: DAYS[0], days: 2, duration: 2, part: 'morning', now: '2026-11-09T00:00' });
  assert.ok(morning.slots.every((x) => Number(x.start.slice(11, 13)) < 12));
  const later = await findSlots(fakeMc(), { from: DAYS[0], days: 1, duration: 2, now: '2026-11-09T14:00' });
  assert.ok(later.slots.every((x) => x.start >= '2026-11-09T14:00'), 'no slots in the past');
});

test('continuity: homes that usually have one team, and upcoming visits with another', async () => {
  // History: Lee Home always with Blue (10). Upcoming: one Lee Home visit moved to Red.
  const moved = (iso) => {
    const f = fixture(iso);
    f.jobs[0] = { ...f.jobs[0], TeamID: 20 };
    return f;
  };
  const overrides = { '2026-11-10': moved('2026-11-10') };
  const c = await continuity(fakeMc(overrides), DAYS[0]);
  assert.ok(c.repeatHomes >= 4);
  assert.equal(c.changes.length, 1);
  assert.equal(c.changes[0].title, 'Ana Lee - Lee Home');
  assert.equal(c.changes[0].usualTeam, 'Blue');
  assert.equal(c.changes[0].team, 'Red');
});
