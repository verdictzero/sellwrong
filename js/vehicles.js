/* =====================================================================
   GROCERY STORE SIMULATOR — the car park, and what happens to it
   =====================================================================

   js/car.js turns four drawings into a solid. This is what that solid
   DOES: stands in a bay, catches, goes up, leaves the ground, comes down
   on its roof, goes up again, and lies there burning while the pieces of
   it smoulder on the tarmac around it.

   ONE MESH UNTIL SOMETHING MOVES. There are seventy-seven bays and
   every one of them is filled, and seventy-seven meshes is seventy-seven
   draw calls for a row of things that never move. So a parked car is not
   a mesh: it is a slab of vertices baked into world space and
   concatenated into ONE geometry, the same bargain js/mapgeo.js makes
   with the walls. A car only gets a mesh of its own for the second and a
   half it is in the air; when it lands it is baked into a second slab
   with the other wrecks, and so is every piece of debris that has come
   to rest. Rebuilds happen once at the end of whichever tic dirtied
   them, so a chain reaction that takes out six cars rebuilds once, and
   nothing is ever drawn twice in one frame.

   THE TUMBLE IS NOT A PHYSICS ENGINE and does not want to be. It is
   Doom's own arithmetic — a velocity, a gravity of 0.85 units per tic
   per tic, which is the same fall the sparks off a broken light take,
   and which happens to be very close to a real g at this world's scale.
   Three spin rates are integrated separately as Euler angles in the
   order the mesh is built for (see carMesh): yaw, then roll about the
   car's own length, then pitch nose over tail. That is not rigid-body
   dynamics and for a car in the air for forty tics nobody can tell.

   IT LANDS ON ITS ROOF BECAUSE THE ROLL RATE IS CHOSEN SO IT WILL. The
   flight is ballistic, so the time it will be in the air is known the
   moment it leaves the ground — a box turned half a turn about its long
   axis is exactly as tall as it was, so the centre comes back to the
   height it started at, and the flight lasts 2v/g. Divide half a turn by
   that and the car completes its roll as it arrives. It is aimed, not
   simulated, and it is the difference between a car that lands upside
   down and a car that lands upside down SOMETIMES.

   HOW HIGH A CAR ON ITS ROOF SITS is not a number anybody types in. The
   eight corners of its own box get turned by whatever orientation it has
   at that moment, and the lowest one is put on the tarmac. Which means
   it works at any angle, so the settle — the ten tics where it rocks
   from however it hit onto its roof — is just the same test run every
   tic while the orientation eases to its resting one.
   ===================================================================== */

import * as THREE from 'three';
import { TICRATE, pRandom } from './util.js';
import {
  carGeometry, chunkGeometry, carMesh, carGeom,
  carCorners, carBlockers, carBlockRadius, carHeight,
} from './car.js';

/* ---------------------------------------------------------------------
   The numbers
   --------------------------------------------------------------------- */
const GRAVITY = 0.85;        // units per tic per tic — the sparks' own fall

const HEALTH = 150;          // a few seconds of being on fire
const BURN_EVERY = 10;       // tics between a burning car taking it
const BURN_DAMAGE = 12;
const FUEL = 520;            // what a tank is worth to the tarmac under it
const CATCH_TICS = 40 * TICRATE;

const LIFT = [13, 19];       // how hard it leaves the ground
const DRIFT = 1.7;           // and how far sideways
const YAW_SPIN = 0.055;      // slew, in radians a tic
const PITCH_SPIN = 0.030;    // nose over tail
const CANT = 0.22;           // how far past half a turn it may land
const TILT = 0.12;           // and how crooked it is left lying, nose to tail
const ROLL_CANT = 0.08;      // and side to side
const SETTLE = 10;           // tics spent rocking onto the roof

const WRECK_LIT = 0.42;      // a burnt car is a dark car
const WRECK_CHAR = 1;        // and js/material.js puts the coals on it
const CHUNK_CHAR = 0.85;

const BLAST_R = 210;         // what the first one reaches
const BLAST_DMG = 90;
const CRASH_R = 170;         // and the second, which is the smaller bang
const CRASH_DMG = 55;
const SCARE_R = 1400;        // and how far away somebody stops shopping

