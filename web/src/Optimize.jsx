import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useLoad } from './hooks.js';
import { teamColor } from './teamColor.js';
import Icon from './Icon.jsx';
import { PageHeader, Stats, Tabs, Skeleton, ErrorNote, Empty, Card, Help, plainFreq } from './ui.jsx';

// Schedule & route optimization: where the 4-week cycle stands, what's possible, the money,
// the phased roadmap, scenario planning and keeping it optimized. The server works in
// minutes and kilometres; dollars come from the assumptions below (editable, kept on this
// device). Read-only: recommendations are made in MaidCentral by the office.

const CYCLES_PER_YEAR = 13; // 4-week cycles in a year
const STRATEGIES = [
  { id: 'minimal', label: 'Minimum disruption', scenario: 'Conservative' },
  { id: 'balanced', label: 'Balanced', scenario: 'Realistic' },
  { id: 'maximum', label: 'Maximum profit', scenario: 'Aggressive' },
  { id: 'rebuild', label: 'Rebuild from scratch', scenario: 'Theoretical ceiling' },
];
const DEFAULTS = { labour: 24, pay: 'route', perKm: 0.43, variable: 6, rate: '', capture: { minimal: 25, balanced: 50, maximum: 75, rebuild: 100 } };
const PHASES = {
  1: { title: 'Phase 1 · Quick wins', when: 'This week', detail: 'Same customers, same team, same day: re-ordered routes with small time changes (30 min or less).' },
  2: { title: 'Phase 2 · Rebalance teams', when: 'Next 2–6 weeks', detail: 'Same day for the customer, but a different team or a bigger time change. Give notice; keep changes per team small each week.' },
  3: { title: 'Phase 3 · Restructure days', when: 'Over 1–3 months, as customers reschedule', detail: 'A new weekday for the customer. Offer it when they next reschedule, skip or renew, rather than all at once.' },
};

const monday = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const $ = (n) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
const h = (min, d = 0) => `${(Math.round((min / 60) * 10 ** d) / 10 ** d || 0).toLocaleString()} h`;
const n0 = (n) => (Math.round(n) || 0).toLocaleString();

function useAssumptions() {
  const [a, setA] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('optimize:assumptions') || '{}');
      return { ...DEFAULTS, ...saved, capture: { ...DEFAULTS.capture, ...saved.capture } };
    } catch {
      return DEFAULTS;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('optimize:assumptions', JSON.stringify(a));
    } catch {
      /* private window */
    }
  }, [a]);
  return [a, setA];
}

// Dollars for a change (optimised minus current, per 4-week cycle).
//   Hard savings: kilometres not driven, and (if cleaners are paid until they're back at
//   the office) paid hours that disappear. Capacity: free blocks big enough to sell; only
//   worth money if customers are found for them (capture), at revenue per cleaner-hour less
//   variable costs and, when pay follows the route, the wages to do the work.
function money(delta, A, rate, capture) {
  const mileage = -delta.km * A.perKm;
  const wages = A.pay === 'route' ? (-delta.paidRouteCleanerMin / 60) * A.labour : 0;
  const hours = Math.max(delta.sellableCleanerMin, 0) / 60;
  const gpPerHour = rate * (1 - A.variable / 100) - (A.pay === 'route' ? A.labour : 0);
  const share = capture / 100;
  return {
    mileage,
    wages,
    hard: mileage + wages,
    hours,
    revenue: hours * share * rate,
    gp: hours * share * gpPerHour,
    total: mileage + wages + hours * share * gpPerHour,
    driveHours: -delta.driveCleanerMin / 60,
    idleHours: -delta.fragCleanerMin / 60,
  };
}
const yearly = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v * CYCLES_PER_YEAR]));
const deltaOf = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, (b[k] || 0) - (a[k] || 0)]));

