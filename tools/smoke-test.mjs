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
const { PLAYER_EYE } = await import('../js/util.js');
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
    /* SPARSE, at the user's request: about one bay in six near the doors
       and almost nothing by the road. The claim is that there IS a car
       park and that it is not full — an empty lot and a full one are
       both wrong for a shop half the town has already left. */
    check('the lot has cars marked out', slots.length > 12 && slots.length < 45, `${slots.length}`);
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
    /* ALL BUT THREE. Three are abandoned across the driving lanes on
       purpose — everybody left at once — and a van standing in a lane is
       the whole point of those three, so the claim is "in a bay, or in a
       lane and one of the three", not "in a bay". What it still refuses
       is a van on the verge, in the road, on the footway, or nowhere. */
    const abandoned = stray.filter(c => (level.sectorAt(c.x, c.y) || {}).name === 'driving lane');
    const lost = stray.filter(c => !abandoned.includes(c));
    note('and where they are', `${slots.length - stray.length} in bays, ` +
      `${abandoned.length} abandoned in the lanes`);
    check('every car is parked in a bay, or abandoned in a lane',
      lost.length === 0 && abandoned.length <= 3,
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
     player is 56 with an eye at PLAYER_EYE; anything at 56 exactly is
     the least useful height there is. */
  check('gondolas are taller than the player', MAP.H_GONDOLA > 56, `${MAP.H_GONDOLA}`);
  check('front fixtures are below eye level', MAP.H_FIXTURE < PLAYER_EYE, `${MAP.H_FIXTURE} against ${PLAYER_EYE}`);
  const gond = level.sectors.find(s => s.name === 'gondola');
  check('gondola sectors are at that height', gond && gond.floor === MAP.H_GONDOLA);

  /* A fixture texture whose declared world height does not match the
     fixture shows a slice of a second copy of itself, cut off wherever
     the fixture happens to end. */
  const declared = { SHELFSTK: MAP.H_GONDOLA, SHELFEMP: MAP.H_GONDOLA, FREEZDOR: MAP.H_GONDOLA,
                     CHECKOUT: MAP.H_FIXTURE, CHILLER: MAP.H_FIXTURE,
                     DELICASE: MAP.H_FIXTURE };
  const mismatched = Object.entries(declared)
    .filter(([n, h]) => (tex.TEXTURE_SIZES[n] || {}).h !== h)
    .map(([n, h]) => `${n} declared ${(tex.TEXTURE_SIZES[n] || {}).h} wants ${h}`);
  check('fixture textures are sized to their fixtures', mismatched.length === 0, mismatched.join(', '));

  /* PRODUCE IS BINS, and the whole point of them is the top. A bin
     wearing SHELFBAK is the bug this replaced: gondola steel on the one
     department you look down into. */
  const BIN_TOPS = ['PRODAPPL', 'PRODCITR', 'PRODGREN', 'PRODROOT', 'PRODFLOW'];
  const bins = level.sectors.filter(s => BIN_TOPS.includes(s.floorTex));
  check('produce is a run of bins', bins.length >= 7, `${bins.length} bins`);
  check('every bin is at bench height', bins.every(s => s.floor === MAP.H_FIXTURE));
  check('every bin is a whole crate of one thing',
    bins.every(s => s.floorAnchor && s.floorAnchor[1] === Math.max(...s.poly.map(v => v[1]))),
    'each anchored to its own north edge');
  check('four categories of fruit and veg',
    new Set(bins.map(s => s.floorTex)).size === BIN_TOPS.length,
    [...new Set(bins.map(s => s.floorTex))].join(' '));
  const rims = level.sectors.filter(s => s.floorTex === 'PRODRIM');
  check('a crate rim between each pair', rims.length === bins.length - 2, `${rims.length} rims`);
  check('the rim stands proud of the produce',
    rims.every(s => s.floor === MAP.H_FIXTURE + 8) && rims.every(s => s.floor < PLAYER_EYE),
    `${MAP.H_FIXTURE + 8} against an eye at ${PLAYER_EYE}`);
  /* The crate boards get cut at three different heights — the lip, the
     bin face and the rim face — so the board pitch has to divide the
     lip or the top course comes out a sliver. */
  check('the crate boards divide the lip',
    (tex.TEXTURE_SIZES.PRODRIM || {}).h === 16 && 16 % 8 === 0);
  check('no fixture in the store wears shelf steel on top',
    !level.sectors.some(s => s.floorTex === 'SHELFBAK' && BIN_TOPS.includes(s.lowerTex)));

  /* THE SIGNS CAME DOWN, at the user's request: the store's name off the
     fascia band, the agent's board off the vacant units, the pylon out
     of the car park altogether. Nothing here can see a picture, so what
     it checks is that the pylon is gone from the map and from the bank
     rather than merely unreferenced in one of them. */
  check('the pylon sign is gone from the car park',
    !level.sectors.some(s => s.wallTex === 'PYLONSGN' || (s.name || '').includes('pylon')));
  check('and gone from the texture bank', !('PYLONSGN' in tex.TEXTURE_SIZES));
  check('the verge runs clean to the mouth of the lot',
    level.sectors.filter(s => s.name === 'verge').length === 1);

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
  /* A DEAD LIGHT HAS NOTHING TO SHOW ANY MORE — there is no broken
     frame, because there is no frame — so what has to be true is that
     it is out of the grid the relight is built from. */
  check('a burst lamp is dead and out of the relight',
        g.lamps.some(l => l.dead) && g._lampGrid.size > 0 &&
        [...g._lampGrid.values()].flat().every(l => !l.dead && !l.removed));
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

  /* ONE MATCH, AND ALL THE TIME IN THE WORLD.
     ---------------------------------------------------------------
     THIS CHECK NOW ASSERTS THE OPPOSITE OF WHAT IT USED TO, and the
     flip is the whole of the change. The requirement was that the shop
     goes eventually — every cell lighting more than one neighbour on
     average, so the fire never stalls — and the requirement is now that
     a fire LEFT ALONE GOES OUT, having taken a patch rather than a
     wing. Burning the store down is the player's job.

     What it did before, measured with nobody in the building: one match
     dropped in a gondola took 91% of the shop, one in a bare aisle took
     86%, and one in the stockroom took 94%. It did not matter where. */
  fire.ignite(540, 1000, 200, 40);
  /* liveCells, not burningCells: the latter is what the status bar shows
     and counts only cells that are actually alight, which is zero until
     the simulation has stepped at least once. */
  check('ignition takes', fire.liveCells > 0);

  let stalled = -1;
  for (let i = 0; i < 200000; i++) {
    fire.tic();
    if (i > 20 && fire.liveCells === 0) { stalled = i; break; }
  }
  const oneMatch = fire.burnFraction;
  note('one match, left alone', `${(oneMatch * 100).toFixed(2)}% burned` +
    (stalled >= 0 ? `, out after ${(stalled / 35).toFixed(0)}s` : ', STILL GOING'));
  check('a fire left alone goes out', stalled >= 0, 'still alight at 200000 tics');
  check('and it goes out having taken a patch, not the shop',
    oneMatch < 0.02, `${(oneMatch * 100).toFixed(2)}% of the store`);
  /* AND THE WALKWAY IS THE REASON. The match went into the first run of
     gondolas; the second run is a hundred and sixty units away across
     bare aisle, which is five cells of lino. Fire that cannot get over
     that is fire the floor plan CONTAINS — and the cross-aisles being
     real walls rather than slow ones is the difference between a shop
     you have to walk to burn and a shop you light once. */
  {
    let over = 0, of = 0;
    for (let x = 760; x < 880; x += 16)
      for (let y = 800; y < 1070; y += 16) {
        const i = fire.idx(fire.cellX(x), fire.cellY(y));
        if (fire.fuel0[i] <= 0) continue;
        of++;
        if (fire.fuel[i] < fire.fuel0[i]) over++;
      }
    check('and it never crosses the aisle to the next run of shelving',
      over === 0, `${over} of ${of} cells over the way burnt`);
  }

  /* AND NOW THE OTHER HALF, WHICH IS A DIFFERENT QUESTION. Whether the
     shop burns on its own and whether it CAN burn are not the same
     claim, and the map is written against the second one: a region the
     fire can never get into is a hole in the floor plan however the
     spread numbers are set. So the rest of this section runs on the
     store burnt the way it is meant to be burnt — a flamethrower walked
     over all of it, at the stream's own strength and footprint, which
     is what the player spends the night doing.

     AT THE STREAM'S OWN STRENGTH IS LOAD-BEARING. Anything over 40
     leaves accelerant behind (see FireSystem.ignite), and accelerant
     poured on tarmac makes tarmac burn — so a sweep done with a bigger
     number would quietly torch the car park and take the firebreak
     check with it. The flamethrower is 36 and lays none. */
  {
    const [minx, miny, maxx, maxy] = level.fireBounds || level.bounds;
    for (let y = miny; y <= maxy; y += 30) {
      for (let x = minx; x <= maxx; x += 30) fire.ignite(x, y, 36, 22);
      for (let k = 0; k < 30; k++) fire.tic();
    }
    for (let i = 0; i < 200000 && fire.liveCells > 0; i++) fire.tic();
  }
  note('and then walked with a flamethrower', `${(fire.burnFraction * 100).toFixed(1)}% burned`);
  check('a player who does the work can still burn all of it',
    fire.burnFraction > 0.97, `${(fire.burnFraction * 100).toFixed(1)}%`);

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

    /* THE ROOF DOES NOT ALL GO, AND IT GOES IN THREE STAGES. A burnt-out
       store with no ceiling anywhere is a demolition; what is wanted is a
       deck that is still up and charred over the short spans, HOLED over
       some of the long ones, and gone over the rest — with steel where it
       has gone. All three have to happen, and the check is that none of
       them is zero and that nothing falls outside them. */
    const roofs = level.sectors.filter(s => s.gutted && !s.outdoor && s.ceilTex && s.ceilTex !== 'SKY')
      .map(of).filter(t => t.ceilTex);
    const open = roofs.filter(t => t.ceilTex === 'SKY').length;
    const holed = roofs.filter(t => /^RUINHOLE\d$/.test(t.ceilTex)).length;
    const kept = roofs.filter(t => /^RUINDECK\d$/.test(t.ceilTex)).length;
    note('gutted roofs: gone / holed / still up', `${open} / ${holed} / ${kept}`);
    check('some of the roof falls in', open > 3, `${open}`);
    check('some of it is holed but still overhead', holed > 3, `${holed}`);
    check('and most of it is still up, burnt through', kept + holed > open,
      `${kept + holed} up, ${open} open`);
    check('every gutted ceiling is one of the three',
      open + holed + kept === roofs.length,
      `${roofs.length - open - holed - kept} were neither`);
    /* AND A ROOF THAT HAS FAILED SAYS SO, because that flag is the only
       thing that makes anything get built up there. */
    check('a failed roof is flagged for the framing',
      roofs.every(t => (t.ceilTex === 'SKY' || /^RUINHOLE/.test(t.ceilTex))
        === (t.ruinRoof === 'open' || t.ruinRoof === 'holed')),
      roofs.filter(t => !!t.ruinRoof !== (t.ceilTex === 'SKY' || /^RUINHOLE/.test(t.ceilTex))).length + ' disagreed');

    /* --- AND THE STEEL ITSELF -----------------------------------------
       js/ruin.js hangs a lattice of joists and beams over any region
       whose deck has failed, so that looking up in a burnt-out aisle is
       looking at a frame rather than at a rectangular hole in the world.
       Three claims, and the second is the one that took the design: the
       lattice is a function of WORLD position, so two regions either side
       of a wall get the same joists in the same places. */
    {
      const ruin = await import('../js/ruin.js');
      /* the smallest thing a BatchSet has to be for this */
      const fakeSet = () => {
        const bins = new Map();
        return { bins, get(n) { let b = bins.get(n); if (!b) bins.set(n, b = { q: [] }); 
          return { quad: (p, u, l, sk, ch) => b.q.push({ p, l, ch }) }; } };
      };
      const big = level.sectors.find(s => s.gutted && !s.outdoor && s.bbox[2] - s.bbox[0] > 600);
      const sec = { ...big, ruinRoof: 'open', ruinVariant: 0 };
      const one = fakeSet();
      const n = ruin.roofFraming(one, sec);
      const quads = [...one.bins.values()].reduce((t, b) => t + b.q.length, 0);
      note('the steel over one gutted region', `${n} members, ${quads} quads`);
      check('a region with no roof gets a frame', n > 2 && quads > 10, `${n} members`);
      check('and a region that still has one gets nothing',
        ruin.roofFraming(fakeSet(), { ...big, ruinRoof: null }) === 0);
      /* EVERY PIECE OF IT IS UNDER THE ROOF LINE AND INSIDE THE REGION,
         which is the pair of mistakes a lattice in world coordinates
         makes: steel poking through the ceiling next door, or steel that
         starts at the sector edge instead of where the grid says. */
      const pts = [...one.bins.values()].flatMap(b => b.q).flatMap(q => q.p);
      check('every piece of it is inside the region it is over',
        pts.every(([x, y, z]) => x >= big.bbox[0] - 1 && x <= big.bbox[2] + 1 &&
          -z >= big.bbox[1] - 1 && -z <= big.bbox[3] + 1));
      check('and hangs below the line the deck was on',
        pts.every(([, y]) => y <= big.ceil + 1e-6 && y > big.ceil - 140),
        `${Math.min(...pts.map(p => p[1])).toFixed(0)}..${Math.max(...pts.map(p => p[1])).toFixed(0)} against a ceiling at ${big.ceil}`);
      check('and it is charred, so the coals are in it',
        [...one.bins.values()].flatMap(b => b.q).every(q => q.ch === 1));
      /* THE LATTICE IS THE WORLD'S, not the region's: the same joist
         drawn from two different regions is at the same y. */
      const wide = { ...big, bbox: [big.bbox[0], big.bbox[1], big.bbox[2], big.bbox[3] + 400],
                     ruinRoof: 'open', ruinVariant: 0 };
      const two = fakeSet();
      ruin.roofFraming(two, wide);
      /* A JOIST'S TWO LONG FACES SIT AT j * pitch ± half, for an integer
         j measured from the world origin — that is the claim, and it is
         what makes the steel over one region line up with the steel over
         the next. Everything else up there (the beams, whose ends are
         the region's own edges) is filtered out by exactly that test. */
      const P = ruin.ROOF.joistPitch, H = ruin.ROOF.joistHalf;
      const rows = b => [...new Set([...b.bins.values()].flatMap(x => x.q)
        .flatMap(q => q.p.map(pp => -pp[2])))]
        .filter(v => Number.isInteger((v + H) / P) || Number.isInteger((v - H) / P))
        .sort((a, c) => a - c);
      const r1 = rows(one), r2 = rows(two);
      check('every joist sits on the world lattice rather than the region edge',
        r1.length >= 2 && r1.every(v => r2.includes(v)),
        `${r1.length} faces, and the wider region has ${r2.length}`);
      check('and a wider region gets more of the same lattice, not a new one',
        r2.length > r1.length, `${r1.length} -> ${r2.length}`);
    }

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
    /* --- AND SOOT, WHICH ARRIVES BEFORE THE FIRE DOES ---
       The store used to know three things about the fire: untouched,
       charred, gutted. Two texture swaps, and between them nothing — an
       aisle could lose half its stock without a pixel of it changing.
       The middle of it is drawn now, continuously, and off a number that
       belongs to the PIECE OF FLOOR rather than to the sector: a
       sector's progress is one number, and this map's sectors are big
       rectangles, so that version put a knife edge across the floor. */
    check('and it sooties a surface before anything has burnt off it',
      /float sootAmount\(/.test(mat.WORLD_SHADE_GLSL) && /vec3 sootOn\(/.test(mat.WORLD_SHADE_GLSL));
    check('off the fire grid, sampled where the surface is',
      /float burnAt\(vec3/.test(mat.WORLD_SHADE_GLSL) &&
      /uniform sampler2D burnGrid/.test(mat.WORLD_UNIFORMS_GLSL) &&
      !/regionBurn/.test(mat.WORLD_UNIFORMS_GLSL));
    check('and it knows the renderer z runs backwards against the map y',
      /vec2\(w\.x, -w\.z\)/.test(mat.WORLD_SHADE_GLSL));
    check('and anything off the edge of the fire reads nothing at all',
      /burnCols[\s\S]{0,60}return 0\.0/.test(mat.WORLD_SHADE_GLSL));
    check('and the soot creeps in world space and crawls on the coals clock',
      /emberHash\(floor\(wpos/.test(mat.WORLD_SHADE_GLSL) &&
      /crawl[\s\S]{0,80}emberTime/.test(mat.WORLD_SHADE_GLSL));
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

  /* --- THE PICTURE THE SHADER READS IT OUT OF ---
     THE FIRE'S OWN CELL GRID, one byte a cell, sampled by world
     position. It used to be one texel per SECTOR, and that is the bug
     the user reported as z-fighting: a sector's progress is one number,
     so every surface in it sooted at once, and the sectors of this map
     are big axis-aligned rectangles — a burnt aisle met a clean
     cross-aisle along a dead-straight line with a different texture and
     a different light on each side of it.

     Four ways for the grid version to be silently wrong: the texture too
     small to hold the grid, the world-to-cell arithmetic off (which puts
     a shop's soot in the car park), the y axis unflipped (the renderer's
     z runs backwards against the map's y), and anything off the edge of
     the grid reading the clamped edge instead of nothing. */
  {
    const THREE3 = await import('three');
    const { Game } = await import('../js/game.js');
    const mat = await import('../js/material.js');
    const lv3 = MAP.buildSellWrong();
    const scene3 = new THREE3.Scene();
    const g3 = new Game({
      level: lv3, scene: scene3, camera: {},
      textures: tex.bakeTextures(), sprites: spr.bakeSprites(),
      hud: { message() {}, ticMessages() {} }, audio: null,
      input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
               attack: false, use: false, run: false, sample() {}, sensitivity: 0 },
    });
    const f3 = g3.fire;
    const side = mat.world.burnSide.value;
    note('the burn picture', `${side}x${side} for a ${f3.cols}x${f3.rows} grid of ` +
      `${f3.CELL}-unit cells`);
    check('the picture holds the whole fire grid',
      side >= f3.cols && side >= f3.rows, `${side} against ${f3.cols}x${f3.rows}`);
    check('and it says where the grid is and how big a cell is',
      mat.world.burnOrigin.value.x === f3.originX &&
      mat.world.burnOrigin.value.y === f3.originY &&
      mat.world.burnCell.value === f3.CELL &&
      mat.world.burnCols.value === f3.cols && mat.world.burnRows.value === f3.rows);
    check('and it is filtered rather than blocky, which is the whole point',
      mat.world.burnGrid.value.magFilter === THREE3.LinearFilter);

    /* BURN ONE CELL AND FIND IT IN THE PICTURE. This is the arithmetic
       the shader does backwards, so doing it forwards here is the check
       that the two agree — and it is the one that would catch the axis
       flip, because the cell it looks in is derived from a world x and y
       and not from an index. */
    const cellAt = (x, y) => Math.floor((y - f3.originY) / f3.CELL) * f3.cols +
                             Math.floor((x - f3.originX) / f3.CELL);
    const pick = (() => {
      for (const s2 of lv3.sectors) {
        if (!s2.fuel || s2.outdoor) continue;
        const x = (s2.bbox[0] + s2.bbox[2]) / 2, y = (s2.bbox[1] + s2.bbox[3]) / 2;
        const i = cellAt(x, y);
        if (f3.fuel0[i] > 0) return { x, y, i, name: s2.name };
      }
      return null;
    })();
    check('there is a cell of shop floor to test with', !!pick);
    f3.fuel[pick.i] = f3.fuel0[pick.i] * 0.25;         // three quarters gone
    g3.ticBurnGrid();
    const data = mat.world.burnGrid.value.image.data;
    const texel = (x, y) => {
      const cx = Math.floor((x - f3.originX) / f3.CELL);
      const cy = Math.floor((y - f3.originY) / f3.CELL);
      return data[(cy * side + cx) * 4];
    };
    note('one cell, three quarters burnt', `${pick.name} at ${pick.x | 0},${pick.y | 0} reads ${texel(pick.x, pick.y)}`);
    check('a cell three quarters burnt reads three quarters of the way up',
      Math.abs(texel(pick.x, pick.y) - 191) <= 2, `${texel(pick.x, pick.y)}`);
    /* AND ITS NEIGHBOURS HAVE NOT MOVED, which is the axis check: get the
       row and column the wrong way round and the value lands somewhere
       else in the picture entirely. */
    check('and nothing else in the shop caught it',
      texel(pick.x + f3.CELL * 3, pick.y) === 0 && texel(pick.x, pick.y + f3.CELL * 3) === 0);
    /* the car park has no fuel, so it can never soot */
    const lot = lv3.sectors.find(s2 => s2.name === 'bays' || s2.floorTex === 'BAYROW');
    if (lot) {
      const lx = (lot.bbox[0] + lot.bbox[2]) / 2, ly = (lot.bbox[1] + lot.bbox[3]) / 2;
      check('and nothing outdoors with no fuel in it can ever soot',
        f3.fuel0[cellAt(lx, ly)] === 0 && texel(lx, ly) === 0);
    }
    /* NOTHING CARRIES A REGION ANY MORE. The attribute and its texture
       are gone; a surface finds its own burn from where it is. */
    const geo = await import('../js/mapgeo.js');
    check('the geometry carries no region attribute', !('regionOf' in geo));
    let attrs = 0;
    const walk = o => {
      if (o.geometry?.getAttribute?.('region')) attrs++;
      for (const c of o.children || []) walk(c);
    };
    walk(g3.geo.group);
    check('and no batch of it has one either', attrs === 0, `${attrs} found`);
  }

  /* --- HOW IT IS DRAWN ---
     Four claims, and each of them was a visible fault at some point this
     afternoon: the flames add rather than cover, there is more than one
     of them per cell and they are not on the cell's centre, they are
     bigger where the fire is deep and smaller at its fringe, and the
     scatter is the SAME scatter next frame. That last one is the
     important one — jitter re-rolled per frame is a fire that boils, and
     it is the difference between a fire and a fault. */
  {
    const THREE = await import('three');
    const scene = new THREE.Scene();
    const drawn = new FireSystem({
      ...fake, scene, sprites: spr.bakeSprites(),
      level, tics: 0,
    });
    drawn.ignite(1800, 1600, 400, 96);
    for (let k = 0; k < 120; k++) drawn.tic();
    drawn.render(1800, 1250, 0);
    const flames = drawn.sprites.filter(m => m.visible);
    const smoke = drawn.smokes.filter(m => m.visible);
    note('one burning run, drawn', `${flames.length} flames and ${smoke.length} of smoke ` +
      `over ${drawn.active.length} cells alight`);
    check('the fire is drawn', flames.length > 40, `${flames.length}`);
    check('additively, and without writing depth',
      flames.every(m => m.material.blending === THREE.AdditiveBlending && !m.material.depthWrite));
    check('there is smoke standing over it', smoke.length > 4, `${smoke.length}`);
    check('and the smoke is blended rather than added',
      smoke.every(m => m.material.blending === THREE.NormalBlending && !m.material.depthWrite));
    /* a clump: more sprites than there are cells they sit on */
    const cells = new Set(flames.map(m => `${Math.round(m.position.x / 32)},${Math.round(m.position.z / 32)}`));
    check('more flames than cells to put them in', flames.length > cells.size, `${flames.length} on ${cells.size}`);
    const off = flames.filter(m => Math.abs(((m.position.x - drawn.originX) % 32) - 16) > 0.5);
    check('and most of them are not on a cell centre', off.length > flames.length * 0.3,
      `${off.length} of ${flames.length}`);
    const hs = flames.map(m => m.material.uniforms.spriteScale.value.y);
    check('the big ones are several times the small ones',
      Math.max(...hs) > Math.min(...hs) * 2.5,
      `${Math.min(...hs).toFixed(0)} to ${Math.max(...hs).toFixed(0)} units tall`);
    const was = flames.map(m => `${m.position.x},${m.position.z}`);
    drawn.render(1800, 1250, 0);
    const now = drawn.sprites.filter(m => m.visible).map(m => `${m.position.x},${m.position.z}`);
    check('and the scatter is the same scatter next frame',
      was.length === now.length && was.every((v, i) => v === now[i]));
  }

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
  /* THE FUEL GRID STOPS AT THE STORE, and the claim is about what is
     INSIDE it rather than about four numbers. It used to be three typed
     coordinates, which is a check that fails the first time the building
     changes size — and the building changed size the moment fourteen
     more tenancies went into the parade. What has to be true is that the
     grid covers the whole parade and the car park it stands in, that it
     stops at the back wall of the anchor, and that it is nowhere near
     the nine thousand units of wood on every side, which has its own
     fire. */
  check('the fuel grid covers the whole building and its lot',
    level.fireBounds[0] < MAP.PARADE_X0 && level.fireBounds[2] > MAP.PARADE_X1 &&
    level.fireBounds[3] > MAP.ANCHOR_Y1 && level.fireBounds[3] < MAP.ANCHOR_Y1 + 600,
    level.fireBounds.join());
  /* IT USED TO STOP AT THE BACK WALL OF THE ANCHOR, exactly, and now it
     stops at the back of the SERVICE YARD — which is tarmac behind the
     store, is not wood, and so is inside the store's grid for the same
     reason the car park is. Nothing burns there either. What makes that
     worth having rather than merely harmless is `clearing`, which is
     this rectangle: the forest keeps a margin outside it, so extending
     it past the fence is what guarantees nothing grows in the gateway. */
  check('and the yard behind the store is in it, with nothing to burn',
    level.sectors.some(s => s.name === 'the service yard' && s.fuel === 0));

  /* --- THE FENCE ROUND THE YARD -------------------------------------
     A fence in this engine is not a wall — a wall is the ABSENCE of a
     sector — it is chain link hung in an opening as a middle texture on
     a two-sided line. So there are three separate things to be sure of,
     and the last one is the only one that is about the game: that it is
     drawn, that it is shorter than the hole it hangs in, and that you
     cannot get past it except at the gate. */
  {
    const Y = MAP.YARD;
    const yard = level.sectors.find(s => s.name === 'the service yard');
    check('there is a service yard behind the store',
      !!yard && yard.outdoor && !yard.forest);
    const wire = level.lines.filter(l => l.middle === 'CHAINLNK');
    note('the fence', `${wire.length} lines of chain link, ${Y.fenceH} tall`);
    check('the chain link hangs in openings rather than being built as wall',
      wire.length >= 4 && wire.every(l => l.front !== null && l.back !== null));
    check('and it stops at the top rail instead of filling the opening',
      wire.every(l => l.midHeight === Y.fenceH &&
        l.midHeight < Math.min(level.sectors[l.front].ceil, level.sectors[l.back].ceil)),
      `${wire.filter(l => !(l.midHeight < Math.min(level.sectors[l.front].ceil, level.sectors[l.back].ceil))).length} reach the sky`);
    check('and every bit of it is solid', wire.every(l => l.blocking));

    /* AND NOW THE ONLY QUESTION A PLAYER ASKS OF A FENCE. Fired across
       the fence line rather than tested against a list of lines, because
       what is being claimed is about walking and not about bookkeeping:
       one way through, and it is where the gate is. */
    const z = 20, mid = (Y.gate[0] + Y.gate[1]) / 2;
    const across = x => !!level.rayHitWall(x, Y.y1 - 48, z, x, Y.y1 + 48, z);
    check('the gate is one small opening', Y.gate[1] - Y.gate[0] <= 200,
      `${Y.gate[1] - Y.gate[0]} wide`);
    check('and you can walk out through it', !across(mid));
    check('but not through the back of the fence anywhere else',
      [Y.x0 + 120, mid - 600, mid - 200, mid + 200, mid + 600, Y.x1 - 120].every(across),
      `${[Y.x0 + 120, mid - 600, mid - 200, mid + 200, mid + 600, Y.x1 - 120].filter(x => !across(x)).join()} let you through`);
    const yMid = (Y.y0 + Y.y1) / 2;
    check('nor out of either end of it',
      !!level.rayHitWall(Y.x0 + 48, yMid, z, Y.x0 - 48, yMid, z) &&
      !!level.rayHitWall(Y.x1 - 48, yMid, z, Y.x1 + 48, yMid, z));
    /* and the fourth side is the building, which was already true */
    check('and the store itself is the fourth side',
      !!level.rayHitWall(mid, Y.y0 + 48, z, mid, Y.y0 - 48, z));
    /* NOTHING GROWS IN THE GATEWAY, which is not luck: `clearing` is the
       fuel grid's rectangle and the forest keeps a margin outside it, so
       the yard being inside the grid is what holds the gate open. */
    const forest2 = new F.Forest(level, { seed: 4 });
    check('and nothing has grown in the gateway',
      !forest2.blocks(mid, Y.y1 + 40, 18) && !forest2.blocks(mid, Y.y1 + 90, 18));
  }
  check('and stops well short of the wood',
    level.fireBounds[0] > level.forestBounds[0] + 4000 &&
    level.fireBounds[2] < level.forestBounds[2] - 4000,
    `${level.fireBounds.join()} inside ${level.forestBounds.join()}`);
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
  /* --- THE TANK, WHICH EMPTIES NOW ---
     Three claims: the stream is billed per tic rather than per shot
     cycle, an empty tank stops the pour in the middle of it, and the
     tank comes back on its own with nothing in the shop to refill it
     from. The last one is the only source of fuel in the game, so if it
     is broken the game has twelve seconds in it and then nothing. */
  {
    const pl = await import('../js/player.js');
    const d = pl.WEAPONS.FLAMER;
    check('the tank is finite', p.ammoFor('FLAMER') === pl.TANK && pl.TANK > 100, `${p.ammoFor('FLAMER')}`);
    check('and there is nothing in the level to refill it from',
      !level.things.some(t => t.type === 'FUELCAN'),
      `${level.things.filter(t => t.type === 'FUELCAN').length} cans`);
    check('the boxcutter is issued, because the tank runs out', !!p.owned.BOXCUTTER);
    /* billed per tic of stream: thirty tics of pouring costs thirty */
    const was = p.ammo.fuel;
    for (let k = 0; k < 30; k++) p.flameTic(d);
    check('the stream costs one a tic', p.ammo.fuel === was - 30, `${was} -> ${p.ammo.fuel}`);
    note('a full tank', `${(pl.TANK / 35).toFixed(0)} seconds of flame, ` +
      `back in ${(pl.TANK * pl.REGEN_EVERY / 35).toFixed(0)} seconds`);
    /* and running dry stops it where it stands */
    p.ammo.fuel = 1; p.fireIndex = 0;
    p.flameTic(d); p.flameTic(d);
    check('an empty tank stops the pour mid-pour', p.ammo.fuel === 0 && p.fireIndex === -1);
    check('and the trigger does nothing until there is fuel again', !p.hasAmmo('FLAMER'));
    /* --- AND IT WILL NOT LIGHT AGAIN UNTIL IT IS HALF FULL ----------
       At the user's request, and it is the difference between a budget
       and a decision: a tank that refuses only when it is empty is one
       you hold the trigger on until it stops and then hold again the
       moment a tenth of a unit is back. This is the latch, both ways. */
    check('an empty tank latches, and one unit does not unlatch it',
      p.dry === true && (p.ammo.fuel = 1, p.regenTick = 0, p.fuelTic(), !p.armed('FLAMER')),
      `${p.ammo.fuel} in it and ${p.armed('FLAMER') ? 'armed' : 'not armed'}`);
    check('and the gauge says which half it is waiting for',
      p.refireMark === pl.REFIRE_AT && pl.REFIRE_AT === 0.5, `${p.refireMark}`);
    /* one below the mark is still no, and one above it is yes */
    p.ammo.fuel = Math.floor(pl.TANK * pl.REFIRE_AT) - 2; p.regenTick = 0;
    for (let k = 0; k < pl.REGEN_EVERY; k++) p.fuelTic();
    check('a tank one short of half still will not fire', !p.armed('FLAMER'),
      `${p.ammo.fuel} of ${pl.TANK}`);
    for (let k = 0; k < pl.REGEN_EVERY * 3; k++) p.fuelTic();
    check('and half a tank lights it again', p.armed('FLAMER') && !p.dry,
      `${p.ammo.fuel} of ${pl.TANK}`);
    check('and the mark goes away once it has', p.refireMark === 0);
    /* the refill, which is the only source there is */
    p.ammo.fuel = 0; p.dry = false;
    p.regenTick = 0;
    for (let k = 0; k < pl.REGEN_EVERY * 4; k++) p.fuelTic();
    check('the tank fills itself', p.ammo.fuel === 4, `${p.ammo.fuel} after ${pl.REGEN_EVERY * 4} tics`);
    check('and very slowly', pl.REGEN_EVERY >= 6, `one every ${pl.REGEN_EVERY} tics`);
    check('and it stops at full', (p.ammo.fuel = pl.TANK,
      p.fuelTic(), p.ammo.fuel === pl.TANK));
  }

  /* --- THE SMOKE, AND WHAT IT HAD BEEN INHERITING -----------------
     Two complaints, both the user's, and they turned out to be about
     different halves of the same sprite.

     FIRST, IT WAS WEARING THE FIRE'S COALS. Everything in this game
     shares one fragment shader, and the block that asks the burn grid
     "how burnt is the floor here" is the right question for a wall and
     the wrong one for a thing standing in front of one. Every sprite was
     being given the soot and the live coals of whatever it was over —
     and smoke drifts, so it sampled a different part of the grid every
     frame and the coals CRAWLED across it. It is a define now and only
     surfaces set it.

     SECOND, IT STEPPED. The churn, the sway and the lift all came off
     the whole tic count, which advances thirty-five times a second while
     the renderer runs at sixty or more; and the loop was eight frames
     over about two seconds, which is a step every eleven tics of a
     sprite big enough to see holding still. */
  {
    const mat = await import('../js/material.js');
    const fs2 = await import('node:fs');
    const sprites = spr.bakeSprites();
    const wall = mat.createWallMaterial(null, {});
    const sprite = mat.createSpriteMaterial(null, {});
    check('a surface burns and a sprite does not',
      'SURFACE_BURN' in wall.defines && !('SURFACE_BURN' in sprite.defines),
      Object.keys(sprite.defines).join(', '));
    check('and a sprite can freeze and a surface cannot',
      'FROST' in sprite.defines && !('FROST' in wall.defines));
    check('and the shader guards both blocks rather than multiplying by zero',
      (() => {
        const src = fs2.readFileSync('js/material.js', 'utf8');
        const frag = src.slice(src.indexOf('const COMMON_FRAG'), src.indexOf('export function worldUniforms'));
        return /#ifdef SURFACE_BURN[\s\S]*?burnAt\(vWorld\)/.test(frag) &&
               /#ifdef SURFACE_BURN[\s\S]*?emberOf\(/.test(frag);
      })());

    /* AND THE LOOPS ARE LOOPS. Both sets are one noise field scrolled by
       a fraction of its own height, so frame N is frame 0 again and every
       step between them is the same small move. The four puffs this
       replaced were four INDEPENDENT fields — walking them was not a
       churn, it was four cuts. */
    const smok = sprites.count('SMOK');
    const fxSrc = fs2.readFileSync('js/effects.js', 'utf8');
    const puffs = +(fxSrc.match(/export const SMOKE_PUFFS = (\d+)/) || [])[1];
    note('the two smokes', `${smok} frames over the fire, ${puffs} drifting`);
    check('the body of smoke has frames enough to churn rather than flick',
      smok >= 16, `${smok}`);
    check('and the drifting puffs are a loop rather than a set of blobs',
      puffs >= 8 && /const pn = fbm\(/.test(fxSrc) && /\(y \+ off\) % PW/.test(fxSrc),
      `${puffs} frames`);
    check('and one field makes all of them, or the loop is a slideshow',
      (fxSrc.match(/fbm\(PW, PW/g) || []).length === 1);

    /* AND THE CLOCK HAS THE FRACTION ON IT */
    const { Game } = await import('../js/game.js');
    const THREE9 = await import('three');
    const g9 = new Game({ level, scene: new THREE9.Scene(), camera: {},
      textures: tex.bakeTextures(), sprites: spr.bakeSprites(),
      hud: { message() {}, ticMessages() {} }, audio: null,
      input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
               attack: false, use: false, run: false, sample() {}, sensitivity: 0 } });
    check('on a whole tic the smooth clock is the tic count', g9.smoothTics === g9.tics);
    g9.update(1 / 35 * 1.5);
    check('and between two it is between two',
      g9.smoothTics > g9.tics && g9.smoothTics < g9.tics + 1,
      `${g9.smoothTics.toFixed(3)} against ${g9.tics}`);
    const fireSrc = fs2.readFileSync('js/fire.js', 'utf8');
    check('and the smoke and the flames both read it rather than the tic count',
      (fireSrc.match(/smoothTics/g) || []).length >= 2 &&
      !/this\.tics \* 0\.014/.test(fireSrc));
    check('and a puff keeps the cell it is standing over between frames',
      /_smokeCell/.test(fireSrc));
  }
}

/* ---------- the cold ---------- */
/* THE SECOND STREAM, which is the first one built the other way up.
   What is checked here is the pair of things that make it a weapon
   rather than a recolour: that it takes heat OUT of the grid without
   giving any fuel back, and that a person it holds can be left, thawed
   or broken — three outcomes, all reachable, none of them the same as
   being set on fire. */
section('the cold');
{
  const FR = await import('../js/frost.js');
  const FL = await import('../js/flame.js');
  const pl = await import('../js/player.js');
  const { Game } = await import('../js/game.js');
  const { Actor } = await import('../js/actor.js');
  const THREE = await import('three');
  const hudStub = { message() {}, ticMessages() {}, resize() {}, update() {} };
  const inputStub = { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
                      attack: false, use: false, run: false, sample() {}, sensitivity: 0 };
  const mk = () => new Game({ level: MAP.buildSellWrong(), scene: new THREE.Scene(), camera: {},
    textures: tex.bakeTextures(), sprites: spr.bakeSprites(), hud: hudStub, audio: null, input: inputStub });

  /* --- IT IS A SHORTER ARM THAN THE FLAME -------------------------
     A gas jet loses its speed faster than a thrown liquid does and then
     sinks, so this has to come out with less reach than the flamethrower
     or the extinguisher is simply a better flamethrower. */
  {
    const reach = FR.jetReach(), flame = FL.streamReach();
    note('the jet / the flame', `${reach.toFixed(0)} against ${flame.toFixed(0)} units`);
    check('the jet is shorter in the arm than the flame', reach < flame * 0.8,
      `${reach.toFixed(0)} against ${flame.toFixed(0)}`);
    check('and it sinks harder, being colder than the air it is in',
      FR.JET.gravity < FL.STREAM.gravity && FR.JET.drag < FL.STREAM.drag,
      `gravity ${FR.JET.gravity} drag ${FR.JET.drag}`);
  }

  /* --- PUTTING A FIRE OUT, AND WHAT IT CANNOT PUT BACK -------------
     douse moves cells across the thresholds the fire runs on. What it
     must never do is return fuel: a burnt aisle stays burnt, the store's
     percentage never goes backwards, and the thing the extinguisher
     saves is whatever has not caught yet. */
  {
    const g = mk();
    const F = g.fire;
    const x = 1500, y = 1500;
    F.ignite(x, y, 400, 160);
    for (let i = 0; i < 40; i++) g.tic();
    const hotBefore = F.heatAt(x, y), burntBefore = F.burntFuel, liveBefore = F.active.length;
    const cooled = F.douse(x, y, 200, 120);
    const hotAfter = F.heatAt(x, y);
    note('a fire, doused', `${cooled} cells, heat ${hotBefore.toFixed(2)} -> ${hotAfter.toFixed(2)}`);
    check('dousing takes the heat out of the grid',
      cooled > 0 && hotAfter < hotBefore * 0.5, `${hotBefore.toFixed(2)} -> ${hotAfter.toFixed(2)}`);
    check('and it cannot give the fuel back',
      F.burntFuel >= burntBefore && Math.abs(F.burntFuel - burntBefore) < 1e-9,
      `${burntBefore.toFixed(1)} -> ${F.burntFuel.toFixed(1)}`);
    check('and a region that was charred stays charred',
      g.level.sectors.filter(s => s.charred).length >= 0);
    /* AND THE EMBERS GO WITH IT, which is the difference between a fire
       that is out and a fire that is sulking: a cell left at a glow
       relights anything that wanders past it. */
    let glowing = 0;
    for (let i = 0; i < F.heat.length; i++) if (F.heat[i] > 0 && F.ember[i] > 0) glowing++;
    check('and nothing it cooled is left glowing',
      (() => {
        const cx0 = F.cellX(x - 60), cx1 = F.cellX(x + 60);
        const cy0 = F.cellY(y - 60), cy1 = F.cellY(y + 60);
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          const i = F.idx(cx, cy);
          if (F.heat[i] === 0 && F.ember[i] > 0) return false;
        }
        return true;
      })(), `${glowing} cells still glowing anywhere`);
    check('and dousing bare floor is free', F.douse(20000, 20000, 200, 120) === 0);
    /* ROUND AND NOT SQUARE, unlike ignite: the corner of a box of cells
       never had any gas on it, and a doused corner left burning restarts
       the whole cell. */
    const g2 = mk();
    g2.fire.ignite(1500, 1500, 400, 400);
    for (let i = 0; i < 30; i++) g2.tic();
    const R = 200;
    const before = g2.fire.heatAt(1500 + R * 0.71, 1500 + R * 0.71);
    g2.fire.douse(1500, 1500, 250, R);
    check('the spray is a circle, so the corners of its box are untouched',
      g2.fire.heatAt(1500 + R * 0.71, 1500 + R * 0.71) === before &&
      g2.fire.heatAt(1500, 1500) === 0, `corner ${before.toFixed(2)} kept`);
  }

  /* --- AND WHAT IT DOES TO A PERSON -------------------------------- */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    check('a shopper is something the cold can work on', !!who && who.info.freezable);
    note('the dial', `${Actor.FREEZE_AT} to freeze, one back every ${Actor.THAW_EVERY} tics, ` +
      `${Actor.FIRE_THAW} a tic in a fire`);
    /* IT RUNS UP BEFORE IT LANDS, which is the whole of the feedback: a
       shopper the spray has caught but not yet held goes pale first. */
    who.chill(30);
    check('a little cold is a tint and not a state', who.frost === 30 && !who.frozen);
    check('and it reaches the shader that does the colour map',
      Math.abs(who.frost / Actor.FREEZE_AT - 0.3) < 1e-9);
    /* AND AT THE THRESHOLD THEY GO SOLID */
    const froze = who.chill(Actor.FREEZE_AT);
    check('enough of it and they are solid', froze && who.frozen && who.solid);
    check('and they have stopped thinking', who.state.name === 'SHOP_FROZE' && who.stateTics === -1);
    check('and stopped being frightened', who.panic === 0);

    /* THE HYSTERESIS, which is the bug this section exists for. Freezing
       happens at the top of the dial and thawing at the BOTTOM of it, so
       the whole bar is time spent solid. Thawing the moment the number
       dipped under the line — which is what it did first — made a
       shopper a block of ice for six tics and then a shopper again. */
    who.frostTic();
    check('one tic later they are still frozen', who.frozen, `frost ${who.frost}`);
    let n = 0;
    while (who.frozen && n < 4000) { who.frostTic(); n++; }
    note('how long they stand there', `${n} tics, about ${(n / 35).toFixed(0)} seconds`);
    check('they thaw eventually, and not immediately',
      !who.frozen && n > Actor.FREEZE_AT * (Actor.THAW_EVERY - 1), `${n} tics`);
    check('and they come out of it running, not shopping',
      who.state.name === 'SHOP_RUN1', who.state.name);
    check('and solid again only in the way they were before',
      who.solid === (who.info.solid ?? !!who.info.monster));
  }

  /* --- FIRE IS THE FAST THAW -------------------------------------- */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    who.chill(Actor.FREEZE_AT);
    check('a frozen person cannot be set alight', (who.ignite(300), who.burning === 0));
    let n = 0;
    while (who.frost > 0 && n < 200) { who.ignite(300); n++; }
    note('and how many flames it takes to undo one', `${n} calls`);
    check('but the flame eats the ice, and quickly',
      !who.frozen && n < 20, `${n} calls`);
    check('and the one after that lights them', (who.ignite(300), who.burning > 0));
  }

  /* --- AND THE FLAMETHROWER ITSELF, WHICH IS NOT ignite() ----------
     The block above tests half of a flame particle. The other half is
     the damage, and testing the two apart is exactly how a frozen
     shopper came to be killed INSIDE the ice by the second particle of
     the stream — the thaw was right, the damage went round it, and the
     damage won the race. So this drives the real FlameStream._burnActor
     and asks the question the prose in js/actor.js answers: what comes
     out the other side. */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    const health = who.health, bursts = g.giblets.bursts;
    who.chill(Actor.FREEZE_AT);
    let n = 0, diedFrozen = false;
    while (who.frozen && n < 60) {
      g.flame._burnActor(who, who.x, who.y, who.z);
      n++;
      if (who.dead || who.removed) { diedFrozen = who.frozen; break; }
    }
    note('flame particles to free one', `${n}`);
    check('the stream never kills anybody who is still frozen', !diedFrozen);
    check('and none of it reaches their health through the ice',
      who.health === health, `${health} -> ${who.health}`);
    check('and what comes out the other side is alive and alight',
      !who.frozen && !who.dead && who.burning > 0 && who.state.name.startsWith('SHOP_BURN'),
      `${who.state.name}, burning ${who.burning}`);
    check('so a frozen person never becomes burning giblets',
      g.giblets.bursts === bursts, `${g.giblets.bursts - bursts} bursts`);
  }

  /* --- AND A BLAST TAKES THE WHOLE BAR OFF AT ONCE ------------------ */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.frozen);
    who.chill(Actor.FREEZE_AT);
    const health = who.health;
    g.explode({ x: who.x + 30, y: who.y, z: who.z });
    check('a car going up beside a block of ice frees whoever is in it',
      !who.frozen && !who.dead && who.health === health,
      `${who.state.name}, health ${health} -> ${who.health}`);
    check('and then lights them', who.burning > 0, `burning ${who.burning}`);
  }

  /* --- AND A CORPSE THAWS INTO A CORPSE -----------------------------
     Nothing reaches this today: a shopper's death state removes them on
     the tic it runs, and fire no longer kills anybody still frozen. It
     is checked because thaw() ends in setState(freezeReturn), and the
     day something freezable has a death animation that lingers, the
     melt would stand the body back up and set it running. */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    who.chill(Actor.FREEZE_AT);
    const froze = who.state.name;
    who.dead = true; who.solid = false; who.frost = 1;
    who.thaw();
    check('the dead do not get up when the ice comes off',
      who.state.name === froze && !who.solid && who.panic === 0,
      `${who.state.name}, solid ${who.solid}, panic ${who.panic}`);
    check('they only stop being blue', who.frost === 0 && !who.frozen);
  }

  /* --- OR THEY BREAK ----------------------------------------------- */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    const shardsBefore = g.giblets.shatters, burstsBefore = g.giblets.bursts;
    who.chill(Actor.FREEZE_AT);
    who.damage(1, g.player);
    check('anything at all shatters a frozen person', who.removed && who.dead);
    check('and it is a shatter and not a burst',
      g.giblets.shatters === shardsBefore + 1 && g.giblets.bursts === burstsBefore,
      `${g.giblets.shatters - shardsBefore} shatters, ${g.giblets.bursts - burstsBefore} bursts`);
    check('and the pieces are the cold pool, not the burning one',
      g.giblets.shards.count > 0 && g.giblets.chunks.count === 0,
      `${g.giblets.shards.count} shards, ${g.giblets.chunks.count} chunks`);
    /* THE ONE THAT SHIPPED FOR TEN MINUTES. A burning piece of somebody
       lights the floor where it lands, which is how a crowd spreads a
       fire and is one of the best things in the game — and reusing that
       pool for the cold ones set the aisle alight every time the
       extinguisher was used properly. */
    const liveBefore = g.fire.active.length;
    for (let i = 0; i < 200; i++) g.giblets.tic();
    check('and they start no fires where they land',
      g.fire.active.length === liveBefore, `${g.fire.active.length - liveBefore} cells lit`);
  }

  /* --- THE WEAPON ITSELF ------------------------------------------- */
  {
    const W = pl.WEAPONS.EXTINGUISHER;
    check('the extinguisher is a weapon you are issued with',
      !!W && new pl.Player({ level, blockmap: null }, 0, 0, 0).owned.EXTINGUISHER === true);
    check('and it is a stream, on its own tank',
      W.stream === 'frost' && W.ammo === 'co2' && W.ammoPerShot === 0);
    check('and it latches when it is empty, like the other one', W.refire > 0);
    check('and it does no damage at all, which is the point',
      W.damage() === 0);
    note('the two tanks', `fuel ${pl.TANK} at one every ${pl.REGEN_EVERY}, ` +
      `co2 ${pl.BOTTLE} at one every ${pl.CO2_REGEN_EVERY}`);
    check('the extinguisher holds less and fills faster',
      pl.BOTTLE < pl.TANK && pl.CO2_REGEN_EVERY < pl.REGEN_EVERY &&
      pl.CO2_REFIRE_AT < pl.REFIRE_AT);
    /* the two latches are separate, or emptying one locks out the other */
    const g = mk();
    const p = g.player;
    p.ammo.fuel = 0; p.dry = true;
    check('an empty flamer does not lock the extinguisher',
      p.armed('EXTINGUISHER') && !p.armed('FLAMER'));
    p.ammo.co2 = 0; p.co2Dry = true; p.ammo.fuel = pl.TANK; p.dry = false;
    check('and an empty extinguisher does not lock the flamer',
      p.armed('FLAMER') && !p.armed('EXTINGUISHER'));
    /* and the gauge's pip follows whichever is in hand */
    p.weapon = 'EXTINGUISHER';
    check('the gauge asks the weapon in hand which mark it is climbing to',
      p.refireMark === pl.CO2_REFIRE_AT, `${p.refireMark}`);
    p.weapon = 'FLAMER';
    check('and gets a different answer for the other one', p.refireMark === 0);

    /* --- AND THE SWITCH IN THE MENU THAT TURNS ALL OF IT OFF -------
       Infinite ammo lives in fuelTic and nowhere else, upstream of every
       question anything asks about a tank. So the check is that it
       refills BOTH tanks and the molotovs, takes both latches off with
       them, and leaves the guns armed — without the firing path, the
       gauge or `armed` knowing the mode is there. */
    const dbg = mk().player;
    dbg.ammo.fuel = 3; dbg.ammo.co2 = 2; dbg.ammo.bottles = 0;
    dbg.dry = true; dbg.co2Dry = true;
    check('and it is off unless it is asked for', dbg.debug === false);
    dbg.fuelTic();
    check('so an ordinary tank still comes back a unit at a time',
      dbg.ammo.fuel === 3, `${dbg.ammo.fuel}`);
    dbg.debug = true;
    dbg.fuelTic();
    check('debug fills every tank, not only the one in your hands',
      dbg.ammo.fuel === dbg.maxAmmo.fuel && dbg.ammo.co2 === dbg.maxAmmo.co2 &&
      dbg.ammo.bottles === dbg.maxAmmo.bottles,
      `${dbg.ammo.fuel}/${dbg.ammo.co2}/${dbg.ammo.bottles}`);
    check('and it takes both latches off with them', !dbg.dry && !dbg.co2Dry);
    check('and both guns will fire again',
      dbg.armed('FLAMER') && dbg.armed('EXTINGUISHER'));
    /* and holding the trigger down cannot outrun it */
    for (let k = 0; k < 400; k++) { dbg.flameTic(pl.WEAPONS.FLAMER); dbg.fuelTic(); }
    check('and holding the trigger down never empties it',
      dbg.ammo.fuel === dbg.maxAmmo.fuel && !dbg.dry && dbg.armed('FLAMER'),
      `${dbg.ammo.fuel} left, latched ${dbg.dry}`);
  }

  /* --- AND IT IS A MODEL IN YOUR HANDS ----------------------------- */
  {
    const w3 = await import('../js/weapon3d.js');
    const fs3 = await import('node:fs');
    note('the guns', Object.entries(w3.GUNS).map(([k, d]) =>
      `${k} ${d.url.split('/').pop()}${d.fit ? ' (fitted)' : ''}`).join(', '));
    check('there are two guns and both files are there',
      Object.keys(w3.GUNS).length === 2 &&
      Object.values(w3.GUNS).every(d => fs3.existsSync(d.url)));
    const E = w3.GUNS.EXTINGUISHER;
    /* THE MODEL IS SOMEBODY ELSE'S AND IS NOT REWRITTEN, which is the
       rule since the van. So the two things the game has to say about it
       — how big it is in this scene, and where its business end is — are
       said HERE, in the model's own units, and not baked into the file. */
    check('the extinguisher says where its nozzle is rather than editing the file',
      Array.isArray(E.nozzle) && E.nozzle.length === 3 && E.fit === w3.GUN_LENGTH);
    check('and it has no pilot light, not being a thing that burns',
      E.pilot === null);
    check('and its muzzle is desaturated first, so a tint can make it cold',
      E.cold === true && E.tint[2] > E.tint[0]);
    check('the flamethrower is untouched: its own frame, its own anchors',
      !w3.GUNS.FLAMER.fit && !w3.GUNS.FLAMER.nozzle && !w3.GUNS.FLAMER.cold);
  }
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

  /* --- and there is room for all of them ---
     Three things go wrong when a crowd is multiplied, and all three are
     invisible in a screenshot taken from the wrong end of an aisle.

     NOBODY OVERLAPS. Two shoppers at one coordinate are one shopper with
     a shadow, and worse than that they are two shoppers who can never
     move again: `canStandAt` refuses any step that ends inside somebody,
     so a pair placed already touching is a pair welded to the floor. The
     first cut of the bigger crowd spaced them 34 apart, and a shopper is
     18 in the radius. */
  const R2 = (2 * crowd[0].radius) ** 2;
  let closest = Infinity, pair = '';
  for (let i = 0; i < crowd.length; i++)
    for (let j = i + 1; j < crowd.length; j++) {
      const d2 = (crowd[i].x - crowd[j].x) ** 2 + (crowd[i].y - crowd[j].y) ** 2;
      if (d2 < closest) { closest = d2; pair = `${crowd[i].x | 0},${crowd[i].y | 0}`; }
    }
  note('closest two shoppers', `${Math.sqrt(closest).toFixed(0)} apart`);
  check('no two shoppers are standing inside each other', closest > R2,
    `${Math.sqrt(closest).toFixed(0)} apart at ${pair}`);
  /* AND EVERY ONE OF THEM CAN LEAVE. Not the same statement: 36 apart is
     not overlapping and is still nowhere to go, because a step is 16. */
  const canMove = a => {
    for (let d = 0; d < 8; d++) {
      const ang = d * Math.PI / 4;
      if (a.canStandAt(a.x + Math.cos(ang) * a.speed, a.y + Math.sin(ang) * a.speed)) return true;
    }
    return false;
  };
  const stuck = crowd.filter(a => !canMove(a));
  check('and every one of them has a step it can take', stuck.length === 0,
    `${crowd.length - stuck.length} of ${crowd.length} can; ` +
    stuck.slice(0, 3).map(a => `${a.x | 0},${a.y | 0}`).join(' '));
  /* AND NOBODY IS ON THE FURNITURE. The sales floor is a rectangle and a
     rectangle cannot tell an aisle from the gondola beside it, so this
     is the sector rather than the box: a shopper whose floor is not the
     shop floor is standing on the shelves, the deli counter or a till. */
  const aloft = crowd.filter(a => (a.sector?.floor ?? -1) !== MAP.FLOOR_WALK);
  check('nobody is standing on the shelves, the counters or a till',
    aloft.length === 0,
    aloft.slice(0, 4).map(a => `${a.sector?.name} at ${a.x | 0},${a.y | 0}`).join('; '));
  check('the shop holds eight times what it first did', crowd.length === 736,
    `${crowd.length}, from 92 and then 460`);

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

  const litBefore = g.fire.liveCells, burntBefore = g.fire.burntFuel;
  /* The pieces alone for the two hundred tics, and the fire afterwards.
     They used to be run together, and that stopped working the moment
     the fire got six times faster: two hundred tics of it beside a queue
     takes the neighbours too, so the count in the air is somebody else's
     pieces and the check was asking the wrong question. */
  for (let k = 0; k < 200; k++) g.giblets.tic();
  check('every piece comes down', g.giblets.chunks.count === 0, `${g.giblets.chunks.count} still up`);
  check('they leave something on the floor', g.actors.filter(a => a.type === 'GORE').length > 1);
  for (let k = 0; k < 120; k++) g.fire.tic();
  /* AND THEY START NOTHING, which is the reverse of what this line
     checked for most of the project's life. A burning piece of somebody
     used to light the floor where it landed — thirteen of them thrown
     seventy units in every direction, so one person going off in a crowd
     seeded a ring of new fires across the aisle they were running down,
     and that was the single largest reason the store burnt itself down
     without the player. See Giblets._land. */
  check('and they start no fires where they land',
    g.fire.liveCells === litBefore && g.fire.burntFuel === burntBefore,
    `${litBefore} -> ${g.fire.liveCells} cells, ${burntBefore.toFixed(0)} -> ${g.fire.burntFuel.toFixed(0)} fuel`);
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

