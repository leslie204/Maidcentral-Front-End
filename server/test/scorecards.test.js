// Scorecards: parsing MaidCentral's report, stats, follow-ups, themes and insights.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResults, fullNames, analyse, themesOf } from '../src/scorecards.js';

const H = ['Customer', 'Home Name', 'Job Date', 'Sent To', 'Techs', 'Response Date', 'Last Sent', 'Response', 'Response', 'Trend', 'Comments', 'Actions'];
const S = { 4: "4 - We're Thrilled - Great Work", 3: "3 - We're Happy - Good Work", 2: "2 - We've Got a Few Concerns", 1: "1 - We've Got Major Concerns", 0: '0 - We are Considering Another Company' };
const row = (who, date, techs, score, comment = '', trend = '') => `<tr>${[who, `${who.split(' ')[1]} Home`, date, 'x', techs, score == null ? '' : date, date, score == null ? '' : S[score], score == null ? '' : S[score], trend, comment, 'Actions'].map((v) => `<td>${v}</td>`).join('')}</tr>`;
const report = `<table><thead><tr>${H.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
${row('Ann One', '11/2/2026', 'A. Lead, B. Clean', 4, 'Great!')}
${row('Bo Two', '11/3/2026', 'A. Lead, B. Clean', 2, 'Floors were dirty and the shower was missed', 'down')}
${row('Bo Two', '11/10/2026', 'A. Lead, B. Clean', 1, 'Missed the kitchen again')}
${row('Cy Three', '11/4/2026', 'C. Lead, D. Clean', 0)}
${row('Di Four', '11/5/2026', 'C. Lead, D. Clean', null)}
${row('Ed Five', '11/12/2026', 'C. Lead, D. Clean', 3, '', 'up')}
</tbody></table>`;
const directory = { headers: ['Last Name', 'First Name'], rows: [{ cells: ['Lead', 'Alice'] }, { cells: ['Clean', 'Bea'] }, { cells: ['Clean', 'Bob'] }, { cells: ['Lead', 'Carl'] }] };

test('the report: scores, cleaners (full names), comments', () => {
  const rows = parseResults(report);
  assert.equal(rows.length, 6);
  assert.deepEqual([rows[1].score, rows[1].label, rows[1].trend, rows[1].techs], [2, "We've Got a Few Concerns", 'down', ['A. Lead', 'B. Clean']]);
  assert.equal(rows[4].score, null, 'sent, not answered');
  const name = fullNames(directory);
  assert.equal(name('A. Lead'), 'Alice Lead');
  assert.equal(name('C. Lead'), 'Carl Lead');
  assert.equal(name('B. Clean'), 'B. Clean', 'two people match: left as it is');
  assert.equal(name('Z. Nobody'), 'Z. Nobody');
  assert.deepEqual(themesOf('Floors were dirty and the shower was missed'), ['Floors & mopping', 'Bathrooms', 'Missed or not done']);
  assert.deepEqual(themesOf('Thank you, great every time'), []);
});

test('stats, follow-ups, themes and insights for a period', () => {
  const name = fullNames(directory);
  const rows = parseResults(report).map((r) => ({ ...r, techs: r.techs.map(name) }));
  const r = analyse(rows, { from: '2026-11-01', to: '2026-11-30', previous: rows.slice(0, 1) });
  assert.deepEqual([r.now.sent, r.now.responses, r.now.average, r.now.concerns, r.now.atRisk], [6, 5, 2, 3, 1]);
  assert.equal(r.now.responseRate, 83.3);
  // Worst first: considering another company, then repeat concerns.
  assert.deepEqual(r.followUp.map((f) => [f.customer, f.worst, f.lowCount]), [['Cy Three', 0, 1], ['Bo Two', 1, 2]]);
  assert.equal(r.themes[0].theme, 'Missed or not done');
  assert.equal(r.trend.length, 2, 'two weeks');
  assert.ok(r.insights.some((i) => /considering another company/.test(i.text)));
  assert.ok(r.insights.some((i) => /more than once: Bo Two/.test(i.text)));
  assert.ok(r.insights.some((i) => /down 2 from 4/.test(i.text)));
  assert.equal(r.cleaners[0].name, 'Alice Lead');
  assert.equal(r.teams, undefined, 'no team breakdown');
});
