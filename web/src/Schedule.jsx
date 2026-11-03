import { useState } from 'react';
import { api, today, time } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import DayPicker from './DayPicker.jsx';
import { PageHeader, Stats, Skeleton, ErrorNote, Empty, FreqPill } from './ui.jsx';

// The day's jobs, one column per team (MaidCentral's Job Schedule as data).
export default function Schedule({ onError }) {
  const [date, setDate] = useState(today());
  const { data, error, loading } = useLoad(() => api.schedule(date), date, onError);

  const teams = data ? groupByTeam(data.teams, data.jobs).filter((t) => t.jobs.length) : [];
  const jobs = data?.jobs || [];
  const hours = jobs.reduce((s, j) => s + (j.allowedHours || 0), 0);
  const recurring = jobs.filter((j) => j.frequency?.recurring).length;

  return (
    <>
      <PageHeader title="Schedule" subtitle="Jobs by team, live from MaidCentral" actions={<DayPicker date={date} setDate={setDate} />} />
      <ErrorNote error={error} />
      {loading && <Skeleton rows={6} height={64} />}
      {data && (
        <>
          <Stats
            items={[
              { label: 'Jobs', value: jobs.length },
              { label: 'Teams working', value: teams.length },
              { label: 'Allowed hours', value: hours.toFixed(1) },
              { label: 'Recurring', value: jobs.length ? `${Math.round((recurring / jobs.length) * 100)}%` : '–', hint: `${recurring} recurring · ${jobs.length - recurring} one-off or unknown` },
            ]}
          />
          <FrequencyMix jobs={jobs} />
          {!jobs.length && <Empty icon="calendar" title="No jobs scheduled">Pick another day.</Empty>}
          <div className="team-grid">
            {teams.map((t) => {
              const c = teamColor(t);
              return (
                <section className="team-card" key={t.id}>
                  <header style={{ '--team': c.bg }}>
                    <span className="team-swatch" />
                    <b>{t.name}</b>
                    <span className="muted small">{t.jobs.length} jobs · {t.jobs.reduce((s, j) => s + (j.allowedHours || 0), 0).toFixed(1)} h</span>
                  </header>
                  {t.jobs.map((j) => (
                    <div className="job" key={`${j.id}-${j.start}`} style={{ '--freq': j.frequency?.color || '#d1d5db' }}>
                      <div className="job-time">{time(j.start)} – {time(j.end)}</div>
                      <div className="job-title">{j.title}</div>
                      <div className="job-meta">
                        <FreqPill frequency={j.frequency} />
                        {j.tags && <span className="muted small">{j.tags}</span>}
                      </div>
                      {j.instructions && <div className="job-note">{j.instructions}</div>}
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// A bar of the day's jobs split by booking frequency.
export function FrequencyMix({ jobs }) {
  const groups = {};
  for (const j of jobs) {
    const k = j.frequency?.short || 'Unknown';
    groups[k] ||= { name: k, color: j.frequency?.color || '#d1d5db', n: 0 };
    groups[k].n += 1;
  }
  const list = Object.values(groups).sort((a, b) => b.n - a.n);
  if (!jobs.length) return null;
  return (
    <div className="mix">
      <div className="mix-bar">
        {list.map((g) => <span key={g.name} style={{ flex: g.n, background: g.color }} title={`${g.name}: ${g.n}`} />)}
      </div>
      <div className="mix-legend">
        {list.map((g) => (
          <span key={g.name}><i style={{ background: g.color }} />{g.name} <b>{g.n}</b></span>
        ))}
      </div>
    </div>
  );
}

export function groupByTeam(teams, jobs) {
  const byId = new Map(teams.map((t) => [t.id, { ...t, jobs: [] }]));
  for (const j of jobs) {
    if (!byId.has(j.teamId)) byId.set(j.teamId, { id: j.teamId, name: `Team ${j.teamId}`, jobs: [] });
    byId.get(j.teamId).jobs.push(j);
  }
  for (const t of byId.values()) t.jobs.sort((a, b) => (Date.parse(a.start) || 0) - (Date.parse(b.start) || 0));
  return [...byId.values()];
}
