# Mirio

> This repository is the game's home. <https://goodvantage.ch/mirio/> runs
> a copy of it, updated from here.
>
> Mirio is made with AI. The figure and the drawings are Miro's. Mirio is a
> free, non-commercial experiment.

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
with every bend and straightens it when the stick is let go. A quick tap —
Space, the jump button or, on touch, the left half of the screen — hops the
kart; a barrel roll off the ramp gives a boost. The
camera sits behind the direction of travel, so steering turns the world. Boost pads, a ramp over a gap, Miro's floor blocks as obstacles, 77
glitter stones, red-white kerbs you cannot fall past (hit head-on they bounce
the kart off, touched at an angle it scrapes along), and a rubber-banded rival
so a child usually wins, narrowly. About 40 s on full gas; the camera swings
round with the kart and widens when it goes fast.

## Adventures from Sternenhof

The start screen (Miro's drawing, the logo and the top 5 of the Planetenreise
list) opens into **Sternenhof**, a little home planet under a starry sky with
nebulae and two far planets (`js/hub-world.js`, rules in `js/hub-rules.js`).
Mirio runs round it exactly as on the Planetenreise's planets. Sandy paths run
like a star from the spawn to the pads, past a farmhouse with a star on its
roof, a pond, trees and fireflies. Each pad has its journey's name floating
above it and a beam of light up to that journey's planet: a meadow planet with
Miro's rocket, a cloud planet with a letter, a flower planet, a golden planet
with notes, a star in a soap bubble. A small moon, covered in Miro's floor
drawing, hangs ahead and to the right of the spawn; a spring flower under it
hops Mirio up, and the race waits round the moon's underside, under a planet
with a checkered ring. A spring on the moon hops him home; the spring he lands
on waits until he steps off it. Step onto a pad and Mirio is flung up the beam
into the journey; the pad you stand at also shows its name large at the
bottom. Coming back, Mirio lands beside the pad he left from, and that pad
waits until he steps away. Completed journeys get a gold star by their name.
Every journey is open from the start; pause and results return to the
Sternenhof, replay restarts the same journey. No timer and no score here.
Pause provides help and separate time boards without leaving the current run.

| Level | What you play | Main controls |
| --- | --- | --- |
| **Planetenreise** | The original journey: meadow, ring lake, rocket to the moon, boss fight, kart race to the Zielplanet | Platformer and kart controls |
| **Sternenrennen** | Three laps round the Zielplanet against Finster-Mirio: ramp, dash panels and blocks | ↑ gas, ↓ brake, ← → steer, Space/↑-button/left-tap hops; controller RT/LT/A |
| **Wolkenpost** | Fly through golden rings past floating islands, dodge balloons and throw three parcels to the islands' catchers | WASD/arrows/stick steer; Space/A roll; Shift/X throw at a catcher, turbo elsewhere |
| **Blütenpfad** | One run through courtyard, tree house, glass house and cellar garden to a flower tower; three lantern seeds wait up high on the way | A/D or ←/→/stick move; Space/A jump; Shift/X air spin |
| **Klangkugel** | Grow a garden ramp, wake a cuckoo machine and ride a comet orbit across three pinball tables | ←/A and →/D or LB/RB operate separate flippers; hold/release Space/controller A to launch, hold during play for both flippers; Shift/X nudges |
| **Seifenstern** | Tilt floating paths beneath a soap bubble; balance over rainbow ribbons, inflate a foam bridge and reach the towel | WASD/arrows/stick tilt; hold Space/A/◎ to level and brake, or inflate the marked soap basin |
| **Vulkanreise** | Miro's second world: a rocket from the tiny Startstern down to the hilly Festland, Damai the pug through desert and forest, a log ride down the river and over the waterfall, Glutzahn's crater | Platformer controls, steer the log left and right; stomp tired Glutzahn in three stages |

