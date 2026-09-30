/* =====================================================================
   Cut a troops sheet into the game's strip format
   =====================================================================

     node tools/prep-troops.mjs SWAT
     node tools/prep-troops.mjs ARMY

   TWO SHEETS NOW, both the user's, both drawn the same way, and this
   was tools/prep-swat.mjs until the second one arrived: which sheet,
   which strip, how tall and how much lift are read off TROOPS in
   js/people.js by the name on the command line, and nothing else
   changed — the SWAT strip this writes is byte for byte the one the
   old tool wrote, which was checked when it was renamed.

   THE SHEETS ARE THE FIRST PEOPLE ART in the game with ROTATIONS in
   it: eleven rows on a magenta ground, the first seven of them five
   views of the same pose — head on, a quarter turn, side on, three
   quarters and from behind — and the rest a death, three frames of
   lying there, and nine of coming apart, drawn from the front only.
   That is Doom's own economy exactly: five drawings, and the other
   three views are the mirror of the second, third and fourth.
   js/people.js knows which (see TROOP_ROTATIONS) and Pix.mirrored does
   the rest. The army sheet has the same eleven rows in the same order
   — same artist, same layout — so it goes through the same cut with
   two numbers of its own.

   IT IS A JPEG, which is why this reads a PNG. There is no JPEG decoder
   in node and there is not going to be one written here for a file
   that is converted once; the PNG in art/ is the JPEG as a browser
   decoded it, byte for byte. What a JPEG costs a sprite sheet is the
   KEY: the magenta is not one colour any more, it is a cloud of them,
   and every edge of every figure carries a halo where the ground bled
   into the ink. So the ground is not tested for, it is MEASURED — how
   magenta a pixel is, as a number — and that number is spent twice:
   as the pixel's transparency, and to unmix the magenta back out of
   what colour is left. A halo pixel that is a third magenta becomes a
   two-thirds-opaque pixel of the colour it was hiding, and the box
   filter below does the rest.

   THE CELLS ARE FOUND, NOT DECLARED. An XY cut — split on empty rows,
   then on empty columns inside each band, and again until nothing
   splits — because the sheet is not on a grid: the widest side view is
   twice the width of the narrowest back view and the lying-down frames
   are stacked three high in the last column. The one place the cut
   needs help is the death row, whose blood reaches the gore row under
   it; that band is split by hand at the one empty line between them.

   ONE SCALE FOR EVERYTHING, off the standing figure: a trooper in
   armour and a helmet is drawn sixty tall against the crowd's
   sixty-two, and every other cell — the side views, the corpse, the
   splash — comes down by the same factor, so a body on the floor is
   the length the person was. The filter is the crowd's: a box filter
   on premultiplied alpha, and a small gain on the coverage so a rifle
   barrel two source pixels wide survives the cut-out test.

   THE ORDER OF THE STRIP is the contract with js/people.js: the turned
   frames first, five cells each in the sheet's own order, and then the
   flat ones. Nothing here is named; the letters are assigned over
   there, off the same two lists, and the count is checked both ends.
   ===================================================================== */

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
import fs from 'node:fs';
import { readPNG, writePNG } from './png-read.mjs';

const { CELLS, TROOPS } = await import('../js/people.js');

const WHICH = (process.argv[2] || 'SWAT').toUpperCase();
const T = TROOPS[WHICH];
if (!T) throw new Error(`no troops called ${WHICH}; js/people.js knows ${Object.keys(TROOPS).join(', ')}`);
const SRC = new URL('../' + T.sheet, import.meta.url);
const OUT = new URL('../' + T.strip, import.meta.url);
const im = readPNG(SRC);
const { w: W, h: H, data } = im;

/* ---------------------------------------------------------------------
   The key
   --------------------------------------------------------------------- */
/** How much of a pixel is the magenta ground, 0..1. Navy, black, orange
 *  muzzle flash, pale visor and red blood all come out at zero; the
 *  ground comes out at one; a halo pixel comes out in between. */
function ground(i) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return Math.max(0, Math.min(1, (Math.min(r, b) - g - 20) / 80));
}
const KEY = [255, 0, 255];

