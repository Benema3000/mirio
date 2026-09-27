// Original environment artwork, generated once at load. None of these
// textures reads, samples or changes Miro's drawings in img/.
import * as THREE from 'three';
import { mulberry32 } from './world.js';

/** Periodic, layered colour with fine pigment grain. The edges tile exactly. */
function surface({ base, light, dark, seed, grass = false, size = 256 }) {
  const rnd = mulberry32(seed);
  const data = new Uint8Array(size * size * 4);
  const layers = [[4, 0.48], [8, 0.26], [16, 0.15], [32, 0.075], [64, 0.035]].map(([n, weight]) => ({
    n, weight, values: Float32Array.from({ length: n * n }, () => rnd() * 2 - 1),
  }));
  const smooth = (v) => v * v * (3 - 2 * v);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size * Math.PI * 2;
      const v = y / size * Math.PI * 2;
      let n = 0;
      for (const layer of layers) {
        const px = x / size * layer.n;
        const py = y / size * layer.n;
        const ix = Math.floor(px);
        const iy = Math.floor(py);
        const fx = smooth(px - ix);
        const fy = smooth(py - iy);
        const at = (dx, dy) => layer.values[((iy + dy) % layer.n) * layer.n + ((ix + dx) % layer.n)];
        const a = at(0, 0) * (1 - fx) + at(1, 0) * fx;
        const b = at(0, 1) * (1 - fx) + at(1, 1) * fx;
        n += (a * (1 - fy) + b * fy) * layer.weight;
      }
      const pigment = (rnd() - 0.5) * 9;
      // The fine blades are deliberately quiet; silhouettes come from real grass.
      const blade = grass ? Math.pow(Math.max(0, Math.sin(u * 41 + Math.sin(v * 7) * 2)), 12) * 4 : 0;
      const target = n > 0 ? light : dark;
      const k = Math.abs(n) * 0.7;
      const offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) data[offset + c] = Math.round(base[c] + (target[c] - base[c]) * k + pigment + blade);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** A small painted studio reflected in gems. No external HDR download. */
function jewelEnvironment() {
  const size = 64;
  const directions = [
    (u, v) => [1, -v, -u], (u, v) => [-1, -v, u],
    (u, v) => [u, 1, v], (u, v) => [u, -1, -v],
    (u, v) => [u, -v, 1], (u, v) => [-u, -v, -1],
  ];
  const keyDirection = new THREE.Vector3(-0.4, 0.8, 0.45).normalize();
  const d = new THREE.Vector3();
  const faces = directions.map((direction) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      d.fromArray(direction((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1)).normalize();
      const light = Math.pow(Math.max(0, d.dot(keyDirection)), 24);
      const stripe = Math.pow(Math.max(0, 1 - Math.abs(d.x * 0.8 + d.z * 0.6)), 20) * Math.max(0, d.y);
      const t = d.y * 0.5 + 0.5;
      const i = (y * size + x) * 4;
      pixels.data[i] = Math.min(255, 27 + t * 112 + light * 180 + stripe * 70);
      pixels.data[i + 1] = Math.min(255, 40 + t * 151 + light * 180 + stripe * 50);
      pixels.data[i + 2] = Math.min(255, 73 + t * 170 + light * 150 + stripe * 80);
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas;
  });
  const texture = new THREE.CubeTexture(faces);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function makeEnvironmentArt() {
  return {
    meadow: surface({ base: [104, 155, 65], light: [153, 183, 88], dark: [67, 122, 57], seed: 91, grass: true }),
    gold: surface({ base: [202, 155, 71], light: [237, 204, 117], dark: [167, 116, 56], seed: 71, grass: true }),
    grain: surface({ base: [228, 229, 220], light: [255, 253, 237], dark: [189, 204, 176], seed: 43 }),
    water: surface({ base: [153, 159, 161], light: [209, 212, 211], dark: [112, 126, 134], seed: 123 }),
    jewel: jewelEnvironment(),
  };
}
