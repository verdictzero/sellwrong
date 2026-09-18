/* =====================================================================
   GROCERY STORE SIMULATOR — the readout, and the two things that are
   not the readout
   =====================================================================

   THIS FILE IS IN TWO HALVES AND THEY LIVE ON OPPOSITE SIDES OF THE
   PIXEL FILTER, which is the whole point of it and is new. For most of
   this project's life everything here was drawn into the low-resolution
   buffer with the walls, at the same chunky pixel size, and snapped to
   the same two hundred and fifty-six colours. The argument was that a
   crisp modern overlay on a chunky world reads as a filter applied to a
   photograph, and one frame of it undoes what the renderer is doing.

   THAT ARGUMENT IS RIGHT ABOUT THE PICTURE AND WRONG ABOUT THE
   READOUT, at the user's request, and the difference is what the thing
   IS. The gun in your hands is IN the room: it is lit by the room, it
   moves with your step, and a crisp gun over a chunky shop would be a
   cardboard cut-out held up to a photograph. The numbers are not in the
   room. Nothing casts a shadow on them, nothing occludes them, they do
   not move when you move. They are PRINTED ON THE GLASS, and a label on
   the glass is not more honest for being out of focus — it is just
   harder to read. A six-pixel bitmap face, doubled, averaged down onto
   a grid three hundred and twenty pixels wide and then quantised to the
   nearest of 256 colours, is four separate things happening to a word
   whose only job is to be read at a glance.

   SO THE SPLIT IS BY WHAT A THING IS, not by which file it was in:

     THE PICTURE HALF  a three.js scene handed to LofiPipeline as an
                       overlay, drawn into the buffer, filtered, dithered
                       and snapped exactly like the walls. Two things are
                       in it. The WASH — the few frames of gold on a
                       pickup, the red when something hits you — because
                       that is a thing that happens to the photograph and
                       it should be made of the photograph's colours. And
                       the FALLBACK GUN, the flat sprite shown only on
                       the day the 3D model does not arrive, because it
                       is the gun and the gun is in the room.

     THE READOUT HALF  its own 2D canvas over the frame, at the device's
                       own resolution, outside the pipeline entirely. The
                       bars, the weapon's name, the end-of-night card.
                       Real type, real anti-aliasing, real colours, and
                       none of it changes size when the RENDER or PIXELS
                       dials move — which it used to, because it used to
                       be measured in chunky pixels.

   AND THE READOUT HAS ITS OWN BOX OF CRAYONS, which is the other half
   of being decoupled. The art palette is a setting now (stock or earth,
   see js/palette.js) and the display palette is another; a readout
   drawn out of the material ramps would go muddy when the world did,
   for no reason, because the readout is not made of any material. So
   UI below is a fixed set of colours that matches the page's own
   furniture — the menus, the loading bar, the touch buttons — and it is
   the same readout in every box.

   AND THERE IS STILL ALMOST NOTHING IN IT. The status bar is gone and
   stays gone. What is left is the one number the game is about — how
   much of the store has gone — the tank of whatever is in your hands,
   what is left of you once something starts taking it, and the name of
   the weapon in the far corner. No words in the left corner: that was
   asked for, and better type is not a reason to put a plate of numbers
   back.
   ===================================================================== */

import * as THREE from 'three';
import { createHudMaterial } from './material.js';
import { weaponTexture } from './sprites.js';
import { WEAPONS, HEALTH, ARMOUR1, ARMOUR2 } from './player.js';

/* ---------------------------------------------------------------------
   THE READOUT'S COLOURS

   Fixed, and deliberately not from js/palette.js. They are the page's:
   the amber the menus highlight with, the bone the body text is set in,
   the near-black everything sits on. Semantic names rather than ramp
   names, because a bar is a bar and not a material.
   --------------------------------------------------------------------- */
