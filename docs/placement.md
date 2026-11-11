# Placement contract

How the Sales Hub places a customer (quote, find a slot, hold it, book it) through each
brand's front end app. The spec is [`contracts/placement/openapi.yaml`](../contracts/placement/openapi.yaml).

## Why the apps expose it

Each front end app (Launch27, MaidCentral, later BookingKoala) has its own scheduling rules.
If the hub called the booking platforms directly it would skip those rules, or need its own
copy of them, which would drift. So the rules stay in the app that owns the schedule, and
every app exposes the **same** API:

```
Sales Hub ──(placement contract v1)──► Launch27 front end    ──► Launch27     (UrbanMop)
  leads, brand attribution,       ──► MaidCentral front end ──► MaidCentral  (Clean Bee)
  nurturing, rep UI               ──► BookingKoala front end ──► BookingKoala (later)
```

| Owner | Owns |
| --- | --- |
| Sales Hub | Leads, brand attribution, nurturing, the rep's screens. Picks which app to call from the lead's brand. Knows nothing about scheduling |
| Each front end app | Its scheduling rules, pricing, service areas, holds, and the write into its booking platform |
| This contract | The shape of the conversation between them. Defined once, implemented by every app |

The apps' own public booking forms should call the same endpoints, so a booking made by sales
and one made online go through the same rules.

## The flow

```
Rep enters address + service ─► POST /quote ─► price, duration, quote_id  (or serviceable=false)
Rep picks dates              ─► GET /availability?quote_id&from&to ─► slots, best first
Rep picks a slot             ─► POST /holds {slot_token} ─► hold_id, expires_at (about 10 min)
Rep enters customer details  ─► POST /bookings {hold_id, customer} + Idempotency-Key
                                 ─► booking_id, customer_id in the platform
Rep backs out                ─► DELETE /holds/{hold_id}
```

`GET /health` tells the hub whether the app (and its platform) is up and how it holds slots.
`GET /catalog?brand=` lists the brand's services, home details and extras, so the hub can build
the quote form without hard-coding any brand.

## Rules every app must follow

1. **Brand on every call.** Requests carry the brand key (`urbanmop`, `cleanbee`...). An app that
   doesn't serve that brand answers `422 brand_not_served`. One app may serve several brands.
2. **Service auth, not staff logins.** The hub sends `Authorization: Bearer <token>`, a token the
   app issued to the hub and that only grants `/api/placement/v1`. Who actually did it goes in
   `placed_by` (rep id and name) and must be written to the app's audit log.
3. **Scheduling rules run twice.** Once for `/availability` and again inside `/bookings`, because
   someone may have changed the schedule in the platform's admin since the hold. If the slot is
   gone, answer `409 slot_unavailable` and write nothing.
4. **Holds.** A hold stops a second rep, or an online customer, from taking the slot. If the
   platform can't reserve slots itself, the app keeps the hold in its own database
   (`capabilities.holds: "local"`) and hides held slots from its own availability. That's only
   reliable if every booking goes through the app, hence rule 3. Releasing a hold twice is fine (204).
5. **Idempotent bookings.** `POST /bookings` requires an `Idempotency-Key` header. Same key and
   same body: return the original booking with 200 and write nothing. Same key, different body:
   `409 idempotency_conflict`. Check the header before anything else (missing: `400 invalid_request`).
   Keep keys at least 24 hours.
6. **Existing customers.** Match an existing customer by email or phone before creating one, and
   say which happened in `customer_created`.
7. **Not serviceable is an answer, not an error.** `/quote` returns 200 with `serviceable: false`
   and a reason. An empty slot list is also a normal answer.
8. **One error shape.** `{ "error": { "code", "message", "retryable", "details"? } }` with the codes
   and statuses listed in the spec. `message` is shown to the rep, so write it for a person.
9. **Money and time.** Money is integer cents with a currency. Times are RFC 3339 with an offset;
   `from` and `to` are dates in the brand's time zone, at most 31 days apart.
10. **Booking questions.** If the brand asks questions on every booking (parking, pets, how they
    heard about us, terms), list them in the catalog's `questions`. A booking missing a required
    answer fails with `400 invalid_request` and `details.questions` listing the ids, and the hold
    stays usable. A required checkbox (e.g. the customer accepted the terms) must be `true`: the
    rep confirms it with the customer, it is never ticked by default.
11. **Hourly services.** A service sold by time has `hourly` in the catalog; the quote then sends
    `minutes`.
12. **Versioning.** Breaking changes need `/api/placement/v2`. Within v1 only add things (optional
    fields, endpoints, error codes), and callers ignore fields they don't know.

## Checking an implementation

`contracts/placement` is an npm package with:

- `validate(schemaName, value)` and `validateResponse(operationId, status, body)`: use them in
  the app's own tests.
- `runConformance(...)`: calls a running app the way the hub will and checks every response,
  status and error code. Read-only unless asked.
- A reference fake app (`contracts/placement/test/fake-app.js`) that passes every check.

```bash
PLACEMENT_TOKEN=... npm run conformance -- --base-url https://<app> --brand urbanmop --quote quote.json
PLACEMENT_TOKEN=... npm run conformance -- --base-url https://<app> --brand urbanmop --quote quote.json --holds
```

Contract history: **1.1.0** added hourly services (`hourly`, `minutes`) and booking questions
(`questions`, `answers`), both found while building the Launch27 side. 1.0.0 was the first draft.

`--quote` is a JSON file with a QuoteRequest that the app should find serviceable (the
`QuoteRequest` example in the spec works for a test company). `--holds` also creates and
releases a hold. `--book book.json` (`{ "customer": {...}, "answers": [...] }`) also books, replays and checks
idempotency. That **writes a real customer and booking**, so only use it against a sandbox or
test company.

## Implementations

| App | State |
| --- | --- |
| Launch27 front end (UrbanMop) | Implemented on `feature/placement-api`: passes every conformance check, booking included, against its synthetic Launch27. Brand keys `urbanmop-residential` (served) and `urbanmop-commercial` (not yet). See that repo's `docs/placement.md` |
| MaidCentral front end (Clean Bee) | Not started: needs Phase 0 recon first |
| BookingKoala front end | Not started |

## Where the contract lives

It's drafted here because this repo is where the work started; the Launch27 front end has a
vendored copy. It isn't specific to MaidCentral:
once the Launch27 front end starts implementing it, move `contracts/placement` to its own repo
or package so the Launch27, MaidCentral and BookingKoala apps and the hub all depend on the same
version.

## Open questions

- **Pricing owner.** The contract assumes each app prices its own brand (it already has the rules).
  If prices should be set centrally, `/quote` still works, but the app would read prices from the hub.
- **MaidCentral holds and availability.** MaidCentral schedules by team and route; we don't yet know
  whether its API can reserve a slot or list open time directly. Expect `holds: "local"` and
  availability calculated by the app. Confirm once Phase 0 recon is unblocked.
- **Brands sharing an area.** If two brands serve the same postal codes, the hub picks the brand from
  the lead, not from the address. The apps never need to decide.
