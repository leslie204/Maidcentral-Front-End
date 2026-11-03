// Team colours: MaidCentral's own when set; otherwise, for teams named after a colour
// ("Blue", "Teal"…), a matching one. Returns { bg, fg }.
const NAMED = {
  black: ['#374151', '#fff'], blue: ['#3b82f6', '#fff'], green: ['#22c55e', '#fff'], grey: ['#9ca3af', '#111'], gray: ['#9ca3af', '#111'],
  orange: ['#f97316', '#fff'], purple: ['#a855f7', '#fff'], red: ['#ef4444', '#fff'], teal: ['#14b8a6', '#fff'], yellow: ['#facc15', '#111'],
  pink: ['#ec4899', '#fff'], brown: ['#92400e', '#fff'], white: ['#f3f4f6', '#111'], navy: ['#1e3a8a', '#fff'], gold: ['#eab308', '#111'],
};

export function teamColor(team) {
  if (team?.color && !/^#?(fff|ffffff)$/i.test(team.color)) return { bg: team.color, fg: team.textColor || '#fff' };
  const word = String(team?.name || '').toLowerCase().match(/[a-z]+/g)?.find((w) => NAMED[w]);
  if (word) return { bg: NAMED[word][0], fg: NAMED[word][1] };
  return { bg: '#e5e7eb', fg: '#111' };
}
