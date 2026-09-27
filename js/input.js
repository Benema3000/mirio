// Mirio: keyboard, mouse and touch, merged into one small intent:
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
  constructor({ surface, stick, knob, jumpButton, spinButton, poundButton, gasButton, brakeButton }) {
    this.move = { x: 0, y: 0 };
    this.drive = { steer: 0, gas: 0, brake: 0 };
    this.buttonGas = false;
    this.buttonBrake = false;
    this.jumpHeld = false;
    this.enabled = false;
    this.down = new Set();
    this.jumpQueued = false;
    this.spinQueued = false;
    this.poundQueued = false;
    this.turn = { x: 0, y: 0 };
    this.stickTouch = null;
    this.stickVec = { x: 0, y: 0 };
    this.dragPointer = null;
    this.buttonJumpHeld = false;
    this.stick = stick;
    this.knob = knob;
    this.onTouch = () => {};

    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.releaseStick();
      this.buttonJumpHeld = false;
      this.buttonGas = false;
      this.buttonBrake = false;
    });

    surface.addEventListener('pointerdown', (e) => this.pointerDown(e));
    surface.addEventListener('pointermove', (e) => this.pointerMove(e));
    surface.addEventListener('pointerup', (e) => this.pointerUp(e));
    surface.addEventListener('pointercancel', (e) => this.pointerUp(e));
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

  bindButton(el, press, release = () => {}) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('pressed');
      if (this.enabled) press();
    });
    const up = (e) => {
      e.stopPropagation();
      el.classList.remove('pressed');
      release();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  key(e, isDown) {
    // Typing a name for the high score list.
    if (!GAME_KEYS.has(e.code) || e.target?.tagName === 'INPUT') return;
    e.preventDefault();
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

  /** Samples held keys and the stick; call once per frame. */
  update(dt) {
    let x = this.stickVec.x;
    let y = this.stickVec.y;
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
    this.jumpHeld = this.enabled && (this.held('jump') || this.buttonJumpHeld);
    const steer = this.stickVec.x + (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    this.drive.steer = this.enabled ? Math.max(-1, Math.min(1, steer)) : 0;
    this.drive.gas = this.enabled && (this.held('up') || this.buttonGas) ? 1 : 0;
    this.drive.brake = this.enabled && (this.held('down') || this.buttonBrake) ? 1 : 0;
    if (this.held('camLeft')) this.turn.x -= KEY_TURN * dt;
    if (this.held('camRight')) this.turn.x += KEY_TURN * dt;
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
