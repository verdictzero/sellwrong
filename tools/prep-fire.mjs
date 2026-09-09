/* =====================================================================
   Give the fire a round bottom
   =====================================================================

     node tools/prep-fire.mjs /path/to/golf

   The flames are the golf project's four twenty-frame looping strips and
   they are good flames, but they were drawn to stand on the ground: the
   bottom row of every frame is the widest part of the fire and it is a
   HARD FLAT EDGE. On the ground that is invisible, because the ground is
   where it ends anyway. Anywhere else it is the only thing you can see.

   And this game puts fire everywhere else. A gondola alight carries its
   flame at eighty units, a burning tree carries one part-way up the
   trunk, and both of them are a billboard standing in the air with
   nothing under it. What that looked like was a rectangle of fire sawn
   off level with the shelf, which is what the flat bottom row is.

   SO THE FOOT IS ROUNDED, and that is the whole tool. Every frame's
   alpha is multiplied by a quarter-ellipse rising off the bottom of the
   cell: at the base row the flame is squeezed to about a third of its
   width, and it opens out to full over the bottom third of the frame. A
   fire that ends in a dome reads as a fire sitting ON something, from
   any angle, at any height, without the engine having to know what it is
   sitting on.

   Two smaller things go with it, because a dome on its own reads as a
   flame that has been trimmed:

     THE GLOW. A soft warm pool at the base, widest where the dome is
     narrowest, drawn UNDER the flame. It is what makes the join look
     like heat rather than like a cut, and it is why the dome can be
     tight without the fire looking like it is floating.

     THE LIFT. The flame is nudged a couple of rows up the cell, so the
     dome sits inside the sprite instead of on its very last row. A
     sprite's bottom row is the row most likely to be lost to a floor,
     and losing the dome is losing the point.

   The smoke strip is left exactly as it came: smoke has no foot.

   NOTHING IS RECOLOURED and no frame is redrawn. This is a mask, a
   translate, and an additive pool, applied to somebody else's pixels.
   ===================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { readPNG, writePNG } from './png-read.mjs';

const SRC = process.argv[2];
if (!SRC) { console.error('usage: prep-fire.mjs /path/to/golf'); process.exit(1); }
const IN = path.join(SRC, 'sprites', 'fire');
const OUT = new URL('../assets/fire/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

/* Which strips get a foot, and what their cells are. The cells are
   square in every one of them, so the cell size is the height. */
const SHAPED = ['flame', 'blaze', 'ember'];
const PLAIN = ['smoke'];

/* How much of the frame the dome occupies, and how tight it is at the
   base. `waist` 0.34 means the bottom row keeps about a third of its
   width — narrow enough to read as a foot, wide enough that a small
   flame does not come to a point. */
const DOME = 0.40, WAIST = 0.24, LIFT = 0.09, GLOW = 0.34;

function shape(im, cell) {
  const n = Math.floor(im.w / cell);
  const h = im.h;
  const lift = Math.max(1, Math.round(h * LIFT));
  const out = new Uint8ClampedArray(im.data.length);

  for (let f = 0; f < n; f++) {
    const x0 = f * cell;

    /* the flame's own centre of mass across the frame, so the dome is
       under the fire rather than under the middle of the cell */
    let sx = 0, sw = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < cell; x++) {
        const a = im.data[(y * im.w + x0 + x) * 4 + 3];
        if (a > 8) { sx += x * a; sw += a; }
      }
    const cx = sw ? sx / sw : cell / 2;

    /* THE POOL FIRST, so the flame lands on top of it. Warm, low, and
       widest exactly where the dome pinches the flame in. */
    for (let y = h - Math.round(h * DOME); y < h; y++) {
      const u = (h - 1 - y) / Math.max(1, h * DOME - 1);       // 0 at the base
      /* THE POOL FADES OUT AT ITS OWN BOTTOM TOO. A glow that simply
         stops at the last row of the cell is a second flat edge, put
         there to hide the first one. So it rises, peaks just under where
         the flame's foot is, and is gone by the base. */
      const vert = Math.sin(Math.min(1, u / 0.55) * Math.PI);
      if (vert <= 0.01) continue;
      const spread = cell * 0.24 * (1 - u * 0.45);
      for (let x = 0; x < cell; x++) {
        const d = Math.abs(x - cx) / Math.max(1, spread);
        if (d >= 1) continue;
        const t = (1 - d * d) * vert * GLOW;
        if (t <= 0.02) continue;
        const o = (y * im.w + x0 + x) * 4;
        out[o] = Math.min(255, out[o] + 255 * t);
        out[o + 1] = Math.min(255, out[o + 1] + 150 * t);
        out[o + 2] = Math.min(255, out[o + 2] + 40 * t);
        out[o + 3] = Math.min(255, out[o + 3] + 255 * t * 0.7);
      }
    }

    /* THE FLAME, lifted, with its foot rounded off. */
    for (let y = 0; y < h; y++) {
      const sy = y + lift;                       // where it is read FROM
      if (sy >= h) continue;
      /* The quarter-ellipse: full width above the dome, pinched to
         `waist` at the base — and measured from where the flame's own
         foot ENDS UP, not from the bottom of the cell. Measuring it from
         the cell put the foot a tenth of the way up its own dome, where
         the curve has already opened out to three quarters, and the
         flat edge survived the whole exercise. */
      const up = (h - 1 - lift - y) / Math.max(1, h * DOME);
      const keep = up >= 1 ? 1
        : WAIST + (1 - WAIST) * Math.sqrt(Math.max(0, 1 - (1 - up) * (1 - up)));
      const halfMax = cell * 0.5;
      for (let x = 0; x < cell; x++) {
        const s = (sy * im.w + x0 + x) * 4;
        const a = im.data[s + 3];
        if (a < 8) continue;
        const d = Math.abs(x - cx) / halfMax;
        /* inside the dome it survives whole; outside it fades rather
           than being cut, or the dome would be a second flat edge */
        let k = 1;
        if (d > keep) k = Math.max(0, 1 - (d - keep) / Math.max(0.06, keep * 0.55));
        if (k <= 0.02) continue;
        const o = (y * im.w + x0 + x) * 4;
        const na = a * k;
        /* over the pool */
        const pa = out[o + 3] / 255, fa = na / 255, ta = fa + pa * (1 - fa);
        if (ta <= 0) continue;
        for (let c = 0; c < 3; c++)
          out[o + c] = Math.round((im.data[s + c] * fa + out[o + c] * pa * (1 - fa)) / ta);
        out[o + 3] = Math.round(ta * 255);
      }
    }
  }
  return { w: im.w, h, data: out };
}

let wrote = 0;
for (const k of SHAPED) {
  const im = readPNG(path.join(IN, `SPRITE_fire_${k}_20.png`));
  const cell = im.h;                                  // the cells are square
  const done = shape(im, cell);
  const bytes = writePNG(done.w, done.h, Buffer.from(done.data.buffer, done.data.byteOffset, done.data.length));
  fs.writeFileSync(new URL(`${k}.png`, OUT), bytes);
  console.log(`assets/fire/${k}.png: ${Math.floor(im.w / cell)} x ${cell}x${im.h}, footed, ${(bytes.length / 1024).toFixed(1)}K`);
  wrote++;
}
for (const k of PLAIN) {
  fs.copyFileSync(path.join(IN, `SPRITE_fire_${k}_20.png`), new URL(`${k}.png`, OUT));
  console.log(`assets/fire/${k}.png: as it came — smoke has no foot`);
  wrote++;
}
console.log(`${wrote} strips`);
