// Call-out recovery: when cleaners call out, play out the ways to rearrange the day and
// rank them by how much of the day's revenue they save.
//
// Each car normally has two cleaners. A job's on-site time scales with the people in the
// car (cleaner-hours ÷ car size): a car of three cleans a 2-hour (two-person) job in about
// 1 h 20 min. For each car left short, the options are: the remaining cleaner works solo,
// joins another car (a car of three), or pairs with someone working without a team
// today. For every combination the day is re-planned: each car keeps its jobs in order
// where it can, and the orphaned jobs (highest revenue first) are slotted into whichever
// car can take them with the least extra driving, within how far customers may be moved,
// and with everyone back at the office by the return time. Jobs that fit nowhere are to
// be rescheduled. Read-only: the plan says what to do; changes are made in MaidCentral.
import { dayData, analyseDay, parseDay } from './planner.js';
import { book, homeIndex, km, driveMin } from './territory.js';
import { office, returnBy } from './office.js';
import { tables } from './extract.js';
import { localToday } from './geo.js';
import { McError } from './mc.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const mod = (iso) => Math.round((Date.parse(`${iso}Z`) % DAY) / MIN); // "2026-11-03T09:00:00" -> 540
const hhmm = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(Math.round(m) % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
const money = (n) => Math.round(n);

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
          teamSize: num(r.cells[col('Team Size')]) || null,
          phone: r.cells[col('Phone')] || null,
          address: r.cells[col('Address')] || null,
          customer: r.cells[col('Customer')] || null,
        },
      ]),
    );
  } catch (e) {
    if (e.code === 'expired') throw e;
    return new Map();
  }
}

// The day as cars, people and jobs.
export async function dayState(mc, date) {
  const dayMs = parseDay(date);
  const [day, homes] = await Promise.all([dayData(mc, dayMs), book(mc)]);
  const a = analyseDay(day);
  const lookup = homeIndex(homes);
  const base = await office(mc, homes);
  const isToday = date === localToday();
  const board = isToday ? await dispatchBoard(mc) : new Map();
  // Price per cleaner-hour, from today's board, to estimate other days.
  const priced = [...board.values()].filter((b) => b.revenue && b.cleanerHours);
  const perCleanerHour = priced.length ? priced.reduce((s, b) => s + b.revenue, 0) / priced.reduce((s, b) => s + b.cleanerHours, 0) : 30;

  const cars = a.teams
    .filter((t) => t.jobs.length || t.members.some((m) => !m.absent))
    .map((t) => {
      const members = t.members.filter((m) => !m.absent && m.start && m.end).map((m) => ({ id: m.employeeId, name: m.name, start: mod(m.start), end: mod(m.end) }));
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
      const last = jobs.length ? jobs.reduce((a, j) => (j.end > a.end ? j : a), jobs[0]) : null;
      const bookedBack = last && base.lat && last.loc ? last.end + driveMin(km(last.loc, base)) : last ? last.end + 12 : null;
      return { id: t.id, name: t.name, color: t.color, members, size, jobs, bookedBack };
    });
  const spare = a.spare.map((p) => ({ id: p.employeeId, name: p.name, start: mod(p.start), end: mod(p.end) }));
  return { date, isToday, cars, spare, office: base.lat ? { lat: base.lat, lng: base.lng } : null, perCleanerHour: Math.round(perCleanerHour) };
}

