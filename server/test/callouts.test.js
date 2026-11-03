// Call-out recovery on a made-up day (not today, so revenue is estimated from cleaner-hours).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callOutScenarios, roster } from '../src/callouts.js';

process.env.OFFICE_RETURN_BY = '4:45 PM';
process.env.OFFICE_GEOCODE = 'off';

const DAY = '2026-11-10';
const at = (hhmm) => `/Date(${Date.parse(`${DAY}T${hhmm}:00Z`)})/`;
const N = { lat: 47.73, lng: -117.41 };
const S = { lat: 47.62, lng: -117.4 };
const home = (first, last, h, p) => `<tr><td>${first}</td><td>${last}</td><td>${h}</td><td>99208</td><td>north</td><td>${p.lat}</td><td>${p.lng}</td><td>Blue</td><td>Every Two Weeks</td><td>Tuesday</td><td>9:00 AM</td><td></td></tr>`;
const CEM = `<table><thead><tr><th>First Name</th><th>Last Name</th><th>Home Name</th><th>Zip</th><th>Zone</th><th>Latitude</th><th>Longitude</th><th>Default Team</th><th>Frequency</th><th>Day Of Week</th><th>Default Start Time</th><th>P/E</th></tr></thead><tbody>
${home('Ann', 'One', 'One Home', N)}${home('Bo', 'Two', 'Two Home', { lat: N.lat + 0.01, lng: N.lng })}${home('Cy', 'Three', 'Three Home', { lat: N.lat - 0.01, lng: N.lng })}
${home('Di', 'Four', 'Four Home', S)}${home('Flo', 'Six', 'Six Home', { lat: N.lat, lng: N.lng + 0.01 })}${home('Ed', 'Five', 'Five Home', { lat: S.lat + 0.01, lng: S.lng })}</tbody></table>`;
const COMPANY = '<div class="form-group"><label class="control-label">Address 1</label><input value="1 Main"></div><div class="form-group"><label class="control-label">Zip</label><input value="99208"></div>';

// Blue (north): One 9–11:30, Two 12–2:30 (too long for one person to do both). Red (south): Four 9–12, Five 12:30–4. Green (north):
// Three 9–10:30, Six 10:45–4. Only a car of three has time to spare.
const JOBS = [
  { JobInformationId: 1, TeamID: 1, Title: 'One Home - Ann One', Start: at('09:00'), End: at('11:30') },
  { JobInformationId: 2, TeamID: 1, Title: 'Two Home - Bo Two', Start: at('12:00'), End: at('14:30') },
  { JobInformationId: 3, TeamID: 2, Title: 'Four Home - Di Four', Start: at('09:00'), End: at('12:00') },
  { JobInformationId: 4, TeamID: 2, Title: 'Five Home - Ed Five', Start: at('12:30'), End: at('16:00') },
  { JobInformationId: 5, TeamID: 3, Title: 'Three Home - Cy Three', Start: at('09:00'), End: at('10:30') },
  { JobInformationId: 6, TeamID: 3, Title: 'Six Home - Flo Six', Start: at('10:45'), End: at('16:00') },
];
const SHIFTS = [
  [11, 1], [12, 1], [21, 2], [22, 2], [31, 3], [32, 3], [41, 0],
].map(([id, team]) => ({ EmployeeID: id, TeamID: team, Start: at('08:00'), End: at('17:00') }));
const mc = {
  host: 'callouts.maidcentral.com',
  async getHtml(path) {
    return { '/Report/CustomerEfficiencyMap': CEM, '/Zone': '<table></table>', '/Job/Schedule': '', '/Company/Settings': COMPANY }[path] ?? '';
  },
  async getJson(path) {
    return {
      '/Job/ReadJobs': JOBS,
      '/Job/TeamMonitorTeams': [{ TeamID: 1, TeamName: 'Blue' }, { TeamID: 2, TeamName: 'Red' }, { TeamID: 3, TeamName: 'Green' }],
      '/Schedule/Read': SHIFTS,
      '/Schedule/ReadEmployees': SHIFTS.map((s) => ({ EmployeeID: s.EmployeeID, text: `Person ${s.EmployeeID}` })),
      '/Zone/GetMapJson': { features: [] },
    }[path];
  },
};

