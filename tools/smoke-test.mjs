/* =====================================================================
   GROCERY STORE SIMULATOR — smoke test
   =====================================================================

   node tools/smoke-test.mjs

   No install, no browser. Everything that is not WebGL is checked here:
   the palette, the texture and sprite bakeries, the map, the collision,
   the state tables and the fire grid.

   The checks earn their place by having caught something. Each one below
   corresponds to a bug that reached a screenshot before it was found:

     - a sprite whose art wrapped around the edge of its own canvas, so
       a forearm drawn off the bottom appeared in the sky
     - a monster state naming a frame letter the bakery never made, so
       the Stocker's pain frame did not exist
     - a wall texture chosen by which sector was DECLARED first, so an
       aisle had shelving down one side and blank plaster down the other
     - a move long enough to step clean through a wall without any test
       noticing it had been there

   A test suite for a game is mostly worthless — you cannot assert that
   something is fun. But every one of those was a data error with a
   correct answer, and every one of them is cheaper to catch here.
   ===================================================================== */

import { register } from 'node:module';
register('./loader.mjs', import.meta.url);

/* Enough of a canvas for Pix.toCanvas to succeed, which is the only DOM
   call anywhere in the bakeries. With this the test can build a real
   TextureBank, a real SpriteBank and a real Game, and exercise the
   game's OWN lighting code rather than a copy of it kept in step by
   hand — which is the kind of copy that drifts and then passes while the
   game is broken. */
globalThis.document = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData() {},
    }),
  }),
};

let pass = 0, fail = 0;
const problems = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; return true; }
  fail++; problems.push(`${name}${detail ? ' — ' + detail : ''}`);
  return false;
}
const section = s => console.log(`\n  ${s}\n  ${'-'.repeat(s.length)}`);
const note = (k, v) => console.log(`    ${k.padEnd(34)} ${v}`);

/* ---------- palette ---------- */
section('palette');
const pal = await import('../js/palette.js');
check('256 entries', pal.PALETTE.length === 256, `got ${pal.PALETTE.length}`);
check('every entry is 3 bytes', pal.PALETTE.every(c => c.length === 3 && c.every(v => v >= 0 && v <= 255)));
check('fire ramp runs dark to light',
  pal.ramp('fire', 0)[0] < 20 && pal.ramp('fire', 1)[0] > 240);
check('ramps are monotonic in luma', ['grey', 'red', 'blue', 'fire'].every(k => {
  let last = -1;
  for (let i = 0; i <= 10; i++) {
    const c = pal.ramp(k, i / 10);
    const l = c[0] * 0.3 + c[1] * 0.6 + c[2] * 0.1;
    if (l < last - 2) return false;
    last = l;
  }
  return true;
}));
{
  const t0 = Date.now();
  const atlas = pal.buildLutAtlas();
  note('lut atlas', `${atlas.width}x${atlas.height} in ${Date.now() - t0}ms`);
  check('lut is the right size', atlas.data.length === atlas.width * atlas.height * 4);
  const N = pal.LUT_SIZE, W = atlas.width;
  const look = (r, g, b) => {
    const R = Math.round(r / 255 * (N - 1)), G = Math.round(g / 255 * (N - 1)), B = Math.round(b / 255 * (N - 1));
    const o = ((G * W) + (B * N + R)) * 4;
    return [atlas.data[o], atlas.data[o + 1], atlas.data[o + 2]];
  };
  check('lut snaps to real palette entries',
    [[255, 255, 255], [0, 0, 0], [255, 140, 20], [90, 90, 100]].every(c => {
      const s = look(...c);
      return pal.PALETTE.some(p => p[0] === s[0] && p[1] === s[1] && p[2] === s[2]);
    }));
}

/* ---------- the pixel toolkit ---------- */
section('pixel toolkit');
const pix = await import('../js/pixel.js');
{
  const n = pix.valueNoise(64, 64, 8, 42);
  let edge = 0, interior = 0;
  for (let y = 0; y < 64; y++) {
    edge = Math.max(edge, Math.abs(n[y * 64 + 63] - n[y * 64]));
    for (let x = 1; x < 64; x++) interior = Math.max(interior, Math.abs(n[y * 64 + x] - n[y * 64 + x - 1]));
  }
  check('value noise tiles', edge <= interior * 1.1, `edge jump ${edge.toFixed(3)} vs ${interior.toFixed(3)}`);

  /* the wrap/clip distinction, which is the bug that put a forearm in
     the sky */
  const wrapping = new pix.Pix(16, 16, 1, true);
  wrapping.ink(20, 20, 'red', 1);
  check('a wrapping surface wraps', wrapping.alphaAt(4, 4) > 0);
  const clipping = new pix.Pix(16, 16, 1, false);
  clipping.ink(20, 20, 'red', 1);
  clipping.ink(-3, 8, 'red', 1);
  let any = 0;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (clipping.alphaAt(x, y) > 0) any++;
  check('a clipping surface discards', any === 0, `${any} stray pixels`);
}

/* ---------- textures ---------- */
section('textures');
const tex = await import('../js/textures.js');
{
  const names = Object.keys(tex.TEXTURE_GENERATORS);
  note('generators', names.length);
  let opaque = 0, sized = 0;
  const t0 = Date.now();
  for (const n of names) {
    const p = tex.TEXTURE_GENERATORS[n]();
    if (!check(`${n} produces pixels`, p && p.w > 0 && p.h > 0)) continue;
    check(`${n} is 64px or under`, p.w <= 64 && p.h <= 64, `${p.w}x${p.h}`);
    let a = 0;
    for (let i = 3; i < p.data.length; i += 4) if (p.data[i] > 8) a++;
    if (a === p.w * p.h) opaque++;
    sized++;
  }
  note('baked', `${sized} in ${Date.now() - t0}ms, ${opaque} fully opaque`);
}

/* ---------- sprites and states ---------- */
section('sprites and states');
const spr = await import('../js/sprites.js');
const st = await import('../js/states.js');
{
  const bank = spr.bakeSprites();
  note('sprite frames', bank.frames.size);

  check('every state points at a state that exists',
    Object.values(st.STATES).every(s => !s.next || st.STATES[s.next]),
    Object.values(st.STATES).filter(s => s.next && !st.STATES[s.next]).map(s => s.name).join(', '));

  check('every actor type names states that exist',
    Object.entries(st.ACTORS).every(([, a]) =>
      ['spawn', 'see', 'pain', 'melee', 'missile', 'death', 'xdeath'].every(k => !a[k] || st.STATES[a[k]])));

  /* THE ONE. A state naming a frame the bakery never drew renders as the
     missing-sprite placeholder, in the middle of a fight, once.

     VARIANTS make this less obvious than it looks. An actor with
     `variants: n` never draws the sprite its state names: Actor.render
     takes the first three letters and appends the variant, so the state
     SHOP/A is drawn as SHO0A through SHO16A and the key SHOPA is in no
     bank anywhere. So the variant bases are collected off the ACTORS
     first, and a state on one of them has to satisfy EVERY variant —
     which is the check that actually matters, since a missing sixteenth
     shopper would otherwise show up as one magenta person in a crowd. */
  const variantOf = new Map();
  for (const info of Object.values(st.ACTORS))
    if (info.variants) variantOf.set(st.STATES[info.spawn].sprite.slice(0, 3), info.variants);
  const missing = [];
  for (const [n, s] of Object.entries(st.STATES)) {
    const base = s.sprite.slice(0, 3);
    const keys = variantOf.has(base)
      ? Array.from({ length: variantOf.get(base) }, (_, v) => base + v + s.frame)
      : [s.sprite + s.frame];
    for (const key of keys) if (!bank.frames.has(key)) missing.push(`${n} wants ${key}`);
  }
  check('every state has the sprite frame it names', missing.length === 0, missing.join(', '));
  note('sprite sets with variants',
    [...variantOf].map(([b, n]) => `${b}0..${b}${n - 1}`).join(', '));

  check('every frame has all eight rotations',
    [...bank.frames.values()].every(f => f.views.length === 8 && f.views.every(v => v && v.w > 0)));

  check('sprites are 64px or under',
    [...bank.frames.values()].every(f => f.views[0].w <= 64 && f.views[0].h <= 64));

  /* ---------- the fire, which the game draws itself -------------------

     Three things are worth holding to a number here, because all three
     were wrong before and none of them announces itself:

       THE BOTTOM IS ROUND. Measured the only way that means anything —
       the lowest lit row of every COLUMN. A flame with a flat foot has
       every column ending on the same row, whatever its silhouette does
       from the sides, and that is exactly what the painted strips did
       and what masking them could not fix. So: how far the bottom edge
       rises from the deepest column to the shallowest, against how wide
       the flame is. The old strips scored 0.04 of their width. Anything
       at or under about a tenth is a flat bottom with the corners taken
       off.

       IT LOOPS. The last frame hands back to the first for the whole
       time something is alight, which is most of the game. If the wrap
       moves more than an ordinary step does, that is a pop, and it is
       the one animation fault a player will notice every second.

       NOTHING IS CLIPPED BY ITS OWN CELL. A lick that runs off the side
       of the frame is a vertical straight edge on a fire — the same
       fault as the flat bottom, turned ninety degrees — and one that
       runs off the bottom loses the round foot that is the point. The
       top is allowed: that is where the licks go. */
  {
    const art = await import('../js/fireart.js');
    const sets = {
      FIRE: art.fireFrames(32, 48, art.FIRE_FRAMES, 7),
      BLAZ: art.fireFrames(48, 64, art.BLAZE_FRAMES, 19, { taper: 0.8 }),
      EMBR: art.fireFrames(20, 28, art.EMBER_FRAMES, 31, { taper: 0.62 }),
      wood: art.fireFrames(64, 64, 20, 11, { taper: 0.7 }),
    };
    let flattest = 9, edged = 0, worstWrap = 0;
    for (const fr of Object.values(sets)) {
      for (const f of fr) {
        for (let y = 0; y < f.h; y++)
          for (let x = 0; x < f.w; x++)
            if (f.data[(y * f.w + x) * 4 + 3] >= 8 && (x === 0 || x === f.w - 1 || y === f.h - 1)) edged++;
        const low = [];
        for (let x = 0; x < f.w; x++) {
          let b = -1;
          for (let y = f.h - 1; y >= 0; y--) if (f.data[(y * f.w + x) * 4 + 3] >= 128) { b = y; break; }
          low.push(b);
        }
        const lit = low.filter(v => v >= 0);
        if (lit.length) flattest = Math.min(flattest, (Math.max(...lit) - Math.min(...lit)) / lit.length);
      }
      /* how far the picture moves between one frame and the next, all
         the way round, including from the last back to the first */
      const step = [];
      for (let i = 0; i < fr.length; i++) {
        const a = fr[i], b = fr[(i + 1) % fr.length];
        let d = 0;
        for (let k = 0; k < a.data.length; k += 4)
          d += Math.abs(a.data[k] * a.data[k + 3] - b.data[k] * b.data[k + 3]);
        step.push(d);
      }
      const wrap = step[step.length - 1];
      const mid = step.slice(0, -1).sort((a, b) => a - b)[step.length >> 1];
      worstWrap = Math.max(worstWrap, wrap / mid);
    }
    note('round bottom, worst frame', `edge rises ${(flattest * 100).toFixed(0)}% of the flame's width`);
    note('the loop closes', `the wrap moves ${worstWrap.toFixed(2)}x what a middling frame does`);
    check('the bottom of every flame is round, not narrowed and flat', flattest > 0.18, flattest.toFixed(3));
    check('the last frame hands back to the first without a pop', worstWrap < 1.6, worstWrap.toFixed(2));
    check('no flame touches the side or the bottom of its own cell', edged === 0, String(edged));
    check('every colour in the fire is already one of the 256',
      Object.values(sets).every(fr => fr.every(f => {
        for (let i = 0; i < f.data.length; i += 4) {
          if (f.data[i + 3] < 8) continue;
          if (!pal.PALETTE.some(c => c[0] === f.data[i] && c[1] === f.data[i + 1] && c[2] === f.data[i + 2])) return false;
        }
        return true;
      })));
    /* The bank and the state tables both build on these, from opposite
       ends; if they disagree the fire either skips frames or asks for a
       letter nobody drew. */
    check('the bank holds every frame js/fireart.js says it does',
      bank.count('FIRE') === art.FIRE_FRAMES && bank.count('BLAZ') === art.BLAZE_FRAMES
      && bank.count('EMBR') === art.EMBER_FRAMES);
    check('and the state chains are exactly that long',
      [['FIRE', art.FIRE_FRAMES], ['BLAZ', art.BLAZE_FRAMES], ['EMBR', art.EMBER_FRAMES]].every(([n, k]) =>
        st.STATES[`${n}${k}`] && st.STATES[`${n}${k}`].next === `${n}1` && !st.STATES[`${n}${k + 1}`]));
  }

  /* ---------- the people, who are the one thing a person drew ---------

     Four strips of painted art in assets/people, written by
     tools/prep-people.mjs out of the galvarius project. They are files
     rather than code, so the checks are about the files: that every one
     is there, that its cells are exactly the size js/people.js declares,
     and that the number of cells is the number the tables are built on.
     Get any of those wrong and the game cuts a shopper in half at load
     time and says nothing about it. */
  {
    const ppl = await import('../js/people.js');
    const { readPNG } = await import('./png-read.mjs');
    const dir = new URL('../assets/people/', import.meta.url);
    const want = [
      ['shoppers', ppl.CELLS.shoppers, ppl.SHOPPERS],
      ['giblets',  ppl.CELLS.giblets,  ppl.GIBLETS],
      ['splat',    ppl.CELLS.splat,    ppl.SPLATS],
      ['blast',    ppl.CELLS.blast,    ppl.BLASTS],
    ];
    for (const [name, cell, count] of want) {
      let img = null;
      try { img = readPNG(new URL(name + '.png', dir)); } catch { /* reported below */ }
      check(`assets/people/${name}.png is there`, !!img);
      if (!img) continue;
      check(`${name}.png is ${count} cells of ${cell.w}x${cell.h}`,
        img.h === cell.h && img.w === cell.w * count, `${img.w}x${img.h}`);
    }

    /* And that the game's own loader puts them where the tables look.
       stripFrames is what the browser runs, so running it here is the
       same cut, on the same bytes. */
    const shoppers = readPNG(new URL('shoppers.png', dir));
    const n = ppl.addStandees(bank, shoppers);
    check('every shopper loads into the bank', n === ppl.SHOPPERS, `${n} of ${ppl.SHOPPERS}`);
    const splats = ppl.addSplats(bank, readPNG(new URL('splat.png', dir)));
    check('every splat loads into the bank', splats === ppl.SPLATS, `${splats} of ${ppl.SPLATS}`);

    /* the painted people are allowed to be taller than 64 the way the
       fire strips are, but not by accident: they are people, and a
       person is the height of a person */
    const tall = [...Array(ppl.SHOPPERS).keys()].map(v => bank.frames.get(`SHO${v}A`).h);
    check('the shoppers are all one cell tall', tall.every(h => h === ppl.CELLS.shoppers.h),
      [...new Set(tall)].join(', '));

    /* seventeen drawings, not one drawing seventeen times */
    const px = v => { const p = bank.frames.get(`SHO${v}A`).views[0]; let c = 0;
                      for (let i = 3; i < p.data.length; i += 4) if (p.data[i] > 8) c++; return c; };
    const counts = [...Array(ppl.SHOPPERS).keys()].map(px);
    check('the shoppers are different people', new Set(counts).size >= ppl.SHOPPERS - 1,
      `${new Set(counts).size} distinct silhouettes`);
    note('shopper silhouettes', `${Math.min(...counts)}..${Math.max(...counts)} lit pixels`);
  }

  const w = spr.bakeWeapons();
  note('weapon frames', w.size);
  check('weapon frames all present',
    ['CUTGA', 'CUTGB', 'CUTGC', 'FLMGA', 'FLMGB', 'FLMGC', 'MOLGA', 'MOLGB', 'MOLGC'].every(k => w.has(k)));
}

