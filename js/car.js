/* =====================================================================
   GROCERY STORE SIMULATOR — the vehicles, which are a file
   =====================================================================

   The car park has been waiting for cars since the day it was laid out:
   `level.carSlots` has held a position and a heading for every bay since
   then. This is what fills them, and what it puts in one is a GLB —
   assets/models/van.glb, exactly as its author exported it.

   THERE IS NO PREPARATION STEP AND THERE IS NO LONGER A TOOL. Two whole
   systems have stood here and both are gone:

     a fleet of seven vehicles built as boxes out of a four-view
     turnaround and PAINTED BY PROJECTION — look at a face's normal, take
     the axis it points most nearly along, read the view drawn down that
     axis. A good answer to "how do you get a car out of four drawings"
     and the wrong answer to "how do you get a car out of a model"

     and then tools/prep-van.mjs, which took a model and rewrote it on
     the way in: halved its texture, snapped it to the game's 256
     colours, painted a black block into a corner of the sheet for the
     untextured triangles to point at, and wrote the axes it had measured
     into asset.extras so the game could read them back

   Neither is here. The file is loaded as it stands and drawn as it is
   authored: its own nodes, its own triangles, its own UVs, its own
   texture at its own size, its own sampler, its own material colours.
   Anything this cannot honour throws at load rather than quietly
   rendering something else, which is the same promise js/glb.js makes
   about the gun.

   WHAT THE FILE DOES NOT SAY, and what is decided here instead:

     HOW LONG A VAN IS IN GAME UNITS. A GLB has no scale the game can
     use, and everything else in this world is measured against Doom's
     ruler — a shopper is 62 tall, a bay is 186 across, the store's doors
     are 128 high. So VAN_LENGTH is a fact about the GAME, the model is
     scaled to it, and the car park's arithmetic does not move.

     WHICH WAY IT POINTS is not guesswork either, and used to be: glTF
     says +Y is up and that the front of an asset faces +Z, so the nose
     is +Z and the left flank is +X. The one thing checked rather than
     assumed is that the model is longest along +Z, because a van that is
     not is a van that was exported facing some other way, and the honest
     time to find that out is at load.

   WHAT IS LEFT IN HERE is the part that is about this GAME rather than
   about the model.

   BOTH SIDES. This renderer culls back faces; Blender and Sketchfab do
   not, so a model authored in them has never had to be consistent about
   winding, and this one's shell is wound INWARD — the van before it was
   two shells wound against each other, which no single flip fixes. Its
   material says `doubleSided` anyway. Ours are drawn double-sided, which
   costs the far face of a solid that already covers it and removes an
   entire class of argument. See carMesh.

   LIGHT. This renderer does no shading: a surface is as bright as the
   map says, stepped down by distance, and that is all. A solid lit that
   way is a silhouette — every face the same value, no edge anywhere. So
   the car borrows the trick the walls use, DOOM'S FAKE CONTRAST: a face
   looking north or south reads a notch brighter than one looking east or
   west. There is no sun and the nudge is the same at midnight; it exists
   so the corner between two faces is visible at all. The walls take it
   as a step, because Doom's walls are mostly on the grid; a car parked at
   a fifth of a radian is never on the grid, so here it is the same
   number, interpolated. The roof gets a lift on top of that — it is the
   face pointing at the floodlights — and the underside goes dark.

   INK, which is how a car park stays ONE draw call whatever a file
   brings. This van is one material and every triangle of it is on the
   sheet; the one before it was two, the body unwrapped and `van_black` —
   glass, tyres, bumpers, chassis, 490 of its 624 triangles — with no
   texture at all, just a flat baseColorFactor. A second material would
   be a second draw call per slab, so instead every vertex carries the
   colour ITS OWN material declared and a flag saying whether to use it,
   and js/material.js mixes between the sheet and that colour in the
   fragment shader. glTF's baseColorFactor is linear and an sRGB texture
   is decoded to linear on sample, so the two arrive in the same space
   and the number goes through untouched. With nothing in the lot using
   it the path is held up by a hand-built file in the smoke test, because
   the next model to arrive may well need it.

   THE PIECES. When one of these goes up it comes apart into chunks, and
   a chunk is the model's own SURFACE inside a small box of its own model
   space, clipped to that box and recentred on it. So a piece off the
   tail has the tail's paint on it because it IS the tail. The old system
   cut a fresh box and projected the four views onto its six faces, which
   got small pieces for free; clipping is what that costs once the
   geometry is somebody else's, and the first attempt at avoiding it —
   whole triangles by centroid — sheds roof panels two thirds of the van
   long, because the van it was written against had a body shell of 134
   triangles.

   A BURNT ONE takes the same two knobs every burnt thing in the game
   takes: its light comes down and its `charred` goes up, which is the
   attribute js/material.js scatters live coals across. So a wrecked car
   glows on the same clock as a gutted aisle and a burnt fir, because it
   is the same clock.
   ===================================================================== */

