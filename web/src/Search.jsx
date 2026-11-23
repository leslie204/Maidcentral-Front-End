import { useEffect, useState } from 'react';
import { api } from './api.js';
import Icon from './Icon.jsx';
import { PageHeader, ErrorNote, Empty, Skeleton, Card } from './ui.jsx';

// Customers: MaidCentral's global search (customers, homes, cleaners, leads) in one box.
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
    }, 300);
    return () => clearTimeout(t);
  }, [q, onError]);

  const name = (x) => [x.firstName, x.lastName].filter(Boolean).join(' ') || x.company || '(no name)';
  const open = (to) => (e) => (e.preventDefault(), go(to));
  const none = result && !result.customers.length && !result.homes.length && !result.employees.length && !result.leads.length;

  return (
    <>
      <PageHeader title="Customers" subtitle="Search customers, homes, cleaners and leads in MaidCentral" />
      <div className="search-hero">
        <Icon name="search" />
        <input placeholder="Name, phone, email or address…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {loading && <span className="spinner" />}
      </div>
      <ErrorNote error={error} />
      {!result && !loading && <Empty icon="home" title="Find a customer">Type at least two letters. Tip: press ⌘K anywhere to search.</Empty>}
      {loading && !result && <Skeleton rows={5} height={44} />}
      {none && <Empty icon="search" title="No matches" />}
      {result && (
        <div className="results-grid">
          <Group title="Customers" items={result.customers} render={(c) => (
            <a key={c.id} className="result" href={`/customers/${c.id}`} onClick={open(`/customers/${c.id}?name=${encodeURIComponent(name(c))}`)}>
              <div className="avatar soft">{name(c)[0]}</div>
              <div><b>{name(c)}</b>{c.company && c.firstName ? <span className="muted"> · {c.company}</span> : null}<span className="muted small block">{[c.phone, c.email].filter(Boolean).join(' · ')}</span></div>
              <Icon name="chevronRight" size={16} />
            </a>
          )} />
          <Group title="Homes" items={result.homes} render={(h, i) => (
            <a key={i} className="result" href={h.customerId ? `/customers/${h.customerId}` : '#'} onClick={open(h.customerId ? `/customers/${h.customerId}?name=${encodeURIComponent(name(h))}` : '/search')}>
              <div className="avatar soft"><Icon name="pin" size={16} /></div>
              <div><b>{h.address || h.name}</b><span className="muted small block">{[name(h), h.city, h.postalCode, h.zone].filter(Boolean).join(' · ')}</span></div>
              <Icon name="chevronRight" size={16} />
            </a>
          )} />
          <Group title="Cleaners & staff" items={result.employees} render={(x, i) => (
            <a key={x.id || i} className="result" href={x.id ? `/cleaners/${x.id}` : '#'} onClick={open(x.id ? `/cleaners/${x.id}` : '/search')}>
              <div className="avatar soft">{name(x)[0]}</div>
              <div><b>{name(x)}</b><span className="muted small block">{[x.phone, x.email].filter(Boolean).join(' · ')}</span></div>
              <Icon name="chevronRight" size={16} />
            </a>
          )} />
          <Group title="Leads" items={result.leads} render={(l, i) => (
            <div key={i} className="result">
              <div className="avatar soft">{name(l)[0]}</div>
              <div><b>{name(l)}</b><span className="muted small block">{[l.address, l.postalCode].filter(Boolean).join(' · ')}</span></div>
              {l.status && <span className="pill" style={{ '--dot': l.color || '#9ca3af' }}>{l.status}</span>}
            </div>
          )} />
        </div>
      )}
    </>
  );
}

function Group({ title, items, render }) {
  if (!items?.length) return null;
  return (
    <Card title={<>{title} <span className="muted">{items.length}</span></>} className="flush">
      <div className="result-list">{items.slice(0, 25).map(render)}</div>
    </Card>
  );
}
