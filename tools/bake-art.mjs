/* =====================================================================
   GROCERY STORE SIMULATOR — bringing real artwork in
   =====================================================================

     node tools/bake-art.mjs

   Everything else in this game is drawn by code at start-up. Two things
   cannot be: the LOGO, because a procedural approximation of somebody's
   logo is not their logo, and the WEAPON, because it is a photograph of
   a thing and there is no set of primitives that gets you there.

   So they come in as pictures and leave as SOURCE. This reads the PNGs
   in art/, finds the artwork inside each one, resamples it, snaps every
   pixel to the game's own 256-colour palette, run-length encodes it and
   writes js/art-data.js. Nothing is fetched at run time and there is
   still no build step — the build step is this file, run by hand, when
   the art changes.

   TWO WAYS OF FINDING THE ARTWORK, because the two files were made
   differently. The logo sits on a black field, so it is found by
   brightness and saturation. The weapon sits on chroma-key magenta, so
   it is found by "not that colour" — which is also how it gets its alpha
   channel, because a weapon has to be cut out, not letterboxed.

   WHY FOUR TILES FOR THE LOGO. Sixty-four pixels is the rule for every
   texture in the game and the logo does not get an exemption; it gets
   geometry instead. The four tiles are hung as a two-by-two on the
   entrance tower, which is two ceiling steps and one vertical split —
   see the sign box in js/maps/sellwrong.js. A sector engine cannot draw
   a big picture, but it can draw four small ones next to each other,
   which is the same thing and is how every large sign in Doom was done.

   THE WEAPON IS ONE TILE and it is 64x64 like everything else, with the
   gun laid across the bottom at its own aspect and the top of the frame
   left empty. That empty space is not waste: it is where the muzzle
   flame is drawn, procedurally, over the top of the photograph — which
   is how Doom did its weapons too, one still sprite and a separate
   flash.

   THE ENCODING is run-length pairs of (palette index, count) in base64.
   A logo is mostly flat colour, so a 4096-pixel tile comes out around a
   kilobyte, and the decoder is nine lines that run unchanged in Node and
   in the browser.
   ===================================================================== */

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
import fs from 'node:fs';
import { readPNG } from './png-read.mjs';

const { PALETTE } = await import('../js/palette.js');

/* ---------- where the artwork is ----------
   The bounding box of everything that is not the background. Background
   is judged as "dark AND unsaturated", which keeps the black outline and
   the black trolley — both of which are the logo — and drops the field
   they are sitting on.

   SATURATION IS MEANINGLESS IN THE DARK, and that is worth stating
   because it cost an iteration: (0, 2, 1) — a single unit of compression
   noise on a black field — has a max of 2 and a min of 0, so
   (max-min)/max is 1.0 and it reads as the most saturated pixel in the
   image. Every corner of a black background therefore counted as
   artwork, and the crop came out as the whole picture. Saturation only
   means anything above a brightness floor. */
const INK = 40;                    // below this, a pixel is background
function artBounds(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const o = (y * img.w + x) * 4;
      const r = img.data[o], g = img.data[o+1], b = img.data[o+2], a = img.data[o+3];
      if (a < 8) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      /* Saturated OR bright, and in either case not in the dark. The
         white script and the red band both pass; a black field does not. */
      if (!(mx > INK && (sat > 0.35 || mx > 150))) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}

/* Anything separated from the main mass by a gap of empty columns is a
   watermark, a sparkle, or somebody's corner logo, and is not wanted. */
function trimOutliers(img, [x0, y0, x1, y1]) {
  const col = new Int32Array(img.w);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const o = (y * img.w + x) * 4;
      const r = img.data[o], g = img.data[o+1], b = img.data[o+2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > INK && ((mx - mn) / mx > 0.35 || mx > 150)) col[x]++;
    }
  /* the widest run of non-empty columns wins */
  let best = [x0, x0], run = null;
  for (let x = x0; x <= x1 + 1; x++) {
    /* A handful of stray pixels is not a column of artwork — the
       sparkle in the corner of this particular file lit up two columns
       at a threshold of zero. */
    if (x <= x1 && col[x] > 2) { if (!run) run = [x, x]; else run[1] = x; }
    else if (run) { if (run[1] - run[0] > best[1] - best[0]) best = run; run = null; }
  }
  return [best[0], y0, best[1], y1];
}

