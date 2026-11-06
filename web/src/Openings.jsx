import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import Icon from './Icon.jsx';
import CapacityTab from './Capacity.jsx';
import { PageHeader, Stats, Tabs, Skeleton, ErrorNote, Empty, Card, Help, plainFreq } from './ui.jsx';

// Frequency colours (MaidCentral's own, from the jobs on the board), with fallbacks.
const FIT_COLOR = { Weekly: '#92B558', 'Every 2 weeks': '#005960', 'Every 4 weeks': '#578CAC', 'One-time': '#d2691e', 'On demand': '#c48f65' };
// Labels inside the small open blocks on the 4-week plan.
const FIT_SHORT = { Weekly: 'wkly', 'Every 2 weeks': '2 wk', 'Every 4 weeks': '4 wk', 'One-time': '1×' };
const FIT_LONG = { Weekly: 'open weekly', 'Every 2 weeks': 'open every other wk', 'Every 4 weeks': 'open every 4 wks', 'One-time': 'free this date only' };
// "Good for…" wording for an opening's frequency.
const GOOD_FOR = { Weekly: 'Weekly customer', 'Every 2 weeks': 'Every-other-week customer', 'Every 4 weeks': 'Every-4-weeks customer', 'One-time': 'One-time clean (this date only)' };
const hhmm = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}${m % 60 ? `:${String(m % 60).padStart(2, '0')}` : ''}${m < 720 ? 'a' : 'p'}`;
const fullTime = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
const shortDate = (iso) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' });
};
// Monday of this week: the 4-week cycle starts there.
const monday = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Openings: where recurring work can be added, by frequency and area, over a 4-week cycle.
export default function Openings({ onError, initialTab = 'plan' }) {
  const [tab, setTab] = useState(initialTab);
  // An opening picked anywhere on the page, shown on the 4-week plan.
  const [highlight, setHighlight] = useState(null);
  const openInPlan = (o, s = o.start, e = o.end) => {
    setHighlight({ teamId: o.teamId, team: o.team, weekday: o.weekday, dates: o.dates, s, e, fit: o.fit, label: o.label, area: o.area?.name || o.area?.zone || null });
    setTab('plan');
  };
  const [from] = useState(monday());
  const [minHours, setMinHours] = useState('1.5');
  const o = useLoad(() => api.openings({ from, minHours }), `${from}:${minHours}`, onError);
  const d = o.data;
  // While MaidCentral's schedules are being read, show how far along it is.
  const [prog, setProg] = useState(null);
  useEffect(() => {
    if (!o.loading) return setProg(null);
    const t = setInterval(() => api.openingsStatus().then((r) => setProg(r.progress)).catch(() => {}), 800);
    return () => clearInterval(t);
  }, [o.loading]);
  const weekly = d ? d.openings.reduce((s, x) => s + x.weeklyHours, 0) : 0;

  return (
    <>
      <PageHeader
        title="Openings"
        subtitle={`Where we can add repeat customers: each team's free time over the next 4 weeks, by area. Teams are back at the office by ${d?.returnBy || '4:45 PM'}.`}
        actions={tab === 'capacity' ? null : (
          <label className="inline-field">
            Shortest job
            <select value={minHours} onChange={(e) => setMinHours(e.target.value)}>
              {['1', '1.5', '2', '2.5', '3'].map((h) => <option key={h} value={h}>{h} h</option>)}
            </select>
          </label>
        )
        }
      />
      {d && (
        <Stats
          items={[
            { label: 'Hours to sell, per week', value: `${Math.round(weekly)} h`, help: 'All open time added up as if it were weekly work. An every-other-week opening counts half, an every-4-weeks opening a quarter.' },
            { label: 'For weekly customers', value: d.openings.filter((x) => x.weeks === 1).length, hint: 'openings', help: 'Time a team has free on the same day and time every week.' },
            { label: 'For every-other-week', value: d.openings.filter((x) => x.weeks === 2).length, hint: 'openings', help: 'Time free in weeks 1 & 3 (or 2 & 4). A new every-other-week customer slots in alongside the ones already booked in the other weeks.' },
            { label: 'For every-4-weeks', value: d.openings.filter((x) => x.weeks === 4).length, hint: 'openings', help: 'Time free in just one week of the four.' },
            { label: 'Jobs on the map', value: `${Math.round((d.book.matchedJobs / Math.max(d.book.totalJobs, 1)) * 100)}%`, hint: `${d.book.homes} repeat homes`, help: "How many upcoming jobs we could place on the map using MaidCentral's customer locations. Areas and drive times come from these." },
          ]}
        />
      )}
      <Tabs value={tab} onChange={setTab} tabs={[['plan', '4-week plan'], ['sell', 'Where to sell'], ['place', 'Place a customer'], ['capacity', 'Capacity']]} />
      {tab !== 'capacity' && <ErrorNote error={o.error} />}
      {o.loading && tab !== 'capacity' && (
        <div className="loading-card">
          <b>{!prog ? 'Getting your openings from MaidCentral…' : prog.stage === 'locations' ? 'Loading customer locations and areas…' : `Reading the schedule: week ${Math.min(Math.floor(prog.done / 7) + 1, 4)} of 4`}</b>
          <div className="progress"><i style={{ width: `${!prog ? 4 : prog.stage === 'locations' ? 12 : 12 + (prog.done / prog.total) * 88}%` }} /></div>
          <span className="muted small">This only takes a while the first time; after that it's kept up to date in the background.</span>
        </div>
      )}
      {d && tab === 'plan' && <CyclePlan data={d} highlight={highlight} onClear={() => setHighlight(null)} />}
      {d && tab === 'sell' && <WhereToSell data={d} onOpen={openInPlan} />}
      {tab === 'capacity' && <CapacityTab from={from} onError={onError} />}
      {tab === 'place' && <PlaceCustomer from={from} zones={d?.zones || []} onError={onError} onOpen={(r) => openInPlan(r, r.arriveMin ?? r.start, r.doneMin ?? r.end)} />}
    </>
  );
}