export default function Optimize({ onError, go }) {
  const [from] = useState(monday());
  const [tab, setTab] = useState('today');
  const [A, setA] = useAssumptions();
  const cur = useLoad(() => api.optCurrent({ from }), `optc:${from}`, onError);
  const [prog, setProg] = useState(null);
  useEffect(() => {
    if (!cur.loading) return setProg(null);
    const t = setInterval(() => api.optStatus().then((r) => setProg(r.progress)).catch(() => {}), 800);
    return () => clearInterval(t);
  }, [cur.loading]);
  const c = cur.data;
  const rate = Number(A.rate) || c?.data.revenuePerCleanerHour || 55;
  // Strategy and constraints used by the roadmap (a preset, or the scenario lab's own).
  const [planWith, setPlanWith] = useState({ preset: 'balanced' });
  const [showA, setShowA] = useState(false);

  return (
    <>
      <PageHeader
        title="Schedule optimization"
        subtitle="How much more production and profit the current team and customers could give, and a step-by-step way to get there without upsetting customers or cleaners."
        actions={
          <button className={`btn ${showA ? 'primary' : 'ghost'}`} onClick={() => setShowA(!showA)}>
            <Icon name="money" size={15} /> Assumptions
          </button>
        }
      />
      {showA && <Assumptions A={A} setA={setA} c={c} rate={rate} />}
      <ErrorNote error={cur.error} />
      {cur.loading && (
        <div className="loading-card">
          <b>{!prog ? 'Reading the 4-week cycle from MaidCentral…' : prog.stage === 'locations' ? 'Loading customer locations…' : `Reading the schedule: day ${prog.done} of ${prog.total}`}</b>
          <div className="progress"><i style={{ width: `${!prog ? 4 : prog.stage === 'locations' ? 10 : 10 + (prog.done / prog.total) * 90}%` }} /></div>
          <span className="muted small">About 20 seconds the first time; then it's kept for 15 minutes.</span>
        </div>
      )}
      {c && (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              ['today', '1. Where we are'],
              ['possible', '2. What’s possible'],
              ['roadmap', '3. Roadmap'],
              ['lab', '4. Scenario lab'],
              ['sustain', '5. Keep it optimized'],
            ]}
          />
          {tab === 'today' && <Today c={c} A={A} rate={rate} />}
          {tab === 'possible' && <Possible from={from} c={c} A={A} rate={rate} onError={onError} onPlan={(p) => (setPlanWith({ preset: p }), setTab('roadmap'))} />}
          {tab === 'roadmap' && <Roadmap from={from} A={A} rate={rate} planWith={planWith} setPlanWith={setPlanWith} onError={onError} />}
          {tab === 'lab' && <Lab from={from} c={c} A={A} rate={rate} onError={onError} onUse={(q) => (setPlanWith(q), setTab('roadmap'))} />}
          {tab === 'sustain' && <Sustain from={from} c={c} planWith={planWith} onError={onError} go={go} />}
          <p className="muted small method">
            How this works: {n0(c.data.located)} of {n0(c.data.jobs)} jobs in the 4 weeks from {from} have a location from MaidCentral's Customer Efficiency Map. Drive
            times are estimates (straight line × 1.3 at 40 km/h; real routes vary by about ±25%). Each customer's visits move together, so they keep one team, one day and
            their frequency. Dollars use the assumptions (top right). Nothing changes until you change it in MaidCentral.
          </p>
        </>
      )}
    </>
  );
}

function Assumptions({ A, setA, c, rate }) {
  const set = (k) => (e) => setA({ ...A, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });
  const setCap = (k) => (e) => setA({ ...A, capture: { ...A.capture, [k]: Number(e.target.value) } });
  return (
    <Card title={<>Assumptions for the dollars <Help wide>Your numbers, kept on this device. Hard savings are money not spent. Capacity is time freed that only becomes revenue if new customers fill it: the share you expect to fill is set per scenario.</Help></>} actions={<button className="btn ghost sm" onClick={() => setA(DEFAULTS)}>Reset</button>}>
      <div className="assume-grid">
        <label className="field"><span>Labour cost per cleaner-hour</span><input type="number" step="0.5" value={A.labour} onChange={set('labour')} /><small>Wage plus payroll taxes and benefits</small></label>
        <label className="field"><span>Cleaners are paid…</span>
          <select value={A.pay} onChange={set('pay')}>
            <option value="route">until they're back at the office</option>
            <option value="fixed">a fixed day ({c?.data.leaveAt}–{c?.data.returnBy})</option>
          </select>
          <small>{A.pay === 'route' ? 'Shorter days save wages' : 'Shorter days only free up time to sell'}</small>
        </label>
        <label className="field"><span>Vehicle cost per km</span><input type="number" step="0.01" value={A.perKm} onChange={set('perKm')} /><small>Fuel, wear, insurance per km driven</small></label>
        <label className="field"><span>Revenue per cleaner-hour</span><input type="number" step="1" placeholder={String(c?.data.revenuePerCleanerHour || 55)} value={A.rate} onChange={set('rate')} /><small>{A.rate ? 'Your figure' : c?.data.revenuePerCleanerHour ? `$${rate.toFixed(2)} from today's Dispatch Board (${c.data.revenueFromJobs} jobs)` : 'Estimate: enter yours'}</small></label>
        <label className="field"><span>Supplies & other variable costs</span><input type="number" step="1" value={A.variable} onChange={set('variable')} /><small>% of revenue</small></label>
        <div className="field"><span>New demand you'd win for freed time</span>
          <div className="capture">
            {STRATEGIES.map((s) => (
              <label key={s.id}>{s.scenario}<input type="number" min="0" max="100" step="5" value={A.capture[s.id]} onChange={setCap(s.id)} />%</label>
            ))}
          </div>
          <small>Freed time is only worth revenue if customers book it</small>
        </div>
      </div>
    </Card>
  );
}

// ---------- 1. Where we are ----------

