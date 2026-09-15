/* =====================================================================
   GROCERY STORE SIMULATOR — the clock, the weather and the wind
   =====================================================================

   One state, read by everybody, so that the hour the sky says it is,
   the distance the air lets you see, the direction the smoke drifts
   and the rain that is falling on a burning car park are one fact and
   not four. See SIGHT.txt for why it is built this way.

   TIME OF DAY IS ONE NUMBER, the hour, and everything below is a table
   lookup on it: five or six keyframes across the night, interpolated.
   The judgement — what colour 05:10 is — lives in the table, in
   Javascript, where a headless test can read it. The shader gets
   uniforms and does arithmetic.

   THE GAME IS A NIGHT, so the clock is a night. It starts at two in the
   morning, which is the hour the game has always been set at, and runs
   at a rate that brings the sun up in about nine minutes of play — you
   have until dawn. A full day is more rows in the same table.

   WEATHER IS A ROW multiplied over the hour's row: how far the air lets
   you see (which is also the draw distance — see airFar), how much sky
   is left, whether there is cloud over the stars, whether it rains,
   and which way the wind blows.

   THE WIND WAS WIND_X = 0.28 in js/effects.js, read by three smoke
   emitters and nothing else, with a comment claiming the forest leaned
   with it. It is a vector here now, and the smoke, the rain, the
   store's fire and the wood's fire all read the same two numbers.

   COLOURS ARE WRITTEN AS BYTES — hex, the way anybody picks a colour —
   and are converted to linear where they go into a shader, because
   everything in this renderer's buffer is linear.
   ===================================================================== */

import { world } from './material.js';
import { TICRATE } from './util.js';

/* --------------------------------------------------------------------
   The night, in keyframes

   sunAlt is the sun's altitude in degrees; below about -18 it does
   nothing, and the dawn is the last three rows. The moon is its own
   pair. `glow` is the light along the horizon on the sun's side, which
   at 05:10 is the whole dawn, and `town` is the sodium glow low in the
   west that any night sky near people has. `stars` and `milky` are how
   much of the starfield and the band across it survive the sky's own
   brightness. `skyLight` is what an outdoor surface is lit to by the
   sky alone — the vertex's own light is the floor and this lifts it —
   and `minLight` the darkest anything gets by distance.
   ------------------------------------------------------------------ */
export const KEYFRAMES = [
  { hour: 22.0, zenith: '#0a1030', horizon: '#182240', ground: '#07080c',
    sunAlt: -34, sunCol: '#000000', glow: '#000000', glowAmt: 0.0,
    moonAlt: 48, moonAz: -1.2, town: 0.55, stars: 1.0, milky: 0.9,
    skyLight: 0.10, minLight: 0.22, falloff: 3400 },
  { hour: 2.0,  zenith: '#080c26', horizon: '#141c38', ground: '#050608',
    sunAlt: -52, sunCol: '#000000', glow: '#000000', glowAmt: 0.0,
    moonAlt: 36, moonAz: -2.0, town: 0.5, stars: 1.0, milky: 1.0,
    skyLight: 0.08, minLight: 0.22, falloff: 3400 },
  { hour: 4.5,  zenith: '#0c1430', horizon: '#2a3450', ground: '#0a0c12',
    sunAlt: -9,  sunCol: '#8090b0', glow: '#4a5570', glowAmt: 0.55,
    moonAlt: 18, moonAz: -2.7, town: 0.3, stars: 0.5, milky: 0.3,
    skyLight: 0.22, minLight: 0.26, falloff: 4200 },
  { hour: 5.17, zenith: '#182446', horizon: '#6a5878', ground: '#1a161e',
    sunAlt: -4,  sunCol: '#e0a080', glow: '#d08060', glowAmt: 0.9,
    moonAlt: 10, moonAz: -2.9, town: 0.1, stars: 0.06, milky: 0.0,
    skyLight: 0.45, minLight: 0.32, falloff: 5200 },
  { hour: 5.67, zenith: '#4a6aa8', horizon: '#d8b890', ground: '#3a3630',
    sunAlt: 0,   sunCol: '#fff0c0', glow: '#ffd090', glowAmt: 1.0,
    moonAlt: 4,  moonAz: -3.05, town: 0.0, stars: 0.0, milky: 0.0,
    skyLight: 0.75, minLight: 0.40, falloff: 7000 },
  { hour: 6.5,  zenith: '#5a86c8', horizon: '#c8d4e0', ground: '#46484a',
    sunAlt: 9,   sunCol: '#fff8e0', glow: '#ffe8b0', glowAmt: 0.6,
    moonAlt: -5, moonAz: -3.1, town: 0.0, stars: 0.0, milky: 0.0,
    skyLight: 0.95, minLight: 0.48, falloff: 9000 },
  { hour: 8.0,  zenith: '#5080c8', horizon: '#bcd0e4', ground: '#4c4e50',
    sunAlt: 24,  sunCol: '#fffcf0', glow: '#fff0d0', glowAmt: 0.35,
    moonAlt: -20, moonAz: -3.1, town: 0.0, stars: 0.0, milky: 0.0,
    skyLight: 1.0, minLight: 0.52, falloff: 9000 },
];

