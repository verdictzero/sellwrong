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

/* ---- the silhouette ------------------------------------------------
   THE SAME TWO CURVES THE DRAWN FLEET IS MADE OF, measured off the model
   instead of off a sheet. `columns` runs nose to tail and says how high
   the body is and how far out it reaches at each x; `levels` runs sill
   to roof and says how far out it reaches at each height. js/car.js
   builds a drawn vehicle's whole hull out of those two curves — this
   model does not need them for its body, which arrives finished — but
   everything DOWNSTREAM of the body still asks: where the torn pieces
   come off (js/vehicles.js shed), how tall the thing is on its roof, how
   wide the part you cannot walk through is. Answering it here, from the
   triangles, keeps one shape format in the game rather than two.

   Measured by sampling each triangle rather than by rasterising it: a
   barycentric grid over six hundred triangles is forty thousand points,
   which is nothing, and it cannot miss a thin sliver the way a
   scanline can. */
const COLS = 24, LEVELS = 9;
{
  const noseAt = z => ((z - measured.centre) * measured.noseSign) / span[2];
  const colTop = new Array(COLS).fill(-Infinity), colHalf = new Array(COLS).fill(0);
  const lvlHalf = new Array(LEVELS).fill(0);
  const zTop = span[1];
  for (const pr of prims) {
    for (let t = 0; t < pr.idx.length; t += 3) {
      const P = [0, 1, 2].map(k => {
        const i = pr.idx[t + k];
        return [noseAt(pr.pos[i * 3 + 2]), pr.pos[i * 3] / span[2], (pr.pos[i * 3 + 1] - measured.ground) / span[2]];
      });
      const N = 6;
      for (let a = 0; a <= N; a++) for (let b = 0; a + b <= N; b++) {
        const wa = a / N, wb = b / N, wc = 1 - wa - wb;
        const x = P[0][0] * wa + P[1][0] * wb + P[2][0] * wc;
        const y = Math.abs(P[0][1] * wa + P[1][1] * wb + P[2][1] * wc);
        const z = P[0][2] * wa + P[1][2] * wb + P[2][2] * wc;
        const ci = Math.min(COLS - 1, Math.max(0, Math.floor((x + 0.5) * COLS)));
        colTop[ci] = Math.max(colTop[ci], z);
        colHalf[ci] = Math.max(colHalf[ci], y);
        /* LEVELS OFF THE BODY ONLY. The flat primitive is wheels,
           bumpers and glass, and the wheels are as wide as the body is —
           so with them in, the lowest level is already at full width and
           the sill comes out at four units off the tarmac. The sill is
           meant to be where the FLANKS start. */
        if (pr.textured) {
          const li = Math.min(LEVELS - 1, Math.max(0, Math.floor(z / (zTop / span[2]) * LEVELS)));
          lvlHalf[li] = Math.max(lvlHalf[li], y);
        }
      }
    }
  }
  /* Nose first, because lerpAt in js/car.js walks columns DESCENDING in
     x — the drawn fleet's sheets are all nose to the left. */
  const columns = [];
  for (let i = COLS - 1; i >= 0; i--)
    columns.push([+((i + 0.5) / COLS - 0.5).toFixed(4), +Math.max(0, colTop[i]).toFixed(4), +colHalf[i].toFixed(4)]);
  /* and levels ascending, sill to roof, with the same held ends */
  const height = zTop / span[2];
  const levels = [];
  for (let i = 0; i < LEVELS; i++)
    levels.push([+((i + 0.5) / LEVELS * height).toFixed(4), +lvlHalf[i].toFixed(4)]);
  const widest = Math.max(...lvlHalf);
  /* THE SILL is where the flanks begin — the lowest height at which the
     body is within a tenth of its widest. Below it is wheels and axles,
     and a piece of debris torn from down there is not a piece of van. */
  let sill = 0;
  for (let i = 0; i < LEVELS; i++) if (lvlHalf[i] >= widest * 0.9) { sill = levels[i][0]; break; }
  measured.shape = {
    width: +(2 * widest).toFixed(4),
    height: +height.toFixed(4),
    sill: +sill.toFixed(4),
    roof: +height.toFixed(4),
    columns, levels,
  };
}

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

