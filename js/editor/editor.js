/* =====================================================================
   GSS-EDIT — the map editor
   =====================================================================

   At the user's request: an editor for this game in the mould of SLADE
   and Ultimate Doom Builder, opened from the front-door terminal by
   typing EDIT or GSS-EDIT.EXE. It is the Doom mapping workflow — draw
   sectors on a grid, drag vertices, flip between the plan and the 3D
   view, raise a floor with the mouse wheel, test the map in one key —
   on an engine that is actually 3D, so it edits the things Doom never
   had as well: rooms stacked over rooms, sloped floors and ceilings,
   and free boxes standing anywhere in space.

     js/editor/doc.js     the map as JSON, the undo stack, and the
                          compiler that turns it into a Level
     js/editor/view2d.js  the plan: the Doom Builder half
     js/editor/view3d.js  the 3D view, drawn by the game's own renderer
     js/editor/ui.js      the bars, the inspector, the texture browser
     js/editor/editor.js  this: the state all of them share, and the
                          keyboard

   WHAT THE EDITOR SHARES WITH THE GAME IS EVERYTHING THAT DRAWS. The 3D
   view is js/mapgeo.js building the level the compiler made, with the
   game's own textures, its own world shader and its own baked sky — so
   what you see while you edit is what you get when you play, and there
   is no second renderer to drift from the first.

   AND WHAT IT HANDS THE GAME IS THE SAME DOCUMENT. Play stores the map
   and reloads into the game with `?play`; js/main.js compiles it with
   the same compiler and runs it instead of the grid. F2 in the game
   comes back here with `?edit`.
   ===================================================================== */

import * as THREE from 'three';
import { bakeTextures, TEXTURE_NAMES } from '../textures.js';
import { setArtPalette, buildLutAtlas } from '../palette.js';
import { world } from '../material.js';
import { SkyBaker } from '../skyart.js';
import { Weather } from '../weather.js';
import {
  History, compileDoc, gridDoc, newDoc, parseDoc, serialise, compact,
  THING_TYPES, SECTOR_DEFAULTS, takeId, ringOf, pointInPoly, signedArea, linesOf, lineKey,
  segDist, strictlyInside, selfCrosses, segCross,
} from './doc.js';
import { View2D } from './view2d.js';
import { View3D } from './view3d.js';
import { buildUI } from './ui.js';
import { scatterFrom } from './scatter.js';
import { registerTextures } from './texcompose.js';
import { PACK_NAMES, loadPack, packNamesIn, PackAnimator } from '../texpack.js';

/* where the editor keeps its work in the browser */
export const AUTOSAVE_KEY = 'gss-edit:autosave';
export const PLAY_KEY = 'gss-edit:play';

/* the grid ladder: Doom Builder's own, powers of two */
export const GRIDS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];

export const MODES = {
  vertices: { key: 'V', name: 'Vertices' },
  lines:    { key: 'L', name: 'Lines' },
  sectors:  { key: 'S', name: 'Sectors' },
  things:   { key: 'T', name: 'Things' },
  props:    { key: 'P', name: 'Props' },
  draw:     { key: 'D', name: 'Draw sectors' },
  rect:     { key: 'R', name: 'Draw rectangle' },
  scatter:  { key: 'X', name: 'Scatter' },
};

/* what each mode selects */
export const MODE_KIND = { vertices: 'vertex', lines: 'line', sectors: 'sector', things: 'thing', props: 'prop', scatter: 'scatter' };

export class Editor {
  constructor(root) {
    this.root = root;
    this.listeners = new Map();
    this.mode = 'sectors';
    this.grid = 64;
    this.snap = true;
    this.thingType = 'SHOPPER';
    /* the plant a PLANT thing is placed as, and the mix the scatter
       brush paints with */
    this.plantKind = 'fir_tall_1';
    this.scatterPreset = 'crowd';
    /* THE SECTOR BEING DRAWN, shared: corners clicked in the plan and in
       the 3D view go into the same outline, so one room can be drawn
       half in each */
    this.path = [];
    /* and where the mouse is on the map, from whichever view it is in */
    this.cursor = null;
    this.propTex = 'GRIDWALL';
    /* THE SELECTION is one kind of thing at a time, the way a Doom
       editor's modes are: vertices by index, lines by their key, the
       rest by id. */
    this.sel = { kind: null, ids: new Set() };
    this.hover = null;
    /* and in the 3D view, a SURFACE: which sector and which part of it */
    this.surf = null;
    this.compiled = null;
    this._compileT = 0;
    this._saveT = 0;
    /* ONE WORKSPACE, both views at once: the 3D view filling it and the
       plan inset in its corner, every mode working in both — see the
       combined layout in css/editor.css. Tab swaps which is big. */
    this.layout = 'combined';
    this.status = '';
  }

  /* ------------------------------------------------------------------
     events
     ------------------------------------------------------------------ */
  on(evt, fn) { (this.listeners.get(evt) || this.listeners.set(evt, []).get(evt)).push(fn); return this; }
  /* one listener's mistake must not stop the others hearing — a broken
     panel once stopped the 3D view rebuilding */
  emit(evt, ...a) {
    for (const fn of this.listeners.get(evt) || []) {
      try { fn(...a); } catch (e) { console.error(`the ${evt} listener failed:`, e); }
    }
  }

  get doc() { return this.history.doc; }

  /** Say something on the status line. */
  say(msg) { this.status = msg; this.emit('status', msg); }

  /* ------------------------------------------------------------------
     THE ONE WAY THE DOCUMENT CHANGES. Every edit is `edit(label, fn)`:
     a snapshot for undo, the change, a tidy (welding what was dragged
     together, dropping what was orphaned), and the recompile — so
     nothing anywhere in the editor mutates the map without the undo
     stack knowing.
     ------------------------------------------------------------------ */
  edit(label, fn, { tidy = true, group = false } = {}) {
    /* A RUN OF WHEEL NOTCHES IS ONE UNDO: the same nudge again within a
       moment of the last does not push another step */
    const now = performance.now();
    const same = group && this._lastEdit && this._lastEdit.label === group && now - this._lastEdit.t < 1200;
    if (!same) this.history.push(label);
    this._lastEdit = group ? { label: group, t: now } : null;
    fn(this.doc);
    if (tidy) {
      /* the weld renumbers vertices, so a vertex or line selection would
         point at the wrong ones — it is let go instead */
      const before = this.doc.vertices.length;
      compact(this.doc);
      if (this.doc.vertices.length !== before && (this.sel.kind === 'vertex' || this.sel.kind === 'line')) this.clearSel();
    }
    this.changed();
  }

