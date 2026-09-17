/* =====================================================================
   GROCERY STORE SIMULATOR — the town
   =====================================================================

   A strip mall in a wood is a firebreak with a shop in it. You burn one
   building and then you burn some trees, and that is the game's ceiling:
   the car park is two hundred and eighty units of tarmac and the ring
   road is another three hundred, and nothing crosses either.

   So there is a town on the far side of it. Five by five blocks of 3072
   on a pitch of 3648, a school, a church, and streets of houses with a
   foundation, a stoop, a door that is a door and windows that are holes
   in the wall with a pane at the back of them.

   THE MALL WAS ALREADY ON THE GRID. Its clearing is 14,000 by 6,992 and
   four pitches less one street is 13,968; two pitches less one street is
   6,720. The mall, its car park and its ring road are a four-by-two
   superblock on a grid nobody had drawn, to within thirty-two units
   across. Nothing here had to be reconciled with anything.

   A HOUSE IS A FACADE. The first cut of this town gave every house a
   hall, a stair, a kitchen and two bedrooms behind every door, and the
   check that walked every one of them found them all — and nobody ever
   went inside one, because a house at two in the morning is a thing you
   look AT. So the insides are gone, at the user's request, and what was
   spent on wallpaper nobody saw is spent on the outside: the shell of a
   house is one column of one storey (the roof) over the whole footprint,
   and the wall is a strip twenty-four deep along each face, made of
   solid pieces with RECESSES cut in it. A recess is a small open sector
   sixteen deep — floor at the sill, ceiling at the head — whose one
   back wall wears the pane or the door. See THE FACADE below.

   THE CHURCH AND THE SCHOOL KEEP THEIR INSIDES and get more of them:
   pews and an altar, desks and lockers, stairs that go somewhere, and
   windows you can see in through. The church is where you go to look at
   the column model working; the school is where the fire goes upstairs.

   EVERYTHING IS A COLUMN. See THE ONE NEW IDEA in TOWN.txt and
   MapBuilder.column in js/level.js: a sector may name the sector above
   it over the same polygon. A shut storey — ceiling on its floor — is a
   solid, and a solid with a sloped roof storey over it is a house.

   AND WALLS ARE THE GAPS, which is RectMap's rule: two rectangles that
   touch are an opening, so a wall is drawn by leaving void between two
   rooms or by putting a SHUT rectangle there. Both are used below.
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
   life and was not arranged. */
export const STOREY = 112, CLEAR = 96, RIDGE = 128;

/* The town's sky ceiling. The church spire breaks the mall's 480 and it
   is the only thing that does. */
export const SKY = 768;

/* the street, as five bands: 144 of walk | 24 of verge | 240 of
   carriageway | 24 verge | 144 walk, and the carriageway is two travel
   lanes with the centre line between them.

   THE SIDEWALK IS THREE TIMES THE PLAN'S and the kerb is twice, at the
   user's request, and both come out of the carriageway because the
   block pitch is load-bearing: 3648 is what puts the supermarket's own
   clearing on the grid, and a wider street would take it off.

   THE KERB IS TWENTY-FOUR, which is exactly the tallest step the engine
   will let anything walk up (MAX_STEP in js/util.js). One more unit and
   the sidewalks of an entire town would be a place you could see and
   not stand on. */
const WALK = 112, VERGE = 16;
export const KERB_H = 12;
const MAIN_WALK = 336;
const CARRIAGE = STREET - 2 * (WALK + VERGE);       // 320

/* THE SHOULDER. A carriageway is a parking lane, a travel lane, the
   centre line, a travel lane and a parking lane: 76 | 84 | 84 | 76 on a
   residential street and 76 | 91 | 91 | 76 on Main Street. A van is 174
   long and 65 wide, so a bay is 192 and a shoulder 76, and the bays are
   painted by the texture — one repeat is one bay, tiled from the world
   origin, and the vans are parked at the same arithmetic so they land
   between the lines. The sidewalk came down from 144 to 112 and the
   kerb from 24 to 12 to make room, both at the user's request; a
   sidewalk of 112 is still more than twice the plan's 48.
     BAY       how long a parking bay is
     DRAIN_L,D a storm drain's grate, in the gutter against the kerb
     VAN_ODDS  how many bays have a van in them */
const PARK = 76, BAY = 192;
const DRAIN_L = 48, DRAIN_D = 24;
const VAN_ODDS = 0.06;
/* THE KERB GOES ROUND THE CORNER. KERB_R is the radius of a sidewalk's
   corner at a junction, which is a square of that side with the quarter
   circle the sidewalk and the rest of it road — see AN ARC in
   js/maps/rectmap.js. It has to clear the crossing bar: R <= corner - B.
   BEND_R is the outside of a right-angle bend where the town's
   perimeter streets meet, which is the whole of the junction's middle:
   the disc is the road and the curved triangle outside it is pavement. */
const KERB_R = 96;

/* THE STREET LAMPS. One every 1536 along a sidewalk, staggered so the
   two sides alternate and a lamp is never more than 768 from you on a
   street, and a pool of light on the pavement under each one — which is
   the only way this renderer casts light, by being a sector. */
const LAMP_PITCH = 1536, POOL = 80;

/* how the lots sit on a block face */
const FACE = BLOCK / 2;             // 1536, one row of lots back to back
const LOT_W = 512;                  // 52 ft, a house lot
const HOUSE_W = 448, HOUSE_D = 768;
const FRONT_YARD = 192;             // from the sidewalk to the front wall
const ROW_W = 176;                  // 18 ft, a townhouse
const ROW_YARD = 128;               // a terrace's front garden
const SHOP_YARD = 48;               // and a shop's forecourt
const ROW_END = 128;                // the gap at each end of a terrace

/* THE FACADE, in numbers.

     ZONE     how thick a wall is: the strip along each face that is
              made of solid pieces and recesses
     NICHE    how deep a window or a door sits back in it. Eight units
              of void behind the recess is what makes its back wall a
              one-sided line, and a one-sided line wears its own
              storey's texture — which is the whole trick, because it
              lets one window column be lit upstairs and dark down
     FOUND    how much foundation shows above the ground, and the height
              of the stoop and of every door sill. Thirty-two is a
              metre, which is a house with a crawl space under it
     PLINTH   how far the foundation stands out from the wall */
export const ZONE = 24, NICHE = 16, FOUND = 32;
const PLINTH = 8;
const WIN_W = 64, WIN_SILL = 40, WIN_H = 64;
const DOOR_W = 48, DOOR_H = 80;
const STOOP_D = 32, TREAD_D = 16, STOOP_WING = 16;

/* THE ROOF, in numbers.

     EAVE      how far a roof overhangs an eave wall. The ground under
              it is a column of two — see underEaves — and the same
              thirty-two as the stoop, so the stoop is under it whole
     FASCIA_H  how thick the roof's edge is: the board on it
     PITCH_*   rise over half-span — for a house whose ridge runs along
              the street, for one whose gable faces it, and for a
              terrace. The first cut had every roof at 128 over 384,
              one in three, and a roof at one in three cannot be seen
              from the pavement in front of it: you are under its plane
              until you are twenty-one metres back, and from across the
              street it is a black wedge on top of the wall, which is
              what the user drew a ring round. Six in twelve is the
              least a roof is.
     ROOF_LIGHT how lit the shingle is, seen from above or from across
              the street: a little over the walls, because a roof faces
              the sky, and not so far over that it glows at night. The
              tar the first cut's roofs read as was the texture, not
              this — see T.SHINGLE. */
const EAVE = STOOP_D, FASCIA_H = 8;
const PITCH_SIDE = 0.55, PITCH_FRONT = 0.75, PITCH_ROW = 0.5;
const ROOF_LIGHT = 0.50;

/* WHAT BURNS. The houses do not, any more: a house is a shell with no
   inside, and what chars on a street is the yards and the siding facing
   them. The church and the school are the fuel in this town, and they
   go in at three hundred and over — pews, desks, floorboards, a corridor
   lined with painted steel and forty years of floor polish — because the
   spread chance in js/fire.js climbs as the 2.4th power of the fuel up
   to three hundred and stops there, and a corridor at a hundred and
   twenty was a firebreak down the middle of the school: a fire poured
   into it went out in two minutes having reached one classroom. */
export const TOWN_FUEL = {
  none: 0, road: 0, walk: 0, yard: 30, park: 60,
  nave: 400, class: 400, gym: 300, hallway: 320, stair: 380, office: 380,
};

/* the four dressings, which are what the eye actually reads off a
   street — not the floor plan, which is the same house eight times */
