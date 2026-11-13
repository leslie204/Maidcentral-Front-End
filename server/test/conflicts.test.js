// Double bookings from Dispatch Board rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findConflicts } from '../src/conflicts.js';

const row = (customer, date, time, endTime, team, status = 'Pending', frequency = 'Every Two Weeks') => ({ jobId: customer, customer, date, time, endTime, team, status, frequency });

test('overlapping bookings on one team are found; skipped, moved and other teams are not', () => {
  const rows = [
    row('Danielle Donaldson', '2026-12-09', '1:15 PM', '3:15 PM', 'Orange', 'Pending', 'Every Four Weeks'),
    row('Frances Baker', '2026-12-09', '1:20 PM', '3:20 PM', 'Orange', 'Pending', 'Single'),
    row('Skipped One', '2026-12-09', '1:00 PM', '2:00 PM', 'Orange', 'Skipped'),
    row('Moved One', '2026-12-09', '1:00 PM', '2:00 PM', 'Orange', 'Moved'),
    row('Other Team', '2026-12-09', '1:00 PM', '2:00 PM', 'Blue'),
    row('Later', '2026-12-09', '3:30 PM', '4:30 PM', 'Orange'),
  ];
  const c = findConflicts(rows).filter((x) => x.kind === 'overlap');
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].bookings.map((b) => b.customer), ['Danielle Donaldson', 'Frances Baker']);
  assert.equal(c[0].minutes, 115);
  assert.equal(c[0].full, true);
  assert.equal(c[0].same, true, 'start within 5 minutes of each other');
  assert.equal(c[0].bookings[1].frequency, 'One-time');
});

test('a partial overlap, three-way overlaps and a booking on two teams', () => {
  const rows = [
    row('A', '2026-12-15', '8:45 AM', '11:45 AM', 'Orange'),
    row('B', '2026-12-15', '10:45 AM', '2:45 PM', 'Orange'),
    row('C', '2026-12-15', '1:00 PM', '5:00 PM', 'Orange'),
    row('D', '2026-12-15', '9:00 AM', '10:00 AM', 'Blue, Grey'),
    row('E', '2026-12-15', '9:30 AM', '11:00 AM', 'Grey'),
  ];
  const c = findConflicts(rows).filter((x) => x.kind === 'overlap');
  assert.deepEqual(c.map((x) => `${x.team}:${x.bookings.map((b) => b.customer).join('+')}:${x.minutes}`), ['Grey:D+E:30', 'Orange:A+B:60', 'Orange:B+C:105']);
  assert.equal(c.find((x) => x.team === 'Orange').full, false);
});

test('back to back with no time to drive (real drive times), but not when there is time', () => {
  const rows = [
    row('Mary Childers', '2026-11-17', '12:15 PM', '1:45 PM', 'Black'),
    row('Judy Kaufman', '2026-11-17', '1:45 PM', '3:15 PM', 'Black'),
    row('Near', '2026-11-17', '3:30 PM', '4:30 PM', 'Black'),
  ];
  const drive = (a, b) => (b.customer === 'Judy Kaufman' ? 14 : 10);
  const c = findConflicts(rows, { drive });
  assert.deepEqual(c.map((x) => `${x.kind}:${x.bookings[1].customer}:gap ${x.gap}:drive ${x.drive}`), ['tight:Judy Kaufman:gap 0:drive 14']);
  // Unknown drive time: nothing reported.
  assert.equal(findConflicts(rows).length, 0);
});
