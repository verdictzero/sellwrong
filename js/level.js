/* =====================================================================
   GROCERY STORE SIMULATOR — the level: sectors, lines, and what you can walk into
   =====================================================================

   This is Doom's data model, because Doom's data model is right and
   thirty years of level editors have not improved on it.

     a SECTOR is a floor height, a ceiling height, a light level, and the
       textures on the floor and ceiling. It is a region, not a room —
       one room can be five sectors if bits of it are at different
       heights, and the checkout area here is exactly that.

     a LINE is a segment with a sector on one side or on both. One side
       and it is a wall. Two sides and it is a HOLE between two sectors,
       with a bit of wall above it (the gap between the two ceilings) and
       a bit of wall below it (the gap between the two floors). That one
       idea gives you doorways, windows, steps, counters, balconies and
       doors, without a single new concept.

     a THING is something standing somewhere. A zombie, a trolley, a
       spawn point.

   Everything follows. A door is a sector whose ceiling is on the floor
   and moves up. A shelf you can shoot over is a two-sided line whose
   lower part is 48 tall. A pallet you climb is a sector 24 higher than
   the one next to it, which the step-up rule lets you walk onto without
   even slowing down.

   AUTHORING. Writing linedefs by hand is miserable, so MapBuilder takes
   POLYGONS: you hand it the outline of a region and what is in it, and
   it works out the lines. When two regions share an edge it welds them
   into a two-sided line automatically — that is the whole trick, and it
   is why the map file at the bottom of this project reads like a floor
   plan instead of like a database dump.

   The one rule the author has to keep: if two regions share PART of an
   edge, both polygons need a vertex where the sharing starts and stops.
   A wall with a doorway in it is three edges, not one. Every Doom mapper
   who ever lived had to do the same thing.
   ===================================================================== */

import { pointInPoly, polyArea2, closestOnSeg, segIntersect, dist2, MAX_STEP, angleNorm } from './util.js';

/* Vertices that land within this of each other are the same vertex. Map
   coordinates are integers in practice, so this only ever catches float
   drift from a computed polygon. */
const WELD = 0.25;

/* --------------------------------------------------------------------
   A WALL IS WHERE TWO COLUMNS DISAGREE

   A COLUMN is a stack of sectors over one polygon — a ground floor, a
   first floor, a second — and every sector in the map that is not part
   of a house is a column of ONE, which is how the whole of the existing
   store keeps working without knowing the word.

   Doom had two sectors on a line and therefore exactly two surfaces,
   and called them the upper and the lower. With columns there can be
   three storeys on one side and open air on the other, and the honest
   statement of what to draw is:

     TAKE THE OPEN SPANS OF EACH COLUMN. THE WALL IS EVERY INTERVAL OF Z
     WHERE EXACTLY ONE OF THEM IS OPEN. WHERE BOTH ARE OPEN IS A HOLE
     AND WHERE NEITHER IS, THERE IS NOTHING TO DRAW.

   Run that over a column of one against a column of one and Doom's two
   surfaces fall out of it, because the interval above the lower ceiling
   IS the upper and the interval below the higher floor IS the lower.
   The smoke test holds exactly that, line by line, over the whole store.

   THE TEXTURE COMES FROM THE COLUMN THAT IS SHUT. You are looking at
   the face of whatever is in the way, not at the room you are standing
   in — which is Doom's own rule ("a step's face belongs to the thing
   that is raised") stated so that it survives having more than one
   thing to be raised above.
   ------------------------------------------------------------------ */

const ZEPS = 1e-6;

/* --------------------------------------------------------------------
   A SLOPE

   A sector engine cannot slope a floor, which is the sentence TOWN.txt
   wrote its roofs around: a pitched roof was GEOMETRY over a footprint,
   two quads and two triangles pushed into a batch, and nothing in the
   engine knew it was there. You could walk through one. You could shoot
   through one. The gunship flew through one.

   So a sector's floor or ceiling may be a HEIGHT OVER THE SECTOR rather
   than a number. Two kinds and no more:

     PLANE   z = az + dzdx (x - ax) + dzdy (y - ay)
     GABLE   two planes meeting at a ridge — which is a roof, and is the
               one shape a plane cannot do

   `floor` and `ceil` survive as the numbers they always were, and they
   are the SAFE end of the slope: a sloped floor's `floor` is its lowest
   point and a sloped ceiling's `ceil` is its highest. Everything written
   before there were slopes reads those, and what it gets is the answer
   that never claims more room than there is — which is what a fire
   grid, a light, a sprite and a sound all want. The code that has to be
   exact asks floorAt and ceilAt.
   ------------------------------------------------------------------ */

/** z = az at (ax, ay), sloping by dzdx and dzdy. */
export function planeSlope(ax, ay, az, dzdx, dzdy) {
  return { kind: 'plane', ax, ay, az, dzdx, dzdy,
           lo: null, hi: null };
}

/**
 * A ROOF. `axis` is the one the ridge RUNS ALONG, `mid` is where the
 * ridge is on the other axis, `half` is how far the eaves are from it,
 * `base` is the height at the eaves and `rise` how much higher the
 * ridge is. Outside the eaves it stays at base, so a sector that
 * overhangs its own roof does not go on falling for ever.
 */
export function gableSlope(axis, mid, half, base, rise) {
  return { kind: 'gable', axis, mid, half: Math.max(1, half), base, rise,
           lo: base, hi: base + rise };
}

/** The height of a slope at a point. */
export function slopeAt(sl, x, y) {
  if (sl.kind === 'gable') {
    const u = sl.axis === 'x' ? y : x;          // across the ridge
    const d = Math.min(1, Math.abs(u - sl.mid) / sl.half);
    return sl.base + sl.rise * (1 - d);
  }
  return sl.az + sl.dzdx * (x - sl.ax) + sl.dzdy * (y - sl.ay);
}

