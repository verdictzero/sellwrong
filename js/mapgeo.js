/* =====================================================================
   GROCERY STORE SIMULATOR — turning a floor plan into triangles
   =====================================================================

   A two-sided line is a hole between two sectors, and what you actually
   SEE at that hole is the bit of wall above it and the bit of wall below
   it. Above: the gap between the two ceilings. Below: the gap between the
   two floors. Doom called them the upper and lower textures and every
   piece of level architecture in this game is one of them —

     a doorway      upper only, lower zero
     a shop counter lower only, 40 tall, shoot over it
     a kerb         lower, 8 tall, walk over it without noticing
     a window       upper AND lower, with the gap between them the glass
     a door         upper on a sector whose ceiling is on the floor

   PEGGING is the part everyone forgets and then wonders why their door
   looks wrong. When a sector moves, the wall above it changes height —
   so does the texture on it slide with the sector, or stay nailed to the
   fixed ceiling above? Doom answered with a flag; this answers with two
   named fields, because "pegUpper: 'bottom'" is a sentence and
   "flags |= 0x0008" is a lookup.

   The default is 'bottom', which nails the texture to the MOVING edge, so
   a door's face slides up with the door instead of scrolling past it.
   That is the default precisely because doors are the common case, and
   the common case should need no flag at all.

   BATCHING. Everything with the same texture goes into one buffer, so a
   whole supermarket is about twenty draw calls. Lighting is per-vertex
   and baked, so no lights, no shadows, and nothing to update.
   ===================================================================== */

import * as THREE from 'three';
import { createWallMaterial } from './material.js';
import { roofFraming } from './ruin.js';
import { VOX, SPAN, TORN, RUIN_TORN_VARIANTS, solidSpans } from './voxel.js';

/* A batch collects triangles for one texture and hands back a mesh. */
class Batch {
  constructor(name) {
    this.name = name; this.pos = []; this.uv = []; this.light = []; this.sky = []; this.char = [];
  }
  get empty() { return this.pos.length === 0; }

  /* `sk` is how much of this triangle's light comes from the sky: 0 for
     anything indoors, 1 out in the car park. The shader stretches the
     distance falloff by it, which is the whole reason a parade six
     thousand units long does not read as a black wall. */
  /* `ch` is how burnt this triangle's region is — 0 untouched, about a
     half charred, 1 gutted. The shader puts LIVE COALS on it in the same
     eight colours and on the same clock as the burning trees, so a
     charred wall and a charred fir are one fire going out. */
  /* THERE WAS AN `rg` HERE TOO: which region a triangle belonged to, so
     the shader could look its progress up in a one-texel-per-sector
     picture. It is gone. A sector's progress is one number, and the
     sectors of this map are big rectangles, so every surface in one
     sooted together and a burnt aisle met a clean cross-aisle along a
     dead-straight line. The shader reads the fire's own 32-unit cell
     grid by world position instead (burnAt in js/material.js), which
     needs nothing from the geometry at all. */
  tri(ax, ay, az, au, av, bx, by, bz, bu, bv, cx, cy, cz, cu, cv, l, sk = 0, ch = 0) {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.uv.push(au, av, bu, bv, cu, cv);
    this.light.push(l, l, l);
    this.sky.push(sk, sk, sk);
    this.char.push(ch, ch, ch);
  }

  /* A quad as two triangles, given four corners in winding order. */
  quad(p, u, l, sk = 0, ch = 0) {
    this.tri(p[0][0], p[0][1], p[0][2], u[0][0], u[0][1],
             p[1][0], p[1][1], p[1][2], u[1][0], u[1][1],
             p[2][0], p[2][1], p[2][2], u[2][0], u[2][1], l, sk, ch);
    this.tri(p[0][0], p[0][1], p[0][2], u[0][0], u[0][1],
             p[2][0], p[2][1], p[2][2], u[2][0], u[2][1],
             p[3][0], p[3][1], p[3][2], u[3][0], u[3][1], l, sk, ch);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('light', new THREE.Float32BufferAttribute(this.light, 1));
    g.setAttribute('sky', new THREE.Float32BufferAttribute(this.sky, 1));
    g.setAttribute('charred', new THREE.Float32BufferAttribute(this.char, 1));
    g.computeBoundingSphere();
    return g;
  }
}

