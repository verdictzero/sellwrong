/* =====================================================================
   GROCERY STORE SIMULATOR — the forest, and it burns
   =====================================================================

   The parade stands in the middle of a wood that runs for miles: a
   flat plain of firs and undergrowth, thousands of them, with the car
   park cut out of the middle. It exists to be set on fire. A
   supermarket burning down is a night's work; a forest burning down is
   weather, and watching a front you started walk off toward the
   horizon on its own is the other half of the game.

   TWO THINGS, KEPT APART. The SIMULATION is a grid of 64-unit cells
   with a byte of state each — green, alight, gone — and a list of the
   ones currently burning. It is pure typed arrays and can run for an
   hour in Node with no renderer, which is how the smoke test checks
   that a spark actually takes the wood and roughly how long it takes.
   The DRAWING is instanced billboards: every plant in the forest is one
   entry in a buffer, and each kind of plant is one draw call, so fifty
   thousand trees cost about what ten do. `build()` is the only place
   the two meet.

   THE ART IS FROM THE GOLF PROJECT, and so is the fire. Each sprite
   comes with a BURN MAP baked from its own pixels — where the coals
   sit, how black it ends, WHEN each texel catches, how leafy it is —
   and one number per plant swept across that map takes it from green
   through scorched, alight and charred without a second set of art.
   The shader below is that mechanism ported: a tree is never uniformly
   on fire, it has a burning band climbing it, with green above and
   char below, and the coals it leaves cycle through the ember palette.

   THE GROUND BURNS WITH IT. One texel of the burn grid per cell,
   sampled with filtering under a ground shader that crossfades forest
   floor into charred dirt — so a burnt patch of wood is black to the
   ground and stays that way, which is what makes a fire feel like it
   happened rather than played.

   WHAT SPREADS. Every cell of forest is fuel — the floor is dry needle
   litter — and a cell with a tree in it burns hotter and longer and
   throws fire further. There is a wind, from the west, and the fire
   moves with it about three times as readily as against it. That is
   the whole model, and it percolates: light one tree anywhere and,
   left alone, the whole wood goes, at walking pace downwind and a
   crawl into the wind. The player with a flamethrower is much faster
   than waiting, which is the point of carrying one.
   ===================================================================== */

import * as THREE from 'three';
import { worldUniforms, WORLD_UNIFORMS_GLSL, WORLD_SHADE_GLSL } from './material.js';
import { Particles } from './particles.js';
import { pRandom, pChance, dist2, clamp } from './util.js';
import { fbm } from './pixel.js';

export const CELL = 64;
export const FIRE_INTERVAL = 9;       // the store's clock, so the two fires keep time

/* How each kind of plant is drawn and what it does to a fire.

     h      world units tall (the sprite's foot on the ground)
     aspect the sprite's width over its height
     r      trunk radius you cannot walk through; 0 walks through it
     w      how often it is planted, out of the tree weights
     cover  ground cover, planted separately and more thinly */
export const KINDS = [
  { name: 'fir_tall_1',   h: 300, aspect: 0.5, r: 14, w: 22 },
  { name: 'fir_tall_2',   h: 290, aspect: 0.5, r: 13, w: 22 },
  { name: 'fir_medium',   h: 232, aspect: 0.5, r: 14, w: 16 },
  { name: 'fir_young',    h: 150, aspect: 0.5, r: 9,  w: 14 },
  { name: 'bush_large_1', h: 86,  aspect: 1.0, r: 18, w: 8 },
  { name: 'bush_large_2', h: 82,  aspect: 1.0, r: 18, w: 7 },
  { name: 'bush_small_1', h: 62,  aspect: 1.0, r: 12, w: 6 },
  { name: 'bush_small_2', h: 60,  aspect: 1.0, r: 12, w: 5 },
  { name: 'fern',         h: 46,  aspect: 1.0, r: 0,  w: 0, cover: true },
  { name: 'grass',        h: 40,  aspect: 1.0, r: 0,  w: 0, cover: true },
];
const TREE_KINDS = KINDS.map((k, i) => i).filter(i => !KINDS[i].cover);
const COVER_KINDS = KINDS.map((k, i) => i).filter(i => KINDS[i].cover);
const TREE_WEIGHT = TREE_KINDS.reduce((a, i) => a + KINDS[i].w, 0);

/* The eight ember colours, cold coal to gold — the golf project's
   ps1-soft ramp, and the same eight the ground's glow uses so the two
   fires agree. */
