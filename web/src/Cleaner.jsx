import { useState } from 'react';
import { api } from './api.js';
import { useLoad } from './hooks.js';
import DataTable, { Pairs, asObjects } from './DataTable.jsx';

const TABS = [
  ['overview', 'Overview'],
  ['jobs', 'Jobs'],
  ['attendance', 'Attendance'],
  ['scorecards', 'Scorecards'],
  ['inspections', 'Inspections'],
  ['notes', 'Notes & history'],
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The full cleaner page (MaidCentral employee), read-only. Pay, tax and ID details are not shown.
export default function Cleaner({ id, onError, portal }) {
  const [tab, setTab] = useState('overview');
  const { data: p, error, loading } = useLoad(() => api.cleaner(id), id, onError);

  const jobs = asObjects(p?.jobs);
  const counts = p && { jobs: jobs.length, scorecards: p.scorecards?.rows?.length, inspections: p.inspections?.rows?.length, notes: Array.isArray(p.notes) ? p.notes.length : 0 };

  return (
    <section>
      <div className="pagehead">
        <button className="link" onClick={() => history.back()}>‹ Back</button>
        <h2>{p?.name || `Cleaner ${id}`}</h2>
        {p?.profile?.roles?.map((r) => <span key={r} className="pill">{r}</span>)}
        {portal && (
          <a className="link small right" href={`https://${portal}/Employee/Details/${id}`} target="_blank" rel="noreferrer">
            Open in MaidCentral ↗
          </a>
        )}
      </div>
      {error && <p className="error">{error.message}</p>}
      {loading && <p className="muted">Loading the cleaner from MaidCentral…</p>}
      {p && (
        <>
          {p.stats?.pairs && (
            <>
              <p className="muted small">Attendance, {p.stats.period}</p>
              <Pairs pairs={[...p.stats.pairs, ...productivity(jobs)]} />
            </>
          )}
          <div className="tabs">
            {TABS.map(([t, label]) => (
              <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
                {label}
                {counts[t] ? <span className="count">{counts[t]}</span> : null}
              </button>
            ))}
          </div>
          {tab === 'overview' && <Overview p={p} />}
          {tab === 'jobs' && <Jobs table={p.jobs} jobs={jobs} />}
          {tab === 'attendance' && <Attendance p={p} />}
          {tab === 'scorecards' && <DataTable table={p.scorecards} empty="No scorecards." />}
          {tab === 'inspections' && <DataTable table={p.inspections} empty="No inspections." />}
          {tab === 'notes' && <Notes p={p} />}
        </>
      )}
    </section>
  );
}

const num = (s) => {
  const n = parseFloat(String(s || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Allowed vs actual hours over the jobs MaidCentral returns (its job history).
function productivity(jobs) {
  let allowed = 0;
  let actual = 0;
  for (const j of jobs) {
    const a = num(j['Technician Allowed Hours']);
    const b = num(j['Actual Hours']);
    if (a != null && b) {
      allowed += a;
      actual += b;
    }
  }
  if (!actual) return [];
  return [
    { label: 'Jobs in history', value: String(jobs.length) },
    { label: 'Productivity (allowed ÷ actual)', value: `${Math.round((allowed / actual) * 100)}%` },
  ];
}

function Overview({ p }) {
  const f = p.profile?.fields || {};
  const contacts = asObjects(p.contacts);
  const week = (Array.isArray(p.defaultSchedule) ? p.defaultSchedule : []).map((s) => ({ ...s, ms: Date.parse(s.start), endMs: Date.parse(s.end) })).sort((a, b) => a.ms - b.ms);
  return (
    <div className="grid2">
      <div className="card">
        <h3>Profile</h3>
        {p.profile?.error && <p className="error small">{p.profile.error}</p>}
        {[...(p.profile?.summary || []), ...(p.profile?.defaults || [])].map((x, i) => (
          <div className="kv" key={i}><span className="muted">{x.label}</span><span>{x.value || '–'}</span></div>
        ))}
        {f['Termination Date'] && <div className="kv"><span className="muted">Termination date</span><span>{f['Termination Date']}</span></div>}
        <h3>Contact</h3>
        {contacts.map((c, i) => (
          <div className="kv" key={i}>
            <span className="muted">{c['Contact Type']}</span>
            <span>{/mail/i.test(c['Contact Type']) ? <a href={`mailto:${c.Info}`}>{c.Info}</a> : <a href={`tel:${String(c.Info).replace(/[^\d+]/g, '')}`}>{c.Info}</a>}</span>
          </div>
        ))}
        {(f['Address 1'] || f.City) && (
          <div className="kv"><span className="muted">Address</span><span>{[f['Address 1'], f['Address 2'], f.City, f.State, f.Zip].filter(Boolean).join(', ')}</span></div>
        )}
        {(f['Emergency Contact Name'] || f['Emergency Contact Phone']) && (
          <div className="kv"><span className="muted">Emergency contact</span><span>{[f['Emergency Contact Name'], f['Emergency Contact Phone']].filter(Boolean).join(' · ')}</span></div>
        )}
        {f['Internal Memo'] && <><h3>Internal memo</h3><p>{f['Internal Memo']}</p></>}
        {f['Bio for Scorecards'] && <><h3>Bio</h3><p>{f['Bio for Scorecards']}</p></>}
      </div>
      <div className="card">
        <h3>Default schedule</h3>
        {Array.isArray(p.defaultSchedule) && !week.length && <p className="muted">No default schedule.</p>}
        {p.defaultSchedule?.error && <p className="error small">{p.defaultSchedule.error}</p>}
        {week.map((s, i) => (
          <div className="kv" key={i}>
            <span className="muted">{DAYS[new Date(s.ms).getDay()]} {new Date(s.ms).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
            <span>{fmtTime(s.ms)}–{fmtTime(s.endMs)}</span>
          </div>
        ))}
        <h3>Recent clock events</h3>
        <DataTable table={p.clocks} empty="No clock events." limit={10} />
      </div>
    </div>
  );
}

const fmtTime = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '–');

function Jobs({ table, jobs }) {
  const [q, setQ] = useState('');
  const filtered = q ? { ...table, rows: table.rows.filter((r) => r.cells.join(' ').toLowerCase().includes(q.toLowerCase())) } : table;
  const low = jobs.filter((j) => {
    const v = num(j.Productivity);
    return v != null && v < 80;
  }).length;
  return (
    <>
      <div className="pagehead">
        <input placeholder="Filter jobs by customer, home, date…" value={q} onChange={(e) => setQ(e.target.value)} />
        {low > 0 && <span className="pill warn">{low} jobs under 80% productivity</span>}
      </div>
      <DataTable table={filtered} empty="No jobs in MaidCentral's history." />
    </>
  );
}

function Attendance({ p }) {
  if (p.attendance?.error) return <p className="error">{p.attendance.error}</p>;
  const items = (p.attendance || []).map((a) => ({ ...a, ms: Date.parse(a.start), endMs: Date.parse(a.end) })).sort((a, b) => b.ms - a.ms);
  const byStatus = items.reduce((m, a) => ((m[a.status] = (m[a.status] || 0) + 1), m), {});
  return (
    <>
      <p className="muted small">The last 60 days and the next 30, as MaidCentral's attendance calendar shows them.</p>
      <div className="pairs">
        {Object.entries(byStatus).map(([s, n]) => <div key={s}><span className="muted small">{s}</span><b>{n}</b></div>)}
      </div>
      {!items.length && <p className="muted">No attendance entries.</p>}
      <div className="tablewrap">
        <table className="data">
          <thead><tr><th>Date</th><th>Time</th><th>Status</th></tr></thead>
          <tbody>
            {items.map((a, i) => (
              <tr key={i}>
                <td>{new Date(a.ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                <td>{a.allDay ? 'All day' : `${fmtTime(a.ms)}–${fmtTime(a.endMs)}`}</td>
                <td><span className="pill" style={{ background: a.color || undefined, color: a.color ? '#fff' : undefined }}>{a.status}</span>{a.late && <span className="pill warn">late</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Notes({ p }) {
  return (
    <>
      <h3>Notes</h3>
      {p.notes?.error && <p className="error small">{p.notes.error}</p>}
      {Array.isArray(p.notes) && !p.notes.length && <p className="muted">No notes.</p>}
      {Array.isArray(p.notes) &&
        p.notes.map((n, i) => (
          <div className="row" key={i}>
            <span className="muted small">{n.created ? new Date(n.created).toLocaleDateString() : ''} · {n.by}</span>
            <span style={{ flexBasis: '100%' }}>{n.note}</span>
            {n.closeNote && <span className="muted small">Closed{n.closedBy ? ` by ${n.closedBy}` : ''}: {n.closeNote}</span>}
          </div>
        ))}
      <h3>Contact tickets</h3>
      <DataTable table={p.tickets} empty="No contact tickets." />
      <h3>Employment history</h3>
      <DataTable table={p.history} empty="No history." />
    </>
  );
}
