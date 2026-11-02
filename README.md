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
| 0. Recon | **Blocked**: the cloud session can't reach MaidCentral yet. See [docs/recon.md](docs/recon.md) |
| 1. Capture tool | Built and tested against a local fake portal; not yet run on the real portal |
| 2. Verify writes | Not started |
| 3. App skeleton | Not started (waiting on the auth decision) |
| 4. Pages | Not started |

## Setup

Requires Node 22+.

```bash
npm install
cp .env.example .env     # fill in; .env is gitignored
npm run check            # lint + unit tests (same as CI)
```

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
npm run capture -- --headed         # watch it, or log in by hand (needed for 2FA)
npm run bundle-routes               # list routes found in the portal's JavaScript
npm run catalog                     # rebuild docs/ from capture/output/ without crawling
```

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
`--allow-writes`.

**Read-only by default** (`capture/safety.js`):

- After sign-in, every request that isn't GET/HEAD/OPTIONS is blocked and logged as
  "blocked: write", so the catalog still lists it. That includes writes the page fires
  on its own as soon as it loads.
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
