import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from './api.js';
import Login from './Login.jsx';
import Schedule from './Schedule.jsx';
import Monitor from './Monitor.jsx';
import Search from './Search.jsx';
import Customer from './Customer.jsx';
import Cleaners from './Cleaners.jsx';
import Cleaner from './Cleaner.jsx';

const NAV = [
  { path: '/', label: 'Schedule' },
  { path: '/monitor', label: 'Team Monitor' },
  { path: '/cleaners', label: 'Cleaners' },
  { path: '/search', label: 'Search' },
];

// Tiny router: the path decides the page.
function usePath() {
  const [path, setPath] = useState(location.pathname + location.search);
  useEffect(() => {
    const onPop = () => setPath(location.pathname + location.search);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((to) => {
    history.pushState(null, '', to);
    setPath(to);
    scrollTo(0, 0);
  }, []);
  return [path, go];
}

export default function App() {
  const [me, setMe] = useState(undefined);
  const [path, go] = usePath();

  const refresh = useCallback(() => api.me().then((m) => setMe(m.email ? m : null)).catch(() => setMe(null)), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Any 401 from the API means the MaidCentral session ended: back to sign-in.
  const onError = useCallback((e) => {
    if (e instanceof ApiError && e.status === 401) setMe(null);
  }, []);

  if (me === undefined) return <div className="splash">Loading…</div>;
  if (!me) return <Login onSignedIn={refresh} />;

  const pathname = path.split('?')[0];
  const customer = /^\/customers\/(\d+)/.exec(pathname);
  const cleaner = /^\/cleaners\/(\d+)/.exec(pathname);
  let page;
  if (cleaner) page = <Cleaner id={cleaner[1]} onError={onError} portal={me.portal} />;
  else if (pathname === '/cleaners') page = <Cleaners go={go} onError={onError} />;
  else if (customer) page = <Customer id={customer[1]} go={go} onError={onError} portal={me.portal} />;
  else if (pathname === '/monitor') page = <Monitor onError={onError} />;
  else if (pathname === '/search') page = <Search go={go} onError={onError} initial={new URLSearchParams(path.split('?')[1]).get('q') || ''} />;
  else page = <Schedule onError={onError} />;

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="bee" aria-hidden="true">●</span> Clean Bee <small>MaidCentral preview</small>
        </div>
        <nav>
          {NAV.map((n) => (
            <a key={n.path} href={n.path} className={pathname === n.path || (n.path !== '/' && pathname.startsWith(n.path)) ? 'active' : ''} onClick={(e) => (e.preventDefault(), go(n.path))}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="who">
          <span title={`Signed in to ${me.portal}`}>{me.email}</span>
          <button className="link" onClick={() => api.logout().finally(() => setMe(null))}>Sign out</button>
        </div>
      </header>
      <div className="banner">Read-only proof of concept: data comes live from MaidCentral; nothing here can change it.</div>
      <main>{page}</main>
    </div>
  );
}
