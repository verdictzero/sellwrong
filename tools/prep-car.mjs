/* =====================================================================
   Turn a four-view vehicle sheet into a model and the paint for it
   =====================================================================

     node tools/prep-car.mjs [art/riotvan.png]

   What arrives is one picture: a vehicle drawn four times on a green
   field — front, rear, side and plan, laid out in reading order. What
   leaves is a texture atlas (assets/cars/) and a set of numbers
   (js/car-data.js) that js/car.js turns into boxes. (art/riotvan.png is
   the sheet as it was handed over, decoded out of its JPEG once and
   otherwise untouched, because the rest of this repository's tooling
   reads PNG and nothing else.)

   THE WHOLE IDEA IS THAT THOSE FOUR PICTURES ARE MEASUREMENTS AS WELL AS
   PAINT. An orthographic view is a parallel projection, so

     the side view's silhouette box is the vehicle's LENGTH and HEIGHT
     the front view's is its WIDTH and HEIGHT
     the plan view's is its LENGTH and WIDTH

   Every pair shares an axis with two others, which means the sheet is
   over-determined: three views claim a width, and if they agree the
   scale is honest. They do — to about one percent — and the tool prints
   the residual and throws if a future sheet cannot manage it. No
   dimension here is a number somebody typed in after looking at the
   picture.

   And because the views ARE projections, painting them back on along the
   same axes puts every pixel where it came from. That is all "projection
   mapping" means here: the side view goes on the sides, the front view
   on anything facing forward, the plan on the roof, and the geometry
   underneath only has to be roughly the right shape for it to land.

   MEASURING A SILHOUETTE WITH RUBBISH IN IT. The sheet is a render, and
   renders come with specks: a stray three-pixel line off the tail, a
   thin grid of stray rows over the plan view. Taken literally they made
   the side view eleven pixels longer than it is, and eleven pixels is
   five percent, and five percent is the difference between the three
   views agreeing and not. So each view is measured after a 5x5
   MORPHOLOGICAL OPENING — erode, then dilate — which deletes anything
   thinner than five pixels and leaves a boxy vehicle untouched, and then
   from the largest connected blob of what survives. The opening is a
   RULER, not an edit: the pixels that get packed are the original ones.

   THE WINDOWS ARE HOLES IN THE KEY, which is a fact about this sheet
   worth stating because it decides how the cut-out works. Whoever
   rendered it let the glass go through to the green, so a naive "green
   is background" cuts the windscreen out of the vehicle. The rule that
   works is topological rather than chromatic:

     key you can reach from outside the vehicle is BACKGROUND
     key you cannot reach is GLASS

   A flood fill from the border separates them in one pass. Background
   gets the nearest body colour bled into it, so a face that overhangs
   the silhouette by a pixel picks up paint rather than chroma key.
   Glass gets the same bled colour, darkened — which is what glass in a
   dark blue armoured van looks like, and it gets the vision slits in the
   windscreen right for free. (The flood runs against the OPENED blob,
   not the raw pixels: those stray lines over the plan view enclose
   little strips of green between them, and against the raw pixels every
   one of them would have come out as a window.)

   THE SHAPE COMES OUT OF THE SIDE VIEW'S OWN OUTLINE. Its top edge,
   simplified into a handful of steps, becomes a stack of LAYERS — one
   box per step in the roof line, each spanning the height between the
   step under it and its own — and its bottom edge dips exactly twice,
   which is the wheels. Each layer is then as wide as the FRONT view is
   over the band of height that layer occupies, which is what makes the
   light bar a bar and the body a body without either being named here.
   ===================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { readPNG, writePNG } from './png-read.mjs';

const [, , inFile = 'art/riotvan.png'] = process.argv;
const NAME = path.basename(inFile, '.png');
const OUT_PNG = `assets/cars/${NAME}.png`;
const OUT_JS = 'js/car-data.js';

/* How much greener than red and blue a pixel has to be to be the key.
   Generous, because the sheet arrived as a JPEG and every edge in it is
   fringed. */
