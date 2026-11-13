import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import Icon from './Icon.jsx';
import CapacityTab from './Capacity.jsx';
import { PageHeader, Stats, Tabs, Skeleton, ErrorNote, Empty, Card, Help, plainFreq } from './ui.jsx';

// Frequency colours (MaidCentral's own, from the jobs on the board), with fallbacks.
const FIT_COLOR = { Weekly: '#92B558', 'Every 2 weeks': '#005960', 'Every 4 weeks': '#578CAC', 'One-time': '#d2691e', 'On demand': '#c48f65' };
// Labels inside the small open blocks on the 4-week plan.
const FIT_SHORT = { Weekly: 'Weekly', 'Every 2 weeks': '2 wks', 'Every 4 weeks': '4 wks', 'One-time': 'Once' };
// Black or white text, whichever reads better on a background colour.
const lumOf = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
const inkOn = (hex) => (lumOf(hex) > 0.6 ? '#111' : '#fff');
// "North Home - Ann North" -> "Ann North".
const customerOf = (title) => String(title || '').split(' - ').pop();
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
        actions={tab === 'capacity' || tab === 'double' ? null : (
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
      <Tabs value={tab} onChange={setTab} tabs={[['plan', '4-week plan'], ['sell', 'Where to sell'], ['place', 'Place a customer'], ['double', 'Double bookings'], ['capacity', 'Capacity']]} />
      {tab !== 'capacity' && tab !== 'double' && <ErrorNote error={o.error} />}
      {o.loading && tab !== 'capacity' && tab !== 'double' && (
        <div className="loading-card">
          <b>{!prog ? 'Getting your openings from MaidCentral…' : prog.stage === 'locations' ? 'Loading customer locations and areas…' : prog.stage === 'reports' ? 'Almost there: customer locations and booking statuses…' : `Reading the schedule: week ${Math.min(Math.floor(prog.done / 7) + 1, 4)} of 4`}</b>
          <div className="progress"><i style={{ width: `${!prog ? 4 : prog.stage === 'locations' ? 12 : prog.stage === 'reports' ? 92 : 12 + (prog.done / prog.total) * 76}%` }} /></div>
          <span className="muted small">This only takes a while the first time; after that it's kept up to date in the background.</span>
        </div>
      )}
      {d && tab === 'plan' && <CyclePlan data={d} highlight={highlight} onClear={() => setHighlight(null)} />}
      {d && tab === 'sell' && <WhereToSell data={d} onOpen={openInPlan} />}
      {tab === 'capacity' && <CapacityTab from={from} onError={onError} />}
      {tab === 'double' && <DoubleBookings onError={onError} />}
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
          <span className="muted small">Show openings for:</span>
          {[['all', 'Any customer'], ['Weekly', 'Weekly'], ['Every 2 weeks', 'Every other week'], ['Every 4 weeks', 'Every 4 weeks'], ['One-time', 'One-time clean']].map(([f, label]) => (
            <button key={f} className={focus === f ? 'chip on' : 'chip'} onClick={() => setFocus(f)}>{label}</button>
          ))}
        </div>
      </div>
      <Card className="flush">
        <div className="cycle-legend">
          <span><i className="k-booked" />Booked (coloured by area, with the ZIP)</span>
          <span><i className="k-open" />Open for a new regular: Weekly, every 2 wks or every 4 wks</span>
          <span><i className="k-once" />Once: free that date only (a regular is away)</span>
          <span><i className="k-clash" />Double-booked (times overlap)</span>
          <span className="muted">Hover any block for details</span>
          <Help wide>Booked jobs take their area's colour from MaidCentral's Zones and show the home's ZIP code. Each bar is one team's day ({hourLabel(dayStart)}–{hourLabel(dayEnd)}); read across a row to see the next 4 weeks on that weekday. Green openings come from MaidCentral's Master Schedule, so they are real recurring spots: a customer who skipped or moved doesn't create one. When a regular is away on a date, their time shows as "Once" (good for a one-time clean only). A booking moved into an open spot shows as booked that date; hover it to see where it came from.</Help>
        </div>
        {data.areaColors?.length > 0 && (
          <div className="area-key">
            {[...new Map(data.areaColors.map((a) => [a.name || a.zone, a])).values()].map((a) => (
              <span key={a.zone}><i style={{ background: a.color }} />{a.name || a.zone}</span>
            ))}
          </div>
        )}
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
                          if (day.closed) return <td key={dt} className="cycle-cell off closed"><span className="small">Closed</span></td>;
                          return (
                            <td key={dt} className={`cycle-cell ${isHl(t, dt) ? 'hl' : ''}`}>
                              <div className="cbar" style={{ '--hours': (dayEnd - dayStart) / 60 }}>
                                {isHl(t, dt) && <div className="cbar-hl" style={{ left: `${pct(highlight.s)}%`, width: `${pct(highlight.e) - pct(highlight.s)}%` }} />}
                                {day.window && <div className="cbar-window" style={{ left: `${pct(day.window.s)}%`, width: `${pct(day.window.e) - pct(day.window.s)}%` }} />}
                                {day.jobs.filter((j) => j.status === 'booked' || j.status === 'extra').map((j, i) => (
                                  <div
                                    key={i}
                                    className={`cbar-job plan-job ${focus !== 'all' ? 'quiet' : ''} ${lumOf(j.color) > 0.9 ? 'pale' : ''} ${j.clash ? 'clash' : ''}`}
                                    style={{ left: `${pct(j.s)}%`, width: `${Math.max(pct(j.e) - pct(j.s), 0.8)}%`, ...(j.color ? { background: j.color, color: inkOn(j.color) } : {}) }}
                                    title={`${hhmm(j.s)}–${hhmm(j.e)} ${customerOf(j.title)}${j.zip ? ` · ${j.zip}` : ''}\n${j.status === 'extra' ? `Booked this date only: ${j.reason}` : `${plainFreq(j.frequency || 'Unknown')} customer`}${j.area || j.zone ? ` · ${j.area || j.zone}` : ''}${j.clash ? `\nDOUBLE-BOOKED with ${j.clash.join(', ')}` : ''}`}
                                  >
                                    {j.zip && <span>{j.zip}</span>}
                                  </div>
                                ))}
                                {day.open.filter((g) => !g.taken).map((g, i) => (
                                  <div
                                    key={`o${i}`}
                                    className={`cbar-open plan-open ${g.fit === 'One-time' ? 'once' : ''} ${focus !== 'all' && g.fit !== focus ? 'dim' : ''}`}
                                    style={{ left: `${pct(g.s)}%`, width: `${pct(g.e) - pct(g.s)}%` }}
                                    title={g.fit === 'One-time'
                                      ? `Free ${hhmm(g.s)}–${hhmm(g.e)} on this date only (one-time clean)\n${g.why || ''}`
                                      : `Open ${hhmm(g.s)}–${hhmm(g.e)}: good for a new ${plainFreq(g.fit).toLowerCase()} customer${g.weeks === 2 && g.pairs.filter((x) => x !== dt).length ? `\nAlso free ${g.pairs.filter((x) => x !== dt).map(shortDate).join(', ')}` : ''}${(g.takenDates || []).length ? `\nTaken ${g.takenDates.map((t) => `${shortDate(t.date)}${t.by.length ? ` by ${t.by.join(', ')}` : ''}`).join(', ')}` : ''}${g.area || g.zone ? `\nArea: ${g.area || g.zone}` : ''}`}
                                  >
                                    <span>{FIT_SHORT[g.fit]}</span>
                                  </div>
                                ))}
                              </div>
                              <span className="cbar-meta">
                                {day.booked} h booked
                                {(() => {
                                  const h = (fit) => Math.round(day.open.filter((g) => !g.taken && (fit ? g.fit === 'One-time' : g.fit !== 'One-time')).reduce((a, g) => a + g.e - g.s, 0) / 6) / 10;
                                  return <>{h(false) > 0 && <> · <b className="m-open">{h(false)} h open</b></>}{h(true) > 0 && <> · <b className="m-once">{h(true)} h once</b></>}</>;
                                })()}
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
    </>
  );
}

// ---------- Double bookings ----------

const longDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

function DoubleBookings({ onError }) {
  const [weeks, setWeeks] = useState('12');
  const [showTight, setShowTight] = useState(false);
  const r = useLoad(() => api.conflicts({ weeks }), weeks, onError);
  const d = r.data;
  const overlaps = d?.groups.filter((g) => g.kind === 'overlap') || [];
  const tight = d?.groups.filter((g) => g.kind === 'tight') || [];
  const card = (g, i) => {
    const c = teamColor({ name: g.team });
    return (
      <div key={i} className={`slot dbl ${g.kind}`}>
        <div className="slot-when">
          <b>{longDate(g.firstDate)}</b>
          {g.repeats && <span className="muted small">and {g.dates.length - 1} more: {g.dates.slice(1, 6).map((x) => shortDate(x)).join(', ')}{g.dates.length > 6 ? '…' : ''}</span>}
        </div>
        <div className="slot-team"><b><span className="team-swatch" style={{ '--team': c.bg }} />{g.team}</b>
          <span className={`pill ${g.kind === 'overlap' ? 'bad' : 'warn'}`}>
            {g.kind === 'overlap' ? (g.same ? 'Same time' : g.full ? `Fully overlaps (${g.minutes} min)` : `Overlap ${g.minutes} min`) : `${g.gap ? `${g.gap} min gap` : 'Back to back'}, ${g.drive} min drive`}
          </span>
        </div>
        <div className="dbl-pair">
          {g.bookings.map((b, k) => (
            <div key={k}>
              <b>{b.customer}</b>
              <span className="mono small">{b.time}</span>
              <span className="muted small">{b.frequency || ''}{b.address ? ` · ${b.address}` : ''}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };
  return (
    <>
      <div className="toolbar">
        <span className="muted small">Real bookings only (skipped, moved and cancelled ones don't count). Look ahead</span>
        <select value={weeks} onChange={(e) => setWeeks(e.target.value)}>
          {[['4', '4 weeks'], ['8', '8 weeks'], ['12', '12 weeks'], ['26', '6 months']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <ErrorNote error={r.error} />
      {r.loading && !d && <Skeleton rows={5} height={64} />}
      {d && (
        <>
          <Stats
            items={[
              { label: 'Double bookings', value: overlaps.length, hint: `${d.overlaps} dates`, help: 'Two bookings on the same team whose times overlap. A clash that repeats (two regulars whose spots overlap every cycle) is one entry with all its dates: fix it once in MaidCentral.' },
              { label: 'No time to drive', value: tight.length, hint: `${d.tight} dates`, help: 'Back-to-back bookings where the gap is shorter than the drive between the two homes (real road times).' },
              { label: 'Checked up to', value: shortDate(d.to), hint: `from ${shortDate(d.from)} · read ${new Date(d.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` },
            ]}
          />
          <h3 className="section-title">Double bookings</h3>
          {overlaps.length ? <div className="slot-list">{overlaps.map(card)}</div> : <Empty icon="check" title="No double bookings">No two bookings overlap on any team in these weeks.</Empty>}
          <h3 className="section-title">
            No time to drive between
            <button className="btn ghost sm" onClick={() => setShowTight(!showTight)}>{showTight ? 'Hide' : `Show ${tight.length}`}</button>
          </h3>
          {showTight && (tight.length ? <div className="slot-list">{tight.map(card)}</div> : <Empty icon="check" title="Nothing too tight">Every back-to-back booking leaves time for the drive.</Empty>)}
          <p className="muted small">To fix one, move a booking in MaidCentral; this list updates within a few minutes (or press Refresh).</p>
        </>
      )}
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
                      {o.dates.map((d) => { const t = (o.takenOn || []).find((x) => x.date === d); return t ? <s key={d} title={t.closed ? 'Closed this date' : 'Taken this date by a moved or one-time booking'}>{shortDate(d)}</s> : <span key={d}>{shortDate(d)}</span>; }).reduce((a, x, i) => (i ? [...a, ', ', x] : [x]), [])}
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

// Address box with suggestions while typing (US Census + OpenStreetMap search).
function AddressSearch({ value, onPick }) {
  const [text, setText] = useState(value?.label || '');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const q = text.trim();
    if (q.length < 6 || !/\d/.test(q) || q === value?.label) {
      setList([]);
      return undefined;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.searchAddress(q);
        if (n === seq.current) (setList(r.results || []), setOpen(true));
      } catch {
        if (n === seq.current) setList([]);
      } finally {
        if (n === seq.current) setBusy(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [text, value]);
  const pick = (x) => {
    setText(x.label);
    setOpen(false);
    onPick(x);
  };
  return (
    <div className="addr">
      <input
        placeholder="e.g. 1234 W Main Ave, Spokane"
        value={text}
        onChange={(e) => (setText(e.target.value), onPick(null))}
        onFocus={() => list.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !value && list.length) (e.preventDefault(), pick(list[0]));
        }}
        autoComplete="off"
        required
      />
      {busy && <span className="addr-busy muted small">Looking up…</span>}
      {open && text.trim().length >= 6 && (
        <div className="addr-list">
          {list.length ? list.map((x, i) => (
            <button type="button" key={i} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x)}>
              <Icon name="pin" size={14} /> {x.label}
            </button>
          )) : !busy && <span className="muted small addr-none">No match yet: add the street type (Ave, St, Rd) or the city.</span>}
        </div>
      )}
      {value && <span className="addr-ok small"><Icon name="check" size={13} /> Found on the map</span>}
    </div>
  );
}

// Any customer's home, past or present (MaidCentral's own search): pick from everyone with
// that name.
function HomeSearch({ value, onPick }) {
  const [text, setText] = useState(value ? value.customer : '');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const q = text.trim();
    if (q.length < 2 || (value && q === value.customer)) return undefined;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.searchHomes(q);
        if (n === seq.current) (setList(r.homes || []), setOpen(true));
      } catch {
        if (n === seq.current) setList([]);
      } finally {
        if (n === seq.current) setBusy(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [text, value]);
  const pick = (h) => {
    setText(h.customer);
    setOpen(false);
    onPick(h);
  };
  return (
    <div className="addr">
      <input
        placeholder="Customer name (anyone, past or present)"
        value={text}
        onChange={(e) => (setText(e.target.value), onPick(null))}
        onFocus={() => list.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !value && list.length === 1) (e.preventDefault(), pick(list[0]));
        }}
        autoComplete="off"
        required
      />
      {busy && <span className="addr-busy muted small">Searching…</span>}
      {open && text.trim().length >= 2 && (
        <div className="addr-list homes">
          {list.length ? list.map((h) => (
            <button type="button" key={h.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)}>
              <span className="zone-dot" style={{ background: h.zoneColor || 'var(--muted)' }} />
              <span className="home-pick">
                <b>{h.customer}</b>{h.company ? ` · ${h.company}` : ''} <span className="muted">· {h.home}</span>
                <span className="muted small block">{h.address || 'no address'}{h.zip ? ` · ${h.zip}` : ''}{h.zone ? ` · ${h.zone}` : ''}</span>
              </span>
              <span className={`pill ${h.recurring ? 'ok' : ''}`}>{h.recurring ? 'Regular' : 'Past / one-time'}</span>
            </button>
          )) : !busy && <span className="muted small addr-none">No customer by that name in MaidCentral.</span>}
        </div>
      )}
      {value && <span className="addr-ok small"><Icon name="check" size={13} /> {value.home}{value.address ? `, ${value.address}` : ''}</span>}
    </div>
  );
}

function PlaceResults({ result, onOpen, onFillIn, fillFor }) {
  return (
    <div className="slot-list">
      {result.results.map((r, i) => {
        const c = teamColor({ name: r.team, color: r.color });
        const later = r.firstDate && r.weeks > 0 ? Math.round((Date.parse(`${r.firstDate}T00:00:00Z`) - Date.now()) / 86_400_000) : 0;
        return (
          <div key={r.id} className={`slot place clickable ${i === 0 ? 'best' : ''} ${fillFor === r.id ? 'filling' : ''}`} onClick={() => onOpen(r)} title="Open in the 4-week plan">
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
              {r.route && (
                <span className="route-line small">
                  <Icon name="car" size={13} /> {r.route.from} <b>{r.route.fromMin} min</b> → new home → <b>{r.route.toMin} min</b> {r.route.to}
                </span>
              )}
            </div>
            <span className="slot-gap muted small">
              {r.weeks === 0 ? `one visit on ${shortDate(r.dates[0])}` : `first visit ${shortDate(r.firstDate || r.dates[0])}${r.dates.filter((d) => d > (r.firstDate || r.dates[0]) && !(r.takenOn || []).some((t) => t.date === d)).slice(0, 1).map((d) => `, then ${shortDate(d)}`).join('')}`}
              {onFillIn && r.weeks > 0 && later > 6 && (
                <button type="button" className="btn ghost sm fill-btn" onClick={(e) => (e.stopPropagation(), onFillIn(r))}>
                  Fit in a one-time clean before {shortDate(r.firstDate)}
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PlaceCustomer({ from, zones, onError, onOpen }) {
  const [form, setForm] = useState({ where: 'address', zip: '', zone: '', home: '', frequency: '2', hours: '2', part: 'any', maxDrive: '' });
  const [addr, setAddr] = useState(null);
  const [homePick, setHomePick] = useState(null);
  const [days, setDays] = useState([]);
  const [result, setResult] = useState(null);
  const [fill, setFill] = useState(null); // { for: opening, result } one-time cleans before the first visit
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const query = (extra = {}) => {
    const q = { from, frequency: form.frequency, hours: form.hours, part: form.part, days: days.join(','), ...extra };
    if (form.maxDrive) q.maxDrive = form.maxDrive;
    if (form.where === 'address' && addr) Object.assign(q, { lat: addr.lat, lng: addr.lng, address: addr.label });
    if (form.where === 'zip') q.zip = form.zip;
    if (form.where === 'zone') q.zone = form.zone;
    if (form.where === 'home' && homePick) Object.assign(q, { homeName: homePick.home || '', homeCustomer: homePick.customer || '', homeStreet: homePick.street || '', homeCity: homePick.city || '', homeZip: homePick.zip || '' });
    return q;
  };
  const submit = async (e) => {
    e.preventDefault();
    if (form.where === 'address' && !addr) return setError({ message: 'Pick the address from the suggestions first.' });
    if (form.where === 'home' && !homePick) return setError({ message: 'Pick the customer from the list first.' });
    setBusy(true);
    setError(null);
    setFill(null);
    try {
      setResult(await api.placeCustomer(query()));
    } catch (err) {
      onError(err);
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const fillIn = async (r) => {
    setFill({ for: r, result: null });
    try {
      const res = await api.placeCustomer(query({ frequency: '0', before: r.firstDate, days: '' }));
      setFill({ for: r, result: res });
      setTimeout(() => document.querySelector('.fill-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (err) {
      onError(err);
      setFill(null);
    }
  };
  return (
    <>
      <form className="card place-form" onSubmit={submit}>
        <div className="place-where">
          <div className="segmented">
            {[['address', 'Address'], ['zip', 'ZIP'], ['zone', 'Area'], ['home', 'Existing home']].map(([k, label]) => (
              <button type="button" key={k} className={form.where === k ? 'on' : ''} onClick={() => setForm({ ...form, where: k })}>{label}</button>
            ))}
          </div>
          {form.where === 'address' && <AddressSearch value={addr} onPick={setAddr} />}
          {form.where === 'zip' && <input placeholder="e.g. 99203" value={form.zip} onChange={set('zip')} inputMode="numeric" required />}
          {form.where === 'zone' && (
            <select value={form.zone} onChange={set('zone')} required>
              <option value="">Choose an area…</option>
              {zones.map((z) => <option key={z.name} value={z.name}>{z.label || z.name}</option>)}
            </select>
          )}
          {form.where === 'home' && <HomeSearch value={homePick} onPick={setHomePick} />}
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
        <label className="field"><span>Extra driving</span>
          <select value={form.maxDrive} onChange={set('maxDrive')}>
            <option value="">Show all</option>
            <option value="10">Up to 10 min</option>
            <option value="20">Up to 20 min</option>
            <option value="30">Up to 30 min</option>
            <option value="45">Up to 45 min</option>
          </select>
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
          <p className="muted small">
            Best openings for <b>{result.target.label}</b>, ranked by extra driving, {result.frequency === 0 ? 'how soon' : 'frequency'} and length. Times include driving from the job before, and to the next job or back to the office by {result.returnBy}.
            {result.frequency !== 0 && result.lookahead && <> Checked against moved and one-time bookings already in MaidCentral through {shortDate(result.lookahead.until)}.</>}
            {result.checkedLive && <> Each first visit was re-checked live in MaidCentral just now.</>}
          </p>
          {result.justBooked?.length > 0 && (
            <div className="callout warn small">
              <Icon name="alert" size={15} /> Booked since the plan was last read, so not offered: {result.justBooked.map((x) => `${x.team} ${shortDate(x.date)} ${x.label}${x.by.length ? ` (${x.by.join(', ')})` : ''}`).join('; ')}.
            </div>
          )}
          {!result.results.length && <Empty icon="calendar" title="No opening fits">Try another frequency, a shorter job, more days{result.maxDrive ? ' or more extra driving' : ''}.</Empty>}
          <PlaceResults result={result} onOpen={onOpen} onFillIn={result.frequency !== 0 ? fillIn : null} fillFor={fill?.for.id} />
          {fill && (
            <div className="card fill-panel">
              <div className="card-head"><b>One-time cleans before {shortDate(fill.for.firstDate)}</b><span className="muted small">to fit them in until their regular {fill.for.weekday} with {fill.for.team} starts</span>
                <button className="btn ghost sm" onClick={() => setFill(null)}>Close</button>
              </div>
              {!fill.result ? <Skeleton rows={3} height={56} /> : fill.result.results.length ? <PlaceResults result={fill.result} onOpen={onOpen} /> : <Empty icon="calendar" title="Nothing free before then">No one-time opening fits before {shortDate(fill.for.firstDate)}. Try a shorter job or allow more driving.</Empty>}
            </div>
          )}
          <p className="muted small">Drive times are real road times from our Spokane street map (no traffic). To book, create the job in MaidCentral.</p>
        </>
      )}
      {!result && !busy && <Empty icon="pin" title="Where would a new customer fit best?">Type their address (or a ZIP, area or a nearby existing home), how often and how long the clean is. You'll get times when a team is already nearby, the drive in and out, and the first date that's really free.</Empty>}
    </>
  );
}
