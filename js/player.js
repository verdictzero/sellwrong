/* =====================================================================
   GROCERY STORE SIMULATOR — the player
   =====================================================================

   Doom's movement numbers, exactly, because they are the reason it feels
   like Doom and because approximating them gets you something that feels
   like a Doom clone.

     friction     0.90625 a tic
     walk thrust  0.78125 units a tic   ->  8.33 u/tic terminal
     run thrust   1.5625                -> 16.66 u/tic terminal
     strafe       0.75 / 1.25

   Terminal velocity is thrust / (1 - friction), which is where those
   awkward-looking fractions come from: they are 25/32 and 50/32, the
   numbers in Doom's own table. The player accelerates to full speed in
   about a third of a second and slides for about the same again after
   letting go, and that slide is most of what people mean when they say
   the movement has weight.

   NO GRAVITY, NO JUMPING, NO CROUCHING. The player is a cylinder that
   walks, climbs anything 24 or under without slowing down, and cannot
   get over anything taller. Not a simplification — a design. Every
   height in the map means something because the player cannot cheat it.

   THREE WEAPONS, and they are an argument about fire.

     BOXCUTTER  no ammo, no fire, kills one thing at a time. What is left
                when the fuel runs out, which it will.
     FLAMER     the verb the game is named after. A short cone, a lot of
                ignition, and an ammo count that is really a timer on how
                much of the store you can take — which is now literally
                what it is: one unit a tic while the stream pours, and
                nothing in the shop to refill it from.
     MOLOTOV    fire with reach. The answer to an aisle you cannot get
                into and a walkway fire will not cross by itself.
   ===================================================================== */

import { PLAYER_RADIUS, PLAYER_HEIGHT, PLAYER_EYE, MAX_STEP, TICRATE,
         angleNorm, clamp, pRandom, pRandomSpread, dist2 } from './util.js';

/* FOR NOW: the player cannot be hurt. One flag here rather than a
   hundred missing checks, so switching it back on is switching it back
   on. */
export const INVULNERABLE = true;

/* THE TANK EMPTIES NOW, at the user's request, and there is nothing in
   the shop to refill it with — the fuel cans are gone from the level.
   What is left is a tank that fills itself, very slowly, and that one
   decision turns the flamethrower from a hose into a budget.

   THE NUMBERS, and the ratio between them is the whole design:

     TANK          420, and the stream costs one a tic, so twelve
                   seconds of flame with the trigger held down. Enough to
                   walk a fire into three or four aisles, which is all it
                   needs to be: the fire spreads by itself, and the gun
                   is for deciding WHERE.
     REGEN_EVERY   one unit every ten tics, which is three and a half a
                   second and a full tank in two minutes. So a second of
                   firing costs ten seconds of walking, and the honest
                   way to play is short bursts a long way apart.

   It also gives the boxcutter its job back. The note below has said
   since the day it was written that a boxcutter is "what is left when
   the fuel runs out, which it will" — and the fuel did not run out, so
   the boxcutter was never issued. It is now, because an empty tank with
   one weapon in your hands is a dead end rather than a decision. */
export const TANK = 420;
export const REGEN_EVERY = 10;

/* AND THE OTHER TANK, which is the same idea with the numbers turned
   the other way. The extinguisher holds less and fills faster: 260 at
   one a tic is about seven and a half seconds of gas, and a unit every
   six tics is a full bottle in under thirty seconds.

   THE RATIO IS THE DESIGN, and it is the opposite of the flamethrower's.
   A minute of walking buys twelve seconds of setting fire to things,
   because fire is the thing the game is about and it should be rationed.
   Putting a fire out is not rationed nearly as hard, because it is
   defensive, because you are usually doing it under time pressure, and
   because an extinguisher that is empty when the aisle you wanted is
   alight is a weapon that exists to disappoint. It still latches, for
   the same reason the flamer does — a trigger you can stutter is a
   trigger with no cost — but it comes back at a third rather than a
   half, so the wait is nearer ten seconds than sixty. */
export const BOTTLE = 260;
export const CO2_REGEN_EVERY = 6;
export const CO2_REFIRE_AT = 0.34;

