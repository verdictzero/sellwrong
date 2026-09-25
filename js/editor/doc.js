/* =====================================================================
   GROCERY STORE SIMULATOR — THE EDITOR'S MAP, AS A DOCUMENT
   =====================================================================

   What the editor edits, and what it hands the game. At the user's
   request the game has an editor now — SLADE and Ultimate Doom Builder
   are the workflow it is modelled on — and this file is the part of it
   that has no screen: the map as plain JSON, the undo stack over it,
   and the COMPILER that turns it into a Level the engine runs exactly as
   it runs the grid and the superstore.

   THE MODEL IS DOOM'S, WHERE DOOM'S IS RIGHT. A map is VERTICES, and
   SECTORS that are rings of vertex indices, and THINGS standing on
   them. A vertex two sectors share is ONE vertex: drag it and both
   sectors move, which is the whole of what makes vertex editing in a
   Doom editor feel like editing a building rather than a pile of
   polygons. Lines are not stored — a line is two consecutive vertices
   of a sector, and two sectors that run the same pair in opposite
   directions share it, which is what MapBuilder calls a doorway. What
   a line CAN carry (blocking, its own textures) is kept in `lines`,
   keyed by the pair.

   AND IT IS NOT DOOM'S WHERE THIS ENGINE IS MORE. Doom had one floor
   and one ceiling a sector, flat, and no objects that were not
   sprites. This engine has:

     STOREYS   a sector may have rooms stacked over it — a column, in
               js/level.js — so a building can have an upstairs
     SLOPES    a floor or a ceiling may TILT, as a plane through the
               middle of the sector
     PROPS     free boxes anywhere in 3D, with a bottom and a top that
               have nothing to do with any floor — the engine's
               `level.props`, the same thing the superstore's shelving
               details were drawn with

   so the document has those too, and the 3D view edits them.

   THE COMPILER does the two things a Doom editor does for you that
   this engine's MapBuilder does not:

     T-JUNCTIONS   MapBuilder welds two sectors into a doorway only
                   where they share BOTH ends of an edge. A room drawn
                   against half of a long wall shares a piece of that
                   wall and neither end of it, and would silently not be
                   joined. So every edge is split at every vertex that
                   lies on it, before MapBuilder sees it — which is what
                   js/maps/rectmap.js does for rectangles, done for any
                   shape.

     HOLES         a sector drawn entirely inside another — a pillar, a
                   pit, a raised platform — is, in Doom, simply a
                   sector with lines round it. Here a sector is one
                   ring of points and cannot have an island in it. So
                   the outer ring is BRIDGED to each inner one by a slit
                   of zero width: out along the bridge, round the
                   inside the other way, and back. The slit's two sides
                   weld to each other as a line with the same sector on
                   both sides — no wall, nothing to draw, nothing in the
                   way — and the point-in-polygon test the engine uses
                   is even-odd, so the hole is outside the outer sector
                   exactly as it should be.

   Nothing here touches the DOM, so tools/smoke-test.mjs compiles maps
   headless and holds them against the engine.
   ===================================================================== */

import { MapBuilder, planeSlope } from '../level.js';

export const DOC_FORMAT = 'gss-map';
export const DOC_VERSION = 1;

/* The things a map may place, and what each one is for the editor's
   palette. The keys are THING_TO_ACTOR in js/game.js, plus START. */
export const THING_TYPES = {
  START:      { name: 'Player start', color: '#4af', radius: 16, one: true },
  SHOPPER:    { name: 'Shopper', color: '#fc4', radius: 18 },
  TOWNIE:     { name: 'Townsperson', color: '#fa6', radius: 18 },
  TROLLEY:    { name: 'Trolley', color: '#aaa', radius: 16 },
  BOLLARD:    { name: 'Bollard', color: '#ddd', radius: 10 },
  FUELCAN:    { name: 'Fuel can', color: '#f44', radius: 10 },
  CRATE:      { name: 'Crate', color: '#c93', radius: 20 },
  LAMP:       { name: 'Ceiling lamp', color: '#ffe', radius: 12 },
  STREETLAMP: { name: 'Street lamp', color: '#ff8', radius: 10 },
  GRAVESTONE: { name: 'Gravestone', color: '#999', radius: 14 },
};

