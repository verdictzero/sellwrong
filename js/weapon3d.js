/* =====================================================================
   GROCERY STORE SIMULATOR — the thing in your hands
   =====================================================================

   FOUR MODELS NOW, and this file used to be certain there was one.
   Three are somebody else's, dropped in as they stand: the
   flamethrower the user built was replaced by one of Vaportrash's, at
   the user's request, and the extinguisher and the cerebral bore came
   from there too. The fourth, the minigun, is the user's own again, and
   carries its own nozzle and a barrel set that turns — see GUNS.
   All are .glb, all are drawn in the same little scene
   in front of the world, and that scene has its own perspective camera
   sitting at the origin looking down -z with the gun parked in front of
   it in metres — so "where the gun is on screen" is the handful of
   numbers in VIEW below, and nothing about the level or the player's
   position enters into it.

   BOTH ARE LOADED AT START AND ONE IS VISIBLE. Swapping weapons hides a
   group and shows another, which costs nothing; loading on the switch
   would cost a hitch in the middle of the one moment the player is
   asking for something to happen.

   IT IS DRAWN INTO THE SAME LOW-RES BUFFER as the world, after it and
   over it, with depth cleared in between so the barrel never pokes
   through a wall you are standing against. That buffer is what keeps a
   1024-pixel painted diffuse honest: at three hundred rows the texels
   are chunky again, and the palette snap eats the gun along with the
   floor.

   HEAVILY LOW AND RIGHT, as asked — the body of the gun is off the
   bottom of the frame and the barrel comes in across the lower right
   quarter, the way it is drawn in every game that got this right. What
   is on screen is the end that matters: the nozzle, whatever is burning
   under it, and what comes out.

   WHERE THE NOZZLE IS, AND HOW IT WAS FOUND. It used to be two ways:
   the old flamethrower carried marker spheres, put there in Blender by
   the user and baked into the file's extras by tools/prep-model.mjs,
   and everything else said so in GUNS below. There is only the second
   way now, because there is no longer a model in the game that the
   user made: the standing rule since the van is that somebody else's
   file is not rewritten on the way in, so the anchors are numbers in
   GUNS, in the MODEL'S own units — the game saying where it intends to
   point rather than the game editing the asset. The reader they are
   read back through (asset.extras.anchors) is kept, because a model
   that does carry markers is still handled.

   AND THE NUMBERS WERE MEASURED OFF PICTURES. A gun with no markers has
   to be looked at: the new flamethrower was drawn flat from its left,
   from above and straight down the barrel, over a grid ruled in the
   model's own units, with candidate points crossed on it and moved
   until they sat where they belong. That is how [0, 3.9, 24.3] and
   [0, 3.0, 25.7] below came to be — the centre of the bore inside the
   C-shaped muzzle bracket, and the lip of the little gold igniter pipe
   that runs under the barrel and turns up in front of it. Reading the
   bounding box of a part would have put the first of them inside the
   metal and the second on the wrong tube.

   AND ONE OF THEM HAD TO BE RESIZED, which is the other thing a file
   somebody else made will do to you. The flamethrower is 1.4 units nose
   to tail and centred on its own origin; the extinguisher is 4.7 units
   long and stands on that origin like a model on a table. `fit` scales a
   model to the game's length and recentres it on its own bounding box,
   and the anchor goes through the same transform, so a gun either
   arrives in this scene's frame already or says what to do about it.
   ===================================================================== */

import * as THREE from 'three';
import { loadGLB } from './glb.js';

/* How long a gun is in this scene, in metres, measured off the
   flamethrower — which is the one VIEW was tuned against, so it is the
   ruler whether or not it is a round number. */
export const GUN_LENGTH = 1.4;

