/* =====================================================================
   GROCERY STORE SIMULATOR — the wall as mass rather than as a picture
   =====================================================================

   A WALL IN THIS ENGINE HAS NO INSIDE. It is a quad with a texture on
   it, and js/decals.js draws a dark ragged spot where a round lands,
   because a spot is what a wall with no inside can offer. A hundred and
   forty rounds a second into a shopfront leaves a hundred and forty
   spots and a shopfront.

   So a wall that has been shot gets an inside. It is cut into a lattice
   of eight-unit cubes — twenty-three centimetres at this game's scale of
   about thirty-five units to the metre — and a round takes some of the
   life out of the cubes it lands near until one of them gives. What is
   drawn afterwards is not the quad, it is the lattice, greedily merged
   back into as few rectangles as it will go into.

   NOTHING HERE KNOWS WHAT THREE.JS IS. The arithmetic is typed arrays
   and numbers, the way js/decals.js keeps its cooling and js/fire.js
   keeps its heat, so the smoke test can shoot a wall two hundred times
   and count what is left of it without a browser anywhere. Turning the
   rectangles into triangles is js/mapgeo.js's job and it is the only
   part that needs a renderer.

   THE UNIT IS A SPAN, NOT A LINE, and that was measured rather than
   guessed. A line here can be nine hundred metres long — the wood's own
   boundary is one line of thirty-two thousand units — and one lattice
   over a line like that is half a megabyte that takes fifty
   milliseconds to re-merge every time somebody puts a round in it. Cut
   into spans of two hundred and fifty-six units the worst one in the
   building is under four kilobytes and re-merges in a third of a
   millisecond, which is one per cent of a tic. A line holds its spans
   in an array and builds each one the first time something hits it, so
   a building nobody has shot at costs nothing at all.

   AND EACH LINE OWNS EIGHT UNITS OF THICKNESS, which is not a number
   picked to look right. The map's own WALL is 16 — "the void between
   two rooms IS the wall" — and a wall is two one-sided lines with that
   void between them. Eight units each and the two of them fill it
   exactly once, two voxels through, which is the thinnest a wall can be
   and still have a torn edge when you make a hole in it.
   ===================================================================== */

/* The lattice. VOX is the cube; SPAN is how much of a line one lattice
   covers; THICK is how deep into the void behind it the line owns. */
export const VOX = 8;
export const SPAN = 256;
export const THICK = 8;

/* WHAT A VOXEL IS, and it is deliberately not a colour. A region's skin
   is swapped for a charred one while the game runs — assignLineTextures
   in js/level.js re-decides every wall's texture whenever a sector
   chars — so a voxel that remembered a texture would be holding last
   week's news. It remembers which SLOT of the line it fills, and the
   slot is resolved against the line's CURRENT textures at the moment
   the lattice is merged. Charring keeps working and this file never
   hears about it. */
export const EMPTY = 0;
export const MID   = 1;    // a one-sided wall, floor to ceiling: l.middle
export const UPPER = 2;    // what hangs down from the higher ceiling: l.upper
export const LOWER = 3;    // what rises from the lower floor: l.lower
/* and the one that is not a slot: the face you only ever see because
   something went through the wall. js/mapgeo.js gives it RUINWALL,
   which already draws broken board with the studs standing behind it —
   the texture a gutted region wears, doing the same job an inch at a
   time. */
export const TORN  = 4;

/* HOW MUCH PUNISHMENT A VOXEL TAKES before it goes. Damage accumulates
   in a byte, so the incoming number is scaled by this on the way in and
   a voxel gives at 255. It is one number for now and it is meant to be
   felt rather than derived — the weapons are tuned against what it
   looks like, not the other way round. */
export const TOUGHNESS = 900;

/* A LINE LONGER THAN THIS IS SCENERY. The wood's boundary is four lines
   of nine thousand units and up; the longest wall in the building is
   three thousand eight hundred and eighty. Nothing between the two
   exists, so the cut is wide and the margin is on purpose: a lattice
   over the edge of the world is memory spent on a wall no round will
   ever reach. */