/* What a new sector is, until somebody says otherwise. */
export const SECTOR_DEFAULTS = {
  floor: 0, ceil: 256,
  floorTex: 'GRID', ceilTex: 'SKY', wallTex: 'GRIDWALL', upperTex: null, lowerTex: null,
  light: 0.72, outdoor: true, sky: 0, name: '',
};

/* ---------------------------------------------------------------------
   GEOMETRY, all of it plain and all of it in map units
   --------------------------------------------------------------------- */
const EPS = 0.5;                 // what counts as ON a line, in units

export function signedArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}

/** Even-odd, which is what the engine's own pointInPoly is. */
export function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** How far (x, y) is from the segment a-b, and how far along it. */
export function segDist(ax, ay, bx, by, x, y) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
  const px = ax + dx * t, py = ay + dy * t;
  return { d: Math.hypot(x - px, y - py), t };
}

function onBoundary(pts, x, y) {
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if (segDist(pts[j][0], pts[j][1], pts[i][0], pts[i][1], x, y).d < EPS) return true;
  }
  return false;
}

/** Proper crossing of a-b and c-d, not counting shared ends. */
function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Does this ring cross itself anywhere? A sector that does is a map
 *  error the engine would draw as something nobody meant. */
export function selfCrosses(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;             // neighbours round the end
      const c = pts[j], d = pts[(j + 1) % n];
      if (segCross(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1])) return true;
    }
  }
  return false;
}

/** Is ring `inner` strictly inside ring `outer` — every point of it
 *  inside and not one of them on the edge? That is a HOLE. A ring that
 *  touches the outer's edge is not; it has to be drawn round. */
export function strictlyInside(inner, outer) {
  for (const [x, y] of inner) {
    if (onBoundary(outer, x, y)) return false;
    if (!pointInPoly(outer, x, y)) return false;
  }
  /* and no edge of it leaves and comes back */
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i], b = inner[(i + 1) % inner.length];
    for (let j = 0; j < outer.length; j++) {
      const c = outer[j], d = outer[(j + 1) % outer.length];
      if (segCross(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1])) return false;
    }
  }
  return true;
}

export function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

export function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

/* ---------------------------------------------------------------------
   THE DOCUMENT
   --------------------------------------------------------------------- */

/** A blank map: one room, a start in it, the grid's floor and walls. */
export function newDoc(name = 'UNTITLED') {
  const d = {
    format: DOC_FORMAT, version: DOC_VERSION, name,
    vertices: [[0, 0], [1024, 0], [1024, 1024], [0, 1024]],
    sectors: [{ id: 1, verts: [0, 1, 2, 3], ...SECTOR_DEFAULTS, name: 'room' }],
    lines: {},
    things: [{ id: 1, type: 'START', x: 512, y: 256, angle: Math.PI / 2 }],
    props: [],
    world: defaultWorld(),
    nextId: 2,
  };
  return d;
}

/** What the world around a map is, when it does not say. The grid's
 *  own: nothing burns, nobody comes, the green sky. */
export function defaultWorld() {
  return {
    noBurn: true, noSquads: true, noCellFire: true,
    sky: { horizon: '#1d9a48', mid: '#06301a', zenith: '#000000', ground: '#05180c', midPow: 0.95 },
  };
}

/** THE GRID TEST AREA, as a document — the game's own current world,
 *  so opening the editor starts from what you have just been playing. */
export function gridDoc() {
  const F = 10240, mid = F / 2;
  const d = newDoc('THE GRID');
  d.vertices = [[0, 0], [F, 0], [F, F], [0, F]];
  d.sectors = [{ id: 1, verts: [0, 1, 2, 3], ...SECTOR_DEFAULTS, ceil: 1024, name: 'field' }];
  d.things = [{ id: 1, type: 'START', x: mid, y: mid - 512, angle: Math.PI / 2 }];
  /* a crowd, placed the same way js/maps/grid.js places it, in fewer
     numbers so the editor opens on a map that is quick to draw */
  let s = 20250924 >>> 0, id = 2;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const span = F * 0.66, edge = (F - span) / 2;
  for (let k = 0; k < 60; k++) {
    d.things.push({ id: id++, type: 'SHOPPER', x: Math.round(edge + rnd() * span), y: Math.round(edge + rnd() * span),
                    angle: rnd() * Math.PI * 2, variant: (rnd() * 17) | 0 });
  }
  d.nextId = id;
  return d;
}

