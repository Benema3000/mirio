// Mirio: keyboard, mouse, touch and standard gamepads, merged into one intent:
// move (x right, y forward), jump, spin, ground pound, and camera turns; and
// for the kart, `drive`: steering, gas and brake, kept apart so that gas
// never weakens the steering.
//
// Touch layout: the left half of the screen is a floating thumb stick that
// appears wherever the thumb lands; the right half drags the camera; three
// round buttons jump, spin and ground-pound. In the race, gas and brake
// buttons replace spin and ground-pound, and the stick only steers.

const STICK_RADIUS = 56;
const MOUSE_TURN = 0.006;
const TOUCH_TURN = 0.009;
const KEY_TURN = 2.2;
const PAD_DEADZONE = 0.18;
const PAD_TURN = 2.4;

/** A circular dead zone avoids drift without losing gentle analog movement. */
export function analogStick(x = 0, y = 0, deadzone = PAD_DEADZONE) {
  const length = Math.hypot(x, y);
  if (length <= deadzone) return { x: 0, y: 0 };
  const scale = Math.min(1, (length - deadzone) / (1 - deadzone)) / length;
  return { x: x * scale, y: y * scale };
}

const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyK'],
  spin: ['ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyX'],
  pound: ['KeyC', 'ControlLeft', 'ControlRight', 'KeyL'],
  camLeft: ['KeyQ'],
  camRight: ['KeyE'],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat());

export class Input {
  #gameplayKeys = new Set();

