/* =====================================================================
   SELLWRONG — touch
   =====================================================================

   The phone's keyboard. One layer that turns fingers into the same four
   numbers and named buttons that input.js hands to the game, so nothing
   past this file knows it is running on a phone.

   ON A PHONE THE LAYOUT IS THE CONTROL SCHEME, so here it is:

     LEFT THUMB   a stick that appears WHERE THE THUMB LANDS. A stick
                  drawn in a fixed spot has to be looked at; one that
                  comes to the thumb never does. It also FOLLOWS: pull
                  past its rim and the whole stick is towed along, so a
                  long drag in a new direction changes direction instead
                  of staying pinned against the old rim. Push a little
                  to walk, all the way to run.

     RIGHT THUMB  drag anywhere to look. Not a stick — a stick is a rate
                  control and the eye is not; the view should move
                  exactly as far as the thumb did, and stop when it
                  stops.

     FLAME        under the right thumb's rest. It is HELD, because the
                  weapon is, and while it is held the same thumb STILL
                  LOOKS: slide it and the flame sweeps the aisle. That
                  one detail is what makes a one-weapon game playable
                  with two thumbs — the thumb that fires never has to
                  let go to aim.

     USE          above the flame, for the doors that are not automatic.
     PAUSE        in the corner, out of the way of everything.

   The controls dim when they have not been touched for a moment and
   brighten under the thumb, keep out of the notch and the home
   indicator, mirror for the left-handed, and explain themselves once,
   then get out of the way.

   The maths is exported on its own so the smoke test can check it
   without a screen.
   ===================================================================== */

/* How far a thumb reaches, in CSS px. Scaled to the screen so a phone's
   stick is not a tablet's, and clamped so a tablet's is not a saucer. */
export function stickRadius(w, h) {
  return Math.max(44, Math.min(64, Math.round(Math.min(w, h) * 0.14)));
}

/**
 * Finger offset from the stick base -> movement.
 *
 * The dead zone is a fraction of the radius, and the live range is
 * remapped so it starts from ZERO the moment the finger leaves the dead
 * zone. A stick that jumps to 0.12 at the edge of its dead zone is a
 * stick that twitches.
 *
 * Screen y runs down and game forward runs up, hence the sign on y.
 */
export function stickVector(dx, dy, radius, dead = 0.12) {
  const len = Math.hypot(dx, dy);
  const d0 = radius * dead;
  if (len <= d0) return { x: 0, y: 0, mag: 0 };
  const mag = Math.min(1, (len - d0) / (radius - d0));
  return { x: (dx / len) * mag, y: (-dy / len) * mag, mag };
}

/** Where the base ends up after a finger has pulled past the rim: towed
 *  along behind it, so the knob sits exactly on the rim. */
export function followBase(bx, by, fx, fy, radius) {
  const dx = fx - bx, dy = fy - by;
  const d = Math.hypot(dx, dy);
  if (d <= radius) return [bx, by];
  const k = (d - radius) / d;
  return [bx + dx * k, by + dy * k];
}

/* Radians per CSS pixel at a look speed of 1. A comfortable thumb swipe
   of about 150px turns 60 degrees; the pause menu scales it 0.4x-2.4x.
   Vertical is deliberately slower: a thumb dragging sideways is never
   quite level, and at 1:1 the view creeps upward through every turn. */
export const LOOK_BASE = 0.007;
export const LOOK_Y_RATIO = 0.8;

export function lookDelta(dx, dy, sens = 1) {
  return { x: dx * LOOK_BASE * sens, y: dy * LOOK_BASE * sens * LOOK_Y_RATIO };
}

/* what fraction of the screen, from the stick's side, belongs to the
   stick; the rest is for looking */
const MOVE_SHARE = 0.45;
const IDLE_MS = 2500;         // controls dim after this long untouched
const HINT_MS = 9000;         // and the first-time hints give up by then

export class TouchControls {
  /**
   * @param {Input} input   the game's input layer; this writes input.touch
   * @param {object} opts
   *   root      the #touch element already in the page
   *   onPause   called when the pause button is tapped
   *   prefs     { sens, lefty } — read live, so the menu can change them
   */
  constructor(input, opts) {
    this.input = input;
    this.root = opts.root;
    this.onPause = opts.onPause || (() => {});
    this.prefs = opts.prefs || { sens: 1, lefty: false };
    this.pointers = new Map();
    this.radius = 56;
    this.width = 0; this.height = 0;
    this.enabled = false;
    this._idle = 0; this._hint = 0;

    const $ = sel => this.root.querySelector(sel);
    this.el = { stick: $('.stick'), knob: $('.stick .knob') };
    this._bind();
    this.applyPrefs();
    this.resize();
  }