Flight and garden levels have a three-count start, checkpoint recoveries,
keyboard/controller/touch controls and no game-over screen. Recovery adds a
small, explicitly shown time adjustment. The timer pauses with the game.
Gold, silver and bronze medals reward replaying; finishing always earns a badge.
The new modes use the unchanged drawing-derived Mirio model. Their scenery is
original procedural geometry. The menu logo and gameplay thumbnail provenance
are documented in `assets/README.md`.

## The journeys

- **Wolkenpost:** a close camera follows the plane along a line of golden
  rings. Near each of the three islands the flight slows; steer at its
  catcher and throw with Shift / X / ✦. A bird brings a miss back to retry.
  Remaining cargo reaches the post office at the end.
- **Blütenpfad:** one side-on run from left to right: Blütenhof, Baumhaus,
  Glashaus and Kellergarten, with a creek to jump between each, and a flower
  tower to the Blütentor at the end. Each garden has a climb (petal stairs,
  vine stairs, a spring flower) to a lantern seed up high; the three lanterns
  at the foot of the tower light up for the seeds found. Seeds are a bonus:
  the Blütentor is always open.
- **Klangkugel:** gravity drives the ball; movement keys operate the flippers,
  never steer it. A charged side plunger launches into three themed tables.
  Notes grow a raised vine ramp, lower clock targets beside a timed cuckoo
  scoop, and illuminate a lunar orbit. These shots earn notes and ball saves;
  three notes also open the direct bell lift. Single-flipper catches allow
  release-and-flip aiming; holding both remains forgiving. Linked targets
  extend the ball saver. A cuckoo returns drains (+2 seconds), preserving
  discoveries. Tilted cabinets have distinct scenery, painted playfields,
  impact sounds, lights and trails. Reduced motion quiets decoration while
  retaining readable moving mechanisms. Touch flippers work simultaneously.
- **Vulkanreise:** built from Miro's second set of drawings, in the style of
  the Planetenreise (`js/volcano-level.js`, `js/volcano-run.js`,
  `js/volcano-creatures.js`, `js/volcano-land.js`, `js/damai.js`, the river in
  `js/river-rules.js` and `js/river-scene.js`, fight rules in
  `js/glutzahn-rules.js`). It starts on the Startstern, a tiny planet; Miro's
  rocket flies down to the Festland, a planet so big that one height function
  on top of it makes its landscape: a valley over dunes and wooded hills,
  walled in by sandstone mesas, cliffs and mountains that cannot be climbed.
  The same function drives the physics (`planet.heightAt` in `js/world.js`)
  and the ground mesh, and everything placed on the Festland stands on it. In
  the desert Damai the pug joins and runs ahead, waiting and barking when
  Mirio falls behind. The forest is dense and tall, its crowns over the path,
  with ferns, bushes, mushrooms, fallen trunks and light through the leaves;
  trunks and crowns between the camera and Mirio open up. Three ravines are
  real chasms crossed on floating platforms (a fall costs +2 seconds), spring
  flowers bounce Mirio up to gems, Grummel walk (stomp or spin them) and
  Schnappblumen bite when you come close (stomp them from above). The
  Glutbeere on a ledge turns Mirio into Miro's big Mirio (a hit then only
  shrinks him back): the game and its clock stand still while the camera
  swings round to his front, he grows in flickering steps with a flash, and
  the camera swings back (`js/grow-cutscene.js`; with reduced motion he just
  scales up). At the river Mirio and Damai jump on a log: steer left
  and right past rocks, branches and whirlpools (a bump costs +1 second), over
  the waterfall, everything goes dark, and Mirio wakes in the Glutkessel.
  Glutzahn breathes fire (announced, dodge sideways or jump) or spins a
  Stachelkreisel across the crater (jump it); after either he is out of
  breath, the moment to jump on his head. Every two hits the fight moves up a
  stage and he gets faster: stage two brings Grummel, stage three Grummel and
  Schnappblumen. Six hits free the crystal. The creatures keep Miro's shapes,
  colours and faces with a few details of our own: Mirio's curl badge on the
  cap, no spots on the plant, a purple shell and an orange crest on Glutzahn,
  an orange spiky top.
