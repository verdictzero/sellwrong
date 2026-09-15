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
import { loadVehicleModel, POLICE_LENGTH, APC_LENGTH } from './car.js';
import { loadVtolModel } from './vtol.js';
import { addStrip, imageData } from './spriteload.js';
import { CELLS, GIBLETS, BLAST_SPRITE, addStandees, addSplats, addTroops } from './people.js';
import { buildSellWrong } from './maps/sellwrong.js';
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { world } from './material.js';
import { atlasTexture, imageTexture } from './particles.js';
import { bakeEffectAtlases } from './effects.js';
import { bakeRainAtlas } from './rain.js';
import { SkyBaker } from './skyart.js';
import { Weather, WEATHERS, WEATHER_ORDER, HOUR_STOPS } from './weather.js';
import { Weapon3D } from './weapon3d.js';
import { KINDS } from './forest.js';
import { Music } from './music.js';
import { VERSION } from './version.js';

const $ = id => document.getElementById(id);
/* THE LOADING SCREEN SAYS ONE THING, at the user's request, and it is
   RETICULATING SPLINES for the whole of the half second. The steps
   still move the bar; they no longer say their names. */
const status = (text, pct) => {
  const b = $('load-bar');
  if (b) b.style.width = (pct * 100).toFixed(0) + '%';
};
const failed = text => { const s = $('load-status'); if (s) s.textContent = text; };

/* HOW MUCH THE WORLD IS DRAWN WITH. The vertical resolution of the
   buffer the 3D goes into — width follows the window's shape, so a wider
   monitor shows more store rather than the same store stretched. It
   defaults to the top of the ladder, at the user's request, because the
   pixel filter below is what decides how chunky the picture looks now
   and this one is free to be about detail. It is still the frame rate
   control; halving it quarters the pixels being shaded. */
const DETAIL = [120, 150, 200, 240, 300, 400, 480, 600, 720];
const DEFAULT_DETAIL = 8;              // 720, the top of the ladder

/* AND HOW BIG A PIXEL IS, which is a different question and used to be
   the same one. This is the grid the finished frame is filtered down
   onto — each chunky pixel the AVERAGE of the buffer under it, so a
   600-row render at a 200-row grid is a 320x200 picture with every
   square correct to an eighth of itself. It costs almost nothing: the
   filter runs once per chunky pixel, and the palette search that used to
   run once per screen pixel now runs there too.

   OFF is last because it is the finest setting there is — the grid
   becomes the buffer, which is exactly what this game did before the two
   were pulled apart. It is not the default: the default is 240 rows of
   5:6 pixels off a 720-row render, at the user's request (it was 200,
   which is 320x200 at the shape Doom was drawn at), off a render fine
   enough that every one of those chunky pixels is the average of nine. */
const PIXELS = [120, 150, 200, 240, 300, 400, 480, 600, 0];
const PIXELS_OFF = PIXELS.length - 1;
const DEFAULT_PIXELS = 3;              // 240, at the user's request, up from 200

/* THE SHAPE OF ONE, width over height as displayed. 320x200 filling a
   4:3 monitor is not a square-pixel mode and never was: each pixel stood
   five wide to six tall, and every Doom sprite was drawn by somebody
   looking at that. A square-pixel 320x200 is a squashed Doom. The other
   way round is a console's 256x224 on the same screen, which is the same
   trick in the other direction. Nothing in the world moves when this
   changes — the camera reads the BUFFER's shape, and the buffer's pixels
   are always square. */
const PIXEL_ASPECT = [
  { v: 1.0,     n: 'SQUARE' },
  { v: 0.83333, n: 'TALL 5:6' },      // 320x200 on a 4:3 monitor
  { v: 1.16667, n: 'WIDE 7:6' },      // 256x224 on the same
  /* AND ONE TO THREE, at the user's request: a pixel three times as
     tall as it is wide, which is a 240-row grid twelve hundred and
     eighty across on a 16:9 window — every column of the 720-row
     buffer, in rows a third as fine. lofiSizes clamps the width to the
     buffer's, so on a narrower render the rows give way, as they do
     for every tall setting. */
  { v: 0.33333, n: 'TALL 1:3' },
];
const DEFAULT_PIXAR = 1;               // 5:6, which is the shape Doom was drawn on

