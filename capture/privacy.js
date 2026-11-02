// Personal-data checks for anything that will be committed (docs/API.md,
// docs/api-catalog.json). The catalog generator refuses to write a catalog that fails,
// and test/unit/privacy.test.js fails if the committed one does.
//
// Findings name the place and the kind of data, never the value.

const PATTERNS = [
  ['email address', /[^\s@<>"'`(]+@[^\s@<>"'`)]+\.[A-Za-z]{2,}/],
  ['phone number', /(?<![\w.:-])(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w])/],
  ['phone number', /(?<![\w.:-])\+?1?\d{10}(?![\w.:-])/],
  ['postal code', /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/i],
  ['zip+4 code', /\b\d{5}-\d{4}\b/],
  ['street address', /\b\d{1,6}\s+(?:[A-Z][A-Za-z'.-]*\s+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Cres|Crescent|Crt|Ct|Court|Way|Lane|Ln|Pl|Place|Terr|Terrace|Pkwy|Parkway|Hwy|Highway|Cir|Circle|Sq|Square|Trail|Line|Sideroad)\b/],
  ['money amount', /\$\s?\d/],
  ['card number', /\b(?:\d[ -]?){13,19}\b/],
  ['SIN/SSN', /\b\d{3}[ -]\d{3}[ -]\d{3}\b|\b\d{3}-\d{2}-\d{4}\b/],
  ['token', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['token', /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i],
  // Long runs mixing letters and digits (no slashes, so API paths don't match).
  ['secret-looking string', /(?<![A-Za-z0-9+_-])(?=[A-Za-z0-9+_-]*\d)(?=[A-Za-z0-9+_-]*[A-Za-z])[A-Za-z0-9+_-]{40,}={0,2}(?![A-Za-z0-9+_-])/],
];

export function findPersonalData(text) {
  const found = [];
  for (const [kind, pattern] of PATTERNS) if (pattern.test(text)) found.push(kind);
  return [...new Set(found)];
}

// Values allowed as leaves of request/response shapes: type names only.
const TYPE_NAME = /^(string|number|boolean|null|object|array|html|text|multipart|binary|…|\{…\})(\|(string|number|boolean|null|object|array|html|text|multipart|binary))*$/;
// Example values allowed in query parameter lists.
export const SAFE_QUERY_VALUE = /^(\d{1,6}|true|false|asc|desc|\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?|[a-z_]{1,30}|:id|:date|:token|<string>|\*)$/;

// Walks the whole catalog. Returns a list of "path: problem" strings (no values).
export function auditCatalog(catalog) {
  const problems = [];
  const walk = (value, where, inShape) => {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return;
    if (typeof value === 'string') {
      if (inShape && !TYPE_NAME.test(value)) problems.push(`${where}: shape leaf is not a type name`);
      for (const kind of findPersonalData(value)) problems.push(`${where}: looks like a ${kind}`);
      return;
    }
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${where}[${i}]`, inShape));
    for (const [k, v] of Object.entries(value)) {
      for (const kind of findPersonalData(k)) problems.push(`${where}.<key>: looks like a ${kind}`);
      const shape = inShape || k === 'requestShape' || k === 'responseShape';
      if (k === 'query' && v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [name, examples] of Object.entries(v)) {
          for (const ex of examples) if (ex !== '' && !SAFE_QUERY_VALUE.test(ex)) problems.push(`${where}.query.${name}: example value not allowed`);
        }
      }
      walk(v, `${where}.${k}`, shape);
    }
  };
  walk(catalog, 'catalog', false);
  return problems;
}

export function auditText(text, label = 'text') {
  const problems = [];
  text.split('\n').forEach((line, i) => {
    for (const kind of findPersonalData(line)) problems.push(`${label}:${i + 1}: looks like a ${kind}`);
  });
  return problems;
}
