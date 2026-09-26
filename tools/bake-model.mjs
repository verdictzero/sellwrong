/* =====================================================================
   Bake a sculpt's paint onto a low-poly cage
   =====================================================================

     node tools/bake-model.mjs <sculpt.glb> <cage.glb> <out.glb> [--size N] [--crease DEG] [--samples K]

   THE OTHER HALF OF A REMESH. tools/decimate-model.mjs makes the cage —
   run with `--colour 0`, so it spends its triangles on the SHAPE and
   none on the paint — and this puts the paint back: every texel of a
   new texture is a point on the cage, and what colour it is comes from
   the sculpt, found by casting a ray from the cage to the surface it
   stands in for. The shape is carried by a few thousand triangles and
   the paint by a picture, which is what every other gun in the rack is
   and what a sculpt with its colour in its vertices was not:

     node tools/decimate-model.mjs sculpt.glb cage.glb --triangles 8000 --colour 0 --normal 0.02
     node tools/bake-model.mjs sculpt.glb cage.glb out.glb --size 512

   which is how assets/models/launcher.glb was made, from the Nomad
   sculpt the user sent (its name is in the file's asset.extras).

   Four steps, and each is the plain version of itself.

   ---------------------------------------------------------------------
   1. CHARTS, BY WHICH WAY A FACE LOOKS

   Every face of the cage goes into one of six bins — the axis its
   normal is nearest, and which way along it — and a chart is a run of
   faces in one bin joined by their edges. A chart is then flattened by
   dropping the bin's axis: the other two coordinates ARE its UVs. That
   is a box projection, and for a box — which is what a quad launcher
   is — it is nearly the best unwrap there is: the panels land square
   and undistorted, and only the bevels and the curves pay, by at most
   the one over the cosine of fifty-five degrees, which a texture this
   size does not show. A face whose normal is inside its bin's cone
   cannot fold over its neighbours in that bin's plane, so a chart does
   not overlap itself; the bake counts the texels where it would have,
   and says.

   2. PACKED ON SHELVES

   Each chart's box, turned to lie flat, a gutter round it, tallest
   first, left to right in rows. The texel density is the largest one
   at which the lot still fits — found by halving the difference — so
   the texture is as full as shelves make it and every chart is at the
   same scale as every other, which is what keeps a seam from being a
   change in resolution.

   3. CREASES

   The cage's own normals are not used. A vertex gets one normal for
   every group of the faces round it that meet at less than `--crease`
   degrees: across a flat panel that is one normal and the panel is
   flat, and across a bevel it is a hard edge and the bevel is a facet.
   Smooth everywhere, which is what a decimator's normals are, is the
   crumpled foil the first cut of this model was — see the header of
   tools/decimate-model.mjs.

   4. THE BAKE

   Every texel a chart covers is a point on a cage face. A ray through
   it along the face's normal, both ways, a little further than the
   cage can be off the sculpt; the hit NEAREST the cage is where the
   texel was painted, and its colour is the three painted corners of
   the sculpt's triangle there, mixed by where in it the ray landed.
   Four hundred and sixty thousand triangles, and half a million rays
   at 512 and four times that at 1024, is a bounding volume hierarchy — median splits, four to a
   leaf, and a query that prunes any box further from the cage than
   the best hit so far. `--samples K` takes K by K rays in a texel and
   averages them, which is the antialiasing; a ray that finds nothing
   (a grazing one, into a crack) falls back to the nearest painted
   vertex. Then the gutters are grown out from the charts' edges, so a
   mipmap or a point sample at a seam finds the chart's own colour and
   not the background, and the rest of the sheet is the mean.

   The sculpt's paint is LINEAR — glTF says vertex colours are — and a
   texture is sRGB, so it is encoded on the way into the PNG and the
   GPU decodes it on the way out, and the gun shader sees the colour
   the sculptor painted.

   WHAT COMES OUT: one node, one primitive, POSITION, NORMAL and
   TEXCOORD_0, sixteen-bit indices when they fit, and one material with
   the baked sheet as its base colour, clamped at the edges. No vertex
   colour: the picture is the paint now.
   ===================================================================== */

import fs from 'node:fs';
import { writePNG } from './png-read.mjs';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const SIZE = Number(flag('--size')) || 1024;
const CREASE = Number(flag('--crease') ?? 38);
const SAMPLES = Math.max(1, Number(flag('--samples')) || 2);
const PAD = Math.max(2, Math.round(SIZE / 256));
const [sculptFile, cageFile, outFile] = args;
if (!sculptFile || !cageFile || !outFile) {
  console.error('usage: bake-model.mjs <sculpt.glb> <cage.glb> <out.glb> [--size N] [--crease DEG] [--samples K]');
  process.exit(2);
}
if (SIZE & (SIZE - 1)) throw new Error('--size wants a power of two, for the mipmaps');

