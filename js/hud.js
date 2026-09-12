/* =====================================================================
   GROCERY STORE SIMULATOR — what is written on the picture
   =====================================================================

   All of this is drawn INTO the low-resolution buffer, at the same chunk
   size as the walls, before the palette snap. That is the whole point:
   a crisp modern overlay on a chunky world reads as a filter applied to
   a photograph, and one frame of it undoes everything the renderer is
   doing. The bars, the end-of-night card and the flash are all made of
   the same pixels as the floor.

   AND THERE IS ALMOST NOTHING HERE. The status bar is gone. It answered
   "can I keep fighting", and there is no fighting to keep up: the
   player cannot be hurt and the tank does not empty, so health and fuel
   were two numbers that never changed sitting in a plate across the
   bottom of the picture. What is left is the one number the game is
   about — how much of the store has gone — and the one the forest adds,
   in a corner, small, out of the way of the store you are looking at.

   The text is scaled with the buffer: at four hundred rows a six-pixel
   face is a whisper, so it is doubled, and the buffer decides.
   ===================================================================== */

import * as THREE from 'three';
import { Pix, drawText, textWidth } from './pixel.js';
import { createHudMaterial } from './material.js';
import { weaponTexture } from './sprites.js';
import { WEAPONS } from './player.js';

/** drawText, but every pixel becomes an n-by-n block, over a one-block
 *  shadow so it reads on the sky as well as on the floor. */
export function bigText(pix, str, x, y, key, t, scale = 2, spacing = 1, shadow = true) {
  const tmp = new Pix(textWidth(str, spacing) + 2, 8, 1, false);
  drawText(tmp, str, 0, 0, key, t, spacing);
  const blit = (ox, oy, fn) => {
    for (let sy = 0; sy < 8; sy++)
      for (let sx = 0; sx < tmp.w; sx++) {
        if (tmp.alphaAt(sx, sy) < 8) continue;
        const c = fn(tmp.get(sx, sy));
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++)
            pix.set(x + ox + sx * scale + dx, y + oy + sy * scale + dy, c[0], c[1], c[2], 255);
      }
  };
  if (shadow) blit(scale, scale, () => [6, 6, 9]);
  blit(0, 0, c => c);
  return x + tmp.w * scale;
}

