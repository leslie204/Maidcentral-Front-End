// Scorecards: what customers said after their clean, from MaidCentral's Scorecard Results
// report (a GET with a date range), with each visit's team from the Dispatch Board.
//
// Scores are MaidCentral's 0–4 scale: 4 Thrilled, 3 Happy, 2 A few concerns, 1 Major
// concerns, 0 Considering another company. "Concerns" = 0–2. The report lists every
// scorecard sent; those without a response count toward the response rate only.
// Read-only.
import { tables } from './extract.js';
import { McError } from './mc.js';
import { localToday } from './geo.js';
import { perSession, FRESH } from './cache.js';

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const mcDay = (d) => {
  const [y, m, dd] = d.split('-');
  return `${m}/${dd}/${y}`;
};
// "11/4/2026" -> "2026-11-04"
const isoOf = (s) => {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || ''));
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
};
const round = (n, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export const LABELS = { 4: 'Thrilled', 3: 'Happy', 2: 'A few concerns', 1: 'Major concerns', 0: 'Considering another company' };

// What low-score comments are about (simple keyword themes).
const THEMES = [
  ['Floors & mopping', /floor|mop|vacuum|carpet|rug|baseboard/i],
  ['Bathrooms', /bath|toilet|shower|tub|grout|mold|mildew|sink|mirror/i],
  ['Kitchen', /kitchen|stove|oven|counter|fridge|microwave|cabinet/i],
  ['Dusting', /dust|cobweb|blind|fan|shelf|shelves/i],
  ['Missed or not done', /missed|not done|skipp|forgot|didn.?t|did not|left|incomplete|not (clean|wiped)/i],
  ['Timing & arrival', /\blate\b|\bearly\b|arriv|rush|hurr|on time|took (too )?long|short on time|no.?show/i],
  ['Care & damage', /broke|damag|scratch|careless|moved|messy|put back/i],
  ['Smell & products', /smell|odor|chemical|product|streak/i],
];
export const themesOf = (text) => THEMES.filter(([, re]) => re.test(text || '')).map(([name]) => name);

// The report's rows.
export function parseResults(html) {
  const t = tables(html).find((x) => x.headers.includes('Response') && x.headers.includes('Job Date'));
  if (!t) throw new McError('upstream', "The Scorecard Results report didn't return the expected table");
  const i = (h) => t.headers.indexOf(h);
  return t.rows.map((r) => {
    const c = (k) => String(r.cells[k] ?? '').replace(/\s+/g, ' ').trim();
    const response = c(i('Response'));
    const m = /^(\d)\s*-\s*(.*)$/.exec(response);
    return {
      customer: c(i('Customer')),
      home: c(i('Home Name')),
      jobDate: isoOf(c(i('Job Date'))),
      techs: c(i('Techs')).split(',').map((x) => x.trim()).filter(Boolean),
      responseDate: isoOf(c(i('Response Date'))),
      score: m ? Number(m[1]) : null,
      label: m ? m[2] : null,
      trend: c(i('Trend')).toLowerCase() || null,
      comment: c(i('Comments')) || null,
    };
  });
}

// Visit team by customer and date, from the Dispatch Board rows.
export function teamIndex(boardHtml) {
  const t = tables(boardHtml).find((x) => x.headers.includes('Team') && x.headers.includes('Scheduled'));
  const out = new Map();
  if (!t) return out;
  const i = (h) => t.headers.indexOf(h);
  for (const r of t.rows) {
    const d = isoOf(r.cells[i('Scheduled')]);
    const status = String(r.cells[i('Status')] || '');
    if (!d || /skip|moved|cancel/i.test(status)) continue;
    out.set(`${norm(r.cells[i('Customer')])}|${d}`, String(r.cells[i('Team')] || '').trim() || null);
  }
  return out;
}

const weekOf = (d) => {
  const ms = Date.parse(`${d}T00:00:00Z`);
  const wd = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
  return iso(ms - wd * DAY);
};

function stats(rows) {
  const answered = rows.filter((r) => r.score != null);
  const n = answered.length;
  const sum = answered.reduce((s, r) => s + r.score, 0);
  const count = (f) => answered.filter(f).length;
  return {
    sent: rows.length,
    responses: n,
    responseRate: rows.length ? round((n / rows.length) * 100, 1) : null,
    average: n ? round(sum / n) : null,
    thrilled: count((r) => r.score === 4),
    happy: count((r) => r.score === 3),
    concerns: count((r) => r.score <= 2),
    atRisk: count((r) => r.score === 0),
    thrilledShare: n ? round((count((r) => r.score === 4) / n) * 100, 1) : null,
    concernShare: n ? round((count((r) => r.score <= 2) / n) * 100, 1) : null,
    comments: answered.filter((r) => r.comment).length,
    byScore: [4, 3, 2, 1, 0].map((s) => ({ score: s, label: LABELS[s], count: count((r) => r.score === s) })),
  };
}

// The whole report for a period, compared with the period before it. Exported for tests.
export function analyse(rows, { from, to, previous = [] }) {
  const inRange = rows.filter((r) => r.jobDate && r.jobDate >= from && r.jobDate <= to);
  const now = stats(inRange);
  const before = stats(previous);
  // Weekly trend (by the week of the clean).
  const weeks = new Map();
  for (const r of inRange) {
    const w = weekOf(r.jobDate);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w).push(r);
  }
  const trend = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, rs]) => ({ week, ...stats(rs) }));
  // By team and by cleaner.
  const group = (keyOf) => {
    const g = new Map();
    for (const r of inRange) for (const k of keyOf(r)) {
      if (!k) continue;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(r);
    }
    return [...g.entries()].map(([name, rs]) => {
      const s = stats(rs);
      const lastConcern = rs.filter((r) => r.score != null && r.score <= 2).sort((a, b) => b.jobDate.localeCompare(a.jobDate))[0];
      return { name, ...s, lastConcern: lastConcern ? { date: lastConcern.jobDate, customer: lastConcern.customer, score: lastConcern.score } : null };
    });
  };
  const teams = group((r) => String(r.team || '').split(',').map((x) => x.trim())).filter((t) => t.sent >= 5).sort((a, b) => (b.responses ? 1 : 0) - (a.responses ? 1 : 0) || (a.average ?? 9) - (b.average ?? 9));
  const cleaners = group((r) => r.techs).sort((a, b) => b.concerns - a.concerns || (a.average ?? 9) - (b.average ?? 9));
  // Customers to follow up: any 0–2 in the period, worst and most recent first.
  const byCustomer = new Map();
  for (const r of inRange.filter((x) => x.score != null)) {
    const k = norm(`${r.customer}|${r.home}`);
    if (!byCustomer.has(k)) byCustomer.set(k, []);
    byCustomer.get(k).push(r);
  }
  const followUp = [...byCustomer.values()]
    .map((rs) => {
      const sorted = rs.sort((a, b) => b.jobDate.localeCompare(a.jobDate));
      const low = sorted.filter((r) => r.score <= 2);
      return low.length ? { customer: sorted[0].customer, home: sorted[0].home, latest: sorted[0], lowCount: low.length, responses: sorted.length, worst: Math.min(...low.map((r) => r.score)), low } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.worst - b.worst || b.lowCount - a.lowCount || b.latest.jobDate.localeCompare(a.latest.jobDate));
  // Comment themes among concerns.
  const concernRows = inRange.filter((r) => r.score != null && r.score <= 2);
  const themeCount = {};
  for (const r of concernRows) for (const t of themesOf(r.comment)) themeCount[t] = (themeCount[t] || 0) + 1;
  const themes = Object.entries(themeCount).map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count);
  const comments = inRange.filter((r) => r.comment && r.score != null).sort((a, b) => b.jobDate.localeCompare(a.jobDate));
  return { from, to, now, before, trend, teams, cleaners, followUp, themes, comments, insights: insights({ now, before, trend, teams, cleaners, followUp, themes }) };
}