/* ---- the four views ------------------------------------------------
   Keyed off the background, one bounding box per quadrant, and then
   every window derived from the model rather than from the box — see the
   note at the top about the wing mirrors. What is written out is what
   uvOf in js/car.js wants: a rectangle in atlas pixels plus the WINDOW
   on the model it covers.
   ------------------------------------------------------------------ */
{
  /* The background is the commonest colour in the picture by a mile —
     half of it — and the only thing between it and the van is the soft
     shadow under each one, which sits about a fifth of the way from one
     to the other. A threshold of 96 over the three channels together
     clears the shadow and keeps every part of the van, including the
     tyres, which are further from a mid grey than the white body is. */
  const bg = [small[0], small[1], small[2]];
  const KEY = 96;
  const lit = (x, y) => {
    const o = (y * W + x) * 4;
    return Math.abs(small[o] - bg[0]) + Math.abs(small[o + 1] - bg[1]) + Math.abs(small[o + 2] - bg[2]) > KEY;
  };
  const quadrant = (qx, qy) => {
    const ax = qx ? (W >> 1) : 0, bx = qx ? W : (W >> 1);
    const ay = qy ? (H >> 1) : 0, by = qy ? H : (H >> 1);
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) if (lit(x, y)) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x1 < 0) throw new Error(`nothing in the ${qx},${qy} quadrant of the sheet`);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  /* The layout, which is the one the drawn fleet's sheets use as well:
     front and rear along the top, side and plan along the bottom, every
     one of them drawn nose to the LEFT or facing you. */
  const box = {
    front: quadrant(0, 0), rear: quadrant(1, 0),
    side:  quadrant(0, 1), top:  quadrant(1, 1),
  };
  const half = measured.shape.width / 2;        // in fractions of the length
  const tall = measured.shape.height;

  /* PIXELS PER UNIT LENGTH, from the two views that have a length in
     them. They agree to about one per cent, which is the check: a sheet
     whose four views are not the same vehicle at the same scale fails
     here rather than on screen. */
  const scale = (box.side.w + box.top.w) / 2;
  const agree = Math.abs(box.side.w - box.top.w) / scale;
  if (agree > 0.05) throw new Error(`the side and plan views disagree about the length by ${(agree * 100).toFixed(0)}%`);

  /* And the two datums the picture and the mesh genuinely share: the
     GROUND the tyres stand on, and the CENTRE LINE a van is symmetric
     about. Everything else is the model's own proportions times `scale`.

     Which datum applies to which axis of which view is the only fiddly
     part, and it is fiddly because a plan view turns the vehicle on its
     side: in the front, rear and side views the vertical axis is HEIGHT
     and sits on the ground, and in the plan view it is WIDTH and is
     centred. */
  const hPx = tall * scale, wPx = 2 * half * scale;
  const onGround = (b, hgt) => +(b.y + b.h - hgt).toFixed(2);
  const centred = (at, len, want) => +(at + (len - want) / 2).toFixed(2);
  const px = n => +n.toFixed(2);
  const Z = { z0: 0, z1: +tall.toFixed(4) }, HALF = { half: +half.toFixed(4) };
  measured.views = {
    /* head-on: width across, centred; height up, off the ground */
    front: { x: centred(box.front.x, box.front.w, wPx), y: onGround(box.front, hPx), w: px(wPx), h: px(hPx), ...Z, ...HALF },
    rear:  { x: centred(box.rear.x,  box.rear.w,  wPx), y: onGround(box.rear,  hPx), w: px(wPx), h: px(hPx), ...Z, ...HALF },
    /* the flank: the length is the ruler, so the box's own x and w stand */
    side:  { x: box.side.x, y: onGround(box.side, hPx), w: box.side.w, h: px(hPx), ...Z },
    /* and the plan: length across as drawn, width up the picture and
       centred, because the mirrors stick out into it both ways */
    top:   { x: box.top.x, y: centred(box.top.y, box.top.h, wPx), w: box.top.w, h: px(wPx), ...HALF },
    atlas: { w: W, h: H },
  };

  measured.agree = {
    length: +agree.toFixed(4),
    /* how much of each keyed box is not in the mesh — mirrors, mostly.
       Reported rather than corrected, because the correction is to
       ignore it and take the model's word for the proportions. */
    front: +((box.front.w - wPx) / wPx).toFixed(3),
    rear:  +((box.rear.w - wPx) / wPx).toFixed(3),
    side:  +((box.side.h - hPx) / hPx).toFixed(3),
    top:   +((box.top.h - wPx) / wPx).toFixed(3),
  };
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
const V = measured.views, A = measured.agree;
for (const k of ['front', 'rear', 'side', 'top'])
  console.log(`  ${k.padEnd(5)} ${JSON.stringify(V[k])}`);
console.log(`  the two lengths agree to ${(A.length * 100).toFixed(1)}%; ` +
  `mirror overhang front ${(A.front * 100).toFixed(0)}%, rear ${(A.rear * 100).toFixed(0)}%, ` +
  `side ${(A.side * 100).toFixed(0)}%, plan ${(A.top * 100).toFixed(0)}%`);
console.log(`  silhouette: ${measured.shape.columns.length} columns, ${measured.shape.levels.length} levels, ` +
  `sill at ${(measured.shape.sill * LENGTH).toFixed(0)}, widest ${(measured.shape.width * LENGTH).toFixed(0)}`);
console.log(`  ${(buf.length / 1024).toFixed(0)}K -> ${(total / 1024).toFixed(0)}K`);