  /** The document moved: tell everybody, and recompile a moment later
   *  rather than on every mouse move of a drag. */
  changed({ now = false } = {}) {
    this._lines = null;
    this.emit('doc');
    /* the map's own textures, drawn again if they changed */
    const tk = textureKey(this.doc);
    if (tk !== this._texKey) { this._texKey = tk; this.refreshTextures(); }
    clearTimeout(this._compileT);
    if (now) this.compile();
    else this._compileT = setTimeout(() => this.compile(), 120);
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.autosave(), 800);
  }

  /** Every line in the map with the sectors on it, worked out once per
   *  change — both views ask for it on every mouse move. */
  lines() {
    if (!this._lines || this._linesDoc !== this.doc) { this._lines = linesOf(this.doc); this._linesDoc = this.doc; }
    return this._lines;
  }

  /** Draw the map's own textures into the bank, and say which names
   *  there are now. The compile after it builds with them. */
  async refreshTextures() {
    const mine = (this.doc.textures || []).map(t => t.name);
    if (!this.bank) return;
    try { await registerTextures(this.bank, this.doc.textures || [], this.builtInTextures); }
    catch (e) { console.warn(e); this.say(`a map texture did not draw: ${e.message}`); }
    this.mapTextureNames = mine.filter(n => this.bank.map.has(n) && !this.builtInTextures.has(n));
    this.textureNames = [...this.mapTextureNames, ...(this.gameTextureNames || []), ...(this.packTextureNames || [])];
    this.emit('textures');
    this.compile();
  }

  compile() {
    try {
      this.compiled = compileDoc(this.doc);
    } catch (e) {
      console.error(e);
      this.compiled = { level: null, problems: [{ kind: 'map', msg: `the map did not compile: ${e.message}` }], index: [] };
    }
    this.emit('compiled', this.compiled);
  }

  autosave() {
    try { localStorage.setItem(AUTOSAVE_KEY, serialise(this.doc)); } catch (e) { /* private mode: no autosave */ }
  }

  /** A whole new document, as one undoable step. */
  replace(doc, label = 'open') {
    this.history.push(label);
    this.history.doc = doc;
    this.clearSel();
    this.changed({ now: true });
    this.emit('frame');
  }

  undo() { const l = this.history.undo(); if (l) { this.clearSel(); this.changed({ now: true }); this.say(`undid ${l}`); } }
  redo() { const l = this.history.redo(); if (l) { this.clearSel(); this.changed({ now: true }); this.say(`redid ${l}`); } }

  /* ------------------------------------------------------------------
     SELECTION
     ------------------------------------------------------------------ */
  select(kind, ids, add = false) {
    if (!add || this.sel.kind !== kind) this.sel = { kind, ids: new Set() };
    for (const id of ids) {
      if (add && this.sel.ids.has(id)) this.sel.ids.delete(id); else this.sel.ids.add(id);
    }
    if (!this.sel.ids.size) this.sel.kind = null;
    if (kind !== 'surface') this.surf = null;
    this.emit('sel');
  }
  clearSel() { this.sel = { kind: null, ids: new Set() }; this.surf = null; this.emit('sel'); }
  isSel(kind, id) { return this.sel.kind === kind && this.sel.ids.has(id); }

  /** The 3D view's selection: a sector's floor or ceiling, or a wall. */
  selectSurface(s) {
    this.surf = s;
    if (s) this.sel = { kind: s.part === 'wall' ? 'line' : 'sector', ids: new Set([s.part === 'wall' ? s.line : this.doc.sectors[s.sector]?.id]) };
    else this.sel = { kind: null, ids: new Set() };
    this.emit('sel');
  }

  setMode(m) {
    if (!MODES[m]) return;
    if (m === 'draw' && this.mode !== 'draw') this.modeBeforeDraw = this.mode;
    this.mode = m;
    /* a selection only survives a mode that can show it */
    const keep = MODE_KIND[m];
    if (m !== 'draw') this.cancelPath();
    if (keep && this.sel.kind && this.sel.kind !== keep) this.clearSel();
    this.emit('mode', m);
    this.say(`${MODES[m].name} mode`);
  }

  setGrid(g) {
    this.grid = Math.max(GRIDS[0], Math.min(GRIDS[GRIDS.length - 1], g));
    this.emit('grid');
    this.say(`grid ${this.grid}`);
  }
  gridStep(dir) {
    const i = GRIDS.indexOf(this.grid);
    this.setGrid(GRIDS[Math.max(0, Math.min(GRIDS.length - 1, (i < 0 ? 6 : i) + dir))]);
  }
  snapV(v) { return this.snap ? Math.round(v / this.grid) * this.grid : Math.round(v); }

  setLayout(l) { this.layout = l; this.emit('layout', l); }

  /* ------------------------------------------------------------------
     THE EDITS a person makes most, kept here so the 2D view, the 3D
     view and the keyboard all make them the same way
     ------------------------------------------------------------------ */

  /** Delete whatever is selected. */
  deleteSel() {
    const { kind, ids } = this.sel;
    if (!kind || !ids.size) return;
    const n = ids.size;
    this.edit(`delete ${n} ${kind}${n > 1 ? 's' : ''}`, d => {
      if (kind === 'sector') d.sectors = d.sectors.filter(s => !ids.has(s.id));
      if (kind === 'thing') d.things = d.things.filter(t => !ids.has(t.id));
      if (kind === 'prop') d.props = d.props.filter(p => !ids.has(p.id));
      if (kind === 'scatter') d.scatters = d.scatters.filter(p => !ids.has(p.id));
      if (kind === 'vertex') {
        /* a vertex comes out of every sector it is in; a sector left with
           fewer than three corners goes with it (compact) */
        for (const s of d.sectors) s.verts = s.verts.filter(v => !ids.has(v));
      }
      if (kind === 'line') {
        /* deleting a line MERGES the two sectors on it, the way it does
           in a Doom editor — or removes the one sector a one-sided line
           belongs to */
        for (const key of ids) mergeAcross(d, key);
      }
    });
    this.clearSel();
  }

  /** Move the selection by (dx, dy), as one edit. */
  moveSel(dx, dy, label = 'move') {
    const { kind, ids } = this.sel;
    if (!kind || (!dx && !dy)) return;
    this.edit(label, d => moveThings(d, kind, ids, dx, dy));
  }

  /** Put a thing of the current type at (x, y). */
  addThing(x, y) {
    const type = this.thingType;
    this.edit(`add ${type}`, d => {
      if (THING_TYPES[type]?.one) d.things = d.things.filter(t => t.type !== type);
      const t = { id: takeId(d), type, x: this.snapV(x), y: this.snapV(y), angle: Math.PI / 2 };
      if (type === 'PLANT') t.kind = this.plantKind;
      d.things.push(t);
    });
    const t = this.doc.things[this.doc.things.length - 1];
    this.select('thing', [t.id]);
  }

  /** A box in space, from one corner to the other on the plan. */
  addProp(x0, y0, x1, y1) {
    if (Math.abs(x1 - x0) < 1 || Math.abs(y1 - y0) < 1) return;
    const under = this.sectorAt((x0 + x1) / 2, (y0 + y1) / 2);
    const z0 = under ? under.floor : 0;
    this.edit('add prop', d => {
      d.props.push({ id: takeId(d), x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1),
                     z0, z1: z0 + 64, tex: this.propTex });
    });
    const p = this.doc.props[this.doc.props.length - 1];
    this.select('prop', [p.id]);
  }

  /** The smallest document sector under a point, or null. */
  sectorAt(x, y) {
    let best = null, ba = Infinity;
    for (const s of this.doc.sectors) {
      const r = ringOf(this.doc, s);
      if (r.length < 3 || !pointInPoly(r, x, y)) continue;
      const a = Math.abs(signedArea(r));
      if (a < ba) { ba = a; best = s; }
    }
    return best;
  }

  /**
   * A NEW SECTOR from a list of points, the way Doom Builder's draw mode
   * makes one. Each point that lands on an existing vertex USES it; each
   * that lands on an existing line SPLITS it and uses the new vertex, in
   * every sector that line belongs to — which is what joins a room drawn
   * against a wall to the room on the other side of it. A new sector
   * drawn inside another one takes that one's heights and textures, so a
   * platform drawn in a room is a piece of the room until it is raised.
   */
  addSector(points, label = 'draw sector') {
    if (points.length < 3) return null;
    /* DRAWN ACROSS EXISTING LINES: split where they cross, as Doom Builder
       does, rather than laid over the top */
    if (crossesLines(this.doc, points)) return this.addSectorAcross(points, label);
    let made = null;
    this.edit(label, d => {
      const idx = points.map(([x, y]) => vertexFor(d, x, y));
      /* drop repeats a slow double-click leaves */
      let ring = idx.filter((v, k, a) => v !== a[(k + 1) % a.length]);
      if (ring.length < 3) return;
      /* EVERY SECTOR WINDS ONE WAY, anticlockwise, whichever way it was
         clicked — merging two across a shared line depends on it */
      if (signedArea(ring.map(i => d.vertices[i])) < 0) ring = ring.reverse();
      const pts = ring.map(i => d.vertices[i]);
      const [cx, cy] = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
      const parent = sectorContaining(d, cx, cy);
      /* a deep copy: the parent's colours are its own, not shared */
      const base = parent ? JSON.parse(JSON.stringify({ ...parent, id: undefined, verts: undefined, name: '', storeys: undefined }))
        : { ...SECTOR_DEFAULTS };
      made = { ...base, id: takeId(d), verts: ring };
      /* DRAWN AGAINST THE PARENT'S OWN WALL, it is cut out of the parent
         rather than laid over it — a room drawn in a corner of the field
         takes that corner away from the field, as it does in Doom
         Builder. Drawn clear of every wall, it is a hole, and the
         compiler deals with holes. */
      if (parent && !strictlyInside(pts, ringOf(d, parent))) cutFrom(d, parent, ring);
      d.sectors.push(made);
    });
    if (made) this.select('sector', [made.id]);
    return made;
  }

  /**
   * A SECTOR DRAWN ACROSS WALLS. The outline is cut where it crosses every
   * existing line (splitting that line too), and every room it passes
   * through is split along the part of the outline inside it — so each
   * piece of the new shape is a sector of its own, carrying the heights
   * and textures of the room it was cut from. What of the shape lies
   * outside every sector is not made, and it says so.
   */
  addSectorAcross(points, label) {
    const made = [];
    let outside = false;
    this.edit(label, d => {
      /* 1. the outline, with a corner wherever it crosses a line */
      const pts = [];
      const L = linesOf(d);
      for (let k = 0; k < points.length; k++) {
        const p = points[k], q = points[(k + 1) % points.length];
        pts.push(p);
        const hits = [];
        for (const l of L) {
          const a = d.vertices[l.a], b = d.vertices[l.b];
          if (!segCross(p[0], p[1], q[0], q[1], a[0], a[1], b[0], b[1])) continue;
          const dx = q[0] - p[0], dy = q[1] - p[1], ex = b[0] - a[0], ey = b[1] - a[1];
          const den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
          hits.push([t, +(p[0] + dx * t).toFixed(3), +(p[1] + dy * t).toFixed(3)]);
        }
        hits.sort((x, y) => x[0] - y[0]);
        for (const [, x, y] of hits) pts.push([x, y]);
      }
      /* 2. every corner a vertex, splitting what it lands on */
      let ring = pts.map(([x, y]) => vertexFor(d, x, y));
      ring = ring.filter((v, k, a) => v !== a[(k + 1) % a.length]);
      if (ring.length < 3) return;
      if (signedArea(ring.map(i => d.vertices[i])) < 0) ring = ring.reverse();
      /* 3. the runs of the outline that lie inside one sector, from its
         edge to its edge: each one splits that sector */
      const inSector = (i, j) => {
        const a = d.vertices[i], b = d.vertices[j];
        const s = sectorContaining(d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        if (!s) return null;
        /* on the sector's edge is not inside it */
        const r = s.verts;
        for (let k = 0; k < r.length; k++) {
          if ((r[k] === i && r[(k + 1) % r.length] === j) || (r[k] === j && r[(k + 1) % r.length] === i)) return 'edge';
        }
        return s;
      };
      const n = ring.length;
      const owner = ring.map((v, k) => inSector(v, ring[(k + 1) % n]));
      const onEdgeOf = (s, v) => s.verts.includes(v);
      /* start at an edge whose owner differs from the one before it */
      let k0 = owner.findIndex((o, k) => o !== owner[(k - 1 + n) % n]);
      if (k0 < 0) k0 = 0;
      const runs = [];
      for (let c = 0, k = k0; c < n;) {
        const s = owner[k];
        const run = [ring[k]];
        let m = k;
        do { run.push(ring[(m + 1) % n]); m = (m + 1) % n; c++; } while (c < n && owner[m] === s && !(s && s !== 'edge' && onEdgeOf(s, ring[m])));
        if (s && s !== 'edge') runs.push({ id: s.id, path: run }); else if (!s) outside = true;
        k = m;
      }
      for (const { id, path } of runs) {
        const S = d.sectors.find(x => x.id === id);
        if (!S) continue;
        const u = path[0], w = path[path.length - 1];
        if (onEdgeOf(S, u) && onEdgeOf(S, w)) { splitSector(d, S, path); continue; }
        /* the run starts and ends on the wall of a room INSIDE S — a hole
           in it — so the piece is the run and the stretch of that room's
           wall between its ends: the smaller of the two ways round */
        const H = d.sectors.find(x => x !== S && x.verts.includes(u) && x.verts.includes(w));
        if (!H) continue;
        const r = H.verts, i = r.indexOf(u), j = r.indexOf(w);
        const arc = (from, to, dir) => { const out = []; for (let k = from; ; k = (k + dir + r.length) % r.length) { out.push(r[k]); if (k === to) break; } return out; };
        const cands = [1, -1].map(dir => [...path, ...arc(j, i, dir).slice(1, -1)]);
        const area = vs => Math.abs(signedArea(vs.map(v => d.vertices[v])));
        const ring2 = cands.filter(c => c.length >= 3 && !selfCrosses(c.map(v => d.vertices[v]))).sort((a, b) => area(a) - area(b))[0];
        if (!ring2) continue;
        d.sectors.push({ ...JSON.parse(JSON.stringify({ ...S, verts: undefined, id: undefined, name: '' })), id: takeId(d), verts: ring2 });
      }
      /* 4. the pieces inside the drawn shape are the new sectors */
      const shape = ring.map(i => d.vertices[i]);
      for (const s of d.sectors) {
        const r = ringOf(d, s);
        const [cx, cy] = r.reduce((acc, p) => [acc[0] + p[0] / r.length, acc[1] + p[1] / r.length], [0, 0]);
        if (pointInPoly(shape, cx, cy) && r.every(([x, y]) => pointInPoly(shape, x, y) || segDistRing(shape, x, y) < 1)) made.push(s.id);
      }
    });
    if (made.length) this.select('sector', made);
    this.say(`${made.length} sector${made.length === 1 ? '' : 's'} drawn across the walls${outside ? ' — the part outside the map was not made; draw it on its own' : ''}`);
    return made.length ? this.doc.sectors.find(s => s.id === made[0]) : null;
  }

  /** Raise or lower the floor or ceiling of the selected sectors (or
   *  the surface picked in 3D) by `dz` — the wheel in visual mode. */
  nudgeHeight(part, dz, ids = null) {
    const which = ids || (this.sel.kind === 'sector' ? this.sel.ids : new Set());
    if (!which.size) return;
    this.edit(`${part} ${dz > 0 ? '+' : ''}${dz}`, d => {
      for (const s of d.sectors) {
        if (!which.has(s.id)) continue;
        if (part === 'floor') s.floor = (s.floor ?? 0) + dz;
        else s.ceil = (s.ceil ?? 256) + dz;
      }
    }, { tidy: false, group: `height ${part} ${[...which].join(',')}` });
  }

  /** BRIGHTNESS, Doom's 0 to 255 — Ctrl and the wheel in UDB, over a
   *  sector on the plan or in 3D. The game's light is that over 255. */
  nudgeLight(delta, ids = null) {
    const which = ids || (this.sel.kind === 'sector' ? this.sel.ids : new Set());
    if (!which.size) return;
    /* at the end of the range there is nothing to do, and nothing to
       put on the undo stack */
    const moves = this.doc.sectors.some(s => which.has(s.id) && Math.max(0, Math.min(255, brightOf(s) + delta)) !== brightOf(s));
    if (!moves) { this.say(`brightness ${delta > 0 ? 255 : 0} is as far as it goes`); return; }
    let now = 0;
    this.edit(`brightness ${delta > 0 ? '+' : ''}${delta}`, d => {
      for (const s of d.sectors) {
        if (!which.has(s.id)) continue;
        const b = Math.max(0, Math.min(255, brightOf(s) + delta));
        s.light = +(b / 255).toFixed(4);
        now = b;
      }
    }, { tidy: false, group: `light ${[...which].join(',')}` });
    this.say(`brightness ${now}`);
  }

  /** INSIDE OR OUTSIDE. Outside is under the sky with no ceiling; inside
   *  is a room with a roof, and where it meets the outside the compiler
   *  stands a wall (see 5c in js/editor/doc.js) — unless the line is a
   *  doorway. */
  setInside(inside, ids = null) {
    const which = ids || (this.sel.kind === 'sector' ? this.sel.ids : new Set());
    if (!which.size) return;
    this.edit(inside ? 'inside' : 'outside', d => {
      for (const s of d.sectors) {
        if (!which.has(s.id)) continue;
        if (inside) {
          if (s.ceilTex === 'SKY' || !s.ceilTex) s.ceilTex = s.roofTex && s.roofTex !== 'SKY' ? s.roofTex : 'GRIDBOX';
          /* a room gets a room's height, not the sky's */
          if ((s.ceil ?? 1024) - (s.floor ?? 0) > 512) s.ceil = (s.floor ?? 0) + 128;
          s.outdoor = false;
        } else {
          s.ceilTex = 'SKY';
          s.outdoor = true;
          if ((s.ceil ?? 0) < (s.floor ?? 0) + 128) s.ceil = (s.floor ?? 0) + 128;
        }
      }
    }, { tidy: false });
    this.say(inside ? 'inside: roofed, walled where it meets the outside' : 'outside: open to the sky');
  }

  /** INSERT, as in Doom Builder: a thing in things mode, a vertex (in
   *  whatever line it lands on) in vertex mode — at the cursor. */
  insertAtCursor() {
    const c = this.cursor;
    if (!c) return;
    if (this.mode === 'vertices') {
      this.edit('insert vertex', d => { vertexFor(d, c[0], c[1]); });
      this.say(`vertex at ${c[0]}, ${c[1]}`);
    } else if (this.mode === 'draw') {
      this.addPathPoint(c);
    } else {
      this.addThing(c[0], c[1]);
    }
  }

  /* ------------------------------------------------------------------
     COPY AND PASTE, Doom Builder's: the selection to a clipboard of its
     own, and back at the cursor, offset from where it was grabbed
     ------------------------------------------------------------------ */
  copySel() {
    const d = this.doc, { kind, ids } = this.sel;
    if (!kind || !ids.size) { this.say('nothing selected to copy'); return false; }
    const clip = { kind, items: [] };
    if (kind === 'thing') clip.items = d.things.filter(t => ids.has(t.id)).map(t => ({ ...t }));
    else if (kind === 'prop') clip.items = d.props.filter(p => ids.has(p.id)).map(p => ({ ...p }));
    else if (kind === 'scatter') clip.items = d.scatters.filter(c => ids.has(c.id)).map(c => JSON.parse(JSON.stringify(c)));
    else if (kind === 'sector') clip.items = d.sectors.filter(s => ids.has(s.id)).map(s => ({ props: JSON.parse(JSON.stringify({ ...s, verts: undefined, id: undefined })), ring: ringOf(d, s).map(p => [...p]) }));
    else { this.say(`${kind}s cannot be copied — copy the sectors or things`); return false; }
    const pts = kind === 'sector' ? clip.items.flatMap(i => i.ring) : kind === 'prop' ? clip.items.map(p => [p.x0, p.y0])
      : kind === 'scatter' ? clip.items.map(c => [c.area.x ?? c.area.x0 ?? 0, c.area.y ?? c.area.y0 ?? 0]) : clip.items.map(t => [t.x, t.y]);
    clip.anchor = [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1]))];
    this.clipboard = clip;
    this.say(`copied ${clip.items.length} ${kind}${clip.items.length > 1 ? 's' : ''}`);
    return true;
  }
  paste() {
    const clip = this.clipboard, c = this.cursor;
    if (!clip) { this.say('the clipboard is empty'); return; }
    if (!c) { this.say('point at where to paste'); return; }
    const dx = this.snapV(c[0] - clip.anchor[0]), dy = this.snapV(c[1] - clip.anchor[1]);
    const made = [];
    if (clip.kind === 'sector') {
      this.history.push(`paste ${clip.items.length} sectors`);
      for (const it of clip.items) {
        const d = this.doc;
        const ring = it.ring.map(([x, y]) => vertexFor(d, x + dx, y + dy));
        const s = { ...JSON.parse(JSON.stringify(it.props)), id: takeId(d), verts: ring.filter((v, k, a) => v !== a[(k + 1) % a.length]) };
        if (s.verts.length >= 3) { d.sectors.push(s); made.push(s.id); }
      }
      compact(this.doc);
      this.changed({ now: true });
    } else {
      this.edit(`paste ${clip.items.length} ${clip.kind}s`, d => {
        for (const it of clip.items) {
          const o = JSON.parse(JSON.stringify(it));
          o.id = takeId(d);
          if (clip.kind === 'thing') { o.x += dx; o.y += dy; d.things.push(o); }
          if (clip.kind === 'prop') { o.x0 += dx; o.x1 += dx; o.y0 += dy; o.y1 += dy; d.props.push(o); }
          if (clip.kind === 'scatter') {
            const a = o.area;
            if (a.kind === 'circle') { a.x += dx; a.y += dy; }
            else if (a.kind === 'rect') { a.x0 += dx; a.x1 += dx; a.y0 += dy; a.y1 += dy; }
            d.scatters.push(o);
          }
          made.push(o.id);
        }
      }, { tidy: false });
    }
    this.select(clip.kind, made);
    this.say(`pasted ${made.length}`);
  }

  /** WHAT IS UNDER THE MOUSE, for the info bar and for the keys that act
   *  on the highlight when nothing is selected (Delete, Ctrl+wheel). Set
   *  by whichever view the mouse is in: { kind, id }. */
  setHover(h) {
    const k = h ? `${h.kind}:${h.id}` : '';
    if (k === this._hoverKey) return;
    this._hoverKey = k;
    this.hovered = h;
    this.emit('hover', h);
  }
  /** The selection if there is one, or the highlighted thing. */
  targetOr(kind) {
    if (this.sel.kind === kind && this.sel.ids.size) return this.sel.ids;
    if (this.hovered?.kind === kind) return new Set([this.hovered.id]);
    return new Set();
  }

  /** A texture onto whatever is selected: the surface picked in 3D if
   *  there is one, or the field the inspector is picking for. */
  applyTexture(name, field = null) {
    const { kind, ids } = this.sel;
    if (this.surf) {
      const s = this.surf;
      if (s.part === 'wall') {
        /* the part of the wall that was clicked: the middle of a
           one-sided wall, or the upper or lower step of a two-sided one */
        /* ON THE SIDE THAT WAS CLICKED, Doom's front or back sidedef: the
           face looking into the sector the camera is in — so painting
           the outside of a wall leaves the inside as it was */
        const field = s.band === 'upper' ? 'upperTex' : s.band === 'lower' ? 'lowerTex' : 'midTex';
        const faceId = this.doc.sectors[s.sector]?.id;
        this.edit(`texture ${name}`, d => {
          const o = d.lines[s.line] = d.lines[s.line] || {};
          o.sides = o.sides || {};
          o.sides[faceId] = { ...(o.sides[faceId] || {}), [field]: name };
        }, { tidy: false });
      } else {
        this.edit(`texture ${name}`, d => {
          const sec = d.sectors[s.sector];
          if (sec) sec[s.part === 'floor' ? 'floorTex' : 'ceilTex'] = name;
        }, { tidy: false });
      }
      return;
    }
    if (kind === 'sector' && field) {
      this.edit(`${field} ${name}`, d => { for (const s of d.sectors) if (ids.has(s.id)) s[field] = name; }, { tidy: false });
    } else if (kind === 'prop') {
      this.edit(`prop texture ${name}`, d => { for (const p of d.props) if (ids.has(p.id)) p[field || 'tex'] = name; }, { tidy: false });
    } else if (kind === 'line') {
      this.edit(`line texture ${name}`, d => { for (const k of ids) d.lines[k] = { ...(d.lines[k] || {}), wallTex: name }; }, { tidy: false });
    } else {
      this.propTex = name;
      this.say(`${name} is the texture for new props`);
    }
  }

  /* ------------------------------------------------------------------
     THE OUTLINE BEING DRAWN, from either view
     ------------------------------------------------------------------ */
  addPathPoint(pt) {
    const p = this.path, first = p[0], last = p[p.length - 1];
    if (first && p.length >= 3 && first[0] === pt[0] && first[1] === pt[1]) { this.closePath(); return; }
    if (last && last[0] === pt[0] && last[1] === pt[1]) return;
    p.push([pt[0], pt[1]]);
    this.emit('path');
  }
  /** FINISH THE DRAWING. Closed by clicking the first corner again, it is
   *  a sector. Finished open (Enter, or the right button) with both ends
   *  on the edge of one sector, it is a line across that sector that
   *  SPLITS it in two, as it does in Doom Builder. */
  closePath({ open = false } = {}) {
    const p = this.path;
    this.path = [];
    if (open && p.length >= 2 && this.splitByPath(p)) { /* done */ }
    else if (p.length >= 3) this.addSector(p);
    else if (p.length) this.say('a sector needs three corners — or draw from one wall to another to split a room');
    this.emit('path');
    this.afterDraw();
  }
  /** Back to the mode the drawing started from, as Doom Builder does. */
  afterDraw() {
    if (this.mode === 'draw' && this.modeBeforeDraw && this.modeBeforeDraw !== 'draw') this.setMode(this.modeBeforeDraw);
  }
  splitByPath(pts) {
    const d0 = this.doc;
    const a = pts[0], b = pts[pts.length - 1];
    /* the sector whose edge both ends lie on, and whose inside the rest
       of the path runs through */
    const onEdge = (s, [x, y]) => ringOf(d0, s).some((v, k, r) => segDist(v[0], v[1], r[(k + 1) % r.length][0], r[(k + 1) % r.length][1], x, y).d < 1);
    const mid = pts.length > 2 ? pts[1] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s0 = d0.sectors.find(s => onEdge(s, a) && onEdge(s, b) && pointInPoly(ringOf(d0, s), mid[0], mid[1]));
    if (!s0) return false;
    let made = null;
    this.edit('split sector', d => {
      const path = pts.map(([x, y]) => vertexFor(d, x, y));
      made = splitSector(d, d.sectors.find(s => s.id === s0.id), path);
    });
    if (!made) return false;
    this.select('sector', [made.id]);
    this.say('split the sector in two');
    return true;
  }
  cancelPath() { if (this.path.length) { this.path = []; this.emit('path'); } }
  setCursor(pt) { this.cursor = pt; this.emit('cursor'); }

  /* ------------------------------------------------------------------
     A DRAG, from either view: begun at a reference point (the thing
     grabbed, or the corner of it nearest the mouse, so a room dragged
     on a 64 grid stays on it), moved with the raw map point under the
     mouse, and ended — one undo step for the whole of it, and the weld
     when it is let go.
     ------------------------------------------------------------------ */
  beginMove(ref, at) { return { ref: [...ref], start: [...at], done: [0, 0], pushed: false }; }
  dragMove(dr, at) {
    const tx = this.snapV(dr.ref[0] + at[0] - dr.start[0]) - dr.ref[0];
    const ty = this.snapV(dr.ref[1] + at[1] - dr.start[1]) - dr.ref[1];
    const ddx = tx - dr.done[0], ddy = ty - dr.done[1];
    if (!ddx && !ddy) return;
    if (!dr.pushed) { this.history.push(`move ${this.sel.kind}`); dr.pushed = true; }
    moveThings(this.doc, this.sel.kind, this.sel.ids, ddx, ddy);
    dr.done = [tx, ty];
    this.changed();
  }
  endMove(dr) {
    if (!dr?.pushed) return;
    const before = this.doc.vertices.length;
    compact(this.doc);
    if (this.doc.vertices.length !== before && (this.sel.kind === 'vertex' || this.sel.kind === 'line')) this.clearSel();
    this.changed({ now: true });
    this.say(`moved ${dr.done[0]}, ${dr.done[1]}`);
  }
  /** Where a drag of the current selection grabs it, nearest `at`. */
  grabPoint(at) {
    const d = this.doc, { kind, ids } = this.sel;
    const pts = [];
    if (kind === 'vertex') ids.forEach(i => d.vertices[i] && pts.push(d.vertices[i]));
    if (kind === 'line') ids.forEach(k => k.split(',').forEach(i => d.vertices[+i] && pts.push(d.vertices[+i])));
    if (kind === 'sector') d.sectors.forEach(s => ids.has(s.id) && pts.push(...ringOf(d, s)));
    if (kind === 'thing') d.things.forEach(t => ids.has(t.id) && pts.push([t.x, t.y]));
    if (kind === 'prop') d.props.forEach(p => ids.has(p.id) && pts.push([p.x0, p.y0], [p.x1, p.y1]));
    if (kind === 'scatter') d.scatters.forEach(c => ids.has(c.id) && c.area.kind === 'circle' && pts.push([c.area.x, c.area.y]));
    let best = at, bd = Infinity;
    for (const v of pts) { const q = Math.hypot(v[0] - at[0], v[1] - at[1]); if (q < bd) { bd = q; best = v; } }
    return best;
  }

  /* ------------------------------------------------------------------
     THE SCATTERS
     ------------------------------------------------------------------ */
  /** A new scatter of the current mix over `area`, selected. */
  addScatter(area, preset = this.scatterPreset) {
    let made = null;
    this.edit('scatter', d => {
      made = scatterFrom(preset, area, takeId(d), (Math.random() * 4294967296) >>> 0);
      d.scatters.push(made);
    }, { tidy: false });
    this.select('scatter', [made.id]);
    this.changed({ now: true });
    return made;
  }
  /** Over the selected sectors, filling them. */
  scatterSectors(preset = this.scatterPreset) {
    if (this.sel.kind !== 'sector' || !this.sel.ids.size) { this.say('select sectors to scatter into'); return null; }
    return this.addScatter({ kind: 'sectors', ids: [...this.sel.ids] }, preset);
  }
  /** Roll the selected scatters again. */
  reseed() {
    if (this.sel.kind !== 'scatter') return;
    this.edit('reseed', d => { for (const c of d.scatters) if (this.sel.ids.has(c.id)) c.seed = (Math.random() * 4294967296) >>> 0; }, { tidy: false });
  }
  /** BAKE: the selected scatters' things as ordinary things, placed
   *  for good, and the rules gone — for moving one tree by hand. */
  bake() {
    if (this.sel.kind !== 'scatter' || !this.compiled?.scattered) return;
    this.compile();
    const ids = this.sel.ids;
    const items = this.compiled.scattered.filter(t => ids.has(t.scatter));
    this.edit(`bake ${items.length}`, d => {
      for (const t of items) {
        const o = { id: takeId(d), type: t.type, x: t.x, y: t.y, angle: +t.angle.toFixed(3) };
        if (t.kind) o.kind = t.kind;
        if (t.type !== 'PLANT') o.variant = t.variant;
        if (t.scale && t.scale !== 1) o.scale = t.scale;
        d.things.push(o);
      }
      d.scatters = d.scatters.filter(c => !ids.has(c.id));
    }, { tidy: false });
    this.clearSel();
    this.say(`baked ${items.length} things`);
  }

  /* ------------------------------------------------------------------
     FILES
     ------------------------------------------------------------------ */
  fileNew(grid = false) {
    if (this.history.dirty && !confirm('Start a new map? The current one is autosaved and can be undone back to.')) return;
    this.replace(grid ? gridDoc() : newDoc(), grid ? 'new from grid' : 'new map');
    this.say(grid ? 'new map from THE GRID' : 'new map');
  }

  fileSave() {
    const blob = new Blob([serialise(this.doc)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(this.doc.name || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.gssmap.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.history.markSaved();
    this.say(`saved ${a.download}`);
  }

  fileOpen() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.gssmap,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const d = parseDoc(await f.text());
        this.replace(d, 'open');
        this.history.markSaved();
        this.say(`opened ${f.name}`);
      } catch (e) { this.say(`could not open ${f.name}: ${e.message}`); }
    };
    input.click();
  }

  selectAllInMode() { selectAll(this); }

  /** EXPORT: the map as a Godot 4 scene — see js/editor/godot.js */
  async exportGodot() {
    const { openGodotDialog } = await import('./godot.js');
    openGodotDialog(this);
  }

  /** TEST THE MAP: hand it to the game and go. */
  play() {
    try { localStorage.setItem(PLAY_KEY, serialise(this.doc)); } catch (e) { this.say('cannot store the map to play it'); return; }
    this.autosave();
    location.href = location.pathname + '?play';
  }
}

