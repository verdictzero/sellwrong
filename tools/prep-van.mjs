/* =====================================================================
   Prepare the van model
   =====================================================================

     node tools/prep-van.mjs <in.glb> <out.glb>

   The car park used to be seven vehicles built out of boxes and painted
   by projecting four drawings back along the axes they were drawn down
   (js/car.js, tools/prep-car.mjs). It is now seventy-seven of ONE van,
   modelled, at the user's request. That is a smaller job than it sounds:
   the shape arrives finished, so all this has to do is measure it, say
   which way it is pointing, and make the texture the right size for a
   game that draws two hundred rows.

   WHAT IT MEASURES, and why the game cannot work it out for itself: a
   GLB says nothing about which end of a van is the front. This one lies
   along its Z with the nose at +Z and up along +Y — established by
   rendering four orthographic views of it and looking — and none of that
   is recoverable from the file. So it goes in `asset.extras.vehicle`,
   next to the length, width and height in the game's own units, and
   js/car.js reads it back. One self-describing file, the same promise
   tools/prep-model.mjs makes about the gun.

   WHAT IT RESAMPLES, which is the one place this differs from that tool.
   The gun's diffuse is pixel art and is copied byte for byte, because
   resampling pixel art is vandalism. The van's is a 700x382 photograph
   of a van, and the van is about sixty pixels tall on screen. So the
   texture is HALVED with a box filter and then snapped to the game's own
   256 colours — which is what the GPU does to it at draw time anyway, so
   nothing is lost on screen, and a photograph reduced to 256 colours
   compresses to a quarter of what it was.

   THE MODEL'S OWN UVs ARE NOT USED, and that is the whole of what this
   tool is for. They were, for one afternoon, and the van went out with
   its flanks smeared: the mesh's side panels are UV-mapped as a FAN of
   long thin triangles all sharing one corner, which stretches a few
   pixels of the picture across the whole side of the van. Drawing the
   UV layout over the texture shows it immediately and nothing else does.

   WHAT THE TEXTURE ACTUALLY IS: a four-view sheet. Front, rear, side and
   plan of this very van, one per quadrant, on a flat grey field — which
   is exactly, precisely the input js/car.js has wanted since the day it
   was written, because the drawn fleet is seven of those sheets and the
   whole file is about projecting them back onto a solid. So the shape
   comes from the model and the PAINT comes from the projection, and the
   model's UVs are ignored. That is better than fixing them would have
   been: the torn pieces of a wrecked van get real projected paint too.

   MEASURING THE FOUR VIEWS is then the only hard part, and the hard part
   of that is that the picture has WING MIRRORS and the mesh does not. Key
   the background out, take the bounding box in each quadrant, and the
   front view comes out 27 per cent wider than the model, the plan view
   23 per cent, the rear 14 — all of it mirror. The LENGTH axis is clean,
   and it agrees between the side and the plan view to one per cent, so
   that is the ruler: pixels per unit length from the two views that have
   a length, and then every other window derived from the model's own
   proportions, anchored on the two datums the picture and the mesh
   genuinely share — the ground the tyres stand on, and the centre line a
   van is symmetric about.

   Nothing fancier is understood: one buffer, one mesh, two primitives,
   no animation, no skins, no extensions. Anything else throws rather
   than guessing.
   ===================================================================== */

import fs from 'node:fs';
import { register } from 'node:module';
register(new URL('./loader.mjs', import.meta.url).href, import.meta.url);
import { readPNG, writePNG } from './png-read.mjs';

const { snapImageData } = await import('../js/palette.js');

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error('usage: prep-van.mjs <in.glb> <out.glb>'); process.exit(2); }

/* HOW LONG A VAN IS, in the game's units. The fleet this replaces had
   the van at 174 nose to tail, measured off a four-view sheet, and every
   other length in the game is beside it — a shopper is 62 tall, a bay is
   186 across, the store's doors are 128 high. So the model is scaled to
   the number the old one had rather than to anything about the model,
   and the car park's arithmetic does not move. */
const LENGTH = 174;

/* ---- read ---------------------------------------------------------- */
const buf = fs.readFileSync(inFile);
if (buf.toString('ascii', 0, 4) !== 'glTF' || buf.readUInt32LE(4) !== 2) throw new Error('not a glTF 2 binary');
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 'JSON') json = JSON.parse(data.toString('utf8'));
  else if (type.startsWith('BIN')) bin = data;
  off += 8 + len;
}
if (!json || !bin) throw new Error('GLB needs a JSON and a BIN chunk');
if ((json.buffers || []).length !== 1) throw new Error('expected exactly one buffer');
if ((json.animations || []).length || (json.skins || []).length) throw new Error('animations and skins are not handled');
if (json.extensionsRequired?.length) throw new Error('required extensions: ' + json.extensionsRequired.join());
if (json.meshes.length !== 1) throw new Error(`expected one mesh, got ${json.meshes.length}`);
if (json.images.length !== 1) throw new Error(`expected one image, got ${json.images.length}`);

