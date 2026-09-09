/* =====================================================================
   Turn four-view vehicle sheets into models and the paint for them
   =====================================================================

     node tools/prep-car.mjs            build the whole fleet
     node tools/prep-car.mjs --roof     just say where each roof line landed

   What arrives is a set of pictures, one per vehicle: the thing drawn
   four times on a green field — front, rear, side and plan, laid out in
   reading order. What leaves is ONE texture atlas holding every view of
   every vehicle (assets/cars/vehicles.png) and one set of numbers
   (js/car-data.js) that js/car.js turns into a body. (The sheets in art/
   are as they were handed over, decoded out of their JPEGs once and
   otherwise untouched, because the rest of this repository's tooling
   reads PNG and nothing else.)

   THE WHOLE IDEA IS THAT THOSE FOUR PICTURES ARE MEASUREMENTS AS WELL AS
   PAINT. An orthographic view is a parallel projection, so

     the side view's silhouette box is the vehicle's LENGTH and HEIGHT
     the front view's is its WIDTH and HEIGHT
     the plan view's is its LENGTH and WIDTH

   Every pair shares an axis with two others, which means the sheet is
   over-determined: three views claim a width, and if they agree the
   scale is honest. They do — to about one percent — and the tool prints
   the residual and throws if a sheet cannot manage it. No dimension here
   is a number somebody typed in after looking at the picture. The one
   number that IS typed in is the vehicle's length in metres, because
   nothing in a picture of a van says how big a van is.

   And because the views ARE projections, painting them back on along the
   same axes puts every pixel where it came from. That is all "projection
   mapping" means here: the side view goes on the sides, the front view
   on anything facing forward, the plan on the roof, and the geometry
   underneath only has to be roughly the right shape for it to land.

   MEASURING A SILHOUETTE WITH RUBBISH IN IT. The sheets are renders, and
   renders come with specks: a stray three-pixel line off the tail, a
   thin grid of stray rows over the plan view. Taken literally they made
   the riot van's side view eleven pixels longer than it is, and eleven
   pixels is five percent, and five percent is the difference between the
   three views agreeing and not. So each view is measured after a 5x5
   MORPHOLOGICAL OPENING — erode, then dilate — which deletes anything
   thinner than five pixels and leaves a boxy vehicle untouched, and then
   from the largest connected blob of what survives. The opening is a
   RULER, not an edit: the pixels that get packed are the original ones.

   THE WINDOWS ARE HOLES IN THE KEY, which is a fact about these sheets
   worth stating because it decides how the cut-out works. Whoever
   rendered them let the glass go through to the green, so a naive "green
   is background" cuts the windscreen out of the vehicle. The rule that
   works is topological rather than chromatic:

     key you can reach from outside the vehicle is BACKGROUND
     key you cannot reach is GLASS

   A flood fill from the border separates them in one pass. Background
   gets the nearest body colour bled into it, so a face that overhangs
   the silhouette by a pixel picks up paint rather than chroma key.
   Glass is painted dark dark grey, a shade off black (GLASS). It used to
   get the body colour, darkened, and a red car with dark red windows
   read as a car with no windows at all. (The flood that finds the
   BACKGROUND runs against the opened blob, not the raw pixels: those
   stray lines over the plan view enclose little strips of green between
   them, and against the raw pixels every one of them would have been
   inside the vehicle. The flood that finds the GLASS runs against the
   raw paint, because the opening erodes a thin pillar to nothing and
   then a side window is background — see view() below.)

   THE SHAPE IS THE VISUAL HULL OF THE THREE SILHOUETTES. Each view is a
   parallel projection, so the vehicle lies inside its own silhouette
   extruded along the axis that view was drawn down, and inside all three
   of those at once is the tightest solid the sheet can vouch for. It
   comes out as three curves — the side view's top edge and the plan
   view's width along the length, the head-on views' width up the height
   — and js/car.js puts a vertex at every crossing of them. A nose corner
   rounds off because the plan view rounds it, a roof shoulder because
   the front view does, a windscreen slopes because the side view slopes
   it, and nothing is named. (It was the side outline lofted across one
   width once, and a staircase of boxes before that. See THE HULL, below.)

   WHAT A FLEET CHANGED. One sheet could be measured against itself with
   fractions of its own length: the riot van's roof is "the topmost row
   that runs nearly half the length", because a van's roof does. A PICKUP
   TRUCK'S DOES NOT. Its cab is a quarter of its length, and the topmost
   row running half the length is the BONNET — so the side view would
   have anchored on the bonnet while the front view, which sees nothing
   but cab, anchored on the cab roof, and the paint would have slid a
   fifth of the vehicle's height. So the roof test is now relative to
   what each view shows NEAR ITS OWN TOP rather than to the vehicle's
   length or width, and finds the same feature in a van, a truck and a
   hatchback. See roofRow.
   ===================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { readPNG, writePNG } from './png-read.mjs';

/* ---------------------------------------------------------------------
   THE FLEET

   `metres` is the only measurement not taken off the picture, because a
   picture of a van does not say how big a van is; everything else is
   derived. `use` is what keeps the riot van and the APC out of the
   customer car park — see placeCars in js/game.js. `wheels` is what the
   side view's underside is expected to show, and the tool throws if it
   shows something else: a tracked vehicle has no wheel dips at all and a
   car that suddenly has three has been measured wrong.
   --------------------------------------------------------------------- */
const FLEET = [
  { id: 'hatchback', name: 'Hatchback',  file: 'art/hatchback.png', metres: 3.70, use: 'civil',    wheels: 2, nose: 'left' },
  { id: 'van',       name: 'Panel van',  file: 'art/van.png',       metres: 5.45, use: 'civil',    wheels: 2, nose: 'right' },
  { id: 'van2',      name: 'Work van',   file: 'art/van2.png',      metres: 5.45, use: 'civil',    wheels: 2, nose: 'left' },
  { id: 'pickup',    name: 'Pickup',     file: 'art/pickup.png',    metres: 5.20, use: 'civil',    wheels: 2, nose: 'left' },
  { id: 'muralvan',  name: 'Custom van', file: 'art/muralvan.png',  metres: 5.45, use: 'civil',    wheels: 2, nose: 'right' },
  { id: 'riotvan',   name: 'Riot van',   file: 'art/riotvan.png',   metres: 5.60, use: 'police',   wheels: 2, nose: 'left' },
  { id: 'apc',       name: 'APC',        file: 'art/apc.png',       metres: 6.50, use: 'military', wheels: 0, nose: 'left' },
];
/* `nose` is which way the SIDE VIEW faces, and it is declared because
   nothing in the arithmetic can tell: two of these seven were drawn nose
   to the right and five nose to the left, and a tool that assumed one
   of those built a third of the fleet back to front — the bonnet at the
   tail, and the front view painted over it. The plan views all face
   left. A nose-right side view is flipped as it goes into the atlas, so
   from js/car.js onward every side view faces left and there is one
   rule.

   AND THE DECLARATION IS CHECKED AGAINST THE DRAWING, because the first
   one was wrong: the hatchback was read as nose-right off a thumbnail
   and is not, and for a day its grille was painted on its hatch. Run
   PROFILE_DEBUG=<id> to see a vehicle's top edge column by column: a
   nose is a long gentle rise into a steep one (bonnet, windscreen), a
   tail is a slope into a drop. The eye gets a hatchback wrong at a
   hundred pixels; the numbers do not. */

