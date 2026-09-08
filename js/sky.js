/* =====================================================================
   SELLWRONG — the sky
   =====================================================================

   A sky sector in this engine draws nothing and lets the background
   through, which is exactly what Doom did and is fine as long as the
   only thing outdoors is a courtyard. It stopped being fine when the
   store got a car park six thousand units across, and it stopped being
   a cylinder when the car park got a forest round it: a strip of
   painted cloud is a horizon, and a forest at night wants a whole sky —
   stars overhead, a glow where the town is, nothing at all where there
   is nothing.

   So the background is a SPHERE now, wearing a real night: a Polyhaven
   panorama, baked down to 512 palette pixels round the horizon by
   tools/bake-sky.mjs so it is made of the same paint as everything else.
   An equirectangular picture on a sphere needs no projection maths at
   all — the sphere's own u is longitude and its v is latitude, and
   turning your head does the right thing for free. Looking up now shows
   sky rather than the top of a strip, which is the only thing the
   cylinder could never do.

   Two rules and it is convincing:

   IT IS AT INFINITY. Every frame it is moved to sit on the camera, so
   walking never gets you nearer to it. That is the whole trick — a sky
   you can approach is a wall with stars on it.

   IT IS NOT LIT. Fullbright, no fog, no distance diminishing, drawn
   first with depth off so everything in the world lands in front of it
   whatever the far plane is doing. That includes the far plane cutting
   the forest floor off at a distance — what shows past that cut is the
   bottom of the sphere, which is the panorama's own dark ground, and at
   night that is indistinguishable from more forest.
   ===================================================================== */

import * as THREE from 'three';

const RADIUS = 4200;          // inside the camera's far plane, always

/**
 * @param {THREE.Texture|HTMLImageElement} src  the baked equirect, as a
 *   texture or the image it should be made from
 */
export function buildSky(src) {
  const tex = src.isTexture ? src : new THREE.Texture(src);
  /* Nearest: the texels are the point. Mipmaps off: there are 512 of
     them round the whole horizon and a mip would be a blur. */
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  /* The sphere's u runs the wrong way round when seen from inside —
     SphereGeometry is authored to be looked at from outside — so the
     picture is mirrored. A negative x scale on the mesh puts west back
     on the left, which matters for a photograph of somewhere real even
     when nobody could say which way the golf course faced. */
  const g = new THREE.SphereGeometry(RADIUS, 48, 24);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.scale.x = -1;
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';
  return mesh;
}

/** Park it on the camera, so it can never be walked towards. The eye is
 *  the horizon: the sphere's equator sits at the camera's own height,
 *  which is where the horizon of a flat world is. */
export function followSky(mesh, camera) {
  mesh.position.copy(camera.position);
}
