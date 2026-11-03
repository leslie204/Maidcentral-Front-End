// Openings by frequency and area on a made-up 4-week cycle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openings, placeCustomer, km } from '../src/territory.js';

const at = (day, hhmm) => `/Date(${Date.parse(`${day}T${hhmm}:00Z`)})/`;
const MONDAYS = ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
const NORTH = { lat: 47.73, lng: -117.41 };
const SOUTH = { lat: 47.62, lng: -117.4 };

// Recurring book (Customer Efficiency Map) and zones, as MaidCentral renders them.
const CEM = `<table><thead><tr><th>First Name</th><th>Last Name</th><th>Home Name</th><th>Zip</th><th>Zone</th><th>Latitude</th><th>Longitude</th><th>Default Team</th><th>Frequency</th><th>Day Of Week</th><th>Default Start Time</th><th>P/E</th></tr></thead><tbody>
<tr><td>Ann</td><td>North</td><td>North Home</td><td>99208</td><td>north</td><td>${NORTH.lat}</td><td>${NORTH.lng}</td><td>Blue</td><td>Every Week</td><td>Monday</td><td>9:00 AM</td><td></td></tr>
<tr><td>Sam</td><td>South</td><td>South Home</td><td>99203</td><td>south hill</td><td>${SOUTH.lat}</td><td>${SOUTH.lng}</td><td>Red</td><td>Every Two Weeks</td><td>Monday</td><td>9:00 AM</td><td></td></tr>
<tr><td>Sue</td><td>Two</td><td>South Two Home</td><td>99203</td><td>south hill</td><td>${SOUTH.lat + 0.005}</td><td>${SOUTH.lng}</td><td>Red</td><td>Every Four Weeks</td><td>Monday</td><td>1:00 PM</td><td></td></tr>
</tbody></table>`;
const ZONES = `<table><thead><tr><th>Zone Description</th><th>Color</th><th>Zips</th></tr></thead><tbody>
<tr><td>north</td><td><span style="background:#ff0000">x</span></td><td>99208</td></tr><tr><td>south hill</td><td><span style="background:#00ff00">x</span></td><td>99203</td></tr></tbody></table>`;

