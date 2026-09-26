/* =====================================================================
   GROCERY STORE SIMULATOR — THE SPRAWL, a demo level
   =====================================================================

   At the user's request: a sprawling demo level made of ALL THE ASSETS
   THE USER HAS GIVEN, AND NONE THAT WERE GENERATED. It is an editor
   document (js/editor/doc.js), built here in code, so the game plays it
   (`?demo`, see js/main.js) and GSS-EDIT opens it (File > Open demo:
   THE SPRAWL) to be taken apart and changed.

   WHAT IS THE USER'S, and so what is in it:

     the texture pack    every group of it — the concrete, the nature
                         set, the ops room and its animated panels and
                         doors, the cube farm, the mansion, the street
                         and the car park, the water and the waterfall,
                         the test patterns and the debug set, the
                         backdrops, the odd ones out (js/texpack.js)
     a skybox            BSKY2, the pack's low sun
     the plants          the wood's firs, bushes, ferns and grass (the
                         golf project's sprites) and the six photographed
                         street trees (assets/forest)
     the photographs     the headstones, the cemetery iron (RAILING) and
                         the cobra-head street lamp
     the people          the shoppers and townsfolk (the galvarius
                         crowd, assets/people)

   WHAT IS NOT: every texture js/textures.js paints for itself (GRIDWALL,
   the brick, the drawn hedge), and the drawn things — the trolley, the
   bollard, the crate, the fuel can and the ceiling lamp. The smoke test
   holds the document to that (see THE SPRAWL there).

   THE LAYOUT. Sixteen blocks, four by four, 3200 units a side, with
   roads 768 wide between them and round them — a little over half a
   kilometre across at 32 units to the metre — inside a wall of cliffs,
   with the pack's painted backdrops stood in front of the cliffs on
   every side. Each block is a district, and each district is one part
   of the pack (the table at the bottom of this file). The start is the
   crossroads in the middle.

   Every sector is a rectangle or a ring of points, anticlockwise, and
   every one sits strictly inside its parent — a hole in it, which the
   compiler deals with — so no two share a partial edge.
   ===================================================================== */

import { SECTOR_DEFAULTS, DOC_FORMAT, DOC_VERSION, defaultWorld, lineKey } from '../editor/doc.js';

export const SPRAWL_NAME = 'THE SPRAWL';
/** the map, and its blocks */
export const SPRAWL_SIZE = 16384;
const BLOCK = 3200, ROAD = 768;
const blockAt = i => ROAD + i * (BLOCK + ROAD);
/** the crossroads in the middle, where the start stands */
export const SPRAWL_START = [blockAt(2) - ROAD / 2, blockAt(2) - ROAD / 2];

