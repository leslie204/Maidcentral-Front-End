// MaidCentral's Master Schedule: the recurring pattern behind the schedule. For every
// team and weekday, the four weeks of the cycle (Week 1–4, each tied to a date) and the
// recurring customers in them: start time, length, frequency (E1 weekly, E2 every 2 weeks,
// E4 every 4 weeks) and which weeks. Skips, moves and one-off bookings don't change it, so
// it's what recurring availability should be read from. Also MaidCentral's own count of
// conflicts per team, weekday and week. Read-only (a page GET).
import { McError } from './mc.js';

const decode = (s) =>
  String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
// "start-1030" -> 630 minutes
const gridMin = (v) => {
  const n = Number(v);
  return Math.floor(n / 100) * 60 + (n % 100);
};

export function parseMaster(html) {
  const parts = String(html).split('<div class="scheduleContainer">').slice(1);
  if (!parts.length) throw new McError('upstream', "MaidCentral's Master Schedule didn't return the expected layout");
  return parts.map((p) => {
    const head = /stage-head start-\d+ end-\d+ l-start-\d+ l-end-\d+"\s*style="([^"]*)"\s*>\s*([^|<]+?)\s*\|[\s\S]*?data-dayofweek="(\d)"\s+data-teamid="(\d+)"/.exec(p);
    if (!head) return null;
    const style = head[1];
    const weeks = [...p.matchAll(/stage-head start-\d+ end-\d+">\s*Week (\d) - (\d{1,2})\/(\d{1,2})\s*</g)].map((m) => ({ week: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }));
    // Columns 2..5 hold the weeks in the order of their headers.
    const colWeek = (col) => weeks[col - 2]?.week;
    const events = [...p.matchAll(/data-id="(\d+)"\s+class="pop event start-(\d+) end-(\d+) l-start-(\d) l-end-(\d)"[^>]*>([\s\S]*?)<br\s*\/?>\s*<br\s*\/?>\s*([A-Z]+)(\d*)\s+([\d.]+)\s*hrs/g)].map((m) => {
      const cols = [];
      for (let c = Number(m[4]); c < Number(m[5]); c++) cols.push(c);
      return {
        jobId: Number(m[1]),
        customer: decode(m[6]),
        gridStart: gridMin(m[2]),
        gridEnd: gridMin(m[3]),
        weeks: cols.map(colWeek).filter(Boolean).sort(),
        code: `${m[7]}${m[8]}`,
        every: Number(m[8]) || null,
        hours: Number(m[9]),
      };
    });
    const conflicts = {};
    for (const m of p.matchAll(/data-teamid="\d+"\s+data-week="(\d)">(\d+)</g)) conflicts[Number(m[1])] = Number(m[2]);
    return {
      weekday: Number(head[3]),
      teamId: Number(head[4]),
      team: decode(head[2]),
      color: /background-color:\s*([^;"]+)/.exec(style)?.[1]?.trim() || null,
      textColor: /(?:^|;)\s*color:\s*([^;"]+)/.exec(style)?.[1]?.trim() || null,
      weeks,
      events,
      conflicts,
    };
  }).filter(Boolean);
}

// The cycle week (1–4) a date falls in, for a weekday's week dates (any year: the dates
// repeat every 28 days, so only the day count between them matters).
export function weekOfDate(isoDate, weeks) {
  const d = Date.parse(`${isoDate}T00:00:00Z`);
  const y = new Date(d).getUTCFullYear();
  for (const w of weeks) {
    for (const yy of [y - 1, y, y + 1]) {
      const wd = Date.UTC(yy, w.month - 1, w.day);
      const diff = Math.round((d - wd) / 86_400_000);
      if (((diff % 28) + 28) % 28 === 0) return w.week;
    }
  }
  return null;
}