const SHED_LAUNCH = 4;       // pieces thrown as it leaves
const SHED_CRASH = 11;       // and as it arrives
const CHUNK_LIFT = [3.5, 11];
const CHUNK_OUT = [1.2, 5.0];
const CHUNK_SPIN = 0.34;
const CHUNK_BOUNCE = 0.32;
const SMOULDER = 22 * TICRATE;

const MAX_FLYING_CHUNKS = 64;
const MAX_RESTING_CHUNKS = 200;

const rnd = () => pRandom() / 255;
const between = ([a, b]) => a + rnd() * (b - a);

/* ---------------------------------------------------------------------
   Turning things

   three.js reads rotation.order 'YXZ' as R = Ry·Rx·Rz, which applied to
   a point means Rz first, then Rx, then Ry — so in the object's own
   frame it yaws, then rolls about its length, then tips nose over tail.
   This is that product, written out, because the smoke test has no
   three.js to ask and a matrix class for one multiply is not worth it.
   --------------------------------------------------------------------- */
function turn(p, yaw, rx, rz) {
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const x1 = p[0] * cz - p[1] * sz, y1 = p[0] * sz + p[1] * cz, z1 = p[2];
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const y2 = y1 * cx - z1 * sx, z2 = y1 * sx + z1 * cx;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return [x1 * cy + z2 * sy, y2, -x1 * sy + z2 * cy];
}

/** How far the lowest and highest corners of a turned box are from its
 *  middle. Yaw is not in it: turning about the up axis cannot change a
 *  height. The low one puts the thing on the ground; the high one is how
 *  tall it has ended up, which for something lying on its roof at an
 *  angle is not a number anybody can write down in advance. */
