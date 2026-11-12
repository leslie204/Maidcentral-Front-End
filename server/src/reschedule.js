// Rescheduling: move bookings off a date (one customer, or a whole day such as a holiday)
// to the best free slots on the days before and/or after it.
//
// A slot is a gap in a team's route on another date where the visit fits: driving from the
// stop before (or the office, leaving at the departure time), the clean (length scaled to
// the crew), and driving on to the next stop in time (or back to the office by the return
// time). Slots are ranked by: extra driving the visit adds to that route, keeping the
// customer's own team, keeping their usual time, staying close to the original date, and
// (for recurring customers) not landing too close to their previous or next visit.
// A whole day is planned most-constrained first, each pick reserving its slot so no two
// bookings land in the same place. Read-only: it suggests; changes are made in MaidCentral.
import { dayData, analyseDay, parseDay } from './planner.js';
import { book, homeIndex, driveTime, learnPlaces, zones } from './territory.js';
import { road } from './routing.js';
import { areaNames, areaKey } from './areas.js';
import { office } from './office.js';
import { localToday } from './geo.js';
import { McError, mcDate } from './mc.js';
import { frequencyOf } from './schedulekey.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const mod = (iso) => Math.round((Date.parse(`${iso}Z`) % DAY) / MIN);
const hhmm = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(Math.round(m) % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKS = { Weekly: 1, 'Every 2 weeks': 2, 'Every 3 weeks': 3, 'Every 4 weeks': 4 };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const ceil5 = (m) => Math.ceil(m / 5) * 5;

// Reads the date and the days around it.
async function context(mc, date, days) {
  const centre = parseDay(date);
  const span = days === 0 ? 0 : Math.min(Math.max(Number(days) || 7, 1), 21);
  const dates = Array.from({ length: span * 2 + 1 }, (_, i) => iso(centre + (i - span) * DAY));
  // The customer locations and the days are read at once, ten days at a time.
  const analysed = new Array(dates.length);
  let next = 0;
  const readDays = Promise.all(
    Array.from({ length: 10 }, async () => {
      while (next < dates.length) {
        const i = next++;
        analysed[i] = analyseDay(await dayData(mc, parseDay(dates[i])));
      }
    }),
  );
  const [[homes, zs]] = await Promise.all([Promise.all([book(mc), zones(mc).catch(() => [])]), readDays]);
  const lookup = homeIndex(homes);
  const names = areaNames(zs);
  const base = await office(mc, homes);
  await learnPlaces(homes, base);
  return build({ date, dates, analysed, lookup, names, base });
}

// Exported for tests: the days as teams with crews, windows and visits.
export function build({ date, dates, analysed, lookup, names, base }) {
  const where = (title) => {
    const h = lookup(title);
    return h ? { loc: { lat: h.lat, lng: h.lng }, zone: h.zone, area: h.zone ? names.get(areaKey(h.zone))?.label || h.zone : null } : { loc: null, zone: null, area: null };
  };
  const byDate = new Map();
  const teams = new Map();
  dates.forEach((d, i) => {
    const a = analysed[i];
    const list = [];
    for (const t of a.teams) {
      if (!teams.has(t.id)) teams.set(t.id, { id: t.id, name: t.name, color: t.color, textColor: t.textColor });
      const crew = t.members.filter((m) => !m.absent && m.start && m.end).length;
      list.push({
        teamId: t.id,
        team: t.name,
        crew,
        ws: t.window ? mod(t.window.start) : null,
        we: t.window ? mod(t.window.end) : null,
        jobs: t.jobs.map((j) => {
          const s = mod(j.start);
          const e = mod(j.end);
          return { id: j.id, title: j.title, home: String(j.title).split(' - ')[0], s, e, frequency: j.frequency?.short || null, cleanerMin: Math.max(e - s, 15) * Math.max(crew, 1), ...where(j.title) };
        }),
      });
    }
    byDate.set(d, list);
  });
  // MaidCentral sometimes leaves a team's name off a day ("Team 12858"): use its real name
  // from another day.
  const placeholder = (n) => !n || /^Team \d+$/.test(n);
  for (const a of analysed) for (const t of a.teams) if (placeholder(teams.get(t.id).name) && !placeholder(t.name)) Object.assign(teams.get(t.id), { name: t.name, color: t.color, textColor: t.textColor });
  for (const list of byDate.values()) for (const t of list) t.team = teams.get(t.teamId).name;
  // Days the business is closed (a holiday): a weekday with no bookings on any team, or a
  // date in CLOSED_DATES. Nothing is moved onto them.
  const closed = new Set(String(process.env.CLOSED_DATES || '').split(',').map((x) => x.trim()).filter(Boolean));
  for (const [d, list] of byDate) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (d !== date && wd >= 1 && wd <= 5 && list.length && list.every((t) => !t.jobs.length)) closed.add(d);
  }
  return { date, dates, byDate, teams, closed, office: base?.lat ? { lat: base.lat, lng: base.lng } : null };
}

