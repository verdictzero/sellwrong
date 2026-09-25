/* =====================================================================
   GSS-EDIT — the bars round the views
   =====================================================================

   The top bar (menus, modes, the grid, PLAY), the panel down the right
   (the inspector, the texture browser, the thing palette, the map's own
   settings and its problems) and the status line along the bottom.

   THE INSPECTOR EDITS EVERYTHING SELECTED AT ONCE. It shows the first
   of them and writes a changed field to all of them, which is how a
   Doom editor's sector dialog works with twenty sectors picked — and
   every write is one `ed.edit`, so it undoes like anything else.
   ===================================================================== */

import { THING_TYPES, problemsOf, ringOf, signedArea, COLOR_PARTS } from './doc.js';
import { openTextureEditor } from './texeditor.js';
import { MODES, GRIDS } from './editor.js';
import { PRESETS, SCATTER_TYPES, PLANT_KINDS, SCATTER_MAX } from './scatter.js';
import { plantColour } from './view2d.js';

/* the mode buttons' own short names */
const SHORT = { vertices: 'Verts', lines: 'Lines', sectors: 'Sectors', things: 'Things', props: 'Props', draw: 'Draw', rect: 'Rect', scatter: 'Scatter' };

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
};

/** Append, leaving out what a condition left empty — `append` would
 *  write "null" into the panel. */
const put = (el, ...kids) => el.append(...kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false && k !== ''));

/** A texture's picture, small, for a swatch. Drawn from the bank's own
 *  canvas, so it is what the wall will show. */
function swatch(ed, name, size = 22) {
  const c = h('canvas', { width: size, height: size });
  const e = name && ed.bank.get(name);
  if (name === 'SKY') {
    /* the sky is not a picture on the ceiling, it is the sky: the map's
       own, horizon to overhead */
    const sky = ed.doc.world?.sky || {};
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, size, 0, 0);
    gr.addColorStop(0, sky.horizon || '#1d9a48'); gr.addColorStop(0.5, sky.mid || '#06301a'); gr.addColorStop(1, sky.zenith || '#000');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  } else if (e?.texture?.image) {
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(e.texture.image, 0, 0, size, size);
  }
  return c;
}