import * as THREE from 'three';
import { createWallMaterial } from './material.js';
import { parseGLB, readAccessor, GL_FILTER, GL_WRAP } from './glb.js';

const ROOF_LIT = 1.12;      // the roof faces the floodlights
const UNDER_LIT = 0.40;     // and the underside faces the tarmac
const CONTRAST = 0.055;     // Doom's fake contrast, the same number js/level.js uses

/* HOW LONG A VAN IS, in the game's units, and the one number in here
   that is about the game rather than about the file. The drawn fleet
   this replaced had its van at 174 nose to tail and every other length
   in the world is beside it, so the model is scaled to that number
   rather than to anything of its own. */
export const VAN_LENGTH = 174;

/* glTF's own axes: +Y is up and the front of an asset faces +Z, so the
   left flank is +X. (Spec, "Coordinate System and Units".) The game's
   own model space is x forward, y left, z up, which makes the swap a
   cyclic permutation — so it preserves handedness and nothing comes out
   mirrored. */
const NOSE = 2, LEFT = 0, UP = 1;

/** How big it is, in game units. `box` is fractions of the length, so a
 *  vehicle has one scale and `length` sets it. */
export const carLength = v => v.length;
export const carWidth = v => v.length * v.box.half * 2;
export const carHeight = v => v.length * v.box.height;

/**
 * The sheet out of the model, sampled the way the model asks to be
 * sampled — its own sampler, straight out of the file. Which for this
 * van is NEAREST magnified and nearest-mipmap-nearest minified, so it is
 * point-sampled at every distance and drops a level when it gets small,
 * and that is close enough to what the rest of the game does: Doom
 * point-sampled everything, and the shimmer that gives a distant surface
 * is not an artefact here, it is the look. A file that asked for
 * something else would get it. Where the file says nothing the glTF
 * spec's own default is used — REPEAT, not this renderer's habit — with
 * the one exception of the filters, which the spec leaves to the client
 * and this client answers with Doom's.
 *
 * AND THE IMAGE GOES UP THE WAY IT IS STORED. glTF puts v's origin at
 * the TOP-LEFT of the image and GL puts t's at the bottom, so somebody
 * has to turn it over: either the pixels on the way in or the v on the
 * way past. This is the same answer js/glb.js gives for the gun —
 * `flipY = false`, and the model's own v used untouched — and it is the
 * answer that works, because `flipY` is quietly IGNORED for an
 * ImageBitmap. Asking for the flip and then subtracting v to cancel it
 * looks symmetrical, costs nothing when both happen, and paints the
 * whole van with the wrong half of its sheet when only one does. See the
 * note on the v flip in modelVehicle.
 */