const accessor = i => {
  const a = json.accessors[i];
  if (a.sparse) throw new Error('sparse accessors are not handled');
  const T = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  if (!T || !n) throw new Error(`accessor ${i}: unsupported ${a.componentType} ${a.type}`);
  const bv = json.bufferViews[a.bufferView];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  if (bv.byteStride && bv.byteStride !== T.BYTES_PER_ELEMENT * n) throw new Error('interleaved accessors are not handled');
  return new T(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + a.count * T.BYTES_PER_ELEMENT * n));
};

/* ---- measure ------------------------------------------------------- */
const prims = json.meshes[0].primitives.map(p => ({
  pos: accessor(p.attributes.POSITION),
  idx: accessor(p.indices),
  textured: !!json.materials[p.material]?.pbrMetallicRoughness?.baseColorTexture,
  name: json.materials[p.material]?.name || '?',
  tris: accessor(p.indices).length / 3,
}));
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (const pr of prims)
  for (let i = 0; i < pr.pos.length; i += 3)
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pr.pos[i + k]); mx[k] = Math.max(mx[k], pr.pos[i + k]); }

/* WHICH AXIS IS THE LENGTH is the one thing here that can be worked out
   rather than asserted: a van is longer than it is either tall or wide,
   always, and if it ever is not then something else is wrong. Which END
   is the nose cannot be, and is the constant below. */
const span = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
const lengthAxis = span.indexOf(Math.max(...span));
if (lengthAxis !== 2) throw new Error(`expected the length along Z, found it along ${'XYZ'[lengthAxis]}`);
const upAxis = 1;
/* +Z is the nose. Established by rendering the model's four orthographic
   views and looking at which end has the grille in it; there is nothing
   in a GLB that says so. */
const noseSign = +1;

const unit = LENGTH / span[lengthAxis];       // model units to game units
const measured = {
  length: LENGTH,
  width: +(span[0] * unit).toFixed(2),
  height: +(span[1] * unit).toFixed(2),
  /* the model's own frame, so js/car.js can put it into the car
     pipeline's space without knowing anything about Blender */
  lengthAxis, upAxis, noseSign,
  unit: +unit.toFixed(6),
  /* the middle of the length and the bottom of the wheels, in model
     units: the origin the game turns the van about and stands it on */
  centre: +(((mn[2] + mx[2]) / 2)).toFixed(6),
  ground: +mn[1].toFixed(6),
};

/* ---- THERE WAS A SILHOUETTE HERE, and four measured views under it.
   Both are gone with the projection they fed. The old pipeline measured
   two curves off this mesh, built a body as the visual hull of them,
   and painted it by projecting four rectangles of the sheet back along
   the axes they were drawn down. js/car.js draws the model itself now,
   with the model's own UVs, so none of it is wanted — and neither is the
   agreement report that held the sheet's two claims about the van's
   length against each other.

   What is left is the short list of things a GLB genuinely does not say.
   ------------------------------------------------------------------ */

/* ---- the texture --------------------------------------------------- */
const im = json.images[0];
if (im.bufferView === undefined) throw new Error('the image is not in the buffer');
const ibv = json.bufferViews[im.bufferView];
const raw = bin.subarray(ibv.byteOffset || 0, (ibv.byteOffset || 0) + ibv.byteLength);
const tmp = outFile + '.tex.png';
fs.writeFileSync(tmp, raw);
const src = readPNG(tmp);

/* HALVED, with a box filter over four texels, and then snapped. Not a
   nice resampler: at half size a box filter IS the right answer, since
   every output texel is exactly four input ones and there is nothing to
   guess about the weights. */
const W = src.w >> 1, H = src.h >> 1;
const small = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let r = 0, g = 0, b = 0, a = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const o = (((y * 2 + j) * src.w) + x * 2 + i) * 4;
    r += src.data[o]; g += src.data[o + 1]; b += src.data[o + 2]; a += src.data[o + 3];
  }
  const o = (y * W + x) * 4;
  small[o] = r / 4; small[o + 1] = g / 4; small[o + 2] = b / 4; small[o + 3] = a / 4;
}
snapImageData({ data: small, width: W, height: H }, 0);


