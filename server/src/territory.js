// Openings by area and frequency: where recurring work can be added so that teams' days
// fill up and routes stay tight. Built from three MaidCentral sources:
//   - the Customer Efficiency Map report: every active service set with ZIP, zone,
//     latitude/longitude, frequency, default team, day of week and start time;
//   - the Zone settings page: zone names, colours and ZIP codes;
//   - the live schedule for the next 4 weeks (planner.js day data).
//
// An opening is a time window a team has free on a weekday. Looking at that weekday in
// each of the next 4 weeks tells which frequency it fits: free every week → weekly;
// free on alternate weeks → every 2 weeks (it pairs with an existing every-2-weeks
// customer on the other weeks); free one week in four → every 4 weeks. Its area comes
// from the homes the team cleans just before and after the window.
import { root, tables } from './extract.js';
import { dayData, analyseDay, parseDay } from './planner.js';
import { McError } from './mc.js';
import { office, returnBy, leaveAt } from './office.js';
import { areaNames, areaKey } from './areas.js';
import { localToday, mondayOf, geocode } from './geo.js';
import { perSession, FRESH } from './cache.js';
import { parseMaster, weekOfDate } from './master.js';
import { parseBoard, isVisit } from './prices.js';
import { road, learn } from './routing.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const cache = perSession();

async function cached(mc, key, ttl, fn) {
  if (!cache.has(mc)) cache.set(mc, new Map());
  const m = cache.get(mc);
  const hit = m.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await fn();
  m.set(key, { at: Date.now(), value });
  return value;
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const FREQ = {
  'every week': { short: 'Weekly', weeks: 1 },
  'every two weeks': { short: 'Every 2 weeks', weeks: 2 },
  'every three weeks': { short: 'Every 3 weeks', weeks: 3 },
  'every four weeks': { short: 'Every 4 weeks', weeks: 4 },
  single: { short: 'One-time', weeks: 0 },
  'on demand': { short: 'On demand', weeks: 0 },
};
const minutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(t || '').trim());
  if (!m) return null;
  return ((Number(m[1]) % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]);
};

// Homes marked Exclude (or paused) in MaidCentral: kept for locating any jobs they still
// have, but not counted as customers or used to judge where a team usually works.
export const active = (homes) => homes.filter((h) => !h.paused);

// Every active service set with its location (the Customer Efficiency Map report).
export async function book(mc) {
  return cached(mc, 'book', FRESH.reference, async () => {
    const t = tables(await mc.getHtml('/Report/CustomerEfficiencyMap'))[0];
    if (!t?.headers.includes('Latitude')) throw new McError('upstream', 'The Customer Efficiency Map report did not return the expected table');
    const col = (h) => t.headers.indexOf(h);
    const v = (r, h) => (col(h) >= 0 ? r.cells[col(h)] : '');
    return t.rows
      .map((r) => {
        const lat = parseFloat(v(r, 'Latitude'));
        const lng = parseFloat(v(r, 'Longitude'));
        const f = FREQ[norm(v(r, 'Frequency'))] || null;
        return {
          home: v(r, 'Home Name'),
          customer: [v(r, 'First Name'), v(r, 'Last Name')].filter(Boolean).join(' '),
          zip: v(r, 'Zip'),
          zone: v(r, 'Zone') || null,
          lat: Number.isFinite(lat) && lat ? lat : null,
          lng: Number.isFinite(lng) && lng ? lng : null,
          frequency: f ? { name: v(r, 'Frequency'), ...f } : null,
          team: v(r, 'Default Team') || null,
          weekday: WEEKDAYS.indexOf(v(r, 'Day Of Week')),
          start: minutes(v(r, 'Default Start Time')),
          paused: /exclude|pause/i.test(v(r, 'P/E')),
        };
      })
      .filter((h) => h.lat && h.lng);
  });
}

// Zones from MaidCentral's settings: name, colour, ZIP codes.
export async function zones(mc) {
  return cached(mc, 'zones', FRESH.reference, async () => {
    const r = root(await mc.getHtml('/Zone'));
    const t = tables(r)[0];
    if (!t) return [];
    const colorCells = r.querySelectorAll('tbody tr').map((tr) => {
      const style = tr.querySelectorAll('td')[1]?.toString() || '';
      return /#[0-9a-f]{6}/i.exec(style)?.[0] || null;
    });
    const merged = new Map();
    t.rows.forEach((row, i) => {
      const name = row.cells[0];
      const zips = (row.cells[2] || '').split(/[^0-9]+/).filter((z) => z.length === 5);
      const key = norm(name);
      const z = merged.get(key) || { name, color: colorCells[i] || row.cells[1] || null, zips: [] };
      z.zips.push(...zips);
      merged.set(key, z);
    });
    return [...merged.values()];
  });
}

// ZIP outlines (GeoJSON) for the zones' ZIP codes, for the map.
export async function zoneShapes(mc) {
  return cached(mc, 'shapes', FRESH.reference, async () => {
    const [geo, zs] = await Promise.all([mc.getJson('/Zone/GetMapJson'), zones(mc)]);
    const byZip = new Map(zs.flatMap((z) => z.zips.map((zip) => [zip, z])));
    return {
      type: 'FeatureCollection',
      features: (geo.features || [])
        .filter((f) => byZip.has(String(f.properties?.zipCode)))
        .map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { zip: String(f.properties.zipCode), city: f.properties.city, zone: byZip.get(String(f.properties.zipCode)).name, area: areaNames(zs).get(areaKey(byZip.get(String(f.properties.zipCode)).name))?.label, color: f.properties.fill || byZip.get(String(f.properties.zipCode)).color } })),
    };
  });
}

// Index of homes by "home name - customer" (how job titles are written).
export function homeIndex(homes) {
  const byTitle = new Map();
  const byHome = new Map();
  for (const h of homes) {
    byTitle.set(norm(`${h.home} - ${h.customer}`), h);
    const k = norm(h.home);
    byHome.set(k, byHome.has(k) ? null : h); // null = ambiguous
  }
  return (title) => byTitle.get(norm(title)) || byHome.get(norm(String(title).split(' - ')[0])) || null;
}

