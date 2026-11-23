// Service tokens for the placement API (docs/placement.md).
//
// PLACEMENT_TOKENS lists who may call /api/placement/v1, comma-separated:
//   name:sha256:<64 hex>   the SHA-256 fingerprint of the caller's token (preferred: this app
//                          never holds the token itself, and the entry isn't a secret)
//   name:<token>           the token itself, at least 32 characters
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(String(s)).digest();

/** Parses PLACEMENT_TOKENS into [{ name, digest }] plus the names of entries that are wrong. */
export function parseTokens(raw) {
  const tokens = [];
  const bad = [];
  for (const entry of String(raw || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = entry.indexOf(':');
    const name = i > 0 ? entry.slice(0, i).trim() : '';
    const rest = i > 0 ? entry.slice(i + 1).trim() : '';
    const fp = /^sha256:([a-f0-9]{64})$/i.exec(rest);
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) bad.push(name || '(unnamed)');
    else if (fp) tokens.push({ name, digest: Buffer.from(fp[1].toLowerCase(), 'hex') });
    else if (rest.length >= 32) tokens.push({ name, digest: sha256(rest) });
    else bad.push(name);
  }
  return { tokens, bad };
}

/** The caller's name for an Authorization header, or null. Compares digests in constant time. */
export function callerFor(tokens, header) {
  const given = /^Bearer\s+(\S+)$/i.exec(String(header || ''))?.[1];
  if (!given) return null;
  const g = sha256(given);
  let found = null;
  for (const t of tokens) if (timingSafeEqual(g, t.digest) && !found) found = t.name;
  return found;
}

/** A new token for a caller and the entry that goes in PLACEMENT_TOKENS. */
export function newToken(name) {
  const token = randomBytes(32).toString('base64url');
  return { token, entry: `${name}:sha256:${sha256(token).toString('hex')}` };
}
