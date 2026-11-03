// The scheduling planner, built from MaidCentral's own day data (jobs, teams, shifts):
//   capacity   — per team and day: working window, booked hours, free gaps, utilisation
//   attention  — things to handle: unassigned jobs, over capacity, nobody scheduled, jobs
//                outside the team's hours, overlapping jobs, absences, spare cleaners
//   continuity — do homes keep the same team? (past 4 weeks vs the coming 2)
//   slots      — where a new job of N hours fits (gaps in teams' days), best first
//
// Times: MaidCentral sends wall-clock times as if they were UTC ("/Date(ms)/"). All maths
// here stays in that "wall-clock UTC" space; the API returns local ISO strings without a
// zone ("2026-11-03T09:00:00"), which browsers read as local time.
import { mcDate, McError } from './mc.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const cache = new WeakMap(); // McSession -> Map(key -> { at, ttl, value })

export const wall = (ms) => (ms == null ? null : new Date(ms).toISOString().slice(0, 19));
export const hours = (ms) => Math.round((ms / HOUR) * 100) / 100;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const mcDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}/${y}`;
};
export function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new McError('input', 'Use from=YYYY-MM-DD');
  return Date.parse(`${value}T00:00:00Z`);
}

async function cached(mc, key, ttl, fn) {
  if (!cache.has(mc)) cache.set(mc, new Map());
  const m = cache.get(mc);
  const hit = m.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;
  const value = await fn();
  m.set(key, { at: Date.now(), ttl, value });
  if (m.size > 200) m.delete(m.keys().next().value);
  return value;
}

// Runs fn over items, at most `limit` at a time.
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}

// One day as MaidCentral's schedule screens show it. Past days are cached for hours,
// today and later for a few minutes.
export async function dayData(mc, dayMs, { jobsOnly = false } = {}) {
  const iso = isoDay(dayMs);
  const date = mcDay(iso);
  const past = dayMs < Date.now() - DAY;
  const ttl = past ? 6 * HOUR : 3 * MIN;
  const jobs = await cached(mc, `jobs:${iso}`, ttl, () => mc.getJson('/Job/ReadJobs', { date, view: 'HalfHourView' }));
  if (jobsOnly) return { iso, jobs };
  const [teams, shifts, employees] = await Promise.all([
    // Team Monitor's list carries the team colours (Schedule/ReadTeams doesn't).
    cached(mc, `teams:${iso}`, ttl, () => mc.getJson('/Job/TeamMonitorTeams', { date, view: 'HalfHourView' })),
    cached(mc, `shifts:${iso}`, ttl, () => mc.getJson('/Schedule/Read', { date, view: 'HalfHourView' })),
    cached(mc, `employees:${iso}`, ttl, () => mc.getJson('/Schedule/ReadEmployees', { date })),
  ]);
  return { iso, jobs, teams, shifts, employees };
}

const jobView = (j) => ({
  id: j.JobInformationId,
  teamId: j.TeamID || 0,
  title: String(j.Title || '').trim(),
  start: mcDate(j.Start),
  end: mcDate(j.End),
  allowedHours: j.AllowedTime ?? null,
  color: j.StatusColor || j.Color || null,
});

// Merges overlapping intervals.
function merge(intervals) {
  const sorted = intervals.filter((x) => x.end > x.start).sort((a, b) => a.start - b.start);
  const out = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);
    else out.push({ ...x });
  }
  return out;
}

// Per team for one day: window, jobs, gaps, issues. Plus day-level issues.
export function analyseDay(day) {
  const names = new Map(day.employees.map((e) => [e.EmployeeID ?? e.value, e.text || e.FullName || [e.FirstName, e.LastName].filter(Boolean).join(' ')]));
  const teamMeta = new Map(day.teams.map((t) => [t.TeamID, t]));
  const jobs = day.jobs.map(jobView).filter((j) => j.start && j.end);
  const shifts = day.shifts.map((s) => ({
    employeeId: s.EmployeeID,
    name: names.get(s.EmployeeID) || String(s.Title || '').trim() || `Cleaner ${s.EmployeeID}`,
    teamId: s.TeamID || 0,
    start: mcDate(s.Start),
    end: mcDate(s.End),
    absent: Boolean(s.Absent),
    late: Boolean(s.Late),
    reason: s.Reason || null,
  }));
  const issues = [];
  const teamIds = new Set([...teamMeta.keys(), ...jobs.map((j) => j.teamId), ...shifts.map((s) => s.teamId)].filter(Boolean));
  const teams = [...teamIds].map((id) => {
    const meta = teamMeta.get(id) || {};
    const name = meta.TeamName || meta.text || `Team ${id}`;
    const members = shifts.filter((s) => s.teamId === id);
    const working = members.filter((s) => !s.absent && s.start && s.end);
    const window = working.length ? { start: Math.min(...working.map((s) => s.start)), end: Math.max(...working.map((s) => s.end)) } : null;
    const teamJobs = jobs.filter((j) => j.teamId === id).sort((a, b) => a.start - b.start);
    const busy = merge(teamJobs.map((j) => ({ start: j.start, end: j.end })));
    const booked = busy.reduce((s, b) => s + (b.end - b.start), 0);
    const capacity = window ? window.end - window.start : 0;
    const gaps = [];
    if (window) {
      let cursor = window.start;
      for (const b of busy) {
        if (b.start - cursor >= 30 * MIN) gaps.push({ start: cursor, end: Math.min(b.start, window.end) });
        cursor = Math.max(cursor, b.end);
      }
      if (window.end - cursor >= 30 * MIN) gaps.push({ start: cursor, end: window.end });
    }
    const add = (kind, title, extra = {}) => issues.push({ kind, date: day.iso, teamId: id, team: name, title, ...extra });
    if (teamJobs.length && !working.length) add('no_staff', `${name} has ${teamJobs.length} job${teamJobs.length > 1 ? 's' : ''} but nobody scheduled`, { jobs: teamJobs.map(out) });
    if (window && booked > capacity) add('over_capacity', `${name} is booked ${hours(booked)} h in a ${hours(capacity)} h day`);
    if (window) {
      const outside = teamJobs.filter((j) => j.start < window.start || j.end > window.end);
      if (outside.length) add('outside_hours', `${outside.length} job${outside.length > 1 ? 's' : ''} outside ${name}'s hours (${clock(window.start)}–${clock(window.end)})`, { jobs: outside.map(out) });
    }
    for (let i = 1; i < teamJobs.length; i++) {
      if (teamJobs[i].start < teamJobs[i - 1].end) add('overlap', `${name}: ${teamJobs[i - 1].title} and ${teamJobs[i].title} overlap`, { jobs: [out(teamJobs[i - 1]), out(teamJobs[i])] });
    }
    for (const m of members.filter((s) => s.absent)) if (teamJobs.length) add('absent', `${m.name} is absent from ${name}${m.reason ? ` (${m.reason})` : ''}`);
    return {
      id,
      name,
      color: cssColor(meta.Color) || cssColor(meta.RgbBackgroundColor),
      textColor: cssColor(meta.RgbTextColor),
      members: members.map((m) => ({ ...m, start: wall(m.start), end: wall(m.end) })),
      window: window && { start: wall(window.start), end: wall(window.end) },
      jobs: teamJobs.map(out),
      bookedHours: hours(booked),
      capacityHours: hours(capacity),
      utilisation: capacity ? Math.round((booked / capacity) * 100) : null,
      gaps: gaps.map((g) => ({ start: wall(g.start), end: wall(g.end), hours: hours(g.end - g.start), startMs: g.start, endMs: g.end })),
    };
  });
  const unassigned = jobs.filter((j) => !j.teamId);
  if (unassigned.length) issues.push({ kind: 'unassigned', date: day.iso, title: `${unassigned.length} job${unassigned.length > 1 ? 's' : ''} without a team`, jobs: unassigned.map(out) });
  const spare = shifts.filter((s) => !s.teamId && !s.absent && s.start && s.end);
  return {
    date: day.iso,
    teams: teams.sort((a, b) => a.name.localeCompare(b.name)),
    spare: spare.map((s) => ({ employeeId: s.employeeId, name: s.name, start: wall(s.start), end: wall(s.end) })),
    issues,
  };
}

