/* =====================================================================
   GROCERY STORE SIMULATOR — materials, and light that steps instead of fading
   =====================================================================

   There is one material in this game and it is unlit. Nothing here has a
   normal, nothing has a specular, nothing is lit by a light source. A
   surface's brightness is a number the map author wrote down, darkened by
   how far away it is, and quantised into 32 steps on the way.

   That last part is the whole trick. Doom did not multiply anything by
   anything — it kept 32 pre-darkened copies of the palette and picked
   one. So light does not fade down a corridor, it STEPS down, and you can
   see the steps, and after thirty years those steps are what the eye
   reads as "this is that kind of game". Smooth falloff costs nothing and
   throws it all away.

   FAKE CONTRAST comes free with the same idea. Doom nudged the light
   level up on walls running east-west and down on walls running
   north-south. It is not a lighting model — there is no sun and the
   nudge is the same at midnight — but it means a corner between two walls
   is always visible, in a renderer with no shading at all. Baked into the
   vertex light by the geometry builder, so it costs nothing here either.

   SMOKE is the one thing that moves. As the store burns, uFogDensity
   climbs and the far end of every aisle goes grey, which is both the
   atmosphere and an honest gameplay signal: when you can no longer see
   the checkouts from Aisle 6, it is time to leave.

   THE SHADING IS EXPORTED AS GLSL, not only as materials. The forest,
   the particles and the flame all draw with their own vertex paths —
   instanced, animated, burning — but every one of them has to sit in
   the same light as the walls or it reads as a sticker on the picture.
   So the lighting is two GLSL strings any shader can splice in, and the
   three materials below are only the plain ways of using them.
   ===================================================================== */

import * as THREE from 'three';
import { EMBER_RAMP } from './palette.js';

/* Every material in the game shares these objects. Mutate .value on one
   and the whole store changes on the next frame — no walking a scene
   graph, no keeping a list. */
export const world = {
  globalLight:  { value: 1.0 },      // damage flash, light-amp pickup, blackout
  lightFalloff: { value: 1400.0 },   // units at which the diminishing bottoms out
  minLight:     { value: 0.12 },     // how dark the far end of a lit room gets
  fogColor:     { value: new THREE.Color(0x0a0a0c) },
  fogNear:      { value: 300.0 },
  fogFar:       { value: 2200.0 },
  fogDensity:   { value: 0.0 },      // smoke — driven by how much of the store is alight
  tint:         { value: new THREE.Color(1, 1, 1) },  // pain red, pickup gold

  /* THE FIRE GLOW. One light, for the whole game.

     Everything else here is unlit on purpose, but a store that is
     burning down and does not get brighter as it burns is a store that
     is not really burning. So there is exactly one point light, parked
     at the centre of mass of whatever is alight nearest the player, and
     its intensity is how much of it there is. One light is enough
     because from inside a burning aisle the whole aisle is the light —
     you never see two fires as two sources, you see the room glowing.

     It is added AFTER the light is quantised into its 32 steps, so the
     glow slides smoothly over the banding instead of fighting it. */
  fireLightPos:   { value: new THREE.Vector3(0, -10000, 0) },
  fireLightRange: { value: 512.0 },
  fireLight:      { value: 0.0 },
  fireLightColor: { value: new THREE.Color(1.0, 0.55, 0.18) },

  /* THE COALS. One clock for everything in the game that is still
     glowing after the flame has gone — the burning trees run on it, and
     so does every charred and gutted surface in the store. Seconds. */
  emberTime: { value: 0.0 },

  /* HOW BURNT EVERY PIECE OF FLOOR IS, as a picture.

     The store's surfaces used to know three things about the fire:
     untouched, charred, gutted. Two steps, both of them a texture swap,
     and between them nothing — an aisle could lose half its stock
     without a pixel of it changing, and then change all at once.

     THE FIRST FIX WAS ONE TEXEL PER SECTOR and it was the wrong picture,
     which the user reported as z-fighting. A sector's progress is one
     number, so every surface in it sooted together, and the sectors of
     this map are big axis-aligned rectangles: a burnt aisle met a clean
     cross-aisle along a dead-straight line, exactly vertical or exactly
     horizontal on screen, with a different texture and a different light
     on each side. That does not read as a fire. It reads as a fault.

     So the picture is the FIRE'S OWN GRID: 32-unit cells, the same ones
     it spreads through, one byte each, sampled here by WORLD POSITION
     with a linear filter. The soot front then creeps at the resolution
     the fire has and crosses a sector boundary without knowing it is
     there. It also answers the question better for the surfaces that are
     not floors — a wall reads the cells it stands in and a ceiling the
     cells under it, rather than whichever sector it was filed under.

     `burnOrigin` and `burnCell` are the grid's corner and pitch in world
     units; `burnSide` is the square texture it is laid out in and
     `burnCols`/`burnRows` how much of that square is grid, so anything
     off the edge of the fire's world reads zero rather than the clamped
     edge. See Game.ticBurnGrid. */
  burnGrid:   { value: null },
  burnOrigin: { value: new THREE.Vector2(0, 0) },
  burnCell:   { value: 32.0 },
  burnSide:   { value: 1.0 },
  burnCols:   { value: 1.0 },
  burnRows:   { value: 1.0 },
  emberRamp: { value: EMBER_RAMP.map(c => new THREE.Vector3(c[0], c[1], c[2])) },
};

