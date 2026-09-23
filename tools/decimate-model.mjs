/* =====================================================================
   Decimate a vertex-painted sculpt for the game
   =====================================================================

     node tools/decimate-model.mjs <in.glb> <out.glb> --triangles N [--colour W] [--normal W]

   THE QUAD LAUNCHER CAME OUT OF NOMAD SCULPT, and a sculpt is not a
   game model. It is one watertight surface of four hundred and sixty
   thousand triangles — the density the brush needed, not the density
   anything will ever be drawn at — with its paint in the VERTICES
   rather than in a texture: COLOR_0 is the colour, COLOR_1 is Nomad's
   own roughness and metalness, and there is no UV map at all. Fourteen
   megabytes, for a gun that is held at arm's length and resolved down
   to a few hundred chunky pixels by the lo-fi pass.

   tools/prep-model.mjs cannot help with that, and says why in its own
   header: it strips, it never resamples. There is nothing in a sculpt
   to strip — the triangles ARE the model — so this is the other tool,
   the one that does resample, and it is kept separate so that the
   promise in the first one stays true.

   ---------------------------------------------------------------------
   HOW: QUADRIC EDGE COLLAPSE, WITH THE PAINT IN THE QUADRIC

   Garland and Heckbert's, in the form their second paper gives it for a
   surface that carries colour. Every triangle is a plane, and every
   vertex keeps the sum of the squared distances to the planes of the
   triangles around it (weighted by their area); collapsing an edge
   costs what the kept vertex would be off all of those planes at once.
   The cheapest edge goes first, and the heap is kept honest by stamps
   rather than by deletion.

   THE PLANES ARE NINE-DIMENSIONAL: x, y, z, then r, g, b, the colour
   scaled by `--colour`, then the normal scaled by `--normal`, both as a
   fraction of the model's own diagonal — at 0.02 a black-to-white step
   costs what being two per cent of the gun off its own surface does.
   That is the whole reason this is not a plain decimator. A flat panel
   in one flat green collapses to almost nothing, which is right; a
   grime smudge painted across the same flat panel keeps the vertices
   that draw it, because in nine dimensions the smudge is not flat.
   Vertex paint is exactly as sharp as the mesh under it, so a
   decimator that only looks at the shape throws the paint away first.

   AND THE NORMAL IS IN THERE FOR THE SAME REASON, which the first cut
   of this found out by looking. With position and colour alone the
   bevels came through as SHAPE — the silhouette was right to the pixel
   — but their vertices kept the steep normals of a bevel while the
   triangles they now belonged to reached halfway across the panel
   beside them, and a normal is smeared over whatever triangle it is
   on: every flat panel came out crumpled, lit like foil. With the
   normal in the quadric, a vertex whose shading turns away from its
   neighbours' costs something to lose, so the rolled edges keep the
   rows of vertices that roll them and the panels are flat again.

   THE KEPT VERTEX IS ALWAYS ONE OF THE TWO ENDS, never an optimised
   point between them. That costs a little shape and buys a lot of
   honesty: every POSITION in the output is a position of the input,
   to the bit, so the model cannot drift or swell, and the box it is
   fitted by in js/weapon3d.js is the box the artist made.

   BUT ITS NORMAL AND ITS PAINT ARE THE PATCH'S, not its own, and that
   was found by looking too. A vertex that survives stands in for every
   vertex that was collapsed into it — a patch of the original a few
   dozen vertices across — and a sculpt's single vertex is NOISY: its
   own normal carries the brush's grain and its own colour is one fleck
   of a smudge. Kept as they were, each of those was stretched over a
   triangle forty times its old size, and the panels came out crumpled
   and the grime came out as blotches. So every vertex carries sums of
   the area, normal and paint it stands for, a collapse hands the lost
   end's sums to the kept one, and what is written is the patch's
   average: the low-pass filter that matches the new spacing of the
   samples, which is exactly what a smaller texture is to a bigger one.

   AND THE THREE THINGS THAT KEEP A COLLAPSE FROM BREAKING THE SURFACE:
   the link condition (the two ends may share no neighbour but the ones
   across the edge, or the collapse pinches the surface into a
   non-manifold), a normal check (no triangle around the moved end may
   turn more than about seventy-five degrees, or it has folded over its
   neighbour), and open edges held by a plane of their own at right
   angles to the face, so a hole keeps its rim. Vertices on an edge with
   three faces — the sculpt has four — are simply never moved.

   ---------------------------------------------------------------------
   WHAT COMES OUT

   One node, no transform: the node's matrix is baked into the vertices
   (and its inverse-transpose into the normals), so the model's own
   units are the numbers js/weapon3d.js measures anchors in — the same
   thing a marker sphere would have given, and without a matrix in the
   way. One primitive per material. POSITION as it was, NORMAL and
   COLOR_0 as the patch averages above, the colour as normalised
   unsigned bytes, and indices as sixteen bits when they fit. COLOR_1
   and anything else js/glb.js does not bind is gone.

   A model with a texture is refused. Its UVs would survive (the ends
   are the file's own vertices) but it would need its images carried
   through too, and a textured model's triangles are rarely the problem:
   that is prep-model's job and it does it without touching a vertex.
   ===================================================================== */

