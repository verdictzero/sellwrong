/* =====================================================================
   GROCERY STORE SIMULATOR — THE GRID
   =====================================================================

   The world the game boots into, at the user's request, and the store is
   not in it. js/maps/sellwrong.js and js/maps/town.js are still here,
   still exported, still tested and still build the superstore and the
   town around it exactly as they did — nothing calls them. This is what
   js/main.js builds instead, and it is a test bed rather than a place:

     a large but FINITE field of green lines on black
     a sky that is green at the horizon and black overhead
     a hundred people
     and boxes, two cells to seven cells a side, which BURN

   WHY IT EXISTS. The burning was the expensive half of this game and
   the least controllable: a cell grid of fuel and heat, 32 units a
   cell, spreading between neighbours, cooking the structure above it
   and repainting the world's textures as it went (js/fire.js, and THE
   THIRD STAGE in js/textures.js). It is a good simulation and it costs
   what a simulation costs. What the picture actually needed — a thing
   that is clean, then going, then gone, with coals on the front — is a
   SHADER, and it wants one number per object rather than a grid over
   the world. So js/boxes.js draws that, this map gives it something to
   eat, and the grid simulation is switched off here entirely (see
   `noCellFire` at the bottom).

   THE MEASUREMENTS. One CELL is 64 units, which is Doom's grid and the
   ruler everything else in this game is already cut to — a shopper is
   62 tall, a door is 128 high. A PLOT is ten cells, and the field is
   sixteen plots square: 10,240 units, which you can see across on a
   clear night (airFar is 14,000) and cannot walk out of.

   WHY PLOTS. A box is a hole in the floor, and a floor with holes in it
   has to be cut into rectangles around them, because a sector in this
   engine is one ring of points and cannot have an island in the middle.
   Cutting a whole field around two hundred scattered boxes is a
   decomposition; cutting ONE PLOT around ONE box is four strips and a
   picture frame. So the field is a grid of plots, at most one box in
   each, jittered inside it — which also spaces the boxes out without
   anybody having to check distances.

   THE LANE. The plots one in from each edge carry no box, so there is a
   clear ring road round the field 640 wide. The fire brigade drives it
   (js/brigade.js) and comes in through the two gates east and west,
   which are corridors of the same floor sticking out of the field —
   which is why the wall has a gap there rather than the trucks driving
   through it.

   AND NOBODY ELSE COMES. `noSquads` keeps the SWAT and the army off the
   road (see squadTic in js/responders.js), and with the army never
   called the gunship never flies. The brigade is the whole of the
   night, because a fire is the only thing this world is about.
   ===================================================================== */

import { MapBuilder } from '../level.js';
import { RectMap } from './rectmap.js';

/* one cell of the grid, and it is Doom's 64 */
export const CELL = 64;
/* one plot, in cells: at most one box stands in each, and it is eight
   because the largest box is seven and wants half a cell of floor round
   it on every side */
export const PLOT_CELLS = 8;
export const PLOT = PLOT_CELLS * CELL;              // 512
/* and how many plots the field is, each way */
export const PLOTS = 20;
export const FIELD = PLOTS * PLOT;                  // 10240, which you can see across

/* how tall the lattice wall round it stands, and therefore the ceiling */
export const WALL_H = 1024;
/* the smallest and largest box, in cells: the user's 2x2 to 7x7, and
   they are CUBES — a box that is seven cells across is seven cells tall,
   which is what gives the burn something to sweep down */
export const BOX_MIN = 2, BOX_MAX = 7;
/* the gate corridors east and west, which the brigade comes in through */
export const GATE_LEN = 2600;
/* how many people are in the field */
export const CROWD = 100;

/* the floor's own light. The field is `outdoor` so a vehicle may drive
   on it and so the rain falls on it, but its `sky` is 0: an outdoor
   surface is otherwise lit by skyLight, which at two in the morning is
   0.08, and a black field of black lines is not a picture. This world
   is lit by nothing and is the brightness it says it is. */
const FLOOR_LIGHT = 0.62;
const BOX_LIGHT = 0.58;

/* A deterministic roll, so the field is the same field every boot and
   the smoke test can say where a box is. The same little LCG the crowd
   in sellwrong.js uses. */