const KEY = 28;
const OPEN = 2;          // radius of the measuring opening: kills anything under 5px
const GLASS = 0.42;      // how much of the bled body colour glass keeps
const PAD = 1;           // gutter around each view in the atlas
const ATLAS_W = 256;
const STEP_TOL = 0.022;  // a step in the roof line worth having, as a fraction of length
const STEP_MAX = 7;      // and at most this many of them
const WHEEL_TOL = 0.018; // how far below the sill counts as a wheel
const AGREE_MAX = 0.08;  // the three views' widths may differ by this much before we give up
const ROOF_SPAN = 0.75;  // a row of a head-on view this wide is at or below the roof
const ROOF_RUN = 0.45;   // and a row of the side view with a run this long is the roof

/* ---- the sheet ----------------------------------------------------- */
const sheet = readPNG(inFile);
const { w: SW, h: SH, data: SD } = sheet;
const isKey = (x, y) => {
  const i = (y * SW + x) * 4;
  return SD[i + 1] > SD[i] + KEY && SD[i + 1] > SD[i + 2] + KEY;
};

/* ---- the four cells, found by the gutters between them -------------
   A row or column that is key all the way across is a gutter and not
   part of any view, so the runs between them are the cells. Two runs
   each way or this is not the sheet this tool understands. */
function runs(n, isEmpty) {
  const out = [];
  let s = -1;
  for (let i = 0; i < n; i++) {
    const e = isEmpty(i);
    if (!e && s < 0) s = i;
    if (e && s >= 0) { out.push([s, i - 1]); s = -1; }
  }
  if (s >= 0) out.push([s, n - 1]);
  return out;
}
const colRuns = runs(SW, x => { for (let y = 0; y < SH; y++) if (!isKey(x, y)) return false; return true; });
const rowRuns = runs(SH, y => { for (let x = 0; x < SW; x++) if (!isKey(x, y)) return false; return true; });
if (colRuns.length !== 2 || rowRuns.length !== 2)
  throw new Error(`expected a two-by-two sheet, found ${colRuns.length} columns and ${rowRuns.length} rows of views`);

/* Reading order, which is the order the sheet is drawn in. Asserted
   below against the shapes, because a sheet laid out some other way has
   to fail loudly rather than come out inside out. */
const CELLS = {
  front: [colRuns[0][0], colRuns[0][1], rowRuns[0][0], rowRuns[0][1]],
  rear:  [colRuns[1][0], colRuns[1][1], rowRuns[0][0], rowRuns[0][1]],
  side:  [colRuns[0][0], colRuns[0][1], rowRuns[1][0], rowRuns[1][1]],
  top:   [colRuns[1][0], colRuns[1][1], rowRuns[1][0], rowRuns[1][1]],
};

/* ---- one view ------------------------------------------------------
   `box` is where the vehicle is; `solid` is its outline with the windows
   filled in; `glass` is which of those filled pixels were window. */
function view([x0, x1, y0, y1]) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1, n = w * h;
  const paint = new Uint8Array(n);              // key(0) / not key(1), as drawn
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) paint[y * w + x] = isKey(x0 + x, y0 + y) ? 0 : 1;

  /* the ruler: open, then the largest blob of what is left */
  const morph = (src, dilate) => {
    const d = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let dy = -OPEN; dy <= OPEN; dy++) for (let dx = -OPEN; dx <= OPEN; dx++) {
        const nx = x + dx, ny = y + dy;
        const s = (nx < 0 || ny < 0 || nx >= w || ny >= h) ? 0 : src[ny * w + nx];
        v = dilate ? (v | s) : (v & s);
      }
      d[y * w + x] = v;
    }
    return d;
  };
  const opened = morph(morph(paint, false), true);
  const lab = new Int32Array(n).fill(-1);
  let best = -1, bestN = 0, next = 0;
  for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
    if (lab[sy * w + sx] >= 0 || !opened[sy * w + sx]) continue;
    const id = next++; let cnt = 0; const st = [sx, sy]; lab[sy * w + sx] = id;
    while (st.length) {
      const y = st.pop(), x = st.pop(); cnt++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (lab[j] >= 0 || !opened[j]) continue;
        lab[j] = id; st.push(nx, ny);
      }
    }
    if (cnt > bestN) { bestN = cnt; best = id; }
  }
  const blob = new Uint8Array(n);
  let a = 1e9, b = -1, c = 1e9, d = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lab[y * w + x] === best) {
    blob[y * w + x] = 1;
    if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y;
  }

  /* what is not the blob and cannot be reached from the border is
     enclosed BY the blob: a window, or the inside of one */
  const outside = new Uint8Array(n);
  const st2 = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (outside[i] || blob[i]) return;
    outside[i] = 1; st2.push(x, y);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (st2.length) { const y = st2.pop(), x = st2.pop(); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }

  const solid = new Uint8Array(n), glass = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    solid[i] = (blob[i] || !outside[i]) ? 1 : 0;
    glass[i] = (!paint[i] && !outside[i] && !blob[i]) ? 1 : 0;
  }
  return {
    cell: { x: x0, y: y0, w, h }, solid, glass, paint,
    box: { x: a, y: c, w: b - a + 1, h: d - c + 1 },     // relative to the cell
    at: (x, y) => solid[(y + c) * w + (x + a)],          // relative to the box
  };
}