export const km = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
// Drive time from straight-line distance, calibrated to Spokane: about 4 minutes to get
// going and park, then an average speed that rises with distance because longer trips use
// I-90, US-395 and the highways (≈35 km/h for 3 km across a neighbourhood, ≈60 km/h for
// 15 km, up to 78 km/h for Liberty Lake, Cheney or Deer Park). The old flat 40 km/h made
// those trips look twice as long as they are. Exact road times, when a Google key is set,
// come from routing.js.
export const driveMin = (k) => (k < 0.05 ? 0 : Math.round(Math.min(4, 1 + 2 * k) + (k * 60) / Math.min(78, 30 + 2 * k)));
// Drive minutes between two places: the real road time when the routing service knows it
// (routing.js), else the estimate above; `unknown` when a place has no location.
export const driveTime = (a, b, unknown = 12) => (a && b ? (road(a, b)?.min ?? driveMin(km(a, b))) : unknown);
// Road distance in km (or straight line × 1.3 when the road isn't known).
export const roadKm = (a, b) => road(a, b)?.km ?? km(a, b) * 1.3;
// Teach the routing service every home and the office (once), plus any extra places.
export const learnPlaces = (homes, base, extra = []) => learn([...homes, base, ...extra].filter((p) => p?.lat));

// Interval maths on [start, end] minute pairs.
function intersect(a, b) {
  const out = [];
  for (const x of a) for (const y of b) {
    const s = Math.max(x[0], y[0]);
    const e = Math.min(x[1], y[1]);
    if (e > s) out.push([s, e]);
  }
  return out;
}
function subtract(a, b) {
  let out = a.map((x) => [...x]);
  for (const y of b) {
    out = out.flatMap(([s, e]) => {
      if (y[1] <= s || y[0] >= e) return [[s, e]];
      const parts = [];
      if (y[0] > s) parts.push([s, y[0]]);
      if (y[1] < e) parts.push([y[1], e]);
      return parts;
    });
  }
  return out;
}
const mod = (ms) => Math.round((ms % DAY) / MIN);
const hhmm = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;

// The heart of it: openings per team and weekday over 4 weeks from `from`.
//   dayStart/dayEnd: the hours you'd book a clean in (default 8:00 AM – 5:30 PM), so an
//   early shift doesn't show up as a 5 AM opening.
//   Everyone must be back at the office by returnBy() (default 4:45 PM): the last gap of a
//   day ends early enough to drive back from where the team is.
// Results are cached per person (never shared: each sees only what MaidCentral shows
// them). Fresh for 10 minutes; up to an hour old they're returned at once and refreshed in
// the background. Computed once at the shortest length and filtered per request, so every
// view (plan, sell, place, any minimum length) reuses the same work.
const results = perSession(); // McSession -> Map(key -> { at, value, pending })
const progress = new WeakMap(); // McSession -> { done, total, startedAt }

export function openingsStatus(mc) {
  const p = progress.get(mc);
  return p ? { stage: p.stage, done: p.done, total: p.total, seconds: Math.round((Date.now() - p.startedAt) / 1000) } : null;
}

export async function openings(mc, { from, minHours = 1.5, dayStart, dayEnd } = {}) {
  const key = JSON.stringify([from, dayStart || '', dayEnd || '']);
  if (!results.has(mc)) results.set(mc, new Map());
  const m = results.get(mc);
  const hit = m.get(key);
  const age = hit?.value ? Date.now() - hit.at : Infinity;
  const refresh = () => {
    if (hit?.pending) return hit.pending;
    const pending = computeOpenings(mc, { from, dayStart, dayEnd }).then(
      (value) => (m.set(key, { at: Date.now(), value }), value),
      (e) => {
        if (hit?.value) m.set(key, { at: hit.at, value: hit.value });
        else m.delete(key);
        throw e;
      },
    );
    m.set(key, { at: hit?.at || 0, value: hit?.value || null, pending });
    return pending;
  };
  let value;
  if (hit?.value && age < FRESH.fourWeeks) value = hit.value;
  else if (hit?.value && age < FRESH.fourWeeksMax) {
    refresh().catch(() => {});
    value = hit.value;
  } else value = await refresh();
  const minMin = Math.round(Math.min(Math.max(Number(minHours) || 1.5, 0.5), 8) * 60);
  return filterByLength(value, minMin, Date.now() - (m.get(key)?.at || Date.now()));
}

// Openings shorter than the minimum are dropped everywhere (list, zones, board).
function filterByLength(o, minMin, ageMs) {
  const keep = o.openings.filter((x) => x.end - x.start >= minMin);
  const ids = new Set(keep.map((x) => x.id));
  return {
    ...o,
    minHours: minMin / 60,
    ageSeconds: Math.round(ageMs / 1000),
    openings: keep,
    zones: o.zones
      .map((z) => {
        const os = keep.filter((x) => x.area.zone === z.name);
        return { ...z, openings: os.length, openWeeklyHours: Math.round(os.reduce((a, x) => a + x.weeklyHours, 0) * 10) / 10 };
      })
      .sort((a, b) => b.openWeeklyHours - a.openWeeklyHours),
    cycle: {
      ...o.cycle,
      teams: o.cycle.teams.map((t) => ({
        ...t,
        days: Object.fromEntries(Object.entries(t.days).map(([d, v]) => [d, v && { ...v, open: v.open.filter((g) => ids.has(g.id)) }])),
      })),
    },
  };
}

// Warm the cache (at sign-in and every 15 minutes while someone is active).
export function prewarm(mc) {
  return openings(mc, { from: mondayOf(localToday()) }).catch(() => {});
}

// Openings come from the RECURRING pattern (MaidCentral's Master Schedule), not from what
// happens to be booked on each date: a skipped visit doesn't open a recurring spot, a
// booking moved into a gap doesn't close one, and a customer rescheduled elsewhere still
// owns their slot. Frequencies come from the pattern's weeks (weeks 1 & 3 / 2 & 4 = every
// 2 weeks). The dated schedule is used for what's true on each date: a recurring opening
// taken that day by a moved or one-time booking (the first visit starts later), and time
// free only that day (someone skipped), offered as a one-time opening.
const FREQ_OF_CODE = { E1: 'Weekly', E2: 'Every 2 weeks', E3: 'Every 3 weeks', E4: 'Every 4 weeks' };
// How far ahead recurring openings are checked against real bookings (moved and one-time
// cleans already in MaidCentral), so a new regular isn't double-booked months out.
export const LOOKAHEAD_WEEKS = 12;
// "2026-11-26" -> "Thu Nov 26".
const dayLabel = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
// "North Home - Ann North" -> "Ann North".
const who = (title) => String(title || '').split(' - ').pop().trim();