export const EMBER_RAMP = ['#181008', '#302000', '#503000', '#704000', '#985800', '#c07820', '#e89858', '#f8d0a0']
  .map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255));

/* The fire's numbers. Durations are in fire tics (a sixth of a game
   tic, so 72 is about twelve seconds); chances are out of 256 per fire
   tic per neighbour, and are what decide the pace. */
export const BURN = {
  /* SLOW AND SURE, and those are two different dials. The first cut had
     a quarter of the wood gone in eight minutes and read as a fuse; the
     obvious fix — lower the chances — put the floor right on the line
     where a fire keeps itself going, and whether a match took depended
     on which trees happened to stand nearby. So the chances stay HIGH
     (a burning cell lights most of its neighbours before it is done)
     and the burn is LONG, with nothing able to spread until it is a
     third of the way through. A ground cell smoulders for ten seconds,
     a tree for eighteen, and a front walks downwind at a cell every
     eight seconds or so, creeps against the wind, and always takes the
     lot in the end. The headless check holds it to that. */
  treeTics: 110, groundTics: 60,
  window: [0.30, 0.90],          // the part of a burn that can light a neighbour
  treeToTree: 5, treeToGround: 4, groundToTree: 5, groundToGround: 4,
  diagonal: 0.6,
  wind: [1.55, 0.55],            // downwind (+x) and upwind multipliers
};

/* How wide a plant is at a given height, as a fraction of its sprite's
   width. A fir is a trunk for its first tenth, widest a third of the
   way up, and a point at the top; a bush is round. This is what the
   flame tests against, and getting it wrong is a stream that stops dead
   on a trunk-width of empty air beside a tree — which is exactly what
   the first version did, with the canopy's full width treated as solid
   all the way to the ground. */
export function plantRadius(kind, f) {
  if (kind.aspect < 1) {
    if (f < 0.10) return 0.07;
    if (f < 0.30) return 0.07 + (f - 0.10) / 0.20 * 0.43;
    return Math.max(0.03, 0.50 * (1 - (f - 0.30) / 0.70));
  }
  return f < 0.08 || f > 0.96 ? 0.12 : 0.42;
}

/* Per-cell randomness that does not depend on the order cells are
   visited, so the same seed plants the same wood on every machine. */