/* AND LIFTED, because the sheet was painted for a bright ground and the
   game is a car park at night. The SWAT uniform is navy at about forty
   of two hundred and fifty-five, which in the linear light the renderer
   works in is two per cent — so a trooper under the lot's floodlights
   came out as a silhouette with a visor, and turning the LIGHT up on
   him (see `lit` on the actor type) barely moved it: twice two per cent
   is four. A tone curve on the way in is what does it: every channel
   raised to this power, which lifts the darks by a lot, the mids by a
   little and leaves the brights where they were, so the navy is still
   navy and is visible at fifty units in a dark lot. The orange muzzle
   flash and the pale visor are already bright and are barely touched.

   THE POWER IS THE SHEET'S OWN, off TROOPS: 0.62 for the navy, 0.85
   for the army's tan and olive, which are three and a half times
   brighter in linear to begin with and would go pale under the SWAT's
   curve. Measured, not guessed — the tool prints the figure's mean
   before and after so the next sheet can be set by the same number. */
const LIFT = T.lift;
const lift = new Uint8Array(256);
for (let i = 0; i < 256; i++) lift[i] = Math.round(255 * Math.pow(i / 255, LIFT));

/** The pixel with the ground unmixed out of it, premultiplied by what
 *  is left — which is the form the box filter wants anyway. */
function pixel(i, out) {
  const m = ground(i), a = 1 - m;
  if (a <= 0.02) { out[0] = out[1] = out[2] = out[3] = 0; return out; }
  for (let k = 0; k < 3; k++) {
    const c = Math.max(0, Math.min(255, (data[i + k] - m * KEY[k]) / a));
    out[k] = lift[Math.round(c)] * a;
  }
  out[3] = a;
  return out;
}

/* ---------------------------------------------------------------------
   Finding the cells
   --------------------------------------------------------------------- */
const solid = (x, y) => ground((y * W + x) * 4) < 0.5;

function runs(x0, y0, x1, y1, axis) {
  const n = axis === 'y' ? y1 - y0 : x1 - x0;
  const has = new Uint8Array(n);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (solid(x, y)) has[axis === 'y' ? y - y0 : x - x0] = 1;
  const out = [];
  let i = 0;
  while (i < n) {
    while (i < n && !has[i]) i++;
    const a = i;
    while (i < n && has[i]) i++;
    if (i > a) out.push([a, i]);
  }
  /* a gap narrower than a JPEG's breath is not a gap */
  const gap = axis === 'y' ? 5 : 7, m = [];
  for (const r of out) {
    if (m.length && r[0] - m[m.length - 1][1] < gap) m[m.length - 1][1] = r[1];
    else m.push(r);
  }
  return m;
}

/** Split a region on empty lines across one axis, then the other, until
 *  nothing splits any more. */
function cut(x0, y0, x1, y1, axis, depth = 0) {
  const m = runs(x0, y0, x1, y1, axis);
  if (!m.length) return [];
  const n = axis === 'y' ? y1 - y0 : x1 - x0;
  const whole = m.length === 1 && m[0][0] === 0 && m[0][1] === n;
  if (whole) return depth ? null : cut(x0, y0, x1, y1, 'x', 1);
  const boxes = [];
  for (const [a, b] of m) {
    const bx0 = axis === 'y' ? x0 : x0 + a, bx1 = axis === 'y' ? x1 : x0 + b;
    const by0 = axis === 'y' ? y0 + a : y0, by1 = axis === 'y' ? y0 + b : y1;
    const sub = cut(bx0, by0, bx1, by1, axis === 'y' ? 'x' : 'y', depth + 1);
    if (sub === null) boxes.push([bx0, by0, bx1, by1]);
    else boxes.push(...sub);
  }
  return boxes;
}

/** Tight bounds, and out with anything too small to be a drawing. */
function tighten(boxes) {
  return boxes.map(([x0, y0, x1, y1]) => {
    let ax = x1, ay = y1, bx = x0, by = y0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        if (solid(x, y)) { if (x < ax) ax = x; if (x + 1 > bx) bx = x + 1; if (y < ay) ay = y; if (y + 1 > by) by = y + 1; }
    return [ax, ay, bx, by];
  }).filter(b => (b[2] - b[0]) * (b[3] - b[1]) > 400);
}

/* THE ONE SEAM THE CUT CANNOT FIND: the death row's blood reaches the
   gore row under it, and their columns do not line up, so together they
   are one box. The emptiest line across the left four fifths of the
   band is the seam, and it is found rather than typed in. */
