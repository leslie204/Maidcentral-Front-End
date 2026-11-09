import { useEffect, useRef, useState } from 'react';
import { api, today, shiftDay } from './api.js';
import { useLoad, useRefreshTick } from './hooks.js';
import { teamColor } from './teamColor.js';
import Icon from './Icon.jsx';
import { PageHeader, Skeleton, ErrorNote, Empty, plainFreq } from './ui.jsx';

// Rescheduling, in two flows:
//   Move a customer: find them (by name, or by date), pick one of the best new times (or
//   any free time from the day strip), then send the ready-made message and log the answer.
//   Move a whole day: every booking on a date (a holiday) gets a new slot, worked through
//   as a checklist of calls.
// Suggestions come from the routes around the date. What the office enters stays on this
// device. Read-only: the booking is moved in MaidCentral.

const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const shortDay = (iso) => parse(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const longDay = (iso) => parse(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
const clock = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(Math.round(m) % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
const away = (n) => (n === 0 ? 'same day' : `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} ${n < 0 ? 'earlier' : 'later'}`);
const firstName = (b) => (b.customer ? b.customer.split(/\s+/)[0] : b.home.replace(/ Home$/i, ''));
const colorOf = (teams, teamId) => teamColor(teams.find((t) => t.id === teamId) || {}).bg;

// "Their own team · usual time · team already nearby"
function plainReason(s, { team = true } = {}) {
  const parts = [];
  if (team) parts.push(s.sameTeam ? `Their own team (${s.team})` : `With ${s.team}`);
  else if (s.sameTeam) parts.push('Their own team');
  const sh = Math.abs(s.shiftMin);
  parts.push(sh < 15 ? 'usual time' : `${sh >= 60 ? `${Math.round(sh / 30) / 2} h` : `${Math.round(sh / 5) * 5} min`} ${s.shiftMin < 0 ? 'earlier' : 'later'} than usual`);
  parts.push(s.extraDriveMin <= 5 ? 'team already nearby' : `+${s.exactDrive ? '' : '≈'}${s.extraDriveMin} min driving${s.exactDrive ? ' (Google Maps)' : ''}`);
  return parts.join(' · ');
}
const warning = (s) => (s.reasons || []).find((x) => x.tone === 'warn' && /days from their/.test(x.text))?.text || null;

function message(b, fromDate, pick, reason) {
  return `Hi ${firstName(b)}, ${reason ? `because of ${reason}, ` : ''}we need to move your cleaning on ${longDay(fromDate)} at ${clock(b.start)}. Would ${longDay(pick.date)} at ${clock(pick.start)} work for you instead? Thank you! – Clean Bee`;
}

const ANSWERS = [
  { value: 'agreed', label: 'Agreed', icon: 'check', tone: 'ok' },
  { value: 'other', label: 'Wants another time', icon: 'repeat', tone: 'warn' },
  { value: 'noanswer', label: 'No answer', icon: 'phone', tone: 'warn' },
  { value: 'voicemail', label: 'Left voicemail', icon: 'mail', tone: 'info' },
  { value: 'cancel', label: 'Cancel this visit', icon: 'close', tone: 'bad' },
];
const answerOf = (v) => ANSWERS.find((a) => a.value === v);

function useStored(key, initial) {
  const [v, setV] = useState(() => {
    try {
      return { ...initial, ...JSON.parse(localStorage.getItem(key) || '{}') };
    } catch {
      return initial;
    }
  });
  const keyRef = useRef(key);
  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      try {
        setV({ ...initial, ...JSON.parse(localStorage.getItem(key) || '{}') });
      } catch {
        setV(initial);
      }
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* private window */
    }
  }, [key, v]);
  return [v, setV];
}

