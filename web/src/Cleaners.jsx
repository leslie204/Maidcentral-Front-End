import { useState } from 'react';
import { api } from './api.js';
import { useLoad } from './hooks.js';
import Icon from './Icon.jsx';
import { PageHeader, ErrorNote, Skeleton, Card } from './ui.jsx';

// All cleaners (MaidCentral's employee list), searchable.
export default function Cleaners({ go, onError }) {
  const { data, error, loading } = useLoad(() => api.cleaners(), 'cleaners', onError);
  const [q, setQ] = useState('');
  const headers = data?.headers || [];
  const col = (name) => headers.indexOf(name);
  const rows = (data?.rows || []).filter((r) => !q || r.cells.join(' ').toLowerCase().includes(q.toLowerCase()));
  const cell = (r, h) => (col(h) >= 0 ? r.cells[col(h)] : '');

  return (
    <>
      <PageHeader
        title="Cleaners"
        subtitle={data ? `${data.rows.length} people in MaidCentral` : 'Everyone in MaidCentral'}
        actions={
          <div className="input-icon">
            <Icon name="search" size={16} />
            <input placeholder="Filter by name, role, skill…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      />
      <ErrorNote error={error} />
      {loading && <Skeleton rows={8} height={44} />}
      {data && (
        <Card className="flush">
          <table className="data">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Skills</th><th>Contact</th><th>Hired</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const name = [cell(r, 'First Name'), cell(r, 'Last Name')].filter(Boolean).join(' ');
                return (
                  <tr key={r.id || i} className={r.id ? 'clickable' : ''} onClick={() => r.id && go(`/cleaners/${r.id}`)}>
                    <td><span className="person"><span className="avatar soft">{(name || '?')[0]}</span><b>{name}</b></span></td>
                    <td>{cell(r, 'User Role')}</td>
                    <td className="muted">{cell(r, 'Skills')}</td>
                    <td className="muted small">{cell(r, 'Contact')}</td>
                    <td className="nowrap">{cell(r, 'Hire Date')}</td>
                    <td><Icon name="chevronRight" size={16} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
