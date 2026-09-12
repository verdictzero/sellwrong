/* =====================================================================
   GROCERY STORE SIMULATOR — the people, and what is left of them
   =====================================================================

   THE PEOPLE ARE STANDEES. One drawing each, seen from every side, and
   they do not walk. That is a decision and not a shortcut: the art is a
   set of finished single-view characters from the galvarius project, and
   the honest way to use a single-view character is as a single view.
   Eight rotations invented by mirroring would look worse from seven of
   the eight, and a walk cycle invented by sliding one drawing about
   would look worse from all of them. So they stand in the aisles, they
   SWAY a little where they stand, and that is the whole of their
   animation.

   What they are for is what happens to them. A shopper has twelve
   health, which is under one tic of the stream, so touching one with
   the flame is the same as deciding to; and there is no death animation
   because there is no body. There is a fireball, thirteen pieces of
   somebody thrown outward on fire, a trail of flame behind each, and a
   splat where each one lands. The pieces put a little heat into the
   floor where they come down, which is the part that matters: a crowd
   is not just scenery to burn, it is a way of MOVING the fire. Torch the
   queue at the tills and you have started nine small fires down the
   front end.

   THE BUDGET, because a crowd of a hundred and twenty could otherwise
   put a thousand particles in the air at once: two pools, sized so that
   nine or ten people can be coming apart simultaneously and the eleventh
   simply gets fewer pieces. Both are one draw call. The splats on the
   floor are real actors, so they are capped and the oldest is taken away
   when the cap is reached — a night of this would otherwise leave a
   thousand sprites lying about.

   THE CONTRACT WITH tools/prep-people.mjs is `CELLS` below. The tool
   crunches somebody else's art down to this game's scale and pads every
   picture into a cell of exactly these sizes; the game cuts the strips
   back apart on the same numbers. One set of numbers, imported by both,
   so there is nothing to keep in step.
   ===================================================================== */

import { Particles } from './particles.js';
import { stripFrames } from './spriteload.js';
import { pRandom, dist2 } from './util.js';

/* Pixels, which in this game are world units — a sprite is drawn one
   unit to the pixel, so a 62-tall shopper is 62 units of person. */
export const CELLS = {
  shoppers: { w: 40, h: 64 },
  giblets:  { w: 16, h: 16 },
  splat:    { w: 56, h: 20 },
  blast:    { w: 48, h: 96 },
};

/* How tall a standing adult is drawn, which is what the shoppers are
   scaled to and what everything else is scaled beside. Under the cell,
   because one of the drawings is of somebody standing on tiptoe. */
export const ADULT = 62;

/* How many of each the strips hold. The tool fails rather than write a
   strip of a different length, and the smoke test checks the files, so
   these are safe to build tables on. */
export const SHOPPERS = 17;
export const GIBLETS  = 11;
export const SPLATS   = 3;
export const BLASTS   = 26;

/* Sprite set names. A shopper is its own set with one frame in it, so
   that ACTORS.SHOPPER can pick between them with the `variants` hook
   the cars will use — see Actor.render. */
export const SHOPPER_SPRITE = 'SHO';    // SHO0 .. SHO16, frame A
export const SPLAT_SPRITE   = 'BLU';    // BLU0 .. BLU2,  frame A
export const BLAST_SPRITE   = 'BLST';   // one set, frames A .. Z

/* --------------------------------------------------------------------
   Getting the strips into the bank
   ------------------------------------------------------------------ */
/** One cell per set, under SHO0, SHO1, ... — every side the same. */
export function addStandees(bank, img, opts = {}) {
  const frames = stripFrames(img, CELLS.shoppers.w);
  frames.forEach((p, i) => bank.addFrame(SHOPPER_SPRITE + i, 'A', new Array(8).fill(p), opts));
  return frames.length;
}

/** The same shape for the splats, which vary by actor rather than by
 *  frame for exactly the same reason. */
export function addSplats(bank, img, opts = {}) {
  const frames = stripFrames(img, CELLS.splat.w);
  frames.forEach((p, i) => bank.addFrame(SPLAT_SPRITE + i, 'A', new Array(8).fill(p), opts));
  return frames.length;
}

/* --------------------------------------------------------------------
   Coming apart
   ------------------------------------------------------------------ */
