import { useEffect, useState } from 'react';
import { api } from './api.js';

// MaidCentral's global search: customers, homes, employees and leads in one box.
export default function Search({ go, onError, initial }) {
  const [q, setQ] = useState(initial);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setResult(null);
    const t = setTimeout(() => {
      setLoading(true);
      history.replaceState(null, '', `/search?q=${encodeURIComponent(q)}`);
      api.search(q)
        .then((r) => (setResult(r), setError(null)))
        .catch((e) => (onError(e), setError(e)))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q, onError]);

  const name = (x) => [x.firstName, x.lastName].filter(Boolean).join(' ') || x.company || '(no name)';

  return (
    <section>
      <div className="pagehead">
        <h2>Search</h2>
      </div>
      <input className="bigsearch" placeholder="Name, phone, email, address…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {loading && <p className="muted">Searching…</p>}
      {error && <p className="error">{error.message}</p>}
      {result && (
        <div className="results">
          <Group title="Customers" items={result.customers} render={(c) => (
            <a key={c.id} className="row" href={`/customers/${c.id}`} onClick={(e) => (e.preventDefault(), go(`/customers/${c.id}?name=${encodeURIComponent(name(c))}`))}>
              <b>{name(c)}</b>{c.company && c.firstName ? <span className="muted"> · {c.company}</span> : null}
              <span className="muted right">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
            </a>
          )} />
          <Group title="Homes" items={result.homes} render={(h, i) => (
            <a key={i} className="row" href={h.customerId ? `/customers/${h.customerId}` : '#'} onClick={(e) => (e.preventDefault(), h.customerId && go(`/customers/${h.customerId}?name=${encodeURIComponent(name(h))}`))}>
              <b>{h.address || h.name}</b> <span className="muted">{[h.city, h.postalCode].filter(Boolean).join(' ')}</span>
              <span className="muted right">{name(h)}{h.zone ? ` · ${h.zone}` : ''}</span>
            </a>
          )} />
          <Group title="Cleaners & staff" items={result.employees} render={(x, i) => (
            <a key={x.id || i} className="row" href={x.id ? `/cleaners/${x.id}` : '#'} onClick={(e) => (e.preventDefault(), x.id && go(`/cleaners/${x.id}`))}>
              <b>{name(x)}</b><span className="muted right">{[x.phone, x.email].filter(Boolean).join(' · ')}</span>
            </a>
          )} />
          <Group title="Leads" items={result.leads} render={(l, i) => (
            <div key={i} className="row"><b>{name(l)}</b> <span className="muted">{l.address}</span>
              <span className="right"><span className="pill" style={{ background: l.color || undefined }}>{l.status}</span></span></div>
          )} />
          {!result.customers.length && !result.homes.length && !result.employees.length && !result.leads.length && <p className="muted">No matches.</p>}
        </div>
      )}
    </section>
  );
}

function Group({ title, items, render }) {
  if (!items?.length) return null;
  return (
    <div className="group">
      <h3>{title} <span className="muted">{items.length}</span></h3>
      {items.slice(0, 25).map(render)}
    </div>
  );
}
