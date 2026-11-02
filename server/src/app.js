// HTTP API for the web app. People sign in with their own MaidCentral login; their
// MaidCentral cookies stay in server memory (proof of concept: a restart signs everyone
// out). The browser only gets an opaque, httpOnly session cookie.
//
//   POST /auth/login {email, password}   -> {status: 'signed-in'} | {status: 'code', sentTo}
//   POST /auth/code  {code}              -> {status: 'signed-in'}
//   POST /auth/logout, GET /auth/me
//   GET  /api/schedule?date=YYYY-MM-DD   jobs + teams for a day
//   GET  /api/monitor?date=YYYY-MM-DD    scheduled vs clocked times per team
//   GET  /api/search?q=                  customers, homes, employees, leads
//   GET  /api/customers/:id/jobs?from=&to=
import crypto from 'node:crypto';
import express from 'express';
import { McSession, McError, mcDate } from './mc.js';

const IDLE_MS = 12 * 60 * 60 * 1000; // MaidCentral's own sign-in lasts 12 hours from last use
const COOKIE = 'mcfe_sid';

export function createApp({ portalUrl, allowedEmails = [], secureCookies = true, fetchImpl, staticDir } = {}) {
  const app = express();
  const sessions = new Map(); // sid -> { mc, email, lastUsed }
  const remembered = new Map(); // email -> TwoFactorRememberBrowser cookie (30 days)
  const attempts = new Map(); // ip -> [timestamps]

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10kb' }));
  app.use((req, res, next) => {
    res.set({ 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY' });
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  const sidOf = (req) => /(?:^|;\s*)mcfe_sid=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
  const current = (req) => {
    const sid = sidOf(req);
    const s = sid && sessions.get(sid);
    if (!s) return null;
    if (Date.now() - s.lastUsed > IDLE_MS) {
      sessions.delete(sid);
      return null;
    }
    s.lastUsed = Date.now();
    return s;
  };
  const setCookie = (res, sid, maxAge = IDLE_MS) =>
    res.cookie(COOKIE, sid, { httpOnly: true, secure: secureCookies, sameSite: 'strict', path: '/', maxAge });

  // Requests that change state must come from our own pages (JSON + same-origin header).
  const sameOrigin = (req, res, next) => {
    if (req.get('x-requested-with') !== 'mcfe') return res.status(403).json({ error: 'Bad request origin' });
    next();
  };

  const tooMany = (ip) => {
    const now = Date.now();
    const recent = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
    recent.push(now);
    attempts.set(ip, recent);
    return recent.length > 10;
  };

  app.post('/auth/login', sameOrigin, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Enter your MaidCentral email and password.' });
    if (tooMany(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    if (allowedEmails.length && !allowedEmails.includes(email)) return res.status(403).json({ error: 'This preview is limited to invited users.' });
    const mc = new McSession(portalUrl, { fetchImpl });
    try {
      const result = await mc.login(email, password, remembered.get(email));
      const sid = crypto.randomBytes(32).toString('hex');
      sessions.set(sid, { mc, email, lastUsed: Date.now() });
      setCookie(res, sid, result.status === 'code' ? 10 * 60 * 1000 : IDLE_MS);
      res.json(result);
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post('/auth/code', sameOrigin, async (req, res) => {
    const sid = sidOf(req);
    const s = sid && sessions.get(sid);
    if (!s) return res.status(401).json({ error: 'Start again: sign in first.' });
    if (tooMany(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    try {
      const result = await s.mc.verify(String(req.body?.code || ''));
      if (result.rememberCookie) remembered.set(s.email, result.rememberCookie);
      s.lastUsed = Date.now();
      setCookie(res, sid);
      res.json({ status: result.status });
    } catch (e) {
      sendError(res, e);
    }
  });

  app.post('/auth/logout', sameOrigin, (req, res) => {
    const sid = sidOf(req);
    if (sid) sessions.delete(sid);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/auth/me', (req, res) => {
    const s = current(req);
    res.json(s?.mc.signedIn ? { email: s.email, portal: new URL(portalUrl).host } : { email: null });
  });

  // Everything under /api needs a signed-in session.
  const api = express.Router();
  api.use((req, res, next) => {
    const s = current(req);
    if (!s?.mc.signedIn) return res.status(401).json({ error: 'Please sign in.' });
    req.mc = s.mc;
    next();
  });

  api.get('/schedule', handle(async (req) => {
    const date = mcDay(req.query.date);
    const [jobs, teams] = await Promise.all([
      req.mc.getJson('/Job/ReadJobs', { date, view: 'HalfHourView' }),
      req.mc.getJson('/Job/TeamMonitorTeams', { date, view: 'HalfHourView' }),
    ]);
    return { date: req.query.date, teams: teams.map(team), jobs: jobs.map(job) };
  }));

  api.get('/monitor', handle(async (req) => {
    const date = mcDay(req.query.date);
    const [items, teams] = await Promise.all([
      req.mc.getJson('/Job/TeamMonitorData', { date, view: 'HalfHourView', showJobClocks: 'true' }),
      req.mc.getJson('/Job/TeamMonitorTeams', { date, view: 'HalfHourView', showJobClocks: 'true' }),
    ]);
    // ScheduleActualType 1 = scheduled, 2 = clocked (actual).
    return { date: req.query.date, teams: teams.map(team), items: items.map((i) => ({ ...job(i), actual: i.ScheduleActualType === 2 })) };
  }));

  api.get('/search', handle(async (req) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return { customers: [], homes: [], employees: [], leads: [] };
    const d = await req.mc.getJson('/Search/Global', { query: q });
    const contact = (list, type) => (list || []).find((c) => c.ContactTypeId === type)?.ContactInfo || null;
    const idFrom = (url) => /\/(\d+)(?:\?|$)/.exec(url || '')?.[1] || null;
    return {
      customers: (d.CustomerList || []).map((c) => ({ id: idFrom(c.Url), firstName: c.FirstName, lastName: c.LastName, company: c.CompanyName, phone: contact(c.Phones, 2), email: contact(c.Emails, 3), created: c.DateCreated, mcUrl: c.Url })),
      homes: (d.HomeList || []).map((h) => ({ customerId: idFrom(h.CustomerUrl), name: h.HomeName, firstName: h.FirstName, lastName: h.LastName, address: h.Address, city: h.City, region: h.Region, postalCode: h.PostalCode, zone: h.HomeZoneName, zoneColor: h.HomeZoneColor })),
      employees: (d.EmployeeList || []).map((e) => ({ id: idFrom(e.Url), firstName: e.FirstName, lastName: e.LastName, phone: contact(e.Phones, 2), email: contact(e.Emails, 3), city: e.City, hireDate: e.HireDate })),
      leads: (d.LeadList || []).map((l) => ({ firstName: l.FirstName, lastName: l.LastName, address: l.Address, postalCode: l.PostalCode, status: l.QuoteStatusName, color: l.QuoteColor, created: l.DateCreated })),
    };
  }));

  api.get('/customers/:id/jobs', handle(async (req) => {
    const id = String(req.params.id);
    if (!/^\d{1,10}$/.test(id)) throw new McError('input', 'Bad customer id');
    const day = 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);
    const from = req.query.from ? Math.floor(Date.parse(req.query.from) / 1000) : now - 180 * day;
    const to = req.query.to ? Math.floor(Date.parse(req.query.to) / 1000) : now + 90 * day;
    const jobs = await req.mc.postFormJson('/Customer/Jobs', { id, start: String(from), end: String(to) });
    return {
      jobs: jobs.map((j) => ({ id: j.id, title: j.title, start: j.start, end: j.end, color: j.color, late: j.late, outOfRotation: j.outOfRotation })),
      mcUrl: `/Customer/Details/${id}?cid=${id}`,
    };
  }));

  app.use('/api', api);

  if (staticDir) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|auth\/).*/, (req, res) => res.sendFile('index.html', { root: staticDir }));
  }
  return app;
}

function handle(fn) {
  return async (req, res) => {
    try {
      res.set('cache-control', 'no-store');
      res.json(await fn(req));
    } catch (e) {
      sendError(res, e);
    }
  };
}

function sendError(res, e) {
  const status = { credentials: 401, code: 401, expired: 401, state: 400, input: 400, blocked: 403 }[e.code] || 502;
  if (!(e instanceof McError)) console.error(e);
  res.status(status).json({ error: e instanceof McError ? e.message : 'Could not reach MaidCentral.', code: e.code || 'error' });
}

// "2026-11-02" -> "11/2/2026" (the portal's own format)
function mcDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) throw new McError('input', 'Use date=YYYY-MM-DD');
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

function team(t) {
  return { id: t.TeamID, name: t.TeamName, color: t.RgbBackgroundColor || t.Color || null, textColor: t.RgbTextColor || null, jobs: t.CountJobs, scheduledHours: t.ScheduledHours, allowedHours: t.AllowedHours, disabled: t.IsDisabled };
}

function job(j) {
  return {
    id: j.JobInformationId,
    teamId: j.TeamID,
    title: j.Title,
    start: mcDate(j.Start),
    end: mcDate(j.End),
    allowedHours: j.AllowedTime,
    statusId: j.JobStatusId,
    color: j.StatusColor || j.Color || null,
    frequencyColor: j.FrequencyColor || null,
    instructions: j.EventInstructions ? stripTags(j.EventInstructions) : null,
    tags: j.JobTags ? stripTags(j.JobTags) : null,
    recurring: j.IsRecurringEvent,
  };
}

function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