function hash2(cx, cy, k) {
  let h = (cx * 374761393 + cy * 668265263 + k * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Forest {
  /**
   * @param level  a built Level with forestRects, forestBounds, clearing
   * @param opts   seed; spacing (the clearing kept round the map)
   */
  constructor(level, opts = {}) {
    this.level = level;
    this.seed = opts.seed ?? 5;
    const rects = level.forestRects || [];
    this.rects = rects;
    this.tics = 0;
    this.kindArrays = null;
    this.mesh = null;
    this.flames = null;

    const b = level.forestBounds || [0, 0, 0, 0];
    this.bounds = b;
    this.originX = b[0]; this.originY = b[1];
    this.cols = rects.length ? Math.ceil((b[2] - b[0]) / CELL) : 0;
    this.rows = rects.length ? Math.ceil((b[3] - b[1]) / CELL) : 0;
    const n = Math.max(1, this.cols * this.rows);

    this.fuel = new Uint8Array(n);        // 1 where there is forest floor
    this.tree = new Uint8Array(n);        // 1 where a tree stands (fire lives longer)
    this.state = new Uint8Array(n);       // 0 green, 1 alight, 2 gone
    this.prog = new Uint8Array(n);        // how far through the burn, 0..255
    this.cellTree = new Int32Array(n).fill(-1);
    this.cellCover = new Int32Array(n).fill(-1);
    this.active = [];
    this._activeSet = new Uint8Array(n);
    this._dirty = [];
    this._dirtySet = new Uint8Array(n);
    this.fuelCells = 0;
    this.burnAccum = 0;                   // sum of prog over every cell, for the fraction
    this.hotCells = 0;

    if (rects.length) { this._seed(); this._plant(); }
  }

  /* ------------------------------------------------------------------
     The grid
     ------------------------------------------------------------------ */
  idx(cx, cy) { return cy * this.cols + cx; }
  cellX(x) { return clamp(Math.floor((x - this.originX) / CELL), 0, this.cols - 1); }
  cellY(y) { return clamp(Math.floor((y - this.originY) / CELL), 0, this.rows - 1); }
  worldX(cx) { return this.originX + cx * CELL + CELL / 2; }
  worldY(cy) { return this.originY + cy * CELL + CELL / 2; }

  inRects(x, y) {
    for (const r of this.rects) if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return true;
    return false;
  }

  _seed() {
    for (let cy = 0; cy < this.rows; cy++)
      for (let cx = 0; cx < this.cols; cx++) {
        const i = this.idx(cx, cy);
        if (this.inRects(this.worldX(cx), this.worldY(cy))) { this.fuel[i] = 1; this.fuelCells++; }
      }
  }

  /* Planting. Density comes from a noise field so the wood has
     clearings and thickets rather than being a lattice, and every
     plant is jittered off its cell centre so no two rows line up. A
     margin round the clearing stays open, because a forest hard up
     against a car park kerb is a hedge. */
  _plant() {
    const { cols, rows } = this;
    const field = fbm(cols, rows, 9, 3, this.seed * 31 + 7);
    const c = this.level.clearing || [0, 0, 0, 0];
    const MARGIN = 150;
    const tx = [], ty = [], tk = [], ts = [], tf = [], tseed = [], tcell = [];
    const gx = [], gy = [], gk = [], gs = [], gf = [], gseed = [], gcell = [];
    const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const i = this.idx(cx, cy);
        if (!this.fuel[i]) continue;
        const wx = this.worldX(cx), wy = this.worldY(cy);
        if (wx > c[0] - MARGIN && wx < c[2] + MARGIN && wy > c[1] - MARGIN && wy < c[3] + MARGIN) continue;
        const d = field[i];
        const treeP = smooth(0.34, 0.72, d) * 0.58;
        if (hash2(cx, cy, 1) < treeP) {
          let pick = hash2(cx, cy, 2) * TREE_WEIGHT, kind = TREE_KINDS[0];
          for (const k of TREE_KINDS) { pick -= KINDS[k].w; if (pick <= 0) { kind = k; break; } }
          tx.push(wx + (hash2(cx, cy, 3) - 0.5) * CELL * 0.8);
          ty.push(wy + (hash2(cx, cy, 4) - 0.5) * CELL * 0.8);
          tk.push(kind);
          ts.push(0.86 + hash2(cx, cy, 5) * 0.32);
          tf.push(hash2(cx, cy, 6) < 0.5 ? 1 : 0);
          tseed.push(hash2(cx, cy, 7));
          tcell.push(i);
          this.cellTree[i] = tx.length - 1;
          this.tree[i] = 1;
        }
        if (hash2(cx, cy, 8) < 0.15 * (0.5 + d)) {
          gx.push(wx + (hash2(cx, cy, 9) - 0.5) * CELL * 0.9);
          gy.push(wy + (hash2(cx, cy, 10) - 0.5) * CELL * 0.9);
          gk.push(hash2(cx, cy, 11) < 0.45 ? COVER_KINDS[0] : COVER_KINDS[1]);
          gs.push(0.8 + hash2(cx, cy, 12) * 0.5);
          gf.push(hash2(cx, cy, 13) < 0.5 ? 1 : 0);
          gseed.push(hash2(cx, cy, 14));
          gcell.push(i);
          this.cellCover[i] = gx.length - 1;
        }
      }
    }
    this.trees = { x: Float32Array.from(tx), y: Float32Array.from(ty), kind: Uint8Array.from(tk), scale: Float32Array.from(ts),
                   flip: Uint8Array.from(tf), seed: Float32Array.from(tseed), cell: Int32Array.from(tcell), n: tx.length };
    this.covers = { x: Float32Array.from(gx), y: Float32Array.from(gy), kind: Uint8Array.from(gk), scale: Float32Array.from(gs),
                    flip: Uint8Array.from(gf), seed: Float32Array.from(gseed), cell: Int32Array.from(gcell), n: gx.length };
  }

  /* ------------------------------------------------------------------
     Setting it alight
     ------------------------------------------------------------------ */
  /** Light every green cell within `radius` of a point. Returns how many. */
  ignite(x, y, radius = 40) {
    if (!this.cols) return 0;
    const cx0 = this.cellX(x - radius), cx1 = this.cellX(x + radius);
    const cy0 = this.cellY(y - radius), cy1 = this.cellY(y + radius);
    let lit = 0;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const i = this.idx(cx, cy);
        if (!this.fuel[i] || this.state[i] !== 0) continue;
        this._light(i); lit++;
      }
    return lit;
  }

  _light(i) {
    this.state[i] = 1;
    this.prog[i] = 1;
    if (!this._activeSet[i]) { this._activeSet[i] = 1; this.active.push(i); }
    this._mark(i);
  }

  _mark(i) {
    if (this._dirtySet[i]) return;
    this._dirtySet[i] = 1;
    this._dirty.push(i);
  }

  get burnFraction() { return this.fuelCells ? this.burnAccum / (255 * this.fuelCells) : 0; }
  get burningCells() { return this.hotCells; }
  get treeCount() { return this.trees ? this.trees.n : 0; }
  get plantCount() { return this.treeCount + (this.covers ? this.covers.n : 0); }

  /* ------------------------------------------------------------------
     One step of the fire
     ------------------------------------------------------------------ */
  tic() {
    this.tics++;
    if (!this.cols || this.tics % FIRE_INTERVAL) return;
    const { state, prog, fuel, tree, cols, rows } = this;
    const [w0, w1] = BURN.window;
    const next = [];
    let hot = 0;
    for (let k = 0; k < this.active.length; k++) {
      const i = this.active[k];
      const dur = tree[i] ? BURN.treeTics : BURN.groundTics;
      const step = Math.max(1, Math.round(255 / dur));
      const before = prog[i];
      const after = Math.min(255, before + step);
      prog[i] = after;
      this.burnAccum += after - before;
      this._mark(i);
      const t = after / 255;
      if (after >= 255) { state[i] = 2; this._activeSet[i] = 0; continue; }
      next.push(i);
      if (t < w0 || t > w1) continue;
      hot++;

      /* spread, to the eight neighbours, with the wind */
      const cx = i % cols, cy = (i / cols) | 0;
      const fromTree = tree[i];
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= cols) continue;
          const j = ny * cols + nx;
          if (!fuel[j] || state[j] !== 0) continue;
          let chance = fromTree ? (tree[j] ? BURN.treeToTree : BURN.treeToGround)
                                : (tree[j] ? BURN.groundToTree : BURN.groundToGround);
          if (dx && dy) chance *= BURN.diagonal;
          if (dx > 0) chance *= BURN.wind[0]; else if (dx < 0) chance *= BURN.wind[1];
          if (pChance(Math.round(chance))) this._light(j);
        }
      }
    }
    this.active = next;
    this.hotCells = hot;
  }

  /* ------------------------------------------------------------------
     Questions the rest of the game asks
     ------------------------------------------------------------------ */
  /** Is a circle at (x,y) inside a trunk? Bushes count; ferns do not. */
  blocks(x, y, radius) {
    if (!this.cols || !this.trees) return false;
    const cx = this.cellX(x), cy = this.cellY(y);
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= this.rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        if (nx < 0 || nx >= this.cols) continue;
        const t = this.cellTree[ny * this.cols + nx];
        if (t < 0) continue;
        const kr = KINDS[this.trees.kind[t]].r * this.trees.scale[t];
        if (kr <= 0) continue;
        const rr = kr + radius;
        if (dist2(x, y, this.trees.x[t], this.trees.y[t]) < rr * rr) return true;
      }
    }
    return false;
  }

  /** Does a point in the air touch a plant — the flame's question. */
  hitsTree(x, y, z) {
    if (!this.cols || !this.trees) return false;
    const cx = this.cellX(x), cy = this.cellY(y);
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= this.rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        if (nx < 0 || nx >= this.cols) continue;
        const t = this.cellTree[ny * this.cols + nx];
        if (t < 0) continue;
        const k = KINDS[this.trees.kind[t]], s = this.trees.scale[t];
        const h = k.h * s;
        if (z < 0 || z > h) continue;
        const reach = plantRadius(k, z / h) * k.h * k.aspect * s;
        if (dist2(x, y, this.trees.x[t], this.trees.y[t]) < reach * reach) return true;
      }
    }
    return false;
  }

  /** Keep something inside the wood. */
  clampInside(o, margin = 48) {
    if (!this.cols) return;
    const b = this.bounds;
    o.x = clamp(o.x, b[0] + margin, b[2] - margin);
    o.y = clamp(o.y, b[1] + margin, b[3] - margin);
  }

  /** Add what is burning near a point to a light's centre of mass. */
  glowInto(acc, px, py, range = 900) {
    if (!this.active.length) return;
    const r2 = range * range;
    const step = Math.max(1, this.active.length >> 7);
    for (let k = 0; k < this.active.length; k += step) {
      const i = this.active[k];
      const t = this.prog[i] / 255;
      const q = (t - 0.5) / 0.3;
      const w = Math.exp(-q * q) * (this.tree[i] ? 1.3 : 0.45) * step;
      if (w < 0.01) continue;
      const x = this.worldX(i % this.cols), y = this.worldY((i / this.cols) | 0);
      const d2 = dist2(x, y, px, py);
      if (d2 > r2) continue;
      acc.sx += x * w; acc.sy += y * w; acc.sw += w; acc.n++;
    }
  }

  /** Up to `n` burning cells within range, for things to rise off. Each
   *  entry: x, y, h (how tall what is burning is), t (how far through). */
  emitters(px, py, range, n, out) {
    out.length = 0;
    const len = this.active.length;
    if (!len) return 0;
    const r2 = range * range;
    let k = (pRandom() * 256 + pRandom()) % len;
    const tries = Math.min(len, n * 6);
    for (let m = 0; m < tries && out.length < n; m++) {
      const i = this.active[(k + m * 7919) % len];
      const t = this.prog[i] / 255;
      if (t < 0.1 || t > 0.92) continue;
      const x = this.worldX(i % this.cols), y = this.worldY((i / this.cols) | 0);
      if (dist2(x, y, px, py) > r2) continue;
      const ti = this.cellTree[i];
      const h = ti >= 0 ? KINDS[this.trees.kind[ti]].h * this.trees.scale[ti] : 30;
      out.push({ x: ti >= 0 ? this.trees.x[ti] : x, y: ti >= 0 ? this.trees.y[ti] : y, h, t, tree: ti >= 0 });
    }
    return out.length;
  }

  /* ------------------------------------------------------------------
     Drawing
     ------------------------------------------------------------------ */
  /**
   * @param scene  where the meshes go
   * @param art    { sprites: { name: { albedo, burn } }, ground, groundBurnt }
   *               — decoded images
   */
  build(scene, art) {
    if (this.mesh || !this.cols) return;
    this.mesh = new THREE.Group();
    this.mesh.name = 'forest';
    this.kindArrays = [];
    this.uTime = { value: 0 };
    this.uRot = { value: 0 };
    const ramp = EMBER_RAMP.map(c => new THREE.Vector3(c[0], c[1], c[2]));

    /* the ground */
    this.mask = new THREE.DataTexture(new Uint8Array(this.cols * this.rows), this.cols, this.rows, THREE.RedFormat, THREE.UnsignedByteType);
    this.mask.magFilter = THREE.LinearFilter;
    this.mask.minFilter = THREE.LinearFilter;
    this.mask.wrapS = this.mask.wrapT = THREE.ClampToEdgeWrapping;
    this.mask.generateMipmaps = false;
    this.mask.needsUpdate = true;
    const groundTex = img => {
      const t = new THREE.Texture(img);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestMipmapLinearFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    const pos = [];
    for (const r of this.rects) {
      pos.push(r.x0, 0, -r.y0,  r.x1, 0, -r.y0,  r.x1, 0, -r.y1);
      pos.push(r.x0, 0, -r.y0,  r.x1, 0, -r.y1,  r.x0, 0, -r.y1);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gg.computeBoundingSphere();
    const gm = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: groundTex(art.ground) }, mapBurnt: { value: groundTex(art.groundBurnt) },
        mask: { value: this.mask },
        maskRect: { value: new THREE.Vector4(this.originX, this.originY, 1 / (this.cols * CELL), 1 / (this.rows * CELL)) },
        light: { value: 0.56 }, uTime: this.uTime, ramp: { value: ramp },
        ...worldUniforms(),
      },
      vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, toneMapped: false, fog: false,
    });
    const ground = new THREE.Mesh(gg, gm);
    ground.name = 'forest-ground';
    ground.frustumCulled = false;
    this.mesh.add(ground);

    /* the plants, one draw call per kind */
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0);
    const spriteTex = (img, data) => {
      const t = new THREE.Texture(img);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestMipmapNearestFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    KINDS.forEach((k, ki) => {
      const src = k.cover ? this.covers : this.trees;
      const list = [];
      for (let i = 0; i < src.n; i++) if (src.kind[i] === ki) list.push(i);
      const n = list.length;
      const A = {
        pos: new Float32Array(n * 3), size: new Float32Array(n * 2), flip: new Float32Array(n),
        burn: new Float32Array(n), seed: new Float32Array(n), slot: new Int32Array(src.n).fill(-1), n, cover: !!k.cover,
      };
      list.forEach((i, s) => {
        const sc = src.scale[i], h = k.h * sc, w = h * k.aspect;
        A.pos[s * 3] = src.x[i]; A.pos[s * 3 + 1] = 0; A.pos[s * 3 + 2] = -src.y[i];
        A.size[s * 2] = w; A.size[s * 2 + 1] = h;
        A.flip[s] = src.flip[i]; A.seed[s] = src.seed[i];
        A.burn[s] = this.prog[src.cell[i]] / 255;
        A.slot[i] = s;
      });
      this.kindArrays[ki] = A;
      if (!n || !art.sprites[k.name]) return;
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index;
      g.setAttribute('position', base.getAttribute('position'));
      g.setAttribute('uv', base.getAttribute('uv'));
      g.setAttribute('iPos', new THREE.InstancedBufferAttribute(A.pos, 3));
      g.setAttribute('iSize', new THREE.InstancedBufferAttribute(A.size, 2));
      g.setAttribute('iFlip', new THREE.InstancedBufferAttribute(A.flip, 1));
      A.burnAttr = new THREE.InstancedBufferAttribute(A.burn, 1).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iBurn', A.burnAttr);
      g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(A.seed, 1));
      g.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: spriteTex(art.sprites[k.name].albedo, false) },
          burnMap: { value: spriteTex(art.sprites[k.name].burn, true) },
          billboardRot: this.uRot, uTime: this.uTime, ramp: { value: ramp },
          light: { value: 0.56 },
          ...worldUniforms(),
        },
        vertexShader: PLANT_VERT, fragmentShader: PLANT_FRAG,
        side: THREE.DoubleSide, toneMapped: false, fog: false,
      });
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      m.name = 'forest-' + k.name;
      this.mesh.add(m);
    });
    scene.add(this.mesh);
    this._flush();
  }

  /* Push every changed cell into the mask and the instance buffers. */
  _flush() {
    if (!this._dirty.length) return;
    const built = !!this.mesh;
    const touched = new Set();
    for (const i of this._dirty) {
      this._dirtySet[i] = 0;
      if (!built) continue;
      const v = this.prog[i];
      this.mask.image.data[i] = v;
      const t = this.cellTree[i];
      if (t >= 0) { const A = this.kindArrays[this.trees.kind[t]]; const s = A.slot[t]; if (s >= 0) { A.burn[s] = v / 255; touched.add(A); } }
      const c = this.cellCover[i];
      if (c >= 0) { const A = this.kindArrays[this.covers.kind[c]]; const s = A.slot[c]; if (s >= 0) { A.burn[s] = v / 255; touched.add(A); } }
    }
    this._dirty.length = 0;
    if (!built) return;
    this.mask.needsUpdate = true;
    for (const A of touched) if (A.burnAttr) A.burnAttr.needsUpdate = true;
  }

  render(camX, camY, billboardRot, time) {
    if (!this.mesh) { if (this._dirty.length > 4096) this._flush(); return; }
    this.uRot.value = billboardRot;
    this.uTime.value = time;
    this._flush();
    if (this.flames) { this._placeFlames(camX, camY); this.flames.render(billboardRot); }
  }

  /* ------------------------------------------------------------------
     Actual fire

     The burn map turns a tree black and puts coals on it; this puts
     FLAMES on it. A pool of instanced flame quads (one draw call) is
     re-parked every frame on the hottest burning cells near the eye —
     the same trick the store's fire uses, done as instances. A burning
     fir carries its flame at the height the front has climbed to, so
     the fire is seen going up the tree; the ground burns at the ground.
     ------------------------------------------------------------------ */
  attachFlames(scene, atlas) {
    if (this.flames || !atlas) return;
    this.flames = new Particles({
      max: 200, texture: atlas.texture, frames: atlas.frames,
      blend: 'add', fullbright: true, name: 'wood-flames', renderOrder: 13, nearShrink: 60,
    });
    this.flames.attach(scene);
    this._flameCand = [];
  }

  _placeFlames(camX, camY) {
    const F = this.flames;
    F.killAll();
    const cand = this._flameCand;
    cand.length = 0;
    const R2 = 1700 * 1700;
    /* a sample of a big fire, every cell of a small one */
    const step = Math.max(1, this.active.length >> 9);
    for (let k = 0; k < this.active.length; k += step) {
      const i = this.active[k];
      const t = this.prog[i] / 255;
      if (t < 0.05 || t > 0.93) continue;
      const x = this.worldX(i % this.cols), y = this.worldY((i / this.cols) | 0);
      const d2 = dist2(x, y, camX, camY);
      if (d2 > R2) continue;
      const q = (t - 0.45) / 0.35;
      const heat = Math.exp(-q * q);
      cand.push({ i, x, y, t, heat, key: d2 / (0.3 + heat) });
    }
    cand.sort((a, b) => a.key - b.key);
    const n = Math.min(F.max, cand.length);
    const tics = this.tics;
    for (let s = 0; s < n; s++) {
      const c = cand[s];
      const ti = this.cellTree[c.i];
      let x = c.x, y = c.y, base = 0, w;
      if (ti >= 0) {
        const k = KINDS[this.trees.kind[ti]], th = k.h * this.trees.scale[ti];
        x = this.trees.x[ti]; y = this.trees.y[ti];
        base = th * clamp(c.t * 1.1, 0.02, 0.86);
        w = Math.max(44, th * (k.aspect < 1 ? 0.40 : 0.85)) * (0.6 + c.heat * 0.6);
      } else w = 30 + c.heat * 26;
      /* the quad is centred; the art's round base wants to sit on `base` */
      F.spawn({
        x, y, z: base + w * 0.46, life: 2, size: w,
        c0: [1, 1, 1], a0: 0.5 + c.heat * 0.5,
        frame: ((tics >> 1) + c.i * 7) % F.opts.frames,
      });
    }
  }
}

