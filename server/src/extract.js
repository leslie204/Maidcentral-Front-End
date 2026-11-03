// Turns MaidCentral's server-rendered HTML snippets (tabs on customer and employee pages)
// into plain data: tables, label/value pairs and badges. Only text leaves this module, so
// the web app never renders MaidCentral's HTML.
import { parse } from 'node-html-parser';

const clean = (s) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
export const textOf = (el) => (el ? clean(el.text) : '');

// Columns that only hold buttons (edit, delete, send…) are dropped.
const ACTION_HEADER = /^(|actions?|edit|delete|remove|send|resend.*|link|select|view|options?)$/i;
const ACTION_CELL = /^(|edit|delete|remove|send|resend.*|view|view email|set preferred|preferred|details?|select|open|x|×)$/i;

export function root(html) {
  return parse(String(html || ''), { blockTextElements: { script: false, style: false, noscript: false } });
}

// Every table: { headers, rows: [{ cells, links }] }. links: hrefs into MaidCentral pages
// (ids for our own links), without action URLs.
export function tables(html, { scope } = {}) {
  const r = typeof html === 'string' ? root(html) : html;
  const base = scope ? r.querySelector(scope) : r;
  if (!base) return [];
  return base.querySelectorAll('table').map((table) => {
    let headers = table.querySelectorAll('thead th, thead td').map(textOf);
    // Nested tables are handled on their own.
    if (table.parentNode?.closest?.('table')) return null;
    const bodyRows = table.querySelectorAll('tbody tr');
    // Without <tbody>: every row that isn't a header row (inside <thead> or all <th>).
    const trs = bodyRows.length
      ? bodyRows
      : table.querySelectorAll('tr').filter((tr) => !tr.closest('thead') && tr.childNodes.some((c) => c.tagName === 'TD')).slice(table.querySelector('th') ? 0 : 1); // a header row made of <td> is skipped
    if (!headers.length) headers = (table.querySelector('tr')?.childNodes || []).filter((c) => c.tagName === 'TH' || c.tagName === 'TD').map(textOf);
    const rows = trs
      .map((tr) => {
        const tds = tr.childNodes.filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
        return {
          cells: tds.map(textOf),
          links: tr.querySelectorAll('a').map((a) => a.getAttribute('href') || '').filter((h) => h.startsWith('/') && !/delete|remove|createorupdate|setpreferred|send|cancel/i.test(h)),
        };
      })
      .filter((r) => r.cells.some(Boolean) && !(r.cells.length === 1 && /no (data|records|results)|nothing|empty/i.test(r.cells[0])));
    // Keep a column unless its header looks like an action and every cell is a button label or empty.
    const width = Math.max(headers.length, ...rows.map((r) => r.cells.length));
    const keep = [];
    for (let i = 0; i < width; i++) {
      const h = headers[i] || '';
      const values = rows.map((r) => r.cells[i] || '');
      const actionOnly = ACTION_HEADER.test(h) && values.every((v) => ACTION_CELL.test(v));
      const empty = !h && values.every((v) => !v);
      if (!actionOnly && !empty) keep.push(i);
    }
    return {
      headers: keep.map((i) => headers[i] || ''),
      rows: rows.map((r) => ({ cells: keep.map((i) => r.cells[i] || ''), links: r.links })),
    };
  }).filter(Boolean);
}

function nextEl(el) {
  const sibs = el.parentNode?.childNodes || [];
  for (let i = sibs.indexOf(el) + 1; i < sibs.length; i++) if (sibs[i].tagName) return sibs[i];
  return null;
}

// Headings followed by lists: [{ title, items }] (e.g. notification settings).
export function lists(html) {
  const r = typeof html === 'string' ? root(html) : html;
  const out = [];
  for (const h of r.querySelectorAll('h3, h4, h5')) {
    const list = nextEl(h);
    if (list && (list.tagName === 'UL' || list.tagName === 'OL')) out.push({ title: textOf(h), items: list.querySelectorAll('li').map(textOf).filter(Boolean) });
  }
  return out;
}

// The first table, or an empty one.
export function table(html, opts) {
  return tables(html, opts)[0] || { headers: [], rows: [] };
}

// Label/value pairs in MaidCentral's common layouts.
export function pairs(html, { scope } = {}) {
  const r = typeof html === 'string' ? root(html) : html;
  const base = scope ? r.querySelector(scope) : r;
  if (!base) return [];
  const out = [];
  for (const label of base.querySelectorAll('.sale-info')) {
    const value = nextEl(label);
    if (!value) continue;
    // "6" with a ".sale-percent" of "5%" reads better as "6 (5%)".
    const pct = value.querySelector('.sale-percent');
    const pctText = textOf(pct);
    const main = pctText ? clean(textOf(value).replace(pctText, '')) : textOf(value);
    out.push({ label: textOf(label), value: pctText && main ? `${main} (${pctText})` : main || pctText });
  }
  for (const dt of base.querySelectorAll('dt')) {
    const dd = nextEl(dt);
    if (dd?.tagName === 'DD') out.push({ label: textOf(dt), value: textOf(dd) });
  }
  for (const label of base.querySelectorAll('.control-label, label')) {
    const value = label.parentNode?.querySelector('.form-control-static, p.form-control-static');
    if (value && !out.some((p) => p.label === textOf(label))) out.push({ label: textOf(label), value: textOf(value) });
  }
  return out.filter((p) => p.label && p.label.length < 60);
}

// Status badges (Bootstrap .label / .badge), de-duplicated.
export function badges(html, { scope } = {}) {
  const r = typeof html === 'string' ? root(html) : html;
  const base = scope ? r.querySelector(scope) : r;
  if (!base) return [];
  return [...new Set(base.querySelectorAll('.label, .badge').map(textOf).filter((t) => t && t.length < 50))];
}

// Some MaidCentral endpoints answer with an ABP JSON envelope instead of HTML.
export function abpMessage(text) {
  try {
    const j = JSON.parse(text);
    if (j && j.__abp) return j.success ? null : clean(j.error?.message) || 'Not available';
  } catch {}
  return null;
}

export function ids(links, re) {
  for (const l of links) {
    const m = re.exec(l);
    if (m) return m.slice(1);
  }
  return null;
}

// Values of a form (MaidCentral shows profiles as edit forms), for allowed labels only.
// Text inputs and textareas give their value, selects their chosen option, and checkbox
// groups the labels of the ticked boxes.
export function formValues(html, allow) {
  const r = typeof html === 'string' ? root(html) : html;
  const out = {};
  const FIELD = 'input:not([type=hidden]), select, textarea';
  for (const label of r.querySelectorAll('label')) {
    const name = textOf(label).replace(/\s*\*$/, '');
    if (!allow.test(name) || name in out) continue;
    // <label for=…>, an input inside the label (checkboxes), or the field in the same .form-group.
    const forId = label.getAttribute('for');
    const el = (forId && r.querySelector(`#${CSS_ESCAPE(forId)}`)) || label.querySelector(FIELD) || label.closest('.form-group')?.querySelector(FIELD);
    if (!el) continue;
    const tag = el.tagName;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      if (el.hasAttribute('checked')) out[name] = 'Yes';
      continue;
    }
    if (type === 'hidden' || type === 'password') continue;
    let value = '';
    if (tag === 'SELECT') value = textOf(el.querySelectorAll('option').find((o) => o.hasAttribute('selected')));
    else if (tag === 'TEXTAREA') value = textOf(el);
    else value = clean(el.getAttribute('value'));
    if (value) out[name] = value;
  }
  return out;
}

const CSS_ESCAPE = (s) => String(s).replace(/([^\w-])/g, '\\$1');