/** The lowest and highest a slope gets over a polygon. */
function slopeRange(sl, poly) {
  if (sl.lo !== null && sl.hi !== null) return [sl.lo, sl.hi];
  let lo = Infinity, hi = -Infinity;
  for (const [x, y] of poly) {
    const z = slopeAt(sl, x, y);
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  return [lo, hi];
}

/** The open spans of a column, bottom-up. A storey with its ceiling on
 *  its floor — a shut door — is open nowhere and contributes nothing. */
function openSpans(col) {
  const out = [];
  for (let i = 0; i < col.length; i++) if (col[i].ceil - col[i].floor > ZEPS) out.push(col[i]);
  out.sort((a, b) => a.floor - b.floor);
  return out;
}

/** Which span of this column covers z, or null if none does. */
function spanCovering(spans, z) {
  for (let i = 0; i < spans.length; i++)
    if (z >= spans[i].floor && z <= spans[i].ceil) return spans[i];
  return null;
}

/**
 * The bands of one line: every interval where exactly one column is
 * open, and every interval where both are (a hole, for the middle
 * texture to stand in).
 *
 * `kind` is which of Doom's two names the band would have had. A band
 * whose top is some storey's FLOOR is that storey's lower — the face of
 * the step up into it. A band whose bottom is some storey's CEILING is
 * that storey's upper — the header hanging under it. The deck between
 * two storeys of a house answers to both and is taken as a lower, which
 * is the same answer Doom gives for a kerb.
 */
export function lineBands(Fall, Ball) {
  const F = openSpans(Fall), B = openSpans(Ball);
  /* EVERY CUT REMEMBERS WHOSE SURFACE IT IS. A band's two edges are two
     of these, and where one of them is a sloped ceiling the drawing has
     to ask that ceiling at the point rather than take the flat number —
     see bandEdges in js/mapgeo.js. The first cut of this took the shut
     storey's floor for every lower band's top, which is right for a
     step and wrong for a window recess under a roof: the band from the
     sill to the head came out as a sheet of brick from the sill to the
     eaves, over every window in the town. */
  const cuts = [];
  for (let i = 0; i < F.length; i++) { cuts.push({ z: F[i].floor, s: F[i], which: 'floor' }, { z: F[i].ceil, s: F[i], which: 'ceil' }); }
  for (let i = 0; i < B.length; i++) { cuts.push({ z: B[i].floor, s: B[i], which: 'floor' }, { z: B[i].ceil, s: B[i], which: 'ceil' }); }
  cuts.sort((a, b) => a.z - b.z);
  /* of the cuts at one height, the one that bounds this band: the open
     storey's own surface first, then the shut one's, then whichever */
  const edgeAt = (k, open, from) => {
    const z = cuts[k].z;
    let best = cuts[k];
    for (let j = 0; j < cuts.length; j++) {
      if (Math.abs(cuts[j].z - z) > ZEPS) continue;
      if (cuts[j].s === open) return cuts[j];
      if (cuts[j].s === from) best = cuts[j];
    }
    return best;
  };
  const bands = [], holes = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const z0 = cuts[i].z, z1 = cuts[i + 1].z;
    if (z1 - z0 <= ZEPS) continue;
    const m = (z0 + z1) / 2;
    const f = spanCovering(F, m), b = spanCovering(B, m);
    if (f && b) { holes.push({ z0, z1, front: f, back: b }); continue; }
    if (!f && !b) continue;
    /* THE FACE OF WHATEVER IS IN THE WAY. Searched over the shut
       column's whole stack and not over its open spans, because the
       commonest thing in the way is a SHUT DOOR — a storey with its
       ceiling on its floor, open nowhere, and still the surface you
       are looking at. */
    const open = f || b, shut = f ? Ball : Fall;
    let from = null, kind = 'lower';
    for (let k = 0; k < shut.length; k++) if (Math.abs(shut[k].floor - z1) <= ZEPS) { from = shut[k]; kind = 'lower'; break; }
    if (!from) for (let k = 0; k < shut.length; k++) if (Math.abs(shut[k].ceil - z0) <= ZEPS) { from = shut[k]; kind = 'upper'; break; }
    if (!from) {
      /* the band is clear of the shut column altogether — below all of
         it or above all of it, which is what a one-storey shed next to
         a three-storey house gives above the shed's own roof */
      let lowest = shut[0], highest = shut[0];
      for (let k = 1; k < shut.length; k++) {
        if (shut[k].floor < lowest.floor) lowest = shut[k];
        if (shut[k].ceil > highest.ceil) highest = shut[k];
      }
      if (z1 <= lowest.floor + ZEPS) { from = lowest; kind = 'lower'; }
      else { from = highest; kind = 'upper'; }
    }
    bands.push({ z0, z1, open, from, kind, openFront: !!f,
                 e0: edgeAt(i, open, from), e1: edgeAt(i + 1, open, from) });
  }
  return { bands, holes };
}

/**
 * Decide every wall's texture from the geometry.
 *
 * Doing this from the heights rather than as each line is created is not
 * tidying. The first version took the texture from whichever sector
 * happened to claim the line second, which meant an aisle had shelving
 * down one side and blank plaster down the other, and which side got
 * which depended on the order two rectangles appeared in the map file.
 *
 * It runs again at RUNTIME whenever a sector changes its skin, which is
 * what lets a gondola that has burnt out turn charred on both faces
 * without the map having to know anything about fire.
 *
 * `l.upper` and `l.lower` survive as the names the map file reaches in
 * by — a shop window locks its upper to glass — and are the first band
 * of each kind. `l.bands` is what actually gets drawn.
 */
export function assignLineTextures(lines, sectors) {
  for (const l of lines) {
    const fc = l.frontCol, bc = l.backCol;
    if (!fc.length || !bc.length) {
      const s = sectors[(fc.length ? fc : bc)[0]];
      l.bands = null; l.holes = null;
      if (s && l.middle !== null && !l.texLocked) l.middle = s.wallTex;
      continue;
    }
    const F = fc.map(i => sectors[i]), B = bc.map(i => sectors[i]);
    const { bands, holes } = lineBands(F, B);
    l.bands = bands; l.holes = holes;
    for (let i = 0; i < bands.length; i++) {
      const bd = bands[i];
      bd.tex = l.texLocked
        ? (bd.kind === 'upper' ? l.upper : l.lower)
        : (bd.kind === 'upper' ? bd.from.upperTex : bd.from.lowerTex);
    }
    if (l.texLocked) continue;
    /* The summary, for the map file and for everything written before
       there were columns. With no band of a kind the surface has no
       height and nothing draws it, so the old formula stands in — it is
       this rule's two-sectors-of-one-storey case. */
    const f = sectors[fc[0]], b = sectors[bc[0]];
    const up = bands.find(x => x.kind === 'upper'), lo = bands.find(x => x.kind === 'lower');
    l.upper = up ? up.tex : (f.ceil <= b.ceil ? f : b).upperTex;
    l.lower = lo ? lo.tex : (f.floor >= b.floor ? f : b).lowerTex;
  }
}

