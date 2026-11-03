import { useState } from 'react';
import { api, dayLabel } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import { Skeleton, ErrorNote, Card, Help } from './ui.jsx';

// Capacity: how full each team's day is over the 4-week cycle, and the day's timeline when
// a day is clicked. Read-only, live from MaidCentral.
// Times from the server are MaidCentral's local wall-clock strings ("2026-11-03T09:00:00").
const clock = (s) => (s ? new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '–');
const dayOnly = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return { wd: dt.toLocaleDateString([], { weekday: 'short' }), d: dt.getDate(), weekend: dt.getDay() === 0 || dt.getDay() === 6 };
};

const heat = (u) => (u == null ? 'transparent' : u > 100 ? 'var(--heat-4)' : u >= 85 ? 'var(--heat-3)' : u >= 60 ? 'var(--heat-2)' : 'var(--heat-1)');

export default function CapacityTab({ from, onError }) {
  const overview = useLoad(() => api.plannerOverview(from, 28), `overview:${from}`, onError);
  const [day, setDay] = useState(null);
  return (
    <>
      <ErrorNote error={overview.error} />
      {overview.loading && <Skeleton rows={8} height={36} />}
      {overview.data && <Capacity data={overview.data} day={day} setDay={setDay} onError={onError} />}
    </>
  );
}

