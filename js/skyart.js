/* =====================================================================
   GROCERY STORE SIMULATOR — the sky, baked in the page
   =====================================================================

   The sky used to be the one picture in the game that was a
   photograph: a Polyhaven night, baked to the palette offline by
   tools/bake-sky.mjs. A night is fine as a photograph. A dawn is not,
   because there are forty of them between two in the morning and six.
   So the sky is generated here, at start-up and then again whenever
   the hour has moved enough to show, the way every other picture in
   the game is generated — and the photograph is gone.

   IT IS STILL A BAKED PICTURE, and that is the whole architecture. It
   would be simpler to evaluate the sky per fragment on the sphere. It
   would also be wrong, for the reason bake-sky.mjs already gave: the
   post pass dithers in GRID space, so a sky computed per fragment gets
   a dither pattern nailed to the screen that crawls across the stars
   every time you turn your head. A picture is dithered ONCE, in its own
   texels, and the pattern is nailed to the sky. So this bakes into a
   1024 x 256 equirect, on the GPU, with the same Bayer and the same
   palette snap the post pass uses (js/lofi.js exports them), and the
   sphere in js/sky.js wears the result exactly as it wore the PNG.

   AND THE FOG READS THE SAME TEXELS. The world shader samples this
   texture's horizon row in the fragment's own azimuth for the colour
   the air fades a far wall to (see worldShade in js/material.js). Not
   a colour tuned to look like the sky: the sky. They cannot disagree,
   because there is nothing to keep in agreement.

   WHAT IS IN IT
     a ramp        horizon to zenith, and a ground below the horizon
                     that starts as the horizon's own colour so the
                     far plane's cut has nothing to show
     the sun       a disc, and a glow along the horizon on its side,
                     which at 05:10 IS the dawn
     the moon      a disc a couple of degrees across — half a degree
                     would be one texel here — and a soft halo
     the stars     one texel each, on a hash of the texel, thinned
                     toward the zenith where an equirect bunches them,
                     and a band across them with more in it
     the clouds    value noise on a plane over your head, drifting
                     with the wind, lit by the dawn from its side and
                     by the town from below, and taking the stars away
     the town      a sodium glow low in the west
   Everything is in byte space until the last line, which snaps it to
   the palette and converts to linear, because that is what a palette
   PNG sampled by the GPU would have handed the buffer.

   THE COORDINATES. A texel (u, v) is the world direction the sphere
   shows at that texel: u is the azimuth, atan2(z, x) over a full turn
   in the RENDERER's axes (its z is the map's minus y), and v is the
   elevation, with the horizon at one half. That mapping was measured
   against three's SphereGeometry with the mesh's x mirrored, not
   derived, and js/material.js uses the same formula to find the
   horizon texel for the fog.
   ===================================================================== */

import * as THREE from 'three';
import { PALETTE_GLSL } from './lofi.js';
import { LUT_SIZE } from './palette.js';
import { toLinear } from './weather.js';

export const SKY_W = 1024, SKY_H = 256;

const VERT = /* glsl */`
precision highp float;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */`
precision highp float;
uniform vec3  uZenith, uHorizon, uGround;
uniform vec3  uSunDir, uSunCol, uGlow;
uniform float uGlowAmt, uSunUp;
uniform vec3  uMoonDir;
uniform float uMoonAmt;
uniform vec3  uTownDir;
uniform float uTown;
uniform float uStars, uMilky, uDaylight;
uniform float uCover, uCloudDark, uFlat, uCloudTime;
uniform vec2  uWind;
uniform float uDither;
uniform float uSeed;
varying vec2 vUv;
${PALETTE_GLSL}

const float PI = 3.14159265;

/* the direction this texel looks in — see the header for the mapping */
vec3 dirOf(vec2 uv) {
  float phi = uv.x * 2.0 * PI;
  float e = (uv.y - 0.5) * PI;
  float c = cos(e);
  return vec3(cos(phi) * c, sin(e), sin(phi) * c);
}

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }

/* value noise, smooth, two octaves short of the CPU one in js/pixel.js
   because a cloud is a soft thing */
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i), b = hash2(i + vec2(1.0, 0.0)), c = hash2(i + vec2(0.0, 1.0)), d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int o = 0; o < 4; o++) { v += vnoise(p) * amp; p = p * 2.03 + vec2(17.0, 9.0); amp *= 0.5; }
  return v;
}

void main() {
  vec3 dir = dirOf(vUv);
  float e = dir.y;                                     // sine of the elevation
  vec3 hd = normalize(vec3(dir.x, 0.0, dir.z));        // where on the horizon

  /* THE RAMP. Above the horizon, horizon to zenith with most of the
     change low down; below it, the horizon's own colour for the first
     few degrees and then the ground. In mist the sky is one colour. */
  float up = clamp(e, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
  col = mix(col, uHorizon, uFlat);
  col = mix(col, uGround, smoothstep(0.0, 0.08, -e));

  /* THE SUN'S GLOW ALONG THE HORIZON. Strongest straight toward the
     sun, dying off away from it and up from it. Under a dozen degrees
     of sun this is the whole dawn. */
  vec3 sd = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
  float toward = max(dot(hd, sd), 0.0);
  float glow = pow(toward, 3.0) * exp(-max(e, 0.0) * 7.0) * uGlowAmt * (1.0 - uFlat * 0.5);
  col += uGlow * glow;

  /* THE TOWN, low in the west, sodium orange, whatever the hour */
  float townGlow = pow(max(dot(hd, uTownDir), 0.0), 5.0) * exp(-max(e, 0.0) * 10.0) * uTown;
  col += vec3(0.42, 0.30, 0.12) * townGlow;

  /* THE SUN ITSELF: a tight corona, a wide faint glow and a disc, only
     once it is over the line. The corona was one wide term at first and
     at eight in the morning it was a white blob a third of the sky
     across, snapped into cyan. */
  float ca = dot(dir, uSunDir);
  col += uSunCol * (pow(max(ca, 0.0), 300.0) * 0.7 + pow(max(ca, 0.0), 10.0) * 0.08) * uSunUp;
  float disc = smoothstep(cos(0.016), cos(0.010), ca) * uSunUp;
  col = mix(col, uSunCol * 1.15, disc);

  /* THE MOON: two degrees across, which is four times life size and
     the smallest thing that reads as a moon at this many texels */
  float cm = dot(dir, uMoonDir);
  float halo = pow(max(cm, 0.0), 60.0) * 0.22 * uMoonAmt;
  float mdisc = smoothstep(cos(0.020), cos(0.016), cm) * uMoonAmt;
  col += vec3(0.62, 0.66, 0.78) * halo;
  col = mix(col, vec3(0.86, 0.87, 0.90) * (1.0 - uDaylight * 0.4), mdisc);

  /* THE CLOUDS. Noise on a plane over your head, so they are big
     overhead and crowd toward the horizon the way clouds do, drifting
     with the wind. Thin at the horizon, where a real sky's clouds are
     lost in the air. */
  vec2 cp = dir.xz / max(e, 0.10) * 1.6 + uWind * uCloudTime * 0.012 + vec2(3.7, 1.9);
  float n = fbm(cp);
  float cloud = smoothstep(1.0 - uCover, 1.0 - uCover + 0.35, n) * smoothstep(0.0, 0.14, e);
  cloud *= 1.0 - uFlat;
  /* what a cloud is lit by: a little of the sky it sits in, the dawn
     from the side, the town from below, and the day, when there is one */
  vec3 cloudCol = mix(uZenith * 1.5 + vec3(0.025), uHorizon, 0.45) * uCloudDark;
  cloudCol += uGlow * glow * 1.4 + uSunCol * pow(max(ca, 0.0), 4.0) * 0.30 * uSunUp;
  cloudCol += vec3(0.42, 0.30, 0.12) * townGlow * 1.6;
  cloudCol = mix(cloudCol, vec3(0.84, 0.86, 0.90) * uCloudDark, uDaylight * 0.85);
  /* the underside of a thick cloud is darker than its edge */
  cloudCol *= 1.0 - 0.35 * smoothstep(0.3, 1.0, cloud);

  /* THE STARS: a hash of the texel, one texel each, thinned by the
     cosine of the elevation because an equirect has as many texels
     round the zenith as round the horizon and the sky does not. And a
     band across them — the Milky Way — with more of them in it. */
  vec2 cell = floor(vUv * vec2(${SKY_W}.0, ${SKY_H}.0));
  float h = hash2(cell + 0.5);
  vec3 bandN = normalize(vec3(0.30, 0.55, 0.78));
  float band = 1.0 - smoothstep(0.0, 0.24, abs(dot(dir, bandN)));
  float density = 0.007 * max(cos((vUv.y - 0.5) * PI), 0.0) * (1.0 + band * 2.5);
  float star = step(1.0 - density, h) * (0.35 + 0.65 * fract(h * 77.7));
  star *= smoothstep(0.005, 0.03, e) * uStars * (1.0 - cloud) * (1.0 - disc) * (1.0 - mdisc);
  vec3 milky = vec3(0.22, 0.23, 0.32) * band * (0.5 + 0.5 * fbm(dir.xz * 5.0 + dir.y * 3.0)) * uMilky * smoothstep(0.0, 0.05, e);
  col += milky * (1.0 - cloud);
  col += vec3(0.80, 0.84, 1.00) * star;

  col = mix(col, cloudCol, cloud);

  /* THE PAINT. Dithered in the sky's own texels, snapped to the
     palette, and then linear — see the header for why each. */
  float t = (bayer4(gl_FragCoord.xy) / 15.0 - 0.5) * uDither * (1.0 / 32.0);
  vec3 snapped = palSnap(clamp(col + t, 0.0, 1.0));
  vec3 lin = pow((snapped + 0.055) / 1.055, vec3(2.4));
  lin = mix(snapped / 12.92, lin, step(0.04045, snapped));
  gl_FragColor = vec4(lin, 1.0);
}
`;

/* a map compass direction (0 east, a quarter turn north) and an
   altitude, as a unit vector in the renderer's axes */
function dirOf(az, altDeg) {
  const a = altDeg * Math.PI / 180, c = Math.cos(a);
  return new THREE.Vector3(Math.cos(az) * c, Math.sin(a), -Math.sin(az) * c);
}

export class SkyBaker {
  /**
   * @param renderer  the WebGLRenderer
   * @param lut       the palette atlas texture the post pass already built
   * @param opts.seed where the stars are; the same seed is the same sky
   */
  constructor(renderer, lut, opts = {}) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(SKY_W, SKY_H, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    });
    this.target.texture.name = 'sky-bake';
    this.texture = this.target.texture;

    const V3 = THREE.Vector3;
    this.material = new THREE.RawShaderMaterial({
      uniforms: {
        /* a little over half the post pass's dither: the frame is
           dithered again on the way to the screen, and the two at full
           strength made the dawn a crosshatch */
        tLut: { value: lut }, uLutSize: { value: LUT_SIZE }, uDither: { value: 0.6 },
        uSeed: { value: opts.seed ?? 0.0 },
        uZenith: { value: new V3() }, uHorizon: { value: new V3() }, uGround: { value: new V3() },
        uSunDir: { value: new V3(1, 0, 0) }, uSunCol: { value: new V3() }, uGlow: { value: new V3() },
        uGlowAmt: { value: 0 }, uSunUp: { value: 0 },
        uMoonDir: { value: new V3(0, 1, 0) }, uMoonAmt: { value: 1 },
        uTownDir: { value: new V3(-1, 0, 0) }, uTown: { value: 0 },
        uStars: { value: 1 }, uMilky: { value: 1 }, uDaylight: { value: 0 },
        uCover: { value: 0 }, uCloudDark: { value: 1 }, uFlat: { value: 0 }, uCloudTime: { value: 0 },
        uWind: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.quad = new THREE.Mesh(geo, this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.Camera();

    this.bakes = 0;
    this._lastBake = -1e9;
    this._lastHour = null;
    this._lastKind = null;
  }

  /** Set every uniform from a weather frame — see sampleFrame in
   *  js/weather.js — and draw the sky into the target. */
  bake(f) {
    const u = this.material.uniforms;
    const set3 = (k, c) => u[k].value.set(c[0], c[1], c[2]);
    set3('uZenith', f.zenith); set3('uHorizon', f.horizon); set3('uGround', f.ground);
    set3('uSunCol', f.sunCol); set3('uGlow', f.glow);
    u.uSunDir.value.copy(dirOf(f.sunAz, f.sunAlt));
    u.uGlowAmt.value = f.glowAmt;
    /* the disc and its halo arrive over about a degree either side of
       the horizon rather than popping */
    u.uSunUp.value = Math.max(0, Math.min(1, (f.sunAlt + 0.6) / 1.2));
    u.uMoonDir.value.copy(dirOf(f.moonAz, f.moonAlt));
    u.uMoonAmt.value = f.moonAlt > -2 ? Math.max(0, Math.min(1, (f.moonAlt + 2) / 4)) * (1 - f.cover * 0.5) * (1 - f.flat) : 0;
    u.uTownDir.value.copy(dirOf(Math.PI, 0));
    u.uTown.value = f.town;
    u.uStars.value = f.stars; u.uMilky.value = f.milky; u.uDaylight.value = f.daylight;
    u.uCover.value = f.cover; u.uCloudDark.value = f.cloudDark; u.uFlat.value = f.flat;
    u.uCloudTime.value = f.cloudTime;
    u.uWind.value.set(f.wind[0], -f.wind[1]);     // map y is the renderer's minus z

    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
    this.bakes++;
    this._lastHour = f.hour; this._lastKind = f.kind;
    return this.texture;
  }

  /** Bake again only when it would show: the hour has moved, the
   *  weather has changed, or there is cloud and it has drifted. At most
   *  twice a second — a quarter of a megapixel each time, which is
   *  nothing, and a sky that steps twice a second is a sky in a game
   *  whose world steps thirty-five times a second. */
  update(f, nowSeconds) {
    const since = nowSeconds - this._lastBake;
    const moved = this._lastHour === null || Math.abs(f.hour - this._lastHour) > 0.004 || f.kind !== this._lastKind;
    const drifting = f.cover > 0 && since > 0.5;
    if (!(moved || drifting) || since < 0.25) return false;
    this._lastBake = nowSeconds;
    this.bake(f);
    return true;
  }
}

/** The horizon colour the fog will use for a given azimuth, worked out
 *  the way the shader does it — the ramp at the horizon plus the sun's
 *  and the town's glow — in LINEAR, so a headless test can hold the
 *  air against the sky without a GPU. It is the ramp and the glows
 *  only: a star or a cloud edge on the horizon row is a texel the fog
 *  also reads, and is the sky agreeing with itself either way. */
export function horizonColour(f, az) {
  const hd = [Math.cos(az), -Math.sin(az)];
  const sd = [Math.cos(f.sunAz), -Math.sin(f.sunAz)];
  const toward = Math.max(hd[0] * sd[0] + hd[1] * sd[1], 0);
  const glow = Math.pow(toward, 3) * f.glowAmt * (1 - f.flat * 0.5);
  const td = [Math.cos(Math.PI), -Math.sin(Math.PI)];
  const town = Math.pow(Math.max(hd[0] * td[0] + hd[1] * td[1], 0), 5) * f.town;
  const c = [0, 1, 2].map(i => f.horizon[i] + f.glow[i] * glow + [0.42, 0.30, 0.12][i] * town);
  return toLinear(c.map(v => Math.max(0, Math.min(1, v))));
}
