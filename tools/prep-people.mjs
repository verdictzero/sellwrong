/* =====================================================================
   Bring the crowd over from the galvarius project
   =====================================================================

     node tools/prep-people.mjs /path/to/galvarius

   The shoppers, the pieces they come apart into, what is left on the
   floor and the fireball that does it are all painted art from
   github.com/verdictzero/galvarius, where they were drawn at that
   game's scale — a standing adult is five hundred and seventy-five
   pixels tall. Here a sprite is drawn ONE UNIT TO THE PIXEL and a person
   is sixty-two units, so everything has to come down by about ten to
   one before it is the same world as the shelves.

   ONE SCALE FOR THE PEOPLE, NOT ONE HEIGHT EACH. Every standee is
   reduced by the same factor, worked out from that 575, rather than
   stretched to a common height. The difference matters: three of these
   drawings are of somebody crouching or sitting, and normalising by
   height would stand them up into giants. Scaling by the artist's own
   scale keeps a crouching person crouched and short, which is what they
   are.

   THE FILTER IS A BOX FILTER ON PREMULTIPLIED ALPHA, which is the only
   part of this with a trap in it. Averaging colour and alpha separately
   pulls the colour of every transparent pixel into its neighbours, and
   at ten to one that surrounds each character with a halo of whatever
   the artist left in the transparent margins. Multiplying by coverage
   first, averaging, then dividing back out is the fix, and the alpha
   gets a small gain afterwards because a limb four pixels wide arrives
   as four tenths of a pixel and the cut-out threshold would otherwise
   eat it.

   EQUAL CELLS, BOTTOM ALIGNED. Every picture is padded into a cell of
   exactly the size js/people.js declares — centred across, standing on
   the bottom — and the cells are laid out left to right into one strip
   per kind. That is the same shape as the fire strips from the golf
   project, so the game cuts them apart with the same code, and it is
   what stops a set of frames of different widths from sliding sideways
   as it plays.

   NOTHING IS RECOLOURED. The pictures keep their own palette; the
   renderer snaps everything to the game's 256 at the end of the frame,
   like it does to the wood and the sky.
   ===================================================================== */

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
import fs from 'node:fs';
import path from 'node:path';
import { readPNG, writePNG } from './png-read.mjs';

const { CELLS, ADULT, SHOPPERS, GIBLETS, SPLATS, BLASTS } = await import('../js/people.js');