const V = Object.fromEntries(Object.entries(CELLS).map(([k, c]) => [k, view(c)]));

/* ---- is this the sheet we think it is? ----------------------------- */
const ar = v => v.box.w / v.box.h;
if (!(ar(V.front) < 1 && ar(V.rear) < 1))
  throw new Error('the top two views are not taller than they are wide, so they are not the front and the rear');
if (!(ar(V.side) > 1 && ar(V.top) > 1))
  throw new Error('the bottom two views are not wider than they are tall, so they are not the side and the plan');
if (!(V.side.box.h / V.side.box.w > V.top.box.h / V.top.box.w))
  throw new Error('the plan view is deeper than the side view is tall, so one of them is the other');
const fr = Math.abs(V.front.box.w * V.rear.box.h - V.rear.box.w * V.front.box.h) / (V.front.box.w * V.rear.box.h);
if (fr > 0.05) throw new Error(`the front and rear views are ${(fr * 100).toFixed(1)}% different in shape; they should be the same vehicle`);

/* ---- reconcile: three views, one width ----------------------------- */
const S = V.side.box, F = V.front.box, R = V.rear.box, T = V.top.box;
const LEN = S.w, HGT = S.h;
const widths = {
  front: F.w * HGT / F.h,        // scale the front so its height matches the side's
  rear:  R.w * HGT / R.h,
  top:   T.h * LEN / T.w,        // scale the plan so its length matches the side's
};
const WID = (widths.front + widths.rear + widths.top) / 3;
const agree = (Math.max(...Object.values(widths)) - Math.min(...Object.values(widths))) / WID;
if (agree > AGREE_MAX)
  throw new Error(`the three views disagree about the width by ${(agree * 100).toFixed(1)}% (${JSON.stringify(widths)}); that is not one vehicle`);

/* ---- where the roof line is, in each view that draws one ------------
   The three views agree about the vehicle's PROPORTIONS to about a
   percent. They do not agree about where the vehicle sits inside its own
   frame: the head-on views draw a taller light bar and shallower wheels
   than the side view does, which slides everything else three percent of
   the height down the frame. Mapping frame to bounding box then puts the
   model's roof up where the head-on view has only light bar, and the
   nose and the tail come out with a pale band along the top of them.

   So the scale still comes from the frames — that is the measurement
   that agrees — and the OFFSET comes from the roof line, which is the
   one horizontal all three views draw unambiguously: a row of a head-on
   view is at or below the roof once it is most of the vehicle's width,
   and a row of the side view is the roof once it runs most of the
   vehicle's length. Line those up and the sills come out within a fifth
   of a pixel of each other as well. What is left over is at the very
   bottom of the frame, where the head-on views' tyres are three pixels
   shallower than the side view's; that lands under the vehicle and gets
   clamped into the bottom row of the picture, where nobody looks. */
