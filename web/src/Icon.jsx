// Stroke icons on a 24px grid, drawn with currentColor (same style as the Launch27 app).
const PATHS = {
  calendar: ['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  activity: ['M3 12h4l3-8 4 16 3-8h4'],
  planner: ['M4 4h16v16H4z', 'M4 10h16', 'M10 4v16'],
  users: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21a7 7 0 0 1 14 0', 'M16 3.5a4 4 0 0 1 0 7', 'M22 21a7 7 0 0 0-4.5-6.5'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  home: ['M3 11 12 4l9 7v9H3z', 'M10 20v-5h4v5'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'm20 20-3.5-3.5'],
  logout: ['M15 4h4v16h-4', 'M10 8l-4 4 4 4', 'M6 12h11'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  chevronLeft: ['m15 5-7 7 7 7'],
  chevronRight: ['m9 5 7 7-7 7'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  alert: ['M12 3 2 21h20z', 'M12 10v4', 'M12 17h.01'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  repeat: ['M17 2l3 3-3 3', 'M4 11V9a4 4 0 0 1 4-4h12', 'M7 22l-3-3 3-3', 'M20 13v2a4 4 0 0 1-4 4H4'],
  check: ['m5 12 5 5L20 7'],
  lock: ['M6 11h12v10H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  star: ['m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z'],
  money: ['M12 3v18', 'M16 7h-6a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H8'],
  note: ['M5 4h10l4 4v12H5z', 'M15 4v4h4'],
  sparkle: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'm6 6 2.5 2.5', 'm15.5 15.5 2.5 2.5', 'm6 18 2.5-2.5', 'm15.5 8.5 2.5-2.5'],
  phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
  mail: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'm3 7 9 6 9-6'],
  route: ['M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16'],
  pin: ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  car: ['M5 16V11l2-5h10l2 5v5', 'M3 16h18v2H3z', 'M7.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M16.5 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M5 11h14'],
  sidebar: ['M4 4h16v16H4z', 'M9 4v16'],
};

export default function Icon({ name, size = 18, className = 'icon', strokeWidth = 1.8 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(PATHS[name] || []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
