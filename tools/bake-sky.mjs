/* =====================================================================
   Bake the night sky
   =====================================================================

     node tools/bake-sky.mjs <panorama.jpg> <out.png> [width]

   The sky is the one picture in the game that is a photograph: a
   Polyhaven HDRI (CC0), tonemapped, and then made to belong here.
   Belonging means two things —

   SMALL. 1024 across for the whole horizon, so at the default resolution
   one sky texel is about a screen pixel wide: chunky where it is
   magnified by looking up, and not so chunky the Milky Way turns into a
   smear. An 8k panorama goes through an 8:1 box filter to get there,
   and a box filter is exactly wrong for stars — a star is one bright
   pixel in an 8x8 block, and averaged it vanishes. So where a block
   holds a pixel much brighter than its average, the output texel is
   pulled toward it, which keeps the stars as single lit texels the way
   a 256-colour sky would have drawn them — and nowhere else, because
   doing it everywhere turns the sky to speckle.

   AND IN THE PALETTE. Snapped to the game's own 256 colours with the
   same ordered dither everything else uses, so the sky is made of the
   same paint as the car park. The runtime snap would do this again to
   whatever it is shown; doing it here is what makes the texture itself
   honest, and it is what makes the dither pattern sit still instead of
   crawling as you turn.

   Chromium does the decoding, because Node has no JPEG decoder and the
   one that ships with every copy of Chromium is fine.
   ===================================================================== */

import fs from 'node:fs';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { snapImageData } from '../js/palette.js';

const [,, src, dst, widthArg] = process.argv;
if (!src || !dst) { console.error('usage: bake-sky.mjs <panorama.jpg> <out.png> [width]'); process.exit(2); }
const W = +(widthArg || 512), H = W / 2;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage();
const mime = /\.png$/i.test(src) ? 'image/png' : 'image/jpeg';
const dataUrl = `data:${mime};base64,` + fs.readFileSync(src).toString('base64');

const pooled = await page.evaluate(async ({ dataUrl, W, H }) => {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const s = g.getImageData(0, 0, sw, sh).data;
  const out = new Uint8ClampedArray(W * H * 4);
  const bx = sw / W, by = sh / H;
  for (let oy = 0; oy < H; oy++) {
    for (let ox = 0; ox < W; ox++) {
      let r = 0, gg = 0, b = 0, n = 0, best = -1, br = 0, bg = 0, bb = 0;
      const x0 = Math.floor(ox * bx), x1 = Math.floor((ox + 1) * bx);
      const y0 = Math.floor(oy * by), y1 = Math.floor((oy + 1) * by);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * sw + x) * 4;
        const R = s[i], G = s[i + 1], B = s[i + 2];
        r += R; gg += G; b += B; n++;
        const l = R * 0.30 + G * 0.59 + B * 0.11;
        if (l > best) { best = l; br = R; bg = G; bb = B; }
      }
      r /= n; gg /= n; b /= n;
      /* The average, leaning toward the brightest pixel — but only where
         the brightest pixel IS a star, well above the block it sits in.
         Leaning everywhere lifted every block a little and turned the
         whole sky into speckle; a star is a point, and a point is one
         texel that is much brighter than its neighbours. */
      const avgL = r * 0.30 + gg * 0.59 + b * 0.11;
      const k = best - avgL > 70 ? 0.55 : best - avgL > 40 ? 0.22 : 0.0;
      const o = (oy * W + ox) * 4;
      out[o] = r + (br - r) * k; out[o + 1] = gg + (bg - gg) * k; out[o + 2] = b + (bb - b) * k; out[o + 3] = 255;
    }
  }
  return Array.from(out);
}, { dataUrl, W, H });
await browser.close();

const data = new Uint8ClampedArray(pooled);
/* A little contrast, so the horizon glow reads and the zenith stays a
   proper dark — a tonemapped night is flatter than a night looks. */
for (let i = 0; i < data.length; i += 4) {
  for (let k = 0; k < 3; k++) {
    const v = data[i + k] / 255;
    data[i + k] = Math.round(255 * Math.min(1, Math.max(0, (v - 0.5) * 1.18 + 0.5 + 0.02)));
  }
}
/* Half the usual dither: the picture is already grain, and a full
   ordered dither on top of a starfield reads as static. */
snapImageData({ data, width: W, height: H }, 0.5);

/* ---- write a PNG ------------------------------------------------- */
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  Buffer.from(data.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
}
const chunk = (t, d) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(td));
  return Buffer.concat([l, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.mkdirSync(dst.replace(/\/[^/]*$/, ''), { recursive: true });
fs.writeFileSync(dst, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]));
const colours = new Set();
for (let i = 0; i < data.length; i += 4) colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
console.log(`${dst}: ${W}x${H}, ${colours.size} palette colours, ${(fs.statSync(dst).size / 1024).toFixed(0)}K`);