/* AND IT WILL NOT FIRE AGAIN UNTIL IT IS HALF FULL, at the user's
   request, which is the knob that turns a budget into a DECISION.

   A tank that refuses only when it is empty is a tank you hold the
   trigger on until it stops and then hold it again the moment one unit
   has trickled back: twelve seconds of flame becomes twelve seconds
   followed by a stutter of tenths, and the ten-seconds-of-walking-per-
   second-of-flame arithmetic above never actually bites. A tank that
   will not light again below half is a tank you have to WALK AWAY FROM
   — a full minute of it — and that minute is the one the fire you have
   already set is doing its own work in.

   Half rather than full because the point is a cooldown and not a
   punishment: coming back at 210 is six seconds of flame, enough to
   commit to the next aisle, and the player who waits longer gets more.
   It latches on empty and clears at half, so the gauge only ever has
   two things to say. */
export const REFIRE_AT = 0.5;

const FRICTION   = 0.90625;
const WALK_FWD   = 25 / 32,  RUN_FWD  = 50 / 32;
const WALK_SIDE  = 24 / 32,  RUN_SIDE = 40 / 32;
const STOP_SPEED = 0.06;
const MAX_PITCH  = 0.72;          // about 41 degrees, the usual port limit

/* THE FLAMETHROWER IS THE GAME AND IT IS NOT SUBTLE.

   A four-metre cone at forty-five degrees, enough damage to delete a
   member of staff in a fraction of a second, and it lays down enough
   accelerant that what it touches goes on burning by itself long after
   you have walked away. There is no aiming. There IS ammo management
   now: the tank holds twelve seconds and fills itself in two minutes,
   and there is nothing in the shop to top it up with.

   The other two are written and finished and are not issued. A boxcutter
   is a more interesting weapon than a flamethrower in almost every game
   ever made, and in THIS game it is the wrong verb: the point is not to
   kill the night crew, it is to burn down the building, and the night
   crew are simply in the way. Give the player one tool that does the
   thing the game is about and the game explains itself. */
export const WEAPONS = {
  FLAMER: {
    slot: 1, name: 'FLAMER', sprite: 'FLMG',
    ready: 'A', fire: ['B', 'C'], fireTics: [2, 2],
    /* CHARGED PER TIC OF STREAM, NOT PER SHOT CYCLE, which is why this
       is 0 and flameTic does the subtracting. A cycle is four tics, so
       per-shot billing made the tank a count of four-tic bursts — and
       what the player experiences is SECONDS OF FLAME, because the
       stream pours every tic the trigger is down whatever the animation
       is doing. Bill the thing that comes out of the nozzle. */
    ammo: 'fuel', ammoPerShot: 0, autofire: true,
    /* and once it is empty it stays out until the tank is back to half
       — see REFIRE_AT. A weapon without this simply needs one unit. */
    refire: REFIRE_AT,
    /* A STREAM, not a cone: every tic the trigger is down, js/flame.js
       sends a few particles out of the nozzle and they fly, drop, and
       light whatever they land on. The reach is theirs to decide. */
    stream: true,
    damage: () => (pRandom() % 9) + 8,
    sound: 'flame',
  },

  /* THE EXTINGUISHER, which does what a fire extinguisher does and then
     two things it does not.

     WHAT IT OBVIOUSLY DOES: the stream takes heat out of the fuel grid
     and puts out what it lands on, store and forest both. It cannot undo
     a burn — fuel that has gone has gone — so what it saves is the aisle
     the fire has not reached yet, which makes it a tool for drawing
     firebreaks rather than an undo button. See FireSystem.douse.

     WHAT IT ALSO DOES: it freezes people. Enough gas on one and they go
     solid — a blue statue that stops running, stops burning if they were
     burning, and blocks the aisle for everybody behind them. They thaw
     if you leave them; fire thaws them much faster; and anything that
     hits them while they are solid shatters them, whole.

     IT IS THE SAME KIND OF THING AS THE FLAMER — a stream, billed per
     tic of pour, with a latch at empty — because the two are meant to be
     held the same way and used against each other. */
  EXTINGUISHER: {
    slot: 2, name: 'EXTINGUISHER', sprite: 'FLMG',
    ready: 'A', fire: ['B', 'C'], fireTics: [2, 2],
    ammo: 'co2', ammoPerShot: 0, autofire: true,
    refire: CO2_REFIRE_AT,
    stream: 'frost',
    damage: () => 0,
    sound: 'flame',
  },

  BOXCUTTER: {
    slot: 1, name: 'BOXCUTTER', sprite: 'CUTG',
    ready: 'A', fire: ['B', 'B', 'C'], fireTics: [4, 4, 5],
    hitAt: 1,                       // which fire frame lands the blow
    ammo: null, melee: true, range: 80, arc: 0.9,
    damage: () => ((pRandom() % 8) + 1) * 2,
    sound: 'swing', hitSound: 'cut',
  },
  MOLOTOV: {
    slot: 3, name: 'MOLOTOV', sprite: 'MOLG',
    ready: 'A', fire: ['B', 'B', 'C', 'C'], fireTics: [6, 6, 8, 12],
    throwAt: 2,
    ammo: 'bottles', ammoPerShot: 1,
    sound: 'throw',
  },
};

