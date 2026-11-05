import { useEffect, useMemo, useState } from 'react';
import { api, today, shiftDay } from './api.js';
import { useRefreshTick } from './hooks.js';
import Icon from './Icon.jsx';
import { PageHeader, Stats, Skeleton, ErrorNote, Empty, Card, Help, plainFreq } from './ui.jsx';

// Price check: after a rate change, which customers still have the wrong price?
// Each booking's hourly rate = price ÷ (allowed hours ÷ 2), from MaidCentral's Dispatch
// Board, checked against the recurring and one-time rates. Read-only: prices are changed
// in MaidCentral; "Re-check" reads them again.

const $ = (n) => (n == null ? '–' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const rate$ = (n) => (n == null ? '–' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}/hr`);
const day = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};
const STATE = {
  low: { label: 'Below the rate', tone: 'bad' },
  high: { label: 'Above the rate', tone: 'warn' },
  'no-price': { label: 'Price is $0', tone: 'warn' },
  'no-hours': { label: 'No allowed hours', tone: 'warn' },
  hourly: { label: 'Billed hourly: check by hand', tone: 'info' },
  ok: { label: 'Correct', tone: 'ok' },
};

function useStored(key, initial) {
  const [v, setV] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* private window */
    }
  }, [key, v]);
  return [v, setV];
}

export default function Prices({ onError }) {
  const [rates, setRates] = useStored('prices:rates', { recurring: 122, oneTime: 130 });
  const [range, setRange] = useState({ from: today(), to: shiftDay(today(), 27) });
  const [done, setDone] = useStored('prices:done', {});
  const [filter, setFilter] = useState('fix');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [view, setView] = useState('day');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const load = (fresh = false) => {
    setBusy(true);
    setError(null);
    api
      .priceCheck({ from: range.from, to: range.to, recurring: rates.recurring, oneTime: rates.oneTime, ...(fresh ? { fresh: '1' } : {}) })
      .then(setData)
      .catch((e) => (onError(e), setError(e)))
      .finally(() => setBusy(false));
  };
  const tick = useRefreshTick();
  useEffect(() => {
    const t = setTimeout(() => load(false), 300);
    return () => clearTimeout(t);
  }, [range.from, range.to, rates.recurring, rates.oneTime, tick]);

  const list = useMemo(() => {
    if (!data) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.customers.filter((c) => {
      if (kind !== 'all' && c.kind !== kind) return false;
      if (words.length && !words.every((w) => `${c.customer} ${c.address}`.toLowerCase().includes(w))) return false;
      if (filter === 'fix') return c.state !== 'ok' && !done[c.key];
      if (filter === 'done') return c.state !== 'ok' && done[c.key];
      if (filter === 'ok') return c.state === 'ok';
      return true;
    });
  }, [data, q, kind, filter, done]);
  const toFix = data ? data.customers.filter((c) => c.state !== 'ok') : [];
  const doneCount = toFix.filter((c) => done[c.key]).length;
  const s = data?.summary;
  const copyText = toFix
    .filter((c) => !done[c.key])
    .map((c) => `${c.customer} (${plainFreq(c.frequency)}, ${c.allowedHours} allowed hrs): now ${$(c.price)} (${rate$(c.rate)}) → should be ${$(c.should)}${c.wrong > 1 ? ` · ${c.wrong} bookings` : ''}`)
    .join('\n');

  return (
    <>
      <PageHeader
        title="Price check"
        subtitle="After a rate change: is every booking at the right hourly rate? Each booking's rate is its price ÷ (allowed hours ÷ 2), the price per hour of a two-person team."
        actions={
          <button className="btn primary" onClick={() => load(true)} disabled={busy}>
            <Icon name="repeat" size={15} /> {busy ? 'Checking…' : 'Re-check MaidCentral'}
          </button>
        }
      />
      <Card>
        <div className="pc-controls">
          <label className="field"><span>Recurring rate</span><span className="pc-money"><b>$</b><input type="number" step="1" value={rates.recurring} onChange={(e) => setRates({ ...rates, recurring: Number(e.target.value) })} /><b>/hr</b></span></label>
          <label className="field"><span>One-time rate</span><span className="pc-money"><b>$</b><input type="number" step="1" value={rates.oneTime} onChange={(e) => setRates({ ...rates, oneTime: Number(e.target.value) })} /><b>/hr</b></span></label>
          <label className="field"><span>Bookings from</span><input type="date" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></label>
          <label className="field"><span>to</span><input type="date" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></label>
          <div className="pc-quick">
            {[[13, '2 weeks'], [27, '4 weeks'], [55, '8 weeks']].map(([n, l]) => (
              <button key={l} className={`chip ${range.from === today() && range.to === shiftDay(today(), n) ? 'on' : ''}`} onClick={() => setRange({ from: today(), to: shiftDay(today(), n) })}>Next {l}</button>
            ))}
          </div>
        </div>
        {data && <div className="muted small pc-checked">Read from MaidCentral at {new Date(data.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. After changing prices there, press Re-check.</div>}
      </Card>
      <ErrorNote error={error} />
      {!data && busy && <Skeleton rows={6} height={44} />}
      {data && (
        <div className={busy ? 'replanning' : ''}>
          <div className="pc-progress">
            <div>
              <b>{s.customersOk} of {s.customers} customers at the right rate</b>
              <span className="muted small">{s.ok} of {s.bookings} bookings between {day(data.from)} and {day(data.to)}{doneCount ? ` · ${doneCount} ticked off by you, waiting for Re-check` : ''}</span>
            </div>
            <div className="progress"><i style={{ width: `${(s.customersOk / Math.max(s.customers, 1)) * 100}%` }} /></div>
          </div>
          <Stats
            items={[
              { label: 'Customers to fix', value: s.customersToFix, tone: s.customersToFix ? 'bad' : 'ok', hint: `${s.wrong} bookings` },
              { label: 'Under-billed in this range', value: $(s.missingRevenue), tone: s.missingRevenue ? 'bad' : 'ok', hint: 'if left as they are', help: 'The difference between what the low-priced bookings are charged now and what they should be at your rates, for the dates shown.' },
              { label: 'Recurring at the right rate', value: `${s.byKind.recurring.ok} of ${s.byKind.recurring.bookings}`, hint: `bookings at ${rate$(data.rates.recurring)}` },
              { label: 'One-time at the right rate', value: `${s.byKind['one-time'].ok} of ${s.byKind['one-time'].bookings}`, hint: `bookings at ${rate$(data.rates.oneTime)}` },
            ]}
          />
          {Object.keys(s.leftOut || {}).length > 0 && (
            <p className="muted small pc-leftout">
              Not counted: {Object.entries(s.leftOut).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')} bookings. They won't happen: when a customer cancels, MaidCentral marks the visit already on the schedule as skipped; a moved booking leaves its old date behind. So their prices don't matter.
            </p>
          )}
          <div className="pc-found">
            <span className="muted small">Rates found:</span>
            {s.ratesFound.slice(0, 8).map((r) => {
              const right = r.rate === (r.kind === 'recurring' ? data.rates.recurring : data.rates.oneTime);
              return <span key={`${r.kind}${r.rate}`} className={`pill ${right ? 'ok' : 'bad'}`}>{r.kind === 'recurring' ? 'Recurring' : 'One-time'} {r.rate == null ? 'no hours' : rate$(r.rate)}: {r.bookings}</span>;
            })}
          </div>
          <div className="pc-views">
            <div className="segmented">
              <button className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}><Icon name="calendar" size={14} /> By day</button>
              <button className={view === 'customer' ? 'on' : ''} onClick={() => setView('customer')}><Icon name="users" size={14} /> By customer</button>
            </div>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">Recurring and one-time</option>
              <option value="recurring">Recurring only</option>
              <option value="one-time">One-time only</option>
            </select>
          </div>
          {view === 'day' && <ByDay data={data} kind={kind} />}
          {view === 'customer' && (
          <>
          <div className="pc-toolbar">
            <div className="chip-row">
              {[['fix', 'To fix', toFix.length - doneCount], ['done', 'Ticked off', doneCount], ['ok', 'Correct', s.customersOk], ['all', 'All', s.customers]].map(([k, l, n]) => (
                <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l} <span className="muted">{n}</span></button>
              ))}
            </div>
            <input className="pc-search" placeholder="Find a customer…" value={q} onChange={(e) => setQ(e.target.value)} />
            {copyText && <CopyList text={copyText} />}
          </div>
          <Card className="flush">
            {!list.length && <Empty icon="check" title={filter === 'fix' ? 'Nothing left to fix in this range' : 'Nobody here'}>{filter === 'fix' && doneCount ? 'Press Re-check to confirm the ones you ticked off.' : null}</Empty>}
            {list.length > 0 && (
              <div className="tablewrap">
                <table className="data pc-table">
                  <thead>
                    <tr><th>Customer</th><th>Frequency</th><th>Allowed hrs</th><th>Price now</th><th>Should be <Help>Your rate × (allowed hours ÷ 2).</Help></th><th>Bookings</th><th>Done</th></tr>
                  </thead>
                  <tbody>
                    {list.map((c) => {
                      const st = STATE[c.state];
                      const isOpen = open === c.key;
                      return [
                        <tr key={c.key} className={`clickable ${done[c.key] && c.state !== 'ok' ? 'pc-done' : ''}`} onClick={() => setOpen(isOpen ? null : c.key)}>
                          <td>
                            <b>{c.customer}</b>
                            <span className="muted small block">{c.address}</span>
                          </td>
                          <td>{plainFreq(c.frequency)}<span className="muted small block">{c.kind === 'recurring' ? `at ${rate$(c.target)}` : `one-time at ${rate$(c.target)}`}</span></td>
                          <td>{c.allowedHours}</td>
                          <td>
                            <b className={c.state === 'ok' ? '' : `${st.tone}-text`}>{$(c.price)}</b>
                            <span className="small block"><span className={`pill ${st.tone}`}>{c.state === 'ok' ? rate$(c.rate) : `${rate$(c.rate)} · ${st.label}`}</span></span>
                          </td>
                          <td>
                            {c.state === 'ok' ? <span className="ok-text">✓ right</span> : <b className="ok-text">{$(c.should)}</b>}
                            {c.state !== 'ok' && c.should != null && c.price > 0 && <span className="muted small block">{c.should > c.price ? '+' : '−'}{$(Math.abs(c.should - c.price))} per visit</span>}
                          </td>
                          <td>
                            {c.state === 'ok' ? `${c.bookings.length} correct` : `${c.wrong} of ${c.bookings.length} wrong`}
                            <span className="muted small block">{c.firstWrong ? `first: ${day(c.firstWrong.date)}` : `next: ${day(c.next.date)}`}</span>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {c.state !== 'ok' && (
                              <label className="check" title="Tick when you've changed it in MaidCentral">
                                <input type="checkbox" checked={Boolean(done[c.key])} onChange={(e) => setDone((d) => { const n = { ...d }; if (e.target.checked) n[c.key] = Date.now(); else delete n[c.key]; return n; })} />
                                {done[c.key] ? 'Changed' : ''}
                              </label>
                            )}
                          </td>
                        </tr>,
                        isOpen && (
                          <tr key={`${c.key}-detail`} className="pc-detail">
                            <td colSpan={7}>
                              <div className="pc-bookings">
                                {c.bookings.map((b) => (
                                  <span key={b.jobId} className={`pc-booking ${b.state === 'ok' ? 'ok' : 'bad'}`}>
                                    <b>{day(b.date)} {b.time}</b> · {b.team} · {$(b.price)} = {rate$(b.rate)} {b.state === 'ok' ? '✓' : `→ ${$(b.should)}`}
                                    <span className="muted small"> job {b.jobId}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          </>
          )}
          <p className="muted small">
            Rate = price ÷ (allowed hours ÷ 2): MaidCentral's allowed hours are cleaner-hours, and the hourly rate is for a two-person team (e.g. $305 for 5.00 allowed hours = $122/hr). Bookings
            within $1 of the rate count as right; cancelled bookings are left out. Your ticks stay on this device; Re-check reads the prices from MaidCentral again.
          </p>
        </div>
      )}
    </>
  );
}

function CopyList({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(text).then(() => (setOk(true), setTimeout(() => setOk(false), 1800)))}>
      <Icon name={ok ? 'check' : 'note'} size={14} /> {ok ? 'Copied' : 'Copy the to-fix list'}
    </button>
  );
}

// Each day in the range: how many bookings are at the right rate, and which aren't.
function ByDay({ data, kind }) {
  const [open, setOpen] = useState(() => new Set());
  const all = data.customers.flatMap((c) => c.bookings.map((b) => ({ ...b, customer: c.customer })));
  const bookings = all.filter((b) => kind === 'all' || b.kind === kind);
  const days = [...new Set(bookings.map((b) => b.date))].sort().map((d) => {
    const list = bookings.filter((b) => b.date === d).sort((a, b) => toMin(a.time) - toMin(b.time));
    const ok = list.filter((b) => b.state === 'ok').length;
    const wrong = list.filter((b) => b.state !== 'ok');
    const share = ok / list.length;
    const status = !wrong.length ? 'done' : share >= 0.8 ? 'nearly' : share >= 0.2 ? 'partly' : 'none';
    return { date: d, list, ok, wrong, status, short: wrong.filter((b) => b.state === 'low').reduce((s2, b) => s2 + (b.should - b.price), 0) };
  });
  const label = { done: 'All updated', nearly: 'Nearly done', partly: 'Partly updated', none: 'Mostly not updated' };
  const tone = { done: 'ok', nearly: 'info', partly: 'warn', none: 'bad' };
  const counts = Object.fromEntries(['done', 'nearly', 'partly', 'none'].map((k) => [k, days.filter((x) => x.status === k).length]));
  const toggle = (d) => setOpen((o) => {
    const n = new Set(o);
    n.has(d) ? n.delete(d) : n.add(d);
    return n;
  });
  return (
    <>
      <div className="pc-daykey">
        <span className="pill ok">{counts.done} all updated</span>
        <span className="pill info">{counts.nearly} nearly done (80%+)</span>
        <span className="pill warn">{counts.partly} partly updated</span>
        <span className="pill bad">{counts.none} mostly not updated (under 20%)</span>
        <span className="muted small">Tap a day to see the bookings still at the wrong price.</span>
      </div>
      <Card className="flush">
        {days.map((x) => {
          const isOpen = open.has(x.date);
          return (
            <div key={x.date} className={`pc-day ${x.status}`}>
              <button className="pc-day-row" onClick={() => toggle(x.date)} disabled={!x.wrong.length}>
                <b className="pc-day-date">{day(x.date)}</b>
                <span className="pc-day-bar"><i style={{ width: `${(x.ok / x.list.length) * 100}%` }} /></span>
                <span className="pc-day-count"><b>{x.ok}</b> of {x.list.length} correct</span>
                <span className={`pill ${tone[x.status]}`}>{label[x.status]}</span>
                <span className="muted small pc-day-fix">{x.wrong.length ? `${x.wrong.length} to fix${x.short > 0 ? ` · ${$(x.short)} under` : ''}` : ''}</span>
                {x.wrong.length > 0 && <Icon name={isOpen ? 'close' : 'chevronRight'} size={15} />}
              </button>
              {isOpen && (
                <div className="pc-day-list">
                  {x.wrong.map((b) => (
                    <div key={b.jobId} className="pc-day-item">
                      <span className="mono">{b.time}</span>
                      <b>{b.customer}</b>
                      <span className="muted small">{b.team} · {plainFreq(b.frequency)} · {b.allowedHours} hrs</span>
                      <span><span className={`${STATE[b.state].tone}-text`}>{$(b.price)} ({rate$(b.rate)})</span>{b.should != null && b.state !== 'hourly' ? <> → <b className="ok-text">{$(b.should)}</b></> : ''}</span>
                      <span className={`pill ${STATE[b.state].tone}`}>{STATE[b.state].label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!days.length && <Empty icon="calendar" title="No bookings in this range" />}
      </Card>
    </>
  );
}
const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(t || ''));
  return m ? ((Number(m[1]) % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]) : 0;
};