/* ---------- the map ---------- */
section('the map');
const MAP = await import('../js/maps/sellwrong.js');
const { buildSellWrong } = MAP;
const level = buildSellWrong();
{
  note('sectors / lines / vertices', `${level.sectors.length} / ${level.lines.length} / ${level.verts.length}`);
  note('things', level.things.length);

  /* Lamps are laid on a grid over the whole map and the ones that miss
     the building are dropped when the level is populated, so they are
     the one thing allowed to start outside a sector. */
  const placed = level.things.filter(t => t.type !== 'LAMP');
  check('every thing stands in a sector',
    placed.every(t => level.sectorAt(t.x, t.y)),
    placed.filter(t => !level.sectorAt(t.x, t.y)).map(t => `${t.type}@${t.x},${t.y}`).join(' '));

  check('there is a start', level.things.some(t => t.type === 'START'));

  /* THE CARS ARE DATA, NOT THINGS. The placeholder cars are gone and what
     is left is a list of slots for real models to be put at. The point of
     the list is that it came off the same pitch that drew the bay lines,
     so every slot is IN a bay rather than near one — which is worth
     checking, because it is the only property of it that is hard to see
     and easy to break. */
  {
    const slots = level.carSlots || [];
    note('parking slots', slots.length);
    check('the lot has cars marked out', slots.length > 40, `${slots.length}`);
    check('nothing is still spawning placeholder cars',
      !level.things.some(t => t.type === 'CAR'));
    const shape = slots.every(c =>
      typeof c.x === 'number' && typeof c.y === 'number' &&
      typeof c.angle === 'number' && Number.isInteger(c.variant));
    check('every slot is a position, a heading and a variant', shape);
    const stray = slots.filter(c => {
      const sec = level.sectorAt(c.x, c.y);
      return !sec || (sec.name !== 'bays' && sec.name !== 'fire lane');
    });
    check('every car is parked in a bay',
      stray.length === 0,
      stray.slice(0, 4).map(c => {
        const sec = level.sectorAt(c.x, c.y);
        return `${c.x | 0},${c.y | 0} in ${sec ? sec.name : 'nothing'}`;
      }).join(' '));
  }

  /* CAN YOU ACTUALLY GET THERE.

     A flood fill from the player's start through every line he could walk
     through, and then a demand that it reached everywhere. This exists
     because the parade was once laid out with `ANCHOR_X0 - WALL - n *
     (UNIT_W + WALL)`, which counts the wall beside the anchor twice and
     leaves a sixteen-unit void between the west wing and the store. A
     void is a wall, so half the strip mall was sealed off — and nothing
     complained, because a level with an unreachable half is a perfectly
     valid level. It surfaced as the fire spreading three thousand units
     east and refusing to go west at all, which is a long way from the
     constant that caused it.

     The rule is Doom's own passability, so this is not a second opinion
     about what a wall is; it is the game's opinion, asked at build time. */
  {
    const start = level.things.find(t => t.type === 'START');
    const from = level.sectorAt(start.x, start.y);
    const seen = new Set([from.index]);
    const queue = [from.index];
    /* which lines touch which sector, once */
    const byS = new Map();
    for (const l of level.lines) for (const si of [l.front, l.back]) {
      if (si === null) continue;
      if (!byS.has(si)) byS.set(si, []);
      byS.get(si).push(l);
    }
    while (queue.length) {
      const si = queue.pop();
      for (const l of byS.get(si) || []) {
        const other = l.front === si ? l.back : l.front;
        if (other === null || seen.has(other)) continue;
        /* stepping from this sector's floor, at player height */
        if (level.lineBlocks(l, level.sectors[si].floor, 56, false)) continue;
        seen.add(other); queue.push(other);
      }
    }
    note('rooms you can walk to', `${seen.size}/${level.sectors.length}`);

    /* Asking "is every room reachable" is the wrong question — a checkout
       is a sector and you are not meant to be on it. The question with an
       answer is: is everything the level ASKS you to reach, reachable.
       Every can of fuel, and every member of staff. Both of those are
       things the map placed deliberately, so one stranded behind a wall
       is unambiguously a bug and never a fixture. */
    const mustReach = level.things.filter(t =>
      t.type === 'FUELCAN' || t.type === 'ASSOCIATE' || t.type === 'STOCKER');
    const stranded = mustReach.filter(t => {
      const s = level.sectorAt(t.x, t.y);
      return !s || !seen.has(s.index);
    });
    check('every fuel can and every member of staff can be reached on foot',
      stranded.length === 0,
      stranded.slice(0, 6).map(t => `${t.type}@${t.x | 0},${t.y | 0}`).join(' ') +
      (stranded.length > 6 ? ` (+${stranded.length - 6})` : ''));
  }

  check('no sector is inside out', level.sectors.every(s => {
    let a = 0;
    for (let i = 0, j = s.poly.length - 1; i < s.poly.length; j = i++)
      a += s.poly[j][0] * s.poly[i][1] - s.poly[i][0] * s.poly[j][1];
    return a > 0;
  }));

  check('every sector has a floor below its ceiling',
    level.sectors.every(s => s.ceil >= s.floor));

  check('every two-sided line has both its skins',
    level.lines.every(l => l.front === null || l.back === null ||
      (l.upper !== undefined && l.lower !== undefined)));

  /* the bug where an aisle had shelving on one side only */
  const shelfLines = level.lines.filter(l => l.lower === 'SHELFSTK').length;
  check('gondola faces got the gondola texture', shelfLines >= 20, `${shelfLines} lines`);
  const glass = level.lines.filter(l => l.middle === 'STORGLAS').length;
  check('the shopfront is glazed', glass >= 2, `${glass} segments`);

  /* A gondola you can see over is not an aisle, it is a low wall. The
     player is 56 with an eye at 41; anything at 56 exactly is the least
     useful height there is. */
  check('gondolas are taller than the player', MAP.H_GONDOLA > 56, `${MAP.H_GONDOLA}`);
  check('front fixtures are below eye level', MAP.H_FIXTURE < 41, `${MAP.H_FIXTURE}`);
  const gond = level.sectors.find(s => s.name === 'gondola');
  check('gondola sectors are at that height', gond && gond.floor === MAP.H_GONDOLA);

  /* A fixture texture whose declared world height does not match the
     fixture shows a slice of a second copy of itself, cut off wherever
     the fixture happens to end. */
  const declared = { SHELFSTK: MAP.H_GONDOLA, SHELFEMP: MAP.H_GONDOLA, FREEZDOR: MAP.H_GONDOLA,
                     CHECKOUT: MAP.H_FIXTURE, CHILLER: MAP.H_FIXTURE,
                     PRODUCE: MAP.H_FIXTURE, DELICASE: MAP.H_FIXTURE };
  const mismatched = Object.entries(declared)
    .filter(([n, h]) => (tex.TEXTURE_SIZES[n] || {}).h !== h)
    .map(([n, h]) => `${n} declared ${(tex.TEXTURE_SIZES[n] || {}).h} wants ${h}`);
  check('fixture textures are sized to their fixtures', mismatched.length === 0, mismatched.join(', '));

  /* the lights */
  const lamps = level.things.filter(t => t.type === 'LAMP');
  check('the ceiling has fittings in it', lamps.length > 30, `${lamps.length} placed`);
  const indoors = lamps.filter(t => { const s = level.sectorAt(t.x, t.y); return s && !s.outdoor && s.ceil >= 200; });
  note('lamps placed / kept', `${lamps.length} / ${indoors.length}`);
  check('most of the shop gets a fitting', indoors.length > 30, `${indoors.length} kept`);
  check('the ceiling texture spans four tiles', (tex.TEXTURE_SIZES.CEILFIT || {}).w === 256);

  /* THE SIGN HAS TO BE THE SHAPE OF THE LOGO. The four tiles are a
     square 128x128 cut from artwork that was not square, so the aspect
     lives in the geometry: get the sign box wrong and the logo is
     stretched, and nothing else in the game will say so. */
  {
    const art = await import('../js/art-data.js');
    const signAspect = MAP.SIGN_W / MAP.SIGN_H;
    check('the sign box is the shape of the artwork',
      Math.abs(signAspect - art.LOGO_ASPECT) < 0.02,
      `sign ${signAspect.toFixed(3)} vs art ${art.LOGO_ASPECT.toFixed(3)}`);
    check('each logo tile is half the sign',
      (tex.TEXTURE_SIZES.LOGO0 || {}).w === MAP.SIGN_W / 2 &&
      (tex.TEXTURE_SIZES.LOGO0 || {}).h === MAP.SIGN_H / 2);
    check('the logo is four tiles', art.LOGO_TILES.length === 4);
    /* The weapon reserves the top of its frame for the muzzle flame; if
       that ever became zero the flame would be drawn off-frame. */
    check('the weapon leaves room for its own flame',
      art.WEAPON_TOP > 8 && art.WEAPON_TOP < 48, `${art.WEAPON_TOP} rows`);
  }

  /* fuel has to be laid out as a shop or the fire has no shape */
  const fuelOf = n => level.sectors.filter(s => s.name === n).reduce((a, s) => a + s.fuel, 0) /
                      Math.max(1, level.sectors.filter(s => s.name === n).length);
  note('fuel: gondola / aisle / car park', `${fuelOf('gondola')} / ${fuelOf('aisle')} / ${fuelOf('car park')}`);
  check('gondolas hold far more fuel than the aisles', fuelOf('gondola') > fuelOf('aisle') * 4);
  check('the car park will not burn', fuelOf('car park') === 0);
}

