import { api } from './api.js';
import { useLoad } from './hooks.js';

// A customer's jobs: the last 6 months and the next 3 (from MaidCentral's customer page).
export default function Customer({ id, go, onError }) {
  const name = new URLSearchParams(location.search).get('name');
  const { data, error, loading } = useLoad(() => api.customerJobs(id), id, onError);

  const now = Date.now();
  const jobs = (data?.jobs || []).map((j) => ({ ...j, startMs: Date.parse(j.start) })).sort((a, b) => b.startMs - a.startMs);
  const upcoming = jobs.filter((j) => j.startMs >= now).reverse();
  const past = jobs.filter((j) => j.startMs < now);

  return (
    <section>
      <div className="pagehead">
        <button className="link" onClick={() => history.back()}>‹ Back</button>
        <h2>{name || `Customer ${id}`}</h2>
        <span className="muted">MaidCentral customer #{id}</span>
      </div>
      {error && <p className="error">{error.message}</p>}
      {loading && <p className="muted">Loading from MaidCentral…</p>}
      {data && (
        <>
          <div className="stats">
            <div><b>{upcoming.length}</b> upcoming</div>
            <div><b>{past.length}</b> in the last 6 months</div>
            <div><b>{past.filter((j) => j.late).length}</b> marked late</div>
          </div>
          <JobList title="Upcoming" jobs={upcoming} />
          <JobList title="Past 6 months" jobs={past} />
          <p className="muted small">More of the customer page (contacts, billing, notes, scorecards) comes next; this preview shows what the portal returns as data.</p>
        </>
      )}
      <button className="link" onClick={() => go('/search')}>New search</button>
    </section>
  );
}

function JobList({ title, jobs }) {
  return (
    <div className="group">
      <h3>{title} <span className="muted">{jobs.length}</span></h3>
      {jobs.length === 0 && <p className="muted">None.</p>}
      {jobs.map((j) => (
        <div className="row" key={`${j.id}-${j.start}`} style={{ borderLeft: `4px solid ${j.color || '#9ca3af'}` }}>
          <b>{new Date(j.startMs).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</b>
          <span className="muted"> {new Date(j.startMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span> · {j.title}</span>
          {j.late && <span className="pill warn">late</span>}
          {j.outOfRotation && <span className="pill">out of rotation</span>}
        </div>
      ))}
    </div>
  );
}
