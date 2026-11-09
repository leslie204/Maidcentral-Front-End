// Openings by frequency and area on a made-up 4-week cycle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openings, placeCustomer, km } from '../src/territory.js';

process.env.OFFICE_RETURN_BY = '4:45 PM';
process.env.OFFICE_GEOCODE = 'off'; // no network in tests: office = centre of homes in its ZIP

const at = (day, hhmm) => `/Date(${Date.parse(`${day}T${hhmm}:00Z`)})/`;
const MONDAYS = ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
const NORTH = { lat: 47.73, lng: -117.41 };
const SOUTH = { lat: 47.62, lng: -117.4 };

// Recurring book (Customer Efficiency Map) and zones, as MaidCentral renders them.
const CEM = `<table><thead><tr><th>First Name</th><th>Last Name</th><th>Home Name</th><th>Zip</th><th>Zone</th><th>Latitude</th><th>Longitude</th><th>Default Team</th><th>Frequency</th><th>Day Of Week</th><th>Default Start Time</th><th>P/E</th></tr></thead><tbody>
<tr><td>Ann</td><td>North</td><td>North Home</td><td>99208</td><td>north</td><td>${NORTH.lat}</td><td>${NORTH.lng}</td><td>Blue</td><td>Every Week</td><td>Monday</td><td>9:00 AM</td><td></td></tr>
<tr><td>Sam</td><td>South</td><td>South Home</td><td>99203</td><td>south hill</td><td>${SOUTH.lat}</td><td>${SOUTH.lng}</td><td>Red</td><td>Every Week</td><td>Monday</td><td>9:00 AM</td><td></td></tr>
<tr><td>Gil</td><td>Green</td><td>Gil Home</td><td>99208</td><td>north</td><td>${NORTH.lat + 0.004}</td><td>${NORTH.lng}</td><td>Green</td><td>Every Two Weeks</td><td>Monday</td><td>9:00 AM</td><td></td></tr>
<tr><td>Kim</td><td>Skip</td><td>Kim Home</td><td>99208</td><td>north</td><td>${NORTH.lat + 0.006}</td><td>${NORTH.lng}</td><td>Green</td><td>Every Four Weeks</td><td>Monday</td><td>1:00 PM</td><td></td></tr>
<tr><td>Moe</td><td>Moved</td><td>Moe Home</td><td>99208</td><td>north</td><td>${NORTH.lat - 0.004}</td><td>${NORTH.lng}</td><td>Blue</td><td>Every Four Weeks</td><td>Tuesday</td><td>9:00 AM</td><td></td></tr>
<tr><td>Sue</td><td>Two</td><td>South Two Home</td><td>99203</td><td>south hill</td><td>${SOUTH.lat + 0.005}</td><td>${SOUTH.lng}</td><td>Red</td><td>Every Four Weeks</td><td>Monday</td><td>1:00 PM</td><td></td></tr>
</tbody></table>`;
const ZONES = `<table><thead><tr><th>Zone Description</th><th>Color</th><th>Zips</th></tr></thead><tbody>
<tr><td>north</td><td><span style="background:#ff0000">x</span></td><td>99208</td></tr><tr><td>south hill</td><td><span style="background:#00ff00">x</span></td><td>99203</td></tr></tbody></table>`;

