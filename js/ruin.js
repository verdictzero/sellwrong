/* =====================================================================
   GROCERY STORE SIMULATOR — what is holding up a roof that is not there
   =====================================================================

   A REGION THAT HAS BURNT OUT USED TO BECOME SKY. Its ceiling texture
   was swapped for the one the engine treats as a hole, and what you got
   when you walked back through a gutted aisle and looked up was stars —
   a clean rectangular stars-shaped absence with a hard edge on it where
   the next aisle's ceiling was still up. Which is not what a burnt-out
   building looks like and, more to the point, is not what one IS. A shed
   this size is a steel frame with a deck on it. The DECK burns. The
   frame is what is still standing in the photograph the morning after,
   and it is the entire reason a burnt-out supermarket reads as a
   building rather than as a car park with walls.

   So there is framing up there now, at the user's request, and it is
   real geometry rather than a picture of some: joists across the span at
   a pitch, beams under them on the column lines, some of the joists
   sagging where the heat was worst and some of them simply gone, and a
   torn panel of deck still lying across a bay here and there.

   THE ROOF IS ONE ROOF, and that is the thing this file exists to get
   right. The fire guts REGIONS — an aisle at a time, a gondola at a time
   — so the obvious way to build this is per region, and the obvious way
   is wrong: two aisles either side of a gutted gondola would each get
   their own joists, at their own offsets, meeting the shelf between them
   at nothing in particular. What is drawn instead is one LATTICE over
   the whole world, and a region draws the piece of it that falls inside
   its own outline. A joist that runs across three regions is one joist
   in three pieces, at one height, sagging by one amount, and where the
   region next door still has its ceiling the joist simply stops — which
   is exactly what you see from underneath, because the ceiling is in the
   way.

   EVERYTHING IS A FUNCTION OF WHERE IT IS. Which joists sag, which are
   missing, where the beams fall, how much a joist droops at a given x —
   all of it is a hash or a curve over the world coordinate, never a
   random number drawn at build time. That is what makes the lattice
   agree with itself across regions, and it is also what makes a rebuild
   — and there are twenty of them in a level, every time another region
   finishes burning — put the same steel back in the same place.

   IT COSTS ABOUT WHAT IT LOOKS LIKE. A member is a box: six quads,
   twelve triangles, one texture, and it goes into the same batch as
   every other piece of steel in the building, so the whole ruined roof
   of a fully burnt store is one draw call and something like fifteen
   thousand triangles — about two thirds of what the car park costs.
   ===================================================================== */

/* ---------------------------------------------------------------------
   THE FRAME

   Numbers from a real shed, at this game's scale of about thirty-five
   units to the metre, rounded to something a 64-unit texture sits on.
   ------------------------------------------------------------------- */
export const ROOF = {
  /* Joists span the building east to west and are spaced going north,
     which is ACROSS the grain of the gondola runs — so from the end of
     an aisle you look down the run and the steel crosses it, which is
     the view that says "this had a roof". */
  joistPitch: 96,          // 2.7m, and one and a half texture repeats
  joistDepth: 30,
  joistHalf: 5,            // half its width: a member is 10 across

  /* The beams they sit on, on the column grid, running north to south. */
  beamPitch: 384,          // 11m, a bay
  beamDepth: 52,
  beamHalf: 8,

  /* How far a burnt joist droops at the middle of its bay, and how many
     of them do. A sag is the picture — a straight grid reads as a
     drawing of a grid — but a roof where every member sags reads as a
     net, so it is about a third of them. */
  sag: 40,
  sagChance: 0.38,
  /* and how many are simply not there any more */
  goneChance: 0.16,

  /* A joist that sags is drawn as a polyline, because a box has two ends
     and a curve does not. This is how long a piece of one is. */
  sagStep: 96,

  /* What is left of the deck where the deck has gone: the odd panel
     still lying across a bay. */
  scrapChance: 0.16,
};

/* Knuth's multiplicative hash over a lattice index — the same one
   js/textures.js picks a region's ruin variant with, for the same
   reason: stable across a reload, different from its neighbour's. */