export const GIB = {
  count: 13,          // pieces of a person
  /* Thrown HARD and wide. The first pass at these numbers dropped
     everything in a two-metre circle, which reads as a person falling
     over rather than a person going off: at eight units a tic with very
     little drag a piece clears sixty or seventy before it lands, so the
     thirteen of them end up spread across an aisle and over the shelf
     into the next one. */
  speedMin: 1.8, speedMax: 8.0,
  riseMin: 3.0,  riseMax: 8.5,
  gravity: -0.5,
  drag: 0.985,
  lifeMin: 55, lifeMax: 110,
  sizeMin: 9, sizeMax: 15,
  trailEvery: 2,      // tics between flames off a piece in the air
  splatChance: 90,    // out of 255, per piece that lands
  maxSplats: 140,     // sprites left lying about before the oldest goes
};

/* What a piece of somebody frozen is coloured. Multiplied onto the gore
   art, so it is a lighting decision and not a repaint: red barely moves,
   green and blue lift hard, and dark red meat comes out the pale
   grey-pink of something out of a freezer. */
const FROZEN_GIB = [1.0, 1.45, 1.85];

export class Giblets {
  /**
   * @param game
   * @param art  { giblets: {texture, frames}, trail: {texture, frames} }
   *             or null, headless
   */
  constructor(game, art = null) {
    this.game = game;
    /* The pieces themselves: cut-out art, lit by the room like anything
       else, so a hand landing in a dark aisle is dark. */
    this.chunks = new Particles({
      max: 260, texture: art?.giblets?.texture || null, frames: art?.giblets?.frames || GIBLETS,
      blend: 'cutout', fullbright: false, light: 0.9, name: 'giblets', renderOrder: 13, nearShrink: 80,
    });
    /* And the fire coming off them: the same fireballs the gun fires,
       small, additive, and gone in a third of a second, which is what
       turns thirteen tumbling objects into thirteen comets. */
    this.trail = new Particles({
      max: 300, texture: art?.trail?.texture || null, frames: art?.trail?.frames || 8,
      blend: 'add', fullbright: true, name: 'gibtrail', renderOrder: 11, nearShrink: 30,
    });
    /* AND A SECOND POOL FOR THE COLD ONES, which is not tidiness — it
       is the bug that shipped for about ten minutes. A hot piece of
       somebody trails fire behind it in the air, and back when landing
       also lit the floor, shattering a frozen shopper down the middle of
       the beans aisle set the beans aisle on fire — the exact opposite
       of what the extinguisher is for. Neither pool lights anything now
       (see _land), but they are still not the same object: one comes off
       a body that went up and burns all the way down, the other is ice
       and arrives with a wet noise and a breath of vapour. Same art,
       same ballistics; what they ARE is the difference, so they are a
       different pool with a different tic. */
    this.shards = new Particles({
      max: 200, texture: art?.giblets?.texture || null, frames: art?.giblets?.frames || GIBLETS,
      blend: 'cutout', fullbright: false, light: 1.0, name: 'shards', renderOrder: 13, nearShrink: 80,
    });
    this.splats = [];
    this.bursts = 0;
    this.shatters = 0;
  }

  attach(scene) { this.chunks.attach(scene); this.shards.attach(scene); this.trail.attach(scene); }

  /* ------------------------------------------------------------------
     The burst
     ------------------------------------------------------------------ */
  /** Somebody is no longer a person. `a` is the actor it happened to. */
  burst(a) {
    const g = this.game;
    this.bursts++;
    g.sound?.play('gib', a);

    /* The fireball, standing on the floor where they were. It is an
       actor and not a particle because a particle is square and this is
       twice as tall as it is wide. */
    g.spawn('BLAST', a.x, a.y, a.z);

    /* A pool under them straight away, so there is something there even
       if every piece flies off somewhere else. */
    this.splat(a.x, a.y, a.z);

    /* AND EVERYBODY WHO SAW IT LEAVES. This is the loudest thing that
       happens in the game and it happens to a person, so it clears a
       much wider circle than the fire itself does: torch one at the
       tills and the whole front end is running before the pieces land. */
    g.scare?.(a.x, a.y, 900);

    for (let k = 0; k < GIB.count; k++) {
      const ang = (pRandom() / 255) * Math.PI * 2;
      const sp = GIB.speedMin + (pRandom() / 255) * (GIB.speedMax - GIB.speedMin);
      const size = GIB.sizeMin + (pRandom() / 255) * (GIB.sizeMax - GIB.sizeMin);
      this.chunks.spawn({
        x: a.x, y: a.y, z: a.z + a.height * (0.25 + (pRandom() / 255) * 0.6),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        vz: GIB.riseMin + (pRandom() / 255) * (GIB.riseMax - GIB.riseMin),
        life: GIB.lifeMin + (pRandom() % (GIB.lifeMax - GIB.lifeMin)),
        size0: size, size1: size,
        c0: [1, 1, 1], c1: [1, 1, 1], a0: 1, a1: 1,
        frame: pRandom() % GIBLETS,
        drag: GIB.drag, gravity: GIB.gravity,
      });
    }
  }