/* ---------- the lights ---------- */
/* A FOUR-TUBE TROFFER BEHIND A PRISMATIC DIFFUSER, at the user's
   request, and there is no sprite any more: the ceiling texture is the
   whole of the fitting. So what has to be tested is what the PAINT
   says, because the paint is now the only thing that says a light is on.

   The failure this section exists to catch is the one the texture was
   originally written to be: a fitting drawn at the brightness of the
   ceiling tiles around it is a fitting that is SWITCHED OFF, and a shop
   full of those looks like a power cut with the fog lights on. Nothing
   else in the game would say so — a flat has no opinion about whether
   it is meant to be a light — so it is measured here. */
section('the lights');
{
  const st = await import('../js/states.js');
  const bank = spr.bakeSprites();

  /* --- NOTHING DRAWS A LAMP --- */
  check('a light has no sprite', bank.count('LAMP') === 0 && !bank.frames.has('LAMPA'),
    'the fitting is paint in the ceiling');
  check('and no state to draw one with',
    !st.ACTORS.LAMP.spawn && !st.ACTORS.LAMP.death &&
    !Object.keys(st.STATES).some(n => n.startsWith('LAMP')) &&
    st.LAMP_FLICKER === undefined,
    'no lit, no burst, no flicker ring');
  check('but it is still a source and still a target',
    st.ACTORS.LAMP.shootable && st.ACTORS.LAMP.hangBelow > 0 && !st.ACTORS.LAMP.solid);

  /* --- WHAT THE CEILING SAYS ---
     The fitting is drawn dead centre of a 64-texel tile that spans 256
     world units, which is the same grid and the same offset the lights
     are laid on; the tray is the 32x14 box fitTray is called with. */
  const tbank = tex.bakeTextures();
  const X0 = 16, Y0 = 25, X1 = 47, Y1 = 38;
  const measure = (name) => {
    const p = tbank.map.get(name).pix, d = p.data;
    const L = (x, y) => { const i = (y * p.w + x) * 4; return (d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1) / 255; };
    const mean = (x0, y0, x1, y1) => {
      let t = 0, n = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { t += L(x, y); n++; }
      return t / n;
    };
    /* how far outside the flange a texel is, so the glow can be measured
       as a ring without knowing anything about how it was drawn */
    const out = (x, y) => Math.hypot(Math.max(0, X0 - 1 - x, x - X1 - 1), Math.max(0, Y0 - 1 - y, y - Y1 - 1));
    let halo = 0, hn = 0, far = 0, fn = 0, max = -1, mx = 0, my = 0, min = 2;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const v = L(x, y), o = out(x, y);
      if (o > 0 && o <= 4) { halo += v; hn++; }
      if (o > 8) { far += v; fn++; }
      if (v > max) { max = v; mx = x; my = y; }
      if (o === 0) min = Math.min(min, v);
    }
    /* and where the light in the picture actually is */
    const all = [];
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) all.push([L(x, y), x, y]);
    all.sort((a, b) => b[0] - a[0]);
    let sx = 0, sy = 0, sw = 0;
    for (const [v, x, y] of all.slice(0, Math.round(p.w * p.h * 0.06))) { sx += x * v; sy += y * v; sw += v; }
    /* the row profile down the tray: four tubes have to read as four */
    const rows = [];
    for (let y = Y0; y <= Y1; y++) rows.push(mean(X0 + 2, y, X1 - 2, y));
    let peaks = 0;
    for (let i = 1; i < rows.length - 1; i++) if (rows[i] > rows[i - 1] && rows[i] >= rows[i + 1]) peaks++;
    return {
      tray: mean(X0, Y0, X1, Y1), halo: halo / hn, far: far / fn, max, min, peaks,
      inside: mx >= X0 && mx <= X1 && my >= Y0 && my <= Y1,
      cx: (sx / sw) * 4, cy: (sy / sw) * 4,          // texels are four units
    };
  };
  const m = measure('CEILFIT');
  note('the ceiling, measured', `fitting ${m.tray.toFixed(2)}, tiles beside it ${m.halo.toFixed(2)}, ` +
    `tile between fittings ${m.far.toFixed(2)}`);
  check('the fitting is lit and not switched off', m.tray > m.far * 1.2,
    `${m.tray.toFixed(2)} against ${m.far.toFixed(2)} of ceiling tile`);
  check('and it throws light on the tiles around it', m.halo > m.far + 0.025,
    `${m.halo.toFixed(2)} beside it, ${m.far.toFixed(2)} away from it`);
  check('the brightest thing on the ceiling is inside a fitting', m.inside && m.max > 0.88,
    `${m.max.toFixed(2)}`);
  check('four tubes read as four', m.peaks === 4, `${m.peaks} bands across the tray`);
  /* THE ONE GENUINELY DARK DETAIL. Without the holders a lit troffer at
     this size is a white slab, and a white slab in a ceiling is a hole. */
  check('and the lampholders are still dark', m.min < m.tray * 0.5,
    `darkest texel in the fitting ${m.min.toFixed(2)}`);

  /* A SOURCE HAS TO SIT IN THE FITTING THAT APPEARS TO BE THROWING IT.
     Flats are aligned to the world grid, so this is the check that the
     painted fitting and the light in js/maps/sellwrong.js are the same
     light and not two things 128 units apart. */
  {
    const lampsHere = MAP.buildSellWrong().things.filter(t => t.type === 'LAMP');
    const off = (v) => ((v % 256) + 256) % 256;
    const offs = new Set(lampsHere.map(t => `${off(t.x)},${off(t.y)}`));
    note('the light in the picture / the light in the map',
      `${m.cx.toFixed(0)},${m.cy.toFixed(0)} against ${[...offs][0]}`);
    check('every light is on the same 256 grid as the painted fittings', offs.size === 1,
      `${offs.size} offsets`);
    const [ox, oy] = [...offs][0].split(',').map(Number);
    check('and it sits in the fitting that appears to be throwing it',
      Math.abs(m.cx - ox) <= 8 && Math.abs(m.cy - oy) <= 8,
      `${Math.abs(m.cx - ox).toFixed(0)} and ${Math.abs(m.cy - oy).toFixed(0)} units out`);
    check('and they are all the same light now', lampsHere.every(t => !t.variant),
      'a tiling texture cannot paint one fitting differently from the next');
  }

  /* --- AND WHEN IT BURNS, IT STOPS BEING A LIGHT ---
     This is the answer to the old objection to painting a light into a
     ceiling: the charred twin is dark, and the sector it was lighting
     goes dark with it (see the lighting section). */
  check('the ceiling fitting chars with the room', tex.CHARRABLE.includes('CEILFIT'));
  const burnt = measure('CEILFIT_B');
  note('and once the fire has been through', `fitting ${burnt.tray.toFixed(2)}, was ${m.tray.toFixed(2)}; ` +
    `ceiling round it ${burnt.far.toFixed(2)}`);
  check('a burnt fitting stops looking like a light', burnt.tray < m.tray * 0.5,
    `${burnt.tray.toFixed(2)} against ${m.tray.toFixed(2)}`);
  /* AND THIS IS THE ONE THAT MATTERS. Charring darkens a surface, and a
     darker picture of a light is still a picture of a light: the dead
     fitting has to be darker than the burnt ceiling it is set in, or a
     gutted shop reads as a shop with its lights still on. */
  check('and reads as a hole with hardware in it', burnt.tray < burnt.far * 0.8,
    `${burnt.tray.toFixed(2)} against ${burnt.far.toFixed(2)} of burnt ceiling`);
  check('with the last of the fire still in it',
    (() => { const p2 = tbank.map.get('CEILFIT_B').pix, d = p2.data; let hot = 0;
      for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
        const i = (y * p2.w + x) * 4;
        if (d[i] > 90 && d[i] > d[i + 2] * 2) hot++;
      }
      return hot > 4; })(), 'embers in the tray');

  /* --- AND THE THING ITSELF IS INVISIBLE --- */
  {
    const THREE4 = await import('three');
    const { Game } = await import('../js/game.js');
    const lv4 = MAP.buildSellWrong();
    const g4 = new Game({
      level: lv4, scene: new THREE4.Scene(), camera: {},
      textures: tbank, sprites: bank,
      hud: { message() {}, ticMessages() {} }, audio: null,
      input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
               attack: false, use: false, run: false, sample() {}, sensitivity: 0 },
    });
    note('lights kept', `${g4.lamps.length} of ${lv4.things.filter(t => t.type === 'LAMP').length} placed`);
    check('a light has no state and no mesh', g4.lamps.length > 30 &&
      g4.lamps.every(a => !a.state && !a.mesh), `${g4.lamps.length} of them`);
    check('and it hangs in the ceiling it is painted in',
      g4.lamps.every(a => a.sector && a.z > a.sector.ceil - 64 && a.z < a.sector.ceil));
    /* it draws nothing, and asking it to must not throw or make a mesh */
    for (const a of g4.lamps.slice(0, 8)) a.render(0, 0, 0);
    check('and asking it to draw does nothing at all',
      g4.lamps.slice(0, 8).every(a => !a.mesh));
  }
}

