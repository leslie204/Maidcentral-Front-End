// Builds the redacted API catalog (docs/API.md, docs/api-catalog.json) from:
//   capture/official-api.json              the official API, transcribed from its docs
//   capture/output/official-probe.jsonl    responses from npm run probe (official API)
//   capture/output/requests.jsonl, pages.json, session.json   from npm run capture (portal)
// Run on its own (npm run catalog) to rebuild without crawling again.
//
// Only shapes (types), templated paths and field NAMES go in. It refuses to write a
// catalog that fails the personal-data audit (privacy.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { endpointTemplate, templatePath, templateFieldName, templateSegment, redact } from './routes.js';
import { auditCatalog, auditText, SAFE_QUERY_VALUE } from './privacy.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_DEPTH = 8;

// Search boxes and personal fields: whatever was typed is never kept.
const FREE_TEXT_PARAM = /(search|query|^q$|term|keyword|name|email|phone|address|note|comment|text|street|city|zip|postal)/i;
const IDENTIFIER_KEY = /^[A-Za-z_$][A-Za-z0-9_$.\-[\]:]{0,63}$/;

// Headings like "Client: Jane Doe", "Clients / Jane Doe" or "Jobs (120)" -> the section name.
export function genericHeading(heading) {
  if (!heading) return null;
  const first = heading.split(/[:/|›»]| - | – /)[0];
  const cleaned = redact(first.replace(/\(.*?\)/g, '').replace(/#?\d[\d,.]*/g, '').replace(/\s+/g, ' ').trim());
  return cleaned && cleaned.length <= 60 ? cleaned : null;
}

// Object keys are kept only when they look like field names. Ids, dates and anything
// else (a dictionary keyed by client name or email) collapse to placeholders.
export function shapeKey(key) {
  const t = templateSegment(key);
  if (t !== key) return t;
  if (!IDENTIFIER_KEY.test(key) || /@/.test(key)) return '<key>';
  return key;
}

// Response "shape": the same structure with every value replaced by its type.
export function shapeOf(value, depth = 0) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return ['…'];
    const merged = value.slice(0, 50).reduce((acc, item) => mergeShapes(acc, shapeOf(item, depth + 1)), undefined);
    return merged === undefined ? [] : [merged];
  }
  if (typeof value === 'object') {
    if (depth >= MAX_DEPTH) return '{…}';
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = shapeKey(k);
      out[key] = mergeShapes(out[key], shapeOf(v, depth + 1));
    }
    return out;
  }
  return typeof value;
}

export function mergeShapes(a, b) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (!a.length) return b;
    if (!b.length) return a;
    return [mergeShapes(a[0], b[0])];
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = mergeShapes(a[k], v);
    return out;
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return a;
  const names = new Set([...describe(a).split('|'), ...describe(b).split('|')]);
  return [...names].sort().join('|');
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function describe(shape) {
  if (typeof shape === 'string') return shape;
  return Array.isArray(shape) ? 'array' : 'object';
}

// Request bodies: JSON, form posts (field names only) or multipart.
export function bodyShape(raw, contentType = '') {
  if (!raw) return undefined;
  if (contentType.includes('multipart')) return 'multipart';
  try {
    return shapeOf(JSON.parse(raw));
  } catch {
    const params = new URLSearchParams(raw);
    const out = {};
    for (const key of params.keys()) out[templateFieldName(shapeKey(key))] = 'string';
    return Object.keys(out).length ? out : 'text';
  }
}

// Forms in a page or HTML partial: method, templated action, field names and types.
export function formsShape(summary) {
  if (!summary) return [];
  return (summary.forms || []).map((f) => ({
    method: f.method,
    action: f.action ? actionTemplate(f.action) : '',
    fields: [...new Set((f.fields || []).map((x) => `${templateFieldName(shapeKey(x.name))}:${x.type}`))],
  }));
}

function actionTemplate(action) {
  try {
    const u = new URL(action, 'https://x.invalid');
    return u.host === 'x.invalid' ? templatePath(u.pathname) : endpointTemplate(u.href);
  } catch {
    return '';
  }
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}