/* The uniform declarations every lit fragment shader needs, matching
   `worldUniforms()` below one for one. */
export const WORLD_UNIFORMS_GLSL = /* glsl */`
uniform float globalLight;
uniform float lightFalloff;
uniform float minLight;
uniform vec3  fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float fogDensity;
uniform vec3  tint;
uniform vec3  fireLightPos;
uniform float fireLightRange;
uniform float fireLight;
uniform vec3  fireLightColor;
uniform float emberTime;
uniform vec3  emberRamp[8];
uniform sampler2D burnGrid;
uniform vec2  burnOrigin;
uniform float burnCell;
uniform float burnSide;
uniform float burnCols;
uniform float burnRows;
`;

/* The two halves of the lighting, as functions.

   worldBand: a surface's own light, diminished by distance and snapped
   to Doom's 32 steps. `sky` is how much of the light arrives from the
   sky rather than a fitting (stretches the falloff, lifts its floor);
   `fullbright` short-circuits the lot for things that are their own
   light.

   worldShade: the banded light applied to a colour, then the fire glow
   on top of the banding, then the smoke. */
export const WORLD_SHADE_GLSL = /* glsl */`
/* ---------------------------------------------------------------------
   THE COALS ON A BURNT SURFACE

   A charred wall used to be a picture of embers: the ash and the little
   orange specks were baked into the texture and they sat there, dead, at
   the exact moment the game most wants to look alive. The burning trees
   have never had that problem — their shader runs the eight-colour ember
   ramp against a clock — and this is the same maths, on the same ramp,
   on the same clock, so that a charred aisle and a charred fir are one
   fire going out rather than two effects that happen to be orange.

   WHERE THE COALS SIT, with no second texture to say so: a scatter of
   world-space cells about five units across, kept only where the surface
   is ALREADY DARK. Coals live in the recesses of a burnt thing — the
   char between the boards, the gap between the studs — and a burnt
   texture's own dark places are exactly those recesses. So the texture
   picks the spots and the shader lights them.

   It costs nothing where nothing has burnt, which is most of the game
   and all of it until you do something.
   ------------------------------------------------------------------- */
float emberHash(vec3 c) {
  return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

vec3 emberOf(float charAmt, vec3 wpos, float lum, float depth) {
  if (charAmt <= 0.001) return vec3(0.0);
  /* CHUNKY, AND THERE ARE NOT MANY. The first cut used cells five units
     across and lit a quarter of them, which at a grazing angle put more
     coals on a ceiling than there were pixels to draw them in: it read
     as television static rather than as a fire going out. Fourteen-unit
     cells are about the size of a coal you would see across a shop, and
     one in twelve of them is alight. */
  vec3 cell = floor(wpos * 0.07);
  float h = emberHash(cell);
  float h2 = fract(h * 197.13);
  /* And they fade out with distance for the same reason. A coal is a
     small bright thing; small bright things at three thousand units are
     one pixel of aliasing each. */
  float near = 1.0 - smoothstep(700.0, 2000.0, depth);
  if (near <= 0.001) return vec3(0.0);
  /* a scatter, in the DARK parts — coals live in the recesses, and a
     burnt texture's own dark places are exactly those recesses */
  float sit = smoothstep(0.93 - charAmt * 0.05, 0.995 - charAmt * 0.04, h)
            * (1.0 - smoothstep(0.07, 0.32, lum)) * near;
  if (sit <= 0.001) return vec3(0.0);
  /* Two sines beaten against each other so neighbouring coals are out of
     step — the trees' trick, and the reason a burnt surface breathes
     instead of pulsing all at once. */
  float flick = 0.70 + 0.36
    * sin(emberTime * 9.0 + h * 31.4 + wpos.y * 0.17)
    * sin(emberTime * 3.7 + h2 * 12.0 + wpos.x * 0.11);
  float heat = clamp(sit * (0.45 + 0.75 * charAmt), 0.0, 1.0);
  /* and the palette cycle: quantised to whole steps of the ramp, so it
     flips between real colours instead of sliding through the gaps */
  float ph = emberTime * 0.9 + h * 6.28 + h2 * 2.1;
  float wave = abs(fract(ph) * 2.0 - 1.0) - 0.5;
  float idx = clamp(heat + wave * 0.40, 0.0, 1.0);
  return emberRamp[int(floor(idx * 7.0 + 0.5))] * (heat * flick * 0.55);
}

/* ---------------------------------------------------------------------
   A REGION BEING BURNT, RATHER THAN HAVING BEEN

   How burnt the piece of floor under this pixel is, read out of the
   fire's own cell grid. Off the edge of the fire's world — a sprite in
   the woods, anything the grid does not cover — is zero rather than the
   clamped edge value, or the far wall of the car park would soot itself
   from whatever the last cell of the shop was doing.
   ------------------------------------------------------------------- */
float burnAt(vec3 w) {
  /* The renderer's z runs BACKWARDS against the map's y — see addQuad in
     js/mapgeo.js — so the grid is indexed with -z. */
  vec2 c = (vec2(w.x, -w.z) - burnOrigin) / burnCell;
  if (c.x < 0.0 || c.y < 0.0 || c.x > burnCols || c.y > burnRows) return 0.0;
  return texture2D(burnGrid, (c + 0.5) / burnSide).r;
}

/* ---------------------------------------------------------------------
   SOOT, WHICH ARRIVES BEFORE THE FIRE DOES

   The thing a burning shop does that this game was not drawing: it goes
   BLACK, gradually, in patches, starting at the corners and the joints,
   long before anything in it has actually burnt. Two texture swaps — one
   at half the region's fuel and one at nearly all of it — cannot say
   that, and the first half of every region's life was therefore
   invisible: an aisle lost half its stock without a pixel changing and
   then changed all at once.

   WHERE IT LANDS FIRST is a world-space field, two scales of it: cells
   about a shelf bay across decide which patches go early, and cells a
   few units across ragged the edge of each one. So the soot has a SHAPE
   of its own rather than a level of its own, and it spreads across a
   wall as the region's number climbs — the lowest-numbered cells first,
   joining up, until the wall is black. Nothing about it is per-region
   except the number, so two aisles burning at once are never in step,
   because they are not in the same place.

   AND THE EDGE CRAWLS, on the coals' own clock, which is what makes a
   wall halfway through catching still be doing something while you look
   at it. The advancing edge is also the only part of it that is HOT: a
   scorch mark is orange at its rim and dead black behind it, which is
   one line of arithmetic (the product of the amount and its complement,
   which peaks exactly where the boundary is) and is the difference
   between soot spreading and a texture fading.

   It costs nothing where nothing has burnt, which is most of the game
   and all of it until you do something.
   ------------------------------------------------------------------- */
float sootAmount(float burn, vec3 wpos) {
  /* Up over the region's first two fifths, and then OUT again as the
     charred textures arrive at the halfway mark and take the job over.
     Both are driven by the same number, so the hand-off cannot drift. */
  float pre = smoothstep(0.015, 0.40, burn) * (1.0 - smoothstep(0.44, 0.58, burn));
  if (pre <= 0.002) return 0.0;
  float h = emberHash(floor(wpos * 0.028)) * 0.74      // a bay across
          + emberHash(floor(wpos * 0.115) + 31.0) * 0.26;  // and its ragged edge
  float crawl = 0.05 * sin(emberTime * 0.55 + h * 26.0)
              + 0.03 * sin(emberTime * 0.19 + h * 7.3);
  return clamp((pre * 1.3 - h + crawl) / 0.26, 0.0, 1.0);
}

vec3 sootOn(vec3 c, float soot, vec3 wpos) {
  if (soot <= 0.002) return c;
  /* Soot is not a grey filter. It is carbon: it takes the colour out
     first and the brightness after, so a red fascia goes brown and then
     black rather than pink and then grey.

     HOW DARK IS NOT A MATTER OF TASTE, it is a matter of matching what
     this hands over to. At half a region's fuel the charred textures
     arrive, and charVariant in js/textures.js keeps between a third and
     four fifths of every pixel and then puts pale ash over the top of
     it — deliberately, twice over, because a burnt store dark enough to
     be accurate is a store you cannot walk back out of. The first cut of
     this took the albedo to a fifth, which the room light then took to
     nothing, and a 40%-burnt aisle was a black void with shoppers
     floating in it. So it keeps about half, patchily, and gets its own
     ash for the same reason the textures have theirs. */
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float h2 = emberHash(floor(wpos * 0.09) + 7.0);
  float keep = 0.38 + h2 * 0.22;
  vec3 burnt = mix(c, vec3(lum), 0.55) * keep + vec3(0.022, 0.018, 0.015);
  vec3 out_ = mix(c, burnt, soot);
  /* the ash, pale and patchy, which is the only thing you can see the
     shape of a sooty wall by */
  out_ += vec3(0.055, 0.052, 0.050) * smoothstep(0.66, 0.98, h2) * soot;
  /* and the rim, which is the only part of it still alight: the product
     of the amount and its complement peaks exactly at the boundary, so
     the advancing edge glows and the burnt side behind it does not */
  float edge = soot * (1.0 - soot) * 4.0;
  float flick = 0.7 + 0.3 * sin(emberTime * 7.0 + wpos.x * 0.09 + wpos.y * 0.13);
  return out_ + vec3(0.24, 0.07, 0.014) * edge * flick;
}

float worldBand(float lightIn, float depth, float sky, float fullbright) {
  /* Distance diminishing. Linear in depth, because Doom's was too, and
     because an inverse-square falloff in a corridor lit by nothing in
     particular just looks broken.

     Under the sky the same curve is stretched and its floor lifted, so
     the far end of the car park stays a car park. */
  float fall = lightFalloff * mix(1.0, 3.4, sky);
  float mn   = min(0.85, minLight + 0.32 * sky);
  float dim = 1.0 - clamp(depth / fall, 0.0, 1.0);
  float l = lightIn * mix(mn, 1.0, dim) * globalLight;

  /* THE STEP. 32 levels, same as Doom's 32 colormaps. Everything above is
     continuous maths; this is the line that makes it look right. */
  l = floor(l * 32.0 + 0.5) * (1.0 / 32.0);
  return mix(l, 1.0, fullbright);
}

vec3 worldShade(vec3 albedo, float l, float depth, vec3 world, float fullbright) {
  vec3 c = albedo * l * tint;

  /* Firelight, added on top of the banded light rather than folded into
     it — a smooth glow crossing the steps is what a real light in a
     stepped-lighting room looks like. Falls off as the square of the
     distance and is clamped, so standing in it does not blow out to
     white. */
  if (fireLight > 0.0) {
    float fd = distance(world, fireLightPos);
    float fa = clamp(1.0 - fd / fireLightRange, 0.0, 1.0);
    fa *= fa;
    c += albedo * fireLightColor * (fa * fireLight * (1.0 - fullbright * 0.7));
  }

  /* Smoke. Multiplied by fogDensity so a store that is not yet on fire has
     no haze at all rather than a permanent grey wash. */
  float f = clamp((depth - fogNear) / max(1.0, fogFar - fogNear), 0.0, 1.0) * fogDensity;
  /* the smoke is lit by the fire under it, not by the room: its floor
     sits well above the room's own light, or a burning store goes black */
  return mix(c, fogColor * max(l, 0.7), f);
}
`;

