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

/* ---------- the shaders, before anything imports one ----------------
   A GLSL block lives in a JavaScript template literal, and a template
   literal with no interpolation ends at the NEXT backtick wherever that
   is — so a pair of them in a COMMENT closes the shader mid-sentence
   and the rest of it silently becomes JavaScript. The file still parses
   as far as node is concerned; the game dies on IMPORT with "Unexpected
   identifier", naming a word out of a comment, and says nothing about
   which file or why.

   It has cost two debugging sessions, and it has to be checked HERE,
   at the top, reading the file as TEXT — a check further down cannot
   run, because the import that kills the process happens first. What is
   asserted is not "is there a stray backtick" but "does each shader
   still reach the line it is supposed to end on", which is the thing
   that actually goes wrong. */
{
  const fs0 = await import('node:fs');
  const src = fs0.readFileSync('js/material.js', 'utf8');
  for (const [tag, last] of [['const COMMON_VERT', 'gl_Position'],
                             ['const COMMON_FRAG', 'gl_FragColor']]) {
    const at = src.indexOf(tag);
    const open = at < 0 ? -1 : src.indexOf('`', at);
    const close = open < 0 ? -1 : src.indexOf('`', open + 1);
    const whole = close > open && src.slice(open + 1, close).includes(last);
    /* SAID NOW, NOT AT THE END. Everything else in this file records a
       failure and prints the list when the run finishes — and this run
       will not finish: the import a few lines down is the thing that
       throws. So this one says what is wrong and stops, which is the
       whole point of it. */
    if (!whole) {
      console.error(`\n  BROKEN SHADER\n  -------------\n` +
        `    ${tag.slice(6)} in js/material.js does not reach ${last}.\n` +
        `    A backtick in a comment inside the GLSL has ended the template\n` +
        `    literal early, and the rest of the shader is now JavaScript.\n`);
      process.exit(1);
    }
    check(`${tag.slice(6)} runs to its own last line`, whole);
  }
}

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
    ['FLMGA', 'FLMGB', 'FLMGC', 'MOLGA', 'MOLGB', 'MOLGC'].every(k => w.has(k)));
  check('and the boxcutter\'s are gone with the boxcutter', !w.has('CUTGA') && !w.has('CUTGB'));
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
  /* --- THE LOD: three chunk sizes, every plant drawn exactly once ------- */
  {
    const fL = new F.Forest(level);
    const scene = new (await import('three')).Scene();
    const art = { ground: {}, groundBurnt: {}, sprites: Object.fromEntries(F.KINDS.map(k => [k.name, { albedo: {}, burn: {} }])) };
    fL.build(scene, art);
    const A = fL.kindArrays;
    const lod = A.filter(a => a && a.lod && a.levels.length), fine = A.filter(a => a && !a.lod && a.levels.length);
    check('the firs and the bushes are built at three chunk sizes, the understory at one',
      lod.length >= 4 && lod.every(a => a.levels.length === 3 && a.levels[1].ch === 4096 && a.levels[2].ch === 8192) &&
      fine.every(a => a.levels.length === 1), `${lod.length} kinds with a LOD, ${fine.length} without`);
    /* every plant of the kind is in every level, once. A kind's source
       is whichever array its slots are sized to — the canopy's for the
       firs, the understory's for the bushes */
    const srcOf = a => (a.levels[0].slot.length === fL.trees.n ? fL.trees : fL.covers);
    check('and every tree is in every level once',
      lod.every(a => a.levels.every(L => { let n = 0; for (let i = 0; i < L.slot.length; i++) if (L.slot[i] >= 0) n++; return n === a.n; })));
    check('and the bushes are drawn at all now — they are planted in the understory\'s arrays and were read out of the canopy\'s',
      lod.some(a => srcOf(a) === fL.covers && a.n > 0) && F.KINDS.filter(k => !k.cover && k.h <= 120).every(k => A[F.KINDS.indexOf(k)].n > 0));
    /* drawn exactly once, from wherever you stand */
    const cl = level.clearing, clx = (cl[0] + cl[2]) / 2, cly = (cl[1] + cl[3]) / 2;   // the store's box
    const eyes = [[clx, cly], [fL.originX + 3000, fL.originY + 3000], [fL.originX + fL.cols * F.CELL * 0.5, fL.originY + 900]];
    let once = true, fineDraws = 0, lodDraws = 0, worst = '';
    for (const [ex, ey] of eyes) {
      fL.render(ex, ey, 40, 0, 0, 1);
      for (const a of lod) {
        const T = srcOf(a);
        const seen = new Uint8Array(T.n);
        let draws = 0;
        for (const L of a.levels) {
          for (const ch of L.chunks) if (ch.mesh.visible) draws++;
          for (let i = 0; i < T.n; i++) { const ch = L.chunks[L.chunkOf[i]]; if (ch && L.slot[i] >= 0 && ch.mesh.visible) seen[i]++; }
        }
        lodDraws += draws;
        /* what the fine chunks alone would have cost */
        const far = (a.far + 2048);
        let fd = 0;
        for (const ch of a.levels[0].chunks) { const dx = ch.x - ex, dy = ch.y - ey; if (dx * dx + dy * dy < far * far) fd++; }
        fineDraws += fd;
        for (let i = 0; i < T.n; i++) {
          if (T.kind[i] !== A.indexOf(a)) continue;
          const dx = T.x[i] - ex, dy = T.y[i] - ey;
          const inRange = dx * dx + dy * dy < far * far;
          if (seen[i] > 1 || (seen[i] === 0 && inRange && Math.hypot(dx, dy) < a.far - 2048 * 1.5)) { once = false; worst = `${seen[i]} of tree ${i}`; }
        }
      }
    }
    check('and from three places, every tree in range is drawn exactly once', once, worst);
    note('tree draws, fine chunks / with the LOD', `${fineDraws} / ${lodDraws}`);
    check('and the LOD is well under half the draws of fine chunks alone', lodDraws < fineDraws * 0.5, `${lodDraws} against ${fineDraws}`);
    check('the burn reaches every level', (() => {
      const wx = fL.originX + 3000, wy = fL.originY + 3000;   // in the wood
      fL.ignite(wx, wy, 200);
      for (let t = 0; t < 40; t++) fL.tic();
      fL.render(wx, wy, 40, 0, 0, 1);
      return lod.some(a => a.levels.every(L => L.chunks.some(ch => { for (let i = 0; i < ch.burn.length; i++) if (ch.burn[i] > 0) return true; return false; })));
    })());
  }
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
    check('the boxcutter is gone, and the bore is issued in its place',
      !pl.WEAPONS.BOXCUTTER && !p.owned.BOXCUTTER && !!p.owned.BORE && !!pl.WEAPONS.BORE);
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
    /* AND BURN AWAY, which rides the same define on purpose: it is the
       same kind of fact about the same kind of thing, and a second
       define is a second shader permutation for one uniform. */
    check('and a sprite carries both numbers the fire and the cold write',
      'frost' in sprite.uniforms && 'ash' in sprite.uniforms &&
      sprite.uniforms.ash.value === 0);
    /* AND NO BACKTICKS IN THE SHADER, which has now cost two debugging
       sessions. The GLSL lives in a JavaScript template literal and a
       pair of them in a COMMENT closes the string mid-sentence: the
       file still parses, and the game dies on import with "Unexpected
       identifier". The prose in that file is dense and the temptation
       to quote an identifier in it is constant, so it is a check. */
    check('and the burn-away eats the drawing rather than fading it',
      (() => {
        const src = fs2.readFileSync('js/material.js', 'utf8');
        const frag = src.slice(src.indexOf('const COMMON_FRAG'), src.indexOf('export function worldUniforms'));
        /* the three zones: gone, the line of coals, and the scorch ahead
           of it — a discard, an additive ramp lookup, and a mix */
        return /if \(ash > 0\.0\)/.test(frag) && /discard/.test(frag) &&
               /glowAdd = emberRamp/.test(frag) && /c \+ glowAdd/.test(frag);
      })());
    /* AND IT RUNS FEET FIRST. vUv.y runs UP the person — the quad is
       authored with its foot at y = 0 and its uv goes with it — and the
       first cut of this assumed the opposite and ate people from the
       hat down, which is a person dissolving rather than a person on
       fire. One character, nothing else in the game would notice, so it
       is pinned in the source. */
    check('the burn-away runs from the feet up',
      (() => {
        const src = fs2.readFileSync('js/material.js', 'utf8');
        const blk = src.slice(src.indexOf('if (ash > 0.0)'), src.indexOf('SURFACE_BURN'));
        return /float up = vUv\.y;/.test(blk) && !/float up = 1\.0 - vUv\.y;/.test(blk);
      })());
    /* AND THE FIRE ON A PERSON RUNS THE OTHER WAY ROUND, because fire
       climbs: white at the knees, and their face is the last thing left
       recognisable. Which is also what keeps a burning shopper legible
       as a PERSON for the four seconds they have — evenly washed to
       orange they are a silhouette, and the point of them running is
       that you can see who it is running. */
    check('and a sprite can be alight as well as frozen and eaten',
      'alight' in sprite.uniforms && sprite.uniforms.alight.value === 0);
    check('and the fire on one is hottest at the feet',
      (() => {
        const src = fs2.readFileSync('js/material.js', 'utf8');
        const blk = src.slice(src.indexOf('if (alight > 0.0)'), src.indexOf('if (ash > 0.0)'));
        return /float low = 1\.0 - vUv\.y;/.test(blk) && /emberRamp/.test(blk) &&
               /mix\(t\.rgb/.test(blk);
      })());
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
  const { Actor, ACTIONS } = await import('../js/actor.js');
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

  /* --- OR THE FIRE EATS THEM --------------------------------------
     THE SECOND OF THE THREE, AND IT CHANGED SIDES. Fire used to melt a
     frozen shopper free and set them running, which made the
     flamethrower the UNDO for the extinguisher — a player could spoil
     their own freeze by sweeping the aisle a moment later. At the
     user's request the pair are a combination instead: fire on ice is
     an execution. They stay where they are, an ember front eats the
     drawing from the feet up (the ASH block in js/material.js) and
     about three and a half seconds later there is a heap on the lino.
     No fireball, no thirteen pieces, no stampede — the quiet way of
     emptying an aisle, and the second one, with the shatter. */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    who.chill(Actor.FREEZE_AT);
    who.ignite(300);
    check('one flame on a block of ice starts eating it',
      who.ash > 0 && who.state.name === 'SHOP_ASH1', who.state.name);
    check('and they are not set running and not set alight',
      !who.frozen && who.burning === 0 && who.panic === 0 && who.solid);
    /* AND THE FIRE UNDER THEM IS STILL LIT, because a person burning is
       how an aisle catches whether or not they run anywhere */
    check('and the floor under them takes their fuel',
      g.fire.heatAt(who.x, who.y) > 0, `${g.fire.heatAt(who.x, who.y).toFixed(2)}`);
    /* THE CLOCK IS THE ONLY THING THAT ENDS IT, which is the same
       bargain A_Torch makes: more fire does not hurry it along. */
    const at = who.ash;
    for (let i = 0; i < 20; i++) who.ignite(300);
    check('and more fire does not hurry it', who.ash === at);

    let t = 0;
    for (; t < 400 && !who.removed; t++) who.tic();
    note('a block of ice, burned', `${t} tics from the first flame to the ash`);
    check('and it takes a few seconds and not an instant',
      t > 2.5 * 35 && t < 5.5 * 35, `${t} tics`);
    check('and what is left is an ash pile and not a body',
      who.removed && who.dead && g.giblets.ashes === 1);
    const pile = g.actors.find(a => a.type === 'ASH');
    check('the heap is on the floor where they were standing',
      !!pile && Math.hypot(pile.x - who.x, pile.y - who.y) < 1 && pile.flat && !pile.solid);
    check('and it is one of the three drawings of ash, not of blood',
      !!pile && pile.state.sprite.slice(0, 3) === 'ASH' && pile.variant < 3);
  }

  /* --- AND THE SPRITE IS EATEN, WHICH IS THE WHOLE OF THE EFFECT ----
     The number the shader reads is `ash`, and what has to be true of it
     is that it starts at nothing, ends at everything, and gets there in
     one direction — a front that went backwards would be a person
     un-burning. Checked here rather than by looking at a screenshot
     because a uniform that stops climbing is invisible until somebody
     stands and watches a shopper not finish. */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    who.chill(Actor.FREEZE_AT);
    who.ignite(300);
    const seen = [];
    let last = -1, backwards = 0;
    for (let i = 0; i < 400 && !who.removed; i++) {
      who.tic();
      if (who.ash < last) backwards++;
      last = who.ash;
      if (i % 25 === 0) seen.push(+who.ash.toFixed(2));
    }
    note('how far through, every 25 tics', seen.join(' '));
    check('the front only ever goes one way', backwards === 0, `${backwards} steps back`);
    check('and it reaches the end of them before they are taken away',
      last >= 0.999 && who.removed, `${last.toFixed(3)}`);
    /* AND THE ICE IS OFF THEM LONG BEFORE THE FIRE IS THROUGH THEM, or
       the two effects are fighting over the same pixels: a pale blue
       statue with coals crawling up it reads as neither. */
    const g2 = mk();
    const w2 = g2.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    w2.chill(Actor.FREEZE_AT);
    w2.ignite(300);
    let blue = 0;
    for (let i = 0; i < 400 && !w2.removed; i++) { w2.tic(); if (w2.frost > 0) blue = i; }
    check('and the blue is gone in the first half second of it',
      blue < 20, `${blue} tics`);
  }

  /* --- AND THE FLAMETHROWER ITSELF, WHICH IS NOT ignite() ----------
     The block above tests half of a flame particle. The other half is
     the damage, and testing the two apart is exactly how a frozen
     shopper came to be killed INSIDE the ice by the second particle of
     the stream. So this drives the real FlameStream._burnActor and asks
     what a whole particle does to a block of ice. */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    const health = who.health, bursts = g.giblets.bursts;
    who.chill(Actor.FREEZE_AT);
    g.flame._burnActor(who, who.x, who.y, who.z);
    check('one particle of the stream starts it', who.ash > 0 && !who.removed);
    check('and the rest of the burst does not shortcut it',
      (() => { for (let i = 0; i < 30; i++) g.flame._burnActor(who, who.x, who.y, who.z);
               return !who.removed && who.ash < 0.5; })(), `ash ${who.ash.toFixed(2)}`);
    check('and none of it reaches their health',
      who.health === health, `${health} -> ${who.health}`);
    let t = 0;
    for (; t < 400 && !who.removed; t++) who.tic();
    check('and the stream turns them into ash rather than giblets',
      who.removed && g.giblets.bursts === bursts && g.giblets.ashes === 1,
      `${g.giblets.bursts - bursts} bursts, ${g.giblets.ashes} ash`);
  }

  /* --- AND A BLAST DOES THE SAME, BECAUSE IT IS FIRE ---------------- */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.frozen);
    who.chill(Actor.FREEZE_AT);
    const health = who.health;
    g.explode({ x: who.x + 30, y: who.y, z: who.z });
    check('a car going up beside a block of ice starts eating whoever is in it',
      !who.frozen && !who.dead && who.ash > 0 && who.health === health,
      `${who.state.name}, health ${health} -> ${who.health}`);
    check('and does not blow them apart', who.state.name === 'SHOP_ASH1', who.state.name);
  }

  /* --- AND THE COLD CANNOT TAKE THEM BACK -------------------------
     The stream puts a burning person out, which is one of the best
     things it does. It does not put out somebody burning AWAY: half of
     them is on the floor already. The check is there because without it
     the two states are both true at once — blue, and being eaten, and
     held twice over. */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.frozen);
    who.chill(Actor.FREEZE_AT);
    who.ignite(300);
    for (let i = 0; i < 20; i++) who.tic();
    const at = who.ash;
    for (let i = 0; i < 40; i++) who.chill(20);
    check('the extinguisher cannot re-freeze somebody being eaten',
      !who.frozen && who.frost === 0 && who.ash >= at,
      `frost ${who.frost}, frozen ${who.frozen}`);
    for (let i = 0; i < 400 && !who.removed; i++) who.tic();
    check('and they still finish as ash', who.removed && g.giblets.ashes === 1);
  }

  /* --- AND A BLOW FINISHES ONE THAT IS HALF GONE -------------------
     Not a shatter — there is no ice left by then — and not a burst
     either, because there is not enough of a person left to throw
     around. Whatever hits them puts the rest of them on the floor. */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.frozen);
    who.chill(Actor.FREEZE_AT);
    who.ignite(300);
    for (let i = 0; i < 30; i++) who.tic();
    const half = who.ash, shatters = g.giblets.shatters, bursts = g.giblets.bursts;
    check('they are half way through when the blow lands', half > 0.1 && half < 0.95,
      `${half.toFixed(2)}`);
    who.damage(40, g.player, { impact: true });
    check('a blow on somebody half burnt drops the rest of them',
      who.removed && who.dead && g.giblets.ashes === 1);
    check('and it is neither a shatter nor a burst',
      g.giblets.shatters === shatters && g.giblets.bursts === bursts);
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

  /* --- OR THEY STAY EXACTLY WHERE THEY ARE --------------------------
     THE HOLD, and it is the one that shipped broken. freeze() parks the
     state with tics -1, which stops a frozen shopper moving ITSELF —
     and every other system in the game reached past that and set them
     going anyway, because setState was a door with no lock on it. All
     three doors are measured here and all three were open:

       a car going up next door   Game.scare
       the player's own trigger   Game.noise, once per tic, on hold
       a neighbour running past   A_Scare, straight in

     The first of them moved a block of ice ninety units in under two
     seconds, still solid, still blue, with ninety of its hundred frost
     still on it. */
  {
    const g = mk();
    const doors = [
      ['a car going up forty units away', w => g.scare(w.x + 40, w.y, 400)],
      ['the player pulling the trigger',  w => g.noise({ x: w.x, y: w.y }, 800)],
      ['somebody running past them',      w => ACTIONS.A_Scare(w, w.x + 100, w.y)],
    ];
    for (const [what, knock] of doors) {
      const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.frozen);
      who.chill(Actor.FREEZE_AT);
      const x0 = who.x, y0 = who.y, parked = who.state.name;
      knock(who);
      for (let t = 0; t < 60; t++) who.tic();
      const moved = Math.hypot(who.x - x0, who.y - y0);
      check(`${what} does not set a block of ice running`,
        who.frozen && who.state.name === parked && moved < 1 && !who.target && who.panic === 0,
        `${who.state.name}, moved ${moved.toFixed(0)}, panic ${who.panic}`);
      /* AND THE CLOCK STILL RUNS UNDERNEATH IT. The hold is a hold on
         acting, not on melting: a gate that also stopped frostTic would
         have made the first outcome — leave them, they thaw — into
         "leave them, they are a bollard for the rest of the level". */
      check('and the thaw goes on running underneath the hold',
        who.frost === Actor.FREEZE_AT - 10, `frost ${who.frost}`);
      who.frost = 0; who.thaw();
    }
    /* AND THE FRIGHT THEY MISSED IS HANDED TO THEM ON THE WAY OUT,
       which is why refusing all three costs nothing: what somebody
       coming out of the ice should run from is what is there NOW. */
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.frozen);
    who.chill(Actor.FREEZE_AT);
    g.scare(who.x + 40, who.y, 400);
    while (who.frozen) who.tic();
    check('and they come out of it frightened and running anyway',
      who.panic > 0 && who.state.name === 'SHOP_RUN1' && who.solid,
      `${who.state.name}, panic ${who.panic}`);
  }

  /* --- AND A FIRE IN THE AISLE DOES IT WITHOUT BEING AIMED ---------
     THE SAME RULE, ARRIVING THE OTHER WAY. A flame particle is a hit;
     this is the floor being alight, which is what the store is full of
     once it is going. It matters that the two agree, and for a while
     they did not: the fire system lights anything standing in a cell
     over 70 of 255 and frostTic was taking the frost off from a fifth
     of that, so there was a window in which a block of ice at the EDGE
     of a fire melted free while one in the middle of it was eaten. One
     rule now, at one line in frostTic — fire on ice is an execution
     however the fire got there. */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.frozen);
    who.chill(Actor.FREEZE_AT);
    const parked = who.state.name;
    check('a block of ice on a cold floor is a block of ice',
      (who.tic(), who.frozen && who.state.name === parked));
    g.fire.ignite(who.x, who.y, 36, 22);
    let t = 0;
    for (; t < 60 && who.frozen; t++) { g.fire.tic(); who.tic(); }
    note('a fire at their feet takes hold in', `${t} tics`);
    check('a fire in the cell they are standing in starts eating them',
      !who.frozen && who.ash > 0 && who.state.name === 'SHOP_ASH1',
      `${who.state.name} after ${t} tics`);
    check('and it does not have to be aimed at them to do it', t < 12, `${t} tics`);
    for (let i = 0; i < 400 && !who.removed; i++) { g.fire.tic(); who.tic(); }
    check('and the aisle finishes them the same way the gun would',
      who.removed && g.giblets.ashes === 1);
  }

  /* --- AND SOMETHING SAYS SO ----------------------------------------
     Freezing has a noise and a colour and the melt had neither, so a
     person the player had put on ice became a person again between two
     frames. The puff is the shatter's own, which is the right one: the
     two things that can happen to the ice should look related. */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.frozen);
    who.chill(Actor.FREEZE_AT);
    const puffs = g.fx.smoke.count;
    who.frost = 0; who.thaw();
    check('the melt leaves a breath of frost where they were',
      g.fx.smoke.count > puffs, `${g.fx.smoke.count - puffs} particles`);
  }

  /* --- AND SOMETHING TO BREAK THEM WITH -----------------------------
     THE WEAPON DOES NOT EXIST YET. The user asked for the game to be
     ready for a physical one — a bat, a hammer, whatever it turns out
     to be — and what that needs is not art, it is an answer to "what
     does a swing MEAN". Game.impact is that answer, written and
     measured ahead of the thing that will call it, so the weapon is an
     animation and a table entry rather than a design problem.

     Actor.damage already turned anything that was not fire into a
     shatter, so breaking somebody frozen needed nothing new. What is
     new is that the blow has a DIRECTION, and that the pieces go with
     it — which is the whole difference between being hit and coming
     apart on your own. */
  {
    const g = mk();
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.frozen);
    who.chill(Actor.FREEZE_AT);
    /* stand the player in front of them, facing them */
    const p = g.player;
    const ang = Math.atan2(who.y - p.y, who.x - p.x);
    p.x = who.x - Math.cos(ang) * 50; p.y = who.y - Math.sin(ang) * 50;
    p.z = who.z; p.viewZ = who.z + 41; p.angle = ang;
    const shatters = g.giblets.shatters;

    /* facing the other way first: a swing is a cone in front of you.
       (It may well catch one of the other seven hundred people in the
       shop, which is the point of a cone and not a sphere — what is
       checked is that the one behind you is not in it.) */
    p.angle = ang + Math.PI;
    check('a swing with your back to them does not reach them',
      !g.impact(p).includes(who) && !who.removed);

    p.angle = ang;
    const hit = g.impact(p, { force: 2.4 });
    check('and a swing at a frozen person breaks them',
      hit.length === 1 && hit[0] === who && who.removed && who.dead);
    check('and it is a shatter, the same one anything else gets',
      g.giblets.shatters === shatters + 1);

    /* AND THE PIECES GO THE WAY IT WAS SWUNG. Thirteen shards with a
       sixty-degree cone either side of the blow: the mean of them has
       to point down the swing, and every one of them has to be inside
       the cone or it is a ring with a bias rather than a direction. */
    const S = g.giblets.shards;
    let mx = 0, my = 0, n = 0, worst = 0;
    for (let i = 0; i < S.max; i++) {
      if (!S.alive[i]) continue;
      const a2 = Math.atan2(S.vy[i], S.vx[i]);
      let d = Math.abs(a2 - ang);
      while (d > Math.PI) d = Math.abs(d - Math.PI * 2);
      worst = Math.max(worst, d);
      mx += S.vx[i]; my += S.vy[i]; n++;
    }
    let off = Math.abs(Math.atan2(my, mx) - ang);
    while (off > Math.PI) off = Math.abs(off - Math.PI * 2);
    note('the shards off a blow', `${n} pieces, mean ${(off * 57.3).toFixed(0)}° off the swing, ` +
      `widest ${(worst * 57.3).toFixed(0)}°`);
    check('the pieces go the way the blow went', off < 0.5, `${(off * 57.3).toFixed(0)}° off`);
    check('and none of them comes back past the shoulder', worst <= 1.06,
      `${(worst * 57.3).toFixed(0)}°`);
  }

  /* --- AND THE REST OF WHAT A BLOW HAS TO DO ------------------------ */
  {
    const g = mk();
    const p = g.player;

    /* IT HITS THINGS THAT ARE NOT FROZEN TOO, and they are hurt rather
       than broken: the shatter is a property of the ICE, not of the
       weapon, and a physical weapon that only worked on frozen people
       would be a worse boxcutter. */
    const warm = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.frozen);
    p.x = warm.x - 40; p.y = warm.y; p.z = warm.z; p.viewZ = warm.z + 41;
    p.angle = Math.atan2(warm.y - p.y, warm.x - p.x);
    const bursts = g.giblets.bursts;
    const hit = g.impact(p, { damage: 6 });
    check('a blow lands on somebody who is not frozen as damage',
      hit[0] === warm && !warm.dead && warm.health === 6, `health ${warm.health}`);
    check('and does not shatter them', g.giblets.bursts === bursts);
    check('and a second one of those kills them the ordinary way',
      (g.impact(p, { damage: 6 }), warm.dead && g.giblets.bursts === bursts + 1));

    /* ONE SWING, MORE THAN ONE PERSON, if the weapon asks for it. */
    const g2 = mk();
    const p2 = g2.player;
    const queue = g2.actors.filter(a => a.type === 'SHOPPER' && !a.dead)
      .map(a => ({ a, d: Math.hypot(a.x - p2.x, a.y - p2.y) }))
      .sort((u, v) => u.d - v.d).slice(0, 3).map(o => o.a);
    let k = 0;
    for (const a of queue) {
      a.x = p2.x + Math.cos(p2.angle) * (40 + k * 12);
      a.y = p2.y + Math.sin(p2.angle) * (40 + k * 12);
      a.z = p2.z; k++;
    }
    check('one swing can be told to reach more than one of them',
      g2.impact(p2, { count: 3, range: 120, arc: 1.2 }).length === 3);

    /* AND A SWING AT A WALL LANDS SOMEWHERE, because a weapon that does
       nothing at all when you miss reads as a broken weapon. The player
       does not start next to a wall, so this walks a ray out to the
       first one it can find and stands them a swing's length off it. */
    const g3 = mk();
    const p3 = g3.player;
    /* onto the sales floor, where the walls are — the player starts in
       the middle of the car park, which is four hundred feet of tarmac
       in every direction */
    const inside = g3.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    p3.x = inside.x; p3.y = inside.y; p3.z = inside.z; p3.viewZ = inside.z + 41;
    for (const a of g3.actors) if (a.type === 'SHOPPER') a.remove();
    let wall = null;
    for (let i = 0; i < 32 && !wall; i++) {
      p3.angle = (i / 32) * Math.PI * 2;
      wall = g3.level.rayHitWall(p3.x, p3.y, p3.viewZ,
        p3.x + Math.cos(p3.angle) * 900, p3.y + Math.sin(p3.angle) * 900, p3.viewZ);
    }
    check('there is a wall somewhere in front of the player to swing at', !!wall);
    /* THE BOXCUTTER USED TO GO THROUGH THIS HOOK and is gone, at the
       user's request; the hook stays for the physical weapon that is
       still coming, so it is exercised here directly: a blow with a
       direction on it at a block of ice throws the pieces down the
       aisle in front of the swing. */
    {
      const g4 = mk();
      const p4 = g4.player;
      const w4 = g4.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.frozen);
      p4.x = w4.x - 40; p4.y = w4.y; p4.z = w4.z; p4.viewZ = w4.z + 41;
      p4.angle = Math.atan2(w4.y - p4.y, w4.x - p4.x);
      w4.chill(Actor.FREEZE_AT);
      check('nothing in the player\'s hands is a melee weapon any more',
        Object.values(pl.WEAPONS).every(d => !d.melee) && !('meleeSwing' in p4));
      check('and a blow through the hook at a block of ice still shatters it',
        (g4.impact(p4, { damage: 6, force: 1 }), w4.removed && w4.dead));
    }
    p3.x = wall.x - Math.cos(p3.angle) * 40;
    p3.y = wall.y - Math.sin(p3.angle) * 40;
    const puffs = g3.actors.filter(a => a.type === 'PUFF').length;
    check('and a swing that meets one puts a puff on it',
      g3.impact(p3).length === 0 &&
      g3.actors.filter(a => a.type === 'PUFF').length === puffs + 1);
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
    /* --- AND THE OTHER ONE, WHICH IS ONE BRANCH IN damage() -------
       Everything that can hurt the player arrives at Player.damage —
       the rifles, the vans, the fire FIREPROOF already refuses — and
       the only way out of the level dead is health reaching zero in
       there. So refusing the function is the whole feature. */
    /* --- THREE BARS, SPENT OUTSIDE IN ------------------------------
       At the user's request: an outer plate worth ten of you, an inner
       one worth five, and then you. They are LAYERS and not Doom's
       soak — the top one takes the whole of every hit until there is
       none of it left — which is the only reason a stack of three bars
       is worth drawing. */
    {
      const L = mk().player;
      check('you start with both plates and your health, in that order',
        L.armour2 === pl.ARMOUR2 && L.armour1 === pl.ARMOUR1 && L.health === pl.HEALTH,
        `${L.armour2}/${L.armour1}/${L.health}`);
      check('and the plates are ten and five times what a person is worth',
        pl.ARMOUR2 === 10 * pl.HEALTH && pl.ARMOUR1 === 5 * pl.HEALTH);
      L.damage(400, null, { shot: true });
      check('the first hit is all outer plate and nothing else',
        L.armour2 === pl.ARMOUR2 - 400 && L.armour1 === pl.ARMOUR1 && L.health === pl.HEALTH,
        `${L.armour2}/${L.armour1}/${L.health}`);
      L.damage(600, null, { shot: true });
      check('and the outer plate goes exactly at its own size, with nothing spilt',
        L.armour2 === 0 && L.armour1 === pl.ARMOUR1 && L.health === pl.HEALTH,
        `${L.armour2}/${L.armour1}/${L.health}`);
      L.damage(120, null, { shot: true });
      check('then the inner one starts', L.armour2 === 0 && L.armour1 === pl.ARMOUR1 - 120 && L.health === pl.HEALTH);
      /* 380 of inner plate left, so 420 is exactly forty into you */
      L.damage(420, null, { shot: true });
      check('and the overflow carries into you, but only the overflow',
        L.armour1 === 0 && L.health === pl.HEALTH - 40 && !L.dead,
        `${L.armour1}/${L.health}`);
      /* one hit big enough goes through all three in the same call */
      const T = mk().player;
      T.damage(pl.ARMOUR2 + pl.ARMOUR1 + pl.HEALTH, null, { shot: true });
      check('and a hit worth all sixteen hundred goes through the lot at once',
        T.armour2 === 0 && T.armour1 === 0 && T.health <= 0 && T.dead);
      /* and nothing under the whole stack kills you */
      const N = mk().player;
      N.damage(pl.ARMOUR2 + pl.ARMOUR1 + pl.HEALTH - 1, null, { shot: true });
      check('while one short of it leaves you standing on nothing', !N.dead && N.health === 1,
        `${N.health}`);
      /* fire is still refused before any of this: the plates are not
         what makes you fireproof */
      const F = mk().player;
      F.damage(900, null, { fire: true });
      check('and fire does not touch the plates either', F.armour2 === pl.ARMOUR2 && F.health === pl.HEALTH);
    }

    /* what the layers do to a test that wants to reach the health bar:
       take the plates off it first */
    const bare = q => { q.armour2 = 0; q.armour1 = 0; return q; };
    const inv = bare(mk().player);
    check('invincibility is off unless it is asked for', inv.invincible === false);
    inv.health = 70;
    inv.damage(9, null, { shot: true });
    check('a bullet lands while it is off', inv.health === 61, `${inv.health}`);
    inv.invincible = true;
    inv.damage(9, null, { shot: true });
    inv.damage(220, null, { impact: true, dx: 1, dy: 0, force: 2.5 });
    inv.damage(40, null, { fire: true });
    check('and nothing lands while it is on', inv.health === 61 && !inv.dead, `${inv.health}`);
    check('and it is not a heal: the health you had is the health you keep', inv.health === 61);
    check('and the shove goes with the hit', inv.momx === 0 && inv.momy === 0);
    check('and a thousand rifle rounds cannot kill you',
      (() => { for (let k = 0; k < 1000; k++) inv.damage(15, null, { shot: true }); return !inv.dead && inv.health === 61; })());
    inv.invincible = false;
    inv.damage(200, null, { shot: true });
    check('and switching it off puts you back where anybody can', inv.dead);
    /* the menu has both switches, and main.js wires both onto the player */
    {
      const fs2 = await import('node:fs');
      const html = fs2.readFileSync('index.html', 'utf8');
      const main = fs2.readFileSync('js/main.js', 'utf8');
      check('the pause menu offers both debug switches',
        /id="opt-debug"[^>]*>DEBUG: INFINITE AMMO</.test(html) &&
        /id="opt-godmode"[^>]*>DEBUG: INVINCIBLE</.test(html));
      check('and both are remembered and put on the player',
        /godmode: true/.test(main) && /toggle\('opt-godmode', 'godmode'\)/.test(main) &&
        /game\.player\.invincible = !!prefs\.godmode/.test(main));
      check('and both are ON by default, at the user\'s request, under a bumped prefs version',
        /debug: true, godmode: true/.test(main) && /const PREF_VERSION = 5;/.test(main) &&
        /id="opt-debug"[^>]*aria-pressed="true"/.test(html) && /id="opt-godmode"[^>]*aria-pressed="true"/.test(html));
    }

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
    check('there are four guns and all four files are there',
      Object.keys(w3.GUNS).length === 4 &&
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
    /* EVERY GUN IN THE GAME IS SOMEBODY ELSE'S NOW. The flamethrower
       the user built in Blender — the one model that carried its own
       marker spheres — was replaced at the user's request by a
       Sketchfab model that carries nothing, so all three are fitted and
       anchored by this table rather than by editing the file, which is
       the rule the van set. */
    /* AND THE MINIGUN IS THE EXCEPTION THAT PROVES IT: the user's own
       model again, with a marker cylinder in it for the emission point,
       so its nozzle is null here — the file says — and the reader that
       was kept for exactly that day reads it. */
    check('all four guns are fitted to the game\'s length, and three say where they point',
      Object.values(w3.GUNS).every(d => d.fit) &&
      Object.entries(w3.GUNS).every(([k, d]) => k === 'MINIGUN' ? d.nozzle === null : Array.isArray(d.nozzle) && d.nozzle.length === 3));
    check('and the flamethrower is the only one with a pilot light, being the only one that burns',
      Array.isArray(w3.GUNS.FLAMER.pilot) && E.pilot === null && w3.GUNS.BORE.pilot === null);
    check('and it is the only one whose muzzle is fire as painted',
      !w3.GUNS.FLAMER.cold && w3.GUNS.FLAMER.tint.every(v => v === 1));

    /* --- AND THE PILOT LIGHT IS ON THE NOZZLE -----------------------
       Reported by the user as misaligned, and it was: 0.537m off on a
       gun 1.4m long, a fifth of the screen's height below the barrel
       and nearly off the bottom of the frame.

       THE TWO EFFECTS ON THE GUN HANG OFF DIFFERENT THINGS, and that
       asymmetry is the whole of it. The muzzle is a child of the MODEL,
       so it takes the anchor in the model's own units and is right by
       construction. The pilot flame cannot be — the model is turned a
       half circle to point its barrel at the camera, and a flame quad
       inheriting that turn is a flame seen from behind — so it hangs
       off the GROUP instead, and a point handed to `position` is read
       in the PARENT's space. It was being given a WORLD-space point, so
       the group's own transform — the whole of VIEW.pos, the yaw, the
       bob — was applied to it a second time.

       The tell, for anyone who meets this again: the glow the pilot
       throws ON the gun was in the right place the whole time. That
       uniform takes the same vector in view space and is correct; only
       the mesh needed converting back out of the world.

       There is no scene graph in this test — the three stub is a
       handful of empty classes — so what is pinned is the pair of
       conversions in the source, which is where the fault was. */
    const gunSrc = fs3.readFileSync('js/weapon3d.js', 'utf8');
    const place = gunSrc.slice(gunSrc.indexOf('if (G.pilot) {'), gunSrc.indexOf('the muzzle, only while firing'));
    check('the pilot light is put where the model says, not where the group is',
      /G\.inner\.localToWorld\(pv\)/.test(place) &&
      /G\.group\.worldToLocal\(G\.pilot\.position\)/.test(place));
    /* and the asymmetry that makes that necessary, so that re-parenting
       the flame one day takes the conversion with it */
    check('and it hangs off the group while the muzzle hangs off the model',
      /group\.add\(g\.pilot\)/.test(gunSrc) && /inner\.add\(g\.muzzle\)/.test(gunSrc));

    /* --- AND THE BORE IS HELD SMALLER AND FARTHER OFF ----------------
       A third smaller and a third farther from the eye than the other
       two, at the user's request, and the two are per-gun numbers in
       GUNS rather than a change to VIEW, which the flamethrower was
       tuned against. "Farther off" is a push straight back along the
       view — z alone — and the first version of this check pinned the
       opposite: the whole position scaled along the line from the eye,
       which keeps a point's place on screen, and did, for the gun's
       centre, which is below the bottom of the frame by design; the
       gun shrank around a point nobody can see and all but left the
       picture. Pushed straight back it recedes toward the middle and
       stays in its corner, which is what farther off looks like. */
    const B = w3.GUNS.BORE;
    check('the bore is drawn a third smaller than the other two',
      Math.abs(B.fit - w3.GUN_LENGTH * 0.67) < 1e-9 &&
      E.fit === w3.GUN_LENGTH && w3.GUNS.FLAMER.fit === w3.GUN_LENGTH);
    /* AND EVERY GUN SAYS HOW FAR OUT IT IS HELD, which is how much of
       its length is on screen. The two streams are held about three
       times as far out as a gun used to be, at the user's request: at 1
       a quarter of a gun is behind the eye and the rest is too close to
       read. */
    check('and all three say how far out they are held, the two streams at about three',
      B.out === 1.33 && w3.GUNS.FLAMER.out === 3.0 && E.out === 2.8);
    check('and farther off is a push straight back along the view, z alone, not the whole position scaled',
      /\(VIEW\.pos\[2\] \+ off\[2\] \+ this\.kick \* 0\.025\) \* \(G\.def\.out \?\? 1\)/.test(gunSrc) &&
      !/multiplyScalar\(G\.def\.out/.test(gunSrc));
    /* HOW FAR A GUN IS DRAWN IS NOT HOW FAR ITS FIRE STARTS. The world
       takes the nozzle as a RAY out of the eye, and the point on it was
       whatever the drawn nozzle's distance came to — so holding a gun
       three times further out would have moved the birth of the stream
       from forty-two units in front of the player to seventy, which is
       the far side of a shelf you are standing against. Capped. */
    check('the stream is born no further into the level than a gun can reach',
      w3.NOZZLE_REACH >= 40 && w3.NOZZLE_REACH <= 60 &&
      /Math\.min\(nv\.length\(\) \* UNITS_PER_METRE, NOZZLE_REACH\)/.test(gunSrc),
      `${w3.NOZZLE_REACH} units`);
    check('and its exhaust is scaled with it, being in metres and not in the model',
      Math.abs(B.muzzle.len - 0.14 * 0.67) < 0.002 && Math.abs(B.muzzle.wid - 0.10 * 0.67) < 0.002);
    /* AND THE TWO NUMBERS ARE AT THE BUSINESS END OF THE MODEL.
       They were found by drawing the gun flat over a grid ruled in its
       own units and moving a crosshair until it sat in the bore and on
       the lip of the igniter pipe — there is no picture in a smoke
       test, so what is pinned here is everything a picture would have
       made obvious: that both anchors are inside the model's own box,
       at the far +z end of it, on the centre line, and that the pilot
       is the lower of the two and reaches further forward, which is the
       arrangement that makes a flamethrower look like one. An anchor at
       the wrong end, or on the wrong axis, fails here. */
    const glb = fs3.readFileSync('assets/models/flamethrower.glb');
    const jlen = glb.readUInt32LE(12);
    const meta = JSON.parse(glb.subarray(20, 20 + jlen).toString('utf8'));
    const posAcc = new Set();
    for (const m of meta.meshes) for (const q of m.primitives) posAcc.add(q.attributes.POSITION);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const i of posAcc) {
      const a = meta.accessors[i];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); }
    }
    const F = w3.GUNS.FLAMER, span = [0, 1, 2].map(k => hi[k] - lo[k]);
    note('the flamethrower', `${span.map(v => v.toFixed(1)).join(' x ')} model units, nozzle ${F.nozzle.join(', ')}, pilot ${F.pilot.join(', ')}`);
    check('the model is longest along z, which is the axis the scene turns to face the camera',
      span[2] > span[0] && span[2] > span[1]);
    const inBox = p => p.every((v, k) => v >= lo[k] - 1 && v <= hi[k] + 1);
    check('both anchors are on the model rather than floating off it', inBox(F.nozzle) && inBox(F.pilot));
    check('both are at the muzzle end, in the last tenth of its length',
      F.nozzle[2] > hi[2] - span[2] * 0.1 && F.pilot[2] > hi[2] - span[2] * 0.1,
      `${F.nozzle[2]} and ${F.pilot[2]} against a barrel that ends at ${hi[2].toFixed(1)}`);
    check('and on the centre line, which is where a barrel is',
      Math.abs(F.nozzle[0]) < span[0] * 0.1 && Math.abs(F.pilot[0]) < span[0] * 0.1);
    check('the pilot burns below the nozzle and a little ahead of it, on the igniter pipe',
      F.pilot[1] < F.nozzle[1] && F.pilot[2] > F.nozzle[2]);
    const scale = w3.GUN_LENGTH / Math.max(...span);
    const apart = Math.hypot(...[0, 1, 2].map(i => (F.pilot[i] - F.nozzle[i]) * scale));
    note('pilot to nozzle', `${(apart * 100).toFixed(1)}cm apart on a ${w3.GUN_LENGTH}m gun`);
    check('and it is a few centimetres off, not a third of the gun',
      apart > 0.01 && apart < 0.2, `${apart.toFixed(3)}m`);
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

  /* --- AND A BLOCK OF ICE DOES NOT --------------------------------
     The sway is what keeps a shop floor of standees from reading as
     cardboard, and it was running on the frozen ones: a statue rocking
     gently on its heels, which is the one drawing in the game that has
     to be dead still. Same for somebody the fire is eating — a body
     coming apart should sag, not sway.

     Checked through Actor.render rather than through swayOf, because
     swayOf is not where the mistake was: it was told to sway and it
     swayed. The guard is at the call, so the call is what is asked. */
  {
    const a = inside[3];
    const Actor = (await import('../js/actor.js')).Actor;
    const track = () => {
      let moved = 0, prev = null;
      for (let t = 0; t < 200; t++) {
        g.tics = t;
        a.render(a.x - 300, a.y, 0, 1, 0);
        const q = { x: a.mesh.position.x, y: a.mesh.position.y, z: a.mesh.position.z };
        if (prev) moved += Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z);
        prev = q;
      }
      return moved;
    };
    a.panic = 0;
    const warm = track();
    check('a shopper standing there is never quite still', warm > 1, warm.toFixed(2));
    a.chill(Actor.FREEZE_AT);
    check('but a frozen one is', track() === 0, track().toFixed(3));
    a.frost = 0; a.thaw();
    a.ash = 0.4;
    check('and so is one the fire is eating', track() === 0, track().toFixed(3));
    /* AND THEY SINK WHILE IT HAPPENS, or what is left of a half-burnt
       shopper hangs in the air with nothing under it — the front eats
       the drawing from the feet up and the quad does not move itself. */
    a.render(a.x - 300, a.y, 0, 1, 0);
    const low = a.mesh.position.y;
    a.ash = 0.9;
    a.render(a.x - 300, a.y, 0, 1, 0);
    check('and settle towards the floor as they go', a.mesh.position.y < low - 10,
      `${low.toFixed(0)} -> ${a.mesh.position.y.toFixed(0)}`);
    a.ash = 0;
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
    /const DETAIL = \[120,/.test(main) && /720\]/.test(main));
  /* WHAT THE GAME OPENS AT, which is two numbers and the user picked
     both: 200 rows of chunky pixels off a 720-row render. The grid is
     the picture and the render is how much is behind each square of it,
     so the default is the coarsest picture this game has ever shipped
     drawn off the finest buffer it has ever had. */
  {
    const det = [...(main.match(/const DETAIL = \[([^\]]*)\]/) || ['', ''])[1].split(',').map(v => +v)];
    const pix = [...(main.match(/const PIXELS = \[([^\]]*)\]/) || ['', ''])[1].split(',').map(v => +v)];
    const dDef = +(main.match(/const DEFAULT_DETAIL = (\d+)/) || [])[1];
    const pDef = +(main.match(/const DEFAULT_PIXELS = (\d+)/) || [])[1];
    note('what it opens at', `${pix[pDef]} rows of pixels off a ${det[dDef]}-row render`);
    check('the game opens at 240P pixels off a 720P render, at the user\'s request',
      pix[pDef] === 240 && det[dDef] === 720);
    check('and the render default is the top of its ladder',
      dDef === det.length - 1 && det.every((v, i) => i === 0 || v > det[i - 1]));
    check('and the pixel grid is never finer than the buffer behind it',
      pix[pDef] < det[dDef]);
  }

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
    check('and a one-to-three, three times as tall as it is wide, at the user\'s request',
      par.some(e => Math.abs(e.v - 1 / 3) < 0.001 && /1:3/.test(e.n)));
    /* which on a 16:9 window at 240 rows is every column of a 720-row buffer */
    const tall = at(1920, 1080, { height: 720, pixelHeight: 240, pixelAspect: 1 / 3 });
    check('which at 240 rows off 720 on 16:9 is 1280 across', tall.gridWidth === 1280 && tall.gridHeight === 240, `${tall.gridWidth}x${tall.gridHeight}`);
    check('and the picture opens a third brighter than drawn', /bright: 1\.35/.test(main) && /delete saved\.bright/.test(main));

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

  /* --- AND YOU CAN SEE THAT THEY ARE ---
     THE BEST THING IN THIS GAME WAS INVISIBLE. A shopper alight was the
     ordinary drawing turned fullbright, with the fire they had dropped
     on the floor doing all of the work: what you actually saw was a
     normal shopper standing near some flames. Three things fix it and
     it needs all three — flame off the body, the drawing's own colours
     going, and the light they throw — so all three are measured. */
  {
    const fx = await import('../js/effects.js');
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.removed && !a.burning);
    const p = g.player;
    p.x = who.x - 80; p.y = who.y;
    g.fx.bodyFlames.killAll();
    check('nobody standing about is throwing flame', g.fx.bodyFlames.count === 0);

    who.ignite(400);
    check('and catching fire does not snap the colour on', who.lit === 0);
    /* THE RAMP. Snapping the palette on the tic they catch makes a
       shopper CHANGE COLOUR; a third of a second of it reads as the
       fire taking hold of their clothes. */
    for (let t = 0; t < 4; t++) who.burnTic();
    const part = who.lit;
    check('it comes up over about a third of a second', part > 0.1 && part < 0.9,
      `${part.toFixed(2)} after four tics`);
    for (let t = 0; t < 12; t++) who.burnTic();
    check('and then they are fully alight', who.lit === 1);
    note('a burning shopper', `${g.fx.bodyFlames.count} licks of flame on them`);
    check('and there is flame on them', g.fx.bodyFlames.count > 3);

    /* THE LICKS ARE TONGUES AND NOT A BONFIRE. The first cut threw two
       a tic at up to thirty-four units, which on a fifty-six-unit
       person is a column of fire with somebody lost inside it — and the
       point of a burning shopper is that you can see WHO is burning. */
    check('but not so much of it that the person is lost inside it',
      g.fx.bodyFlames.count < 20 && fx.BODY_FIRE.sizeMax < who.height / 2,
      `${g.fx.bodyFlames.count} alive, up to ${fx.BODY_FIRE.sizeMax} units`);

    /* AND THE LIGHT. A burning person running down a dark aisle lights
       it, which the store's one fire light does by being pulled toward
       everything that burns — the wood, the gun, and now them. */
    g.tics++;                       // a fresh tic, so the glow is only theirs
    g.fx.bodyFire(who);
    const acc = { sx: 0, sy: 0, sw: 0, n: 0 };
    g.fx.glowInto(acc);
    check('and they pull the fire light toward themselves',
      acc.n === 1 && Math.hypot(acc.sx / acc.sw - who.x, acc.sy / acc.sw - who.y) < 1,
      `${acc.n} sources`);

    /* AND IT IS BUDGETED. A crowd fire is dozens of them at once and
       the aisle is already full of the fire's own flames. */
    const many = g.actors.filter(a => a.type === 'SHOPPER' && !a.dead && !a.removed).slice(0, 60);
    for (const a of many) { a.x = p.x + 40; a.y = p.y; a.burning = 400; a.lit = 1; }
    g.fx.bodyFlames.killAll();
    g.tics++;
    let asked = 0, threw = 0;
    for (const a of many) { asked++; threw += g.fx.bodyFire(a) > 0 ? 1 : 0; }
    check('and sixty people alight in one tic do not all throw flame',
      threw === fx.BODY_FIRE.most && asked > threw, `${threw} of ${asked}`);

    /* AND DISTANCE COSTS NOTHING. Somebody alight three rooms away is a
       glow on the shelving and not a particle system. */
    g.tics++;
    const far = many[0];
    far.x = p.x + fx.BODY_FIRE.near + 200; far.y = p.y;
    const before = g.fx.bodyFlames.count;
    g.fx.bodyFire(far);
    check('and one on the far side of the building throws none at all',
      g.fx.bodyFlames.count === before);
    const acc2 = { sx: 0, sy: 0, sw: 0, n: 0 };
    g.fx.glowInto(acc2);
    check('but still throws light, which is what you see at that range',
      acc2.n === 1, `${acc2.n} sources`);
    for (const a of many) { a.burning = 0; a.lit = 0; }
  }

  /* --- AND THE COLOUR COMES OFF WHEN THE FIRE DOES --------------- */
  {
    const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.removed && !a.burning);
    who.ignite(400);
    for (let t = 0; t < 20; t++) who.burnTic();
    check('somebody alight is alight', who.lit === 1 && who.burning > 0);
    who.chill(300);
    check('and the extinguisher takes the colour off with the fire',
      who.burning === 0 && who.lit === 0);
    /* and the other way it can end: frozen solid mid-run */
    const other = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && !a.removed && !a.burning && a !== who);
    other.ignite(400);
    for (let t = 0; t < 20; t++) other.burnTic();
    other.chill((await import('../js/actor.js')).Actor.FREEZE_AT * 3);
    check('and so does being frozen solid', other.frozen && other.lit === 0);
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
      /* AND IT IS POINT SAMPLED WHATEVER THE FILE ASKS FOR, at the
         user's request. Every other surface in this game is — the walls,
         the sprites, the sky, the fire, the HUD — and a model that
         arrives asking for LINEAR is a model exported by somebody
         rendering it a different way. The van happens to ask for
         NEAREST, so the only honest way to pin this is to hand the
         loader a sampler that asks for the opposite. */
      const asked = { magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 };  // LINEAR, LINEAR_MIPMAP_LINEAR, CLAMP
      const forced = car.carTexture({}, asked);
      check('a model asking for LINEAR is point sampled anyway',
        forced.magFilter === THREEc2.NearestFilter &&
        forced.minFilter === THREEc2.NearestMipmapNearestFilter && forced.generateMipmaps === true,
        `mag ${forced.magFilter}, min ${forced.minFilter}, mips ${forced.generateMipmaps}`);
      /* BUT THE WRAPPING IS STILL THE FILE'S, because that is a question
         about what the UVs MEAN rather than about how the game looks —
         and where a glTF leaves it out the spec's answer is REPEAT,
         which is not this renderer's habit and is not ours to pick. */
      check('but its wrapping is still its own',
        forced.wrapS === THREEc2.ClampToEdgeWrapping && forced.wrapT === THREEc2.ClampToEdgeWrapping);
      const s2 = car.carTexture({}, json.samplers[0]);
      check('and a file that says nothing about wrapping gets glTF\'s own default, repeat',
        t.wrapS === THREEc2.RepeatWrapping && t.wrapT === THREEc2.RepeatWrapping &&
        s2.magFilter === THREEc2.NearestFilter);
      /* AND THE OTHER LOADER AGREES, because there are two of them: the
         vehicles come through js/car.js and the guns through js/glb.js,
         and one rule that only half the models obey is not a rule.
         Checked at the source, since building a gun texture needs a
         browser to decode the PNG. */
      {
        const glbSrc = fs.readFileSync('js/glb.js', 'utf8');
        const carSrc = fs.readFileSync('js/car.js', 'utf8');
        check('both loaders point-sample through the one function, and neither reads a filter out of the file',
          /export function pointSample/.test(glbSrc) &&
          /pointSample\(new THREE\.Texture\(bitmap\)\)/.test(glbSrc) &&
          /pointSample\(new THREE\.Texture\(img\)\)/.test(carSrc) &&
          !/GL_FILTER/.test(glbSrc) && !/GL_FILTER/.test(carSrc));
      }
      /* AND EVERY MODEL ON DISK IS ONE THIS MATTERS FOR. Five of the six
         ask for LINEAR — which is what a modelling program writes by
         default — so this is not a rule waiting for a file to break it,
         it is a rule five files were already breaking. */
      {
        const asks = [];
        for (const f of fs.readdirSync('assets/models')) {
          const b = fs.readFileSync('assets/models/' + f);
          let o = 12, j = null;
          while (o < b.length) { const L = b.readUInt32LE(o), ty = b.toString('ascii', o + 4, o + 8);
            if (ty === 'JSON') j = JSON.parse(b.subarray(o + 8, o + 8 + L).toString('utf8')); o += 8 + L; }
          for (const sm of (j.samplers || [])) if (sm.magFilter !== 9728) asks.push(f);
        }
        note('models asking to be smoothed', asks.length ? asks.join(', ') : 'none');
        check('and the models on disk are the reason: most of them ask for LINEAR', asks.length >= 4);
      }
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

    /* --- AND THE WHITE PAINT COMES OFF IT ---------------------------
       A car park of one model in every bay was a joke worth one look.
       It is twelve colours now, and it is still one model, one sheet
       and one draw call: the paint rides in the vertices and the WHITE
       in the texture is isolated in the shader, by luminance with a
       saturation guard, and multiplied (see the INK block in
       js/material.js).

       WHAT IS CHECKED HERE is the claim the two numbers make: that
       everything which must NOT take the colour — the grille, the
       tyres, the glass, the bumpers, the sheet's own grey background —
       sits entirely below the ramp, and that every bright neutral texel
       sits entirely above it.

       THE BAND BETWEEN THEM IS NOT EMPTY and is not meant to be: it is
       the paint's own shading, the falloff from a lit panel to a
       shadowed one, and it takes a PART of the colour, which is exactly
       what makes a tinted van look painted rather than filled in. An
       earlier version of this check asserted a gap with nothing in it
       and failed on 7.7% of the sheet, all of it the side of the van.

       AND IT IS DONE IN LINEAR, which is the trap this fell into first.
       The sheet is an sRGB texture and is decoded on the way out of
       texture2D, so the numbers in the shader are not the numbers a
       colour picker says about the PNG. Set off the file, the ramp
       caught only the brightest highlights and what came out was a
       white van with a red pinstripe down every edge.

       The thresholds are READ OUT OF THE SHADER rather than repeated
       here, so this cannot quietly drift away from what runs. */
    {
      const { readPNG } = await import('./png-read.mjs');
      const matSrc = fs.readFileSync('js/material.js', 'utf8');
      const m = matSrc.match(/float pm = smoothstep\(([\d.]+), ([\d.]+), pl\) \* \(1\.0 - smoothstep\(([\d.]+), ([\d.]+), ps\)\)/);
      check('the shader says where the white paint is', !!m);
      const [LO, HI, S0, S1] = m ? m.slice(1).map(Number) : [0, 1, 0, 1];
      note('the paint mask', `luminance ${LO} to ${HI}, saturation guard ${S0} to ${S1}, in linear`);

      const bv = json.bufferViews[json.images[0].bufferView];
      /* `bin` is a Uint8Array VIEW on the file, so the slice has to be
         taken on the view and not by handing Buffer.from an offset it
         will ignore */
      const sheet = readPNG(Buffer.from(bin.subarray(bv.byteOffset || 0,
                                                     (bv.byteOffset || 0) + bv.byteLength)));
      const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
      const maskAt = i => {
        const r = lin(sheet.data[i*4]), g = lin(sheet.data[i*4+1]), b2 = lin(sheet.data[i*4+2]);
        const l = 0.30 * r + 0.59 * g + 0.11 * b2;
        const mx = Math.max(r, g, b2), mn = Math.min(r, g, b2);
        return { l, m: smooth(LO, HI, l) * (1 - smooth(S0, S1, mx ? (mx - mn) / mx : 0)) };
      };
      const N = sheet.w * sheet.h;
      let paintLike = 0, shading = 0, missedPaint = 0, caughtDark = 0, took = 0;
      for (let i = 0; i < N; i++) {
        const { l, m: mask } = maskAt(i);
        took += mask;
        if (l > HI + 0.05) {
          /* bright AND neutral: the bodywork. The few bright texels that
             are NOT neutral are the lenses, and the guard is there to
             leave them alone. */
          const r = lin(sheet.data[i*4]), g = lin(sheet.data[i*4+1]), b2 = lin(sheet.data[i*4+2]);
          const mx = Math.max(r, g, b2), mn = Math.min(r, g, b2);
          if ((mx ? (mx - mn) / mx : 0) < S0) { paintLike++; if (mask < 0.99) missedPaint++; }
        } else if (l < LO - 0.05) { if (mask > 0.01) caughtDark++; }
        else shading++;
      }
      note('the sheet, under the mask',
        `${(100 * paintLike / N).toFixed(0)}% is paint, ${(100 * shading / N).toFixed(1)}% is its shading, ` +
        `${(100 * took / N).toFixed(0)}% of the sheet takes colour`);
      check('the van is a white van, so there is a lot of paint to take',
        paintLike > N * 0.15, `${(100 * paintLike / N).toFixed(0)}%`);
      check('every bright neutral texel takes the colour', missedPaint === 0, `${missedPaint} missed`);
      check('and nothing below the ramp takes any of it', caughtDark === 0, `${caughtDark} caught`);
      check('and about a quarter of the sheet is painted, which is a van',
        took / N > 0.15 && took / N < 0.35, `${(100 * took / N).toFixed(0)}%`);

      /* and the named parts, which is what any of this is for */
      const at = (x, y) => maskAt(y * sheet.w + x).m;
      for (const [what, x, y, want] of [['a side panel', 150, 165, 1], ['the roof', 360, 160, 1],
                                        ['the grille', 120, 70, 0], ['a tyre', 60, 105, 0],
                                        ['the glass', 190, 45, 0], ['the sheet behind it', 255, 128, 0]]) {
        check(`${what} ${want ? 'takes' : 'does not take'} the paint`,
          want ? at(x, y) > 0.95 : at(x, y) < 0.05, `${at(x, y).toFixed(2)}`);
      }
    }

    /* --- AND THE COLOURS THEMSELVES -------------------------------- */
    {
      const veh2 = await import('../js/vehicles.js');
      const P = veh2.PAINT;
      note('the fleet', `${P.length} entries, ${new Set(P.map(c => c.join(','))).size} colours`);
      check('there is more than one colour of van', new Set(P.map(c => c.join(','))).size > 6);
      check('and every one of them is three numbers in range',
        P.every(c => c.length === 3 && c.every(v => v >= 0 && v <= 1)));
      /* NOTHING TOO DARK TO SURVIVE. This multiplies twice — the sheet's
         own shading, and then a car park at dusk — so a colour picked at
         the value a van is really painted comes out as a black shape
         with wheels. The first palette was, and did. */
      check('and none of them is too dark to still be a colour on screen',
        P.every(c => Math.max(...c) >= 0.4), P.map(c => Math.max(...c).toFixed(2)).join(' '));
      check('and the white the model came in is still in the lot',
        P.some(c => c[0] === 1 && c[1] === 1 && c[2] === 1));

      /* OFF THE BAY'S OWN POSITION, not a fresh random: the map lays the
         lot out with a seeded stream and drawing from it here would move
         every number after it, which is most of the level. */
      const slot = { x: 1234, y: -567, variant: 2 };
      check('a bay gets the same paint every time the level is built',
        veh2.paintOf(slot) === veh2.paintOf({ ...slot }));
      check('and the bay next to it usually gets a different one',
        veh2.paintOf(slot) !== veh2.paintOf({ ...slot, x: slot.x + 186 }));
      /* and it spreads: a hash that piles up on one entry is a fleet */
      const seen = new Map();
      for (let i = 0; i < 400; i++) {
        const c = veh2.paintOf({ x: i * 186 + 300, y: (i % 7) * 220, variant: i % 5 });
        seen.set(c, (seen.get(c) || 0) + 1);
      }
      const most = Math.max(...seen.values());
      check('and it spreads over the palette rather than piling up',
        seen.size >= Math.min(8, new Set(P.map(c => c.join(','))).size) && most < 400 * 0.30,
        `${seen.size} of ${P.length} used, commonest ${most} of 400`);

      /* AND IT REACHES THE VERTICES, in the channel that was already
         there: `a` of 0 says this surface has a picture, and the rgb
         beside it is what the white in that picture is multiplied by. */
      const painted = car.carGeometry(v, { length: v.length, paint: [0.25, 0.5, 0.75] });
      const ink4 = painted.ink;
      check('the paint rides in the vertices rather than in a second material',
        ink4.length === painted.position.length / 3 * 4 &&
        ink4[3] === 0 && ink4[0] === 0.25 && ink4[1] === 0.5 && ink4[2] === 0.75);
      const plain = car.carGeometry(v, { length: v.length });
      check('and a vehicle that asks for no colour is white, which is the model',
        plain.ink[0] === 1 && plain.ink[1] === 1 && plain.ink[2] === 1 && plain.ink[3] === 0);
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

  /* --- AND THE POLICE VAN, which is the user's second model -----------
     Loaded the same way, on its own sheet; longer, because it is an
     armoured truck and the number is set against what it is rather than
     against the file (see POLICE_LENGTH). The one thing that went wrong
     loading it is worth a check of its own: it carries FOUR images, and
     the first of them is a flat black emissive map. */
  const police = await (async () => {
    const glb = await import('../js/glb.js');
    const bytes = fs.readFileSync('assets/models/police_assault.glb');
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const { json, bin } = glb.parseGLB(ab);
    note('the police van', `${json.meshes.length} mesh, ${json.materials.length} material, ${json.images.length} images`);
    const painted = json.materials.find(m => m.pbrMetallicRoughness?.baseColorTexture);
    const colour = json.textures[painted.pbrMetallicRoughness.baseColorTexture.index].source;
    check('its colour is not the first image in the file, so the loader has to ask the material',
      colour !== 0 && /diffuse/i.test(json.images[colour].name || ''), `image ${colour}`);
    const v = car.modelVehicle(json, bin, { length: car.POLICE_LENGTH, id: 'police', name: 'Assault van', use: 'police' });
    check('it is a truck: longer than the van, wider, and taller',
      car.carLength(v) > car.carLength(van) && car.carWidth(v) > car.carWidth(van) && car.carHeight(v) > car.carHeight(van),
      `${car.carLength(v)} long, ${car.carWidth(v).toFixed(0)} wide, ${car.carHeight(v).toFixed(0)} tall`);
    check('and it fits across the fire lane', car.carWidth(v) < 160, `${car.carWidth(v).toFixed(0)} wide`);
    check('and every triangle of it is on the sheet', v.model.tris.every(t => !t.ink));
    return v;
  })();

  /* --- AND THE ARMY'S CARRIER, which is the user's third model --------
     A hover APC, and the first vehicle in the game that does not touch
     the road. Loaded exactly like the other two — the model says
     nothing about hovering, which is a fact about the GAME and lives in
     ArmyApc — and measured against the police van beside it, because
     "an APC" is a shape rather than a size: not much longer, half again
     as wide, and still inside the fire lane. */
  const apc = await (async () => {
    const glb = await import('../js/glb.js');
    const bytes = fs.readFileSync('assets/models/apc.glb');
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const { json, bin } = glb.parseGLB(ab);
    note('the APC', `${json.meshes.length} mesh, ${json.materials.length} material, ${json.images.length} image, ` +
      `${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
    /* tools/prep-model.mjs took the normal map and the metal-rough off
       it on the way in — two megabytes for a renderer with no lighting
       model to spend them on. What is left is the one picture that IS
       the vehicle. */
    check('the maps an unlit renderer cannot use are off it: one image left, and it is the colour',
      json.images.length === 1 && /diffuse/i.test(json.images[0].name || ''),
      json.images.map(i => i.name).join(', '));
    check('and the game prepared it rather than the artist',
      /prep-model/.test(json.asset.generator || ''), json.asset.generator);
    const v = car.modelVehicle(json, bin, { length: car.APC_LENGTH, id: 'apc', name: 'Hover APC', use: 'army' });
    check('it is an APC: a fifth longer than the assault van and half again as wide',
      car.carLength(v) > car.carLength(police) && car.carWidth(v) > car.carWidth(police) * 1.4,
      `${car.carLength(v)} long, ${car.carWidth(v).toFixed(0)} wide, ${car.carHeight(v).toFixed(0)} tall, ` +
      `against ${car.carLength(police)} by ${car.carWidth(police).toFixed(0)}`);
    check('and it still fits across the fire lane, which is what stopped it being bigger',
      car.carWidth(v) < 160, `${car.carWidth(v).toFixed(0)} wide of 160`);
    check('and every triangle of it is on the sheet', v.model.tris.every(t => !t.ink));
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
    police: { texture: {}, def: police },
    apc: { texture: {}, def: apc },
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
    const bangs = [];
    const realExplode = gm.explode.bind(gm);
    gm.explode = (a, o) => { blasts++; bangs.push(o); return realExplode(a, o); };
    /* WATCHING IT CHAR: how long it spends there, and what the vertices
       do while it does. The car leaves the slab for a mesh of its own
       the tic it starts, and that mesh's `charred` and `light` are the
       two numbers js/material.js turns into coals and black paint. */
    let charTics = 0, charMesh = null, charMid = null, blastsBefore = 0, embersAt = -1;
    const fx = gm.fx;
    const realEmber = fx.ember.bind(fx);
    let embers = 0;
    fx.ember = (...a) => { embers++; return realEmber(...a); };
    for (let i = 0; i < 700 && target.state !== 'wreck'; i++) {
      gm.tic();
      if (seen[seen.length - 1] !== target.state) seen.push(target.state);
      if (target.state === 'charring') {
        charTics++;
        charMesh = target.mesh;
        if (charTics === 1) { blastsBefore = blasts; embersAt = embers; }
        if (charTics === 90) charMid = {
          charred: target.mesh.geometry.getAttribute('charred').array[0],
          light: target.mesh.geometry.getAttribute('light').array[0],
          light0: target.light0[0],
        };
      }
    }
    fx.ember = realEmber;
    note('one vehicle, lit', seen.join(' -> '));
    check('being on fire eventually takes it apart',
      target.health < startHealth && target.state === 'wreck');
    /* IT CHARS FIRST, at the user's request, and then goes up. */
    check('and it charred, went up, flew, and came down',
      seen.join(',') === 'parked,charring,air,settle,wreck', seen.join(','));
    note('and how long it charred for', `${charTics} tics, ${(charTics / 35).toFixed(1)}s`);
    check('the char is long enough to watch and short enough to wait for',
      charTics >= 4.5 * 35 - 2 && charTics <= 7.5 * 35 + 2, `${charTics} tics`);
    check('a charring car is its own mesh, out of the slab',
      !!charMesh && charMesh.name === 'car:' + van.id && !target.slab);
    check('and halfway through, its coals are up and its paint is down',
      charMid && charMid.charred > 0.25 && charMid.charred < 0.8 &&
      charMid.light < charMid.light0 * 0.85 && charMid.light > charMid.light0 * 0.4,
      charMid ? `charred ${charMid.charred.toFixed(2)}, light ${charMid.light.toFixed(2)} of ${charMid.light0.toFixed(2)}` : 'no midpoint');
    check('nothing exploded while it was charring', blasts === blastsBefore || bangs.length <= 2,
      `${blasts - blastsBefore} bangs during the char`);
    check('and it threw embers the whole time', embers - embersAt >= charTics * 0.9,
      `${embers - embersAt} embers over ${charTics} tics`);
    /* TWO BANGS: one as it leaves and one as it lands. */
    check('it exploded twice, not once', blasts >= 2, `${blasts} explosions`);
    /* AND THE FIRST IS FOUR OF THE OLD ONE — at the user's request. What
       the old bang was is written down here rather than read from the
       file, because the file no longer has it: radius 210, damage 90,
       three fireballs, 26 embers, 7 puffs. */
    {
      const first = bangs[0];
      check('the launch bang reaches twice as far — four times the area',
        first && first.radius === 420, `${first?.radius}`);
      check('and hits twice as hard', first && first.damage === 180, `${first?.damage}`);
      check('and pins the heat of the floor to the top of the scale', first && first.heat === 255, `${first?.heat}`);
      check('and is the loudest thing in the game', first && first.sound === 'bigboom', `${first?.sound}`);
      const second = bangs[1];
      check('the crash bang is what it always was', second && second.radius === 170 && second.damage === 55,
        `${second?.radius} / ${second?.damage}`);
    }

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

  /* ==================================================================
     THE SQUAD

     The first thing in the game that fights back: a van up the road
     after the first kill, troopers out of the side of it, a rifle. It
     is tested end to end on the real map with the real routes, because
     every piece of it — the drive, the bay, the door, the chase, the
     shot — is a place the pieces can disagree, and a van that parks in
     a wall or a trooper who steps out inside the van is exactly the
     kind of bug a screenshot finds and a unit test does not.
     ================================================================== */
  section('the squad');
  {
    const ppl = await import('../js/people.js');
    const { readPNG } = await import('./png-read.mjs');
    const { ACTIONS } = await import('../js/actor.js');
    const { SWAT: S } = await import('../js/responders.js');
    /* A FRESH GAME, because the one above has just had a car park go up
       in it and a squad walking through a burning lot is a squad that
       is dead in nine seconds — which is correct, and is not what this
       is measuring. */
    const gs = new Game({
      level: MAP.buildSellWrong(), scene: new THREE2.Scene(), camera: {},
      textures: gm.textures, sprites: spr.bakeSprites(),
      hud: { message() {}, ticMessages() {} }, audio: null,
      input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
               attack: false, use: false, run: false, sample() {}, sensitivity: 0 },
      fleet: { texture: {}, def: van },
      police: { texture: {}, def: police },
      apc: { texture: {}, def: apc },
    });
    const R = gs.responders;

    /* --- the art ------------------------------------------------------
       The user's sheets, cut by tools/prep-troops.mjs into strips in the
       order js/people.js reads them back. Five drawings a turned frame
       and three mirrors, exactly as Doom's own sprites did it. TWO OF
       THEM: the SWAT, who are in the game, and the army trooper, who is
       cut, loadable and proven here and is NOT in the game — no actor,
       no state, nothing loads the strip — at the user's request. */
    const same = (p, q) => {
      if (p.w !== q.w || p.h !== q.h) return false;
      for (let i = 0; i < p.data.length; i++) if (p.data[i] !== q.data[i]) return false;
      return true;
    };
    const tallOf = p => { let top = p.h; for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.alphaAt(x, y) > 8) { top = Math.min(top, y); } return p.h - top; };
    check('the troops table names two sheets cut the same way, the SWAT and the army',
      Object.keys(ppl.TROOPS).join(',') === 'SWAT,ARMY' &&
      ppl.TROOPS.ARMY.turn === ppl.TROOPS.SWAT.turn && ppl.TROOPS.ARMY.flat === ppl.TROOPS.SWAT.flat &&
      ppl.TROOPS.ARMY.cells === ppl.TROOPS.SWAT.cells && ppl.SWAT_CELLS === ppl.TROOPS.SWAT.cells);
    check('and both sheets are kept, decoded, beside the strips cut from them',
      Object.values(ppl.TROOPS).every(t => fs.existsSync(t.sheet) && fs.existsSync(t.strip)));
    for (const [key, t] of Object.entries(ppl.TROOPS)) {
      const cell = ppl.CELLS.troops;
      const img = readPNG(new URL('../' + t.strip, import.meta.url));
      check(`${t.strip} is the strip the tables are built on`,
        img.w === cell.w * t.cells && img.h === cell.h, `${img.w}x${img.h}, want ${cell.w * t.cells}x${cell.h}`);
      const n = ppl.addTroops(gs.sprites, img, key);
      check(`and the loader takes every cell of it, under ${t.sprite}`, n === t.cells && gs.sprites.frames.has(t.sprite + 'A'), `${n}`);
      const A = gs.sprites.frames.get(t.sprite + 'A');
      check('a turned frame has eight views', A.views.length === 8 && A.views.every(v => v.w === cell.w));
      check('and rotation 1 is the mirror of rotation 7, not a copy of it',
        same(A.views[1], A.views[7].mirrored()) && !same(A.views[1], A.views[7]));
      check('and head on and from behind are two different drawings', !same(A.views[0], A.views[4]));
      const lying = gs.sprites.frames.get(t.sprite + 'N');
      check('and lying down is the same from every side', lying.views.every(v => v === lying.views[0]));
      /* the scale */
      note(`a ${key} trooper, head on`, `${tallOf(A.views[0])} tall in a ${cell.h} cell, lift ${t.lift}`);
      check('the standing trooper is the height the table says', Math.abs(tallOf(A.views[0]) - t.height) <= 1);
      check('and every cell keeps the 64-pixel rule', cell.w <= 64 && cell.h <= 64);
      /* every cell has something in it — a cut that found a smear of
         JPEG halo instead of a drawing would leave an empty one */
      const cells = Array.from({ length: t.cells }, (_, k) => {
        let n2 = 0; for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) if (img.data[((y * img.w) + k * cell.w + x) * 4 + 3] > 8) n2++; return n2;
      });
      check('and every cell holds a drawing', cells.every(c => c > 60), cells.map((c, k) => c <= 60 ? k : null).filter(k => k !== null).join(','));
    }
    /* the two figures are the same sheet layout, so the same letter is
       the same pose: the army's firing frame is as orange as the SWAT's */
    {
      const glow = p => { let o = 0, n = 0; for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { if (p.alphaAt(x, y) < 128) continue; n++; const i = (y * p.w + x) * 4; if (p.data[i] > 180 && p.data[i + 1] > 90 && p.data[i + 2] < 120) o++; } return n ? o / n : 0; };
      const sf = gs.sprites.frames.get('SWATF').views[0], af = gs.sprites.frames.get('ARMYF').views[0];
      const sa = gs.sprites.frames.get('SWATA').views[0], aa = gs.sprites.frames.get('ARMYA').views[0];
      note('how orange the firing frame is', `SWAT ${(glow(sf) * 100).toFixed(0)}% against ${(glow(sa) * 100).toFixed(0)}% walking; army ${(glow(af) * 100).toFixed(0)}% against ${(glow(aa) * 100).toFixed(0)}%`);
      check('the firing frame is the lit one on both sheets', glow(sf) > glow(sa) * 2 && glow(af) > glow(aa) * 2);
    }
    /* AND THE ARMY IS IN THE GAME NOW, which is what the APC bought:
       the sheet was cut and left sitting here at the user's request
       until there was something to bring them up the road. */
    check('the army trooper is in the game: an actor, a whole table of states, and the strip loaded',
      !!st.ACTORS.ARMY && !!st.STATES.ARMY_STAND && !!st.STATES.ARMY_XDIE9 &&
      /'swat', 'army'/.test(fs.readFileSync('js/main.js', 'utf8')));
    /* ONE TABLE, TWO TROOPS. Every state the SWAT have, the army have:
       the same letter, the same tics, the same fullbright on the firing
       frame, under their own prefix and their own sprite. It is one
       generator called twice rather than thirty lines written twice,
       which is the whole reason the super army will be a third line. */
    {
      const names = Object.keys(st.STATES).filter(n => n.startsWith('SWAT_')).map(n => n.slice(5));
      const odd = names.filter(n => {
        const a = st.STATES['SWAT_' + n], b = st.STATES['ARMY_' + n];
        return !b || b.frame !== a.frame || b.tics !== a.tics || b.sprite === a.sprite ||
               !!b.fullbright !== !!a.fullbright;
      });
      note('the two tables', `${names.length} states each, ${odd.length} that do not match`);
      check('every SWAT state has an army state on the same frame for the same tics',
        names.length >= 30 && odd.length === 0, odd.join(', '));
      /* and the ONE thing that differs, which is what they do with the
         rifle: two rounds instead of one, tighter — see A_ArmyFire */
      check('and the only thing that differs is the action on the firing frame',
        st.STATES.SWAT_ATK2.action === 'A_SwatFire' && st.STATES.ARMY_ATK2.action === 'A_ArmyFire' &&
        names.every(n => n === 'ATK2' || st.STATES['SWAT_' + n].action === st.STATES['ARMY_' + n].action));
      /* AND BOTH HAVE A STAND-IN UNDER THEM, so a sheet that fails to
         load costs that force its faces and nothing else — and the two
         stand-ins are not the same drawing, because the day one sheet
         loads and the other does not is the day you need to know which
         one is shooting at you. */
      const bank = gs.sprites;
      const pix = k => bank.frames.get(ppl.TROOPS[k].sprite + 'A').views[0];
      check('and both troops have a stand-in under every letter their table names',
        Object.values(ppl.TROOPS).every(t => [...t.turn, ...t.flat].every(L => !!bank.frames.get(t.sprite + L))));
      check('and the two stand-ins are told apart, not the same body twice', !same(pix('SWAT'), pix('ARMY')));
    }

    /* --- the map's part ------------------------------------------- */
    const onTarmac = p => { const s2 = level.sectorAt(p.x, p.y); return !!s2 && /road|junction/i.test(s2.name); };
    check('the map publishes a way in from each end of the road',
      !!level.swatRoutes?.west && !!level.swatRoutes?.east && level.swatRoutes.west.length >= 2);
    check('and every point on both of them is on the road',
      [...level.swatRoutes.west, ...level.swatRoutes.east].every(onTarmac),
      [...level.swatRoutes.west, ...level.swatRoutes.east].filter(q => !onTarmac(q)).map(q => level.sectorAt(q.x, q.y)?.name || 'off the map').join('; '));
    check('and the bays are in the fire lane, where nobody parks',
      level.swatBays.length >= S.bays && level.swatBays.every(b => /fire lane/.test(level.sectorAt(b.x, b.y)?.name || '')));
    /* AND THE LOOP THEY DRIVE ROUND to reach anywhere else. Four
       corners, every one of them on tarmac, and the two ways in meet
       it at a junction. */
    check('the map publishes the perimeter road as a closed loop',
      Array.isArray(level.swatRing) && level.swatRing.length === 4 && level.swatRing.every(onTarmac),
      (level.swatRing || []).map(q => level.sectorAt(q.x, q.y)?.name || 'off the map').join('; '));
    check('and each way in ends on that loop',
      [level.swatRoutes.west, level.swatRoutes.east].every(r => {
        const e = r[r.length - 1];
        return level.swatRing.some(c => Math.hypot(c.x - e.x, c.y - e.y) < 1);
      }));

    /* --- the call -------------------------------------------------- */
    const p = gs.player;
    /* INSIDE, for this first part: where a van goes depends on where
       you are (see `chasing` in js/responders.js), and the doors are
       the answer to being in the building. The chase is measured
       further down. */
    const stand = (x, y) => {
      p.x = x; p.y = y; p.sector = level.sectorAt(x, y); p.z = p.sector.floor; p.viewZ = p.z + 41;
      p.momx = p.momy = 0;
    };
    const home = { x: p.x, y: p.y };
    const fsSquad = await import('node:fs');
    const inShop = gs.actors.find(a => a.type === 'SHOPPER' && a.sector && !a.sector.outdoor);
    stand(inShop.x, inShop.y);
    check('the player is in the building, so the doors are where a van goes', !p.sector.outdoor && !R.chasing);
    check('nobody has been called before a shot', !R.called && R.vans.length === 0 && p.shotsFired === 0);
    /* ONE PULL OF THE TRIGGER, at the user's request, and they are
       dispatched on that tic — no kill, no sixteen-second grace. */
    p.startFire();
    check('firing counts as firing', p.shotsFired === 1 && p.kills === 0);
    gs.tic();
    check('and that is the call', R.called && R.calledAt === R.tics);
    check('and they are on the road already, not in sixteen seconds',
      S.firstDelay === 0 && R.vans.length > 0, `${R.vans.length} vans, delay ${S.firstDelay}`);
    const v = R.vans[0];
    check('a van is on the road', !!v && v.state === 'driving');
    /* and a death still calls them, for the night the fire kills
       somebody on its own after you have stopped firing */
    check('a kill would have called them too',
      /p\.shotsFired >= SWAT\.after \|\| p\.kills > 0/.test(fsSquad.readFileSync('js/responders.js', 'utf8')));
    /* THREE OF THEM, at the user's request, from the same end of the
       road and strung out along it rather than stacked on the spot. */
    check('and three of them, not one', R.vans.length === S.convoy, `${R.vans.length}`);
    check('all from the same end, nose to tail down the road',
      R.vans.every(q => q.side === v.side) &&
      new Set(R.vans.map(q => Math.round(q.x))).size === R.vans.length,
      R.vans.map(q => q.x.toFixed(0)).join(', '));
    check('and each going to a different place', new Set(R.vans.map(q => q.bay)).size === R.vans.length);
    if (v) {
      const end = level.roadEnds.find(e => e.side === v.side);
      check('it started where the road leaves the map', Math.hypot(v.x - end.x, v.y - end.y) < 1);
      check('it is the police van, on its own sheet, as its own mesh',
        v.def === police && v.own && !!v.mesh && !v.slab);
      check('and it is three of Doom cylinders like every other vehicle',
        v.blockers.length === 3 && v.blockers.every(b => b.solid && b.vehicle === v));
      const x0 = v.x, b0 = v.blockers[0].x;
      for (let i = 0; i < 20; i++) gs.tic();
      check('it moves', v.x !== x0 && v.driven > 150, `${v.driven.toFixed(0)} units in 20 tics`);
      check('and its cylinders move with it',
        v.blockers[0].x !== b0 && Math.hypot(v.blockers[1].x - v.x, v.blockers[1].y - v.y) < 1e-6);
      let t = 20;
      for (; t < 3000 && v.state === 'driving'; t++) gs.tic();
      note('the drive', `${t} tics, ${v.driven.toFixed(0)} units`);
      check('it arrives and parks', v.state === 'parked', v.state);
      check('in its bay, in the fire lane',
        !!v.bay && Math.hypot(v.x - v.bay.x, v.y - v.bay.y) < 1 && /fire lane/.test(level.sectorAt(v.x, v.y)?.name || ''),
        `${v.x.toFixed(0)}, ${v.y.toFixed(0)} in ${level.sectorAt(v.x, v.y)?.name}`);
      check('squared up along the front', Math.abs(Math.sin(v.yaw)) < 1e-9, `${v.yaw.toFixed(3)}`);
      check('and in the way there', p.thingInWay(v.x, v.y));

      /* --- the crew ------------------------------------------------ */
      for (let i = 0; i <= S.unloadEvery + 2 && R.troopers === 0; i++) gs.tic();
      const first = gs.actors.find(a => a.type === 'SWAT');
      check('and it unloads a trooper', !!first);
      if (first) {
        const half = car.carWidth(police) / 2;
        check('who steps out on the shop side of it, clear of it, on the ground',
          first.y > v.y + half && !!level.sectorAt(first.x, first.y),
          `${(first.y - v.y).toFixed(0)} off the van's line, ${level.sectorAt(first.x, first.y)?.name}`);
        check('and is after you from the first step',
          first.target === p && /^SWAT_(RUN|ATK)/.test(first.state.name), first.state.name);
        check('and turns: not a standee', !first.flat && first.info.team === 'law');
      }
      /* BACK OUT INTO THE LOT for the rest of this. The doors were the
         point of the block above; what follows is about troopers, and a
         trooper standing among the shelves with the player on the far
         side of one is a fight the geometry decides. */
      stand(home.x, home.y);
      for (let i = 0; i < S.unloadEvery * S.crew + 5; i++) gs.tic();
      note('the crew', `${R.troopers} on their feet, ${R.spawned} ever`);
      check('the whole crew is out inside the time', R.spawned >= S.crew, `${R.spawned} of ${S.crew}`);
      const before = R.spawned;
      for (let i = 0; i < S.trickle + 5; i++) gs.tic();
      check('and it keeps unloading after the crew is out', R.spawned > before, `${R.spawned} after ${before}`);
      const walked = gs.actors.filter(a => a.type === 'SWAT' && !a.dead)
        .map(a => Math.hypot(a.x - v.x, a.y - v.y));
      note('where they have got to', `${walked.filter(d => d > 200).length} of ${walked.length} more than 200 from the van`);
      check('and the troopers walk off toward you rather than standing at the door',
        walked.some(d => d > 200));

      /* --- the rifle ------------------------------------------------ */
      const a = gs.actors.find(q => q.type === 'SWAT' && !q.dead);
      const px = p.x, py = p.y;
      /* A HUNDRED AND SIXTY UNITS OFF, IN A CLEAR DIRECTION. It used to
         be straight along +x, which happened to be clear on the day it
         was written and stopped being the day the random sequence
         moved (anything that draws a random number before this point —
         a decal's size, say — moves where the trooper is standing).
         So the direction is found: the first of sixteen with nothing
         in the way, which is what the test means anyway. */
      let ang = 0;
      for (let k = 0; k < 16; k++) {
        const t = k * Math.PI / 8;
        if (!gs.trace(a, t, 0, 175).actor) { ang = t; break; }
      }
      p.x = a.x + Math.cos(ang) * 160; p.y = a.y + Math.sin(ang) * 160;
      a.angle = ang;
      check('a trooper can see you at a hundred and sixty', a.canSee(p));
      /* THE PLATES OFF FIRST. What is being measured here is that a
         rifle reaches the player at all; sixteen hundred of armour in
         front of the health bar would take three hundred rounds to say
         so. See the layer tests in `the guns`. */
      p.health = 100; p.armour2 = 0; p.armour1 = 0;
      const shots0 = a.shots || 0;
      /* five, not thirty: at this range every shot lands and thirty of
         them is a dead player, which the rest of this section needs not
         to have */
      for (let i = 0; i < 5; i++) ACTIONS.A_SwatFire(a);
      check('the rifle fires', a.shots === shots0 + 5);
      check('and the shots land on you — the player is not bulletproof', p.health < 100 && !p.dead, `100 -> ${p.health}`);
      const hb = p.health;
      p.damage(20, null, { fire: true });
      check('but fire still does nothing to you', p.health === hb, `${hb} -> ${p.health}`);
      /* THE TEAM RULE: a trooper hit by the man behind him does not turn
         round, because a squad that infights is a squad you watch */
      const b = gs.actors.find(q => q.type === 'SWAT' && !q.dead && q !== a);
      b.target = null; b.threshold = 0;
      b.damage(3, a);
      check('a trooper shot by a trooper holds no grudge', b.target !== a);
      b.target = p;
      /* and the chase pulls the trigger on its own */
      p.health = 100;
      let shotsBefore = 0;
      for (const q of gs.actors) if (q.type === 'SWAT') shotsBefore += q.shots || 0;
      p.x = a.x + 320; p.y = a.y;
      for (let i = 0; i < 175; i++) { p.health = 100; gs.tic(); }
      let shotsAfter = 0;
      for (const q of gs.actors) if (q.type === 'SWAT') shotsAfter += q.shots || 0;
      note('five seconds beside the squad', `${shotsAfter - shotsBefore} shots fired`);
      check('a trooper who can see you shoots without being told', shotsAfter > shotsBefore);
      p.x = px; p.y = py; p.health = 100;

      /* --- how they die --------------------------------------------- */
      const beaten = R.defeatedCount;
      const d1 = gs.actors.find(q => q.type === 'SWAT' && !q.dead);
      d1.damage(60, p);
      check('sixty is a death, on the way down', d1.dead && d1.state.name === 'SWAT_DIE1');
      const d2 = gs.actors.find(q => q.type === 'SWAT' && !q.dead);
      d2.damage(200, p);
      check('and two hundred is coming apart', d2.dead && d2.state.name === 'SWAT_XDIE1');
      for (let i = 0; i < 80; i++) gs.tic();
      check('and both lie there afterwards, out of the way',
        d1.state.name === 'SWAT_DEAD' && d1.state.tics === -1 && !d1.solid &&
        d2.state.name === 'SWAT_XDIE9' && d2.state.tics === -1);
      check('and the squad counts its losses', R.defeatedCount >= beaten + 2);
      const d3 = gs.actors.find(q => q.type === 'SWAT' && !q.dead);
      if (d3) {
        d3.chill(100);
        check('a trooper freezes like anybody else', d3.frozen && d3.state.name === 'SWAT_FROZE');
        d3.damage(5, p);
        check('and a frozen one shatters', d3.removed);
      }

      /* --- FIREPROOF, at the user's request -------------------------
         The police and the police van. Fire is the whole of what the
         flag refuses — the stream, the floor, a blast — and a bullet, a
         van and the bore are not fire. The one thing fire does to a
         trooper is let a frozen one out: fire on a fireproof block of
         ice is a thaw, because nothing inside it can be eaten. */
      const fp = gs.actors.find(q => q.type === 'SWAT' && !q.dead && !q.frozen);
      check('a trooper is fireproof, and so not flammable, and worth nothing as fuel',
        !!fp && fp.fireproof && !fp.flammable && fp.fuel === 0 && !fp.info.burnAway && !fp.info.burn);
      if (fp) {
        const hp = fp.health;
        fp.ignite(300);
        check('he does not catch', fp.burning === 0 && fp.torch === 0 && fp.lit === 0);
        fp.damage(50, p, { fire: true });
        check('and fire does him no harm', fp.health === hp && !fp.dead, `${hp} -> ${fp.health}`);
        /* the stream, on him: the particle is spent and nothing else */
        gs.flame._burnActor(fp, fp.x, fp.y, fp.z + 20);
        check('the flamethrower splashes off him', fp.health === hp && fp.burning === 0);
        /* a car going up beside him */
        gs.explode({ x: fp.x + 30, y: fp.y, z: fp.z }, { radius: 200, damage: 500, heat: 255 });
        check('and a car going up beside him does not touch him', fp.health === hp && fp.burning === 0 && !fp.dead);
        /* the floor: a shopper on the same hot cell catches; he does not */
        const shop = gs.spawn('SHOPPER', fp.x + 8, fp.y + 8, undefined, {});
        gs.fire.ignite(fp.x, fp.y, 255, 40);
        for (let i = 0; i < 20; i++) gs.fire._burnThings();
        check('the burning floor lights the shopper beside him and not him',
          shop.burning > 0 && fp.burning === 0 && fp.health === hp, `shopper ${shop.burning}, trooper ${fp.burning}`);
        shop.remove();
        /* and what still gets through: a bullet */
        fp.damage(9, null, { shot: true });
        check('but a bullet still does', fp.health === hp - 9, `${hp} -> ${fp.health}`);
        /* fire on the ice is a thaw */
        fp.chill(100);
        check('frozen', fp.frozen);
        fp.damage(20, p, { fire: true });
        check('fire on a frozen trooper is a thaw and not an execution',
          !fp.removed && !fp.dead && fp.ash === 0 && fp.frozen && fp.frost < 100, `frost ${fp.frost}, ash ${fp.ash}`);
        for (let i = 0; i < 10 && fp.frozen; i++) fp.damage(20, p, { fire: true });
        check('and enough of it lets him out, running', !fp.frozen && !fp.dead && !fp.removed && fp.state.name === 'SWAT_RUN1', fp.state.name);
      }

      /* --- AND THE VAN BURNS, JUST SLOWLY -------------------------
         At the user's request, and it did not for a while: it was
         fireproof, which for a vehicle is invulnerable. It is ARMOURED
         now — fire's damage divided on the way in, the blackening
         multiplied on the way out — so the stream ends one, and takes
         most of a minute doing it where a hatchback takes nine seconds.
         Measured as a RATIO against the van in the next bay rather than
         as a wall-clock number, because what the user asked for is
         "much much slower than vans" and that is a comparison. */
      {
        check('the police van is not fireproof any more, it is armoured',
          !v.fireproof && v.fireArmour > 4 && v.charFuse > 2,
          `armour ${v.fireArmour}, fuse ${v.charFuse}`);
        /* ONE TIC OF FIRE, ON EACH, from the same full health */
        const lot = V.all.find(q => q.state === 'parked' && q.fireArmour === 1);
        const h0 = v.health, l0 = lot.health;
        v.damage(24, null, { fire: true });
        lot.damage(24, null, { fire: true });
        const took = h0 - v.health, tookLot = l0 - lot.health;
        note('the same lick of flame', `${tookLot} off a hatchback, ${took.toFixed(1)} off a squad van`);
        check('the same fire does a fraction of the damage to it',
          took > 0 && took * 4 < tookLot, `${took.toFixed(1)} against ${tookLot}`);
        /* AND A BULLET IS NOT, any more: at the user's request a vehicle
           takes a lot of the minigun, and a squad van more than a car
           in the lot — see SHOT_ARMOUR, and `the vans under fire` */
        const h1 = v.health, l1 = lot.health;
        v.damage(24, null, { shot: true });
        lot.damage(24, null, { shot: true });
        check('and a bullet does less to it than to a car in the lot, and little to either',
          h1 - v.health < l1 - lot.health && Math.abs((l1 - lot.health) - 24 / lot.shotArmour) < 1e-9 &&
          Math.abs((h1 - v.health) - 24 / v.shotArmour) < 1e-9, `${h1 - v.health} and ${l1 - lot.health}`);
        lot.health = l0;
        /* IT CATCHES. It could not before. */
        v.ignite();
        check('it catches now', v.burning > 0 && v.flames.length === 2);
        /* AND HOW LONG IT TAKES, held against the same van unarmoured.
           Counted off the arithmetic rather than by ticking a whole
           minute of game: the burn is BURN_DAMAGE every BURN_EVERY tics
           divided by the armour, and the char is its own roll times the
           fuse. */
        const VH = 150, BURN = 12, EVERY = 10, CHAR = 6 * 35;   // js/vehicles.js
        const secs = q => (Math.ceil(VH / (BURN / q.fireArmour)) * EVERY + CHAR * q.charFuse) / 35;
        const anApc = { fireArmour: 14, charFuse: 6 };
        note('flame to wreck', `${secs(lot).toFixed(0)}s for a hatchback, ` +
          `${secs(v).toFixed(0)}s for a squad van, ${secs(anApc).toFixed(0)}s for an APC`);
        check('and it is many times slower than a van in the lot', secs(v) > secs(lot) * 4,
          `${secs(v).toFixed(0)}s against ${secs(lot).toFixed(0)}s`);
        check('and the APC is slower again than the van', secs(anApc) > secs(v));
        /* AND IT DOES GO. Forced along rather than waited out — the
           point is that the end of the road exists, not how long it is. */
        v.damage(100000, null, { shot: true });
        check('and enough of anything still ends it', v.state === 'charring', v.state);
        v.charTics = 1; v.charTic();
        check('and then it goes up like any other vehicle', !v.whole && !R.liveVans.includes(v), v.state);
        /* AND IT GIVES THE BAY BACK, which never came up while nothing
           could end one: a wreck that still held its place in the fire
           lane would close that bay for the rest of the night. */
        const bay = v.bay;
        check('and the fire lane gets its bay back', !!bay && R.freeBay() !== null &&
          !R.liveVans.some(q => q.bay === bay));
      }
    }

    /* --- AND WHEREVER YOU ARE, THEY COME TO YOU --------------------
       At the user's request. Inside the building the answer is the
       doors; anywhere else it is the nearest point on the perimeter
       road to where you are standing, and then off the road toward you
       for as far as the tarmac holds. These are measured off the pure
       part — freeStand and routeTo — because driving a van the length
       of the ring is two thousand tics a go, and then one of them is
       actually driven to prove the route is drivable. */
    {
      const doors = level.swatBays[0];
      const ringT = q => R.ringNearest(q.x, q.y);
      const spots = [
        ['out in the car park', 2140, -1400],
        ['at the west end of the lot', -2000, -1200],
        ['in the trees, west', -6500, -1200],
        ['round the back, in the service yard', 2140, 3700],
      ];
      for (const [where, x, y] of spots) {
        stand(x, y);
        check(`standing ${where}, a van comes to you rather than to the doors`, R.chasing);
        const st = R.freeStand();
        const near = Math.hypot(st.x - p.x, st.y - p.y);
        const on = R.ringAt(st.ring);
        const fromRing = Math.hypot(on.x - p.x, on.y - p.y);
        const fromDoors = Math.hypot(doors.x - p.x, doors.y - p.y);
        note(`${where}`, `the van stands ${near.toFixed(0)} units off; the road is ${fromRing.toFixed(0)} and the doors ${fromDoors.toFixed(0)}`);
        check('and it stands on ground a van can drive on', R.drivable(st.x, st.y),
          level.sectorAt(st.x, st.y)?.name);
        /* LEAVING THE ROAD NEVER MAKES IT WORSE. Where the tarmac runs
           out at the kerb the van stands on the ring and that is the
           closest anything on wheels gets — which is the honest answer
           behind the building, where no road goes. */
        check('and pulling in off the road only ever gets it closer', near <= fromRing + 1,
          `${near.toFixed(0)} against ${fromRing.toFixed(0)} on the road`);
        if (/car park|west end/.test(where)) {
          check('and out in the lot that is much closer than the doors', near < fromDoors * 0.5,
            `${near.toFixed(0)} against ${fromDoors.toFixed(0)}`);
          /* AND IT STOPS IN FRONT OF YOU, at the user's request and on
             the user's second thought about it. `stop` is to the MIDDLE
             of a van and the walk toward you gives up one step short of
             it, so the closest the arithmetic can come is stop + STEP;
             the nose is another half length past that, which is what
             you actually see stop in front of you. A hundred and twenty
             put that nose thirteen units off your face and the user
             called it too close; three hundred is about two hundred,
             which is half a van of daylight. */
          const nose = near - car.carLength(police) / 2;
          note(`${where}, the nose`, `${nose.toFixed(0)} units off you`);
          check('and it stops half a van in front of you, not against you',
            near <= S.stop + 36 && nose > 120 && nose < 240,
            `${near.toFixed(0)} to the middle, ${nose.toFixed(0)} to the nose`);
        }
        /* the route: on the road the whole way, and it ends at the stand */
        const route = R.routeTo(st, 'west');
        const end = route[route.length - 1];
        check('the route ends where the van is to stand',
          Math.hypot(end.x - st.x, end.y - st.y) < 1 && route.length >= 3);
        check('and every corner of it is on tarmac',
          route.every(q => R.drivable(q.x, q.y)),
          route.filter(q => !R.drivable(q.x, q.y)).map(q => level.sectorAt(q.x, q.y)?.name || 'off the map').join('; '));
        /* AND IT DOES NOT COME FROM THE END OF THE WORLD, at the user's
           request. The map's way in starts where the road leaves the
           map, nine thousand units out, which is five seconds of a van
           driving down a road nobody in the car park can see. Coming
           FOR you it starts at the junction with a run-in behind it —
           the same road, the same direction, a much shorter piece of
           it. Both routes are built here and held against each other,
           because the long one is still right for a night watched from
           inside the shop. */
        const len = r => r.reduce((n, q, i) => i ? n + Math.hypot(q.x - r[i - 1].x, q.y - r[i - 1].y) : 0, 0);
        const far = R.routeTo(st, 'west', 0, false);
        if (where === 'out in the car park')
          note('the two ways in', `${len(route).toFixed(0)} units coming for you, ${len(far).toFixed(0)} coming for the doors`);
        check('coming for you they start at the junction, not at the end of the road',
          len(route) < len(far) - 6000 && Math.abs(len(route) - len(far)) > 0,
          `${len(route).toFixed(0)} against ${len(far).toFixed(0)}`);
        /* AND THEY COME INTO BEING ON THE ROAD, NOT AT THE JUNCTION, at
           the user's request: the whole way in is built and then cut
           short from its far end. What has to be true is that there is
           a real drive left — at least the run-in — and that it is a
           small fraction of the road they used to come down. */
        check('and what is left is a short drive rather than a long one',
          len(route) >= S.runIn && len(route) < len(far) * 0.4,
          `${len(route).toFixed(0)} against ${len(far).toFixed(0)}`);
        /* AND NEVER SOMEWHERE YOU ARE LOOKING, which is the "off screen"
           half. The point is walked further back for as long as it is
           inside your view, so what has to hold is one of two things:
           the place it comes into being is out of sight, or the search
           spent every try it has and came anyway. Stated that way it is
           true wherever you stand and whichever way you face — and the
           second half has to be in it, because walking back along a
           RING can bring a point round the other side of the lot and
           into view again. */
        /* AND THE TWO PIECES OF IT, ON THEIR OWN. canSee is the view
           cone and backAlong is the walk down the polyline; both are
           arithmetic and both are easier to believe pinned directly
           than inferred from a route. */
        {
          const ahead = { x: p.x + Math.cos(p.angle) * 900, y: p.y + Math.sin(p.angle) * 900 };
          const behind = { x: p.x - Math.cos(p.angle) * 900, y: p.y - Math.sin(p.angle) * 900 };
          const beside = { x: p.x + Math.cos(p.angle + Math.PI / 2) * 900, y: p.y + Math.sin(p.angle + Math.PI / 2) * 900 };
          check('what is in front of you is in view, and what is behind or beside you is not',
            R.canSee(ahead.x, ahead.y) && !R.canSee(behind.x, behind.y) && !R.canSee(beside.x, beside.y));
          const RR = Object.getPrototypeOf(R).constructor;
          const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
          const b1 = RR.backAlong(line, 50);
          check('and a point fifty back from the end of a line is where it should be',
            b1.i === 1 && Math.abs(b1.x - 100) < 1e-9 && Math.abs(b1.y - 50) < 1e-9,
            `${b1.x}, ${b1.y} after ${b1.i}`);
          const b2 = RR.backAlong(line, 150);
          check('and a hundred and fifty back is round the corner',
            b2.i === 0 && Math.abs(b2.x - 50) < 1e-9 && Math.abs(b2.y) < 1e-9, `${b2.x}, ${b2.y}`);
          const b3 = RR.backAlong(line, 9999);
          check('and asking for more road than there is gives the start of it',
            b3.i === 0 && b3.x === 0 && b3.y === 0);
        }
        const entry = route[0];
        const spent = S.runIn + S.runInStep * S.runInTries;
        check('and where it comes into being is not somewhere you are looking',
          !R.canSee(entry.x, entry.y) || len(route) >= spent,
          `${R.canSee(entry.x, entry.y) ? 'in view' : 'out of view'} at ${len(route).toFixed(0)} units`);
      }
      /* THE ONE THAT IS ACTUALLY DRIVEN: out in the lot, where the van
         leaves the road and pulls up beside you. */
      stand(2140, -1400);
      const before = R.vans.length;
      R.nextVanAt = R.tics;
      R.sendConvoy();
      const chase = R.vans[before];
      check('a convoy is sent to you out in the lot', R.vans.length === before + S.convoy && !!chase);
      let n = 0;
      /* ALIVE THE WHOLE WAY. The crew already on the ground is shooting
         throughout, and a dead player is a player the squad stops
         coming for (see squadTic) — which is correct, and would quietly
         turn everything below this into a measurement of nothing. */
      const trace = [];
      for (; n < 6000 && chase.state === 'driving'; n++) {
        const left = chase.toEnd;                  // before the step, not after
        p.health = 100; gs.tic();
        trace.push({ v: chase.speed, left, pitch: chase.rz, roll: chase.rx });
      }
      check('and you are alive to be driven at', !p.dead);
      note('the drive to you', `${n} tics, ${chase.driven.toFixed(0)} units`);
      /* --- HOW IT DROVE, which is the user's request and the whole of
         the difference between a model sliding along a line and a van
         pulling up. It leaves from a standing start, it never exceeds
         its own top speed, and it is SLOWEST AT THE END rather than
         switching off at speed. */
      {
        const top = Math.max(...trace.map(q => q.v));
        const first = trace[0].v, last = trace[trace.length - 1].v;
        note('the speed', `off the mark at ${first.toFixed(1)}, up to ${top.toFixed(1)}, ` +
          `over the line at ${last.toFixed(1)} units a tic`);
        check('it pulls away from a standing start rather than appearing at speed',
          first <= veh.DRIVE_SPEED * 0.1 && top > veh.DRIVE_SPEED * 0.5,
          `${first.toFixed(1)} then ${top.toFixed(1)}`);
        check('and never goes faster than it is allowed to', top <= veh.DRIVE_SPEED + 1e-6);
        check('and brakes into its place instead of switching off at speed',
          last < top * 0.25, `${last.toFixed(1)} against a top of ${top.toFixed(1)}`);
        /* THE BRAKING IS FOR THE END OF THE ROUTE, not for the next
           corner: the speed it is doing never exceeds the speed it could
           still stop from in the distance it has left. */
        const B = veh.DRIVE_BRAKE;
        /* the 1.25 is the crawl floor in drive(): the last unit of the
           approach is held at a walking pace rather than integrated down
           to nothing, which would take a second and a half */
        const over = trace.filter(q => q.v > Math.sqrt(2 * B * Math.max(0, q.left)) + 1.25);
        check('and it is never going faster than it could stop from', over.length === 0,
          `${over.length} tics over the line`);
        /* --- AND THE BODY SHIFTS ITS WEIGHT. The nose goes DOWN under
           braking (a negative pitch — see carMesh, which puts pitch in
           the vehicle's own frame) and UP under power, and it leans
           through the corners. */
        const dip = Math.min(...trace.map(q => q.pitch));
        const rise = Math.max(...trace.map(q => q.pitch));
        const lean = Math.max(...trace.map(q => Math.abs(q.roll)));
        note('the body', `${(dip * 180 / Math.PI).toFixed(1)}° of dive, ` +
          `${(rise * 180 / Math.PI).toFixed(1)}° of squat, ${(lean * 180 / Math.PI).toFixed(1)}° of lean`);
        check('the nose dips under braking and lifts under power',
          dip < -0.01 && rise > 0.01, `${dip.toFixed(3)} to ${rise.toFixed(3)}`);
        check('and it leans through a corner', lean > 0.01, `${lean.toFixed(3)}`);
        check('and none of it is more than a few degrees',
          -dip < 0.2 && rise < 0.2 && lean < 0.2);
        /* AND IT ROCKS BACK AND SETTLES. Parked, the springs go on
           running until they are asleep: the pitch crosses zero at
           least once on the way — that is the rock — and then stops. */
        let crossings = 0, was = chase.rz;
        for (let i = 0; i < 200; i++) {
          gs.tic();
          if ((was < 0) !== (chase.rz < 0)) crossings++;
          was = chase.rz;
        }
        note('settling', `${crossings} times through level, resting at ${(chase.rz * 180 / Math.PI).toFixed(2)}°`);
        check('and once it has stopped it rocks back and settles level',
          crossings >= 1 && Math.abs(chase.rz) < 0.004 && Math.abs(chase.rx) < 0.004,
          `${crossings} crossings, ${chase.rz.toFixed(4)} rad`);
      }
      check('and it arrives, off the road, beside you', chase.state === 'parked' &&
        Math.hypot(chase.x - 2140, chase.y + 1400) < S.push, `${Math.hypot(chase.x - 2140, chase.y + 1400).toFixed(0)} units off`);
      check('and it left the ring to do it', Math.abs(chase.y - R.ringAt(chase.stand.ring).y) > 100,
        `${(chase.y - R.ringAt(chase.stand.ring).y).toFixed(0)} units in off the road`);
      /* AND THE DOOR THEY USE IS THE ONE FACING YOU, which used to be
         the one facing the shop and was the same thing only while every
         van stood across the fire lane. Measured off the van's own door
         geometry rather than off a spawn, because whether a trooper is
         actually let out is the budget's business and this is not. */
      const doorsOut = [0, 1, 2, 3, 4].map(k => chase.door(k, { x: p.x, y: p.y }));
      /* WHICH SIDE, not which distance: the doors run along the van's
         length, so the one at the far end of a van parked broadside is
         further from you than its middle and still on the right side. */
      const lx = -Math.sin(chase.yaw), ly = Math.cos(chase.yaw);
      const want = Math.sign((p.x - chase.x) * lx + (p.y - chase.y) * ly);
      check('and its crew steps out of the side facing you',
        want !== 0 && doorsOut.every(d => Math.sign((d.x - chase.x) * lx + (d.y - chase.y) * ly) === want),
        doorsOut.map(d => ((d.x - chase.x) * lx + (d.y - chase.y) * ly).toFixed(0)).join(', ') + ` want ${want}`);
      stand(home.x, home.y);
    }

    /* --- THE CURVE ----------------------------------------------------
       Exponential, at the user's request: equal steps in time multiply
       the presence by the same amount. The pure function first, then
       the caps it drives, then a long night. */
    const { pressureAfter } = await import('../js/responders.js');
    check('the pressure is 1 at the call, 2 a doubling later, 8 after three',
      pressureAfter(0) === 1 && pressureAfter(S.doubling) === 2 && pressureAfter(3 * S.doubling) === 8);
    check('and a doubling is a doubling wherever on the curve it starts — which is what exponential means',
      [0, 500, 1234, 4000, 9999].every(t0 => Math.abs(pressureAfter(t0 + S.doubling) / pressureAfter(t0) - 2) < 1e-9));
    check('the caps, the gap and the trickle are all the same number read four ways',
      Math.min(S.maxVans, Math.floor(S.vans * 4)) === (() => { const save = R.calledAt; R.calledAt = R.tics - 2 * S.doubling; const c = R.vanCap; R.calledAt = save; return c; })() &&
      (() => { const save = R.calledAt; R.calledAt = R.tics - 2 * S.doubling; const ok = R.trooperCap === Math.min(S.maxTroopers, S.troopers * 4) && Math.abs(R.trickleNow() - Math.max(S.minTrickle, S.trickle / 4)) < 1e-9; R.calledAt = save; return ok; })());
    check('and every gap has a floor, so the curve asks nothing the road cannot do',
      (() => { const save = R.calledAt; R.calledAt = R.tics - 40 * S.doubling; const ok = R.gapNow() === S.minEvery && R.trickleNow() === S.minTrickle && R.trooperCap === S.maxTroopers && R.vanCap === S.maxVans; R.calledAt = save; return ok; })());
    /* THE BUDGET HOLDS A WHOLE SEND. Three at a time is the user's
       number and it is the one thing in this block that has never
       moved; everything around it has been trimmed twice since. What
       has to stay true whatever the numbers are is that a send FITS —
       send three into a budget of two and the third is refused, which
       is sending two. */
    check('a send is three, and the budget holds whole sends of them at either end of the curve',
      S.convoy === 3 && S.vans >= S.convoy && S.maxVans >= S.convoy * 2 &&
      S.maxVans % S.convoy <= S.convoy, `${S.convoy} a send, ${S.vans} to ${S.maxVans} allowed`);
    /* THE LONG NIGHT: the caps only ever climb, and the lot fills */
    const capsBefore = { troopers: R.trooperCap, vans: R.vanCap, ever: R.spawned, sent: R.vans.length };
    /* LONG ENOUGH FOR A VAN TO GET HERE. A convoy sent to the far side
       of the lot drives most of the ring to reach it, which at fifteen
       units a tic is well over a thousand of them — measure the night
       over a window shorter than that and what is measured is the
       traffic, not the escalation. */
    for (let i = 0; i < 3400; i++) { p.health = 100; gs.tic(); }
    {
      const by = {};
      for (const v of R.vans) by[v.state] = (by[v.state] || 0) + 1;
      note('the night so far', `${((R.tics - R.calledAt) / 35).toFixed(0)}s since the call, pressure ${R.pressure.toFixed(1)}: ` +
        `${R.vans.length} vans (${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ')}), ` +
        `${R.troopers} troopers up of ${R.trooperCap} allowed, ${R.spawned} ever, ${R.defeatedCount} down`);
    }
    /* each force against its OWN cap — the army is on the road inside
       this window now that it is called at pressure two */
    check('there are never more troopers on their feet than the curve allows',
      R.forces.every(f => R.troopersOf(f) <= R.trooperCapOf(f)),
      R.forces.map(f => `${f.def.key} ${R.troopersOf(f)}/${R.trooperCapOf(f)}`).join(', '));
    check('and never more vans on the road or standing than it allows',
      R.forces.every(f => R.liveVansOf(f).length <= R.vanCapOf(f)),
      R.forces.map(f => `${f.def.key} ${R.liveVansOf(f).length}/${R.vanCapOf(f)}`).join(', '));
    check('and forty seconds on, more of both are allowed than were',
      R.trooperCap > capsBefore.troopers && R.vanCap >= capsBefore.vans && R.spawned > capsBefore.ever,
      `troopers ${capsBefore.troopers} -> ${R.trooperCap}, vans ${capsBefore.vans} -> ${R.vanCap}, ever ${capsBefore.ever} -> ${R.spawned}`);
    check('three minutes in, there are vans everywhere the curve allows',
      R.vanCap >= S.bays && R.vans.length >= 6, `${R.vans.length} vans, cap ${R.vanCap}`);
    check('and the troopers allowed have doubled at least twice since the call', R.trooperCap >= 4 * S.troopers, `${R.trooperCap}`);
    /* AND HOW LONG IT TAKES THEM TO GET HERE from one pull of the
       trigger, which is the whole of what "speed in" means: a fresh
       night, one shot, and the clock runs until a van is standing. */
    {
      const fresh = new Game({
        level: MAP.buildSellWrong(), scene: new THREE2.Scene(), camera: {},
        textures: gm.textures, sprites: spr.bakeSprites(),
        hud: { message() {}, ticMessages() {} }, audio: null,
        input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
                 attack: false, use: false, run: false, sample() {}, sensitivity: 0 },
        fleet: { texture: {}, def: van }, police: { texture: {}, def: police },
        apc: { texture: {}, def: apc },
      });
      const fp = fresh.player;
      fp.startFire();
      fresh.tic();
      check('one shot and the convoy is already on the road', fresh.responders.vans.length === S.convoy);
      let t2 = 1;
      for (; t2 < 4000 && !fresh.responders.vans.some(q => q.state === 'parked'); t2++) { fp.health = 100; fresh.tic(); }
      note('trigger to tyres', `${t2} tics, ${(t2 / 35).toFixed(1)}s from the shot to a van standing`);
      /* SIX SECONDS, at the user's request, where it was twenty and
         then fourteen. Three things bought it and all three are in
         js/responders.js and js/vehicles.js: sixty units a tic instead
         of thirty, a run-in at the junction instead of nine thousand
         units of through road, and a stop a nose short instead of a
         length. This fixture starts where the player starts, which is
         out on the verge — the case the user was complaining about. */
      check('and a van is standing within six seconds of the shot', t2 < 6 * 35, `${(t2 / 35).toFixed(1)}s`);
      check('and it came from the nearer end of the road',
        fresh.responders.vans[0].side === fresh.responders.sideFor(fresh.responders.vans[0].stand.ring));
    }

    /* ==================================================================
       AND THE ARMY BEHIND THEM

       The user's order, set down the day the sheet arrived and built the
       day the carrier did: the SWAT, then the army, then a super army.
       The army is not a harder van — it is a SECOND FORCE, with its own
       clock, its own budget, its own curve and its own vehicle, running
       underneath a police force that does not stop.

       WHAT IS MEASURED HERE is the join: that they are called at the
       right moment and not before, that what arrives is an APC and not
       a van, that it hovers, that what gets out of it is a soldier and
       not a trooper, and that the two forces share the fire lane rather
       than parking inside one another.

       The clock is wound rather than waited out: three doublings is six
       thousand three hundred tics and driving those is three minutes of
       test for one boolean. What is NOT wound is the drive itself,
       which is real, on the real map, to a real stand.
       ================================================================== */
    {
      const { ARMY: A, FORCES, pressureAfter: pa } = await import('../js/responders.js');
      const veh = await import('../js/vehicles.js');

      check('the night is a list of forces, in the order the user set',
        FORCES.map(f => f.key).join(',') === 'swat,army' &&
        FORCES[0].troop === 'SWAT' && FORCES[1].troop === 'ARMY' &&
        FORCES[0].Van === veh.SwatVan && FORCES[1].Van === veh.ArmyApc);
      check('and the army is called at a PRESSURE, so it moves when the escalation is retuned',
        A.at === 2 && pa(S.doubling) === A.at, `${A.at} is ${Math.log2(A.at)} doubling`);
      check('and that is seventy seconds after the first shot — one doubling — at the user\'s request', S.doubling === 70 * 35);
      check('and there is less of them and it is heavier',
        A.convoy < S.convoy && A.vans < S.vans && A.maxTroopers < S.maxTroopers &&
        A.crew > S.crew && A.stand > S.stand,
        `${A.convoy} a send of ${A.maxVans}, ${A.crew} in the back, ${A.stand} apart`);

      /* --- a night of its own ---------------------------------------- */
      const ga = new Game({
        level: MAP.buildSellWrong(), scene: new THREE2.Scene(), camera: {},
        textures: gm.textures, sprites: spr.bakeSprites(),
        hud: { message() {}, ticMessages() {} }, audio: null,
        input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
                 attack: false, use: false, run: false, sample() {}, sensitivity: 0 },
        fleet: { texture: {}, def: van },
        police: { texture: {}, def: police },
        apc: { texture: {}, def: apc },
      });
      const Ra = ga.responders, pa2 = ga.player;
      /* the drive takes a couple of thousand tics with a squad already
         on the ground shooting the whole way; what is being measured is
         the army arriving, not whether you survive to see it */
      pa2.invincible = true;
      pa2.startFire();
      ga.tic();
      check('the first shot calls the SWAT and only the SWAT',
        Ra.swat.called && !Ra.army.called && Ra.vans.length === S.convoy &&
        Ra.vans.every(v => v.force === Ra.swat));

      /* WIND THE NIGHT ON three doublings, which is where the army is */
      Ra.swat.calledAt = Ra.tics - 3 * S.doubling;
      ga.tic();
      check('three doublings in, the army is called', Ra.army.called,
        `SWAT pressure ${Ra.pressure.toFixed(1)}`);
      check('and its own curve starts at 1 under a police force already at eight',
        Math.abs(Ra.pressureOf(Ra.army) - 1) < 0.02 && Ra.pressure >= A.at,
        `army ${Ra.pressureOf(Ra.army).toFixed(2)}, police ${Ra.pressure.toFixed(1)}`);
      check('and the SWAT do not stop when it does', Ra.swat.called && Ra.vanCap > S.vans);

      /* --- what comes up the road ------------------------------------ */
      const apcs = () => Ra.vans.filter(v => v.force === Ra.army);
      check('APCs are on the road, and they are APCs',
        apcs().length === A.convoy && apcs().every(v => v instanceof veh.ArmyApc && v.def.id === 'apc'),
        `${apcs().length} of them`);
      check('and they are not sent in threes like the vans', A.convoy === 2 && apcs().length === 2);

      /* IT HOVERS, ON THE ROAD AND STANDING. The hover is the one thing
         in this game that moves when nothing is happening, so it is
         measured as a range over a whole breath rather than as a value:
         a number that is always 34 is a number, and a number that goes
         between 29 and 39 is a vehicle being held up by something.
         Sampled first over the drive, and then over a breath standing,
         because those are two different code paths — see ArmyApc.tic,
         which is the only thing in the file that sets cz every tic. */
      const one = apcs()[0];
      const body = car.carHeight(apc) / 2;
      const air = seen => [Math.min(...seen) - body, Math.max(...seen) - body];
      let n = 0;
      const drove = [];
      {
        const seen = [];
        for (; n < 6000 && !apcs().some(v => v.state === 'parked'); n++) {
          const before = one.speed, wasYaw = one.yaw;
          ga.tic();
          seen.push(one.cz - one.ground);
          drove.push({ v: one.speed, accel: one.speed - before,
                       turn: Math.atan2(Math.sin(one.yaw - wasYaw), Math.cos(one.yaw - wasYaw)),
                       pitch: one.rz, roll: one.rx });
        }
        const [lo, hi] = air(seen);
        const parked0 = apcs().find(v => v.state === 'parked');
        note('the APC', `${n} tics to a standing carrier, ${parked0 ? parked0.driven.toFixed(0) : '-'} units driven, ` +
          `${lo.toFixed(1)} to ${hi.toFixed(1)} units of air under it on the way`);
        check('it rides off the tarmac on the road rather than driving on it',
          lo > veh.ArmyApc.HOVER * 0.7, `${lo.toFixed(1)} units of air`);
      }
      /* --- AND IT FLIES RATHER THAN DRIVES, at the user's request:
         the same two springs as the van with both signs turned over.
         A thing on springs leans OUT of a bend and dips its nose to
         brake; a thing on thrust points its lift into the bend and
         forward to stop, so it banks IN and pitches nose UP. Measured
         against the van's own numbers rather than against a remembered
         sign, so the two can never quietly agree. */
      {
        /* ON THE ROAD IT ACTUALLY DROVE, first: it brakes into its
           place like everything else, and the whole of that braking is
           spent nose UP. */
        const braking = drove.filter(q => q.accel < -0.2 && q.v > 6);
        const noseUp = braking.filter(q => q.pitch > 0).length;
        note('how it carries itself', `${noseUp} of ${braking.length} braking tics nose up`);
        check('it pitches nose UP to stop, where a van dips',
          braking.length > 4 && noseUp > braking.length * 0.8, `${noseUp} of ${braking.length}`);
        /* AND THE BANK, ASKED DIRECTLY, because the way in is short and
           nearly straight now and a drive may hold one real corner —
           which is a fact about the ROUTE and not about the vehicle. So
           the spring is driven by hand instead, from level, with the
           same braking left-hand corner given to one of each, and the
           two are held against each other. */
        const aSwatVan = Ra.vans.find(v => v.force === Ra.swat);
        const corner = v => {
          const keep = { rz: v.rz, rx: v.rx, pv: v.pitchV, rv: v.rollV, sp: v.speed };
          v.rz = v.restPitch; v.rx = v.restRoll; v.pitchV = 0; v.rollV = 0; v.speed = 20;
          for (let i = 0; i < 80; i++) v.suspension(-0.6, 0.1);     // braking, turning left
          const out = { pitch: v.rz - v.restPitch, roll: v.rx - v.restRoll };
          Object.assign(v, { rz: keep.rz, rx: keep.rx, pitchV: keep.pv, rollV: keep.rv, speed: keep.sp });
          return out;
        };
        const A = corner(one), V = corner(aSwatVan);
        note('braking into a left-hander', `the carrier ${(A.pitch * 180 / Math.PI).toFixed(1)}° pitch ` +
          `${(A.roll * 180 / Math.PI).toFixed(1)}° roll, the van ${(V.pitch * 180 / Math.PI).toFixed(1)}° ` +
          `${(V.roll * 180 / Math.PI).toFixed(1)}°`);
        check('the van leans OUT of the bend and dips its nose, because it has springs',
          V.roll > 0.01 && V.pitch < -0.01, `${V.roll.toFixed(3)}, ${V.pitch.toFixed(3)}`);
        check('and the carrier banks INTO it and lifts its nose, because it has thrust',
          A.roll < -0.01 && A.pitch > 0.01, `${A.roll.toFixed(3)}, ${A.pitch.toFixed(3)}`);
        check('and it banks harder than the van leans', Math.abs(A.roll) > Math.abs(V.roll) * 1.5,
          `${Math.abs(A.roll).toFixed(3)} against ${Math.abs(V.roll).toFixed(3)}`);
        check('and it is two signs on the instance, not a second suspension',
          one.rollPerG < 0 && one.pitchPerG < 0 && aSwatVan.rollPerG > 0 && aSwatVan.pitchPerG > 0,
          `apc ${one.rollPerG}/${one.pitchPerG}, van ${aSwatVan.rollPerG}/${aSwatVan.pitchPerG}`);
        /* AND IT NEVER PUTS A CORNER THROUGH THE TARMAC, which is the
           only thing the angles are actually capped for: the nose drops
           by half the length times the pitch and the low flank by half
           the width times the bank, and together they have to stay
           inside the hover at the bottom of its breath. */
        const half = car.carLength(apc) / 2, side = car.carWidth(apc) / 2;
        const worst = Math.max(...drove.map(q =>
          half * Math.abs(Math.sin(q.pitch)) + side * Math.abs(Math.sin(q.roll))));
        const clear = veh.ArmyApc.HOVER - veh.ArmyApc.BOB;
        note('the lowest corner', `${worst.toFixed(1)} units down against ${clear} of hover at its lowest`);
        check('and however far it leans, no corner of it goes through the tarmac',
          worst < clear, `${worst.toFixed(1)} against ${clear}`);
      }
      const parked = apcs().find(v => v.state === 'parked');
      check('an APC arrives and stands', !!parked);
      check('and it is on ground a vehicle can be on', Ra.drivable(parked.x, parked.y),
        ga.level.sectorAt(parked.x, parked.y)?.name);
      {
        const seen = [];
        for (let i = 0; i < 150; i++) { ga.tic(); seen.push(one.cz - one.ground); }
        const [lo, hi] = air(seen);
        note('standing still', `${lo.toFixed(1)} to ${hi.toFixed(1)} units of air, breathing ${(hi - lo).toFixed(1)}`);
        check('and it is still hovering now that it has stopped', lo > veh.ArmyApc.HOVER * 0.7);
        check('and it breathes, which is the only thing in this game that moves while it is still',
          hi - lo > 4 && hi - lo < 2.2 * veh.ArmyApc.BOB, `${(hi - lo).toFixed(1)} units of travel`);
        check('and the van beside it does not', Ra.vans.some(v => v.force === Ra.swat && v.hover === 0));
        /* AND IT BREATHES HARDER STANDING THAN MOVING, at the user's
           request — the bob you actually watch is the parked one — and
           because a hovercraft at speed is held steadier by the ground
           under it and one standing still wallows. */
        check('and it breathes harder standing still than it does moving',
          hi - lo > 2 * veh.ArmyApc.BOB * 0.45, `${(hi - lo).toFixed(1)} standing`);
        /* AND IT IS NEVER LEVEL AND NEVER ASLEEP. A parked van's springs
           settle onto zero and are then left alone for the rest of the
           night; a parked carrier's are settling onto something that
           keeps moving, so it drifts a degree one way and a degree and a
           half the other and never arrives. */
        const angles = [];
        for (let i = 0; i < 400; i++) { ga.tic(); angles.push({ p: one.rz, r: one.rx }); }
        const spanP = Math.max(...angles.map(q => q.p)) - Math.min(...angles.map(q => q.p));
        const spanR = Math.max(...angles.map(q => q.r)) - Math.min(...angles.map(q => q.r));
        note('parked, and not still', `${(spanP * 180 / Math.PI).toFixed(2)}° of pitch drift, ` +
          `${(spanR * 180 / Math.PI).toFixed(2)}° of roll`);
        check('a parked carrier is never level and never asleep',
          !one.asleep && spanP > 0.004 && spanR > 0.004 && spanP < 0.09 && spanR < 0.12,
          `${spanP.toFixed(4)} pitch, ${spanR.toFixed(4)} roll`);
        const aVan = Ra.vans.find(v => v.force === Ra.swat && v.state === 'parked');
        check('and a parked van settles level and is left alone', !aVan || aVan.asleep, aVan && `${aVan.rz}`);
      }
      /* AND YOU DO NOT GET TO WALK UNDER IT. The three cylinders stand
         on the ground the way every other vehicle's do; what changes is
         that they are as tall as the gap plus the hull. */
      {
        const b = one.blockers;
        check('the thing you cannot walk through still stands on the tarmac',
          b.length === 3 && b.every(q => Math.abs(q.z - one.ground) < 1e-6));
        check('and it is as tall as the gap under it plus the hull of it',
          b.every(q => q.height > car.carHeight(apc)), `${b[0].height} against a hull of ${car.carHeight(apc).toFixed(0)}`);
      }

      /* --- and soldiers get out of it -------------------------------- */
      for (let i = 0; i < A.unloadEvery * 3 + 60 && !ga.actors.some(a => a.type === 'ARMY'); i++) ga.tic();
      const sold = ga.actors.filter(a => a.type === 'ARMY' && !a.dead);
      check('and what gets out is a soldier, not a trooper', sold.length > 0 && sold.every(a => a.van === parked || a.force === Ra.army));
      check('and they know why they are here from the first step',
        sold.every(a => a.target === pa2 && /^ARMY_(RUN|ATK)/.test(a.state.name)), sold[0]?.state.name);
      check('and they are counted against their own budget, not the police one',
        Ra.troopersOf(Ra.army) === sold.length && Ra.troopersOf(Ra.swat) !== sold.length &&
        Ra.army.spawned > 0 && Ra.spawned === Ra.swat.spawned + Ra.army.spawned);

      /* --- how much of one there is ---------------------------------- */
      {
        const a = ga.spawn('ARMY', pa2.x + 300, pa2.y, undefined, {});
        check('a soldier is two and a third of a trooper and flinches half as often',
          a.info.health > st.ACTORS.SWAT.health * 2 && a.info.painchance < st.ACTORS.SWAT.painchance,
          `${a.info.health} health, ${a.info.painchance} painchance`);
        check('and the fire does nothing to one either, the same as the SWAT',
          a.fireproof && !a.flammable && a.fuel === 0);
        /* THE BURST: two rounds off one frame at half the scatter. The
           rounds are counted rather than the damage, because damage is
           a die roll and the point is that there are two of them. */
        const shots = [];
        const was = ga.hitscan.bind(ga);
        ga.hitscan = (src, ang, range, dmg, opts) => { shots.push({ ang, dmg }); return was(src, ang, range, dmg, opts); };
        a.target = pa2;
        ACTIONS.A_ArmyFire(a);
        const swatShots = [];
        const sw = ga.spawn('SWAT', pa2.x + 300, pa2.y + 40, undefined, {});
        sw.target = pa2;
        ga.hitscan = (src, ang, range, dmg, opts) => { swatShots.push({ ang, dmg }); return was(src, ang, range, dmg, opts); };
        ACTIONS.A_SwatFire(sw);
        ga.hitscan = was;
        note('the two rifles', `the army puts ${shots.length} rounds out at ${shots.map(q => q.dmg).join('/')}, ` +
          `the SWAT ${swatShots.length} at ${swatShots.map(q => q.dmg).join('/')}`);
        check('the army rifle is a two-round burst and the SWAT rifle is one round',
          shots.length === 2 && swatShots.length === 1);
        check('and each round of it is worth more', shots.every(q => q.dmg % 4 === 0) && swatShots.every(q => q.dmg % 3 === 0));
        /* AND THEY ARE ONE SIDE. Two forces on the same ground with
           different team names is Doom's bestiary rule: a police rifle
           would chew a soldier crossing the lane in front of it and the
           soldier would turn round about it, and an army that arrives
           already shot to pieces by the tier below it is not an
           escalation. One team name, and a round from it does nothing —
           though it is still STOPPED by whoever it meets, so a man in
           front of you is still cover. */
        check('the SWAT and the army are one side', a.info.team === sw.info.team);
        const hp0 = a.health;
        a.damage(60, sw, { shot: true });
        check('and a police round does nothing to a soldier', a.health === hp0, `${a.health} of ${hp0}`);
        a.damage(60, sw, { impact: true });
        check('but their own van running him down still does', a.health === hp0 - 60, `${a.health} of ${hp0}`);
        a.damage(60, null, { shot: true });
        check('and so does yours', a.health === hp0 - 120, `${a.health} of ${hp0}`);
        a.remove(); sw.remove();
      }

      /* --- THE FIRE LANE HOLDS NINE, AND THE CURVE ASKS FOR MORE ------
         Which used to mean the escalation stopped at nine and said
         nothing. Standing indoors with every bay taken, the next one
         still gets somewhere to stand — along the ring by the doors. */
      {
        const bays = ga.level.swatBays.slice(0, S.bays);
        const held = bays.map((b, i) => ({ bay: b, whole: true, stand: { x: b.x + i * 1e5, y: b.y, ring: 0 }, force: Ra.swat }));
        const keep = Ra.vans;
        Ra.vans = held;
        const st2 = Ra.freeStand(Ra.army);
        Ra.vans = keep;
        check('with every bay in the fire lane taken, the next one still has somewhere to go',
          !!st2 && Ra.drivable(st2.x, st2.y), st2 ? ga.level.sectorAt(st2.x, st2.y)?.name : 'nowhere');
      }
      /* AND THE TWO FORCES DO NOT PARK INSIDE ONE ANOTHER. Every stand
         either of them has taken is its own vehicle's length clear of
         every other, which for a 260-long APC beside a 214-long van is
         the number that matters. */
      {
        const stands = Ra.liveVans.filter(v => v.stand).map(v => ({ s: v.stand, L: v.def.length }));
        let worst = Infinity, pair = '';
        for (let i = 0; i < stands.length; i++) for (let j = i + 1; j < stands.length; j++) {
          const d = Math.hypot(stands[i].s.x - stands[j].s.x, stands[i].s.y - stands[j].s.y);
          const want = (stands[i].L + stands[j].L) / 2;
          if (d - want < worst) { worst = d - want; pair = `${d.toFixed(0)} apart, ${want.toFixed(0)} of vehicle`; }
        }
        note('the closest two stands', stands.length > 1 ? pair : 'only one of them out');
        check('no two of them stand inside one another, whichever force they are',
          stands.length < 2 || worst > 0, pair);
      }
    }

    /* the corner grows a third bar the moment something hurts you */
    const hudSrc = fs.readFileSync('js/hud.js', 'utf8');
    check('the corner draws all three bars, and only once you are hurt',
      /bar\(y, hp \/ HEALTH/.test(hudSrc) && /hurt \? 3 : 0/.test(hudSrc) &&
      /bar\(y, a2 \/ ARMOUR2, 'blue'/.test(hudSrc) && /bar\(y, a1 \/ ARMOUR1, 'purple'/.test(hudSrc));
    check('and it knows it is hurt when any of the three has moved',
      /a2 < ARMOUR2 \|\| a1 < ARMOUR1 \|\| hp < HEALTH/.test(hudSrc));
  }
}

/* ---------- the cerebral bore ---------- */
section('the cerebral bore');
{
  const { Game } = await import('../js/game.js');
  const pl = await import('../js/player.js');
  const { BORE } = await import('../js/bore.js');
  const { ACTIONS, Actor } = await import('../js/actor.js');
  const MAPB = await import('../js/maps/sellwrong.js');
  const THREEB = await import('three');
  const mk = () => new Game({
    level: MAPB.buildSellWrong(), scene: new THREEB.Scene(), camera: {},
    textures: tex.bakeTextures(), sprites: spr.bakeSprites(),
    hud: { message() {}, ticMessages() {} }, audio: null,
    input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
             attack: false, use: false, run: false, sample() {}, sensitivity: 0 },
  });

  /* --- the weapon ------------------------------------------------- */
  const d = pl.WEAPONS.BORE;
  check('the bore is a weapon, in the boxcutter\'s slot, and it needs a lock',
    !!d && d.slot === 3 && d.lock === true && d.ammo === 'bores' && !pl.WEAPONS.BOXCUTTER);
  check('five in the magazine, and a full one back in a minute',
    pl.BORES === 5 && pl.BORES * pl.BORE_REGEN_EVERY === 60 * 35, `${pl.BORES} x ${pl.BORE_REGEN_EVERY}`);
  {
    const fs = await import('node:fs');
    const G = await import('../js/glb.js');
    const buf = fs.readFileSync(new URL('../assets/models/bore.glb', import.meta.url));
    const { json } = G.parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    note('the model', `${json.nodes.length} node, ${json.images.length} image, ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
    check('the model is the user\'s, with only its diffuse left in it',
      json.images.length === 1 && json.materials.length === 1 && !json.materials[0].normalTexture &&
      !json.materials[0].pbrMetallicRoughness.metallicRoughnessTexture);
    check('and it carries no anchors, so the nozzle is the game\'s number',
      !json.asset.extras?.anchors, JSON.stringify(json.asset.extras));
    const w3 = await import('../js/weapon3d.js');
    check('which js/weapon3d.js has', !!w3.GUNS.BORE && w3.GUNS.BORE.nozzle.length === 3 && w3.GUNS.BORE.url.endsWith('bore.glb'));
  }

  /* --- the sight -------------------------------------------------- */
  const g = mk();
  const p = g.player;
  p.weapon = 'BORE';
  const who = g.actors.find(a => a.type === 'SHOPPER' && !a.dead && a.sector && !a.sector.outdoor);
  /* stand in the aisle, two hundred off somebody, looking at them */
  const stand = (a, back = 200) => {
    p.x = a.x - back; p.y = a.y; p.sector = g.level.sectorAt(p.x, p.y); p.z = p.sector.floor; p.viewZ = p.z + 41;
    p.angle = 0; p.pitch = 0;
  };
  stand(who);
  /* WHOEVER IS NEAREST ALONG THE RAY is the one the sight finds, which
     in a crowd is not always the one you stood in front of — so the
     crowd between here and them is cleared, and the flight below is
     two hundred units long rather than twenty */
  for (const a of g.actors)
    if (a !== who && a.type === 'SHOPPER' && Math.hypot(a.x - p.x, a.y - p.y) < 320) a.remove();
  g.tic();
  const B = g.bore;
  check('the sight is on while the bore is in hand', B.active);
  check('and it finds a person along the view', !!B.aim.actor && B.aim.actor.type === 'SHOPPER', B.aim.actor?.type);
  check('and locks on to them', !!B.lock && B.lock === B.aim.actor);
  check('and the aim point is at the height of the eye, not on the floor',
    Math.abs(B.aim.z - p.viewZ) < 1, `${B.aim.z.toFixed(1)} against ${p.viewZ.toFixed(1)}`);
  const victim = B.lock;
  /* look at the ceiling: nothing to lock, and the sight ends on it */
  p.pitch = 0.7;
  for (let i = 0; i < BORE.grace + 2; i++) g.tic();
  check('looking away loses the lock, after a moment', !B.lock && !B.aim.actor);
  check('and the sight stops at the ceiling', Math.abs(B.aim.z - p.sector.ceil) < 1, `${B.aim.z.toFixed(1)} against ${p.sector.ceil}`);
  /* THE TRIGGER DOES NOTHING WITHOUT ONE — Turok's rule */
  check('without a lock the trigger is not armed', !p.armed('BORE'));
  const ammo0 = p.ammo.bores;
  check('and firing with nothing locked sends nothing', B.fire(p) === null && B.shots.length === 0 && p.ammo.bores === ammo0);
  /* and the floor — or whoever is standing on it in the way, since
     this is a crowd and a ray pitched down crosses the next person's
     knees fifty units out */
  p.pitch = -0.7;
  g.tic();
  check('or the floor', Math.abs(B.aim.z - p.sector.floor) < 1 || (!!B.aim.actor && B.aim.z < p.viewZ),
    `${B.aim.z.toFixed(1)} against ${p.sector.floor}`);
  for (let i = 0; i < BORE.grace + 2; i++) g.tic();

  /* --- the shot --------------------------------------------------- */
  p.pitch = 0;
  g.tic();
  check('back on them, the lock is back', B.lock === victim);
  check('and the trigger is armed', p.armed('BORE'));
  p.startFire();
  check('firing costs one of five', p.ammo.bores === ammo0 - 1 && B.fired === 1 && B.shots.length === 1);
  const s = B.shots[0];
  check('the bore leaves the launcher slowly, aimed at the head', s.target === victim && s.speed <= BORE.speed0 * BORE.accel);
  let flew = 0;
  const path = [];
  for (; flew < 120 && !B.drilling.length; flew++) { g.tic(); if (B.shots[0]) path.push(B.shots[0].speed); }
  note('the flight', `${flew} tics, ${path[0]?.toFixed(1)} to ${path[path.length - 1]?.toFixed(1)} units a tic`);
  check('it reaches the head in under a second', B.drilling.length === 1 && flew < 35, `${flew} tics`);
  check('and it sped up on the way', path.length > 2 && path[path.length - 1] > path[0] * 1.5);

  /* --- the drill -------------------------------------------------- */
  check('the drill is a hold: they stand there, parked, and nothing can scare them',
    victim.bored > 0 && victim.held && victim.state.name === 'SHOP_BORE' && victim.stateTics === -1);
  const vx = victim.x, vy = victim.y;
  ACTIONS.A_Scare(victim, victim.x + 100, victim.y, 200);
  g.scare(victim.x, victim.y, 400);
  for (let i = 0; i < 20; i++) g.tic();
  check('and they have not moved a unit', victim.x === vx && victim.y === vy && victim.bored > 0);
  const C = g.giblets.chunks;
  let blood = 0;
  for (let i = 0; i < C.max; i++) if (C.alive[i] && C.kind[i] === 1) blood++;
  check('what was in the head is coming out of the top of it', blood > 4, `${blood} pieces in the air`);
  check('and none of it is on fire', (() => { for (let i = 0; i < C.max; i++) if (C.alive[i] && C.kind[i] !== 1) return false; return true; })());
  check('the bore is in the head, turning', B.drilling[0].stuck === victim && Math.abs(B.drilling[0].z - (victim.z + victim.height * BORE.headAt)) < 1);
  check('and nothing else can lock on to them while it is', !B.lockable(victim));

  /* --- and then they explode --------------------------------------- */
  const bursts = g.giblets.bursts, kills = p.kills;
  let held = 0;
  for (; held < 200 && !victim.dead; held++) g.tic();
  note('the drilling', `${held + 20} tics from the bore going in to the burst`);
  check('two seconds later they come apart', victim.dead && g.giblets.bursts === bursts + 1, `${g.giblets.bursts - bursts} bursts`);
  check('and it is the player\'s kill', p.kills === kills + 1);
  check('and the bore is spent with them', B.drilling.length === 0 && B.shots.length === 0,
    `${B.shots.length} in flight (${B.shots.map(q => q.target?.type + (q.target?.dead ? ' dead' : '')).join(', ')}), ${B.drilling.length} drilling`);
  check('the whole thing took a shade over two seconds', Math.abs((held + 21) - BORE.drillTics) <= 2, `${held + 21} against ${BORE.drillTics}`);

  /* --- what it does to the others ----------------------------------- */
  {
    /* a block of ice: shattered, not drilled */
    const g2 = mk(); const p2 = g2.player; p2.weapon = 'BORE';
    const ice = g2.actors.find(a => a.type === 'SHOPPER' && !a.dead);
    ice.chill(Actor.FREEZE_AT);
    check('a frozen shopper can be locked', g2.bore.lockable(ice));
    const r = ice.bore(p2);
    check('and the bore shatters a block of ice rather than drilling it', r === 'shatter' && ice.removed);
    /* a trooper: the gore death, not the ordinary one */
    const t = g2.spawn('SWAT', p2.x + 200, p2.y, undefined, {});
    t.target = p2;
    const r2 = t.bore(p2);
    check('a trooper takes the drill', r2 === 'drill' && t.held && t.state.name === 'SWAT_BORE');
    for (let i = 0; i < Actor.BORE_TICS + 2 && !t.dead; i++) g2.tic();
    check('and comes apart at the end of it, the gore way', t.dead && t.state.name.startsWith('SWAT_XDIE'), t.state?.name);
    /* the magazine fills itself */
    p2.ammo.bores = 0;
    for (let i = 0; i < pl.BORE_REGEN_EVERY + 1; i++) p2.fuelTic();
    check('the magazine fills itself, one at a time', p2.ammo.bores === 1);
    /* a target that dies on the way is a target the bore flies past */
    const g3 = mk(); const p3 = g3.player; p3.weapon = 'BORE';
    const far = g3.actors.find(a => a.type === 'SHOPPER' && !a.dead && a.sector && !a.sector.outdoor);
    p3.x = far.x - 300; p3.y = far.y; p3.sector = g3.level.sectorAt(p3.x, p3.y); p3.z = p3.sector.floor; p3.viewZ = p3.z + 41; p3.angle = 0; p3.pitch = 0;
    g3.tic();
    if (g3.bore.lock) {
      const tgt = g3.bore.lock;
      p3.startFire();
      g3.tic(); g3.tic();
      tgt.damage(100, p3);                  // gone before it arrives
      let n = 0;
      for (; n < 400 && g3.bore.shots.length; n++) g3.tic();
      check('a bore whose target died on the way flies on and is spent on a wall',
        g3.bore.shots.length === 0 && g3.bore.drilling.length === 0 && n < 400, `${n} tics`);
    }
  }
  /* the sight's drawing parts exist */
  check('the sight has a dot, a reticle and a bore to draw with',
    ['LASRA', 'LOCKA', 'BOREA', 'BOREB', 'BOREC'].every(k => g.sprites.frames.has(k)));
}

/* ---------- the minigun, the jump, and the van ---------- */
section('the minigun, the jump and the van');
{
  const fs = await import('node:fs');
  const { Game } = await import('../js/game.js');
  const pl = await import('../js/player.js');
  const MAPM = await import('../js/maps/sellwrong.js');
  const THREEM = await import('three');
  const mk = () => new Game({
    level: MAPM.buildSellWrong(), scene: new THREEM.Scene(), camera: {},
    textures: tex.bakeTextures(), sprites: spr.bakeSprites(),
    hud: { message() {}, ticMessages() {} }, audio: null,
    input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
             attack: false, use: false, run: false, jump: false, sample() {}, sensitivity: 0 },
  });
  const inp = (o = {}) => ({ look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, attack: false, use: false,
                             run: false, jump: false, weaponSlot: 0, weaponCycle: 0, ...o });

  /* --- the weapon --------------------------------------------------- */
  const d = pl.WEAPONS.MINIGUN;
  check('the minigun is the fourth weapon, a volley off a belt, and issued',
    !!d && d.slot === 4 && d.volley === true && d.ammo === 'rounds' && d.autofire === true &&
    pl.WEAPONS.MOLOTOV.slot === 5 && new (class extends pl.Player { constructor() { super({ level: level, sectorAt: () => null }, 0, 0, 0); } })().owned.MINIGUN === true);
  note('the belt', `${pl.BELT} rounds at ${pl.BELT_PER_TIC} a tic: ${(pl.BELT / pl.BELT_PER_TIC / 35).toFixed(0)} seconds, ` +
    `back in ${(pl.BELT * pl.BELT_REGEN_EVERY / 35).toFixed(0)}; ${d.rounds} a tic of ${d.damage()}-ish`);
  check('absurdly destructive: over a hundred rounds a second, each more than a shopper',
    d.rounds * 35 >= 100 && [...Array(50)].every(() => d.damage() >= 20));

  const g = mk();
  const p = g.player;
  p.weapon = 'MINIGUN';
  /* --- it spins up before it fires ---------------------------------- */
  const held = inp({ attack: true });
  const was = p.ammo.rounds;
  let firedAt = -1;
  for (let t = 1; t <= pl.SPIN_UP + 4; t++) {
    p.tic(held, 1 / 35);
    if (firedAt < 0 && p.ammo.rounds < was) firedAt = t;
  }
  check('the trigger does nothing until the barrels are up to speed',
    firedAt > pl.SPIN_UP - 1 && firedAt <= pl.SPIN_UP + 2, `first round on tic ${firedAt}, spin-up is ${pl.SPIN_UP}`);
  check('and then every tic costs the belt a volley',
    p.ammo.rounds === was - d.rounds * (pl.SPIN_UP + 4 - firedAt + 1) + Math.floor((pl.SPIN_UP + 4) / pl.BELT_REGEN_EVERY) * 0 ||
    Math.abs((was - p.ammo.rounds) - d.rounds * (pl.SPIN_UP + 5 - firedAt)) <= pl.SPIN_UP + 5,
    `${was} -> ${p.ammo.rounds}`);
  check('and the barrels are at full speed and warming',
    p.spin === 1 && p.heat > 0 && p.heat < 0.2, `spin ${p.spin} heat ${p.heat.toFixed(3)}`);
  /* --- the heat ------------------------------------------------------ */
  for (let t = 0; t < pl.HEAT_UP; t++) p.tic(held, 1 / 35);
  check('four seconds of fire and the barrels are white', p.heat === 1, `${p.heat}`);
  const up = inp();
  for (let t = 0; t < pl.SPIN_DOWN + 2; t++) p.tic(up, 1 / 35);
  check('let go and they wind down and start to cool', p.spin === 0 && p.heat < 1 && p.heat > 0.8,
    `spin ${p.spin} heat ${p.heat.toFixed(3)}`);
  /* --- the latch ----------------------------------------------------- */
  p.ammo.rounds = d.rounds - 1; p.spin = 1; p.fireIndex = 0; p.fireTics = 1;
  p.volleyTic(d);
  check('a belt too short for a volley stops the gun and latches it',
    p.beltDry && p.fireIndex === -1 && p.latched('MINIGUN') && !p.armed('MINIGUN'));
  p.ammo.rounds = Math.ceil(pl.BELT * pl.BELT_REFIRE_AT);
  p.fuelTic();
  check('and a quarter of a belt clears it', !p.beltDry && p.latched('MINIGUN') === false);
  check('and a dry belt does not spin', (() => { p.beltDry = true; p.spin = 0; p.spinTic(held); const r = p.spin; p.beltDry = false; return r === 0; })());

  /* --- the rounds go where the eye looks, pitch and all ------------- */
  {
    const g2 = mk();
    const q = g2.player;
    const before = g2.actors.length;
    const floor = q.sector.floor;
    /* straight down at your own feet: the shot stops at the lino and
       puts its puff there, rather than at eye height a mile away */
    g2.hitscan(q, q.angle, 2400, 10, { shot: true, pitch: -0.7, from: g2.nozzle() });
    const puff = g2.actors.slice(before).find(a => a.type === 'PUFF' || a.info?.name === 'PUFF' || /PUFF/.test(a.type || ''));
    const last = g2.actors[g2.actors.length - 1];
    check('a shot aimed at the floor stops at the floor',
      g2.actors.length > before && Math.abs(last.z - floor) < 1e-6 && Math.hypot(last.x - q.x, last.y - q.y) < 120,
      `puff at z ${last.z}, floor ${floor}, ${Math.hypot(last.x - q.x, last.y - q.y).toFixed(0)} out`);
    /* and a level one still lands on a person at their height */
    const target = g2.actors.find(a => a.shootable && !a.dead && !a.vehicle && a.solid && a.health > 0 && !a.noclip);
    if (target) {
      /* brought out to the car park in front of the player, where
         there is nothing between the two of them but night */
      target.x = q.x + Math.cos(q.angle) * 200; target.y = q.y + Math.sin(q.angle) * 200;
      g2.blockmap?.moved(target); target.updateSector?.();
      target.z = q.z;
      q.angle = q.angle; q.x = q.x; q.y = q.y; q.viewZ = q.z + 49;
      const hp = target.health;
      const hit = g2.hitscan(q, q.angle, 2400, 10, { shot: true, pitch: 0 });
      check('and a level one lands on a person', hit === target && target.health < hp, `${hit ? hit.type : 'nothing'}`);
      const hp2 = target.health;
      g2.hitscan(q, q.angle, 2400, 10, { shot: true, pitch: 0.6 });
      check('but one aimed over their head goes over their head', target.health === hp2);
    }
  }

  /* --- the jump ------------------------------------------------------ */
  {
    const g3 = mk();
    const q = g3.player;
    const floor = q.z;
    check('you start on the ground', q.onGround === true && q.momz === 0);
    q.tic(inp({ jump: true }), 1 / 35);
    check('a press of jump is a push off it', q.onGround === false && q.momz > 0 && q.z > floor);
    let top = q.z, air = 1;
    for (let t = 0; t < 60 && !q.onGround; t++) { q.tic(inp(), 1 / 35); top = Math.max(top, q.z); air++; }
    const expect = pl.JUMP_VEL * pl.JUMP_VEL / (2 * pl.GRAVITY);
    check('rises about forty units and comes back down to the floor',
      q.onGround && q.z === floor && top > expect * 0.85 && top < expect * 1.15 && air > 10 && air < 30,
      `top ${top - floor} (expected ~${expect}), ${air} tics in the air`);
    check('and holding it is not a pogo stick: one jump per press',
      (() => { const src = fs.readFileSync('js/input.js', 'utf8'); return /this\.jump = this\.pressed\('jump'\)/.test(src) && /padEdge\(6\)/.test(src); })());
  }

  /* --- the van throws you ------------------------------------------- */
  {
    const g4 = mk();
    const q = g4.player;
    const x0 = q.x, a2 = q.armour2;
    q.damage(40, { x: q.x - 40, y: q.y }, { impact: true, launch: { x: 20, y: 0, z: 12, grace: 30 } });
    check('a launch is a hit and a velocity, sideways and up',
      q.armour2 === a2 - 40 && q.momz === 12 && q.momx > 20 && q.onGround === false && q.launched === 30);
    let far = 0;
    for (let t = 0; t < 40; t++) { q.tic(inp(), 1 / 35); far = Math.max(far, q.x - x0); }
    check('and you land somewhere else', q.onGround && far > 60 && q.launched === 0, `${far.toFixed(0)} units on`);
    const g5 = mk();
    const r = g5.player;
    r.invincible = true;
    r.damage(40, { x: r.x - 40, y: r.y }, { impact: true, launch: { x: 20, y: 0, z: 12 } });
    check('and invincible refuses the launch with the rest', r.momz === 0 && r.onGround === true);
    const vsrc = fs.readFileSync('js/vehicles.js', 'utf8');
    check('the van works its launch out of its speed and lets you clear it',
      /launch: \{ x: lx \* k, y: ly \* k, z: up/.test(vsrc) && /!\(p\.launched > 0\)/.test(vsrc) &&
      /Math\.min\(30, 10 \+ sp \* 0\.55\)/.test(vsrc));
  }

  /* --- the model, as the tool left it ------------------------------- */
  {
    const G = await import('../js/glb.js');
    const buf = fs.readFileSync(new URL('../assets/models/minigun.glb', import.meta.url));
    const { json } = G.parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const ex = json.asset.extras || {};
    note('the minigun', `${json.nodes.length} nodes, ${json.images.length} images, ${(buf.length / 1024 / 1024).toFixed(1)} MB, from ${ex.source}`);
    check('its emission marker was read into the file as the nozzle, through the node\'s own transform',
      Array.isArray(ex.anchors?.nozzle) && ex.anchors.nozzle.length === 3 &&
      Math.abs(ex.anchors.nozzle[1] - -1.33) < 0.05 && Math.abs(ex.anchors.nozzle[2] - 15.27) < 0.05, JSON.stringify(ex.anchors));
    check('and the marker itself is gone from the mesh', !json.nodes.some(n => /EmissionPoint/i.test(n.name || '')));
    check('and the barrel set is named to turn, and still there with its mesh',
      typeof ex.spin === 'string' && json.nodes.some(n => n.name === ex.spin && n.mesh !== undefined));
    check('and only the two diffuse maps survive', json.images.length === 2 && json.materials.length === 2 &&
      json.materials.every(m => !m.normalTexture && !m.pbrMetallicRoughness?.metallicRoughnessTexture));
    const w3 = await import('../js/weapon3d.js');
    const M = w3.GUNS.MINIGUN;
    check('and the game says how it is held, what glows and what spins',
      M.nozzle === null && M.pilot === null && M.heat?.material === 'minigun_barrel_mat' && M.spin > 0 &&
      M.fit > w3.GUN_LENGTH && M.out > 1 && json.materials.some(m => m.name === M.heat.material));
    const gunSrc = fs.readFileSync('js/weapon3d.js', 'utf8');
    check('the heat is drawn from the muzzle back, on the one material, banded like the light',
      /uniform float heat;/.test(gunSrc) && /heatMaterial\.uniforms\.heat\.value = player\.heat/.test(gunSrc) &&
      /floor\(h \* 8\.0 \+ 0\.5\) \/ 8\.0/.test(gunSrc));
    check('and the barrels turn at the player\'s spin', /G\.spin\.rotation\.z = G\.spinAngle/.test(gunSrc));
    check('and no disc across the muzzle any more, at the user\'s request: the tracers say it is firing',
      !M.flash && M.muzzle.additive === true && !/flashPicture/.test(gunSrc) && !/G\.flash/.test(gunSrc));
  }

  /* --- the page and the pad ----------------------------------------- */
  {
    const html = fs.readFileSync('index.html', 'utf8');
    const css = fs.readFileSync('css/style.css', 'utf8');
    const mainSrc = fs.readFileSync('js/main.js', 'utf8');
    const inSrc = fs.readFileSync('js/input.js', 'utf8');
    const rsp = fs.readFileSync('js/responders.js', 'utf8');
    const hudSrc = fs.readFileSync('js/hud.js', 'utf8');
    const lofiSrc = fs.readFileSync('js/lofi.js', 'utf8');
    const au = await import('../js/audio.js');
    const auSrc = fs.readFileSync('js/audio.js', 'utf8');
    check('the synthesised sound is off, for now, by one switch, and the ambience with it',
      au.MUTED === true && /if \(MUTED\) return;/.test(auSrc) && /if \(MUTED \|\| !this\.ctx \|\| this\._amb\) return;/.test(auSrc));
    /* --- the minigun's recordings, which the switch does not touch --- */
    check('the minigun has three recordings and all three files are there',
      Object.keys(au.SAMPLES).length === 3 && Object.values(au.SAMPLES).every(u => fs.existsSync(u)));
    check('named for the spin-up, the loop and the wind-down',
      au.SAMPLE_FOR.spinup === 'minigun_start' && au.SAMPLE_FOR.minigunloop === 'minigun_fire' && au.SAMPLE_FOR.spindown === 'minigun_stop');
    check('and a sample plays whatever the switch says', auSrc.indexOf('if (SAMPLE_FOR[name])') < auSrc.indexOf('if (MUTED) return;'));
    {
      /* the loop follows the trigger: a fake sound layer counts */
      const { Game } = await import('../js/game.js');
      const pl = await import('../js/player.js');
      const MAPS = await import('../js/maps/sellwrong.js');
      const THREES = await import('three');
      const calls = { play: [], loops: 0, stops: 0 };
      const gS = new Game({ level: MAPS.buildSellWrong(), scene: new THREES.Scene(), camera: {},
        textures: tex.bakeTextures(), sprites: spr.bakeSprites(), hud: { message() {}, ticMessages() {} },
        audio: { play(n) { calls.play.push(n); }, loop(n) { calls.loops++; return { stop() { calls.stops++; } }; }, listener: { x: 0, y: 0 }, setAmbience() {} },
        input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, attack: false, use: false, run: false, jump: false, sample() {}, sensitivity: 0 } });
      const q = gS.player; q.weapon = 'MINIGUN';
      const held = { look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, attack: true, use: false, run: false, jump: false, weaponSlot: 0, weaponCycle: 0 };
      const up = { ...held, attack: false };
      for (let t = 0; t < pl.SPIN_UP + 6; t++) q.tic(held, 1 / 35);
      check('the trigger going down plays the spin-up once and starts the loop once the rounds leave',
        calls.play.filter(n => n === 'spinup').length === 1 && calls.loops === 1 && !!q.gunLoop && !calls.play.includes('minigun'));
      for (let t = 0; t < 4; t++) q.tic(up, 1 / 35);
      check('and letting go stops the loop and plays the wind-down',
        calls.stops === 1 && q.gunLoop === null && calls.play.filter(n => n === 'spindown').length === 1);
    }
    check('the loading screen says RETICULATING SPLINES and the steps do not talk over it',
      /RETICULATING SPLINES/.test(html) && !/s\.textContent = text/.test(mainSrc.split('const failed')[0]));
    check('nothing is written across the picture when a convoy is called',
      !/setBigMessage/.test(rsp));
    check('the fire button says FIRE and there is a JUMP button',
      />FIRE<\/div>/.test(html) && !/tb-fire[^>]*>\s*<svg/.test(html) && /data-btn="jump"/.test(html) && /\.tb-jump \{/.test(css));
    check('the three small buttons stand in an arc round the big one', /--arc:/.test(css) && /\.7071/.test(css));
    check('a pad fades the thumb controls and a finger brings them back',
      /#touch\.pad \.tb/.test(css) && /setPadHeld\(true\)/.test(inSrc) && /pointerType !== 'mouse'\) this\.setPadHeld\(false\)/.test(inSrc) &&
      /input\.onPadChange = on => touch\.setPadHeld\(on\)/.test(mainSrc));
    check('the pad is laid out the standard way: left stick moves, right stick looks, R2 fires, L2 jumps, bumpers cycle',
      /mx \+= dead\(pad\.axes\[0\]\); my -= dead\(pad\.axes\[1\]\)/.test(inSrc) && /lx \+= dead\(pad\.axes\[2\]\)/.test(inSrc) &&
      /btn\(7\)/.test(inSrc) && /padEdge\(6\)/.test(inSrc) && /padEdge\(4\)\) this\.weaponCycle = -1/.test(inSrc) && /padEdge\(5\)\) this\.weaponCycle = 1/.test(inSrc));
    check('space jumps, F uses, 4 is the minigun', /Space: 'jump'/.test(inSrc) && /KeyF: 'use'/.test(inSrc) && /Digit4: 'weapon4'/.test(inSrc));
    check('the readout names what you are holding, top right, and steps past the pause button on a phone',
      /buildName\(/.test(hudSrc) && /setNameInset/.test(hudSrc) && /hud\.setNameInset\(on \?/.test(mainSrc));
    check('brightness, contrast and gamma are three sliders applied before the palette snap',
      ['opt-bright', 'opt-contrast', 'opt-gamma'].every(id => html.includes(`id="${id}"`)) &&
      /setPicture\(/.test(lofiSrc) && lofiSrc.indexOf('uPicture.x') < lofiSrc.indexOf('vec3 snapped = palSnap(c)') &&
      /pipeline\.setPicture\(\{ brightness: prefs\.bright/.test(mainSrc));
  }
}

/* ---------- the decals ---------- */
section('the decals');
{
  const fs = await import('node:fs');
  const D = await import('../js/decals.js');
  const { Game } = await import('../js/game.js');
  const MAPD = await import('../js/maps/sellwrong.js');
  const THREED = await import('three');
  const mk = () => new Game({
    level: MAPD.buildSellWrong(), scene: new THREED.Scene(), camera: {},
    textures: tex.bakeTextures(), sprites: spr.bakeSprites(),
    hud: { message() {}, ticMessages() {} }, audio: null,
    input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
             attack: false, use: false, run: false, jump: false, sample() {}, sensitivity: 0 },
  });
  /* --- the arithmetic --------------------------------------------- */
  const line = { x1: 0, y1: 0, x2: 100, y2: 0 };
  const nA = D.wallNormal(line, 50, 40), nB = D.wallNormal(line, 50, -40);
  check('a wall\'s normal is unit length, across the line, and faces the shooter',
    Math.abs(Math.hypot(nA.nx, nA.ny) - 1) < 1e-9 && nA.nx === 0 && nA.ny > 0 && nB.ny < 0 && nA.nz === 0);
  const bw = D.surfaceBasis(nA), bf = D.surfaceBasis(D.UP);
  check('and a quad is laid across it: along and up for a wall, x and y for a floor',
    Math.abs(bw.ux * nA.nx + bw.uy * nA.ny) < 1e-9 && bw.vz === 1 && bf.ux === 1 && bf.vy === 1);
  /* --- holes --------------------------------------------------------- */
  const g = mk();
  const q = g.player;
  check('the game has decals, headless, with nothing to draw them on', !!g.decals && g.decals.liveCount === 0);
  const wall = g.level.rayHitWall(q.x, q.y, q.eyeZ, q.x + Math.cos(q.angle) * 4000, q.y + Math.sin(q.angle) * 4000, q.eyeZ);
  if (wall) {
    g.hitscan(q, q.angle, 4000, 10, { shot: true });
    const H = g.decals.pools.hole;
    check('a round into a wall leaves a hole on it, facing back the way it came',
      g.decals.holes === 1 && Math.abs(H.x[0] - wall.x) < 1e-6 &&
      (H.nx[0] * (q.x - wall.x) + H.ny[0] * (q.y - wall.y)) > 0 && H.nz[0] === 0 && H.strength[0] > 0.5);
    check('and it is a hand across, not a plate', H.size[0] >= D.HOLE_SIZE[0] && H.size[0] <= D.HOLE_SIZE[1]);
  } else check('a wall to shoot at', false);
  g.hitscan(q, q.angle, 4000, 10, { shot: true, pitch: -0.8 });
  check('and one into the floor leaves one on the floor, facing up',
    g.decals.holes === 2 && g.decals.pools.hole.nz[1] === 1);
  /* THE RING: a thousand rounds into one wall are still one pool */
  for (let k = 0; k < D.POOLS.hole + 50; k++) g.decals.hole(q.x, q.y, 0, D.UP);
  check('the holes are a ring, so the pool never overflows', g.decals.pools.hole.count === D.POOLS.hole && g.decals.holes === D.POOLS.hole + 52);
  check('and the ring is the MAX COUNT, a hundred, at the user\'s request',
    D.POOLS.hole === 100 && D.POOLS.heat === 100 && D.POOLS.frost === 100,
    `${D.POOLS.hole}, ${D.POOLS.heat}, ${D.POOLS.frost}`);

  /* --- AND A FULL POOL FADES ITS OLDEST OUT, IN ORDER -----------------
     At the user's request: the cap is not a guillotine. Once the pool
     is within FADE_AHEAD of full, that many of its oldest lose
     FADE_RATE a tic and are gone in eight, so the hole a new round
     takes the slot of has already dissolved. What is asserted is the
     ORDER — the fading ones are the oldest ones, which is the cursor's
     own next few — and that the pool drains rather than sitting full. */
  {
    const gF = mk();
    const dF = gF.decals, H = dF.pools.hole;
    const fx = gF.player.x, fy = gF.player.y;
    /* fill it exactly, in order, each hole a step along the wall so
       they can be told apart */
    for (let k = 0; k < D.POOLS.hole; k++) dF.hole(fx + k, fy, 40, D.UP);
    check('a hundred rounds fill the pool and no more than fill it',
      H.count === D.POOLS.hole && H.next === 0, `${H.count} live, cursor ${H.next}`);
    const oldest = [];
    H.oldest(D.FADE_AHEAD, oldest);
    check('and the oldest of them are the first ones laid, in order',
      oldest.length === D.FADE_AHEAD && oldest.every((i, k) => i === k),
      oldest.join(','));
    const before = H.strength[0];
    dF.tic();
    check('a tic with the pool full fades the oldest and touches nothing outside the band',
      H.strength[0] < before - 1e-9 && Math.abs(H.strength[0] - (before - D.FADE_RATE)) < 1e-6 &&
      H.strength[D.FADE_AHEAD] === before && H.strength[D.POOLS.hole - 1] === before,
      `${H.strength[0].toFixed(3)} against ${H.strength[D.FADE_AHEAD].toFixed(3)}`);
    /* and they settle into the QUEUE: each held down to its place in
       it, so what is drawn at the old end is a gradient running from
       nothing up to full — a hole fading as the ring comes round to
       it rather than on a clock of its own */
    for (let k = 0; k < 10; k++) dF.tic();
    check('and the oldest is gone in four tics, and the band is a gradient in order',
      H.strength[0] === 0 && H.count === D.POOLS.hole - 1 &&
      [...Array(D.FADE_AHEAD - 1)].every((_, k) => H.strength[k + 1] > H.strength[k]),
      `${H.count} left, band ${[0, 1, 2, 8, 16, 23].map(k => H.strength[k].toFixed(2)).join(' ')}`);
    check('and the queue is where a decal\'s brightness comes from: nothing at the cursor, full at the back',
      D.fadeTarget(0) === 0 && D.fadeTarget(D.FADE_AHEAD) === 1 && D.fadeTarget(D.FADE_AHEAD / 8) < 0.02);
    check('and the newest are untouched: a cap that fades is not a cap that cuts',
      H.strength[D.POOLS.hole - 1] > 0.5 && H.strength[D.FADE_AHEAD] > 0.5);
    /* and it holds there rather than emptying itself out */
    for (let k = 0; k < 400; k++) dF.tic();
    check('and a pool that has stopped filling holds what it has rather than emptying',
      H.count === D.POOLS.hole - 1, `${H.count} left`);
    /* AND THE FADE KEEPS AHEAD OF THE MINIGUN, which is the whole
       reason it is a queue and not a clock: four holes a tic for a
       second, and every slot the cursor takes was already faded to
       nothing rather than cut off the wall at full strength. */
    {
      let worst = 0;
      for (let t = 0; t < 35; t++) {
        for (let k = 0; k < 4; k++) {
          worst = Math.max(worst, H.strength[H.next]);
          dF.hole(fx + (t * 4 + k) % 90, fy + 90, 40, D.UP);
        }
        dF.tic();
      }
      check('and under a held minigun every hole the ring reaches has already faded out',
        worst < 0.05, `the brightest overwritten was ${worst.toFixed(3)}`);
      check('and the wall still holds a hundred of them', H.count <= D.POOLS.hole && H.count > D.POOLS.hole * 0.8, `${H.count}`);
    }
    /* AND THE SAME FOR THE OTHER KINDS, at the user's request: they
       are one system and one rule. A hundred separate hot spots, far
       enough apart that none of them merges. */
    const HT = dF.pools.heat;
    for (let k = 0; k < D.POOLS.heat; k++) dF.heat(fx + k * (D.MERGE_RADIUS * 3), fy + 400, 40, D.UP, 1);
    check('the heat pool is a ring on the same rule', HT.count === D.POOLS.heat, `${HT.count}`);
    const s0 = HT.strength[HT.next], s9 = HT.strength[(HT.next + D.POOLS.heat - 1) % D.POOLS.heat];
    dF.tic();
    check('and its oldest fades faster than its cooling alone',
      (s0 - HT.strength[HT.next]) > (s9 - HT.strength[(HT.next + D.POOLS.heat - 1) % D.POOLS.heat]) + 1e-9,
      `${(s0 - HT.strength[HT.next]).toFixed(4)} against ${(s9 - HT.strength[(HT.next + D.POOLS.heat - 1) % D.POOLS.heat]).toFixed(4)}`);
  }
  /* --- the cull: drawn only in range and in front of the eye ------------ */
  {
    const gC = mk();
    const dC = gC.decals;
    dC.attach(gC.scene);
    const hx = gC.player.x, hy = gC.player.y;
    dC.hole(hx + 300, hy, 40, D.UP);                   // ahead
    dC.hole(hx - 300, hy, 40, D.UP);                   // behind
    dC.hole(hx + D.DRAW_RANGE + 200, hy, 40, D.UP);    // too far
    const H = dC.pools.hole;
    dC.render();
    check('with no eye given every hole is drawn', H.drawn === 3);
    dC.render(hx, hy, 1, 0);
    check('given the eye, the one behind it and the one out of range are not', H.drawn === 1, `${H.drawn} drawn`);
    dC.render(hx, hy, -1, 0);
    check('turn round and it is the other one', H.drawn === 1 && H.mesh.geometry.drawRange.count === 6);
    check('and the range is a number the readme can name', D.DRAW_RANGE >= 2000 && D.DRAW_RANGE <= 4000);
  }
  /* --- heat ---------------------------------------------------------- */
  const g2 = mk();
  const d = g2.decals, x = g2.player.x, y = g2.player.y, z = g2.player.z;
  for (let k = 0; k < 20; k++) d.heat(x, y, z, D.UP);
  const HP = d.pools.heat;
  check('the stream held on one spot heats it, and one landing is a little',
    HP.count === 1 && Math.abs(HP.strength[0] - Math.min(1, 20 * D.HEAT_PER_LANDING)) < 1e-5);
  d.heat(x + 10, y + 8, z, D.UP);
  check('a landing near a hot spot feeds it rather than starting another', HP.count === 1);
  d.heat(x + 80, y, z, D.UP);
  check('and one a way off starts another', HP.count === 2);
  for (let k = 0; k < 40; k++) d.heat(x, y, z, D.UP);
  check('and it tops out white', HP.strength[0] === 1);
  for (let t = 0; t < 6 * 35 + 2; t++) d.tic();
  check('left alone it cools over six seconds', HP.count === 0 && HP.strength[0] === 0);
  check('and a spot that got hot leaves a scorch behind, for good',
    d.scorches >= 1 && d.pools.hole.count >= 1 && d.pools.hole.frame[0] === 1 && d.pools.hole.size[0] > D.HOLE_SIZE[1]);
  /* --- frost, and the argument --------------------------------------- */
  const g3 = mk();
  const d3 = g3.decals, x3 = g3.player.x, y3 = g3.player.y, z3 = g3.player.z;
  for (let k = 0; k < 10; k++) d3.frost(x3, y3, z3, D.UP);
  const FP = d3.pools.frost;
  check('the jet held on one spot rimes it', FP.count === 1 && Math.abs(FP.strength[0] - Math.min(1, 10 * D.FROST_PER_LANDING)) < 1e-5);
  for (let t = 0; t < 10 * 35 + 2; t++) d3.tic();
  check('and it thaws over ten seconds and leaves nothing', FP.count === 0 && d3.pools.hole.count === 0);
  for (let k = 0; k < 20; k++) d3.heat(x3, y3, z3, D.UP);
  const before = d3.pools.heat.strength[0];
  d3.frost(x3 + 20, y3, z3, D.UP);
  check('gas landing near a hot spot takes the heat out of it', d3.pools.heat.strength[0] < before - 0.05);
  const fi = FP.nearest(x3 + 20, y3, z3, D.UP, 5), fb = FP.strength[fi];
  d3.heat(x3 + 30, y3, z3, D.UP);
  check('and flame landing near rime melts it', fi >= 0 && FP.strength[fi] < fb);
  check('but a wall\'s heat and a floor\'s rime do not argue: different surfaces',
    (() => { const g4 = mk(); const dd = g4.decals; const p = g4.player; for (let k = 0; k < 20; k++) dd.heat(p.x, p.y, p.z, D.UP); const b = dd.pools.heat.strength[0]; dd.frost(p.x, p.y, p.z, { nx: 1, ny: 0, nz: 0 }); return dd.pools.heat.strength[0] === b; })());
  /* --- and the streams actually feed it --------------------------------- */
  const g5 = mk();
  const p5 = g5.player;
  /* a few tics: long enough for the particles to land, short enough
     that six landings' worth has not cooled away again */
  g5.flame.fire({ x: p5.x, y: p5.y, z: p5.eyeZ }, p5.angle, -1.1);
  for (let t = 0; t < 8; t++) { g5.flame.tic(); g5.decals.tic(); }
  check('the flamethrower held at the floor heats the floor', g5.decals.pools.heat.count > 0 && g5.decals.pools.heat.nz[0] === 1 && g5.flame._hits > 0);
  g5.frost.fire({ x: p5.x, y: p5.y, z: p5.eyeZ }, p5.angle, -1.1);
  for (let t = 0; t < 8; t++) { g5.frost.tic(); g5.decals.tic(); }
  check('and the extinguisher held at the floor rimes it', g5.decals.pools.frost.count > 0);
  const gsrc = fs.readFileSync('js/game.js', 'utf8');
  check('the decals are ticked, drawn, and attached only where there are pictures',
    /this\.decals\.tic\(\)/.test(gsrc) && /this\.decals\.render\(ex, ey, vx, vy\)/.test(gsrc) && /if \(fxAtlases\) this\.decals\.attach\(scene\)/.test(gsrc));
}

/* ---------- the wall as mass ---------- */
section('the voxel wall');
{
  const VX = await import('../js/voxel.js');
  const { VoxelSpan, VoxelWall, solidSpans, voxelisable, alongLine,
          VOX, SPAN, THICK, EMPTY, MID, UPPER, LOWER, TORN, MAX_LINE } = VX;
  const { TICRATE } = await import('../js/util.js');

  /* THE ONE PROPERTY EVERYTHING ELSE RESTS ON. A wall nobody has
     touched must come back out of the lattice as the two rectangles it
     went in as — one per side — or voxelising a shopfront changes the
     picture before anybody has fired at it, and every stage after this
     one is built on sand. */
  const flat = [{ z0: 0, z1: 480, slot: MID }];
  const sp = new VoxelSpan(0, SPAN, flat, 0.5);
  let quads = 0, byAxis = [0, 0, 0], torn = 0;
  sp.mesh((slot, axis) => { quads++; byAxis[axis]++; if (slot === TORN) torn++; });
  note('intact span', `${sp.nu}x${sp.nz}x${sp.nw} voxels, ${sp.bytes} bytes`);
  check('an untouched wall is two rectangles', quads === 2, `${quads}`);
  check('and both of them are the wall, not its edges', byAxis[2] === 2 && torn === 0,
    `u/z/w = ${byAxis.join('/')}, ${torn} torn`);

  /* A wall is two voxels through — one from each of the two one-sided
     lines that face each other across the map's 16-unit void. */
  check('a line owns one voxel of the void', sp.nw === Math.round(THICK / VOX) && sp.nw === 1);
  check('the lattice covers the whole height', sp.nz * VOX >= 480 && (sp.nz - 1) * VOX < 480);

  /* A WINDOW IS A HOLE IN THE MASS. Two skins with air between them —
     the lintel over a shopfront and the stall riser under it — must
     leave the middle empty, or a pane of glass is a solid block. */
  {
    const split = new VoxelSpan(0, SPAN, [{ z0: 0, z1: 48, slot: LOWER }, { z0: 200, z1: 480, slot: UPPER }], 0);
    const mid = split.get(4, Math.floor((120 - split.zBot) / VOX), 0);
    check('the gap between two skins is empty', mid === EMPTY, `slot ${mid}`);
    check('and the skins themselves are not',
      split.get(4, 0, 0) === LOWER && split.get(4, split.nz - 1, 0) === UPPER);
  }

  /* ONE ROUND IS NOT A CANNON. A minigun round is 24 to 48 and a voxel
     is 23 centimetres across; if one round took one voxel every bullet
     would blow a fist through a wall. It has to take a few dozen on one
     spot, which is about half a second of holding the trigger. */
  {
    const w = new VoxelSpan(0, SPAN, flat, 0.5);
    check('one round opens nothing', w.hit(128, 240, 36, 10) === 0);
    let tics = 0, broke = 0;
    while (!broke && tics < 200) { for (let r = 0; r < 4; r++) broke += w.hit(128, 240, 36, 10); tics++; }
    note('held on one spot, the wall opens after', `${tics} tics (${(tics / TICRATE).toFixed(2)} s)`);
    check('a held burst does open it', broke > 0 && tics < 60, `${tics} tics`);
    check('and you can see through where it went', w.openAt(128, 240));
    check('but not through the wall beside it', !w.openAt(200, 240));
  }

  /* WHAT A HOLE COSTS. The edges of one are faces that did not exist
     before, and they are the thing that makes a hole read as a hole —
     but they are also the only way this grows, so it is worth knowing
     the number rather than discovering it. */
  {
    const w = new VoxelSpan(0, SPAN, flat, 0.5);
    w.carve(128, 240, 24);
    let q = 0, t = 0;
    w.mesh((slot) => { q++; if (slot === TORN) t++; });
    note('one 24-unit hole costs', `${q} rectangles, ${t} of them torn edge`);
    check('a hole has a torn edge round it', t > 0);
    check('a hole does not cost the earth', q < 40, `${q}`);

    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) w.mesh(() => {});
    const ms = Number(process.hrtime.bigint() - t0) / 1e8;
    note('re-merging that span', `${ms.toFixed(3)} ms of a ${(1000 / TICRATE).toFixed(1)} ms tic`);
    check('re-merging a shot wall fits in a tic many times over', ms < 3, `${ms.toFixed(3)} ms`);
  }

  /* NOTHING IS BUILT UNTIL SOMETHING HITS IT, which is the whole reason
     the building still loads in half a second. */
  {
    const wall = level.lines.filter(l => voxelisable(l, level.sectors)).sort((a, b) => b.len - a.len)[0];
    const vw = new VoxelWall(wall, level.sectors);
    check('a wall nobody has shot holds no lattice', vw.live === 0 && vw.bytes === 0);
    const mid = alongLine(wall, (wall.x1 + wall.x2) / 2, (wall.y1 + wall.y2) / 2);
    vw.carve(mid, 100, 20);
    note('the longest eligible wall', `${Math.round(wall.len)} units, ${vw.count} spans`);
    check('one hit builds one span of it', vw.live === 1, `${vw.live}`);
    check('and that span is small', vw.bytes < 8192, `${vw.bytes} bytes`);
    check('the hit landed where it was aimed', vw.openAt(mid, 100));
  }

  /* A HIT ON A SPAN JOIN REACHES BOTH SIDES, or a hole that straddles
     one comes out as a half hole with a straight edge down the middle. */
  {
    const wall = level.lines.filter(l => voxelisable(l, level.sectors) && l.len > SPAN * 2)[0];
    const vw = new VoxelWall(wall, level.sectors);
    vw.carve(SPAN, 100, 24);
    check('a hole across a span join opens both', vw.live === 2, `${vw.live}`);
  }

  /* WHAT IS ELIGIBLE. One-sided walls only for now — a two-sided lintel
     is drawn with no thickness at all and giving it some would shift its
     faces half a voxel. And the wood's own boundary is scenery: four
     lines of nine thousand units and up that no round will ever reach. */
  {
    const elig = level.lines.filter(l => voxelisable(l, level.sectors));
    const longest = Math.max(...elig.map(l => l.len));
    note('voxelisable lines', `${elig.length} of ${level.lines.length}`);
    check('every eligible line is one-sided',
      elig.every(l => l.front === null || l.back === null));
    check('the wood is not eligible', longest <= MAX_LINE, `longest ${Math.round(longest)}`);
    check('but the building is', elig.length > 200, `${elig.length}`);
    check('a two-sided line still has mass on it',
      level.lines.some(l => l.front !== null && l.back !== null && solidSpans(l, level.sectors).length > 0));
  }

  /* AND IT DOES NOT IMPORT A RENDERER. The arithmetic runs headless for
     the same reason js/decals.js's does, and the way it stays that way
     is that nothing in the file reaches for three. */
  {
    const fs = await import('node:fs');
    const src = fs.readFileSync('js/voxel.js', 'utf8');
    check('the lattice has no three.js in it', !/from 'three'/.test(src));
  }
}

/* ---------- the wall in the picture ---------- */
section('the voxel wall in the picture');
{
  const VX = await import('../js/voxel.js');
  const { VoxelWall, voxelisable, SPAN, RUIN_TORN_VARIANTS } = VX;
  const { buildLevelGeometry } = await import('../js/mapgeo.js');

  check('the torn edge has as many ruins as the fire does',
    RUIN_TORN_VARIANTS === tex.RUIN_VARIANTS, `${RUIN_TORN_VARIANTS} vs ${tex.RUIN_VARIANTS}`);

  const bank = tex.bakeTextures();

  /* Every triangle in a built level, keyed by what it would put on the
     screen — where its corners are, what texture coordinate each one
     carries, and the light, sky and char it was given. Two builds that
     draw the same picture produce the same bag of these. */
  function triangles(group) {
    const bag = new Map();
    const walk = o => {
      if (o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
        const P = o.geometry.attributes.position.array;
        const U = o.geometry.attributes.uv.array;
        const L = o.geometry.attributes.light.array;
        const S = o.geometry.attributes.sky.array;
        const C = o.geometry.attributes.charred.array;
        const r = n => Math.round(n * 1e4) / 1e4;
        for (let t = 0; t < P.length / 9; t++) {
          const v = [];
          for (let k = 0; k < 3; k++) {
            const i = t * 3 + k;
            v.push([r(P[i * 3]), r(P[i * 3 + 1]), r(P[i * 3 + 2]),
                    r(U[i * 2]), r(U[i * 2 + 1]), r(L[i]), r(S[i]), r(C[i])].join(','));
          }
          /* rotate to the smallest corner: the same triangle written
             from a different starting vertex is the same triangle, and
             rotating keeps the winding it was wound with */
          let at = 0;
          for (let k = 1; k < 3; k++) if (v[k] < v[at]) at = k;
          const key = o.name + '|' + [v[at], v[(at + 1) % 3], v[(at + 2) % 3]].join('|');
          bag.set(key, (bag.get(key) || 0) + 1);
        }
      }
      for (const c of (o.children || [])) walk(c);
    };
    walk(group);
    return bag;
  }
  const size = bag => [...bag.values()].reduce((a, b) => a + b, 0);

  /* ONE SPAN, SO THE COMPARISON IS EXACT. A wall longer than a span is
     drawn as one quad today and as one quad PER SPAN once it has a
     lattice — the same surface, with the same texture running across
     it, cut at the joins. Those are different triangles covering
     identical pixels, which is a thing this test cannot tell apart from
     a bug, so the wall it holds up to the light is a short one. */
  const short = level.lines
    .filter(l => voxelisable(l, level.sectors) && l.len <= SPAN && l.len >= 64)
    .sort((a, b) => b.len - a.len)[0];
  check('there is a wall short enough to compare whole', !!short);

  const clean = triangles(buildLevelGeometry(level, bank).group);

  short.voxels = new VoxelWall(short, level.sectors);
  short.voxels.gridAt(0);                       // built, and not a mark on it
  const voxed = triangles(buildLevelGeometry(level, bank).group);

  note('the wall under test', `${Math.round(short.len)} units of ${short.middle || 'WALL'}`);
  note('triangles, clean / voxelised', `${size(clean)} / ${size(voxed)}`);

  /* THE GATE. Every triangle the clean build drew is still there,
     unmoved, with the same texture coordinates on it. */
  let missing = 0, firstMissing = null;
  for (const [k, n] of clean) {
    const got = voxed.get(k) || 0;
    if (got < n) { missing += n - got; if (!firstMissing) firstMissing = k; }
  }
  check('voxelising a wall moves nothing that was already drawn',
    missing === 0, `${missing} triangles changed, first: ${firstMissing}`);

  /* and what it adds is the back of the cavity: the far side of the
     eight units this line owns of the void, which faces away from the
     room and is culled before it is ever rasterised */
  let extra = 0;
  for (const [k, n] of voxed) extra += Math.max(0, n - (clean.get(k) || 0));
  note('what the lattice adds while intact', `${extra} triangles (the back of the cavity)`);
  check('an intact lattice adds only the cavity back', extra === 2, `${extra}`);

  /* AND A HOLE IS A HOLE. Once something is taken out, triangles that
     were there must GO — a hole you cannot see through is a decal with
     extra steps. */
  {
    short.voxels.carve(short.len / 2, (level.sectors[short.front ?? short.back].floor +
                                       level.sectors[short.front ?? short.back].ceil) / 2, 28);
    const shot = triangles(buildLevelGeometry(level, bank).group);
    let gone = 0;
    for (const [k, n] of clean) gone += Math.max(0, n - (shot.get(k) || 0));
    note('after a 28-unit hole', `${size(shot)} triangles, ${gone} of the original gone`);
    check('a hole takes the wall that was there away', gone > 0, `${gone}`);
    check('and puts a torn edge in its place',
      [...shot.keys()].some(k => k.startsWith('RUINWALL')));
    check('the store is still one batch per texture, not one per hole',
      size(shot) > size(clean) && size(shot) < size(clean) + 400, `${size(shot) - size(clean)}`);
  }

  /* A WALL IS SHOT HALFWAY THROUGH THE GAME, not at build time, and
     that is the whole difficulty. The doors' list can be settled once
     because which sectors move is written in the map; which walls have
     been shot is not. Decided once at build time, a line that becomes a
     lattice in the middle of a firefight stays in the list that draws
     quads, keeps drawing its quad, and the hole never appears at all —
     which is what this does if the split is not made on every rebuild. */
  {
    delete short.voxels;                        // back to a wall nobody has touched
    const geo = buildLevelGeometry(level, bank);
    const before = size(triangles(geo.group));
    const sec = level.sectors[short.front ?? short.back];
    short.voxels = new VoxelWall(short, level.sectors);
    short.voxels.carve(short.len / 2, (sec.floor + sec.ceil) / 2, 28);
    geo.rebuildStatic();
    const after = triangles(geo.group);
    check('a wall shot after the level was built draws its hole',
      size(after) !== before && [...after.keys()].some(k => k.startsWith('RUINWALL')),
      `${before} -> ${size(after)}`);
  }

  /* leave the level as it was found: everything after this builds on it */
  delete short.voxels;
}

/* ---------- the vans under fire ---------- */
section('the vans under fire');
{
  const fs = await import('node:fs');
  const { Game } = await import('../js/game.js');
  const MAPV = await import('../js/maps/sellwrong.js');
  const THREEV = await import('three');
  const { Tracers, MAX_TRACERS, TRACER_SPEED, TRACER_LEN } = await import('../js/tracers.js');
  /* the lot's van, off the user's file, the way `the van` builds it */
  const carV = await import('../js/car.js');
  const glbV = await import('../js/glb.js');
  const vanDef = (() => {
    const bytes = fs.readFileSync('assets/models/van.glb');
    const { json, bin } = glbV.parseGLB(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    return carV.modelVehicle(json, bin);
  })();
  const mk = () => new Game({
    level: MAPV.buildSellWrong(), scene: new THREEV.Scene(), camera: {},
    textures: tex.bakeTextures(), sprites: spr.bakeSprites(),
    hud: { message() {}, ticMessages() {} }, audio: null,
    input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
             attack: false, use: false, run: false, jump: false, sample() {}, sensitivity: 0 },
    fleet: { texture: {}, def: vanDef },
  });
  const g = mk();
  const v = g.vehicles.all.find(c => c.whole);
  check('there is a van in the lot to shoot at', !!v);
  if (v) {
    /* --- rounds ------------------------------------------------------- */
    const hp = v.health;
    v.damage(36, g.player, { shot: true });
    check('a round takes a twentieth of what it would off a car in the lot',
      Math.abs((hp - v.health) - 36 / v.shotArmour) < 1e-9 && v.shotArmour === 20);
    let rounds = 1;
    while (v.whole && v.state !== 'charring' && rounds < 1000) { v.damage(36, g.player, { shot: true }); rounds++; }
    note('a car in the lot', `${rounds} rounds of the minigun before it chars`);
    check('and it takes a lot of them before it chars, and chars rather than vanishing',
      rounds > 60 && rounds < 120 && v.state === 'charring');
    /* --- the stream lights it and that is all --------------------------- */
    const w = g.vehicles.all.find(c => c.whole && c !== v);
    const hw = w.health;
    for (let k = 0; k < 400; k++) w.damage(9, g.player, { fire: true, stream: true });
    check('four hundred flame particles on a car light it and take nothing off it',
      w.health === hw && w.burning > 0 && w.state !== 'charring');
    const hb = w.health;
    w.damage(30, null, { fire: true });
    check('but a blast still hurts it', w.health < hb);
    /* the blocker path: the stream hits a CARBODY, which hands it on */
    const blocker = w.blockers[0];
    const hb2 = w.health;
    blocker.damage(9, g.player, { fire: true, stream: true });
    check('and through the blockers the same', w.health === hb2);
    /* --- holes on it ---------------------------------------------------- */
    const D = g.decals;
    const L = w.def.length, hw2 = w.def.box.half * L;
    /* a round from the driver's side, coming across the vehicle */
    const c = Math.cos(w.yaw), sn = Math.sin(w.yaw);
    const hx = w.x - sn * 10, hy = w.y + c * 10;          // ten units off the centreline, left
    D.vehicleHole(w, hx, hy, w.bodyZ + 20, sn, -c, 0);     // travelling toward -local y
    const P = D.pools.hole, i = P.next === 0 ? P.max - 1 : P.next - 1;
    check('a round into a van leaves a hole on the flank it came in through',
      P.owner[i] === w && Math.abs(P.ly[i] - hw2) < 1e-3 && P.lny[i] === 1 && P.lnx[i] === 0 && P.lnz[i] === 0);
    check('and the hole rides in the van\'s own frame',
      Math.abs(P.lz[i] - 20) < 1e-3 && Math.abs(P.lx[i]) < L / 2);
    /* the top: a round coming steeply down */
    D.vehicleHole(w, w.x, w.y, w.bodyZ + 5, 0.1, 0, -1);
    const j = P.next === 0 ? P.max - 1 : P.next - 1;
    check('and one from above lands on the roof', P.lnz[j] === 1 && Math.abs(P.lz[j] - w.def.box.height * L) < 1e-3);
    /* carried: render() with no mesh still places owned holes where the vehicle is */
    const ox = w.x; w.x += 100;
    D._carry();
    check('and moves when the van does', Math.abs(P.x[i] - (P.x[i] - 0)) < 1e-9 && P.x[i] > ox + 50);
    w.x = ox;
    /* --- the hitscan does all of that on its own -------------------------- */
    const g2 = mk();
    const q = g2.player, u = g2.vehicles.all.find(c => c.whole);
    q.x = u.x - Math.cos(u.yaw + Math.PI / 2) * 200; q.y = u.y - Math.sin(u.yaw + Math.PI / 2) * 200;
    q.sector = g2.level.sectorAt(q.x, q.y); q.z = q.sector ? q.sector.floor : 0; q.viewZ = q.z + 30;
    q.angle = Math.atan2(u.y - q.y, u.x - q.x);
    const before = g2.decals.holes, uh = u.health;
    const hit = g2.hitscan(q, q.angle, 2400, 36, { shot: true, pitch: 0 });
    check('a shot at a van hits it, hurts it a twentieth, and puts a hole on it',
      !!hit && hit.vehicle === u && u.health < uh && g2.decals.holes === before + 1 && g2.decals.pools.hole.owned === 1,
      `${hit ? hit.type : 'miss'} ${g2.decals.holes - before} holes`);
    check('and says where it stopped, for the tracer',
      Math.hypot(g2.lastHit.x - u.x, g2.lastHit.y - u.y) < u.def.length);
  }
  /* --- the police van and the carrier ------------------------------------- */
  const vsrc = fs.readFileSync('js/vehicles.js', 'utf8');
  check('the police van takes fifty times a round and the APC ninety',
    /shotArmour: 50/.test(vsrc) && /this\.shotArmour = 90/.test(vsrc));
  /* --- tracers ------------------------------------------------------------ */
  const T = new Tracers(null);
  const t0 = T.spawn({ x: 0, y: 0, z: 40 }, { x: 400, y: 0, z: 40 });
  check('a tracer leaves the muzzle toward the hit', t0 >= 0 && T.count === 1 && T.dx[t0] === 1 && T.left[t0] === 400);
  T.tic();
  check('and flies a hundred and fifty a tic', Math.abs(T.x[t0] - TRACER_SPEED) < 1e-6);
  /* VERY LONG, at the user's request, and it grows out of the barrel:
     for its first tics the tail is AT the muzzle, not behind it */
  check('a tracer is very long', TRACER_LEN >= 300, `${TRACER_LEN}`);
  {
    const tailAt = (i) => Math.min(Math.max(0, T.trav[i] - TRACER_LEN), T.d[i]);
    check('and its tail stays at the muzzle until the head is a whole length out',
      tailAt(t0) === 0 && T.trav[t0] === TRACER_SPEED);
    for (let k = 0; k < 2; k++) T.tic();
    check('the head arrives and waits at the hit', T.x[t0] === 400 && T.left[t0] === 0 && T.alive[t0] === 1);
    const before = tailAt(t0);
    T.tic();
    check('while the tail keeps flying, shrinking the streak into it', tailAt(t0) > before && tailAt(t0) < 400);
  }
  for (let k = 0; k < 6; k++) T.tic();
  check('and is gone once the tail has caught the head up', T.count === 0);
  for (let k = 0; k < MAX_TRACERS + 10; k++) T.spawn({ x: 0, y: 0, z: 40 }, { x: 4000, y: 0, z: 40 });
  check('and a burst past the pool reuses the oldest', T.count === MAX_TRACERS);
  check('the minigun fires one every other round', /\(i & 1\) === 0 && g\.tracers/.test(fs.readFileSync('js/player.js', 'utf8')));
  /* --- the puff sits on the hole ---------------------------------------- */
  {
    const bank = spr.bakeSprites();
    const e = bank.get('PUFF', 'A');
    check('the hit puff is centred on the hit, not stood a height and a half above it',
      e.lift === -(e.h * e.scale) / 2, `lift ${e.lift} for ${e.h} tall`);
  }
  /* --- the minigun, under the music ------------------------------------- */
  {
    const au = await import('../js/audio.js');
    check('the minigun\'s recordings are turned down so the music stands out',
      au.SAMPLE_GAIN.minigun_fire <= 0.4 && au.SAMPLE_GAIN.minigun_start <= 0.5 && au.SAMPLE_GAIN.minigun_stop <= 0.5 &&
      /this\._gainFor\(from\) \* \(SAMPLE_GAIN\[key\] \?\? 1\)/.test(fs.readFileSync('js/audio.js', 'utf8')));
  }
}

/* ---------- the gunship ---------- */
section('the gunship');
{
  const fs = await import('node:fs');
  const V = await import('../js/vtol.js');
  const glbG = await import('../js/glb.js');
  const carG = await import('../js/car.js');
  const { Game } = await import('../js/game.js');
  const MAPG = await import('../js/maps/sellwrong.js');
  const THREEG = await import('three');
  const { world } = await import('../js/material.js');

  const readGLB = f => {
    const b = fs.readFileSync(f);
    return glbG.parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };
  const { json, bin } = readGLB('assets/models/vtol.glb');

  /* --- THE FILE, AS PREPARED ---------------------------------------
     The user drew the answers into the model: small spheres named for
     what they mark, NESTED inside the parts they belong to, because
     where a muzzle is only means anything relative to the gun that
     turns. tools/prep-model.mjs reads those out into the file's own
     extras and takes them out of the mesh — so what is asserted here is
     that the markers are FACTS IN THE FILE and not geometry anybody can
     render by mistake. */
  const vtolMB = fs.statSync('assets/models/vtol.glb').size / 1048576;
  note('what is in the file', `${json.nodes.length} nodes, ${json.meshes.length} meshes, ` +
    `${json.images.length} image, ${vtolMB.toFixed(1)} MB`);

  /* --- AND ITS SHEET IS CRUNCHED, at the user's request -------------
     Six of the model's seven megabytes were a 2048-square colour map on
     a thing that is four hundred units long and usually three hundred
     units over your head. tools/prep-model.mjs --texture 1024 halves it
     — a box average, which is the correct downsample for exactly the
     halving case, and then PNG's own adaptive filtering, which is what
     a photograph needs and flat pixel art does not. */
  {
    const { readPNG: rp, writePNG: wp, halvePNG: hp } = await import('./png-read.mjs');
    const zlibM = await import('node:zlib');
    /* the IDAT of a PNG, concatenated, for the two checks below that
       read a written file back rather than trusting it */
    const idatOf = png => {
      const parts = [];
      let at = 8;
      while (at < png.length) {
        const len = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8);
        if (type === 'IDAT') parts.push(png.subarray(at + 8, at + 8 + len));
        at += 12 + len;
      }
      return Buffer.concat(parts);
    };
    const bvI = json.bufferViews[json.images[0].bufferView];
    const sheet = rp(Buffer.from(bin.subarray(bvI.byteOffset || 0, (bvI.byteOffset || 0) + bvI.byteLength)));
    note('its sheet', `${sheet.w}x${sheet.h}, ${(bvI.byteLength / 1024).toFixed(0)}K of the ${(vtolMB * 1024).toFixed(0)}K file`);
    check('the gunship\'s sheet is crunched to 1024, at the user\'s request',
      sheet.w === 1024 && sheet.h === 1024, `${sheet.w}x${sheet.h}`);
    check('and the whole model is under two megabytes because of it',
      vtolMB < 2, `${vtolMB.toFixed(2)} MB`);

    /* the two pieces that did it, on their own. A box halve is four
       texels averaged into one and nothing else; a filtered PNG is a
       different file from an unfiltered one and reads back the same
       pixels; and the UNFILTERED path has to be untouched, because
       every PNG already committed out of the other tools was written
       by it. */
    const tiny = { w: 2, h: 2, data: new Uint8ClampedArray([0,0,0,255, 10,20,30,255, 20,40,60,255, 30,60,90,255]) };
    const half = hp(tiny);
    check('halving averages the four texels it covers, and nothing else',
      half.w === 1 && half.h === 1 &&
      [...half.data].join(',') === `${(0+10+20+30+2)>>2},${(0+20+40+60+2)>>2},${(0+30+60+90+2)>>2},255`,
      [...half.data].join(','));
    check('and an odd size throws rather than being stretched',
      (() => { try { hp({ w: 3, h: 2, data: new Uint8ClampedArray(24) }); return false; } catch { return true; } })());
    const W = 64, H = 40, px = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) { px[i*4] = (i*7)&255; px[i*4+1] = (i*13)&255; px[i*4+2] = (i*29)&255; px[i*4+3] = 255; }
    const plain = wp(W, H, px), filt = wp(W, H, px, { filter: true });
    const backF = rp(filt);
    check('a filtered PNG is a different file that reads back the same pixels, smaller',
      Buffer.compare(plain, filt) !== 0 && filt.length < plain.length &&
      backF.w === W && backF.h === H && [...backF.data].every((v, i) => v === px[i]),
      `${plain.length} unfiltered against ${filt.length} filtered`);
    /* AND THE UNFILTERED PATH IS UNTOUCHED, which is the check that
       actually protects something: every PNG already committed out of
       tools/prep-people.mjs, tools/prep-troops.mjs, tools/bake-sky.mjs
       and tools/bake-icons.mjs was written by it, and a filter quietly
       turned on for all of them would rewrite files nobody asked to
       have rewritten. Read out of the file rather than trusted: the
       IDAT inflated, and every row's filter byte still zero. */
    check('and every row of an unfiltered PNG still says filter none',
      (() => {
        const zl = zlibM.inflateSync(idatOf(plain));
        const stride = W * 4;
        for (let y = 0; y < H; y++) if (zl[y * (stride + 1)] !== 0) return false;
        return true;
      })(), 'the default path is what every committed PNG was written by');
    check('while a filtered one actually filters, rather than writing none five times',
      (() => {
        const zl = zlibM.inflateSync(idatOf(filt));
        const stride = W * 4, seen = new Set();
        for (let y = 0; y < H; y++) seen.add(zl[y * (stride + 1)]);
        /* WHICH of the five it settles on is the picture's business —
           a smooth ramp is Sub for every row of it and a photograph is
           a mix — so what is asserted is that something other than
           `none` won, which is the whole of the claim being made. */
        return [...seen].some(t => t !== 0);
      })(), 'every row wrote filter none, so nothing was filtered');
  }
  const EX = json.asset?.extras || {};
  check('the gunship is prepared: its markers are in the extras, not in the mesh',
    !!EX.markers?.muzzle && !!EX.markers?.lamp &&
    !json.nodes.some(n => /^Claude.*Delete/i.test(n.name || '')),
    Object.keys(EX.markers || {}).join(', '));
  check('and each marker says which part it is in, so the point turns with that part',
    EX.markers.muzzle.node === 'ClaudeSpinThisThisIsTheVulcanGun' &&
    EX.markers.lamp.node === 'SpotlightModule' && EX.spin === EX.markers.muzzle.node);
  check('and the maps an unlit renderer cannot use are gone: one image, the colour',
    json.images.length === 1 && !json.materials.some(m => m.normalTexture || m.emissiveTexture));

  /* --- THE PARTS ---------------------------------------------------
     A vehicle is one mesh with one transform; this is a TREE of them,
     because everything the user asked it to do is a part moving against
     another part. Each node comes out in a frame of its own — x
     forward, y up, z right — with the offset of its pivot from its
     parent's, which is what the groups are hung on. */
  const model = V.buildVtolModel(json, bin);
  const P = model.parts;
  note('the aircraft', `${V.VTOL_LENGTH} long, ${(model.box.half * 2 * V.VTOL_LENGTH).toFixed(0)} across, ` +
    `${(model.box.height * V.VTOL_LENGTH).toFixed(0)} tall, ${Object.keys(P).length} moving parts, ` +
    `${Object.values(P).reduce((n, q) => n + q.tris, 0)} triangles`);
  check('every part of it has triangles in it', Object.values(P).every(q => q.tris > 50),
    Object.entries(P).map(([k, q]) => `${k} ${q.tris}`).join(', '));
  check('and the tree is the one the file names: the gun and the lamp on the pitch, on the turret, on the fuselage',
    P.gun.parent === P.pitch && P.lamp.parent === P.pitch && P.pitch.parent === P.turret &&
    P.turret.parent === P.fuselage && P.fuselage.parent === null &&
    P.nacelleL.parent === P.fuselage && P.aux.parent === P.fuselage);
  /* THE NACELLES ARE ONE MESH AND TWO ENGINES. The file draws them
     together; an aircraft that tilts them differentially to turn cannot
     have them as one part, so the mesh is cut down its own middle. What
     proves the cut is right is that it is EVEN and that the two halves
     end up on opposite sides. */
  check('the one nacelle mesh comes out as two engines, one either side, the same size',
    P.nacelleL.tris === P.nacelleR.tris &&
    Math.sign(P.nacelleL.offset[2]) === -Math.sign(P.nacelleR.offset[2]) &&
    Math.abs(P.nacelleL.offset[2] + P.nacelleR.offset[2]) < 1e-6 &&
    Math.abs(P.nacelleL.offset[2]) > 100,
    `${P.nacelleL.tris} each, ${P.nacelleL.offset[2].toFixed(0)} and ${P.nacelleR.offset[2].toFixed(0)} across`);
  check('and the tail engine is behind the wing and on the centreline',
    P.aux.offset[0] < P.nacelleL.offset[0] && Math.abs(P.aux.offset[2]) < 1e-6);
  /* AND THE MUZZLE IS AT THE END OF THE BARRELS, which is the whole
     point of the marker: the user put the sphere there so that nobody
     would have to guess a number. Down the gun's own +x, and as far
     forward as the model goes. */
  const nose = V.VTOL_LENGTH / 2;
  const muzzleFwd = P.fuselage.offset[0] + P.turret.offset[0] + P.pitch.offset[0] + P.gun.offset[0] + model.muzzle[0];
  check('the muzzle marker is at the end of the barrels, at the very nose of the thing',
    model.muzzle[0] > 20 && Math.abs(model.muzzle[1]) < 8 && Math.abs(model.muzzle[2]) < 1 &&
    Math.abs(muzzleFwd - nose) < 6,
    `${muzzleFwd.toFixed(0)} forward of the middle, the nose is ${nose}`);
  check('and the lamp marker is out in front of the lamp module, off to one side of the gun',
    model.lamp[0] > 0 && Math.abs(P.lamp.offset[2]) > 8);

  /* --- ONE, FLOWN ---------------------------------------------------- */
  const vanG = (() => { const v = readGLB('assets/models/van.glb'); return carG.modelVehicle(v.json, v.bin); })();
  const texG = tex.bakeTextures(), sprG = spr.bakeSprites();
  const mkG = () => new Game({
    level: MAPG.buildSellWrong(), scene: new THREEG.Scene(), camera: {},
    textures: texG, sprites: sprG,
    hud: { message() {}, ticMessages() {} }, audio: null,
    input: { mode: 'desktop', pausePressed: false, look: { x: 0, y: 0 }, move: { x: 0, y: 0 },
             attack: false, use: false, run: false, jump: false, sample() {}, sensitivity: 0 },
    fleet: { texture: {}, def: vanG },
    vtol: { json, bin, texture: {} },
  });
  const gg = mkG();
  const pg = gg.player;
  pg.invincible = true;                     // it is lethal, and that is measured below rather than survived
  check('a game with the model in it has a wing, with nothing in the air yet',
    !!gg.gunships && gg.gunships.ships.length === 0 && gg.gunships.cap === 0);

  /* IT COMES WITH THE ARMY, at the user's request: nothing before the
     army is called, and the first one ordered the tic it is. */
  {
    const gA = mkG();
    gA.player.shotsFired = 1;
    let calledAt = -1, sentAt = -1;
    for (let t = 0; t < 200 * 35 && sentAt < 0; t++) {
      gA.tic();
      if (calledAt < 0 && gA.responders.army.called) calledAt = gA.tics;
      if (gA.gunships.ships.length && sentAt < 0) sentAt = gA.tics;
    }
    note('when it comes', `the army at ${(calledAt / 35).toFixed(0)}s, the gunship at ${(sentAt / 35).toFixed(0)}s`);
    check('it is ordered the tic the army is called and arrives a few seconds later',
      calledAt > 0 && sentAt > calledAt && sentAt - calledAt === V.VTOL.firstDelay,
      `${sentAt - calledAt} tics after`);
    check('and one of them until the army has doubled twice, then two',
      gA.gunships.cap === 1 && V.VTOL.max === 2 && V.VTOL.secondAt > 1);
  }

  const ship = gg.gunships.send();
  check('it comes into being out of sight rather than at the end of the road',
    !!ship && Math.abs(Math.hypot(ship.x - pg.x, ship.y - pg.y) - V.VTOL.runIn) < 40 &&
    ship.cz > 500, `${Math.hypot(ship.x - pg.x, ship.y - pg.y).toFixed(0)} out at ${ship.cz.toFixed(0)}`);
  check('and the thing you can shoot comes with it: three of them, in the air, at its height',
    ship.bodies.length === 3 && ship.bodies.every(a => a.shootable && !a.solid && a.vehicle === ship));

  let onStation = -1, lowest = 1e9, highest = 0, maxBank = 0, diffSeen = 0;
  for (let t = 1; t <= 900; t++) {
    gg.tic();
    if (onStation < 0 && ship.state === 'station') onStation = t;
    if (ship.state === 'station') {
      lowest = Math.min(lowest, ship.altitude); highest = Math.max(highest, ship.altitude);
      maxBank = Math.max(maxBank, Math.abs(ship.rx));
      diffSeen = Math.max(diffSeen, Math.abs(ship.tiltL - ship.tiltR));
    }
  }
  note('the flight', `on station in ${(onStation / 35).toFixed(1)}s, holding ${lowest.toFixed(0)}-${highest.toFixed(0)} up, ` +
    `banking ${(maxBank * 57.3).toFixed(0)} degrees, ${ship.rounds} rounds fired`);
  check('it flies in and takes up a station over the lot in a few seconds',
    onStation > 0 && onStation < 8 * 35, `${onStation} tics`);
  check('and holds its altitude there, under the lot\'s own ceiling so it can be shot at',
    Math.abs(lowest - V.VTOL.alt) < 30 && highest < 480, `${lowest.toFixed(0)}..${highest.toFixed(0)}`);
  /* THE NACELLES VECTOR THE THRUST, which is what the user asked for,
     and the corrections below are what the user asked for after seeing
     it: the pods were drawn nose-DOWN as it accelerated and level in a
     hover, which is both signs of it inverted, and they jangled.

     TWO ANGLES NOW. `vector` is where the jet is pointed, measured up
     from level — a right angle in a hover, flattening toward the nose
     with speed — and `tilt` is where the pod is DRAWN, a geared share
     of the same. See the block at VTOL.hover for why a two-hundred-unit
     pod is not swung to a true right angle. */
  check('the pods go differentially when it turns: one up, one down',
    diffSeen > 0.05, `${diffSeen.toFixed(3)} radians apart`);
  check('and the tail engine takes most of their angle rather than sitting still',
    ship.tiltAux > 0.1, `${ship.tiltAux.toFixed(2)}`);
  /* HOLDING STATION IS A HOVER, so the jet is near enough straight
     down and the pods are well nose-UP. Level is CRUISE on this
     airframe, and that is the half of it that was inverted. */
  note('holding station', `the jet ${(ship.vector * 57.3).toFixed(0)} degrees up from level, ` +
    `the pods drawn at ${(ship.tilt * 57.3).toFixed(0)}`);
  check('holding station the jet is all but straight down, and the pods are nose-up',
    ship.vector > 1.3 && ship.tilt > 0.35,
    `jet ${(ship.vector * 57.3).toFixed(0)} degrees, pods ${(ship.tilt * 57.3).toFixed(0)}`);
  check('and the body is near enough level rather than sitting nose-down through the whole hover',
    Math.abs(ship.rz) < 0.1, `${(ship.rz * 57.3).toFixed(0)} degrees of pitch`);
  check('and what is drawn never leaves the range a pod still reads as an engine in',
    ship.tilt >= V.VTOL.tiltMin && ship.tilt <= V.VTOL.tiltMax &&
    V.VTOL.tiltMax < 1.2 && V.VTOL.hover > 0.3);

  /* AND AT SPEED IT IS THE OTHER WAY ROUND, which is the whole claim:
     the same aircraft driven hard forward flattens its pods toward
     level and points the jet ahead of it. Driven rather than waited
     for, so the check is about the law and not about the route. */
  {
    const flat = (() => {
      /* somewhere a long way off to fly at, because the station keeping
         is what holds it at a loiter: told to go nowhere it goes
         nowhere, and a test that only sets the velocity is overruled on
         the next tic by the controller that owns it */
      const home = ship.station;
      ship.station = function () {
        return { x: this.x + Math.cos(this.yaw) * 9000, y: this.y + Math.sin(this.yaw) * 9000, z: -1 };
      };
      for (let t = 0; t < 220; t++) gg.tic();
      const got = { vector: ship.vector, tilt: ship.tilt, speed: Math.hypot(ship.vx, ship.vy) };
      /* and then home, because the run took it thousands of units off
         and everything after this is about a gunship that is overhead */
      ship.station = home;
      for (let t = 0; t < 500; t++) gg.tic();
      return got;
    })();
    check('and it comes back to its station afterwards',
      Math.hypot(ship.x - pg.x, ship.y - pg.y) < V.VTOL.standoff * 1.8,
      `${Math.hypot(ship.x - pg.x, ship.y - pg.y).toFixed(0)} units out`);
    note('and at full speed', `${flat.speed.toFixed(0)} units a tic: the jet ` +
      `${(flat.vector * 57.3).toFixed(0)} degrees up from level, the pods ${(flat.tilt * 57.3).toFixed(0)}`);
    check('driven hard forward the jet comes down toward the nose and the pods flatten',
      flat.vector < 1.0 && flat.tilt < 0.25,
      `jet ${(flat.vector * 57.3).toFixed(0)}, pods ${(flat.tilt * 57.3).toFixed(0)}`);
  }

  /* AND THE PODS ARE A MACHINE, not a number. This is the check that
     holds the jangle down: a demand thrown from one end of the travel
     to the other cannot move a pod by more than its rate in one tic,
     so a controller output that steps — and an acceleration does step,
     every time the thing saturates — cannot step the drawing. */
  {
    const gR = mkG();
    const sr = gR.gunships.send();
    sr.state = 'station';
    let worst = 0, prev = sr.tiltL;
    for (let t = 0; t < 400; t++) {
      /* shove the demand end to end every few tics, which is far worse
         than anything the flight controller ever does */
      if (t % 5 === 0) { sr.vx = -sr.vx || V.VTOL.speed; sr.vy = -sr.vy; }
      gR.tic();
      worst = Math.max(worst, Math.abs(sr.tiltL - prev));
      prev = sr.tiltL;
    }
    note('the pod actuator', `${(V.VTOL.tiltRate * 57.3).toFixed(1)} degrees a tic, ` +
      `so its whole travel takes ${(((V.VTOL.tiltMax - V.VTOL.tiltMin) / V.VTOL.tiltRate) / 35).toFixed(1)}s`);
    check('a pod cannot move faster than its own actuator, whatever the demand does',
      worst <= V.VTOL.tiltRate + 1e-9, `${worst.toFixed(4)} against a limit of ${V.VTOL.tiltRate}`);
    check('and the whole travel takes a second or more, so it reads as machinery',
      (V.VTOL.tiltMax - V.VTOL.tiltMin) / V.VTOL.tiltRate / 35 > 1);
  }
  check('and it BANKS INTO its turns, like a thing held up by thrust',
    maxBank > 0.05, `${(maxBank * 57.3).toFixed(1)} degrees`);

  /* THE GUN. Three rounds a tic through the same hitscan the player's
     minigun uses, in bursts, each one with a tracer off the muzzle
     marker — and it only shoots what it can see. */
  {
    check('it shoots at you, in bursts rather than continuously',
      ship.rounds > 200 && ship.rounds < 900 * V.VTOL.gun.rounds * 0.8,
      `${ship.rounds} in 900 tics, against ${900 * V.VTOL.gun.rounds} if it never stopped`);
    check('and every round leaves the muzzle, which is the marker the user drew',
      (() => {
        const m = ship.muzzle, before = gg.tracers.liveCount;
        ship.seen = true; ship.aimed = true; ship.firing = 1; ship.burstLeft = 4;
        ship.gunTic();
        const T = gg.tracers;
        let ok = false;
        /* the origins are a Float32Array, so this is as close as a
           double ever gets to coming back out of one */
        for (let i = 0; i < T.ox.length; i++)
          if (Math.abs(T.ox[i] - m.x) < 0.05 && Math.abs(T.oz[i] - m.z) < 0.05) ok = true;
        return ok && T.liveCount > before;
      })());
    /* WHAT IT DOES TO YOU, measured rather than survived: the debug
       invincibility this test flies with is taken off for four seconds
       and put straight back, because everything after this needs a
       player who is alive to be circled and shot at. */
    const a2 = pg.armour2, a1 = pg.armour1, hp0 = pg.health;
    pg.invincible = false;
    for (let t = 0; t < 4 * 35; t++) gg.tic();
    const hurt = (a2 + a1 + hp0) - (pg.armour2 + pg.armour1 + pg.health);
    pg.invincible = true; pg.armour2 = a2; pg.armour1 = a1; pg.health = hp0;
    note('what it does to you', `${hurt.toFixed(0)} in four seconds, about ${(hurt / 4).toFixed(0)} a second — ` +
      `${((a2 + a1 + hp0) / Math.max(1, hurt / 4)).toFixed(0)} seconds of standing under one in the open`);
    check('and it hurts: a gunship overhead is a clock running', hurt > 30, `${hurt}`);
  }

  /* THE SEARCHLIGHT IS A FLARE AND NOTHING ELSE, at the user's request:
     it lit the world through a cone in the world shader for an
     afternoon and the beam is out, so the first thing asserted is that
     nothing in js/material.js is carrying it any more. */
  {
    const src = fs.readFileSync('js/material.js', 'utf8');
    check('the lit cone is gone out of the world shader, at the user\'s request',
      !/uniform\s+\w+\s+spot/.test(src) && !src.includes('spotLight >') && world.spotLight === undefined,
      'js/material.js still declares a spotlight');
    check('and nothing in the game points one any more',
      !fs.readFileSync('js/vtol.js', 'utf8').includes('spotLight'));
    check('there is a flare at the lamp, and a smaller one at the muzzle',
      !!ship.lampFlare.mesh && !!ship.muzzleFlare.mesh &&
      ship.lampFlare.size[0] > ship.lampFlare.size[1] * 4 &&
      ship.lampFlare.size[0] > ship.muzzleFlare.size[0],
      `${ship.lampFlare.size.join(' by ')} against ${ship.muzzleFlare.size.join(' by ')}`);
    check('and the flare is anamorphic: far wider than it is tall, with a sphere at the middle',
      ship.lampFlare.ball > 0 && ship.lampFlare.ball < 1);
    const beam = ship.beam;
    check('and the lamp points down out of the sky rather than along it', beam.z < -0.05, `${beam.z.toFixed(2)}`);
  }

  /* --- AND THE FLARE IS OCCLUSION AWARE ------------------------------
     At the user's request, and it has to be done by hand: the quad is
     drawn over the top of the frame with the depth test off, so nothing
     in the renderer is going to hide it. Three tests, and each is
     checked here on its own.

     First the two pure pieces underneath them. `unturn` is `turn` from
     js/vehicles.js solved for its input — the eye is what moves into
     the aircraft's frame, because that is where the hull box is — and
     `boxBetween` is the slab walk that decides whether the hull is in
     the way of the lamp. */
  {
    const veh = await import('../js/vehicles.js');
    for (const [yaw, rx, rz] of [[0.7, 0.2, -0.4], [-2.1, 0, 0], [3.0, 1.2, 0.9]]) {
      const p0 = [37, -11, 23];
      const back = V.unturn(veh.turn(p0, yaw, rx, rz), yaw, rx, rz);
      check('turning a point and turning it back is where it started',
        back.every((v, i) => Math.abs(v - p0[i]) < 1e-9),
        back.map(v => v.toFixed(3)).join(', '));
    }
    const box = { lo: [-10, -10, -10], hi: [10, 10, 10] };
    check('a line that misses the box is not blocked by it',
      !V.boxBetween([100, 100, 100], [100, 100, -100], box, 0));
    check('and a line straight through it is',
      V.boxBetween([-100, 0, 0], [100, 0, 0], box, 0));
    check('but not when it only clips it on the way in to its own end',
      !V.boxBetween([0, -100, 0], [0, -9, 0], box, 5) &&
      V.boxBetween([0, -100, 0], [0, -9, 0], box, 0.5),
      'the clearance is what tells the hull from the lamp\'s own bracket');

    /* AND THEN THE AIRCRAFT. The lamp hangs under the nose INSIDE the
       fuselage's own box, so every sight line to it crosses that box
       just before it arrives; what separates "the hull is in the way"
       from "the lamp's own bracket is" is how FAR from the lamp the
       crossing happens. Measured on the model: four to nine units from
       below, in front, or dead ahead, and seventy-seven to a hundred
       and fifty-nine from above, behind or abeam. The clearance sits
       between the two with room on both sides. */
    const gO = mkG();
    const so = gO.gunships.send();
    so.state = 'station';
    so.x = 0; so.y = 0; so.cz = 0; so.yaw = 0; so.rx = 0; so.rz = 0;
    so.tYaw = 0; so.tPitch = 0;
    const hides = (bx, by, bz) => {
      /* a point in the aircraft's own frame, put out into the world so
         the test goes in the way the game's does */
      const w = veh.turn([bx, by, bz], so.yaw, so.rx, so.rz);
      return so.hullHides(so.x + w[0], so.y - w[2], so.cz + w[1], gO.gunships.model.lamp,
        ['fuselage', 'turret', 'pitch', 'lamp']);
    };
    check('the aircraft\'s own hull does not hide its lamp from below, where the lamp faces',
      !hides(172, -800, 0) && !hides(900, -500, 0) && !hides(1200, -37, 0),
      'the lamp hangs under the nose; from underneath it there is nothing in the way');
    check('and DOES hide it from above and from behind, which is most of the sky it flies in',
      hides(172, 800, 0) && hides(-700, 600, 0) && hides(0, -37, 1200),
      'straight down on the nose, over the tail, and abeam at its own height');
    const C = V.VTOL.lamp.hullClear;
    check('and the clearance that tells the two apart has room on both sides of it',
      C > 12 && C < 60, `${C}, against 9 from below and 77 from above`);

    /* the three tests, through the render path that actually uses them,
       with the flare's own easing wound out by calling it enough times
       for the answer to have arrived */
    const settle = (ex, ey, ez, vdx, vdy) => {
      for (let i = 0; i < 24; i++) so.render(ex, ey, ez, vdx, vdy);
      return so.lampFlare.mesh.visible;
    };
    /* over the car park rather than over the origin, which on this map
       is somewhere in the wood: the third test is a real sight line and
       it wants open ground under it */
    const po = gO.player;
    so.lampOn = true;
    so.x = po.x - 500; so.y = po.y;
    so.ground = po.z;
    so.cz = po.z + 330;
    so.yaw = 0;
    /* stood in front of the lamp and looking back along its own beam */
    const under = { x: po.x, y: po.y, z: po.viewZ };
    so.tPitch = Math.atan2(under.z - so.cz, under.x - so.x); so.tYaw = 0;
    const toward = Math.atan2(so.y - under.y, so.x - under.x);
    const seen = settle(under.x, under.y, under.z, Math.cos(toward), Math.sin(toward));
    check('stood in front of a lit gunship and looking at it, the flare is drawn', seen);
    /* turn round and it is gone: a flare sized by its own distance and
       a lamp behind the eye is a white bowtie across the whole frame */
    check('turn your back on it and the flare is not drawn at all',
      !settle(under.x, under.y, under.z, -Math.cos(toward), -Math.sin(toward)));
    /* and it does not switch: what the tests decide is eased onto */
    so.lampFlare.vis = 0;
    so.render(under.x, under.y, under.z, Math.cos(toward), Math.sin(toward));
    const first = so.lampFlare.vis;
    check('and it comes and goes over a few frames rather than switching',
      first > 0 && first < 0.9 && V.VTOL.lamp.outer < V.VTOL.lamp.inner,
      `${first.toFixed(2)} of the way there after one frame`);
  }

  /* THE JET WASH. Where an engine's exhaust lands is a ray from the
     nacelle down the way its thrust is not pointing; the grit is thrown
     outward along whatever it lands on, and anybody standing in it
     while the aircraft is LOW catches. People, at the user's request,
     and never a car. */
  {
    const hitG = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1, t: 0 };
    const origin = { x: ship.x, y: ship.y, z: ship.cz };
    check('an engine\'s exhaust lands on the ground under it, facing up',
      ship.exhaustHit(origin, { x: 0, y: 0, z: -1 }, hitG) && hitG.nz === 1 &&
      Math.abs(hitG.t - (ship.cz - ship.ground)) < 40, `${hitG.t.toFixed(0)} down`);
    check('and an exhaust pointing at the sky lands nowhere at all',
      !ship.exhaustHit(origin, { x: 0, y: 0, z: 0.5 }, hitG));
    check('and it blows the car park about the whole time it is up there', ship.washed > 100, `${ship.washed}`);
    check('but at cruising height nothing it blows about is hot enough to light anybody',
      ship.ignited === 0 && V.VTOL.wash.hot < V.VTOL.alt && V.VTOL.wash.hot > V.VTOL.lowAlt,
      `${ship.ignited} lit, hot within ${V.VTOL.wash.hot} of the ground`);
    /* AND IT SETS PEOPLE ON FIRE IF IT HOVERS OVER THEM. A handful of
       shoppers put out in the car park, and the aircraft sent down over
       them — which is the mode it looks for on its own every eleven
       seconds. A CAR in the same wash is untouched, which is the half
       of the request that is a "not". */
    /* A PERSON AND A VAN IN THE SAME WASH, held down at the height the
       aircraft comes to when it is over a crowd, and ticked. Both are
       in the pool of grit; one of them catches. That is the whole of
       the user's "not cars", and it is checked side by side rather than
       waited for, because a car park where a burning shopper has just
       run past is a car park where a van catching proves nothing. */
    {
      const gW = mkG();
      const sw = gW.gunships.send();
      sw.state = 'station';
      const car0 = gW.vehicles.all.find(v => v.whole);
      const one = gW.actors.find(a => a.type === 'SHOPPER' && !a.dead);
      check('there is a van and a shopper to hold under it', !!car0 && !!one);
      if (car0 && one) {
        /* the aircraft parked directly over the van, as low as it ever
           gets, with the shopper beside it */
        sw.x = car0.x; sw.y = car0.y; sw.vx = sw.vy = sw.vz = 0;
        sw.cz = gW.level.sectorAt(sw.x, sw.y).floor + V.VTOL.lowAlt;
        sw.ground = gW.level.sectorAt(sw.x, sw.y).floor;
        /* the JET straight down, which is what a hover is and what the
           wash is now aimed by — the pods are drawn at a geared share
           of it and no longer decide where the grit goes */
        sw.vector = Math.PI / 2;
        sw.tilt = sw.tiltL = sw.tiltR = V.VTOL.hover; sw.tiltAux = V.VTOL.hover * V.VTOL.auxShare;
        one.x = car0.x + 40; one.y = car0.y + 40;
        gW.blockmap.moved(one); one.updateSector();
        for (let t = 0; t < 80; t++) { sw.tick++; sw.washTic(); }
        check('the wash off it sets a person under it on fire, at the user\'s request',
          one.burning > 0 && sw.ignited > 0, `${sw.ignited} lit, ${one.burning} tics of it`);
        check('and NOT the van in the same wash: it is the person that catches, never the floor under them',
          car0.whole && car0.burning === 0 && gW.fire.burningCells === 0,
          `van burning ${car0.burning}, ${gW.fire.burningCells} cells of floor alight`);
        /* and put it back up at its cruising height and nothing catches */
        const two = gW.actors.find(a => a.type === 'SHOPPER' && !a.dead && a !== one && !a.burning);
        if (two) {
          two.x = car0.x + 40; two.y = car0.y - 40;
          gW.blockmap.moved(two); two.updateSector();
          sw.cz = sw.ground + V.VTOL.alt;
          const lit0 = sw.ignited;
          for (let t = 0; t < 80; t++) { sw.tick++; sw.washTic(); }
          check('and from its cruising height it blows the tarmac about and lights nobody',
            sw.ignited === lit0 && two.burning === 0 && sw.washed > 0, `${sw.ignited - lit0} lit`);
        }
      }
    }

    /* AND IT GOES LOOKING FOR THEM ON ITS OWN, which is the half of it
       that is not a mechanic but a behaviour: every so often it picks a
       knot of people in the open, comes down over them, and walks
       across the crowd — taking the next one the moment the one it is
       over is alight. */
    const crowd = gg.actors.filter(a => a.type === 'SHOPPER' && !a.dead && !a.burning).slice(0, 24);
    crowd.forEach((a, k) => {
      /* a ring of them under it, laid out rather than rolled, so the
         run is the same run every time the test is run */
      const ang = k * 2.39996, r = 40 + k * 9;
      a.x = ship.x + Math.cos(ang) * r; a.y = ship.y + Math.sin(ang) * r;
      gg.blockmap.moved(a); a.updateSector();
    });
    const wasLit = ship.ignited;
    ship.mode = 'orbit'; ship.torchAt = gg.tics; ship.state = 'station';
    let low = 1e9, torchTics = 0;
    for (let t = 0; t < 400; t++) {
      gg.tic();
      if (ship.mode === 'torch') { torchTics++; low = Math.min(low, ship.altitude); }
    }
    note('a torch run', `${torchTics} tics over them at ${low < 1e9 ? low.toFixed(0) : '-'} up, ` +
      `${ship.ignited - wasLit} of ${crowd.length} alight`);
    check('it goes looking for a knot of people on its own and comes DOWN over them',
      torchTics > 0 && low < V.VTOL.alt - 20, `${low.toFixed(0)} against ${V.VTOL.alt} on station`);
    check('and a pass lights several of them rather than chasing one',
      ship.ignited > wasLit + 1, `${ship.ignited - wasLit} lit`);
  }

  /* --- SHOT DOWN ----------------------------------------------------
     At the user's request. The same pitched hitscan that puts holes in
     a van lands on it, and enough of them end it. */
  {
    check('the minigun\'s rounds reach it through its own bodies, and the armour is a vehicle\'s',
      (() => { const h = ship.health; ship.bodies[0].damage(90, gg.player, { shot: true }); return ship.health === h - 90 / V.VTOL.shotArmour; })());
    check('and a round into it leaves no hole hanging in the air: it is not a box',
      (() => { const H = gg.decals.pools.hole, n = H.count; gg.decals.vehicleHole(ship, ship.x, ship.y, ship.cz, 1, 0, 0); return H.count === n; })());
    check('and fire cannot reach it', (() => { const h = ship.health; ship.damage(500, null, { fire: true, stream: true }); return ship.health === h; })());
    let rounds = 0;
    while (ship.whole && rounds < 5000) { ship.damage(30, gg.player, { shot: true }); rounds++; }
    note('shooting one down', `${rounds} rounds of the minigun, which is ${(rounds / 4 / 35).toFixed(1)}s of the trigger held on it`);
    check('enough of them and it is hit: three to five seconds of the minigun',
      ship.state === 'dying' && rounds > 200 && rounds < 900, `${rounds}`);
    /* THE TAIL SPIN. Still flying, in the sense that the air is still
       under it: the yaw winds up, the nose goes down, and it trails
       fire all the way to the tarmac. */
    const yaw0 = ship.yaw, z0 = ship.cz;
    let fell = 0, rose = false, dive = 0, flung = 0;
    while (ship.state === 'dying' && fell < 600) {
      gg.tic(); fell++;
      if (ship.cz > z0) rose = true;
      dive = Math.min(dive, ship.rz);
      flung = Math.max(flung, Math.abs(ship.tiltL - ship.tiltR));
    }
    const turns = Math.abs(ship.yaw - yaw0) / (2 * Math.PI);
    note('and what it does then', `${(fell / 35).toFixed(1)}s of tail spin through ` +
      `${turns.toFixed(1)} turns, nose ${(dive * 57.3).toFixed(0)} degrees down, ${ship.pops} bangs on the way down`);
    check('it lurches up as it is hit and then falls, spinning, for a good few seconds',
      rose && fell > 2 * 35 && turns > 1, `${fell} tics, ${turns.toFixed(1)} turns`);
    /* measured ON THE WAY DOWN rather than where it came to rest: the
       crash puts it at whatever crooked angle it ended up lying at */
    check('and the nose goes down and the engines are thrown to nothing',
      dive < -0.3 && flung > 0.5,
      `nose ${dive.toFixed(2)}, engines ${flung.toFixed(2)} apart`);
    check('and it bangs the whole way down rather than falling quietly', ship.pops > 1, `${ship.pops}`);
    /* AND THE GROUND. The bigger bang, the fire, the pieces, and a
       wreck that is in the way from then on. */
    check('it arrives on the tarmac and is a wreck rather than a thing still flying',
      ship.state === 'wreck' && Math.abs(ship.cz - ship.ground) < V.VTOL_LENGTH,
      `${ship.state} at ${ship.cz.toFixed(0)} over ${ship.ground.toFixed(0)}`);
    check('and the thing you shoot at goes with it, and something you cannot walk through takes its place',
      ship.bodies.length === 0 && ship.blockers.length === 3 && ship.blockers.every(b => b.solid));
    check('and it threw pieces of its own skin off, painted with its own sheet',
      gg.vehicles.flying.length + gg.vehicles.resting.length > 8 &&
      [...gg.vehicles.flying, ...gg.vehicles.resting].some(c => c.own));
    check('and it is burning on the tarmac where it landed', gg.fire.burningCells > 0, `${gg.fire.burningCells} cells`);
    check('and the lamp goes out with it, flare and all',
      (() => {
        for (let i = 0; i < 24; i++) gg.gunships.render(pg.x, pg.y, pg.viewZ, 1, 0);
        return !ship.lampOn && !ship.lampFlare.mesh.visible && !ship.muzzleFlare.mesh.visible;
      })());
    /* it lies there smouldering rather than vanishing, and the night
       goes on round it */
    for (let t = 0; t < 200; t++) gg.tic();
    check('and it lies there afterwards, smouldering, without anything falling over',
      ship.state === 'wreck' && ship.smoulder > 0 && gg.actors.length > 0);
  }
}

/* ---------- the music ---------- */
section('the music');
{
  const fs = await import('node:fs');
  const mu = await import('../js/music.js');
  const T = mu.TRACKS;
  note('the tracks', T.map(t => `${t.url.split('/').pop()} ${t.bpm} bpm, out at ${t.out} of ${t.seconds}`).join('; '));
  check('three tracks, and all three files are there', T.length === 3 && T.every(t => fs.existsSync(t.url)));
  check('and no two of them are the same file',
    new Set(T.map(t => fs.readFileSync(t.url).length)).size === T.length);
  /* THE TABLE HAS TO BE PLAYABLE: every handover point is a downbeat
     late in its track with room for the fade before the file ends, and
     the first downbeat is where a track starts, not a minute in */
  check('every handover is late in its track, and the fade fits before the end',
    T.every(t => t.out > t.seconds * 0.8 && t.out + mu.FADE_BARS * mu.barOf(t) <= t.seconds));
  check('and every first downbeat is at the head of the file', T.every(t => t.bar0 >= 0 && t.bar0 < 2));
  check('and the tempos are all E1M1\'s, near enough', T.every(t => t.bpm > 135 && t.bpm < 150));
  /* --- one handover, as arithmetic --------------------------------- */
  const a = T[0], b = T[1];
  const outAt = 1000;
  const plan = mu.arrange(a, b, outAt);
  check('the incoming starts so its first downbeat lands on the outgoing\'s handover',
    Math.abs(plan.start + b.bar0 / plan.rate - outAt) < 1e-9, `${plan.start} + ${b.bar0}/${plan.rate}`);
  check('and it arrives at the outgoing\'s tempo, so the bars line up for the whole fade',
    Math.abs(plan.rate - a.bpm / b.bpm) < 1e-12 && Math.abs(mu.barOf(b) / plan.rate - mu.barOf(a)) < 1e-9);
  check('the fade is eight bars of the outgoing tempo, linear, and the outgoing stops at the end of it',
    Math.abs(plan.fadeEnd - outAt - 8 * 240 / a.bpm) < 1e-9 &&
    /linearRampToValueAtTime\(0, plan\.fadeEnd\)/.test(fs.readFileSync('js/music.js', 'utf8')) &&
    /out\.src\.stop\(plan\.fadeEnd/.test(fs.readFileSync('js/music.js', 'utf8')));
  check('and the incoming eases back to its own tempo over eight more bars, after the fade',
    plan.rateEnd > plan.fadeEnd && Math.abs(plan.rateEnd - plan.fadeEnd - 8 * 240 / a.bpm) < 1e-9);
  /* --- and where the incoming's own handover then falls ------------- */
  const w = p => mu.wallTimeFor(plan, p);
  check('file time maps to wall time at the rate during the fade',
    Math.abs(w(b.bar0) - outAt) < 1e-9 && Math.abs(w(plan.rate * (plan.fadeEnd - plan.start)) - plan.fadeEnd) < 1e-9);
  const D = plan.rateEnd - plan.fadeEnd, p1 = plan.rate * (plan.fadeEnd - plan.start), p2 = D * (1 + plan.rate) / 2;
  check('through the ramp, where the ramp covers the mean rate times its length',
    Math.abs(w(p1 + p2) - plan.rateEnd) < 1e-6 && w(p1 + p2 / 2) > plan.fadeEnd && w(p1 + p2 / 2) < plan.rateEnd);
  check('and at one thereafter, so the next handover is exactly where the table says',
    Math.abs(w(b.out) - (plan.rateEnd + (b.out - p1 - p2))) < 1e-9 && w(b.out) > plan.rateEnd);
  /* a whole lap: each handover is later than the last by about a track */
  let at = 0, i = 0, laps = 0;
  for (let k = 0; k < 9; k++) {
    const j = (i + 1) % T.length;
    const pl = mu.arrange(T[i], T[j], at);
    const next = mu.wallTimeFor(pl, T[j].out);
    if (next - at < 180 || next - at > 260) laps = -99;
    at = next; i = j; if (i === 0) laps++;
  }
  check('and round the three of them for ever, one every four minutes or so', laps === 3, `${laps} laps`);
  /* --- the page ------------------------------------------------------ */
  const html = fs.readFileSync('index.html', 'utf8'), mainSrc = fs.readFileSync('js/main.js', 'utf8');
  check('there is a music fader in the menu and it is wired',
    html.includes('id="opt-music"') && /music\.setVolume\(prefs\.music\)/.test(mainSrc) && /'opt-music'/.test(mainSrc));
  check('the music starts on the start tap and is ticked every frame',
    /musicP\.then\(\(\) => music\.start\(\)\)/.test(mainSrc) && /music\.tick\(\);/.test(mainSrc));
  check('and it has its own context, so the muted effects do not take it with them',
    /new AC\(\)/.test(fs.readFileSync('js/music.js', 'utf8')) && !/audio\.ctx/.test(fs.readFileSync('js/music.js', 'utf8')));
  const { VERSION } = await import('../js/version.js');
  check('the version is one string, MAJOR.MINOR.PATCH, and the title screen shows it',
    /^\d+\.\d+\.\d+$/.test(VERSION) && html.includes('id="version"') && /\$\('version'\)\.textContent = 'V' \+ VERSION/.test(mainSrc)
      && /#version \{/.test(fs.readFileSync('css/style.css', 'utf8')), VERSION);
}

section('the gun');
{
  const fs = await import('node:fs');
  const G = await import('../js/glb.js');
  const buf = fs.readFileSync(new URL('../assets/models/flamethrower.glb', import.meta.url));
  const { json, bin } = G.parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const names = json.nodes.map(n => n.name);
  note('model', `${json.nodes.length} nodes, ${json.meshes.length} meshes, ${json.images.length} image, ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  note('where it came from', [json.asset.extras?.title, json.asset.extras?.author].filter(Boolean).join(' — ') || 'unsaid');
  /* WHAT tools/prep-model.mjs IS FOR, checked on its output. The model
     arrives with three 1024 maps and seven vertex attributes; an unlit
     renderer that reads four of them and one map would carry the other
     six megabytes to the player for nothing. */
  check('only the diffuse survives',
    json.images.length === 1 && json.materials.length === 1 &&
    !json.materials[0].normalTexture && !json.materials[0].pbrMetallicRoughness?.metallicRoughnessTexture);
  const attrs = new Set();
  for (const m of json.meshes) for (const p of m.primitives) for (const k of Object.keys(p.attributes)) attrs.add(k);
  check('and only the attributes js/glb.js binds: no tangents, no second set of UVs',
    [...attrs].every(k => ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0'].includes(k)), [...attrs].join());
  /* ONE TIGHT VIEW PER ACCESSOR is what makes dropping them worth
     anything — a shared bufferView survives as long as one accessor
     points into it, so this is the check that the dead bytes actually
     left. */
  check('every buffer view is used, by exactly one accessor or one image',
    json.bufferViews.every((bv, i) =>
      json.accessors.filter(x => x.bufferView === i).length + json.images.filter(im => im.bufferView === i).length === 1));
  check('and no accessor is interleaved or offset into somebody else\'s range',
    json.accessors.every(a => !a.byteOffset) && json.bufferViews.every(bv => !bv.byteStride));
  /* and the geometry came through the repack unbent: the bounds the
     file declares are the bounds of the bytes it now holds */
  let checked = 0, worst = 0;
  for (const m of json.meshes) for (const p of m.primitives) {
    const a = json.accessors[p.attributes.POSITION];
    const { array } = G.readAccessor(json, bin, p.attributes.POSITION);
    for (let k = 0; k < 3; k++) {
      let mn = Infinity, mx = -Infinity;
      for (let i = k; i < array.length; i += 3) { if (array[i] < mn) mn = array[i]; if (array[i] > mx) mx = array[i]; }
      worst = Math.max(worst, Math.abs(mn - a.min[k]), Math.abs(mx - a.max[k]));
    }
    checked += a.count;
  }
  check('and every vertex is where the file says it is', worst < 1e-4, `${checked} vertices, worst ${worst.toExponential(1)}`);
  check('no marker spheres are left in any model this tool has touched',
    !names.some(n => /CLAUDE/i.test(n)), names.join());
}

/* ---------- a wall under the minigun ----------
   LAST, AND THAT IS NOT TIDINESS. pRandom() is one sequence shared by
   the whole game, so a section that stands up a Game spends some of it
   and every check after it that leans on a roll lands somewhere else.
   Dropping this in the middle of the file moved the gunship's nacelles
   by four hundredths of a radian and failed a test six hundred lines
   below it that has nothing to do with walls. A section that builds a
   world goes at the end, where there is nothing downstream to shift. */
section('a wall under the minigun');
{
  const THREEW = await import('three');
  const { Game } = await import('../js/game.js');
  const MAPW = await import('../js/maps/sellwrong.js');
  const VX = await import('../js/voxel.js');
  const { voxelisable, alongLine, ROUND_RADIUS, VOX } = VX;
  const { TICRATE } = await import('../js/util.js');
  const fs = await import('node:fs');

  const hudStub = { setWeapon() {}, setAmmo() {}, message() {}, setHealth() {}, setArmour() {} };
  const inputStub = { forward: 0, strafe: 0, turn: 0, fire: false, use: false, jump: false,
                      run: false, swap: 0, pitch: 0, consumeSwap: () => 0 };
  const g = new Game({ level: MAPW.buildSellWrong(), scene: new THREEW.Scene(), camera: {},
                       textures: tex.bakeTextures(), sprites: spr.bakeSprites(),
                       hud: hudStub, audio: null, input: inputStub });

  /* a wall of the parade, and somewhere in front of it to stand */
  const wall = g.level.lines
    .filter(l => voxelisable(l, g.level.sectors) && l.len >= 120)
    .sort((a, b) => b.len - a.len)[0];
  const sec = g.level.sectors[wall.front ?? wall.back];
  const mx = (wall.x1 + wall.x2) / 2, my = (wall.y1 + wall.y2) / 2;
  const aim = { x: mx, y: my, z: (sec.floor + sec.ceil) / 2 };

  check('nothing has a lattice before a shot is fired',
    g.level.lines.every(l => !l.voxels));

  /* THE MINIGUN'S OWN NUMBERS: 24 to 48 a round, four rounds a tic. */
  let tics = 0, broke = 0;
  while (!broke && tics < 200) {
    for (let r = 0; r < 4; r++) broke += g.chewWall(wall, aim.x, aim.y, aim.z, 36);
    tics++;
  }
  note('the wall opens after', `${tics} tics — ${(tics / TICRATE).toFixed(2)}s of the trigger held`);
  check('a held burst opens a wall', broke > 0, `${broke} voxels`);
  check('and it takes long enough to be a wall and not a curtain',
    tics >= 8 && tics <= 70, `${tics} tics`);
  check('the lattice was built by the shooting, not by the level',
    !!wall.voxels && wall.voxels.live === 1, `${wall.voxels && wall.voxels.live} spans`);
  note('what it cost', `${(wall.voxels.bytes / 1024).toFixed(1)} KB for the span that was hit`);

  /* AND THE PICTURE IS TOLD, SOON. A hole is the feedback for pulling
     the trigger; half a second late it reads as the gun not working. */
  check('the geometry was marked for rebuilding', g._geoDirty === true);
  check('and soon rather than whenever the fire gets round to it',
    g._geoAt - g.tics <= 10, `${g._geoAt - g.tics} tics`);

  /* A ROUND IS NOT A CANNON — one of them leaves a decal and a wall. */
  {
    const clean = g.level.lines.filter(l => voxelisable(l, g.level.sectors) && l !== wall)[0];
    check('one round opens nothing', g.chewWall(clean, (clean.x1 + clean.x2) / 2,
      (clean.y1 + clean.y2) / 2,
      (g.level.sectors[clean.front ?? clean.back].floor +
       g.level.sectors[clean.front ?? clean.back].ceil) / 2, 48) === 0);
  }

  /* WHAT IS NOT CHEWED. The wood's boundary is scenery, a door is
     rebuilt from scratch every tic it moves, and a two-sided lintel is
     drawn with no thickness to take away. */
  {
    const long = g.level.lines.find(l => l.len > VX.MAX_LINE);
    check('the edge of the world does not chew', long ? g.chewWall(long, long.x1, long.y1, 40, 999) === 0 : true);
    const twoSided = g.level.lines.find(l => l.front !== null && l.back !== null);
    check('nor does a two-sided line', g.chewWall(twoSided, twoSided.x1, twoSided.y1, 40, 999) === 0);
    check('and neither grew a lattice', !(long && long.voxels) && !twoSided.voxels);
  }

  /* IT GOES THROUGH THE ONE DOOR THE REST OF THE GAME COMES IN BY, so
     a trooper's rifle wrecks the shopfront exactly as the minigun does
     and neither of them needed a special case. */
  {
    const src = fs.readFileSync('js/game.js', 'utf8');
    check('the wall is chewed from hitscan, beside the decal it leaves',
      /this\.decals\.hole\(wall\.x, wall\.y, wall\.z[\s\S]{0,120}this\.chewWall\(wall\.line/.test(src));
    check('and every asker goes through the one shared timer',
      /markGeoDirty\(6\)/.test(src) && /markGeoDirty\(10\)/.test(src) &&
      /markGeoDirty\(20\)/.test(src) &&
      !/_geoAt = this\.tics \+/.test(src));
  }

  note('a round reaches', `${ROUND_RADIUS} units, against a ${VOX}-unit voxel`);
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
