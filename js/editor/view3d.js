/* =====================================================================
   GSS-EDIT — the 3D view
   =====================================================================

   Ultimate Doom Builder's visual mode, on the game's own renderer: the
   level js/mapgeo.js builds, lit by the world shader, under the sky the
   game bakes. Hold the right button and look; WASD, Q and E fly; Shift
   flies faster. Click a floor, a ceiling or a wall to pick it; roll the
   wheel over one to raise it or lower it; click a texture in the
   browser to paint it. C over a surface copies its texture and V pastes
   it, the way Doom Builder does.

   PICKING IS DONE AGAINST THE DOCUMENT, NOT THE TRIANGLES. The level's
   triangles are batched into a few big meshes and do not know which
   sector they came from; the document does, and a ray against a few
   hundred floor planes and walls is nothing. So a hit is a sector of
   the DOCUMENT and a part of it, which is exactly what an edit wants.
   ===================================================================== */

import * as THREE from 'three';
import { buildLevelGeometry } from '../mapgeo.js';
import { buildSky, followSky } from '../sky.js';
import { world } from '../material.js';
import { Weather } from '../weather.js';
import { THING_TYPES, ringOf, centroid, pointInPoly } from './doc.js';
import { makeSky } from './editor.js';

const EYE = 41;              // how far above the floor the camera starts
const FLY = 600;             // units a second
const LOOK = 0.0028;         // radians a pixel

export class View3D {
  constructor(ed, canvas) {
    this.ed = ed;
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    r.setClearColor(0x000000, 1);
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 2, 30000);
    this.cam = null;          // { x, y, z, yaw, pitch } in map space
    this.keys = new Set();
    this.looking = false;
    this.hover = null;
    this.clip = null;         // the texture C copied

    const sky = makeSky(r, ed.doc);
    this.baker = sky.baker;
    this.skyKey = JSON.stringify(ed.doc.world?.sky || {});
    this.sky = buildSky(this.baker.texture);
    this.scene.add(this.sky);

