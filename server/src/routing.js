// Road drive times from Google's Routes API (Compute Route Matrix), for the few legs where
// an exact number matters (the reschedule options the office is shown). Everything else
// uses the calibrated estimate in territory.js (driveMin).
//
// Off unless GOOGLE_MAPS_API_KEY is set. Times are traffic-unaware (the "Essentials"
// tier) and cached in memory (roads don't move), so the same leg is never paid for twice
// while the server runs. A monthly element budget (ROUTING_MONTHLY_LIMIT, default 9000,
// inside Google's free monthly allowance) stops calls once spent; the app then falls back
// to the estimate. ROUTING=off turns it off (tests).

const URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const cache = new Map(); // "lat,lng>lat,lng" -> minutes (null = no route)
const MAX_CACHE = 50_000;
let budget = { month: null, used: 0 };

const key = () => process.env.GOOGLE_MAPS_API_KEY;
export const routingOn = () => Boolean(key()) && process.env.ROUTING !== 'off';
const pt = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
export const legKey = (a, b) => `${pt(a)}>${pt(b)}`;
const waypoint = (p) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });

function spend(n) {
  const month = new Date().toISOString().slice(0, 7);
  if (budget.month !== month) budget = { month, used: 0 };
  const limit = Number(process.env.ROUTING_MONTHLY_LIMIT) || 9000;
  if (budget.used + n > limit) return false;
  budget.used += n;
  return true;
}

export function routingStatus() {
  const month = new Date().toISOString().slice(0, 7);
  return { on: routingOn(), usedThisMonth: budget.month === month ? budget.used : 0, limit: Number(process.env.ROUTING_MONTHLY_LIMIT) || 9000, cached: cache.size };
}

// One origin to many destinations: the elements asked for are exactly the legs needed.
async function fromOne(origin, dests) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,condition' },
    body: JSON.stringify({ origins: [waypoint(origin)], destinations: dests.map(waypoint), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Routes API ${r.status}`);
  const rows = await r.json();
  for (const e of Array.isArray(rows) ? rows : []) {
    const d = dests[e.destinationIndex ?? 0];
    if (!d) continue;
    const secs = parseFloat(String(e.duration || '').replace(/s$/, ''));
    cache.set(legKey(origin, d), e.condition === 'ROUTE_EXISTS' && Number.isFinite(secs) ? Math.round(secs / 60) : null);
  }
  if (cache.size > MAX_CACHE) for (const k of [...cache.keys()].slice(0, cache.size - MAX_CACHE)) cache.delete(k);
  return true;
}

// Road minutes for a list of [from, to] legs (points { lat, lng }). Returns a function
// (a, b) -> minutes, or null for a leg it couldn't get (the caller uses its estimate).
// Never throws: on any trouble the app keeps working on estimates.
export async function roadTimes(legs, fetchImpl) {
  const lookup = (a, b) => {
    if (!a || !b) return null;
    if (pt(a) === pt(b)) return 0;
    const v = cache.get(legKey(a, b));
    return v === undefined ? null : v;
  };
  if (!routingOn()) return { get: lookup, exact: false };
  const want = new Map(); // origin key -> { origin, dests: Map }
  for (const [a, b] of legs) {
    if (!a || !b || pt(a) === pt(b) || cache.has(legKey(a, b))) continue;
    const o = pt(a);
    if (!want.has(o)) want.set(o, { origin: a, dests: new Map() });
    want.get(o).dests.set(pt(b), b);
  }
  const jobs = [...want.values()].flatMap(({ origin, dests }) => {
    const list = [...dests.values()];
    const out = [];
    for (let i = 0; i < list.length; i += 25) out.push([origin, list.slice(i, i + 25)]);
    return out;
  });
  let ok = true;
  const run = fetchImpl ? (o, d) => fetchImpl(o, d, cache, legKey) : fromOne;
  try {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (next < jobs.length) {
        const [o, d] = jobs[next++];
        if (!spend(d.length) || !(await run(o, d))) ok = false;
      }
    }));
  } catch {
    ok = false;
  }
  return { get: lookup, exact: ok };
}

// Tests.
export function _resetRouting() {
  cache.clear();
  budget = { month: null, used: 0 };
}
