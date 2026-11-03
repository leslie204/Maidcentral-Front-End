import { useState } from 'react';
import { api, dayLabel } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import Icon from './Icon.jsx';
import { PageHeader, Stats, Tabs, Skeleton, ErrorNote, Empty, FreqPill, Card } from './ui.jsx';

const KIND = {
  unassigned: { label: 'No team', tone: 'bad', icon: 'alert' },
  no_staff: { label: 'Nobody scheduled', tone: 'bad', icon: 'users' },
  over_capacity: { label: 'Over capacity', tone: 'bad', icon: 'clock' },
  outside_hours: { label: "Outside team's hours", tone: 'warn', icon: 'clock' },
  overlap: { label: 'Overlapping jobs', tone: 'warn', icon: 'calendar' },
  absent: { label: 'Absence', tone: 'warn', icon: 'user' },
};

// Times from the server are MaidCentral's local wall-clock strings ("2026-11-03T09:00:00").
const clock = (s) => (s ? new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '–');
const shortDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};
const dayOnly = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return { wd: dt.toLocaleDateString([], { weekday: 'short' }), d: dt.getDate(), weekend: dt.getDay() === 0 || dt.getDay() === 6 };
};

// The scheduling planner: capacity, things to handle, continuity and free slots, from
// MaidCentral's live schedule. Read-only: it suggests; changes are made in MaidCentral.
// The 4-week cycle starts on this week's Monday.
const cycleStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Planner({ onError, go }) {
  const [tab, setTab] = useState('attention');
  const [from] = useState(cycleStart());
  const overview = useLoad(() => api.plannerOverview(from, 28), `overview:${from}`, onError);
  const [day, setDay] = useState(null);
  const o = overview.data;
  const issues = o?.issues || [];
  const recurringHours = o ? o.frequencies.filter((f) => f.recurring).reduce((s, f) => s + f.hours, 0) : 0;
  const allHours = o ? o.frequencies.reduce((s, f) => s + f.hours, 0) : 0;
  const capacity = o ? o.totals.reduce((s, t) => s + t.capacity, 0) : 0;

  return (
    <>
      <PageHeader
        title="Scheduling planner"
        subtitle="The 4-week cycle from this Monday, live from MaidCentral. The planner suggests; you make changes in MaidCentral."
        actions={<button className="btn primary" onClick={() => go('/openings')}><Icon name="sparkle" size={15} /> Find openings</button>}
      />
      {o && (
        <Stats
          items={[
            { label: 'Jobs, 4-week cycle', value: o.totals.reduce((s, t) => s + t.jobs, 0) },
            { label: 'Booked', value: `${Math.round(allHours)} h`, hint: `of ${Math.round(capacity)} h team time (${capacity ? Math.round((allHours / capacity) * 100) : 0}%)` },
            { label: 'Recurring share', value: allHours ? `${Math.round((recurringHours / allHours) * 100)}%` : '–', hint: 'of booked hours' },
            { label: 'Needs attention', value: issues.length, tone: issues.length ? 'warn' : 'ok' },
          ]}
        />
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['attention', 'Needs attention', issues.length],
          ['capacity', 'Capacity'],
          ['frequency', 'Frequency'],
          ['continuity', 'Same team'],
        ]}
      />
      {['attention', 'capacity', 'frequency'].includes(tab) && <ErrorNote error={overview.error} />}
      {['attention', 'capacity', 'frequency'].includes(tab) && overview.loading && <Skeleton rows={8} height={36} />}
      {tab === 'attention' && o && <Attention data={o} openDay={(d) => (setDay(d), setTab('capacity'))} />}
      {tab === 'capacity' && o && <Capacity data={o} day={day} setDay={setDay} onError={onError} />}
      {tab === 'frequency' && o && <Frequencies data={o} />}
      {tab === 'continuity' && <Continuity from={from} onError={onError} />}

    </>
  );
}