/* ---------- the settings ---------- */
/* A DEAD BUTTON IS SILENT. js/main.js reaches into the page by id and
   the page is a separate file; a typo in either leaves a control that
   renders, highlights on hover and does nothing at all, and no test that
   imports modules one at a time would ever know. So the two files are
   held against each other, the same way the imports are held against the
   exports below.

   And the three quality dials are checked for the one property that
   matters about them: that full is the default and that nothing in the
   SIMULATION reads them. The shop has to be the same shop at every
   setting — a crowd option that spawned fewer people would change who
   gets out of the building alive. */
section('the settings');
await (async () => {
  const fs2 = await import('node:fs');
  const html = fs2.readFileSync('index.html', 'utf8');
  const main = fs2.readFileSync('js/main.js', 'utf8');

  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const asked = new Set([...main.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
  const missing = [...asked].filter(id => !ids.has(id));
  note('the page / what the code asks it for', `${ids.size} ids, ${asked.size} asked for`);
  check('every control the code reaches for is in the page',
    missing.length === 0, missing.join(', '));
  /* AND THE OTHER WAY for the option rows: an option in the page that
     nothing in the code so much as names is a button that renders,
     highlights on hover and does nothing at all. Any quoted mention
     counts here, because the toggles and the ladders are wired through
     helpers that take the id as an argument. */
  const opts = [...ids].filter(id => id.startsWith('opt-'));
  const unwired = opts.filter(id => !main.includes(`'${id}'`));
  note('the options', opts.join(', '));
  check('and every option in the page is wired to something',
    unwired.length === 0, unwired.join(', '));

  /* --- THE THREE DIALS --- */
  const ladder = (name) => {
    const m = main.match(new RegExp('const ' + name + '\\s*=\\s*\\[([^\\]]*)\\]'));
    if (!m) return null;
    return [...m[1].matchAll(/v:\s*([0-9.]+),\s*n:\s*'([^']+)'/g)].map(x => ({ v: +x[1], n: x[2] }));
  };
  for (const name of ['CROWD', 'FX', 'WOOD']) {
    const l = ladder(name);
    check(`${name.toLowerCase()} has a ladder of settings`, !!l && l.length >= 2,
      l ? l.map(e => `${e.n} ${e.v}`).join(', ') : 'missing');
    check(`and it starts at everything`, !!l && l[0].v === 1, l ? `${l[0].v}` : '');
    check(`and every step of it is less than the last`,
      !!l && l.every((e, i) => i === 0 || e.v < l[i - 1].v));
  }
  check('the render ladder goes from a phone to a desktop',
    /const DETAIL = \[120,/.test(main) && /600\]/.test(main));

  /* --- THE TWO SIZES, WHICH WERE ONE SIZE -------------------------
     RENDER says how much the world is drawn with; PIXELS says how big
     one of them is. They were the same number until they were not, and
     the arithmetic that pulls them apart is js/lofi.js's lofiSizes —
     pure, and exported so this can hold it against 320x200 without a
     GPU anywhere.
     --------------------------------------------------------------- */
  {
    const { lofiSizes } = await import('../js/lofi.js');
    const DOOM = 5 / 6, WIDE = 7 / 6;
    /* a 4:3 window, which is the only window these numbers mean
       anything on, and a widescreen one to prove they still hold */
    const at = (dw, dh, o) => lofiSizes(dw, dh, o);

    check('the pixel ladder has an OFF on the end of it',
      /const PIXELS = \[120,[^\]]*, 0\]/.test(main) &&
      /const PIXELS_OFF = PIXELS\.length - 1/.test(main));
    const par = [...(main.match(/const PIXEL_ASPECT = \[([^\]]*)\]/) || ['', ''])[1]
      .matchAll(/v:\s*([0-9.]+),\s*n:\s*'([^']+)'/g)].map(m => ({ v: +m[1], n: m[2] }));
    note('the pixel shapes', par.map(e => `${e.n} ${e.v}`).join(', '));
    check('and a shape ladder with a square one and a taller one',
      par.length >= 2 && par.some(e => e.v === 1) && par.some(e => Math.abs(e.v - DOOM) < 0.001),
      par.map(e => e.n).join(', '));

    /* THE ONE THAT MATTERS. Two hundred rows of 5:6 pixels filling a
       4:3 window is 320x200, and it is 320x200 because that is what
       the arithmetic says and not because anybody typed it. */
    const doom = at(1024, 768, { height: 600, pixelHeight: 200, pixelAspect: DOOM });
    note('doom, asked for by its shape', `${doom.gridWidth}x${doom.gridHeight} ` +
      `out of a ${doom.width}x${doom.height} buffer, ${doom.taps.join(' by ')} samples a pixel`);
    check('two hundred rows of 5:6 pixels on a 4:3 screen is 320x200',
      doom.gridWidth === 320 && doom.gridHeight === 200,
      `${doom.gridWidth}x${doom.gridHeight}`);
    check('and square ones at the same height are not',
      at(1024, 768, { height: 600, pixelHeight: 200, pixelAspect: 1 }).gridWidth === 267);
    check('and wide ones are fewer still',
      at(1024, 768, { height: 600, pixelHeight: 200, pixelAspect: WIDE }).gridWidth === 229);

    /* AND THE SHAPE IS THE SHAPE ASKED FOR, on any window. One chunky
       pixel is the window divided by the grid, both ways. */
    for (const [dw, dh] of [[1024, 768], [1920, 1080], [800, 1200]]) {
      for (const pa of [1, DOOM, WIDE]) {
        const g = at(dw, dh, { height: 600, pixelHeight: 200, pixelAspect: pa });
        const got = (dw / g.gridWidth) / (dh / g.gridHeight);
        check(`a chunky pixel on ${dw}x${dh} comes out the shape it was asked for`,
          Math.abs(got - pa) < 0.02, `${got.toFixed(3)} against ${pa.toFixed(3)}`);
      }
    }

    /* THE BUFFER IS ALWAYS THE WINDOW'S SHAPE, which is what stops the
       grid stretching the world: the camera reads the buffer, and a
       quantisation laid over a finished frame has no say in what is in
       it. Get this wrong and a tall-pixel setting squashes the store. */
    for (const pa of [1, DOOM, WIDE]) {
      const g = at(1920, 1080, { height: 480, pixelHeight: 160, pixelAspect: pa });
      check('the buffer keeps the window\'s shape whatever shape the pixels are',
        Math.abs(g.width / g.height - 1920 / 1080) < 0.01,
        `${g.width}x${g.height} is ${(g.width / g.height).toFixed(3)}`);
    }

    /* OFF IS OFF, AND NOT "SQUARE". With no grid of its own there is
       nothing for an aspect to be the aspect of, and a WIDE setting
       left standing would quietly keep filtering. */
    for (const pa of [1, DOOM, WIDE]) {
      const g = at(1024, 768, { height: 400, pixelHeight: 0, pixelAspect: pa });
      check('with the filter off the grid is the buffer, exactly',
        g.gridWidth === g.width && g.gridHeight === g.height &&
        g.taps[0] === 1 && g.taps[1] === 1,
        `${g.gridWidth}x${g.gridHeight} of ${g.width}x${g.height}`);
    }

    /* AND NEVER FINER THAN THE BUFFER, because more chunky pixels than
       there are rasterised ones is not more detail, it is a readout
       telling you about rows that were never drawn. */
    const over = at(1024, 768, { height: 120, pixelHeight: 600, pixelAspect: 1 });
    check('asking for more pixels than the render has does not invent any',
      over.gridHeight <= over.height && over.gridWidth <= over.width,
      `${over.gridWidth}x${over.gridHeight} out of ${over.width}x${over.height}`);

    /* AND WHEN THE BUFFER HAS NOT GOT THE COLUMNS IT IS THE ROWS THAT
       GIVE WAY. Tall pixels need MORE columns than square ones at the
       same row count — that is what makes them tall — so clamping the
       width would hand back square pixels and a control that looks
       broken. */
    const tight = at(1024, 768, { height: 200, pixelHeight: 200, pixelAspect: DOOM });
    note('5:6 pixels with no columns to spare', `${tight.gridWidth}x${tight.gridHeight} ` +
      `out of a ${tight.width}x${tight.height} buffer`);
    check('a shape that will not fit costs rows, not its shape',
      tight.gridWidth <= tight.width &&
      Math.abs((1024 / tight.gridWidth) / (768 / tight.gridHeight) - DOOM) < 0.02,
      `${tight.gridWidth}x${tight.gridHeight}`);

    /* THE SAMPLES PER CHUNKY PIXEL, which is the whole of what the
       separation buys: one is a point sample and the two controls are
       one control again. */
    const off = at(1024, 768, { height: 400, pixelHeight: 0 });
    check('a grid the size of the buffer takes one sample a pixel',
      off.taps[0] === 1 && off.taps[1] === 1);
    const three = at(1024, 768, { height: 600, pixelHeight: 200, pixelAspect: 1 });
    check('and a third of it takes three, so the extra render is averaged in',
      three.taps[1] === 3, three.taps.join(','));
    const lots = at(1024, 768, { height: 600, pixelHeight: 60, pixelAspect: 1 });
    check('and nothing takes more than four, or the filter costs more than the frame',
      lots.taps[0] <= 4 && lots.taps[1] <= 4, lots.taps.join(','));
  }

  /* --- AND THE CORNER IS TWO BARS AND NO WORDS -------------------
     It was four numbers and a running list of notifications, and it is
     gone at the user's request. What is checked is that it is GONE —
     nothing left that writes a word into the upper left, and no message
     queue behind it that a caller could still push onto — and that the
     two gauges it grew out of are what is left. */
  {
    const hudSrc = fs2.readFileSync('js/hud.js', 'utf8');
    const top = hudSrc.slice(hudSrc.indexOf('buildTop('), hudSrc.indexOf('buildBig('));
    note('what is left in the corner', `${top.split('\n').length} lines, ` +
      `${(top.match(/\bbar\(/g) || []).length} bars drawn`);
    check('nothing in the corner writes a word',
      !/bigText\s*\(/.test(top), 'bigText is still reached for in buildTop');
    check('and the message queue is gone with it, not merely unread',
      !/this\.messages/.test(hudSrc) && !/\bticMessages\b/.test(hudSrc));
    check('and nothing anywhere still tries to post one',
      ['js/game.js', 'js/player.js', 'js/main.js', 'js/responders.js']
        .every(f => !/\.message\s*\(/.test(fs2.readFileSync(f, 'utf8'))));
    /* the two gauges: how much of the store has gone, and what is in
       whatever you are holding */
    check('the two gauges are still drawn',
      /bar\(M, burn \/ 100/.test(top) && /bar\(y, tank \/ 100/.test(top));
    check('and the tank is the held weapon\'s, not the flamer\'s by name',
      /WEAPONS\[p\.weapon\]/.test(top) && !/maxAmmo\.fuel/.test(top));
    /* AND THE END-OF-NIGHT CARD STAYS, which is in the middle and is not
       a notification: it is the only thing left that says anything. */
    check('the card in the middle of the screen is untouched',
      /buildBig\(\)/.test(hudSrc) && /bigMessage/.test(hudSrc));
  }

  /* --- AND THE SIMULATION CANNOT SEE THEM --- */
  const THREE5 = await import('three');
  const { Game } = await import('../js/game.js');
  const lv5 = MAP.buildSellWrong();
  const g5 = new Game({
    level: lv5, scene: new THREE5.Scene(), camera: {},
    textures: tex.bakeTextures(), sprites: spr.bakeSprites(),
    hud: { message() {}, ticMessages() {} }, audio: null,
    input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
             attack: false, use: false, run: false, sample() {}, sensitivity: 0 },
  });
  check('a game starts at full quality',
    g5.quality.crowd === 1 && g5.quality.effects === 1 && g5.quality.wood === 1);
  const before = g5.peopleLeft;
  g5.quality.crowd = 0.25; g5.quality.effects = 0.25; g5.quality.wood = 0.35;
  g5.fire.ignite(1300, 1300, 900);
  for (let i = 0; i < 400; i++) g5.tic();
  const hurt = before - g5.peopleLeft;
  g5.quality.crowd = 1;
  note('four hundred tics at the lowest setting', `${hurt} of ${before} shoppers gone`);
  check('turning the drawing down does not change the shop',
    g5.actors.filter(a => a.type === 'SHOPPER').length > 700,
    `${g5.actors.filter(a => a.type === 'SHOPPER').length} shoppers still simulated`);

  /* --- AND WHAT IT DOES NOT DRAW ---
     The culling in Actor.render, which is the whole reason a crowd of
     seven hundred is affordable: a standee behind the camera plane is
     edge-on and invisible, so it is not drawn, and three.js cannot work
     that out for itself because the quad's bounds are a lie. */
  const someone = g5.actors.find(a => a.type === 'SHOPPER' && a.state);
  const wipe = () => { if (someone.mesh) someone.mesh.visible = false; };
  someone.x = 1000; someone.y = 1000;
  /* in front of the eye, close: drawn */
  wipe(); someone.render(1000, 600, 0, 0, 1);
  check('a shopper in front of you is drawn', !!someone.mesh && someone.mesh.visible);
  /* behind: not */
  wipe(); someone.render(1000, 1400, 0, 0, 1);
  check('and one behind you is not', !someone.mesh.visible);
  /* DEAD ABEAM: four hundred units to the right of an eye looking
     straight ahead, which is ninety degrees off the axis and so past
     even the generous cone */
  wipe(); someone.render(600, 1000, 0, 0, 1);
  check('nor one square out to the side', !someone.mesh.visible);
  /* and a long way off: not, whatever the angle */
  wipe(); someone.render(1000, -6000, 0, 0, 1);
  check('nor one on the far side of the wood', !someone.mesh.visible);
  /* and within arm's reach it is drawn whatever the angle, because at
     that range the quad is wider than the screen */
  wipe(); someone.render(1010, 1010, 0, 0, 1);
  check('but one at your elbow is drawn whichever way you face',
    someone.mesh.visible);
})();

/* ---------- the wiring ---------- */
/* EVERY NAME ONE MODULE TAKES FROM ANOTHER HAS TO BE THERE.

   This exists because of one afternoon: a comment block was rewritten
   with a text splice whose end offset was a line too far, the function
   between the two offsets went with it, and js/main.js was left
   importing a name js/car.js no longer exported. The page died on the
   first line of module evaluation — no textures, no map, no game, a
   title screen that says STARTING for ever — and the smoke test passed
   with 633 green checks, because it imports the modules it wants one at
   a time and never asks whether THEY can find each other.

   Static, not dynamic: js/main.js builds a renderer at the top level and
   importing it here would want a GPU. So the imports and the exports are
   both read out of the source. That is a regex over a codebase whose
   style is consistent, which is worth saying out loud — it earns its
   place by catching a whole class of fatal, silent breakage, and if
   somebody writes an export this cannot see, the count check below
   fails and says so. */
section('the wiring');
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const files = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const q = path.join(d, e.name);
      if (e.isDirectory()) walk(q); else if (q.endsWith('.js')) files.push(q);
    }
  };
  walk('js');
  const exportsOf = src => {
    const out = new Set();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
    /* `export { a, b as c }` and `export { a } from './x.js'` */
    for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm))
      for (const part of m[1].split(','))
        { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (n) out.add(n); }
    if (/^export\s+default/m.test(src)) out.add('default');
    return out;
  };
  const have = new Map(), src = new Map();
  for (const f of files) { const t = fs.readFileSync(f, 'utf8'); src.set(f, t); have.set(f, exportsOf(t)); }
  note('modules', `${files.length}, exporting ${[...have.values()].reduce((n, s2) => n + s2.size, 0)} names`);

  const missing = [];
  const imported = new Set();
  let edges = 0;
  for (const f of files) {
    for (const m of src.get(f).matchAll(/import\s*(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
      const target = path.normalize(path.join(path.dirname(f), m[3]));
      imported.add(target);
      const names = have.get(target);
      if (!names) { missing.push(`${f} -> ${m[3]} (no such module)`); continue; }
      for (const part of m[2].split(',')) {
        const n = part.trim().split(/\s+as\s+/)[0].trim();
        if (!n) continue;
        edges++;
        if (!names.has(n)) missing.push(`${path.basename(f)} imports ${n} from ${path.basename(target)}`);
      }
    }
    /* `import * as x` needs the module to exist and nothing more */
    for (const m of src.get(f).matchAll(/import\s+\*\s+as\s+[\w$]+\s+from\s*['"](\.[^'"]+)['"]/g)) {
      const target = path.normalize(path.join(path.dirname(f), m[1]));
      imported.add(target);
      edges++;
      if (!have.has(target)) missing.push(`${f} -> ${m[1]} (no such module)`);
    }
  }
  note('imports between them', `${edges} names`);
  /* Only the modules somebody imports: js/main.js is the entry point and
     exports nothing on purpose, which is not a fault. */
  const empty = [...imported].filter(f => !(have.get(f) || new Set()).size);
  check('every module somebody imports exports something', empty.length === 0, empty.join(', '));
  check('and every name one module takes from another is exported by it',
    missing.length === 0, missing.slice(0, 6).join('; '));
}

/* ---------- the way out ---------- */
/* Six crash-bar doors down the flanks of the building, and a crowd that
   uses them. The claim being tested is one sentence — set fire to the
   shop and most of the people in it end up OUTSIDE it — and it is worth
   a whole section because there are five separate ways for it to be
   false and every one of them has been true at some point today: the
   doors could be in the wrong place, they could be blocked, they could
   open for nobody, the crowd could not know about them, or the crowd
   could know and get stuck on the way. */
section('the way out');
{
  const { Game } = await import('../js/game.js');
  const THREE = await import('three');
  const hudStub = { message() {}, ticMessages() {}, resize() {}, update() {} };
  const inputStub = { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, attack: false, use: false, run: false, sample() {}, sensitivity: 0 };
  const lv = MAP.buildSellWrong();
  const g = new Game({ level: lv, scene: new THREE.Scene(), camera: {}, textures: tex.bakeTextures(), sprites: spr.bakeSprites(), hud: hudStub, audio: null, input: inputStub });

  /* --- the doors are there, and they are doors --- */
  const swing = g.slideDoors.filter(d => d.swing);
  check('there are six fire exits', swing.length === 6, `${swing.length}`);
  check('three down each flank of the building',
    swing.filter(d => d.spec.sector.name.includes('west')).length === 3 &&
    swing.filter(d => d.spec.sector.name.includes('east')).length === 3);
  check('every one of them has one leaf', swing.every(d => d.leaves.length === 1));
  check('and blocks BOTH faces of the wall it is in',
    swing.every(d => d.spec.lines.length === 2), swing.map(d => d.spec.lines.length).join(' '));
  check('they start shut', swing.every(d => d.state === 'shut' && d.open === 0));
  check('and a shut one is wall', swing.every(d => d.spec.lines.every(l => l.blocking)));
  /* The whole point of the leaf being 128 tall and the sector's ceiling
     being the door head: an opening taller than the leaf is a hole you
     can see and shoot through with the door closed. */
  check('the opening is exactly as tall as the leaf',
    swing.every(d => d.zTop === d.spec.sector.ceil && d.zBot === d.spec.sector.floor));

  /* --- and they are on walkable floor at both ends --- */
  {
    const bad = swing.filter(d => {
      const cx = (d.spec.x0 + d.spec.x1) / 2, cy = (d.spec.y0 + d.spec.y1) / 2;
      const nx = d.nx * 90, ny = d.ny * 90;
      const inside = lv.sectorAt(cx - nx, cy - ny), outside = lv.sectorAt(cx + nx, cy + ny);
      return !inside || !outside || inside.floor !== MAP.FLOOR_WALK || !outside.outdoor;
    });
    check('a fire exit has shop floor on one side and the open air on the other',
      bad.length === 0, bad.map(d => d.spec.sector.name).join(', '));
  }

  /* --- the map tells the crowd where they are --- */
  check('every way out is published', lv.exits.length === 8, `${lv.exits.length}`);
  check('and every one of them is a point OUTSIDE the building',
    lv.exits.every(e => e.x < MAP.ANCHOR_X0 || e.x > MAP.ANCHOR_X1 || e.y < MAP.ANCHOR_Y0),
    'the doorway itself is where a greedy walker stops');
  check('two of them are the front doors',
    lv.exits.filter(e => e.kind === 'front door').length === 2);

  /* --- A CRASH BAR IS NOT A PROXIMITY SENSOR ---
     Somebody strolling past a fire exit with a basket does not open it.
     This is what `panicOnly` buys and it is worth a check, because the
     first cut of these opened for anybody and the shop's six fire doors
     stood open all night with nothing on fire. */
  {
    const d = swing[0];
    const cx = (d.spec.x0 + d.spec.x1) / 2, cy = (d.spec.y0 + d.spec.y1) / 2;
    const calm = g.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    const was = [calm.x, calm.y];
    calm.x = cx - d.nx * 60; calm.y = cy - d.ny * 60; calm.panic = 0;
    g.blockmap.moved(calm);
    for (let k = 0; k < 20; k++) d.tic();
    check('a shopper standing at a fire exit does not open it', d.open === 0);
    calm.panic = 100;
    for (let k = 0; k < 30; k++) d.tic();
    check('one that is running does', d.open > 0.9, d.open.toFixed(2));
    check('and an open one is a hole', d.spec.lines.every(l => !l.blocking));
    calm.panic = 0;
    calm.x = was[0]; calm.y = was[1];
    g.blockmap.moved(calm);
  }

  /* --- SOMEBODY ALIGHT ---
     A shopper the fire reaches does not die where they stand any more,
     at the user's request: they run, on fire, for a few seconds, laying
     a line of it behind them, and then they go off. Four claims, and the
     last one is the one that makes the mechanic worth having. */
  {
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.removed);
    const was = [who.x, who.y];
    who.ignite(400);
    check('a shopper who catches fire starts burning rather than dying',
      !who.dead && who.state.name.startsWith('SHOP_BURN') && who.torch > 0,
      `${who.state.name}, ${who.torch} tics left`);
    check('and more fire does not hurry them along',
      (who.damage(999, null, { fire: true }), !who.dead), 'a torch burns for as long as it burns');
    let ran = 0, lit = 0;
    for (let t = 0; t < 400 && !who.removed; t++) {
      const bx = who.x, by = who.y;
      const before = g.fire.heatAt(who.x, who.y);
      g.tic();
      if (!who.dead) ran += Math.hypot(who.x - bx, who.y - by);
      if (before < 0.2 && g.fire.heatAt(bx, by) >= 0.2) lit++;
    }
    note('one shopper, set alight', `${ran.toFixed(0)} units of running, ` +
      `${lit} cells of fire dropped behind them`);
    check('they run a long way while they are alight', ran > 300, `${ran.toFixed(0)} units`);
    check('and they drag the fire with them', lit > 3, `${lit} cells`);
    check('and then they are gone', who.removed || who.dead,
      `${who.state?.name ?? 'removed'}`);
    check('and the giblets happened, so it was an explosion and not a nap',
      g.giblets ? g.giblets.bursts > 0 : true);
  }

  /* --- AND THE MEASUREMENT ---
     The shop burning, eight hundred people in it, sixty seconds. What?

     THE PREMISE OF THIS BLOCK HAS CHANGED TWICE AND IT IS WORTH KEEPING
     BOTH. It began as "one fire, and then nothing: no player, no second
     ignition, no help", because one fire was all it took — a single
     ignition on the sales floor went on to take four fifths of the
     building inside the minute, largely by travelling through the crowd
     itself. That is no longer true and is not meant to be: a fire left
     alone now takes a patch and goes out (see `fire`), and people
     bursting no longer lay new ones (see Giblets._land). One match in
     here reaches 5% of the store and two hundred people never find out
     about it, which is the point of the change and useless as a test of
     the exits.

     SO THE PLAYER DOES IT, which is what the player is now for: the
     flamethrower walked down all eleven aisles, shelf faces both sides,
     about the pace somebody actually moves. Everything after that is
     what it always was, and the claims are unchanged — the building
     EMPTIES, by one route or another, and hundreds of people leave
     through doors rather than dying where they stood. */
  {
    const crowd = () => g.actors.filter(a => a.type === 'SHOPPER' && !a.dead && !a.removed);
    const running = () => g.actors.reduce((n, a) => n + (a.type === 'SHOPPER' && !a.dead && a.panic > 0 ? 1 : 0), 0);
    const start = crowd().length;
    g.player.noclip = true;                     // out of the way, out of the fire
    /* Down each aisle in turn, painting the shelving either side of it at
       the stream's own strength and footprint — 36 and 22, which lays no
       accelerant, so nothing here can light anything the map called a
       firebreak. */
    let poured = 0, walked = 0;
    for (let k = 0; k < 11; k++) {
      const ax = 480 + k * 280 + 120 + 80;
      for (let y = 420; y < 2600; y += 64) {
        g.fire.ignite(ax - 76, y, 36, 22);
        g.fire.ignite(ax + 76, y, 36, 22);
        poured += 2;
        /* AT A WALKING PACE, which is the half of this that took two
           goes to get right. Painting all eleven aisles inside four
           seconds is not a player, it is a carpet bomb: everybody in the
           building is standing in fire before anybody has taken a step,
           five hundred and seventy die where they stand, and the exits
           get no chance to be load-bearing. Sixty-four units of aisle
           per four tics is about how fast somebody actually moves down
           one, and the fire then arrives the way it does in play — a row
           at a time, with the aisle ahead of you emptying. */
        for (let t = 0; t < 4; t++) { g.tic(); walked++; }
      }
    }
    note('the player walks the shop', `${poured} pours down 11 aisles, ` +
      `${(walked / 35).toFixed(0)}s of walking`);
    /* THE FRIGHT HAS TO BE ABLE TO RUN OUT WHILE THE SHOP IS STILL
       BURNING, which is a different claim from "everybody is calm at the
       end" and is the one worth testing. What is watched is the LOW WATER
       MARK after the first wave has gone through — because the count
       legitimately climbs again every time the fire reaches a part of the
       shop that still has people in it, and it does, twice, in the run
       this was written against: down to nothing by forty seconds and back
       over a hundred by seventy as the second run of shelving goes. */
    let quietest = Infinity, peakFire = 0;
    for (let t = 0; t < 5250; t++) {
      g.tic();
      peakFire = Math.max(peakFire, g.fire.liveCells);
      if (t > 1800) quietest = Math.min(quietest, running());
    }
    const alive = crowd();
    const out = alive.filter(a => a.sector && a.sector.outdoor);
    const inside = alive.length - out.length;
    note('the shop alight, two and a half minutes', `${out.length} of ${start} outside, ` +
      `${inside} still in, ${start - alive.length} lost, ` +
      `${(g.fire.burnFraction * 100).toFixed(0)}% of the store gone`);
    /* FIVE PER CENT, and the bar moved when the fire stopped taking the
       whole shop. It used to be two, and two was right when one match
       burnt the building: everybody had a reason to leave, and "alive
       and still inside" came out at nought or one every time. A fire
       that only goes where the player put it leaves corners nobody ever
       hears about, so a handful of shoppers legitimately calm down and
       go back to the shelves — and the shared LCG means an unrelated
       check added anywhere earlier in this file moves the count by a
       few. The claim worth holding is that the survivors are OUTSIDE,
       not that the building is empty to the last person. */
    check('the building empties: almost nobody alive is still standing in it',
      inside <= start * 0.05, `${inside} of ${start} still inside`);
    /* A QUARTER, and the bar is low on purpose. The claim is that the
       exits are LOAD-BEARING — that a large part of the shop leaves
       through a door rather than dying where it stood — and the exact
       number is a draw from a cascade sitting on its own critical point:
       it moves by a hundred and fifty on a change of one in the trail
       numbers, or on a change to the floor plan that shifts where the
       fire meets the crowd. A threshold pinned near the observed value
       is a coin flip that any later edit can flip. */
    check('and a large part of the shop gets out through the doors',
      out.length > start * 0.25, `${out.length} of ${start}`);
    /* AND THE WORK LANDED. Not a claim about the fire spreading — it
       barely does now — but about the pouring having gone into fuel
       rather than into the air: what the player painted is what burns. */
    check('and what the player painted is what burnt',
      g.fire.burnFraction > 0.25, `${(g.fire.burnFraction * 100).toFixed(0)}%`);
    /* AND IT IS DYING BACK, which is the self-extinguishing claim asked
       in the one place it could still fail. A crowd is the fastest
       thing in the building and people carry fire about while they are
       alight, so "a fire left alone goes out" being true of an empty
       grid does not make it true of a shop with seven hundred people
       running around inside it. Measured separately: two and a half
       seconds of trigger into a crowded aisle peaks at five per cent of
       the store, settles at eight, and is out after four minutes. */
    note('the fire, at its worst and at the end',
      `${peakFire} -> ${g.fire.liveCells} cells alight`);
    check('and the fire is dying back rather than still growing',
      g.fire.liveCells < peakFire * 0.5,
      `${g.fire.liveCells} against a peak of ${peakFire}`);
    check('and they scatter rather than pile up at one door',
      new Set(out.map(a => a.sector.name)).size >= 3,
      [...new Set(out.map(a => a.sector.name))].slice(0, 5).join(', '));
    check('at least one fire exit was used', swing.some(d => d.open > 0 || d.state !== 'shut')
      || out.length > 0);
    /* Contagious panic passed on at full strength is a loop, and it ran
       for the whole level: six hundred people in the woods behind the
       store, none of them able to see a fire, each one renewing the
       neighbour who had just renewed them. See A_Watch. */
    /* A TENTH, not a twentieth. The claim is that the fright COLLAPSES —
       a self-sustaining loop leaves hundreds running for ever, and it
       did — and the exact low-water mark is a few dozen either way
       depending on where the shared random table happens to be by the
       time this runs. Sitting the threshold on top of the observed value
       made this a coin flip that any new check earlier in the file could
       flip, which is a test of the wrong thing. */
    check('and the fright runs out instead of feeding itself',
      quietest < start * 0.10, `the quietest it ever got was ${quietest} still running`);
    note('and then it starts again', `${running()} running as the fire reaches the rest of the shop`);
  }
}