- **Seifenstern:** a bath-time world of soap paths over the bath water, soap
  bubbles drifting past. The stick tilts the whole world and gravity rolls the
  bubble; a steady camera watches from low behind. Broad bends reconnect with
  narrow banked ribbons at safe checkpoint islands. Stop on the soap basin and
  hold the brake to inflate a lasting foam bridge. Reduced motion calms the
  visible tilt.

All scenery is procedural. Original drawings, derived models and floor textures
are unchanged by these additions. Changed courses have separate records:
`discovery-v3` (Planetenreise), `classic-v3` (single-track Sternenrennen),
`branches-v3` (Sternenwege), `pinball-v4` (Klangkugel), and `journey-v3`
(Wolkenpost/Blütenpfad). Seifenstern keeps `playground-v2`. Earlier records and tokens
remain stored under their original keys and directories.

## The hidden Wunderwiese

Blue feathers behind the meadow's far orchard lead to a star gate. Approach
on foot and use Shift / X / the context button. It takes Mirio to a separate
low-gravity planet; the normal rocket, moon, boss and single-track finale remain.

The planet restores the Wiesensummer plane (F / Y / context button), wind-powered
flower bridge, boat rescue, kite towing, squirrel-guided picnic and treehouse,
ring trails with a gem magnet, gentle creatures, birds and squirrels. Southern
cloud platforms and a guardian provide an optional airborne route. Ground paths
and checkpoints remain available. Earned souvenirs, a spring flower and bird
chorus also live here.

A chequered gate beyond the clouds starts **Sternenwege**, the branching kart
race: three separate roads, windmills, rolling fruit, cloud springs, rival
routing and split times. Pause or results can return to
Wunderwiese with its activities, checkpoint and adventure record token intact.
Replay stays in Sternenwege; result browsing never advances the adventure clock.
The return gate rejoins the meadow and restores its earlier checkpoint.

## Polished adventure edition

The child's drawing remains the centre of the game. The surrounding world now
has seamless grass and bark textures, softer terrain lighting, fuller orchard
and fir trees, butterflies, contact shadows, reflective gems and a moving lake
surface with caustics. The original floor scribble is still the moon, blocks,
stepping stones and race road.

- **Race display:** the race shows speed and progress as well as place and time.
- **Pause:** Esc, the pause button, or controller Start freezes the whole game,
  including race countdowns and sound. Hidden tabs pause automatically. Resume
  explicitly when ready. The menu offers music/effects sliders, a calmer camera,
  control reminders, and a return to the current checkpoint.
- **Movement:** 120 ms of late-jump forgiveness, a 160 ms jump buffer with takeoff
  on the landing tick, responsive ground acceleration, more useful air steering,
  thin-platform collision checks, and a camera that stays outside planets.
- **Controller:** standard gamepads use the left stick / D-pad to move, A to jump,
  X to spin, B to ground-pound, right stick for the camera, and Start to pause.
  In the kart, RT is gas, LT is brake, and A hops. Keyboard and
  touch controls remain available. Connect a controller and press a button to
  make it available to the browser; hardware mappings vary by browser/device.
- **Sound:** sampled grass/stone footsteps, layered impacts and movement cues,
  a softer layered engine, independently mixed effects and music, and a score
  that changes arrangement at musical bar boundaries. Only about 50 KB of CC0
  recordings are downloaded; the instruments and room reverb are generated.

## A living little world

A few birds peck, perch and take wing when Mirio comes close. They are original
articulated 3D animals, with shared geometry and instanced parts. Nearby
birdsong, rustling leaves and a quiet breeze complete the meadow. Meeting a bird
earns a Tierfreund badge at the end. The wildlife is harmless.