export class MapBuilder {
  constructor(name = 'MAP01') {
    this.name = name;
    this.verts = [];        // [x, y] in map space
    this._vkey = new Map();
    this.sectors = [];
    this.lines = [];
    this._edges = new Map();
    this._sectorLines = new Map();
    this.things = [];
    /* Three columns meeting on one edge, which is a map error with no
       honest answer. Counted rather than thrown so a bad rect cannot
       stop the level building; the smoke test holds it at zero. */
    this.edgeConflicts = 0;
  }

  vertex(x, y) {
    /* Snap to the weld grid to build the key, so two callers who computed
       the same corner slightly differently still land on one vertex. */
    const kx = Math.round(x / WELD), ky = Math.round(y / WELD);
    const key = kx + ',' + ky;
    const hit = this._vkey.get(key);
    if (hit !== undefined) return hit;
    const i = this.verts.length;
    this.verts.push([x, y]);
    this._vkey.set(key, i);
    return i;
  }

  /**
   * Add a region.
   *
   * poly    array of [x,y] in map space, in any winding — we fix it
   * props   floor, ceil, light, floorTex, ceilTex, wallTex, plus anything
   *         the game wants to hang off a sector (fuel, name, tag…)
   *
   * Returns the sector index.
   */
  sector(poly, props = {}) {
    /* Force counter-clockwise. Everything downstream — which side of a
       line a sector is on, which way a floor triangle faces — depends on
       knowing the winding, and the cheapest place to know it is here. */
    const pts = polyArea2(poly) < 0 ? poly.slice().reverse() : poly.slice();

    const idx = this.sectors.length;
    const s = {
      index: idx,
      /* WHICH COLUMN THIS IS A STOREY OF — the ground sector's index, and
         its own for the thousand sectors that are a column of one. Set
         before the ring below is walked, because _edge sorts the storeys
         of one column onto one side of a line by it. */
      colBase: props.__colBase ?? idx,
      storey: props.__storey ?? 0,
      above: null, below: null,
      floor: props.floor ?? 0,
      ceil: props.ceil ?? 128,
      light: props.light ?? props.ambient ?? 0.75,
      /* What this region is lit to with every fitting in it broken —
         emergency lighting, daylight through the front, the glow off a
         chiller. Game.relight() adds the working lamps back on top, so
         shooting one out actually takes light away. */
      ambient: props.ambient ?? props.light ?? 0.75,
      floorTex: props.floorTex ?? 'FLAT',
      /* WHERE THE FLOOR TEXTURE STARTS. Normally nowhere: a floor tiles
         from the world origin, which is right for tarmac and lino and
         anything else with no features to line up. A texture whose
         REPEAT MEANS SOMETHING is different — BAYROW is one parking bay,
         186 by 180, with the line down its left edge — and tiling that
         from the origin puts the bay lines wherever world zero happens
         to fall, which was five units off the middle of every bay in the
         car park. Give the sector its own origin and the bays start
         where the row starts. */
      floorAnchor: props.floorAnchor ?? null,
      ceilTex: props.ceilTex ?? 'FLAT',
      poly: pts,
      vidx: pts.map(p => this.vertex(p[0], p[1])),
      wallTex: props.wallTex ?? 'WALL',
      upperTex: props.upperTex ?? props.wallTex ?? 'WALL',
      lowerTex: props.lowerTex ?? props.wallTex ?? 'WALL',
      tag: props.tag ?? 0,
      name: props.name ?? '',
      /* the game's own business, carried along for the ride */
      fuel: props.fuel ?? 0,          // how well this region burns
      outdoor: !!props.outdoor,
      /* How much of this region's light arrives from the sky rather than
         from a fitting. Drives the distance falloff, so a car park does
         not diminish like a corridor. Defaults to the outdoor answer;
         set it by hand for the in-between cases — under a canopy, or a
         doorway with daylight coming through it. */
      sky: props.sky ?? (props.outdoor ? 1 : 0),
      dynamic: !!props.dynamic,       // a door or lift — geometry rebuilt at runtime
      /* The wood round the outside. Walkable and outdoors like the lot,
         but no floor is drawn for it (js/forest.js draws its own, one
         that can char) and the store's fuel grid stops at its edge. */
      forest: !!props.forest,
      /* The road where it runs out through the wood: walkable and drawn
         like the lot, but not the store's business for the fuel grid. */
      outside: !!props.outside,
      special: props.special ?? null,
      /* a wall this region shares with the one next door, which fire
         gets through in the end — see _linkCells in js/fire.js */
      party: !!props.party,
      /* A SLOPE, if this region has one. See the block above: `floor`
         and `ceil` are corrected below to the safe end of it. */
      slopeFloor: props.slopeFloor ?? null,
      slopeCeil: props.slopeCeil ?? null,
      /* AND WHAT A SLOPED CEILING LOOKS LIKE FROM ABOVE. A ceiling is
         drawn facing down and nothing else in this engine has ever
         wanted otherwise, because nothing else was the top of a
         building. A roof is: one more pass over the same triangles,
         wound the other way, wearing this. */
      roofTex: props.roofTex ?? null,
      bbox: null,
    };
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [x, y] of pts) {
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    s.bbox = [minx, miny, maxx, maxy];
    /* THE SAFE END OF EACH SLOPE. A sloped floor is at its LOWEST where
       anything flat asks, and a sloped ceiling at its HIGHEST, so
       nothing that was written before slopes existed can be told there
       is less room than there is. */
    if (s.slopeFloor) s.floor = slopeRange(s.slopeFloor, pts)[0];
    if (s.slopeCeil) s.ceil = slopeRange(s.slopeCeil, pts)[1];
    this.sectors.push(s);

    /* Walk the ring. The sector is on the LEFT of every edge, because the
       ring is counter-clockwise. */
    const n = s.vidx.length;
    for (let i = 0; i < n; i++) this._edge(s.vidx[i], s.vidx[(i + 1) % n], idx, props);
    return idx;
  }