function capabilityMatcher(rules) {
  const compiled = rules.map((r) => ({ id: r.id, re: new RegExp(r.match, 'i') }));
  return (text) => compiled.filter((r) => r.re.test(text)).map((r) => r.id);
}

const normalizePath = (p) => p.replace(/\{[^}]+\}/g, ':id');

function buildOfficial(official, probes, matchCapabilities) {
  const endpoints = (official.endpoints || []).map((e) => ({
    method: e.method.toUpperCase(),
    path: e.path,
    purpose: e.purpose || null,
    capabilities: e.capability ? [e.capability] : matchCapabilities(e.path),
    verified: Boolean(e.verified),
    statuses: [],
    responseShape: undefined,
  }));
  for (const p of probes) {
    const key = normalizePath(templatePath(p.path));
    let ep = endpoints.find((e) => e.method === p.method && normalizePath(templatePath(e.path)) === key);
    if (!ep) {
      ep = { method: p.method, path: templatePath(p.path), purpose: null, capabilities: matchCapabilities(p.path), verified: false, statuses: [], responseShape: undefined, undocumented: true };
      endpoints.push(ep);
    }
    if (p.status && !ep.statuses.includes(p.status)) ep.statuses.push(p.status);
    if (p.status >= 200 && p.status < 300) ep.verified = true;
    if (p.responseBody && typeof p.responseBody === 'object') ep.responseShape = mergeShapes(ep.responseShape, shapeOf(p.responseBody));
  }
  return {
    docs: official.docs,
    production: official.production,
    sandbox: official.sandbox,
    status: official.status,
    auth: official.auth,
    endpoints: endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
  };
}

function buildPortal(requests, visited, session, matchCapabilities) {
  const endpoints = new Map();
  for (const entry of requests) {
    const u = new URL(entry.url);
    const kind = entry.resourceType === 'document' ? 'page' : 'xhr';
    const key = `${entry.method} ${endpointTemplate(entry.url)} ${kind}`;
    const ep = endpoints.get(key) || {
      method: entry.method,
      endpoint: endpointTemplate(entry.url),
      kind,
      auth: new Set(),
      tokenHeaders: new Set(),
      statuses: new Set(),
      responseKinds: new Set(),
      pages: new Set(),
      query: {},
      requestShape: undefined,
      responseShape: undefined,
      forms: [],
      blocked: null,
      readPost: false,
      duringLogin: false,
      count: 0,
    };
    ep.count += 1;
    if (entry.phase === 'login') ep.duringLogin = true;
    else ep.pages.add(entry.page);
    if (entry.status) ep.statuses.add(entry.status);
    if (entry.auth) ep.auth.add(entry.auth);
    for (const h of entry.tokenHeaders || []) ep.tokenHeaders.add(h);
    if (entry.responseKind) ep.responseKinds.add(entry.responseKind);
    if (entry.blocked) ep.blocked = entry.blocked;
    if (entry.readPost) ep.readPost = true;
    for (const [name, value] of u.searchParams) {
      ep.query[name] ??= new Set();
      if (ep.query[name].size >= 5) continue;
      const t = templateSegment(value);
      ep.query[name].add(value === '' ? '' : t !== value ? t : !FREE_TEXT_PARAM.test(name) && SAFE_QUERY_VALUE.test(value) ? value : '<string>');
    }
    if (entry.phase !== 'login') {
      const req = bodyShape(entry.requestBody, entry.requestHeaders?.['content-type']);
      if (req !== undefined) ep.requestShape = mergeShapes(ep.requestShape, req);
      if (entry.responseKind === 'json' && entry.responseBody != null) ep.responseShape = mergeShapes(ep.responseShape, shapeOf(entry.responseBody));
      if (entry.responseKind === 'html') ep.responseShape = mergeShapes(ep.responseShape, 'html');
      if (entry.htmlSummary) ep.forms = mergeForms(ep.forms, formsShape(entry.htmlSummary));
    }
    endpoints.set(key, ep);
  }

  const list = [...endpoints.values()]
    .map((ep) => ({
      ...ep,
      auth: [...ep.auth],
      tokenHeaders: [...ep.tokenHeaders].sort(),
      statuses: [...ep.statuses].sort(),
      responseKinds: [...ep.responseKinds].sort(),
      pages: [...ep.pages].sort(),
      query: Object.fromEntries(Object.entries(ep.query).map(([k, v]) => [k, [...v]])),
      capabilities: matchCapabilities(ep.endpoint),
      write: !ep.readPost && !['GET', 'HEAD', 'OPTIONS'].includes(ep.method),
    }))
    .sort((a, b) => a.endpoint.localeCompare(b.endpoint) || a.method.localeCompare(b.method));

  const byPage = {};
  for (const ep of list) {
    if (ep.kind === 'page' && ep.method === 'GET') continue;
    for (const p of ep.pages) (byPage[p] ??= []).push(`${ep.method} ${ep.endpoint}${ep.blocked ? ` (blocked: ${ep.blocked})` : ''}`);
  }

  // One entry per page template. A heading is kept only if it is the same on every visit
  // and, for record pages (/Client/:id), seen on at least two records: otherwise it is
  // probably the client's or employee's name.
  const grouped = new Map();
  for (const p of visited) {
    const g = grouped.get(p.template) || { template: p.template, headings: [], visits: 0, statuses: new Set(), forms: [], signals: {} };
    g.visits += 1;
    g.headings.push(genericHeading(p.heading));
    if (p.status) g.statuses.add(p.status);
    if (p.summary) {
      g.forms = mergeForms(g.forms, formsShape(p.summary));
      g.signals = mergeSignals(g.signals, p.summary);
    }
    grouped.set(p.template, g);
  }
  const pages = [...grouped.values()].map((g) => {
    const isRecord = /:(id|token)|=\*/.test(g.template);
    const same = g.headings.every((h) => h === g.headings[0]);
    const heading = same && (!isRecord || g.visits >= 2) ? g.headings[0] : null;
    const requests = byPage[g.template] || [];
    return {
      template: g.template,
      heading,
      statuses: [...g.statuses].sort(),
      rendering: guessRendering(g.signals, requests),
      signals: g.signals,
      forms: g.forms,
      requests,
    };
  });

  const loginEndpoints = list.filter((e) => e.duringLogin).map((e) => `${e.method} ${e.endpoint}`);
  return {
    session: {
      cookies: session?.cookies || [],
      storageKeys: session?.storage || { localStorage: [], sessionStorage: [] },
      authSchemes: [...new Set(list.flatMap((e) => e.auth))],
      tokenHeaders: [...new Set(list.flatMap((e) => e.tokenHeaders))].sort(),
      loginRequests: loginEndpoints,
    },
    pages,
    endpoints: list,
  };
}