import fs from 'node:fs';

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const TARGET = Number(flag('--triangles')) || 0;
const colourArg = flag('--colour'), normalArg = flag('--normal');
const COLOUR = colourArg === null ? 0.02 : Number(colourArg);
const NORMAL = normalArg === null ? 0.01 : Number(normalArg);
const [inFile, outFile] = args;
if (!inFile || !outFile || !TARGET) {
  console.error('usage: decimate-model.mjs <in.glb> <out.glb> --triangles N [--colour W] [--normal W]');
  process.exit(2);
}

/* ---- read ---------------------------------------------------------- */
const buf = fs.readFileSync(inFile);
if (buf.toString('ascii', 0, 4) !== 'glTF' || buf.readUInt32LE(4) !== 2) throw new Error('not a glTF 2 binary');
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 'JSON') json = JSON.parse(data.toString('utf8'));
  else if (type.startsWith('BIN')) bin = data;
  off += 8 + len;
}
if (!json || !bin) throw new Error('GLB needs a JSON and a BIN chunk');
if ((json.buffers || []).length !== 1) throw new Error('expected exactly one buffer');
if ((json.animations || []).length || (json.skins || []).length) throw new Error('animations and skins are not handled');
if (json.extensionsRequired?.length) throw new Error('required extensions: ' + json.extensionsRequired.join());
if ((json.images || []).length || (json.textures || []).length)
  throw new Error('this model has textures: it wants tools/prep-model.mjs, which never resamples');

const ITEMS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const GET = { 5120: 'readInt8', 5121: 'readUInt8', 5122: 'readInt16LE', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' };
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
/** An accessor as plain numbers, normalised integers already divided out. */
function read(index) {
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

/* ---- the node transforms, baked ------------------------------------ */
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
/* the normal matrix: the inverse transpose of the upper three by three,
   which is what keeps a normal square to its surface under the
   non-uniform scale Nomad leaves on its node */
const normalMatrix = m => {
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];   // columns
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
  const det = a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20);
  if (Math.abs(det) < 1e-12) throw new Error('a node transform is singular');
  /* the inverse transpose is the cofactor matrix over the determinant */
  return [
    (a11 * a22 - a12 * a21) / det, -(a10 * a22 - a12 * a20) / det, (a10 * a21 - a11 * a20) / det,
    -(a01 * a22 - a02 * a21) / det, (a00 * a22 - a02 * a20) / det, -(a00 * a21 - a01 * a20) / det,
    (a01 * a12 - a02 * a11) / det, -(a00 * a12 - a02 * a10) / det, (a00 * a11 - a01 * a10) / det,
  ];   // rows
};