/* where the sun comes up: a little north of east, in map compass terms
   (0 is east, a quarter turn is north) */
export const SUN_AZ = 0.35;
/* and where the town is, for the glow: west */
export const TOWN_AZ = Math.PI;

/* --------------------------------------------------------------------
   The weather

   airNear/airFar   the distance at which the air starts to take a
                    surface and the distance at which it has taken it
                    entirely — WHICH IS THE DRAW DISTANCE. Nothing past
                    airFar is drawn, because nothing past it can be seen
   skyMul           the hour's skyLight, scaled: cloud takes light away
   stars            what is left of the starfield under the cloud
   cover            how much of the sky the clouds take, 0..1
   cloudDark        how dark the cloud is, 1 for a fair-weather cloud
   flat             1 for mist: the sky is one colour to the zenith
   rain             how hard, 0..1
   wind             units per tic, map x and y
   haze             what the air itself adds to the sky, as bytes —
                    mist at night is GREY and not black, because it is
                    lit by every lamp in the car park, and the first
                    screenshot of night mist was a black sky over a
                    car park with the far cars simply gone
   ------------------------------------------------------------------ */
export const WEATHERS = {
  clear:    { name: 'CLEAR',    airNear: 1200, airFar: 14000, skyMul: 1.00, stars: 1.0,
              cover: 0.18, cloudDark: 1.0, flat: 0, rain: 0.0, wind: [0.28, 0.05], haze: '#000000' },
  overcast: { name: 'OVERCAST', airNear: 800,  airFar: 9000,  skyMul: 0.80, stars: 0.0,
              cover: 0.92, cloudDark: 0.8, flat: 0, rain: 0.0, wind: [0.40, 0.10], haze: '#0c0c10' },
  rain:     { name: 'RAIN',     airNear: 500,  airFar: 5200,  skyMul: 0.70, stars: 0.0,
              cover: 1.0,  cloudDark: 0.6, flat: 0, rain: 1.0, wind: [0.90, 0.20], haze: '#101014' },
  mist:     { name: 'MIST',     airNear: 200,  airFar: 2600,  skyMul: 0.85, stars: 0.0,
              cover: 0.0,  cloudDark: 1.0, flat: 1, rain: 0.0, wind: [0.05, 0.00], haze: '#2c2c32' },
};
export const WEATHER_ORDER = ['clear', 'overcast', 'rain', 'mist'];

/* A clear night's draw distance, which is what the wood's own range
   was written against. Every other weather is a fraction of it. */
export const CLEAR_FAR = WEATHERS.clear.airFar;

/* How fast the night goes: hours per minute of play. Two in the
   morning to sunrise in about nine minutes. */
export const HOURS_PER_MINUTE = 0.4;

/* --------------------------------------------------------------------
   What everybody else reads

   Plain numbers, mutated in place, the way `world` in js/material.js
   is: the smoke emitters, the two fires and the rain read these and
   never ask the Weather object anything.
   ------------------------------------------------------------------ */
export const climate = {
  hour: 2.0,
  kind: 'clear',
  wind: { x: WEATHERS.clear.wind[0], y: WEATHERS.clear.wind[1] },
  rain: 0,
  /* how much of a surface's light the sky supplies right now, 0..1 —
     the same number the shader gets, kept here for anything that wants
     to know whether it is dark without asking the GPU */
  skyLight: 0.08,
  /* the draw distance, in units */
  airFar: CLEAR_FAR,
};

const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/* sRGB bytes to linear, which is the space the buffer is in */
export const toLinear = c => c.map(v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));

/** Hours on a clock that runs 22:00 to 08:00 — anything is mapped onto
 *  that span so 1.5 and 25.5 are the same moment. */
export function nightHour(h) {
  let x = ((h % 24) + 24) % 24;
  if (x < 12) x += 24;                    // 0..12 -> 24..36, after 22
  return Math.max(22, Math.min(32, x));   // 22:00 .. 08:00
}

/**
 * The hour's row, interpolated. Colours come back as [r,g,b] in BYTE
 * space, 0..1; convert with toLinear at the shader.
 */
