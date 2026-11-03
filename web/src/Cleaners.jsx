import { useState } from 'react';
import { api } from './api.js';
import { useLoad } from './hooks.js';

// All cleaners (MaidCentral's employee list), searchable.
export default function Cleaners({ go, onError }) {
  const { data, error, loading } = useLoad(() => api.cleaners(), 'cleaners', onError);
  const [q, setQ] = useState('');
  const headers = data?.headers || [];
  const col = (name) => headers.indexOf(name);
  const rows = (data?.rows || []).filter((r) => !q || r.cells.join(' ').toLowerCase().includes(q.toLowerCase()));
  const show = ['Last Name', 'First Name', 'User Role', 'Skills', 'Contact', 'Hire Date'].filter((h) => col(h) >= 0);

  return (
    <section>
      <div className="pagehead">
        <h2>Cleaners</h2>
        {data && <span className="muted">{data.rows.length} people</span>}
        <input className="right" placeholder="Filter by name, role, skill…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <p className="error">{error.message}</p>}
      {loading && <p className="muted">Loading from MaidCentral…</p>}
      {data && (
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>{show.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id || i} className={r.id ? 'clickable' : ''} onClick={() => r.id && go(`/cleaners/${r.id}`)}>
                  {show.map((h) => <td key={h}>{r.cells[col(h)]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
