// A small stand-in for a MaidCentral-style admin portal: cookie login with an
// anti-forgery field, server-rendered pages, JSON XHRs, an HTML partial, tabs, a modal,
// and plenty of things the crawler must NOT do (log out, delete, cancel, run payroll,
// post on page load). Every request it receives is logged for the test to check.
import http from 'node:http';

const PEOPLE = { 101: 'Jane Doe', 102: 'John Roe', 103: 'Ali Khan' };

const layout = (title, body, script = '') => `<!doctype html><html><head><title>${title} - Portal</title></head><body>
<nav><a href="/Dashboard">Dashboard</a> <a href="/Clients">Clients</a> <a href="/Jobs">Jobs</a> <a href="/Payroll/Run">Run payroll</a> <a href="/Account/LogOff">Log off</a></nav>
${body}
<div id="modal" style="display:none" class="modal"><form method="post" action="/Clients/Create"><input name="__RequestVerificationToken" type="hidden" value="tok"><input name="Client.FirstName"><button type="submit">Save</button></form><button data-dismiss="modal" onclick="document.getElementById('modal').style.display='none'">Close</button></div>
<script>${script}</script></body></html>`;

export function startFakePortal() {
  const log = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      log.push({ method: req.method, path: url.pathname + url.search, body });
      route(req, res, url, body);
    });
  });

  const send = (res, status, content, type = 'text/html', headers = {}) => {
    res.writeHead(status, { 'content-type': type, ...headers });
    res.end(typeof content === 'string' ? content : JSON.stringify(content));
  };
  const redirect = (res, to, headers = {}) => send(res, 302, '', 'text/html', { location: to, ...headers });

  function route(req, res, url, body) {
    const p = url.pathname;
    const loggedIn = /session=ok/.test(req.headers.cookie || '');

    if (p === '/Account/Login' && req.method === 'GET') {
      return send(res, 200, `<!doctype html><title>Log in</title><form method="post" action="/Account/Login"><input name="__RequestVerificationToken" type="hidden" value="tok"><input type="email" name="Email"><input type="password" name="Password"><button>Log in</button></form>`);
    }
    if (p === '/Account/Login' && req.method === 'POST') {
      const f = new URLSearchParams(body);
      if (f.get('Email') === 'test@example.com' && f.get('Password') === 'pw') return redirect(res, '/Dashboard', { 'set-cookie': 'session=ok; HttpOnly; Path=/' });
      return redirect(res, '/Account/Login');
    }
    if (!loggedIn) return redirect(res, `/Account/Login?ReturnUrl=${encodeURIComponent(p)}`);

    if (p === '/') return redirect(res, '/Dashboard');
    if (p === '/Dashboard') {
      return send(res, 200, layout('Dashboard', '<h1>Dashboard</h1><div id="stats"></div>', `
        fetch('/api/dashboard/stats').then(r => r.json()).then(s => document.getElementById('stats').textContent = s.jobsToday);
        fetch('/api/activity/seen', { method: 'POST', headers: { 'content-type': 'application/json', RequestVerificationToken: 'tok' }, body: JSON.stringify({ page: 'dashboard' }) });`));
    }
    if (p === '/api/dashboard/stats') return send(res, 200, { jobsToday: 12, revenueToday: 1840.5, topClient: 'Jane Doe' }, 'application/json');
    if (p === '/Clients') {
      const rows = Object.entries(PEOPLE).map(([id, n]) => `<tr><td><a href="/Clients/Details/${id}">${n}</a></td><td><a href="/Clients/Delete/${id}">Delete</a></td></tr>`).join('');
      return send(res, 200, layout('Clients', `<h1>Clients (3)</h1>
        <button id="new" data-toggle="modal">+ New Client</button> <button onclick="fetch('/api/clients/delete',{method:'POST'})">Delete selected</button>
        <table><thead><tr><th>Name</th><th></th></tr></thead><tbody>${rows}</tbody></table>`,
      `document.getElementById('new').onclick = () => fetch('/api/lookups/client-types').then(() => document.getElementById('modal').style.display = 'block');`));
    }
    let m = /^\/Clients\/Details\/(\d+)$/.exec(p);
    if (m) {
      const id = m[1];
      return send(res, 200, layout(PEOPLE[id], `<h1>${PEOPLE[id]}</h1>
        <ul class="nav-tabs"><li><a href="#" role="tab" id="t-notes">Notes</a></li><li><a href="#" role="tab" id="t-jobs">Jobs</a></li></ul><div id="pane"></div>`,
      `fetch('/api/clients/${id}');
       document.getElementById('t-notes').onclick = (e) => { e.preventDefault(); fetch('/api/clients/${id}/notes'); };
       document.getElementById('t-jobs').onclick = (e) => { e.preventDefault(); fetch('/Clients/JobsPartial?clientId=${id}', { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).then(r => r.text()).then(h => document.getElementById('pane').innerHTML = h); };`));
    }
    m = /^\/api\/clients\/(\d+)(\/notes)?$/.exec(p);
    if (m) {
      const n = PEOPLE[m[1]];
      if (m[2]) return send(res, 200, [{ NoteId: 9, Text: `${n} has a dog, gate code 4471`, Author: 'Office' }], 'application/json');
      return send(res, 200, { ClientId: Number(m[1]), Name: n, Email: `${n.split(' ')[0].toLowerCase()}@gmail.com`, Phone: '(613) 555-0199', Address: '12 Elm Street', PostalCode: 'K1N 1H7' }, 'application/json');
    }
    if (p === '/Clients/JobsPartial') {
      return send(res, 200, `<table><thead><tr><th>Date</th><th>Team</th></tr></thead><tr><td>Nov 2</td><td>Team A</td></tr></table>
        <form method="post" action="/Job/Reschedule/77"><input type="hidden" name="__RequestVerificationToken" value="tok"><input name="Jobs[0].Date"><input name="Jobs[0].TeamId"></form>`);
    }
    if (p === '/api/lookups/client-types') return send(res, 200, [{ Id: 1, Name: 'Residential' }], 'application/json');
    if (p === '/Jobs') {
      return send(res, 200, layout('Jobs', `<h1>Jobs</h1>
        <form method="post" action="/Jobs/Search"><input name="SearchText"><button type="submit">Search</button></form>
        <table><tr onclick="location.href='/Jobs/Edit/7'"><td>Job 7</td></tr></table>
        <a href="/Jobs/Cancel?id=5">Cancel job 5</a> <a href="/Reports/Jobs.csv">CSV</a>`));
    }
    if (/^\/Jobs\/Edit\/\d+$/.test(p)) {
      return send(res, 200, layout('Edit job', `<h1>Edit job</h1><form method="post" action="${p}"><input type="hidden" name="__RequestVerificationToken" value="tok"><input name="Job.Notes"><button type="submit">Save</button></form>`));
    }
    if (p === '/Schedule') {
      return send(res, 200, layout('Schedule', `<h1>Schedule</h1><button id="wk">Week</button>`,
        `document.getElementById('wk').onclick = () => fetch('/api/schedule?view=week&date=2026-11-02');`));
    }
    if (p === '/api/schedule') return send(res, 200, { 'Jane Doe': [{ JobId: 7, Start: '2026-11-02T09:00:00' }], 'John Roe': [] }, 'application/json');
    return send(res, 404, '<h1>Not found</h1>');
  }

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, log, close: () => server.close() }));
  });
}
