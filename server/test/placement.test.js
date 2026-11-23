// The placement API (src/placement/): the contract's own conformance checker against this
// app, with MaidCentral replaced by a stub openings engine, plus Clean Bee's own rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { runConformance } from 'placement-contract/conformance';
import { validateResponse } from 'placement-contract';
import { createPlacement, zoned } from '../src/placement/service.js';
import { createPlacementRouter } from '../src/placement/api.js';
import { MemoryPlacementStore } from '../src/placement/store.js';
import { parseTokens, newToken, callerFor } from '../src/placement/tokens.js';

const TODAY = '2026-11-23'; // a Monday
const HUB = newToken('sales-hub');

// Openings as territory.placeCustomer returns them (only the fields the API reads).
const OPENINGS = [
  { id: '7-Tuesday-540-Every 2 weeks-13', teamId: 7, team: 'Team Blue', weeks: 2, dates: ['2026-11-24', '2026-12-08'], firstDate: '2026-11-24', takenOn: [], arriveMin: 540, doneMin: 690, reasons: [{ text: 'On the team’s way (4 min extra driving)', tone: 'good' }] },
  { id: '9-Thursday-780-Every 2 weeks-24', teamId: 9, team: 'Team Gold', weeks: 2, dates: ['2026-12-03'], firstDate: '2026-12-03', takenOn: [], arriveMin: 780, doneMin: 930, reasons: [{ text: '12 min extra driving', tone: 'neutral' }] },
];

