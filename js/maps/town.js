/* =====================================================================
   GROCERY STORE SIMULATOR — the town
   =====================================================================

   A strip mall in a wood is a firebreak with a shop in it. You burn one
   building and then you burn some trees, and that is the game's ceiling:
   the car park is two hundred and eighty units of tarmac and the ring
   road is another three hundred, and nothing crosses either.

   So there is a town on the far side of it. Five by five blocks of 3072
   on a pitch of 3648, a school, a church, and houses with an upstairs —
   which is the first thing this fire has ever been able to spread TO.

   THE MALL WAS ALREADY ON THE GRID. Its clearing is 14,000 by 6,992 and
   four pitches less one street is 13,968; two pitches less one street is
   6,720. The mall, its car park and its ring road are a four-by-two
   superblock on a grid nobody had drawn, to within thirty-two units
   across. Nothing here had to be reconciled with anything.

   EVERYTHING IS A COLUMN. See THE ONE NEW IDEA in TOWN.txt and
   MapBuilder.column in js/level.js: a sector may name the sector above
   it over the same polygon, so a bedroom can be over a kitchen. A
   staircase is a column of STEPPED BOXES — tread i is floor 16i and
   ceiling 16i + 96 — which walks up at sixteen a step under the
   twenty-four the engine allows, and stacks over itself for the next
   flight with the deck between them.

   AND WALLS ARE THE GAPS, which is RectMap's rule and is what makes the
   floor plans below readable: two rectangles that touch are an opening,
   so a wall is drawn by leaving sixteen units between them and a
   doorway is a small rectangle bridging that gap. Which is what a
   doorway in a real building is.
   ===================================================================== */

/* --------------------------------------------------------------------
   THE SCALE, which is the project's own and not a new one: thirty-two
   units to the metre, rounded to a multiple of 16 and usually of 64 so
   that a texture lands on a corner.
   ------------------------------------------------------------------ */
import { gableSlope } from '../level.js';

export const PITCH = 3648;          // a block and the street after it
export const BLOCK = 3072;          // a block face, 315 ft
export const STREET = 576;          // a residential street, 60 ft
/* MAIN STREET, and it is 1024 rather than the plan's 768 because the
   sidewalks are three times what they were and 768 less two sidewalks
   of 336 is ninety-six units of road. It is still the one irregularity
   in the grid; it is just a wider one. The block pitch is untouched,
   so the mall is still on the grid — see THE GRID. */
export const MAIN_W = 1024;
const WALL = 16;                    // the void between two rooms IS the wall

/* A STOREY is 96 of clear and 16 of deck. Three of them is 336 and a
   roof ridge over that is 464 — sixteen units UNDER the mall's parapet
   at 480, which is exactly the relationship those two things have in
   life and was not arranged. It is what the conversion gives you when
   you ask for three storeys and a roof. */
export const STOREY = 112, CLEAR = 96, RIDGE = 128;
const floorOf = k => k * STOREY;
const ceilOf = k => k * STOREY + CLEAR;

/* The town's sky ceiling. The church tower and the water tower break the
   mall's 480 and they are the only things that do. */
export const SKY = 768;

/* the street, as five bands: 144 of walk | 24 of verge | 240 of
   carriageway | 24 verge | 144 walk, and the carriageway is two travel
   lanes with the centre line between them */
/* THE SIDEWALK IS THREE TIMES THE PLAN'S and the kerb is twice, at the
   user's request, and both come out of the carriageway because the
   block pitch is load-bearing: 3648 is what puts the supermarket's own
   clearing on the grid, and a wider street would take it off.

   What that buys and what it costs. A hundred and forty-four units is
   four and a half feet of walking either side, which is a sidewalk you
   notice rather than a kerbstone with a line behind it. What goes is
   the on-street parking: 48 | 24 | 240 | 24 | 48 in the plan's own
   terms is two travel lanes of about eleven feet and nowhere to leave a
   car. Nothing was parked on them, so nothing is lost but the number.

   THE KERB IS TWENTY-FOUR, which is exactly the tallest step the engine
   will let anything walk up (MAX_STEP in js/util.js). One more unit and
   the sidewalks of an entire town would be a place you could see and
   not stand on, which is the kind of number that wants saying out loud
   rather than being found. */
const WALK = 144, VERGE = 24, KERB_H = 24;
const MAIN_WALK = 336;
const CARRIAGE = STREET - 2 * (WALK + VERGE);       // 240

/* how the lots sit on a block face */
const FACE = BLOCK / 2;             // 1536, one row of lots back to back
const LOT_W = 512;                  // 52 ft, a house lot
const HOUSE_W = 448, HOUSE_D = 768;
const FRONT_YARD = 192;             // from the sidewalk to the front wall
const ROW_W = 192;                  // 20 ft, a townhouse lot
const ROW_HOUSE_W = 176;

/* WHAT BURNS. A house is more flammable per square metre than a
   supermarket — timber frame, carpets, curtains, furniture, and a
   fraction of the sprinklered floor area — so domestic interiors go in
   high and brick shells go in at nearly nothing. A terrace burns out
   and stands there as a row of walls with the roof gone, which is what
   js/ruin.js is for. */
export const TOWN_FUEL = {
  none: 0, road: 0, walk: 0, yard: 30, park: 60,
  hall: 300, room: 380, kitchen: 420, bed: 400, stair: 340,
  shop: 300, class: 280, gym: 200, nave: 360, hallway: 120,
};

/* the three dressings, which are what the eye actually reads off a
   terrace — not the floor plan, which is the same house eight times */
const DRESS = [
  { wall: 'BRICKRED', win: 'WINDOWDK', winLit: 'WINDOWLT', roof: 'SHINGLE', gable: 'GABLEND' },
  { wall: 'CLAPBRD',  win: 'WINDOWWD', winLit: 'WINDOWWD', roof: 'SHINGLE', gable: 'GABLEND' },
  { wall: 'VINYLSID', win: 'WINDOWDK', winLit: 'WINDOWLT', roof: 'SHINGLE', gable: 'GABLEND' },
  { wall: 'BRICKPNT', win: 'WINDOWDK', winLit: 'WINDOWLT', roof: 'SHINGLE', gable: 'GABLEND' },
];