function Attention({ data, openDay }) {
  const [kind, setKind] = useState('all');
  const kinds = [...new Set(data.issues.map((i) => i.kind))];
  const shown = data.issues.filter((i) => kind === 'all' || i.kind === kind);
  const byDay = data.days.map((d) => ({ date: d, items: shown.filter((i) => i.date === d) })).filter((d) => d.items.length);
  return (
    <>
      {data.issues.length > 0 && (
        <div className="chips">
          <button className={kind === 'all' ? 'chip on' : 'chip'} onClick={() => setKind('all')}>All <b>{data.issues.length}</b></button>
          {kinds.map((k) => (
            <button key={k} className={kind === k ? 'chip on' : 'chip'} onClick={() => setKind(k)}>
              {KIND[k]?.label || k} <b>{data.issues.filter((i) => i.kind === k).length}</b>
            </button>
          ))}
        </div>
      )}
      {!data.issues.length && (
        <Empty icon="check" title="Nothing to handle in this 4-week cycle">
          Every job has a team, every team has people scheduled, and nobody is over capacity.
        </Empty>
      )}
      {byDay.map((d) => (
        <Card key={d.date} title={dayLabel(d.date)} actions={<button className="btn ghost sm" onClick={() => openDay(d.date)}>Open day <Icon name="chevronRight" size={14} /></button>}>
          {d.items.map((i, n) => (
            <div key={n} className="issue">
              <span className={`issue-icon ${KIND[i.kind]?.tone || ''}`}><Icon name={KIND[i.kind]?.icon || 'alert'} size={16} /></span>
              <div>
                <div className="issue-title">{i.title}</div>
                {i.jobs && (
                  <div className="issue-jobs">
                    {i.jobs.map((j) => (
                      <span key={j.id}>{clock(j.start)} {j.title} <FreqPill frequency={j.frequency} compact /></span>
                    ))}
                  </div>
                )}
              </div>
              <span className={`pill ${KIND[i.kind]?.tone || ''}`}>{KIND[i.kind]?.label || i.kind}</span>
            </div>
          ))}
        </Card>
      ))}
      {data.spare.length > 0 && (
        <Card title="Working without a team" actions={<span className="muted small">Possible spare capacity</span>}>
          {data.spare.map((d) => (
            <details key={d.date} className="disclosure">
              <summary><b>{shortDay(d.date)}</b> <span className="muted">{d.people.length} people</span></summary>
              <p>{d.people.map((p) => `${p.name} (${clock(p.start)}–${clock(p.end)})`).join(', ')}</p>
            </details>
          ))}
        </Card>
      )}
    </>
  );
}

const heat = (u) => (u == null ? 'transparent' : u > 100 ? 'var(--heat-4)' : u >= 85 ? 'var(--heat-3)' : u >= 60 ? 'var(--heat-2)' : 'var(--heat-1)');

