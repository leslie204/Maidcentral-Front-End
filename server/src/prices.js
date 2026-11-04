// Price check: after a rate change, is every booking priced at the right hourly rate?
//
// MaidCentral's Dispatch Board lists each booking with its price (Bill Rate), allowed
// hours (cleaner-hours) and frequency, for any date range (its filter form, a reviewed
// read). The hourly rate is the price per hour of a two-person team:
//   rate = price ÷ (allowed hours ÷ 2)      e.g. $305 for 5.00 allowed hours = $122/hr
// Recurring bookings are checked against the recurring rate, one-time ones (Single, On
// Demand) against the one-time rate. Results are grouped by customer, with the price each
// should have. Read-only: prices are changed in MaidCentral.
import { tables } from './extract.js';
import { McError } from './mc.js';
import { localToday } from './geo.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const num = (v) => parseFloat(String(v ?? '').replace(/[^\d.-]/g, ''));
const money = (n) => Math.round(n * 100) / 100;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const mcDate = (isoDay) => {
  const [y, m, d] = isoDay.split('-');
  return `${m}/${d}/${y}`;
};
// "11/4/2026 8:45 AM - 11:15 AM" -> { date: '2026-11-04', time: '8:45 AM' }
const when = (s) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)/i.exec(String(s || '').trim());
  return m ? { date: `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`, time: m[4].toUpperCase() } : { date: null, time: null };
};
export const kindOf = (freq) => (/single|one[- ]?time|once|on demand/i.test(freq || '') ? 'one-time' : /every|week|month/i.test(freq || '') ? 'recurring' : 'one-time');

// The Dispatch Board's rows as bookings.
export function parseBoard(html) {
  const t = tables(html).find((x) => x.headers.includes('Bill Rate') && x.headers.includes('Alwd. Hours'));
  if (!t) throw new McError('upstream', "The Dispatch Board didn't return the expected table");
  const col = (h) => t.headers.indexOf(h);
  const v = (r, h) => (col(h) >= 0 ? r.cells[col(h)] : '');
  return t.rows.map((r) => {
    const w = when(v(r, 'Scheduled'));
    return {
      jobId: String(v(r, 'Job ID')).trim(),
      customer: String(v(r, 'Customer')).trim(),
      address: String(v(r, 'Address')).trim(),
      frequency: String(v(r, 'Freq.')).trim(),
      date: w.date,
      time: w.time,
      team: String(v(r, 'Team')).trim(),
      allowedHours: num(v(r, 'Alwd. Hours')),
      teamSize: num(v(r, 'Team Size')) || null,
      billingType: String(v(r, 'Billing Type')).trim(),
      price: num(v(r, 'Bill Rate')),
      status: String(v(r, 'Status')).trim(),
    };
  });
}