export function carTexture(img, sampler = {}) {
  const t = new THREE.Texture(img);
  t.magFilter = GL_FILTER[sampler.magFilter] ?? THREE.NearestFilter;
  t.minFilter = GL_FILTER[sampler.minFilter] ?? THREE.NearestFilter;
  t.wrapS = GL_WRAP[sampler.wrapS] ?? THREE.RepeatWrapping;      // glTF's own default
  t.wrapT = GL_WRAP[sampler.wrapT] ?? THREE.RepeatWrapping;
  t.generateMipmaps = t.minFilter !== THREE.NearestFilter && t.minFilter !== THREE.LinearFilter;
  t.flipY = false;                      // glTF's uv origin is the top-left
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ---------------------------------------------------------------------
   THE PEN

   Model space: x is +0.5 at the nose and -0.5 at the tail, y is to the
   vehicle's left, z is 0 on the ground, and the unit is the vehicle's
   own length. Out the other end: plain arrays in the renderer's
   coordinates, so the smoke test can hold every triangle against the
   model without a GPU anywhere.
   --------------------------------------------------------------------- */
function pen(v, opts = {}) {
  const {
    angle = 0, length = v.length, light = 0.74, sky = 1, charred = 0,
    origin = [0, 0, 0],           // which point of the model the mesh is about
  } = opts;
  const pos = [], uv = [], lit = [], skies = [], chars = [], norms = [], inks = [];
  const ca = Math.cos(angle), sa = Math.sin(angle);

  /* A face's light is decided by where it points once the car is parked,
     not by where it points in the model — the nudge is a fact about the
     compass, so it has to survive the heading. (A car in the air has
     stopped being on any compass bearing at all, and the tumble is fast
     enough that nobody reads its faces for direction; it keeps the light
     it was parked with, which is one less thing moving.) */
  const faceLight = n => {
    const wx = n[0] * ca - n[1] * sa, wy = n[0] * sa + n[1] * ca;
    if (n[2] > 0.5) return light * ROOF_LIT;
    if (n[2] < -0.5) return light * UNDER_LIT;
    return light + CONTRAST * (Math.abs(wy) - Math.abs(wx));
  };

  /* model space -> the renderer's, which is y-up with z running back */
  const vert = (p, n, l, t, ink) => {
    pos.push((p[0] - origin[0]) * length, (p[2] - origin[2]) * length, -(p[1] - origin[1]) * length);
    uv.push(t[0], t[1]);
    lit.push(l); skies.push(sky); chars.push(charred);
    /* WHAT THIS SURFACE IS PAINTED IF IT HAS NO PICTURE: its own
       material's baseColorFactor, and a 1 to say so. Zeroes mean the
       sheet, which is what the UVs are for. */
    inks.push(ink ? ink[0] : 0, ink ? ink[1] : 0, ink ? ink[2] : 0, ink ? 1 : 0);
    /* WHICH WAY THIS FACE POINTS. The shader lights nothing from a
       normal, so this never reaches the GPU; it is kept so the smoke
       test can hold a triangle against what the model said about it. */
    norms.push(n[0], n[1], n[2]);
  };

  /* A triangle, in the order the model has it. The winding is NOT
     touched — see carMesh for why it no longer has to be. */
  const tri = (a, b, c, n, ta, tb, tc, ink) => {
    const l = faceLight(n);
    vert(a, n, l, ta, ink); vert(b, n, l, tb, ink); vert(c, n, l, tc, ink);
  };

  return {
    tri, vert, faceLight,
    arrays: { position: pos, uv, light: lit, sky: skies, charred: chars, ink: inks, normal: norms },
  };
}

/**
 * Every triangle in one vehicle, as plain arrays.
 *
 * @param v     a vehicle definition from modelVehicle
 * @param opts  the angle it is parked at, the light and sky of the
 *              sector it stands in, how burnt it is, and which point of
 *              the model the mesh should turn about
 */
export function carGeometry(v, opts = {}) {
  const P = pen(v, opts);
  for (const t of v.model.tris) P.tri(t.a, t.b, t.c, t.n, t.ta, t.tb, t.tc, t.ink);
  return P.arrays;
}

/* ---------------------------------------------------------------------
   CLIPPED TO A BOX

   Sutherland-Hodgman against six planes, carrying the UVs along. Which
   sounds like more than a torn piece of van needs, and the alternative
   was tried first: take whole triangles whose CENTROID falls inside the
   cut. The body shell is 134 triangles for a whole van, so a roof panel
   is 115 units long — two thirds of the vehicle — and a van shedding
   fourteen of those is a van shedding fourteen vans.

   So the pieces are cut properly. A polygon crossing a plane gains a
   vertex on it, with its u and v interpolated the same way its position
   is, and what comes out is a fan. The old system got small pieces for
   free because it BUILT a box; this is what that costs once the geometry
   is somebody else's.
   --------------------------------------------------------------------- */
const PLANES = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];