/* ---------------------------------------------------------------------
   Document helpers the edits above lean on
   --------------------------------------------------------------------- */

/** The vertex at (x, y): an existing one within a unit, one inserted
 *  into a line it lands on, or a new one. */
export function vertexFor(d, x, y) {
  for (let i = 0; i < d.vertices.length; i++) {
    const v = d.vertices[i];
    if (Math.abs(v[0] - x) <= 1 && Math.abs(v[1] - y) <= 1) return i;
  }
  const i = d.vertices.length;
  d.vertices.push([x, y]);
  /* and if it is ON a line, into every sector that line belongs to, so
     both sides of the wall get the new corner */
  for (const s of d.sectors) {
    for (let k = 0; k < s.verts.length; k++) {
      const a = d.vertices[s.verts[k]], b = d.vertices[s.verts[(k + 1) % s.verts.length]];
      const { d: dist, t } = segDist(a[0], a[1], b[0], b[1], x, y);
      if (dist < 0.75 && t > 0.0001 && t < 0.9999) {
        s.verts.splice(k + 1, 0, i);
        /* and what the line said — a doorway, a texture, an offset — is
           said by both halves of it now */
        const old = lineKey(s.verts[k], s.verts[(k + 2) % s.verts.length]);
        const o = d.lines?.[old];
        if (o) { d.lines[lineKey(s.verts[k], i)] = { ...o }; d.lines[lineKey(i, s.verts[(k + 2) % s.verts.length])] = { ...o }; delete d.lines[old]; }
        break;
      }
    }
  }
  return i;
}

