/* =====================================================================
   SELLWRONG — the thing in your hands
   =====================================================================

   The flamethrower is a model: the one the user built, loaded from a
   .glb and drawn in its own little scene in front of the world. That
   scene has its own perspective camera, sitting at the origin looking
   down -z, and the gun is parked in front of it in metres — so "where
   the gun is on screen" is a handful of numbers in VIEW below, and
   nothing about the level or the player's position enters into it.

   IT IS DRAWN INTO THE SAME LOW-RES BUFFER as the world, after it and
   over it, with depth cleared in between so the barrel never pokes
   through a wall you are standing against. That buffer is what keeps a
   1024-pixel painted diffuse honest: at four hundred rows the texels
   are chunky again, and the palette snap eats the gun along with the
   floor.

   HEAVILY LOW AND RIGHT, as asked — the body of the gun is off the
   bottom of the frame and the barrel comes in across the lower right
   quarter, the way it is drawn in every game that got this right. What
   is on screen is the end that matters: the nozzle, the pilot light
   under it, and the flame.

   THE TWO ANCHORS came in the model as marker spheres and were baked
   into the file's extras by tools/prep-model.mjs. The pilot light is a
   small flame sprite parked on one; the muzzle flame is a pair of
   crossed quads growing out of the other along the barrel; and the
   STREAM — the particles that fly out into the world and set fire to
   it — starts at that same nozzle, projected out of this scene and
   into the world's, so it always leaves the end of the gun you can see.
   ===================================================================== */

import * as THREE from 'three';
import { loadGLB } from './glb.js';

/* Where the gun sits in front of the eye, in metres, and how it is
   turned. The model's own barrel runs along +z; the camera looks down
   -z; so it is turned half a circle and then a touch inward so the
   barrel points at the middle of the picture rather than parallel to it. */
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
const FLAME_FRAG = /* glsl */`
uniform sampler2D map;
uniform float frame;
uniform float frames;
uniform vec3  tint;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vec2((vUv.x + frame) / frames, vUv.y));
  if (t.a < 0.5) discard;
  gl_FragColor = vec4(t.rgb * tint, 1.0);
}
`;

function flameMaterial(atlas) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: atlas.texture }, frame: { value: 0 }, frames: { value: atlas.frames }, tint: { value: new THREE.Vector3(1, 1, 1) } },
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
    this.ready = false;
    this.failed = false;
    this.visible = false;
    this.gun = null;
    this.anchors = null;
    this.sway = { x: 0, y: 0 };
    this.kick = 0;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._ndc = new THREE.Vector3();
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param url    the prepared .glb
   * @param atlas  { texture, frames } of flame frames for the pilot and muzzle
   */
  async load(url, atlas) {
    try {
      const { root, extras } = await loadGLB(url, {
        material: (def, maps) => {
          if (!maps.map) return new THREE.MeshBasicMaterial({ color: 0x0c1410, toneMapped: false });
          return new THREE.ShaderMaterial({
            uniforms: {
              map: { value: maps.map }, glow: { value: 0 }, glowPos: { value: new THREE.Vector3() },
              pilot: { value: 0.35 }, pilotPos: { value: new THREE.Vector3() }, dim: { value: 1 },
            },
            vertexShader: GUN_VERT, fragmentShader: GUN_FRAG,
            side: def?.doubleSided ? THREE.DoubleSide : THREE.FrontSide, toneMapped: false, fog: false,
          });
        },
      });
      const a = extras.anchors;
      if (!a || !a.pilot || !a.nozzle) throw new Error('model has no pilot/nozzle anchors — run tools/prep-model.mjs');
      this.anchors = { pilot: new THREE.Vector3().fromArray(a.pilot), nozzle: new THREE.Vector3().fromArray(a.nozzle) };

      this.gun = new THREE.Group();
      this.gun.add(root);
      root.rotation.y = Math.PI;                 // barrel toward -z, at the camera's world
      this.scene.add(this.gun);
      this.gunMaterials = [];
      root.traverse(o => { if (o.isMesh && o.material.uniforms?.glow) this.gunMaterials.push(o.material); });

      /* the pilot light: a small flame sprite, always on */
      this.pilot = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.05), flameMaterial(atlas));
      this.pilot.geometry.translate(0, 0.02, 0);
      this.pilot.renderOrder = 2;
      this.scene.add(this.pilot);

      /* the muzzle flame: two crossed tongues along the barrel, while firing */
      this.muzzle = new THREE.Group();
      const mA = flameMaterial(atlas), mB = flameMaterial(atlas);
      this.muzzle.add(new THREE.Mesh(tongue(0.34, 0.14, false), mA));
      this.muzzle.add(new THREE.Mesh(tongue(0.34, 0.14, true), mB));
      this.muzzle.position.copy(this.anchors.nozzle);
      this.muzzle.visible = false;
      this.muzzleMaterials = [mA, mB];
      root.add(this.muzzle);

      this.ready = true;
    } catch (e) {
      this.failed = true;
      console.warn('flamethrower model not available:', e.message);
    }
  }

  /**
   * Once a frame. `player` for the bob and the turn; `firing` for the
   * flame; `tics` for animation; `fps` so the sway lag is the same at
   * any framerate.
   */
  update(player, firing, tics, dt) {
    if (!this.ready) return;
    const g = this.gun;
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
    const pv = this._tmp.copy(this.anchors.pilot);
    this.gun.children[0].localToWorld(pv);
    this.pilot.position.copy(pv);
    const flick = 0.85 + 0.15 * Math.sin(tics * 1.7) * Math.cos(tics * 0.53);
    this.pilot.scale.set(flick, 0.8 + flick * 0.35, 1);
    this.pilot.material.uniforms.frame.value = (tics >> 1) & 7;
    this.pilot.visible = !firing;

    /* the muzzle, only while firing */
    this.muzzle.visible = !!firing;
    if (firing) {
      const s = 0.85 + Math.random() * 0.3;
      this.muzzle.scale.set(s, s, 0.9 + Math.random() * 0.35);
      this.muzzleMaterials[0].uniforms.frame.value = (tics) & 7;
      this.muzzleMaterials[1].uniforms.frame.value = (tics + 3) & 7;
    }

    /* and what they throw on the gun */
    const nv = this._tmp2.copy(this.anchors.nozzle);
    this.gun.children[0].localToWorld(nv);
    for (const m of this.gunMaterials) {
      m.uniforms.glow.value += ((firing ? 1 : 0) - m.uniforms.glow.value) * 0.4;
      m.uniforms.glowPos.value.copy(nv);
      m.uniforms.pilot.value = 0.55 * flick;
      m.uniforms.pilotPos.value.copy(pv);
    }
  }

  /** The nozzle, in the WORLD's coordinates (game x, y, z), for the
   *  stream to be born at. Projected as a ray through this scene's
   *  camera and back out of the world's, so it leaves the end of the
   *  gun as drawn whatever the two fields of view are. */
  nozzleWorld(worldCamera, out = { x: 0, y: 0, z: 0 }) {
    if (!this.ready) return null;
    const nv = this._tmp2.copy(this.anchors.nozzle);
    this.gun.children[0].localToWorld(nv);
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