const UI = {
  ink:     'rgba(236, 232, 220, 0.94)',   // type
  inkDim:  'rgba(236, 232, 220, 0.55)',
  rule:    'rgba(232, 195, 74, 0.55)',    // the amber hairline under the name
  track:   'rgba(6, 7, 12, 0.62)',        // what an empty bar is made of
  trackEdge: 'rgba(236, 232, 220, 0.30)', // and its hairline
  shadow:  'rgba(0, 0, 0, 0.62)',
  mark:    'rgba(255, 255, 255, 0.92)',   // the refire pip
  card:    '#e8c34a',                     // the end-of-night card
  burn:    '#e8621a',                     // how much of the store has gone
  full:    '#5fd0e8',                     // a tank with plenty in it
  low:     '#e8c34a',
  empty:   '#e8503c',
  wait:    '#e8503c',                     // and a tank that has latched
  armour2: '#5a8fe8',                     // the outer plate
  armour1: '#a07ae8',                     // the inner one
  health:  '#ece6d2',
};

/* The page's own face. Monospace on purpose: the tracking below places
   every glyph by hand, which is exact in a monospace face and would
   throw away kerning in any other. */
const FACE = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/* HOW BIG THE READOUT IS, from the window and nothing else. Not from
   the buffer, not from the chunky grid — that coupling is the bug this
   file just got rid of. A 720-row window is the unit; it grows a little
   on a big monitor and shrinks a little on a phone in landscape, and it
   is clamped at both ends so it is never a whisper and never a poster. */
function uiScale(cssH) {
  return Math.max(0.78, Math.min(1.7, cssH / 720));
}

/* A ceiling on the readout canvas's backing store, in real pixels
   across. The same 4096 the pipeline's buffer is capped at, and for the
   same reason: every device can hold one, and nothing on this canvas is
   finer than a hairline. */
const MAX_UI = 4096;

/* LETTER-SPACED TEXT, PLACED A GLYPH AT A TIME.
 *
 * ctx.letterSpacing exists, and is recent enough that a browser without
 * it would lay the readout out differently from a browser with it — the
 * fallback for a missing one is "draw the string and hope". Placing each
 * glyph is a few lines, is the same everywhere, and hands back the
 * width, which is what a right-aligned corner needs before it can start
 * drawing. Exact in a monospace face and only a monospace face, which is
 * why FACE above is one: in a proportional face this would throw away
 * every kerning pair. */
function trackedWidth(ctx, str, track) {
  let w = 0;
  for (const ch of str) w += ctx.measureText(ch).width + track;
  return str.length ? w - track : 0;
}
function tracked(ctx, str, x, y, track) {
  let cx = x;
  for (const ch of str) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + track;
  }
}

