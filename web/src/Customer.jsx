import { useState } from 'react';
import { api } from './api.js';
import { useLoad } from './hooks.js';
import DataTable, { asObjects } from './DataTable.jsx';
import Icon from './Icon.jsx';
import { PageHeader, Stats, Tabs, Skeleton, ErrorNote, FreqPill, Card } from './ui.jsx';

const TABS = [
  ['overview', 'Overview'],
  ['jobs', 'Jobs'],
  ['notes', 'Notes'],
  ['scorecards', 'Scorecards'],
  ['quotes', 'Quotes'],
  ['payments', 'Payments'],
  ['more', 'More'],
];

// The full customer page: everything on MaidCentral's customer page, read-only.
export default function Customer({ id, onError, portal }) {
  const [tab, setTab] = useState('overview');
  const profile = useLoad(() => api.customer(id), id, onError);
  const jobs = useLoad(() => api.customerJobs(id), id, onError);
  const p = profile.data;
  const listName = new URLSearchParams(location.search).get('name');

  const counts = p && {
    notes: p.notes?.rows?.length,
    scorecards: p.scorecards?.rows?.length,
    quotes: p.quotes?.rows?.length,
    payments: p.payments?.rows?.length,
  };

  return (
    <>
      <PageHeader
        title={p?.name || listName || `Customer ${id}`}
        subtitle={`MaidCentral customer #${id}`}
        back={() => history.back()}
        actions={
          portal && (
            <a className="btn ghost" href={`https://${portal}/Customer/Details/${id}?cid=${id}`} target="_blank" rel="noreferrer">
              Open in MaidCentral <Icon name="external" size={14} />
            </a>
          )
        }
      >
        <div className="badges">{p?.overview?.badges?.map((b) => <span key={b} className="pill">{b}</span>)}</div>
      </PageHeader>
      <ErrorNote error={profile.error} />
      {profile.loading && <Skeleton rows={6} height={48} />}
      {p && (
        <>
          <Stats items={[...(Array.isArray(p.stats) ? p.stats : []), ...balances(p)].map((x) => ({ label: x.label, value: x.value || '–' }))} />
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={TABS.map(([t, label]) => [t, label, counts[t]])}
          />
          {tab === 'overview' && <Overview p={p} jobs={jobs} />}
          {tab === 'jobs' && <Jobs jobs={jobs} />}
          {tab === 'notes' && <Card className="flush"><DataTable table={p.notes} empty="No notes." /></Card>}
          {tab === 'scorecards' && <Card className="flush"><DataTable table={p.scorecards} empty="No scorecards yet." /></Card>}
          {tab === 'quotes' && <Card className="flush"><DataTable table={p.quotes} empty="No quotes." /></Card>}
          {tab === 'payments' && <Card className="flush"><DataTable table={p.payments} empty="No card charges." /></Card>}
          {tab === 'more' && <More p={p} />}
        </>
      )}
    </>
  );
}

function balances(p) {
  const out = [];
  for (const panel of p.overview?.panels || []) {
    for (const pair of panel.pairs) {
      const label = panel.title && !/customer overview/i.test(panel.title) ? `${pair.label} (${panel.title.replace(/customer summary/i, '').trim()})` : pair.label;
      out.push({ label, value: pair.value });
    }
  }
  return out;
}

