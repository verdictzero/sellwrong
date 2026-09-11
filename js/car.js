/* =====================================================================
   GROCERY STORE SIMULATOR — the vehicles, which are a model in a file
   =====================================================================

   The car park has been waiting for cars since the day it was laid out:
   `level.carSlots` has held a position and a heading for every bay since
   then. This is what fills them, and what it puts in one is a GLB — the
   user's van, as authored, triangles and UVs and texture and all.

   THERE WAS A WHOLE SYSTEM HERE and it is gone, at the user's request.
   It took a four-view turnaround on a green field — front, rear, side,
   plan — measured three silhouettes off it, built a body as the visual
   hull of those silhouettes, and then painted every triangle by
   PROJECTION: look at a face's normal, take the axis it points most
   nearly along, read the view that was drawn down that axis. It was a
   good answer to the question "how do you get a car out of four
   drawings", and it was the wrong answer to "how do you get a car out of
   a model", which is the question that was actually in front of it.

   Three rounds of trouble came out of that mismatch, and every one of
   them was the projection arguing with a file that already knew better:

     the flanks came out smeared, because the measurement that condemned
     the model's own UVs had pooled them with a second primitive's
     unused junk

     the vans came out inside out, because the projection reads a face's
     normal to choose its picture, so an inverted normal paints a panel
     with the picture of the opposite panel

     and then the vans came out with no bodywork, because the fix for
     that was a global winding reversal, and the mesh is two shells
     wound opposite ways

   None of it was the model's fault. It renders correctly in Blender and
   on Sketchfab. So now it is simply DRAWN: its own triangles, its own
   UVs, its own texture, both sides, nothing measured and nothing
   guessed. tools/prep-van.mjs still halves the texture and writes down
   the few things a GLB genuinely cannot say — which end is the nose,
   where the ground is, how long the thing is in metres, and where in the
   sheet the untextured primitive should point — and that is the whole of
   the preparation.

   WHAT IS LEFT IN HERE is the part that is about this GAME rather than
   about the model.

   BOTH SIDES. This renderer culls back faces; Blender and Sketchfab do
   not, so a model authored in them has never had to be consistent about
   winding. Ours are drawn double-sided, which costs the far face of a
   solid that already covers it and removes an entire class of argument.
   See carMesh.

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

   THE PIECES. When one of these goes up it comes apart into chunks, and
   a chunk is the model's own SURFACE inside a small box of its own model
   space, clipped to that box and recentred on it. So a piece off the
   tail has the tail's paint on it because it IS the tail. The old system
   cut a fresh box and projected the four views onto its six faces, which
   got small pieces for free; clipping is what that costs once the
   geometry is somebody else's, and the first attempt at avoiding it —
   whole triangles by centroid — sheds roof panels two thirds of the van
   long, because a whole van's body shell is 134 triangles.

   A BURNT ONE takes the same two knobs every burnt thing in the game
   takes: its light comes down and its `charred` goes up, which is the
   attribute js/material.js scatters live coals across. So a wrecked car
   glows on the same clock as a gutted aisle and a burnt fir, because it
   is the same clock.
   ===================================================================== */

import * as THREE from 'three';
import { createWallMaterial } from './material.js';
import { parseGLB, readAccessor } from './glb.js';

const ROOF_LIT = 1.12;      // the roof faces the floodlights
const UNDER_LIT = 0.40;     // and the underside faces the tarmac
const CONTRAST = 0.055;     // Doom's fake contrast, the same number js/level.js uses

/** How big it is, in game units. `box` is fractions of the length, so a
 *  vehicle has one scale and `length` sets it. */
export const carLength = v => v.length;
export const carWidth = v => v.length * v.box.half * 2;
export const carHeight = v => v.length * v.box.height;

/** The sheet out of the model. Nearest, and NO MIPMAPS: Doom
 *  point-sampled every texture at every distance, and the shimmer that
 *  gives a distant surface is not an artefact here, it is the look. */
export function carTexture(img) {
  const t = new THREE.Texture(img);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
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
  const pos = [], uv = [], lit = [], skies = [], chars = [], norms = [];
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
  const vert = (p, n, l, t) => {
    pos.push((p[0] - origin[0]) * length, (p[2] - origin[2]) * length, -(p[1] - origin[1]) * length);
    uv.push(t[0], t[1]);
    lit.push(l); skies.push(sky); chars.push(charred);
    /* WHICH WAY THIS FACE POINTS. The shader lights nothing from a
       normal, so this never reaches the GPU; it is kept so the smoke
       test can hold a triangle against what the model said about it. */
    norms.push(n[0], n[1], n[2]);
  };

  /* A triangle, in the order the model has it. The winding is NOT
     touched — see carMesh for why it no longer has to be. */
  const tri = (a, b, c, n, ta, tb, tc) => {
    const l = faceLight(n);
    vert(a, n, l, ta); vert(b, n, l, tb); vert(c, n, l, tc);
  };

  return {
    tri, vert, faceLight,
    arrays: { position: pos, uv, light: lit, sky: skies, charred: chars, normal: norms },
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
  for (const t of v.model.tris) P.tri(t.a, t.b, t.c, t.n, t.ta, t.tb, t.tc);
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
      P.tri(poly[0].p, poly[i].p, poly[i + 1].p, t.n, poly[0].t, poly[i].t, poly[i + 1].t);
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
    if (best) P.tri(best.a, best.b, best.c, best.n, best.ta, best.tb, best.tc);
  }
  return P.arrays;
}