/** Build THE SPRAWL. Pure, and the same every time. */
export function sprawlDoc() {
  const S = SPRAWL_SIZE;
  const d = {
    format: DOC_FORMAT, version: DOC_VERSION, name: SPRAWL_NAME,
    vertices: [], sectors: [], lines: {}, things: [], textures: [], props: [], scatters: [],
    world: {
      ...defaultWorld(), skybox: 'BSKY2',
      /* a warm low sun: the light a little gold, and a faint haze of the
         same over everything, which the earth box likes */
      lightColor: '#fff0dc',
      ambient: { color: '#302418', amount: 0.25 },
      fog: { color: '#b8a488', density: 2 },
      fogAmbient: 0.5,
    },
    nextId: 1,
  };
  const vmap = new Map();
  const v = (x, y) => {
    const k = `${x},${y}`;
    let i = vmap.get(k);
    if (i === undefined) { i = d.vertices.length; d.vertices.push([x, y]); vmap.set(k, i); }
    return i;
  };
  const id = () => d.nextId++;
  let seed = 20260926 >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = a => a[(rnd() * a.length) | 0];

  /* ---- the pieces -------------------------------------------------- */
  const sector = (pts, props) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    if (a < 0) pts = [...pts].reverse();
    /* no sector falls back to the editor's own GRIDWALL: an edge with no
       wall of its own wears its step's texture, or the pack's kerb */
    const own = { wallTex: props.lowerTex || 'CONC_2', upperTex: null, lowerTex: props.wallTex || 'CONC_2' };
    const s = { ...SECTOR_DEFAULTS, ...own, ...props, id: id(), verts: pts.map(([x, y]) => v(x, y)) };
    d.sectors.push(s);
    return s;
  };
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  /* A RECTANGLE WITH GAPS IN ITS SIDES — doorways, gates — as a ring,
     and the gap segments, to be marked. A door is { side: 's'|'e'|'n'|'w',
     at: its middle along that side, w: its width }. */
  const gapped = (x0, y0, x1, y1, doors = []) => {
    const on = side => doors.filter(g => g.side === side);
    const pts = [], gaps = [];
    const run = (from, to, side, horiz) => {
      pts.push(from);
      const ds = on(side).map(g => [g.at - g.w / 2, g.at + g.w / 2]);
      const forward = horiz ? to[0] > from[0] : to[1] > from[1];
      ds.sort((p, q) => (forward ? p[0] - q[0] : q[0] - p[0]));
      for (const [lo, hi] of ds) {
        const [a, b] = forward ? [lo, hi] : [hi, lo];
        const P = horiz ? [a, from[1]] : [from[0], a], Q = horiz ? [b, from[1]] : [from[0], b];
        pts.push(P, Q);
        gaps.push([P, Q]);
      }
    };
    run([x0, y0], [x1, y0], 's', true);
    run([x1, y0], [x1, y1], 'e', false);
    run([x1, y1], [x0, y1], 'n', true);
    run([x0, y1], [x0, y0], 'w', false);
    return { pts, gaps };
  };
  const line = (p, q, o) => { const k = lineKey(v(p[0], p[1]), v(q[0], q[1])); d.lines[k] = { ...(d.lines[k] || {}), ...o }; };
  /* every edge of a ring */
  const edges = pts => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
  /* a building: an inside sector, with doorways that are openings */
  const building = (x0, y0, x1, y1, props, doors = [], doorTex = null) => {
    const g = gapped(x0, y0, x1, y1, doors);
    const s = sector(g.pts, { outdoor: false, ...props });
    for (const [p, q] of g.gaps) line(p, q, doorTex ? { opening: true, midTex: doorTex, blocking: true } : { opening: true });
    return s;
  };
  const thing = (type, x, y, extra = {}) => d.things.push({ id: id(), type, x: Math.round(x), y: Math.round(y), angle: 0, ...extra });
  const plant = (kind, x, y, scale = 1) => thing('PLANT', x, y, { kind, scale });
  const prop = (x0, y0, x1, y1, z0, z1, tex, topTex = tex) =>
    d.props.push({ id: id(), x0, y0, x1, y1, z0, z1, tex, topTex });
  const scatter = (area, items, density, spacing, clump = 0.3, extra = {}) =>
    d.scatters.push({ id: id(), name: extra.name || 'spread', area, items, density, spacing, clump, seed: (rnd() * 1e6) | 0,
                      scaleMin: extra.scaleMin ?? 1, scaleMax: extra.scaleMax ?? 1 });
  const inRect = (x0, y0, x1, y1) => ({ kind: 'rect', x0, y0, x1, y1 });
  /* a sign: a slot of a sector with a picture standing in its long edge,
     masked, so the sky shows round it */
  const sign = (x0, y0, x1, y1, tex, floor, face = 's', props = {}) => {
    const s = sector(rect(x0, y0, x1, y1), { floor, ceil: floor + 1024, floorTex: props.floorTex || 'CONC_2', wallTex: 'CONC_2', lowerTex: 'CONC_2', light: 0.8, ...props });
    const E = { s: [[x0, y0], [x1, y0]], n: [[x1, y1], [x0, y1]], w: [[x0, y1], [x0, y0]], e: [[x1, y0], [x1, y1]] }[face];
    line(E[0], E[1], { midTex: tex, blocking: true });
    return s;
  };
  const FIRS = ['fir_tall_1', 'fir_tall_2', 'fir_medium', 'fir_young'];
  const STREET = ['street_round', 'street_broad', 'street_oval', 'street_upright', 'street_dense', 'street_big'];

  /* ---- THE GROUND: the roads, walled in by cliffs ------------------- */
  const ground = sector(rect(0, 0, S, S), {
    name: 'the roads', floor: 0, ceil: 1024, floorTex: 'ASPHALT1', wallTex: 'CLIFF2', lowerTex: 'CONC_2', light: 0.78,
  });

  /* THE BACKDROPS, the pack's painted horizons, stood 192 in front of
     the cliffs round the rim, their faces to the town */
  const rim = 192, slot = 32;
  const BACK = { n: ['TREEBACK', 'MEADOWBG', 'TREEBACK'], s: ['MOUNTBG', 'CLOUDS02', 'MOUNTBG'],
                 e: ['MEADOWBG', 'TREEBACK', 'MEADOWBG'], w: ['MOUNTBG', 'CLOUDS01', 'TREELINE'] };
  const third = (S - 2 * rim) / 3;
  for (let k = 0; k < 3; k++) {
    const a = rim + k * third + 64, b = rim + (k + 1) * third - 64;
    sign(a, S - rim - slot, b, S - rim, BACK.n[k], 0, 's', { name: 'backdrop', floorTex: 'ASPHALT1' });
    sign(a, rim, b, rim + slot, BACK.s[k], 0, 'n', { name: 'backdrop', floorTex: 'ASPHALT1' });
    sign(S - rim - slot, a, S - rim, b, BACK.e[k], 0, 'w', { name: 'backdrop', floorTex: 'ASPHALT1' });
    sign(rim, a, rim + slot, b, BACK.w[k], 0, 'e', { name: 'backdrop', floorTex: 'ASPHALT1' });
  }
  /* and the smaller strips in front of those, at the corners */
  sign(rim + 1024, S - rim - 224, rim + 1536, S - rim - 224 + slot, 'MNTN0001', 0, 's', { name: 'backdrop', floorTex: 'ASPHALT1' });
  sign(S - rim - 1536, rim + 192, S - rim - 1024, rim + 192 + slot, 'RUINLINE', 0, 'n', { name: 'backdrop', floorTex: 'ASPHALT1' });

  /* ---- THE BLOCKS -------------------------------------------------- */
  const CURB = 8;
  const blocks = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x0 = blockAt(i), y0 = blockAt(j), x1 = x0 + BLOCK, y1 = y0 + BLOCK;
    const walk = sector(rect(x0, y0, x1, y1), {
      name: `pavement ${i},${j}`, floor: CURB, ceil: 1024, floorTex: 'SIDEWLK1', wallTex: 'CONC_2', lowerTex: 'CONC_2', light: 0.78,
    });
    blocks.push({ i, j, x0, y0, x1, y1, walk, ix0: x0 + 192, iy0: y0 + 192, ix1: x1 - 192, iy1: y1 - 192 });
    /* STREET LAMPS round every block, arms over the road, and a street
       tree between each pair — the photographed ones */
    const step = 800;
    for (let t = step / 2; t < BLOCK; t += step) {
      thing('STREETLAMP', x0 + t, y0 + 64, { angle: -Math.PI / 2 });
      thing('STREETLAMP', x0 + t, y1 - 64, { angle: Math.PI / 2 });
      thing('STREETLAMP', x0 + 64, y0 + t, { angle: Math.PI });
      thing('STREETLAMP', x1 - 64, y0 + t, { angle: 0 });
      if (t + step / 2 < BLOCK) {
        plant(pick(STREET), x0 + t + step / 2, y0 + 96);
        plant(pick(STREET), x0 + t + step / 2, y1 - 96);
        plant(pick(STREET), x0 + 96, y0 + t + step / 2);
        plant(pick(STREET), x1 - 96, y0 + t + step / 2);
      }
    }
  }
  const B = (i, j) => blocks[j * 4 + i];

  /* ---- 0,0 THE PARK: lawn, a pond, ivy hedges, trees --------------- */
  {
    const b = B(0, 0);
    const lawn = sector(rect(b.ix0, b.iy0, b.ix1, b.iy1), { name: 'park lawn', floor: CURB, floorTex: 'LAWN1', lowerTex: 'DIRT_02', wallTex: 'DIRT_02', light: 0.82 });
    const cx = (b.ix0 + b.ix1) / 2, cy = (b.iy0 + b.iy1) / 2;
    /* the pond: an octagon, lowered, of the pack's animated water */
    const oct = r => Array.from({ length: 8 }, (_, k) => [Math.round(cx + r * Math.cos(k * Math.PI / 4 + Math.PI / 8)), Math.round(cy + r * Math.sin(k * Math.PI / 4 + Math.PI / 8))]);
    sector(oct(560), { name: 'pond bank', floor: CURB - 4, floorTex: 'DIRT_01', lowerTex: 'DIRT_02', wallTex: 'DIRT_02', light: 0.8 });
    sector(oct(480), { name: 'pond', floor: -24, floorTex: 'WAT201', lowerTex: 'ROCK_01', wallTex: 'ROCK_01', light: 0.8 });
    /* hedges: raised sectors of ivy, too tall to step onto */
    for (const [hx0, hy0, hx1, hy1] of [[b.ix0 + 256, b.iy0 + 256, b.ix0 + 1024, b.iy0 + 320], [b.ix1 - 1024, b.iy0 + 256, b.ix1 - 256, b.iy0 + 320],
                                        [b.ix0 + 256, b.iy1 - 320, b.ix0 + 1024, b.iy1 - 256], [b.ix1 - 1024, b.iy1 - 320, b.ix1 - 256, b.iy1 - 256]]) {
      sector(rect(hx0, hy0, hx1, hy1), { name: 'hedge', floor: CURB + 48, floorTex: 'IVY1', lowerTex: 'IVY1', wallTex: 'IVY1', light: 0.78 });
    }
    scatter({ kind: 'sectors', ids: [lawn.id] }, [...STREET.map(k => ({ type: `PLANT:${k}`, w: 2 })), { type: 'PLANT:fir_medium', w: 2 }, { type: 'PLANT:bush_large_1', w: 2 }, { type: 'PLANT:bush_small_2', w: 2 }],
            5, 220, 0.4, { name: 'park trees', scaleMin: 0.85, scaleMax: 1.15 });
    scatter({ kind: 'sectors', ids: [lawn.id] }, [{ type: 'TOWNIE', w: 3 }, { type: 'SHOPPER', w: 1 }], 3, 180, 0.2, { name: 'strollers' });
  }

  /* ---- 1,0 THE CAR PARK, and a kiosk ------------------------------- */
  {
    const b = B(1, 0);
    const lot = sector(rect(b.ix0, b.iy0, b.ix1, b.iy1), { name: 'car park', floor: CURB, floorTex: 'PARKLOT1', lowerTex: 'CONC_3', wallTex: 'CONC_3', light: 0.8 });
    /* the bays, in the other two markings, and hazard strips between */
    for (let r = 0; r < 3; r++) {
      const y = b.iy0 + 256 + r * 640;
      sector(rect(b.ix0 + 256, y, b.ix1 - 256, y + 384), { name: 'bays', floor: CURB, floorTex: r % 2 ? 'PARKLOT3' : 'PARKLOT2', lowerTex: 'CONC_3', light: 0.8 });
      sector(rect(b.ix0 + 256, y + 448, b.ix1 - 256, y + 480), { name: 'hazard strip', floor: CURB + 4, floorTex: 'CAUTSTR2', lowerTex: 'CAUTSTR2', light: 0.8 });
    }
    building(b.ix1 - 576, b.iy1 - 448, b.ix1 - 128, b.iy1 - 128, { name: 'kiosk', floor: CURB, ceil: CURB + 144, floorTex: 'CONC_5', ceilTex: 'CONC_5', wallTex: 'CONC_3', light: 0.7 },
             [{ side: 's', at: b.ix1 - 352, w: 96 }]);
    scatter({ kind: 'sectors', ids: [lot.id] }, [{ type: 'SHOPPER', w: 3 }, { type: 'TOWNIE', w: 1 }], 5, 150, 0.4, { name: 'shoppers' });
  }

  /* ---- 2,0 THE CUBE FARM: an office floor of cubicles --------------- */
  {
    const b = B(2, 0);
    const x0 = b.ix0 + 128, y0 = b.iy0 + 128, x1 = b.ix1 - 128, y1 = b.iy1 - 128, f = CURB;
    const office = building(x0, y0, x1, y1, {
      name: 'cube farm', floor: f, ceil: f + 224, floorTex: 'OFCCARP1', ceilTex: 'OFCCEIL1', wallTex: 'OFCCUB01', light: 0.86, lightColor: '#f4f8ff',
    }, [{ side: 's', at: (x0 + x1) / 2, w: 128 }, { side: 'n', at: (x0 + x1) / 2, w: 128 }, { side: 'w', at: (y0 + y1) / 2, w: 128 }]);
    /* cubicles: partitions of the pack's cubicle panels, a desk in each,
       a monitor and a keyboard on it, aisles between */
    const cw = 256, ch = 224, aisle = 160;
    for (let cxk = x0 + 256; cxk + 2 * cw < x1 - 256; cxk += 2 * cw + aisle) {
      for (let cyk = y0 + 320; cyk + ch < y1 - 320; cyk += ch + 96) {
        if (Math.abs(cyk + ch / 2 - (y0 + y1) / 2) < 160) continue;       // the main aisle
        for (const [px, face] of [[cxk, 1], [cxk + cw, -1]]) {
          prop(px, cyk, px + cw, cyk + 8, f, f + 80, 'OFCCUB03', 'OFCCUB02');
          prop(face > 0 ? px : px + cw - 8, cyk, face > 0 ? px + 8 : px + cw, cyk + ch, f, f + 80, 'OFCCUB03', 'OFCCUB02');
          const dx = px + cw / 2;
          prop(dx - 80, cyk + 16, dx + 80, cyk + 72, f, f + 36, 'OFCDESK2', 'OFCDESK1');
          prop(dx - 32, cyk + 24, dx + 32, cyk + 32, f + 36, f + 72, 'MONITOR', 'OFCCUB02');
          prop(dx - 28, cyk + 44, dx + 28, cyk + 60, f + 36, f + 40, 'KEYBOARD', 'KEYBOARD');
        }
      }
    }
    scatter({ kind: 'sectors', ids: [office.id] }, [{ type: 'SHOPPER', w: 1 }], 4, 140, 0.1, { name: 'office staff' });
    scatter(inRect(b.ix0 + 16, b.iy0 + 16, b.ix1 - 16, b.iy0 + 112), [{ type: 'PLANT:bush_small_1', w: 1 }, { type: 'PLANT:bush_small_2', w: 1 }], 20, 90, 0.2, { name: 'office planting' });
  }

  /* ---- 3,0 THE PLAZA: concrete, a stage, a screen ------------------- */
  {
    const b = B(3, 0);
    const plaza = sector(rect(b.ix0, b.iy0, b.ix1, b.iy1), { name: 'plaza', floor: CURB, floorTex: 'CONC_1', lowerTex: 'CONC_4', wallTex: 'CONC_4', light: 0.82 });
    const cx = (b.ix0 + b.ix1) / 2;
    for (let k = 0; k < 5; k++) {                      // a pattern of inlaid squares
      const x = b.ix0 + 256 + k * 512;
      sector(rect(x, b.iy0 + 256, x + 320, b.iy0 + 576), { name: 'inlay', floor: CURB, floorTex: k % 2 ? 'DIAG_1' : 'DIAG_2', lowerTex: 'CONC_4', light: 0.82 });
    }
    /* the stage, three steps up, and the screen at the back of it
       running the pack's test card */
    const sx0 = cx - 768, sx1 = cx + 768, sy0 = b.iy1 - 1024, sy1 = b.iy1 - 256;
    sector(rect(sx0 - 96, sy0 - 96, sx1 + 96, sy1 + 64), { name: 'stage step', floor: CURB + 20, floorTex: 'CONC_3', lowerTex: 'CONC_4', wallTex: 'CONC_4', light: 0.8 });
    sector(rect(sx0, sy0, sx1, sy1), { name: 'stage', floor: CURB + 40, floorTex: 'XTX_1', lowerTex: 'CONC_4', wallTex: 'CONC_4', light: 0.84 });
    /* two repeats of the card across, one up: 846 by 240 */
    prop(cx - 455, sy1 - 48, cx + 455, sy1 - 16, CURB + 40, CURB + 40 + 360, 'XTX_7', 'XTX_7');
    prop(cx - 423, sy1 - 56, cx + 423, sy1 - 48, CURB + 100, CURB + 100 + 240, 'TESTPA00', 'XTX_7');
    /* the engine's own badge, on a stand to one side */
    sign(b.ix0 + 192, b.iy0 + 800, b.ix0 + 192 + 1250 * 0.5, b.iy0 + 824, 'GZDOOM', CURB, 's', { name: 'badge', floorTex: 'CONC_1' });
    scatter({ kind: 'sectors', ids: [plaza.id] }, [{ type: 'TOWNIE', w: 2 }, { type: 'SHOPPER', w: 2 }], 7, 120, 0.5, { name: 'audience' });
  }

  /* ---- 0,1 THE CEMETERY: iron, stones in ranks, mist ---------------- */
  {
    const b = B(0, 1);
    const gx0 = b.ix0 + 64, gy0 = b.iy0 + 64, gx1 = b.ix1 - 64, gy1 = b.iy1 - 64;
    const g = gapped(gx0, gy0, gx1, gy1, [{ side: 's', at: (gx0 + gx1) / 2, w: 192 }, { side: 'e', at: (gy0 + gy1) / 2, w: 192 }]);
    const yard = sector(g.pts, { name: 'cemetery', floor: CURB, floorTex: 'MOSS_01', lowerTex: 'DIRT_02', wallTex: 'IVY1', light: 0.6,
                                 fog: { color: '#9aa890', density: 18 } });
    /* THE IRON round it, the user's photograph, gates left open */
    const gapKeys = new Set(g.gaps.map(([p, q]) => lineKey(v(p[0], p[1]), v(q[0], q[1]))));
    for (const [p, q] of edges(g.pts)) {
      if (!gapKeys.has(lineKey(v(p[0], p[1]), v(q[0], q[1])))) line(p, q, { midTex: 'RAILING', blocking: true });
    }
    /* the stones, in ranks, jittered, the plain ones common */
    for (let r = 0; r < 9; r++) for (let c = 0; c < 16; c++) {
      if (rnd() < 0.18) continue;
      const x = gx0 + 256 + c * 150 + (rnd() - 0.5) * 30, y = gy0 + 320 + r * 240 + (rnd() - 0.5) * 20;
      if (Math.abs(x - (gx0 + gx1) / 2) < 140) continue;                    // the path in
      if (x > gx1 - 900 && y > gy1 - 900) continue;                          // the mausoleum
      const vr = rnd() < 0.55 ? 0 : 1 + ((rnd() * 7) | 0);
      thing('GRAVESTONE', x, y, { angle: -Math.PI / 2 + (rnd() - 0.5) * 0.2, variant: vr });
    }
    /* a mausoleum, dark inside */
    building(gx1 - 800, gy1 - 800, gx1 - 256, gy1 - 256, { name: 'mausoleum', floor: CURB + 16, ceil: CURB + 208, floorTex: 'CONC_7', ceilTex: 'CONC_7', wallTex: 'CONC_7', lowerTex: 'CONC_7', light: 0.35 },
             [{ side: 's', at: gx1 - 528, w: 96 }]);
    for (const [x, y] of [[gx0 + 96, gy0 + 96], [gx1 - 96, gy0 + 96], [gx0 + 96, gy1 - 96], [gx1 - 96, gy1 - 96], [gx0 + 96, (gy0 + gy1) / 2], [(gx0 + gx1) / 2 - 300, gy1 - 96], [(gx0 + gx1) / 2 + 300, gy1 - 96]]) plant(pick(FIRS), x, y);
    scatter({ kind: 'sectors', ids: [yard.id] }, [{ type: 'TOWNIE', w: 1 }], 0.6, 160, 0.2, { name: 'mourners' });
    scatter({ kind: 'sectors', ids: [yard.id] }, [{ type: 'PLANT:grass', w: 3 }, { type: 'PLANT:fern', w: 2 }], 18, 60, 0.7, { name: 'long grass' });
  }

  /* ---- 1,1 THE OPS CENTRE: animated panels, a reactor, red light ---- */
  {
    const b = B(1, 1);
    const x0 = b.ix0 + 192, y0 = b.iy0 + 192, x1 = b.ix1 - 192, y1 = b.iy1 - 192, f = CURB + 16;
    sector(rect(b.ix0 + 64, b.iy0 + 64, b.ix1 - 64, b.iy1 - 64), { name: 'ops apron', floor: CURB, floorTex: 'CONC_3', lowerTex: 'CAUTSTR2', wallTex: 'CAUTSTR2', light: 0.78 });
    const ops = building(x0, y0, x1, y1, {
      name: 'ops centre', floor: f, ceil: f + 256, floorTex: 'METALP1', ceilTex: 'OP_BLNK2', wallTex: 'OPBLANK', lowerTex: 'CAUTSTR2', light: 0.8, lightColor: '#dde8ff',
    }, [{ side: 's', at: (x0 + x1) / 2, w: 128 }]);
    /* a second way in, shut by the pack's see-through door */
    const side = gapped(x0, y0, x1, y1, [{ side: 's', at: (x0 + x1) / 2, w: 128 }, { side: 'w', at: (y0 + y1) / 2, w: 64 }]);
    ops.verts = side.pts.map(([x, y]) => v(x, y));
    line(side.gaps[1][0], side.gaps[1][1], { opening: true, midTex: 'DR1_01', blocking: true });
    /* the walls inside, panel by panel: the animated consoles, the
       terminals, vents, windows and the silent ones, round the room */
    const panels = ['DEVPAN1A', 'TERMPAN1', 'DEVPAN2A', 'OP_VENT2', 'REDLIGHT', 'OP_WIND2', 'DEVPAN1E', 'OPSILENT', 'DEVPAN2E', 'OP_BLNK3', 'DOOR0001', 'EYEDOOR0'];
    let k = 0;
    for (let x = x0 + 128; x + 128 <= x1 - 128; x += 160) {
      if (Math.abs(x + 64 - (x0 + x1) / 2) < 160) { k++; continue; }
      prop(x, y1 - 24, x + 128, y1 - 8, f, f + 128, panels[k++ % panels.length], 'OP_BLNK2');
      prop(x, y0 + 8, x + 128, y0 + 24, f, f + 128, panels[(k + 5) % panels.length], 'OP_BLNK2');
    }
    for (let y = y0 + 256; y + 128 <= y1 - 256; y += 160) {
      if (Math.abs(y + 64 - (y0 + y1) / 2) < 160) continue;
      prop(x1 - 24, y, x1 - 8, y + 128, f, f + 128, panels[k++ % panels.length], 'OP_BLNK2');
    }
    /* the console islands: keyboards and monitors in rows */
    for (let r = 0; r < 3; r++) {
      const y = y0 + 520 + r * 420;
      for (const [a, c] of [[x0 + 400, x0 + 1000], [x1 - 1000, x1 - 400]]) {
        prop(a, y, c, y + 64, f, f + 40, 'OPBLANK', 'OP_BLNK3');
        for (let m = a + 32; m + 96 <= c; m += 140) {
          prop(m, y + 40, m + 96, y + 56, f + 40, f + 88, 'MONITOR', 'OPBLANK');
          prop(m + 12, y + 8, m + 84, y + 28, f + 40, f + 44, 'KEYBOARD', 'KEYBOARD');
        }
      }
    }
    /* THE REACTOR ROOM, in the middle: its own sector under a higher
       ceiling, lit red, hazed, the animated core in it and eye doors
       watching from its corners */
    const rx0 = (x0 + x1) / 2 - 320, rx1 = (x0 + x1) / 2 + 320, ry0 = (y0 + y1) / 2 - 320 + 480, ry1 = ry0 + 640;
    sector(rect(rx0, ry0, rx1, ry1), { name: 'reactor', outdoor: false, floor: f - 16, ceil: f + 384, floorTex: 'CAUTSTR2', ceilTex: 'OP_BLNK3', wallTex: 'OPBLANK', upperTex: 'REACTB00', lowerTex: 'CAUTSTR2',
                                        light: 0.7, lightColor: '#ff5a3c', fog: { color: '#601810', density: 30 } });
    const rc = [(rx0 + rx1) / 2, (ry0 + ry1) / 2];
    prop(rc[0] - 96, rc[1] - 96, rc[0] + 96, rc[1] + 96, f - 16, f + 384, 'REACTB00', 'OP_BLNK3');
    for (const [ex, ey] of [[rx0 + 16, ry0 + 16], [rx1 - 80, ry0 + 16], [rx0 + 16, ry1 - 80], [rx1 - 80, ry1 - 80]]) prop(ex, ey, ex + 64, ey + 64, f - 16, f + 112, 'EYEDORC0', 'OPBLANK');
    /* and the shut eye door, over the way in */
    prop((x0 + x1) / 2 - 64, y0 + 8, (x0 + x1) / 2 + 64, y0 + 24, f + 136, f + 256, 'EYEDOORC', 'OPBLANK');
    scatter({ kind: 'sectors', ids: [ops.id] }, [{ type: 'SHOPPER', w: 1 }], 2, 200, 0.1, { name: 'operators' });
  }

  /* ---- 2,1 THE MANSION, round a courtyard -------------------------- */
  {
    const b = B(2, 1);
    const x0 = b.ix0 + 256, y0 = b.iy0 + 256, x1 = b.ix1 - 256, y1 = b.iy1 - 256, f = CURB + 24;
    sector(rect(b.ix0 + 64, b.iy0 + 64, b.ix1 - 64, b.iy1 - 64), { name: 'mansion lawn', floor: CURB, floorTex: 'LAWN2', lowerTex: 'CONC_5', wallTex: 'CONC_5', light: 0.82 });
    sector(rect(x0 - 96, y0 - 96, x1 + 96, y1 + 96), { name: 'mansion terrace', floor: CURB + 16, floorTex: 'CONC_5', lowerTex: 'CONC_5', wallTex: 'CONC_5', light: 0.8 });
    const house = building(x0, y0, x1, y1, {
      name: 'mansion', floor: f, ceil: f + 288, floorTex: 'OFCCARP1', ceilTex: 'MANINT1', wallTex: 'MANINT1', lowerTex: 'CONC_5', light: 0.86, lightColor: '#ffd8a8',
    }, [{ side: 's', at: (x0 + x1) / 2, w: 160 }, { side: 'e', at: (y0 + y1) / 2, w: 128 }]);
    /* the courtyard, open to the sky, with doorways from the house */
    const cx0 = x0 + 704, cy0 = y0 + 704, cx1 = x1 - 704, cy1 = y1 - 704;
    const ct = gapped(cx0, cy0, cx1, cy1, [{ side: 's', at: (cx0 + cx1) / 2, w: 128 }, { side: 'n', at: (cx0 + cx1) / 2, w: 128 },
                                           { side: 'e', at: (cy0 + cy1) / 2, w: 128 }, { side: 'w', at: (cy0 + cy1) / 2, w: 128 }]);
    const court = sector(ct.pts, { name: 'courtyard', floor: f, ceil: f + 1024, floorTex: 'CONC_5', wallTex: 'MANINT1', lowerTex: 'CONC_5', light: 0.84 });
    for (const [p, q] of ct.gaps) line(p, q, { opening: true });
    /* a fountain in it */
    const mx = (cx0 + cx1) / 2, my = (cy0 + cy1) / 2;
    sector(rect(mx - 192, my - 192, mx + 192, my + 192), { name: 'fountain rim', floor: f + 20, floorTex: 'CONC_5', lowerTex: 'CONC_5', light: 0.84 });
    sector(rect(mx - 160, my - 160, mx + 160, my + 160), { name: 'fountain', floor: f + 4, floorTex: 'WAT201', lowerTex: 'CONC_5', light: 0.84 });
    for (const [px, py] of [[cx0 + 128, cy0 + 128], [cx1 - 128, cy0 + 128], [cx0 + 128, cy1 - 128], [cx1 - 128, cy1 - 128]]) plant('bush_large_2', px, py);
    /* the rooms round it: pillars down the halls */
    for (let x = x0 + 256; x < x1 - 128; x += 384) for (const y of [y0 + 352, y1 - 352]) {
      if (Math.abs(x - (x0 + x1) / 2) < 200) continue;
      prop(x - 24, y - 24, x + 24, y + 24, f, f + 288, 'MANINT1', 'MANINT1');
    }
    scatter({ kind: 'sectors', ids: [house.id] }, [{ type: 'TOWNIE', w: 1 }], 1.2, 220, 0.3, { name: 'guests' });
    scatter({ kind: 'sectors', ids: [court.id] }, [{ type: 'PLANT:fern', w: 2 }, { type: 'PLANT:bush_small_1', w: 1 }], 10, 70, 0.6, { name: 'courtyard beds' });
  }

  /* ---- 3,1 THE MARKET SQUARE: stalls, trees, a crowd ---------------- */
  {
    const b = B(3, 1);
    const sq = sector(rect(b.ix0, b.iy0, b.ix1, b.iy1), { name: 'market square', floor: CURB, floorTex: 'CONC_2', lowerTex: 'CONC_4', wallTex: 'CONC_4', light: 0.82 });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      const x = b.ix0 + 320 + c * 512, y = b.iy0 + 384 + r * 640;
      prop(x, y, x + 256, y + 128, CURB, CURB + 40, 'XTX_8', 'OFCDESK1');                   // the counter
      prop(x, y + 112, x + 16, y + 128, CURB, CURB + 128, 'METALP1', 'METALP1');            // and the posts
      prop(x + 240, y + 112, x + 256, y + 128, CURB, CURB + 128, 'METALP1', 'METALP1');
      prop(x - 16, y + 64, x + 272, y + 136, CURB + 128, CURB + 136, 'CONC_7', 'OFCCARP1'); // an awning
      if (c < 4) plant(pick(STREET), x + 384, y + 64);
    }
    scatter({ kind: 'sectors', ids: [sq.id] }, [{ type: 'TOWNIE', w: 3 }, { type: 'SHOPPER', w: 2 }], 10, 110, 0.5, { name: 'market crowd' });
  }

  /* ---- 0,2 THE WOOD: firs, scrub, a dirt track, a green mist ------- */
  {
    const b = B(0, 2);
    const wood = sector(rect(b.ix0, b.iy0, b.ix1, b.iy1), { name: 'the wood', floor: CURB, floorTex: 'GRASS1', lowerTex: 'DIRT_02', wallTex: 'DIRT_02', light: 0.62,
                                                             fog: { color: '#5a6a48', density: 12 } });
    const mid = (b.iy0 + b.iy1) / 2;
    sector(rect(b.ix0 + 64, mid - 80, b.ix1 - 64, mid + 80), { name: 'track', floor: CURB, floorTex: 'DIRT1', lowerTex: 'DIRT_02', light: 0.64, fog: { color: '#5a6a48', density: 12 } });
    scatter({ kind: 'sectors', ids: [wood.id] }, [{ type: 'PLANT:fir_tall_1', w: 22 }, { type: 'PLANT:fir_tall_2', w: 22 }, { type: 'PLANT:fir_medium', w: 16 }, { type: 'PLANT:fir_young', w: 14 },
                                                  { type: 'PLANT:bush_large_1', w: 8 }, { type: 'PLANT:bush_small_1', w: 6 }], 40, 64, 0.55, { name: 'firs', scaleMin: 0.9, scaleMax: 1.2 });
    scatter({ kind: 'sectors', ids: [wood.id] }, [{ type: 'PLANT:grass', w: 5 }, { type: 'PLANT:fern', w: 4 }, { type: 'PLANT:bush_small_2', w: 1 }], 50, 30, 0.6, { name: 'undergrowth' });
  }

  /* ---- 1,2 THE QUARRY: a stepped mound of cliff, a spring on top ---- */
  {
    const b = B(1, 2);
    sector(rect(b.ix0, b.iy0, b.ix1, b.iy1), { name: 'quarry floor', floor: CURB, floorTex: 'DIRT2', lowerTex: 'CLIFF2A', wallTex: 'CLIFF2A', light: 0.76 });
    /* terraces, each a step a person can climb, faced by turns in the
       pack's cliff and lawn-edged cliff faces */
    const FACES = ['CLIFF2A', 'CLIFF2B', 'CLIFF2C', 'CLIFF1', 'LWNCLIF1', 'LWNCLIF2'];
    const FLOORS = ['DIRT2', 'DIRT3', 'ROCK_01', 'DIRT3', 'MOSS_01', 'GRASS6'];
    let z = CURB;
    for (let k = 0; k < 12; k++) {
      z += 24;
      const inset = 128 + k * 96;
      sector(rect(b.ix0 + inset, b.iy0 + inset, b.ix1 - inset, b.iy1 - inset), {
        name: `terrace ${k + 1}`, floor: z, floorTex: FLOORS[(k / 2) | 0], lowerTex: FACES[(k / 2) | 0], wallTex: FACES[(k / 2) | 0], light: 0.74 + k * 0.01,
      });
    }
    /* the spring: a pool sunk in the top, the waterfall running down its
       inner faces */
    const c = [(b.ix0 + b.ix1) / 2, (b.iy0 + b.iy1) / 2];
    sector(rect(c[0] - 160, c[1] - 160, c[0] + 160, c[1] + 160), { name: 'spring', floor: z - 96, floorTex: 'WAT201', lowerTex: 'WFALLA1', wallTex: 'WFALLA1', light: 0.8 });
    const topInset = 128 + 11 * 96;
    scatter(inRect(b.ix0 + topInset + 32, b.iy0 + topInset + 32, b.ix1 - topInset - 32, b.iy1 - topInset - 32), [{ type: 'PLANT:fir_young', w: 1 }, { type: 'PLANT:grass', w: 3 }], 10, 80, 0.4, { name: 'summit' });
  }

  /* ---- 2,2 THE BRUTALIST HALL: a forest of pillars in the gloom ---- */
  {
    const b = B(2, 2);
    const x0 = b.ix0 + 128, y0 = b.iy0 + 128, x1 = b.ix1 - 128, y1 = b.iy1 - 128, f = CURB;
    const hall = building(x0, y0, x1, y1, {
      name: 'brutalist hall', floor: f, ceil: f + 448, floorTex: 'CONC_4', ceilTex: 'CONC_7', wallTex: 'CONC_4', lowerTex: 'CONC_4', light: 0.5,
      fog: { color: '#3c3a36', density: 14 },
    }, [{ side: 's', at: (x0 + x1) / 2, w: 256 }, { side: 'n', at: (x0 + x1) / 2, w: 256 }, { side: 'e', at: (y0 + y1) / 2, w: 192 }, { side: 'w', at: (y0 + y1) / 2, w: 192 }]);
    /* the pillars: sectors shut floor to ceiling, which is how this
       engine makes a solid column */
    for (let x = x0 + 384; x < x1 - 256; x += 512) for (let y = y0 + 384; y < y1 - 256; y += 512) {
      if (Math.abs(x - (x0 + x1) / 2) < 320 && Math.abs(y - (y0 + y1) / 2) < 320) continue;   // the pit
      sector(rect(x - 48, y - 48, x + 48, y + 48), { name: 'pillar', outdoor: false, floor: f, ceil: f, floorTex: 'CONC_4', ceilTex: 'CONC_7', wallTex: (x + y) % 1024 ? 'XTX_7' : 'XTX_8', light: 0.46 });
    }
    /* the floor's hazard lanes and a sunken pit in the middle */
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    sector(rect(mx - 160, my - 160, mx + 160, my + 160), { name: 'pit', outdoor: false, floor: f - 64, ceil: f + 448, floorTex: 'DIAG_2', ceilTex: 'CONC_7', wallTex: 'CONC_4', lowerTex: 'CAUTSTR2', light: 0.4, fog: { color: '#3c3a36', density: 14 } });
    scatter({ kind: 'sectors', ids: [hall.id] }, [{ type: 'SHOPPER', w: 1 }, { type: 'TOWNIE', w: 1 }], 1.5, 200, 0.3, { name: 'wanderers' });
  }

  /* ---- 3,2 THE YARD: concrete pads, a channel of water, containers - */
  {
    const b = B(3, 2);
    const yard = sector(rect(b.ix0, b.iy0, b.ix1, b.iy1), { name: 'yard', floor: CURB, floorTex: 'CONC_3', lowerTex: 'CONC_4', wallTex: 'CONC_4', light: 0.74 });
    const mx = (b.ix0 + b.ix1) / 2;
    sector(rect(mx - 96, b.iy0 + 128, mx + 96, b.iy1 - 128), { name: 'channel', floor: CURB - 48, floorTex: 'WAT201', lowerTex: 'CONC_4', wallTex: 'CONC_4', light: 0.72 });
    for (const [px0, px1] of [[b.ix0 + 128, mx - 256], [mx + 256, b.ix1 - 128]]) {
      for (let y = b.iy0 + 192; y + 640 < b.iy1 - 128; y += 832) {
        sector(rect(px0, y, px1, y + 640), { name: 'pad', floor: CURB + 8, floorTex: 'METALP1', lowerTex: 'CAUTSTR2', light: 0.76 });
        /* containers stacked on the pads */
        for (let x = px0 + 64; x + 480 < px1; x += 544) {
          const h = rnd() < 0.5 ? 128 : 256;
          prop(x, y + 96, x + 480, y + 288, CURB + 8, CURB + 8 + h, rnd() < 0.5 ? 'XTX_8' : 'METALP1', 'METALP1');
          if (rnd() < 0.6) prop(x, y + 352, x + 480, y + 544, CURB + 8, CURB + 136, 'XTX_7', 'METALP1');
        }
      }
    }
    scatter({ kind: 'sectors', ids: [yard.id] }, [{ type: 'TOWNIE', w: 1 }], 1, 260, 0.2, { name: 'hands' });
  }

  /* ---- 0,3 THE MEADOW: grass, rocks, a scatter of trees ------------ */
  {
    const b = B(0, 3);
    const m = sector(rect(b.ix0, b.iy0, b.ix1, b.iy1), { name: 'meadow', floor: CURB, floorTex: 'GRASS5', lowerTex: 'DIRT_01', wallTex: 'DIRT_01', light: 0.84 });
    for (const [px, py, w, h, tex] of [[400, 500, 900, 700, 'GRASS6'], [1500, 1400, 1000, 800, 'GRASS6'], [600, 1900, 700, 600, 'LAWNTEST'], [1900, 300, 600, 500, 'DIRT3']]) {
      sector(rect(b.ix0 + px, b.iy0 + py, b.ix0 + px + w, b.iy0 + py + h), { name: 'meadow patch', floor: CURB, floorTex: tex, lowerTex: 'DIRT_01', light: 0.84 });
    }
    for (let k = 0; k < 9; k++) {                                                              // outcrops
      const x = b.ix0 + 200 + rnd() * 2400, y = b.iy0 + 200 + rnd() * 2400, w = 64 + rnd() * 160, h = 64 + rnd() * 160;
      prop(Math.round(x), Math.round(y), Math.round(x + w), Math.round(y + h), CURB, CURB + 24 + Math.round(rnd() * 72), 'ROCK_01', 'MOSS_01');
    }
    scatter({ kind: 'sectors', ids: [m.id] }, [{ type: 'PLANT:fir_tall_2', w: 1 }, { type: 'PLANT:street_broad', w: 1 }, { type: 'PLANT:bush_large_1', w: 2 }], 1.5, 300, 0.2, { name: 'lone trees' });
    scatter({ kind: 'sectors', ids: [m.id] }, [{ type: 'TOWNIE', w: 1 }], 0.8, 300, 0.2, { name: 'walkers' });
    scatter({ kind: 'sectors', ids: [m.id] }, [{ type: 'PLANT:grass', w: 6 }, { type: 'PLANT:fern', w: 2 }, { type: 'PLANT:bush_small_1', w: 1 }], 40, 36, 0.5, { name: 'meadow grass' });
  }

  /* ---- 1,3 THE TEST CHAMBER: the pack's test and debug set --------- */
  {
    const b = B(1, 3);
    const x0 = b.ix0 + 256, y0 = b.iy0 + 256, x1 = b.ix1 - 256, y1 = b.iy1 - 256, f = CURB;
    sector(rect(b.ix0 + 64, b.iy0 + 64, b.ix1 - 64, b.iy1 - 64), { name: 'test apron', floor: CURB, floorTex: '64TEST', lowerTex: '64TEST', wallTex: '64TEST', light: 0.8 });
    const lab = building(x0, y0, x1, y1, {
      name: 'test chamber', floor: f, ceil: f + 384, floorTex: '256TEST', ceilTex: '512TEST', wallTex: '128TEST', lowerTex: '128TEST', light: 0.9,
    }, [{ side: 's', at: (x0 + x1) / 2, w: 192 }]);
    /* the sixteen debug panels, a gallery round the walls */
    let k = 0;
    const dbg = () => `DEBUG${String(k++).padStart(3, '0')}`;
    for (let x = x0 + 192; x + 192 < x1 - 128 && k < 16; x += 288) prop(x, y1 - 32, x + 192, y1 - 16, f + 64, f + 256, dbg(), '64TEST');
    for (let y = y0 + 256; y + 192 < y1 - 128 && k < 16; y += 288) prop(x1 - 32, y, x1 - 16, y + 192, f + 64, f + 256, dbg(), '64TEST');
    for (let x = x1 - 384; x > x0 + 128 && k < 16; x -= 288) {
      if (Math.abs(x + 96 - (x0 + x1) / 2) < 256) continue;                 // the way in
      prop(x, y0 + 16, x + 192, y0 + 32, f + 64, f + 256, dbg(), '64TEST');
    }
    /* the odd ones out: the squirrel, the cubicle chip, a test card */
    prop(x0 + 16, y0 + 512, x0 + 32, y0 + 768, f + 64, f + 320, 'SQUIRREL', '64TEST');
    prop(x0 + 16, y0 + 896, x0 + 32, y0 + 1152, f + 64, f + 320, 'OFCCUB02', '64TEST');
    prop(x0 + 16, y0 + 1280, x0 + 32, y0 + 1280 + 423, f + 64, f + 64 + 240, 'TESTPA00', '64TEST');
    /* test blocks on the floor, one of each size, and the two checker
       patterns of the XTX set on a pair of plinths */
    const T = ['64TEST', '128TEST', '256TEST', '512TEST'];
    T.forEach((t, n) => { const s = 64 << n, x = x0 + 320 + n * 520, y = (y0 + y1) / 2 - s / 2; prop(x, y, x + s, y + s, f, f + s, t, t); });
    prop(x0 + 320, y0 + 320, x0 + 448, y0 + 448, f, f + 128, 'XTX_5', 'XTX_5');
    prop(x0 + 576, y0 + 320, x0 + 704, y0 + 448, f, f + 128, 'XTX_6', 'XTX_6');
    scatter({ kind: 'sectors', ids: [lab.id] }, [{ type: 'SHOPPER', w: 1 }], 1, 260, 0.1, { name: 'testers' });
  }

  /* ---- 2,3 THE LAKE: a beach, open water, islands ------------------ */
  {
    const b = B(2, 3);
    sector(rect(b.ix0, b.iy0, b.ix1, b.iy1), { name: 'beach', floor: CURB, floorTex: 'DIRT3', lowerTex: 'ROCK_01', wallTex: 'ROCK_01', light: 0.86 });
    const lx0 = b.ix0 + 320, ly0 = b.iy0 + 320, lx1 = b.ix1 - 320, ly1 = b.iy1 - 320;
    /* a rounded shore, sixteen sides */
    const cx = (lx0 + lx1) / 2, cy = (ly0 + ly1) / 2, rx = (lx1 - lx0) / 2, ry = (ly1 - ly0) / 2;
    const shore = Array.from({ length: 16 }, (_, k) => [Math.round(cx + rx * Math.cos(k * Math.PI / 8)), Math.round(cy + ry * Math.sin(k * Math.PI / 8))]);
    sector(shore, { name: 'lake', floor: -40, floorTex: 'WAT201', lowerTex: 'ROCK_01', wallTex: 'ROCK_01', light: 0.86, fog: { color: '#a8b8b0', density: 6 } });
    for (const [ix, iy, r] of [[cx - 500, cy + 300, 220], [cx + 450, cy - 350, 160]]) {
      const isl = Array.from({ length: 8 }, (_, k) => [Math.round(ix + r * Math.cos(k * Math.PI / 4)), Math.round(iy + r * Math.sin(k * Math.PI / 4))]);
      sector(isl, { name: 'island', floor: CURB, floorTex: 'GRASS5', lowerTex: 'ROCK_01', light: 0.86, fog: { color: '#a8b8b0', density: 6 } });
      plant(pick(FIRS), ix, iy, 1.1);
      plant('bush_small_1', ix + r * 0.5, iy - r * 0.3);
    }
    scatter(inRect(b.ix0 + 32, b.iy0 + 32, b.ix1 - 32, b.iy0 + 280), [{ type: 'TOWNIE', w: 1 }], 6, 150, 0.4, { name: 'bathers' });
    scatter(inRect(b.ix0 + 32, b.iy1 - 280, b.ix1 - 32, b.iy1 - 32), [{ type: 'PLANT:fir_medium', w: 1 }, { type: 'PLANT:fir_tall_1', w: 1 }], 8, 120, 0.4, { name: 'north shore' });
  }

  /* ---- 3,3 THE RUINS: roofless shells in the moss ------------------ */
  {
    const b = B(3, 3);
    const r = sector(rect(b.ix0, b.iy0, b.ix1, b.iy1), { name: 'ruins', floor: CURB, floorTex: 'MOSS_01', lowerTex: 'CONC_7', wallTex: 'CONC_7', light: 0.64,
                                                         fog: { color: '#8c8878', density: 8 } });
    /* shells: low broken walls as boxes, gaps knocked in them */
    for (const [sx, sy, w, h] of [[256, 256, 896, 704], [1408, 384, 1024, 896], [384, 1408, 1152, 1024], [1792, 1664, 768, 832]]) {
      const x0 = b.ix0 + sx, y0 = b.iy0 + sy, x1 = x0 + w, y1 = y0 + h, t = 32;
      sector(rect(x0 + t, y0 + t, x1 - t, y1 - t), { name: 'shell floor', floor: CURB, floorTex: pick(['CONC_5', 'XTX_1', 'DIRT_01']), lowerTex: 'CONC_7', light: 0.64, fog: { color: '#8c8878', density: 8 } });
      const wallH = () => CURB + 64 + Math.round(rnd() * 200);
      const TEX = ['CONC_7', 'XTX_7', 'IVY1', 'CONC_4'];
      const run = (ax, ay, bx, by, horiz) => {
        const len = horiz ? bx - ax : by - ay;
        for (let s = 0; s < len; s += 128) {
          if (rnd() < 0.22) continue;                                         // knocked through
          const e = Math.min(len, s + 128);
          if (horiz) prop(ax + s, ay, ax + e, ay + t, CURB, wallH(), pick(TEX), 'MOSS_01');
          else prop(ax, ay + s, ax + t, ay + e, CURB, wallH(), pick(TEX), 'MOSS_01');
        }
      };
      run(x0, y0, x1, y0, true); run(x0, y1 - t, x1, y1 - t, true);
      run(x0, y0 + t, x0, y1 - t, false); run(x1 - t, y0 + t, x1 - t, y1 - t, false);
    }
    for (let k = 0; k < 10; k++) thing('GRAVESTONE', b.ix0 + 300 + rnd() * 2200, b.iy0 + 2600 + rnd() * 200, { angle: -Math.PI / 2 + (rnd() - 0.5), variant: (rnd() * 8) | 0 });
    scatter({ kind: 'sectors', ids: [r.id] }, [{ type: 'PLANT:fern', w: 4 }, { type: 'PLANT:grass', w: 3 }, { type: 'PLANT:bush_small_2', w: 1 }, { type: 'PLANT:fir_young', w: 1 }], 30, 44, 0.65, { name: 'overgrowth' });
  }

  /* ---- THE CROSSROADS, and the start ------------------------------- */
  const [sx, sy] = SPRAWL_START;
  thing('START', sx, sy, { angle: Math.PI / 2 });
  scatter(inRect(ROAD, sy - 256, S - ROAD, sy + 256), [{ type: 'TOWNIE', w: 1 }], 0.8, 320, 0.3, { name: 'road walkers e-w' });
  scatter(inRect(sx - 256, ROAD, sx + 256, S - ROAD), [{ type: 'TOWNIE', w: 1 }], 0.8, 320, 0.3, { name: 'road walkers n-s' });
  return d;
}

/** The textures the map may wear that are not the pack's: the user's
 *  photographs baked into the texture bank, and the sky. See THE
 *  SPRAWL in tools/smoke-test.mjs, which holds the map to this. */
export const SPRAWL_OWN_TEXTURES = ['RAILING', 'SKY'];
/** And the things it may place: the user's people, photographed stones
 *  and lamps, the plants, and the start. */
export const SPRAWL_THINGS = ['START', 'SHOPPER', 'TOWNIE', 'GRAVESTONE', 'STREETLAMP', 'PLANT'];