const DRESS = [
  { wall: 'BRICKRED', roof: 'SHINGLE', gable: 'GABLEND', doors: ['FRNTDOOR', 'FRNTDOR3'] },
  { wall: 'CLAPBRD',  roof: 'SHINGLE', gable: 'GABLEND', doors: ['FRNTDOR2', 'FRNTDOOR', 'FRNTDOR3'] },
  { wall: 'VINYLSID', roof: 'SHINGLE', gable: 'GABLEND', doors: ['FRNTDOOR', 'FRNTDOR3'] },
  { wall: 'BRICKPNT', roof: 'SHINGLE', gable: 'GABLEND', doors: ['FRNTDOR2', 'FRNTDOR3'] },
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
 * is MAIN STREET and is wider than the rest, which is the only
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
 * @returns     what the rest of the map needs to know about it:
 *              the grid, the stations, the school and the church, the
 *              PLANTS for js/forest.js to grow, the GLASS to hang in
 *              windows once the lines exist, and the spire
 */
export function buildTown(rm, mb, opts = {}) {
  const G = townGrid(opts.x0, opts.yTop);
  const R = rng(opts.seed ?? 20250915);
  const out = { grid: G, houses: [], stations: {}, lamps: 0, plants: [], glass: [],
                windows: 0, doors: 0, stones: 0, roofPending: [], carSlots: [], drains: 0, bends: 0,
                /* A FENCE IS NOT A SECTOR. It is a masked texture hung in
                   the hole between two patches of ground that are both
                   open to the sky — the same thing the mall's service
                   yard has had since there was a mall, and the reason a
                   chain link fence is something you see the ball field
                   THROUGH rather than a painted picture of one. The
                   lines do not exist until mb.build(), so what a builder
                   can do here is name the two sectors and let
                   js/maps/sellwrong.js hang the wire once they do. */
                fences: [] };
  const fence = (a, b, tex, h) => { out.fences.push({ a, b, tex, h }); return b; };

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
     light outdoor regions and four hundred street lamps against the
     town's indoor sectors is a startup cost for nothing. */
  const walkProps = (name, extra = {}) => open(name, {
    floor: KERB_H, floorTex: 'SIDEWALK', light: 0.46, ambient: 0.46,
    lowerTex: 'KERBSTON', fuel: TOWN_FUEL.walk, ...extra,
  });
  const vergeProps = (name, extra = {}) => open(name, {
    floor: KERB_H, floorTex: 'GRASSVRG', light: 0.40, ambient: 0.40,
    lowerTex: 'KERBSTON', fuel: TOWN_FUEL.yard, ...extra,
  });
  const lawn = (name, extra = {}) => open(name, {
    floorTex: 'GRASSVRG', light: 0.36, ambient: 0.36, fuel: TOWN_FUEL.yard, ...extra,
  });

  /* ---- the furniture, which is things and not sectors ------------- */
  /* A LAMP HAS A DIRECTION, and it is which way the ARM reaches. The
     lamp is not a sprite (see THE STREET LAMP IS GEOMETRY in
     js/mapgeo.js): it is a photograph stood up as a flat cut-out in
     the plane across the street, and the picture is a pole with a
     bracket arm on one side of it, so every caller says where the road
     is. Radians, the map's own convention: 0 is +x, a quarter turn is
     +y. The pool on the pavement under it says `lampLit`, which is the
     one word the pavement's shader needs to turn cold after dark. */
  function lamp(x, y, arm) { mb.thing('STREETLAMP', x, y, arm); out.lamps++; }
  function plant(kind, x, y, scale = 1) { out.plants.push({ kind, x, y, scale }); }
  /* WHAT THE TOWN PLANTS, which is not what the wood grows. The wood is
     firs; a street of firs is a town in a national park. These are the
     photographed broadleaves out of assets/forest/ — see KINDS in
     js/forest.js — and the hedge is clipped box, one block of it to a
     cell, planted in rows. */
  const BROADLEAF = ['street_round', 'street_broad', 'street_oval',
                     'street_upright', 'street_dense', 'street_big'];
  const broadleaf = () => BROADLEAF[Math.floor(R() * BROADLEAF.length)];
  /* THE PITCH OF A HEDGE IS THE WOOD'S OWN CELL, and it has to be,
     because a block of box is CANOPY (see isCanopy in js/forest.js) and
     the wood keeps one canopy plant to a cell: two blocks in the same
     64 units and the second is thrown away, which is a run of hedge
     with holes in it in a pattern nobody can trace back. Stepped
     exactly 64 along an axis, consecutive blocks land in consecutive
     cells whatever the run starts at, and none of them is lost. The
     box itself is 67 wide at scale 1, so at that pitch they touch. */
  const HEDGE_PITCH = 64;
  const hedged = [];                     // every block of box already laid
  /** A run of clipped box from a to b, one block every HEDGE_PITCH. */
  function hedgeRun(x0, y0, x1, y1, step = HEDGE_PITCH) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    if (len < 1) return;
    const n = Math.floor(len / step), ux = (dx / len) * step, uy = (dy / len) * step;
    /* AND NEVER SMALLER THAN THE PITCH. The block is 67 units across at
       scale 1 and they stand 64 apart, so anything under 0.95 leaves a
       slot of sky between one block and the next and the run reads as a
       row of topiary rather than as a hedge. */
    for (let i = 0; i <= n; i++) {
      const hx = x0 + ux * i, hy = y0 + uy * i;
      /* WHERE TWO RUNS MEET THEY BOTH WANT THE CORNER, and the second
         one to ask is asking for a block the wood will throw away: one
         canopy plant to a cell, and the cell is the pitch. Refused
         here, where it can be seen, rather than in _plantTown, where it
         cannot. */
      if (hedged.some(([ax, ay]) => Math.hypot(ax - hx, ay - hy) < HEDGE_PITCH - 0.1)) continue;
      hedged.push([hx, hy]);
      plant('hedge_box', hx, hy, 1.00 + R() * 0.14);
    }
  }
  /* THE EIGHT STONES, dealt so the plain slabs are common and the
     obelisk and the two crosses are not: a churchyard is mostly the
     same stone over and over with something taller every twentieth row,
     which is what makes the taller one worth looking at. */
  const STONE_ODDS = [0.20, 0.38, 0.54, 0.68, 0.80, 0.88, 0.95, 1.00];
  function stone(x, y) {
    const r = R();
    let v = 0; while (v < 7 && r > STONE_ODDS[v]) v++;
    mb.thing('GRAVESTONE', x, y, (R() - 0.5) * 0.3, { variant: v });
    out.stones++;
  }
  /* a light fitting the game is told about by hand, so the filter that
     drops the mall's gridded ones under low ceilings leaves it alone */
  function fitting(x, y) { mb.thing('LAMP', x, y, 0, { placed: true }); }

  /* ---- a street ---------------------------------------------------- */
  /* The carriageway is five strips, the same construction the ring road
     uses: a painted line cannot be part of a 64-unit tile across 384
     units of road, so it is a strip six wide wearing a tile that is line
     all the way through. See roadRun in js/maps/sellwrong.js. */
  const L = 6, H = 3;
  const road = (a, b, c, d, tex, n, extra = {}) => rm.add(a, b, c, d,
    open(n, { floorTex: tex, light: 0.30, ambient: 0.30, fuel: TOWN_FUEL.road, ...extra }));

  /**
   * A PARKING SHOULDER along one kerb. `[a0,a1]` is the run along
   * `along`, `[b0,b1]` the band across it, and the kerb is at the `kerb`
   * edge. A storm drain sits in the gutter near each end and every
   * LAMP_PITCH between, and the bays between the drains are the
   * texture's; a van stands in VAN_ODDS of them, its nose one way or the
   * other, as a slot for js/vehicles.js to park a van in at load.
   */
  function shoulderRun(a0, a1, b0, b1, along, tag, kerb) {
    const lay = (p0, p1, q0, q1, tex, n) => {
      if (p1 - p0 < 1 || q1 - q0 < 1) return;
      if (along === 'x') road(p0, q0, p1, q1, tex, n); else road(q0, p0, q1, p1, tex, n);
    };
    const bayTex = along === 'x' ? 'ASPHPARK' : 'ASPHPARV';
    const g0 = kerb === 'lo' ? b0 : b1 - DRAIN_D, g1 = kerb === 'lo' ? b0 + DRAIN_D : b1;   // the gutter band
    const drains = [a0 + 72, a1 - 72];
    for (let c = a0 + LAMP_PITCH / 2; c < a1 - LAMP_PITCH / 4; c += LAMP_PITCH) drains.push(c);
    drains.sort((p, q) => p - q);
    let u = a0;
    for (const c of drains) {
      const d0 = c - DRAIN_L / 2, d1 = c + DRAIN_L / 2;
      if (d0 < u) continue;
      lay(u, d0, b0, b1, bayTex, `parking, ${tag}`);
      lay(d0, d1, g0, g1, 'DRAIN', `storm drain, ${tag}`);
      out.drains++;
      lay(d0, d1, kerb === 'lo' ? g1 : b0, kerb === 'lo' ? b1 : g0, bayTex, `parking, ${tag}`);
      u = d1;
    }
    lay(u, a1, b0, b1, bayTex, `parking, ${tag}`);
    /* THE VANS. A bay is BAY long from the world origin, which is where
       the texture starts its lines, so a van at a bay's middle is
       between two of them. Not in a bay a drain shares, and not so
       close to the end of the run that its nose is in the junction. */
    const mid = (b0 + b1) / 2;
    for (let c = (Math.floor(a0 / BAY) + 1) * BAY + BAY / 2; c + BAY / 2 <= a1; c += BAY) {
      if (c - BAY / 2 < a0 + 8) continue;
      if (drains.some(d => Math.abs(d - c) < BAY / 2 + DRAIN_L / 2)) continue;
      if (R() >= VAN_ODDS) continue;
      const nose = R() < 0.5 ? 0 : Math.PI;
      const angle = along === 'x' ? nose : nose + Math.PI / 2;
      const [x, y] = along === 'x' ? [c, mid] : [mid, c];
      out.carSlots.push({ x, y: y + (R() - 0.5) * 4, angle: angle + (R() - 0.5) * 0.04, variant: Math.floor(R() * 5), street: true });
    }
  }

  /** The carriageway between two kerbs: a shoulder each side, the edge
   *  lines, two lanes and the centre line. */
  function carriage(x0, y0, x1, y1, along, tag) {
    if (along === 'x') {
      const m = (y0 + y1) / 2;
      shoulderRun(x0, x1, y0, y0 + PARK, 'x', tag, 'lo');
      road(x0, y0 + PARK, x1, y0 + PARK + L, 'ROADEDGE', `street edge, ${tag}`);
      road(x0, y0 + PARK + L, x1, m - H, 'ASPHOLD', `street, ${tag}`);
      road(x0, m - H, x1, m + H, 'ROADLINE', `street centre, ${tag}`);
      road(x0, m + H, x1, y1 - PARK - L, 'ASPHOLD', `street, ${tag}`);
      road(x0, y1 - PARK - L, x1, y1 - PARK, 'ROADEDGE', `street edge, ${tag}`);
      shoulderRun(x0, x1, y1 - PARK, y1, 'x', tag, 'hi');
    } else {
      const m = (x0 + x1) / 2;
      shoulderRun(y0, y1, x0, x0 + PARK, 'y', tag, 'lo');
      road(x0 + PARK, y0, x0 + PARK + L, y1, 'ROADEDGE', `street edge, ${tag}`);
      road(x0 + PARK + L, y0, m - H, y1, 'ASPHOLD', `street, ${tag}`);
      road(m - H, y0, m + H, y1, 'ROADLINV', `street centre, ${tag}`);
      road(m + H, y0, x1 - PARK - L, y1, 'ASPHOLD', `street, ${tag}`);
      road(x1 - PARK - L, y0, x1 - PARK, y1, 'ROADEDGE', `street edge, ${tag}`);
      shoulderRun(y0, y1, x1 - PARK, x1, 'y', tag, 'hi');
    }
  }

  /**
   * A sidewalk with its lamps on it. `[a0,a1]` is the run along `along`,
   * `[b0,b1]` the band across it, and the kerb is at the `kerb` edge
   * ('lo' is b0). Every LAMP_PITCH along it, offset by `phase` so the
   * two sides of a street alternate, there is a lamp at the kerb and a
   * pool of light on the concrete under it.
   */
  function walkRun(a0, a1, b0, b1, along, tag, phase, kerb) {
    const piece = (p0, p1, pool) => {
      if (p1 - p0 < 1) return;
      const props = pool
        ? walkProps(`sidewalk under a lamp, ${tag}`, { light: 0.66, ambient: 0.66, floorTex: 'LAMPPOOL', lampLit: true })
        : walkProps(`sidewalk, ${tag}`);
      if (along === 'x') rm.add(p0, b0, p1, b1, props); else rm.add(b0, p0, b1, p1, props);
    };
    let u = a0;
    for (let c = a0 + LAMP_PITCH / 4 + phase * LAMP_PITCH / 2; c + POOL <= a1; c += LAMP_PITCH) {
      if (c - POOL < u) continue;
      piece(u, c - POOL, false);
      piece(c - POOL, c + POOL, true);
      u = c + POOL;
      const k = kerb === 'lo' ? b0 + 16 : b1 - 16;
      /* the arm reaches over the kerb: across the walk, toward the road */
      const toRoad = kerb === 'lo' ? -1 : 1;
      if (along === 'x') lamp(c, k, toRoad * Math.PI / 2); else lamp(k, c, toRoad < 0 ? Math.PI : 0);
    }
    piece(u, a1, false);
  }

  /* STREET TREES, down the verge between the sidewalk and the kerb,
     which is where an American town plants them and is why the strip is
     called that. One every TREE_PITCH, off the pitch by a third of it
     so the two sides of a street do not line up and the street reads as
     an avenue rather than a corridor, and not within a lamp's pool or a
     storm drain's grate.

     THEY ARE PLANTED, NOT BUILT. A tree is a billboard in the wood's
     own arrays (see _plantTown in js/forest.js) and costs this map no
     sectors at all — which is the only reason a town can have eight
     hundred of them. */
  const TREE_PITCH = 512;
  function vergeTrees(a0, a1, b, along) {
    /* THE TOWN IS AT A NEGATIVE COORDINATE and JavaScript's % keeps the
       sign of the left operand, so `b % 3` on the west side of the map
       is -2 and the phase it makes is NEGATIVE — the run starts 341
       units before the verge does and the first tree of every street
       stands in the middle of the junction it was supposed to start
       after. Thirty of them, one per corner, and every one of them in
       the road. */
    const phase = ((((b | 0) % 3) + 3) % 3) * (TREE_PITCH / 3);
    for (let c = a0 + 160 + phase; c < a1 - 160; c += TREE_PITCH) {
      /* a lamp stands every LAMP_PITCH with a pool of light round it,
         and a tree in the pool is a tree in the lamp */
      if (Math.abs(((c - a0) % LAMP_PITCH) - LAMP_PITCH / 4) < POOL + 40) continue;
      const jit = (R() - 0.5) * 90;
      const [x, y] = along === 'x' ? [c + jit, b] : [b, c + jit];
      plant(broadleaf(), x, y, 0.82 + R() * 0.30);
    }
  }

  /** One run of street between two junctions, with its sidewalks. */
  function streetRun(sx0, sx1, y0, y1, along, tag, main = false) {
    const w = main ? MAIN_WALK : WALK;
    const v = main ? 0 : VERGE;
    if (along === 'x') {
      walkRun(sx0, sx1, y0, y0 + w, 'x', tag, 0, 'hi');
      if (v) { rm.add(sx0, y0 + w, sx1, y0 + w + v, vergeProps(`verge, ${tag}`)); vergeTrees(sx0, sx1, y0 + w + v / 2, 'x'); }
      carriage(sx0, y0 + w + v, sx1, y1 - w - v, 'x', tag);
      if (v) { rm.add(sx0, y1 - w - v, sx1, y1 - w, vergeProps(`verge, ${tag}`)); vergeTrees(sx0, sx1, y1 - w - v / 2, 'x'); }
      walkRun(sx0, sx1, y1 - w, y1, 'x', tag, 1, 'lo');
    } else {
      walkRun(y0, y1, sx0, sx0 + w, 'y', tag, 0, 'hi');
      if (v) { rm.add(sx0 + w, y0, sx0 + w + v, y1, vergeProps(`verge, ${tag}`)); vergeTrees(y0, y1, sx0 + w + v / 2, 'y'); }
      carriage(sx0 + w + v, y0, sx1 - w - v, y1, 'y', tag);
      if (v) { rm.add(sx1 - w - v, y0, sx1 - w, y1, vergeProps(`verge, ${tag}`)); vergeTrees(y0, y1, sx1 - w - v / 2, 'y'); }
      walkRun(y0, y1, sx1 - w, sx1, 'y', tag, 1, 'lo');
    }
  }

  /**
   * A junction: no centre line through it, the sidewalk corners, and a
   * lamp on each corner, which is where a town puts them.
   *
   * THE TWO WIDTHS ARE NOT THE SAME WIDTH. A corner is as deep as the
   * sidewalk of the street it belongs to, and where Main Street crosses
   * a residential one those are 336 and 168 — so a square corner of the
   * larger ate the whole 576 of the smaller and left the middle of the
   * junction with a negative width. The corner is a rectangle.
   */
  /**
   * A junction. `open` says which of its four mouths a street leaves
   * by; a mouth with no street is pavement across the whole width, so a
   * junction on the edge of the town is a T and one at its corner is a
   * BEND in the road. THE KERB GOES ROUND EVERY CORNER: a corner where
   * two mouths meet is a square of KERB_R with the quarter circle
   * pavement and the rest road, and the outside of a bend is the whole
   * middle of the junction with the quarter circle road and the rest
   * pavement — see AN ARC in js/maps/rectmap.js.
   */
  function junction(x0, y0, x1, y1, tag, mainAcross = false, open4 = { n: true, s: true, e: true, w: true }) {
    const wx = mainAcross ? MAIN_WALK : WALK + VERGE;   // down the column
    const wy = WALK + VERGE;                            // along the row
    const corner = walkProps(`corner, ${tag}`, { light: 0.58, ambient: 0.58 });
    const roadProps = open(`junction, ${tag}`, { floorTex: 'ASPHOLD', light: 0.30, ambient: 0.30, fuel: TOWN_FUEL.road });
    const B = 24;                                       // how deep a crossing bar is
    const R = KERB_R;
    const { n, s, e, w } = open4;
    /* A CORNER between two open mouths: the pavement in two rectangles
       and the arc square at its tip, whose disc is centred on the
       corner's own outer corner. `px,py` is the tip, `sx,sy` which way
       the pavement lies from it. */
    const roundCorner = (px, py, sx, sy, cw, ch) => {
      const ax = sx < 0 ? px - cw : px, ay = sy < 0 ? py - ch : py;          // the corner's bbox
      const bx = ax + cw, by = ay + ch;
      const qx0 = sx < 0 ? px - R : px, qx1 = qx0 + R;                     // the arc square
      const qy0 = sy < 0 ? py - R : py, qy1 = qy0 + R;
      /* the rest of the corner: the strip beside the square along the
         full depth, and the strip beyond the square along the tip's edge */
      if (sx < 0) rm.add(ax, ay, qx0, by, corner); else rm.add(qx1, ay, bx, by, corner);
      if (sy < 0) rm.add(qx0, ay, qx1, qy0, corner); else rm.add(qx0, qy1, qx1, by, corner);
      const centre = (sx < 0 ? 'W' : 'E'); const cn = (sy < 0 ? 'S' : 'N') + centre;
      rm.add(qx0, qy0, qx1, qy1, { ...corner, arc: { centre: cn, disc: corner, rest: roadProps } });
      /* the lamp, on the pavement inside the arc, its arm out over the
         junction — which is the way the pavement is not */
      const k = (R - 22) / Math.SQRT2;
      lamp(px + sx * (R - k), py + sy * (R - k), Math.atan2(-sy, -sx));
    };
    /* A PLAIN CORNER, where a closed side meets anything: pavement, with
       the lamp at the tip as before */
    const plainCorner = (px, py, sx, sy, cw, ch) => {
      rm.add(sx < 0 ? px - cw : px, sy < 0 ? py - ch : py, sx < 0 ? px : px + cw, sy < 0 ? py : py + ch, corner);
      lamp(px + sx * 20, py + sy * 20, Math.atan2(-sy, -sx));
    };
    const bend = (!s && !w) || (!s && !e) || (!n && !w) || (!n && !e);

    /* the four corners of the square */
    (s && w ? roundCorner : plainCorner)(x0 + wx, y0 + wy, -1, -1, wx, wy);
    (s && e ? roundCorner : plainCorner)(x1 - wx, y0 + wy, 1, -1, wx, wy);
    (n && w ? roundCorner : plainCorner)(x0 + wx, y1 - wy, -1, 1, wx, wy);
    (n && e ? roundCorner : plainCorner)(x1 - wx, y1 - wy, 1, 1, wx, wy);
    /* and a closed side is pavement between its two corners */
    if (!s) rm.add(x0 + wx, y0, x1 - wx, y0 + wy, corner);
    if (!n) rm.add(x0 + wx, y1 - wy, x1 - wx, y1, corner);
    if (!w) rm.add(x0, y0 + wy, x0 + wx, y1 - wy, corner);
    if (!e) rm.add(x1 - wx, y0 + wy, x1, y1 - wy, corner);

    /* the mouths, with the crossing bars painted across them */
    if (s) { road(x0 + wx, y0, x1 - wx, y0 + B, 'CROSSWLK', `crossing, ${tag}`); road(x0 + wx, y0 + B, x1 - wx, y0 + wy, 'ASPHOLD', `junction, ${tag}`); }
    if (n) { road(x0 + wx, y1 - B, x1 - wx, y1, 'CROSSWLK', `crossing, ${tag}`); road(x0 + wx, y1 - wy, x1 - wx, y1 - B, 'ASPHOLD', `junction, ${tag}`); }
    if (w) { road(x0, y0 + wy, x0 + B, y1 - wy, 'CROSSWLK', `crossing, ${tag}`); road(x0 + B, y0 + wy, x0 + wx, y1 - wy, 'ASPHOLD', `junction, ${tag}`); }
    if (e) { road(x1 - B, y0 + wy, x1, y1 - wy, 'CROSSWLK', `crossing, ${tag}`); road(x1 - wx, y0 + wy, x1 - B, y1 - wy, 'ASPHOLD', `junction, ${tag}`); }
    /* THE MIDDLE: plain road, or at a bend the arc square whose disc is
       centred on the corner the two open mouths share, road inside the
       arc and pavement outside it */
    const mx0 = x0 + wx, my0 = y0 + wy, mx1 = x1 - wx, my1 = y1 - wy;
    if (bend && mx1 - mx0 === my1 - my0) {
      const cn = (s ? 'S' : 'N') + (e ? 'E' : 'W');
      rm.add(mx0, my0, mx1, my1, { ...roadProps, arc: { centre: cn, disc: roadProps, rest: corner } });
      /* a lamp on the pavement outside the bend, at the arc's middle */
      const Ro = mx1 - mx0, k = (Ro + 22) / Math.SQRT2;
      /* its arm toward the corner the disc is centred on, which is where the road is */
      lamp((e ? mx1 : mx0) + (e ? -k : k), (s ? my0 : my1) + (s ? k : -k), Math.atan2(s ? -1 : 1, e ? 1 : -1));
      out.bends++;
    } else {
      road(mx0, my0, mx1, my1, 'ASPHOLD', `junction, ${tag}`);
    }
  }

  /* ---- the whole grid of them ------------------------------------- */
  for (let r = 0; r <= 5; r++) {
    for (let c = 0; c <= 5; c++) {
      /* the streets stop at the wood: a junction on the west, east or
         south edge has no mouth that way, so the perimeter street is a
         run of T's and the two south corners are bends. The north edge
         opens onto the supermarket's lot. */
      const open4 = { n: true, s: r < 5, e: c < 5, w: c > 0 };
      junction(G.sx[c][0], G.sy[r][0], G.sx[c][1], G.sy[r][1], `${r}${c}`, c === 3, open4);
      /* the run east of this junction */
      if (c < 5) streetRun(G.sx[c][1], G.sx[c + 1][0], G.sy[r][0], G.sy[r][1], 'x', `row ${r} west of ${c + 1}`);
      /* and the run south of it */
      if (r < 5) streetRun(G.sx[c][0], G.sx[c][1], G.sy[r + 1][1], G.sy[r][0], 'y', `col ${c} south of ${r}`, c === 3);
    }
  }

  /* =================================================================
     THE FACADE

     Everything with a wall is drawn in ITS OWN FRAME: u runs along a
     face from its left end, v runs OUT of the building from the face
     line, so the wall is at v in [-ZONE, 0], the building behind it at
     v < -ZONE, and the ground in front at v > 0. One set of numbers
     for a face whichever way it points, and `frame` turns it.

     WHAT A WALL IS MADE OF. A face is `facade()`: SOLID pieces between
     the openings — each a column of one storey, the roof, shut
     everywhere below it — and RECESSES at the openings, each a column
     of one open storey per window with its floor at the sill and its
     ceiling at the head. The disagreement rule in js/level.js then
     draws every band: from the ground in front, the wall is a lower
     band from the foundation to the eaves wearing the solid piece's
     lowerTex; where a recess is, the band stops at the sill, starts
     again at the head, and between them is a hole with a sill floor,
     a head ceiling, two jambs and a back wall that is one-sided and
     wears the pane. From the gable end, the roof storey's sloped
     ceiling over a shut storey is a triangle of gable board.

     WHAT STANDS IN FRONT OF IT. The foundation is a PLINTH: a strip
     eight deep at the foot of the wall with its floor at FOUND, so the
     wall's bottom thirty-two units are a separate band and wear block,
     and the wall proper starts at the plinth's top. At the door the
     plinth is a STOOP thirty-two deep, with a STEP half its height in
     front of that and a PATH out to the sidewalk. Two steps of sixteen
     up to a door at thirty-two, which is a porch.

     EVERYTHING THAT TOUCHES A WALL HAS ITS CEILING AT THE EAVES. The
     plinth, the stoop, the gable strips. It is the one rule that makes
     the gables draw: above the eaves the ground sector is shut and the
     roof storey is open, and that disagreement is the gable wall. A
     sky-ceilinged sector against the same wall would be open up to 768
     and draw a wall of brick from the ridge to the sky.
     ================================================================= */

  /** A frame for one face of a building. `facing` is which way the face
   *  looks: 'S' has u running +x and v running -y. */
  const frame = (X, Y, facing) => {
    const at = (u, v) => {
      switch (facing) {
        case 'S': return [X + u, Y - v];
        case 'N': return [X + u, Y + v];
        case 'E': return [X + v, Y + u];
        default:  return [X - v, Y + u];      // 'W'
      }
    };
    return {
      facing, at,
      add: (u0, v0, u1, v1, props) => {
        const [ax, ay] = at(u0, v0), [bx, by] = at(u1, v1);
        return rm.add(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), props);
      },
      /* the axis a ridge running ALONG this face runs along */
      axis: (facing === 'N' || facing === 'S') ? 'x' : 'y',
    };
  };

  /** The top of every column in a building `B`: its roof storey, or —
   *  for a tower with a spire drawn over it — a shut cap at the top of
   *  the wall. Both carry the wall's own skin as lowerTex, because the
   *  band below them IS the wall. */
  const topOf = B => B.slope
    ? { floor: B.eaves, ceil: B.eaves + B.rise, slopeCeil: B.slope,
        /* THE ROOF FROM UNDERNEATH. An attic is never seen from inside
           and wears no ceiling, which is why this has been 'NONE' since
           there were roofs. A church is the exception: its nave is open
           to the rafters, the sloped ceiling you are looking at from a
           pew IS this storey's, and the shingle on the other side of it
           is the same triangles wound the other way (see js/mapgeo.js).
           `soffit` is what that boarding is, and a building that does
           not name one keeps the attic it had. */
        floorTex: 'NONE', ceilTex: B.soffit || 'NONE', roofTex: B.roof, roofLight: ROOF_LIGHT,
        wallTex: B.wall, upperTex: B.jamb || B.wall, lowerTex: B.wall,
        light: B.soffit ? 0.30 : 0.16, ambient: B.soffit ? 0.30 : 0.16,
        fuel: 0, outdoor: false, sky: 0, name: `${B.tag} roof` }
    : { floor: B.top, ceil: B.top,
        floorTex: 'NONE', ceilTex: 'NONE',
        wallTex: B.wall, upperTex: B.jamb || B.wall, lowerTex: B.wall,
        light: 0.16, ambient: 0.16, fuel: 0, outdoor: false, sky: 0, name: `${B.tag} wall top` };

  /** A column inside a building: its storeys, and the roof on top. */
  const col = (B, storeys, common) => ({ ...common, storeys: [...storeys, topOf(B)] });

  /**
   * THE GROUND UNDER AN EAVE: a column of two. The ground itself, with
   * the soffit for a ceiling at the eaves; and over it the LIP, which
   * is the roof's edge — FASCIA_H of board thick, shingle on top, open
   * to the sky up to the ridge. The disagreement rule then draws, and
   * only draws, the right things: against the yard the lip is a shut
   * band eight tall between the ground's ceiling and its own floor,
   * and wears FASCIA; against the wall the same band is hidden over
   * the soffit; between the lip and the roof storey both columns are
   * open and nothing draws; above the ridge both are shut, and above
   * that the sky. A roof with no edge is a plane you are under, and
   * this is the edge. `ground` is any of the ground props — a plinth,
   * a stoop, a lawn, a forecourt.
   */
  const underEaves = (B, ground) => ({
    ...ground,
    storeys: [
      { ceil: B.eaves, ceilTex: 'EAVESOFT' },
      { floor: B.eaves + FASCIA_H, ceil: B.eaves + B.rise, floorTex: B.roof, ceilTex: 'SKY',
        lowerTex: 'FASCIA', upperTex: B.gable, wallTex: B.wall, light: ROOF_LIGHT, ambient: ROOF_LIGHT,
        outdoor: true, sky: 1, fuel: 0, name: `${B.tag} eaves` },
    ],
  });

  /** A solid piece of wall. */
  const solid = (B, F, u0, v0, u1, v1) =>
    (u1 - u0 > 0 && v1 - v0 > 0) && F.add(u0, v0, u1, v1, { storeys: [topOf(B)] });

  /* A RECESS is outdoors — it is a hole in an outside wall — so the
     interior LOD leaves it in the shell and the lamps do not try to
     light it. */
  const recess = { outdoor: true, sky: 1, fuel: 0 };

  /** A window column: one pane per storey in `ks`, each lit or not on
   *  its own, and the roof over them. */
  const windowCol = (B, ks, name) => {
    const st = ks.map(k => {
      const lit = R() < B.litChance;
      const sill = (B.winBase || 0) + k * STOREY + (B.sill ?? WIN_SILL);
      out.windows++;
      return {
        floor: sill, ceil: sill + WIN_H,
        wallTex: lit ? 'WINPANEL' : (R() < 0.6 ? 'WINPANED' : 'WINSHADE'),
        light: lit ? 0.92 : 0.30, ambient: lit ? 0.92 : 0.30, name: `${name} ${k}`,
      };
    });
    return col(B, st, { ...recess, floorTex: 'SILLWOOD', ceilTex: 'SILLWOOD', lowerTex: B.wall, upperTex: B.wall });
  };

  /** A door in a recess: painted, because there is nothing behind it. */
  const doorCol = (B, tex, name) => col(B,
    [{ floor: B.base, ceil: B.base + DOOR_H, wallTex: tex, light: 0.55, ambient: 0.55, name }],
    { ...recess, floorTex: 'CONCRETE', ceilTex: 'SILLWOOD', lowerTex: B.wall, upperTex: B.wall });

  /** A shopfront on the ground floor and flats over it. */
  const shopCol = (B, ks, name) => {
    const st = [{ floor: B.base, ceil: B.base + STOREY, wallTex: 'SHOPFRNT', light: 0.78, ambient: 0.78, name: `${name} shop` }];
    for (const k of ks) if (k > 0) {
      const lit = R() < B.litChance;
      const sill = B.base + k * STOREY + WIN_SILL;
      out.windows++;
      st.push({ floor: sill, ceil: sill + WIN_H, wallTex: lit ? 'WINPANEL' : 'WINPANED',
                light: lit ? 0.92 : 0.30, ambient: lit ? 0.92 : 0.30, name: `${name} ${k}` });
    }
    return col(B, st, { ...recess, floorTex: 'CONCRETE', ceilTex: 'SILLWOOD', lowerTex: B.wall, upperTex: B.wall });
  };

  /** A doorway you can walk through: the whole thickness of the wall,
   *  open from the floor to `h`, touching the room behind it. */
  const wayCol = (B, h, common, name) => col(B,
    [{ floor: B.base, ceil: B.base + h, name }], { ...common, upperTex: B.wall, lowerTex: B.wall });

  /**
   * One face of a building: solid wall between the openings, and the
   * openings themselves. `ops` is sorted along u; each is
   * `{ u0, u1, kind, col, depth }`.
   */
  function facade(B, F, len, ops) {
    let u = 0;
    for (const op of ops) {
      solid(B, F, u, -ZONE, op.u0, 0);
      F.add(op.u0, -(op.depth ?? NICHE), op.u1, 0, op.col);
      if (op.kind === 'door') out.doors++;
      u = op.u1;
    }
    solid(B, F, u, -ZONE, len, 0);
  }

  /* ---- the ground at the foot of a wall ---------------------------- */
  const plinthProps = B => open(`${B.tag} foundation`, {
    floor: FOUND, ceil: B.top, floorTex: 'CONCRETE', light: 0.30, ambient: 0.30,
    lowerTex: B.foundation || 'FOUNDATN', upperTex: B.gable, wallTex: B.wall, fuel: 0,
  });
  const stoopProps = B => open(`${B.tag} stoop`, {
    floor: FOUND, ceil: B.top, floorTex: 'CONCRETE', light: 0.52, ambient: 0.52,
    lowerTex: 'STEPFACE', upperTex: B.gable, fuel: 0,
  });
  const treadProps = B => open(`${B.tag} step`, {
    floor: FOUND / 2, floorTex: 'CONCRETE', light: 0.44, ambient: 0.44, lowerTex: 'STEPFACE', fuel: 0,
  });
  const pathProps = B => open(`${B.tag} path`, {
    floorTex: 'PAVERS', light: 0.42, ambient: 0.42, fuel: 0,
  });

  /**
   * The ground in front of one face, from the wall out to `yard`: the
   * plinth along the foot of the wall, and at the door a stoop, a step
   * and the path. `seg` is the [u0,u1] of wall this covers, `lot` the
   * [u0,u1] of ground it owns, `ext` how far the plinth runs past each
   * end of the segment (round the corner, at a building's ends).
   */
  function approach(B, F, seg, door, lot, yard, o = {}) {
    const [eL, eR] = o.ext || [0, 0];
    const G2 = o.ground || (n => lawn(`${B.tag} ${n}`));
    /* UNDER AN EAVE OR AT A GABLE END. This face is one or the other:
       under an eave everything within EAVE of the wall is a column of
       two with the soffit over it; at a gable end the plinth has its
       ceiling at the eaves and the gable draws over it. */
    const wrap = props => o.eave ? underEaves(B, props) : props;
    const a0 = seg[0] - eL, a1 = seg[1] + eR;           // the wall, round its corners
    const plinth = (a, b) => (b - a > 0) && F.add(a, 0, b, PLINTH, wrap(plinthProps(B)));
    /* the lot between u0 and u1 from the plinth out to the yard — under
       an eave the first stretch of it, along the wall, is under the
       soffit and the rest is not */
    const ground = (u0, u1) => {
      if (u1 - u0 <= 0 || yard <= PLINTH) return;
      if (!o.eave) { F.add(u0, PLINTH, u1, yard, G2('yard')); return; }
      const b0 = Math.max(u0, a0), b1 = Math.min(u1, a1);
      if (b0 > u0) F.add(u0, PLINTH, b0, EAVE, G2('yard'));
      if (b1 > b0) F.add(b0, PLINTH, b1, EAVE, wrap(G2('yard')));
      if (u1 > b1) F.add(b1, PLINTH, u1, EAVE, G2('yard'));
      if (yard > EAVE) F.add(u0, EAVE, u1, yard, G2('yard'));
    };
    if (!door) {
      plinth(a0, a1);
      ground(lot[0], lot[1]);
      return null;
    }
    const s0 = door.u0 - STOOP_WING, s1 = door.u1 + STOOP_WING;
    plinth(a0, s0); plinth(s1, a1);
    F.add(s0, 0, s1, STOOP_D, wrap(stoopProps(B)));
    F.add(s0, STOOP_D, s1, STOOP_D + TREAD_D, treadProps(B));
    if (yard > STOOP_D + TREAD_D) F.add(s0, STOOP_D + TREAD_D, s1, yard, o.path ? pathProps(B) : G2('yard'));
    ground(lot[0], s0); ground(s1, lot[1]);
    return { s0, s1 };
  }

  /** What a building is, for the functions above. `d` is its depth from
   *  this face to the back one. The ridge runs along the face unless
   *  `extra.ridge` is 'across', which is a house whose gable faces the
   *  street; `extra.pitch` is rise over half-span and sets the rise
   *  from the span, or `extra.rise` gives it outright. */
  function building(tag, F, w, d, n, dress, extra = {}) {
    const across = extra.ridge === 'across';
    const half = across ? w / 2 : d / 2;
    const rise = extra.rise ?? (extra.pitch ? Math.round(half * extra.pitch / 8) * 8 : RIDGE);
    const B = {
      tag, wall: dress.wall, gable: dress.gable, roof: dress.roof, jamb: extra.jamb,
      foundation: extra.foundation, n, base: FOUND, winBase: 0, litChance: 0.22,
      eaves: (extra.base ?? 0) + n * STOREY, ...extra, rise, across,
    };
    const [mx, my] = F.at(w / 2, -d / 2);
    const axis = across ? (F.axis === 'x' ? 'y' : 'x') : F.axis;
    B.slope = gableSlope(axis, axis === 'x' ? my : mx, half, B.eaves, B.rise);
    B.top = B.eaves;
    return B;
  }

  /* =================================================================
     A HOUSE — a shell, two facades, and a yard round it

     Two floor plans and four dressings, not a hundred and twenty
     hand-drawn houses. It is a street: they are SUPPOSED to be the same
     house eight times, and the eye reads the roofline, the paint and
     which windows have a light on.
     ================================================================= */

  /** The openings of a detached house's front and back. */
  const DETACHED = {
    front: (B, ks, door) => [
      { u0: 48, u1: 112, kind: 'window', col: windowCol(B, ks, `${B.tag} front window`) },
      { u0: 192, u1: 240, kind: 'door', col: doorCol(B, door, `${B.tag} front door`) },
      { u0: 304, u1: 368, kind: 'window', col: windowCol(B, ks, `${B.tag} front window`) },
    ],
    back: (B, ks, door) => [
      { u0: 64, u1: 128, kind: 'window', col: windowCol(B, ks, `${B.tag} back window`) },
      { u0: 192, u1: 240, kind: 'door', col: doorCol(B, door, `${B.tag} back door`) },
      { u0: 320, u1: 384, kind: 'window', col: windowCol(B, ks, `${B.tag} back window`) },
    ],
  };

  /**
   * One detached house on its lot.
   *
   * @param hx0,faceY  the left end of the front face and where it is
   * @param facing     which way the front looks
   * @param lot        [u0,u1] of the lot in the house's own frame
   * @param fy,by      how deep the front yard and the back yard are
   */
  function house(hx0, faceY, facing, w, d, n, dress, tag, lot, fy, by) {
    const F = frame(hx0, faceY, facing);
    /* WHICH WAY THE RIDGE RUNS. Half the houses have their gable to the
       street — a triangle of board over the front door, which is the
       one shape that says HOUSE from the pavement — and half run their
       ridge along it, with the eave over the door and the long slope
       showing from across the road. Both are the town; a street of
       only one is a barracks. */
    const across = R() < 0.5;
    const B = building(tag, F, w, d, n, dress,
                       { ridge: across ? 'across' : 'along', pitch: across ? PITCH_FRONT : PITCH_SIDE });
    const ks = Array.from({ length: n }, (_, k) => k);
    const backFacing = { N: 'S', S: 'N', E: 'W', W: 'E' }[facing];
    const K = frame(...F.at(0, -d), backFacing);
    const door = dress.doors[Math.floor(R() * dress.doors.length)];

    /* THE SHELL: one column of one storey, the roof, over the footprint
       between the two facades. Shut everywhere below the eaves, which is
       what makes it a house you cannot walk into. */
    F.add(0, -d + ZONE, w, -ZONE, { storeys: [topOf(B)] });
    const front = DETACHED.front(B, ks, door);
    facade(B, F, w, front);
    const fr = approach(B, F, [0, w], front.find(x => x.kind === 'door'), lot, fy,
                        { path: true, ext: [PLINTH, PLINTH], eave: !across });
    const back = DETACHED.back(B, ks, door);
    facade(B, K, w, back);
    const bk = approach(B, K, [0, w], back.find(x => x.kind === 'door'), lot, by,
                        { ext: [PLINTH, PLINTH], eave: !across });
    /* THE SIDES, with the foundation running along them and the side
       yards outside that. Under the eaves of a house whose gable faces
       the street, they are the strip under the soffit and then the
       yard; on a house whose ridge runs along it they are its gable
       ends, and the plinth's ceiling at the eaves is what draws them. */
    const side = lawn(`${tag} side yard`);
    /* a lot is thirty-two wider than its house each side, which is
       exactly the eave, so the yard beyond the strip can be nothing */
    const lay = (u0, v0, u1, v1, props) => (u1 - u0 > 0 && v1 - v0 > 0) && F.add(u0, v0, u1, v1, props);
    if (across) {
      F.add(-PLINTH, -d, 0, 0, underEaves(B, plinthProps(B)));
      F.add(w, -d, w + PLINTH, 0, underEaves(B, plinthProps(B)));
      F.add(-EAVE, -d, -PLINTH, 0, underEaves(B, side));
      F.add(w + PLINTH, -d, w + EAVE, 0, underEaves(B, side));
      lay(lot[0], -d - PLINTH, -EAVE, PLINTH, side);
      lay(w + EAVE, -d - PLINTH, lot[1], PLINTH, side);
      /* the corners of the strip, past the ends of the side walls */
      lay(-EAVE, -d - PLINTH, -PLINTH, -d, side); lay(-EAVE, 0, -PLINTH, PLINTH, side);
      lay(w + PLINTH, -d - PLINTH, w + EAVE, -d, side); lay(w + PLINTH, 0, w + EAVE, PLINTH, side);
    } else {
      F.add(-PLINTH, -d, 0, 0, plinthProps(B));
      F.add(w, -d, w + PLINTH, 0, plinthProps(B));
      F.add(lot[0], -d - PLINTH, -PLINTH, PLINTH, side);
      F.add(w + PLINTH, -d - PLINTH, lot[1], PLINTH, side);
    }

    /* THE LANDSCAPING: a tree in the front yard as often as not, shrubs
       along the foundation between the windows, and a tree or two out
       the back. Sprites, planted by js/forest.js, which is why a house
       has no rectangle for any of it. */
    if (R() < 0.55) {
      const left = R() < 0.5;
      const u = left ? lot[0] + 48 + R() * (fr.s0 - lot[0] - 96) : fr.s1 + 48 + R() * (lot[1] - fr.s1 - 96);
      plant(R() < 0.5 ? 'fir_young' : 'fir_medium', ...F.at(u, 48 + R() * (fy - 96)), 0.9 + R() * 0.25);
    }
    for (const u of [24, 150, 272, 424]) if (R() < 0.7)
      plant(R() < 0.5 ? 'bush_small_1' : 'bush_small_2', ...F.at(u + (R() - 0.5) * 12, 20), 0.7 + R() * 0.35);
    if (R() < 0.7) plant(R() < 0.5 ? 'fir_medium' : 'fir_tall_1', ...K.at(lot[0] + 60 + R() * (bk.s0 - lot[0] - 120), 64 + R() * (by - 128)), 0.85 + R() * 0.3);
    if (R() < 0.5) plant('fir_medium', ...K.at(bk.s1 + 60 + R() * (lot[1] - bk.s1 - 120), 64 + R() * (by - 128)), 0.85 + R() * 0.3);

    out.houses.push({ tag, n, w, d });
    return B;
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
        const dress = DRESS[Math.floor(R() * DRESS.length)];
        const n = R() < 0.25 ? 3 : 2;
        const hx = lx + (LOT_W - HOUSE_W) / 2;
        const faceY = north ? y1 - FRONT_YARD : y0 + FRONT_YARD;
        house(hx, faceY, north ? 'N' : 'S', HOUSE_W, HOUSE_D, n, dress, `${tag} no ${i + 1 + face * lots}`,
              [lx - hx, lx + LOT_W - hx], FRONT_YARD, FACE - FRONT_YARD - HOUSE_D);
      }
    }
  }

  /* =================================================================
     A TERRACE — sixteen to a face under ONE roof, which is what a
     terrace is: one shell, one ridge, sixteen front doors. Three storeys
     on the north side and two on the south, and on Main Street a
     shopfront under the flats.
     ================================================================= */
  function terrace(tx0, faceC, facing, count, n, dress, tag, fy, by, shops) {
    const w = count * ROW_W, d = HOUSE_D;
    const F = frame(...(facing === 'N' || facing === 'S' ? [tx0, faceC] : [faceC, tx0]), facing);
    const B = building(tag, F, w, d, n, dress,
                       shops ? { base: KERB_H, winBase: KERB_H, litChance: 0.3, pitch: PITCH_ROW } : { litChance: 0.3, pitch: PITCH_ROW });
    const ks = Array.from({ length: n }, (_, k) => k);
    const backFacing = { N: 'S', S: 'N', E: 'W', W: 'E' }[facing];
    const K = frame(...F.at(0, -d), backFacing);

    F.add(0, -d + ZONE, w, -ZONE, { storeys: [topOf(B)] });
    const front = [], back = [], doors = [];
    for (let i = 0; i < count; i++) {
      const u = i * ROW_W, hTag = `${tag} no ${i + 1}`;
      const door = dress.doors[Math.floor(R() * dress.doors.length)];
      if (shops) {
        front.push({ u0: u + 8, u1: u + 56, kind: 'door', col: doorCol(B, 'FRNTDOR3', `${hTag} door`) });
        front.push({ u0: u + 64, u1: u + 128, kind: 'window', col: shopCol(B, ks, `${hTag} window`) });
        back.push({ u0: u + 56, u1: u + 120, kind: 'window', col: windowCol(B, ks.slice(1), `${hTag} back window`) });
      } else {
        front.push({ u0: u + 16, u1: u + 64, kind: 'door', col: doorCol(B, door, `${hTag} door`) });
        front.push({ u0: u + 96, u1: u + 160, kind: 'window', col: windowCol(B, ks, `${hTag} window`) });
        back.push({ u0: u + 56, u1: u + 120, kind: 'window', col: windowCol(B, ks, `${hTag} back window`) });
      }
      doors.push(front[front.length - 2]);
      out.houses.push({ tag: hTag, n, w: ROW_W, d });
    }
    facade(B, F, w, front);
    facade(B, K, w, back);

    if (shops) {
      /* a shop stands on the sidewalk: no foundation, no stoop, a
         forecourt of concrete level with Main Street's own pavement */
      const fore = open(`${tag} forecourt`, { floor: KERB_H, floorTex: 'SIDEWALK',
        light: 0.56, ambient: 0.56, lowerTex: 'KERBSTON', upperTex: B.gable, fuel: TOWN_FUEL.walk });
      F.add(0, 0, w, EAVE, underEaves(B, fore));
      F.add(0, EAVE, w, fy, fore);
      F.add(-ROW_END, 0, 0, fy, open(`${tag} forecourt`, { floor: KERB_H, floorTex: 'SIDEWALK', light: 0.50, ambient: 0.50, fuel: 0 }));
      F.add(w, 0, w + ROW_END, fy, open(`${tag} forecourt`, { floor: KERB_H, floorTex: 'SIDEWALK', light: 0.50, ambient: 0.50, fuel: 0 }));
      /* the alleys down the ends, and the yards out the back */
      F.add(-ROW_END, -d - PLINTH, -PLINTH, 0, lawn(`${tag} alley`, { floorTex: 'ASPHOLD', light: 0.24, ambient: 0.24, fuel: 0 }));
      F.add(w + PLINTH, -d - PLINTH, w + ROW_END, 0, lawn(`${tag} alley`, { floorTex: 'ASPHOLD', light: 0.24, ambient: 0.24, fuel: 0 }));
    } else {
      for (let i = 0; i < count; i++) {
        const u = i * ROW_W;
        const a = approach(B, F, [u, u + ROW_W], doors[i], [u, u + ROW_W], fy,
                           { path: true, ext: [i === 0 ? PLINTH : 0, i === count - 1 ? PLINTH : 0], eave: true });
        if (R() < 0.6) plant(R() < 0.5 ? 'bush_small_1' : 'bush_large_2', ...F.at(u + 128 + (R() - 0.5) * 24, 28 + R() * 20), 0.7 + R() * 0.3);
        if (R() < 0.25) plant('fir_young', ...F.at(u + 118 + (R() - 0.5) * 40, fy - 44 - R() * 24), 0.8 + R() * 0.3);
        void a;
      }
      F.add(-ROW_END, PLINTH, 0, fy, lawn(`${tag} end garden`));
      F.add(w, PLINTH, w + ROW_END, fy, lawn(`${tag} end garden`));
      F.add(-ROW_END, -d - PLINTH, -PLINTH, PLINTH, lawn(`${tag} end garden`));
      F.add(w + PLINTH, -d - PLINTH, w + ROW_END, PLINTH, lawn(`${tag} end garden`));
    }
    /* the back: one foundation strip under the eave, one yard, and the ends */
    approach(B, K, [0, w], null, [0, w], by, { ext: [PLINTH, PLINTH], eave: true });
    K.add(-ROW_END, PLINTH, 0, by, lawn(`${tag} end garden`));
    K.add(w, PLINTH, w + ROW_END, by, lawn(`${tag} end garden`));
    for (let i = 0; i < count; i++) if (R() < 0.45)
      plant(['fir_medium', 'fir_tall_1', 'fir_tall_2'][Math.floor(R() * 3)], ...K.at(i * ROW_W + 88 + (R() - 0.5) * 80, 80 + R() * (by - 160)), 0.85 + R() * 0.3);
    /* the gable ends, with the foundation along them */
    F.add(-PLINTH, -d, 0, 0, plinthProps(B));
    F.add(w, -d, w + PLINTH, 0, plinthProps(B));
    return B;
  }

  /** Two terraces back to back across a block, facing its north and
   *  south streets — or, for the two civic blocks on Main Street, its
   *  east and west ones, with the shops on the Main Street side. */
  function rowsBlock(bx, by, tag, mainSide = null) {
    const [x0, x1] = bx, [y0, y1] = by;
    const count = (BLOCK - 2 * ROW_END) / ROW_W;      // 16
    for (let face = 0; face < 2; face++) {
      let facing, faceC, t0;
      if (mainSide === null) {
        facing = face === 0 ? 'N' : 'S';
        t0 = x0 + ROW_END;
      } else {
        facing = face === 0 ? 'E' : 'W';
        t0 = y0 + ROW_END;
      }
      const shops = mainSide !== null && facing === mainSide;
      const fy = shops ? SHOP_YARD : ROW_YARD;
      switch (facing) {
        case 'N': faceC = y1 - fy; break;
        case 'S': faceC = y0 + fy; break;
        case 'E': faceC = x1 - fy; break;
        default:  faceC = x0 + fy; break;
      }
      const n = shops ? 3 : (face === 0 ? 3 : 2);
      const dress = DRESS[face === 0 ? 0 : 3];
      terrace(t0, faceC, facing, count, n, dress, `${tag} ${facing} terrace`, fy, FACE - fy - HOUSE_D, shops);
    }
  }

  /* =================================================================
     THE SCHOOL — a double-loaded corridor with six classrooms, a lobby
     and an office at the west end, a gym two storeys tall in ONE span
     at the east, and TWO STAIRS, which the first cut did not have and
     which is why nobody could get upstairs and the fire could only get
     there through the ceiling.

     The stairs run ALONG the corridor, open to it down their whole
     length: tread 0 is level with the ground floor and tread 6 is
     sixteen under the first, so you walk up one from the corridor and
     off the top onto the corridor above. That open side is also the
     air the two storeys share, which is what the fire climbs.
     ================================================================= */
  function school(bx, by, tag) {
    const [x0, x1] = bx, [y0, y1] = by;
    const W = BLOCK - 2 * 128, D = 976;
    const sx0 = x0 + 128, sy0 = y0 + (y1 - y0 - D) / 2;
    const FY = sy0 - y0;                                // the front lawn, to the sidewalk
    const F = frame(sx0, sy0, 'S');
    const K = frame(sx0, sy0 + D, 'N');
    const B = building(tag, F, W, D, 2, { wall: 'SCHOOLBR', gable: 'SCHOOLBR', roof: 'ROOFSEAM' },
                       { base: FOUND, winBase: FOUND, sill: 24, litChance: 0.45, jamb: 'SCHOOLBR' });
    const Bz = FOUND;                                    // the floor
    /* `I` lays a rect by its distance IN from the front face, which is
       how a floor plan is written */
    const I = (u0, d0, u1, d1, props) => F.add(u0, -d1, u1, -d0, props);

    const room = (fuel, extra = {}) => ({
      light: 0.30, ambient: 0.30, ceilTex: 'CEILTILE', wallTex: 'PLASTER',
      upperTex: 'PLASTER', lowerTex: 'SKIRTING', fuel, ...extra,
    });
    const two = (floorTex, fuel, name, extra = {}) => col(B,
      [{ floor: Bz, ceil: Bz + CLEAR, name }, { floor: Bz + STOREY, ceil: Bz + STOREY + CLEAR, name: `${name} upstairs` }],
      room(fuel, { floorTex, ...extra }));
    const door2 = name => col(B,
      [{ floor: Bz, ceil: Bz + 80 }, { floor: Bz + STOREY, ceil: Bz + STOREY + 80 }],
      room(TOWN_FUEL.hallway, { floorTex: 'KITCHTIL', name }));

    /* the walls down the two short sides, which have no windows */
    solid(B, F, 0, -D + ZONE, ZONE, -ZONE);
    solid(B, F, W - ZONE, -D + ZONE, W, -ZONE);

    /* THE LOBBY AND THE PASSAGE. There was a stair here, running along
       the corridor and open to it down its whole length — seven treads
       up from the lobby end with a balustrade on all but the first and
       the last. IT IS GONE, at the user's request, and so is the one at
       the east end and the switchback in the church.

       WHAT THAT COSTS IS WRITTEN DOWN RATHER THAN QUIETLY LOST: the
       first floor of the school and the choir loft over the narthex are
       still built, still lit and still furnished, and there is now no
       way to walk to any of them. The fire's route changed with them —
       a stairwell is a chimney and the fire went up one readily (see
       js/fire.js), and what is left is the slower climb through a
       ceiling. The floor the stair stood on is plain hallway now, which
       is what leaves the lobby opening straight onto the corridor. */
    I(24, 24, 328, 376, two('KITCHTIL', TOWN_FUEL.hallway, `${tag} lobby`));
    I(264, 376, 328, 424, two('KITCHTIL', TOWN_FUEL.hallway, `${tag} passage`));
    I(24, 376, 264, 424, two('KITCHTIL', TOWN_FUEL.hallway, `${tag} passage`));
    /* THE CORRIDOR, with the lockers down both sides of it. A locker
       bank is a strip sixteen deep and sixty-four tall you cannot walk
       through, broken at every door. */
    I(24, 440, 1576, 536, two('KITCHTIL', TOWN_FUEL.hallway, `${tag} corridor`, { lowerTex: 'SKIRTING' }));
    const lockers = (u0, u1, d0) => (u1 > u0) && I(u0, d0, u1, d0 + 16, col(B,
      [{ floor: Bz + 64, ceil: Bz + CLEAR }, { floor: Bz + STOREY + 64, ceil: Bz + STOREY + CLEAR }],
      room(TOWN_FUEL.hallway, { floorTex: 'PLASTER', lowerTex: 'LOCKERS', name: `${tag} lockers` })));
    const strip = (u0, u1, d0) => (u1 > u0) && I(u0, d0, u1, d0 + 16, two('KITCHTIL', TOWN_FUEL.hallway, `${tag} corridor`));
    /* the south side: open where the stair and the passage are */
    strip(24, 344, 424);
    /* the north side: the office door, then the classrooms */
    lockers(24, 136, 536); strip(136, 200, 536); lockers(200, 344, 536);

    /* SIX CLASSROOMS, three a side, each with its desks in rows, its
       blackboard let into the west wall, and three windows in the
       outside wall you can see in through. */
    const CW = 400, CD = 384;
    const classroom = (u0, d0, d1, k, side) => {
      const name = `${tag} classroom ${side}${k + 1}`;
      const desks = [56, 144, 232, 320], rows = [96, 192, 288];
      const cls = (a, b, c, e) => I(u0 + a, d0 + (side === 'S' ? b : (d1 - d0) - e), u0 + c, d0 + (side === 'S' ? e : (d1 - d0) - b),
        two('FLOORBRD', TOWN_FUEL.class, name));
      const depth = d1 - d0;
      /* the floor, in strips between the rows of desks */
      let dd = 0;
      for (const r of rows) { cls(0, dd, CW, r); dd = r + 24; }
      cls(0, dd, CW, depth);
      for (const r of rows) {
        let uu = 0;
        for (const dx of desks) {
          cls(uu, r, dx, r + 24);
          I(u0 + dx, d0 + (side === 'S' ? r : depth - r - 24), u0 + dx + 32, d0 + (side === 'S' ? r + 24 : depth - r), col(B,
            [{ floor: Bz + 24, ceil: Bz + CLEAR }, { floor: Bz + STOREY + 24, ceil: Bz + STOREY + CLEAR }],
            room(TOWN_FUEL.class, { floorTex: 'DESKTOP', lowerTex: 'DESKFRNT', name: `${name} desk` })));
          uu = dx + 32;
        }
        cls(uu, r, CW, r + 24);
      }
      /* the blackboard, let eight units into the west wall */
      I(u0 - 8, d0 + 64, u0, d0 + 320, col(B,
        [{ floor: Bz + 32, ceil: Bz + 96, wallTex: 'BLACKBRD' }, { floor: Bz + STOREY + 32, ceil: Bz + STOREY + 96, wallTex: 'BLACKBRD' }],
        room(0, { floorTex: 'PLASTER', name: `${name} blackboard` })));
      fitting(...F.at(u0 + CW / 2, -(d0 + depth / 2)));
    };
    for (let k = 0; k < 3; k++) {
      const u0 = 344 + 416 * k;
      classroom(u0, 24, 408, k, 'S');
      I(u0 + 168, 408, u0 + 232, 424, door2(`${tag} classroom door`));
      lockers(u0, u0 + 168, 424); strip(u0 + 168, u0 + 232, 424); lockers(u0 + 232, Math.min(u0 + 416, 1576), 424);
      if (k < 2) {
        classroom(u0, 568, 952, k, 'N');
        I(u0 + 168, 552, u0 + 232, 568, door2(`${tag} classroom door`));
        lockers(u0, u0 + 168, 536); strip(u0 + 168, u0 + 232, 536); lockers(u0 + 232, u0 + 416, 536);
      } else {
        /* the last one on the north side sat behind the east stair and
           reached the corridor past it; with the stair gone the run of
           wall it stood against is lockers like the rest */
        classroom(u0, 600, 952, k, 'N');
        I(u0 + 24, 552, u0 + 88, 600, door2(`${tag} classroom door`));
        lockers(u0, u0 + 24, 536); strip(u0 + 24, u0 + 88, 536); lockers(u0 + 88, u0 + 400, 536);
      }
    }
    /* THE OFFICE, over the road from the lobby */
    I(24, 568, 328, 952, two('CARPETDM', TOWN_FUEL.office, `${tag} office`));
    I(136, 552, 200, 568, door2(`${tag} office door`));
    fitting(...F.at(176, -760)); fitting(...F.at(176, -200));

    /* THE GYM: two storeys tall in one span, and the whole argument for
       the column over a fixed stack of floors. */
    /* WHAT IS IN IT, because a room two storeys tall and a hundred and
       twenty feet long with nothing in it is not a gym, it is a hangar:
       a maple floor with a court painted on it, PADDING round the foot
       of the walls, three ROOF TRUSSES across it — masked, so the dark
       of the roof shows through the web — BLEACHERS down the far side
       in three tiers you can climb, and a STAGE at the east end, which
       is where the assembly is. Every one of them is a raised floor or
       a band, which is every trick this map has. */
    const gymRoom = (n, extra = {}) => room(TOWN_FUEL.gym, { floorTex: 'GYMFLOOR', ceilTex: 'PLASTER', light: 0.34, ambient: 0.34, name: `${tag} ${n}`, ...extra });
    const court = n => col(B, [{ floor: Bz, ceil: Bz + 2 * STOREY }], gymRoom(n));
    const raised = (n, up, low) => col(B, [{ floor: Bz + up, ceil: Bz + 2 * STOREY }], gymRoom(n, { lowerTex: low, floorTex: 'BLEACHER' }));
    const pad = n => col(B, [{ floor: Bz + 64, ceil: Bz + 2 * STOREY }], gymRoom(n, { lowerTex: 'GYMPAD', floorTex: 'PLASTER' }));
    const truss = n => col(B, [{ floor: Bz, ceil: Bz + 2 * STOREY - 56 },
                               { floor: Bz + 2 * STOREY - 24, ceil: Bz + 2 * STOREY }],
      gymRoom(n, { lowerTex: 'GYMTRUSS', ceilTex: 'GYMTRUSS', floorTex: 'GYMTRUSS' }));
    I(1592, 24, 2792, 32, pad('gym padding'));
    I(1592, 944, 2792, 952, pad('gym padding'));
    I(1592, 32, 1600, 456, pad('gym padding'));
    I(1592, 456, 1600, 520, court('gym'));
    I(1592, 520, 1600, 944, pad('gym padding'));
    I(2632, 32, 2792, 944, raised('gym stage', 48, 'PEWFRONT'));
    {
      const BANDS = [[168, court], [24, truss], [168, court], [24, truss], [168, court], [24, truss], [144, court],
                     [64, d => raised(d, 24, 'BLEACHER')], [64, d => raised(d, 48, 'BLEACHER')], [64, d => raised(d, 72, 'BLEACHER')]];
      let d = 32;
      for (const [h, mk] of BANDS) { I(1600, d, 2632, d + h, mk(mk === court ? 'gym' : mk === truss ? 'gym truss' : 'gym bleachers')); d += h; }
    }
    for (const [gu, gd] of [[1700, 500], [2300, 500], [2700, 200], [2700, 760]]) fitting(...F.at(gu, -gd));
    I(1576, 456, 1592, 520, col(B, [{ floor: Bz, ceil: Bz + CLEAR }], room(TOWN_FUEL.hallway, { floorTex: 'KITCHTIL', name: `${tag} gym doors` })));
    for (const [gu, gd] of [[1892, 260], [2492, 260], [1892, 716], [2492, 716]]) fitting(...F.at(gu, -gd));
    for (let u = 152; u < 1576; u += 256) fitting(...F.at(u, -488));

    /* THE OUTSIDE: windows into the lobby, every classroom and the gym,
       inset the thickness of the wall with the pane at the back — a
       recess sixteen deep on the outside and one eight deep inside it,
       touching the room, and the glass hung on the line between them
       once the lines exist. See `glass` and js/maps/sellwrong.js. */
    const win = (Fx, u0, k0, k1, name) => {
      const outer = Fx.add(u0, -NICHE, u0 + WIN_W, 0, col(B,
        Array.from({ length: k1 - k0 + 1 }, (_, i) => ({ floor: FOUND + (k0 + i) * STOREY + 24, ceil: FOUND + (k0 + i) * STOREY + 88, name: `${name} ${k0 + i}` })),
        { ...recess, floorTex: 'SILLWOOD', ceilTex: 'SILLWOOD', wallTex: 'SCHOOLBR', lowerTex: 'SCHOOLBR', upperTex: 'SCHOOLBR' }));
      const lit = R() < B.litChance;
      const inner = Fx.add(u0, -ZONE, u0 + WIN_W, -NICHE, col(B,
        Array.from({ length: k1 - k0 + 1 }, (_, i) => ({ floor: FOUND + (k0 + i) * STOREY + 24, ceil: FOUND + (k0 + i) * STOREY + 88, name: `${name} ${k0 + i} inside` })),
        { ...recess, light: lit ? 0.9 : 0.3, ambient: lit ? 0.9 : 0.3, floorTex: 'SILLWOOD', ceilTex: 'PLASTER', wallTex: 'PLASTER', lowerTex: 'PLASTER', upperTex: 'PLASTER' }));
      out.glass.push({ inner, outer, tex: lit ? 'SCHWINLT' : 'SCHWINDK' });
      out.windows += k1 - k0 + 1;
      return { u0, u1: u0 + WIN_W, kind: 'window', window: [outer, inner] };
    };
    const face = (Fx, rooms) => {
      const ops = [];
      for (const [u0, k0, k1] of rooms) ops.push(win(Fx, u0, k0, k1, `${tag} window`));
      /* the solid pieces between them, which facade() would lay if the
         recesses were not already down */
      let u = 0;
      for (const op of ops) { solid(B, Fx, u, -ZONE, op.u0, 0); u = op.u1; }
      solid(B, Fx, u, -ZONE, W, 0);
    };
    const southRooms = [[40, 0, 1], [248, 0, 1]];
    const northRooms = [[40, 0, 1], [136, 0, 1], [248, 0, 1]];
    for (let k = 0; k < 3; k++) for (const off of [40, 168, 296]) {
      southRooms.push([344 + 416 * k + off, 0, 1]);
      northRooms.push([344 + 416 * k + off, 0, 1]);
    }
    for (let j = 0; j < 6; j++) { southRooms.push([1688 + 176 * j, 1, 1]); northRooms.push([1688 + 176 * j, 1, 1]); }
    /* the front door goes in with the windows, so the piece-laying
       leaves its slot */
    const DOOR0 = 128, DOOR1 = 224;
    southRooms.push([DOOR0, -1, -1]);
    southRooms.sort((a, b) => a[0] - b[0]);
    {
      const ops = [];
      for (const [u0, k0, k1] of southRooms) {
        if (k0 < 0) {
          /* A PAIR OF DOORS AND THE GAP BETWEEN THEM. The middle
             forty-eight is a way you walk through; the leaf each side
             of it is a SHUT STOREY eighty tall wearing the steel, which
             is what a school's front doors look like when one of them
             is propped and the other never is. */
          for (const [lu0, lu1] of [[DOOR0, DOOR0 + 24], [DOOR1 - 24, DOOR1]])
            F.add(lu0, -ZONE, lu1, 0, { storeys: [
              { floor: B.base + DOOR_H, ceil: B.base + DOOR_H, lowerTex: 'SCHDOOR', upperTex: B.wall,
                wallTex: 'SCHDOOR', floorTex: 'NONE', ceilTex: 'NONE', name: `${tag} door leaf` }, topOf(B)] });
          F.add(DOOR0 + 24, -ZONE, DOOR1 - 24, 0, wayCol(B, CLEAR, room(TOWN_FUEL.hallway, { floorTex: 'KITCHTIL', light: 0.5, ambient: 0.5 }), `${tag} front door`));
          out.doors++;
          ops.push({ u0: DOOR0, u1: DOOR1 });
          continue;
        }
        ops.push(win(F, u0, k0, k1, `${tag} window`));
      }
      let u = 0;
      for (const op of ops) { solid(B, F, u, -ZONE, op.u0, 0); u = op.u1; }
      solid(B, F, u, -ZONE, W, 0);
    }
    face(K, northRooms);

    /* ---- THE ELEVATIONS, IN COURSES ---------------------------------
       The building was a slab of brick two hundred and eighty feet long
       with holes in it. What it has now is what every school built in
       this decade has, and all of it is BANDS — see THE TRIM in
       js/textures.js — got out of exactly two kinds of rectangle:

         THE TRIM STRIP, eight past the plinth and sixteen past the
           wall, whose column is open, shut for sixteen, open, shut for
           twenty-four, and shut. Three bands out of one strip: the
           STONE WATER TABLE it stands on, the STRING COURSE at first-
           floor level, and the CORNICE where it stops. A strip is one
           rectangle and it does the work of three.
         THE PILASTER, sixteen past the wall and solid from the ground
           to the eaves, at every party wall between two classrooms and
           every other bay of the gym. It breaks the trim, which is why
           the elevation is walked as SEGMENTS rather than laid as four
           long rectangles.

       And at the door, an ENTRANCE BAY standing forty-eight in front of
       the rest: two brick piers, a pair of steel doors between them
       with a date stone over, and the cornice carried round the front
       of it. The front door used to be a hole in a flat wall, and from
       the lawn it read as a black wedge — which is the thing the user
       drew a ring round. */
    const SBASE = 16, STRING = FOUND + STOREY;           // how far the trim stands out, and the first floor
    const trimProps = () => open(`${tag} trim`, {
      floor: FOUND / 2, ceil: B.top, floorTex: 'CONCRETE', light: 0.30, ambient: 0.30,
      lowerTex: 'WATERTBL', upperTex: B.gable, wallTex: B.wall, fuel: 0 });
    const trim = () => ({ ...trimProps(), storeys: [
      { floor: FOUND / 2, ceil: STRING - PLINTH, ceilTex: 'SKY' },
      { floor: STRING, ceil: B.eaves - 24, ceilTex: 'SKY', lowerTex: 'WATERTBL' },
      { floor: B.eaves, ceil: B.eaves, ceilTex: 'SKY', lowerTex: 'CORNICE', upperTex: 'NONE' }] });
    const pilaster = () => ({ storeys: [{ ...topOf(B), lowerTex: 'PILASTR', wallTex: 'PILASTR', upperTex: 'NONE',
                                          name: `${tag} pilaster` }] });
    /* one at every party wall, one every other bay of the gym, one on
       each corner */
    const piers = [[0, 32], [W - 32, W]];
    for (const u of [344, 760, 1176, 1592]) piers.push([u - 16, u + 16]);
    for (let j = 0; j < 5; j++) piers.push([1792 + 176 * j, 1824 + 176 * j]);
    piers.sort((a, b) => a[0] - b[0]);
    const BAY0 = DOOR0 - 32, BAY1 = DOOR1 + 32, BAY_OUT = 48;
    /* the courses along one face, between and through the piers */
    const courses = (Fx, skip) => {
      let u = 0;
      const plain = (a, b) => {
        if (b - a <= 0) return;
        Fx.add(a, 0, b, PLINTH, plinthProps(B));
        Fx.add(a, PLINTH, b, SBASE, trim());
      };
      for (const [p0, p1] of [...piers, ...(skip ? [skip] : [])].sort((a, b) => a[0] - b[0])) {
        plain(u, p0);
        if (!skip || p0 !== skip[0]) Fx.add(p0, 0, p1, SBASE, pilaster());
        u = p1;
      }
      plain(u, W);
    };
    courses(F, [BAY0, BAY1]);
    courses(K, null);
    /* THE ENTRANCE BAY: two piers, the doors between them, a date stone
       over the doors and the cornice carried round in front. */
    Fx_bay: {
      F.add(BAY0, 0, DOOR0, BAY_OUT, pilaster());
      F.add(DOOR1, 0, BAY1, BAY_OUT, pilaster());
      F.add(DOOR0, 0, DOOR1, BAY_OUT, { ...open(`${tag} entrance`, {
          floor: FOUND, ceil: B.top, floorTex: 'KITCHTIL', light: 0.46, ambient: 0.46,
          lowerTex: 'SCHOOLBR', upperTex: B.gable, wallTex: 'SCHDOOR', fuel: 0 }),
        storeys: [
          { floor: FOUND, ceil: FOUND + CLEAR, name: `${tag} entrance` },
          { floor: FOUND + CLEAR + 32, ceil: FOUND + CLEAR + 32, lowerTex: 'DATESTON', name: `${tag} date stone` },
          { floor: B.eaves, ceil: B.eaves, ceilTex: 'SKY', lowerTex: 'SCHOOLBR', upperTex: 'NONE' }] });
      F.add(BAY0, BAY_OUT, BAY1, BAY_OUT + PLINTH, stoopProps(B));
      F.add(BAY0, BAY_OUT + PLINTH, BAY1, BAY_OUT + SBASE, trim());
    }
    /* the steps, the path and the lawn in front of them */
    const STEP0 = BAY_OUT + SBASE;
    F.add(BAY0, STEP0, BAY1, STEP0 + TREAD_D, treadProps(B));
    F.add(BAY0, STEP0 + TREAD_D, BAY1, FY, pathProps(B));
    /* and chain link along the frontage, with the path through it,
       because an American school has a fence and this one had a lawn
       that ran into the road */
    const SFENCE = 16;
    const railedS = (u0, u1) => {
      if (u1 - u0 <= 0) return;
      const a = F.add(u0, SBASE, u1, FY - SFENCE, lawn(`${tag} yard`));
      fence(a, F.add(u0, FY - SFENCE, u1, FY, lawn(`${tag} verge`)), 'CHAINLNK', 128);
    };
    railedS(-128, BAY0);
    railedS(BAY1, W + 128);
    F.add(-SBASE, 0, 0, SBASE, lawn(`${tag} yard`));
    F.add(W, 0, W + SBASE, SBASE, lawn(`${tag} yard`));
    /* and the back, which has the same courses and no door */
    const BY = (y1 - y0) - FY - D;
    K.add(-128, SBASE, W + 128, BY, lawn(`${tag} back yard`));
    K.add(-SBASE, 0, 0, SBASE, lawn(`${tag} back yard`));
    K.add(W, 0, W + SBASE, SBASE, lawn(`${tag} back yard`));
    /* the two short sides, which have no windows and get the courses
       anyway, because a building that stops being a building round the
       corner is a film set */
    for (const [Fs, X] of [[frame(sx0, sy0, 'W'), 0], [frame(sx0 + W, sy0, 'E'), 0]]) {
      Fs.add(0, 0, D, PLINTH, plinthProps(B));
      Fs.add(0, PLINTH, D, SBASE, trim());
    }
    F.add(-128, -D - SBASE, -SBASE, SBASE, lawn(`${tag} side lawn`));
    F.add(W + SBASE, -D - SBASE, W + 128, SBASE, lawn(`${tag} side lawn`));
    /* trees along the front, the way a school planted in 1954 has them:
       broadleaves and not firs, because the firs are the WOOD and a
       school with the wood's own trees down its frontage is a school in
       a clearing rather than a school in a town */
    for (let u = -40; u < W + 40; u += 352) if (Math.abs(u - (DOOR0 + DOOR1) / 2) > 200)
      plant(R() < 0.82 ? broadleaf() : 'fir_medium', ...F.at(u + (R() - 0.5) * 60, FY - 140 - R() * 120), 0.9 + R() * 0.3);
    for (const u of [DOOR0 - 64, DOOR1 + 64 - 32]) plant('bush_large_1', ...F.at(u, 24), 0.9);
    /* AND BOX ALONG THE FOUNDATION, which is the one piece of planting
       every institutional building in America has: a clipped run tight
       to the wall, broken at the entrance bay and carried round the
       ends of the block. It hides the course where the brick meets the
       ground, which is the course that never looks right. */
    const HEDGE_V = SBASE + 44;
    hedgeRun(...F.at(-96, HEDGE_V), ...F.at(BAY0 - 56, HEDGE_V));
    hedgeRun(...F.at(BAY1 + 56, HEDGE_V), ...F.at(W + 96, HEDGE_V));

    const [scx, scy] = F.at(W / 2, -D / 2);
    out.school = { x: scx, y: scy };
    return B;
  }

  /* the ball field, which is what tells you it is a school from three
     streets away, and is therefore built before the building is */
  function field(bx, by, tag) {
    const [x0, x1] = bx, [y0, y1] = by;
    const M = 160;                       // the verge between the fence and the sidewalk
    const grass = n => open(n, {
      floorTex: 'GRASSVRG', light: 0.28, ambient: 0.28, fuel: TOWN_FUEL.yard,
      wallTex: 'CHAINLNK', upperTex: 'CHAINLNK' });
    /* the field, and a ring of four round it, so every side of it has a
       line with another sector on the far side — which is where the
       wire goes */
    const inner = rm.add(x0 + M, y0 + M, x1 - M, y1 - M, grass(`${tag} ball field`));
    for (const [a, b, c, d] of [[x0, y0, x1, y0 + M], [x0, y1 - M, x1, y1],
                                [x0, y0 + M, x0 + M, y1 - M], [x1 - M, y0 + M, x1, y1 - M]])
      fence(inner, rm.add(a, b, c, d, grass(`${tag} field lawn`)), 'CHAINLNK', 128);
    /* the trees go on the lawn OUTSIDE the wire, which is where a ball
       field's trees are: on the field they would be in right centre */
    for (const [u, v] of [[M / 2, 0.22], [M / 2, 0.78], [x1 - x0 - M / 2, 0.22], [x1 - x0 - M / 2, 0.78]])
      plant('fir_medium', x0 + u, y0 + (y1 - y0) * v, 0.9);
  }

  /* =================================================================
     THE CHURCH — white clapboard on a fieldstone foundation, a gable to
     the street, a tower with a spire, and inside it the things a church
     is made of: a nave with pews down both sides of an aisle, a raised
     chancel with an altar and a cross behind it, lancet windows of
     coloured glass let into the walls you can see out through, and a
     choir loft over the narthex reached by a stair that turns back on
     itself — a real second storey over a real ground floor, and the
     first place in the game where you can look down on a room you were
     just standing in.
     ================================================================= */
  function church(bx, by, tag) {
    const [x0, x1] = bx, [y0, y1] = by;
    const NAVE_W = 640, BODY_D = 1144, TOWER = 256, NARTH_D = 160;
    const FYc = 512;
    /* HOW A WALL MEETS THE GROUND, in three courses rather than one.
       WATER is how far the stone water table stands out past the
       plinth; the plinth is PLINTH; and the sixteen beyond that is the
       strip still under the eaves. A buttress stands through all three
       — BUTT_W across, BUTT_OUT proud of the wall, with its lower
       stage weathered off at BUTT_SET and the upper stage carrying on
       to the eaves eight proud, which is what a buttress IS: not a
       block against a wall but a wall that gets thinner as it goes up
       and sheds the rain at every change. */
    const WATER = PLINTH, BASE = PLINTH + WATER;         // 8 and 16
    const BUTT_W = 48, BUTT_OUT = BASE, BUTT_STEP = PLINTH, BUTT_SET = 216;
    const cx = x0 + (x1 - x0 - NAVE_W) / 2;
    const cyTop = y1 - FYc;                              // the tower's front face
    const F = frame(cx, cyTop, 'N');                     // u along +x, v north
    const dress = { wall: 'CHURCHST', gable: 'CHURCHST', roof: 'SHINGLE' };
    /* the body, with a pitched roof — steeper than a house's, because a
       church's is */
    const B = building(tag, frame(cx, cyTop - TOWER, 'N'), NAVE_W, BODY_D, 3, dress,
      { base: FOUND, rise: 192, jamb: 'WINREVEL', foundation: 'STONEFND', litChance: 0.5,
        /* THE NAVE IS OPEN TO THE ROOF, so the roof storey has an inside
           — see topOf. Boarding and rafters, and the shingle is the
           other face of the same triangles. */
        soffit: 'CHURCHCL' });
    /* THE RIDGE RUNS DOWN THE NAVE, not across it: the gable faces the
       street, which is what a church looks like from its own front */
    B.slope = gableSlope('y', cx + NAVE_W / 2, NAVE_W / 2, B.eaves, B.rise);
    /* the tower, with a spire drawn over it — see roofPending */
    const T = { tag: `${tag} tower`, wall: 'CHURCHST', gable: 'CHURCHST', jamb: 'CHURCHST', foundation: 'STONEFND',
                base: FOUND, top: FOUND + 3 * STOREY + CLEAR, slope: null };
    const Bz = FOUND;
    const holy = { light: 0.34, ambient: 0.34, ceilTex: 'PLASTER', wallTex: 'CHURCHIN', upperTex: 'CHURCHIN', lowerTex: 'CHURCHIN', fuel: TOWN_FUEL.nave };

    /* ---- THE TOWER, IN STAGES -------------------------------------
       A tower is not a box. It is a box that changes at every stage —
       a water table it stands on, a belt course where the stair
       landing is, a belfry with the slats you hear the bell through,
       and a cornice the spire sits on rather than grows out of. All
       four are BANDS, and a band is a piece of geometry standing proud
       of the wall behind it; see THE TRIM in js/textures.js.

       THE LOUVRE IS A SHUT STOREY. The wall is split into an outer
       sixteen and an inner eight, the outer is open across the belfry
       and the inner is not — and what the inner is NOT open with is a
       storey whose ceiling is on its floor, which lineBands calls the
       shut door: open nowhere and still the surface you are looking
       at. Its lowerTex is the slats. Sixteen units of recess in front
       of them is what makes the opening read as a hole in a wall
       rather than as a picture of one. */
    const tv0 = -TOWER, tu0 = (NAVE_W - TOWER) / 2, tu1 = tu0 + TOWER;   // 192..448
    const BELF0 = T.top - 176, BELF1 = T.top - 48;        // 288..416
    const bv0 = tv0 + 40, bv1 = -40;                      // and across the tower
    const belfSkin = { ...recess, floorTex: 'SILLWOOD', ceilTex: 'WINREVEL', wallTex: 'WINREVEL',
                       lowerTex: 'CHURCHST', upperTex: 'CHURCHST' };
    const louvreBack = () => ({ floor: BELF1, ceil: BELF1, lowerTex: 'LOUVRE', upperTex: 'CHURCHST',
                                wallTex: 'LOUVRE', name: `${tag} belfry louvre` });
    const belfSt = [{ floor: BELF0, ceil: BELF1, light: 0.46, ambient: 0.46, name: `${tag} belfry` }];
    out.louvres = (out.louvres || 0) + 4;
    /* the two sides: solid, belfry, solid */
    for (const side of ['W', 'E']) {
      const w0 = side === 'W' ? tu0 : tu1 - ZONE, w1 = w0 + ZONE;
      const [o0, o1] = side === 'W' ? [w0, w0 + NICHE] : [w1 - NICHE, w1];
      const [i0, i1] = side === 'W' ? [w0 + NICHE, w1] : [w0, w1 - NICHE];
      solid(T, F, w0, tv0, w1, bv0);
      solid(T, F, w0, bv1, w1, -ZONE);
      F.add(o0, bv0, o1, bv1, col(T, belfSt, { ...belfSkin, light: 0.46, ambient: 0.46 }));
      F.add(i0, bv0, i1, bv1, col(T, [louvreBack()], { ...belfSkin, light: 0.30, ambient: 0.30 }));
    }
    /* the front: a doorway you walk through with the belfry over it,
       and solid either side. The doorway is split at the recess line
       for the same reason the sides are — the slats go on the inner
       half's shut storey. */
    solid(T, F, tu0, -ZONE, tu0 + 80, 0);
    const doorSkin = { ...holy, floorTex: 'FLOORBRD', light: 0.5, ambient: 0.5, upperTex: T.wall, lowerTex: T.wall };
    F.add(tu0 + 80, -NICHE, tu1 - 80, 0, col(T,
      [{ floor: T.base, ceil: T.base + CLEAR, name: `${tag} door` },
       { floor: BELF0, ceil: BELF1, light: 0.46, ambient: 0.46, name: `${tag} belfry` }], doorSkin));
    F.add(tu0 + 80, -ZONE, tu1 - 80, -NICHE, col(T,
      [{ floor: T.base, ceil: T.base + CLEAR, name: `${tag} door` }, louvreBack()], doorSkin));
    out.doors++;
    solid(T, F, tu1 - 80, -ZONE, tu1, 0);
    /* one tall room, all the way up to the bells */
    F.add(tu0 + ZONE, tv0 + ZONE, tu1 - ZONE, -ZONE, col(T, [{ floor: Bz, ceil: T.top, ceilTex: 'PLASTER', name: `${tag} tower` }], { ...holy, floorTex: 'FLOORBRD' }));
    /* its back wall, through into the narthex */
    solid(T, F, tu0 + ZONE, tv0, tu0 + 80, tv0 + ZONE);
    solid(T, F, tu1 - 80, tv0, tu1 - ZONE, tv0 + ZONE);
    F.add(tu0 + 80, tv0, tu1 - 80, tv0 + ZONE, col(T, [{ floor: Bz, ceil: Bz + CLEAR }], { ...holy, floorTex: 'FLOORBRD', name: `${tag} tower way` }));
    F.add(tu0 + 80, tv0 - ZONE, tu1 - 80, tv0, col(B, [{ floor: Bz, ceil: Bz + CLEAR }], { ...holy, floorTex: 'FLOORBRD', name: `${tag} tower way` }));

    /* ---- the body's front face, either side of the tower ---------- */
    const bodyFront = tv0;                               // v of the body's north face
    const lancet = (Fx, u0, v0, name) => {
      /* a lancet: a hundred and twenty-eight of coloured glass over a
         sill at forty-eight. Outer recess sixteen deep, inner eight,
         and the glass on the inner line. */
      const st = [{ floor: Bz + 48, ceil: Bz + 176, name }];
      const outer = Fx.add(u0, v0 - NICHE, u0 + WIN_W, v0, col(B, st,
        { ...recess, light: 0.85, ambient: 0.85, floorTex: 'SILLWOOD', ceilTex: 'WINREVEL', wallTex: 'WINREVEL', lowerTex: 'CHURCHST', upperTex: 'CHURCHST' }));
      const inner = Fx.add(u0, v0 - ZONE, u0 + WIN_W, v0 - NICHE, col(B, st,
        { ...recess, light: 0.5, ambient: 0.5, floorTex: 'SILLWOOD', ceilTex: 'WINREVEL', wallTex: 'WINREVEL', lowerTex: 'CHURCHIN', upperTex: 'CHURCHIN' }));
      out.windows++;
      out.glass.push({ inner, outer, tex: 'STAINGLS' });
      return [outer, inner];
    };
    solid(B, F, 0, bodyFront - ZONE, 64, bodyFront);
    lancet(F, 64, bodyFront, `${tag} narthex window`);
    solid(B, F, 128, bodyFront - ZONE, tu0 + 80, bodyFront);
    solid(B, F, tu1 - 80, bodyFront - ZONE, 512, bodyFront);
    lancet(F, 512, bodyFront, `${tag} narthex window`);
    solid(B, F, 576, bodyFront - ZONE, NAVE_W, bodyFront);

    /* ---- the narthex, the loft over it, and the stair ------------- */
    const nv1 = bodyFront - ZONE;                        // -280, the inside of the front wall
    const nv0 = bodyFront - NARTH_D;                     // -416, the wall to the nave
    const narthex = col(B,
      [{ floor: Bz, ceil: Bz + 2 * STOREY - WALL, ceilTex: 'PLASTER', name: `${tag} narthex` },
       { floor: Bz + 2 * STOREY, ceil: Bz + 3 * STOREY, ceilTex: 'NONE', name: `${tag} choir loft`, floorTex: 'FLOORBRD' }],
      { ...holy, floorTex: 'FLOORBRD' });
    /* THE ORGAN stands on the loft against the front wall: the narthex
       below it is untouched and the case is a SHUT band between the
       loft's floor and a storey that starts ninety-six above it, which
       is exactly as tall as the pipes are. */
    F.add(248, nv1 - 64, 312, nv1, narthex);
    F.add(312, nv1 - 64, 472, nv1, { ...holy, floorTex: 'FLOORBRD', storeys: [
      { floor: Bz, ceil: Bz + 2 * STOREY - WALL, ceilTex: 'PLASTER', name: `${tag} narthex` },
      { floor: Bz + 2 * STOREY + 96, ceil: Bz + 3 * STOREY, floorTex: 'PLASTER', lowerTex: 'ORGANPIP',
        ceilTex: 'NONE', light: 0.44, ambient: 0.44, name: `${tag} organ` },
      topOf(B)] });
    F.add(472, nv1 - 64, 616, nv1, narthex);
    F.add(24, nv0 + WALL, 616, nv1 - 64, narthex);
    /* A STAIR TURNED BACK ON ITSELF HERE — seven treads east to west
       along the front wall and seven back beside them, the top of one
       sharing its air with the bottom of the next, no landing rectangle
       at all — and it is gone with the school's two, at the user's
       request. The narthex is a plain rectangle again and the choir
       loft over it cannot be reached on foot. */
    F.add(24, nv1 - 64, 248, nv1, narthex);
    /* the way through to the nave, on both levels */
    /* the way through to the nave, on both levels — and at the loft's
       level it is a RAIL and not a way: the upper opening starts a rail
       above the loft's floor, so the band under it is the balusters you
       lean on and cannot walk through */
    F.add(224, nv0, 416, nv0 + WALL, col(B,
      [{ floor: Bz, ceil: Bz + STOREY, ceilTex: 'PLASTER' },
       { floor: Bz + 2 * STOREY + 32, ceil: Bz + 3 * STOREY, lowerTex: 'ALTARRL', ceilTex: 'NONE',
         name: `${tag} loft rail` }],
      { ...holy, floorTex: 'FLOORBRD', name: `${tag} nave door` }));

    /* ---- the nave --------------------------------------------------- */
    const av1 = nv0;                                     // the nave's north wall
    const av0 = bodyFront - BODY_D + ZONE;               // -1352, inside the back wall
    /* THE WAINSCOT is a ledge eight deep and forty tall along both long
       walls, which is the one way this engine puts two textures on one
       wall: the ledge's face is the panelling and the wall above it is
       plaster. The windows open onto it. */
    const TOP = Bz + 3 * STOREY;                         // the eaves, which is the nave's ceiling line
    /* EVERY CEILING IN THE NAVE IS 'NONE', which is not a missing
       ceiling but the point: with nothing drawn at the eaves you are
       looking straight up into the roof storey above, whose sloped
       ceiling wears the boarding (see soffit in topOf) and whose other
       face is the shingle on the street. A church open to its rafters,
       out of one texture name. */
    const ledgeProps = { ...holy, floor: Bz + 40, floorTex: 'PEWSEAT', lowerTex: 'WAINSCOT', ceilTex: 'NONE', name: `${tag} wainscot` };
    F.add(ZONE, av0, ZONE + 8, av1, col(B, [{ floor: Bz + 40, ceil: Bz + 3 * STOREY }], ledgeProps));
    F.add(NAVE_W - ZONE - 8, av0, NAVE_W - ZONE, av1, col(B, [{ floor: Bz + 40, ceil: Bz + 3 * STOREY }], ledgeProps));
    /* the long walls: five lancets a side, solid between them */
    const naveWin = [-1296, -1136, -976, -816, -656];
    for (const side of [0, 1]) {
      const ou = side ? NAVE_W - NICHE : 0, iu = side ? NAVE_W - ZONE : NICHE;
      let v = av0;
      for (const wv of naveWin) {
        solid(B, F, side ? NAVE_W - ZONE : 0, v, side ? NAVE_W : ZONE, wv);
        const st = [{ floor: Bz + 48, ceil: Bz + 176, name: `${tag} nave window` }];
        const outer = F.add(ou, wv, ou + NICHE, wv + WIN_W, col(B, st,
          { ...recess, light: 0.85, ambient: 0.85, floorTex: 'SILLWOOD', ceilTex: 'WINREVEL', wallTex: 'WINREVEL', lowerTex: 'CHURCHST', upperTex: 'CHURCHST' }));
        const inner = F.add(iu, wv, iu + 8, wv + WIN_W, col(B, st,
          { ...recess, light: 0.5, ambient: 0.5, floorTex: 'SILLWOOD', ceilTex: 'WINREVEL', wallTex: 'WINREVEL', lowerTex: 'CHURCHIN', upperTex: 'CHURCHIN' }));
        out.glass.push({ inner, outer, tex: 'STAINGLS' });
        out.windows++;
        v = wv + WIN_W;
      }
      solid(B, F, side ? NAVE_W - ZONE : 0, v, side ? NAVE_W : ZONE, nv1);
    }
    /* ---- THE CHANCEL, IN BANDS --------------------------------------
       A step up, red carpet, the altar in the middle of it, the reredos
       let into the wall behind, a pulpit and a lectern at the front
       corners, and across the whole of it the communion rail with a
       gate in the middle — which is masked, so what you see between the
       balusters is the chancel and not a painted picture of one. */
    const cv0 = av0, cv1 = av0 + 192;
    const cvR = cv1 - 8, cvP = cvR - 64;                 // the rail, and where the pulpit starts
    const chan = (n, extra = {}) => col(B, [{ floor: Bz + 16, ceil: TOP, ceilTex: 'NONE' }],
      { ...holy, floorTex: 'CHANCEL', lowerTex: 'STEPFACE', name: `${tag} ${n}`, ...extra });
    const stand = (n, up, low, lit = 0.42) => col(B, [{ floor: Bz + 16 + up, ceil: TOP, ceilTex: 'NONE' }],
      { ...holy, floorTex: 'PEWSEAT', lowerTex: low, light: lit, ambient: lit, name: `${tag} ${n}` });
    F.add(32, cv0, 272, cv0 + 52, chan('chancel'));
    F.add(272, cv0, 368, cv0 + 52, chan('chancel'));
    F.add(368, cv0, 608, cv0 + 52, chan('chancel'));
    F.add(32, cv0 + 52, 272, cv0 + 92, chan('chancel'));
    F.add(272, cv0 + 52, 368, cv0 + 92, col(B, [{ floor: Bz + 56, ceil: TOP, ceilTex: 'NONE' }],
      { ...holy, floorTex: 'ALTARTOP', lowerTex: 'ALTARFRT', light: 0.5, ambient: 0.5, name: `${tag} altar` }));
    F.add(368, cv0 + 52, 608, cv0 + 92, chan('chancel'));
    F.add(32, cv0 + 92, 608, cvP, chan('chancel'));
    F.add(32, cvP, 96, cvR, chan('chancel'));
    F.add(96, cvP, 176, cvR, stand('pulpit', 48, 'PULPITFR', 0.48));
    F.add(176, cvP, 464, cvR, chan('chancel'));
    F.add(464, cvP, 544, cvR, stand('lectern', 32, 'PEWFRONT'));
    F.add(544, cvP, 608, cvR, chan('chancel'));
    F.add(32, cvR, 272, cv1, stand('communion rail', 32, 'ALTARRL'));
    F.add(272, cvR, 368, cv1, chan('chancel gate'));
    F.add(368, cvR, 608, cv1, stand('communion rail', 32, 'ALTARRL'));
    solid(B, F, 0, av0 - ZONE, 256, av0);
    F.add(256, av0 - NICHE, 384, av0, col(B, [{ floor: Bz + 16, ceil: Bz + 144, wallTex: 'REREDOS', light: 0.5, ambient: 0.5, ceilTex: 'WINREVEL' }],
      { ...holy, floorTex: 'CHANCEL', name: `${tag} reredos` }));
    solid(B, F, 384, av0 - ZONE, NAVE_W, av0);

    /* ---- THE NAVE, BAND BY BAND -------------------------------------
       Five strips down its length — aisle, pews, the centre aisle,
       pews, aisle — and the nave laid as a PARTITION ACROSS them rather
       than as five strips each tiled on its own. Which is what lets
       anything that crosses the nave be one thing: the arch into the
       chancel is one band, and so is every tie beam over your head.
       Five bands kept in step by hand is five chances to be one unit
       out, and a church with a beam that stops over the third pew is
       worse than a church with no beams.

       THE ARCH IS FIVE RECTANGLES. This engine has no curve, and a
       semicircle drawn in five steps from a pier at each side reads as
       an arch from the door, which is where you look at it from. The
       plaster over it is the band between each step's ceiling and the
       roof storey above.

       THE TIE BEAM IS A COLUMN WITH A GAP IN IT: open under the beam,
       shut for the twenty-four the beam is deep, open over it and on up
       into the rafters. You walk under it; you see it from both sides
       and from underneath; and it is the same disagreement rule the
       whole town is drawn with. */
    const NAVE_U = [32, 80, 256, 384, 560, 608];
    const bandName = i => i === 2 ? 'centre aisle' : (i === 1 || i === 3) ? 'nave floor' : 'side aisle';
    const aisle = n => col(B, [{ floor: Bz, ceil: TOP, ceilTex: 'NONE' }], { ...holy, floorTex: 'FLOORBRD', name: `${tag} ${n}` });
    let nv = cv1;
    const floorBand = d => { if (d <= 0) return; for (let i = 0; i + 1 < NAVE_U.length; i++) F.add(NAVE_U[i], nv, NAVE_U[i + 1], nv + d, aisle(bandName(i))); nv += d; };
    const pewBand = () => {
      for (let i = 0; i + 1 < NAVE_U.length; i++) {
        const u0 = NAVE_U[i], u1 = NAVE_U[i + 1];
        if (i !== 1 && i !== 3) { F.add(u0, nv, u1, nv + 32, aisle(bandName(i))); continue; }
        F.add(u0, nv, u1, nv + 24, col(B, [{ floor: Bz + 16, ceil: TOP, ceilTex: 'NONE' }], { ...holy, floorTex: 'PEWSEAT', lowerTex: 'PEWFRONT', name: `${tag} pew` }));
        F.add(u0, nv + 24, u1, nv + 32, col(B, [{ floor: Bz + 44, ceil: TOP, ceilTex: 'NONE' }], { ...holy, floorTex: 'PEWSEAT', lowerTex: 'PEWBACK', name: `${tag} pew back` }));
      }
      nv += 32;
    };
    const BEAM_D = 24, BEAM_Z = Bz + 248;                // the beam's soffit, eight feet up
    const beamBand = () => {
      F.add(32, nv, 608, nv + BEAM_D, col(B, [
        { floor: Bz, ceil: BEAM_Z, ceilTex: 'TIEBEAM' },
        { floor: BEAM_Z + BEAM_D, ceil: TOP, floorTex: 'TIEBEAM', lowerTex: 'TIEBEAM', ceilTex: 'NONE' },
      ], { ...holy, floorTex: 'FLOORBRD', name: `${tag} tie beam` }));
      nv += BEAM_D;
    };
    /* the arch: a pier each side and five steps of head between them */
    const pier = n => ({ storeys: [{ ...topOf(B), lowerTex: 'CHURCHIN', wallTex: 'CHURCHIN', upperTex: 'CHURCHIN', name: `${tag} ${n}` }] });
    const ARCH = [[32, 96, 0], [96, 160, 232], [160, 224, 264], [224, 416, 288], [416, 480, 264], [480, 544, 232], [544, 608, 0]];
    for (const [u0, u1, h] of ARCH)
      F.add(u0, nv, u1, nv + 16, h ? col(B, [{ floor: Bz, ceil: Bz + h, ceilTex: 'PLASTER' }], { ...holy, floorTex: 'FLOORBRD', name: `${tag} chancel arch` })
                                   : pier('chancel arch pier'));
    nv += 16;
    floorBand(24);
    for (let r = 0; r < 8; r++) { pewBand(); floorBand(48); if (r === 2 || r === 5) beamBand(); }
    floorBand(av1 - nv);
    /* the lights: four down the nave, two over the chancel, one in the
       narthex, because a church at two in the morning is lit by
       whatever somebody left on */
    for (const v of [-520, -680, -840, -1000, -1140]) fitting(...F.at(320, v));
    for (const u of [176, 464]) fitting(...F.at(u, cv0 + 120));
    fitting(...F.at(432, nv1 - 32));

    /* ---- THE GROUND ROUND IT, IN RINGS -------------------------------
       Three of them outside the wall and each one a step down: the
       PLINTH the wall stands on, the WATER TABLE outside that, and
       outside that the sixteen of lawn still under the eaves. A ring
       is three rects — a strip down each side and one across the back
       that takes both corners — so they tile with nothing left over
       and nothing laid twice.

       AND THE EAVES ARE ON THE LONG SIDES, because the ridge runs down
       the nave: every ring down a side is wrapped in underEaves and so
       carries the roof's own edge over it, and the two gable ends get
       the same rings with no lip. A church with no eaves is a shed, and
       that is what this was. */
    const bw0 = x0 - cx, bw1 = x1 - cx;                  // the block, in u
    const backV = bodyFront - BODY_D;                    // the outside of the back wall
    const back0 = y0 - cyTop;
    /* THE RAILING along the frontage, with the gate where the path is:
       the churchyard is laid short of the sidewalk by a verge, and the
       iron goes in the line between the two. Masked, so what you see
       between the standards is the graveyard. */
    const RAILV = 16;
    const railed = (u0, u1, v0) => {
      if (u1 - u0 <= 0) return;
      const a = F.add(u0, v0, u1, FYc - RAILV, lawn(`${tag} churchyard`));
      fence(a, F.add(u0, FYc - RAILV, u1, FYc, lawn(`${tag} churchyard verge`)), 'RAILING', 96);
    };
    const waterProps = () => open(`${tag} water table`, {
      floor: PLINTH * 2, ceil: B.top, floorTex: 'CONCRETE', light: 0.32, ambient: 0.32,
      lowerTex: 'WATERTBL', upperTex: B.gable, wallTex: B.wall, fuel: 0 });
    /* WHERE A BUTTRESS GOES: the middle of every gap between two
       lancets, and one on each back corner. Two stages — sixteen proud
       to the set-off and eight proud from there to the eaves — because
       a buttress is a wall that gets thinner as it goes up and sheds
       the rain at every change, and one block of one thickness reads as
       a pilaster somebody forgot to finish. */
    const buttV = [[backV, backV + BUTT_W]];
    for (let i = 0; i + 1 < naveWin.length; i++)
      buttV.push([(naveWin[i] + WIN_W + naveWin[i + 1] - BUTT_W) / 2, (naveWin[i] + WIN_W + naveWin[i + 1] + BUTT_W) / 2]);
    buttV.push([naveWin[naveWin.length - 1] + WIN_W + 40, naveWin[naveWin.length - 1] + WIN_W + 40 + BUTT_W]);
    /* upperTex NONE because a buttress stops at the eaves: the band
       between its shut top and the roof lip beside it is not a surface,
       it is the roof overhanging, and a texture there is a board
       standing in the air above the gutter. */
    /* STONE, like the wall it braces. It was CORNRBRD — the painted
       board that closes the corner of a clapboard building — which was
       right when the church was clapboard and is a board glued to a
       stone wall now. */
    const buttTop = { ...topOf(B), lowerTex: 'CHURCHST', wallTex: 'CHURCHST', upperTex: 'NONE',
                      name: `${tag} buttress` };
    const buttSet = () => underEaves(B, open(`${tag} buttress set-off`, {
      floor: BUTT_SET, ceil: B.top, floorTex: 'WATERTBL', light: 0.34, ambient: 0.34,
      lowerTex: 'CHURCHST', upperTex: 'CHURCHST', wallTex: 'CHURCHST', fuel: 0 }));
    /* a strip [o0,o1] out from one side's wall face, from v0 to v1 */
    const outStrip = (side, o0, o1, v0, v1, props) => (v1 - v0 > 0) && (side
      ? F.add(NAVE_W + o0, v0, NAVE_W + o1, v1, props)
      : F.add(-o1, v0, -o0, v1, props));
    for (const side of [0, 1]) {
      let v = backV;
      const plain = (v0, v1) => {
        outStrip(side, 0, PLINTH, v0, v1, underEaves(B, plinthProps(B)));
        outStrip(side, PLINTH, BASE, v0, v1, underEaves(B, waterProps()));
      };
      for (const [b0, b1] of buttV) {
        plain(v, b0);
        outStrip(side, 0, BUTT_STEP, b0, b1, { storeys: [buttTop] });
        outStrip(side, BUTT_STEP, BUTT_OUT, b0, b1, buttSet());
        v = b1;
      }
      plain(v, bodyFront);
      /* each ring reaches one ring further back than the one inside it,
         so the back strip below takes the corner square and nothing is
         laid twice */
      outStrip(side, PLINTH, BASE, backV - PLINTH, backV, waterProps());
      outStrip(side, BASE, EAVE, backV - BASE, bodyFront, underEaves(B, lawn(`${tag} churchyard`)));
    }
    /* the back, which is a gable end and takes both corners with it */
    F.add(-PLINTH, backV - PLINTH, NAVE_W + PLINTH, backV, plinthProps(B));
    F.add(-BASE, backV - BASE, NAVE_W + BASE, backV - PLINTH, waterProps());
    F.add(-EAVE, backV - EAVE, NAVE_W + EAVE, backV - BASE, lawn(`${tag} churchyard`));
    /* the front, either side of the tower, which is the other gable end */
    F.add(-EAVE, bodyFront, tu0 - BASE, bodyFront + PLINTH, plinthProps(B));
    F.add(tu1 + BASE, bodyFront, NAVE_W + EAVE, bodyFront + PLINTH, plinthProps(B));
    /* ---- the tower's own ground, and the cornice the spire sits on ---
       The cornice is a strip sixteen out from each tower face that is
       OPEN below the bed mould and SHUT for the twenty-four above it:
       one band, hanging four hundred units up, which is the only way
       this engine puts anything on a wall that is not on the ground. */
    const cornCol = (name) => ({ ...open(name, { floor: FOUND, floorTex: 'CONCRETE', light: 0.34, ambient: 0.34,
        lowerTex: 'STONEFND', upperTex: B.gable, wallTex: T.wall, fuel: 0 }),
      /* OPEN TO THE BED MOULD AND SHUT ABOVE IT. The cornice is the
         band between the two, and the top storey is SHUT — ceiling on
         floor — rather than open to the sky, because an open one is
         open where the nave's roof beside it is not, and that
         disagreement is a sliver of board standing in the air from the
         roof's edge to the cloud base. It was two of them, either side
         of the spire, and they were one pixel wide and took an
         afternoon. ceilTex SKY so the band above the cornice is two
         heights of nothing and draws nothing; upperTex NONE so the
         sliver against the roof draws nothing either. */
      storeys: [{ floor: FOUND, ceil: T.top - 24, ceilTex: 'SKY' },
                { floor: T.top, ceil: T.top, ceilTex: 'SKY', lowerTex: 'CORNICE', upperTex: 'NONE' }] });
    /* LAID BY HAND rather than by approach(), because approach lays one
       plinth and walks away and a tower wants two courses: eight proud
       for the plinth and sixteen for the cornice, and the cornice's
       strip has to reach all the way round the front for the band to
       close at the corners. */
    const stoop = { u0: tu0 + 80 - STOOP_WING, u1: tu1 - 80 + STOOP_WING };
    F.add(tu0 - PLINTH, tv0, tu0, 0, plinthProps(T));
    F.add(tu1, tv0, tu1 + PLINTH, 0, plinthProps(T));
    F.add(tu0 - PLINTH, 0, tu1 + PLINTH, PLINTH, plinthProps(T));
    F.add(tu0 - BASE, tv0, tu0 - PLINTH, PLINTH, cornCol(`${tag} tower cornice`));
    F.add(tu1 + PLINTH, tv0, tu1 + BASE, PLINTH, cornCol(`${tag} tower cornice`));
    F.add(tu0 - BASE, PLINTH, tu1 + BASE, BASE, cornCol(`${tag} tower cornice`));
    F.add(stoop.u0, BASE, stoop.u1, BASE + STOOP_D, stoopProps(T));
    F.add(stoop.u0, BASE + STOOP_D, stoop.u1, BASE + STOOP_D + TREAD_D, treadProps(T));
    F.add(stoop.u0, BASE + STOOP_D + TREAD_D, stoop.u1, FYc, pathProps(T));
    /* THE CHEEK WALLS at the steps, which is where a church puts its
       hands on your shoulders: low stone the height of two risers,
       standing the length of the stoop and the step and no further. */
    const CHEEK = 16, cheekV = BASE + STOOP_D + TREAD_D;
    for (const [cu0, cu1] of [[stoop.u0 - CHEEK, stoop.u0], [stoop.u1, stoop.u1 + CHEEK]]) {
      F.add(cu0, BASE, cu1, cheekV, open(`${tag} cheek wall`, {
        floor: FOUND + 24, ceil: SKY, floorTex: 'WATERTBL', light: 0.40, ambient: 0.40,
        lowerTex: 'STONEFND', fuel: 0 }));
      railed(cu0, cu1, cheekV);
    }
    railed(tu0 - BASE, stoop.u0 - CHEEK, BASE);
    railed(stoop.u1 + CHEEK, tu1 + BASE, BASE);
    /* the lawn, from the rings out to the block */
    railed(bw0, tu0 - BASE, bodyFront + PLINTH);
    railed(tu1 + BASE, bw1, bodyFront + PLINTH);
    F.add(bw0, backV - EAVE, -EAVE, bodyFront + PLINTH, lawn(`${tag} churchyard`));
    F.add(NAVE_W + EAVE, backV - EAVE, bw1, bodyFront + PLINTH, lawn(`${tag} churchyard`));
    F.add(bw0, back0, bw1, backV - EAVE, lawn(`${tag} graveyard`));
    /* the graveyard behind, in rows, and the trees a churchyard has */
    for (let v = backV - 200; v > back0 + 160; v -= 224)
      for (let u = bw0 + 224; u < bw1 - 160; u += 176) if (R() < 0.8) stone(...F.at(u + (R() - 0.5) * 24, v + (R() - 0.5) * 24));
    /* THE TREES OF A CHURCHYARD ARE YEWS, which in this wood's art are
       the tall firs, and the two by the gate are not: a church plants
       something that turns in the fall where the street can see it. */
    for (const [u, v] of [[-500, -700], [-700, -1250], [1100, -600], [1300, -1300], [-300, 200], [1000, 300], [-900, -2000], [1400, -2100]])
      plant(R() < 0.5 ? 'fir_tall_1' : 'fir_tall_2', ...F.at(u + (R() - 0.5) * 120, v + (R() - 0.5) * 120), 0.95 + R() * 0.3);
    for (const u of [tu0 - 40, tu1 + 40]) plant('bush_large_1', ...F.at(u, 24), 0.9);
    /* box inside the iron the whole way along the frontage, stopping
       clear of the gate, and a lime each side of the path */
    const HEDGE_V = FYc - RAILV - 80;
    hedgeRun(...F.at(bw0 + 120, HEDGE_V), ...F.at(tu0 - BASE - 40, HEDGE_V));
    hedgeRun(...F.at(tu1 + BASE + 40, HEDGE_V), ...F.at(bw1 - 120, HEDGE_V));
    for (const u of [tu0 - BASE - 200, tu1 + BASE + 200])
      plant(broadleaf(), ...F.at(u, HEDGE_V - 190), 1.0 + R() * 0.25);

    /* the spire: a roof with a tall rise and a small footprint, drawn
       rather than built — a pyramid is four planes and a gable is two */
    const [sx, sy] = F.at(tu0, tv0);
    /* THE SPIRE SPRINGS OFF THE CORNICE and not off the wall, so its
       footprint is the tower plus the sixteen the cornice stands out —
       which is what stops it reading as the tower carrying on to a
       point. */
    /* ONE MATERIAL ALL THE WAY UP: the two triangular ends are shingled
       like the slopes, because a steeple is a steeple and not a gable
       with a stone wall in it. And a SOFFIT, because the storey under
       the spire is shut and without one you stand in the churchyard and
       look up through the steeple at the sky — see the soffit block in
       js/mapgeo.js. Stone, so the underside reads as the cornice it
       sits on carrying round. */
    out.roofPending.push({ x0: sx - BASE, y0: sy - BASE, x1: sx + TOWER + BASE, y1: sy + TOWER + BASE,
      base: T.top, rise: 320, tex: 'SHINGLE', gableTex: 'SHINGLE', soffit: 'CHURCHST',
      along: 'y', light: 0.38, sky: 1 });
    const [chx, chy] = F.at(NAVE_W / 2, (av0 + av1) / 2);
    out.church = { x: chx, y: chy };
  }

  /* =================================================================
     THE ONES WITH A JOB — the two lots that matter are the fire
     station's and the police station's, because they turn
     ResponderState.arrive from a PLACEHOLDER into a door.
     ================================================================= */
  function servicesBlock(bx, by, tag) {
    const [x0, x1] = bx, [y0, y1] = by;
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

  /* =================================================================
     THE GREEN, THE PARK AND THE CEMETERY

     All three are the same piece of ground: a path across it each way,
     four quarters between the paths, and a VERGE round the outside
     that the quarters do not reach. The verge is there for one reason —
     a fence is a masked texture hung in the line between two sectors
     that are both open to the sky (see `fence` at the top of this
     file), so an enclosure has to have ground on BOTH sides of it.

     THE RING IS EIGHT PIECES AND NOT FOUR, because the path has to get
     out. Where a path meets the block edge the ring is a GATE, paved
     instead of grassed, and the fence simply stops either side of it:
     eight pieces of verge, four gates, eight runs of iron.

     What stands on it is the only difference between the three. The
     cemetery is ironwork and ranked headstones; the green is clipped
     box the whole way round, which is what a town square with a
     committee looks like; the park is an avenue of limes with the
     quarters left as grass.
     ================================================================= */
  function parkBlock(bx, by, tag, kind) {
    const [x0, x1] = bx, [y0, y1] = by;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const M = 160;                       // the verge outside the fence
    const P = 48;                        // half a path
    const H = 40;                        // the box, inset from the fence
    const cem = kind === 'cemetery';
    const i0 = x0 + M, i1 = x1 - M, j0 = y0 + M, j1 = y1 - M;   // the fence line
    /* LIT LIKE A LAWN AND NOT LIKE A YARD. The green is the one piece
       of ground in the town with nothing standing over it, and at 0.26
       — which is what the blocks behind the houses get — it read as mud
       with gravestones on it. */
    const g = n => open(`${tag} ${n}`, { floorTex: 'GRASSVRG', light: 0.34, ambient: 0.34,
      fuel: TOWN_FUEL.park, wallTex: 'BRICKPNT', upperTex: 'BRICKPNT' });
    const path = n => open(`${tag} ${n}`, { floorTex: 'PAVERS', light: 0.34, ambient: 0.34, fuel: 0 });

    /* ---- the four quarters, which is what the fence encloses ------- */
    const lawn0 = rm.add(i0, j0, mx - P, my - P, g('lawn'));
    const lawn1 = rm.add(mx + P, j0, i1, my - P, g('lawn'));
    const lawn2 = rm.add(i0, my + P, mx - P, j1, g('lawn'));
    const lawn3 = rm.add(mx + P, my + P, i1, j1, g('lawn'));
    /* ---- the paths: a cross inside, and a gate through each side --- */
    rm.add(i0, my - P, i1, my + P, path('path across'));
    rm.add(mx - P, j0, mx + P, my - P, path('path'));
    rm.add(mx - P, my + P, mx + P, j1, path('path'));
    for (const [a, b, c, d] of [[mx - P, y0, mx + P, j0], [mx - P, j1, mx + P, y1],
                                [x0, my - P, i0, my + P], [i1, my - P, x1, my + P]])
      rm.add(a, b, c, d, path('gate'));
    /* ---- the verge, in eight pieces, each paired with the quarter it
       stands outside so the iron knows which line to hang in --------- */
    for (const [[a, b, c, d], inner] of [
      [[x0, y0, mx - P, j0], lawn0], [[mx + P, y0, x1, j0], lawn1],
      [[x0, j1, mx - P, y1], lawn2], [[mx + P, j1, x1, y1], lawn3],
      [[x0, j0, i0, my - P], lawn0], [[x0, my + P, i0, j1], lawn2],
      [[i1, j0, x1, my - P], lawn1], [[i1, my + P, x1, j1], lawn3],
    ]) {
      const verge = rm.add(a, b, c, d, g('verge lawn'));
      if (cem) fence(inner, verge, 'RAILING', 96);
    }

    /* ---- and what is planted on it --------------------------------- */
    /** Clear of both paths by `m`? */
    const offPath = (x, y, m) => Math.abs(x - mx) > P + m && Math.abs(y - my) > P + m;
    /** A short return of box either side of every gate, which is how a
     *  gate reads as an entrance rather than as a hole in a line. */
    const gateReturns = (len = 220) => {
      for (const s of [-1, 1]) {
        hedgeRun(mx + s * (P + H), j0 + H, mx + s * (P + H), j0 + H + len);
        hedgeRun(mx + s * (P + H), j1 - H - len, mx + s * (P + H), j1 - H);
        hedgeRun(i0 + H, my + s * (P + H), i0 + H + len, my + s * (P + H));
        hedgeRun(i1 - H - len, my + s * (P + H), i1 - H, my + s * (P + H));
      }
    };

    if (cem) {
      /* THE STONES GO IN RANKS. A row of headstones shares a line, and
         the line is what makes it a cemetery rather than a field with
         rubble in it — so the jitter is along the rank and in the
         angle, and never across it. One specimen tree to a quarter and
         the rank steps round it, the way a graveyard's rows step round
         the yew that was there before any of them. */
      gateReturns(300);
      for (const [qx0, qx1, qy0, qy1] of [[i0, mx - P, j0, my - P], [mx + P, i1, j0, my - P],
                                          [i0, mx - P, my + P, j1], [mx + P, i1, my + P, j1]]) {
        const set = [];
        for (let k = 0; k < 3; k++) {
          const tx = qx0 + 280 + R() * (qx1 - qx0 - 560), ty = qy0 + 280 + R() * (qy1 - qy0 - 560);
          if (set.some(([ax, ay]) => Math.hypot(ax - tx, ay - ty) < 420)) continue;
          set.push([tx, ty]);
          plant(k ? broadleaf() : 'fir_tall_1', tx, ty, 1.05 + R() * 0.30);
          plant('bush_large_1', tx + 70 + R() * 40, ty + 30, 0.9 + R() * 0.2);
        }
        for (let sy = qy0 + 150; sy < qy1 - 110; sy += 248)
          for (let sx = qx0 + 130; sx < qx1 - 100; sx += 168) {
            const px = sx + (R() - 0.5) * 26;
            if (set.some(([tx, ty]) => Math.hypot(px - tx, sy - ty) < 170)) continue;
            if (R() < 0.88) stone(px, sy);
          }
      }
    } else if (kind === 'green') {
      /* THE GREEN IS EDGED THE WHOLE WAY ROUND, which is the one thing
         a square has that a park does not, and the box stops short of
         each gate so the openings line up with the paving. */
      for (const b of [j0 + H, j1 - H]) {
        hedgeRun(i0 + H, b, mx - P - H, b);
        hedgeRun(mx + P + H, b, i1 - H, b);
      }
      for (const a of [i0 + H, i1 - H]) {
        hedgeRun(a, j0 + H, a, my - P - H);
        hedgeRun(a, my + P + H, a, j1 - H);
      }
      gateReturns();
      for (let sy = j0 + 300; sy < j1 - 240; sy += 420)
        for (let sx = i0 + 300; sx < i1 - 240; sx += 420) {
          const px = sx + (R() - 0.5) * 140, py = sy + (R() - 0.5) * 140;
          if (!offPath(px, py, 130)) continue;
          const r = R();
          if (r < 0.62) plant(broadleaf(), px, py, 0.90 + R() * 0.30);
          else if (r < 0.86) plant(['bush_large_1', 'bush_large_2', 'bush_small_1'][Math.floor(R() * 3)], px, py, 0.9 + R() * 0.3);
        }
    } else {
      /* THE PARK IS AN AVENUE. Limes ranked down both sides of both
         paths at a fixed pitch so it reads as planted rather than
         grown, box only at the crossing and at the gates — a hedge
         down the whole path would wall the grass off from the people
         it is for — and a clump in each corner.

         NOTHING IS PLANTED ACROSS THE GRASS between them, because the
         thing a park has and a wood does not is somewhere to stand. */
      gateReturns(160);
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        hedgeRun(mx + s * (P + H), my + t * (P + H), mx + s * (P + H + 260), my + t * (P + H));
        hedgeRun(mx + s * (P + H), my + t * (P + H), mx + s * (P + H), my + t * (P + H + 260));
      }
      for (let c = 340; c < (i1 - i0) / 2 - 220; c += 360)
        for (const s of [-1, 1]) for (const t of [-1, 1]) {
          plant(broadleaf(), mx + s * c, my + t * (P + 150), 0.95 + R() * 0.25);
          plant(broadleaf(), mx + s * (P + 150), my + t * c, 0.95 + R() * 0.25);
        }
      for (const [cx, cy] of [[i0 + 460, j0 + 460], [i1 - 460, j0 + 460], [i0 + 460, j1 - 460], [i1 - 460, j1 - 460]])
        for (let k = 0; k < 8; k++) {
          const px = cx + (R() - 0.5) * 660, py = cy + (R() - 0.5) * 660;
          if (!offPath(px, py, 260)) continue;
          plant(R() < 0.5 ? broadleaf() : ['bush_large_1', 'bush_large_2', 'fir_medium'][Math.floor(R() * 3)],
                px, py, 0.9 + R() * 0.35);
        }
    }
    /* LAMPS ON THE PAVING AND NOWHERE ELSE. Two at the crossing and one
       down each arm of it — a lamp out on the grass is a lamp somebody
       would have had to run a cable to, and the town's own rule (see
       the street lamp check in tools/smoke-test.mjs) is that every one
       of them stands on something you can walk on. */
    for (const [lx, ly, arm] of [[mx - 72, my - 20, Math.PI / 2], [mx + 72, my + 20, -Math.PI / 2],
                                 [mx - 420, my - 20, Math.PI / 2], [mx + 420, my + 20, -Math.PI / 2],
                                 [mx - 20, my - 420, 0], [mx + 20, my + 420, Math.PI]]) lamp(lx, ly, arm);
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
        case 'rows':     rowsBlock(bx, by, tag); break;
        /* the civic blocks flank Main Street, and their shops face it */
        case 'civic':    rowsBlock(bx, by, tag, c === 2 ? 'E' : 'W'); break;
        case 'flats':    rowsBlock(bx, by, tag); break;
        case 'school':   school(bx, by, tag); break;
        case 'field':    field(bx, by, tag); break;
        case 'church':   church(bx, by, tag); break;
        case 'stations': servicesBlock(bx, by, tag); break;
        case 'square':   parkBlock(bx, by, `${tag} the green`, 'green'); break;
        case 'park':     parkBlock(bx, by, `${tag} the park`, 'park'); break;
        case 'cemetery': parkBlock(bx, by, `${tag} the cemetery`, 'cemetery'); break;
        case 'motel':    plainBlock(bx, by, `${tag} the motel lot`, 'ASPHOLD', TOWN_FUEL.park, 'BRICKPNT'); break;
        case 'gas':      plainBlock(bx, by, `${tag} the forecourt`, 'CONCRETE', TOWN_FUEL.park, 'BRICKPNT'); break;
        default:         plainBlock(bx, by, tag, 'ASPHOLD', TOWN_FUEL.park, 'BRICKRED'); break;
      }
    }
  }

  return out;
}