const SRC = process.argv[2];
if (!SRC) { console.error('usage: prep-people.mjs /path/to/galvarius'); process.exit(1); }
const A = path.join(SRC, 'galvarius_godot', 'assets');
const OUT = new URL('../assets/people/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

/* A standing adult, over there and over here. Everything the people are
   made of comes down by the ratio, and the CELL is a shade taller than
   the adult because one of the drawings is on tiptoe. */
const THEIR_ADULT = 575;
const K = ADULT / THEIR_ADULT;

/* ---------------------------------------------------------------------
   WHO IS IN THE SHOP

   Seventeen drawings: three men, three of the same man larger, nine
   women in various winter kit, one on a mobility scooter and one dressed
   for aerobics. The yeti and the security pod in the same folder are
   monsters and are not shoppers, so they are not here.
   ------------------------------------------------------------------- */
const PEOPLE = [
  'taco_dude_1', 'taco_dude_2', 'taco_dude_3',
  'taco_fatty_1', 'taco_fatty_2', 'taco_fatty_3',
  'taco_girl_1', 'taco_girl_2', 'taco_girl_3', 'taco_girl_5', 'taco_girl_6',
  'taco_girl_7', 'taco_girl_8', 'taco_girl_9', 'taco_girl_10',
  'taco_ssbbw_walmart_edition_1', 'aerobics_girl_1',
];

/* The pieces. Two cuts of meat, a foot, a handful of guts, a tooth, an
   eye, the intestines, a hand, the ribcage, the heart and the brain —
   which is a complete person if you are not fussy. Bigger than their own
   scale by two thirds, because a seven-pixel piece of somebody flying
   across an aisle at night is not a piece of anything, it is a speck. */
const PIECES = ['gore_0', 'gore_1', 'gore_10', 'gore_11', 'gore_12',
                'gore_2', 'gore_3', 'gore_4', 'gore_7', 'gore_8', 'gore_9'];
const PIECE_ZOOM = 1.8;

/* What stays. The pool is a top-down painting, so it is squashed to lie
   down; the two piles are painted in three-quarter view already and are
   only made bigger. */
const FLOOR = [
  { file: 'blood_puddle', w: CELLS.splat.w, h: 20 },
  { file: 'GORE_random_gore_pile_1', zoom: 2.0 },
  { file: 'GORE_random_gore_pile_2', zoom: 2.0 },
];

/* And the fireball: thirty frames of a mushroom standing up off the
   ground, of which the first few are empty and are dropped. Person-sized
   rather than scaled with everything else — galvarius drew its
   explosions at their own scale, and what is wanted here is one the size
   of the person who has just become it. */
const BLAST_STEM = 'bigger_explosion';

/* =====================================================================
   The pixels
   ===================================================================== */

/** Tight bounds of everything that is not transparent. */
function trim(im) {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++)
      if (im.data[(y * im.w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  if (x1 < 0) return { w: 0, h: 0, data: new Uint8ClampedArray(0) };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = ((y + y0) * im.w + (x + x0)) * 4, d = (y * w + x) * 4;
      data[d] = im.data[s]; data[d + 1] = im.data[s + 1];
      data[d + 2] = im.data[s + 2]; data[d + 3] = im.data[s + 3];
    }
  return { w, h, data };
}

/** Box filter, premultiplied — see the note at the top. `gain` opens the
 *  alpha back up a little so thin things survive the cut-out test. */
function resize(im, W, H, gain = 1.2) {
  W = Math.max(1, W); H = Math.max(1, H);
  const out = new Uint8ClampedArray(W * H * 4);
  const sx = im.w / W, sy = im.h / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(im.h, Math.max(y0 + 1, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(im.w, Math.max(x0 + 1, Math.ceil((x + 1) * sx)));
      let r = 0, g = 0, b = 0, cov = 0, n = 0;
      for (let j = y0; j < y1; j++)
        for (let i = x0; i < x1; i++) {
          const s = (j * im.w + i) * 4, al = im.data[s + 3] / 255;
          r += im.data[s] * al; g += im.data[s + 1] * al; b += im.data[s + 2] * al;
          cov += al; n++;
        }
      const o = (y * W + x) * 4;
      if (!n || cov <= 0) continue;
      out[o] = Math.round(r / cov); out[o + 1] = Math.round(g / cov); out[o + 2] = Math.round(b / cov);
      out[o + 3] = Math.round(Math.min(1, (cov / n) * gain) * 255);
    }
  }
  return { w: W, h: H, data: out };
}

/** A strip of equal cells: centred across, and standing on the bottom
 *  unless told to sit in the middle — a shopper stands on the floor, a
 *  piece of one is tumbling through the air and has no bottom. */
function strip(cells, cw, ch, name, align = 'bottom') {
  const W = cw * cells.length;
  const out = Buffer.alloc(W * ch * 4);
  cells.forEach((c, k) => {
    if (c.w > cw || c.h > ch)
      throw new Error(`${name}: a ${c.w}x${c.h} picture does not fit a ${cw}x${ch} cell — ` +
                      'widen the cell in js/people.js, or the game will cut the strip in the wrong places');
    const ox = k * cw + ((cw - c.w) >> 1);
    const oy = align === 'centre' ? ((ch - c.h) >> 1) : ch - c.h;
    for (let y = 0; y < c.h; y++)
      for (let x = 0; x < c.w; x++) {
        const s = (y * c.w + x) * 4, d = ((y + oy) * W + ox + x) * 4;
        out[d] = c.data[s]; out[d + 1] = c.data[s + 1];
        out[d + 2] = c.data[s + 2]; out[d + 3] = c.data[s + 3];
      }
  });
  const file = new URL(name + '.png', OUT);
  const bytes = writePNG(W, ch, out);
  fs.writeFileSync(file, bytes);
  console.log(`assets/people/${name}.png: ${cells.length} x ${cw}x${ch}, ${(bytes.length / 1024).toFixed(1)}K`);
  return cells.length;
}

const read = (dir, stem) => trim(readPNG(path.join(A, dir, stem + '.png')));
const expect = (what, got, want) => {
  if (got !== want) throw new Error(`${what}: got ${got}, js/people.js says ${want}`);
};

/* =====================================================================
   Do it
   ===================================================================== */

/* --- the shoppers --- */
expect('shoppers listed here', PEOPLE.length, SHOPPERS);
const people = PEOPLE.map(stem => {
  const im = read('NPCs', stem);
  return resize(im, Math.round(im.w * K), Math.round(im.h * K));
});
strip(people, CELLS.shoppers.w, CELLS.shoppers.h, 'shoppers');

/* --- the pieces --- */
expect('pieces listed here', PIECES.length, GIBLETS);
const pieces = PIECES.map(stem => {
  const im = read('gore', stem);
  return resize(im, Math.round(im.w * K * PIECE_ZOOM), Math.round(im.h * K * PIECE_ZOOM));
});
strip(pieces, CELLS.giblets.w, CELLS.giblets.h, 'giblets', 'centre');

/* --- what is left --- */
expect('splats listed here', FLOOR.length, SPLATS);
const floor = FLOOR.map(f => {
  const im = read('gore', f.file);
  const w = f.w ?? Math.round(im.w * K * f.zoom);
  const h = f.h ?? Math.round(im.h * K * f.zoom);
  return resize(im, w, h);
});
strip(floor, CELLS.splat.w, CELLS.splat.h, 'splat');

/* --- the fireball ---
   The one set that is NOT trimmed. These frames are one drawing moving
   inside a fixed 64x128 window — the ball leaves the ground, climbs and
   spreads — so the window IS the animation. Trim each frame to its own
   contents and every one of them is scaled back up to the same size,
   which turns a mushroom cloud rising into a mushroom cloud standing
   still and flickering. They are scaled whole instead.

   AND THERE ARE THIRTY OF THEM, which is four more than a sprite set can
   hold: a frame is a letter and the letters stop at Z. So the thirty are
   resampled evenly down to twenty-six. Nothing is cut off the ends —
   dropping the tail would end the smoke with a pop — and the four
   dropped frames are spread through a sequence smooth enough that the
   loss is not visible at a fifth of a second a frame. */
const blastFiles = fs.readdirSync(path.join(A, 'explosions'))
  .filter(f => f.startsWith(BLAST_STEM) && f.endsWith('.png'))
  .sort();
if (blastFiles.length < BLASTS) throw new Error(`only ${blastFiles.length} explosion frames, need ${BLASTS}`);
if (BLASTS > 26) throw new Error('a sprite set has 26 frames at most, A to Z');
const blast = [];
for (let k = 0; k < BLASTS; k++) {
  const i = Math.round(k * (blastFiles.length - 1) / (BLASTS - 1));
  blast.push(resize(readPNG(path.join(A, 'explosions', blastFiles[i])), CELLS.blast.w, CELLS.blast.h));
}
strip(blast, CELLS.blast.w, CELLS.blast.h, 'blast');
