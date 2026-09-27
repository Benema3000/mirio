// Receives menu intent from Input; device sampling stays in the input layer.
const DEADZONE = .55;
const FIRST_REPEAT = .4;
const NEXT_REPEAT = .13;
const DIRECTION_SLOPE = .3;
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

const center = rectangle => ({x: rectangle.left + rectangle.width / 2, y: rectangle.top + rectangle.height / 2});

/** Spatial navigation keeps grids, wrapped tabs, and ordinary forms predictable. */
export function nextMenuIndex(rectangles, current, direction) {
  if (current < 0 || current >= rectangles.length) return 0;
  const origin = center(rectangles[current]);
  let best = current, score = Infinity;
  for (const [index, rectangle] of rectangles.entries()) {
    if (index === current) continue;
    const point = center(rectangle), dx = point.x - origin.x, dy = point.y - origin.y;
    const ahead = direction.x * dx + direction.y * dy;
    const across = Math.abs(direction.x * dy - direction.y * dx);
    // Raised cards stay in their row despite their small decorative offset.
    if (ahead <= Math.max(1, across * DIRECTION_SLOPE)) continue;
    const cost = ahead + across * .25;
    if (cost < score) {best = index; score = cost;}
  }
  return best;
}

export class MenuNavigation {
  #scope; #back; #root = null; #confirm = false; #cancel = false; #axis = ''; #repeat = 0;

  constructor({scope, back}) {this.#scope = scope; this.#back = back;}

  #items(root) {
    return [...root.querySelectorAll(FOCUSABLE)].filter(element => !element.hidden && element.getClientRects().length > 0);
  }

  #focus(element) {
    if (!element) return;
    this.#root.querySelectorAll('.controller-focus').forEach(item => item.classList.remove('controller-focus'));
    element.classList.add('controller-focus');
    element.focus({preventScroll: true});
    element.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
  }

  update(dt, {x = 0, y = 0, confirm = false, back = false} = {}) {
    const confirmPressed = confirm && !this.#confirm, backPressed = back && !this.#cancel;
    this.#confirm = confirm; this.#cancel = back;
    const root = this.#scope();
    if (root !== this.#root) {this.#root = root; this.#axis = ''; this.#repeat = 0;}
    if (!root) return false;
    const items = this.#items(root);
    let focused = root.ownerDocument.activeElement;
    if (!items.includes(focused)) {
      focused = items.find(item => item.hasAttribute('data-menu-default')) ?? items[0];
      this.#focus(focused);
    }
    if (backPressed) {this.#back(root); return true;}
    if (confirmPressed) {focused?.click(); return true;}

    const horizontal = Math.abs(x) > Math.abs(y);
    const value = horizontal ? x : -y;
    const axis = Math.abs(value) >= DEADZONE ? `${horizontal ? 'x' : 'y'}${Math.sign(value)}` : '';
    if (!axis) {this.#axis = ''; this.#repeat = 0; return true;}
    const changed = axis !== this.#axis;
    this.#axis = axis;
    this.#repeat -= Math.max(0, dt);
    if (!changed && this.#repeat > 0) return true;
    this.#repeat = changed ? FIRST_REPEAT : NEXT_REPEAT;

    // Volume sliders use left/right; up/down continues through the pause menu.
    if (horizontal && focused?.type === 'range') {
      const before = focused.value;
      if (value > 0) focused.stepUp(); else focused.stepDown();
      if (before !== focused.value) focused.dispatchEvent(new root.ownerDocument.defaultView.Event('input', {bubbles: true}));
      return true;
    }
    const direction = horizontal ? {x: Math.sign(value), y: 0} : {x: 0, y: Math.sign(value)};
    // Settings form rows include their labels, not only a tiny checkbox square.
    const rectangles = items.map(item => (item.closest?.('label') ?? item).getBoundingClientRect());
    const next = nextMenuIndex(rectangles, items.indexOf(focused), direction);
    this.#focus(items[next]);
    return true;
  }
}
