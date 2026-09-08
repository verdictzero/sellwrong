/* =====================================================================
   SELLWRONG — the sprites somebody drew
   =====================================================================

   Everything else the game draws it draws itself, from ramps and noise,
   at start-up. The staff do not: they are Freedoom's player sprite with
   a smiley face painted over the visor and a blue SellWrong apron
   painted onto the armour, and they live in assets/sprites/employee as
   PNGs with tools/build_employee.sh to regenerate them.

   They are loaded rather than embedded, and that is a deliberate
   difference from the logo and the weapon. Those two are baked into
   source because they are single small images that will never change
   again. A hundred and two sprite frames that somebody is still
   iterating on want to stay as files: change the apron, re-run the
   build script, reload the page. Turning them into a wall of base64
   would cost that.

   WHAT DOOM'S FILENAMES MEAN, since the whole loader is built on it:

     PLAYA1      sprite PLAY, frame A, rotation 1 — the front view
     PLAYA2A8    the same picture serves rotation 2 and rotation 8,
                   with 8 MIRRORED, because a person is symmetrical
                   enough and it halves the artist's work
     PLAYH0      rotation 0: one picture, seen the same from everywhere,
                   which is what a corpse on the floor is

   Rotation 1 is the front, and this engine's view 0 is also the front —
   `rot` in Actor.render is 0 when the thing is facing the camera — so
   Doom rotation N is view N-1 and there is nothing else to reconcile.

   EVERY VIEW OF A SPRITE GETS THE SAME CANVAS. Doom stored a per-patch
   offset with every frame so that the feet line up when the widths do
   not; these PNGs have no offsets, so instead each frame is padded into
   one canvas the size of the widest and tallest in the set, centred
   across and sitting on the bottom. Without that a walk cycle whose
   frames are 26, 29 and 36 across slides sideways as it plays, and a
   death frame twenty pixels tall floats at the height of a standing man.
   ===================================================================== */

import { Pix } from './pixel.js';

/* The frames that have eight rotations, and the ones that are the same
   from every angle. This is Doom's own layout for a player: walk, two
   for the attack, one for pain, seven for dying and nine for coming
   apart. */
export const DOOM_ROTATED = 'ABCDEFG';
export const DOOM_FLAT    = 'HIJKLMNOPQRSTUVW';

/**
 * Every file one sprite set is made of, and what each is for.
 *
 * Returns [{ file, letter, views: [[index, mirrored], ...] }], which is
 * everything the loader needs to know without a manifest to keep in step
 * with the directory.
 */
export function frameFiles(sprite) {
  const out = [];
  for (const letter of DOOM_ROTATED) {
    /* 1 and 5 face you and face away, so they are nobody's mirror. */
    out.push({ file: `${sprite}${letter}1`, letter, views: [[0, false]] });
    out.push({ file: `${sprite}${letter}2${letter}8`, letter, views: [[1, false], [7, true]] });
    out.push({ file: `${sprite}${letter}3${letter}7`, letter, views: [[2, false], [6, true]] });
    out.push({ file: `${sprite}${letter}4${letter}6`, letter, views: [[3, false], [5, true]] });
    out.push({ file: `${sprite}${letter}5`, letter, views: [[4, false]] });
  }
  for (const letter of DOOM_FLAT)
    out.push({ file: `${sprite}${letter}0`, letter, views: [[0, true], [1, true], [2, true],
                                                           [3, true], [4, true], [5, true],
                                                           [6, true], [7, true]].map(([i]) => [i, false]) });
  return out;
}

/** One decoded image into a Pix, optionally mirrored, placed in a canvas
 *  of (w, h): centred across, standing on the bottom. */
function place(img, w, h, mirror) {
  const p = new Pix(w, h, 1, false);
  p.clear();
  const ox = Math.round((w - img.w) / 2), oy = h - img.h;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + (mirror ? img.w - 1 - x : x)) * 4;
      if (img.data[s + 3] < 8) continue;
      p.set(ox + x, oy + y, img.data[s], img.data[s + 1], img.data[s + 2], img.data[s + 3]);
    }
  }
  return p;
}

/**
 * Load one Doom-style sprite set into a bank, under a name of your
 * choosing — so the same pictures can be the Associate standing up and
 * the Stocker bent over a pallet.
 *
 * `decode(name)` returns { w, h, data } for a frame, and is injected
 * because the two places this runs decode a PNG completely differently:
 * a browser hands it to the platform, and the test harness reads it off
 * disk. Neither belongs in here.
 *
 * Returns the number of frames installed, or 0 if the art is not there —
 * in which case the caller keeps whatever was in the bank already, and
 * the game runs on the drawn-by-code placeholders it has always had.
 */
export async function loadDoomSprites(bank, { sprite, as, decode }) {
  const files = frameFiles(sprite);
  let images;
  try {
    images = await Promise.all(files.map(f => decode(f.file)));
  } catch (e) {
    console.warn(`sprite set ${sprite} did not load, keeping the placeholders:`, e.message);
    return 0;
  }

  /* one canvas for the whole set — see the note at the top */
  let W = 0, H = 0;
  for (const im of images) { if (im.w > W) W = im.w; if (im.h > H) H = im.h; }

  const byLetter = new Map();
  files.forEach((f, i) => {
    let views = byLetter.get(f.letter);
    if (!views) byLetter.set(f.letter, views = new Array(8).fill(null));
    for (const [index, mirrored] of f.views) views[index] = place(images[i], W, H, mirrored);
  });

  let n = 0;
  for (const [letter, views] of byLetter) {
    /* A hole here would render as the missing-sprite placeholder in the
       middle of a fight, once, and never again — so fill from the front
       view rather than shipping a gap. */
    for (let i = 0; i < 8; i++) if (!views[i]) views[i] = views[0];
    bank.addFrame(as, letter, views, { w: W, h: H });
    n++;
  }
  return n;
}

/** A decoder for a browser: the platform already has one. */
/* A horizontal strip of equal cells — the fire from assets/fire — cut
   into frames and given to the bank as one set, lettered A onward. Each
   frame is the same from every side, like every other fire here. */
export const STRIP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function stripFrames(img, cell) {
  const n = Math.floor(img.w / cell);
  const out = [];
  for (let f = 0; f < n; f++) {
    const p = new Pix(cell, img.h, 1, false);
    p.clear();
    for (let y = 0; y < img.h; y++)
      for (let x = 0; x < cell; x++) {
        const s = (y * img.w + f * cell + x) * 4;
        if (img.data[s + 3] < 8) continue;
        p.set(x, y, img.data[s], img.data[s + 1], img.data[s + 2], img.data[s + 3]);
      }
    out.push(p);
  }
  return out;
}
export function addStrip(bank, name, img, cell, opts = {}) {
  const frames = stripFrames(img, cell);
  frames.forEach((p, i) => bank.addFrame(name, STRIP_LETTERS[i], new Array(8).fill(p), opts));
  return frames.length;
}

export function browserDecoder(dir) {
  return async (name) => {
    const img = new Image();
    img.src = `${dir}/${name}.png`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    return { w: d.width, h: d.height, data: d.data };
  };
}
