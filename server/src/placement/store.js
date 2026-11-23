// Quotes and holds for the placement API. MaidCentral can't reserve a time, so holds live
// here and this app's availability treats them as taken (contract: holds = "local").
// Quotes (they carry the address) are deleted 30 days after they were made; holds with them.

const SCHEMA = `
create table if not exists placement_quotes (
  id         text primary key,
  caller     text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists placement_quotes_created on placement_quotes (created_at);
create table if not exists placement_holds (
  id          text primary key,
  quote_id    text not null references placement_quotes(id) on delete cascade,
  opening_id  text not null,
  team_id     text not null,
  day         date not null,
  start_min   integer not null,
  end_min     integer not null,
  slot        jsonb not null,
  lead_ref    text,
  placed_by   jsonb not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  released_at timestamptz
);
create index if not exists placement_holds_open on placement_holds (expires_at) where released_at is null;`;

const KEEP_DAYS = 30;

const holdOut = (r) => ({
  id: r.id, quoteId: r.quote_id, openingId: r.opening_id, teamId: r.team_id, day: typeof r.day === 'string' ? r.day : r.day.toISOString().slice(0, 10),
  startMin: r.start_min, endMin: r.end_min, slot: r.slot, leadRef: r.lead_ref, placedBy: r.placed_by,
  createdAt: new Date(r.created_at).getTime(), expiresAt: new Date(r.expires_at).getTime(), releasedAt: r.released_at ? new Date(r.released_at).getTime() : null,
});

export class MemoryPlacementStore {
  constructor() {
    this.quotes = new Map();
    this.holds = new Map();
  }
  async init() {}
  async saveQuote({ id, caller, data, expiresAt }) {
    this.quotes.set(id, { id, caller, data, createdAt: Date.now(), expiresAt });
  }
  async getQuote(id) {
    return this.quotes.get(id) || null;
  }
  async saveHold(h) {
    this.holds.set(h.id, { ...h, createdAt: Date.now(), releasedAt: null });
  }
  async getHold(id) {
    return this.holds.get(id) || null;
  }
  async openHolds(now = Date.now()) {
    return [...this.holds.values()].filter((h) => !h.releasedAt && h.expiresAt > now);
  }
  async releaseHold(id) {
    const h = this.holds.get(id);
    if (h && !h.releasedAt) h.releasedAt = Date.now();
  }
  async cleanup() {
    const old = Date.now() - KEEP_DAYS * 86_400_000;
    for (const [id, q] of this.quotes) {
      if (q.createdAt < old) {
        this.quotes.delete(id);
        for (const [hid, h] of this.holds) if (h.quoteId === id) this.holds.delete(hid);
      }
    }
  }
}

export class PgPlacementStore {
  constructor(pool) {
    this.pool = pool;
  }
  async init() {
    await this.pool.query(SCHEMA);
  }
  async saveQuote({ id, caller, data, expiresAt }) {
    await this.pool.query('insert into placement_quotes (id, caller, data, expires_at) values ($1, $2, $3, $4)', [id, caller, JSON.stringify(data), new Date(expiresAt)]);
  }
  async getQuote(id) {
    const { rows } = await this.pool.query('select id, caller, data, created_at, expires_at from placement_quotes where id = $1', [id]);
    const r = rows[0];
    return r ? { id: r.id, caller: r.caller, data: r.data, createdAt: r.created_at.getTime(), expiresAt: r.expires_at.getTime() } : null;
  }
  async saveHold(h) {
    await this.pool.query(
      `insert into placement_holds (id, quote_id, opening_id, team_id, day, start_min, end_min, slot, lead_ref, placed_by, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [h.id, h.quoteId, h.openingId, h.teamId, h.day, h.startMin, h.endMin, JSON.stringify(h.slot), h.leadRef || null, JSON.stringify(h.placedBy), new Date(h.expiresAt)],
    );
  }
  async getHold(id) {
    const { rows } = await this.pool.query("select *, to_char(day, 'YYYY-MM-DD') as day from placement_holds where id = $1", [id]);
    return rows[0] ? holdOut(rows[0]) : null;
  }
  async openHolds(now = Date.now()) {
    const { rows } = await this.pool.query("select *, to_char(day, 'YYYY-MM-DD') as day from placement_holds where released_at is null and expires_at > $1", [new Date(now)]);
    return rows.map(holdOut);
  }
  async releaseHold(id) {
    await this.pool.query('update placement_holds set released_at = now() where id = $1 and released_at is null', [id]);
  }
  async cleanup() {
    await this.pool.query(`delete from placement_quotes where created_at < now() - interval '${KEEP_DAYS} days'`);
  }
}