function clipToBox(poly, lo, hi) {
  for (const [axis, sign] of PLANES) {
    if (poly.length < 3) return [];
    const limit = sign > 0 ? lo[axis] : hi[axis];
    /* inside is >= lo for a +1 plane and <= hi for a -1 one */
    const dist = v2 => sign * (v2.p[axis] - limit);
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = dist(a), db = dist(b);
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const f = da / (da - db);
        out.push({
          p: [a.p[0] + (b.p[0] - a.p[0]) * f,
              a.p[1] + (b.p[1] - a.p[1]) * f,
              a.p[2] + (b.p[2] - a.p[2]) * f],
          t: [a.t[0] + (b.t[0] - a.t[0]) * f, a.t[1] + (b.t[1] - a.t[1]) * f],
        });
      }
    }
    poly = out;
  }
  return poly;
}

/**
 * One torn-off piece: the model's own surface inside a box of its own
 * model space, clipped to that box and turned about its middle.
 *
 * If a cut catches nothing at all the nearest triangle goes in whole, so
 * a piece is never nothing: an empty chunk is an invisible thing with a
 * collision box, which is worse than a wrong one.
 *
 * @param cut  { x0, x1, y0, y1, z0, z1 } in model units
 */
export function chunkGeometry(v, cut, opts = {}) {
  const lo = [cut.x0, cut.y0, cut.z0], hi = [cut.x1, cut.y1, cut.z1];
  const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const P = pen(v, { ...opts, origin: mid });
  let n = 0;
  for (const t of v.model.tris) {
    /* the cheap rejection first: a triangle whose own box misses the cut
       cannot survive the clip, and most of them miss */
    let skip = false;
    for (let k = 0; k < 3 && !skip; k++) {
      const a = t.a[k], b = t.b[k], c = t.c[k];
      if (Math.min(a, b, c) > hi[k] || Math.max(a, b, c) < lo[k]) skip = true;
    }
    if (skip) continue;
    const poly = clipToBox([{ p: t.a, t: t.ta }, { p: t.b, t: t.tb }, { p: t.c, t: t.tc }], lo, hi);
    for (let i = 1; i + 1 < poly.length; i++) {
      P.tri(poly[0].p, poly[i].p, poly[i + 1].p, t.n, poly[0].t, poly[i].t, poly[i + 1].t, t.ink);
      n++;
    }
  }
  if (!n) {
    let best = null, bd = Infinity;
    for (const t of v.model.tris) {
      const dx = (t.a[0] + t.b[0] + t.c[0]) / 3 - mid[0];
      const dy = (t.a[1] + t.b[1] + t.c[1]) / 3 - mid[1];
      const dz = (t.a[2] + t.b[2] + t.c[2]) / 3 - mid[2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = t; }
    }
    if (best) P.tri(best.a, best.b, best.c, best.n, best.ta, best.tb, best.tc, best.ink);
  }
  return P.arrays;
}

/* ---------------------------------------------------------------------
   THE MODEL, AS IT ARRIVES

   A GLB is a scene graph, not a bag of triangles: this one hangs its one
   mesh off five nested nodes, two of which carry a quarter turn about X
   and undo each other. Ignoring that worked for a file whose net
   transform happened to be identity and would have parked a car park of
   vans on their sides the first time it was not, so the nodes are walked
   and their matrices multiplied through, the eight lines that costs.

   Nothing else is interpreted. Positions, UVs and indices come off the
   accessors as they are; the texture is decoded from the buffer by the
   browser; the material's flat colour, if it declares one, rides along
   as `ink`. glTF's v runs DOWN from the top of the image and the sheet
   is uploaded the way it is stored, so v comes through as it is.
   --------------------------------------------------------------------- */

