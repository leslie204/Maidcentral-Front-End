// Road drive times from our own routing service (osrm/: OSRM on OpenStreetMap roads for the
// Spokane area), reached over Railway's private network at OSRM_URL. No API key and no
// per-query cost, so every screen uses it.
//
// The homes don't move, so the app learns the drive time between every pair of places it
// knows (all homes and the office) in a few table requests, keeps them in memory, and
// adds new places (a new customer, a ZIP being placed) as they appear. Lookups are then
// instant and synchronous: road(a, b) -> { min, km } or null when unknown, in which case
// callers use the distance estimate (territory.js driveMin). If the service is down the
// app keeps working on estimates and tries again a couple of minutes later.
//
// OSRM gives free-flow times, a little quicker than real driving in town; minutes are
// scaled by ROAD_FACTOR (default 1.1) plus ROAD_STOP_MIN (default 2) to park and unload.

const cache = new Map(); // "lat,lng>lat,lng" -> { min, km }
const known = new Map(); // point key -> point; every pair among these is in the cache
const CHUNK = 100; // points per side of a table request
let failedAt = 0;
let queue = Promise.resolve();

const baseUrl = () => String(process.env.OSRM_URL || '').replace(/\/+$/, '');
export const routingOn = () => Boolean(baseUrl()) && process.env.ROUTING !== 'off';
const pt = (p) => `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;
const legKey = (a, b) => `${pt(a)}>${pt(b)}`;
const valid = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && (p.lat || p.lng);
const factor = () => Number(process.env.ROAD_FACTOR) || 1.1;
const stopMin = () => (process.env.ROAD_STOP_MIN != null ? Number(process.env.ROAD_STOP_MIN) : 2);

// Road time and distance between two places, if known.
export function road(a, b) {
  if (!valid(a) || !valid(b)) return null;
  if (pt(a) === pt(b)) return { min: 0, km: 0 };
  return cache.get(legKey(a, b)) || null;
}

async function table(points, fetchImpl) {
  const coords = points.map((p) => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(';');
  const url = `${baseUrl()}/table/v1/driving/${coords}?annotations=duration,distance`;
  const r = await (fetchImpl || fetch)(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`routing ${r.status}`);
  const j = await r.json();
  if (j.code !== 'Ok') throw new Error(`routing ${j.code}`);
  points.forEach((a, i) => points.forEach((b, k) => {
    if (i === k) return;
    const secs = j.durations?.[i]?.[k];
    const metres = j.distances?.[i]?.[k];
    if (secs == null) return; // no road between them (shouldn't happen in one region)
    cache.set(legKey(a, b), { min: Math.round((secs / 60) * factor() + (metres > 50 ? stopMin() : 0)), km: Math.round((metres || 0) / 100) / 10 });
  }));
}

// Make sure the drive time between every pair of these places (and every place already
// known) is cached. Cheap when nothing is new. Never throws.
export function learn(places, { fetchImpl } = {}) {
  if (!routingOn()) return Promise.resolve(false);
  queue = queue.then(async () => {
    const fresh = new Map();
    for (const p of places || []) if (valid(p) && !known.has(pt(p))) fresh.set(pt(p), { lat: Number(p.lat), lng: Number(p.lng) });
    if (!fresh.size) return true;
    if (Date.now() - failedAt < 120_000) return false;
    const old = [...known.values()];
    const add = [...fresh.values()];
    const chunks = (list) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));
    const newChunks = chunks(add);
    // New with new (each pair of new chunks), then new with every old chunk.
    const jobs = [];
    newChunks.forEach((a, i) => newChunks.slice(i).forEach((b, k) => jobs.push(k === 0 ? a : [...a, ...b])));
    for (const a of newChunks) for (const b of chunks(old)) jobs.push([...a, ...b]);
    // A table needs two places at least (a single new place is covered by its old chunks).
    for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].length < 2) jobs.splice(i, 1);
    try {
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, async () => {
        while (next < jobs.length) await table(jobs[next++], fetchImpl);
      }));
      for (const [k, p] of fresh) known.set(k, p);
      return true;
    } catch (e) {
      failedAt = Date.now();
      console.warn(`Road routing unavailable, using estimates: ${e.message}`);
      return false;
    }
  });
  return queue;
}

export function routingStatus() {
  return { on: routingOn(), places: known.size, legs: cache.size, lastFailure: failedAt ? new Date(failedAt).toISOString() : null };
}

// Tests.
export function _resetRouting() {
  cache.clear();
  known.clear();
  failedAt = 0;
  queue = Promise.resolve();
}
