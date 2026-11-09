// Call-out recovery: when cleaners call out, play out the ways to rearrange the day and
// rank them by how much of the day's revenue they save.
//
// How Clean Bee works: every car has a lead (Captain in MaidCentral: washrooms, kitchen)
// and a cleaner (Team Member: floors, dusting). Nobody works alone, and a car needs a
// lead. A job's on-site time scales with the people in the car (cleaner-hours ÷ people):
// a car of three cleans a 2-hour (two-person) job in about 1 h 20 min.
//
// After the call-outs, everyone left without a working car is placed: they join another
// car (if it ends up with a lead and within the size limit), pair up with the person left
// from another short car (if one of them is a lead), or pair with someone the office marks
// as available. Every combination is played out: each car keeps its jobs where it can,
// and orphaned jobs (most valuable first) go to whichever car can take them with the
// least extra driving, within how far customers may be moved, and with everyone back at
// the office by the return time. Jobs that fit nowhere are to be rescheduled.
// Read-only: the plan says what to do; changes are made in MaidCentral.
import { dayData, analyseDay, parseDay } from './planner.js';
import { book, homeIndex, driveTime, learnPlaces } from './territory.js';
import { office, returnBy, leaveAt } from './office.js';
import { tables } from './extract.js';
import { localToday } from './geo.js';
import { McError } from './mc.js';
import { isVisit } from './prices.js';
import { perSession, FRESH } from './cache.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const mod = (iso) => Math.round((Date.parse(`${iso}Z`) % DAY) / MIN); // "2026-11-03T09:00:00" -> 540
const hhmm = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(Math.round(m) % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
const money = (n) => Math.round(n);
const ROLE_LABEL = { lead: 'lead', cleaner: 'cleaner', trainee: 'trainee' };

// MaidCentral team positions -> roles.
function roleOf(positionName) {
  const p = String(positionName || '').toLowerCase();
  if (/captain|lead|supervisor/.test(p)) return 'lead';
  if (/trainee/.test(p)) return 'trainee';
  if (p) return 'cleaner';
  return null; // not set in MaidCentral
}

// "123:lead,456:cleaner" -> Map
function parseRoles(text) {
  return new Map(
    String(text || '')
      .split(',')
      .map((x) => x.split(':').map((s) => s.trim()))
      .filter(([id, r]) => id && ROLE_LABEL[r]),
  );
}

// Today's prices, addresses, phones and car sizes (MaidCentral's Dispatch Board shows today).
async function dispatchBoard(mc) {
  try {
    const t = tables(await mc.getHtml('/Report/DispatchBoard'))[0];
    if (!t) return new Map();
    const col = (h) => t.headers.indexOf(h);
    const num = (v) => parseFloat(String(v || '').replace(/[^\d.-]/g, ''));
    return new Map(
      t.rows.map((r) => [
        r.cells[col('Job ID')],
        {
          revenue: num(r.cells[col('Bill Rate')]) || 0,
          cleanerHours: num(r.cells[col('Alwd. Hours')]) || null,
          phone: r.cells[col('Phone')] || null,
          status: r.cells[col('Status')] || '',
        },
      ]),
    );
  } catch (e) {
    if (e.code === 'expired') throw e;
    return new Map();
  }
}

// Revenue per cleaner-hour from today's Dispatch Board (the only screen with prices), for
// estimating other days. Cached for 30 minutes per person.
const rates = perSession();
export async function revenueRate(mc) {
  const hit = rates.get(mc);
  if (hit && Date.now() - hit.at < FRESH.reference) return hit;
  // Only real visits: skipped, moved and cancelled bookings are left out.
  const priced = [...(await dispatchBoard(mc)).values()].filter((b) => b.revenue && b.cleanerHours && isVisit(b.status));
  const hours = priced.reduce((s, b) => s + b.cleanerHours, 0);
  const v = { at: Date.now(), rate: hours ? priced.reduce((s, b) => s + b.revenue, 0) / hours : null, jobs: priced.length };
  rates.set(mc, v);
  return v;
}

// The day as cars, people (with roles) and jobs.
export async function dayState(mc, date, roleOverrides = new Map()) {
  const dayMs = parseDay(date);
  const mcDay = (() => {
    const [y, m, d] = date.split('-').map(Number);
    return `${m}/${d}/${y}`;
  })();
  const [day, homes, positions] = await Promise.all([dayData(mc, dayMs), book(mc), mc.getJson('/Schedule/ReadTeamPositions', { date: mcDay }).catch(() => [])]);
  const posName = new Map((positions || []).map((p) => [String(p.TeamPositionID), p.TeamPositionName]));
  const a = analyseDay(day);
  const lookup = homeIndex(homes);
  const base = await office(mc, homes);
  await learnPlaces(homes, base);
  const isToday = date === localToday();
  const board = isToday ? await dispatchBoard(mc) : new Map();
  // Price per cleaner-hour, from today's board, to estimate other days.
  const priced = [...board.values()].filter((b) => b.revenue && b.cleanerHours && isVisit(b.status));
  const perCleanerHour = priced.length ? priced.reduce((s, b) => s + b.revenue, 0) / priced.reduce((s, b) => s + b.cleanerHours, 0) : 30;
  const person = (m) => {
    const fromMc = roleOf(posName.get(String(m.positionId)));
    const override = roleOverrides.get(String(m.employeeId));
    return {
      id: m.employeeId,
      name: m.name,
      start: mod(m.start),
      end: mod(m.end),
      role: override || fromMc || 'cleaner',
      roleSource: override ? 'you' : fromMc ? 'MaidCentral' : 'not set',
      position: posName.get(String(m.positionId)) || null,
    };
  };

  const cars = a.teams
    .filter((t) => t.jobs.length || t.members.some((m) => !m.absent))
    .map((t) => {
      const members = t.members.filter((m) => !m.absent && m.start && m.end).map(person);
      const size = Math.max(members.length, 1);
      const jobs = t.jobs.map((j) => {
        const b = board.get(String(j.id));
        const onsite = mod(j.end) - mod(j.start);
        const cleanerHours = b?.cleanerHours || (onsite / 60) * size;
        const h = lookup(j.title);
        return {
          id: j.id,
          title: j.title,
          start: mod(j.start),
          end: mod(j.end),
          cleanerMinutes: Math.round(cleanerHours * 60),
          revenue: b ? b.revenue : money(cleanerHours * perCleanerHour),
          revenueEstimated: !b,
          frequency: j.frequency?.short || null,
          loc: h ? { lat: h.lat, lng: h.lng } : null,
          area: h?.zone || null,
          phone: b?.phone || null,
          carId: t.id,
        };
      });
      const last = jobs.length ? jobs.reduce((x, j) => (j.end > x.end ? j : x), jobs[0]) : null;
      const bookedBack = last && base.lat && last.loc ? last.end + driveTime(last.loc, base) : last ? last.end + 12 : null;
      return { id: t.id, name: t.name, color: t.color, members, size, jobs, bookedBack };
    });
  const spare = a.spare.map(person);
  return { date, isToday, cars, spare, office: base.lat ? { lat: base.lat, lng: base.lng } : null, perCleanerHour: Math.round(perCleanerHour) };
}

// Plan one car's day: jobs in the given order, starting from the office. Returns null if
// any job can't start within its allowed window or the car can't be back in time.
function route(car, jobs, size, opts, office, backBy) {
  if (!size) return jobs.length ? null : { stops: [], drive: 0, back: null };
  const drive = (a, b) => driveTime(a, b, 12);
  // The car leaves the office at the departure time (or later, if nobody's shift starts yet).
  const dayStart = car.members.length ? Math.max(opts.dayStart, Math.min(...car.members.map((m) => m.start))) : opts.dayStart;
  let t = dayStart;
  let at = office;
  let total = 0;
  // Until something changes in this car (a different crew, or a job added before it), its
  // jobs stay exactly as MaidCentral has them booked.
  let disturbed = Boolean(car.changed);
  const stops = [];
  for (const j of jobs) {
    if (j.carId !== car.id) disturbed = true;
    const d = drive(at, j.loc);
    total += d;
    let start;
    let end;
    if (!disturbed) {
      start = j.start;
      end = j.end;
    } else {
      // Moved jobs and re-crewed cars may start up to opts.early before the booked time;
      // anyone may be pushed up to opts.late later.
      // What the customer said on the phone narrows this (see applyCalls).
      let earliest = car.changed || j.carId !== car.id ? j.start - opts.early : j.start;
      let latest = j.start + opts.late;
      if (j.keepTime) (earliest = j.start), (latest = j.start);
      if (j.pinStart != null) (earliest = j.pinStart), (latest = j.pinStart);
      if (j.after != null) earliest = Math.max(earliest, j.after);
      if (j.before != null) latest = Math.min(latest, j.before);
      start = Math.max(t + d, earliest);
      if (start > latest) return null;
      end = start + Math.ceil(j.cleanerMinutes / size / 5) * 5;
    }
    stops.push({ job: j, start, end, drive: d });
    t = end;
    at = j.loc || at;
  }
  const home = drive(at, office);
  // Back at the office by the return time, or no later than the booked day already was.
  const bookedBack = car.bookedBack ?? backBy;
  if (disturbed && stops.length && t + home > Math.max(backBy, bookedBack)) return null;
  return { stops, drive: total + (stops.length ? home : 0), back: stops.length ? t + home : null };
}

// Re-plan the whole day for one arrangement of cars, then place orphaned jobs.
function plan(state, arrangement, opts) {
  const backBy = opts.returnBy;
  const base = arrangement.cars.map((c) => ({ ...c, jobs: [...c.jobs] }));
  const startOrphans = [...arrangement.orphans];
  const startRoutes = new Map();
  for (const c of base) {
    let r = route(c, c.jobs, c.size, opts, state.office, backBy);
    // A car that can't keep all its jobs gives up its longest one first (it frees the most
    // time, so the fewest jobs leave the car).
    while (!r && c.jobs.length) {
      const dropped = c.jobs.reduce((big, j) => (j.cleanerMinutes > big.cleanerMinutes || (j.cleanerMinutes === big.cleanerMinutes && j.revenue < big.revenue) ? j : big), c.jobs[0]);
      c.jobs = c.jobs.filter((j) => j !== dropped);
      startOrphans.push(dropped);
      r = route(c, c.jobs, c.size, opts, state.office, backBy);
    }
    startRoutes.set(c.id, r);
  }
  // Orphans go where they add the least driving and delay. The goal is to keep as many
  // jobs as possible, so two orders are tried (shortest first, most valuable first) and the
  // one that keeps more jobs wins (then more revenue).
  const place = (order) => {
    const cars = base.map((c) => ({ ...c, jobs: [...c.jobs] }));
    const routes = new Map(startRoutes);
    const lost = [];
    for (const j of order) {
      let best = null;
      const pinned = j.pinCar && cars.some((c) => c.size && c.name === j.pinCar);
      for (const c of cars) {
        if (!c.size || (pinned && c.name !== j.pinCar)) continue;
        const before = routes.get(c.id);
        for (let i = 0; i <= c.jobs.length; i++) {
          const list = [...c.jobs.slice(0, i), j, ...c.jobs.slice(i)];
          const r = route(c, list, c.size, opts, state.office, backBy);
          if (!r) continue;
          const shift = r.stops.reduce((s, x) => s + Math.abs(x.start - x.job.start), 0);
          const cost = r.drive - (before?.drive || 0) + shift / 10;
          if (!best || cost < best.cost) best = { cost, car: c, list, r };
        }
      }
      if (best) {
        best.car.jobs = best.list;
        routes.set(best.car.id, best.r);
      } else lost.push(j);
    }
    return { cars, routes, lost };
  };
  const pinnedFirst = (a, b) => (b.pinCar ? 1 : 0) - (a.pinCar ? 1 : 0);
  const tries = [
    place([...startOrphans].sort((a, b) => pinnedFirst(a, b) || a.cleanerMinutes - b.cleanerMinutes || b.revenue - a.revenue)),
    place([...startOrphans].sort((a, b) => pinnedFirst(a, b) || b.revenue - a.revenue)),
  ];
  const lostValue = (t) => t.lost.reduce((s, j) => s + j.revenue, 0);
  return tries.sort((a, b) => a.lost.length - b.lost.length || lostValue(a) - lostValue(b))[0];
}

// Revenue impact in words, so the office doesn't have to think in dollars.
//   jobs: high / medium / low against the day's other jobs (top, middle, bottom third)
//   plans: share of the day's revenue at stake (none, low < 5%, medium < 15%, high)
function impactScale(revenues) {
  const sorted = [...revenues].sort((a, b) => a - b);
  const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))] ?? 0;
  const lo = q(1 / 3);
  const hi = q(2 / 3);
  return (r) => (r > hi ? 'high' : r < lo ? 'low' : 'medium');
}
const shareImpact = (lost, total) => (!lost ? 'none' : !total ? 'low' : lost / total < 0.05 ? 'low' : lost / total < 0.15 ? 'medium' : 'high');

