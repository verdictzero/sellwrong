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
  segDist, strictlyInside, selfCrosses,
} from './doc.js';
import { View2D } from './view2d.js';
import { View3D } from './view3d.js';
import { buildUI } from './ui.js';

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
};

export class Editor {
  constructor(root) {
    this.root = root;
    this.listeners = new Map();
    this.mode = 'sectors';
    this.grid = 64;
    this.snap = true;
    this.thingType = 'SHOPPER';
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
    this.layout = 'split';
    this.status = '';
  }

  /* ------------------------------------------------------------------
     events
     ------------------------------------------------------------------ */
  on(evt, fn) { (this.listeners.get(evt) || this.listeners.set(evt, []).get(evt)).push(fn); return this; }
  emit(evt, ...a) { for (const fn of this.listeners.get(evt) || []) fn(...a); }

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
  edit(label, fn, { tidy = true } = {}) {
    this.history.push(label);
    fn(this.doc);
    if (tidy) compact(this.doc);
    this.changed();
  }

  /** The document moved: tell everybody, and recompile a moment later
   *  rather than on every mouse move of a drag. */
  changed({ now = false } = {}) {
    this._lines = null;
    this.emit('doc');
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
    this.mode = m;
    /* a selection only survives a mode that can show it */
    const keep = { vertices: 'vertex', lines: 'line', sectors: 'sector', things: 'thing', props: 'prop' }[m];
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
      d.things.push({ id: takeId(d), type, x: this.snapV(x), y: this.snapV(y), angle: Math.PI / 2 });
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
    let made = null;
    this.edit(label, d => {
      const idx = points.map(([x, y]) => vertexFor(d, x, y));
      /* drop repeats a slow double-click leaves */
      const ring = idx.filter((v, k, a) => v !== a[(k + 1) % a.length]);
      if (ring.length < 3) return;
      const pts = ring.map(i => d.vertices[i]);
      const [cx, cy] = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
      const parent = sectorContaining(d, cx, cy);
      const base = parent ? { ...parent, id: undefined, verts: undefined, name: '', storeys: undefined } : { ...SECTOR_DEFAULTS };
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
    }, { tidy: false });
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
        const field = s.band === 'upper' ? 'upperTex' : s.band === 'lower' ? 'lowerTex' : 'wallTex';
        this.edit(`texture ${name}`, d => {
          d.lines[s.line] = { ...(d.lines[s.line] || {}), [field]: name };
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
      if (dist < 0.75 && t > 0.0001 && t < 0.9999) { s.verts.splice(k + 1, 0, i); break; }
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
  ed.textureNames = TEXTURE_NAMES.filter(n => n !== 'MISSING').sort();

  /* the map: what you were last working on, or THE GRID */
  let doc = null;
  try { const t = localStorage.getItem(AUTOSAVE_KEY); if (t) doc = parseDoc(t); } catch (e) { doc = null; }
  ed.history = new History(doc || gridDoc());

  const ui = buildUI(ed);
  ed.ui = ui;
  ed.view2d = new View2D(ed, ui.canvas2d);
  ed.view3d = new View3D(ed, ui.canvas3d);
  ed.compile();

  /* THE KEYBOARD, which is most of what a Doom editor is. The view the
     mouse is over gets first refusal (the 3D view flies with WASD); what
     it does not take comes here. Nothing fires while a field has focus,
     or typing a sector's name would change the mode. */
  addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? ed.redo() : ed.undo(); return; }
    if (ctrl && k.toLowerCase() === 'y') { e.preventDefault(); ed.redo(); return; }
    if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); ed.fileSave(); return; }
    if (ctrl && k.toLowerCase() === 'o') { e.preventDefault(); ed.fileOpen(); return; }
    if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); selectAll(ed); return; }
    if (ctrl) return;
    const target = ed.pointerView === '3d' ? ed.view3d : ed.view2d;
    if (target.key?.(e)) { e.preventDefault(); return; }
    if (k === 'F5') { e.preventDefault(); ed.play(); return; }
    if (k === 'Tab') {
      e.preventDefault();
      ed.setLayout(ed.layout === 'only3d' ? 'only2d' : ed.layout === 'only2d' ? 'only3d' : (ed.pointerView === '3d' ? 'only3d' : 'only2d'));
      return;
    }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); ed.deleteSel(); return; }
    if (k === 'Escape') { ed.clearSel(); return; }
    if (k === '[') { ed.gridStep(-1); return; }
    if (k === ']') { ed.gridStep(1); return; }
    const up = k.toUpperCase();
    for (const [m, def] of Object.entries(MODES)) if (def.key === up && !e.altKey) { ed.setMode(m); return; }
    if (up === 'G') { ed.snap = !ed.snap; ed.emit('grid'); ed.say(`snap ${ed.snap ? 'on' : 'off'}`); return; }
    if (k === ' ') { e.preventDefault(); ed.setMode('draw'); return; }
    if (up === 'F') { ed.emit('frame'); return; }
  });

  /* keep working when the tab is closed, and say so if there is
     unsaved work anyway */
  addEventListener('beforeunload', () => ed.autosave());

  /* a handle for the console and the tests, as the game has SELLWRONG */
  window.GSSEDIT = ed;
  ed.emit('frame');
  ed.say(doc ? 'opened your last map' : 'THE GRID — press D to draw a sector, Tab for the 3D view, F5 to play');
  return ed;
}

function selectAll(ed) {
  const d = ed.doc;
  const m = ed.mode;
  if (m === 'vertices') ed.select('vertex', d.vertices.map((_, i) => i));
  else if (m === 'lines') ed.select('line', ed.lines().map(l => l.key));
  else if (m === 'things') ed.select('thing', d.things.map(t => t.id));
  else if (m === 'props') ed.select('prop', d.props.map(p => p.id));
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