// MaidCentral sends "#fbf60d" and "rgb(251, 246, 13);" (with a stray semicolon).
export const cssColor = (v) => {
  const c = String(v ?? '').trim().replace(/;+$/, '');
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(c) ? c : null;
};

const out = (j) => ({ id: j.id, title: j.title, start: wall(j.start), end: wall(j.end) });
const clock = (ms) => {
  const d = new Date(ms);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

// Capacity grid + attention list for `days` days from `from`.
export async function planOverview(mc, from, days = 14) {
  const start = parseDay(from);
  const n = Math.min(Math.max(Number(days) || 14, 1), 28);
  const list = await pool(Array.from({ length: n }, (_, i) => start + i * DAY), 6, (d) => dayData(mc, d));
  const analysed = list.map(analyseDay);
  const teamIndex = new Map();
  for (const d of analysed) for (const t of d.teams) if (!teamIndex.has(t.id)) teamIndex.set(t.id, { id: t.id, name: t.name, color: t.color, textColor: t.textColor });
  const teams = [...teamIndex.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    from,
    days: analysed.map((d) => d.date),
    teams: teams.map((t) => ({
      ...t,
      cells: analysed.map((d) => {
        const x = d.teams.find((y) => y.id === t.id);
        return x ? { date: d.date, booked: x.bookedHours, capacity: x.capacityHours, utilisation: x.utilisation, jobs: x.jobs.length, gaps: x.gaps.map(({ startMs, endMs, ...g }) => g) } : { date: d.date, booked: 0, capacity: 0, utilisation: null, jobs: 0, gaps: [] };
      }),
    })),
    spare: analysed.map((d) => ({ date: d.date, people: d.spare })).filter((d) => d.people.length),
    issues: analysed.flatMap((d) => d.issues),
    totals: analysed.map((d) => ({
      date: d.date,
      jobs: d.teams.reduce((s, t) => s + t.jobs.length, 0),
      booked: Math.round(d.teams.reduce((s, t) => s + t.bookedHours, 0) * 10) / 10,
      capacity: Math.round(d.teams.reduce((s, t) => s + t.capacityHours, 0) * 10) / 10,
    })),
  };
}

// One day in detail (the day view: teams, members, jobs and gaps).
export async function planDay(mc, date) {
  const a = analyseDay(await dayData(mc, parseDay(date)));
  return { ...a, teams: a.teams.map((t) => ({ ...t, gaps: t.gaps.map(({ startMs, endMs, ...g }) => g) })) };
}

// Same team for the same home? Past 4 weeks of history against the coming 2 weeks.
export async function continuity(mc, from) {
  const start = parseDay(from);
  const pastDays = Array.from({ length: 28 }, (_, i) => start - (28 - i) * DAY);
  const nextDays = Array.from({ length: 14 }, (_, i) => start + i * DAY);
  const [past, next] = await Promise.all([
    pool(pastDays, 6, (d) => dayData(mc, d, { jobsOnly: true })),
    pool(nextDays, 6, (d) => dayData(mc, d)),
  ]);
  const teamNames = new Map();
  for (const d of next) for (const t of d.teams) teamNames.set(t.TeamID, t.TeamName || t.text);
  const history = new Map(); // home -> Map(teamId -> count)
  for (const d of past) {
    for (const j of d.jobs.map(jobView)) {
      if (!j.title || !j.teamId) continue;
      if (!history.has(j.title)) history.set(j.title, new Map());
      const m = history.get(j.title);
      m.set(j.teamId, (m.get(j.teamId) || 0) + 1);
    }
  }
  const usual = (title) => {
    const m = history.get(title);
    if (!m) return null;
    const [teamId, count] = [...m].sort((a, b) => b[1] - a[1])[0];
    const total = [...m.values()].reduce((s, n) => s + n, 0);
    return { teamId, count, total };
  };
  const repeat = [...history].filter(([, m]) => [...m.values()].reduce((s, n) => s + n, 0) >= 2);
  const sameTeam = repeat.filter(([, m]) => m.size === 1).length;
  const upcoming = next.flatMap((d) => d.jobs.map(jobView).filter((j) => j.start).map((j) => ({ ...j, date: d.iso })));
  const changes = [];
  let withUsual = 0;
  let known = 0;
  for (const j of upcoming) {
    const u = usual(j.title);
    // Only homes with a clear usual team: at least 2 visits with it, and most of them.
    if (!u || u.count < 2 || u.count / u.total <= 0.5) continue;
    known += 1;
    if (u.teamId === j.teamId) withUsual += 1;
    else changes.push({ ...out(j), date: j.date, team: teamNames.get(j.teamId) || `Team ${j.teamId}`, usualTeam: teamNames.get(u.teamId) || `Team ${u.teamId}`, usualVisits: u.count, pastVisits: u.total });
  }
  return {
    from,
    homes: history.size,
    repeatHomes: repeat.length,
    alwaysSameTeam: sameTeam,
    sameTeamShare: repeat.length ? Math.round((sameTeam / repeat.length) * 100) : null,
    upcomingKnown: known,
    upcomingWithUsual: withUsual,
    upcomingShare: known ? Math.round((withUsual / known) * 100) : null,
    changes: changes.sort((a, b) => a.start.localeCompare(b.start)),
  };
}

// Where does a new job of `duration` hours fit? Gaps in teams' days, best first.
//   part: any | morning (starts before noon) | afternoon
//   home: optional job title (or part of one); teams that served it recently rank higher
//   now: the browser's local time (YYYY-MM-DDTHH:MM), to skip slots already past today
export async function findSlots(mc, { from, days = 14, duration = 2, part = 'any', home = '', now }) {
  const start = parseDay(from);
  const need = Math.round(Math.min(Math.max(Number(duration) || 2, 0.5), 12) * HOUR);
  const n = Math.min(Math.max(Number(days) || 14, 1), 28);
  const list = await pool(Array.from({ length: n }, (_, i) => start + i * DAY), 6, (d) => dayData(mc, d));
  let familiar = new Map();
  const q = String(home || '').trim().toLowerCase();
  if (q) {
    const past = await pool(Array.from({ length: 28 }, (_, i) => start - (28 - i) * DAY), 6, (d) => dayData(mc, d, { jobsOnly: true }));
    for (const d of past) for (const j of d.jobs.map(jobView)) if (j.teamId && j.title.toLowerCase().includes(q)) familiar.set(j.teamId, (familiar.get(j.teamId) || 0) + 1);
  }
  const nowWall = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(now || '')) ? Date.parse(`${String(now).slice(0, 16)}:00Z`) : Date.now();
  const slots = [];
  for (const day of list) {
    const a = analyseDay(day);
    for (const t of a.teams) {
      for (const g of t.gaps) {
        if (g.endMs - g.startMs < need) continue;
        // Options: right after the previous job, and right before the next one.
        const options = [...new Set([g.startMs, g.endMs - need])];
        for (const s of options) {
          const hour = new Date(s).getUTCHours();
          if (part === 'morning' && hour >= 12) continue;
          if (part === 'afternoon' && hour < 12) continue;
          if (s < nowWall) continue;
          const touches = t.jobs.some((j) => Date.parse(`${j.end}Z`) === s || Date.parse(`${j.start}Z`) === s + need);
          const leftover = g.endMs - g.startMs - need;
          const reasons = [];
          let score = 100 - (Date.parse(`${day.iso}T00:00:00Z`) - start) / DAY * 2;
          if (touches) (score += 15), reasons.push({ text: 'Next to another job: no idle time', tone: 'good' });
          if (leftover < 30 * MIN) (score += 10), reasons.push({ text: 'Fills the gap exactly', tone: 'good' });
          if (t.utilisation != null && t.utilisation < 60) (score += 5), reasons.push({ text: `${t.name} is only ${t.utilisation}% booked that day`, tone: 'good' });
          const fam = familiar.get(t.id);
          if (fam) (score += 20 + Math.min(fam, 5) * 2), reasons.push({ text: `${t.name} cleaned this home ${fam}× in the last 4 weeks`, tone: 'good' });
          if (!t.jobs.length) reasons.push({ text: 'Team has no other jobs that day', tone: 'neutral' });
          slots.push({
            date: day.iso,
            start: wall(s),
            end: wall(s + need),
            teamId: t.id,
            team: t.name,
            color: t.color,
            members: t.members.filter((m) => !m.absent).map((m) => m.name),
            gap: { start: g.start, end: g.end, hours: g.hours },
            score: Math.round(score),
            reasons,
          });
        }
      }
    }
  }
  return { from, duration: need / HOUR, part, slots: slots.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start)).slice(0, 40) };
}
