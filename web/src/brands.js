// The company's brands, each with its own portal. The menu's brand switcher lists them;
// picking another brand opens its portal. Add a logo file under web/public/brands/ and
// set `logo` to show it instead of the initials.
export const BRANDS = [
  { id: 'cleanbee', name: 'Clean Bee', tagline: 'Operations', initials: 'CB', logo: '/brands/clean-bee-mark.png', url: null, colors: ['#fbbf24', '#f59e0b'] },
  { id: 'urbanmop', name: 'UrbanMop', tagline: 'Operations', initials: 'UM', logo: null, url: 'https://web-production-27677.up.railway.app', colors: ['#38bdf8', '#0369a1'] },
];
// This portal's brand.
export const CURRENT = BRANDS[0];