export function sampleHour(hour) {
  const h = nightHour(hour);
  const rows = KEYFRAMES.map(k => ({ ...k, at: nightHour(k.hour) })).sort((a, b) => a.at - b.at);
  let a = rows[0], b = rows[rows.length - 1];
  for (let i = 0; i < rows.length - 1; i++)
    if (h >= rows[i].at && h <= rows[i + 1].at) { a = rows[i]; b = rows[i + 1]; break; }
  const t = a === b || b.at === a.at ? 0 : clamp01((h - a.at) / (b.at - a.at));
  const col = k => lerp3(hex(a[k]), hex(b[k]), t);
  const num = k => lerp(a[k], b[k], t);
  const sunAlt = num('sunAlt');
  return {
    hour: h > 24 ? h - 24 : h,
    zenith: col('zenith'), horizon: col('horizon'), ground: col('ground'),
    sunAlt, sunAz: SUN_AZ, sunCol: col('sunCol'), glow: col('glow'), glowAmt: num('glowAmt'),
    moonAlt: num('moonAlt'), moonAz: num('moonAz'),
    town: num('town'), stars: num('stars'), milky: num('milky'),
    skyLight: num('skyLight'), minLight: num('minLight'), falloff: num('falloff'),
    /* how much of a day it is: nothing until the sun is twelve degrees
       under, everything once it is three up */
    daylight: smooth(-12, 3, sunAlt),
  };
}

/** The hour's row and the weather's row, folded together into the one
 *  frame the sky bake and the uniforms are set from. */
export function sampleFrame(hour, kind = 'clear', cloudTime = 0) {
  const f = sampleHour(hour);
  const w = WEATHERS[kind] || WEATHERS.clear;
  const haze = hex(w.haze || '#000000');
  const add = c => c.map((v, i) => Math.min(1, v + haze[i]));
  return {
    ...f,
    zenith: add(f.zenith), horizon: add(f.horizon), ground: add(f.ground),
    kind, airNear: w.airNear, airFar: w.airFar,
    skyLight: f.skyLight * w.skyMul,
    stars: f.stars * w.stars, milky: f.milky * w.stars,
    cover: w.cover, cloudDark: w.cloudDark, flat: w.flat, rain: w.rain,
    wind: w.wind, cloudTime,
  };
}

/* --------------------------------------------------------------------
   The Weather: the clock ticking, and the uniforms pushed
   ------------------------------------------------------------------ */
export class Weather {
  constructor(opts = {}) {
    this.hour = opts.hour ?? 2.0;
    this.kind = WEATHERS[opts.kind] ? opts.kind : 'clear';
    this.rate = opts.rate ?? HOURS_PER_MINUTE;    // hours per minute
    this.running = opts.running ?? true;
    /* the clouds' own clock, in seconds; it never stops, because a
       cloud that holds still while the game is paused is fine and a
       cloud that jumps when it resumes is not */
    this.cloudTime = 0;
    this.frame = sampleFrame(this.hour, this.kind, 0);
    this._sync();
  }

  setHour(h) { this.hour = nightHour(h); this.hour = this.hour > 24 ? this.hour - 24 : this.hour; this._sync(); }
  setKind(k) { if (WEATHERS[k]) { this.kind = k; this._sync(); } }

  /** One world tic: the night advances. */
  tic() {
    if (this.running) {
      this.hour += this.rate / 60 / TICRATE;
      /* the clock stops at eight — past sunrise the table is flat and
         there is nothing left for the hour to say */
      if (nightHour(this.hour) >= 32) this.hour = 8.0;
    }
  }

  /** Once a frame: the clouds drift, and every atmosphere uniform is
   *  set from the hour, the weather and how much of the world is on
   *  fire. `burn` is the store's burn fraction, `wood` the forest's;
   *  the smoke is theirs, everything else is the sky's. */
  apply(dt, burn = 0, wood = 0) {
    this.cloudTime += dt;
    this.frame = sampleFrame(this.hour, this.kind, this.cloudTime);
    const f = this.frame;

    world.airNear.value = f.airNear;
    world.airFar.value = f.airFar;
    world.skyLight.value = f.skyLight;
    world.lightFalloff.value = f.falloff;
    /* THE SMOKE, which used to be the only fog there was. Lit, warm,
       and stopping well short of opaque — see the note that was on
       this in js/fire.js. The wood adds its share and a forest is big,
       so its share stays small. */
    world.smokeDensity.value = Math.min(0.50, burn * 1.2 + wood * 0.5);
    world.smokeColor.value.setRGB(0.46 + burn * 0.12, 0.34 + burn * 0.08, 0.24 + burn * 0.03);
    /* A gutted store lit only by embers is, accurately, almost pitch
       black — and the player still has to find the way out of it. So
       the ambient lifts as the place goes. Accuracy loses this one on
       purpose. */
    world.minLight.value = f.minLight + burn * 0.30;
    world.globalLight.value = 1.0 + burn * 0.22;

    this._sync();
    return f;
  }

  _sync() {
    const w = WEATHERS[this.kind];
    climate.hour = this.hour;
    climate.kind = this.kind;
    climate.wind.x = w.wind[0]; climate.wind.y = w.wind[1];
    climate.rain = w.rain;
    climate.skyLight = this.frame ? this.frame.skyLight : 0;
    climate.airFar = w.airFar;
  }

  /** "02:00", for a menu. */
  get label() {
    const h = ((this.hour % 24) + 24) % 24;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}

/** The hours a menu can step through: every keyframe. */
export const HOUR_STOPS = KEYFRAMES.map(k => k.hour);