/** A fresh id, unique within the document. */
export function takeId(doc) { return doc.nextId++; }

/** The key a line is kept under: its two vertices, smaller first. */
export const lineKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);

/** A sector's ring, as points. */
export function ringOf(doc, s) { return s.verts.map(i => doc.vertices[i]); }

/** Every line in the document: each distinct vertex pair round every
 *  sector, with the one or two sectors on it. */
export function linesOf(doc, parents = holeParents(doc)) {
  const map = new Map();
  doc.sectors.forEach((s, si) => {
    for (let i = 0; i < s.verts.length; i++) {
      const a = s.verts[i], b = s.verts[(i + 1) % s.verts.length];
      const k = lineKey(a, b);
      let l = map.get(k);
      if (!l) map.set(k, l = { key: k, a: Math.min(a, b), b: Math.max(a, b), sectors: [] });
      if (!l.sectors.includes(si)) l.sectors.push(si);
    }
  });
  /* A HOLE'S EDGE IS TWO-SIDED: the room it is cut out of is on the
     other side of it, although that room's own ring never runs along it */
  for (const l of map.values()) {
    if (l.sectors.length === 1 && parents[l.sectors[0]] >= 0) l.sectors.push(parents[l.sectors[0]]);
  }
  return [...map.values()];
}

/** For each sector, the index of the sector it is a hole in (the
 *  smallest one it is strictly inside), or -1. */
export function holeParents(doc) {
  const plain = doc.sectors.map(s => ringOf(doc, s));
  return plain.map((r, i) => {
    if (r.length < 3) return -1;
    let best = -1, ba = Infinity;
    plain.forEach((o, j) => {
      if (i === j || o.length < 3) return;
      const a = Math.abs(signedArea(o));
      if (a < ba && strictlyInside(r, o)) { ba = a; best = j; }
    });
    return best;
  });
}

/* ---------------------------------------------------------------------
   TIDYING: what an edit leaves behind
   --------------------------------------------------------------------- */

/** Weld vertices that have been dragged on top of each other, drop
 *  vertices nobody uses, drop degenerate sectors, and renumber. Returns
 *  the document it was given. Called after every edit that moves or
 *  deletes, which is what makes dragging one vertex onto another JOIN
 *  them, the way it does in a Doom editor. */
export function compact(doc, weld = 1) {
  const V = doc.vertices;
  /* weld: every vertex to the first one within `weld` of it */
  const to = V.map((_, i) => i);
  for (let i = 0; i < V.length; i++) {
    if (to[i] !== i) continue;
    for (let j = i + 1; j < V.length; j++) {
      if (to[j] !== j) continue;
      if (Math.abs(V[i][0] - V[j][0]) <= weld && Math.abs(V[i][1] - V[j][1]) <= weld) to[j] = i;
    }
  }
  for (const s of doc.sectors) {
    s.verts = s.verts.map(i => to[i]);
    /* two neighbours the same is a zero-length edge */
    s.verts = s.verts.filter((v, k, a) => v !== a[(k + 1) % a.length]);
  }
  doc.sectors = doc.sectors.filter(s => s.verts.length >= 3 &&
    Math.abs(signedArea(s.verts.map(i => V[i]))) > 1);
  /* keep only the vertices somebody uses, in order */
  const used = new Set();
  for (const s of doc.sectors) for (const v of s.verts) used.add(v);
  const remap = new Map();
  const nv = [];
  V.forEach((p, i) => { if (used.has(i) && to[i] === i) { remap.set(i, nv.length); nv.push([p[0], p[1]]); } });
  for (const s of doc.sectors) s.verts = s.verts.map(i => remap.get(i));
  /* line overrides follow their vertices, and go with them */
  const lines = {};
  for (const [k, v] of Object.entries(doc.lines || {})) {
    const [a, b] = k.split(',').map(Number);
    const na = remap.get(to[a]), nb = remap.get(to[b]);
    if (na !== undefined && nb !== undefined && na !== nb) lines[lineKey(na, nb)] = v;
  }
  doc.vertices = nv;
  doc.lines = lines;
  return doc;
}