/* THE GUNS, keyed by the weapon that holds them.

     url     the model
     fit     scale it to this length and centre it on its own box. Absent
             means the model is already in this scene's frame, which is
             true of exactly one of them and only because it was made for
             it
     out     how far in front of the eye it is held, as a multiple of
             VIEW.pos's z, which is how much of the gun's LENGTH is on
             screen: at 1 the back quarter of a gun is behind the eye and
             what you see is the front half, filling the corner; at 3 the
             whole thing is in front of you and reads end to end. Absent
             means 1
     nozzle  where the business end is, in the MODEL'S own units. Absent
             means the file says so itself, in asset.extras.anchors
     pilot   a small flame that is always alight, on the same terms.
             A gun that does not burn anything does not have one
     tint    what the muzzle effect is coloured, and `cold` whether the
             frames are desaturated first. The two weapons use the same
             twenty frames of billowing and differ by those two: one is
             fire as painted, one is the white-blue of something very
             cold leaving a nozzle very fast
     muzzle  how long and wide that effect is, in metres
     pos     a gun's own offset on VIEW.pos, in metres, for one that is
             carried somewhere other than where a hose is. Absent means
             none
     rot     and its own turn on VIEW's, pitch yaw roll, for the same
             reason. Absent means none
     heat    the material that glows with use and the run of the
             barrels along it — see GUN_FRAG. Only the minigun has one
     spin    turns a second the part the file names as rotating makes
             at full speed. Only the minigun has one */
export const GUNS = {
  /* THE CEREBRAL BORE, the user's third model and the one with nothing
     coming out of the nozzle but a red line: the projectile is the
     world's business (js/bore.js) and the sight is drawn from the point
     nozzleWorld hands over. Stripped of its normal and metal-rough maps
     by tools/prep-model.mjs, which is the same treatment the
     flamethrower got and half of what it weighed. */
  BORE: {
    url: 'assets/models/bore.glb',
    /* A THIRD SMALLER AND A THIRD FARTHER OFF than the other two, at
       the user's request: the launcher is a big square thing, and at
       the flamethrower's size and distance it was a quarter of the
       picture. `fit` is the size. `out` multiplies how far in front of
       the eye it is held — z alone, a push straight back along the
       view, which is what holding a thing farther from your face is.
       The first try scaled the whole position, along the line from the
       eye, on the theory that a point moved along that line keeps its
       place on screen; it does, but the place it kept was the gun's
       CENTRE, which sits below the bottom of the frame by design, so
       the gun shrank around a point you cannot see and all but left the
       picture. Pushed straight back it recedes toward the middle of the
       screen the way anything farther off does, and stays in its
       corner. The two numbers together halve it on screen. See update(). */
    fit: GUN_LENGTH * 0.67,
    out: 1.33,
    /* the mouth of the launcher, off the model's own vertices: the
       furthest along +z are at 34.7 and sit a little under the centre
       line, so this is just past them and on it */
    nozzle: [0, -4, 37],
    pilot: null,
    /* what leaves the launcher: a short red exhaust, not a flame —
       scaled with the launcher, since it hangs off the model's group
       in metres and not off the model */
    tint: [1.6, 0.30, 0.22],
    muzzle: { len: 0.094, wid: 0.067 },
  },
  /* THE FLAMETHROWER, the user's second: a Sketchfab model of
     Vaportrash's, in place of the one the user built, at the user's
     request. Seventeen meshes on one painted sheet, forty-six units
     nose to tail with the barrel along +z, and no markers in it — see
     the note above for how its two anchors were found.

     HELD THREE TIMES AS FAR OUT as the old one was, at the user's
     request, because this gun is worth looking at and at arm's length
     you saw a red bottle and nothing else: a quarter of its length was
     behind the eye and the rest was too close to read. At three the
     whole weapon is in front of you — muzzle, bottles, receiver, grip —
     and the bottle that used to fill the corner is a third of what it
     was. */
  FLAMER: {
    url: 'assets/models/flamethrower.glb',
    fit: GUN_LENGTH,
    out: 3.0,
    /* the centre of the bore, a little past the front of the muzzle
       bracket, so the stream is born outside the metal */
    nozzle: [0, 3.9, 24.3],
    /* and the lip of the igniter pipe below it, which reaches further
       forward than the barrel does — the same arrangement the old gun
       had, and the reason a flamethrower has a small flame burning on
       it when the trigger is up */
    pilot: [0, 3.0, 25.7],
    tint: [1, 1, 1],
    muzzle: { len: 0.34, wid: 0.14 },
  },
  /* AND THE EXTINGUISHER RIFLE, held nearly as far out and for the same
     reason: it is a fire extinguisher with a stock on it and the joke
     only lands if you can see the whole of it. */
  EXTINGUISHER: {
    url: 'assets/models/extinguisher.glb',
    fit: GUN_LENGTH,
    out: 2.8,
    /* the tip of the barrel, measured off the model's own vertices: the
       forty furthest along +z average to (0, 0.76, 2.16) and this is a
       little past them, so the plume starts outside the metal */
    nozzle: [0, 0.78, 2.20],
    pilot: null,
    tint: [0.72, 1.02, 1.45],
    cold: true,
    muzzle: { len: 0.30, wid: 0.22 },
  },
  /* THE MINIGUN, the user's fourth model and the first since the old
     flamethrower to carry its own answers: a marker cylinder named for
     the emission point, which tools/prep-model.mjs takes out of the
     mesh and writes into the file's extras as the nozzle, and a barrel
     set named to be ROTATED, which it leaves in and names in the same
     place (extras.spin). So `nozzle` is null here — the file says — and
     the game's part is how it is held and what happens to it in use.

     IN THE CORNER, the user's pick of the six placements that were
     drawn up for it (see README, THE MINIGUN, for the other five and
     what each looked like): held on VIEW's own hold like the streams
     are, a quarter longer than the flamethrower and a little nearer
     than it, so the receiver fills the corner and the barrel set comes
     in across the lower right quarter of the picture. Any of the
     others is a `pos` and a `rot` on this entry and a change to these
     two numbers.

     `heat` is the barrel material and the run of the barrels along it,
     in the model's own units: the shader tints that material from the
     muzzle back as the gun is used (see GUN_FRAG), dull red first,
     orange, and then the yellow-white of steel that should have
     stopped. `spin` is how many turns a second the barrel set makes at
     full speed. */
  MINIGUN: {
    url: 'assets/models/minigun.glb',
    fit: GUN_LENGTH * 1.25,
    out: 2.6,
    nozzle: null,
    pilot: null,
    /* what leaves the muzzle: a short hard flash rather than a tongue,
       the frames desaturated and pushed toward white-yellow */
    tint: [1.7, 1.4, 0.8],
    cold: true,
    muzzle: { len: 0.34, wid: 0.30 },
    heat: { material: 'minigun_barrel_mat', z: [-0.83, 10.56] },
    spin: 6,
  },
};

