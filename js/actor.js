/* =====================================================================
   GROCERY STORE SIMULATOR — actors: the state machine, and Doom's chase
   =====================================================================

   An actor is a position, a state, and a countdown. Every tic the
   countdown drops by one; when it hits zero the actor moves to the next
   state, which sets a new sprite frame, a new countdown, and calls one
   action function. Everything a monster does happens inside an action
   function called from a state, which is why Doom monsters can be
   interrupted but never caught halfway through a decision.

   THE CHASE is P_NewChaseDir, reproduced closely, because it is the
   single most important forty lines in the game and nothing simpler
   behaves like it. A monster does not path-find. It picks whichever of
   eight compass directions points most nearly at you, tries to walk that
   way, and if it cannot, works through the others in a randomised order
   until something gives. What comes out of that is a thing that
   confidently walks into a shelf, hesitates, slides along it, finds the
   end and comes round — with no graph, no nodes, and no map data at all.

   The refusal to turn round unless there is nothing else left
   (`turnaround` is tried last, always) is what stops monsters
   oscillating in a doorway, and is the detail most reimplementations
   drop.

   NOTHING CHASES YOU YET. The two staff monsters that used to are gone
   and the responders that will are not written, so at the moment every
   line about the chase below runs for nobody. It stays exactly as it is,
   for two reasons: it is correct, and getting it correct a second time
   from the same source would take longer than reading it does. When a
   fire crew walks up the road it will walk on this.

   BURNING is this game's own addition and it is deliberately not a
   status effect on a health bar. Anything alight takes damage on a
   timer and LIGHTS WHAT IT IS STANDING ON, so a shopper who catches at
   the end of an aisle does more damage to the store than the shot that
   lit them.
   ===================================================================== */

import * as THREE from 'three';
import { createSpriteMaterial } from './material.js';
import { STATES, ACTORS, stateOf } from './states.js';
import { angleNorm, angleDiff, pRandom, dist, dist2 } from './util.js';
import { swayOf } from './people.js';

/* Doom's eight, in Doom's order. Index 8 is "nowhere to go". */
export const DI = { EAST: 0, NORTHEAST: 1, NORTH: 2, NORTHWEST: 3, WEST: 4, SOUTHWEST: 5, SOUTH: 6, SOUTHEAST: 7, NODIR: 8 };
const DIR_ANGLE = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, -3 * Math.PI / 4, -Math.PI / 2, -Math.PI / 4];
const OPPOSITE = [DI.WEST, DI.SOUTHWEST, DI.SOUTH, DI.SOUTHEAST, DI.EAST, DI.NORTHEAST, DI.NORTH, DI.NORTHWEST, DI.NODIR];
const DIAGONALS = [DI.NORTHWEST, DI.NORTHEAST, DI.SOUTHWEST, DI.SOUTHEAST];

let nextId = 1;

/* =====================================================================
   THE BLOCKMAP, for the crowd

   Doom kept one of these and this game did not, because for a hundred
   and twenty actors a scan of the list is faster than a hash lookup and
   the honest thing is the simple thing. At eight hundred it is not: a
   crowd deciding where to step asks "is anybody standing there" once per
   candidate direction per actor, which against a flat list is the crowd
   squared, and the crowd squared is what stopped the last increase from
   going further.

   So: a hash of cells 128 units across, holding every actor that was
   ever solid. `near` visits the nine cells around a point, which for a
   query radius under a cell is every actor that could possibly overlap
   and no more.

   ONLY THE POSITION HAS TO BE RIGHT. Whether an actor is still solid,
   still alive and still in the world changes in a dozen places — a
   corpse stops being solid, a splat is taken away when the cap is
   reached — and threading grid maintenance through all of them is how
   you get a crowd that can walk through a body one time in a thousand.
   Instead a thing that has stopped being solid stays in the grid and the
   CALLER filters it, exactly as it filtered the flat list. The waste is
   a handful of entries per cell; the guarantee is that the grid can
   never disagree with the world about who is where.
   ===================================================================== */
const BM_CELL = 128;

export class ActorGrid {
  constructor() { this.cells = new Map(); }

  key(x, y) { return (Math.floor(x / BM_CELL) * 4093) ^ Math.floor(y / BM_CELL); }

  add(a) {
    a._bmKey = this.key(a.x, a.y);
    let b = this.cells.get(a._bmKey);
    if (!b) this.cells.set(a._bmKey, b = []);
    b.push(a);
  }

  remove(a) {
    const b = this.cells.get(a._bmKey);
    if (!b) return;
    const i = b.indexOf(a);
    if (i >= 0) b.splice(i, 1);
  }

  /** Called every time something in the grid moves. A move that stays in
   *  the same cell — which most steps are, a step being sixteen units
   *  against a cell of a hundred and twenty-eight — costs one hash. */
  moved(a) {
    const k = this.key(a.x, a.y);
    if (k === a._bmKey) return;
    this.remove(a);
    this.add(a);
  }

  /** Every actor in the nine cells around (x, y). Not a radius test:
   *  the caller is going to test the distance anyway, and a cell is
   *  wider than any radius that asks. */
  near(x, y, out) {
    out.length = 0;
    const gx = Math.floor(x / BM_CELL), gy = Math.floor(y / BM_CELL);
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const b = this.cells.get(((gx + i) * 4093) ^ (gy + j));
        if (b) for (let k = 0; k < b.length; k++) out.push(b[k]);
      }
    return out;
  }

  /** The same, for something that reaches further than a cell — the
   *  circle a fireball clears, say. Rings out to cover the radius. */
  nearRadius(x, y, r, out) {
    out.length = 0;
    const n = Math.ceil(r / BM_CELL);
    const gx = Math.floor(x / BM_CELL), gy = Math.floor(y / BM_CELL);
    for (let j = -n; j <= n; j++)
      for (let i = -n; i <= n; i++) {
        const b = this.cells.get(((gx + i) * 4093) ^ (gy + j));
        if (b) for (let k = 0; k < b.length; k++) out.push(b[k]);
      }
    return out;
  }
}

