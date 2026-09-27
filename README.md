# Mirio

> This repository is a copy of the game. It is developed in the Goodvantage
> website repository and deployed with it to <https://goodvantage.ch/mirio/>.
>
> Mirio was created with Claude Opus 5.5, an AI model by Anthropic, which
> wrote the code; people chose the direction and played it. The figure and
> the drawings are Miro's. Mirio is a free, non-commercial experiment: the
> graphics, music and program were made for it.

A small platformer in the browser at <https://goodvantage.ch/mirio/>: one big
round world with its own gravity, a
ring-shaped lake to cross on stepping stones, hills and floor-block towers, a
rocket to the moon, a boss fight against Finster-Mirio on a floating arena
above the moon, and then a kart race: the freed crystal shoots off,
Mirio jumps into a kart made from Miro's rocket and races Finster-Mirio down
a road of Miro's grey floor scribble that winds three times round the
Zielplanet to the finish,
where the crystal waits.

Mirio moves like a classic platformer hero: he builds up speed and skids when you reverse, keeps
his momentum in the air, hops on a tap and jumps high when you hold, chains
single, double and triple jumps when you jump again right after landing at a
run, spins (a small air boost) and ground-pounds (C / Ctrl, or the ⤓ button).

The characters are drawings by Miro. They first appeared in a 2D Phaser
version (2023, `spendedirekt.ch/html/exper/`), where the brown rocket drawing
was misused as the on-screen buttons. `img/` holds the drawings unmodified
(renamed to `mirio.png`, `rakete.png` and `floor.png`); the 3D
models are built from them at load time.

| Drawing | In 3D |
| --- | --- |
| `mirio.png` | Mirio, a 3D figure with the drawing's proportions (big cap, wide face, spiky five-finger hands), textured with crops of Miro's own marker strokes, his drawn face as a decal and pen-line outlines (`js/mirio-model.js`). The title screen shows the drawing itself. |
| `rakete.png` | The rocket: its outline turned on a lathe, wrapped in the drawing's brown strokes, plus fins, a porthole and a flame (`js/props.js`). `left_btn.png`/`right_btn.png` in the old game were the same drawing rotated, so they are not copied. |
| `floor.png` | The moon's ground, the stepping stones, the plateau and the floor blocks |

The only enemy is the boss, **Finster-Mirio** (`js/boss.js`): Miro has not
drawn a villain, so it is his hero turned into a giant dark twin with glowing
red eyes. He chases, leaps and slams a shockwave across the arena; after a slam
he is dizzy and three jumps (or ground pounds) on his cap beat him. Mirio has
three hearts during the fight; losing them all puts him back at the moon's
landing spot and the fight starts over.

After the last hit: slow motion, the boss dissolves, the big crystal breaks out
of its bubble and flies ahead (`main.js`, the cutscene), then the race
(`js/kart.js`). The kart is driven like a car (`js/kart-physics.js`): gas
(↑, or the green button on phones) against air drag and rolling
resistance, faster downhill, a brake (↓, or the red button) that backs up
once the kart stands, and a synthesised engine that follows speed and gas.
On phones the stick only steers. Steering and gas are separate inputs, so
gas never weakens the steering. The kart grips and goes where it points,
and every bend can be taken on full gas; braking into a turn at speed
breaks the grip and it slides (dust and a squeal). The road bends away
underneath, so a kart that does not steer runs wide into the outer kerb and
the inside of a bend is shorter. A gentle assist turns it part of the way
with every bend and straightens it when the stick is let go. Holding jump,
or gas and brake together, while steering hops into a drift: the stick
tightens or widens the arc, the body turns into the bend, sparks at the
rear wheels turn blue, then orange, and letting go fires a short or a long
mini-turbo. Jump alone hops; a barrel roll off the ramp gives a boost. The
camera sits behind the direction of travel, so steering turns the world. Boost pads, a ramp over a gap, Miro's floor blocks as obstacles, 77
glitter stones, red-white kerbs you cannot fall past (hit head-on they bounce
the kart off, touched at an angle it scrapes along), and a rubber-banded rival
so a child usually wins, narrowly. About 40 s on full gas; the camera swings
round with the kart and widens when it goes fast.

