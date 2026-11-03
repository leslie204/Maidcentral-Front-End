import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import Icon from './Icon.jsx';
import { PageHeader, Stats, Tabs, Skeleton, ErrorNote, Empty, Card } from './ui.jsx';

// Frequency colours (MaidCentral's own, from the jobs on the board), with fallbacks.
const FIT_COLOR = { Weekly: '#92B558', 'Every 2 weeks': '#005960', 'Every 4 weeks': '#578CAC', 'One-time': '#d2691e', 'On demand': '#c48f65' };
const FIT_SHORT = { Weekly: '1w', 'Every 2 weeks': '2w', 'Every 4 weeks': '4w' };
const hhmm = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}${m % 60 ? `:${String(m % 60).padStart(2, '0')}` : ''}${m < 720 ? 'a' : 'p'}`;
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
  const [from] = useState(monday());
  const [minHours, setMinHours] = useState('1.5');
  const o = useLoad(() => api.openings({ from, minHours }), `${from}:${minHours}`, onError);
  const d = o.data;
  const weekly = d ? d.openings.reduce((s, x) => s + x.weeklyHours, 0) : 0;

  return (
    <>
      <PageHeader
        title="Openings"
        subtitle="Where to add recurring work: free time per team over the 4-week cycle, by frequency and area"
        actions={
          <label className="inline-field">
            Shortest opening
            <select value={minHours} onChange={(e) => setMinHours(e.target.value)}>
              {['1', '1.5', '2', '2.5', '3'].map((h) => <option key={h} value={h}>{h} h</option>)}
            </select>
          </label>
        }
      />
      {d && (
        <Stats
          items={[
            { label: 'Open, per week', value: `${Math.round(weekly)} h`, hint: 'weekly-equivalent recurring time' },
            { label: 'Weekly openings', value: d.openings.filter((x) => x.weeks === 1).length },
            { label: 'Every-2-weeks openings', value: d.openings.filter((x) => x.weeks === 2).length },
            { label: 'Every-4-weeks openings', value: d.openings.filter((x) => x.weeks === 4).length },
            { label: 'Jobs located', value: `${Math.round((d.book.matchedJobs / Math.max(d.book.totalJobs, 1)) * 100)}%`, hint: `${d.book.homes} recurring homes on the map` },
          ]}
        />
      )}
      <Tabs value={tab} onChange={setTab} tabs={[['plan', '4-week plan'], ['sell', 'Where to sell'], ['place', 'Place a customer']]} />
      <ErrorNote error={o.error} />
      {o.loading && (
        <>
          <p className="muted small">Reading 4 weeks of schedules and the recurring book from MaidCentral… (first load takes about 20 seconds)</p>
          <Skeleton rows={8} height={40} />
        </>
      )}
      {d && tab === 'plan' && <CyclePlan data={d} />}
      {d && tab === 'sell' && <WhereToSell data={d} onError={onError} />}
      {tab === 'place' && <PlaceCustomer from={from} zones={d?.zones || []} onError={onError} />}
    </>
  );
}

// ---------- 4-week plan ----------

function CyclePlan({ data }) {
  const [team, setTeam] = useState('all');
  const [focus, setFocus] = useState('all'); // highlight a frequency
  const { weeks, weekdays, teams } = data.cycle;
  const dayStart = 7 * 60;
  const dayEnd = 18 * 60;
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
      <div className="toolbar">
        <select value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="all">All teams</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="chips">
          {['all', 'Weekly', 'Every 2 weeks', 'Every 4 weeks', 'One-time'].map((f) => (
            <button key={f} className={focus === f ? 'chip on' : 'chip'} onClick={() => setFocus(f)}>
              {f !== 'all' && <i className="dot" style={{ background: freqColors[f] }} />}
              {f === 'all' ? 'All frequencies' : f}
            </button>
          ))}
        </div>
      </div>
      <Card className="flush">
        <div className="cycle-legend">
          {['Weekly', 'Every 2 weeks', 'Every 4 weeks', 'One-time'].map((f) => <span key={f}><i style={{ background: freqColors[f] }} />{f} job</span>)}
          <span><i className="hatch" />Open: label shows the frequency it fits (1w / 2w / 4w)</span>
          <span className="muted">Bars run 7a–6p</span>
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
                    return (
                      <tr key={t.id}>
                        <td className="sticky nowrap"><span className="team-swatch" style={{ '--team': c.bg }} />{t.name}</td>
                        {dates.map((dt) => {
                          const day = dt && t.days[dt];
                          if (!day) return <td key={dt} className="cycle-cell off"><span className="muted small">off</span></td>;
                          return (
                            <td key={dt} className="cycle-cell">
                              <div className="cbar">
                                {day.window && <div className="cbar-window" style={{ left: `${pct(day.window.s)}%`, width: `${pct(day.window.e) - pct(day.window.s)}%` }} />}
                                {day.jobs.map((j, i) => {
                                  const f = j.frequency || 'Unknown';
                                  const dim = focus !== 'all' && f !== focus;
                                  return (
                                    <div key={i} className={`cbar-job ${dim ? 'dim' : ''}`} style={{ left: `${pct(j.s)}%`, width: `${Math.max(pct(j.e) - pct(j.s), 0.8)}%`, background: freqColors[f] || '#9ca3af' }} title={`${hhmm(j.s)}–${hhmm(j.e)} ${j.title}\n${f}${j.zone ? ` · ${j.zone}` : ''}`} />
                                  );
                                })}
                                {day.open.map((g, i) => {
                                  const dim = focus !== 'all' && g.fit !== focus;
                                  return (
                                    <div key={`o${i}`} className={`cbar-open ${dim ? 'dim' : ''}`} style={{ left: `${pct(g.s)}%`, width: `${pct(g.e) - pct(g.s)}%`, '--fit': freqColors[g.fit] }} title={`Open ${hhmm(g.s)}–${hhmm(g.e)} · fits ${g.fit.toLowerCase()}${g.weeks === 2 ? ` (with ${g.pairs.filter((x) => x !== dt).map(shortDate).join(', ')})` : g.weeks === 1 ? ' (every week)' : ''}${g.zone ? `\nArea: ${g.zone}` : ''}`}>
                                      {FIT_SHORT[g.fit]}
                                    </div>
                                  );
                                })}
                              </div>
                              <span className="cbar-meta">{day.booked} h{day.open.length ? ` · ${Math.round(day.open.reduce((a, g) => a + (g.e - g.s), 0) / 6) / 10} h open` : ''}</span>
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
        Read across a row to see a team's 4-week rotation. A <b>2w</b> opening is free in weeks 1 & 3 or 2 & 4, so it pairs with an every-2-weeks customer already in the other two weeks; <b>4w</b> is free in one week of the four; <b>1w</b> is free every week.
      </p>
    </>
  );
}

// ---------- Where to sell ----------

function WhereToSell({ data, onError }) {
  const [zone, setZone] = useState(null);
  const [fit, setFit] = useState('all');
  const [day, setDay] = useState('all');
  const [focus, setFocus] = useState(null); // an opening to fly to
  const map = useLoad(() => api.openingsMap(), 'openings-map', onError);
  const zonesWithOpen = data.zones.filter((z) => z.openings > 0);
  const list = data.openings.filter((o) => (!zone || o.area.zone === zone) && (fit === 'all' || o.fit === fit) && (day === 'all' || o.weekday === day));
  const days = [...new Set(data.openings.map((o) => o.weekday))];
  const max = Math.max(...data.zones.map((z) => z.openWeeklyHours), 1);

  return (
    <div className="sell">
      <Card className="flush map-card">
        {map.loading && <Skeleton rows={1} height={520} />}
        <ErrorNote error={map.error} />
        {map.data && (
          <TerritoryMap
            shapes={map.data.shapes}
            homes={map.data.homes}
            office={map.data.office}
            zones={data.zones}
            openings={list}
            selected={zone}
            onSelect={setZone}
            teams={data.teams}
            focus={focus}
          />
        )}
      </Card>
      <div className="sell-bottom">
        <Card title="Areas with room to grow" actions={<span className="muted small">open h / week</span>} className="flush zone-card">
          <div className="zone-list">
            {zonesWithOpen.map((z) => (
              <button key={z.name} className={`zone-row ${zone === z.name ? 'on' : ''}`} onClick={() => setZone(zone === z.name ? null : z.name)}>
                <span className="zone-name"><i style={{ background: z.color || '#9ca3af' }} />{z.name}</span>
                <span className="zone-bar"><i style={{ width: `${(z.openWeeklyHours / max) * 100}%` }} /></span>
                <b>{z.openWeeklyHours} h</b>
                <span className="muted small">{z.openings} openings · {z.homes} homes</span>
              </button>
            ))}
            {!zonesWithOpen.length && <Empty icon="check" title="No openings in any area" />}
          </div>
        </Card>
        <div>
          <div className="toolbar">
            {zone && <button className="chip on" onClick={() => setZone(null)}>{zone} <Icon name="close" size={12} /></button>}
            <select value={fit} onChange={(e) => setFit(e.target.value)}>
              <option value="all">Any frequency</option>
              <option>Weekly</option>
              <option>Every 2 weeks</option>
              <option>Every 4 weeks</option>
            </select>
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="all">Any day</option>
              {days.map((d) => <option key={d}>{d}</option>)}
            </select>
            <span className="muted small">{list.length} openings · teams back at the office by {data.returnBy}</span>
          </div>
          <Card className="flush">
            <table className="data">
              <thead>
                <tr><th>Area</th><th>Day</th><th>Time</th><th>Fits</th><th>Team</th><th>Dates</th><th>h / wk</th></tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id} className={`clickable ${focus?.id === o.id ? 'selected' : ''}`} onClick={() => setFocus(o)} title="Show on the map">
                    <td>
                      <b className="cap">{o.area.zone || 'Unknown area'}</b>
                      {o.area.between && <span className="muted small block">between {o.area.between[0]} → {o.area.between[1]}</span>}
                      {!o.area.between && o.area.basis !== 'neighbouring jobs' && <span className="muted small block">{o.area.basis}</span>}
                    </td>
                    <td>{o.weekday}s</td>
                    <td className="nowrap mono">{o.label}</td>
                    <td><span className="freq" style={{ '--freq': FIT_COLOR[o.fit] }}><i />{o.fit}</span></td>
                    <td className="nowrap"><span className="team-swatch" style={{ '--team': teamColor({ name: o.team, color: o.color }).bg }} />{o.team}</td>
                    <td className="small muted">{o.dates.map(shortDate).join(', ')}</td>
                    <td><b>{o.weeklyHours}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && <Empty icon="search" title="No openings match" />}
          </Card>
        </div>
      </div>
      <p className="muted small">An opening's area is where the team is just before and after it, so a customer there keeps the route tight. Last openings of the day already leave time to drive back to the office by {data.returnBy}. h / wk counts an every-2-weeks opening as half and every-4-weeks as a quarter.</p>
    </div>
  );
}

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  fallback: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};

function TerritoryMap({ shapes, homes, office, zones, openings, selected, onSelect, teams, focus }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  const [show, setShow] = useState({ zones: true, homes: true, openings: true, labels: true });
  const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const home = useRef(null);

  // Create the map once; keep it sized to its box (fixes grey or half-loaded tiles).
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, preferCanvas: true });
    map.current = m;
    let tiles = L.tileLayer(dark ? TILES.dark : TILES.light, { attribution: '&copy; OpenStreetMap contributors &copy; CARTO', maxZoom: 19, subdomains: 'abcd' }).addTo(m);
    let failed = 0;
    tiles.on('tileerror', () => {
      // If the map tiles are blocked (network or ad-blocker), use OpenStreetMap's own.
      if (++failed === 4) {
        m.removeLayer(tiles);
        tiles = L.tileLayer(TILES.fallback, { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(m);
      }
    });
    // Fit to where most homes are (5th–95th percentile), so a few far-out homes don't
    // shrink the city to a dot.
    const q = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))))];
    const lats = homes.map((h) => h.lat).sort((a, b) => a - b);
    const lngs = homes.map((h) => h.lng).sort((a, b) => a - b);
    home.current = homes.length ? L.latLngBounds([q(lats, 0.05), q(lngs, 0.05)], [q(lats, 0.95), q(lngs, 0.95)]).pad(0.15) : null;
    if (home.current) m.fitBounds(home.current);
    else m.setView([47.66, -117.42], 11);
    // Zone names only once zoomed in enough to read them.
    const labelsFor = () => el.current?.classList.toggle('hide-labels', m.getZoom() < 12);
    m.on('zoomend', labelsFor);
    labelsFor();
    m.on('click focus', () => m.scrollWheelZoom.enable());
    m.on('mouseout blur', () => m.scrollWheelZoom.disable());
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    setTimeout(() => m.invalidateSize(), 0);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  const open = useMemo(() => Object.fromEntries(zones.map((z) => [z.name, z.openWeeklyHours])), [zones]);

  // Zones shaded by open hours, with names; click to filter and zoom.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.zones?.remove();
    layers.current.labels?.remove();
    const max = Math.max(...Object.values(open), 1);
    if (show.zones) {
      layers.current.zones = L.geoJSON(shapes, {
        style: (f) => {
          const h = open[f.properties.zone] || 0;
          const on = selected === f.properties.zone;
          return { color: on ? '#0e7490' : dark ? '#64748b' : '#94a3b8', weight: on ? 3 : 1, fillColor: h ? '#0e7490' : '#94a3b8', fillOpacity: on ? 0.35 : h ? 0.06 + (h / max) * 0.3 : 0.03 };
        },
        onEachFeature: (f, layer) => {
          layer.bindTooltip(`<b class="cap">${f.properties.zone}</b><br>ZIP ${f.properties.zip}${f.properties.city ? ` · ${f.properties.city}` : ''}<br>${open[f.properties.zone] || 0} h/week open`, { sticky: true });
          layer.on('click', () => onSelect(f.properties.zone === selected ? null : f.properties.zone));
        },
      }).addTo(m);
    }
    if (show.labels) {
      layers.current.labels = L.layerGroup(
        zones.filter((z) => z.center && (z.openWeeklyHours > 0 || z.name === selected)).map((z) =>
          L.marker([z.center.lat, z.center.lng], {
            interactive: false,
            icon: L.divIcon({ className: 'zone-label', html: `<span>${z.name}${z.openWeeklyHours ? `<b>${z.openWeeklyHours} h</b>` : ''}</span>`, iconSize: null }),
          }),
        ),
      ).addTo(m);
    }
  }, [shapes, zones, open, selected, onSelect, show.zones, show.labels, dark]);

  // Zoom to the selected zone's homes (or back out).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pts = homes.filter((h) => h.zone === selected).map((h) => [h.lat, h.lng]);
    if (selected && pts.length) m.flyToBounds(L.latLngBounds(pts).pad(0.4), { duration: 0.5, maxZoom: 14 });
    else if (!selected && home.current) m.flyToBounds(home.current, { duration: 0.5 });
  }, [selected, homes]);

  // Homes as small dots in their team's colour, and the office.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.homes?.remove();
    layers.current.office?.remove();
    const byTeam = Object.fromEntries(teams.map((t) => [t.name, teamColor(t).bg]));
    if (show.homes) {
      layers.current.homes = L.layerGroup(
        homes.map((h) => L.circleMarker([h.lat, h.lng], { radius: 3.5, weight: 1, color: dark ? '#0b0f14' : '#fff', fillOpacity: 0.9, fillColor: byTeam[h.team] || '#64748b' }).bindTooltip(`${h.team || 'No team'} · ${h.frequency || ''}${h.weekday ? ` · ${h.weekday}s` : ''}<br><span class="cap">${h.zone || ''}</span>`)),
      ).addTo(m);
    }
    if (office) {
      layers.current.office = L.marker([office.lat, office.lng], {
        icon: L.divIcon({ className: 'office-pin', html: '<span>CB</span>', iconSize: [30, 30], iconAnchor: [15, 15] }),
        zIndexOffset: 1000,
      }).bindTooltip(`<b>Office</b><br>${office.address || ''}`).addTo(m);
    }
  }, [homes, teams, show.homes, office, dark]);

  // Openings as rings (size = hours per week) at the team's position before the opening.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.openings?.remove();
    if (!show.openings) return;
    layers.current.openings = L.layerGroup(
      openings.filter((o) => o.area.center).map((o) =>
        L.circleMarker([o.area.center.lat, o.area.center.lng], { radius: 7 + o.weeklyHours * 2.5, color: FIT_COLOR[o.fit], weight: 3, fillColor: FIT_COLOR[o.fit], fillOpacity: 0.15 })
          .bindPopup(`<b>${o.weekday}s ${o.label}</b><br>${o.team} · fits ${o.fit.toLowerCase()}<br><span class="cap">${o.area.zone || ''}</span><br>${o.weeklyHours} h/week · ${o.dates.join(', ')}`),
      ),
    ).addTo(m);
  }, [openings, show.openings]);

  // Fly to an opening picked in the list.
  useEffect(() => {
    if (!focus?.area?.center || !map.current) return;
    map.current.flyTo([focus.area.center.lat, focus.area.center.lng], 14, { duration: 0.6 });
    L.popup().setLatLng([focus.area.center.lat, focus.area.center.lng]).setContent(`<b>${focus.weekday}s ${focus.label}</b><br>${focus.team} · fits ${focus.fit.toLowerCase()}<br><span class="cap">${focus.area.zone || ''}</span>`).openOn(map.current);
  }, [focus]);

  return (
    <div className="map-wrap">
      <div ref={el} className="map" />
      <div className="map-controls">
        {[['zones', 'Zones'], ['labels', 'Names'], ['homes', 'Homes'], ['openings', 'Openings']].map(([k, label]) => (
          <label key={k}><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{label}</label>
        ))}
        <button className="btn sm" onClick={() => (onSelect(null), home.current && map.current?.flyToBounds(home.current, { duration: 0.5 }))}>Reset view</button>
      </div>
      <div className="map-legend">
        <span><i className="ring" style={{ borderColor: FIT_COLOR.Weekly }} />weekly</span>
        <span><i className="ring" style={{ borderColor: FIT_COLOR['Every 2 weeks'] }} />every 2 weeks</span>
        <span><i className="ring" style={{ borderColor: FIT_COLOR['Every 4 weeks'] }} />every 4 weeks</span>
        <span><i className="dotm" />home (team colour)</span>
        {office && <span><i className="officem">CB</i>office</span>}
        <span className="muted">Click the map to scroll-zoom</span>
      </div>
    </div>
  );
}

// ---------- Place a customer ----------

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function PlaceCustomer({ from, zones, onError }) {
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
            {[['zip', 'ZIP code'], ['zone', 'Zone'], ['home', 'Existing home']].map(([k, label]) => (
              <button type="button" key={k} className={form.where === k ? 'on' : ''} onClick={() => setForm({ ...form, where: k })}>{label}</button>
            ))}
          </div>
          {form.where === 'zip' && <input placeholder="e.g. 99203" value={form.zip} onChange={set('zip')} inputMode="numeric" required />}
          {form.where === 'zone' && (
            <select value={form.zone} onChange={set('zone')} required>
              <option value="">Choose a zone…</option>
              {zones.map((z) => <option key={z.name}>{z.name}</option>)}
            </select>
          )}
          {form.where === 'home' && <input placeholder="Home or customer name" value={form.home} onChange={set('home')} required />}
        </div>
        <label className="field"><span>Frequency</span>
          <select value={form.frequency} onChange={set('frequency')}>
            <option value="1">Weekly</option>
            <option value="2">Every 2 weeks</option>
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
          <p className="muted small">Best openings near <b>{result.target.label}</b>, ranked by extra driving, frequency fit and length. Times include driving from the job before, and to the next job or back to the office by {result.returnBy}.</p>
          {!result.results.length && <Empty icon="calendar" title="No opening fits">Try another frequency, a shorter job, or more days.</Empty>}
          <div className="slot-list">
            {result.results.map((r, i) => {
              const c = teamColor({ name: r.team, color: r.color });
              return (
                <div key={r.id} className={`slot place ${i === 0 ? 'best' : ''}`}>
                  <div className="slot-when">
                    <b>{r.weekday}s</b>
                    <span>{r.arrive} – {r.done}</span>
                    <span className="muted small">free {r.label}</span>
                  </div>
                  <div className="slot-team">
                    <b><span className="team-swatch" style={{ '--team': c.bg }} />{r.team}</b>
                    <span className="muted small">{r.area.zone || 'area unknown'}</span>
                  </div>
                  <div className="slot-reasons">
                    <span className="freq" style={{ '--freq': FIT_COLOR[r.fit] }}><i />{r.fit}</span>
                    {r.reasons.map((x, n) => <span key={n} className={`pill ${x.tone === 'good' ? 'ok' : x.tone === 'warn' ? 'warn' : ''}`}>{x.text}</span>)}
                  </div>
                  <span className="slot-gap muted small">first visits {r.dates.slice(0, 2).map(shortDate).join(', ')}</span>
                </div>
              );
            })}
          </div>
          <p className="muted small">Drive times are estimates from straight-line distance. To book, create the job in MaidCentral.</p>
        </>
      )}
      {!result && !busy && <Empty icon="pin" title="Where would a new customer fit best?">Enter their ZIP, zone or an existing home, how often and how long. You'll get openings where a team is already nearby that day.</Empty>}
    </>
  );
}