  /* ------------------------------------------------------------------
     AND THE COLD VERSION OF THE SAME THING

     Somebody frozen solid and then hit does not come apart the way
     somebody on fire does, and the difference is the whole reason this
     is a second method rather than a flag on the first.

     NO FIREBALL AND NO SCARE. A burst is an explosion — it lights the
     floor, it throws a column of flame up where the person was, and
     everybody within nine hundred units runs. Shattering is quiet: a
     crack and a scatter, and the shopper four feet away carries on
     looking at the beans. That is not an oversight, it is the mechanic:
     a player who wants to clear an aisle without starting a stampede
     now has a way to do it, and it is the only way there is.

     BLOODY AND FROZEN, as asked, and one tint does both. The giblet art
     is gore — dark reds — and the pieces are drawn through a colour that
     lifts the blue and green hard and the red barely: what comes out is
     meat that has gone pale and cold rather than meat with a blue light
     on it. Every piece keeps its own drawing; only the light on it is
     cold.

     THE PIECES GO FURTHER AND DROP HARDER, because they are ice rather
     than burning person: no rise to speak of, more sideways, and they
     skitter. And they leave the same pool behind them, because whatever
     the temperature, that part is unchanged.
     ------------------------------------------------------------------ */
  shatter(a) {
    const g = this.game;
    this.shatters++;
    g.sound?.play('shatter', a);
    this.splat(a.x, a.y, a.z);
    for (let k = 0; k < GIB.count + 4; k++) {
      const ang = (pRandom() / 255) * Math.PI * 2;
      const sp = GIB.speedMin + (pRandom() / 255) * (GIB.speedMax - GIB.speedMin) * 1.25;
      const size = GIB.sizeMin * 0.7 + (pRandom() / 255) * (GIB.sizeMax - GIB.sizeMin);
      this.shards.spawn({
        x: a.x, y: a.y, z: a.z + a.height * (0.15 + (pRandom() / 255) * 0.7),
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        vz: GIB.riseMin * 0.35 + (pRandom() / 255) * GIB.riseMax * 0.4,
        life: GIB.lifeMin + (pRandom() % (GIB.lifeMax - GIB.lifeMin)),
        size0: size, size1: size,
        c0: FROZEN_GIB, c1: FROZEN_GIB, a0: 1, a1: 1,
        frame: pRandom() % GIBLETS,
        drag: GIB.drag, gravity: GIB.gravity * 1.25,
      });
    }
    /* and a breath of it hanging where they stood */
    g.fx?.frostPuff?.(a.x, a.y, a.z + a.height * 0.5);
  }

  /** What is left on the floor. Capped: the oldest goes when the cap is
   *  reached, so a long night does not end in a carpet of sprites. */
  splat(x, y, z) {
    const g = this.game;
    const a = g.spawn('GORE', x, y, z + 1, { variant: pRandom() % SPLATS });
    this.splats.push(a);
    while (this.splats.length > GIB.maxSplats) this.splats.shift()?.remove();
    return a;
  }

  /* ------------------------------------------------------------------
     One tic
     ------------------------------------------------------------------ */
  tic() {
    const g = this.game, lv = g.level, C = this.chunks;

    C.tic((i, nx, ny, nz) => {
      const x = C.x[i], y = C.y[i], z = C.z[i];
      /* A piece that goes through the frozen aisle wall and lands in the
         car park is funny exactly once. */
      const wall = lv.rayHitWall(x, y, z, nx, ny, nz);
      if (wall) { this._land(wall.x, wall.y, wall.z); return true; }
      const sec = lv.sectorAt(nx, ny);
      const floor = sec ? sec.floor : 0;
      if (nz <= floor + 1) { this._land(nx, ny, floor); return true; }
      return false;
    });

    /* the flame off each piece still in the air */
    if (C.count) {
      const phase = C.tics;
      for (let i = 0; i < C.max; i++) {
        if (!C.alive[i]) continue;
        if ((phase + i) % GIB.trailEvery) continue;
        this.trail.spawn({
          x: C.x[i], y: C.y[i], z: C.z[i],
          vx: C.vx[i] * 0.3, vy: C.vy[i] * 0.3, vz: C.vz[i] * 0.3 + 0.5,
          life: 9 + (pRandom() % 5),
          size0: 7, size1: 17,
          c0: [1.0, 0.9, 0.62], c1: [1.0, 0.3, 0.06],
          a0: 0.5, a1: 0,
          frame: pRandom() & 7, frameRate: 0.6,
          drag: 0.94, gravity: 0.06,
        });
      }
    }
    this.trail.tic();

    /* and the cold ones, which fly the same way and arrive differently:
       no trail behind them and no heat under them, just a wet noise and
       a mark on the floor */
    this.shards.tic((i, nx, ny, nz) => {
      const x = this.shards.x[i], y = this.shards.y[i], z = this.shards.z[i];
      const wall = lv.rayHitWall(x, y, z, nx, ny, nz);
      if (wall) { this._landCold(wall.x, wall.y, wall.z); return true; }
      const sec = lv.sectorAt(nx, ny);
      const floor = sec ? sec.floor : 0;
      if (nz <= floor + 1) { this._landCold(nx, ny, floor); return true; }
      return false;
    });
  }