const COMMON_VERT = /* glsl */`
varying vec2  vUv;
varying float vLight;
varying float vDepth;
varying vec3  vWorld;
varying float vSky;
varying float vChar;

#ifdef PER_VERTEX_LIGHT
  attribute float light;
  /* HOW MUCH OF THIS SURFACE'S LIGHT COMES FROM THE SKY.

     Doom diminished everything by distance at one rate, which is right
     for a corridor lit by fittings and wrong the moment a level has a
     six-thousand-unit car park in it: the far end of the parade came out
     as a black mass, because the far end of a CORRIDOR should. Outside,
     the source is the sky, it is behind you as well as in front of you,
     and it does not run out at any distance you can walk.

     So this is a property of the surface, not a global: 1 outdoors, 0
     indoors, and in between under a canopy — which is exactly what a
     canopy is. It stretches the falloff and lifts its floor, and nothing
     indoors changes at all. */
  attribute float sky;
  /* how burnt this surface's region is: 0 untouched, about a half
     charred, 1 gutted. Set by js/mapgeo.js, read by emberOf. */
  attribute float charred;
#else
  uniform float light;
  uniform float sky;
  uniform float charred;
#endif

#ifdef BILLBOARD
  uniform float billboardRot;    // yaw the quad is turned to, in world space
  uniform vec2  spriteScale;     // width, height in world units
  uniform vec2  spriteOffset;    // x nudge, y lift off the floor
#endif

void main() {
  vUv = uv;
  vLight = light;
  vSky = sky;
  vChar = charred;

  vec3 p = position;

  #ifdef BILLBOARD
    /* The quad is authored as a unit square with its foot at y=0. Scale it,
       nudge it, then spin it about Y only — never about X. A Doom sprite
       stays bolt upright however far you are looking up or down; tilting it
       to face the camera properly is the one "improvement" that instantly
       stops it looking like Doom. */
    p.x *= spriteScale.x;
    p.y *= spriteScale.y;
    p.x += spriteOffset.x;
    p.y += spriteOffset.y;
    float c = cos(billboardRot), s = sin(billboardRot);
    p = vec3(p.x * c, p.y, -p.x * s);
  #endif

  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const COMMON_FRAG = /* glsl */`