/* a small deterministic generator, so the same town comes out every
   time and a screenshot can be compared with the one before it */
function rng(seed) {
  let s = seed | 0 || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

/* =====================================================================
   THE GRID
   ===================================================================== */

/**
 * Where the streets and the blocks are.
 *
 * Six streets and five block columns each way. The fourth street across
 * is MAIN STREET and is 768 rather than 576, which is the only
 * irregularity in the whole grid and is the reason the town has a front:
 * it runs north out of the mall's ring road, through the square, and
 * stops at the school.
 *
 * `x0` is chosen so Main Street's centre lands on the supermarket's
 * doors, which are at 2140. It comes out at 2112 — a metre off, and
 * from the far end of the town the street points at the entrance.
 */
export function townGrid(x0 = -9344, yTop = -3096) {
  const sx = [], bx = [];
  let x = x0;
  for (let k = 0; k <= 5; k++) {
    const w = k === 3 ? MAIN_W : STREET;
    sx.push([x, x + w]); x += w;
    if (k < 5) { bx.push([x, x + BLOCK]); x += BLOCK; }
  }
  const sy = [], by = [];
  let y = yTop;
  for (let k = 0; k <= 5; k++) {
    sy.push([y - STREET, y]); y -= STREET;
    if (k < 5) { by.push([y - BLOCK, y]); y -= BLOCK; }
  }
  return {
    sx, bx, sy, by,
    x0, x1: x, y1: yTop, y0: y,
    main: sx[3],
    width: x - x0, depth: yTop - y,
  };
}

/* =====================================================================
   WHAT IS ON EACH BLOCK

   Seventeen of the twenty-five are residential or civic and eight are
   the town's commercial spine and its services. The school takes two
   because an American school takes two — a building and a field, and the
   field is what tells you which it is from three streets away.
   ===================================================================== */
export const BLOCK_PLAN = [
  /* row A, nearest the mall */
  ['gas', 'square', 'civic', 'civic', 'stations'],
  /* row B */
  ['rows', 'flats', 'church', 'rows', 'motel'],
  /* row C */
  ['houses', 'rows', 'school', 'field', 'houses'],
  /* row D */
  ['houses', 'houses', 'houses', 'houses', 'houses'],
  /* row E */
  ['houses', 'cemetery', 'park', 'houses', 'houses'],
];

/* =====================================================================
   BUILDING IT
   ===================================================================== */

/**
 * Add the whole town to a RectMap.
 *
 * @param rm    the RectMap the mall is being built in
 * @param mb    its MapBuilder, for things and for lines
 * @param opts  { x0, yTop } — where the grid is anchored
 * @returns     what the rest of the map needs to know about it
 */
export function buildTown(rm, mb, opts = {}) {
  const G = townGrid(opts.x0, opts.yTop);
  const R = rng(opts.seed ?? 20250915);
  const out = { grid: G, houses: [], stations: {}, lamps: [], roofs: 0 };

  /* ---- the props every outdoor thing in the town shares ------------ */
  const open = (name, extra = {}) => ({
    floor: 0, ceil: SKY, light: 0.26, ambient: 0.26, outdoor: true, sky: 1,
    floorTex: 'ASPHOLD', ceilTex: 'SKY',
    wallTex: 'BRICKRED', upperTex: 'BRICKRED', lowerTex: 'KERBSTON',
    fuel: TOWN_FUEL.none, name, ...extra,
  });
  /* A SIDEWALK IS THE LIT PART OF A STREET, because that is where the
     lamps are pointed. The carriageway is darker than the walk and the
     yards behind the houses are darker than either, which is the whole
     of what a street reads like at two in the morning — and it is done
     with ambient rather than with lamps because relight() does not
     light outdoor regions and a hundred street lamps against four
     thousand indoor sectors is a startup cost for nothing. */
  const walkProps = (name, extra = {}) => open(name, {
    floor: KERB_H, floorTex: 'SIDEWALK', light: 0.46, ambient: 0.46,
    lowerTex: 'KERBSTON', fuel: TOWN_FUEL.walk, ...extra,
  });
  const vergeProps = (name, extra = {}) => open(name, {
    floor: KERB_H, floorTex: 'GRASSVRG', light: 0.40, ambient: 0.40,
    lowerTex: 'KERBSTON', fuel: TOWN_FUEL.yard, ...extra,
  });

  /* ---- a street ---------------------------------------------------- */
  /* The carriageway is five strips, the same construction the ring road
     uses: a painted line cannot be part of a 64-unit tile across 384
     units of road, so it is a strip six wide wearing a tile that is line
     all the way through. See roadRun in js/maps/sellwrong.js. */
  const L = 6, H = 3;
  function carriage(x0, y0, x1, y1, along, tag) {
    const road = (a, b, c, d, tex, n) => rm.add(a, b, c, d,
      open(n, { floorTex: tex, light: 0.30, ambient: 0.30, fuel: TOWN_FUEL.road }));
    if (along === 'x') {
      const m = (y0 + y1) / 2;
      road(x0, y0, x1, y0 + L, 'ROADEDGE', `street edge, ${tag}`);
      road(x0, y0 + L, x1, m - H, 'ASPHOLD', `street, ${tag}`);
      road(x0, m - H, x1, m + H, 'ROADLINE', `street centre, ${tag}`);
      road(x0, m + H, x1, y1 - L, 'ASPHOLD', `street, ${tag}`);
      road(x0, y1 - L, x1, y1, 'ROADEDGE', `street edge, ${tag}`);
    } else {
      const m = (x0 + x1) / 2;
      road(x0, y0, x0 + L, y1, 'ROADEDGE', `street edge, ${tag}`);
      road(x0 + L, y0, m - H, y1, 'ASPHOLD', `street, ${tag}`);
      road(m - H, y0, m + H, y1, 'ROADLINV', `street centre, ${tag}`);
      road(m + H, y0, x1 - L, y1, 'ASPHOLD', `street, ${tag}`);
      road(x1 - L, y0, x1, y1, 'ROADEDGE', `street edge, ${tag}`);
    }
  }

  /** One run of street between two junctions, with its sidewalks. */
  function streetRun(sx0, sx1, y0, y1, along, tag, main = false) {
    const w = main ? MAIN_WALK : WALK;
    const v = main ? 0 : VERGE;
    if (along === 'x') {
      rm.add(sx0, y0, sx1, y0 + w, walkProps(`sidewalk, ${tag}`));
      if (v) rm.add(sx0, y0 + w, sx1, y0 + w + v, vergeProps(`verge, ${tag}`));
      carriage(sx0, y0 + w + v, sx1, y1 - w - v, 'x', tag);
      if (v) rm.add(sx0, y1 - w - v, sx1, y1 - w, vergeProps(`verge, ${tag}`));
      rm.add(sx0, y1 - w, sx1, y1, walkProps(`sidewalk, ${tag}`));
    } else {
      rm.add(sx0, y0, sx0 + w, y1, walkProps(`sidewalk, ${tag}`));
      if (v) rm.add(sx0 + w, y0, sx0 + w + v, y1, vergeProps(`verge, ${tag}`));
      carriage(sx0 + w + v, y0, sx1 - w - v, y1, 'y', tag);
      if (v) rm.add(sx1 - w - v, y0, sx1 - w, y1, vergeProps(`verge, ${tag}`));
      rm.add(sx1 - w, y0, sx1, y1, walkProps(`sidewalk, ${tag}`));
    }
  }

  /**
   * A junction: no centre line through it, and the sidewalk corners.
   *
   * THE TWO WIDTHS ARE NOT THE SAME WIDTH. A corner is as deep as the
   * sidewalk of the street it belongs to, and where Main Street crosses
   * a residential one those are 336 and 168 — so a square corner of the
   * larger ate the whole 576 of the smaller and left the middle of the
   * junction with a negative width. The corner is a rectangle.
   */
  function junction(x0, y0, x1, y1, tag, mainAcross = false) {
    const wx = mainAcross ? MAIN_WALK : WALK + VERGE;   // down the column
    const wy = WALK + VERGE;                            // along the row
    /* the four corners of sidewalk, which is what makes a crossing a
       crossing — the carriageways run right through the middle */
    rm.add(x0, y0, x0 + wx, y0 + wy, walkProps(`corner, ${tag}`));
    rm.add(x1 - wx, y0, x1, y0 + wy, walkProps(`corner, ${tag}`));
    rm.add(x0, y1 - wy, x0 + wx, y1, walkProps(`corner, ${tag}`));
    rm.add(x1 - wx, y1 - wy, x1, y1, walkProps(`corner, ${tag}`));
    const road = (a, b, c, d, tex, n) => rm.add(a, b, c, d,
      open(n, { floorTex: tex, light: 0.30, ambient: 0.30, fuel: TOWN_FUEL.road }));
    const B = 24;                                       // how deep a crossing bar is
    /* the mouths, with the crossing bars painted across them */
    road(x0 + wx, y0, x1 - wx, y0 + B, 'CROSSWLK', `crossing, ${tag}`);
    road(x0 + wx, y1 - B, x1 - wx, y1, 'CROSSWLK', `crossing, ${tag}`);
    road(x0, y0 + wy, x0 + B, y1 - wy, 'CROSSWLK', `crossing, ${tag}`);
    road(x1 - B, y0 + wy, x1, y1 - wy, 'CROSSWLK', `crossing, ${tag}`);
    road(x0 + wx, y0 + B, x1 - wx, y0 + wy, 'ASPHOLD', `junction, ${tag}`);
    road(x0 + wx, y1 - wy, x1 - wx, y1 - B, 'ASPHOLD', `junction, ${tag}`);
    road(x0 + B, y0 + wy, x0 + wx, y1 - wy, 'ASPHOLD', `junction, ${tag}`);
    road(x1 - wx, y0 + wy, x1 - B, y1 - wy, 'ASPHOLD', `junction, ${tag}`);
    road(x0 + wx, y0 + wy, x1 - wx, y1 - wy, 'ASPHOLD', `junction, ${tag}`);
  }

  /* ---- the whole grid of them ------------------------------------- */
  for (let r = 0; r <= 5; r++) {
    for (let c = 0; c <= 5; c++) {
      junction(G.sx[c][0], G.sy[r][0], G.sx[c][1], G.sy[r][1], `${r}${c}`, c === 3);
      /* the run east of this junction */
      if (c < 5) streetRun(G.sx[c][1], G.sx[c + 1][0], G.sy[r][0], G.sy[r][1], 'x', `row ${r} west of ${c + 1}`);
      /* and the run south of it */
      if (r < 5) streetRun(G.sx[c][0], G.sx[c][1], G.sy[r + 1][1], G.sy[r][0], 'y', `col ${c} south of ${r}`, c === 3);
    }
  }

  /* =================================================================
     A HOUSE

     Four plans and three dressings, not thirty-two hand-drawn houses.
     It is a street: they are SUPPOSED to be the same house eight times,
     and the eye reads the roofline and the paint.

       GROUND   hall and stair down one side, front room, kitchen
       FIRST    landing, front bedroom, back bedroom
       SECOND   the same again, where there is one

     The stair is SEVEN TREADS of 16 rise and 32 going, each one a
     column of stepped boxes: tread i is floor 16i, ceiling 16i + 96,
     and the next flight sits over it with the deck between. Sixteen a
     step is under the engine's twenty-four, so you walk up it without
     slowing down.
     ================================================================= */

  /** A stack of storey props, bottom-up. */
  function storeys(n, perStorey) {
    const out = [];
    for (let k = 0; k < n; k++) out.push({ floor: floorOf(k), ceil: ceilOf(k), ...perStorey(k) });
    return out;
  }

  /**
   * One house.
   *
   * @param x0,y0   the front-left corner of the BUILDING
   * @param w,d     its footprint
   * @param n       storeys
   * @param facing  which way the front door points: 'N','S','E','W'
   * @param dress   an entry of DRESS
   * @param lit     which storeys have a light on
   */
  function house(x0, y0, w, d, n, facing, dress, tag, lit) {
    /* THE ROOF IS A STOREY NOW, and not a picture hung over the house.
       Every rect of the house gets one more sector on top of its column
       whose CEILING is the building's gable — see A SLOPE in
       js/level.js — so the engine knows it is there: you cannot walk
       through it, you cannot shoot through it, and the gunship clears
       it. The ridge is shared by every rect of the house, which is what
       makes a terrace one roof and not sixteen.

       The ridge runs ALONG the row, so a house shows its eaves to the
       street and its gable to the house next door, and a terrace comes
       out with one roof down its whole length and a triangle at each
       end. That triangle is not drawn: it is the one-sided wall of the
       roof storey, which runs from the top of the brick up to the
       ceiling above it, and is of no height at all where the ceiling
       comes down to meet the wall. */
    const eaves = n * STOREY;
    const ridge = gableSlope('x', y0 + d / 2, d / 2, eaves, RIDGE);
    const roofStorey = () => ({
      floor: eaves, ceil: eaves + RIDGE, slopeCeil: ridge,
      floorTex: 'NONE', ceilTex: 'NONE',        // the loft, which nobody is in
      roofTex: dress.roof, roofLight: 0.40,
      wallTex: dress.gable, upperTex: dress.gable, lowerTex: dress.gable,
      light: 0.16, ambient: 0.16, fuel: 0, name: `${tag} roof`,
    });
    /* THE PLAN IS DRAWN FACING NORTH and then turned, so there is one
       floor plan in this file and not four. `put` takes local
       coordinates with the front door at the bottom and the hall on the
       left, and lands them wherever the house actually is. */
    const put = (lx0, ly0, lx1, ly1, props) => {
      let a, b, c, e;
      if (facing === 'N') { a = x0 + lx0; b = y0 + d - ly1; c = x0 + lx1; e = y0 + d - ly0; }
      else { a = x0 + w - lx1; b = y0 + ly0; c = x0 + w - lx0; e = y0 + ly1; }
      return rm.add(Math.min(a, c), Math.min(b, e), Math.max(a, c), Math.max(b, e), props);
    };

    const HALL = Math.min(96, Math.round(w * 0.22 / 16) * 16);
    const ROOMX = HALL + WALL;
    const room = w - ROOMX;
    const front = Math.round((d * 0.5) / 16) * 16;       // depth of the front room
    const stairY0 = Math.round((d * 0.28) / 16) * 16;
    const stairY1 = stairY0 + 7 * 32;
    const inside = k => ({
      light: lit[k] ? 0.54 : 0.17, ambient: lit[k] ? 0.54 : 0.17,
      ceilTex: 'PLASTER', wallTex: 'WALLPAPR', upperTex: 'PLASTER', lowerTex: 'SKIRTING',
      /* A PARTY WALL IS A WALL FIRE GETS THROUGH. Sixteen units of void
         between two houses stops it the way any wall does, and then it
         does not: see _linkCells in js/fire.js, which links two regions
         that both say this across a wall it would otherwise call solid.
         It is the difference between burning a house and burning a
         street, and it is one flag on one kind of room. */
      party: true,
    });

    /* the hall, which runs the depth of the house with the stair in it */
    put(0, 0, HALL, stairY0, { ...inside(0), floorTex: 'FLOORBRD', fuel: TOWN_FUEL.hall,
      name: `${tag} hall`, storeys: [...storeys(n, k => ({
        ...inside(k), floorTex: 'FLOORBRD', fuel: TOWN_FUEL.hall,
        name: `${tag} ${k ? 'landing' : 'hall'}`,
      })), roofStorey()] });
    /* SEVEN TREADS. A column of stepped boxes is a staircase and it is
       also, exactly, what a staircase is. */
    for (let i = 0; i < 7; i++) {
      const st = [];
      for (let k = 0; k + 1 < n; k++)
        st.push({ floor: floorOf(k) + 16 * i, ceil: floorOf(k) + 16 * i + CLEAR });
      if (!st.length) st.push({ floor: 0, ceil: CLEAR });
      st.push(roofStorey());
      put(0, stairY0 + i * 32, HALL, stairY0 + (i + 1) * 32, {
        ...inside(0), floorTex: 'STAIRTRD', lowerTex: 'STAIRTRD',
        fuel: TOWN_FUEL.stair, name: `${tag} stair`, storeys: st,
      });
    }
    put(0, stairY1, HALL, d, { ...inside(0), floorTex: 'FLOORBRD', fuel: TOWN_FUEL.hall,
      name: `${tag} back hall`, storeys: [...storeys(n, k => ({
        ...inside(k), floorTex: 'FLOORBRD', fuel: TOWN_FUEL.hall,
        name: `${tag} ${k ? 'landing rear' : 'back hall'}`,
      })), roofStorey()] });

    /* the rooms: one at the front, one at the back */
    put(ROOMX, 0, w, front, { ...inside(0), floorTex: 'FLOORBRD', fuel: TOWN_FUEL.room,
      name: `${tag} front room`, storeys: [...storeys(n, k => ({
        ...inside(k), floorTex: k ? 'CARPETDM' : 'FLOORBRD',
        fuel: k ? TOWN_FUEL.bed : TOWN_FUEL.room,
        name: `${tag} ${k ? 'front bedroom' : 'front room'}`,
      })), roofStorey()] });
    put(ROOMX, front + WALL, w, d, { ...inside(0), floorTex: 'KITCHTIL', fuel: TOWN_FUEL.kitchen,
      name: `${tag} kitchen`, storeys: [...storeys(n, k => ({
        ...inside(k), floorTex: k ? 'CARPETDM' : 'KITCHTIL',
        fuel: k ? TOWN_FUEL.bed : TOWN_FUEL.kitchen,
        name: `${tag} ${k ? 'back bedroom' : 'kitchen'}`,
      })), roofStorey()] });

    /* the doors, which are the rectangles that bridge the walls. A door
       head is 64, so the band above it is the lintel and wears the
       outside of the house — which is what a lintel is. */
    const door = (lx0, ly0, lx1, ly1, name, upper) => put(lx0, ly0, lx1, ly1, {
      ...inside(0), floorTex: 'FLOORBRD', fuel: TOWN_FUEL.hall, name,
      upperTex: upper, lowerTex: 'SKIRTING',
      storeys: [...Array.from({ length: n }, (_, k) => ({ floor: floorOf(k), ceil: floorOf(k) + 64 })),
                roofStorey()],
    });
    door(HALL, 48, ROOMX, 112, `${tag} front door way`, 'PLASTER');
    door(HALL, front + WALL + 32, ROOMX, front + WALL + 96, `${tag} kitchen door`, 'PLASTER');
    /* AND THE DOOR BETWEEN THE TWO ROOMS, which is the one that makes
       the upstairs a floor rather than two halves of one.
   *
       The stair rises from the FRONT of the hall to the BACK, so you
       arrive on the rear landing; the next flight starts at the front
       again. Without this door the front landing and the rear landing
       are two rooms in the same house with a staircase between them and
       no way from one to the other, and the check that walks every
       storey of every house from its own front hall is what said so. */
    door(ROOMX + 32, front, ROOMX + 96, front + WALL, `${tag} room door`, 'PLASTER');
    /* and the front door itself, out into the yard: ground only, because
       nobody has a front door on the first floor */
    put(16, -WALL, 16 + 64, 0, {
      ...inside(0), floorTex: 'FLOORBRD', fuel: TOWN_FUEL.hall,
      name: `${tag} front step`, upperTex: dress.wall, lowerTex: 'KERBSTON',
      storeys: [{ floor: 0, ceil: 64 }],
    });
    /* the back door */
    put(ROOMX + 32, d, ROOMX + 96, d + WALL, {
      ...inside(0), floorTex: 'KITCHTIL', fuel: TOWN_FUEL.hall,
      name: `${tag} back door`, upperTex: dress.wall, lowerTex: 'KERBSTON',
      storeys: [{ floor: 0, ceil: 64 }],
    });

    out.houses.push({ x0, y0, w, d, n, tag });
    return { eaves: n * STOREY, ridge: n * STOREY + RIDGE };
  }

  /* ---- yards, which are what the house's outside is drawn on ------- */
  /* The exterior skin of a building in this engine belongs to the sector
     OUTSIDE it: a one-sided line takes its texture from whichever side
     has a sector, and out here that side is the yard. So a yard carries
     its own house's brick, and the yards on the street side carry the
     window wall — which is how a town at night becomes a grid of lit
     rectangles without one window being a sector. */
  function yard(x0, y0, x1, y1, dress, name, eaves, windows) {
    return rm.add(x0, y0, x1, y1, open(name, {
      /* the ceiling is the EAVES, so the brick stops where the roof
         starts and the step up to the open sky above it draws nothing —
         both are sky, and a step between two patches of sky is two
         different heights of nothing */
      ceil: eaves, floorTex: 'GRASSVRG', light: 0.36, ambient: 0.36,
      wallTex: windows || dress.wall, upperTex: windows || dress.wall,
      lowerTex: 'KERBSTON', fuel: TOWN_FUEL.yard,
    }));
  }

  /* =================================================================
     A BLOCK OF HOUSES — six lots to a face, two faces back to back
     ================================================================= */
  function housesBlock(bx, by, tag) {
    const [x0, x1] = bx, [y0, y1] = by;
    const lots = Math.floor((x1 - x0) / LOT_W);
    for (let face = 0; face < 2; face++) {
      /* face 0 fronts the street to the north, face 1 the one to the
         south, and they are back to back with their gardens meeting */
      const north = face === 0;
      for (let i = 0; i < lots; i++) {
        const lx = x0 + i * LOT_W;
        const dress = DRESS[(i + face * 2 + Math.floor(R() * 4)) % DRESS.length];
        const n = R() < 0.25 ? 3 : 2;
        const lit = Array.from({ length: n }, () => R() < 0.22);
        const hx = lx + (LOT_W - HOUSE_W) / 2;
        const eaves = n * STOREY;
        const tagI = `${tag} no ${i + 1 + face * lots}`;
        if (north) {
          const fy1 = y1 - FRONT_YARD;                    // the front wall
          const hy0 = fy1 - HOUSE_D;
          yard(lx, fy1 + WALL, lx + LOT_W, y1, dress, `${tagI} front yard`, eaves, dress.win);
          house(hx, hy0, HOUSE_W, HOUSE_D, n, 'N', dress, tagI, lit);
          yard(lx, y1 - FACE, lx + LOT_W, hy0 - WALL, dress, `${tagI} back yard`, eaves, null);
        } else {
          const fy0 = y0 + FRONT_YARD;
          const hy1 = fy0 + HOUSE_D;
          yard(lx, y0, lx + LOT_W, fy0 - WALL, dress, `${tagI} front yard`, eaves, dress.win);
          house(hx, fy0, HOUSE_W, HOUSE_D, n, 'S', dress, tagI, lit);
          yard(lx, hy1 + WALL, lx + LOT_W, y0 + FACE, dress, `${tagI} back yard`, eaves, null);
        }
      }
    }
  }

  /* A pitched roof is GEOMETRY and not a sector — see roofGeometry in
     js/mapgeo.js. It is hung on whichever sector happens to be handy,
     because nothing about it is that sector's business except which
     block it is drawn in. */
  const roofPending = [];
  function roofOver(x0, y0, x1, y1, base, dress, along) {
    roofPending.push({ x0: x0 - 12, y0: y0 - 12, x1: x1 + 12, y1: y1 + 12,
      base, rise: RIDGE, tex: dress.roof, gableTex: dress.gable, along, light: 0.34, sky: 1 });
    out.roofs++;
  }

  /* =================================================================
     A TERRACE — sixteen to a face, party walls, three storeys on Main
     Street with a shop under the flats
     ================================================================= */
  function rowsBlock(bx, by, tag, shops = false) {
    const [x0, x1] = bx, [y0, y1] = by;
    const lots = Math.floor((x1 - x0) / ROW_W);
    for (let face = 0; face < 2; face++) {
      const north = face === 0;
      const dress = DRESS[face === 0 ? 0 : 3];
      const n = shops ? 3 : (face === 0 ? 3 : 2);
      const eaves = n * STOREY;
      const D = 768;
      const setback = shops ? 48 : 128;
      const gy = north ? y1 - setback : y0 + setback;
      const hy0 = north ? gy - D : gy;
      const hy1 = north ? gy : gy + D;
      /* one yard strip for the whole terrace, front and back: a terrace
         has no gaps down its sides and that is the point of one */
      if (north) {
        yard(x0, hy1 + WALL, x1, y1, dress, `${tag} frontage`, eaves, shops ? 'SHOPFRNT' : dress.win);
        yard(x0, y1 - FACE, x1, hy0 - WALL, dress, `${tag} back yards`, eaves, null);
      } else {
        yard(x0, y0, x1, hy0 - WALL, dress, `${tag} frontage`, eaves, shops ? 'SHOPFRNT' : dress.win);
        yard(x0, hy1 + WALL, x1, y0 + FACE, dress, `${tag} back yards`, eaves, null);
      }
      for (let i = 0; i < lots; i++) {
        const lx = x0 + i * ROW_W + (ROW_W - ROW_HOUSE_W) / 2;
        const lit = Array.from({ length: n }, (_, k) => (k > 0 || !shops) && R() < 0.30);
        house(lx, hy0, ROW_HOUSE_W, D, n, north ? 'N' : 'S', dress, `${tag} no ${i + 1 + face * lots}`, lit);
      }
    }
  }

  /* =================================================================
     THE SCHOOL — a double-loaded corridor, ten classrooms, and a gym
     that is two storeys tall in ONE span, which the column model gets
     for nothing: a building is not N floors, it is a set of columns
     some of which are taller than others.
     ================================================================= */
  function school(bx, by, tag) {
    const [x0, x1] = bx, [y0, y1] = by;
    /* As wide as the block will take, which is what a school is: the
       plan asked for ten classrooms over 2400 and ten will not fit
       beside a gym, so the building is the block less its wall and the
       corridor gets as many rooms as 1824 units of it will hold. */
    const W = (x1 - x0) - 2 * WALL, D = 1600;
    const sx0 = x0 + WALL;
    const sy0 = y0 + Math.round((y1 - y0 - D) / 2 / 16) * 16;
    const LOBBY_W = 192;
    const eaves = 2 * STOREY;
    /* the grounds, which carry the school's brick */
    const grounds = { wall: 'SCHOOLBR', win: 'SCHOOLBR', roof: 'ROOFSEAM', gable: 'SCHOOLBR' };
    rm.add(x0, y0, x1, sy0 - WALL, open(`${tag} front lawn`, { ceil: eaves, floorTex: 'GRASSVRG', wallTex: 'SCHOOLBR', upperTex: 'SCHOOLBR', fuel: TOWN_FUEL.yard }));
    rm.add(x0, sy0 + D + WALL, x1, y1, open(`${tag} rear lawn`, { ceil: eaves, floorTex: 'GRASSVRG', wallTex: 'SCHOOLBR', upperTex: 'SCHOOLBR', fuel: TOWN_FUEL.yard }));
    /* no lawn down the sides: the building takes the block's whole
       width, which is what a school built in 1954 does */

    const inside = k => ({
      light: 0.30, ambient: 0.30, ceilTex: 'PLASTER', wallTex: 'PLASTER',
      upperTex: 'PLASTER', lowerTex: 'LOCKERS',
    });
    const CORR = 128, CLASS_D = 384, CLASS_W = 480;
    const corrY = sy0 + (D - CORR) / 2;
    /* THE CORRIDOR IS THE SCHOOL, the way an aisle is the supermarket:
       the length of the building, with lockers as a lower texture down
       both sides of it. */
    rm.add(sx0, corrY, sx0 + W - 1200 - WALL, corrY + CORR, {
      ...inside(0), floorTex: 'KITCHTIL', fuel: TOWN_FUEL.hallway, name: `${tag} corridor`,
      storeys: storeys(2, k => ({ ...inside(k), floorTex: 'KITCHTIL', fuel: TOWN_FUEL.hallway, name: `${tag} corridor ${k}` })),
    });
    /* ten classrooms off it, five a side, with a door each */
    const run = W - 1200 - WALL;
    for (let side = 0; side < 2; side++) {
      /* the south row starts past the lobby, which runs from the front
         door up to the corridor and would otherwise go through a
         classroom */
      const off = side ? 0 : LOBBY_W + WALL;
      const rooms = Math.floor((run - off) / (CLASS_W + WALL));
      for (let i = 0; i < rooms; i++) {
        const rx = sx0 + off + i * (CLASS_W + WALL);
        const ry0 = side ? corrY + CORR + WALL : corrY - WALL - CLASS_D;
        rm.add(rx, ry0, rx + CLASS_W, ry0 + CLASS_D, {
          ...inside(0), floorTex: 'FLOORBRD', fuel: TOWN_FUEL.class,
          upperTex: 'BLACKBRD', name: `${tag} classroom`,
          storeys: storeys(2, k => ({ ...inside(k), floorTex: 'FLOORBRD', fuel: TOWN_FUEL.class, upperTex: 'BLACKBRD', name: `${tag} classroom ${k}` })),
        });
        const dy = side ? corrY + CORR : corrY - WALL;
        rm.add(rx + 160, dy, rx + 224, dy + WALL, {
          ...inside(0), floorTex: 'KITCHTIL', fuel: TOWN_FUEL.hallway, name: `${tag} classroom door`,
          upperTex: 'PLASTER',
          storeys: [{ floor: 0, ceil: 64 }, { floor: STOREY, ceil: STOREY + 64 }],
        });
      }
    }
    /* THE GYM: 1200 by 800, two storeys tall in one span. A column of
       ONE that is 224 where its neighbours are two of 112, and the
       whole argument for the column over a fixed stack of floors. */
    const gx = sx0 + W - 1200;
    rm.add(gx, sy0 + (D - 800) / 2, gx + 1200, sy0 + (D + 800) / 2, {
      light: 0.28, ambient: 0.28, floor: 0, ceil: 2 * STOREY, floorTex: 'FLOORBRD',
      ceilTex: 'PLASTER', wallTex: 'PLASTER', upperTex: 'PLASTER', lowerTex: 'SKIRTING',
      fuel: TOWN_FUEL.gym, name: `${tag} gym`,
    });
    rm.add(gx - WALL, corrY, gx, corrY + CORR, {
      ...inside(0), floorTex: 'KITCHTIL', fuel: TOWN_FUEL.hallway, name: `${tag} gym doors`,
      upperTex: 'PLASTER', storeys: [{ floor: 0, ceil: 96 }],
    });
    /* the way in, off the front lawn */
    rm.add(sx0 + 48, sy0 - WALL, sx0 + 144, sy0, {
      ...inside(0), floorTex: 'KITCHTIL', fuel: TOWN_FUEL.hallway, name: `${tag} front door`,
      upperTex: 'SCHOOLBR', storeys: [{ floor: 0, ceil: 96 }],
    });
    rm.add(sx0, sy0, sx0 + LOBBY_W, corrY, {
      ...inside(0), floorTex: 'KITCHTIL', fuel: TOWN_FUEL.hallway, name: `${tag} lobby`,
      storeys: storeys(2, k => ({ ...inside(k), floorTex: 'KITCHTIL', fuel: TOWN_FUEL.hallway, name: `${tag} lobby ${k}` })),
    });
    roofOver(sx0, sy0, sx0 + W, sy0 + D, eaves, grounds, 'x');
    out.school = { x: sx0 + W / 2, y: sy0 + D / 2 };
  }

  /* the ball field, which is what tells you it is a school from three
     streets away, and is therefore built before the building is */
  function field(bx, by, tag) {
    const [x0, x1] = bx, [y0, y1] = by;
    rm.add(x0, y0, x1, y1, open(`${tag} ball field`, {
      floorTex: 'GRASSVRG', light: 0.28, ambient: 0.28, fuel: TOWN_FUEL.yard,
      wallTex: 'CHAINLNK', upperTex: 'CHAINLNK',
    }));
  }

  /* =================================================================
     THE CHURCH — white clapboard, a gable to the street, a tower with
     a spire, and a CHOIR LOFT over the narthex: a real second storey
     over a real ground floor, and the first place in the game where you
     can look down on a room you were just standing in.
     ================================================================= */
  function church(bx, by, tag) {
    const [x0, x1] = bx, [y0, y1] = by;
    const NAVE_W = 640, NAVE_D = 960, NARTH_D = 160, TOWER = 256;
    const cx = x0 + Math.round((x1 - x0 - NAVE_W) / 2 / 16) * 16;
    const cy = y1 - 640;
    const dress = { wall: 'CHURCHWD', win: 'STAINGLS', roof: 'SHINGLE', gable: 'CHURCHWD' };
    const eaves = 3 * STOREY;
    /* THE CHURCHYARD, which carries the clapboard and the glass — the
       skin of a building belongs to the sector outside it, so the
       churchyard is what the nave is drawn in. Four rects around the
       church and not one under it: two rectangles that overlap are a
       room you can stand in two of at once. */
    const cbx0 = cx - WALL, cbx1 = cx + NAVE_W + WALL;
    const cby0 = cy - NAVE_D - WALL, cby1 = cy + WALL + TOWER + WALL;
    const grave = (a, b, c2, d2, n) => rm.add(a, b, c2, d2, open(n, {
      ceil: eaves, floorTex: 'GRASSVRG', light: 0.26, ambient: 0.26,
      wallTex: 'STAINGLS', upperTex: 'CHURCHWD', lowerTex: 'KERBSTON', fuel: TOWN_FUEL.yard,
    }));
    grave(x0, y0, x1, cby0, `${tag} churchyard, behind`);
    grave(x0, cby1, x1, y1, `${tag} churchyard, the front`);
    grave(x0, cby0, cbx0, cby1, `${tag} churchyard, west`);
    grave(cbx1, cby0, x1, cby1, `${tag} churchyard, east`);
    const holy = { light: 0.34, ambient: 0.34, ceilTex: 'PLASTER', wallTex: 'PLASTER', upperTex: 'PLASTER', lowerTex: 'PEWEND' };
    /* THE NAVE: 336 of ceiling, three storeys of air in one column */
    rm.add(cx, cy - NAVE_D, cx + NAVE_W, cy - NARTH_D - WALL, {
      ...holy, floor: 0, ceil: 3 * STOREY, floorTex: 'FLOORBRD',
      fuel: TOWN_FUEL.nave, name: `${tag} nave`,
    });
    /* THE NARTHEX with the choir loft over it */
    rm.add(cx, cy - NARTH_D, cx + NAVE_W, cy, {
      ...holy, floorTex: 'FLOORBRD', fuel: TOWN_FUEL.nave, name: `${tag} narthex`,
      storeys: [
        { floor: 0, ceil: 2 * STOREY - WALL, name: `${tag} narthex` },
        { floor: 2 * STOREY, ceil: 3 * STOREY, name: `${tag} choir loft`, floorTex: 'FLOORBRD' },
      ],
    });
    /* the way through from one to the other, on both levels */
    rm.add(cx + 224, cy - NARTH_D - WALL, cx + 416, cy - NARTH_D, {
      ...holy, floorTex: 'FLOORBRD', fuel: TOWN_FUEL.nave, name: `${tag} nave door`,
      storeys: [{ floor: 0, ceil: 112 }, { floor: 2 * STOREY, ceil: 3 * STOREY }],
    });
    /* THE TOWER: three levels and then the spire, which is geometry */
    const tx = cx + (NAVE_W - TOWER) / 2;
    rm.add(tx, cy + WALL, tx + TOWER, cy + WALL + TOWER, {
      ...holy, floorTex: 'FLOORBRD', fuel: TOWN_FUEL.nave, name: `${tag} tower`,
      storeys: [
        { floor: 0, ceil: CLEAR },
        { floor: STOREY, ceil: STOREY + CLEAR },
        { floor: 2 * STOREY, ceil: 3 * STOREY + CLEAR },
      ],
    });
    /* the tower stair, which is how the loft is reached */
    for (let i = 0; i < 7; i++) {
      rm.add(tx + TOWER + WALL + 0, cy + WALL + i * 32, tx + TOWER + WALL + 64, cy + WALL + (i + 1) * 32, {
        ...holy, floorTex: 'STAIRTRD', lowerTex: 'STAIRTRD', fuel: TOWN_FUEL.stair,
        name: `${tag} tower stair`,
        storeys: [
          { floor: 16 * i, ceil: 16 * i + CLEAR },
          { floor: STOREY + 16 * i, ceil: STOREY + 16 * i + CLEAR },
        ],
      });
    }
    /* the door between tower and stair, and stair and loft */
    rm.add(tx + TOWER, cy + WALL + 32, tx + TOWER + WALL, cy + WALL + 160, {
      ...holy, floorTex: 'FLOORBRD', fuel: TOWN_FUEL.nave, name: `${tag} tower door`,
      storeys: [{ floor: 0, ceil: 96 }, { floor: STOREY, ceil: STOREY + 96 }],
    });
    /* and the front door, out into the churchyard */
    rm.add(tx + 80, cy + WALL + TOWER, tx + 176, cy + WALL + TOWER + WALL, {
      ...holy, floorTex: 'FLOORBRD', fuel: TOWN_FUEL.nave, name: `${tag} church door`,
      upperTex: 'CHURCHWD', storeys: [{ floor: 0, ceil: 112 }],
    });
    /* narthex to tower */
    rm.add(tx + 80, cy, tx + 176, cy + WALL, {
      ...holy, floorTex: 'FLOORBRD', fuel: TOWN_FUEL.nave, name: `${tag} tower way`,
      storeys: [{ floor: 0, ceil: 112 }],
    });
    roofOver(cx, cy - NAVE_D, cx + NAVE_W, cy, eaves, dress, 'y');
    /* the spire: a roof with a tall rise and a small footprint, which is
       what a spire is */
    roofPending.push({ x0: tx - 8, y0: cy + WALL - 8, x1: tx + TOWER + 8, y1: cy + WALL + TOWER + 8,
      base: 3 * STOREY + CLEAR, rise: 320, tex: 'SHINGLE', gableTex: 'CHURCHWD', along: 'y', light: 0.38, sky: 1 });
    out.roofs++;
    out.church = { x: cx + NAVE_W / 2, y: cy - NAVE_D / 2 };
  }

  /* =================================================================
     THE ONES WITH A JOB — a shed with a door in it and a name, which
     is all most of these need to be. The fire station and the police
     station are the two that matter, because they turn
     ResponderState.arrive from a PLACEHOLDER into a door.
     ================================================================= */
  function shed(x0, y0, x1, y1, tag, dress, n, fuel, floorTex, key) {
    const eaves = n * STOREY;
    house(x0 + WALL, y0 + WALL, x1 - x0 - 2 * WALL, y1 - y0 - 2 * WALL, n, 'S', dress, tag,
          Array.from({ length: n }, () => true));
    roofOver(x0, y0, x1, y1, eaves, dress, (x1 - x0) > (y1 - y0) ? 'x' : 'y');
    if (key) out.stations[key] = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  }

  function servicesBlock(bx, by, tag) {
    const [x0, x1] = bx, [y0, y1] = by;
    const brick = DRESS[0];
    /* the forecourt they all stand on */
    rm.add(x0, y0, x1, y1 - 1600 - WALL, open(`${tag} station lot`, {
      floorTex: 'ASPHOLD', light: 0.30, ambient: 0.30, fuel: TOWN_FUEL.park,
      wallTex: 'BRICKRED', upperTex: 'BRICKRED',
    }));
    rm.add(x0, y1 - 1600, x0 + 1440, y1, open(`${tag} fire station apron`, {
      ceil: 2 * STOREY, floorTex: 'ASPHOLD', light: 0.34, ambient: 0.34,
      fuel: TOWN_FUEL.park, wallTex: 'BRICKRED', upperTex: 'BRICKRED',
    }));
    rm.add(x0 + 1440 + WALL, y1 - 1600, x1, y1, open(`${tag} police lot`, {
      ceil: 2 * STOREY, floorTex: 'ASPHOLD', light: 0.32, ambient: 0.32,
      fuel: TOWN_FUEL.park, wallTex: 'BRICKRED', upperTex: 'BRICKRED',
    }));
    out.stations.fire = { x: x0 + 720, y: y1 - 800 };
    out.stations.police = { x: x0 + 1440 + (x1 - x0 - 1440) / 2, y: y1 - 800 };
  }

  function plainBlock(bx, by, tag, floorTex, fuel, wallTex) {
    const [x0, x1] = bx, [y0, y1] = by;
    rm.add(x0, y0, x1, y1, open(tag, {
      floorTex, fuel, light: 0.26, ambient: 0.26,
      wallTex: wallTex || 'BRICKRED', upperTex: wallTex || 'BRICKRED',
    }));
  }

  /* ---- and then the table ----------------------------------------- */
  const ROWS = 'ABCDE';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const bx = G.bx[c], by = G.by[r];
      const tag = `${ROWS[r]}${c + 1}`;
      switch (BLOCK_PLAN[r][c]) {
        case 'houses':   housesBlock(bx, by, tag); break;
        case 'rows':     rowsBlock(bx, by, tag, false); break;
        case 'civic':    rowsBlock(bx, by, tag, true); break;
        case 'flats':    rowsBlock(bx, by, tag, false); break;
        case 'school':   school(bx, by, tag); break;
        case 'field':    field(bx, by, tag); break;
        case 'church':   church(bx, by, tag); break;
        case 'stations': servicesBlock(bx, by, tag); break;
        case 'square':   plainBlock(bx, by, `${tag} the green`, 'GRASSVRG', TOWN_FUEL.yard, 'BRICKPNT'); break;
        case 'park':     plainBlock(bx, by, `${tag} the park`, 'GRASSVRG', TOWN_FUEL.yard, 'BRICKPNT'); break;
        case 'cemetery': plainBlock(bx, by, `${tag} the cemetery`, 'GRASSVRG', TOWN_FUEL.yard, 'BRICKPNT'); break;
        case 'motel':    plainBlock(bx, by, `${tag} the motel lot`, 'ASPHOLD', TOWN_FUEL.park, 'BRICKPNT'); break;
        case 'gas':      plainBlock(bx, by, `${tag} the forecourt`, 'CONCRETE', TOWN_FUEL.park, 'BRICKPNT'); break;
        default:         plainBlock(bx, by, tag, 'ASPHOLD', TOWN_FUEL.park, 'BRICKRED'); break;
      }
    }
  }

  out.roofPending = roofPending;
  return out;
}