function mergeForms(a, b) {
  const out = [...a];
  for (const f of b) {
    const same = out.find((x) => x.method === f.method && x.action === f.action);
    if (same) same.fields = [...new Set([...same.fields, ...f.fields])];
    else out.push({ ...f });
  }
  return out;
}

function mergeSignals(acc, summary) {
  const out = { ...acc };
  out.antiForgeryField = Boolean(out.antiForgeryField || summary.antiForgeryField);
  out.webFormsViewState = Boolean(out.webFormsViewState || summary.webFormsViewState);
  out.metaTokens = [...new Set([...(out.metaTokens || []), ...(summary.metaTokens || [])])];
  out.tables = Math.max(out.tables || 0, (summary.tables || []).length);
  out.tableColumns = Math.max(out.tableColumns || 0, ...(summary.tables || []).map((t) => t.columns || 0), 0);
  out.framework = { ...(out.framework || {}) };
  for (const [k, v] of Object.entries(summary.framework || {})) if (v) out.framework[k] = typeof v === 'string' ? v.slice(0, 20) : true;
  return out;
}

function guessRendering(signals, requests) {
  const xhr = requests.length;
  const fw = signals.framework || {};
  if (fw.angular || fw.react || fw.vue || fw.angularJs) return xhr ? 'spa (JSON calls)' : 'spa';
  if (signals.webFormsViewState) return 'server-rendered (Web Forms postbacks)';
  if (xhr) return 'server-rendered + XHR';
  return 'server-rendered';
}