// What customers said when the office called them, applied to their jobs.
//   calls: { [jobId]: { outcome, car, start, time } }
//     agreed     -> the job is done by that car at that time (pinned)
//     keep       -> it can't move from its booked time (any car may do it)
//     after/before -> only after / only before a time (minutes)
//     reschedule/skip -> not today
//     noanswer   -> couldn't reach them: keep their booked time (don't move them unannounced)
//     voicemail  -> left a message and it's OK to move them: no limit
function applyCalls(cars, calls) {
  const out = [];
  for (const c of cars) {
    c.jobs = c.jobs
      .map((j) => {
        const k = calls[String(j.id)];
        if (!k) return j;
        if (k.outcome === 'reschedule' || k.outcome === 'skip') {
          out.push({ ...j, customerChoice: k.outcome });
          return null;
        }
        const x = { ...j, outcome: k.outcome };
        if (k.outcome === 'agreed') Object.assign(x, { pinCar: k.car || null, pinStart: Number.isFinite(k.start) ? k.start : null });
        if (k.outcome === 'keep' || k.outcome === 'noanswer') x.keepTime = true;
        if (k.outcome === 'after' && Number.isFinite(k.time)) x.after = k.time;
        if (k.outcome === 'before' && Number.isFinite(k.time)) x.before = k.time;
        return x;
      })
      .filter(Boolean);
  }
  return out;
}