/* ---------------------------------------------------------------------
   PROBLEMS: what the compiler will refuse or quietly get wrong, said
   out loud before it does
   --------------------------------------------------------------------- */
export function problemsOf(doc) {
  const out = [];
  const rings = doc.sectors.map(s => ringOf(doc, s));
  rings.forEach((r, i) => {
    const s = doc.sectors[i];
    if (r.length < 3) out.push({ kind: 'sector', id: s.id, msg: `sector ${s.id} has fewer than three corners` });
    else if (selfCrosses(r)) out.push({ kind: 'sector', id: s.id, msg: `sector ${s.id} crosses itself` });
    /* a ceiling AT the floor is not a mistake — it is how this engine
       makes a solid pillar (see MapBuilder.column's shut storeys); one
       BELOW the floor is */
    if (s.ceil < s.floor) out.push({ kind: 'sector', id: s.id, msg: `sector ${s.id} is inside out: its ceiling is below its floor` });
  });
  /* two sectors that overlap without one being inside the other: a room
     you could stand in two of at once */
  for (let i = 0; i < rings.length; i++) {
    for (let j = i + 1; j < rings.length; j++) {
      const a = rings[i], b = rings[j];
      if (strictlyInside(a, b) || strictlyInside(b, a)) continue;
      let crosses = false;
      for (let p = 0; p < a.length && !crosses; p++) {
        const a0 = a[p], a1 = a[(p + 1) % a.length];
        for (let q = 0; q < b.length; q++) {
          const b0 = b[q], b1 = b[(q + 1) % b.length];
          if (segCross(a0[0], a0[1], a1[0], a1[1], b0[0], b0[1], b1[0], b1[1])) { crosses = true; break; }
        }
      }
      if (crosses) out.push({ kind: 'sector', id: doc.sectors[i].id, msg: `sectors ${doc.sectors[i].id} and ${doc.sectors[j].id} overlap` });
    }
  }
  if (!doc.things.some(t => t.type === 'START')) out.push({ kind: 'map', msg: 'there is no player start' });
  for (const t of doc.things) {
    if (!rings.some(r => pointInPoly(r, t.x, t.y))) out.push({ kind: 'thing', id: t.id, msg: `${t.type} ${t.id} is outside every sector` });
  }
  return out;
}

/* ---------------------------------------------------------------------
   THE COMPILER
   --------------------------------------------------------------------- */

/** Every vertex of the document that lies on the open segment a-b, in
 *  order along it — where a T-junction has to be split. */
function splitsOn(V, ai, bi) {
  const [ax, ay] = V[ai], [bx, by] = V[bi];
  const out = [];
  for (let k = 0; k < V.length; k++) {
    if (k === ai || k === bi) continue;
    const [x, y] = V[k];
    const { d, t } = segDist(ax, ay, bx, by, x, y);
    if (d < EPS && t > 1e-6 && t < 1 - 1e-6) out.push({ k, t });
  }
  return out.sort((p, q) => p.t - q.t).map(p => p.k);
}

/**
 * THE BRIDGE: one ring with holes in it, as a single ring the engine can
 * take. Each hole is joined to the ring by a slit of zero width from its
 * rightmost point to the nearest point of the ring it can see; the hole
 * goes round the OTHER way from the ring, so the area it takes out is
 * taken out. The earcut method, done once, in the open.
 */