function buildCoverage(rules, official, portal) {
  return rules.map((r) => {
    const off = official.endpoints.filter((e) => e.capabilities.includes(r.id));
    const por = portal.endpoints.filter((e) => e.capabilities.includes(r.id));
    const status = off.length && por.length ? 'both' : off.length ? 'official API' : por.length ? 'portal only' : 'not seen';
    return {
      capability: r.id,
      label: r.label,
      status,
      official: { read: off.filter((e) => e.method === 'GET').length, write: off.filter((e) => e.method !== 'GET').length },
      portal: { read: por.filter((e) => !e.write).length, write: por.filter((e) => e.write).length },
    };
  });
}

export function buildCatalog({ output = path.join(HERE, 'output'), docs = path.join(HERE, '..', 'docs') } = {}) {
  const rules = readJson(path.join(HERE, 'capabilities.json'), { capabilities: [] }).capabilities;
  const matchCapabilities = capabilityMatcher(rules);
  const official = buildOfficial(readJson(path.join(HERE, 'official-api.json'), { endpoints: [] }), readJsonl(path.join(output, 'official-probe.jsonl')), matchCapabilities);
  const portal = buildPortal(readJsonl(path.join(output, 'requests.jsonl')), readJson(path.join(output, 'pages.json'), []), readJson(path.join(output, 'session.json'), null), matchCapabilities);
  const coverage = buildCoverage(rules, official, portal);
  const catalog = { generatedAt: new Date().toISOString(), coverage, official, portal };

  // JSON round-trip drops undefined shapes before the audit and the write.
  const json = JSON.stringify(catalog, null, 2) + '\n';
  const markdown = toMarkdown(JSON.parse(json));
  const problems = [...auditCatalog(JSON.parse(json)), ...auditText(markdown, 'API.md')];
  if (problems.length) {
    throw new Error(`Catalog not written: it may contain personal data or secrets.\n  ${problems.slice(0, 40).join('\n  ')}\nFix the redaction in capture/catalog.js or routes.js and run npm run catalog again.`);
  }
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'api-catalog.json'), json);
  fs.writeFileSync(path.join(docs, 'API.md'), markdown);
  return { endpointCount: portal.endpoints.length, officialCount: official.endpoints.length, pageCount: portal.pages.length, coverage };
}

function details(summary, value) {
  return ['', `<details><summary>${summary}</summary>`, '', '```json', JSON.stringify(value, null, 2), '```', '</details>'];
}