/* 4x4 in glTF's column-major order, and only what a node tree wants. */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

/** A node's translation, rotation and scale as one matrix, for the nodes
 *  that give those instead of a matrix. */
function trs(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

const place = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/**
 * The van, from the file, ready to fill a car park with.
 *
 * Its texture comes out of the same file: the model is one
 * self-describing thing, so there is no second URL to keep in step and
 * no atlas coordinates written down anywhere.
 */
export async function loadVehicleModel(url, opts = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const { json, bin } = parseGLB(await res.arrayBuffer());
  const def = modelVehicle(json, bin, opts);
  const tx = json.textures?.[0];
  const im = json.images?.[tx?.source ?? 0];
  if (im?.bufferView === undefined) throw new Error(`${url}: the texture is not in the buffer`);
  const bv = json.bufferViews[im.bufferView];
  const bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: im.mimeType }),
    { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  return { def, texture: carTexture(bitmap, json.samplers?.[tx?.sampler]) };
}

/**
 * One vehicle definition out of a parsed GLB: its triangles in the
 * game's own model space, its box, and how long it is.
 *
 * Nothing is measured off a sheet and nothing is read out of
 * asset.extras, because nothing writes there any more.
 */
export function modelVehicle(json, bin, opts = {}) {
  const length = opts.length || VAN_LENGTH;

  /* ---- every primitive in the scene, with the transform its node
     carries. A mesh reached down two branches is drawn twice, which is
     what the file means by it. ------------------------------------- */
  const parts = [];
  const walk = (ni, parent) => {
    const n = json.nodes[ni];
    const local = n.matrix
      ? n.matrix
      : trs(n.translation || [0, 0, 0], n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]);
    const m = mul(parent, local);
    for (const p of (n.mesh !== undefined ? json.meshes[n.mesh].primitives : [])) parts.push({ p, m });
    for (const c of n.children || []) walk(c, m);
  };
  for (const ni of json.scenes[json.scene ?? 0].nodes) walk(ni, IDENTITY);

  const prims = parts.map(({ p, m }) => {
    if (p.mode !== undefined && p.mode !== 4) throw new Error('only triangle lists are supported');
    if (p.targets) throw new Error('morph targets are not supported');
    const src = readAccessor(json, bin, p.attributes.POSITION).array;
    const pos = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      const q = place(m, src[i], src[i + 1], src[i + 2]);
      pos[i] = q[0]; pos[i + 1] = q[1]; pos[i + 2] = q[2];
    }
    const idx = p.indices !== undefined
      ? readAccessor(json, bin, p.indices).array
      : Uint32Array.from({ length: src.length / 3 }, (_, i) => i);
    const mat = json.materials?.[p.material];
    const painted = !!mat?.pbrMetallicRoughness?.baseColorTexture && p.attributes.TEXCOORD_0 !== undefined;
    const uv = painted ? readAccessor(json, bin, p.attributes.TEXCOORD_0).array : null;
    /* A PRIMITIVE WITH NO PICTURE carries its material's own colour
       instead. baseColorFactor is linear, and so is what the GPU hands
       back from an sRGB texture, so it needs nothing doing to it. */
    const ink = painted ? null : (mat?.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1]).slice(0, 3);
    return { pos, idx, uv, ink };
  });
  if (!prims.length) throw new Error('the model has no meshes in its scene');

  /* ---- how big it is, and therefore the scale ---------------------- */
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const q of prims) for (let i = 0; i < q.pos.length; i += 3) for (let k = 0; k < 3; k++) {
    if (q.pos[i + k] < bb[k]) bb[k] = q.pos[i + k];
    if (q.pos[i + k] > bb[3 + k]) bb[3 + k] = q.pos[i + k];
  }
  const span = k => bb[3 + k] - bb[k];
  if (!(span(NOSE) > span(LEFT) && span(NOSE) > span(UP)))
    throw new Error('the model is not longest along +Z, so it is not facing the way glTF says it should');

  /* FRACTIONS OF THE LENGTH, not game units: a vehicle's triangles are
     all between -0.5 and +0.5 nose to tail, and `pen` multiplies by
     whatever length it is being drawn at. That is what lets a chunk be
     cut with a box written in sixteenths of a van. */
  const s = 1 / span(NOSE);
  /* the middle of the length, the middle of the width, and the bottom of
     the wheels: the point the game turns the van about and stands it on */
  const mid = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2];
  const at = (q, i) => [
    (q.pos[i * 3 + NOSE] - mid[NOSE]) * s,        // along the length
    (q.pos[i * 3 + LEFT] - mid[LEFT]) * s,        // to the left
    (q.pos[i * 3 + UP] - bb[UP]) * s,             // up off the tarmac
  ];

  /* ---- and every triangle in it ------------------------------------ */
  const tris = [];
  for (const q of prims) {
    /* THE MODEL'S OWN v, UNTOUCHED — see carTexture. The sheet is
       uploaded the way it is stored and glTF's v already runs down from
       the top of it, so there is nothing to cancel. This used to be
       `1 - v` against a `flipY` that never happened, and the only reason
       that stood was that the van it was written for had 134 textured
       triangles on a sheet of white bodywork: the flanks were being
       painted with the front view and it read as a slightly odd van. A
       model unwrapped all over shows it at once. */
    const uvAt = i => (q.uv ? [q.uv[i * 2], q.uv[i * 2 + 1]] : [0, 0]);
    for (let t = 0; t + 2 < q.idx.length; t += 3) {
      const ia = q.idx[t], ib = q.idx[t + 1], ic = q.idx[t + 2];
      const a = at(q, ia), b = at(q, ib), c = at(q, ic);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const mg = Math.hypot(n[0], n[1], n[2]);
      if (mg < 1e-12) continue;                           // a degenerate triangle is nothing
      n = [n[0] / mg, n[1] / mg, n[2] / mg];
      tris.push({ a, b, c, n, ta: uvAt(ia), tb: uvAt(ib), tc: uvAt(ic), ink: q.ink });
    }
  }
  if (!tris.length) throw new Error('the model has no triangles in it');

  /* ------------------------------------------------------------------
     ITS OWN BOX, in fractions of the length — which is 1 by
     construction, since x runs from -0.5 at the tail to +0.5 at the
     nose. The collision and the tumble want a width and a height and the
     file has both of them in it.
     ------------------------------------------------------------------ */
  const box = {
    half: span(LEFT) * s / 2,
    height: span(UP) * s,
    sill: 0,
  };

  /* ------------------------------------------------------------------
     AND THE NORMALS TURNED OUTWARD, for the face light and for nothing
     else.

     The file's winding is left exactly as it is — the material draws
     both sides, so it does not matter — but the LIGHT does read a
     normal: Doom's fake contrast wants to know whether a face is a roof,
     an underside or a flank, and a roof triangle whose normal points
     down is given the tarmac's light, which is a third of the
     brightness. This model's shell is wound inward, so about three in
     five need turning.

     It is a HEURISTIC — away from the model's own centre — and that is
     exactly why it is used for the light alone. A triangle it guesses
     wrong about is one step of shading out on one face. It can no longer
     cull anything or choose anybody's paint, which is what made the same
     guess fatal when the projection depended on it.
     ------------------------------------------------------------------ */
  const c3 = [0, 0, box.height / 2];
  let normalsTurned = 0;
  for (const t of tris) {
    const mx = (t.a[0] + t.b[0] + t.c[0]) / 3 - c3[0];
    const my = (t.a[1] + t.b[1] + t.c[1]) / 3 - c3[1];
    const mz = (t.a[2] + t.b[2] + t.c[2]) / 3 - c3[2];
    if (t.n[0] * mx + t.n[1] * my + t.n[2] * mz < 0) {
      t.n = [-t.n[0], -t.n[1], -t.n[2]];
      normalsTurned++;
    }
  }

  return {
    id: opts.id || 'van', name: opts.name || 'Van', use: 'civil',
    length,
    box,
    model: { tris, normalsTurned },
  };
}