/* roundRect landed in every engine years apart; a path either way keeps
   the readout identical on whatever a memory stick gets plugged into. */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Hud {
  constructor(game, canvas = null) {
    this.game = game;

    /* ----------------------------------------------------------------
       THE PICTURE HALF — into the buffer, through the filter
       ---------------------------------------------------------------- */
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-160, 160, 100, -100, -100, 100);
    this.width = 320; this.height = 200;      // the CHUNKY grid, for these two
    /* The gun is a model now (js/weapon3d.js); the sprite is kept for
       the day the model does not arrive, and shown only then. */
    this.showWeaponSprite = false;

    const geo = new THREE.PlaneGeometry(1, 1);
    this.weaponMesh = new THREE.Mesh(geo, createHudMaterial(null));
    this.weaponMesh.renderOrder = 1;
    this.weaponMesh.frustumCulled = false;
    this.weaponMesh.visible = false;
    this.scene.add(this.weaponMesh);

    /* the full-screen wash for pickups and for being hit: a thing that
       happens to the photograph, so it is made of the photograph */
    this.tintMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xff0000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.tintMesh.renderOrder = 2;
    this.tintMesh.frustumCulled = false;
    this.scene.add(this.tintMesh);

    /* ----------------------------------------------------------------
       THE READOUT HALF — its own canvas, over the frame, at the
       device's own resolution
       ---------------------------------------------------------------- */
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.cssW = 640; this.cssH = 400;
    this.dpr = 1;
    this.s = 1;
    /* how far in from the right edge the name sits, in CSS pixels: zero
       on a desktop, and on a phone the width of the pause button that
       lives in that corner — main.js works it out on resize */
    this.nameInset = 0;
    this._key = '';
  }

  /** The room the page's own furniture takes in the top right corner,
   *  in CSS pixels, so the name is not drawn under it. */
  setNameInset(px) {
    px = Math.max(0, Math.round(px || 0));
    if (px === this.nameInset) return;
    this.nameInset = px;
    this._key = '';
  }

  /** THE PICTURE HALF'S SIZE, which is still the chunky grid: the wash
   *  covers the frame and the fallback gun is measured against it. */
  resize(w, h) {
    this.width = w; this.height = h;
    this.camera.left = -w / 2; this.camera.right = w / 2;
    this.camera.top = h / 2; this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
  }

  /** THE READOUT'S SIZE, which is the window's, in CSS pixels, with the
   *  canvas backing it at the device's ratio so the type is as sharp as
   *  the screen can make it. */
  resizeUi(cssW, cssH, dpr = 1) {
    this.cssW = Math.max(1, Math.round(cssW));
    this.cssH = Math.max(1, Math.round(cssH));
    /* THE RATIO IS CAPPED TWICE, and both caps are about memory rather
       than about sharpness. Three, because a phone claiming four is a
       phone whose screen cannot show the difference; and again so the
       backing store is never wider than MAX_UI — a full-screen 4K page
       at a ratio of two is a thirty-megapixel canvas for a readout that
       is two bars and a word. */
    this.dpr = Math.max(1, Math.min(3, dpr || 1, MAX_UI / this.cssW));
    this.s = uiScale(this.cssH);
    if (this.canvas) {
      const bw = Math.round(this.cssW * this.dpr), bh = Math.round(this.cssH * this.dpr);
      if (this.canvas.width !== bw || this.canvas.height !== bh) {
        this.canvas.width = bw; this.canvas.height = bh;
      }
      this.canvas.style.width = this.cssW + 'px';
      this.canvas.style.height = this.cssH + 'px';
    }
    this._key = '';
  }

  /* ------------------------------------------------------------------
     ONE BAR

     `lit` is how far along it is filled, 0..1. A modern gauge and not a
     row of coloured pixels: a dark track with a hairline so it has an
     edge on a pale floor as well as on a black one, a fill with a
     little gradient down it so a full bar does not read as a flat
     block, and rounded ends because the track has them.

     AND THE EMPTY END IS THE WHOLE POINT OF THE TRACK. A bar with
     nothing in it has to still be a bar, or the player cannot tell an
     empty tank from a tank that has stopped being on the screen. Under
     the numbers this replaces it never had to: the word FUEL was doing
     that job, and the words are gone.
     ------------------------------------------------------------------ */
  _bar(x, y, w, h, lit, colour) {
    const ctx = this.ctx;
    const r = h / 2;
    ctx.save();
    ctx.shadowColor = UI.shadow;
    ctx.shadowBlur = 6 * this.s;
    ctx.shadowOffsetY = 1 * this.s;
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = UI.track;
    ctx.fill();
    ctx.restore();

    const fill = Math.max(0, Math.min(1, lit)) * w;
    if (fill > 0.5) {
      ctx.save();
      roundRect(ctx, x, y, w, h, r);
      ctx.clip();
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, colour);
      g.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, fill, h);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = g;
      ctx.fillRect(x, y, fill, h);
      ctx.restore();
      /* and a soft bloom off the lit end, so a bar that is going up is
         visibly going up out of the corner of your eye */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.28;
      ctx.shadowColor = colour;
      ctx.shadowBlur = 9 * this.s;
      roundRect(ctx, x, y, fill, h, r);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.restore();
    }

    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.strokeStyle = UI.trackEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* ------------------------------------------------------------------
     THE CORNER, WHICH IS BARS AND NO WORDS

     It used to be four numbers and a running list of notifications —
     STORE 12%, WOOD 0%, LEFT 736, FUEL 100%, and under them whatever
     the game had last said out loud. All of the words are gone, at the
     user's request, and what is left is the gauges that were already
     drawn under them: how much of the store has gone, how much is in
     whatever you are holding, and — only once something has taken some
     off — what is left of you.

     WHICH IS MOSTLY A BET THAT THE PICTURE IS THE READOUT. A bar
     filling with fire says "the shop is going" better than a percentage
     does, because the shop is on fire in front of you and the number
     was competing with it. The one thing a bar cannot say is a COUNT —
     how many are still alive is gone with the text, and it is gone on
     purpose rather than by oversight.
     ------------------------------------------------------------------ */
  _drawBars(p) {
    const g = this.game, s = this.s;
    const M = Math.round(20 * s);
    const BAR = Math.round(8 * s), GAP = Math.round(8 * s);
    const bw = Math.round(Math.min(this.cssW * 0.34, 240 * s));

    const d = p ? WEAPONS[p.weapon] : null;
    const cap = d && d.ammo ? (p.maxAmmo[d.ammo] || 1) : 0;
    const tank = cap ? Math.round(100 * p.ammoFor(p.weapon) / cap) : -1;
    /* AND WHETHER IT WILL FIRE, which since the tanks started latching
       at empty is a different question from how much is in one.
       `refireMark` is the fraction it has to reach before it lights
       again, or 0 when it is not waiting on anything. */
    const mark = p ? (p.refireMark || 0) : 0;
    /* AND THREE MORE BARS, THE MOMENT SOMETHING HURTS YOU. There was no
       health on the screen because nothing could take any off; the SWAT
       can (see js/responders.js), so from the first bullet that lands
       there are bars for it — and not before, because a full bar that
       never moves is the plate of numbers this corner got rid of.
       Stacked in the order they are spent: the outer plate, the inner
       plate, and then you. */
    const a2 = p ? Math.max(0, Math.round(p.armour2)) : ARMOUR2;
    const a1 = p ? Math.max(0, Math.round(p.armour1)) : ARMOUR1;
    const hp = p ? Math.max(0, Math.round(p.health)) : HEALTH;
    const hurt = p ? (a2 < ARMOUR2 || a1 < ARMOUR1 || hp < HEALTH || p.dead) : false;

    let y = M;
    /* how much of the store has gone */
    this._bar(M, y, bw, BAR, g.burnPercent / 100, UI.burn);
    y += BAR + GAP;
    if (tank >= 0) {
      /* WAITING READS DIFFERENTLY FROM LOW, because they call for
         opposite things: low is "use it carefully", waiting is "you
         cannot use it at all yet, go and look at what you have already
         lit". So a latched tank is drawn red however full it is. */
      this._bar(M, y, bw, BAR, tank / 100,
        mark ? UI.wait : tank > 40 ? UI.full : tank > 12 ? UI.low : UI.empty);
      /* and the mark it has to reach, standing clear of the bar above
         and below it so it reads against a filling one */
      if (mark) {
        const px = M + Math.round(mark * bw);
        const ctx = this.ctx;
        ctx.save();
        ctx.shadowColor = UI.shadow;
        ctx.shadowBlur = 4 * s;
        ctx.fillStyle = UI.mark;
        ctx.fillRect(px - Math.max(1, s), y - 2 * s, Math.max(2, 2 * s), BAR + 4 * s);
        ctx.restore();
      }
      y += BAR + GAP;
    }
    if (hurt) {
      this._bar(M, y, bw, BAR, a2 / ARMOUR2, UI.armour2); y += BAR + GAP;
      this._bar(M, y, bw, BAR, a1 / ARMOUR1, UI.armour1); y += BAR + GAP;
      this._bar(M, y, bw, BAR, hp / HEALTH, hp > 50 ? UI.health : hp > 25 ? UI.low : UI.empty);
    }
  }

  /* ------------------------------------------------------------------
     THE OTHER CORNER: WHAT YOU ARE HOLDING

     At the user's request, and it is the one word this readout has
     grown back: the weapon's name, small, in the top right, out of the
     way of the bars on the left and the shop in the middle. Four
     weapons that all cycle off one button on a phone is one too many to
     keep track of by the shape of the barrel, and the swap happens
     between shots, so the word is what tells you the SWAP landed.

     Under it a short amber rule, which is the page's own idiom — the
     loading bar, the menu's underlines — and which gives a floating
     word something to sit on.
     ------------------------------------------------------------------ */
  _drawName(p) {
    const name = p && !p.dead ? (WEAPONS[p.weapon]?.name || '') : '';
    if (!name) return;
    const ctx = this.ctx, s = this.s;
    const M = Math.round(20 * s);
    const size = Math.round(13 * s);
    const track = size * 0.22;
    ctx.save();
    ctx.font = `${size}px ${FACE}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const w = trackedWidth(ctx, name, track);
    const x = this.cssW - M - this.nameInset - w;
    const y = M + size;
    ctx.shadowColor = UI.shadow;
    ctx.shadowBlur = 7 * s;
    ctx.shadowOffsetY = 1 * s;
    ctx.fillStyle = UI.ink;
    tracked(ctx, name, x, y, track);
    ctx.shadowBlur = 0;
    ctx.fillStyle = UI.rule;
    ctx.fillRect(x, y + Math.round(5 * s), w, Math.max(1, Math.round(s)));
    ctx.restore();
  }

  /* ------------------------------------------------------------------
     THE MIDDLE: the end-of-night card, which is the only thing left in
     the game that says anything out loud.
     ------------------------------------------------------------------ */
  _drawBig() {
    const big = this.game.bigMessage;
    if (!big) return;
    const ctx = this.ctx, s = this.s;
    const lines = big.split('\n');
    const size = Math.round(Math.min(30 * s, this.cssW / 15));
    const lead = Math.round(size * 1.55);
    const track = size * 0.16;
    const top = Math.round(this.cssH * 0.36);
    ctx.save();
    ctx.font = `${size}px ${FACE}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
    ctx.shadowBlur = 14 * s;
    ctx.shadowOffsetY = 2 * s;
    lines.forEach((ln, i) => {
      const small = i > 0;
      const sz = small ? Math.round(size * 0.52) : size;
      ctx.font = `${sz}px ${FACE}`;
      const tr = sz * 0.16;
      const w = trackedWidth(ctx, ln, tr);
      ctx.fillStyle = small ? UI.inkDim : UI.card;
      tracked(ctx, ln, Math.round((this.cssW - w) / 2), top + i * lead, tr);
    });
    ctx.restore();
  }

  /* ------------------------------------------------------------------
     Per frame.

     The canvas is redrawn only when something on it has changed, which
     is most frames doing nothing at all: the bars move in whole
     percents, the name changes on a swap, the card is usually not
     there. That is cheaper than the old readout, which rebuilt a Pix
     and uploaded a texture on the same conditions and then had every
     one of its texels go through the block average and the palette
     search on TOP of that, every frame, whether it had changed or not.
     ------------------------------------------------------------------ */
  update(player, weaponBank) {
    const W = this.width, H = this.height;
    const p = player;

    /* ---- the readout, on its own canvas ---- */
    if (this.ctx) {
      const g = this.game;
      const d = p ? WEAPONS[p.weapon] : null;
      const cap = d && d.ammo ? (p.maxAmmo[d.ammo] || 1) : 0;
      const key = [
        this.cssW, this.cssH, this.dpr, this.nameInset,
        Math.round(g.burnPercent),
        cap ? Math.round(100 * p.ammoFor(p.weapon) / cap) : -1,
        p ? (p.refireMark || 0) : 0,
        p ? `${Math.round(p.armour2)},${Math.round(p.armour1)},${Math.round(p.health)},${p.dead ? 1 : 0}` : '',
        p && !p.dead ? p.weapon : '',
        g.bigMessage || '',
      ].join('|');
      if (key !== this._key) {
        this._key = key;
        const ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.cssW, this.cssH);
        this._drawBars(p);
        this._drawName(p);
        this._drawBig();
      }
    }

    /* ---- the picture half ---- */

    /* the sprite gun, only if the model never came */
    if (this.showWeaponSprite) {
      const d = WEAPONS[p.weapon];
      const letter = p.firing ? (d.fire[Math.min(p.fireIndex, d.fire.length - 1)]) : d.ready;
      const entry = weaponBank.get(d.sprite + letter) || weaponBank.get(d.sprite + d.ready);
      if (entry) {
        this.weaponMesh.material.uniforms.map.value = weaponTexture(entry);
        const s = Math.min((H * 0.62) / (entry.content || entry.h), (W * 0.50) / entry.w);
        this.weaponMesh.scale.set(entry.w * s, entry.h * s, 1);
        const bobX = Math.cos(p.bobPhase) * p.bob * 0.55;
        const bobY = Math.abs(Math.sin(p.bobPhase)) * p.bob * 0.5;
        this.weaponMesh.position.set(W * 0.10 + bobX, -H / 2 + (entry.h * s) / 2 - H * 0.10 - bobY, 0);
        this.weaponMesh.visible = !p.dead;
      }
    } else this.weaponMesh.visible = false;

    /* the wash over everything: a few frames of gold on a pickup, and
       the glare of a positron discharge going off a metre from your
       face — which is the one wash that is not about being hurt, and is
       the reason this is a ladder rather than a pair. Hardest in the
       first half second and then a haze for as long as the column is
       out, so the shot bleaches the picture and then merely brightens
       it. The colour is the beam's own. */
    let tintA = 0, tintC = 0xff2010;
    if (p.damageFlash > 0) tintA = Math.min(0.30, p.damageFlash / 70);
    else if (p.pickupFlash > 0) { tintA = Math.min(0.18, p.pickupFlash / 60); tintC = 0xffd060; }
    if (p.beamTics > 0) {
      /* how far through the discharge it is, off the beam's own clock
         rather than a second copy of it here — see BeamSystem.age */
      const age = this.game?.beam?.age ?? 0;
      tintA = Math.max(tintA, 0.20 * Math.max(0, 1 - age * 6) + 0.045);
      tintC = 0xbdffd2;
    }
    /* AND THE DEATH VEIL IS A FIRST-PERSON EFFECT. Red over everything
       is what dying looks like from inside the body: you are on the
       floor, the blood is in your eyes, and Doom has done it that way
       since 1993. It is exactly wrong for the death the lance gives
       you — the camera has LEFT the body and is forty feet up looking
       down at it (see deathCamTic in js/player.js), and a veil at that
       point is not the player's eyes filling with blood, it is a red
       filter over a shot of somebody else. It also happened to hide the
       one thing the whole death is for. So the veil belongs to the eyes
       it is drawn for: no camera outside the body, no veil. */
    const watching = p.deathCam && p.deathCam.x !== undefined;
    if (p.dead && !watching) tintA = Math.max(tintA, 0.35);
    this.tintMesh.material.opacity = tintA;
    this.tintMesh.material.color.setHex(tintC);
    this.tintMesh.scale.set(W, H, 1);
    this.tintMesh.visible = tintA > 0.002;
  }

  /** Everything on the readout goes when the game is not being played,
   *  so the title and the pause menu have a clean picture behind them. */
  clear() {
    if (!this.ctx) return;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.cssW, this.cssH);
    this._key = '';
  }
}