export class Player {
  constructor(game, x, y, angle) {
    this.game = game;
    this.x = x; this.y = y; this.angle = angle; this.pitch = 0;
    this.momx = 0; this.momy = 0;
    this.radius = PLAYER_RADIUS;
    this.height = PLAYER_HEIGHT;
    this._near = [];                   // scratch for thingInWay's blockmap query
    this.sector = game.level.sectorAt(x, y);
    this.z = this.sector ? this.sector.floor : 0;

    this.health = 100;
    this.armour = 0;
    this.dead = false;
    this.shootable = true;
    this.monster = false;

    this.ammo = { fuel: TANK, co2: BOTTLE, bottles: 0 };
    this.maxAmmo = { fuel: TANK, co2: BOTTLE, bottles: 12 };
    /* THE LATCH. True from the moment the tank runs out until it is back
       to REFIRE_AT of full, and the only thing that stops the flamer
       firing while there is fuel in it. */
    this.dry = false;
    this.regenTick = 0;
    /* the extinguisher's own latch and its own clock, because the two
       tanks refuse and refill on different terms */
    this.co2Dry = false;
    this.co2Tick = 0;
    /* DEBUG MODE: every tank refills to the top once a tic. Off, saved
       with the rest of the settings, and turned on from the pause menu
       — see fuelTic, which is the whole of it. */
    this.debug = false;
    /* TWO WEAPONS NOW. The molotov is built and tested and stays
       switched off; the boxcutter is issued because the tank empties —
       see the note on TANK. */
    this.owned = { FLAMER: true, EXTINGUISHER: true, BOXCUTTER: true };
    this.weapon = 'FLAMER';
    this.pendingWeapon = null;

    this.fireIndex = -1;      // -1 = at rest
    this.fireTics = 0;
    this.refire = false;

    this.bob = 0; this.bobPhase = 0;
    this.lookRate = 0; this.pitchRate = 0;     // how fast the view is turning, smoothed, for the gun to lag
    this.viewZ = this.z + PLAYER_EYE;
    this.damageFlash = 0;
    this.pickupFlash = 0;
    this.kills = 0;
    this.useCooldown = 0;
  }

  get eyeZ() { return this.viewZ; }

  /* ------------------------------------------------------------------
     One tic
     ------------------------------------------------------------------ */
  tic(input, dt) {
    if (this.useCooldown > 0) this.useCooldown--;
    if (this.damageFlash > 0) this.damageFlash--;
    if (this.pickupFlash > 0) this.pickupFlash--;

    if (this.dead) { this.deathTic(); return; }

    this.turn(input);
    this.move(input);
    this.weaponTic(input);
    this.fuelTic();

    if (input.use && this.useCooldown === 0) { this.use(); this.useCooldown = 8; }
  }

  turn(input) {
    this.angle -= input.look.x;
    this.angle = angleNorm(this.angle);
    this.pitch = clamp(this.pitch - input.look.y, -MAX_PITCH, MAX_PITCH);
    this.lookRate += (input.look.x - this.lookRate) * 0.3;
    this.pitchRate += (input.look.y - this.pitchRate) * 0.3;
  }

