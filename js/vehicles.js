/* =====================================================================
   GROCERY STORE SIMULATOR — the car park, and what happens to it
   =====================================================================

   js/car.js reads a GLB off the disk and hands back its triangles. This
   is what those triangles DO: stand in a bay, catch, go up, leave the
   ground, come down on the roof, go up again, and lie there burning
   while the pieces of it smoulder on the tarmac around it.

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
import { TICRATE, pRandom, angleDiff, angleNorm, dist2 } from './util.js';
import {
  carGeometry, chunkGeometry, carMesh, carGeom,
  carCorners, carBlockers, carBlockRadius, carHeight, carWidth,
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

/* IT CHARS FIRST, at the user's request. A car used to go from parked
   to airborne in the tic its health ran out; now the tank going is the
   END of something you can watch — the paint blackening, the coals
   coming up through it, embers and smoke off the roof — and how long
   that takes is rolled per car so a row of them lit together does not go
   off like a firework display on one fuse. */
const CHAR_TICS = [4.5 * TICRATE, 7.5 * TICRATE];
const CHAR_DARK = 0.62;      // how much of its light a charred car has lost at the end

const BLAST_R = 210;         // what the launch bang used to reach
const BLAST_DMG = 90;
/* AND THE BANG AT THE END OF THE CHAR IS FOUR OF THE OLD ONE, also at
   the user's request. Four is spent where four can be seen: four times
   the fireballs, the embers, the smoke and the light, the heat of the
   floor pinned to its maximum, and the sound made the loudest thing in
   the game. The RADIUS is doubled rather than quadrupled — a doubled
   radius is a quadrupled area, which is what "four times the blast"
   means on a floor plan — and the damage is doubled, which with the
   area is eight times what the old bang put into the car park. */
const FINAL = 4;
const FINAL_R = BLAST_R * 2;
const FINAL_DMG = BLAST_DMG * 2;
const FINAL_FLASH = 26;      // tics the light of it hangs about
const CRASH_R = 170;         // and the second, which is the smaller bang
const CRASH_DMG = 55;
const SCARE_R = 1400;        // and how far away somebody stops shopping

const SHED_LAUNCH = 8;       // pieces thrown as it leaves — twice what it was, see FINAL
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
const SLAB_KEYS = ['position', 'uv', 'light', 'sky', 'charred', 'ink'];
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
   THE PAINT

   ONE MODEL, ONE SHEET, ONE DRAW CALL, AND A CAR PARK THAT IS NOT ALL
   THE SAME COLOUR. The whole lot is a single mesh — seventy-seven
   vehicles in one geometry, which is the thing worth keeping — so a red
   van cannot be a different file or a different texture. It is the same
   texel multiplied by a colour that rides in the vertices, in the ink
   channel that was already there and was saying nothing (see the INK
   block in js/material.js, which is where the white paint is isolated
   and where this is spent).

   WHAT THE COLOURS ARE. A supermarket car park in a town where half the
   population has already left, so: the white the model came in, a
   couple of dirty near-whites and silvers, and then the browns, tans,
   greens, maroons and blues that a fifteen-year-old panel van is
   actually painted. Nothing bright — a lot full of primary colours
   reads as a toy box, and this one has to read as somewhere people
   parked to go and buy bread. The saturated ones are the exceptions
   they are in a real car park: one red, one blue, one yellow.

   AND THEY ARE ALL BRIGHTER THAN THEY LOOK ON PAPER, because this
   multiplies TWICE. The sheet's own shading is in the texel already,
   and then the car park's light — which is dusk, in a town where the
   power is going — is on top of that. The first cut of this palette was
   picked at the values a van is actually painted, 0.24 to 0.6, and the
   lot came out as two whites and ten grey shapes with wheels. Nothing
   under about 0.4 in its strongest channel survives to the screen.
   ===================================================================== */
/* AND THE QUIET ONES ARE IN IT TWICE, which is the whole of the
   weighting: a real car park is mostly white, silver and beige with a
   few colours in it, and a list of twelve sampled evenly puts a
   turquoise van in every eighth bay. Repeating an entry is the cheapest
   weight there is and it reads off the page. */