/* Doom's player is 56 units tall for about a metre and three quarters,
   so the world runs at about 32 units to the metre. A bay is 180 deep,
   which is why nothing parked in one is longer than that. */
const PER_METRE = 32;

const OUT_PNG = 'assets/cars/vehicles.png';
const OUT_JS = 'js/car-data.js';

/* How much greener than red and blue a pixel has to be to be the key.
   Generous, because the sheets arrived as JPEGs and every edge in them
   is fringed. */
const KEY = 28;
const OPEN = 2;          // radius of the measuring opening: kills anything under 5px
const GLASS = [24, 26, 30]; // what a see-through window is painted: dark dark grey, near black
const PAD = 1;           // gutter around each view in the atlas
const ATLAS_W = 512;
const HULL_TOL = 0.006;    // a point of a curve closer than this to the line through its neighbours goes, in lengths
const HULL_GAP = 0.10;     // and no two that survive are farther apart than this
const HULL_MERGE = 0.008;  // or closer than this
const NOTCH_W = 0.035;     // a slot in an edge narrower than this, in lengths, is a speck and is bridged
const BLOB_MIN = 0.03;   // a piece this much of the biggest one is part of the vehicle
const WHEEL_TOL = 0.018; // how far below the sill counts as a wheel
/* How far the three views may disagree about the width before a sheet
   is thrown out. The riot van manages one percent, and on the strength
   of that this was 8; across seven sheets the real spread is 1, 2.3, 2.4,
   3, 4.6, 5 and — the pickup, whose side view draws it taller for its
   length than its own head-on views do — 11.5. So one percent was luck.
   The check is here to catch a sheet that is NOT ONE VEHICLE: a swapped
   side and plan shows up as twenty-odd percent and a mis-cut sheet as
   more. It was never a grade for the artwork, and each vehicle carries
   its own residual into js/car-data.js either way. */
const AGREE_MAX = 0.14;
const ROOF_ZONE = 0.30;  // the roof line is somewhere in the top this much of a view
const ROOF_SPAN = 0.75;  // a head-on row this much of what that zone shows is the roof
const ROOF_RUN = 0.45;   // and a side row this much of it is

const round = (n, p = 4) => Number(n.toFixed(p));

/* =====================================================================
   ONE SHEET
   ===================================================================== */