async function computeOpenings(mc, { from, dayStart, dayEnd }) {
  const minHours = 0.5;
  const start = parseDay(from);
  const minMin = Math.round(minHours * 60);
  const back = returnBy();
  const leave = leaveAt();
  const open = [[minutes(dayStart) ?? leave, Math.min(minutes(dayEnd) ?? back, back)]];
  const dates = Array.from({ length: 28 }, (_, i) => start + i * DAY);
  const prog = { stage: 'locations', done: 0, total: dates.length, startedAt: Date.now() };
  progress.set(mc, prog);
  const usDay = (ms) => {
    const [y, m, d] = new Date(ms).toISOString().slice(0, 10).split('-');
    return `${m}/${d}/${y}`;
  };
  const [homes, zs, shapes, master, board] = await Promise.all([
    book(mc),
    zones(mc),
    zoneShapes(mc).catch(() => ({ features: [] })),
    mc.getHtml('/Report/MasterSchedule').then(parseMaster),
    // Real statuses (Skipped, Moved, Cancelled…), 2 weeks either side of the 4 weeks.
    mc.postFormHtml('/Report/DispatchBoard', { StartDate: usDay(start - 14 * DAY), EndDate: usDay(start + (LOOKAHEAD_WEEKS * 7 - 1) * DAY) }).then(parseBoard).catch(() => null),
  ]).catch((e) => {
    progress.delete(mc);
    throw e;
  });
  const lookup = homeIndex(homes);
  const base = await office(mc, homes);
  await learnPlaces(homes, base);
  const names = areaNames(zs);
  // Each area's colour from MaidCentral's Zones page.
  const zoneColor = new Map(zs.map((z) => [norm(z.name), z.color]));
  const colorOf = (zone) => (zone ? zoneColor.get(norm(zone)) || null : null);
  const nameOf = (zone) => (zone ? names.get(areaKey(zone))?.label || zone : null);
  const cityOf = new Map(shapes.features.map((f) => [f.properties.zip, f.properties.city]));
  const toOffice = (p) => (base.lat && p ? driveTime(p, base) : 15);
  // Read the 28 days, 6 at a time, reporting progress ("week 2 of 4").
  prog.stage = 'schedule';
  const days = new Array(dates.length);
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (next < dates.length) {
          const i = next++;
          days[i] = await dayData(mc, dates[i]);
          prog.done += 1;
        }
      }),
    );
  } finally {
    progress.delete(mc);
  }
  const analysed = days.map((d, i) => ({ ms: dates[i], ...analyseDay(d) }));

  // Teams: from the pattern and the schedule (colours from either).
  const teams = new Map();
  for (const b of master) if (!teams.has(b.teamId)) teams.set(b.teamId, { id: b.teamId, name: b.team, color: b.color, textColor: b.textColor });
  // MaidCentral sometimes leaves a team's name off a day ("Team 4804"): keep the real name
  // (from the Master Schedule or another day).
  const placeholder = (n) => !n || /^Team \d+$/.test(n);
  for (const d of analysed) for (const t of d.teams) {
    const was = teams.get(t.id);
    const name = placeholder(t.name) && was && !placeholder(was.name) ? was.name : t.name;
    teams.set(t.id, { ...was, id: t.id, name, color: (name === t.name && t.color) || was?.color || t.color, textColor: (name === t.name && t.textColor) || was?.textColor || t.textColor });
  }

  // Where a customer lives (pattern events carry the customer's name; jobs the title).
  const byCustomer = new Map();
  for (const h of homes) {
    const k = norm(h.customer);
    byCustomer.set(k, byCustomer.has(k) && byCustomer.get(k)?.home !== h.home ? null : h);
  }
  const placeOfHome = (h) => (h ? { lat: h.lat, lng: h.lng, zone: h.zone, zip: h.zip } : null);
  const place = (title) => placeOfHome(lookup(title));

  // The dated schedule, per team and date, with each job's minutes.
  const actual = new Map(); // "teamId|date" -> { team, jobs }
  for (const d of analysed) {
    for (const t of d.teams) {
      actual.set(`${t.id}|${d.date}`, { t, jobs: t.jobs.map((j) => ({ ...j, s: mod(Date.parse(`${j.start}Z`)), e: mod(Date.parse(`${j.end}Z`)) })) });
    }
  }
  const datesOf = (wd) => analysed.filter((d) => new Date(d.ms).getUTCDay() === wd).map((d) => d.date);
  const matches = (job, customer) => norm(job.title).includes(norm(customer));
  // Which booking on a date is each pattern visit (same customer, nearest its usual time);
  // every other booking that day is an extra (moved there, or one-time).
  const matchDay = (visits, jobs) => {
    const pairs = new Map();
    const used = new Set();
    for (const v of visits) {
      const j = jobs.filter((x) => !used.has(x) && matches(x, v.customer)).sort((a, b) => Math.abs(a.s - v.s) - Math.abs(b.s - v.s))[0];
      if (j) (pairs.set(v, j), used.add(j));
    }
    return { pairs, extras: jobs.filter((j) => !used.has(j)), missing: visits.filter((v) => !pairs.has(v)) };
  };

  // The pattern, per team, weekday and cycle week, with real times where the visit is on
  // the schedule (the pattern's grid is to the half hour).
  const pattern = new Map(); // "teamId|wd" -> { block, byWeek: Map(week -> [events]), dateWeek: Map(date -> week) }
  for (const b of master) {
    const dateWeek = new Map(datesOf(b.weekday).map((d) => [d, weekOfDate(d, b.weeks)]));
    const events = b.events.map((ev) => {
      let found = null;
      for (const [d, w] of dateWeek) {
        if (!ev.weeks.includes(w)) continue;
        const j = (actual.get(`${b.teamId}|${d}`)?.jobs || []).filter((x) => matches(x, ev.customer)).sort((a, c) => Math.abs(a.s - ev.gridStart) - Math.abs(c.s - ev.gridStart))[0];
        if (j) {
          found = j;
          break;
        }
      }
      const home = byCustomer.get(norm(ev.customer));
      const s = found ? found.s : home?.start != null && Math.abs(home.start - ev.gridStart) <= 30 ? home.start : ev.gridStart;
      const len = found ? found.e - found.s : ev.gridEnd + 30 - ev.gridStart;
      return { ...ev, s, e: s + len, loc: found ? place(found.title) || placeOfHome(home) : placeOfHome(home), title: found?.title || (home ? `${home.home} - ${home.customer}` : ev.customer), frequency: FREQ_OF_CODE[ev.code] || null };
    });
    const byWeek = new Map([1, 2, 3, 4].map((w) => [w, events.filter((ev) => ev.weeks.includes(w)).sort((a, c) => a.s - c.s)]));
    pattern.set(`${b.teamId}|${b.weekday}`, { block: b, byWeek, dateWeek });
  }

  // Where each recurring customer is expected (from the pattern), to tell a moved visit's
  // new date from their next regular one.
  const expected = new Map();
  for (const [key, pt] of pattern) {
    const teamId = Number(key.split('|')[0]);
    for (const [d, w] of pt.dateWeek) for (const v of pt.byWeek.get(w) || []) {
      const k = norm(v.customer);
      if (!expected.has(k)) expected.set(k, new Set());
      expected.get(k).add(`${d}|${teamId}`);
    }
  }
  const rowsBy = new Map();
  const rowById = new Map();
  for (const r of board || []) {
    const k = norm(r.customer);
    if (!rowsBy.has(k)) rowsBy.set(k, []);
    rowsBy.get(k).push(r);
    rowById.set(String(r.jobId), r);
  }
  const shortDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const gap = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  // Real visits by team and date, with times: to catch bookings after the 4 weeks.
  const boardBy = new Map();
  for (const r of board || []) {
    if (!r.date || !isVisit(r.status)) continue;
    const s = minutes(r.time);
    if (s == null) continue;
    const e = minutes(r.endTime) ?? s + Math.round((r.allowedHours || 2) * 30);
    const k = `${norm(r.team)}|${r.date}`;
    if (!boardBy.has(k)) boardBy.set(k, []);
    boardBy.get(k).push({ customer: r.customer, s, e });
  }
  // A recurring visit that isn't on its team's day: MaidCentral's own status for it.
  const whyMissing = (customer, date, teamName) => {
    if (!board) return { status: 'missing', text: 'not on the schedule this date (status not available)' };
    const rows = rowsBy.get(norm(customer)) || [];
    const here = rows.filter((r) => r.date === date);
    const elsewhere = here.find((r) => isVisit(r.status) && norm(r.team) !== norm(teamName));
    if (elsewhere) return { status: 'other-team', text: `with ${elsewhere.team} this day instead (${elsewhere.time})` };
    const st = here.map((r) => r.status).find(Boolean) || '';
    if (/moved/i.test(st)) {
      const to = rows
        .filter((r) => r.date !== date && isVisit(r.status) && !expected.get(norm(customer))?.has(`${r.date}|${[...teams.values()].find((t) => norm(t.name) === norm(r.team))?.id}`))
        .sort((a, b) => gap(a.date, date) - gap(b.date, date))[0];
      return { status: 'moved', text: to ? `moved to ${shortDay(to.date)} ${to.time} with ${to.team}` : 'moved to another date' };
    }
    if (/skip/i.test(st)) return { status: 'skipped', text: 'skipped (marked in MaidCentral)' };
    if (/cancel/i.test(st)) return { status: 'cancelled', text: 'cancelled' };
    if (st && !isVisit(st)) return { status: 'other', text: st.toLowerCase() };
    return { status: 'not-booked', text: 'no booking this date' };
  };
  // A booking that isn't part of the pattern: where it came from.
  const whyExtra = (job, date) => {
    const row = rowById.get(String(job.id));
    if (!row) return job.frequency?.short === 'One-time' ? 'one-time clean' : 'not part of the recurring pattern';
    if (/single|one.?time|on demand/i.test(row.frequency)) return 'one-time clean';
    const from = (rowsBy.get(norm(row.customer)) || []).filter((r) => /moved/i.test(r.status) && r.date !== date).sort((a, b) => gap(a.date, date) - gap(b.date, date))[0];
    if (from) return `moved here from ${shortDay(from.date)}`;
    return `${row.frequency ? `${row.frequency.toLowerCase()} customer` : 'customer'} booked here outside their usual day or team`;
  };

  // Free time in a list of visits: the working day minus the visits, starting after the
  // drive from the office and ending in time to drive back.
  const freeAround = (visits) => {
    const busy = visits.map((v) => [v.s, v.e]).sort((a, c) => a[0] - c[0]);
    let gaps = subtract(open, busy);
    gaps = gaps.map(([gs, ge]) => {
      let a = gs;
      let z = ge;
      if (!visits.some((v) => v.e <= a + 5)) {
        const after = visits.filter((v) => v.s >= z - 5).sort((x, y) => x.s - y.s)[0];
        a = Math.max(a, leave + toOffice(after?.loc || null));
      }
      if (!visits.some((v) => v.s >= z - 5)) {
        const before = visits.filter((v) => v.e <= a + 5).sort((x, y) => y.e - x.e)[0];
        z = Math.min(z, back - toOffice(before?.loc || null));
      }
      return [a, z];
    });
    return gaps.filter(([a, z]) => z - a >= minMin);
  };
  const neighbourInfo = (visits, s, e) => {
    const before = visits.filter((v) => v.e <= s + 5).sort((a, c) => c.e - a.e)[0];
    const after = visits.filter((v) => v.s >= e - 5).sort((a, c) => a.s - c.s)[0];
    return { before, after };
  };
  const describeArea = (neighbours, usual) => {
    const pts = neighbours.length ? neighbours : usual;
    const zoneCount = {};
    for (const p of pts) if (p.zone) zoneCount[p.zone] = (zoneCount[p.zone] || 0) + 1;
    const zonesHere = Object.entries(zoneCount).sort((a, b) => b[1] - a[1]).map(([z]) => z);
    const anchor = neighbours.filter((p) => p.when === 'before');
    const basePts = anchor.length ? anchor : pts;
    const center = basePts.length ? { lat: basePts.reduce((a, p) => a + p.lat, 0) / basePts.length, lng: basePts.reduce((a, p) => a + p.lng, 0) / basePts.length } : null;
    const zoneBefore = anchor[0]?.zone || null;
    const zipHere = (anchor[0] || pts[0])?.zip || null;
    const zoneAfter = neighbours.find((p) => p.when === 'after')?.zone || null;
    const spread = center && pts.length > 1 ? Math.max(...pts.map((p) => km(center, p))) : 0;
    return {
      zones: zonesHere,
      zone: zoneBefore || zonesHere[0] || null,
      name: nameOf(zoneBefore || zonesHere[0]),
      zip: zipHere,
      city: zipHere ? cityOf.get(String(zipHere)) || null : null,
      between: zoneBefore && zoneAfter && norm(zoneBefore) !== norm(zoneAfter) ? [nameOf(zoneBefore), nameOf(zoneAfter)] : null,
      center,
      spreadKm: Math.round(spread * 10) / 10,
      basis: neighbours.length ? 'neighbouring jobs' : usual.length ? "team's usual area that day" : 'unknown',
      neighbours: neighbours.slice(0, 6).map(({ title, zone, when }) => ({ title, zone, when })),
    };
  };

  const out = [];
  for (let wd = 0; wd < 7; wd++) {
    const wdDates = datesOf(wd);
    if (wdDates.length < 4) continue;
    for (const team of teams.values()) {
      const pt = pattern.get(`${team.id}|${wd}`);
      const works = wdDates.some((d) => actual.get(`${team.id}|${d}`)?.t.window) || pt?.block.events.length;
      if (!works) continue;
      const usual = active(homes).filter((h) => norm(h.team) === norm(team.name) && h.weekday === wd);
      const dateOfWeek = (w) => (pt ? [...pt.dateWeek].find(([, x]) => x === w)?.[0] : null);
      const freeByWeek = new Map([1, 2, 3, 4].map((w) => [w, freeAround(pt?.byWeek.get(w) || [])]));
      // Weekly: free in all four weeks; every 2 weeks: weeks 1 & 3 or 2 & 4; every 4 weeks: one week.
      const fits = [];
      const weekly = [2, 3, 4].reduce((acc, w) => intersect(acc, freeByWeek.get(w)), freeByWeek.get(1));
      fits.push({ fit: 'Weekly', weeks: 1, wk: [1, 2, 3, 4], windows: weekly });
      for (const pair of [[1, 3], [2, 4]]) fits.push({ fit: 'Every 2 weeks', weeks: 2, wk: pair, windows: subtract(intersect(freeByWeek.get(pair[0]), freeByWeek.get(pair[1])), weekly) });
      for (const w of [1, 2, 3, 4]) {
        const pairWins = fits.filter((f) => f.weeks === 2 && f.wk.includes(w)).flatMap((f) => f.windows);
        fits.push({ fit: 'Every 4 weeks', weeks: 4, wk: [w], windows: subtract(subtract(freeByWeek.get(w), weekly), pairWins) });
      }
      for (const f of fits) {
        for (const [s, e] of f.windows) {
          if (e - s < minMin) continue;
          const neighbours = [];
          const legs = [];
          const takenOn = [];
          const theDates = f.wk.map(dateOfWeek).filter(Boolean).sort();
          for (const w of f.wk) {
            const d = dateOfWeek(w);
            const visits = pt?.byWeek.get(w) || [];
            const { before, after } = neighbourInfo(visits, s, e);
            const leg = { date: d, week: w, before: before?.loc || null, after: after?.loc || null, beforeEnd: before?.e ?? null, afterStart: after?.s ?? null, beforeName: before ? who(before.title) : null, afterName: after ? who(after.title) : null };
            legs.push(leg);
            for (const [v, when] of [[before, 'before'], [after, 'after']]) if (v?.loc) neighbours.push({ ...v.loc, title: v.title, when });
            if (!before && !after) for (const v of visits) if (v.loc) neighbours.push({ ...v.loc, title: v.title, when: 'same day' });
            // On that date, is the time taken by a booking that isn't part of the pattern
            // (moved there, or one-time)? Then the first visit starts on a later date.
            if (d) {
              const day = actual.get(`${team.id}|${d}`);
              const blocking = matchDay(visits, day?.jobs || []).extras.filter((j) => j.s < e && j.e > s);
              if (blocking.length) takenOn.push({ date: d, by: blocking.map((j) => j.title) });
            }
          }
          // After the 4 weeks: the same spot on later dates (the cycle repeats every 28 days),
          // checked against real bookings for up to LOOKAHEAD_WEEKS.
          const regulars = new Set((pt?.block.events || []).map((v) => norm(v.customer)));
          for (const d0 of theDates) {
            for (let k = 1; k * 4 < LOOKAHEAD_WEEKS; k++) {
              const d = new Date(Date.parse(`${d0}T00:00:00Z`) + k * 28 * DAY).toISOString().slice(0, 10);
              const by = (boardBy.get(`${norm(team.name)}|${d}`) || []).filter((r) => r.s < e && r.e > s && !regulars.has(norm(r.customer))).map((r) => r.customer);
              if (by.length) takenOn.push({ date: d, by, later: true });
            }
          }
          takenOn.sort((a, b) => a.date.localeCompare(b.date));
          const free = theDates.filter((d) => !takenOn.some((t) => t.date === d));
          out.push({
            id: `${team.id}-${wd}-${s}-${f.fit}-${f.wk.join('')}`,
            teamId: team.id,
            team: team.name,
            color: team.color,
            weekday: WEEKDAYS[wd],
            weekdayIndex: wd,
            start: s,
            end: e,
            label: `${hhmm(s)} – ${hhmm(e)}`,
            hours: Math.round(((e - s) / 60) * 100) / 100,
            fit: f.fit,
            weeks: f.weeks,
            cycleWeeks: f.wk,
            dates: theDates,
            firstDate: free[0] || null,
            takenOn,
            // Weekly-equivalent hours: what this adds to the recurring book.
            weeklyHours: Math.round((((e - s) / 60) / f.weeks) * 100) / 100,
            area: describeArea(neighbours, usual),
            legs,
            members: actual.get(`${team.id}|${theDates[0]}`)?.t.members.filter((m) => !m.absent).map((m) => m.name) || [],
            source: 'pattern',
          });
        }
      }

      // Time free on one date only (someone skipped or moved away): a one-time opening.
      for (const d of wdDates) {
        const day = actual.get(`${team.id}|${d}`);
        if (!day?.t.window) continue;
        const w = pt?.dateWeek.get(d);
        const recurringHere = out.filter((o) => o.teamId === team.id && o.dates.includes(d)).map((o) => [o.start, o.end]);
        const visits = day.jobs.map((j) => ({ ...j, loc: place(j.title) }));
        const extra = subtract(freeAround(visits), recurringHere).filter(([a, z]) => z - a >= minMin);
        if (!extra.length) continue;
        const missing = matchDay(pt?.byWeek.get(w) || [], day.jobs).missing;
        for (const [s, e] of extra) {
          const gone = missing.filter((v) => v.s < e && v.e > s).map((v) => `${v.customer}: ${whyMissing(v.customer, d, team.name).text}`);
          const { before, after } = neighbourInfo(visits, s, e);
          const neighbours = [];
          for (const [v, when] of [[before, 'before'], [after, 'after']]) if (v?.loc) neighbours.push({ ...v.loc, title: v.title, when });
          out.push({
            id: `${team.id}-${d}-${s}-once`,
            teamId: team.id,
            team: team.name,
            color: team.color,
            weekday: WEEKDAYS[wd],
            weekdayIndex: wd,
            start: s,
            end: e,
            label: `${hhmm(s)} – ${hhmm(e)}`,
            hours: Math.round(((e - s) / 60) * 100) / 100,
            fit: 'One-time',
            weeks: 0,
            cycleWeeks: w ? [w] : [],
            dates: [d],
            firstDate: d,
            takenOn: [],
            weeklyHours: 0,
            why: gone.length ? gone.join('; ') : 'free on this date only',
            area: describeArea(neighbours, usual),
            legs: [{ date: d, before: before?.loc || null, after: after?.loc || null, beforeEnd: before?.e ?? null, afterStart: after?.s ?? null, beforeName: before ? who(before.title) : null, afterName: after ? who(after.title) : null }],
            members: day.t.members.filter((m) => !m.absent).map((m) => m.name),
            source: 'date',
          });
        }
      }
    }
  }

  // The 4-week cycle board: per team and date, the pattern's visits (marked if skipped
  // that date), bookings that aren't part of the pattern (moved there or one-time), and
  // the openings labelled with the frequency they fit.
  const fitsByTeamDate = new Map();
  for (const o of out) for (const d of o.dates) {
    const k = `${o.teamId}|${d}`;
    if (!fitsByTeamDate.has(k)) fitsByTeamDate.set(k, []);
    fitsByTeamDate.get(k).push({ s: o.start, e: o.end, fit: o.fit, weeks: o.weeks, pairs: o.dates, id: o.id, zone: o.area.zone, area: o.area.name, taken: o.takenOn.find((t) => t.date === d)?.by || null, why: o.why || null });
  }
  const cycle = {
    weeks: [0, 1, 2, 3].map((w) => ({ label: `Week ${w + 1}`, from: analysed[w * 7].date, to: analysed[w * 7 + 6].date })),
    weekdays: [1, 2, 3, 4, 5, 6, 0].filter((wd) => analysed.some((d) => new Date(d.ms).getUTCDay() === wd && d.teams.some((t) => t.window || t.jobs.length)) || master.some((b) => b.weekday === wd && b.events.length)).map((wd) => WEEKDAYS[wd]),
    teams: [...teams.values()].map((team) => ({
      ...team,
      days: Object.fromEntries(
        analysed.map((d) => {
          const wd = new Date(d.ms).getUTCDay();
          const day = actual.get(`${team.id}|${d.date}`);
          const pt = pattern.get(`${team.id}|${wd}`);
          const w = pt?.dateWeek.get(d.date);
          const planned = (w && pt?.byWeek.get(w)) || [];
          if (!day?.t.window && !day?.jobs.length && !planned.length) return [d.date, null];
          const m = matchDay(planned, day?.jobs || []);
          const jobs = planned.map((v) => {
            const j = m.pairs.get(v);
            const why = j ? null : whyMissing(v.customer, d.date, team.name);
            return { s: j ? j.s : v.s, e: j ? j.e : v.e, title: j?.title || v.title, frequency: v.frequency, zone: v.loc?.zone || null, area: nameOf(v.loc?.zone), status: j ? 'booked' : why.status, reason: why?.text || null, zip: v.loc?.zip || null, color: colorOf(v.loc?.zone) };
          });
          for (const j of m.extras) {
            const h = lookup(j.title);
            jobs.push({ s: j.s, e: j.e, title: j.title, frequency: j.frequency?.short || null, zone: h?.zone || null, area: nameOf(h?.zone), status: 'extra', reason: whyExtra(j, d.date), zip: h?.zip || null, color: colorOf(h?.zone) });
          }
          return [d.date, {
            window: day?.t.window ? { s: mod(Date.parse(`${day.t.window.start}Z`)), e: mod(Date.parse(`${day.t.window.end}Z`)) } : null,
            week: w || null,
            conflicts: pt?.block.conflicts?.[w] || 0,
            jobs,
            booked: Math.round(jobs.filter((j) => j.status !== 'skipped').reduce((a, j) => a + (j.e - j.s), 0) / 6) / 10,
            open: (fitsByTeamDate.get(`${team.id}|${d.date}`) || []).sort((a, b) => a.s - b.s),
          }];
        }),
      ),
    })),
  };

  // By zone, for sales: where the recurring open time is, and who already works there.
  const recurring = out.filter((o) => o.weeks > 0);
  const zoneList = zs.map((z) => {
    const os = recurring.filter((o) => norm(o.area.zone) === norm(z.name));
    const zHomes = active(homes).filter((h) => norm(h.zone) === norm(z.name));
    const presence = {};
    for (const h of zHomes) if (h.weekday >= 0) (presence[WEEKDAYS[h.weekday]] ||= new Set()).add(h.team);
    return {
      name: z.name,
      label: nameOf(z.name),
      cities: [...new Set(z.zips.map((zip) => cityOf.get(zip)).filter(Boolean))],
      color: z.color,
      zips: z.zips,
      homes: zHomes.length,
      openings: os.length,
      openWeeklyHours: Math.round(os.reduce((s, o) => s + o.weeklyHours, 0) * 10) / 10,
      center: zHomes.length ? { lat: zHomes.reduce((a, h) => a + h.lat, 0) / zHomes.length, lng: zHomes.reduce((a, h) => a + h.lng, 0) / zHomes.length } : null,
      days: Object.fromEntries(Object.entries(presence).map(([d, s]) => [d, [...s].filter(Boolean)])),
    };
  });

  return {
    from,
    weeks: 4,
    cycle,
    source: 'master-schedule',
    statuses: board ? 'dispatch-board' : 'unavailable',
    lookahead: board ? { weeks: LOOKAHEAD_WEEKS, until: new Date(start + (LOOKAHEAD_WEEKS * 7 - 1) * DAY).toISOString().slice(0, 10) } : null,
    areaColors: zs.filter((z) => z.color).map((z) => ({ zone: z.name, name: nameOf(z.name), color: z.color })),
    minHours: minMin / 60,
    openings: out.sort((a, b) => b.weeklyHours - a.weeklyHours || a.weekdayIndex - b.weekdayIndex || a.start - b.start),
    dayStart: hhmm(open[0][0]),
    dayEnd: hhmm(open[0][1]),
    returnBy: hhmm(back),
    office: { address: base.address, located: Boolean(base.lat), source: base.source },
    zones: zoneList.sort((a, b) => b.openWeeklyHours - a.openWeeklyHours),
    teams: [...teams.values()],
    conflicts: master.flatMap((b) => Object.entries(b.conflicts).filter(([, n]) => n > 0).map(([w, n]) => ({ team: b.team, weekday: WEEKDAYS[b.weekday], week: Number(w), count: n }))),
    book: {
      homes: active(homes).length,
      patternVisits: master.reduce((n, b) => n + b.events.length, 0),
      byFrequency: homes.reduce((m, h) => ((m[h.frequency?.short || 'Unknown'] = (m[h.frequency?.short || 'Unknown'] || 0) + 1), m), {}),
      matchedJobs: analysed.reduce((n, d) => n + d.teams.reduce((k, t) => k + t.jobs.filter((j) => lookup(j.title)).length, 0), 0),
      totalJobs: analysed.reduce((n, d) => n + d.teams.reduce((k, t) => k + t.jobs.length, 0), 0),
    },
  };
}