const drive = (a, b) => driveTime(a, b, 12);
// True when the drive is a real road time (not the distance estimate).
const onRoad = (a, b) => Boolean(a && b && road(a, b));

// The bookings on the date.
export function bookingsOf(ctx) {
  return (ctx.byDate.get(ctx.date) || [])
    .flatMap((t) => t.jobs.map((j) => ({ ...j, teamId: t.teamId, team: t.team, crew: t.crew })))
    .sort((a, b) => a.s - b.s || a.team.localeCompare(b.team));
}

// Every slot for one booking, best first. reserved: Map("teamId|date" -> [stops]) holds
// visits already placed by this plan.
function slotsFor(ctx, b, opts, reserved) {
  const out = [];
  const weeks = WEEKS[b.frequency] || 0;
  for (const d of ctx.dates) {
    const away = dayDiff(d, ctx.date);
    if (d <= opts.today || ctx.closed?.has(d)) continue;
    if (away === 0 && !opts.sameDay) continue;
    if (opts.dir === 'before' && away > 0) continue;
    if (opts.dir === 'after' && away < 0) continue;
    for (const t of ctx.byDate.get(d) || []) {
      if (t.ws == null || t.crew < 2) continue;
      const stops = [...t.jobs.filter((j) => j.id !== b.id), ...(reserved.get(`${t.teamId}|${d}`) || [])].sort((x, y) => x.s - y.s);
      const dur = ceil5(b.cleanerMin / t.crew);
      let best = null;
      for (let i = 0; i <= stops.length; i++) {
        const prev = i === 0 ? { e: t.ws, loc: ctx.office, home: 'the office' } : stops[i - 1];
        const next = i === stops.length ? { s: t.we, loc: ctx.office, home: 'the office' } : stops[i];
        const earliest = ceil5(prev.e + drive(prev.loc, b.loc));
        const latest = next.s - drive(b.loc, next.loc) - dur;
        if (latest < earliest) continue;
        const start = Math.min(Math.max(ceil5(b.s), earliest), Math.floor(latest / 5) * 5);
        const detour = Math.max(0, drive(prev.loc, b.loc) + drive(b.loc, next.loc) - drive(prev.loc, next.loc));
        const sameTeam = t.teamId === b.teamId;
        const shift = start - b.s;
        // Recurring customers: keep the visit away from the ones before and after it.
        let spacing = null;
        let spacingPenalty = 0;
        if (weeks) {
          const interval = weeks * 7;
          spacing = Math.min(Math.abs(away + interval), Math.abs(interval - away));
          spacingPenalty = Math.max(0, interval * 0.6 - spacing) * 4;
        }
        const score = detour + (sameTeam ? 0 : 15) + Math.abs(shift) / 10 + Math.abs(away) * 2 + spacingPenalty;
        if (!best || score < best.score) best = { i, prev, next, start, dur, detour, sameTeam, shift, spacing, score };
      }
      if (!best) continue;
      const reasons = [];
      if (best.sameTeam) reasons.push({ text: `Same team (${t.team})`, tone: 'good' });
      const exact = onRoad(best.prev.loc, b.loc) && onRoad(b.loc, best.next.loc) && onRoad(best.prev.loc, best.next.loc);
      const approx = exact ? '' : '≈';
      reasons.push(best.detour <= 5 ? { text: `On ${t.team}'s way (${approx}${best.detour} min extra driving)`, tone: 'good' } : { text: `${approx}${best.detour} min extra driving`, tone: best.detour <= 15 ? 'neutral' : 'warn' });
      reasons.push(Math.abs(best.shift) < 15 ? { text: 'Their usual time', tone: 'good' } : { text: `${Math.round(Math.abs(best.shift) / 15) * 15 >= 60 ? `${Math.round(Math.abs(best.shift) / 30) / 2} h` : `${Math.round(Math.abs(best.shift) / 5) * 5} min`} ${best.shift < 0 ? 'earlier' : 'later'} than usual`, tone: Math.abs(best.shift) <= 60 ? 'neutral' : 'warn' });
      if (weeks && best.spacing < weeks * 7 * 0.6) reasons.push({ text: `Only ${best.spacing} days from their ${dayDiff(d, ctx.date) > 0 ? 'next' : 'previous'} visit`, tone: 'warn' });
      out.push({
        date: d,
        weekday: WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()],
        daysAway: away,
        teamId: t.teamId,
        team: t.team,
        start: best.start,
        end: best.start + best.dur,
        label: `${hhmm(best.start)} – ${hhmm(best.start + best.dur)}`,
        between: [best.prev.home, best.next.home],
        extraDriveMin: best.detour,
        exactDrive: exact,
        sameTeam: best.sameTeam,
        shiftMin: best.shift,
        score: Math.round(best.score),
        reasons,
      });
    }
  }
  return out.sort((x, y) => x.score - y.score);
}