/* Where the gun sits in front of the eye, in metres, and how it is
   turned. Both models' barrels run along +z; the camera looks down -z;
   so it is turned half a circle and then a touch inward so the barrel
   points at the middle of the picture rather than parallel to it. */
export const VIEW = {
  pos: [0.33, -0.40, -0.33],
  yaw: 0.17, pitch: 0.04, roll: -0.05,
  fov: 62,
};

/* Game units to a metre of gun, when a point in this scene has to be
   handed to the world. The nozzle is projected as a RAY — a point
   scaled along the line from the eye keeps its place on screen
   whatever this number is — so it only decides how far in front of the
   eye the stream is born, and forty puts it a little past arm's reach
   and clear of the near plane. */
export const UNITS_PER_METRE = 40;

/* AND THE FURTHEST INTO THE WORLD THAT POINT MAY EVER BE, which is a
   cap and not a distance. A gun held further out (see `out`) is drawn
   further from the eye, so its nozzle is further along the ray, so the
   stream would be born deeper into the level — and at three times out
   that is seventy units in front of a player whose own radius is
   sixteen, which is the far side of a shelf you are standing against.
   How far a gun is DRAWN is a question about the picture; where its
   fire starts is a question about the level, and the two stopped being
   the same question the moment the guns moved. Forty-six is what the
   longest-reaching of them measured before any of this, so nothing
   about the world changed on the day the picture did. */
export const NOZZLE_REACH = 46;

