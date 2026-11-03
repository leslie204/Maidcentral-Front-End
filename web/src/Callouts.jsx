import { useEffect, useRef, useState } from 'react';
import { api, today, shiftDay, dayLabel } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import Icon from './Icon.jsx';
import { PageHeader, Stats, Skeleton, ErrorNote, Empty, Card, Help, plainFreq } from './ui.jsx';

const money = (n) => `$${Math.round(n).toLocaleString()}`;
const DAY_START = 7 * 60;
const DAY_END = 18 * 60;
const pct = (m) => ((Math.min(Math.max(m, DAY_START), DAY_END) - DAY_START) / (DAY_END - DAY_START)) * 100;
const ROLES = ['lead', 'cleaner', 'trainee'];
const ROLE_NAME = { lead: 'Lead', cleaner: 'Cleaner', trainee: 'Trainee' };
const ROLE_HELP = { lead: 'washrooms, kitchen', cleaner: 'floors, dusting', trainee: 'learning' };
const toTime = (m) => (m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const fromTime = (s) => (/^\d\d:\d\d$/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);

// What the customer said on the phone. Each one changes what the plan is allowed to do.
const OUTCOMES = [
  { value: '', label: 'Not called yet' },
  { value: 'agreed', label: 'Agreed to the new time', moveOnly: true },
  { value: 'noanswer', label: "No answer: keep their booked time" },
  { value: 'voicemail', label: 'Left voicemail: OK to move' },
  { value: 'keep', label: "Can't move: keep booked time" },
  { value: 'after', label: 'Only after…', time: true },
  { value: 'before', label: 'Only before…', time: true },
  { value: 'reschedule', label: 'Rebook another day' },
  { value: 'skip', label: 'Skip this visit' },
];
const OUTCOME_TONE = { agreed: 'ok', voicemail: 'warn', noanswer: 'warn', keep: 'info', after: 'info', before: 'info', reschedule: 'bad', skip: 'bad' };

// Everything the office enters for a day stays on this device, so a reload doesn't lose it.
const blank = { out: [], available: [], roles: {}, calls: {}, early: '30', late: '120', maxCar: '3', pickKey: '' };
function loadDay(date) {
  try {
    return { ...blank, ...JSON.parse(localStorage.getItem(`callouts:${date}`) || '{}') };
  } catch {
    return blank;
  }
}
function saveDay(date, s) {
  try {
    localStorage.setItem(`callouts:${date}`, JSON.stringify(s));
  } catch {
    /* private window: fine without */
  }
}

// Call-outs: tap who can't come in (one or more), mark leads and cleaners, and compare the
// ways to rearrange the day. As the office phones customers and logs what they said, the
// plans update to fit.
export default function Callouts({ onError }) {
  const [date, setDate] = useState(today());
  const [s, setS] = useState(() => loadDay(today()));
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const roster = useLoad(() => api.calloutRoster(date), `roster:${date}`, onError);
  const seq = useRef(0);

  const update = (patch) => setS((cur) => ({ ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) }));
  useEffect(() => saveDay(date, s), [date, s]);

  const changeDay = (d) => {
    setDate(d);
    setS(loadDay(d));
    setResult(null);
  };
  const toggle = (key, id) => update((cur) => ({ [key]: cur[key].includes(id) ? cur[key].filter((x) => x !== id) : [...cur[key], id] }));

  const r = roster.data?.date === date ? roster.data : null; // never show another day's roster while switching
  const roleOf = (p) => s.roles[p.id] || p.role || null;
  const cycleRole = (p) => update((cur) => {
    const next = ROLES[(ROLES.indexOf(roleOf(p)) + 1) % ROLES.length];
    const roles = { ...cur.roles };
    if (next === p.role) delete roles[p.id];
    else roles[p.id] = next;
    return { roles };
  });

  // Only call results with an outcome change the plan; notes are just for the office.
  const rolesParam = Object.entries(s.roles).map(([id, role]) => `${id}:${role}`).join(',');
  const callsParam = JSON.stringify(
    Object.fromEntries(
      Object.entries(s.calls)
        .filter(([, c]) => c.outcome && !(OUTCOMES.find((o) => o.value === c.outcome)?.time && c.time == null))
        .map(([id, c]) => [id, { outcome: c.outcome, car: c.car, start: c.start, time: c.time }]),
    ),
  );
  const query = s.out.length
    ? { date, out: s.out.join(','), available: s.available.join(','), roles: rolesParam, early: s.early, late: s.late, maxCar: s.maxCar, calls: callsParam }
    : null;
  const queryKey = JSON.stringify(query);

  // Re-plan shortly after anything changes (who's out, roles, settings, a call result).
  useEffect(() => {
    if (!query) {
      setResult(null);
      return undefined;
    }
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await api.calloutPlan(query);
        if (n === seq.current) setResult(res);
      } catch (e) {
        if (n !== seq.current) return;
        onError(e);
        setError(e);
      } finally {
        if (n === seq.current) setBusy(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [queryKey]);

  const pick = Math.max(0, result?.scenarios?.findIndex((x) => x.moves.join('|') === s.pickKey) ?? 0);
  const plan = result?.scenarios?.[pick];
  const setCall = (jobId, patch) =>
    update((cur) => {
      const calls = { ...cur.calls, [jobId]: { ...cur.calls[jobId], ...patch } };
      if (!calls[jobId].outcome && !calls[jobId].note) delete calls[jobId];
      return { calls };
    });
  const logged = Object.values(s.calls).filter((c) => c.outcome);
  const noAnswer = logged.filter((c) => c.outcome === 'noanswer' || c.outcome === 'voicemail').length;
  const reset = () => {
    if (!confirm(`Clear everything entered for ${dayLabel(date)} (call-outs, roles, call results and notes)?`)) return;
    setS(blank);
  };

  return (
    <>
      <PageHeader
        title="Call-outs"
        subtitle="Someone can't come in? Tap who (as many as needed), then phone customers and log what they said: the plan updates as you go."
        actions={
          <div className="segmented">
            <button className={date === today() ? 'on' : ''} onClick={() => changeDay(today())}>Today</button>
            <button className={date === shiftDay(today(), 1) ? 'on' : ''} onClick={() => changeDay(shiftDay(today(), 1))}>Tomorrow</button>
          </div>
        }
      />
      <ErrorNote error={roster.error} />
      {!r && !roster.error && <Skeleton rows={4} height={60} />}
      {r && (
        <Card
          title={
            <>
              1. Who called out? <span className="muted small">{dayLabel(date)}</span>{' '}
              <Help>
                Tap a name to mark them out; tap again to undo. The tag beside each name is their role (from their MaidCentral position: Captain = Lead). Tap the tag to change it.
                Every car needs a lead (washrooms, kitchen) and a cleaner (floors, dusting); nobody goes out alone.
              </Help>
            </>
          }
          actions={
            s.out.length || logged.length || Object.keys(s.roles).length ? (
              <button className="btn ghost sm" onClick={reset}>Start over</button>
            ) : null
          }
        >
          <div className="roster">
            {r.cars.map((c) => {
              const col = teamColor(c);
              const left = c.members.filter((m) => !s.out.includes(String(m.id)));
              const noLead = c.members.length > 0 && !c.members.some((m) => roleOf(m) === 'lead');
              return (
                <div key={c.id} className="roster-car" style={{ '--team': col.bg }}>
                  <div className="roster-head">
                    <span className="team-swatch" />
                    <b>{c.name}</b>
                    <span className="muted small">{c.jobs} jobs · {money(c.revenue)}</span>
                  </div>
                  <div className="roster-people">
                    {c.members.map((m) => (
                      <Person key={m.id} p={m} role={roleOf(m)} changed={!!s.roles[m.id]} out={s.out.includes(String(m.id))} onToggle={() => toggle('out', String(m.id))} onRole={() => cycleRole(m)} />
                    ))}
                    {!c.members.length && <span className="muted small">nobody scheduled</span>}
                  </div>
                  {noLead && <div className="roster-warn small"><Icon name="alert" size={13} /> No lead marked: tap a tag to set one</div>}
                  {!noLead && s.out.length > 0 && left.length < c.members.length && (
                    <div className="roster-warn small">
                      <Icon name="alert" size={13} /> {left.length ? `${left.length === 1 ? 'Can’t go out alone' : left.some((m) => roleOf(m) === 'lead') ? 'Still a car' : 'No lead left'}` : 'Whole car out'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {r.spare.length > 0 && (
            <details className="disclosure spare-pick" open={s.available.length > 0}>
              <summary>
                Anyone without a team today who could fill in? <span className="muted small">(optional: {s.available.length ? `${s.available.length} chosen` : 'none chosen'})</span>
              </summary>
              <div className="roster-people">
                {r.spare.map((p) => (
                  <Person key={p.id} p={p} role={roleOf(p)} changed={!!s.roles[p.id]} avail={s.available.includes(String(p.id))} onToggle={() => toggle('available', String(p.id))} onRole={() => cycleRole(p)} />
                ))}
              </div>
            </details>
          )}
          <div className="callout-settings">
            <label className="inline-field">Customers can move up to
              <select value={s.early} onChange={(e) => update({ early: e.target.value })}>
                {['0', '15', '30', '60'].map((m) => <option key={m} value={m}>{m === '0' ? 'no' : `${m} min`}</option>)}
              </select>
              earlier and
              <select value={s.late} onChange={(e) => update({ late: e.target.value })}>
                {['30', '60', '120', '180', '240'].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}
              </select>
              later
            </label>
            <label className="inline-field">Most people in one car
              <select value={s.maxCar} onChange={(e) => update({ maxCar: e.target.value })}>
                {['2', '3', '4'].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <span className="muted small replan">
              {!s.out.length ? 'Tap who called out to see options' : busy ? 'Updating the plan…' : result ? `${s.out.length} call-out${s.out.length > 1 ? 's' : ''} · ${logged.length} call result${logged.length === 1 ? '' : 's'} used` : ''}
            </span>
          </div>
        </Card>
      )}
      <ErrorNote error={error} />
      {busy && !result && <Skeleton rows={4} height={70} />}
      {result && (
        <div className={busy ? 'replanning' : ''}>
          <Stats
            items={[
              { label: 'Day at stake', value: money(result.totalRevenue), hint: result.revenueEstimated ? 'estimated from cleaner-hours' : "from today's prices", help: result.revenueEstimated ? `MaidCentral only shows today's prices here, so other days are estimated at about ${money(result.perCleanerHour)} per cleaner-hour.` : undefined },
              { label: 'This plan saves', value: money(plan?.saved || 0), hint: `${plan?.savedShare ?? 0}% of the day`, tone: 'ok' },
              result.baseline && { label: 'If nobody moves', value: `−${money(result.baseline.lost)}`, hint: result.baseline.jobs ? `${result.baseline.jobs} job${result.baseline.jobs > 1 ? 's' : ''}: short cars can't go out` : 'every car can still go out', tone: result.baseline.lost ? 'bad' : '', help: 'Nobody works alone and every car needs a lead, so a car left with one person, or without a lead, cannot go out unless someone moves.' },
              { label: 'Calls', value: plan ? `${plan.changes.filter((c) => s.calls[c.jobId]?.outcome).length + plan.reschedule.filter((c) => s.calls[c.jobId]?.outcome).length} / ${plan.changes.length + plan.reschedule.length}` : 0, hint: noAnswer ? `${noAnswer} not reached yet` : 'logged / to make' },
            ]}
          />
          <div className="plan-list">
            {result.scenarios.map((x, i) => (
              <button key={x.moves.join('|')} className={`plan-card ${pick === i ? 'on' : ''}`} onClick={() => update({ pickKey: x.moves.join('|') })}>
                <div className="plan-rank">{i === 0 ? 'Best' : `Option ${i + 1}`}</div>
                <div className="plan-moves">{x.moves.map((m, n) => <span key={n}>{m}</span>)}</div>
                <div className="plan-nums">
                  <b className="ok-text">{money(x.saved)}</b>
                  <span className="muted small">saved ({x.savedShare}%)</span>
                  {x.lost > 0 && <span className="bad-text small">−{money(x.lost)} to rebook</span>}
                  <span className="muted small">{x.changes.length + x.reschedule.length} calls</span>
                </div>
              </button>
            ))}
            {!result.scenarios.length && <Empty icon="alert" title="No workable plan found">Try allowing customers to move further, a bigger car, or choose someone to fill in.</Empty>}
          </div>
          {plan && <PlanDetail plan={plan} result={result} calls={s.calls} setCall={setCall} />}
        </div>
      )}
      {!result && !busy && r && (
        <p className="muted small">
          The plans are suggestions: nothing changes until you make the changes in MaidCentral. Cars leave the office at {r.leaveAt || '8:15 AM'} at the earliest and are back by the return time; a car of three cleans faster than a car of two.
          What you enter here stays on this device for the day.
        </p>
      )}
    </>
  );
}

function Person({ p, role, changed, out, avail, onToggle, onRole }) {
  return (
    <span className={`person ${out ? 'is-out' : ''}`}>
      <button className={`person-chip ${out ? 'out' : ''} ${avail ? 'avail' : ''}`} onClick={onToggle} title={out ? 'Called out: tap to undo' : avail ? 'Can fill in: tap to undo' : 'Tap if they called out'}>
        {out ? <Icon name="close" size={13} /> : avail ? <Icon name="check" size={13} /> : <Icon name="user" size={13} />}
        {p.name}
      </button>
      <button
        className={`role-tag ${role || 'none'} ${changed ? 'changed' : ''}`}
        onClick={onRole}
        title={`${role ? `${ROLE_NAME[role]} (${ROLE_HELP[role]})` : 'Role not set'}${changed ? ' · set by you' : p.position ? ` · MaidCentral: ${p.position}` : ''}. Tap to change.`}
      >
        {role ? ROLE_NAME[role] : 'Role?'}
      </button>
    </span>
  );
}

function PlanDetail({ plan, result, calls, setCall }) {
  const list = [
    ...plan.reschedule.map((x) => ({ ...x, kind: x.customerChoice ? x.customerChoice : 'reschedule' })),
    ...plan.changes.map((x) => ({ ...x, kind: x.moved ? 'moved' : x.shifted ? 'time' : 'same' })),
  ];
  const label = { reschedule: 'Rebook', skip: 'Skipping', moved: 'New team', time: 'New time', same: 'No change' };
  const tone = { reschedule: 'bad', skip: 'bad', moved: 'info', time: 'warn', same: 'ok' };
  return (
    <div className="grid2 plan-detail">
      <Card
        title={
          <>
            Calls to make{' '}
            <Help>
              Customers whose visit changes with this plan. After each call, pick what they said: the plans re-work around it (agreed times are locked in, "no answer"
              keeps their booked time, rebooked visits come off today). Notes are for the office and stay on this device. Phone numbers come from MaidCentral's
              Dispatch Board (today only).
            </Help>
          </>
        }
        className="flush"
      >
        {!list.length && <Empty icon="check" title="No customer calls needed" />}
        {list.map((c) => {
          const k = calls[c.jobId] || {};
          const def = OUTCOMES.find((o) => o.value === k.outcome);
          const offToday = c.kind === 'reschedule';
          return (
            <div key={c.jobId} className={`call ${c.kind} ${k.outcome ? 'logged' : ''}`}>
              <span className={`pill ${tone[c.kind]}`}>{label[c.kind]}</span>
              <div className="call-body">
                <b>{c.title}</b>
                <span className="muted small">
                  {offToday || c.kind === 'skip'
                    ? `Was ${c.was} with ${c.from} · ${money(c.revenue)}${c.revenueEstimated ? ' (est.)' : ''}${c.frequency ? ` · ${plainFreq(c.frequency)}` : ''}`
                    : `${c.was}${c.now !== c.was ? ` → ${c.now}` : ''}${c.moved ? ` · ${c.from} → ${c.to}` : ` · ${c.to}`}`}
                </span>
              </div>
              {c.phone ? <a className="btn ghost sm" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={14} /> {c.phone}</a> : <span />}
              <div className="call-log">
                <select
                  aria-label={`What ${c.title} said`}
                  className={k.outcome ? `tone-${OUTCOME_TONE[k.outcome]}` : ''}
                  value={k.outcome || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCall(c.jobId, v === 'agreed' ? { outcome: v, car: c.to, start: c.nowMin, time: null } : { outcome: v, car: null, start: null, time: OUTCOMES.find((o) => o.value === v)?.time ? k.time ?? c.nowMin ?? null : null });
                  }}
                >
                  {OUTCOMES.filter((o) => !(o.moveOnly && offToday)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {def?.time && (
                  <input type="time" aria-label="Time" value={toTime(k.time)} step={900} onChange={(e) => setCall(c.jobId, { time: fromTime(e.target.value) })} />
                )}
                <input className="call-note" placeholder="Note (e.g. call back at 10)" value={k.note || ''} onChange={(e) => setCall(c.jobId, { note: e.target.value })} />
              </div>
            </div>
          );
        })}
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
                  <span className="muted small">{c.people.map((p, i) => `${p}${c.roles?.[i] ? ` (${c.roles[i]})` : ''}`).join(', ') || 'nobody'}</span>
                  {c.back && <span className="muted small right">back {c.back}</span>}
                </div>
                <div className="cbar">
                  {c.stops.map((x) => (
                    <div
                      key={x.jobId}
                      className={`cbar-job ${x.moved ? 'moved' : ''}`}
                      style={{ left: `${pct(x.start)}%`, width: `${Math.max(pct(x.end) - pct(x.start), 0.8)}%`, background: col.bg }}
                      title={`${x.label} ${x.title}${x.moved ? ` (from ${x.from})` : ''}${x.was !== x.label.split(' – ')[0] ? ` · was ${x.was}` : ''}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="card-foot muted small">
          Leave the office from {result.options.leaveAt} · back by {result.options.returnBy} · customers moved up to {result.options.early} min earlier / {result.options.late / 60} h later · cars of up to {result.options.maxCar}
        </div>
      </Card>
    </div>
  );
}
