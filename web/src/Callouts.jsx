import { useEffect, useRef, useState } from 'react';
import { api, today, shiftDay, dayLabel } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import Icon from './Icon.jsx';
import { PageHeader, Stats, Skeleton, ErrorNote, Empty, Card, Help, plainFreq } from './ui.jsx';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Revenue impact in words: a job against the day's other jobs; a plan by how much of the
// day's revenue it can't keep.
const IMPACT = { none: 'No impact', low: 'Low impact', medium: 'Medium impact', high: 'High impact' };
const IMPACT_TONE = { none: 'ok', low: 'info', medium: 'warn', high: 'bad' };
const Impact = ({ level }) => <span className={`pill ${IMPACT_TONE[level]}`}>{IMPACT[level]}</span>;
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
                    <span className="muted small">{plural(c.jobs, 'job')}</span>
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
              { label: 'Jobs on the day', value: result.totalJobs, hint: dayLabel(date) },
              { label: 'This plan keeps', value: `${plan?.jobsKept ?? 0} of ${result.totalJobs}`, hint: plan?.jobsLost ? `${plural(plan.jobsLost, 'job')} to rebook · ${IMPACT[plan.impact].toLowerCase()}` : 'every job still happens', tone: plan?.jobsLost ? 'warn' : 'ok', help: 'Plans are ranked by how many jobs they keep today. Impact is how much of the day’s revenue the jobs to rebook add up to: low (under 5%), medium (under 15%) or high.' },
              result.baseline && { label: 'If nobody moves', value: result.baseline.jobs ? `−${plural(result.baseline.jobs, 'job')}` : 'All kept', hint: result.baseline.jobs ? `short cars can't go out · ${IMPACT[result.baseline.impact].toLowerCase()}` : 'every car can still go out', tone: result.baseline.jobs ? 'bad' : '', help: 'Nobody works alone and every car needs a lead, so a car left with one person, or without a lead, cannot go out unless someone moves.' },
              { label: 'Calls', value: plan ? `${plan.changes.filter((c) => s.calls[c.jobId]?.outcome).length + plan.reschedule.filter((c) => s.calls[c.jobId]?.outcome).length} / ${plan.changes.length + plan.reschedule.length}` : 0, hint: noAnswer ? `${noAnswer} not reached yet` : 'logged / to make' },
            ]}
          />
          <div className="plan-list">
            {result.scenarios.map((x, i) => (
              <button key={x.moves.join('|')} className={`plan-card ${pick === i ? 'on' : ''}`} onClick={() => update({ pickKey: x.moves.join('|') })}>
                <div className="plan-rank">{i === 0 ? 'Best' : `Option ${i + 1}`}</div>
                <div className="plan-moves">{x.moves.map((m, n) => <span key={n}>{m}</span>)}</div>
                <div className="plan-nums">
                  <b className={x.jobsLost ? '' : 'ok-text'}>{x.jobsKept} of {result.totalJobs} jobs</b>
                  {x.jobsLost > 0 ? <span className="small">{plural(x.jobsLost, 'job')} to rebook <Impact level={x.impact} /></span> : <span className="ok-text small">nothing to rebook</span>}
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

// Minutes since midnight as "9:30 AM"; a length as "1h 20m".
const t12 = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(Math.round(m) % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
const len = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${Math.round(m % 60)}m` : ''}` : `${Math.round(m)}m`);
const toMin = (s) => {
  const x = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(s || '').trim());
  return x ? ((Number(x[1]) % 12) + (/pm/i.test(x[3]) ? 12 : 0)) * 60 + Number(x[2]) : null;
};
const crewText = (n) => `${n} cleaner${n === 1 ? '' : 's'}`;
// Dark or white text, whichever reads better on a team colour.
const ink = (bg, fallback) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(bg || '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#1f2937' : '#fff';
};

// Why a visit's time or length changes, in a sentence.
function explain(c) {
  const bits = [];
  if (c.moved) bits.push(`${c.to} takes this visit (${c.from} is short-handed today).`);
  if (c.resized && c.nowCrew !== c.wasCrew) {
    bits.push(`${c.to} has ${crewText(c.nowCrew)}, so the clean takes ${len(c.nowDur)} instead of ${len(c.wasDur)}.`);
  } else if (c.resized) bits.push(`The clean takes ${len(c.nowDur)} instead of ${len(c.wasDur)}.`);
  const shift = toMin(c.now) - toMin(c.was);
  if (Math.abs(shift) >= 15) bits.push(`They arrive ${len(Math.abs(shift))} ${shift > 0 ? 'later' : 'earlier'} than booked.`);
  return bits.join(' ');
}

function PlanDetail({ plan, result, calls, setCall }) {
  const list = [
    ...plan.reschedule.map((x) => ({ ...x, kind: x.customerChoice ? x.customerChoice : 'reschedule' })),
    ...plan.changes.map((x) => ({ ...x, kind: x.moved ? 'moved' : x.shifted ? 'time' : x.resized ? (x.nowDur < x.wasDur ? 'shorter' : 'longer') : 'same' })),
  ];
  const label = { reschedule: 'Rebook', skip: 'Skipping', moved: 'New team', time: 'New time', shorter: 'Shorter visit', longer: 'Longer visit', same: 'Confirm' };
  const tone = { reschedule: 'bad', skip: 'bad', moved: 'info', time: 'warn', shorter: 'ok', longer: 'warn', same: 'ok' };
  return (
    <div className="plan-detail2">
      <Card
        title={
          <>
            Calls to make <span className="muted small">{list.length}</span>{' '}
            <Help>
              Customers whose visit changes with this plan: a new team, a new time, or a different length (a car of three cleans faster than a car of two). After each
              call, pick what they said: the plans re-work around it (agreed times are locked in, "no answer" keeps their booked time, rebooked visits come off today).
              Notes stay on this device. Phone numbers come from MaidCentral's Dispatch Board (today only).
            </Help>
          </>
        }
        className="flush"
      >
        {!list.length && <Empty icon="check" title="No customer calls needed" />}
        {list.map((c) => {
          const k = calls[c.jobId] || {};
          const def = OUTCOMES.find((o) => o.value === k.outcome);
          const offToday = c.kind === 'reschedule' || c.kind === 'skip';
          return (
            <div key={c.jobId} className={`call2 ${k.outcome ? 'logged' : ''}`}>
              <div className="call2-top">
                <span className={`pill ${tone[c.kind]}`}>{label[c.kind]}</span>
                <b>{c.title}</b>
                {c.impact && offToday && <Impact level={c.impact} />}
                {c.phone && <a className="btn ghost sm call2-phone" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={14} /> {c.phone}</a>}
              </div>
              {offToday ? (
                <div className="call2-compare one">
                  <div><span className="cmp-tag">Booked</span><b>{c.was}</b><span>{c.from}</span>{c.frequency && <span className="muted">{plainFreq(c.frequency)}</span>}</div>
                  <div className="cmp-off"><span className="cmp-tag">Today</span><b>Can't fit</b><span className="muted">{c.kind === 'skip' ? 'Skipping this visit' : 'Rebook another day'}</span></div>
                </div>
              ) : (
                <>
                  <div className="call2-compare">
                    <div>
                      <span className="cmp-tag">Booked</span>
                      <b>{c.was} – {c.wasEnd}</b>
                      <span>{c.from} · {crewText(c.wasCrew)}</span>
                      <span className="muted">{len(c.wasDur)} clean</span>
                    </div>
                    <Icon name="chevronRight" size={18} />
                    <div className="cmp-new">
                      <span className="cmp-tag">New</span>
                      <b><span className={c.shifted ? 'chg' : ''}>{c.now}</span> – <span className={c.shifted || c.resized ? 'chg' : ''}>{c.nowEnd}</span></b>
                      <span><span className={c.moved ? 'chg' : ''}>{c.to}</span> · <span className={c.nowCrew !== c.wasCrew ? 'chg' : ''}>{crewText(c.nowCrew)}</span></span>
                      <span className={c.resized ? 'chg' : 'muted'}>{len(c.nowDur)} clean{c.resized ? ` (${c.nowDur < c.wasDur ? '−' : '+'}${len(Math.abs(c.nowDur - c.wasDur))})` : ''}</span>
                    </div>
                  </div>
                  {explain(c) && <p className="call2-why">{explain(c)}</p>}
                </>
              )}
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
                {def?.time && <input type="time" aria-label="Time" value={toTime(k.time)} step={900} onChange={(e) => setCall(c.jobId, { time: fromTime(e.target.value) })} />}
                <input className="call-note" placeholder="Note (e.g. call back at 10)" value={k.note || ''} onChange={(e) => setCall(c.jobId, { note: e.target.value })} />
              </div>
            </div>
          );
        })}
      </Card>
      <DayChart plan={plan} result={result} />
    </div>
  );
}

// Each car's day: an hour scale, the visits (start, customer, length), driving between
// them, the booked time of anything that moved (dashed), and the return-by line.
function DayChart({ plan, result }) {
  const backBy = toMin(result.options.returnBy) ?? 16 * 60 + 45;
  const leaveAt = toMin(result.options.leaveAt) ?? 8 * 60 + 15;
  const cars = plan.cars;
  const all = cars.flatMap((c) => c.stops.flatMap((s) => [s.start - (s.drive || 0), s.end, s.wasStart ?? s.start, s.wasEnd ?? s.end]));
  const s0 = Math.floor(Math.min(leaveAt, ...all, 8 * 60) / 60) * 60;
  const e0 = Math.ceil(Math.max(backBy + 15, ...cars.map((c) => c.backMin || 0), ...all) / 60) * 60;
  const x = (m) => ((Math.min(Math.max(m, s0), e0) - s0) / (e0 - s0)) * 100;
  const hours = [];
  for (let h = s0; h <= e0; h += 60) hours.push(h);
  return (
    <Card
      title={<>The day with this plan <Help wide>One row per car. Solid blocks are visits at their new time (start, customer, length); a dashed outline is the time it was booked; thin lines are driving. Blue outline: a visit that joined this car. Red line: everyone back at the office by {result.options.returnBy}.</Help></>}
      className="flush"
    >
      <div className="dc-legend">
        <span><i className="lg-solid" />new time</span>
        <span><i className="lg-ghost" />booked time</span>
        <span><i className="lg-moved" />joined this car</span>
        <span><i className="lg-drive" />driving</span>
        <span><i className="lg-back" />back by {result.options.returnBy}</span>
      </div>
      <div className="dc">
        <div className="dc-axis">
          {hours.map((h) => <span key={h} style={{ left: `${x(h)}%` }}>{((h / 60 + 11) % 12) + 1}{h < 720 ? 'a' : 'p'}</span>)}
        </div>
        {cars.map((c) => {
          const col = teamColor(c);
          const cleaning = c.stops.reduce((s, v) => s + (v.end - v.start), 0);
          const driving = c.stops.reduce((s, v) => s + (v.drive || 0), 0) + (c.backMin && c.stops.length ? c.backMin - c.stops[c.stops.length - 1].end : 0);
          const late = c.backMin && c.backMin > backBy;
          return (
            <div key={c.id} className="dc-car">
              <div className="dc-head">
                <span className="team-swatch" style={{ '--team': col.bg }} />
                <b>{c.name}</b>
                <span className="pill">{crewText(c.people.length)}</span>
                <span className="muted small dc-people">{c.people.map((p, i) => `${p.split(' ')[0]}${c.roles?.[i] === 'lead' ? ' (lead)' : ''}`).join(', ') || 'nobody'}</span>
                <span className={`small dc-times ${late ? 'bad-text' : 'muted'}`}>
                  {c.stops.length ? `${c.leave != null ? `leaves ${t12(c.leave)} · ` : ''}back ${c.back}${late ? ` (after ${result.options.returnBy})` : ''}` : 'no visits'}
                </span>
              </div>
              <div className="dc-track">
                {hours.map((h) => <i key={h} className="dc-grid" style={{ left: `${x(h)}%` }} />)}
                <i className="dc-backby" style={{ left: `${x(backBy)}%` }} />
                {c.stops.map((s) => (
                  <span key={`d${s.jobId}`}>
                    {s.drive > 0 && <i className="dc-drive" style={{ left: `${x(s.start - s.drive)}%`, width: `${x(s.start) - x(s.start - s.drive)}%` }} title={`${s.drive} min driving`} />}
                    {(s.moved || s.shifted || s.resized) && s.wasStart != null && (
                      <i className="dc-ghost" style={{ left: `${x(s.wasStart)}%`, width: `${Math.max(x(s.wasEnd) - x(s.wasStart), 0.8)}%` }} title={`Booked ${t12(s.wasStart)} – ${t12(s.wasEnd)}`} />
                    )}
                  </span>
                ))}
                {c.backMin && c.stops.length > 0 && (
                  <i className="dc-drive" style={{ left: `${x(c.stops[c.stops.length - 1].end)}%`, width: `${x(c.backMin) - x(c.stops[c.stops.length - 1].end)}%` }} title="Driving back to the office" />
                )}
                {c.stops.map((s) => (
                  <div
                    key={s.jobId}
                    className={`dc-job ${s.moved ? 'moved' : ''}`}
                    style={{ left: `${x(s.start)}%`, width: `${Math.max(x(s.end) - x(s.start), 0.8)}%`, background: col.bg, color: ink(col.bg, col.fg) }}
                    title={`${s.label} · ${s.title}\n${len(s.end - s.start)} clean${s.moved ? `\nFrom ${s.from}` : ''}${s.wasStart != null && (s.shifted || s.resized) ? `\nBooked ${t12(s.wasStart)} – ${t12(s.wasEnd)}` : ''}${s.drive ? `\n${s.drive} min drive before` : ''}`}
                  >
                    <b>{t12(s.start).replace(' AM', '').replace(' PM', '')}</b>
                    <span>{s.title.split(' - ')[0].replace(/ Home$/i, '')}</span>
                    <em>{len(s.end - s.start)}</em>
                  </div>
                ))}
              </div>
              <div className="dc-sum muted small">
                {c.stops.length} visit{c.stops.length === 1 ? '' : 's'} · {len(cleaning)} cleaning · {len(driving)} driving
                {c.stops.some((s) => s.moved) && <> · <span className="info-text">{c.stops.filter((s) => s.moved).map((s) => `${s.title.split(' - ')[0]} from ${s.from}`).join(', ')}</span></>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="card-foot muted small">
        Leave the office from {result.options.leaveAt} · back by {result.options.returnBy} · customers moved up to {result.options.early} min earlier / {result.options.late / 60} h later · cars of up to {result.options.maxCar}
      </div>
    </Card>
  );
}