class BatchSet {
  constructor() { this.map = new Map(); }
  get(name) {
    let b = this.map.get(name);
    if (!b) { b = new Batch(name); this.map.set(name, b); }
    return b;
  }
  toGroup(bank, opts = {}) {
    const group = new THREE.Group();
    for (const [name, b] of this.map) {
      if (b.empty) continue;
      const entry = bank.get(name);
      const mat = createWallMaterial(entry.texture, { alphaTest: entry.masked ? 0.5 : 0.0, ...opts });
      const mesh = new THREE.Mesh(b.geometry(), mat);
      mesh.frustumCulled = true;
      mesh.name = name;
      group.add(mesh);
    }
    return group;
  }
}

/* --------------------------------------------------------------------
   Vertical texture coordinates

   v(z) = (z - peg) / texHeight, where `peg` is the world height the TOP
   edge of the texture sits at. With repeat wrapping that one line covers
   every pegging case; all the cases below do is work out where the top
   edge goes.
   ------------------------------------------------------------------ */
const vAt = (z, peg, texH) => (z - peg) / texH;

/**
 * Build every triangle in the level.
 *
 * @param level  a built Level
 * @param bank   texture bank: .get(name) -> { texture, w, h, masked }
 * @returns { group, dynamic } — dynamic.rebuild() after a door moves
 */
