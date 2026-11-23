import { useEffect, useState } from 'react';

// One refresh signal for the whole app, so every screen updates together: the Refresh
// button (which also clears the server's copies), and automatically every 2 minutes
// while the page is on screen (or when coming back to it after 2 minutes away).
const AUTO_MS = 2 * 60_000;
const listeners = new Set();
let lastRefresh = Date.now();

export function onRefresh(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function triggerRefresh() {
  lastRefresh = Date.now();
  for (const fn of listeners) fn(lastRefresh);
}
export const lastRefreshAt = () => lastRefresh;

if (typeof window !== 'undefined') {
  setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastRefresh >= AUTO_MS) triggerRefresh();
  }, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRefresh >= AUTO_MS) triggerRefresh();
  });
}

// A number that goes up on every refresh: add it to an effect's dependencies.
export function useRefreshTick() {
  const [n, setN] = useState(0);
  useEffect(() => onRefresh(() => setN((x) => x + 1)), []);
  return n;
}

// Loads data for a key; reloads when the key changes and on every refresh (quietly,
// keeping what's on screen until the new data arrives). Optional extra interval in ms.
export function useLoad(fn, key, onError, refreshMs = 0) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    const run = (quiet) => {
      if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
      fn()
        .then((data) => live && setState({ data, error: null, loading: false }))
        .catch((error) => {
          if (!live) return;
          onError?.(error);
          setState((s) => ({ data: quiet ? s.data : null, error, loading: false }));
        });
    };
    run(false);
    const timer = refreshMs ? setInterval(() => run(true), refreshMs) : null;
    const off = onRefresh(() => run(true));
    return () => {
      live = false;
      off();
      if (timer) clearInterval(timer);
    };
  }, [key]);
  return state;
}
