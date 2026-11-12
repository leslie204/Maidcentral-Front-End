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

// A per-person cache of reads, keyed by name. One request per key is ever in flight: a
// second caller asking for the same thing while it loads waits for that request instead of
// sending MaidCentral another (screens, the background refresh and other features often
// want the same report at the same moment). Returns cached(mc, key, ttl, fn).
export function keyed({ max = 800 } = {}) {
  const store = perSession();
  return function cached(mc, key, ttl, fn) {
    if (!store.has(mc)) store.set(mc, new Map());
    const m = store.get(mc);
    const hit = m.get(key);
    if (hit?.pending) return hit.pending;
    if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value);
    const pending = Promise.resolve()
      .then(fn)
      .then(
        (value) => {
          m.delete(key); // re-insert: the map stays ordered oldest read first
          m.set(key, { at: Date.now(), ttl, value });
          if (m.size > max) {
            for (const [k, v] of m) if (!v.pending && Date.now() - v.at >= v.ttl) m.delete(k);
            for (const k of m.keys()) {
              if (m.size <= max) break;
              if (!m.get(k).pending) m.delete(k);
            }
          }
          return value;
        },
        (e) => {
          m.delete(key);
          throw e;
        },
      );
    m.set(key, { pending });
    return pending;
  };
}

// How long a copy is used before MaidCentral is read again.
export const FRESH = {
  schedule: 2 * 60_000, // today and future days: jobs, teams, shifts
  past: 6 * 60 * 60_000, // days already gone don't change
  report: 2 * 60_000, // Dispatch Board (prices)
  fourWeeks: 5 * 60_000, // views built from 4 weeks of schedule (openings, optimization)
  fourWeeksMax: 10 * 60_000, // ...shown while a newer one is being built, never older than this
  farAhead: 30 * 60_000, // bookings more than 4 weeks out (only checked for later clashes)
  reference: 60 * 60_000, // customer locations, areas, frequency legend
};