  _bind() {
    const r = this.root;
    const block = e => e.preventDefault();
    /* The browser's own gestures — scroll, zoom, the long-press menu —
       have no business in the game, and touch-action alone does not
       stop all of them on iOS. Blocking touchstart also suppresses the
       fake mouse events a tap would otherwise synthesise. */
    for (const t of ['touchstart', 'touchmove', 'touchend']) r.addEventListener(t, block, { passive: false });
    r.addEventListener('contextmenu', block);
    /* Safari's own pinch, which touch-action does not reach */
    document.addEventListener('gesturestart', block);
    r.addEventListener('pointerdown', e => this._down(e));
    addEventListener('pointermove', e => this._move(e));
    addEventListener('pointerup', e => this._up(e));
    /* A cancel is the browser taking the finger back — an edge swipe,
       a notification — and a stick left pushed when that happens walks
       you into the fire. */
    addEventListener('pointercancel', e => this._up(e));
    addEventListener('blur', () => this.releaseAll());
    addEventListener('resize', () => this.resize());
  }

  /** Shown only while the game is being played by touch. */
  setEnabled(on) {
    this.enabled = on;
    this.root.hidden = !on;
    if (!on) { this.releaseAll(); return; }
    this.resize();
    this._wake();
    clearTimeout(this._hint);
    this._hint = setTimeout(() => this.root.classList.add('used-move', 'used-look'), HINT_MS);
  }

  applyPrefs() { this.root.classList.toggle('lefty', !!this.prefs.lefty); }

  resize() {
    const b = this.root.getBoundingClientRect();
    this.width = b.width || innerWidth;
    this.height = b.height || innerHeight;
    this.left = b.left || 0; this.top = b.top || 0;
    this.radius = stickRadius(this.width, this.height);
    this.root.style.setProperty('--stick-r', this.radius + 'px');
  }

  _has(kind) { for (const p of this.pointers.values()) if (p.kind === kind) return true; return false; }

  _down(e) {
    if (!this.enabled || e.pointerType === 'mouse') return;
    this._wake();
    const t = this.input.touch;
    const btn = e.target.closest ? e.target.closest('.tb') : null;
    if (btn) {
      const kind = btn.dataset.btn;
      btn.classList.add('held');
      this.pointers.set(e.pointerId, { kind, el: btn, lx: e.clientX, ly: e.clientY });
      if (kind === 'fire') t.attack = true;
      if (kind === 'use') { t.use = true; t.usePulse = true; }
      return;
    }
    const x = e.clientX - this.left;
    const moveSide = this.prefs.lefty ? x > this.width * (1 - MOVE_SHARE) : x < this.width * MOVE_SHARE;
    if (moveSide && !this._has('move')) {
      this.pointers.set(e.pointerId, { kind: 'move', bx: e.clientX, by: e.clientY });
      this._stick(e.clientX, e.clientY, 0, 0, 0);
      this.root.classList.add('used-move');
    } else {
      this.pointers.set(e.pointerId, { kind: 'look', lx: e.clientX, ly: e.clientY });
      this.root.classList.add('used-look');
    }
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const t = this.input.touch;
    if (p.kind === 'move') {
      [p.bx, p.by] = followBase(p.bx, p.by, e.clientX, e.clientY, this.radius);
      const v = stickVector(e.clientX - p.bx, e.clientY - p.by, this.radius);
      t.move.x = v.x; t.move.y = v.y;
      /* the stick's full throw is a run; halfway is Doom's walk */
      t.run = v.mag > 0;
      this._stick(p.bx, p.by, e.clientX - p.bx, e.clientY - p.by, v.mag);
    } else if (p.kind === 'look' || p.kind === 'fire') {
      const d = lookDelta(e.clientX - p.lx, e.clientY - p.ly, this.prefs.sens);
      t.look.x += d.x; t.look.y += d.y;
      p.lx = e.clientX; p.ly = e.clientY;
    }
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    this._release(p, e.type === 'pointerup');
    this._wake();
  }

  _release(p, deliberate) {
    const t = this.input.touch;
    switch (p.kind) {
      case 'move': t.move.x = 0; t.move.y = 0; t.run = false; this._stickOff(); break;
      case 'fire': t.attack = false; p.el.classList.remove('held'); break;
      case 'use': t.use = false; p.el.classList.remove('held'); break;
      case 'pause': p.el.classList.remove('held'); if (deliberate) this.onPause(); break;
      default: break;
    }
  }

  releaseAll() {
    for (const p of this.pointers.values()) this._release(p, false);
    this.pointers.clear();
  }

  /* ---- drawing ---------------------------------------------------- */
  _stick(bx, by, kx, ky, mag) {
    const s = this.el.stick, R = this.radius;
    const len = Math.hypot(kx, ky);
    if (len > R) { kx *= R / len; ky *= R / len; }
    s.style.transform = `translate(${(bx - this.left).toFixed(1)}px, ${(by - this.top).toFixed(1)}px)`;
    this.el.knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
    s.classList.add('on');
    s.classList.toggle('run', mag > 0.85);
  }

  _stickOff() {
    this.el.stick.classList.remove('on', 'run');
    this.el.knob.style.transform = '';
  }

  _wake() {
    this.root.classList.remove('idle');
    clearTimeout(this._idle);
    this._idle = setTimeout(() => this.root.classList.add('idle'), IDLE_MS);
  }
}
