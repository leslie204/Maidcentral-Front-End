// Reading MaidCentral's HTML snippets into data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tables, pairs, badges, lists, formValues } from '../src/extract.js';

test('tables: header row not counted, action columns dropped, links kept', () => {
  const html = `<table><tr><th>Contact Type</th><th>Info</th><th></th><th>Actions</th></tr>
    <tr><td>Cell Phone</td><td>555-0100</td><td><a href="/CustomerContact/Delete/1">Delete</a></td><td>Edit</td></tr>
    <tr><td>Email</td><td>a@example.com</td><td><a href="/HomeInformation/Details/9?cid=3&hsid=4">Home</a></td><td>Edit</td></tr></table>`;
  const [t] = tables(html);
  assert.deepEqual(t.headers, ['Contact Type', 'Info', '']);
  assert.deepEqual(t.rows.map((r) => r.cells.slice(0, 2)), [['Cell Phone', '555-0100'], ['Email', 'a@example.com']]);
  assert.deepEqual(t.rows[1].links, ['/HomeInformation/Details/9?cid=3&hsid=4']);
  assert.deepEqual(t.rows[0].links, [], 'delete links are not kept');
  const [empty] = tables('<table><thead><tr><th>Title</th></tr></thead></table>');
  assert.deepEqual(empty, { headers: ['Title'], rows: [] });
});

test('pairs, badges and lists', () => {
  const html = `<ul><li><span class="sale-info">Revenue</span><span class="sale-num">$120</span></li></ul>
    <dl><dt>Since</dt><dd>2024</dd></dl><span class="label">VIP</span><span class="label">VIP</span>
    <h4>Reminders</h4><ul><li>Email: on</li><li>Text: off</li></ul>`;
  assert.deepEqual(pairs(html), [{ label: 'Revenue', value: '$120' }, { label: 'Since', value: '2024' }]);
  assert.deepEqual(badges(html), ['VIP']);
  assert.deepEqual(lists(html), [{ title: 'Reminders', items: ['Email: on', 'Text: off'] }]);
});

test('formValues: only allowed labels; .form-group, wrapped checkboxes, selects', () => {
  const html = `<div class="form-group"><label class="control-label">First Name</label><input id="FirstName" value="Ana"></div>
    <div class="form-group"><label class="control-label">Birth Date</label><input value="1/1/1990"></div>
    <div class="form-group"><label class="control-label">Hourly Rate</label><input value="25"></div>
    <div class="form-group"><label class="control-label">State</label><select><option>ON</option><option selected>QC</option></select></div>
    <label class="checkbox-inline"><input type="checkbox" checked> Technician</label>
    <label class="checkbox-inline"><input type="checkbox"> Office</label>`;
  const v = formValues(html, /^(First Name|State|Technician|Office)$/);
  assert.deepEqual(v, { 'First Name': 'Ana', State: 'QC', Technician: 'Yes' });
  assert.ok(!JSON.stringify(v).includes('1990') && !JSON.stringify(v).includes('25'));
});
