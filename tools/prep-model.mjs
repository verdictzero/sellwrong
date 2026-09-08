/* =====================================================================
   Prepare a GLB for the game
   =====================================================================

     node tools/prep-model.mjs <in.glb> <out.glb>

   The flamethrower arrives from Blender with two things in it that are
   not part of the gun: a pair of spheres named CLAUDE_delete_this_and_
   put_..._here, which mark WHERE the pilot light burns and WHERE the
   flame comes out. They are instructions, not geometry. This takes them
   out of the mesh and writes their positions into the file's own
   `asset.extras.anchors`, where js/weapon3d.js reads them back — so the
   model stays one self-describing file and the game never renders a
   marker sphere by mistake.

   It also drops the textures an unlit renderer cannot use. The emissive
   map is a single colour and the normal map is two; the metal-rough map
   is real but there is no lighting model here to consume it. Between
   them that is a third of the download for nothing on screen. The
   diffuse — the one texture that IS the gun — is copied through
   byte-for-byte, and so is every vertex: the asset is stripped, never
   resampled.

   Nothing else is understood or needed: one buffer, no animations, no
   skins, no extensions. Anything fancier throws rather than guessing.
   ===================================================================== */

import fs from 'node:fs';

const [,, inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error('usage: prep-model.mjs <in.glb> <out.glb>'); process.exit(2); }

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

/* ---- the reference markers ----------------------------------------- */
const anchors = {};
const isMarker = n => /^CLAUDE_delete_this/i.test(n.name || '');
const keepNode = [];
json.nodes.forEach((n, i) => {
  if (!isMarker(n)) { keepNode.push(i); return; }
  const key = /pilot/i.test(n.name) ? 'pilot' : /output|flame|nozzle|muzzle/i.test(n.name) ? 'nozzle' : n.name;
  /* A root node's translation IS its position. If somebody parents one
     of these later, that is the moment to add a matrix walk here. */
  if (n.children?.length || json.nodes.some(o => o.children?.includes(i))) throw new Error('marker ' + n.name + ' is not a root node');
  anchors[key] = (n.translation || [0, 0, 0]).map(v => +v.toFixed(6));
});
if (!anchors.pilot || !anchors.nozzle) throw new Error('expected a pilot and a nozzle marker, found ' + Object.keys(anchors).join());

const nodeMap = new Map(keepNode.map((old, i) => [old, i]));
const nodes = keepNode.map(i => {
  const n = { ...json.nodes[i] };
  if (n.children) n.children = n.children.map(c => nodeMap.get(c)).filter(c => c !== undefined);
  return n;
});
const scenes = json.scenes.map(s => ({ ...s, nodes: s.nodes.map(i => nodeMap.get(i)).filter(i => i !== undefined) }));

/* ---- what the remaining nodes still use ---------------------------- */
const usedMesh = new Set(nodes.map(n => n.mesh).filter(m => m !== undefined));
const meshMap = new Map();
const meshes = [];
json.meshes.forEach((m, i) => { if (usedMesh.has(i)) { meshMap.set(i, meshes.length); meshes.push(m); } });
for (const n of nodes) if (n.mesh !== undefined) n.mesh = meshMap.get(n.mesh);

/* Materials: keep every one a kept mesh refers to, reduced to its base
   colour. The other maps are dropped below by never being referenced. */
const usedMat = new Set();
for (const m of meshes) for (const p of m.primitives) if (p.material !== undefined) usedMat.add(p.material);
const matMap = new Map();
const materials = [];
json.materials.forEach((m, i) => {
  if (!usedMat.has(i)) return;
  matMap.set(i, materials.length);
  const out = { name: m.name, doubleSided: m.doubleSided, pbrMetallicRoughness: {} };
  if (m.pbrMetallicRoughness?.baseColorTexture) out.pbrMetallicRoughness.baseColorTexture = { ...m.pbrMetallicRoughness.baseColorTexture };
  if (m.pbrMetallicRoughness?.baseColorFactor) out.pbrMetallicRoughness.baseColorFactor = m.pbrMetallicRoughness.baseColorFactor;
  if (m.alphaMode) out.alphaMode = m.alphaMode;
  materials.push(out);
});
for (const m of meshes) for (const p of m.primitives) if (p.material !== undefined) p.material = matMap.get(p.material);

