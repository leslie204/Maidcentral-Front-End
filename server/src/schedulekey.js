// MaidCentral's "Job Schedule Key" (the legend on the Job Schedule page): which colour
// means which frequency, job progress, requirement or last scorecard rating. Jobs only
// carry colours (FrequencyColor…), so this turns them into names. Read once per session
// and kept for hours, so a tenant's own colours are always used.
import { root, textOf } from './extract.js';

const HOUR = 3_600_000;
const cache = new WeakMap();

// name -> { short, weeks } (weeks: 0 one-off, null recurring without a fixed cycle)
const FREQUENCIES = [
  [/every week|^weekly/i, { short: 'Weekly', weeks: 1 }],
  [/every two weeks|bi-?weekly/i, { short: 'Every 2 weeks', weeks: 2 }],
  [/every three weeks/i, { short: 'Every 3 weeks', weeks: 3 }],
  [/every four weeks|monthly/i, { short: 'Every 4 weeks', weeks: 4 }],
  [/other recurring/i, { short: 'Other recurring', weeks: null }],
  [/single|one[- ]?time/i, { short: 'One-time', weeks: 0 }],
  [/on demand/i, { short: 'On demand', weeks: 0 }],
];

export function parseKey(html) {
  const key = { frequency: {}, progress: {}, scorecard: {} };
  for (const label of root(html).querySelectorAll('.label')) {
    const m = /background(?:-color)?:\s*(#[0-9a-f]{3,8})/i.exec(label.getAttribute('style') || '');
    if (!m) continue;
    const color = m[1].toLowerCase();
    const name = textOf(label);
    const freq = FREQUENCIES.find(([re]) => re.test(name));
    if (freq) key.frequency[color] = { name, ...freq[1], color };
    else if (/^\d\s*-/.test(name)) key.scorecard[color] = { name, score: Number(name[0]), color };
    else if (/behind|progress|complete/i.test(name)) key.progress[color] = { name, color };
  }
  return key;
}

export async function scheduleKey(mc) {
  const hit = cache.get(mc);
  if (hit && Date.now() - hit.at < 6 * HOUR) return hit.value;
  let value = { frequency: {}, progress: {}, scorecard: {} };
  try {
    value = parseKey(await mc.getHtml('/Job/Schedule'));
  } catch (e) {
    if (e.code === 'expired') throw e; // otherwise: no key, jobs just show no frequency
  }
  cache.set(mc, { at: Date.now(), value });
  return value;
}

// A job's frequency from its FrequencyColor, or null when the colour isn't in the key.
export function frequencyOf(key, color) {
  const f = key?.frequency?.[String(color || '').toLowerCase()];
  return f ? { name: f.name, short: f.short, weeks: f.weeks, color: f.color, recurring: f.weeks !== 0 } : null;
}
