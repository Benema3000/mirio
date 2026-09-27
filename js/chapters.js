// Each outing has its own route, finish line and clock. Drawing assets stay
// shared with the original adventure, so Mirio is always Miro's character.
export const CHAPTERS = Object.freeze({
  adventure: {name: 'Das grosse Abenteuer', short: 'Planetenreise', eyebrow: '01 / PLANETENREISE',
    description: 'Wiesen erkunden, zum Mond reisen und ins Kart steigen.',
    keys: 'WASD laufen · Leertaste springen · Shift drehen · C stampfen',
    touch: 'Links laufen · ↑ springen · ⟳ drehen · ⤓ stampfen',
    goal: 'Hol dir den Kristall!', medal: [240000, 420000, 720000]},
  sky: {name: 'Wolkenpost', short: 'Wolkenpost', eyebrow: '02 / HIMMELSEXPRESS',
    description: 'Pakete zustellen, Windwege wählen und den Wolkenwal wecken.',
    keys: 'WASD / Pfeile lenken · Leertaste Schutzrolle · Shift Paket / Turbo',
    touch: 'Links lenken · ↻ Schutzrolle · ✦ Paket / Turbo',
    goal: 'Bring die Wolkenpost ins Ziel!', medal: [65000, 85000, 120000]},
  ribbon: {name: 'Blütenpfad', short: 'Blütenpfad', eyebrow: '03 / HÜPF INS GRÜNE',
    description: 'Baumhaus, Glashaus und Kellergarten: Finde drei Laternensamen.',
    keys: 'A / D oder ← → laufen · Leertaste springen · Shift Wirbel / Lied / Tür',
    touch: 'Links laufen · ↑ springen · ✦ Wirbel / Lied / Tür',
    goal: '✧ Drei Laternensamen → Blütenhof', medal: [65000, 95000, 150000]},
  kart: {name: 'Sternenrennen', short: 'Sternenrennen', eyebrow: '04 / AB INS KART',
    description: 'Das ganze Kartrennen, direkt ab Start: driften, Turbo holen und dem Kristall hinterher!',
    keys: '↑ Gas · ↓ Bremse · ← → lenken · Leertaste + lenken: driften',
    touch: 'Links lenken · Gas & Bremse rechts · Zum Driften ↑ halten, loslassen: Turbo',
    goal: 'Hol dir den Kristall!', medal: [42000, 55000, 75000]},
});

export function medalFor(level, milliseconds) {
  const times = CHAPTERS[level]?.medal;
  if (!times || !Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  return milliseconds <= times[0] ? 'gold' : milliseconds <= times[1] ? 'silver' : milliseconds <= times[2] ? 'bronze' : 'finish';
}

export const MEDALS = Object.freeze({gold: '✦ Goldsonne', silver: '✧ Silberstern', bronze: '❀ Bronzeblüte', finish: '♡ Abenteuer geschafft'});
