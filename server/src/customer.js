// The full customer page: every tab of MaidCentral's customer page, as data. Sections load
// in parallel; one that fails comes back as { error } without breaking the others.
import { root, textOf, tables, table, pairs, badges, lists, ids } from './extract.js';
import { McError } from './mc.js';

export async function customerProfile(mc, id) {
  if (!/^\d{1,10}$/.test(String(id))) throw new McError('input', 'Bad customer id');
  const get = (path, query) => mc.getHtml(path, query);
  const sections = {
    page: get(`/Customer/Details/${id}`, { cid: id }),
    stats: get(`/Customer/Stats/${id}`),
    contacts: get(`/Customer/GetCustomerContacts/${id}`),
    homes: get('/HomeInformation/Homes', { id, cid: id }),
    billing: get(`/CustomerBilling/CustomerBillings/${id}`),
    quotes: get(`/Quote/CustomerQuotes/${id}`),
    scorecards: get('/Customer/ScorecardPartial', { id }),
    preferences: get('/Customer/CustomerPreferences', { id }),
    notes: get(`/Customer/CustomerNotes/${id}`),
    agreements: get(`/Customer/GetCustomerAgreements/${id}`),
    attachments: get(`/Customer/Attachments/${id}`),
    notifications: get(`/Notification/ContactInfoNotification/${id}`, { onlyReturnContactList: 'true' }),
  };
  const keys = Object.keys(sections);
  const settled = await Promise.allSettled(Object.values(sections));
  // A finished session is not a per-section problem: report it once.
  const expired = settled.find((s) => s.status === 'rejected' && s.reason?.code === 'expired');
  if (expired) throw expired.reason;
  const html = Object.fromEntries(keys.map((k, i) => [k, settled[i].status === 'fulfilled' ? settled[i].value : null]));
  const err = Object.fromEntries(keys.map((k, i) => [k, settled[i].status === 'rejected' ? settled[i].reason?.message || 'Not available' : null]));
  const section = (k, fn) => (html[k] == null ? { error: err[k] } : safe(() => fn(html[k])));

  const page = html.page ? root(html.page) : null;
  if (page && !page.querySelector('#overview-placeholder')) throw new McError('notfound', 'Customer not found');
  // The page itself has no name heading: use the billing contact's name.
  const bill = html.billing ? table(html.billing) : null;
  const col = (h) => bill?.headers.indexOf(h) ?? -1;
  const first = bill?.rows[0];
  const name = first ? [first.cells[col('First name')], first.cells[col('Last name')]].filter(Boolean).join(' ') || null : null;

  return {
    id: String(id),
    name,
    mcUrl: `/Customer/Details/${id}?cid=${id}`,
    overview: page
      ? {
          badges: badges(page, { scope: '#overview-placeholder' }),
          panels: page.querySelectorAll('#overview-placeholder .portlet').map((p) => ({
            title: textOf(p.querySelector('.caption')),
            pairs: pairs(p),
          })).filter((p) => p.pairs.length),
        }
      : { error: err.page },
    stats: section('stats', (h) => pairs(h)),
    contacts: section('contacts', (h) => table(h)),
    homes: section('homes', (h) => {
      const t = table(h);
      return {
        ...t,
        rows: t.rows.map((r) => {
          const m = ids(r.links, /\/HomeInformation\/Details\/(\d+)\?cid=(\d+)(?:&hsid=(\d+))?/i);
          return { ...r, home: m ? { id: m[0], hsid: m[2] || null } : null };
        }),
      };
    }),
    billing: section('billing', (h) => table(h)),
    quotes: section('quotes', (h) => table(h)),
    scorecards: section('scorecards', (h) => table(h)),
    preferences: section('preferences', (h) => table(h)),
    notes: section('notes', (h) => table(h)),
    agreements: section('agreements', (h) => table(h)),
    attachments: section('attachments', (h) => table(h)),
    // Card charges and refunds (the Payments tab), from the customer page itself.
    payments: page ? tables(page).find((t) => t.headers.includes('Charged On')) || { headers: [], rows: [] } : { error: err.page },
    notifications: section('notifications', (h) => lists(h)),
  };
}

function safe(fn) {
  try {
    return fn();
  } catch (e) {
    return { error: `Could not read this section (${e.message})` };
  }
}