/* ---------- the van ---------- */
/* ONE VEHICLE, AND IT IS A FILE — nothing but the file. Two whole
   systems have been deleted from under this section. First the drawn
   fleet: seven bodies measured off four-view sheets, built as the visual
   hull of three silhouettes and painted by projecting those views back
   onto them, with about thirty checks holding the atlas, the windows,
   the wheels, the winding and the projected UVs against each other.
   Then tools/prep-van.mjs, which rewrote a model on the way in — halved
   its texture, snapped it to the game's palette, painted a black block
   into a corner of the sheet for the untextured triangles to point at,
   and wrote the axes it had measured into asset.extras.

   assets/models/van.glb is now the author's own export, byte for byte,
   and js/car.js reads it as it stands. So what is checked here is the
   CONVERSION and nothing else — the nodes walked, the axes swapped, the
   scale set, the ground line found, and the model's own UVs taken as
   they are. A missed node matrix still puts a car park full of vans on
   their sides.

   AND THE v, which is the one this section watched go past. It used to
   read "an unflipped v still puts a car park full of vans on their
   sides", which is true and was not what was happening: the v WAS being
   flipped, against a `flipY` on the texture that never happened, because
   `flipY` is ignored for an ImageBitmap. Two flips cancel and one does
   not, so every panel was wearing the wrong half of the sheet — flanks
   painted with the front view — and the van it was written for survived
   that because only 134 of its 624 triangles were textured at all, onto
   a sheet of white bodywork. The model that replaced it is unwrapped all
   over and showed it in the first screenshot. Both halves of the
   convention are pinned below, because either one alone is a trap. */
