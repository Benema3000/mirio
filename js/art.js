// Mirio: loads Miro's drawings and draws everything else in the same
// felt-pen spirit.
//
// The PNGs in img/ are used unmodified. The 3D models built from them live
// in mirio-model.js (Mirio) and props.js (the rocket, the flags); this file
// holds the canvas helpers they share, the title-screen sticker and the
// scribble textures for the ground.

import * as THREE from 'three';
import { mulberry32 } from './world.js';

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Bild fehlt: ${src}`));
    img.src = src;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

/** Crops away the transparent margin so a figure's feet touch the bottom edge. */
export function cropToInk(img, threshold = 24) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return c;

  const out = makeCanvas(maxX - minX + 1, maxY - minY + 1);
  out.getContext('2d').drawImage(c, -minX, -minY);
  return out;
}

/**
 * Paints the enclosed transparent areas (Mirio's face, the gaps between his
 * fingers) in paper white: Miro drew on white paper, and the cut-out would
 * otherwise show the sky through his face. Flood-fills the outside from the
 * border; whatever transparent pixel it cannot reach is a hole.
 */
export function fillHoles(src, color = [255, 253, 245]) {
  const w = src.width;
  const h = src.height;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const { data } = img;
  const clear = (i) => data[i * 4 + 3] < 128;
  const outside = new Uint8Array(w * h);
  const stack = [];
  const seed = (i) => {
    if (!outside[i] && clear(i)) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < w * (h - 1)) seed(i + w);
  }
  for (let i = 0; i < w * h; i++) {
    if (outside[i] || !clear(i)) continue;
    // Blend under whatever ink is there, so soft pen edges stay soft.
    const a = data[i * 4 + 3] / 255;
    for (let k = 0; k < 3; k++) data[i * 4 + k] = data[i * 4 + k] * a + color[k] * (1 - a);
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Same shape, one flat colour. */
export function silhouette(src, color) {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Adds a sticker border of `border` px around the drawing. */
export function sticker(src, border, color = '#ffffff') {
  const c = makeCanvas(src.width + border * 2, src.height + border * 2);
  const ctx = c.getContext('2d');
  const sil = silhouette(src, color);
  const steps = 28;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.drawImage(sil, border + Math.cos(a) * border, border + Math.sin(a) * border);
  }
  ctx.drawImage(src, border, border);
  return c;
}

export function canvasTexture(canvas, { repeat = false } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Tileable felt-pen texture: a base colour with lots of short strokes.
 * Every stroke is drawn nine times, shifted by one tile, so the edges match.
 */
export function scribbleCanvas({ base, strokes, seed = 1, size = 256, count = 150, width = [5, 13], alpha = 0.4, dots = [] }) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = 'round';

  const wrapped = (draw) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(dx, dy);
        draw();
        ctx.restore();
      }
    }
  };

  for (let i = 0; i < count; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const a = rnd() * Math.PI * 2;
    const len = 18 + rnd() * 40;
    const bend = (rnd() - 0.5) * len;
    ctx.strokeStyle = strokes[i % strokes.length];
    ctx.globalAlpha = alpha * (0.6 + rnd() * 0.4);
    ctx.lineWidth = width[0] + rnd() * (width[1] - width[0]);
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    const cx = (x + ex) / 2 + Math.cos(a + Math.PI / 2) * bend;
    const cy = (y + ey) / 2 + Math.sin(a + Math.PI / 2) * bend;
    wrapped(() => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.stroke();
    });
  }

  ctx.globalAlpha = 1;
  for (const { color, n, r } of dots) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      ctx.fillStyle = color;
      wrapped(() => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  return c;
}

/** Miro's floor tile, stretched over a square so it repeats without gaps. */
export function floorCanvas(img) {
  const size = 128;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a5f68';
  ctx.fillRect(0, 0, size, size);
  const pad = size * 0.12;
  ctx.drawImage(img, -pad, -pad, size + pad * 2, size + pad * 2);
  return c;
}

/** Soft round glow, white; tint it with the material colour. */
export function glowCanvas(size = 128) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Four-pointed sparkle for glints and confetti. */
export function sparkleCanvas(size = 64) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const m = size / 2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? m : m * 0.22;
    const a = (i / 8) * Math.PI * 2;
    ctx.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  return c;
}

export function shadowCanvas(size = 64) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/**
 * Little felt-pen flowers and pebbles dotted over a tile canvas, wrapped at
 * the edges like scribbleCanvas so the tile still repeats without seams.
 */
export function sprinkleCanvas(canvas, { seed = 1, flowers = [], stones = [] }) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const rnd = mulberry32(seed);
  const wrapped = (x, y, draw) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) draw(x + dx, y + dy);
    }
  };
  ctx.save();
  ctx.lineJoin = 'round';
  for (const { fill, rim, n, r } of stones) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const rx = r * (0.8 + rnd() * 0.5);
      const ry = rx * (0.55 + rnd() * 0.25);
      const a = rnd() * Math.PI;
      wrapped(x, y, (px, py) => {
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, a, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = rim;
        ctx.stroke();
      });
    }
  }
  for (const { petal, center, n, r } of flowers) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const turn = rnd() * Math.PI;
      wrapped(x, y, (px, py) => {
        ctx.fillStyle = petal;
        for (let k = 0; k < 5; k++) {
          const a = turn + (k / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(px + Math.cos(a) * r * 0.6, py + Math.sin(a) * r * 0.6, r * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = center;
        ctx.beginPath();
        ctx.arc(px, py, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  ctx.restore();
  return canvas;
}

/** Soft star-burst rays, white; for the glow behind the goal star. */
export function raysCanvas(size = 256, rays = 12) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const m = size / 2;
  ctx.translate(m, m);
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const long = i % 2 === 0 ? 1 : 0.62;
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * m * long, Math.sin(a) * m * long);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - 0.09) * m * long, Math.sin(a - 0.09) * m * long);
    ctx.lineTo(Math.cos(a + 0.09) * m * long, Math.sin(a + 0.09) * m * long);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

/** Loads Miro's drawings and prepares the shared textures. */
export async function loadArt(base = 'img/') {
  const [mirio, floor, rocket] = await Promise.all(
    ['mirio.png', 'floor.png', 'rakete.png'].map((f) => loadImage(base + f)),
  );
  const mirioInk = cropToInk(mirio);
  return {
    // rakete.png is jump_btn.png of the 2D game: Miro's rocket, upright.
    images: { mirio, floor, rocket },
    mirioSticker: fillHoles(sticker(mirioInk, Math.round(mirioInk.height * 0.022))),
    floor: canvasTexture(floorCanvas(floor), { repeat: true }),
    grass: canvasTexture(scribbleCanvas({
      base: '#5fc23d',
      strokes: ['#7fda52', '#3f9f2b', '#8ee35f', '#4aae33'],
      seed: 7,
      dots: [{ color: '#fff7c2', n: 10, r: 4 }, { color: '#ff6fa8', n: 6, r: 4 }, { color: '#ffd23f', n: 6, r: 3.5 }],
    }), { repeat: true }),
    water: canvasTexture(scribbleCanvas({
      base: '#3aa7e8',
      strokes: ['#7fd0ff', '#1f7fc4', '#bfeaff', '#2b92d6'],
      seed: 31,
      alpha: 0.45,
    }), { repeat: true }),
    bark: canvasTexture(scribbleCanvas({
      base: '#8a5a33',
      strokes: ['#6b4424', '#a8703f'],
      seed: 5,
      size: 128,
      count: 60,
      width: [4, 8],
    }), { repeat: true }),
    glow: canvasTexture(glowCanvas()),
    sparkle: canvasTexture(sparkleCanvas()),
    shadow: canvasTexture(shadowCanvas()),
    // The Zielplanet: warm yellow-orange scribble with little flowers and stones.
    gold: canvasTexture(sprinkleCanvas(scribbleCanvas({
      base: '#f3b23a',
      strokes: ['#ffd35c', '#e48a22', '#ffe391', '#d9761b'],
      seed: 13,
    }), {
      seed: 17,
      stones: [{ fill: '#b98a5e', rim: '#6e4a2c', n: 7, r: 5 }],
      flowers: [
        { petal: '#ff4a3d', center: '#ffe14d', n: 6, r: 6 },
        { petal: '#fff7c2', center: '#ff9a1f', n: 6, r: 5.5 },
        { petal: '#ff8fc0', center: '#ffe14d', n: 4, r: 5 },
      ],
    }), { repeat: true }),
    // Neutral felt-pen strokes, tinted by vertex colours: one texture (and so
    // one draw call) for trees, stumps and the other props.
    felt: canvasTexture(scribbleCanvas({
      base: '#e4e4e4',
      strokes: ['#ffffff', '#bdbdbd', '#f4f4f4', '#a9a9a9'],
      seed: 23,
      size: 128,
      count: 70,
      width: [4, 9],
      alpha: 0.55,
    }), { repeat: true }),
    rays: canvasTexture(raysCanvas()),
  };
}
