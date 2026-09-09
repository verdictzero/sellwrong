/* =====================================================================
   GROCERY STORE SIMULATOR — vehicles out of boxes, painted by projection
   =====================================================================

   The car park has been waiting for cars since the day it was laid out:
   `level.carSlots` has held a position, a heading and a variant for every
   bay since then. This is what fills them, and what it puts in one is not
   a model — it is a PICTURE OF ONE, four times, and the arithmetic that
   turns four pictures into a solid.

   WHAT ARRIVES is an orthographic turnaround on a green field: front,
   rear, side and plan. tools/prep-car.mjs measures it — see that file
   for how, it is the interesting half — and leaves js/car-data.js: for
   each vehicle its proportions, its outline off the side view, the width
   it has at every height off the front view, its wheels off the
   underside, and where each of its views sits in the shared atlas.

   WHAT THIS DOES is loft that outline across that width — one strip of
   quads round the silhouette and a fan on each flank — and then assign
   every UV by PROJECTION rather than by hand. For a triangle, look at its
   normal, take the axis it points most nearly along, and read the view
   that was drawn down that axis:

     pointing forward   the front view, at the y and z it is at
     pointing back      the rear view
     pointing sideways  the side view, at the x and z it is at
     pointing up        the plan view, at the x and y it is at
     pointing down      the plan view again, mirrored — nobody looks

   That is the whole of it. No unwrapping, no seams to place, no atlas
   authored by a person: the four views were parallel projections of the
   real thing, so projecting them straight back puts every pixel where it
   came from, and any geometry roughly the right shape gets painted
   roughly right. It is the reason a model can be forty triangles and still
   read as a vehicle — a light bar, a wheel arch, an eagle airbrushed
   down the flank of a van are all paint that lands where the shape says.

   The two views drawn down the same axis from opposite sides — left and
   right, up and down — share one picture, mirrored. A van is very nearly
   symmetric and Doom is not going to notice.

   AND IT IS WHY THE DEBRIS WORKS. When one of these goes up it comes
   apart into chunks, and a chunk is a small box cut out of the vehicle's
   own model space and put through exactly this function. A piece off the
   tail has the tail's paint on it, on every face, without anybody
   deciding what a torn piece of van looks like.

   WHY THE WHEELS SIT A FRACTION OF A UNIT INSIDE THE FLANKS rather than
   flush with them. Two faces at exactly the same depth is not a
   drawing order problem, it is a tie, and a tie in the depth buffer is
   the flicker you have already seen on the trees. Nothing here is ever
   exactly coplanar with anything else, so there is nothing to tie.

   LIGHT. This renderer does no shading: a surface is as bright as the
   map says, stepped down by distance, and that is all. A box lit that
   way is a silhouette — every face the same value, no edge anywhere. So
   the car borrows the trick the walls use, DOOM'S FAKE CONTRAST: a face
   looking north or south reads a notch brighter than one looking east or
   west. There is no sun and the nudge is the same at midnight; it exists
   so the corner between two faces is visible at all. The walls take it
   as a step, because Doom's walls are mostly on the grid; a car parked at
   a fifth of a radian is never on the grid, so here it is the same
   number, interpolated. The roof gets a lift on top of that — it is the
   face pointing at the floodlights — and the underside goes dark.

   A BURNT ONE takes the same two knobs every burnt thing in the game
   takes: its light comes down and its `charred` goes up, which is the
   attribute js/material.js scatters live coals across. So a wrecked car
   glows on the same clock as a gutted aisle and a burnt fir, because it
   is the same clock.
   ===================================================================== */

import * as THREE from 'three';
import { createWallMaterial } from './material.js';
import { CAR_ATLAS, VEHICLES, VEHICLE_IDS, CIVILIAN } from './car-data.js';

export { CAR_ATLAS, VEHICLES, VEHICLE_IDS, CIVILIAN };

const TREAD = 8;            // sides on a wheel — Doom would have used four
const LIP = 0.005;          // how far things sink into each other, in lengths
const ROOF_LIT = 1.12;      // the roof faces the floodlights
const UNDER_LIT = 0.40;     // and the underside faces the tarmac
const CONTRAST = 0.055;     // Doom's fake contrast, the same number js/level.js uses