export const MAX_LINE = 6000;

/* Knuth's multiplicative hash, the same one js/ruin.js picks a sagging
   joist with and js/textures.js picks a ruin variant with, for the same
   reason: stable across a reload, different from its neighbour's. */
const hash = (i, salt) => (Math.imul((i | 0) + 1 ^ salt, 2654435761) >>> 8) / 0x1000000;

/**
 * The heights on a line that are SOLID MASS, and which slot each is.
 *
 * Not everything a line draws is mass. The middle texture of a two-sided
 * line is the thing standing IN the hole — a shop window, a wire shelf,
 * eight feet of chain link — and a pane of glass is a surface with
 * nothing behind it. Those stay quads for good. What is mass is the
 * full height of a one-sided wall, and the lintel above a doorway and
 * the step below a counter on a two-sided one.
 */
export function solidSpans(l, sectors) {
  const front = l.front !== null ? sectors[l.front] : null;
  const back  = l.back  !== null ? sectors[l.back]  : null;
  if (!front && !back) return [];

  if (!back || !front) {
    const s = front || back;
    const tex = l.middle || 'WALL';
    if (tex === 'NONE' || s.ceil <= s.floor) return [];
    return [{ z0: s.floor, z1: s.ceil, slot: MID }];
  }

  const skyBoth = front.ceilTex === 'SKY' && back.ceilTex === 'SKY';
  const up = l.upper && l.upper !== 'NONE' && !skyBoth;
  const lo = l.lower && l.lower !== 'NONE';
  const out = [];
  /* The two sides of one wall describe the same mass, so the pair of
     upper skins is ONE lintel and the pair of lowers is ONE step. */
  if (up && front.ceil !== back.ceil)
    out.push({ z0: Math.min(front.ceil, back.ceil), z1: Math.max(front.ceil, back.ceil), slot: UPPER });
  if (lo && front.floor !== back.floor)
    out.push({ z0: Math.min(front.floor, back.floor), z1: Math.max(front.floor, back.floor), slot: LOWER });
  return out.sort((a, b) => a.z0 - b.z0);
}

/**
 * Is this line one the lattice is allowed to have?
 *
 * ONE-SIDED ONLY, FOR NOW, and the reason is that a one-sided wall has
 * its face exactly where the lattice's face lands. The void is behind
 * it, so eight units of voxels sit behind the plane the quad was on and
 * the picture does not move by so much as a pixel. A two-sided lintel
 * has open air on BOTH sides and is drawn as a quad of no thickness at
 * all; giving it eight units pushes each of its faces four units out,
 * and four units is half a voxel of drift on a surface that is supposed
 * to look untouched until something hits it. That is a problem worth
 * solving when there is a reason to solve it. There is not yet: the
 * shopfront, the fascia and every exterior wall of the parade are
 * one-sided.
 */
export function voxelisable(l, sectors) {
  if (l.front !== null && l.back !== null) return false;
  if (l.len > MAX_LINE || l.len <= 0) return false;
  return solidSpans(l, sectors).length > 0;
}

/* ---------------------------------------------------------------------
   ONE LATTICE

   Local coordinates throughout: u along the line from v1, w into the
   wall away from the open side, z the world's own height. Nothing in
   here is in world space and nothing in here is in the RENDERER's
   space either — the map's y becomes the renderer's minus z, and that
   negation belongs in js/mapgeo.js where the rest of it lives, in one
   place, once.
   ------------------------------------------------------------------- */
