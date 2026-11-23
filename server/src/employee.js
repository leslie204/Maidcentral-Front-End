// Cleaners (MaidCentral employees): the directory and the full cleaner page, as data.
// Deliberately left out: driver's licence, birth date, tax and withholding details, pay
// rates and salary (payroll is out of scope for this app).
import { root, textOf, tables, table, pairs, formValues } from './extract.js';
import { McError } from './mc.js';

const PROFILE_FIELDS = /^(First Name|M\.I\.|Last Name|Hire Date|Termination Date|Emergency Contact Name|Emergency Contact Phone|Internal Memo|Bio for Scorecards|Address 1|Address 2|City|State|Zip|Email|Sales|Group Administrator|Office|Technician|Administrator|HR Admin|Payroll Admin)$/;
const ROLE_FIELDS = ['Technician', 'Office', 'Sales', 'Administrator', 'Group Administrator', 'HR Admin', 'Payroll Admin'];

// Attendance calendar colours (MaidCentral's legend classes).
const ATTENDANCE = {
  '#26c281': 'Available',
  '#4b77be': 'Paid Time Off',
  '#525e64': 'Sick',
  '#f7ca18': 'Time Off',
  '#8775a7': 'Excused',
  '#d91e18': 'Unexcused',
  '#95a5a6': 'Clock',
};

export async function cleanerDirectory(mc) {
  const html = await mc.getHtml('/Employee');
  const r = root(html);
  const t = table(r);
  const links = r.querySelectorAll('tbody tr').map((tr) => /\/Employee\/Details\/(\d+)/.exec(tr.querySelector('a')?.getAttribute('href') || '')?.[1] || null);
  return {
    headers: t.headers,
    rows: t.rows.map((row, i) => ({ id: links[i], cells: row.cells })),
  };
}

export async function cleanerProfile(mc, id) {
  if (!/^\d{1,10}$/.test(String(id))) throw new McError('input', 'Bad cleaner id');
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  const calls = {
    page: mc.getHtml(`/Employee/Details/${id}`),
    stats: mc.postFormHtml('/Employee/Stats', { id }),
    contacts: mc.getHtml('/EmployeeContact/EmployeeContacts', { id }),
    jobs: mc.getHtml('/Employee/JobHistory', { id }),
    scorecards: mc.getHtml('/Employee/ScorecardPartial', { id, showExcludeColumn: 'false' }),
    inspections: mc.getHtml('/Employee/Inspections', { id }),
    tickets: mc.getHtml('/Employee/ContactTicketsPartial', { id }),
    clocks: mc.getHtml('/Event/EventClocksByEmployee', { id }),
    history: mc.getHtml(`/Employee/GetEmployeeHistory/${id}`),
    notes: mc.getJson('/employee/notes', { employeeId: id, sorting: 'DateCreated desc', skipCount: '0', filter: '', maxResultCount: '50' }),
    attendance: mc.postFormJson('/Employee/GetAttendance', { id, start: String(now - 60 * day), end: String(now + 30 * day) }),
    defaultSchedule: mc.postFormJson('/Employee/DefaultSchedule', { id, start: String(now - 7 * day), end: String(now + 7 * day) }),
  };
  const keys = Object.keys(calls);
  const settled = await Promise.allSettled(Object.values(calls));
  const expired = settled.find((s) => s.status === 'rejected' && s.reason?.code === 'expired');
  if (expired) throw expired.reason;
  const got = Object.fromEntries(keys.map((k, i) => [k, settled[i].status === 'fulfilled' ? settled[i].value : null]));
  const err = Object.fromEntries(keys.map((k, i) => [k, settled[i].status === 'rejected' ? settled[i].reason?.message || 'Not available' : null]));
  const section = (k, fn) => (got[k] == null ? { error: err[k] } : safe(() => fn(got[k])));

  const page = got.page ? root(got.page) : null;
  // An unknown id shows the employee list instead of a profile.
  if (page && !page.querySelector('#tab_job_history, [href="#tab_job_history"]') && tables(page)[0]?.headers.includes('Mailing Address')) {
    throw new McError('notfound', 'Cleaner not found');
  }
  const fields = page ? formValues(page, PROFILE_FIELDS) : {};
  const name = [fields['First Name'], fields['Last Name']].filter(Boolean).join(' ') || null;
  const pagePairs = page ? pairs(page) : [];
  const defaults = page ? page.querySelectorAll('label').map(textOf).filter((t) => /^Default (Team|Position):/.test(t)) : [];
  const statsRoot = got.stats ? root(got.stats) : null;

  return {
    id: String(id),
    name,
    profile: page
      ? {
          fields: Object.fromEntries(Object.entries(fields).filter(([k]) => !ROLE_FIELDS.includes(k))),
          roles: ROLE_FIELDS.filter((r) => fields[r] === 'Yes'),
          summary: pagePairs,
          defaults: defaults.map((t) => {
            const [label, ...rest] = t.split(':');
            return { label, value: rest.join(':').trim() };
          }),
        }
      : { error: err.page },
    stats: statsRoot ? { period: textOf(statsRoot.querySelector('.caption')).replace(/^Stats\s*/i, ''), pairs: pairs(statsRoot) } : { error: err.stats },
    contacts: section('contacts', (h) => table(h)),
    jobs: section('jobs', (h) => newestFirst(table(h), 'Job Date')),
    scorecards: section('scorecards', (h) => newestFirst(table(h), 'Job Date')),
    inspections: section('inspections', (h) => table(h)),
    tickets: section('tickets', (h) => table(h)),
    clocks: section('clocks', (h) => dropColumns(table(h), /additional pay/i)),
    history: section('history', (h) => table(h)),
    notes: section('notes', (j) => (j.Items || []).map((n) => ({
      created: n.DateCreated,
      note: n.Note || n.MsgNote || '',
      open: n.OpenDate,
      closed: n.CloseDate,
      closeNote: n.CloseNote,
      by: n.CreatedByName,
      closedBy: n.ClosedByName,
    }))),
    attendance: section('attendance', (list) => list.map((a) => ({
      start: a.start,
      end: a.end,
      allDay: a.allDay,
      status: ATTENDANCE[String(a.color || '').toLowerCase()] || a.title || 'Other',
      color: a.color,
      late: a.late,
    }))),
    defaultSchedule: section('defaultSchedule', (list) => list.map((s) => ({ start: s.start, end: s.end, title: s.title || null }))),
  };
}

function newestFirst(t, header) {
  const i = t.headers.indexOf(header);
  if (i < 0) return t;
  const at = (r) => Date.parse(r.cells[i]) || 0;
  return { ...t, rows: [...t.rows].sort((a, b) => at(b) - at(a)) };
}

function dropColumns(t, re) {
  const keep = t.headers.map((h, i) => (re.test(h) ? -1 : i)).filter((i) => i >= 0);
  return { headers: keep.map((i) => t.headers[i]), rows: t.rows.map((r) => ({ ...r, cells: keep.map((i) => r.cells[i]) })) };
}

function safe(fn) {
  try {
    return fn();
  } catch (e) {
    return { error: `Could not read this section (${e.message})` };
  }
}
