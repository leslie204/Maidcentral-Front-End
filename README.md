# MaidCentral Front End

A replacement front end for Clean Bee's MaidCentral admin portal, so we can add our own
features on top of MaidCentral's data. MaidCentral stays the system of record for clients,
jobs, employees, scheduling, payroll and money.

Same approach as [Launch27-New-Front-End](https://github.com/UrbanMopdev/Launch27-New-Front-End),
adapted to MaidCentral, which has an official API as well as its admin portal:

1. **Capture** (`capture/`): read the official API docs, probe the API, and crawl the admin
   portal with Playwright to record every page and every call it makes. The result is a
   redacted catalog: `docs/API.md` and `docs/api-catalog.json`.
2. **Rebuild** (`server/` + `web/`, Phase 3 onwards): an Express server that signs people
   in and proxies MaidCentral, and a React app that rebuilds each admin page from the catalog.

## Status

| Phase | State |
| --- | --- |
| 0. Recon | **Done** (API probe skipped: no API user). The official API only covers online booking; everything else is portal only. See [docs/recon.md](docs/recon.md) |
| 1. Capture tool | **Done.** Ran on the real portal: 250 pages, 267 endpoints, read-only, headless 2FA |
| 2. Verify writes | Not started |
| 3. App skeleton | **Proof of concept** (read-only): sign-in with your own MaidCentral login (2FA relayed), Schedule, Team Monitor, Search, Customer jobs. Deployed to Railway |
| 4. Pages | Not started |

## Decisions so far

| Decision | Detail |
| --- | --- |
| Hosting | Railway, in **its own Railway project**, completely separate from the Launch27 / UrbanMop project: its own services, Postgres databases (development / staging / production), variables and members. Nothing is shared with or referenced from the Launch27 project |
| Portal address | Kept out of the repo (public); set as `MC_PORTAL_URL` |
| Auth | **Recommended, awaiting sign-off:** people sign in with their own MaidCentral login through our server (2FA relayed, portal cookies kept server-side, no passwords stored). Details and the fallback in [docs/recon.md](docs/recon.md) |

## Proof-of-concept app (`server/` + `web/`)

```
browser ── /auth/*, /api/* ──> server (Express) ── your MaidCentral cookies ──> https://<company>.maidcentral.com
```

- **Sign-in:** people use their own MaidCentral email and password. The server signs in to
  the portal like a browser, relays MaidCentral's 2FA code step to our login screen and
  ticks "Remember this browser". Passwords are never stored. The browser only gets an
  opaque httpOnly cookie.
- **Sessions in Postgres** (`server/src/store.js`): each person's MaidCentral cookies are
  stored encrypted (AES-256-GCM with `SESSION_KEY`, bound to the row), the session id only
  as a SHA-256 hash, and MaidCentral's 30-day "remember this browser" cookie per email, so
  restarts and redeploys don't sign anyone out or ask for a new code. Sessions end after
  12 hours without use; expired rows are deleted hourly. Without `DATABASE_URL`, sessions
  live in memory (local development).
- **Read-only by construction:** the server has fixed endpoints (`/api/schedule`,
  `/api/monitor`, `/api/search`, `/api/customers/:id`, `/api/cleaners/:id`,
  `/api/planner/*`…), not a general proxy, and every
  MaidCentral call goes through the crawler's safety rules (`assertRead` in
  `server/src/mc.js`): GETs that name no action, and POSTs on `capture/read-posts.txt` only.