/* ---- read ----------------------------------------------------------- */
const ITEMS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const GET = { 5120: 'readInt8', 5121: 'readUInt8', 5122: 'readInt16LE', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' };
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

function readGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF' || buf.readUInt32LE(4) !== 2) throw new Error(file + ': not a glTF 2 binary');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'JSON') json = JSON.parse(data.toString('utf8'));
    else if (type.startsWith('BIN')) bin = data;
    off += 8 + len;
  }
  if (!json || !bin) throw new Error(file + ': needs a JSON and a BIN chunk');
  if (json.extensionsRequired?.length) throw new Error(file + ': required extensions ' + json.extensionsRequired.join());
  if ((json.animations || []).length || (json.skins || []).length) throw new Error(file + ': animation and skins are not handled');
  return { json, bin, bytes: buf.length };
}

function read(json, bin, index) {
  const a = json.accessors[index];
  if (a.sparse) throw new Error('sparse accessors are not handled');
  const n = ITEMS[a.type], cb = BYTES[a.componentType], get = GET[a.componentType];
  if (!n || !cb) throw new Error(`accessor ${index}: unsupported ${a.type}/${a.componentType}`);
  const bv = json.bufferViews[a.bufferView];
  const stride = bv.byteStride || n * cb;
  const from = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float64Array(a.count * n);
  const div = a.normalized ? NORM[a.componentType] : 1;
  for (let i = 0; i < a.count; i++)
    for (let k = 0; k < n; k++) out[i * n + k] = bin[get](from + i * stride + k * cb) / div;
  return { array: out, n };
}

/* Every triangle in the file, in world space, as one mesh: the node
   transforms baked in, exactly as tools/decimate-model.mjs does. */