export const PAINT = [
  [1.00, 1.00, 1.00],   // white, which is the model as its author painted it
  [1.00, 1.00, 1.00],
  [0.94, 0.92, 0.84],   // cream, a van that has been outside a while
  [0.94, 0.92, 0.84],
  [0.78, 0.80, 0.84],   // silver
  [0.92, 0.68, 0.30],   // ochre
  [0.76, 0.50, 0.28],   // rust brown
  [0.46, 0.72, 0.44],   // green
  [0.40, 0.66, 0.82],   // sky blue
  [0.80, 0.34, 0.30],   // maroon
  [0.95, 0.26, 0.20],   // and the loud ones, which are the exceptions
  [0.30, 0.46, 0.92],   // they are in a real car park: one red, one
  [0.96, 0.80, 0.24],   // blue, one yellow
  [0.36, 0.74, 0.70],   // and one turquoise, because it is 1987
];

/** Which paint a bay gets, off its own position.
 *
 *  NOT A FRESH RANDOM, for two reasons. The lot is laid out by the map
 *  with its own seeded stream and drawing from it here would move every
 *  number after it, which is most of the level. And a fleet that is the
 *  same fleet every time the level is built is a fleet you can take a
 *  screenshot of twice. `variant` is in the hash as well, so a map that
 *  later wants to steer the colours has a handle on them without this
 *  needing to know anything about bays.
 */
