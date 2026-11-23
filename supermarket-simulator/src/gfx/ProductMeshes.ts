// Procedural 3D models for every product (origin = bottom center, +Z = front).
import * as THREE from 'three';
import { GeoBuilder, trs, type UVRect } from './GeoBuilder';
import { productAtlas, artFor } from './ProductArt';
import { PRODUCTS, type ProductDef } from '../data/products';

const cache = new Map<string, THREE.BufferGeometry>();

const shade = (hex: string, l: number) => '#' + new THREE.Color(hex).offsetHSL(0, 0, l).getHexString();

/** Map a sub-range of a UV rect (fractions) */
function sub(r: UVRect, fx0: number, fx1: number, fy0 = 0, fy1 = 1): UVRect {
  return { u0: r.u0 + (r.u1 - r.u0) * fx0, u1: r.u0 + (r.u1 - r.u0) * fx1, v0: r.v0 + (r.v1 - r.v0) * fy0, v1: r.v0 + (r.v1 - r.v0) * fy1 };
}

/** Open cylinder side with label UV wrap. */
function labelCylinder(b: GeoBuilder, rTop: number, rBot: number, h: number, y: number, uv: UVRect, seg = 14) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true);
  // rotate so the label seam is at the back (u=0.25 faces +Z by default; shift by quarter turn)
  b.add(g, '#ffffff', trs(0, y + h / 2, 0, { ry: -Math.PI / 2 }), uv);
}

function disc(b: GeoBuilder, r: number, y: number, color: string, up = true, seg = 14) {
  const g = new THREE.CircleGeometry(r, seg);
  b.add(g, color, trs(0, y, 0, { rx: up ? -Math.PI / 2 : Math.PI / 2 }));
}