function measure(spec) {
  const inFile = spec.file;
  const sheet = readPNG(inFile);
  const { w: SW, h: SH, data: SD } = sheet;
  const isKey = (x, y) => {
    const i = (y * SW + x) * 4;
    return SD[i + 1] > SD[i] + KEY && SD[i + 1] > SD[i + 2] + KEY;
  };
  const bad = m => new Error(`${inFile}: ${m}`);

  /* ---- the ruler ----------------------------------------------------
     A 5x5 MORPHOLOGICAL OPENING of everything that is not key: erode,
     then dilate, which deletes anything thinner than five pixels and
     leaves a boxy vehicle untouched. It runs over the WHOLE SHEET before
     anything else, because the specks are not only inside the views —
     two of these six carry a faint one-pixel seam straight across the
     middle of the picture, left over from however they were composited,
     and against the raw pixels that seam is a row that is not a gutter,
     which means the sheet has three rows of views in it and the tool
     gives up. Opened, the seam is not there. Same ruler, applied one
     step earlier. The pixels that get PACKED are still the originals. */
  const paintAll = new Uint8Array(SW * SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) paintAll[y * SW + x] = isKey(x, y) ? 0 : 1;
  const morph = (src, dilate) => {
    const d = new Uint8Array(SW * SH);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      let v = dilate ? 0 : 1;
      for (let dy = -OPEN; dy <= OPEN; dy++) for (let dx = -OPEN; dx <= OPEN; dx++) {
        const nx = x + dx, ny = y + dy;
        const s = (nx < 0 || ny < 0 || nx >= SW || ny >= SH) ? 0 : src[ny * SW + nx];
        v = dilate ? (v | s) : (v & s);
      }
      d[y * SW + x] = v;
    }
    return d;
  };
  const openAll = morph(morph(paintAll, false), true);

  /* ---- the four cells, found by the gutters between them -------------
     A row or column with nothing of the opened silhouettes in it is a
     gutter and not part of any view, so the runs between them are the
     cells. Two runs each way or this is not the sheet this tool
     understands. */
  function runs(n, isEmpty) {
    const out = [];
    let s = -1;
    for (let i = 0; i < n; i++) {
      const e = isEmpty(i);
      if (!e && s < 0) s = i;
      if (e && s >= 0) { out.push([s, i - 1]); s = -1; }
    }
    if (s >= 0) out.push([s, n - 1]);
    return out;
  }
  const colRuns = runs(SW, x => { for (let y = 0; y < SH; y++) if (openAll[y * SW + x]) return false; return true; });
  const rowRuns = runs(SH, y => { for (let x = 0; x < SW; x++) if (openAll[y * SW + x]) return false; return true; });
  if (colRuns.length !== 2 || rowRuns.length !== 2)
    throw bad(`expected a two-by-two sheet, found ${colRuns.length} columns and ${rowRuns.length} rows of views`);

  /* Reading order, which is the order the sheets are drawn in. Asserted
     below against the shapes, because a sheet laid out some other way
     has to fail loudly rather than come out inside out. */
  const CELLS = {
    front: [colRuns[0][0], colRuns[0][1], rowRuns[0][0], rowRuns[0][1]],
    rear:  [colRuns[1][0], colRuns[1][1], rowRuns[0][0], rowRuns[0][1]],
    side:  [colRuns[0][0], colRuns[0][1], rowRuns[1][0], rowRuns[1][1]],
    top:   [colRuns[1][0], colRuns[1][1], rowRuns[1][0], rowRuns[1][1]],
  };

  /* ---- one view ----------------------------------------------------
     `box` is where the vehicle is; `solid` is its outline with the
     windows filled in; `glass` is which of those filled pixels were
     window. */
  function view([x0, x1, y0, y1]) {
    const w = x1 - x0 + 1, h = y1 - y0 + 1, n = w * h;
    const paint = new Uint8Array(n);            // key(0) / not key(1), as drawn
    const opened = new Uint8Array(n);           // and the same, ruled
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      paint[y * w + x] = paintAll[(y0 + y) * SW + (x0 + x)];
      opened[y * w + x] = openAll[(y0 + y) * SW + (x0 + x)];
    }

    /* WHAT THE RULER LEFT, IN PIECES. The obvious next step is the
       largest blob and nothing else, and on a van that is right: what
       else survives a 5x5 opening is a mirror or a stray line, and both
       are one percent of the body. On a PICKUP TRUCK it throws away the
       truck. Its windscreen is drawn see-through, so the head-on view's
       body is one island and its bumper another, and the rear view's
       wheels stand clear of the tailgate on either side — six percent,
       six percent and twenty percent of the body, and without them the
       front view is three quarters of its own height and the sheet is
       thrown out for having two different vehicles on it.

       So the vehicle is every piece at least BLOB_MIN of the biggest
       one. Measured across these six sheets the gap is not close: real
       parts are 6% and up, specks and mirrors are 1% and under. (Losing
       the mirrors is right, incidentally, and not a compromise — the
       three views only agree about the width because none of them counts
       a wing mirror as bodywork.) */
    const lab = new Int32Array(n).fill(-1);
    const size = [];
    for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
      if (lab[sy * w + sx] >= 0 || !opened[sy * w + sx]) continue;
      const id = size.length; let cnt = 0; const st = [sx, sy]; lab[sy * w + sx] = id;
      while (st.length) {
        const y = st.pop(), x = st.pop(); cnt++;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (lab[j] >= 0 || !opened[j]) continue;
          lab[j] = id; st.push(nx, ny);
        }
      }
      size.push(cnt);
    }
    if (!size.length) throw bad('a view has nothing in it but chroma key');
    const keep = Math.max(...size) * BLOB_MIN;
    const blob = new Uint8Array(n);
    let a = 1e9, b = -1, c = 1e9, d = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const id = lab[y * w + x];
      if (id < 0 || size[id] < keep) continue;
      blob[y * w + x] = 1;
      if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y;
    }

    /* what is not the blob and cannot be reached from the border is
       enclosed BY the blob: a window, or the inside of one */
    const outside = new Uint8Array(n);
    const st2 = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (outside[i] || blob[i]) return;
      outside[i] = 1; st2.push(x, y);
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (st2.length) { const y = st2.pop(), x = st2.pop(); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }

    const solid = new Uint8Array(n);
    for (let i = 0; i < n; i++) solid[i] = (blob[i] || !outside[i]) ? 1 : 0;
    /* THE RAW SILHOUETTE WITH ITS HOLES FILLED, for the outline. The
       opened mask is the ruler and it is right for the box, but its
       erosion thins a pillar to nothing and then a window reaches the
       background through the gap and the roof line dives into it: on
       the hatchback, the rear window took a twenty-pixel bite out of
       the roof. The raw pixels still have the pillars. So the outline
       is traced on the raw paint with everything it encloses filled in,
       and whatever specks that brings back are dealt with in one
       dimension, on the top edge, where they are cheap to see. */
    const reach = new Uint8Array(n);
    const st3 = [];
    const push3 = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (reach[i] || paint[i]) return;
      reach[i] = 1; st3.push(x, y);
    };
    for (let x = 0; x < w; x++) { push3(x, 0); push3(x, h - 1); }
    for (let y = 0; y < h; y++) { push3(0, y); push3(w - 1, y); }
    while (st3.length) { const y = st3.pop(), x = st3.pop(); push3(x + 1, y); push3(x - 1, y); push3(x, y + 1); push3(x, y - 1); }
    const filled = new Uint8Array(n);
    for (let i = 0; i < n; i++) filled[i] = reach[i] ? 0 : 1;
    /* GLASS IS KEY THE RAW PAINT ENCLOSES, for the same reason. Against
       the opened blob a side window whose pillars are thinner than the
       ruler reaches the border through the gap and is filled as
       BACKGROUND — body colour at full strength — so the hatchback's
       side windows came out painted over in red. The raw pillars hold. */
    const glass = new Uint8Array(n);
    for (let i = 0; i < n; i++) glass[i] = (!paint[i] && filled[i]) ? 1 : 0;
    return {
      cell: { x: x0, y: y0, w, h }, solid, glass, paint, filled,
      box: { x: a, y: c, w: b - a + 1, h: d - c + 1 },   // relative to the cell
      at: (x, y) => solid[(y + c) * w + (x + a)],        // relative to the box
      rawAt: (x, y) => filled[(y + c) * w + (x + a)],    // the same, off the raw paint
    };
  }

  const V = Object.fromEntries(Object.entries(CELLS).map(([k, c]) => [k, view(c)]));

  /* ---- is this the sheet we think it is? --------------------------- */
  const ar = v => v.box.w / v.box.h;
  if (!(ar(V.side) > 1 && ar(V.top) > 1))
    throw bad('the bottom two views are not wider than they are tall, so they are not the side and the plan');
  /* A road vehicle is longer than it is wide, so a view down its length
     is proportionally narrower than a view across it. (The obvious test
     — head-on views are taller than they are wide — is true of a van and
     false of a hatchback, which is exactly the sort of thing that was
     only ever true because there was one sheet.) */
  if (!(ar(V.front) < ar(V.side) && ar(V.rear) < ar(V.side)))
    throw bad('the top two views are no narrower for their height than the side view, so they are not the front and the rear');
  /* Nothing here separates the side view from the plan by shape, and the
     obvious try — a vehicle is taller than it is wide — is another one
     that only holds for vans. It does not need one: swap those two and
     the three views stop agreeing about the width by a factor, which the
     check below catches with a better error than a guess would. */
  const fr = Math.abs(V.front.box.w * V.rear.box.h - V.rear.box.w * V.front.box.h) / (V.front.box.w * V.rear.box.h);
  if (fr > 0.05) throw bad(`the front and rear views are ${(fr * 100).toFixed(1)}% different in shape; they should be the same vehicle`);

  /* ---- reconcile: three views, one width --------------------------- */
  const S = V.side.box, F = V.front.box, R = V.rear.box, T = V.top.box;
  const LEN = S.w, HGT = S.h;
  const widths = {
    front: F.w * HGT / F.h,      // scale the front so its height matches the side's
    rear:  R.w * HGT / R.h,
    top:   T.h * LEN / T.w,      // scale the plan so its length matches the side's
  };
  const WID = (widths.front + widths.rear + widths.top) / 3;
  const agree = (Math.max(...Object.values(widths)) - Math.min(...Object.values(widths))) / WID;
  if (agree > AGREE_MAX)
    throw bad(`the three views disagree about the width by ${(agree * 100).toFixed(1)}% (${JSON.stringify(widths)}); that is not one vehicle`);

  /* ---- where the roof line is, in each view that draws one ----------
     The views agree about the vehicle's PROPORTIONS to about a percent.
     They do not agree about where the vehicle sits inside its own frame:
     the head-on views draw a taller light bar and shallower wheels than
     the side view does, which slides everything else three percent of
     the height down the frame. Mapping frame to bounding box then puts
     the model's roof up where the head-on view has only light bar, and
     the nose and the tail come out with a pale band along the top.

     So the scale still comes from the frames — that is the measurement
     that agrees — and the OFFSET comes from the roof line, which every
     view draws unambiguously: scan down from the top of the silhouette
     and the roof is the first row that runs most of what this view shows
     up here at all.

     MOST OF WHAT THIS VIEW SHOWS UP HERE, and not most of the vehicle's
     length or width, is the whole of what makes this work on more than
     one shape. A van's roof runs half its length; a pickup's cab roof
     runs a quarter of its, and against a fraction of the LENGTH the side
     view would sail past the cab and anchor on the bonnet — which is a
     different feature from the one the front view finds, and the paint
     would slide a fifth of the height. Measured against the longest run
     in the top ROOF_ZONE of each view instead, a light bar is still a
     narrow thing sitting on a roof and a cab roof is still a roof, and
     both views find the same horizontal. A vehicle with nothing on top
     of it finds its roof in the first row or two, which is frame
     alignment, which is what it should be. */
  function longestRun(v, box, y) {
    let run = 0, best = 0;
    for (let x = 0; x < box.w; x++) {
      if (v.at(x, y)) { if (++run > best) best = run; } else run = 0;
    }
    return best;
  }
  function roofRow(v, box, frac) {
    const lim = Math.max(1, Math.round(box.h * ROOF_ZONE));
    let peak = 0;
    for (let y = 0; y < lim; y++) peak = Math.max(peak, longestRun(v, box, y));
    const need = peak * frac;
    for (let y = 0; y < lim; y++) if (longestRun(v, box, y) >= need) return y;
    return 0;
  }
  const sideRoofRow = roofRow(V.side, S, ROOF_RUN);
  const sideRoof = HGT - sideRoofRow;

  /* each view's window on the model, in side-view pixels: how far up the
     bottom and top edges of its frame sit, and how wide it is */
  function windowOf(v, box, width) {
    const k = HGT / box.h;                                  // side px per view px
    const roof = (box.h - roofRow(v, box, ROOF_SPAN)) * k;
    const z0 = sideRoof - roof;
    return { z0, z1: z0 + box.h * k, half: width / 2 };
  }
  const WINDOW = {
    front: windowOf(V.front, F, widths.front),
    rear: windowOf(V.rear, R, widths.rear),
    side: { z0: 0, z1: HGT, half: null },
    top: { z0: null, z1: null, half: widths.top / 2 },
  };

  /* ---- the outline of the side view -------------------------------- */
  const topEdge = new Int32Array(LEN), botEdge = new Int32Array(LEN);
  for (let x = 0; x < LEN; x++) {
    let t = -1, b = -1;
    for (let y = 0; y < HGT; y++) if (V.side.at(x, y)) { if (t < 0) t = y; b = y; }
    topEdge[x] = t < 0 ? HGT : t;
    botEdge[x] = b < 0 ? 0 : b;
  }
  /* The underside is the commonest bottom edge — a long flat run of it —
     and anything well below that is a wheel. A tracked vehicle's
     underside IS its track, so it has no dips at all and says so. */
  const hist = new Int32Array(HGT + 1);
  for (let x = 0; x < LEN; x++) hist[botEdge[x]]++;
  let sillRow = 0;
  for (let y = 0; y <= HGT; y++) if (hist[y] > hist[sillRow]) sillRow = y;
  const wheelRuns = [];
  for (let x = 0, s = -1; x <= LEN; x++) {
    const on = x < LEN && botEdge[x] > sillRow + WHEEL_TOL * LEN;
    if (on && s < 0) s = x;
    if (!on && s >= 0) { if (x - s > LEN * 0.03) wheelRuns.push([s, x - 1]); s = -1; }
  }
  if (wheelRuns.length !== spec.wheels)
    throw bad(`the side view's underside dips ${wheelRuns.length} times; this one was declared to show ${spec.wheels} wheels`);

  /* ---- THE HULL ------------------------------------------------------
     Three silhouettes, one solid. The side view's silhouette, extruded
     across the width, is a slab the vehicle lies inside; the plan's,
     extruded down, is another; the head-on views', extruded along the
     length, a third. The vehicle is inside all three, and the
     intersection — the VISUAL HULL — is as tight as three pictures can
     make it. Three curves say where it is:

       columns  along the length: the side view's top edge and the plan
                view's half width at each x
       levels   up the height: the head-on views' half width at each z

     and js/car.js puts a vertex at every column and level, at
     z = min(level, top of the column), y = min(plan half, head-on half).
     That is the whole of it: the nose corners round off because the plan
     view rounds them, the roof shoulders because the front view rounds
     them, a windscreen is a slope because the side view draws one, and a
     riot van's bonnet is narrower than its cab because its plan view
     says so. Nothing is named. Each curve is simplified to its
     breakpoints (Douglas-Peucker: throw away every point within HULL_TOL
     of the straight line through its neighbours) rather than sampled at
     a pitch, so a straight roof is two columns and a rounded corner is
     four or five, and the tolerance is half a percent of the length —
     about a pixel — because tight is the point. Looser than a pixel and
     the paint that lands on the parts of the solid the picture did not
     draw is bled body colour; tighter than the drawing and it is nothing.

     THE OUTLINE IT REPLACES was the side view's silhouette, simplified to
     a dozen points and lofted across the front view's width at each
     height: the right silhouette from the side, and a rectangle from
     above — square nose corners, a crease for a shoulder, and the bled
     fill painted over every corner the picture had rounded off. And a
     staircase of boxes before that. The picture had the shape the whole
     time, in three views; the tool was reading one of them.

     THE WHEELS STAY SEPARATE. A head-on silhouette cannot tell a tyre
     from the body behind it, so the hull's lower rows are tyre to tyre;
     the plan view, which sees the body over the tyres, clamps that back
     to the body — and the body's underside is the sill, with the wheels
     hanging below it as their own prisms, a lip inside the flank. */
  /* A vehicle with no wheels has nothing else to stand on, so its sill
     IS the ground: the tracked one's underside is its track, a pixel up
     in the drawing, and taken literally the whole APC hovers that pixel. */
  const sillZ = spec.wheels === 0 ? 0 : HGT - sillRow;
  /* model units, where the LENGTH is 1: x runs +0.5 at the nose to -0.5
     at the tail. A side view drawn nose to the left runs the other way
     from the model's x; one drawn nose to the right runs with it. */
  const mx = spec.nose === 'right' ? (px => px / LEN - 0.5) : (px => 0.5 - px / LEN);
  /* WALK THE EDGE OF THE SILHOUETTE. Not "the top edge as a function of
     x plus the nose and tail as functions of z" — that retraces every
     sloped edge twice, once from each pass, and the outline comes out
     doubling back on itself. Moore neighbour tracing on the mask above
     the sill gives the boundary once, in order, whatever shape it is. */
  /* Filled from the sill to the top edge in every column, because the
     silhouette has notches the body does not: a side window whose pillar
     thinned out under the opening reaches the green, and so does the gap
     between a bumper and the tyre behind it. A car has no undercut worth
     a polygon point, so everything under the roof line is body. */
  const NOTCH = Math.max(1, Math.round(0.035 * LEN));
  /* the top edge off the raw silhouette, as a height above ground, with
     anything narrower than the ruler knocked off it (a one-dimensional
     opening: the lowest within SPECK either side, then the highest of
     those — a spike thinner than the window cannot survive it, a roof
     rack can) */
  const SPECK = 2;
  const rawTop = new Int32Array(LEN);
  for (let px = 0; px < LEN; px++) {
    let t = -1;
    for (let y = 0; y < HGT; y++) if (V.side.rawAt(px, y)) { t = y; break; }
    rawTop[px] = t < 0 ? topEdge[px] : Math.min(t, topEdge[px] + 0) ;
  }
  const rawH0 = Array.from(rawTop, t => HGT - t);
  const ero = rawH0.map((_, px) => Math.min(...rawH0.slice(Math.max(0, px - SPECK), px + SPECK + 1)));
  const rawH = ero.map((_, px) => Math.max(...ero.slice(Math.max(0, px - SPECK), px + SPECK + 1)));
  if (process.env.PROFILE_DEBUG === spec.id) console.error(spec.id, 'top edge heights, px 0..LEN-1:', Array.from(rawH).join(' '));
  /* A CLOSING on the top edge — take the highest point within NOTCH
     either side, then the lowest of those — fills any slot narrower
     than the window and leaves anything wider exactly as it was. The
     hatchback's windscreen header is thinner than the opening's ruler,
     so for two columns its roof is not there and its top edge is the
     bonnet: a slot the depth of the greenhouse, two pixels wide, that
     a body does not have. A pickup's cab-to-bed step is forty pixels
     wide and is untouched. */
  const lifted = rawH.map((h, px) => {
    /* only where there is a full window either side: a closing that runs
       off the end of the array fills the step in front of a van's
       windscreen as if it were a slot, and a van has a bonnet */
    if (px < NOTCH || px + NOTCH >= LEN) return h;
    const L = Math.max(...rawH.slice(px - NOTCH, px)), R = Math.max(...rawH.slice(px + 1, px + NOTCH + 1));
    return Math.max(h, Math.min(L, R));
  });
  /* AND BRIDGED, NOT FILLED. The closing says WHICH columns are a slot;
     what it fills them to is the lower of the two banks, and the slot
     that matters sits exactly where a windscreen meets a roof, where the
     banks are not level: the header is on a slope, so the lower bank is
     the windscreen several pixels back from the top, and the fill leaves
     a step up to the roof that the outline then faithfully keeps as a
     ledge. So every run of raised columns is refilled with the straight
     line from the last real column before it to the first after it. */
  const closed = lifted.slice();
  for (let px = 0; px < LEN;) {
    if (lifted[px] <= rawH[px]) { px++; continue; }
    let end = px;
    while (end + 1 < LEN && lifted[end + 1] > rawH[end + 1]) end++;
    const a = px - 1, b = end + 1;
    if (a >= 0 && b < LEN)
      for (let i = px; i <= end; i++) closed[i] = rawH[a] + (rawH[b] - rawH[a]) * (i - a) / (b - a);
    px = end + 1;
  }
  const height = px => closed[px];

  /* Douglas-Peucker: keep the ends, then every point farther than `tol`
     from the line through the points already kept, until none is. */
  function simplify(pts, tol) {
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i0, i1] = stack.pop();
      const [ax, ay] = pts[i0], [bx, by] = pts[i1];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      let worst = 0, at = -1;
      for (let i = i0 + 1; i < i1; i++) {
        const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
        if (d > worst) { worst = d; at = i; }
      }
      if (at >= 0 && worst > tol) { keep[at] = 1; stack.push([i0, at], [at, i1]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  /* A CLOSING, ONE-DIMENSIONAL, on any edge: every point is lifted to the
     lower of the highest points within `win` either side of it, so a
     slot narrower than the window fills and anything wider is left
     exactly as it was — the same thing the side view's top edge went
     through above, because every edge on these sheets has the same
     specks in it: the gap between a bumper and a wheel arch, seen from
     above, is a notch in the plan's edge, and the shadow under a mirror
     is one in the head-on outline. Only where there is a full window
     either side: at the ends it would fill a rounded nose corner as if
     it were a slot in a straight edge, and the corner is the point. */
  const closeEdge = (arr, win) => arr.map((h, i) => {
    if (i < win || i + win >= arr.length) return h;
    const L = Math.max(...arr.slice(i - win, i)), R = Math.max(...arr.slice(i + 1, i + win + 1));
    return Math.max(h, Math.min(L, R));
  });

  /* the side view's top edge at every pixel EDGE along the length, as a
     height above the ground in side px: the higher of the two columns
     either side of the edge, so the hull encloses the pixels */
  const topAtEdge = e => Math.max(closed[Math.max(0, e - 1)], closed[Math.min(LEN - 1, e)]);
  /* the plan view's half width at each of its own columns, in side px —
     its whole extent top edge to bottom edge, halved, the vehicle being
     symmetric about its own middle. It faces left (nose at column 0)
     whichever way the side view faces, and its length is the vehicle's. */
  const planRaw = [];
  for (let tx = 0; tx < T.w; tx++) {
    let a = -1, b = -1;
    for (let ty = 0; ty < T.h; ty++) if (V.top.at(tx, ty)) { if (a < 0) a = ty; b = ty; }
    planRaw.push(a < 0 ? 0 : (b - a + 1) / 2 * (WID / T.h));
  }
  const planCol = closeEdge(planRaw, Math.max(1, Math.round(NOTCH_W * T.w)));
  const planAt = x => {                                    // model x -> side px
    const t = (0.5 - x) * T.w - 0.5;
    const i = Math.max(0, Math.min(T.w - 1, Math.floor(t))), j = Math.min(T.w - 1, i + 1);
    const f = Math.max(0, Math.min(1, t - i));
    return planCol[i] + (planCol[j] - planCol[i]) * f;
  };
  /* the head-on views' half width at every row, in side px, against the
     height that row is at in the side view's frame (the frames were
     anchored on the roof line above, so a row's height is known). The
     WHOLE extent of the row, tyre to tyre where there are tyres — a
     head-on silhouette cannot tell a tyre from the body behind it, and
     the plan view is what clamps those rows back to the body. A row with
     nothing in it at all (the pickup has daylight between its bumper
     and its tyres) is not evidence of anything, and takes the row above. */
  const headCurve = (v, box, win) => {
    const raw = [];
    for (let r = 0; r < box.h; r++) {
      let a = -1, b = -1;
      for (let x = 0; x < box.w; x++) if (v.at(x, r)) { if (a < 0) a = x; b = x; }
      raw.push(a < 0 ? (r ? raw[r - 1] : 0) : (b - a + 1) / 2 * (WID / box.w));
    }
    const half = closeEdge(raw, Math.max(1, Math.round(0.06 * box.h)));
    return half.map((h, r) => [win.z1 - (r + 0.5) / box.h * (win.z1 - win.z0), h]);   // top row first
  };
  const headAt = (curve, z) => {
    if (z >= curve[0][0]) return curve[0][1];
    for (let i = 1; i < curve.length; i++) if (z >= curve[i][0]) {
      const f = (z - curve[i][0]) / (curve[i - 1][0] - curve[i][0] || 1);
      return curve[i][1] + (curve[i - 1][1] - curve[i][1]) * f;
    }
    return curve[curve.length - 1][1];
  };
  const headFront = headCurve(V.front, F, WINDOW.front), headRear = headCurve(V.rear, R, WINDOW.rear);
  /* Both head-on views see the same widths — each is the widest the
     vehicle gets at that height, whichever end it is seen from — so
     where they differ it is the drawing and not the vehicle: the
     pickup's rear bumper is a chrome bar thinner than the ruler, and
     ruled away it leaves the rear view four rows of nothing but tow
     hitch, which averaged with the front would put a groove round the
     truck at bumper height. So the WIDER of the two is the measurement:
     whatever either view vouches for. And nothing is wider than the
     width the three views reconciled to. */
  const headHalf = z => Math.min(WID / 2, Math.max(headAt(headFront, z), headAt(headRear, z)));

  /* the breakpoints of each curve, and the union of the two that run
     along the length */
  const topMost = Math.max(...Array.from({ length: LEN + 1 }, (_, e) => topAtEdge(e)));
  const hullTol = HULL_TOL * LEN;
  const edgesTop = [], edgesPlan = [];
  for (let e = 0; e <= LEN; e++) { edgesTop.push([e, topAtEdge(e)]); edgesPlan.push([e, planAt(mx(e))]); }
  const keepE = new Set([0, LEN]);
  for (const c of [edgesTop, edgesPlan]) for (const [e] of simplify(c, hullTol)) keepE.add(e);
  const levelsRaw = [];
  for (let z = sillZ; z < topMost; z += 0.5) levelsRaw.push([z, headHalf(z)]);
  levelsRaw.push([topMost, headHalf(topMost)]);
  const keepZ = new Set([sillZ, topMost]);
  for (const [z] of simplify(levelsRaw, hullTol)) keepZ.add(z);
  /* No two breakpoints farther apart than HULL_GAP — a long straight roof
     still gets a column now and then, so the shoulder can follow the
     plan's slow taper between them — and none closer than HULL_MERGE,
     which is under two pixels; the ends always stay. */
  const spread = (keys, integer) => {
    const ks = [...keys].sort((a, b) => a - b), out = [ks[0]];
    for (let i = 1; i < ks.length; i++) {
      const gap = ks[i] - out[out.length - 1], n = Math.ceil(gap / (HULL_GAP * LEN));
      for (let k = 1; k < n; k++) { const v = out[out.length - 1] + gap / n; out.push(integer ? Math.round(v) : v); }
      out.push(ks[i]);
    }
    const kept = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const close = out[i] - kept[kept.length - 1] < HULL_MERGE * LEN;
      if (!close) kept.push(out[i]);
      else if (i === out.length - 1) kept[kept.length - 1] = out[i];
    }
    return kept;
  };
  const columns = spread(keepE, true).map(e => ({
    x: round(mx(e)), top: round(topAtEdge(e) / LEN), half: round(Math.min(planAt(mx(e)), WID / 2) / LEN),
  }));
  if (spec.nose === 'right') columns.reverse();            // nose first, whichever way the sheet faces
  const levels = spread(keepZ, false).map(z => ({ z: round(z / LEN), half: round(headHalf(z) / LEN) }));
  for (const c of columns)
    if (!(c.top > sillZ / LEN + 1 / LEN)) throw bad(`the side view's top edge at x=${c.x} is at the sill; that is not a body`);
  if (process.env.HULL_DEBUG === spec.id) {
    console.error(spec.id, 'columns (x, top, plan half):', columns.map(c => `(${c.x}, ${c.top}, ${c.half})`).join(' '));
    console.error(spec.id, 'levels (z, head-on half):', levels.map(l => `(${l.z}, ${l.half})`).join(' '));
    console.error(spec.id, 'head-on rows (z, front, rear), in lengths:');
    for (let z = sillZ; z <= topMost; z += 2) console.error(`  ${round(z / LEN, 3)}  ${round(headAt(headFront, z) / LEN, 3)}  ${round(headAt(headRear, z) / LEN, 3)}`);
  }

  /* ---- the tyre, off the bottom of the front view -------------------
     A TYRE IS ONE OF THE TWO THINGS AT THE BOTTOM OF A HEAD-ON VIEW.
     Taking the longest run down there instead gets it right on four of
     these six and catastrophically wrong on the fifth: the custom van
     has a bull bar across its nose, which is one run the whole width of
     the vehicle, and read as a tyre that made each wheel four tenths of
     the van LONG — a slab of rubber from flank to flank. So only rows
     showing exactly two runs count, because that is the row that is
     showing two wheels and nothing else, and the tyre is the wider of
     the pair. */
  let tyre = 0;
  for (let r = F.h - 1; r >= F.h - Math.round(F.h * 0.12); r--) {
    const runs = [];
    for (let x = 0, run = 0; x <= F.w; x++) {
      if (x < F.w && V.front.at(x, r)) run++;
      else { if (run) runs.push(run); run = 0; }
    }
    if (runs.length === 2) tyre = Math.max(tyre, runs[0], runs[1]);
  }
  tyre *= WID / F.w;
  if (!(tyre > 0.06 * WID && tyre < 0.45 * WID))
    throw bad(`a tyre ${tyre.toFixed(1)}px wide on a vehicle ${WID.toFixed(1)}px wide is not a tyre`);

  /* ---- everything in model units, where the LENGTH is 1 -------------
     x runs +0.5 at the nose to -0.5 at the tail, y is +width/2 to the
     vehicle's left, z is 0 on the ground. The side view is drawn nose to
     the left, so its x runs the other way from the model's. */
  const wheels = wheelRuns.map(([a, b]) => {
    const rWidth = (b - a + 1) / 2;                        // half the tyre the arch shows
    const rDepth = sillZ;                                  // and how far it hangs below the sill
    return { x: round(mx((a + b + 1) / 2)), r: round(((rWidth + rDepth) / 2) / LEN) };
  });

  /* ---- the paint ---------------------------------------------------
     Every pixel of every view gets a colour, including the ones that
     were key: the nearest painted pixel, darkened if it was glass. A
     face that overhangs the silhouette lands on paint, never on key. */
  function fill(v) {
    const { cell, glass, paint } = v;
    const { w, h } = cell, n = w * h;
    /* WHERE THE BLED COLOUR COMES FROM is the paint set back from its
       own edge by two pixels. Every edge in a JPEG is fringed, and
       against a green screen the fringe is green: a windscreen slit
       filled from the pixel next to it comes out dark GREEN rather than
       dark glass. Two pixels in from the edge, the colour is the
       vehicle's. */
    const inner = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let all = 1;
      for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !paint[ny * w + nx]) { all = 0; break; }
      }
      inner[y * w + x] = all;
    }
    const src = new Int32Array(n).fill(-1);
    const q = [];
    for (let i = 0; i < n; i++) if (inner[i]) { src[i] = i; q.push(i); }
    if (!q.length) for (let i = 0; i < n; i++) if (paint[i]) { src[i] = i; q.push(i); }
    for (let head = 0; head < q.length; head++) {
      const i = q[head], x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (src[j] >= 0) continue;
        src[j] = src[i]; q.push(j);
      }
    }
    /* AND THE GREEN COMES BACK OFF THE PAINT. A green screen throws
       green light on what is standing in front of it, and white paint
       takes it: the panel van's body is about six units greener than it
       is red or blue all over, everywhere, three pixels in or thirty.
       That is not a fringe and no amount of eroding reaches it. Against
       a saturated green field it reads as white, which is why nobody
       notices in the sheet; cut out and parked on tarmac, it is a pale
       green van.
       So no pixel may be greener than its own strongest other channel.
       That leaves a red car red, a blue one blue and a grey APC grey —
       it only bites where green actually dominates — and it is safe here
       for the reason the whole tool is: nothing that can be cut out of a
       green screen was ever green itself. */
    const rgb = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = src[i] < 0 ? i : src[i];
      const sx = cell.x + (s % w), sy = cell.y + ((s / w) | 0), o = (sy * SW + sx) * 4;
      if (glass[i]) { rgb[i * 3] = GLASS[0]; rgb[i * 3 + 1] = GLASS[1]; rgb[i * 3 + 2] = GLASS[2]; continue; }
      const R = SD[o], G = SD[o + 1], B = SD[o + 2];
      rgb[i * 3] = R;
      rgb[i * 3 + 1] = Math.min(G, Math.max(R, B));
      rgb[i * 3 + 2] = B;
    }
    return rgb;
  }
  const filled = Object.fromEntries(Object.entries(V).map(([k, v]) => [k, fill(v)]));

  return {
    spec, file: inFile, sheet: { w: SW, h: SH },
    V, filled, WINDOW, LEN, HGT, WID, widths, agree,
    sillZ, sideRoof, tyre, columns, levels, wheels, mx,
    /* what the roof test saw, for --roof */
    roofRows: {
      front: roofRow(V.front, F, ROOF_SPAN), rear: roofRow(V.rear, R, ROOF_SPAN),
      side: sideRoofRow,
    },
  };
}