/* Every triangle in the scene, in world space, grouped by material. */
const groups = new Map();
const walk = (ni, parent) => {
  const n = json.nodes[ni];
  const m = mul(parent, trs(n));
  if (n.mesh !== undefined) {
    const nm = normalMatrix(m);
    for (const p of json.meshes[n.mesh].primitives) {
      if (p.mode !== undefined && p.mode !== 4) throw new Error('only triangle lists are handled');
      if (p.targets) throw new Error('morph targets are not handled');
      const P = read(p.attributes.POSITION);
      const N = p.attributes.NORMAL !== undefined ? read(p.attributes.NORMAL) : null;
      const C = p.attributes.COLOR_0 !== undefined ? read(p.attributes.COLOR_0) : null;
      const count = json.accessors[p.attributes.POSITION].count;
      const I = p.indices !== undefined ? read(p.indices).array : Float64Array.from({ length: count }, (_, i) => i);
      const key = p.material ?? -1;
      if (!groups.has(key)) groups.set(key, { P: [], N: [], C: [], F: [], hasN: !!N, hasC: !!C });
      const g = groups.get(key);
      if (g.hasN !== !!N || g.hasC !== !!C) throw new Error('primitives on one material disagree about normals or colour');
      const base = g.P.length / 3;
      for (let i = 0; i < count; i++) {
        const x = P.array[i * 3], y = P.array[i * 3 + 1], z = P.array[i * 3 + 2];
        g.P.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        if (N) {
          const a = N.array[i * 3], b = N.array[i * 3 + 1], c = N.array[i * 3 + 2];
          const nx = nm[0] * a + nm[1] * b + nm[2] * c, ny = nm[3] * a + nm[4] * b + nm[5] * c, nz = nm[6] * a + nm[7] * b + nm[8] * c;
          const l = Math.hypot(nx, ny, nz) || 1;
          g.N.push(nx / l, ny / l, nz / l);
        }
        if (C) {
          g.C.push(C.array[i * C.n], C.array[i * C.n + 1], C.array[i * C.n + 2]);
          if (C.n === 4 && C.array[i * 4 + 3] < 0.999) g.alpha = true;
        }
      }
      for (let i = 0; i < I.length; i++) g.F.push(base + I[i]);
    }
  }
  for (const c of n.children || []) walk(c, m);
};
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
for (const ni of json.scenes[json.scene ?? 0].nodes) walk(ni, I4);
if (!groups.size) throw new Error('no triangles');
let totalFaces = 0;
for (const g of groups.values()) totalFaces += g.F.length / 3;
if (groups.size > 1 && [...groups.values()].some(g => g.alpha)) throw new Error('translucent vertex colour is not handled');

/* ---------------------------------------------------------------------
   THE DECIMATOR
   --------------------------------------------------------------------- */

/** A small binary min-heap on typed arrays: cost, the end that goes, the
 *  end that stays, and the two ends' stamps when the cost was worked
 *  out. An entry whose stamps are old is skipped when it surfaces rather
 *  than dug out when it goes stale — the lazy way, and the fast one. */
class Heap {
  constructor(cap) { this.n = 0; this._grow(cap); }
  _grow(cap) {
    const o = this;
    const re = (A, old) => { const a = new A(cap); if (old) a.set(old.subarray(0, o.n)); return a; };
    this.cost = re(Float64Array, this.cost); this.u = re(Int32Array, this.u); this.v = re(Int32Array, this.v);
    this.su = re(Int32Array, this.su); this.sv = re(Int32Array, this.sv);
    this.cap = cap;
  }
  push(cost, u, v, su, sv) {
    if (this.n === this.cap) this._grow(this.cap * 2);
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cost[p] <= cost) break;
      this._copy(i, p); i = p;
    }
    this.cost[i] = cost; this.u[i] = u; this.v[i] = v; this.su[i] = su; this.sv[i] = sv;
  }
  _copy(to, from) {
    this.cost[to] = this.cost[from]; this.u[to] = this.u[from]; this.v[to] = this.v[from];
    this.su[to] = this.su[from]; this.sv[to] = this.sv[from];
  }
  /** Pops into `out`, returns false when empty. */
  pop(out) {
    if (!this.n) return false;
    out.cost = this.cost[0]; out.u = this.u[0]; out.v = this.v[0]; out.su = this.su[0]; out.sv = this.sv[0];
    const last = --this.n;
    if (!last) return true;
    const c = this.cost[last], u = this.u[last], v = this.v[last], su = this.su[last], sv = this.sv[last];
    let i = 0;
    for (;;) {
      let k = 2 * i + 1;
      if (k >= last) break;
      if (k + 1 < last && this.cost[k + 1] < this.cost[k]) k++;
      if (this.cost[k] >= c) break;
      this._copy(i, k); i = k;
    }
    this.cost[i] = c; this.u[i] = u; this.v[i] = v; this.su[i] = su; this.sv[i] = sv;
    return true;
  }
}

