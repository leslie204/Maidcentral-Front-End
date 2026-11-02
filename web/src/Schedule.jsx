import { useState } from 'react';
import { api, today, time } from './api.js';
import { useLoad } from './hooks.js';
import DayPicker from './DayPicker.jsx';

// The day's jobs, one column per team (MaidCentral's Job Schedule as data).
export default function Schedule({ onError }) {
  const [date, setDate] = useState(today());
  const { data, error, loading } = useLoad(() => api.schedule(date), date, onError);

  const teams = data ? groupByTeam(data.teams, data.jobs) : [];
  const totalJobs = data?.jobs.length ?? 0;
  const hours = data ? data.jobs.reduce((s, j) => s + (j.allowedHours || 0), 0) : 0;

  return (
    <section>
      <div className="pagehead">
        <h2>Schedule</h2>
        <DayPicker date={date} setDate={setDate} />
      </div>
      {error && <p className="error">{error.message}</p>}
      {loading && <p className="muted">Loading from MaidCentral…</p>}
      {data && (
        <>
          <div className="stats">
            <div><b>{totalJobs}</b> jobs</div>
            <div><b>{teams.filter((t) => t.jobs.length).length}</b> teams working</div>
            <div><b>{hours.toFixed(1)}</b> allowed hours</div>
          </div>
          {totalJobs === 0 && <p className="muted">No jobs scheduled.</p>}
          <div className="teams">
            {teams.filter((t) => t.jobs.length).map((t) => (
              <div className="team" key={t.id}>
                <div className="teamhead" style={{ background: t.color || '#e5e7eb', color: t.textColor || '#111' }}>
                  {t.name} <span>{t.jobs.length} jobs · {t.jobs.reduce((s, j) => s + (j.allowedHours || 0), 0).toFixed(1)} h</span>
                </div>
                {t.jobs.map((j) => (
                  <div className="job" key={`${j.id}-${j.start}`} style={{ borderLeftColor: j.color || '#9ca3af' }}>
                    <div className="when">{time(j.start)}–{time(j.end)}</div>
                    <div className="what">{j.title}</div>
                    {j.tags && <div className="tags">{j.tags}</div>}
                    {j.instructions && <div className="note">{j.instructions}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function groupByTeam(teams, jobs) {
  const byId = new Map(teams.map((t) => [t.id, { ...t, jobs: [] }]));
  for (const j of jobs) {
    if (!byId.has(j.teamId)) byId.set(j.teamId, { id: j.teamId, name: `Team ${j.teamId}`, jobs: [] });
    byId.get(j.teamId).jobs.push(j);
  }
  for (const t of byId.values()) t.jobs.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  return [...byId.values()];
}