// The recurring pattern (Master Schedule): Blue (north) Ann weekly 9–11. Red (south) Sam
// weekly 9–11; Sue every 2 weeks (weeks 2 & 4) 13–15. Green (north) Gil every 2 weeks
// (weeks 1 & 3) 9–11; Kim every 4 weeks (week 3) 13–15.
// The dated schedule: as the pattern, except Red's week 4 has an extra one-time Sue visit
// 15–17, Kim skipped her week 3 visit (11/23), and Moe was moved into Green's week 2
// morning (11/16, 9–11) though he isn't one of Green's recurring customers.
function day(iso) {
  const w = MONDAYS.indexOf(iso);
  if (w < 0) return { jobs: [], teams: [], shifts: [], employees: [] };
  const jobs = [
    { JobInformationId: 1, TeamID: 1, Title: 'North Home - Ann North', Start: at(iso, '09:00'), End: at(iso, '11:00'), FrequencyColor: '#92B558' },
    { JobInformationId: 2, TeamID: 2, Title: 'South Home - Sam South', Start: at(iso, '09:00'), End: at(iso, '11:00'), FrequencyColor: '#005960' },
  ];
  if (w === 1 || w === 3) jobs.push({ JobInformationId: 3, TeamID: 2, Title: 'South Two Home - Sue Two', Start: at(iso, '13:00'), End: at(iso, '15:00'), FrequencyColor: '#578CAC' });
  if (w === 3) jobs.push({ JobInformationId: 4, TeamID: 2, Title: 'South Two Home - Sue Two', Start: at(iso, '15:00'), End: at(iso, '17:00'), FrequencyColor: '#d2691e' });
  if (w === 0 || w === 2) jobs.push({ JobInformationId: 5, TeamID: 3, Title: 'Gil Home - Gil Green', Start: at(iso, '09:00'), End: at(iso, '11:00'), FrequencyColor: '#005960' });
  if (w === 1) jobs.push({ JobInformationId: 6, TeamID: 3, Title: 'Moe Home - Moe Moved', Start: at(iso, '09:00'), End: at(iso, '11:00'), FrequencyColor: '#578CAC' });
  return {
    jobs,
    teams: [{ TeamID: 1, TeamName: 'Blue', Color: '#0063fd' }, { TeamID: 2, TeamName: 'Red', Color: '#c40909' }, { TeamID: 3, TeamName: 'Green', Color: '#00b526' }],
    shifts: [
      { EmployeeID: 1, TeamID: 1, Start: at(iso, '05:00'), End: at(iso, '17:00') }, // early shift: no 5 AM openings
      { EmployeeID: 2, TeamID: 2, Start: at(iso, '08:00'), End: at(iso, '17:00') },
      { EmployeeID: 3, TeamID: 3, Start: at(iso, '08:00'), End: at(iso, '17:00') },
    ],
    employees: [{ EmployeeID: 1, text: 'Bea' }, { EmployeeID: 2, text: 'Rae' }, { EmployeeID: 3, text: 'Gus' }],
  };
}
const KEY = '<ul><li><span class="label" style="background:#92B558;">Every Week</span></li><li><span class="label" style="background:#005960;">Every Two Weeks</span></li><li><span class="label" style="background:#578CAC;">Every Four Weeks</span></li><li><span class="label" style="background:#d2691e;">Single</span></li></ul>';
// Office on the north side (ZIP 99208).
const COMPANY = '<div class="form-group"><label class="control-label">Address 1</label><input value="1 Main St"></div><div class="form-group"><label class="control-label">City</label><input value="Spokane"></div><div class="form-group"><label class="control-label">State</label><input value="WA"></div><div class="form-group"><label class="control-label">Zip</label><input value="99208"></div>';
// The Master Schedule as MaidCentral renders it: Monday blocks; columns 2..5 are Week 1,
// Week 3, Week 2, Week 4 (so paired weeks sit side by side); grid times to the half hour,
// "end" being the last half hour the visit covers.
const block = (teamId, name, color, events) => `<div class="scheduleContainer">
<div class="event event-header stage-head start-730 end-730 l-start-2 l-end-6" style="background-color: ${color}; color: #FFFFFF;"> ${name} | ${events.length} jobs | 8 hrs | <a href="javascript:void(0)" class="conflictModal" data-dayofweek="1" data-teamid="${teamId}">0 conflicts</a> </div>
<div class="event event-header stage-head start-800 end-800">Week 1 - 11/9</div>
<div class="event event-header stage-head start-800 end-800">Week 3 - 11/23</div>
<div class="event event-header stage-head start-800 end-800">Week 2 - 11/16</div>
<div class="event event-header stage-head start-800 end-800">Week 4 - 11/30</div>
${events.map(([id, who, start, end, cols, code]) => `<div onclick="editJobModal(${id});" data-id="${id}" class="pop event start-${start} end-${end} l-start-${cols[0]} l-end-${cols[1]}" style="background-color: #eee; color: #000;">${who} <br /><br />${code} 4.00 hrs</div>`).join('\n')}
${[1, 3, 2, 4].map((w) => `<div class="event event-header stage-head start-1730 end-1730"> 1 | 4 | <a href="javascript:void(0)" class="conflictModal" data-dayofweek="1" data-teamid="${teamId}" data-week="${w}">0</a> </div>`).join('')}
</div>`;
const MASTER = `<html><body>${[
  block(1, 'Blue', '#0063fd', [[1, 'Ann North', 900, 1030, [2, 6], 'E1']]),
  block(2, 'Red', '#c40909', [[2, 'Sam South', 900, 1030, [2, 6], 'E1'], [3, 'Sue Two', 1300, 1430, [4, 6], 'E2']]),
  block(3, 'Green', '#00b526', [[5, 'Gil Green', 900, 1030, [2, 4], 'E2'], [7, 'Kim Skip', 1300, 1430, [3, 4], 'E4']]),
].join('\n')}</body></html>`;
// The Dispatch Board: MaidCentral's own status for each booking. Kim's 11/23 visit is marked
// Skipped; Moe's Wednesday 11/18 visit was moved to Green's Monday 11/16.
const BHEAD = ['Job ID', 'Customer', 'Freq.', 'Scheduled', 'Team', 'Alwd. Hours', 'Bill Rate', 'Status'];
const brow = (id, who, freq, when, team, status) => `<tr>${[id, who, freq, when, team, '4.00', '$200.00', status].map((x) => `<td>${x}</td>`).join('')}</tr>`;
const BOARD = `<table><thead><tr>${BHEAD.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
${brow(70, 'Kim Skip', 'Every Four Weeks', '11/23/2026 1:00 PM - 3:00 PM', 'Green', 'Skipped')}
${brow(60, 'Moe Moved', 'Every Four Weeks', '11/18/2026 9:00 AM - 11:00 AM', 'Green', 'Moved')}
${brow(6, 'Moe Moved', 'Every Four Weeks', '11/16/2026 9:00 AM - 11:00 AM', 'Green', 'Pending')}
</tbody></table>`;
const mc = {
  host: 'test.maidcentral.com',
  async postFormHtml(path) {
    return { '/Report/DispatchBoard': BOARD }[path];
  },
  async getHtml(path) {
    return { '/Report/CustomerEfficiencyMap': CEM, '/Zone': ZONES, '/Job/Schedule': KEY, '/Company/Settings': COMPANY, '/Report/MasterSchedule': MASTER }[path];
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
  // Blue ends near the office (north): free until a couple of minutes before the 4:45 return.
  const blueWeekly = find('Blue', 'Weekly');
  assert.deepEqual(blueWeekly.map((x) => x.label), ['11:00 AM – 4:43 PM']);
  assert.equal(o.returnBy, '4:45 PM');
  assert.ok(o.office.located);
  assert.ok(o.openings.every((x) => x.start >= 8 * 60), 'nothing before 8 AM');
  assert.equal(blueWeekly[0].area.zone, 'north');
  const red2 = find('Red', 'Every 2 weeks');
  // Red ends in the south, ~12 km from the office: it must stop early enough to drive back by 4:45.
  // 1–3 PM is free in weeks 1 & 3 only (Sue has weeks 2 & 4); 11–1 and 3 PM to the drive back are free every week.
  assert.deepEqual(red2.map((x) => [x.label, x.dates]), [['1:00 PM – 3:00 PM', ['2026-11-09', '2026-11-23']]]);
  assert.ok(o.openings.every((x) => x.end <= 16 * 60 + 45), 'nothing ends after 4:45');
  assert.deepEqual(find('Red', 'Weekly').map((x) => x.label), ['11:00 AM – 1:00 PM']);
  assert.equal(red2[0].area.zone, 'south hill');
  // Week 2's 3:00 PM gap is the last of the day: with the drive back it's too short
  // for 1.5 h; with shorter openings allowed it shows as every 4 weeks.
  assert.equal(find('Red', 'Every 4 weeks').length, 0);
  // After 3 PM Red is free every week by the recurring pattern: a weekly spot, even though
  // week 4 has a one-time visit there (that only marks 11/30 as taken).
  const short = await openings(mc, { from: MONDAYS[0], minHours: 1 });
  const late = short.openings.filter((x) => x.team === 'Red' && x.weeks > 0 && x.start >= 15 * 60);
  assert.deepEqual(late.map((x) => [x.fit, x.start, x.firstDate]), [['Weekly', 15 * 60, '2026-11-09']]);
  assert.deepEqual(late[0].takenOn, [{ date: '2026-11-30', by: ['South Two Home - Sue Two'] }]);
  // The 4-week board.
  assert.equal(o.cycle.weeks.length, 4);
  assert.deepEqual(o.cycle.weekdays, ['Monday']);
  const redW2 = o.cycle.teams.find((t) => t.name === 'Red').days['2026-11-16'];
  assert.deepEqual(redW2.jobs.map((j) => j.frequency), ['Weekly', 'Every 2 weeks']);
  assert.equal(o.source, 'master-schedule');
  // Sales view by zone.
  assert.ok(o.zones.find((z) => z.name === 'north').openWeeklyHours > 0);
  assert.equal(o.book.matchedJobs, o.book.totalJobs);
});