/* =====================================================================
   THE FLEET, MEASURED
   ===================================================================== */
const built = FLEET.map(measure);

/* A vehicle whose head-on views were anchored a long way off where the
   side view put the roof has found two DIFFERENT horizontals rather than
   one, and its nose and tail will be painted with a slice of the wrong
   height. That is what the roof line exists to prevent, so say so. The
   APC does it — a turret and a sensor mast on top mean the side view
   finds the top of the hull and the head-on views find where the hull
   reaches three quarters of its width, and those are not the same place.
   It is a warning and not an error because the APC is not parked
   anywhere; the moment one is, this is the line that says why it looks
   wrong. */
for (const m of built) {
  const off = m.WINDOW.front.z0 / m.HGT;
  if (Math.abs(off) > 0.10)
    console.warn(`! ${m.spec.id}: the head-on views sit ${(off * 100).toFixed(1)}% of the height off the side view's roof line — run --roof`);
}

if (process.argv.includes('--roof')) {
  /* Where each view's roof line landed, and how far apart that put the
     head-on views from the side one. A vehicle whose head-on offset is a
     large fraction of its height has found two different horizontals and
     wants looking at. */
  for (const m of built) {
    const off = (m.WINDOW.front.z0 / m.HGT * 100).toFixed(1);
    console.log(`${m.spec.id.padEnd(10)} height ${String(m.HGT).padStart(4)}  roof row: side ${String(m.roofRows.side).padStart(3)}, front ${String(m.roofRows.front).padStart(3)}, rear ${String(m.roofRows.rear).padStart(3)}  ->  head-on frame offset ${off}% of height`);
  }
  process.exit(0);
}

