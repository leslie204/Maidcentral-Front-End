// Friendly area names for MaidCentral zones. MaidCentral's zone descriptions are written
// for the office ("very far east - valley - liberty lake"); sales and schedulers read
// place names. Each name below restates the zone's own description as the place it
// describes; nothing is invented. Zones not listed get a cleaned-up version of their
// description (title case, the most specific part). Zones whose names come out the same
// are told apart by their ZIP codes.
const NAMES = {
  north: 'North Spokane',
  'north north': 'Far North Spokane',
  'north north east': 'Northeast Spokane',
  central: 'Central Spokane',
  'central - company zone': 'Central Spokane (office area)',
  'downtown - central': 'Downtown',
  'west central - pre airway': 'West Central',
  'far west - airway': 'Airway Heights',
  'very far west medical lake': 'Medical Lake',
  'very far west - cheney': 'Cheney',
  'south hill': 'South Hill',
  'deep south hill': 'Deep South Hill',
  'east - valley': 'Spokane Valley',
  'east - spokane valley': 'Spokane Valley',
  'east millwood valley': 'Millwood',
  'far east - otis orchards- valley': 'Otis Orchards',
  'very far east - valley - liberty lake': 'Liberty Lake',
  'very south valley - spangle/ mica': 'Spangle / Mica',
  'north - fairwood': 'Fairwood',
  'north west - suncrest': 'Suncrest',
  'north - mead': 'Mead',
  'very north - deer park': 'Deer Park',
};

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const title = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\s*\/\s*/g, ' / ');
const DIRECTIONS = /^(very |far |deep )*(north|south|east|west|central|north ?west|north ?east|south ?west|south ?east)$/;

// "very far east - valley - liberty lake" -> "Liberty Lake" (fallback for unlisted zones)
export function derive(zone) {
  const parts = norm(zone).split(/\s*-\s*/).filter(Boolean);
  const place = [...parts].reverse().find((p) => !DIRECTIONS.test(p) && !/^(valley|zone|company zone|pre .*)$/.test(p)) || parts[parts.length - 1] || '';
  return title(place);
}

// zones: [{ name, zips }] -> Map(zone name -> { label, zips }) with duplicate labels
// disambiguated by ZIP.
export function areaNames(zones) {
  const base = zones.map((z) => ({ zone: z.name, zips: z.zips || [], label: NAMES[norm(z.name)] || derive(z.name) }));
  const count = {};
  for (const b of base) count[b.label] = (count[b.label] || 0) + 1;
  return new Map(base.map((b) => [norm(b.zone), { label: count[b.label] > 1 && b.zips.length ? `${b.label} (${b.zips.join(', ')})` : b.label, zips: b.zips }]));
}

export const areaKey = norm;
