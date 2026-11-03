import { useMemo, useState } from 'react';
import { teamColor } from './teamColor.js';
import { plainFreq } from './ui.jsx';

// Drawing the optimiser's changes on the 4-week cycle: one team-day as a bar of visits, a
// before/after strip for one recommendation, and the whole cycle as a board.

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const clock = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(Math.round(m) % 60).padStart(2, '0')}${m < 720 ? 'a' : 'p'}`;
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${Math.round(m % 60)}m` : ''}` : `${Math.round(m)}m`);
const shortDate = (iso) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// The time axis: the working day, wider only if a visit falls outside it.
function axisFor(days) {
  const all = days.flatMap((d) => d.stops);
  const s = Math.min(8 * 60, ...all.map((x) => Math.floor(x.start / 60) * 60));
  const e = Math.max(17 * 60, ...all.map((x) => Math.ceil(x.end / 60) * 60));
  return { s, e, pct: (m) => ((Math.min(Math.max(m, s), e) - s) / (e - s)) * 100, hours: (e - s) / 60 };
}

// How each visit changes between two states: moved to another team-day, re-timed, or same.
function changesBetween(beforeDays, afterDays) {
  const was = new Map();
  for (const d of beforeDays) for (const st of d.stops) was.set(st.id, { key: d.key, start: st.start, team: d.team, date: d.date });
  const now = new Map();
  for (const d of afterDays) for (const st of d.stops) now.set(st.id, { key: d.key, start: st.start, team: d.team, date: d.date });
  const kind = new Map();
  for (const [id, b] of was) {
    const a = now.get(id);
    if (!a) continue;
    if (a.key !== b.key) kind.set(id, 'moved');
    else if (Math.abs(a.start - b.start) >= 10) kind.set(id, 'shifted');
  }
  return { kind, was, now };
}

export function DayBar({ day, color, fg, axis, mark = () => null, onPick, label }) {
  if (!day) return <div className="obar off"><span className="muted small">not working</span></div>;
  return (
    <div className="obar">
      <div className="cbar" style={{ '--hours': axis.hours }}>
        {day.stops.map((st) => {
          const m = mark(st);
          return (
            <div
              key={st.id}
              className={`cbar-job ${m ? `mark-${m.kind}` : 'quiet'}`}
              style={{ left: `${axis.pct(st.start)}%`, width: `${Math.max(axis.pct(st.end) - axis.pct(st.start), 1)}%`, background: color, color: fg }}
              title={`${clock(st.start)}–${clock(st.end)} ${st.home}${st.area ? ` · ${st.area}` : ''}${st.frequency ? ` · ${plainFreq(st.frequency)}` : ''}${m?.text ? `\n${m.text}` : ''}`}
              onClick={m && onPick ? () => onPick(st.id) : undefined}
            >
              <span>{st.home.replace(/ Home$/i, '')}</span>
            </div>
          );
        })}
      </div>
      <span className="obar-meta">{label ?? (day.stops.length ? `${day.stops.length} visits · drive ${dur(day.drive)}${day.back ? ` · back ${clock(day.back)}` : ''}` : 'no visits')}</span>
    </div>
  );
}

// One recommendation: the team-days it touches, week by week, before and after.
export function ChangeView({ rec, teams }) {
  if (!rec.views) return null;
  const { before, after } = rec.views;
  const axis = axisFor([...before, ...after]);
  const { kind, was, now } = changesBetween(before, after);
  const mine = new Set(rec.jobIds);
  const colorOf = (teamId) => teamColor(teams.find((t) => t.id === teamId) || {}).bg;
  const fgOf = (teamId) => teamColor(teams.find((t) => t.id === teamId) || {}).fg;
  // Rows: team + weekday; columns: weeks 1–4.
  const rows = new Map();
  for (const d of [...before, ...after]) {
    const k = `${d.teamId}|${d.weekday}`;
    if (!rows.has(k)) rows.set(k, { teamId: d.teamId, team: d.team, weekday: d.weekday, weeks: {} });
    rows.get(k).weeks[d.week] ||= { date: d.date };
  }
  const find = (list, teamId, date) => list.find((d) => d.teamId === teamId && d.date === date);
  const driveBefore = before.reduce((s, d) => s + d.drive, 0);
  const driveAfter = after.reduce((s, d) => s + d.drive, 0);
  const markBefore = (st) => (mine.has(st.id) ? (kind.get(st.id) === 'moved' ? { kind: 'leaving', text: `Moves to ${now.get(st.id)?.team} on ${shortDate(now.get(st.id)?.date)}` } : kind.get(st.id) === 'shifted' ? { kind: 'shifted', text: `Moves to ${clock(now.get(st.id).start)}` } : null) : null);
  const markAfter = (st) => (mine.has(st.id) && kind.get(st.id) ? { kind: kind.get(st.id), text: kind.get(st.id) === 'moved' ? `Was ${was.get(st.id).team} on ${shortDate(was.get(st.id).date)} at ${clock(was.get(st.id).start)}` : `Was ${clock(was.get(st.id).start)}` } : null);
  return (
    <div className="change-view">
      <div className="cv-legend">
        <span><i className="k-leaving" />leaves this day</span>
        <span><i className="k-moved" />arrives here</span>
        <span><i className="k-shifted" />new time</span>
        <span className="muted">Driving on these days: {dur(driveBefore)} → <b className={driveAfter < driveBefore ? 'ok-text' : ''}>{dur(driveAfter)}</b></span>
      </div>
      <div className="tablewrap">
        <table className="cv-table">
          <thead>
            <tr><th />{[1, 2, 3, 4].map((w) => <th key={w}>Week {w}</th>)}</tr>
          </thead>
          <tbody>
            {[...rows.values()].map((row) => (
              <tr key={`${row.teamId}${row.weekday}`}>
                <td className="cv-row"><span className="team-swatch" style={{ '--team': colorOf(row.teamId) }} /><b>{row.team}</b><span className="muted small">{row.weekday}s</span></td>
                {[1, 2, 3, 4].map((w) => {
                  const cell = row.weeks[w];
                  if (!cell) return <td key={w} className="cv-cell none"><span className="muted small">no change</span></td>;
                  const b = find(before, row.teamId, cell.date);
                  const a = find(after, row.teamId, cell.date);
                  return (
                    <td key={w} className="cv-cell">
                      <span className="muted small">{shortDate(cell.date)}</span>
                      <div className="cv-pair">
                        <span className="cv-tag">Before</span>
                        <DayBar day={b} color={colorOf(row.teamId)} fg={fgOf(row.teamId)} axis={axis} mark={markBefore} />
                        <span className="cv-tag">After</span>
                        <DayBar day={a} color={colorOf(row.teamId)} fg={fgOf(row.teamId)} axis={axis} mark={markAfter} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// The whole cycle with the chosen changes: weekdays, team rows, weeks 1–4.
export function CycleBoard({ baseline, after, teams, onPick }) {
  const [view, setView] = useState('after');
  const [onlyChanged, setOnlyChanged] = useState(true);
  const [movesOnly, setMovesOnly] = useState(false);
  const all = useMemo(() => changesBetween(baseline, after || baseline), [baseline, after]);
  const { was, now } = all;
  const kind = movesOnly ? new Map([...all.kind].filter(([, k]) => k === 'moved')) : all.kind;
  const axis = useMemo(() => axisFor([...baseline, ...(after || [])]), [baseline, after]);
  const days = view === 'after' ? after || baseline : baseline;
  const byKey = new Map(days.map((d) => [`${d.teamId}|${d.date}`, d]));
  const beforeByKey = new Map(baseline.map((d) => [`${d.teamId}|${d.date}`, d]));
  const afterByKey = new Map((after || baseline).map((d) => [`${d.teamId}|${d.date}`, d]));
  const dates = [...new Set(baseline.map((d) => d.date))].sort();
  const weekdayOf = new Map(baseline.map((d) => [d.date, d.weekday]));
  const weekOf = new Map(baseline.map((d) => [d.date, d.week]));
  const colorOf = (teamId) => teamColor(teams.find((t) => t.id === teamId) || {}).bg;
  const fgOf = (teamId) => teamColor(teams.find((t) => t.id === teamId) || {}).fg;
  const touched = (teamId, date) => {
    const b = beforeByKey.get(`${teamId}|${date}`);
    const a = afterByKey.get(`${teamId}|${date}`);
    return [...(b?.stops || []), ...(a?.stops || [])].some((st) => kind.has(st.id));
  };
  const mark = (st) => {
    const k = kind.get(st.id);
    if (!k) return null;
    if (view === 'before') return k === 'moved' ? { kind: 'leaving', text: `Moves to ${now.get(st.id).team} on ${shortDate(now.get(st.id).date)}` } : { kind: 'shifted', text: `Moves to ${clock(now.get(st.id).start)}` };
    return k === 'moved' ? { kind: 'moved', text: `Was ${was.get(st.id).team} on ${shortDate(was.get(st.id).date)} at ${clock(was.get(st.id).start)}` } : { kind: 'shifted', text: `Was ${clock(was.get(st.id).start)}` };
  };
  const changedCount = kind.size;
  return (
    <div className="cycle-board">
      <div className="cv-legend">
        <div className="segmented">
          <button className={view === 'before' ? 'on' : ''} onClick={() => setView('before')}>Before</button>
          <button className={view === 'after' ? 'on' : ''} onClick={() => setView('after')}>After the chosen changes</button>
        </div>
        <label className="check"><input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Only rows with changes</label>
        <label className="check"><input type="checkbox" checked={movesOnly} onChange={(e) => setMovesOnly(e.target.checked)} /> Moves only (hide time changes)</label>
        {view === 'before' ? <span><i className="k-leaving" />will move away</span> : <span><i className="k-moved" />moved in</span>}
        <span><i className="k-shifted" />new time</span>
        <span className="muted">{changedCount} visits {movesOnly ? 'move' : 'change'} · click one to see its change</span>
      </div>
      {WEEKDAYS.map((wd) => {
        const wdDates = dates.filter((d) => weekdayOf.get(d) === wd);
        if (!wdDates.length) return null;
        const teamIds = [...new Set(baseline.concat(after || []).filter((d) => d.weekday === wd).map((d) => d.teamId))].filter((t) => !onlyChanged || wdDates.some((d) => touched(t, d)));
        if (!teamIds.length) return null;
        return (
          <div key={wd} className="board-day">
            <h3>{wd}s</h3>
            <div className="tablewrap">
              <table className="cv-table">
                <thead><tr><th />{wdDates.map((d) => <th key={d}>Week {weekOf.get(d)}<span>{shortDate(d)}</span></th>)}</tr></thead>
                <tbody>
                  {teamIds.map((t) => {
                    const team = teams.find((x) => x.id === t);
                    return (
                      <tr key={t}>
                        <td className="cv-row"><span className="team-swatch" style={{ '--team': colorOf(t) }} /><b>{team?.name || `Team ${t}`}</b></td>
                        {wdDates.map((d) => {
                          const day = byKey.get(`${t}|${d}`);
                          const b = beforeByKey.get(`${t}|${d}`);
                          const a = afterByKey.get(`${t}|${d}`);
                          const changed = touched(t, d);
                          const diff = a && b ? a.drive - b.drive : 0;
                          return (
                            <td key={d} className={`cv-cell ${changed ? 'changed' : ''}`}>
                              <DayBar
                                day={day}
                                color={colorOf(t)}
                                fg={fgOf(t)}
                                axis={axis}
                                mark={mark}
                                onPick={onPick}
                                label={day && changed && Math.abs(diff) >= 1 ? `drive ${dur(b.drive)} → ${dur(a.drive)}` : undefined}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {onlyChanged && !changedCount && <p className="muted small">Tick changes in the list to see them here.</p>}
    </div>
  );
}