function flatten({ json, bin }) {
  const mul = (a, b) => {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  };
  const trs = n => {
    if (n.matrix) return n.matrix.slice();
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
    const [sx, sy, sz] = n.scale || [1, 1, 1];
    const [tx, ty, tz] = n.translation || [0, 0, 0];
    return [
      (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
      (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
      (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
      tx, ty, tz, 1,
    ];
  };
  const P = [], C = [], F = [];
  let colour = null;
  const walk = (ni, parent) => {
    const node = json.nodes[ni];
    const m = mul(parent, trs(node));
    if (node.mesh !== undefined)
      for (const p of json.meshes[node.mesh].primitives) {
        if (p.mode !== undefined && p.mode !== 4) throw new Error('only triangle lists are handled');
        const pos = read(json, bin, p.attributes.POSITION);
        const col = p.attributes.COLOR_0 !== undefined ? read(json, bin, p.attributes.COLOR_0) : null;
        if (colour === null) colour = !!col;
        else if (colour !== !!col) throw new Error('some primitives are painted and some are not');
        const count = pos.array.length / 3, base = P.length / 3;
        for (let i = 0; i < count; i++) {
          const x = pos.array[i * 3], y = pos.array[i * 3 + 1], z = pos.array[i * 3 + 2];
          P.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
          if (col) C.push(col.array[i * col.n], col.array[i * col.n + 1], col.array[i * col.n + 2]);
        }
        const I = p.indices !== undefined ? read(json, bin, p.indices).array : Float64Array.from({ length: count }, (_, i) => i);
        for (let i = 0; i < I.length; i++) F.push(base + I[i]);
      }
    for (const c of node.children || []) walk(c, m);
  };
  for (const ni of json.scenes[json.scene ?? 0].nodes) walk(ni, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return { P: Float64Array.from(P), C: colour ? Float64Array.from(C) : null, F: Int32Array.from(F) };
}

const sculptGLB = readGLB(sculptFile), cageGLB = readGLB(cageFile);
const hi = flatten(sculptGLB), lo = flatten(cageGLB);
if (!hi.C) throw new Error(sculptFile + ': the sculpt has no paint to bake');
const t0 = Date.now();

/* ---- 1. charts ------------------------------------------------------- */
const V = lo.P.length / 3, NF = lo.F.length / 3;
const FN = new Float64Array(NF * 3), FA = new Float64Array(NF);
for (let f = 0; f < NF; f++) {
  const a = lo.F[f * 3], b = lo.F[f * 3 + 1], c = lo.F[f * 3 + 2];
  const ux = lo.P[b * 3] - lo.P[a * 3], uy = lo.P[b * 3 + 1] - lo.P[a * 3 + 1], uz = lo.P[b * 3 + 2] - lo.P[a * 3 + 2];
  const vx = lo.P[c * 3] - lo.P[a * 3], vy = lo.P[c * 3 + 1] - lo.P[a * 3 + 1], vz = lo.P[c * 3 + 2] - lo.P[a * 3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  FA[f] = l / 2;
  if (l > 0) { FN[f * 3] = nx / l; FN[f * 3 + 1] = ny / l; FN[f * 3 + 2] = nz / l; }
}
const BIN = new Uint8Array(NF);
for (let f = 0; f < NF; f++) {
  let k = 0;
  for (let j = 1; j < 3; j++) if (Math.abs(FN[f * 3 + j]) > Math.abs(FN[f * 3 + k])) k = j;
  BIN[f] = k * 2 + (FN[f * 3 + k] < 0 ? 1 : 0);
}
const edgeKey = (a, b) => (a < b ? a * V + b : b * V + a);
const edgeFaces = new Map();
for (let f = 0; f < NF; f++)
  for (let k = 0; k < 3; k++) {
    const key = edgeKey(lo.F[f * 3 + k], lo.F[f * 3 + (k + 1) % 3]);
    const list = edgeFaces.get(key);
    if (list) list.push(f); else edgeFaces.set(key, [f]);
  }
const neighbours = f => {
  const out = [];
  for (let k = 0; k < 3; k++)
    for (const g of edgeFaces.get(edgeKey(lo.F[f * 3 + k], lo.F[f * 3 + (k + 1) % 3]))) if (g !== f) out.push(g);
  return out;
};
/* how squarely a face looks down a bin's axis: the cosine between them */
const facing = (f, bin) => (bin & 1 ? -1 : 1) * FN[f * 3 + (bin >> 1)];

/* THE BINS ARE VOTED ON BEFORE THEY BECOME CHARTS. A decimated bevel is
   a strip of faces at very nearly forty-five degrees, and which of two
   axes a face at forty-four or forty-six degrees is nearest is noise —
   the first cut of this took the noise at its word and cut the launcher
   into seven hundred charts, most of them a triangle or two, and the
   gutters round them were most of the sheet. So a face that two of its
   three neighbours put in another bin joins them, as long as it still
   faces that bin's axis within sixty degrees. Three rounds. */
for (let round = 0; round < 3; round++) {
  const next = BIN.slice();
  for (let f = 0; f < NF; f++) {
    const votes = new Map();
    for (const g of neighbours(f)) votes.set(BIN[g], (votes.get(BIN[g]) || 0) + 1);
    for (const [b, n] of votes)
      if (b !== BIN[f] && n >= 2 && facing(f, b) > 0.5) { next[f] = b; break; }
  }
  BIN.set(next);
}

const CHART = new Int32Array(NF).fill(-1);
let chartFaces = [];
const chartBin = [];
for (let f0 = 0; f0 < NF; f0++) {
  if (CHART[f0] >= 0) continue;
  const id = chartFaces.length, faces = [f0];
  CHART[f0] = id;
  for (let q = 0; q < faces.length; q++)
    for (const g of neighbours(faces[q])) {
      if (CHART[g] >= 0 || BIN[g] !== BIN[f0]) continue;
      CHART[g] = id;
      faces.push(g);
    }
  chartFaces.push(faces);
  chartBin.push(BIN[f0]);
}

/* AND A CHART TOO SMALL TO BE WORTH ITS GUTTER GOES INTO A NEIGHBOUR,
   the one it shares the most edge with whose axis every face of it can
   still see within seventy-two degrees — front-facing, so it cannot
   fold. Smallest first, until nothing small is left that can move. */
const chartArea = id => chartFaces[id].reduce((s, f) => s + FA[f], 0);
const totalArea = FA.reduce((s, a) => s + a, 0);
const SMALL = totalArea / 400;
/* AND A BEVEL GOES WITH ITS PANEL. The strips round the launcher's
   panels are long, so they are not small, and they are a few texels
   high, so what they mostly are on the sheet is gutter — the second cut
   of this was two thirds empty for them. Every face of a bevel looks
   down the axis of the panel beside it within fifty-three degrees, so
   it goes into that panel's chart, at a stretch of a quarter or so,
   and the ring is part of the square it rings. */
const merge = (pick, need) => {
  for (let moved = true; moved;) {
    moved = false;
    const order = chartFaces.map((_, id) => id).filter(id => chartFaces[id].length && pick(id))
      .sort((a, b) => chartArea(a) - chartArea(b));
    for (const id of order) {
      if (!chartFaces[id].length) continue;
      const border = new Map();
      for (const f of chartFaces[id])
        for (const g of neighbours(f)) if (CHART[g] !== id) border.set(CHART[g], (border.get(CHART[g]) || 0) + 1);
      let best = -1, bestN = 0;
      for (const [other, n] of border) {
        if (n <= bestN || !chartFaces[other].length) continue;
        if (!chartFaces[id].every(f => facing(f, chartBin[other]) > need)) continue;
        best = other; bestN = n;
      }
      if (best < 0) continue;
      for (const f of chartFaces[id]) { CHART[f] = best; chartFaces[best].push(f); BIN[f] = chartBin[best]; }
      chartFaces[id] = [];
      moved = true;
    }
  }
};
merge(() => true, 0.6);
merge(id => chartArea(id) < SMALL, 0.3);

/* renumber what is left */
const keep = chartFaces.map((faces, id) => faces.length ? id : -1).filter(id => id >= 0);
const renumber = new Map(keep.map((id, i) => [id, i]));
for (let f = 0; f < NF; f++) CHART[f] = renumber.get(CHART[f]);
const charts = keep.map(id => {
  const faces = chartFaces[id];
  const axis = chartBin[id] >> 1, a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (const f of faces) for (let k = 0; k < 3; k++) {
    const v = lo.F[f * 3 + k];
    const u = lo.P[v * 3 + a1], w = lo.P[v * 3 + a2];
    if (u < umin) umin = u; if (u > umax) umax = u;
    if (w < vmin) vmin = w; if (w > vmax) vmax = w;
  }
  return { faces, a1, a2, umin, vmin, du: umax - umin, dv: vmax - vmin, x: 0, y: 0, rot: false };
});

/* ---- 2. shelves -------------------------------------------------------- */
function pack(D) {
  const items = charts.map((c, i) => {
    let w = Math.ceil(c.du * D) + 1 + 2 * PAD, h = Math.ceil(c.dv * D) + 1 + 2 * PAD;
    const rot = h > w;
    if (rot) [w, h] = [h, w];
    return { i, w, h, rot };
  });
  items.sort((p, q) => q.h - p.h || q.w - p.w);
  let x = 0, y = 0, shelf = 0;
  const at = new Array(charts.length);
  for (const it of items) {
    if (it.w > SIZE) return null;
    if (x + it.w > SIZE) { y += shelf; x = 0; shelf = 0; }
    if (y + it.h > SIZE) return null;
    at[it.i] = { x, y, rot: it.rot };
    x += it.w;
    shelf = Math.max(shelf, it.h);
  }
  return at;
}
let dLo = 0, dHi = SIZE / Math.max(...charts.map(c => Math.max(c.du, c.dv), 1e-9));
for (let k = 0; k < 40; k++) { const mid = (dLo + dHi) / 2; if (pack(mid)) dLo = mid; else dHi = mid; }
const D = dLo;
const placed = pack(D);
charts.forEach((c, i) => Object.assign(c, placed[i]));

/* ---- 3. creases, and the vertices that come out ----------------------- */
const vertFaces = Array.from({ length: V }, () => []);
for (let f = 0; f < NF; f++) for (let k = 0; k < 3; k++) vertFaces[lo.F[f * 3 + k]].push(f);
const COS = Math.cos(CREASE * Math.PI / 180);
/* group[f*3+k] is the smoothing group of that corner, local to its vertex */
const GROUP = new Int32Array(NF * 3);
const groupNormal = [];            // per vertex, one per group: [x, y, z]
for (let v = 0; v < V; v++) {
  const fs_ = vertFaces[v], n = fs_.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const f = fs_[i], g = fs_[j];
      /* neighbours round this vertex share an edge out of it */
      let shared = 0;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++)
        if (lo.F[f * 3 + a] === lo.F[g * 3 + b] && lo.F[f * 3 + a] !== v) shared++;
      if (!shared) continue;
      const d = FN[f * 3] * FN[g * 3] + FN[f * 3 + 1] * FN[g * 3 + 1] + FN[f * 3 + 2] * FN[g * 3 + 2];
      if (d > COS) parent[find(i)] = find(j);
    }
  const ids = new Map(), normals = [];
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!ids.has(r)) { ids.set(r, normals.length); normals.push([0, 0, 0]); }
    const g = ids.get(r), f = fs_[i];
    /* weighted by the face's corner ANGLE at this vertex, so a long thin
       triangle does not drag the normal round with its area */
    let k = 0; while (lo.F[f * 3 + k] !== v) k++;
    const b = lo.F[f * 3 + (k + 1) % 3], c = lo.F[f * 3 + (k + 2) % 3];
    const e1 = [0, 1, 2].map(j => lo.P[b * 3 + j] - lo.P[v * 3 + j]);
    const e2 = [0, 1, 2].map(j => lo.P[c * 3 + j] - lo.P[v * 3 + j]);
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const ang = Math.acos(Math.max(-1, Math.min(1, (e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2]) / (l1 * l2))));
    for (let j = 0; j < 3; j++) normals[g][j] += FN[f * 3 + j] * ang;
    GROUP[f * 3 + k] = g;
  }
  groupNormal.push(normals.map(q => { const l = Math.hypot(...q) || 1; return [q[0] / l, q[1] / l, q[2] / l]; }));
}
const outIndex = new Map();
const OP = [], ON = [], OT = [], OI = [];
const texel = (c, v) => {
  const u = (lo.P[v * 3 + c.a1] - c.umin) * D, w = (lo.P[v * 3 + c.a2] - c.vmin) * D;
  return c.rot ? [c.x + PAD + w, c.y + PAD + u] : [c.x + PAD + u, c.y + PAD + w];
};
for (let f = 0; f < NF; f++) {
  const c = charts[CHART[f]];
  for (let k = 0; k < 3; k++) {
    const v = lo.F[f * 3 + k], g = GROUP[f * 3 + k];
    const key = `${v}|${CHART[f]}|${g}`;
    let o = outIndex.get(key);
    if (o === undefined) {
      o = OP.length / 3;
      outIndex.set(key, o);
      OP.push(lo.P[v * 3], lo.P[v * 3 + 1], lo.P[v * 3 + 2]);
      ON.push(...groupNormal[v][g]);
      const [tx, ty] = texel(c, v);
      OT.push(tx / SIZE, ty / SIZE);
    }
    OI.push(o);
  }
}

