// One place for how fresh MaidCentral data is, and one switch to clear it.
//
// Every module that keeps a per-person copy of MaidCentral data creates its store here,
// so "Refresh" (POST /api/refresh) can clear all of them at once and every screen then
// reads MaidCentral again together, instead of some screens showing older copies.
const stores = new Set();

// A per-person store (keyed by the person's MaidCentral session).
export function perSession() {
  const m = new WeakMap();
  stores.add(m);
  return m;
}

// Clears everything kept for this person.
export function forget(mc) {
  for (const m of stores) m.delete(mc);
}

// How long a copy is used before MaidCentral is read again.
export const FRESH = {
  schedule: 2 * 60_000, // today and future days: jobs, teams, shifts
  past: 6 * 60 * 60_000, // days already gone don't change
  report: 2 * 60_000, // Dispatch Board (prices)
  fourWeeks: 5 * 60_000, // views built from 4 weeks of schedule (openings, optimization)
  fourWeeksMax: 10 * 60_000, // ...shown while a newer one is being built, never older than this
  reference: 60 * 60_000, // customer locations, areas, frequency legend
};