- **Pages:**
  - Schedule (jobs per team for a day) and Team Monitor (scheduled vs clocked, live).
  - Customer: every tab of MaidCentral's customer page (overview, balances, stats,
    contacts, homes, billing, jobs, notes, scorecards, quotes, card payments, preferences,
    agreements, attachments, notification settings). MaidCentral serves most tabs as HTML;
    `server/src/extract.js` turns them into data.
  - Cleaners: directory and cleaner page (profile, 180-day attendance stats, job history
    with productivity, attendance calendar, default schedule, scorecards, inspections,
    clock events, tickets, notes). Licence, birth date, tax and pay details are never
    read out of the page (allow-listed fields only).
  - Openings (`server/src/territory.js`), for scheduling and sales, over the 4-week
    cycle from this Monday:
    - Capacity tab (`server/src/planner.js`): how full each team's day is (booked hours
      vs the team's shift window, 8:15 AM leave to the return time), split repeat /
      one-time, with the day's timeline when a day is clicked. (The separate Scheduling
      planner page was removed; `/planner` opens this tab.)
    - 4-week plan: per weekday, each team's day in weeks 1–4 as a bar of jobs coloured
      by frequency (weekly, every 2/4 weeks, one-time) with open time labelled by the
      frequency it fits: free every week → weekly; free in weeks 1 & 3 or 2 & 4 → every 2
      weeks (pairs with an existing every-2-weeks customer); free in one week → every 4
      weeks. Cars leave the office at `OFFICE_LEAVE_AT` (default 8:15 AM), so the first
      opening of a day starts after the drive from the office, and everyone must be back at the office by
      `OFFICE_RETURN_BY` (default 4:45 PM): the last gap of a day ends early enough to
      drive back from where the team is. The office is the company address in
      MaidCentral's settings, located once with the US Census geocoder (override with
      `OFFICE_LAT`/`OFFICE_LNG`; fallback: centre of the homes in its ZIP). The Capacity
      tab caps team days at the same time.
    - Speed: results are cached per person (never shared across users), warmed at
      sign-in and every 15 minutes for anyone active in the last 2 hours, and served at
      once while a refresh runs in the background; the page shows progress while the
      first read runs.
    - Wording: plain language ("every other week", "good for", "hours per week") and
      "?" help next to anything that needs explaining.
    - Where to sell: zones ranked by open hours per week, a map (OpenStreetMap tiles, no
      key; areas shaded by open time, customers as dots in their team's colour, openings
      as rings; an on-map key explains it) and
      the list of openings by area. An opening's area is where the team is just before
      and after it, from MaidCentral's Customer Efficiency Map report (every recurring
      home's ZIP, zone and coordinates) matched to the jobs.
    - Place a customer: ZIP, area or existing home + frequency + length (+ days, time of
      day) → openings ranked by the extra driving the new home adds between the jobs
      before and after it (straight-line estimate), frequency fit and length. Each
      result has an exact arrival time that works on every visit date: driving from the
      previous job (or the office), the clean, then to the next job on time or back to
      the office by the return time.
  - Call-outs (`server/src/callouts.js`): tap everyone who called out (any number,
    today or tomorrow) and compare the ways to rearrange the day, ranked by how many
    jobs they keep (then revenue, fewest calls, least driving). Revenue shows only as an
    impact level: a job is high / medium / low against the day's other jobs; a plan's
    jobs to rebook are low (< 5% of the day), medium (< 15%) or high. Every car has a lead (washrooms, kitchen) and a cleaner (floors, dusting):
    nobody works alone and a car needs a lead. Roles come from the MaidCentral team
    position (Captain = lead, Team Member = cleaner, Trainee) and can be changed with a
    tap. For each car left short, the people left join another car (a car of three
    cleans 1.5× faster: on-site time = cleaner-hours ÷ people), pair up with the person
    left from another short car (if one is a lead), or pair with someone without a team
    the office marks as available; otherwise the car stands down and its jobs are shared
    out. Each option re-plans the day: cars nobody touched keep their booked times;
    orphaned jobs (most valuable first) go where they add the least driving, within how
    far customers may move (default 30 min earlier / 2 h later), no earlier than leaving
    the office (`OFFICE_LEAVE_AT`, default 8:15 AM) plus the drive, and with everyone
    back by the return time; what fits nowhere is to be rebooked. Beside each call the
    office logs what the customer said (agreed, no answer → keep booked time, voicemail →
    OK to move, can't move, only after/before a time, rebook another day, skip) plus a
    note; the plans update around those answers. Entries stay on that device for the
    day. Today's prices, phones and car sizes come from MaidCentral's Dispatch Board (it
    only shows today); other days are estimated per cleaner-hour.
  - Search (customers, homes, cleaners, leads).
- **Booking frequency:** jobs only carry a colour; `server/src/schedulekey.js` reads
  MaidCentral's own "Job Schedule Key" legend (Every Week, Every Two Weeks, … Single,
  On Demand) so every job shows its frequency (4-week plan colours, recurring vs one-off
  hours in the capacity grid).
- **Design:** same system as the Launch27 app (Geist, sidebar, ⌘K quick search, light
  and dark mode following the device, works on phones).
- **Times:** MaidCentral sends wall-clock times as if they were UTC; the server returns
  them as local ISO strings without a zone, so they show the same as in MaidCentral.
- **Config:** `MC_PORTAL_URL` (required), `OFFICE_LEAVE_AT` (default `8:15 AM`),
  `OFFICE_RETURN_BY` (default `4:45 PM`),
  `OFFICE_LAT`/`OFFICE_LNG` (optional), `DATABASE_URL` + `SESSION_KEY` (64 hex
  characters; changing it signs everyone out), `ALLOWED_EMAILS` (optional comma-separated
  list of who may sign in), `PORT`. Railway: `railway.json` (build `npm run build`, start
  `npm start`, health check `/healthz`).

```bash
npm run build && npm start       # http://localhost:8787 (uses .env; behind a proxy: NODE_USE_ENV_PROXY=1)
```

## Setup

Requires Node 22+.