/* Textures and images, only those the surviving materials point at. */
const usedTex = new Set();
for (const m of materials) if (m.pbrMetallicRoughness.baseColorTexture) usedTex.add(m.pbrMetallicRoughness.baseColorTexture.index);
const texMap = new Map(), textures = [];
json.textures.forEach((t, i) => { if (usedTex.has(i)) { texMap.set(i, textures.length); textures.push({ ...t }); } });
for (const m of materials) if (m.pbrMetallicRoughness.baseColorTexture) m.pbrMetallicRoughness.baseColorTexture.index = texMap.get(m.pbrMetallicRoughness.baseColorTexture.index);
const usedImg = new Set(textures.map(t => t.source));
const imgMap = new Map(), images = [];
json.images.forEach((im, i) => { if (usedImg.has(i)) { imgMap.set(i, images.length); images.push({ ...im }); } });
for (const t of textures) t.source = imgMap.get(t.source);

/* Accessors: everything a kept primitive names. */
const usedAcc = new Set();
for (const m of meshes) for (const p of m.primitives) {
  for (const a of Object.values(p.attributes)) usedAcc.add(a);
  if (p.indices !== undefined) usedAcc.add(p.indices);
  if (p.targets) throw new Error('morph targets are not handled');
}
const accMap = new Map(), accessors = [];
json.accessors.forEach((a, i) => { if (usedAcc.has(i)) { accMap.set(i, accessors.length); accessors.push({ ...a }); } });
for (const m of meshes) for (const p of m.primitives) {
  for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]);
  if (p.indices !== undefined) p.indices = accMap.get(p.indices);
}
for (const a of accessors) if (a.sparse) throw new Error('sparse accessors are not handled');

/* ---- repack the binary --------------------------------------------- */
const usedBV = new Set([...accessors.map(a => a.bufferView), ...images.map(im => im.bufferView)]);
const bvMap = new Map(), bufferViews = [], parts = [];
let cursor = 0;
json.bufferViews.forEach((bv, i) => {
  if (!usedBV.has(i)) return;
  const start = bv.byteOffset || 0;
  const bytes = bin.subarray(start, start + bv.byteLength);
  const pad = (4 - (cursor % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); cursor += pad; }
  const out = { buffer: 0, byteOffset: cursor, byteLength: bv.byteLength };
  if (bv.byteStride) out.byteStride = bv.byteStride;
  if (bv.target) out.target = bv.target;
  bvMap.set(i, bufferViews.length);
  bufferViews.push(out);
  parts.push(bytes);
  cursor += bv.byteLength;
});
for (const a of accessors) a.bufferView = bvMap.get(a.bufferView);
for (const im of images) im.bufferView = bvMap.get(im.bufferView);
const binOut = Buffer.concat(parts);

const out = {
  asset: {
    ...json.asset,
    generator: (json.asset.generator || '') + ' + tools/prep-model.mjs',
    extras: { ...(json.asset.extras || {}), anchors, source: inFile.split('/').pop() },
  },
  scene: json.scene ?? 0,
  scenes, nodes, meshes, materials, textures, images, samplers: json.samplers,
  accessors, bufferViews,
  buffers: [{ byteLength: binOut.length }],
};

/* ---- write ---------------------------------------------------------- */
let jsonBuf = Buffer.from(JSON.stringify(out), 'utf8');
if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]);
let binPadded = binOut;
if (binPadded.length % 4) binPadded = Buffer.concat([binPadded, Buffer.alloc(4 - (binPadded.length % 4))]);
const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii'); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binPadded.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.write(type, 4, 'ascii'); return b; };
fs.mkdirSync(outFile.replace(/\/[^/]*$/, ''), { recursive: true });
fs.writeFileSync(outFile, Buffer.concat([header, ch(jsonBuf.length, 'JSON'), jsonBuf, ch(binPadded.length, 'BIN\0'), binPadded]));

const kb = n => (n / 1024).toFixed(0) + 'K';
console.log(`${outFile}: ${kb(buf.length)} -> ${kb(fs.statSync(outFile).size)}`);
console.log(`  nodes ${json.nodes.length} -> ${nodes.length}, meshes ${json.meshes.length} -> ${meshes.length}, images ${json.images.length} -> ${images.length}`);
console.log(`  anchors: pilot ${anchors.pilot.join(', ')}  nozzle ${anchors.nozzle.join(', ')}`);