/** Plain arrays to a geometry. */
export function carGeom(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setAttribute('light', new THREE.Float32BufferAttribute(a.light, 1));
  g.setAttribute('sky', new THREE.Float32BufferAttribute(a.sky, 1));
  g.setAttribute('charred', new THREE.Float32BufferAttribute(a.charred, 1));
  /* what an untextured surface is painted, and whether it is one */
  g.setAttribute('ink', new THREE.Float32BufferAttribute(a.ink, 4));
  g.computeBoundingSphere();
  return g;
}

/** And that geometry as a mesh. */
export function carMesh(texture, a) {
  /* BOTH SIDES, and this is the whole reason the van works. A model
     authored in Blender or shown on Sketchfab has never had to be
     consistent about winding, because neither of them culls: this one's
     shell is wound inward, the van before it was two shells wound
     against each other with no single flip that fixed both, and both of
     their materials say `doubleSided`. Drawing both sides costs the far
     face of a solid that already covers it, and removes the question. */
  const mesh = new THREE.Mesh(carGeom(a), createWallMaterial(texture, {
    side: THREE.DoubleSide,
    ink: true,                     // the flat material rides in the vertices
  }));
  /* Y then X then Z, applied in that order in the object's own frame:
     yaw it to its heading, roll it about its own length, then tip it
     nose over tail. Which is exactly the order a car leaves the ground
     in, and the reason js/vehicles.js can integrate three spin rates
     separately and have it look like tumbling rather than like gimbals. */
  mesh.rotation.order = 'YXZ';
  return mesh;
}