/* ---- 4. the bake ------------------------------------------------------ */
/* THE HIERARCHY over the sculpt's triangles: a node is a box and either
   two children, side by side, or a run of triangles in ORDER */
const HT = hi.F.length / 3;
const ORDER = new Int32Array(HT).map((_, i) => i);
const CEN = new Float32Array(HT * 3), TMIN = new Float32Array(HT * 3), TMAX = new Float32Array(HT * 3);
for (let t = 0; t < HT; t++)
  for (let k = 0; k < 3; k++) {
    const a = hi.P[hi.F[t * 3] * 3 + k], b = hi.P[hi.F[t * 3 + 1] * 3 + k], c = hi.P[hi.F[t * 3 + 2] * 3 + k];
    TMIN[t * 3 + k] = Math.min(a, b, c); TMAX[t * 3 + k] = Math.max(a, b, c);
    CEN[t * 3 + k] = (a + b + c) / 3;
  }
const LEAF = 4;
const MAXN = Math.ceil(HT / LEAF) * 4 + 16;
const NB = new Float32Array(MAXN * 6);          // min xyz, max xyz
const NL = new Int32Array(MAXN), NC = new Int32Array(MAXN);   // first child or first triangle, and count (0 = inner)
let nodes = 1;
{
  const stack = [[0, 0, HT]];
  while (stack.length) {
    const [n, s, e] = stack.pop();
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    let cmn = [Infinity, Infinity, Infinity], cmx = [-Infinity, -Infinity, -Infinity];
    for (let i = s; i < e; i++) {
      const t = ORDER[i];
      for (let k = 0; k < 3; k++) {
        if (TMIN[t * 3 + k] < mn[k]) mn[k] = TMIN[t * 3 + k];
        if (TMAX[t * 3 + k] > mx[k]) mx[k] = TMAX[t * 3 + k];
        if (CEN[t * 3 + k] < cmn[k]) cmn[k] = CEN[t * 3 + k];
        if (CEN[t * 3 + k] > cmx[k]) cmx[k] = CEN[t * 3 + k];
      }
    }
    for (let k = 0; k < 3; k++) { NB[n * 6 + k] = mn[k]; NB[n * 6 + 3 + k] = mx[k]; }
    if (e - s <= LEAF) { NL[n] = s; NC[n] = e - s; continue; }
    let axis = 0;
    for (let k = 1; k < 3; k++) if (cmx[k] - cmn[k] > cmx[axis] - cmn[axis]) axis = k;
    /* the median, by quickselect on the centroids */
    const mid = (s + e) >> 1;
    let l = s, r = e - 1;
    while (l < r) {
      const pivot = CEN[ORDER[(l + r) >> 1] * 3 + axis];
      let i = l, j = r;
      while (i <= j) {
        while (CEN[ORDER[i] * 3 + axis] < pivot) i++;
        while (CEN[ORDER[j] * 3 + axis] > pivot) j--;
        if (i <= j) { const tmp = ORDER[i]; ORDER[i] = ORDER[j]; ORDER[j] = tmp; i++; j--; }
      }
      if (mid <= j) r = j; else if (mid >= i) l = i; else break;
    }
    const left = nodes; nodes += 2;
    NL[n] = left; NC[n] = 0;
    stack.push([left, s, mid], [left + 1, mid, e]);
  }
}