/** One vehicle out of the fleet, by name, loudly if it is not there. */
export function vehicleOf(id) {
  const v = VEHICLES[id];
  if (!v) throw new Error(`no such vehicle: ${id} (have ${VEHICLE_IDS.join(', ')})`);
  return v;
}

/** How big it is, in game units. */
export const carLength = v => v.length;
export const carWidth = v => v.length * v.shape.width;
export const carHeight = v => v.length * v.shape.height;

/** The atlas as a texture. Nearest, and NO MIPMAPS: Doom point-sampled
 *  every texture at every distance, and the shimmer that gives a distant
 *  surface is not an artefact here, it is the look. */
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
   THE PROJECTION

   Model space: x is +0.5 at the nose and -0.5 at the tail, y is to the
   vehicle's left, z is 0 on the ground, and the unit is the vehicle's
   own length.

   Every view carries the WINDOW it covers — how high its bottom and top
   edges are, how far either side of the middle it reaches — so this is a
   straight remap of two coordinates and nothing has to be lined up by
   eye. The windows are not all the same, and that is the point: the
   three views agree about the vehicle's proportions to a few percent and
   disagree about where the vehicle sits inside its own frame, so
   tools/prep-car.mjs anchors the head-on views on the ROOF LINE rather
   than on their frames. Get that wrong — map frame to bounding box and
   have done with it — and the model's roof lands three percent up into a
   band where the head-on view has nothing but light bar, which paints a
   pale stripe along the top of the nose and the tail.
   --------------------------------------------------------------------- */
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

function uvOf(views, n, p) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  let r, iu, iv;
  if (ax >= ay && ax >= az) {
    /* looking the vehicle in the face, its left hand is on your right */
    r = n[0] > 0 ? views.front : views.rear;
    iu = (n[0] > 0 ? p[1] + r.half : r.half - p[1]) / (2 * r.half);
    iv = (r.z1 - p[2]) / (r.z1 - r.z0);
  } else if (ay >= az) {
    /* The side view is drawn nose to the left (tools/prep-car.mjs turns
       the ones that were not), so it runs against x — on BOTH flanks.
       The right flank used to take x the other way round, on the theory
       that a picture seen from the other side is mirrored. It is, but a
       face's coordinates are its own and do not care which side you are
       standing on: nose is nose. Reversed, the right flank of every
       vehicle had its tail's paint on its nose, which on a van is
       invisible and on a pickup is the cab at the back. */
    r = views.side;
    iu = 0.5 - p[0];
    iv = (r.z1 - p[2]) / (r.z1 - r.z0);
  } else {
    /* and the plan view nose to the left as well, with the vehicle's
       left hand at the bottom of the picture — the same on the underside,
       for the same reason as the flanks */
    r = views.top;
    iu = 0.5 - p[0];
    iv = (p[1] + r.half) / (2 * r.half);
  }
  return [(r.x + clamp01(iu) * r.w) / CAR_ATLAS.w, 1 - (r.y + clamp01(iv) * r.h) / CAR_ATLAS.h];
}

/* ---------------------------------------------------------------------
   THE PEN

   Everything drawn here is boxes, so this is the only thing that knows
   how to draw one: given a vehicle it hands back a `box` and the arrays
   it fills. The whole vehicle and one chunk of flying wreckage go
   through the same pen with different `origin`s, which is what makes the
   debris genuinely be pieces of the car rather than pieces of something
   that looks like it.
   --------------------------------------------------------------------- */