// Any home in MaidCentral, past or present (recurring, one-time, former), by name: for
// placing near an existing home. MaidCentral's global search; each home once, with its
// address, and whether it's one of today's recurring homes (with a known map location).
export async function searchHomes(mc, text) {
  const q = String(text || '').trim().slice(0, 80);
  if (q.length < 2) return { query: q, homes: [] };
  const [d, homes] = await Promise.all([mc.getJson('/Search/Global', { query: q }), book(mc)]);
  const lookup = homeIndex(homes);
  const seen = new Set();
  const out = [];
  for (const h of d.HomeList || []) {
    const id = String(h.HomeServiceInformationId || h.Id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const customer = [h.FirstName, h.LastName].filter(Boolean).join(' ') || h.FullName || '';
    const inBook = lookup(`${h.HomeName} - ${customer}`);
    out.push({
      id,
      customerId: /\/(\d+)(?:\?|$)/.exec(h.CustomerUrl || '')?.[1] || null,
      customer,
      company: h.CompanyName || null,
      home: h.HomeName || null,
      address: [h.Address1, h.City].filter(Boolean).join(', '),
      street: h.Address1 || null,
      city: h.City || null,
      region: h.Region || null,
      zip: h.PostalCode || null,
      zone: h.HomeZoneName || null,
      zoneColor: h.HomeZoneColor || null,
      recurring: Boolean(inBook && !inBook.paused),
    });
  }
  // Regular customers first, then by name.
  out.sort((a, b) => Number(b.recurring) - Number(a.recurring) || a.customer.localeCompare(b.customer));
  return { query: q, homes: out.slice(0, 30) };
}

// Where should a new customer go? Openings ranked by distance, frequency and length.
//   target: an address (lat, lng, address from the address search), zip, zone, or home
//   (name of an existing home in the book)
//   days: optional weekdays ("Tuesday,Thursday"); part: any | morning | afternoon
//   before: one-time cleans only before this date (to fit a customer in before their
//   first regular visit); maxDrive: leave out openings needing more extra driving (minutes)
export async function placeCustomer(mc, { from, zip, zone, home, homeName, homeCustomer, homeStreet, homeCity, homeZip, lat, lng, address, frequency = '2', hours = 2, days = '', part = 'any', before, maxDrive, dayStart, dayEnd }) {
  const homes = await book(mc);
  const zs = await zones(mc);
  let target = null;
  let label = null;
  // A home picked from the customer search: its map location from the recurring book if it's
  // there, else its address looked up (US Census), else the centre of its ZIP code.
  if (homeName || homeCustomer) {
    const inBook = homeIndex(homes)(`${homeName || ''} - ${homeCustomer || ''}`);
    const who = [homeCustomer, homeName].filter(Boolean).join(', ');
    if (inBook) (target = { lat: inBook.lat, lng: inBook.lng, zone: inBook.zone, exact: true }), (label = `${who} (${areaNames(zs).get(areaKey(inBook.zone))?.label || inBook.zip})`);
    else if (homeStreet) {
      const g = await geocode(`${homeStreet}, ${homeCity || 'Spokane'}, WA ${homeZip || ''}`.trim());
      if (g) {
        lat = g.lat;
        lng = g.lng;
        address = `${who}: ${homeStreet}${homeCity ? `, ${homeCity}` : ''}`;
      }
    }
    if (!target && lat == null && homeZip) zip = homeZip;
  }
  if (!target && lat != null && lng != null && lat !== '' && lng !== '') {
    const p = { lat: Number(lat), lng: Number(lng) };
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat - 47.7) > 1.5 || Math.abs(p.lng + 117.4) > 1.5) throw new McError('input', 'That address is outside the Spokane area.');
    // Its area: the area of the nearest homes in the book.
    const near = active(homes).map((h) => ({ h, d: km(p, h) })).sort((a, b) => a.d - b.d).slice(0, 5);
    const zoneCount = {};
    for (const { h } of near) if (h.zone) zoneCount[h.zone] = (zoneCount[h.zone] || 0) + 1;
    target = { ...p, zone: Object.entries(zoneCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null, exact: true };
    label = String(address || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`).slice(0, 120);
  }
  if (home) {
    const h = active(homes).find((x) => norm(`${x.home} ${x.customer}`).includes(norm(home)));
    if (h) (target = { lat: h.lat, lng: h.lng, zone: h.zone }), (label = `${h.home} (${areaNames(zs).get(areaKey(h.zone))?.label || h.zip})`);
  }
  if (!target && zip) {
    const inZip = active(homes).filter((h) => h.zip === String(zip).trim());
    const z = zs.find((x) => x.zips.includes(String(zip).trim()));
    const pts = inZip.length ? inZip : active(homes).filter((h) => z && norm(h.zone) === norm(z.name));
    if (pts.length) target = { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length, zone: z?.name || pts[0].zone };
    label = `ZIP ${zip}${z ? ` (${areaNames(zs).get(areaKey(z.name))?.label || z.name})` : ''}`;
    // A picked customer whose address couldn't be found on the map: near their ZIP.
    if (homeName || homeCustomer) label = `${[homeCustomer, homeName].filter(Boolean).join(', ')}: near ${label} (address not found on the map)`;
  }
  if (!target && zone) {
    const pts = active(homes).filter((h) => norm(h.zone) === norm(zone));
    if (pts.length) target = { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length, zone };
    label = zone;
  }
  if (!target) throw new McError('input', 'Enter a ZIP code, an area, or an existing home to place the customer near.');
  const want = Number(frequency);
  const need = Math.round(Math.min(Math.max(Number(hours) || 2, 0.5), 8) * 60);
  const o = await openings(mc, { from, minHours: Math.max(need / 60, 0.5), dayStart, dayEnd });
  const base = await office(mc, homes);
  await learnPlaces(homes, base, [target]);
  const back = returnBy();
  const drive = (a, b) => driveTime(a, b, 15);
  // Exact timing on every visit date: drive from the previous job (or the office), clean,
  // then drive to the next job in time or back to the office by the return time.
  const timing = (x) => {
    let earliest = x.start;
    let latest = Infinity;
    let lastOfDay = false;
    for (const l of x.legs) {
      earliest = Math.max(earliest, l.beforeEnd != null ? l.beforeEnd + (l.before ? drive(l.before, target) : 15) : leaveAt() + (base.lat ? drive(base, target) : 15));
      if (l.afterStart != null) latest = Math.min(latest, l.afterStart - (l.after ? drive(target, l.after) : 15));
      else {
        lastOfDay = true;
        latest = Math.min(latest, back - (base.lat ? drive(target, base) : 15));
      }
    }
    if (!x.legs.length) latest = x.end;
    const startAt = Math.ceil(earliest / 5) * 5;
    return { startAt, endAt: startAt + need, latest, lastOfDay, ok: startAt + need <= latest };
  };
  const wantDays = String(days || '').split(',').map((d) => d.trim()).filter(Boolean);
  // A one-time clean needs one free date, not a repeating slot: every date of every opening
  // is its own candidate (today onwards), and sooner is a little better.
  const today = localToday();
  const candidates =
    want === 0
      ? o.openings.flatMap((x) =>
        x.dates
          .filter((d) => !(x.takenOn || []).some((t) => t.date === d))
          .map((d, k) => ({ ...x, id: `${x.id}-${d}`, dates: [d], legs: x.legs.filter((l) => l.date === d).length ? x.legs.filter((l) => l.date === d) : [x.legs[k]].filter(Boolean), fit: 'One-time', weeks: 0 }))
          .filter((x2) => x2.dates[0] >= today),
      )
      : // A recurring customer only goes in an opening that recurs at least as often (a
        // weekly customer needs a weekly spot), with a first date that's really free.
        o.openings.filter((x) => x.weeks > 0 && x.firstDate && x.weeks <= (want || 4));
  const limitDrive = Number(maxDrive) > 0 ? Number(maxDrive) : null;
  const ranked = candidates
    .filter((x) => !(want === 0 && before) || x.dates[0] < before)
    .filter((x) => x.hours * 60 >= need && x.area.center)
    .filter((x) => !wantDays.length || wantDays.includes(x.weekday))
    .filter((x) => part === 'morning' ? x.start < 12 * 60 : part === 'afternoon' ? x.end > 12 * 60 + need : true)
    .map((x) => ({ x, t: timing(x) }))
    .filter(({ t }) => t.ok)
    .map(({ x, t }) => {
      const dist = km(target, x.area.center);
      // Extra driving on each date: previous job -> new home -> next job, minus the direct drive.
      const detours = x.legs.map((l) => {
        if (l.before && l.after) return drive(l.before, target) + drive(target, l.after) - drive(l.before, l.after);
        if (l.before || l.after) return drive(l.before || l.after, target);
        return drive(x.area.center, target);
      });
      const extra = Math.max(0, Math.round(detours.length ? detours.reduce((a, b) => a + b, 0) / detours.length : drive(x.area.center, target)));
      const reasons = [];
      let score = 100 - extra * 2.5;
      if (want === 1 && x.weeks !== 1) score -= 200;
      if (want === 2) score += x.weeks === 2 ? 30 : x.weeks === 1 ? 5 : -200;
      if (want === 4) score += x.weeks === 4 ? 30 : x.weeks === 2 ? 5 : x.weeks === 1 ? 0 : -200;
      if (want === 0) {
        const ahead = Math.round((Date.parse(`${x.dates[0]}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
        score -= ahead * 0.5;
        reasons.push({ text: ahead <= 7 ? 'This week or next' : `In ${Math.ceil(ahead / 7)} weeks`, tone: ahead <= 7 ? 'good' : 'neutral' });
      } else {
        const soon = (x.takenOn || []).filter((t) => !t.later);
        const later = (x.takenOn || []).filter((t) => t.later);
        if (soon.length) reasons.push({ text: `Starts ${dayLabel(x.firstDate)}: ${soon.map((t) => dayLabel(t.date)).join(', ')} already taken`, tone: 'neutral' });
        // Bookings already in MaidCentral on later dates of this spot: those visits would clash.
        if (later.length) {
          reasons.push({ text: `Clashes later: ${later.map((t) => `${dayLabel(t.date)} (${t.by.join(', ')})`).join(', ')}`, tone: 'warn' });
          score -= 12 * later.length;
        }
      }
      if (want !== 0 && x.weeks === want) reasons.push({ text: { 1: 'Free every week', 2: 'Free every other week: right for this customer', 4: 'Free once every 4 weeks: right for this customer' }[x.weeks] || 'Right frequency', tone: 'good' });
      if (extra <= 5) reasons.push({ text: `On the team's way (${extra} min extra driving)`, tone: 'good' });
      else reasons.push({ text: `${extra} min extra driving`, tone: extra <= 15 ? 'neutral' : 'warn' });
      if (x.area.zone && norm(x.area.zone) === norm(target.zone)) (score += 15), reasons.push({ text: `Same area (${x.area.name || x.area.zone})`, tone: 'good' });
      const leftover = x.hours * 60 - need;
      if (leftover < 30) (score += 8), reasons.push({ text: 'Fills the free time exactly', tone: 'good' });
      if (t.lastOfDay) reasons.push({ text: `Back at the office by ${hhmm(t.endAt + (base.lat ? drive(target, base) : 15))}`, tone: 'neutral' });
      // The drive in and out on the first visit: from the job before (or the office), and on
      // to the next job (or back to the office).
      const l = x.legs.find((g) => g.date === (x.firstDate || x.dates[0])) || x.legs[0];
      const route = l
        ? {
          from: l.before ? l.beforeName || 'the job before' : 'the office',
          fromMin: Math.round(l.before ? drive(l.before, target) : base.lat ? drive(base, target) : 15),
          to: l.after ? l.afterName || 'the next job' : 'the office',
          toMin: Math.round(l.after ? drive(target, l.after) : base.lat ? drive(target, base) : 15),
        }
        : null;
      const { legs, ...rest } = x;
      return { ...rest, arrive: hhmm(t.startAt), done: hhmm(t.endAt), arriveMin: t.startAt, doneMin: t.endAt, lastOfDay: t.lastOfDay, distanceKm: Math.round(dist * 10) / 10, extraDriveMin: extra, route, score: Math.round(score), reasons };
    })
    .filter((x) => x.score > -100)
    .filter((x) => !limitDrive || x.extraDriveMin <= limitDrive)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
  return { target: { ...target, label }, frequency: want, hours: need / 60, returnBy: hhmm(back), office: { address: base.address, located: Boolean(base.lat) }, before: want === 0 && before ? before : null, maxDrive: limitDrive, lookahead: o.lookahead, results: ranked };
}