/* ---------- resampling ---------- */
function resample(img, box, W, H) {
  const [bx0, by0, bx1, by1] = box;
  const sw = bx1 - bx0 + 1, sh = by1 - by0 + 1;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy0 = by0 + (y * sh) / H, sy1 = by0 + ((y + 1) * sh) / H;
    for (let x = 0; x < W; x++) {
      const sx0 = bx0 + (x * sw) / W, sx1 = bx0 + ((x + 1) * sw) / W;
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = Math.floor(sy0); yy < Math.max(Math.ceil(sy1), Math.floor(sy0) + 1); yy++)
        for (let xx = Math.floor(sx0); xx < Math.max(Math.ceil(sx1), Math.floor(sx0) + 1); xx++) {
          if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
          const o = (yy * img.w + xx) * 4;
          r += img.data[o]; g += img.data[o+1]; b += img.data[o+2]; n++;
        }
      const o = (y * W + x) * 4;
      out[o] = r / n; out[o+1] = g / n; out[o+2] = b / n; out[o+3] = 255;
    }
  }
  return { w: W, h: H, data: out };
}

/* ---------- to the game's palette ---------- */
const nearest = (r, g, b) => {
  let best = 0, bd = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const c = PALETTE[i];
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    /* the same 3:6:1 weighting the rest of the palette work uses */
    const d = dr * dr * 3 + dg * dg * 6 + db * db;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};

/* ---------- run-length, then base64 ---------- */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function encode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] +
           (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') +
           (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}
function rle(indices) {
  const out = [];
  let i = 0;
  while (i < indices.length) {
    const v = indices[i]; let n = 1;
    while (i + n < indices.length && indices[i + n] === v && n < 255) n++;
    out.push(v, n); i += n;
  }
  return out;
}

/* ---------- chroma key ----------
   Magenta out, alpha in. The test is in hue terms rather than distance
   from one exact colour, because the edges of a keyed image are a smooth
   run of half-magenta pixels and a distance test either keeps a violet
   fringe or eats the artwork. Anything where red and blue both clearly
   beat green is the key. */
function chromaCut(img) {
  for (let i = 0; i < img.w * img.h; i++) {
    const o = i * 4;
    const r = img.data[o], g = img.data[o + 1], b = img.data[o + 2];
    const key = r > g + 40 && b > g + 40 && r > 80 && b > 80;
    if (key) { img.data[o + 3] = 0; continue; }
    /* Half-keyed edge pixels: pull the magenta back out of them, or the
       whole silhouette gets a violet rim that survives palette snapping
       and reads as a halo. */
    const spill = Math.min(r, b) - g;
    if (spill > 0) {
      img.data[o] = r - spill * 0.7;
      img.data[o + 2] = b - spill * 0.7;
    }
  }
  return img;
}

/** Bounding box of everything still opaque. */
function alphaBounds(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (img.data[(y * img.w + x) * 4 + 3] < 128) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  return [x0, y0, x1, y1];
}

/** Resample carrying alpha, weighting colour by coverage. */
function resampleRGBA(img, box, W, H) {
  const [bx0, by0, bx1, by1] = box;
  const sw = bx1 - bx0 + 1, sh = by1 - by0 + 1;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy0 = by0 + (y * sh) / H, sy1 = by0 + ((y + 1) * sh) / H;
    for (let x = 0; x < W; x++) {
      const sx0 = bx0 + (x * sw) / W, sx1 = bx0 + ((x + 1) * sw) / W;
      let r = 0, g = 0, b = 0, a = 0, n = 0, cov = 0;
      for (let yy = Math.floor(sy0); yy < Math.max(Math.ceil(sy1), Math.floor(sy0) + 1); yy++)
        for (let xx = Math.floor(sx0); xx < Math.max(Math.ceil(sx1), Math.floor(sx0) + 1); xx++) {
          if (xx < 0 || yy < 0 || xx >= img.w || yy >= img.h) continue;
          const o = (yy * img.w + xx) * 4, w = img.data[o + 3] / 255;
          r += img.data[o] * w; g += img.data[o + 1] * w; b += img.data[o + 2] * w;
          a += img.data[o + 3]; cov += w; n++;
        }
      const o = (y * W + x) * 4, c = Math.max(1e-6, cov);
      out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c;
      /* One threshold, no dithered edge: the renderer alpha-tests at 0.5
         and a soft edge would just be a hard edge in a random place. */
      out[o + 3] = (a / n) > 110 ? 255 : 0;
    }
  }
  return { w: W, h: H, data: out };
}