Three little guardians live in quiet corners away from the path: two
**Mooskrabbler** on the far meadow and a hopping **Mondkiesel** on the moon.
They patrol, visibly wind up a short attack, then recover and return home. A
jump onto their head or a ground pound defeats them; spinning stuns them. A
defeat restores one heart; the hearts show only in the boss fight or once a
guardian has taken one. Two squirrels forage and scurry off when Mirio comes
close.

The moon hides one optional **Mondspur**: six glowing rings. Touch the first to
start an 18-second run; finish in order for a badge and a 12-second
Glitzermagnet that pulls in nearby gems, without changing the gem total.

On the far side of the start planet a little turquoise biplane, the
**Wiesensummer**, waits to be found. F, controller Y or its on-screen button
boards it; it flies low round the planet (never above 4.5 metres) and lands
itself in a clear, dry spot when you get out.

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
| `js/kart-physics.js` | How Mirio's kart drives, without a screen: heading, speed, slides, kerbs |
| `api/scores.php`, `api/scores.inc` | The public high score list: tokens, points, name rules, the JSON file |
| `js/scene.js` | Meshes and decoration: sky with twinkling and shooting stars, triplanar-textured planets with rim light, hills, trees and props with pen outlines, instanced grass tufts, flowers and pebbles, the arena, the goal star, particles; `world.update()` animates it all |
| `js/water.js` | The ring lake: waves, fresnel, sparkles, foam along both shores and round every stepping stone, one draw call |
| `js/quality.js` | Renderer colour settings, and a governor that lowers the resolution (then drops the extras) to hold the frame rate on phones |
| `js/mirio-model.js`, `js/props.js` | The 3D models built from the drawings: Mirio; the rocket and the checkpoint flag |
| `js/wildlife.js`, `js/wildlife-models.js` | Reactive birds, shared articulated geometry, discovery and culling |
| `js/garden.js`, `js/scenery.js` | Spring blossoms; batched plants, petals and cloud wisps |
| `js/chapters.js`, `js/time-records.js` | Level metadata, medals and storage-safe personal best times |
| `js/discovery-level.js`, `js/discovery-gates.js`, `js/bonus-playground.js` | Hidden planet data, deliberate travel gates and restored optional toys |
| `js/sky-flight.js`, `js/sky-flight-rules.js` | Wolkenpost scene and deterministic flight course rules |
| `js/ribbon-run.js`, `js/ribbon-rules.js` | Blütenpfad diorama and deterministic side-scroll physics |
| `js/marble-run.js`, `js/marble-rules.js` | Pinball tables, flipper/ball physics and musical targets |
| `js/tilt-run.js`, `js/tilt-rules.js`, `js/tilt-course.js` | Seifenstern scene, tilt physics and shared branching course |
| `js/menu-navigation.js` | Controller focus, dialogs and settings navigation |
| `api/times.php`, `api/times.inc` | Separate public time boards for every level |
| `js/biplane-model.js` | The little plane Wolkenpost flies |
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
the last nickname and a personal best time for each level. The optional foley files load
from this same folder, with synthesized fallback effects if they cannot load.

## Per-level time boards

Each of `adventure`, `kart`, `sky` and `ribbon` has its own best-time list.
Lowest time wins; gems and finishing place remain achievements, not score
multipliers. The full adventure measures the complete journey; standalone kart
measures only the race. Personal bests remain on the device without a server,
with an in-memory fallback when storage is unavailable. Public submission is
optional and only happens when the player submits a nickname.

- `GET api/times.php?course=journey-v3&level=sky` returns the selected list and a signed token.
  `POST {level,token,name,timeMs,penaltyMs?}` to the same course URL submits an integer total duration.
  Optional integer `penaltyMs` defaults to zero and must be between zero and
  `timeMs`. Active play (`timeMs - penaltyMs`) must meet the level minimum and
  fit within the token's age plus 15 seconds of clock/network slack. This allows
  repeated safety recoveries without dropping their penalties from the ranked
  total. Total duration is capped at 24 hours. Tokens are scoped to a level,
  expire after 24 hours and can only be used once. Duration bounds, token-age
  checks and a rate limit discourage casual spam. Browser games cannot
  prove a client-reported time; this is a friendly leaderboard, not competitive
  anti-cheat. Equal times keep submission order.
