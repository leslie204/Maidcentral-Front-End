// Calls our own server (never MaidCentral directly). The header marks requests as coming
// from this app; the server refuses state changes without it.
export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'x-requested-with': 'mcfe', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.code);
  return data;
}

export const api = {
  me: () => call('GET', '/auth/me'),
  login: (email, password) => call('POST', '/auth/login', { email, password }),
  code: (code) => call('POST', '/auth/code', { code }),
  logout: () => call('POST', '/auth/logout', {}),
  schedule: (date) => call('GET', `/api/schedule?date=${date}`),
  monitor: (date) => call('GET', `/api/monitor?date=${date}`),
  search: (q) => call('GET', `/api/search?q=${encodeURIComponent(q)}`),
  customer: (id) => call('GET', `/api/customers/${encodeURIComponent(id)}`),
  plannerOverview: (from, days) => call('GET', `/api/planner/overview?from=${from}&days=${days}`),
  plannerDay: (date) => call('GET', `/api/planner/day?date=${date}`),
  plannerContinuity: (from) => call('GET', `/api/planner/continuity?from=${from}`),
  plannerSlots: (q) => call('GET', `/api/planner/slots?${new URLSearchParams(q)}`),
  openings: (q) => call('GET', `/api/openings?${new URLSearchParams(q)}`),
  openingsMap: () => call('GET', '/api/openings/map'),
  placeCustomer: (q) => call('GET', `/api/openings/place?${new URLSearchParams(q)}`),
  cleaners: () => call('GET', '/api/cleaners'),
  cleaner: (id) => call('GET', `/api/cleaners/${encodeURIComponent(id)}`),
  customerJobs: (id) => call('GET', `/api/customers/${encodeURIComponent(id)}/jobs`),
};

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const shiftDay = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

export const time = (ms) => (ms == null ? '–' : new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
export const dayLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
};
