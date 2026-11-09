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

// Address search for placing a new customer: the US Census geocoder (exact US street
// addresses) and Photon (OpenStreetMap search, for suggestions while typing), both free and
// keyless, limited to the Spokane area. Returns up to 6 { label, lat, lng, zip, source }.
const SPOKANE = { lat: 47.66, lng: -117.42, bbox: '-118.3,47.1,-116.8,48.4' };
const inArea = (p) => p && Math.abs(p.lat - 47.7) < 0.9 && Math.abs(p.lng + 117.4) < 1.1;
const titleCase = (x) => String(x).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Wa|Id|Ne|Nw|Se|Sw|N|S|E|W)\b/g, (c) => c.toUpperCase());
const searches = new Map();

async function censusSearch(q) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${new URLSearchParams({ address: q, benchmark: 'Public_AR_Current', format: 'json' })}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const ms = (await r.json())?.result?.addressMatches || [];
  return ms.map((m) => {
    const c = m.addressComponents || {};
    const [street, city] = String(m.matchedAddress || '').split(',').map((x) => x.trim());
    return { label: `${titleCase(street)}, ${titleCase(city || c.city || '')}, WA ${c.zip || ''}`.trim(), lat: m.coordinates?.y, lng: m.coordinates?.x, zip: c.zip || null, source: 'census' };
  });
}

async function photonSearch(q) {
  const url = `https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: '6', lang: 'en', lat: String(SPOKANE.lat), lon: String(SPOKANE.lng), bbox: SPOKANE.bbox })}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'CleanBee-Scheduler/1.0' }, signal: AbortSignal.timeout(6000) });
  const fs = (await r.json())?.features || [];
  return fs.map((f) => {
    const p = f.properties || {};
    const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
    return { label: [street, p.city || p.district || p.county, `${p.state === 'Washington' ? 'WA' : p.state || ''} ${p.postcode || ''}`.trim()].filter(Boolean).join(', '), lat: f.geometry?.coordinates?.[1], lng: f.geometry?.coordinates?.[0], zip: p.postcode || null, source: 'map', house: Boolean(p.housenumber) };
  });
}

export async function searchAddress(text) {
  const q = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 150);
  if (q.length < 5 || process.env.GEOCODE === 'off') return { query: q, results: [] };
  const key = q.toLowerCase();
  if (searches.has(key)) return searches.get(key);
  // Most people type "1234 W Main Ave": add the city so the Census search can match it.
  const withCity = /spokane|valley|cheney|mead|deer park|liberty lake|medical lake|airway|nine mile|colbert|nine mile|rockford|\bwa\b|washington|\b99\d{3}\b/i.test(q) ? q : `${q}, Spokane, WA`;
  const [census, photon] = await Promise.all([censusSearch(withCity).catch(() => []), photonSearch(q).catch(() => [])]);
  const out = [];
  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.0008 && Math.abs(a.lng - b.lng) < 0.0011;
  for (const x of [...census, ...photon.filter((p) => p.house), ...photon.filter((p) => !p.house)]) {
    if (!Number.isFinite(x.lat) || !Number.isFinite(x.lng) || !inArea(x)) continue;
    if (out.some((y) => near(x, y) || y.label.toLowerCase() === x.label.toLowerCase())) continue;
    out.push(x);
  }
  const res = { query: q, results: out.slice(0, 6) };
  if (out.length) {
    searches.set(key, res);
    if (searches.size > 300) searches.delete(searches.keys().next().value);
  }
  return res;
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
