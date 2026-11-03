import { useState } from 'react';
import { api, today, dayLabel } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';

const TABS = [
  ['attention', 'Needs attention'],
  ['capacity', 'Capacity'],
  ['continuity', 'Same team'],
  ['find', 'Find a slot'],
];

const KIND_LABEL = {
  unassigned: 'No team',
  no_staff: 'Nobody scheduled',
  over_capacity: 'Over capacity',
  outside_hours: "Outside team's hours",
  overlap: 'Overlapping jobs',
  absent: 'Absence',
};

// Times from the server are MaidCentral's local wall-clock strings ("2026-11-03T09:00:00").
const clock = (s) => (s ? new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '–');
const shortDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

// The scheduling planner: capacity, things to handle, continuity and free slots, from
// MaidCentral's live schedule. Read-only: it suggests; changes are made in MaidCentral.
export default function Planner({ onError }) {
  const [tab, setTab] = useState('attention');
  const [from] = useState(today());
  const overview = useLoad(() => api.plannerOverview(from, 14), `overview:${from}`, onError);
  const [day, setDay] = useState(null);
  const issues = overview.data?.issues || [];

  return (
    <section>
      <div className="pagehead">
        <h2>Scheduling planner</h2>
        <span className="muted">Next 14 days from MaidCentral. The planner suggests; changes are made in MaidCentral.</span>
      </div>
      <div className="tabs">
        {TABS.map(([t, label]) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {label}
            {t === 'attention' && issues.length ? <span className="count">{issues.length}</span> : null}
          </button>
        ))}
      </div>
      {overview.error && tab !== 'find' && <p className="error">{overview.error.message}</p>}
      {overview.loading && tab !== 'find' && tab !== 'continuity' && <p className="muted">Reading 14 days of schedules from MaidCentral… (first load takes a few seconds)</p>}
      {tab === 'attention' && overview.data && <Attention data={overview.data} openDay={(d) => (setDay(d), setTab('capacity'))} />}
      {tab === 'capacity' && overview.data && <Capacity data={overview.data} day={day} setDay={setDay} onError={onError} />}
      {tab === 'continuity' && <Continuity from={from} onError={onError} />}
      {tab === 'find' && <FindSlot from={from} onError={onError} />}
    </section>
  );
}

function Attention({ data, openDay }) {
  const [kind, setKind] = useState('all');
  const kinds = [...new Set(data.issues.map((i) => i.kind))];
  const shown = data.issues.filter((i) => kind === 'all' || i.kind === kind);
  const byDay = data.days.map((d) => ({ date: d, items: shown.filter((i) => i.date === d) })).filter((d) => d.items.length);
  return (
    <>
      <div className="chips">
        <button className={kind === 'all' ? 'chip on' : 'chip'} onClick={() => setKind('all')}>All {data.issues.length}</button>
        {kinds.map((k) => (
          <button key={k} className={kind === k ? 'chip on' : 'chip'} onClick={() => setKind(k)}>
            {KIND_LABEL[k] || k} {data.issues.filter((i) => i.kind === k).length}
          </button>
        ))}
      </div>
      {!data.issues.length && <p className="muted">Nothing to handle in the next 14 days. 🎉</p>}
      {byDay.map((d) => (
        <div key={d.date} className="group">
          <h3>
            {dayLabel(d.date)} <button className="link small" onClick={() => openDay(d.date)}>Open day ›</button>
          </h3>
          {d.items.map((i, n) => (
            <div key={n} className="row issue">
              <span className={`pill ${i.kind === 'absent' || i.kind === 'outside_hours' ? 'warn' : 'bad'}`}>{KIND_LABEL[i.kind] || i.kind}</span>
              <b>{i.title}</b>
              {i.jobs && <span className="muted small" style={{ flexBasis: '100%' }}>{i.jobs.map((j) => `${clock(j.start)} ${j.title}`).join(' · ')}</span>}
            </div>
          ))}
        </div>
      ))}
      {data.spare.length > 0 && (
        <>
          <h3>Cleaners scheduled but not on a team</h3>
          <p className="muted small">Possible spare capacity: MaidCentral has them working these days without a team.</p>
          {data.spare.map((d) => (
            <details key={d.date} className="row">
              <summary><b>{shortDay(d.date)}</b> <span className="muted">{d.people.length} people</span></summary>
              <span>{d.people.map((p) => `${p.name} (${clock(p.start)}–${clock(p.end)})`).join(', ')}</span>
            </details>
          ))}
        </>
      )}
    </>
  );
}

const heat = (u) => (u == null ? 'var(--bg)' : u > 100 ? '#fecaca' : u >= 85 ? '#fde68a' : u >= 60 ? '#d9f99d' : '#e0f2fe');