/* ---------- lighting ---------- */
section('lighting');
{
  /* A REAL Game, with the real lamps and the real relight(). */
  const { Game } = await import('../js/game.js');
  const bank = tex.bakeTextures();
  const sprBank = spr.bakeSprites();
  const fakeHud = { message() {}, ticMessages() {} };
  const g = new Game({
    level, scene: new (await import('three')).Scene(), camera: {},
    textures: bank, sprites: sprBank, hud: fakeHud, audio: null,
    input: { sample() {} },
  });
  note('lamps kept', g.lamps.length);
  check('the ceiling has working fittings', g.lamps.length > 30, `${g.lamps.length}`);

  const shop = level.sectors.filter(s => !s.outdoor && s.ceil >= 200);
  const avg = shop.reduce((a, s) => a + s.light, 0) / shop.length;
  const lo = Math.min(...shop.map(s => s.light));
  note('shop light: average / darkest', `${avg.toFixed(2)} / ${lo.toFixed(2)}`);
  check('the shop is lit by its fittings', avg > 0.55 && avg < 0.98, `average ${avg.toFixed(2)}`);
  check('nothing indoors is left pitch dark', lo > 0.30, `darkest ${lo.toFixed(2)}`);
  check('the light is not all clamped to full',
    shop.filter(s => s.light >= 0.999).length < shop.length * 0.5,
    `${shop.filter(s => s.light >= 0.999).length} of ${shop.length} at full`);

  /* Shoot out everything over one aisle and it must actually go dark. */
  const aisle = shop.find(s => s.name === 'aisle');
  const cx = (aisle.bbox[0] + aisle.bbox[2]) / 2, cy = (aisle.bbox[1] + aisle.bbox[3]) / 2;
  const before = aisle.light;
  let killed = 0;
  for (const l of g.lamps) {
    if (Math.hypot(l.x - cx, l.y - cy) > 380) continue;
    l.damage(50, null);
    killed++;
  }
  g.relight();
  note('one aisle, fittings shot out', `${killed} lamps, ${before.toFixed(2)} -> ${aisle.light.toFixed(2)}`);
  check('shooting the lights out makes it darker', aisle.light < before - 0.15,
        `${before.toFixed(2)} -> ${aisle.light.toFixed(2)}`);
  check('the ambient survives, so it is dark and not blind',
        aisle.light >= aisle.ambient - 1e-6 && aisle.light > 0.1,
        `${aisle.light.toFixed(2)} vs ambient ${aisle.ambient}`);
  check('a burst lamp is dead and shows its broken frame',
        g.lamps.some(l => l.dead && l.state && l.state.sprite === 'LAMP'));
  check('bursting a lamp throws sparks', g.projectiles.some(p => p.kind === 'SPARK'));

  /* ---- and the pause, while there is a real Game to hand ----
     It used to be a one-way door: update() returned before the tic that
     sampled the pause key, so nothing could ever unpause. */
  section('pause');
  let sampled = 0;
  const seen = [];
  g.input = { mode: 'desktop', pausePressed: false, sample() { sampled++; this.pausePressed = sampled === 2; } };
  g.onPauseChange = on => seen.push(on);
  g.setPaused(true);
  g.update(1 / 35);
  check('a paused game still listens to the keyboard', sampled === 1 && g.paused);
  g.update(1 / 35);
  check('and the pause key lets you back out', sampled === 2 && !g.paused);
  check('the switch announces both throws, once each', seen.join(',') === 'true,false', seen.join(','));
  g.setPaused(false);
  check('throwing it the way it already is says nothing', seen.length === 2);
  check('the retry prompt knows what it is being played on',
    g.retryPrompt.includes('SPACE') && (g.input.mode = 'touch', g.retryPrompt.includes('TAP')));
}

/* ---------- collision ---------- */
section('collision');
{
  const { MapBuilder } = await import('../js/level.js');
  const mb = new MapBuilder('T');
  mb.sector([[0, 0], [256, 0], [256, 96], [256, 160], [256, 256], [0, 256]], { floor: 0, ceil: 128 });
  mb.sector([[256, 0], [512, 0], [512, 256], [256, 256], [256, 160], [256, 96]], { floor: 0, ceil: 128 });
  const lv = mb.build();
  const at = (r, x, y) => Math.abs(r[0] - x) < 1.5 && Math.abs(r[1] - y) < 1.5;

  check('walks through an opening', at(lv.slideMove(200, 128, 100, 0, 16, 0, 56), 300, 128));
  check('stops at a wall', at(lv.slideMove(400, 128, 200, 0, 16, 0, 56), 496, 128));
  check('slides along a wall', at(lv.slideMove(100, 240, 40, 40, 16, 0, 56), 140, 240));
  /* a move longer than the radius must not step over the wall entirely */
  check('does not tunnel through a wall', at(lv.slideMove(100, 128, 0, 900, 16, 0, 56), 100, 240));

  lv.sectors[1].floor = 24;
  check('climbs a 24 step', at(lv.slideMove(200, 128, 100, 0, 16, 0, 56), 300, 128));
  lv.sectors[1].floor = 40;
  check('a 40 step is a wall', !at(lv.slideMove(200, 128, 100, 0, 16, 0, 56), 300, 128));
  lv.sectors[1].floor = 0; lv.sectors[1].ceil = 40;
  check('a low ceiling blocks', !at(lv.slideMove(200, 128, 100, 0, 16, 0, 56), 300, 128));
  lv.sectors[1].ceil = 128;

  check('sight passes through an opening', !lv.sightBlocked(100, 128, 41, 400, 128, 41));
  lv.sectors[1].floor = 0; lv.sectors[1].ceil = 0;      // a shut door
  check('sight stops at a shut door', lv.sightBlocked(100, 128, 41, 400, 128, 41));
}