test('openings follow the recurring pattern: skips are one-time only, moved bookings don\'t hide recurring spots', async () => {
  const o = await openings(mc, { from: MONDAYS[0], minHours: 1.5 });
  const green = o.openings.filter((x) => x.team === 'Green');
  const overlaps = (x, s, e) => x.start < e && x.end > s;
  // Kim skipped 11/23 (her every-4-weeks week 3): free that day only, as a one-time opening.
  const once = green.filter((x) => x.fit === 'One-time');
  assert.deepEqual(once.map((x) => [x.dates, x.label]), [[['2026-11-23'], '1:00 PM – 3:00 PM']]);
  assert.match(once[0].why, /Kim Skip: skipped \(marked in MaidCentral\)/);
  assert.ok(!green.some((x) => x.weeks > 0 && x.dates.includes('2026-11-23') && overlaps(x, 13 * 60, 15 * 60)), 'Kim\'s slot is not sold as recurring');
  // Moe was moved into the week 2 morning, but Green's weeks 2 & 4 mornings are recurring
  // openings (every 2 weeks); the first visit is the week the spot is really free.
  const morning = green.find((x) => x.fit === 'Every 2 weeks' && x.cycleWeeks.join() === '2,4' && x.start < 11 * 60);
  assert.ok(morning, 'the weeks 2 & 4 morning is an every-2-weeks opening');
  assert.deepEqual(morning.takenOn, [{ date: '2026-11-16', by: ['Moe Home - Moe Moved'] }]);
  assert.equal(morning.firstDate, '2026-11-30');
  // The board: Kim marked skipped on 11/23, Moe as an extra booking on 11/16.
  const g = o.cycle.teams.find((t) => t.name === 'Green');
  assert.deepEqual(g.days['2026-11-23'].jobs.map((j) => [j.title.split(' - ')[0], j.status]), [['Gil Home', 'booked'], ['Kim Home', 'skipped']]);
  assert.deepEqual(g.days['2026-11-16'].jobs.map((j) => [j.title.split(' - ')[0], j.status]), [['Moe Home', 'extra']]);
  // Real statuses from the Dispatch Board.
  assert.equal(o.statuses, 'dispatch-board');
  assert.equal(g.days['2026-11-23'].jobs[1].reason, 'skipped (marked in MaidCentral)');
  assert.equal(g.days['2026-11-16'].jobs[0].reason, 'moved here from Wed, Nov 18');
  // Without the board the app still works, and says it couldn't tell.
  const blind = await openings({ ...mc, host: 'blind.maidcentral.com', postFormHtml: async () => { throw new Error('down'); } }, { from: MONDAYS[0], minHours: 1.5 });
  assert.equal(blind.statuses, 'unavailable');
  assert.equal(blind.cycle.teams.find((t) => t.name === 'Green').days['2026-11-23'].jobs[1].status, 'missing');
  assert.equal(g.days['2026-11-23'].week, 3);
});

