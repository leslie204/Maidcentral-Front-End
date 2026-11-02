// Reads the portal's JavaScript saved by the crawler (capture/output/js/) and lists
// route-like strings: SPA route definitions (Angular/AngularJS/React/Vue), MVC-style
// /Controller/Action URLs, and API paths. Review the "pages" list and copy the useful
// ones into capture/seeds.txt; API paths are for reference (the crawler records the
// real calls).
//
//   npm run bundle-routes            # prints the lists, writes output/bundle-routes.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSkippedLink } from './safety.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const PATTERNS = {
  // Angular / React Router / Vue Router: path: 'clients/:id'
  spaRoute: /\bpath\s*:\s*["'`]([A-Za-z0-9_:\-/.*]*)["'`]/g,
  // AngularJS: .when('/clients', …) and ui-router url: '/clients'
  angularJs: /\.when\(\s*["'](\/[^"']*)["']|\burl\s*:\s*["'](\/[^"'{}]*)["']/g,
  // MVC-style /Controller/Action[/…]
  mvc: /["'`](\/[A-Z][A-Za-z0-9]+\/[A-Z][A-Za-z0-9]+(?:\/[^"'`\s?]*)?)(?:\?[^"'`]*)?["'`]/g,
  // API paths
  api: /["'`]((?:https?:\/\/[^"'`/]+)?\/api\/[^"'`\s]+?)["'`]/g,
};

export function extractRoutes(source) {
  const pages = new Set();
  const api = new Set();
  for (const [kind, re] of Object.entries(PATTERNS)) {
    for (const m of source.matchAll(re)) {
      const value = (m[1] ?? m[2] ?? '').trim();
      if (!value || value.length > 120 || /\s/.test(value)) continue;
      // '/api/clients/' + id and `/api/clients/${id}` both mean /api/clients/:id.
      if (kind === 'api') api.add(value.replace(/^https?:\/\/[^/]+/, '').replace(/\$\{[^}]*\}/g, ':id').replace(/\/$/, '/:id'));
      else if (kind === 'spaRoute') {
        if (value === '' || value === '**' || /\.(js|css|html|png|svg)$/.test(value)) continue;
        pages.add(value.startsWith('/') ? value : `/${value}`);
      } else pages.add(value);
    }
  }
  return { pages: [...pages].sort(), api: [...api].sort() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.join(HERE, 'output', 'js');
  if (!fs.existsSync(dir)) {
    console.error('No saved scripts. Run npm run capture first.');
    process.exit(1);
  }
  const pages = new Set();
  const api = new Set();
  for (const f of fs.readdirSync(dir)) {
    const r = extractRoutes(fs.readFileSync(path.join(dir, f), 'utf8'));
    r.pages.forEach((p) => pages.add(p));
    r.api.forEach((p) => api.add(p));
  }
  const unsafe = (p) => isSkippedLink(new URL(p.replace(/:\w+/g, '1'), 'https://x.invalid').href);
  const result = {
    pages: [...pages].filter((p) => !unsafe(p)).sort(),
    unsafePages: [...pages].filter(unsafe).sort(),
    api: [...api].sort(),
  };
  fs.writeFileSync(path.join(HERE, 'output', 'bundle-routes.json'), JSON.stringify(result, null, 2));
  console.log(`# ${result.pages.length} page routes (candidates for seeds.txt; :params need a real id)`);
  result.pages.forEach((p) => console.log(p));
  console.log(`\n# ${result.unsafePages.length} routes skipped as unsafe (delete/cancel/send/charge/payroll…)`);
  result.unsafePages.forEach((p) => console.log(`# ${p}`));
  console.log(`\n# ${result.api.length} API paths referenced in the bundle`);
  result.api.forEach((p) => console.log(`# ${p}`));
}
