/* =====================================================================
   A PNG reader, only as much as one is
   =====================================================================

   Node only, and shared by the two things that need to read a PNG
   without a browser: tools/bake-art.mjs, which turns art into source,
   and tools/smoke-test.mjs, which checks the sprite frames on disk are
   the ones the state tables name. The GAME does not use this — in a
   browser the platform already has a PNG decoder and it is faster than
   anything written here would be.

   Enough of the format for the files in art/ and assets/: eight-bit,
   non-interlaced, any of the five colour types. Anything else throws
   rather than guessing.
   ===================================================================== */

import fs from 'node:fs';
import zlib from 'node:zlib';

export function readPNG(file) {
  const d = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, bitDepth = 8, colorType = 6, idat = [];
  let palette = null, trns = null;
  while (pos < d.length) {
    const len = d.readUInt32BE(pos), type = d.toString('ascii', pos + 4, pos + 8);
    const data = d.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} not supported`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`colour type ${colorType} not supported`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * stride); prev = line;
  }

  /* everything becomes RGBA, whatever it arrived as */
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * channels, o = i * 4;
    if (colorType === 6) { rgba[o] = out[s]; rgba[o+1] = out[s+1]; rgba[o+2] = out[s+2]; rgba[o+3] = out[s+3]; }
    else if (colorType === 2) { rgba[o] = out[s]; rgba[o+1] = out[s+1]; rgba[o+2] = out[s+2]; rgba[o+3] = 255; }
    else if (colorType === 0) { rgba[o] = rgba[o+1] = rgba[o+2] = out[s]; rgba[o+3] = 255; }
    else if (colorType === 4) { rgba[o] = rgba[o+1] = rgba[o+2] = out[s]; rgba[o+3] = out[s+1]; }
    else { const q = out[s] * 3; rgba[o] = palette[q]; rgba[o+1] = palette[q+1]; rgba[o+2] = palette[q+2];
           rgba[o+3] = trns && out[s] < trns.length ? trns[out[s]] : 255; }
  }
  return { w, h, data: rgba };
}