const GUN_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
varying vec3 vL;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vP = mv.xyz;
  vL = position;
  gl_Position = projectionMatrix * mv;
}
`;

/* Painted diffuse, a single fixed key light banded into twelve steps so
   it reads as the same kind of light as the walls, and two warm glows:
   the pilot, small and steady, and the muzzle, big and only while
   firing. No world lighting reaches the gun — a held object is lit by
   whatever is nearest, and what is nearest is its own flame. */
const GUN_FRAG = /* glsl */`
uniform sampler2D map;
uniform float glow;
uniform vec3  glowPos;
uniform float pilot;
uniform vec3  pilotPos;
uniform float dim;
uniform float heat;
uniform vec2  heatZ;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
varying vec3 vL;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  vec3 N = normalize(vN);
  vec3 L = normalize(vec3(-0.35, 0.85, 0.40));
  float d = max(0.0, dot(N, L));
  float l = (0.50 + 0.50 * d) * dim;
  l = floor(l * 12.0 + 0.5) / 12.0;
  vec3 c = t.rgb * l;
  /* THE BARRELS HEAT UP. heat is 0..1 and only ever set on the one
     material the gun's table names (see GUNS[].heat); heatZ is the
     run of the barrels in the mesh's own units, muzzle end last, and
     the glow climbs from the muzzle back down them as the heat rises
     — dull red first, then orange, then the yellow-white of steel that
     should have stopped. Banded like the light above, so it reads as
     the same kind of picture as the rest of the gun. */
  if (heat > 0.001) {
    float along = clamp((vL.z - heatZ.x) / max(heatZ.y - heatZ.x, 1e-4), 0.0, 1.0);
    float h = heat * smoothstep(0.0, 0.9, along * 0.7 + heat * 0.3);
    h = floor(h * 8.0 + 0.5) / 8.0;
    vec3 hot = h < 0.5 ? mix(vec3(0.42, 0.02, 0.0), vec3(1.0, 0.36, 0.05), h * 2.0)
                       : mix(vec3(1.0, 0.36, 0.05), vec3(1.0, 0.92, 0.62), (h - 0.5) * 2.0);
    c = mix(c, hot, h * 0.85) + hot * h * 0.35;
  }
  vec3 fire = vec3(1.0, 0.55, 0.20);
  vec3 tg = glowPos - vP;
  float gd = length(tg);
  float ga = clamp(1.0 - gd / 0.8, 0.0, 1.0);
  ga *= ga;
  float gn = 0.35 + 0.65 * max(0.0, dot(N, tg / max(gd, 1e-4)));
  c += t.rgb * fire * ga * gn * glow * 1.7;
  vec3 tp = pilotPos - vP;
  float pd = length(tp);
  float pa = clamp(1.0 - pd / 0.24, 0.0, 1.0);
  pa *= pa;
  c += t.rgb * fire * pa * pilot;
  gl_FragColor = vec4(c, 1.0);
}
`;

const FLAME_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
/* THE SAME FRAMES, TWICE, and the second time they are not fire.
   A tint MULTIPLIES, which is fine for making fire warmer or dimmer and
   useless for making it cold: orange times blue is a muddy olive,
   because there is no blue in the picture to keep. So `desat` takes the
   frame's LUMINANCE first — its shape, with its colour thrown away —
   and the tint then says what colour that shape is. At 0 nothing
   happens and the flamethrower's frames come through as painted; at 1
   the same twenty frames of billowing are a plume of whatever you like,
   which is how one atlas covers both a flame and a jet of CO2. */
const FLAME_FRAG = /* glsl */`
uniform sampler2D map;
uniform float frame;
uniform float frames;
uniform vec3  tint;
uniform float desat;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vec2((vUv.x + frame) / frames, vUv.y));
  if (t.a < 0.5) discard;
  vec3 c = mix(t.rgb, vec3(dot(t.rgb, vec3(0.30, 0.59, 0.11))), desat);
  gl_FragColor = vec4(c * tint, 1.0);
}
`;

function flameMaterial(atlas) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: atlas.texture }, frame: { value: 0 }, frames: { value: atlas.frames },
                tint: { value: new THREE.Vector3(1, 1, 1) }, desat: { value: 0 } },
    vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
    side: THREE.DoubleSide, depthWrite: false, toneMapped: false, fog: false,
  });
}

/* A quad lying along +z from the origin: width across x (or y), length
   along z, v running from the base at z=0 to the tip. Two of them
   crossed make a flame that reads from any angle you can see a gun from. */
function tongue(len, wid, vertical) {
  const g = new THREE.BufferGeometry();
  const h = wid / 2;
  const p = vertical
    ? [0, -h, 0,  0, h, 0,  0, h, len,  0, -h, len]
    : [-h, 0, 0,  h, 0, 0,  h, 0, len,  -h, 0, len];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export class Weapon3D {
  constructor({ aspect = 1.6 } = {}) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(VIEW.fov, aspect, 0.02, 12);
    this.guns = {};                  // name -> what load() built
    this.active = null;              // the one on screen
    this.failed = false;
    this.visible = false;
    this.sway = { x: 0, y: 0 };
    this.kick = 0;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._ndc = new THREE.Vector3();
  }

  /* Whether there is anything to draw. The sprite fallback in the HUD
     turns on when there is not. */
  get ready() { return !!this.gun; }
  /** The gun currently in hand, or null. */
  get gun() { return this.active ? this.guns[this.active] : null; }
  /* kept because the loading screen and the smoke test both ask */
  get loaded() { return Object.keys(this.guns); }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Show one and hide the rest. Unknown, or a weapon whose model never
   *  arrived, leaves whatever was in hand — a missing model is a missing
   *  picture and never a missing weapon. */
  setWeapon(name) {
    if (!this.guns[name] || name === this.active) return;
    for (const [k, g] of Object.entries(this.guns)) g.group.visible = k === name;
    this.active = name;
  }

  /**
   * Every gun in GUNS, into its own group in the one scene.
   *
   * @param atlas  { texture, frames } of flame frames for the pilots and
   *               the muzzle effects
   * @param which  optionally a subset, for a test that wants one
   */
  async load(atlas, which = Object.keys(GUNS)) {
    this.frames = atlas.frames;
    for (const name of which) {
      try {
        this.guns[name] = await this._loadOne(name, GUNS[name], atlas);
      } catch (e) {
        console.warn(`${name} model not available:`, e.message);
      }
    }
    if (!Object.keys(this.guns).length) { this.failed = true; return; }
    for (const g of Object.values(this.guns)) g.group.visible = false;
    this.setWeapon(which.find(n => this.guns[n]));
  }

  async _loadOne(name, def, atlas) {
    const { root, extras } = await loadGLB(def.url, {
      material: (mdef, maps) => {
        if (!maps.map) return new THREE.MeshBasicMaterial({ color: 0x0c1410, toneMapped: false });
        const m = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: maps.map }, glow: { value: 0 }, glowPos: { value: new THREE.Vector3() },
            pilot: { value: 0.35 }, pilotPos: { value: new THREE.Vector3() }, dim: { value: 1 },
            heat: { value: 0 }, heatZ: { value: new THREE.Vector2(0, 1) },
          },
          vertexShader: GUN_VERT, fragmentShader: GUN_FRAG,
          side: mdef?.doubleSided ? THREE.DoubleSide : THREE.FrontSide, toneMapped: false, fog: false,
        });
        /* the file's own name for it, so a table can point at one */
        m.name = mdef?.name || '';
        return m;
      },
    });

    /* --- WHERE THE ANCHORS ARE, and in whose units -------------------
       The file's own if it has them; otherwise this game's table. Either
       way they are in the MODEL's units and go through the same fit
       below, so the two sources cannot disagree about scale. */
    const a = extras.anchors || {};
    const nozzle = def.nozzle || a.nozzle;
    const pilot = def.pilot === null ? null : (def.pilot || a.pilot);
    if (!nozzle) throw new Error('no nozzle anchor, in the file or in GUNS');

    /* --- AND HOW BIG IT IS ------------------------------------------
       `fit` scales the model to the game's gun length along its longest
       axis and recentres it on its own box. The anchors go through the
       same two numbers, which is the whole reason this is done here and
       not by hand in the table: a model swapped for a bigger one moves
       its own nozzle. */
    let scale = 1, centre = new THREE.Vector3();
    if (def.fit) {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      scale = def.fit / Math.max(size.x, size.y, size.z);
      box.getCenter(centre);
    }
    const place = p => new THREE.Vector3(p[0], p[1], p[2]).sub(centre).multiplyScalar(scale);

    /* the model, turned barrel-toward -z so it faces the camera's world,
       and scaled and recentred inside a group of its own */
    const inner = new THREE.Group();
    root.scale.setScalar(scale);
    root.position.copy(centre).multiplyScalar(-scale);
    inner.add(root);
    inner.rotation.y = Math.PI;

    const group = new THREE.Group();
    group.add(inner);
    this.scene.add(group);

    /* ONE ENTRY PER MATERIAL, not per mesh. loadGLB builds a material
       once per glTF material and hands the same instance to every
       primitive that names it, and the new flamethrower is seventeen
       meshes sharing one — so without the set, update() would write the
       same three uniforms seventeen times a frame. */
    const gunMaterials = [];
    const seen = new Set();
    let heatMaterial = null;
    root.traverse(o => {
      if (!o.isMesh || !o.material.uniforms?.glow || seen.has(o.material)) return;
      seen.add(o.material);
      gunMaterials.push(o.material);
      /* the one material the barrels wear, if the table names one, is
         the one the heat goes into — see GUN_FRAG */
      if (def.heat && o.material.name === def.heat.material) heatMaterial = o.material;
    });
    if (heatMaterial) heatMaterial.uniforms.heatZ.value.fromArray(def.heat.z);

    /* AND THE PART THAT TURNS, named in the file's extras by
       tools/prep-model.mjs — the minigun's barrel set. Spun about its
       own z, which is the axis the barrels run along. */
    const spin = extras.spin ? root.getObjectByName(extras.spin) : null;

    const g = {
      def, group, inner, anchors: { nozzle: place(nozzle), pilot: pilot ? place(pilot) : null },
      gunMaterials, heatMaterial, spin, spinAngle: 0,
      pilot: null, muzzle: null, muzzleMaterials: [],
    };

    /* the pilot light: a small flame sprite, always on, for a gun that
       has one — the extinguisher does not burn anything and so has not */
    if (g.anchors.pilot) {
      g.pilot = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.05), flameMaterial(atlas));
      g.pilot.geometry.translate(0, 0.02, 0);
      g.pilot.renderOrder = 2;
      group.add(g.pilot);
    }

    /* the muzzle effect: two crossed tongues along the barrel, while
       firing. The same frames for both guns, tinted — fire, or the
       white-blue of something very cold leaving a nozzle very fast. */
    g.muzzle = new THREE.Group();
    const mA = flameMaterial(atlas), mB = flameMaterial(atlas);
    const { len, wid } = def.muzzle;
    g.muzzle.add(new THREE.Mesh(tongue(len, wid, false), mA));
    g.muzzle.add(new THREE.Mesh(tongue(len, wid, true), mB));
    g.muzzle.position.copy(g.anchors.nozzle);
    g.muzzle.visible = false;
    g.muzzleMaterials = [mA, mB];
    for (const m of g.muzzleMaterials) {
      m.uniforms.tint.value.fromArray(def.tint || [1, 1, 1]);
      m.uniforms.desat.value = def.cold ? 1 : 0;
    }
    inner.add(g.muzzle);

    return g;
  }

  /**
   * Once a frame. `player` for the bob and the turn; `firing` for the
   * muzzle; `tics` for animation; `dt` so the sway lag is the same at
   * any framerate.
   */
  update(player, firing, tics, dt) {
    if (player && player.weapon) this.setWeapon(player.weapon);
    const G = this.gun;
    if (!G) return;
    const g = G.group;
    const bobX = Math.cos(player.bobPhase) * player.bob * 0.0032;
    const bobY = Math.abs(Math.sin(player.bobPhase)) * player.bob * 0.0026;

    /* The gun lags a turn: swing left and it drifts right for a moment,
       then catches up. The rate is read off the player each tic. */
    const k = 1 - Math.pow(0.001, dt);
    const targetX = -(player.lookRate || 0) * 2.4, targetY = (player.pitchRate || 0) * 1.4;
    this.sway.x += (Math.max(-0.12, Math.min(0.12, targetX)) - this.sway.x) * k;
    this.sway.y += (Math.max(-0.08, Math.min(0.08, targetY)) - this.sway.y) * k;

    /* firing shakes it, a little, and pushes it back */
    this.kick += ((firing ? 1 : 0) - this.kick) * (firing ? 0.35 : 0.12);
    const jx = firing ? (Math.random() - 0.5) * 0.006 : 0;
    const jy = firing ? (Math.random() - 0.5) * 0.005 : 0;

    /* `out` is a push straight back along the view — z alone, kick and
       all — see the note on the bore in GUNS for why not the whole
       vector */
    /* and `pos` is a gun's own offset on the shared hold — a heavy gun
       carried in both hands sits nearer the middle than a hose does */
    const off = G.def.pos || [0, 0, 0];
    g.position.set(VIEW.pos[0] + off[0] + bobX + jx, VIEW.pos[1] + off[1] - bobY + jy,
                   (VIEW.pos[2] + off[2] + this.kick * 0.025) * (G.def.out ?? 1));
    /* and `rot` is a gun's own turn on the shared one — pitch, yaw,
       roll — for a gun held square rather than angled in from a corner */
    const rot = G.def.rot || [0, 0, 0];
    g.rotation.set(VIEW.pitch + rot[0] + this.sway.y, VIEW.yaw + rot[1] + this.sway.x,
                   VIEW.roll + rot[2] + this.sway.x * 0.4, 'YXZ');
    g.updateMatrixWorld(true);

    /* the pilot, flickering, on its anchor */
    const flick = 0.85 + 0.15 * Math.sin(tics * 1.7) * Math.cos(tics * 0.53);
    let pv = null;
    if (G.pilot) {
      pv = this._tmp.copy(G.anchors.pilot);
      G.inner.localToWorld(pv);
      /* AND THEN BACK OUT OF THE WORLD AGAIN, because the flame is a
         child of the GROUP and not of the model — it has to be, or it
         would inherit the half-turn that points the barrel at the
         camera and we would be looking at the back of the quad.

         This line was missing and the pilot light sat a third of the
         gun's length below and in front of the barrel, measured at
         0.537m off on a gun 1.4m long. A world-space point assigned to
         `position` is read in the PARENT's space, so the group's own
         transform — the whole of VIEW.pos, the yaw, the bob — was
         applied to it a second time. The tell was that the glow it
         throws ON the gun was in the right place while the flame was
         not: the shader takes `pv` in view space and is correct, and
         only the mesh needed converting. The muzzle never had the bug
         because it is parented to the model and given the anchor in
         the model's own units. */
      G.pilot.position.copy(pv);
      G.group.worldToLocal(G.pilot.position);
      G.pilot.scale.set(flick, 0.8 + flick * 0.35, 1);
      G.pilot.material.uniforms.frame.value = (tics >> 1) % this.frames;
      G.pilot.visible = !firing;
    }

    /* THE BARRELS TURN AND THE BARRELS HEAT, both read off the player,
       who owns the numbers (see Player.spin and Player.heat): the spin
       is 0..1 of full speed, so the set winds up before the first round
       and runs down after the last, and the heat is 0..1 of a barrel
       that should have stopped. Neither is a frame count — both are
       states, so a pause holds them where they are. */
    if (G.spin) {
      const rate = (player.spin || 0) * (G.def.spin || 0) * Math.PI * 2;
      G.spinAngle = (G.spinAngle + rate * dt) % (Math.PI * 2);
      G.spin.rotation.z = G.spinAngle;
    }
    if (G.heatMaterial) G.heatMaterial.uniforms.heat.value = player.heat || 0;

    /* the muzzle, only while firing */
    G.muzzle.visible = !!firing;
    if (firing) {
      const s = 0.85 + Math.random() * 0.3;
      G.muzzle.scale.set(s, s, 0.9 + Math.random() * 0.35);
      G.muzzleMaterials[0].uniforms.frame.value = tics % this.frames;
      G.muzzleMaterials[1].uniforms.frame.value = (tics + 7) % this.frames;
    }

    /* and what they throw on the gun. A gun with no pilot gets no pilot
       glow — an extinguisher lit by a flame it does not have would be
       the one thing on screen saying it is a flamethrower. */
    const nv = this._tmp2.copy(G.anchors.nozzle);
    G.inner.localToWorld(nv);
    for (const m of G.gunMaterials) {
      m.uniforms.glow.value += ((firing ? 1 : 0) - m.uniforms.glow.value) * 0.4;
      m.uniforms.glowPos.value.copy(nv);
      m.uniforms.pilot.value = pv ? 0.55 * flick : 0;
      if (pv) m.uniforms.pilotPos.value.copy(pv);
    }
  }

  /** The nozzle, in the WORLD's coordinates (game x, y, z), for a stream
   *  to be born at. Projected as a ray through this scene's camera and
   *  back out of the world's, so it leaves the end of the gun as drawn
   *  whatever the two fields of view are. */
  nozzleWorld(worldCamera, out = { x: 0, y: 0, z: 0 }) {
    const G = this.gun;
    if (!G) return null;
    const nv = this._tmp2.copy(G.anchors.nozzle);
    G.inner.localToWorld(nv);
    const dist = Math.min(nv.length() * UNITS_PER_METRE, NOZZLE_REACH);
    const ndc = this._ndc.copy(nv).project(this.camera);
    ndc.z = 0.5;
    const wp = ndc.unproject(worldCamera);
    const dir = wp.sub(worldCamera.position).normalize();
    const w = dir.multiplyScalar(dist).add(worldCamera.position);
    out.x = w.x; out.y = -w.z; out.z = w.y;
    return out;
  }
}