/**
 * Take the new ring `ring` out of sector `P`, where the new ring runs
 * along P's own edge for a stretch and then cuts across P: P becomes its
 * own way round between the two ends of the cut, and then the cut
 * backwards. Of the two ways round P, the one whose area comes out as
 * P's less the new ring's is the right one. This is also what splits a
 * room in two when the new sector's cut runs wall to wall. If the
 * shapes do not meet like that — the new ring touching P in two
 * separate places, say — nothing is cut, and the overlap is left for
 * the problems list to report.
 */
export function cutFrom(d, P, ring) {
  const pv = P.verts, n = ring.length, m = pv.length;
  const adj = (x, y) => {
    const i = pv.indexOf(x), j = pv.indexOf(y);
    return i >= 0 && j >= 0 && ((i + 1) % m === j || (j + 1) % m === i);
  };
  /* which of the new ring's edges run along P */
  const along = ring.map((v, k) => adj(v, ring[(k + 1) % n]));
  if (along.every(Boolean) || !along.some(Boolean)) return false;
  /* start at the first edge of the cut */
  const k0 = along.findIndex((x, k) => !x && along[(k - 1 + n) % n]);
  const r = [...ring.slice(k0), ...ring.slice(0, k0)];
  const al = [...along.slice(k0), ...along.slice(0, k0)];
  const cn = al.findIndex(x => x);                  // edges in the cut
  if (al.slice(cn).some(x => !x)) return false;     // a second cut
  const u = r[0], w = r[cn], inner = r.slice(1, cn);
  if (!pv.includes(u) || !pv.includes(w) || inner.some(v => pv.includes(v))) return false;
  const a = pv.indexOf(u), b = pv.indexOf(w);
  const arc = dir => { const out = []; for (let i = a; ; i = (i + dir + m) % m) { out.push(pv[i]); if (i === b) break; } return out; };
  const area = vs => Math.abs(signedArea(vs.map(i => d.vertices[i])));
  const want = area(pv) - area(ring);
  let best = null, err = Infinity;
  for (const dir of [1, -1]) {
    const c = [...arc(dir), ...inner.slice().reverse()];
    if (c.length < 3 || selfCrosses(c.map(i => d.vertices[i]))) continue;
    const e = Math.abs(area(c) - want);
    if (e < err) { err = e; best = c; }
  }
  if (!best || err > Math.max(4, want * 1e-6)) return false;
  P.verts = best;
  return true;
}