/* One ray, and the hit nearest `tref` along it — the cage's own surface
   is at tref and the ray runs from outside it to inside. */
const hit = { t: 0, tri: -1, u: 0, v: 0 };
const nodeStack = new Int32Array(128);
function castNearest(ox, oy, oz, dx, dy, dz, tmax, tref) {
  let best = Infinity;
  hit.tri = -1;
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  let sp = 0;
  nodeStack[sp++] = 0;
  while (sp) {
    const n = nodeStack[--sp];
    const b = n * 6;
    let t0 = 0, t1 = tmax;
    let a = (NB[b] - ox) * ix, c = (NB[b + 3] - ox) * ix;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c;
    a = (NB[b + 1] - oy) * iy; c = (NB[b + 4] - oy) * iy;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c;
    a = (NB[b + 2] - oz) * iz; c = (NB[b + 5] - oz) * iz;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c;
    if (t0 > t1) continue;
    /* no nearer to the cage than the best already found: skip it */
    const gap = tref < t0 ? t0 - tref : tref > t1 ? tref - t1 : 0;
    if (gap >= best) continue;
    if (NC[n]) {
      for (let i = NL[n], e = NL[n] + NC[n]; i < e; i++) {
        const t = ORDER[i];
        const p0 = hi.F[t * 3] * 3, p1 = hi.F[t * 3 + 1] * 3, p2 = hi.F[t * 3 + 2] * 3;
        const e1x = hi.P[p1] - hi.P[p0], e1y = hi.P[p1 + 1] - hi.P[p0 + 1], e1z = hi.P[p1 + 2] - hi.P[p0 + 2];
        const e2x = hi.P[p2] - hi.P[p0], e2y = hi.P[p2 + 1] - hi.P[p0 + 1], e2z = hi.P[p2 + 2] - hi.P[p0 + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-14) continue;
        const inv = 1 / det;
        const sx = ox - hi.P[p0], sy = oy - hi.P[p0 + 1], sz = oz - hi.P[p0 + 2];
        const u = (sx * px + sy * py + sz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (tt < 0 || tt > tmax) continue;
        const g = Math.abs(tt - tref);
        if (g < best) { best = g; hit.t = tt; hit.tri = t; hit.u = u; hit.v = v; }
      }
    } else {
      nodeStack[sp++] = NL[n];
      nodeStack[sp++] = NL[n] + 1;
    }
  }
  return hit.tri >= 0;
}

/* the fallback: the nearest painted vertex, off a grid */
const CELL = 0.02;
const grid = new Map();
const cellKey = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
for (let i = 0; i < hi.P.length / 3; i++) {
  const k = cellKey(hi.P[i * 3], hi.P[i * 3 + 1], hi.P[i * 3 + 2]);
  const list = grid.get(k);
  if (list) list.push(i); else grid.set(k, [i]);
}
function nearestPaint(x, y, z, out) {
  let best = Infinity, bi = -1;
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
  for (let r = 1; r <= 3 && bi < 0; r++)
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
      const list = grid.get(`${cx + i},${cy + j},${cz + k}`);
      if (!list) continue;
      for (const q of list) {
        const d = (hi.P[q * 3] - x) ** 2 + (hi.P[q * 3 + 1] - y) ** 2 + (hi.P[q * 3 + 2] - z) ** 2;
        if (d < best) { best = d; bi = q; }
      }
    }
  if (bi < 0) return false;
  out[0] = hi.C[bi * 3]; out[1] = hi.C[bi * 3 + 1]; out[2] = hi.C[bi * 3 + 2];
  return true;
}