function optsFrom(q) {
  return {
    dir: ['before', 'after'].includes(q.dir) ? q.dir : 'either',
    sameDay: q.sameDay === true || q.sameDay === 'true',
    today: q.today || localToday(),
  };
}

// Picks the office already made: { jobId: { date, teamId, start } } -> reserved stops.
function reservedFrom(ctx, picks, bookings) {
  const reserved = new Map();
  for (const [id, p] of Object.entries(picks || {})) {
    const b = bookings.find((x) => String(x.id) === String(id));
    const t = (ctx.byDate.get(p.date) || []).find((x) => x.teamId === Number(p.teamId));
    if (!b || !t || !Number.isFinite(Number(p.start))) continue;
    const k = `${t.teamId}|${p.date}`;
    if (!reserved.has(k)) reserved.set(k, []);
    reserved.get(k).push({ id: b.id, s: Number(p.start), e: Number(p.start) + ceil5(b.cleanerMin / Math.max(t.crew, 1)), loc: b.loc, home: b.home });
  }
  return reserved;
}
const parsePicks = (v) => {
  try {
    return typeof v === 'string' ? (v ? JSON.parse(v) : {}) : v || {};
  } catch {
    throw new McError('input', 'The chosen slots could not be read.');
  }
};

const view = (b) => ({ id: b.id, title: b.title, home: b.home, customer: String(b.title).split(' - ').slice(1).join(' - ').trim() || null, area: b.area, team: b.team, teamId: b.teamId, start: b.s, end: b.e, label: `${hhmm(b.s)} – ${hhmm(b.e)}`, frequency: b.frequency, cleanerHours: Math.round((b.cleanerMin / 60) * 10) / 10, located: Boolean(b.loc) });

export async function rescheduleDay(mc, q = {}) {
  if (!q.date) throw new McError('input', 'Choose a date.');
  const ctx = await context(mc, q.date, 0);
  return { date: q.date, weekday: WEEKDAY[new Date(`${q.date}T00:00:00Z`).getUTCDay()], bookings: bookingsOf(ctx).map(view), teams: [...ctx.teams.values()] };
}

// A customer's upcoming bookings (next 4 weeks), for when they call: the office knows the
// name, not always the date.
export async function findBookings(mc, q = {}) {
  const words = String(q.q || '').toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  // warm=1: just load the next 4 weeks (when the page opens), so the first search is quick.
  if (!words.length && !q.warm) throw new McError('input', 'Type at least 2 letters of the name.');
  const from = q.today || localToday();
  const start = parseDay(from);
  const dates = Array.from({ length: 28 }, (_, i) => iso(start + i * DAY));
  // Only the job lists (one request a day); team names and colours from the next few days.
  const [homes, zs, full] = await Promise.all([
    book(mc),
    zones(mc).catch(() => []),
    Promise.all(dates.slice(0, 3).map((d) => dayData(mc, parseDay(d)).then(analyseDay))),
  ]);
  const lookup = homeIndex(homes);
  const names = areaNames(zs);
  const teams = new Map();
  for (const a of full) for (const t of a.teams) if (!teams.has(t.id) || /^Team \d+$/.test(teams.get(t.id).name)) teams.set(t.id, { id: t.id, name: t.name, color: t.color, textColor: t.textColor });
  const lists = new Array(dates.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < dates.length) {
        const i = next++;
        lists[i] = await dayData(mc, parseDay(dates[i]), { jobsOnly: true });
      }
    }),
  );
  const out = [];
  lists.forEach((day, i) => {
    for (const j of q.warm ? [] : day.jobs) {
      const title = String(j.Title || '').trim();
      if (!words.every((w) => title.toLowerCase().includes(w))) continue;
      const s0 = mcDate(j.Start);
      const e0 = mcDate(j.End);
      if (!s0 || !e0) continue;
      const h = lookup(title);
      const team = teams.get(j.TeamID) || { id: j.TeamID || 0, name: j.TeamID ? `Team ${j.TeamID}` : 'No team' };
      const s = Math.round((s0 % DAY) / MIN);
      const e = Math.round((e0 % DAY) / MIN);
      out.push({
        ...view({ id: j.JobInformationId, title, home: title.split(' - ')[0], s, e, cleanerMin: (e - s) * 2, frequency: frequencyOf(day.key, j.FrequencyColor)?.short || null, loc: h ? { lat: h.lat, lng: h.lng } : null, area: h?.zone ? names.get(areaKey(h.zone))?.label || h.zone : null, teamId: team.id, team: team.name }),
        date: dates[i],
        weekday: WEEKDAY[new Date(`${dates[i]}T00:00:00Z`).getUTCDay()],
      });
    }
  });
  return { q: q.q, from, results: out.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start).slice(0, 30), teams: [...teams.values()] };
}

