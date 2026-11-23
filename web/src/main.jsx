import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { today } from './api.js';

// What the office entered for days already gone (call-out results, rescheduling picks)
// is cleared, so old choices never show up as if they still applied.
try {
  const now = today();
  for (const key of Object.keys(localStorage)) {
    const m = /^(callouts|reschedule):(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (m && m[2] < now) localStorage.removeItem(key);
  }
  const one = JSON.parse(localStorage.getItem('reschedule:one') || 'null');
  if (one?.items) {
    for (const [id, x] of Object.entries(one.items)) if (!x.booking?.date || x.booking.date < now) delete one.items[id];
    localStorage.setItem('reschedule:one', JSON.stringify(one));
  }
} catch {
  /* private window: nothing stored */
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
