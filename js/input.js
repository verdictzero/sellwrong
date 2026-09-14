/* =====================================================================
   GROCERY STORE SIMULATOR — input
   =====================================================================

   One layer over keyboard, mouse, gamepad and touch, because the game
   should not care and there is no version of caring that ends well.
   Everything downstream reads the same four numbers and the same set of
   named buttons.

     move.x   -1 .. 1   strafe
     move.y   -1 .. 1   forward
     look.x             yaw this frame, in radians
     look.y             pitch this frame, in radians

   Buttons are edge-detected here rather than downstream: `pressed()` is
   true for exactly one frame, `down()` for as long as it is held. Weapon
   switching wants the first, the flamethrower wants the second, and
   working that out at each call site is how you end up with a
   flamethrower that fires once.

   MOUSE LOOK is pointer-locked and accumulates between frames rather
   than being sampled, so a fast flick is not lost between two vsyncs.

   TOUCH is written into `touch` by touch.js and read here like any other
   device. The two never fight because the game is in one MODE at a time,
   and the mode is whichever device spoke last: a phone with a keyboard
   plugged in is a desktop until it is tapped, and a laptop with a screen
   you can poke is a phone until a key goes down. Pointer lock belongs to
   the desktop mode only — on a phone it fails, and on a phone with a
   mouse it would be a mistake.
   ===================================================================== */

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', KeyQ: 'left',
  KeyD: 'right', KeyE: 'right',
  ArrowLeft: 'turnLeft', ArrowRight: 'turnRight',
  ShiftLeft: 'run', ShiftRight: 'run',
  /* SPACE IS JUMP NOW, at the user's request, and F is use — the
     arrangement every game since Quake has settled on */
  Space: 'jump', KeyF: 'use',
  ControlLeft: 'attack', ControlRight: 'attack',
  Digit1: 'weapon1', Digit2: 'weapon2', Digit3: 'weapon3', Digit4: 'weapon4',
  Tab: 'map', KeyM: 'map',
  Escape: 'pause', KeyP: 'pause',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.prev = new Set();
    /* A press is remembered until the next sample even if the key is
       already up again: the world ticks 35 times a second and a tap can
       be shorter than that, and a pause key that only works if you hold
       it long enough is a pause key that sometimes does not work. */
    this.latch = new Set();
    this.mouseDown = false;
    this.mouseRight = false;
    this.mouseDX = 0; this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.sensitivity = 0.0022;
    this.invertY = false;
    this.touch = {
      move: { x: 0, y: 0 }, look: { x: 0, y: 0 },
      attack: false, use: false, usePulse: false, jumpPulse: false, run: false, weapon: 0,
    };
    /* WHETHER A PAD IS IN CHARGE, which is a different question from
       which MODE the game is in: a phone with a controller paired is
       still a phone — it has no keyboard, its menus are tapped — but
       while the pad is being used the thumb controls are in the way
       of the picture and are faded off it (see js/touch.js and
       #touch.pad in the CSS). True from the first button or stick
       movement until the next touch, and announced on the way over. */
    this.padHeld = false;
    this.onPadChange = null;
    this._padPrev = [];
    this.hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    /* The first guess. `pointer: coarse` is the browser's word for "the
       main thing pointing at me is a finger", which is a better start
       than "has a touchscreen" — most laptops with one still have a
       trackpad in front of it. Corrected by whatever is used first. */
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.mode = (this.hasTouch && coarse) ? 'touch' : 'desktop';
    this.onModeChange = null;
    this._bind();
  }

  _bind() {
    addEventListener('keydown', e => {
      const a = KEYMAP[e.code];
      /* a fresh press, not the key's auto-repeat, whether or not the
         browser marks repeats */
      const fresh = !e.repeat && !this.keys.has(e.code);
      if (a) { this.keys.add(a); e.preventDefault(); if (fresh) this.latch.add(a); }
      /* raw codes too, so debug keys do not need a mapping entry */
      this.keys.add(e.code);
      if (fresh) this.latch.add(e.code);
      this.setMode('desktop');
    });
    addEventListener('keyup', e => {
      const a = KEYMAP[e.code];
      if (a) this.keys.delete(a);
      this.keys.delete(e.code);
    });
    addEventListener('blur', () => this.keys.clear());

    /* Which device is in charge: decided in the capture phase, before
       anything else sees the event, so the touch layer and the canvas
       always agree on whose turn it is. */
    addEventListener('pointerdown', e => {
      this.setMode(e.pointerType === 'mouse' ? 'desktop' : 'touch');
      /* a finger on the screen takes the controls back from the pad */
      if (e.pointerType !== 'mouse') this.setPadHeld(false);
    }, true);

    this.canvas.addEventListener('mousedown', e => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.mouseRight = true;
      if (!this.locked) this.requestLock();
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRight = false;
    });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'touch') {
      this.exitLock();
      this.mouseDown = this.mouseRight = false;
    } else {
      const t = this.touch;
      t.move.x = t.move.y = 0; t.attack = t.use = t.run = false;
    }
    this.onModeChange?.(mode);
  }

  setPadHeld(on) {
    if (on === this.padHeld) return;
    this.padHeld = on;
    this.onPadChange?.(on);
  }

  requestLock() {
    if (this.mode === 'touch' || !this.canvas.requestPointerLock) return;
    /* newer browsers hand back a promise that rejects when the lock is
       refused, and an unhandled rejection is not a way to say no */
    let p;
    try { p = this.canvas.requestPointerLock(); } catch (e) { return; }
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  exitLock() {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }

  down(name) { return this.keys.has(name); }
  pressed(name) { return this.latch.has(name) || (this.keys.has(name) && !this.prev.has(name)); }

  /** Call once a frame, before anything reads it. */
  sample(dt) {
    const pad = this._gamepad();

    /* THE PAD, AS THE USER LAID IT OUT: the RIGHT stick moves and the
       LEFT stick looks — the other way round from the usual, and the
       user's call. The triggers are the trigger: R2 fires, L2 jumps;
       the bumpers cycle the weapons, L1 back and R1 forward; A is use
       and either stick pressed in is run. */
    const btn = i => !!(pad && pad.buttons[i]?.pressed);
    const padEdge = i => { const now = btn(i), was = !!this._padPrev[i]; this._padPrev[i] = now; return now && !was; };

    let mx = 0, my = 0;
    if (this.down('right')) mx += 1;
    if (this.down('left')) mx -= 1;
    if (this.down('forward')) my += 1;
    if (this.down('back')) my -= 1;
    if (pad) { mx += dead(pad.axes[2]); my -= dead(pad.axes[3]); }
    mx += this.touch.move.x; my += this.touch.move.y;

    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    this.move = { x: mx, y: my };

    let lx = this.mouseDX * this.sensitivity;
    let ly = this.mouseDY * this.sensitivity;
    this.mouseDX = 0; this.mouseDY = 0;

    /* Keyboard turning and the right stick are RATES, so they scale with
       the frame; the mouse and a thumb are displacements and must not. */
    const turn = 2.6 * dt;
    if (this.down('turnLeft')) lx -= turn;
    if (this.down('turnRight')) lx += turn;
    if (pad) {
      lx += dead(pad.axes[0]) * 3.2 * dt;
      ly += dead(pad.axes[1]) * 2.2 * dt;
    }
    lx += this.touch.look.x; ly += this.touch.look.y;
    this.touch.look.x = 0; this.touch.look.y = 0;
    if (this.invertY) ly = -ly;
    this.look = { x: lx, y: ly };

    this.attack = this.mouseDown || this.down('attack') || this.touch.attack || btn(7);
    /* a tap shorter than a tic still counts as one press of Use */
    this.use = this.down('use') || this.touch.use || this.touch.usePulse || btn(0);
    this.touch.usePulse = false;
    this.run = this.down('run') || this.touch.run || btn(10) || btn(11);
    /* JUMP is a press, not a hold: one jump per press of the key, the
       trigger or the button, so holding it down is not a pogo stick */
    this.jump = this.pressed('jump') || this.touch.jumpPulse || padEdge(6);
    this.touch.jumpPulse = false;

    this.weaponSlot = 0;
    if (this.pressed('weapon1')) this.weaponSlot = 1;
    if (this.pressed('weapon2')) this.weaponSlot = 2;
    if (this.pressed('weapon3')) this.weaponSlot = 3;
    if (this.pressed('weapon4')) this.weaponSlot = 4;
    if (this.touch.weapon) { this.weaponSlot = this.touch.weapon; this.touch.weapon = 0; }
    this.weaponCycle = this.wheel; this.wheel = 0;
    if (this.touch.cycle) { this.weaponCycle = this.touch.cycle; this.touch.cycle = 0; }
    if (padEdge(4)) this.weaponCycle = -1;
    if (padEdge(5)) this.weaponCycle = 1;

    /* and whether the pad said anything at all this frame, which is
       what fades the thumb controls off the picture — see padHeld */
    if (pad) {
      let used = false;
      for (let i = 0; i < 4 && !used; i++) if (dead(pad.axes[i])) used = true;
      for (let i = 0; i < pad.buttons.length && !used; i++) if (pad.buttons[i]?.pressed) used = true;
      if (used) this.setPadHeld(true);
    }

    this.pausePressed = this.pressed('pause');
    this.mapPressed = this.pressed('map');

    this.prev = new Set(this.keys);
    this.latch.clear();
  }

  _gamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
}

const dead = v => (Math.abs(v || 0) < 0.18 ? 0 : v);