  /**
   * `sectorOnLeft` is on the left of a->b.
   *
   * Doom's convention is that a line's FRONT side is the one on its
   * right, so the line gets stored running b->a and this sector becomes
   * its front. If the edge already exists, the other sector got here
   * first and this one is the back.
   */
  _edge(a, b, sectorOnLeft, props) {
    const base = this.sectors[sectorOnLeft].colBase;
    const key = a < b ? a + ':' + b : b + ':' + a;
    const existing = this._edges.get(key);
    if (!existing) {
      const line = {
        index: this.lines.length,
        v1: b, v2: a,
        /* front and back are the GROUND sectors, which is what they
           always were; frontCol and backCol are the whole columns,
           bottom-up, and are a list of one nearly everywhere. */
        front: sectorOnLeft, back: null,
        frontCol: [sectorOnLeft], backCol: [],
        frontBase: base, backBase: null,
        upper: null, middle: props.wallTex ?? 'WALL', lower: null,
        bands: null, holes: null,
        blocking: false,        // forced solid even when two-sided
        blockSight: false,      // stops monsters seeing through a two-sided line
        unpegUpper: false, unpegLower: false,
        xoff: 0, yoff: 0,
        special: null, tag: 0,
      };
      this.lines.push(line);
      this._edges.set(key, line);
      this._own(sectorOnLeft).push(line);
      return line;
    }
    /* WHICH SIDE. A ring reaching this edge as a->b has its sector on
       the left, and whoever got here first stored the line as v1,v2 =
       b,a — so the same orientation is the front and the opposite is
       the back. Every storey of one column walks the same ring, so they
       all arrive the same way round and pile onto the same side, which
       is the whole of what makes a column a column down here. */
    const sameWay = existing.v1 === b && existing.v2 === a;
    if (sameWay) {
      if (existing.frontBase !== base) { this.edgeConflicts++; return existing; }
      existing.frontCol.push(sectorOnLeft);
      this._own(sectorOnLeft).push(existing);
      return existing;
    }
    if (existing.backBase === null) { existing.backBase = base; existing.back = sectorOnLeft; }
    else if (existing.backBase !== base) { this.edgeConflicts++; return existing; }
    existing.backCol.push(sectorOnLeft);
    this._own(sectorOnLeft).push(existing);

    /* A two-sided line is a hole, so the middle texture goes away unless
       somebody deliberately puts one back (a grating, a shop window).
       The skins are NOT decided here — see finishTextures, which decides
       them from the heights once both columns are known. */
    existing.middle = null;
    return existing;
  }

  /**
   * A COLUMN: one outline, several storeys, bottom-up.
   *
   * `mb.column(poly, [ground, first, second])` is three sectors sharing
   * an outline, each knowing the one above and below it. Every sector
   * made by `sector()` is already a column of one, so nothing that
   * exists changes and no existing map file gains a character.
   *
   * The storeys must STACK: each one's floor at or above the ceiling of
   * the one under it, with the gap between them the deck. Overlapping
   * storeys are a map error and are thrown here rather than found later
   * as a room you can stand in two of at once.
   */
  column(poly, storeys) {
    if (!storeys.length) throw new Error('a column of no storeys');
    const base = this.sectors.length;
    const out = [];
    for (let k = 0; k < storeys.length; k++) {
      const p = storeys[k];
      if (k > 0) {
        const under = storeys[k - 1];
        /* the HIGHEST the one below gets against the LOWEST this one
           gets, because a slope is a range and a roof over a flat
           ceiling has to clear all of it */
        const top = under.slopeCeil ? slopeRange(under.slopeCeil, poly)[1] : (under.ceil ?? 128);
        const bot = p.slopeFloor ? slopeRange(p.slopeFloor, poly)[0] : (p.floor ?? 0);
        if (bot < top - 1e-6)
          throw new Error(`storey ${k} starts at ${bot}, under the ${top} of the one below it`);
      }
      out.push(this.sector(poly, { ...p, __colBase: base, __storey: k }));
    }
    for (let k = 0; k < out.length; k++) {
      const s = this.sectors[out[k]];
      s.above = k + 1 < out.length ? out[k + 1] : null;
      s.below = k > 0 ? out[k - 1] : null;
    }
    return out;
  }

  /** Every line that touches a sector. Kept as it goes, because the map
   *  file reaches in a few hundred times to put a door special or a
   *  shop window on a specific opening, and a filter over every line in
   *  the map was fine at a thousand lines and is a tenth of a second at
   *  twenty-three thousand. */
  _own(si) {
    let a = this._sectorLines.get(si);
    if (!a) this._sectorLines.set(si, a = []);
    return a;
  }

  /** Find lines between two given sectors — how the map file reaches in to
   *  put a door special or a shop window on a specific opening. */
  linesBetween(sa, sb) {
    return this._own(sa).filter(l =>
      (l.front === sa && l.back === sb) || (l.front === sb && l.back === sa));
  }

  /** Every line of a sector that has nothing on the other side. */
  outerLines(s) {
    return this._own(s).filter(l => (l.front === s || l.back === s) && (l.front === null || l.back === null));
  }

  finishTextures() { assignLineTextures(this.lines, this.sectors); }

  thing(type, x, y, angle = 0, props = {}) {
    this.things.push({ type, x, y, angle, ...props });
    return this.things[this.things.length - 1];
  }

  build() { this.finishTextures(); return new Level(this); }
}

/* =====================================================================
   Level — the built map, plus everything that asks it questions
   ===================================================================== */

const BLOCK = 128;      // Doom's blockmap cell, and still the right size

/** Same turn at every corner, collinear vertices allowed. */
function convexPoly(pts) {
  const n = pts.length;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    const sg = cr > 0 ? 1 : -1;
    if (sign === 0) sign = sg;
    else if (sg !== sign) return false;
  }
  return true;
}

