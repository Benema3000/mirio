// Mirio: boots the game, runs the loop and applies the rules that involve
// more than one thing: collecting, checkpoints, the lake, the rocket, winning.

import * as THREE from 'three';
import { loadArt } from './art.js';
import { Adventure } from './adventure.js';
import { SpringGarden } from './garden.js';
import { MeadowPlayground } from './meadow-playground.js';
import { MoonPlayground } from './moon-playground.js';
import { HubWorld } from './hub-world.js';
import { EnemySystem } from './enemies.js';
import { Wildlife } from './wildlife.js';
import { Biplane, chooseBiplaneHome } from './biplane.js';
import { SkyFlight } from './sky-flight.js';
import { RibbonRun } from './ribbon-run.js';
import { MarbleRun } from './marble-run.js';
import { TiltRun } from './tilt-run.js';
import { CHAPTERS, medalFor, MEDALS } from './chapters.js';
import { MenuNavigation } from './menu-navigation.js';
import { formatRunTime, readPersonalBest, savePersonalBest } from './time-records.js';
import { COURSE_VERSION } from './course-version.js';
import { Sound } from './audio.js';
import { Boss } from './boss.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { KartRace } from './kart.js';
import { driftLevel } from './kart-physics.js';
import { collidersFor, flightPoint, makeLevel } from './level.js';
import { MAX_HEARTS, Player } from './player.js';
import { QualityGovernor, tuneRenderer } from './quality.js';
import { buildScene, Particles, placeOn } from './scene.js';
import { partialTurn, surfacePoint, tangentDir } from './world.js';

const STEP = 1 / 120;
// Slow motion on the winning hit, and how fast it wears off (per second).
const SLOWMO = 0.3;
const SLOWMO_RECOVER = 0.6;
// The cutscene after the boss: the crystal breaks free and flies ahead.
const CUTSCENE_RISE = 1.0;
const CUTSCENE_FLY = 1.8;
const CUTSCENE_KART = 2.8;
const MAX_FRAME = 1 / 15;
const TEST_MODE = new URLSearchParams(location.search).has('test');
// Focused level suites keep their old navigation fixture; real play starts in the hub.
const TEST_MENU = TEST_MODE && new URLSearchParams(location.search).has('menu');
const CHAPTER_TYPES = Object.freeze({sky: SkyFlight, ribbon: RibbonRun, marble: MarbleRun, tilt: TiltRun});
const SINGLE_ACTION_CLASS = 'chapter-single-action';
const CHAPTER_MODE_CLASSES = [...Object.keys(CHAPTER_TYPES).map(id => `chapter-${id}`), SINGLE_ACTION_CLASS];

const BIT_RADIUS = 1.3;
const FLAG_RADIUS = 2.4;
const COUNTDOWN = ['3', '2', '1', 'Start!'];
const COUNTDOWN_STEP = 0.8;
const FLIGHT_TIME = 6;
const CONFETTI = [0xffe14d, 0xff6fb5, 0x5fe3ff, 0x8dff6a, 0xc58bff, 0xffffff];
const SPLASH = [0x7fd0ff, 0xffffff, 0x3aa7e8];

const HINTS = {
  startKeys: 'Laufen: Pfeiltasten oder WASD · Springen: Leertaste · Drehen: Shift · Stampfen: C · Flugzeug: F',
  startTouch: 'Links wischen: laufen · ↑ springen · ⟳ drehen · ⤓ stampfen',
  lake: 'Spring von Stein zu Stein. Nicht ins Wasser fallen!',
  longJump: 'Tipp: Springen gedrückt halten, dann springt Mirio weiter.',
  plateau: 'Die Rakete wartet oben auf dem Plateau!',
  rocket: 'Lauf in die Rakete!',
  moon: 'Auf dem Mond springst du viel höher. Klettere hinauf zum Kristall!',
  boss: 'Wenn er schwindlig ist: spring ihm auf die Mütze!',
  bossWon: 'Hinterher! Ab ins Kart!',
  faint: 'Nochmal! Spring über die Schockwelle.',
  creatures: 'Die kleinen Wächter kannst du von oben besiegen. Drehen macht sie schwindlig!',
  spring: 'Boing! Stampfe auf eine grosse Blüte, dann federt sie dich noch höher.',
  raceKeys: 'Gas: ↑ · Bremse: ↓ · Lenken: ← → · Driften: beim Lenken Leertaste halten, loslassen: Turbo!',
  raceTouch: 'Links lenken · Gas · Zum Driften ↑ halten · Loslassen: Turbo!',
};

const $ = (id) => document.getElementById(id);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const playerMid = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const SCORES_URL = `api/times.php?course=${COURSE_VERSION}`;
const NAME_KEY = 'mirio-name';
const SCORES_DOWN = 'Die Bestenliste ist gerade nicht erreichbar.';
const TITLE_SCORES = 5;

async function fetchScores(level) {
  const body = await (await fetch(`${SCORES_URL}&level=${encodeURIComponent(level)}`, { cache: 'no-store' })).json();
  if (!body.ok || body.course !== COURSE_VERSION) throw new Error(body.message ?? SCORES_DOWN);
  return body;
}

/** Fills an <ol> with the top list; `mine` is the rank to highlight. */
function showBoard(list, top, mine = null) {
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Noch keine Einträge. Du kannst die Erste oder der Erste sein!';
    list.replaceChildren(li);
    return;
  }
  list.replaceChildren(...top.map((entry) => {
    const li = document.createElement('li');
    li.value = entry.rank;
    li.classList.toggle('mine', entry.rank === mine);
    const row = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.name;
    const points = document.createElement('span');
    points.textContent = formatRunTime(entry.timeMs);
    row.append(name, points);
    li.append(row);
    return li;
  }));
}

