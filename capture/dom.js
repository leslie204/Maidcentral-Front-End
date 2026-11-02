// Functions that run INSIDE the browser page (passed to page.evaluate), so each one
// must be self-contained: no imports, no outside variables.

// What a page (or an HTML partial returned by an XHR) carries: forms and their field
// names, anti-forgery tokens, tables, and signs of which front-end framework it uses.
// Field values and table cell text are never read.
export function summarizeDom(html) {
  const doc = html == null ? document : new DOMParser().parseFromString(html, 'text/html');
  const forms = [...doc.querySelectorAll('form')].slice(0, 25).map((f) => ({
    method: (f.getAttribute('method') || 'get').toLowerCase(),
    action: f.getAttribute('action') || '',
    fields: [...f.querySelectorAll('input[name], select[name], textarea[name], button[name]')]
      .slice(0, 100)
      .map((e) => ({ name: e.getAttribute('name'), type: String(e.type || e.tagName).toLowerCase() })),
  }));
  const tables = [...doc.querySelectorAll('table')].slice(0, 20).map((t) => ({
    columns: t.querySelectorAll('thead th, thead td').length || (t.querySelector('tr') ? t.querySelector('tr').children.length : 0),
    // Header labels go to the raw output only (a schedule grid's headers can be staff names).
    headers: [...t.querySelectorAll('thead th, thead td')].slice(0, 40).map((th) => th.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)),
  }));
  const metaTokens = [...doc.querySelectorAll('meta[name]')]
    .map((m) => m.getAttribute('name'))
    .filter((n) => /csrf|xsrf|forgery|verification/i.test(n));
  const w = html == null ? window : {};
  const anyReactRoot = html == null && [...document.querySelectorAll('body *')].slice(0, 200).some((el) => Object.keys(el).some((k) => k.startsWith('__react')));
  return {
    forms,
    tables,
    antiForgeryField: !!doc.querySelector('input[name="__RequestVerificationToken"]'),
    metaTokens,
    webFormsViewState: !!doc.querySelector('input[name="__VIEWSTATE"]'),
    jsonScripts: doc.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]').length,
    inlineScripts: doc.querySelectorAll('script:not([src])').length,
    framework: {
      angularJs: !!w.angular || !!doc.querySelector('[ng-app], [ng-controller], [ng-view], [ui-view]'),
      angular: !!doc.querySelector('[ng-version]'),
      react: !!w.React || !!doc.querySelector('[data-reactroot]') || anyReactRoot,
      vue: !!w.Vue || !!doc.querySelector('[data-v-app], [data-server-rendered]'),
      knockout: !!w.ko || !!doc.querySelector('[data-bind]'),
      jquery: (w.jQuery && w.jQuery.fn && w.jQuery.fn.jquery) || null,
      kendo: !!w.kendo || !!doc.querySelector('[data-role], .k-grid, .k-widget'),
      devExpress: !!w.DevExpress || !!w.ASPx || !!doc.querySelector('[class*="dx-"]'),
      blazor: !!w.Blazor,
      signalR: !!(w.signalR || (w.jQuery && w.jQuery.connection)),
    },
  };
}

// URLs hidden in attributes rather than <a href>: onclick="location.href='/Client/Details/5'",
// data-url, data-href, form actions with GET. Server-rendered grids often link rows this way.
export function hiddenLinks() {
  const out = new Set();
  const pull = (text) => {
    if (!text) return;
    for (const m of text.matchAll(/['"`]((?:https?:\/\/[^'"`\s]+)|(?:\/[A-Za-z#][^'"`\s]*))['"`]/g)) out.add(m[1]);
  };
  for (const el of document.querySelectorAll('[onclick], [data-url], [data-href], [data-link], [data-target-url]')) {
    pull(el.getAttribute('onclick'));
    for (const a of ['data-url', 'data-href', 'data-link', 'data-target-url']) {
      const v = el.getAttribute(a);
      if (v) out.add(v);
    }
  }
  for (const f of document.querySelectorAll('form')) {
    if ((f.getAttribute('method') || 'get').toLowerCase() === 'get' && f.getAttribute('action')) out.add(f.getAttribute('action'));
  }
  return [...out].map((h) => {
    try {
      return new URL(h, location.href).href;
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// Things worth clicking to make a page load more data: tabs, "New/Add/Edit/View"
// buttons, modal openers, dropdown menus. Each gets a data-capture-idx so the crawler
// can click it with a locator. Returns a description per candidate (text + attributes)
// that the crawler checks against its don't-click list.
export function clickCandidates(max) {
  const selectors = [
    '[role="tab"]', '.nav-tabs a', '.nav-pills a', '[data-toggle="tab"]', '[data-bs-toggle="tab"]', '.k-tabstrip-items .k-item',
    '[data-toggle="modal"]', '[data-bs-toggle="modal"]', '[data-toggle="dropdown"]', '[data-bs-toggle="dropdown"]',
    'button', 'a[href="#"]', 'a[href^="javascript"]', 'a:not([href])', '[role="button"]',
  ];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const describe = (el) => {
    const attrs = ['id', 'name', 'class', 'title', 'aria-label', 'href', 'onclick', 'formaction', 'value', 'data-action', 'data-url', 'data-target', 'data-bs-target']
      .map((a) => el.getAttribute(a) || '')
      .concat(Object.keys(el.dataset).map((k) => `${k} ${el.dataset[k]}`));
    return `${el.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)} | ${attrs.join(' ')}`.slice(0, 600);
  };
  const isTab = (el) => el.matches('[role="tab"], .nav-tabs a, .nav-pills a, [data-toggle="tab"], [data-bs-toggle="tab"], .k-tabstrip-items .k-item');
  const opensSomething = /^(\+\s*)?(new|add|create|edit|view|details|open|show|more|schedule|filter|options|calendar|week|day|month|list|map|history|notes)\b/i;
  const seen = new Set();
  const found = [];
  for (const el of document.querySelectorAll(selectors.join(','))) {
    if (seen.has(el) || !visible(el)) continue;
    seen.add(el);
    if (el.closest('form') && (el.type === 'submit' || el.matches('input[type="submit"]'))) continue;
    if (el.tagName === 'BUTTON' && (el.getAttribute('type') || 'submit') === 'submit' && el.closest('form')) continue;
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    const score = isTab(el) ? 3 : el.matches('[data-toggle="modal"], [data-bs-toggle="modal"]') ? 2 : opensSomething.test(text) ? 2 : 0;
    if (!score) continue;
    found.push({ el, score, description: describe(el) });
  }
  found.sort((a, b) => b.score - a.score);
  return found.slice(0, max).map(({ el, description }, i) => {
    el.setAttribute('data-capture-idx', String(i));
    return { idx: i, description };
  });
}

// Names (not values) of what the page keeps in browser storage: tells us whether the
// portal holds a bearer token in localStorage rather than relying on cookies.
export function storageKeys() {
  const keys = (s) => {
    try {
      return Object.keys(s);
    } catch {
      return [];
    }
  };
  return { localStorage: keys(localStorage), sessionStorage: keys(sessionStorage) };
}
