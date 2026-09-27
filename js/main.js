// Mirio: boots the game, runs the loop and applies the rules that involve
// more than one thing: collecting, checkpoints, the lake, the rocket, winning.

import * as THREE from 'three';
import { loadArt } from './art.js';
import { Adventure } from './adventure.js';
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

const BIT_RADIUS = 1.3;
const FLAG_RADIUS = 2.4;
const COUNTDOWN = ['3', '2', '1', 'Start!'];
const COUNTDOWN_STEP = 0.8;
const FLIGHT_TIME = 6;
const CONFETTI = [0xffe14d, 0xff6fb5, 0x5fe3ff, 0x8dff6a, 0xc58bff, 0xffffff];
const SPLASH = [0x7fd0ff, 0xffffff, 0x3aa7e8];

const HINTS = {
  startKeys: 'Laufen: Pfeiltasten oder WASD · Springen: Leertaste · Drehen: Shift · Stampfen: C',
  startTouch: 'Links wischen: laufen · ↑ springen · ⟳ drehen · ⤓ stampfen',
  lake: 'Spring von Stein zu Stein. Nicht ins Wasser fallen!',
  longJump: 'Tipp: Springen gedrückt halten, dann springt Mirio weiter.',
  plateau: 'Die Rakete wartet oben auf dem Plateau!',
  rocket: 'Lauf in die Rakete!',
  moon: 'Auf dem Mond springst du viel höher. Klettere hinauf zum Kristall!',
  boss: 'Wenn er schwindlig ist: spring ihm auf die Mütze!',
  bossWon: 'Hinterher! Ab ins Kart!',
  faint: 'Nochmal! Spring über die Schockwelle.',
  raceKeys: 'Gas: ↑ · Bremse: ↓ · Lenken: ← → · Driften: beim Lenken Leertaste halten, loslassen: Turbo!',
  raceTouch: 'Links wischen: lenken · Rechts: Gas und Bremse · Driften: beim Lenken beide halten, Bremse loslassen: Turbo!',
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

const SCORES_URL = 'api/scores.php';
const NAME_KEY = 'mirio-name';
const SCORES_DOWN = 'Die Bestenliste ist gerade nicht erreichbar.';
const TITLE_SCORES = 5;

async function fetchScores() {
  const body = await (await fetch(SCORES_URL, { cache: 'no-store' })).json();
  if (!body.ok) throw new Error(body.message);
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
    points.textContent = entry.points;
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
  const [welt, mond] = level.planets;
  const colliders = collidersFor(level);
  const world = buildScene(scene, level, art);
  // Trades resolution for frame rate on phones; see quality.js.
  const governor = new QualityGovernor(renderer, { onChange: (l) => world.setQuality(l) });
  const particles = new Particles(scene, art.sparkle);
  const player = new Player(scene, art, level.planets, colliders);
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
  let state = 'title';
  let paused = false;
  let finishDelay = 0;
  let elapsed = 0;
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { const saved = localStorage.getItem('mirio-motion'); if (saved !== null) reducedMotion = saved === 'quiet'; } catch {}
  document.body.classList.toggle('reduced-motion', reducedMotion);
  const stats = { bits: 0, time: 0, splashes: 0, pounds: 0, bestJump: 0, raceTime: 0 };
  const shown = new Set();
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
  const boss = new Boss(scene, art, { planet: ar.planet, center: arenaCenter, up: ar.dir.clone(), radius: ar.radius });
  const fight = { on: false };

  function onArena() {
    if (player.body.planet !== ar.planet || player.state !== 'play') return false;
    const rel = tmp.subVectors(player.body.pos, arenaCenter);
    const along = rel.dot(ar.dir);
    return Math.abs(along) < 0.3 && rel.addScaledVector(ar.dir, -along).length() < ar.radius;
  }

  // ---- The kart race -----------------------------------------------------------
  const race = new KartRace(scene, art, { planets: level.planets, start: level.course.start, finish: level.course.finish });
  const totalBits = () => world.bits.length + race.bitCount;
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
          sound.play('jump');
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
    document.body.classList.remove('racing');
    adventure.reset();
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
    shown.clear();
    rig.snap(player, startForward);
    renderHud(true);
  }

  // ---- HUD ---------------------------------------------------------------
  const hud = { bits: -1, hearts: -1, hp: -1 };
  function renderHud(force = false) {
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
      $('race-technique').hidden = !boost && !race.player.drift;
      $('race-technique').textContent = boost ? '✦ TURBO!' : charge === 2 ? 'SUPER-TURBO · Loslassen!' : charge === 1 ? 'TURBO BEREIT · Loslassen!' : 'DRIFT · Weiter halten …';
      $('race-technique').dataset.charge = boost ? 'boost' : String(charge);
      $('race-place').textContent = `${race.place}.`;
      $('race-time').textContent = formatTime(race.state === 'race' ? stats.raceTime : result?.time ?? 0);
    }
    updateJourney();
    const trail = adventure.activeTrail;
    $('trail-hud').hidden = !trail || state !== 'play';
    if (trail) {
      $('trail-label').textContent = `${trail.name} · ${trail.run.next} / ${trail.run.count}`;
      $('trail-time').textContent = `${Math.ceil(trail.run.time)} s`;
      $('trail-progress').value = trail.run.next;
    }
    $('magnet-hud').hidden = adventure.magnet <= 0 || state !== 'play';
    $('magnet-time').textContent = `${Math.ceil(adventure.magnet)} s`;
    if (force || hud.hp !== boss.hp) {
      hud.hp = boss.hp;
      [...document.querySelectorAll('.boss-hp i')].forEach((el, i) => el.classList.toggle('gone', i >= boss.hp));
    }
  }

  // Surface-relative compass: follows the journey even around a planet.
  const guideDir = new THREE.Vector3();
  const guideRight = new THREE.Vector3();
  function updateJourney() {
    let label = 'Folge den Glitzersteinen';
    let chapter = '01 / WIESENWELT';
    let target = null;
    if (state === 'race' || state === 'raceEnd') { chapter = '03 / STERNENRENNEN'; label = 'Hol dir den Kristall!'; }
    else if (state === 'rocket') { chapter = '02 / AUF ZUM MOND'; label = 'Nächster Halt: Miros Mond'; }
    else if (state === 'cutscene') { chapter = '03 / STERNENRENNEN'; label = 'Dem Kristall hinterher!'; }
    else if (player.body.planet === mond) {
      chapter = '02 / MIROS MOND';
      label = fight.on ? 'Spring auf die schwindlige Mütze' : 'Klettere zum Kristall';
      // The nearest uncollected moon-route gem gives a useful direction on
      // the far side, where the arena itself would point through the ground.
      const gems = world.bits.filter(b => !b.taken && b.planet === mond);
      target = gems.reduce((near, b) => !near || b.mesh.position.distanceToSquared(player.body.pos) < near.distanceToSquared(player.body.pos) ? b.mesh.position : near, null) ?? arenaCenter;
      if (fight.on) target = null;
    } else {
      const next = world.flags.find(f => !f.reached);
      label = next ? ['Über die Baumstümpfe zum See', 'Überquere den Glitzersee', 'Durch die Hügel zur Rakete'][world.flags.indexOf(next)] : 'Die Rakete wartet auf dem Plateau';
      target = next?.center ?? padBase;
    }
    if ($('objective').textContent !== label) $('objective').textContent = label;
    if ($('chapter').textContent !== chapter) $('chapter').textContent = chapter;
    const direction = target && tangentDir(guideDir.subVectors(target, player.body.pos), player.body.up, guideDir);
    const forward = tangentDir(rig.forward, player.body.up, tmp2);
    if (direction && forward) {
      guideRight.crossVectors(forward, player.body.up);
      $('compass-arrow').style.transform = `rotate(${Math.atan2(direction.dot(guideRight), direction.dot(forward))}rad)`;
    }
    $('compass-arrow').style.opacity = target ? '1' : '.35';
  }

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
  function simulate(h) {
    player.step(h);
    if (state === 'play' && !fight.on && !boss.defeated && onArena()) {
      fight.on = true;
      boss.start();
      $('boss-bar').hidden = false;
      $('hearts').hidden = false;
      renderHud(true);
    }
    if (state === 'play') bossEvents.push(...boss.update(h, player));
    if (state !== 'play' || player.state !== 'play') return;

    playerMid.copy(player.body.pos).addScaledVector(player.body.up, 1);

    for (const bit of world.bits) {
      if (bit.taken || bit.mesh.position.distanceTo(playerMid) > (adventure.magnet > 0 ? 3.8 : BIT_RADIUS)) continue;
      bit.taken = true;
      bit.mesh.visible = false;
      stats.bits += 1;
      sound.play('bit');
      particles.burst(bit.mesh.position, { count: 6, color: bit.color, speed: 3, size: 0.45, life: 0.4 });
    }

    for (const [i, f] of world.flags.entries()) {
      if (f.reached || f.center.distanceTo(player.body.pos) > FLAG_RADIUS) continue;
      f.reached = true;
      player.checkpoint = { planet: f.planet, dir: f.dir.clone() };
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
          // Out of hearts: back to the moon's landing spot, the boss starts over.
          boss.reset();
          endFight();
          toast('Nochmal!');
          hint(HINTS.faint, 6);
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

    for (const ev of bossEvents) {
      switch (ev.type) {
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

  // ---- High scores (api/scores.php) ---------------------------------------
  // Each run takes a token from the server when it starts and hands it back
  // with its result; the server keeps the list and works out the points.
  let runToken = null;

  function newRun() {
    runToken = null;
    fetchScores().then((b) => {
      runToken = b.token;
    }).catch(() => {});
  }

  /** Same sum as api/scores.inc. */
  function points() {
    return stats.bits * 10 + (result.place === 1 ? 500 : 200) + Math.max(0, 900 - Math.floor(stats.time));
  }

  function scoreStatus(text) {
    $('score-status').textContent = text;
  }

  function offerHighScore() {
    $('win-points').textContent = points();
    $('win-board').replaceChildren();
    scoreStatus('');
    const form = $('score-form');
    form.hidden = !runToken;
    $('score-send').disabled = false;
    if (!runToken) scoreStatus(SCORES_DOWN);
    try {
      $('score-name').value = localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      // Storage blocked: start with an empty name.
    }
    if (runToken && !document.body.classList.contains('touch')) $('score-name').focus();
    fetchScores().then((b) => showBoard($('win-board'), b.top)).catch(() => {});
  }

  async function sendHighScore(e) {
    e.preventDefault();
    const name = $('score-name').value.trim();
    if (!name || !runToken) return;
    $('score-send').disabled = true;
    scoreStatus('Wird eingetragen …');
    try {
      const res = await fetch(SCORES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: runToken, name, bits: stats.bits, time: stats.time, place: result.place }),
      });
      const body = await res.json();
      if (!body.ok) {
        scoreStatus(body.message);
        // A different name or a later try can help; a refused run cannot.
        if (body.error === 'name' || body.error === 'rate') $('score-send').disabled = false;
        else $('score-form').hidden = true;
        return;
      }
      runToken = null;
      $('score-form').hidden = true;
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {
        // Storage blocked: the name is just not remembered.
      }
      scoreStatus(body.rank ? `Platz ${body.rank} in der Bestenliste!` : 'Eingetragen! Für die besten 100 hat es noch nicht gereicht.');
      showBoard($('win-board'), body.top, body.rank);
    } catch {
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
    const place = result.place === 1 ? '1. Platz' : `${result.place}. Platz`;
    $('win-stats').innerHTML = [
      `Kartrennen: <b>${place}</b> in ${formatTime(result.time)}`,
      `Glitzersteine: <b>${stats.bits}</b> von ${totalBits()}`,
      `Ins Wasser gefallen: <b>${stats.splashes}</b>&times;`,
      `Dreifachsprung: <b>${stats.bestJump === 3 ? 'geschafft' : 'noch nicht'}</b>`,
      `Zeit: <b>${formatTime(stats.time)}</b>`,
    ].join('<br>');
    $('win-extra').textContent = stats.bits === totalBits()
      ? 'Alle Glitzersteine gefunden. Wow!'
      : `${totalBits() - stats.bits} Glitzersteine sind noch versteckt.`;
    $('win-badges').replaceChildren(...[
      ...[...adventure.badges].map(id => id === 'meadow' ? '✦ Wiesenspuren' : '✦ Mondspuren'),
      ...(stats.bestJump === 3 ? ['↟ Sprungkünstler'] : []),
      ...(stats.bits >= 50 ? ['◇ Glitzersammler'] : []),
    ].map(text => { const badge = document.createElement('span'); badge.textContent = text; return badge; }));
    offerHighScore();
    $('win').classList.remove('hidden');
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

  function start() {
    paused = false;
    $('pause').classList.add('hidden');
    document.body.classList.remove('paused');
    sound.setPaused(false);
    enterFullscreen();
    sound.unlock();
    sound.startMusic();
    resetGame();
    newRun();
    rig.distance = playDistance();
    state = 'play';
    input.enabled = true;
    $('title').classList.add('hidden');
    $('win').classList.add('hidden');
    document.body.classList.add('playing');
    hint(document.body.classList.contains('touch') ? HINTS.startTouch : HINTS.startKeys, 8);
  }

  startButton.addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('score-form').addEventListener('submit', sendHighScore);
  // The start screen shows the top of the list; without a server it stays hidden.
  fetchScores().then((b) => {
    showBoard($('title-board'), b.top.slice(0, TITLE_SCORES));
    $('title-scores').hidden = false;
  }).catch(() => {});
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
    sound.setPaused(paused);
    document.body.classList.toggle('paused', paused);
    $('pause').classList.toggle('hidden', !paused);
    $('rescue').hidden = state !== 'play' || player.state !== 'play';
    if (paused) {
      $('pause-objective').textContent = $('objective').textContent;
      $('resume').focus();
    } else $('pause-button').focus();
  }
  input.onPause = () => setPaused(!paused);
  $('pause-button').addEventListener('click', () => setPaused(true));
  $('resume').addEventListener('click', () => setPaused(false));
  $('rescue').addEventListener('click', () => {
    if (state !== 'play' || player.state !== 'play') return;
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
  rig.distance = 16;
  startButton.disabled = false;
  startButton.textContent = "Los geht's!";
  $('status').textContent = '';

  // ---- Loop ------------------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  let frames = 0;
  let fpsT = 0;
  let fps = 0;

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
    if (paused || document.hidden) return;
    elapsed += dt;
    sound.setScene(state === 'win' ? 'victory' : state === 'race' || state === 'raceEnd' ? 'race' : fight.on ? 'boss' : player.body.planet === mond || state === 'rocket' ? 'moon' : 'explore');
    sound.footstep({ dt, speed: player.body.vel.length(), grounded: state === 'play' && player.state === 'play' && player.body.onGround, surface: player.body.planet === mond ? 'stone' : 'grass' });
    if (finishDelay > 0) { finishDelay -= dt; if (finishDelay <= 0) win(); }
    for (const ev of adventure.update(dt, player, state === 'play' && !fight.on, elapsed)) {
      sound.play(ev.type);
      if (ev.pos) particles.burst(ev.pos, {count: ev.type === 'trailWin' ? 28 : 10, color: ev.color, speed: 4, size: .4, life: .65});
      if (ev.type === 'trailStart') hint('Folge den leuchtenden Ringen! Alle sechs schenken dir einen Glitzermagneten.', 6);
      if (ev.type === 'trailWin') toast('Sternenspur! ✦ Glitzermagnet');
      if (ev.type === 'trailFail') hint('Fast geschafft! Der erste Ring startet die Spur neu.', 5);
    }
    if (state === 'play') {
      player.readInput(input, rig);
      stats.time += dt;
    }
    if (state === 'rocket' || state === 'cutscene') stats.time += dt;
    if (state === 'cutscene') updateCutscene(dt);
    const racing = state === 'race' || state === 'raceEnd' || (state === 'win' && result);
    if (racing) {
      handleRace(race.update(dt, input));
      if (race.state === 'race') {
        stats.time += dt;
        stats.raceTime += dt;
      }
    }
    // The engine runs from the start signal until the win screen.
    const engineOn = racing && (race.state === 'race' || (race.state === 'finished' && state === 'raceEnd'));
    sound.engine(engineOn ? { speed: Math.abs(race.player.v), gas: race.player.throttle } : null);
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
    if (state === 'play') rig.distance = playDistance() + (fight.on ? 4 : 0);
    if (racing) race.updateCamera(camera, dt);
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
        paused,
        time: stats.time,
        adventure: { badges: [...adventure.badges], magnet: adventure.magnet, trails: adventure.trails.map(t => ({id: t.id, next: t.run.next, active: t.run.active, time: t.run.time})) },
        fps,
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
        boss: { state: boss.state, hp: boss.hp, defeated: boss.defeated, pos: boss.position.toArray() },
        bubble: world.goal.bubble.visible,
        race: { state: race.state, progress: race.progress, place: race.place, drift: race.player.drift, speed: race.player.v },
        winVisible: !$('win').classList.contains('hidden'),
      }),
      layout: () => ({
        planets: level.planets.map((p) => ({ id: p.id, center: p.center.toArray(), radius: p.radius })),
        flags: level.flags.map((f) => ({ planet: f.planet.id, dir: f.dir.toArray() })),
        stones: level.stones.map((s) => ({ planet: s.planet.id, dir: s.dir.toArray(), top: s.top })),
        blocks: level.blocks.map((b) => ({ planet: b.planet.id, dir: b.dir.toArray(), top: b.top })),
        rocket: { planet: welt.id, dir: launchUp.toArray(), height: level.rocket.height },
        goal: { planet: level.goal.planet.id, dir: level.goal.dir.toArray(), height: level.goal.height },
        trails: adventure.trails.map(t => ({id: t.id, planet: t.planet.id, dirs: t.dirs.map(d => d.toArray())})),
        lake: welt.water,
        arena: { planet: ar.planet.id, dir: ar.dir.toArray(), top: ar.top, radius: ar.radius, center: arenaCenter.toArray() },
      }),
      raceSkip(fraction) {
        race.skipTo(fraction);
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