/* One scratch array, because `near` is called eight times per fleeing
   shopper per step and a fresh array each time is the garbage a
   fixed-tic loop can least afford. Never held across a call. */
const _near = [];
/* and one for A_Flee's eight direction scores, for the same reason */
const _score = new Float64Array(8);

/* HOW FAR A THING IS DRAWN FROM, how far off the view axis, and how
   close is too close to bother asking. See the note on Actor.render. */
const CULL_FAR = 6400;
const CULL_NEAR = 96;
const CULL_COS = Math.cos(80 * Math.PI / 180);

export class Actor {
  constructor(game, typeName, x, y, angle = 0, opts = {}) {
    const info = ACTORS[typeName];
    if (!info) throw new Error('no such actor type: ' + typeName);

    this.id = nextId++;
    this.game = game;
    this.type = typeName;
    this.info = info;
    this.x = x; this.y = y; this.z = 0;
    this.angle = angle;
    this.momx = 0; this.momy = 0; this.momz = 0;

    /* A thing may be given its own size at spawn time. Nothing did
       until the car park filled up: the fleet is six vehicles of five
       different widths, and one radius in a table cannot be all of
       them. */
    this.radius = opts.radius ?? info.radius ?? 16;
    this.height = opts.height ?? info.height ?? 56;
    this.health = info.health ?? 1000;
    this.speed = info.speed ?? 0;
    this.mass = info.mass ?? 100;

    this.monster = !!info.monster;
    this.solid = info.solid ?? !!info.monster;
    this.shootable = info.shootable ?? !!info.monster;
    this.noclip = !!info.noclip;
    this.flammable = !!info.flammable;
    this.fuel = info.fuel ?? 0;
    this.flat = !!info.flat;

    this.target = null;
    this.threshold = 0;
    this.reactiontime = info.reaction ?? 0;
    this.movedir = DI.NODIR;
    this.movecount = 0;
    this.justAttacked = false;
    this.dead = false;
    this.removed = false;

    /* running away — see A_Watch, A_PickExit and A_Flee */
    this.panic = 0;              // tics left frightened
    this.fleeX = 0; this.fleeY = 0;
    /* which way out, and when to think about it again */
    this.exitX = null; this.exitY = null; this.exitTic = 0;

    /* fire */
    this.burning = 0;            // tics left alight
    this.burnTick = 0;
    /* How long something that catches fire has left before it goes off.
       Only things with a `burn` state have one — see ignite() — and
       while it is running they are immune to more fire, because what is
       killing them has already been decided. */
    this.torch = 0;
    this.burnSprite = null;

    /* cold — see chill(), freeze() and shatter() */
    this.frost = 0;              // 0 to FREEZE_AT, and solid at the top
    this.frozen = false;
    this.thawTick = 0;

    this.variant = opts.variant ?? 0;
    this.spriteOverride = opts.sprite || null;

    this.sector = game.level.sectorAt(x, y);
    this.z = this.sector ? this.sector.floor : 0;
    /* things that hang measure down from the ceiling, not up from the
       floor — a light over a shelf is at the same height as one over the
       aisle beside it, and the shelf's floor is 80 units higher */
    if (info.hangBelow && this.sector) this.z = this.sector.ceil - info.hangBelow;

    this.state = null;
    this.stateTics = 0;
    /* A thing with no spawn state never has one: it is a MODEL, drawn by
       something that is not the sprite bank, and the actor exists for its
       radius. Everything downstream tests `state` and stops. */
    if (info.spawn) this.setState(info.spawn);

    this.mesh = null;
    this._lastKey = '';

    /* into the blockmap, if it is the kind of thing anybody has to walk
       round. Solidity can be lost later — see the note on ActorGrid — and
       losing it does not take the entry out. */
    this._bmKey = 0;
    if (info.solid || info.monster) game.blockmap?.add(this);
  }

  /* ------------------------------------------------------------------
     The state machine
     ------------------------------------------------------------------ */
  setState(name) {
    /* A chain of zero-tic states resolves in one go, the way Doom's
       P_SetMobjState does — that is how a state can be a pure action
       with no frame of its own. The counter stops an accidental cycle
       from locking the game up. */
    let guard = 0;
    while (name) {
      const st = stateOf(name);
      if (!st) { this.remove(); return false; }
      this.state = st;
      this.stateTics = st.tics;
      if (st.action) this.doAction(st.action);
      if (this.removed) return false;
      if (st.tics !== 0) return true;
      name = st.next;
      if (++guard > 64) { console.warn('state loop at', st.name); return true; }
    }
    this.remove();
    return false;
  }

  tic() {
    if (this.removed || !this.state) return;
    if (this.burning > 0) this.burnTic();
    if (this.frost > 0) this.frostTic();
    if (this.stateTics === -1) return;          // resting for ever
    if (--this.stateTics > 0) return;
    if (this.state.next) this.setState(this.state.next);
    else this.remove();
  }

  doAction(name) {
    const fn = ACTIONS[name];
    if (fn) fn(this);
    else console.warn('no action', name);
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    this.game.blockmap?.remove(this);
    if (this.mesh) { this.game.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh = null; }
    if (this.burnSprite) { this.burnSprite.remove(); this.burnSprite = null; }
  }

  /* ------------------------------------------------------------------
     Moving
     ------------------------------------------------------------------ */
  get eyeZ() { return this.z + this.height * 0.72; }

  /** Try to walk `speed` units in the current movedir. Doom's P_TryWalk:
   *  either the whole step happens or none of it does — no sliding for
   *  monsters, because sliding is what lets them ooze through gaps a
   *  player could not. */
  tryWalk(dir = this.movedir) {
    if (dir === DI.NODIR) return false;
    const a = DIR_ANGLE[dir];
    const nx = this.x + Math.cos(a) * this.speed;
    const ny = this.y + Math.sin(a) * this.speed;
    if (!this.canStandAt(nx, ny)) return false;
    this.x = nx; this.y = ny;
    this.game.blockmap?.moved(this);
    this.updateSector();
    /* Doom re-randomises movecount here, which is why a monster commits
       to a direction for a while instead of jittering every tic. */
    this.movecount = pRandom() & 15;
    return true;
  }