function roofRow(v, box, test) {
  for (let y = 0; y < box.h; y++) {
    let a = -1, b = -1, run = 0, best = 0;
    for (let x = 0; x < box.w; x++) {
      if (v.at(x, y)) { if (a < 0) a = x; b = x; run++; if (run > best) best = run; }
      else run = 0;
    }
    if (test(a < 0 ? 0 : b - a + 1, best)) return y;
  }
  return 0;
}
const sideRoof = HGT - roofRow(V.side, S, (span, run) => run >= ROOF_RUN * LEN);
/* each view's window on the model, in side-view pixels: how far up the
   bottom and top edges of its frame sit, and how wide it is */
function windowOf(v, box, width) {
  const k = HGT / box.h;                                    // side px per view px
  const roof = (box.h - roofRow(v, box, span => span >= ROOF_SPAN * box.w)) * k;
  const z0 = sideRoof - roof;
  return { z0, z1: z0 + box.h * k, half: width / 2 };
}
const WINDOW = {
  front: windowOf(V.front, F, widths.front),
  rear: windowOf(V.rear, R, widths.rear),
  side: { z0: 0, z1: HGT, half: null },
  top: { z0: null, z1: null, half: widths.top / 2 },
};

/* ---- the outline of the side view ---------------------------------- */
const topEdge = new Int32Array(LEN), botEdge = new Int32Array(LEN);
for (let x = 0; x < LEN; x++) {
  let t = -1, b = -1;
  for (let y = 0; y < HGT; y++) if (V.side.at(x, y)) { if (t < 0) t = y; b = y; }
  topEdge[x] = t < 0 ? HGT : t;
  botEdge[x] = b < 0 ? 0 : b;
}
/* The underside is the commonest bottom edge — a long flat run of it —
   and anything well below that is a wheel. */
const hist = new Int32Array(HGT + 1);
for (let x = 0; x < LEN; x++) hist[botEdge[x]]++;
let sillRow = 0;
for (let y = 0; y <= HGT; y++) if (hist[y] > hist[sillRow]) sillRow = y;
const wheelRuns = [];
for (let x = 0, s = -1; x <= LEN; x++) {
  const on = x < LEN && botEdge[x] > sillRow + WHEEL_TOL * LEN;
  if (on && s < 0) s = x;
  if (!on && s >= 0) { if (x - s > LEN * 0.03) wheelRuns.push([s, x - 1]); s = -1; }
}
if (wheelRuns.length !== 2)
  throw new Error(`the side view's underside dips ${wheelRuns.length} times; a vehicle seen from the side shows two wheels`);

/* ---- the roof line as a staircase ----------------------------------
   Split where it helps most; stop when every step is within STEP_TOL of
   the outline under it, or when there are enough of them. A step's
   height is the HIGHEST point under it, so the boxes enclose the
   silhouette rather than cutting into it. */
const height = x => HGT - topEdge[x];                    // above the ground line, in px
function segError(i0, i1) {
  let v = 0;
  for (let x = i0; x <= i1; x++) v = Math.max(v, height(x));
  let e = 0;
  for (let x = i0; x <= i1; x++) e += v - height(x);
  return { v, e };
}
let segs = [{ i0: 0, i1: LEN - 1, ...segError(0, LEN - 1) }];
while (segs.length < STEP_MAX) {
  let worst = -1, worstDev = 0;
  segs.forEach((s, i) => {
    let dev = 0;
    for (let x = s.i0; x <= s.i1; x++) dev = Math.max(dev, s.v - height(x));
    if (dev > worstDev) { worstDev = dev; worst = i; }
  });
  if (worst < 0 || worstDev <= STEP_TOL * LEN) break;
  const s = segs[worst];
  let bestCut = -1, bestErr = Infinity;
  for (let c = s.i0; c < s.i1; c++) {
    const a = segError(s.i0, c), b = segError(c + 1, s.i1);
    if (a.e + b.e < bestErr) { bestErr = a.e + b.e; bestCut = c; }
  }
  segs.splice(worst, 1,
    { i0: s.i0, i1: bestCut, ...segError(s.i0, bestCut) },
    { i0: bestCut + 1, i1: s.i1, ...segError(bestCut + 1, s.i1) });
}
segs.sort((a, b) => a.i0 - b.i0);
/* Two steps a pixel apart are one step. Without this the roof comes out
   as a full-length slab with a one-pixel ridge along it, because the
   greedy split will happily spend a step on a rounded corner. */
{
  const vs = [...new Set(segs.map(s => s.v))].sort((a, b) => a - b);
  const to = new Map();
  for (let i = 0; i < vs.length;) {
    let j = i;
    while (j + 1 < vs.length && vs[j + 1] - vs[i] <= STEP_TOL * 0.5 * LEN) j++;
    for (let k = i; k <= j; k++) to.set(vs[k], vs[j]);
    i = j + 1;
  }
  for (const s of segs) s.v = to.get(s.v);
}

