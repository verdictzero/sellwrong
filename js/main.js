/* =====================================================================
   GROCERY STORE SIMULATOR — boot
   =====================================================================

   Bake the art, fetch the few things that are files, build the shop
   and the wood round it, wire it up, and hand the frame loop over to
   Game.

   Almost nothing is downloaded. Every texture and sprite of the STORE
   is generated in this process, at start-up, in about half a second.
   What does arrive as files is what was made elsewhere: the staff, the
   trees and their burn maps, the sky, and the gun — and if any of
   those fails to arrive the game runs without it rather than not at
   all, which is why each load is a step of its own with a fallback.

   This file also owns THE PAGE AROUND THE GAME: the title, the pause
   menu, which kind of machine this is and what that changes. The rule
   is that the game never finds out — it reads one Input, and whether
   that Input is a keyboard or two thumbs is settled out here.
   ===================================================================== */

import * as THREE from 'three';
import { LofiPipeline } from './lofi.js';
import { bakeTextures } from './textures.js';
import { bakeSprites, bakeWeapons } from './sprites.js';
import { fireFrames } from './fireart.js';
import { carTexture } from './car.js';
import { addStrip, imageData } from './spriteload.js';
import { CELLS, GIBLETS, BLAST_SPRITE, addStandees, addSplats } from './people.js';
import { buildSellWrong } from './maps/sellwrong.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { world } from './material.js';
import { atlasTexture, imageTexture } from './particles.js';
import { bakeEffectAtlases } from './effects.js';
import { Weapon3D } from './weapon3d.js';
import { KINDS } from './forest.js';

const $ = id => document.getElementById(id);
const status = (text, pct) => {
  const s = $('load-status'), b = $('load-bar');
  if (s) s.textContent = text;
  if (b) b.style.width = (pct * 100).toFixed(0) + '%';
};

/* How chunky. The vertical resolution of the internal buffer — width
   follows the window's shape, so a wider monitor shows more store rather
   than the same store stretched. 400 is the default: twice what it was,
   at the user's request, and still very much a buffer you can see the
   pixels of. */
const DETAIL = [120, 150, 200, 240, 300, 400, 480, 600];
const DEFAULT_DETAIL = 5;

/* ---- what the player has chosen, remembered ------------------------
   Look speed, inversion, handedness, vibration, chunkiness. Kept in
   localStorage, which may be absent or refused, in which case the game
   simply does not remember and nothing else changes. The version is
   bumped when a default changes, so a saved setting from before does
   not quietly keep the old default alive. */
const PREF_KEY = 'sellwrong.prefs';
const PREF_VERSION = 2;
const DEFAULT_PREFS = { v: PREF_VERSION, sens: 1, invert: false, lefty: false, haptics: true, detail: DEFAULT_DETAIL };
function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (saved.v !== PREF_VERSION) { delete saved.detail; saved.v = PREF_VERSION; }
    return { ...DEFAULT_PREFS, ...saved };
  } catch (e) { return { ...DEFAULT_PREFS }; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* not remembered, that is all */ }
}

/* ---- fullscreen, where the browser allows it ----------------------- */
const fullscreenAllowed = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const inFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  let p;
  try { p = req.call(el, { navigationUI: 'hide' }); } catch (e) { return; }
  if (p && typeof p.then === 'function')
    p.then(() => screen.orientation?.lock?.('landscape')?.catch?.(() => {})).catch(() => {});
}
function exitFullscreen() {
  const ex = document.exitFullscreen || document.webkitExitFullscreen;
  if (!ex) return;
  try { const p = ex.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) { /* nothing to leave */ }
}

/* ---- files ------------------------------------------------------- */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('could not load ' + url));
    im.src = url;
  });
}

/** The wood's pictures: every kind of plant with its burn map, and the
 *  two grounds. All or nothing — a forest with one kind of tree missing
 *  is a forest with holes in it. */
async function loadForestArt() {
  const sprites = {};
  await Promise.all(KINDS.map(async k => {
    const [albedo, burn] = await Promise.all([loadImage(`assets/forest/${k.name}.png`), loadImage(`assets/forest/${k.name}_burn.png`)]);
    sprites[k.name] = { albedo, burn };
  }));
  const [ground, groundBurnt] = await Promise.all([loadImage('assets/forest/ground.png'), loadImage('assets/forest/ground_burnt.png')]);
  return { sprites, ground, groundBurnt };
}