export function bridge(outer, holes) {
  let ring = signedArea(outer) > 0 ? outer.slice() : outer.slice().reverse();     // counter-clockwise
  /* rightmost holes first, so a later bridge never has to cross an
     earlier one */
  const hs = holes.map(h => (signedArea(h) < 0 ? h.slice() : h.slice().reverse()))  // clockwise
    .sort((a, b) => Math.max(...b.map(p => p[0])) - Math.max(...a.map(p => p[0])));
  for (const h of hs) {
    let hi = 0;
    for (let i = 1; i < h.length; i++) if (h[i][0] > h[hi][0]) hi = i;
    const [hx, hy] = h[hi];
    /* the nearest ring point it can see: nothing of the ring or of any
       hole in the way */
    let best = -1, bd = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const [rx, ry] = ring[i];
      const d = (rx - hx) ** 2 + (ry - hy) ** 2;
      if (d >= bd) continue;
      let blocked = false;
      const walls = [ring, ...hs];
      for (const w of walls) {
        for (let j = 0; j < w.length && !blocked; j++) {
          const a = w[j], b = w[(j + 1) % w.length];
          if (segCross(hx, hy, rx, ry, a[0], a[1], b[0], b[1])) blocked = true;
        }
        if (blocked) break;
      }
      if (!blocked) { bd = d; best = i; }
    }
    if (best < 0) best = 0;
    /* out along the slit, round the hole, and back */
    const round = [];
    for (let k = 0; k <= h.length; k++) round.push(h[(hi + k) % h.length]);
    ring = [...ring.slice(0, best + 1), ...round, ring[best], ...ring.slice(best + 1)];
  }
  return ring;
}

const texOr = (v, d) => (v === undefined || v === null || v === '' ? d : v);

/** A sector's properties, as MapBuilder wants them. */
function sectorProps(s, poly) {
  const [cx, cy] = centroid(poly);
  const p = {
    floor: s.floor ?? 0, ceil: s.ceil ?? 256,
    light: s.light ?? 0.72, ambient: s.light ?? 0.72,
    floorTex: texOr(s.floorTex, 'GRID'), ceilTex: texOr(s.ceilTex, 'SKY'),
    wallTex: texOr(s.wallTex, 'GRIDWALL'),
    upperTex: texOr(s.upperTex, texOr(s.wallTex, 'GRIDWALL')),
    lowerTex: texOr(s.lowerTex, texOr(s.wallTex, 'GRIDWALL')),
    outdoor: s.outdoor !== false, sky: s.sky ?? 0, fuel: 0, name: s.name || `sector ${s.id}`,
  };
  /* THE FLOOR OR CEILING MAY TILT: a plane through the middle of the
     sector at its own height, rising dzdx a unit east and dzdy a unit
     north. The simplest slope a person can type and the one a Doom
     editor's "slope" dialog asks for. */
  if (s.floorSlope && (s.floorSlope.dzdx || s.floorSlope.dzdy))
    p.slopeFloor = planeSlope(cx, cy, p.floor, s.floorSlope.dzdx || 0, s.floorSlope.dzdy || 0);
  if (s.ceilSlope && (s.ceilSlope.dzdx || s.ceilSlope.dzdy))
    p.slopeCeil = planeSlope(cx, cy, p.ceil, s.ceilSlope.dzdx || 0, s.ceilSlope.dzdy || 0);
  /* the floor's grid lines land on the map's own origin, so two sectors
     side by side run one grid across the seam */
  p.floorAnchor = [0, 0];
  return p;
}

/**
 * THE DOCUMENT, AS A LEVEL — the same Level js/maps/grid.js returns, so
 * the game runs it without knowing where it came from.
 *
 * @returns { level, problems, index } — `index[k]` is the Level sector
 *   index of document sector k (its ground storey), for the 3D view's
 *   picking to find its way back
 */
