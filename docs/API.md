# MaidCentral API catalog

Generated 2026-11-02T15:33:19.437Z by `npm run catalog`. Do not edit by hand.

Shapes only: every value is replaced by its type, ids by `:id`, the company subdomain by `{tenant}`.
No names, emails, phones, addresses, notes, pay rates or search text.

## Coverage

| Capability | Where | Official API (read / write) | Portal (read / write) |
| --- | --- | --- | --- |
| Sign-in and session | **official API** | 0 / 1 | 0 / 0 |
| Clients and homes | **not seen** | 0 / 0 | 0 / 0 |
| Leads and quotes | **not seen** | 0 / 0 | 0 / 0 |
| Jobs | **not seen** | 0 / 0 | 0 / 0 |
| Schedule and dispatch | **not seen** | 0 / 0 | 0 / 0 |
| Teams | **not seen** | 0 / 0 | 0 / 0 |
| Employees | **not seen** | 0 / 0 | 0 / 0 |
| Payroll and time | **not seen** | 0 / 0 | 0 / 0 |
| Invoices and payments | **not seen** | 0 / 0 | 0 / 0 |
| Pricing and services | **not seen** | 0 / 0 | 0 / 0 |
| Notes and messages | **not seen** | 0 / 0 | 0 / 0 |
| Reports and dashboard | **not seen** | 0 / 0 | 0 / 0 |
| Settings and lookups | **not seen** | 0 / 0 | 0 / 0 |

## 1. Official API

Docs: https://support.maidcentral.com/apidocs  
Production: `https://api.maidcentral.com` · Sandbox: `https://api.maidcentral.net`  
Auth: POST /token with username, password and grant_type (password or refresh_token); then Authorization: Bearer <token>.

> Docs not yet read: support.maidcentral.com was blocked by the cloud session's network policy on 2026-11-02. Only /token is listed, from a public search result.

| Method | Path | Purpose | Verified |
| --- | --- | --- | --- |
| POST | `/token` | Get a bearer token for the API user (grant_type=password) or refresh it (grant_type=refresh_token) | no |

## 2. Admin portal

Not captured yet. Run `npm run capture`.
