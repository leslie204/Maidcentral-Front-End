import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from './api.js';
import Layout from './Layout.jsx';
import Login from './Login.jsx';
import Schedule from './Schedule.jsx';
import Monitor from './Monitor.jsx';
import Search from './Search.jsx';
import Customer from './Customer.jsx';
import Cleaners from './Cleaners.jsx';
import Cleaner from './Cleaner.jsx';
import Planner from './Planner.jsx';

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

  if (me === undefined) return <div className="splash"><div className="brand-mark big">CB</div></div>;
  if (!me) return <Login onSignedIn={refresh} />;

  const [pathname, query = ''] = path.split('?');
  const customer = /^\/customers\/(\d+)/.exec(pathname);
  const cleaner = /^\/cleaners\/(\d+)/.exec(pathname);
  let page;
  if (cleaner) page = <Cleaner id={cleaner[1]} onError={onError} portal={me.portal} />;
  else if (customer) page = <Customer id={customer[1]} go={go} onError={onError} portal={me.portal} />;
  else if (pathname === '/cleaners') page = <Cleaners go={go} onError={onError} />;
  else if (pathname === '/planner') page = <Planner onError={onError} go={go} />;
  else if (pathname === '/monitor') page = <Monitor onError={onError} />;
  else if (pathname === '/search') page = <Search go={go} onError={onError} initial={new URLSearchParams(query).get('q') || ''} />;
  else page = <Schedule onError={onError} />;

  return (
    <Layout me={me} pathname={pathname} go={go} onSignOut={() => api.logout().finally(() => setMe(null))}>
      {page}
    </Layout>
  );
}