/* ---------- go ---------- */
const HERE = new URL('.', import.meta.url);
const art = f => new URL('../art/' + f, HERE);

/* ===== the logo: four tiles, no alpha ===== */
function bakeLogo() {
  const img = readPNG(art('logo.png'));
  const box = trimOutliers(img, artBounds(img));
  const [bx0, by0, bx1, by1] = box;
  const SW = bx1 - bx0 + 1, SH = by1 - by0 + 1;
  const PAD = Math.round(Math.max(SW, SH) * 0.03);
  const padded = [Math.max(0, bx0 - PAD), Math.max(0, by0 - PAD),
                  Math.min(img.w - 1, bx1 + PAD), Math.min(img.h - 1, by1 + PAD)];
  const small = resample(img, padded, 128, 128);
  const tiles = [];
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const idx = new Uint8Array(64 * 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const o = ((ty * 64 + y) * 128 + (tx * 64 + x)) * 4;
      idx[y * 64 + x] = nearest(small.data[o], small.data[o + 1], small.data[o + 2]);
    }
    tiles.push(encode(rle(idx)));
  }
  const aspect = (padded[2] - padded[0] + 1) / (padded[3] - padded[1] + 1);
  console.log(`logo:   artwork ${SW}x${SH}, aspect ${aspect.toFixed(3)}, ` +
              `${tiles.reduce((a, t) => a + t.length, 0)} chars`);
  return { tiles, aspect };
}

/* ===== the weapon: one 64x64 tile, cut out, laid along the bottom =====
   Index 255 is the transparent one. That costs a palette entry and buys
   a decoder that is the same nine lines as the logo's — the alternative
   is a second plane of alpha for a picture that is either on or off. */
const CLEAR = 255;
function bakeWeapon() {
  const img = chromaCut(readPNG(art('flamer.png')));
  const [bx0, by0, bx1, by1] = alphaBounds(img);
  const SW = bx1 - bx0 + 1, SH = by1 - by0 + 1;
  const aspect = SW / SH;
  /* Full width, natural aspect, sitting on the bottom edge. What is left
     above it is where the flame goes. */
  const w = 64, h = Math.max(1, Math.min(64, Math.round(64 / aspect)));
  const small = resampleRGBA(img, [bx0, by0, bx1, by1], w, h);
  const idx = new Uint8Array(64 * 64).fill(CLEAR);
  const top = 64 - h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (small.data[o + 3] < 128) continue;
    idx[(top + y) * 64 + x] = Math.min(254, nearest(small.data[o], small.data[o + 1], small.data[o + 2]));
  }
  const packed = encode(rle(idx));
  console.log(`weapon: artwork ${SW}x${SH}, aspect ${aspect.toFixed(3)}, ` +
              `drawn ${w}x${h} at y ${top}, ${packed.length} chars`);
  return { tile: packed, aspect, drawnH: h, top };
}