// Plain-language observations, most important first.
function insights({ now, before, teams, cleaners, followUp, themes, trend }) {
  const out = [];
  const pct = (n) => `${Math.round(n)}%`;
  if (!now.responses) return [{ tone: 'info', text: 'No scorecard responses in this period yet.' }];
  if (before.responses) {
    const d = round(now.average - before.average);
    if (Math.abs(d) >= 0.05) out.push({ tone: d > 0 ? 'good' : 'bad', text: `Average score is ${now.average} (out of 4), ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} from ${before.average} in the previous period.` });
    else out.push({ tone: 'info', text: `Average score is steady at ${now.average} out of 4 (${before.average} before).` });
    const c = now.concernShare - before.concernShare;
    if (Math.abs(c) >= 2) out.push({ tone: c < 0 ? 'good' : 'bad', text: `${pct(now.concernShare)} of responses raised concerns (0–2), ${c < 0 ? 'down' : 'up'} from ${pct(before.concernShare)}.` });
  } else out.push({ tone: 'info', text: `Average score is ${now.average} out of 4 from ${now.responses} responses.` });
  if (now.atRisk) out.push({ tone: 'bad', text: `${now.atRisk} customer${now.atRisk > 1 ? 's' : ''} said they're considering another company: call them first (see Follow up).` });
  if (now.responseRate != null && now.responseRate < 35) out.push({ tone: 'warn', text: `Only ${pct(now.responseRate)} of scorecards get an answer (${now.responses} of ${now.sent}), so a few low scores move the averages a lot.` });
  const repeat = followUp.filter((f) => f.lowCount >= 2);
  if (repeat.length) out.push({ tone: 'bad', text: `${repeat.length} customer${repeat.length > 1 ? 's' : ''} raised concerns more than once: ${repeat.slice(0, 3).map((f) => f.customer).join(', ')}${repeat.length > 3 ? '…' : ''}.` });
  if (themes.length) out.push({ tone: 'warn', text: `Most concerns mention ${themes.slice(0, 2).map((t) => `${t.theme.toLowerCase()} (${t.count})`).join(' and ')}.` });
  const teamsWith = teams.filter((t) => t.responses >= 8);
  if (teamsWith.length >= 2) {
    const worst = teamsWith.reduce((a, b) => (b.concernShare > a.concernShare ? b : a));
    const best = teamsWith.reduce((a, b) => (b.average > a.average ? b : a));
    if (worst.concerns >= 2 && worst.concernShare >= now.concernShare * 1.5) out.push({ tone: 'warn', text: `${worst.name} has the most concerns for its size: ${worst.concerns} of ${worst.responses} responses (${pct(worst.concernShare)}, against ${pct(now.concernShare)} overall).` });
    out.push({ tone: 'good', text: `${best.name} scores best: ${best.average} average over ${best.responses} responses.` });
  }
  const flagged = cleaners.filter((c) => c.responses >= 5 && c.concerns >= 2);
  if (flagged.length) out.push({ tone: 'warn', text: `Cleaners on 2 or more visits with concerns: ${flagged.slice(0, 4).map((c) => `${c.name} (${c.concerns})`).join(', ')}. Worth a look at the comments.` });
  if (trend.length >= 4) {
    const last = trend.slice(-2).filter((w) => w.responses);
    const firstHalf = trend.slice(0, Math.floor(trend.length / 2)).filter((w) => w.responses);
    const avg = (ws) => ws.reduce((s, w) => s + w.average * w.responses, 0) / Math.max(1, ws.reduce((s, w) => s + w.responses, 0));
    if (last.length && firstHalf.length) {
      const d = round(avg(last) - avg(firstHalf));
      if (Math.abs(d) >= 0.1) out.push({ tone: d > 0 ? 'good' : 'bad', text: `The last two weeks average ${round(avg(last))}, ${d > 0 ? 'better' : 'worse'} than the start of the period (${round(avg(firstHalf))}).` });
    }
  }
  return out;
}

