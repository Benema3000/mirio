// Blütenpfad: one garden run from left to right. Blütenhof, Baumhaus, Glashaus
// and Kellergarten follow each other, each with a climb to something up high,
// and a flower tower at the end carries the Blütentor. The ground below every
// climb catches a missed jump; the three creeks between the gardens are the
// only places to fall.
export const GARDEN = Object.freeze({ minX: -4, maxX: 326, finishX: 315, finishY: 12, seedCount: 3 });

export function makeGardenCourse() {
  const platforms = [];
  const add = (id, x, y, w, kind = 'petal', extra = {}) => platforms.push({ id, x, y, w, kind, ...extra });
  const steps = (prefix, points, kind, zone) => points.forEach(([x, y], i) => add(`${prefix}-${i}`, x, y, 7, kind, { zone }));

  // Ground, with a creek between each garden.
  add('courtyard-floor', 31, 0, 70, 'ground', { zone: 0 });
  add('orchard-floor', 111, 0, 82, 'ground', { zone: 1 });
  add('glass-floor', 194, 0, 76, 'ground', { zone: 2 });
  add('cellar-floor', 281, 0, 90, 'ground', { zone: 3 });

  // Blütenhof: two petals to warm up, then a spring flower to a high one.
  steps('courtyard', [[16, 1.8], [24, 3.4]], 'petal', 0);
  add('courtyard-high', 44, 4.6, 7, 'petal', { zone: 0 });

  // Baumhaus: a staircase of petals up to the tree house balcony.
  steps('orchard', [[82, 1.8], [89, 3.5], [96, 5.2], [103, 6.9]], 'petal', 1);
  add('orchard-balcony', 112, 8.4, 12, 'petal', { zone: 1 });
  add('orchard-down', 122, 5.4, 6, 'petal', { zone: 1 });

  // Glashaus: vine stairs to the glass roof, a drifting cloud off its end.
  steps('glass', [[168, 1.7], [175, 3.4], [182, 5.1], [189, 6.8]], 'vine', 2);
  add('glass-roof', 199, 8.4, 15, 'petal', { zone: 2 });
  add('glass-cloud', 215, 6.2, 6, 'cloud', { zone: 2, move: { axis: 'x', amplitude: 2, period: 5, phase: 0 } });

  // Kellergarten: a spring flower up to the seed pod.
  add('cellar-pod', 262, 4.4, 9, 'petal', { zone: 3 });

  // The flower tower: a zigzag up to the Blütentor.
  steps('tower', [[306, 2], [315, 4], [306, 6], [315, 8], [306, 10], [315, 12]], 'vine', 4);

  const checkpoints = [
    { id: 'courtyard', x: 4, y: 0 }, { id: 'orchard', x: 74, y: 0 }, { id: 'glass', x: 160, y: 0 },
    { id: 'cellar', x: 240, y: 0 }, { id: 'tower', x: 298, y: 0 },
  ].map((p, index) => ({ ...p, index }));
  const seeds = [{ id: 'orchard-seed', x: 115, y: 9.45 }, { id: 'glass-seed', x: 203, y: 9.45 }, { id: 'cellar-seed', x: 264, y: 5.45 }];
  const springs = [{ id: 'courtyard-flower', x: 36, y: 0, boost: 16.7 }, { id: 'cellar-flower', x: 254, y: 0, boost: 16.7 }];

  // Gems above every fixed petal, and a trail along the ground.
  const gems = [];
  for (const p of platforms.filter(p => p.kind !== 'ground' && !p.move)) {
    for (const offset of [-1.2, 1.2]) gems.push({ id: `gem-${gems.length}`, x: p.x + offset, y: p.y + 1, route: 'blossom' });
  }
  for (const x of [8, 30, 56, 78, 132, 142, 162, 222, 244, 286, 294]) gems.push({ id: `gem-${gems.length}`, x, y: 1, route: 'ribbon' });

  const critters = [[58, 0], [140, 0], [226, 0], [288, 0]].map(([x, y], i) => ({ id: `puff-${i}`, x, y, range: 1.5, phase: i * 1.3, speed: .8 }));
  return {
    name: 'Blütenpfad', version: 3, start: { x: 4, y: 0 }, finishX: GARDEN.finishX, finishY: GARDEN.finishY,
    platforms, springs, checkpoints, gems, critters, seeds,
    rooms: [
      { id: 'courtyard', name: 'Blütenhof', min: -Infinity, max: 68, color: 0xbfe6ee },
      { id: 'orchard', name: 'Baumhaus', min: 68, max: 154, color: 0xc6e8b8 },
      { id: 'glass', name: 'Glashaus', min: 154, max: 234, color: 0xd6ecde },
      { id: 'cellar', name: 'Kellergarten', min: 234, max: 296, color: 0x8f9cc6 },
      { id: 'tower', name: 'Blütentor', min: 296, max: Infinity, color: 0xf3d6e2 },
    ],
  };
}
