import { useState } from 'react';
import { api, today, time } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import DayPicker from './DayPicker.jsx';
import { groupByTeam } from './Schedule.jsx';
import { PageHeader, Stats, Skeleton, ErrorNote, Empty, FreqPill } from './ui.jsx';

// Scheduled vs clocked times per team, refreshed every minute (MaidCentral's Team Monitor).
export default function Monitor({ onError }) {
  const [date, setDate] = useState(today());
  const live = date === today();
  const { data, error, loading } = useLoad(() => api.monitor(date), date, onError, live ? 60_000 : 0);

  const teams = data ? groupByTeam(data.teams, data.items).filter((t) => t.jobs.length) : [];
  const now = Date.now();
  const rows = teams.flatMap((t) => {
    const clocked = t.jobs.filter((j) => j.actual);
    return t.jobs.filter((j) => !j.actual).map((j) => ({ j, c: clocked.find((x) => x.id === j.id), status: null })).map((r) => ({ ...r, status: statusOf(r.j, r.c, now, live) }));
  });
  const count = (cls) => rows.filter((r) => r.status.cls === cls).length;

  return (
    <>
      <PageHeader
        title="Team Monitor"
        subtitle={live ? 'Live · refreshes every minute' : 'Scheduled vs clocked times'}
        actions={<DayPicker date={date} setDate={setDate} />}
      >
        {live && <span className="live-dot" title="Live" />}
      </PageHeader>
      <ErrorNote error={error} />
      {loading && <Skeleton rows={6} height={44} />}
      {data && (
        <>
          <Stats
            items={[
              { label: 'Jobs', value: rows.length },
              { label: 'Done', value: count('ok') + rows.filter((r) => r.status.label === 'Done (started late)').length, tone: 'ok' },
              { label: 'On site', value: rows.filter((r) => r.status.label.startsWith('On site')).length, tone: 'info' },
              { label: 'Late starts', value: rows.filter((r) => /late/.test(r.status.label)).length, tone: 'warn' },
              live && { label: 'Not clocked in', value: count('bad'), tone: count('bad') ? 'bad' : '' },
            ]}
          />
          {!teams.length && <Empty icon="activity" title="Nothing scheduled" />}
          <div className="monitor-list">
            {teams.map((t) => {
              const c = teamColor(t);
              const scheduled = rows.filter((r) => r.j.teamId === t.id);
              return (
                <section className="card flush" key={t.id}>
                  <div className="card-head" style={{ '--team': c.bg }}>
                    <h2><span className="team-swatch" />{t.name}</h2>
                    <span className="muted small">{scheduled.length} scheduled · {scheduled.filter((r) => r.c).length} clocked</span>
                  </div>
                  <table className="data">
                    <thead>
                      <tr><th>Scheduled</th><th>Job</th><th>Frequency</th><th>Clocked</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {scheduled.map(({ j, c: ck, status }) => (
                        <tr key={`${j.id}-${j.start}`}>
                          <td className="nowrap mono">{time(j.start)} – {time(j.end)}</td>
                          <td>{j.title}</td>
                          <td><FreqPill frequency={j.frequency} /></td>
                          <td className="nowrap mono">{ck ? `${time(ck.start)} – ${ck.end && ck.end !== ck.start ? time(ck.end) : '…'}` : '–'}</td>
                          <td><span className={`pill ${status.cls}`}>{status.label}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// Times are MaidCentral's local wall-clock strings; Date.parse reads them as local time.
function statusOf(j, c, now, isToday) {
  const js = Date.parse(j.start);
  if (c) {
    const cs = Date.parse(c.start);
    const ce = Date.parse(c.end);
    const late = cs - js > 10 * 60 * 1000;
    if (ce && ce > cs) return { label: late ? 'Done (started late)' : 'Done', cls: late ? 'warn' : 'ok' };
    return { label: late ? 'On site (late)' : 'On site', cls: late ? 'warn' : 'info' };
  }
  if (isToday && now > js + 10 * 60 * 1000) return { label: 'Not clocked in', cls: 'bad' };
  return { label: 'Upcoming', cls: '' };
}