function toMarkdown({ generatedAt, coverage, official, portal }) {
  const out = ['# MaidCentral API catalog', '', `Generated ${generatedAt} by \`npm run catalog\`. Do not edit by hand.`, ''];
  out.push(
    'Shapes only: every value is replaced by its type, ids by `:id`, the company subdomain by `{tenant}`.',
    'No names, emails, phones, addresses, notes, pay rates or search text.',
    '',
  );

  out.push('## Coverage', '', '| Capability | Where | Official API (read / write) | Portal (read / write) |', '| --- | --- | --- | --- |');
  for (const c of coverage) out.push(`| ${c.label} | **${c.status}** | ${c.official.read} / ${c.official.write} | ${c.portal.read} / ${c.portal.write} |`);
  out.push('');

  out.push('## 1. Official API', '', `Docs: ${official.docs}  `, `Production: \`${official.production}\` · Sandbox: \`${official.sandbox}\`  `, `Auth: ${official.auth}`, '');
  if (official.status) out.push(`> ${official.status}`, '');
  out.push('| Method | Path | Purpose | Verified |', '| --- | --- | --- | --- |');
  for (const e of official.endpoints) out.push(`| ${e.method} | \`${e.path}\` | ${e.purpose ?? (e.undocumented ? '(undocumented)' : '')} | ${e.verified ? `yes (${e.statuses.join(', ')})` : 'no'} |`);
  out.push('');
  for (const e of official.endpoints.filter((x) => x.responseShape)) out.push(`### \`${e.method} ${e.path}\``, ...details('Response shape', e.responseShape), '');

  out.push('## 2. Admin portal', '');
  if (!portal.endpoints.length) {
    out.push('Not captured yet. Run `npm run capture`.', '');
    return out.join('\n');
  }
  const s = portal.session;
  out.push('### How the portal talks to its backend', '');
  out.push(`- Auth on API calls: ${s.authSchemes.length ? s.authSchemes.map((a) => `\`${a}\``).join(', ') : 'cookies only (no Authorization header seen)'}`);
  out.push(`- Anti-forgery / CSRF headers: ${s.tokenHeaders.length ? s.tokenHeaders.map((h) => `\`${h}\``).join(', ') : 'none seen'}`);
  out.push(`- Cookies (names only): ${s.cookies.map((c) => `\`${c.name}\`${c.httpOnly ? ' httpOnly' : ''}${c.session ? ' session' : ''}`).join(', ') || 'none'}`);
  out.push(`- Browser storage keys: localStorage ${s.storageKeys.localStorage.map((k) => `\`${k}\``).join(', ') || '(none)'}; sessionStorage ${s.storageKeys.sessionStorage.map((k) => `\`${k}\``).join(', ') || '(none)'}`);
  out.push(`- Login requests: ${s.loginRequests.map((r) => `\`${r}\``).join(', ') || 'none'}`, '');

  out.push('### Pages', '');
  for (const p of portal.pages) {
    out.push(`#### \`${p.template}\`${p.heading ? ` — ${p.heading}` : ''}`, '');
    const fw = Object.entries(p.signals.framework || {}).map(([k, v]) => (v === true ? k : `${k} ${v}`));
    out.push(`- Rendering: ${p.rendering}${fw.length ? ` · ${fw.join(', ')}` : ''}${p.signals.antiForgeryField ? ' · anti-forgery field' : ''}${p.signals.tables ? ` · ${p.signals.tables} table(s)` : ''}`);
    out.push(...(p.requests.length ? p.requests.map((r) => `- \`${r}\``) : ['- (no XHR/fetch calls)']));
    for (const f of p.forms) out.push(`- Form \`${f.method.toUpperCase()} ${f.action || '(same page)'}\`: ${f.fields.map((x) => `\`${x}\``).join(', ') || '(no fields)'}`);
    out.push('');
  }

  out.push('### Endpoints', '');
  for (const ep of portal.endpoints) {
    const tag = ep.blocked ? ` (blocked during capture: ${ep.blocked})` : ep.duringLogin ? ' (login)' : ep.readPost ? ' (read via POST)' : '';
    out.push(`#### \`${ep.method} ${ep.endpoint}\` ${ep.kind === 'page' ? '[page]' : '[xhr]'}${tag}`, '');
    out.push(`- Status: ${ep.statuses.join(', ') || 'n/a'} · Auth: ${ep.auth.join(', ') || 'cookie'}${ep.tokenHeaders.length ? ` · Token headers: ${ep.tokenHeaders.join(', ')}` : ''} · Returns: ${ep.responseKinds.join(', ') || 'n/a'} · Seen ${ep.count}×`);
    if (ep.capabilities.length) out.push(`- Capabilities: ${ep.capabilities.join(', ')}`);
    if (ep.pages.length) out.push(`- Pages: ${ep.pages.map((p) => `\`${p}\``).join(', ')}`);
    const q = Object.entries(ep.query);
    if (q.length) out.push(`- Query: ${q.map(([k, v]) => `\`${k}\` (${v.join(', ')})`).join('; ')}`);
    for (const f of ep.forms) out.push(`- Returns form \`${f.method.toUpperCase()} ${f.action || '(same)'}\`: ${f.fields.map((x) => `\`${x}\``).join(', ')}`);
    if (ep.requestShape) out.push(...details('Request body', ep.requestShape));
    if (ep.responseShape && ep.responseShape !== 'html') out.push(...details('Response shape', ep.responseShape));
    out.push('');
  }
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { output: { type: 'string' }, docs: { type: 'string' } } });
  const r = buildCatalog({ output: values.output && path.resolve(values.output), docs: values.docs && path.resolve(values.docs) });
  console.log(`Catalog rebuilt: ${r.officialCount} official endpoints; portal: ${r.pageCount} pages, ${r.endpointCount} endpoints.`);
  for (const c of r.coverage) console.log(`  ${c.label.padEnd(26)} ${c.status}`);
}
