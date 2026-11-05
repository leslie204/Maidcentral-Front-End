import { useMemo, useState } from 'react';
import { api, today, shiftDay } from './api.js';
import { useLoad } from './hooks.js';
import Icon from './Icon.jsx';
import { PageHeader, Stats, Skeleton, ErrorNote, Empty, Card, Help, Tabs } from './ui.jsx';

// Scorecards: what customers said after their clean (MaidCentral's 0–4 scorecards), with
// trends, insights, who to follow up with, and how teams and cleaners are doing.

const SCORE_TONE = { 4: 'ok', 3: 'info', 2: 'warn', 1: 'bad', 0: 'bad' };
const day = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' });
};
const delta = (a, b, digits = 2) => (a == null || b == null ? null : Math.round((a - b) * 10 ** digits) / 10 ** digits);
const signed = (n, unit = '') => (n == null ? '' : `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}${unit}`);
const RANGES = [
  ['30 days', 29],
  ['90 days', 89],
  ['6 months', 182],
  ['12 months', 364],
];

export default function Scorecards({ onError }) {
  const [range, setRange] = useState({ from: shiftDay(today(), -29), to: today() });
  const q = { from: range.from, to: range.to };
  const r = useLoad(() => api.scorecards(q), `sc:${range.from}:${range.to}`, onError);
  const d = r.data?.from === range.from && r.data?.to === range.to ? r.data : null;
  const [tab, setTab] = useState('teams');
  return (
    <>
      <PageHeader
        title="Scorecards"
        subtitle="What customers say after each clean (MaidCentral scorecards, 0–4), how it's trending, and who needs a call."
        actions={
          <div className="sc-range">
            {RANGES.map(([l, n]) => (
              <button key={l} className={`chip ${range.to === today() && range.from === shiftDay(today(), -n) ? 'on' : ''}`} onClick={() => setRange({ from: shiftDay(today(), -n), to: today() })}>Last {l}</button>
            ))}
            <input type="date" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} aria-label="From" />
            <input type="date" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} aria-label="To" />
          </div>
        }
      />
      <ErrorNote error={r.error} />
      {!d && !r.error && (
        <div className="loading-card">
          <b>Reading scorecards from MaidCentral…</b>
          <span className="muted small">About 15 seconds the first time (this period and the one before it, for comparison).</span>
        </div>
      )}
      {d && <Report d={d} tab={tab} setTab={setTab} />}
    </>
  );
}

