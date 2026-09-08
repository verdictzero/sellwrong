/* =====================================================================
   SELLWRONG — boot
   =====================================================================

   Bake the art, build the shop, wire it up, and hand the frame loop over
   to Game.

   Nothing is downloaded. Every texture and every sprite in the game is
   generated in this process, at start-up, in about half a second, which
   is why there is a loading bar at all and why it only ever says four
   things.

   This file also owns THE PAGE AROUND THE GAME: the title, the pause
   menu, which kind of machine this is and what that changes. The rule
   is that the game never finds out — it reads one Input, and whether
   that Input is a keyboard or two thumbs is settled out here.
   ===================================================================== */

import * as THREE from 'three';
import { LofiPipeline } from './lofi.js';
import { bakeTextures } from './textures.js';
import { bakeSprites, bakeWeapons } from './sprites.js';
import { loadDoomSprites, browserDecoder } from './spriteload.js';
import { buildSellWrong } from './maps/sellwrong.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { world } from './material.js';
import { TICRATE } from './util.js';

const $ = id => document.getElementById(id);
const status = (text, pct) => {
  const s = $('load-status'), b = $('load-bar');
  if (s) s.textContent = text;
  if (b) b.style.width = (pct * 100).toFixed(0) + '%';
};

/* How chunky. The vertical resolution of the internal buffer — width
   follows the window's shape, so a wider monitor shows more store rather
   than the same store stretched. */
const DETAIL = [120, 150, 200, 240, 300, 400];

/* ---- what the player has chosen, remembered ------------------------
   Look speed, inversion, handedness, vibration, chunkiness. Kept in
   localStorage, which may be absent or refused, in which case the game
   simply does not remember and nothing else changes. */
const PREF_KEY = 'sellwrong.prefs';
const DEFAULT_PREFS = { sens: 1, invert: false, lefty: false, haptics: true, detail: 2 };
function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
  catch (e) { return { ...DEFAULT_PREFS }; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* not remembered, that is all */ }
}