/* ---------- the lettering, out ----------

   Every headstone in art/stones/ was photographed with a word cut into
   it. The prediction was that the word would take care of itself: a
   stone is drawn twenty-eight texels across, a five-letter word is four
   texels tall at that size, and what comes out is the horizontal smudge
   that weathered lettering actually is. Held against the baked tiles,
   that was optimistic — up close it still read as letters, and this
   game has one rule about writing on things and it is that there is
   none of it, ever. The shopfronts keep it, the gravestones kept it
   when they were drawn, and a photograph does not get an exemption.

   SO THE BAND COMES OUT BEFORE THE TILE GOES IN, at full resolution,
   where there is enough of it to replace convincingly. The band is
   found rather than typed: carved letters are darker than the face they
   are cut into, so the row whose mean is furthest BELOW the local
   baseline is the middle of the lettering, and it is grown out while
   the rows either side are still dark. What goes back is a vertical
   interpolation between the clean rows above and below — which is what
   a plain piece of stone between two plain pieces of stone looks like —
   with the grain of a clean row mirrored back over it, because a
   granite face with no speckle in it reads as airbrushed.
*/
function eraseLettering(img, box) {
  const [x0, y0, x1, y1] = box;
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const at = (x, y) => ((y0 + y) * img.w + (x0 + x)) * 4;
  const lum = o => 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];

  const mean = new Float64Array(H), count = new Int32Array(H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = at(x, y);
    if (img.data[o + 3] < 128) continue;
    mean[y] += lum(o); count[y]++;
  }
  for (let y = 0; y < H; y++) mean[y] = count[y] ? mean[y] / count[y] : 0;

  /* the baseline: the same rows blurred, with the middle left out, so a
     dark band cannot lift its own baseline and hide from this */
  const R = Math.max(6, Math.round(H * 0.14));
  const base = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let sum = 0, n = 0;
    for (let k = -R; k <= R; k++) {
      const j = y + k;
      if (j < 0 || j >= H || Math.abs(k) < R / 3 || !count[j]) continue;
      sum += mean[j]; n++;
    }
    base[y] = n ? sum / n : mean[y];
  }
  let mid = -1, deep = 0;
  for (let y = Math.round(H * 0.10); y < Math.round(H * 0.84); y++) {
    if (count[y] < W * 0.35) continue;                    // a row that is mostly background
    const d = base[y] - mean[y];
    if (d > deep) { deep = d; mid = y; }
  }
  if (mid < 0 || deep < 2.5) return 0;                    // nothing carved into this one
  /* GROWN GENEROUSLY AND THEN PADDED. A letter is deepest across its
     waist and shallow at its serifs, so a tight threshold finds the
     middle of the word and leaves its top and bottom standing — which
     is exactly what the first cut of this did: the stones came out with
     a legible ghost of the word on them. The threshold is a tenth of
     the peak and the pad is another twentieth of the stone either side,
     which costs a little clean granite and takes the whole word. */
  let a = mid, b = mid;
  while (a > 1 && base[a - 1] - mean[a - 1] > deep * 0.10) a--;
  while (b < H - 2 && base[b + 1] - mean[b + 1] > deep * 0.10) b++;
  const pad = Math.max(4, Math.round(H * 0.05));
  a = Math.max(1, a - pad); b = Math.min(H - 2, b + pad);

  /* WHAT GOES BACK IS REAL STONE. Interpolating between the rows either
     side removes the letters and leaves a flat band where the granite
     had texture, which up close is its own kind of wrong — the stone
     comes out looking wiped. So a clean band of the SAME HEIGHT is
     copied in from below the lettering, or from above it if there is
     not the room, and only its BRIGHTNESS is interpolated: the face
     keeps its own speckle and lichen and takes the light of where it
     landed. A patch, in the sense a mason would mean it. */
  const ca = Math.max(0, a - 1), cb = Math.min(H - 1, b + 1);
  const bandH = b - a + 1;
  let src0 = cb + 1, flip = false;
  if (src0 + bandH > H - 1) { src0 = Math.max(0, ca - bandH); flip = true; }
  let srcMean = 0, srcN = 0;
  for (let k = 0; k < bandH; k++) {
    const sy = src0 + k;
    if (sy < 0 || sy >= H || !count[sy]) continue;
    srcMean += mean[sy]; srcN++;
  }
  srcMean = srcN ? srcMean / srcN : (mean[ca] + mean[cb]) / 2;
  for (let y = a; y <= b; y++) {
    const t = (y - a + 1) / (b - a + 2);
    const sy = Math.max(0, Math.min(H - 1, flip ? src0 + bandH - 1 - (y - a) : src0 + (y - a)));
    /* the brightness this row ought to be, between the two clean rows */
    const lift = (mean[ca] * (1 - t) + mean[cb] * t) - srcMean;
    for (let x = 0; x < W; x++) {
      const o = at(x, y);
      if (img.data[o + 3] < 128) continue;
      const os = at(x, sy);
      /* WHERE THE PATCH RUNS OFF THE EDGE OF THE STONE, fall back to
         the interpolation — and only if BOTH clean rows are stone
         there. On a cross the arms stick out past the shaft, so the
         rows above and below an arm are background; chromaCut zeroes
         the alpha of a background pixel but leaves the magenta in its
         colour, and interpolating between two of them painted a pink
         bar across the arms of the cross. If either end is not stone,
         the pixel is left exactly as it was. */
      const oa = at(x, ca), ob = at(x, cb);
      if (img.data[os + 3] < 128) {
        if (img.data[oa + 3] < 128 || img.data[ob + 3] < 128) continue;
        for (let c = 0; c < 3; c++)
          img.data[o + c] = Math.max(0, Math.min(255, img.data[oa + c] * (1 - t) + img.data[ob + c] * t));
        continue;
      }
      for (let c = 0; c < 3; c++)
        img.data[o + c] = Math.max(0, Math.min(255, img.data[os + c] + lift));
    }
  }
  return bandH;
}