/* how far the cage may be off the sculpt: a twentieth of the model's
   smallest side, which is several times what the decimator left */
let bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < lo.P.length; i += 3)
  for (let k = 0; k < 3; k++) { bmin[k] = Math.min(bmin[k], lo.P[i + k]); bmax[k] = Math.max(bmax[k], lo.P[i + k]); }
const REACH = Math.min(...[0, 1, 2].map(k => bmax[k] - bmin[k])) / 20;

const RGB = new Float64Array(SIZE * SIZE * 3);
const OWN = new Float32Array(SIZE * SIZE).fill(Infinity);   // how far outside its triangle the texel's middle was
let rays = 0, misses = 0, fallbacks = 0, overlaps = 0;
const colour = [0, 0, 0];
const OWNER = new Int32Array(SIZE * SIZE).fill(-1);
for (let f = 0; f < NF; f++) {
  const i0 = OI[f * 3], i1 = OI[f * 3 + 1], i2 = OI[f * 3 + 2];
  const ax = OT[i0 * 2] * SIZE, ay = OT[i0 * 2 + 1] * SIZE;
  const bx = OT[i1 * 2] * SIZE, by = OT[i1 * 2 + 1] * SIZE;
  const cx = OT[i2 * 2] * SIZE, cy = OT[i2 * 2 + 1] * SIZE;
  const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(den) < 1e-12) continue;
  const nx = FN[f * 3], ny = FN[f * 3 + 1], nz = FN[f * 3 + 2];
  const P0 = [OP[i0 * 3], OP[i0 * 3 + 1], OP[i0 * 3 + 2]];
  const P1 = [OP[i1 * 3], OP[i1 * 3 + 1], OP[i1 * 3 + 2]];
  const P2 = [OP[i2 * 3], OP[i2 * 3 + 1], OP[i2 * 3 + 2]];
  const bary = (px, py) => {
    const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
    const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
    return [w0, w1, 1 - w0 - w1];
  };
  /* how far outside the triangle a point is, in texels, and the nearest
     point of it: inside is nought and itself */
  const clampTo = (px, py) => {
    const w = bary(px, py);
    if (w[0] >= 0 && w[1] >= 0 && w[2] >= 0) return [0, w];
    let bestD = Infinity, bestW = null;
    for (const [p, q, wp, wq] of [[[ax, ay], [bx, by], 0, 1], [[bx, by], [cx, cy], 1, 2], [[cx, cy], [ax, ay], 2, 0]]) {
      const ex = q[0] - p[0], ey = q[1] - p[1];
      const s = Math.max(0, Math.min(1, ((px - p[0]) * ex + (py - p[1]) * ey) / (ex * ex + ey * ey || 1)));
      const d = Math.hypot(p[0] + ex * s - px, p[1] + ey * s - py);
      if (d < bestD) { bestD = d; bestW = [0, 0, 0]; bestW[wp] = 1 - s; bestW[wq] = s; }
    }
    return [bestD, bestW];
  };
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), x1 = Math.min(SIZE - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), y1 = Math.min(SIZE - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const [dCentre, wCentre] = clampTo(tx + 0.5, ty + 0.5);
      const at = ty * SIZE + tx;
      /* two faces of the SAME chart both claiming a texel's middle is a
         chart that has folded over itself — counted, not fixed */
      if (dCentre === 0 && OWN[at] === 0 && OWNER[at] >= 0 && CHART[OWNER[at]] === CHART[f]) overlaps++;
      if (dCentre > 0.75 || dCentre >= OWN[at]) continue;
      let r = 0, g = 0, bl = 0, n = 0;
      for (let sy = 0; sy < SAMPLES; sy++)
        for (let sx = 0; sx < SAMPLES; sx++) {
          const w = dCentre > 0 ? wCentre : clampTo(tx + (sx + 0.5) / SAMPLES, ty + (sy + 0.5) / SAMPLES)[1];
          const px = w[0] * P0[0] + w[1] * P1[0] + w[2] * P2[0];
          const py = w[0] * P0[1] + w[1] * P1[1] + w[2] * P2[1];
          const pz = w[0] * P0[2] + w[1] * P1[2] + w[2] * P2[2];
          rays++;
          if (castNearest(px + nx * REACH, py + ny * REACH, pz + nz * REACH, -nx, -ny, -nz, REACH * 2, REACH)) {
            const t = hit.tri, u = hit.u, v = hit.v, q0 = 1 - u - v;
            const c0 = hi.F[t * 3] * 3, c1 = hi.F[t * 3 + 1] * 3, c2 = hi.F[t * 3 + 2] * 3;
            r += q0 * hi.C[c0] + u * hi.C[c1] + v * hi.C[c2];
            g += q0 * hi.C[c0 + 1] + u * hi.C[c1 + 1] + v * hi.C[c2 + 1];
            bl += q0 * hi.C[c0 + 2] + u * hi.C[c1 + 2] + v * hi.C[c2 + 2];
            n++;
          } else if (nearestPaint(px, py, pz, colour)) {
            fallbacks++;
            r += colour[0]; g += colour[1]; bl += colour[2]; n++;
          } else misses++;
        }
      if (!n) continue;
      OWN[at] = dCentre;
      OWNER[at] = f;
      RGB[at * 3] = r / n; RGB[at * 3 + 1] = g / n; RGB[at * 3 + 2] = bl / n;
    }
}