function Capacity({ data, day, setDay, onError }) {
  return (
    <>
      <Card
        title={<>Team capacity <Help wide>Each cell is how full a team's day is: booked cleaning hours ÷ the hours they can work (leaving the office, or their shift start if later, until they must be back). Green is healthy, yellow is nearly full, red is overbooked. The thin bar under each number splits repeat (teal) and one-time (orange) work. Click a day to see its timeline.</Help></>}
        actions={
          <div className="legend">
            <span><i style={{ background: 'var(--heat-1)' }} />under 60%</span>
            <span><i style={{ background: 'var(--heat-2)' }} />60–85%</span>
            <span><i style={{ background: 'var(--heat-3)' }} />85–100%</span>
            <span><i style={{ background: 'var(--heat-4)' }} />over 100%</span>
          </div>
        }
        className="flush"
      >
        <div className="tablewrap plain">
          <table className="capacity">
            <thead>
              <tr className="weeks-row">
                <th className="sticky" />
                {Array.from({ length: Math.ceil(data.days.length / 7) }, (_, w) => (
                  <th key={w} colSpan={Math.min(7, data.days.length - w * 7)} className="week-head">Week {w + 1}</th>
                ))}
              </tr>
              <tr>
                <th className="sticky">Team</th>
                {data.days.map((d) => {
                  const x = dayOnly(d);
                  return (
                    <th key={d} className={`${d === day ? 'sel' : ''} ${x.weekend ? 'weekend' : ''}`}>
                      <button onClick={() => setDay(d)}><span>{x.wd}</span><b>{x.d}</b></button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <tr key={t.id}>
                  <td className="sticky nowrap"><span className="team-swatch" style={{ '--team': teamColor(t).bg }} />{t.name}</td>
                  {t.cells.map((c) => (
                    <td key={c.date} className={`cell ${c.date === day ? 'sel' : ''}`} onClick={() => setDay(c.date)} title={`${c.jobs} jobs · ${c.booked} h booked of ${c.capacity} h${Object.keys(c.mix).length ? `\n${Object.entries(c.mix).map(([k, v]) => `${k}: ${v} h`).join('\n')}` : ''}`}>
                      {c.capacity ? (
                        <div className="cell-in" style={{ background: heat(c.utilisation) }}>
                          <b>{c.utilisation}%</b>
                          <span>{c.booked}/{c.capacity}h</span>
                          <div className="cell-mix">
                            <i style={{ flex: c.recurring || 0, background: 'var(--recurring)' }} />
                            <i style={{ flex: Math.max(c.booked - c.recurring, 0), background: 'var(--oneoff)' }} />
                          </div>
                        </div>
                      ) : c.jobs ? <b className="bad-text">!</b> : <span className="muted">·</span>}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="totals">
                <td className="sticky"><b>All teams</b></td>
                {data.totals.map((x) => (
                  <td key={x.date} className="cell">
                    <b>{x.jobs}</b>
                    <span>{x.booked ? `${Math.round((x.recurring / x.booked) * 100)}% rec.` : '–'}</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card-foot muted small">
          Booked hours ÷ each team's working day (leave the office at 8:15 AM, back by 4:45 PM, within their shifts). The thin bar shows <span className="key rec" /> recurring and <span className="key one" /> one-off hours. Click a day for its timeline.
        </div>
      </Card>
      {day && <DayTimeline date={day} onError={onError} />}
    </>
  );
}

const START_H = 6;
const END_H = 20;
const pos = (s) => {
  const d = new Date(s);
  const h = d.getHours() + d.getMinutes() / 60;
  return Math.min(Math.max(((h - START_H) / (END_H - START_H)) * 100, 0), 100);
};

function DayTimeline({ date, onError }) {
  const { data, error, loading } = useLoad(() => api.plannerDay(date), `day:${date}`, onError);
  const hoursAxis = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);
  return (
    <Card title={dayLabel(date)} actions={<span className="muted small">Bars are jobs (stripe = frequency); hatched = free time</span>}>
      {loading && <Skeleton rows={6} height={30} />}
      <ErrorNote error={error} />
      {data && (
        <div className="timeline">
          <div className="tl-row tl-axis">
            <div className="tl-label" />
            <div className="tl-track">
              {hoursAxis.map((h) => (
                <span key={h} style={{ left: `${((h - START_H) / (END_H - START_H)) * 100}%` }}>{((h + 11) % 12) + 1}{h < 12 ? 'a' : 'p'}</span>
              ))}
            </div>
          </div>
          {data.teams.filter((t) => t.jobs.length || t.window).map((t) => {
            const c = teamColor(t);
            return (
              <div key={t.id} className="tl-row">
                <div className="tl-label">
                  <b><span className="team-swatch" style={{ '--team': c.bg }} />{t.name}</b>
                  <span className="muted small">{t.members.filter((m) => !m.absent).map((m) => m.name.split(' ')[0]).join(', ') || 'nobody scheduled'}</span>
                </div>
                <div className="tl-track">
                  {t.window && <div className="tl-window" style={{ left: `${pos(t.window.start)}%`, width: `${pos(t.window.end) - pos(t.window.start)}%` }} />}
                  {t.gaps.map((g, i) => (
                    <div key={`g${i}`} className="tl-gap" style={{ left: `${pos(g.start)}%`, width: `${pos(g.end) - pos(g.start)}%` }} title={`Free ${clock(g.start)}–${clock(g.end)} (${g.hours} h)`}>
                      {g.hours >= 1 ? `${g.hours}h free` : ''}
                    </div>
                  ))}
                  {t.jobs.map((j) => (
                    <div
                      key={j.id}
                      className="tl-job"
                      style={{ left: `${pos(j.start)}%`, width: `${Math.max(pos(j.end) - pos(j.start), 0.8)}%`, '--team': c.bg, '--team-fg': c.fg, '--freq': j.frequency?.color || 'transparent' }}
                      title={`${clock(j.start)}–${clock(j.end)} ${j.title}${j.frequency ? ` · ${j.frequency.name}` : ''}`}
                    >
                      <span className="tl-freq">{j.frequency ? { Weekly: '1w', 'Every 2 weeks': '2w', 'Every 3 weeks': '3w', 'Every 4 weeks': '4w', 'One-time': '1×', 'On demand': 'OD' }[j.frequency.short] || '↻' : ''}</span>
                      {j.title.split(' - ')[0]}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {data.spare.length > 0 && (
            <details className="disclosure muted small">
              <summary>{data.spare.length} people working without a team</summary>
              <p>{data.spare.map((p) => p.name).join(', ')}</p>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}