## Layout

Plain ES modules, no build step; PHP only for the high score list. `index.html` holds the import map for
three.js and loads `js/main.js`.

| File | What |
| --- | --- |
| `js/world.js` | Physics without a screen: nearest-surface gravity (per-planet strength; the moon has 0.6), platformer steering (acceleration, turning, skid, air momentum, fall-speed cap), the jump chain (`jumpFor`), collision with cylinders, boxes and hills (landing on tops, bumping your head from below), the lake test, `partialTurn` for the camera |
| `js/level.js` | The level as data: planets, lake, glitter stones (the collectables; `bits` in the code), tree stumps, trees, stones, blocks, hills, flags, plateau, rocket flight curve, boss arena, goal |
| `js/boss.js` | Finster-Mirio: model (recoloured `buildMirio`), fight loop, shockwave, stomp and contact rules |
| `js/kart.js` | The kart race: track spline and meshes, rocket karts, driver, rival AI, race camera |
| `js/kart-physics.js` | How Mirio's kart drives, without a screen: heading, speed, drift and mini-turbo, kerbs |
| `api/scores.php`, `api/scores.inc` | The public high score list: tokens, points, name rules, the JSON file |
| `js/scene.js` | Meshes and decoration: sky with twinkling and shooting stars, triplanar-textured planets with rim light, hills, trees and props with pen outlines, instanced grass tufts, flowers and pebbles, the arena, the goal star, particles; `world.update()` animates it all |
| `js/water.js` | The ring lake: waves, fresnel, sparkles, foam along both shores and round every stepping stone, one draw call |
| `js/quality.js` | Renderer colour settings, and a governor that lowers the resolution (then drops the extras) to hold the frame rate on phones |
| `js/mirio-model.js`, `js/props.js` | The 3D models built from the drawings: Mirio; the rocket and the checkpoint flag |
| `js/art.js`, `js/materials.js` | Canvas helpers (crop, sticker border, filled face, scribble textures) and the shared toon and outline materials |
| `js/player.js`, `js/camera.js`, `js/input.js`, `js/audio.js` | Mirio's movement and animation, the camera rig, keyboard/mouse/touch, WebAudio sound and an original eight-bar tune |
three.js r186 comes from jsDelivr through the import map in `index.html`:
`three` and `three/addons/` point at `three@0.186.0`, pinned, with sha384
integrity hashes of the npm tarball's files (checked byte-identical against the
registry's `dist.integrity`). Browsers without import-map integrity support skip
the check. To upgrade, change the version in both URLs and recompute the hashes.

That is the game's only request outside its own folder: no fonts, no
analytics, no cookies. It does send every player's IP address to jsDelivr, which
is how every CDN request works. `localStorage` keeps the mute setting and
the last name entered for the high score list.

## High score list

The win screen shows the run's points and asks for a name, then the top 10;
the start screen shows the top 5 (`api/scores.php`, rules in
`api/scores.inc`). Points: 10 per Glitzerstein, 500 for winning the race (200
for second), plus a point for every second under 15 minutes. The server works
the points out itself from the run's Glitzersteine, time and place.

- Each run fetches a signed token when it starts. The server refuses a run
  that claims to be faster than its token is old, a token used twice, and more
  than 10 entries from one address in 10 minutes. The address is only kept as
  a keyed hash, for those 10 minutes. A browser game cannot prove a score
  beyond that: a determined cheater can still post a made-up run.
- Names are public and read by children: at most 16 letters, digits, spaces
  and `._!-`, and a word list keeps out common German and English swearing
  and slurs. The form asks for a nickname, not a full name.
- The list is one JSON file outside the web root, in `data/mirio/` next to
  the web root's folder (`scores.json`, and `secret.key`, made on first use). To
  remove an entry, edit the file (keep the JSON valid: a damaged file makes
  the list refuse new entries rather than start over). It keeps the best 100.
