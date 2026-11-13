// Double bookings: two real bookings on the same team whose times overlap, and back-to-back
// bookings with no time to drive between them. Read from MaidCentral's Dispatch Board (the
// shared, cached reader in prices.js), so it covers every booking, recurring or one-time,
// for as many weeks ahead as asked, at no extra cost when Openings already read them.
// Skipped, moved and cancelled bookings don't count. Read-only: fixes are made in MaidCentral.
import { boardRows, isVisit } from './prices.js';
import { book, homeIndex, driveTime, learnPlaces } from './territory.js';
import { office } from './office.js';
import { localToday } from './geo.js';
import { McError } from './mc.js';

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const minutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(t || '').trim());
  return m ? ((Number(m[1]) % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]) : null;
};
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const kindOfFreq = (f) => (/single|one.?time|on demand/i.test(f || '') ? 'One-time' : f ? f.replace(/^Every Two Weeks$/i, 'Every 2 weeks').replace(/^Every Four Weeks$/i, 'Every 4 weeks').replace(/^Every Week$/i, 'Weekly') : null);

// Exported for tests: the conflicts in a list of Dispatch Board rows.
//   drive(a, b): minutes between two bookings' homes, or null when not known.
export function findConflicts(rows, { drive = () => null, slack = 5 } = {}) {
  const byTeamDay = new Map();
  for (const r of rows) {
    if (!r.date || !r.team || !isVisit(r.status)) continue;
    const s = minutes(r.time);
    const e = minutes(r.endTime);
    if (s == null || e == null || e <= s) continue;
    // A booking can be on two teams ("Blue, Grey"): it counts on each.
    for (const team of r.team.split(',').map((x) => x.trim()).filter(Boolean)) {
      const k = `${team}|${r.date}`;
      if (!byTeamDay.has(k)) byTeamDay.set(k, []);
      byTeamDay.get(k).push({ ...r, team, s, e });
    }
  }
  const view = (b) => ({ jobId: b.jobId, customer: b.customer, address: b.address || null, phone: b.phone || null, time: `${b.time} – ${b.endTime}`, start: b.s, end: b.e, frequency: kindOfFreq(b.frequency), status: b.status });
  const out = [];
  for (const [k, list] of byTeamDay) {
    const [team, date] = k.split('|');
    list.sort((a, b) => a.s - b.s || a.e - b.e);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].s < list[i].e; j++) {
        const a = list[i];
        const b = list[j];
        const overlap = Math.min(a.e, b.e) - b.s;
        out.push({ kind: 'overlap', team, date, minutes: overlap, full: overlap >= Math.min(a.e - a.s, b.e - b.s) - 5, same: Math.abs(a.s - b.s) <= 5, bookings: [view(a), view(b)] });
      }
      // The next booking that doesn't overlap: is there time to drive there?
      const a = list[i];
      const b = list.slice(i + 1).find((x) => x.s >= a.e);
      if (b && list.slice(i + 1).every((x) => x.s >= a.e || x === b)) {
        const need = drive(a, b);
        const gap = b.s - a.e;
        if (need != null && gap + slack < need && norm(a.customer) !== norm(b.customer)) out.push({ kind: 'tight', team, date, minutes: need - gap, gap, drive: need, bookings: [view(a), view(b)] });
      }
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.team.localeCompare(y.team) || x.bookings[0].start - y.bookings[0].start);
}

// Double bookings from `from` (default today) for `weeks` weeks (default 12, at most 26).
export async function doubleBookings(mc, q = {}) {
  const from = q.from || localToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new McError('input', 'Use from=YYYY-MM-DD');
  const weeks = Math.min(Math.max(Number(q.weeks) || 12, 1), 26);
  const to = iso(Date.parse(`${from}T00:00:00Z`) + (weeks * 7 - 1) * DAY);
  const [{ rows, at }, homes] = await Promise.all([boardRows(mc, from, to), book(mc)]);
  const lookup = homeIndex(homes);
  const base = await office(mc, homes);
  await learnPlaces(homes, base);
  // Homes by customer name (the Dispatch Board lists the customer, not the home).
  const byCustomer = new Map();
  for (const h of homes) {
    const k = norm(h.customer);
    byCustomer.set(k, byCustomer.has(k) && byCustomer.get(k) !== h ? null : h);
  }
  const where = (r) => byCustomer.get(norm(r.customer)) || lookup(r.customer) || null;
  const conflicts = findConflicts(rows, {
    drive: (a, b) => {
      const x = where(a);
      const y = where(b);
      return x && y ? driveTime(x, y) : null;
    },
  });
  // The same clash on several dates (two regulars whose spots overlap every cycle) is one
  // entry with all its dates: fixing it once in MaidCentral fixes them all.
  const groups = new Map();
  for (const c of conflicts) {
    const k = [c.kind, c.team, ...c.bookings.map((b) => `${norm(b.customer)}@${b.start}-${b.end}`).sort()].join('|');
    if (!groups.has(k)) groups.set(k, { ...c, dates: [] });
    groups.get(k).dates.push(c.date);
  }
  return {
    from,
    to,
    weeks,
    groups: [...groups.values()].map(({ date, ...g }) => ({ ...g, firstDate: g.dates[0], repeats: g.dates.length > 1 })),
    checkedAt: new Date(at).toISOString(),
    overlaps: conflicts.filter((c) => c.kind === 'overlap').length,
    tight: conflicts.filter((c) => c.kind === 'tight').length,
    conflicts,
  };
}
