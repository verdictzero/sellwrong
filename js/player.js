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

   GRAVITY AND A JUMP, as of the user's request, and still no crouch.
   The player is a cylinder that walks, climbs anything 24 or under
   without slowing down, and gets over anything up to about forty with
   a jump — see GRAVITY and JUMP_VEL, and the second half of move().
   Every height in the map still means something; it is only that a
   few of them can be cleared with a run at them now.

   FOUR WEAPONS, and three of them are an argument about fire.

     MINIGUN    the user's model, slot four, and the one that is not
                about fire at all: a hundred and forty rounds a second,
                a spin-up, and barrels that glow. See BELT.

     BORE       Turok 2's cerebral bore, the user's model. A red sight,
                a lock on a head, a projectile that finds it, two seconds
                of drilling and then they explode. Five in the magazine
                and one back every twelve seconds; see js/bore.js.
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

/* THE PLAYER CANNOT BE HURT BY FIRE. This flag used to say the player
   could not be hurt at all — one flag rather than a hundred missing
   checks, asked for while nothing in the game fought back — and half
   of that is still wanted: the fire is the player's own weapon, the
   car park goes up in chains the player is standing in the middle of,
   and a game whose only aim is open mayhem should not end because you
   stood too near your own work. What it no longer covers is BEING SHOT.
   The SWAT come up the road now (see js/responders.js), and a trooper
   whose rifle cannot hurt you is scenery with a sound effect. So a
   bullet lands — see damage(), and the `shot` flag hitscan carries —
   and nothing else does. */
export const FIREPROOF = true;

/* ---------------------------------------------------------------------
   WHAT THERE IS OF YOU, IN THREE LAYERS

   At the user's request: two plates of armour over the person, spent
   from the outside in, and a bar on the screen for each. The sizes are
   the user's too — the outer plate ten times what a person is worth,
   the inner one five — so a hit has to eat sixteen hundred before it
   reaches the hundred that kills you, and a trooper's rifle does three
   to fifteen of that.

   THE ORDER IS THE WHOLE FEATURE. It is not Doom's armour, which takes
   a third of every hit for as long as any of it lasts and so drains
   alongside your health rather than in front of it; these are LAYERS,
   and a layer takes everything until there is none of it left. That is
   what makes three bars worth drawing: the top one is the only one
   moving, until it isn't.
   ------------------------------------------------------------------- */
export const HEALTH  = 100;
export const ARMOUR1 = 5 * HEALTH;      // the inner plate
export const ARMOUR2 = 10 * HEALTH;     // and the outer one, which goes first
/* the order they are spent in, outermost first; health is what is left */
export const LAYERS = ['armour2', 'armour1'];

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

/* THE BORE'S MAGAZINE. Five, and one back every twelve seconds — a
   minute for a full magazine, on the same self-filling terms as the
   tanks. It is the slowest thing to refill in the game because it is
   the only thing that never misses: a lock is a kill, so what the
   magazine rations is kills, and five in a row is a queue at the tills
   emptied one skull at a time before you have to wait. No latch: the
   trigger works with one in it. */
export const BORES = 5;
export const BORE_REGEN_EVERY = 12 * TICRATE;

/* THE MINIGUN'S BELT, at the user's request, and the request was
   "absurdly destructive", so the numbers are: four rounds a tic out of
   a belt of three thousand, which is twenty-one seconds of the trigger
   held down at a hundred and forty rounds a second, each of them enough
   to drop a shopper and a burst of them enough to open a van. It fills
   itself one round a tic, so a belt is back in a minute and a half, and
   it latches at a quarter — see REFIRE_AT for why a latch at all.

   AND IT HAS TO SPIN UP. SPIN_UP tics from the trigger going down to
   the first round, SPIN_DOWN from the trigger coming up to the barrels
   stopping; the barrel set on the model turns to match (js/weapon3d.js
   reads Player.spin). A third of a second is long enough to be a
   decision and short enough not to be a wait.

   AND IT HEATS. HEAT_UP seconds of fire takes the barrels from cold to
   the yellow-white of steel that should have stopped, and HEAT_DOWN
   seconds of not firing brings them back. Nothing else happens at the
   top — the glow is the whole of it, at the user's request — but the
   gun tells you how long you have been holding the trigger, which a
   belt gauge only says in a corner. */
export const BELT = 3000;
export const BELT_PER_TIC = 4;
export const BELT_REGEN_EVERY = 1;
export const BELT_REFIRE_AT = 0.25;
export const SPIN_UP = 12;
export const SPIN_DOWN = 28;
export const HEAT_UP = 4 * TICRATE;
export const HEAT_DOWN = 7 * TICRATE;

