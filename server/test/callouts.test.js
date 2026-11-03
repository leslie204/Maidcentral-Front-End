// Call-out recovery on a made-up day (not today, so revenue is estimated from cleaner-hours).
// Every car has a lead (Captain) and a cleaner (Team Member); nobody works alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callOutScenarios, roster } from '../src/callouts.js';

process.env.OFFICE_RETURN_BY = '4:45 PM';
process.env.OFFICE_LEAVE_AT = '8:15 AM';
process.env.OFFICE_GEOCODE = 'off';

const DAY = '2026-11-10';
const at = (hhmm) => `/Date(${Date.parse(`${DAY}T${hhmm}:00Z`)})/`;
const N = { lat: 47.73, lng: -117.41 };
const S = { lat: 47.62, lng: -117.4 };
const home = (first, last, h, p) => `<tr><td>${first}</td><td>${last}</td><td>${h}</td><td>99208</td><td>north</td><td>${p.lat}</td><td>${p.lng}</td><td>Blue</td><td>Every Two Weeks</td><td>Tuesday</td><td>9:00 AM</td><td></td></tr>`;
const CEM = `<table><thead><tr><th>First Name</th><th>Last Name</th><th>Home Name</th><th>Zip</th><th>Zone</th><th>Latitude</th><th>Longitude</th><th>Default Team</th><th>Frequency</th><th>Day Of Week</th><th>Default Start Time</th><th>P/E</th></tr></thead><tbody>
${home('Ann', 'One', 'One Home', N)}${home('Bo', 'Two', 'Two Home', { lat: N.lat + 0.01, lng: N.lng })}${home('Cy', 'Three', 'Three Home', { lat: N.lat - 0.01, lng: N.lng })}
${home('Di', 'Four', 'Four Home', S)}${home('Ed', 'Five', 'Five Home', { lat: S.lat + 0.01, lng: S.lng })}${home('Flo', 'Six', 'Six Home', { lat: N.lat, lng: N.lng + 0.01 })}</tbody></table>`;
const COMPANY = '<div class="form-group"><label class="control-label">Address 1</label><input value="1 Main"></div><div class="form-group"><label class="control-label">Zip</label><input value="99208"></div>';

// Blue (north): One 9–11, Two 12–2. Red (south): Four 9–11, Five 1–3. Green (north):
// Three 9–10:30, Six 11–2. Room in the afternoon for a car of three.
const JOBS = [
  { JobInformationId: 1, TeamID: 1, Title: 'One Home - Ann One', Start: at('09:00'), End: at('11:00') },
  { JobInformationId: 2, TeamID: 1, Title: 'Two Home - Bo Two', Start: at('12:00'), End: at('14:00') },
  { JobInformationId: 3, TeamID: 2, Title: 'Four Home - Di Four', Start: at('09:00'), End: at('11:00') },
  { JobInformationId: 4, TeamID: 2, Title: 'Five Home - Ed Five', Start: at('13:00'), End: at('15:00') },
  { JobInformationId: 5, TeamID: 3, Title: 'Three Home - Cy Three', Start: at('09:00'), End: at('10:30') },
  { JobInformationId: 6, TeamID: 3, Title: 'Six Home - Flo Six', Start: at('11:00'), End: at('14:00') },
];
// Ids: x1 = lead (Captain, position 1), x2 = cleaner (Team Member, position 2); 41/42 have no team.
const SHIFTS = [
  [11, 1, 1], [12, 1, 2], [21, 2, 1], [22, 2, 2], [31, 3, 1], [32, 3, 2], [41, 0, 1], [42, 0, 2],
].map(([id, team, pos]) => ({ EmployeeID: id, TeamID: team, TeamPositionID: pos, Start: at('08:00'), End: at('17:00') }));
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
      '/Schedule/ReadTeamPositions': [{ TeamPositionID: 1, TeamPositionName: 'Captain' }, { TeamPositionID: 2, TeamPositionName: 'Team Member' }],
      '/Zone/GetMapJson': { features: [] },
    }[path];
  },
};
const placedIds = (s) => s.cars.flatMap((c) => c.stops.map((x) => x.jobId));
const anyMove = (p, re) => p.scenarios.some((s) => s.moves.some((m) => re.test(m)));

test('roster: roles from MaidCentral positions, changeable', async () => {
  const r = await roster(mc, { date: DAY });
  assert.deepEqual(r.cars.map((c) => [c.name, c.members.map((m) => m.role).join('+'), c.jobs]), [['Blue', 'lead+cleaner', 2], ['Green', 'lead+cleaner', 2], ['Red', 'lead+cleaner', 2]]);
  assert.equal(r.cars[0].members[0].roleSource, 'MaidCentral');
  const changed = await roster(mc, { date: DAY, roles: '12:lead' });
  assert.deepEqual(changed.cars[0].members.map((m) => [m.role, m.roleSource]), [['lead', 'MaidCentral'], ['lead', 'you']]);
  assert.deepEqual(r.spare.map((p) => [p.id, p.role]), [[41, 'lead'], [42, 'cleaner']]);
});