function decimate(P, C, N, F, target, colourScale, normalScale) {
  const V = P.length / 3, NF = F.length / 3;
  /* the dimensions: space, then the paint if there is any, then the
     normal if there is one */
  const CO = 3, NO = C ? 6 : 3;
  const D = NO + (N ? 3 : 0);
  /* the packed upper triangle of A, then b, then c */
  const TRI = D * (D + 1) / 2, QN = TRI + D + 1;
  const IDX = [];
  for (let i = 0; i < D; i++) { IDX.push([]); for (let j = 0; j < D; j++) {
    const a = Math.min(i, j), b = Math.max(i, j);
    IDX[i].push(a * D - (a * (a - 1)) / 2 + (b - a));
  } }
  const Q = new Float64Array(V * QN);
  const pt = (i, out) => {
    out[0] = P[i * 3]; out[1] = P[i * 3 + 1]; out[2] = P[i * 3 + 2];
    if (C) for (let k = 0; k < 3; k++) out[CO + k] = C[i * 3 + k] * colourScale;
    if (N) for (let k = 0; k < 3; k++) out[NO + k] = N[i * 3 + k] * normalScale;
    return out;
  };

  /* ---- the quadric of every face, onto its three corners ---------- */
  const p = new Float64Array(D), q = new Float64Array(D), r = new Float64Array(D);
  const e1 = new Float64Array(D), e2 = new Float64Array(D);
  const addQuadric = (vs, w) => {
    /* A = I - e1 e1' - e2 e2', b = (p.e1) e1 + (p.e2) e2 - p,
       c = p.p - (p.e1)^2 - (p.e2)^2, all times the weight */
    let pe1 = 0, pe2 = 0, pp = 0;
    for (let k = 0; k < D; k++) { pe1 += p[k] * e1[k]; pe2 += p[k] * e2[k]; pp += p[k] * p[k]; }
    for (const vi of vs) {
      const o = vi * QN;
      for (let i = 0; i < D; i++)
        for (let j = i; j < D; j++)
          Q[o + IDX[i][j]] += w * ((i === j ? 1 : 0) - e1[i] * e1[j] - e2[i] * e2[j]);
      for (let i = 0; i < D; i++) Q[o + TRI + i] += w * (pe1 * e1[i] + pe2 * e2[i] - p[i]);
      Q[o + TRI + D] += w * (pp - pe1 * pe1 - pe2 * pe2);
    }
  };
  for (let f = 0; f < NF; f++) {
    const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
    pt(a, p); pt(b, q); pt(c, r);
    /* the weight is the triangle's area in SPACE, not in six dimensions:
       paint does not make a triangle bigger */
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (area < 1e-14) continue;
    let l = 0;
    for (let k = 0; k < D; k++) { e1[k] = q[k] - p[k]; l += e1[k] * e1[k]; }
    l = Math.sqrt(l); if (l < 1e-14) continue;
    for (let k = 0; k < D; k++) e1[k] /= l;
    let t = 0;
    for (let k = 0; k < D; k++) t += (r[k] - p[k]) * e1[k];
    l = 0;
    for (let k = 0; k < D; k++) { e2[k] = r[k] - p[k] - t * e1[k]; l += e2[k] * e2[k]; }
    l = Math.sqrt(l); if (l < 1e-14) continue;
    for (let k = 0; k < D; k++) e2[k] /= l;
    addQuadric([a, b, c], area);
  }

  /* ---- what each vertex stands for ---------------------------------
     Its share of the surface (a third of every face it is a corner of),
     and that share's normal and paint, summed. A collapse hands the lost
     end's sums to the kept one, so at the end every vertex knows the
     whole patch of the original it now stands in for. */
  const W = new Float64Array(V), NS = new Float64Array(V * 3), CS = new Float64Array(V * 3);
  for (let f = 0; f < NF; f++) {
    const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    for (const i of [a, b, c]) W[i] += area / 3;
  }
  for (let i = 0; i < V; i++)
    for (let k = 0; k < 3; k++) {
      if (N) NS[i * 3 + k] = N[i * 3 + k] * W[i];
      if (C) CS[i * 3 + k] = C[i * 3 + k] * W[i];
    }

  /* ---- adjacency ---------------------------------------------------- */
  const vf = Array.from({ length: V }, () => []);
  for (let f = 0; f < NF; f++) for (let k = 0; k < 3; k++) vf[F[f * 3 + k]].push(f);
  const edgeCount = new Map();
  const ek = (a, b) => (a < b ? a * V + b : b * V + a);
  for (let f = 0; f < NF; f++)
    for (let k = 0; k < 3; k++) {
      const a = F[f * 3 + k], b = F[f * 3 + (k + 1) % 3];
      const key = ek(a, b);
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
    }
  const locked = new Uint8Array(V);
  const border = new Uint8Array(V);
  /* OPEN EDGES, held: a plane through the edge at right angles to its
     face, weighted like a face of the edge's own length squared and
     then some, so the rim of a hole stays where it is */
  for (let f = 0; f < NF; f++)
    for (let k = 0; k < 3; k++) {
      const a = F[f * 3 + k], b = F[f * 3 + (k + 1) % 3], c = F[f * 3 + (k + 2) % 3];
      const n = edgeCount.get(ek(a, b));
      if (n > 2) { locked[a] = locked[b] = 1; continue; }
      if (n !== 1) continue;
      border[a] = border[b] = 1;
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const ex = P[b * 3] - ax, ey = P[b * 3 + 1] - ay, ez = P[b * 3 + 2] - az;
      const fx = P[c * 3] - ax, fy = P[c * 3 + 1] - ay, fz = P[c * 3 + 2] - az;
      const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
      let mx = ny * ez - nz * ey, my = nz * ex - nx * ez, mz = nx * ey - ny * ex;
      const ml = Math.hypot(mx, my, mz); if (ml < 1e-14) continue;
      mx /= ml; my /= ml; mz /= ml;
      const d = -(mx * ax + my * ay + mz * az);
      const w = 8 * (ex * ex + ey * ey + ez * ez);
      const m = [mx, my, mz];
      for (const vi of [a, b]) {
        const o = vi * QN;
        for (let i = 0; i < 3; i++) for (let j = i; j < 3; j++) Q[o + IDX[i][j]] += w * m[i] * m[j];
        for (let i = 0; i < 3; i++) Q[o + TRI + i] += w * d * m[i];
        Q[o + TRI + D] += w * d * d;
      }
    }

  /* ---- costs -------------------------------------------------------- */
  const x = new Float64Array(D), sum = new Float64Array(QN);
  const evalAt = (Qs, xi) => {
    let e = Qs[TRI + D];
    for (let i = 0; i < D; i++) {
      e += 2 * Qs[TRI + i] * xi[i] + Qs[IDX[i][i]] * xi[i] * xi[i];
      for (let j = i + 1; j < D; j++) e += 2 * Qs[IDX[i][j]] * xi[i] * xi[j];
    }
    return e;
  };
  const stamp = new Int32Array(V);
  const dead = new Uint8Array(V);
  const heap = new Heap(1 << 21);
  const consider = (a, b) => {
    if (locked[a] && locked[b]) return;
    for (let k = 0; k < QN; k++) sum[k] = Q[a * QN + k] + Q[b * QN + k];
    /* collapse onto whichever end is cheaper to keep, and never move a
       locked one */
    const ea = locked[b] ? Infinity : evalAt(sum, pt(a, x));
    const eb = locked[a] ? Infinity : evalAt(sum, pt(b, x));
    if (ea <= eb) heap.push(Math.max(0, ea), b, a, stamp[b], stamp[a]);
    else heap.push(Math.max(0, eb), a, b, stamp[a], stamp[b]);
  };
  for (const key of edgeCount.keys()) {
    const a = Math.floor(key / V), b = key - a * V;
    consider(a, b);
  }

  /* ---- the checks --------------------------------------------------- */
  const alive = new Uint8Array(NF).fill(1);
  const mark = new Int32Array(V).fill(-1);
  let markGen = 0;
  const has = (f, v) => F[f * 3] === v || F[f * 3 + 1] === v || F[f * 3 + 2] === v;
  /* the link condition: the ends may share no neighbour but the ones
     across the edge */
  const linkOK = (u, v) => {
    const gen = ++markGen;
    for (const f of vf[u]) for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w !== u) mark[w] = gen; }
    const opposite = [];
    for (const f of vf[u]) if (has(f, v)) for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w !== u && w !== v) opposite.push(w); }
    if (!opposite.length) return false;
    for (const f of vf[v]) for (let k = 0; k < 3; k++) {
      const w = F[f * 3 + k];
      if (w === v || w === u || mark[w] !== gen) continue;
      if (!opposite.includes(w)) return false;
    }
    /* two rims joined across the middle of a surface is a pinch too. The
       counts are the file's, never updated, so an edge made by a collapse
       reads as no rim at all — which can only ever refuse more */
    if (border[u] && border[v] && edgeCount.get(ek(u, v)) !== 1) return false;
    return true;
  };
  /* and no triangle round the moved end may fold over */
  const COS_FOLD = 0.26;
  const foldOK = (u, v) => {
    for (const f of vf[u]) {
      if (has(f, v)) continue;
      const i0 = F[f * 3], i1 = F[f * 3 + 1], i2 = F[f * 3 + 2];
      const pos = (i, j) => P[(i === u ? v : i) * 3 + j];
      const n0 = tri(P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2], P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2], P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]);
      const a0 = n0[0], a1 = n0[1], a2 = n0[2];
      const n1 = tri(pos(i0, 0), pos(i0, 1), pos(i0, 2), pos(i1, 0), pos(i1, 1), pos(i1, 2), pos(i2, 0), pos(i2, 1), pos(i2, 2));
      const l0 = Math.hypot(a0, a1, a2), l1 = Math.hypot(n1[0], n1[1], n1[2]);
      if (l1 < 1e-14) return false;
      if (l0 < 1e-14) continue;
      if ((a0 * n1[0] + a1 * n1[1] + a2 * n1[2]) < COS_FOLD * l0 * l1) return false;
    }
    return true;
  };
  const tn = [0, 0, 0];
  const tri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    tn[0] = uy * vz - uz * vy; tn[1] = uz * vx - ux * vz; tn[2] = ux * vy - uy * vx;
    return [tn[0], tn[1], tn[2]];
  };

  /* ---- collapse until there are few enough ------------------------- */
  let faces = NF, collapses = 0, refused = 0;
  const e = {};
  const neighbours = new Set();
  while (faces > target && heap.pop(e)) {
    const { u, v } = e;
    if (dead[u] || dead[v] || stamp[u] !== e.su || stamp[v] !== e.sv) continue;
    if (!linkOK(u, v) || !foldOK(u, v)) { refused++; continue; }
    /* u goes into v */
    for (const f of vf[u]) {
      if (has(f, v)) {
        alive[f] = 0; faces--;
        for (let k = 0; k < 3; k++) {
          const w = F[f * 3 + k];
          if (w === u) continue;
          const list = vf[w], at = list.indexOf(f);
          if (at >= 0) list.splice(at, 1);
        }
      } else {
        for (let k = 0; k < 3; k++) if (F[f * 3 + k] === u) F[f * 3 + k] = v;
        vf[v].push(f);
      }
    }
    vf[u] = [];
    dead[u] = 1;
    if (border[u]) border[v] = 1;
    for (let k = 0; k < QN; k++) Q[v * QN + k] += Q[u * QN + k];
    W[v] += W[u];
    for (let k = 0; k < 3; k++) { NS[v * 3 + k] += NS[u * 3 + k]; CS[v * 3 + k] += CS[u * 3 + k]; }
    stamp[v]++;
    collapses++;
    /* every edge out of v costs something new now */
    neighbours.clear();
    for (const f of vf[v]) for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w !== v) neighbours.add(w); }
    for (const w of neighbours) consider(v, w);
  }
  const out = [];
  for (let f = 0; f < NF; f++) if (alive[f]) out.push(F[f * 3], F[f * 3 + 1], F[f * 3 + 2]);
  return { faces: out, collapses, refused, W, NS, CS };
}

