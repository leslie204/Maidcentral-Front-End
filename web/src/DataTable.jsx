// Renders a table extracted from MaidCentral ({ headers, rows: [{ cells }] }).
export default function DataTable({ table, empty = 'None.', limit, onRow }) {
  if (!table) return null;
  if (table.error) return <p className="error small">{table.error}</p>;
  const rows = limit ? table.rows.slice(0, limit) : table.rows;
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <div className="tablewrap">
      <table className="data">
        <thead>
          <tr>{table.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={onRow ? 'clickable' : ''} onClick={onRow ? () => onRow(r) : undefined}>
              {table.headers.map((_, j) => <td key={j}>{r.cells[j]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {limit && table.rows.length > limit && <p className="muted small">Showing {limit} of {table.rows.length}.</p>}
    </div>
  );
}

// Label/value pairs as stat tiles.
export function Pairs({ pairs }) {
  if (!pairs) return null;
  if (pairs.error) return <p className="error small">{pairs.error}</p>;
  return (
    <div className="pairs">
      {pairs.map((p, i) => (
        <div key={i}>
          <span className="muted small">{p.label}</span>
          <b>{p.value || '–'}</b>
        </div>
      ))}
    </div>
  );
}

// Rows of a table as objects keyed by header (for building custom views).
export const asObjects = (t) => (t?.rows || []).map((r) => Object.fromEntries(t.headers.map((h, i) => [h, r.cells[i]])));
