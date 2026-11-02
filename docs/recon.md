# Phase 0: Recon

## Status (2026-11-02, second session)

| Step | State |
| --- | --- |
| 1. Read the API docs | **Done.** 23 endpoints in `capture/official-api.json` and `docs/API.md` |
| 2. Probe the API | Waiting: the `MC_API_*` secrets aren't in this session yet (they only reach a new session) |
| 3. Crawl the portal | Waiting on the `MC_*` secrets, `MC_PORTAL_URL` and wider network access (below) |
| 4. Coverage + auth recommendation | Provisional, below; confirm after step 3 |

### What the environment still needs

- **Secrets** (environment variables): `MC_PORTAL_URL`, `MC_EMAIL`, `MC_PASSWORD`,
  `MC_API_USERNAME`, `MC_API_PASSWORD` (sandbox pair optional). Start a new session after
  adding them.
- **Network:** `support.maidcentral.com`, `api.maidcentral.com` and `api.maidcentral.net`
  are reachable now, but `maidcentral.com` and other subdomains are not. The portal is a
  tenant subdomain (`<company>.maidcentral.com`) and its Content-Security-Policy loads
  scripts from about 30 other hosts (Kendo/Telerik, Syncfusion, DataTables, Highcharts,
  amCharts, jQuery, Bootstrap, cdnjs, jsDelivr, unpkg, Google Maps, Stripe, CardConnect,
  Authorize.Net, HubSpot, Pendo, Intercom, Usersnap, Azure Monitor…). The simplest fix is
  the **Full** network level for the capture session; otherwise allow at least
  `*.maidcentral.com`, `*.maidcentral.net` and those CDNs.
- **2FA:** MaidCentral **requires 2FA for every office user** (optional only for
  technicians). Codes go by email (or text). The crawler now handles this headlessly; see
  "Running the crawl with 2FA" below.

## 1. What the official API covers

Read end to end from `https://support.maidcentral.com/llms.txt` (section `v1-api`).

- **Auth:** `POST /token`, form-encoded `username` / `password` / `grant_type=password`
  (or `grant_type=refresh_token` + `refresh_token`), then `Authorization: Bearer <token>`.
  Credentials belong to an **API User** (Company > Settings > General > Integrations >
  API Users). They're shared, not tied to a person. The same API users power the Zapier
  integration.
- **Every response** is wrapped as `{ IsSuccess, Message, Result, InnerException, StatusCode }`.
- **Endpoints (22 + /token)** are all under two controllers:
  - `/api/Lead/*`: the **online-booking funnel**. Create or update a lead, get a lead,
    create or update a quote, get a quote, calculate a price, book a quote, attach UTM
    data, plus lookups: scope groups, scopes, frequencies, rate modifications,
    questions, availability, postal codes, customer sources, billing terms, tags, teams.
  - `/api/Note/*`: create a note on a customer, quote or employee, plus note-type lookups.
- **Booking payments:** `BookQuote` only takes a **CardConnect** iFrame token. Raw card
  numbers aren't accepted, and Stripe and Authorize.Net aren't supported.
- **Not in the API at all:** existing clients and homes, jobs, the schedule and dispatch,
  employees, payroll and time, invoices and payments, reports, settings. There are no
  list or search endpoints for existing records. Everything an admin front end does day to
  day is **portal only**.
- **Zapier triggers** (lead created/closed, quote sent/booked, job completed, contact
  updated, do-not-market, service cancelled) use the same API users but aren't documented
  as public endpoints. They're webhook-style feeds, not reads.

## 2. What we know about the portal so far (from public responses, no login)

- **ASP.NET MVC** (server-rendered pages) with OWIN cookie auth (`.AspNet.ApplicationCookie`),
  behind Cloudflare, with Azure Application Insights.
- `api.maidcentral.com/Account/Login` redirects to `/Account/Discover` and then to the
  marketing site, so the API host isn't where admins log in. The portal is the tenant
  subdomain (`MC_PORTAL_URL`).
- UI libraries per the CSP: jQuery, Bootstrap, Kendo UI (Telerik), Syncfusion,
  DataTables, Highcharts/amCharts. Expect server-rendered pages plus Kendo/DataTables
  grids that load JSON over XHR. That's exactly what the crawler records.
- Expect `__RequestVerificationToken` anti-forgery fields on forms. To confirm in step 3.

## 3. Auth: recommendation (updated, to confirm after the crawl)

The docs change the picture. The official API can't read clients, jobs, the schedule,
employees or money, so **most data must come from the portal session whatever we choose**.
The API user alone (old Option B) can't power an admin front end.

**Option C (hybrid), still recommended, with 2FA handled up front:**

- People sign in to our app with **their own MaidCentral login**. Our server performs the
  portal login on their behalf, relays MaidCentral's **2FA step** (send code, enter code)
  to our login screen, and ticks "Remember this browser". It keeps the resulting portal
  cookies server-side, encrypted per user, never in the browser.
- MaidCentral then enforces each person's own permissions, and audit trails in
  MaidCentral show the real person.
- The official API (shared API user) is used where it fits: the booking funnel and notes.
- **Risks to check in the crawl:** how long the portal session and the 30-day "remember
  this browser" cookie last when replayed from a server; whether anti-forgery tokens are
  per page (we'd fetch the page first, then post); and whether Cloudflare challenges
  server-side traffic (bot checks).

**Fallback (Option B′):** if per-user sessions turn out to be brittle (Cloudflare bot
checks, device binding), use **one dedicated MaidCentral office account** for the server
(2FA done once, remembered for 30 days and renewed by a person) plus our own users and
roles in our database. Simpler, but MaidCentral's audit trail would show that one account
for everything, and we'd have to re-create permission rules ourselves.

## 4. Running the crawl with 2FA (cloud session, no browser window)

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium npm run capture -- --max-pages 20
```

When MaidCentral asks for a code, the crawler clicks "Send code" if the page has one
(preferring email), saves a screenshot to `capture/output/screens/_2fa.png`, and waits up
to 10 minutes for the code to appear in `capture/.auth/2fa-code` (gitignored). The person
tells the session the code and it is written to that file. The crawler ticks "Remember
this browser", so the saved session (`capture/.auth/state.json`) skips 2FA for 30 days.

## To do once unblocked

1. `npm run probe -- /api/Lead/ScopeGroups /api/Lead/Teams /api/Lead/BillingTerms /api/Note/Types`
   (and `--sandbox`), then mark endpoints verified.
2. `npm run capture -- --max-pages 20`, then read docs/API.md → "How the portal talks to
   its backend": domains, auth, anti-forgery tokens, rendering, Cloudflare behaviour.
   If it's a SPA, run `npm run bundle-routes` for seeds.
3. Full crawl; confirm or revise the auth recommendation above; Phase 0 done.
