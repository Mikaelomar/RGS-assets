// Procedural canvas textures: everything in the game is generated at runtime (no image files).
import * as THREE from 'three';
import { Rng } from '../core/util';

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

let maxAniso = 4;
export function setMaxAnisotropy(v: number) { maxAniso = Math.min(8, v); }

export function toTexture(c: HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean; aniso?: number } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (opts.repeat !== false) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? maxAniso;
  t.needsUpdate = true;
  return t;
}

// ---- Noise helpers --------------------------------------------------------
function hash2(x: number, y: number, seed: number) {
  let h = x * 374761393 + y * 668265263 + seed * 982451653;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
function valueNoise(x: number, y: number, seed: number, period: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const p = (a: number) => ((a % period) + period) % period;
  const a = hash2(p(xi), p(yi), seed), b = hash2(p(xi + 1), p(yi), seed);
  const c = hash2(p(xi), p(yi + 1), seed), d = hash2(p(xi + 1), p(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Tileable fractal noise in 0..1 */
export function fbm(x: number, y: number, seed = 1, baseFreq = 8, octaves = 4) {
  let amp = 0.5, f = baseFreq, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * f, y * f, seed + o * 17, f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r * 255, c.g * 255, c.b * 255];
}

const noiseCache = new Map<string, HTMLCanvasElement>();
/** Small tileable grayscale fbm canvas, cached. */
function noiseCanvas(seed: number, freq: number): HTMLCanvasElement {
  const key = seed + ':' + freq;
  let c = noiseCache.get(key);
  if (c) return c;
  const S = 128;
  const [cc, ctx] = makeCanvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = fbm(x / S, y / S, seed, Math.max(1, Math.round(freq)), 4) * 255;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  noiseCache.set(key, cc);
  return cc;
}
let grainCanvas: HTMLCanvasElement | null = null;
function getGrain(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 128 + (Math.random() - 0.5) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}
/** Modulates the canvas brightness with tileable noise (fast: uses compositing). */
function noiseOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 3, freq = 8, grain = 0.04) {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = Math.min(1, amount * 2.6);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(noiseCanvas(seed, freq), 0, 0, w, h);
  if (grain > 0) {
    ctx.globalAlpha = Math.min(1, grain * 2.2);
    const g = getGrain();
    for (let y = 0; y < h; y += g.height) for (let x = 0; x < w; x += g.width) ctx.drawImage(g, x, y);
  }
  ctx.restore();
}

/** Builds a normal map from the luminance of a height canvas. */
export function normalFromHeight(src: HTMLCanvasElement, strength = 2): THREE.Texture {
  const w = src.width, h = src.height;
  const sctx = src.getContext('2d')!;
  const sd = sctx.getImageData(0, 0, w, h).data;
  const [c, ctx] = makeCanvas(w, h);
  const out = ctx.createImageData(w, h);
  const L = (x: number, y: number) => {
    x = (x + w) % w;
    y = (y + h) % h;
    const i = (y * w + x) * 4;
    return (sd[i] * 0.3 + sd[i + 1] * 0.59 + sd[i + 2] * 0.11) / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (L(x + 1, y) - L(x - 1, y)) * strength;
      const dy = (L(x, y + 1) - L(x, y - 1)) * strength;
      const nx = -dx, ny = dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      out.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return toTexture(c, { srgb: false });
}

// ---- Surface textures ------------------------------------------------------

export function floorTiles(opts: { base?: string; alt?: string; grout?: string; tiles?: number; size?: number; seed?: number } = {}) {
  const size = opts.size ?? 512, n = opts.tiles ?? 4;
  const rng = new Rng(opts.seed ?? 11);
  const [c, ctx] = makeCanvas(size, size);
  const [hc, hctx] = makeCanvas(size, size);
  const ts = size / n;
  const base = new THREE.Color(opts.base ?? '#eceae4');
  const alt = new THREE.Color(opts.alt ?? '#e2dfd8');
  ctx.fillStyle = opts.grout ?? '#a9a49a';
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const col = ((i + j) % 2 === 0 ? base : alt).clone();
      col.offsetHSL(0, 0, rng.range(-0.015, 0.015));
      ctx.fillStyle = '#' + col.getHexString();
      const g = 3;
      ctx.fillRect(i * ts + g, j * ts + g, ts - g * 2, ts - g * 2);
      hctx.fillStyle = '#fff';
      hctx.fillRect(i * ts + g, j * ts + g, ts - g * 2, ts - g * 2);
      // subtle speckles (terrazzo-like)
      for (let k = 0; k < 40; k++) {
        ctx.fillStyle = `rgba(${rng.int(90, 160)},${rng.int(90, 150)},${rng.int(80, 140)},${rng.range(0.08, 0.25)})`;
        ctx.fillRect(i * ts + g + rng.range(0, ts - g * 2), j * ts + g + rng.range(0, ts - g * 2), rng.range(1, 3), rng.range(1, 3));
      }
    }
  }
  noiseOverlay(ctx, size, size, 0.025, rng.int(1, 999), 4, 0.02);
  const map = toTexture(c);
  const normalMap = normalFromHeight(hc, 3);
  return { map, normalMap };
}

export function concrete(opts: { color?: string; size?: number; seed?: number; stains?: boolean; lines?: boolean } = {}) {
  const size = opts.size ?? 512;
  const rng = new Rng(opts.seed ?? 5);
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = opts.color ?? '#9d9a94';
  ctx.fillRect(0, 0, size, size);
  noiseOverlay(ctx, size, size, 0.12, rng.int(1, 999), 6, 0.08);
  if (opts.stains !== false) {
    for (let i = 0; i < 6; i++) {
      const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(20, 80);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(40,35,30,0.12)');
      g.addColorStop(1, 'rgba(40,35,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  if (opts.lines) {
    ctx.strokeStyle = 'rgba(60,55,50,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 1); ctx.lineTo(size, 1);
    ctx.moveTo(1, 0); ctx.lineTo(1, size);
    ctx.stroke();
  }
  return toTexture(c);
}

export function asphalt(size = 512) {
  const rng = new Rng(77);
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#3c3d40';
  ctx.fillRect(0, 0, size, size);
  noiseOverlay(ctx, size, size, 0.18, 21, 10, 0.15);
  for (let i = 0; i < 2500; i++) {
    const v = rng.int(70, 130);
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${rng.range(0.2, 0.5)})`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 2.5), rng.range(1, 2.5));
  }
  return toTexture(c);
}

export function pavers(opts: { color?: string; size?: number } = {}) {
  const size = opts.size ?? 512;
  const rng = new Rng(31);
  const [c, ctx] = makeCanvas(size, size);
  const [hc, hctx] = makeCanvas(size, size);
  ctx.fillStyle = '#7d7b77';
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, size, size);
  const rows = 8, cols = 4;
  const bh = size / rows, bw = size / cols;
  const base = new THREE.Color(opts.color ?? '#b9b6b0');
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k < cols + 1; k++) {
      const off = r % 2 ? bw / 2 : 0;
      const x = k * bw + off, y = r * bh;
      const col = base.clone().offsetHSL(0, 0, rng.range(-0.04, 0.04));
      ctx.fillStyle = '#' + col.getHexString();
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      hctx.fillStyle = '#ddd';
      hctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
  noiseOverlay(ctx, size, size, 0.08, 9, 8, 0.06);
  return { map: toTexture(c), normalMap: normalFromHeight(hc, 2) };
}

export function brick(opts: { color?: string; mortar?: string; size?: number; seed?: number; noNormal?: boolean } = {}) {
  const size = opts.size ?? 512;
  const rng = new Rng(opts.seed ?? 13);
  const [c, ctx] = makeCanvas(size, size);
  const [hc, hctx] = makeCanvas(size, size);
  ctx.fillStyle = opts.mortar ?? '#b8ada0';
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, size, size);
  const rows = 16, cols = 8;
  const bh = size / rows, bw = size / cols;
  const base = new THREE.Color(opts.color ?? '#a4553f');
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k < cols + 1; k++) {
      const off = r % 2 ? bw / 2 : 0;
      const x = k * bw + off, y = r * bh;
      const col = base.clone().offsetHSL(rng.range(-0.015, 0.015), rng.range(-0.05, 0.05), rng.range(-0.07, 0.06));
      ctx.fillStyle = '#' + col.getHexString();
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      hctx.fillStyle = '#ccc';
      hctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
  noiseOverlay(ctx, size, size, 0.1, 4, 12, 0.08);
  return { map: toTexture(c), normalMap: opts.noNormal ? null : normalFromHeight(hc, 2.5), canvas: c };
}

export function plaster(color = '#e8e2d6', size = 256, amount = 0.05) {
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  noiseOverlay(ctx, size, size, amount, 8, 6, 0.03);
  return toTexture(c);
}

export function woodPlanks(opts: { color?: string; size?: number; planks?: number; seed?: number } = {}) {
  const size = opts.size ?? 512;
  const rng = new Rng(opts.seed ?? 19);
  const [c, ctx] = makeCanvas(size, size);
  const n = opts.planks ?? 6;
  const ph = size / n;
  const base = new THREE.Color(opts.color ?? '#b07a4a');
  for (let i = 0; i < n; i++) {
    const col = base.clone().offsetHSL(rng.range(-0.01, 0.01), rng.range(-0.05, 0.05), rng.range(-0.06, 0.05));
    ctx.fillStyle = '#' + col.getHexString();
    ctx.fillRect(0, i * ph, size, ph);
    // grain
    for (let k = 0; k < 26; k++) {
      ctx.strokeStyle = `rgba(60,35,15,${rng.range(0.05, 0.16)})`;
      ctx.lineWidth = rng.range(0.6, 2);
      ctx.beginPath();
      const y0 = i * ph + rng.range(2, ph - 2);
      ctx.moveTo(0, y0);
      for (let x = 0; x <= size; x += 32) ctx.lineTo(x, y0 + Math.sin(x * 0.02 + k) * rng.range(0.5, 3));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,25,10,0.45)';
    ctx.fillRect(0, i * ph, size, 2);
    const cut = rng.range(0, size);
    ctx.fillRect(cut, i * ph, 2, ph);
  }
  return toTexture(c);
}

export function ceilingTiles(size = 256) {
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#f1f0ec';
  ctx.fillRect(0, 0, size, size);
  noiseOverlay(ctx, size, size, 0.03, 2, 16, 0.05);
  ctx.fillStyle = '#c9c7c1';
  ctx.fillRect(0, 0, size, 3);
  ctx.fillRect(0, 0, 3, size);
  return toTexture(c);
}

export function grass(size = 256) {
  const rng = new Rng(55);
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#5e8a3c';
  ctx.fillRect(0, 0, size, size);
  noiseOverlay(ctx, size, size, 0.22, 3, 6, 0.12);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = `rgba(${rng.int(60, 120)},${rng.int(120, 170)},${rng.int(40, 70)},0.5)`;
    ctx.fillRect(rng.range(0, size), rng.range(0, size), 1, rng.range(2, 4));
  }
  return toTexture(c);
}

export function gravel(size = 256) {
  const rng = new Rng(42);
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#8b8378';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3000; i++) {
    const v = rng.int(90, 190);
    ctx.fillStyle = `rgb(${v},${v - rng.int(0, 15)},${v - rng.int(5, 25)})`;
    ctx.beginPath();
    ctx.arc(rng.range(0, size), rng.range(0, size), rng.range(0.8, 2.6), 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}

/** Building facade with a window grid. Returns color map + emissive map for lit windows at night. */
export function facade(opts: { wall: string; window?: string; frame?: string; floors: number; cols: number; seed: number; brick?: boolean; shop?: boolean }) {
  const W = 512, H = 512;
  const rng = new Rng(opts.seed);
  const [c, ctx] = makeCanvas(W, H);
  const [ec, ectx] = makeCanvas(W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);
  if (opts.brick) {
    const b = brick({ color: opts.wall, size: 512, seed: opts.seed, noNormal: true });
    ctx.drawImage(b.canvas, 0, 0, W, H);
    b.map.dispose();
  } else {
    ctx.fillStyle = opts.wall;
    ctx.fillRect(0, 0, W, H);
    noiseOverlay(ctx, W, H, 0.05, opts.seed, 6, 0.03);
  }
  const fh = H / opts.floors, cw = W / opts.cols;
  for (let f = 0; f < opts.floors; f++) {
    const isShop = opts.shop && f === opts.floors - 1;
    for (let k = 0; k < opts.cols; k++) {
      const x = k * cw + cw * 0.18, y = f * fh + fh * (isShop ? 0.12 : 0.2);
      const w = cw * 0.64, h = fh * (isShop ? 0.8 : 0.55);
      ctx.fillStyle = opts.frame ?? '#e9e5dc';
      ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, opts.window ?? '#6f93ad');
      g.addColorStop(0.5, '#a9c6d8');
      g.addColorStop(1, '#4e6f88');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.7);
      ctx.lineTo(x + w * 0.5, y);
      ctx.lineTo(x + w * 0.7, y);
      ctx.lineTo(x, y + h);
      ctx.fill();
      ctx.fillStyle = opts.frame ?? '#e9e5dc';
      ctx.fillRect(x + w / 2 - 2, y, 4, h);
      // sill
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x - 6, y + h + 4, w + 12, 5);
      if (rng.chance(isShop ? 0.9 : 0.45)) {
        const warm = rng.chance(0.7);
        ectx.fillStyle = warm ? `rgb(255,${rng.int(190, 220)},${rng.int(120, 160)})` : `rgb(${rng.int(170, 210)},${rng.int(200, 230)},255)`;
        ectx.fillRect(x, y, w, h);
        ectx.fillStyle = 'rgba(0,0,0,0.35)';
        ectx.fillRect(x + w / 2 - 2, y, 4, h);
      }
    }
  }
  return { map: toTexture(c, { repeat: false }), emissiveMap: toTexture(ec, { repeat: false }) };
}

/** Large text sign texture. */
export function signTexture(text: string, opts: { bg: string; fg: string; w?: number; h?: number; font?: string; border?: string; sub?: string; icon?: (ctx: CanvasRenderingContext2D, x: number, y: number, s: number) => void } ) {
  const W = opts.w ?? 1024, H = opts.h ?? 256;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, W, H);
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = H * 0.06;
    ctx.strokeRect(H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1);
  }
  ctx.fillStyle = opts.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fontSize = H * (opts.sub ? 0.46 : 0.6);
  const family = opts.font ?? "'Lilita One', 'Arial Black', sans-serif";
  ctx.font = `${fontSize}px ${family}`;
  const iconSpace = opts.icon ? H * 0.9 : 0;
  while (ctx.measureText(text).width > W * 0.9 - iconSpace && fontSize > 10) {
    fontSize *= 0.92;
    ctx.font = `${fontSize}px ${family}`;
  }
  const tw = ctx.measureText(text).width;
  const cx = W / 2 + iconSpace / 2;
  if (opts.icon) opts.icon(ctx, cx - tw / 2 - iconSpace * 0.55, H * (opts.sub ? 0.4 : 0.5), H * 0.62);
  ctx.fillText(text, cx, H * (opts.sub ? 0.4 : 0.53));
  if (opts.sub) {
    let subSize = H * 0.2;
    ctx.font = `800 ${subSize}px 'Nunito', sans-serif`;
    while (ctx.measureText(opts.sub).width > W * 0.84 && subSize > 8) {
      subSize *= 0.92;
      ctx.font = `800 ${subSize}px 'Nunito', sans-serif`;
    }
    ctx.fillText(opts.sub, W / 2, H * 0.78);
  }
  return toTexture(c, { repeat: false });
}

export function cardboard(size = 256) {
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#c49a64';
  ctx.fillRect(0, 0, size, size);
  noiseOverlay(ctx, size, size, 0.06, 12, 10, 0.06);
  ctx.strokeStyle = 'rgba(120,85,45,0.25)';
  for (let i = 0; i < size; i += 6) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  return toTexture(c);
}
