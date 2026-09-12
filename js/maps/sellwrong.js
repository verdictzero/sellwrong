/* =====================================================================
   GROCERY STORE SIMULATOR — the parade
   =====================================================================

   SellWrong is not a building, it is the middle of a building. It is the
   anchor of a strip mall: one long shed cut into tenancies, with the big
   one in the centre paying most of the rent and ten small ones either
   side hanging on. That framing is doing more work than it looks like it
   is, because it answers the two questions the level otherwise cannot:
   why the store is this shape, and what is on the other side of a wall
   you have just set fire to.

     y -2600 ┌────────────────────────────────────────────────────────┐
             │  verge, and the way in off the road                     │
             │  ─── seven rows of bays, three driving lanes ───        │  start
     y  -296 │  fire lane: nobody parks in front of the doors          │
     y  -136 ├──────────────── canopy, piers, fascias ────────────────┤
     y   -96 │  FOOTWAY, one kerb step up, running the whole           │
     y   -16 │  length of the parade                                  │
             ├─┬─┬─┬─┬─┬─┬─┬──┬──┬──┬══════════┬──┬──┬──┬─┬─┬─┬─┬─┬─┬─┤
     y     0 │ │ │ │ │ │ │ │V │W │C ║ SELLWRONG║K │P │V │ │ │ │ │ │ │ │
             │ seven unnamed │  │  ║ front end ║  │  │  │ seven more   │
     y   400 │ │ │ │ │ │ │ │ │  │  ║ twelve    ║  │  │  │ │ │ │ │ │ │ │
             └─┴─┴─┴─┴─┴─┴─┴─┴──┴──╢ runs,     ╟──┴──┴──┴─┴─┴─┴─┴─┴─┴─┘
     y  2620 ──────────────────────╢ butchery  ╟
     y  2776 ══════════════════════╬═══ STAFF ═╬
             │  STOCKROOM   │   DOCK    │   OFFICE    │
     y  3400 └──────────────────────────────────────────┘
           x -4560                                        x 8840

   THE SIZE. Three times the floor area of the first cut, and spent on
   MORE RUNS rather than on wider ones: twelve columns of gondola instead
   of six, three rows deep instead of two. Aisle widths are untouched at
   160, because an aisle is a corridor and the whole tension of the shop
   floor is that you cannot see down the next one. Scaling that number up
   with everything else would have produced a bigger shop that played
   smaller.

   THE FIRE READS THE FLOOR PLAN. Fuel lives in sectors, so the layout IS
   the difficulty curve: gondola runs are dense fuel in long strips,
   cross-aisles are nearly bare. Set light to one run and it will eat that
   run and stop, politely, at the cross-aisle. Getting it across is the
   game, and it is a consequence of the place being drawn like a shop
   rather than of any rule written down anywhere.

   THE FOOTWAY IS THE FUSE. It has a little fuel — less than an aisle,
   more than nothing — which means a store that is properly alight will
   eventually walk itself out of the front doors and along the parade into
   the chemist and the kebab shop, in its own time, without you. It also
   means the way out can be on fire when you need it. The car park has no
   fuel at all, and is the only place in the level you can stand and watch
   what you have done.
   ===================================================================== */

import { MapBuilder } from '../level.js';
import { RectMap } from './rectmap.js';
import { SHOPPERS } from '../people.js';
import { ACTORS } from '../states.js';   // to ask what is solid before standing next to it

/* --- the one rule ------------------------------------------------- */
const WALL = 16;                  // the void between two rooms IS the wall

/* =====================================================================
   THE GRID

   Written as generators rather than as a list of numbers, because at
   twelve columns a hand-typed X array stops being a floor plan and
   starts being a place typos live.
   ===================================================================== */

/* the anchor's interior */
export const ANCHOR_X0 = 200, ANCHOR_X1 = 4080;
export const ANCHOR_Y0 = 0,   ANCHOR_Y1 = 3400;

/* THE SERVICE YARD behind it, and the fence round the yard. Up here and
   exported because it is the only piece of the map with a hole in it
   that matters to anything outside this file: a fence with one gate is
   a claim about where you can and cannot walk, and a claim like that
   wants checking against the numbers rather than against a memory of
   them. See the block that builds it for how the gate is made. */
export const YARD = {
  x0: ANCHOR_X0, x1: ANCHOR_X1,
  y0: ANCHOR_Y1 + WALL,              // hard up against the store's back wall
  y1: ANCHOR_Y1 + WALL + 480,        // and the fence line along the back of it
  gate: [2400, 2560],                // lined up with the roller shutter
  fenceH: 96,                        // eight feet of chain link, near enough
};

/* the gondola field: twelve columns of 120 with 160 between them */
const NCOL = 12, GOND_W = 120, AISLE_W = 160, GX0 = 480;
/* The front end. NTILL lives up here rather than in the block that lays
   the tills out because the crowd wants it too: there is one queue per
   till, so eight is eight in both places or it is a queue at a lane that
   has no till in it. */
const TILL_W = 180, TILL_PITCH = 400, NTILL = 8;
const colX = k => GX0 + k * (GOND_W + AISLE_W);
const GX1 = colX(NCOL - 1) + GOND_W;                 // 3680, the east edge
/* The middle of the aisle between column k and column k+1. Everything
   dropped on the shop floor is placed with this rather than with a typed
   coordinate: an aisle is 160 wide with 120 of shelving either side of
   it, so a number arrived at by eye lands inside a gondola about half the
   time — and a fuel can inside a gondola is a can you cannot pick up. */
const aisleX = k => colX(k) + GOND_W + AISLE_W / 2;

/* the perimeter strips the runs stop short of */
const WEST_WALK = 340;               // ANCHOR_X0..340 is fixture, 340..GX0 is aisle
const EAST_DEPT = 3840;              // GX1..3840 is aisle, 3840..ANCHOR_X1 is chill

/* the runs, north from the front */
const ROWS = [
  { y0: 400,  y1: 1080 },
  { y0: 1220, y1: 1900 },
  { y0: 2040, y1: 2620 },
];
const Y_MAT = 0, Y_TILL = 120, Y_TILLEND = 260, Y_FRONTX = 400;
const Y_BACKX = 2620, Y_BACKXEND = 2760;
const BOH_Y0 = Y_BACKXEND + WALL, BOH_Y1 = ANCHOR_Y1;

/* =====================================================================
   OUTSIDE — heights

   The whole exterior is three horizontal bands and they are all made of
   ceiling heights, because a ceiling height is the only way a Doom-shaped
   engine can draw a band across a facade:

     the SHOPFRONT is what you see under the canopy, floor to soffit
     the FASCIA is the step between the soffit and the canopy edge, which
       is where every tenant's name goes and is exactly one repeat tall
     the PARAPET is everything from the canopy edge up to the sky
   ===================================================================== */
const FLOOR_OUT = 0;
export const FLOOR_WALK = 12;    // the shop floor, and the only thing you stand on
const CEIL_SKY = 480;             // the parapet line: the top of the building
const CEIL_EDGE = 328;            // the outer edge of the canopy
const CEIL_SOFF = 232;            // the soffit over the footway
/* The fascia band is CEIL_EDGE - CEIL_SOFF = 96, and every fascia texture
   in the game is declared 96 tall, so one repeat is exactly one sign.
   It was 32 to begin with, which is one repeat of a 32-tall texture and
   therefore looked correct in isolation and vanished at any distance —
   a fascia is about a fifth of a strip mall's height, not a fifteenth,
   and from the back of a car park a fifteenth is not there at all. */

/* The entrance canopy comes FORWARD. A supermarket entrance is not a
   hole in a flat elevation, it is a porch, and eighty units of it here
   does more to say "the doors are there" than any amount of signage —
   including from the far end of the lot, where it is the only part of
   the parade that breaks the line. */
const PORCH_D = 80;

/* =====================================================================
   THE SIGN BOX

   The logo is a picture, and a picture cannot be a texture here because
   every texture in the game is 64 pixels and the logo does not get an
   exemption. It gets geometry instead: four 64-pixel tiles hung as a
   two-by-two, which in a sector engine means TWO CEILING STEPS for the
   rows and ONE VERTICAL SPLIT for the columns.

   Going south from the tower face, each strip is taller than the one
   behind it, because an upper texture is only visible from the side with
   the higher ceiling:

     the porch     ceil 328    its upper is the BOTTOM row
     strip 1       ceil 440    its upper is the TOP row
     strip 2       ceil 552    its upper is the parapet cap above the sign
     the lot       ceil 640    sky, so the step in it draws nothing

   The strips are six units deep, so the top row stands six units proud
   of the bottom one — about a degree and a half of rake across a
   224-tall sign, and the price of having rows at all. It lands on the
   black band between the roundel and the lettering, where the logo has
   a seam of its own anyway. */
export const SIGN_ROW = 112;                // one tile tall
export const SIGN_H = SIGN_ROW * 2;         // 224
/* The artwork's own aspect, from tools/bake-logo.mjs. Get this wrong and
   the logo is stretched; the smoke test checks it against LOGO_ASPECT. */
export const SIGN_W = 280;                  // 1.25 : 1, and 140 to a tile
const SIGN_STEP = 6;                        // how deep each strip is

/* inside */
export const CEIL_SHOP = 352, CEIL_BOH = 416, CEIL_UNIT = 240;
export const H_GONDOLA = 80;      // taller than you: an aisle is a canyon
export const H_FIXTURE = 40;      // below eye level: the front stays open

/* THE DOORS. Doom's door is 128 tall — two and a bit of you — and so
   is this one; it was 210, three and three quarters of you, and read
   as a hangar. The clear opening is 160, so a leaf runs 80 and stands
   taller than it is wide, the way a sliding leaf does. Above the leaves
   the entrance sector's ceiling comes down to the door top, which turns
   the band between it and the soffit into an upper texture — glazing, a
   TRANSOM — instead of the open air it was. */
const DOOR_TOP = 128;             // how tall a leaf is
const ENTRY_W = 160;              // clear opening, so a leaf runs 80

/* =====================================================================
   THE TENANCIES

   Twenty in-line units, ten each side, and four of them have a name.

   IT WAS SIX, three each side, and fourteen more went in at the user's
   request — seven a side, unbranded. That is a different building: the
   parade was six and a half thousand units long and is nearly thirteen
   now, about three hundred and seventy metres of frontage, and it
   changes what the place IS. Six units either side of a superstore is a
   shopping parade with an anchor on it. Twenty is a STRIP MALL, and the
   difference is that the anchor stops being most of what you can see —
   from the mouth of the car park the building runs off both edges of the
   screen and the store is the lit part in the middle of it.

   WHY UNBRANDED. A named unit is a joke — CHEMIST, KEBAB, PHONES — and
   four jokes along an elevation is a parade with character. Eighteen is
   a comedy routine, and worse, it is eighteen legible words competing
   with the one sign that is supposed to matter. So the new fourteen get
   a painted fascia tray with nothing in it, in six colours, and what
   tells one from the next is what tells one unnamed unit from the next
   in a real parade: whether the lights are on, the roller is down, or
   the glass has been whitewashed from the inside.

   `in` is true for the ones you can walk into, and the rule is now
   visible from the car park: if the lights are on, the door works. The
   rest are a shopfront and nothing behind it, which costs one wall and
   buys the whole read of the place — a parade with two thirds of it dark
   is a parade that has been dying for years, and the anchor going up is
   the last thing that was ever going to happen to it.
   ===================================================================== */