async function boot() {
  const prefs = loadPrefs();
  let detailIndex = Math.max(0, Math.min(DETAIL.length - 1, prefs.detail | 0));
  let started = false;

  const container = $('game');
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);              // the pipeline decides the resolution, not the display
  renderer.autoClear = false;
  renderer.setClearColor(0x05060a, 1);
  container.appendChild(renderer.domElement);
  renderer.domElement.id = 'view';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0c14);

  /* Far enough to see across the wood: the forest floor runs sixteen
     thousand units before the sky's own dark ground takes over. */
  const camera = new THREE.PerspectiveCamera(72, 1.6, 4, 16000);

  /* yield to the browser between steps so the loading bar can move */
  const breathe = () => new Promise(r => setTimeout(r, 0));

  /* The files start arriving now, behind the baking. */
  const forestArtP = loadForestArt().catch(e => { console.warn('no forest art:', e.message); return null; });
  const skyP = loadImage('assets/sky/night.png').catch(e => { console.warn('no sky:', e.message); return null; });
  /* and the crowd: the galvarius project's standees, the pieces they
     come apart into, what is left on the floor and the fireball that
     does it — see js/people.js and tools/prep-people.mjs */
  const peopleP = Promise.all(['shoppers', 'giblets', 'splat', 'blast'].map(k => loadImage(`assets/people/${k}.png`)))
    .catch(e => { console.warn('no people art, using the stand-ins:', e.message); return null; });
  /* and the van in the car park: four orthographic views of it on one
     sheet, packed by tools/prep-car.mjs and projected back onto boxes by
     js/car.js */
  const carP = loadImage('assets/cars/vehicles.png').catch(e => { console.warn('no cars:', e.message); return null; });

  status('BAKING TEXTURES', 0.05); await breathe();
  const textures = bakeTextures();

  status('BAKING SPRITES', 0.30); await breathe();
  const sprites = bakeSprites();
  const weapons = bakeWeapons();
  const fxAtlases = bakeEffectAtlases();
  /* the stream out of the gun is fireballs (bakeEffectAtlases); the
     muzzle, the pilot and the flames on the wood are flame frames */
  const streamAtlas = { texture: fxAtlases.fireball, frames: 8 };

  /* THE PEOPLE ARE NOT DRAWN BY THIS PROGRAM. Every one of them lands on
     top of a stand-in of the same name that sprites.js has already
     baked, so a missing file costs the game its faces and nothing else.
     The pieces stay a picture rather than becoming bank frames: they are
     particles, and a particle wants one atlas, not eleven textures. */
  status('THE CROWD', 0.45); await breathe();
  const peopleImgs = await peopleP;
  let gibAtlases = null;
  if (peopleImgs) {
    const [shopperImg, gibletImg, splatImg, blastImg] = peopleImgs;
    const people = addStandees(sprites, imageData(shopperImg));
    const splats = addSplats(sprites, imageData(splatImg));
    const blast = addStrip(sprites, BLAST_SPRITE, imageData(blastImg), CELLS.blast.w, { fullbright: true });
    gibAtlases = {
      giblets: { texture: imageTexture(gibletImg), frames: GIBLETS },
      /* the fire on a piece in the air is the same fireball the gun
         fires, so a burning hand and the stream that lit it are made of
         the same paint */
      trail: { texture: fxAtlases.fireball, frames: 8 },
    };
    console.log(`the crowd: ${people} shoppers, ${splats} splats, ${blast} frames of fireball`);
  }

  /* THE FIRE ON THE TREES AND ON THE GUN. The store's three fire sets
     are already in the bank — bakeSprites drew them — and this is the
     same generator asked for one more, as a particle atlas: the flames
     the wood carries, the pilot light and the muzzle flash.

     SQUARE, because Particles draws square quads, and js/fireart.js
     keeps a flame's own proportions inside whatever cell it is given
     rather than filling it. Twenty frames, and they loop. */
  status('THE FIRE', 0.50);
  const flameAtlas = { texture: atlasTexture(fireFrames(64, 64, 20, 11, { taper: 0.7 })), frames: 20 };

  status('THE WOOD', 0.55);
  const forestArt = await forestArtP;
  status('THE SKY', 0.62);
  const skyImage = await skyP;

  status('BUILDING SELLWRONG', 0.68); await breathe();
  const level = buildSellWrong();
  const carImage = await carP;

  status('THE FLAMETHROWER', 0.78);
  const hud = new Hud(null);
  const audio = new Audio();
  const input = new Input(renderer.domElement);
  const game = new Game({ level, scene, camera, textures, sprites, hud, audio, input, sky: skyImage,
                         flameAtlas: streamAtlas, fxAtlases, gibAtlases,
                         carAtlas: carImage ? carTexture(carImage) : null });
  hud.game = game;
  const touch = new TouchControls(input, { root: $('touch'), prefs, onPause: () => pause(true) });

  const weapon3d = new Weapon3D({ aspect: 1.6 });
  await weapon3d.load('assets/models/flamethrower.glb', flameAtlas);
  game.weapon3d = weapon3d.ready ? weapon3d : null;
  hud.showWeaponSprite = !weapon3d.ready;

  status('PLANTING THE WOOD', 0.88); await breathe();
  if (forestArt) { game.forest.build(scene, forestArt); game.forest.attachFlames(scene, flameAtlas); }
  console.log(`wood: ${game.forest.treeCount} trees, ${game.forest.plantCount} plants`);

  status('OPENING', 0.95); await breathe();
  const pipeline = new LofiPipeline(renderer, { height: DETAIL[detailIndex], dither: 1.0, snap: 1.0 });

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const r = pipeline.resize(w, h);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    weapon3d.setAspect(camera.aspect);
    hud.resize(r.width, r.height);
    /* nothing is drawn along the bottom of the picture any more, so the
       controls sit on the edge */
    $('touch').style.setProperty('--bar', '0px');
  }
  addEventListener('resize', resize);
  resize();

  /* The car park is outdoors at night and the store has its own lights,
     so the distance falloff has to reach a long way or the far end of
     the shop floor is simply black. */
  world.lightFalloff.value = 3400;
  world.minLight.value = 0.22;      // the fire raises this as the store goes

  status('READY', 1.0);
  const loading = $('loading');
  const title = $('title');
  const pauseEl = $('pause');
  loading.classList.add('gone');
  title.classList.remove('gone');

  /* ---- which kind of machine this is, right now -------------------- */
  function applyMode(mode) {
    document.documentElement.classList.toggle('touch', mode === 'touch');
    touch.setEnabled(started && mode === 'touch' && game.state === 'play');
    $('opt-full').hidden = !fullscreenAllowed();
  }
  input.onModeChange = applyMode;
  applyMode(input.mode);

  /* ---- the settings ------------------------------------------------ */
  const sensEl = $('opt-sens'), sensV = $('opt-sens-v');
  const setTog = (id, on) => $(id).setAttribute('aria-pressed', on ? 'true' : 'false');
  function syncMenu() {
    sensEl.value = prefs.sens;
    sensV.textContent = prefs.sens.toFixed(1) + 'X';
    setTog('opt-invert', prefs.invert);
    setTog('opt-lefty', prefs.lefty);
    setTog('opt-haptic', prefs.haptics);
    $('opt-detail').textContent = 'DETAIL ' + DETAIL[detailIndex] + 'P';
    $('opt-full').textContent = inFullscreen() ? 'LEAVE FULLSCREEN' : 'FULLSCREEN';
  }
  function applyPrefs() {
    input.sensitivity = 0.0022 * prefs.sens;    // the mouse and the thumb share one dial
    input.invertY = !!prefs.invert;
    touch.applyPrefs();
    savePrefs(prefs);
    syncMenu();
  }
  applyPrefs();
  sensEl.addEventListener('input', () => { prefs.sens = parseFloat(sensEl.value) || 1; applyPrefs(); });
  const toggle = (id, key) => $(id).addEventListener('click', () => { prefs[key] = !prefs[key]; applyPrefs(); });
  toggle('opt-invert', 'invert');
  toggle('opt-lefty', 'lefty');
  toggle('opt-haptic', 'haptics');
  $('opt-detail').addEventListener('click', () => setDetail((detailIndex + 1) % DETAIL.length));
  $('opt-full').addEventListener('click', () => (inFullscreen() ? exitFullscreen() : enterFullscreen()));
  document.addEventListener('fullscreenchange', syncMenu);
  document.addEventListener('webkitfullscreenchange', syncMenu);

  /* ---- pause --------------------------------------------------------- */
  function pause(on) {
    if (!started || game.state !== 'play') return;
    game.setPaused(on);
  }
  game.onPauseChange = on => {
    pauseEl.classList.toggle('gone', !on);
    $('touch').classList.toggle('paused', on);
    if (on) { touch.releaseAll(); input.exitLock(); syncMenu(); }
  };
  $('btn-resume').addEventListener('click', () => {
    pause(false);
    audio.resume();
    if (input.mode === 'desktop') input.requestLock();
  });
  const restartBtn = $('btn-restart');
  let restartArmed = 0;
  restartBtn.addEventListener('click', () => {
    if (restartBtn.classList.contains('armed')) { location.reload(); return; }
    restartBtn.classList.add('armed');
    restartBtn.textContent = 'SURE? TAP AGAIN';
    clearTimeout(restartArmed);
    restartArmed = setTimeout(() => { restartBtn.classList.remove('armed'); restartBtn.textContent = 'RESTART'; }, 3000);
  });
  document.addEventListener('pointerlockchange', () => {
    if (started && input.mode === 'desktop' && !document.pointerLockElement && !game.paused) pause(true);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

  /* a hit you can feel — the phone has no other way to tell you */
  game.onPlayerHurt = amount => {
    if (prefs.haptics && input.mode === 'touch' && navigator.vibrate)
      navigator.vibrate(Math.min(60, 12 + amount * 2));
  };

  game.onStateChange = () => {
    touch.setEnabled(false);
    setTimeout(() => addEventListener('pointerdown', () => location.reload(), { once: true }), 1500);
  };

  /* ---- start ------------------------------------------------------- */
  function start() {
    if (started) return;
    started = true;
    game.idle = false;
    title.classList.add('gone');
    audio.resume();
    audio.startAmbience();
    if (input.mode === 'touch') { enterFullscreen(); touch.setEnabled(true); }
    else input.requestLock();
    input.keys.clear();
    game.message('SELLWRONG SUPERSTORE. OPEN ALL NIGHT.');
  }
  title.addEventListener('click', start);
  let debug = false;
  addEventListener('keydown', e => {
    if (!started && (e.code === 'Space' || e.code === 'Enter')) { start(); return; }
    if (started && game.state !== 'play' && e.code === 'Space') location.reload();
    if (e.code === 'BracketLeft') setDetail(Math.max(0, detailIndex - 1));
    if (e.code === 'BracketRight') setDetail(Math.min(DETAIL.length - 1, detailIndex + 1));
    if (e.code === 'KeyN') {                       // palette off, for comparison
      const u = pipeline.material.uniforms.uSnap;
      u.value = u.value > 0.5 ? 0 : 1;
    }
    if (e.code === 'Backquote') { debug = !debug; $('fps').hidden = !debug; }
  });
  renderer.domElement.addEventListener('mousedown', () => { if (!started) start(); else audio.resume(); });

  function setDetail(i) {
    detailIndex = Math.max(0, Math.min(DETAIL.length - 1, i));
    pipeline.setHeight(DETAIL[detailIndex]);
    resize();
    prefs.detail = detailIndex;
    savePrefs(prefs);
    syncMenu();
    game.message('DETAIL ' + DETAIL[detailIndex] + 'P');
  }

  /* ---- the loop ---------------------------------------------------- */
  const overlays = [
    { scene: weapon3d.scene, camera: weapon3d.camera, visible: false },
    { scene: hud.scene, camera: hud.camera, visible: false },
  ];
  let last = performance.now();
  let fpsAccum = 0, fpsFrames = 0;
  game.idle = true;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;

    if (started) game.update(dt);
    game.render(now);
    const p = game.player;
    if (started) weapon3d.update(p, p.firing, game.tics, dt);
    hud.update(p, weapons);
    overlays[0].visible = started && weapon3d.ready && !p.dead;
    overlays[1].visible = started;
    pipeline.render(scene, camera, overlays);

    fpsAccum += dt; fpsFrames++;
    if (fpsAccum > 0.5) {
      const el = $('fps');
      if (el && debug) el.textContent = `${Math.round(fpsFrames / fpsAccum)} FPS  ${pipeline.width}x${pipeline.height}  ` +
        `${game.actors.length} things  ${game.fire.burningCells} alight  ${game.forest.burningCells} wood  ` +
        `${game.flame.liveCount + game.fx.liveCount} particles`;
      fpsAccum = 0; fpsFrames = 0;
    }
  }
  requestAnimationFrame(frame);

  /* let the console poke at it */
  window.SELLWRONG = { game, pipeline, renderer, scene, camera, textures, sprites, world, level, input, touch, weapon3d,
                       responders: game.responders, giblets: game.giblets };
}

boot().catch(e => {
  console.error(e);
  status('FAILED: ' + e.message, 1);
  const s = $('load-status');
  if (s) s.style.color = '#f44';
});