/* ---------------------------------------------------------------------
   WHAT TO SPEND THE FRAME ON

   Three ladders, coarse on purpose — a slider from 0 to 1 invites you to
   fiddle and tells you nothing, and there are only ever two or three
   answers worth having. Each is a multiplier the game reads off
   `game.quality`; the simulation never sees them, so the shop is the
   same shop at every setting and only the drawing is cheaper.

   Which of them to reach for first, measured under a software
   rasteriser, where fill rate and draw calls hurt in the same
   proportions they do on a weak phone:

     RENDER   the biggest lever by a long way. Halving the buffer's
              height quarters the pixels
     THE WOOD next: twenty-eight thousand trees in chunks, and hiding
              the far ones was worth four times the frame rate on its
              own
     CROWD    seven hundred standees are seven hundred draw calls,
              because a billboard the shader turns cannot be batched
     EFFECTS  the fire's sprite pool, sorted nearest-and-hottest first,
              so spending less of it drops the far cold end
   ------------------------------------------------------------------- */
const CROWD  = [{ v: 1, n: 'EVERYONE' }, { v: 0.5, n: 'HALF' }, { v: 0.25, n: 'A FEW' }];
const FX     = [{ v: 1, n: 'FULL' }, { v: 0.5, n: 'FEWER' }, { v: 0.25, n: 'LEAST' }];
const WOOD   = [{ v: 1, n: 'ALL OF IT' }, { v: 0.6, n: 'NEARER' }, { v: 0.35, n: 'NEAREST' }];

/* ---- what the player has chosen, remembered ------------------------
   Look speed, inversion, handedness, vibration, chunkiness. Kept in
   localStorage, which may be absent or refused, in which case the game
   simply does not remember and nothing else changes. The version is
   bumped when a default changes, so a saved setting from before does
   not quietly keep the old default alive. */
const PREF_KEY = 'sellwrong.prefs';
/* 4: the defaults moved — 240 rows of pixels, and the picture a third
   brighter — so a saved 200 and a saved 1.0 are not kept alive.
   5: the two debug switches default to on. */
const PREF_VERSION = 5;
const DEFAULT_PREFS = { v: PREF_VERSION, sens: 1, invert: false, lefty: false, haptics: true,
                        detail: DEFAULT_DETAIL, pixels: DEFAULT_PIXELS, pixar: DEFAULT_PIXAR,
                        crowd: 0, fx: 0, wood: 0, fps: false,
                        /* the night's weather — see js/weather.js; the hour is not
                           kept, because a night starts at two */
                        weather: 0,
                        /* BOTH DEBUG SWITCHES ON BY DEFAULT, at the user's request:
                           infinite ammo and invincibility, until told otherwise
                           from the pause menu, where either can still be turned
                           off and the choice is kept */
                        debug: true, godmode: true,
                        /* the three picture dials, at the user's request — see
                           LofiPipeline.setPicture; 1 is the picture as drawn */
                        bright: 1.35, contrast: 1, gamma: 1,
                        /* and the music's fader — see js/music.js */
                        music: 0.5 };