const hasLead = (people) => people.some((p) => p.role === 'lead');
const names = (people) => people.map((p) => `${p.name} (${ROLE_LABEL[p.role] || 'role not set'})`).join(' & ');

// Every reasonable arrangement after the call-outs, ranked by revenue saved.
//   out: ids of people who called out; roles: "id:lead,id:cleaner" (overrides MaidCentral)
//   available: people without a team that day who could fill in (ids)
//   early/late: minutes customers may move; maxCar: most people in one car (default 3)
//   calls: JSON { jobId: { outcome, car, start, time } } from the office's phone calls
export async function callOutScenarios(mc, { date, out = [], roles = '', available = [], early = 30, late = 120, dayStart, maxCar = 3, calls = '' } = {}) {
  const day = date || localToday();
  const state = await dayState(mc, day, parseRoles(roles));
  let callMap = {};
  try {
    callMap = typeof calls === 'string' ? (calls ? JSON.parse(calls) : {}) : calls || {};
  } catch {
    throw new McError('input', 'Call outcomes could not be read.');
  }
  // Customers who chose to reschedule or skip are off today's plan before anything else.
  const notToday = applyCalls(state.cars, callMap);
  const ids = (v) => new Set((Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim()).filter(Boolean));
  const outIds = ids(out);
  if (!outIds.size) throw new McError('input', 'Choose who called out.');
  const startMin = (() => {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(dayStart || ''));
    return m ? ((Number(m[1]) % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]) : leaveAt();
  })();
  const most = Math.max(2, Number(maxCar) || 3);
  const opts = { early: Math.max(0, Number(early) || 0), late: Math.max(0, Number(late) || 0), returnBy: returnBy(), dayStart: startMin };
  const totalRevenue = state.cars.reduce((s, c) => s + c.jobs.reduce((a, j) => a + j.revenue, 0), 0) + notToday.reduce((s, j) => s + j.revenue, 0);
  const totalJobs = state.cars.reduce((s, c) => s + c.jobs.length, 0) + notToday.length;
  const jobImpact = impactScale([...state.cars.flatMap((c) => c.jobs), ...notToday].map((j) => j.revenue));

  const calledOut = state.cars.flatMap((c) => c.members.filter((m) => outIds.has(String(m.id))).map((m) => ({ id: m.id, name: m.name, role: m.role, car: c.name })));
  if (!calledOut.length) throw new McError('input', 'None of those people are on a car that day.');
  const availIds = ids(available);
  const fillIns = state.spare.filter((p) => availIds.has(String(p.id)) && !outIds.has(String(p.id)));

  // Cars after the call-outs: intact ones keep going; short ones need a decision.
  const after = state.cars.map((c) => ({ ...c, members: c.members.filter((m) => !outIds.has(String(m.id))), lostPeople: c.members.filter((m) => outIds.has(String(m.id))) }));
  const intact = after.filter((c) => !c.lostPeople.length);
  const short = after.filter((c) => c.lostPeople.length);
  // A short car still works if it has two people and a lead.
  const working = (people) => people.length >= 2 && hasLead(people);

  // Options for each short car, chosen together (pairs and shared cars must agree).
  const scenarios = [];
  const explore = (i, acc, used) => {
    if (scenarios.length >= 600) return;
    if (i === short.length) return scenarios.push(acc);
    const c = short[i];
    if (used.taken.has(c.id)) return explore(i + 1, acc, used); // paired with an earlier car
    const people = c.members;
    if (!people.length) return explore(i + 1, [...acc, { kind: 'empty', car: c }], used);
    if (working(people)) return explore(i + 1, [...acc, { kind: 'keep', car: c }], used);
    // Join an intact car (it must end up with a lead, within the size limit).
    for (const u of intact) {
      const size = u.members.length + (used.added.get(u.id) || 0) + people.length;
      if (size > most) continue;
      if (!hasLead([...u.members, ...people])) continue;
      const added = new Map(used.added).set(u.id, (used.added.get(u.id) || 0) + people.length);
      explore(i + 1, [...acc, { kind: 'join', car: c, into: u }], { ...used, added });
    }
    // Pair with what's left of another short car: together they need a lead.
    for (const d of short.slice(i + 1)) {
      if (used.taken.has(d.id) || !d.members.length || working(d.members)) continue;
      const together = [...people, ...d.members];
      if (together.length > most || !working(together)) continue;
      const taken = new Set(used.taken).add(d.id);
      explore(i + 1, [...acc, { kind: 'pair', car: c, other: d, keep: c }], { ...used, taken });
      explore(i + 1, [...acc, { kind: 'pair', car: c, other: d, keep: d }], { ...used, taken });
    }
    // Pair with someone available to fill in.
    for (const f of fillIns) {
      if (used.fill.has(f.id)) continue;
      const together = [...people, f];
      if (together.length > most || !working(together)) continue;
      explore(i + 1, [...acc, { kind: 'fill', car: c, with: f }], { ...used, fill: new Set(used.fill).add(f.id) });
    }
    // Nothing works: they can't go out alone, so their car's jobs are shared out.
    explore(i + 1, [...acc, { kind: 'stand-down', car: c }], used);
  };
  explore(0, [], { taken: new Set(), added: new Map(), fill: new Set() });

  const seen = new Set();
  const built = scenarios.map((combo) => {
    const cars = after.map((c) => ({ ...c, members: [...c.members], jobs: [...c.jobs], size: c.members.length }));
    const byId = new Map(cars.map((c) => [c.id, c]));
    const orphans = [];
    const moves = [];
    const off = (c) => {
      orphans.push(...c.jobs);
      c.jobs = [];
      c.members = [];
      c.size = 0;
    };
    const jobsText = (car) => (car.jobs.length === 1 ? '1 job is' : `${car.jobs.length} jobs are`);
    for (const ch of combo) {
      const c = byId.get(ch.car.id);
      if (ch.kind === 'empty') {
        moves.push(`Everyone in ${c.name} is out, so ${c.name} doesn't go out today. Its ${jobsText(c)} given to the other cars.`);
        off(c);
      } else if (ch.kind === 'keep') {
        c.changed = true;
        moves.push(`${c.name} still goes out with ${names(c.members)} and keeps its jobs.`);
      } else if (ch.kind === 'join') {
        const u = byId.get(ch.into.id);
        const joining = [...c.members];
        u.members.push(...joining);
        u.size = u.members.length;
        u.changed = true;
        moves.push(`${names(joining)} from ${c.name} joins ${u.name} for the day, making ${u.name} a car of ${u.size}. ${c.name} doesn't go out; its ${jobsText(c)} given to the other cars.`);
        off(c);
      } else if (ch.kind === 'pair') {
        const keep = byId.get(ch.keep.id);
        const other = byId.get((ch.keep.id === ch.car.id ? ch.other : ch.car).id);
        keep.members.push(...other.members);
        keep.size = keep.members.length;
        keep.changed = true;
        moves.push(`${names(keep.members)} pair up and go out as ${keep.name}, doing ${keep.name}'s jobs. ${other.name} doesn't go out; its ${jobsText(other)} given to the other cars.`);
        off(other);
      } else if (ch.kind === 'fill') {
        const partners = [...c.members];
        c.members.push(ch.with);
        c.size = c.members.length;
        c.changed = true;
        moves.push(`${ch.with.name} (${ROLE_LABEL[ch.with.role]}, not on a team today) fills in with ${names(partners)}, so ${c.name} still goes out and keeps its jobs.`);
      } else if (ch.kind === 'stand-down') {
        moves.push(`${names(c.members)} can't go out alone, so ${c.name} doesn't go out today. Its ${jobsText(c)} given to the other cars.`);
        off(c);
      }
    }
    const k = moves.join('|');
    if (seen.has(k)) return null;
    seen.add(k);
    // Jobs a customer agreed to have done by another car go to that car.
    for (const c of cars) {
      const away = c.jobs.filter((j) => j.pinCar && j.pinCar !== c.name);
      if (away.length) {
        c.jobs = c.jobs.filter((j) => !away.includes(j));
        orphans.push(...away);
      }
    }
    const p = plan(state, { cars, orphans }, opts);
    const lostRevenue = p.lost.reduce((s, j) => s + j.revenue, 0) + notToday.reduce((s, j) => s + j.revenue, 0);
    const changes = [];
    for (const c of p.cars) {
      for (const s of p.routes.get(c.id)?.stops || []) {
        const moved = s.job.carId !== c.id;
        const shifted = Math.abs(s.start - s.job.start) >= 15;
        // Duration follows the crew: a car of three cleans a two-person job faster.
        const wasCrew = state.cars.find((x) => x.id === s.job.carId)?.size || c.size;
        const resized = s.end - s.start !== s.job.end - s.job.start;
        if (moved || shifted || resized || s.job.outcome) changes.push({ jobId: s.job.id, title: s.job.title, phone: s.job.phone, from: state.cars.find((x) => x.id === s.job.carId)?.name, to: c.name, was: hhmm(s.job.start), wasEnd: hhmm(s.job.end), now: hhmm(s.start), nowEnd: hhmm(s.end), nowMin: s.start, wasDur: s.job.end - s.job.start, nowDur: s.end - s.start, wasCrew, nowCrew: c.size, cleanerMinutes: s.job.cleanerMinutes, moved, shifted, resized, outcome: s.job.outcome || null });
      }
    }
    const jobsLost = p.lost.length + notToday.length;
    return {
      moves,
      kinds: combo.map((x) => x.kind),
      jobsKept: totalJobs - jobsLost,
      jobsLost,
      impact: shareImpact(lostRevenue, totalRevenue),
      saved: money(totalRevenue - lostRevenue),
      lost: money(lostRevenue),
      savedShare: totalRevenue ? Math.round(((totalRevenue - lostRevenue) / totalRevenue) * 100) : 100,
      reschedule: [...notToday, ...p.lost].map((j) => ({ jobId: j.id, title: j.title, phone: j.phone, was: hhmm(j.start), revenue: j.revenue, revenueEstimated: j.revenueEstimated, impact: jobImpact(j.revenue), from: state.cars.find((x) => x.id === j.carId)?.name, frequency: j.frequency, customerChoice: j.customerChoice || null, outcome: j.outcome || null })),
      changes,
      driveMinutes: [...p.routes.values()].reduce((s, r) => s + (r?.drive || 0), 0),
      cars: p.cars
        .filter((c) => c.size || (p.routes.get(c.id)?.stops || []).length)
        .map((c) => {
          const r = p.routes.get(c.id);
          return {
            id: c.id,
            name: c.name,
            color: c.color,
            people: c.members.map((m) => m.name),
            roles: c.members.map((m) => m.role),
            back: r?.back != null ? hhmm(r.back) : null,
            size: c.size,
            leave: r?.stops?.length ? r.stops[0].start - (r.stops[0].drive || 0) : null,
            backMin: r?.back ?? null,
            stops: (r?.stops || []).map((s) => ({ jobId: s.job.id, title: s.job.title, start: s.start, end: s.end, label: `${hhmm(s.start)} – ${hhmm(s.end)}`, was: hhmm(s.job.start), wasStart: s.job.start, wasEnd: s.job.end, drive: s.drive ?? null, moved: s.job.carId !== c.id, shifted: Math.abs(s.start - s.job.start) >= 15, resized: s.end - s.start !== s.job.end - s.job.start, from: state.cars.find((x) => x.id === s.job.carId)?.name, revenue: s.job.revenue, frequency: s.job.frequency, area: s.job.area })),
          };
        }),
    };
  }).filter(Boolean);

  // If nobody moves: short cars that can't legally go out lose all their jobs.
  const atRisk = short.filter((c) => !working(c.members)).flatMap((c) => c.jobs);
  // Most jobs kept first; then revenue, fewest calls, least driving.
  const ranked = built.sort((a, b) => b.jobsKept - a.jobsKept || b.saved - a.saved || a.changes.length + a.reschedule.length - (b.changes.length + b.reschedule.length) || a.driveMinutes - b.driveMinutes);
  return {
    date: day,
    isToday: state.isToday,
    revenueEstimated: !state.isToday,
    perCleanerHour: state.perCleanerHour,
    totalRevenue: money(totalRevenue),
    totalJobs,
    calledOut,
    options: { early: opts.early, late: opts.late, leaveAt: hhmm(opts.dayStart), returnBy: hhmm(opts.returnBy), maxCar: most },
    baseline: { lost: money(atRisk.reduce((s, j) => s + j.revenue, 0)), jobs: atRisk.length, impact: shareImpact(atRisk.reduce((s, j) => s + j.revenue, 0), totalRevenue) },
    scenarios: ranked.slice(0, 8),
    callsApplied: Object.keys(callMap).length,
  };
}

// Who's working (to choose who called out), with roles.
export async function roster(mc, { date, roles = '' } = {}) {
  const day = date || localToday();
  const state = await dayState(mc, day, parseRoles(roles));
  const who = (m) => ({ id: m.id, name: m.name, role: m.role, roleSource: m.roleSource, position: m.position });
  return {
    date: day,
    isToday: state.isToday,
    leaveAt: hhmm(leaveAt()),
    returnBy: hhmm(returnBy()),
    cars: state.cars.map((c) => ({ id: c.id, name: c.name, color: c.color, members: c.members.map(who), noLead: c.members.length > 0 && !hasLead(c.members), jobs: c.jobs.length, revenue: c.jobs.reduce((s, j) => s + j.revenue, 0) })),
    spare: state.spare.map(who),
  };
}