/* ---- the gutters: grown out from the charts, then the mean ------------ */
const covered = new Uint8Array(SIZE * SIZE);
let sum = [0, 0, 0], count = 0;
for (let i = 0; i < SIZE * SIZE; i++) if (OWN[i] < Infinity) {
  covered[i] = 1; count++;
  for (let k = 0; k < 3; k++) sum[k] += RGB[i * 3 + k];
}
const used = count / (SIZE * SIZE);
for (let pass = 0; pass < PAD * 2; pass++) {
  const grow = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      if (covered[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const xx = x + k, yy = y + j;
        if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
        const q = yy * SIZE + xx;
        if (!covered[q]) continue;
        r += RGB[q * 3]; g += RGB[q * 3 + 1]; b += RGB[q * 3 + 2]; n++;
      }
      if (n) grow.push([i, r / n, g / n, b / n]);
    }
  for (const [i, r, g, b] of grow) { covered[i] = 1; RGB[i * 3] = r; RGB[i * 3 + 1] = g; RGB[i * 3 + 2] = b; }
}
const mean = sum.map(v => v / Math.max(1, count));
const toSRGB = c => { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let i = 0; i < SIZE * SIZE; i++) {
  for (let k = 0; k < 3; k++) rgba[i * 4 + k] = Math.round(toSRGB(covered[i] ? RGB[i * 3 + k] : mean[k]) * 255);
  rgba[i * 4 + 3] = 255;
}
const png = writePNG(SIZE, SIZE, rgba, { filter: true });