function seam(y0, y1) {
  let best = -1, least = Infinity;
  for (let y = y0; y < y1; y++) {
    let n = 0;
    for (let x = 0; x < W * 0.78; x++) if (solid(x, y)) n++;
    if (n < least) { least = n; best = y; }
  }
  return best;
}

/** Rows of cells: grouped by their vertical middles, left to right. */
function rowsOf(boxes) {
  const rows = [];
  for (const b of boxes.sort((p, q) => (p[1] + p[3]) - (q[1] + q[3]))) {
    const mid = (b[1] + b[3]) / 2;
    const row = rows.find(r => Math.abs(r.mid - mid) < 70);
    if (row) row.boxes.push(b); else rows.push({ mid, boxes: [b] });
  }
  for (const r of rows) r.boxes.sort((p, q) => p[0] - q[0]);
  return rows;
}

const first = tighten(cut(0, 0, W, H, 'y'));
/* the merged band is the tallest thing on the sheet by a wide margin */
const tall = first.filter(b => b[3] - b[1] > 260);
if (tall.length !== 1) throw new Error(`expected one merged death/gore band, found ${tall.length}`);
const [tx0, ty0, tx1, ty1] = tall[0];
const split = seam(ty0 + 100, ty1 - 100);
/* THE LYING FRAMES ARE STACKED in the last column of the death row, so
   that band is cut COLUMNS FIRST: four frames of falling, then the one
   column that splits three ways top to bottom — which is the order they
   play in. Grouping by rows here put the second lying frame beside the
   third falling one, because their middles were near enough. */
const dying = tighten(cut(tx0, ty0, tx1, split, 'x'));
const gore1 = tighten(cut(tx0, split, tx1, ty1, 'x'));
const above = rowsOf(first.filter(b => b[3] <= ty0));
const below = rowsOf(first.filter(b => b[1] >= ty1));
console.log(`${above.length} turned rows of ${above.map(r => r.boxes.length).join(' ')}, ` +
  `${dying.length} dying, ${gore1.length} + ${below.map(r => r.boxes.length).join(' + ')} coming apart`);

/* ---------------------------------------------------------------------
   Which cell is which — the sheet's own layout, top to bottom
   --------------------------------------------------------------------- */
const turned = above;
const flat = [...dying, ...gore1, ...below.flatMap(r => r.boxes)];
if (turned.length !== T.turn.length)
  throw new Error(`${turned.length} turned rows on the sheet, js/people.js names ${T.turn.length}`);
for (const r of turned)
  if (r.boxes.length !== T.views)
    throw new Error(`a turned row has ${r.boxes.length} views, not ${T.views}`);
if (flat.length !== T.flat.length)
  throw new Error(`${flat.length} flat frames on the sheet, js/people.js names ${T.flat.length}`);

/* the figure's brightness, before and after the curve, for the record */
{
  let n = 0, y0 = 0, y1 = 0;
  for (const r of turned) for (const [x0, ya, x1, yb] of r.boxes)
    for (let y = ya; y < yb; y++) for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      if (!solid(x, y)) continue;
      const Y = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      n++; y0 += Y; y1 += Math.pow(Y, LIFT);
    }
  console.log(`the figure averages ${(y0 / n).toFixed(3)} of white on the sheet, ${(y1 / n).toFixed(3)} after a lift of ${LIFT}`);
}

/* ---------------------------------------------------------------------
   Down to size
   --------------------------------------------------------------------- */
/* the scale, off the standing figure head-on */
const stand = turned[0].boxes[0];
const K = T.height / (stand[3] - stand[1]);
console.log(`standing ${stand[3] - stand[1]} tall on the sheet, ${T.height} in the game: ${K.toFixed(3)}`);

/** A box filter on premultiplied alpha, with the ground unmixed on the
 *  way in — see the note at the top, and tools/prep-people.mjs, which
 *  this is the same filter as. */