/** Split sector `S` along `path` (vertex indices, its ends on S's edge,
 *  the rest inside): S keeps one side, a new sector the other. */
export function splitSector(d, S, path) {
  if (!S || path.length < 2) return null;
  const u = path[0], w = path[path.length - 1], inner = path.slice(1, -1);
  const r = S.verts, i = r.indexOf(u), j = r.indexOf(w);
  if (i < 0 || j < 0 || u === w) return null;
  const arc = (from, to) => { const out = []; for (let k = from; ; k = (k + 1) % r.length) { out.push(r[k]); if (k === to) break; } return out; };
  const one = [...arc(i, j), ...[...inner].reverse()];
  const two = [...arc(j, i), ...inner];
  if (one.length < 3 || two.length < 3) return null;
  S.verts = one;
  const made = { ...JSON.parse(JSON.stringify({ ...S, verts: undefined, id: undefined, name: '' })), id: takeId(d), verts: two };
  d.sectors.push(made);
  return made;
}

/** Does an outline properly cross any line of the map? */
function crossesLines(d, points) {
  const L = linesOf(d);
  for (let k = 0; k < points.length; k++) {
    const p = points[k], q = points[(k + 1) % points.length];
    for (const l of L) {
      const a = d.vertices[l.a], b = d.vertices[l.b];
      if (segCross(p[0], p[1], q[0], q[1], a[0], a[1], b[0], b[1])) return true;
    }
  }
  return false;
}
function segDistRing(r, x, y) {
  let m = Infinity;
  for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]; m = Math.min(m, segDist(a[0], a[1], b[0], b[1], x, y).d); }
  return m;
}