export class Level {
  constructor(mb) {
    this.name = mb.name;
    this.verts = mb.verts;
    this.sectors = mb.sectors;
    this.lines = mb.lines;
    this.things = mb.things;

    /* Runtime heights start at the authored ones. Doors and lifts move
       these; the geometry for those sectors is rebuilt when they do. */
    for (const s of this.sectors) {
      s.baseFloor = s.floor;
      s.baseCeil = s.ceil;
      s.baseLight = s.light;
    }

    /* Cache each line's geometry once. This gets hit thousands of times a
       second by collision and sight checks and it never changes. */
    for (const l of this.lines) {
      const [x1, y1] = this.verts[l.v1], [x2, y2] = this.verts[l.v2];
      l.x1 = x1; l.y1 = y1; l.x2 = x2; l.y2 = y2;
      l.dx = x2 - x1; l.dy = y2 - y1;
      l.len = Math.hypot(l.dx, l.dy);
      /* Doom's fake contrast: a wall running east-west reads a notch
         brighter and one running north-south a notch darker. There is no
         sun and the nudge is the same at midnight; it exists so that the
         corner between two walls is visible in a renderer that does no
         shading at all. Worth every one of the four lines. */
      l.contrast = Math.abs(l.dy) < 0.01 ? 0.055 : Math.abs(l.dx) < 0.01 ? -0.055 : 0;
    }

    /* IS THE POLYGON CONVEX. Every rect-derived region is — a rectangle
       with extra vertices along its edges where a neighbour starts and
       stops is still a rectangle — and the wood and the road out are
       not, because they are drawn round a hole. The fuel grid uses it:
       two cells inside one CONVEX region can never have a wall between
       them, so the ray that would prove it is not cast. */
    for (const s of this.sectors) {
      /* ONCE PER COLUMN. Every storey of one shares an outline, so the
         answer is the ground storey's and asking three times is asking
         twice too often. */
      if (s.colBase !== s.index) {
        const g = this.sectors[s.colBase];
        s.convex = g.convex; s.isRect = g.isRect;
        continue;
      }
      s.convex = convexPoly(s.poly);
      /* AND IS IT JUST ITS BOUNDING BOX. A convex polygon whose every
         edge is axis-aligned is a rectangle with extra vertices along
         its sides, which is what RectMap makes and what nearly every
         region in this map is. The fuel grid uses it to fill a region
         without asking point-in-polygon half a million times. */
      s.isRect = s.convex && s.poly.every((p, i) => {
        const q = s.poly[(i + 1) % s.poly.length];
        return Math.abs(p[0] - q[0]) < 1e-9 || Math.abs(p[1] - q[1]) < 1e-9;
      });
    }

    this._buildBounds();
    this._buildBlockmap();

    /* EVERY SECTOR KNOWS ITS LINES, for the portal flood below: a
       sector's two-sided lines are its doors to the sectors next to
       it, and the flood walks them. */
    for (const s of this.sectors) { s.lines = []; s._vis = 0; s._vlo = 0; s._vhi = 0; s._vn = 0; }
    /* EVERY STOREY, and not only the ground one. l.front and l.back are
       the ground sectors of the two columns, so walking those alone
       gave a first-floor bedroom no doors at all — the portal flood
       could enter it and never leave, and nothing upstairs could be
       walked to. The columns are what a line actually joins. */
    for (const l of this.lines) {
      for (const i of l.frontCol) this.sectors[i].lines.push(l);
      for (const i of l.backCol) this.sectors[i].lines.push(l);
    }
    this._visStamp = 1;
    this.visList = [];
    this._visStack = [];

    /* Where the STORE is, for the systems that only care about the
       store: the fuel grid is laid over this and not over nine thousand
       units of wood on every side, which has its own fire. */
    let fb = [Infinity, Infinity, -Infinity, -Infinity], any = false;
    for (const s of this.sectors) {
      if (s.forest || s.outside) continue;
      any = true;
      fb = [Math.min(fb[0], s.bbox[0]), Math.min(fb[1], s.bbox[1]), Math.max(fb[2], s.bbox[2]), Math.max(fb[3], s.bbox[3])];
    }
    this.fireBounds = any ? fb : this.bounds;
  }

  /** Redo every wall's texture after some sectors changed their skins. */
  refreshTextures() {
    assignLineTextures(this.lines, this.sectors);
  }

  _buildBounds() {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [x, y] of this.verts) {
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    this.bounds = [minx, miny, maxx, maxy];
    this.originX = Math.floor(minx / BLOCK) * BLOCK - BLOCK;
    this.originY = Math.floor(miny / BLOCK) * BLOCK - BLOCK;
    this.cols = Math.ceil((maxx - this.originX) / BLOCK) + 2;
    this.rows = Math.ceil((maxy - this.originY) / BLOCK) + 2;
  }