/* ---- how wide is the vehicle between two heights? ------------------
   The front view, asked over the rows that match. Its box is the model's
   width by the model's height, by construction, so the conversion is a
   ratio of box sizes and nothing else. */
function halfWidthAt(zLo, zHi) {                          // heights above ground, in side px
  const rowOf = z => (WINDOW.front.z1 - z) / (WINDOW.front.z1 - WINDOW.front.z0) * F.h;
  const r0 = Math.max(0, Math.floor(rowOf(zHi)));
  const r1 = Math.min(F.h - 1, Math.ceil(rowOf(zLo)) - 1);
  let widest = 0;
  for (let r = r0; r <= r1; r++) {
    let a = -1, b = -1;
    for (let x = 0; x < F.w; x++) if (V.front.at(x, r)) { if (a < 0) a = x; b = x; }
    if (a >= 0) widest = Math.max(widest, b - a + 1);
  }
  return widest / 2 * (WID / F.w);                        // front px -> side px
}

/* ---- the layers ----------------------------------------------------
   One box per distinct step in the roof line, spanning the height
   between the step below it and its own, over every stretch of the
   vehicle that reaches that high. */
const sillZ = HGT - sillRow;
const tops = [...new Set(segs.map(s => s.v))].sort((a, b) => a - b).filter(v => v > sillZ);
const layers = [];
let zPrev = sillZ;
for (const t of tops) {
  const runs2 = [];
  for (const s of segs.filter(s => s.v >= t).sort((a, b) => a.i0 - b.i0)) {
    const last = runs2[runs2.length - 1];
    if (last && s.i0 <= last[1] + 1) last[1] = Math.max(last[1], s.i1);
    else runs2.push([s.i0, s.i1]);
  }
  layers.push({ z0: zPrev, z1: t, runs: runs2, half: halfWidthAt(zPrev, t) });
  zPrev = t;
}

/* ---- the tyre, off the bottom of the front view --------------------- */
let tyre = 0;
for (let r = F.h - 1; r >= F.h - Math.round(F.h * 0.12); r--) {
  let run = 0, best = 0;
  for (let x = 0; x < F.w; x++) { if (V.front.at(x, r)) { run++; best = Math.max(best, run); } else run = 0; }
  tyre = Math.max(tyre, best);
}
tyre *= WID / F.w;

/* ---- everything in model units, where the LENGTH is 1 ---------------
   x runs +0.5 at the nose to -0.5 at the tail, y is +width/2 to the
   vehicle's left, z is 0 on the ground. The side view is drawn nose to
   the left, so its x runs the other way from the model's. */
const mx = px => 0.5 - px / LEN;
const round = (n, p = 4) => Number(n.toFixed(p));

const wheels = wheelRuns.map(([a, b]) => {
  const rWidth = (b - a + 1) / 2;                          // half the tyre the arch shows
  const rDepth = sillZ;                                    // and how far it hangs below the sill
  return { x: round(mx((a + b + 1) / 2)), r: round(((rWidth + rDepth) / 2) / LEN), width: rWidth, depth: rDepth };
});

/* ---- the atlas ----------------------------------------------------
   Every pixel of every view gets a colour, including the ones that were
   key: the nearest painted pixel, darkened if it was glass. A face that
   overhangs the silhouette lands on paint, never on chroma key. */
