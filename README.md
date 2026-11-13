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
    - Source: MaidCentral's Master Schedule (`server/src/master.js`): the recurring
      pattern per team and weekday, with each recurring customer's weeks (1–4) and
      frequency (E1/E2/E4). Recurring openings are the gaps in that pattern, so a
      skipped visit doesn't open a recurring spot, a booking moved into a gap doesn't
      hide one, a customer rescheduled elsewhere keeps their slot, and frequencies come
      from the pattern's weeks (weeks 1 & 3 / 2 & 4 = every 2 weeks). The dated
      schedule adds what's true on each date: an opening taken that date by a moved or
      one-time booking (the first visit starts the next free date), and time free on one
      date only (someone skipped), offered as a one-time opening with who's missing. The
      4-week plan shows three things: booked (grey), open for a new regular (green, labelled
      Weekly / 2 wks / 4 wks) and free on one date only ("Once", amber); hover for details.
    - Real statuses: the Dispatch Board for the same weeks (plus 2 weeks either side) gives
      MaidCentral's own status for each booking, so a regular visit missing from its day is
      labelled Skipped, Cancelled, Moved (to which date, time and team), on another team
      that day, or not booked; a booking that isn't part of the pattern is labelled "moved
      here from <date>", one-time, or booked outside the customer's usual day. If the board
      can't be read, openings still work and the labels say the status isn't available.
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
      sign-in and kept warm for anyone active in the last 30 minutes, and served at
      once while a refresh runs in the background; the page shows progress while the
      first read runs (about 10 seconds).
    - Wording: plain language ("every other week", "good for", "hours per week") and
      "?" help next to anything that needs explaining.
    - Where to sell: areas ranked by open hours per week and the list of openings by
      area (filter by area, customer type and day). An opening's area is where the team is just before
      and after it, from MaidCentral's Customer Efficiency Map report (every recurring
      home's ZIP, zone and coordinates) matched to the jobs.
    - Place a customer: ZIP, area or existing home + frequency + length (+ days, time of
      day) → openings ranked by the extra driving the new home adds between the jobs
      before and after it (straight-line estimate), frequency fit and length. Each
      result has an exact arrival time that works on every visit date: driving from the
      previous job (or the office), the clean, then to the next job on time or back to
      the office by the return time.
  - Scorecards (`server/src/scorecards.js`, page `/scorecards`): MaidCentral's
    Scorecard Results (0–4: Thrilled, Happy, A few concerns, Major concerns,
    Considering another company) for a period (30 days to 12 months), compared with
    the period before: average, share thrilled, concerns (0–2), customers considering
    leaving, response rate; plain-language insights; weekly average and responses
    (concerns vs not); score breakdown; themes in concern comments (floors, bathrooms,
    kitchen, missed, timing…); by cleaner (full names, matched from the employee list:
    the report gives "M. Rice"); all comments with search and filter. Customers who
    scored 0 are named in the insights.
  - Price check (`server/src/prices.js`, page `/prices`): after a rate change, every
    booking in a date range (default the next 4 weeks) from MaidCentral's Dispatch Board
    (its filter form, a reviewed read added to `capture/read-posts.txt`), with hourly
    rate = price ÷ (allowed hours ÷ 2), i.e. per hour of a two-person team, checked
    against the recurring and one-time rates (editable; default $122 / $130, within $1).
    Grouped by customer: price now and rate, the price it should be, how many bookings
    are wrong and from when; rates found (e.g. how many still at the old rate), customers
    to fix and the under-billing in the range. Tick customers off as they're changed;
    "Re-check MaidCentral" reads prices again. Copy the to-fix list.
  - Place a customer (`placeCustomer` in `server/src/territory.js`): by typed address
    (suggestions from the US Census geocoder and OpenStreetMap's Photon search, both free
    and keyless; `/api/places/search`), ZIP, area or an existing home: any customer in
    MaidCentral, past or present, picked from everyone with that name (`/api/places/homes`,
    MaidCentral's global search; located from the recurring book, else by address). Each result shows the
    drive in and out on the first visit (from the job before or the office, to the next job
    or the office), the first date that's really free, and clashes later on: recurring spots
    are checked against moved and one-time bookings already in MaidCentral for 12 weeks
    (`LOOKAHEAD_WEEKS`, one Dispatch Board read). "Fit in a one-time clean before …" finds
    one-time openings before a recurring customer's first regular visit. An extra-driving
    limit filters results. Closed days (a weekday with no bookings on any team, e.g.
    Thanksgiving, or a date in `CLOSED_DATES`) and past dates are never offered: a new
    regular's first visit rolls on to the next open date (into later cycles if needed),
    and Reschedule doesn't move anyone onto a closed day. The 4-week plan colours booked jobs by area (MaidCentral's Zone
    colours) and shows each home's ZIP.
  - At least 15 minutes between houses (`minGap()` in `server/src/office.js`, set with
    `MIN_GAP_MIN`): open time on the 4-week plan starts 15 minutes after a house and ends 15
    minutes before the next, and every suggested time (Place a customer, Reschedule,
    Call-outs, Optimization) allows the drive or 15 minutes, whichever is longer. The
    "No time to drive" check uses the same rule.
  - Double bookings (`server/src/conflicts.js`, Openings › Double bookings tab,
    `/api/conflicts`): two real bookings on the same team whose times overlap, and
    back-to-back bookings with less time between them than the drive (road times). Read
    from the shared Dispatch Board for 4 weeks to 6 months ahead (default 12 weeks);
    skipped, moved and cancelled bookings don't count. A clash that repeats every cycle is
    one entry with all its dates. Overlapping jobs are outlined in red on the 4-week plan.
  - Drive times (`server/src/routing.js`, `osrm/`): real road times from our own routing
    service, OSRM (open source) on OpenStreetMap roads cut to the Spokane area, deployed as
    a second Railway service from `osrm/` (built at deploy time; no API key, no per-query
    cost). The web service reaches it at `OSRM_URL` (Railway private network). Homes are
    located by MaidCentral's Customer Efficiency Map; the app learns the drive time between
    every pair of homes and the office (≈107,000 legs in under a second), keeps them in
    memory and adds new places as they appear. Every screen uses them (Openings, Place a
    customer, Call-outs, Reschedule, Optimization). OSRM's free-flow times are scaled by
    `ROAD_FACTOR` (1.1) plus `ROAD_STOP_MIN` (2) to park. If the service is down, drives fall
    back to an estimate from distance calibrated to Spokane (shown with "≈"), and it retries
    a couple of minutes later. `/api/freshness` reports whether road times are in use.
    To refresh the street map, redeploy the `osrm` service.
  - Reschedule (`server/src/reschedule.js`, page `/reschedule`), two flows:
    - Move a customer: find them by name (their bookings in the next 4 weeks; the page
      starts loading those as it opens) or by date; see the 3 best new times as big
      cards with a plain reason ("Their own team · usual time · team already nearby"),
      plus every free time in a day-by-day strip; choose one, copy the ready-made
      message, log the answer (agreed, wants another time, no answer, voicemail,
      cancel) and a note. Recent reschedules are listed.
    - Move a whole day (e.g. a holiday): every booking gets a new slot (hardest first,
      no two in the same place), worked as a checklist with progress, filters (to call,
      waiting, agreed, cancelled), one-tap answers, other times per booking, a message
      per customer (with the reason, e.g. "the Thanksgiving holiday") and the full list
      to copy. Agreed or chosen slots are fixed and the rest re-planned around them.
    Slots are gaps in a team's route (from the stop before or the office at 8:15 AM, the
    clean scaled to the crew, on to the next stop or back by the return time), ranked by
    extra driving, same team, usual time, closeness to the date and spacing from a
    recurring customer's other visits. Entries stay on the device. Read-only: the move is
    made in MaidCentral.
  - Schedule optimization (`server/src/optimize.js`, page `/optimize`): a decision-support
    engine over the 4-week cycle from this Monday, answering five questions in five tabs.
    1. Where we are: productive share of paid time, driving per car per day and its yearly
       cost, idle gaps (free time under 2 h), free time worth selling (2 h+ blocks), late
       returns; per team, per area (how many teams and visits an area's jobs are spread
       over) and the recurring visits that add the most driving.
    2. What's possible: four strategies side by side (Minimum disruption = conservative,
       Balanced = realistic, Maximum profit = aggressive, Rebuild from scratch = theoretical
       ceiling) with driving, idle time, sellable capacity, extra cleans, hard savings vs
       gross profit that depends on new demand, all annualised; plus the least team-days
       the work could fit in.
    3. Roadmap: every change as a recommendation (re-order a route; move or swap a customer
       between teams; move a customer to another day), each with its yearly value, customer
       impact, effort, confidence, the customers affected (before/after team, day, time)
       and why. Phase 1 quick wins (same team and day, ≤ 30 min), phase 2 team rebalancing,
       phase 3 day changes via natural rescheduling. Tick changes to see their combined
       effect (re-evaluated, not added up; changes that rely on another are flagged).
       Changes that don't pay with the office's assumptions are listed separately.
    4. Scenario lab: how far appointments may move, team / day changes, territories,
       protecting weekly customers, maximum driving per day, smallest sellable block; and
       what loosening each rule is worth.
    5. Keep it optimized: where new customers should go (free blocks after the plan, by
       area, day and team), day changes to offer when customers next reschedule, areas to
       consolidate, and the rules that keep routes tight as customers come and go.
    How it works: jobs are grouped into series (one customer's visits on one weekday) so a
    customer keeps one team, day and frequency. Days are re-planned as early as allowed
    from the 8:15 AM departure and must be back by the return time. A local search moves
    and swaps series between teams and days when that cuts driving and fragmented idle
    time; the accepted changes are then replayed in order so each one's benefit is its
    marginal effect. The engine works in minutes and km; dollars are applied in the
    browser from editable assumptions (labour cost per cleaner-hour, paid until back at the
    office vs a fixed day, vehicle cost per km, revenue per cleaner-hour from today's
    Dispatch Board, variable costs, the share of freed time you'd sell per scenario).
    Drive times are estimates from distance (see Drive times below); every number is labelled with that.
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
- **Freshness (one rule for every screen, `server/src/cache.js`):** today's and future
  days' schedule is re-read after 2 minutes (past days after 6 hours); Dispatch Board
  prices after 2 minutes; views built from 4 weeks of schedule (Openings, Optimization)
  after 2 minutes, never shown more than 4 minutes old (rebuilt every 2 minutes for
  people who used the app in the last 30 minutes); Dispatch Board weeks within the 4 weeks
  after 5 minutes; customer locations and areas after 10 minutes; the frequency legend
  after 1 hour. Place a customer re-reads each result's first visit date live from
  MaidCentral before showing it and drops any spot booked in the meantime. Every open screen updates itself every 2 minutes while visible (Team Monitor
  every minute for today). The sidebar shows when data was last read and a Refresh
  button that clears every copy kept for that person (`POST /api/refresh`) so all
  screens read MaidCentral again together. What the office entered for past days
  (call-out results, rescheduling picks) is cleared when the app opens.
- **How MaidCentral is read (`cache.js` `keyed`, `planner.js` `dayData`, `prices.js`
  `boardRows`):** one request per thing is ever in flight per person (a second caller
  waits for it instead of asking again). Days and reports load together, ten days at a
  time. Cleaners' names are read once and shared by all days (the per-day list takes a
  second and barely changes). The Dispatch Board, which takes MaidCentral up to half a
  minute for a long range, is read as calendar weeks in parallel and each week is kept on
  its own (weeks near today 5 minutes, more than 4 weeks out 30 minutes, long past 6
  hours); openings, the price check, call-outs (prices and phones for any date) and the
  revenue rate all share it. The Master Schedule is read once for openings and
  optimization. A cold start of Openings takes about 10 seconds (was about 45).
- **Optimization and the recurring pattern:** closed days (a weekday with no bookings on
  any team, or `CLOSED_DATES`) are not working days, so a holiday is not counted as free
  time to sell. A regular booked off their Master Schedule weekday this cycle is a one-off
  visit (it can change team that day, but is never proposed as a permanent move). A day of
  up to 6 stops is sequenced by trying every order, so its route is the best possible
  within the time limits.
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
