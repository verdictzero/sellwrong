/* =====================================================================
   GROCERY STORE SIMULATOR — the title
   =====================================================================

   Two lines, one width, leaning together. The name is set in the same
   4x6 pixel face as every price tag in the store, because a title in a
   font the game does not otherwise own reads as a poster stuck on the
   window rather than the name of the place.

   ONE WIDTH is the whole design and it is arithmetic. GROCERY STORE is
   thirteen glyphs at four pixels plus twelve one-pixel gaps: 64 wide.
   Drawn at four times that is 256. SIMULATOR is nine glyphs; drawn at
   six times, each is 24 wide, so the nine take 216 and the eight gaps
   between them share the remaining 40 — five pixels each, exactly.
   Justified letter-spacing, in whole pixels, with nothing stretched.
   `layoutLogo` does that sum and the smoke test holds it to being
   exact, because a logo that is one pixel off flush is a logo that is
   wrong and it is the first thing anybody sees.

   ITALIC AS A GROUP means the shear is applied to the finished pair,
   not to each glyph: every row of the whole block is shifted right by
   a quarter of its height above the baseline, so the two lines lean at
   one angle and stay flush along their slanted left edge. Done per
   pixel row, which on a pixel face is the only italic that is not a
   blur.
   ===================================================================== */

import { Pix, drawText, textWidth } from './pixel.js';

export const LINE1 = 'GROCERY STORE';
export const LINE2 = 'SIMULATOR';
export const SHEAR = 0.24;             // pixels right per pixel up: about 13 degrees

/**
 * The sizes, as numbers only.
 *
 * @param s1  scale of the top line
 * @param s2  scale of the bottom line
 * @returns { w, h, line1: { scale, y }, line2: { scale, gap, y }, shear, extra }
 *   `gap` is the justified space between the bottom line's glyphs, in
 *   pixels; `extra` is how much wider the sheared block is.
 */
export function layoutLogo(s1 = 4, s2 = 6, text1 = LINE1, text2 = LINE2) {
  const w = textWidth(text1, 1) * s1;
  const glyph2 = 4 * s2;
  const n2 = text2.length;
  const gap = (w - n2 * glyph2) / (n2 - 1);
  const h1 = 6 * s1, h2 = 6 * s2, space = Math.round(s1 * 1.5);
  const h = h1 + space + h2;
  return {
    w, h, shear: SHEAR, extra: Math.ceil((h - 1) * SHEAR),
    line1: { text: text1, scale: s1, y: 0, w },
    line2: { text: text2, scale: s2, gap, y: h1 + space, w: n2 * glyph2 + (n2 - 1) * gap },
  };
}

/* A string at a scale, one glyph at a time with a given gap, into a
   Pix. Every font pixel becomes a scale-by-scale block. */
function drawScaled(pix, text, x0, y0, scale, gap, key, t) {
  let x = x0;
  for (const ch of text) {
    const tmp = new Pix(4, 6, 1, false);
    drawText(tmp, ch, 0, 0, key, t, 0);
    for (let sy = 0; sy < 6; sy++)
      for (let sx = 0; sx < 4; sx++) {
        if (tmp.alphaAt(sx, sy) < 8) continue;
        const c = tmp.get(sx, sy);
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++)
            pix.set(x + sx * scale + dx, y0 + sy * scale + dy, c[0], c[1], c[2], 255);
      }
    x += 4 * scale + gap;
  }
}

/**
 * Draw the logo into a fresh Pix, sheared, with a one-block shadow.
 *
 * @param opts  s1, s2 as layoutLogo; colours as ramp keys and positions
 */
export function drawLogo(opts = {}) {
  const L = layoutLogo(opts.s1, opts.s2);
  const shadow = opts.shadow ?? 2;
  const flat = new Pix(L.w + shadow, L.h + shadow, 1, false);
  const c1 = opts.c1 || ['bone', 0.94], c2 = opts.c2 || ['yellow', 0.86];
  /* the shadow first, one step down and right, in near-black */
  drawScaled(flat, L.line1.text, shadow, L.line1.y + shadow, L.line1.scale, L.line1.scale, 'grey', 0.03);
  drawScaled(flat, L.line2.text, shadow, L.line2.y + shadow, L.line2.scale, L.line2.gap, 'grey', 0.03);
  drawScaled(flat, L.line1.text, 0, L.line1.y, L.line1.scale, L.line1.scale, c1[0], c1[1]);
  drawScaled(flat, L.line2.text, 0, L.line2.y, L.line2.scale, L.line2.gap, c2[0], c2[1]);

  /* the lean: every row slides right by how far it is above the bottom */
  const out = new Pix(flat.w + L.extra, flat.h, 1, false);
  for (let y = 0; y < flat.h; y++) {
    const shift = Math.floor((flat.h - 1 - y) * L.shear);
    for (let x = 0; x < flat.w; x++) {
      const a = flat.alphaAt(x, y);
      if (a < 8) continue;
      const c = flat.get(x, y);
      out.set(x + shift, y, c[0], c[1], c[2], a);
    }
  }
  return out;
}
