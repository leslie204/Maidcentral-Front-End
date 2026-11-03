import { useState } from 'react';
import { api, today, shiftDay, dayLabel } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import Icon from './Icon.jsx';
import { PageHeader, Stats, Skeleton, ErrorNote, Empty, Card, Help, plainFreq } from './ui.jsx';

const money = (n) => `$${Math.round(n).toLocaleString()}`;
const DAY_START = 7 * 60;
const DAY_END = 18 * 60;
const pct = (m) => ((Math.min(Math.max(m, DAY_START), DAY_END) - DAY_START) / (DAY_END - DAY_START)) * 100;

// Call-outs: someone can't come in. Pick who, and compare the ways to rearrange the day,
// ranked by how much of the day's revenue each one saves.
export default function Callouts({ onError }) {
  const [date, setDate] = useState(today());
  const [out, setOut] = useState([]);
  const [available, setAvailable] = useState([]);
  const [early, setEarly] = useState('30');
  const [late, setLate] = useState('120');
  const [maxCar, setMaxCar] = useState('3');
  const [result, setResult] = useState(null);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const roster = useLoad(() => api.calloutRoster(date), `roster:${date}`, onError);

  const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const changeDay = (d) => {
    setDate(d);
    setOut([]);
    setAvailable([]);
    setResult(null);
  };
  const run = async () => {
    setBusy(true);
    setError(null);
    setPick(0);
    try {
      setResult(await api.calloutPlan({ date, out: out.join(','), available: available.join(','), early, late, maxCar }));
    } catch (e) {
      onError(e);
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const r = roster.data;
  const best = result?.scenarios?.[pick];

  return (
    <>
      <PageHeader
        title="Call-outs"
        subtitle="Someone can't come in? Tap who, and see the best ways to rearrange the day to save as much revenue as possible."
        actions={
          <div className="segmented">
            <button className={date === today() ? 'on' : ''} onClick={() => changeDay(today())}>Today</button>
            <button className={date === shiftDay(today(), 1) ? 'on' : ''} onClick={() => changeDay(shiftDay(today(), 1))}>Tomorrow</button>
          </div>
        }
      />
      <ErrorNote error={roster.error} />
      {roster.loading && <Skeleton rows={4} height={60} />}
      {r && (
        <Card
          title={<>1. Who called out? <span className="muted small">{dayLabel(date)}</span></>}
          actions={out.length ? <button className="btn ghost sm" onClick={() => (setOut([]), setResult(null))}>Clear</button> : null}
        >
          <div className="roster">
            {r.cars.map((c) => {
              const col = teamColor(c);
              return (
                <div key={c.id} className="roster-car" style={{ '--team': col.bg }}>
                  <div className="roster-head">
                    <span className="team-swatch" />
                    <b>{c.name}</b>
                    <span className="muted small">{c.jobs} jobs · {money(c.revenue)}</span>
                  </div>
                  <div className="roster-people">
                    {c.members.map((m) => (
                      <button key={m.id} className={`person-chip ${out.includes(String(m.id)) ? 'out' : ''}`} onClick={() => (toggle(out, setOut, String(m.id)), setResult(null))}>
                        {out.includes(String(m.id)) ? <Icon name="close" size={13} /> : <Icon name="user" size={13} />}
                        {m.name}
                      </button>
                    ))}
                    {!c.members.length && <span className="muted small">nobody scheduled</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {r.spare.length > 0 && (
            <details className="disclosure spare-pick">
              <summary>
                Anyone without a team today who could fill in? <span className="muted small">(optional: {available.length ? `${available.length} chosen` : 'none chosen'})</span>
              </summary>
              <div className="roster-people">
                {r.spare.map((p) => (
                  <button key={p.id} className={`person-chip ${available.includes(String(p.id)) ? 'avail' : ''}`} onClick={() => (toggle(available, setAvailable, String(p.id)), setResult(null))}>
                    {available.includes(String(p.id)) ? <Icon name="check" size={13} /> : <Icon name="user" size={13} />}
                    {p.name}
                  </button>
                ))}
              </div>
            </details>
          )}
          <div className="callout-settings">
            <label className="inline-field">Customers can move up to
              <select value={early} onChange={(e) => (setEarly(e.target.value), setResult(null))}>
                {['0', '15', '30', '60'].map((m) => <option key={m} value={m}>{m === '0' ? 'no' : `${m} min`}</option>)}
              </select>
              earlier and
              <select value={late} onChange={(e) => (setLate(e.target.value), setResult(null))}>
                {['30', '60', '120', '180', '240'].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}
              </select>
              later
            </label>
            <label className="inline-field">Most people in one car
              <select value={maxCar} onChange={(e) => (setMaxCar(e.target.value), setResult(null))}>
                {['2', '3', '4'].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <button className="btn primary" disabled={!out.length || busy} onClick={run}>
              {busy ? 'Working it out…' : out.length ? `Show options for ${out.length} call-out${out.length > 1 ? 's' : ''}` : 'Tap who called out first'}
            </button>
          </div>
        </Card>
      )}
      <ErrorNote error={error} />
      {busy && <Skeleton rows={4} height={70} />}
      {result && !busy && (
        <>
          <Stats
            items={[
              { label: 'Day at stake', value: money(result.totalRevenue), hint: result.revenueEstimated ? 'estimated from cleaner-hours' : "from today's prices", help: result.revenueEstimated ? `MaidCentral only shows today's prices here, so other days are estimated at about ${money(result.perCleanerHour)} per cleaner-hour.` : undefined },
              { label: 'Best plan saves', value: money(result.scenarios[0]?.saved || 0), hint: `${result.scenarios[0]?.savedShare ?? 0}% of the day`, tone: 'ok' },
              result.baseline && { label: 'If nobody moves', value: `−${money(result.baseline.lost)}`, hint: 'the short car works on its own', tone: result.baseline.lost ? 'bad' : '' },
              { label: 'Calls to make', value: result.scenarios[0] ? result.scenarios[0].changes.length + result.scenarios[0].reschedule.length : 0, hint: 'with the best plan' },
            ]}
          />
          <div className="plan-list">
            {result.scenarios.map((s, i) => (
              <button key={i} className={`plan-card ${pick === i ? 'on' : ''}`} onClick={() => setPick(i)}>
                <div className="plan-rank">{i === 0 ? 'Best' : `Option ${i + 1}`}</div>
                <div className="plan-moves">{s.moves.map((m, n) => <span key={n}>{m}</span>)}</div>
                <div className="plan-nums">
                  <b className="ok-text">{money(s.saved)}</b>
                  <span className="muted small">saved ({s.savedShare}%)</span>
                  {s.lost > 0 && <span className="bad-text small">−{money(s.lost)} to reschedule</span>}
                  <span className="muted small">{s.changes.length + s.reschedule.length} calls</span>
                </div>
              </button>
            ))}
            {!result.scenarios.length && <Empty icon="alert" title="No workable plan found">Try allowing customers to move further, or a bigger car.</Empty>}
          </div>
          {best && <PlanDetail plan={best} result={result} />}
        </>
      )}
      {!result && !busy && r && <p className="muted small">The plans are suggestions: nothing changes until you make the changes in MaidCentral. Teams are kept back at the office by the return time, and a car of three cleans faster than a car of two.</p>}
    </>
  );
}

function PlanDetail({ plan, result }) {
  const calls = [
    ...plan.reschedule.map((x) => ({ ...x, kind: 'reschedule' })),
    ...plan.changes.map((x) => ({ ...x, kind: x.moved ? 'moved' : 'time' })),
  ];
  return (
    <div className="grid2 plan-detail">
      <Card title={<>Calls to make <Help>Customers whose visit changes with this plan: a new time, a different team, or a reschedule because it can't fit today. Phone numbers come from MaidCentral's Dispatch Board (today only).</Help></>} className="flush">
        {!calls.length && <Empty icon="check" title="No customer calls needed" />}
        {calls.map((c, i) => (
          <div key={i} className={`call ${c.kind}`}>
            <span className={`pill ${c.kind === 'reschedule' ? 'bad' : c.kind === 'moved' ? 'info' : 'warn'}`}>
              {c.kind === 'reschedule' ? 'Reschedule' : c.kind === 'moved' ? 'New team' : 'New time'}
            </span>
            <div className="call-body">
              <b>{c.title}</b>
              <span className="muted small">
                {c.kind === 'reschedule'
                  ? `Was ${c.was} with ${c.from} · ${money(c.revenue)}${c.revenueEstimated ? ' (est.)' : ''}${c.frequency ? ` · ${plainFreq(c.frequency)}` : ''}`
                  : `${c.was} → ${c.now}${c.moved ? ` · ${c.from} → ${c.to}` : ` · ${c.to}`}`}
              </span>
            </div>
            {c.phone && <a className="btn ghost sm" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={14} /> {c.phone}</a>}
          </div>
        ))}
      </Card>
      <Card title={<>The day with this plan <Help>Each bar is a car's day from 7 AM to 6 PM. Outlined blocks are jobs that moved to this car. "Back" is when the car gets back to the office.</Help></>} className="flush">
        <div className="plan-cars">
          {plan.cars.map((c) => {
            const col = teamColor(c);
            return (
              <div key={c.id} className="plan-car">
                <div className="plan-car-head">
                  <span className="team-swatch" style={{ '--team': col.bg }} />
                  <b>{c.name}</b>
                  <span className="muted small">{c.people.join(', ') || 'nobody'}</span>
                  {c.back && <span className="muted small right">back {c.back}</span>}
                </div>
                <div className="cbar">
                  {c.stops.map((s) => (
                    <div
                      key={s.jobId}
                      className={`cbar-job ${s.moved ? 'moved' : ''}`}
                      style={{ left: `${pct(s.start)}%`, width: `${Math.max(pct(s.end) - pct(s.start), 0.8)}%`, background: col.bg }}
                      title={`${s.label} ${s.title}${s.moved ? ` (from ${s.from})` : ''}${s.was !== s.label.split(' – ')[0] ? ` · was ${s.was}` : ''}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="card-foot muted small">Return by {result.options.returnBy} · customers moved up to {result.options.early} min earlier / {result.options.late / 60} h later · cars of up to {result.options.maxCar}</div>
      </Card>
    </div>
  );
}