const UNIT_W = 432;
const UNIT_Y1 = 620;                          // in-line units are shallow

/* How many unbranded ones go on each wing, past the ones with names. */
const PLAIN_PER_WING = 7;
/* The three states an unnamed unit can be in, and the six trays somebody
   painted. Both are walked by one index, so the front and the fascia
   move together and the wing does not repeat until the two cycles do. */
const PLAIN_FRONTS = ['UNITGLAS', 'UNITSHUT', 'UNITVOID'];
const PLAIN_FASCIAS = 6;

/** One tenancy with no name on it. Deterministic in its wing and its
 *  index, so two runs of the map put the same shutters in the same
 *  places and a screenshot is a screenshot of something. */
const plainUnit = (side, k) => {
  const i = k * 2 + (side === 'east' ? 1 : 0);
  const front = PLAIN_FRONTS[i % PLAIN_FRONTS.length];
  return {
    name: `${side} unit ${k + 1}`,
    front,
    fascia: 'FASPLAIN' + (i % PLAIN_FASCIAS),
    /* THE LIGHTS ARE THE DOOR. The builder further down lays a sales
       floor, a counter and a back room into any unit with `in` on it,
       and the player finds out which those are by looking: lit glass is
       open, a roller or whitewash is not. */
    in: front === 'UNITGLAS',
  };
};
const plainWing = side => Array.from({ length: PLAIN_PER_WING }, (_, k) => plainUnit(side, k));

/* each wing runs AWAY from the anchor, so the three with names are the
   three nearest the doors — which is also where the rent is */
const WEST_UNITS = [
  { name: 'chemist',    front: 'UNITGLAS', fascia: 'FASCHEM', in: true },
  { name: 'laundrette', front: 'UNITSHUT', fascia: 'FASWASH', in: false },
  { name: 'vacant unit west', front: 'UNITVOID', fascia: 'FASVOID', in: false },
  ...plainWing('west'),
];
const EAST_UNITS = [
  { name: 'kebab shop', front: 'UNITGLAS', fascia: 'FASFOOD', in: true },
  { name: 'phone shop', front: 'UNITGLAS', fascia: 'FASPHON', in: false },
  { name: 'vacant unit east', front: 'UNITSHUT', fascia: 'FASVOID', in: false },
  ...plainWing('east'),
];

/* THE ENDS OF THE PARADE.

   One unit takes UNIT_W of frontage plus the WALL beside it, and that is
   the whole arithmetic — the wall belongs to the unit, not to the joint.
   Writing it as `ANCHOR_X0 - WALL - n * (UNIT_W + WALL)` counts the wall
   next to the anchor twice, which leaves a sixteen-unit void between the
   west wing and the anchor: no sector, so a wall, so the footway is
   severed and the west half of the parade is unreachable on foot. It
   showed up as the fire refusing to spread west while spreading three
   thousand units east, which is the kind of symptom that takes an hour
   to trace back to an off-by-one in a constant. */
export const PARADE_X0 = ANCHOR_X0 - WEST_UNITS.length * (UNIT_W + WALL);
export const PARADE_X1 = ANCHOR_X1 + EAST_UNITS.length * (UNIT_W + WALL);

/* =====================================================================
   THE CAR PARK

   Bays are drawn with a TEXTURE, not with a sector each. One repeat of
   BAYROW is one bay — 186 across, 180 deep — so a row of forty is one
   rectangle with the right floor on it, and moving a row is changing one
   number instead of forty. The cars are then placed on the same pitch by
   the same arithmetic, which is the only way they stay in the bays.
   ===================================================================== */
const BAY_W = 186, BAY_D = 180, LANE_D = 160;
/* THE LOT IS AS LONG AS THE PARADE AND THEN SOME, and it is derived
   rather than typed. The wood down each flank of the building is the
   strip between the lot's edge and the end of the parade, so a parade
   longer than its own car park is a rectangle with a negative width and
   a map that will not build — which is exactly what two hand-typed
   numbers bought the moment fourteen units went in under them. */
const LOT_MARGIN = 280;                      // tarmac past the last pier
const LOT_X0 = PARADE_X0 - LOT_MARGIN, LOT_X1 = PARADE_X1 + LOT_MARGIN;
const CANOPY_Y = -136;                       // the outer edge of the canopy
const FIRELANE_Y = CANOPY_Y - LANE_D;        // -296: nobody parks here
/* THE ROADS, WHICH ARE NOW A RING.

   There were two of them and they did not meet. A frontage lane along
   the front of the lot that stopped dead at both ends, and a traversal
   road across the far end that ran on through the wood — two roads, four
   loose ends, and nothing joining them, which is fine until you stand at
   the west end of the lot and look at where the tarmac simply stops.

   At the user's request it is a PERIMETER ROAD now: one loop all the way
   round the car park, four straights and four junctions, with the
   through road crossing it at the bottom corners and carrying on into
   the trees in both directions. Which is what a lot this size has —
   nobody drives through a strip mall's parking, they drive round the
   edge of it and turn in — and it is also the only firebreak in the
   wood, so the loop is the shape of the safe ground.

     RING_X0 ┌──────── the frontage lane ────────┐ RING_X1
             │ ┌───────────────────────────────┐ │
      west   │ │          seven rows           │ │  east
       leg   │ │           of bays             │ │   leg
             │ └───────────────────────────────┘ │
    ═════════╪═══════ the traversal road ════════╪═════════  on into
             SW                                  SE           the wood

   Every straight is five strips — an edge line, a lane, the centre line,
   a lane, an edge line — and every junction is a box with NO centre line
   in it and its edge lines turning the corner. See `roadRun` and
   `roadBox`, and the notes on them for why those are two functions and
   not one. */
const ROAD_D = 300;
const ROAD_LINE = 6;                         // how wide a painted line is
const ROAD_Y1 = FIRELANE_Y, ROAD_Y0 = FIRELANE_Y - ROAD_D;
/* the outside of the loop: the lot, and a road's width past it */
const RING_X0 = LOT_X0 - ROAD_D, RING_X1 = LOT_X1 + ROAD_D;

/* Seven rows in three back-to-back pairs and a single, with a driving
   lane between each pair. Written as a script so the lot reads top to
   bottom the way you drive into it. */
const LOT_PLAN = [
  { kind: 'bay',  n: 1 },        // -296
  { kind: 'lane' },
  { kind: 'bay',  n: 2 },        // back to back
  { kind: 'lane' },
  { kind: 'bay',  n: 2 },
  { kind: 'lane' },
  { kind: 'bay',  n: 2 },
];

/* =====================================================================
   FUEL

   Everything indoors has SOME, because a cell with none can never catch
   and would leave a permanent hole in the burn. The car park is the only
   zero on the list and it is a zero on purpose.
   ===================================================================== */
/* The footway is the odd one, and it is worth saying why it holds more
   than an aisle does. Percolation in a WIDE region is two-dimensional and
   forgiving: a burning cell in a 160-wide aisle has neighbours in every
   direction and a front that stalls in one place carries on in another.
   The footway is eighty deep and six and a half thousand long — two and a
   half cells wide — so it is very nearly one-dimensional, and a
   one-dimensional front only has to fail ONCE to fail for good.

   At the same fuel as an aisle it made it to the neighbouring units about
   half the time, which is the worst possible answer: "the whole parade
   burns eventually" stops being a property and becomes a coin flip you
   cannot see. So there is more to burn out here than the geometry alone
   would suggest — litter, the mats, the bins, the trolleys — and the fuse
   lights every time. */
const FUEL = {
  none: 0, footway: 120, walk: 55, front: 62, corridor: 62,
  gondola: 300, produce: 150, bakery: 210, chill: 90, deli: 120,
  stock: 340, dock: 190, office: 200,
  unit: 240, kitchen: 330,
};