function fill(v) {
  const { cell, glass, paint } = v;
  const { w, h } = cell, n = w * h;
  /* WHERE THE BLED COLOUR COMES FROM is the paint set back from its own
     edge by two pixels. Every edge in a JPEG is fringed, and against a
     green screen the fringe is green: a windscreen slit filled from the
     pixel next to it comes out dark GREEN rather than dark glass. Two
     pixels in from the edge, the colour is the vehicle's. */
  const inner = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let all = 1;
    for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !paint[ny * w + nx]) { all = 0; break; }
    }
    inner[y * w + x] = all;
  }
  const src = new Int32Array(n).fill(-1);
  const q = [];
  for (let i = 0; i < n; i++) if (inner[i]) { src[i] = i; q.push(i); }
  if (!q.length) for (let i = 0; i < n; i++) if (paint[i]) { src[i] = i; q.push(i); }
  for (let head = 0; head < q.length; head++) {
    const i = q[head], x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (src[j] >= 0) continue;
      src[j] = src[i]; q.push(j);
    }
  }
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = src[i] < 0 ? i : src[i];
    const sx = cell.x + (s % w), sy = cell.y + ((s / w) | 0), o = (sy * SW + sx) * 4;
    const k = glass[i] ? GLASS : 1;
    rgb[i * 3] = SD[o] * k; rgb[i * 3 + 1] = SD[o + 1] * k; rgb[i * 3 + 2] = SD[o + 2] * k;
  }
  return rgb;
}
const filled = Object.fromEntries(Object.entries(V).map(([k, v]) => [k, fill(v)]));

/* shelf packing, tallest first, one pixel of gutter all round */
const order = Object.keys(V).sort((a, b) => V[b].box.h - V[a].box.h);
const place = {};
let shelfY = 0, shelfH = 0, penX = 0;
for (const k of order) {
  const bw = V[k].box.w + PAD * 2, bh = V[k].box.h + PAD * 2;
  if (penX + bw > ATLAS_W) { shelfY += shelfH; shelfH = 0; penX = 0; }
  place[k] = { x: penX + PAD, y: shelfY + PAD, w: V[k].box.w, h: V[k].box.h };
  penX += bw; shelfH = Math.max(shelfH, bh);
}
const AH = shelfY + shelfH;
const atlas = new Uint8Array(ATLAS_W * AH * 4);
/* opaque everywhere, including the offcuts between the shelves: a car is
   a solid and nothing on it is ever meant to be seen through, so a
   transparent pixel in here could only ever be a mistake */
for (let i = 3; i < atlas.length; i += 4) atlas[i] = 255;
for (const k of order) {
  const v = V[k], p = place[k], cw = v.cell.w;
  /* the gutter is the edge pixel repeated, so nothing bleeds between views */
  for (let y = -PAD; y < p.h + PAD; y++) for (let x = -PAD; x < p.w + PAD; x++) {
    const sx = v.box.x + Math.min(p.w - 1, Math.max(0, x)), sy = v.box.y + Math.min(p.h - 1, Math.max(0, y));
    const s = (sy * cw + sx) * 3, d = ((p.y + y) * ATLAS_W + (p.x + x)) * 4;
    atlas[d] = filled[k][s]; atlas[d + 1] = filled[k][s + 1]; atlas[d + 2] = filled[k][s + 2]; atlas[d + 3] = 255;
  }
}
fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
fs.writeFileSync(OUT_PNG, writePNG(ATLAS_W, AH, atlas));