const hash = (i, salt) => (Math.imul((i | 0) + 1 ^ salt, 2654435761) >>> 8) / 0x1000000;

/** How far the joist at lattice row `j` has drooped by the time it gets
 *  to `x`. Zero over a beam and most at the middle of a bay, so a run of
 *  them reads as steel between supports rather than as a wave. */
function droop(j, x) {
  if (hash(j, 0x5f37) >= ROOF.sagChance) return 0;
  const t = ((x / ROOF.beamPitch) % 1 + 1) % 1;
  /* How MUCH this one sagged is its own: a roof where every failure is
     the same size is a roof somebody typed. */
  return ROOF.sag * (0.45 + hash(j, 0x1d7b) * 0.9) * Math.sin(t * Math.PI);
}

const isGone = j => hash(j, 0xa53f) < ROOF.goneChance;

/* ---------------------------------------------------------------------
   DRAWING ONE PIECE OF STEEL

   A box, in the renderer's coordinates: x east, y up, z the map's y
   negated. The winding is the same reversal the rest of js/mapgeo.js
   lives with — see the note in addQuad — and the UVs run along the
   member so the texture does not stretch on a long one.
   ------------------------------------------------------------------- */
const TEX = 64;

function box(b, x0, y0, x1, y1, zBot, zTop, light, char) {
  /* map x stays x, map y becomes the renderer's MINUS z, up is y */
  const za = -y0, zc = -y1;                      // the two faces along the length
  const len = (x1 - x0) / TEX, wid = (y1 - y0) / TEX;
  const v0 = zBot / TEX, v1 = zTop / TEX;
  /* FIVE FACES AND NOT SIX. The top of a member is the plane the deck
     was on, and there is no eye in this game above that plane: the
     parapet stands over it and the camera never leaves the ground. A
     face nobody can be on the outside of is a face nobody needs. */
  const q = (p0, p1, p2, p3, u) => b.quad([p0, p1, p2, p3],
    [[u, v1], [0, v1], [0, v0], [u, v0]], light, 0, char);

  /* the two long faces, south then north */
  q([x1, zTop, za], [x0, zTop, za], [x0, zBot, za], [x1, zBot, za], len);
  q([x0, zTop, zc], [x1, zTop, zc], [x1, zBot, zc], [x0, zBot, zc], len);
  /* the two ends, west then east */
  q([x0, zTop, za], [x0, zTop, zc], [x0, zBot, zc], [x0, zBot, za], wid);
  q([x1, zTop, zc], [x1, zTop, za], [x1, zBot, za], [x1, zBot, zc], wid);
  /* and the underside, which is the face anybody standing in the shop
     is actually looking at */
  b.quad([[x0, zBot, zc], [x1, zBot, zc], [x1, zBot, za], [x0, zBot, za]],
    [[0, wid], [len, wid], [len, 0], [0, 0]], light, 0, char);
}

/* ---------------------------------------------------------------------
   THE ROOF OVER ONE REGION

   Called for every sector whose deck has failed — `s.ruinRoof` is set by
   guttedSurfaces in js/textures.js when it decides the roof is holed or
   gone — and it draws the part of the world's lattice that stands over
   that sector's own bounding box.

   A BOUNDING BOX AND NOT THE OUTLINE, which is worth admitting to: every
   sector in this map is a rectangle, so the two are the same thing here.
   A map with an L-shaped room in it would get steel over the notch, and
   the honest fix then is to clip each member to the sector's polygon
   rather than to pretend the box is the room.
   ------------------------------------------------------------------- */