/* ---- write ------------------------------------------------------------- */
const parts = [], bufferViews = [], accessors = [];
let cursor = 0;
const place = (bytes, target) => {
  const pad = (4 - (cursor % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); cursor += pad; }
  bufferViews.push({ buffer: 0, byteOffset: cursor, byteLength: bytes.length, ...(target ? { target } : {}) });
  parts.push(bytes);
  cursor += bytes.length;
  return bufferViews.length - 1;
};
const floats = (values, n, box) => {
  const b = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) b.writeFloatLE(values[i], i * 4);
  const a = { bufferView: place(b, 34962), componentType: 5126, count: values.length / n, type: ['', 'SCALAR', 'VEC2', 'VEC3'][n] };
  if (box) {
    a.min = [Infinity, Infinity, Infinity]; a.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < values.length; i++) {
      const v = b.readFloatLE(i * 4), k = i % 3;
      if (v < a.min[k]) a.min[k] = v;
      if (v > a.max[k]) a.max[k] = v;
    }
  }
  accessors.push(a);
  return accessors.length - 1;
};
const POSITION = floats(OP, 3, true), NORMAL = floats(ON, 3, false), TEXCOORD_0 = floats(OT, 2, false);
const big = OP.length / 3 > 65535;
const ib = Buffer.alloc(OI.length * (big ? 4 : 2));
OI.forEach((v, i) => (big ? ib.writeUInt32LE(v, i * 4) : ib.writeUInt16LE(v, i * 2)));
accessors.push({ bufferView: place(ib, 34963), componentType: big ? 5125 : 5123, count: OI.length, type: 'SCALAR' });
const indices = accessors.length - 1;
const image = place(png);
const binOut = Buffer.concat(parts);
const name = sculptGLB.json.nodes.find(n => n.mesh !== undefined)?.name || 'model';
const srcMat = sculptGLB.json.materials?.[0] || {};
const out = {
  asset: {
    version: '2.0',
    generator: (sculptGLB.json.asset.generator || '') + ' + tools/decimate-model.mjs + tools/bake-model.mjs',
    extras: {
      ...(sculptGLB.json.asset.extras || {}),
      source: sculptFile.split('/').pop(),
      baked: { from: hi.F.length / 3, cage: NF, size: SIZE, charts: charts.length, samples: SAMPLES, crease: CREASE,
               ...(cageGLB.json.asset.extras?.decimated ? { remesh: cageGLB.json.asset.extras.decimated } : {}) },
    },
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name, mesh: 0 }],
  meshes: [{ name, primitives: [{ attributes: { POSITION, NORMAL, TEXCOORD_0 }, indices, material: 0 }] }],
  materials: [{ name: srcMat.name || 'baked', doubleSided: srcMat.doubleSided ?? true,
                pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
  textures: [{ sampler: 0, source: 0 }],
  samplers: [{ wrapS: 33071, wrapT: 33071 }],
  images: [{ bufferView: image, mimeType: 'image/png', name: 'baked' }],
  accessors, bufferViews,
  buffers: [{ byteLength: binOut.length }],
};
let jsonBuf = Buffer.from(JSON.stringify(out), 'utf8');
if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]);
let binPadded = binOut;
if (binPadded.length % 4) binPadded = Buffer.concat([binPadded, Buffer.alloc(4 - (binPadded.length % 4))]);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii'); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binPadded.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(type, 4, 'ascii'); return b; };
fs.mkdirSync(outFile.replace(/\/[^/]*$/, '') || '.', { recursive: true });
fs.writeFileSync(outFile, Buffer.concat([header, ch(jsonBuf.length, 'JSON'), jsonBuf, ch(binPadded.length, 'BIN\0'), binPadded]));
if (process.env.BAKE_ATLAS) fs.writeFileSync(process.env.BAKE_ATLAS, png);

const kb = n => (n / 1024).toFixed(0) + 'K';
console.log(`${outFile}: ${kb(sculptGLB.bytes)} sculpt -> ${kb(fs.statSync(outFile).size)}, ${hi.F.length / 3} -> ${NF} triangles, ${OP.length / 3} vertices`);
console.log(`  ${charts.length} charts at ${D.toFixed(0)} texels a unit, ${(used * 100).toFixed(0)}% of a ${SIZE} sheet (${kb(png.length)} PNG)`);
console.log(`  ${rays} rays, ${fallbacks} to the nearest vertex, ${misses} lost, ${overlaps} texels where a chart folds; ${((Date.now() - t0) / 1000).toFixed(1)}s`);
