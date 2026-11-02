// Turns concrete URLs into templates, so /Client/Details/123 and /Client/Details/456
// count as one page and one endpoint, and nothing record-specific reaches the catalog.

const DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;
const ID = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,})$/i;
// Opaque tokens: long, mixed letters and digits (encoded ids, signed links).
const TOKEN = /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9_~-]{20,}={0,2}$/;

export function templateSegment(segment) {
  const value = safeDecode(segment);
  if (value === '') return value;
  if (DATE.test(value)) return ':date';
  if (ID.test(value)) return ':id';
  if (TOKEN.test(value)) return ':token';
  return segment;
}

export function templatePath(pathname) {
  return pathname.split('/').map(templateSegment).join('/');
}

// Query values kept in page templates: only for these keys, and only short words.
// Everything else becomes :id, :date or * so names and search text never get in.
const KEEP_VALUE_KEYS = /^(tab|view|mode|type|status|filter|section|show|period|range|kind)$/i;
const SHORT_WORD = /^[A-Za-z_]{1,24}$/;

export function templateQuery(searchParams) {
  const keys = [...new Set([...searchParams.keys()])].sort();
  return keys
    .map((key) => {
      const value = searchParams.get(key) ?? '';
      if (value === '') return key;
      const t = templateSegment(value);
      if (t !== value) return `${key}=${t}`;
      if (KEEP_VALUE_KEYS.test(key) && SHORT_WORD.test(value)) return `${key}=${value}`;
      return `${key}=*`;
    })
    .join('&');
}

// Page identity: path, query (templated) and hash route (#/clients/12 for SPAs).
export function pageTemplate(url) {
  const u = new URL(url);
  const hash = u.hash.replace(/^#!?/, '');
  const [hashPath, hashQuery = ''] = hash.split('?');
  const query = templateQuery(u.searchParams);
  const hashQ = hashQuery ? templateQuery(new URLSearchParams(hashQuery)) : '';
  return (
    templatePath(u.pathname) +
    (query ? `?${query}` : '') +
    (hashPath ? `#${templatePath(hashPath)}` : '') +
    (hashQ ? `?${hashQ}` : '')
  );
}

// The company's own subdomain (e.g. acme.maidcentral.com) becomes {tenant}, so the
// public catalog doesn't name the portal's address.
const SHARED_HOSTS = new Set(['api', 'www', 'support', 'app', 'login', 'auth', 'cdn', 'static', 'admin']);

export function templateHost(host) {
  const m = /^([^.]+)\.(maidcentral\.(?:com|net))$/i.exec(host);
  if (!m || SHARED_HOSTS.has(m[1].toLowerCase())) return host;
  return `{tenant}.${m[2]}`;
}

export function endpointTemplate(url) {
  const u = new URL(url);
  return `${templateHost(u.host)}${templatePath(u.pathname)}`;
}

// Form field names like "Jobs[12].Status" -> "Jobs[:id].Status".
export function templateFieldName(name) {
  return String(name).replace(/\d+/g, ':id');
}

const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[A-Za-z]{2,}/g;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;

export function redact(value) {
  return String(value).replace(EMAIL, '<email>').replace(PHONE, '<phone>');
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
