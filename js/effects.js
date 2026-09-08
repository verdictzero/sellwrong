/* =====================================================================
   GROCERY STORE SIMULATOR — embers and smoke
   =====================================================================

   A fire that only glows is a picture of a fire. What sells it is what
   comes OFF it: sparks lifting on the heat and going out, and smoke
   standing up over it and drifting away. Both are cheap if they are
   budgeted, and this is the budget: a few hundred embers and a couple
   of hundred puffs at most, alive at once, in two draw calls.

   WHERE THEY COME FROM. Nothing spawns from every burning cell — with
   an aisle alight that is hundreds of sources and with a forest alight
   it is thousands. Each tic a handful of burning cells NEAR THE PLAYER
   are sampled at random, from the store's grid and from the forest's,
   and those throw the frame's sparks. Far fires are a glow on the
   horizon anyway; a spark two thousand units off is a pixel nobody
   sees, and it would have cost the same as one at your feet.

   EMBERS are cutout quads a couple of units across, bright gold going
   to dark coal, lifted by the heat and then falling, and they die when
   they land. SMOKE is a soft blob, alpha-blended, that grows and fades
   as it climbs; it is lit by the sector light like anything else, so it
   is dark against the night and catches the fire glow from below.
   ===================================================================== */

import { Particles, atlasTexture } from './particles.js';
import { Pix, fbm } from './pixel.js';
import { pRandom, dist2 } from './util.js';
import { EMBER_RAMP } from './forest.js';

/* The wind. The forest fire leans with it too; see forest.js. */
const WIND_X = 0.28;

export class Effects {
  constructor(game, atlases = null) {
    this.game = game;
    this.embers = new Particles({
      max: 640, texture: atlases?.spark || null, frames: 1,
      blend: 'cutout', fullbright: true, name: 'embers', renderOrder: 12, nearShrink: 160,
    });
    this.smoke = new Particles({
      max: 240, texture: atlases?.smoke || null, frames: 4,
      blend: 'alpha', fullbright: false, light: 0.55, name: 'smoke', renderOrder: 14, nearShrink: 90,
    });
    this._samples = [];
  }

  attach(scene) { this.embers.attach(scene); this.smoke.attach(scene); }

  /* ------------------------------------------------------------------
     Spawning
     ------------------------------------------------------------------ */
  ember(x, y, z, n = 1, heat = 1) {
    for (let k = 0; k < n; k++) {
      const a = (pRandom() / 255) * Math.PI * 2;
      const sp = 0.3 + (pRandom() / 255) * 1.4;
      const hot = EMBER_RAMP[7], cool = EMBER_RAMP[2 + (pRandom() & 1)];
      this.embers.spawn({
        x: x + (pRandom() / 255 - 0.5) * 18, y: y + (pRandom() / 255 - 0.5) * 18, z,
        vx: Math.cos(a) * sp + WIND_X, vy: Math.sin(a) * sp,
        vz: 1.3 + (pRandom() / 255) * 2.2 * heat,
        life: 40 + (pRandom() % 60),
        size0: 1.5 + (pRandom() / 255) * 1.2, size1: 0.8,
        c0: hot, c1: cool, a0: 1, a1: 1,
        drag: 0.985, gravity: -0.055,
      });
    }
  }

  puff(x, y, z, size = 28, life = 150) {
    const warm = 0.55 + (pRandom() / 255) * 0.3;
    this.smoke.spawn({
      x: x + (pRandom() / 255 - 0.5) * 24, y: y + (pRandom() / 255 - 0.5) * 24, z,
      vx: (pRandom() / 255 - 0.5) * 0.5 + WIND_X * 1.6, vy: (pRandom() / 255 - 0.5) * 0.5,
      vz: 0.9 + (pRandom() / 255) * 0.7,
      life: life + (pRandom() % 60),
      size0: size, size1: size * 4.2,
      c0: [0.34 * warm, 0.30 * warm, 0.28 * warm], c1: [0.16, 0.16, 0.18],
      a0: 0.55, a1: 0,
      frame: pRandom() & 3, frameRate: 0.02,
      drag: 0.992, gravity: 0.004,
    });
  }

  /** Where a flame landed: a spit of sparks and a little smoke. */
  splash(x, y, z) {
    this.ember(x, y, z + 6, 2, 0.8);
    if ((pRandom() & 3) === 0) this.puff(x, y, z + 10, 18, 90);
  }