function buildShape(p: ProductDef): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const [w, h, d] = p.dims;
  const tile = artFor(p.id).tile;
  const L = productAtlas.rect(tile);
  const col = p.color;
  switch (p.shape) {
    case 'apple': {
      b.sphere(w / 2, col, 0, h * 0.48, 0, { sy: 0.92, uv: L, ws: 12, hs: 9 });
      b.cyl(0.004, 0.004, 0.025, '#5d4037', 0.003, h * 0.95, 0, { rz: 0.25, seg: 5 });
      b.sphere(0.016, '#43a047', 0.016, h * 0.94, 0, { sx: 1.6, sy: 0.35, sz: 0.8, rz: -0.4, ws: 6, hs: 4 });
      break;
    }
    case 'orange':
      b.sphere(w / 2, col, 0, h / 2, 0, { uv: L, ws: 12, hs: 9 });
      b.sphere(0.007, '#558b2f', 0, h * 0.99, 0, { ws: 5, hs: 3 });
      break;
    case 'lemon':
      b.sphere(w / 2, col, 0, h / 2, 0, { sz: d / w, uv: L, ws: 12, hs: 8 });
      b.sphere(0.01, shade(col, -0.05), 0, h / 2, d / 2 - 0.002, { ws: 5, hs: 4 });
      b.sphere(0.01, shade(col, -0.05), 0, h / 2, -d / 2 + 0.002, { ws: 5, hs: 4 });
      break;
    case 'tomato':
      b.sphere(w / 2, col, 0, h / 2, 0, { sy: (h / w) * 1.0, uv: L, ws: 12, hs: 8 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.box(0.024, 0.003, 0.006, '#2e7d32', Math.cos(a) * 0.012, h - 0.002, Math.sin(a) * 0.012, { ry: -a });
      }
      break;
    case 'onion':
      b.sphere(w / 2, col, 0, h * 0.45, 0, { sy: 0.9, uv: L, ws: 12, hs: 8 });
      b.cone(0.012, 0.03, shade(col, 0.1), 0, h * 0.85 + 0.01, 0, { seg: 6 });
      break;
    case 'avocado':
      b.lathe([[0.001, 0], [0.03, 0.006], [0.04, 0.03], [0.036, 0.06], [0.024, 0.085], [0.008, 0.1], [0.001, 0.101]], col, 0, 0, 0, { seg: 12, uv: L });
      break;
    case 'pear':
      b.lathe([[0.001, 0], [0.032, 0.008], [0.04, 0.035], [0.03, 0.065], [0.018, 0.09], [0.012, 0.11], [0.001, 0.115]], col, 0, 0, 0, { seg: 12, uv: L });
      b.cyl(0.003, 0.003, 0.02, '#5d4037', 0, 0.12, 0, { seg: 5, rz: 0.2 });
      break;
    case 'banana': {
      for (let i = 0; i < 4; i++) {
        const g = new THREE.TorusGeometry(0.11, 0.017, 6, 10, Math.PI * 0.55);
        b.add(g, i % 2 ? col : shade(col, -0.04), trs(-0.06 + i * 0.006, 0.12, -0.04 + i * 0.026, { rz: Math.PI * 1.22, rx: 0.1 - i * 0.05 }), L);
      }
      b.box(0.02, 0.02, 0.09, '#6d4c41', 0.075, 0.04, 0.0);
      break;
    }
    case 'carrot':
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.03;
        b.cone(0.016, 0.2, col, x, 0.02, 0.0, { rx: Math.PI / 2, seg: 7, uv: L });
        b.cone(0.012, 0.08, '#43a047', x, 0.02, -0.13, { rx: -Math.PI / 2, seg: 4 });
      }
      break;
    case 'cucumber':
      b.capsule(w / 2, d - w, col, 0, w / 2, 0, { rx: Math.PI / 2, uv: L, radial: 8, cap: 3 });
      break;
    case 'pepper':
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.sphere(w * 0.32, col, Math.cos(a) * w * 0.14, h * 0.45, Math.sin(a) * w * 0.14, { sy: 1.4, ws: 9, hs: 7, uv: L });
      }
      b.cyl(0.006, 0.008, 0.025, '#2e7d32', 0, h * 0.95, 0, { seg: 6 });
      break;
    case 'broccoli':
      b.cyl(0.018, 0.022, 0.08, '#9ccc65', 0, 0.04, 0, { seg: 7 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const r = i === 0 ? 0 : 0.035;
        b.sphere(0.035, i % 2 ? col : shade(col, -0.05), Math.cos(a) * r, 0.1 + (i === 0 ? 0.02 : 0), Math.sin(a) * r, { ws: 7, hs: 5, uv: L });
      }
      break;
    case 'lettuce':
      b.sphere(w / 2, col, 0, h / 2, 0, { sy: h / w, ws: 12, hs: 8, uv: L });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.sphere(w * 0.32, shade(col, 0.08), Math.cos(a) * w * 0.25, h * 0.35, Math.sin(a) * w * 0.25, { sx: 0.4, rz: 0, ry: -a, ws: 8, hs: 6 });
      }
      break;
    case 'grapes': {
      const pts: [number, number, number][] = [];
      for (let layer = 0; layer < 3; layer++) {
        const n = 6 - layer * 2;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + layer;
          pts.push([Math.cos(a) * 0.03 * (1 - layer * 0.2), 0.02 + layer * 0.022, Math.sin(a) * 0.05 * (1 - layer * 0.25)]);
        }
      }
      for (const [x, y, z] of pts) b.sphere(0.017, col, x, y, z, { ws: 6, hs: 5, uv: L });
      b.cyl(0.003, 0.003, 0.05, '#6d4c41', 0, 0.08, -0.05, { rx: 0.9, seg: 4 });
      break;
    }
    case 'watermelon':
      b.sphere(w / 2, col, 0, h / 2, 0, { sy: h / w, sz: d / w, uv: L, ws: 14, hs: 10 });
      break;
    case 'pineapple':
      b.sphere(w / 2, col, 0, 0.1, 0, { sy: 1.45, uv: L, ws: 12, hs: 9 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.cone(0.012, 0.11, '#2e7d32', Math.cos(a) * 0.012, 0.25, Math.sin(a) * 0.012, { rx: Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.4, seg: 4 });
      }
      break;
    case 'berries':
      b.boxB(w, h * 0.7, d, '#2e7d32', 0, 0, 0);
      for (let i = 0; i < 8; i++) b.sphere(0.018, col, ((i % 4) - 1.5) * 0.03, h * 0.75, (Math.floor(i / 4) - 0.5) * 0.04, { sy: 1.2, ws: 7, hs: 5 });
      b.box(w * 0.6, 0.002, d * 0.5, '#ffffff', 0, h * 0.7 + 0.001, 0, { uv: L });
      break;
    case 'potatoBag':
      b.rbox(w, h, d, 0.04, '#b08850', 0, h / 2, 0);
      for (let i = 0; i < 6; i++) b.sphere(0.04, '#c8a26b', ((i % 3) - 1) * 0.06, h * 0.6, (Math.floor(i / 3) - 0.5) * 0.12, { sy: 0.7, ws: 7, hs: 5 });
      b.box(w * 0.7, 0.003, d * 0.5, '#ffffff', 0, h + 0.002, 0, { uv: L, rx: 0 });
      break;
    case 'box': {
      const flat = h < Math.min(w, d) * 0.7;
      if (flat) {
        b.box(w, h, d, p.label, 0, h / 2, 0, { faces: { py: L, pz: sub(L, 0, 1, 0, 0.25) } });
      } else {
        b.box(w, h, d, p.label, 0, h / 2, 0, { faces: { pz: L, nz: L } });
      }
      break;
    }
    case 'butter':
      b.box(w, h, d, p.label, 0, h / 2, 0, { faces: { py: L } });
      break;
    case 'bar':
      b.box(w, h, d, p.label, 0, h / 2, 0, { faces: { py: L } });
      b.box(0.012, h * 1.05, d * 1.02, '#bdbdbd', w / 2 - 0.006, h / 2, 0);
      b.box(0.012, h * 1.05, d * 1.02, '#bdbdbd', -w / 2 + 0.006, h / 2, 0);
      break;
    case 'can': {
      const r = w / 2;
      labelCylinder(b, r, r, h * 0.84, h * 0.08, L);
      b.cyl(r * 0.92, r, h * 0.08, '#cfd8dc', 0, h * 0.04, 0, { seg: 14 });
      b.cyl(r * 0.88, r, h * 0.08, '#cfd8dc', 0, h * 0.96, 0, { seg: 14, rx: Math.PI });
      disc(b, r * 0.88, h, '#b0bec5');
      break;
    }
    case 'bottle': {
      const r = w / 2;
      const prof: [number, number][] = [[0.001, 0], [r * 0.92, 0], [r, h * 0.03], [r, h * 0.62], [r * 0.85, h * 0.72], [r * 0.45, h * 0.82], [r * 0.36, h * 0.88], [r * 0.36, h * 0.92]];
      const bodyCol = p.category === 'drinks' ? shade(p.color, 0.05) : p.color;
      b.lathe(prof, bodyCol, 0, 0, 0, { seg: 12 });
      labelCylinder(b, r * 1.02, r * 1.02, h * 0.35, h * 0.2, L, 12);
      b.cyl(r * 0.4, r * 0.4, h * 0.08, p.color2, 0, h * 0.96, 0, { seg: 10 });
      break;
    }
    case 'spray': {
      b.rbox(w, h * 0.68, d, 0.015, p.color, 0, h * 0.34, 0);
      b.box(w * 0.9, h * 0.4, 0.002, '#ffffff', 0, h * 0.32, d / 2 + 0.001, { uv: L });
      b.cyl(w * 0.18, w * 0.2, h * 0.1, '#eeeeee', 0, h * 0.73, 0, { seg: 8 });
      b.box(w * 0.3, h * 0.08, d * 1.1, p.color2, 0, h * 0.82, 0.01);
      b.box(w * 0.12, h * 0.12, d * 0.3, p.color2, 0, h * 0.74, d * 0.45, { rx: -0.3 });
      break;
    }
    case 'carton': {
      const bh = h * 0.78;
      b.box(w, bh, d, '#ffffff', 0, bh / 2, 0, {
        faces: { pz: sub(L, 0, 0.25), px: sub(L, 0.25, 0.5), nz: sub(L, 0.5, 0.75), nx: sub(L, 0.75, 1) },
      });
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(w / 2, 0);
      shape.lineTo(0, h * 0.18);
      shape.closePath();
      b.extrude(shape, d, p.color2, 0, bh, -d / 2);
      b.box(w * 0.3, h * 0.04, d * 1.0, p.color2, 0, bh + h * 0.18, 0);
      b.cyl(w * 0.13, w * 0.13, h * 0.04, '#fafafa', w * 0.2, bh + h * 0.09, d * 0.2, { rx: -0.9, seg: 8 });
      break;
    }
    case 'jar': {
      const r = w / 2;
      b.cyl(r * 0.95, r, h * 0.8, p.color, 0, h * 0.4, 0, { seg: 12 });
      labelCylinder(b, r * 1.01, r * 1.03, h * 0.55, h * 0.12, L, 12);
      b.cyl(r * 0.9, r * 0.9, h * 0.18, p.color2, 0, h * 0.89, 0, { seg: 12 });
      break;
    }
    case 'tub':
    case 'cup': {
      const r = w / 2;
      const rb = r * 0.78;
      labelCylinder(b, r, rb, h * 0.92, 0, L, 14);
      disc(b, rb, 0.001, p.color, false);
      b.cyl(r * 1.03, r * 1.03, h * 0.08, p.shape === 'cup' ? '#ffffff' : p.color2, 0, h * 0.96, 0, { seg: 14 });
      break;
    }
    case 'tray': {
      b.boxB(w, h * 0.45, d, '#eceff1', 0, 0, 0);
      b.rbox(w * 0.85, h * 0.6, d * 0.8, h * 0.25, col, 0, h * 0.5, 0);
      if (p.id === 'sausage') {
        for (let i = 0; i < 4; i++) b.capsule(0.013, d * 0.65, col, -w * 0.3 + i * w * 0.2, h * 0.75, 0, { rx: Math.PI / 2, radial: 6, cap: 2 });
      }
      b.box(w * 0.4, 0.002, d * 0.35, '#ffffff', w * 0.18, h * 0.86, d * 0.18, { uv: L });
      break;
    }
    case 'fish':
      b.sphere(d / 2, col, -0.02, h * 0.5, 0, { sx: (w * 0.8) / d, sy: (h * 0.9) / d, ws: 12, hs: 8 });
      b.cone(d * 0.35, w * 0.25, shade(col, -0.1), w * 0.36, h * 0.5, 0, { rz: Math.PI / 2, sz: 0.25, seg: 6 });
      b.sphere(0.008, '#111111', -w * 0.33, h * 0.62, d * 0.18, { ws: 5, hs: 4 });
      break;
    case 'loaf': {
      b.rbox(w, h * 0.7, d, 0.02, col, 0, h * 0.35, 0);
      b.cyl(w / 2, w / 2, d * 0.98, shade(col, -0.06), 0, h * 0.66, 0, { rz: Math.PI / 2, ry: Math.PI / 2, seg: 10, thetaStart: -Math.PI / 2, thetaLength: Math.PI, open: false });
      b.box(w * 1.04, h * 0.5, d * 0.32, '#ffffff', 0, h * 0.42, 0, { faces: { px: L, nx: L } });
      break;
    }
    case 'baguette':
      b.capsule(w / 2, d - w, col, 0, w / 2, 0, { rx: Math.PI / 2, radial: 8, cap: 3 });
      for (let i = 0; i < 4; i++) b.box(0.012, 0.006, 0.06, shade(col, 0.12), 0, w * 0.97, -d * 0.3 + i * d * 0.2, { ry: 0.6 });
      break;
    case 'croissant': {
      const g = new THREE.TorusGeometry(0.045, 0.024, 7, 10, Math.PI * 1.15);
      b.add(g, col, trs(0, 0.02, 0.02, { rx: -Math.PI / 2, rz: Math.PI * 0.92, sy: 0.75 }));
      break;
    }
    case 'buns':
      b.boxB(w, h * 0.15, d, '#f5f5f5', 0, 0, 0);
      for (let i = 0; i < 6; i++) b.sphere(0.034, col, ((i % 3) - 1) * 0.065, h * 0.45, (Math.floor(i / 3) - 0.5) * 0.065, { sy: 0.8, ws: 9, hs: 6 });
      break;
    case 'donut':
      b.torus(0.032, 0.017, '#d7a35a', 0, 0.018, 0, { rx: Math.PI / 2, rs: 6, ts: 14 });
      b.torus(0.032, 0.015, col, 0, 0.025, 0, { rx: Math.PI / 2, rs: 6, ts: 14, sz: 0.6 });
      break;
    case 'roll':
      b.cyl(w / 2, w / 2, h, col, 0, h / 2, 0, { seg: 12 });
      b.torus(w * 0.28, 0.006, '#7b4a1e', 0, h + 0.001, 0, { rx: Math.PI / 2, rs: 4, ts: 12 });
      b.torus(w * 0.14, 0.006, '#7b4a1e', 0, h + 0.001, 0, { rx: Math.PI / 2, rs: 4, ts: 10 });
      break;
    case 'muffin':
      b.cyl(w * 0.45, w * 0.35, h * 0.5, '#90caf9', 0, h * 0.25, 0, { seg: 12 });
      b.sphere(w * 0.52, '#c58b4e', 0, h * 0.5, 0, { thetaLength: Math.PI / 2, ws: 12, hs: 6, sy: 0.9 });
      for (let i = 0; i < 5; i++) b.sphere(0.008, col, Math.cos(i * 1.3) * 0.02, h * 0.82, Math.sin(i * 1.3) * 0.02, { ws: 5, hs: 4 });
      break;
    case 'eggs':
      b.boxB(w, h * 0.5, d, '#bcaaa4', 0, 0, 0);
      for (let i = 0; i < 12; i++) b.sphere(0.021, '#d7ccc8', -w / 2 + 0.025 + (i % 6) * (w - 0.05) / 5, h * 0.5, (Math.floor(i / 6) - 0.5) * 0.05, { thetaLength: Math.PI / 2, ws: 8, hs: 4 });
      b.box(w * 0.5, h * 0.3, 0.002, '#ffffff', 0, h * 0.25, d / 2 + 0.001, { uv: L });
      break;
    case 'cheese': {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(w / 2, 0);
      shape.lineTo(w / 2, h);
      shape.lineTo(-w / 2, h * 0.35);
      shape.closePath();
      b.extrude(shape, d, col, 0, 0, -d / 2);
      b.box(w * 0.5, h * 0.3, 0.002, '#ffffff', w * 0.1, h * 0.3, d / 2 + 0.001, { uv: L });
      break;
    }
    case 'tp': {
      const n = p.id === 'papertowel' ? 2 : 3;
      const r = Math.min(w / (n * 2), d / 2);
      for (let i = 0; i < n; i++) for (let k = 0; k < (p.id === 'papertowel' ? 1 : 2); k++) {
        b.cyl(r, r, h, '#fafafa', -w / 2 + r + i * r * 2, h / 2, (k - 0.5) * r * 2 * (p.id === 'papertowel' ? 0 : 1), { seg: 10 });
      }
      b.box(w * 1.01, h * 0.35, d * 1.01, '#ffffff', 0, h * 0.5, 0, { faces: { pz: sub(L, 0, 0.5), nz: sub(L, 0.5, 1) } });
      break;
    }
    case 'flowers':
      b.cone(w / 2, h * 0.6, '#f5f5f5', 0, h * 0.3, 0, { rx: Math.PI, seg: 8 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const rr = i === 0 ? 0 : w * 0.25;
        b.sphere(0.022, i % 3 === 0 ? '#ffeb3b' : col, Math.cos(a) * rr, h * 0.85 + (i % 2) * 0.03, Math.sin(a) * rr, { sy: 1.3, ws: 6, hs: 5 });
      }
      break;
    case 'plant':
      b.cyl(w / 2, w * 0.35, h * 0.45, '#c1663a', 0, h * 0.225, 0, { seg: 10 });
      b.cyl(w * 0.46, w * 0.46, 0.01, '#4e342e', 0, h * 0.44, 0, { seg: 10 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.cone(0.018, 0.08, i % 2 ? col : shade(col, 0.08), Math.cos(a) * 0.022, h * 0.6, Math.sin(a) * 0.022, { rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5, seg: 5 });
      }
      break;
    case 'ball':
      b.sphere(w / 2, col, 0, h / 2, 0, { thetaLength: Math.PI / 2, ws: 14, hs: 6 });
      b.sphere(w / 2, p.color2, 0, h / 2, 0, { thetaStart: Math.PI / 2, thetaLength: Math.PI / 2, ws: 14, hs: 6 });
      b.torus(w / 2, 0.006, '#ffffff', 0, h / 2, 0, { rx: Math.PI / 2, rs: 4, ts: 18 });
      break;
    case 'teddy': {
      const c2 = shade(col, 0.15);
      b.sphere(0.07, col, 0, 0.07, 0, { sy: 1.1, ws: 10, hs: 8 });
      b.sphere(0.05, col, 0, 0.18, 0, { ws: 10, hs: 8 });
      b.sphere(0.018, col, -0.04, 0.22, 0, { ws: 6, hs: 5 });
      b.sphere(0.018, col, 0.04, 0.22, 0, { ws: 6, hs: 5 });
      b.sphere(0.022, c2, 0, 0.17, 0.042, { ws: 6, hs: 5 });
      b.sphere(0.006, '#111111', -0.018, 0.195, 0.044, { ws: 4, hs: 3 });
      b.sphere(0.006, '#111111', 0.018, 0.195, 0.044, { ws: 4, hs: 3 });
      b.capsule(0.022, 0.05, col, -0.07, 0.09, 0.02, { rz: 0.8, radial: 6, cap: 2 });
      b.capsule(0.022, 0.05, col, 0.07, 0.09, 0.02, { rz: -0.8, radial: 6, cap: 2 });
      b.capsule(0.025, 0.04, col, -0.04, 0.02, 0.05, { rx: Math.PI / 2, radial: 6, cap: 2 });
      b.capsule(0.025, 0.04, col, 0.04, 0.02, 0.05, { rx: Math.PI / 2, radial: 6, cap: 2 });
      break;
    }
    case 'mug':
      b.cyl(0.04, 0.04, h, col, -0.01, h / 2, 0, { seg: 12 });
      b.torus(0.025, 0.007, col, 0.035, h / 2, 0, { rs: 5, ts: 10 });
      disc(b, 0.036, h - 0.004, '#fafafa');
      break;
    case 'pan':
      b.cyl(w / 2, w * 0.42, h, col, 0, h / 2, -d / 2 + w / 2, { seg: 16 });
      b.box(0.025, 0.015, d - w, '#212121', 0, h * 0.7, d / 2 - (d - w) / 2);
      break;
    case 'folded':
      b.rbox(w, h, d, 0.01, col, 0, h / 2, 0);
      b.torus(0.03, 0.006, shade(col, -0.1), 0, h, -d * 0.3, { rx: Math.PI / 2, arc: Math.PI, rs: 4, ts: 8 });
      break;
    case 'blister':
      b.box(w, h, 0.004, p.label, 0, h / 2, -0.01, { faces: { pz: L, nz: L } });
      b.rbox(w * 0.7, h * 0.6, d * 0.7, 0.01, '#e0e0e0', 0, h * 0.4, 0.005);
      break;
    case 'bag':
    default: {
      const bh = h * 0.86;
      b.box(w - d * 0.5, bh, d, p.label, 0, h * 0.07 + bh / 2, 0, { faces: { pz: L, nz: L } });
      b.cyl(d / 2, d / 2, bh, p.label, -(w - d * 0.5) / 2, h * 0.07 + bh / 2, 0, { seg: 8, thetaStart: Math.PI, thetaLength: Math.PI, sx: 0.5 });
      b.cyl(d / 2, d / 2, bh, p.label, (w - d * 0.5) / 2, h * 0.07 + bh / 2, 0, { seg: 8, thetaStart: 0, thetaLength: Math.PI, sx: 0.5 });
      b.box(w * 0.98, h * 0.07, d * 0.3, p.color2, 0, h * 0.965, 0);
      b.box(w * 0.98, h * 0.07, d * 0.3, p.color2, 0, h * 0.035, 0);
      break;
    }
  }
  return b.build()!;
}

export function productGeometry(id: string): THREE.BufferGeometry {
  let g = cache.get(id);
  if (!g) {
    const p = PRODUCTS.find((x) => x.id === id)!;
    g = buildShape(p);
    cache.set(id, g);
  }
  return g;
}

let sharedMat: THREE.MeshStandardMaterial | null = null;
export function productMaterial(): THREE.MeshStandardMaterial {
  if (!sharedMat) {
    sharedMat = new THREE.MeshStandardMaterial({ map: productAtlas.texture, vertexColors: true, roughness: 0.55, metalness: 0.0 });
  }
  return sharedMat;
}