function sectorContaining(d, x, y) {
  let best = null, ba = Infinity;
  for (const s of d.sectors) {
    const r = s.verts.map(i => d.vertices[i]);
    if (r.length < 3 || !pointInPoly(r, x, y)) continue;
    const a = Math.abs(signedArea(r));
    if (a < ba) { ba = a; best = s; }
  }
  return best;
}

/** Move a selection. Vertices move alone; a sector or a line moves its
 *  corners, so whatever shares them stretches — the way it does in a
 *  Doom editor, and the reason a room can be dragged bigger. */
export function moveThings(d, kind, ids, dx, dy) {
  if (kind === 'thing') for (const t of d.things) { if (ids.has(t.id)) { t.x += dx; t.y += dy; } }
  if (kind === 'prop') for (const p of d.props) { if (ids.has(p.id)) { p.x0 += dx; p.x1 += dx; p.y0 += dy; p.y1 += dy; } }
  if (kind === 'scatter') for (const c of d.scatters || []) {
    if (!ids.has(c.id)) continue;
    const a = c.area;
    if (a.kind === 'circle') { a.x += dx; a.y += dy; }
    if (a.kind === 'rect') { a.x0 += dx; a.x1 += dx; a.y0 += dy; a.y1 += dy; }
  }
  const verts = new Set();
  if (kind === 'vertex') for (const i of ids) verts.add(i);
  if (kind === 'sector') for (const s of d.sectors) if (ids.has(s.id)) for (const v of s.verts) verts.add(v);
  if (kind === 'line') for (const k of ids) for (const v of k.split(',').map(Number)) verts.add(v);
  for (const i of verts) { if (d.vertices[i]) { d.vertices[i][0] += dx; d.vertices[i][1] += dy; } }
  /* things standing in a sector that moved go with it */
  if (kind === 'sector') {
    for (const s of d.sectors) {
      if (!ids.has(s.id)) continue;
      const r = s.verts.map(i => [d.vertices[i][0] - dx, d.vertices[i][1] - dy]);
      for (const t of d.things) if (pointInPoly(r, t.x, t.y)) { t.x += dx; t.y += dy; }
    }
  }
}

