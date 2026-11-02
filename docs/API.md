# MaidCentral API catalog

Generated 2026-11-02T15:46:32.114Z by `npm run catalog`. Do not edit by hand.

Shapes only: every value is replaced by its type, ids by `:id`, the company subdomain by `{tenant}`.
No names, emails, phones, addresses, notes, pay rates or search text.

## Coverage

| Capability | Where | Official API (read / write) | Portal (read / write) |
| --- | --- | --- | --- |
| Sign-in and session | **official API** | 0 / 1 | 0 / 0 |
| Clients and homes | **not seen** | 0 / 0 | 0 / 0 |
| Leads and quotes | **official API** | 2 / 4 | 0 / 0 |
| Jobs | **not seen** | 0 / 0 | 0 / 0 |
| Schedule and dispatch | **official API** | 1 / 0 | 0 / 0 |
| Teams | **official API** | 1 / 0 | 0 / 0 |
| Employees | **not seen** | 0 / 0 | 0 / 0 |
| Payroll and time | **not seen** | 0 / 0 | 0 / 0 |
| Invoices and payments | **not seen** | 0 / 0 | 0 / 0 |
| Pricing and services | **official API** | 5 / 1 | 0 / 0 |
| Notes and messages | **official API** | 3 / 1 | 0 / 0 |
| Reports and dashboard | **not seen** | 0 / 0 | 0 / 0 |
| Settings and lookups | **official API** | 4 / 0 | 0 / 0 |

## 1. Official API

Docs: https://support.maidcentral.com/apidocs  
Production: `https://api.maidcentral.com` · Sandbox: `https://api.maidcentral.net`  
Auth: POST /token (form-encoded) with username and password (grant_type=password), or refresh_token (grant_type=refresh_token); then Authorization: Bearer <token>. Credentials come from an API User (Company > Settings > General > Integrations > API Users).

> Docs read end to end on 2026-11-02: 23 endpoints including /token, all under /api/Lead and /api/Note. The API covers the online-booking funnel (leads, quotes, pricing, availability, booking) plus notes and a few lookups. It has no endpoints for existing clients, jobs, the schedule, employees, payroll or invoices. Not probed yet (no API user in the session).

| Method | Path | Purpose | Verified |
| --- | --- | --- | --- |
| GET | `/api/Lead/Availability` | Available job dates for a scope group (hours or amount required) | no |
| GET | `/api/Lead/BillingTerms` | Billing terms (lookup) | no |
| POST | `/api/Lead/BookQuote` | Book a quote (turns it into scheduled service). Card details only as a CardConnect iFrame token; Stripe and Authorize.Net not supported | no |
| POST | `/api/Lead/CalculatePrice` | Calculate a price without creating a lead | no |
| POST | `/api/Lead/CreateOrUpdate` | Create or update a lead (contact details, postal code, source, tags) | no |
| POST | `/api/Lead/CreateOrUpdateQuote` | Create or update a quote for a lead (home, scopes, answers, rate modifications) | no |
| GET | `/api/Lead/CustomerSources` | Customer sources (lookup) | no |
| GET | `/api/Lead/Lead` | Get a lead | no |
| GET | `/api/Lead/PostalCodes` | Serviceable postal codes by home zone | no |
| GET | `/api/Lead/Questions` | Booking and pricing questions for one or more scopes | no |
| GET | `/api/Lead/Quote` | Get a quote | no |
| GET | `/api/Lead/RateModifications` | Rate modifications (extras, add-ons) for a scope group | no |
| GET | `/api/Lead/ScopeFrequencies` | Frequency options for a scope | no |
| GET | `/api/Lead/ScopeGroups` | Scope groups (service categories), with their scopes and frequencies | no |
| GET | `/api/Lead/Scopes` | Scopes (services) in a scope group | no |
| GET | `/api/Lead/Tags` | Tags with their categories (lookup) | no |
| GET | `/api/Lead/Teams` | Teams (lookup) | no |
| POST | `/api/Lead/Utm` | Attach UTM data to a lead or quote | no |
| GET | `/api/Note/CommunicationDirections` | Note communication directions (lookup) | no |
| POST | `/api/Note/Create` | Create a note for a customer, quote or employee | no |
| GET | `/api/Note/EntityTypes` | Note entity types (lookup) | no |
| GET | `/api/Note/Types` | Note types (lookup) | no |
| POST | `/token` | Get a bearer token for the API user (grant_type=password) or refresh it (grant_type=refresh_token) | no |

## 2. Admin portal

Not captured yet. Run `npm run capture`.