function pen(v, opts = {}) {
  const {
    angle = 0, length = v.length, light = 0.74, sky = 1, charred = 0,
    origin = [0, 0, 0],           // which point of the model the mesh is about
  } = opts;
  const views = v.views;
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
  const vert = (p, n, l) => {
    pos.push((p[0] - origin[0]) * length, (p[2] - origin[2]) * length, -(p[1] - origin[1]) * length);
    const t = uvOf(views, n, p);        // the UV is of where the piece CAME FROM
    uv.push(t[0], t[1]);
    lit.push(l); skies.push(sky); chars.push(charred);
    /* WHICH WAY THIS FACE WAS MEANT TO POINT. The shader lights nothing
       from a normal, so this never reaches the GPU; it is kept so the
       smoke test can hold every triangle's winding against what the
       builder intended for it, exactly. Working it out from the solid
       instead leaves any face buried inside the model undecidable, and
       every tyre's tread is buried under a wheel arch — which is how all
       sixty-four of them stayed inside out through a passing test. */
    norms.push(n[0], n[1], n[2]);
  };
  /* A triangle is emitted the way round that puts its front where the
     declared normal says. Working that out here, once, from the cross
     product, is what ended the era of a tyre tread being inside out on
     one side and the caps on the other: the builder says which way a
     face points, and the winding follows. */
  const tri = (a, b, c, n) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const l = faceLight(n);
    if (gx * n[0] + gy * n[1] + gz * n[2] >= 0) { vert(a, n, l); vert(b, n, l); vert(c, n, l); }
    else { vert(a, n, l); vert(c, n, l); vert(b, n, l); }
  };
  const face = (q, n) => { tri(q[0], q[1], q[2], n); tri(q[0], q[2], q[3], n); };

  /* six faces, wound so the outside is the front */
  const box = (x0, x1, y0, y1, z0, z1) => {
    face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
    face([[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], [-1, 0, 0]);
    face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0]);
    face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
    face([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1]);
  };

  return { box, face, tri, vert, faceLight, arrays: { position: pos, uv, light: lit, sky: skies, charred: chars, normal: norms } };
}

/**
 * Every triangle in one vehicle, as plain arrays — the renderer's
 * coordinates, but no renderer involved, so the smoke test can hold the
 * projection against the atlas without a GPU.
 *
 * @param v     one of VEHICLES
 * @param opts  the angle it is parked at, the light and sky of the
 *              sector it stands in, how burnt it is, and which point of
 *              the model the mesh should turn about
 */