function isTouchDevice() {
  return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

function createRenderer(canvas) {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
}

const smooth = (t) => t * t * (3 - 2 * t);

async function main() {
  const startButton = $('start');
  const renderer = createRenderer($('game'));
  if (!renderer) {
    $('status').textContent = 'Dein Browser kann leider kein 3D (WebGL). Probier es mit einem aktuellen Chrome, Safari oder Firefox.';
    return;
  }
  tuneRenderer(renderer);

  let art;
  try {
    art = await loadArt('img/');
  } catch (err) {
    $('status').textContent = `Das Spiel konnte nicht laden: ${err.message}`;
    return;
  }
  // The title shows Miro's drawing itself: face filled, white border.
  document.querySelector('#title .hero').src = art.mirioSticker.toDataURL();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);

  const level = makeLevel();
  level.biplaneHome = chooseBiplaneHome(level);
  const [welt, mond] = level.planets;
  const colliders = collidersFor(level);
  const world = buildScene(scene, level, art);
  const garden = new SpringGarden(scene, level, art);
  const enemies = new EnemySystem(scene, level, art);
  const wildlife = new Wildlife(scene, level, art);
  // Trades resolution for frame rate on phones; see quality.js.
  const governor = new QualityGovernor(renderer, { onChange: (l) => { world.setQuality(l); enemies.setQuality(l); wildlife.setQuality(l); } });
  const particles = new Particles(scene, art.sparkle);
  const player = new Player(scene, art, level.planets, colliders);
  const biplane = new Biplane(scene, level, art, colliders);
  const meadow = new MeadowPlayground(scene, level, colliders);
  const moon = new MoonPlayground(scene, level, colliders);
  const rig = new CameraRig(camera, level.planets);
  const sound = new Sound();
  const input = new Input({
    surface: $('game'),
    stick: $('stick'),
    knob: $('knob'),
    jumpButton: $('btn-jump'),
    spinButton: $('btn-spin'),
    poundButton: $('btn-pound'),
    gasButton: $('btn-gas'),
    brakeButton: $('btn-brake'),
  });

  const adventure = new Adventure(scene, level);
  const chapterGames = new Map();
  let hub = null;
  let selectedLevel = 'adventure';
  let chapterGame = null;
  let chapterCountdown = 0;
  let countdownNumber = -1;
  let finishedRun = null;
  let state = 'title';
  let paused = false;
  let finishDelay = 0;
  let elapsed = 0;
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { const saved = localStorage.getItem('mirio-motion'); if (saved !== null) reducedMotion = saved === 'quiet'; } catch {}
  document.body.classList.toggle('reduced-motion', reducedMotion);
  const stats = { bits: 0, time: 0, splashes: 0, pounds: 0, bestJump: 0, raceTime: 0, creatures: 0 };
  const shown = new Set();
  const friends = new Set();
  let hintTimer = 0;
  // Camera shake after a ground pound or the boss's slam, decays by itself.
  let shake = 0;
  const startForward = new THREE.Vector3(1, 0, 0);
  const north = new THREE.Vector3(0, 1, 0);

  const touch = () => document.body.classList.add('touch');
  if (isTouchDevice()) touch();
  input.onTouch = touch;

  // ---- The rocket ----------------------------------------------------------
  const rocket = { ...world.rocket, phase: 'pad', t: 0, step: -1, collider: null };
  const flight = level.rocket.flight;
  const launchUp = level.rocket.dir;
  const padBase = surfacePoint(welt, launchUp, level.rocket.height);

  function rocketToPad() {
    placeOn(rocket.group, welt, launchUp, level.rocket.height, north);
    rocket.flame.visible = false;
    rocket.phase = 'pad';
    rocket.t = 0;
    rocket.step = -1;
    const list = colliders(mond);
    if (rocket.collider) list.splice(list.indexOf(rocket.collider), 1);
    rocket.collider = null;
  }

  function nearRocket() {
    const rel = tmp.subVectors(player.body.pos, padBase);
    const along = rel.dot(launchUp);
    const radial = rel.addScaledVector(launchUp, -along).length();
    return { along, radial };
  }

  const qFly = new THREE.Quaternion();
  const qLand = new THREE.Quaternion();
  const flightUp = new THREE.Vector3();
  const flightSide = new THREE.Vector3().crossVectors(launchUp, flight.landing).normalize();

  function updateRocket(dt) {
    const r = rocket;
    if (r.phase === 'countdown') {
      r.t += dt;
      const step = Math.floor(r.t / COUNTDOWN_STEP);
      if (step !== r.step && step < COUNTDOWN.length) {
        r.step = step;
        bigToast(COUNTDOWN[step]);
        sound.play(step === COUNTDOWN.length - 1 ? 'liftoff' : 'beep');
      }
      // Rumble on the pad, flame from "1" on.
      placeOn(r.group, welt, launchUp, level.rocket.height, north);
      r.group.position.addScaledVector(tmp.randomDirection(), 0.04 * Math.min(1, r.t));
      r.flame.visible = r.t > COUNTDOWN_STEP * 2;
      r.flame.scale.y = 0.6 + Math.random() * 0.4;
      particles.burst(padBase, { count: 1, color: 0xcfc6e6, speed: 2, size: 1.4, life: 0.9 });
      if (r.t >= COUNTDOWN_STEP * COUNTDOWN.length) {
        r.phase = 'flight';
        r.t = 0;
      }
      return;
    }

    if (r.phase !== 'flight') return;
    r.t = Math.min(1, r.t + dt / FLIGHT_TIME);
    const s = smooth(r.t);
    const pos = flightPoint(level, s, r.group.position);
    const ahead = flightPoint(level, Math.min(1, s + 0.01), tmp2).sub(pos);
    if (ahead.lengthSq() > 1e-8) ahead.normalize();
    else ahead.copy(flight.landing).negate();
    // Nose along the curve, then swing round to come down tail first.
    qFly.setFromUnitVectors(Y, ahead);
    qLand.setFromUnitVectors(Y, flight.landing);
    r.group.quaternion.copy(qFly).slerp(qLand, smooth(THREE.MathUtils.clamp((s - 0.7) / 0.25, 0, 1)));
    r.flame.visible = true;
    r.flame.scale.y = 0.8 + Math.random() * 0.5;
    particles.burst(pos, { count: 2, color: [0xffb640, 0xfff0a8, 0xff6f3a], speed: 1.5, size: 0.9, life: 0.7 });

    partialTurn(launchUp, flight.landing, s, flightSide, qFly);
    flightUp.copy(launchUp).applyQuaternion(qFly);
    player.ride(tmp.copy(pos).addScaledVector(flightUp, 1.5), flightUp, ahead);

    if (r.t < 1) return;
    r.phase = 'landed';
    r.flame.visible = false;
    placeOn(r.group, mond, flight.landing, 0, level.moonSpawn.dir);
    r.collider = { kind: 'cyl', base: surfacePoint(mond, flight.landing, -0.3), axis: flight.landing.clone(), radius: r.radius + 0.5, height: r.height }; // + fins
    colliders(mond).push(r.collider);
    particles.burst(surfacePoint(mond, flight.landing, 0.3), { count: 24, color: 0xcfc6e6, speed: 5, size: 1.2, life: 0.8 });
    const away = tmp.subVectors(level.moonSpawn.dir, flight.landing);
    player.leaveRocket({ planet: mond, dir: level.moonSpawn.dir.clone() }, away);
    state = 'play';
    rig.distance = playDistance();
  }

  // ---- The boss -----------------------------------------------------------------
  const ar = level.arena;
  const arenaCenter = surfacePoint(ar.planet, ar.dir, ar.top);
  const boss = new Boss(scene, art, { planet: ar.planet, center: arenaCenter, up: ar.dir.clone(), radius: ar.radius }, colliders);
  const fight = { on: false };

  function onArena() {
    if (player.body.planet !== ar.planet || player.state !== 'play') return false;
    const rel = tmp.subVectors(player.body.pos, arenaCenter);
    const along = rel.dot(ar.dir);
    return Math.abs(along) < 0.3 && rel.addScaledVector(ar.dir, -along).length() < ar.radius;
  }

  // ---- The kart race -----------------------------------------------------------
  const race = new KartRace(scene, art, { planets: level.planets, start: level.course.start, finish: level.course.finish });
  const totalBits = () => selectedLevel === 'kart' ? race.bitCount : world.bits.length + race.bitCount;
  const cut = { t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), called: false };
  let timeScale = 1;
  let result = null;

  function startCutscene() {
    state = 'cutscene';
    input.enabled = false;
    player.win();
    cut.t = 0;
    cut.called = false;
    cut.from.copy(world.goal.group.position);
    const { start } = level.course;
    cut.to.copy(start.pos).addScaledVector(start.forward, 30).addScaledVector(start.up, -12);
  }

  function updateCutscene(dt) {
    cut.t += dt;
    const goal = world.goal.group;
    const { start } = level.course;
    if (cut.t < CUTSCENE_RISE) {
      // The freed crystal spins up out of its popped bubble.
      goal.position.copy(cut.from).addScaledVector(start.up, smooth(cut.t / CUTSCENE_RISE) * 1.5);
      world.goal.crystal.rotation.y += dt * 12;
    } else if (cut.t < CUTSCENE_RISE + CUTSCENE_FLY) {
      // ...and shoots off towards the Zielplanet, where the race will end.
      const k = smooth((cut.t - CUTSCENE_RISE) / CUTSCENE_FLY);
      goal.position.copy(cut.from).addScaledVector(start.up, 1.5).lerp(cut.to, k);
      particles.burst(goal.position, { count: 2, color: [0x8ff3ff, 0xffffff], speed: 1.5, size: 0.7, life: 0.6 });
      if (!cut.called && k > 0.3) {
        cut.called = true;
        toast('Hinterher!');
        hint(HINTS.bossWon, 4);
      }
    } else {
      goal.visible = false;
    }
    rig.follow(start.forward, 2.5, dt);
    if (cut.t < CUTSCENE_KART) return;

    state = 'race';
    input.enabled = true;
    document.body.classList.add('racing');
    player.board();
    race.begin({ pos: player.body.pos.clone(), up: player.body.up.clone() });
    $('race-hud').hidden = false;
  }

  function handleRace(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'countdown':
          bigToast(String(ev.n));
          sound.play('beep');
          if (ev.n === 3) hint(document.body.classList.contains('touch') ? HINTS.raceTouch : HINTS.raceKeys, 10);
          break;
        case 'go':
          bigToast('Los!');
          sound.play('go');
          break;
        case 'hop':
        case 'race-bounce':
          sound.play('jump');
          break;
        case 'drift-charge':
          sound.play(ev.n === 2 ? 'driftOrange' : 'driftBlue');
          break;
        case 'route':
          toast(ev.name);
          break;
        case 'route-catch':
          hint('↓ Hier geht’s weiter! Mit Drift-Turbo geht’s oben lang.', 5);
          break;
        case 'race-split':
          toast(`✧ ${ev.n} · ${formatRunTime(Math.round(ev.time * 1000))}`);
          sound.play('ring');
          break;
        case 'boost':
        case 'turbo':
          sound.play('boost');
          break;
        case 'drift':
        case 'slide':
          sound.play('skid');
          break;
        case 'bump':
          sound.play('bump');
          break;
        case 'bit':
          stats.bits += 1;
          sound.play('bit');
          particles.burst(ev.pos, { count: 6, color: CONFETTI, speed: 3, size: 0.45, life: 0.4 });
          break;
        case 'finish':
          result = ev;
          state = 'raceEnd';
          sound.play('star');
          bigToast(ev.place === 1 ? 'Gewonnen!' : 'Ziel!');
          finishDelay = 2.6;
          break;
        default:
      }
    }
  }

  function endFight() {
    fight.on = false;
    $('boss-bar').hidden = true;
    $('hearts').hidden = true;
  }

  // ---- Reset -----------------------------------------------------------------
  function resetGame() {
    document.body.classList.remove('racing', 'flying');
    biplane.reset(player);
    adventure.reset();
    garden.reset();
    meadow.reset();
    moon.reset();
    enemies.reset();
    wildlife.reset();
    finishDelay = 0;
    player.reset({ planet: welt, dir: level.spawn.dir.clone() }, startForward);
    for (const bit of world.bits) {
      bit.taken = false;
      bit.mesh.visible = true;
    }
    for (const f of world.flags) {
      f.reached = false;
      f.raise = 0;
      f.flag.position.y = f.lowY;
    }
    rocketToPad();
    world.goal.group.visible = true;
    world.goal.group.position.copy(world.goal.center);
    world.goal.bubble.visible = true;
    boss.reset();
    endFight();
    race.reset();
    $('race-hud').hidden = true;
    timeScale = 1;
    result = null;
    stats.bits = 0;
    stats.time = 0;
    stats.splashes = 0;
    stats.pounds = 0;
    stats.bestJump = 0;
    stats.raceTime = 0;
    stats.creatures = 0;
    shown.clear();
    friends.clear();
    rig.snap(player, startForward);
    renderHud(true);
  }

  // ---- HUD ---------------------------------------------------------------
  /** In the Sternenhof, the name of the gate Mirio stands at, big enough to read on a phone. */
  function showGateName(name) {
    $('gate-name').hidden = !name;
    document.body.classList.toggle('at-gate', Boolean(name));
    if (name && $('gate-name-text').textContent !== name) $('gate-name-text').textContent = name;
  }

  const hud = { bits: -1, hearts: -1, hp: -1 };
  function renderHud(force = false) {
    if (state === 'hub') {
      const visit = hub.snapshot();
      for (const id of ['hearts', 'ride-action', 'plane-hud', 'race-hud', 'boss-bar', 'trail-hud', 'magnet-hud', 'chapter-hud']) $(id).hidden = true;
      showGateName(visit.near?.label ?? null);
      return;
    }
    showGateName(null);
    if (chapterGame && (state === 'chapter' || state === 'win')) {
      const run = chapterGame.snapshot();
      $('hearts').hidden = true;
      $('bits').textContent = selectedLevel === 'sky' ? `✉ ${run.deliveries} / ${run.totalDeliveries}`
        : selectedLevel === 'tilt' ? `⚑ ${run.checkpoint} / ${run.totalCheckpoints}`
        : selectedLevel === 'marble' ? `♪ ${run.notes} / ${run.totalNotes}` : `✧ ${run.seeds} / ${run.totalSeeds}`;
      for (const id of ['ride-action', 'plane-hud', 'race-hud', 'boss-bar', 'trail-hud', 'magnet-hud']) $(id).hidden = true;
      $('chapter-hud').hidden = state !== 'chapter';
      $('chapter-timer').textContent = formatRunTime(Math.round(run.time * 1000));
      const best = readPersonalBest(selectedLevel);
      $('chapter-best').textContent = best ? `BESTE ZEIT\n${formatRunTime(best)}` : 'DEIN ERSTER LAUF';
      $('chapter-progress').value = run.progress;
      const cooldown = run.cooldown ?? 0;
      const touchKeys = document.body.classList.contains('touch');
      const actionKey = input.gamepadConnected ? 'X' : touchKeys ? CHAPTERS[selectedLevel].actionIcon : 'Shift';
      const jumpKey = input.gamepadConnected ? 'A' : touchKeys ? CHAPTERS[selectedLevel].jumpIcon : 'Leertaste';
      let ability = run.actionHint ? `${actionKey} ${run.actionHint.replace('↻ ', '')}` : `${actionKey}: Luftwirbel`;
      if (selectedLevel === 'sky') {
        ability = run.parcelInFlight ? '✉ Unterwegs …' : run.deliveryTarget ? `${run.deliveryTarget.icon} → ${run.deliveryTarget.ready ? `${actionKey}: werfen` : 'Zum Korb'}`
          : run.chimeNear ? `♪ ${jumpKey}: Rolle` : run.boost > 0 ? '✦ Rückenwind!'
          : cooldown > 0 ? `✦ ${Math.ceil(cooldown)} s · ${jumpKey}: Rolle` : `${actionKey}: Turbo · ${jumpKey}: Rolle`;
      } else if (selectedLevel === 'marble') {
        ability = run.notesNear && !run.noteReady ? `${jumpKey} halten: bremsen`
          : run.noteReady ? `${actionKey}: Glocke wecken` : `${jumpKey}: Bremse · ${actionKey}: Klangstoss`;
      } else if (selectedLevel === 'tilt') {
        ability = run.basinNear && !run.bridgeOpen ? `${jumpKey} halten: Schaumsteg ${Math.round(run.bridgeCharge * 100)}%`
          : `${jumpKey} halten: bremsen`;
      }
      $('chapter-ability').textContent = chapterCountdown > 0 ? 'Bereit?' : ability;
      $('btn-spin').setAttribute('aria-label', selectedLevel === 'sky' ? (run.deliveryTarget ? 'Paket werfen' : 'Turbo') : (run.actionHint || CHAPTERS[selectedLevel].actionLabel));
      return;
    }
    $('chapter-hud').hidden = true;
    $('hearts').hidden = state !== 'play';
    if (force || hud.bits !== stats.bits) {
      hud.bits = stats.bits;
      $('bits').textContent = `${stats.bits} / ${totalBits()}`;
    }
    if (force || hud.hearts !== player.hearts) {
      hud.hearts = player.hearts;
      [...$('hearts').children].forEach((el, i) => el.classList.toggle('lost', i >= player.hearts));
    }
    if (!$('race-hud').hidden) {
      $('race-progress').value = race.progress;
      $('race-speed').textContent = Math.round(Math.abs(race.player.v) * 3.6);
      const boost = race.player.boost > 0 || race.player.turbo > 0;
      const charge = driftLevel(race.player);
      const routeHint = race.snapshot().routeHint;
      $('race-route').hidden = !routeHint;
      $('race-route').textContent = routeHint;
      $('race-technique').hidden = !boost && !race.player.drift;
      $('race-technique').textContent = boost ? '✦ TURBO!' : charge === 2 ? 'SUPER-TURBO · Loslassen!' : charge === 1 ? 'TURBO BEREIT · Loslassen!' : 'DRIFT · Weiter halten …';
      $('race-technique').dataset.charge = boost ? 'boost' : String(charge);
      $('race-place').textContent = `${race.place}.`;
      $('race-time').textContent = formatTime(race.state === 'race' ? stats.raceTime : result?.time ?? 0);
    }
    const riding = biplane.mounted && state === 'play';
    document.body.classList.toggle('flying', riding);
    if (hud.riding !== riding) {
      hud.riding = riding;
      $('btn-jump').setAttribute('aria-label', riding ? 'Steigen' : 'Springen');
      $('btn-pound').textContent = riding ? '↓' : '⤓';
      $('btn-pound').setAttribute('aria-label', riding ? 'Sinken' : 'Stampfen');
      $('btn-spin').textContent = riding ? '✦' : '⟳';
      $('btn-spin').setAttribute('aria-label', riding ? 'Propeller-Turbo' : 'Drehen');
    }
    $('ride-action').hidden = state !== 'play' || fight.on || (!riding && !biplane.canBoard(player));
    $('ride-label').textContent = riding ? (biplane.landing ? 'Landung abbrechen' : 'Landen & aussteigen') : 'Wiesensummer fliegen';
    $('ride-key').textContent = input.gamepadConnected ? 'Y' : 'F';
    $('plane-hud').hidden = !riding;
    if (riding) {
      $('plane-altitude').textContent = `${biplane.flight.altitude.toFixed(1)} m`;
      $('plane-height').value = biplane.flight.altitude;
      $('plane-speed').textContent = `${Math.round(biplane.flight.speed * 3.6)} km/h`;
      $('plane-boost').textContent = biplane.flight.boost > 0 ? '✦ Rückenwind!' : biplane.flight.cooldown > 0 ? `Turbo in ${Math.ceil(biplane.flight.cooldown)} s` : '✦ Turbo bereit';
      $('plane-hud').classList.toggle('boosting', biplane.flight.boost > 0);
    }
    const trail = adventure.activeTrail;
    $('trail-hud').hidden = !trail || state !== 'play';
    if (trail) {
      $('trail-label').textContent = `${trail.name} · ${trail.run.next} / ${trail.run.count}`;
      $('trail-time').textContent = `${Math.ceil(trail.run.time)} s`;
      $('trail-progress').value = trail.run.next;
    }
    $('magnet-hud').hidden = adventure.magnet <= 0 || state !== 'play' || riding;
    $('magnet-time').textContent = `${Math.ceil(adventure.magnet)} s`;
    if (force || hud.hp !== boss.hp) {
      hud.hp = boss.hp;
      [...document.querySelectorAll('.boss-hp i')].forEach((el, i) => el.classList.toggle('gone', i >= boss.hp));
    }
  }

  // Surface-relative compass: follows the journey even around a planet.
  let toastTimeout = 0;
  function toast(text, big = false) {
    const el = $('toast');
    el.textContent = text;
    el.classList.toggle('big', big);
    el.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), big ? 700 : 2400);
  }
  const bigToast = (text) => toast(text, true);

  function hint(text, seconds = 6) {
    $('hint').textContent = text;
    $('hint').classList.toggle('show', Boolean(text));
    hintTimer = seconds;
  }
  function hintOnce(key, seconds = 7) {
    if (shown.has(key)) return;
    shown.add(key);
    hint(HINTS[key], seconds);
  }

  // ---- Rules ---------------------------------------------------------------
  const bossEvents = [];
  const natureEvents = [];
  function simulate(h) {
    // Keep the return islands usable after a fall from the boss arena.
    natureEvents.push(...moon.step(h, player, {active: state === 'play'}));
    if (biplane.mounted) natureEvents.push(...biplane.step(h, player));
    else {
      natureEvents.push(...garden.step(h, player, state === 'play' && !fight.on));
      player.step(h);
    }
    natureEvents.push(...meadow.step(h, player, biplane, {active: state === 'play' && !fight.on}));
    natureEvents.push(...enemies.step(h, player, {active: state === 'play' && !fight.on}));
    if (state === 'play' && !biplane.mounted && !fight.on && !boss.defeated && onArena()) {
      fight.on = true;
      boss.start();
      $('boss-bar').hidden = false;
      $('hearts').hidden = false;
      renderHud(true);
    }
    if (state === 'play') bossEvents.push(...boss.update(h, player));
    if (state !== 'play' || !['play', 'biplane'].includes(player.state)) return;

    if (biplane.mounted) playerMid.copy(biplane.flight.pos).addScaledVector(biplane.flight.up, .65);
    else playerMid.copy(player.body.pos).addScaledVector(player.body.up, 1);

    for (const bit of world.bits) {
      if (bit.taken || bit.mesh.position.distanceTo(playerMid) > (adventure.magnet > 0 ? 3.8 : BIT_RADIUS)) continue;
      bit.taken = true;
      bit.mesh.visible = false;
      stats.bits += 1;
      sound.play('bit');
      particles.burst(bit.mesh.position, { count: 6, color: bit.color, speed: 3, size: 0.45, life: 0.4 });
    }

    // Flying can collect existing gems; checkpoints and story boarding still
    // belong to Mirio on foot, so the plane cannot trigger the rocket or boss.
    if (biplane.mounted) return;

    for (const [i, f] of world.flags.entries()) {
      if (f.reached || f.center.distanceTo(player.body.pos) > FLAG_RADIUS) continue;
      f.reached = true;
      player.checkpoint = { planet: f.planet, dir: f.dir.clone() };
      player.hearts = MAX_HEARTS;
      sound.play('flag');
      toast('Checkpoint!');
      particles.burst(tmp.copy(f.center).addScaledVector(f.dir, 3), { count: 14, color: CONFETTI, speed: 4, size: 0.5 });
      if (i === 0) hintOnce('lake');
      if (i === 2) hintOnce('plateau');
    }

    if (rocket.phase === 'pad' && player.body.planet === welt) {
      const { along, radial } = nearRocket();
      if (radial < 9 && along > -0.5) hintOnce('rocket', 5);
      if (radial < rocket.radius + 0.9 && along > -0.5 && along < 3) {
        rocket.phase = 'countdown';
        rocket.t = 0;
        state = 'rocket';
        player.board();
        hint('', 0);
        rig.distance = playDistance() + 6;
        sound.play('board');
      }
    }

  }

  function handleEvents() {
    for (const ev of player.events) {
      switch (ev.type) {
        case 'jump':
          stats.bestJump = Math.max(stats.bestJump, ev.level);
          sound.play(['jump', 'jump2', 'triple'][ev.level - 1]);
          if (ev.level === 3) particles.burst(player.body.pos, { count: 12, color: CONFETTI, speed: 4, size: 0.5, life: 0.6 });
          break;
        case 'skid':
          sound.play('skid');
          particles.burst(player.body.pos, { count: 6, color: 0xd9d2c3, speed: 2, size: 0.7, life: 0.4 });
          break;
        case 'poundStart':
          sound.play('poundStart');
          break;
        case 'pound':
          stats.pounds += 1;
          sound.play('pound');
          shake = 0.35;
          particles.burst(ev.pos, { count: 18, color: 0xe8e2d2, speed: 7, size: 0.9, life: 0.5 });
          break;
        case 'hurt':
          sound.play('hurt');
          document.body.classList.add('ouch');
          setTimeout(() => document.body.classList.remove('ouch'), 250);
          break;
        case 'faint':
          // Both meadow encounters and the boss return to the last safe flag.
          const wasBoss = fight.on;
          boss.reset();
          endFight();
          toast('Nochmal!');
          hint(wasBoss ? HINTS.faint : 'Der Checkpoint passt auf dich auf. Spring auf die kleinen Wächter oder drehe dich!', 6);
          break;
        case 'spin':
          sound.play('spin');
          particles.burst(playerMid.copy(player.body.pos).addScaledVector(player.body.up, 1), { count: 8, color: 0xfff3b0, speed: 5, size: 0.35, life: 0.35 });
          break;
        case 'land':
          if (ev.speed > 12) sound.play('land');
          break;
        case 'splash':
          stats.splashes += 1;
          sound.play('splash');
          particles.burst(player.body.pos, { count: 26, color: SPLASH, speed: 6, size: 0.7, life: 0.8, along: player.body.up, gravity: tmp.copy(player.body.up).multiplyScalar(-14) });
          break;
        case 'respawn':
          rig.snap(player, player.facing);
          sound.play('respawn');
          if (stats.splashes > 0) hintOnce('longJump');
          break;
        case 'arrive':
          sound.play('arrive');
          toast(ev.planet.name);
          if (ev.planet === mond) hintOnce('moon', 8);
          break;
        default:
      }
    }
    player.events.length = 0;

    for (const ev of natureEvents) {
      sound.play(ev.type);
      if (ev.type.startsWith('meadow')) {
        sound.play(ev.type === 'meadowSpring' ? 'spring' : ev.type === 'meadowKiteGate' ? 'ring' : 'flag');
        const messages = {
          meadowWind: '✣ Die Blütenbrücke wächst!', meadowTow: '⚓ Zum Steg!',
          meadowBoat: 'Das Boot ist zu Hause!', meadowKiteHook: '◇ Durch die Drachenringe!',
          meadowKite: '◇ Dein Drachen bleibt am Himmel!', meadowLookout: '❀ Willkommen im Baumhaus!',
          meadowSpringOpen: '❀ Das Eichhörnchen zeigt die Sprungblüte!', meadowPicnic: '♡ Picknick im Baumhaus!',
        };
        if (messages[ev.type]) hint(messages[ev.type], 5);
        particles.burst(ev.pos, {count: 10, color: [ev.color, 0xffefa5], speed: 3, size: .3, life: .6});
      }
      if (ev.type === 'planeBoard') {
        toast('Wiesensummer!');
        const keys = input.gamepadConnected ? 'Stick lenken · A steigen · B sinken · X Turbo · Y landen' : document.body.classList.contains('touch') ? 'Links lenken · ↑ steigen · ↓ sinken · ✦ Turbo · Tippen zum Landen' : 'WASD lenken · Leertaste steigen · C sinken · Shift Turbo · F landen';
        hint(keys, 12);
      }
      if (ev.type === 'planeLanding') hint('Sanft landen … F / Y oder die Landetaste bricht ab.', 5);
      if (ev.type === 'planeCancelLanding') hint('Weiter geht der Rundflug!', 4);
      if (ev.type === 'planeNoLanding') hint('Such dir eine freie Wiese zum Aussteigen. Über Wasser und Bäumen fliegst du weiter.', 7);
      if (ev.type === 'planeExit') { toast('Sanft gelandet!'); hint('Dein Wiesensummer wartet hier auf dich. F / Y: wieder einsteigen.', 6); }
      if (ev.type === 'planeBoost') particles.burst(ev.pos, {count: 10, color: [0xffe4a4, 0xc1f6f4, 0xffffff], speed: 2, size: .25, life: .45});
      if (ev.type === 'planeBump') particles.burst(ev.pos, {count: 5, color: [0xffdd95, 0xffffff], speed: 2, size: .25, life: .35});
      if (ev.type === 'enemyNotice') hintOnce('creatures', 8);
      if (ev.type === 'enemyStun') {
        particles.burst(ev.pos, {count: 8, color: [0xffde81, 0xffffff], speed: 2, size: .3, life: .6});
      }
      if (ev.type === 'enemyDefeat') {
        stats.creatures++;
        particles.burst(ev.pos, {count: 18, color: [ev.color, 0xffe3a0, 0xffffff], speed: 4, size: .45, life: .75});
        if (stats.creatures === 1) toast('Gut gemacht!');
        // A defeated guardian leaves a little kindness: one heart back.
        player.hearts = Math.min(MAX_HEARTS, player.hearts + 1);
      }
      if (ev.type === 'spring') {
        if (ev.kind === 'moonGuardian') hint('☾ Der Mondwächter trägt dich hinauf!', 5);
        else hintOnce('spring', 7);
        particles.burst(ev.pos, {count: 12, color: [ev.color, 0xffefa5], speed: 4, size: .3, life: .65});
        if (ev.strong) toast('Blütensprung!');
      }
    }
    natureEvents.length = 0;

    for (const ev of bossEvents) {
      switch (ev.type) {
        case 'spring':
          sound.play('spring');
          hint('↑ Die Mondtrommel federt zur Mütze!', 4);
          particles.burst(ev.pos, {count: 10, color: [ev.color, 0xffefa5], speed: 3, size: .3, life: .6});
          break;
        case 'roar':
          sound.play('roar');
          toast('Finster-Mirio!');
          hintOnce('boss', 7);
          break;
        case 'jump':
          sound.play('bossJump');
          break;
        case 'slam':
          sound.play('slam');
          shake = 0.6;
          particles.burst(ev.pos, { count: 22, color: [0xc58bff, 0xffffff], speed: 8, size: 1.0, life: 0.6 });
          break;
        case 'hit':
          sound.play('bossHit');
          particles.burst(ev.pos, { count: 20, color: CONFETTI, speed: 7, size: 0.7, life: 0.7 });
          if (ev.hp === 0) {
            timeScale = SLOWMO;
            shake = 0.8;
          }
          break;
        case 'defeated':
          sound.play('bossDown');
          endFight();
          world.goal.bubble.visible = false;
          particles.burst(world.goal.group.position, { count: 30, color: CONFETTI, speed: 8, size: 0.8, life: 1.0 });
          toast('Geschafft!');
          startCutscene();
          break;
        default:
      }
    }
    bossEvents.length = 0;
  }

  // ---- Separate time boards, with local bests even when the server is offline.
  let runToken = null;
  let runGeneration = 0;
  let boardRequest = 0;
  let resultBoardRevision = 0;

  function newRun() {
    runToken = null;
    finishedRun = null;
    const generation = ++runGeneration, levelId = selectedLevel;
    fetchScores(levelId).then(b => {
      if (generation !== runGeneration || selectedLevel !== levelId) return;
      runToken = b.token;
      if (state === 'win' && finishedRun?.level === levelId) {
        $('score-form').hidden = false;
        $('score-send').disabled = false;
        scoreStatus('');
      }
    }).catch(() => {});
  }

  function updatePersonalBests() {
    for (const el of document.querySelectorAll('[data-best]')) {
      const best = readPersonalBest(el.dataset.best);
      el.textContent = best ? `✦ ${formatRunTime(best)}` : '';
    }
  }

  function selectLevel(id) {
    if (!Object.hasOwn(CHAPTERS, id)) return;
    selectedLevel = id;
    for (const button of document.querySelectorAll('[data-level]')) {
      button.classList.toggle('selected', button.dataset.level === id);
      button.setAttribute('aria-pressed', String(button.dataset.level === id));
    }
    showHelp(id);
    showScores(id);
    updatePersonalBests();
  }

  // Browsing another outing's help or board must not change the active run.
  function showHelp(id) {
    const chapter = id === 'hub' ? {
      short: 'Sternenhof', description: 'Laufe in ein Tor. Deine Reisen lassen den Sternenhof wachsen.',
      keys: 'WASD / Pfeile laufen · Leertaste springen · Shift drehen · C stampfen',
      touch: 'Links laufen · ↑ springen · ⟳ drehen · ⤓ stampfen',
      controller: 'Linker Stick laufen · A springen · X drehen · B stampfen',
    } : Object.hasOwn(CHAPTERS, id) ? CHAPTERS[id] : null;
    if (!chapter) return;
    $('help-title').textContent = `Hilfe · ${chapter.short}`;
    $('chapter-description').textContent = chapter.description;
    $('chapter-keys').textContent = `${chapter.keys} · Esc: Pause`;
    $('chapter-touch').textContent = chapter.touch;
    $('chapter-controller').textContent = `Controller: ${chapter.controller} · Start: Pause`;
    for (const button of document.querySelectorAll('[data-help-level]')) button.setAttribute('aria-pressed', String(button.dataset.helpLevel === id));
  }

  function showScores(id) {
    if (!Object.hasOwn(CHAPTERS, id)) return;
    const chapter = CHAPTERS[id];
    $('title-scores-heading').textContent = `Bestzeiten · ${chapter.short}`;
    $('title-board').replaceChildren();
    $('title-board-status').textContent = 'Bestzeiten werden geladen …';
    for (const button of document.querySelectorAll('[data-scores-level]')) button.setAttribute('aria-pressed', String(button.dataset.scoresLevel === id));
    const request = ++boardRequest;
    fetchScores(id).then(body => {
      if (request !== boardRequest) return;
      showBoard($('title-board'), body.top.slice(0, TITLE_SCORES));
      $('title-board-status').textContent = 'Nur die Zeit zählt. Jede Reise hat ihre eigene Liste.';
    }).catch(() => {
      if (request === boardRequest) $('title-board-status').textContent = 'Öffentliche Zeiten gerade offline. Deine Bestzeit bleibt auf diesem Gerät.';
    });
  }

  /** The start screen's top 5 of the main journey; hidden while the list is out of reach. */
  function showTitleTop() {
    fetchScores('adventure').then((body) => {
      showBoard($('title-top-board'), body.top.slice(0, TITLE_SCORES));
      $('title-top').hidden = false;
    }).catch(() => { $('title-top').hidden = true; });
  }

  function scoreStatus(text) { $('score-status').textContent = text; }

  function offerHighScore() {
    const run = chapterGame?.snapshot();
    finishedRun = Object.freeze({
      level: selectedLevel,
      timeMs: Math.max(1, Math.round((run ? run.time : selectedLevel === 'kart' ? result.time : stats.time) * 1000)),
      penaltyMs: Math.round((run?.penalty ?? run?.penalties ?? 0) * 1000),
    });
    const personal = savePersonalBest(finishedRun.level, finishedRun.timeMs);
    $('win-time').textContent = formatRunTime(finishedRun.timeMs);
    $('personal-best').textContent = personal.isNew ? (personal.previous ? 'Neue persönliche Bestzeit!' : 'Deine erste Bestzeit. Abenteuer geschafft!') : `Deine Bestzeit: ${formatRunTime(personal.best)}`;
    const medal = document.createElement('span');
    medal.textContent = MEDALS[medalFor(finishedRun.level, finishedRun.timeMs)];
    $('win-badges').prepend(medal);
    updatePersonalBests();
    $('win-board').replaceChildren();
    scoreStatus(runToken ? '' : 'Deine Zeit ist auf diesem Gerät gespeichert. Die öffentliche Liste ist gerade offline.');
    $('score-form').hidden = !runToken;
    $('score-send').disabled = false;
    try { $('score-name').value = localStorage.getItem(NAME_KEY) ?? ''; } catch {}
    const completed = finishedRun, revision = ++resultBoardRevision;
    fetchScores(completed.level).then(b => {
      if (finishedRun === completed && state === 'win' && revision === resultBoardRevision) showBoard($('win-board'), b.top);
    }).catch(() => {});
  }

  async function sendHighScore(e) {
    e.preventDefault();
    const name = $('score-name').value.trim();
    if (!name || !runToken || !finishedRun || state !== 'win') return;
    const completed = finishedRun, generation = runGeneration, token = runToken;
    ++resultBoardRevision;
    $('score-send').disabled = true;
    scoreStatus('Wird eingetragen …');
    try {
      const res = await fetch(SCORES_URL, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...completed, token, name}),
      });
      const body = await res.json();
      if (generation !== runGeneration || completed !== finishedRun) return;
      if (!body.ok) {
        scoreStatus(body.message);
        if (body.error === 'name' || body.error === 'rate' || body.error === 'unavailable' || res.status >= 500) $('score-send').disabled = false;
        else $('score-form').hidden = true;
        return;
      }
      runToken = null;
      $('score-form').hidden = true;
      try { localStorage.setItem(NAME_KEY, name); } catch {}
      scoreStatus(body.rank ? `Platz ${body.rank} in der Bestenliste!` : 'Deine Zeit ist eingetragen!');
      showBoard($('win-board'), body.top, body.rank);
    } catch {
      if (generation !== runGeneration || completed !== finishedRun) return;
      scoreStatus(SCORES_DOWN);
      $('score-send').disabled = false;
    }
  }

  function win() {
    if (state !== 'raceEnd') return;
    state = 'win';
    input.enabled = false;
    hint('', 0);
    $('race-hud').hidden = true;
    $('win-title').textContent = 'Dein Kristall!';
    const place = result.place === 1 ? '1. Platz' : `${result.place}. Platz`;
    $('win-stats').innerHTML = (selectedLevel === 'kart' ? [
      `Kartrennen: <b>${place}</b> in ${formatTime(result.time)}`,
      `Glitzersteine: <b>${stats.bits}</b> von ${race.bitCount}`,
    ] : [
      `Kartrennen: <b>${place}</b> in ${formatTime(result.time)}`,
      `Glitzersteine: <b>${stats.bits}</b> von ${totalBits()}`,
      `Ins Wasser gefallen: <b>${stats.splashes}</b>&times;`,
      `Dreifachsprung: <b>${stats.bestJump === 3 ? 'geschafft' : 'noch nicht'}</b>`,
      `Zeit: <b>${formatTime(stats.time)}</b>`,
    ]).join('<br>');
    $('win-extra').textContent = stats.bits === totalBits()
      ? 'Alle Glitzersteine gefunden. Wow!'
      : `${totalBits() - stats.bits} Glitzersteine sind noch versteckt.`;
    $('win-badges').replaceChildren(...[
      ...[...adventure.badges].map(id => id === 'meadow' ? '✦ Wiesenspuren' : '✦ Mondspuren'),
      ...(stats.bestJump === 3 ? ['↟ Sprungkünstler'] : []),
      ...(stats.bits >= 50 ? ['◇ Glitzersammler'] : []),
      ...(stats.creatures >= 3 ? ['✦ Wiesenwächter'] : []),
      ...(friends.size === 2 ? ['♡ Tierfreund'] : []),
      ...(garden.used.size === 3 ? ['❀ Blütenflieger'] : []),
      ...(biplane.distance >= 150 ? ['✈ Wiesenpilot'] : []),
      ...(meadow.snapshot().celebration ? ['♡ Windgartenfreund'] : []),
      ...(race.snapshot().bestDrift === 2 ? ['✦ Driftsonne'] : []),
      ...(race.snapshot().routes.length === 3 ? ['↗ Wegefinder'] : []),
    ].map(text => { const badge = document.createElement('span'); badge.textContent = text; return badge; }));
    offerHighScore();
    $('win').classList.remove('hidden');
  }

  function finishChapter() {
    if (state !== 'chapter') return;
    state = 'win';
    input.enabled = false;
    input.reset();
    sound.biplane(null);
    sound.play('star');
    sound.setScene('victory');
    hint('', 0);
    const run = chapterGame.snapshot(), chapter = CHAPTERS[selectedLevel];
    $('win-title').textContent = selectedLevel === 'sky' ? 'Post ist da!' : selectedLevel === 'marble' ? 'Die Trommel singt!'
      : selectedLevel === 'tilt' ? 'Weich gelandet!' : 'Der Blütenhof leuchtet!';
    $('win-stats').textContent = selectedLevel === 'sky' ? `✉ ${run.deliveries} Pakete · ♪ ${run.chimes} Glocken · ◇ ${run.collectibles} Ringe`
      : selectedLevel === 'tilt' ? `⚑ ${run.checkpoint} Inseln · ↗ ${run.shortcuts} Abkürzungen · ↺ ${run.recoveries} Landungen`
      : selectedLevel === 'marble' ? `♪ ${run.notes} Töne · ${run.bankTrips} Klangkurven · ${run.bumps} Kissenhüpfer`
      : `✧ ${run.seeds} Laternensamen · ◇ ${run.collectibles} Glitzersteine`;
    $('win-extra').textContent = selectedLevel === 'sky' && run.choir ? 'Der Wolkenwal singt für dich!' : 'Welchen Weg nimmst du nächstes Mal?';
    $('win-badges').replaceChildren();
    offerHighScore();
    $('win').classList.remove('hidden');
    renderHud(true);
    $('again').focus();
  }

  function handleChapterEvents(events) {
    for (const event of events ?? []) {
      if (event.type !== 'finish') sound.play(({foam: 'spring', note: 'flag', 'marble-bumper': 'bump', ring: 'ring', checkpoint: 'flag', spring: 'spring', boost: 'planeBoost', roll: 'spin', rescue: 'land', toss: 'spin', delivery: 'flag', 'parcel-return': 'land', chime: 'ring', choir: 'star', arrival: 'flag'})[event.type] ?? event.type);
      if (event.penalty > 0) hint(`${event.id?.startsWith('sky-balloon-') ? 'Ballon berührt' : 'Zurück am Checkpoint'} · +${event.penalty} s. Weiter geht’s!`, 4);
      else if (event.type === 'delivery') { toast(`✉ ${event.deliveries} / ${chapterGame.snapshot().totalDeliveries}`); hint(({garden: 'Blumenwind!', bakery: 'Warmer Rückenwind!', kite: 'Drachen voraus!'})[event.id] ?? 'Post ist da!', 4); }
      else if (event.type === 'parcel-return') hint('Der Vogel bringt dein Paket zurück.', 4);
      else if (event.type === 'choir') hint('Der Wolkenwal singt mit!', 5);
      else if (event.type === 'arrival') toast('Willkommen bei der Wolkenpost!');
      else if (event.type === 'note') toast(`♪ ${event.notes} / ${chapterGame.snapshot().totalNotes}`);
      else if (event.type === 'foam') hint('○ Der Schaumsteg ist bereit!', 5);
      else if (event.type === 'bit' && event.kind === 'seed') toast(`✧ ${event.seeds} / ${chapterGame.snapshot().totalSeeds}`);
      else if (event.type === 'spring' && event.kind === 'song') toast(event.dream === 'awake' ? '♪ ☀' : '♪ ☾');
      else if (event.type === 'checkpoint' && event.kind === 'gate') hint('✿ Zurück zum Blütenhof — hinauf!', 6);
      else if (event.type === 'checkpoint' && event.kind !== 'door') { toast('Checkpoint!'); hint('Hier wartet ein sicherer Platz auf dich.', 3); }
      else if (event.type === 'rescue') hint('Weich gelandet. Einfach nochmal hüpfen!', 4);
      else if (event.type === 'bump') hint('Hoppla! Alles gut — weiter geht’s.', 3);
    }
  }

  // ---- Animation of the world ------------------------------------------
  function animateWorld(dt, t) {
    for (const bit of world.bits) {
      if (bit.taken) continue;
      bit.mesh.rotation.y = t * 2 + bit.phase;
      bit.mesh.rotation.x = Math.sin(t + bit.phase) * 0.4;
    }
    for (const f of world.flags) {
      f.raise = Math.min(1, f.raise + (f.reached ? dt * 1.5 : 0));
      f.flag.position.y = THREE.MathUtils.lerp(f.lowY, f.highY, smooth(f.raise));
    }

    const goal = world.goal;
    goal.crystal.rotation.y = t * 0.8;
    goal.halo.scale.setScalar(6 + Math.sin(t * 3) * 0.6);
    particles.update(dt);

  }

  // ---- Screens -----------------------------------------------------------
  // Portrait phones see less to the sides: pull back and widen.
  const playDistance = () => (camera.aspect < 1 ? 12 : 10);
  const baseFov = () => (camera.aspect < 1 ? 72 : 60);
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = baseFov();
    if (state === 'play') rig.distance = playDistance();
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // Browsers allow fullscreen only inside a click, so the start button asks
  // for it. Safari on iPad needs the webkit prefix; iPhones have no fullscreen
  // for pages at all, and there the game simply stays in the window.
  function enterFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (!request) return;
    try {
      request.call(el)?.catch?.(() => {});
    } catch {
      // Refused (e.g. inside a frame without permission): play in the window.
    }
  }

  function startLevel() {
    paused = false;
    $('pause').classList.add('hidden');
    document.body.classList.remove('paused');
    sound.setPaused(false);
    enterFullscreen();
    sound.unlock();
    sound.startMusic();
    sound.engine(null);
    sound.biplane(null);
    sound.ambience({active: false});
    chapterGame = null;
    document.body.classList.remove('hub-mode', 'chapter-mode', ...CHAPTER_MODE_CLASSES);
    $('pause-menu').hidden = false;
    input.reset();
    resetGame();
    newRun();
    rig.distance = playDistance();
    state = 'play';
    input.enabled = true;
    $('title').classList.add('hidden');
    $('win').classList.add('hidden');
    document.body.classList.add('playing');
    if (Object.hasOwn(CHAPTER_TYPES, selectedLevel)) {
      if (!chapterGames.has(selectedLevel)) chapterGames.set(selectedLevel, new CHAPTER_TYPES[selectedLevel](art));
      chapterGame = chapterGames.get(selectedLevel);
      chapterGame.reset();
      chapterCountdown = 3;
      countdownNumber = -1;
      state = 'chapter';
      document.body.classList.add('chapter-mode', `chapter-${selectedLevel}`);
      const chapter = CHAPTERS[selectedLevel];
      document.body.classList.toggle(SINGLE_ACTION_CLASS, !chapter.actionIcon);
      $('btn-jump').textContent = chapter.jumpIcon;
      $('btn-jump').setAttribute('aria-label', chapter.jumpLabel);
      $('btn-spin').textContent = chapter.actionIcon;
      $('btn-spin').setAttribute('aria-label', chapter.actionLabel);
      hint(document.body.classList.contains('touch') ? chapter.touch : chapter.keys, 12);
      chapterGame.render(camera, 0, {reducedMotion});
    } else {
      $('btn-jump').textContent = '↑';
      $('btn-jump').setAttribute('aria-label', 'Springen');
      $('btn-spin').textContent = '⟳';
      $('btn-spin').setAttribute('aria-label', 'Drehen');
      camera.fov = baseFov();
      camera.updateProjectionMatrix();
      hint(document.body.classList.contains('touch') ? HINTS.startTouch : HINTS.startKeys, 8);
      if (selectedLevel === 'kart') {
        state = 'race';
        document.body.classList.add('racing');
        player.board();
        race.begin({pos: level.course.start.pos.clone(), up: level.course.start.up.clone()});
        const shot = race.introShot();
        camera.position.copy(shot.pos);
        camera.up.copy(shot.up);
        camera.lookAt(shot.look);
        $('race-hud').hidden = false;
        hint(document.body.classList.contains('touch') ? HINTS.raceTouch : HINTS.raceKeys, 10);
      }
    }
    renderHud(true);
  }

  function enterHub(lastLevel = null) {
    ++runGeneration;
    runToken = finishedRun = null;
    paused = false;
    chapterGame = null;
    input.enabled = false;
    input.reset();
    sound.unlock();
    sound.startMusic();
    sound.setPaused(false);
    sound.engine(null);
    sound.biplane(null);
    sound.stopVoices();
    sound.setScene('explore');
    resetGame();
    state = 'hub';
    hub ??= new HubWorld(art);
    hub.reset({completed: Object.keys(CHAPTERS).filter(id => readPersonalBest(id)), lastLevel});
    camera.fov = baseFov();
    camera.updateProjectionMatrix();
    document.body.classList.remove('paused', 'racing', 'flying', 'chapter-mode', ...CHAPTER_MODE_CLASSES);
    document.body.classList.add('playing', 'hub-mode');
    for (const id of ['title', 'win', 'pause']) $(id).classList.add('hidden');
    $('toast').classList.remove('show');
    $('pause-menu').hidden = true;
    $('btn-jump').textContent = '↑';
    $('btn-jump').setAttribute('aria-label', 'Springen');
    $('btn-spin').textContent = '⟳';
    $('btn-spin').setAttribute('aria-label', 'Drehen');
    const hubHint = input.gamepadConnected ? 'Linker Stick laufen · A springen · Laufe in ein Tor'
      : document.body.classList.contains('touch') ? 'Links laufen · ↑ springen · Laufe in ein Tor'
      : 'WASD / Pfeile laufen · Leertaste springen · Laufe in ein Tor';
    hint(hubHint, 9);
    hub.render(camera, 0, {reducedMotion});
    input.enabled = true;
    renderHud(true);
    $('game').focus();
  }

  function leaveLevel() {
    if (!TEST_MENU) { enterHub(selectedLevel); return; }
    ++runGeneration;
    runToken = finishedRun = null;
    paused = false;
    chapterGame = null;
    state = 'title';
    input.enabled = false;
    input.reset();
    sound.setPaused(false);
    sound.engine(null);
    sound.biplane(null);
    sound.ambience({active: false});
    sound.stopVoices();
    sound.setScene('explore');
    document.body.classList.remove('playing', 'paused', 'chapter-mode', ...CHAPTER_MODE_CLASSES);
    $('pause').classList.add('hidden');
    $('win').classList.add('hidden');
    $('title').classList.remove('hidden');
    $('toast').classList.remove('show');
    hint('', 0);
    resetGame();
    rig.distance = 16;
    camera.fov = baseFov();
    camera.updateProjectionMatrix();
    selectLevel(selectedLevel);
    showTitleTop();
    document.querySelector(`[data-level="${selectedLevel}"]`).focus();
  }

  function start() {
    enterFullscreen();
    if (TEST_MENU) startLevel();
    else enterHub();
  }
  startButton.addEventListener('click', start);
  $('again').addEventListener('click', startLevel);
  $('score-form').addEventListener('submit', sendHighScore);
  $('pause-menu').addEventListener('click', leaveLevel);
  $('win-menu').addEventListener('click', leaveLevel);
  for (const button of document.querySelectorAll('[data-level]')) button.addEventListener('click', () => {
    sound.play('click');
    selectLevel(button.dataset.level);
    if (!TEST_MENU) { $('quick-dialog').close(); startLevel(); }
  });
  if (TEST_MENU) $('start').before($('chapter-select'));
  const showQuick = () => { updatePersonalBests(); $('quick-dialog').showModal(); };
  $('pause-quick').addEventListener('click', showQuick);
  selectLevel('adventure');
  for (const id of ['show-times', 'pause-times']) $(id)?.addEventListener('click', () => {
    showScores(selectedLevel);
    $('scores-dialog').showModal();
  });
  for (const id of ['show-help', 'pause-help']) $(id)?.addEventListener('click', () => {
    showHelp(state === 'hub' || (state === 'title' && !TEST_MENU) ? 'hub' : selectedLevel);
    $('help-dialog').showModal();
  });
  for (const button of document.querySelectorAll('[data-scores-level]')) button.addEventListener('click', () => showScores(button.dataset.scoresLevel));
  for (const button of document.querySelectorAll('[data-help-level]')) button.addEventListener('click', () => showHelp(button.dataset.helpLevel));
  for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => $(button.dataset.close).close());
  $('mute').addEventListener('click', () => {
    sound.setMuted(!sound.muted);
    $('mute').classList.toggle('muted', sound.muted);
    $('mute').setAttribute('aria-pressed', String(sound.muted));
  });
  $('mute').classList.toggle('muted', sound.muted);
  $('mute').setAttribute('aria-pressed', String(sound.muted));
  if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
    $('fullscreen').hidden = false;
    $('fullscreen').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
      else enterFullscreen();
    });
  }
  function setPaused(value) {
    if (state === 'title' || state === 'win') return;
    paused = value;
    input.enabled = !paused && state !== 'cutscene';
    input.reset();
    player.jumpBuffer = 0;
    player.jumpHeld = false;
    player.spinRequest = false;
    player.poundRequest = false;
    biplane.clearIntent();
    hub?.clearIntent();
    sound.setPaused(paused);
    document.body.classList.toggle('paused', paused);
    $('pause').classList.toggle('hidden', !paused);
    $('rescue').hidden = state === 'chapter' ? chapterCountdown > 0 : state !== 'play' || !['play', 'biplane'].includes(player.state);
    if (paused) $('resume').focus();
    else $('pause-button').focus();
  }
  input.onPause = () => {
    if (document.querySelector('dialog[open]')) return;
    if (state === 'title') { start(); return; }
    if (state === 'win') { leaveLevel(); return; }
    setPaused(!paused);
  };
  $('pause-button').addEventListener('click', () => setPaused(true));
  $('resume').addEventListener('click', () => setPaused(false));
  $('ride-action').addEventListener('click', e => {
    e.preventDefault();
    if (input.enabled) input.rideQueued = true;
  });
  $('rescue').addEventListener('click', () => {
    if (state === 'chapter' && chapterGame) {
      if (chapterCountdown > 0) return;
      const events = chapterGame.rescue();
      setPaused(false);
      handleChapterEvents(events);
      return;
    }
    if (state !== 'play' || !['play', 'biplane'].includes(player.state)) return;
    biplane.recall(player);
    player.respawn();
    boss.reset();
    endFight();
    rig.snap(player, player.facing);
    setPaused(false);
    hint('Zurück am Checkpoint. Auf ein Neues!', 4);
  });
  $('reduced-motion').checked = reducedMotion;
  $('reduced-motion').addEventListener('change', e => {
    reducedMotion = e.target.checked;
    document.body.classList.toggle('reduced-motion', reducedMotion);
    try { localStorage.setItem('mirio-motion', reducedMotion ? 'quiet' : 'full'); } catch {}
  });
  for (const [id, method] of [['music-volume', 'setMusicVolume'], ['effects-volume', 'setEffectsVolume']]) {
    const slider = $(id);
    slider.value = Math.round((id === 'music-volume' ? sound.musicVolume : sound.effectsVolume) * 100);
    slider.addEventListener('input', () => {
      sound[method](Number(slider.value) / 100);
    });
  }
  window.addEventListener('keydown', e => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog) { if (e.code === 'Escape') { e.preventDefault(); dialog.close(); } return; }
    if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); setPaused(!paused); }
    if (e.code === 'Tab' && paused) {
      const items = [...$('pause').querySelectorAll('button:not([hidden]), input')];
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0].focus(); }
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { setPaused(true); sound.setPaused(true); }
    else if (!paused) sound.setPaused(false);
  });

  resetGame();
  input.enabled = false;
  rig.distance = 16;
  startButton.disabled = false;
  startButton.textContent = 'Spielen';
  $('status').textContent = '';
  showTitleTop();
  if (!TEST_MENU) {
    $('chapter-description').textContent = 'Vom Sternenhof beginnt deine Reise.';
    $('chapter-keys').textContent = 'WASD / Pfeile laufen · Leertaste springen · Laufe in ein Tor';
    $('chapter-touch').textContent = 'Links laufen · ↑ springen · Laufe in ein Tor';
  }

  // ---- Loop ------------------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  let frames = 0;
  let fpsT = 0;
  let fps = 0;
  const menuPad = {spin: false};
  const menuNavigation = new MenuNavigation({
    scope: () => document.querySelector('dialog[open]') ?? (paused ? $('pause') : state === 'title' ? $('title') : state === 'win' ? $('win') : null),
    back: root => {
      if (root.tagName === 'DIALOG') { root.close(); return; }
      if (paused) { setPaused(false); return; }
      if (state === 'win') leaveLevel();
    },
  });

  function menuController(dt) {
    const spin = Boolean(input.padButtons[1]), spinPressed = spin && !menuPad.spin;
    menuPad.spin = spin;
    if (spinPressed && !document.querySelector('dialog[open]') && (paused || state === 'win')) {
      if (state === 'hub') setPaused(false);
      else leaveLevel();
      return;
    }
    menuNavigation.update(dt, input.menu);
  }

  function hubFrame(dt, raw) {
    sound.setScene('explore');
    for (const event of hub.update(dt, input, camera, {reducedMotion})) {
      if (event.type === 'enter') {
        selectLevel(event.level);
        startLevel();
        return;
      }
      if (event.type === 'hubEcho') { sound.play('ring'); continue; }
      if (event.type === 'hubChorus') { sound.play('trailWin'); hint('♪ Der Sternenhof singt!', 5); continue; }
      sound.play(event.type === 'jump' ? ['jump', 'jump2', 'triple'][(event.level ?? 1) - 1] : event.type);
    }
    const visit = hub.snapshot();
    sound.footstep({dt, speed: Math.hypot(...visit.velocity), grounded: visit.grounded, surface: 'grass'});
    sound.ambience({active: true, dt});
    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('hint').classList.remove('show'); }
    hub.render(camera, dt, {reducedMotion});
    governor.update(raw);
    renderer.render(hub.scene, camera);
    renderHud();
  }

  function chapterFrame(dt, raw) {
    const runBefore = chapterGame.snapshot();
    if (state === 'chapter') {
      sound.setScene(selectedLevel === 'sky' ? 'moon' : 'explore');
      if (chapterCountdown > 0) {
        const number = Math.ceil(chapterCountdown);
        if (number !== countdownNumber) { countdownNumber = number; bigToast(String(number)); sound.play('beep'); }
        chapterCountdown = Math.max(0, chapterCountdown - dt);
        input.consumeJump(); input.consumeSpin(); input.consumePound();
        if (chapterCountdown === 0) { bigToast('Los!'); sound.play('go'); }
      } else {
        const events = chapterGame.step(dt, {x: input.move.x, y: input.move.y, jump: input.consumeJump(), jumpHeld: input.jumpHeld, action: input.consumeSpin()});
        input.consumePound(); input.consumeRide();
        handleChapterEvents(events);
        if (chapterGame.snapshot().status === 'finished') finishChapter();
      }
      stats.time = chapterGame.snapshot().time;
      sound.biplane(state === 'chapter' && selectedLevel === 'sky' ? {active: true, speed: runBefore.speed ?? 20, throttle: .6, boost: runBefore.boost > 0} : null);
      sound.ambience({active: state === 'chapter' && selectedLevel === 'ribbon', dt});
    } else { sound.biplane(null); sound.ambience({active: false}); }
    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('hint').classList.remove('show'); }
    chapterGame.render(camera, dt, {reducedMotion});
    governor.update(raw);
    renderer.render(chapterGame.scene, camera);
    renderHud();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    timeScale = Math.min(1, timeScale + raw * SLOWMO_RECOVER);
    const dt = Math.min(MAX_FRAME, raw) * timeScale;
    last = now;
    frames += 1;
    fpsT += raw;
    if (fpsT >= 1) {
      fps = frames / fpsT;
      frames = 0;
      fpsT = 0;
    }

    input.update(paused ? 0 : dt);
    menuController(dt);
    if (paused || document.hidden) return;
    if (state === 'hub') { hubFrame(dt, raw); return; }
    if (chapterGame && (state === 'chapter' || state === 'win')) {
      chapterFrame(dt, raw);
      return;
    }
    if (input.consumeRide() && state === 'play' && !fight.on) {
      natureEvents.push(...biplane.toggle(player));
      input.consumeJump(); input.consumeSpin(); input.consumePound();
    }
    elapsed += dt;
    sound.setScene(state === 'win' ? 'victory' : state === 'race' || state === 'raceEnd' ? 'race' : fight.on ? 'boss' : player.body.planet === mond || state === 'rocket' ? 'moon' : 'explore');
    sound.footstep({ dt, speed: player.body.vel.length(), grounded: state === 'play' && player.state === 'play' && player.body.onGround, surface: player.body.planet === mond ? 'stone' : 'grass' });
    if (finishDelay > 0) { finishDelay -= dt; if (finishDelay <= 0) win(); }
    for (const ev of adventure.update(dt, player, state === 'play' && !fight.on && !biplane.mounted, elapsed)) {
      sound.play(ev.type);
      if (ev.pos) particles.burst(ev.pos, {count: ev.type === 'trailWin' ? 28 : 10, color: ev.color, speed: 4, size: .4, life: .65});
      if (ev.type === 'trailStart') hint('Folge den leuchtenden Ringen! Alle sechs schenken dir einen Glitzermagneten.', 6);
      if (ev.type === 'trailWin') toast('Sternenspur! ✦ Glitzermagnet');
      if (ev.type === 'trailFail') hint('Fast geschafft! Der erste Ring startet die Spur neu.', 5);
    }
    if (state === 'play') {
      if (biplane.mounted) biplane.readInput(input, rig);
      else player.readInput(input, rig);
      stats.time += dt;
    }
    if (state === 'rocket' || state === 'cutscene') stats.time += dt;
    if (state === 'cutscene') updateCutscene(dt);
    const racing = state === 'race' || state === 'raceEnd' || (state === 'win' && result);
    if (racing) {
      handleRace(race.update(dt, input));
      // Use the kart's finish-line interpolation, including the last partial
      // tick, for both the standalone clock and the adventure's total time.
      const raceClock = result?.time ?? race.raceTime;
      stats.time += Math.max(0, raceClock - stats.raceTime);
      stats.raceTime = raceClock;
    }
    // The engine runs from the start signal until the win screen.
    const engineOn = racing && (race.state === 'race' || (race.state === 'finished' && state === 'raceEnd'));
    sound.engine(engineOn ? { speed: Math.abs(race.player.v), gas: race.player.throttle } : null);
    sound.biplane(biplane.mounted ? {active: true, speed: biplane.flight.speed, throttle: biplane.intent.throttle, boost: biplane.flight.boost > 0} : null);
    if (state === 'title') rig.forward.applyAxisAngle(rig.up, dt * 0.2);

    acc += dt;
    while (acc >= STEP) {
      acc -= STEP;
      simulate(STEP);
    }
    updateRocket(dt);
    handleEvents();

    if (hintTimer > 0) {
      hintTimer -= dt;
      if (hintTimer <= 0) $('hint').classList.remove('show');
    }

    animateWorld(dt, elapsed);
    if (state === 'play') rig.distance = playDistance() + (fight.on ? 4 : biplane.mounted ? 3 : 0);
    if (racing) race.updateCamera(camera, dt, {reducedMotion});
    else rig.update(dt, player, input);
    const fov = baseFov() + (racing && !reducedMotion ? race.fovKick : 0);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    if (reducedMotion) shake = 0;
    if (shake > 0) {
      camera.position.addScaledVector(tmp.randomDirection(), shake * 0.35);
      shake = Math.max(0, shake - dt * 1.5);
    }
    player.render(dt);
    biplane.update(dt, elapsed, camera, player, reducedMotion);
    enemies.update(elapsed, camera);
    garden.update(elapsed, camera);
    meadow.update(elapsed, camera, {reducedMotion});
    moon.update(elapsed, camera, {reducedMotion});
    for (const ev of wildlife.update(dt, elapsed, player, {active: state === 'play' && !fight.on, camera})) {
      if (ev.type === 'wildlifeMeet') {
        friends.add(ev.kind);
        sound.play('ring');
      } else sound.wildlife(ev);
    }
    sound.ambience({active: state === 'play' && !fight.on && player.body.planet === welt, dt});
    world.update(dt, elapsed, camera, racing ? null : player.body.pos);
    governor.update(raw);
    renderer.render(scene, camera);
    renderHud();
  }
  requestAnimationFrame(frame);

  if (TEST_MODE) {
    const planetById = (id) => level.planets.find((p) => p.id === id);
    window.__mirio = {
      snapshot: () => ({
        state,
        hub: hub?.snapshot() ?? null,
        selectedLevel,
        cameraUp: camera.up.toArray(),
        chapterRun: chapterGame ? {...chapterGame.snapshot(), countdown: chapterCountdown} : null,
        paused,
        time: stats.time,
        adventure: { badges: [...adventure.badges], magnet: adventure.magnet, trails: adventure.trails.map(t => ({id: t.id, next: t.run.next, active: t.run.active, time: t.run.time})) },
        fps,
        rendering: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, quality: governor.level, pixelRatio: governor.pixelRatio },
        creatures: stats.creatures,
        enemies: enemies.snapshot(),
        wildlife: wildlife.snapshot(),
        garden: garden.snapshot(),
        meadow: meadow.snapshot(),
        moon: moon.snapshot(),
        biplane: biplane.snapshot(),
        player: {
          state: player.state,
          planet: player.body.planet?.id ?? null,
          onGround: player.body.onGround,
          pos: player.body.pos.toArray(),
          up: player.body.up.toArray(),
          height: player.body.planet ? player.body.pos.distanceTo(player.body.planet.center) - player.body.planet.radius : null,
        },
        bits: stats.bits,
        bitsTotal: world.bits.length,
        flags: world.flags.filter((f) => f.reached).length,
        splashes: stats.splashes,
        rocket: rocket.phase,
        hearts: player.hearts,
        pounds: stats.pounds,
        bestJump: stats.bestJump,
        chain: player.chain,
        fight: fight.on,
        boss: { ...boss.snapshot(), pos: boss.position.toArray() },
        bubble: world.goal.bubble.visible,
        race: { state: race.state, progress: race.progress, place: race.place, drift: race.player.drift, speed: race.player.v, ...race.snapshot() },
        winVisible: !$('win').classList.contains('hidden'),
      }),
      layout: () => ({
        hub: hub?.layout() ?? null,
        planets: level.planets.map((p) => ({ id: p.id, center: p.center.toArray(), radius: p.radius })),
        flags: level.flags.map((f) => ({ planet: f.planet.id, dir: f.dir.toArray() })),
        stones: level.stones.map((s) => ({ planet: s.planet.id, dir: s.dir.toArray(), top: s.top })),
        blocks: level.blocks.map((b) => ({ planet: b.planet.id, dir: b.dir.toArray(), top: b.top })),
        rocket: { planet: welt.id, dir: launchUp.toArray(), height: level.rocket.height },
        goal: { planet: level.goal.planet.id, dir: level.goal.dir.toArray(), height: level.goal.height },
        trails: adventure.trails.map(t => ({id: t.id, planet: t.planet.id, dirs: t.dirs.map(d => d.toArray())})),
        enemies: enemies.layout(),
        wildlife: wildlife.layout(),
        garden: garden.layout(),
        meadow: meadow.layout(),
        moon: moon.layout(),
        boss: boss.layout(),
        biplane: biplane.layout(),
        chapterCourse: chapterGame?.layout?.() ?? null,
        lake: welt.water,
        arena: { planet: ar.planet.id, dir: ar.dir.toArray(), top: ar.top, radius: ar.radius, center: arenaCenter.toArray() },
      }),
      raceSkip(fraction) {
        race.skipTo(fraction);
      },
      chapterSeek(fraction) {
        if (state === 'chapter') return chapterGame?.seek?.(fraction);
      },
      /** Skips the level: from the arena straight into the kart. */
      raceNow() {
        this.teleport(ar.planet.id, ar.dir.toArray(), ar.top + 0.2);
        startCutscene();
        cut.t = CUTSCENE_KART;
      },
      /** Points the camera (and so "forward") along `dir`. */
      aim(dir) {
        const d = tangentDir(new THREE.Vector3(...dir), player.body.up);
        if (d) rig.snap(player, d);
      },
      teleport(id, dir, height = 0.2) {
        if (biplane.mounted) biplane.recall(player);
        const p = planetById(id);
        const d = new THREE.Vector3(...dir).normalize();
        surfacePoint(p, d, height, player.body.pos);
        player.body.vel.set(0, 0, 0);
        player.body.up.copy(d);
        player.body.planet = p;
        player.body.onGround = false;
        if (tangentDir(player.facing, d)) tangentDir(player.facing, d, player.facing);
      },
    };
  }
}

main();