uniform sampler2D map;
uniform float alphaTest;
uniform float fullbright;      // 1.0 = ignore distance and sector light entirely
${WORLD_UNIFORMS_GLSL}

varying vec2  vUv;
varying float vLight;
varying float vDepth;
varying vec3  vWorld;
varying float vSky;
varying float vChar;

${WORLD_SHADE_GLSL}

void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < alphaTest) discard;
  /* HOW BURNT THE FLOOR UNDER THIS PIXEL IS, continuously. The soot goes
     on the ALBEDO, before the light and before the smoke, because that
     is where it is: a wall with soot on it is a darker wall, and it
     diminishes down an aisle and catches the firelight exactly as the
     wall does. Adding it afterwards would have made a sooty wall in the
     dark end of aisle nine darker than the air in front of it. */
  float burn = burnAt(vWorld);
  float soot = sootAmount(burn, vWorld);
  vec3 albedo = sootOn(t.rgb, soot, vWorld);
  float l = worldBand(vLight, vDepth, vSky, fullbright);
  vec3 c = worldShade(albedo, l, vDepth, vWorld, fullbright);
  /* The coals go on AFTER the smoke, so a burnt aisle glows through it —
     and they arrive on how burnt the floor there is rather than on the
     sector's stage, so the first few show up in the recesses while there
     is still stock on the shelves and they thicken from there. */
  c += emberOf(max(vChar, smoothstep(0.06, 0.92, burn)), vWorld,
               dot(albedo, vec3(0.2126, 0.7152, 0.0722)), vDepth);
  gl_FragColor = vec4(c, t.a);
}
`;

/** The shared uniform objects, for a shader that splices the GLSL above. */
export function worldUniforms() {
  return {
    globalLight:  world.globalLight,
    lightFalloff: world.lightFalloff,
    minLight:     world.minLight,
    fireLightPos:   world.fireLightPos,
    fireLightRange: world.fireLightRange,
    fireLight:      world.fireLight,
    fireLightColor: world.fireLightColor,
    fogColor:     world.fogColor,
    fogNear:      world.fogNear,
    fogFar:       world.fogFar,
    fogDensity:   world.fogDensity,
    tint:         world.tint,
    emberTime:    world.emberTime,
    emberRamp:    world.emberRamp,
    burnGrid:     world.burnGrid,
    burnOrigin:   world.burnOrigin,
    burnCell:     world.burnCell,
    burnSide:     world.burnSide,
    burnCols:     world.burnCols,
    burnRows:     world.burnRows,
  };
}

function baseUniforms(texture, opts) {
  return {
    map:          { value: texture },
    alphaTest:    { value: opts.alphaTest ?? 0.0 },
    fullbright:   { value: opts.fullbright ? 1.0 : 0.0 },
    ...worldUniforms(),
  };
}

/* Level geometry: light is baked per vertex by the map builder, so an
   entire store's worth of walls sharing one texture is one draw call. */
export function createWallMaterial(texture, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: baseUniforms(texture, opts),
    defines: { PER_VERTEX_LIGHT: '' },
    vertexShader: COMMON_VERT,
    fragmentShader: COMMON_FRAG,
    transparent: !!opts.transparent,
    side: opts.side ?? THREE.FrontSide,
    depthWrite: opts.depthWrite !== false,
    toneMapped: false,
    fog: false,
  });
}

/* Sprites: one light value for the whole quad, updated each tic from
   whichever sector the thing is standing in.

   `blend` is the one thing here that is not Doom. Doom had exactly one
   way of drawing a sprite — a cut-out, every pixel either there or not —
   and everything in this game that is a THING is drawn that way. Fire is
   not a thing. Two flames overlapping are brighter than one flame, which
   is the whole reason a fire reads as light rather than as orange
   wallpaper, and no amount of cut-out gets you there: it is the one
   effect that needs the frame buffer added to rather than replaced.

     'cutout' (the default)  alpha-tested, writes depth, Doom's way
     'add'                   added to what is there, no depth write
     'alpha'                 blended over it, no depth write — smoke */
export function createSpriteMaterial(texture, opts = {}) {
  const u = baseUniforms(texture, opts);
  u.light         = { value: opts.light ?? 1.0 };
  u.sky           = { value: opts.sky ?? 0.0 };
  u.billboardRot  = { value: 0.0 };
  u.spriteScale   = { value: new THREE.Vector2(opts.width ?? 64, opts.height ?? 64) };
  u.spriteOffset  = { value: new THREE.Vector2(0, 0) };
  const blend = opts.blend || 'cutout';
  /* Depth TESTING stays on for all three, always: a flame behind a
     gondola is behind the gondola. It is only depth WRITING that a
     translucent sprite must not do, or the next one to draw is clipped
     against a pane of glass the first one left behind. */
  return new THREE.ShaderMaterial({
    uniforms: u,
    defines: { BILLBOARD: '' },
    vertexShader: COMMON_VERT,
    fragmentShader: COMMON_FRAG,
    transparent: blend !== 'cutout' ? true : !!opts.transparent,
    blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    depthWrite: blend === 'cutout' ? opts.depthWrite !== false : false,
    toneMapped: false,
    fog: false,
  });
}

/* Flat, screen-space, no world lighting at all — the weapon in your hands
   and the status bar. Doom drew these straight into the frame buffer and
   so do we. */
export function createHudMaterial(texture) {
  const u = baseUniforms(texture, { alphaTest: 0.5, fullbright: true });
  u.light = { value: 1.0 };
  u.sky = { value: 0.0 };
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: COMMON_VERT,
    fragmentShader: COMMON_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
}