export function carGeometry(v, opts = {}) {
  const s = v.shape;
  const P = pen(v, opts);

  /* THE BODY: the side view's outline, lofted across the width.

     The profile is a polygon in x and z — the silhouette above the sill,
     simplified to a dozen points, each carrying how far the vehicle
     reaches either side of its middle at that height, off the front
     view. Push every point out to +half on the left and -half on the
     right and you have two copies of the outline, one per flank; join
     them edge for edge round the outside and cap them and it is a
     closed solid whose cross-section follows the front view. A
     windscreen is a slope, a bonnet is a slope, the roof narrows the way
     a roof does, and it is one strip of quads and two fans.

     It replaced a staircase of boxes — the roof line split into steps,
     each step a box — which read as a stack of bricks with a car painted
     on, because that is what it was. */
  const O = s.profile, n = O.length;
  const L = O.map(p => [p[0], p[2], p[1]]), R = O.map(p => [p[0], -p[2], p[1]]);   // left, right
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    /* the outward normal of this edge of the outline, in x and z: the
       profile runs anticlockwise seen from the left, so it is the edge
       turned a quarter clockwise */
    const dx = O[j][0] - O[i][0], dz = O[j][1] - O[i][1], m = Math.hypot(dx, dz) || 1;
    P.face([L[i], L[j], R[j], R[i]], [dz / m, 0, -dx / m]);
  }
  /* the two flanks, off one ear-clipped triangulation of the outline —
     the same one for both, so the solid stays closed */
  const ears = THREE.ShapeUtils.triangulateShape(O.map(p => new THREE.Vector2(p[0], p[1])), []);
  for (const [a, b, c] of ears) {
    P.tri(L[a], L[b], L[c], [0, 1, 0]);
    P.tri(R[a], R[b], R[c], [0, -1, 0]);
  }

  /* THE WHEELS: a prism on its side, sitting on the ground, set a lip
     inside the body's flank so the arch hides its top the way an arch
     does. Its round faces get the side view — which is the wheel, drawn
     exactly there — and its tread gets whichever of the other views it
     happens to point at, which for a black tyre is close enough.

     The flank is the WIDEST THE PROFILE GETS and not half the
     vehicle's nominal width, because those are not the same number. The
     nominal width is the average of what three views claim; the profile is
     what the front view actually draws. On a van
     they agree to a thousandth. On the hatchback the nominal is the
     wider of the two, and taken literally it hangs both wheels a
     fraction of a unit PROUD of the bodywork — which, being a tie in the
     depth buffer along the length of the car, is the one thing this file
     is careful never to do. */
  if (s.wheels.length) {
    const flank = Math.min(s.width / 2, Math.max(...s.profile.map(p => p[2])));
    const yOut = flank - LIP, yIn = yOut - s.tyre;
    for (const wheel of s.wheels) {
      const { x: cx, r } = wheel;
      for (const side of [1, -1]) {
        const a = side > 0 ? yIn : -yOut, b = side > 0 ? yOut : -yIn;
        /* A ring of eight, turned half a step so the tyre stands on a
           FLAT rather than on a corner, and dropped by exactly the
           sagitta of that flat so the flat is on the tarmac. A wheel
           hovering a unit off the ground is the sort of thing you only
           see once. */
        const ring = [], cz = r * Math.cos(Math.PI / TREAD);
        for (let k = 0; k < TREAD; k++) {
          const th = (k + 0.5) * 2 * Math.PI / TREAD;
          ring.push([cx + r * Math.cos(th), cz + r * Math.sin(th)]);
        }
        for (let k = 0; k < TREAD; k++) {
          const p = ring[k], q = ring[(k + 1) % TREAD];
          const nx = (p[0] + q[0]) / 2 - cx, nz = (p[1] + q[1]) / 2 - cz;
          const m = Math.hypot(nx, nz) || 1;
          /* Far side of the prism first: the ring runs anticlockwise in
             the model's x-z plane, and a quad taken from the near edge
             round to the far one comes out facing INWARDS. The caps have
             always had this backwards on one side and said so; the tread
             had it backwards on both, invisibly, because a back-facing
             tyre in a dark car park is a black shape either way. */
          P.face([[p[0], b, p[1]], [q[0], b, q[1]], [q[0], a, q[1]], [p[0], a, p[1]]], [nx / m, 0, nz / m]);
        }
        /* the two round faces, as fans; the outer one is the one you see */
        for (const [yy, n] of [[b, [0, 1, 0]], [a, [0, -1, 0]]]) {
          const l = P.faceLight(n);
          for (let k = 1; k < TREAD - 1; k++) {
            const o = ring[0], p = ring[k], q = ring[k + 1];
            /* the ring runs anticlockwise seen from -y, so the +y cap
               takes it backwards to keep its front face out */
            if (n[1] > 0) { P.vert([o[0], yy, o[1]], n, l); P.vert([q[0], yy, q[1]], n, l); P.vert([p[0], yy, p[1]], n, l); }
            else { P.vert([o[0], yy, o[1]], n, l); P.vert([p[0], yy, p[1]], n, l); P.vert([q[0], yy, q[1]], n, l); }
          }
        }
      }
    }
  }

  return P.arrays;
}

/**
 * One torn-off piece, as a box cut out of the vehicle's own model space
 * and turned about its own middle.
 *
 * @param cut  { x0, x1, y0, y1, z0, z1 } in model units
 */
export function chunkGeometry(v, cut, opts = {}) {
  const mid = [(cut.x0 + cut.x1) / 2, (cut.y0 + cut.y1) / 2, (cut.z0 + cut.z1) / 2];
  const P = pen(v, { ...opts, origin: mid });
  P.box(cut.x0, cut.x1, cut.y0, cut.y1, cut.z0, cut.z1);
  return P.arrays;
}

/** Plain arrays to a geometry on the shared atlas. */
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
  const mesh = new THREE.Mesh(carGeom(a), createWallMaterial(texture, {}));
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
 * @param texture  the atlas, from carTexture()
 * @param v        one of VEHICLES
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
  const s = v.shape, h = s.width / 2, out = [];
  for (const x of [-0.5, 0.5]) for (const y of [-h, h]) for (const z of [0, s.height]) out.push([x, y, z]);
  return out;
}
