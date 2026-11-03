import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { api } from './api.js';

export const NAV = [
  {
    section: 'Operations',
    items: [
      { path: '/', label: 'Schedule', icon: 'calendar' },
      { path: '/monitor', label: 'Team Monitor', icon: 'activity' },
      { path: '/planner', label: 'Planner', icon: 'planner' },
      { path: '/openings', label: 'Openings & sales', icon: 'sparkle' },
    ],
  },
  {
    section: 'People',
    items: [
      { path: '/search', label: 'Customers', icon: 'home' },
      { path: '/cleaners', label: 'Cleaners', icon: 'users' },
    ],
  },
];

const isActive = (pathname, path) => (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`) || (path === '/search' && pathname.startsWith('/customers')));

// App shell: sidebar navigation, quick search (⌘K / Ctrl+K) and the page.
export default function Layout({ me, pathname, go, onSignOut, children }) {
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('nav-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('nav-collapsed', c ? '0' : '1');
      } catch {}
      return !c;
    });
  };
  const nav = (path) => (e) => {
    e.preventDefault();
    go(path);
  };

  return (
    <div className={`shell ${collapsed ? 'nav-collapsed' : ''} ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="brand-mark" aria-hidden="true">CB</div>
          <div className="brand-text">
            <b>Clean Bee</b>
            <span>Operations</span>
          </div>
          <button className="icon-button collapse" onClick={toggle} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}>
            <Icon name="sidebar" size={16} />
          </button>
        </div>
        <div className="sidebar-search">
          <button className="search-button" onClick={() => setPalette(true)}>
            <Icon name="search" size={16} />
            <span className="label">Search</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
        <nav>
          {NAV.map((g) => (
            <div key={g.section} className="nav-group">
              <span className="nav-section">{g.section}</span>
              {g.items.map((n) => (
                <a key={n.path} href={n.path} className={`nav-item ${isActive(pathname, n.path) ? 'active' : ''}`} onClick={nav(n.path)} title={n.label}>
                  <Icon name={n.icon} />
                  <span className="label">{n.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="readonly-note" title="Data comes live from MaidCentral. Nothing here can change it.">
            <Icon name="lock" size={14} />
            <span className="label">Read-only preview</span>
          </div>
          <div className="user">
            <div className="avatar" aria-hidden="true">{(me.email || '?')[0].toUpperCase()}</div>
            <div className="user-text">
              <b>{me.email}</b>
              <span>{me.portal}</span>
            </div>
            <button className="icon-button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <div className="mobile-bar">
          <button className="icon-button" onClick={() => setOpen(true)} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <b>Clean Bee</b>
          <button className="icon-button" onClick={() => setPalette(true)} aria-label="Search">
            <Icon name="search" />
          </button>
        </div>
        <main className="content">{children}</main>
      </div>
      {palette && <Palette go={go} onClose={() => setPalette(false)} />}
    </div>
  );
}

// Quick search across customers, homes and cleaners.
function Palette({ go, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      setBusy(true);
      api
        .search(q)
        .then((r) => {
          const name = (x) => [x.firstName, x.lastName].filter(Boolean).join(' ') || x.company || '(no name)';
          setResults([
            ...r.customers.filter((c) => c.id).map((c) => ({ icon: 'home', title: name(c), detail: [c.phone, c.email].filter(Boolean).join(' · '), to: `/customers/${c.id}?name=${encodeURIComponent(name(c))}`, kind: 'Customer' })),
            ...r.homes.filter((h) => h.customerId).map((h) => ({ icon: 'pin', title: h.address || h.name, detail: [name(h), h.city].filter(Boolean).join(' · '), to: `/customers/${h.customerId}?name=${encodeURIComponent(name(h))}`, kind: 'Home' })),
            ...r.employees.filter((e) => e.id).map((e) => ({ icon: 'user', title: name(e), detail: [e.phone, e.email].filter(Boolean).join(' · '), to: `/cleaners/${e.id}`, kind: 'Cleaner' })),
          ].slice(0, 12));
          setSel(0);
        })
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const pick = (r) => {
    onClose();
    go(r.to);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(s + 1, results.length - 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
    else if (e.key === 'Enter' && results[sel]) pick(results[sel]);
  };
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="palette-input">
          <Icon name="search" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search customers, homes, cleaners…" />
          <kbd>esc</kbd>
        </div>
        <div className="palette-results">
          {busy && !results.length && <div className="palette-empty">Searching MaidCentral…</div>}
          {!busy && q.trim().length >= 2 && !results.length && <div className="palette-empty">No matches.</div>}
          {q.trim().length < 2 && <div className="palette-empty">Type a name, phone, email or address.</div>}
          {results.map((r, i) => (
            <button key={i} className={`palette-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pick(r)}>
              <Icon name={r.icon} size={16} />
              <span className="pi-title">{r.title}</span>
              <span className="pi-detail">{r.detail}</span>
              <span className="pi-kind">{r.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
