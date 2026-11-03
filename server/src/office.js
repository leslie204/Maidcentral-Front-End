// Where teams start and end their day: the company address from MaidCentral's company
// settings, located once (US Census geocoder: public, no key; only the business address
// is sent). Overrides: OFFICE_LAT / OFFICE_LNG. Fallback: the centre of the recurring
// homes in the office's ZIP code.
//
// Everyone has to be back at the office by OFFICE_RETURN_BY (default 4:45 PM).
import { formValues } from './extract.js';
import { geocode } from './geo.js';

const located = new Map(); // portal host -> office

export function returnBy() {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(process.env.OFFICE_RETURN_BY || '4:45 PM').trim());
  return m ? ((Number(m[1]) % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + Number(m[2]) : 16 * 60 + 45;
}

export async function office(mc, homes = []) {
  if (located.has(mc.host)) return located.get(mc.host);
  let address = null;
  try {
    const f = formValues(await mc.getHtml('/Company/Settings'), /^(Address 1|City|State|Zip)$/);
    if (f['Address 1']) address = { line: f['Address 1'], city: f.City, state: f.State, zip: f.Zip };
  } catch (e) {
    if (e.code === 'expired') throw e;
  }
  const text = address ? `${address.line}, ${address.city}, ${address.state} ${address.zip}` : null;
  let where = null;
  if (Number(process.env.OFFICE_LAT) && Number(process.env.OFFICE_LNG)) where = { lat: Number(process.env.OFFICE_LAT), lng: Number(process.env.OFFICE_LNG), source: 'OFFICE_LAT/OFFICE_LNG' };
  if (!where && text) {
    const g = await geocode(text);
    if (g) where = { lat: g.lat, lng: g.lng, source: 'US Census geocoder' };
  }
  if (!where && address?.zip) {
    const inZip = homes.filter((h) => h.zip === address.zip);
    if (inZip.length) where = { lat: inZip.reduce((a, h) => a + h.lat, 0) / inZip.length, lng: inZip.reduce((a, h) => a + h.lng, 0) / inZip.length, source: `centre of homes in ZIP ${address.zip}` };
  }
  const result = { address: text, ...(where || { lat: null, lng: null, source: 'unknown' }) };
  if (where) {
    located.set(mc.host, result);
    console.log(`Office: ${text || 'no address'} -> ${where.lat.toFixed(4)}, ${where.lng.toFixed(4)} (${where.source})`);
  }
  return result;
}

// For tests.
export function _resetOffice() {
  located.clear();
}
