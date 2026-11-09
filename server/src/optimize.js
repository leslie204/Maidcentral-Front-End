// Schedule & route optimization: where the 4-week cycle stands today, what a better
// organised schedule would look like under the constraints the office chooses, and the
// specific, costed and phased changes that get there.
//
// How it works
// - The 4-week cycle from this Monday is read from MaidCentral: every team-day (crew size,
//   working window from leaving the office to the return time) and every job (booked time,
//   length, location from the Customer Efficiency Map, frequency).
// - Jobs are grouped into "series": one customer's recurring visits on one weekday (weekly =
//   4 visits in the cycle, every other week = 2, every 4 weeks = 1). Series move as a whole,
//   so a customer keeps one team, one weekday and their cadence.
// - Current state: each team-day as booked: driving (straight line x 1.3 at 40 km/h),
//   on-site time, idle time, and free time that could be sold (blocks of at least minBlock).
// - Optimised state: a local search under the constraints (how far times may move, whether
//   customers may change team or day, territories, maximum driving). Each day's route is
//   re-ordered and tightened; series are moved between teams and days (or swapped) when that
//   cuts driving and fragmented idle time. Every accepted change becomes a recommendation.
// - Recommendations are then replayed in order (re-sequencing first, then moves) so each
//   one's benefit is its exact marginal effect and any selection can be re-evaluated.
// The engine works in minutes and kilometres; dollars are applied in the browser from the
// office's own assumptions (labour cost, pay model, cost per km, revenue per cleaner-hour).
// Read-only: it recommends; changes are made in MaidCentral.
import { dayData, analyseDay, parseDay } from './planner.js';
import { book, homeIndex, km, driveMin, zones } from './territory.js';
import { areaNames, areaKey } from './areas.js';
import { office, returnBy, leaveAt } from './office.js';
import { revenueRate } from './callouts.js';
import { McError } from './mc.js';
import { perSession, FRESH } from './cache.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const ROAD = 1.3; // road distance vs straight line
const UNKNOWN_KM = 6; // a stop without a known location
const mod = (iso) => Math.round((Date.parse(`${iso}Z`) % DAY) / MIN);
const hhmm = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(Math.round(m) % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKS = { Weekly: 1, 'Every 2 weeks': 2, 'Every 3 weeks': 3, 'Every 4 weeks': 4 };
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

// Strategies the office can start from; every value can be changed.
//   early/late: minutes an appointment may move earlier/later; teams/days: may a customer
//   change team / weekday; territories: teams stay in the areas they already serve;
//   protectWeekly: weekly customers keep their team and day; maxDrive: most driving per car
//   per day (0 = no limit); minBlock: shortest free block worth selling (car minutes).
export const PRESETS = {
  minimal: { label: 'Minimum disruption', early: 15, late: 30, teams: false, days: false, territories: true, protectWeekly: true, maxDrive: 0, minBlock: 120 },
  balanced: { label: 'Balanced', early: 30, late: 60, teams: true, days: false, territories: true, protectWeekly: true, maxDrive: 0, minBlock: 120 },
  maximum: { label: 'Maximum profit', early: 60, late: 120, teams: true, days: true, territories: false, protectWeekly: false, maxDrive: 0, minBlock: 120 },
  rebuild: { label: 'Rebuild from scratch', early: 600, late: 600, teams: true, days: true, territories: false, protectWeekly: false, maxDrive: 0, minBlock: 120 },
};

export function constraintsFrom(q = {}) {
  const base = PRESETS[q.preset] || PRESETS.balanced;
  const num = (v, d, lo, hi) => (v === undefined || v === '' ? d : Math.min(Math.max(Number(v) || 0, lo), hi));
  const bool = (v, d) => (v === undefined || v === '' ? d : v === true || v === 'true' || v === '1');
  return {
    early: num(q.early, base.early, 0, 600),
    late: num(q.late, base.late, 0, 600),
    teams: bool(q.teams, base.teams),
    days: bool(q.days, base.days),
    territories: bool(q.territories, base.territories),
    protectWeekly: bool(q.protectWeekly, base.protectWeekly),
    maxDrive: num(q.maxDrive, base.maxDrive, 0, 600),
    minBlock: num(q.minBlock, base.minBlock, 30, 480),
  };
}

// ---------- The 4-week cycle as data ----------

const datasets = perSession(); // McSession -> Map(from -> { at, value, pending })
const progress = new WeakMap();
export function optimizeStatus(mc) {
  return progress.get(mc) || null;
}

async function dataset(mc, from) {
  if (!datasets.has(mc)) datasets.set(mc, new Map());
  const m = datasets.get(mc);
  const hit = m.get(from);
  if (hit?.value && Date.now() - hit.at < FRESH.fourWeeks) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = load(mc, from).then(
    (value) => (m.set(from, { at: Date.now(), value }), value),
    (e) => (m.delete(from), Promise.reject(e)),
  );
  m.set(from, { pending });
  return pending;
}

async function load(mc, from) {
  const start = parseDay(from);
  if (new Date(start).getUTCDay() !== 1) throw new McError('input', 'The cycle starts on a Monday.');
  const prog = { stage: 'locations', done: 0, total: 28 };
  progress.set(mc, prog);
  try {
    const [homes, zs, rate] = await Promise.all([book(mc), zones(mc), revenueRate(mc).catch(() => ({ rate: null, jobs: 0 }))]);
    const lookup = homeIndex(homes);
    const base = await office(mc, homes);
    const names = areaNames(zs);
    prog.stage = 'schedule';
    const dates = Array.from({ length: 28 }, (_, i) => start + i * DAY);
    const days = new Array(28);
    let next = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (next < 28) {
          const i = next++;
          days[i] = analyseDay(await dayData(mc, dates[i]));
          prog.done += 1;
        }
      }),
    );
    return build({ days, lookup, base, names, rate });
  } finally {
    progress.delete(mc);
  }
}