export function buildUI(ed) {
  const root = ed.root;
  const ui = {};

  /* ------------------------------------------------------------------
     THE TOP BAR
     ------------------------------------------------------------------ */
  const menu = (label, items) => {
    const m = h('div', { class: 'ed-menu' });
    const btn = h('button', { class: 'ed-btn', onclick: e => {
      e.stopPropagation();
      const was = m.classList.contains('open');
      root.querySelectorAll('.ed-menu.open').forEach(x => x.classList.remove('open'));
      if (!was) m.classList.add('open');
    } }, label);
    const box = h('div', { class: 'items' });
    for (const it of items) {
      if (it === '-') { box.append(h('hr')); continue; }
      box.append(h('button', { onclick: () => { m.classList.remove('open'); it[2](); } }, h('span', {}, it[0]), h('kbd', {}, it[1] || '')));
    }
    m.append(btn, box);
    return m;
  };
  addEventListener('click', () => root.querySelectorAll('.ed-menu.open').forEach(x => x.classList.remove('open')));

  const modeBtns = {};
  const modes = Object.entries(MODES).map(([m, def]) => {
    const b = h('button', { class: 'ed-btn', title: `${def.name} (${def.key})`, onclick: () => ed.setMode(m) },
      SHORT[m] || def.name, h('kbd', {}, def.key));
    modeBtns[m] = b;
    return b;
  });

  const gridSel = h('select', { title: 'Grid size  [ ]', onchange: e => ed.setGrid(+e.target.value) },
    ...GRIDS.map(g => h('option', { value: g }, `grid ${g}`)));
  const snapBtn = h('button', { class: 'ed-btn', title: 'Snap to grid (G)', onclick: () => { ed.snap = !ed.snap; ed.emit('grid'); } }, 'Snap', h('kbd', {}, 'G'));
  const layoutBtns = {
    combined: h('button', { class: 'ed-btn', title: 'Both at once: 3D with the plan inset (Tab swaps them)', onclick: () => ed.setLayout(ed.layout === 'combined' ? 'combined2d' : 'combined') }, 'Combined'),
    only2d: h('button', { class: 'ed-btn', title: '2D only (Tab)', onclick: () => ed.setLayout('only2d') }, '2D'),
    split: h('button', { class: 'ed-btn', title: 'Side by side', onclick: () => ed.setLayout('split') }, 'Split'),
    only3d: h('button', { class: 'ed-btn', title: '3D only (Tab)', onclick: () => ed.setLayout('only3d') }, '3D'),
  };

  const top = h('div', { id: 'ed-top' },
    h('span', { class: 'brand' }, 'GSS-EDIT'),
    menu('File', [
      ['New map', '', () => ed.fileNew(false)],
      ['New from THE GRID', '', () => ed.fileNew(true)],
      '-',
      ['Open…', 'Ctrl+O', () => ed.fileOpen()],
      ['Save as file', 'Ctrl+S', () => ed.fileSave()],
      '-',
      ['Test map', 'F5', () => ed.play()],
      ['Back to the terminal', '', () => { ed.autosave(); location.href = location.pathname; }],
    ]),
    menu('Edit', [
      ['Undo', 'Ctrl+Z', () => ed.undo()],
      ['Redo', 'Ctrl+Y', () => ed.redo()],
      '-',
      ['Delete selection', 'Del', () => ed.deleteSel()],
      ['Clear selection', 'Esc', () => ed.clearSel()],
      '-',
      ['Frame the map', 'F', () => ed.emit('frame')],
    ]),
    menu('Help', [
      ['2D: drag to move, box-select on empty', '', () => {}],
      ['2D: middle / right drag pans, wheel zooms', '', () => {}],
      ['D: click points, click the first to close', '', () => {}],
      ['R: drag a rectangle into a sector', '', () => {}],
      ['X: drag a circle to scatter the chosen mix', '', () => {}],
      ['Every mode works in the 3D view too', '', () => {}],
      ['Tab swaps the big view and the inset', '', () => {}],
      ['3D: hold right mouse to look, WASD QE fly', '', () => {}],
      ['3D: wheel raises the floor/ceiling under it', '', () => {}],
      ['3D: click a texture to paint the pick', '', () => {}],
      ['3D: Ctrl+C copies a texture, Ctrl+V pastes', '', () => {}],
      ['3D: B toggles fullbright, F goes to start', '', () => {}],
    ]),
    h('span', { class: 'sep' }),
    ...modes,
    h('span', { class: 'sep' }),
    gridSel, snapBtn,
    h('span', { class: 'sep' }),
    layoutBtns.combined, layoutBtns.split, layoutBtns.only2d, layoutBtns.only3d,
    h('span', { class: 'spacer' }),
    h('button', { class: 'ed-btn play', title: 'Test the map (F5)', onclick: () => ed.play() }, '▶ PLAY', h('kbd', {}, 'F5')),
  );

  /* ------------------------------------------------------------------
     THE VIEWS
     ------------------------------------------------------------------ */
  ui.canvas2d = h('canvas', { tabindex: 0 });
  ui.canvas3d = h('canvas', { tabindex: 0 });
  ui.help2d = h('div', { class: 'help' });
  ui.help3d = h('div', { class: 'help' },
    'hold RMB: look + WASD/QE fly · every mode works here\nwheel height · Ctrl+C/V texture · B fullbright · F start');
  const wrap2d = h('div', { id: 'ed-2d-wrap', class: 'ed-view' }, ui.canvas2d, h('div', { class: 'tag' }, 'MAP  2D'), ui.help2d);
  const wrap3d = h('div', { id: 'ed-3d-wrap', class: 'ed-view' }, ui.canvas3d, h('div', { class: 'tag' }, 'VISUAL  3D'), ui.help3d);
  ui.wrap2d = wrap2d; ui.wrap3d = wrap3d;
  /* in the combined workspace, a button on the inset to swap it big */
  for (const w of [wrap2d, wrap3d]) w.append(h('button', { class: 'ed-swap', title: 'Swap the big view and the inset (Tab)',
    onclick: () => ed.setLayout(ed.layout === 'combined' ? 'combined2d' : 'combined') }, '⤢'));
  const views = h('div', { id: 'ed-views', class: ed.layout }, wrap2d, wrap3d);

  /* ------------------------------------------------------------------
     THE SIDE PANEL
     ------------------------------------------------------------------ */
  const panes = {
    insp: h('div', { class: 'ed-pane ed-insp on' }),
    tex: h('div', { class: 'ed-pane' }),
    things: h('div', { class: 'ed-pane' }),
    scatter: h('div', { class: 'ed-pane ed-insp' }),
    map: h('div', { class: 'ed-pane ed-insp' }),
  };
  const tabBtns = {};
  const showTab = t => {
    for (const [k, p] of Object.entries(panes)) p.classList.toggle('on', k === t);
    for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('on', k === t);
    ui.tab = t;
    if (t === 'map') renderMap();
    if (t === 'scatter') renderScatter();
    if (t === 'things') renderThings();
  };
  ui.showTab = showTab;
  const tabs = h('div', { class: 'ed-tabs' },
    ...[['insp', 'Inspect'], ['tex', 'Textures'], ['things', 'Things'], ['scatter', 'Scatter'], ['map', 'Map']].map(([k, n]) =>
      (tabBtns[k] = h('button', { onclick: () => showTab(k) }, n))));
  tabBtns.insp.classList.add('on');
  const side = h('div', { id: 'ed-side' }, tabs, h('div', { style: 'min-height:0;display:grid' }, ...Object.values(panes)));

  /* ------------------------------------------------------------------
     THE STATUS LINE
     ------------------------------------------------------------------ */
  const st = {
    mode: h('span'), grid: h('span'), pos: h('span'), sel: h('span'), probs: h('span'), msg: h('span', { class: 'msg' }),
  };
  const status = h('div', { id: 'ed-status' }, st.mode, st.grid, st.pos, st.sel, st.probs, st.msg);
  const toast = h('div', { id: 'ed-toast' });

  root.append(top, h('div', { id: 'ed-main' }, views, side), status, toast);

  let toastT = 0;
  ui.toast = msg => {
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 1800);
  };
  ui.setPos = (x, y) => { st.pos.innerHTML = x === null ? '' : `<b>${Math.round(x)}</b>, <b>${Math.round(y)}</b>`; };

  const refreshBar = () => {
    for (const [m, b] of Object.entries(modeBtns)) b.classList.toggle('on', ed.mode === m);
    gridSel.value = String(ed.grid);
    snapBtn.classList.toggle('on', ed.snap);
    for (const [l, b] of Object.entries(layoutBtns)) b.classList.toggle('on', ed.layout === l);
    views.className = ed.layout;
    st.mode.innerHTML = `mode <b>${MODES[ed.mode].name}</b>`;
    st.grid.innerHTML = `grid <b>${ed.grid}</b>${ed.snap ? '' : ' (free)'}`;
    const n = ed.sel.ids.size;
    st.sel.innerHTML = n ? `<b>${n}</b> ${ed.sel.kind}${n > 1 ? 's' : ''}${ed.surf ? ` · ${ed.surf.part}` : ''}` : '';
    ui.help2d.textContent = HELP2D[ed.mode] || '';
  };

  /* ------------------------------------------------------------------
     THE INSPECTOR
     ------------------------------------------------------------------ */
  /* THE TEXTURE FIELD BEING PICKED FOR, if the browser was opened from
     one: `{ field, label }`. Clicking a texture then fills that field
     on everything selected and comes back. */
  ui.picking = null;

  const row = (label, input) => h('div', { class: 'ed-row' }, h('label', {}, label), input);
  const num = (value, onset, { step = 1, title } = {}) =>
    h('input', { type: 'number', value: value ?? '', step, title, onchange: e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onset(v); } });
  const txt = (value, onset) => h('input', { type: 'text', value: value ?? '', onchange: e => onset(e.target.value) });
  const chk = (value, onset) => h('input', { type: 'checkbox', ...(value ? { checked: true } : {}), onchange: e => onset(e.target.checked) });
  const texField = (value, field, label, { allowNone = false } = {}) => {
    const el = h('div', { class: 'ed-tex' + (ui.picking?.field === field ? ' picking' : ''), title: 'click to pick from the browser',
      onclick: () => { ui.picking = { field, label, allowNone }; showTab('tex'); renderTex(); } },
      swatch(ed, value), h('span', {}, value || (allowNone ? '— same as wall —' : '—')));
    return row(label, el);
  };

  /** One of a sector's five Doom 64 colours: a tick to use it, and the
   *  colour. */
  const colourRow = (s, k) => {
    const v = s.colors?.[k];
    const label = { floor: 'Floor', ceil: 'Ceiling', thing: 'Things', top: 'Walls, top', bottom: 'Walls, bottom' }[k];
    const set = c => each(`${label.toLowerCase()} colour`, x => {
      if (c) x.colors = { ...(x.colors || {}), [k]: c };
      else if (x.colors) { delete x.colors[k]; if (!Object.keys(x.colors).length) delete x.colors; }
    });
    return h('div', { class: 'ed-row two' }, h('label', {}, label),
      h('input', { type: 'checkbox', ...(v ? { checked: true } : {}), onchange: e => set(e.target.checked ? (v || '#ffffff') : null) }),
      h('input', { type: 'color', value: v || '#ffffff', onchange: e => set(e.target.value) }));
  };

  /** Doom Builder's eight facings, as a compass of buttons. */
  const facingButtons = onset => h('div', { class: 'ed-compass' },
    ...[['NW', 135], ['N', 90], ['NE', 45], ['W', 180], ['', null], ['E', 0], ['SW', 225], ['S', 270], ['SE', 315]].map(([n, deg]) =>
      deg === null ? h('span') : h('button', { title: `${deg}°`, onclick: () => onset(+(deg * Math.PI / 180).toFixed(4)) }, n)));

  /** Write `fn(obj)` into every selected object of the current kind. */
  const each = (label, fn) => {
    const { kind, ids } = ed.sel;
    ed.edit(label, d => {
      if (kind === 'sector') d.sectors.forEach(s => ids.has(s.id) && fn(s));
      if (kind === 'thing') d.things.forEach(t => ids.has(t.id) && fn(t));
      if (kind === 'prop') d.props.forEach(p => ids.has(p.id) && fn(p));
      if (kind === 'scatter') d.scatters.forEach(p => ids.has(p.id) && fn(p));
      if (kind === 'vertex') ids.forEach(i => d.vertices[i] && fn(d.vertices[i]));
      if (kind === 'line') ids.forEach(k => { d.lines[k] = d.lines[k] || {}; fn(d.lines[k]); if (!Object.keys(d.lines[k]).length) delete d.lines[k]; });
    }, { tidy: kind === 'vertex' });
  };

  const renderInsp = () => {
    const p = panes.insp;
    p.textContent = '';
    const { kind, ids } = ed.sel;
    const d = ed.doc;
    if (!kind || !ids.size) {
      put(p, h('h3', {}, 'Nothing selected'),
        h('p', { class: 'ed-note' }, 'Click something in the map or the 3D view. Shift adds to the selection; drag on empty space to box-select.'),
        h('p', { class: 'ed-note' }, `${d.sectors.length} sectors · ${ed.lines().length} lines · ${d.vertices.length} vertices · ${d.things.length} things · ${d.props.length} props`),
        h('h4', {}, 'New things'),
        row('Thing type', h('select', { onchange: e => { ed.thingType = e.target.value; } },
          ...Object.entries(THING_TYPES).map(([k, t]) => h('option', { value: k, ...(k === ed.thingType ? { selected: true } : {}) }, t.name)))),
        texField(ed.propTex, '@propTex', 'Prop texture'));
      return;
    }
    const n = ids.size;
    const head = (title) => h('h3', {}, title, h('small', {}, n > 1 ? `${n} selected` : ''));

    if (kind === 'sector') {
      const s = d.sectors.find(x => ids.has(x.id));
      if (!s) return;
      const r = ringOf(d, s);
      put(p, head(`Sector ${s.id}${s.name ? ` · ${s.name}` : ''}`),
        h('p', { class: 'ed-note' }, `${s.verts.length} corners · ${Math.round(Math.abs(signedArea(r)) / 4096)} cells²${ed.surf ? ` · picked: ${ed.surf.part}` : ''}`),
        row('Name', txt(s.name, v => each('rename sector', x => { x.name = v; }))),
        h('h4', {}, 'Heights'),
        row('Floor', num(s.floor, v => each('floor height', x => { x.floor = v; }), { step: 8 })),
        row(s.ceilTex === 'SKY' ? 'Wall height' : 'Ceiling', num(s.ceil, v => each('ceiling height', x => { x.ceil = v; }), { step: 8 })),
        row('Light', num(s.light ?? 0.72, v => each('light', x => { x.light = Math.max(0, Math.min(1.5, v)); }), { step: 0.05 })),
        /* THE SKY IS THE DEFAULT: no ceiling drawn, the sky showing
           through; turning it off gives the sector a roof */
        row('Sky, no ceiling', chk(s.ceilTex === 'SKY', v => each(v ? 'open to the sky' : 'roof over', x => {
          if (v) { x.ceilTex = 'SKY'; x.outdoor = true; } else { x.ceilTex = x.ceilTex === 'SKY' ? 'GRIDBOX' : x.ceilTex; x.outdoor = false; }
        }))),
        h('h4', {}, 'Colours — Doom 64'),
        h('p', { class: 'ed-note' }, 'The colour of the light on the floor, the ceiling, the things standing here, and the walls from top to bottom. Unticked is white.'),
        ...COLOR_PARTS.map(k => colourRow(s, k)),
        h('div', { class: 'ed-swatches' }, ...Object.entries(MOODS).map(([n, c]) =>
          h('button', { title: n, style: `background:linear-gradient(${c.top}, ${c.bottom})`, onclick: () => each(`colours ${n}`, x => { x.colors = { ...c }; }) })),
          h('button', { class: 'ed-btn', title: 'All white again', onclick: () => each('clear colours', x => { delete x.colors; }) }, 'Clear')),
        h('h4', {}, 'Textures'),
        texField(s.floorTex, 'floorTex', 'Floor'),
        s.ceilTex === 'SKY' ? null : texField(s.ceilTex, 'ceilTex', 'Ceiling'),
        texField(s.wallTex, 'wallTex', 'Walls'),
        texField(s.upperTex, 'upperTex', 'Upper', { allowNone: true }),
        texField(s.lowerTex, 'lowerTex', 'Lower', { allowNone: true }),
        h('h4', {}, 'Spread'),
        h('div', { class: 'ed-small-btns' },
          h('button', { class: 'ed-btn', title: 'Fill the selected sectors with the mix chosen in the Scatter tab',
            onclick: () => ed.scatterSectors() }, `Scatter ${PRESETS[ed.scatterPreset]?.name || ''} here`)),
      );
      return;
    }

    if (kind === 'line') {
      const key = [...ids][0];
      const o = d.lines[key] || {};
      const info = ed.lines().find(l => l.key === key);
      const [a, b] = key.split(',').map(Number);
      const va = d.vertices[a], vb = d.vertices[b];
      const len = va && vb ? Math.hypot(vb[0] - va[0], vb[1] - va[1]) : 0;
      put(p, head(`Line ${key}`),
        h('p', { class: 'ed-note' }, `${Math.round(len)} units · ${info ? (info.sectors.length > 1 ? 'two-sided' : 'one-sided') : 'not on a sector'}`),
        row('Blocks walking', chk(o.blocking, v => each('line blocking', x => { if (v) x.blocking = true; else delete x.blocking; }))),
        row('Blocks sight', chk(o.blockSight, v => each('line sight', x => { if (v) x.blockSight = true; else delete x.blockSight; }))),
        /* THE SIDEDEF, Doom's way: top, middle and bottom textures, the
           offsets, and the two unpegged flags */
        h('h4', {}, 'Textures — top, middle, bottom'),
        ...(info && info.sectors.length > 1
          ? [texField(o.upperTex, 'upperTex', 'Top (upper)', { allowNone: true }),
             texField(o.midTex, 'midTex', 'Middle', { allowNone: true }),
             o.midTex ? row('Middle height', num(o.midHeight ?? '', v => each('middle height', x => { if (v > 0) x.midHeight = v; else delete x.midHeight; }), { step: 8 })) : null,
             texField(o.lowerTex, 'lowerTex', 'Bottom (lower)', { allowNone: true })]
          : [texField(o.wallTex, 'wallTex', 'Middle (wall)', { allowNone: true })]),
        h('h4', {}, 'Alignment'),
        h('div', { class: 'ed-row two' }, h('label', {}, 'Offset x / y'),
          num(o.xoff ?? 0, v => each('x offset', x => { if (v) x.xoff = v; else delete x.xoff; }), { step: 1 }),
          num(o.yoff ?? 0, v => each('y offset', x => { if (v) x.yoff = v; else delete x.yoff; }), { step: 1 })),
        row('Upper unpegged', chk(o.unpegUpper, v => each('upper unpegged', x => { if (v) x.unpegUpper = true; else delete x.unpegUpper; }))),
        row('Lower unpegged', chk(o.unpegLower, v => each('lower unpegged', x => { if (v) x.unpegLower = true; else delete x.unpegLower; }))),
        h('p', { class: 'ed-note' }, 'In 3D, the arrow keys over a wall nudge its offsets (Shift: 8 at a time). Deleting a line joins the two sectors on it into one.'));
      return;
    }

    if (kind === 'vertex') {
      const i = [...ids][0];
      const v = d.vertices[i];
      if (!v) return;
      put(p, head(`Vertex ${i}`),
        n === 1 ? row('X', num(v[0], x => each('vertex x', w => { w[0] = x; }))) : null,
        n === 1 ? row('Y', num(v[1], y => each('vertex y', w => { w[1] = y; }))) : null,
        h('p', { class: 'ed-note' }, 'Drag a vertex onto another to weld them. Deleting a vertex takes it out of every sector it is in.'));
      return;
    }

    if (kind === 'thing') {
      const t = d.things.find(x => ids.has(x.id));
      if (!t) return;
      put(p, head(`${THING_TYPES[t.type]?.name || t.type}`),
        row('Type', h('select', { onchange: e => each('thing type', x => { x.type = e.target.value; }) },
          ...Object.entries(THING_TYPES).map(([k, tt]) => h('option', { value: k, ...(k === t.type ? { selected: true } : {}) }, tt.name)))),
        n === 1 ? row('X', num(t.x, v => each('thing x', x => { x.x = v; }))) : null,
        n === 1 ? row('Y', num(t.y, v => each('thing y', x => { x.y = v; }))) : null,
        row('Facing °', num(Math.round((t.angle || 0) * 180 / Math.PI), v => each('thing angle', x => { x.angle = v * Math.PI / 180; }), { step: 45 })),
        row('', facingButtons(a2 => each('face', x => { x.angle = a2; }))),
        ...(t.type === 'PLANT'
          ? [row('Plant', h('select', { onchange: e => each('plant kind', x => { x.kind = e.target.value; }) },
              ...PLANT_KINDS.map(k => h('option', { value: k, ...(k === t.kind ? { selected: true } : {}) }, k)))),
             row('Scale', num(t.scale ?? 1, v => each('plant scale', x => { x.scale = Math.max(0.2, Math.min(4, v)); }), { step: 0.1 }))]
          : [row('Variant', num(t.variant ?? '', v => each('thing variant', x => { x.variant = Math.max(0, Math.round(v)); })))]),
        h('p', { class: 'ed-note' }, 'In Things mode, click empty floor to place the type chosen in the Things tab. , and . turn the selection.'));
      return;
    }

    if (kind === 'prop') {
      const pr = d.props.find(x => ids.has(x.id));
      if (!pr) return;
      put(p, head(`Prop ${pr.id}`),
        h('p', { class: 'ed-note' }, 'A solid box anywhere in space — a crate, a beam, a bridge, a floating platform.'),
        h('div', { class: 'ed-row two' }, h('label', {}, 'X from / to'),
          num(pr.x0, v => each('prop x0', x => { x.x0 = v; }), { step: 8 }), num(pr.x1, v => each('prop x1', x => { x.x1 = v; }), { step: 8 })),
        h('div', { class: 'ed-row two' }, h('label', {}, 'Y from / to'),
          num(pr.y0, v => each('prop y0', x => { x.y0 = v; }), { step: 8 }), num(pr.y1, v => each('prop y1', x => { x.y1 = v; }), { step: 8 })),
        h('div', { class: 'ed-row two' }, h('label', {}, 'Bottom / top'),
          num(pr.z0, v => each('prop bottom', x => { x.z0 = v; }), { step: 8 }), num(pr.z1, v => each('prop top', x => { x.z1 = v; }), { step: 8 })),
        texField(pr.tex, 'tex', 'Sides'),
        texField(pr.topTex, 'topTex', 'Top', { allowNone: true }));
    }

    if (kind === 'scatter') put(p, ...scatterInspector(d.scatters.find(x => ids.has(x.id)), n));
  };

  /* ------------------------------------------------------------------
     A SCATTER: the rule, every dial of it, and what it grew
     ------------------------------------------------------------------ */
  const scatterInspector = (c, n) => {
    if (!c) return [];
    const g = ed.compiled?.grown?.get(c.id);
    const a = c.area;
    const total = c.items.reduce((s2, i) => s2 + (i.w || 0), 0) || 1;
    const setItems = (label, fn) => each(label, x => { fn(x.items); });
    const range = (value, min, max, step, onset) => h('input', { type: 'range', min, max, step, value, onchange: e => onset(+e.target.value) });
    return [
      h('h3', {}, `Scatter · ${c.name || c.id}`, h('small', {}, n > 1 ? `${n} selected` : '')),
      h('p', { class: 'ed-note' }, g ? `grew ${g.grown} of ${g.wanted}${g.grown < g.wanted * 0.9 ? ' — no room for the rest' : ''}` : 'growing…',
        ' · a rule, re-grown every time it changes'),
      row('Name', txt(c.name, v => each('rename scatter', x => { x.name = v; }))),
      h('h4', {}, 'Where'),
      a.kind === 'circle'
        ? h('div', { class: 'ed-row two' }, h('label', {}, 'Centre / radius'),
            h('span', { class: 'ed-note' }, `${Math.round(a.x)}, ${Math.round(a.y)}`),
            num(a.r, v => each('scatter radius', x => { if (x.area.kind === 'circle') x.area.r = Math.max(16, v); }), { step: 32 }))
        : a.kind === 'rect'
          ? h('p', { class: 'ed-note' }, `a rectangle, ${Math.abs(a.x1 - a.x0)} × ${Math.abs(a.y1 - a.y0)}`)
          : h('p', { class: 'ed-note' }, `filling ${a.ids.length} sector${a.ids.length > 1 ? 's' : ''}`),
      h('h4', {}, 'How'),
      row('Density', h('div', { style: 'display:flex;gap:6px;align-items:center' },
        range(c.density, 0, 120, 0.5, v => each('density', x => { x.density = v; })),
        num(c.density, v => each('density', x => { x.density = Math.max(0, v); }), { step: 0.5, title: 'per 1024 × 1024' }))),
      row('Spacing', num(c.spacing, v => each('spacing', x => { x.spacing = Math.max(0, v); }), { step: 8 })),
      row('Clumping', range(c.clump ?? 0, 0, 1, 0.05, v => each('clumping', x => { x.clump = v; }))),
      h('div', { class: 'ed-row two' }, h('label', {}, 'Scale min / max'),
        num(c.scaleMin ?? 1, v => each('scale', x => { x.scaleMin = v; }), { step: 0.05 }),
        num(c.scaleMax ?? 1, v => each('scale', x => { x.scaleMax = v; }), { step: 0.05 })),
      h('p', { class: 'ed-note' }, `density is things per 1024 × 1024 of floor · at most ${SCATTER_MAX} per scatter`),
      h('h4', {}, 'What'),
      ...c.items.map((it, k) => h('div', { class: 'ed-row item' },
        h('label', {}, h('i', { class: 'ed-dot', style: `background:${it.type.startsWith('PLANT:') ? plantColour(it.type.slice(6)) : THING_TYPES[it.type]?.color}` }),
          ` ${Math.round((it.w || 0) / total * 100)}%`),
        h('select', { onchange: e => setItems('scatter item', list => { if (list[k]) list[k].type = e.target.value; }) },
          ...SCATTER_TYPES.map(t => h('option', { value: t, ...(t === it.type ? { selected: true } : {}) }, typeName(t)))),
        h('div', { style: 'display:flex;gap:4px' },
          num(it.w, v => setItems('weight', list => { if (list[k]) list[k].w = Math.max(0, v); }), { step: 1, title: 'weight' }),
          h('button', { class: 'ed-btn', title: 'remove', onclick: () => setItems('remove item', list => { list.splice(k, 1); }) }, '×')))),
      h('div', { class: 'ed-small-btns' },
        h('button', { class: 'ed-btn', onclick: () => setItems('add item', list => { list.push({ type: 'SHOPPER', w: 1 }); }) }, '+ Item')),
      h('h4', {}, 'Seed'),
      h('div', { class: 'ed-small-btns' },
        h('button', { class: 'ed-btn', title: 'Roll it again: the same rule, a different spread', onclick: () => ed.reseed() }, '🎲 Reseed'),
        h('button', { class: 'ed-btn', title: 'Turn what it grew into ordinary things, and drop the rule', onclick: () => ed.bake() }, 'Bake into things'),
        h('button', { class: 'ed-btn', onclick: () => ed.emit('frameSel') }, 'Frame')),
    ];
  };

  /* ------------------------------------------------------------------
     THE TEXTURE BROWSER
     ------------------------------------------------------------------ */
  let filter = '';
  const texCells = new Map();
  const texHead = h('div');
  const mineGrid = h('div', { class: 'ed-texgrid' });
  const gameGrid = h('div', { class: 'ed-texgrid' });
  const mineHead = h('div', { class: 'ed-texsec' });
  const texFilter = h('input', { class: 'ed-texfilter', type: 'text', placeholder: 'filter textures…', oninput: e => { filter = e.target.value.toUpperCase(); renderTex(); } });
  panes.tex.append(texHead, texFilter, mineHead, mineGrid, h('div', { class: 'ed-texsec' }, h('span', {}, 'Game textures')), gameGrid);
  /* THE CELLS, made again when the map's own textures change — a new
     one, a repainted one, one gone */
  const buildCells = () => {
    texCells.clear();
    mineGrid.textContent = ''; gameGrid.textContent = '';
    const cell = (name, mine) => {
      const c = h('div', { class: 'ed-texcell' + (mine ? ' mine' : ''), title: mine ? `${name} — double-click to edit` : `${name} — double-click to make a texture from it`,
        onclick: () => pickTexture(name),
        ondblclick: () => (mine ? openTextureEditor(ed, name) : openTextureEditor(ed, null, name)) },
        swatch(ed, name, 64), h('span', {}, name));
      texCells.set(name, c);
      return c;
    };
    for (const n of ed.mapTextureNames || []) mineGrid.append(cell(n, true));
    for (const n of ed.gameTextureNames || ed.textureNames) gameGrid.append(cell(n, false));
    renderMineHead();
    if (!(ed.mapTextureNames || []).length) mineGrid.append(h('p', { class: 'ed-note' }, 'None yet. + New starts one; double-click any game texture to start from it.'));
  };
  const renderMineHead = () => {
    mineHead.textContent = '';
    mineHead.append(h('span', {}, `This map's textures (${(ed.mapTextureNames || []).length})`),
      h('span', { class: 'ed-small-btns' },
        h('button', { class: 'ed-btn', title: 'A new texture, from layers of others and your own images', onclick: () => openTextureEditor(ed, null, ui.current && ed.bank.map.has(ui.current) ? ui.current : 'GRIDWALL') }, '+ New'),
        ui.current && (ed.mapTextureNames || []).includes(ui.current)
          ? [h('button', { class: 'ed-btn', onclick: () => openTextureEditor(ed, ui.current) }, 'Edit'),
             h('button', { class: 'ed-btn', onclick: () => {
               const n = ui.current;
               ed.edit(`delete texture ${n}`, d => { d.textures = (d.textures || []).filter(t => t.name !== n); }, { tidy: false });
               ui.current = null;
             } }, 'Delete')]
          : null));
  };
  const pickTexture = name => {
    if (ui.picking) {
      const { field } = ui.picking;
      if (field === '@propTex') { ed.propTex = name; }
      else if (ed.sel.kind) each(`${field} ${name}`, x => { x[field] = name; });
      ui.picking = null;
      showTab('insp');
      renderInsp();
      ed.say(`${name}`);
      return;
    }
    ed.applyTexture(name);
    ui.current = name;
    renderTex();
  };
  const renderTex = () => {
    texHead.textContent = '';
    if (ui.picking) {
      texHead.append(h('p', { class: 'ed-note' }, `Picking the ${ui.picking.label.toLowerCase()} texture. `,
        ui.picking.allowNone ? h('button', { class: 'ed-btn', onclick: () => { const f = ui.picking.field; ui.picking = null; if (ed.sel.kind) each(`clear ${f}`, x => { delete x[f]; }); showTab('insp'); } }, 'Use none') : null,
        ' ', h('button', { class: 'ed-btn', onclick: () => { ui.picking = null; showTab('insp'); renderInsp(); } }, 'Cancel')));
    } else {
      texHead.append(h('p', { class: 'ed-note' }, ed.surf ? `Click a texture to paint the picked ${ed.surf.part}.` : 'Pick a surface in the 3D view, then click a texture to paint it — or open this from an inspector field.'));
    }
    if (!texCells.size) buildCells();
    else renderMineHead();
    for (const [name, cell] of texCells) {
      cell.style.display = !filter || name.includes(filter) ? '' : 'none';
      cell.classList.toggle('on', name === ui.current);
    }
  };
  ed.on('textures', () => { buildCells(); renderTex(); });
  renderTex();

  /* ------------------------------------------------------------------
     THE THING PALETTE
     ------------------------------------------------------------------ */
  /* THE THINGS EDITOR: what to place, everything already placed — a
     list to find and select them by, filtered by type — and what to do
     to the selection all at once */
  let thingFilter = null, thingSearch = '';
  const renderThings = () => {
    const p = panes.things;
    const keepFocus = p.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    if (keepFocus) return;
    p.textContent = '';
    const d = ed.doc;
    const count = new Map();
    for (const t of d.things) count.set(t.type, (count.get(t.type) || 0) + 1);
    const selThings = ed.sel.kind === 'thing' ? d.things.filter(t => ed.sel.ids.has(t.id)) : [];
    const eachSel = (label, fn) => ed.edit(label, dd => { for (const t of dd.things) if (ed.sel.ids.has(t.id)) fn(t); }, { tidy: false });
    put(p, 
      h('h4', { class: 'ed-sub0' }, 'Place'),
      h('p', { class: 'ed-note' }, 'Pick a type, then click the floor in Things mode (T) — on the plan or in 3D.'),
      h('div', { class: 'ed-things' }, ...Object.entries(THING_TYPES).filter(([k]) => k !== 'PLANT').map(([k, t]) =>
        h('button', { class: k === ed.thingType ? 'on' : '', onclick: () => { ed.thingType = k; ed.setMode('things'); renderThings(); } },
          h('i', { style: `background:${t.color}` }), t.name))),
      h('h4', { class: 'ed-sub' }, 'Plants — sprite decorations'),
      h('div', { class: 'ed-plants' }, ...PLANT_KINDS.map(k =>
        h('button', { class: ed.thingType === 'PLANT' && ed.plantKind === k ? 'on' : '', title: k,
          onclick: () => { ed.thingType = 'PLANT'; ed.plantKind = k; ed.setMode('things'); renderThings(); } },
          h('img', { src: `assets/forest/${k}.png`, alt: '' }), h('span', {}, k.replace(/_/g, ' '))))),
    );
    if (selThings.length) {
      put(p, h('h4', { class: 'ed-sub' }, `The selection (${selThings.length})`),
        h('div', { class: 'ed-row' }, h('label', {}, 'Face'), facingButtons(a2 => eachSel('face', t => { t.angle = a2; }))),
        h('div', { class: 'ed-row' }, h('label', {}, 'Change to'), h('select', { onchange: e => { if (e.target.value) eachSel('change type', t => { t.type = e.target.value; if (t.type === 'PLANT' && !t.kind) t.kind = ed.plantKind; }); } },
          h('option', { value: '' }, '…'), ...Object.entries(THING_TYPES).map(([k, t]) => h('option', { value: k }, t.name)))),
        h('div', { class: 'ed-small-btns' },
          h('button', { class: 'ed-btn', onclick: () => eachSel('random facing', t => { t.angle = +(Math.random() * Math.PI * 2).toFixed(3); }) }, 'Random facing'),
          h('button', { class: 'ed-btn', onclick: () => eachSel('random variant', t => { t.variant = (Math.random() * 64) | 0; }) }, 'Random variant'),
          h('button', { class: 'ed-btn', onclick: () => eachSel('snap to grid', t => { t.x = ed.snapV(t.x); t.y = ed.snapV(t.y); }) }, 'Snap to grid'),
          h('button', { class: 'ed-btn', onclick: () => { const types = new Set(selThings.map(t => t.type)); ed.select('thing', d.things.filter(t => types.has(t.type)).map(t => t.id)); } }, 'Select all of this type'),
          h('button', { class: 'ed-btn', onclick: () => ed.deleteSel() }, 'Delete')));
    }
    /* everything placed, to find it by */
    const table = h('div', { class: 'ed-thingtable' });
    const fillTable = () => {
      table.textContent = '';
      const shown = d.things.filter(t => (!thingFilter || t.type === thingFilter) &&
        (!thingSearch || `${t.type} ${t.kind || ''} ${t.id}`.toUpperCase().includes(thingSearch)));
      table.append(...shown.slice(0, 300).map(t => h('div', { class: 'ed-listrow' + (ed.isSel('thing', t.id) ? ' on' : ''),
          onclick: e => { ed.setMode('things'); ed.select('thing', [t.id], e.shiftKey); if (!e.shiftKey) ed.emit('frameSel'); } },
          h('span', {}, h('i', { class: 'ed-dot', style: `background:${t.type === 'PLANT' ? plantColour(t.kind) : THING_TYPES[t.type]?.color}` }),
            ` ${t.type === 'PLANT' ? (t.kind || 'plant').replace(/_/g, ' ') : THING_TYPES[t.type]?.name || t.type}`),
          h('small', {}, `${Math.round(t.x)}, ${Math.round(t.y)} · ${Math.round(((t.angle || 0) * 180 / Math.PI) % 360)}°`))),
        shown.length > 300 ? h('p', { class: 'ed-note' }, `and ${shown.length - 300} more — filter to find them`) : '');
    };
    fillTable();
    put(p, h('h4', { class: 'ed-sub' }, `In this map (${d.things.length})`),
      h('div', { class: 'ed-chips' },
        h('button', { class: !thingFilter ? 'on' : '', onclick: () => { thingFilter = null; renderThings(); } }, `all ${d.things.length}`),
        ...[...count].sort((x, y) => y[1] - x[1]).map(([k, n]) => h('button', { class: thingFilter === k ? 'on' : '', onclick: () => { thingFilter = k; renderThings(); } },
          h('i', { style: `background:${THING_TYPES[k]?.color || '#f0f'}` }), `${THING_TYPES[k]?.name || k} ${n}`))),
      h('input', { class: 'ed-texfilter', type: 'text', placeholder: 'find…', value: thingSearch,
        oninput: e => { thingSearch = e.target.value.toUpperCase(); fillTable(); } }),
      table,
      h('p', { class: 'ed-note' }, 'Things grown by scatters are not listed: bake a scatter to list them.'));
  };
  renderThings();

  /* ------------------------------------------------------------------
     THE MAP: its name, the world round it, and what is wrong with it
     ------------------------------------------------------------------ */
  const setWorld = (label, fn) => ed.edit(label, d => { d.world = d.world || {}; fn(d.world); }, { tidy: false });
  const renderMap = () => {
    const p = panes.map;
    p.textContent = '';
    const d = ed.doc;
    const w = d.world || {};
    const sky = w.sky || {};
    const colour = (k, label) => h('div', { class: 'ed-row' }, h('label', {}, label),
      h('input', { type: 'color', value: sky[k] || '#000000', onchange: e => setWorld(`sky ${k}`, ww => { ww.sky = { ...(ww.sky || {}), [k]: e.target.value }; }) }));
    const probs = [...problemsOf(d), ...(ed.compiled?.problems || [])];
    const seen = new Set();
    const uniq = probs.filter(x => (seen.has(x.msg) ? false : seen.add(x.msg)));
    put(p, h('h3', {}, 'Map'),
      row('Name', txt(d.name, v => ed.edit('rename map', dd => { dd.name = v; }, { tidy: false }))),
      h('h4', {}, 'World'),
      row('Nothing burns', chk(w.noBurn, v => setWorld('noBurn', ww => { ww.noBurn = v; }))),
      row('No responders', chk(w.noSquads, v => setWorld('noSquads', ww => { ww.noSquads = v; }))),
      row('Doom sky walls', chk(w.skyWalls, v => setWorld('skyWalls', ww => { if (v) ww.skyWalls = true; else delete ww.skyWalls; }))),
      h('p', { class: 'ed-note' }, 'Off (the default): an open world — a roofed room under the sky has a roof and no wall running up to the sky. On: Doom\'s way, the upper wall goes up to the sky height.'),
      h('h4', {}, 'Sky'),
      colour('horizon', 'Horizon'), colour('mid', 'Middle'), colour('zenith', 'Overhead'), colour('ground', 'Below'),
      h('p', { class: 'ed-note' }, 'The sky is re-baked in the 3D view as you change it.'),
      h('h4', {}, `Problems (${uniq.length})`),
      uniq.length ? h('div', {}, ...uniq.map(x => h('div', { class: 'ed-prob', onclick: () => {
        if (x.id !== undefined && x.kind === 'sector') { ed.setMode('sectors'); ed.select('sector', [x.id]); ed.emit('frameSel'); }
      } }, x.msg))) : h('div', { class: 'ed-ok' }, 'None. The map will build.'),
      h('h4', {}, 'Counts'),
      h('p', { class: 'ed-note' }, `${d.sectors.length} sectors · ${ed.lines().length} lines · ${d.vertices.length} vertices · ${d.things.length} things · ${d.props.length} props`));
  };

  /* ------------------------------------------------------------------
     WIRING
     ------------------------------------------------------------------ */
  const inspFocused = () => panes.insp.contains(document.activeElement) || panes.map.contains(document.activeElement);
  ed.on('sel', () => { refreshBar(); if (!ui.picking) renderInsp(); renderTex(); if (ui.tab === 'things') renderThings(); });
  ed.on('mode', refreshBar);
  ed.on('grid', refreshBar);
  ed.on('layout', refreshBar);
  let thingsT = 0;
  ed.on('doc', () => {
    if (!inspFocused()) { renderInsp(); if (ui.tab === 'map') renderMap(); }
    if (ui.tab === 'things') { clearTimeout(thingsT); thingsT = setTimeout(renderThings, 150); }
  });
  ed.on('compiled', c => {
    if (ed.sel.kind === 'scatter' && !inspFocused()) renderInsp();
    if (ui.tab === 'scatter') renderScatter();
    const n = c.problems.length;
    st.probs.innerHTML = n ? `<span class="bad">${n} problem${n > 1 ? 's' : ''}</span>` : '';
    if (ui.tab === 'map' && !inspFocused()) renderMap();
  });
  ed.on('status', msg => { st.msg.textContent = msg; });
  refreshBar();
  renderInsp();
  return ui;
}