  /* Two grids over the same cells: which LINES touch a cell, and which
     SECTORS overlap it. The first answers "what can I bump into"; the
     second answers "what am I standing on". Both would otherwise be a
     scan of the whole map every time anything moved. */
  _buildBlockmap() {
    const n = this.cols * this.rows;
    this.blockLines = Array.from({ length: n }, () => []);
    this.blockSectors = Array.from({ length: n }, () => []);

    for (const l of this.lines) {
      const c0 = this._col(Math.min(l.x1, l.x2)), c1 = this._col(Math.max(l.x1, l.x2));
      const r0 = this._row(Math.min(l.y1, l.y2)), r1 = this._row(Math.max(l.y1, l.y2));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++)
          this.blockLines[r * this.cols + c].push(l);
    }
    /* THE GROUND STOREYS ONLY. sectorAt answers with the ground sector
       of a column and the storeys over it share its outline, so putting
       them in as well is the same rectangle two and three times over —
       four thousand of them across the town, in a grid that is walked
       every time anything moves. Whoever wants the storeys walks the
       column with spanIn. */
    for (const s of this.sectors) {
      if (s.colBase !== s.index) continue;
      const c0 = this._col(s.bbox[0]), c1 = this._col(s.bbox[2]);
      const r0 = this._row(s.bbox[1]), r1 = this._row(s.bbox[3]);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++)
          this.blockSectors[r * this.cols + c].push(s);
    }
  }

  _col(x) { return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.originX) / BLOCK))); }
  _row(y) { return Math.max(0, Math.min(this.rows - 1, Math.floor((y - this.originY) / BLOCK))); }

  /** Every line that could touch the box, without duplicates. */
  linesInBox(minx, miny, maxx, maxy, out = []) {
    out.length = 0;
    const c0 = this._col(minx), c1 = this._col(maxx);
    const r0 = this._row(miny), r1 = this._row(maxy);
    /* Stamp rather than a Set: a Set allocates on every query and this
       runs several times per actor per tic. */
    this._stamp = (this._stamp || 0) + 1;
    const st = this._stamp;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.blockLines[r * this.cols + c];
        for (let i = 0; i < cell.length; i++) {
          const l = cell[i];
          if (l._stamp === st) continue;
          l._stamp = st;
          out.push(l);
        }
      }
    }
    return out;
  }

  /** Which sector is (x,y) in? null if it is off the map.
   *
   *  THE GROUND ONE, always, whatever is stacked over it. Everything
   *  written before there were columns asked this question meaning "what
   *  region is this point in" and got one answer, and it still does; the
   *  storey you are actually standing on is spanAt's business. */
  sectorAt(x, y, hint = null) {
    /* Almost every call is "still in the same sector as last frame", so
       try that first and skip the grid entirely. */
    if (hint) {
      const g = hint.colBase === hint.index ? hint : this.sectors[hint.colBase];
      if (this._inSector(g, x, y)) return g;
    }
    const cell = this.blockSectors[this._row(y) * this.cols + this._col(x)];
    for (let i = 0; i < cell.length; i++) {
      const s = cell[i];
      if (s.colBase !== s.index) continue;
      if (this._inSector(s, x, y)) return s;
    }
    return null;
  }

  /**
   * WHICH STOREY. Walk the column from any sector of it and return the
   * one whose floor..ceiling contains z, or the highest one below it.
   *
   * It never returns null for a real sector, which is the property the
   * whole of the old collision code was written against: a mover at the
   * bottom of a lift shaft is in the bottom storey and a mover above a
   * roof is in the top one, and neither is nowhere. For a column of one
   * — the store, the car park, the road, the wood — it returns the
   * sector it was handed, in one comparison.
   */
  spanIn(s, z, x = null, y = null) {
    if (!s) return null;
    let cur = this.sectors[s.colBase];
    if (cur.above === null) return cur;
    let best = cur;
    const exact = x !== null;
    while (cur) {
      const f = exact ? this.floorAt(cur, x, y) : cur.floor;
      const c = exact ? this.ceilAt(cur, x, y) : cur.ceil;
      if (z >= f - ZEPS && z <= c + ZEPS) return cur;
      if (f <= z) best = cur;
      cur = cur.above === null ? null : this.sectors[cur.above];
    }
    return best;
  }

  /** The storey at (x, y, z). */
  spanAt(x, y, z, hint = null) {
    const g = this.sectorAt(x, y, hint ? this.sectors[hint.colBase] : null);
    return g ? this.spanIn(g, z, x, y) : null;
  }

  /** How high this region's floor is at a point, and its ceiling. For
   *  the thousands of regions that are flat — every one of them until
   *  there were roofs — this is the number it always was. */
  floorAt(s, x, y) { return s.slopeFloor ? slopeAt(s.slopeFloor, x, y) : s.floor; }
  ceilAt(s, x, y) { return s.slopeCeil ? slopeAt(s.slopeCeil, x, y) : s.ceil; }

  /** Every storey over (x, y), bottom-up. */
  columnAt(x, y) {
    const g = this.sectorAt(x, y);
    if (!g) return [];
    const out = [];
    for (let c = g; c; c = c.above === null ? null : this.sectors[c.above]) out.push(c);
    return out;
  }

  _inSector(s, x, y) {
    const b = s.bbox;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
    return pointInPoly(s.poly, x, y);
  }

  /* --------------------------------------------------------------------
     What a line does to something trying to walk through it

     A two-sided line is a hole, but not every hole is passable. Doom's
     four reasons, and they are still the right four:

       the map said so         a shop counter you cannot vault
       the gap is too short    ducking is not in this game either
       the step is too tall    24 units is a kerb, 25 is a wall
       the drop is too far     only applies to monsters, who are sensible

     Returns null if you may pass, otherwise the reason.
     ------------------------------------------------------------------ */
  lineBlocks(line, fromZ, height, isMonster, atX = null, atY = null) {
    if (line.back === null || line.front === null) return 'solid';
    if (line.blocking) return 'blocking';
    if (isMonster && line.blockMonsters) return 'blockmonsters';
    /* THE OPENING IS BETWEEN THE TWO SPANS AT THE MOVER'S OWN HEIGHT,
       which is the same arithmetic as before with spanIn in front of it.
       Standing in a hall you may walk through the front door; standing
       on the landing over it you may not, and the line is the same
       line.
     *
       AND AT THE POINT IT IS CROSSED, where either side is sloped. The
       middle of the line is the honest place to ask when the caller has
       not said where — a roof's opening is different at the eaves from
       at the ridge. */
    const px = atX === null ? (line.x1 + line.x2) / 2 : atX;
    const py = atY === null ? (line.y1 + line.y2) / 2 : atY;
    const a = this.spanIn(this.sectors[line.front], fromZ, px, py);
    const b = this.spanIn(this.sectors[line.back], fromZ, px, py);
    const openTop = Math.min(this.ceilAt(a, px, py), this.ceilAt(b, px, py));
    const openBottom = Math.max(this.floorAt(a, px, py), this.floorAt(b, px, py));
    if (openTop - openBottom < height) return 'toolow';
    if (openBottom - fromZ > MAX_STEP) return 'toohigh';
    if (isMonster && fromZ - openBottom > 96) return 'toofar';   // monsters do not jump off things
    return null;
  }

  /**
   * Slide a circle from (x,y) by (dx,dy) and return where it ends up.
   *
   * Doom's method, and the reason its movement feels the way it does:
   * try the whole move; if it fails, try the move with X alone, then with
   * Y alone. Running into a wall at an angle therefore slides along it
   * rather than stopping dead, and it does so with no contact normals, no
   * penetration solving and no chance of resting inside geometry.
   *
   * SUBSTEPPING is not optional and does not belong to the caller. A move
   * longer than the radius can start on one side of a wall and end far
   * enough past it that neither the destination circle nor anything else
   * notices the wall was ever there, and on a slow frame every move is
   * that long. So the step is chopped here, where it cannot be forgotten,
   * rather than in each of the several places that want to move something.
   */
  slideMove(x, y, dx, dy, radius, z, height, isMonster = false) {
    const len = Math.hypot(dx, dy);
    const maxStep = Math.max(1, radius * 0.5);
    const steps = len > maxStep ? Math.ceil(len / maxStep) : 1;
    if (steps === 1) return this._slideOnce(x, y, dx, dy, radius, z, height, isMonster);

    const sx = dx / steps, sy = dy / steps;
    let cx = x, cy = y, hit = false;
    for (let i = 0; i < steps; i++) {
      const r = this._slideOnce(cx, cy, sx, sy, radius, z, height, isMonster);
      /* Stop early once we are wedged: another dozen substeps against the
         same corner will not free us and they are not free. */
      if (r[0] === cx && r[1] === cy) { hit = true; break; }
      cx = r[0]; cy = r[1];
      if (r[2]) hit = true;
    }
    return [cx, cy, hit];
  }

  _slideOnce(x, y, dx, dy, radius, z, height, isMonster) {
    if (this._canMove(x, y, x + dx, y + dy, radius, z, height, isMonster)) return [x + dx, y + dy, false];
    if (dx !== 0 && this._canMove(x, y, x + dx, y, radius, z, height, isMonster)) return [x + dx, y, true];
    if (dy !== 0 && this._canMove(x, y, x, y + dy, radius, z, height, isMonster)) return [x, y + dy, true];
    return [x, y, true];
  }

  /**
   * Two tests, and both are needed.
   *
   * The destination circle overlapping the line catches the ordinary case
   * — walking up to a wall and coming to rest against it.
   *
   * The path from here to there CROSSING the line catches the case that
   * the first test cannot see at all: a move long enough to finish on the
   * far side of a wall with clear air on both sides of it. The first test
   * looks only at where you land, and where you land is fine; it is the
   * wall you went through on the way that was the problem.
   */
  _canMove(fx, fy, tx, ty, radius, z, height, isMonster) {
    const minx = Math.min(fx, tx) - radius, maxx = Math.max(fx, tx) + radius;
    const miny = Math.min(fy, ty) - radius, maxy = Math.max(fy, ty) + radius;
    const lines = this.linesInBox(minx, miny, maxx, maxy, this._moveScratch || (this._moveScratch = []));
    const r2 = radius * radius;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      let touching = segIntersect(fx, fy, tx, ty, l.x1, l.y1, l.x2, l.y2) >= 0;
      if (!touching) {
        const [px, py] = closestOnSeg(l.x1, l.y1, l.x2, l.y2, tx, ty);
        touching = dist2(px, py, tx, ty) < r2;
      }
      if (!touching) continue;
      if (this.lineBlocks(l, z, height, isMonster, tx, ty)) return false;
    }
    return true;
  }

  /**
   * Can an eye at (ax,ay,az) see a point at (bx,by,bz)?
   *
   * Doom's REJECT table did this in one array lookup; we do it the honest
   * way and walk the segment. Cheap enough — a monster only asks when it
   * is idle and only every few tics.
   *
   * A two-sided line does not block sight unless the gap between the
   * floors and ceilings at the crossing point has closed past the ray,
   * which is what stops a zombie tracking you through a shut door but
   * lets it see you over a shelf.
   */
  sightBlocked(ax, ay, az, bx, by, bz) {
    const lines = this.linesInBox(
      Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by),
      this._sightScratch || (this._sightScratch = []));
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const t = segIntersect(ax, ay, bx, by, l.x1, l.y1, l.x2, l.y2);
      if (t < 0) continue;
      if (l.front === null || l.back === null || l.blockSight) return true;
      const z = az + (bz - az) * t;
      const hx = ax + (bx - ax) * t, hy = ay + (by - ay) * t;
      const fs = this.spanIn(this.sectors[l.front], z, hx, hy);
      const bs = this.spanIn(this.sectors[l.back], z, hx, hy);
      const openTop = Math.min(this.ceilAt(fs, hx, hy), this.ceilAt(bs, hx, hy));
      const openBottom = Math.max(this.floorAt(fs, hx, hy), this.floorAt(bs, hx, hy));
      if (openTop <= openBottom) return true;
      if (z < openBottom || z > openTop) return true;
    }
    return false;
  }

  /** Cast a ray and return the nearest wall hit, or null. Hitscan weapons
   *  and thrown bottles both need this. */
  rayHitWall(ax, ay, az, bx, by, bz) {
    const lines = this.linesInBox(
      Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by),
      this._rayScratch || (this._rayScratch = []));
    let best = null, bestT = Infinity;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const t = segIntersect(ax, ay, bx, by, l.x1, l.y1, l.x2, l.y2);
      if (t < 0 || t >= bestT) continue;
      let solid = (l.front === null || l.back === null || l.blocking);
      if (!solid) {
        const z = az + (bz - az) * t;
        const hx = ax + (bx - ax) * t, hy = ay + (by - ay) * t;
        const fs = this.spanIn(this.sectors[l.front], z, hx, hy);
        const bs = this.spanIn(this.sectors[l.back], z, hx, hy);
        const openTop = Math.min(this.ceilAt(fs, hx, hy), this.ceilAt(bs, hx, hy));
        const openBottom = Math.max(this.floorAt(fs, hx, hy), this.floorAt(bs, hx, hy));
        solid = (z < openBottom || z > openTop);
      }
      if (solid) { bestT = t; best = l; }
    }
    if (!best) return null;
    return {
      line: best, t: bestT,
      x: ax + (bx - ax) * bestT,
      y: ay + (by - ay) * bestT,
      z: az + (bz - az) * bestT,
    };
  }

  /* --------------------------------------------------------------------
     WHAT CAN BE SEEN FROM HERE — the portal flood

     There was no occlusion culling. The frustum kept what was in front
     of you, and what was in front of you, from the stockroom, was the
     whole car park through two walls.

     The map is regions joined by two-sided lines, and a two-sided line
     is a PORTAL: an opening between two rooms. A region can be seen if
     you are in it or if you can see it through an opening of a region
     you can see, and that is the whole algorithm — Build's renderer did
     it in 1996 and the data model here is already its input:

       start in the region under the eye, with the field of view as a
         window of ANGLE, left edge to right edge
       for each two-sided line of the region, take the angle it spans
         from the eye and cut it down to the window; empty means that
         opening cannot be seen from here, so nothing through it can
         be either — stop
       otherwise the region on the far side is visible: go into it,
         with the NARROWED window
       a one-sided line is a wall and not an opening, and that is the
         entire occlusion test. Occlusion here is not something worked
         out; it is the absence of a portal

     THE WINDOW IS A HORIZONTAL ANGLE and not a screen rectangle. The
     world is a sector world and everything that hides anything in it
     is vertical, so an interval is enough, and an interval is two
     numbers. It is CONSERVATIVE — an opening only visible above or
     below the window still lets the flood through — and conservative
     the safe way round: it draws things it need not and never hides a
     thing it should have drawn. The headless check holds exactly that,
     against sightBlocked, which casts a real ray.

     A REGION CAN BE REACHED THROUGH SEVERAL OPENINGS. It keeps one
     interval, the hull of everything it has been reached through, and
     is walked again only when a new opening widens the hull; after a
     few widenings it is given the whole window and left alone. That
     is conservative again and it is what bounds the work: the car park
     has hundreds of openings along its edges and this is what stops
     each one of them re-walking the lot.

     WHAT IT COSTS is proportional to what you can see: tens of regions
     in an aisle, a couple of hundred down the parade, once a FRAME and
     not once a tic. What it buys is that the crowd, the wood's chunks
     and the fire's sprites in regions you cannot see are not drawn —
     see Actor.render, Forest.render and FireSystem.render.
     ------------------------------------------------------------------ */
  /**
   * Flood from an eye at (ex, ey) looking along `yaw`, `halfFov` either
   * side of it, no further than `maxDist`. Marks every visible sector
   * and returns them; isVisible() then answers for any sector for this
   * frame and the last one.
   */
  visibleSectors(ex, ey, yaw, halfFov, maxDist = Infinity) {
    const stamp = ++this._visStamp;
    const list = this.visList;
    list.length = 0;
    const sectors = this.sectors;
    const start = this.sectorAt(ex, ey);
    /* off the map — in the wood past the last sector, say — there is
       nothing to flood from, so everything in reach is visible */
    if (!start) {
      const md2 = maxDist * maxDist;
      for (const s of sectors) {
        const cx = Math.max(s.bbox[0], Math.min(s.bbox[2], ex)), cy = Math.max(s.bbox[1], Math.min(s.bbox[3], ey));
        if ((cx - ex) * (cx - ex) + (cy - ey) * (cy - ey) > md2) continue;
        s._vis = stamp; s._vlo = -halfFov; s._vhi = halfFov; s._vn = 0; list.push(s);
      }
      return list;
    }
    const md2 = maxDist * maxDist;
    const stack = this._visStack;
    stack.length = 0;
    const enter = (s, lo, hi) => {
      if (s._vis !== stamp) {
        s._vis = stamp; s._vlo = lo; s._vhi = hi; s._vn = 1; list.push(s);
        stack.push(s, lo, hi);
        return;
      }
      if (lo >= s._vlo && hi <= s._vhi) return;          // seen through a wider opening already
      if (++s._vn > 6) { lo = -halfFov; hi = halfFov; }   // enough: the whole window, once
      else { lo = Math.min(lo, s._vlo); hi = Math.max(hi, s._vhi); }
      s._vlo = lo; s._vhi = hi;
      stack.push(s, lo, hi);
    };
    enter(start, -halfFov, halfFov);
    while (stack.length) {
      const hi = stack.pop(), lo = stack.pop(), s = stack.pop();
      const lines = s.lines;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (l.blockSight) continue;
        /* THE OTHER COLUMN, and every storey of it that this one's own
           span reaches. A hall sees the street through its door and the
           landing above it does not, because their spans do not
           overlap; for a column of one this is the one sector on the
           far side and the same shut test as before. */
        const other = s.colBase === l.frontBase ? l.backCol : l.frontCol;
        if (!other.length) continue;
        const outCount = other.length;
        for (let k = 0; k < outCount; k++) {
        const o = sectors[other[k]];
        if (o === s) continue;
        /* shut: a door with its ceiling on the floor, or a step that
           has closed the gap — the same rule sightBlocked uses */
        if (Math.min(s.ceil, o.ceil) - Math.max(s.floor, o.floor) <= 0) continue;
        /* too far: the nearest point of the opening is past the air */
        if (maxDist !== Infinity) {
          const [qx, qy] = closestOnSeg(l.x1, l.y1, l.x2, l.y2, ex, ey);
          if ((qx - ex) * (qx - ex) + (qy - ey) * (qy - ey) > md2) continue;
        }
        /* the angle the opening spans, as seen from the eye, relative
           to where the eye is looking */
        const a1 = angleNorm(Math.atan2(l.y1 - ey, l.x1 - ex) - yaw);
        const a2 = angleNorm(Math.atan2(l.y2 - ey, l.x2 - ex) - yaw);
        let plo = a1 < a2 ? a1 : a2, phi = a1 < a2 ? a2 : a1;
        if (phi - plo > Math.PI) {
          /* it goes round behind the eye: two pieces, either side */
          const c1 = Math.max(lo, -Math.PI), h1 = Math.min(hi, plo);
          if (h1 > c1) enter(o, c1, h1);
          const c2 = Math.max(lo, phi), h2 = Math.min(hi, Math.PI);
          if (h2 > c2) enter(o, c2, h2);
          continue;
        }
        const clo = plo > lo ? plo : lo, chi = phi < hi ? phi : hi;
        if (chi > clo) enter(o, clo, chi);
        }
      }
    }
    return list;
  }

  /** Was this sector in the flood this frame, or the last? The last
   *  frame too, so a region does not pop the instant a doorway's edge
   *  crosses it. */
  isVisible(s) { return s._vis >= this._visStamp - 1; }

  /** Every GROUND sector whose polygon overlaps a circle. Walk the
   *  column from one if the storeys are wanted too. */
  sectorsNear(x, y, radius, out = []) {
    out.length = 0;
    const c0 = this._col(x - radius), c1 = this._col(x + radius);
    const r0 = this._row(y - radius), r1 = this._row(y + radius);
    this._sstamp = (this._sstamp || 0) + 1;
    const st = this._sstamp;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.blockSectors[r * this.cols + c];
        for (let i = 0; i < cell.length; i++) {
          const s = cell[i];
          if (s._sstamp === st) continue;
          s._sstamp = st;
          out.push(s);
        }
      }
    }
    return out;
  }
}