  canStandAt(nx, ny) {
    const lv = this.game.level;
    const [rx, ry, hit] = lv.slideMove(this.x, this.y, nx - this.x, ny - this.y, this.radius, this.z, this.height, true);
    if (hit || Math.abs(rx - nx) > 0.01 || Math.abs(ry - ny) > 0.01) return false;
    if (this.game.forest && this.game.forest.blocks(nx, ny, this.radius)) return false;
    /* and nothing solid already standing there. Nine cells of blockmap
       rather than the whole cast — see ActorGrid, and the note there
       about why the flags are still tested here. */
    const bm = this.game.blockmap;
    const list = bm ? bm.near(nx, ny, _near) : this.game.actors;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === this || o.removed || !o.solid || o.dead) continue;
      const rr = this.radius + o.radius;
      if (dist2(nx, ny, o.x, o.y) < rr * rr) return false;
    }
    if (this.game.player && !this.game.player.dead) {
      const p = this.game.player;
      const rr = this.radius + p.radius;
      if (dist2(nx, ny, p.x, p.y) < rr * rr) return false;
    }
    return true;
  }

  updateSector() {
    const s = this.game.level.sectorAt(this.x, this.y, this.sector);
    if (s) { this.sector = s; this.z = s.floor; }
  }

  /** Doom's P_NewChaseDir. See the note at the top of the file. */
  newChaseDir() {
    const target = this.target;
    if (!target) { this.movedir = DI.NODIR; return; }
    const olddir = this.movedir;
    const turnaround = OPPOSITE[olddir];

    const dx = target.x - this.x;
    const dy = target.y - this.y;

    let d1 = dx > 10 ? DI.EAST : dx < -10 ? DI.WEST : DI.NODIR;
    let d2 = dy < -10 ? DI.SOUTH : dy > 10 ? DI.NORTH : DI.NODIR;

    /* straight at it, diagonally, if both axes want to move */
    if (d1 !== DI.NODIR && d2 !== DI.NODIR) {
      this.movedir = DIAGONALS[((dy < 0) ? 2 : 0) + ((dx > 0) ? 1 : 0)];
      if (this.movedir !== turnaround && this.tryWalk()) return;
    }

    /* otherwise the bigger axis first — usually. The dice are Doom's:
       one time in five it tries the shorter axis first, which is what
       stops a room full of monsters all taking the same route. */
    if (pRandom() > 200 || Math.abs(dy) > Math.abs(dx)) { const t = d1; d1 = d2; d2 = t; }
    if (d1 === turnaround) d1 = DI.NODIR;
    if (d2 === turnaround) d2 = DI.NODIR;

    if (d1 !== DI.NODIR) { this.movedir = d1; if (this.tryWalk()) return; }
    if (d2 !== DI.NODIR) { this.movedir = d2; if (this.tryWalk()) return; }

    /* nothing obvious left: work round the compass, from a random end */
    if (pRandom() & 1) {
      for (let dir = DI.EAST; dir <= DI.SOUTHEAST; dir++)
        if (dir !== turnaround) { this.movedir = dir; if (this.tryWalk()) return; }
    } else {
      for (let dir = DI.SOUTHEAST; dir >= DI.EAST; dir--)
        if (dir !== turnaround) { this.movedir = dir; if (this.tryWalk()) return; }
    }

    /* and only now, give up and turn round */
    if (turnaround !== DI.NODIR) { this.movedir = turnaround; if (this.tryWalk()) return; }
    this.movedir = DI.NODIR;
  }

  /* ------------------------------------------------------------------
     Seeing and hitting
     ------------------------------------------------------------------ */
  canSee(other) {
    if (!other) return false;
    return !this.game.level.sightBlocked(this.x, this.y, this.eyeZ, other.x, other.y, other.eyeZ);
  }

  /** Doom's 180-degree cone, plus the "or it is right on top of me"
   *  escape that stops you sneaking up on something you are touching. */
  inSightCone(other) {
    if (dist2(this.x, this.y, other.x, other.y) < 128 * 128) return true;
    const a = Math.atan2(other.y - this.y, other.x - this.x);
    return Math.abs(angleDiff(a, this.angle)) <= Math.PI / 2;
  }

  checkMeleeRange() {
    const t = this.target;
    if (!t || !this.info.meleeRange) return false;
    const r = this.info.meleeRange + t.radius;
    if (dist2(this.x, this.y, t.x, t.y) > r * r) return false;
    return this.canSee(t);
  }

  /** Doom's P_CheckMissileRange, simplified but keeping the two bits
   *  that matter: closer means more likely, and there is a floor on how
   *  often it can fire at all. */
  checkMissileRange() {
    const t = this.target;
    if (!t || !this.canSee(t)) return false;
    let d = dist(this.x, this.y, t.x, t.y) - 64;
    if (!this.info.melee && d > 200) d = 200;      // ranged-only pushes harder
    if (d > (this.info.missileRange ?? 1600)) return false;
    /* one roll in 256 scaled by distance: point blank is a near
       certainty, across the shop floor is a maybe */
    return pRandom() >= Math.min(200, d / 8);
  }

  damage(amount, source, opts = {}) {
    if (this.dead || this.removed || !this.shootable) return;
    /* FROZEN AND THEN HIT IS NOT A HIT. Whatever it was — a boxcutter, a
       car going up next to them, one unlucky particle — a person who is
       a block of ice comes apart entirely, and the amount does not enter
       into it. Fire is the exception and is handled a line further on by
       being a thaw rather than a blow. */
    if (this.frozen && !opts.fire) { this.shatter(source); return; }
    /* ALREADY ON FIRE IS ALREADY DEAD, and more fire does not hurry it.
       Something with a `burn` state has a clock running the moment it
       catches (see ignite), and that clock is the only thing that ends
       it — otherwise the stream that lit them kills them in the same
       tenth of a second it always did and nobody ever runs anywhere.
       Everything that is not fire still lands: a boxcutter through
       somebody who is alight still drops them. */
    if (opts.fire && this.torch > 0) return;
    /* THREE CYLINDERS ARE ONE VAN. A vehicle is too long to be one of
       Doom's things, so it is three of them in a row (see carBlockers),
       and a shot into any third of it is a shot into the vehicle — the
       health lives there, not here, or a van would take three times as
       much punishment as it should and come apart in thirds. */
    if (this.vehicle) { this.vehicle.damage(amount, source, opts); return; }
    this.health -= amount;

    if (this.health <= 0) { this.die(source, amount, opts); return; }

    /* Being shot makes a monster look at whoever did it, unless it is
       already very cross with somebody else. */
    if (source && source !== this && (!this.target || this.threshold <= 0)) {
      this.target = source;
      this.threshold = 100;
      if (this.state === stateOf(this.info.spawn) && this.info.see) this.setState(this.info.see);
    }
    if (this.info.painchance && pRandom() < this.info.painchance && this.info.pain) {
      this.setState(this.info.pain);
    }
  }

  die(source, overkill = 0, opts = {}) {
    if (this.dead) return;
    this.dead = true;
    this.solid = false;
    this.shootable = false;
    this.target = null;
    this.height = 8;                 // you can walk over a body

    if (this.info.explodes) { this.game.explode(this); }

    const gibbed = this.info.xdeath && this.health < (this.info.gibHealth ?? -1000);
    const st = gibbed ? this.info.xdeath : this.info.death;
    if (st) this.setState(st);
    else this.remove();

    if (this.monster) this.game.onMonsterKilled(this, source);
    if (this.type === 'LAMP') this.game.onLampDestroyed(this);
  }

  /* ------------------------------------------------------------------
     On fire

     Damage on a timer, a flame drawn on top, and — the part that makes
     it worth having — it keeps setting light to the floor it walks over.
     ------------------------------------------------------------------ */
  ignite(tics = 350) {
    if (!this.flammable || this.removed) return;
    if (this.vehicle) { this.vehicle.ignite(tics); return; }
    /* FIRE THAWS BEFORE IT BURNS. A frozen person cannot catch — there
       is a centimetre of ice in the way — so the flame spends itself
       taking the frost off, and only once it is off does the next
       particle light them. Which means the flamethrower is the tool for
       undoing the extinguisher, and that it takes a moment. */
    if (this.frost > 0) {
      this.frost = Math.max(0, this.frost - Actor.FIRE_THAW * 2);
      if (this.frost > 0) return;
      this.thaw();
    }
    const wasAlight = this.burning > 0;
    this.burning = Math.max(this.burning, tics);
    /* AND SOME THINGS RUN WITH IT. A `burn` state is a thing that does
       not simply stand there and take the damage: it is set alight, it
       is given a countdown, and what it does with the countdown is its
       own business — for a shopper, A_Torch, which is running. The fire
       is made to outlast the countdown so nobody goes out before they go
       off. */
    if (!wasAlight && this.info.burn && !this.dead) {
      const [lo, hi] = this.info.burnTics ?? [120, 240];
      this.torch = Math.round(lo + (pRandom() / 255) * (hi - lo));
      this.burning = Math.max(this.burning, this.torch + 20);
      /* THEIR OWN FRIGHT FIRST, and this order is not cosmetic: the
         scare below reaches everybody in range and A_Scare puts a
         first-time panicker into `info.see`, which for a shopper is the
         ordinary running state. Frighten them before they are in it and
         the burn state is clobbered one line after it was set. Already
         at full panic, A_Scare leaves them alone. */
      this.panic = this.info.panicTics ?? 280;
      this.setState(this.info.burn);
      /* and everybody near them leaves: a person on fire is the loudest
         warning in the building, and it is running towards them */
      if (this.info.burnScare) this.game.scare?.(this.x, this.y, this.info.burnScare);
    }
    if (!wasAlight) {
      this.game.sound?.play('ignite', this);
      /* and anything with a voice uses it */
      if (this.info.painSound) this.game.sound?.play(this.info.painSound, this);
      /* Whatever this thing is worth as fuel goes into the floor under
         it the moment it catches — a pallet of stock alight is a fire in
         the AISLE, not a fire on a prop. */
      if (this.fuel > 0) this.game.fire?.ignite(this.x, this.y, this.fuel);
    }
  }

  burnTic() {
    this.burning--;
    if (this.burning <= 0) { this.burning = 0; if (this.burnSprite) { this.burnSprite.remove(); this.burnSprite = null; } return; }
    /* A TORCH DROPS FIRE MORE OFTEN than a thing standing still burning,
       and for a reason that is arithmetic rather than drama: it is
       moving eight units a tic, so twelve tics between drops is a trail
       with ninety-six-unit holes in it — three cells of a thirty-two
       unit grid, missed. Close the gaps and a burning shopper CARRIES
       the fire across a cross-aisle instead of merely dying on the far
       side of it. */
    const torched = this.torch > 0;
    if (++this.burnTick >= (torched ? this.info.burnTrail ?? 12 : 12)) {
      this.burnTick = 0;
      if (!this.dead) this.damage(this.monster ? 4 : 8, this.game.player, { fire: true });
      /* it drags the fire along behind it, and something that is RUNNING
         drags a line rather than a dot — see burnTrail, burnFuel and
         burnRadius on the actor type for why those three numbers are the
         ones they are. */
      if (torched) this.game.fire?.ignite(this.x, this.y, this.info.burnFuel ?? 26, this.info.burnRadius ?? 1);
      else this.game.fire?.ignite(this.x, this.y, 26);
    }
  }


  /* ------------------------------------------------------------------
     FROZEN

     The other end of the same dial, and it is deliberately NOT the
     mirror image of being on fire. Fire is a countdown somebody else
     started: you catch, you run, you go off, and nothing you or the
     player does in between changes the ending. Cold is a STATE you are
     held in and can come out of — which is the only reason it is worth
     having a second stream in the game at all.

     THREE THINGS CAN HAPPEN TO A FROZEN PERSON and the player picks:

       leave them      the frost bleeds off and they thaw, get up and
                       carry on shopping, which is the outcome that
                       makes freezing them a DECISION rather than a
                       slower way of killing them
       burn them       fire eats frost much faster than time does, so a
                       flamethrower is a thawing tool, and the person
                       who comes out the other side is on fire
       break them      anything that hits a frozen person shatters them,
                       whole, into bloody frozen chunks

     AND ICE IS SOLID, which is the part that makes this a level-design
     tool as well as a weapon. A frozen shopper stops being something you
     walk through and becomes something you walk around — and so does
     everybody else, including the crowd running for the doors.
     ------------------------------------------------------------------ */

  /** How much cold it takes, and how long the thaw is. Public because
   *  the extinguisher's stream is billed against them. */
  static FREEZE_AT = 100;      // frost units before they go solid
  static THAW_EVERY = 6;       // tics per unit bled back off
  static FIRE_THAW = 14;       // and per tic of fire, which is 84x faster

  /**
   * Put cold into something. Below the threshold this is just a tint and
   * a slowing; at the threshold it goes solid.
   *
   * Returns true if this was the call that froze it.
   */
  chill(amount) {
    if (this.removed || this.dead || !this.info.freezable) return false;
    /* IT PUTS THE FIRE OUT ON THE WAY PAST, which is the obvious thing a
       fire extinguisher does to a person who is alight and the thing
       that would be most annoying if it did not. A torch that is going
       out loses its countdown with it — they were going to explode and
       now they are not. */
    if (this.burning > 0) {
      this.burning = Math.max(0, this.burning - amount * 4);
      this.torch = Math.max(0, this.torch - amount * 4);
      if (this.burning <= 0 && this.burnSprite) { this.burnSprite.remove(); this.burnSprite = null; }
    }
    if (this.frozen) { this.frost = Actor.FREEZE_AT; return false; }
    this.frost = Math.min(Actor.FREEZE_AT, this.frost + amount);
    if (this.frost >= Actor.FREEZE_AT) { this.freeze(); return true; }
    return false;
  }

  freeze() {
    if (this.frozen || this.removed || this.dead) return;
    this.frozen = true;
    this.frost = Actor.FREEZE_AT;
    this.burning = 0; this.torch = 0;
    if (this.burnSprite) { this.burnSprite.remove(); this.burnSprite = null; }
    /* A BLOCK OF ICE IS SOLID whether or not the thing inside it was.
       It also stops thinking: the state is parked with tics -1, which is
       this engine's "rest here for ever", and thawing sets it going
       again from wherever it was. */
    this._thawState = this.info.freezeReturn || this.info.see || this.info.spawn;
    this.solid = true;
    this.panic = 0;
    if (this.info.frozen) this.setState(this.info.frozen);
    this.stateTics = -1;
    this.game.sound?.play('freeze', this);
  }

  /** Bleeding the cold back off, once a tic. */
  frostTic() {
    if (this.removed) return;
    /* FIRE WINS, and by a wide margin: the thaw is one unit every six
       tics on its own and FIRE_THAW a tic while something is burning
       where they stand, so walking a flame over a frozen aisle unpicks
       it in under a second. Standing in a hot cell counts — you do not
       have to hit them, you have to make it warm. */
    const hot = this.game.fire ? this.game.fire.heatAt(this.x, this.y) : 0;
    if (hot > 0.2 || this.burning > 0) {
      this.frost = Math.max(0, this.frost - Actor.FIRE_THAW * (this.burning > 0 ? 1 : hot));
    } else if (++this.thawTick >= Actor.THAW_EVERY) {
      this.thawTick = 0;
      this.frost--;
    }
    if (this.frost < 0) this.frost = 0;
    /* THEY COME OUT AT NOTHING AND NOT AT THE THRESHOLD, which is the
       difference between being frozen and flickering. Freezing happens
       at FREEZE_AT and thawing at zero, so the state has hysteresis and
       the whole of the frost bar is the time they spend solid — six tics
       a unit is about seventeen seconds. Thawing the moment the number
       dipped under the line, which is what this did first, meant a
       shopper was a block of ice for six tics and then walked off. */
    if (this.frozen && this.frost <= 0) this.thaw();
  }

  /** Out of the ice and back to whatever they were doing, which for a
   *  shopper is running, because being frozen solid is not something you
   *  shrug off and go back to the shelves about. */
  thaw() {
    if (!this.frozen) return;
    this.frozen = false;
    this.solid = this.info.solid ?? !!this.info.monster;
    this.panic = this.info.panicTics ?? 280;
    const st = this._thawState;
    if (st) this.setState(st);
  }

  /** Frozen and then hit: the whole person at once, in pieces. There is
   *  no health left to take off and no death state to run — a thing made
   *  of ice does not fall over, it stops existing in one frame. */
  shatter(source) {
    if (this.removed) return;
    this.dead = true;
    this.solid = false;
    this.shootable = false;
    this.game.giblets?.shatter(this);
    if (this.monster) this.game.onMonsterKilled(this, source);
    this.remove();
  }

  /* ------------------------------------------------------------------
     Drawing

     One quad per actor, spun about Y only, with the frame and rotation
     chosen fresh each render. Nothing is cached across frames because
     both can change every tic and the lookup is a Map hit.
     ------------------------------------------------------------------ */
  ensureMesh() {
    if (this.mesh) return;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);          // the foot of the quad is the origin
    const mat = createSpriteMaterial(null, { alphaTest: 0.5, transparent: false, width: 64, height: 64 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;   // the quad is spun in the shader,
    this.game.scene.add(this.mesh);    // so its bounds are a lie
  }

  /* ------------------------------------------------------------------
     DO NOT DRAW WHAT CANNOT BE SEEN

     Every standee is its own mesh with its own material — it has to be,
     because the quad is spun and scaled by uniforms — so a crowd of
     seven hundred is seven hundred draw calls and seven hundred uniform
     updates a frame. And it was ALL of them, every frame, however far
     away and whether or not they were behind you: these meshes say
     frustumCulled = false, because a quad the shader turns has bounds
     that are a lie, so three.js was not allowed to cull any of them.

     So it is done here, where the lie does not matter, with the two
     tests that are safe for a billboard:

       BEHIND THE EYE. Every sprite in the game is turned to the camera
       PLANE rather than the camera point, so a thing far enough behind
       that plane is edge-on and invisible by construction.

       TOO FAR TO MATTER. Past the end of the parade, and well past
       where the distance falloff has taken a standee to its darkest
       step.

     The cone is deliberately generous — it keeps everything within
     eighty degrees of the view axis, against a horizontal field of
     about forty-eight — because a sprite is as wide as it is and
     popping one in at the edge of the screen is worse than drawing it.
     Even so it is most of the crowd: the half behind you, plus what is
     out to the sides. Anything closer than three metres is never culled
     at all, whatever the angle, because at that range the quad is wider
     than the screen.
     ------------------------------------------------------------------ */
  render(camX, camY, billboardRot, viewX = 0, viewY = 0) {
    if (this.removed || !this.state) return;
    const dx = this.x - camX, dy = this.y - camY;
    const d2 = dx * dx + dy * dy;
    if (d2 > CULL_FAR * CULL_FAR ||
        (d2 > CULL_NEAR * CULL_NEAR && (viewX !== 0 || viewY !== 0) &&
         dx * viewX + dy * viewY < Math.sqrt(d2) * CULL_COS)) {
      if (this.mesh) this.mesh.visible = false;
      return;
    }
    this.ensureMesh();
    this.mesh.visible = true;

    /* Which of the eight views. rot 0 is head-on. */
    let rot = 0;
    if (!this.flat) {
      const toViewer = Math.atan2(camY - this.y, camX - this.x);
      const rel = angleNorm(this.angle - toViewer);
      rot = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
    }

    /* `variants` picks CAR0..CAR4 style sprite sets off one actor type.
       Nothing declares it since the placeholder cars came out; it is left
       standing because it is the hook the real cars will want. */
    const spr = this.spriteOverride || (this.info.variants
      ? this.state.sprite.slice(0, 3) + (this.variant % this.info.variants)
      : this.state.sprite);
    const entry = this.game.sprites.get(spr, this.state.frame);
    const key = entry.key + rot;
    const u = this.mesh.material.uniforms;
    if (key !== this._lastKey) {
      this._lastKey = key;
      u.map.value = this.game.sprites.texture(entry, rot);
      const s = entry.scale;
      u.spriteScale.value.set(entry.w * s, entry.h * s);
    }
    u.billboardRot.value = billboardRot;
    u.fullbright.value = (this.info.fullbright || this.state.fullbright) ? 1 : 0;
    u.light.value = this.sector ? this.sector.light : 0.7;
    /* HOW FROZEN, straight onto the shader that does the colour map.
       It runs up before the threshold as well as at it, so somebody the
       spray has caught but not yet held goes pale and blue first — the
       player can see it working, which is the whole of the feedback this
       weapon has. */
    if (u.frost) u.frost.value = Math.min(1, this.frost / Actor.FREEZE_AT);
    /* A car in the back row of the car park has to diminish the way the
       tarmac under it does, or it turns into a silhouette while the bay
       around it stays lit. */
    if (u.sky) u.sky.value = this.sector ? (this.sector.sky ?? (this.sector.outdoor ? 1 : 0)) : 0;
    /* A standee leans where it stands, or a shop floor of them is a shop
       floor of cardboard. Two sines, phased off the actor's own id, and
       nothing in the simulation moves — this is a drawing offset and the
       thing itself is exactly where the collision says it is. */
    if (this.info.sway) {
      const s = swayOf(this, this.game.tics);
      this.mesh.position.set(this.x + s.dx, this.z + (entry.lift || 0) + s.dz, -(this.y + s.dy));
    } else {
      this.mesh.position.set(this.x, this.z + (entry.lift || 0), -this.y);
    }
  }
}