// Plan one car's day: jobs in the given order, starting from the office.
//   Returns null if any job can't start within its allowed window or the car can't be
//   back at the office by the return time.
function route(car, jobs, size, opts, office, backBy) {
  if (!size) return jobs.length ? null : { stops: [], drive: 0, back: null };
  const drive = (a, b) => (a && b ? driveMin(km(a, b)) : 12);
  const dayStart = car.members.length ? Math.max(opts.dayStart - 60, Math.min(...car.members.map((m) => m.start))) : opts.dayStart;
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
      const earliest = car.changed || j.carId !== car.id ? j.start - opts.early : j.start;
      start = Math.max(t + d, earliest);
      if (start > j.start + opts.late) return null;
      end = start + Math.ceil(j.cleanerMinutes / size / 5) * 5;
    }
    stops.push({ job: j, start, end });
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
  const cars = arrangement.cars.map((c) => ({ ...c, jobs: [...c.jobs] }));
  let orphans = [...arrangement.orphans];
  // A car that can't keep all its jobs (e.g. one cleaner now) drops its last ones.
  const routes = new Map();
  for (const c of cars) {
    let r = route(c, c.jobs, c.size, opts, state.office, backBy);
    while (!r && c.jobs.length) {
      const dropped = c.jobs.reduce((lo, j) => (j.revenue < lo.revenue ? j : lo), c.jobs[0]);
      c.jobs = c.jobs.filter((j) => j !== dropped);
      orphans.push(dropped);
      r = route(c, c.jobs, c.size, opts, state.office, backBy);
    }
    routes.set(c.id, r);
  }
  // Orphans, most valuable first, go where they add the least driving and delay.
  orphans = orphans.sort((a, b) => b.revenue - a.revenue);
  const lost = [];
  for (const j of orphans) {
    let best = null;
    for (const c of cars) {
      if (!c.size) continue;
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
}

// Every reasonable arrangement after the call-outs, ranked by revenue saved.
//   available: people without a team that day who could fill in (ids), chosen by the office
//   maxCar: the most people in one car (default 3)
export async function callOutScenarios(mc, { date, out = [], available = [], early = 30, late = 120, dayStart = '8:00 AM', maxCar = 3 } = {}) {
  const day = date || localToday();
  const state = await dayState(mc, day);
  const outIds = new Set((Array.isArray(out) ? out : String(out).split(',')).map((x) => String(x).trim()).filter(Boolean));
  if (!outIds.size) throw new McError('input', 'Choose who called out.');
  const startMin = (() => {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(dayStart);
    return m ? ((Number(m[1]) % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]) : 480;
  })();
  const opts = { early: Math.max(0, Number(early) || 0), late: Math.max(0, Number(late) || 0), returnBy: returnBy(), dayStart: startMin };
  const totalRevenue = state.cars.reduce((s, c) => s + c.jobs.reduce((a, j) => a + j.revenue, 0), 0);

  // Who's left in each car.
  const after = state.cars.map((c) => ({ ...c, members: c.members.filter((m) => !outIds.has(String(m.id))) }));
  const calledOut = state.cars.flatMap((c) => c.members.filter((m) => outIds.has(String(m.id))).map((m) => ({ ...m, car: c.name })));
  if (!calledOut.length) throw new McError('input', "None of those people are on a car that day.");
  const short = after.filter((c) => c.members.length < state.cars.find((x) => x.id === c.id).members.length);
  const availIds = new Set((Array.isArray(available) ? available : String(available).split(',')).map((x) => String(x).trim()).filter(Boolean));
  const spare = state.spare.filter((p) => availIds.has(String(p.id)) && !outIds.has(String(p.id)));

  // Choices for each short car with one cleaner left: solo, join another car, or pair
  // with someone without a team. Cars with nobody left hand all their jobs out.
  const choices = short.map((c) => {
    if (c.members.length === 0) return [{ kind: 'empty', car: c }];
    if (c.members.length >= 2) return [{ kind: 'keep', car: c }];
    const opts2 = [{ kind: 'solo', car: c }];
    const most = Math.max(2, Number(maxCar) || 3);
    for (const u of after) if (u.id !== c.id && u.members.length >= 1 && u.members.length + c.members.length <= most && !short.some((s) => s.id === u.id && s.members.length < 2)) opts2.push({ kind: 'join', car: c, into: u });
    for (const p of spare) opts2.push({ kind: 'pair', car: c, with: p });
    return opts2;
  });
  const combos = choices.reduce((acc, list) => acc.flatMap((a) => list.map((x) => [...a, x])), [[]]).slice(0, 400);

  const scenarios = combos.map((combo) => {
    const cars = after.map((c) => ({ ...c, members: [...c.members], jobs: [...c.jobs], size: c.members.length }));
    const byId = new Map(cars.map((c) => [c.id, c]));
    const orphans = [];
    const moves = [];
    const usedSpare = new Set();
    let valid = true;
    for (const ch of combo) {
      const c = byId.get(ch.car.id);
      if (ch.kind === 'empty') {
        orphans.push(...c.jobs);
        c.jobs = [];
        c.size = 0;
        moves.push(`${c.name} has nobody left: its jobs go to other cars`);
      } else if (ch.kind === 'solo') {
        c.changed = true;
        moves.push(`${c.members[0].name} works ${c.name} alone`);
      } else if (ch.kind === 'join') {
        const u = byId.get(ch.into.id);
        u.members.push(...c.members);
        u.size = u.members.length;
        u.changed = true;
        orphans.push(...c.jobs);
        moves.push(`${c.members.map((m) => m.name).join(' & ')} joins ${u.name} (car of ${u.size}); ${c.name}'s jobs are shared out`);
        c.members = [];
        c.jobs = [];
        c.size = 0;
      } else if (ch.kind === 'pair') {
        if (usedSpare.has(ch.with.id)) valid = false;
        usedSpare.add(ch.with.id);
        c.members.push(ch.with);
        c.size = c.members.length;
        c.changed = true;
        moves.push(`${ch.with.name} (no team today) pairs with ${c.members[0].name} in ${c.name}`);
      }
    }
    if (!valid) return null;
    const p = plan(state, { cars, orphans }, opts);
    const lostRevenue = p.lost.reduce((s, j) => s + j.revenue, 0);
    const changes = [];
    for (const c of p.cars) {
      const r = p.routes.get(c.id);
      for (const s of r?.stops || []) {
        const moved = s.job.carId !== c.id;
        const shifted = Math.abs(s.start - s.job.start) >= 15;
        if (moved || shifted) changes.push({ jobId: s.job.id, title: s.job.title, phone: s.job.phone, from: state.cars.find((x) => x.id === s.job.carId)?.name, to: c.name, was: hhmm(s.job.start), now: hhmm(s.start), moved, shifted });
      }
    }
    const drive = [...p.routes.values()].reduce((s, r) => s + (r?.drive || 0), 0);
    return {
      moves,
      kind: combo.map((c) => c.kind),
      saved: money(totalRevenue - lostRevenue),
      lost: money(lostRevenue),
      savedShare: totalRevenue ? Math.round(((totalRevenue - lostRevenue) / totalRevenue) * 100) : 100,
      reschedule: p.lost.map((j) => ({ jobId: j.id, title: j.title, phone: j.phone, was: hhmm(j.start), revenue: j.revenue, revenueEstimated: j.revenueEstimated, from: state.cars.find((x) => x.id === j.carId)?.name, frequency: j.frequency })),
      changes,
      driveMinutes: drive,
      cars: p.cars
        .filter((c) => c.size || (p.routes.get(c.id)?.stops || []).length)
        .map((c) => {
          const r = p.routes.get(c.id);
          return {
            id: c.id,
            name: c.name,
            color: c.color,
            people: c.members.map((m) => m.name),
            back: r?.back != null ? hhmm(r.back) : null,
            stops: (r?.stops || []).map((s) => ({ jobId: s.job.id, title: s.job.title, start: s.start, end: s.end, label: `${hhmm(s.start)} – ${hhmm(s.end)}`, was: hhmm(s.job.start), moved: s.job.carId !== c.id, from: state.cars.find((x) => x.id === s.job.carId)?.name, revenue: s.job.revenue, frequency: s.job.frequency, area: s.job.area })),
          };
        }),
    };
  }).filter(Boolean);

  // Doing nothing: the short cars' jobs that need the missing people are lost.
  const baseline = scenarios.find((s) => s.kind.every((k) => k === 'solo' || k === 'empty' || k === 'keep'));
  const ranked = scenarios.sort((a, b) => b.saved - a.saved || a.changes.length - b.changes.length || a.driveMinutes - b.driveMinutes);
  // Keep distinct plans only (same moves text can repeat via equivalent combos).
  const seen = new Set();
  const top = ranked.filter((s) => {
    const k = s.moves.join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 6);
  return {
    date: day,
    isToday: state.isToday,
    revenueEstimated: !state.isToday,
    perCleanerHour: state.perCleanerHour,
    totalRevenue: money(totalRevenue),
    calledOut,
    options: { early: opts.early, late: opts.late, returnBy: hhmm(opts.returnBy), maxCar: Math.max(2, Number(maxCar) || 3) },
    baseline: baseline ? { saved: baseline.saved, lost: baseline.lost, moves: baseline.moves } : null,
    scenarios: top,
  };
}

// Who's working (to choose who called out).
export async function roster(mc, { date } = {}) {
  const day = date || localToday();
  const state = await dayState(mc, day);
  return {
    date: day,
    isToday: state.isToday,
    cars: state.cars.map((c) => ({ id: c.id, name: c.name, color: c.color, members: c.members.map((m) => ({ id: m.id, name: m.name })), jobs: c.jobs.length, revenue: c.jobs.reduce((s, j) => s + j.revenue, 0) })),
    spare: state.spare.map((p) => ({ id: p.id, name: p.name })),
  };
}