export function buildLevelGeometry(level, bank) {
  const statics = new BatchSet();

  /* A line is dynamic if either sector it touches can move, because the
     wall above a door changes height every tic the door is opening. */
  const dynamicLines = new Set();
  for (const l of level.lines) {
    const f = l.front !== null ? level.sectors[l.front] : null;
    const b = l.back !== null ? level.sectors[l.back] : null;
    if ((f && f.dynamic) || (b && b.dynamic)) dynamicLines.add(l);
  }
  /* A LINE THAT HAS BEEN SHOT DRAWS ITSELF DIFFERENTLY. Once something
     has put a lattice on a line (js/voxel.js, hung off l.voxels by
     whatever hit it) the line stops being a quad and becomes the
     rectangles its lattice merges down to. It is the same filter the
     doors get four lines up, for the same reason: one list of lines
     that need something other than addLine, taken out of the list that
     does not. */
  const isVoxel = l => !!(l.voxels && l.voxels.live > 0);
  /* AND THE SPLIT IS MADE ON EVERY REBUILD, not once here. A line
     becomes a lattice the moment something shoots it, which is halfway
     through the game — decided once at build time it would be a wall
     that is still a quad in the list that draws quads, and the hole
     would never appear. The doors' list can be settled up front
     because which sectors move is in the map; which walls have been
     shot is not. */
  const fixedLines = level.lines.filter(l => !dynamicLines.has(l));
  const dynamicSectors = level.sectors.filter(s => s.dynamic);
  const staticSectors = level.sectors.filter(s => !s.dynamic);

  const group = new THREE.Group();
  group.name = 'level';
  const staticGroup = new THREE.Group();
  staticGroup.name = 'level-static';
  group.add(staticGroup);

  /* Rebuilt in full when the store changes its skin — which happens when
     a region finishes burning and its textures are swapped for charred
     ones. A whole-level rebuild is a few thousand triangles and about ten
     milliseconds; it happens perhaps twenty times in a level, debounced,
     and it is far simpler than tracking which vertices belong to which
     sector so that a subset could be patched. */
  function rebuildStatic() {
    for (const child of staticGroup.children)
      child.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    staticGroup.clear();
    const set = new BatchSet();
    for (const s of staticSectors) addFlats(set, level, s, bank);
    /* A wall that has been opened up goes in as the rectangles its
       lattice merges down to, and into the SAME BatchSet as everything
       else — so a store shot to pieces is the same twenty draw calls a
       clean one is, and the count does not grow with the damage. */
    for (const l of fixedLines) {
      if (isVoxel(l)) addVoxelWall(set, level, l, bank);
      else addLine(set, level, l, bank);
    }
    /* AND THE STEEL, over whichever regions have lost their deck. It
       goes in the same BatchSet as everything else, so the whole ruined
       roof of a burnt-out store is one more draw call and not one per
       region — and it is rebuilt with the rest of the level, which is
       what keeps it in step with a fire that is still spreading. */
    for (const s of staticSectors) if (s.ruinRoof) roofFraming(set, s);
    staticGroup.add(set.toGroup(bank));
  }
  rebuildStatic();

  /* Doors and lifts get their own buffers, thrown away and rebuilt when
     they move. It is a handful of quads — cheaper than any clever
     partial-update scheme, and impossible to get subtly wrong. */
  const dynGroup = new THREE.Group();
  dynGroup.name = 'level-dynamic';
  group.add(dynGroup);

  function rebuild() {
    for (const child of dynGroup.children) {
      child.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    dynGroup.clear();
    const dyn = new BatchSet();
    for (const s of dynamicSectors) addFlats(dyn, level, s, bank);
    for (const l of dynamicLines) addLine(dyn, level, l, bank);
    dynGroup.add(dyn.toGroup(bank));
  }
  rebuild();

  return { group, rebuild, rebuildStatic, dynamicSectors, dynamicLines };
}

/* --------------------------------------------------------------------
   Floors and ceilings

   Flats are aligned to the world grid, not to the sector, which is why
   Doom floors run continuously through a doorway instead of restarting
   at every threshold. u = x/64, v = y/64, and nothing else to decide.
   ------------------------------------------------------------------ */
function addFlats(set, level, s, bank) {
  const pts = s.poly.map(p => new THREE.Vector2(p[0], p[1]));
  let tris;
  try { tris = THREE.ShapeUtils.triangulateShape(pts, []); }
  catch (e) { console.warn('sector', s.index, 'would not triangulate', e); return; }

  const sky = s.ceilTex === 'SKY';

  if (s.floorTex && s.floorTex !== 'NONE') {
    const t = bank.get(s.floorTex);
    const b = set.get(s.floorTex);
    /* Floors tile from the world origin unless the sector says
       otherwise; see floorAnchor in js/level.js for the one that does. */
    const ax = s.floorAnchor ? s.floorAnchor[0] : 0;
    const ay = s.floorAnchor ? s.floorAnchor[1] : 0;
    for (const [a, bb, c] of tris) {
      /* Reversed relative to the map winding: the ring is
         counter-clockwise in map space, and the map's y becomes the
         renderer's MINUS z (see addQuad), which reverses it again. A
         floor you can only see from underneath is a floor you will spend
         an hour debugging. */
      const p0 = pts[a], p1 = pts[bb], p2 = pts[c];
      b.tri(
        p0.x, s.floor, -p0.y, (p0.x - ax) / t.w, -(p0.y - ay) / t.h,
        p1.x, s.floor, -p1.y, (p1.x - ax) / t.w, -(p1.y - ay) / t.h,
        p2.x, s.floor, -p2.y, (p2.x - ax) / t.w, -(p2.y - ay) / t.h,
        s.light, skyOf(s), charOf(s));
    }
  }

  /* A sky ceiling is a hole, not a surface — nothing is drawn and the
     background shows through. */
  if (!sky && s.ceilTex && s.ceilTex !== 'NONE') {
    const t = bank.get(s.ceilTex);
    const b = set.get(s.ceilTex);
    for (const [a, bb, c] of tris) {
      const p0 = pts[c], p1 = pts[bb], p2 = pts[a];
      b.tri(
        p0.x, s.ceil, -p0.y, p0.x / t.w, -p0.y / t.h,
        p1.x, s.ceil, -p1.y, p1.x / t.w, -p1.y / t.h,
        p2.x, s.ceil, -p2.y, p2.x / t.w, -p2.y / t.h,
        s.light, skyOf(s), charOf(s));
    }
  }
}

/* --------------------------------------------------------------------
   Walls
   ------------------------------------------------------------------ */
function addLine(set, level, l, bank) {
  const front = l.front !== null ? level.sectors[l.front] : null;
  const back  = l.back  !== null ? level.sectors[l.back]  : null;

  if (!front && !back) return;

  /* One-sided: a plain wall, floor to ceiling, seen from the sector that
     owns it. */
  if (!back || !front) {
    const s = front || back;
    const facingFront = !!front;
    const tex = l.middle || 'WALL';
    if (tex === 'NONE') return;
    addQuad(set, l, bank, tex, s.floor, s.ceil, facingFront,
            pegOf(l, 'middle', s.floor, s.ceil, s, bank.get(tex).h),
            s.light + l.contrast, skyOf(s), charOf(s));
    return;
  }

  const skyBoth = front.ceilTex === 'SKY' && back.ceilTex === 'SKY';

  /* Front side. Standing in the front sector looking at the line: the
     upper is what hangs down from your ceiling to theirs, the lower is
     what rises from your floor to theirs. */
  if (front.ceil > back.ceil && l.upper && l.upper !== 'NONE' && !skyBoth)
    addQuad(set, l, bank, l.upper, back.ceil, front.ceil, true,
            pegOf(l, 'upper', back.ceil, front.ceil, front, bank.get(l.upper).h),
            front.light + l.contrast, skyOf(front), charOf(front));

  if (back.floor > front.floor && l.lower && l.lower !== 'NONE')
    addQuad(set, l, bank, l.lower, front.floor, back.floor, true,
            pegOf(l, 'lower', front.floor, back.floor, front, bank.get(l.lower).h),
            front.light + l.contrast, skyOf(front), charOf(front));

  /* Back side — the same two pieces, seen the other way round. */
  if (back.ceil > front.ceil && l.upper && l.upper !== 'NONE' && !skyBoth)
    addQuad(set, l, bank, l.upper, front.ceil, back.ceil, false,
            pegOf(l, 'upper', front.ceil, back.ceil, back, bank.get(l.upper).h),
            back.light + l.contrast, skyOf(back), charOf(back));

  if (front.floor > back.floor && l.lower && l.lower !== 'NONE')
    addQuad(set, l, bank, l.lower, back.floor, front.floor, false,
            pegOf(l, 'lower', back.floor, front.floor, back, bank.get(l.lower).h),
            back.light + l.contrast, skyOf(back), charOf(back));

  /* A middle texture on a two-sided line is the thing IN the hole: a
     grating, a shop window, a wire shelf you can see through. Drawn both
     ways, masked, spanning the open gap.

     UNLESS IT IS SHORTER THAN THE HOLE, which is what `midHeight` is
     for. A grating fills its opening and a shop window fills its
     opening, so the gap is the right answer for both. A FENCE is not:
     it is eight feet of chain link standing on a line between two
     patches of wood that are open to the sky, and spanning the gap
     there means stretching the mesh from the ground to the cloud base
     and tiling it five times on the way up. So a line may say how tall
     the thing standing in it is, measured up from the floor it stands
     on, and the opening stays the LIMIT rather than the answer. */
  if (l.middle && l.middle !== 'NONE') {
    const bot = Math.max(front.floor, back.floor);
    const top = Math.min(front.ceil, back.ceil, bot + (l.midHeight ?? Infinity));
    if (top > bot) {
      const th = bank.get(l.middle).h;
      const peg = l.pegMiddle === 'bottom' ? bot + th : top;
      addQuad(set, l, bank, l.middle, bot, top, true,  peg + l.yoff, front.light + l.contrast, skyOf(front), charOf(front));
      addQuad(set, l, bank, l.middle, bot, top, false, peg + l.yoff, back.light + l.contrast, skyOf(back), charOf(back));
    }
  }
}

/* Where the top edge of the texture sits, in world height. */
function pegOf(l, which, zLow, zHigh, sector, texH) {
  let peg;
  if (which === 'upper') {
    /* 'bottom' nails the texture to the lower (moving) ceiling, so a
       door's face travels with the door. This is the default because
       doors are the common case. */
    peg = (l.pegUpper === 'top') ? zHigh : zLow + texH;
  } else if (which === 'lower') {
    /* 'top' nails it to the top of the step, which is what a counter, a
       kerb and a pallet all want. Doom's own default measured down from
       the ceiling instead; that is available, but it is not the one you
       reach for. */
    peg = (l.pegLower === 'ceiling') ? sector.ceil : zHigh;
  } else {
    peg = (l.pegMiddle === 'bottom') ? zLow + texH : zHigh;
  }
  return peg + l.yoff;
}

/**
 * One wall quad.
 *
 * `facingFront` decides the winding. The front sector is on the RIGHT of
 * v1->v2, so a quad wound v1,v2 faces LEFT — the back. Getting this
 * backwards gives you a level you can see straight through from outside
 * and not at all from inside.
 */
/* How much sky a sector's surfaces see. Declared per sector so a canopy
   can be half way between a car park and a corridor, which is what a
   canopy is; falls back to the plain outdoor/indoor answer. */
function skyOf(s) { return s ? (s.sky ?? (s.outdoor ? 1 : 0)) : 0; }
/* Charred is halfway and gutted is all the way, because a gutted region
   is not a darker charred one — it is the same surface with rather more
   of it still alight. */
export function charOf(s) { return s ? (s.gutted ? 1 : s.charred ? 0.55 : 0) : 0; }

function addQuad(set, l, bank, texName, zBot, zTop, facingFront, peg, light, sk = 0, ch = 0) {
  if (zTop <= zBot) return;
  const t = bank.get(texName);
  const b = set.get(texName);
  const { x1, y1, x2, y2, len } = l;

  /* u runs from whichever end this side measures from. Doom starts the
     front side's texture at v1 and the back side's at v2, so a two-sided
     line's two faces both read left-to-right from their own viewpoint. */
  const u0 = l.xoff / t.w;
  const u1 = (l.xoff + len) / t.w;
  const vB = vAt(zBot, peg, t.h), vT = vAt(zTop, peg, t.h);
  const lit = Math.max(0.02, Math.min(1.4, light));

  /* THE MAP'S Y IS THE RENDERER'S MINUS Z, and it has to be, everywhere.
     A map with x east and y north laid onto a renderer with x east and z
     north is LEFT-handed: everything still works — movement, collision,
     the camera, sprites, all of it self-consistent — and the picture is a
     mirror image of the floor plan. Nobody notices for months, because
     nothing in a supermarket is chiral. Then you put the words TO LET on
     a shopfront and they come out backwards, and so does the fascia, and
     so does the sign at the mouth of the car park. All three of those
     signs have since come down; the logo over the entrance has not, and
     it would mirror just as happily.

     Negating y is the fix, and negating y reverses the screen winding of
     every polygon, so every winding here and in addFlats is reversed to
     match. That is why the quads below read top-to-bottom rather than
     bottom-to-top: it is not a style, it is the other half of the sign
     change. */
  if (facingFront) {
    b.quad(
      [[x2, zTop, -y2], [x1, zTop, -y1], [x1, zBot, -y1], [x2, zBot, -y2]],
      [[u1, vT],        [u0, vT],        [u0, vB],        [u1, vB]],
      lit, sk, ch);
  } else {
    b.quad(
      [[x1, zTop, -y1], [x2, zTop, -y2], [x2, zBot, -y2], [x1, zBot, -y1]],
      [[u1, vT],        [u0, vT],        [u0, vB],        [u1, vB]],
      lit, sk, ch);
  }
}

/* --------------------------------------------------------------------
   A WALL THAT HAS BEEN OPENED UP

   js/voxel.js merges a shot wall down to as few rectangles as it will
   go into and hands them over in LATTICE coordinates — how far along
   the line, how far up, how far into the thickness — with one of the
   three ranges collapsed to name the plane the face lies in. This turns
   those into triangles, and it is the only part of the voxel work that
   knows what a renderer is.

   THE TWO FACES ACROSS THE THICKNESS ARE THE WALL and they have to land
   exactly where addQuad would have put them, texture and all, or
   voxelising a shopfront changes the picture before anybody has fired
   at it. So they take the same u from the same end, the same peg, the
   same light and the same charring — the arithmetic below is addQuad's,
   evaluated at a distance along the line rather than at its two ends.
   The smoke test holds one against the other, vertex by vertex.

   EVERY OTHER FACE IS TORN. You are only looking at it because the wall
   is open, so it gets RUINWALL — broken board with the studs standing
   behind it, which the fire already uses on a gutted region and which
   is doing exactly the same job here an inch at a time.

   THE WINDING IS NOT DERIVED, IT IS CHECKED. Six directions, two
   handednesses depending on which side of the line the sector is on,
   and the map's y becoming the renderer's minus z on top of both — that
   is twelve cases to get right by reasoning and one to get right by
   measuring. So the quad is built in any order, its normal is taken
   with a cross product, and if it points the wrong way the corners are
   reversed. It costs a cross product per rectangle and it cannot be
   subtly wrong.
   ------------------------------------------------------------------ */
function addVoxelWall(set, level, l, bank) {
  const front = l.front !== null ? level.sectors[l.front] : null;
  const back  = l.back  !== null ? level.sectors[l.back]  : null;
  const s = front || back;
  if (!s) return;

  const facingFront = !!front;
  const wallTex = l.middle || 'WALL';
  if (wallTex === 'NONE') return;
  const wt = bank.get(wallTex);
  const peg = pegOf(l, 'middle', s.floor, s.ceil, s, wt.h);
  const lit = Math.max(0.02, Math.min(1.4, s.light + l.contrast));
  const sk = skyOf(s), ch = charOf(s);

  /* the line's own frame, in map space: along it, and into it */
  const ux = l.dx / l.len, uy = l.dy / l.len;
  /* the front sector is on the RIGHT of v1->v2, so its normal is
     (dy,-dx); the wall goes the other way, into the void behind */
  const nx = uy, ny = -ux;
  const wx = facingFront ? -nx : nx;
  const wy = facingFront ? -ny : ny;

  /* u runs from whichever end this side measures from — see addQuad */
  const uAt = a => (l.xoff + (facingFront ? a : l.len - a)) / wt.w;

  const P = (a, z, w) => [l.x1 + ux * a + wx * w, z, -(l.y1 + uy * a + wy * w)];

  /* THE WINDING IS NOT DERIVED, IT IS CHECKED — see the note above. The
     quad goes in wound any way at all, its normal is taken with a cross
     product, and the corners are reversed if it came out facing the
     wrong way. `o` is where the face is SUPPOSED to look, in the
     renderer's axes. */
  const put = (b, p, uv, ox, oy, oz) => {
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * ox + cy * oy + cz * oz < 0) { p.reverse(); uv.reverse(); }
    b.quad(p, uv, lit, sk, ch);
  };
  /* where the face of the wall looks: back out of it, toward the room.
     A map direction (mx, my, up) lands at (mx, up, -my). */
  const faceX = -wx, faceY = 0, faceZ = wy;

  /* THE REST OF THE WALL IS STILL A WALL, and forgetting that is how
     you put a round into a shopfront and take down sixty metres of it.
     A lattice is built for the SPAN that was hit and for no other, but
     the line is out of the list that draws quads the moment the first
     of them exists — so every span without one has to be drawn here or
     it is drawn by nothing at all. Runs of them go out as ONE quad, so
     a wall with a single hole in it is two quads and a lattice rather
     than twenty, and a wall nobody has touched is the one quad it has
     always been. */
  {
    let run = -1;
    const flush = (from, to) => {
      if (from < 0) return;
      const a0 = from * SPAN, a1 = Math.min(to * SPAN, l.len);
      if (a1 <= a0) return;
      for (const sp of solidSpans(l, level.sectors)) {
        const b = set.get(wallTex);
        const p = [P(a0, sp.z1, 0), P(a1, sp.z1, 0), P(a1, sp.z0, 0), P(a0, sp.z0, 0)];
        const uv = [[uAt(a0), (sp.z1 - peg) / wt.h], [uAt(a1), (sp.z1 - peg) / wt.h],
                    [uAt(a1), (sp.z0 - peg) / wt.h], [uAt(a0), (sp.z0 - peg) / wt.h]];
        put(b, p, uv, faceX, faceY, faceZ);
      }
    };
    for (let i = 0; i < l.voxels.count; i++) {
      if (l.voxels.grids[i]) { flush(run, i); run = -1; }
      else if (run < 0) run = i;
    }
    flush(run, l.voxels.count);
  }

  for (const span of l.voxels.built()) {
    const tornTex = 'RUINWALL' + span.tornVariant;
    const tt = bank.get(tornTex);

    span.mesh((slot, axis, sign, iu0, iu1, iz0, iz1, iw0, iw1) => {
      /* CLIPPED BACK TO THE WALL. A lattice is a whole number of cubes
         and a wall is not: a 180-unit line is 23 voxels of 8 with four
         units over, and a 228-tall unit is 29 with four over. Drawn as
         it is stored, every wall in the building is half a voxel too
         long and half a voxel too tall, which is a wall through its own
         corner and a texture that no longer lines up with the one on
         the line next door. So the lattice is generous going in — see
         the fill rule in js/voxel.js — and the rectangles are clipped
         back to the real wall coming out. */
      const a0 = Math.min(span.u0 + iu0 * VOX, l.len);
      const a1 = Math.min(span.u0 + iu1 * VOX, l.len);
      const z0 = Math.min(span.zBot + iz0 * VOX, span.zTop);
      const z1 = Math.min(span.zBot + iz1 * VOX, span.zTop);
      if (a0 === a1 && axis !== 0) return;
      if (z0 === z1 && axis !== 1) return;
      const w0 = iw0 * VOX, w1 = iw1 * VOX;

      const torn = slot === TORN;
      const t = torn ? tt : wt;
      const b = set.get(torn ? tornTex : wallTex);

      /* the four corners, and the two texture coordinates that vary
         with them. Which pair varies is which plane the face is in. */
      let p, uv;
      if (axis === 2) {                       // the wall itself
        p = [P(a0, z1, w0), P(a1, z1, w0), P(a1, z0, w0), P(a0, z0, w0)];
        uv = [[uAt(a0), (z1 - peg) / t.h], [uAt(a1), (z1 - peg) / t.h],
              [uAt(a1), (z0 - peg) / t.h], [uAt(a0), (z0 - peg) / t.h]];
      } else if (axis === 0) {                // a torn edge down the side
        p = [P(a0, z1, w0), P(a0, z1, w1), P(a0, z0, w1), P(a0, z0, w0)];
        uv = [[(a0 + w0) / t.w, (z1 - peg) / t.h], [(a0 + w1) / t.w, (z1 - peg) / t.h],
              [(a0 + w1) / t.w, (z0 - peg) / t.h], [(a0 + w0) / t.w, (z0 - peg) / t.h]];
      } else {                                // a torn edge along the top or the sill
        p = [P(a0, z0, w0), P(a1, z0, w0), P(a1, z0, w1), P(a0, z0, w1)];
        uv = [[(l.xoff + a0) / t.w, (z0 + w0 - peg) / t.h], [(l.xoff + a1) / t.w, (z0 + w0 - peg) / t.h],
              [(l.xoff + a1) / t.w, (z0 + w1 - peg) / t.h], [(l.xoff + a0) / t.w, (z0 + w1 - peg) / t.h]];
      }

      /* which way it is supposed to face, in the renderer's axes: a map
         direction (mx, my, up) lands at (mx, up, -my) */
      let ox, oy, oz;
      if (axis === 0)      { ox = sign * ux; oy = 0;    oz = -sign * uy; }
      else if (axis === 1) { ox = 0;         oy = sign; oz = 0; }
      else                 { ox = sign * wx; oy = 0;    oz = -sign * wy; }

      put(b, p, uv, ox, oy, oz);
    });
  }
}