/* ---------- fire ---------- */
section('fire');
{
  /* The fire system wants a whole Game; give it the two things it reads. */
  const { FireSystem } = await import('../js/fire.js');
  const fake = { level, player: { x: 1240, y: -520, dead: false, damage() {} }, actors: [], sound: null };
  const t0 = Date.now();
  const fire = new FireSystem(fake);
  note('fuel grid', `${fire.cols}x${fire.rows}, ${fire.totalFuel} total fuel, ${Date.now() - t0}ms`);
  check('the store holds fuel', fire.totalFuel > 100000);
  check('nothing is alight to begin with', fire.liveCells === 0);
  check('burn starts at zero', fire.burnFraction === 0);

  /* light one gondola and let it run */
  /* ONE MATCH, AND ENOUGH TIME. The requirement is that the whole shop
     goes eventually, which is a statement about percolation: every cell
     must light more than one neighbour on average, or the fire stalls
     somewhere and that region can never burn because burnt fuel does not
     come back. So this is the check that matters most in the file. */
  fire.ignite(540, 1000, 200, 40);
  /* liveCells, not burningCells: the latter is what the status bar shows
     and counts only cells that are actually alight, which is zero until
     the simulation has stepped at least once. */
  check('ignition takes', fire.liveCells > 0);

  let stalled = -1;
  for (let i = 0; i < 90000; i++) {
    fire.tic();
    if (i > 20 && fire.liveCells === 0) { stalled = i; break; }
  }
  const burnt = fire.burnFraction;
  note('one match, left alone', `${(burnt * 100).toFixed(1)}% burned` +
    (stalled >= 0 ? `, went out after ${stalled} tics` : ', still going at 90000 tics'));
  check('one match takes essentially the whole shop', burnt > 0.97,
        `${(burnt * 100).toFixed(1)}% — the fire stalled somewhere`);

  /* And it must still not touch anything the map declared as a
     firebreak. This used to be phrased as "no outdoor sector burns",
     which stopped being the same statement the moment the store got a
     footway: the pavement in front of the shops is outdoors AND carries
     fuel, on purpose, because it is the fuse that takes the fire along
     the parade to the neighbours. The invariant that actually matters is
     the one the map is written against — a sector with no fuel never
     burns, whatever else is true about it — and that is still what makes
     the car park the safe room. */
  let dryBurnt = 0;
  for (let i = 0; i < fire.heat.length; i++) {
    const s = fire.sectorOf[i] >= 0 ? level.sectors[fire.sectorOf[i]] : null;
    if (s && s.fuel === 0 && (fire.heat[i] > 0 || fire.fuel[i] < fire.fuel0[i])) dryBurnt++;
  }
  check('a sector with no fuel never burns', dryBurnt === 0, `${dryBurnt} cells burnt in a firebreak`);
  const lotCells = [...fire.sectorOf].filter(si => si >= 0 && level.sectors[si].name === 'bays').length;
  check('the car park is still the safe room', lotCells > 200, `${lotCells} cells of bays`);

  /* Every region of the shop must actually be REACHED, not just 97% of
     the fuel. A stockroom that never catches is a hole in the map. */
  const reached = {};
  for (let i = 0; i < fire.heat.length; i++) {
    const si = fire.sectorOf[i];
    if (si < 0) continue;
    const s = level.sectors[si];
    if (s.outdoor || s.fuel <= 0) continue;
    const r = reached[s.name] || (reached[s.name] = { cells: 0, burnt: 0 });
    r.cells++;
    if (fire.fuel[i] < fire.fuel0[i]) r.burnt++;
  }
  /* TWO CLAIMS, NOT ONE, because they need different bars. Whether the
     fire GOT IN is the invariant the map is written against and it is
     absolute — a region it never enters is a hole in the map. Whether it
     then ate the region is a matter of degree, and a doorway four cells
     across cannot express degrees: three of its four cells is 75%, which
     under a single 90% bar reads as a failure when what actually
     happened is that the fire went through the door. So the small ones
     are held to "reached" and the ones big enough to mean it are held to
     nearly all of it. */
  const entries = Object.entries(reached);
  const never = entries.filter(([, r]) => r.burnt === 0).map(([n]) => n);
  const partial = entries.filter(([, r]) => r.cells >= 20 && r.burnt / r.cells < 0.9)
    .map(([n, r]) => `${n} ${((r.burnt / r.cells) * 100).toFixed(0)}%`);
  note('regions reached', `${entries.length - never.length}/${entries.length}`);
  check('the fire reaches every part of the shop', never.length === 0, never.join(', '));
  check('and eats nearly all of every region worth measuring',
    partial.length === 0, partial.join(', '));

  /* Regions that have burnt should have SAID so — a store that burns down
     and looks identical afterwards is an animation, not a simulation. */
  const charred = level.sectors.filter(s => s.charred).length;
  const gutted = level.sectors.filter(s => s.gutted).length;
  const burnable = level.sectors.filter(s => s.fuel > 0).length;
  note('sectors charred / gutted', `${charred} / ${gutted}, of ${burnable}`);
  check('burnt regions get charred surfaces', charred >= burnable * 0.9, `${charred} of ${burnable}`);

  /* AND THE BUILDING COMES DOWN. Charring is a surface; gutting is a
     structure, and it is the end state the whole fire is for. A store
     that burns to a hundred per cent and still has its roof on is a
     store where the second stage never fired. */
  check('and a burnt-out store is gutted', gutted >= burnable * 0.85, `${gutted} of ${burnable}`);
  {
    /* WHAT A GUTTED REGION TURNS INTO, asked of the mapping directly —
       the fire here runs without a Game, so nothing has applied it. */
    const of = sec => tex.guttedSurfaces(sec, { cells: fire.sectorCells[sec.index] });
    const g0 = level.sectors.find(s => s.gutted && !s.outdoor && s.name === 'aisle');
    check('a gutted aisle exists to look at', !!g0);
    if (g0) {
      const to = of(g0);
      check('its walls are studs and holes', /^RUINWALL\d$/.test(to.wallTex), to.wallTex);
      check('and its floor is slab and ash', /^RUINFLR\d$/.test(to.floorTex), to.floorTex);
    }
    const rack = level.sectors.find(s => s.gutted && /SHELF/.test((s.wallTex || '').replace('_B', '')));
    if (rack) check('a gutted gondola is bare shelving', /^RUINRACK\d$/.test(of(rack).wallTex),
      of(rack).wallTex);

    /* THE ROOF DOES NOT ALL GO. A burnt-out store with no ceiling
       anywhere is a demolition; what is wanted is a roof that has fallen
       in where the span was long enough to fall and is still up, holed
       and charred, everywhere else. Both have to happen, and the check
       is that neither is zero. */
    const roofs = level.sectors.filter(s => s.gutted && !s.outdoor && s.ceilTex && s.ceilTex !== 'SKY')
      .map(of).filter(t => t.ceilTex);
    const open = roofs.filter(t => t.ceilTex === 'SKY').length;
    const kept = roofs.filter(t => /^RUINDECK\d$/.test(t.ceilTex)).length;
    note('gutted roofs: fallen in / still up', `${open} / ${kept}`);
    check('some of the roof falls in', open > 3, `${open}`);
    check('and most of it is still up, burnt through', kept > open, `${kept} up, ${open} open`);
    check('every gutted ceiling is one or the other', open + kept === roofs.length,
      `${roofs.length - open - kept} were neither`);

    /* AND IT IS NOT ALL THE SAME RUIN. One texture across a whole gutted
       store reads as a pattern, which is the one thing a ruin must not. */
    const walls = new Set(level.sectors.filter(s => s.gutted).map(s => of(s).wallTex).filter(Boolean));
    check('the ruin comes in more than one flavour', walls.size >= 3,
      [...walls].join(' '));
    /* a region's variant is stable, so a reload looks the same */
    check('and a region picks the same one every time',
      g0 ? of(g0).wallTex === of(g0).wallTex && of(g0).floorTex.endsWith(of(g0).wallTex.slice(-1)) : true);
  }
  /* THE COALS, wired end to end. The burning trees run an eight-colour
     ember ramp against a clock in their shader; every charred and gutted
     surface in the store now runs the same ramp on the same clock, and
     the thing that carries it is a per-vertex char amount off the
     region. Three links in that chain and all three are checkable
     without a GPU. */
  {
    const mg = await import('../js/mapgeo.js');
    const mat = await import('../js/material.js');
    const pal = await import('../js/palette.js');
    check('an untouched region carries no char', mg.charOf({}) === 0);
    check('a charred one carries some', mg.charOf({ charred: true }) > 0.4);
    check('and a gutted one carries all of it', mg.charOf({ gutted: true }) === 1);
    const u = mat.worldUniforms();
    check('the world material has the ember clock and the ramp',
      !!u.emberTime && Array.isArray(u.emberRamp.value) && u.emberRamp.value.length === 8);
    check('and the shader has the coals in it',
      /vec3 emberOf\(/.test(mat.WORLD_SHADE_GLSL) && /emberRamp\[/.test(mat.WORLD_SHADE_GLSL));
    check('the trees and the store share one ramp',
      pal.EMBER_RAMP.length === 8 && pal.EMBER_RAMP.every(c => c.length === 3));
    const F = await import('../js/forest.js');
    check('and the trees take it from the same place', F.EMBER_RAMP === pal.EMBER_RAMP);
  }

  check('every ruin texture is drawn', tex.RUIN.every(n => Object.keys(tex.TEXTURE_GENERATORS).includes(n)),
    tex.RUIN.filter(n => !Object.keys(tex.TEXTURE_GENERATORS).includes(n)).join(', '));
  const bank = new Set(Object.keys(tex.TEXTURE_GENERATORS).map(n => n));
  check('every charrable texture has a burnt twin',
    tex.CHARRABLE.every(n => bank.has(n)),
    tex.CHARRABLE.filter(n => !bank.has(n)).join(', '));

  /* And the player's weapon has to be much faster than waiting. */
  const f2 = new FireSystem(fake);
  f2.ignite(540, 1000, 150, 26);
  let ticsAlone = 0;
  while (f2.burnFraction < 0.20 && ticsAlone < 90000) { f2.tic(); ticsAlone++; }
  note('20% by spreading alone', `${ticsAlone} tics (${(ticsAlone / 35).toFixed(0)}s)`);
  check('spreading alone is slow enough to leave room for a player', ticsAlone > 600,
        `${ticsAlone} tics is too fast to be worth a weapon`);
}

/* ---------- touch ---------- */
section('touch');
{
  /* The stick's maths, without a screen. The numbers are the ones a
     thumb feels: nothing inside the dead zone, nothing sudden at its
     edge, a walk at half throw and a run at the rim. */
  const t = await import('../js/touch.js');
  const R = 56;
  const rest = t.stickVector(0, 0, R);
  check('a resting thumb is no movement', rest.x === 0 && rest.y === 0 && rest.mag === 0);
  check('inside the dead zone is still no movement', t.stickVector(R * 0.1, 0, R).mag === 0);
  const edge = t.stickVector(R * 0.121, 0, R);
  check('leaving the dead zone starts from zero, not a jump', edge.mag > 0 && edge.mag < 0.01, `mag ${edge.mag.toFixed(3)}`);
  const half = t.stickVector(0, -R * 0.56, R);
  check('half a push forward is a walk, straight ahead', half.x === 0 && half.y > 0.45 && half.y < 0.55, `y ${half.y.toFixed(2)}`);
  const full = t.stickVector(0, -R, R);
  check('the rim is a full run', Math.abs(full.y - 1) < 1e-9 && full.mag === 1);
  const past = t.stickVector(0, -3 * R, R);
  check('past the rim is still exactly one', past.mag === 1 && Math.abs(past.y - 1) < 1e-9);
  const diag = t.stickVector(R, R, R);
  check('a diagonal is unit length, not root two', Math.abs(Math.hypot(diag.x, diag.y) - 1) < 1e-9);
  check('screen-down is back and screen-right is right',
    t.stickVector(0, R, R).y < 0 && t.stickVector(R, 0, R).x > 0);

  const [bx, by] = t.followBase(100, 100, 100 + R * 2, 100, R);
  check('the base is towed to one radius behind the finger', Math.abs(bx - (100 + R)) < 1e-9 && by === 100, `${bx},${by}`);
  const [sx, sy] = t.followBase(100, 100, 130, 110, R);
  check('and stays put while the finger is inside the rim', sx === 100 && sy === 100);

  note('stick radius: phone / small / tablet',
    `${t.stickRadius(844, 390)} / ${t.stickRadius(320, 240)} / ${t.stickRadius(1366, 1024)}`);
  check('the stick fits a phone', t.stickRadius(844, 390) === 55 && t.stickRadius(320, 240) === 44);
  check('and is not a saucer on a tablet', t.stickRadius(1366, 1024) === 64);

  const look = t.lookDelta(150, 150, 1);
  note('a 150px swipe', `${(look.x * 180 / Math.PI).toFixed(0)} degrees across, ${(look.y * 180 / Math.PI).toFixed(0)} up`);
  check('a thumb swipe turns about sixty degrees', look.x > 0.95 && look.x < 1.15);
  check('vertical look is slower than horizontal', look.y > 0 && look.y < look.x);
  check('look speed scales the swipe', Math.abs(t.lookDelta(100, 0, 2).x - 2 * t.lookDelta(100, 0, 1).x) < 1e-12);
}

/* ---------- the wood ---------- */
section('the wood');
{
  /* The forest simulates without a renderer, which is the point of
     keeping the simulation and the drawing apart: a spark in a typed
     array either takes the wood or it does not, and that can be watched
     for an hour in Node in a second. */
  const F = await import('../js/forest.js');
  const forest = new F.Forest(level);
  note('cells / fuel cells', `${forest.cols}x${forest.rows} / ${forest.fuelCells}`);
  note('trees / plants', `${forest.treeCount} / ${forest.plantCount}`);
  check('the wood is huge', forest.fuelCells > 100000, `${forest.fuelCells} cells`);
  check('and full of trees', forest.treeCount > 20000, `${forest.treeCount}`);
  const c = level.clearing;
  let inClearing = 0;
  for (let i = 0; i < forest.treeCount; i++) {
    const x = forest.trees.x[i], y = forest.trees.y[i];
    if (x > c[0] && x < c[2] && y > c[1] && y < c[3]) inClearing++;
  }
  check('no tree stands in the car park or the store', inClearing === 0, `${inClearing} did`);
  check('the store has no forest fuel under it', !forest.fuel[forest.idx(forest.cellX(2000), forest.cellY(1000))]);
  check('the fuel grid stops at the store', level.fireBounds[0] === -1400 && level.fireBounds[2] === 5680 && level.fireBounds[3] === 3400, level.fireBounds.join());
  const roadOut = level.sectors.filter(s => s.outside);
  check('the road runs out through the wood on both sides', roadOut.some(s => s.bbox[2] <= -1400) && roadOut.some(s => s.bbox[0] >= 5680), `${roadOut.length} outside sectors`);
  check('and is not the store\'s fuel', roadOut.every(s => s.fuel === 0) && roadOut.every(s => s.bbox[0] >= level.fireBounds[2] || s.bbox[2] <= level.fireBounds[0]));
  check('the road has two ends to arrive from', level.roadEnds?.length === 2 && level.roadEnds[0].side !== level.roadEnds[1].side);
  const onRoad = level.sectorAt(2000, (level.road.y0 + level.road.y1) / 2);
  check('the road crosses the lot in front of the store', !!onRoad && /road/.test(onRoad.name) && onRoad.outdoor && !onRoad.forest, onRoad?.name);

  /* a plant is a trunk to the flame, not a billboard */
  const fir = F.KINDS[0];
  check('a fir is narrow at the foot and widest a third of the way up',
    F.plantRadius(fir, 0.02) < 0.1 && F.plantRadius(fir, 0.3) === 0.5 && F.plantRadius(fir, 0.99) < 0.05);
  let ti = 0;
  while (forest.trees.kind[ti] !== 0) ti++;               // a tall fir
  const tx = forest.trees.x[ti], ty = forest.trees.y[ti], th = fir.h * forest.trees.scale[ti];
  check('the flame passes beside a trunk it would have hit at canopy width',
    forest.hitsTree(tx, ty, th * 0.02) && !forest.hitsTree(tx + 40, ty, th * 0.02) && forest.hitsTree(tx + 40, ty, th * 0.3));
  check('you cannot walk through a trunk', forest.blocks(tx, ty, 16));

  /* one match */
  const sx = forest.worldX(forest.cellX(c[0] - 800)), sy = forest.worldY(forest.cellY(c[1] - 800));
  check('a match lights the wood', forest.ignite(sx, sy, 40) > 0);
  for (let k = 0; k < 90; k++) forest.tic();
  const acc = { sx: 0, sy: 0, sw: 0, n: 0 };
  forest.glowInto(acc, sx, sy, 900);
  const out = [];
  forest.emitters(sx, sy, 1200, 4, out);
  check('what is burning near you lights you and throws sparks', acc.n > 0 && out.length > 0, `${acc.n} / ${out.length}`);
  let tics = 90, t25 = 0, t5 = 0;
  while (forest.burnFraction < 0.25 && tics < 35 * 60 * 60) {
    forest.tic(); tics++;
    if (!t5 && forest.burnFraction >= 0.05) t5 = tics;
  }
  t25 = tics;
  note('5% / 25% of the wood, left alone', `${(t5 / 35 / 60).toFixed(1)} min / ${(t25 / 35 / 60).toFixed(1)} min`);
  check('the fire takes the wood on its own', forest.burnFraction >= 0.25, `${(forest.burnFraction * 100).toFixed(1)}% after ${tics} tics`);
  check('but not in a flash', t5 > 35 * 60, `${(t5 / 35).toFixed(0)}s to 5%`);
  check('nor in an afternoon', t25 < 35 * 60 * 50, `${(t25 / 35 / 60).toFixed(0)} min to 25%`);
  check('burnt cells stay burnt', forest.state[forest.idx(forest.cellX(sx), forest.cellY(sy))] === 2);
}

/* ---------- the flame ---------- */
section('the flame');
{
  const FL = await import('../js/flame.js');
  const reach = FL.streamReach();
  const drop = FL.streamDrop(28);
  note('reach / on the floor at', `${reach.toFixed(0)} / ${drop.toFixed(0)} units`);
  check('the stream reaches across an aisle', reach > 600 && reach < 900, reach.toFixed(0));
  check('and lands on the floor before it runs out', drop > 250 && drop < reach, drop.toFixed(0));
  check('the heat stays below the accelerant line', FL.STREAM.heat < 40, `${FL.STREAM.heat}`);

  /* particles: a pool, not an allocator */
  const P = await import('../js/particles.js');
  const pool = new P.Particles({ max: 4, frames: 1 });
  const ids = [pool.spawn({ x: 0, y: 0, z: 0, life: 2 }), pool.spawn({ x: 0, y: 0, z: 0, life: 5 }), pool.spawn({ x: 0, y: 0, z: 0, life: 5 }), pool.spawn({ x: 0, y: 0, z: 0, life: 5 })];
  check('a full pool refuses politely', pool.spawn({ x: 0, y: 0, z: 0 }) === -1 && ids.every(i => i >= 0));
  pool.tic(); pool.tic();
  check('a particle dies when its life runs out', pool.count === 3);
  check('and its slot is reused', pool.spawn({ x: 0, y: 0, z: 0, life: 9 }) === ids[0]);
  const s = pool.spawn({ x: 0, y: 0, z: 10, vx: 2, life: 9, drag: 0.5, gravity: -1 });
  check('the pool is full again', s === -1);
  let landed = 0;
  pool.tic((i, nx, ny, nz) => nz < 0 ? (landed++, true) : false);
  check('a collision hook can stop one', landed === 0 && pool.count === 4);

  /* the stream in the actual game: born at the nozzle, dying on the floor */
  const { Game } = await import('../js/game.js');
  const THREE = await import('three');
  const hudStub = { message() {}, ticMessages() {}, resize() {}, update() {} };
  const inputStub = { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, attack: false, use: false, run: false, sample() {}, sensitivity: 0 };
  const g = new Game({ level, scene: new THREE.Scene(), camera: {}, textures: tex.bakeTextures(), sprites: spr.bakeSprites(), hud: hudStub, audio: null, input: inputStub });
  const p = g.player;
  const o = g.nozzle();
  check('without a model the flame is born low and right of the eye', o.z < p.viewZ && Math.hypot(o.x - p.x, o.y - p.y) > 10);
  for (let k = 0; k < 6; k++) { g.flame.fire(o, p.angle, 0); g.flame.tic(); }
  check('the stream is in the air', g.flame.liveCount >= 12, `${g.flame.liveCount}`);
  for (let k = 0; k < 40; k++) g.flame.tic();
  check('and every particle has landed', g.flame.liveCount === 0 && g.flame._hits > 0, `${g.flame.liveCount} live, ${g.flame._hits} hits`);
  check('the player cannot be hurt for now', (p.damage(50, null), p.health === 100));
  check('and the tank never empties', p.hasAmmo('FLAMER') && p.ammoFor('FLAMER') === Infinity);
}

/* ---------- the crowd ---------- */
section('the crowd');
{
  const ppl = await import('../js/people.js');
  const { Game } = await import('../js/game.js');
  const THREE = await import('three');
  const hudStub = { message() {}, ticMessages() {}, resize() {}, update() {} };
  const inputStub = { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, attack: false, use: false, run: false, sample() {}, sensitivity: 0 };
  const g = new Game({ level, scene: new THREE.Scene(), camera: {}, textures: tex.bakeTextures(), sprites: spr.bakeSprites(), hud: hudStub, audio: null, input: inputStub });

  /* --- who is in the shop, and nobody anywhere else ---
     A customer is somebody who is IN THE SHOP. The map places them
     through one predicate and exports the rectangle it used; this holds
     every one of them against it from the other side, so a coordinate
     that drifts into the stockroom, out through the front doors or into
     a neighbouring unit fails here rather than turning up in a
     screenshot standing in the loading dock. */
  const SF = level.salesFloor;
  const crowd = g.actors.filter(a => a.type === 'SHOPPER');
  const inside = crowd.filter(a => a.x > SF.x0 && a.x < SF.x1 && a.y > SF.y0 && a.y < SF.y1);
  note('shoppers on the sales floor', `${inside.length} of ${crowd.length}`);
  check('the shop has a crowd in it', inside.length > 60, `${inside.length}`);
  check('and every one of them is on the sales floor',
    inside.length === crowd.length,
    crowd.filter(a => !inside.includes(a)).slice(0, 4).map(a => `${a.x | 0},${a.y | 0}`).join(' '));
  check('nobody is in the stockroom, the dock or the office',
    !crowd.some(a => /stock|dock|office/i.test(g.level.sectors[a.sector?.index ?? 0]?.name || '')),
    crowd.map(a => a.sector?.name).filter(n => /stock|dock|office/i.test(n || '')).slice(0, 3).join(', '));
  check('and nobody is outdoors', !crowd.some(a => a.sector?.outdoor),
    crowd.filter(a => a.sector?.outdoor).slice(0, 3).map(a => a.sector.name).join(', '));
  check('nobody is a staff monster any more',
    !g.actors.some(a => a.type === 'ASSOCIATE' || a.type === 'STOCKER'));
  check('every shopper is one of the drawings there are',
    crowd.every(a => Number.isInteger(a.variant) && a.variant >= 0 && a.variant < ppl.SHOPPERS));
  check('and there is more than one of them being used',
    new Set(crowd.map(a => a.variant)).size === ppl.SHOPPERS,
    `${new Set(crowd.map(a => a.variant)).size} of ${ppl.SHOPPERS}`);
  check('they are solid, shootable and they burn',
    crowd.every(a => a.solid && a.shootable && a.flammable));

  /* --- one tic of the stream is more than a person --- */
  const FL2 = await import('../js/flame.js');
  check('one tic of the flame is over a shopper twice',
    FL2.STREAM.perTic * 5 > st.ACTORS.SHOPPER.health * 2,
    `${FL2.STREAM.perTic * 5} damage against ${st.ACTORS.SHOPPER.health} health`);

  /* --- and what that looks like --- */
  const victim = inside[0];
  const before = g.actors.length;
  victim.damage(50, g.player, { fire: true });
  check('a shopper hit hard enough comes apart', g.giblets.bursts === 1 && victim.dead);
  const blast = g.actors.filter(a => a.type === 'BLAST');
  check('there is a fireball where they were', blast.length === 1 &&
    Math.hypot(blast[0].x - victim.x, blast[0].y - victim.y) < 1);
  check('and a splat under it', g.actors.some(a => a.type === 'GORE'));
  g.actors.forEach(a => a.tic());            // the gib state is one tic long
  check('the person is gone', victim.removed);
  check('the pieces are in the air', g.giblets.chunks.count === ppl.GIB.count,
    `${g.giblets.chunks.count} of ${ppl.GIB.count}`);
  check('and they are on fire', (g.giblets.tic(), g.giblets.trail.count > 0),
    `${g.giblets.trail.count} flames`);

  const heatBefore = g.fire.burningCells;
  for (let k = 0; k < 200; k++) { g.giblets.tic(); g.fire.tic(); }
  check('every piece comes down', g.giblets.chunks.count === 0, `${g.giblets.chunks.count} still up`);
  check('they leave something on the floor', g.actors.filter(a => a.type === 'GORE').length > 1);
  check('and they start a fire where they land', g.fire.burningCells > heatBefore,
    `${heatBefore} -> ${g.fire.burningCells} cells`);
  note('one person', `${g.actors.length - before + 1} things left behind, ` +
    `${g.actors.filter(a => a.type === 'GORE').length} splats`);

  /* --- the floor does not fill up with them for ever --- */
  for (let k = 0; k < ppl.GIB.maxSplats + 40; k++) g.giblets.splat(1200, 900, 0);
  check('the splats are capped', g.giblets.splats.length === ppl.GIB.maxSplats,
    `${g.giblets.splats.length}`);
  check('and the ones over the cap are taken away',
    g.actors.filter(a => a.type === 'GORE' && !a.removed).length <= ppl.GIB.maxSplats + 2);

  /* --- and they run from it ---
     The whole claim in one measurement: put a fire next to somebody,
     let the world run, and they should be further from it than they
     were and no longer standing still. */
  {
    const a = g.actors.find(x => x.type === 'SHOPPER' && !x.dead && x.y > 1300 && x.y < 1800);
    const fx = a.x, fy = a.y - 90;                      // a fire, right there
    const d0 = Math.hypot(a.x - fx, a.y - fy);
    g.fire.ignite(fx, fy, 200, 48);
    /* the actors and the fire, not Game.tic — a whole tic wants slide
       doors, and a slide door wants a GPU */
    for (let k = 0; k < 90; k++) {
      g.tics++;
      for (const x of g.actors) x.tic();
      g.fire.tic();
    }
    const d1 = Math.hypot(a.x - fx, a.y - fy);
    check('a shopper notices a fire beside it', a.panic > 0 || a.removed, `panic ${a.panic}`);
    check('and runs away from it', a.removed || d1 > d0 + 60, `${d0.toFixed(0)} -> ${d1.toFixed(0)}`);
    note('one shopper, ninety tics', `${d0.toFixed(0)} units from the fire, then ${d1.toFixed(0)}`);
    /* and the rest of the aisle heard about it */
    const running = g.actors.filter(x => x.type === 'SHOPPER' && x.panic > 0).length;
    check('and it is not the only one moving', running > 1, `${running} running`);
  }

  /* --- standing still, but not perfectly, and moving when it runs --- */
  {
    const a = inside[1];
    const swing = () => {
      let worst = 0, moved = 0, prev = null;
      for (let t = 0; t < 400; t++) {
        const s2 = { ...ppl.swayOf(a, t) };
        worst = Math.max(worst, Math.hypot(s2.dx, s2.dy), Math.abs(s2.dz));
        if (prev) moved += Math.hypot(s2.dx - prev.dx, s2.dy - prev.dy, s2.dz - prev.dz);
        prev = s2;
      }
      return { worst, moved };
    };
    a.panic = 0;
    const still = swing();
    check('a standee sways', still.moved > 4, still.moved.toFixed(1));
    check('by under two units', still.worst < 2, still.worst.toFixed(2));
    /* swayOf hands back ONE shared object — read it before the next call */
    const b = { ...ppl.swayOf(inside[2], 0) }, p0 = { ...ppl.swayOf(a, 0) };
    check('and not in step with the next one along',
      Math.hypot(p0.dx - b.dx, p0.dy - b.dy) > 0.01);

    /* and a frightened one is visibly doing something else */
    a.panic = 60;
    const running = swing();
    check('a running one moves a great deal more',
      running.moved > still.moved * 3, `${running.moved.toFixed(0)} against ${still.moved.toFixed(0)}`);
    check('and still stays within a few units of where it is',
      running.worst < 4, running.worst.toFixed(2));
    a.panic = 0;
  }
}

/* ---------- the gun ---------- */
/* ---------- the van ---------- */
section('the fleet');
{
  const { CAR_ATLAS, VEHICLES, VEHICLE_IDS, CIVILIAN } = await import('../js/car-data.js');
  const car = await import('../js/car.js');
  const veh = await import('../js/vehicles.js');
  const { readPNG } = await import('./png-read.mjs');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('..', import.meta.url));

  /* --- six sheets, six vehicles ------------------------------------- */
  note('the fleet', VEHICLE_IDS.map(id => `${id} (${VEHICLES[id].use})`).join(', '));
  check('every vehicle in the index is in the fleet',
    VEHICLE_IDS.length === Object.keys(VEHICLES).length &&
    VEHICLE_IDS.every(id => VEHICLES[id] && VEHICLES[id].id === id));
  check('and the civilian list is the vehicles a shopper might own',
    CIVILIAN.length > 0 && CIVILIAN.every(id => VEHICLES[id].use === 'civil') &&
    VEHICLE_IDS.filter(id => VEHICLES[id].use === 'civil').length === CIVILIAN.length,
    CIVILIAN.join(', '));
  check('and there is a riot van and an APC that are not on it',
    VEHICLE_IDS.some(id => VEHICLES[id].use === 'police') &&
    VEHICLE_IDS.some(id => VEHICLES[id].use === 'military'));

  /* EACH SHEET IS OVER-DETERMINED and that is the only reason to trust
     it. Three of the four views claim a width — the front, the rear and
     the plan — and if they did not agree, nothing measured off any of
     them would mean anything. tools/prep-car.mjs records the residual;
     the riot van manages one percent and the pickup, whose side view
     draws it taller for its length than its own head-on views do, eleven
     and a half. */
  const worst = VEHICLE_IDS.reduce((a, b) => VEHICLES[a].shape.agree > VEHICLES[b].shape.agree ? a : b);
  note('the views on the width', VEHICLE_IDS.map(id =>
    `${id} ${(VEHICLES[id].shape.agree * 100).toFixed(1)}%`).join(', '));
  check('every sheet agrees with itself about how wide its vehicle is',
    VEHICLE_IDS.every(id => VEHICLES[id].shape.agree < 0.14),
    `worst is ${worst} at ${(VEHICLES[worst].shape.agree * 100).toFixed(1)}%`);

  for (const id of VEHICLE_IDS) {
    const v = VEHICLES[id], s = v.shape;
    const ratio = 1 / s.width, tall = s.height / s.width;
    check(`the ${id} has the proportions of a vehicle`,
      ratio > 1.7 && ratio < 3.2 && tall > 0.6 && tall < 1.5,
      `${ratio.toFixed(2)} : 1 : ${tall.toFixed(2)} (length : width : height)`);
    check(`the ${id} stands on the ground with its body clear of it`,
      s.sill >= 0 && s.sill < 0.2 && s.layers.length >= 3 && s.layers[0].z0 === s.sill);
    /* a wheel is a wheel and not a slab across the underside — which is
       what the custom van's bull bar was read as until the tyre stopped
       being "the longest run at the bottom of the front view" */
    check(`the ${id}'s tyres are tyres`,
      s.tyre > 0.06 * s.width && s.tyre < 0.45 * s.width,
      `${(s.tyre / s.width).toFixed(2)} of the width`);
    /* the roof line is what the head-on views were anchored on, so the
       body has to reach it and stop somewhere at or below the top — see
       the pale band this once painted along the nose */
    const top = Math.max(...s.layers.map(l => l.z1));
    check(`the ${id}'s layers reach its full height`, Math.abs(top - s.height) < 0.005,
      `${top} vs ${s.height}`);
    check(`and its roof line is inside its own height`,
      s.roof > 0.6 * s.height && s.roof <= s.height + 1e-9,
      `${s.roof} of ${s.height}`);
  }
  /* four wheels each, except the one on tracks */
  note('wheels', VEHICLE_IDS.map(id => `${id} ${VEHICLES[id].shape.wheels.length * 2}`).join(', '));
  check('every wheeled vehicle has four wheels and the tracked one has none',
    VEHICLE_IDS.every(id => VEHICLES[id].shape.wheels.length === (VEHICLES[id].use === 'military' ? 0 : 2)));
  /* and nothing parked is longer than the bay it goes in */
  check('every civilian vehicle fits in a bay', CIVILIAN.every(id => VEHICLES[id].length <= 180),
    CIVILIAN.map(id => `${id} ${VEHICLES[id].length}`).join(', '));

  /* --- one atlas for the lot ---------------------------------------- */
  const atlasFile = path.join(root, CAR_ATLAS.file);
  check('the atlas is where the data says', fs.existsSync(atlasFile), CAR_ATLAS.file);
  const allRects = [];
  for (const id of VEHICLE_IDS)
    for (const [k, r] of Object.entries(VEHICLES[id].views)) allRects.push({ id, k, ...r });
  if (fs.existsSync(atlasFile)) {
    const img = readPNG(atlasFile);
    check('and it is the size the data says', img.w === CAR_ATLAS.w && img.h === CAR_ATLAS.h,
      `${img.w}x${img.h} against ${CAR_ATLAS.w}x${CAR_ATLAS.h}`);
    /* NO CHROMA KEY SURVIVES. Every pixel outside a vehicle was filled
       with the nearest paint, so a face that overhangs the silhouette by
       a pixel lands on the van rather than on a green screen. One green
       pixel anywhere means the fill missed. */
    let green = 0, tint = 0, clear = 0;
    for (let i = 0; i < img.w * img.h; i++) {
      const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
      if (g > r + 28 && g > b + 28) green++;
      if (g > Math.max(r, b)) tint++;
      if (img.data[i * 4 + 3] !== 255) clear++;
    }
    check('and not one pixel of it is still chroma key', green === 0, `${green} green pixels`);
    /* AND NONE OF IT IS EVEN GREENISH. The screen throws green light on
       what stands in front of it and white paint takes it: the panel van
       came out six units greener than red or blue everywhere, which
       reads as white against the green field of the sheet and as a pale
       green van once it is parked on tarmac. No pixel may be greener
       than its own strongest other channel. */
    check('and none of it is so much as tinted green', tint === 0, `${tint} pixels`);
    check('and none of it is transparent, because the boxes are the silhouette', clear === 0);
  }
  check('all twenty-four views fit inside the atlas', allRects.every(r =>
    r.x >= 0 && r.y >= 0 && r.x + r.w <= CAR_ATLAS.w && r.y + r.h <= CAR_ATLAS.h),
    `${allRects.length} views`);
  /* AND NO TWO OF THEM OVERLAP. With one vehicle in the atlas a packing
     bug showed up as a vehicle painted with itself; with six it shows up
     as a hatchback painted with an APC, which is worth a test. */
  let clash = null;
  for (let i = 0; i < allRects.length && !clash; i++)
    for (let j = i + 1; j < allRects.length; j++) {
      const a = allRects[i], b = allRects[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        clash = `${a.id}.${a.k} over ${b.id}.${b.k}`; break;
      }
    }
  check('and no two of them overlap', !clash, clash || 'none');

  /* --- the models --------------------------------------------------- */
  const LIP = 0.005;
  /* Is this point inside the solid the layers and wheels describe? Used
     to decide which way a triangle faces; see below. */
  const solidOf = (v) => {
    const s = v.shape, L = v.length;
    const flank = Math.min(s.width / 2, s.layers[0].half) * L;
    return (x, y, z) => {
      for (let i = 0; i < s.layers.length; i++) {
        const l = s.layers[i];
        const z0 = (i === 0 ? (s.wheels.length ? l.z0 : 0) : l.z0 - LIP) * L;
        if (z < z0 || z > l.z1 * L || Math.abs(y) > l.half * L) continue;
        for (const [a, b] of l.runs) if (x >= a * L && x <= b * L) return true;
      }
      const yOut = flank - LIP * L, yIn = yOut - s.tyre * L;
      for (const w of s.wheels) {
        const r = w.r * L, cz = r * Math.cos(Math.PI / 8), ay = Math.abs(y);
        if (ay < yIn || ay > yOut) continue;
        /* A wheel is an eight-sided polygon whose CORNERS are at
           (k + 0.5) steps, so its EDGES — and therefore the normals that
           bound it — are at whole ones. Testing it with the corner
           directions instead describes a polygon turned an eighth of a
           step, and every point just inside a real corner reads as
           outside it: which is thirty-two triangles per vehicle
           pronounced inside out that are wound perfectly well. */
        let all = true;
        for (let k = 0; k < 8 && all; k++) {
          const th = k * 2 * Math.PI / 8;
          if ((x - w.x * L) * Math.cos(th) + (z - cz) * Math.sin(th) > r * Math.cos(Math.PI / 8) + 1e-6) all = false;
        }
        if (all) return true;
      }
      return false;
    };
  };

  let triTotal = 0, strayTotal = 0, wrongTotal = 0, decidedTotal = 0;
  for (const id of VEHICLE_IDS) {
    const v = VEHICLES[id], L = v.length;
    const g = car.carGeometry(v, { angle: 0.4 });
    const tris = g.position.length / 9;
    triTotal += tris;
    check(`the ${id} is a handful of boxes, not a mesh`, tris > 40 && tris < 400, `${tris} triangles`);
    check(`and every vertex of it has a uv, a light, a sky and a char`,
      g.uv.length === g.position.length / 3 * 2 && g.light.length === g.position.length / 3 &&
      g.sky.length === g.light.length && g.charred.length === g.light.length);

    /* it has to fit in its own bounding box, because the projection maps
       that box onto the pictures and nothing outside it has any paint */
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < g.position.length / 3; i++)
      for (let k = 0; k < 3; k++) {
        const t = g.position[i * 3 + k];
        if (t < lo[k]) lo[k] = t; if (t > hi[k]) hi[k] = t;
      }
    const near = (a, b) => Math.abs(a - b) < 0.8;
    /* THE WIDTH A MODEL HAS IS THE WIDTH ITS LAYERS DRAW, which is not
       quite `shape.width`: that is the reconciled average of what three
       views claim, and it is what SCALES the front view. The layers are
       what the front view actually draws at each height. On the riot van
       the two agree to a thousandth; on the hatchback, whose sheet
       agrees with itself to only five percent, they differ by two and a
       half — so the box is checked against the drawing and the two
       numbers are then checked against each other. */
    const drawn = 2 * Math.max(...v.shape.layers.map(l => l.half)) * L;
    check(`the ${id} is as long, as wide and as tall as its own layers say`,
      near(hi[0] - lo[0], L) && near(hi[2] - lo[2], drawn) && near(hi[1] - lo[1], car.carHeight(v)),
      `${(hi[0] - lo[0]).toFixed(1)} x ${(hi[2] - lo[2]).toFixed(1)} x ${(hi[1] - lo[1]).toFixed(1)}`);
    check(`and that is the width the three views reconciled to`,
      Math.abs(drawn - car.carWidth(v)) / car.carWidth(v) < 0.08,
      `${drawn.toFixed(1)} drawn against ${car.carWidth(v).toFixed(1)} measured`);
    check(`and it stands on the tarmac`, near(lo[1], 0), `${lo[1].toFixed(2)}`);

    /* EVERY UV LANDS IN ONE OF THIS VEHICLE'S OWN FOUR VIEWS. A stray
       one is a face reading the gutter between two pictures; a uv in
       ANOTHER vehicle's rectangle is a hatchback painted with an APC,
       which is the failure a shared atlas makes possible and a
       per-vehicle one did not. */
    const rects = Object.entries(v.views).map(([k, r]) => ({ k,
      u0: r.x / CAR_ATLAS.w, u1: (r.x + r.w) / CAR_ATLAS.w,
      v0: 1 - (r.y + r.h) / CAR_ATLAS.h, v1: 1 - r.y / CAR_ATLAS.h }));
    const used = new Set();
    let stray = 0;
    for (let i = 0; i < g.uv.length / 2; i++) {
      const u = g.uv[i * 2], w = g.uv[i * 2 + 1];
      const r = rects.find(r => u >= r.u0 - 1e-9 && u <= r.u1 + 1e-9 && w >= r.v0 - 1e-9 && w <= r.v1 + 1e-9);
      if (r) used.add(r.k); else stray++;
    }
    strayTotal += stray;
    check(`every uv on the ${id} lands inside one of ITS OWN four views`, stray === 0, `${stray} strays`);
    check(`and all four of them get used`, used.size === 4, [...used].join(' '));

    /* EVERY FACE POINTS OUT. The material is single sided, so a box
       wound inside out is a hole you can see the inside of the van
       through, and that is the one fault in this file that looks like a
       rendering bug rather than a modelling one. Step a little way along
       each triangle's own normal and off the solid: if that lands
       INSIDE, it is inside out. */
    const inside = solidOf(v);
    const flat = car.carGeometry(v, { angle: 0 });     // model space, so the solid is comparable
    let decided = 0, wrong = 0;
    for (let t = 0; t < flat.position.length / 3; t += 3) {
      const p = k => [flat.position[(t + k) * 3], -flat.position[(t + k) * 3 + 2], flat.position[(t + k) * 3 + 1]];
      const a = p(0), b = p(1), c = p(2);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
      const m = Math.hypot(nx, ny, nz) || 1;
      nx /= m; ny /= m; nz /= m;
      const mx = (a[0] + b[0] + c[0]) / 3, my = (a[1] + b[1] + c[1]) / 3, mz = (a[2] + b[2] + c[2]) / 3;
      const out = inside(mx + nx * 0.35, my + ny * 0.35, mz + nz * 0.35);
      const inn = inside(mx - nx * 0.35, my - ny * 0.35, mz - nz * 0.35);
      if (out === inn) continue;
      decided++; if (out) wrong++;
    }
    decidedTotal += decided; wrongTotal += wrong;
    check(`and every face of the ${id} that can be decided faces out`,
      wrong === 0 && decided > 30, `${wrong} inside out of ${decided} decided`);

    /* AND EVERY FACE IS WOUND THE WAY IT SAYS IT IS. The test above can
       only decide a face with air on one side of it, which leaves every
       tyre's tread — buried under a wheel arch — unexamined, and all
       sixty-four of them were inside out for as long as there was one
       van. This one is exact and covers the lot: the builder records
       which way it meant each face to point, and the winding has to
       agree with it. */
    let flipped = 0;
    for (let t = 0; t < flat.position.length / 3; t += 3) {
      const q = k => [flat.position[(t + k) * 3], flat.position[(t + k) * 3 + 1], flat.position[(t + k) * 3 + 2]];
      const a = q(0), b = q(1), c = q(2);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const gx = u[1] * w[2] - u[2] * w[1], gy = u[2] * w[0] - u[0] * w[2], gz = u[0] * w[1] - u[1] * w[0];
      /* the declared normal is in model space; the mesh is (x, z, -y) */
      const n = [flat.normal[t * 3], flat.normal[t * 3 + 1], flat.normal[t * 3 + 2]];
      if (gx * n[0] + gy * n[2] + gz * -n[1] <= 0) flipped++;
    }
    check(`and every face of the ${id} is wound the way it says it is`,
      flipped === 0, `${flipped} of ${flat.position.length / 9} flipped`);

    /* LIGHT. Doom's fake contrast, so a box has visible corners in a
       renderer that does no shading. */
    const lights = [...new Set(g.light.map(t => +t.toFixed(4)))];
    check(`the ${id}'s faces are not all the same brightness`, lights.length >= 4, `${lights.length}`);
    check(`and its roof is the brightest of them and its underside the darkest`,
      Math.max(...lights) > 0.74 && Math.min(...lights) < 0.74 * 0.5);
  }
  note('the whole fleet', `${triTotal} triangles, ${strayTotal} stray uvs, ${wrongTotal} of ${decidedTotal} faces inside out`);

  /* --- a piece torn off one ----------------------------------------- */
  {
    const v = VEHICLES.van, cut = { x0: -0.1, x1: 0.02, y0: -0.06, y1: 0.05, z0: 0.2, z1: 0.3 };
    const c = car.chunkGeometry(v, cut, { angle: 0, light: 0.7, sky: 1, charred: 0.85 });
    check('a torn-off chunk is one box', c.position.length / 9 === 12);
    check('and it is charred', c.charred.every(t => t === 0.85));
    /* it turns about its own middle, so its vertices straddle zero */
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < c.position.length; i += 3) { lo = Math.min(lo, c.position[i]); hi = Math.max(hi, c.position[i]); }
    check('and it is centred on itself, so it tumbles about its middle',
      Math.abs(lo + hi) < 1e-6, `${lo.toFixed(2)}..${hi.toFixed(2)}`);
    /* AND IT IS PAINTED WITH THE PART OF THE VAN IT CAME OFF, because it
       goes through the same projection at the same model coordinates */
    const rects = Object.values(v.views).map(r => ({
      u0: r.x / CAR_ATLAS.w, u1: (r.x + r.w) / CAR_ATLAS.w,
      v0: 1 - (r.y + r.h) / CAR_ATLAS.h, v1: 1 - r.y / CAR_ATLAS.h }));
    let stray = 0;
    for (let i = 0; i < c.uv.length / 2; i++) {
      const u = c.uv[i * 2], w = c.uv[i * 2 + 1];
      if (!rects.some(r => u >= r.u0 - 1e-9 && u <= r.u1 + 1e-9 && w >= r.v0 - 1e-9 && w <= r.v1 + 1e-9)) stray++;
    }
    check('and every uv on it is still the van it came off', stray === 0, `${stray} strays`);
  }

  /* --- the arithmetic the tumble stands on -------------------------- */
  {
    const v = VEHICLES.van, corners = car.carCorners(v);
    check('a vehicle has eight corners', corners.length === 8);
    const mesh = corners.map(p => [(p[0] - 0) * v.length, (p[2] - v.shape.height / 2) * v.length, -(p[1] - 0) * v.length]);
    const half = car.carHeight(v) / 2;
    const flatE = veh.extentOf(mesh, 0, 0);
    check('sitting flat, its middle is half its height off the ground',
      Math.abs(flatE.lo + half) < 1e-6 && Math.abs(flatE.hi - half) < 1e-6,
      `${flatE.lo.toFixed(2)}..${flatE.hi.toFixed(2)}`);
    /* THE WHOLE FLIGHT TIME RESTS ON THIS: a box turned half a turn
       about its own length is exactly as tall as it was, so a car that
       leaves the ground upright and lands on its roof has its middle
       back where it started, and the flight lasts 2v/g. */
    const overE = veh.extentOf(mesh, Math.PI, 0);
    check('and turned onto its roof it is exactly as tall as it was',
      Math.abs(overE.lo - flatE.lo) < 1e-9 && Math.abs(overE.hi - flatE.hi) < 1e-9);
    /* and turning about the up axis cannot change a height */
    const spun = veh.turn([10, 20, 30], 1.1, 0, 0);
    check('yawing something does not move it up or down', Math.abs(spun[1] - 20) < 1e-9);
    check('and turning by nothing leaves it where it was',
      veh.turn([3, 4, 5], 0, 0, 0).every((t, i) => Math.abs(t - [3, 4, 5][i]) < 1e-9));
  }

  /* --- and seventy-seven of them, parked ---------------------------- */
  const { Game } = await import('../js/game.js');
  const THREE2 = await import('three');
  const scene2 = new THREE2.Scene();
  const gm = new Game({
    level, scene: scene2, camera: {},
    textures: tex.bakeTextures(), sprites: spr.bakeSprites(),
    hud: { message() {}, ticMessages() {} }, audio: null,
    input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
             attack: false, use: false, run: false, sample() {}, sensitivity: 0 },
    carAtlas: {},                                   // it never draws in here
  });
  const V = gm.vehicles;
  note('the car park', `${V.count} vehicles in ${(level.carSlots || []).length} bays`);
  check('every bay in the lot has something in it', V.count === (level.carSlots || []).length && V.count > 20);
  /* THE ASK WAS FOR A CUSTOMER CAR PARK. The riot van and the APC are
     measured, packed and ready and neither of them is out there. */
  check('and none of it is police or military',
    V.all.every(v => v.def.use === 'civil'),
    [...new Set(V.all.map(v => v.def.id))].join(', '));
  check('and all four civilian types are represented',
    new Set(V.all.map(v => v.def.id)).size === CIVILIAN.length);

  /* AND THEY ARE IN THE BAYS, not on the lines.

     The bay lines are not geometry — they are one repeat of the BAYROW
     texture, 186 by 180 with the line down its left edge, so where the
     repeat starts is where the bays start. Tiled from the world origin
     it started five units off the middle of every bay in the lot, and
     every one of these cars was parked ON a line instead of between two
     of them. The row now carries its own texture origin, which is what
     makes the arithmetic the parking already used come out true, so this
     measures the two against each other: how far across one repeat of
     the bay texture each car is standing. Half way, or it is on a line. */
  {
    const bay = gm.textures.get('BAYROW');
    const mod = (v, n) => ((v % n) + n) % n;
    const across = [];
    for (const v of V.all) {
      const sec = level.sectorAt(v.x, v.y);
      across.push(sec && sec.floorAnchor && sec.floorTex === 'BAYROW'
        ? mod(v.x - sec.floorAnchor[0], bay.w) : -1);
    }
    const centred = across.filter(t => Math.abs(t - bay.w / 2) < 1).length;
    /* three of them are abandoned at an angle across the lot, which is
       the map saying everybody left at once; the rest are parked */
    note('cars across their bay', `${centred} of ${V.count} dead centre of one`);
    check('every parked car is in the middle of a bay rather than on a line',
      centred >= V.count - 3,
      across.filter(t => Math.abs(t - bay.w / 2) >= 1).map(t => t.toFixed(0)).join(', '));
    check('and the bay rows are exactly one repeat of the bay texture deep',
      level.sectors.filter(s => s.floorTex === 'BAYROW').every(s => {
        const ys = s.poly.map(p => p[1]);
        return Math.abs((Math.max(...ys) - Math.min(...ys)) - bay.h) < 1e-6;
      }));
  }

  /* ONE MESH, not seventy-seven. */
  const carMeshes = scene2.children.filter(o => o.name === 'cars');
  check('the whole car park is one mesh', carMeshes.length === 1);
  check('and it holds every parked vehicle',
    carMeshes[0].geometry.getAttribute('position').array.length ===
    V.all.reduce((n, v) => n + v.slab.position.length, 0));

  /* AND YOU CANNOT WALK THROUGH ONE. Doom's things are cylinders, so a
     vehicle is three of them, each carrying a pointer back to it. */
  const blocks = gm.actors.filter(a => a.type === 'CARBODY');
  check('each vehicle is three of Doom cylinders', blocks.length === V.count * 3 && blocks.every(a => a.solid));
  check('and none of them has a state or a sprite to draw', blocks.every(a => !a.state && !a.mesh));
  check('and every one of them knows which vehicle it is part of',
    blocks.every(a => a.vehicle && V.all.includes(a.vehicle)));
  check('and a hatchback gets a smaller cylinder than a van',
    car.carBlockRadius(VEHICLES.hatchback) < car.carBlockRadius(VEHICLES.van),
    `${car.carBlockRadius(VEHICLES.hatchback)} against ${car.carBlockRadius(VEHICLES.van)}`);
  const p0 = gm.player, one = V.all[0];
  check('you cannot walk into the middle of one', p0.thingInWay(one.x, one.y));
  check('nor into either end of it',
    car.carBlockers(one.def, one.x, one.y, one.yaw).every(b => p0.thingInWay(b.x, b.y)));

  /* --- and what happens to one -------------------------------------- */
  {
    /* the loneliest one in the lot, so the chain reaction does not make
       the arithmetic below somebody else's */
    let target = V.all[0], far = -1;
    for (const v of V.all) {
      let near = Infinity;
      for (const o of V.all) if (o !== v) near = Math.min(near, Math.hypot(o.x - v.x, o.y - v.y));
      if (near > far) { far = near; target = v; }
    }
    const startHealth = target.health, ground = target.ground;
    target.ignite();
    check('a vehicle you set light to is on fire', target.burning > 0);
    check('and the tarmac under it is too', gm.fire.heatAt(target.x, target.y) > 0);

    const seen = [];
    let blasts = 0;
    const realExplode = gm.explode.bind(gm);
    gm.explode = (a, o) => { blasts++; return realExplode(a, o); };
    for (let i = 0; i < 500 && target.state !== 'wreck'; i++) {
      gm.tic();
      if (seen[seen.length - 1] !== target.state) seen.push(target.state);
    }
    note('one vehicle, lit', seen.join(' -> '));
    check('being on fire eventually takes it apart',
      target.health < startHealth && target.state === 'wreck');
    check('and it went up, flew, and came down', seen.join(',') === 'parked,air,settle,wreck', seen.join(','));
    /* TWO BANGS: one as it leaves and one as it lands. */
    check('it exploded twice, not once', blasts >= 2, `${blasts} explosions`);

    /* IT LANDS ON ITS ROOF. That is the whole point of aiming the roll
       rate at the flight time rather than picking one and hoping. */
    const over = Math.abs(((target.rx / Math.PI) % 2) - 1);
    check('and it is lying on its roof', over < 0.06,
      `${(target.rx / Math.PI).toFixed(3)} half-turns`);
    /* and its lowest corner is on the tarmac, whatever angle it stopped at */
    const low = veh.extentOf(target.corners, target.rx, target.rz).lo;
    check('and its lowest corner is exactly on the tarmac',
      Math.abs((target.cz + low) - ground) < 1e-6, `${(target.cz + low - ground).toFixed(4)} off`);
    check('and it is still in the way', target.blockers.length === 3 &&
      gm.player.thingInWay(target.x, target.y));
    check('and it is burnt, so js/material.js puts coals on it',
      V.restSlabs.some(s => s.charred.every(c => c === 1)));

    /* DEBRIS: pieces off it, which fly, land and lie there smouldering. */
    note('what came off it', `${V.flying.length} still in the air, ${V.resting.length} on the tarmac`);
    check('it threw pieces of itself', V.flying.length + V.resting.length > 8);
    for (let i = 0; i < 400 && V.flying.length; i++) gm.tic();
    check('and every one of them came to rest', V.flying.length === 0);
    check('and each is lying on the ground rather than in it',
      V.resting.every(c => Math.abs(c.z - (c.ground - veh.extentOf(c.corners, c.rx, c.rz).lo)) < 1e-6));
    check('and they are all in the one wreckage mesh',
      scene2.children.filter(o => o.name === 'cars').length === 2 &&
      V.restSlabs.length >= V.resting.length);

    /* THE CHAIN REACTION, which is not a feature anybody wrote: cars are
       flammable and explosions light what they reach. */
    const gone = V.all.filter(v => v.state !== 'parked').length;
    note('the lot after one went up', `${gone} of ${V.count} vehicles`);
    check('and the bang set light to whatever was near enough', gone >= 1);
  }
}

