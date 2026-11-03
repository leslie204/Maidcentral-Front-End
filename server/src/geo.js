// Address lookup (US Census geocoder: public, free, no key). Used for the office and for
// placing a new customer by street address. Results are kept in memory; GEOCODE=off (or
// OFFICE_GEOCODE=off) turns lookups off (tests, offline).
const memo = new Map();

export async function geocode(text) {
  const q = String(text || '').replace(/\s+/g, ' ').trim();
  if (!q) return null;
  if (process.env.GEOCODE === 'off' || process.env.OFFICE_GEOCODE === 'off') return null;
  const key = q.toLowerCase();
  if (memo.has(key)) return memo.get(key);
  let hit = null;
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${new URLSearchParams({ address: q, benchmark: 'Public_AR_Current', format: 'json' })}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const m = (await r.json())?.result?.addressMatches?.[0];
    if (m?.coordinates?.x && m?.coordinates?.y) hit = { lat: m.coordinates.y, lng: m.coordinates.x, matched: m.matchedAddress || q, zip: m.addressComponents?.zip || null };
  } catch {
    return null; // network trouble: don't remember the miss
  }
  memo.set(key, hit);
  if (memo.size > 500) memo.delete(memo.keys().next().value);
  return hit;
}

// Today's date where the business is (TENANT_TZ, default America/Los_Angeles), so the
// server's "this Monday" matches the office's.
export function localToday(tz = process.env.TENANT_TZ || 'America/Los_Angeles') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function mondayOf(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