  move(input) {
    const run = input.run;
    const fwd = (run ? RUN_FWD : WALK_FWD) * input.move.y;
    const side = (run ? RUN_SIDE : WALK_SIDE) * input.move.x;

    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    this.momx += c * fwd + s * side;
    this.momy += s * fwd - c * side;

    /* Friction, then the dead zone that stops a player drifting for ever
       at a hundredth of a unit a tic. */
    this.momx *= FRICTION; this.momy *= FRICTION;
    if (Math.abs(this.momx) < STOP_SPEED) this.momx = 0;
    if (Math.abs(this.momy) < STOP_SPEED) this.momy = 0;

    const lv = this.game.level;
    let [nx, ny] = lv.slideMove(this.x, this.y, this.momx, this.momy,
                                this.radius, this.z, this.height, false);
    /* Trees stop you too, and you slide round them the way you slide
       along a wall: the whole move, then each axis alone. */
    const forest = this.game.forest;
    if (forest && forest.blocks(nx, ny, this.radius)) {
      if (!forest.blocks(nx, this.y, this.radius)) ny = this.y;
      else if (!forest.blocks(this.x, ny, this.radius)) nx = this.x;
      else { nx = this.x; ny = this.y; }
    }
    /* Bumping into a monster stops you the same way a wall does — and
       being able to shove past them would make every corridor free. */
    const blocked = this.thingInWay(nx, ny);
    if (!blocked) { this.x = nx; this.y = ny; }
    else { this.momx *= 0.2; this.momy *= 0.2; }
    forest?.clampInside(this);

    const sec = lv.sectorAt(this.x, this.y, this.sector);
    if (sec) {
      this.sector = sec;
      /* Step up or down. Instant, like Doom — the smoothing is in the
         view height below, not in the body. */
      this.z = sec.floor;
    }

    /* View bob. Doom's: proportional to the square of the speed, capped,
       and driven by a phase that only advances while you are moving. */
    const speed2 = this.momx * this.momx + this.momy * this.momy;
    const targetBob = Math.min(16, speed2 * 0.32);
    this.bob += (targetBob - this.bob) * 0.25;
    this.bobPhase += 0.19;
    const eye = this.z + PLAYER_EYE + Math.sin(this.bobPhase) * this.bob * 0.5;
    /* the eye lags the feet, so a kerb is a lurch and not a teleport */
    this.viewZ += (eye - this.viewZ) * 0.45;
  }