const HELP2D = {
  vertices: 'click select · drag move · shift add · Del delete\nwheel zoom · RMB/MMB pan · [ ] grid',
  lines: 'click select · drag move · Del joins sectors\nwheel zoom · RMB/MMB pan · [ ] grid',
  sectors: 'click select · drag move · dbl-click inspect\nwheel zoom · RMB/MMB pan · [ ] grid',
  things: 'click empty to place · drag move · , . turn\nwheel zoom · RMB/MMB pan',
  props: 'drag empty to draw a box · drag to move\nwheel zoom · RMB/MMB pan',
  draw: 'click points · click the first to close · Enter close\nBackspace undo point · Esc cancel',
  rect: 'drag a rectangle into a new sector\nEsc cancel',
};

function typeName(t) {
  if (t.startsWith('PLANT:')) return `plant: ${t.slice(6).replace(/_/g, ' ')}`;
  return THING_TYPES[t]?.name || t;
}

/* SECTOR MOODS: whole Doom 64 colour sets, one click each */
const MOODS = {
  'Warm lamp':  { floor: '#ffd9a0', ceil: '#ffe8c0', thing: '#ffe0b0', top: '#ffd08a', bottom: '#8a5a30' },
  'Cold light': { floor: '#a8c8ff', ceil: '#c8dcff', thing: '#b8d0ff', top: '#d0e4ff', bottom: '#40507a' },
  'Toxic':      { floor: '#8aff6a', ceil: '#60c050', thing: '#a0ff80', top: '#50ff40', bottom: '#103a10' },
  'Blood':      { floor: '#ff5040', ceil: '#a02018', thing: '#ff7060', top: '#ff3020', bottom: '#300808' },
  'Hell':       { floor: '#ff9030', ceil: '#401000', thing: '#ffb060', top: '#200800', bottom: '#ff6010' },
  'Night':      { floor: '#404a70', ceil: '#202840', thing: '#6070a0', top: '#303a60', bottom: '#101420' },
  'Violet':     { floor: '#c090ff', ceil: '#6030a0', thing: '#d0a0ff', top: '#a060ff', bottom: '#200840' },
};