/* ---- and the numbers ----------------------------------------------- */
const js = `/* GENERATED by tools/prep-car.mjs from ${inFile} — do not edit by hand.

   A vehicle measured off a four-view sheet, and where each of those
   views ended up in ${OUT_PNG}. js/car.js builds boxes out of
   the shape and paints them by projecting the views back along the axes
   they were drawn down.

   Lengths are fractions of the vehicle's own LENGTH, so the model has
   one scale and js/car.js sets it. x is +0.5 at the nose and -0.5 at the
   tail, y is +${round(WID / LEN / 2)} to the vehicle's left, z is 0 on the ground. */

/** The atlas, and where the four views sit in it, in its own pixels —
    plus the window on the model each of those rectangles covers: \`z0\`
    and \`z1\` are the heights its bottom and top edges are at, \`half\` is
    how far either side of the middle its width reaches. The side view's
    frame IS the model's bounding box, so it only needs the heights; the
    plan view's frame is the length, so it only needs the half width. */
export const CAR_ATLAS = { file: '${OUT_PNG}', w: ${ATLAS_W}, h: ${AH} };
export const CAR_VIEWS = {
${Object.keys(V).map(k => {
  const q = WINDOW[k], w = [`x: ${place[k].x}`, `y: ${place[k].y}`, `w: ${place[k].w}`, `h: ${place[k].h}`];
  if (q.z0 !== null) w.push(`z0: ${round(q.z0 / LEN)}`, `z1: ${round(q.z1 / LEN)}`);
  if (q.half !== null) w.push(`half: ${round(q.half / LEN)}`);
  return `  ${k}: { ${w.join(', ')} },`;
}).join('\n')}
};

/** The vehicle. \`layers\` is the side view's roof line as a stack of
    boxes, lowest first, each as wide as the front view is at that
    height; \`runs\` is which stretches of the vehicle reach that high.
    \`wheels\` are the two dips in the underside, and sit on the ground. */
export const CAR_SHAPE = {
  width: ${round(WID / LEN)},
  height: ${round(HGT / LEN)},
  sill: ${round(sillZ / LEN)},
  tyre: ${round(tyre / LEN)},
  /** The roof line: the height every view was anchored on, so the top of
      the body and the top of each view's window agree about where it is. */
  roof: ${round(sideRoof / LEN)},
  layers: [
${layers.map(l => `    { z0: ${round(l.z0 / LEN)}, z1: ${round(l.z1 / LEN)}, half: ${round(l.half / LEN)}, runs: [${l.runs.map(([a, b]) => `[${round(mx(b + 1))}, ${round(mx(a))}]`).join(', ')}] },`).join('\n')}
  ],
  wheels: [
${wheels.map(w => `    { x: ${w.x}, r: ${w.r} },`).join('\n')}
  ],
  /** How far apart the three views' claims about the width were, as a
      fraction of it. The sheet is over-determined; this is the residual. */
  agree: ${round(agree)},
};
`;
fs.writeFileSync(OUT_JS, js);

/* ---- what it found ------------------------------------------------- */
const pct = n => (n * 100).toFixed(1) + '%';
console.log(`${inFile}  ${SW}x${SH}`);
for (const k of Object.keys(V))
  console.log(`  ${k.padEnd(5)} ${String(V[k].box.w).padStart(4)}x${String(V[k].box.h).padEnd(4)} at ${V[k].cell.x + V[k].box.x},${V[k].cell.y + V[k].box.y}`);
console.log(`  length ${LEN}  height ${HGT}  width ${WID.toFixed(1)} — the front says ${widths.front.toFixed(1)}, the rear ${widths.rear.toFixed(1)}, the plan ${widths.top.toFixed(1)}, so they agree to ${pct(agree)}`);
console.log(`  proportions ${(LEN / WID).toFixed(2)} : 1 : ${(HGT / WID).toFixed(2)} (length : width : height)`);
console.log(`  the roof line sits ${sideRoof}px up in the side view; the head-on views' frames start ${WINDOW.front.z0.toFixed(1)}px off the ground and end at ${WINDOW.front.z1.toFixed(1)}, against the side view's 0 and ${HGT}`);
console.log(`  sill ${sillZ}px off the ground; wheels of radius ${wheels.map(w => w.r * LEN).map(r => r.toFixed(1)).join(' and ')}px at x=${wheels.map(w => w.x).join(', ')}, tyre ${tyre.toFixed(1)}px wide`);
console.log(`  ${layers.length} layers:`);
for (const l of layers)
  console.log(`    z ${(l.z0 / LEN).toFixed(3)}..${(l.z1 / LEN).toFixed(3)}  half-width ${(l.half / LEN).toFixed(3)}  over ${l.runs.map(([a, b]) => `${mx(b + 1).toFixed(3)}..${mx(a).toFixed(3)}`).join(', ')}`);
console.log(`  ${OUT_PNG}  ${ATLAS_W}x${AH}, ${pct(Object.keys(V).reduce((a, k) => a + V[k].box.w * V[k].box.h, 0) / (ATLAS_W * AH))} of it used`);
console.log(`  ${OUT_JS}`);
