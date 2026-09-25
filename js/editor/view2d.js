/* =====================================================================
   GSS-EDIT — the plan
   =====================================================================

   The Doom Builder half: the map from above on a grid, north up. Every
   mode edits one kind of thing — vertices, lines, sectors, things,
   props — and two draw: DRAW clicks out a sector a corner at a time and
   RECT drags one out. Drag anything to move it; drag on nothing to
   box-select; the wheel zooms about the cursor and the right or middle
   button pans.

   A DRAG IS ONE UNDO. The first move of a drag pushes the undo step and
   every move after it shifts the same selection further, so a drag is
   cheap however long it is and Ctrl+Z puts it all back. It is tidied —
   welded — when the button comes up, which is the moment a vertex
   dropped on another becomes one vertex.
   ===================================================================== */

import { THING_TYPES, ringOf, segDist, compact, signedArea } from './doc.js';
import { moveThings } from './editor.js';

const PICK_PX = 8;           // how near, in pixels, counts as on it

export class View2D {
  constructor(ed, canvas) {
    this.ed = ed;
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.cx = 5120; this.cy = 5120;
    this.scale = 0.08;       // pixels per unit
    this.w = 1; this.h = 1; this.dpr = 1;
    this.mouse = null;       // { x, y } in map units, snapped separately
    this.hover = null;       // { kind, id }
    this.drag = null;
    this.path = [];          // the sector being drawn
    this.dirty = true;

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement);
    this.resize();

    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.up(e));
    canvas.addEventListener('dblclick', e => this.dbl(e));
    canvas.addEventListener('wheel', e => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerenter', () => { ed.pointerView = '2d'; });
    canvas.addEventListener('pointerleave', () => { this.mouse = null; this.hover = null; ed.ui.setPos(null); this.dirty = true; });

    for (const ev of ['doc', 'sel', 'mode', 'grid', 'layout', 'compiled']) ed.on(ev, () => { this.dirty = true; });
    ed.on('mode', () => { this.path = []; });
    ed.on('layout', () => setTimeout(() => this.resize(), 0));
    ed.on('frame', () => this.frame());
    ed.on('frameSel', () => this.frameSel());
    ed.on('camera', () => { this.dirty = true; });

    const tick = () => { if (this.dirty) this.draw(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------
     the plan's own geometry
     ------------------------------------------------------------------ */
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    /* the first real size frames the map: at boot the panel may not
       have been laid out yet when the editor asked */
    if (!this.framed && r.width > 1 && this.ed.history) { this.framed = true; this.frame(); }
    this.dirty = true;
  }
  sx(x) { return (x - this.cx) * this.scale + this.w / 2; }
  sy(y) { return this.h / 2 - (y - this.cy) * this.scale; }
  mx(px) { return (px - this.w / 2) / this.scale + this.cx; }
  my(py) { return (this.h / 2 - py) / this.scale + this.cy; }
  at(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    return { px, py, x: this.mx(px), y: this.my(py) };
  }

  /** Fit a box in the view, with a margin. */
  fit(x0, y0, x1, y1) {
    if (!(x1 > x0) || !(y1 > y0)) { x0 -= 256; x1 += 256; y0 -= 256; y1 += 256; }
    this.cx = (x0 + x1) / 2; this.cy = (y0 + y1) / 2;
    this.scale = Math.min(this.w / (x1 - x0), this.h / (y1 - y0)) * 0.88;
    this.dirty = true;
  }
  frame() {
    const V = this.ed.doc.vertices;
    if (!V.length) { this.fit(-512, -512, 512, 512); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of V) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    this.fit(x0, y0, x1, y1);
  }
  frameSel() {
    const pts = this.selPoints();
    if (!pts.length) return this.frame();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    this.fit(x0 - 64, y0 - 64, x1 + 64, y1 + 64);
  }
  selPoints() {
    const d = this.ed.doc, { kind, ids } = this.ed.sel, out = [];
    if (kind === 'vertex') ids.forEach(i => d.vertices[i] && out.push(d.vertices[i]));
    if (kind === 'line') ids.forEach(k => k.split(',').forEach(i => d.vertices[+i] && out.push(d.vertices[+i])));
    if (kind === 'sector') d.sectors.forEach(s => ids.has(s.id) && out.push(...ringOf(d, s)));
    if (kind === 'thing') d.things.forEach(t => ids.has(t.id) && out.push([t.x, t.y]));
    if (kind === 'prop') d.props.forEach(p => ids.has(p.id) && out.push([p.x0, p.y0], [p.x1, p.y1]));
    return out;
  }

  /* ------------------------------------------------------------------
     WHAT IS UNDER THE MOUSE, in the current mode
     ------------------------------------------------------------------ */
  pick(x, y, kind = modeKind(this.ed.mode)) {
    const d = this.ed.doc;
    const r = PICK_PX / this.scale;
    if (kind === 'vertex') {
      let best = -1, bd = r * r;
      d.vertices.forEach((v, i) => { const q = (v[0] - x) ** 2 + (v[1] - y) ** 2; if (q < bd) { bd = q; best = i; } });
      return best >= 0 ? { kind, id: best } : null;
    }
    if (kind === 'line') {
      let best = null, bd = r;
      for (const l of this.lines()) {
        const a = d.vertices[l.a], b = d.vertices[l.b];
        const { d: dist } = segDist(a[0], a[1], b[0], b[1], x, y);
        if (dist < bd) { bd = dist; best = l.key; }
      }
      return best ? { kind, id: best } : null;
    }
    if (kind === 'sector') { const s = this.ed.sectorAt(x, y); return s ? { kind, id: s.id } : null; }
    if (kind === 'thing') {
      let best = null, bd = Infinity;
      for (const t of d.things) {
        const rad = Math.max(THING_TYPES[t.type]?.radius || 16, r);
        const q = Math.hypot(t.x - x, t.y - y);
        if (q < rad && q < bd) { bd = q; best = t.id; }
      }
      return best !== null ? { kind, id: best } : null;
    }
    if (kind === 'prop') {
      let best = null, ba = Infinity;
      for (const p of d.props) {
        const x0 = Math.min(p.x0, p.x1), x1 = Math.max(p.x0, p.x1), y0 = Math.min(p.y0, p.y1), y1 = Math.max(p.y0, p.y1);
        if (x < x0 - r || x > x1 + r || y < y0 - r || y > y1 + r) continue;
        const a = (x1 - x0) * (y1 - y0);
        if (a < ba) { ba = a; best = p.id; }
      }
      return best !== null ? { kind, id: best } : null;
    }
    return null;
  }
  lines() {
    return this.ed.lines();
  }

  /** A point for drawing: an existing vertex near the cursor, or the grid. */
  snapPoint(x, y) {
    const v = this.pick(x, y, 'vertex');
    if (v) return [...this.ed.doc.vertices[v.id]];
    return [this.ed.snapV(x), this.ed.snapV(y)];
  }

  /* ------------------------------------------------------------------
     THE MOUSE
     ------------------------------------------------------------------ */
  down(e) {
    const ed = this.ed;
    this.canvas.focus();
    const p = this.at(e);
    this.canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2) {
      this.drag = { type: 'pan', px: p.px, py: p.py, cx: this.cx, cy: this.cy };
      return;
    }
    if (e.button !== 0) return;
    const mode = ed.mode;

    if (mode === 'draw') {
      const pt = this.snapPoint(p.x, p.y);
      const first = this.path[0];
      if (first && this.path.length >= 3 && Math.hypot(first[0] - pt[0], first[1] - pt[1]) * this.scale < PICK_PX + 2) {
        this.closePath();
      } else if (!this.path.length || pt[0] !== this.path[this.path.length - 1][0] || pt[1] !== this.path[this.path.length - 1][1]) {
        this.path.push(pt);
      }
      this.dirty = true;
      return;
    }
    if (mode === 'rect') {
      const a = this.snapPoint(p.x, p.y);
      this.drag = { type: 'rect', a, b: a };
      return;
    }

    const kind = modeKind(mode);
    const hit = this.pick(p.x, p.y, kind);
    if (!hit) {
      if (mode === 'things') { ed.addThing(p.x, p.y); return; }
      if (mode === 'props') { const a = [ed.snapV(p.x), ed.snapV(p.y)]; this.drag = { type: 'prop', a, b: a }; return; }
      this.drag = { type: 'box', a: [p.x, p.y], b: [p.x, p.y], add: e.shiftKey };
      return;
    }
    if (e.shiftKey || e.ctrlKey) { ed.select(kind, [hit.id], true); return; }
    if (!ed.isSel(kind, hit.id)) ed.select(kind, [hit.id]);
    /* THE REFERENCE POINT the drag snaps: the thing grabbed, or the
       corner of it nearest the mouse, so a room dragged on a 64 grid
       stays on the 64 grid */
    const d = ed.doc;
    let ref = [p.x, p.y];
    if (kind === 'vertex') ref = [...d.vertices[hit.id]];
    else if (kind === 'thing') { const t = d.things.find(t => t.id === hit.id); ref = [t.x, t.y]; }
    else if (kind === 'prop') { const q = d.props.find(q => q.id === hit.id); ref = [q.x0, q.y0]; }
    else {
      let bd = Infinity;
      for (const v of this.selPoints()) { const q = Math.hypot(v[0] - p.x, v[1] - p.y); if (q < bd) { bd = q; ref = [...v]; } }
    }
    this.drag = { type: 'move', start: [p.x, p.y], ref, done: [0, 0], pushed: false, px: p.px, py: p.py };
  }

  move(e) {
    const ed = this.ed;
    const p = this.at(e);
    this.mouse = { x: p.x, y: p.y };
    const snapped = ed.mode === 'draw' || ed.mode === 'rect' ? this.snapPoint(p.x, p.y) : [ed.snapV(p.x), ed.snapV(p.y)];
    this.cursor = snapped;
    ed.ui.setPos(snapped[0], snapped[1]);
    const dr = this.drag;
    if (!dr) {
      this.hover = ['draw', 'rect'].includes(ed.mode) ? null : this.pick(p.x, p.y);
      this.dirty = true;
      return;
    }
    if (dr.type === 'pan') {
      this.cx = dr.cx - (p.px - dr.px) / this.scale;
      this.cy = dr.cy + (p.py - dr.py) / this.scale;
    } else if (dr.type === 'box' || dr.type === 'rect' || dr.type === 'prop') {
      dr.b = dr.type === 'box' ? [p.x, p.y] : dr.type === 'rect' ? this.snapPoint(p.x, p.y) : [ed.snapV(p.x), ed.snapV(p.y)];
    } else if (dr.type === 'move') {
      /* nothing moves until the mouse has, a little — a click is not a drag */
      if (!dr.pushed && Math.hypot(p.px - dr.px, p.py - dr.py) < 4) return;
      const tx = ed.snapV(dr.ref[0] + p.x - dr.start[0]) - dr.ref[0];
      const ty = ed.snapV(dr.ref[1] + p.y - dr.start[1]) - dr.ref[1];
      const ddx = tx - dr.done[0], ddy = ty - dr.done[1];
      if (ddx || ddy) {
        if (!dr.pushed) { ed.history.push(`move ${ed.sel.kind}`); dr.pushed = true; }
        moveThings(ed.doc, ed.sel.kind, ed.sel.ids, ddx, ddy);
        dr.done = [tx, ty];
        ed.changed();
      }
    }
    this.dirty = true;
  }

  up(e) {
    const ed = this.ed;
    const dr = this.drag;
    this.drag = null;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    if (!dr) return;
    if (dr.type === 'box') {
      const kind = modeKind(ed.mode);
      const [x0, x1] = [Math.min(dr.a[0], dr.b[0]), Math.max(dr.a[0], dr.b[0])];
      const [y0, y1] = [Math.min(dr.a[1], dr.b[1]), Math.max(dr.a[1], dr.b[1])];
      if ((x1 - x0) * this.scale < 3 && (y1 - y0) * this.scale < 3) { if (!dr.add) ed.clearSel(); }
      else ed.select(kind, this.inBox(kind, x0, y0, x1, y1), dr.add);
    } else if (dr.type === 'rect') {
      const [a, b] = [dr.a, dr.b];
      if (a[0] !== b[0] && a[1] !== b[1]) {
        const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
        ed.addSector([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 'draw rectangle');
      }
    } else if (dr.type === 'prop') {
      ed.addProp(dr.a[0], dr.a[1], dr.b[0], dr.b[1]);
    } else if (dr.type === 'move' && dr.pushed) {
      /* THE WELD, now the drag is over */
      const before = ed.doc.vertices.length;
      compact(ed.doc);
      if (ed.doc.vertices.length !== before && (ed.sel.kind === 'vertex' || ed.sel.kind === 'line')) ed.clearSel();
      ed.changed({ now: true });
      ed.say(`moved ${dr.done[0]}, ${dr.done[1]}`);
    }
    this.dirty = true;
  }

  dbl(e) {
    if (this.ed.mode === 'draw') { this.closePath(); return; }
    if (this.ed.sel.kind) this.ed.ui.showTab('insp');
  }

  wheel(e) {
    e.preventDefault();
    const p = this.at(e);
    const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
    this.scale = Math.max(0.005, Math.min(40, this.scale * k));
    /* about the cursor: the point under it stays under it */
    this.cx = p.x - (p.px - this.w / 2) / this.scale;
    this.cy = p.y - (this.h / 2 - p.py) / this.scale;
    this.dirty = true;
  }

  inBox(kind, x0, y0, x1, y1) {
    const d = this.ed.doc, inB = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1, out = [];
    if (kind === 'vertex') d.vertices.forEach((v, i) => inB(v[0], v[1]) && out.push(i));
    if (kind === 'line') for (const l of this.lines()) { const a = d.vertices[l.a], b = d.vertices[l.b]; if (inB(a[0], a[1]) && inB(b[0], b[1])) out.push(l.key); }
    if (kind === 'sector') for (const s of d.sectors) if (ringOf(d, s).every(v => inB(v[0], v[1]))) out.push(s.id);
    if (kind === 'thing') for (const t of d.things) if (inB(t.x, t.y)) out.push(t.id);
    if (kind === 'prop') for (const p of d.props) if (inB(p.x0, p.y0) && inB(p.x1, p.y1)) out.push(p.id);
    return out;
  }

  closePath() {
    if (this.path.length >= 3) this.ed.addSector(this.path);
    this.path = [];
    this.dirty = true;
  }

  /** Keys the plan takes before the editor does. True if it took it. */
  key(e) {
    const ed = this.ed, k = e.key;
    if (ed.mode === 'draw' && this.path.length) {
      if (k === 'Enter') { this.closePath(); return true; }
      if (k === 'Escape') { this.path = []; this.dirty = true; return true; }
      if (k === 'Backspace') { this.path.pop(); this.dirty = true; return true; }
    }
    if ((k === ',' || k === '.') && ed.sel.kind === 'thing') {
      const da = (k === ',' ? 1 : -1) * Math.PI / 4;
      ed.edit('turn', d => { for (const t of d.things) if (ed.sel.ids.has(t.id)) t.angle = ((t.angle || 0) + da + Math.PI * 2) % (Math.PI * 2); }, { tidy: false });
      return true;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (arrows[k] && ed.sel.kind) {
      const s = e.shiftKey ? ed.grid * 4 : ed.grid;
      ed.moveSel(arrows[k][0] * s, arrows[k][1] * s, 'nudge');
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------
     DRAWING THE PLAN
     ------------------------------------------------------------------ */
  draw() {
    this.dirty = false;
    const g = this.g, ed = this.ed, d = ed.doc;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#07090b';
    g.fillRect(0, 0, this.w, this.h);

    this.drawGrid();

    /* THE SECTORS, filled by floor height so the plan reads like a
       relief map, and the selection over the top */
    const heights = d.sectors.map(s => s.floor ?? 0);
    const lo = Math.min(0, ...heights), hi = Math.max(1, ...heights);
    const selS = ed.sel.kind === 'sector' ? ed.sel.ids : null;
    const hovS = this.hover?.kind === 'sector' ? this.hover.id : null;
    const order = d.sectors.map((s, i) => [s, Math.abs(signedArea(ringOf(d, s))), i]).sort((a, b) => b[1] - a[1]);
    for (const [s] of order) {
      const r = ringOf(d, s);
      if (r.length < 3) continue;
      g.beginPath();
      r.forEach(([x, y], k) => (k ? g.lineTo(this.sx(x), this.sy(y)) : g.moveTo(this.sx(x), this.sy(y))));
      g.closePath();
      const t = (((s.floor ?? 0) - lo) / (hi - lo || 1));
      const shut = (s.ceil ?? 256) <= (s.floor ?? 0);
      g.fillStyle = selS?.has(s.id) ? 'rgba(255,157,61,0.28)' : s.id === hovS ? 'rgba(61,220,132,0.16)'
        : shut ? 'rgba(90,90,90,0.35)' : `rgba(${30 + t * 40},${60 + t * 90},${50 + t * 40},0.22)`;
      g.fill();
      if (s.floorSlope || s.ceilSlope) {
        /* a slope is hatched, so it can be found from above */
        g.save(); g.clip();
        g.strokeStyle = 'rgba(255,180,84,0.18)'; g.lineWidth = 1;
        const [bx0, by0] = [Math.min(...r.map(v => this.sx(v[0]))), Math.min(...r.map(v => this.sy(v[1])))];
        const [bx1, by1] = [Math.max(...r.map(v => this.sx(v[0]))), Math.max(...r.map(v => this.sy(v[1])))];
        g.beginPath();
        for (let q = bx0 - (by1 - by0); q < bx1; q += 8) { g.moveTo(q, by1); g.lineTo(q + (by1 - by0), by0); }
        g.stroke(); g.restore();
      }
    }

    /* THE LINES: one-sided white, two-sided grey, blocking red */
    const selL = ed.sel.kind === 'line' ? ed.sel.ids : null;
    const hovL = this.hover?.kind === 'line' ? this.hover.id : null;
    g.lineCap = 'round';
    for (const l of this.lines()) {
      const a = d.vertices[l.a], b = d.vertices[l.b];
      if (!a || !b) continue;
      const o = d.lines[l.key];
      const sel = selL?.has(l.key), hov = l.key === hovL;
      g.strokeStyle = sel ? '#ff9d3d' : hov ? '#3ddc84' : o?.blocking ? '#ff6b6b' : l.sectors.length > 1 ? '#6d7a86' : '#e6edf0';
      g.lineWidth = sel || hov ? 2.5 : l.sectors.length > 1 ? 1 : 1.6;
      g.beginPath(); g.moveTo(this.sx(a[0]), this.sy(a[1])); g.lineTo(this.sx(b[0]), this.sy(b[1])); g.stroke();
      if (ed.mode === 'lines' && (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 > (24 / this.scale) ** 2) {
        /* the Doom tick, on the line's front */
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
        g.beginPath(); g.moveTo(this.sx(mx), this.sy(my)); g.lineTo(this.sx(mx) + nx * 6, this.sy(my) - ny * 6); g.stroke();
      }
    }

    /* THE PROPS: boxes with their height written on them */
    const selP = ed.sel.kind === 'prop' ? ed.sel.ids : null;
    const hovP = this.hover?.kind === 'prop' ? this.hover.id : null;
    g.font = '10px ui-monospace, monospace';
    for (const p of d.props) {
      const x0 = this.sx(Math.min(p.x0, p.x1)), x1 = this.sx(Math.max(p.x0, p.x1));
      const y0 = this.sy(Math.max(p.y0, p.y1)), y1 = this.sy(Math.min(p.y0, p.y1));
      const sel = selP?.has(p.id), hov = p.id === hovP;
      g.fillStyle = sel ? 'rgba(255,157,61,0.3)' : 'rgba(80,190,255,0.14)';
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = sel ? '#ff9d3d' : hov ? '#3ddc84' : '#58b9ff';
      g.lineWidth = sel || hov ? 2 : 1;
      g.setLineDash([4, 3]); g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.setLineDash([]);
      if (x1 - x0 > 40 && y1 - y0 > 14) { g.fillStyle = '#9fd6ff'; g.fillText(`${p.z0}–${p.z1}`, x0 + 3, y0 + 11); }
    }

    /* THE VERTICES, in vertex mode or close enough to click */
    if (ed.mode === 'vertices' || ed.mode === 'draw' || this.scale > 0.2) {
      const selV = ed.sel.kind === 'vertex' ? ed.sel.ids : null;
      const hovV = this.hover?.kind === 'vertex' ? this.hover.id : null;
      const big = ed.mode === 'vertices';
      d.vertices.forEach((v, i) => {
        const x = this.sx(v[0]), y = this.sy(v[1]);
        if (x < -8 || y < -8 || x > this.w + 8 || y > this.h + 8) return;
        const sel = selV?.has(i), hov = i === hovV;
        g.fillStyle = sel ? '#ff9d3d' : hov ? '#3ddc84' : big ? '#d8e0e4' : '#8a969e';
        const s = sel || hov ? 7 : big ? 5 : 3;
        g.fillRect(x - s / 2, y - s / 2, s, s);
      });
    }

    /* THE THINGS: a disc in the type's colour with a tick for facing */
    const selT = ed.sel.kind === 'thing' ? ed.sel.ids : null;
    const hovT = this.hover?.kind === 'thing' ? this.hover.id : null;
    for (const t of d.things) {
      const x = this.sx(t.x), y = this.sy(t.y);
      if (x < -20 || y < -20 || x > this.w + 20 || y > this.h + 20) continue;
      const def = THING_TYPES[t.type] || { color: '#f0f', radius: 16 };
      const r = Math.max(3, def.radius * this.scale);
      const sel = selT?.has(t.id), hov = t.id === hovT;
      g.fillStyle = def.color;
      g.globalAlpha = ed.mode === 'things' || sel ? 1 : 0.7;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      if (sel || hov) { g.strokeStyle = sel ? '#ff9d3d' : '#3ddc84'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r + 3, 0, Math.PI * 2); g.stroke(); }
      if (r > 4 || t.type === 'START') {
        const a = t.angle || 0, L = Math.max(r * 1.6, 9);
        g.strokeStyle = t.type === 'START' ? '#4af' : '#000a'; g.lineWidth = t.type === 'START' ? 2 : 1.5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y - Math.sin(a) * L); g.stroke();
      }
    }

    /* THE 3D CAMERA, the way Doom Builder shows it on the plan */
    const cam = ed.view3d?.cam;
    if (cam && ed.layout !== 'only2d') {
      const x = this.sx(cam.x), y = this.sy(cam.y), a = cam.yaw, f = 0.6, L = 26;
      g.fillStyle = 'rgba(255,220,90,0.15)'; g.strokeStyle = '#ffd35a'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + Math.cos(a + f) * L, y - Math.sin(a + f) * L);
      g.lineTo(x + Math.cos(a - f) * L, y - Math.sin(a - f) * L);
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ffd35a'; g.fillRect(x - 3, y - 3, 6, 6);
    }

    /* WHAT IS BEING DRAWN */
    const dr = this.drag;
    g.lineWidth = 1.5;
    if (dr?.type === 'box') {
      g.strokeStyle = '#3ddc84'; g.setLineDash([5, 4]); g.fillStyle = 'rgba(61,220,132,0.07)';
      const x = this.sx(Math.min(dr.a[0], dr.b[0])), y = this.sy(Math.max(dr.a[1], dr.b[1]));
      const w = Math.abs(dr.b[0] - dr.a[0]) * this.scale, hh = Math.abs(dr.b[1] - dr.a[1]) * this.scale;
      g.fillRect(x, y, w, hh); g.strokeRect(x, y, w, hh); g.setLineDash([]);
    }
    if (dr?.type === 'rect' || dr?.type === 'prop') {
      g.strokeStyle = dr.type === 'prop' ? '#58b9ff' : '#ffb454'; g.fillStyle = dr.type === 'prop' ? 'rgba(88,185,255,0.12)' : 'rgba(255,180,84,0.12)';
      const x = this.sx(Math.min(dr.a[0], dr.b[0])), y = this.sy(Math.max(dr.a[1], dr.b[1]));
      const w = Math.abs(dr.b[0] - dr.a[0]) * this.scale, hh = Math.abs(dr.b[1] - dr.a[1]) * this.scale;
      g.fillRect(x, y, w, hh); g.strokeRect(x, y, w, hh);
      g.fillStyle = '#ffd9a6'; g.font = '11px ui-monospace, monospace';
      g.fillText(`${Math.abs(dr.b[0] - dr.a[0])} × ${Math.abs(dr.b[1] - dr.a[1])}`, x + 4, y - 4);
    }
    if (ed.mode === 'draw' && (this.path.length || this.cursor)) {
      const pts = [...this.path];
      if (this.cursor && this.mouse) pts.push(this.cursor);
      g.strokeStyle = '#ffb454'; g.lineWidth = 2;
      g.beginPath();
      pts.forEach(([x, y], k) => (k ? g.lineTo(this.sx(x), this.sy(y)) : g.moveTo(this.sx(x), this.sy(y))));
      g.stroke();
      g.fillStyle = '#ffb454';
      for (const [x, y] of pts) g.fillRect(this.sx(x) - 3, this.sy(y) - 3, 6, 6);
      if (this.path.length >= 3) { g.strokeStyle = '#3ddc84'; g.beginPath(); g.arc(this.sx(this.path[0][0]), this.sy(this.path[0][1]), PICK_PX + 2, 0, Math.PI * 2); g.stroke(); }
      if (this.path.length && this.cursor) {
        const [a, b] = [this.path[this.path.length - 1], this.cursor];
        g.fillStyle = '#ffd9a6'; g.font = '11px ui-monospace, monospace';
        g.fillText(`${Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]))}`, this.sx((a[0] + b[0]) / 2) + 6, this.sy((a[1] + b[1]) / 2) - 6);
      }
    }
    /* and the snapped cursor, in the drawing modes */
    if (this.cursor && this.mouse && ['draw', 'rect', 'props', 'things'].includes(ed.mode) && !dr) {
      const x = this.sx(this.cursor[0]), y = this.sy(this.cursor[1]);
      g.strokeStyle = '#ffb454'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y + 8); g.stroke();
    }
  }

  drawGrid() {
    const g = this.g, ed = this.ed;
    let step = ed.grid;
    while (step * this.scale < 7) step *= 2;
    const x0 = this.mx(0), x1 = this.mx(this.w), y0 = this.my(this.h), y1 = this.my(0);
    const major = step * 8;
    const lineSet = (st, colour) => {
      g.strokeStyle = colour; g.lineWidth = 1;
      g.beginPath();
      for (let x = Math.floor(x0 / st) * st; x <= x1; x += st) { const px = Math.round(this.sx(x)) + 0.5; g.moveTo(px, 0); g.lineTo(px, this.h); }
      for (let y = Math.floor(y0 / st) * st; y <= y1; y += st) { const py = Math.round(this.sy(y)) + 0.5; g.moveTo(0, py); g.lineTo(this.w, py); }
      g.stroke();
    };
    lineSet(step, '#10161b');
    lineSet(major, '#18222a');
    /* the origin */
    g.strokeStyle = '#2a3a44';
    g.beginPath();
    g.moveTo(Math.round(this.sx(0)) + 0.5, 0); g.lineTo(Math.round(this.sx(0)) + 0.5, this.h);
    g.moveTo(0, Math.round(this.sy(0)) + 0.5); g.lineTo(this.w, Math.round(this.sy(0)) + 0.5);
    g.stroke();
  }
}

export function modeKind(mode) {
  return { vertices: 'vertex', lines: 'line', sectors: 'sector', things: 'thing', props: 'prop' }[mode] || 'sector';
}