- Nicknames inherit the existing 16-character limit and German/English word
  filters. Entries are rendered with `textContent`. Public fields are only
  rank, nickname, elapsed milliseconds and date.
- `times.json` and `times.lock` live outside the web root in `data/mirio/` next
  to the deployed web root. The best 100 per level are retained; the UI shows
  the top ten. Corrupt data is preserved and fails closed. File updates are
  atomic and protected by an exclusive lock. `MIRIO_TIMES_DIR` overrides the
  location; `MIRIO_SCORES_DIR` remains a compatible test override.
- The legacy `api/scores.php`, its point rules and `scores.json` are preserved
  for existing data/clients, but the current game uses only the new time boards.
- Each supported revision lives under `courses/<revision>/` inside the time
  data directory, with an independent token secret. `playground-v2` and requests
  without `course` retain their original boards. Unknown versions are rejected.
- `localStorage` keeps unchanged courses under `mirio-time-best-v2:` and revised
  courses under `mirio-time-best:<revision>:`. Earlier entries are preserved.
  A failed public submission does not erase the personal best. Slow/stale
  network responses cannot replace another level's active run or result.

## Tests

- `npm install && npm test` (the same pinned three.js, from npm): controller/input cleanup, camera clearance, buffered jumps, and physics (walking
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
  the gas and slides when braking into a turn;
  kerbs bounce or scrape; the race lasts 35–60 s on full gas).