function Capacity({ data, day, setDay, onError }) {
  return (
    <>
      <p className="muted small">Booked hours ÷ the team's working window (first shift start to last shift end). Click a day for its timeline.</p>
      <div className="tablewrap">
        <table className="data capacity">
          <thead>
            <tr>
              <th>Team</th>
              {data.days.map((d) => (
                <th key={d} className={d === day ? 'sel' : ''}>
                  <button className="link" onClick={() => setDay(d)}>{shortDay(d)}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.teams.map((t) => (
              <tr key={t.id}>
                <td className="nowrap"><span className="dot" style={{ background: teamColor(t).bg }} />{t.name}</td>
                {t.cells.map((c) => (
                  <td key={c.date} className="cell" style={{ background: heat(c.utilisation) }} onClick={() => setDay(c.date)} title={`${c.jobs} jobs, ${c.booked} h booked of ${c.capacity} h`}>
                    {c.capacity ? <><b>{c.utilisation}%</b><span className="small">{c.booked}/{c.capacity}h</span></> : c.jobs ? <b>!</b> : <span className="muted">–</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td><b>All teams</b></td>
              {data.totals.map((x) => (
                <td key={x.date} className="cell"><b>{x.jobs}</b><span className="small">jobs · {x.booked}/{x.capacity}h</span></td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="legend small muted">
        <span><i style={{ background: '#e0f2fe' }} /> under 60%</span>
        <span><i style={{ background: '#d9f99d' }} /> 60–85%</span>
        <span><i style={{ background: '#fde68a' }} /> 85–100%</span>
        <span><i style={{ background: '#fecaca' }} /> over 100%</span>
      </div>
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
    <div className="card" style={{ marginTop: 16 }}>
      <h3>{dayLabel(date)}</h3>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error.message}</p>}
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
          {data.teams.filter((t) => t.jobs.length || t.window).map((t) => (
            <div key={t.id} className="tl-row">
              <div className="tl-label">
                <b>{t.name}</b>
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
                  <div key={j.id} className="tl-job" style={{ left: `${pos(j.start)}%`, width: `${Math.max(pos(j.end) - pos(j.start), 0.8)}%`, background: teamColor(t).bg, color: teamColor(t).fg }} title={`${clock(j.start)}–${clock(j.end)} ${j.title}`}>
                    {j.title.split(' - ')[0]}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {data.spare.length > 0 && (
            <details className="muted small">
              <summary>{data.spare.length} people working without a team</summary>
              {data.spare.map((p) => p.name).join(', ')}
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Continuity({ from, onError }) {
  const { data, error, loading } = useLoad(() => api.plannerContinuity(from), `cont:${from}`, onError);
  if (loading) return <p className="muted">Comparing the last 4 weeks with the next 2… (reads 6 weeks of schedules)</p>;
  if (error) return <p className="error">{error.message}</p>;
  return (
    <>
      <div className="pairs">
        <div><span className="muted small">Homes visited, last 4 weeks</span><b>{data.homes}</b></div>
        <div><span className="muted small">Visited 2+ times</span><b>{data.repeatHomes}</b></div>
        <div><span className="muted small">Always the same team</span><b>{data.sameTeamShare ?? '–'}%</b></div>
        <div><span className="muted small">Next 2 weeks with usual team</span><b>{data.upcomingShare ?? '–'}%</b><span className="muted small">{data.upcomingWithUsual} of {data.upcomingKnown}</span></div>
      </div>
      <h3>Upcoming visits with a different team than usual <span className="muted">{data.changes.length}</span></h3>
      {!data.changes.length && <p className="muted">Every repeat home keeps its usual team. 👍</p>}
      {data.changes.length > 0 && (
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>When</th><th>Home</th><th>Booked with</th><th>Usually</th></tr></thead>
            <tbody>
              {data.changes.map((c, i) => (
                <tr key={i}>
                  <td className="nowrap">{shortDay(c.date)} {clock(c.start)}</td>
                  <td>{c.title}</td>
                  <td>{c.team}</td>
                  <td>{c.usualTeam} <span className="muted small">({c.usualVisits} of {c.pastVisits} visits)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function FindSlot({ from, onError }) {
  const [form, setForm] = useState({ duration: '2', days: '14', part: 'any', home: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const search = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const d = new Date();
    const now = `${today()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    try {
      setResult(await api.plannerSlots({ from, ...form, now }));
    } catch (err) {
      onError(err);
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <form className="slotform card" onSubmit={search}>
        <label>Job length (hours)<input type="number" min="0.5" max="12" step="0.5" value={form.duration} onChange={set('duration')} /></label>
        <label>Look ahead<select value={form.days} onChange={set('days')}><option value="7">7 days</option><option value="14">14 days</option><option value="28">28 days</option></select></label>
        <label>Time of day<select value={form.part} onChange={set('part')}><option value="any">Any time</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option></select></label>
        <label>Home (optional)<input placeholder="Name or home, to prefer its usual team" value={form.home} onChange={set('home')} /></label>
        <button type="submit" disabled={busy}>{busy ? 'Searching…' : 'Find slots'}</button>
      </form>
      {error && <p className="error">{error.message}</p>}
      {result && !result.slots.length && <p className="muted">No team has a {result.duration} h gap in that period.</p>}
      {result?.slots.map((s, i) => (
        <div key={i} className="row slot">
          <b className="nowrap">{shortDay(s.date)} · {clock(s.start)}–{clock(s.end)}</b>
          <span><span className="dot" style={{ background: teamColor({ name: s.team, color: s.color }).bg }} />{s.team}</span>
          <span className="muted small">{s.members.join(', ')}</span>
          <span className="right muted small">gap {clock(s.gap.start)}–{clock(s.gap.end)}</span>
          <span style={{ flexBasis: '100%' }}>
            {s.reasons.map((r, n) => <span key={n} className={`pill ${r.tone === 'good' ? 'ok' : ''}`}>{r.text}</span>)}
          </span>
        </div>
      ))}
      {result && <p className="muted small">To book, create the job in MaidCentral. Slots use each team's working window and existing jobs; drive time isn't included yet.</p>}
    </>
  );
}