/* ---- one atlas for the lot ----------------------------------------
   Shelf packing, tallest first, one pixel of gutter all round. Every
   view of every vehicle goes in the same picture so the whole car park
   is one texture and one material — which matters more now than it did
   with one van in it, because a lot full of cars is a lot of meshes. */
const rects = [];
for (const m of built)
  for (const k of Object.keys(m.V))
    rects.push({ m, k, w: m.V[k].box.w, h: m.V[k].box.h });
rects.sort((a, b) => b.h - a.h || b.w - a.w);
let shelfY = 0, shelfH = 0, penX = 0;
for (const r of rects) {
  const bw = r.w + PAD * 2, bh = r.h + PAD * 2;
  if (penX + bw > ATLAS_W) { shelfY += shelfH; shelfH = 0; penX = 0; }
  r.x = penX + PAD; r.y = shelfY + PAD;
  penX += bw; shelfH = Math.max(shelfH, bh);
}
const AH = shelfY + shelfH;
const atlas = new Uint8Array(ATLAS_W * AH * 4);
/* opaque everywhere, including the offcuts between the shelves: a
   vehicle is a solid and nothing on one is ever meant to be seen
   through, so a transparent pixel in here could only ever be a mistake */
for (let i = 3; i < atlas.length; i += 4) atlas[i] = 255;
for (const r of rects) {
  const v = r.m.V[r.k], px = r.m.filled[r.k], cw = v.cell.w;
  /* the gutter is the edge pixel repeated, so nothing bleeds between views */
  /* and a side view that faces right goes in facing left */
  const flip = r.k === 'side' && r.m.spec.nose === 'right';
  for (let y = -PAD; y < r.h + PAD; y++) for (let x = -PAD; x < r.w + PAD; x++) {
    const cx = Math.min(r.w - 1, Math.max(0, x));
    const sx = v.box.x + (flip ? r.w - 1 - cx : cx), sy = v.box.y + Math.min(r.h - 1, Math.max(0, y));
    const s = (sy * cw + sx) * 3, d = ((r.y + y) * ATLAS_W + (r.x + x)) * 4;
    atlas[d] = px[s]; atlas[d + 1] = px[s + 1]; atlas[d + 2] = px[s + 2]; atlas[d + 3] = 255;
  }
}
fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
fs.writeFileSync(OUT_PNG, writePNG(ATLAS_W, AH, atlas));