/* --------------------------------------------------------------------
   The shaders
   ------------------------------------------------------------------ */
const PLANT_VERT = /* glsl */`
attribute vec3  iPos;
attribute vec2  iSize;
attribute float iFlip;
attribute float iBurn;
attribute float iSeed;
uniform float billboardRot;
varying vec2  vUv;
varying float vBurn;
varying float vSeed;
varying float vDepth;
varying vec3  vWorld;

void main() {
  /* Half the plants are mirrored, chosen when they were planted: ten
     sprites over fifty thousand plants is a lot of repeat, and a flip
     doubles the apparent variety for nothing. */
  vUv = vec2(iFlip > 0.5 ? 1.0 - uv.x : uv.x, uv.y);
  vBurn = iBurn;
  vSeed = iSeed;
  vec3 p = vec3(position.x * iSize.x, position.y * iSize.y, 0.0);
  float c = cos(billboardRot), s = sin(billboardRot);
  p = vec3(p.x * c, p.y, -p.x * s) + iPos;
  vWorld = p;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const PLANT_FRAG = /* glsl */`
uniform sampler2D map;
uniform sampler2D burnMap;
uniform float light;
uniform float uTime;
uniform vec3  ramp[8];
${WORLD_UNIFORMS_GLSL}
varying vec2  vUv;
varying float vBurn;
varying float vSeed;
varying float vDepth;
varying vec3  vWorld;
${WORLD_SHADE_GLSL}

