/* =====================================================================
   GROCERY STORE SIMULATOR — the game
   =====================================================================

   Holds the level, the actors, the fire and the player, and runs the
   world at a fixed 35 Hz whatever the renderer is doing.

   THE FIXED TIMESTEP IS NOT NEGOTIABLE. Every duration in the state
   tables is in tics; every movement constant is per tic. Run the world
   off the frame time and a monster's walk cycle changes speed with the
   framerate, a door opens faster on a better machine, and the physics
   constants stop meaning what they say. So the frame time goes into an
   accumulator and the world steps in whole tics, with the leftover
   carried forward. The RENDERER can run at whatever rate it likes; the
   world runs at 35, on every machine, for ever.

   The catch-up is capped at six tics. A tab that has been in the
   background for a minute should not try to simulate a minute of
   supermarket the instant it comes back.
   ===================================================================== */

import * as THREE from 'three';
import { TICRATE, PLAYER_EYE, angleNorm, angleDiff, dist, dist2, pRandom, clamp } from './util.js';
import { Level } from './level.js';
import { buildLevelGeometry } from './mapgeo.js';
import { Actor, ACTIONS, ActorGrid } from './actor.js';
import { ACTORS } from './states.js';
import { Player } from './player.js';
import { FireSystem } from './fire.js';
import { world } from './material.js';
import { charredName, guttedSurfaces } from './textures.js';
import { assignLineTextures } from './level.js';
import { createSpriteMaterial } from './material.js';
import { buildSlideDoors } from './slidedoor.js';
import { buildSky, followSky } from './sky.js';
import { Forest } from './forest.js';
import { FlameStream } from './flame.js';
import { Effects } from './effects.js';
import { Giblets } from './people.js';
import { Responders } from './responders.js';
import { Vehicles } from './vehicles.js';

const THING_TO_ACTOR = {
  SHOPPER: 'SHOPPER',
  TROLLEY: 'TROLLEY', BOLLARD: 'BOLLARD',
  FUELCAN: 'FUELCAN', CRATE: 'CRATE', LAMP: 'LAMP',
};

/* How far a fitting throws light and how much it is worth at the source.
   340 is a little over one grid step, so every point on the shop floor is
   reached by two or three of them and losing one is a noticeable dent
   rather than a blackout — until you shoot out the neighbours too. */
const LAMP_RANGE = 340;
const LAMP_GAIN = 0.30;

export class Game {
  constructor({ level, scene, camera, textures, sprites, hud, audio, input, sky, flameAtlas, fxAtlases, gibAtlases, fleet }) {
    this.level = level;
    this.scene = scene;
    this.camera = camera;
    this.textures = textures;
    this.sprites = sprites;
    this.hud = hud;
    this.sound = audio;
    this.input = input;

    this.actors = [];
    this.projectiles = [];
    this.lamps = [];
    this.doors = [];
    /* ------------------------------------------------------------------
       WHAT TO SPEND THE FRAME ON

       Three dials, all of them 1 by default and all of them honoured by
       whoever can honour them rather than by a branch here: the crowd is
       how many standees are drawn, effects is how much of the fire's
       sprite pool gets used, and wood is how far into the trees the
       chunks are kept. The pause menu sets them (see js/main.js) and the
       simulation never reads them — the shop is the same shop at every
       setting, it is only the drawing that is cheaper.
       ------------------------------------------------------------------ */
    this.quality = { crowd: 1, effects: 1, wood: 1 };
    this.tics = 0;
    this.accum = 0;
    this.paused = false;
    this.state = 'play';           // play | dead | won
    this.bigMessage = null;
    this.bigMessageTics = 0;
    this.totalMonsters = 0;

    /* Before anything is spawned: every actor puts itself into this on
       the way out of its constructor. See ActorGrid in js/actor.js for
       why the crowd needs one. */
    this.blockmap = new ActorGrid();

    const geo = buildLevelGeometry(level, textures);
    this.geo = geo;
    scene.add(geo.group);

    this.lamps = [];
    this.spawnThings();
    this.relight();
    this.geo.rebuildStatic();          // with the lamps' light in it
    /* after relight, because a car's light is baked into it the same way
       a wall's is, and it should be the light the bay ended up with */
    this.vehicles = new Vehicles(this, fleet?.texture || null, fleet?.def || null)
      .place(this.level.carSlots);
    this.slideDoors = buildSlideDoors(this);
    /* the sky is a picture that arrives from outside; without one (the
       smoke test) there is simply no sky, and nothing else minds */
    this.sky = sky ? buildSky(sky) : null;
    if (this.sky) scene.add(this.sky);
    this.fire = new FireSystem(this);

    /* The wood round the outside, the flame out of the gun, and what
       rises off anything burning. All three simulate without a renderer;
       they only draw once handed the pictures to draw with. */
    this.forest = new Forest(level);
    this.flame = new FlameStream(this, flameAtlas || null);
    this.fx = new Effects(this, fxAtlases || null);
    /* and what comes off a person: the pieces and the fire on them */
    this.giblets = new Giblets(this, gibAtlases || null);
    if (flameAtlas) this.flame.attach(scene);
    if (fxAtlases) this.fx.attach(scene);
    if (gibAtlases) this.giblets.attach(scene);
    this.weapon3d = null;
    /* who the night brings — the escalation is real, the arrivals are
       not yet; see js/responders.js */
    this.responders = new Responders(this);
    this.idle = false;                 // the title: the world stands still and the eye wanders
    this._nozzle = { x: 0, y: 0, z: 0 };
    this._scared = [];                 // scratch for Game.scare
    this._initBurnGrid();

    /* the flame the player is holding, and everything else that needs a
       quad but is not an actor */
    this._projGeo = new THREE.PlaneGeometry(1, 1);
    this._projGeo.translate(0, 0.5, 0);
  }

