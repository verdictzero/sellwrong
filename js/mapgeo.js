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
      const entry = bank.get(name.split('|').pop());
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
   THE BLOCK IS THE UNIT OF DRAWING

   Everything with the same texture used to go into one buffer, so a
   whole supermarket was about twenty draw calls and every one of them
   had a bounding sphere the size of the store. That is fine for a store
   and it is nothing at all for a town: a batch whose bounds are the
   entire town is never culled, so every brick wall in it is submitted
   every frame whichever way you are facing.

   So a batch is one texture IN ONE BLOCK. Twenty-five blocks by twenty
   textures is more draw calls than twenty — and it is the only way the
   frustum means anything, and it is what lets the portal flood turn a
   block off outright (see applyVisibility below, and SIGHT.txt). It is
   also what makes the char rebuild affordable: when a region finishes
   burning, the block it is in is rebuilt and the other twenty-four are
   left alone.

   The grid is the town's own block pitch, anchored at the world origin,
   which the mall already sits on — see THE GRID in TOWN.txt.
   ------------------------------------------------------------------ */
export const BATCH_BLOCK = 3648;
/* How near you have to be for a block's insides to be drawn. Two block
   pitches: far enough that you never see one arrive, near enough that
   twenty-two of the town's twenty-five blocks are outsides only. */