/* ---- and the numbers ----------------------------------------------- */
function vehicleJS(m) {
  const { LEN, HGT, WID, WINDOW, columns, levels, wheels, sillZ, sideRoof, tyre, agree, spec } = m;
  const views = Object.keys(m.V).map(k => {
    const r = rects.find(r => r.m === m && r.k === k), q = WINDOW[k];
    const f = [`x: ${r.x}`, `y: ${r.y}`, `w: ${r.w}`, `h: ${r.h}`];
    if (q.z0 !== null) f.push(`z0: ${round(q.z0 / LEN)}`, `z1: ${round(q.z1 / LEN)}`);
    if (q.half !== null) f.push(`half: ${round(q.half / LEN)}`);
    return `      ${k}: { ${f.join(', ')} },`;
  }).join('\n');
  return `  ${spec.id}: {
    id: '${spec.id}', name: '${spec.name}', use: '${spec.use}',
    /* nose to tail, in game units: ${spec.metres} m at ${PER_METRE} units to the metre */
    length: ${Math.round(spec.metres * PER_METRE)},
    views: {
${views}
    },
    shape: {
      width: ${round(WID / LEN)},
      height: ${round(HGT / LEN)},
      sill: ${round(sillZ / LEN)},
      tyre: ${round(tyre / LEN)},
      roof: ${round(sideRoof / LEN)},
      columns: [
${columns.map(c => `        [${c.x}, ${c.top}, ${c.half}],`).join('\n')}
      ],
      levels: [
${levels.map(l => `        [${l.z}, ${l.half}],`).join('\n')}
      ],
      wheels: [${wheels.map(w => `{ x: ${w.x}, r: ${w.r} }`).join(', ')}],
      agree: ${round(agree)},
    },
  },`;
}