export class VoxelSpan {
  /**
   * @param u0     where this span starts along its line
   * @param uLen   how much of the line it covers
   * @param spans  solidSpans() for the line
   * @param seed   stable per-span number, for which ruin variant a torn
   *               edge wears
   */
  constructor(u0, uLen, spans, seed = 0) {
    this.u0 = u0;
    this.seed = seed;
    this.zBot = Math.min(...spans.map(s => s.z0));
    this.zTop = Math.max(...spans.map(s => s.z1));
    this.nu = Math.max(1, Math.ceil(uLen / VOX));
    this.nz = Math.max(1, Math.ceil((this.zTop - this.zBot) / VOX));
    this.nw = Math.max(1, Math.round(THICK / VOX));

    const n = this.nu * this.nz * this.nw;
    this.vox = new Uint8Array(n);
    this.dmg = new Uint8Array(n);
    this.broken = 0;

    /* Fill by height: a voxel is whatever slot its middle falls inside,
       and empty where the line has a window in it. */
    for (let iz = 0; iz < this.nz; iz++) {
      const wz = this.zBot + iz * VOX + VOX / 2;
      let slot = EMPTY;
      for (const s of spans) if (wz >= s.z0 && wz < s.z1) { slot = s.slot; break; }
      if (slot === EMPTY) continue;
      for (let iu = 0; iu < this.nu; iu++)
        for (let iw = 0; iw < this.nw; iw++)
          this.vox[this.at(iu, iz, iw)] = slot;
    }
    this.solid0 = this.vox.reduce((n, v) => n + (v ? 1 : 0), 0);
  }

  at(iu, iz, iw) { return (iz * this.nu + iu) * this.nw + iw; }

  get(iu, iz, iw) {
    if (iu < 0 || iz < 0 || iw < 0 || iu >= this.nu || iz >= this.nz || iw >= this.nw) return EMPTY;
    return this.vox[this.at(iu, iz, iw)];
  }

  get bytes() { return this.vox.length + this.dmg.length; }
  /* how much of this span is still standing, 1 down to 0 */
  get intact() { return this.solid0 ? 1 - this.broken / this.solid0 : 1; }

  /**
   * A round lands. `u` is along the line, `z` is the world height,
   * `radius` is how far the shock carries.
   *
   * DAMAGE FALLS OFF AND IT DOES NOT PUNCH. A single round taking a
   * whole voxel out would put a twenty-three centimetre hole in a wall
   * for one bullet, which is not a bullet hole, it is a cannon. So a
   * round takes a share of the life out of everything within its radius
   * and js/decals.js goes on drawing the mark it left; the wall opens
   * where the rounds have been landing, which is the thing a burst
   * across a shopfront is supposed to look like.
   *
   * Returns how many voxels gave — nonzero means the mesh is stale.
   */
  hit(u, z, amount, radius = VOX) {
    const cu = (u - this.u0) / VOX, cz = (z - this.zBot) / VOX;
    const r = Math.max(0.5, radius / VOX);
    const u1 = Math.floor(cu - r), u2 = Math.ceil(cu + r);
    const z1 = Math.floor(cz - r), z2 = Math.ceil(cz + r);
    let broke = 0;
    for (let iz = Math.max(0, z1); iz <= Math.min(this.nz - 1, z2); iz++) {
      for (let iu = Math.max(0, u1); iu <= Math.min(this.nu - 1, u2); iu++) {
        const d = Math.hypot(iu + 0.5 - cu, iz + 0.5 - cz);
        if (d > r) continue;
        const share = amount * (1 - d / r) * 255 / TOUGHNESS;
        if (share <= 0) continue;
        for (let iw = 0; iw < this.nw; iw++) {
          const i = this.at(iu, iz, iw);
          if (!this.vox[i]) continue;
          const was = this.dmg[i];
          const now = Math.min(255, was + share);
          this.dmg[i] = now;
          if (now >= 255) { this.vox[i] = EMPTY; this.broken++; broke++; }
        }
      }
    }
    return broke;
  }