// Checks bookings against the rates. Exported for tests.
export function audit(bookings, { recurring = 122, oneTime = 130, tolerance = 1, perTeamOf = 2 } = {}) {
  const target = { recurring: Number(recurring), 'one-time': Number(oneTime) };
  const checked = bookings
    .filter((b) => b.date && !/cancel/i.test(b.status))
    .map((b) => {
      const kind = kindOf(b.frequency);
      const want = target[kind];
      const teamHours = b.allowedHours / perTeamOf;
      const rate = b.allowedHours > 0 ? money(b.price / teamHours) : null;
      const should = b.allowedHours > 0 ? money(want * teamHours) : null;
      let state;
      if (/hour/i.test(b.billingType)) state = 'hourly';
      else if (!(b.allowedHours > 0)) state = 'no-hours';
      else if (!(b.price > 0)) state = 'no-price';
      else if (Math.abs(rate - want) <= Number(tolerance)) state = 'ok';
      else state = rate < want ? 'low' : 'high';
      return { ...b, kind, rate, target: want, should, difference: should != null ? money(b.price - should) : null, state };
    });
  // One line per customer and frequency (one service set), the next booking first.
  const groups = new Map();
  for (const b of checked) {
    const k = `${b.customer.toLowerCase()}|${b.frequency.toLowerCase()}|${b.address.toLowerCase()}`;
    if (!groups.has(k)) groups.set(k, { key: k, customer: b.customer, address: b.address, frequency: b.frequency, kind: b.kind, target: b.target, bookings: [] });
    groups.get(k).bookings.push(b);
  }
  const rank = { low: 0, high: 1, 'no-price': 2, 'no-hours': 3, hourly: 4, ok: 5 };
  const customers = [...groups.values()]
    .map((g) => {
      const bookings = g.bookings.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      const wrong = bookings.filter((b) => b.state !== 'ok');
      const next = bookings[0];
      const worst = [...wrong].sort((a, b) => rank[a.state] - rank[b.state])[0];
      // Show the first booking that's wrong (or the next one if all are right).
      const shown = wrong[0] || next;
      const rates = [...new Set(bookings.map((b) => b.rate))];
      return {
        ...g,
        bookings,
        next: { date: next.date, time: next.time, team: next.team, jobId: next.jobId },
        firstWrong: wrong[0] ? { date: wrong[0].date, time: wrong[0].time, team: wrong[0].team, jobId: wrong[0].jobId } : null,
        wrongDates: wrong.map((b) => b.date),
        allowedHours: shown.allowedHours,
        price: shown.price,
        rate: shown.rate,
        should: shown.should,
        rates,
        wrong: wrong.length,
        state: worst ? worst.state : 'ok',
        mixed: rates.length > 1,
      };
    })
    .sort((a, b) => rank[a.state] - rank[b.state] || a.next.date.localeCompare(b.next.date) || a.customer.localeCompare(b.customer));
  const count = (list, f) => list.filter(f).length;
  return {
    rates: { recurring: target.recurring, oneTime: target['one-time'], tolerance: Number(tolerance), perTeamOf },
    summary: {
      bookings: checked.length,
      ok: count(checked, (b) => b.state === 'ok'),
      wrong: count(checked, (b) => b.state !== 'ok'),
      customers: customers.length,
      customersOk: count(customers, (c) => c.state === 'ok'),
      customersToFix: count(customers, (c) => c.state !== 'ok'),
      byKind: Object.fromEntries(['recurring', 'one-time'].map((k) => [k, { bookings: count(checked, (b) => b.kind === k), ok: count(checked, (b) => b.kind === k && b.state === 'ok') }])),
      // The rates found, most common first (e.g. how many are still at the old rate).
      ratesFound: Object.entries(
        checked.reduce((m, b) => {
          const key = `${b.kind}|${b.rate ?? 'none'}`;
          m[key] = (m[key] || 0) + 1;
          return m;
        }, {}),
      )
        .map(([k, n]) => ({ kind: k.split('|')[0], rate: k.split('|')[1] === 'none' ? null : Number(k.split('|')[1]), bookings: n }))
        .sort((a, b) => b.bookings - a.bookings),
      missingRevenue: money(checked.filter((b) => b.state === 'low').reduce((s, b) => s - b.difference, 0)),
    },
    customers,
  };
}

const cache = new WeakMap(); // McSession -> Map(range -> { at, value })

export async function priceCheck(mc, q = {}) {
  const from = q.from || localToday();
  const to = q.to || iso(Date.parse(`${from}T00:00:00Z`) + 27 * DAY);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
  if (!(days >= 1) || days > 92) throw new McError('input', 'Choose a range of up to 3 months.');
  if (!cache.has(mc)) cache.set(mc, new Map());
  const m = cache.get(mc);
  const key = `${from}|${to}`;
  let hit = m.get(key);
  if (!hit || q.fresh || Date.now() - hit.at > 5 * MIN) {
    const html = await mc.postFormHtml('/Report/DispatchBoard', { StartDate: mcDate(from), EndDate: mcDate(to) });
    hit = { at: Date.now(), value: parseBoard(html) };
    m.set(key, hit);
  }
  return { from, to, checkedAt: new Date(hit.at).toISOString(), ...audit(hit.value, q) };
}