const js = `/* GENERATED by tools/prep-car.mjs from ${FLEET.map(f => f.file).join(', ')} —
   do not edit by hand.

   ${built.length} vehicles measured off four-view sheets, and where each of those
   ${rects.length} views ended up in ${OUT_PNG}. js/car.js builds boxes
   out of a shape and paints them by projecting that vehicle's views back
   along the axes they were drawn down.

   Every length in \`shape\` is a fraction of the vehicle's own LENGTH, so
   a model has one scale and \`length\` sets it. x is +0.5 at the nose and
   -0.5 at the tail, y is half the width to the vehicle's left, z is 0 on
   the ground. */

/** The atlas. One picture for the whole fleet, so a car park full of
    vehicles is one texture and one material. */
export const CAR_ATLAS = { file: '${OUT_PNG}', w: ${ATLAS_W}, h: ${AH} };

/** The fleet.

    \`views\` is where each of the four rectangles sits in the atlas, in
    its own pixels, plus the window on the model it covers: \`z0\` and
    \`z1\` are the heights its bottom and top edges are at, \`half\` is how
    far either side of the middle its width reaches. The side view's
    frame IS the model's bounding box, so it only needs the heights; the
    plan view's frame is the length, so it only needs the half width.

    \`shape.columns\` runs nose to tail — [x, top, half] per column: how
    high the side view's top edge is at that x, and how far either side
    of the middle the plan view reaches there. \`shape.levels\` runs sill
    to roof — [z, half] per level: how far either side of the middle the
    head-on views reach at that height. A vertex at every column and
    level, at the lower of the two heights and the narrower of the two
    widths, is the body: the visual hull of the three silhouettes.
    \`wheels\` are the dips in the underside, and sit on the ground — a
    tracked vehicle has none. \`roof\` is the height every view was anchored on.
    \`agree\` is how far apart the three views' claims about the width
    were, as a fraction of it: a sheet is over-determined, and this is
    the residual.

    \`use\` is what keeps a riot van and an APC out of a customer car
    park. */
export const VEHICLES = {
${built.map(vehicleJS).join('\n')}
};

/** In the order they were measured, and the ones a shopper might own. */
export const VEHICLE_IDS = ${JSON.stringify(built.map(m => m.spec.id))};
export const CIVILIAN = ${JSON.stringify(built.filter(m => m.spec.use === 'civil').map(m => m.spec.id))};
`;
fs.writeFileSync(OUT_JS, js);

