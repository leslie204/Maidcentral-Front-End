// The planner's maths on a made-up day: windows, gaps, issues, slots, continuity.
import { test } from 'node:test';
// These tests predate the return-to-office time; the cutoff has its own test below.
process.env.OFFICE_RETURN_BY = '6:00 PM';
import assert from 'node:assert/strict';
import { analyseDay, planOverview, findSlots, continuity } from '../src/planner.js';

// MaidCentral style: wall-clock times as if UTC.
const at = (day, hhmm) => `/Date(${Date.parse(`${day}T${hhmm}:00Z`)})/`;
const DAYS = ['2026-11-09', '2026-11-10'];
import { parseKey, frequencyOf } from '../src/schedulekey.js';
function fixture(day) {
  return {
    jobs: [
      { JobInformationId: 1, TeamID: 10, Title: 'Ana Lee - Lee Home', Start: at(day, '09:00'), End: at(day, '11:00'), AllowedTime: 2, FrequencyColor: '#92B558' },
      { JobInformationId: 2, TeamID: 10, Title: 'Bo Chan - Chan Home', Start: at(day, '13:00'), End: at(day, '15:00'), AllowedTime: 2, FrequencyColor: '#005960' },
      { JobInformationId: 3, TeamID: 20, Title: 'Cy Park - Park Home', Start: at(day, '07:00'), End: at(day, '09:30'), AllowedTime: 2.5, FrequencyColor: '#d2691e' },
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
const KEY_HTML = '<ul><li><span class="label" style="background:#92B558;">Every Week</span></li><li><span class="label" style="background:#005960;">Every Two Weeks</span></li><li><span class="label" style="background:#d2691e;">Single</span></li><li><span class="label" style="background:#ec2d01;">Behind Schedule</span></li><li><span class="label" style="background:#9acd32;">4 - We\'re Thrilled - Great Work</span></li></ul>';
const fakeMc = (overrides = {}) => ({
  async getHtml(path) {
    if (path === '/Job/Schedule') return KEY_HTML;
    throw new Error(`unexpected ${path}`);
  },
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

test('schedule key: colours to frequencies, progress and scorecards', () => {
  const key = parseKey(KEY_HTML);
  assert.deepEqual(frequencyOf(key, '#92b558'), { name: 'Every Week', short: 'Weekly', weeks: 1, color: '#92b558', recurring: true });
  assert.equal(frequencyOf(key, '#D2691E').short, 'One-time');
  assert.equal(frequencyOf(key, '#D2691E').recurring, false);
  assert.equal(frequencyOf(key, '#000000'), null);
  assert.equal(key.progress['#ec2d01'].name, 'Behind Schedule');
  assert.equal(key.scorecard['#9acd32'].score, 4);
});

test('frequency mix per team and over the period', async () => {
  const o = await planOverview(fakeMc(), DAYS[0], 2);
  const blue = o.teams.find((t) => t.name === 'Blue').cells[0];
  assert.deepEqual(blue.mix, { Weekly: 2, 'Every 2 weeks': 2 });
  assert.equal(blue.recurring, 4);
  const names = o.frequencies.map((f) => f.name);
  assert.ok(names.includes('Weekly') && names.includes('One-time') && names.includes('Unknown'));
  assert.equal(o.frequencies.find((f) => f.name === 'Weekly').jobs, 2);
});

test('recurring slots are checked on every repeat visit', async () => {
  // Blue is fully booked 15:00-17:00 on the second visit (two weeks later).
  const busy = (iso) => {
    const f = fixture(iso);
    f.jobs.push({ JobInformationId: 9, TeamID: 10, Title: 'Fay Ng - Ng Home', Start: at(iso, '15:00'), End: at(iso, '17:00'), AllowedTime: 2 });
    return f;
  };
  const mc = fakeMc({ '2026-11-23': busy('2026-11-23') });
  const r = await findSlots(mc, { from: DAYS[0], days: 1, duration: 2, repeat: 2, now: '2026-11-09T00:00' });
  assert.equal(r.visits, 3);
  const blueLate = r.slots.find((x) => x.team === 'Blue' && x.start.endsWith('15:00:00'));
  assert.deepEqual(blueLate.repeats, { fits: 2, of: 3, missed: ['2026-11-23'] });
  const full = r.slots.find((x) => x.repeats.fits === 3);
  assert.ok(full && full.score > blueLate.score, 'slots free on every visit rank higher');
});

test('return to the office: day capped at the return time, late jobs flagged', () => {
  process.env.OFFICE_RETURN_BY = '4:45 PM';
  try {
    const f = fixture(DAYS[0]);
    f.jobs.push({ JobInformationId: 8, TeamID: 10, Title: 'Gil Fox - Fox Home', Start: at(DAYS[0], '15:30'), End: at(DAYS[0], '17:00'), AllowedTime: 1.5 });
    const a = analyseDay({ iso: DAYS[0], ...f });
    const blue = a.teams.find((t) => t.name === 'Blue');
    assert.equal(blue.window.end, '2026-11-09T16:45:00');
    const late = a.issues.find((i) => i.kind === 'late_return');
    assert.match(late.title, /Blue: Gil Fox - Fox Home ends after the 4:45 PM return/);
  } finally {
    process.env.OFFICE_RETURN_BY = '6:00 PM';
  }
});