// Exported for tests: builds the dataset from analysed days.
export function build({ days, lookup, base, names, rate }) {
  const leave = leaveAt();
  const back = returnBy();
  const teams = new Map();
  const teamDays = new Map();
  const jobs = [];
  let unassigned = 0;
  days.forEach((d, i) => {
    const weekday = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    unassigned += d.issues.filter((x) => x.kind === 'unassigned').reduce((s, x) => s + (x.jobs?.length || 0), 0);
    for (const t of d.teams) {
      if (!teams.has(t.id)) teams.set(t.id, { id: t.id, name: t.name, color: t.color, textColor: t.textColor });
      const crew = t.members.filter((x) => !x.absent && x.start && x.end).length;
      if (!t.window && !t.jobs.length) continue;
      const td = {
        key: `${t.id}|${i}`,
        teamId: t.id,
        team: t.name,
        i,
        date: d.date,
        weekday,
        week: Math.floor(i / 7),
        size: Math.max(crew, t.jobs.length ? 2 : 1),
        noStaff: !crew,
        ws: t.window ? mod(t.window.start) : leave,
        we: t.window ? mod(t.window.end) : back,
        jobIds: [],
      };
      teamDays.set(td.key, td);
      for (const j of t.jobs) {
        const s = mod(j.start);
        const e = mod(j.end);
        const h = lookup(j.title);
        const job = {
          id: j.id,
          title: j.title,
          home: String(j.title).split(' - ')[0],
          teamId: t.id,
          i,
          T: s,
          dur: Math.max(e - s, 15),
          cleanerMin: Math.max(e - s, 15) * td.size,
          loc: h ? { lat: h.lat, lng: h.lng } : null,
          zone: h?.zone || null,
          area: h?.zone ? names.get(areaKey(h.zone))?.label || h.zone : null,
          frequency: j.frequency?.short || null,
          weeks: WEEKS[j.frequency?.short] || 0,
          homeKey: h ? norm(`${h.home}|${h.customer}`) : norm(j.title),
        };
        jobs.push(job);
        td.jobIds.push(job.id);
      }
    }
  });
  // Teams without a single job in the 4 weeks aren't working cars (placeholder teams).
  const working = new Set(jobs.map((j) => j.teamId));
  for (const [k, td] of teamDays) if (!working.has(td.teamId)) teamDays.delete(k);
  for (const id of [...teams.keys()]) if (!working.has(id)) teams.delete(id);
  // Series: one customer's visits on one weekday.
  const series = new Map();
  for (const j of jobs) {
    const wd = teamDays.get(`${j.teamId}|${j.i}`).weekday;
    const key = `${j.homeKey}|${wd}`;
    if (!series.has(key)) series.set(key, { id: `s${series.size + 1}`, key, weekday: wd, jobs: [], home: j.home, title: j.title, loc: j.loc, zone: j.zone, area: j.area, frequency: j.frequency, weeks: j.weeks });
    const s = series.get(key);
    s.jobs.push(j);
    j.seriesId = s.id;
    if (!s.frequency && j.frequency) (s.frequency = j.frequency), (s.weeks = j.weeks);
  }
  const byId = new Map([...series.values()].map((s) => [s.id, s]));
  for (const s of byId.values()) {
    const count = {};
    for (const j of s.jobs) count[j.teamId] = (count[j.teamId] || 0) + 1;
    s.teamId = Number(Object.entries(count).sort((a, b) => b[1] - a[1])[0][0]);
    s.recurring = s.weeks >= 1;
    s.cleanerMin = Math.round(s.jobs.reduce((a, j) => a + j.cleanerMin, 0) / s.jobs.length);
  }
  // Each team's territory: the areas holding 85% of its jobs.
  const territory = new Map();
  for (const t of teams.values()) {
    const z = {};
    const mine = jobs.filter((j) => j.teamId === t.id && j.zone);
    for (const j of mine) z[j.zone] = (z[j.zone] || 0) + 1;
    const sorted = Object.entries(z).sort((a, b) => b[1] - a[1]);
    const keep = new Set();
    let n = 0;
    for (const [zone, c] of sorted) {
      if (n >= mine.length * 0.85) break;
      keep.add(zone);
      n += c;
    }
    territory.set(t.id, keep);
  }
  return {
    teams,
    teamDays,
    jobs: new Map(jobs.map((j) => [j.id, j])),
    series: byId,
    territory,
    office: base?.lat ? { lat: base.lat, lng: base.lng } : null,
    rate: rate?.rate ? round(rate.rate, 2) : null,
    rateJobs: rate?.jobs || 0,
    unassigned,
    leave,
    back,
  };
}

// ---------- One team-day ----------

const leg = (a, b) => {
  const k = a && b ? km(a, b) * ROAD : UNKNOWN_KM;
  return { km: k, min: driveMin(k / ROAD) };
};

// Free time in a day split into sellable blocks and fragments.
function freeTime(intervals, minBlock) {
  let sellable = 0;
  let frag = 0;
  const blocks = [];
  for (const f of intervals) {
    if (f.len <= 0) continue;
    if (f.len >= minBlock) (sellable += f.len), blocks.push(f);
    else frag += f.len;
  }
  return { sellable, frag, blocks };
}

