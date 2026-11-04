// One switch clears every kept copy for a person; nothing else is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perSession, forget, FRESH } from '../src/cache.js';

test('forget clears every store for that person only', () => {
  const a = perSession();
  const b = perSession();
  const me = {};
  const other = {};
  a.set(me, 1);
  b.set(me, 2);
  a.set(other, 3);
  forget(me);
  assert.equal(a.has(me), false);
  assert.equal(b.has(me), false);
  assert.equal(a.get(other), 3);
});

test('schedule data is never kept long', () => {
  assert.ok(FRESH.schedule <= 2 * 60_000);
  assert.ok(FRESH.fourWeeksMax <= 10 * 60_000);
  assert.ok(FRESH.report <= 2 * 60_000);
});
