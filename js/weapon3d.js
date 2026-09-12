/* =====================================================================
   GROCERY STORE SIMULATOR — the thing in your hands
   =====================================================================

   TWO MODELS NOW, and this file used to be certain there was one. The
   flamethrower is the one the user built; the extinguisher is somebody
   else's, dropped in as it stands. Both are .glb, both are drawn in the
   same little scene in front of the world, and that scene has its own
   perspective camera sitting at the origin looking down -z with the gun
   parked in front of it in metres — so "where the gun is on screen" is
   the handful of numbers in VIEW below, and nothing about the level or
   the player's position enters into it.

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

   WHERE THE NOZZLE IS, TWO WAYS. The flamethrower's came in the model as
   marker spheres and was baked into the file's extras by
   tools/prep-model.mjs, which is a tool that only ever ran on a model
   the user made. The extinguisher arrived finished, from somebody else,
   and the standing rule since the van is that a file like that is not
   rewritten on the way in — so its anchor is a number in GUNS below,
   in the MODEL'S own units, which is the game saying where it intends
   to point rather than the game editing the asset.

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
     fit     scale it to GUN_LENGTH and centre it on its own box. Absent
             means the model is already in this scene's frame, which is
             true of exactly one of them and only because it was made for
             it
     nozzle  where the business end is, in the MODEL'S own units. Absent
             means the file says so itself, in asset.extras.anchors
     pilot   a small flame that is always alight, on the same terms.
             A gun that does not burn anything does not have one
     tint    what the muzzle effect is coloured, and `cold` whether the
             frames are desaturated first. The two weapons use the same
             twenty frames of billowing and differ by those two: one is
             fire as painted, one is the white-blue of something very
             cold leaving a nozzle very fast
     muzzle  how long and wide that effect is, in metres */
export const GUNS = {
  FLAMER: {
    url: 'assets/models/flamethrower.glb',
    tint: [1, 1, 1],
    muzzle: { len: 0.34, wid: 0.14 },
  },
  EXTINGUISHER: {
    url: 'assets/models/extinguisher.glb',
    fit: GUN_LENGTH,
    /* the tip of the barrel, measured off the model's own vertices: the
       forty furthest along +z average to (0, 0.76, 2.16) and this is a
       little past them, so the plume starts outside the metal */
    nozzle: [0, 0.78, 2.20],
    pilot: null,
    tint: [0.72, 1.02, 1.45],
    cold: true,
    muzzle: { len: 0.30, wid: 0.22 },
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

const GUN_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vP = mv.xyz;
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
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  vec3 N = normalize(vN);
  vec3 L = normalize(vec3(-0.35, 0.85, 0.40));
  float d = max(0.0, dot(N, L));
  float l = (0.50 + 0.50 * d) * dim;
  l = floor(l * 12.0 + 0.5) / 12.0;
  vec3 c = t.rgb * l;
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
        return new THREE.ShaderMaterial({
          uniforms: {
            map: { value: maps.map }, glow: { value: 0 }, glowPos: { value: new THREE.Vector3() },
            pilot: { value: 0.35 }, pilotPos: { value: new THREE.Vector3() }, dim: { value: 1 },
          },
          vertexShader: GUN_VERT, fragmentShader: GUN_FRAG,
          side: mdef?.doubleSided ? THREE.DoubleSide : THREE.FrontSide, toneMapped: false, fog: false,
        });
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

    const gunMaterials = [];
    root.traverse(o => { if (o.isMesh && o.material.uniforms?.glow) gunMaterials.push(o.material); });

    const g = {
      def, group, inner, anchors: { nozzle: place(nozzle), pilot: pilot ? place(pilot) : null },
      gunMaterials, pilot: null, muzzle: null, muzzleMaterials: [],
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

    g.position.set(VIEW.pos[0] + bobX + jx, VIEW.pos[1] - bobY + jy, VIEW.pos[2] + this.kick * 0.025);
    g.rotation.set(VIEW.pitch + this.sway.y, VIEW.yaw + this.sway.x, VIEW.roll + this.sway.x * 0.4, 'YXZ');
    g.updateMatrixWorld(true);

    /* the pilot, flickering, on its anchor */
    const flick = 0.85 + 0.15 * Math.sin(tics * 1.7) * Math.cos(tics * 0.53);
    let pv = null;
    if (G.pilot) {
      pv = this._tmp.copy(G.anchors.pilot);
      G.inner.localToWorld(pv);
      G.pilot.position.copy(pv);
      G.pilot.scale.set(flick, 0.8 + flick * 0.35, 1);
      G.pilot.material.uniforms.frame.value = (tics >> 1) % this.frames;
      G.pilot.visible = !firing;
    }

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
    const dist = nv.length() * UNITS_PER_METRE;
    const ndc = this._ndc.copy(nv).project(this.camera);
    ndc.z = 0.5;
    const wp = ndc.unproject(worldCamera);
    const dir = wp.sub(worldCamera.position).normalize();
    const w = dir.multiplyScalar(dist).add(worldCamera.position);
    out.x = w.x; out.y = -w.z; out.z = w.y;
    return out;
  }
}