/* ---- what it found ------------------------------------------------- */
const pct = n => (n * 100).toFixed(1) + '%';
for (const m of built) {
  const { spec, LEN, HGT, WID, widths, agree, sillZ, sideRoof, tyre, columns, levels, wheels, WINDOW } = m;
  console.log(`${spec.id} — ${spec.file}  ${m.sheet.w}x${m.sheet.h}`);
  for (const k of Object.keys(m.V)) {
    const r = rects.find(r => r.m === m && r.k === k);
    console.log(`  ${k.padEnd(5)} ${String(r.w).padStart(4)}x${String(r.h).padEnd(4)} -> atlas ${r.x},${r.y}`);
  }
  console.log(`  length ${LEN}  height ${HGT}  width ${WID.toFixed(1)} — front ${widths.front.toFixed(1)}, rear ${widths.rear.toFixed(1)}, plan ${widths.top.toFixed(1)}, agreeing to ${pct(agree)}`);
  console.log(`  proportions ${(LEN / WID).toFixed(2)} : 1 : ${(HGT / WID).toFixed(2)} (length : width : height), so ${spec.metres} m long is ${(spec.metres * WID / LEN).toFixed(2)} wide and ${(spec.metres * HGT / LEN).toFixed(2)} tall`);
  console.log(`  roof line ${sideRoof}px up in the side view; head-on frames span ${WINDOW.front.z0.toFixed(1)}..${WINDOW.front.z1.toFixed(1)} against the side's 0..${HGT}`);
  console.log(`  sill ${sillZ}px; ${wheels.length} wheels${wheels.length ? ` of radius ${wheels.map(w => (w.r * LEN).toFixed(1)).join(' and ')}px at x=${wheels.map(w => w.x).join(', ')}` : ''}; tyre ${tyre.toFixed(1)}px`);
  console.log(`  hull: ${columns.length} columns along the length, ${levels.length} levels up the height; plan half-widths ${Math.min(...columns.map(c => c.half)).toFixed(3)}..${Math.max(...columns.map(c => c.half)).toFixed(3)}, head-on ${Math.min(...levels.map(l => l.half)).toFixed(3)}..${Math.max(...levels.map(l => l.half)).toFixed(3)}`);
  /* HOW MUCH OF EACH VIEW IS KEY THE VEHICLE ENCLOSES — glass the renderer
     let through to the green, plus the gap between a wheel and its arch.
     Every such pixel is painted as dark glass (GLASS above), which is a
     stopgap: a sheet rendered with opaque windows reads ~0% here and
     gets its windows exactly as drawn. */
  const through = Object.entries(m.V).map(([k, v]) => {
    let g = 0, s = 0;
    for (let i = 0; i < v.filled.length; i++) { s += v.filled[i]; g += v.glass[i]; }
    return `${k} ${pct(g / s)}`;
  });
  console.log(`  see-through glass, painted dark: ${through.join(', ')}`);
}
const used = rects.reduce((a, r) => a + r.w * r.h, 0);
console.log(`${OUT_PNG}  ${ATLAS_W}x${AH}, ${rects.length} views, ${pct(used / (ATLAS_W * AH))} of it used`);
console.log(`${OUT_JS}  ${built.length} vehicles`);