  /* ------------------------------------------------------------------
     One tic
     ------------------------------------------------------------------ */
  tic() {
    const g = this.game, p = g.player;
    if (p) {
      /* the store's fire */
      const F = g.fire;
      if (F && F.active.length) {
        const len = F.active.length;
        for (let k = 0; k < 3; k++) {
          const i = F.active[(pRandom() * 256 + pRandom()) % len];
          const h = F.heat[i];
          if (h < 110) continue;
          const x = F.worldX(i % F.cols), y = F.worldY((i / F.cols) | 0);
          if (dist2(x, y, p.x, p.y) > 900 * 900) continue;
          const z = (g.level.sectors[F.sectorOf[i]]?.floor ?? 0);
          if (pRandom() < h * 0.55) this.ember(x, y, z + 14 + (pRandom() & 31), 1, h / 255);
          if ((g.tics & 3) === 0 && pRandom() < 90) this.puff(x, y, z + 30, 26, 140);
        }
      }
      /* the forest's */
      const forest = g.forest;
      if (forest && forest.active.length) {
        const out = this._samples;
        forest.emitters(p.x, p.y, 1200, 4, out);
        for (const e of out) {
          const q = (e.t - 0.5) / 0.3;
          const flame = Math.exp(-q * q);
          if (pRandom() < 40 + flame * 150) this.ember(e.x, e.y, e.h * (0.35 + (pRandom() / 255) * 0.6), e.tree ? 2 : 1, 0.6 + flame);
          if ((g.tics & 3) === 1 && pRandom() < 60 + flame * 120) this.puff(e.x, e.y, e.h * 0.9, e.tree ? 34 : 20, 170);
        }
      }
    }

    const lv = g.level;
    this.embers.tic((i, nx, ny, nz) => {
      /* embers go out on the floor and on walls */
      const s = lv.sectorAt(nx, ny);
      const floor = s ? s.floor : 0;
      return nz <= floor + 1;
    });
    this.smoke.tic();
  }

  render(billboardRot) {
    this.embers.render(billboardRot);
    this.smoke.render(billboardRot);
  }

  get liveCount() { return this.embers.count + this.smoke.count; }
}

/* --------------------------------------------------------------------
   The pictures: a spark and four puffs of smoke, generated like all the
   other art
   ------------------------------------------------------------------ */
export function bakeEffectAtlases() {
  const spark = new Pix(4, 4, 3, false);
  spark.fill('bone', 1.0);
  const puffs = [];
  for (let f = 0; f < 4; f++) {
    const p = new Pix(32, 32, 40 + f, false);
    const n = fbm(32, 32, 4, 3, 70 + f * 13);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const dx = (x - 15.5) / 15.5, dy = (y - 15.5) / 15.5;
        const d = Math.hypot(dx, dy);
        const edge = Math.max(0, 1 - d);
        const a = Math.max(0, Math.min(1, edge * 1.8 * (0.45 + n[y * 32 + x] * 0.8) - 0.15));
        if (a <= 0.05) continue;
        p.set(x, y, 235, 232, 230, Math.round(a * 255));
      }
    puffs.push(p);
  }
  /* The stream's particle: a ball of fire, white at the heart through
     the ember colours to a soft dark-red rim, eight of them so a stream
     is not one blob repeated. Drawn additively, so where they overlap
     they add up to white — which is what makes a dense arc of them read
     as one continuous flame rather than as beads on a string. */
  const balls = [];
  for (let f = 0; f < 8; f++) {
    const p = new Pix(32, 32, 90 + f, false);
    const n = fbm(32, 32, 4, 3, 300 + f * 17);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const dx = (x - 15.5) / 15.5, dy = (y - 15.5) / 15.5;
        const d = Math.hypot(dx, dy);
        const v = Math.max(0, Math.min(1, (1 - d) * (0.6 + n[y * 32 + x] * 0.8)));
        if (v < 0.06) continue;
        const a = Math.min(1, v / 0.35);
        p.ink(x, y, 'fire', Math.min(1, v * 1.15), Math.round(a * 255));
      }
    balls.push(p);
  }
  return { spark: atlasTexture([spark]), smoke: atlasTexture(puffs), fireball: atlasTexture(balls) };
}