/* THE PLAYER CAN JUMP NOW, at the user's request, which is the end of
   the NO GRAVITY, NO JUMPING line below and is done the way a Doom port
   does it: a vertical momentum, a gravity that takes a unit a tic off
   it, and a floor that stops it. JUMP_VEL is the push off the ground —
   nine, which with a unit of gravity is forty units of height, enough
   to clear a shelf end or a bonnet and not a gondola. A drop deeper
   than a step is a FALL rather than a snap, on the same gravity, which
   is what makes a jump off the loading dock feel like one. */
export const GRAVITY = 1.0;
export const JUMP_VEL = 9.0;

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

   THE BOXCUTTER IS GONE — deleted rather than switched off, at the
   user's request. It was the melee stand-in, three frames of a forearm
   and a blade, and the note that stood here for a year said a boxcutter
   is the wrong verb for this game. What replaced it is not a melee
   weapon at all: the cerebral bore, below, which is aimed, and is the
   first thing in the player's hands that kills one person at a time on
   purpose. Game.impact, the hook a physical weapon calls, stays for the
   physical weapon that is still coming. The molotov is written, tested
   and still switched off. */
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

  /* THE CEREBRAL BORE. `lock` is the whole of what makes it different
     to hold: the trigger does nothing without a head in the sight (see
     Player.armed, and BoreSystem.lock), and with one the shot is a
     projectile the bore system owns from the launcher onward. Billed a
     bore a shot, out of a magazine that refills itself one at a time —
     see BORES and BORE_REGEN_EVERY. The fire frames are the launcher's
     recoil and nothing else; the model is drawn by js/weapon3d.js, and
     the sprite named here is only the fallback for a model that never
     arrived. */
  BORE: {
    slot: 3, name: 'CEREBRAL BORE', sprite: 'FLMG',
    ready: 'A', fire: ['B', 'C'], fireTics: [5, 14],
    ammo: 'bores', ammoPerShot: 1, lock: true,
    damage: () => 0,
    sound: 'borefire',
  },
  /* THE MINIGUN. `volley` is the whole of what makes it a different
     kind of thing to hold: every tic the trigger is down and the barrels
     are up to speed, `rounds` hitscans leave the nozzle inside `spread`
     radians of where the eye is looking, pitch and all — see volleyTic
     and Game.hitscan. Billed per tic out of the belt like the streams
     are out of their tanks, and latched at empty the same way. The fire
     frames are a two-tic shudder and nothing else; the model, the spin
     and the heat are js/weapon3d.js's. */
  MINIGUN: {
    slot: 4, name: 'MINIGUN', sprite: 'FLMG',
    ready: 'A', fire: ['B', 'C'], fireTics: [1, 1],
    ammo: 'rounds', ammoPerShot: 0, autofire: true,
    refire: BELT_REFIRE_AT,
    volley: true, rounds: BELT_PER_TIC, spread: 0.055,
    damage: () => 24 + (pRandom() % 25),
    sound: 'minigun',
  },
  MOLOTOV: {
    slot: 5, name: 'MOLOTOV', sprite: 'MOLG',
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
    /* and up, which is new: see GRAVITY */
    this.momz = 0;
    this.onGround = true;
    /* tics of grace after a vehicle has thrown you, during which the
       same vehicle cannot throw you again — see damage() and
       SwatVan.runOver */
    this.launched = 0;
    this.radius = PLAYER_RADIUS;
    this.height = PLAYER_HEIGHT;
    this._near = [];                   // scratch for thingInWay's blockmap query
    this.sector = game.level.sectorAt(x, y);
    this.z = this.sector ? this.sector.floor : 0;

    /* THREE BARS, OUTSIDE IN, at the user's request. A hit spends the
       outer plate first, then the inner one, then you — see damage(),
       which is the only place any of the three moves. */
    this.health = HEALTH;
    this.armour2 = ARMOUR2;
    this.armour1 = ARMOUR1;
    this.dead = false;
    this.shootable = true;
    this.monster = false;

    this.ammo = { fuel: TANK, co2: BOTTLE, bores: BORES, rounds: BELT, bottles: 0 };
    this.maxAmmo = { fuel: TANK, co2: BOTTLE, bores: BORES, rounds: BELT, bottles: 12 };
    /* THE LATCH. True from the moment the tank runs out until it is back
       to REFIRE_AT of full, and the only thing that stops the flamer
       firing while there is fuel in it. */
    this.dry = false;
    this.regenTick = 0;
    /* the extinguisher's own latch and its own clock, because the two
       tanks refuse and refill on different terms */
    this.co2Dry = false;
    this.co2Tick = 0;
    /* the bore's magazine has a clock and no latch — see BORES */
    this.boreTick = 0;
    this.boreDry = false;
    /* the minigun's belt: its own latch and clock, and the two numbers
       js/weapon3d.js draws — how fast the barrels are turning, 0..1 of
       full speed, and how hot they are, 0..1 of glowing white */
    this.beltTick = 0;
    this.beltDry = false;
    this.spin = 0;
    this.heat = 0;
    /* whether the trigger has already clicked on this press of it */
    this._clicked = false;
    /* DEBUG MODE: every tank refills to the top once a tic. Off, saved
       with the rest of the settings, and turned on from the pause menu
       — see fuelTic, which is the whole of it. */
    this.debug = false;
    /* AND THE OTHER DEBUG SWITCH, which is one branch in damage() below.
       It is not a heal: it stops you being hurt from the moment it goes
       on, so turned on at forty health you stay at forty for ever. */
    this.invincible = false;
    /* FOUR WEAPONS. The molotov is built and tested and stays switched
       off; the boxcutter is gone; the bore is the third and the minigun
       the fourth — see the note above WEAPONS. */
    this.owned = { FLAMER: true, EXTINGUISHER: true, BORE: true, MINIGUN: true };
    this.weapon = 'FLAMER';
    this.pendingWeapon = null;

    this.fireIndex = -1;      // -1 = at rest
    this.fireTics = 0;
    this.refire = false;
    /* EVERY TIME THE TRIGGER HAS ACTUALLY DONE SOMETHING. Counted here
       and read by js/responders.js, where the first one is what calls
       the police — a refusal is not a shot, so this only ever goes up
       in startFire, which is the one door every weapon goes through. */
    this.shotsFired = 0;

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
    if (this.launched > 0) this.launched--;

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
    if (sec) this.sector = sec;
    const floor = this.sector ? this.sector.floor : this.z;
    const ceil = this.sector ? this.sector.ceil : Infinity;

    /* UP AND DOWN, which used to be one line: z is the floor. It is
       still the floor for as long as you are standing on it — a step up
       or down within MAX_STEP is instant, like Doom, with the smoothing
       in the view height below and not in the body. What is new is
       everything else: a jump is a push off it, a drop deeper than a
       step is a fall, and both run on the same gravity until the floor
       is under you again. See GRAVITY and JUMP_VEL. */
    if (this.onGround && input.jump) {
      this.momz = JUMP_VEL;
      this.onGround = false;
    }
    if (this.onGround && floor < this.z - MAX_STEP) this.onGround = false;   // walked off something
    if (this.onGround) {
      this.z = floor;
      this.momz = 0;
    } else {
      this.momz -= GRAVITY;
      this.z += this.momz;
      /* the ceiling stops a jump the way the floor stops a fall */
      if (this.z + this.height > ceil) { this.z = Math.max(floor, ceil - this.height); if (this.momz > 0) this.momz = 0; }
      if (this.z <= floor) {
        /* LANDED, and the harder the landing the more the knees give:
           the eye dips by a share of the speed it arrived at and the
           smoothing below brings it back up over a few tics */
        const fall = -this.momz;
        this.z = floor;
        this.momz = 0;
        this.onGround = true;
        if (fall > 4) this.viewZ -= Math.min(12, fall * 0.7);
      }
    }

    /* View bob. Doom's: proportional to the square of the speed, capped,
       and driven by a phase that only advances while you are moving. */
    const speed2 = this.momx * this.momx + this.momy * this.momy;
    const targetBob = Math.min(16, speed2 * 0.32);
    this.bob += (targetBob - this.bob) * 0.25;
    if (this.onGround) this.bobPhase += 0.19;
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
  armed(w) {
    if (!this.hasAmmo(w) || (WEAPONS[w].refire && this.latched(w))) return false;
    /* AND A WEAPON THAT NEEDS A LOCK NEEDS A LOCK. This is Turok's rule
       and the whole feel of the bore: it is not a gun you point, it is
       a gun you wait with. */
    if (WEAPONS[w].lock && !this.game.bore?.lock) return false;
    /* AND A GUN THAT HAS TO SPIN UP IS NOT ARMED UNTIL IT HAS: the
       trigger is down, the barrels are winding, and nothing comes out
       for a third of a second — see SPIN_UP and spinTic */
    if (WEAPONS[w].volley && this.spin < 1) return false;
    return true;
  }

  /** THE BARRELS, WINDING UP AND DOWN, AND HOW HOT THEY ARE. Both are
   *  states rather than animations, so js/weapon3d.js draws them and
   *  a pause holds them. The spin climbs while the trigger is down on
   *  a volley weapon that is not latched — a dry belt does not spin,
   *  because a spin that leads to nothing is a promise the gun cannot
   *  keep — and runs down otherwise, faster up than down, the way a
   *  motor and a heavy set of barrels behave. The heat climbs while
   *  rounds are actually leaving and cools the rest of the time. */
  spinTic(input) {
    const d = this.def;
    const want = !!(d.volley && input.attack && !this.latched(this.weapon) && this.hasAmmo(this.weapon));
    const was = this.spin;
    this.spin = clamp(this.spin + (want ? 1 / SPIN_UP : -1 / SPIN_DOWN), 0, 1);
    if (want && was === 0) this.game.sound?.play('spinup', this);
    if (!want && was === 1) this.game.sound?.play('spindown', this);
    const firingRounds = this.firing && d.volley;
    this.heat = clamp(this.heat + (firingRounds ? 1 / HEAT_UP : -1 / HEAT_DOWN), 0, 1);
  }

  /** The minigun: one tic of rounds out of the nozzle. Where the eye is
   *  looking, pitch included, with a little scatter round it, and each
   *  one a hitscan the world resolves — see Game.hitscan. */
  volleyTic(d) {
    const g = this.game;
    if (d.ammo) {
      if (this.ammo[d.ammo] < d.rounds) {
        /* DRY MID-BURST stops it where it stands and latches, the same
           bargain the streams make — see flameTic */
        this.fireIndex = -1;
        this.beltDry = true;
        return;
      }
      this.ammo[d.ammo] -= d.rounds;
    }
    const from = g.nozzle();
    const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
    for (let i = 0; i < d.rounds; i++) {
      const a = this.angle + (pRandom() / 255 - 0.5) * 2 * d.spread;
      const pt = this.pitch + (pRandom() / 255 - 0.5) * 2 * d.spread * 0.7;
      g.hitscan(this, a, 2400, d.damage(), { shot: true, pitch: pt, dx, dy, force: 1.6, from,
                                           spark: (i === 0) });
    }
  }

  /* WHICH TANK IS SULKING. Two streams, two tanks, two latches, and a
     weapon that has neither is never refused. */
  latched(w) {
    const d = WEAPONS[w];
    return d.ammo === 'co2' ? this.co2Dry : d.ammo === 'fuel' ? this.dry : d.ammo === 'rounds' ? this.beltDry : false;
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
    this.spinTic(input);

    if (this.firing) {
      const d = this.def;
      /* a stream pours every tic the trigger is down, not once a frame */
      if (d.stream) this.flameTic(d);
      /* and a volley fires every tic the barrels are up to speed */
      if (d.volley) this.volleyTic(d);
      if (--this.fireTics > 0) return;
      /* the frame we are ABOUT to leave is the one that does the damage */
      this.fireIndex++;
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
    /* EXCEPT THE ONE REFUSAL THAT IS HEARD: a bore with nothing locked
       clicks, once per press, because a trigger that does nothing at
       all is a trigger you press harder. The tanks stay silent — their
       bars say why. */
    else if (input.attack && this.def.lock && !this._clicked) {
      this._clicked = true;
      this.game.sound?.play('noammo', this);
    }
    if (!input.attack) this._clicked = false;
  }

  startFire() {
    const d = this.def;
    /* `?? 1` and not `|| 1`: the flamethrower declares 0 on purpose,
       because it is billed per tic of stream rather than per shot. */
    if (d.ammo) this.ammo[d.ammo] = Math.max(0, this.ammo[d.ammo] - (d.ammoPerShot ?? 1));
    /* AND SOMEBODY HEARD IT. The first one of these is what brings the
       police down the road (js/responders.js); nothing else in here
       needs to know that, which is why it is a count and not a call. */
    this.shotsFired++;
    this.fireIndex = 0;
    this.fireTics = d.fireTics[0];
    this.game.sound?.play(d.sound, this);
    /* the bore leaves the launcher now, at whatever the sight has */
    if (d.lock) this.game.bore?.fire(this);
    /* Being shot at wakes the store up, and so does setting fire to it. */
    this.game.noise(this, d.autofire ? 900 : 700);
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
      this.dry = false; this.co2Dry = false; this.beltDry = false;
      this.regenTick = 0; this.co2Tick = 0; this.beltTick = 0;
      return;
    }
    this._refill('fuel', REGEN_EVERY, REFIRE_AT, 'regenTick', 'dry');
    this._refill('co2', CO2_REGEN_EVERY, CO2_REFIRE_AT, 'co2Tick', 'co2Dry');
    this._refill('bores', BORE_REGEN_EVERY, 0, 'boreTick', 'boreDry');
    this._refill('rounds', BELT_REGEN_EVERY, BELT_REFIRE_AT, 'beltTick', 'beltDry');
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
    /* INVINCIBLE IS THIS BRANCH AND NOTHING ELSE, for the same reason
       infinite ammo is one branch in fuelTic: everything that hurts the
       player in this game arrives here — the rifles, the vans, the fire
       that FIREPROOF already refuses — and the only way out of the level
       alive is health reaching zero on the line below. Refusing the
       whole function is therefore the whole feature, and nothing else in
       the game needs to know the mode exists. It takes the shove with
       it: being knocked sideways by a van is part of being hit by one.

       It does not heal. Turn it on at forty health and you stay at
       forty, which is the honest reading of the word and keeps the
       switch from quietly being two features. */
    if (this.invincible) return;
    /* fire, blasts, the heat of the floor: none of it, by design. A
       bullet or a van are the two things that get through. */
    if (FIREPROOF && !opts.shot && !opts.impact) return;
    /* THREE LAYERS, SPENT OUTSIDE IN, at the user's request, and they
       are LAYERS and not a soak: the outer plate takes the whole of
       every hit until there is none of it left, then the inner one,
       then you. It used to be Doom's armour rule — a third of each hit,
       while any armour lasted — which shares the damage out instead of
       ordering it, and an order is what was asked for and what a stack
       of three bars draws. The overflow carries, so one hit big enough
       goes through all three in the same call. */
    let left = amount;
    for (const layer of LAYERS) {
      if (left <= 0) break;
      const take = Math.min(this[layer], left);
      this[layer] -= take;
      left -= take;
    }
    this.health -= left;
    this.damageFlash = Math.min(16, 5 + amount * 0.6);
    this.game.sound?.play(opts.fire ? 'burn' : 'hurt', this);
    this.game.onPlayerHurt?.(amount);
    /* the shove, so a hit from the side moves you */
    if (source) {
      const a = Math.atan2(this.y - source.y, this.x - source.x);
      const push = Math.min(6, amount * 0.22);
      this.momx += Math.cos(a) * push; this.momy += Math.sin(a) * push;
    }
    /* AND THE LAUNCH, which is what a vehicle does instead of a shove,
       at the user's request: `launch` is a velocity, sideways and up,
       worked out by whatever hit you from how fast it was going (see
       SwatVan.runOver), and it goes straight into the momentum — up as
       well, which is the part a shove never had, so a van at speed puts
       you in the air and the gravity in move() brings you down somewhere
       else. The grace tics stop the same nose hitting you again every
       tic while you are still in front of it. */
    if (opts.launch) {
      const l = opts.launch;
      this.momx += l.x; this.momy += l.y;
      this.momz = Math.max(this.momz, l.z);
      this.onGround = false;
      this.launched = l.grace ?? 24;
      this.game.sound?.play('whack', this);
    }
    if (this.health <= 0) this.die();
  }

  give(kind, amount) {
    if (kind === 'health') {
      const before = this.health;
      this.health = Math.min(HEALTH, this.health + amount);
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
    this.armour2 = 0; this.armour1 = 0;
    this.deathViewTarget = this.z + 8;
    this.game.sound?.play('playerDie', this);
    this.game.onPlayerDied();
  }

  deathTic() {
    /* the view sinks to the floor and stays there */
    this.viewZ += (this.z + 8 - this.viewZ) * 0.12;
    this.momx *= 0.86; this.momy *= 0.86;
    /* a body in the air comes down */
    if (!this.onGround) {
      this.momz -= GRAVITY; this.z += this.momz;
      const floor = this.sector ? this.sector.floor : this.z;
      if (this.z <= floor) { this.z = floor; this.momz = 0; this.onGround = true; }
    }
    const [nx, ny] = this.game.level.slideMove(this.x, this.y, this.momx, this.momy, this.radius, this.z, 8, false);
    this.x = nx; this.y = ny;
  }
}
