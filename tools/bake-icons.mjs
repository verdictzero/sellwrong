/* =====================================================================
   SELLWRONG — the home-screen icon
   =====================================================================

   node tools/bake-icons.mjs        -> icon.png (512x512)

   The game's own fire, from the same fireFrames() that burns the shop,
   on a dark tile, with every one of its 64 pixels drawn eight times.
   The icon on the phone is made of the pixels the game is made of.

   Node's zlib does the PNG; nothing is installed. The flame is a
   simulation, so the frame is chosen by hand and the tool is only run
   when the icon is meant to change.
   ===================================================================== */

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

globalThis.document = {
  createElement: () => ({
    getContext: () => ({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData() {},
    }),
  }),
};

const { Pix } = await import('../js/pixel.js');
const { fireFrames } = await import('../js/sprites.js');

const S = 64, SCALE = 8;

/* the tile: the page's night, darker toward the corners so the flame
   has somewhere to glow */
const tile = new Pix(S, S, 5, false);
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - 31.5, y - 31.5) / 45;
    tile.ink(x, y, 'grey', 0.11 - d * 0.06);
  }
/* the glow: a wash of fire colour that falls off from where the flame sits */
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - 32, y - 44) / 30;
    if (d < 1) tile.wash(x, y, 'fire', 0.35, (1 - d) * (1 - d) * 0.45);
  }

/* the flame: tall and narrow, a settled frame */
const flame = fireFrames(36, 52, 6, 19, { taper: 0.75 })[3];
tile.blit(flame, Math.round((S - flame.w) / 2), S - flame.h - 4);
tile.snap(0);

/* up by SCALE, nearest neighbour — the chunk is the point */
const W = S * SCALE;
const rgba = Buffer.alloc(W * W * 4);
for (let y = 0; y < W; y++)
  for (let x = 0; x < W; x++) {
    const c = tile.get((x / SCALE) | 0, (y / SCALE) | 0);
    const i = (y * W + x) * 4;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  }

function png(w, h, pixels) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;                       // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../icon.png', import.meta.url);
const bytes = png(W, W, rgba);
writeFileSync(out, bytes);
console.log(`icon.png: ${W}x${W}, ${bytes.length} bytes`);