section('the gun');
{
  const fs = await import('node:fs');
  const G = await import('../js/glb.js');
  const buf = fs.readFileSync(new URL('../assets/models/flamethrower.glb', import.meta.url));
  const { json, bin } = G.parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const names = json.nodes.map(n => n.name);
  note('model', `${json.nodes.length} nodes, ${json.images.length} image, ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  check('the marker spheres are gone', !names.some(n => /CLAUDE/i.test(n)), names.join());
  check('the gun and its readout remain', names.includes('flame_thrower') && names.includes('FT_hud'));
  const a = json.asset.extras?.anchors;
  check('their positions are kept as anchors', !!a && a.pilot.length === 3 && a.nozzle.length === 3);
  check('the nozzle is at the end of the barrel, the pilot just under it',
    a.nozzle[2] > 0.6 && a.pilot[2] > 0.6 && a.pilot[1] < a.nozzle[1]);
  check('only the diffuse survives', json.images.length === 1 && json.materials.length === 1 && !json.materials[0].normalTexture);
  const pos = G.readAccessor(json, bin, json.meshes[0].primitives[0].attributes.POSITION);
  check('the mesh is intact', pos.array.length === 11689 * 3 && pos.itemSize === 3, `${pos.array.length / 3} vertices`);
  check('every buffer view is used', json.bufferViews.every((bv, i) => json.accessors.some(x => x.bufferView === i) || json.images.some(im => im.bufferView === i)));
}

/* ---------- the site ---------- */
section('the site');
{
  /* The deploy is a copy, and a copy can leave something out. The fire
     strips were loaded by main.js and absent from the build for a
     commit, and the game fell back to its baked flames on the live site
     without a word — so this assembles the site into a scratch
     directory exactly as CI does and checks that every asset path the
     page can load is in it. Paths are read out of the page's own source,
     so a new asset is covered the day it is referenced. */
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const { fileURLToPath } = await import('node:url');
  const { execFileSync } = await import('node:child_process');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sellwrong-site-'));
  let built = '';
  try { built = execFileSync('sh', ['tools/build-site.sh', out], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (e) { built = ''; }
  note('build', built || 'FAILED');
  check('the site assembles', !!built);

  const sources = [path.join(root, 'index.html'), path.join(root, 'manifest.webmanifest')];
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(js|css)$/.test(e.name)) sources.push(p);
    }
  };
  walk(path.join(root, 'js')); walk(path.join(root, 'css'));
  const dirs = new Set(), files = new Set();
  for (const f of sources) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/assets\/[\w./-]+/g)) {
      const ref = m[0].replace(/[./]+$/, '');
      if (/\.\w+$/.test(ref)) { files.add(ref); dirs.add(path.posix.dirname(ref)); }
      else dirs.add(ref);
    }
  }
  note('asset paths in the page', `${dirs.size} directories, ${files.size} files named outright`);
  const missingDirs = [...dirs].filter(d => !fs.existsSync(path.join(out, d)));
  const missingFiles = [...files].filter(f => !fs.existsSync(path.join(out, f)));
  check('every asset directory the page loads from is in the built site', missingDirs.length === 0, missingDirs.join());
  check('and every file it names outright', missingFiles.length === 0, missingFiles.join());
  check('and no fire strips, because the fire is drawn now', !fs.existsSync(path.join(out, 'assets/fire')));
  check('the page, its icon and its manifest are', ['index.html', 'icon.png', 'manifest.webmanifest'].every(f => fs.existsSync(path.join(out, f))));
  check('and the source tree is not', !fs.existsSync(path.join(out, 'tools')) && !fs.existsSync(path.join(out, 'README.txt')) && !fs.existsSync(path.join(out, 'art')));
  fs.rmSync(out, { recursive: true, force: true });
}

/* ---------- verdict ---------- */
console.log(`\n  ${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} checks passed, ${fail} failed`);
if (fail) { console.log('\n' + problems.map(p => '    ! ' + p).join('\n')); process.exit(1); }
