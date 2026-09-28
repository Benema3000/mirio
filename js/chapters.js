// Each outing has its own route, finish line and clock. Drawing assets stay
// shared with the original adventure, so Mirio is always Miro's character.
export const CHAPTERS = Object.freeze({
  adventure: {name: 'Das grosse Abenteuer', short: 'Planetenreise', eyebrow: '01 / PLANETENREISE',
    description: 'Wiesen erkunden, zum Mond reisen und ins Kart steigen. Hinter dem fernen Obstbaum wartet ein Sternentor.',
    keys: 'WASD laufen · Leertaste springen · Shift drehen · C stampfen',
    touch: 'Links laufen · ↑ springen · ⟳ drehen · ⤓ stampfen',
    controller: 'Linker Stick laufen · A springen · X drehen · B stampfen · Y Flugzeug',
    goal: 'Hol dir den Kristall!', medal: [240000, 420000, 720000]},
  sky: {name: 'Wolkenpost', short: 'Wolkenpost', eyebrow: '02 / HIMMELSEXPRESS',
    jumpIcon: '↻', jumpLabel: 'Schutzrolle', actionIcon: '✦', actionLabel: 'Paket / Turbo',
    description: 'Flieg durch die Ringe, weich den Ballons aus und wirf drei Pakete zu den Inseln.',
    keys: 'WASD / Pfeile lenken · Leertaste Schutzrolle · Shift Paket / Turbo',
    touch: 'Links lenken · ↻ Schutzrolle · ✦ Paket / Turbo',
    controller: 'Linker Stick lenken · A Schutzrolle · X Paket / Turbo',
    goal: 'Bring die Wolkenpost ins Ziel!', medal: [65000, 85000, 120000]},
  ribbon: {name: 'Blütenpfad', short: 'Blütenpfad', eyebrow: '03 / HÜPF INS GRÜNE',
    jumpIcon: '↑', jumpLabel: 'Springen', actionIcon: '✦', actionLabel: 'Luftwirbel',
    description: 'Lauf durch den Garten bis zum Blütentor. Weit oben warten drei Laternensamen.',
    keys: 'A / D oder ← → laufen · Leertaste springen · Shift in der Luft: Wirbel',
    touch: 'Links laufen · ↑ springen · ✦ in der Luft: Wirbel',
    controller: 'Linker Stick laufen · A springen · X in der Luft: Wirbel',
    goal: 'Lauf zum Blütentor!', medal: [60000, 80000, 120000]},
  kart: {name: 'Sternenrennen', short: 'Sternenrennen', eyebrow: '04 / AB INS KART',
    description: 'Das ganze Kartrennen, direkt ab Start: driften, Turbo holen und dem Kristall hinterher!',
    keys: '↑ Gas · ↓ Bremse · ← → lenken · Leertaste + lenken: driften',
    touch: 'Links lenken · Gas & Bremse rechts · Zum Driften ↑ halten, loslassen: Turbo',
    controller: 'Linker Stick lenken · RT Gas · LT Bremse · A halten + lenken: driften',
    goal: 'Hol dir den Kristall!', medal: [42000, 55000, 75000]},
  marble: {name: 'Klangkugel', short: 'Klangkugel', eyebrow: '05 / STERNENFLIPPER',
    jumpIcon: '↥', jumpLabel: 'Feder spannen / beide Flipper', actionIcon: '✦', actionLabel: 'Anstupsen',
    description: 'Lass Rampen wachsen, wecke den Kuckuck und reite einen Kometen. Drei Tische voller Musik!',
    keys: '← → / A D: Flipper · Leertaste halten / loslassen: Feder / beide · Ein Flipper halten: fangen · Shift: Stups',
    touch: '↗ ↖ Flipper · Einen halten: fangen · ↥ halten / loslassen: Feder / beide',
    controller: 'LB / RB: Flipper · Einen halten: fangen · A halten / loslassen: Feder / beide · X: Stups',
    goal: '♪ Drei Tische → Sternenkonzert', medal: [90000, 150000, 240000]},
  tilt: {name: 'Seifenstern', short: 'Seifenstern', eyebrow: '06 / IM GLEICHGEWICHT',
    jumpIcon: '◎', jumpLabel: 'Bremse / Schaumsteg halten', actionIcon: null, actionLabel: '',
    description: 'Kippe die schwebenden Wege. Bremse im Seifenbecken: Ein Schaumsteg wächst!',
    keys: 'WASD / Pfeile kippen · Leertaste halten: bremsen / Schaumsteg',
    touch: 'Links kippen · ◎ halten: bremsen / Schaumsteg',
    controller: 'Linker Stick kippen · A halten: bremsen / Schaumsteg',
    goal: '⚑ Über drei Inseln zum Handtuch', medal: [50000, 75000, 110000]},
  volcano: {name: 'Die Vulkanreise', short: 'Vulkanreise', eyebrow: '07 / VULKANREISE',
    jumpIcon: '↑', jumpLabel: 'Springen', actionIcon: '⟳', actionLabel: 'Drehen',
    description: 'Über die Glutwelt zur Rakete, auf dem Aschemond zu Glutzahn. Die Glutbeere macht Mirio groß.',
    keys: 'WASD laufen · Leertaste springen · Shift drehen · C stampfen',
    touch: 'Links laufen · ↑ springen · ⟳ drehen · ⤓ stampfen',
    controller: 'Linker Stick laufen · A springen · X drehen · B stampfen',
    goal: 'Hol dir den Kristall!', medal: [240000, 420000, 720000]},
});

export function medalFor(level, milliseconds) {
  const times = CHAPTERS[level]?.medal;
  if (!times || !Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  return milliseconds <= times[0] ? 'gold' : milliseconds <= times[1] ? 'silver' : milliseconds <= times[2] ? 'bronze' : 'finish';
}

export const MEDALS = Object.freeze({gold: '✦ Goldsonne', silver: '✧ Silberstern', bronze: '❀ Bronzeblüte', finish: '♡ Abenteuer geschafft'});