const cache = perSession();

async function load(mc, from, to) {
  if (!cache.has(mc)) cache.set(mc, new Map());
  const m = cache.get(mc);
  const key = `${from}|${to}`;
  const hit = m.get(key);
  if (hit && Date.now() - hit.at < FRESH.fourWeeks) return hit;
  const [html, board] = await Promise.all([
    mc.getHtml('/Report/ScorecardResults', { Start: mcDay(from), End: mcDay(to), OnlyShowResponses: 'false' }),
    mc.postFormHtml('/Report/DispatchBoard', { StartDate: mcDay(from), EndDate: mcDay(to) }).catch(() => ''),
  ]);
  const teams = teamIndex(board);
  const rows = parseResults(html).map((r) => ({ ...r, team: teams.get(`${norm(r.customer)}|${r.jobDate}`) || null }));
  const value = { at: Date.now(), rows };
  m.set(key, value);
  if (m.size > 12) m.delete(m.keys().next().value);
  return value;
}

export async function scorecards(mc, q = {}) {
  const to = q.to || localToday();
  const from = q.from || iso(Date.parse(`${to}T00:00:00Z`) - 29 * DAY);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
  if (!(days >= 1) || days > 370) throw new McError('input', 'Choose a range of up to a year.');
  // The previous period of the same length, for comparison.
  const pTo = iso(Date.parse(`${from}T00:00:00Z`) - DAY);
  const pFrom = iso(Date.parse(`${pTo}T00:00:00Z`) - (days - 1) * DAY);
  const [cur, prev] = await Promise.all([load(mc, from, to), load(mc, pFrom, pTo)]);
  const result = analyse(cur.rows, { from, to, previous: prev.rows.filter((r) => r.jobDate >= pFrom && r.jobDate <= pTo) });
  return { ...result, previous: { from: pFrom, to: pTo }, checkedAt: new Date(cur.at).toISOString(), labels: LABELS };
}