// Weekdays coming up, for quick date picks.
function nextWeekdays(n) {
  const out = [];
  let d = today();
  while (out.length < n) {
    d = shiftDay(d, 1);
    const wd = parse(d).getDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
}

function CopyButton({ text, label = 'Copy', small }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn ghost ${small ? 'sm' : ''}`}
      onClick={() => navigator.clipboard?.writeText(text).then(() => (setDone(true), setTimeout(() => setDone(false), 1800)))}
    >
      <Icon name={done ? 'check' : 'note'} size={14} /> {done ? 'Copied' : label}
    </button>
  );
}

function Range({ dir, setDir, days, setDays, sameDay, setSameDay }) {
  return (
    <div className="rs-range">
      <div className="segmented">
        {[['before', 'Earlier'], ['either', 'Earlier or later'], ['after', 'Later']].map(([v, l]) => (
          <button key={v} className={dir === v ? 'on' : ''} onClick={() => setDir(v)}>{l}</button>
        ))}
      </div>
      <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="How far">
        <option value="3">within 3 days</option>
        <option value="7">within a week</option>
        <option value="14">within 2 weeks</option>
      </select>
      {setSameDay && <label className="check"><input type="checkbox" checked={sameDay} onChange={(e) => setSameDay(e.target.checked)} /> or another time the same day</label>}
    </div>
  );
}

export default function Reschedule({ onError }) {
  const [mode, setMode] = useState('one');
  return (
    <>
      <PageHeader
        title="Reschedule"
        subtitle="Find a new time that suits the customer and the routes: their own team, their usual time, a team already nearby."
        actions={
          <div className="segmented big">
            <button className={mode === 'one' ? 'on' : ''} onClick={() => setMode('one')}><Icon name="user" size={15} /> Move a customer</button>
            <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}><Icon name="calendar" size={15} /> Move a whole day</button>
          </div>
        }
      />
      {mode === 'one' ? <OneCustomer onError={onError} /> : <WholeDay onError={onError} />}
      <p className="muted small rs-foot">New times fit into a team's route: driving from the job before (or the office at 8:15 AM) and on to the next job or back by the return time. Extra driving marked "Google Maps" is the real road time; "≈" is an estimate from distance. Nothing changes until you move the booking in MaidCentral.</p>
    </>
  );
}

// ---------- Move a customer ----------

function OneCustomer({ onError }) {
  const [booking, setBooking] = useState(null); // { ...booking, date }
  const [log, setLog] = useStored('reschedule:one', { items: {} });
  const save = (b, patch) => setLog((l) => ({ items: { ...l.items, [b.id]: { ...(l.items[b.id] || { booking: b }), ...patch, at: Date.now() } } }));
  const recent = Object.values(log.items).filter((x) => x.pick || x.answer).sort((a, b) => b.at - a.at).slice(0, 8);
  if (!booking) {
    return (
      <>
        <FindBooking onPick={setBooking} onError={onError} />
        {recent.length > 0 && (
          <section className="card">
            <div className="card-head"><h2>Recently rescheduled</h2><button className="btn ghost sm" onClick={() => setLog({ items: {} })}>Clear</button></div>
            <div className="card-body rs-recent">
              {recent.map((x) => (
                <button key={x.booking.id} className="rs-recent-row" onClick={() => setBooking(x.booking)}>
                  <b>{x.booking.home}</b>
                  <span className="muted small">{shortDay(x.booking.date)} {clock(x.booking.start)} → {x.pick ? `${shortDay(x.pick.date)} ${clock(x.pick.start)} · ${x.pick.team}` : 'no time chosen'}</span>
                  {x.answer && <span className={`pill ${answerOf(x.answer)?.tone}`}>{answerOf(x.answer)?.label}</span>}
                </button>
              ))}
            </div>
          </section>
        )}
      </>
    );
  }
  const entry = log.items[booking.id] || {};
  return <NewTime b={booking} entry={entry} save={(p) => save(booking, p)} onBack={() => setBooking(null)} onError={onError} />;
}

function FindBooking({ onPick, onError }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [date, setDate] = useState('');
  // Start reading the next 4 weeks as soon as the page opens.
  useEffect(() => {
    api.rescheduleWarm().catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  const found = useLoad(() => (debounced.length >= 2 ? api.rescheduleFind(debounced) : Promise.resolve(null)), `find:${debounced}`, onError);
  const day = useLoad(() => (date ? api.rescheduleDay(date) : Promise.resolve(null)), `rday:${date}`, onError);
  const teams = found.data?.teams || day.data?.teams || [];
  const list = debounced.length >= 2 ? found.data?.results || [] : day.data?.date === date ? day.data.bookings.map((b) => ({ ...b, date })) : [];
  return (
    <section className="card rs-find">
      <div className="card-body">
        <h2 className="rs-step"><span>1</span> Which booking?</h2>
        <div className="rs-search">
          <Icon name="search" size={18} />
          <input autoFocus placeholder="Type the customer's name…" value={q} onChange={(e) => (setQ(e.target.value), setDate(''))} />
        </div>
        <div className="rs-or">
          <span className="muted small">or pick a date</span>
          {nextWeekdays(10).map((d) => (
            <button key={d} className={`chip ${date === d && !debounced ? 'on' : ''}`} onClick={() => (setDate(d), setQ(''), setDebounced(''))}>{shortDay(d)}</button>
          ))}
          <input type="date" value={date} onChange={(e) => (setDate(e.target.value), setQ(''), setDebounced(''))} aria-label="Another date" />
        </div>
        {(found.loading && debounced.length >= 2) || (day.loading && date) ? <Skeleton rows={4} height={46} /> : null}
        <ErrorNote error={found.error || day.error} />
        {debounced.length >= 2 && found.data && !list.length && <Empty icon="search" title={`No bookings for "${debounced}" in the next 4 weeks`}>Check the spelling, or pick the date instead.</Empty>}
        {date && !debounced && day.data && !list.length && <Empty icon="calendar" title={`No bookings on ${shortDay(date)}`} />}
        {list.length > 0 && (
          <div className="rs-results">
            {list.map((b) => (
              <button key={`${b.id}${b.date}`} className="rs-booking" onClick={() => onPick(b)}>
                <span className="rs-when"><b>{shortDay(b.date)}</b><span>{clock(b.start)}</span></span>
                <span className="rs-who"><b>{b.home}</b><span className="muted small">{b.customer || ''}{b.area ? ` · ${b.area}` : ''}</span></span>
                <span className="rs-team"><span className="team-swatch" style={{ '--team': colorOf(teams, b.teamId) }} />{b.team}</span>
                <span className="muted small">{b.frequency ? plainFreq(b.frequency) : 'One-time'}</span>
                <Icon name="chevronRight" size={16} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function NewTime({ b, entry, save, onBack, onError }) {
  const [dir, setDir] = useState('either');
  const [days, setDays] = useState('7');
  const [sameDay, setSameDay] = useState(false);
  const q = { date: b.date, job: b.id, dir, days, sameDay: String(sameDay), limit: 80 };
  const r = useLoad(() => api.rescheduleOptions(q), `ropt:${JSON.stringify(q)}`, onError);
  const o = r.data;
  const teams = o?.teams || [];
  const pick = entry.pick || null;
  const choose = (s) => save({ pick: { date: s.date, teamId: s.teamId, team: s.team, start: s.start, end: s.end, label: s.label }, answer: '' });
  const isPick = (s) => pick && pick.date === s.date && pick.teamId === s.teamId && pick.start === s.start;
  // Day strip: every date in the window, with its free times.
  const dates = [];
  if (o) {
    const span = Number(days);
    for (let i = -span; i <= span; i++) {
      const d = shiftDay(b.date, i);
      if (d <= today()) continue;
      if (dir === 'before' && i > 0) continue;
      if (dir === 'after' && i < 0) continue;
      const wd = parse(d).getDay();
      const slots = o.slots.filter((s) => s.date === d).sort((x, y) => x.start - y.start);
      if ((wd === 0 || wd === 6) && !slots.length) continue;
      dates.push({ d, slots, original: i === 0 });
    }
  }
  const msg = pick ? message(b, b.date, pick, '') : '';
  return (
    <>
      <section className="card rs-booking-head">
        <div className="card-body">
          <button className="linkish" onClick={onBack}>← Choose another booking</button>
          <div className="rs-head">
            <div>
              <span className="muted small">Moving</span>
              <h2>{b.home} <span className="muted">{b.customer ? `· ${b.customer}` : ''}</span></h2>
              <span>{longDay(b.date)} at {clock(b.start)} with <span className="team-swatch" style={{ '--team': colorOf(teams, b.teamId) }} />{b.team} · {b.frequency ? plainFreq(b.frequency).toLowerCase() : 'one-time'}{b.area ? ` · ${b.area}` : ''}</span>
            </div>
            <Range dir={dir} setDir={setDir} days={days} setDays={setDays} sameDay={sameDay} setSameDay={setSameDay} />
          </div>
        </div>
      </section>
      {r.loading && <Skeleton rows={4} height={70} />}
      <ErrorNote error={r.error} />
      {o && (
        <>
          <h2 className="rs-step"><span>2</span> Pick a new time</h2>
          {!o.slots.length && <Empty icon="alert" title="No free time fits">Try "within 2 weeks", the other direction, or another time the same day.</Empty>}
          <div className="rs-best">
            {o.slots.slice(0, 3).map((s, i) => (
              <button key={`${s.date}${s.teamId}${s.start}`} className={`rs-choice ${isPick(s) ? 'on' : ''}`} onClick={() => choose(s)}>
                {i === 0 && <span className="pill info rs-badge">Best match</span>}
                <span className="rs-choice-day">{shortDay(s.date)}</span>
                <span className="rs-choice-time">{clock(s.start)}</span>
                <span className="rs-choice-team"><span className="team-swatch" style={{ '--team': colorOf(teams, s.teamId) }} />{s.team} · {away(s.daysAway)}</span>
                <span className="muted small">{plainReason(s, { team: false })}</span>
                {warning(s) && <span className="warn-text small">{warning(s)}</span>}
                <span className={`btn ${isPick(s) ? 'primary' : 'ghost'} sm`}>{isPick(s) ? <><Icon name="check" size={14} /> Chosen</> : 'Choose'}</span>
              </button>
            ))}
          </div>
          {dates.length > 0 && (
            <section className="card flush">
              <div className="card-head"><h2>All free times</h2><span className="muted small">click a time to choose it · best ones are bold</span></div>
              <div className="rs-strip">
                {dates.map(({ d, slots, original }) => (
                  <div key={d} className={`rs-day ${original ? 'original' : ''}`}>
                    <div className="rs-day-head"><b>{parse(d).toLocaleDateString([], { weekday: 'short' })}</b><span>{parse(d).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>{original && <em>their day</em>}</div>
                    {slots.length ? slots.map((s) => (
                      <button key={`${s.teamId}${s.start}`} className={`rs-slot ${isPick(s) ? 'on' : ''} ${o.slots.indexOf(s) < 5 ? 'top' : ''}`} onClick={() => choose(s)} title={plainReason(s)}>
                        <i style={{ background: colorOf(teams, s.teamId) }} />{clock(s.start).replace(':00', '')}<span>{s.team}</span>
                      </button>
                    )) : <span className="muted small rs-full">{original && !sameDay ? '—' : 'no room'}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
          {pick && (
            <section className="card flush">
              <div className="card-head"><h2>{shortDay(pick.date)} with {b.home} added</h2><span className="muted small">every team's bookings that day · hover a block for details</span></div>
              <DayGantt
                date={pick.date}
                teams={teams}
                onError={onError}
                hide={pick.date === b.date ? [b.id] : []}
                added={[{ id: b.id, home: b.home, customer: b.customer, teamId: pick.teamId, team: pick.team, start: pick.start, end: pick.end, primary: true }]}
              />
            </section>
          )}
          {pick && (
            <section className="card rs-confirm">
              <div className="card-body">
                <h2 className="rs-step"><span>3</span> Let {firstName(b)} know</h2>
                <p className="rs-change">
                  <span><s>{shortDay(b.date)} {clock(b.start)} · {b.team}</s></span>
                  <Icon name="chevronRight" size={16} />
                  <b>{shortDay(pick.date)} {clock(pick.start)} · {pick.team}</b>
                </p>
                <label className="field">
                  <span>Message (edit as you like)</span>
                  <textarea rows={3} value={entry.msg ?? msg} onChange={(e) => save({ msg: e.target.value })} />
                </label>
                <div className="rs-actions"><CopyButton text={entry.msg ?? msg} label="Copy message" /></div>
                <span className="muted small">What did they say?</span>
                <div className="rs-answers">
                  {ANSWERS.map((a) => (
                    <button key={a.value} className={`rs-answer ${a.tone} ${entry.answer === a.value ? 'on' : ''}`} onClick={() => save({ answer: entry.answer === a.value ? '' : a.value })}>
                      <Icon name={a.icon} size={15} /> {a.label}
                    </button>
                  ))}
                </div>
                <input className="call-note" placeholder="Note (e.g. call back after 5)" value={entry.note || ''} onChange={(e) => save({ note: e.target.value })} />
                {entry.answer === 'agreed' && (
                  <div className="rs-done"><Icon name="check" size={16} /> Now move it in MaidCentral: {shortDay(b.date)} {clock(b.start)} ({b.team}) → <b>{shortDay(pick.date)} {clock(pick.start)} ({pick.team})</b></div>
                )}
                {entry.answer === 'other' && <div className="muted small">Pick another time above; the message updates.</div>}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

// ---------- Move a whole day ----------

function WholeDay({ onError }) {
  const [date, setDate] = useState(() => nextWeekdays(1)[0]);
  const [st, setSt] = useStored(`reschedule:${date}`, { picks: {}, status: {}, notes: {}, reason: '' });
  const [dir, setDir] = useState('either');
  const [days, setDays] = useState('7');
  const [filter, setFilter] = useState('call');
  const [open, setOpen] = useState(null);
  const [dayOpen, setDayOpen] = useState(null);
  const skip = Object.entries(st.status || {}).filter(([, v]) => v === 'cancel').map(([id]) => id);
  const q = { date, dir, days, picks: JSON.stringify(st.picks || {}), skip: skip.join(',') };
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const key = JSON.stringify(q);
  const tick = useRefreshTick();
  useEffect(() => {
    const n = ++seq.current;
    setBusy(true);
    api.reschedulePlan(q)
      .then((p) => n === seq.current && (setPlan(p), setError(null)))
      .catch((e) => n === seq.current && (onError(e), setError(e)))
      .finally(() => n === seq.current && setBusy(false));
  }, [key, tick]);
  const teams = plan?.teams || [];
  const setPick = (id, s) => setSt((x) => {
    const picks = { ...(x.picks || {}) };
    if (s) picks[id] = { date: s.date, teamId: s.teamId, start: s.start, team: s.team };
    else delete picks[id];
    return { ...x, picks };
  });
  const answer = (row, v) => setSt((x) => {
    const id = row.booking.id;
    const status = { ...(x.status || {}), [id]: (x.status || {})[id] === v ? '' : v };
    const picks = { ...(x.picks || {}) };
    // Agreed locks the slot they agreed to.
    if (status[id] === 'agreed' && row.pick) picks[id] = { date: row.pick.date, teamId: row.pick.teamId, start: row.pick.start, team: row.pick.team };
    return { ...x, status, picks };
  });
  const rows = (plan?.date === date ? plan.rows : []) || [];
  const state = (r) => (st.status || {})[r.booking.id] || '';
  const groups = {
    call: rows.filter((r) => !state(r)),
    waiting: rows.filter((r) => ['noanswer', 'voicemail', 'other'].includes(state(r))),
    agreed: rows.filter((r) => state(r) === 'agreed'),
    cancel: rows.filter((r) => state(r) === 'cancel'),
    all: rows,
  };
  const sorted = groups.agreed.length + groups.cancel.length;
  const shown = groups[filter] || rows;
  const list = rows
    .map((r) => `${r.booking.home}: ${shortDay(date)} ${clock(r.booking.start)} (${r.booking.team}) → ${r.pick ? `${shortDay(r.pick.date)} ${clock(r.pick.start)} (${r.pick.team})` : r.skipped ? 'cancelled' : 'no time found'}${state(r) ? ` [${answerOf(state(r))?.label}]` : ''}${(st.notes || {})[r.booking.id] ? ` – ${st.notes[r.booking.id]}` : ''}`)
    .join('\n');

  return (
    <>
      <section className="card">
        <div className="card-body rs-day-setup">
          <div>
            <h2 className="rs-step"><span>1</span> Which day?</h2>
            <div className="rs-or">
              {nextWeekdays(10).map((d) => <button key={d} className={`chip ${date === d ? 'on' : ''}`} onClick={() => setDate(d)}>{shortDay(d)}</button>)}
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Another date" />
            </div>
          </div>
          <div className="rs-day-opts">
            <label className="field"><span>Why (goes in the messages)</span><input placeholder="e.g. the Thanksgiving holiday" value={st.reason || ''} onChange={(e) => setSt((x) => ({ ...x, reason: e.target.value }))} /></label>
            <Range dir={dir} setDir={setDir} days={days} setDays={setDays} />
          </div>
        </div>
      </section>
      <ErrorNote error={error} />
      {!plan && busy && <Skeleton rows={6} height={64} />}
      {plan?.date === date && !rows.length && <Empty icon="calendar" title={`No bookings on ${longDay(date)}`} />}
      {rows.length > 0 && (
        <div className={busy ? 'replanning' : ''}>
          <div className="rs-progress">
            <div>
              <b>{sorted} of {rows.length} sorted</b>
              <span className="muted small">{longDay(date)} · {rows.filter((r) => r.pick).length} new times found{plan.unplaced ? ` · ${plan.unplaced} need a manual look` : ''}</span>
            </div>
            <div className="progress"><i style={{ width: `${(sorted / rows.length) * 100}%` }} /></div>
            <CopyButton text={list} label="Copy the full list" small />
          </div>
          <div className="chip-row">
            {[['call', 'To call'], ['waiting', 'Waiting to hear back'], ['agreed', 'Agreed'], ['cancel', 'Cancelled'], ['all', 'All']].map(([k, l]) => (
              <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l} <span className="muted">{groups[k].length}</span></button>
            ))}
          </div>
          {!shown.length && <Empty icon="check" title={filter === 'call' ? 'Everyone has been called' : 'Nobody here'} />}
          <div className="rs-cards">
            {shown.map((r) => {
              const id = r.booking.id;
              const s = state(r);
              const msg = r.pick ? message(r.booking, date, r.pick, st.reason) : '';
              return (
                <div key={id} className={`rs-card ${s ? `is-${s}` : ''}`}>
                  <div className="rs-card-who">
                    <b>{r.booking.home}</b>
                    <span className="muted small">{r.booking.customer || ''}</span>
                    <span className="small"><span className="team-swatch" style={{ '--team': colorOf(teams, r.booking.teamId) }} />{clock(r.booking.start)} · {r.booking.team} · {r.booking.frequency ? plainFreq(r.booking.frequency).toLowerCase() : 'one-time'}</span>
                  </div>
                  <div className="rs-card-new">
                    {r.pick ? (
                      <>
                        <span className="muted small">Move to</span>
                        <b className="rs-new-time">{shortDay(r.pick.date)} · {clock(r.pick.start)}</b>
                        <span className="small"><span className="team-swatch" style={{ '--team': colorOf(teams, r.pick.teamId) }} />{r.pick.reasons?.length ? plainReason(r.pick) : r.pick.team}{r.pick.fixed ? ' · chosen by you' : ''}</span>
                        {warning(r.pick) && <span className="warn-text small">{warning(r.pick)}</span>}
                      </>
                    ) : r.skipped ? <b className="muted">Visit cancelled</b> : <b className="bad-text">No free time found: widen the range</b>}
                    {!r.skipped && (
                      <span className="rs-links">
                        <button className="linkish small" onClick={() => setOpen(open === id ? null : id)}>{open === id ? 'Hide other times' : 'Other times'}</button>
                        {r.pick && <button className="linkish small" onClick={() => setDayOpen(dayOpen === id ? null : id)}>{dayOpen === id ? 'Hide the day' : `See ${shortDay(r.pick.date)}`}</button>}
                      </span>
                    )}
                    {open === id && (
                      <div className="rs-alts">
                        {r.alternatives.map((a) => (
                          <button key={`${a.date}${a.teamId}${a.start}`} className="rs-slot" onClick={() => (setPick(id, a), setOpen(null))} title={plainReason(a)}>
                            <i style={{ background: colorOf(teams, a.teamId) }} />{shortDay(a.date)} {clock(a.start)}<span>{a.team}</span>
                          </button>
                        ))}
                        {r.pick?.fixed && <button className="rs-slot" onClick={() => setPick(id, null)}>Let it choose</button>}
                        {!r.alternatives.length && <span className="muted small">No other free times in range</span>}
                      </div>
                    )}
                  </div>
                  <div className="rs-card-act">
                    <div className="rs-answers compact">
                      {ANSWERS.map((a) => (
                        <button key={a.value} className={`rs-answer ${a.tone} ${s === a.value ? 'on' : ''}`} onClick={() => answer(r, a.value)} title={a.label}>
                          <Icon name={a.icon} size={14} /> <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="rs-card-tools">
                      {msg && <CopyButton text={msg} label="Copy message" small />}
                      <input className="call-note" placeholder="Note" value={(st.notes || {})[id] || ''} onChange={(e) => setSt((x) => ({ ...x, notes: { ...(x.notes || {}), [id]: e.target.value } }))} />
                    </div>
                  </div>
                  {dayOpen === id && r.pick && (
                    <div className="rs-card-gantt">
                      <DayGantt
                        date={r.pick.date}
                        teams={teams}
                        onError={onError}
                        added={rows
                          .filter((o) => o.pick && o.pick.date === r.pick.date)
                          .map((o) => ({ id: o.booking.id, home: o.booking.home, customer: o.booking.customer, teamId: o.pick.teamId, team: o.pick.team, start: o.pick.start, end: o.pick.end, primary: o.booking.id === id }))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ---------- The new date as a timeline ----------

const span = (s, e) => `${clock(s).replace(' AM', '').replace(' PM', '')}–${clock(e)}`;
const homeName = (h) => String(h || '').replace(/ Home$/i, '');
// Dark or white text, whichever reads better on a team colour.
const ink = (bg) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(bg || '').trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.62 ? '#1f2937' : '#fff';
};

// Every team's bookings on a date, with the moved booking(s) placed in (highlighted).
//   added: [{ id, home, customer, teamId, team, start, end, primary }]
//   hide: booking ids no longer on this date (moved within the same day)
function DayGantt({ date, added = [], hide = [], teams: knownTeams = [], onError, title }) {
  const day = useLoad(() => api.rescheduleDay(date), `rday:${date}`, onError);
  const d = day.data?.date === date ? day.data : null;
  if (!d) return <div className="gantt-wrap">{day.loading ? <Skeleton rows={4} height={36} /> : <ErrorNote error={day.error} />}</div>;
  const teams = [...(d.teams || []), ...knownTeams.filter((t) => !(d.teams || []).some((x) => x.id === t.id))];
  const hidden = new Set(hide.map(String));
  const items = [
    ...d.bookings.filter((b) => !hidden.has(String(b.id)) && !added.some((a) => String(a.id) === String(b.id))).map((b) => ({ ...b, isNew: false })),
    ...added.map((a) => ({ ...a, isNew: true })),
  ];
  const teamIds = [...new Set(items.map((b) => b.teamId))].sort((a, b) => {
    const na = items.find((x) => x.teamId === a)?.team || '';
    const nb = items.find((x) => x.teamId === b)?.team || '';
    // The team getting the new booking first, then by name.
    return (items.some((x) => x.teamId === b && x.primary) ? 1 : 0) - (items.some((x) => x.teamId === a && x.primary) ? 1 : 0) || na.localeCompare(nb);
  });
  const s0 = Math.floor(Math.min(8 * 60, ...items.map((b) => b.start)) / 60) * 60;
  const e0 = Math.ceil(Math.max(17 * 60, ...items.map((b) => b.end)) / 60) * 60;
  const x = (m) => ((m - s0) / (e0 - s0)) * 100;
  const hours = [];
  for (let h = s0; h <= e0; h += 60) hours.push(h);
  const primary = added.find((a) => a.primary) || added[0];
  const sameTeam = primary ? items.filter((b) => b.teamId === primary.teamId).sort((a, b) => a.start - b.start) : [];
  return (
    <div className="gantt-wrap">
      <div className="gantt-title">
        <b>{title || longDay(date)}</b>
        <span className="muted small">{items.length} bookings · {teamIds.length} teams{added.length ? ` · ${added.length} moved here` : ''}</span>
        <span className="gantt-key"><i className="k-new" />moved here</span>
      </div>
      <div className="gantt-scroll">
        <div className="gantt">
          <div className="gantt-axis">
            <span />
            <div>{hours.map((h) => <span key={h} style={{ left: `${x(h)}%` }}>{((h / 60 + 11) % 12) + 1}{h < 720 ? 'am' : 'pm'}</span>)}</div>
          </div>
          {teamIds.map((t) => {
            const row = items.filter((b) => b.teamId === t).sort((a, b) => a.start - b.start);
            const name = row[0]?.team || `Team ${t}`;
            const bg = colorOf(teams, t);
            const hasNew = row.some((b) => b.isNew);
            return (
              <div key={t} className={`gantt-row ${hasNew ? 'has-new' : ''}`}>
                <div className="gantt-team"><span className="team-swatch" style={{ '--team': bg }} /><b>{name}</b><span className="muted small">{row.length}</span></div>
                <div className="gantt-track">
                  {hours.map((h) => <i key={h} className="gantt-grid" style={{ left: `${x(h)}%` }} />)}
                  {row.map((b) => (
                    <div
                      key={`${b.id}${b.isNew ? 'n' : ''}`}
                      className={`gantt-job ${b.isNew ? 'is-new' : ''} ${b.isNew && !b.primary ? 'secondary' : ''}`}
                      style={{ left: `${x(b.start)}%`, width: `${Math.max(x(b.end) - x(b.start), 1)}%`, background: b.isNew ? undefined : bg, color: b.isNew ? undefined : ink(bg) }}
                      title={`${b.home}${b.customer ? ` · ${b.customer}` : ''}\n${clock(b.start)} – ${clock(b.end)}${b.isNew ? '\nMoved here' : ''}`}
                    >
                      <b>{b.isNew && <em>NEW</em>}{homeName(b.home)}</b>
                      <span>{span(b.start, b.end)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {primary && (
        <div className="gantt-list">
          <span className="muted small">{primary.team}'s day with the change:</span>
          {sameTeam.map((b) => (
            <span key={`${b.id}${b.isNew ? 'n' : ''}`} className={`gantt-stop ${b.isNew ? 'is-new' : ''}`}>
              <b>{span(b.start, b.end)}</b> {b.home}{b.customer ? ` · ${b.customer}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