/* ===== the cut-outs: a tile each, transparent where the key was =====

   The third kind of artwork this game cannot draw. The logo is a logo
   and the weapon is a photograph of a thing; these are photographs of
   THINGS IN A CEMETERY — eight headstones and a section of the iron
   fence round it — and the argument is the one at the top of this file:
   there is no set of primitives that gets you to weathered granite with
   lichen in the lettering.

   EACH IS ONE TILE AT ITS OWN SIZE, which is the difference from the
   weapon. A headstone is drawn twenty-four wide and a fence panel is
   worn sixty-four by ninety-six; making both of them 64x64 would spend
   three quarters of a stone's tile on nothing and squash the fence. So
   the width and the height travel with the tile and whatever decodes it
   reads them back.

   THE LETTERING GOES BY ITSELF. Every one of these stones was
   photographed with TEST cut into it, and at the size a headstone is
   drawn — twenty-four texels across, which is what the sprite bank
   wants — a five-letter word is four texels tall and comes out as the
   horizontal smudge that weathered lettering actually is. Nothing had
   to be painted out. It is the same rule the shopfronts keep: no name
   on anything, ever. */
const CUTOUTS = [
  { file: 'stones/stone_round.png',     name: 'stone_round',     w: 28, h: 40, letters: true },
  { file: 'stones/stone_worn.png',      name: 'stone_worn',      w: 28, h: 40, letters: true },
  { file: 'stones/stone_plain.png',     name: 'stone_plain',     w: 28, h: 40, letters: true },
  { file: 'stones/stone_tapered.png',   name: 'stone_tapered',   w: 28, h: 40, letters: true },
  { file: 'stones/stone_rough.png',     name: 'stone_rough',     w: 28, h: 40, letters: true },
  { file: 'stones/stone_obelisk.png',   name: 'stone_obelisk',   w: 28, h: 48, letters: true },
  { file: 'stones/stone_cross.png',     name: 'stone_cross',     w: 32, h: 44, letters: true },
  { file: 'stones/stone_crossback.png', name: 'stone_crossback', w: 30, h: 42, letters: true },
  { file: 'stones/cemfence.png',        name: 'cemfence',        w: 64, h: 64 },
];
function bakeCutouts() {
  const out = {};
  for (const job of CUTOUTS) {
    const img = chromaCut(readPNG(art(job.file)));
    const [bx0, by0, bx1, by1] = alphaBounds(img);
    const SW = bx1 - bx0 + 1, SH = by1 - by0 + 1;
    const wiped = job.letters ? eraseLettering(img, [bx0, by0, bx1, by1]) : 0;
    const small = resampleRGBA(img, [bx0, by0, bx1, by1], job.w, job.h);
    const idx = new Uint8Array(job.w * job.h).fill(CLEAR);
    let solid = 0;
    for (let i = 0; i < job.w * job.h; i++) {
      const o = i * 4;
      if (small.data[o + 3] < 128) continue;
      idx[i] = Math.min(254, nearest(small.data[o], small.data[o + 1], small.data[o + 2]));
      solid++;
    }
    const packed = encode(rle(idx));
    out[job.name] = { tile: packed, w: job.w, h: job.h, aspect: SW / SH };
    console.log(`${job.name.padEnd(16)} artwork ${SW}x${SH} -> ${job.w}x${job.h}, ` +
                `${(100 * solid / (job.w * job.h)).toFixed(0)}% solid, ${packed.length} chars` +
                (job.letters ? `, ${wiped} rows of lettering taken out` : ''));
  }
  return out;
}