- `tests/mirio-e2e.mjs` plays every station of the level in real browsers,
  teleporting between them through the `?test` hook: desktop keyboard in
  Chromium (walk, jump, ground pound, a triple jump timed frame by frame
  inside the page, checkpoint flag, falling in the lake and respawning,
  standing on a stone, the rocket countdown and flight, the moon jump, the
  floor blocks, the locked crystal, the boss fight to the end, the cutscene into
  the kart, standing without gas, driving, braking to a stop and hopping, the finish, the win screen, a refused and an
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
  controller pause/resume, replay reset,
  checkpoint rescue, settings and phone layout. It uses the same server and
  `PLAYWRIGHT` / `BASE_URL` environment variables as the main browser suite.

- `node tests/mirio-living-e2e.mjs` checks spring launches, the birds and their
  reactions, pause and replay resets, and browser/shader errors. It uses the same server and variables.

- `node tests/mirio-audio-e2e.mjs` verifies all eleven sample decodes, mixer
  persistence, pause/resume cleanup, every soundtrack arrangement and sound
  effect, and unavailable-storage/offline fallback. Use `BROWSER=webkit` to run
  the same checks with Safari's audio engine. It accepts `PLAYWRIGHT` and
  `BASE_URL` like the other browser suites.

- `node tests/mirio-chapters-e2e.mjs` covers the logo/menu, deferred help and
  time boards, sky keyboard/gamepad/touch controls, countdown/pause/rescue,
  garden jumps/spin/finish, replay and mode switching, standalone kart,
  per-level records, transient server retry and portrait/landscape layout.

- `node tests/mirio-kart-entry-e2e.mjs` drives the standalone kart through its
  finish, checks the exact result clock, submits to a local time board, replays
  and switches back to the garden and original adventure. It permits public
  form submissions only to a loopback test server.

- `php tests/mirio-times.php` checks scoped tokens, duration/penalty bounds,
  honest balloon/recovery penalties, ties, isolation, one-use submission,
  concurrent writes, names, rate limits and corrupt storage.

- `php tests/mirio-scores.php` checks the high score rules: points,
  names, tokens, replays, the rate limit, ordering, the top 100, and that a
  damaged file is left alone.

`?test` adds `window.__mirio` (state snapshot, layout, teleport, raceSkip and
chapterSeek). It is absent without the parameter. Focused level suites use
`?test&menu` to enter levels directly; the hub suite follows normal navigation.

The playground update adds:

- `tests/mirio-bonus-native-e2e.mjs`: ordinary discovery walk, plane tasks,
  walking picnic loop and preserved recovery state.
- `tests/mirio-bonus-devices-e2e.mjs`: touch/controller flight, cloud route,
  guardian landing, gates and recovery.
- `tests/mirio-bonus-regressions-e2e.mjs`: revisited flag recovery and flying
  gem collection.
- `tests/mirio-plane-ownership-e2e.mjs`: independent meadow/bonus planes,
  keyboard/controller boarding, rescue and portrait touch prompts.
- `tests/mirio-discovery-race-e2e.mjs`: race warp, replay, return, original
  finale, separate records and preserved adventure token.
- `tests/mirio-kart-camera-e2e.mjs`: reduced-motion camera for both tracks.
- `tests/mirio-kart-routes-native-e2e.mjs`: complete keyboard branching race.
- `tests/mirio-hub-e2e.mjs`: normal start, pad launches (the race over the
  springs on the moon), returns, replay, completion markers and
  keyboard/controller/touch hub controls.
- `tests/mirio-hub.test.mjs` (unit): six pads kept apart, a short run from the
  spawn, the moon in view, the right name shown on either body, a launch only
  from standing on a pad, the return spot beside the pad that waits, and the
  springs hopping to the moon and back.
- `tests/mirio-marble-e2e.mjs`: complete keyboard pinball adventure,
  drain recovery, controller/touch flippers, plunger, replay and isolated records.
- `tests/mirio-tilt-e2e.mjs`: balance-course routes, foam bridge, recovery,
  controller, touch, pause, replay and reduced motion.
- `tests/mirio-menu-e2e.mjs`: controller settings, independent help/time tabs
  and phone dialogs through normal hub navigation.
- `tests/mirio-browser-smoke-e2e.mjs`: every mode through normal navigation,
  movement, paused clocks and returns; supports `BROWSER=webkit`.
- `tests/mirio-kart-native-e2e.mjs`: a complete race through ordinary keyboard
  input, including a mid-race hop.
- `tests/mirio-volcano.test.mjs` (unit) and `tests/mirio-volcano-e2e.mjs`:
  Glutzahn's fight rules and stages, the level's layout, the Festland's hills
  (a walkable path, impassable edges, nothing floating or sunk), and in the browser the
  rocket to the Festland, Damai, a ravine fall, a spring, the Glutbeere, the
  log ride over the waterfall and the fight starting.
- `tests/mirio-damai.test.mjs`, `tests/mirio-river.test.mjs`: Damai's guide
  rules and the river ride's course and steering.
- `tests/mirio-sky-post-e2e.mjs`: complete keyboard flight, all recipients,
  arrival and replay.
- `tests/mirio-sky-post-devices-e2e.mjs`: genuine touch events, controller
  delivery, missed-parcel return and pause.
- `tests/mirio-garden-e2e.mjs`: the whole garden with the keyboard: every
  climb and seed, the creeks, the tower and replay.
- `tests/mirio-garden-controls-e2e.mjs`: touch, controller, air spin, recovery,
  pause and reduced motion.
- `tests/mirio-course-records-e2e.mjs`: isolated PHP server verifies new boards,
  legacy preservation and cross-course token rejection. Accepts `PHP`.

Browser suites accept `PLAYWRIGHT` and `BASE_URL`; new suites also accept
`CHROMIUM` for an explicit Chromium executable. Full keyboard runs use normal
input; the kart geometry suite also advances production physics directly.
The cross-browser smoke accepts `LEVELS=tilt` for a focused run and
`TIMEOUT_MS` for slower software renderers.

## Running it

Any web server with PHP 8 serves it; without PHP the game runs and only the
public time boards are unavailable; device bests still work. Locally:

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