export function roofFraming(set, s) {
  if (!s.ruinRoof) return 0;
  const [x0, y0, x1, y1] = s.bbox;
  const b = set.get('RUINSTEL');
  /* A GUTTED REGION IS LIT BY WHAT IS LEFT OF IT, and the steel is the
     part of it nearest the sky, so it takes the region's own light and
     the full char — the shader keeps live coals on anything charred, and
     a roof frame with coals in its seams is the picture. */
  const light = Math.min(1, Math.max(0.2, (s.light ?? 0.4) * 1.06));
  const CHAR = 1;
  const top = s.ceil;
  let drawn = 0;

  /* --- the beams, north to south on the column grid ----------------- */
  const bi0 = Math.ceil(x0 / ROOF.beamPitch), bi1 = Math.floor(x1 / ROOF.beamPitch);
  for (let i = bi0; i <= bi1; i++) {
    const bx = i * ROOF.beamPitch;
    if (bx - ROOF.beamHalf < x0 || bx + ROOF.beamHalf > x1) continue;
    box(b, bx - ROOF.beamHalf, y0, bx + ROOF.beamHalf, y1,
        top - ROOF.beamDepth, top, light * 0.94, CHAR);
    drawn++;
  }

  /* --- and the joists across them ----------------------------------- */
  const ji0 = Math.ceil(y0 / ROOF.joistPitch), ji1 = Math.floor(y1 / ROOF.joistPitch);
  for (let j = ji0; j <= ji1; j++) {
    const jy = j * ROOF.joistPitch;
    if (jy - ROOF.joistHalf < y0 || jy + ROOF.joistHalf > y1) continue;
    if (isGone(j)) continue;                        // this one came down
    const sags = droop(j, 0) !== 0 || droop(j, ROOF.beamPitch / 2) !== 0;
    /* A STRAIGHT ONE IS ONE BOX. A sagging one is a polyline, because a
       box has flat ends and a curve does not — and the step is coarse on
       purpose: four or five pieces across a bay is a sag, and forty is a
       smooth arc, which no burnt joist has ever been. */
    const n = sags ? Math.max(1, Math.round((x1 - x0) / ROOF.sagStep)) : 1;
    for (let k = 0; k < n; k++) {
      const ax = x0 + (x1 - x0) * (k / n), cx = x0 + (x1 - x0) * ((k + 1) / n);
      const d = droop(j, (ax + cx) / 2);
      box(b, ax, jy - ROOF.joistHalf, cx, jy + ROOF.joistHalf,
          top - ROOF.joistDepth - d, top - d, light, CHAR);
      drawn++;
    }
  }

  /* --- and whatever deck is still lying across a bay ----------------
     Only where the deck is GONE: where it is merely holed the ceiling is
     still being drawn as a surface and these would sit inside it. */
  if (s.ruinRoof === 'open') {
    /* the region's own ruin variant, chosen once by guttedSurfaces and
       kept on the sector, so a scrap of deck is the same deck the region
       next door still has up */
    const deck = 'RUINDECK' + (s.ruinVariant ?? 0);
    const d = set.get(deck);
    for (let j = ji0; j <= ji1; j++) {
      for (let i = bi0; i <= bi1; i++) {
        if (hash(j * 733 + i, 0x2f19) > ROOF.scrapChance) continue;
        const ay = j * ROOF.joistPitch, cy = ay + ROOF.joistPitch;
        const ax = i * ROOF.beamPitch, cx = ax + ROOF.beamPitch;
        if (ax < x0 || cx > x1 || ay < y0 || cy > y1) continue;
        /* just under the line the deck was on, so its torn edge shows
           against the sky rather than being coplanar with nothing */
        const z = top - 3;
        const uv = (x, y) => [x / TEX, -y / TEX];
        d.quad([[cx, z, -cy], [cx, z, -ay], [ax, z, -ay], [ax, z, -cy]],
          [uv(cx, cy), uv(cx, ay), uv(ax, ay), uv(ax, cy)], light * 0.9, 1, CHAR);
        /* and the same panel seen from above, for anybody looking down
           into the shell from the car park */
        d.quad([[ax, z, -cy], [ax, z, -ay], [cx, z, -ay], [cx, z, -cy]],
          [uv(ax, cy), uv(ax, ay), uv(cx, ay), uv(cx, cy)], light * 0.7, 1, CHAR);
        drawn++;
      }
    }
  }
  return drawn;
}