/* ---- AND SOMEWHERE BLACK TO POINT THE BLACK MATERIAL AT ------------
   The mesh has two primitives. One is the body, textured, with a UV
   unwrap onto the four views above; the other is 490 triangles of glass,
   tyres, bumpers and chassis with NO texture at all — just a base colour
   of near-black. A car park is one texture and one draw call, so rather
   than a second material those triangles are all pointed at one dark
   texel in this sheet, and this is where it is painted: a small solid
   block in the bottom-left corner, which is background grey in every one
   of these turnarounds and inside no view's box.

   The colour is the model's own baseColorFactor (0.0059 linear, which is
   about 20 of 255 after the sRGB transfer) lifted a little, because a
   tyre that is literally black in a night car park is a hole. */
{
  const BLK = 6;                            // texels square
  const c = [26, 25, 24];
  for (let y = H - BLK; y < H; y++) for (let x = 0; x < BLK; x++) {
    const o = (y * W + x) * 4;
    small[o] = c[0]; small[o + 1] = c[1]; small[o + 2] = c[2]; small[o + 3] = 255;
  }
  /* the middle of it, in the same top-down pixel coordinates the views
     use — js/car.js turns it into a texture coordinate the same way */
  measured.black = { x: BLK / 2, y: H - BLK / 2 };
  /* and how big the sheet is, since that is what turns those pixels
     into a texture coordinate and there is no atlas table any more */
  measured.sheet = { w: W, h: H };
  console.log(`  a ${BLK}x${BLK} block of ${c.join(',')} at ${BLK / 2},${H - BLK / 2} for the untextured primitive`);
}

const png = writePNG(W, H, small);
fs.unlinkSync(tmp);

/* ---- write --------------------------------------------------------- */
/* The image goes back into the buffer in place of the old one, which
   means every bufferView after it moves. Rather than patch offsets, the
   whole buffer is rebuilt: the geometry views copied through byte for
   byte in their existing order, then the image at the end. */
const views = json.bufferViews.map((bv, i) => ({
  i, bytes: i === im.bufferView ? png : bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength),
  stride: bv.byteStride, target: bv.target,
}));
let cursor = 0;
const chunks = [];
for (const v of views) {
  /* four-byte alignment, because an accessor of floats has to start on
     one and a GLB does not promise it */
  const pad = (4 - (cursor % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); cursor += pad; }
  json.bufferViews[v.i] = {
    buffer: 0, byteOffset: cursor, byteLength: v.bytes.length,
    ...(v.stride ? { byteStride: v.stride } : {}),
    ...(v.target ? { target: v.target } : {}),
  };
  chunks.push(Buffer.from(v.bytes));
  cursor += v.bytes.length;
}
const newBin = Buffer.concat(chunks);
json.buffers = [{ byteLength: newBin.length }];
json.asset = { ...(json.asset || {}), extras: { ...(json.asset?.extras || {}), vehicle: measured } };
/* NEAREST, both ways. Every other texture in this game is sampled
   nearest and the whole look depends on it; a linear-filtered van in a
   store full of hard texels is the one object on screen that looks like
   it came from somewhere else. */
json.samplers = [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }];
json.textures = [{ sampler: 0, source: 0 }];

const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
const binPad = Buffer.alloc((4 - (newBin.length % 4)) % 4, 0);
const head = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(type, 4, 4, 'ascii'); return b; };
const total = 12 + 8 + jsonBuf.length + jsonPad.length + 8 + newBin.length + binPad.length;
const glb = Buffer.alloc(12);
glb.write('glTF', 0, 4, 'ascii'); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(total, 8);
fs.writeFileSync(outFile, Buffer.concat([
  glb,
  head(jsonBuf.length + jsonPad.length, 'JSON'), jsonBuf, jsonPad,
  head(newBin.length + binPad.length, 'BIN\0'), newBin, binPad,
]));

console.log(`${inFile} -> ${outFile}`);
console.log(`  ${prims.map(p => `${p.name}: ${p.tris} triangles${p.textured ? '' : ', flat'}`).join('; ')}`);
console.log(`  texture ${src.w}x${src.h} -> ${W}x${H}, ${(raw.length / 1024).toFixed(0)}K -> ${(png.length / 1024).toFixed(0)}K`);
console.log(`  in game units: ${measured.length} long, ${measured.width} wide, ${measured.height} tall`);
console.log(`  nose at ${measured.noseSign > 0 ? '+' : '-'}${'XYZ'[measured.lengthAxis]}, ` +
  `up at +${'XYZ'[measured.upAxis]}; centre ${measured.centre}, ground ${measured.ground}`);
console.log(`  ${(buf.length / 1024).toFixed(0)}K -> ${(total / 1024).toFixed(0)}K`);