// Blue (north): 9–11 every Monday, free 11–17. Red (south): 9–11 every Monday; 13–15 only in
// weeks 2 and 4, so 13–15 is free in weeks 1 and 3 (an every-2-weeks opening); week 4 also
// has 15–17 booked, leaving 15–17 free in weeks 1–3 only.
function day(iso) {
  const w = MONDAYS.indexOf(iso);
  if (w < 0) return { jobs: [], teams: [], shifts: [], employees: [] };
  const jobs = [
    { JobInformationId: 1, TeamID: 1, Title: 'North Home - Ann North', Start: at(iso, '09:00'), End: at(iso, '11:00'), FrequencyColor: '#92B558' },
    { JobInformationId: 2, TeamID: 2, Title: 'South Home - Sam South', Start: at(iso, '09:00'), End: at(iso, '11:00'), FrequencyColor: '#005960' },
  ];
  if (w === 1 || w === 3) jobs.push({ JobInformationId: 3, TeamID: 2, Title: 'South Two Home - Sue Two', Start: at(iso, '13:00'), End: at(iso, '15:00'), FrequencyColor: '#578CAC' });
  if (w === 3) jobs.push({ JobInformationId: 4, TeamID: 2, Title: 'South Two Home - Sue Two', Start: at(iso, '15:00'), End: at(iso, '17:00'), FrequencyColor: '#d2691e' });
  return {
    jobs,
    teams: [{ TeamID: 1, TeamName: 'Blue', Color: '#0063fd' }, { TeamID: 2, TeamName: 'Red', Color: '#c40909' }],
    shifts: [
      { EmployeeID: 1, TeamID: 1, Start: at(iso, '05:00'), End: at(iso, '17:00') }, // early shift: no 5 AM openings
      { EmployeeID: 2, TeamID: 2, Start: at(iso, '08:00'), End: at(iso, '17:00') },
    ],
    employees: [{ EmployeeID: 1, text: 'Bea' }, { EmployeeID: 2, text: 'Rae' }],
  };
}
const KEY = '<ul><li><span class="label" style="background:#92B558;">Every Week</span></li><li><span class="label" style="background:#005960;">Every Two Weeks</span></li><li><span class="label" style="background:#578CAC;">Every Four Weeks</span></li><li><span class="label" style="background:#d2691e;">Single</span></li></ul>';
const mc = {
  async getHtml(path) {
    return { '/Report/CustomerEfficiencyMap': CEM, '/Zone': ZONES, '/Job/Schedule': KEY }[path];
  },
  async getJson(path, q) {
    const [m, d, y] = q.date.split('/').map(Number);
    const f = day(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    return { '/Job/ReadJobs': f.jobs, '/Job/TeamMonitorTeams': f.teams, '/Schedule/Read': f.shifts, '/Schedule/ReadEmployees': f.employees }[path];
  },
};

test('openings: weekly, every 2 weeks (paired weeks) and every 4 weeks, within working hours', async () => {
  const o = await openings(mc, { from: MONDAYS[0], minHours: 1.5 });
  const find = (team, fit) => o.openings.filter((x) => x.team === team && x.fit === fit);
  const blueWeekly = find('Blue', 'Weekly');
  assert.deepEqual(blueWeekly.map((x) => x.label), ['11:00 AM – 5:00 PM']);
  assert.ok(o.openings.every((x) => x.start >= 8 * 60), 'nothing before 8 AM');
  assert.equal(blueWeekly[0].area.zone, 'north');
  const red2 = find('Red', 'Every 2 weeks');
  assert.deepEqual(red2.map((x) => [x.label, x.dates]), [['1:00 PM – 5:00 PM', ['2026-11-09', '2026-11-23']]]); // 11–1 is weekly (free every week)
  assert.equal(red2[0].weeklyHours, 2);
  assert.deepEqual(find('Red', 'Weekly').map((x) => x.label), ['11:00 AM – 1:00 PM']);
  assert.equal(red2[0].area.zone, 'south hill');
  // 15:00–17:00 is free in weeks 1–3: weeks 1 & 3 pair up; week 2 is left as every 4 weeks.
  assert.ok(find('Red', 'Every 2 weeks').length + find('Red', 'Every 4 weeks').length >= 2);
  const red4 = find('Red', 'Every 4 weeks');
  assert.ok(red4.some((x) => x.dates.length === 1));
  // The 4-week board.
  assert.equal(o.cycle.weeks.length, 4);
  assert.deepEqual(o.cycle.weekdays, ['Monday']);
  const redW2 = o.cycle.teams.find((t) => t.name === 'Red').days['2026-11-16'];
  assert.deepEqual(redW2.jobs.map((j) => j.frequency), ['Every 2 weeks', 'Every 4 weeks']);
  // Sales view by zone.
  assert.ok(o.zones.find((z) => z.name === 'north').openWeeklyHours > 0);
  assert.equal(o.book.matchedJobs, o.book.totalJobs);
});

test('place a customer: nearby team and matching frequency first', async () => {
  const south = await placeCustomer(mc, { from: MONDAYS[0], zip: '99203', frequency: '2', hours: 2 });
  assert.equal(south.results[0].team, 'Red');
  assert.equal(south.results[0].fit, 'Every 2 weeks');
  assert.ok(south.results[0].extraDriveMin <= 5);
  const north = await placeCustomer(mc, { from: MONDAYS[0], zip: '99208', frequency: '1', hours: 2 });
  assert.equal(north.results[0].team, 'Blue');
  assert.ok(north.results.every((r) => r.weeks === 1), 'weekly customers only get weekly openings');
  await assert.rejects(placeCustomer(mc, { from: MONDAYS[0], zip: '00000' }), /ZIP code, a zone/);
});

test('distance', () => {
  assert.ok(Math.abs(km(NORTH, SOUTH) - 12.2) < 0.5);
});