  get burnPercent() { return this.fire ? this.fire.burnFraction * 100 : 0; }
  get forestPercent() { return this.forest ? this.forest.burnFraction * 100 : 0; }

  /** How many of them are still alive, anywhere. On the status bar
   *  because the shop now has six fire exits in it and most of the crowd
   *  leaves through them: the number that matters once the building is
   *  going is not how much of it has burnt, it is how many are still
   *  out there. Counted rather than kept, because a count is one pass
   *  over a list a few times a second and a tally is a thing to get
   *  wrong in six places. */
  get peopleLeft() {
    let n = 0;
    for (const a of this.actors) if (a.type === 'SHOPPER' && !a.dead && !a.removed) n++;
    return n;
  }

  /** Where the flame is born: the end of the gun as drawn, if there is
   *  one, else a point low and right of the eye — which is where the
   *  drawn one is anyway. Game coordinates. */
  nozzle() {
    const o = this._nozzle;
    if (this.weapon3d && this.weapon3d.nozzleWorld(this.camera, o)) return o;
    const p = this.player;
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    o.x = p.x + c * 18 + s * 9;
    o.y = p.y + s * 18 - c * 9;
    o.z = p.viewZ - 9;
    return o;
  }

  /* ------------------------------------------------------------------
     Populating
     ------------------------------------------------------------------ */
  spawnThings() {
    for (const t of this.level.things) {
      if (t.type === 'START') {
        this.player = new Player(this, t.x, t.y, t.angle);
        continue;
      }
      const type = THING_TO_ACTOR[t.type];
      if (!type) { console.warn('unknown thing type', t.type); continue; }
      /* Lights are laid on a grid over the whole map; the ones that fell
         outdoors, into a doorway, or under a low ceiling are dropped
         here rather than described twice in the map file. */
      if (type === 'LAMP') {
        const sec = this.level.sectorAt(t.x, t.y);
        if (!sec || sec.outdoor || sec.ceil < 200) continue;
      }
      const a = new Actor(this, type, t.x, t.y, t.angle, { variant: t.variant });
      this.actors.push(a);
      if (a.monster) this.totalMonsters++;
      /* A light is kept for relight() and for nothing else: it has no
         state, so it draws nothing, and the fitting you see above it is
         painted into the ceiling texture. */
      if (type === 'LAMP') this.lamps.push(a);
    }
    if (!this.player) throw new Error('map has no START');
  }

  spawn(type, x, y, z, opts = {}) {
    const a = new Actor(this, type, x, y, opts.angle || 0, opts);
    if (z !== undefined) a.z = z;
    this.actors.push(a);
    return a;
  }

  spawnPuff(x, y, z) { this.spawn('PUFF', x, y, z); }