/* =====================================================================
   Action functions

   Called by name from the state tables. Each one is the whole of what
   the monster does at that moment.
   ===================================================================== */
export const ACTIONS = {
  /* Standing about until somebody walks into the aisle. */
  A_Look(a) {
    const p = a.game.player;
    if (!p || p.dead) return;
    if (!a.canSee(p)) return;
    if (!a.inSightCone(p)) return;
    if (dist2(a.x, a.y, p.x, p.y) > (a.info.sightRange ?? 2000) ** 2) return;
    a.target = p;
    a.game.sound?.play(a.info.seeSound, a);
    if (a.info.see) a.setState(a.info.see);
  },

  /* The whole of a monster's decision-making, once per walk frame. */
  A_Chase(a) {
    if (a.reactiontime > 0) a.reactiontime--;
    if (a.threshold > 0) {
      if (!a.target || a.target.dead) a.threshold = 0;
      else a.threshold--;
    }

    /* lost it? look for something else, else go back to standing */
    if (!a.target || a.target.dead) {
      const p = a.game.player;
      if (p && !p.dead && a.canSee(p) && dist2(a.x, a.y, p.x, p.y) < (a.info.sightRange ?? 2000) ** 2) {
        a.target = p;
      } else {
        a.setState(a.info.spawn);
        return;
      }
    }

    /* Never twice in a row. Doom's rule, and the reason a monster that
       has just shot at you takes a step before it shoots again — which
       is the window you actually play in. */
    if (a.justAttacked) { a.justAttacked = false; a.newChaseDir(); return; }

    if (a.info.melee && a.checkMeleeRange()) {
      a.game.sound?.play(a.info.attackSound, a);
      a.setState(a.info.melee);
      return;
    }
    if (a.info.missile && !a.movecount && a.checkMissileRange()) {
      a.setState(a.info.missile);
      a.justAttacked = true;
      return;
    }

    if (--a.movecount < 0 || !a.tryWalk()) a.newChaseDir();

    /* the occasional groan from somewhere in the store */
    if (pRandom() < 3) a.game.sound?.play(a.info.activeSound, a);

    /* face the way it is going */
    if (a.movedir !== DI.NODIR) a.angle = DIR_ANGLE[a.movedir];
  },

  A_FaceTarget(a) {
    if (!a.target) return;
    a.angle = Math.atan2(a.target.y - a.y, a.target.x - a.x);
  },

  /* A person, briefly, becomes thirteen things and a fireball. All of
     it is in js/people.js; this is the one line of state table that sets
     it off. */
  A_Gib(a) { a.game.giblets?.burst(a); },

  /* ------------------------------------------------------------------
     ON FIRE AND STILL GOING

     One call every two tics for as long as the countdown ignite() set
     has left, and then they go off. Three things happen in it and all
     three matter:

     THEY RUN, on A_Flee, which is the same door-seeking walk a
     frightened shopper uses — so somebody alight heads for an exit and
     takes the fire through every cross-aisle on the way rather than
     wandering.

     THEY DO NOT CALM DOWN. The panic is put back every call, which also
     makes them the strongest source of the contagion in A_Watch: a
     burning person running down an aisle empties it, and the people it
     empties carry the fright on.

     AND THEN THEY GO OFF, wherever they got to — health to zero and the
     ordinary death, so it is the same fireball, the same thirteen
     pieces and the same nine hundred units of everybody else leaving
     that the stream used to produce on the spot. The bang is not extra
     code; it is the code that was always there, moved to the end of a
     run rather than the start of one.
     ------------------------------------------------------------------ */
  A_Torch(a) {
    a.panic = Math.max(a.panic, a.info.panicTics ?? 280);
    ACTIONS.A_Flee(a);
    if (a.dead || a.removed) return;
    /* BY THE LENGTH OF THE FRAME, not by one. This runs every two tics,
       so decrementing by one made `burnTics` mean twice what it says and
       a shopper burn for fourteen seconds where the table asked for
       seven. The frame knows how long it is; ask it. */
    a.torch -= a.state.tics;
    if (a.torch > 0) return;
    a.torch = 0;
    a.health = 0;
    a.die(a.game.player, 0, { fire: true });
  },

  /* ------------------------------------------------------------------
     RUNNING AWAY

     Standing still and smelling the air. Nine samples of the fire grid —
     where the actor is and eight points round it at its scare range — is
     enough to know both THAT there is a fire and WHICH WAY it is, which
     is the part a single sample cannot give you and the part that
     decides which way to run.
     ------------------------------------------------------------------ */
  A_Watch(a) {
    const g = a.game;
    if (a.burning) { ACTIONS.A_Scare(a, a.x, a.y); return; }
    const F = g.fire;
    if (!F) return;
    const R = a.info.scareRange ?? 320;
    let hot = 0, hx = 0, hy = 0, hw = 0;
    for (let k = 0; k < 9; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const x = k === 8 ? a.x : a.x + Math.cos(ang) * R;
      const y = k === 8 ? a.y : a.y + Math.sin(ang) * R;
      const h = F.heatAt(x, y);
      if (h < 0.22) continue;
      hot++; hx += x * h; hy += y * h; hw += h;
    }
    if (hot) { ACTIONS.A_Scare(a, hx / hw, hy / hw); return; }
    /* AND THEN THE PART THAT IS NOT ABOUT FIRE AT ALL.

       Nine samples of the fire grid is a person who can see flames.
       Nobody in a supermarket finds out about a fire that way: they find
       out because the aisle in front of them is suddenly full of people
       going the other way. Without that, a shop this size behaves as
       hundreds of independent people who each notice at 320 units, and
       the front end stands at the tills while the back of the store
       burns — which is not what a crowd does and, with a fire six times
       faster than it used to be, meant most of them never started
       moving until it was on them.

       So panic is contagious, and it travels at the speed of somebody
       running past you. It borrows the panic it catches — the point
       being run FROM comes across with it, so a stampede goes one way
       rather than each new person choosing afresh from where they happen
       to be standing.

       It cannot start itself: every chain of this ends at somebody who
       actually saw the fire in the loop above, and if the shop is not
       alight there is nothing to catch.

       AND IT HAS TO RUN DOWN, which is the part that took two goes. A
       fright handed on at full strength is a loop: two people in the
       woods four hundred units behind the store, neither of them able to
       see a fire, each renewing the other for the rest of the level —
       which is exactly what happened, six hundred of them, running on
       the spot in the trees. So what is passed on is what is LEFT minus
       a bit, a rumour weakens with every telling, and a chain of it dies
       after about a dozen hops unless somebody along it can actually see
       the fire and start a fresh one. */
    const SEE = 190;                    // near enough to see their face
    const FADE = 24;                    // what a telling costs
    for (const o of g.blockmap.near(a.x, a.y, _near)) {
      if (o === a || o.removed || o.dead || o.panic <= FADE * 2) continue;
      if (dist2(a.x, a.y, o.x, o.y) > SEE * SEE) continue;
      ACTIONS.A_Scare(a, o.fleeX, o.fleeY, o.panic - FADE);
      return;
    }
  },

  /** Frighten one actor, away from a point. Called by A_Watch, and by
   *  anything else that ought to clear a room — see Game.scare.
   *
   *  `tics` is how long the fright lasts and it is only ever passed by
   *  the contagion in A_Watch, which passes LESS than it caught. See
   *  the note there: a fright that is handed on at full strength is a
   *  crowd that never calms down, and the woods behind the store filled
   *  up with six hundred people running on the spot for ever because two
   *  of them could see each other. */
  A_Scare(a, x, y, tics) {
    const full = a.info.panicTics ?? 280;
    const want = Math.min(full, tics ?? full);
    if (want <= a.panic) { a.fleeX = x; a.fleeY = y; return; }
    const first = a.panic <= 0;
    a.panic = want;
    a.fleeX = x; a.fleeY = y;
    if (first) {
      a.game.sound?.play(a.info.painSound, a);
      if (a.info.see) a.setState(a.info.see);
      a.exitTic = 0;                 // pick a way out on the next step
    }
  },

  /* ------------------------------------------------------------------
     WHICH WAY OUT

     The map publishes every way out of the building as a point on the
     OUTSIDE of it — six fire exits down the flanks and the two front
     sliders; see level.exits in js/maps/sellwrong.js. This picks one.

     NEAREST IS NOT ENOUGH, and the case that proves it is the one that
     happens most: a fire at the west end of the mid cross-aisle is
     nearest to the west mid exit for everybody standing in it, including
     the people the fire is between. So an exit is charged for being
     close to the thing being run from, and the charge is large enough to
     lose a thousand units of walking — because a longer way out you can
     use beats a shorter one you cannot.

     RE-PICKED ON A TIMER, not every step. The two terms both drift, and
     a shopper who re-decides every step in the region where two exits
     score the same walks on the spot between them. Once a second is
     often enough to notice the aisle ahead has caught, and rare enough
     that the decision holds long enough to act on.
     ------------------------------------------------------------------ */
  A_PickExit(a) {
    const list = a.game.level.exits;
    a.exitTic = 35 + (a.id & 15);
    a.exitX = a.exitY = null;
    if (!list || !list.length) return;
    /* Somebody already outdoors does not need a door. They need to keep
       going, which is what the plain flee below does. */
    if (a.sector && a.sector.outdoor) return;
    let best = null, bestScore = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const score = dist(a.x, a.y, e.x, e.y)
                  + Math.max(0, 1400 - dist(e.x, e.y, a.fleeX, a.fleeY)) * 1.6;
      if (score >= bestScore) continue;
      bestScore = score; best = e;
    }
    if (best) { a.exitX = best.x; a.exitY = best.y; }
  },

  /* One step of getting out of here.

     NOT Doom's chase with the sign flipped. P_NewChaseDir walks toward a
     thing and its whole cleverness is about not oscillating in a
     doorway; running away is a different problem, because the thing you
     are running from is a REGION and the wrong step is not a step that
     wastes time, it is a step into the fire. So the eight directions are
     SCORED — how much closer to the way out it gets you, minus how hot
     it is where you would land, minus a little for turning — and the
     best walkable one wins.

     AND THERE IS A WAY OUT NOW, which changed what this function is.
     Running AWAY from a fire in a supermarket takes you to the back of
     the shop and then into a corner, because that is what "away" means
     inside a rectangle with one door in it: the crowd used to pile into
     the frozen aisle and cook. So the target is an EXIT and the fire is
     only a penalty on the step — get further from the flames if you can,
     but get to the door either way. The two behaviours are the same
     eight-way scorer with the sign of one term flipped, which is why
     they are one function and not two.

     GREEDY, AND IT WORKS HERE FOR A REASON WORTH WRITING DOWN. Hill
     climbing toward a point gets stuck in dead ends, and a supermarket
     is nothing but dead ends — except that every aisle in this one runs
     north-south and opens onto a cross-aisle at BOTH ends, and every
     exit sits on a cross-aisle. So from anywhere in an aisle the door is
     never at your own y: moving toward the nearer cross-aisle always
     gets you closer to it, and the aisle you are in is a corridor to
     somewhere rather than a pocket. No graph, no nodes, and eight
     hundred of them cost eight distance calls each. */
  A_Flee(a) {
    const g = a.game, F = g.fire;
    if (--a.panic <= 0 && !a.burning) {
      /* only settle if it is actually clear here */
      if (!F || F.heatAt(a.x, a.y) < 0.15) { a.setState(a.info.spawn); return; }
      a.panic = 35;
    }
    if (--a.exitTic <= 0) ACTIONS.A_PickExit(a);
    /* Toward the door if there is one to head for, away from the fire if
       there is not — which is anybody already outside, and anybody on a
       map that has no exits declared. */
    const out = a.exitX !== null && a.exitX !== undefined;
    const tx = out ? a.exitX : a.fleeX, ty = out ? a.exitY : a.fleeY;
    const sign = out ? -1 : 1;              // closer is better, or further is
    const step = a.speed;
    const d0 = dist(a.x, a.y, tx, ty);
    for (let d = 0; d < 8; d++) {
      const ang = DIR_ANGLE[d];
      const nx = a.x + Math.cos(ang) * step, ny = a.y + Math.sin(ang) * step;
      /* two steps ahead for the heat, so it does not run into a wall of
         fire one step short of noticing it */
      const fx = a.x + Math.cos(ang) * step * 4, fy = a.y + Math.sin(ang) * step * 4;
      let score = (dist(nx, ny, tx, ty) - d0) * 3 * sign;
      if (F) score -= (F.heatAt(nx, ny) * 260 + F.heatAt(fx, fy) * 140);
      if (d === a.movedir) score += 6;                       // keep going
      if (d === OPPOSITE[a.movedir]) score -= 10;            // not straight back
      score += (pRandom() / 255 - 0.5) * 4;
      _score[d] = score;
    }
    /* IN SCORE ORDER, all eight of them. This used to be "the best, then
       a random order over the rest", which is Doom's fallback and is
       right for a monster that has lost sight of you and wrong for
       somebody with a door in mind: the second-best direction at the end
       of an aisle is the one that goes round the gondola, and picking at
       random instead threw that away half the time. A selection sort over
       eight is sixty-four compares and no allocation. */
    for (let k = 0; k < 8; k++) {
      let best = -1, bestScore = -Infinity;
      for (let d = 0; d < 8; d++)
        if (_score[d] > bestScore) { bestScore = _score[d]; best = d; }
      if (best < 0) break;
      _score[best] = -Infinity;
      if (a.tryWalk(best)) { a.movedir = best; return; }
    }
    a.movedir = DI.NODIR;
  },

  A_Pain(a) { a.game.sound?.play(a.info.painSound, a); },
  A_Scream(a) { a.game.sound?.play(a.info.deathSound, a); },
  A_XScream(a) { a.game.sound?.play('gib', a); },

  /* It is on the floor now: no longer solid, no longer in the way. */
  A_Fall(a) {
    a.solid = false;
    a.height = 8;
    a.game.sound?.play('bodyfall', a);
  },
};