/**
 * One vehicle, as a mesh ready to be added to the scene.
 *
 * @param texture  the sheet, from carTexture()
 * @param v        a vehicle definition from modelVehicle
 * @param opts     x, y, z in game coordinates and the angle it is parked
 *                 at, plus whatever carGeometry wants
 */
export function buildCar(texture, v, opts = {}) {
  const { x = 0, y = 0, z = 0, angle = 0, origin = [0, 0, 0], length = v.length } = opts;
  const mesh = carMesh(texture, carGeometry(v, opts));
  mesh.name = 'car:' + v.id;
  mesh.position.set(x, z + origin[2] * length, -y);
  mesh.rotation.y = angle;
  return mesh;
}

/* ---------------------------------------------------------------------
   AND THE PART YOU CANNOT WALK THROUGH

   Doom's things are CYLINDERS — one radius, no rotation, however long
   the thing is — so a five and a half metre van is three of them in a
   row, which is the oldest trick in the format and still the right
   answer here. Three circles of half the vehicle's width, spaced along
   its length, leave the corners a few units short and the flanks a few
   units proud; a shopper brushing past reads that as a van rather than
   as a box, and the alternative is oriented boxes in a collision routine
   that has never needed one.
   --------------------------------------------------------------------- */
export const CAR_BLOCK_AT = [-0.31, 0, 0.31];       // along the length

export const carBlockRadius = v => Math.max(12, Math.round(carWidth(v) / 2));

export function carBlockers(v, x, y, angle, length = v.length) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return CAR_BLOCK_AT.map(t => ({ x: x + c * t * length, y: y + s * t * length }));
}

/* The eight corners of a vehicle's own box, in model units. What the
   tumble needs is the lowest one once the thing is turned over, and
   there is no cheaper honest way to know how high a car on its roof
   sits than to ask its own corners. */
export function carCorners(v) {
  const h = v.box.half, out = [];
  for (const x of [-0.5, 0.5]) for (const y of [-h, h]) for (const z of [0, v.box.height]) out.push([x, y, z]);
  return out;
}