export const INTERIOR_DIST = BATCH_BLOCK * 2;
const blockOf = (x, y) => Math.floor(x / BATCH_BLOCK) + ',' + Math.floor(y / BATCH_BLOCK);
/** Which block a sector is drawn in: the one its middle lands in. */
export function sectorBlock(s) {
  return blockOf((s.bbox[0] + s.bbox[2]) / 2, (s.bbox[1] + s.bbox[3]) / 2);
}
function lineBlock(l) { return blockOf((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2); }

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
  /* the roofs read their texture sizes from here, being geometry rather
     than a surface any sector owns */
  for (const r of [...(level.roofs || []), ...level.sectors.map(s => s.roof).filter(Boolean)]) {
    for (const n of [r.tex || 'SHINGLE', r.gableTex || r.tex || 'SHINGLE']) {
      const e = bank.get(n);
      if (e) noteTextureSize(n, e.w, e.h);
    }
  }

  /* A line is dynamic if either sector it touches can move, because the
     wall above a door changes height every tic the door is opening. */
  const dynamicLines = new Set();
  for (const l of level.lines) {
    for (const i of l.frontCol) if (level.sectors[i].dynamic) dynamicLines.add(l);
    for (const i of l.backCol) if (level.sectors[i].dynamic) dynamicLines.add(l);
  }
  const staticLines = level.lines.filter(l => !dynamicLines.has(l));
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
  /* WHAT IS IN EACH BLOCK, worked out once. A sector is drawn in the
     block its middle lands in and a line in the block its midpoint
     lands in, so every triangle belongs to exactly one of them and a
     rebuild of one block is complete on its own. */
  const blockSectors = new Map(), blockLines = new Map();
  const push = (m, k, v) => { let a = m.get(k); if (!a) m.set(k, a = []); a.push(v); };
  for (const s of staticSectors) { s.drawBlock = sectorBlock(s); push(blockSectors, s.drawBlock, s); }
  for (const l of staticLines) { const k = lineBlock(l); l.drawBlock = k; push(blockLines, k, l); }
  /* the roofs, which belong to no sector at all — see roofGeometry */
  const blockRoofs = new Map();
  for (const r of level.roofs || []) push(blockRoofs, blockOf((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), r);
  const blockKeys = [...new Set([...blockSectors.keys(), ...blockLines.keys(), ...blockRoofs.keys()])];

  /* AND THE INTERIORS ARE LOD. The buffer is two to four hundred rows
     tall. You cannot see through a forty-eight-unit window at forty
     metres at that resolution — there is nothing there to see. So a
     block's indoor surfaces go in a second group of their own and are
     submitted only when you are near enough to look through a door;
     the shell — the outside walls, the street, the roofs — is always
     there. It is the same trick js/forest.js plays on fifty thousand
     trees.

     A surface is indoors if every region it belongs to is. The wall
     between a hall and the street belongs to both and is shell, which
     is what keeps the house a house from the far end of the block. */
  /* A ROOF IS THE MOST SHELL THING THERE IS. It is not outdoors — you
     could not stand in one — but it is the part of a house you see from
     the far end of the street, and putting it in with the wallpaper
     meant a town whose roofs arrived two blocks away. */
  const indoor = s => !(s.outdoor || s.forest || s.outside || s.roofTex);
  const lineIndoor = l => {
    for (const i of l.frontCol) if (!indoor(level.sectors[i])) return false;
    for (const i of l.backCol) if (!indoor(level.sectors[i])) return false;
    return true;
  };

  /* one Group per block with a shell and an inner child, so a block can
     be hidden in one flag and its insides in another */
  const blockGroups = new Map(), blockMid = new Map();
  for (const k of blockKeys) {
    const g = new THREE.Group();
    g.name = 'block ' + k;
    const shell = new THREE.Group(); shell.name = 'shell';
    const inner = new THREE.Group(); inner.name = 'inner';
    g.add(shell); g.add(inner);
    /* where the block is, for the distance the insides come in at */
    const [bx, by] = k.split(',').map(Number);
    blockMid.set(k, [(bx + 0.5) * BATCH_BLOCK, (by + 0.5) * BATCH_BLOCK]);
    blockGroups.set(k, g);
    staticGroup.add(g);
  }

  function rebuildBlock(k) {
    const g = blockGroups.get(k);
    if (!g) return;
    const [shellG, innerG] = g.children;
    for (const child of [shellG, innerG])
      for (const o of child.children)
        o.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
    shellG.clear(); innerG.clear();
    const set = new BatchSet(), inner = new BatchSet();
    /* WHICH GROUP A SURFACE GOES IN is a question about the surface and
       not about the line it is on: one line carries a kitchen wall and
       the roof over it, and they do not come in at the same distance.
       So the pick is handed down and asked per storey and per band. */
    const pick = sec => (sec && indoor(sec) ? inner : set);
    for (const s of blockSectors.get(k) || []) addFlats(pick(s), level, s, bank);
    for (const l of blockLines.get(k) || []) addLine(lineIndoor(l) ? inner : set, level, l, bank, pick);
    /* AND THE STEEL, over whichever regions have lost their deck. It
       goes in the same BatchSet as everything else, so the whole ruined
       roof of a burnt-out store is one more draw call and not one per
       region — and it is rebuilt with the rest of its block, which is
       what keeps it in step with a fire that is still spreading. */
    for (const s of blockSectors.get(k) || []) if (s.ruinRoof) roofFraming(set, s);
    /* AND THE ROOFS, which no sector can hold: a sector engine cannot
       slope a ceiling and a flat-roofed house is not an American house.
       See roofGeometry. A roof is the most shell thing there is. */
    for (const s of blockSectors.get(k) || []) if (s.roof) roofGeometry(set, s);
    for (const r of blockRoofs.get(k) || []) roofGeometry(set, { roof: r, light: r.light });
    shellG.add(set.toGroup(bank));
    if (inner.map.size) innerG.add(inner.toGroup(bank));
  }

  /**
   * Rebuild the static geometry.
   *
   * With no argument, all of it — which is what startup and a relight
   * want. With a set of block keys, only those: when a region finishes
   * burning, the block it charred in is rebuilt and the rest of the
   * town is left alone. At town scale that is the difference between a
   * hundred thousand triangles and four, twenty times over, during the
   * exact moments the game is at its best.
   */
  function rebuildStatic(blocks = null) {
    for (const k of blocks || blockKeys) rebuildBlock(k);
  }

  /** Which blocks these sectors are drawn in — what to hand rebuildStatic
   *  after a fire has changed some regions' skins. */
  function blocksOf(sectors) {
    const out = new Set();
    for (const s of sectors) if (s.drawBlock) out.add(s.drawBlock);
    return out;
  }

  /**
   * TURN OFF THE BLOCKS YOU CANNOT SEE.
   *
   * The portal flood (Level.visibleSectors, and SIGHT.txt) already says
   * which regions are visible, and this plan's unit of drawing is the
   * block those regions are in — so a block with nothing visible in it
   * is not submitted at all. It is the exact cull rather than the
   * frustum's guess, and on a street grid that is the whole difference:
   * the frustum keeps every block in front of you whether or not a
   * house is standing in the way.
   */
  function applyVisibility(lv, ex = null, ey = null, innerDist = INTERIOR_DIST) {
    const d2 = innerDist * innerDist;
    for (const [k, g] of blockGroups) {
      const list = blockSectors.get(k);
      let on = false;
      if (!list || !list.length) on = true;
      else for (let i = 0; i < list.length; i++) if (lv.isVisible(list[i])) { on = true; break; }
      g.visible = on;
      if (!on || ex === null) continue;
      /* the block's own corner, not its middle: you are close enough to
         see into a house at the near end of a block long before you are
         close to the block */
      const mid = blockMid.get(k);
      const dx = Math.max(0, Math.abs(ex - mid[0]) - BATCH_BLOCK / 2);
      const dy = Math.max(0, Math.abs(ey - mid[1]) - BATCH_BLOCK / 2);
      g.children[1].visible = dx * dx + dy * dy <= d2;
    }
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

  return { group, rebuild, rebuildStatic, blocksOf, applyVisibility,
           blockGroups, dynamicSectors, dynamicLines };
}

/* --------------------------------------------------------------------
   THE ROOF IS NOT A SECTOR

   A sector engine cannot slope a ceiling, and a flat-roofed house is not
   an American house. So a pitched roof is GEOMETRY, generated from the
   building's footprint and pushed into the same BatchSet as everything
   else: two sloped planes and two gable triangles. There is precedent
   for this in the project and it is load-bearing — roofFraming in
   js/ruin.js puts a steel frame over a burnt-out region without any
   sector knowing, and the logo over the entrance is geometry for the
   same reason.

   You never get on a roof. It does not need to be walkable. It needs to
   be a SILHOUETTE, and from the far end of a street the silhouette is
   the entire difference between a town and a row of boxes.

   A sector carries the whole building's roof, not its own share of one:
   `s.roof = { x0, y0, x1, y1, base, rise, tex, gableTex, along }`, where
   `along` is the axis the RIDGE runs down.
   ------------------------------------------------------------------ */
export function roofGeometry(set, s) {
  const r = s.roof;
  if (!r) return 0;
  const { x0, y0, x1, y1, base, rise } = r;
  const tex = r.tex || 'SHINGLE', gtex = r.gableTex || tex;
  const t = bank_h(set, tex), gt = bank_h(set, gtex);
  const b = set.get(tex), gb = set.get(gtex);
  const light = r.light ?? 0.66;
  const sk = r.sky ?? 1;
  const ch = charOf(s);
  const top = base + rise;

  /* the slope length, so the shingles are not stretched up the pitch */
  const halfW = (r.along === 'x' ? (y1 - y0) : (x1 - x0)) / 2;
  const slope = Math.hypot(halfW, rise);

  if (r.along === 'x') {
    const ym = (y0 + y1) / 2;
    /* south face and north face. The map's y is the renderer's minus z. */
    b.quad([[x0, base, -y0], [x1, base, -y0], [x1, top, -ym], [x0, top, -ym]],
           [[0, 0], [(x1 - x0) / t.w, 0], [(x1 - x0) / t.w, slope / t.h], [0, slope / t.h]], light, sk, ch);
    b.quad([[x1, base, -y1], [x0, base, -y1], [x0, top, -ym], [x1, top, -ym]],
           [[0, 0], [(x1 - x0) / t.w, 0], [(x1 - x0) / t.w, slope / t.h], [0, slope / t.h]], light * 0.92, sk, ch);
    /* the gables, east and west */
    gb.tri(x0, base, -y0, 0, 0, x0, top, -ym, halfW / gt.w, rise / gt.h, x0, base, -y1, 2 * halfW / gt.w, 0, light * 0.96, sk, ch);
    gb.tri(x1, base, -y1, 0, 0, x1, top, -ym, halfW / gt.w, rise / gt.h, x1, base, -y0, 2 * halfW / gt.w, 0, light * 0.96, sk, ch);
  } else {
    const xm = (x0 + x1) / 2;
    b.quad([[x0, base, -y1], [x0, base, -y0], [xm, top, -y0], [xm, top, -y1]],
           [[0, 0], [(y1 - y0) / t.w, 0], [(y1 - y0) / t.w, slope / t.h], [0, slope / t.h]], light, sk, ch);
    b.quad([[x1, base, -y0], [x1, base, -y1], [xm, top, -y1], [xm, top, -y0]],
           [[0, 0], [(y1 - y0) / t.w, 0], [(y1 - y0) / t.w, slope / t.h], [0, slope / t.h]], light * 0.92, sk, ch);
    gb.tri(x1, base, -y0, 0, 0, xm, top, -y0, halfW / gt.w, rise / gt.h, x0, base, -y0, 2 * halfW / gt.w, 0, light * 0.96, sk, ch);
    gb.tri(x0, base, -y1, 0, 0, xm, top, -y1, halfW / gt.w, rise / gt.h, x1, base, -y1, 2 * halfW / gt.w, 0, light * 0.96, sk, ch);
  }
  return 1;
}
/* the bank is not handed to roofGeometry, so sizes come off the batch's
   own record of them — set by buildLevelGeometry before any roof is
   drawn. See ROOF_SIZES. */
const ROOF_SIZES = new Map();
export function noteTextureSize(name, w, h) { ROOF_SIZES.set(name, { w, h }); }
function bank_h(set, name) { return ROOF_SIZES.get(name) || { w: 64, h: 64 }; }

/* --------------------------------------------------------------------
   Floors and ceilings

   Flats are aligned to the world grid, not to the sector, which is why
   Doom floors run continuously through a doorway instead of restarting
   at every threshold. u = x/64, v = y/64, and nothing else to decide.
   ------------------------------------------------------------------ */
/* --------------------------------------------------------------------
   A TRIANGLE CUT BY THE RIDGE

   A gable is two planes meeting along a line, and a triangle that
   straddles that line cannot be drawn as one triangle at any height:
   its three corners are on the roof and its middle is not. So it is cut
   into the pieces either side, which is one or three triangles, and
   every corner of every piece then lands on the surface exactly.

   For the rectangles this map is made of it fires twice per roof and
   the rest of the time not at all.
   ------------------------------------------------------------------ */
function splitAtRidge(tri, axis, mid) {
  const u = p => (axis === 'x' ? p[1] : p[0]);
  const side = p => (u(p) > mid ? 1 : u(p) < mid ? -1 : 0);
  const sg = tri.map(side);
  if (sg[0] * sg[1] >= 0 && sg[1] * sg[2] >= 0 && sg[0] * sg[2] >= 0) return [tri];
  /* the lone corner on its own side, and the two crossings */
  let k = 0;
  for (let i = 0; i < 3; i++) if (sg[i] !== 0 && sg[(i + 1) % 3] !== sg[i] && sg[(i + 2) % 3] !== sg[i]) k = i;
  const a = tri[k], b = tri[(k + 1) % 3], c = tri[(k + 2) % 3];
  const cut = (p, q) => {
    const t = (mid - u(p)) / (u(q) - u(p));
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  const ab = cut(a, b), ac = cut(a, c);
  return [[a, ab, ac], [ab, b, c], [ab, c, ac]];
}

/** The triangles of a surface, cut at the ridge if it has one. */
function surfaceTris(pts, tris, slope) {
  const flat = tris.map(([a, b, c]) => [[pts[a].x, pts[a].y], [pts[b].x, pts[b].y], [pts[c].x, pts[c].y]]);
  if (!slope || slope.kind !== 'gable') return flat;
  const out = [];
  for (const t of flat) for (const piece of splitAtRidge(t, slope.axis, slope.mid)) out.push(piece);
  return out;
}

function addFlats(set, level, s, bank) {
  const pts = s.poly.map(p => new THREE.Vector2(p[0], p[1]));
  let tris;
  try { tris = THREE.ShapeUtils.triangulateShape(pts, []); }
  catch (e) { console.warn('sector', s.index, 'would not triangulate', e); return; }

  const sky = s.ceilTex === 'SKY';
  const lit = s.light, sk = skyOf(s), ch = charOf(s);

  if (s.floorTex && s.floorTex !== 'NONE') {
    const t = bank.get(s.floorTex);
    const b = set.get(s.floorTex);   // one set per block, so the name is enough
    /* Floors tile from the world origin unless the sector says
       otherwise; see floorAnchor in js/level.js for the one that does. */
    const ax = s.floorAnchor ? s.floorAnchor[0] : 0;
    const ay = s.floorAnchor ? s.floorAnchor[1] : 0;
    /* and its height is a number until it is a slope, in which case it
       is a number PER CORNER — see A SLOPE in js/level.js */
    const zf = (x, y) => level.floorAt(s, x, y);
    for (const [p0, p1, p2] of surfaceTris(pts, tris, s.slopeFloor)) {
      /* Reversed relative to the map winding: the ring is
         counter-clockwise in map space, and the map's y becomes the
         renderer's MINUS z (see addQuad), which reverses it again. A
         floor you can only see from underneath is a floor you will spend
         an hour debugging. */
      b.tri(
        p0[0], zf(p0[0], p0[1]), -p0[1], (p0[0] - ax) / t.w, -(p0[1] - ay) / t.h,
        p1[0], zf(p1[0], p1[1]), -p1[1], (p1[0] - ax) / t.w, -(p1[1] - ay) / t.h,
        p2[0], zf(p2[0], p2[1]), -p2[1], (p2[0] - ax) / t.w, -(p2[1] - ay) / t.h,
        lit, sk, ch);
    }
  }

  /* A sky ceiling is a hole, not a surface — nothing is drawn and the
     background shows through. */
  const zc = (x, y) => level.ceilAt(s, x, y);
  const ceilTris = surfaceTris(pts, tris, s.slopeCeil);
  if (!sky && s.ceilTex && s.ceilTex !== 'NONE') {
    const t = bank.get(s.ceilTex);
    const b = set.get(s.ceilTex);
    for (const [p0, p1, p2] of ceilTris) {
      b.tri(
        p2[0], zc(p2[0], p2[1]), -p2[1], p2[0] / t.w, -p2[1] / t.h,
        p1[0], zc(p1[0], p1[1]), -p1[1], p1[0] / t.w, -p1[1] / t.h,
        p0[0], zc(p0[0], p0[1]), -p0[1], p0[0] / t.w, -p0[1] / t.h,
        lit, sk, ch);
    }
  }

  /* AND THE SAME SURFACE FROM ABOVE, which is a roof. A ceiling is
     drawn facing down and nothing in this engine ever wanted otherwise,
     because nothing else was the top of a building. One more pass over
     the same triangles wound the other way, wearing the roof's own
     skin, and the shingle you see from the street is the underside of
     the attic you would see from inside it. */
  if (s.roofTex && s.roofTex !== 'NONE') {
    const t = bank.get(s.roofTex);
    const b = set.get(s.roofTex);
    const rl = Math.min(1.2, (s.roofLight ?? s.light));
    for (const [p0, p1, p2] of ceilTris) {
      b.tri(
        p0[0], zc(p0[0], p0[1]), -p0[1], p0[0] / t.w, -p0[1] / t.h,
        p1[0], zc(p1[0], p1[1]), -p1[1], p1[0] / t.w, -p1[1] / t.h,
        p2[0], zc(p2[0], p2[1]), -p2[1], p2[0] / t.w, -p2[1] / t.h,
        rl, 1, ch);
    }
  }
}

/* --------------------------------------------------------------------
   Walls
   ------------------------------------------------------------------ */
function addLine(set, level, l, bank, pick = null) {
  const into = pick || (() => set);
  const oneSided = !l.frontCol.length || !l.backCol.length;
  if (oneSided && !l.frontCol.length && !l.backCol.length) return;

  /* One-sided: a plain wall, floor to ceiling, seen from the column that
     owns it — a storey at a time, so the outside of a three-storey house
     that happens to back onto nothing is still three bands of brick. */
  if (oneSided) {
    const col = l.frontCol.length ? l.frontCol : l.backCol;
    const facingFront = l.frontCol.length > 0;
    for (let i = 0; i < col.length; i++) {
      const s = level.sectors[col[i]];
      /* EACH STOREY IN ITS OWN SKIN. The line carries one middle
         texture, decided from the GROUND sector — which is the right
         answer for the thousand walls that are a column of one, and is
         the only answer that was ever needed. A roof is not made of
         what the kitchen under it is made of, so a storey above the
         ground wears its own; the ground keeps the line's, which is
         what a map file reaches in and sets by hand. */
      const tex = i === 0 ? (l.middle || 'WALL') : (s.wallTex || l.middle || 'WALL');
      if (!tex || tex === 'NONE') continue;
      const dst = into(s);
      const peg = pegOf(l, 'middle', s.floor, s.ceil, s, bank.get(tex).h);
      if (s.slopeCeil || s.slopeFloor) {
        emitWall(dst, l, bank, tex, (x, y) => [level.floorAt(s, x, y), level.ceilAt(s, x, y)],
                 facingFront, peg, s.light + l.contrast, skyOf(s), charOf(s),
                 [s.slopeCeil, s.slopeFloor]);
      } else {
        addQuad(dst, l, bank, tex, s.floor, s.ceil, facingFront, peg,
                s.light + l.contrast, skyOf(s), charOf(s));
      }
    }
    return;
  }

  /* TWO-SIDED: every interval of z where exactly one of the two columns
     is open, which is Doom's upper and lower for a column of one and
     three bands of brick with two ribbons of glass between them for a
     terrace. See lineBands in js/level.js — this function only draws
     what that decided. */
  const bands = l.bands || [];
  for (let i = 0; i < bands.length; i++) {
    const bd = bands[i];
    if (!bd.tex || bd.tex === 'NONE') continue;
    /* A step between two patches of sky draws nothing: there is no
       surface there, only two different heights of nothing. */
    if (bd.kind === 'upper' && bd.open.ceilTex === 'SKY' && bd.from.ceilTex === 'SKY') continue;
    const s = bd.open;
    /* a band between a roof and anything is the roof's, so a gable end
       is shell even where the wall under it is not */
    const dst = (bd.open.roofTex || bd.from.roofTex) ? into(bd.open.roofTex ? bd.open : bd.from) : into(s);
    const peg = pegOf(l, bd.kind, bd.z0, bd.z1, s, bank.get(bd.tex).h);
    /* THE GABLE FACES THE STREET. An upper band over a sector whose
       ceiling is the sky is a wall rising above outdoor ground — the
       gable end of a roof, over the plinth at its foot, whose ceiling
       is put at the eaves so that this band exists at all. Its "open"
       side is the attic, and nobody is in the attic: the side that
       looks at it is the shut one, from under the sky. So it is wound
       to face that side and lit by it, or it is a triangle of board
       facing into the roof space at the attic's sixteenth of a light,
       and from the pavement the house has no gable — which is what it
       had until somebody stood on the pavement. Doom, with no slopes,
       drew nothing here at all; the rule above is the other half of
       that. */
    const gable = bd.kind === 'upper' && bd.from.ceilTex === 'SKY';
    const lit = gable ? bd.from : s;
    const facing = gable ? !bd.openFront : bd.openFront;
    const ch = Math.max(charOf(s), charOf(lit));
    /* WHERE A SLOPE IS IN PLAY the band is not an interval, it is an
       interval AT A POINT. Asked of the same two sectors the band was
       worked out from, so the flat case gives back the same numbers. */
    const emit = (face, light) => {
      if (edgeSlope(bd.e0) || edgeSlope(bd.e1))
        emitWall(dst, l, bank, bd.tex, (x, y) => bandEdges(level, bd, x, y), face, peg,
                 light + l.contrast, skyOf(lit), ch, [edgeSlope(bd.e0), edgeSlope(bd.e1)]);
      else
        addQuad(dst, l, bank, bd.tex, bd.z0, bd.z1, face, peg,
                light + l.contrast, skyOf(lit), ch);
    };
    emit(facing, lit.light);
    /* AND A ROOF SPACE YOU CAN SEE THE INSIDE OF GETS THE INSIDE OF ITS
       GABLE TOO. The rule above winds the gable to face the street
       because the other side of it is an attic and nobody is in an
       attic. A church is the one building where that is false: its nave
       is open to the rafters, so the roof storey has a ceiling you are
       looking at from a pew (see soffit in js/maps/town.js), and the
       far end of it was a triangle of sky — the gable drawn once,
       facing away from the only person who could see it. Drawn the
       other way as well when the roof space is one with a ceiling, and
       lit by that ceiling rather than by the sky outside. It costs the
       houses nothing: their attics say ceilTex NONE and never ask. */
    if (gable && bd.open.ceilTex && bd.open.ceilTex !== 'NONE') emit(!facing, bd.open.light);
  }

  /* A middle texture on a two-sided line is the thing IN the hole: a
     grating, a shop window, a wire shelf you can see through. Drawn both
     ways, masked, spanning the open gap — and once per hole, because a
     house against a street has one hole per storey and each of them is
     a window.

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
    const holes = l.holes || [];
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      /* A HOLE BETWEEN TWO ROOFS IS THE SAME ROOF, and nothing stands
         in it. Every column in a town building ends in the roof storey,
         so a window's own line — glass in the hole between its sill
         and its head — also has the hole between its roof and the
         room's roof over it, and the pane was being hung there too: a
         sheet of coloured glass above the eaves over every window. */
      if (h.front.roofTex && h.back.roofTex) continue;
      const bot = h.z0;
      const top = Math.min(h.z1, bot + (l.midHeight ?? Infinity));
      if (top <= bot) continue;
      const th = bank.get(l.middle).h;
      const peg = l.pegMiddle === 'bottom' ? bot + th : top;
      addQuad(set, l, bank, l.middle, bot, top, true,  peg + l.yoff, h.front.light + l.contrast, skyOf(h.front), charOf(h.front));
      addQuad(set, l, bank, l.middle, bot, top, false, peg + l.yoff, h.back.light + l.contrast, skyOf(h.back), charOf(h.back));
    }
  }
}

/**
 * A WALL, IN AS MANY PIECES AS THE SLOPES OVER IT NEED.
 *
 * A quad's top edge is a straight line between its two ends, and a
 * gable is not: the ridge is a crease, and a wall that runs under one —
 * the end wall of a house, which goes from eaves up over the ridge and
 * down to the other eaves — is a TRIANGLE and not a trapezium. So the
 * line is cut where the ridge crosses it and each piece is a quad
 * again. At most one cut per slope and none at all for every wall in
 * the supermarket.
 */
function emitWall(set, l, bank, tex, zAt, facingFront, peg, light, sk, ch, slopes) {
  const cuts = [];
  for (const sl of slopes) {
    if (!sl || sl.kind !== 'gable') continue;
    const a = sl.axis === 'x' ? l.y1 : l.x1;
    const b = sl.axis === 'x' ? l.y2 : l.x2;
    if ((a - sl.mid) * (b - sl.mid) >= 0 || Math.abs(b - a) < 1e-9) continue;
    const t = (sl.mid - a) / (b - a);
    if (t > 1e-4 && t < 1 - 1e-4) cuts.push(t);
  }
  cuts.sort((p, q) => p - q);
  let prev = 0;
  const at = t => {
    const x = l.x1 + (l.x2 - l.x1) * t, y = l.y1 + (l.y2 - l.y1) * t;
    return zAt(x, y);
  };
  for (const c of [...cuts, 1]) {
    const e0 = at(prev), e1 = at(c);
    addQuad(set, l, bank, tex, [e0[0], e1[0]], [e0[1], e1[1]], facingFront, peg, light, sk, ch,
            prev === 0 && c === 1 ? null : [prev, c]);
    prev = c;
  }
}

/** The bottom and top of a band at a point: each edge is the surface
 *  lineBands cut it at — some storey's floor or ceiling — asked at the
 *  point, so a sloped ceiling gives its own height there and a flat one
 *  gives the number lineBands already had. The first version worked the
 *  edges out again from the band's kind, and got the top of a lower
 *  band wrong wherever the shut storey it was named for was not the
 *  storey that actually bounded it: a window under a roof came out as
 *  brick from the sill to the eaves. */
function edgeAt(level, e, x, y) {
  return e.which === 'floor' ? level.floorAt(e.s, x, y) : level.ceilAt(e.s, x, y);
}
function edgeSlope(e) { return e.which === 'floor' ? e.s.slopeFloor : e.s.slopeCeil; }
function bandEdges(level, bd, x, y) {
  return [edgeAt(level, bd.e0, x, y), edgeAt(level, bd.e1, x, y)];
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

/**
 * One wall quad.
 *
 * `zBot` and `zTop` may each be a number or a PAIR — the height at v1
 * and the height at v2 — which is what a wall under a sloped ceiling
 * needs and is the whole of what a gable end is. A pair collapses to
 * the flat case the moment both of its ends agree, which for every wall
 * built before there were roofs they do.
 */
function addQuad(set, l, bank, texName, zBot, zTop, facingFront, peg, light, sk = 0, ch = 0, span = null) {
  const b1 = Array.isArray(zBot) ? zBot[0] : zBot, b2 = Array.isArray(zBot) ? zBot[1] : zBot;
  const t1 = Array.isArray(zTop) ? zTop[0] : zTop, t2 = Array.isArray(zTop) ? zTop[1] : zTop;
  /* nothing at either end is nothing; a wall that is a triangle — the
     gable at the end of a terrace — has one end of no height at all and
     is still a wall */
  if (t1 - b1 <= 1e-6 && t2 - b2 <= 1e-6) return;
  const t = bank.get(texName);
  const b = set.get(texName);
  /* PART OF A LINE, where a ridge crosses it. See emitWall: a gable is
     two slopes and a quad is one, so the wall under one is drawn in the
     two pieces either side of the ridge. `span` is where along the line
     this piece runs, and the u it wears keeps running from the line's
     own start so the two pieces are one length of brick. */
  const s0 = span ? span[0] : 0, s1 = span ? span[1] : 1;
  const x1 = l.x1 + (l.x2 - l.x1) * s0, y1 = l.y1 + (l.y2 - l.y1) * s0;
  const x2 = l.x1 + (l.x2 - l.x1) * s1, y2 = l.y1 + (l.y2 - l.y1) * s1;
  const len = l.len;

  /* u runs from whichever end this side measures from. Doom starts the
     front side's texture at v1 and the back side's at v2, so a two-sided
     line's two faces both read left-to-right from their own viewpoint. */
  const u0 = (l.xoff + len * s0) / t.w;
  const u1 = (l.xoff + len * s1) / t.w;
  const vB1 = vAt(b1, peg, t.h), vT1 = vAt(t1, peg, t.h);
  const vB2 = vAt(b2, peg, t.h), vT2 = vAt(t2, peg, t.h);
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
      [[x2, t2, -y2], [x1, t1, -y1], [x1, b1, -y1], [x2, b2, -y2]],
      [[u1, vT2],     [u0, vT1],     [u0, vB1],     [u1, vB2]],
      lit, sk, ch);
  } else {
    b.quad(
      [[x1, t1, -y1], [x2, t2, -y2], [x2, b2, -y2], [x1, b1, -y1]],
      [[u1, vT1],     [u0, vT2],     [u0, vB2],     [u1, vB1]],
      lit, sk, ch);
  }
}