/** Delete a line: join the two sectors on it into one, or remove the
 *  sector a one-sided line bounds. */
export function mergeAcross(d, key) {
  const [a, b] = key.split(',').map(Number);
  const on = d.sectors.filter(s => s.verts.some((v, k) => {
    const w = s.verts[(k + 1) % s.verts.length];
    return (v === a && w === b) || (v === b && w === a);
  }));
  if (on.length === 1) { d.sectors = d.sectors.filter(s => s !== on[0]); return; }
  if (on.length !== 2) return;
  const [s1, s2] = on;
  /* both anticlockwise first, so they walk the shared edge in opposite
     directions — a room drawn clockwise would otherwise merge into a
     ring that folds back on itself, and vanish */
  for (const x of on) if (signedArea(x.verts.map(i => d.vertices[i])) < 0) x.verts = [...x.verts].reverse();
  /* walk s1 round to the shared edge, then s2 the other way round from
     it, and splice: the union's ring without the shared edge */
  const rot = (arr, i) => arr.slice(i).concat(arr.slice(0, i));
  const i1 = s1.verts.findIndex((v, k) => { const w = s1.verts[(k + 1) % s1.verts.length]; return (v === a && w === b) || (v === b && w === a); });
  const r1 = rot(s1.verts, i1 + 1);                      // starts at the far end of the shared edge
  const end = r1[r1.length - 1];                         // the near end
  const i2 = s2.verts.indexOf(end);
  const r2 = rot(s2.verts, i2);                          // starts at the near end
  const merged = [...r1.slice(0, -1), ...r2.slice(0, -1)];
  let ring = merged.filter((v, k, arr) => v !== arr[(k + 1) % arr.length]);
  /* and where the two shared more than the one line, the union doubles
     back along the rest of it: a spike out to a corner and straight
     back, which is taken off until there is none */
  for (let again = true; again && ring.length > 3;) {
    again = false;
    for (let k = 0; k < ring.length; k++) {
      const n = ring.length;
      if (ring[(k - 1 + n) % n] === ring[(k + 1) % n]) {
        ring = ring.filter((_, i) => i !== k && i !== (k + 1) % n);
        again = true;
        break;
      }
    }
  }
  s1.verts = ring;
  d.sectors = d.sectors.filter(s => s !== s2);
  delete d.lines[lineKey(a, b)];
}

/* ---------------------------------------------------------------------
   BOOT
   --------------------------------------------------------------------- */

/** Open the editor over the page. Loaded only when somebody asks for it
 *  — from the terminal, or straight in with `?edit`. */