/* ---- every group, to its share of the budget ----------------------- */
let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const g of groups.values())
  for (let i = 0; i < g.P.length; i += 3)
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], g.P[i + k]); hi[k] = Math.max(hi[k], g.P[i + k]); }
const diagonal = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);

const outGroups = [];
for (const [mat, g] of groups) {
  const P = Float64Array.from(g.P), F = Int32Array.from(g.F);
  const C = g.hasC ? Float64Array.from(g.C) : null;
  const N = g.hasN && NORMAL > 0 ? Float64Array.from(g.N) : null;
  const want = Math.max(4, Math.round(TARGET * (F.length / 3) / totalFaces));
  const t0 = Date.now();
  const r = decimate(P, C, N, F, want, COLOUR * diagonal, NORMAL * diagonal);
  /* compact: the vertices the surviving faces still use, in the order
     they are first used, which is also a fair order for a vertex cache */
  const map = new Int32Array(P.length / 3).fill(-1);
  const keep = [];
  const I = r.faces.map(i => { if (map[i] < 0) { map[i] = keep.length; keep.push(i); } return map[i]; });
  outGroups.push({ mat, g, keep, I, r });
  console.log(`  material ${mat}: ${F.length / 3} -> ${I.length / 3} triangles, ${P.length / 3} -> ${keep.length} vertices` +
              ` (${r.collapses} collapses, ${r.refused} refused, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

/* ---- write ---------------------------------------------------------- */
const accessors = [], bufferViews = [], parts = [];
let cursor = 0;
const place = (bytes, target) => {
  const pad = (4 - (cursor % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); cursor += pad; }
  bufferViews.push({ buffer: 0, byteOffset: cursor, byteLength: bytes.length, ...(target ? { target } : {}) });
  parts.push(bytes);
  cursor += bytes.length;
  return bufferViews.length - 1;
};
const floats = (values, n, withBox) => {
  const b = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) b.writeFloatLE(values[i], i * 4);
  const a = { bufferView: place(b, 34962), componentType: 5126, count: values.length / n, type: n === 3 ? 'VEC3' : 'VEC4' };
  if (withBox) {
    a.min = [Infinity, Infinity, Infinity]; a.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < values.length; i++) {
      /* the box of what was WRITTEN, float32 and all, so a reader that
         checks it against the bytes finds it exact */
      const v = b.readFloatLE(i * 4), k = i % 3;
      if (v < a.min[k]) a.min[k] = v;
      if (v > a.max[k]) a.max[k] = v;
    }
  }
  accessors.push(a);
  return accessors.length - 1;
};
const primitives = [];
for (const { mat, g, keep, I, r } of outGroups) {
  const attributes = {};
  attributes.POSITION = floats(keep.flatMap(i => [g.P[i * 3], g.P[i * 3 + 1], g.P[i * 3 + 2]]), 3, true);
  /* the patch's normal and the patch's paint — see the header */
  if (g.hasN) attributes.NORMAL = floats(keep.flatMap(i => {
    const x = r.NS[i * 3], y = r.NS[i * 3 + 1], z = r.NS[i * 3 + 2], l = Math.hypot(x, y, z);
    return l > 1e-12 ? [x / l, y / l, z / l] : [g.N[i * 3], g.N[i * 3 + 1], g.N[i * 3 + 2]];
  }), 3, false);
  if (g.hasC) for (const i of keep) if (r.W[i] > 0) for (let k = 0; k < 3; k++) g.C[i * 3 + k] = r.CS[i * 3 + k] / r.W[i];
  if (g.hasC) {
    /* EIGHT BITS A CHANNEL, which is what the palette snap will leave of
       it anyway, and a quarter of what Nomad wrote */
    const b = Buffer.alloc(keep.length * 4);
    keep.forEach((i, j) => { for (let k = 0; k < 3; k++) b[j * 4 + k] = Math.round(Math.max(0, Math.min(1, g.C[i * 3 + k])) * 255); b[j * 4 + 3] = 255; });
    /* a VEC3 of bytes is three bytes a vertex and a stride that is not a
       multiple of four, which glTF forbids on a vertex buffer; so the
       view keeps the fourth byte as padding and says so with a stride */
    const view = place(b, 34962);
    bufferViews[view].byteStride = 4;
    accessors.push({ bufferView: view, componentType: 5121, normalized: true, count: keep.length, type: 'VEC3' });
    attributes.COLOR_0 = accessors.length - 1;
  }
  const big = keep.length > 65535;
  const ib = Buffer.alloc(I.length * (big ? 4 : 2));
  I.forEach((v, i) => (big ? ib.writeUInt32LE(v, i * 4) : ib.writeUInt16LE(v, i * 2)));
  accessors.push({ bufferView: place(ib, 34963), componentType: big ? 5125 : 5123, count: I.length, type: 'SCALAR' });
  primitives.push({ attributes, indices: accessors.length - 1, ...(mat >= 0 ? { material: 0 } : {}), _mat: mat });
}
/* the materials the groups used, reduced to what an unlit renderer reads */
const matMap = new Map(), materials = [];
for (const pr of primitives) {
  const mat = pr._mat; delete pr._mat;
  if (mat < 0) continue;
  if (!matMap.has(mat)) {
    const m = json.materials[mat];
    const o = { name: m.name, doubleSided: m.doubleSided, pbrMetallicRoughness: {} };
    if (m.pbrMetallicRoughness?.baseColorFactor) o.pbrMetallicRoughness.baseColorFactor = m.pbrMetallicRoughness.baseColorFactor;
    if (m.alphaMode) o.alphaMode = m.alphaMode;
    matMap.set(mat, materials.length);
    materials.push(o);
  }
  pr.material = matMap.get(mat);
}
const binOut = Buffer.concat(parts);
const name = json.nodes.find(n => n.mesh !== undefined)?.name || 'model';
const out = {
  asset: {
    version: '2.0',
    generator: (json.asset.generator || '') + ' + tools/decimate-model.mjs',
    extras: { ...(json.asset.extras || {}), source: inFile.split('/').pop(), decimated: { from: totalFaces, colour: COLOUR, normal: NORMAL } },
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name, mesh: 0 }],
  meshes: [{ name, primitives }],
  materials,
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
const kb = n => (n / 1024).toFixed(0) + 'K';
console.log(`${outFile}: ${kb(buf.length)} -> ${kb(fs.statSync(outFile).size)}, ${totalFaces} -> ${outGroups.reduce((s, o) => s + o.I.length / 3, 0)} triangles`);
console.log(`  model box ${lo.map(v => v.toFixed(4)).join(', ')} .. ${hi.map(v => v.toFixed(4)).join(', ')}`);
