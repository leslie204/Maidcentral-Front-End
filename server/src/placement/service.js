// The placement contract for Clean Bee (contracts/placement/openapi.yaml, docs/placement.md):
// price a visit, find open times with this app's own openings engine (territory.js: the
// recurring pattern, drive times, team areas, a live re-check in MaidCentral), and hold a time
// while the rep books it. MaidCentral stays read-only: bookings are "manual" for now (the rep
// books the held time in MaidCentral and marks the lead booked in the Hub).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { placeCustomer as realPlace, searchHomes as realHomes, zones as realZones } from '../territory.js';
import { geocode as realGeocode, searchAddress as realPlaces, localToday } from '../geo.js';
import { areaNames, areaKey } from '../areas.js';

export const CONTRACT_VERSION = '1.3.0';
const QUOTE_MS = 2 * 60 * 60 * 1000; // a quote is good for 2 hours
const HOLD_MS = 15 * 60 * 1000; // long enough to book it in MaidCentral by hand
const SPOKANE = { lat: 47.66, lng: -117.42 };

export class PlacementError extends Error {
  constructor(status, code, message, { retryable = false, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

// Contract frequency -> the openings engine's (weeks between visits; 0 = one time).
const WEEKS = { one_time: 0, weekly: 1, biweekly: 2, every_4_weeks: 4, monthly: 4 };
// "Every other Tuesday": the pattern, for the rep (the slot's own times give the date and hours).
const PATTERN = { 1: (wd) => `Every ${wd}`, 2: (wd) => `Every other ${wd}`, 4: (wd) => `Every 4th ${wd}` };
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const unb64 = (t) => {
  try {
    return JSON.parse(Buffer.from(String(t), 'base64url').toString());
  } catch {
    return null;
  }
};

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

/** "2026-12-01", 540 minutes, "America/Los_Angeles" -> "2026-12-01T09:00:00-08:00". */
export function zoned(day, minutes, tz) {
  const [y, mo, d] = day.split('-').map(Number);
  const h = Math.floor(minutes / 60);
  const mi = minutes % 60;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
    const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  };
  // The offset at the local time itself (twice, so a time near a DST change settles).
  let off = offsetAt(guess - offsetAt(guess) * 60_000);
  off = offsetAt(guess - off * 60_000);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  const pad = (n) => String(n).padStart(2, '0');
  return `${day}T${pad(h)}:${pad(mi)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * @param {object} o
 * @param {object} o.store      quotes and holds (placement/store.js)
 * @param {object} o.hubUser    the Hub's MaidCentral user (placement/hub-user.js)
 * @param {object} o.config     { brand, timezone, currency, rateRecurring, rateOneTime (dollars per hour on site), signingKey }
 */
export function createPlacement({ store, hubUser, config, place = realPlace, geocode = realGeocode, places = realPlaces, homes = realHomes, zonesOf = realZones, now = () => Date.now(), today = () => localToday(config.timezone) }) {
  const { brand, timezone, currency } = config;
  const key = config.signingKey;

  // Slot tokens carry what the slot is (signed, so a caller can't make one up).
  const sign = (payload) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
  };
  const unsign = (token) => {
    const [body, mac] = String(token || '').split('.');
    if (!body || !mac) return null;
    const want = createHmac('sha256', key).update(body).digest();
    const got = Buffer.from(mac, 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString());
    } catch {
      return null;
    }
  };

  const money = (dollars) => ({ amount_cents: Math.round(dollars * 100), currency });
  const checkBrand = (b) => {
    if (b !== brand) throw new PlacementError(422, 'brand_not_served', `This app places ${brand} customers only.`);
  };

  // MaidCentral errors as contract errors.
  const fromMc = (e) => {
    if (e instanceof PlacementError) return e;
    if (e?.code === 'hub_user' || e?.code === 'expired') return new PlacementError(503, 'platform_unavailable', e.message, { retryable: true });
    if (e?.code === 'input') return new PlacementError(400, 'invalid_request', e.message);
    return new PlacementError(502, 'platform_unavailable', 'MaidCentral didn’t answer. Try again in a moment.', { retryable: true });
  };

  async function health() {
    const st = hubUser.status();
    const ok = st.state === 'signed_in';
    return {
      status: ok ? 'ok' : 'down',
      platform: 'maidcentral',
      contract_version: CONTRACT_VERSION,
      brands: [brand],
      capabilities: { holds: 'local', bookings: 'manual', locations: ['address', 'zip', 'area', 'home'], ranked: true, filters: ['days', 'part', 'max_extra_drive', 'before'] },
      checked_at: new Date(now()).toISOString(),
      ...(ok ? {} : { message: st.state === 'code' ? 'The Hub user is waiting for a MaidCentral code (Clean Bee app → Sales Hub connection).' : 'The Hub user is signed out of MaidCentral (Clean Bee app → Sales Hub connection).' }),
    };
  }

  // Clean Bee's areas: MaidCentral's zones with their place names and ZIP codes.
  async function areas() {
    try {
      const zs = await hubUser.use((mc) => zonesOf(mc));
      const names = areaNames(zs);
      return zs.map((z) => ({ code: z.name, name: names.get(areaKey(z.name))?.label || z.name, ...(z.color ? { color: z.color } : {}), zips: [...new Set(z.zips)] }));
    } catch (e) {
      throw fromMc(e);
    }
  }

  async function catalog(b) {
    checkBrand(b);
    const list = await areas().catch(() => []);
    return {
      areas: list,
      brand,
      currency,
      timezone,
      frequencies: ['one_time', 'weekly', 'biweekly', 'every_4_weeks'],
      services: [{
        code: 'standard',
        name: 'House cleaning',
        description: `A two-person team, priced by the hour on site: $${config.rateRecurring}/hr for regular cleans, $${config.rateOneTime}/hr for a one-time clean.`,
        hourly: { min_minutes: 60, max_minutes: 480, step_minutes: 30 },
        home_fields: [
          { key: 'bedrooms', label: 'Bedrooms', required: false, min: 0, max: 10 },
          { key: 'bathrooms', label: 'Bathrooms', required: false, min: 0, max: 10 },
        ],
        extras: [],
      }],
    };
  }

  // Address suggestions while the rep types (US Census + the street map), Spokane area only.
  async function searchPlaces(b, q) {
    checkBrand(b);
    const r = await places(q).catch(() => ({ results: [] }));
    return { places: (r.results || []).slice(0, 10).map((x) => ({ label: x.label, lat: x.lat, lng: x.lng, ...(x.zip ? { zip: String(x.zip) } : {}) })) };
  }

  // Existing customers' homes by name, past or present (MaidCentral's own search).
  async function searchHomes(b, q) {
    checkBrand(b);
    let r;
    try {
      r = await hubUser.use((mc) => homes(mc, q));
    } catch (e) {
      throw fromMc(e);
    }
    const names = areaNames((await areas().catch(() => [])).map((a) => ({ name: a.code })));
    return {
      homes: (r.homes || []).map((h) => ({
        home_ref: b64({ n: h.home || '', c: h.customer || '', s: h.street || '', ci: h.city || '', z: h.zip || '' }),
        customer: h.customer || '',
        ...(h.home ? { home: h.home } : {}),
        ...(h.address ? { address: h.address } : {}),
        ...(h.zip ? { zip: String(h.zip) } : {}),
        ...(h.zone ? { area: names.get(areaKey(h.zone))?.label || h.zone } : {}),
        ...(h.zoneColor ? { area_color: h.zoneColor } : {}),
        regular: Boolean(h.recurring),
      })),
    };
  }

  // Where the customer is, as the rep picked it (contract 1.3 `place`).
  async function fromPlace(p) {
    if (p.kind === 'point') {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) throw new PlacementError(400, 'invalid_request', 'A picked address needs lat and lng.');
      return { kind: 'point', lat: p.lat, lng: p.lng, label: String(p.label || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`).slice(0, 120), exact: true };
    }
    if (p.kind === 'zip') {
      const zip = String(p.zip || '').trim().slice(0, 5);
      if (!/^\d{5}$/.test(zip)) throw new PlacementError(400, 'invalid_request', 'A ZIP code has 5 digits.');
      const list = await areas();
      if (!list.some((a) => (a.zips || []).includes(zip))) return { notServed: `Clean Bee doesn’t serve ZIP ${zip}.` };
      return { kind: 'zip', zip, label: `ZIP ${zip}` };
    }
    if (p.kind === 'area') {
      const a = (await areas()).find((x) => x.code === p.area);
      if (!a) throw new PlacementError(400, 'invalid_request', 'Choose one of the catalog’s areas.');
      return { kind: 'zone', zone: a.code, label: a.name };
    }
    if (p.kind === 'home') {
      const h = unb64(p.home_ref);
      if (!h || typeof h.c !== 'string') throw new PlacementError(400, 'invalid_request', 'Pick the home from the list (home_ref).');
      return { kind: 'home', home: { homeName: h.n, homeCustomer: h.c, homeStreet: h.s, homeCity: h.ci, homeZip: h.z }, label: [h.c, h.n].filter(Boolean).join(', ') };
    }
    throw new PlacementError(400, 'invalid_request', 'Unknown place kind.');
  }

  // Where the home is: the street address (US Census), or the middle of its ZIP's homes.
  async function locate(address) {
    const one = [address.line1, address.line2, address.city, address.region, address.postal_code].filter(Boolean).join(', ');
    const g = await geocode(one).catch(() => null);
    if (g) return { lat: g.lat, lng: g.lng, label: g.matched || one, exact: true };
    return { zip: String(address.postal_code).trim().slice(0, 5), label: `${address.line1}, ${address.city} (near ZIP ${String(address.postal_code).trim().slice(0, 5)})`, exact: false };
  }

  async function quote(req, caller) {
    checkBrand(req.brand);
    if (req.service_code !== 'standard') return { brand, serviceable: false, not_serviceable_reason: 'service_not_offered', message: 'Clean Bee sells house cleaning by the hour (service "standard").' };
    if (!(req.frequency in WEEKS)) throw new PlacementError(400, 'invalid_request', 'Unknown frequency.');
    const minutes = Number(req.minutes);
    if (!Number.isInteger(minutes) || minutes < 60 || minutes > 480 || minutes % 30) throw new PlacementError(400, 'invalid_request', 'Choose how long the team will be there: 1 to 8 hours, in half hours (minutes).');
    let where;
    if (req.place) {
      where = await fromPlace(req.place);
      if (where.notServed) return { brand, serviceable: false, not_serviceable_reason: 'outside_service_area', message: where.notServed };
    } else {
      if (req.address.country !== 'US') return { brand, serviceable: false, not_serviceable_reason: 'outside_service_area', message: 'Clean Bee serves the Spokane area only.' };
      where = await locate(req.address);
    }
    if (where.exact && (Math.abs(where.lat - SPOKANE.lat) > 1.5 || Math.abs(where.lng - SPOKANE.lng) > 1.5)) {
      return { brand, serviceable: false, not_serviceable_reason: 'outside_service_area', message: `${where.label} is outside the Spokane area Clean Bee serves.` };
    }
    const hours = minutes / 60;
    const oneTime = req.frequency === 'one_time';
    const rate = oneTime ? config.rateOneTime : config.rateRecurring;
    const visit = money(rate * hours);
    const id = `q_${randomBytes(9).toString('base64url')}`;
    const expiresAt = now() + QUOTE_MS;
    const data = { frequency: req.frequency, weeks: WEEKS[req.frequency], minutes, where, address: req.address || null, home: req.home || null, lead_ref: req.lead_ref || null, price: visit };
    await store.saveQuote({ id, caller, data, expiresAt });
    const hoursWords = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    return {
      brand,
      serviceable: true,
      quote_id: id,
      expires_at: new Date(expiresAt).toISOString(),
      duration_minutes: minutes,
      service_area: where.label,
      ...(where.exact || req.place ? {} : { message: 'The address wasn’t found on the map: times are placed near its ZIP code. Check the address with the customer.' }),
      price: {
        first_visit: visit,
        ...(oneTime ? {} : { recurring_visit: visit }),
        lines: [{ label: `${hoursWords} on site, two-person team, at $${rate}/hr${oneTime ? ' (one-time rate)' : ''}`, amount: visit }],
        taxes_included: false,
      },
    };
  }

  async function loadQuote(id) {
    const q = await store.getQuote(id);
    if (!q) throw new PlacementError(404, 'quote_not_found', 'That quote wasn’t found. Get a new price.');
    if (q.expiresAt <= now()) throw new PlacementError(410, 'quote_expired', 'That quote has expired. Get a new price.');
    return q;
  }

  // The openings engine's suggestions for a quote, best first.
  async function suggestions(q, f = {}) {
    const d = q.data;
    const params = { frequency: String(d.weeks), hours: d.minutes / 60 };
    const w = d.where;
    if (w.kind === 'zone') params.zone = w.zone;
    else if (w.kind === 'home') Object.assign(params, w.home);
    else if (w.exact) Object.assign(params, { lat: w.lat, lng: w.lng, address: w.label });
    else params.zip = w.zip;
    if (f.days) params.days = f.days;
    if (f.part && f.part !== 'any') params.part = f.part;
    if (f.maxDrive) params.maxDrive = f.maxDrive;
    if (f.before && d.weeks === 0) params.before = f.before;
    try {
      return await hubUser.use((mc) => place(mc, params));
    } catch (e) {
      throw fromMc(e);
    }
  }

  // The visit date for an opening within [from, to]: one-time openings have their date; a
  // recurring spot starts on its first free date and repeats every `weeks` weeks.
  const dateIn = (x, from, to, weeks) => {
    if (weeks === 0) return x.dates?.[0] >= from && x.dates[0] <= to ? x.dates[0] : null;
    if (!x.firstDate) return null;
    const taken = new Set((x.takenOn || []).map((t) => t.date));
    for (let k = 0; k < 26; k++) {
      const d = addDays(x.firstDate, k * 7 * weeks);
      if (d > to) return null;
      if (d >= from && d > today() && !taken.has(d)) return d;
    }
    return null;
  };

  const overlaps = (h, s) => h.openingId === s.o || (h.teamId === String(s.t) && h.day === s.d && h.startMin < s.e && h.endMin > s.s);

  function toSlot(s) {
    const x = s.x || {};
    return {
      slot_token: sign(s),
      start: zoned(s.d, s.s, timezone),
      end: zoned(s.d, s.e, timezone),
      team: { id: String(s.t), name: s.n, ...(x.color ? { color: x.color } : {}) },
      notes: s.notes,
      ...(x.rank ? { rank: x.rank } : {}),
      ...(s.w ? { pattern: { weeks: s.w, weekday: weekdayOf(s.d), label: PATTERN[s.w](weekdayOf(s.d)) } } : {}),
      first_visit: s.d,
      ...(x.next ? { next_visit: x.next } : {}),
      ...(x.area ? { area: x.area } : {}),
      ...(Number.isFinite(x.extra) ? { extra_drive_minutes: Math.max(0, Math.round(x.extra)) } : {}),
      reasons: x.reasons || [],
      ...(x.route ? { route: x.route } : {}),
    };
  }

  // Filters from the query (contract 1.3): weekdays, time of day, extra driving, one-time before a date.
  const filtersOf = ({ days, part, max_extra_drive: maxDrive, before }) => {
    const f = {};
    if (days) {
      const list = String(days).split(',').map((d) => d.trim()).filter(Boolean);
      const bad = list.filter((d) => !WEEKDAYS.includes(d));
      if (bad.length) throw new PlacementError(400, 'invalid_request', `Unknown weekday: ${bad.join(', ')}.`);
      if (list.length) f.days = list.join(',');
    }
    if (part && part !== 'any') {
      if (!['morning', 'afternoon'].includes(part)) throw new PlacementError(400, 'invalid_request', 'part is any, morning or afternoon.');
      f.part = part;
    }
    if (maxDrive !== undefined && maxDrive !== '') {
      const n = Number(maxDrive);
      if (!Number.isInteger(n) || n < 1 || n > 240) throw new PlacementError(400, 'invalid_request', 'max_extra_drive is 1 to 240 minutes.');
      f.maxDrive = n;
    }
    if (before) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) throw new PlacementError(400, 'invalid_request', 'before is a date (YYYY-MM-DD).');
      f.before = before;
    }
    return f;
  };
  const tone = (t) => (t === 'good' || t === 'warn' ? t : 'neutral');

  async function availability({ quote_id: quoteId, from, to, limit = 50, ...query }) {
    if (to < from) throw new PlacementError(400, 'invalid_request', '`to` is before `from`.');
    if ((Date.parse(to) - Date.parse(from)) / DAY_MS > 92) throw new PlacementError(400, 'invalid_request', 'Ask for at most 92 days at a time.');
    const f = filtersOf(query);
    const q = await loadQuote(quoteId);
    const weeks = q.data.weeks;
    const result = await suggestions(q, f);
    const held = await store.openHolds(now());
    const slots = [];
    let rank = 0;
    for (const x of result.results || []) {
      const d = dateIn(x, from, to, weeks);
      if (!d) continue;
      const taken = new Set((x.takenOn || []).map((t) => t.date));
      let next = null;
      if (weeks) for (let k = 1; k < 8 && !next; k++) { const n = addDays(d, k * 7 * weeks); if (!taken.has(n)) next = n; }
      const reasons = (x.reasons || []).map((r) => (typeof r === 'string' ? { text: r, tone: 'neutral' } : { text: String(r.text || ''), tone: tone(r.tone) })).filter((r) => r.text);
      const s = {
        q: q.id, o: x.id, t: x.teamId, n: x.team, d, s: x.arriveMin, e: x.doneMin, w: weeks, f,
        notes: [weeks ? PATTERN[weeks](weekdayOf(d)) : 'One time', ...reasons.map((r) => r.text)].slice(0, 6),
        x: {
          rank: 0,
          next,
          color: x.color || null,
          area: x.area?.name ? { name: String(x.area.name), ...(x.area.zip ? { zip: String(x.area.zip) } : {}) } : null,
          extra: x.extraDriveMin,
          reasons,
          route: x.route ? { from: String(x.route.from), from_minutes: Math.max(0, Math.round(x.route.fromMin)), to: String(x.route.to), to_minutes: Math.max(0, Math.round(x.route.toMin)) } : null,
        },
      };
      if (held.some((h) => overlaps(h, s))) continue;
      s.x.rank = ++rank;
      slots.push(s);
      if (slots.length >= limit) break;
    }
    return {
      quote_id: q.id,
      timezone,
      slots: slots.map(toSlot),
      generated_at: new Date(now()).toISOString(),
      ...(result.target?.label ? { target_label: String(result.target.label) } : {}),
      ...(result.checkedLive ? { checked_live_at: new Date(result.checkedLive).toISOString() } : {}),
      ...(result.returnBy ? { return_by: String(result.returnBy) } : {}),
      ...(result.lookahead?.until ? { lookahead_until: String(result.lookahead.until).slice(0, 10) } : {}),
      just_booked: (result.justBooked || []).map((j) => ({ label: `${j.team} ${j.date} ${j.label}` })),
    };
  }

  // One hold at a time, so two reps can't both get the same time.
  let queue = Promise.resolve();
  const serial = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  async function hold(req) {
    const s = unsign(req.slot_token);
    if (!s) throw new PlacementError(400, 'invalid_request', 'That slot isn’t one this app offered.');
    const q = await loadQuote(s.q);
    return serial(async () => {
      const held = await store.openHolds(now());
      if (held.some((h) => overlaps(h, s))) throw new PlacementError(409, 'slot_unavailable', 'Someone else is holding that time. Pick another one.');
      // Still open in MaidCentral right now? (The engine re-reads the first visit date live.)
      const again = await suggestions(q, s.f || {});
      const still = (again.results || []).find((x) => x.id === s.o && String(x.teamId) === String(s.t) && x.arriveMin <= s.s && x.doneMin >= s.e);
      if (!still) throw new PlacementError(409, 'slot_unavailable', 'That time was just taken in MaidCentral. Pick another one.');
      const id = `h_${randomBytes(9).toString('base64url')}`;
      const expiresAt = now() + HOLD_MS;
      const slot = toSlot(s);
      await store.saveHold({ id, quoteId: q.id, openingId: s.o, teamId: String(s.t), day: s.d, startMin: s.s, endMin: s.e, slot, leadRef: req.lead_ref || null, placedBy: req.placed_by, expiresAt });
      return { hold_id: id, slot, expires_at: new Date(expiresAt).toISOString(), kind: 'local' };
    });
  }

  async function release(id) {
    const h = await store.getHold(id);
    if (!h) throw new PlacementError(404, 'hold_not_found', 'No such hold.');
    await store.releaseHold(id);
  }

  async function book() {
    throw new PlacementError(501, 'not_supported', 'Clean Bee books in MaidCentral for now: book the held time there, then mark the lead booked in the Hub.');
  }

  return { health, catalog, quote, availability, hold, release, book, searchPlaces, searchHomes };
}