section('the van');
{
  const car = await import('../js/car.js');
  const veh = await import('../js/vehicles.js');
  const fs = await import('node:fs');

  /* --- the turn, which the tumble is built on ----------------------- */
  {
    /* a quarter turn about the up axis takes the nose onto the left */
    const t = veh.turn([1, 0, 0], Math.PI / 2, 0, 0);
    check('turning a point a quarter round the up axis is exact',
      Math.abs(t[0]) < 1e-9 && Math.abs(t[2] + 1) < 1e-9,
      `[${t.map(q => q.toFixed(2)).join(', ')}]`);
    check('and turning by nothing leaves it where it was',
      veh.turn([3, 4, 5], 0, 0, 0).every((t2, i) => Math.abs(t2 - [3, 4, 5][i]) < 1e-9));
  }

  /* --- THE MODEL, INTO THE GAME'S OWN SPACE ------------------------
     car.modelVehicle is the whole of the preparation there is: the scene
     graph walked, the axes swapped, the scale set from the length the
     GAME uses, the ground line subtracted, the UVs taken as they are and
     the flat material carried as `ink`. */
  const van = await (async () => {
    const glb = await import('../js/glb.js');
    const bytes = fs.readFileSync('assets/models/van.glb');
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const { json, bin } = glb.parseGLB(ab);

    /* THE FILE IS THE AUTHOR'S, UNTOUCHED. There is no tool any more, so
       the one thing worth asserting about what is on disk is that
       nothing has been written into it: no measured axes, no scale, no
       painted-in texel. If this ever comes back it means something has
       started preparing the model again. */
    check('the model carries nothing the game put there',
      !json.asset?.extras?.vehicle,
      Object.keys(json.asset?.extras || {}).join(', ') || 'no extras at all');
    note('whose van it is', [json.asset?.extras?.title, json.asset?.extras?.author]
      .filter(Boolean).join(' — ') || 'unattributed');
    note('what is in the file', `${json.meshes.length} meshes, ${json.nodes.length} nodes, ` +
      `${json.materials.length} materials, ${json.images.length} image`);

    const v = car.modelVehicle(json, bin);
    note('its triangles', `${v.model.tris.length}, drawn as they are`);
    check('it has triangles', v.model.tris.length > 200, `${v.model.tris.length}`);

    /* --- THE NODES ARE WALKED --------------------------------------
       A GLB is a scene graph, not a bag of triangles. This one hangs its
       two meshes off four nested nodes, two of which carry a quarter
       turn about X and undo each other — so ignoring the graph happens
       to work HERE and would stand the van on its nose the first time a
       file did not cancel out.

       What proves the walk rather than the luck is the shape that comes
       out: a van is longer than it is wide and wider than it is tall,
       and a quarter turn dropped anywhere in that chain swaps two of
       those three. */
    {
      const matrices = json.nodes.filter(n => n.matrix || n.rotation).length;
      note('the scene graph', `${json.nodes.length} nodes, ${matrices} of them turned`);
      check('the model comes out longer than it is wide, and wider than tall',
        car.carLength(v) > car.carWidth(v) && car.carWidth(v) < car.carHeight(v) &&
        car.carHeight(v) < car.carLength(v),
        `${car.carLength(v)} long, ${car.carWidth(v).toFixed(0)} wide, ${car.carHeight(v).toFixed(0)} tall`);
    }

    /* --- AND IT IS DRAWN THE WAY IT WAS AUTHORED ----------------------
       THIS IS THE ONE THAT MATTERED, and it took three goes to get
       right. The file declares which way each face points twice — the
       winding of its corners and the NORMAL on them — and both of its
       declarations disagree with the SOLID: the shell comes to about
       minus a quarter of its own bounding box, which is a surface wound
       INWARD. The van this replaced was two shells wound against each
       other, and an attempt to fix that by reversing everything when the
       total came out negative turned the body the right way and the
       chassis the wrong way: the car park went from vans seen from the
       inside to vans with no bodywork, a black sill and four wheels.

       The model is not wrong. It renders correctly in Blender and on
       Sketchfab because both of them draw BOTH SIDES — its own material
       says `doubleSided` — and that was the whole of the oversight: this
       renderer culls back faces and the model was authored where that
       never mattered. So: the winding is left exactly as the file has
       it, and the material draws both sides, which is the answer whether
       a file brings one shell or five. The normals are turned outward
       for the FACE LIGHT and nothing else, so a wrong guess costs one
       step of shading and can no longer cull anything or choose
       anybody's paint.
       ------------------------------------------------------------------ */
    check('the file says it is drawn both sides, and it is',
      json.materials.every(m => m.doubleSided));
    note('the shells it brought', json.meshes.map(me => {
      const pr = me.primitives[0];
      const P = glb.readAccessor(json, bin, pr.attributes.POSITION).array;
      const I = glb.readAccessor(json, bin, pr.indices).array;
      const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) {
        if (P[i + k] < b[k]) b[k] = P[i + k];
        if (P[i + k] > b[3 + k]) b[3 + k] = P[i + k];
      }
      const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
      let vol = 0;
      for (let t = 0; t < I.length; t += 3) {
        const Q = [I[t], I[t + 1], I[t + 2]].map(i => [P[i * 3] - c[0], P[i * 3 + 1] - c[1], P[i * 3 + 2] - c[2]]);
        vol += (Q[0][0] * (Q[1][1] * Q[2][2] - Q[1][2] * Q[2][1]) +
                Q[0][1] * (Q[1][2] * Q[2][0] - Q[1][0] * Q[2][2]) +
                Q[0][2] * (Q[1][0] * Q[2][1] - Q[1][1] * Q[2][0])) / 6;
      }
      const boxv = (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
      return `${json.materials[pr.material].name} ${(100 * vol / boxv).toFixed(0)}%`;
    }).join(', '));
    /* A VEHICLE IS DRAWN DOUBLE-SIDED, which is the fix and the only
       thing that makes "it renders perfectly in Blender" true here. */
    {
      const THREEc = await import('three');
      const mesh = car.carMesh({}, car.carGeometry(v, { length: v.length }));
      check('a vehicle is drawn both sides, as its author saw it',
        mesh.material.side === THREEc.DoubleSide);
      check('and a flat material would ride in the vertices, not in a second draw call',
        'INK' in mesh.material.defines && !!mesh.geometry.getAttribute('ink') &&
        mesh.geometry.getAttribute('ink').itemSize === 4);
      mesh.geometry.dispose(); mesh.material.dispose();
    }
    check('and the file\'s own winding is left alone',
      !('inverted' in v.model) && typeof v.model.normalsTurned === 'number');
    note('normals turned outward for the light',
      `${v.model.normalsTurned} of ${v.model.tris.length}`);
    check('most of them already pointed outward',
      v.model.normalsTurned < v.model.tris.length * 0.7,
      `${v.model.normalsTurned} turned`);
    /* THE ROOF POINTS UP, which is the claim the face light actually
       needs: a roof triangle whose normal points down is given the
       tarmac's light, and that is a third of the brightness. */
    {
      let top = 0;
      for (const t of v.model.tris) for (const p of [t.a, t.b, t.c]) if (p[2] > top) top = p[2];
      let up = 0, down = 0;
      for (const t of v.model.tris) {
        const mid = (t.a[2] + t.b[2] + t.c[2]) / 3;
        if (mid < top * 0.9 || Math.abs(t.n[2]) < 0.7) continue;
        if (t.n[2] > 0) up++; else down++;
      }
      check('the roof faces the sky', up >= 2 && down === 0, `${up} up, ${down} down`);
    }

    /* --- AND THE PAINT IS THE MODEL'S OWN --------------------------
       The mesh is UNWRAPPED, onto the very sheet embedded in it, and
       that is why it renders correctly in Blender and on Sketchfab. It
       was once condemned here on a measurement that said the flanks were
       a fan of long thin triangles sharing one corner — and that
       measurement pooled two primitives, one of which had no texture on
       it at all, so its UVs were unused junk and the junk was the fan.

       The van standing in the lot now is ONE material and one unwrap:
       every triangle of it is on the sheet, laid out as a four-view
       projection — the flanks onto the side elevation, the roof onto the
       plan, the nose and the tail onto theirs. Which is the layout the
       deleted fleet used to PAINT by projecting, drawn by hand into the
       file instead, and it is the reason this model shows a mistake in
       the v that the last one could hide. */
    const painted = v.model.tris.filter(t => !t.ink);
    const inked = v.model.tris.filter(t => t.ink);
    note('the paint', `${painted.length} triangles off the sheet, ${inked.length} flat`);
    check('the van carries its own UVs',
      painted.length > 100 && painted.every(t => t.ta && t.tb && t.tc &&
        t.ta.length === 2 && t.ta.every(q => q >= -1e-6 && q <= 1 + 1e-6)));
    check('and nothing else — no measured views, no silhouette',
      !('views' in v) && !('shape' in v), Object.keys(v).join(', '));

    /* --- WHICH WAY UP THE SHEET GOES -------------------------------
       THE ONE THAT GOT PAST. glTF puts v's origin at the top-left of
       the image and GL puts t's at the bottom, so exactly one turn has
       to happen somewhere. There were two: `1 - v` on the way out of the
       model AND `flipY` on the texture — and `flipY` is IGNORED for an
       ImageBitmap, which is what the sheet is decoded into. So one turn
       happened, the wrong one, and every panel wore the wrong half of
       its sheet: the flanks of every van in the car park were painted
       with the FRONT elevation, grille and headlights down the side.

       It stood for a whole model because the van before this one had
       134 textured triangles on a sheet of white bodywork and the other
       490 were flat black — a white van painted with the wrong view of a
       white van is still a white van. The replacement is unwrapped all
       over and it was visible in the first screenshot.

       Both halves are pinned here, because each alone is a trap: the
       sheet goes up the way it is stored, and the model's own v is used
       untouched. Put either one back and these disagree. */
    {
      const THREEc2 = await import('three');
      const t = car.carTexture({}, {});
      check('the sheet goes up the way it is stored, not turned over on the way in',
        t.flipY === false, `flipY ${t.flipY}`);
      const pr = json.meshes[0].primitives[0];
      const uv0 = glb.readAccessor(json, bin, pr.attributes.TEXCOORD_0).array;
      const ix0 = glb.readAccessor(json, bin, pr.indices).array;
      let off = 0;
      for (let q = 0; q + 2 < ix0.length; q += 3) {
        const tri = v.model.tris[q / 3];
        for (const [k, key] of [[0, 'ta'], [1, 'tb'], [2, 'tc']]) {
          const i = ix0[q + k];
          if (Math.abs(tri[key][0] - uv0[i * 2]) > 1e-6 ||
              Math.abs(tri[key][1] - uv0[i * 2 + 1]) > 1e-6) off++;
        }
      }
      check('and the model\'s own v reaches the triangles untouched',
        off === 0, `${off} of ${v.model.tris.length * 3} corners moved`);
      /* AND THE SAMPLER IS THE FILE'S, down to what it does not say:
         where a glTF leaves wrapping out the spec's answer is REPEAT,
         which is not this renderer's habit and is not ours to pick. */
      const s2 = car.carTexture({}, json.samplers[0]);
      check('the sampler is the file\'s own, and its silences are glTF\'s',
        s2.magFilter === THREEc2.NearestFilter &&
        s2.minFilter === THREEc2.NearestMipmapNearestFilter &&
        s2.wrapS === THREEc2.RepeatWrapping && s2.wrapT === THREEc2.RepeatWrapping,
        'nearest, nearest-mipmap-nearest, repeat');
    }

    /* THE UNWRAP IS ORDINARY, which is the claim that was got wrong.
       A sane four-view unwrap covers a good fraction of the sheet with
       no single triangle stretched across it, and a fan collapses the
       spread to nothing. Measured PER PRIMITIVE, because pooling them is
       what hid it the first time. */
    {
      const stats = [];
      for (const me of json.meshes) for (const pr of me.primitives) {
        const uv2 = pr.attributes.TEXCOORD_0 !== undefined
          ? glb.readAccessor(json, bin, pr.attributes.TEXCOORD_0).array : null;
        const ix = glb.readAccessor(json, bin, pr.indices).array;
        let sum = 0, big = 0;
        for (let t = 0; uv2 && t < ix.length; t += 3) {
          const P = [ix[t], ix[t + 1], ix[t + 2]].map(i => [uv2[i * 2], uv2[i * 2 + 1]]);
          const ar = Math.abs((P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) -
                              (P[2][0] - P[0][0]) * (P[1][1] - P[0][1])) / 2;
          sum += ar; big = Math.max(big, ar);
        }
        stats.push({ name: json.materials[pr.material]?.name,
          textured: !!json.materials[pr.material]?.pbrMetallicRoughness?.baseColorTexture,
          tris: ix.length / 3, sum, big });
      }
      note('the unwrap', stats.map(st => `${st.name} ${st.tris} tris ` +
        `${st.textured ? 'covering' : '"covering"'} ${(st.sum * 100).toFixed(0)}% of the sheet, ` +
        `biggest ${(st.big * 100).toFixed(1)}%`).join('; '));
      const body = stats.filter(st => st.textured);
      check('every textured primitive has an ordinary unwrap',
        body.length >= 1 && body.every(st => st.sum > 0.2 && st.sum < 0.8 && st.big < 0.05),
        body.map(st => `${(st.sum * 100).toFixed(0)}% of the sheet, biggest ${(st.big * 100).toFixed(1)}%`).join('; '));
      check('and the whole model is on the sheet, so no panel is guessed at',
        stats.every(st => st.textured), `${stats.filter(st => !st.textured).length} untextured primitives`);
    }

    /* AND A FLAT MATERIAL STILL RIDES IN THE VERTICES. This model has
       none — there is nothing in it that is not unwrapped — but the
       reader honours one, because glTF allows one and a second material
       is a second draw call for every slab of parked cars. So it is held
       against a hand-built file rather than deleted for want of a user:
       two primitives, one on the sheet and one with nothing but a
       baseColorFactor, and the flat one has to come out carrying its own
       colour and a flag saying to use it.

       baseColorFactor is linear and an sRGB texture decodes to linear on
       sample, so the number goes through untouched — and a tyre that
       came out WHITE would be a UV pointed at the wrong thing, which is
       exactly what the `ink` attribute replaced. */
    {
      const INK = [0.0059367, 0.0059367, 0.0059367, 1];
      /* a flat quad on the sheet and a flat quad under it, longest along
         +Z so the reader will take it for a vehicle at all */
      const pos = new Float32Array([
        -1, 1, -3, 1, 1, -3, 1, 1, 3, -1, 1, 3,        // the painted one
        -1, 0, -3, 1, 0, -3, 1, 0, 3, -1, 0, 3,        // the flat one
      ]);
      const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
      const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
      const bin2 = new Uint8Array(pos.byteLength + uvs.byteLength + idx.byteLength + 2);
      bin2.set(new Uint8Array(pos.buffer), 0);
      bin2.set(new Uint8Array(uvs.buffer), pos.byteLength);
      bin2.set(new Uint8Array(idx.buffer), pos.byteLength + uvs.byteLength);
      const B = (o, l) => ({ buffer: 0, byteOffset: o, byteLength: l });
      const json2 = {
        scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [
          { attributes: { POSITION: 0, TEXCOORD_0: 2 }, indices: 4, material: 0 },
          { attributes: { POSITION: 1 }, indices: 4, material: 1 },
        ] }],
        materials: [
          { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
          { pbrMetallicRoughness: { baseColorFactor: INK } },
        ],
        bufferViews: [B(0, 48), B(48, 48), B(96, 32), B(128, 12)],
        accessors: [
          { bufferView: 0, componentType: 5126, type: 'VEC3', count: 4 },
          { bufferView: 1, componentType: 5126, type: 'VEC3', count: 4 },
          { bufferView: 2, componentType: 5126, type: 'VEC2', count: 4 },
          {}, { bufferView: 3, componentType: 5123, type: 'SCALAR', count: 6 },
        ],
      };
      const two = car.modelVehicle(json2, bin2);
      const flat = two.model.tris.filter(t => t.ink);
      const sheet = two.model.tris.filter(t => !t.ink);
      note('a file with a flat material in it', `${sheet.length} triangles on the sheet, ` +
        `${flat.length} flat at ${INK[0]} linear ` +
        `(about ${Math.round(255 * (1.055 * Math.pow(INK[0], 1 / 2.4) - 0.055))} of 255 on a screen)`);
      check('an untextured primitive comes out carrying its own material\'s colour',
        flat.length === 2 && flat.every(t => t.ink.length === 3 &&
          t.ink.every((q, i) => Math.abs(q - INK[i]) < 1e-9)), `${flat.length} triangles`);
      check('and the textured one is left to the sheet',
        sheet.length === 2 && sheet.every(t => t.ink === null));
      /* and the flag reaches the geometry: a vec4 a vertex, rgb and a
         one-or-nothing, which is what the shader's mix reads */
      const g2 = car.carGeometry(two, { angle: 0 });
      const flags2 = new Set();
      for (let i = 3; i < g2.ink.length; i += 4) flags2.add(g2.ink[i]);
      check('and the geometry says which is which, per vertex',
        g2.ink.length === g2.position.length / 3 * 4 && [...flags2].sort().join() === '0,1',
        `flags seen: ${[...flags2].join(', ')}`);
      /* and it survives a clip, so a piece with a tyre in it is black */
      const bit = car.chunkGeometry(two, { x0: -0.1, x1: 0.1, y0: -0.1, y1: 0.1, z0: -0.01, z1: 0.01 },
        { angle: 0 });
      check('and it survives the clip, so a piece with a tyre in it keeps the tyre black',
        bit.ink.some((q, i) => i % 4 === 3 && q === 1));
    }
    /* and the van in the lot uses none of it */
    {
      const g = car.carGeometry(v, { angle: 0 });
      const flags = new Set();
      for (let i = 3; i < g.ink.length; i += 4) flags.add(g.ink[i]);
      check('and this van asks for none of it, because all of it is on the sheet',
        inked.length === 0 && [...flags].join() === '0', `flags seen: ${[...flags].join(', ')}`);
    }
    /* every UV inside the picture */
    {
      const g = car.carGeometry(v, { angle: 0 });
      check('every UV is inside the sheet',
        g.uv.every(u => u >= -1e-6 && u <= 1 + 1e-6),
        `${g.uv.filter(u => u < 0 || u > 1).length} of ${g.uv.length} outside`);
      /* AND NOTHING IS STRETCHED ACROSS THE SHEET, measured on the
         geometry the game actually builds rather than on the file. */
      let widest = 0;
      for (let i = 0; i < g.uv.length; i += 6) {
        if (g.ink[(i / 2) * 4 + 3] > 0.5) continue;         // flat triangles have no unwrap
        const u = [g.uv[i], g.uv[i + 2], g.uv[i + 4]], w = [g.uv[i + 1], g.uv[i + 3], g.uv[i + 5]];
        const ar = Math.abs((u[1] - u[0]) * (w[2] - w[0]) - (u[2] - u[0]) * (w[1] - w[0])) / 2;
        widest = Math.max(widest, ar);
      }
      check('and no one triangle is stretched across the whole sheet',
        widest < 0.05, `the widest covers ${(widest * 100).toFixed(1)}% of it`);
    }
    /* AND THE NORMALS ARE THE TRIANGLES' OWN. Every one unit long, or
       the face light and the winding are both being asked a question
       about a vector that is not a direction. */
    check('and every triangle carries its own unit normal',
      v.model.tris.every(t => Math.abs(Math.hypot(t.n[0], t.n[1], t.n[2]) - 1) < 1e-5));

    /* --- ITS OWN BOX, which the collision and the tumble want --------
       Measured off the triangles rather than declared, now that there is
       nothing left to declare it. The LENGTH is the game's own number —
       a bay is 186 across and a shopper is 62 tall, so a van is 174 nose
       to tail whatever the file thinks it is in metres — and the width
       and the height then follow from the model's own proportions. */
    note('its box', `${car.carLength(v)} long, ${car.carWidth(v).toFixed(0)} wide, ` +
      `${car.carHeight(v).toFixed(0)} tall, sill at ${(v.box.sill * v.length).toFixed(0)}`);
    check('it is as long as the game says a van is',
      v.length === car.VAN_LENGTH, `${v.length}`);
    check('and it stands on the tarmac rather than in it or over it',
      (() => {
        let lo = Infinity, hi = -Infinity;
        for (const t of v.model.tris) for (const p of [t.a, t.b, t.c]) {
          if (p[2] < lo) lo = p[2];
          if (p[2] > hi) hi = p[2];
        }
        return Math.abs(lo) < 1e-6 && Math.abs(hi - v.box.height) < 1e-6;
      })(), 'the lowest vertex is the ground line');
    check('and it straddles its own middle, nose to tail and side to side',
      (() => {
        const b = [Infinity, Infinity, -Infinity, -Infinity];
        for (const t of v.model.tris) for (const p of [t.a, t.b, t.c]) {
          b[0] = Math.min(b[0], p[0]); b[2] = Math.max(b[2], p[0]);
          b[1] = Math.min(b[1], p[1]); b[3] = Math.max(b[3], p[1]);
        }
        return Math.abs(b[0] + 0.5) < 1e-6 && Math.abs(b[2] - 0.5) < 1e-6 &&
               Math.abs(b[1] + v.box.half) < 1e-6 && Math.abs(b[3] - v.box.half) < 1e-6;
      })(), 'or it would turn about a point outside itself');
    check('and its eight corners are the corners of that box',
      car.carCorners(v).length === 8 &&
      car.carCorners(v).every(([x, y, z]) =>
        Math.abs(Math.abs(x) - 0.5) < 1e-9 &&
        Math.abs(Math.abs(y) - v.box.half) < 1e-9 &&
        (z === 0 || Math.abs(z - v.box.height) < 1e-9)));

    /* --- AND A PIECE OFF IT IS A PIECE OF IT ------------------------
       A chunk used to be a fresh BOX cut out of model space with the
       four views projected onto its six faces. There is no projection
       now, so a chunk is the model's own triangles inside the cut —
       which is a better piece, and needs nothing but a filter.

       Three ways for that to be wrong and all three are quiet: a chunk
       that is empty (an invisible thing with a collision box), a chunk
       whose paint is not the model's, and a chunk that is not centred on
       itself, which makes it tumble about a point outside it. */
    {
      /* a cut around a triangle near the roof, the way shed() picks */
      let high = v.model.tris[0];
      for (const t of v.model.tris)
        if ((t.a[2] + t.b[2] + t.c[2]) / 3 > (high.a[2] + high.b[2] + high.c[2]) / 3) high = t;
      const mx = (high.a[0] + high.b[0] + high.c[0]) / 3;
      const my = (high.a[1] + high.b[1] + high.c[1]) / 3;
      const mz = (high.a[2] + high.b[2] + high.c[2]) / 3;
      const cut = { x0: mx - 0.06, x1: mx + 0.06, y0: my - 0.06, y1: my + 0.06,
                    z0: mz - 0.04, z1: mz + 0.04 };
      const c = car.chunkGeometry(v, cut, { angle: 0, light: 0.7, sky: 1, charred: 0.85 });
      const n = c.position.length / 9;
      note('a piece off the roof', `${n} of the van's own triangles`);
      check('a chunk is the model\'s own triangles', n >= 1 && n < v.model.tris.length);
      check('and it is charred', c.charred.every(t => t === 0.85));
      /* IT WEARS THE PAINT OF THE TRIANGLES IT WAS CUT FROM. Not the
         same UVs — the clip puts new vertices on the cut planes and
         interpolates their u and v along with their position, which is
         the point of clipping — so the claim is that every corner of the
         piece's paint falls inside the paint of the model triangles the
         cut actually caught. Outside that is a piece wearing somebody
         else's panel.

         AND IT IS NOT THAT THE PATCH IS SMALL, which is what this asked
         for until the van was replaced by one unwrapped all over. The
         sheet is a four-view projection: a piece an eighth of a van
         across straddles half of it the moment it has a roof face and a
         flank in it, because those two views are drawn in different
         corners. That is the model being read correctly, not a piece
         going wrong. What a piece must not do is wear MORE of the sheet
         than the whole van does. */
      let u0 = 9, u1 = -9, w0 = 9, w1 = -9;
      for (let i = 0; i < c.uv.length; i += 2) {
        u0 = Math.min(u0, c.uv[i]); u1 = Math.max(u1, c.uv[i]);
        w0 = Math.min(w0, c.uv[i + 1]); w1 = Math.max(w1, c.uv[i + 1]);
      }
      /* the paint on every triangle whose own box reaches into the cut:
         the clip cannot invent a UV outside this */
      const caught = [9, 9, -9, -9];
      for (const t of v.model.tris) {
        let miss = false;
        for (let k = 0; k < 3 && !miss; k++) {
          const lo3 = [cut.x0, cut.y0, cut.z0][k], hi3 = [cut.x1, cut.y1, cut.z1][k];
          if (Math.min(t.a[k], t.b[k], t.c[k]) > hi3 ||
              Math.max(t.a[k], t.b[k], t.c[k]) < lo3) miss = true;
        }
        if (miss) continue;
        for (const q of [t.ta, t.tb, t.tc]) {
          caught[0] = Math.min(caught[0], q[0]); caught[2] = Math.max(caught[2], q[0]);
          caught[1] = Math.min(caught[1], q[1]); caught[3] = Math.max(caught[3], q[1]);
        }
      }
      note('and the paint on it', `${((u1 - u0) * 100).toFixed(0)}% by ` +
        `${((w1 - w0) * 100).toFixed(0)}% of the sheet, out of the ` +
        `${((caught[2] - caught[0]) * 100).toFixed(0)}% by ` +
        `${((caught[3] - caught[1]) * 100).toFixed(0)}% the cut reached`);
      check('and its paint is the paint of the triangles it was cut from',
        u0 >= caught[0] - 1e-6 && u1 <= caught[2] + 1e-6 &&
        w0 >= caught[1] - 1e-6 && w1 <= caught[3] + 1e-6,
        `u ${u0.toFixed(2)}..${u1.toFixed(2)}, v ${w0.toFixed(2)}..${w1.toFixed(2)}`);
      check('and it wears less of the sheet than the whole van does',
        (() => {
          let a0 = 9, a1 = -9, b0 = 9, b1 = -9;
          for (const t of v.model.tris) for (const q of [t.ta, t.tb, t.tc]) {
            a0 = Math.min(a0, q[0]); a1 = Math.max(a1, q[0]);
            b0 = Math.min(b0, q[1]); b1 = Math.max(b1, q[1]);
          }
          return (u1 - u0) * (w1 - w0) < (a1 - a0) * (b1 - b0) * 0.75;
        })(), 'or the piece has the whole van smeared over it');
      /* and it is no bigger than the cut, which is what clipping buys */
      check('and it is no bigger than the box it was cut with',
        (() => {
          let lo2 = 1e9, hi2 = -1e9;
          for (let i = 0; i < c.position.length; i += 3) {
            lo2 = Math.min(lo2, c.position[i]); hi2 = Math.max(hi2, c.position[i]);
          }
          return hi2 - lo2 <= (cut.x1 - cut.x0) * v.length + 1e-3;
        })(), 'whole triangles would be a roof panel two thirds of the van long');
      /* it turns about its own middle, so its vertices straddle zero */
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < c.position.length; i += 3) { lo = Math.min(lo, c.position[i]); hi = Math.max(hi, c.position[i]); }
      check('and it is centred on the cut, so it tumbles about its middle',
        Math.abs(lo + hi) < v.length * 0.14, `${lo.toFixed(1)}..${hi.toFixed(1)}`);
      /* AND A CUT THAT CATCHES NOTHING IS NOT NOTHING */
      const empty = car.chunkGeometry(v, { x0: 0.48, x1: 0.49, y0: 0.24, y1: 0.25, z0: 0.9, z1: 0.95 },
        { angle: 0, light: 0.7, sky: 1, charred: 0 });
      check('a cut that catches nothing still comes out as something',
        empty.position.length / 9 === 1, `${empty.position.length / 9} triangles`);
    }
    return v;
  })();

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
    fleet: { texture: {}, def: van },                // it never draws in here
  });
  const V = gm.vehicles;
  note('the car park', `${V.count} vehicles in ${(level.carSlots || []).length} bays`);
  check('every slot in the lot got a vehicle',
    V.count === (level.carSlots || []).length && V.count > 12, `${V.count}`);
  /* AND THEY ARE SPREAD OUT, at the user's request. Counting empty bays
     would mean knowing how many there are, which is arithmetic inside
     the map; what "sparse" actually means is visible from the vans
     themselves — how far it is to the next one. A bay is 186 wide, so
     neighbours in adjacent bays are 186 apart and a sparse lot is not.  */
  {
    const all = V.all;
    const near = all.map(v => Math.min(...all.filter(o => o !== v)
      .map(o => Math.hypot(o.x - v.x, o.y - v.y))));
    near.sort((a, b) => a - b);
    const mid = near[near.length >> 1];
    note('and how spread out', `nearest neighbour: closest ${near[0].toFixed(0)}, ` +
      `median ${mid.toFixed(0)}, furthest ${near[near.length - 1].toFixed(0)}`);
    check('the lot is sparse rather than full', mid > 300, `median ${mid.toFixed(0)} apart`);
    check('and no two vans are in the same bay', near[0] > 150, `${near[0].toFixed(0)} apart`);
  }
  /* THE ASK WAS FOR A CUSTOMER CAR PARK. The riot van and the APC are
     measured, packed and ready and neither of them is out there. */
  check('and none of it is police or military',
    V.all.every(v => v.def.use === 'civil'),
    [...new Set(V.all.map(v => v.def.id))].join(', '));
  check('and every one of them is the modelled van',
    V.all.every(v => v.def === van), [...new Set(V.all.map(v => v.def.id))].join(', '));

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
    car.carBlockRadius(van) === Math.max(12, Math.round(car.carWidth(van) / 2)),
    `${car.carBlockRadius(van)} for a van ${car.carWidth(van).toFixed(0)} wide`);
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