  /** A piece has come down: a splat sometimes, a spit of sparks always,
   *  and NOTHING THAT CATCHES.
   *
   *  IT USED TO LIGHT THE FLOOR WHERE IT LANDED, and that was the single
   *  biggest reason the store burnt down without the player. Thirteen
   *  pieces thrown seventy units in every direction is thirteen new
   *  fires in a ring round the body, most of them across the aisle the
   *  person was running down — so one shopper going off in a crowd
   *  started a chain that crossed the shop through cross-aisles nobody
   *  had carried fire over. It was the best-looking mechanic in the game
   *  and it was also an automatic win. The pieces still come off alight,
   *  because a body going up is a body going up; they simply do not hand
   *  the fire on any more. Carrying it is the player's job. */
  _land(x, y, z) {
    const g = this.game;
    g.fx?.splash(x, y, z);
    if (pRandom() < GIB.splatChance) this.splat(x, y, z);
  }

  /** And a cold one, which is the same minus every single thing that
   *  was warm about it. */
  _landCold(x, y, z) {
    if (pRandom() < GIB.splatChance) this.splat(x, y, z);
    if ((pRandom() & 3) === 0) this.game.fx?.frostPuff?.(x, y, z + 6, 12, 24);
  }

  render(billboardRot) {
    this.chunks.render(billboardRot);
    this.shards.render(billboardRot);
    this.trail.render(billboardRot);
  }

  get liveCount() { return this.chunks.count + this.shards.count + this.trail.count; }
}

/* --------------------------------------------------------------------
   Standing about

   Not an animation — a standee has one drawing — but not a statue
   either. Every shopper gets a phase off its own id and leans, slowly,
   about an inch and a half either way, with a smaller bob at twice the
   rate. Across a shop floor of a hundred of them that reads as a room
   with people in it rather than a room with cardboard in it, and it
   costs two sines an actor a frame.
   ------------------------------------------------------------------ */
export const SWAY = {
  lean: 1.3, bob: 0.7, rate: 0.055,
  /* AND HARDER WHEN IT IS RUNNING. There is one drawing, so a running
     shopper is a standing shopper that is moving — which on its own
     reads as a cardboard cutout being dragged along the floor. Four
     times the rate and three times the bob turns the same drawing into
     something scurrying, and it costs the two sines it already cost. */
  runRate: 4.0, runLean: 1.6, runBob: 3.0,
};

/* ONE object, reused. This is called once per shopper per frame and
   allocating a hundred and forty little vectors a frame to throw away is
   exactly the kind of garbage a fixed-tic loop does not want. The caller
   reads it before calling again; Actor.render does. */
const _sway = { dx: 0, dy: 0, dz: 0 };
export function swayOf(actor, tics) {
  /* the phase, and the DIRECTION of the lean, both come off the actor's
     own id — so no two of them lean together and no two of them lean the
     same way, which is the whole of the trick */
  const run = actor.panic > 0;
  const t = (tics + actor.id * 37) * SWAY.rate * (run ? SWAY.runRate : 1);
  const lean = Math.sin(t) * SWAY.lean * (run ? SWAY.runLean : 1);
  _sway.dx = Math.cos(actor.id) * lean;
  _sway.dy = Math.sin(actor.id) * lean;
  _sway.dz = Math.abs(Math.sin(t * 2 + actor.id)) * SWAY.bob * (run ? SWAY.runBob : 1)
           - (run ? SWAY.bob : 0);
  return _sway;
}

/** Who is near enough to notice, for whatever ends up wanting to know —
 *  the responders will. Cheap, and here rather than in game.js because
 *  it is about the crowd. */
export function crowdNear(game, x, y, radius) {
  const r2 = radius * radius, out = [];
  for (const a of game.actors)
    if (a.type === 'SHOPPER' && !a.dead && !a.removed && dist2(a.x, a.y, x, y) < r2) out.push(a);
  return out;
}
