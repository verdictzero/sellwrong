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
   byte-for-byte, and so is every vertex it keeps: the asset is
   stripped, never resampled.

   AND THE VERTEX ATTRIBUTES THE SAME RENDERER CANNOT USE, which is the
   other half of the same saving and was found on the second
   flamethrower: a Sketchfab export carries a TANGENT (for the normal
   map that has just been dropped) and four sets of UVs (for the light
   maps and the ambient occlusion of a renderer that is not this one).
   js/glb.js reads POSITION, NORMAL, TEXCOORD_0 and COLOR_0 and silently
   ignores the rest, so on that model the file was carrying forty
   bytes a vertex — 1.6 megabytes — that nothing would ever bind.

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
/* A MODEL WITH NO MARKERS IS ALLOWED THROUGH, as of the cerebral bore:
   it arrived as a mesh and a diffuse and nothing else, and the only
   reason to run it through here is the two maps below that an unlit
   renderer cannot use — ten megabytes of them. Where the nozzle is on a
   file like that is a number in js/weapon3d.js (see GUNS), which is the
   same answer the extinguisher got. A model that has SOME markers and
   not both is still an error, because half a set is a mistake. */
if (Object.keys(anchors).length && (!anchors.pilot || !anchors.nozzle))
  throw new Error('expected a pilot and a nozzle marker, found ' + Object.keys(anchors).join());
if (!Object.keys(anchors).length) console.warn('no marker spheres: stripping the maps only, the anchors are the game\'s business');

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

/* Attributes: the four js/glb.js knows how to bind, and no others. */
const KEEP_ATTR = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0']);
const dropped = new Map();
for (const m of meshes) for (const p of m.primitives)
  for (const k of Object.keys(p.attributes)) {
    if (KEEP_ATTR.has(k)) continue;
    dropped.set(k, (dropped.get(k) || 0) + (json.accessors[p.attributes[k]]?.count || 0));
    delete p.attributes[k];
  }

/* Accessors: everything a kept primitive still names. */
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

/* ---- repack the binary ---------------------------------------------
   ONE TIGHT VIEW PER ACCESSOR, and this is where dropping an attribute
   turns into bytes off the file. A bufferView is a RANGE, and an
   exporter is free to park twenty accessors in one of them — which
   Sketchfab does — so a view survives as long as ANY accessor still
   points into it, and deleting three sets of UVs above saved nothing
   but the JSON that named them. Copying each accessor's own elements
   into a view of its own is what actually leaves the dead bytes
   behind: on the second flamethrower, 2.8 megabytes of geometry to
   1.6.

   Element by element, at the source's own stride, so the values are
   the file's own — this is a repack and not a resample, and the check
   below proves it: every accessor that came with a min and a max is
   measured again out of the bytes that were written, and a mismatch
   throws rather than shipping a model that is quietly bent. */
const CBYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const ITEMS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const bufferViews = [], parts = [];
let cursor = 0;
const place = bytes => {
  const pad = (4 - (cursor % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); cursor += pad; }
  const at = cursor;
  parts.push(bytes);
  cursor += bytes.length;
  return at;
};
for (const a of accessors) {
  const bv = json.bufferViews[a.bufferView];
  const n = ITEMS[a.type], cb = CBYTES[a.componentType];
  if (!n || !cb) throw new Error(`accessor: unsupported ${a.type}/${a.componentType}`);
  const elem = n * cb, stride = bv.byteStride || elem;
  const from = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = Buffer.alloc(a.count * elem);
  for (let i = 0; i < a.count; i++) bin.copy(out, i * elem, from + i * stride, from + i * stride + elem);
  const view = { buffer: 0, byteOffset: place(out), byteLength: out.length };
  if (bv.target) view.target = bv.target;
  a.bufferView = bufferViews.length;
  delete a.byteOffset;
  delete a.byteStride;
  bufferViews.push(view);
  /* and out again, to prove the copy */
  if (a.min && a.componentType === 5126) {
    for (let k = 0; k < n; k++) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < a.count; i++) {
        const v = out.readFloatLE(i * elem + k * cb);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const off = Math.max(Math.abs(lo - a.min[k]), Math.abs(hi - a.max[k]));
      if (off > 1e-4) throw new Error(`repacked accessor is not the accessor: component ${k} now ${lo}..${hi}, the file says ${a.min[k]}..${a.max[k]}`);
    }
  }
}
for (const im of images) {
  const bv = json.bufferViews[im.bufferView];
  const start = bv.byteOffset || 0;
  im.bufferView = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset: place(bin.subarray(start, start + bv.byteLength)), byteLength: bv.byteLength });
}
const binOut = Buffer.concat(parts);

const out = {
  asset: {
    ...json.asset,
    generator: (json.asset.generator || '') + ' + tools/prep-model.mjs',
    extras: { ...(json.asset.extras || {}), ...(Object.keys(anchors).length ? { anchors } : {}), source: inFile.split('/').pop() },
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
if (dropped.size) console.log(`  attributes nothing binds: ${[...dropped].map(([k, n]) => `${k} (${n} vertices)`).join(', ')}`);
if (anchors.pilot) console.log(`  anchors: pilot ${anchors.pilot.join(', ')}  nozzle ${anchors.nozzle.join(', ')}`);
