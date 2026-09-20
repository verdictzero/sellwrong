/* =====================================================================
   GROCERY STORE SIMULATOR — the textures, as files, for once
   =====================================================================

     node tools/bake-textures.mjs [outdir] [--scale=N] [--no-sheet]

   Nothing in the game needs this. Every texture in js/textures.js is
   drawn in Javascript at load time and handed straight to a canvas, and
   that is the whole point of it — there is not an image file in the
   project. But a texture set that only exists for the fifteen
   milliseconds between the bake and the upload is a texture set nobody
   can LOOK at, and looking at all of them side by side is the only way
   to see that the light really does come from the top left in every
   one, that the dirt is the same dirt, and that the back of house never
   borrows a colour from the front.

   So: every generator in the bank, run once, written out as an 8-bit
   RGBA PNG at its true size — 64 pixels or under, alpha intact on the
   masked ones — plus the charred copy of everything the fire is allowed
   to touch, under the same name the bank gives it (FLOOR, FLOOR_B), so
   the two sort next to each other.

   And a contact sheet, because forty names in a directory listing tell
   you nothing. It is drawn with the game's own 4x6 typeface on the
   game's own night, at --scale, for the same reason the icon is: the
   picture of the pixels should be made of the pixels.

   Node's zlib does the PNG; nothing is installed.
   ===================================================================== */

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
import { mkdirSync, writeFileSync } from 'node:fs';
import { writePNG } from './png-read.mjs';

/* The bank uploads what it bakes, and uploading wants a canvas. The
   generators themselves are pure — Pix in, Pix out — so the document
   here only has to survive being called, exactly as it does for the
   icon. */
globalThis.document = {
  createElement: () => ({
    getContext: () => ({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData() {},
    }),
  }),
};

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const outDir = args.find(a => !a.startsWith('--')) || 'texture-assets';
const SCALE = Math.max(1, +flag('scale', 4) | 0);
const wantSheet = !args.includes('--no-sheet');

const { Pix, drawText, textWidth } = await import('../js/pixel.js');
const { TEXTURE_GENERATORS, CHARRABLE, charVariant } = await import('../js/textures.js');

mkdirSync(outDir, { recursive: true });

/* ---------------------------------------------------------------------
   Draw everything

   The charred names are built the way bakeTextures builds them, off the
   raw Pix and with the same seeds, so what lands on disk is what lands
   on the wall after the fire — not a second guess at it.
   ------------------------------------------------------------------ */
const baked = [];
const raw = {};
for (const [name, gen] of Object.entries(TEXTURE_GENERATORS)) {
  const pix = gen();
  raw[name] = pix;
  baked.push([name, pix]);
}
CHARRABLE.forEach((name, i) => {
  if (!raw[name]) { console.warn('nothing to char:', name); return; }
  baked.push([name + '_B', charVariant(raw[name], 3300 + i * 31)]);
});
baked.sort((a, b) => a[0].localeCompare(b[0]));

const rgbaOf = pix => {
  const b = Buffer.alloc(pix.w * pix.h * 4);
  for (let i = 0; i < b.length; i++) b[i] = pix.data[i];
  return b;
};

let bytes = 0;
const index = [];
for (const [name, pix] of baked) {
  const png = writePNG(pix.w, pix.h, rgbaOf(pix));
  writeFileSync(`${outDir}/${name}.png`, png);
  bytes += png.length;
  let masked = 0;
  for (let i = 3; i < pix.data.length; i += 4) if (pix.data[i] < 248) masked++;
  index.push(`${name}.png\t${pix.w}x${pix.h}\t${masked ? 'masked' : 'opaque'}`);
}
writeFileSync(`${outDir}/INDEX.txt`,
  `${baked.length} textures from js/textures.js, drawn at their true size.\n` +
  `Name_B is the same surface after the fire has been through it.\n\n` +
  index.join('\n') + '\n');

/* ---------------------------------------------------------------------
   The contact sheet

   A grid of cells wide enough for the widest texture, each one labelled
   underneath, and every texture drawn once at 1:1 into it before the
   whole thing goes up by SCALE. Nearest neighbour, so the sheet is an
   honest magnification and not a photograph of one.
   ------------------------------------------------------------------ */
if (wantSheet) {
  const CELL_W = Math.max(64, ...baked.map(([, p]) => Math.min(p.w, 192)));
  const CELL_H = Math.max(64, ...baked.map(([, p]) => Math.min(p.h, 192)));
  const PAD = 4, LABEL = 8;
  const cw = CELL_W + PAD * 2, ch = CELL_H + PAD + LABEL + PAD;
  const cols = Math.max(1, Math.round(Math.sqrt(baked.length * ch / cw)));
  const rows = Math.ceil(baked.length / cols);
  const sheet = new Pix(cols * cw, rows * ch, 11, false);
  for (let y = 0; y < sheet.h; y++)
    for (let x = 0; x < sheet.w; x++)
      sheet.ink(x, y, 'grey', 0.09 + ((((x / cw) | 0) + ((y / ch) | 0)) % 2) * 0.015);

  baked.forEach(([name, pix], i) => {
    const ox = (i % cols) * cw, oy = ((i / cols) | 0) * ch;
    /* centred in its cell, and cropped rather than shrunk if it is one
       of the tall ones — a door is 128 and scaling it would be a lie */
    const w = Math.min(pix.w, CELL_W), h = Math.min(pix.h, CELL_H);
    const dx = ox + PAD + ((CELL_W - w) >> 1), dy = oy + PAD + ((CELL_H - h) >> 1);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const a = pix.alphaAt(x, y);
        if (a < 8) continue;
        const c = pix.get(x, y);
        sheet.set(dx + x, dy + y, c[0], c[1], c[2], 255);
      }
    const label = name.length > 12 ? name.slice(0, 12) : name;
    drawText(sheet, label, ox + ((cw - textWidth(label)) >> 1), oy + PAD + CELL_H + 1, 'bone', 0.55);
  });
  sheet.snap(0);

  const W = sheet.w * SCALE, H = sheet.h * SCALE;
  const big = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = sheet.get((x / SCALE) | 0, (y / SCALE) | 0);
      const i = (y * W + x) * 4;
      big[i] = c[0]; big[i + 1] = c[1]; big[i + 2] = c[2]; big[i + 3] = 255;
    }
  const png = writePNG(W, H, big);
  writeFileSync(`${outDir}/CONTACT-SHEET.png`, png);
  bytes += png.length;
  console.log(`CONTACT-SHEET.png: ${W}x${H}, ${cols}x${rows} cells`);
}

console.log(`${baked.length} textures -> ${outDir}/, ${(bytes / 1024).toFixed(0)}kB`);
