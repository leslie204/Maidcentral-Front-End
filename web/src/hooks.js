import { useEffect, useState } from 'react';

// Loads data for a key; reloads when the key changes. Optional auto-refresh in ms.
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
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [key]);
  return state;
}