  /* ------------------------------------------------------------------
     Light that comes from somewhere

     A sector's brightness is its own ambient — emergency lighting,
     whatever comes through the front — plus every working fitting that
     can see it. Which means shooting one out genuinely takes light away,
     and a fire working its way along a run of them puts an aisle out
     one section at a time.

     The reach test is done NEAR THE CEILING on purpose. Walls run floor
     to ceiling and stop it, so light does not pass between rooms; but a
     gondola is only 80 tall and the ceiling is 352, so light passes over
     the shelves into the next aisle, which is what light does.
     ------------------------------------------------------------------ */
  /**
   * Sample points across a sector, so its brightness is an AVERAGE over
   * its area rather than the value at one arbitrary place in it.
   *
   * The first version measured each lamp against the nearest point of
   * the sector's bounding box, which for a 600-unit aisle is distance
   * zero from every fitting along its length — so every sector summed
   * four or five lamps at full strength, clamped to 1.0, and shooting
   * them out changed nothing anywhere. A long room is not close to a
   * lamp; parts of it are.
   */
  _sectorSamples(s) {
    if (s._samples) return s._samples;
    const [x0, y0, x1, y1] = s.bbox;
    const nx = Math.min(3, Math.max(1, Math.round((x1 - x0) / 220)));
    const ny = Math.min(3, Math.max(1, Math.round((y1 - y0) / 220)));
    const pts = [];
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++)
        pts.push([x0 + (x1 - x0) * ((i + 0.5) / nx), y0 + (y1 - y0) * ((j + 0.5) / ny)]);
    s._samples = pts;
    return pts;
  }

  /**
   * Which lamps can possibly reach a point.
   *
   * The naive version — every sector against every lamp — is fine in a
   * corner shop and quadratic everywhere else. A store with two hundred
   * and fifty fittings and two hundred and fifty sectors is sixty
   * thousand sight tests per relight, and a relight happens every time a
   * fire takes out a run of lights, which is constantly.
   *
   * So the lamps go in a uniform grid whose cell is exactly LAMP_RANGE.
   * Nothing outside the nine cells around a point can be within range of
   * it, by construction, and the nine cells hold four or five fittings
   * instead of two hundred and fifty. It is Doom's blockmap applied to
   * light, which is what a blockmap is for.
   */
  _buildLampGrid() {
    const cell = LAMP_RANGE;
    const g = new Map();
    for (const lamp of this.lamps) {
      if (lamp.dead || lamp.removed) continue;
      const k = Math.floor(lamp.x / cell) + ',' + Math.floor(lamp.y / cell);
      let b = g.get(k);
      if (!b) g.set(k, b = []);
      b.push(lamp);
    }
    this._lampGrid = g;
    this._lampCell = cell;
  }

  relight() {
    const L = this.level;
    this._buildLampGrid();
    const cell = this._lampCell, grid = this._lampGrid;
    const near = [];
    for (const s of L.sectors) {
      if (s.outdoor) { s.light = s.ambient; continue; }
      const pts = this._sectorSamples(s);
      let total = 0;
      for (const [px, py] of pts) {
        near.length = 0;
        const gx = Math.floor(px / cell), gy = Math.floor(py / cell);
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++) {
            const b = grid.get((gx + i) + ',' + (gy + j));
            if (b) for (let k = 0; k < b.length; k++) near.push(b[k]);
          }
        for (const lamp of near) {
          const d = Math.hypot(px - lamp.x, py - lamp.y);
          if (d >= LAMP_RANGE) continue;
          const tz = Math.min(s.ceil - 8, lamp.z);
          if (d > 1 && L.sightBlocked(lamp.x, lamp.y, lamp.z, px, py, tz)) continue;
          total += LAMP_GAIN * Math.pow(1 - d / LAMP_RANGE, 1.2);
        }
      }
      s.light = Math.min(1, s.ambient + total / pts.length);
    }
  }

  onLampDestroyed(lamp) {
    /* GLASS, A POP, AND A SHOWER OF SPARKS THAT FALLS. This is the whole
       of what a light going out looks like up close — the fitting itself
       is paint in the ceiling and cannot change — and it used to be
       A_LampBurst on a three-tic death state. There is no death state
       any more, so it happens here, which is the one place that knows a
       light has gone. */
    this.sound?.play('lampbreak', lamp);
    this.spawnSparks(lamp.x, lamp.y, lamp.z + 10, 10 + (pRandom() & 7));
    /* And the rest of what it looks like is the aisle going dark.
       Relighting walks every lamp against every sector, so it is not
       done per lamp — a fire takes out a whole run of them within a
       second or two and one rebuild covers the lot. */
    this._geoDirty = true;
    this._geoAt = this.tics + 10;
  }

  /** What comes out of a light when it goes: bright, brief, and it falls. */
  spawnSparks(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const a = (pRandom() / 255) * Math.PI * 2;
      const sp = 0.8 + (pRandom() / 255) * 4.2;
      this.projectiles.push({
        kind: 'SPARK', x, y, z,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: -(0.4 + (pRandom() / 255) * 1.8),
        gravity: -0.85, owner: null, life: 16 + (pRandom() & 15),
        sprite: 'SPRK', frame: 'A', mesh: null, damage: 0,
      });
    }
  }

  /* ------------------------------------------------------------------
     One tic of the world
     ------------------------------------------------------------------ */
  update(dt) {
    if (this.paused) {
      /* Still listen. A pause that stops sampling the pause key is a
         door with no handle on the inside. */
      this.input.sample(1 / TICRATE);
      if (this.input.pausePressed) this.setPaused(false);
      return;
    }
    this.accum += dt;
    const step = 1 / TICRATE;
    let n = 0;
    while (this.accum >= step && n < 6) { this.tic(); this.accum -= step; n++; }
    if (n === 6) this.accum = 0;          // we are behind; drop the debt
  }

  tic() {
    this.tics++;
    this.input.sample(1 / TICRATE);

    if (this.input.pausePressed && this.state === 'play') this.setPaused(true);

    this.player.tic(this.input, 1 / TICRATE);
    for (let i = 0; i < this.actors.length; i++) this.actors[i].tic();
    this.ticProjectiles();
    this.ticDoors();
    for (let i = 0; i < this.slideDoors.length; i++) this.slideDoors[i].tic();
    this.fire.tic();
    this.vehicles.tic();
    this.forest.tic();
    this.flame.tic();
    this.fx.tic();
    this.giblets.tic();
    this.applyChar();
    this.ticBurnGrid();
    this.hud.ticMessages();

    if (this.bigMessageTics > 0 && --this.bigMessageTics === 0) this.bigMessage = null;

    /* the corpses and the spent puffs, cleared once a tic */
    for (let i = this.actors.length - 1; i >= 0; i--)
      if (this.actors[i].removed) this.actors.splice(i, 1);

    this.responders.tic();

    if (this.sound) {
      this.sound.listener = this.player;
      this.sound.setAmbience(Math.min(1, this.fire.burningCells / 90));
    }
  }

  /**
   * Swap a burnt-out region's surfaces for their charred twins.
   *
   * Debounced, because half a dozen gondolas can pass the threshold in
   * the same second and each swap costs a full rebuild of the level's
   * static geometry. Collecting them and rebuilding once every twenty
   * tics turns six hitches into one that nobody sees.
   */
  applyChar() {
    const f = this.fire;
    if (f.newlyCharred.length) {
      for (const si of f.newlyCharred) {
        const s = this.level.sectors[si];
        for (const k of ['floorTex', 'ceilTex', 'wallTex', 'upperTex', 'lowerTex']) {
          const burnt = charredName(s[k]);
          if (burnt !== s[k] && this.textures.map.has(burnt)) s[k] = burnt;
        }
        /* A region that has burnt is LIT BY WHAT IT WAS: embers in every
           crack, the roof gone through, the next aisle alight. Its fittings
           are dead by now and its emergency ambient was written for a dark
           shop with the power off, which left a gutted store near black —
           and you have to walk back out through it. So the floor of a
           charred region's light comes up, and stays up. */
        if (!s.outdoor) s.ambient = Math.max(s.ambient, 0.58);
      }
      /* A slider whose entrance has burned is not a door any more. */
      for (const d of this.slideDoors)
        if (d.spec.sector && f.newlyCharred.includes(d.spec.sector.index)) d.jam();
      f.newlyCharred.length = 0;
      this._geoDirty = true;
      this._geoAt = this.tics + 20;
    }

    /* AND THEN THE BUILDING ITSELF. A region whose fuel is all gone
       stops being a charred room and becomes a ruin: holes through the
       walls with the framing behind them, a slab with the ceiling on it,
       and no roof — the ceiling becomes sky, so a store that has fully
       burnt is a shell open to the night with the fire still in the
       cracks. It happens region by region, so the roof goes in PATCHES
       and there is a long stretch where some of the shop is still a shop
       and some of it is a hole. See guttedSurfaces in js/textures.js. */
    if (f.newlyGutted.length) {
      for (const si of f.newlyGutted) {
        const s = this.level.sectors[si];
        const to = guttedSurfaces(s, { cells: f.sectorCells[si] });
        for (const k of Object.keys(to)) {
          /* THREE OF THESE ARE NOT TEXTURES. `sky` is how much of the
             region's light comes from overhead; `ruinRoof` says whether
             the deck is holed or gone, which is what makes js/ruin.js
             hang steel over it; `ruinVariant` is which of the three
             ruins this region drew. All three would fail the "is there a
             texture called that" test below and be silently dropped. */
          if (k === 'sky' || k === 'ruinRoof' || k === 'ruinVariant') { s[k] = to[k]; continue; }
          if (to[k] === 'SKY' || this.textures.map.has(to[k])) s[k] = to[k];
        }
        /* Lit by what is left of it: the cracks in the slab and the sky.
           Higher than charred, because there is a hole in the roof. */
        s.ambient = Math.max(s.ambient, 0.66);
        /* AND THERE IS NO WIRING LEFT IN A ROOF THAT IS NOT THERE. They
           used to be taken away rather than switched off because a dead
           fitting still DREW, and a row of sprites hanging in the open
           night over a roofless shop was the one thing in the shot that
           said "this is a computer program". They draw nothing now, so
           this is only about the light: a sector open to the sky is not
           being lit by a fitting that fell into it. */
        for (const lamp of this.lamps)
          if (!lamp.removed && lamp.sector === s) { lamp.dead = true; lamp.remove(); }
      }
      f.newlyGutted.length = 0;
      this._geoDirty = true;
      this._geoAt = this.tics + 20;
    }
    if (this._geoDirty && this.tics >= this._geoAt) {
      this._geoDirty = false;
      this.relight();
      assignLineTextures(this.level.lines, this.level.sectors);
      this.geo.rebuildStatic();
      this.geo.rebuild();
    }
  }

  /* THERE IS NO GOAL. There was — burn sixty per cent and get back to
     the car park — and it is gone, at the user's request: the only aim
     for now is open mayhem, and the night ends when you close the tab.
     What the night brings in return is js/responders.js's business. */

  /** The pause is owned here and announced outward, so the menu on the
   *  page, the keyboard and the button on a phone all go through one
   *  switch and cannot disagree about whether the game is running. */
  setPaused(on) {
    on = !!on;
    if (this.paused === on) return;
    this.paused = on;
    this.onPauseChange?.(on);
  }

  /* what "go again" is, on whatever this is being played on */
  get retryPrompt() { return this.input?.mode === 'touch' ? 'TAP TO GO AGAIN' : 'PRESS SPACE TO GO AGAIN'; }

  onPlayerDied() {
    this.state = 'dead';
    this.setBigMessage(`YOU DIED IN AISLE 5\n${this.retryPrompt}`, 100000);
    this.onStateChange?.(this.state);
  }

  onMonsterKilled(a, source) { if (source === this.player) this.player.kills++; }

  message(t) { this.hud.message(t); }
  setBigMessage(t, tics) { this.bigMessage = t; this.bigMessageTics = tics; }

  /* ------------------------------------------------------------------
     Weapons reaching into the world
     ------------------------------------------------------------------ */

  /** Everything alive in a cone in front of `from`, nearest first. */
  actorsInCone(from, range, arc, shootableOnly = true) {
    const out = [];
    const r2 = range * range;
    for (const a of this.actors) {
      if (a.removed || a.dead || a === from) continue;
      if (shootableOnly && !a.shootable) continue;
      const d2 = dist2(from.x, from.y, a.x, a.y);
      if (d2 > r2) continue;
      const ang = Math.atan2(a.y - from.y, a.x - from.x);
      if (Math.abs(angleDiff(ang, from.angle)) > arc) continue;
      if (this.level.sightBlocked(from.x, from.y, from.eyeZ, a.x, a.y, a.z + a.height * 0.5)) continue;
      out.push({ a, d2 });
    }
    out.sort((p, q) => p.d2 - q.d2);
    return out.map(o => o.a);
  }

  /** A shot that arrives instantly. Walks the ray, takes the nearest of
   *  the first actor it crosses and the first wall. */
  hitscan(from, angle, range, damage) {
    const tx = from.x + Math.cos(angle) * range;
    const ty = from.y + Math.sin(angle) * range;
    const z = from.eyeZ;

    const wall = this.level.rayHitWall(from.x, from.y, z, tx, ty, z);
    const maxT = wall ? wall.t : 1;

    let best = null, bestT = maxT;
    const targets = from === this.player ? this.actors : [this.player, ...this.actors];
    for (const a of targets) {
      if (!a || a === from || a.removed || a.dead || !a.shootable) continue;
      /* project the actor onto the ray and see if it is within its
         radius of the line */
      const dx = tx - from.x, dy = ty - from.y;
      const len2 = dx * dx + dy * dy;
      let t = ((a.x - from.x) * dx + (a.y - from.y) * dy) / len2;
      if (t <= 0 || t >= bestT) continue;
      const px = from.x + dx * t, py = from.y + dy * t;
      if (dist2(px, py, a.x, a.y) > a.radius * a.radius) continue;
      /* and that the shot is at a height the thing occupies */
      if (z < a.z - 8 || z > a.z + a.height + 8) continue;
      bestT = t; best = { a, x: px, y: py };
    }

    if (best) {
      best.a.damage(damage, from);
      this.spawnPuff(best.x, best.y, z);
      return best.a;
    }
    if (wall) this.spawnPuff(wall.x, wall.y, wall.z);
    return null;
  }

  /* ------------------------------------------------------------------
     Things in the air

     Not Actors. A projectile lives for under a second, moves in a
     straight line or an arc, and hits one thing — none of which the
     state machine helps with, and all of which it would make slower.

     Two kinds left: the bottle you throw and the sparks off a light
     going out. There was a third, a tin thrown at your head by a member
     of staff, and it left with him.
     ------------------------------------------------------------------ */
  spawnMolotov(player) {
    const speed = 30;
    /* Thrown, not fired: it arcs, and the pitch you are looking at
       decides how far. Lobbing one over a gondola into the next aisle is
       a shot the player has to learn, and it is worth learning. */
    const up = 7 + Math.sin(-player.pitch) * 14;
    this.projectiles.push({
      kind: 'MOLO', x: player.x, y: player.y, z: player.viewZ - 6,
      vx: Math.cos(player.angle) * speed, vy: Math.sin(player.angle) * speed, vz: up,
      gravity: -1.1, owner: player, life: 200, sprite: 'MOLO', mesh: null, damage: 0,
    });
  }

  ticProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.vz += p.gravity;
      if (p.kind === 'SPARK') p.frame = p.life > 11 ? 'A' : p.life > 5 ? 'B' : 'C';
      const nx = p.x + p.vx, ny = p.y + p.vy, nz = p.z + p.vz;

      let hit = null;
      const wall = this.level.rayHitWall(p.x, p.y, p.z, nx, ny, nz);
      if (wall) hit = { x: wall.x, y: wall.y, z: wall.z, actor: null };

      if (!hit) {
        const targets = p.owner === this.player ? this.actors : [this.player, ...this.actors];
        for (const a of targets) {
          if (!a || a === p.owner || a.removed || a.dead || !a.shootable) continue;
          const rr = a.radius + 10;
          if (dist2(nx, ny, a.x, a.y) > rr * rr) continue;
          if (nz < a.z - 8 || nz > a.z + a.height + 8) continue;
          hit = { x: nx, y: ny, z: nz, actor: a };
          break;
        }
      }

      const sec = this.level.sectorAt(nx, ny);
      if (!hit && sec && nz <= sec.floor + 4) hit = { x: nx, y: ny, z: sec.floor, actor: null };

      if (hit || --p.life <= 0) {
        this.projectileHit(p, hit || { x: p.x, y: p.y, z: p.z, actor: null });
        if (p.mesh) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
        this.projectiles.splice(i, 1);
        continue;
      }
      p.x = nx; p.y = ny; p.z = nz;
    }
  }

  projectileHit(p, at) {
    if (p.kind === 'SPARK') return;          // it just goes out
    if (p.kind === 'MOLO') {
      this.sound?.play('glass', at);
      this.sound?.play('ignite', at);
      /* A big, hot, generous splash — enough accelerant to light a
         walkway that has no fuel of its own, which is exactly what it is
         for. */
      this.fire.ignite(at.x, at.y, 190, 68);
      for (const a of this.actorsInConeAround(at, 90)) { a.damage(12, p.owner, { fire: true }); a.ignite?.(340); }
      return;
    }
    if (at.actor) { at.actor.damage(p.damage, p.owner); this.spawnPuff(at.x, at.y, at.z); }
    else this.spawnPuff(at.x, at.y, at.z);
  }

  actorsInConeAround(at, radius) {
    const out = [];
    const r2 = radius * radius;
    for (const a of this.actors)
      if (!a.removed && !a.dead && a.shootable && dist2(at.x, at.y, a.x, a.y) < r2) out.push(a);
    if (this.player && !this.player.dead && dist2(at.x, at.y, this.player.x, this.player.y) < r2) out.push(this.player);
    return out;
  }

  /** A fuel can or a car going up. `a` only has to have a position:
   *  a vehicle is not an actor, and the second bang happens where one
   *  landed rather than where anything is standing.
   *
   *  This is also the whole of the chain reaction in the car park. The
   *  blast igniting everything it reaches means the bay either side
   *  catches, cooks for its own few seconds and goes up in turn — which
   *  is not a feature anybody wrote, it is what happens when cars are
   *  flammable and explosions light things. */
  explode(a, opts = {}) {
    const { radius = 150, damage = 60, heat = 230, heatRadius = 86, ignite = 320 } = opts;
    this.sound?.play('explode', a);
    this.fire.ignite(a.x, a.y, heat, heatRadius);
    for (const o of this.actorsInConeAround(a, radius)) {
      if (o === a) continue;
      const d = dist(a.x, a.y, o.x, o.y);
      o.damage(Math.round(damage * (1 - d / radius)), null, { fire: true });
      o.ignite?.(ignite);
    }
  }

  /* ------------------------------------------------------------------
     HOW BURNT EVERY PIECE OF FLOOR IS, as a picture

     THIS USED TO BE ONE TEXEL PER SECTOR and that was the bug the user
     reported as z-fighting. A region's progress is a single number, so
     every surface in a sector sooted at once, and this map's sectors are
     big axis-aligned rectangles: a burnt aisle met a clean cross-aisle
     along a dead-straight line with a different texture and a different
     light level on either side of it. A knife edge across the floor,
     exactly vertical or exactly horizontal on screen, which reads as two
     surfaces fighting rather than as a fire.

     So the picture is the FIRE'S OWN GRID instead — 32-unit cells, the
     same ones the fire actually spreads through — sampled by world
     position with a linear filter, so the soot front creeps across the
     floor at the resolution the fire has and crosses a sector boundary
     without knowing it is there. A wall reads the cells it stands in and
     a ceiling the cells under it, which is also more nearly true than
     "the sector this surface was filed under".

     One byte a cell, in a square texture big enough to hold the grid.
     225 by 207 at the moment, so 256 square: 64K, uploaded only on the
     tics where a byte actually changed.
     ------------------------------------------------------------------ */
  _initBurnGrid() {
    const f = this.fire;
    if (!f) return;
    let side = 1;
    while (side < f.cols || side < f.rows) side *= 2;
    this._burnData = new Uint8Array(side * side * 4);
    const tex = new THREE.DataTexture(this._burnData, side, side);
    /* LINEAR, which is the whole point: the fire's cells are 32 units
       across and the eye is two metres from the floor, so a nearest
       filter would trade one straight seam for a grid of little ones. */
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    world.burnGrid.value = tex;
    world.burnOrigin.value.set(f.originX, f.originY);
    world.burnCell.value = f.CELL;
    world.burnSide.value = side;
    world.burnCols.value = f.cols;
    world.burnRows.value = f.rows;
    this._burnTex = tex;
    this._burnSide = side;
  }

  /** Push the fire's per-cell progress into it. Only uploads when a byte
   *  actually changed, which for a shop that is not on fire is never. */
  ticBurnGrid() {
    const f = this.fire;
    if (!f || !this._burnData) return;
    const d = this._burnData, side = this._burnSide;
    const fuel = f.fuel, fuel0 = f.fuel0, cols = f.cols, rows = f.rows;
    let dirty = false;
    for (let y = 0; y < rows; y++) {
      const row = y * cols, out = y * side;
      for (let x = 0; x < cols; x++) {
        const t = fuel0[row + x];
        if (t <= 0) continue;                    // never had anything to burn
        const v = 255 - Math.min(255, Math.round(255 * fuel[row + x] / t));
        const o = (out + x) * 4;
        if (d[o] === v) continue;
        d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
        dirty = true;
      }
    }
    if (dirty) this._burnTex.needsUpdate = true;
  }

  /** Clear a room. Anything that can be frightened and is within
   *  `radius` of (x, y) starts running away from it — used by whatever
   *  is loud and sudden enough to be worth running from, which at the
   *  moment is somebody going off. */
  scare(x, y, radius) {
    const r2 = radius * radius;
    let n = 0;
    /* Off the blockmap, not off the cast list. This is called once per
       person who comes apart, and in a crowd of eight hundred a dozen of
       them can come apart in the same second — a scan each would be the
       crowd squared at exactly the moment the frame is busiest. */
    for (const a of this.blockmap.nearRadius(x, y, radius, this._scared)) {
      if (a.dead || a.removed || !a.info.panicTics) continue;
      if (dist2(x, y, a.x, a.y) > r2) continue;
      ACTIONS.A_Scare(a, x, y);
      n++;
    }
    return n;
  }

  /** Doom's P_NoiseAlert, with a radius instead of a flood fill. Firing
   *  a weapon is how you wake the store up, and the flamethrower is
   *  louder than the boxcutter for the obvious reason. */
  noise(from, radius) {
    const r2 = radius * radius;
    for (const a of this.actors) {
      if (!a.monster || a.dead || a.target) continue;
      if (dist2(from.x, from.y, a.x, a.y) > r2) continue;
      a.target = this.player;
      this.sound?.play(a.info.seeSound, a);
      if (a.info.see) a.setState(a.info.see);
    }
  }

  /* ------------------------------------------------------------------
     Doors
     ------------------------------------------------------------------ */
  tryUse(player) {
    const reach = 80;
    const tx = player.x + Math.cos(player.angle) * reach;
    const ty = player.y + Math.sin(player.angle) * reach;
    const hit = this.level.rayHitWall(player.x, player.y, player.viewZ, tx, ty, player.viewZ);
    if (hit && this.activateLine(hit.line, player)) return true;
    /* nothing square on: try anything special nearby, so you do not
       have to line up on a doorway to open it */
    const near = this.level.linesInBox(player.x - reach, player.y - reach, player.x + reach, player.y + reach, []);
    for (const l of near) if (this.activateLine(l, player)) return true;
    this.message('NOTHING TO USE');
    return false;
  }

  activateLine(line, activator) {
    for (const si of [line.front, line.back]) {
      if (si === null) continue;
      const s = this.level.sectors[si];
      if (!s.special || s.special.kind !== 'door') continue;
      return this.openDoor(s);
    }
    return false;
  }

  openDoor(s) {
    let d = this.doors.find(x => x.sector === s);
    if (d) {
      /* used again while moving: reverse it, the way Doom's do */
      if (d.state === 'opening') { d.state = 'closing'; return true; }
      if (d.state === 'open') { d.timer = 0; return true; }
      if (d.state === 'closing') { d.state = 'opening'; return true; }
      return true;
    }
    d = { sector: s, state: 'opening', timer: 0, speed: s.special.speed ?? 4,
          openTo: s.special.openTo ?? 152, closedAt: s.floor };
    this.doors.push(d);
    this.sound?.play('dooropen', { x: s.bbox[0], y: s.bbox[1] });
    return true;
  }

  ticDoors() {
    if (!this.doors.length) return;
    let changed = false;
    for (let i = this.doors.length - 1; i >= 0; i--) {
      const d = this.doors[i];
      const s = d.sector;
      if (d.state === 'opening') {
        s.ceil = Math.min(d.openTo, s.ceil + d.speed);
        changed = true;
        if (s.ceil >= d.openTo) { d.state = 'open'; d.timer = s.special.wait ?? 140; }
      } else if (d.state === 'open') {
        if (d.timer > 0 && --d.timer === 0) {
          /* do not close it on somebody's head */
          if (this.somethingUnder(s)) d.timer = 35;
          else { d.state = 'closing'; this.sound?.play('doorclose', { x: s.bbox[0], y: s.bbox[1] }); }
        }
      } else {
        if (this.somethingUnder(s)) { d.state = 'opening'; continue; }
        s.ceil = Math.max(d.closedAt, s.ceil - d.speed);
        changed = true;
        if (s.ceil <= d.closedAt) { this.doors.splice(i, 1); }
      }
    }
    if (changed) this.geo.rebuild();
  }

  somethingUnder(s) {
    const [x0, y0, x1, y1] = s.bbox;
    const inside = (o) => o && !o.removed && !o.dead && o.x > x0 - 16 && o.x < x1 + 16 && o.y > y0 - 16 && o.y < y1 + 16;
    if (inside(this.player)) return true;
    for (const a of this.actors) if (a.solid && inside(a)) return true;
    return false;
  }

  /* ------------------------------------------------------------------
     Drawing
     ------------------------------------------------------------------ */
  render(now = 0) {
    const p = this.player;
    let yaw = p.angle, pitch = p.pitch, ex = p.x, ey = p.y, ez = p.viewZ;
    if (this.idle) {
      /* THE TITLE. Nothing moves — the world is not being stepped — but
         the eye does, a little, the way a person standing still is never
         quite still. Sines at rates that never line up, so it does not
         repeat, and small enough that it reads as breathing rather than
         as a camera move. */
      const t = now * 0.001;
      yaw   += 0.030 * Math.sin(t * 0.23) + 0.016 * Math.sin(t * 0.61 + 1.3) + 0.007 * Math.sin(t * 1.37 + 0.4);
      pitch += 0.014 * Math.sin(t * 0.31 + 2.1) + 0.006 * Math.sin(t * 0.83 + 0.7);
      ex += 3.0 * Math.sin(t * 0.19 + 0.5); ey += 2.4 * Math.cos(t * 0.27);
      ez += 1.4 * Math.sin(t * 0.47 + 1.1);
    }
    this.camera.position.set(ex, ez, -ey);
    if (this.sky) followSky(this.sky, this.camera);
    this.camera.rotation.set(pitch, yaw - Math.PI / 2, 0, 'YXZ');
    this.camera.updateMatrixWorld(true);

    /* Every billboard in the scene is spun to the same yaw — they face
       the camera PLANE, not the camera point, which is what stops
       sprites near the edge of the screen turning to look at you. */
    const billboardRot = p.angle - Math.PI / 2;

    /* ONE CLOCK for everything still glowing after the flame has gone:
       the trees' burn shader and every charred surface in the store read
       this, so the coals in an aisle and the coals on a fir are in the
       same fire. */
    world.emberTime.value = this.tics / TICRATE + now * 0.0002;

    /* which way the eye is pointing, so a standee can decide for itself
       whether it is worth drawing — see the culling note on
       Actor.render, and why three.js is not allowed to do it */
    const vx = Math.cos(p.angle), vy = Math.sin(p.angle);
    /* AND HOW MUCH OF THE CROWD TO DRAW. Off the actor's own id rather
       than off a counter, so the same people are the ones left out from
       frame to frame — a crowd that reshuffles which half of it exists
       is worse than half a crowd. */
    const crowd = this.quality.crowd;
    for (const a of this.actors) {
      if (crowd < 1 && a.type === 'SHOPPER' && (a.id % 16) >= crowd * 16) {
        if (a.mesh) a.mesh.visible = false;
        continue;
      }
      a.render(p.x, p.y, billboardRot, vx, vy);
    }
    this.fire.render(p.x, p.y, billboardRot);
    this.forest.render(p.x, p.y, ez, billboardRot, world.emberTime.value, this.quality.wood);
    this.flame.render(billboardRot);
    this.fx.render(billboardRot);
    this.giblets.render(billboardRot);
    this.renderProjectiles(billboardRot);

    /* the red mist of being nearly dead */
    const hurt = clamp(1 - p.health / 100, 0, 1);
    world.tint.value.setRGB(1, 1 - hurt * 0.22, 1 - hurt * 0.3);
  }

  renderProjectiles(billboardRot) {
    for (const p of this.projectiles) {
      if (!p.mesh) {
        const mat = createSpriteMaterial(null, { alphaTest: 0.5, width: 32, height: 32 });
        p.mesh = new THREE.Mesh(this._projGeo, mat);
        p.mesh.frustumCulled = false;
        this.scene.add(p.mesh);
      }
      const e = this.sprites.get(p.sprite, p.frame || 'A');
      const u = p.mesh.material.uniforms;
      u.map.value = this.sprites.texture(e, 0);
      u.spriteScale.value.set(e.w * e.scale, e.h * e.scale);
      u.billboardRot.value = billboardRot;
      u.fullbright.value = (p.kind === 'MOLO' || p.kind === 'SPARK') ? 1 : 0;
      u.light.value = this.level.sectorAt(p.x, p.y)?.light ?? 0.6;
      /* the quad's foot is its origin, so lift it by half its height to
         put the thing itself where the projectile is */
      p.mesh.position.set(p.x, p.z - (e.h * e.scale) / 2, -p.y);
    }
  }
}