```bash
npm install
cp .env.example .env     # fill in; .env is gitignored
npm run check            # lint + unit tests (same as CI)
```

Server tests include a Postgres one that runs when `TEST_DATABASE_URL` points at an empty
database (CI provides one).

Variables (names only; never commit values): `MC_PORTAL_URL`, `MC_EMAIL`, `MC_PASSWORD`,
`MC_API_USERNAME`, `MC_API_PASSWORD`, `MC_SANDBOX_API_USERNAME`, `MC_SANDBOX_API_PASSWORD`.
Wrap values containing `#` in single quotes.

## 1. Capture

### Official API probe

```bash
npm run probe -- /some/path /other/path?take=1      # production, GET only
npm run probe -- --sandbox /some/path               # sandbox (api.maidcentral.net)
```

Gets a token from `POST /token` with the API user, then makes the GETs. It prints each
status and response **shape** (types only), never the token or values. Full responses go
to `capture/output/official-probe.jsonl` (gitignored). Endpoints from the docs are listed by
hand in `capture/official-api.json`.

### Portal crawl

```bash
npm run capture                     # headless, logs in with MC_EMAIL / MC_PASSWORD
npm run capture -- --headed         # watch it, or log in by hand
npm run bundle-routes               # list routes found in the portal's JavaScript
npm run catalog                     # rebuild docs/ from capture/output/ without crawling
```

**2FA** (required for MaidCentral office users): headless, the crawler clicks "Send code"
if there is one, then waits up to 10 minutes for the code to be written to
`capture/.auth/2fa-code` (`--code-file` to change), enters it and ticks "Remember this
browser", so the saved login skips 2FA for 30 days. In a cloud session, point it at the
pre-installed browser with `CHROMIUM_PATH=/opt/pw-browsers/chromium`.

It starts at `MC_PORTAL_URL`, follows every link it finds (including ones hidden in
`onclick`/`data-url` attributes) plus `capture/seeds.txt`, visits at most
`--per-template 2` pages per record type (`/Client/Details/:id`), and on each page clicks
tabs and "New / Add / Edit / View" buttons and modal openers so their lookup calls get
recorded. It records XHR/fetch calls **and** page loads, form posts and HTML partials
(form actions, field names, anti-forgery tokens), because the portal may be
server-rendered. It also saves a screenshot of every page and the portal's JavaScript
(for `bundle-routes`).

Options: `--start /`, `--scope /` (allowed path prefixes), `--max-pages 300`,
`--per-template 2`, `--max-clicks 12` (0 = no clicking), `--fresh` (ignore the saved login),
`--code-file`, `--allow-writes`.

**Read-only by default** (`capture/safety.js`):

- After sign-in, every request that isn't GET/HEAD/OPTIONS is blocked and logged as
  "blocked: write", so the catalog still lists it. That includes writes the page fires
  on its own as soon as it loads. The one exception is reads sent as POST (the portal loads
  grids and calendars that way): an XHR whose action name reads as a query (`GetX`,
  `SearchX`…) or that is on the reviewed list in `capture/read-posts.txt`.
- GETs to MaidCentral whose URL names an action (delete, cancel, send, charge, payroll,
  export, log out…) are blocked as well, because server-rendered apps sometimes change
  data on a GET.
- It never follows links like those, and never opens payroll.
- It never clicks buttons that save, submit, send, email, text, charge, cancel, delete,
  archive, export or confirm.
- `confirm()` dialogs are dismissed.
- Analytics and chat widgets are stubbed out.

Output:

| Path | Contents | Commit? |
| --- | --- | --- |
| `docs/API.md`, `docs/api-catalog.json` | Official API, then the portal per page. Each endpoint has method, templated path, params and request/response **shapes** (types only), and each capability is marked official API / portal only / both | Yes |
| `capture/output/` | Raw requests and responses, page HTML, screenshots, the portal's JS | **No.** Contains client and employee data; gitignored |
| `capture/.auth/` | Saved portal login (cookies) | **No.** Gitignored |

The catalog generator refuses to write anything that fails the personal-data audit
(`capture/privacy.js`). It catches emails, phones, postal codes, street addresses,
money amounts, card numbers, tokens, and any value inside a shape. Record-page headings,
which are often a client's name, are dropped.
`capture/test/unit/privacy.test.js` fails if the committed catalog contains anything that
looks like personal data.

## Tests

```bash
npm test             # unit tests (templating, safety rules, catalog, privacy, probe)
npm run test:e2e     # runs the real crawler (headless Chromium) against a local fake portal
npm run lint
```

The end-to-end test checks the guarantees above: the fake portal must receive no write
except the login and no unsafe GET. Tabs, modals and HTML partials must be captured, and
the catalog must carry none of the fake clients' details.