function Report({ d, tab, setTab }) {
  const n = d.now;
  const b = d.before;
  const dAvg = delta(n.average, b.average);
  const dConcern = delta(n.concernShare, b.concernShare, 1);
  return (
    <>
      <Stats
        items={[
          { label: 'Average score', value: n.average == null ? '–' : `${n.average} / 4`, hint: b.average != null ? `${signed(dAvg)} vs previous ${b.average}` : `${n.responses} responses`, tone: dAvg == null ? '' : dAvg >= 0 ? 'ok' : 'warn', help: '4 Thrilled · 3 Happy · 2 A few concerns · 1 Major concerns · 0 Considering another company.' },
          { label: 'Thrilled (4)', value: n.thrilledShare == null ? '–' : `${Math.round(n.thrilledShare)}%`, hint: `${n.thrilled} of ${n.responses} responses` },
          { label: 'Concerns (0–2)', value: n.concerns, hint: n.concernShare != null ? `${n.concernShare}% · ${signed(dConcern, ' pts')} vs before` : '', tone: n.concerns ? 'bad' : 'ok' },
          { label: 'Considering leaving', value: n.atRisk, hint: 'scored 0', tone: n.atRisk ? 'bad' : 'ok' },
          { label: 'Response rate', value: n.responseRate == null ? '–' : `${Math.round(n.responseRate)}%`, hint: `${n.responses} of ${n.sent} scorecards answered`, help: 'Share of scorecards sent that a customer answered. With few answers, a couple of low scores move the averages a lot.' },
        ]}
      />
      <Card title={<>What stands out <Help>Worked out from the scorecards in this period, compared with the {day(d.previous.from)}–{day(d.previous.to)} period before it.</Help></>}>
        <ul className="sc-insights">
          {d.insights.map((x, i) => (
            <li key={i} className={x.tone}><Icon name={x.tone === 'good' ? 'check' : x.tone === 'info' ? 'sparkle' : 'alert'} size={15} /> {x.text}</li>
          ))}
        </ul>
      </Card>
      <div className="grid2">
        <Card title="Average score by week" className="flush"><ScoreLine weeks={d.trend} /></Card>
        <Card title="Responses by week" className="flush"><ResponseBars weeks={d.trend} /></Card>
      </div>
      <div className="grid2">
        <Card title="How customers scored">
          <div className="sc-dist">
            {n.byScore.map((s) => (
              <div key={s.score} className="sc-dist-row">
                <span className="sc-dist-label"><b>{s.score}</b> {s.label}</span>
                <span className="sc-dist-bar"><i className={SCORE_TONE[s.score]} style={{ width: `${n.responses ? (s.count / n.responses) * 100 : 0}%` }} /></span>
                <span className="sc-dist-n">{s.count} <span className="muted small">{n.responses ? `${Math.round((s.count / n.responses) * 100)}%` : ''}</span></span>
              </div>
            ))}
          </div>
        </Card>
        <Card title={<>What concerns are about <Help>Themes found in the comments on 0–2 scores (a comment can mention several).</Help></>}>
          {!d.themes.length && <Empty icon="check" title="No concern comments in this period" />}
          <div className="sc-dist">
            {d.themes.map((t) => (
              <div key={t.theme} className="sc-dist-row">
                <span className="sc-dist-label">{t.theme}</span>
                <span className="sc-dist-bar"><i className="warn" style={{ width: `${(t.count / Math.max(...d.themes.map((x) => x.count))) * 100}%` }} /></span>
                <span className="sc-dist-n">{t.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['teams', 'Teams'],
          ['cleaners', 'Cleaners'],
          ['comments', 'Comments', d.comments.length],
        ]}
      />
      {tab === 'teams' && <People rows={d.teams} kind="team" overall={n} />}
      {tab === 'cleaners' && <People rows={d.cleaners} kind="cleaner" overall={n} />}
      {tab === 'comments' && <Comments list={d.comments} />}
      <p className="muted small">From MaidCentral's Scorecard Results, by the date of the clean. Teams come from the Dispatch Board for that visit. Read {new Date(d.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>
    </>
  );
}

const ScorePill = ({ s }) => <span className={`pill ${SCORE_TONE[s.score]}`}>{s.score} · {s.label}</span>;

function People({ rows, kind, overall }) {
  const [min, setMin] = useState(kind === 'cleaner' ? 5 : 1);
  const list = rows.filter((x) => x.responses >= min);
  return (
    <Card
      className="flush"
      actions={<label className="inline-field small">At least<select value={min} onChange={(e) => setMin(Number(e.target.value))}>{[1, 5, 10, 20].map((x) => <option key={x} value={x}>{x}</option>)}</select>responses</label>}
      title={kind === 'team' ? 'By team' : 'By cleaner'}
    >
      <div className="tablewrap">
        <table className="data">
          <thead><tr><th>{kind === 'team' ? 'Team' : 'Cleaner'}</th><th>Average</th><th>Thrilled</th><th>Concerns</th><th>Responses</th><th>Last concern</th></tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.name}>
                <td><b>{x.name}</b></td>
                <td><b className={x.average != null && x.average < overall.average - 0.1 ? 'bad-text' : ''}>{x.average ?? '–'}</b></td>
                <td>{x.thrilledShare == null ? '–' : `${Math.round(x.thrilledShare)}%`}</td>
                <td>{x.concerns ? <b className="bad-text">{x.concerns}</b> : 0}{x.concernShare ? <span className="muted small"> ({Math.round(x.concernShare)}%)</span> : ''}</td>
                <td>{x.responses}<span className="muted small"> of {x.sent} ({Math.round(x.responseRate || 0)}%)</span></td>
                <td className="small">{x.lastConcern ? `${day(x.lastConcern.date)} · ${x.lastConcern.customer} (${x.lastConcern.score})` : <span className="muted">none</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.length && <Empty icon="users" title="Nobody with that many responses" />}
      <div className="card-foot muted small">A visit counts for every cleaner on it{kind === 'team' ? ' and every team on it' : ''}. Red average: more than 0.1 below the overall {overall.average}.</div>
    </Card>
  );
}

function Comments({ list }) {
  const [show, setShow] = useState('all');
  const [q, setQ] = useState('');
  const shown = list.filter((c) => (show === 'all' || (show === 'concerns' ? c.score <= 2 : c.score >= 3)) && (!q || `${c.customer} ${c.comment} ${c.techs.join(' ')} ${c.team || ''}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <Card className="flush" title="What customers wrote" actions={
      <div className="sc-comment-tools">
        <div className="segmented">
          {[['all', 'All'], ['concerns', 'Concerns'], ['praise', 'Praise']].map(([k, l]) => <button key={k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}
        </div>
        <input placeholder="Search comments…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
    }>
      {shown.map((c, i) => (
        <div key={i} className="sc-c">
          <ScorePill s={c} />
          <div>
            <p>{c.comment}</p>
            <span className="muted small">{c.customer} · {day(c.jobDate)} · {c.team || 'team ?'} · {c.techs.join(', ')}</span>
          </div>
        </div>
      ))}
      {!shown.length && <Empty icon="search" title="No comments match" />}
    </Card>
  );
}

// ---------- Charts (single series; hover shows the week) ----------

const W = 640;
const H = 200;
const PAD = { l: 36, r: 12, t: 14, b: 26 };

function useHover() {
  const [i, setI] = useState(null);
  return [i, setI];
}

function ScoreLine({ weeks }) {
  const pts = weeks.filter((w) => w.average != null);
  const [hover, setHover] = useHover();
  const lo = useMemo(() => Math.min(3, Math.floor(Math.min(...pts.map((w) => w.average), 4) * 2) / 2), [pts]);
  if (pts.length < 2) return <Empty icon="activity" title="Not enough weeks to show a trend" />;
  const x = (i) => PAD.l + (i / (pts.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / (4 - lo)) * (H - PAD.t - PAD.b);
  const ticks = [];
  for (let v = lo; v <= 4.001; v += 0.5) ticks.push(Math.round(v * 10) / 10);
  const path = pts.map((w, i) => `${i ? 'L' : 'M'}${x(i)},${y(w.average)}`).join(' ');
  const h = hover != null ? pts[hover] : null;
  return (
    <div className="sc-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Average score by week">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="sc-grid" />
            <text x={PAD.l - 6} y={y(t) + 4} className="sc-axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {pts.map((w, i) => (i % Math.ceil(pts.length / 7) === 0 || i === pts.length - 1) && <text key={w.week} x={x(i)} y={H - 6} className="sc-axis" textAnchor="middle">{day(w.week)}</text>)}
        <path d={path} className="sc-line" />
        {pts.map((w, i) => <circle key={w.week} cx={x(i)} cy={y(w.average)} r={hover === i ? 5 : 3.5} className="sc-dot" />)}
        {h && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="sc-cross" />}
        {pts.map((w, i) => (
          <rect key={`h${w.week}`} x={x(i) - (W / pts.length) / 2} y={0} width={W / pts.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {h && (
        <div className="sc-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>Week of {day(h.week)}</b>
          <span>Average {h.average} · {h.responses} responses</span>
          <span>{h.concerns} with concerns</span>
        </div>
      )}
    </div>
  );
}

function ResponseBars({ weeks }) {
  const [hover, setHover] = useHover();
  if (!weeks.length) return <Empty icon="activity" title="No responses" />;
  const max = Math.max(...weeks.map((w) => w.responses), 1);
  const step = (W - PAD.l - PAD.r) / weeks.length;
  const bw = Math.max(Math.min(step - 6, 28), 4);
  const y = (v) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const ticks = [0, Math.round(max / 2), max];
  const h = hover != null ? weeks[hover] : null;
  return (
    <div className="sc-chart">
      <div className="sc-legend"><span><i className="k-ok" />No concerns (3–4)</span><span><i className="k-bad" />Concerns (0–2)</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Responses by week">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="sc-grid" />
            <text x={PAD.l - 6} y={y(t) + 4} className="sc-axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const cx = PAD.l + step * i + step / 2;
          const good = w.responses - w.concerns;
          return (
            <g key={w.week} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={cx - step / 2} y={0} width={step} height={H} fill="transparent" />
              {good > 0 && <rect x={cx - bw / 2} y={y(w.responses)} width={bw} height={Math.max(y(w.concerns) - y(w.responses) - (w.concerns ? 2 : 0), 1)} rx="3" className={`sc-bar ok ${hover === i ? 'on' : ''}`} />}
              {w.concerns > 0 && <rect x={cx - bw / 2} y={y(w.concerns)} width={bw} height={Math.max(y(0) - y(w.concerns), 1)} rx="3" className={`sc-bar bad ${hover === i ? 'on' : ''}`} />}
              {(i % Math.ceil(weeks.length / 7) === 0 || i === weeks.length - 1) && <text x={cx} y={H - 6} className="sc-axis" textAnchor="middle">{day(w.week)}</text>}
            </g>
          );
        })}
      </svg>
      {h && (
        <div className="sc-tip" style={{ left: `${((PAD.l + step * hover + step / 2) / W) * 100}%` }}>
          <b>Week of {day(h.week)}</b>
          <span>{h.responses} responses of {h.sent} sent ({Math.round(h.responseRate || 0)}%)</span>
          <span>{h.concerns} with concerns</span>
        </div>
      )}
    </div>
  );
}
