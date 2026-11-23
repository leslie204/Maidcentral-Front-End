// The placement contract for Clean Bee (contracts/placement/openapi.yaml, docs/placement.md):
// price a visit, find open times with this app's own openings engine (territory.js: the
// recurring pattern, drive times, team areas, a live re-check in MaidCentral), and hold a time
// while the rep books it. MaidCentral stays read-only: bookings are "manual" for now (the rep
// books the held time in MaidCentral and marks the lead booked in the Hub).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { placeCustomer as realPlace } from '../territory.js';
import { geocode as realGeocode, localToday } from '../geo.js';

export const CONTRACT_VERSION = '1.2.0';
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
export function createPlacement({ store, hubUser, config, place = realPlace, geocode = realGeocode, now = () => Date.now(), today = () => localToday(config.timezone) }) {
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
      capabilities: { holds: 'local', bookings: 'manual' },
      checked_at: new Date(now()).toISOString(),
      ...(ok ? {} : { message: st.state === 'code' ? 'The Hub user is waiting for a MaidCentral code (Clean Bee app → Sales Hub connection).' : 'The Hub user is signed out of MaidCentral (Clean Bee app → Sales Hub connection).' }),
    };
  }

  async function catalog(b) {
    checkBrand(b);
    return {
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
    if (req.address.country !== 'US') return { brand, serviceable: false, not_serviceable_reason: 'outside_service_area', message: 'Clean Bee serves the Spokane area only.' };
    const where = await locate(req.address);
    if (where.exact && (Math.abs(where.lat - SPOKANE.lat) > 1.5 || Math.abs(where.lng - SPOKANE.lng) > 1.5)) {
      return { brand, serviceable: false, not_serviceable_reason: 'outside_service_area', message: `${where.label} is outside the Spokane area Clean Bee serves.` };
    }
    const hours = minutes / 60;
    const oneTime = req.frequency === 'one_time';
    const rate = oneTime ? config.rateOneTime : config.rateRecurring;
    const visit = money(rate * hours);
    const id = `q_${randomBytes(9).toString('base64url')}`;
    const expiresAt = now() + QUOTE_MS;
    const data = { frequency: req.frequency, weeks: WEEKS[req.frequency], minutes, where, address: req.address, home: req.home || null, lead_ref: req.lead_ref || null, price: visit };
    await store.saveQuote({ id, caller, data, expiresAt });
    const hoursWords = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    return {
      brand,
      serviceable: true,
      quote_id: id,
      expires_at: new Date(expiresAt).toISOString(),
      duration_minutes: minutes,
      ...(where.exact ? {} : { message: 'The address wasn’t found on the map: times are placed near its ZIP code. Check the address with the customer.' }),
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
  async function suggestions(q) {
    const d = q.data;
    const params = { frequency: String(d.weeks), hours: d.minutes / 60 };
    if (d.where.exact) Object.assign(params, { lat: d.where.lat, lng: d.where.lng, address: d.where.label });
    else params.zip = d.where.zip;
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
    return {
      slot_token: sign(s),
      start: zoned(s.d, s.s, timezone),
      end: zoned(s.d, s.e, timezone),
      team: { id: String(s.t), name: s.n },
      notes: s.notes,
    };
  }

  async function availability({ quote_id: quoteId, from, to, limit = 50 }) {
    if (to < from) throw new PlacementError(400, 'invalid_request', '`to` is before `from`.');
    if ((Date.parse(to) - Date.parse(from)) / DAY_MS > 31) throw new PlacementError(400, 'invalid_request', 'Ask for at most 31 days at a time.');
    const q = await loadQuote(quoteId);
    const weeks = q.data.weeks;
    const result = await suggestions(q);
    const held = await store.openHolds(now());
    const slots = [];
    for (const x of result.results || []) {
      const d = dateIn(x, from, to, weeks);
      if (!d) continue;
      const s = {
        q: q.id, o: x.id, t: x.teamId, n: x.team, d, s: x.arriveMin, e: x.doneMin, w: weeks,
        notes: [
          weeks ? PATTERN[weeks](weekdayOf(d)) : 'One time',
          ...(x.reasons || []).map((r) => (typeof r === 'string' ? r : r.text)).filter(Boolean),
        ].slice(0, 6),
      };
      if (held.some((h) => overlaps(h, s))) continue;
      slots.push(s);
      if (slots.length >= limit) break;
    }
    return { quote_id: q.id, timezone, slots: slots.map(toSlot), generated_at: new Date(result.checkedLive || now()).toISOString() };
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
      const again = await suggestions(q);
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

  return { health, catalog, quote, availability, hold, release, book };
}