void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  vec3 col = t.rgb;
  float ember = 0.0;
  vec3 hue = vec3(1.0);

  /* THE BURN, skipped entirely on a plant the fire has not reached —
     which is every plant in the wood until something turns it on. */
  if (vBurn > 0.0) {
    /* R coals, G char, B order (when this texel catches), A foliage */
    vec4 bm = texture2D(burnMap, vUv);

    /* Sweep the order field. The remap pushes both ends out by soft,
       so burn = 1 drives even the last texel past the top of its band
       and burn = 0 leaves the first below the bottom of its own. The
       seed staggers neighbours so two plants in one cell are never in
       step. */
    float soft = 0.22;
    float a = vBurn * (1.0 + 2.0 * soft) - soft + (vSeed - 0.5) * 0.10;
    float tt = smoothstep(bm.b - soft, bm.b + soft, a);

    /* The art's own luminance carried through the char, so a burnt tree
       is still a tree with a light side rather than a flat black shape. */
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));

    /* Dry and brown, then black, then a little ash on what is left. The
       three overlap: a crown is scorching while the lower branches char. */
    col = mix(col, col * 0.55 + vec3(0.30, 0.16, 0.06), smoothstep(0.0, 0.55, tt) * 0.85);
    /* Char that is charcoal, not a hole in the night: it keeps a fair
       share of the art's own light and the ash on it goes properly pale,
       so a burnt stand reads as burnt trees rather than as nothing. */
    col = mix(col, vec3(0.15, 0.13, 0.11) * (0.7 + 2.2 * lum), smoothstep(0.30, 0.95, tt) * bm.g);
    col = mix(col, vec3(0.46, 0.44, 0.40) * (0.60 + 2.0 * lum), smoothstep(0.85, 1.0, tt) * (1.0 - bm.g) * 0.75);

    /* Two sines beaten against each other so neighbouring coals on one
       plant are out of step; the seed keeps two plants apart. */
    float flick = 0.80 + 0.30
      * sin(uTime * 9.0 + vSeed * 31.4 + vUv.y * 17.0)
      * sin(uTime * 3.7 + vSeed * 12.0 + vUv.x * 23.0);
    /* The flame is a narrow band travelling with the front; the coals are
       what it leaves behind, and they cool. */
    float q = (tt - 0.5) / 0.16;
    float flame = exp(-q * q);
    float coal = bm.r * smoothstep(0.30, 0.62, tt) * (1.0 - 0.8 * smoothstep(0.70, 1.0, tt));
    ember = (flame * (0.22 + 0.78 * bm.r) + coal) * flick * 1.5;

    /* The palette cycle: where a texel sits in the eight ember colours is
       its heat plus a wave that climbs the plant, quantised to whole
       steps so it flips between real colours instead of sliding. */
    float heat = clamp(flame * 0.62 + coal * 0.45, 0.0, 1.0);
    float ph = uTime * 0.9 - bm.b * 2.0 + vSeed * 3.7 + bm.r * 1.3;
    float wave = abs(fract(ph) * 2.0 - 1.0) - 0.5;
    float swing = 0.18 * (0.35 + 0.65 * flame);
    float idx = clamp(heat + wave * 2.0 * swing, 0.0, 1.0);
    hue = ramp[int(floor(idx * 7.0 + 0.5))];
  }

  float l = worldBand(light, vDepth, 1.0, 0.0);
  vec3 c = worldShade(col, l, vDepth, vWorld, 0.0);
  /* embers go on after the smoke, so a burning ridge glows through it */
  c += hue * ember;
  gl_FragColor = vec4(c, 1.0);
}
`;

const GROUND_VERT = /* glsl */`
varying vec3  vWorld;
varying float vDepth;
void main() {
  vWorld = position;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const GROUND_FRAG = /* glsl */`
uniform sampler2D map;
uniform sampler2D mapBurnt;
uniform sampler2D mask;
uniform vec4  maskRect;       // origin x, origin y, 1/width, 1/height (map space)
uniform float light;
uniform float uTime;
uniform vec3  ramp[8];
${WORLD_UNIFORMS_GLSL}
varying vec3  vWorld;
varying float vDepth;
${WORLD_SHADE_GLSL}

void main() {
  vec2 mp = vec2(vWorld.x, -vWorld.z);            // back to map space
  vec2 uv = mp / 128.0;                            // one texel to a unit
  vec3 g = texture2D(map, uv).rgb;
  vec3 b = texture2D(mapBurnt, uv * 1.37).rgb;
  float burn = texture2D(mask, (mp - maskRect.xy) * maskRect.zw).r;

  /* The char boundary is ragged by the floor's own texture, so the edge
     of a burn follows the litter rather than the grid. */
  float lum = dot(g, vec3(0.333));
  float k = smoothstep(0.06, 0.55, burn + (lum - 0.5) * 0.3);
  /* the char tile is painted for a crater at noon; lifted, and never
     the whole way, so burnt ground is dark ground and not black */
  vec3 col = mix(g, min(vec3(1.0), b * 1.9 + 0.06), k * 0.85);

  float l = worldBand(light, vDepth, 1.0, 0.0);
  vec3 c = worldShade(col, l, vDepth, vWorld, 0.0);

  /* Fresh char glows: a band in the middle of the burn, gone when cold. */
  float q = (burn - 0.5) / 0.26;
  float glow = exp(-q * q) * (0.75 + 0.25 * sin(uTime * 7.0 + mp.x * 0.09 + mp.y * 0.07));
  glow *= step(0.02, burn) * (1.0 - smoothstep(0.88, 1.0, burn));
  glow *= 0.35 + 0.65 * smoothstep(0.25, 0.7, lum);   // through the litter, not over it
  c += ramp[int(floor(clamp(glow, 0.0, 1.0) * 6.0 + 0.5))] * glow * 0.85;
  gl_FragColor = vec4(c, 1.0);
}
`;
