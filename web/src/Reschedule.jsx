import { useEffect, useRef, useState } from 'react';
import { api, today, shiftDay, dayLabel } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import Icon from './Icon.jsx';
import { PageHeader, Stats, Skeleton, ErrorNote, Empty, Card, Help, plainFreq } from './ui.jsx';

// Rescheduling: pick a date, then either one booking (the everyday case: a customer needs
// another day) or the whole day (a holiday). The best slots come from the routes around
// that date. What the office enters stays on this device. Changes are made in MaidCentral.

const shortDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};
const clock = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(Math.round(m) % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
const away = (n) => (n === 0 ? 'same day' : `${Math.abs(n)} day${Math.abs(n) === 1 ? '' : 's'} ${n < 0 ? 'before' : 'after'}`);
const STATUS = [
  { value: '', label: 'Not called yet' },
  { value: 'agreed', label: 'Agreed: book it' },
  { value: 'other', label: 'Wants another option' },
  { value: 'noanswer', label: 'No answer' },
  { value: 'voicemail', label: 'Left voicemail' },
  { value: 'cancel', label: 'Skip / cancel this visit' },
];
const STATUS_TONE = { agreed: 'ok', other: 'warn', noanswer: 'warn', voicemail: 'info', cancel: 'bad' };

const blank = { picks: {}, status: {}, notes: {} };
function loadState(date) {
  try {
    return { ...blank, ...JSON.parse(localStorage.getItem(`reschedule:${date}`) || '{}') };
  } catch {
    return blank;
  }
}
function saveState(date, s) {
  try {
    localStorage.setItem(`reschedule:${date}`, JSON.stringify(s));
  } catch {
    /* private window */
  }
}

export default function Reschedule({ onError }) {
  const [date, setDate] = useState(() => shiftDay(today(), 1));
  const [st, setSt] = useState(() => loadState(shiftDay(today(), 1)));
  const [dir, setDir] = useState('either');
  const [days, setDays] = useState('7');
  const [sameDay, setSameDay] = useState(false);
  const [mode, setMode] = useState('one');
  const [job, setJob] = useState(null);
  const [filter, setFilter] = useState('');
  useEffect(() => saveState(date, st), [date, st]);
  const changeDate = (d) => {
    if (!d) return;
    setDate(d);
    setSt(loadState(d));
    setJob(null);
  };
  const day = useLoad(() => api.rescheduleDay(date), `rday:${date}`, onError);
  const data = day.data?.date === date ? day.data : null;
  const teams = data?.teams || [];
  const colorOf = (teamId) => teamColor(teams.find((t) => t.id === teamId) || {}).bg;
  const setPick = (id, slot) => setSt((s) => {
    const picks = { ...s.picks };
    if (slot) picks[id] = { date: slot.date, teamId: slot.teamId, start: slot.start, team: slot.team, label: slot.label, weekday: slot.weekday };
    else delete picks[id];
    return { ...s, picks };
  });
  const setStatus = (id, v) => setSt((s) => ({ ...s, status: { ...s.status, [id]: v } }));
  const setNote = (id, v) => setSt((s) => ({ ...s, notes: { ...s.notes, [id]: v } }));
  const common = { date, dir, days, sameDay: String(sameDay) };
  const bookings = (data?.bookings || []).filter((b) => !filter || `${b.title} ${b.team} ${b.area || ''}`.toLowerCase().includes(filter.toLowerCase()));
  const done = Object.values(st.status).filter((v) => v === 'agreed' || v === 'cancel').length;

  return (
    <>
      <PageHeader
        title="Reschedule"
        subtitle="Move one booking, or a whole day (like a holiday), to the best free slots on the days around it: near where a team already is, with their own team and usual time where possible."
        actions={
          <div className="resched-date">
            <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} aria-label="Date" />
            <div className="segmented">
              <button className={mode === 'one' ? 'on' : ''} onClick={() => setMode('one')}>One booking</button>
              <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>Whole day</button>
            </div>
          </div>
        }
      />
      <div className="resched-settings">
        <label className="inline-field">Move to
          <select value={dir} onChange={(e) => setDir(e.target.value)}>
            <option value="either">before or after</option>
            <option value="before">before only</option>
            <option value="after">after only</option>
          </select>
        </label>
        <label className="inline-field">within
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            {['3', '5', '7', '10', '14'].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={sameDay} onChange={(e) => setSameDay(e.target.checked)} /> Also other times on {shortDay(date)}</label>
        <span className="muted small">{dayLabel(date)} · {data ? `${data.bookings.length} bookings` : '…'}{done ? ` · ${done} sorted` : ''}</span>
      </div>
      <ErrorNote error={day.error} />
      {!data && !day.error && <Skeleton rows={6} height={44} />}
      {data && !data.bookings.length && <Empty icon="calendar" title={`No bookings on ${dayLabel(date)}`}>Choose another date.</Empty>}
      {data && data.bookings.length > 0 && mode === 'one' && (
        <div className="resched-grid">
          <Card title={<>Bookings on {shortDay(date)} <Help>Click the booking to move. A tick means you've already found its new slot.</Help></>} className="flush">
            <div className="resched-filter"><input placeholder="Find a customer…" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
            <div className="resched-list">
              {bookings.map((b) => (
                <button key={b.id} className={`resched-row ${job === b.id ? 'on' : ''}`} onClick={() => setJob(b.id)}>
                  <span className="team-swatch" style={{ '--team': colorOf(b.teamId) }} />
                  <span className="resched-main">
                    <b>{b.home}</b>
                    <span className="muted small">{clock(b.start)} · {b.team}{b.area ? ` · ${b.area}` : ''}{b.frequency ? ` · ${plainFreq(b.frequency)}` : ''}</span>
                  </span>
                  {st.picks[b.id] ? <span className="pill ok"><Icon name="check" size={12} /> {shortDay(st.picks[b.id].date)}</span> : st.status[b.id] ? <span className={`pill ${STATUS_TONE[st.status[b.id]]}`}>{STATUS.find((x) => x.value === st.status[b.id])?.label}</span> : null}
                </button>
              ))}
              {!bookings.length && <Empty icon="search" title="No booking matches" />}
            </div>
          </Card>
          {job ? (
            <Options key={`${job}:${dir}:${days}:${sameDay}`} q={{ ...common, job, picks: JSON.stringify(Object.fromEntries(Object.entries(st.picks).filter(([id]) => String(id) !== String(job)))) }} picked={st.picks[job]} onPick={(s) => setPick(job, s)} status={st.status[job] || ''} setStatus={(v) => setStatus(job, v)} note={st.notes[job] || ''} setNote={(v) => setNote(job, v)} colorOf={colorOf} onError={onError} />
          ) : (
            <Card><Empty icon="calendar" title="Choose a booking">Its best new slots appear here, ranked.</Empty></Card>
          )}
        </div>
      )}
      {data && data.bookings.length > 0 && mode === 'day' && <DayPlan common={common} st={st} setPick={setPick} setStatus={setStatus} setNote={setNote} colorOf={colorOf} onError={onError} date={date} />}
      <p className="muted small">Slots fit into a team's route on that day: driving from the job before (or the office at 8:15 AM), the clean, and on to the next job or back by the return time. Drive times are estimates. Nothing changes until you move the booking in MaidCentral.</p>
    </>
  );
}

function SlotCard({ s, colorOf, onPick, chosen, rank }) {
  return (
    <div className={`slot place ${chosen ? 'best' : ''}`}>
      <div className="slot-when">
        <b>{s.weekday.slice(0, 3)} {shortDay(s.date).split(', ').slice(1).join(', ') || shortDay(s.date)}</b>
        <span>{s.label}</span>
        <span className="muted small">{away(s.daysAway)}</span>
      </div>
      <div className="slot-team">
        <b><span className="team-swatch" style={{ '--team': colorOf(s.teamId) }} />{s.team}</b>
        <span className="muted small">after {s.between?.[0]} · before {s.between?.[1]}</span>
      </div>
      <div className="slot-reasons">
        {rank === 0 && <span className="pill info">Best</span>}
        {(s.reasons || []).map((x, n) => <span key={n} className={`pill ${x.tone === 'good' ? 'ok' : x.tone === 'warn' ? 'warn' : ''}`}>{x.text}</span>)}
      </div>
      <button className={`btn ${chosen ? 'primary' : 'ghost'} sm`} onClick={onPick}>{chosen ? 'Chosen' : 'Use this'}</button>
    </div>
  );
}

function Options({ q, picked, onPick, status, setStatus, note, setNote, colorOf, onError }) {
  const r = useLoad(() => api.rescheduleOptions(q), `ropt:${JSON.stringify(q)}`, onError);
  const o = r.data;
  return (
    <Card
      title={o ? <>Best new slots for <b>{o.booking.home}</b></> : 'Best new slots'}
      actions={o && <span className="muted small">was {o.booking.label} · {o.booking.team} · {o.booking.cleanerHours} cleaner-h</span>}
      className="flush"
    >
      {r.loading && <Skeleton rows={6} height={54} />}
      <ErrorNote error={r.error} />
      {o && (
        <>
          <div className="resched-call">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="What the customer said">
              {STATUS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
            <input className="call-note" placeholder="Note (e.g. prefers mornings)" value={note} onChange={(e) => setNote(e.target.value)} />
            {picked && <span className="muted small">Chosen: {shortDay(picked.date)} {picked.label} with {picked.team} <button className="linkish" onClick={() => onPick(null)}>clear</button></span>}
          </div>
          {!o.slots.length && <Empty icon="alert" title="No slot fits">Try more days, the other direction, or allow other times on the same day.</Empty>}
          <div className="slot-list">
            {o.slots.map((s, i) => (
              <SlotCard key={`${s.date}${s.teamId}`} s={s} rank={i} colorOf={colorOf} chosen={picked && picked.date === s.date && picked.teamId === s.teamId} onPick={() => onPick(s)} />
            ))}
          </div>
          {o.considered > o.slots.length && <p className="muted small resched-more">{o.considered - o.slots.length} more slots, further away or with more driving.</p>}
        </>
      )}
    </Card>
  );
}

function DayPlan({ common, st, setPick, setStatus, setNote, colorOf, onError, date }) {
  // Office choices (and agreed ones) are fixed; everything else is planned around them.
  const fixed = JSON.stringify(st.picks);
  const skip = Object.entries(st.status).filter(([, v]) => v === 'cancel').map(([id]) => id);
  const q = { ...common, picks: fixed, skip: skip.join(',') };
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const key = JSON.stringify(q);
  useEffect(() => {
    const n = ++seq.current;
    setBusy(true);
    api.reschedulePlan(q)
      .then((p) => n === seq.current && (setPlan(p), setError(null)))
      .catch((e) => n === seq.current && (onError(e), setError(e)))
      .finally(() => n === seq.current && setBusy(false));
  }, [key]);
  const [copied, setCopied] = useState(false);
  if (!plan) return <>{busy && <Skeleton rows={8} height={50} />}<ErrorNote error={error} /></>;
  const rows = plan.rows.filter((r) => !skip.includes(String(r.booking.id)));
  const agreed = rows.filter((r) => st.status[r.booking.id] === 'agreed').length;
  const toCall = rows.filter((r) => !st.status[r.booking.id]).length;
  const copy = () => {
    const text = plan.rows
      .map((r) => `${r.booking.home}: ${shortDay(date)} ${clock(r.booking.start)} (${r.booking.team}) → ${r.pick ? `${shortDay(r.pick.date)} ${clock(r.pick.start)} (${r.pick.team})` : 'no slot found'}${st.status[r.booking.id] ? ` [${STATUS.find((x) => x.value === st.status[r.booking.id])?.label}]` : ''}${st.notes[r.booking.id] ? ` - ${st.notes[r.booking.id]}` : ''}`)
      .join('\n');
    navigator.clipboard?.writeText(text).then(() => (setCopied(true), setTimeout(() => setCopied(false), 2000)));
  };
  return (
    <div className={busy ? 'replanning' : ''}>
      <Stats
        items={[
          { label: 'Bookings to move', value: rows.length, hint: skip.length ? `${skip.length} skipped` : dayLabel(date) },
          { label: 'Slots found', value: `${rows.filter((r) => r.pick).length} of ${rows.length}`, tone: rows.some((r) => !r.pick) ? 'warn' : 'ok', hint: 'no two in the same place' },
          { label: 'Agreed', value: agreed, tone: agreed === rows.length ? 'ok' : '' },
          { label: 'Still to call', value: toCall, tone: toCall ? 'warn' : 'ok' },
        ]}
      />
      <Card
        title={<>Plan for {shortDay(date)} <Help wide>Each booking gets the best slot that's still free after the others: the hardest to place go first. Choose an alternative to fix it there; everything else is re-planned around it. Marking a customer "Agreed" locks their slot. "Skip / cancel" takes them out of the plan.</Help></>}
        actions={<button className="btn ghost sm" onClick={copy}><Icon name="note" size={14} /> {copied ? 'Copied' : 'Copy the list'}</button>}
        className="flush"
      >
        <div className="tablewrap">
          <table className="data resched-plan">
            <thead><tr><th>Booking</th><th>Move to</th><th>Why</th><th>Customer said</th></tr></thead>
            <tbody>
              {plan.rows.map((r) => {
                const id = r.booking.id;
                const status = st.status[id] || '';
                const skipped = status === 'cancel';
                return (
                  <tr key={id} className={skipped ? 'muted-row' : ''}>
                    <td>
                      <span className="team-swatch" style={{ '--team': colorOf(r.booking.teamId) }} /><b>{r.booking.home}</b>
                      <span className="muted small block">{clock(r.booking.start)} · {r.booking.team}{r.booking.frequency ? ` · ${plainFreq(r.booking.frequency)}` : ''}</span>
                    </td>
                    <td>
                      {r.pick ? (
                        <>
                          <b>{r.pick.weekday.slice(0, 3)} {shortDay(r.pick.date).replace(/^\w+, /, '')}</b> {clock(r.pick.start)}
                          <span className="muted small block"><span className="team-swatch" style={{ '--team': colorOf(r.pick.teamId) }} />{r.pick.team} · {away(r.pick.daysAway)}{r.pick.fixed ? ' · chosen' : ''}</span>
                        </>
                      ) : skipped ? <span className="muted">Skipped</span> : <span className="bad-text">No slot found</span>}
                      {!skipped && (r.alternatives.length > 0 || r.pick?.fixed) && (
                        <select
                          className="alt-select"
                          value=""
                          onChange={(e) => {
                            if (e.target.value === 'auto') return setPick(id, null);
                            const s = r.alternatives[Number(e.target.value)];
                            if (s) setPick(id, s);
                          }}
                        >
                          <option value="">Other options…</option>
                          {r.pick?.fixed && <option value="auto">Let the plan choose</option>}
                          {r.alternatives.map((s, i) => <option key={i} value={i}>{s.weekday.slice(0, 3)} {shortDay(s.date).replace(/^\w+, /, '')} {clock(s.start)} · {s.team} (+{s.extraDriveMin} min drive)</option>)}
                        </select>
                      )}
                    </td>
                    <td className="small">{(r.pick?.reasons || []).slice(0, 3).map((x, n) => <span key={n} className={`pill ${x.tone === 'good' ? 'ok' : x.tone === 'warn' ? 'warn' : ''}`}>{x.text}</span>)}</td>
                    <td>
                      <select
                        className={status ? `tone-${STATUS_TONE[status]}` : ''}
                        value={status}
                        onChange={(e) => {
                          const v = e.target.value;
                          setStatus(id, v);
                          if (v === 'agreed' && r.pick && !r.pick.fixed) setPick(id, r.pick);
                        }}
                      >
                        {STATUS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                      </select>
                      <input className="call-note" placeholder="Note" value={st.notes[id] || ''} onChange={(e) => setNote(id, e.target.value)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