    this.levelGroup = null;
    this.markers = new THREE.Group();
    this.scene.add(this.markers);
    /* THE HIGHLIGHTS: the selection in orange, what is under the mouse
       in green, drawn over everything the way an editor's are */
    const hl = colour => new THREE.LineSegments(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: colour, depthTest: false, transparent: true, opacity: 0.95 }));
    this.selLines = hl(0xff9d3d); this.selLines.renderOrder = 1000;
    this.hovLines = hl(0x3ddc84); this.hovLines.renderOrder = 1001;
    this.scene.add(this.selLines, this.hovLines);
    /* AND EVERY EDGE IN THE MAP, faintly, depth-tested: the grid's own
       walls are black between their lines, and an editor has to show
       where a wall is whether its texture does or not */
    this.edges = new THREE.LineSegments(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x8fb3a0, transparent: true, opacity: 0.35 }));
    this.scene.add(this.edges);
    this.fullbright = false;

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement);
    this.resize();

    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('wheel', e => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerenter', () => { ed.pointerView = '3d'; });
    canvas.addEventListener('pointerleave', () => { if (!this.looking) { this.hover = null; this.drawHover(); } });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && this.looking) this.stopLook();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    ed.on('compiled', () => this.rebuild());
    ed.on('sel', () => this.drawSel());
    ed.on('frame', () => { if (!this.cam) this.toStart(); });

    this.last = performance.now();
    const tick = now => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (ed.layout !== 'only2d') this.frame(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  /** The camera to the player's start, standing. */
  toStart() {
    const t = this.ed.doc.things.find(q => q.type === 'START') || { x: 0, y: 0, angle: 0 };
    const s = this.ed.sectorAt(t.x, t.y);
    this.cam = { x: t.x, y: t.y, z: (s ? zOf(this.ed.doc, s, 'floor', t.x, t.y) : 0) + EYE, yaw: t.angle || 0, pitch: -0.12 };
    this.ed.emit('camera');
  }

  /* ------------------------------------------------------------------
     THE LEVEL, rebuilt from every compile
     ------------------------------------------------------------------ */
  rebuild() {
    const c = this.ed.compiled;
    if (!c?.level) return;
    if (this.levelGroup) {
      this.scene.remove(this.levelGroup);
      disposeTree(this.levelGroup);
      this.levelGroup = null;
    }
    try {
      this.geo = buildLevelGeometry(c.level, this.ed.bank);
      this.levelGroup = this.geo.group;
      this.scene.add(this.levelGroup);
    } catch (e) {
      console.error(e);
      this.ed.say(`the 3D view could not build the map: ${e.message}`);
    }
    /* the sky again, if the map's own changed */
    const key = JSON.stringify(this.ed.doc.world?.sky || {});
    if (key !== this.skyKey) {
      this.skyKey = key;
      const sky = { ...(this.ed.doc.world?.sky || {}), midAmt: 1, bare: true, snap: 0 };
      this.baker.bake(new Weather({ hour: 2.0, kind: 'clear', running: false, fireHaze: false, sky }).frame);
    }
    this.buildMarkers();
    this.buildEdges();
    this.drawSel();
    if (!this.cam) this.toStart();
  }

  /** The things, as posts in their colours with a pointer for facing —
   *  the game's sprites are the game's, and an editor wants to see
   *  where a thing is rather than what it looks like. */
  buildMarkers() {
    disposeTree(this.markers);
    this.markers.clear();
    const d = this.ed.doc;
    if (!d.things.length) return;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const mesh = new THREE.InstancedMesh(geo, mat, d.things.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const arrows = [];
    d.things.forEach((t, i) => {
      const def = THING_TYPES[t.type] || { color: '#f0f', radius: 16 };
      const s = this.ed.sectorAt(t.x, t.y);
      const z = s ? zOf(d, s, 'floor', t.x, t.y) : 0;
      const hgt = t.type === 'START' ? 56 : def.radius * 2.6;
      const r = def.radius * 0.6;
      m.compose(new THREE.Vector3(t.x, z, -t.y), q, new THREE.Vector3(r, hgt, r));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(def.color));
      const a = t.angle || 0, top = z + hgt + 2, L = Math.max(24, def.radius * 1.8);
      arrows.push(t.x, top, -t.y, t.x + Math.cos(a) * L, top, -(t.y + Math.sin(a) * L));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.markers.add(mesh);
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(arrows, 3));
    this.markers.add(new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: 0xffe08a })));
  }

  buildEdges() {
    const d = this.ed.doc, pts = [];
    const P = (x, y, z) => pts.push(x, z, -y);
    /* only where there IS an edge: along every floor; along a ceiling
       that is not the sky; and up a corner as far as a wall stands there
       — the whole height of a one-sided wall, the step between two
       floors, and the step between two ceilings with a roof on */
    const seg = (x0, y0, z0, x1, y1, z1) => { P(x0, y0, z0); P(x1, y1, z1); };
    for (const l of this.ed.lines()) {
      const a = d.vertices[l.a], b = d.vertices[l.b];
      const ss = l.sectors.map(i => d.sectors[i]);
      for (const s of ss) {
        seg(a[0], a[1], zOf(d, s, 'floor', a[0], a[1]), b[0], b[1], zOf(d, s, 'floor', b[0], b[1]));
        if (s.outdoor === false || ss.length === 1) seg(a[0], a[1], zOf(d, s, 'ceil', a[0], a[1]), b[0], b[1], zOf(d, s, 'ceil', b[0], b[1]));
      }
      for (const v of [a, b]) {
        const fl = ss.map(s => zOf(d, s, 'floor', v[0], v[1])), ce = ss.map(s => zOf(d, s, 'ceil', v[0], v[1]));
        if (ss.length === 1) { seg(v[0], v[1], fl[0], v[0], v[1], ce[0]); continue; }
        if (Math.max(...fl) > Math.min(...fl)) seg(v[0], v[1], Math.min(...fl), v[0], v[1], Math.max(...fl));
        if (ss.some(s => s.outdoor === false) && Math.max(...ce) > Math.min(...ce)) seg(v[0], v[1], Math.min(...ce), v[0], v[1], Math.max(...ce));
      }
      /* and a storey's own box */
      for (const s of ss) for (const st of s.storeys || []) {
        seg(a[0], a[1], st.floor, b[0], b[1], st.floor); seg(a[0], a[1], st.ceil, b[0], b[1], st.ceil);
        seg(a[0], a[1], st.floor, a[0], a[1], st.ceil);
      }
    }
    for (const p of d.props) box(P, p.x0, p.y0, p.z0, p.x1, p.y1, p.z1);
    setLines(this.edges, pts);
  }

  /** Every surface at its full brightness, whatever the sector's light
   *  and however far away — Doom Builder's fullbright, on B. */
  setFullbright(on) {
    this.fullbright = on;
    if (!this.lit) this.lit = { minLight: world.minLight.value, lightFalloff: world.lightFalloff.value, globalLight: world.globalLight.value };
    world.minLight.value = on ? 1 : this.lit.minLight;
    world.lightFalloff.value = on ? 1e9 : this.lit.lightFalloff;
    world.globalLight.value = on ? 1.4 : this.lit.globalLight;
    this.ed.say(`fullbright ${on ? 'on' : 'off'}`);
  }

  /* ------------------------------------------------------------------
     PICKING
     ------------------------------------------------------------------ */
  /** The ray under a pixel, in map space. */
  ray(px, py) {
    const ndc = new THREE.Vector2((px / this.w) * 2 - 1, -(py / this.h) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const o = rc.ray.origin, v = rc.ray.direction;
    return { ox: o.x, oy: -o.z, oz: o.y, dx: v.x, dy: -v.z, dz: v.y };
  }

  /**
   * What the ray hits first: `{ t, kind, part, sector, line, band, id }`.
   * kind is 'surface' (part floor | ceil | wall), 'thing' or 'prop'.
   */
  pick(R) {
    const d = this.ed.doc;
    let best = null;
    const take = h => { if (h.t > 0.5 && (!best || h.t < best.t)) best = h; };

    /* floors and ceilings: every sector's two planes, kept only where
       the hit lands in that sector and not in a smaller one inside it */
    d.sectors.forEach((s, si) => {
      const r = ringOf(d, s);
      if (r.length < 3) return;
      const [cx, cy] = centroid(r);
      for (const part of ['floor', 'ceil']) {
        const sl = part === 'floor' ? s.floorSlope : s.ceilSlope;
        const z0 = part === 'floor' ? (s.floor ?? 0) : (s.ceil ?? 256);
        const sx = sl?.dzdx || 0, sy = sl?.dzdy || 0;
        const den = R.dz - sx * R.dx - sy * R.dy;
        /* a floor is seen from above and a ceiling from below */
        if (part === 'floor' ? den >= -1e-6 : den <= 1e-6) continue;
        const t = (z0 + sx * (R.ox - cx) + sy * (R.oy - cy) - R.oz) / den;
        if (!(t > 0)) continue;
        const x = R.ox + R.dx * t, y = R.oy + R.dy * t;
        if (!pointInPoly(r, x, y)) continue;
        if (this.ed.sectorAt(x, y) !== s) continue;
        take({ t, kind: 'surface', part, sector: si, x, y });
      }
      /* and the storeys over it, which pick as the sector */
      (s.storeys || []).forEach(st => {
        for (const [part, z] of [['floor', st.floor], ['ceil', st.ceil]]) {
          if ((part === 'floor') ? R.dz >= 0 : R.dz <= 0) continue;
          const t = (z - R.oz) / R.dz;
          const x = R.ox + R.dx * t, y = R.oy + R.dy * t;
          if (t > 0 && pointInPoly(r, x, y) && this.ed.sectorAt(x, y) === s) take({ t, kind: 'surface', part, sector: si, x, y, storey: true });
        }
      });
    });

    /* the walls: every line, and which band of it the hit is in */
    for (const l of this.ed.lines()) {
      const a = d.vertices[l.a], b = d.vertices[l.b];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const den = R.dx * ey - R.dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const qx = a[0] - R.ox, qy = a[1] - R.oy;
      const t = (qx * ey - qy * ex) / den;
      const u = (qx * R.dy - qy * R.dx) / den;
      if (!(t > 0) || u < 0 || u > 1) continue;
      const x = R.ox + R.dx * t, y = R.oy + R.dy * t, z = R.oz + R.dz * t;
      const ss = l.sectors.map(i => d.sectors[i]);
      const fl = ss.map(s => zOf(d, s, 'floor', x, y)), ce = ss.map(s => zOf(d, s, 'ceil', x, y));
      /* the sector on the camera's side of the line */
      const side = ex * (R.oy - a[1]) - ey * (R.ox - a[0]);
      let front = l.sectors[0];
      if (ss.length > 1) {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, L = Math.hypot(ex, ey);
        const nx = -ey / L * Math.sign(side) * 2, ny = ex / L * Math.sign(side) * 2;
        const on = this.ed.sectorAt(mx + nx, my + ny);
        const k = l.sectors.findIndex(i => d.sectors[i] === on);
        if (k >= 0) front = l.sectors[k];
      }
      if (ss.length === 1) {
        if (z >= fl[0] && z <= ce[0]) take({ t, kind: 'surface', part: 'wall', band: 'middle', line: l.key, sector: front, x, y, z });
      } else {
        const fLo = Math.min(...fl), fHi = Math.max(...fl), cLo = Math.min(...ce), cHi = Math.max(...ce);
        if (z >= fLo && z <= fHi && fHi > fLo) take({ t, kind: 'surface', part: 'wall', band: 'lower', line: l.key, sector: front, x, y, z });
        else if (z >= cLo && z <= cHi && cHi > cLo) take({ t, kind: 'surface', part: 'wall', band: 'upper', line: l.key, sector: front, x, y, z });
      }
    }

    /* the props, as boxes */
    for (const p of d.props) {
      const bx = [Math.min(p.x0, p.x1), Math.max(p.x0, p.x1)], by = [Math.min(p.y0, p.y1), Math.max(p.y0, p.y1)];
      const bz = [Math.min(p.z0, p.z1), Math.max(p.z0, p.z1)];
      const t = slab(R, bx, by, bz);
      if (t !== null) take({ t, kind: 'prop', id: p.id });
    }
    /* and the things, as posts */
    for (const th of d.things) {
      const def = THING_TYPES[th.type] || { radius: 16 };
      const s = this.ed.sectorAt(th.x, th.y);
      const z = s ? zOf(d, s, 'floor', th.x, th.y) : 0;
      const hgt = th.type === 'START' ? 56 : def.radius * 2.6, rad = Math.max(8, def.radius * 0.6);
      const t = slab(R, [th.x - rad, th.x + rad], [th.y - rad, th.y + rad], [z, z + hgt]);
      if (t !== null) take({ t, kind: 'thing', id: th.id });
    }
    return best;
  }

  /* ------------------------------------------------------------------
     THE MOUSE
     ------------------------------------------------------------------ */
  at(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  down(e) {
    this.canvas.focus();
    if (e.button === 2) {
      this.looking = true;
      this.canvas.parentElement.classList.add('look');
      try { this.canvas.requestPointerLock?.(); } catch (err) { /* then it looks by dragging */ }
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const [px, py] = this.at(e);
    const h = this.pick(this.ray(px, py));
    const ed = this.ed;
    if (!h) { ed.clearSel(); return; }
    if (h.kind === 'thing') { ed.select('thing', [h.id], e.shiftKey); return; }
    if (h.kind === 'prop') { ed.select('prop', [h.id], e.shiftKey); return; }
    if (e.shiftKey && h.part !== 'wall' && ed.sel.kind === 'sector') {
      /* shift adds sectors, the surface kept as the last one picked */
      ed.select('sector', [d_id(ed, h.sector)], true);
      ed.surf = { sector: h.sector, part: h.part };
      ed.emit('sel');
      return;
    }
    ed.selectSurface({ sector: h.sector, part: h.part, line: h.line, band: h.band });
  }

  move(e) {
    if (this.looking && this.cam) {
      this.cam.yaw -= e.movementX * LOOK;
      this.cam.pitch = Math.max(-1.5, Math.min(1.5, this.cam.pitch - e.movementY * LOOK));
      this.ed.emit('camera');
      return;
    }
    const [px, py] = this.at(e);
    this.mouse = [px, py];
    this.hoverDirty = true;
  }

  up(e) {
    if (e.button === 2 && this.looking) this.stopLook();
  }
  stopLook() {
    this.looking = false;
    this.canvas.parentElement.classList.remove('look');
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }

  wheel(e) {
    e.preventDefault();
    const ed = this.ed;
    const h = this.hover;
    const step = (e.shiftKey ? 1 : 8) * (e.deltaY < 0 ? 1 : -1);
    if (h?.kind === 'surface' && h.part !== 'wall') {
      /* THE DOOM BUILDER WHEEL: the floor or ceiling under the mouse
         goes up or down — every selected sector with it, if it is one
         of them. Alt moves the ceiling whatever is under the mouse. */
      const s = ed.doc.sectors[h.sector];
      const ids = ed.sel.kind === 'sector' && ed.sel.ids.has(s.id) ? ed.sel.ids : new Set([s.id]);
      const part = e.altKey ? (h.part === 'floor' ? 'ceil' : 'floor') : h.part;
      if (h.storey) { ed.say('storeys are raised in the inspector'); return; }
      ed.nudgeHeight(part, step, ids);
      ed.say(`${part} ${step > 0 ? '+' : ''}${step} → ${part === 'floor' ? ed.doc.sectors[h.sector].floor : ed.doc.sectors[h.sector].ceil}`);
      return;
    }
    if (h?.kind === 'surface' && h.part === 'wall') {
      /* a wall: the ceiling of the sector behind an upper step, the
         floor behind a lower one, and the room's own ceiling for a
         plain wall */
      const s = ed.doc.sectors[h.sector];
      ed.nudgeHeight(h.band === 'lower' ? 'floor' : 'ceil', step, new Set([s.id]));
      return;
    }
    if (h?.kind === 'prop') {
      const id = h.id;
      ed.edit(`prop ${step > 0 ? 'up' : 'down'}`, d => { for (const p of d.props) if (p.id === id) { p.z0 += step; p.z1 += step; } }, { tidy: false });
      return;
    }
    /* over nothing: fly forward and back */
    if (this.cam) {
      const f = (e.deltaY < 0 ? 1 : -1) * 64;
      this.cam.x += Math.cos(this.cam.yaw) * Math.cos(this.cam.pitch) * f;
      this.cam.y += Math.sin(this.cam.yaw) * Math.cos(this.cam.pitch) * f;
      this.cam.z += Math.sin(this.cam.pitch) * f;
      ed.emit('camera');
    }
  }

  /** Keys the 3D view takes first. True if it took it. */
  key(e) {
    const c = e.code, ed = this.ed;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(c)) { this.keys.add(c); return !c.startsWith('Shift'); }
    if (c === 'KeyF') { this.toStart(); return true; }
    if (c === 'KeyB') { this.setFullbright(!this.fullbright); return true; }
    const h = this.hover;
    if (c === 'KeyC' && h?.kind === 'surface') {
      this.clip = this.textureOf(h);
      ed.say(`copied ${this.clip}`);
      ed.ui.toast(`copied ${this.clip}`);
      return true;
    }
    if (c === 'KeyV' && h?.kind === 'surface' && this.clip) {
      const was = ed.surf;
      ed.surf = { sector: h.sector, part: h.part, line: h.line, band: h.band };
      ed.applyTexture(this.clip);
      ed.surf = was;
      ed.say(`pasted ${this.clip}`);
      return true;
    }
    if ((c === 'PageUp' || c === 'PageDown') && h?.kind === 'surface' && h.part !== 'wall') {
      const s = ed.doc.sectors[h.sector];
      ed.nudgeHeight(h.part, (c === 'PageUp' ? 1 : -1) * (e.shiftKey ? 1 : ed.grid), new Set([s.id]));
      return true;
    }
    return false;
  }

  textureOf(h) {
    const d = this.ed.doc, s = d.sectors[h.sector];
    if (h.part === 'floor') return s.floorTex || 'GRID';
    if (h.part === 'ceil') return s.ceilTex || 'SKY';
    const o = d.lines[h.line] || {};
    if (h.band === 'upper') return o.upperTex || s.upperTex || s.wallTex || 'GRIDWALL';
    if (h.band === 'lower') return o.lowerTex || s.lowerTex || s.wallTex || 'GRIDWALL';
    return o.wallTex || s.wallTex || 'GRIDWALL';
  }

  /* ------------------------------------------------------------------
     THE HIGHLIGHTS
     ------------------------------------------------------------------ */
  outline(h) {
    const d = this.ed.doc, out = [];
    const P = (x, y, z) => out.push(x, z, -y);
    if (!h) return out;
    if (h.kind === 'surface' && h.part !== 'wall') {
      const s = d.sectors[h.sector];
      if (!s) return out;
      const r = ringOf(d, s);
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        P(a[0], a[1], zOf(d, s, h.part, a[0], a[1])); P(b[0], b[1], zOf(d, s, h.part, b[0], b[1]));
      }
    } else if (h.kind === 'surface') {
      const [ai, bi] = h.line.split(',').map(Number);
      const a = d.vertices[ai], b = d.vertices[bi];
      if (!a || !b) return out;
      const l = this.ed.lines().find(q => q.key === h.line);
      const ss = (l?.sectors || []).map(i => d.sectors[i]);
      const at = (p, part) => ss.map(s => zOf(d, s, part, p[0], p[1]));
      const band = p => {
        const fl = at(p, 'floor'), ce = at(p, 'ceil');
        if (h.band === 'lower') return [Math.min(...fl), Math.max(...fl)];
        if (h.band === 'upper') return [Math.min(...ce), Math.max(...ce)];
        return [fl[0], ce[0]];
      };
      const [a0, a1] = band(a), [b0, b1] = band(b);
      P(a[0], a[1], a0); P(b[0], b[1], b0); P(b[0], b[1], b0); P(b[0], b[1], b1);
      P(b[0], b[1], b1); P(a[0], a[1], a1); P(a[0], a[1], a1); P(a[0], a[1], a0);
    } else if (h.kind === 'prop') {
      const p = d.props.find(q => q.id === h.id);
      if (p) box(P, p.x0, p.y0, p.z0, p.x1, p.y1, p.z1);
    } else if (h.kind === 'thing') {
      const t = d.things.find(q => q.id === h.id);
      if (t) {
        const def = THING_TYPES[t.type] || { radius: 16 };
        const s = this.ed.sectorAt(t.x, t.y);
        const z = s ? zOf(d, s, 'floor', t.x, t.y) : 0, r = def.radius;
        box(P, t.x - r, t.y - r, z, t.x + r, t.y + r, z + (t.type === 'START' ? 56 : r * 2.6));
      }
    }
    return out;
  }

  drawSel() {
    const ed = this.ed, d = ed.doc, pts = [];
    const { kind, ids } = ed.sel;
    if (ed.surf) pts.push(...this.outline({ kind: 'surface', ...ed.surf }));
    if (kind === 'sector') {
      d.sectors.forEach((s, si) => {
        if (!ids.has(s.id) || (ed.surf && ed.surf.sector === si && ed.surf.part !== 'wall')) return;
        pts.push(...this.outline({ kind: 'surface', part: 'floor', sector: si }));
        /* a sky is not a ceiling anybody wants outlined a thousand units up */
        if (s.outdoor === false) pts.push(...this.outline({ kind: 'surface', part: 'ceil', sector: si }));
      });
    }
    if (kind === 'thing' || kind === 'prop') for (const id of ids) pts.push(...this.outline({ kind, id }));
    if (kind === 'line' && !ed.surf) {
      for (const k of ids) {
        const l = this.ed.lines().find(q => q.key === k);
        if (l) pts.push(...this.outline({ kind: 'surface', part: 'wall', band: l.sectors.length > 1 ? 'lower' : 'middle', line: k, sector: l.sectors[0] }));
      }
    }
    setLines(this.selLines, pts);
  }
  drawHover() { setLines(this.hovLines, this.outline(this.hover)); }

  /* ------------------------------------------------------------------
     EVERY FRAME
     ------------------------------------------------------------------ */
  frame(dt) {
    if (!this.cam) return;
    const c = this.cam, k = this.keys;
    if (this.ed.pointerView === '3d' || this.looking) {
      const sp = FLY * (k.has('ShiftLeft') || k.has('ShiftRight') ? 3.5 : 1) * dt;
      const fx = Math.cos(c.yaw), fy = Math.sin(c.yaw);
      let mx = 0, my = 0, mz = 0;
      if (k.has('KeyW')) { mx += fx * Math.cos(c.pitch); my += fy * Math.cos(c.pitch); mz += Math.sin(c.pitch); }
      if (k.has('KeyS')) { mx -= fx * Math.cos(c.pitch); my -= fy * Math.cos(c.pitch); mz -= Math.sin(c.pitch); }
      if (k.has('KeyA')) { mx -= fy; my += fx; }
      if (k.has('KeyD')) { mx += fy; my -= fx; }
      if (k.has('KeyE')) mz += 1;
      if (k.has('KeyQ')) mz -= 1;
      if (mx || my || mz) { c.x += mx * sp; c.y += my * sp; c.z += mz * sp; this.ed.emit('camera'); this.hoverDirty = true; }
    } else {
      k.clear();
    }
    this.camera.position.set(c.x, c.z, -c.y);
    this.camera.rotation.set(c.pitch, c.yaw - Math.PI / 2, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    world.eyePos.value.set(c.x, c.z, -c.y);
    followSky(this.sky, this.camera);

    if (this.hoverDirty && this.mouse && !this.looking) {
      this.hoverDirty = false;
      this.hover = this.pick(this.ray(this.mouse[0], this.mouse[1]));
      this.drawHover();
    }
    this.renderer.render(this.scene, this.camera);
  }
}

/* ---------------------------------------------------------------------
   helpers
   --------------------------------------------------------------------- */

/** A document sector's floor or ceiling height at (x, y), slope and all. */
export function zOf(d, s, part, x, y) {
  const z0 = part === 'floor' ? (s.floor ?? 0) : (s.ceil ?? 256);
  const sl = part === 'floor' ? s.floorSlope : s.ceilSlope;
  if (!sl || (!sl.dzdx && !sl.dzdy)) return z0;
  const [cx, cy] = centroid(ringOf(d, s));
  return z0 + (sl.dzdx || 0) * (x - cx) + (sl.dzdy || 0) * (y - cy);
}

/** A ray against an axis-aligned box: the distance in, or null. */
function slab(R, bx, by, bz) {
  let t0 = 0, t1 = Infinity;
  for (const [o, dv, [lo, hi]] of [[R.ox, R.dx, bx], [R.oy, R.dy, by], [R.oz, R.dz, bz]]) {
    if (Math.abs(dv) < 1e-12) { if (o < lo || o > hi) return null; continue; }
    let a = (lo - o) / dv, b = (hi - o) / dv;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0 > 0 ? t0 : null;
}

function box(P, x0, y0, z0, x1, y1, z1) {
  const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4];
    P(a[0], a[1], z0); P(b[0], b[1], z0);
    P(a[0], a[1], z1); P(b[0], b[1], z1);
    P(a[0], a[1], z0); P(a[0], a[1], z1);
  }
}

function setLines(obj, pts) {
  obj.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  obj.geometry = g;
  obj.visible = pts.length > 0;
}

/** Throw away what a rebuild replaced — geometry and the materials made
 *  for it, never the bank's textures, which everything shares. */
function disposeTree(root) {
  root.traverse(o => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach(x => x.dispose?.()); else m?.dispose?.();
  });
}

const d_id = (ed, si) => ed.doc.sectors[si]?.id;