function extentOf(corners, rx, rz) {
  const cz = Math.cos(rz), sz = Math.sin(rz), cx = Math.cos(rx), sx = Math.sin(rx);
  let lo = Infinity, hi = -Infinity;
  for (const p of corners) {
    const y = (p[0] * sz + p[1] * cz) * cx - p[2] * sx;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  return { lo, hi };
}
const lowestOf = (c, rx, rz) => extentOf(c, rx, rz).lo;

/** Model coordinates to the renderer's, about a model-space origin. */
const toMesh = (p, o, L) => [(p[0] - o[0]) * L, (p[2] - o[2]) * L, -(p[1] - o[1]) * L];

/** Copy vertices into world space. A parked car never moves, so it is
 *  cheaper to bake its heading and its bay into its vertices once than
 *  to give it a transform of its own for ever. */
function bake(a, yaw, rx, rz, x, y, z) {
  const out = a.position.slice();
  for (let i = 0; i < out.length; i += 3) {
    const p = turn([out[i], out[i + 1], out[i + 2]], yaw, rx, rz);
    out[i] = p[0] + x; out[i + 1] = p[1] + z; out[i + 2] = p[2] - y;
  }
  return { ...a, position: out };
}

/** Everything in `list` as one geometry, or nothing if the list is bare.
 *  Typed arrays sized up front and filled with set(), because seventy
 *  cars is a third of a million floats and pushing those one at a time
 *  is the difference between a rebuild you cannot see and a hitch. */
const SLAB_KEYS = ['position', 'uv', 'light', 'sky', 'charred'];
function mergeInto(mesh, texture, scene, list) {
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
  if (!list.length) return null;
  const a = {};
  for (const k of SLAB_KEYS) {
    let n = 0;
    for (const s of list) n += s[k].length;
    const buf = new Float32Array(n);
    let at = 0;
    for (const s of list) { buf.set(s[k], at); at += s[k].length; }
    a[k] = buf;
  }
  const m = carMesh(texture, a);
  m.name = 'cars';
  scene.add(m);
  return m;
}

/* =====================================================================
   ONE VEHICLE
   ===================================================================== */
class Vehicle {
  constructor(fleet, def, opts) {
    this.fleet = fleet;
    this.def = def;
    this.x = opts.x; this.y = opts.y;
    this.ground = opts.z;
    this.yaw = opts.angle;
    this.rx = 0; this.rz = 0;                 // roll about its length, pitch nose over tail
    this.light = opts.light; this.sky = opts.sky;

    this.state = 'parked';
    this.health = HEALTH;
    this.burning = 0;
    this.burnTick = 0;
    this.flames = [];
    this.mesh = null;

    const L = def.length, h = def.box.height;
    this.mid = [0, 0, h / 2];                 // it turns about its middle, not its wheels
    this.cz = this.ground + h / 2 * L;        // where that middle is
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.corners = carCorners(def).map(p => toMesh(p, this.mid, L));

    /* Parked: no mesh, no transform — just vertices in the slab. */
    this.local = null;
    this.slab = bake(carGeometry(def, {
      angle: this.yaw, light: this.light, sky: this.sky, origin: this.mid,
    }), this.yaw, 0, 0, this.x, this.y, this.cz);

    /* and the part you cannot walk through */
    this.blockers = [];
    this.block(carHeight(def));
  }

  /** Doom's cylinders, three in a row. They carry a pointer back here,
   *  which is what makes a shot at any third of a van damage the van. */
  block(height) {
    this.unblock();
    const g = this.fleet.game, d = this.def;
    for (const b of carBlockers(d, this.x, this.y, this.yaw)) {
      const a = g.spawn('CARBODY', b.x, b.y, this.ground, {
        radius: carBlockRadius(d), height: Math.max(16, Math.round(height)),
      });
      a.vehicle = this;
      this.blockers.push(a);
    }
  }

  unblock() {
    for (const a of this.blockers) a.remove();
    this.blockers.length = 0;
  }

  /* ------------------------------------------------------------------
     Being shot at, and catching
     ------------------------------------------------------------------ */
  damage(n) {
    if (this.state !== 'parked') return;
    this.health -= n;
    if (this.health <= 0) this.blowUp();
  }

  ignite(tics = CATCH_TICS) {
    if (this.state !== 'parked') return;
    const first = this.burning <= 0;
    this.burning = Math.max(this.burning, tics);
    if (!first) return;
    const g = this.fleet.game;
    g.sound?.play('ignite', this);
    /* A TANK OF FUEL GOES INTO THE TARMAC. Bare tarmac does not burn,
       but js/fire.js treats what you pour on a floor as accelerant, so
       what you get is a car standing in a pool of fire — which is what
       is meant to happen, and it is also how the fire reaches the next
       bay along. */
    g.fire?.ignite(this.x, this.y, FUEL, 70);
    /* and two columns of it standing on the car, because the fire under
       it is on the ground and a car alight is alight all over */
    const L = this.def.length;
    for (const t of [-0.22, 0.2]) {
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      const f = g.spawn('BLAZE', this.x + c * t * L, this.y + s * t * L,
        this.ground + carHeight(this.def) * 0.55);
      this.flames.push(f);
    }
  }

  burnTic() {
    if (--this.burning <= 0) { this.burning = 0; this.douse(); return; }
    if (++this.burnTick < BURN_EVERY) return;
    this.burnTick = 0;
    this.fleet.game.fire?.ignite(this.x, this.y, 40);
    this.damage(BURN_DAMAGE);
  }

  douse() {
    for (const f of this.flames) f.remove();
    this.flames.length = 0;
  }

  /* ------------------------------------------------------------------
     UP

     The first bang, and then it leaves. The roll rate is worked out from
     how long it is going to be in the air, so that half a turn finishes
     as it arrives; see the note at the top of the file.
     ------------------------------------------------------------------ */
  blowUp() {
    if (this.state !== 'parked') return;
    const g = this.fleet.game, d = this.def;
    this.state = 'air';
    this.burning = 0;
    this.douse();
    this.unblock();
    this.fleet.dirty = true;
    this.slab = null;

    this.boom(BLAST_R, BLAST_DMG, 1);
    g.scare?.(this.x, this.y, SCARE_R);

    this.vz = between(LIFT);
    const ang = rnd() * Math.PI * 2;
    this.vx = Math.cos(ang) * rnd() * DRIFT;
    this.vy = Math.sin(ang) * rnd() * DRIFT;

    const flight = 2 * this.vz / GRAVITY;
    const over = (rnd() - 0.5) * 2 * CANT;              // it does not land square
    this.rollRate = (Math.PI + over) / flight;
    this.pitchRate = (rnd() - 0.5) * 2 * PITCH_SPIN;
    this.yawRate = (rnd() - 0.5) * 2 * YAW_SPIN;

    /* its own mesh now, for as long as it is off the ground */
    this.local = carGeometry(d, {
      angle: this.yaw, light: this.light, sky: this.sky, origin: this.mid,
    });
    this.mesh = carMesh(this.fleet.texture, this.local);
    this.mesh.name = 'car:' + d.id;
    g.scene.add(this.mesh);
    this.place();

    this.shed(SHED_LAUNCH);
  }

  /** A bang, centred on wherever the car is standing. */
  boom(radius, damage, blasts) {
    const g = this.fleet.game;
    const at = { x: this.x, y: this.y, z: this.ground };
    g.explode(at, { radius, damage, heat: 260, heatRadius: 96, ignite: 340 });
    const L = this.def.length;
    for (let k = 0; k < blasts + 2; k++) {
      const t = (rnd() - 0.5) * 0.7 * L, u = (rnd() - 0.5) * 0.5 * L;
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      g.spawn('BLAST', this.x + c * t - s * u, this.y + s * t + c * u, this.ground);
    }
    g.fx?.ember(this.x, this.y, this.ground + 20, 26, 1);
    for (let k = 0; k < 7; k++) g.fx?.puff(this.x, this.y, this.ground + 24 + k * 6, 34, 200);
  }

  /* ------------------------------------------------------------------
     Flying, and arriving
     ------------------------------------------------------------------ */
  tic() {
    if (this.burning > 0) this.burnTic();
    if (this.state === 'wreck') { this.smoulderTic(); return; }
    if (this.state === 'parked') return;

    if (this.state === 'air') {
      this.vz -= GRAVITY;
      this.cz += this.vz;
      this.x += this.vx; this.y += this.vy;
      this.rx += this.rollRate; this.rz += this.pitchRate; this.yaw += this.yawRate;
      /* it is on fire the whole way down */
      const g = this.fleet.game;
      g.fx?.ember(this.x, this.y, this.cz, 2, 1);
      if ((pRandom() & 1) === 0) g.fx?.puff(this.x, this.y, this.cz, 26, 150);
      const low = lowestOf(this.corners, this.rx, this.rz);
      if (this.vz < 0 && this.cz + low <= this.ground) this.crash(low);
      else this.place();
      return;
    }

    /* settling: ease onto the roof, and let its own corners say how high
       that leaves it. It rocks, because the height follows the angle. */
    this.settle--;
    const k = 1 - this.settle / SETTLE;
    this.rx = this.rx0 + (this.rxTo - this.rx0) * k;
    this.rz = this.rz0 + (this.rzTo - this.rz0) * k;
    this.cz = this.ground - lowestOf(this.corners, this.rx, this.rz);
    this.place();
    if (this.settle <= 0) this.rest();
  }

  /** Lying there going out: forty seconds of smoke and sparks off it,
   *  and then only the coals `charred` keeps alight in the shader — the
   *  same ones burning in the gutted aisles indoors, on the same clock. */
  smoulderTic() {
    if (this.smoulder <= 0) return;
    this.smoulder--;
    const g = this.fleet.game, k = this.smoulder / (SMOULDER * 2);
    if ((++this.tick % 5) === 0) g.fx?.ember(this.x, this.y, this.cz, 1, 0.4 + 0.6 * k);
    if ((this.tick % 11) === 0) g.fx?.puff(this.x, this.y, this.cz + 10, 26 + 16 * k, 190);
    if ((this.tick % 70) === 0 && k > 0.35) g.fire?.ignite(this.x, this.y, 90, 40);
  }

  place() {
    this.mesh.position.set(this.x, this.cz, -this.y);
    this.mesh.rotation.set(this.rx, this.yaw, this.rz);
  }

  /** It has hit the tarmac. The second bang, and the pieces. */
  crash(low) {
    const g = this.fleet.game;
    this.state = 'settle';
    this.updateSector();
    this.cz = this.ground - low;
    g.sound?.play('bodyfall', this);
    this.boom(CRASH_R, CRASH_DMG, 2);
    this.shed(SHED_CRASH);

    /* Onto its roof: half a turn, plus the crookedness it happens to
       have arrived with, kept small enough that it still reads as upside
       down rather than as on its side. */
    this.rx0 = this.rx; this.rz0 = this.rz;
    this.rxTo = Math.round((this.rx - Math.PI) / (2 * Math.PI)) * 2 * Math.PI + Math.PI
              + (rnd() - 0.5) * 2 * ROLL_CANT;
    this.rzTo = Math.max(-TILT, Math.min(TILT, this.rz % (2 * Math.PI)));
    this.settle = SETTLE;

    /* burnt, from here on */
    this.local = carGeometry(this.def, {
      angle: this.yaw, light: this.light * WRECK_LIT, sky: this.sky,
      origin: this.mid, charred: WRECK_CHAR,
    });
    this.mesh.geometry.dispose();
    this.mesh.geometry = carGeom(this.local);
    g.fire?.ignite(this.x, this.y, FUEL, 80);
  }

  updateSector() {
    const s = this.fleet.game.level.sectorAt(this.x, this.y);
    if (s) { this.ground = s.floor; this.sky = s.sky ?? (s.outdoor ? 1 : 0); }
  }

  /** Done moving: back into the slab with the other wrecks, and it is in
   *  the way again — lower than it was, because it is on its roof. */
  rest() {
    const g = this.fleet.game;
    this.state = 'wreck';
    g.scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.mesh = null;
    this.fleet.restOf(bake(this.local, this.yaw, this.rx, this.rz, this.x, this.y, this.cz));
    this.local = null;
    /* Still in the way, and still about as tall: a box turned over is
       exactly as tall as it was, and the tilt it came to rest at adds a
       little. Its own corners know, so they are asked rather than told. */
    this.block(this.cz + extentOf(this.corners, this.rx, this.rz).hi - this.ground);
    this.smoulder = SMOULDER * 2;
    this.tick = 0;
  }

  /* ------------------------------------------------------------------
     Pieces

     A chunk is a small box cut out of this vehicle's own model space,
     put through the same projection as the vehicle — so a piece off the
     tail is painted with the tail, on every face, and nobody had to
     decide what a torn piece of van looks like.
     ------------------------------------------------------------------ */
  shed(n) {
    const d = this.def, L = d.length;
    const tris = d.model.tris;
    for (let k = 0; k < n; k++) {
      if (this.fleet.flying.length >= MAX_FLYING_CHUNKS) return;
      /* A PIECE OFF THE OUTSIDE, and the model says where the outside
         is: pick one of its triangles and cut a box in around that
         triangle's middle. A chunk is then the model's own triangles
         inside that box (see chunkGeometry), so a piece off the tail is
         the tail — the same geometry, the same paint, torn out.

         This used to sample the hull's two silhouette curves for a point
         on the skin, because the body was BUILT from those curves and
         there were no triangles to ask. There are now. */
      const pick = tris[(rnd() * tris.length) | 0];
      const px = (pick.a[0] + pick.b[0] + pick.c[0]) / 3;
      const py = (pick.a[1] + pick.b[1] + pick.c[1]) / 3;
      const pz = (pick.a[2] + pick.b[2] + pick.c[2]) / 3;
      const w = 0.07 + rnd() * 0.10, dp = 0.05 + rnd() * 0.09, t = 0.04 + rnd() * 0.07;
      const cut = {
        x0: px - w / 2, x1: px + w / 2,
        y0: py - dp / 2, y1: py + dp / 2,
        z0: Math.max(0, pz - t / 2),
      };
      cut.z1 = cut.z0 + t;

      /* where that box is in the world right now, tumble and all */
      const mid = [(cut.x0 + cut.x1) / 2, (cut.y0 + cut.y1) / 2, (cut.z0 + cut.z1) / 2];
      const off = turn(toMesh(mid, this.mid, L), this.yaw, this.rx, this.rz);
      const wx = this.x + off[0], wy = this.y - off[2], wz = this.cz + off[1];

      /* thrown outward from the middle, and upward */
      const a = Math.atan2(wy - this.y, wx - this.x) + (rnd() - 0.5) * 1.4;
      const sp = between(CHUNK_OUT);
      this.fleet.addChunk(new Chunk(this.fleet, d, cut, {
        x: wx, y: wy, z: wz, ground: this.ground,
        vx: Math.cos(a) * sp + this.vx, vy: Math.sin(a) * sp + this.vy,
        vz: between(CHUNK_LIFT) + Math.max(0, this.vz) * 0.4,
        light: this.light, sky: this.sky,
      }));
    }
  }
}

/* =====================================================================
   ONE PIECE OF IT
   ===================================================================== */
class Chunk {
  constructor(fleet, def, cut, o) {
    this.fleet = fleet;
    this.x = o.x; this.y = o.y; this.z = o.z; this.ground = o.ground;
    this.vx = o.vx; this.vy = o.vy; this.vz = o.vz;
    this.yaw = rnd() * Math.PI * 2;
    this.rx = rnd() * Math.PI * 2; this.rz = rnd() * Math.PI * 2;
    this.rollRate = (rnd() - 0.5) * 2 * CHUNK_SPIN;
    this.pitchRate = (rnd() - 0.5) * 2 * CHUNK_SPIN;
    this.yawRate = (rnd() - 0.5) * 2 * CHUNK_SPIN;
    this.resting = false;
    this.glow = SMOULDER;
    this.tick = 0;

    const L = def.length;
    this.local = chunkGeometry(def, cut, {
      angle: 0, light: o.light * 0.7, sky: o.sky, charred: CHUNK_CHAR,
    });
    const mid = [(cut.x0 + cut.x1) / 2, (cut.y0 + cut.y1) / 2, (cut.z0 + cut.z1) / 2];
    this.corners = [];
    for (const x of [cut.x0, cut.x1]) for (const y of [cut.y0, cut.y1]) for (const z of [cut.z0, cut.z1])
      this.corners.push(toMesh([x, y, z], mid, L));

    this.mesh = carMesh(fleet.texture, this.local);
    this.mesh.name = 'debris';
    fleet.game.scene.add(this.mesh);
    this.place();
  }

  place() {
    this.mesh.position.set(this.x, this.z, -this.y);
    this.mesh.rotation.set(this.rx, this.yaw, this.rz);
  }

  tic() {
    const g = this.fleet.game;
    this.vz -= GRAVITY;
    this.z += this.vz;
    this.x += this.vx; this.y += this.vy;
    this.rx += this.rollRate; this.rz += this.pitchRate; this.yaw += this.yawRate;

    if ((++this.tick & 3) === 0) g.fx?.ember(this.x, this.y, this.z, 1, 0.8);

    const low = lowestOf(this.corners, this.rx, this.rz);
    if (this.vz < 0 && this.z + low <= this.ground) {
      const s = g.level.sectorAt(this.x, this.y);
      if (s) this.ground = s.floor;
      /* One bounce if it came down hard, and then it is scrap on the
         tarmac: the spin bleeds off with it, or a piece lying still goes
         on spinning for ever. */
      if (this.vz < -6 && !this.bounced) {
        this.bounced = true;
        this.z = this.ground - low;
        this.vz *= -CHUNK_BOUNCE;
        this.vx *= 0.5; this.vy *= 0.5;
        this.rollRate *= 0.4; this.pitchRate *= 0.4; this.yawRate *= 0.4;
      } else {
        this.land();
        return;
      }
    }
    this.place();
  }

  land() {
    const g = this.fleet.game;
    this.resting = true;
    /* it comes to rest FLAT, not balanced on a corner: roll and pitch go
       to the nearest half turn, which is the face it was nearest */
    const snap = a => Math.round(a / Math.PI) * Math.PI;
    this.rx = snap(this.rx); this.rz = snap(this.rz);
    this.z = this.ground - lowestOf(this.corners, this.rx, this.rz);
    g.fire?.ignite(this.x, this.y, 70, 26);
    g.scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.mesh = null;
    this.slab = bake(this.local, this.yaw, this.rx, this.rz, this.x, this.y, this.z);
    this.local = null;
  }

  /** Lying there going out. The particles stop after twenty seconds; the
   *  coals do not, because `charred` is baked into the vertices and
   *  js/material.js keeps them alight on the same clock as the burnt
   *  aisles indoors. */
  smoulderTic() {
    if (this.glow <= 0) return;
    this.glow--;
    const g = this.fleet.game, k = this.glow / SMOULDER;
    if ((++this.tick % 14) === 0 && rnd() < k) g.fx?.ember(this.x, this.y, this.z + 4, 1, 0.5 * k);
    if ((this.tick % 47) === 0 && rnd() < k) g.fx?.puff(this.x, this.y, this.z + 8, 16, 120);
  }
}

/* =====================================================================
   THE LOT
   ===================================================================== */
export class Vehicles {
  /**
   * @param game
   * @param texture  the fleet's one texture
   * @param def      the vehicle every bay gets. Null means an empty lot,
   *                 which is what a missing model file costs — the same
   *                 bargain every other asset in this game makes.
   */
  constructor(game, texture, def = null) {
    this.game = game;
    this.texture = texture || null;
    this.def = def;
    this.all = [];
    this.flying = [];            // chunks still in the air
    this.resting = [];           // and chunks that are not
    this.restSlabs = [];         // every settled wreck and piece, as vertices
    this.liveMesh = null;        // every parked car, in one geometry
    this.wreckMesh = null;       // and everything that has stopped moving
    this.dirty = false;
    this.restDirty = false;
  }

  /**
   * Fill the bays.
   *
   * `level.carSlots` has held a position, a heading and a variant for
   * every bay since the day the lot was laid out, off the same
   * arithmetic that drew the bay lines — so a car put at one of these is
   * genuinely in a bay rather than near one. The lot is only about
   * two-fifths full and thins towards the road, because half the town
   * has already left; that is the map's decision and this just fills
   * what it was given.
   *
   * ONE VAN, SEVENTY-SEVEN TIMES, at the user's request. It used to be
   * five civilian bodies picked off the slot's own `variant`, built out
   * of boxes and painted by projecting four drawings onto them; it is
   * now the modelled van from assets/models/van.glb in every bay. What
   * that costs is variety, and what it buys is a car park full of the
   * thing the user drew — and, read a certain way, a delivery fleet
   * parked outside a store called SellWrong is not the wrong joke.
   *
   * `variant` is still on every slot and is still what would pick
   * between vehicles if there were more than one; it is simply not read
   * while there is one. The drawn fleet's riot van and APC are still
   * measured and still packed in their atlas, waiting for
   * js/responders.js to drive them up the road.
   */
  place(slots) {
    if (!this.texture || !slots) return this;
    for (const slot of slots) {
      const def = this.def;
      const sec = this.game.level.sectorAt(slot.x, slot.y);
      this.all.push(new Vehicle(this, def, {
        x: slot.x, y: slot.y, z: sec ? sec.floor : 0, angle: slot.angle,
        light: sec ? sec.light : 0.74,
        sky: sec ? (sec.sky ?? (sec.outdoor ? 1 : 0)) : 1,
      }));
    }
    this.dirty = true;
    this.rebuild();
    return this;
  }

  /** One piece of wreckage that has stopped moving, into the slab. */
  restOf(slab) {
    this.restSlabs.push(slab);
    this.restDirty = true;
  }

  addChunk(c) { this.flying.push(c); }

  tic() {
    for (const v of this.all) v.tic();

    for (let i = this.flying.length - 1; i >= 0; i--) {
      const c = this.flying[i];
      c.tic();
      if (!c.resting) continue;
      this.flying.splice(i, 1);
      this.resting.push(c);
      this.restOf(c.slab);
      /* and if the tarmac is knee deep in it, the oldest piece goes */
      if (this.resting.length > MAX_RESTING_CHUNKS) {
        const old = this.resting.shift();
        const at = this.restSlabs.indexOf(old.slab);
        if (at >= 0) { this.restSlabs.splice(at, 1); this.restDirty = true; }
      }
    }
    for (const c of this.resting) c.smoulderTic();

    if (this.dirty) this.rebuild();
    if (this.restDirty) this.rebuildWrecks();
  }

  /* Both rebuilds happen at the END of the tic that dirtied them, never
     inside it: a chain reaction that takes six cars in the same tic
     rebuilds once, and a car that has just left the ground is never both
     in the slab and flying in the same frame. */
  rebuild() {
    this.dirty = false;
    this.liveMesh = mergeInto(this.liveMesh, this.texture, this.game.scene,
      this.all.filter(v => v.slab).map(v => v.slab));
  }

  rebuildWrecks() {
    this.restDirty = false;
    this.wreckMesh = mergeInto(this.wreckMesh, this.texture, this.game.scene, this.restSlabs);
  }

  /* What the HUD would say, if it said anything about the car park. */
  get wrecked() { return this.all.reduce((n, v) => n + (v.state === 'parked' ? 0 : 1), 0); }
  get count() { return this.all.length; }
}

export { GRAVITY, extentOf, lowestOf, turn };