function Today({ c, A, rate }) {
  const t = c.totals;
  const perDay = (min) => (t.teamDays ? min / t.teamDays : 0);
  const paid = A.pay === 'route' ? t.paidRouteCleanerMin : t.paidFixedCleanerMin;
  const driveCost = ((t.driveCleanerMin / 60) * A.labour + t.km * A.perKm) * CYCLES_PER_YEAR;
  const idleCost = (t.fragCleanerMin / 60) * A.labour * CYCLES_PER_YEAR;
  const fragmented = c.areas.filter((a) => a.area !== 'Unknown area' && a.jobsPerVisit <= 1.3 && a.teams >= 4);
  return (
    <>
      <Stats
        items={[
          { label: 'Productive share of paid time', value: `${Math.round((t.onsiteCleanerMin / Math.max(paid, 1)) * 100)}%`, hint: 'cleaning ÷ paid hours', help: A.pay === 'route' ? 'Cleaning time ÷ paid time, counting each crew from leaving the office until they are back.' : `Cleaning time ÷ the paid day (${c.data.leaveAt}–${c.data.returnBy}).` },
          { label: 'Driving per car per day', value: h(perDay(t.driveMin), 1), hint: `${n0(t.km * CYCLES_PER_YEAR)} km a year`, tone: perDay(t.driveMin) > 75 ? 'warn' : '' },
          { label: 'Cost of driving', value: $(driveCost), hint: 'a year: wages while driving + vehicle', tone: 'bad' },
          { label: 'Idle gaps between jobs', value: h(t.fragCleanerMin * CYCLES_PER_YEAR), hint: `a year (${$(idleCost)} of paid time)`, help: 'Free time too short to sell (under 2 hours): waiting between jobs. Paid, but not productive.' },
          { label: 'Free time to sell', value: h(t.sellableCleanerMin * CYCLES_PER_YEAR), hint: 'a year, in blocks of 2 h+', help: 'Blocks of 2 hours or more inside the working day where another clean could go.' },
          t.overtimeCleanerMin > 0 && { label: 'Back after the return time', value: h(t.overtimeCleanerMin * CYCLES_PER_YEAR), hint: `a year, past ${c.data.returnBy}`, tone: 'warn' },
        ]}
      />
      <div className="grid2">
        <Card title={<>Teams <Help>Over the 4-week cycle. Sorted with the least productive first. Areas = how many areas hold 85% of the team's jobs (fewer is tighter).</Help></>} className="flush">
          <div className="tablewrap">
            <table className="data">
              <thead><tr><th>Team</th><th>Days</th><th>Cleaning share</th><th>Driving / day</th><th>Idle / day <Help>Cleaner-hours a day spent waiting in gaps too short to sell.</Help></th><th>To sell / day</th><th>Areas</th></tr></thead>
              <tbody>
                {c.teams.map((x) => (
                  <tr key={x.id}>
                    <td className="nowrap"><span className="team-swatch" style={{ '--team': teamColor(x).bg }} />{x.name}</td>
                    <td>{x.teamDays}</td>
                    <td><Bar pct={(x.onsiteCleanerMin / Math.max(A.pay === 'route' ? x.paidRouteCleanerMin : x.paidFixedCleanerMin, 1)) * 100} /></td>
                    <td>{h(x.driveMin / Math.max(x.teamDays, 1), 1)}</td>
                    <td>{h(x.fragCleanerMin / Math.max(x.teamDays, 1), 1)}</td>
                    <td>{h(x.sellableCarMin / Math.max(x.teamDays, 1), 1)}</td>
                    <td>{x.zones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title={<>Areas: how spread out the work is <Help>Jobs in the cycle, how many separate team-days visit the area, and how many teams. One job per visit spread over many teams means lots of driving in and out.</Help></>} className="flush">
          <div className="tablewrap scroll-y">
            <table className="data">
              <thead><tr><th>Area</th><th>Jobs</th><th>Team visits</th><th>Teams</th><th>Jobs / visit</th><th>Drive in</th></tr></thead>
              <tbody>
                {c.areas.map((a) => (
                  <tr key={a.area}>
                    <td>{a.area}{fragmented.includes(a) && <span className="pill warn small-pill">spread out</span>}</td>
                    <td>{a.jobs}</td>
                    <td>{a.teamDays}</td>
                    <td>{a.teams}</td>
                    <td>{a.jobsPerVisit}</td>
                    <td>{a.approachMin} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card title={<>Visits that cost the most driving <Help>How much extra driving each recurring visit adds to its team's day (compared with the day without it). The nearest other team working that day is where it might fit better.</Help></>} className="flush">
        {!c.costly.length && <Empty icon="check" title="No visit adds more than 15 minutes of driving" />}
        <div className="tablewrap">
          <table className="data">
            <thead><tr><th>Customer</th><th>Area</th><th>Frequency</th><th>Team & day</th><th>Extra driving</th><th>Cost a year</th><th>Nearest other team that day</th></tr></thead>
            <tbody>
              {c.costly.map((x) => (
                <tr key={`${x.title}${x.weekday}`}>
                  <td><b>{x.home}</b></td>
                  <td>{x.area || '–'}</td>
                  <td>{x.frequency ? plainFreq(x.frequency) : 'One-time'}</td>
                  <td>{x.team} · {x.weekday}s</td>
                  <td>{x.extraMinPerVisit} min / visit</td>
                  <td>{$(((x.extraMinPerCycle * 2) / 60) * A.labour * CYCLES_PER_YEAR + (x.extraMinPerCycle / 60) * 40 * A.perKm * CYCLES_PER_YEAR)}</td>
                  <td>{x.nearest ? `${x.nearest.team}, ${x.nearest.km} km away` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="muted small">Revenue rate used for opportunities: ${rate.toFixed(2)} per cleaner-hour. Per-team and per-area numbers are for the 4 weeks shown; "a year" multiplies the 4 weeks by 13.</p>
    </>
  );
}

const Bar = ({ pct }) => (
  <span className="mini-bar"><i style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 75 ? 'var(--ok)' : pct >= 60 ? 'var(--warn)' : 'var(--bad)' }} /><b>{Math.round(pct)}%</b></span>
);

// ---------- 2. What's possible ----------

function Possible({ from, c, A, rate, onError, onPlan }) {
  const cmp = useLoad(() => api.optCompare({ from }), `cmp:${from}`, onError);
  const data = cmp.data;
  if (cmp.loading) return <Skeleton rows={6} height={34} />;
  if (!data) return <ErrorNote error={cmp.error} />;
  const rows = data.strategies.map((s) => {
    const d = deltaOf(data.current, s.optimised);
    return { ...s, d, m: yearly(money(d, A, rate, A.capture[s.id])), meta: STRATEGIES.find((x) => x.id === s.id) };
  });
  const rebuild = rows.find((r) => r.id === 'rebuild');
  const avgJobH = c.totals.onsiteCleanerMin / Math.max(c.totals.jobs, 1) / 60;
  return (
    <>
      <div className="headline-grid">
        <div className="card headline">
          <span className="muted small">If everything could be reorganised (theoretical)</span>
          <b className="big-num">{h(-rebuild.d.driveCleanerMin * CYCLES_PER_YEAR)}</b>
          <span>less driving a year, {n0(-rebuild.d.km * CYCLES_PER_YEAR)} km fewer</span>
        </div>
        <div className="card headline">
          <span className="muted small">Time freed for more cleans (theoretical)</span>
          <b className="big-num">{h(rebuild.d.sellableCleanerMin * CYCLES_PER_YEAR)}</b>
          <span>≈ {n0((rebuild.d.sellableCleanerMin * CYCLES_PER_YEAR) / 60 / avgJobH)} more cleans a year with the same team</span>
        </div>
        <div className="card headline">
          <span className="muted small">Team-days the work actually needs</span>
          <b className="big-num">{rebuild.capacityBound.teamDaysNeeded}</b>
          <span>if work and driving were packed into full days, vs {rebuild.capacityBound.teamDaysUsed} team-days with jobs in the optimised plan and {c.totals.teamDays - c.totals.emptyTeamDays} now (4 weeks). Each team-day freed is a crew-day for new customers.</span>
        </div>
      </div>
      <Card title={<>Four ways to optimise, side by side <Help wide>Each column is the same schedule optimised under different rules. Hard savings happen without any new customers. Gross profit from freed time depends on finding customers for it (the "new demand you'd win" share in Assumptions). All figures are a year.</Help></>} className="flush">
        <div className="tablewrap">
          <table className="data compare">
            <thead>
              <tr>
                <th />
                {rows.map((r) => <th key={r.id}><b>{r.meta.scenario}</b><span>{r.label}</span></th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="sub"><td colSpan={5}>Rules</td></tr>
              <Row label="Appointment times may move" cells={rows.map((r) => `${r.constraints.early} min earlier / ${r.constraints.late} min later`)} />
              <Row label="Customers may change team" cells={rows.map((r) => (r.constraints.teams ? (r.constraints.protectWeekly ? 'Yes (not weekly)' : 'Yes') : 'No'))} />
              <Row label="Customers may change day" cells={rows.map((r) => (r.constraints.days ? (r.constraints.protectWeekly ? 'Yes (not weekly)' : 'Yes') : 'No'))} />
              <Row label="Teams stay in their areas" cells={rows.map((r) => (r.constraints.territories ? 'Yes' : 'No'))} />
              <tr className="sub"><td colSpan={5}>Operations (a year)</td></tr>
              <Row label="Driving saved" cells={rows.map((r) => `${h(r.m.driveHours * 60)} · ${n0(-r.d.km * CYCLES_PER_YEAR)} km`)} />
              <Row label="Idle gaps removed" cells={rows.map((r) => h(r.m.idleHours * 60))} />
              <Row label="Free time to sell (2 h+ blocks)" cells={rows.map((r) => `+${h(r.m.hours * 60)}`)} />
              <Row label="More cleans possible" cells={rows.map((r) => `≈ ${n0(r.m.hours / avgJobH)}`)} />
              <tr className="sub"><td colSpan={5}>Money (a year)</td></tr>
              <Row label={<>Hard savings <Help>Vehicle costs for kilometres not driven{A.pay === 'route' ? ', plus wages for shorter paid days' : ''}. Real money, no new customers needed.</Help></>} cells={rows.map((r) => <b className="ok-text">{$(r.m.hard)}</b>)} />
              <Row label={`Revenue if freed time is filled`} cells={rows.map((r) => `${$(r.m.revenue)} (${A.capture[r.id]}% filled)`)} />
              <Row label={<>Gross profit if filled <Help>Revenue less supplies{A.pay === 'route' ? ' and the wages to do the work' : ' (wages are already paid for the day)'}.</Help></>} cells={rows.map((r) => $(r.m.gp))} />
              <Row label={<b>Total value</b>} cells={rows.map((r) => <b>{$(r.m.total)}</b>)} />
              <tr className="sub"><td colSpan={5}>Getting there</td></tr>
              <Row label="Changes" cells={rows.map((r) => `${r.recommendations} (${r.byPhase.map((n, i) => `${n} in phase ${i + 1}`).filter((x) => !x.startsWith('0')).join(', ') || 'none'})`)} />
              <Row label="Customer disruption" cells={rows.map((r) => (r.id === 'minimal' ? 'Low: small time changes' : r.id === 'balanced' ? 'Medium: some new teams' : r.id === 'maximum' ? 'High: new days for some' : 'Very high: not realistic at once'))} />
              <tr>
                <td />
                {rows.map((r) => <td key={r.id}><button className="btn ghost sm" onClick={() => onPlan(r.id)}>See the roadmap</button></td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card-foot muted small">Confidence: driving and idle time are estimates (±25%). Hard savings are the most reliable; gross profit from freed time depends on sales. "Rebuild from scratch" is a ceiling, not a plan.</div>
      </Card>
    </>
  );
}
const Row = ({ label, cells }) => (
  <tr>
    <td className="row-label">{label}</td>
    {cells.map((x, i) => <td key={i}>{x}</td>)}
  </tr>
);

// ---------- 3. Roadmap ----------

function Roadmap({ from, A, rate, planWith, setPlanWith, onError }) {
  const q = { from, ...planWith };
  const run = useLoad(() => api.optRun(q), `run:${JSON.stringify(q)}`, onError);
  const r = run.data;
  const presetId = planWith.preset && Object.keys(planWith).length === 1 ? planWith.preset : 'custom';
  const capture = A.capture[presetId] ?? A.capture.balanced;
  const [chosen, setChosen] = useState(null);
  const [open, setOpen] = useState(null);
  const [phaseFilter, setPhaseFilter] = useState(0);
  // Each recommendation's value; then the best first within each phase.
  const recs = useMemo(() => (r ? r.recommendations.map((x) => ({ ...x, m: yearly(money(x.delta, A, rate, capture)) })) : []), [r, A, rate, capture]);
  useEffect(() => setChosen(r ? new Set(recs.filter((x) => x.phase === 1 && x.m.total > 0).map((x) => x.id)) : null), [r]);
  const ids = chosen ? [...chosen].sort().join(',') : '';
  const [combined, setCombined] = useState(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!r || !chosen) return undefined;
    const n = ++seq.current;
    const t = setTimeout(() => {
      api.optApply({ ...q, ids }).then((x) => n === seq.current && setCombined(x)).catch(onError);
    }, 300);
    return () => clearTimeout(t);
  }, [ids, r]);

  if (run.loading) return <Skeleton rows={8} height={40} />;
  if (!r) return <ErrorNote error={run.error} />;
  const comb = combined && combined.chosen === chosen?.size ? yearly(money(deltaOf(r.current, combined.optimised), A, rate, capture)) : null;
  const customersHit = new Set(recs.filter((x) => chosen?.has(x.id)).flatMap((x) => x.customers.map((y) => y.title)));
  const toggle = (id) => setChosen((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const setPhase = (p, on) => setChosen((s) => {
    const n = new Set(s);
    for (const x of recs.filter((y) => y.phase === p && y.m.total > 0)) on ? n.add(x.id) : n.delete(x.id);
    return n;
  });
  return (
    <>
      <div className="roadmap-head">
        <div className="segmented">
          {STRATEGIES.filter((s) => s.id !== 'rebuild').map((s) => (
            <button key={s.id} className={presetId === s.id ? 'on' : ''} onClick={() => setPlanWith({ preset: s.id })}>{s.label}</button>
          ))}
          {presetId === 'custom' && <button className="on">Your scenario</button>}
        </div>
        <span className="muted small">{recs.length} changes found · tick the ones you'd make; the totals update.</span>
      </div>
      <div className="impact-bar">
        <div><span className="muted small">Chosen</span><b>{chosen?.size || 0} changes</b><span className="muted small">{customersHit.size} customers to contact</span></div>
        <div><span className="muted small">Hard savings a year</span><b className="ok-text">{comb ? $(comb.hard) : '…'}</b><span className="muted small">{comb ? `${h(comb.driveHours * 60)} less driving · ${n0((-((combined?.optimised.km || 0) - r.current.km)) * CYCLES_PER_YEAR)} km` : ''}</span></div>
        <div><span className="muted small">Freed time to sell a year</span><b>{comb ? `+${h(comb.hours * 60)}` : '…'}</b><span className="muted small">{comb ? `${$(comb.gp)} gross profit if ${capture}% filled` : ''}</span></div>
        <div><span className="muted small">Total value a year</span><b>{comb ? $(comb.total) : '…'}</b>{combined?.skipped?.length ? <span className="warn-text small">{combined.skipped.length} need another change first</span> : <span className="muted small">combined, not just added up</span>}</div>
      </div>
      <div className="chip-row">
        {[0, 1, 2, 3].map((p) => (
          <button key={p} className={phaseFilter === p ? 'chip on' : 'chip'} onClick={() => setPhaseFilter(p)}>
            {p ? `Phase ${p}` : 'All phases'} <span className="muted">{p ? recs.filter((x) => x.phase === p).length : recs.length}</span>
          </button>
        ))}
      </div>
      {!recs.length && <Empty icon="check" title="No changes worth making under these rules">Allow more flexibility in the Scenario lab to see what it would unlock.</Empty>}
      {[1, 2, 3].filter((p) => !phaseFilter || p === phaseFilter).map((p) => {
        const list = recs.filter((x) => x.phase === p && x.m.total > 0).sort((a, b) => b.m.total - a.m.total);
        if (!list.length) return null;
        const allOn = list.every((x) => chosen?.has(x.id));
        const sum = list.reduce((s, x) => s + x.m.total, 0);
        return (
          <Card
            key={p}
            title={<>{PHASES[p].title} <span className="muted small">{PHASES[p].when}</span> <Help>{PHASES[p].detail}</Help></>}
            actions={
              <>
                <span className="muted small">{list.length} changes · about {$(sum)} a year</span>
                <button className="btn ghost sm" onClick={() => setPhase(p, !allOn)}>{allOn ? 'Untick all' : 'Tick all'}</button>
              </>
            }
            className="flush"
          >
            {list.map((x) => (
              <div key={x.id} className={`rec ${chosen?.has(x.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={chosen?.has(x.id) || false} onChange={() => toggle(x.id)} aria-label={x.title} />
                <div className="rec-body">
                  <button className="rec-title" onClick={() => setOpen(open === x.id ? null : x.id)}>
                    <b>{x.title}</b>
                    <Icon name={open === x.id ? 'close' : 'external'} size={13} />
                  </button>
                  <span className="muted small">{x.why}</span>
                  <div className="rec-pills">
                    <span className={`pill ${x.impact === 'low' ? 'ok' : x.impact === 'medium' ? 'warn' : 'bad'}`}>Customer impact: {x.impact}</span>
                    <span className={`pill ${x.complexity === 'low' ? 'ok' : x.complexity === 'medium' ? 'warn' : 'bad'}`}>Effort: {x.complexity}</span>
                    <span className={`pill ${x.confidence === 'high' ? 'ok' : x.confidence === 'medium' ? 'info' : 'warn'}`}>Confidence: {x.confidence}</span>
                    <span className="pill">{x.customers.length} customer{x.customers.length === 1 ? '' : 's'}</span>
                  </div>
                  {open === x.id && (
                    <div className="rec-detail">
                      <table className="data">
                        <thead><tr><th>Customer</th><th>Now</th><th>After</th><th>Visits / 4 wks</th></tr></thead>
                        <tbody>
                          {x.customers.map((y) => (
                            <tr key={`${y.title}${y.fromDay}`}>
                              <td><b>{y.home}</b><span className="muted small block">{y.area || ''}{y.frequency ? ` · ${plainFreq(y.frequency)}` : ''}</span></td>
                              <td>{y.fromTeam} · {y.fromDay} · {y.was}</td>
                              <td className={y.newDay ? 'bad-text' : y.newTeam ? 'warn-text' : ''}>{y.toTeam} · {y.toDay} · {y.now}</td>
                              <td>{y.visits}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="muted small">
                        Over a year: {h(-x.delta.driveCleanerMin * CYCLES_PER_YEAR)} less driving (cleaner-hours), {n0(-x.delta.km * CYCLES_PER_YEAR)} km,{' '}
                        {A.pay === 'route' ? `${h(-x.delta.paidRouteCleanerMin * CYCLES_PER_YEAR)} fewer paid hours, ` : ''}
                        {x.delta.sellableCleanerMin > 0 ? `+${h(x.delta.sellableCleanerMin * CYCLES_PER_YEAR)} free time to sell. ` : ''}
                        Assumes the customers accept the change; drive times are estimates (±25%).
                      </p>
                    </div>
                  )}
                </div>
                <div className="rec-value">
                  <b>{$(x.m.total)}</b>
                  <span className="muted small">a year</span>
                  <span className="small">{x.m.hard > 0 ? `${$(x.m.hard)} saved` : ''}{x.m.hours > 0 ? `${x.m.hard > 0 ? ' · ' : ''}+${h(x.m.hours * 60)} to sell` : ''}</span>
                </div>
              </div>
            ))}
          </Card>
        );
      })}
      {recs.some((x) => x.m.total <= 0) && (
        <details className="disclosure">
          <summary>{recs.filter((x) => x.m.total <= 0).length} changes that don't pay with your assumptions <span className="muted small">(they cut driving or gaps, but cost more paid time than they save)</span></summary>
          <ul className="rules">
            {recs.filter((x) => x.m.total <= 0).map((x) => <li key={x.id}>{x.title} <span className="muted small">({$(x.m.total)} a year)</span></li>)}
          </ul>
        </details>
      )}
      <p className="muted small">Each change's value is measured after the ones before it in the list, so a selection's total is worked out again (the bar above) rather than added up. A change that relies on another (for example, a team that needs room freed first) is flagged if you pick it alone.</p>
    </>
  );
}

// ---------- 4. Scenario lab ----------

const LAB_DEFAULT = { early: 30, late: 60, teams: true, days: false, territories: true, protectWeekly: true, maxDrive: 0, minBlock: 120 };

function Lab({ from, c, A, rate, onError, onUse }) {
  const [k, setK] = useState(() => {
    try {
      return { ...LAB_DEFAULT, ...JSON.parse(localStorage.getItem('optimize:lab') || '{}') };
    } catch {
      return LAB_DEFAULT;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('optimize:lab', JSON.stringify(k));
    } catch {
      /* fine */
    }
  }, [k]);
  const [debounced, setDebounced] = useState(k);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(k), 400);
    return () => clearTimeout(t);
  }, [k]);
  const q = { from, ...Object.fromEntries(Object.entries(debounced).map(([a, b]) => [a, String(b)])) };
  const cmp = useLoad(() => api.optCompare(q), `lab:${JSON.stringify(q)}`, onError);
  const data = cmp.data;
  const capture = A.capture.balanced;
  const v = (opt) => yearly(money(deltaOf(data.current, opt), A, rate, capture));
  const set = (key, val) => setK({ ...k, [key]: val });
  const base = data ? v(data.baseOptimised) : null;
  return (
    <div className="lab">
      <Card title="Your rules">
        <div className="lab-controls">
          <label className="field"><span>Appointments may move earlier by</span>
            <select value={k.early} onChange={(e) => set('early', Number(e.target.value))}>{[0, 15, 30, 60, 90, 120, 600].map((m) => <option key={m} value={m}>{m === 600 ? 'any amount' : `${m} min`}</option>)}</select>
          </label>
          <label className="field"><span>…and later by</span>
            <select value={k.late} onChange={(e) => set('late', Number(e.target.value))}>{[0, 30, 60, 90, 120, 180, 600].map((m) => <option key={m} value={m}>{m === 600 ? 'any amount' : `${m} min`}</option>)}</select>
          </label>
          <label className="check"><input type="checkbox" checked={k.teams} onChange={(e) => set('teams', e.target.checked)} /> Customers may change team</label>
          <label className="check"><input type="checkbox" checked={k.days} onChange={(e) => set('days', e.target.checked)} /> Customers may change day</label>
          <label className="check"><input type="checkbox" checked={k.protectWeekly} onChange={(e) => set('protectWeekly', e.target.checked)} /> Weekly customers keep their team and day</label>
          <label className="check"><input type="checkbox" checked={k.territories} onChange={(e) => set('territories', e.target.checked)} /> Teams stay in the areas they serve now</label>
          <label className="field"><span>Most driving per car per day</span>
            <select value={k.maxDrive} onChange={(e) => set('maxDrive', Number(e.target.value))}>{[0, 60, 90, 120, 150].map((m) => <option key={m} value={m}>{m ? `${m} min` : 'no limit'}</option>)}</select>
          </label>
          <label className="field"><span>Shortest free block worth selling</span>
            <select value={k.minBlock} onChange={(e) => set('minBlock', Number(e.target.value))}>{[90, 120, 150, 180].map((m) => <option key={m} value={m}>{m / 60} h</option>)}</select>
          </label>
        </div>
        <div className="card-foot muted small">Working hours: cars leave at {c.data.leaveAt} and are back by {c.data.returnBy} (set for the whole app). <button className="linkish" onClick={() => setK(LAB_DEFAULT)}>Reset</button></div>
      </Card>
      <div>
        {cmp.loading && <Skeleton rows={5} height={40} />}
        <ErrorNote error={cmp.error} />
        {data && (
          <>
            <Stats
              items={[
                { label: 'Driving saved', value: h(base.driveHours * 60), hint: `${n0(-(data.baseOptimised.km - data.current.km) * CYCLES_PER_YEAR)} km a year` },
                { label: 'Hard savings', value: $(base.hard), hint: 'a year', tone: 'ok' },
                { label: 'Freed time to sell', value: `+${h(base.hours * 60)}`, hint: 'a year' },
                { label: 'Total value', value: $(base.total), hint: `a year, ${capture}% of freed time filled` },
              ]}
            />
            <Card title={<>What loosening one rule is worth <Help>Starting from your rules, each line relaxes one of them and shows the extra value a year. Use it to decide which flexibility is worth asking customers or cleaners for.</Help></>} className="flush">
              {!data.levers.length && <Empty icon="check" title="Every rule is already as loose as it goes" />}
              {data.levers.map((l) => {
                const m = v(l.optimised);
                const extra = m.total - base.total;
                return (
                  <div key={l.label} className="lever">
                    <b>{l.label}</b>
                    <span className={extra > 0 ? 'ok-text' : 'muted'}>{extra > 0 ? `+${$(extra)}` : 'no gain'} a year</span>
                    <span className="muted small">{h((m.driveHours - base.driveHours) * 60)} less driving · +{h((m.hours - base.hours) * 60)} to sell</span>
                    <button className="btn ghost sm" onClick={() => setK({ ...k, ...l.change })}>Apply</button>
                  </div>
                );
              })}
            </Card>
            <button className="btn primary" onClick={() => onUse(Object.fromEntries(Object.entries(debounced).map(([a, b]) => [a, String(b)])))}>
              <Icon name="route" size={15} /> Build a roadmap with these rules
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- 5. Keep it optimized ----------

function Sustain({ from, c, planWith, onError, go }) {
  const q = { from, ...planWith };
  const run = useLoad(() => api.optRun(q), `run:${JSON.stringify(q)}`, onError);
  const r = run.data;
  const allowsDays = r?.constraints.days;
  const qMax = { from, preset: 'maximum' };
  const maxRun = useLoad(() => (allowsDays === false ? api.optRun(qMax) : Promise.resolve(null)), `run:${allowsDays === false ? JSON.stringify(qMax) : 'same'}`, onError);
  const fragmented = c.areas.filter((a) => a.area !== 'Unknown area' && a.jobsPerVisit <= 1.5 && a.teams >= 4);
  const source = allowsDays === false ? maxRun.data : r;
  const later = source ? source.recommendations.filter((x) => x.phase === 3) : [];
  const fit = (weeks) => (weeks.length >= 4 ? 'weekly' : weeks.length >= 2 ? 'every other week' : 'every 4 weeks or one-time');
  return (
    <>
      <div className="grid2">
        <Card title={<>Where new customers should go <Help>Free blocks of 2 h or more after the roadmap's changes, next to where a team already is. Booking new customers here fills routes instead of adding driving. Weeks = which weeks of the cycle the block is free.</Help></>} actions={<button className="btn ghost sm" onClick={() => go('/openings?tab=place')}>Place a customer</button>} className="flush">
          {run.loading && <Skeleton rows={6} height={28} />}
          {r && !r.sellable.length && <Empty icon="check" title="No free blocks of 2 h+ left" />}
          {r && (
            <div className="tablewrap scroll-y">
              <table className="data">
                <thead><tr><th>Area</th><th>Day & team</th><th>Free</th><th>Weeks</th><th>Suits</th></tr></thead>
                <tbody>
                  {r.sellable.map((x) => (
                    <tr key={`${x.zone}${x.weekday}${x.teamId}`}>
                      <td>{x.zone}</td>
                      <td>{x.weekday} · {x.team}</td>
                      <td>{x.hours} h from {x.from}</td>
                      <td>{x.weeks.join(', ')}</td>
                      <td>{fit(x.weeks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title={<>Offer at the next reschedule <Help>Changes that need a customer to move to another day (from the Maximum profit plan). Don't ask everyone at once: when one of these customers calls to reschedule, skips, or renews, offer the new day. The schedule moves toward the optimum through normal turnover.</Help></>} actions={<span className="muted small">{later.length} customers</span>} className="flush">
          {(run.loading || maxRun.loading) && <Skeleton rows={4} height={28} />}
          {source && !later.length && <Empty icon="check" title="No day changes would help">Every customer is already on a good day.</Empty>}
          {later.slice(0, 15).map((x) => (
            <div key={x.id} className="call">
              <span className="pill bad">New day</span>
              <div className="call-body"><b>{x.title}</b><span className="muted small">{x.customers.map((y) => `${y.home}: ${y.fromDay} ${y.was} → ${y.toDay} ${y.now} with ${y.toTeam}`).join(' · ')}</span></div>
              <span />
            </div>
          ))}
        </Card>
      </div>
      <div className="grid2">
        <Card title={<>Areas to consolidate <Help>Areas where work is spread thinly over many teams and days (about one job per visit). Each new booking, cancellation or reschedule there is a chance to move that area's work onto fewer teams and days.</Help></>} className="flush">
          {!fragmented.length && <Empty icon="check" title="No area is spread thin" />}
          {fragmented.length > 0 && (
            <div className="tablewrap scroll-y">
              <table className="data">
                <thead><tr><th>Area</th><th>Jobs</th><th>Now</th><th>Aim for</th></tr></thead>
                <tbody>
                  {fragmented.map((a) => (
                    <tr key={a.area}>
                      <td><b>{a.area}</b></td>
                      <td>{a.jobs}</td>
                      <td>{a.teamDays} visits by {a.teams} teams</td>
                      <td>{Math.ceil(a.jobs / 3)} visits by {Math.min(a.teams, Math.max(1, Math.ceil(a.jobs / 12)))} team{Math.ceil(a.jobs / 12) > 1 ? 's' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card-foot muted small">Aim: about 3 jobs per team visit, so a car does an area in one go. Book new customers in these areas on the days their teams are already there, and use cancellations to move the stragglers.</div>
        </Card>
        <Card title="Rules that keep the schedule tight">
          <ul className="rules">
            <li><b>New customer:</b> offer the slots under "Where new customers should go" first, then use Place a customer for a specific ZIP or nearby home.</li>
            <li><b>Cancellation:</b> don't just leave the gap. Offer it to a customer from the same area on another team (see the roadmap's moves), or to a new customer in that area.</li>
            <li><b>Reschedule request:</b> check "Offer at the next reschedule" first: the customer may already have a better day waiting.</li>
            <li><b>Each week:</b> pick the top phase 1 changes, then one or two phase 2 changes per team, so no team or customer sees too much change at once.</li>
            <li><b>Watch the costly visits</b> on "Where we are"; they're the first to move when a chance comes up.</li>
          </ul>
          <p className="muted small">This page is worked out again from MaidCentral's live schedule (refreshed every 15 minutes), so as customers are added, cancelled or rescheduled, the recommendations move with them.</p>
        </Card>
      </div>
    </>
  );
}