function setup({ signedIn = true, place } = {}) {
  const calls = [];
  const hubUser = {
    status: () => ({ state: signedIn ? 'signed_in' : 'signed_out' }),
    use: async (fn) => {
      if (!signedIn) throw Object.assign(new Error('Clean Bee’s Sales Hub connection is signed out of MaidCentral.'), { code: 'hub_user' });
      return fn({});
    },
  };
  const service = createPlacement({
    store: new MemoryPlacementStore(),
    hubUser,
    config: { brand: 'cleanbee', timezone: 'America/Los_Angeles', currency: 'USD', rateRecurring: 122, rateOneTime: 130, signingKey: Buffer.alloc(32, 7) },
    place: place || (async (mc, params) => {
      calls.push(params);
      return { results: OPENINGS, checkedLive: '2026-11-23T18:00:00.000Z' };
    }),
    geocode: async (text) => (/Nowhere/.test(text) ? { lat: 40.7, lng: -74, matched: text } : /Unknown/.test(text) ? null : { lat: 47.67, lng: -117.4, matched: '623 N HOGAN ST, SPOKANE, WA, 99202' }),
    today: () => TODAY,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/placement/v1', createPlacementRouter({ placement: service, config: { tokens: parseTokens(HUB.entry).tokens, production: false }, log: { warn() {}, error() {}, info() {} } }));
  return { app, service, calls };
}

async function listen(app) {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

const ADDRESS = { line1: '623 N Hogan St', city: 'Spokane', region: 'WA', postal_code: '99202', country: 'US' };
const QUOTE = { brand: 'cleanbee', address: ADDRESS, service_code: 'standard', frequency: 'biweekly', minutes: 150 };

test('tokens: the fingerprint entry lets the token in, nothing else', () => {
  const { tokens, bad } = parseTokens(`${HUB.entry}, short:abc, Bad Name:${'x'.repeat(40)}`);
  assert.deepEqual(bad, ['short', 'Bad Name']);
  assert.equal(callerFor(tokens, `Bearer ${HUB.token}`), 'sales-hub');
  assert.equal(callerFor(tokens, `Bearer ${HUB.token}x`), null);
  assert.equal(callerFor(tokens, ''), null);
});

test('conformance: every check of the placement contract passes, holds included', async () => {
  const { app } = setup();
  const s = await listen(app);
  try {
    const results = await runConformance({ baseUrl: s.url, token: HUB.token, brand: 'cleanbee', quoteRequest: QUOTE, holds: true, days: 14 });
    const failed = results.filter((r) => !r.ok);
    assert.deepEqual(failed, [], JSON.stringify(failed, null, 2));
    assert.ok(results.length >= 10);
  } finally {
    await s.close();
  }
});

test('health: manual bookings, local holds; down with a reason when the Hub user is signed out', async () => {
  const up = await setup().service.health();
  assert.deepEqual([up.status, up.platform, up.capabilities], ['ok', 'maidcentral', { holds: 'local', bookings: 'manual' }]);
  assert.deepEqual(validateResponse('getHealth', 200, up), []);
  const down = await setup({ signedIn: false }).service.health();
  assert.equal(down.status, 'down');
  assert.match(down.message, /signed out/);
});

test('quote: priced by the hour on site at the recurring or one-time rate', async () => {
  const { service } = setup();
  const q = await service.quote(QUOTE, 'sales-hub');
  assert.equal(q.serviceable, true);
  assert.deepEqual(q.price.first_visit, { amount_cents: 30500, currency: 'USD' }); // 2.5 h × $122
  assert.deepEqual(q.price.recurring_visit, { amount_cents: 30500, currency: 'USD' });
  assert.match(q.price.lines[0].label, /2\.5 hours on site, two-person team, at \$122\/hr/);
  const once = await service.quote({ ...QUOTE, frequency: 'one_time', minutes: 180 }, 'sales-hub');
  assert.deepEqual(once.price.first_visit.amount_cents, 39000); // 3 h × $130
  assert.equal(once.price.recurring_visit, undefined);
  assert.deepEqual(validateResponse('createQuote', 200, q), []);
});

test('quote: outside Spokane, another service, or no length is answered plainly', async () => {
  const { service } = setup();
  const far = await service.quote({ ...QUOTE, address: { ...ADDRESS, line1: '1 Nowhere Rd' } }, 'sales-hub');
  assert.deepEqual([far.serviceable, far.not_serviceable_reason], [false, 'outside_service_area']);
  const other = await service.quote({ ...QUOTE, service_code: 'deep' }, 'sales-hub');
  assert.equal(other.not_serviceable_reason, 'service_not_offered');
  await assert.rejects(service.quote({ ...QUOTE, minutes: undefined }, 'sales-hub'), /how long the team will be there/);
  await assert.rejects(service.quote({ ...QUOTE, brand: 'urbanmop' }, 'sales-hub'), { code: 'brand_not_served' });
});

test('quote: an address not on the map is placed near its ZIP, and says so', async () => {
  const { service, calls } = setup();
  const q = await service.quote({ ...QUOTE, address: { ...ADDRESS, line1: '9 Unknown Ln' } }, 'sales-hub');
  assert.match(q.message, /near its ZIP code/);
  await service.availability({ quote_id: q.quote_id, from: TODAY, to: '2026-12-06' });
  assert.deepEqual(calls.at(-1), { frequency: '2', hours: 2.5, zip: '99202' });
});

test('availability: the engine’s openings as slots, in Pacific time, with the reasons for the rep', async () => {
  const { service, calls } = setup();
  const q = await service.quote(QUOTE, 'sales-hub');
  const a = await service.availability({ quote_id: q.quote_id, from: TODAY, to: '2026-12-06' });
  assert.deepEqual(calls.at(-1), { frequency: '2', hours: 2.5, lat: 47.67, lng: -117.4, address: '623 N HOGAN ST, SPOKANE, WA, 99202' });
  assert.deepEqual(a.slots.map((s) => [s.start, s.end, s.team.name]), [
    ['2026-11-24T09:00:00-08:00', '2026-11-24T11:30:00-08:00', 'Team Blue'],
    ['2026-12-03T13:00:00-08:00', '2026-12-03T15:30:00-08:00', 'Team Gold'],
  ]);
  assert.equal(a.slots[0].notes[0], 'Every other Tuesday');
  assert.equal(a.slots[0].notes[1], 'On the team’s way (4 min extra driving)');
  // A later window: the every-other-week spot's next visit.
  const later = await service.availability({ quote_id: q.quote_id, from: '2026-12-07', to: '2026-12-20' });
  assert.deepEqual(later.slots.map((s) => s.start.slice(0, 10)), ['2026-12-08', '2026-12-17']);
  assert.deepEqual(validateResponse('getAvailability', 200, a), []);
});

test('holds: a held spot is hidden from everyone else and can’t be held twice; release frees it', async () => {
  const { service } = setup();
  const q = await service.quote(QUOTE, 'sales-hub');
  const [first] = (await service.availability({ quote_id: q.quote_id, from: TODAY, to: '2026-12-06' })).slots;
  const h = await service.hold({ slot_token: first.slot_token, placed_by: { kind: 'sales_rep', id: 'ana@hub.test' } });
  assert.equal(h.kind, 'local');
  assert.equal(Date.parse(h.expires_at) - Date.now() > 14 * 60_000, true);
  // Another rep, another quote for a nearby home: the series is taken.
  const q2 = await service.quote(QUOTE, 'sales-hub');
  const shown = (await service.availability({ quote_id: q2.quote_id, from: TODAY, to: '2026-12-20' })).slots;
  assert.ok(!shown.some((s) => s.team.name === 'Team Blue'));
  await assert.rejects(service.hold({ slot_token: first.slot_token, placed_by: { kind: 'sales_rep', id: 'ben@hub.test' } }), { code: 'slot_unavailable' });
  await service.release(h.hold_id);
  const back = (await service.availability({ quote_id: q2.quote_id, from: TODAY, to: '2026-12-06' })).slots;
  assert.ok(back.some((s) => s.team.name === 'Team Blue'));
});

test('holds: a time taken in MaidCentral since it was offered is refused', async () => {
  let open = OPENINGS;
  const { service } = setup({ place: async () => ({ results: open }) });
  const q = await service.quote(QUOTE, 'sales-hub');
  const [first] = (await service.availability({ quote_id: q.quote_id, from: TODAY, to: '2026-12-06' })).slots;
  open = OPENINGS.slice(1);
  await assert.rejects(service.hold({ slot_token: first.slot_token, placed_by: { kind: 'system', id: 't' } }), /just taken in MaidCentral/);
});

test('holds: a made-up slot token is refused', async () => {
  const { service } = setup();
  await assert.rejects(service.hold({ slot_token: 'eyJxIjoiIn0.abc', placed_by: { kind: 'system', id: 't' } }), { code: 'invalid_request' });
});

test('bookings: not written here yet (501 not_supported), the rep books in MaidCentral', async () => {
  const { app } = setup();
  const s = await listen(app);
  try {
    const res = await fetch(`${s.url}/api/placement/v1/bookings`, {
      method: 'POST',
      headers: { authorization: `Bearer ${HUB.token}`, 'content-type': 'application/json', 'idempotency-key': 'hub-1-h_123456' },
      body: JSON.stringify({ hold_id: 'h_1', customer: { first_name: 'Test', last_name: 'Customer', phone: '5095550100' }, placed_by: { kind: 'system', id: 't' } }),
    });
    const body = await res.json();
    assert.deepEqual([res.status, body.error.code], [501, 'not_supported']);
    assert.match(body.error.message, /book the held time there/);
  } finally {
    await s.close();
  }
});

test('MaidCentral unreachable or the Hub user signed out: platform_unavailable, retryable', async () => {
  const { service } = setup({ signedIn: false });
  const q = await service.quote(QUOTE, 'sales-hub');
  await assert.rejects(service.availability({ quote_id: q.quote_id, from: TODAY, to: '2026-12-06' }), (e) => e.status === 503 && e.code === 'platform_unavailable' && e.retryable);
});

test('zoned: Pacific offsets on both sides of the clock change', () => {
  assert.equal(zoned('2026-07-01', 540, 'America/Los_Angeles'), '2026-07-01T09:00:00-07:00');
  assert.equal(zoned('2026-12-01', 810, 'America/Los_Angeles'), '2026-12-01T13:30:00-08:00');
  assert.equal(zoned('2026-11-01', 600, 'America/Los_Angeles'), '2026-11-01T10:00:00-08:00');
});