  /** Straight removal, no accounting — what a fire that has finished
   *  with a wall does to it, and what an explosion does. */
  carve(u, z, radius) {
    const cu = (u - this.u0) / VOX, cz = (z - this.zBot) / VOX;
    const r = Math.max(0.5, radius / VOX);
    let broke = 0;
    for (let iz = Math.max(0, Math.floor(cz - r)); iz <= Math.min(this.nz - 1, Math.ceil(cz + r)); iz++) {
      for (let iu = Math.max(0, Math.floor(cu - r)); iu <= Math.min(this.nu - 1, Math.ceil(cu + r)); iu++) {
        if (Math.hypot(iu + 0.5 - cu, iz + 0.5 - cz) > r) continue;
        for (let iw = 0; iw < this.nw; iw++) {
          const i = this.at(iu, iz, iw);
          if (!this.vox[i]) continue;
          this.vox[i] = EMPTY; this.dmg[i] = 255; this.broken++; broke++;
        }
      }
    }
    return broke;
  }

  /** Is there a clear line through the wall at this point — which is
   *  what lets a shot that follows the first one go through the hole
   *  rather than stopping on the wall that is no longer there. */
  openAt(u, z) {
    const iu = Math.floor((u - this.u0) / VOX), iz = Math.floor((z - this.zBot) / VOX);
    if (iu < 0 || iz < 0 || iu >= this.nu || iz >= this.nz) return false;
    for (let iw = 0; iw < this.nw; iw++) if (this.vox[this.at(iu, iz, iw)]) return false;
    return true;
  }

  /* -------------------------------------------------------------------
     MERGING IT BACK INTO RECTANGLES

     Six directions, a mask per layer, and the usual greedy sweep: take
     a face, run it as wide as it will go, then as tall as it will go
     with every row matching, and strike out what you took. A wall
     nobody has touched comes back as TWO rectangles — one per side —
     because that is what it is, and that is the property that makes it
     safe to voxelise something and have it look like nothing happened.

     WHAT IS NOT EMITTED matters as much. A face on the lattice's own
     boundary in u or z is buried: the ends of a span meet the next
     span along the same wall, the bottom meets the floor and the top
     meets the ceiling. Emitting those would put a rectangle of torn
     board across every span join in the building. Only the two faces
     across the thickness survive at a boundary, and those are the wall.

     `emit` is called with lattice coordinates and one of the three
     ranges collapsed — the plane the face lies in. js/mapgeo.js scales
     them and does the one negation.
     ----------------------------------------------------------------- */
  mesh(emit) {
    const DIRS = [
      [ 1, 0, 0], [-1, 0, 0],
      [ 0, 1, 0], [ 0,-1, 0],
      [ 0, 0, 1], [ 0, 0,-1],
    ];
    const dim = [this.nu, this.nz, this.nw];
    let quads = 0;

    for (const [du, dz, dw] of DIRS) {
      const axis = du ? 0 : dz ? 1 : 2;
      const sign = du + dz + dw;                 // +1 or -1
      const A = dim[(axis + 1) % 3], B = dim[(axis + 2) % 3];
      const mask = new Int16Array(A * B);

      for (let s = 0; s < dim[axis]; s++) {
        /* a buried boundary: only the thickness faces are ever visible
           at the edge of the lattice */
        const onBoundary = (s === 0 && sign < 0) || (s === dim[axis] - 1 && sign > 0);
        if (onBoundary && axis !== 2) continue;

        mask.fill(0);
        for (let a = 0; a < A; a++) {
          for (let b = 0; b < B; b++) {
            const c = [0, 0, 0];
            c[axis] = s; c[(axis + 1) % 3] = a; c[(axis + 2) % 3] = b;
            const here = this.get(c[0], c[1], c[2]);
            if (!here) continue;
            if (this.get(c[0] + du, c[1] + dz, c[2] + dw)) continue;
            /* The two big faces wear the slot they belong to; every
               other face is something you can only see because the wall
               is open, so it is torn. */
            mask[a * B + b] = axis === 2 ? here : TORN;
          }
        }

        for (let a = 0; a < A; a++) {
          for (let b = 0; b < B; b++) {
            const slot = mask[a * B + b];
            if (!slot) continue;
            let w = 1;
            while (b + w < B && mask[a * B + b + w] === slot) w++;
            let h = 1;
            grow: while (a + h < A) {
              for (let k = 0; k < w; k++) if (mask[(a + h) * B + b + k] !== slot) break grow;
              h++;
            }
            for (let i = 0; i < h; i++)
              for (let k = 0; k < w; k++) mask[(a + i) * B + b + k] = 0;

            /* back out of (axis, a, b) into (u, z, w) ranges */
            const lo = [0, 0, 0], hi = [0, 0, 0];
            lo[axis] = hi[axis] = s + (sign > 0 ? 1 : 0);
            lo[(axis + 1) % 3] = a;     hi[(axis + 1) % 3] = a + h;
            lo[(axis + 2) % 3] = b;     hi[(axis + 2) % 3] = b + w;
            emit(slot, axis, sign, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]);
            quads++;
          }
        }
      }
    }
    return quads;
  }
}

