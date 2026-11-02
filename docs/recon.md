# Phase 0: Recon

## Status (2026-11-02): blocked on environment setup

The first cloud session could not reach MaidCentral:

- **Network:** the environment's network policy refused `support.maidcentral.com`,
  `api.maidcentral.com`, `api.maidcentral.net` and the portal host. To fix it, open the
  environment settings → Network access, then choose a broader level or add those hosts
  under Allowed domains. The portal probably also loads scripts from CDNs, so a broader
  level is simpler for the crawl.
- **Secrets:** none of the `MC_*` variables were set. Add them as environment variables
  (names in `.env.example`), including `MC_PORTAL_URL`. Environment changes only reach a
  new session.

## What we know so far (from public search results, not yet from the docs)

- Official API: production `https://api.maidcentral.com`, sandbox `https://api.maidcentral.net`.
- `POST /token` with `username`, `password`, `grant_type` (`password` | `refresh_token`)
  returns a token, sent as `Authorization: Bearer <token>`.
- API users are created in Company > Settings > General > Integrations > API User.
- It is described as covering leads, quotes, bookings "and other operations". There's no
  endpoint list yet.
- Docs index for reading end to end: `https://support.maidcentral.com/llms.txt`.

## To do once unblocked

1. Read the docs end to end; list every endpoint (method, path, purpose) in
   `capture/official-api.json`.
2. `npm run probe -- <a few harmless GETs>` (production) and `--sandbox`.
3. `npm run capture -- --max-pages 20` (or `--headed` if there is 2FA), then read
   docs/API.md → "How the portal talks to its backend". Check:
   - **Domains:** which hosts the portal calls.
   - **Auth:** cookie/session or bearer token.
   - **Anti-forgery tokens:** field or header.
   - **Rendering:** server-rendered or SPA.

   If it's a SPA, run `npm run bundle-routes` to get the seed list.
4. Report what the official API covers versus portal only, and a recommendation on auth.

## Auth: provisional recommendation (to confirm after step 3)

**Option C (hybrid).** The official API runs as one shared API user, so it can't tell us
who is using the app or what they may do. People sign in with their own MaidCentral login,
which proves who they are and lets MaidCentral enforce their permissions, as in the
Launch27 build. Data comes from the official API where it exists, and the replayed portal
session handles the rest.

This depends on the portal session being replayable from a server:
- 2FA, device binding or short-lived anti-forgery tokens tied to the browser would make
  that brittle.
- If so, fall back to **Option B** (API user plus our own roles).