export function buildSellWrong() {
  const mb = new MapBuilder('SELLWRONG');
  const rm = new RectMap(mb);
  const carSlots = [];

  /* =================================================================
     THE CAR PARK
     ================================================================= */
  const lot = (name, extra = {}) => ({
    /* A supermarket car park at night is FLOODLIT — that is the whole
       point of one — so this is the brightest sector in the level and the
       store is the dark thing you are walking into. Getting this wrong the
       first time made the parade a black mass at any distance and taught
       me that "it is night" is not a lighting design. */
    floor: FLOOR_OUT, ceil: CEIL_SKY, light: 0.74, outdoor: true,
    floorTex: 'ASPHALT', ceilTex: 'SKY', wallTex: 'STORBASE',
    upperTex: 'STORWALL', lowerTex: 'KERB', fuel: FUEL.none, name, ...extra,
  });

  /* The fire lane, hard up against the canopy, with the entrance porch
     pushed out into it. Three pieces, because the porch is a rectangle
     that has to not be fire lane. */
  const PORCH_X0 = 1756, PORCH_X1 = 2524;
  const PORCH_Y = CANOPY_Y - PORCH_D;                  // the tower face
  const SIGN_X0 = (PORCH_X0 + PORCH_X1 - SIGN_W) / 2;  // centred on the doors
  const SIGN_XM = SIGN_X0 + SIGN_W / 2, SIGN_X1 = SIGN_X0 + SIGN_W;
  const S1_Y = PORCH_Y - SIGN_STEP, S2_Y = S1_Y - SIGN_STEP;
  const TALL_X0 = SIGN_X0 - 60, TALL_X1 = SIGN_X1 + 60, TALL_Y = S2_Y - 48;
  const lane = (extra = {}) => lot('fire lane', { floorTex: 'HATCHKEEP', ...extra });

  rm.add(RING_X0, FIRELANE_Y, PORCH_X0, CANOPY_Y, lane());
  rm.add(PORCH_X1, FIRELANE_Y, RING_X1, CANOPY_Y, lane());
  /* the lane in front of the tower, carved round the sign box */
  rm.add(PORCH_X0, FIRELANE_Y, TALL_X0, PORCH_Y, lane());
  rm.add(TALL_X1, FIRELANE_Y, PORCH_X1, PORCH_Y, lane());
  rm.add(TALL_X0, FIRELANE_Y, TALL_X1, TALL_Y, lane());
  /* A taller piece of sky in front of the sign, so the top of the box has
     somewhere to be. Both this and its neighbours have a sky ceiling, so
     the step between them draws nothing at all. */
  rm.add(TALL_X0, TALL_Y, TALL_X1, S2_Y, lane({ ceil: 640 }));
  rm.add(TALL_X0, S2_Y, SIGN_X0, PORCH_Y, lane());
  rm.add(SIGN_X1, S2_Y, TALL_X1, PORCH_Y, lane());

  /* the two strips: the top row of the logo, then the cap above it */
  /* NOT A SKY CEILING, and that is the whole trick. A line between two
     sectors that both have sky overhead draws no upper at all — which is
     right everywhere else (it is how a step in the sky stays invisible)
     and is exactly wrong here, because the upper IS the sign. Both
     strips inherit from `lot`, so both were sky, so both rows of the
     logo were silently not built. */
  const signStrip = (name, ceil, upper) => ({
    ...lot(name), ceil, upperTex: upper,
    floorTex: 'CONCRETE', ceilTex: 'SOFFIT',
  });
  /* NEAREST THE TOWER IS THE TOP ROW, and it has to be: each strip's
     upper texture is the band between ITS ceiling and the ceiling of the
     thing behind it, so the order is porch, then the row above it, then
     the cap. Putting the cap next to the porch instead makes the gap
     between porch and cap 224 units tall, which is two repeats of a
     112-tall tile — and the sign renders the bottom half of the logo
     twice, once squashed, which is exactly what it did. */
  rm.add(SIGN_X0, S1_Y, SIGN_XM, PORCH_Y, signStrip('sign box', 328 + SIGN_ROW, 'LOGO0'));
  rm.add(SIGN_XM, S1_Y, SIGN_X1, PORCH_Y, signStrip('sign box', 328 + SIGN_ROW, 'LOGO1'));
  rm.add(SIGN_X0, S2_Y, SIGN_X1, S1_Y, signStrip('sign cap', 328 + SIGN_H, 'PARAPET'));

  /* =================================================================
     THE ROAD, AND WHAT IS PAINTED ON IT

     A ROAD IS FIVE STRIPS: an edge line, a lane, the centre line, a
     lane, an edge line. They are sectors of their own because a floor is
     textured to the WORLD grid — u is x/64 and v is y/64 — so a 64-unit
     tile cannot hold one line across a 300-unit road. A strip six units
     wide wearing a tile that is line all the way through can, and that
     is the whole trick.

     And it is why `along` exists. The same world-grid mapping means a
     texture whose dash runs along x draws a SOLID stripe down a road
     running along y, so the two legs of the ring want ROADLINV and the
     two straights want ROADLINE. One function, one flag, rather than two
     functions that drift apart.
     ================================================================= */
  const tarmac = (x0, y0, x1, y1, tex, name, extra) =>
    rm.add(x0, y0, x1, y1, lot(name, { floorTex: tex, light: 0.56, ...extra }));

  const roadRun = (x0, y0, x1, y1, along, tag, extra = {}) => {
    const L = ROAD_LINE, H = 3;                  // the edge lines, and half a centre
    if (along === 'x') {
      const m = (y0 + y1) / 2;
      tarmac(x0, y0, x1, y0 + L, 'ROADEDGE', `road edge, ${tag}`, extra);
      tarmac(x0, y0 + L, x1, m - H, 'ROADTAR', `road, ${tag}`, extra);
      tarmac(x0, m - H, x1, m + H, 'ROADLINE', `road centre, ${tag}`, extra);
      tarmac(x0, m + H, x1, y1 - L, 'ROADTAR', `road, ${tag}`, extra);
      tarmac(x0, y1 - L, x1, y1, 'ROADEDGE', `road edge, ${tag}`, extra);
    } else {
      const m = (x0 + x1) / 2;
      tarmac(x0, y0, x0 + L, y1, 'ROADEDGE', `road edge, ${tag}`, extra);
      tarmac(x0 + L, y0, m - H, y1, 'ROADTAR', `road, ${tag}`, extra);
      tarmac(m - H, y0, m + H, y1, 'ROADLINV', `road centre, ${tag}`, extra);
      tarmac(m + H, y0, x1 - L, y1, 'ROADTAR', `road, ${tag}`, extra);
      tarmac(x1 - L, y0, x1, y1, 'ROADEDGE', `road edge, ${tag}`, extra);
    }
  };

  /**
   * A JUNCTION, which is the part that is always left out and is the
   * part that makes a road look like a road.
   *
   * Two things happen at one and they are both ABSENCES. There is no
   * centre line through it, because you do not paint a lane divider
   * across the place two streams of traffic cross — a ring road with the
   * dashes carried straight through its own corners reads as two roads
   * laid on top of each other. And the edge lines TURN: they run down
   * whichever sides are still kerb and stop dead at the sides that are a
   * mouth, which is what draws the corner.
   *
   * `open` is the sides that are mouths, as letters of NSEW; everything
   * else gets an edge line. `give` is the one mouth that has to give way
   * — the minor road's, at a T — and gets a bar across it.
   *
   * The decomposition is four strips and a middle, with the east and
   * west ones taking the full height so the corners belong to somebody.
   */
  const roadBox = (x0, y0, x1, y1, open, tag, extra = {}) => {
    const L = ROAD_LINE;
    const shut = d => !open.includes(d);
    const ax0 = x0 + (shut('W') ? L : 0), ax1 = x1 - (shut('E') ? L : 0);
    const ay0 = y0 + (shut('S') ? L : 0), ay1 = y1 - (shut('N') ? L : 0);
    if (shut('W')) tarmac(x0, y0, ax0, y1, 'ROADEDGE', `junction kerb, ${tag}`, extra);
    if (shut('E')) tarmac(ax1, y0, x1, y1, 'ROADEDGE', `junction kerb, ${tag}`, extra);
    if (shut('S')) tarmac(ax0, y0, ax1, ay0, 'ROADEDGE', `junction kerb, ${tag}`, extra);
    if (shut('N')) tarmac(ax0, ay1, ax1, y1, 'ROADEDGE', `junction kerb, ${tag}`, extra);
    /* and the give way across the mouth of the minor road, inside the
       box so the major road's own markings are untouched by it */
    const B = 10;
    if (extra.give === 'N') {
      tarmac(ax0, ay1 - B, ax1, ay1, 'ROADGIVE', `give way, ${tag}`, extra);
      tarmac(ax0, ay0, ax1, ay1 - B, 'ROADTAR', `junction, ${tag}`, extra);
    } else if (extra.give === 'S') {
      tarmac(ax0, ay0, ax1, ay0 + B, 'ROADGIVE', `give way, ${tag}`, extra);
      tarmac(ax0, ay0 + B, ax1, ay1, 'ROADTAR', `junction, ${tag}`, extra);
    } else {
      tarmac(ax0, ay0, ax1, ay1, 'ROADTAR', `junction, ${tag}`, extra);
    }
  };

  /* THE FRONTAGE LANE and its two corners. The corners are shut on the
     outside and on the top — the wood is on both — and open to the
     straight beside them and to the leg below. */
  roadBox(RING_X0, ROAD_Y0, LOT_X0, ROAD_Y1, 'ES', 'the north-west corner');
  roadRun(LOT_X0, ROAD_Y0, LOT_X1, ROAD_Y1, 'x', 'the frontage lane');
  roadBox(LOT_X1, ROAD_Y0, RING_X1, ROAD_Y1, 'WS', 'the north-east corner');

  /* and then the rows, walking south */
  let y = ROAD_Y0;
  const bayRows = [];
  for (const step of LOT_PLAN) {
    if (step.kind === 'lane') {
      rm.add(LOT_X0, y - LANE_D, LOT_X1, y, lot('driving lane'));
      y -= LANE_D;
      continue;
    }
    for (let i = 0; i < step.n; i++) {
      const y0 = y - BAY_D;
      /* Rows in a back-to-back pair face each other, which the texture
         cannot know — so the row records which way its cars point and
         the parking is done from that. */
      bayRows.push({ y0, y1: y, facing: i === 0 ? -Math.PI / 2 : Math.PI / 2 });
      /* ANCHORED TO THE ROW, not to the world. One repeat of BAYROW is
         one bay — 186 by 180, line down the left edge — so where the
         repeat starts is where the bays start. Tiled from the world
         origin it landed five units off the middle of every bay in the
         lot, and seventy-seven cars parked on the line rather than
         between two of them. With the row's own corner as the origin,
         bay i is LOT_X0 + i * BAY_W across and the row deep, which is
         exactly what the parking below already assumed. */
      rm.add(LOT_X0, y0, LOT_X1, y,
        lot('bays', { floorTex: 'BAYROW', floorAnchor: [LOT_X0, y] }));
      y -= BAY_D;
    }
  }
  /* THE TWO LEGS OF THE RING, down the outside of the bays. They are
     the only north-south roads on the map, which is why ROADLINV exists
     at all — see roadRun. */
  roadRun(RING_X0, y, LOT_X0, ROAD_Y0, 'y', 'the west leg');
  roadRun(LOT_X1, y, RING_X1, ROAD_Y0, 'y', 'the east leg');

  /* THE TRAVERSAL ROAD, where the bays stop, and the two T-junctions at
     the ends of it where the legs come down and the through road carries
     on into the trees. South of it the verge and the spot you are
     standing in when the game starts — so the opening shot is across a
     road, over a car park, at a supermarket, which is what arriving at
     one looks like. */
  const THRU_Y1 = y, THRU_Y0 = y - ROAD_D;
  roadBox(RING_X0, THRU_Y0, LOT_X0, THRU_Y1, 'NEW', 'the south-west junction',
          { give: 'N' });
  roadRun(LOT_X0, THRU_Y0, LOT_X1, THRU_Y1, 'x', 'across the lot');
  roadBox(LOT_X1, THRU_Y0, RING_X1, THRU_Y1, 'NEW', 'the south-east junction',
          { give: 'N' });
  const VERGE_Y1 = THRU_Y0;
  const LOT_Y0 = VERGE_Y1 - 460;

  /* THERE WAS A PYLON SIGN HERE, at 980 across and 200 north of the
     mouth, and it is gone at the user's request. It was built as a
     HOLE — a ring of four thin sectors round a 96-unit void, so all
     four faces of the void were one-sided walls carrying the sign,
     which is the only freestanding object a sector engine can make
     without inventing a new primitive. Worth writing down, because the
     trick is still the right one and the next thing that has to stand
     up on its own out here will be built the same way.

     What replaced eight rectangles is one: the verge runs clean from
     the road to the mouth. */
  rm.add(RING_X0, LOT_Y0, RING_X1, VERGE_Y1, lot('verge'));

  /* =================================================================
     THE CANOPY AND THE FOOTWAY

     Two strips running the whole parade. The canopy edge sits at lot
     level so the kerb step happens UNDER it, which is what a strip mall
     does and what makes the fascia read as a band rather than as the top
     of a wall. Between the two: a fascia exactly one repeat tall.
     ================================================================= */
  const edgeProps = name => ({
    floor: FLOOR_OUT, ceil: CEIL_EDGE, light: 0.70, outdoor: true, sky: 0.7,
    floorTex: 'ASPHALT', ceilTex: 'SOFFIT', wallTex: 'PILASTER',
    upperTex: 'PARAPET',                 // what the lot sees above the canopy
    lowerTex: 'KERB', fuel: FUEL.none, name,
  });
  const walkProps = (name, front, fascia, light) => ({
    /* A lid over your head and open on one side: not a room, not the
       open air. The soffit downlights are why it is lit at all. */
    floor: FLOOR_WALK, ceil: CEIL_SOFF, light, outdoor: true, sky: 0.55,
    floorTex: 'CONCRETE', ceilTex: 'SOFFIT', wallTex: front,
    upperTex: fascia,                    // the sign band, seen from the lot
    lowerTex: 'KERB', fuel: FUEL.footway, name,
  });

  /* Every tenancy contributes one canopy-edge segment and one footway
     segment; between them sits a PIER, which is a 16-wide void in the
     canopy edge only — the footway runs through unbroken so you can walk
     the whole parade, and the pier stands at the kerb line where a pier
     goes. */
  const bays = [];             // [x0, x1, front, fascia, name, enterable]
  {
    let x = PARADE_X0;
    for (let i = WEST_UNITS.length - 1; i >= 0; i--) {
      const u = WEST_UNITS[i];
      bays.push({ x0: x, x1: x + UNIT_W, ...u });
      x += UNIT_W + WALL;
    }
    bays.push({ x0: ANCHOR_X0, x1: ANCHOR_X1, name: 'sellwrong',
                front: 'STORGLAS', fascia: 'BRANDBAND', in: true, anchor: true });
    x = ANCHOR_X1 + WALL;
    for (const u of EAST_UNITS) {
      bays.push({ x0: x, x1: x + UNIT_W, ...u });
      x += UNIT_W + WALL;
    }
  }

  /* one footway strip per tenancy, plus a 16-wide brick one at every
     joint, so the pier reads all the way through to the shopfront */
  for (let i = 0; i < bays.length; i++) {
    const b = bays[i];
    const light = b.front === 'UNITGLAS' ? 0.62 : b.anchor ? 0.68 : 0.46;
    rm.add(b.x0, -96, b.x1, -WALL, walkProps(`footway ${b.name}`, b.front, b.fascia, light));
    if (b.anchor) {
      /* Three pieces, and the middle one comes forward over the doors —
         except the middle one is itself four, because the two under the
         sign carry the bottom row of the logo as their upper texture and
         a sector has exactly one of those. */
      rm.add(b.x0, CANOPY_Y, PORCH_X0, -96, edgeProps(`canopy ${b.name}`));
      rm.add(PORCH_X1, CANOPY_Y, b.x1, -96, edgeProps(`canopy ${b.name}`));
      rm.add(PORCH_X0, PORCH_Y, SIGN_X0, -96, edgeProps('entrance porch'));
      rm.add(SIGN_X1, PORCH_Y, PORCH_X1, -96, edgeProps('entrance porch'));
      rm.add(SIGN_X0, PORCH_Y, SIGN_XM, -96,
        { ...edgeProps('entrance porch'), upperTex: 'LOGO2' });
      rm.add(SIGN_XM, PORCH_Y, SIGN_X1, -96,
        { ...edgeProps('entrance porch'), upperTex: 'LOGO3' });
    } else {
      rm.add(b.x0, CANOPY_Y, b.x1, -96, edgeProps(`canopy ${b.name}`));
    }
    if (i + 1 < bays.length) {
      const jx = b.x1;
      rm.add(jx, -96, jx + WALL, -WALL, walkProps('pier', 'PILASTER', 'PARAPET', 0.42));
      /* and NOT a canopy-edge rect over the joint: that void is the pier */
    }
  }
  /* the two ends of the parade get a pier as well */
  rm.add(PARADE_X0 - WALL, -96, PARADE_X0, -WALL, walkProps('pier', 'PILASTER', 'PARAPET', 0.42));
  rm.add(PARADE_X1, -96, PARADE_X1 + WALL, -WALL, walkProps('pier', 'PILASTER', 'PARAPET', 0.42));

  /* =================================================================
     THE ANCHOR — the shop floor
     ================================================================= */
  const shop = (name, light, fuel, extra = {}) => ({
    floor: FLOOR_WALK, ceil: CEIL_SHOP, light,
    floorTex: 'LINO', ceilTex: 'CEILFIT', wallTex: 'WALLPANL',
    upperTex: 'WALLPANL', lowerTex: 'WALLPANL', fuel, name, ...extra,
  });

  /* --- the way in: two sets of sliders, and the mullion between them - */
  const ENT_A0 = 1908, ENT_B0 = 2212;               // centred where they always were
  const entryProps = n => ({
    /* the ceiling is the door head: what is above it is the transom,
       drawn as this sector's upper on both faces of the wall */
    floor: FLOOR_WALK, ceil: DOOR_TOP, light: 0.66,
    floorTex: 'LINO', ceilTex: 'CEILTILE', wallTex: 'STORGLAS',
    upperTex: 'STORGLAS', lowerTex: 'STORBASE', fuel: FUEL.walk, name: n,
  });
  const entryA = rm.add(ENT_A0, -WALL, ENT_A0 + ENTRY_W, 0, entryProps('entrance'));
  const entryB = rm.add(ENT_B0, -WALL, ENT_B0 + ENTRY_W, 0, entryProps('exit'));

  /* --- front end ---------------------------------------------------- */
  const mat = rm.add(ANCHOR_X0, Y_MAT, ANCHOR_X1, Y_TILL,
    shop('entrance mat', 0.34, FUEL.front, { floorTex: 'LINOWORN' }));

  /* eight tills across the front, and the lanes between them */
  {
    let cur = ANCHOR_X0;
    for (let k = 0; k < NTILL; k++) {
      const a = GX0 + k * TILL_PITCH, b = a + TILL_W;
      if (a > cur) rm.add(cur, Y_TILL, a, Y_TILLEND, shop('checkout lane', 0.30, FUEL.front));
      rm.add(a, Y_TILL, b, Y_TILLEND, shop('checkout', 0.28, FUEL.front, {
        floor: H_FIXTURE, floorTex: 'CHECKOUT', lowerTex: 'CHECKOUT',
      }));
      cur = b;
    }
    rm.add(cur, Y_TILL, ANCHOR_X1, Y_TILLEND, shop('checkout lane', 0.30, FUEL.front));
  }
  rm.add(ANCHOR_X0, Y_TILLEND, ANCHOR_X1, Y_FRONTX, shop('front cross-aisle', 0.30, FUEL.walk));

  /* --- the runs ------------------------------------------------------
     Three rows of twelve. The facing on a gondola alternates by run and
     by column so that no two neighbours are the same picture, which at
     twelve columns is the difference between a supermarket and a
     wallpaper sample. */
  const FACINGS = ['SHELFSTK', 'SHELFMIX', 'SHELFEMP'];
  ROWS.forEach((row, ri) => {
    const { y0, y1 } = row;
    /* the west walkway, between the perimeter department and column 0 */
    rm.add(WEST_WALK, y0, GX0, y1, shop('aisle', 0.24, FUEL.walk));
    for (let k = 0; k < NCOL; k++) {
      const a = colX(k), b = a + GOND_W;
      rm.add(a, y0, b, y1, shop('gondola', 0.24, FUEL.gondola, {
        floor: H_GONDOLA, floorTex: 'SHELFBAK',
        lowerTex: FACINGS[(ri + k) % FACINGS.length],
      }));
      if (k + 1 < NCOL) rm.add(b, y0, colX(k + 1), y1, shop('aisle', 0.24, FUEL.walk));
    }
    rm.add(GX1, y0, EAST_DEPT, y1, shop('aisle', 0.25, FUEL.walk));
  });

  rm.add(ANCHOR_X0, ROWS[0].y1, ANCHOR_X1, ROWS[1].y0, shop('mid cross-aisle', 0.28, FUEL.walk));
  rm.add(ANCHOR_X0, ROWS[1].y1, ANCHOR_X1, ROWS[2].y0, shop('rear cross-aisle', 0.26, FUEL.walk));

  /* --- perimeter departments ---------------------------------------
     The west strip is bench height so that side of the store stays open;
     the east strip is chill, and the middle run of it is freezer doors
     at full gondola height so the east wall is not one long low shelf.

     FRUIT AND VEG IS BINS, and it is the one department here that is not
     a single long fixture. A chiller is a cabinet and a bakery case is a
     cabinet; produce is a ROW OF OPEN CRATES, one category to a crate,
     and the way anybody shops it is by looking down into them. Built as
     a single rect wearing one texture it came out as a bench, and worse
     than that: a fixture is a raised floor, its floor texture is what
     you see from beside it, and every one of these had SHELFBAK on
     top — gondola steel — because that is what a fixture's top has
     always been in here and nothing had ever been looked down at.

     So the strip is cut into a bin per category, with a crate rim
     between each pair standing eight units proud. Eight is enough to
     throw a shadow line and read as separate boxes from the end of the
     aisle, and low enough that the run still reads as one department
     from the front of the store. */
  const BIN_RIM = 24;               // how deep the timber between two bins is
  const BIN_LIP = 8;                // and how far it stands over the produce
  /* One step is a bin AND the rim after it, so the last bin's rim falls
     off the end and the run finishes flush with the department. */
  const binRun = (y0, y1, kinds, light, fuel) => {
    const step = (y1 - y0 + BIN_RIM) / kinds.length;
    kinds.forEach((k, i) => {
      const a = Math.round(y0 + i * step);
      const b = Math.round(y0 + (i + 1) * step - BIN_RIM);
      /* ANCHORED TO THE BIN, not to the world, for the reason the
         parking bays are: a packing that starts at the crate edge is a
         crate of apples, and one that starts wherever the world grid
         falls is apples that happen to be near a crate. */
      rm.add(ANCHOR_X0, a, WEST_WALK, b, shop(k.name, light, fuel, {
        floor: H_FIXTURE, floorTex: k.tex, floorAnchor: [ANCHOR_X0, b],
        lowerTex: 'PRODRIM',
      }));
      if (i + 1 < kinds.length)
        rm.add(ANCHOR_X0, b, WEST_WALK, Math.round(y0 + (i + 1) * step),
          shop(`${k.name} rim`, light, fuel, {
            floor: H_FIXTURE + BIN_LIP, floorTex: 'PRODRIM', lowerTex: 'PRODRIM',
          }));
    });
  };

  const WEST = [
    /* PRODUCE IS THE BRIGHTEST DEPARTMENT IN A SUPERMARKET and that is
       not decoration, it is the trade: fruit under a dim fitting looks
       like fruit nobody wants. It is the one part of a store lit above
       the sales floor rather than with it, so it is lit above the sales
       floor here — brighter than the aisles, brighter than the bakery,
       and the only warm thing left on this side of the building. */
    { name: 'produce', fuel: FUEL.produce, light: 0.42, bins: [
      { name: 'apples', tex: 'PRODAPPL' }, { name: 'citrus', tex: 'PRODCITR' },
      { name: 'greens', tex: 'PRODGREN' }, { name: 'roots',  tex: 'PRODROOT' },
    ] },
    { name: 'bakery',  fuel: FUEL.bakery,  tex: 'BAKECASE', h: H_FIXTURE, light: 0.34 },
    { name: 'flowers', fuel: FUEL.produce, light: 0.36, bins: [
      { name: 'flowers', tex: 'PRODFLOW' }, { name: 'flowers', tex: 'PRODFLOW' },
      { name: 'flowers', tex: 'PRODFLOW' },
    ] },
  ];
  const EAST = [
    { name: 'chiller', fuel: FUEL.chill, tex: 'CHILLER',  h: H_FIXTURE, light: 0.36 },
    { name: 'freezer', fuel: FUEL.chill, tex: 'FREEZDOR', h: H_GONDOLA, light: 0.40 },
    { name: 'dairy',   fuel: FUEL.chill, tex: 'CHILLER',  h: H_FIXTURE, light: 0.36 },
  ];
  ROWS.forEach((row, ri) => {
    const w = WEST[ri], e = EAST[ri];
    if (w.bins) binRun(row.y0, row.y1, w.bins, w.light, w.fuel);
    else rm.add(ANCHOR_X0, row.y0, WEST_WALK, row.y1, shop(w.name, w.light, w.fuel, {
      floor: w.h, floorTex: 'SHELFBAK', lowerTex: w.tex,
    }));
    rm.add(EAST_DEPT, row.y0, ANCHOR_X1, row.y1, shop(e.name, e.light, e.fuel, {
      floor: e.h, floorTex: 'SHELFBAK', lowerTex: e.tex,
    }));
  });

  /* --- the back cross-aisle ------------------------------------------
     THERE WAS A DELI COUNTER HERE and it is gone at the user's request:
     a thousand units of case between the west walkway and the middle of
     the shop, mirroring the butchery further east. What replaces it is
     FLOOR, which the back of the store had very little of — the strip
     that joins the west fire exit to the staff door to the east fire
     exit ran the whole width of the building and half of it was
     counter. The butchery stays, because one counter down there reads
     as a department and two read as a wall. */
  rm.add(ANCHOR_X0, Y_BACKX, 2900, Y_BACKXEND, shop('back cross-aisle', 0.21, FUEL.walk));
  rm.add(2900, Y_BACKX, 3600, Y_BACKXEND, shop('butchery', 0.28, FUEL.deli, {
    floor: H_FIXTURE, floorTex: 'SHELFBAK', lowerTex: 'DELICASE',
  }));
  rm.add(3600, Y_BACKX, ANCHOR_X1, Y_BACKXEND, shop('back cross-aisle', 0.20, FUEL.walk));

  /* =================================================================
     BACK OF HOUSE

     Different ramps entirely: rust, brown and bare concrete, no paint
     and no branding. Crossing the swing door should feel like leaving
     the part of the building that was ever meant for you.
     ================================================================= */
  const boh = (name, light, fuel, extra = {}) => ({
    floor: FLOOR_WALK, ceil: CEIL_BOH, light,
    floorTex: 'STOCKFLR', ceilTex: 'CEILDECK', wallTex: 'STOCKWAL',
    upperTex: 'STOCKWAL', lowerTex: 'STOCKWAL', fuel, name, ...extra,
  });

  rm.add(ANCHOR_X0, BOH_Y0, 1800, BOH_Y1, boh('stockroom', 0.16, FUEL.stock));
  rm.add(1816, BOH_Y0, 2900, BOH_Y1, boh('loading dock', 0.18, FUEL.dock, { wallTex: 'DOCKDOOR' }));
  rm.add(2916, BOH_Y0, ANCHOR_X1, BOH_Y1, boh('office', 0.22, FUEL.office, {
    floorTex: 'LINOWORN', wallTex: 'TILEWALL', upperTex: 'TILEWALL', lowerTex: 'TILEWALL',
  }));
  rm.add(1800, BOH_Y0 + 120, 1816, BOH_Y1 - 120, boh('stock to dock', 0.18, FUEL.corridor));
  rm.add(2900, BOH_Y0 + 120, 2916, BOH_Y1 - 160, boh('dock to office', 0.18, FUEL.corridor));

  /* =================================================================
     THE FIRE EXITS

     Six of them, and they are the single biggest change the shop floor
     has ever had, because they are the difference between a crowd that
     dies where it stands and a crowd that GETS OUT. Everything about
     them follows from that.

     WHERE. At the ends of the three cross-aisles, west and east, because
     that is where a real supermarket puts them and because it is the
     only place they can go: the perimeter of this building is fixtures —
     produce bins, the bakery case, the chill wall, the freezers — and a
     door in the middle of a run of chillers opens onto the top of a
     chiller. A cross-aisle is walkable floor that reaches the outside
     wall, and there are exactly three of them.

     WHAT IS ON THE OTHER SIDE. The flanks of the parade, which are
     wood. So a shopper who makes it out is in the trees at the side of
     the building, in the dark, and there are nine thousand units of
     forest for them to be somewhere in. That is the hunt, and it is
     free: no new geometry, and the wood already burns.

     WHAT MAKES THEM READ AS AN EXIT AND NOT A HOLE: they are LIT. The
     cross-aisles are at 0.26 and these are at 0.62, so the end of the
     aisle glows and you can see from the middle of the shop where the
     crowd is going. That is the whole signage budget, and it is more
     legible than a sign would be — see js/textures.js on why the green
     man is on the leaf and there is no word anywhere.

     The leaf itself swings, is shut all night, and opens for anybody
     running — js/slidedoor.js. */
  const EXIT_W = 104;                  // one leaf, and a leaf is a person and a bit
  const exits = [];
  const exitProps = n => ({
    /* the ceiling is the door head, exactly like the entrance: a shut
       leaf has to be the whole of the opening or you can see over it */
    floor: FLOOR_WALK, ceil: DOOR_TOP, light: 0.62,
    floorTex: 'CONCRETE', ceilTex: 'CEILTILE',
    wallTex: 'STOCKWAL', upperTex: 'STOCKWAL', lowerTex: 'KERB',
    fuel: FUEL.walk, name: n,
  });
  /* Every cross-aisle's middle, which is also every exit's middle. */
  const EXIT_Y = [
    (ROWS[0].y1 + ROWS[1].y0) / 2,     // 1150, between run one and run two
    (ROWS[1].y1 + ROWS[2].y0) / 2,     // 1970, between run two and run three
    (Y_BACKX + Y_BACKXEND) / 2,        // 2690, the back cross-aisle past the butchery
  ];
  const WHICH = ['mid', 'rear', 'back'];
  EXIT_Y.forEach((cy, i) => {
    const a = cy - EXIT_W / 2, b = cy + EXIT_W / 2;
    /* WEST. The opening is declared left to right AS SEEN FROM OUTSIDE,
       which standing in the wood looking east means north to south — and
       that is what puts the outward normal on the west side and swings
       the leaf away from the building. Get it backwards and the door
       opens into the shop, into the crowd coming at it. */
    const w = rm.add(ANCHOR_X0 - WALL, a, ANCHOR_X0, b, exitProps(`fire exit west, ${WHICH[i]}`));
    exits.push({ rect: w, x: ANCHOR_X0 - WALL / 2, y0: b, y1: a, out: [ANCHOR_X0 - 140, cy] });
    /* EAST, mirrored: outside is the far side, so left to right is south
       to north. */
    const e = rm.add(ANCHOR_X1, a, ANCHOR_X1 + WALL, b, exitProps(`fire exit east, ${WHICH[i]}`));
    exits.push({ rect: e, x: ANCHOR_X1 + WALL / 2, y0: a, y1: b, out: [ANCHOR_X1 + 140, cy] });
  });

  /* the swing door out of the shop floor */
  const staffDoor = rm.add(700, Y_BACKXEND, 820, BOH_Y0, {
    floor: FLOOR_WALK, ceil: FLOOR_WALK, light: 0.46,      // shut: ceiling on the floor
    floorTex: 'STOCKFLR', ceilTex: 'CEILDECK', wallTex: 'DOORSTAF',
    upperTex: 'DOORSTAF', lowerTex: 'DOORSTAF',
    fuel: FUEL.corridor, dynamic: true, name: 'staff door',
    special: { kind: 'door', openTo: 152, speed: 4, wait: 140 },
  });
  /* and the roller shutter the night crew left open */
  rm.add(2400, Y_BACKXEND, 2560, BOH_Y0, boh('shutter opening', 0.18, FUEL.corridor, {
    ceil: 136, wallTex: 'DOCKDOOR', upperTex: 'DOCKDOOR', lowerTex: 'DOCKDOOR',
  }));

  /* =================================================================
     THE NEIGHBOURS

     Two of the six are open. They are small, they are full of things
     that burn, and they are on the other side of a footway that has just
     enough fuel to carry a fire — which is the entire reason they exist.
     ================================================================= */
  for (const b of bays) {
    if (b.anchor || !b.in) continue;
    const kitchen = b.name === 'kebab shop';
    const base = (name, light, fuel, extra = {}) => ({
      floor: FLOOR_WALK, ceil: CEIL_UNIT, light,
      floorTex: kitchen ? 'TILEWALL' : 'LINO', ceilTex: 'CEILTILE',
      wallTex: kitchen ? 'TILEWALL' : 'WALLPANL',
      upperTex: kitchen ? 'TILEWALL' : 'WALLPANL',
      lowerTex: kitchen ? 'TILEWALL' : 'WALLPANL',
      fuel, name, ...extra,
    });
    const mid = (b.x0 + b.x1) / 2;
    /* the sales floor: a run of shelving down each side and a gangway
       between them, then the counter, then whatever is behind it */
    const shelf = { floor: H_GONDOLA, floorTex: 'SHELFBAK', lowerTex: 'SHELFMIX' };
    rm.add(b.x0, 0, b.x0 + 100, 380, base(`${b.name} shelving`, 0.40, FUEL.unit, shelf));
    rm.add(b.x0 + 100, 0, b.x1 - 100, 380, base(b.name, 0.44, kitchen ? FUEL.kitchen : FUEL.unit));
    rm.add(b.x1 - 100, 0, b.x1, 380, base(`${b.name} shelving`, 0.40, FUEL.unit, shelf));
    /* The counter, with a flap at one end. Without the flap the room
       behind it is a sector nobody can enter — the fire gets in, because
       fire does not step, but the staff cannot come out and you cannot go
       in, and a room like that is scenery pretending to be a room. */
    rm.add(b.x0, 380, b.x1 - 110, 440, base(`${b.name} counter`, 0.40, FUEL.unit, {
      floor: H_FIXTURE, floorTex: 'SHELFBAK', lowerTex: kitchen ? 'DELICASE' : 'CHECKOUT',
    }));
    rm.add(b.x1 - 110, 380, b.x1, 440, base(`${b.name} flap`, 0.42, FUEL.walk));
    rm.add(b.x0, 440, b.x1, UNIT_Y1, base(kitchen ? 'kitchen' : 'dispensary', 0.34,
      kitchen ? FUEL.kitchen : FUEL.office));
    /* THE WAY IN, bridging the shopfront wall — and it carries the
       FOOTWAY'S fuel rather than a walkway's, which is a change the
       parade getting longer forced.

       A doorway is 120 by 16: two or three cells of a thirty-two-unit
       grid, in a line, and it is the ONLY way the fire gets from the
       fuse outside into the unit behind it. At an aisle's fuel the fire
       stalled in exactly one of them out of twenty, and that unit — its
       shelving, its counter, its back room, five regions — never burned
       at all on a map where every other one did. That is the
       one-dimensional failure the note on FUEL.footway is about, in its
       smallest possible form: a front two cells wide only has to fail
       once. So a shop doorway holds what the pavement outside it holds,
       which is also true of a real one: the mat, the menu board, the
       free papers and whatever the wind put there. */
    rm.add(mid - 60, -WALL, mid + 60, 0, base(`${b.name} door`, 0.50, FUEL.footway, {
      ceil: 192, wallTex: 'UNITGLAS', upperTex: 'UNITGLAS', lowerTex: 'STORBASE',
    }));
  }

  /* =================================================================
     THE WOOD

     Everything past the kerb of the car park and the back wall of the
     parade is forest, for nine thousand units in every direction. As
     far as the MAP is concerned it is eight big outdoor rectangles
     that abut the lot and each other, so every edge between them is an
     opening and you can walk out of the car park and keep walking. No
     floor is drawn for them — js/forest.js draws a floor that chars —
     and they carry a `forest` flag so the store's fuel grid stops at
     their edge and leaves the fire in the wood to the wood.

     THE SHAPE IS A RING WITH THE PARADE CUT OUT: strips along all four
     sides of the lot, two flanks running back beside the wings, two
     pockets behind the wings beside the anchor, and a strip behind the
     lot. Every one of them stops a WALL short of a building, which is
     what makes the building's outside walls exist — a one-sided line
     is drawn from whichever side has a sector on it, and out here that
     side is the wood. */
  const FOREST_REACH = 9000;
  const forestRects = [];
  const wood = name => ({
    floor: FLOOR_OUT, ceil: CEIL_SKY, light: 0.52, outdoor: true, sky: 1,
    floorTex: 'NONE', ceilTex: 'SKY', wallTex: 'STORWALL', upperTex: 'STORWALL', lowerTex: 'KERB',
    fuel: FUEL.none, forest: true, name,
  });
  const woodRect = (x0, y0, x1, y1, name) => {
    const r = rm.add(x0, y0, x1, y1, wood(name));
    forestRects.push({ x0, y0, x1, y1 });
    return r;
  };
  const MALL_Y1 = UNIT_Y1 + WALL;              // behind the in-line units
  const BACK_Y = ANCHOR_Y1 + WALL;             // behind the anchor
  const OX0 = RING_X0 - FOREST_REACH, OX1 = RING_X1 + FOREST_REACH;
  const OY0 = LOT_Y0 - FOREST_REACH, OY1 = BACK_Y + FOREST_REACH;
  woodRect(OX0, OY0, OX1, LOT_Y0, 'wood, behind you');
  /* THE THROUGH ROAD carries on past both T-junctions and out through
     the wood until the forest ends. It is the same five strips as the
     traversal road it continues, so the lines run on across the junction
     without a step in them, and it is `outside` — which keeps it out of
     the store's fuel grid and lets the wood have it instead. */
  roadRun(OX0, THRU_Y0, RING_X0, THRU_Y1, 'x', 'west', { outside: true });
  roadRun(RING_X1, THRU_Y0, OX1, THRU_Y1, 'x', 'east', { outside: true });
  woodRect(OX0, LOT_Y0, RING_X0, THRU_Y0, 'wood, west, this side of the road');
  woodRect(OX0, THRU_Y1, RING_X0, OY1, 'wood, west');
  woodRect(RING_X1, LOT_Y0, OX1, THRU_Y0, 'wood, east, this side of the road');
  woodRect(RING_X1, THRU_Y1, OX1, OY1, 'wood, east');
  woodRect(RING_X0, CANOPY_Y, PARADE_X0 - 2 * WALL, MALL_Y1, 'wood, west flank');
  woodRect(PARADE_X1 + 2 * WALL, CANOPY_Y, RING_X1, MALL_Y1, 'wood, east flank');
  woodRect(RING_X0, MALL_Y1, ANCHOR_X0 - WALL, BACK_Y, 'wood, behind the west wing');
  woodRect(ANCHOR_X1 + WALL, MALL_Y1, RING_X1, BACK_Y, 'wood, behind the east wing');

  /* =================================================================
     THE SERVICE YARD, AND THE FENCE ROUND IT

     Behind the anchor there is now a yard rather than wood right up to
     the back wall: a strip of hardstanding as wide as the store, with
     chain link along its three open sides and ONE way in and out of it.

     WHY A FENCE IS A MIDTEXTURE AND NOT A WALL. A wall in this engine
     is the absence of a sector (see THE ONE RULE), and a wall you
     cannot see through would make the yard a corridor with no
     relationship to the wood on the other side of it. What is wanted is
     the opposite: something you can see the trees through, that you
     nonetheless cannot walk through, with one gap you have to find. So
     the yard and the wood TOUCH — every edge between them is an opening
     — and the chain link hangs IN those openings as a middle texture on
     a two-sided line, eight feet of it, blocking.

     WHICH MAKES THE GAP FREE. A fence is a property of LINES, so the
     opening is not a hole cut in anything: it is the one line along the
     back that was never given any wire. RectMap splits a shared edge at
     the corners of whatever abuts it, so the wood behind the yard is
     three rectangles instead of one and the middle one's edge is the
     gate. Nothing else in the map has to know.

     AND THE GAP IS WHERE A GAP WOULD BE, lined up with the roller
     shutter the night crew left open, so the gate, the dock and the
     shutter are one straight line through the back of the building.
     That is where the lorries go, and it is also the only way in or out
     of the yard that is not a walk round the whole store. */
  const { y1: YARD_Y1, fenceH: FENCE_H } = YARD;
  const [GATE_X0, GATE_X1] = YARD.gate;
  if (YARD.y0 !== BACK_Y) throw new Error('the yard has come away from the back wall');
  const yard = rm.add(ANCHOR_X0, BACK_Y, ANCHOR_X1, YARD_Y1, {
    floor: FLOOR_OUT, ceil: CEIL_SKY, light: 0.42, outdoor: true, sky: 1,
    floorTex: 'ASPHALT', ceilTex: 'SKY', wallTex: 'STORWALL',
    upperTex: 'STORWALL', lowerTex: 'KERB', fuel: FUEL.none, name: 'the service yard',
  });
  /* the wood either side of it, and the three strips behind it */
  const woodW = woodRect(RING_X0, BACK_Y, ANCHOR_X0, OY1, 'wood, west of the yard');
  const woodE = woodRect(ANCHOR_X1, BACK_Y, RING_X1, OY1, 'wood, east of the yard');
  const backW = woodRect(ANCHOR_X0, YARD_Y1, GATE_X0, OY1, 'wood, behind the yard');
  const gateW = woodRect(GATE_X0, YARD_Y1, GATE_X1, OY1, 'wood, through the gate');
  const backE = woodRect(GATE_X1, YARD_Y1, ANCHOR_X1, OY1, 'wood, behind the yard, east');

  rm.build();

  /* -----------------------------------------------------------------
     Dressing the openings
     ----------------------------------------------------------------- */
  const S = mb.sectors;
  const byName = n => S.filter(s => s.name === n);

  /* --- HANGING THE CHAIN LINK ---------------------------------------
     Four of the yard's five neighbours get wire; the fifth is the gate
     and gets nothing, which is the whole of the opening. `texLocked`
     because finishTextures runs at mb.build() and would otherwise take
     the middle texture straight back off — a two-sided line is a hole,
     and a hole with something in it has to say so. */
  let fenceLines = 0;
  for (const nb of [woodW, woodE, backW, backE]) {
    for (const l of mb.linesBetween(yard.sector, nb.sector)) {
      l.middle = 'CHAINLNK';
      l.midHeight = FENCE_H;      // see js/mapgeo.js: it stops at the top rail
      l.pegMiddle = 'bottom';     // and stands on the ground rather than hanging
      l.blocking = true;          // taller than you are, so it stops everything
      l.texLocked = true;
      fenceLines++;
    }
  }
  /* AND THE ONE THAT IS THE WAY IN. Asserted rather than assumed: the
     gate exists because a line was left alone, and a line left alone by
     accident somewhere else in this file would be a second gate nobody
     meant. */
  const gateLines = mb.linesBetween(yard.sector, gateW.sector);
  if (!gateLines.length) throw new Error('the yard has no gate');
  if (gateLines.some(l => l.blocking || l.middle))
    throw new Error('the gate got fenced');
  if (fenceLines < 4) throw new Error(`only ${fenceLines} sides of the yard are fenced`);

  /* Glazing carries on above both entrances, which is what a big-box
     front actually looks like and beats thirteen repeats of a door track
     stacked up the header. */
  for (const e of [entryA, entryB]) {
    for (const l of mb.linesBetween(e.sector, mat.sector)) {
      l.upper = 'STORGLAS'; l.pegUpper = 'bottom'; l.texLocked = true;
    }
  }

  /* =================================================================
     THE SLIDING DOORS

     Declared here because only the map knows which lines are the
     opening. The leaves live in the MIDDLE of the sixteen-unit wall
     void, so opening one slides it into the thickness of the wall where
     there is nothing to draw and nothing to fight with — which is what a
     slider in a deep reveal does in a real building.
     ================================================================= */
  const slide = [];
  for (const e of [entryA, entryB]) {
    const x0 = e.x0, x1 = e.x1;
    const lines = [
      ...mb.linesBetween(e.sector, mat.sector),
      ...mb.lines.filter(l => (l.front === e.sector || l.back === e.sector) &&
        Math.abs(l.y1 - (-WALL)) < 0.5 && Math.abs(l.y2 - (-WALL)) < 0.5),
    ];
    slide.push({
      x0, y0: -WALL / 2, x1, y1: -WALL / 2,
      zBot: FLOOR_WALK, zTop: DOOR_TOP,
      standoff: 0, travel: (x1 - x0) / 2,
      speed: 5, triggerR: 250, hold: 70,
      lines, sector: S[e.sector],
    });
  }

  /* --- and the fire exits, on the same list ---------------------------
     Same class, same state machine, same blocking lines; the spec says
     `swing` and it turns about one end instead of sliding along the
     wall. Which lines are the opening is easy here and does not need a
     query per face: the exit sector is a rectangle in the thickness of
     the wall, so its two long sides have a room on them and its two
     short ones face into the void and are wall. TWO-SIDED IS THE
     OPENING, both faces of it, which is what has to be blocked — a door
     that seals the inside face and leaves the outside one open is a door
     you can walk round from the car park.

     triggerR is the width of the opening and a little, so it is the bar
     that is being leaned on rather than a mat halfway down the aisle;
     hold is long, because what comes through a fire exit is not one
     person, it is everybody who was in that cross-aisle. */
  for (const x of exits) {
    const lines = mb.lines.filter(l =>
      (l.front === x.rect.sector || l.back === x.rect.sector) &&
      l.front !== null && l.back !== null);
    slide.push({
      x0: x.x, y0: x.y0, x1: x.x, y1: x.y1,
      zBot: FLOOR_WALK, zTop: DOOR_TOP,
      standoff: 0, swing: true, panicOnly: true, tex: 'EXITDOOR',
      speed: 8, triggerR: EXIT_W + 40, hold: 210,
      lines, sector: S[x.rect.sector],
    });
  }

  /* =================================================================
     THINGS
     ================================================================= */

  /* the player, out at the mouth of the car park, looking at the store */
  mb.thing('START', 1240, LOT_Y0 + 200, Math.PI / 2);

  /* --- where the cars go ---------------------------------------------
     Not things, and no longer drawn. There WERE placeholder cars here —
     eight views apiece off one silhouette equation, which was a decent
     placeholder and is now in the way of a better one — and the moment
     real models are the plan, a box on a billboard stops being a
     stand-in and starts being something you have to remember to delete.

     So what survives is the part worth keeping: the ARITHMETIC. Every
     slot comes off the same pitch that drew the bay lines, so a car put
     at one of these is genuinely in a bay rather than near one, and the
     shape is what a loader wants and nothing more — a position, a
     heading, and which of them it is. Read `level.carSlots`, put a model
     at each, and the lot is parked.

     A car park that is FULL is wrong for this, and at the user's request
     it is now SPARSE rather than merely half empty: about one bay in
     six near the doors, thinning to almost nothing by the road. Half
     the town left, and the ones who stayed parked close. It reads better
     than a full lot — a van on its own in a bay says something, and
     seventy-seven of them said "the loader worked" — and it is the
     cheapest frame this game has going: the lot was 48,000 triangles of
     van, and it is about 13,000 now. */
  {
    let seed = 20250907;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    /* AND IT THINS IN TWO DIRECTIONS NOW, which is what a lot twice as
       long asked for. Scaling the old rule up put the same one bay in
       six along thirteen thousand units of tarmac, and what that draws
       is not a sparse car park, it is an evenly stocked one that happens
       to be mostly gaps — a hundred and eighty units between neighbours
       at the far end of a lot nobody parks at.

       People park near the DOORS. So the chance falls off with distance
       from the entrance as well as with distance from the road, down to
       a fifth of it past REACH, and what comes out is a cluster round
       the porch thinning to the odd abandoned one at the ends. Which is
       also the frame: a lot this wide with cars only in the middle of it
       says how much of this place is already over. */
    const DOORS_X = ENT_A0 + ENTRY_W;                 // between the two sliders
    const REACH = 3400;                               // how far anyone will walk
    bayRows.forEach((row, ri) => {
      const cy = (row.y0 + row.y1) / 2;
      const n = Math.floor((LOT_X1 - LOT_X0) / BAY_W);
      const take = 0.24 - ri * 0.026;                 // emptier towards the road
      for (let i = 0; i < n; i++) {
        const cx = LOT_X0 + (i + 0.5) * BAY_W;
        const near = Math.max(0, 1 - Math.abs(cx - DOORS_X) / REACH);
        if (rnd() > take * (0.22 + 0.78 * near)) continue;
        /* nobody parks in the two bays either side of the entrance */
        if (Math.abs(cx - (ENT_A0 + ENTRY_W)) < 200 && ri === 0) continue;
        carSlots.push({
          x: cx, y: cy + (rnd() - 0.5) * 14,
          angle: row.facing + (rnd() - 0.5) * 0.10,
          variant: Math.floor(rnd() * 5),
        });
      }
    });
    /* --- and three abandoned across the lanes, because everyone left at
       once. IN a lane, which has to be FOUND rather than guessed: the
       rows come back-to-back in pairs, and the gap between one pair and
       the next is the driving lane. The three of these used to be put at
       ROAD_Y0 minus a guess, which is a band with no lane in it — one of
       them ended up thirty-two units from a parked van, two vehicles in
       one bay. Invisible while the lot was full; the first thing you see
       once it is sparse. */
    const lanes = [];
    for (let i = 0; i + 1 < bayRows.length; i++) {
      const gap = bayRows[i].y0 - bayRows[i + 1].y1;
      if (gap > 100) lanes.push(bayRows[i].y0 - gap / 2);
    }
    [[1500, 0, 0.35], [3100, 1, -0.25], [620, 2, 1.4]].forEach(([x, li, angle]) => {
      if (lanes[li] !== undefined) carSlots.push({ x, y: lanes[li], angle, variant: 0 });
    });
  }

  /* --- the furniture of a shop front --------------------------------- */
  for (const x of [ENT_A0 - 70, ENT_B0 + ENTRY_W + 70]) mb.thing('BOLLARD', x, -116, 0);
  for (let i = 0; i < 7; i++) mb.thing('TROLLEY', ENT_B0 + 300 + i * 26, -70 + (i % 2) * 16, 0.4 * i);
  for (let i = 0; i < 5; i++) mb.thing('TROLLEY', ENT_A0 - 400 + i * 24, -60 - (i % 3) * 14, 0.3 * i);
  for (const [x, yy] of [[900, 300], [2600, 1500], [3500, 2300], [1700, 900], [400, 2400]])
    mb.thing('TROLLEY', x, yy, 1.2);

  /* --- THERE WERE FORTY-TWO FUEL CANS HERE and they are gone ---------
     At the user's request, and the reason is a better one than "fewer
     props": the tank fills itself now, very slowly, and nothing else
     refills it (see TANK in js/player.js). A can on the floor and a tank
     that regenerates are two answers to the same question, and having
     both means the regeneration never matters — you top up from the
     nearest can and the budget the slow refill exists to impose does not
     exist.

     What the cans were FOR, though, is worth keeping in mind: they were
     laid on a coarse grid through the shop floor, thickened in the back
     of house and dropped in the cross-aisles, so that running dry
     anywhere was a walk rather than a soft lock. The soft lock is
     answered differently now — the boxcutter is issued, and the tank
     comes back on its own wherever you are standing.

     The FUELCAN actor itself still exists in js/states.js: 400 of fuel,
     one point of health, and it explodes. Nothing places one. It is the
     obvious thing to hand a responder who wants to make a point.
     ------------------------------------------------------------------ */

  /* --- stock, which is fuel that gets in the way --------------------- */
  {
    const crates = [
      [300, 2860], [400, 3000], [560, 3200], [900, 3100], [1200, 2900],
      [1450, 3260], [1700, 2980], [2000, 3200], [2300, 2880], [2600, 3120],
      [2750, 3300], [3050, 2900], [3300, 3200], [3600, 2950], [3900, 3260],
      [aisleX(2), 1150], [aisleX(5), 1150], [aisleX(8), 1150],
      [aisleX(3), 1970], [aisleX(7), 1970], [aisleX(10), 1970],
      [3760, 700], [3760, 1500], [420, 1450],
    ];
    for (const [x, yy] of crates) mb.thing('CRATE', x, yy, 0);
  }

  /* --- the lights ----------------------------------------------------
     One light every 256 units on the same grid and at the same offset as
     the fittings painted into the ceiling texture, so each source sits
     in the fitting that appears to be throwing it rather than beside
     one. Anything that lands outdoors, in a doorway or under a low
     ceiling is dropped when the level is populated — covering the
     building and filtering is much easier than describing the shape of
     the shop twice.

     THESE DRAW NOTHING. There is no lamp sprite any more: the fitting is
     paint (T.CEILFIT), and a light is a source for Game.relight and a
     box the fire can take out. Which is also why they are all the same
     now — there used to be a hash here that made one in fourteen a
     fitting with a tube gone and one in eleven a stuttering one, and
     both of those were sprites. A tiling texture paints every fitting
     in the shop identically, so a dim patch under a fitting that still
     looks perfect reads as a bug rather than as a knackered shop. The
     shop goes uneven when it BURNS, and that it can draw: the ceiling
     chars over the fire and the lights in it die together. */
  {
    const PITCH = 256, OFF = 126;
    for (let gx = Math.floor(PARADE_X0 / PITCH); gx * PITCH + OFF < PARADE_X1; gx++)
      for (let gy = 0; gy * PITCH + OFF < ANCHOR_Y1; gy++)
        mb.thing('LAMP', gx * PITCH + OFF, gy * PITCH + OFF, 0);
  }

  /* --- the crowd -----------------------------------------------------
     CUSTOMERS ARE ON THE SALES FLOOR AND NOWHERE ELSE. Not the car park,
     not the stockroom, not the loading dock, not the neighbouring units:
     a shopper is somebody who is in the shop. Everything below goes
     through `onSalesFloor`, which is the anchor's sales area inset from
     its own walls — the stockroom starts at BOH_Y0 and the parade starts
     outside ANCHOR_X0 — so a position that drifts out of it is dropped
     rather than placed, and the smoke test holds every one of them
     against the same rectangle afterwards.

     IT IS FIVE TIMES AS BUSY AS IT WAS, at the user's request. Ninety-two
     people was a supermarket at two in the morning: thin, a handful down
     each aisle, more at the back and a queue at two of the tills. Four
     hundred and sixty is a different hour of a different day. The whole
     of the multiplier is CROWD, and every count below is the count the
     old shop had, so CROWD = 1 is that shop back.

     MULTIPLYING A CROWD IS NOT THE SAME PROBLEM AS PLACING ONE, and it
     went wrong three ways before it went right.

     The first is that random placement stops working. Three people
     dropped into a 560-deep aisle land apart because there is nowhere
     else to land; ten do not, and two shoppers at one coordinate are one
     shopper with a shadow. So every run of people is STRATIFIED — each
     one owns a slice of the run and is dropped inside it — and every
     placement anywhere has to clear APART of everybody already standing,
     with retries if it does not.

     The second is the furniture. `onSalesFloor` is a rectangle, and a
     rectangle cannot tell an aisle from the gondola beside it. At ninety
     every position had been looked at by somebody; at four hundred and
     sixty a stray one is a person standing on top of the shelves. So the
     test is the SECTOR now, read off the rect list, which is built by
     this point: the shop floor and nothing else.

     The third is that FIVE TIMES THE OLD SHAPE DOES NOT FIT. The old
     shape was almost all aisle, and an aisle is 160 wide: five times
     three people in one is a queue nobody can get out of, and the flee
     test caught exactly that — a shopper beside a fire that shuffled
     twenty-four units in two and a half seconds because it was walled in
     by its neighbours. So the extra people go where a busy shop actually
     puts them: the cross-aisles, the front end, the mat inside the
     doors and the lanes at the tills, all of which were empty and all of
     which are four times the width of an aisle. The aisles are busier
     than they were and not five times busier.

     WHICH PERSON is chosen here rather than at spawn time so that two
     runs of the same map put the same people in the same places, and a
     screenshot is a screenshot of something. */
  /* THE WHOLE OF IT. 1 is the old shop, which held ninety-two.

     It used not to be a free knob and now nearly is, which is the whole
     story of this number. The cost of a crowd is not the crowd, it is
     the panicking: an actor deciding where to step asks every solid
     actor whether it is in the way, and against a flat list that is the
     crowd SQUARED. Measured with no renderer in the way, at 35 Hz, five
     fires going with a third of the shop running: 0.21 ms a tic at 92
     people, 2.0 at 460 — ten times the work for five times the people,
     and the reason the note here used to say that another doubling
     wanted a grid over the actors rather than a scan of them.

     It has one now (ActorGrid, js/actor.js), and the same measurement is
     0.6 ms at 460 and 0.8 at 736 — a third of what the scan cost with
     sixty per cent more people on the floor, and about three per cent of
     a tic. What limits the crowd from here is not the arithmetic, it is
     the FLOOR: at 54 apart there is only so much shop, and the top-up
     below is what finds the last of it. */
  const CROWD = 8;
  /* And what that is in people, so the number the shop is asked for is
     written down once and both the placement and the smoke test read the
     same one. */
  const BASE = 92, TARGET = BASE * CROWD;
  /* A shopper is 18 in the radius, so two of them touch at 36, and one
     walks 16 units a step. Below 52 a shopper hemmed in on all sides has
     no step it can take that does not end inside somebody — which is
     what 34 did: it placed the crowd already overlapping and then nobody
     could leave. */
  const APART = 54;
  const TRIES = 20;                 // how many goes at a spot before giving up
  /* A slice keeps a run spread out, and a slice can also be entirely
     inside the butchery counter, where re-rolling within it will never
     help.
     So the first few goes stay in your own slice and the rest are
     anywhere along the run. */
  const WIDEN = 4;
  const SALES = { x0: ANCHOR_X0 + 60, y0: Y_MAT + 40, x1: ANCHOR_X1 - 60, y1: Y_BACKXEND - 40 };
  const onSalesFloor = (x, yy) => x > SALES.x0 && x < SALES.x1 && yy > SALES.y0 && yy < SALES.y1;
  {
    let seed = 777;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const who = () => Math.floor(rnd() * SHOPPERS);
    let dropped = 0;
    const taken = [];               // everybody placed so far, for the spacing test

    /* A SHOPPER IS A DISC, and every version of this test that treated
       one as a point put people somewhere they could never leave.
       `onSalesFloor` is a rectangle, so it cannot tell an aisle from the
       gondola beside it. The sector under the middle of somebody is
       better and still not enough: eighteen units of shopper flush
       against the side of a till is a body half inside the till, and
       `canStandAt` then refuses all eight directions for the rest of the
       level. And the crates of stock go down before the crowd does, so
       two of them had somebody standing in them.

       So the disc is tested against three things: the rect under the
       point, every rect that is not shop floor, and everything solid
       already placed. `rm.build()` and the crates have both happened by
       here, so both lists are the finished map. */
    const BLOCKERS = rm.rects.filter(r => r.props.floor !== FLOOR_WALK);
    const SOLIDS = mb.things.filter(t => ACTORS[t.type]?.solid);
    const CLEAR = 22;               // the radius and a little: beside it, not in it
    const under = (x, yy) => rm.rects.find(r => x > r.x0 && x < r.x1 && yy > r.y0 && yy < r.y1);
    const standable = (x, yy) => {
      if (!onSalesFloor(x, yy)) return false;
      const r = under(x, yy);
      if (!r || r.props.floor !== FLOOR_WALK) return false;         // on the shelves
      /* the nearest point of a rectangle to a point, which for an
         axis-aligned rectangle is one max per axis */
      if (BLOCKERS.some(b => {
        const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - yy, 0, yy - b.y1);
        return dx * dx + dy * dy < CLEAR * CLEAR;
      })) return false;
      if (SOLIDS.some(t => {
        const rr = CLEAR + (ACTORS[t.type].radius ?? 16);
        return (t.x - x) ** 2 + (t.y - yy) ** 2 < rr * rr;
      })) return false;
      return !taken.some(([tx, ty]) => (tx - x) ** 2 + (ty - yy) ** 2 < APART * APART);
    };
    const place = (x, yy, angle) => {
      if (!standable(x, yy)) return null;
      taken.push([x, yy]);
      return mb.thing('SHOPPER', x, yy, angle ?? rnd() * Math.PI * 2, { variant: who() });
    };
    /* One person, from a function that offers somewhere to put them. A
       rejected spot used to mean one fewer person, which does not show at
       ninety and shows as a hole in the crowd at four hundred and
       sixty. */
    const someone = (spot, angle) => {
      for (let att = 0; att < TRIES; att++) {
        const [x, yy] = spot(att);
        if (place(x, yy, angle)) return true;
      }
      dropped++; return false;
    };

    /* THE QUEUES GO IN FIRST, because they are the only people here who
       cannot be put somewhere else. Every other group is offered a
       region and asked to find room in it; a queue is eight fixed lines
       of five, and if the front cross-aisle has already filled up over
       the top of them the queue is what loses. They are also the one
       arrangement in the game that says "these are people" before you
       have looked at any of them: five deep, one behind the other, all
       facing the same way, one per till lane. The x values are AISLE
       CENTRES — a queue is the only thing in the shop long enough to
       reach past the front cross-aisle and into the runs, so it has to
       stand where the runs have a gap. */
    for (let q = 0; q < NTILL; q++) {
      const k = Math.round(q * (NCOL - 2) / (NTILL - 1));    // 0 1 3 4 6 7 9 10
      for (let i = 0; i < CROWD; i++)
        someone(() => [aisleX(k) + (rnd() - 0.5) * 20,
                       Y_TILLEND + 70 + i * 62], Math.PI / 2);
    }

    /* DOWN THE AISLES, thinner across the front where you come in and
       thickest at the back — walking in should look survivable and the
       far end of aisle nine should not. Each person owns a slice of the
       aisle `1/n` long and is dropped inside it, so fifteen of them
       spread down the aisle instead of piling up in the middle third of
       it the way fifteen independent rolls would. */
    ROWS.forEach((row, ri) => {
      for (let k = 0; k < NCOL - 1; k++) {
        const x = aisleX(k);
        const n = (ri === 0 ? (k % 2 === 0 ? 1 : 0) : (k % 2 === 0 ? 2 : 1)) * CROWD;
        const y0 = row.y0 + 60, span = row.y1 - row.y0 - 120;
        for (let i = 0; i < n; i++)
          someone(att => [x + (rnd() - 0.5) * 90,
                          y0 + (att < WIDEN ? (i + rnd()) / n : rnd()) * span]);
      }
    });

    /* THE WALKWAYS AND THE CROSS-AISLES: every strip in the shop that
       runs across the grain rather than down it, and where most of the
       new people went. The last number is how many the OLD shop had on
       that line — twelve of these were written out as bare coordinates
       when there were twelve, and the four they sat on have become six,
       because the two cross-aisles in the middle of the runs had nobody
       on them at all and are the widest floor in the building.

       The departments either side of the two walkways are FIXTURES at
       bench or gondola height, so somebody placed "in produce" is
       standing on top of the produce: they go in the walkway beside it,
       which is where they would be anyway. Every one of these strips is
       140 or 160 wide, so thirty-five of jitter either way stays in
       it. */
    const WALKS = [
      [410, 420, 410, 2600, 3],     // west, between the departments and aisle 0
      [3760, 420, 3760, 2600, 4],   // east, along the chill and the freezers
      [500, 320, 3600, 320, 9],     // the front cross-aisle, the busiest floor there is
      [500, 1150, 3600, 1150, 6],   // the mid cross-aisle, between run one and run two
      [500, 1970, 3600, 1970, 6],   // the rear one
      [400, 2690, 3900, 2690, 4],   // the back one, past the butchery
    ];
    for (const [x0, y0, x1, y1, base] of WALKS)
      for (let i = 0, n = base * CROWD; i < n; i++)
        someone(att => {
          const t = att < WIDEN ? (i + rnd()) / n : rnd();
          return [x0 + (x1 - x0) * t + (rnd() - 0.5) * 70,
                  y0 + (y1 - y0) * t + (rnd() - 0.5) * 70];
        });

    /* THE FRONT END: the mat inside the doors and the lanes between the
       tills, which is where a shop this busy keeps the people who are
       arriving and the people who are leaving. The tills themselves are
       fixtures and get rejected, which is the point of testing the
       sector — the band the old scatter used reached back over them, and
       a shopper on a till is a shopper standing on a conveyor. */
    for (let i = 0; i < 12 * CROWD; i++)
      someone(() => [ANCHOR_X0 + 200 + rnd() * (ANCHOR_X1 - ANCHOR_X0 - 400),
                     SALES.y0 + 10 + rnd() * (Y_TILLEND - SALES.y0 - 25)]);

    /* AND THE TOP-UP, which is what makes CROWD mean what it says.

       Every group above is a region and a count, and the counts were
       balanced by eye against the region they sit in. That held at five
       times the old shop and stopped holding at eight: the aisles and the
       queues filled up, eighty people found nowhere to stand in the
       region they had been offered, and the shop came out at 656 of the
       736 asked for — a shortfall that is invisible as a number and shows
       up as the back of the store being emptier than the front.

       So the last pass ignores the regions entirely and offers the WHOLE
       sales floor, one random point at a time, until the shop holds what
       it was asked to hold. `standable` is doing all the work: it will
       not put anybody on a gondola, in a till, inside a crate or within
       54 of somebody already standing, so a uniform scatter over a
       rectangle comes out as people in the walkable gaps of it. The
       attempt budget is what stops a shop that is genuinely full from
       looping for ever — at some density every point is rejected, and
       that density is a property of the floor plan, not a bug. */
    for (let att = 0; taken.length < TARGET && att < TARGET * 60; att++)
      place(SALES.x0 + 20 + rnd() * (SALES.x1 - SALES.x0 - 40),
            SALES.y0 + 20 + rnd() * (SALES.y1 - SALES.y0 - 40));

    if (taken.length < TARGET)
      console.warn(`the shop holds ${taken.length} of the ${TARGET} asked for`);
    if (dropped) console.warn(`${dropped} shoppers found nowhere to stand in their own region`);
  }

  const level = mb.build();
  level.slideDoors = slide;
  /* Position, heading and which one it is, for whatever draws the cars. */
  level.carSlots = carSlots;
  /* the road, and where it leaves the map: whoever comes, comes from
     one of these two points */
  level.road = { y0: THRU_Y0, y1: THRU_Y1 };
  level.roadEnds = [
    { x: OX0 + 240, y: (THRU_Y0 + THRU_Y1) / 2, heading: 0, side: 'west' },
    { x: OX1 - 240, y: (THRU_Y0 + THRU_Y1) / 2, heading: Math.PI, side: 'east' },
  ];
  level.title = 'SELLWRONG — SUPERSTORE';
  /* Where a customer may stand. The crowd is placed through it and the
     smoke test holds every one of them against it. */
  level.salesFloor = SALES;
  /* EVERY WAY OUT OF THE BUILDING, as a point on the OUTSIDE of it.

     A frightened shopper reads this and runs at the nearest one (see
     A_Flee in js/actor.js), and the reason the point is outside rather
     than in the doorway is the whole of why that works: aim a greedy
     walker at the threshold and it arrives, stops, and mills about in
     the opening with everybody behind it. Aim it two door-widths past
     and the doorway is somewhere it goes THROUGH.

     The two front sliders are on the list as well. They are the widest
     way out by a factor of three and they are the way the player came
     in, so the front end empties out past the tills and into the car
     park while the aisles empty out sideways into the trees. */
  level.exits = [
    ...exits.map(x => ({ x: x.out[0], y: x.out[1], kind: 'fire exit' })),
    { x: ENT_A0 + ENTRY_W / 2, y: -80, kind: 'front door' },
    { x: ENT_B0 + ENTRY_W / 2, y: -80, kind: 'front door' },
  ];
  /* the wood, for js/forest.js: where it is, and the hole in it */
  level.forestRects = forestRects;
  level.forestBounds = [OX0, OY0, OX1, OY1];
  level.clearing = level.fireBounds;
  return level;
}
