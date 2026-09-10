/* =====================================================================
   GROCERY STORE SIMULATOR — what is written on the picture
   =====================================================================

   All of this is drawn INTO the low-resolution buffer, at the same chunk
   size as the walls, before the palette snap. That is the whole point:
   a crisp modern overlay on a chunky world reads as a filter applied to
   a photograph, and one frame of it undoes everything the renderer is
   doing. The numbers, the messages and the flash are all made of the
   same pixels as the floor.

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

    /* the corner: the two numbers and the running messages */
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

    this.messages = [];
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

  message(text, tics = 105) {
    this.messages.push({ text: String(text).toUpperCase(), tics });
    if (this.messages.length > 3) this.messages.shift();
  }

  ticMessages() {
    for (const m of this.messages) m.tics--;
    this.messages = this.messages.filter(m => m.tics > 0);
  }

  /* ------------------------------------------------------------------
     The corner

     Rebuilt only when something in it changed. Every value that appears
     goes into the key, so a frame in which nothing moved costs one
     string comparison.
     ------------------------------------------------------------------ */
  buildTop(p) {
    const s = this.scale;
    const g = this.game;
    const burn = Math.round(g.burnPercent), wood = Math.round(g.forestPercent);
    const left = g.peopleLeft;
    const key = [this.width, s, burn, wood, left, this.messages.map(m => m.text).join('/')].join('|');
    if (key === this._topKey) return;
    this._topKey = key;

    const longest = Math.max(148, ...this.messages.map(m => textWidth(m.text) + 8));
    const w = Math.min(this.width, longest * s + 6 * s);
    const h = (16 + 8 * this.messages.length) * s + 4;
    const pix = new Pix(w, h, 1, false);
    const M = 3 * s;
    /* STORE 12%, a hairline gauge under it, and the wood beside it */
    let x = bigText(pix, 'STORE', M, M, 'grey', 0.55, s);
    x = bigText(pix, `${burn}%`, x + 2 * s, M, 'fire', burn > 66 ? 0.92 : burn > 33 ? 0.78 : 0.62, s);
    const gx0 = M, gw = 48 * s, gy = M + 7 * s;
    for (let i = 0; i < gw; i++) {
      const f = i / gw;
      const on = f * 100 <= burn;
      for (let k = 0; k < s; k++) pix.ink(gx0 + i, gy + k, on ? 'fire' : 'grey', on ? 0.5 + f * 0.45 : 0.18);
    }
    x = bigText(pix, 'WOOD', x + 6 * s, M, 'grey', 0.55, s);
    x = bigText(pix, `${wood}%`, x + 2 * s, M, 'fire', wood > 0 ? 0.66 : 0.3, s);
    /* and how many are still alive, which since the fire exits went in is
       the number the player is actually playing against */
    x = bigText(pix, 'LEFT', x + 6 * s, M, 'grey', 0.55, s);
    bigText(pix, `${left}`, x + 2 * s, M, 'bone', left > 0 ? 0.78 : 0.34, s);

    this.messages.forEach((m, i) => bigText(pix, m.text, M, M + (12 + i * 8) * s, 'bone', 0.72, s));

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