// Best slots for one booking (the common case: one customer needs another day).
export async function rescheduleOptions(mc, q = {}) {
  if (!q.date || !q.job) throw new McError('input', 'Choose a date and a booking.');
  const ctx = await context(mc, q.date, q.days);
  return optionsFor(ctx, q);
}
export function optionsFor(ctx, q) {
  const bookings = bookingsOf(ctx);
  const b = bookings.find((x) => String(x.id) === String(q.job));
  if (!b) throw new McError('input', 'That booking is not on this date.');
  const picks = parsePicks(q.picks);
  delete picks[String(b.id)];
  const slots = slotsFor(ctx, b, optsFrom(q), reservedFrom(ctx, picks, bookings));
  return { booking: view(b), slots: slots.slice(0, Number(q.limit) || 12), considered: slots.length, teams: [...ctx.teams.values()], drives: slots.some((x) => x.exactDrive) ? 'road' : 'estimate' };
}

// The whole day (or the chosen bookings) spread over the days around it.
export async function reschedulePlan(mc, q = {}) {
  if (!q.date) throw new McError('input', 'Choose a date.');
  const ctx = await context(mc, q.date, q.days);
  return planFor(ctx, q);
}
export function planFor(ctx, q) {
  const opts = optsFrom(q);
  const all = bookingsOf(ctx);
  const only = new Set(String(q.jobs || '').split(',').filter(Boolean));
  const skip = new Set(String(q.skip || '').split(',').filter(Boolean));
  const listed = only.size ? all.filter((b) => only.has(String(b.id))) : all;
  // Skipped (cancelled) visits stay listed but take no slot.
  const bookings = listed.filter((b) => !skip.has(String(b.id)));
  const picks = parsePicks(q.picks);
  const reserved = reservedFrom(ctx, picks, all);
  const chosen = new Map();
  for (const [id, p] of Object.entries(picks)) chosen.set(String(id), { ...p, fixed: true });
  let left = bookings.filter((b) => !chosen.has(String(b.id)));
  // Most constrained first (fewest good slots), then the longest clean.
  while (left.length) {
    const ranked = left.map((b) => ({ b, slots: slotsFor(ctx, b, opts, reserved) })).sort((x, y) => x.slots.filter((s) => s.score < 60).length - y.slots.filter((s) => s.score < 60).length || y.b.cleanerMin - x.b.cleanerMin);
    const { b, slots } = ranked[0];
    left = left.filter((x) => x !== b);
    const s = slots[0];
    if (!s) {
      chosen.set(String(b.id), null);
      continue;
    }
    chosen.set(String(b.id), s);
    const k = `${s.teamId}|${s.date}`;
    if (!reserved.has(k)) reserved.set(k, []);
    reserved.get(k).push({ id: b.id, s: s.start, e: s.end, loc: b.loc, home: b.home });
  }
  // Each booking's pick and alternatives (with everyone else's picks reserved).
  const rows = listed.map((b) => {
    if (skip.has(String(b.id))) return { booking: view(b), pick: null, alternatives: [], skipped: true };
    const others = new Map([...reserved].map(([k, v]) => [k, v.filter((x) => x.id !== b.id)]));
    const slots = slotsFor(ctx, b, opts, others);
    const c = chosen.get(String(b.id));
    let pick = c ? slots.find((s) => s.date === c.date && s.teamId === Number(c.teamId)) || null : null;
    if (c?.fixed) {
      // The office's own choice: keep its exact time.
      const t = (ctx.byDate.get(c.date) || []).find((x) => x.teamId === Number(c.teamId));
      const start = Number(c.start);
      const end = start + ceil5(b.cleanerMin / Math.max(t?.crew || 2, 1));
      pick = { ...(pick || { date: c.date, weekday: WEEKDAY[new Date(`${c.date}T00:00:00Z`).getUTCDay()], daysAway: dayDiff(c.date, ctx.date), teamId: Number(c.teamId), team: t?.team || '', reasons: [] }), start, end, label: `${hhmm(start)} – ${hhmm(end)}`, fixed: true };
    }
    return { booking: view(b), pick: pick ? { ...pick, fixed: Boolean(c?.fixed) } : null, alternatives: slots.filter((s) => !(pick && s.date === pick.date && s.teamId === pick.teamId)).slice(0, 4) };
  });
  return {
    date: ctx.date,
    options: { dir: opts.dir, days: Math.round((ctx.dates.length - 1) / 2), sameDay: opts.sameDay },
    rows,
    placed: rows.filter((r) => r.pick).length,
    unplaced: rows.filter((r) => !r.pick && !r.skipped).length,
    teams: [...ctx.teams.values()],
  };
}
