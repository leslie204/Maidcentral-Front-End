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
import { localToday, mondayOf } from './geo.js';
import { perSession, FRESH } from './cache.js';
import { parseMaster, weekOfDate } from './master.js';

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
// Rough drive time: straight line × 1.3 at 40 km/h.
export const driveMin = (k) => Math.round((k * 1.3 * 60) / 40);

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
  const [homes, zs, shapes, master] = await Promise.all([
    book(mc),
    zones(mc),
    zoneShapes(mc).catch(() => ({ features: [] })),
    mc.getHtml('/Report/MasterSchedule').then(parseMaster),
  ]).catch((e) => {
    progress.delete(mc);
    throw e;
  });
  const lookup = homeIndex(homes);
  const base = await office(mc, homes);
  const names = areaNames(zs);
  const nameOf = (zone) => (zone ? names.get(areaKey(zone))?.label || zone : null);
  const cityOf = new Map(shapes.features.map((f) => [f.properties.zip, f.properties.city]));
  const toOffice = (p) => (base.lat && p ? driveMin(km(p, base)) : 15);
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
  for (const d of analysed) for (const t of d.teams) teams.set(t.id, { ...teams.get(t.id), id: t.id, name: t.name, color: t.color || teams.get(t.id)?.color, textColor: t.textColor || teams.get(t.id)?.textColor });

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
            const leg = { date: d, week: w, before: before?.loc || null, after: after?.loc || null, beforeEnd: before?.e ?? null, afterStart: after?.s ?? null };
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
          const gone = missing.filter((v) => v.s < e && v.e > s).map((v) => v.customer);
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
            why: gone.length ? `${gone.join(', ')} ${gone.length > 1 ? 'are' : 'is'} not on the schedule this date (skipped or moved)` : 'free on this date only',
            area: describeArea(neighbours, usual),
            legs: [{ date: d, before: before?.loc || null, after: after?.loc || null, beforeEnd: before?.e ?? null, afterStart: after?.s ?? null }],
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
            return { s: j ? j.s : v.s, e: j ? j.e : v.e, title: j?.title || v.title, frequency: v.frequency, zone: v.loc?.zone || null, area: nameOf(v.loc?.zone), status: j ? 'booked' : 'skipped' };
          });
          for (const j of m.extras) {
            const h = lookup(j.title);
            jobs.push({ s: j.s, e: j.e, title: j.title, frequency: j.frequency?.short || null, zone: h?.zone || null, area: nameOf(h?.zone), status: 'extra' });
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

// Where should a new customer go? Openings ranked by distance, frequency and length.
//   target: zip, zone, or home (name of an existing home in the book)
//   days: optional weekdays ("Tuesday,Thursday"); part: any | morning | afternoon
export async function placeCustomer(mc, { from, zip, zone, home, frequency = '2', hours = 2, days = '', part = 'any', dayStart, dayEnd }) {
  const homes = await book(mc);
  const zs = await zones(mc);
  let target = null;
  let label = null;
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
  const back = returnBy();
  const drive = (a, b) => (a && b ? driveMin(km(a, b)) : 15);
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
  const ranked = candidates
    .filter((x) => x.hours * 60 >= need && x.area.center)
    .filter((x) => !wantDays.length || wantDays.includes(x.weekday))
    .filter((x) => part === 'morning' ? x.start < 12 * 60 : part === 'afternoon' ? x.end > 12 * 60 + need : true)
    .map((x) => ({ x, t: timing(x) }))
    .filter(({ t }) => t.ok)
    .map(({ x, t }) => {
      const dist = km(target, x.area.center);
      // Extra driving on each date: previous job -> new home -> next job, minus the direct drive.
      const detours = x.legs.map((l) => {
        if (l.before && l.after) return km(l.before, target) + km(target, l.after) - km(l.before, l.after);
        if (l.before || l.after) return km(l.before || l.after, target);
        return dist;
      });
      const detour = detours.length ? detours.reduce((a, b) => a + b, 0) / detours.length : dist;
      const reasons = [];
      let score = 100 - detour * 5;
      if (want === 1 && x.weeks !== 1) score -= 200;
      if (want === 2) score += x.weeks === 2 ? 30 : x.weeks === 1 ? 5 : -200;
      if (want === 4) score += x.weeks === 4 ? 30 : x.weeks === 2 ? 5 : x.weeks === 1 ? 0 : -200;
      if (want === 0) {
        const ahead = Math.round((Date.parse(`${x.dates[0]}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
        score -= ahead * 0.5;
        reasons.push({ text: ahead <= 7 ? 'This week or next' : `In ${Math.ceil(ahead / 7)} weeks`, tone: ahead <= 7 ? 'good' : 'neutral' });
      } else if (x.takenOn?.length) {
        reasons.push({ text: `First visit ${x.firstDate}: ${x.takenOn.map((t) => t.date).join(', ')} is taken by a moved or one-time booking`, tone: 'neutral' });
      }
      if (want !== 0 && x.weeks === want) reasons.push({ text: { 1: 'Free every week', 2: 'Free every other week: right for this customer', 4: 'Free once every 4 weeks: right for this customer' }[x.weeks] || 'Right frequency', tone: 'good' });
      const extra = driveMin(Math.max(detour, 0));
      if (extra <= 5) reasons.push({ text: `On the team's way (≈${extra} min extra driving)`, tone: 'good' });
      else reasons.push({ text: `≈${extra} min extra driving`, tone: extra <= 15 ? 'neutral' : 'warn' });
      if (x.area.zone && norm(x.area.zone) === norm(target.zone)) (score += 15), reasons.push({ text: `Same area (${x.area.name || x.area.zone})`, tone: 'good' });
      const leftover = x.hours * 60 - need;
      if (leftover < 30) (score += 8), reasons.push({ text: 'Fills the free time exactly', tone: 'good' });
      if (t.lastOfDay) reasons.push({ text: `Back at the office by ${hhmm(t.endAt + (base.lat ? drive(target, base) : 15))}`, tone: 'neutral' });
      const { legs, ...rest } = x;
      return { ...rest, arrive: hhmm(t.startAt), done: hhmm(t.endAt), arriveMin: t.startAt, doneMin: t.endAt, lastOfDay: t.lastOfDay, distanceKm: Math.round(dist * 10) / 10, detourKm: Math.round(Math.max(detour, 0) * 10) / 10, extraDriveMin: extra, score: Math.round(score), reasons };
    })
    .filter((x) => x.score > -100)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
  return { target: { ...target, label }, frequency: want, hours: need / 60, returnBy: hhmm(back), office: { address: base.address, located: Boolean(base.lat) }, results: ranked };
}