  thingInWay(nx, ny) {
    /* Nine cells of blockmap. This is asked up to three times per tic —
       once for the whole step and once per axis when it fails — and a
       crowd of eight hundred behind every one of them is a scan the
       player can feel. */
    const bm = this.game.blockmap;
    const list = bm ? bm.near(nx, ny, this._near) : this.game.actors;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.removed || !a.solid || a.dead || a.noclip) continue;
      const rr = this.radius + a.radius;
      if (dist2(nx, ny, a.x, a.y) < rr * rr) {
        if (a.info.pushable) {           // trolleys move, they do not stop you
          const d = Math.hypot(a.x - nx, a.y - ny) || 1;
          a.x += ((a.x - nx) / d) * 6; a.y += ((a.y - ny) / d) * 6;
          this.game.blockmap?.moved(a);
          a.updateSector();
          continue;
        }
        return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------
     Weapons
     ------------------------------------------------------------------ */
  get def() { return WEAPONS[this.weapon]; }
  get firing() { return this.fireIndex >= 0; }

  ammoFor(w) { const d = WEAPONS[w]; return d.ammo ? this.ammo[d.ammo] : Infinity; }
  /* One unit is enough to start: what stops a stream is running dry
     mid-pour, which flameTic notices. */
  hasAmmo(w) { const d = WEAPONS[w]; return !d.ammo || this.ammo[d.ammo] >= Math.max(1, d.ammoPerShot ?? 1); }

  /** Whether it will actually go off. Two different refusals and the
   *  player is told which: nothing in the tank, or something in the tank
   *  and not yet enough of it — see REFIRE_AT. */
  armed(w) { return this.hasAmmo(w) && !(WEAPONS[w].refire && this.latched(w)); }

  /* WHICH TANK IS SULKING. Two streams, two tanks, two latches, and a
     weapon that has neither is never refused. */
  latched(w) {
    const d = WEAPONS[w];
    return d.ammo === 'co2' ? this.co2Dry : d.ammo === 'fuel' ? this.dry : false;
  }

  selectSlot(n) {
    for (const [k, d] of Object.entries(WEAPONS))
      if (d.slot === n && this.owned[k]) { if (k !== this.weapon) this.pendingWeapon = k; return; }
  }

  cycleWeapon(dir) {
    const list = Object.keys(WEAPONS).filter(k => this.owned[k]);
    const i = list.indexOf(this.weapon);
    this.pendingWeapon = list[((i + dir) % list.length + list.length) % list.length];
  }

  weaponTic(input) {
    if (input.weaponSlot) this.selectSlot(input.weaponSlot);
    if (input.weaponCycle) this.cycleWeapon(input.weaponCycle > 0 ? 1 : -1);

    if (this.firing) {
      const d = this.def;
      /* a stream pours every tic the trigger is down, not once a frame */
      if (d.stream) this.flameTic(d);
      if (--this.fireTics > 0) return;
      /* the frame we are ABOUT to leave is the one that does the damage */
      this.fireIndex++;
      if (this.fireIndex === d.hitAt) this.meleeSwing(d);
      if (this.fireIndex === d.throwAt) this.throwBottle();
      if (this.fireIndex >= d.fire.length) {
        this.fireIndex = -1;
        /* holding the button on an automatic goes straight round again */
        if (d.autofire && input.attack && this.armed(this.weapon)) this.startFire();
        return;
      }
      this.fireTics = d.fire ? d.fireTics[Math.min(this.fireIndex, d.fireTics.length - 1)] : 4;
      return;
    }

    /* only swap weapons between shots, never during one */
    if (this.pendingWeapon) {
      this.weapon = this.pendingWeapon;
      this.pendingWeapon = null;
      return;
    }
    /* A REFUSAL IS SILENT NOW, because the corner that used to say why
       is two bars. It does not need words: the bar is red and the pip on
       it is where the trigger starts working again, which is the same
       sentence in the place the player is already looking. */
    if (input.attack && this.armed(this.weapon)) this.startFire();
  }

  startFire() {
    const d = this.def;
    /* `?? 1` and not `|| 1`: the flamethrower declares 0 on purpose,
       because it is billed per tic of stream rather than per shot. */
    if (d.ammo) this.ammo[d.ammo] = Math.max(0, this.ammo[d.ammo] - (d.ammoPerShot ?? 1));
    this.fireIndex = 0;
    this.fireTics = d.fireTics[0];
    this.game.sound?.play(d.sound, this);
    /* Being shot at wakes the store up, and so does setting fire to it. */
    this.game.noise(this, d.autofire ? 900 : 700);
  }

  /** The boxcutter: everything in a cone in front, nearest first. */
  meleeSwing(d) {
    const best = this.game.actorsInCone(this, d.range, d.arc, true);
    if (!best.length) return;
    const a = best[0];
    a.damage(d.damage(), this);
    this.game.sound?.play(d.hitSound, this);
    this.game.spawnPuff(a.x, a.y, a.z + a.height * 0.6);
  }

  /** The flamer: one tic of stream out of the nozzle. Where the nozzle
   *  is on screen is the gun's business (js/weapon3d.js), and where the
   *  flame goes after that is js/flame.js's. */
  flameTic(d) {
    const g = this.game;
    /* THE TANK IS BILLED HERE, and running dry stops the pour in the
       middle of it rather than at the end of a shot cycle: the trigger
       is still down, the arm is still up, and nothing comes out. */
    if (d.ammo) {
      if (this.ammo[d.ammo] <= 0) {
        this.fireIndex = -1;
        /* AND IT LATCHES. Empty is not "wait for one unit", it is "wait
           for a share of a tank" — see REFIRE_AT and CO2_REFIRE_AT — so
           the refusal has to survive the trickle that starts the moment
           this happens. */
        if (d.ammo === 'co2') this.co2Dry = true; else this.dry = true;
        return;
      }
      this.ammo[d.ammo]--;
    }
    /* WHICH STREAM, and it is the only line in the firing path that
       knows there is more than one. Everything above — the billing, the
       latch, the animation, the noise — is the same for both, because
       what a held stream weapon does is the same for both. */
    const stream = d.stream === 'frost' ? g.frost : g.flame;
    if (!stream) return;
    stream.fire(g.nozzle(), this.angle, this.pitch);
  }

  /** A TANK THAT FILLS ITSELF, very slowly. There is nothing in the shop
   *  to refill it from any more, so this is the only source: one unit
   *  every REGEN_EVERY tics, which is a full tank in two minutes. It
   *  runs whatever the player is doing, including while firing — the
   *  stream takes one a tic and this gives back a tenth of one, so
   *  holding the trigger still empties it in about twelve seconds. */
  fuelTic() {
    /* INFINITE AMMO IS THIS BRANCH AND NOTHING ELSE, which is the reason
       it goes here rather than in the firing path. Everything that asks
       a question about ammunition — whether the trigger works, whether
       the latch is on, where the pip sits, how full the gauge draws —
       reads the tank, and this runs once a tic upstream of all of them.
       So the spending still happens exactly as it always did and is
       simply undone before anybody looks, and not one line anywhere else
       in the game has to know the mode exists. */
    if (this.debug) {
      for (const kind of Object.keys(this.maxAmmo)) this.ammo[kind] = this.maxAmmo[kind];
      this.dry = false; this.co2Dry = false;
      this.regenTick = 0; this.co2Tick = 0;
      return;
    }
    this._refill('fuel', REGEN_EVERY, REFIRE_AT, 'regenTick', 'dry');
    this._refill('co2', CO2_REGEN_EVERY, CO2_REFIRE_AT, 'co2Tick', 'co2Dry');
  }

  /** One tank, one tic. Both fill on the same terms and differ only in
   *  the three numbers passed in — see TANK and BOTTLE for why those
   *  numbers are not the same numbers. */
  _refill(kind, every, mark, tickKey, dryKey) {
    const cap = this.maxAmmo[kind];
    if (this.ammo[kind] >= cap) { this[tickKey] = 0; this[dryKey] = false; return; }
    if (++this[tickKey] < every) return;
    this[tickKey] = 0;
    this.ammo[kind] = Math.min(cap, this.ammo[kind] + 1);
    /* and the latch comes off at its mark: the pip on the gauge goes and
       the bar stops being red, which is the whole announcement now */
    if (this[dryKey] && this.ammo[kind] >= cap * mark) this[dryKey] = false;
  }

  /** How full the tank has to be before the flamer will light again,
   *  as a fraction — 0 when it is not waiting on anything. What the HUD
   *  draws the pip at. */
  get refireMark() {
    const d = WEAPONS[this.weapon];
    return d.refire && this.latched(this.weapon) ? d.refire : 0;
  }

  throwBottle() {
    this.game.spawnMolotov(this);
  }

  /* ------------------------------------------------------------------
     Using things
     ------------------------------------------------------------------ */
  use() { this.game.tryUse(this); }

  /* ------------------------------------------------------------------
     Being hurt
     ------------------------------------------------------------------ */
  damage(amount, source, opts = {}) {
    if (this.dead) return;
    if (INVULNERABLE) return;
    if (this.armour > 0) {
      const soak = Math.min(this.armour, Math.floor(amount / 3));
      this.armour -= soak; amount -= soak;
    }
    this.health -= amount;
    this.damageFlash = Math.min(16, 5 + amount * 0.6);
    this.game.sound?.play(opts.fire ? 'burn' : 'hurt', this);
    this.game.onPlayerHurt?.(amount);
    /* the shove, so a hit from the side moves you */
    if (source) {
      const a = Math.atan2(this.y - source.y, this.x - source.x);
      const push = Math.min(6, amount * 0.22);
      this.momx += Math.cos(a) * push; this.momy += Math.sin(a) * push;
    }
    if (this.health <= 0) this.die();
  }

  give(kind, amount) {
    if (kind === 'health') {
      const before = this.health;
      this.health = Math.min(100, this.health + amount);
      if (this.health === before) return false;
    } else {
      const cap = this.maxAmmo[kind] ?? 999;
      if (this.ammo[kind] >= cap) return false;
      this.ammo[kind] = Math.min(cap, this.ammo[kind] + amount);
    }
    this.pickupFlash = 8;
    return true;
  }

  die() {
    this.dead = true;
    this.health = 0;
    this.deathViewTarget = this.z + 8;
    this.game.sound?.play('playerDie', this);
    this.game.onPlayerDied();
  }

  deathTic() {
    /* the view sinks to the floor and stays there */
    this.viewZ += (this.z + 8 - this.viewZ) * 0.12;
    this.momx *= 0.86; this.momy *= 0.86;
    const [nx, ny] = this.game.level.slideMove(this.x, this.y, this.momx, this.momy, this.radius, this.z, 8, false);
    this.x = nx; this.y = ny;
  }
}