/* ---------------------------------------------------------------------
   THE MODEL

   What arrives is a GLB with one mesh, two primitives and one image. The
   body primitive is textured and unwrapped onto that image; the other —
   glass, tyres, bumpers, chassis, 490 of the 624 triangles — has no
   texture at all, just a flat near-black base colour.

   A car park is ONE material and one draw call, so a second material is
   not available. Instead every vertex of the untextured primitive is
   pointed at one dark texel that tools/prep-van.mjs paints into a corner
   of the sheet. One texture, one draw call, and the tyres come out the
   colour tyres are.

   THE AXES ARE THE ONLY REAL WORK. A GLB says nothing about which end of
   a van is the front: this one lies along its Z with the nose at +Z and
   up at +Y, which was established by rendering four orthographic views
   of it and looking, and is recorded in the file by tools/prep-van.mjs.
   The swap (nose, left, up) <- (z, x, y) is a cyclic permutation, so it
   preserves handedness.

   glTF's v runs DOWN from the top of the image and a three.js texture is
   uploaded flipped, so v comes through as 1 - v.
   --------------------------------------------------------------------- */

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
  const im = json.images?.[0];
  if (im?.bufferView === undefined) throw new Error(`${url}: the texture is not in the buffer`);
  const bv = json.bufferViews[im.bufferView];
  const bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: im.mimeType }),
    { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  return { def, texture: carTexture(bitmap) };
}

export function modelVehicle(json, bin, opts = {}) {
  const ex = json.asset?.extras?.vehicle;
  if (!ex) throw new Error('the model has no asset.extras.vehicle — run tools/prep-van.mjs on it');
  if (!ex.black || !ex.sheet) throw new Error('the model has no dark texel — run tools/prep-van.mjs again');
  const prims = json.meshes[0].primitives;
  const s = 1 / (ex.length / ex.unit);        // model units -> fractions of the length
  const tris = [];
  /* where to point a triangle that has no texture of its own */
  const black = [ex.black.x / ex.sheet.w, 1 - ex.black.y / ex.sheet.h];

  for (const p of prims) {
    const pos = readAccessor(json, bin, p.attributes.POSITION).array;
    const idx = readAccessor(json, bin, p.indices).array;
    const at = i => [
      (pos[i * 3 + 2] - ex.centre) * s * ex.noseSign,     // along the length
      pos[i * 3] * s,                                     // to the left
      (pos[i * 3 + 1] - ex.ground) * s,                   // up off the tarmac
    ];
    const textured = !!json.materials?.[p.material]?.pbrMetallicRoughness?.baseColorTexture;
    const uvSrc = textured && p.attributes.TEXCOORD_0 !== undefined
      ? readAccessor(json, bin, p.attributes.TEXCOORD_0).array : null;
    const uvAt = i => (uvSrc ? [uvSrc[i * 2], 1 - uvSrc[i * 2 + 1]] : black);

    for (let t = 0; t < idx.length; t += 3) {
      const a = at(idx[t]), b = at(idx[t + 1]), c = at(idx[t + 2]);
      const ta = uvAt(idx[t]), tb = uvAt(idx[t + 1]), tc = uvAt(idx[t + 2]);
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const m = Math.hypot(n[0], n[1], n[2]);
      if (m < 1e-12) continue;                            // a degenerate triangle is nothing
      n = [n[0] / m, n[1] / m, n[2] / m];
      tris.push({ a, b, c, n, ta, tb, tc });
    }
  }
  if (!tris.length) throw new Error('the model has no triangles in it');

  /* ------------------------------------------------------------------
     ITS OWN BOX, measured rather than declared, because the collision
     and the tumble want a width and a height and the file has both of
     them in it. All in fractions of the length, which is 1 by
     construction: x runs from -0.5 at the tail to +0.5 at the nose.
     ------------------------------------------------------------------ */
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const p of [t.a, t.b, t.c]) for (let k = 0; k < 3; k++) {
    if (p[k] < bb[k]) bb[k] = p[k];
    if (p[k] > bb[3 + k]) bb[3 + k] = p[k];
  }
  const box = { half: Math.max(Math.abs(bb[1]), Math.abs(bb[4])), height: bb[5], sill: bb[2] };

  /* ------------------------------------------------------------------
     AND THE NORMALS TURNED OUTWARD, for the face light and for nothing
     else.

     The file's winding is left exactly as it is — the material draws
     both sides, so it does not matter — but the LIGHT does read a
     normal: Doom's fake contrast wants to know whether a face is a roof,
     an underside or a flank, and a roof triangle whose normal points
     down is given the tarmac's light, which is a third of the
     brightness. This model's two shells are wound opposite ways, so
     about three in five need turning.

     It is a HEURISTIC — away from the model's own centre — and that is
     exactly why it is used for the light alone. A triangle it guesses
     wrong about is one step of shading out on one face. It can no longer
     cull anything or choose anybody's paint, which is what made the same
     guess fatal when the projection depended on it.
     ------------------------------------------------------------------ */
  const c3 = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2];
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
    length: ex.length,
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
  g.computeBoundingSphere();
  return g;
}

/** And that geometry as a mesh. */
export function carMesh(texture, a) {
  /* BOTH SIDES, and this is the whole reason the van works. A model
     authored in Blender or shown on Sketchfab has never had to be
     consistent about winding, because neither of them culls: this one's
     body shell is wound inward and the chassis under it outward, and no
     single flip fixes both. Drawing both sides costs the far face of a
     solid that already covers it, and removes the question. */
  const mesh = new THREE.Mesh(carGeom(a), createWallMaterial(texture, { side: THREE.DoubleSide }));
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
