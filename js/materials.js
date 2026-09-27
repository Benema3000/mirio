// Mirio: materials shared by the scene and the models.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Three hard bands of light: the cel-shaded look. */
function toonRamp() {
  const data = new Uint8Array([90, 170, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
const RAMP = toonRamp();

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: RAMP, ...extra });
}

/**
 * Black felt-pen outline: render the same geometry again, back faces only,
 * pushed out along the normals. Share one material per thickness.
 */
export function outlineMaterial(thickness = 0.02, color = 0x1b1410) {
  return new THREE.ShaderMaterial({
    uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(color) } },
    vertexShader: `
      uniform float thickness;
      void main() {
        vec3 p = position + normal * thickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 color;
      void main() { gl_FragColor = vec4(color, 1.0); }`,
    side: THREE.BackSide,
  });
}

/** Adds a pen outline to `mesh` (as a child, so it follows every transform). */
export function withOutline(mesh, material) {
  const hull = new THREE.Mesh(mesh.geometry, material);
  hull.renderOrder = mesh.renderOrder;
  mesh.add(hull);
  return mesh;
}

/**
 * outlineMaterial for instanced and merged meshes, with a slightly uneven
 * line like a real felt pen. Pair it with hullGeometry().
 */
export function penOutline(thickness = 0.03, color = 0x1b1410, wobble = 0.35) {
  return new THREE.ShaderMaterial({
    uniforms: {
      thickness: { value: thickness },
      wobble: { value: wobble },
      color: { value: new THREE.Color(color) },
    },
    vertexShader: `
      uniform float thickness;
      uniform float wobble;
      void main() {
        float w = 1.0 + wobble * sin(dot(position, vec3(5.1, 4.3, 6.7)));
        vec4 p = vec4(position + normal * thickness * w, 1.0);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }`,
    fragmentShader: `
      uniform vec3 color;
      void main() { gl_FragColor = vec4(color, 1.0); }`,
    side: THREE.BackSide,
  });
}

/**
 * The shape of `geometry` with one smooth normal per corner, for an outline
 * hull. Split normals (boxes, cylinder rims, UV seams) would tear it open.
 */
export function hullGeometry(geometry) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geometry.getAttribute('position'));
  if (geometry.index) g.setIndex(geometry.index);
  const merged = mergeVertices(g, 1e-3);
  merged.computeVertexNormals();
  return merged;
}