/* ---------------------------------------------------------------------
   A LINE'S WORTH OF THEM

   Lazily: a span is built the first time something lands on it, so a
   parade nobody has fired at holds no lattices at all and the level
   builds in the half second it has always built in.
   ------------------------------------------------------------------- */
export class VoxelWall {
  constructor(line, sectors) {
    this.line = line;
    this.spans = solidSpans(line, sectors);
    this.count = Math.max(1, Math.ceil(line.len / SPAN));
    this.grids = new Array(this.count).fill(null);
    this.live = 0;                              // how many have been built
  }

  /** Which span a distance along the line falls in. */
  indexAt(u) {
    return Math.max(0, Math.min(this.count - 1, Math.floor(u / SPAN)));
  }

  /** The lattice for that span, built on demand. */
  gridAt(u) {
    const i = this.indexAt(u);
    let g = this.grids[i];
    if (!g) {
      const u0 = i * SPAN;
      const len = Math.min(SPAN, this.line.len - u0);
      g = this.grids[i] = new VoxelSpan(u0, len, this.spans,
        hash(this.line.index * 31 + i, 0x7f4a));
      this.live++;
    }
    return g;
  }

  get bytes() {
    let n = 0;
    for (const g of this.grids) if (g) n += g.bytes;
    return n;
  }

  /* A round, a jet, a blast — all of them arrive as a point on the line
     and a height, and all of them can reach across a span join, so the
     two neighbours are offered the hit as well. Nothing is built that
     the hit does not actually reach. */
  hit(u, z, amount, radius = VOX) {
    let broke = 0;
    for (const i of this._touched(u, radius)) {
      const g = this.gridAt(i * SPAN);
      broke += g.hit(u, z, amount, radius);
    }
    return broke;
  }

  carve(u, z, radius) {
    let broke = 0;
    for (const i of this._touched(u, radius)) {
      const g = this.gridAt(i * SPAN);
      broke += g.carve(u, z, radius);
    }
    return broke;
  }

  openAt(u, z) {
    const g = this.grids[this.indexAt(u)];
    return g ? g.openAt(u, z) : false;
  }

  _touched(u, radius) {
    const a = this.indexAt(u - radius), b = this.indexAt(u + radius);
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  }

  /** Every lattice that exists, for the geometry builder to walk. */
  *built() {
    for (let i = 0; i < this.count; i++) if (this.grids[i]) yield this.grids[i];
  }
}

/* ---------------------------------------------------------------------
   WHERE ON A LINE A POINT IS

   A hit arrives from js/game.js in world coordinates and the lattice
   thinks in distance along the line, so this is the conversion and it
   is the only place it is written down.
   ------------------------------------------------------------------- */
export function alongLine(l, x, y) {
  return ((x - l.x1) * l.dx + (y - l.y1) * l.dy) / (l.len || 1);
}