function makeEval(ds, C) {
  const memo = new Map();
  const at0 = ds.office;
  // The day exactly as booked: booked times, in time order.
  const booked = (td, jobs) => {
    const list = [...jobs].sort((a, b) => a.T - b.T);
    let t = td.ws;
    let at = at0;
    let drive = 0;
    let dist = 0;
    let onsite = 0;
    const free = [];
    const stops = [];
    let prevZone = null;
    for (const j of list) {
      const l = leg(at, j.loc);
      drive += l.min;
      dist += l.km;
      free.push({ len: j.T - l.min - t, start: t, nearZone: prevZone || j.area });
      const end = j.T + j.dur;
      stops.push({ id: j.id, start: j.T, end });
      onsite += j.dur;
      t = Math.max(t, end);
      at = j.loc;
      prevZone = j.area || prevZone;
    }
    const home = list.length ? leg(at, at0) : { km: 0, min: 0 };
    drive += home.min;
    dist += home.km;
    const backAt = list.length ? t + home.min : td.ws;
    free.push({ len: td.we - backAt, start: backAt, nearZone: prevZone });
    return finish(td, { ok: true, drive, km: dist, onsite, stops, backAt, free, jobs: list.length });
  };
  const finish = (td, m) => {
    const f = freeTime(m.free, C.minBlock);
    const over = Math.max(0, m.backAt - td.we);
    return {
      ...m,
      sellable: f.sellable,
      frag: f.frag,
      blocks: f.blocks.map((b) => ({ start: b.start, len: b.len, zone: b.nearZone })),
      over,
      cost: (m.drive + 0.5 * f.frag + 3 * over) * td.size,
    };
  };
  // A given order, as early as allowed: each visit starts when the car gets there, but not
  // more than `early` before its booked time and never more than `late` after it.
  const schedule = (td, order) => {
    let t = td.ws;
    let at = at0;
    let drive = 0;
    let dist = 0;
    let onsite = 0;
    const free = [];
    const stops = [];
    let prevZone = null;
    for (const j of order) {
      const l = leg(at, j.loc);
      const start = Math.max(t + l.min, j.T - C.early);
      if (start > j.T + C.late) return null;
      const dur = Math.ceil(j.cleanerMin / td.size / 5) * 5;
      free.push({ len: start - l.min - t, start: t, nearZone: prevZone || j.area });
      drive += l.min;
      dist += l.km;
      onsite += dur;
      stops.push({ id: j.id, start, end: start + dur });
      t = start + dur;
      at = j.loc;
      prevZone = j.area || prevZone;
    }
    const home = order.length ? leg(at, at0) : { km: 0, min: 0 };
    drive += home.min;
    dist += home.km;
    const backAt = order.length ? t + home.min : td.ws;
    if (backAt > td.we) return null;
    if (C.maxDrive && drive > C.maxDrive) return null;
    free.push({ len: td.we - backAt, start: backAt, nearZone: prevZone });
    return finish(td, { ok: true, drive, km: dist, onsite, stops, backAt, free, jobs: order.length });
  };
  // Re-ordered and tightened (or null if it can't be done within the constraints).
  const flex = (td, jobs) => {
    const key = `${td.key}:${jobs.map((j) => j.id).sort((a, b) => a - b).join(',')}`;
    if (memo.has(key)) return memo.get(key);
    let order = [...jobs].sort((a, b) => a.T - b.T);
    let best = schedule(td, order);
    if (best && order.length > 2) {
      for (let pass = 0; pass < 3; pass++) {
        let improved = false;
        for (let i = 0; i < order.length; i++) {
          for (let k = 0; k < order.length; k++) {
            if (i === k) continue;
            const o = [...order];
            const [x] = o.splice(i, 1);
            o.splice(k, 0, x);
            const m = schedule(td, o);
            if (m && m.cost < best.cost - 0.01) (best = m), (order = o), (improved = true);
          }
        }
        if (!improved) break;
      }
    }
    memo.set(key, best);
    return best;
  };
  return { booked, flex };
}

// ---------- Optimise ----------

// One team-day for drawing: its visits (who, when) and how long it drives.
function dayView(ds, key, m) {
  const td = ds.teamDays.get(key);
  return {
    key,
    teamId: td.teamId,
    team: td.team,
    date: td.date,
    weekday: WEEKDAY[td.weekday],
    week: td.week + 1,
    ws: td.ws,
    we: td.we,
    drive: m ? m.drive : 0,
    back: m && m.jobs ? m.backAt : null,
    stops: (m?.stops || []).map((st) => {
      const j = ds.jobs.get(st.id);
      return { id: st.id, home: j.home, area: j.area, frequency: j.frequency, start: st.start, end: st.end, was: j.T, fromKey: `${j.teamId}|${j.i}` };
    }),
  };
}

// Totals over team-days (minutes are car minutes unless "cleaner").
function totals(ds, dayMetrics) {
  const out = { teamDays: 0, jobs: 0, driveMin: 0, km: 0, driveCleanerMin: 0, onsiteCleanerMin: 0, paidFixedCleanerMin: 0, paidRouteCleanerMin: 0, sellableCleanerMin: 0, fragCleanerMin: 0, overtimeCleanerMin: 0, emptyTeamDays: 0, sellableCarMin: 0 };
  for (const [key, m] of dayMetrics) {
    const td = ds.teamDays.get(key);
    if (!m) continue;
    out.teamDays += 1;
    out.jobs += m.jobs;
    if (!m.jobs) out.emptyTeamDays += 1;
    out.driveMin += m.drive;
    out.km += m.km;
    out.driveCleanerMin += m.drive * td.size;
    out.onsiteCleanerMin += m.onsite * td.size;
    out.paidFixedCleanerMin += (td.we - td.ws) * td.size;
    out.paidRouteCleanerMin += Math.max(m.backAt - td.ws, 0) * td.size;
    out.sellableCleanerMin += m.sellable * td.size;
    out.sellableCarMin += m.sellable;
    out.fragCleanerMin += m.frag * td.size;
    out.overtimeCleanerMin += m.over * td.size;
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k]);
  out.utilisation = out.paidFixedCleanerMin ? round((out.onsiteCleanerMin / out.paidFixedCleanerMin) * 100, 1) : 0;
  out.routeUtilisation = out.paidRouteCleanerMin ? round((out.onsiteCleanerMin / out.paidRouteCleanerMin) * 100, 1) : 0;
  return out;
}