test('place a customer: nearby team and matching frequency first', async () => {
  const south = await placeCustomer(mc, { from: MONDAYS[0], zip: '99203', frequency: '2', hours: 2 });
  assert.equal(south.results[0].team, 'Red');
  assert.equal(south.results[0].fit, 'Every 2 weeks');
  assert.ok(south.results[0].extraDriveMin <= 5);
  assert.ok(south.results.every((r) => r.done && r.arrive));
  // Last job of the day in the south: done early enough to drive back by 4:45.
  const last = south.results.find((r) => r.lastOfDay);
  if (last) assert.ok(last.reasons.some((x) => /Back at the office by/.test(x.text)));
  const north = await placeCustomer(mc, { from: MONDAYS[0], zip: '99208', frequency: '1', hours: 2 });
  assert.equal(north.results[0].team, 'Blue');
  assert.ok(north.results.every((r) => r.weeks === 1), 'weekly customers only get weekly openings');
  await assert.rejects(placeCustomer(mc, { from: MONDAYS[0], zip: '00000' }), /ZIP code, an area/);
});

test('place a one-time clean: single dates, no frequency language', async () => {
  const once = await placeCustomer(mc, { from: MONDAYS[0], zip: '99203', frequency: '0', hours: 2 });
  assert.ok(once.results.length > 0);
  assert.ok(once.results.every((r) => r.weeks === 0 && r.fit === 'One-time' && r.dates.length === 1));
  assert.ok(once.results.every((r) => !r.reasons.some((x) => /every|weeks: right/i.test(x.text))));
  assert.equal(new Set(once.results.map((r) => r.id)).size, once.results.length, 'each date listed once');
  assert.equal(once.results[0].team, 'Red');
});