export function compileDoc(doc) {
  const problems = problemsOf(doc);
  const mb = new MapBuilder((doc.name || 'EDIT').slice(0, 16).toUpperCase());
  const V = doc.vertices;

  /* 1. every ring, split at every vertex lying on it */
  const rings = doc.sectors.map(s => {
    const out = [];
    for (let i = 0; i < s.verts.length; i++) {
      const a = s.verts[i], b = s.verts[(i + 1) % s.verts.length];
      out.push(a);
      for (const k of splitsOn(V, a, b)) out.push(k);
    }
    return out.map(i => V[i]);
  });
  /* the plain rings, for containment */
  const plain = doc.sectors.map(s => ringOf(doc, s));

  /* 2. which sectors are holes in which: a sector's DIRECT children are
     the ones strictly inside it and not strictly inside anything else
     that is strictly inside it */
  const inside = plain.map((r, i) => plain.map((o, j) => i !== j && strictlyInside(r, o)));
  const parentOf = plain.map((_, i) => {
    let best = -1, ba = Infinity;
    plain.forEach((o, j) => {
      if (!inside[i][j]) return;
      const a = Math.abs(signedArea(o));
      if (a < ba) { ba = a; best = j; }
    });
    return best;
  });

  /* 3. and every sector into the builder */
  const index = new Array(doc.sectors.length).fill(-1);
  doc.sectors.forEach((s, i) => {
    if (plain[i].length < 3 || selfCrosses(plain[i])) return;
    const holes = [];
    parentOf.forEach((p, j) => { if (p === i) holes.push(rings[j]); });
    const poly = holes.length ? bridge(rings[i], holes) : rings[i];
    const base = sectorProps(s, plain[i]);
    try {
      if (s.storeys?.length) {
        /* ROOM OVER ROOM: the ground storey and every one above it, one
           outline — see MapBuilder.column, which throws if they do not
           stack, and that is a problem worth reporting rather than a
           crash */
        const stack = [base, ...s.storeys.map(st => sectorProps({ ...s, ...st, floorSlope: st.floorSlope, ceilSlope: st.ceilSlope }, plain[i]))];
        index[i] = mb.column(poly, stack)[0];
      } else {
        index[i] = mb.sector(poly, base);
      }
    } catch (e) {
      problems.push({ kind: 'sector', id: s.id, msg: `sector ${s.id}: ${e.message}` });
    }
  });

  /* 4. the things */
  let started = false;
  for (const t of doc.things) {
    if (!THING_TYPES[t.type]) continue;
    if (t.type === 'START') { if (started) continue; started = true; }
    mb.thing(t.type, t.x, t.y, t.angle || 0, t.variant !== undefined ? { variant: t.variant } : {});
  }
  if (!started) {
    /* a map with no start is a map the game throws on — so it gets one,
       in the middle of the first sector, and the problem is reported */
    const r = plain.find(p => p.length >= 3);
    const [cx, cy] = r ? centroid(r) : [0, 0];
    mb.thing('START', cx, cy, 0);
  }

  if (!mb.sectors.length) {
    /* nothing drawable at all: a room, so the game has somewhere to be */
    mb.sector([[0, 0], [512, 0], [512, 512], [0, 512]], sectorProps({ id: 0 }, [[0, 0], [512, 0], [512, 512], [0, 512]]));
    problems.push({ kind: 'map', msg: 'the map has no sectors that can be built' });
  }

  const level = mb.build();

  /* 5. the line overrides: blocking, and a line's own textures */
  const byPair = new Map();
  for (const l of level.lines) {
    const a = level.verts[l.v1], b = level.verts[l.v2];
    byPair.set(`${a[0]},${a[1]}|${b[0]},${b[1]}`, l);
    byPair.set(`${b[0]},${b[1]}|${a[0]},${a[1]}`, l);
  }
  for (const [k, o] of Object.entries(doc.lines || {})) {
    const [ai, bi] = k.split(',').map(Number);
    const a = V[ai], b = V[bi];
    if (!a || !b) continue;
    const l = byPair.get(`${a[0]},${a[1]}|${b[0]},${b[1]}`);
    if (!l) continue;
    if (o.blocking) l.blocking = true;
    if (o.blockSight) l.blockSight = true;
    /* A LINE'S OWN TEXTURES, locked so the level's own reassignment
       (assignLineTextures, run again whenever a sector changes) keeps
       them: the middle of a one-sided wall, or the upper and lower
       steps of a two-sided one */
    if (o.wallTex || o.upperTex || o.lowerTex) {
      if (l.bands) {
        if (o.upperTex) l.upper = o.upperTex;
        if (o.lowerTex) l.lower = o.lowerTex;
        for (const bd of l.bands) bd.tex = bd.kind === 'upper' ? l.upper : l.lower;
        l.texLocked = true;
      } else if (o.wallTex && l.middle) {
        l.middle = o.wallTex;
        l.texLocked = true;
      }
    }
  }

  /* 6. and the world around it */
  const w = { ...defaultWorld(), ...(doc.world || {}) };
  level.noBurn = !!w.noBurn;
  level.noSquads = !!w.noSquads;
  level.noCellFire = !!w.noCellFire;
  level.sky = w.sky;
  level.carSlots = [];
  level.slideDoors = [];
  level.props = (doc.props || []).map(p => ({
    x0: Math.min(p.x0, p.x1), y0: Math.min(p.y0, p.y1), x1: Math.max(p.x0, p.x1), y1: Math.max(p.y0, p.y1),
    z0: Math.min(p.z0, p.z1), z1: Math.max(p.z0, p.z1),
    tex: p.tex || 'GRIDWALL', topTex: p.topTex || p.tex || 'GRIDWALL', light: p.light ?? 0.66, sky: 0,
  }));
  level.roofs = [];
  level.plants = [];
  level.forestRects = [];
  level.forestBounds = level.bounds;
  level.clearing = level.fireBounds;
  level.town = null;
  level.exits = [];
  level.roadEnds = [];
  level.boxes = [];
  const st = level.things.find(t => t.type === 'START');
  level.viewpoint = { x: st.x, y: st.y, angle: st.angle };
  const b = level.bounds;
  level.salesFloor = { x0: b[0], y0: b[1], x1: b[2], y1: b[3] };
  level.road = { y0: 0, y1: 0 };
  level.title = (doc.name || 'EDITED MAP').toUpperCase();
  level.field = { x0: b[0], y0: b[1], x1: b[2], y1: b[3], cell: 64, floor: 0, ceil: 1024 };
  level.fromEditor = true;

  return { level, problems, index };
}