test('nobody works alone: the person left joins a car with a lead, or their car stands down', async () => {
  const p = await callOutScenarios(mc, { date: DAY, out: '12' }); // Blue's cleaner
  assert.equal(p.revenueEstimated, true);
  assert.deepEqual(p.calledOut.map((c) => [c.car, c.role]), [['Blue', 'cleaner']]);
  assert.ok(p.scenarios.every((s) => s.cars.every((c) => c.people.length !== 1)), 'no car of one');
  assert.ok(p.baseline.jobs === 2 && p.baseline.lost > 0, 'doing nothing loses all of Blue');
  for (let i = 1; i < p.scenarios.length; i++) assert.ok(p.scenarios[i - 1].jobsKept >= p.scenarios[i].jobsKept, 'ranked by jobs kept');
  assert.equal(p.totalJobs, JOBS.length);
  assert.equal(p.baseline.impact, 'high', 'losing a third of the day is high impact');
  for (const s of p.scenarios) {
    assert.equal(s.jobsKept + s.jobsLost, p.totalJobs);
    assert.ok(['none', 'low', 'medium', 'high'].includes(s.impact));
    assert.equal(s.impact === 'none', s.jobsLost === 0);
    for (const x of s.reschedule) assert.ok(['low', 'medium', 'high'].includes(x.impact));
  }
  assert.ok(anyMove(p, /Person 11 \(lead\) joins (Green|Red) \(car of 3\)/));
  assert.ok(p.scenarios[0].saved > p.totalRevenue - p.baseline.lost, 'best plan beats doing nothing');
  for (const s of p.scenarios) {
    assert.equal(placedIds(s).length + s.reschedule.length, JOBS.length);
    assert.equal(s.saved + s.lost, p.totalRevenue);
  }
});

test('a car needs a lead: two cleaners cannot pair up; a lead and a cleaner can', async () => {
  const twoCleaners = await callOutScenarios(mc, { date: DAY, out: '11,21' }); // both leads out
  assert.ok(!anyMove(twoCleaners, /pair up/));
  assert.ok(twoCleaners.scenarios.every((s) => s.cars.every((c) => !c.people.length || c.roles.includes('lead'))), 'every working car has a lead');
  const mixed = await callOutScenarios(mc, { date: DAY, out: '11,22' }); // Blue's lead and Red's cleaner
  assert.ok(anyMove(mixed, /Person (12|21) \((lead|cleaner)\) & Person (12|21) \((lead|cleaner)\) pair up/));
  assert.equal(mixed.calledOut.length, 2);
  // You know better than MaidCentral: mark Blue's cleaner as a lead.
  const relabelled = await callOutScenarios(mc, { date: DAY, out: '11,21', roles: '12:lead' });
  assert.ok(anyMove(relabelled, /pair up/));
});

test('fill-ins only when chosen, and only if the car ends up with a lead; car size limit', async () => {
  assert.ok(!anyMove(await callOutScenarios(mc, { date: DAY, out: '11' }), /fills in/));
  assert.ok(!anyMove(await callOutScenarios(mc, { date: DAY, out: '11', available: '42' }), /fills in/), 'a cleaner cannot replace a lead');
  const lead = await callOutScenarios(mc, { date: DAY, out: '11', available: '41' });
  assert.ok(anyMove(lead, /Person 41 \(lead, no team today\) fills in with Person 12 \(cleaner\) in Blue/));
  const two = await callOutScenarios(mc, { date: DAY, out: '12', maxCar: 2 });
  assert.ok(!anyMove(two, /joins/));
  assert.ok(two.scenarios.every((s) => s.cars.every((c) => c.people.length <= 2)));
  await assert.rejects(callOutScenarios(mc, { date: DAY, out: '' }), /Choose who called out/);
});

test('a whole car out: its jobs are shared out; nobody starts before leaving the office at 8:15', async () => {
  const p = await callOutScenarios(mc, { date: DAY, out: '11,12' });
  assert.ok(p.scenarios[0].moves.some((m) => /Blue has nobody left/.test(m)));
  assert.equal(p.options.leaveAt, '8:15 AM');
  for (const s of p.scenarios) for (const c of s.cars) for (const x of c.stops) assert.ok(x.start > 8 * 60 + 15, `${c.name} starts before leaving`);
});

test('call outcomes re-plan the day: reschedule, agreed, after a time, no answer', async () => {
  const base = await callOutScenarios(mc, { date: DAY, out: '12' });
  const best = base.scenarios[0];
  const moved = best.changes.find((c) => c.moved);
  assert.ok(moved, 'the best plan moves at least one job');
  // The customer would rather reschedule: it leaves today's plan as their choice.
  const r1 = await callOutScenarios(mc, { date: DAY, out: '12', calls: JSON.stringify({ [moved.jobId]: { outcome: 'reschedule' } }) });
  assert.equal(r1.scenarios[0].reschedule.find((x) => x.jobId === moved.jobId)?.customerChoice, 'reschedule');
  assert.ok(r1.scenarios.every((s) => !placedIds(s).includes(moved.jobId)));
  // Agreed: pinned to that car and time.
  const r2 = await callOutScenarios(mc, { date: DAY, out: '12', calls: JSON.stringify({ [moved.jobId]: { outcome: 'agreed', car: moved.to, start: moved.nowMin } }) });
  const same = r2.scenarios.find((s) => s.moves.join() === best.moves.join());
  const stop = same.cars.find((c) => c.name === moved.to).stops.find((x) => x.jobId === moved.jobId);
  assert.equal(stop.start, moved.nowMin);
  // No answer: they keep their booked time wherever the job goes.
  const r3 = await callOutScenarios(mc, { date: DAY, out: '12', calls: JSON.stringify({ 1: { outcome: 'noanswer' }, 2: { outcome: 'noanswer' } }) });
  assert.equal(r3.callsApplied, 2);
  for (const s of r3.scenarios) for (const c of s.cars) for (const x of c.stops) if (x.jobId <= 2) assert.equal(x.start, x.jobId === 1 ? 540 : 720, 'booked time kept');
  // Only after 10 AM.
  const r4 = await callOutScenarios(mc, { date: DAY, out: '12', calls: JSON.stringify({ 1: { outcome: 'after', time: 600 } }) });
  for (const s of r4.scenarios) for (const c of s.cars) for (const x of c.stops) if (x.jobId === 1) assert.ok(x.start >= 600);
});
