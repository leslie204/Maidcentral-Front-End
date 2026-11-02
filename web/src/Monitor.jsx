import { useState } from 'react';
import { api, today, time } from './api.js';
import { useLoad } from './hooks.js';
import DayPicker from './DayPicker.jsx';
import { groupByTeam } from './Schedule.jsx';

// Scheduled vs clocked times per team, refreshed every minute (MaidCentral's Team Monitor).
export default function Monitor({ onError }) {
  const [date, setDate] = useState(today());
  const { data, error, loading } = useLoad(() => api.monitor(date), date, onError, date === today() ? 60_000 : 0);

  const teams = data ? groupByTeam(data.teams, data.items).filter((t) => t.jobs.length) : [];
  const now = Date.now();

  return (
    <section>
      <div className="pagehead">
        <h2>Team Monitor</h2>
        <DayPicker date={date} setDate={setDate} />
        {date === today() && <span className="pill live">Live · refreshes every minute</span>}
      </div>
      {error && <p className="error">{error.message}</p>}
      {loading && <p className="muted">Loading from MaidCentral…</p>}
      {data && teams.length === 0 && <p className="muted">Nothing scheduled.</p>}
      <div className="monitor">
        {teams.map((t) => {
          const scheduled = t.jobs.filter((j) => !j.actual);
          const clocked = t.jobs.filter((j) => j.actual);
          return (
            <div className="mteam" key={t.id}>
              <div className="teamhead" style={{ background: t.color || '#e5e7eb', color: t.textColor || '#111' }}>
                {t.name} <span>{scheduled.length} scheduled · {clocked.length} clocked</span>
              </div>
              <table>
                <thead>
                  <tr><th>Scheduled</th><th>Job</th><th>Clocked</th><th></th></tr>
                </thead>
                <tbody>
                  {scheduled.map((j) => {
                    const c = clocked.find((x) => x.id === j.id);
                    const status = statusOf(j, c, now, date === today());
                    return (
                      <tr key={`${j.id}-${j.start}`}>
                        <td className="nowrap">{time(j.start)}–{time(j.end)}</td>
                        <td>{j.title}</td>
                        <td className="nowrap">{c ? `${time(c.start)}–${c.end && c.end !== c.start ? time(c.end) : '…'}` : '–'}</td>
                        <td><span className={`pill ${status.cls}`}>{status.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function statusOf(j, c, now, isToday) {
  if (c) {
    const late = c.start - j.start > 10 * 60 * 1000;
    if (c.end && c.end > c.start) return { label: late ? 'Done (started late)' : 'Done', cls: late ? 'warn' : 'ok' };
    return { label: late ? 'On site (late)' : 'On site', cls: late ? 'warn' : 'info' };
  }
  if (isToday && now > j.start + 10 * 60 * 1000) return { label: 'Not clocked in', cls: 'bad' };
  return { label: 'Upcoming', cls: '' };
}