  constructor({ surface, stick, knob, jumpButton, spinButton, poundButton, gasButton, brakeButton }) {
    this.move = { x: 0, y: 0 };
    this.menu = { x: 0, y: 0, confirm: false, back: false };
    this.drive = { steer: 0, gas: 0, brake: 0 };
    this.buttonGas = false;
    this.buttonBrake = false;
    this.jumpHeld = false;
    this._enabled = false;
    this.down = new Set();
    this.jumpQueued = false;
    this.spinQueued = false;
    this.poundQueued = false;
    this.poundHeld = false;
    this.buttonPoundHeld = false;
    this.turn = { x: 0, y: 0 };
    this.stickTouch = null;
    this.stickVec = { x: 0, y: 0 };
    this.dragPointer = null;
    this.buttonJumpHeld = false;
    this.stick = stick;
    this.knob = knob;
    this.onTouch = () => {};
    this.onPause = () => {};
    this.buttons = [jumpButton, spinButton, poundButton, gasButton, brakeButton].filter(Boolean);
    this.padButtons = [];
    this.gamepadConnected = false;

    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => { this.#gameplayKeys.clear(); this.reset(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });

    surface.addEventListener('pointerdown', (e) => this.pointerDown(e));
    surface.addEventListener('pointermove', (e) => this.pointerMove(e));
    surface.addEventListener('pointerup', (e) => this.pointerUp(e));
    surface.addEventListener('pointercancel', (e) => this.pointerUp(e));
    surface.addEventListener('lostpointercapture', (e) => this.pointerUp(e));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());

    this.bindButton(jumpButton, () => {
      this.jumpQueued = true;
      this.buttonJumpHeld = true;
    }, () => {
      this.buttonJumpHeld = false;
    });
    this.bindButton(spinButton, () => {
      this.spinQueued = true;
    });
    this.bindButton(poundButton, () => {
      this.poundQueued = true;
      this.buttonPoundHeld = true;
    }, () => {
      this.buttonPoundHeld = false;
    });
    this.bindButton(gasButton, () => {
      this.buttonGas = true;
    }, () => {
      this.buttonGas = false;
    });
    this.bindButton(brakeButton, () => {
      this.buttonBrake = true;
    }, () => {
      this.buttonBrake = false;
    });
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(value) {
    this._enabled = Boolean(value);
    if (!this._enabled) this.reset();
  }

  /** Clear held and queued intent at pause, restart, blur, or a lost touch. */
  reset() {
    this.down.clear();
    this.releaseStick();
    this.dragPointer = null;
    this.buttonJumpHeld = this.buttonPoundHeld = this.buttonGas = this.buttonBrake = this.jumpHeld = this.poundHeld = false;
    this.jumpQueued = this.spinQueued = this.poundQueued = false;
    this.turn.x = this.turn.y = this.move.x = this.move.y = 0;
    this.drive.steer = this.drive.gas = this.drive.brake = 0;
    Object.assign(this.menu, {x: 0, y: 0, confirm: false, back: false});
    for (const button of this.buttons) button.classList.remove('pressed');
  }

  bindButton(el, press, release = () => {}) {
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled) return;
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('pressed');
      press();
    });
    const up = (e) => {
      e.stopPropagation();
      el.classList.remove('pressed');
      release();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  key(e, isDown) {
    // Always release a key, even if focus has since moved into a text field.
    const carried = this.#gameplayKeys.has(e.code);
    if (!isDown) { this.down.delete(e.code); this.#gameplayKeys.delete(e.code); }
    // A held brake must not click Replay when the result takes keyboard focus.
    if (!this.enabled) {
      if (carried) e.preventDefault();
      return;
    }
    const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;
    if (!GAME_KEYS.has(e.code) || editing) return;
    e.preventDefault();
    if (isDown) this.#gameplayKeys.add(e.code);
    if (isDown && !e.repeat && this.enabled) {
      if (KEYS.jump.includes(e.code)) this.jumpQueued = true;
      if (KEYS.spin.includes(e.code)) this.spinQueued = true;
      if (KEYS.pound.includes(e.code)) this.poundQueued = true;
    }
    if (isDown) this.down.add(e.code);
    else this.down.delete(e.code);
  }

  held(name) {
    return KEYS[name].some((code) => this.down.has(code));
  }

  pointerDown(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'touch') this.onTouch();
    const isTouch = e.pointerType !== 'mouse';
    if (isTouch && e.clientX < window.innerWidth * 0.5 && this.stickTouch === null) {
      this.stickTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.stick.classList.add('active');
      this.updateStick(e.clientX, e.clientY);
    } else if (this.dragPointer === null) {
      this.dragPointer = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: isTouch };
    } else {
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  pointerMove(e) {
    if (!this.enabled) return;
    if (this.stickTouch && e.pointerId === this.stickTouch.id) {
      this.updateStick(e.clientX, e.clientY);
      return;
    }
    const d = this.dragPointer;
    if (!d || e.pointerId !== d.id) return;
    const speed = d.touch ? TOUCH_TURN : MOUSE_TURN;
    this.turn.x += (e.clientX - d.x) * speed;
    this.turn.y += (e.clientY - d.y) * speed;
    d.x = e.clientX;
    d.y = e.clientY;
  }

  pointerUp(e) {
    if (this.stickTouch && e.pointerId === this.stickTouch.id) this.releaseStick();
    if (this.dragPointer && e.pointerId === this.dragPointer.id) this.dragPointer = null;
  }

  updateStick(x, y) {
    let dx = x - this.stickTouch.x;
    let dy = y - this.stickTouch.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx *= STICK_RADIUS / len;
      dy *= STICK_RADIUS / len;
    }
    this.stickVec.x = dx / STICK_RADIUS;
    this.stickVec.y = -dy / STICK_RADIUS;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  releaseStick() {
    this.stickTouch = null;
    this.stickVec.x = this.stickVec.y = 0;
    this.stick.classList.remove('active');
    this.knob.style.transform = '';
  }

  /** Standard mapping: A jump, X spin, B pound; RT/LT drive; Start pauses. */
  sampleGamepad() {
    let pad = null;
    // The API can be unavailable in an embedded page or browser policy.
    try {
      pad = Array.from(globalThis.navigator?.getGamepads?.() ?? []).find((p) => p?.connected && p.mapping === 'standard');
    } catch { /* Keyboard and touch remain available. */ }
    this.gamepadConnected = Boolean(pad);
    const value = (i) => pad?.buttons[i]?.value ?? 0;
    const buttons = [0, 2, 1, 9].map((i) => Boolean(pad?.buttons[i]?.pressed));
    if (this.enabled) {
      if (buttons[0] && !this.padButtons[0]) this.jumpQueued = true;
      if (buttons[1] && !this.padButtons[1]) this.spinQueued = true;
      if (buttons[2] && !this.padButtons[2]) this.poundQueued = true;
    }
    const pause = buttons[3] && !this.padButtons[3];
    this.padButtons = buttons;
    if (pause) this.onPause();
    const left = analogStick(pad?.axes[0], pad?.axes[1]);
    const right = analogStick(pad?.axes[2], pad?.axes[3]);
    return {
      x: left.x + value(15) - value(14), y: -left.y + value(12) - value(13),
      cameraX: right.x, cameraY: -right.y, jump: buttons[0], pound: buttons[2],
      gas: Math.max(value(7), value(12)), brake: Math.max(value(6), value(13)),
    };
  }

  /** Samples held controls; call once per frame, including while paused. */
  update(dt) {
    const pad = this.sampleGamepad();
    // Menus keep their own intent while pause disables movement and queued actions.
    const menuLength = Math.max(1, Math.hypot(pad.x, pad.y));
    Object.assign(this.menu, {x: pad.x / menuLength, y: pad.y / menuLength,
      confirm: Boolean(this.padButtons[0]), back: Boolean(this.padButtons[2])});
    if (!this.enabled) return;
    let x = this.stickVec.x + pad.x;
    let y = this.stickVec.y + pad.y;
    if (this.held('left')) x -= 1;
    if (this.held('right')) x += 1;
    if (this.held('up')) y += 1;
    if (this.held('down')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = this.enabled ? x : 0;
    this.move.y = this.enabled ? y : 0;
    this.jumpHeld = this.enabled && (this.held('jump') || this.buttonJumpHeld || pad.jump);
    this.poundHeld = this.enabled && (this.held('pound') || this.buttonPoundHeld || pad.pound);
    const steer = this.stickVec.x + pad.x + (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    this.drive.steer = this.enabled ? Math.max(-1, Math.min(1, steer)) : 0;
    this.drive.gas = Math.max(pad.gas, this.held('up') || this.buttonGas ? 1 : 0);
    this.drive.brake = Math.max(pad.brake, this.held('down') || this.buttonBrake ? 1 : 0);
    if (this.held('camLeft')) this.turn.x -= KEY_TURN * dt;
    if (this.held('camRight')) this.turn.x += KEY_TURN * dt;
    this.turn.x += pad.cameraX * PAD_TURN * dt;
    this.turn.y += pad.cameraY * PAD_TURN * dt;
  }

  consumeJump() {
    const v = this.jumpQueued;
    this.jumpQueued = false;
    return v;
  }

  consumeSpin() {
    const v = this.spinQueued;
    this.spinQueued = false;
    return v;
  }

  consumePound() {
    const v = this.poundQueued;
    this.poundQueued = false;
    return v;
  }

  consumeCamera() {
    const t = { x: this.turn.x, y: this.turn.y };
    this.turn.x = this.turn.y = 0;
    return t;
  }
}