function makeTex(pix) {
  const t = new THREE.CanvasTexture(pix.toCanvas());
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export class Hud {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-160, 160, 100, -100, -100, 100);
    this.width = 320; this.height = 200;
    this.scale = 1;
    /* The gun is a model now (js/weapon3d.js); the sprite is kept for
       the day the model does not arrive, and shown only then. */
    this.showWeaponSprite = false;

    const geo = new THREE.PlaneGeometry(1, 1);
    this.weaponMesh = new THREE.Mesh(geo, createHudMaterial(null));
    this.weaponMesh.renderOrder = 1;
    this.weaponMesh.frustumCulled = false;
    this.weaponMesh.visible = false;
    this.scene.add(this.weaponMesh);

    /* the full-screen wash for pickups (and hurt, if that ever comes back) */
    this.tintMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xff0000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
    }));
    this.tintMesh.renderOrder = 2;
    this.tintMesh.frustumCulled = false;
    this.scene.add(this.tintMesh);

    /* the corner: two bars, and there used to be words */
    this.topTex = null;
    this.topMesh = new THREE.Mesh(geo, createHudMaterial(null));
    this.topMesh.renderOrder = 4;
    this.topMesh.frustumCulled = false;
    this.topMesh.visible = false;
    this.scene.add(this.topMesh);

    /* the middle: the end-of-night card and the big prompts */
    this.bigTex = null;
    this.bigMesh = new THREE.Mesh(geo, createHudMaterial(null));
    this.bigMesh.renderOrder = 5;
    this.bigMesh.frustumCulled = false;
    this.bigMesh.visible = false;
    this.scene.add(this.bigMesh);

    this._topKey = '';
    this._bigKey = '';
  }

  resize(w, h) {
    this.width = w; this.height = h;
    this.camera.left = -w / 2; this.camera.right = w / 2;
    this.camera.top = h / 2; this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
    this.scale = Math.max(1, Math.min(3, Math.round(h / 200)));
    this._topKey = '';
    this._bigKey = '';
  }

  /* ------------------------------------------------------------------
     THE CORNER, WHICH IS TWO BARS AND NOTHING ELSE

     It used to be four numbers and a running list of notifications —
     STORE 12%, WOOD 0%, LEFT 736, FUEL 100%, and under them whatever the
     game had last said out loud. All of the words are gone, at the
     user's request, and what is left is the two GAUGES that were already
     drawn under the numbers: how much of the store has gone, and how
     much is in whatever you are holding.

     WHICH IS MOSTLY A BET THAT THE PICTURE IS THE READOUT. A bar filling
     with fire says "the shop is going" better than a percentage does,
     because the shop is on fire in front of you and the number was
     competing with it. The one thing a bar cannot say is a COUNT — how
     many are still alive is gone with the text, and it is gone on
     purpose rather than by oversight.

     SO THEY HAVE TO BE READABLE WITHOUT LABELS, which the hairlines they
     grew out of were not: one pixel of colour under a word is a
     decoration, and one pixel of colour on its own is dirt. They are
     three pixels tall at the panel's scale, the same length as each
     other so they read as a pair, and the empty end of each stays
     visible so an empty bar is still a bar.

     AND THE SECOND ONE IS WHATEVER IS IN YOUR HANDS. It was the flamer's
     tank when the flamer was the only thing with a tank; now the
     extinguisher has one too, so the bar belongs to the WEAPON and a
     weapon with no tank at all simply does not draw it.
     ------------------------------------------------------------------ */
  buildTop(p) {
    const g = this.game;
    const s = this.scale;
    const burn = Math.round(g.burnPercent);
    /* the tank of whatever is being held, or -1 for something that has
       none — the boxcutter, which never runs out of boxcutter */
    const d = p ? WEAPONS[p.weapon] : null;
    const cap = d && d.ammo ? (p.maxAmmo[d.ammo] || 1) : 0;
    const tank = cap ? Math.round(100 * p.ammoFor(p.weapon) / cap) : -1;
    /* AND WHETHER IT WILL FIRE, which since the tanks started latching at
       empty is a different question from how much is in one. `refireMark`
       is the fraction it has to reach before it lights again, or 0 when
       it is not waiting on anything — so the gauge has a pip on it
       exactly while the answer is "not yet". */
    const mark = p ? (p.refireMark || 0) : 0;
    const key = [this.width, s, burn, tank, mark].join('|');
    if (key === this._topKey) return;
    this._topKey = key;

    const M = 3 * s, BAR = 3 * s, GAP = 3 * s;
    const bw = Math.min(this.width - M * 2, 64 * s);
    const rows = tank >= 0 ? 2 : 1;
    const w = bw + M * 2;
    const h = M * 2 + BAR * rows + GAP * (rows - 1);
    const pix = new Pix(w, h, 1, false);

    /* ONE BAR. `lit` is how far along it is filled, 0..1; the filled end
       brightens along its length so a nearly-full bar does not read as a
       flat block.

       AND THE EMPTY END IS DRAWN TOO, at a third, which is the whole of
       what stops these being dirt. A bar with nothing in it has to still
       be a bar or the player cannot tell an empty tank from a tank that
       has stopped being on the screen — and under the numbers this
       replaces it never had to, because the word FUEL was doing that
       job. The surround under it is darker still: two values means the
       bar has an edge on a pale floor as well as on a black one. */
    const bar = (y, lit, key_, dim) => {
      for (let i = -1; i <= bw; i++)
        for (let k = -1; k <= BAR; k++) pix.ink(M + i, y + k, 'grey', 0.10);
      for (let i = 0; i < bw; i++) {
        const f = i / bw;
        const on = f <= lit;
        for (let k = 0; k < BAR; k++)
          pix.ink(M + i, y + k, on ? key_ : 'grey', on ? dim + f * 0.45 : 0.33);
      }
    };
    /* how much of the store has gone */
    bar(M, burn / 100, 'fire', 0.50);
    if (tank >= 0) {
      const y = M + BAR + GAP;
      /* WAITING READS DIFFERENTLY FROM LOW, because they call for
         opposite things: low is "use it carefully", waiting is "you
         cannot use it at all yet, go and look at what you have already
         lit". So a latched tank is drawn red however full it is. */
      bar(y, tank / 100, mark ? 'red' : tank > 40 ? 'cyan' : tank > 12 ? 'yellow' : 'red', 0.50);
      /* and the mark it has to reach, one column of bone standing clear
         of the bar above and below it so it reads against a filling one */
      if (mark) {
        const px = M + Math.round(mark * bw);
        for (let k = -1; k < BAR + 1; k++) pix.ink(px, y + k, 'bone', 0.85);
      }
    }

    pix.snap(0);
    if (this.topTex) this.topTex.dispose();
    this.topTex = makeTex(pix);
    this.topMesh.material.uniforms.map.value = this.topTex;
    this.topMesh.scale.set(w, h, 1);
    this.topMesh.position.set(-this.width / 2 + w / 2, this.height / 2 - h / 2, 0);
    this.topMesh.visible = true;
  }

  buildBig() {
    const big = this.game.bigMessage;
    const s = this.scale;
    const key = (big || '') + '#' + this.width + '#' + s;
    if (key === this._bigKey) return;
    this._bigKey = key;
    if (!big) { this.bigMesh.visible = false; return; }

    const lines = big.split('\n');
    const h = (lines.length * 16 + 8) * s;
    const pix = new Pix(this.width, h, 1, false);
    lines.forEach((ln, i) => {
      const tw = textWidth(ln) * 2 * s;
      bigText(pix, ln, Math.round((this.width - tw) / 2), (4 + i * 16) * s, 'fire', 0.85, 2 * s);
    });
    pix.snap(0);
    if (this.bigTex) this.bigTex.dispose();
    this.bigTex = makeTex(pix);
    this.bigMesh.material.uniforms.map.value = this.bigTex;
    this.bigMesh.scale.set(this.width, h, 1);
    this.bigMesh.position.set(0, this.height * 0.12, 0);
    this.bigMesh.visible = true;
  }

  /* ------------------------------------------------------------------
     Per frame
     ------------------------------------------------------------------ */
  update(player, weaponBank) {
    const W = this.width, H = this.height;

    this.buildTop(player);
    this.buildBig();

    /* the sprite gun, only if the model never came */
    if (this.showWeaponSprite) {
      const d = WEAPONS[player.weapon];
      const letter = player.firing ? (d.fire[Math.min(player.fireIndex, d.fire.length - 1)]) : d.ready;
      const entry = weaponBank.get(d.sprite + letter) || weaponBank.get(d.sprite + d.ready);
      if (entry) {
        this.weaponMesh.material.uniforms.map.value = weaponTexture(entry);
        const s = Math.min((H * 0.62) / (entry.content || entry.h), (W * 0.50) / entry.w);
        this.weaponMesh.scale.set(entry.w * s, entry.h * s, 1);
        const bobX = Math.cos(player.bobPhase) * player.bob * 0.55;
        const bobY = Math.abs(Math.sin(player.bobPhase)) * player.bob * 0.5;
        this.weaponMesh.position.set(W * 0.10 + bobX, -H / 2 + (entry.h * s) / 2 - H * 0.10 - bobY, 0);
        this.weaponMesh.visible = !player.dead;
      }
    } else this.weaponMesh.visible = false;

    /* the wash over everything: a few frames of gold on a pickup */
    let tintA = 0, tintC = 0xff2010;
    if (player.damageFlash > 0) tintA = Math.min(0.30, player.damageFlash / 70);
    else if (player.pickupFlash > 0) { tintA = Math.min(0.18, player.pickupFlash / 60); tintC = 0xffd060; }
    if (player.dead) tintA = Math.max(tintA, 0.35);
    this.tintMesh.material.opacity = tintA;
    this.tintMesh.material.color.setHex(tintC);
    this.tintMesh.scale.set(W, H, 1);
    this.tintMesh.visible = tintA > 0.002;
  }
}