export async function startEditor() {
  /* its own stylesheet, loaded with it */
  if (!document.getElementById('ed-css')) {
    const l = document.createElement('link');
    l.id = 'ed-css'; l.rel = 'stylesheet'; l.href = 'css/editor.css';
    /* and wait for it: the views size themselves from the layout it
       makes, and a view measured before it arrives frames the map into
       a corner */
    const loaded = new Promise(res => { l.onload = l.onerror = res; });
    document.head.appendChild(l);
    await loaded;
  }
  document.title = 'GSS-EDIT';

  /* THE ART IS EARTH, the same box the game paints in, so a texture in
     the browser looks the way it does on the wall */
  setArtPalette('earth');
  const bank = bakeTextures();

  const root = document.createElement('div');
  root.id = 'editor';
  document.body.appendChild(root);

  const ed = new Editor(root);
  ed.bank = bank;
  ed.gameTextureNames = TEXTURE_NAMES.filter(n => n !== 'MISSING').sort();
  /* THE TEXTURE PACK (js/texpack.js): the pictures the user handed
     over, as files. Its names are the game's as far as a map texture is
     concerned — a map cannot make one called CONC_1 */
  ed.packTextureNames = PACK_NAMES;
  ed.builtInTextures = new Set([...bank.map.keys(), ...PACK_NAMES]);
  ed.mapTextureNames = [];
  ed.textureNames = [...ed.gameTextureNames, ...PACK_NAMES];
  ed.anim = new PackAnimator(bank);

  /* the map: what you were last working on, or THE GRID */
  let doc = null;
  try { const t = localStorage.getItem(AUTOSAVE_KEY); if (t) doc = parseDoc(t); } catch (e) { doc = null; }
  ed.history = new History(doc || gridDoc());
  /* what the map wears from the pack is loaded before it is first
     built; the rest comes in behind it, for the browser (see below) */
  ed.packLoading = true;
  await loadPack(bank, packNamesIn(ed.doc));

  const ui = buildUI(ed);
  ed.ui = ui;
  ed.view2d = new View2D(ed, ui.canvas2d);
  ed.view3d = new View3D(ed, ui.canvas3d);
  ed._texKey = textureKey(ed.doc);
  await ed.refreshTextures();
  /* THE REST OF THE PACK, in the background: forty megabytes the map
     does not need to open, and the browser fills in when it lands. A
     wall that asked for one before it arrived is built again then. */
  loadPack(bank).then(() => {
    ed.packLoading = false;
    ed.refreshTextures();
  });

  /* THE KEYBOARD, which is most of what a Doom editor is. The view the
     mouse is over gets first refusal (the 3D view flies with WASD); what
     it does not take comes here. Nothing fires while a field has focus,
     or typing a sector's name would change the mode. */
  addEventListener('keydown', e => {
    /* A DIALOG OWNS THE KEYBOARD while it is open */
    if (document.getElementById('ed-texed') || document.getElementById('ed-godot')) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      const el = document.activeElement;
      if (e.key === 'Escape') el.blur();
      /* Enter commits a field and gives the keys back to the map */
      if (e.key === 'Enter' && el.closest?.('#ed-side')) { el.blur(); e.preventDefault(); }
      /* and Ctrl+Z is the map's undo, as it always is in Doom Builder —
         the field commits what was typed first */
      if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key) && el.closest?.('#ed-side') && el.type !== 'text') {
        e.preventDefault(); el.blur();
        if (e.key.toLowerCase() === 'y' || e.shiftKey) ed.redo(); else ed.undo();
      }
      return;
    }
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? ed.redo() : ed.undo(); return; }
    if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); ed.redo(); return; }
    if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); ed.fileSave(); return; }
    if (ctrl && k.toLowerCase() === 'o') { e.preventDefault(); ed.fileOpen(); return; }
    if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); selectAll(ed); return; }
    if (ctrl && ed.pointerView === '3d' && ed.view3d.key(e)) { e.preventDefault(); return; }
    /* copy and paste of the selection itself (in 3D, over a surface,
       Ctrl+C and Ctrl+V are its texture, taken just above) */
    if (ctrl && k.toLowerCase() === 'c') { e.preventDefault(); ed.copySel(); return; }
    if (ctrl && k.toLowerCase() === 'v') { e.preventDefault(); ed.paste(); return; }
    if (ctrl) return;
    /* VISUAL MODE, Doom Builder's Q: the 3D view on its own, the mouse
       looking, a crosshair to pick with — Q or Escape again to leave */
    if (k.toLowerCase() === 'q' && !e.altKey && !ed.view3d.looking) { e.preventDefault(); ed.view3d.toggleVisual(); return; }
    const target = ed.pointerView === '3d' ? ed.view3d : ed.view2d;
    if (target.key?.(e)) { e.preventDefault(); return; }
    if (k === 'F5') { e.preventDefault(); ed.play(); return; }
    if (k === 'Tab') {
      e.preventDefault();
      /* in the combined workspace Tab swaps which view is big; in the
         others it flips between the two on their own */
      const next = { combined: 'combined2d', combined2d: 'combined', only3d: 'only2d', only2d: 'only3d' }[ed.layout];
      ed.setLayout(next || (ed.pointerView === '3d' ? 'only3d' : 'only2d'));
      return;
    }
    if (k === 'Backspace' && ed.path.length) { e.preventDefault(); ed.path.pop(); ed.emit('path'); return; }
    if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      /* nothing selected: the highlighted element of THIS mode, as Doom
         Builder does with Delete — never a sector found under a thing */
      if (!ed.sel.kind && k === 'Delete' && ed.hovered && ed.hovered.kind === MODE_KIND[ed.mode]) ed.select(ed.hovered.kind, [ed.hovered.id]);
      if (ed.sel.kind) ed.deleteSel();
      return;
    }
    if (k === 'Insert') { e.preventDefault(); ed.insertAtCursor(); return; }
    if (k === 'PageUp' || k === 'PageDown') {
      /* the floor of the selected or highlighted sectors, a grid step;
         Shift for the ceiling */
      e.preventDefault();
      const ids = ed.targetOr('sector');
      if (ids.size) ed.nudgeHeight(e.shiftKey ? 'ceil' : 'floor', (k === 'PageUp' ? 1 : -1) * 8, ids);
      return;
    }
    if (k === 'Escape') { if (ed.path.length) { ed.cancelPath(); ed.afterDraw(); } else ed.clearSel(); return; }
    if (k === 'Enter' && ed.path.length) { ed.closePath({ open: true }); return; }
    if (k === '[') { ed.gridStep(-1); return; }
    if (k === ']') { ed.gridStep(1); return; }
    const up = k.toUpperCase();
    for (const [m, def] of Object.entries(MODES)) if (def.key === up && !e.altKey) { ed.setMode(m); return; }
    if (up === 'G') { ed.snap = !ed.snap; ed.emit('grid'); ed.say(`snap ${ed.snap ? 'on' : 'off'}`); return; }
    if (k === ' ') { e.preventDefault(); ed.setMode('draw'); return; }
    if (up === 'F') { ed.emit('frame'); return; }
    if (up === 'B') { ed.view3d.setFullbright(!ed.view3d.fullbright); return; }
    /* K: the plan's views in turn — normal, brightness, floors, ceilings */
    if (up === 'K') {
      const order = ['normal', 'light', 'floor', 'ceil'];
      ed.planView = order[(order.indexOf(ed.planView || 'normal') + 1) % order.length];
      if (ed.ui.planSel) ed.ui.planSel.value = ed.planView;
      ed.emit('grid');
      ed.say(`plan: ${{ normal: 'normal', light: 'brightness', floor: 'floor heights', ceil: 'ceiling heights' }[ed.planView]}`);
      return;
    }
  });

  /* keep working when the tab is closed, and say so if there is
     unsaved work anyway */
  addEventListener('beforeunload', () => ed.autosave());

  /* a handle for the console and the tests, as the game has SELLWRONG */
  window.GSSEDIT = ed;
  ed.emit('frame');
  ed.say(doc ? 'opened your last map' : 'THE GRID — D draws a sector, X scatters, every mode works in 3D; Tab swaps the views, F5 plays');
  return ed;
}

function selectAll(ed) {
  const d = ed.doc;
  const m = ed.mode;
  if (m === 'vertices') ed.select('vertex', d.vertices.map((_, i) => i));
  else if (m === 'lines') ed.select('line', ed.lines().map(l => l.key));
  else if (m === 'things') ed.select('thing', d.things.map(t => t.id));
  else if (m === 'props') ed.select('prop', d.props.map(p => p.id));
  else if (m === 'scatter') ed.select('scatter', d.scatters.map(p => p.id));
  else ed.select('sector', d.sectors.map(s => s.id));
}

/* THE SKY FOR THE 3D VIEW, baked the way the game bakes it: a Weather
   pinned to the map's own sky, and the SkyBaker handed a lookup cube it
   will not use, because the sky is baked in full colour. Exported for
   js/editor/view3d.js. */
export function makeSky(renderer, doc) {
  const atlas = buildLutAtlas();
  const lut = new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RGBAFormat);
  lut.minFilter = lut.magFilter = THREE.NearestFilter;
  lut.generateMipmaps = false;
  lut.needsUpdate = true;
  const sky = { ...(doc.world?.sky || {}), midAmt: 1, bare: true, snap: 0 };
  const weather = new Weather({ hour: 2.0, kind: 'clear', running: false, fireHaze: false, sky });
  const baker = new SkyBaker(renderer, lut, { seed: 11 });
  baker.bake(weather.frame);
  world.skyTex.value = baker.texture;
  return { weather, baker };
}

/* A fingerprint of the map's own textures, cheap enough to take on every
   edit: an imported picture counts by its length, not its bytes. */
function textureKey(doc) {
  return JSON.stringify(doc.textures || [], (k, v) => (k === 'image' && typeof v === 'string' ? v.length : v));
}

/** A sector's brightness, Doom's way: 0 to 255. */
export function brightOf(s) { return Math.round(Math.max(0, Math.min(1, s.light ?? 0.72)) * 255); }
/** And whether it is inside: roofed, rather than open to the sky. */
export function isInside(s) { return !!s.ceilTex && s.ceilTex !== 'SKY'; }