/* ---- fullscreen, where the browser allows it -----------------------
   A phone game lives in fullscreen: the browser's bars are a fifth of
   the screen and its edge gestures are a hazard next to a stick. Asked
   for on the start tap, and asked for landscape once in — both refused
   on iPhone, where "add to home screen" is the way to get it, and a
   refusal is not an error. */
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
  /* Sky sectors draw nothing, so what shows through is this. A night
     that is not quite black, so a silhouette against it still reads. */
  scene.background = new THREE.Color(0x0a0c14);

  const camera = new THREE.PerspectiveCamera(72, 1.6, 4, 6000);

  /* yield to the browser between steps so the loading bar can move */
  const breathe = () => new Promise(r => setTimeout(r, 0));

  status('BAKING TEXTURES', 0.05); await breathe();
  const textures = bakeTextures();

  status('BAKING SPRITES', 0.35); await breathe();
  const sprites = bakeSprites();
  const weapons = bakeWeapons();

  /* THE STAFF ARE THE ONE THING NOT DRAWN BY THIS PROGRAM. They are
     Freedoom's player sprite with a smiley face over the visor and a
     SellWrong apron on, and they are LOADED rather than baked — the
     apron is still being iterated on and files you can re-export beat a
     wall of base64 you have to re-generate.

     Both monsters come out of the same pictures: the Associate is the
     standing set and the Stocker is the crouching one, which is the same
     employee bent over a pallet, and is exactly the difference the two
     of them were always meant to have.

     If the art is not there this quietly does nothing and the game runs
     on the figures in sprites.js, which is why those are still built
     above rather than deleted. */
  status('THE STAFF', 0.55); await breathe();
  const employee = browserDecoder('assets/sprites/employee');
  const loaded = (await Promise.all([
    loadDoomSprites(sprites, { sprite: 'PLAY', as: 'ASSO', decode: employee }),
    loadDoomSprites(sprites, { sprite: 'PLYC', as: 'STKR', decode: employee }),
  ])).reduce((a, b) => a + b, 0);
  if (loaded) console.log(`staff: ${loaded} frames of real art`);

  status('BUILDING SELLWRONG', 0.70); await breathe();
  const level = buildSellWrong();

  status('OPENING', 0.90); await breathe();
  const hud = new Hud(null);
  const audio = new Audio();
  const input = new Input(renderer.domElement);
  const game = new Game({ level, scene, camera, textures, sprites, hud, audio, input });
  hud.game = game;
  const touch = new TouchControls(input, { root: $('touch'), prefs, onPause: () => pause(true) });

  const pipeline = new LofiPipeline(renderer, { height: DETAIL[detailIndex], dither: 1.0, snap: 1.0 });

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const r = pipeline.resize(w, h);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    hud.resize(r.width, r.height);
    /* how tall the status bar is on the glass, for the controls to keep
       above: 32 of the buffer's rows, however many rows there are */
    $('touch').style.setProperty('--bar', ((32 / r.height) * h).toFixed(1) + 'px');
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

  /* ---- which kind of machine this is, right now --------------------
     Stamped on <html> so the page can show the right legend, and the
     controls only exist while a game is being played by touch. */
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

  /* ---- pause ---------------------------------------------------------
     One switch, in the game; the menu, the key and the button on the
     phone all throw it. Losing the mouse throws it too, because the
     alternative is a game running unattended behind a browser dialog. */
  function pause(on) {
    if (!started || game.state !== 'play') return;
    game.setPaused(on);
  }
  game.onPauseChange = on => {
    pauseEl.classList.toggle('gone', !on);
    $('touch').classList.toggle('paused', on);
    /* a menu you cannot point at is not a menu: let go of the mouse */
    if (on) { touch.releaseAll(); input.exitLock(); syncMenu(); }
  };
  $('btn-resume').addEventListener('click', () => {
    pause(false);
    audio.resume();
    if (input.mode === 'desktop') input.requestLock();
  });
  /* restarting throws the night away, so it asks once */
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

  /* dead or out: the controls go, and after a moment's grace — so the
     thumb that was still firing does not restart the night — any touch
     or click goes again */
  game.onStateChange = () => {
    touch.setEnabled(false);
    setTimeout(() => addEventListener('pointerdown', () => location.reload(), { once: true }), 1500);
  };

  /* ---- start ----------------------------------------------------- */
  function start() {
    if (started) return;
    started = true;
    title.classList.add('gone');
    audio.resume();
    audio.startAmbience();
    if (input.mode === 'touch') { enterFullscreen(); touch.setEnabled(true); }
    else input.requestLock();
    /* Space starts the game and Space is also Use, so without this the
       first thing that ever happens is NOTHING TO USE. */
    input.keys.clear();
    game.message('SELLWRONG SUPERSTORE');
    game.message('BURN ' + game.burnTarget + '% AND GET OUT');
  }
  title.addEventListener('click', start);
  addEventListener('keydown', e => {
    if (!started && (e.code === 'Space' || e.code === 'Enter')) { start(); return; }
    /* dead, and asked to try again */
    if (started && game.state !== 'play' && e.code === 'Space') location.reload();
    if (e.code === 'BracketLeft') setDetail(Math.max(0, detailIndex - 1));
    if (e.code === 'BracketRight') setDetail(Math.min(DETAIL.length - 1, detailIndex + 1));
    if (e.code === 'KeyN') {                       // palette off, for comparison
      const u = pipeline.material.uniforms.uSnap;
      u.value = u.value > 0.5 ? 0 : 1;
    }
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
  let last = performance.now();
  let fpsAccum = 0, fpsFrames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;

    if (started) game.update(dt);
    game.render();
    hud.update(game.player, weapons);
    pipeline.render(scene, camera, hud.scene, hud.camera);

    fpsAccum += dt; fpsFrames++;
    if (fpsAccum > 0.5) {
      const el = $('fps');
      if (el) el.textContent = `${Math.round(fpsFrames / fpsAccum)} FPS  ${pipeline.width}x${pipeline.height}  ` +
        `${game.actors.length} things  ${game.fire.burningCells} alight`;
      fpsAccum = 0; fpsFrames = 0;
    }
  }
  requestAnimationFrame(frame);

  /* let the console poke at it */
  window.SELLWRONG = { game, pipeline, renderer, scene, camera, textures, sprites, world, level, input, touch };
}

boot().catch(e => {
  console.error(e);
  status('FAILED: ' + e.message, 1);
  const s = $('load-status');
  if (s) s.style.color = '#f44';
});