test('roster: cars with people, jobs and revenue; people without a team listed', async () => {
  const r = await roster(mc, { date: DAY });
  assert.deepEqual(r.cars.map((c) => [c.name, c.members.length, c.jobs]), [['Blue', 2, 2], ['Green', 2, 2], ['Red', 2, 2]]);
  assert.deepEqual(r.spare.map((p) => p.id), [41]);
});

test('one call-out: plans ranked by revenue saved; solo loses a job; joins make a car of three', async () => {
  const p = await callOutScenarios(mc, { date: DAY, out: '11' });
  assert.equal(p.revenueEstimated, true);
  assert.equal(p.calledOut[0].car, 'Blue');
  assert.ok(p.scenarios.length >= 3);
  for (let i = 1; i < p.scenarios.length; i++) assert.ok(p.scenarios[i - 1].saved >= p.scenarios[i].saved, 'ranked by revenue saved');
  // Blue's 2.5 h two-person jobs take 5 h each for one person: both can't fit.
  const solo = p.scenarios.find((s) => s.moves.some((m) => /works Blue alone/.test(m)));
  assert.ok(solo.lost > 0 && solo.reschedule.length >= 1);
  assert.equal(p.baseline.lost, solo.lost);
  for (const s of p.scenarios.filter((x) => x.moves.some((m) => /joins/.test(m)))) {
    const joined = s.cars.find((c) => c.people.includes('Person 12'));
    assert.equal(joined.people.length, 3, 'a car of three');
    assert.ok(!s.cars.some((c) => c.name === 'Blue' && c.stops.length), 'Blue has no jobs left');
  }
  // Every job is either on a car or on the reschedule list; the call list matches.
  for (const s of p.scenarios) {
    const placed = s.cars.flatMap((c) => c.stops.map((x) => x.jobId));
    assert.equal(placed.length + s.reschedule.length, JOBS.length);
    assert.equal(s.saved + s.lost, p.totalRevenue);
  }
  // A car nobody touched keeps its booked times.
  const red = solo.cars.find((c) => c.name === 'Red');
  if (!red.stops.some((x) => x.moved)) assert.deepEqual(red.stops.map((x) => x.label), ['9:00 AM – 12:00 PM', '12:30 PM – 4:00 PM']);
});

test('limits: no car bigger than allowed; fill-ins only when chosen', async () => {
  const two = await callOutScenarios(mc, { date: DAY, out: '11', maxCar: 2 });
  assert.ok(two.scenarios.every((s) => s.cars.every((c) => c.people.length <= 2)));
  assert.ok(!two.scenarios.some((s) => s.moves.some((m) => /joins/.test(m))));
  assert.ok(!two.scenarios.some((s) => s.moves.some((m) => /pairs with/.test(m))), 'no fill-in unless chosen');
  const fill = await callOutScenarios(mc, { date: DAY, out: '11', available: '41' });
  assert.ok(fill.scenarios.some((s) => s.moves.some((m) => /Person 41 \(no team today\) pairs with Person 12 in Blue/.test(m))));
  await assert.rejects(callOutScenarios(mc, { date: DAY, out: '' }), /Choose who called out/);
});

test('a whole car out: its jobs are shared among the others', async () => {
  const p = await callOutScenarios(mc, { date: DAY, out: '11,12' });
  assert.ok(p.scenarios[0].moves.some((m) => /Blue has nobody left/.test(m)));
  assert.ok(p.scenarios[0].lost > 0, 'two long jobs cannot all be absorbed by full cars');
  const moved = p.scenarios[0].changes.filter((c) => c.moved).map((c) => c.from);
  assert.ok(moved.every((f) => f === 'Blue'));
});