export function paintOf(slot, n = PAINT.length) {
  let h = ((slot.x | 0) * 374761393 + (slot.y | 0) * 668265263 + (slot.variant | 0) * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return PAINT[((h ^ (h >>> 16)) >>> 0) % n];
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
    /* what the white bodywork in the sheet is multiplied by — see PAINT */
    this.paint = opts.paint || [1, 1, 1];
    /* ITS OWN SHEET, if it has one. The lot is one model on one sheet
       and the slab is built on that; a vehicle that arrives with a
       different sheet — the police van — can never go into the slab and
       is drawn as its own mesh from the day it arrives to the day it is
       a wreck. `own` says so. */
    this.texture = opts.texture || fleet.texture;
    this.own = !!opts.own;
    /* FIREPROOF, which for a vehicle is invulnerable: fire is the only
       thing that ends one — shot to death is a char, and a char is a
       fire — so a vehicle that fire does nothing to is one nothing does
       anything to. The police van wears it, at the user's request; see
       damage, ignite, startChar and blowUp, which all ask. */
    this.fireproof = !!opts.fireproof;
    /* HOW HIGH IT RIDES OFF THE TARMAC, and zero for everything with
       wheels. The army's APC is a hover carrier and floats (see ArmyApc),
       which in here is one number and three consequences: the mesh is
       drawn that much higher, the thing you cannot walk through is that
       much taller — it still stands ON the ground, because the skirts
       are in the way whether they touch or not — and a wreck loses it,
       since nothing that has stopped working hovers. */
    this.hover = opts.hover || 0;

    this.state = opts.state || 'parked';
    this.health = HEALTH;
    this.burning = 0;
    this.burnTick = 0;
    this.flames = [];
    this.mesh = null;
    /* charring — see startChar */
    this.char = 0;
    this.charTics = 0;
    this.charTick = 0;
    this.flash = 0;

    const L = def.length, h = def.box.height;
    this.mid = [0, 0, h / 2];                 // it turns about its middle, not its wheels
    this.cz = this.ridingHeight;              // where that middle is
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.corners = carCorners(def).map(p => toMesh(p, this.mid, L));

    /* Parked: no mesh, no transform — just vertices in the slab. Unless
       it is its own thing, in which case it is a mesh from the start. */
    this.local = null;
    this.slab = null;
    if (this.own) {
      this.local = carGeometry(def, {
        angle: this.yaw, light: this.light, sky: this.sky, origin: this.mid, paint: this.paint,
      });
      this.mesh = carMesh(this.texture, this.local);
      this.mesh.name = 'car:' + def.id;
      fleet.game.scene.add(this.mesh);
      this.place();
    } else {
      this.slab = bake(carGeometry(def, {
        angle: this.yaw, light: this.light, sky: this.sky, origin: this.mid,
        paint: this.paint,
      }), this.yaw, 0, 0, this.x, this.y, this.cz);
    }

    /* and the part you cannot walk through, which for a hovering one is
       the gap under it as well: you do not get to walk beneath an APC */
    this.blockers = [];
    this.block(this.hover + carHeight(def));
  }

  /** Where the middle of it sits when it is standing or driving: on the
   *  tarmac, plus whatever it hovers. One place, because three things
   *  used to work it out and the hover had to reach all three. */
  get ridingHeight() { return this.ground + this.hover + this.def.box.height / 2 * this.def.length; }

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
  /** Whether anything can still happen to it: standing in a bay, on
   *  the road, or already charring. In the air and afterwards it is
   *  past hurting. */
  get whole() { return this.state === 'parked' || this.state === 'driving' || this.state === 'charring'; }

  damage(n) {
    if (!this.whole || this.fireproof) return;
    /* MORE DAMAGE TO ONE ALREADY CHARRING HURRIES IT: two tics off the
       fuse per point, so a car that has just started to blacken and is
       then hit by the bang next door goes early, and a chain reaction
       across a full row is a ripple rather than a metronome. */
    if (this.state === 'charring') { this.charTics = Math.max(1, this.charTics - n * 2); return; }
    this.health -= n;
    if (this.health <= 0) this.startChar();
  }

  ignite(tics = CATCH_TICS) {
    if (!this.whole || this.fireproof) return;
    const first = this.burning <= 0;
    this.burning = Math.max(this.burning, tics);
    if (first) this.catch();
  }

  /** The moment it is alight: the noise, the pool under it and the
   *  flames on it. Called once by ignite, and by startChar for a car
   *  that was shot to death without ever having been lit. */
  catch() {
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
    if (this.flames.length) return;
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

  /* ------------------------------------------------------------------
     CHARRING

     What happens between the tank being done for and the tank going.
     The car leaves the slab and becomes its own mesh — the only way to
     change one vehicle's vertices without rebuilding thirty-six — and
     for the next five to seven seconds two of its attributes are wound
     by hand: `charred`, which js/material.js scatters live coals over
     in proportion, and `light`, which comes down to a third so the
     paint goes black under them. The soot is the same coals and the
     same dark that a wreck ends up with; a charring car is a wreck
     arriving gradually, and when it reaches the end it goes up on the
     geometry it has, so what is in the air is the black thing you
     watched turn black.

     Off it the whole time: sparks, more of them as it goes; smoke,
     thicker; and the one fire light pulled toward it, harder as it
     goes, so the bay around a car about to go is lit like a hearth.
     ------------------------------------------------------------------ */
  startChar() {
    if (this.state === 'charring' || !this.whole || this.fireproof) return;
    const g = this.fleet.game;
    this.state = 'charring';
    this.char = 0;
    this.charTick = 0;
    this.charTics = Math.round(between(CHAR_TICS));
    if (this.burning <= 0) { this.burning = this.charTics + 40; this.catch(); }
    /* out of the slab and into a mesh of its own */
    if (this.slab) { this.slab = null; this.fleet.dirty = true; }
    if (!this.local) this.local = carGeometry(this.def, {
      angle: this.yaw, light: this.light, sky: this.sky, origin: this.mid, paint: this.paint,
    });
    if (!this.mesh) {
      this.mesh = carMesh(this.texture, this.local);
      this.mesh.name = 'car:' + this.def.id;
      g.scene.add(this.mesh);
    }
    this.light0 = Float32Array.from(this.local.light);
    this.place();
    g.sound?.play('burn', this);
  }

  charTic() {
    const g = this.fleet.game;
    this.char = Math.min(1, this.char + 1 / Math.max(1, this.charTics));
    const k = this.char;
    /* the vertices, every third tic: the coals and the dark */
    if ((++this.charTick % 3) === 0 && this.mesh) {
      const geo = this.mesh.geometry;
      const ch = geo.getAttribute('charred'), lt = geo.getAttribute('light');
      ch.array.fill(k * WRECK_CHAR);
      for (let i = 0; i < lt.array.length; i++) lt.array[i] = this.light0[i] * (1 - CHAR_DARK * k);
      ch.needsUpdate = true; lt.needsUpdate = true;
      /* and the arrays the wreck will be baked from, so what lands is
         what left */
      this.local.charred.fill(k * WRECK_CHAR);
      for (let i = 0; i < lt.array.length; i++) this.local.light[i] = lt.array[i];
    }
    const h = carHeight(this.def);
    g.fx?.ember(this.x, this.y, this.cz + h * 0.3, 1 + ((k * 2.5) | 0), 0.5 + k);
    if ((this.charTick % 3) === 1) g.fx?.puff(this.x, this.y, this.cz + h * 0.5, 22 + 18 * k, 160);
    g.fx?.glowAt(this.x, this.y, 0.8 + 1.6 * k);
    if ((this.charTick % 10) === 0) g.fire?.ignite(this.x, this.y, 40);
    if ((this.charTick % 24) === 0) g.sound?.play('burn', this);
    if (k >= 1) this.blowUp();
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
    if (!this.whole || this.fireproof) return;
    const g = this.fleet.game, d = this.def;
    this.state = 'air';
    this.burning = 0;
    this.douse();
    this.unblock();
    if (this.slab) { this.fleet.dirty = true; this.slab = null; }

    this.bigBoom();
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

    /* its own mesh now, for as long as it is off the ground — unless it
       already has one, charred, in which case that is what flies */
    if (!this.mesh) {
      this.local = carGeometry(d, {
        angle: this.yaw, light: this.light, sky: this.sky, origin: this.mid,
        paint: this.paint,
      });
      this.mesh = carMesh(this.texture, this.local);
      this.mesh.name = 'car:' + d.id;
      g.scene.add(this.mesh);
    }
    this.place();

    this.shed(SHED_LAUNCH);
  }

  /** A bang, centred on wherever the car is standing. `scale` is how
   *  many of the old bang this is — see FINAL. */
  boom(radius, damage, blasts, scale = 1, opts = {}) {
    const g = this.fleet.game;
    const at = { x: this.x, y: this.y, z: this.ground };
    g.explode(at, { radius, damage, heat: Math.min(255, 260 * scale), heatRadius: 96 * Math.sqrt(scale),
                    ignite: 340, sound: opts.sound });
    const L = this.def.length, W = carWidth(this.def);
    /* the fireballs, spread over the car's own footprint — and a big one
       spreads them past it, because a bang four times the size is not
       four times the fireballs in the same square */
    const n = (blasts + 2) * scale, wide = 0.7 + 0.25 * (scale - 1);
    for (let k = 0; k < n; k++) {
      const t = (rnd() - 0.5) * wide * L, u = (rnd() - 0.5) * (0.5 + 0.4 * (scale - 1)) * L;
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      g.spawn('BLAST', this.x + c * t - s * u, this.y + s * t + c * u, this.ground);
    }
    g.fx?.ember(this.x, this.y, this.ground + 20, 26 * scale, 1);
    for (let k = 0; k < 7 * scale; k++)
      g.fx?.puff(this.x + (rnd() - 0.5) * W * scale, this.y + (rnd() - 0.5) * W * scale,
                 this.ground + 24 + (k % 7) * 6, 34, 200);
  }

  /** THE BANG AT THE END OF THE CHAR — four of the old launch bang, on
   *  the terms set out at FINAL. What a bang this size adds that a
   *  smaller one did not need is a FLASH: the fire light thrown at the
   *  car for the next second, decaying, so the whole car park is lit
   *  from the bay for a moment and then is not. */
  bigBoom() {
    this.boom(FINAL_R, FINAL_DMG, 1, FINAL, { sound: 'bigboom' });
    this.flash = FINAL_FLASH;
  }

  /* ------------------------------------------------------------------
     Flying, and arriving
     ------------------------------------------------------------------ */
  tic() {
    /* the light of the bang, hanging about and going */
    if (this.flash > 0) {
      this.fleet.game.fx?.glowAt(this.x, this.y, 6 * (this.flash / FINAL_FLASH));
      this.flash--;
    }
    if (this.state === 'charring') { this.charTic(); return; }
    if (this.burning > 0) this.burnTic();
    /* AND IF THAT WAS THE TIC IT TIPPED OVER, stop here: burnTic can
       start the char, and a car that has just started charring must not
       fall through to the settle below, which is written for a car that
       has landed and would integrate a car that has not off numbers it
       does not have yet. It chars from the next tic. */
    if (this.state === 'charring') return;
    if (this.state === 'wreck') { this.smoulderTic(); return; }
    if (this.state === 'parked' || this.state === 'driving') return;

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
    this.hover = 0;                   // whatever held it up has stopped
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
    /* AND A BURNT RED VAN IS STILL A RED VAN. The char darkens what is
       left of the paint rather than replacing it, which is the right
       answer: a wreck you can still tell the colour of is a wreck you
       remember parking next to. */
    this.local = carGeometry(this.def, {
      angle: this.yaw, light: this.light * WRECK_LIT, sky: this.sky,
      origin: this.mid, charred: WRECK_CHAR, paint: this.paint,
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
    /* into the slab with the other wrecks — unless it is on a sheet of
       its own, in which case the mesh it has is the mesh it keeps */
    if (!this.own) {
      g.scene.remove(this.mesh);
      this.mesh.geometry.dispose(); this.mesh.material.dispose();
      this.mesh = null;
      this.fleet.restOf(bake(this.local, this.yaw, this.rx, this.rz, this.x, this.y, this.cz));
      this.local = null;
    }
    /* Still in the way, and still about as tall: a box turned over is
       exactly as tall as it was, and the tilt it came to rest at adds a
       little. Its own corners know, so they are asked rather than told. */
    this.block(this.cz + extentOf(this.corners, this.rx, this.rz).hi - this.ground);
    this.smoulder = SMOULDER * 2;
    this.tick = 0;
  }

  /* ------------------------------------------------------------------
     Pieces

     A chunk is the model's own surface inside a small box of this
     vehicle's own model space — so a piece off the tail is painted with
     the tail because it IS the tail, and nobody had to decide what a
     torn piece of van looks like.
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
      /* THE LAST INDEX IS ONE PAST THE END once in every 256 pieces,
         which is not a rounding worry, it is a crash. rnd() is
         pRandom() / 255 and pRandom() rolls 0 to 255 INCLUSIVE, so it
         returns 1.0 about once in 256 calls and (1.0 * n) | 0 is n.
         Every chunk shed off every car in the lot draws one of these,
         and a chain reaction across the car park sheds hundreds — so
         this was not a rare crash, it was a matter of how long the
         player stood there. Clamped rather than made exclusive because
         the other nine uses of rnd() in this file are ranges, where
         reaching the top of one is correct. */
      const pick = tris[Math.min(tris.length - 1, (rnd() * tris.length) | 0)];
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
        light: this.light, sky: this.sky, paint: this.paint,
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
      paint: o.paint,                    // a piece off a green van is green
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
   ONE THAT DRIVES

   The police van, which is the first vehicle in the game with somewhere
   to go. It is an ordinary Vehicle in the ways that matter — three
   cylinders, its own mesh, the same box — with one state in front of
   `parked` that nothing else has: DRIVING, along a list of points the
   map hands out (see level.swatRoutes), at a speed, with its three
   blockers carried along under it.

   AND IT IS FIREPROOF, at the user's request, which for a vehicle is
   invulnerable (see the flag in Vehicle): it does not catch, it does
   not char, it does not go up, and a car going up in the next bay does
   not touch it. It used to burn like the customers' vans and going up
   was what stopped it unloading; nothing stops it now. The squad is
   dealt with one trooper at a time, and the van is the road's end of a
   pipe.

   IT IS NOT A CAR PHYSICS EITHER. The position rides the polyline
   exactly and the heading eases toward each segment's direction at a
   fixed rate, which is enough: a van pulling round a T-junction at a
   walking pace reads as a van pulling round a T-junction, and nothing
   about how it got there is ever looked at twice. It stops where the
   route ends, squares up along the front, and is a parked van from then
   on — the responders decide what comes out of it.

   AND IT DOES NOT STOP FOR ANYBODY. The lot is full of people running
   from a fire, and a squad van coming up the frontage lane at speed
   goes through them: anything solid in front of it is hit hard enough
   to come apart, and the player is shoved and hurt, which is the one
   thing other than a rifle that gets through their fireproofing.
   ===================================================================== */
/* AT THE USER'S REQUEST THEY SPEED IN, and this is the third number it
   has been. Fifteen units a tic — twice a running shopper — put the
   first van in front of you half a minute after it was called, which is
   an interval rather than a response. Thirty was a van with its lights
   on at two in the morning, and took fourteen seconds, and the user
   said it was still too slow.

   SIXTY IS NOT A VAN ANY MORE and is not meant to be: it is two
   thousand units a second, which against a running shopper's four is
   something arriving rather than something driving. What the number
   actually buys is the OUTSIDE case — see `runIn` and `stop` in
   js/responders.js, which are the other two thirds of the same request:
   step out of the building and the first convoy is at the junction
   within a second, across the lot in three, and stopped a van's nose
   from you rather than a van's length.

   AND THE HEADING KEEPS UP, which is the one thing the speed can break.
   The POSITION rides the polyline exactly whatever the speed is; it is
   the drawn yaw that eases, and at thirty units a tic 0.09 a tic was
   enough to be square through a corner. At sixty it is not — a van
   would be sideways down the whole of the frontage lane — so the turn
   rate goes up with it, and what is left is a slide through the
   junction, which is the right amount of wrong. */
const DRIVE_SPEED = 60;          // units a tic
const DRIVE_TURN = 0.17;         // radians a tic the heading may change
const RUNOVER_DMG = 220;         // what the front of a van does to a person
const RUNOVER_PLAYER = 28;       // and to you
const SIREN_EVERY = 19;          // tics between the two notes

export class SwatVan extends Vehicle {
  /**
   * @param fleet
   * @param def      the police van, from modelVehicle
   * @param texture  its own sheet
   * @param route    points to drive through, in order; the last is where
   *                 it stops. `x`, `y`, and on the last one `angle`,
   *                 which it squares up to once it is there
   */
  constructor(fleet, def, texture, route) {
    const start = route[0], next = route[1] || route[0];
    const sec = fleet.game.level.sectorAt(start.x, start.y);
    super(fleet, def, {
      x: start.x, y: start.y, z: sec ? sec.floor : 0,
      angle: Math.atan2(next.y - start.y, next.x - start.x),
      light: sec ? sec.light : 0.74, sky: sec ? (sec.sky ?? (sec.outdoor ? 1 : 0)) : 1,
      paint: [1, 1, 1], texture, own: true, fireproof: true, state: 'driving',
    });
    this.route = route.slice(1);
    this.driven = 0;
    this.sirenTick = 0;
    this.sirenNote = 0;
    this.arrivedTic = -1;
    /* WHAT IT SOUNDS LIKE COMING, and how hard it hits, both on the
       instance rather than in a constant, because the APC behind it is
       the same drive with a turbine instead of a siren and half a ton
       more of it. See ArmyApc. */
    this.notes = ['siren', 'siren2'];
    this.noteEvery = SIREN_EVERY;
    this.runoverDmg = RUNOVER_DMG;
    this.runoverPlayer = RUNOVER_PLAYER;
  }

  tic() {
    if (this.state === 'driving') { this.drive(); return; }
    super.tic();
  }

  /** How far it is, in whole units, from the next point on its route. */
  get toNext() {
    const p = this.route[0];
    return p ? Math.hypot(p.x - this.x, p.y - this.y) : 0;
  }

  drive() {
    const g = this.fleet.game;
    const p = this.route[0];
    if (!p) { this.park(); return; }
    /* the heading, eased; the position, exact */
    const want = Math.atan2(p.y - this.y, p.x - this.x);
    const d = angleDiff(want, this.yaw);
    this.yaw = angleNorm(this.yaw + Math.max(-DRIVE_TURN, Math.min(DRIVE_TURN, d)));
    const left = this.toNext;
    const step = Math.min(DRIVE_SPEED, left);
    this.x += Math.cos(want) * step; this.y += Math.sin(want) * step;
    this.driven += step;
    if (left - step < 0.5) this.route.shift();
    if ((g.tics & 3) === 0) { this.updateSector(); this.cz = this.ridingHeight; }
    this.place();
    this.carryBlockers();
    this.runOver();
    /* the siren: two notes, alternating, for as long as it is moving */
    if (++this.sirenTick >= this.noteEvery) {
      this.sirenTick = 0;
      g.sound?.play(this.notes[this.sirenNote], this);
      this.sirenNote ^= 1;
    }
    /* embers off the flash of the lights would be a lie, so nothing —
       and nothing burns either, being fireproof; the line stands for a
       vehicle that is not */
    if (this.burning > 0) this.burnTic();
  }

  /** The three cylinders, moved to under the van rather than remade:
   *  spawning three actors a tic is garbage the blockmap can do without,
   *  and a moved actor is one hash. */
  carryBlockers() {
    const bl = carBlockers(this.def, this.x, this.y, this.yaw);
    for (let i = 0; i < this.blockers.length && i < bl.length; i++) {
      const a = this.blockers[i];
      a.x = bl[i].x; a.y = bl[i].y; a.z = this.ground;
      this.fleet.game.blockmap?.moved(a);
    }
  }

  /** Anybody in front of it. Checked at the nose, against the crowd
   *  near it, and against the player. */
  runOver() {
    const g = this.fleet.game;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const L = this.def.length, r = carBlockRadius(this.def);
    const nx = this.x + c * 0.42 * L, ny = this.y + s * 0.42 * L;
    const near = g.blockmap ? g.blockmap.near(nx, ny, this._near || (this._near = [])) : g.actors;
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      if (a.removed || a.dead || !a.solid || a.vehicle || !a.shootable) continue;
      const rr = r + a.radius;
      if (dist2(nx, ny, a.x, a.y) > rr * rr) continue;
      a.damage(this.runoverDmg, null, { impact: true, dx: c, dy: s, force: 2.5 });
    }
    const p = g.player;
    if (p && !p.dead) {
      const rr = r + p.radius;
      if (dist2(nx, ny, p.x, p.y) < rr * rr) p.damage(this.runoverPlayer, this, { impact: true });
    }
  }

  /** It has arrived: squared up along the front, in the way, and a van
   *  from here on. */
  park() {
    this.state = 'parked';
    if (this.parkAngle !== undefined) this.yaw = this.parkAngle;
    this.updateSector();
    this.cz = this.ridingHeight;
    this.place();
    this.block(this.hover + carHeight(this.def));
    this.arrivedTic = this.fleet.game.tics;
    this.fleet.game.sound?.play('doorclose', this);
  }

  /** Where somebody steps out: the flank facing `toward` (a point —
   *  the shop), a little along the length, clear of the blockers. */
  door(k = 0, toward = { x: this.x, y: this.y + 1000 }) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const L = this.def.length, half = carWidth(this.def) / 2;
    /* which side is nearer the shop: the left (+y in model space, which
       is -s, c in the world) or the right */
    const lx = -s, ly = c;
    const side = (toward.x - this.x) * lx + (toward.y - this.y) * ly >= 0 ? 1 : -1;
    const out = half + 26;
    const t = [0, -0.22, 0.22, -0.4, 0.4][k % 5] * L;
    return { x: this.x + c * t + lx * side * out, y: this.y + s * t + ly * side * out,
             angle: Math.atan2(ly * side, lx * side) };
  }
}

/* =====================================================================
   AND ONE THAT DOES NOT TOUCH THE ROAD

   The army's APC, which is the second thing that drives up the road and
   the first that does not drive on it. It is a SwatVan in every way
   that is about GETTING somewhere — the same polyline, the same eased
   heading, the same nose that goes through whatever is in front of it,
   the same doors — because a hover carrier coming up a frontage lane
   takes the same corners a van does, and every one of those corners is
   already measured against this map. What is different is everything
   about what it IS.

   IT FLOATS. `hover` holds the whole vehicle off the tarmac and BOB
   breathes it up and down on a four-second cycle, which is the entire
   trick: nothing else in this game moves when it is standing still, so
   a thing that does reads as held up by something rather than parked.
   The gap under it is not a gap you can use — the blockers are as tall
   as the hover plus the hull and they still stand ON the ground (see
   Vehicle.block), because an APC's skirts are in the way whether they
   are touching or not.

   AND IT BLOWS THE CAR PARK ABOUT. Whatever holds it up throws grit
   down, so there is a puff under the middle of it every few tics — hard
   and low while it is moving, an idle while it stands. This is the one
   piece of it that is not free and it is worth what it costs: it is
   what makes the hover read at a distance, where five units of bob is
   nothing.

   AND IT WEIGHS MORE. Twice the van's damage to anybody in front of it
   and half again to you, which for a vehicle this wide is most of the
   fire lane at once.

   IT DOES NOT HAVE A SIREN. Two notes still, on the same clock, but
   they are the turbine: a low sawtooth that rises and falls instead of
   a square wave that wails. See `hover` and `hover2` in js/audio.js.
   ===================================================================== */
const HOVER = 34;                // how high the skirts ride, in game units
const BOB = 5;                   // and how far it breathes, either way
const BOB_RATE = Math.PI * 2 / 140;   // one whole breath in four seconds
const WASH_MOVING = 3;           // tics between downwash puffs, driving
const WASH_STANDING = 13;        // and standing
const APC_RUNOVER = 440;         // what the front of one does to a person
const APC_RUNOVER_PLAYER = 42;   // and to you
const TURBINE_EVERY = 26;        // tics between the two notes

export class ArmyApc extends SwatVan {
  constructor(fleet, def, texture, route) {
    super(fleet, def, texture, route);
    this.notes = ['hover', 'hover2'];
    this.noteEvery = TURBINE_EVERY;
    this.runoverDmg = APC_RUNOVER;
    this.runoverPlayer = APC_RUNOVER_PLAYER;
    this.bobT = pRandom();          // no two of them breathe together
    this.hover = HOVER;
    this.cz = this.ridingHeight;
    /* it was built standing on the tarmac; stand it up and make the
       thing you cannot walk through as tall as it now is */
    this.place();
    this.block(this.hover + carHeight(this.def));
  }

  /** The height it rides at with the breath taken out, for anyone
   *  outside measuring the hover against what it is meant to be. */
  static get HOVER() { return HOVER; }

  tic() {
    /* the breath first, so whatever super does with cz does it at the
       height this tic is actually at */
    if (this.whole) this.hover = HOVER + Math.sin((this.bobT += 1) * BOB_RATE) * BOB;
    super.tic();
    if (!this.whole) return;
    /* super recomputes cz on its own clock — every fourth tic while it
       is driving, once on arrival, never while parked — which is fine
       for a van that only moves when it is driving and is not enough
       for one that is never still. So it is set here, every tic. */
    this.cz = this.ridingHeight;
    this.place();
    this.wash();
  }

  /** The grit under it. Low and wide where the skirts are, on a clock
   *  that is four times faster while it is moving. */
  wash() {
    const g = this.fleet.game;
    const every = this.state === 'driving' ? WASH_MOVING : WASH_STANDING;
    if ((g.tics + (this.bobT | 0)) % every) return;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const L = this.def.length, W = carWidth(this.def);
    const t = ((pRandom() / 255) - 0.5) * 0.7 * L, u = ((pRandom() / 255) - 0.5) * W;
    g.fx?.puff(this.x + c * t - s * u, this.y + s * t + c * u, this.ground + 6, 30, 120);
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
   * now assets/models/van.glb in every bay, drawn as its author exported
   * it. What that costs is variety, and what it buys is a car park full
   * of the user's own model — and, read a certain way, a delivery fleet
   * parked outside a store called SellWrong is not the wrong joke.
   *
   * `variant` is still on every slot and is still what would pick
   * between vehicles if there were more than one; it is simply not read
   * while there is one. The drawn fleet's riot van and APC are still
   * measured and still packed in their atlas, waiting for
   * js/responders.js to drive them up the road.
   *
   * BUT THEY ARE NOT ALL THE SAME COLOUR ANY MORE, at the user's
   * request. One model in seventy-seven bays is a delivery fleet, which
   * was a joke worth one look; a car park is what this is meant to be,
   * and a car park is twelve colours of the same shape. The paint rides
   * in the vertices and the white in the sheet is isolated in the
   * shader — see PAINT above, and the INK block in js/material.js — so
   * it is still one texture and still one draw call.
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
        paint: paintOf(slot),
      }));
    }
    this.dirty = true;
    this.rebuild();
    return this;
  }

  /** A vehicle that is not one of the lot's — a van that has driven in.
   *  It is ticked, counted and cleaned up with the rest; it is never in
   *  the slab, because it has a sheet of its own. */
  addVehicle(v) { this.all.push(v); return v; }

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