function roller(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* Which plots carry no box: the ring lane one in from each edge, a
   street every fourth plot both ways, and the four in the middle where
   you start.

   THE STREETS ARE NOT DECORATION. A field of solid boxes with nothing
   between them is a field a fire engine cannot get into: the brigade
   drives at the fire in a straight line and stops at the first thing it
   cannot drive through (chaseStand in js/responders.js), which in a
   uniform scatter is the first box, half the field away from the fire.
   With avenues there is a line in from the ring that reaches, and the
   stand search finds it. They are a FIREBREAK as well, which is what a
   street has always been: a box lights its neighbours within SPREAD_R
   and nothing reaches across 640 units of empty floor, so a fire takes
   the block it started in and stops — and the brigade's job is the
   block next to it. */
export const STREET_EVERY = 4;
function clearPlot(px, py) {
  if (px === 1 || py === 1 || px === PLOTS - 2 || py === PLOTS - 2) return true;
  if (px % STREET_EVERY === 0 || py % STREET_EVERY === 0) return true;
  const m = PLOTS / 2;
  return (px === m - 1 || px === m) && (py === m - 1 || py === m);
}

/**
 * THE GRID.
 *
 * @param opts.seed   the roll the boxes and the crowd are placed from
 * @param opts.boxes  false for an empty field, for a test that wants one
 */
export function buildGrid(opts = {}) {
  const rnd = roller(opts.seed ?? 20250924);
  const mb = new MapBuilder('GRID');
  const rm = new RectMap(mb);

  const X0 = 0, Y0 = 0, X1 = FIELD, Y1 = FIELD;
  const MID = FIELD / 2;

  /* the floor every strip is cut from: one texture, one light, one
     anchor, so every cell line in the field lands on a multiple of CELL
     from the field's own corner rather than from the world origin */
  const floor = (name) => ({
    floor: 0, ceil: WALL_H, light: FLOOR_LIGHT, ambient: FLOOR_LIGHT,
    floorTex: 'GRID', floorAnchor: [X0, Y0], ceilTex: 'SKY',
    wallTex: 'GRID', upperTex: 'GRID', lowerTex: 'GRID',
    outdoor: true, sky: 0, fuel: 0, name,
  });

  /* ------------------------------------------------------------------
     THE BOXES, one to a plot, jittered inside it and clear of its edges
     by half a cell so no two ever touch and every plot still has four
     strips of floor round its box.
     ------------------------------------------------------------------ */
  const boxes = [];
  for (let py = 0; py < PLOTS; py++) {
    for (let px = 0; px < PLOTS; px++) {
      if (clearPlot(px, py)) continue;
      if (opts.boxes === false) continue;
      /* nearly every plot that may carry one does */
      if (rnd() > 0.9) continue;
      const cells = BOX_MIN + Math.floor(rnd() * (BOX_MAX - BOX_MIN + 1));
      const side = cells * CELL;
      /* ON THE GRID, at the user's request, and it is the grid you can
         SEE: a box stands on a whole number of cells from the field's
         own corner, so its foot follows the green lines on the floor
         and its faces — which wear one repeat of GRIDBOX a cell — line
         up with them. It used to sit half a cell off, which put every
         box a hair out of step with the floor it was standing on. */
      const room = PLOT_CELLS - cells;               // in whole cells
      const bx = X0 + px * PLOT + Math.floor(rnd() * (room + 1)) * CELL;
      const by = Y0 + py * PLOT + Math.floor(rnd() * (room + 1)) * CELL;
      boxes.push({ x0: bx, y0: by, x1: bx + side, y1: by + side, cells, side, height: side });
    }
  }

  /* ------------------------------------------------------------------
     AND THE FLOOR ROUND THEM, plot by plot: an empty plot is one
     rectangle, a plot with a box in it is four strips in a frame.
     ------------------------------------------------------------------ */
  let n = 0;
  const boxAt = new Map();
  for (const b of boxes) boxAt.set(`${Math.floor(b.x0 / PLOT)},${Math.floor(b.y0 / PLOT)}`, b);
  for (let py = 0; py < PLOTS; py++) {
    for (let px = 0; px < PLOTS; px++) {
      const x0 = X0 + px * PLOT, y0 = Y0 + py * PLOT, x1 = x0 + PLOT, y1 = y0 + PLOT;
      const b = boxAt.get(`${px},${py}`);
      if (!b) { rm.add(x0, y0, x1, y1, floor('field')); n++; continue; }
      /* the four strips round it — and only the ones with floor in
         them, because a box on the grid may sit flush against the edge
         of its plot and a strip of nothing is not a rectangle */
      const strip = (ax, ay, bx2, by2) => {
        if (bx2 - ax < 1 || by2 - ay < 1) return;
        rm.add(ax, ay, bx2, by2, floor('field'));
        n++;
      };
      strip(x0, y0, x1, b.y0);            // south of it
      strip(x0, b.y1, x1, y1);            // north
      strip(x0, b.y0, b.x0, b.y1);        // west
      strip(b.x1, b.y0, x1, b.y1);        // east
      /* THE BOX ITSELF IS A FLOOR AT ITS OWN HEIGHT, and it draws
         NOTHING: every texture on it is NONE because js/boxes.js draws
         all of them, in one mesh, with a shader that can burn.

         A RAISED FLOOR RATHER THAN A SHUT COLUMN, which is the idiom
         this engine already uses for a shelf you can shoot over. Both
         stop you walking in — the step up is bigger than a step — but a
         shut column stops SIGHT at every height, so a two-cell box
         would have hidden what was behind it from a man standing on a
         seven-cell one. It also gives the burning somewhere to go: as a
         box goes, js/boxes.js lowers this floor to what is left of it,
         and puts it on the ground when there is nothing left. It is
         NOT `outdoor` — a fire engine may drive on the field and not
         through a box; the ash it leaves is outdoor again. */
      b.rect = rm.add(b.x0, b.y0, b.x1, b.y1, {
        floor: b.height, ceil: WALL_H,
        floorTex: 'NONE', ceilTex: 'SKY', wallTex: 'NONE', lowerTex: 'NONE', upperTex: 'NONE',
        light: BOX_LIGHT, ambient: BOX_LIGHT, outdoor: false, sky: 0, fuel: 0, name: 'box',
      });
    }
  }

  /* ------------------------------------------------------------------
     THE GATES: the same floor, sticking out east and west at the middle
     of the field, so the wall has a gap where the road arrives instead
     of the brigade driving through a wall.
     ------------------------------------------------------------------ */
  const gy0 = MID - PLOT / 2, gy1 = MID + PLOT / 2;
  rm.add(X0 - GATE_LEN, gy0, X0, gy1, floor('gate west'));
  rm.add(X1, gy0, X1 + GATE_LEN, gy1, floor('gate east'));

  rm.build();
  /* WHICH SECTOR EACH BOX IS, so that a box which has burnt away can
     stop being in the way — js/boxes.js opens it to the field's own
     floor and ceiling the moment nothing of it is left to draw. */
  for (const b of boxes) { b.sector = b.rect.sector; delete b.rect; }
  const level = mb.build();

  /* ------------------------------------------------------------------
     WHO IS IN IT

     One START in the middle, and a hundred people scattered over the
     free floor. `standable` is the whole of the placement: on the
     field, not in a box, not in a gate, and not on top of somebody.
     ------------------------------------------------------------------ */
  mb.thing('START', MID, MID - PLOT, Math.PI / 2);

  const taken = [];
  const APART = 90;
  const standable = (x, y) => {
    if (x < X0 + 40 || x > X1 - 40 || y < Y0 + 40 || y > Y1 - 40) return false;
    for (const b of boxes) if (x > b.x0 - 30 && x < b.x1 + 30 && y > b.y0 - 30 && y < b.y1 + 30) return false;
    for (const t of taken) if ((t[0] - x) ** 2 + (t[1] - y) ** 2 < APART * APART) return false;
    return true;
  };
  for (let k = 0, tries = 0; k < CROWD && tries < CROWD * 200; tries++) {
    const x = X0 + rnd() * FIELD, y = Y0 + rnd() * FIELD;
    if (!standable(x, y)) continue;
    taken.push([x, y]);
    mb.thing('SHOPPER', Math.round(x), Math.round(y), rnd() * Math.PI * 2, { variant: (rnd() * 17) | 0 });
    k++;
  }

  /* ------------------------------------------------------------------
     THE ROAD, which is the clear lane one plot in from the edge, and
     the two gates it runs out of. The brigade drives this and nothing
     else does — see `noSquads` below.
     ------------------------------------------------------------------ */
  const lane = PLOT * 1.5;                        // the middle of the clear plots
  level.swatRing = [
    { x: X0 + lane, y: Y0 + lane },
    { x: X1 - lane, y: Y0 + lane },
    { x: X1 - lane, y: Y1 - lane },
    { x: X0 + lane, y: Y1 - lane },
  ];
  level.swatRoutes = {
    west: [{ x: X0 - GATE_LEN + 200, y: MID }, { x: X0 + lane, y: MID }],
    east: [{ x: X1 + GATE_LEN - 200, y: MID }, { x: X1 - lane, y: MID }],
  };
  level.roadEnds = [
    { x: X0 - GATE_LEN + 200, y: MID, heading: 0, side: 'west' },
    { x: X1 + GATE_LEN - 200, y: MID, heading: Math.PI, side: 'east' },
  ];
  /* AND THE STREETS THEMSELVES, as driving lines. The ring says how to
     get round the outside of the field; these say how to get INTO it,
     which in a field of solid boxes is the difference between a fire
     engine and an ornament. A truck that drives straight at a fire
     stops at the first box (chaseStand in js/responders.js walks a
     line and gives up where the tarmac does); a truck that drives down
     the street beside the block gets a plot away from it. See
     standFor in js/brigade.js, which uses these when a map has them. */
  {
    const lanes = [];
    for (let i = 0; i < PLOTS; i += STREET_EVERY) {
      const at = (i + 0.5) * PLOT;
      if (at < lane || at > FIELD - lane) continue;        // the ring already covers those
      lanes.push({ axis: 'y', at: X0 + at, from: Y0 + lane, to: Y1 - lane });
      lanes.push({ axis: 'x', at: Y0 + at, from: X0 + lane, to: X1 - lane });
    }
    level.lanes = lanes;
  }

  /* Bays are what a vehicle uses when the fire is INDOORS and there is
     a fire lane to stand in. Nothing here is indoors, so nothing ever
     asks for one; the ring is what the brigade actually uses. They are
     supplied because the three go together — see freeStand and
     routeTo, which read all three or none. */
  level.swatBays = [-1, 0, 1].map(k => ({ x: MID + k * PLOT, y: Y0 + lane, approach: { y: Y0 + lane } }));

  /* ------------------------------------------------------------------
     AND WHAT THIS WORLD DOES NOT HAVE
     ------------------------------------------------------------------ */
  /* THE CELL FIRE IS OFF. The whole point of the grid world: the store's
     fuel grid is a simulation this map has no use for, and the boxes
     burn in js/boxes.js instead. See FireSystem, which reads this and
     stops before it allocates a grid over ten thousand units of field. */
  level.noCellFire = true;
  /* AND NOBODY IS SENT BUT THE BRIGADE — see squadTic in js/responders.js */
  level.noSquads = true;

  level.carSlots = [];
  level.slideDoors = [];
  level.props = [];
  level.roofs = [];
  level.plants = [];
  level.forestRects = [];
  level.forestBounds = [X0, Y0, X1, Y1];
  level.clearing = level.fireBounds;
  level.town = null;
  /* where a frightened person runs: out of a gate, which is the only
     way out of this field there is */
  level.exits = [
    { x: X0 - GATE_LEN / 2, y: MID, kind: 'the west gate' },
    { x: X1 + GATE_LEN / 2, y: MID, kind: 'the east gate' },
  ];
  level.viewpoint = { x: MID, y: MID - PLOT, angle: Math.PI / 2 };
  level.salesFloor = { x0: X0, y0: Y0, x1: X1, y1: Y1 };
  level.road = { y0: gy0, y1: gy1 };
  level.title = 'THE GRID';

  /* WHAT THE BOXES ARE, for js/boxes.js to build its mesh from. Their
     sectors are in the map for collision and for sight and draw
     nothing; this is the list of the things themselves. */
  level.boxes = boxes;
  /* and what a box's sector is opened UP to when it has gone */
  level.field = { x0: X0, y0: Y0, x1: X1, y1: Y1, cell: CELL, plot: PLOT, floor: 0, ceil: WALL_H };
  level.floorRects = n;

  return level;
}