/* ---------------------------------------------------------------------
   SAVING AND LOADING
   --------------------------------------------------------------------- */

/** The document as a file: JSON, with the format named so a file that
 *  is not one of ours is refused rather than half-loaded. */
export function serialise(doc) { return JSON.stringify(doc, null, 1); }

/** And back. Throws on anything that is not a map this editor wrote. */
export function parseDoc(text) {
  const d = JSON.parse(text);
  if (d.format !== DOC_FORMAT) throw new Error('not a gss-map file');
  if (!Array.isArray(d.vertices) || !Array.isArray(d.sectors)) throw new Error('the file has no vertices or sectors');
  d.lines = d.lines || {};
  d.things = d.things || [];
  d.props = d.props || [];
  d.world = { ...defaultWorld(), ...(d.world || {}) };
  let top = 1;
  for (const x of [...d.sectors, ...d.things, ...d.props]) top = Math.max(top, (x.id | 0) + 1);
  d.nextId = Math.max(d.nextId | 0, top);
  return d;
}

/* ---------------------------------------------------------------------
   UNDO

   Whole snapshots, which is the honest answer at this size: a map a
   person is drawing by hand is a few hundred vertices, a snapshot is a
   few kilobytes of JSON, and a stack of two hundred of them is nothing.
   Diffing would be cleverer and every clever undo is one edit away from
   restoring a map that never existed.
   --------------------------------------------------------------------- */
export class History {
  constructor(doc, cap = 200) {
    this.cap = cap;
    this.past = [];
    this.future = [];
    this.doc = doc;
    this.saved = serialise(doc);
  }

  /** Before an edit: remember the map as it is now. */
  push(label = '') {
    this.past.push({ label, text: serialise(this.doc) });
    if (this.past.length > this.cap) this.past.shift();
    this.future.length = 0;
  }

  undo() {
    const s = this.past.pop();
    if (!s) return null;
    this.future.push({ label: s.label, text: serialise(this.doc) });
    this.doc = parseDoc(s.text);
    return s.label || 'edit';
  }

  redo() {
    const s = this.future.pop();
    if (!s) return null;
    this.past.push({ label: s.label, text: serialise(this.doc) });
    this.doc = parseDoc(s.text);
    return s.label || 'edit';
  }

  get dirty() { return serialise(this.doc) !== this.saved; }
  markSaved() { this.saved = serialise(this.doc); }
}