// ---------- 4-week plan ----------

function CyclePlan({ data, highlight, onClear }) {
  const [team, setTeam] = useState('all');
  const [focus, setFocus] = useState('all'); // highlight a frequency
  const hlRow = useRef(null);
  // Scroll the picked opening's team row into view.
  useEffect(() => {
    if (highlight && hlRow.current) hlRow.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);
  const isHl = (t, dt) => highlight && t.id === highlight.teamId && highlight.dates.includes(dt);
  const { weeks, weekdays, teams } = data.cycle;
  // The bar covers the working day (8 AM–5 PM), wider only if a booked job falls outside it,
  // so short openings get as much room as possible.
  const spans = teams.flatMap((t) => Object.values(t.days).filter(Boolean).flatMap((d) => [...d.jobs, ...d.open]));
  const dayStart = Math.min(8 * 60, ...spans.map((x) => Math.floor(x.s / 60) * 60));
  const dayEnd = Math.max(17 * 60, ...spans.map((x) => Math.ceil(x.e / 60) * 60));
  const hourLabel = (m) => `${((m / 60 + 11) % 12) + 1} ${m < 720 ? 'AM' : 'PM'}`;
  const pct = (m) => ((Math.min(Math.max(m, dayStart), dayEnd) - dayStart) / (dayEnd - dayStart)) * 100;
  const shown = teams.filter((t) => team === 'all' || String(t.id) === team);
  const datesFor = (weekday) => weeks.map((w) => {
    const start = new Date(`${w.from}T00:00:00Z`);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(start.getTime() + i * 86400000);
      if (dt.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) === weekday) return dt.toISOString().slice(0, 10);
    }
    return null;
  });
  const freqColors = useMemo(() => {
    const m = { ...FIT_COLOR };
    for (const t of teams) for (const day of Object.values(t.days)) for (const j of day?.jobs || []) if (j.frequency && j.color) m[j.frequency] = j.color;
    return m;
  }, [teams]);

  return (
    <>
      {highlight && (
        <div className="hl-banner">
          <Icon name="pin" size={16} />
          <span>
                        <b>{highlight.weekday}s {fullTime(highlight.s)} – {fullTime(highlight.e)}</b> · {highlight.team} · good for an {plainFreq(highlight.fit).toLowerCase()} customer
            {highlight.area ? ` · ${highlight.area}` : ''} · {highlight.dates.map(shortDate).join(', ')}
          </span>
          <button className="btn ghost sm" onClick={onClear}>Clear</button>
        </div>
      )}
      <div className="toolbar">
        <select value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="all">All teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="chips">
          {['all', 'Weekly', 'Every 2 weeks', 'Every 4 weeks', 'One-time'].map((f) => (
            <button key={f} className={focus === f ? 'chip on' : 'chip'} onClick={() => setFocus(f)}>
              {f !== 'all' && <i className="dot" style={{ background: freqColors[f] }} />}
              {f === 'all' ? 'All' : plainFreq(f)}
            </button>
          ))}
        </div>
      </div>
      <Card className="flush">
        <div className="cycle-legend">
          {['Weekly', 'Every 2 weeks', 'Every 4 weeks', 'One-time'].map((f) => <span key={f}><i style={{ background: freqColors[f] }} />{plainFreq(f)} job</span>)}
          <span><i className="hatch" />Free time (the label says which customers it suits)</span>
          <span><i className="k-skipped" />Not here this date: skipped, moved, cancelled or on another team (hover for which; still their spot)</span>
          <span><i className="k-extra" />Moved here or one-time (hover for where from)</span>
          <span className="muted">Each bar is one team's day, {hourLabel(dayStart)}–{hourLabel(dayEnd)}</span>
          <Help wide>Read across a row to see a team's next 4 weeks on that weekday. Openings come from MaidCentral's Master Schedule (the recurring pattern), so a skipped visit doesn't open a recurring spot and a booking moved into a gap doesn't hide one. Coloured blocks are recurring customers (by how often they're cleaned); an outlined block is a customer who skipped that date (still their spot); a striped block is a booking moved there or a one-time clean. Dashed blocks are free time: "wkly" free every week, "2 wk" free in alternate weeks (weeks 1 & 3 or 2 & 4), "4 wk" once in the cycle, "1×" free on that date only. A crossed-out opening is taken that date by a moved or one-time booking; the first visit starts the next free date.</Help>
        </div>
        <div className="tablewrap plain">
          <table className="cycle">
            <thead>
              <tr>
                <th className="sticky">Team</th>
                {weeks.map((w) => <th key={w.label}>{w.label}<span>{shortDate(w.from)} – {shortDate(w.to)}</span></th>)}
              </tr>
            </thead>
            {weekdays.map((wd) => {
              const dates = datesFor(wd);
              return (
                <tbody key={wd}>
                  <tr className="cycle-day">
                    <td className="sticky"><b>{wd}</b></td>
                    {dates.map((dt) => <td key={dt}><span className="muted small">{dt ? shortDate(dt) : ''}</span></td>)}
                  </tr>
                  {shown.map((t) => {
                    const c = teamColor(t);
                    const rowHl = highlight && t.id === highlight.teamId && wd === highlight.weekday;
                    return (
                      <tr key={t.id} ref={rowHl ? hlRow : undefined} className={rowHl ? 'hl-row' : ''}>
                        <td className="sticky nowrap"><span className="team-swatch" style={{ '--team': c.bg }} />{t.name}</td>
                        {dates.map((dt) => {
                          const day = dt && t.days[dt];
                          if (!day) return <td key={dt} className="cycle-cell off"><span className="muted small">off</span></td>;
                          return (
                            <td key={dt} className={`cycle-cell ${isHl(t, dt) ? 'hl' : ''}`}>
                              <div className="cbar" style={{ '--hours': (dayEnd - dayStart) / 60 }}>
                                {isHl(t, dt) && <div className="cbar-hl" style={{ left: `${pct(highlight.s)}%`, width: `${pct(highlight.e) - pct(highlight.s)}%` }} />}
                                {day.window && <div className="cbar-window" style={{ left: `${pct(day.window.s)}%`, width: `${pct(day.window.e) - pct(day.window.s)}%` }} />}
                                {day.jobs.map((j, i) => {
                                  const f = j.frequency || 'Unknown';
                                  const dim = focus !== 'all' && f !== focus;
                                  return (
                                    <div
                                      key={i}
                                      className={`cbar-job ${dim ? 'dim' : ''} ${j.status === 'extra' ? 'extra' : j.status !== 'booked' ? `skipped st-${j.status}` : ''}`}
                                      style={{ left: `${pct(j.s)}%`, width: `${Math.max(pct(j.e) - pct(j.s), 0.8)}%`, '--freq': freqColors[f] || '#9ca3af', background: j.status !== 'booked' && j.status !== 'extra' ? 'transparent' : freqColors[f] || '#9ca3af' }}
                                      title={`${hhmm(j.s)}–${hhmm(j.e)} ${j.title}\n${j.status === 'extra' ? `Not a regular here: ${j.reason}` : j.status !== 'booked' ? `Not here this date: ${j.reason}. Still their ${plainFreq(f).toLowerCase()} spot.` : plainFreq(f)}${j.area || j.zone ? ` · ${j.area || j.zone}` : ''}`}
                                    />
                                  );
                                })}
                                {day.open.map((g, i) => {
                                  const dim = focus !== 'all' && g.fit !== focus;
                                  return (
                                    <div
                                      key={`o${i}`}
                                      className={`cbar-open ${dim ? 'dim' : ''} ${g.taken ? 'taken' : ''}`}
                                      style={{ left: `${pct(g.s)}%`, width: `${pct(g.e) - pct(g.s)}%`, '--fit': freqColors[g.fit] }}
                                      title={`${g.fit === 'One-time' ? `Free ${hhmm(g.s)}–${hhmm(g.e)} this date only: ${g.why || 'one-time clean'}` : `Free ${hhmm(g.s)}–${hhmm(g.e)} · good for an ${plainFreq(g.fit).toLowerCase()} customer${g.weeks === 2 ? ` (with ${g.pairs.filter((x) => x !== dt).map(shortDate).join(', ')})` : g.weeks === 1 ? ' (every week)' : ''}`}${g.taken ? `\nTaken this date by ${g.taken.join(', ')} (moved or one-time): the first visit starts the next free date` : ''}${g.area || g.zone ? `\nArea: ${g.area || g.zone}` : ''}`}
                                    >
                                      <span>{FIT_SHORT[g.fit]}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              <span className="cbar-meta">
                                {day.booked} h booked
                                {day.open.map((g, i) => (
                                  <span key={i} className="cbar-meta-open" style={{ '--fit': freqColors[g.fit] }}>
                                    {' · '}<b>{Math.round((g.e - g.s) / 6) / 10} h</b> {FIT_LONG[g.fit]}{g.taken ? ' (taken this date)' : ''}
                                  </span>
                                ))}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      </Card>
      <p className="muted small">
        Read across a row to see a team's 4 weeks on that weekday. "Every other" free time is open in weeks 1 & 3 or 2 & 4, so a new every-other-week customer sits alongside the ones already booked in the other weeks.
      </p>
    </>
  );
}

// ---------- Where to sell ----------

function WhereToSell({ data, onOpen }) {
  const [zone, setZone] = useState(null);
  const [fit, setFit] = useState('all');
  const [day, setDay] = useState('all');
  const zonesWithOpen = data.zones.filter((z) => z.openings > 0);
  const list = data.openings.filter((o) => (!zone || o.area.zone === zone) && (fit === 'all' || o.fit === fit) && (day === 'all' || o.weekday === day));
  const days = [...new Set(data.openings.map((o) => o.weekday))];
  const max = Math.max(...data.zones.map((z) => z.openWeeklyHours), 1);

  return (
    <div className="sell">
      <div className="sell-bottom">
                <Card title={<>Areas with room to grow <Help>Neighbourhoods ranked by how many hours a week we could still sell there without adding much driving. Click one to filter the list.</Help></>} actions={<span className="muted small">hours per week</span>} className="flush zone-card">
          <div className="zone-list">
            {zonesWithOpen.map((z) => (
              <button key={z.name} className={`zone-row ${zone === z.name ? 'on' : ''}`} onClick={() => setZone(zone === z.name ? null : z.name)}>
                <span className="zone-name"><i style={{ background: z.color || '#9ca3af' }} />{z.label || z.name}</span>
                <span className="zone-bar"><i style={{ width: `${(z.openWeeklyHours / max) * 100}%` }} /></span>
                <b>{z.openWeeklyHours} h</b>
                <span className="muted small">{z.openings} openings · {z.homes} homes · ZIP {z.zips.join(', ')}{z.cities?.length ? ` · ${z.cities.join(', ')}` : ''}</span>
              </button>
            ))}
            {!zonesWithOpen.length && <Empty icon="check" title="No openings in any area" />}
          </div>
        </Card>
        <div>
          <div className="toolbar">
            {zone && <button className="chip on" onClick={() => setZone(null)}>{data.zones.find((z) => z.name === zone)?.label || zone} <Icon name="close" size={12} /></button>}
            <select value={fit} onChange={(e) => setFit(e.target.value)}>
              <option value="all">Any customer type</option>
              <option value="Weekly">Weekly customers</option>
              <option value="Every 2 weeks">Every-other-week customers</option>
              <option value="Every 4 weeks">Every-4-weeks customers</option>
            </select>
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="all">Any day</option>
              {days.map((d) => <option key={d}>{d}</option>)}
            </select>
            <span className="muted small">{list.length} openings · teams back at the office by {data.returnBy}</span>
          </div>
          <Card className="flush">
            <div className="tablewrap">
            <table className="data">
              <thead>
                                <tr><th>Area</th><th>Day</th><th>Free time</th><th>Good for</th><th>Team</th><th>Dates</th><th>Hours / week</th><th /></tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => onOpen(o)} title="Open in the 4-week plan">
                    <td>
                      <b>{o.area.name || 'Unknown area'}</b>
                      <span className="muted small block">
                        {[o.area.zip && `ZIP ${o.area.zip}`, o.area.city].filter(Boolean).join(' · ')}
                        {o.area.between ? ` · between ${o.area.between[0]} → ${o.area.between[1]}` : o.area.basis !== 'neighbouring jobs' ? ` · ${o.area.basis}` : ''}
                      </span>
                    </td>
                    <td>{o.weekday}s</td>
                    <td className="nowrap mono">{o.label}</td>
                                        <td><span className="freq" style={{ '--freq': FIT_COLOR[o.fit] }}><i />{GOOD_FOR[o.fit] || plainFreq(o.fit)}</span></td>
                    <td className="nowrap"><span className="team-swatch" style={{ '--team': teamColor({ name: o.team, color: o.color }).bg }} />{o.team}</td>
                    <td className="small muted">
                      {o.dates.map((d) => (o.takenOn || []).some((t) => t.date === d) ? <s key={d} title="Taken this date by a moved or one-time booking">{shortDate(d)}</s> : <span key={d}>{shortDate(d)}</span>).reduce((a, x, i) => (i ? [...a, ', ', x] : [x]), [])}
                      {o.fit === 'One-time' && o.why && <span className="block">{o.why}</span>}
                    </td>
                    <td><b>{o.weeklyHours}</b></td>
                    <td className="row-actions">
                      <Icon name="chevronRight" size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {!list.length && <Empty icon="search" title="No openings match" />}
          </Card>
        </div>
      </div>
      <p className="muted small">Click an opening to see it in the 4-week plan. An opening's area is where the team is just before and after it, so a customer there keeps the route tight. Last openings of the day already leave time to drive back to the office by {data.returnBy}. Hours / week counts an every-other-week opening as half and every-4-weeks as a quarter.</p>
    </div>
  );
}

// ---------- Place a customer ----------

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function PlaceCustomer({ from, zones, onError, onOpen }) {
    const [form, setForm] = useState({ where: 'zip', zip: '', zone: '', home: '', frequency: '2', hours: '2', part: 'any' });
  const [days, setDays] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const q = { from, frequency: form.frequency, hours: form.hours, part: form.part, days: days.join(',') };
      if (form.where === 'zip') q.zip = form.zip;
      if (form.where === 'zone') q.zone = form.zone;
      if (form.where === 'home') q.home = form.home;
      setResult(await api.placeCustomer(q));
    } catch (err) {
      onError(err);
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <form className="card place-form" onSubmit={submit}>
        <div className="place-where">
          <div className="segmented">
                        {[['zip', 'ZIP'], ['zone', 'Area'], ['home', 'Existing home']].map(([k, label]) => (
              <button type="button" key={k} className={form.where === k ? 'on' : ''} onClick={() => setForm({ ...form, where: k })}>{label}</button>
            ))}
          </div>
          {form.where === 'zip' && <input placeholder="e.g. 99203" value={form.zip} onChange={set('zip')} inputMode="numeric" required />}
          {form.where === 'zone' && (
            <select value={form.zone} onChange={set('zone')} required>
                            <option value="">Choose an area…</option>
              {zones.map((z) => <option key={z.name} value={z.name}>{z.label || z.name}</option>)}
            </select>
          )}
          {form.where === 'home' && <input placeholder="Home or customer name" value={form.home} onChange={set('home')} required />}
        </div>
        <label className="field"><span>Frequency</span>
          <select value={form.frequency} onChange={set('frequency')}>
            <option value="1">Weekly</option>
                        <option value="2">Every other week</option>
            <option value="4">Every 4 weeks</option>
            <option value="0">One-time</option>
          </select>
        </label>
        <label className="field"><span>Job length</span>
          <select value={form.hours} onChange={set('hours')}>{[1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6].map((h) => <option key={h} value={h}>{h} hours</option>)}</select>
        </label>
        <label className="field"><span>Time of day</span>
          <select value={form.part} onChange={set('part')}><option value="any">Any</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option></select>
        </label>
        <div className="field"><span>Days the customer can do</span>
          <div className="daychips">
            {DAYS.map((d) => (
              <button type="button" key={d} className={days.includes(d) ? 'chip on' : 'chip'} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{d.slice(0, 3)}</button>
            ))}
          </div>
        </div>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Finding…' : 'Find the best openings'}</button>
      </form>
      <ErrorNote error={error} />
      {busy && <Skeleton rows={5} height={64} />}
      {result && !busy && (
        <>
                    <p className="muted small">Best openings for <b>{result.target.label}</b>, ranked by extra driving, {result.frequency === 0 ? 'how soon' : 'frequency'} and length. Times include driving from the job before, and to the next job or back to the office by {result.returnBy}.</p>
          {!result.results.length && <Empty icon="calendar" title="No opening fits">Try another frequency, a shorter job, or more days.</Empty>}
          <div className="slot-list">
            {result.results.map((r, i) => {
              const c = teamColor({ name: r.team, color: r.color });
              return (
                <div key={r.id} className={`slot place clickable ${i === 0 ? 'best' : ''}`} onClick={() => onOpen(r)} title="Open in the 4-week plan">
                  <div className="slot-when">
                    <b>{r.weeks === 0 ? `${r.weekday.slice(0, 3)} ${shortDate(r.dates[0])}` : `${r.weekday}s`}</b>
                    <span>{r.arrive} – {r.done}</span>
                    <span className="muted small">free {r.label}</span>
                  </div>
                  <div className="slot-team">
                    <b><span className="team-swatch" style={{ '--team': c.bg }} />{r.team}</b>
                    <span className="muted small">{r.area.name || 'area unknown'}{r.area.zip ? ` · ${r.area.zip}` : ''}</span>
                  </div>
                  <div className="slot-reasons">
                                        <span className="freq" style={{ '--freq': FIT_COLOR[r.fit] }}><i />{r.weeks === 0 ? 'One-time clean' : plainFreq(r.fit)}</span>
                    {r.reasons.map((x, n) => <span key={n} className={`pill ${x.tone === 'good' ? 'ok' : x.tone === 'warn' ? 'warn' : ''}`}>{x.text}</span>)}
                  </div>
                  <span className="slot-gap muted small">{r.weeks === 0 ? `one visit on ${shortDate(r.dates[0])}` : `first visit ${shortDate(r.firstDate || r.dates[0])}${r.dates.filter((d) => d > (r.firstDate || r.dates[0]) && !(r.takenOn || []).some((t) => t.date === d)).slice(0, 1).map((d) => `, then ${shortDate(d)}`).join('')}`}</span>
                </div>
              );
            })}
          </div>
          <p className="muted small">Drive times are estimates from straight-line distance. To book, create the job in MaidCentral.</p>
        </>
      )}
            {!result && !busy && <Empty icon="pin" title="Where would a new customer fit best?">Enter their ZIP code, area or a nearby existing home, how often and how long the clean is. You'll get times when a team is already nearby, that work on every visit and still get the team back to the office on time.</Empty>}
    </>
  );
}