const DELTA_KEYS = ['driveMin', 'km', 'driveCleanerMin', 'paidRouteCleanerMin', 'sellableCleanerMin', 'fragCleanerMin', 'overtimeCleanerMin', 'emptyTeamDays'];
function diff(ds, before, after) {
  const a = totals(ds, before);
  const b = totals(ds, after);
  return Object.fromEntries(DELTA_KEYS.map((k) => [k, b[k] - a[k]]));
}

// The day a series' visit lands on when the series moves to another weekday.
const dayIndex = (i, weekday) => Math.floor(i / 7) * 7 + ((weekday + 6) % 7);

function search(ds, C, ev) {
  const started = Date.now();
  const budget = 8000;
  const assign = new Map(); // jobId -> dayKey
  const dayJobs = new Map(); // dayKey -> [job]
  for (const [key, td] of ds.teamDays) dayJobs.set(key, td.jobIds.map((id) => ds.jobs.get(id)));
  for (const [key, list] of dayJobs) for (const j of list) assign.set(j.id, key);
  const changed = new Set(); // days whose jobs changed (must work re-planned)
  const value = (key, list, mustFlex) => {
    const td = ds.teamDays.get(key);
    const f = ev.flex(td, list);
    if (f) return f;
    return mustFlex ? null : ev.booked(td, list);
  };
  const cur = new Map([...dayJobs].map(([k, l]) => [k, value(k, l, false)]));
  const moves = [];
  const seriesList = [...ds.series.values()].filter((s) => s.loc);
  const near = (s, list) => {
    const others = list.filter((j) => j.seriesId !== s.id && j.loc);
    if (!others.length) return ds.office ? km(s.loc, ds.office) : 8;
    return Math.min(...others.map((j) => km(s.loc, j.loc)));
  };
  // Where a series' visits would go for a target team and weekday (null if not possible).
  const targetDays = (s, teamId, weekday) => {
    const keys = [];
    for (const j of s.jobs) {
      const k = `${teamId}|${dayIndex(j.i, weekday)}`;
      if (!ds.teamDays.has(k) || ds.teamDays.get(k).noStaff) return null;
      keys.push(k);
    }
    return keys;
  };
  const tryApply = (plan) => {
    // plan: [{ job, to }]; evaluates every touched day; returns delta cost and new values.
    const lists = new Map();
    const touch = (k) => lists.has(k) || lists.set(k, [...dayJobs.get(k)]);
    for (const { job, to } of plan) {
      const from = assign.get(job.id);
      touch(from);
      touch(to);
      lists.set(from, lists.get(from).filter((x) => x.id !== job.id));
      lists.get(to).push(job);
    }
    let delta = 0;
    const vals = new Map();
    for (const [k, l] of lists) {
      const gained = plan.some((p) => p.to === k && assign.get(p.job.id) !== k);
      const v = value(k, l, gained || changed.has(k));
      if (!v) return null;
      vals.set(k, v);
      delta += v.cost - (cur.get(k)?.cost || 0);
    }
    return { delta, lists, vals };
  };
  const commit = (r, plan) => {
    for (const [k, l] of r.lists) (dayJobs.set(k, l), cur.set(k, r.vals.get(k)), changed.add(k));
    for (const { job, to } of plan) assign.set(job.id, to);
  };
  const weekdays = [1, 2, 3, 4, 5];
  for (let pass = 0; pass < 8 && Date.now() - started < budget; pass++) {
    let improved = 0;
    // Costliest series first: the ones a route goes furthest out of its way for.
    const order = seriesList
      .map((s) => ({ s, far: Math.min(...s.jobs.map((j) => near(s, dayJobs.get(assign.get(j.id)) || []))) }))
      .sort((a, b) => b.far - a.far);
    for (const { s } of order) {
      if (Date.now() - started > budget) break;
      const protectedSeries = C.protectWeekly && s.weeks === 1;
      const curTeams = new Set(s.jobs.map((j) => ds.teamDays.get(assign.get(j.id)).teamId));
      const curWd = ds.teamDays.get(assign.get(s.jobs[0].id)).weekday;
      const wds = C.days && s.recurring && !protectedSeries ? weekdays : [curWd];
      const teamIds = C.teams && !protectedSeries ? [...ds.teams.keys()] : [...curTeams];
      const cands = [];
      for (const w of wds) {
        for (const t of teamIds) {
          if (w === curWd && curTeams.size === 1 && curTeams.has(t)) continue;
          if (C.territories && s.zone && !curTeams.has(t) && !ds.territory.get(t)?.has(s.zone)) continue;
          const keys = targetDays(s, t, w);
          if (!keys) continue;
          const d = Math.max(...keys.map((k) => near(s, dayJobs.get(k))));
          if (d > 15) continue;
          cands.push({ t, w, keys, d });
        }
      }
      cands.sort((a, b) => a.d - b.d);
      let best = null;
      for (const c of cands.slice(0, 14)) {
        const plan = s.jobs.map((job, n) => ({ job, to: c.keys[n] }));
        const r = tryApply(plan);
        if (r && (!best || r.delta < best.r.delta)) best = { r, plan, c, kind: 'move' };
        // The target is full: swap with the visit there that sits nearest our current route.
        if (!r && C.teams && c.w === curWd && !curTeams.has(c.t)) {
          const fromDays = s.jobs.map((j) => assign.get(j.id));
          const partners = [...new Set(c.keys.flatMap((k) => dayJobs.get(k).map((j) => j.seriesId)))]
            .map((id) => ds.series.get(id))
            .filter((p) => p.id !== s.id && p.loc && p.jobs.length === s.jobs.length && !(C.protectWeekly && p.weeks === 1))
            .filter((p) => p.jobs.every((j, n) => assign.get(j.id) === c.keys[n]) && !(C.territories && p.zone && !ds.territory.get(ds.teamDays.get(fromDays[0]).teamId)?.has(p.zone)))
            .map((p) => ({ p, d: Math.min(...fromDays.map((k) => near(p, dayJobs.get(k)))) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 5);
          for (const { p } of partners) {
            const swap = [...plan, ...p.jobs.map((job, n) => ({ job, to: fromDays[n] }))];
            const r2 = tryApply(swap);
            if (r2 && (!best || r2.delta < best.r.delta)) best = { r: r2, plan: swap, c, kind: 'swap', partner: p };
          }
        }
      }
      // Worth doing: at least 10 cleaner-minutes better over the cycle.
      if (best && best.r.delta < -10) {
        commit(best.r, best.plan);
        moves.push({ kind: best.kind, seriesId: s.id, partnerId: best.partner?.id || null, plan: best.plan.map((p) => ({ jobId: p.job.id, to: p.to })), fromTeam: [...curTeams][0], fromWeekday: curWd, toTeam: best.c.t, toWeekday: best.c.w });
        improved += 1;
      }
    }
    if (!improved) break;
  }
  return { moves, seconds: round((Date.now() - started) / 1000, 1) };
}

// Replays recommendations (in order, only the chosen ones) from the schedule as booked.
// Re-sequenced and touched days are re-planned; untouched days stay exactly as booked.
function replay(ds, C, ev, recs, chosen) {
  const dayJobs = new Map([...ds.teamDays].map(([k, td]) => [k, td.jobIds.map((id) => ds.jobs.get(id))]));
  const assign = new Map();
  for (const [k, l] of dayJobs) for (const j of l) assign.set(j.id, k);
  const flexDays = new Set();
  const metric = (k) => {
    const td = ds.teamDays.get(k);
    const l = dayJobs.get(k);
    if (flexDays.has(k)) return ev.flex(td, l);
    return ev.booked(td, l);
  };
  const metrics = new Map([...dayJobs.keys()].map((k) => [k, metric(k)]));
  const results = [];
  for (const rec of recs) {
    if (chosen && !chosen.has(rec.id)) continue;
    const before = new Map();
    const keys = new Set();
    const saved = { dayJobs: new Map(), assign: new Map(), flex: new Set(flexDays) };
    if (rec.kind === 'resequence') {
      for (const k of rec.days) keys.add(k);
    } else {
      for (const p of rec.plan) {
        const from = assign.get(p.jobId);
        keys.add(from);
        keys.add(p.to);
      }
      for (const k of keys) saved.dayJobs.set(k, dayJobs.get(k));
      for (const p of rec.plan) {
        const job = ds.jobs.get(p.jobId);
        const from = assign.get(p.jobId);
        saved.assign.set(p.jobId, from);
        dayJobs.set(from, dayJobs.get(from).filter((x) => x.id !== job.id));
        dayJobs.set(p.to, [...dayJobs.get(p.to), job]);
        assign.set(p.jobId, p.to);
      }
    }
    // Days that gain a visit (or are re-ordered) are re-planned; a day that only loses one
    // is re-planned if it can be, otherwise it keeps its booked times.
    const gaining = new Set(rec.kind === 'resequence' ? rec.days : rec.plan.filter((p) => saved.assign.get(p.jobId) !== p.to).map((p) => p.to));
    for (const k of keys) (before.set(k, metrics.get(k)), flexDays.add(k));
    const after = new Map();
    for (const k of keys) {
      let v = metric(k);
      if (!v && !gaining.has(k) && !saved.flex.has(k)) (flexDays.delete(k), (v = metric(k)));
      after.set(k, v);
    }
    // A day that can't be re-planned this way (it depends on another change): undo.
    const blocked = [...keys].filter((k) => !after.get(k));
    if (blocked.length) {
      for (const [k, l] of saved.dayJobs) dayJobs.set(k, l);
      for (const [id, k] of saved.assign) assign.set(id, k);
      flexDays.clear();
      for (const k of saved.flex) flexDays.add(k);
      results.push({ id: rec.id, applied: false });
      continue;
    }
    for (const [k, v] of after) metrics.set(k, v);
    // Where this change puts its customers (right after it, before any later change).
    const mine = new Set(rec.kind === 'resequence' ? rec.days.flatMap((k) => ds.teamDays.get(k).jobIds) : rec.plan.map((p) => p.jobId));
    const placed = new Map();
    for (const [k, v] of after) for (const st of v.stops) if (mine.has(st.id)) placed.set(st.id, { start: st.start, day: k });
    results.push({ id: rec.id, applied: true, delta: diff(ds, before, after), placed, views: { before: [...before].map(([k, v]) => dayView(ds, k, v)), after: [...after].map(([k, v]) => dayView(ds, k, v)) } });
  }
  return { metrics, dayJobs, assign, results };
}

// ---------- The report ----------

const runs = perSession(); // McSession -> Map(key -> { at, value })

export async function optimize(mc, q = {}) {
  const from = q.from;
  if (!from) throw new McError('input', 'Choose the Monday the 4-week cycle starts on.');
  const C = constraintsFrom(q);
  const ds = await dataset(mc, from);
  if (!runs.has(mc)) runs.set(mc, new Map());
  const m = runs.get(mc);
  const key = JSON.stringify([from, C]);
  const hit = m.get(key);
  if (hit && hit.ds === ds) return hit.value;
  const value = run(ds, C);
  m.set(key, { ds, value });
  if (m.size > 30) m.delete(m.keys().next().value);
  return value;
}

export function run(ds, C) {
  const ev = makeEval(ds, C);
  const current = new Map([...ds.teamDays].map(([k, td]) => [k, ev.booked(td, td.jobIds.map((id) => ds.jobs.get(id)))]));
  const { moves, seconds } = search(ds, C, ev);

  // Recommendations: re-ordered routes first (grouped per team and weekday), then moves.
  const recs = [];
  const moved = new Set(moves.flatMap((mv) => mv.plan.map((p) => p.jobId)));
  const groups = new Map();
  for (const [k, td] of ds.teamDays) {
    const list = td.jobIds.map((id) => ds.jobs.get(id));
    if (list.length < 2 || list.some((j) => moved.has(j.id))) continue;
    const f = ev.flex(td, list);
    const b = current.get(k);
    if (!f || b.cost - f.cost < 5 * td.size) continue;
    const g = `${td.teamId}|${td.weekday}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(k);
  }
  for (const [g, days] of groups) {
    const [teamId, weekday] = g.split('|').map(Number);
    recs.push({ id: `r${recs.length + 1}`, kind: 'resequence', teamId, weekday, days });
  }
  for (const mv of moves) recs.push({ id: `r${recs.length + 1}`, ...mv });

  const full = replay(ds, C, ev, recs, null);
  // Where each customer was just before each change.
  const beforeOf = new Map();
  {
    const where = new Map([...ds.jobs.values()].map((j) => [j.id, `${j.teamId}|${j.i}`]));
    for (const rec of recs) {
      const snap = new Map();
      for (const p of rec.plan || []) (snap.set(p.jobId, where.get(p.jobId)), where.set(p.jobId, p.to));
      beforeOf.set(rec.id, snap);
    }
  }
  const applied = new Map(full.results.map((r) => [r.id, r]));
  const describe = (rec) => {
    const r = applied.get(rec.id);
    const startOf = r?.placed || new Map();
    const before = beforeOf.get(rec.id) || new Map();
    const jobsOf = rec.kind === 'resequence' ? rec.days.flatMap((k) => ds.teamDays.get(k).jobIds) : rec.plan.map((p) => p.jobId);
    const changes = jobsOf
      .map((id) => {
        const j = ds.jobs.get(id);
        const from = ds.teamDays.get(before.get(id) || `${j.teamId}|${j.i}`);
        const now = startOf.get(id);
        const to = ds.teamDays.get(now?.day || from.key);
        const shift = now ? now.start - j.T : 0;
        return { jobId: id, title: j.title, home: j.home, area: j.area, frequency: j.frequency, fromTeam: from.team, toTeam: to.team, fromDate: from.date, toDate: to.date, fromDay: WEEKDAY[from.weekday], toDay: WEEKDAY[to.weekday], was: hhmm(j.T), now: now ? hhmm(now.start) : hhmm(j.T), shift };
      })
      .filter((c) => rec.kind !== 'resequence' || Math.abs(c.shift) >= 10);
    // One line per customer (a weekly customer has four visits in the cycle).
    const byHome = new Map();
    for (const c of changes) {
      const k = `${c.title}|${c.fromDay}`;
      if (!byHome.has(k)) byHome.set(k, { ...c, visits: 0, shifts: [] });
      const x = byHome.get(k);
      x.visits += 1;
      x.shifts.push(c.shift);
      x.nowTimes = [...new Set([...(x.nowTimes || []), c.now])];
    }
    const customers = [...byHome.values()].map(({ shifts, ...x }) => ({ ...x, maxShift: Math.max(...shifts.map(Math.abs)), now: x.nowTimes.length === 1 ? x.nowTimes[0] : `${x.nowTimes[0]}–${x.nowTimes[x.nowTimes.length - 1]}`, newTeam: x.fromTeam !== x.toTeam, newDay: x.fromDay !== x.toDay }));
    const maxShift = Math.max(0, ...customers.map((c) => c.maxShift));
    const newDay = customers.some((c) => c.newDay);
    const newTeam = customers.some((c) => c.newTeam);
    const phase = newDay ? 3 : newTeam || maxShift > 30 ? 2 : 1;
    const impact = newDay ? 'high' : newTeam || maxShift > 45 ? 'medium' : 'low';
    const complexity = newDay || customers.length > 4 ? 'high' : newTeam || customers.length > 2 ? 'medium' : 'low';
    const d = r?.delta || {};
    const gain = -(d.driveCleanerMin || 0) + (d.sellableCleanerMin || 0);
    const unknown = jobsOf.some((id) => !ds.jobs.get(id).loc);
    const confidence = unknown || gain < 20 ? 'low' : gain >= 60 && !newDay ? 'high' : 'medium';
    const s = rec.seriesId ? ds.series.get(rec.seriesId) : null;
    const p = rec.partnerId ? ds.series.get(rec.partnerId) : null;
    let title;
    let why;
    if (rec.kind === 'resequence') {
      const td = ds.teamDays.get(rec.days[0]);
      title = `Re-order ${td.team}'s ${WEEKDAY[rec.weekday]} route`;
      why = `Same customers, same team and day: visiting them in a tighter order${maxShift ? ` (times move up to ${maxShift} min)` : ''} cuts driving and joins up free time. ${rec.days.length} ${rec.days.length === 1 ? 'day' : 'days'} in the cycle.`;
    } else {
      const fromTeam = ds.teams.get(rec.fromTeam)?.name;
      const toTeam = ds.teams.get(rec.toTeam)?.name;
      const freq = s.frequency ? s.frequency.toLowerCase() : 'one-time';
      if (rec.kind === 'swap') {
        title = `Swap ${s.home} (${fromTeam}) and ${p.home} (${toTeam}) on ${WEEKDAY[rec.fromWeekday]}s`;
        why = `Each customer is closer to the other team's route. Both keep their day; times stay within the limits you set.`;
      } else if (rec.toWeekday !== rec.fromWeekday) {
        title = `Move ${s.home} (${freq}) from ${fromTeam} on ${WEEKDAY[rec.fromWeekday]} to ${toTeam} on ${WEEKDAY[rec.toWeekday]}`;
        why = `${toTeam} already works near ${s.area || 'this home'} on ${WEEKDAY[rec.toWeekday]}s, so the visit fits into an existing route instead of a separate trip. Needs the customer to agree to a new day: best offered when they next reschedule.`;
      } else {
        title = `Move ${s.home} (${freq}, ${WEEKDAY[rec.fromWeekday]}s) from ${fromTeam} to ${toTeam}`;
        why = `${toTeam} is already working near ${s.area || 'this home'} that day; ${fromTeam} drives out of its way for it. Same day for the customer${maxShift ? `, time moves up to ${maxShift} min` : ''}; they get a different team.`;
      }
    }
    return { id: rec.id, kind: rec.kind, applied: Boolean(r?.applied), phase, impact, complexity, confidence, title, why, customers, maxShift, newTeam, newDay, delta: d, jobIds: jobsOf, views: r?.views || null };
  };
  const recommendations = recs.map(describe).filter((r) => r.applied && (-(r.delta.driveCleanerMin || 0) + (r.delta.sellableCleanerMin || 0) > 0 || r.delta.overtimeCleanerMin < 0));

  const now = totals(ds, current);
  const optimised = totals(ds, full.metrics);
  return {
    constraints: C,
    seconds,
    current: now,
    optimised,
    capacityBound: capacityBound(ds, full.metrics),
    recommendations,
    sellable: sellableBlocks(ds, full.metrics),
    baseline: [...current].map(([k, v]) => dayView(ds, k, v)),
    teams: [...ds.teams.values()],
    _recs: recs,
  };
}

// The least team-days the cycle's work could fit in (work + driving packed into full days).
function capacityBound(ds, metrics) {
  let work = 0;
  let windows = 0;
  let n = 0;
  for (const [k, m] of metrics) {
    const td = ds.teamDays.get(k);
    if (!m?.jobs) continue;
    work += m.onsite + m.drive;
    windows += td.we - td.ws;
    n += 1;
  }
  const avg = n ? windows / n : 510;
  return { teamDaysUsed: n, teamDaysNeeded: Math.ceil(work / (avg * 0.92)), avgWindowMin: Math.round(avg) };
}

// Free blocks worth selling after the changes, by area and weekday (for new customers).
function sellableBlocks(ds, metrics) {
  const out = new Map();
  for (const [k, m] of metrics) {
    const td = ds.teamDays.get(k);
    for (const b of m?.blocks || []) {
      const zone = b.zone || (m.jobs ? 'Area not known' : 'Open day: no jobs booked yet');
      const key = `${zone}|${td.weekday}|${td.teamId}`;
      if (!out.has(key)) out.set(key, { zone, weekday: WEEKDAY[td.weekday], team: td.team, teamId: td.teamId, weeks: new Set(), minutes: 0, cleanerMinutes: 0, from: b.start });
      const x = out.get(key);
      x.weeks.add(td.week + 1);
      x.minutes += b.len;
      x.cleanerMinutes += b.len * td.size;
      x.from = Math.min(x.from, b.start);
    }
  }
  return [...out.values()]
    .map((x) => ({ ...x, weeks: [...x.weeks].sort(), hours: round(x.minutes / 60, 1), from: hhmm(x.from) }))
    .sort((a, b) => b.weeks.length - a.weeks.length || b.minutes - a.minutes)
    .slice(0, 40);
}

// Where we are today: per team, per weekday, per area, and the visits that cost the most.
export async function currentState(mc, q = {}) {
  const ds = await dataset(mc, q.from);
  const C = constraintsFrom(q);
  const ev = makeEval(ds, C);
  const cur = new Map([...ds.teamDays].map(([k, td]) => [k, ev.booked(td, td.jobIds.map((id) => ds.jobs.get(id)))]));
  const group = (f) => {
    const g = new Map();
    for (const [k, m] of cur) {
      const id = f(ds.teamDays.get(k));
      if (!g.has(id)) g.set(id, new Map());
      g.get(id).set(k, m);
    }
    return g;
  };
  const teams = [...group((td) => td.teamId)].map(([id, ms]) => ({ id, name: ds.teams.get(id)?.name, color: ds.teams.get(id)?.color, textColor: ds.teams.get(id)?.textColor, zones: ds.territory.get(id)?.size || 0, ...totals(ds, ms) })).sort((a, b) => a.utilisation - b.utilisation);
  const weekdays = [...group((td) => td.weekday)].sort((a, b) => a[0] - b[0]).map(([wd, ms]) => ({ weekday: WEEKDAY[wd], ...totals(ds, ms) }));
  // Areas: how many separate team-days visit them, and the drive into each visit.
  const areas = new Map();
  for (const [k, m] of cur) {
    const td = ds.teamDays.get(k);
    const list = td.jobIds.map((id) => ds.jobs.get(id)).sort((a, b) => a.T - b.T);
    let at = ds.office;
    for (const j of list) {
      const z = j.area || 'Unknown area';
      if (!areas.has(z)) areas.set(z, { area: z, jobs: 0, teamDays: new Set(), teams: new Set(), approachMin: 0 });
      const a = areas.get(z);
      a.jobs += 1;
      a.teamDays.add(k);
      a.teams.add(td.teamId);
      a.approachMin += leg(at, j.loc).min;
      at = j.loc;
    }
    void m;
  }
  const areaList = [...areas.values()]
    .map((a) => ({ area: a.area, jobs: a.jobs, teamDays: a.teamDays.size, teams: a.teams.size, jobsPerVisit: round(a.jobs / a.teamDays.size, 1), approachMin: Math.round(a.approachMin / a.jobs) }))
    .sort((a, b) => a.jobsPerVisit - b.jobsPerVisit || b.teams - a.teams);
  // The visits a route goes furthest out of its way for (extra driving per visit).
  const marginal = [];
  for (const s of ds.series.values()) {
    if (!s.loc) continue;
    let extra = 0;
    let nearest = null;
    for (const j of s.jobs) {
      const td = ds.teamDays.get(`${j.teamId}|${j.i}`);
      const list = td.jobIds.map((id) => ds.jobs.get(id));
      extra += cur.get(td.key).drive - ev.booked(td, list.filter((x) => x.id !== j.id)).drive;
      // The closest other team working that day.
      for (const [k, o] of ds.teamDays) {
        if (o.i !== j.i || o.teamId === j.teamId) continue;
        for (const id of o.jobIds) {
          const x = ds.jobs.get(id);
          if (!x.loc) continue;
          const d = km(s.loc, x.loc) * ROAD;
          if (!nearest || d < nearest.km) nearest = { km: round(d, 1), team: o.team };
        }
        void k;
      }
    }
    const perVisit = extra / s.jobs.length;
    if (perVisit >= 15) marginal.push({ home: s.home, title: s.title, area: s.area, frequency: s.frequency, weekday: WEEKDAY[s.weekday], team: ds.teams.get(s.teamId)?.name, visits: s.jobs.length, extraMinPerVisit: Math.round(perVisit), extraMinPerCycle: Math.round(extra), nearest });
  }
  marginal.sort((a, b) => b.extraMinPerCycle - a.extraMinPerCycle);
  const located = [...ds.jobs.values()].filter((j) => j.loc).length;
  return {
    from: q.from,
    totals: totals(ds, cur),
    teams,
    weekdays,
    areas: areaList,
    costly: marginal.slice(0, 20),
    data: {
      jobs: ds.jobs.size,
      located,
      series: ds.series.size,
      teams: ds.teams.size,
      unassigned: ds.unassigned,
      revenuePerCleanerHour: ds.rate,
      revenueFromJobs: ds.rateJobs,
      leaveAt: hhmm(ds.leave),
      returnBy: hhmm(ds.back),
      office: Boolean(ds.office),
    },
  };
}

// The combined effect of a chosen set of recommendations.
export async function applyChosen(mc, q = {}) {
  const res = await optimize(mc, q);
  const ds = await dataset(mc, q.from);
  const C = res.constraints;
  const ev = makeEval(ds, C);
  const chosen = new Set(String(q.ids || '').split(',').filter(Boolean));
  const r = replay(ds, C, ev, res._recs, chosen);
  return { chosen: chosen.size, optimised: totals(ds, r.metrics), skipped: r.results.filter((x) => !x.applied).map((x) => x.id), days: [...r.metrics].map(([k, v]) => dayView(ds, k, v)) };
}

// Every strategy side by side, and what relaxing one constraint at a time is worth.
export async function compare(mc, q = {}) {
  const base = constraintsFrom({ ...q, preset: q.preset || 'balanced' });
  const strategies = [];
  for (const [id, p] of Object.entries(PRESETS)) {
    const r = await optimize(mc, { from: q.from, ...p });
    strategies.push({ id, label: p.label, constraints: r.constraints, optimised: r.optimised, capacityBound: r.capacityBound, recommendations: r.recommendations.length, byPhase: [1, 2, 3].map((ph) => r.recommendations.filter((x) => x.phase === ph).length) });
  }
  const start = await optimize(mc, { from: q.from, ...base });
  const relax = [
    ['Appointments may move 1 hour further', { early: base.early + 60, late: base.late + 60 }],
    ['Customers may change team', { teams: true }],
    ['Customers may change day', { days: true }],
    ['Teams may leave their usual areas', { territories: false }],
    ['Weekly customers may change too', { protectWeekly: false }],
    ['No limit on driving per day', { maxDrive: 0 }],
  ];
  const levers = [];
  for (const [label, change] of relax) {
    const c = { ...base, ...change };
    if (JSON.stringify(c) === JSON.stringify(base)) continue;
    const r = await optimize(mc, { from: q.from, ...c });
    levers.push({ label, change, optimised: r.optimised });
  }
  return { base, current: start.current, baseOptimised: start.optimised, strategies, levers };
}

export const _test = { makeEval, search, replay, totals, constraintsFrom };