function Overview({ p, jobs }) {
  const contacts = asObjects(p.contacts);
  const upcoming = (jobs.data?.jobs || []).map((j) => ({ ...j, ms: Date.parse(j.start) })).filter((j) => j.ms >= Date.now()).sort((a, b) => a.ms - b.ms).slice(0, 5);
  return (
    <div className="grid2">
      <Card title="Contact">
        {p.contacts?.error && <p className="error small">{p.contacts.error}</p>}
        {contacts.length === 0 && !p.contacts?.error && <p className="muted">No contact details.</p>}
        {contacts.map((c, i) => (
          <div key={i} className="kv">
            <span className="muted">{c['Contact Type']}</span>
            <span>{link(c['Contact Type'], c.Info)}</span>
            {c.Notes && <span className="muted small">{c.Notes}</span>}
          </div>
        ))}
        <h3 className="sub">Billing address</h3>
        {asObjects(p.billing).map((b, i) => (
          <p key={i}>
            {[b['First name'], b['Last name']].filter(Boolean).join(' ')}
            <br />
            {[b['Address 1'], b['Address 2']].filter(Boolean).join(', ')}
            <br />
            {[b.City, b.State, b.Zip].filter(Boolean).join(' ')}
          </p>
        ))}
        {!asObjects(p.billing).length && <p className="muted">None on file.</p>}
      </Card>
      <Card title="Homes & visits">
        <DataTable table={p.homes} empty="No homes." />
        <h3 className="sub">Next visits</h3>
        {jobs.loading && <p className="muted">Loading…</p>}
        {jobs.data && !upcoming.length && <p className="muted">Nothing scheduled in the next 3 months.</p>}
        {upcoming.map((j) => (
          <div key={`${j.id}-${j.start}`} className="kv" style={{ borderLeft: `4px solid ${j.color || '#9ca3af'}`, paddingLeft: 8 }}>
            <b>{new Date(j.ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</b>
            <span className="muted">{new Date(j.ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
            <span>{j.title}</span>
            <FreqPill frequency={j.frequency} />
          </div>
        ))}
        <h3 className="sub">Notifications</h3>
        {Array.isArray(p.notifications) && p.notifications.length === 0 && <p className="muted">None set up.</p>}
        {Array.isArray(p.notifications) &&
          p.notifications.map((g) => (
            <div key={g.title}>
              <span className="muted small">{g.title}</span>
              <ul className="plain">{g.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
            </div>
          ))}
      </Card>
    </div>
  );
}

function link(type, info) {
  if (!info) return '–';
  if (/mail/i.test(type) || info.includes('@')) return <a href={`mailto:${info}`}>{info}</a>;
  if (/phone|cell|mobile|text/i.test(type)) return <a href={`tel:${info.replace(/[^\d+]/g, '')}`}>{info}</a>;
  return info;
}

function Jobs({ jobs }) {
  if (jobs.loading) return <p className="muted">Loading…</p>;
  if (jobs.error) return <p className="error">{jobs.error.message}</p>;
  const now = Date.now();
  const all = (jobs.data?.jobs || []).map((j) => ({ ...j, ms: Date.parse(j.start) })).sort((a, b) => b.ms - a.ms);
  const upcoming = all.filter((j) => j.ms >= now).reverse();
  const past = all.filter((j) => j.ms < now);
  return (
    <>
      <Stats items={[{ label: 'Upcoming (3 months)', value: upcoming.length }, { label: 'Past 6 months', value: past.length }, { label: 'Marked late', value: past.filter((j) => j.late).length }]} />
      <JobList title="Upcoming" jobs={upcoming} />
      <JobList title="Past 6 months" jobs={past} />
    </>
  );
}

function JobList({ title, jobs }) {
  return (
    <div className="group">
      <h3>{title} <span className="muted">{jobs.length}</span></h3>
      {jobs.length === 0 && <p className="muted">None.</p>}
      {jobs.map((j) => (
        <div className="row" key={`${j.id}-${j.start}`} style={{ borderLeft: `4px solid ${j.color || '#9ca3af'}` }}>
          <b>{new Date(j.ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</b>
          <span className="muted"> {new Date(j.ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span> · {j.title}</span>
          <FreqPill frequency={j.frequency} />
          {j.late && <span className="pill warn">late</span>}
          {j.outOfRotation && <span className="pill">out of rotation</span>}
        </div>
      ))}
    </div>
  );
}

function More({ p }) {
  return (
    <>
      <Card title="Technician preferences" className="flush"><DataTable table={p.preferences} empty="No preferences." /></Card>
      <Card title="Agreements" className="flush"><DataTable table={p.agreements} empty="No agreements." /></Card>
      <Card title="Attachments" className="flush"><DataTable table={p.attachments} empty="No attachments." /></Card>
    </>
  );
}