function Capacity({ data, day, setDay, onError }) {
  return (
    <>
      <Card
        title="Team capacity"
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
          Booked hours ÷ each team's working window (first shift start to last shift end). The thin bar shows <span className="key rec" /> recurring and <span className="key one" /> one-off hours. Click a day for its timeline.
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

// Booking frequency over the next 14 days: how much of the work is recurring.
function Frequencies({ data }) {
  const total = data.frequencies.reduce((s, f) => s + f.hours, 0);
  const keys = data.frequencies.map((f) => f.name);
  const colors = Object.fromEntries(data.frequencies.map((f) => [f.name, f.color || '#d1d5db']));
  const maxDay = Math.max(...data.totals.map((t) => t.booked), 1);
  return (
    <>
      <div className="freq-cards">
        {data.frequencies.map((f) => (
          <div key={f.name} className="freq-card" style={{ '--freq': f.color || '#d1d5db' }}>
            <span className="freq-name"><i />{f.name}</span>
            <b>{f.jobs}</b>
            <span className="muted small">jobs · {Math.round(f.hours)} h · {total ? Math.round((f.hours / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
      <Card title="Hours per day by frequency">
        <div className="freq-chart">
          {data.totals.map((t) => {
            const x = dayOnly(t.date);
            return (
              <div key={t.date} className={`fc-col ${x.weekend ? 'weekend' : ''}`} title={`${shortDay(t.date)}\n${keys.filter((k) => t.mix[k]).map((k) => `${k}: ${t.mix[k]} h`).join('\n')}`}>
                <div className="fc-bar" style={{ height: `${(t.booked / maxDay) * 100}%` }}>
                  {keys.filter((k) => t.mix[k]).map((k) => <i key={k} style={{ flex: t.mix[k], background: colors[k] }} />)}
                </div>
                <span className="fc-label">{x.wd}<br />{x.d}</span>
              </div>
            );
          })}
        </div>
        <div className="mix-legend">
          {data.frequencies.map((f) => <span key={f.name}><i style={{ background: f.color || '#d1d5db' }} />{f.name}</span>)}
        </div>
      </Card>
      <Card title="Frequency mix by team" className="flush">
        <table className="data">
          <thead>
            <tr><th>Team</th><th>Jobs</th><th>Hours</th><th style={{ width: '45%' }}>Mix</th></tr>
          </thead>
          <tbody>
            {data.teams.map((t) => {
              const mix = {};
              for (const c of t.cells) for (const [k, v] of Object.entries(c.mix)) mix[k] = (mix[k] || 0) + v;
              const hours = Object.values(mix).reduce((s, v) => s + v, 0);
              return (
                <tr key={t.id}>
                  <td className="nowrap"><span className="team-swatch" style={{ '--team': teamColor(t).bg }} />{t.name}</td>
                  <td>{t.cells.reduce((s, c) => s + c.jobs, 0)}</td>
                  <td>{Math.round(hours)}</td>
                  <td>
                    <div className="mix-bar slim">
                      {keys.filter((k) => mix[k]).map((k) => <span key={k} style={{ flex: mix[k], background: colors[k] }} title={`${k}: ${Math.round(mix[k])} h`} />)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Continuity({ from, onError }) {
  const { data, error, loading } = useLoad(() => api.plannerContinuity(from), `cont:${from}`, onError);
  if (loading) return <Skeleton rows={6} height={36} />;
  if (error) return <ErrorNote error={error} />;
  return (
    <>
      <Stats
        items={[
          { label: 'Homes visited, last 4 weeks', value: data.homes },
          { label: 'Visited 2+ times', value: data.repeatHomes },
          { label: 'Always the same team', value: data.sameTeamShare != null ? `${data.sameTeamShare}%` : '–' },
          { label: 'Next 2 weeks with usual team', value: data.upcomingShare != null ? `${data.upcomingShare}%` : '–', hint: `${data.upcomingWithUsual} of ${data.upcomingKnown} recurring visits`, tone: data.upcomingShare >= 90 ? 'ok' : 'warn' },
        ]}
      />
      {data.byFrequency?.length > 0 && (
        <div className="chips static">
          {data.byFrequency.map((f) => <span key={f.name} className="chip">{f.name}: <b>{f.share}%</b> with usual team ({f.usual}/{f.known})</span>)}
        </div>
      )}
      <Card title={`Recurring visits with a different team than usual (${data.changes.length})`} className="flush">
        {!data.changes.length ? (
          <Empty icon="check" title="Every recurring home keeps its usual team" />
        ) : (
          <table className="data">
            <thead><tr><th>When</th><th>Home</th><th>Frequency</th><th>Booked with</th><th>Usually</th></tr></thead>
            <tbody>
              {data.changes.map((c, i) => (
                <tr key={i}>
                  <td className="nowrap">{shortDay(c.date)} · {clock(c.start)}</td>
                  <td>{c.title}</td>
                  <td><FreqPill frequency={c.frequency} /></td>
                  <td>{c.team}</td>
                  <td>{c.usualTeam} <span className="muted small">({c.usualVisits} of {c.pastVisits} visits)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