const logo = bakeLogo();
const gun = bakeWeapon();
const cutouts = bakeCutouts();

const out = `/* GENERATED by tools/bake-art.mjs — do not edit by hand.

   Real artwork, resampled, snapped to the game's 256 colours and
   run-length encoded. Sources are in art/; re-run the tool when they
   change and read the numbers it prints.

   Palette index ${CLEAR} means TRANSPARENT in the weapon tile. The logo
   tiles are fully opaque and use all 256. */

/** Width over height of the logo artwork the four tiles were cut from.
    SIGN_W / SIGN_H in js/maps/sellwrong.js has to match this or the
    logo comes out stretched; the smoke test checks that it does. */
export const LOGO_ASPECT = ${logo.aspect.toFixed(4)};

/** Logo tiles in reading order: top-left, top-right, bottom-left, bottom-right. */
export const LOGO_TILES = [
${logo.tiles.map(t => '  ' + JSON.stringify(t)).join(',\n')},
];

/** The palette index that means "nothing here" in the weapon tile. */
export const CLEAR_INDEX = ${CLEAR};

/** The flamethrower, cut out of its chroma key and laid along the
    bottom of a 64x64 frame. Rows 0..${gun.top - 1} are empty, and that is
    deliberate: it is where the muzzle flame is drawn. */
export const WEAPON_TILE = ${JSON.stringify(gun.tile)};
export const WEAPON_TOP = ${gun.top};

/** The cut-outs: eight headstones and a section of cemetery fence, each
    one tile at its own size, ${CLEAR} where the chroma key was. \`aspect\` is
    the artwork's own width over height, before it was fitted to the
    tile — whatever draws one uses it so the picture is not stretched. */
export const CUTOUTS = {
${Object.entries(cutouts).map(([k, v]) =>
  `  ${k}: { w: ${v.w}, h: ${v.h}, aspect: ${v.aspect.toFixed(4)}, tile: ${JSON.stringify(v.tile)} }`).join(',\n')},
};
`;
fs.writeFileSync(new URL('../js/art-data.js', HERE), out);
console.log(`wrote js/art-data.js (${out.length} bytes)`);