- `MIRIO_SCORES_DIR` overrides the folder, for tests and previews.

## Tests

- `npm install && npm test` (the same pinned three.js, from npm): physics (walking
  round the world, momentum, skid and air momentum, the fall-speed cap, the
  jump chain, the moon's higher jump, box tops and head bumps, walking onto a
  hill, the lake) and level design (every glitter stone reachable and not buried,
  each lake gap needs a jump but no gap is wide, the moon staircase reaches the
  boss arena in reachable steps, the plateau stairs, the rocket's flight clears
  both planets, the arena's sky is inside the moon's gravity, the three
  planets and their gravity fields keep apart, the kart course runs downhill
  from the arena rim to the Zielplanet) and the kart (it stands without gas,
  pulls away with it, brakes and backs up, runs faster downhill; it turns, a
  bend runs it wide unless it steers, the inside line is shorter; it grips on
  the gas and slides when braking into a turn; drifting charges a mini-turbo;
  kerbs bounce or scrape; the race lasts 35–60 s on full gas).
- `tests/mirio-e2e.mjs` plays every station of the level in real browsers,
  teleporting between them through the `?test` hook: desktop keyboard in
  Chromium (walk, jump, ground pound, a triple jump timed frame by frame
  inside the page, checkpoint flag, falling in the lake and respawning,
  standing on a stone, the rocket countdown and flight, the moon jump, the
  floor blocks, the locked crystal, the boss fight to the end, the cutscene into
  the kart, standing without gas, driving, braking to a stop and drifting, the finish, the win screen, a refused and an
  accepted name on the high score list, replay, and no request except
  to the pinned three.js on jsDelivr),
  touch stick and buttons on a phone-sized screen (and the race's gas and
  brake buttons, reached through the `raceNow` hook), and a start-and-walk check
  in WebKit. Firefox is not covered. It needs Playwright (not installed by
  `npm install`) and PHP for the high score list:

  ```bash
  MIRIO_SCORES_DIR=/tmp/mirio-scores php -S 127.0.0.1:8766 &
  npx playwright install chromium webkit
  node tests/mirio-e2e.mjs
  ```
- `php tests/mirio-scores.php` checks the high score rules: points,
  names, tokens, replays, the rate limit, ordering, the top 100, and that a
  damaged file is left alone.

`?test` adds `window.__mirio` (state snapshot, layout, teleport, a jump to the race). It is a
cheat for tests, harmless in a kid's game, and absent without the parameter.

## Running it

Any web server with PHP 8 serves it; without PHP the game runs and only the
high score list stays hidden. Locally:

```bash
MIRIO_SCORES_DIR=/tmp/mirio-scores php -S 127.0.0.1:8766
# then open http://127.0.0.1:8766/
```

The high score list needs the web server to be able to create `data/mirio/`
next to the web root (or `MIRIO_SCORES_DIR`). Keep `api/scores.inc` out of
reach of browsers (the live site's `.htaccess` denies `*.inc`).

## Ideas if Miro draws more

An enemy, a second character or a new planet texture: load the drawing in
`loadArt()` (`js/art.js`) and build it the way `js/props.js` builds the rocket.
A drawn villain could replace Finster-Mirio's model in `js/boss.js` and keep
the fight loop.

## Licence

The code is MIT-licensed (see `LICENSE`). Miro's drawings and the pictures
that show them are not (see `img/LICENSE.md`): they are published with his
parents' consent, not licensed for reuse.

## Only its own

Everything in Mirio is its own: Miro's figure and drawings, and graphics,
music and code made for the game. Nothing in the game, the blog post, the
README, the docs or the code names or points to other games or
their makers (operator decision, 2026-09-27); keep it that way when
extending it. The name is plain "Mirio", the prize a crystal, the
collectables cut gems. The start screen and the blog post end with the same
statement: a free, non-commercial experiment; figure and drawings by Miro;
graphics, music and program made for this game. Miro's parents consented to publishing his
drawings and his first name.