test('distance', () => {
  assert.ok(Math.abs(km(NORTH, SOUTH) - 12.2) < 0.5);
});

test('area names: place names from zone descriptions, duplicates told apart by ZIP', async () => {
  const { areaNames, derive } = await import('../src/areas.js');
  const names = areaNames([
    { name: 'very far east - valley - liberty lake', zips: ['99019'] },
    { name: 'east - valley', zips: ['99206'] },
    { name: 'east - spokane valley', zips: ['99037', '99216'] },
    { name: 'north', zips: ['99208'] },
  ]);
  assert.equal(names.get('very far east - valley - liberty lake').label, 'Liberty Lake');
  assert.equal(names.get('east - valley').label, 'Spokane Valley (99206)');
  assert.equal(names.get('east - spokane valley').label, 'Spokane Valley (99037, 99216)');
  assert.equal(names.get('north').label, 'North Spokane');
  assert.equal(derive('far north - zone - green bluff'), 'Green Bluff');
});

test('openings are cached per person and filtered by length without re-reading MaidCentral', async () => {
  let calls = 0;
  const counting = { ...mc, host: 'count.maidcentral.com', getJson: async (p, q) => (calls++, mc.getJson(p, q)), getHtml: mc.getHtml, postFormHtml: mc.postFormHtml };
  const a = await openings(counting, { from: MONDAYS[0], minHours: 1.5 });
  const after = calls;
  const b = await openings(counting, { from: MONDAYS[0], minHours: 3 });
  assert.equal(calls, after, 'second call served from the cache');
  assert.ok(b.openings.every((x) => x.hours >= 3));
  assert.ok(b.openings.length < a.openings.length);
  const blueMonday = (o) => o.cycle.teams.find((t) => t.name === 'Blue').days['2026-11-09'].open.length;
  assert.ok(blueMonday(b) <= blueMonday(a), 'board filtered too');
});
