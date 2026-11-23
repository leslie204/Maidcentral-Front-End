# Phase 0: Recon

## Status (2026-11-02): done, apart from the optional API probe

| Step | State |
| --- | --- |
| 1. Read the API docs | **Done.** 23 endpoints in `capture/official-api.json` and `docs/API.md` |
| 2. Probe the API | **Skipped.** There's no API user. Low value: the API only covers online booking (below). Create one later under Company > Settings > General > Integrations > API Users if needed |
| 3. Crawl the portal | **Done.** 250 pages, 0 failures, 267 endpoints (31 of them reads sent as POST), read-only (nothing was changed in MaidCentral). Catalog in `docs/API.md` |
| 4. Coverage + auth recommendation | **Done** (below). Needs the owner's sign-off |

## 1. Coverage: official API vs portal

| Area | Official API | Portal |
| --- | --- | --- |
| Clients and homes | none | yes |
| Leads and quotes | create/get lead, create/get/book quote | yes |
| Jobs | none | yes |
| Schedule and dispatch | availability only | yes |
| Teams | list | yes |
| Employees | none | yes |
| Invoices and payments | none | yes (reads) |
| Pricing and services | scope groups, scopes, rate modifications, price calculation | yes |
| Notes and messages | create note, lookups | yes |
| Reports and dashboard | none | yes |
| Settings and lookups | a few lookups | yes |
| Payroll and time | none | **not crawled on purpose** (payroll is off-limits to the crawler) |

**Conclusion:** the official API is the online-booking funnel plus notes. **Everything an
admin front end needs day to day is portal only.** Per-area endpoint counts are in the
coverage table in `docs/API.md`.

### Official API details

- `POST /token` (form-encoded, `grant_type=password` or `refresh_token`), then a bearer
  token. Credentials belong to a shared **API User**, not a person.
- Every response is wrapped as `{ IsSuccess, Message, Result, InnerException, StatusCode }`.
- `BookQuote` only takes a **CardConnect** iFrame token (no raw cards, no Stripe/Authorize.Net).

## 2. How the portal works

- **Stack:** ASP.NET MVC, server-rendered pages with jQuery 1.11. Most pages (139 of 196
  page types) then load data over XHR, about 20 use Kendo grids, and it sits behind
  Cloudflare. Its own scripts are served from the tenant host: the CDN hosts in its CSP
  weren't needed for the crawl.
- **Reads are often POSTs.** Calendars, grids, stats and record tabs load with `POST`
  (e.g. `/Job/MonthlyData`, `/Customer/Jobs`, `/Estimate/GetPipelineData`), with a JSON or
  form body holding an id or a date range. The crawler lets through only reviewed or
  query-named POSTs (`capture/read-posts.txt`, `capture/safety.js`).
- **Some pages fire real actions on load.** For example, `/Company/BroadcastMessage` posts
  a draft broadcast as soon as it opens (`ConfirmedToSend=False`). The rebuild must never
  replay a page's load-time POSTs blindly.
- **Auth is cookies only.** No bearer tokens, nothing in localStorage.

  | Cookie | Lifetime |
  | --- | --- |
  | `.AspNet.ApplicationCookie` | the sign-in; **12 hours, sliding** (renewed by use) |
  | `ASP.NET_SessionId` | server session (browser-session cookie) |
  | `__RequestVerificationToken` | anti-forgery cookie half |
  | `TwoFactorRememberBrowser` | **30 days**: skips 2FA on this "browser" |

- **Anti-forgery:** `__RequestVerificationToken` hidden fields in forms (no header
  variant seen). A server writing through the portal must GET the form first and post the
  token back with the cookie.
- **Login flow (stock ASP.NET Identity 2FA):** `POST /Account/Login` → `/Account/SendCode`
  (choose email/text) → `POST /Account/VerifyCode` (code valid 5 minutes, "Remember this
  browser?" checkbox). **2FA is mandatory for office users.**

## 3. Auth recommendation

**Option C: people sign in with their own MaidCentral login, through our server.**

1. Our login screen takes email and password. The server runs `/Account/Login`; if
   MaidCentral asks for 2FA, our screen asks for the code and the server posts it with
   "Remember this browser" ticked.
2. The server keeps that person's MaidCentral cookies encrypted in Postgres, keyed to
   our own session, and never sends them to the browser. **We don't store passwords.**
3. Each request for portal data is made with that person's cookies, so **MaidCentral
   enforces their own permissions** and its history shows the real person.
4. Their session lives 12 hours from last use. After that they enter their password
   again; thanks to the 30-day remember cookie, usually no code. After 30 days, a code again.
5. The official API (shared API user, if one is created) is used only for the booking
   funnel and notes.

Why not one shared account for everything (Option B′): it's simpler, but every change would
show in MaidCentral as that one account, we'd have to rebuild MaidCentral's permission
rules ourselves, and someone would have to refresh its 2FA every 30 days.

**Risks to watch in Phase 2/3:** Cloudflare may challenge traffic from Railway's IPs (test
early with a real login from a Railway service); MaidCentral may limit concurrent sessions
per user (an office person signed in to both MaidCentral and our app); writes need the
anti-forgery dance above.

## 4. Re-running the crawl

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium npm run capture -- --max-pages 250
```

The saved login (`capture/.auth/state.json`, gitignored) skips 2FA until early December
2026. When a code is needed, the crawler clicks "Send code", saves a screenshot to
`capture/output/screens/_2fa.png`, and waits up to 10 minutes for the code in
`capture/.auth/2fa-code`. When a crawl logs `blocked (write)` for a POST that only reads,
review it and add it to `capture/read-posts.txt`.

## Open items

- Payroll pages were never crawled. If the new front end needs payroll, decide how to
  capture it safely first.
- The 250-page crawl left about 6,500 queued links, mostly more records of page types it
  had already seen (max 2 per type). A longer crawl (`--max-pages 500`) may find a few
  more rare page types.