function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (saved.v !== PREF_VERSION) {
      delete saved.detail; delete saved.pixels; delete saved.pixar; delete saved.bright;
      saved.v = PREF_VERSION;
    }
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
  let pixelIndex = Math.max(0, Math.min(PIXELS.length - 1, prefs.pixels | 0));
  let pixarIndex = Math.max(0, Math.min(PIXEL_ASPECT.length - 1, prefs.pixar | 0));
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
  /* and the crowd: the galvarius project's standees, the pieces they
     come apart into, what is left on the floor and the fireball that
     does it — see js/people.js and tools/prep-people.mjs */
  const peopleP = Promise.all(['shoppers', 'giblets', 'splat', 'blast'].map(k => loadImage(`assets/people/${k}.png`)))
    .catch(e => { console.warn('no people art, using the stand-ins:', e.message); return null; });
  /* and the van in the car park: one model, in every bay, at the user's
     request. There is no preparation step and no tool — the GLB is
     loaded as it was exported and drawn as it is authored; js/car.js is
     the whole of it. The texture comes out of the same file, so there is
     nothing here to keep in step. */
  const fleetP = loadVehicleModel('assets/models/van.glb')
    .catch(e => { console.warn('no van, the car park stays empty:', e.message); return null; });
  /* and the police van, which comes up the road with the SWAT in it —
     the user's second model, loaded the same way, on its own sheet and
     never in the slab; see SwatVan in js/vehicles.js and POLICE_LENGTH
     in js/car.js for how long it is. Without it nobody comes. */
  const policeP = loadVehicleModel('assets/models/police_assault.glb',
      { length: POLICE_LENGTH, id: 'police', name: 'Assault van', use: 'police' })
    .catch(e => { console.warn('no police van, nobody comes:', e.message); return null; });
  /* and the ARMY'S CARRIER, which is the third vehicle and the first
     that does not touch the road: a hover APC, loaded exactly like the
     other two and floated by ArmyApc in js/vehicles.js. Without it the
     army never arrives and the SWAT are the whole night, which is the
     same bargain as above. */
  const apcP = loadVehicleModel('assets/models/apc.glb',
      { length: APC_LENGTH, id: 'apc', name: 'Hover APC', use: 'army' })
    .catch(e => { console.warn('no APC, the army stays home:', e.message); return null; });
  /* and the AIR SUPPORT that comes with it: the user's VTOL gunship,
     the fourth model up the road and the first that never touches it.
     Its own loader, because it is not one mesh but a tree of them —
     see js/vtol.js. Without it the army comes alone. */
  const vtolP = loadVtolModel('assets/models/vtol.glb')
    .catch(e => { console.warn('no gunship, the army comes alone:', e.message); return null; });
  /* and the troops themselves: the user's two sheets, cut by
     tools/prep-troops.mjs. Either one missing costs that force its
     faces and nothing else — js/sprites.js has already baked a body of
     the right height under every letter. */
  const troopsP = Promise.all(['swat', 'army'].map(k => loadImage(`assets/people/${k}.png`)))
    .catch(e => { console.warn('no troop art, using the stand-ins:', e.message); return null; });
  /* and the music, fetched now and decoded on the start tap, which is
     the first moment a browser lets a page open a speaker — see
     js/music.js. Sixteen megabytes, behind everything else. */
  const music = new Music();
  const musicP = music.load();
  /* and the minigun's three recordings — see SAMPLES in js/audio.js */
  const audio = new Audio();
  audio.loadSamples();

  status('BAKING TEXTURES', 0.05); await breathe();
  const textures = bakeTextures();

  status('BAKING SPRITES', 0.30); await breathe();
  const sprites = bakeSprites();
  const weapons = bakeWeapons();
  const fxAtlases = bakeEffectAtlases();
  const rainAtlas = bakeRainAtlas();
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
  {
    const [swatImg, armyImg] = (await troopsP) || [];
    if (swatImg) console.log(`the squad: ${addTroops(sprites, imageData(swatImg), 'SWAT')} cells of SWAT`);
    if (armyImg) console.log(`and behind them: ${addTroops(sprites, imageData(armyImg), 'ARMY')} cells of army`);
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
  /* THE SKY IS BAKED, NOT LOADED — js/skyart.js, on the GPU, for the
     hour and the weather, and again as the night goes. It needs the
     palette atlas the post pass builds, so the pipeline comes first. */
  status('THE SKY', 0.62); await breathe();
  const pipeline = new LofiPipeline(renderer, {
    height: DETAIL[detailIndex],
    pixelHeight: PIXELS[pixelIndex],
    pixelAspect: PIXEL_ASPECT[pixarIndex].v,
    dither: 1.0, snap: 1.0,
  });
  const weather = new Weather({ hour: 2.0, kind: WEATHER_ORDER[prefs.weather] || 'clear' });
  const skyBaker = new SkyBaker(renderer, pipeline.lut, { seed: 11 });
  skyBaker.bake(weather.frame);
  world.skyTex.value = skyBaker.texture;

  status('BUILDING SELLWRONG', 0.68); await breathe();
  const level = buildSellWrong();
  const fleet = await fleetP;
  const police = await policeP;
  const apc = await apcP;
  const vtol = await vtolP;

  status('THE FLAMETHROWER', 0.78);
  const hud = new Hud(null);
  const input = new Input(renderer.domElement);
  const game = new Game({ level, scene, camera, textures, sprites, hud, audio, input, sky: skyBaker.texture,
                         flameAtlas: streamAtlas, bodyAtlas: flameAtlas, fxAtlases, gibAtlases, rainAtlas,
                         fleet, police, apc, vtol, weather });
  hud.game = game;
  const touch = new TouchControls(input, { root: $('touch'), prefs, onPause: () => pause(true) });

  const weapon3d = new Weapon3D({ aspect: 1.6 });
  await weapon3d.load(flameAtlas);
  game.weapon3d = weapon3d.ready ? weapon3d : null;
  hud.showWeaponSprite = !weapon3d.ready;
  console.log('guns: ' + (weapon3d.loaded.join(', ') || 'none'));

  status('PLANTING THE WOOD', 0.88); await breathe();
  if (forestArt) { game.forest.build(scene, forestArt); game.forest.attachFlames(scene, flameAtlas); }
  console.log(`wood: ${game.forest.treeCount} trees, ${game.forest.plantCount} plants`);

  status('OPENING', 0.95); await breathe();

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const r = pipeline.resize(w, h);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    weapon3d.setAspect(camera.aspect);
    /* THE READOUT IS MEASURED IN CHUNKY PIXELS, not in buffer ones. Its
       camera is orthographic, so its extents are a unit of measure
       rather than a resolution: a six-pixel glyph is six of the pixels
       you can SEE at any render size, and at a whole-number ratio the
       block average puts every one of its texels back exactly. */
    hud.resize(r.gridWidth, r.gridHeight);
    /* nothing is drawn along the bottom of the picture any more, so the
       controls sit on the edge */
    $('touch').style.setProperty('--bar', '0px');
    nameInset();
  }
  /* THE PAUSE BUTTON AND THE WEAPON'S NAME SHARE A CORNER on a phone,
     so the name steps left by the button's width — measured off the
     page in CSS pixels and handed to the readout in chunky ones, the
     same way the bar's height used to go the other way. */
  function nameInset() {
    const on = input.mode === 'touch';
    const w = container.clientWidth || window.innerWidth;
    hud.setNameInset(on ? Math.ceil(60 * pipeline.gridWidth / w) : 0);
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
  $('version').textContent = 'V' + VERSION;
  loading.classList.add('gone');
  title.classList.remove('gone');

  /* ---- which kind of machine this is, right now -------------------- */
  function applyMode(mode) {
    document.documentElement.classList.toggle('touch', mode === 'touch');
    touch.setEnabled(started && mode === 'touch' && game.state === 'play');
    $('opt-full').hidden = !fullscreenAllowed();
    nameInset();
  }
  input.onModeChange = applyMode;
  applyMode(input.mode);
  /* and a pad taking over from the thumbs, or handing back to them —
     which is not a mode change, only a fade; see Input.padHeld */
  input.onPadChange = on => touch.setPadHeld(on);

  /* ---- the settings ------------------------------------------------ */
  const sensEl = $('opt-sens'), sensV = $('opt-sens-v');
  const musicEl = $('opt-music'), musicV = $('opt-music-v');
  /* the three picture dials: pref key, the slider, and its readout */
  const PICTURE = [['bright', 'opt-bright', 'opt-bright-v'], ['contrast', 'opt-contrast', 'opt-contrast-v'],
                   ['gamma', 'opt-gamma', 'opt-gamma-v']];
  const setTog = (id, on) => $(id).setAttribute('aria-pressed', on ? 'true' : 'false');
  function syncMenu() {
    sensEl.value = prefs.sens;
    sensV.textContent = prefs.sens.toFixed(1) + 'X';
    musicEl.value = prefs.music;
    musicV.textContent = Math.round(prefs.music * 100) + '%';
    for (const [key, id, vid] of PICTURE) { $(id).value = prefs[key]; $(vid).textContent = prefs[key].toFixed(2); }
    setTog('opt-invert', prefs.invert);
    setTog('opt-lefty', prefs.lefty);
    setTog('opt-haptic', prefs.haptics);
    /* BOTH SIZES SHOWN IN FULL, because "400P" says nothing about how
       wide it is and the width is where the pixels are — and because the
       grid is clamped to the buffer, so the second number is the only
       place you can see that asking for pixels finer than the render did
       nothing. */
    $('opt-res-v').textContent = DETAIL[detailIndex] + 'P  ' + pipeline.width + '\u00d7' + pipeline.height;
    $('opt-res-down').disabled = detailIndex === 0;
    $('opt-res-up').disabled = detailIndex === DETAIL.length - 1;
    $('opt-pix-v').textContent = (PIXELS[pixelIndex] ? PIXELS[pixelIndex] + 'P' : 'OFF') +
      '  ' + pipeline.gridWidth + '\u00d7' + pipeline.gridHeight;
    $('opt-pix-down').disabled = pixelIndex === 0;
    $('opt-pix-up').disabled = pixelIndex === PIXELS.length - 1;
    $('opt-pixar').textContent = 'PIXEL ASPECT: ' + PIXEL_ASPECT[pixarIndex].n;
    /* WITH NO GRID THERE IS NOTHING FOR AN ASPECT TO BE THE ASPECT OF.
       A button that is present and inert is worse than one that is
       plainly unavailable, so it greys out with the filter. */
    $('opt-pixar').disabled = !PIXELS[pixelIndex];
    $('opt-crowd').textContent = 'CROWD: ' + CROWD[prefs.crowd].n;
    $('opt-fx').textContent = 'EFFECTS: ' + FX[prefs.fx].n;
    $('opt-wood').textContent = 'THE WOOD: ' + WOOD[prefs.wood].n;
    $('opt-time').textContent = 'TIME: ' + game.weather.label;
    $('opt-weather').textContent = 'WEATHER: ' + WEATHERS[WEATHER_ORDER[prefs.weather]].name;
    setTog('opt-fps', prefs.fps);
    setTog('opt-debug', prefs.debug);
    setTog('opt-godmode', prefs.godmode);
    $('opt-full').textContent = inFullscreen() ? 'LEAVE FULLSCREEN' : 'FULLSCREEN';
  }
  function applyPrefs() {
    input.sensitivity = 0.0022 * prefs.sens;    // the mouse and the thumb share one dial
    input.invertY = !!prefs.invert;
    touch.applyPrefs();
    pipeline.setPicture({ brightness: prefs.bright, contrast: prefs.contrast, gamma: prefs.gamma });
    music.setVolume(prefs.music);
    /* the three dials, straight onto the game — see game.quality */
    game.quality.crowd = CROWD[prefs.crowd].v;
    game.quality.effects = FX[prefs.fx].v;
    game.quality.wood = WOOD[prefs.wood].v;
    game.weather.setKind(WEATHER_ORDER[prefs.weather]);
    $('fps').hidden = !prefs.fps;
    /* and the two that are not picture settings: see Player.fuelTic and
       Player.damage, which are one branch each */
    game.player.debug = !!prefs.debug;
    game.player.invincible = !!prefs.godmode;
    savePrefs(prefs);
    syncMenu();
  }
  applyPrefs();
  sensEl.addEventListener('input', () => { prefs.sens = parseFloat(sensEl.value) || 1; applyPrefs(); });
  musicEl.addEventListener('input', () => { prefs.music = Math.max(0, Math.min(1, parseFloat(musicEl.value) || 0)); applyPrefs(); });
  for (const [key, id] of PICTURE)
    $(id).addEventListener('input', () => { prefs[key] = parseFloat($(id).value) || 1; applyPrefs(); });
  const toggle = (id, key) => $(id).addEventListener('click', () => { prefs[key] = !prefs[key]; applyPrefs(); });
  toggle('opt-invert', 'invert');
  toggle('opt-lefty', 'lefty');
  toggle('opt-haptic', 'haptics');
  $('opt-res-down').addEventListener('click', () => setDetail(detailIndex - 1));
  $('opt-res-up').addEventListener('click', () => setDetail(detailIndex + 1));
  $('opt-pix-down').addEventListener('click', () => setPixels(pixelIndex - 1));
  $('opt-pix-up').addEventListener('click', () => setPixels(pixelIndex + 1));
  /* THE LADDERS WRAP, because three states is short enough to walk
     round and a stepper for three is two buttons doing one job. */
  const ladder = (id, key, list, after) => $(id).addEventListener('click', () => {
    prefs[key] = (prefs[key] + 1) % list.length;
    if (after) after();                 // the ones that resize the picture
    applyPrefs();
  });
  ladder('opt-pixar', 'pixar', PIXEL_ASPECT, () => {
    pixarIndex = prefs.pixar;
    pipeline.setPixelAspect(PIXEL_ASPECT[pixarIndex].v);
    resize();
  });
  ladder('opt-crowd', 'crowd', CROWD);
  ladder('opt-fx', 'fx', FX);
  ladder('opt-wood', 'wood', WOOD);
  ladder('opt-weather', 'weather', WEATHER_ORDER);
  /* THE HOUR IS NOT A PREFERENCE, it is where the night has got to; the
     button steps it to the next keyframe, for looking at the dawn
     without waiting nine minutes for it */
  $('opt-time').addEventListener('click', () => {
    const h = game.weather.hour;
    const next = HOUR_STOPS.find(x => (x <= 12 ? x + 24 : x) > (h <= 12 ? h + 24 : h) + 0.01) ?? HOUR_STOPS[0];
    game.weather.setHour(next);
    syncMenu();
  });
  toggle('opt-fps', 'fps');
  toggle('opt-debug', 'debug');
  toggle('opt-godmode', 'godmode');
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
    /* the music starts on the tap, which is the gesture the browser
       wants; if the files are still arriving it starts when they have */
    musicP.then(() => music.start());
    if (input.mode === 'touch') { enterFullscreen(); touch.setEnabled(true); }
    else input.requestLock();
    input.keys.clear();
  }
  title.addEventListener('click', start);
  addEventListener('keydown', e => {
    if (!started && (e.code === 'Space' || e.code === 'Enter')) { start(); return; }
    if (started && game.state !== 'play' && e.code === 'Space') location.reload();
    /* SHIFT MOVES THE OTHER ONE. Two brackets for two sizes: the picture
       on its own, and the pixels it is made of with shift held. */
    if (e.code === 'BracketLeft') e.shiftKey ? setPixels(pixelIndex - 1) : setDetail(detailIndex - 1);
    if (e.code === 'BracketRight') e.shiftKey ? setPixels(pixelIndex + 1) : setDetail(detailIndex + 1);
    if (e.code === 'KeyN') {                       // palette off, for comparison
      const u = pipeline.material.uniforms.uSnap;
      u.value = u.value > 0.5 ? 0 : 1;
    }
    if (e.code === 'Backquote') { prefs.fps = !prefs.fps; applyPrefs(); }
  });
  renderer.domElement.addEventListener('mousedown', () => { if (!started) start(); else audio.resume(); });

  function setDetail(i) {
    detailIndex = Math.max(0, Math.min(DETAIL.length - 1, i));
    pipeline.setHeight(DETAIL[detailIndex]);
    resize();
    prefs.detail = detailIndex;
    savePrefs(prefs);
    syncMenu();
  }

  function setPixels(i) {
    pixelIndex = Math.max(0, Math.min(PIXELS.length - 1, i));
    pipeline.setPixels(PIXELS[pixelIndex]);
    resize();
    prefs.pixels = pixelIndex;
    savePrefs(prefs);
    syncMenu();
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
    music.tick();
    game.render(now);
    /* the sky, again, when the hour or the cloud has moved enough */
    skyBaker.update(game.weather.frame, now / 1000);
    const p = game.player;
    if (started) weapon3d.update(p, p.firing, game.tics, dt);
    hud.update(p, weapons);
    overlays[0].visible = started && weapon3d.ready && !p.dead;
    overlays[1].visible = started;
    pipeline.render(scene, camera, overlays);

    fpsAccum += dt; fpsFrames++;
    if (fpsAccum > 0.5) {
      const el = $('fps');
      /* AND WHAT THE FRAME IS ACTUALLY SPENT ON, since the readout is a
         setting now rather than a debug key: the buffer's size, how many
         of the crowd got drawn against how many there are, and the two
         fires. `draws` is what the renderer issued last frame, which is
         the number the culling in Actor.render exists to move. */
      if (el && prefs.fps) {
        let drawn = 0, live = 0;
        for (const a of game.actors) {
          if (a.removed || !a.state) continue;
          live++; if (a.mesh && a.mesh.visible) drawn++;
        }
        el.textContent = `${Math.round(fpsFrames / fpsAccum)} FPS  ${pipeline.width}x${pipeline.height}  ` +
          `${renderer.info.render.calls} draws  ${drawn}/${live} things  ` +
          `${game.fire.burningCells} alight  ${game.forest.burningCells} wood  ` +
          `${game.flame.liveCount + game.fx.liveCount} particles  ` +
          `${game.weather.label} ${game.weather.kind} ${skyBaker.bakes} bakes`;
      }
      fpsAccum = 0; fpsFrames = 0;
    }
  }
  requestAnimationFrame(frame);

  /* let the console poke at it */
  window.SELLWRONG = { game, pipeline, renderer, scene, camera, textures, sprites, world, level, input, touch, weapon3d, music, weather: game.weather, skyBaker,
                       responders: game.responders, giblets: game.giblets };
}

boot().catch(e => {
  console.error(e);
  failed('FAILED: ' + e.message);
  const s = $('load-status');
  if (s) s.style.color = '#f44';
});
