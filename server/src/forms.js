// Reads HTML forms the way a browser would submit them, so the server can sign in to
// MaidCentral without knowing every field name in advance (anti-forgery tokens, hidden
// return URLs, provider pickers…).
import { parse } from 'node-html-parser';

// All forms on a page: { action, method, fields: [[name, value], …], inputs, selects }.
export function readForms(html, pageUrl) {
  const root = parse(html);
  return root.querySelectorAll('form').map((form) => {
    const fields = [];
    const inputs = [];
    for (const el of form.querySelectorAll('input, select, textarea')) {
      const name = el.getAttribute('name');
      if (!name) continue;
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || (tag === 'input' ? 'text' : tag)).toLowerCase();
      if (['submit', 'button', 'image', 'reset', 'file'].includes(type)) continue;
      if (tag === 'select') {
        const options = el.querySelectorAll('option').map((o) => ({ value: o.getAttribute('value') ?? o.text.trim(), label: o.text.trim(), selected: o.hasAttribute('selected') }));
        const chosen = options.find((o) => o.selected) || options.find((o) => o.value !== '') || options[0];
        inputs.push({ name, type: 'select', options });
        fields.push([name, chosen ? chosen.value : '']);
        continue;
      }
      const value = tag === 'textarea' ? el.text : el.getAttribute('value') ?? '';
      inputs.push({ name, type, value, checked: el.hasAttribute('checked'), id: el.getAttribute('id') || '' });
      if ((type === 'checkbox' || type === 'radio') && !el.hasAttribute('checked')) continue;
      fields.push([name, type === 'checkbox' && value === '' ? 'on' : value]);
    }
    const labels = Object.fromEntries(root.querySelectorAll('label').map((l) => [l.getAttribute('for') || '', l.text.trim()]));
    return {
      action: new URL(form.getAttribute('action') || pageUrl, pageUrl).href,
      method: (form.getAttribute('method') || 'get').toUpperCase(),
      fields,
      inputs,
      labels,
      text: form.text.replace(/\s+/g, ' ').trim(),
    };
  });
}

// Sets a field: replaces the first value with that name (keeps ASP.NET's checkbox +
// hidden "false" pair in order), or adds it.
export function setField(form, name, value) {
  const i = form.fields.findIndex(([n]) => n === name);
  if (i >= 0) form.fields[i] = [name, value];
  else form.fields.unshift([name, value]);
}

// Ticks a checkbox whose name, id or label mentions one of the words.
export function tickCheckbox(form, re) {
  for (const input of form.inputs.filter((x) => x.type === 'checkbox')) {
    if (re.test(`${input.name} ${input.id} ${form.labels[input.id] || ''}`)) setField(form, input.name, input.value || 'on'); // browsers send "on" for a checkbox without a value
  }
}

export function encodeForm(form) {
  return new URLSearchParams(form.fields).toString();
}

// Text of validation errors on a page (wrong password, wrong code).
export function pageErrors(html) {
  const root = parse(html);
  return root
    .querySelectorAll('.validation-summary-errors li, .field-validation-error, .text-danger, .alert-danger')
    .map((e) => e.text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);
}