function shrink([x0, y0, x1, y1], gain = 1.25) {
  const sw = x1 - x0, sh = y1 - y0;
  const dw = Math.max(1, Math.round(sw * K)), dh = Math.max(1, Math.round(sh * K));
  const out = new Uint8ClampedArray(dw * dh * 4);
  const px = [0, 0, 0, 0];
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y / K), sy1 = Math.min(sh, Math.max(sy0 + 1, Math.ceil((y + 1) / K)));
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x / K), sx1 = Math.min(sw, Math.max(sx0 + 1, Math.ceil((x + 1) / K)));
      let r = 0, g = 0, b = 0, cov = 0, n = 0;
      for (let j = sy0; j < sy1; j++)
        for (let i = sx0; i < sx1; i++) {
          pixel(((y0 + j) * W + x0 + i) * 4, px);
          r += px[0]; g += px[1]; b += px[2]; cov += px[3]; n++;
        }
      const o = (y * dw + x) * 4;
      if (!n || cov <= 0) continue;
      out[o] = Math.round(r / cov); out[o + 1] = Math.round(g / cov); out[o + 2] = Math.round(b / cov);
      out[o + 3] = Math.round(Math.min(1, (cov / n) * gain) * 255);
    }
  }
  return { w: dw, h: dh, data: out };
}

const order = [...turned.flatMap(r => r.boxes), ...flat];
const cells = order.map(b => shrink(b));
const { w: cw, h: ch } = CELLS.troops;

/* A POOL WIDER THAN THE CELL IS TRIMMED, NOT SHRUNK. The army's last
   three gore frames — a splatter and the two pools a body ends as,
   with the helmet in one — come out sixty-five, seventy-one and
   seventy-two across at the scale the standing figure sets, and the
   cell is sixty-four because the rule is sixty-four. The SWAT's sheet
   happened to fit; this one does not, by a few columns of the thin
   smear at a pool's edge. The two honest ways out are to scale the
   whole figure down until the pool fits, which makes an army trooper
   fifty-three tall beside a SWAT at sixty, or to take the outermost
   columns off the pool, which nobody will ever see. So a FLAT frame —
   a thing on the floor, never the figure — may lose up to eight
   columns, split between its two sides, and the tool says how much of
   the ink that was: a tenth of a per cent, four, and two. A turned
   frame over the cell is still an error, as is a pool over by more. */
const TRIM_MAX = 8;
const nTurned = turned.length * T.views;
function trim(c, k) {
  if (c.w <= cw) return c;
  const over = c.w - cw;
  if (k < nTurned || over > TRIM_MAX || c.h > ch)
    throw new Error(`cell ${k} is ${c.w}x${c.h} and does not fit ${cw}x${ch} — widen CELLS.troops in js/people.js, or bring height down`);
  const left = over >> 1;
  const out = new Uint8ClampedArray(cw * c.h * 4);
  let kept = 0, all = 0;
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const a = c.data[(y * c.w + x) * 4 + 3];
      all += a;
      if (x < left || x >= left + cw) continue;
      kept += a;
      const s = (y * c.w + x) * 4, d = (y * cw + x - left) * 4;
      out[d] = c.data[s]; out[d + 1] = c.data[s + 1]; out[d + 2] = c.data[s + 2]; out[d + 3] = a;
    }
  const L = k - nTurned < T.flat.length ? T.flat[k - nTurned] : '?';
  console.log(`cell ${k} (${L}, on the floor) trimmed from ${c.w} to ${cw} across: ${((1 - kept / all) * 100).toFixed(1)}% of its ink was in the ${over} columns cut`);
  return { w: cw, h: c.h, data: out };
}
cells.forEach((c, k) => { cells[k] = trim(c, k); });

const strip = Buffer.alloc(cw * cells.length * ch * 4);
cells.forEach((c, k) => {
  if (c.w > cw || c.h > ch)
    throw new Error(`cell ${k} is ${c.w}x${c.h} and does not fit ${cw}x${ch}`);
  /* centred across, standing on the bottom: a walker's planted foot and
     a corpse's back are both on the floor */
  const ox = k * cw + ((cw - c.w) >> 1), oy = ch - c.h;
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const s = (y * c.w + x) * 4, d = ((y + oy) * cw * cells.length + ox + x) * 4;
      strip[d] = c.data[s]; strip[d + 1] = c.data[s + 1]; strip[d + 2] = c.data[s + 2]; strip[d + 3] = c.data[s + 3];
    }
});
const bytes = writePNG(cw * cells.length, ch, strip);
fs.writeFileSync(OUT, bytes);
console.log(`${T.strip}: ${cells.length} x ${cw}x${ch}, ${(bytes.length / 1024).toFixed(1)}K`);
