// Where sessions live. Postgres in production (survives restarts and redeploys), memory
// for local development and tests. Both store the same records:
//
//   session:     sidHash -> { email, state, expiresAt }   state = MaidCentral cookies etc.
//   remembered:  email   -> { cookie, expiresAt }         MaidCentral's 30-day 2FA cookie
//
// In Postgres, the session id is stored only as a SHA-256 hash (a leaked table can't be
// used to sign in) and every state/cookie is encrypted with AES-256-GCM using SESSION_KEY.
import crypto from 'node:crypto';

export const hashSid = (sid) => crypto.createHash('sha256').update(sid).digest('hex');

export class MemoryStore {
  constructor() {
    this.sessions = new Map();
    this.remembered = new Map();
  }
  async init() {}
  async getSession(sidHash) {
    const s = this.sessions.get(sidHash);
    return s && s.expiresAt > Date.now() ? structuredClone(s) : null;
  }
  async saveSession(sidHash, { email, state, expiresAt }) {
    this.sessions.set(sidHash, structuredClone({ email, state, expiresAt }));
  }
  async touchSession(sidHash, expiresAt) {
    const s = this.sessions.get(sidHash);
    if (s) s.expiresAt = expiresAt;
  }
  async deleteSession(sidHash) {
    this.sessions.delete(sidHash);
  }
  async getRemembered(email) {
    const r = this.remembered.get(email);
    return r && r.expiresAt > Date.now() ? r.cookie : null;
  }
  async saveRemembered(email, cookie, expiresAt) {
    this.remembered.set(email, { cookie, expiresAt });
  }
  async cleanup() {
    const now = Date.now();
    for (const [k, v] of this.sessions) if (v.expiresAt <= now) this.sessions.delete(k);
    for (const [k, v] of this.remembered) if (v.expiresAt <= now) this.remembered.delete(k);
  }
  async close() {}
}

const SCHEMA = `
create table if not exists app_sessions (
  sid_hash   text primary key,
  email      text not null,
  data       bytea not null,
  created_at timestamptz not null default now(),
  last_used  timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists app_sessions_expires_at on app_sessions (expires_at);
create index if not exists app_sessions_email on app_sessions (email);
create table if not exists remembered_browsers (
  email      text primary key,
  data       bytea not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);`;

export class PgStore {
  // pool: a pg.Pool (or anything with query()); key: 32-byte Buffer.
  constructor(pool, key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('SESSION_KEY must be 32 bytes (64 hex characters or base64).');
    this.pool = pool;
    this.key = key;
  }
  async init() {
    await this.pool.query(SCHEMA);
  }
  async getSession(sidHash) {
    const { rows } = await this.pool.query('select email, data, expires_at from app_sessions where sid_hash = $1 and expires_at > now()', [sidHash]);
    if (!rows[0]) return null;
    try {
      return { email: rows[0].email, state: decrypt(this.key, rows[0].data, `session:${sidHash}`), expiresAt: rows[0].expires_at.getTime() };
    } catch {
      return null; // wrong key (rotated) or tampered row: treat as signed out
    }
  }
  async saveSession(sidHash, { email, state, expiresAt }) {
    await this.pool.query(
      `insert into app_sessions (sid_hash, email, data, expires_at) values ($1, $2, $3, $4)
       on conflict (sid_hash) do update set email = excluded.email, data = excluded.data, last_used = now(), expires_at = excluded.expires_at`,
      [sidHash, email, encrypt(this.key, state, `session:${sidHash}`), new Date(expiresAt)],
    );
  }
  async touchSession(sidHash, expiresAt) {
    await this.pool.query('update app_sessions set last_used = now(), expires_at = $2 where sid_hash = $1', [sidHash, new Date(expiresAt)]);
  }
  async deleteSession(sidHash) {
    await this.pool.query('delete from app_sessions where sid_hash = $1', [sidHash]);
  }
  async getRemembered(email) {
    const { rows } = await this.pool.query('select data from remembered_browsers where email = $1 and expires_at > now()', [email]);
    if (!rows[0]) return null;
    try {
      return decrypt(this.key, rows[0].data, `remembered:${email}`);
    } catch {
      return null;
    }
  }
  async saveRemembered(email, cookie, expiresAt) {
    await this.pool.query(
      `insert into remembered_browsers (email, data, expires_at) values ($1, $2, $3)
       on conflict (email) do update set data = excluded.data, updated_at = now(), expires_at = excluded.expires_at`,
      [email, encrypt(this.key, cookie, `remembered:${email}`), new Date(expiresAt)],
    );
  }
  async cleanup() {
    await this.pool.query('delete from app_sessions where expires_at <= now()');
    await this.pool.query('delete from remembered_browsers where expires_at <= now()');
  }
  async close() {
    await this.pool.end?.();
  }
}

// AES-256-GCM. The row's identity (session hash or email) is bound in as associated data,
// so an encrypted blob copied onto another row won't decrypt.
// Layout: version(1) | iv(12) | tag(16) | ciphertext.
export function encrypt(key, value, aad) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), body]);
}

export function decrypt(key, blob, aad) {
  if (blob[0] !== 1) throw new Error('Unknown format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, blob.subarray(1, 13));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(blob.subarray(13, 29));
  return JSON.parse(Buffer.concat([decipher.update(blob.subarray(29)), decipher.final()]).toString('utf8'));
}

// SESSION_KEY as 64 hex characters or base64 of 32 bytes.
export function parseKey(text) {
  const s = String(text || '').trim();
  const buf = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, 'hex') : Buffer.from(s, 'base64');
  if (buf.length !== 32) throw new Error('SESSION_KEY must be 32 bytes: 64 hex characters or base64.');
  return buf;
}
