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

The main boss is **Finster-Mirio** (`js/boss.js`): Miro has not
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

## Polished adventure edition

The child's drawing remains the centre of the game. The surrounding world now
has seamless grass and bark textures, softer terrain lighting, fuller orchard
and fir trees, butterflies, contact shadows, reflective gems and a moving lake
surface with caustics. The original floor scribble is still the moon, blocks,
stepping stones and race road.

- **Sternenspuren:** optional six-ring trails on the meadow and moon. Touch the
  first glowing ring to start an 18-second challenge; finish in order to earn a
  badge and a 12-second Glitzermagnet. It collects nearby existing gems, without
  changing the public score rules. A missed trail is free to retry; a completed
  trail reopens after 25 seconds. Trials stop quietly during story sequences.
- **Wayfinding:** a surface-relative compass points toward the next checkpoint,
  rocket, or moon collectable; the HUD explains the current objective. The race
  shows speed and progress as well as place and time.
- **Pause:** Esc, the pause button, or controller Start freezes the whole game,
  including race countdowns and sound. Hidden tabs pause automatically. Resume
  explicitly when ready. The menu offers music/effects sliders, a calmer camera,
  control reminders, and a return to the current checkpoint.
- **Movement:** 120 ms of late-jump forgiveness, a 160 ms jump buffer with takeoff
  on the landing tick, responsive ground acceleration, more useful air steering,
  thin-platform collision checks, and a camera that stays outside planets.
- **Controller:** standard gamepads use the left stick / D-pad to move, A to jump,
  X to spin, B to ground-pound, right stick for the camera, and Start to pause.
  In the kart, RT is gas, LT is brake, and A while steering drifts. Keyboard and
  touch controls remain available. Connect a controller and press a button to
  make it available to the browser; hardware mappings vary by browser/device.
- **Sound:** sampled grass/stone footsteps, layered impacts and movement cues,
  a softer layered engine, independently mixed effects and music, and a score
  that changes arrangement at musical bar boundaries. Only about 50 KB of CC0
  recordings are downloaded; the instruments and room reverb are generated.

## A living little world

The meadow has birds that peck, perch and take wing, and squirrels that forage,
nibble acorns, twitch their tails and scurry away when Mirio approaches. These
are original articulated 3D animals, with shared geometry and instanced parts.
Nearby birdsong, rustling leaves and a quiet breeze complete the meadow. Meeting
both species fills in the pause menu's little field guide and earns a Tierfreund
badge at the end. The wildlife is harmless.

Seven optional little guardians live in clear patches away from the main path:
five **Mooskrabbler** with glossy sprout shells and two hopping **Mondkiesel**.
They patrol, visibly wind up a short attack, then recover and return home. A jump
onto their head or a ground pound defeats them; spinning stuns them, and a second
spin after releasing the first finishes the encounter. A defeat restores one
heart. New checkpoints also restore health. Fainting returns Mirio to the last
checkpoint, while already defeated guardians stay defeated until a new run.

Three giant spring blossoms are optional toys. Walk or land on their centres to
bounce high, or ground-pound them for an extra lift. Trying all three earns the
Blütenflieger badge. These additions reuse the existing gem total and score rules.

The scenery now has sculpted, softly shaded tree crowns, separate wood and fruit
materials, detailed bark and cut wood, composed fern and flowering shrub beds,
lakeside reeds, falling petals and soft cloud wisps. Decorative batches are
horizon-culled and reduced on slower devices. Miro's original images, sampled
textures, character, rocket, and floor construction remain unchanged.

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
| `js/wildlife.js`, `js/wildlife-models.js` | Reactive birds and squirrels, shared articulated geometry, discovery and culling |
| `js/enemies.js`, `js/enemy-rules.js` | Original optional guardians, safe placements, readable attacks and renderer-independent rules |
| `js/garden.js`, `js/scenery.js` | Spring blossoms; batched plants, petals and cloud wisps |
| `js/adventure.js` | Optional ring-trail rules, gates, badges and magnet effect |
| `js/environment-art.js` | Original seamless environment textures and gem reflection maps; no child artwork |
| `js/art.js`, `js/materials.js` | Canvas helpers (crop, sticker border, filled face, scribble textures) and the shared toon and outline materials |
| `js/player.js`, `js/camera.js`, `js/input.js`, `js/audio.js` | Mirio's movement and animation, the camera rig, keyboard/mouse/touch, WebAudio sound and an original adaptive sixteen-bar score and CC0 foley |
three.js r186 comes from jsDelivr through the import map in `index.html`:
`three` and `three/addons/` point at `three@0.186.0`, pinned, with sha384
integrity hashes of the npm tarball's files (checked byte-identical against the
registry's `dist.integrity`). Browsers without import-map integrity support skip
the check. To upgrade, change the version in both URLs and recompute the hashes.

That is the game's only request outside its own folder: no fonts, no
analytics, no cookies. It does send every player's IP address to jsDelivr, which
is how every CDN request works. `localStorage` keeps audio levels, mute, the reduced-motion preference, and
the last name entered for the high score list. The optional foley files load
from this same folder, with synthesized fallback effects if they cannot load.

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

- `npm install && npm test` (the same pinned three.js, from npm): ring-trail rules, controller/input cleanup, camera clearance, buffered jumps, and physics (walking
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
- `node tests/mirio-polish-e2e.mjs` covers the pause menu, frozen timers,
  controller pause/resume, ring trails and magnet rewards, replay reset,
  checkpoint rescue, settings and phone layout. It uses the same server and
  `PLAYWRIGHT` / `BASE_URL` environment variables as the main browser suite.

- `node tests/mirio-living-e2e.mjs` checks spring launches, wildlife discoveries
  and reactions, enemy stomps/contact/spin combat, health restoration, pause and
  replay resets, and browser/shader errors. It uses the same server and variables.

- `node tests/mirio-audio-e2e.mjs` verifies all eleven sample decodes, mixer
  persistence, pause/resume cleanup, every soundtrack arrangement and sound
  effect, and unavailable-storage/offline fallback. Use `BROWSER=webkit` to run
  the same checks with Safari's audio engine. It accepts `PLAYWRIGHT` and
  `BASE_URL` like the other browser suites.

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

## Artwork and sound provenance

Miro's source images in `img/`, drawing-derived texture sampling in `art.js`,
character model in `mirio-model.js`, and rocket/floor construction in `props.js`
are preserved. Their private artwork license still applies. New environment
surfaces are original procedural textures, generated locally at startup without
additional downloads. All code remains MIT-licensed.

The soundtrack is an original sixteen-bar composition with exploration, moon,
boss, race and victory arrangements. The small foley library is CC0 by Kenney;
see [audio/CREDITS.md](audio/CREDITS.md) for the exact source mapping and bundled
license notices. No copyrighted game music or characters were added. Keep the
world, names, collectables and visual identity Mirio's own when extending it.
