// Procedural models for furniture, fixtures and room props.
// Local space: origin at floor center of the footprint, +Z = front (customer side), X = width.
import * as THREE from 'three';
import { GeoBuilder, trs } from './GeoBuilder';

export interface FurnGeo {
  solid: THREE.BufferGeometry | null;
  metal: THREE.BufferGeometry | null;
  glass: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
}

export class FB {
  s = new GeoBuilder();
  m = new GeoBuilder();
  g = new GeoBuilder();
  e = new GeoBuilder();
  build(): FurnGeo {
    return { solid: this.s.build(), metal: this.m.build(), glass: this.g.build(), glow: this.e.build() };
  }
}

const WOOD = '#b98a57';
const WOOD_D = '#8a6038';
const STEEL = '#d5dbe0';
const STEEL_D = '#8b959e';
const WHITE = '#f4f6f8';
const DARK = '#2c3238';

// ---------------------------------------------------------------------------
// Display furniture
// ---------------------------------------------------------------------------

export function shelfUnit(w: number, d: number, h: number, levels: number[], opts: { back?: string; double?: boolean; header?: string } = {}): FurnGeo {
  const f = new FB();
  const back = opts.back ?? '#3f78b5';
  const dd = opts.double ? d / 2 : d;
  // base plinth
  if (opts.double) {
    f.s.boxB(w, 0.1, d - 0.02, '#5d6d7e', 0, 0, 0);
  } else f.s.boxB(w, 0.1, d - 0.02, '#5d6d7e', 0, 0, 0);
  // back panel
  f.s.boxB(w - 0.04, h - 0.1, 0.03, back, 0, 0.1, opts.double ? 0 : -d / 2 + 0.03);
  // perforated look: small dots on back panel
  // uprights
  for (const sx of [-1, 1]) {
    f.m.boxB(0.035, h - 0.01, opts.double ? d - 0.06 : 0.05, STEEL_D, sx * (w / 2 - 0.045), 0, opts.double ? 0 : -d / 2 + 0.05);
    f.s.boxB(0.018, h, d - 0.02, '#e6eaee', sx * (w / 2 - 0.009), 0, 0);
  }
  const sides = opts.double ? [1, -1] : [1];
  for (const side of sides) {
    for (const y of levels) {
      const zc = opts.double ? side * (dd / 2) : 0.02;
      f.m.box(w - 0.06, 0.025, dd - 0.06, '#eef1f4', 0, y, zc);
      // price strip
      f.s.box(w - 0.06, 0.045, 0.012, '#ffffff', 0, y - 0.01, zc + side * (dd / 2 - 0.035));
    }
  }
  if (opts.header) {
    f.s.boxB(w, 0.16, 0.04, opts.header, 0, h, opts.double ? 0 : -d / 2 + 0.03);
  }
  return f.build();
}

export function fruitRack(): FurnGeo {
  const f = new FB();
  // side frames (angled ladders)
  for (const sx of [-0.56, 0.56]) {
    f.m.box(0.04, 1.32, 0.04, STEEL_D, sx, 0.66, -0.25, { rx: -0.25 });
    f.m.box(0.04, 0.5, 0.04, STEEL_D, sx, 0.25, 0.3, {});
    f.m.box(0.04, 0.04, 0.9, STEEL_D, sx, 0.04, 0.0);
  }
  for (let i = 0; i < 4; i++) {
    const y = 0.22 + i * 0.3, z = 0.22 - i * 0.14;
    crate(f, 1.08, 0.42, 0.16, 0, y, z, 0.28);
  }
  return f.build();
}

/** Wooden crate (open top), local center at (x,y,z) bottom, tilted around X. */
export function crate(f: FB, w: number, d: number, h: number, x: number, y: number, z: number, tilt: number, ry = 0) {
  const base = trs(x, y, z, { rx: tilt, ry });
  const b = f.s;
  const prev = b.base;
  b.base = base;
  b.boxB(w, 0.02, d, WOOD_D, 0, 0, 0);
  b.boxB(w, h, 0.02, WOOD, 0, 0, d / 2 - 0.01);
  b.boxB(w, h * 1.2, 0.02, WOOD, 0, 0, -d / 2 + 0.01);
  b.boxB(0.02, h, d, WOOD, w / 2 - 0.01, 0, 0);
  b.boxB(0.02, h, d, WOOD, -w / 2 + 0.01, 0, 0);
  b.boxB(w + 0.01, 0.02, 0.025, '#a87a4a', 0, h * 0.5, d / 2);
  b.base = prev;
}

export function produceTable(): FurnGeo {
  const f = new FB();
  f.s.boxB(2.3, 0.5, 1.3, WOOD_D, 0, 0, 0);
  f.s.boxB(2.4, 0.04, 1.4, WOOD, 0, 0.5, 0);
  for (let i = 0; i < 3; i++) {
    const x = -0.78 + i * 0.78;
    crate(f, 0.74, 0.6, 0.18, x, 0.56, 0.32, 0.22);
    crate(f, 0.74, 0.6, 0.18, x, 0.56, -0.32, 0.22, Math.PI);
  }
  // little roof sign posts
  f.m.box(0.04, 0.9, 0.04, STEEL_D, -1.15, 0.99, 0);
  f.m.box(0.04, 0.9, 0.04, STEEL_D, 1.15, 0.99, 0);
  f.s.box(2.4, 0.22, 0.04, '#4caf50', 0, 1.5, 0);
  return f.build();
}

export function breadRack(): FurnGeo {
  const f = new FB();
  const levels = [0.25, 0.62, 0.99, 1.36];
  for (const sx of [-0.78, 0.78]) {
    f.s.boxB(0.05, 1.65, 0.05, WOOD_D, sx, 0, 0.26);
    f.s.boxB(0.05, 1.65, 0.05, WOOD_D, sx, 0, -0.26);
  }
  f.s.boxB(1.6, 1.4, 0.03, '#d7b98e', 0, 0.2, -0.27);
  for (const y of levels) {
    f.s.box(1.56, 0.03, 0.56, WOOD, 0, y, 0, { rx: 0.12 });
    for (const sx of [-0.38, 0.38]) {
      // wicker basket
      const prev = f.s.base;
      f.s.base = trs(sx, y + 0.02, 0, { rx: 0.12 });
      f.s.boxB(0.7, 0.02, 0.5, '#c79a5b', 0, 0, 0);
      f.s.boxB(0.7, 0.08, 0.02, '#b07f42', 0, 0, 0.24);
      f.s.boxB(0.7, 0.08, 0.02, '#b07f42', 0, 0, -0.24);
      f.s.boxB(0.02, 0.08, 0.5, '#b07f42', 0.34, 0, 0);
      f.s.boxB(0.02, 0.08, 0.5, '#b07f42', -0.34, 0, 0);
      f.s.base = prev;
    }
    f.s.box(1.56, 0.045, 0.012, '#ffffff', 0, y - 0.02, 0.29, { rx: 0.12 });
  }
  f.s.boxB(1.66, 0.2, 0.05, '#8d5524', 0, 1.62, -0.25);
  return f.build();
}

export function glassFridge(doors: number, freezer = false): FurnGeo {
  const f = new FB();
  const w = 0.8 * doors, d = 0.75, h = 2.05;
  const body = freezer ? '#e8eef3' : '#2f3a44';
  // outer body (back, sides, top, bottom)
  f.s.boxB(w, 0.12, d, '#1f262c', 0, 0, 0);
  f.s.boxB(w, h - 0.12, 0.05, body, 0, 0.12, -d / 2 + 0.025);
  f.s.boxB(0.05, h, d, body, -w / 2 + 0.025, 0, 0);
  f.s.boxB(0.05, h, d, body, w / 2 - 0.025, 0, 0);
  f.s.boxB(w, 0.3, d, body, 0, h - 0.3, 0);
  // interior back (lit)
  f.s.boxB(w - 0.1, h - 0.45, 0.02, freezer ? '#dbe9f3' : '#e9eef2', 0, 0.14, -d / 2 + 0.06);
  // header light box
  f.e.box(w - 0.08, 0.14, 0.01, freezer ? '#bfe6ff' : '#fff7e0', 0, h - 0.15, d / 2 + 0.006);
  // interior LED strips
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + 0.4 + i * 0.8;
    f.e.box(0.02, h - 0.5, 0.02, '#eaf6ff', x - 0.36, 0.16 + (h - 0.5) / 2, d / 2 - 0.1);
  }
  // shelves
  for (let k = 0; k < 5; k++) {
    const y = 0.2 + k * 0.33;
    f.m.box(w - 0.1, 0.015, d - 0.2, '#c7ced4', 0, y, -0.02);
  }
  // doors: frames + glass
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + 0.4 + i * 0.8;
    f.m.box(0.78, 0.04, 0.04, STEEL_D, x, 0.14, d / 2 - 0.02);
    f.m.box(0.78, 0.04, 0.04, STEEL_D, x, h - 0.32, d / 2 - 0.02);
    f.m.box(0.04, h - 0.46, 0.04, STEEL_D, x - 0.37, 0.14 + (h - 0.46) / 2, d / 2 - 0.02);
    f.m.box(0.04, h - 0.46, 0.04, STEEL_D, x + 0.37, 0.14 + (h - 0.46) / 2, d / 2 - 0.02);
    f.g.box(0.72, h - 0.5, 0.012, '#ffffff', x, 0.16 + (h - 0.5) / 2, d / 2 - 0.02);
    // handle
    f.m.box(0.025, 0.6, 0.03, '#b0bac3', x + 0.3, 1.05, d / 2 + 0.02);
  }
  return f.build();
}

export function dairyCooler(): FurnGeo {
  const f = new FB();
  const w = 2.4, d = 0.95, h = 2.05;
  f.s.boxB(w, 0.45, d, '#e9edf0', 0, 0, 0.02);
  f.s.boxB(w, 0.06, 0.06, '#4a90d9', 0, 0.42, d / 2 - 0.01);
  f.s.boxB(w, h - 0.45, 0.12, '#e9edf0', 0, 0.45, -d / 2 + 0.06);
  f.s.boxB(0.06, h, d, '#dce3e8', -w / 2 + 0.03, 0, 0);
  f.s.boxB(0.06, h, d, '#dce3e8', w / 2 - 0.03, 0, 0);
  f.s.boxB(w, 0.2, 0.55, '#e9edf0', 0, h - 0.2, -d / 2 + 0.27);
  f.e.box(w - 0.1, 0.03, 0.4, '#f4fbff', 0, h - 0.21, -d / 2 + 0.3);
  f.e.box(w - 0.12, 0.14, 0.01, '#9fd4ff', 0, h - 0.1, -d / 2 + 0.55);
  for (let k = 0; k < 4; k++) {
    const y = 0.5 + k * 0.36;
    f.m.box(w - 0.12, 0.02, 0.55 - k * 0.04, '#c5ccd3', 0, y, -0.12 - k * 0.02, { rx: 0.08 });
    f.s.box(w - 0.12, 0.045, 0.012, '#ffffff', 0, y - 0.02, 0.15 - k * 0.04, { rx: 0.08 });
  }
  return f.build();
}

export function chestFreezer(): FurnGeo {
  const f = new FB();
  const w = 1.6, d = 0.85, h = 0.9;
  f.s.rbox(w, h - 0.05, d, 0.04, '#f2f5f7', 0, (h - 0.05) / 2, 0);
  f.s.boxB(w - 0.1, 0.02, d - 0.1, '#2a4a63', 0, h - 0.5, 0);
  f.s.boxB(w, 0.08, d, '#4a90d9', 0, 0.02, 0);
  // inner divider
  f.s.boxB(0.03, 0.45, d - 0.1, '#dfe6ea', 0, h - 0.5, 0);
  f.m.box(w, 0.03, 0.04, '#9aa6b0', 0, h - 0.04, d / 2 - 0.02);
  f.m.box(w, 0.03, 0.04, '#9aa6b0', 0, h - 0.04, -d / 2 + 0.02);
  f.g.box(w - 0.08, 0.01, d - 0.08, '#ffffff', 0, h - 0.02, 0);
  f.e.box(w - 0.2, 0.06, 0.005, '#bfe6ff', 0, 0.45, d / 2 + 0.003);
  return f.build();
}

export function serviceCounter(fish: boolean): FurnGeo {
  const f = new FB();
  const w = 2.4, d = 1.1;
  f.s.boxB(w, 0.85, d, fish ? '#2c6e9b' : '#7b2d26', 0, 0, 0);
  f.s.boxB(w, 0.05, 0.08, '#ffffff', 0, 0.8, d / 2 - 0.04);
  f.s.boxB(w - 0.08, 0.05, d - 0.15, fish ? '#e8f6ff' : '#f6f2ee', 0, 0.85, -0.02);
  if (fish) {
    // crushed ice bed
    for (let i = 0; i < 40; i++) f.s.sphere(0.04, '#ffffff', -1.1 + (i % 10) * 0.24, 0.9, -0.3 + Math.floor(i / 10) * 0.2, { ws: 5, hs: 4, sy: 0.4 });
  } else {
    f.m.box(w - 0.1, 0.02, 0.4, '#c5ccd3', 0, 1.08, -0.3);
  }
  // curved glass front
  f.g.box(w - 0.06, 0.45, 0.012, '#ffffff', 0, 1.1, 0.4, { rx: -0.45 });
  f.g.box(w - 0.06, 0.012, 0.35, '#ffffff', 0, 1.32, 0.15);
  f.m.box(0.03, 0.5, 0.03, STEEL_D, -w / 2 + 0.03, 1.1, 0.35);
  f.m.box(0.03, 0.5, 0.03, STEEL_D, w / 2 - 0.03, 1.1, 0.35);
  f.e.box(w - 0.1, 0.02, 0.05, '#fff4e6', 0, 1.3, 0.0);
  // staff side work top
  f.s.boxB(w, 0.95, 0.2, '#dcdcdc', 0, 0, -d / 2 - 0.1);
  return f.build();
}

export function checkoutCounter(): FurnGeo {
  const f = new FB();
  // main body
  f.s.boxB(2.6, 0.82, 0.8, '#d9dee3', 0, 0, 0);
  f.s.boxB(2.62, 0.08, 0.82, '#d12c2c', 0, 0.74, 0);
  f.s.boxB(2.62, 0.05, 0.84, '#e9edf0', 0, 0.82, 0);
  // conveyor belt (customer end at -X)
  f.s.boxB(1.45, 0.02, 0.5, '#1d1f21', -0.55, 0.87, 0.05);
  f.m.box(1.45, 0.06, 0.03, '#b8c0c7', -0.55, 0.9, 0.32);
  f.m.box(1.45, 0.06, 0.03, '#b8c0c7', -0.55, 0.9, -0.22);
  // scanner
  f.s.boxB(0.38, 0.03, 0.4, '#3b4248', 0.4, 0.87, 0.05);
  f.g.box(0.28, 0.01, 0.28, '#ffffff', 0.4, 0.905, 0.05);
  f.e.box(0.2, 0.004, 0.02, '#ff3030', 0.4, 0.91, 0.05);
  // bagging area (+X end)
  f.s.boxB(0.6, 0.02, 0.7, '#9aa4ad', 0.95, 0.87, 0.0);
  f.m.box(0.02, 0.1, 0.7, '#b8c0c7', 1.28, 0.93, 0.0);
  // register: monitor on a pole facing cashier (-Z)
  f.m.box(0.04, 0.35, 0.04, '#55606a', 0.85, 1.05, -0.3);
  f.s.box(0.42, 0.3, 0.05, '#20262b', 0.85, 1.35, -0.3);
  f.e.box(0.38, 0.26, 0.005, '#3b8fd9', 0.85, 1.35, -0.33);
  // customer display (faces +Z)
  f.s.box(0.22, 0.12, 0.03, '#20262b', 0.85, 1.32, -0.25, { rx: 0.0 });
  // keyboard + cash drawer
  f.s.boxB(0.4, 0.04, 0.18, '#30363c', 0.85, 0.87, -0.15);
  f.s.boxB(0.5, 0.14, 0.42, '#3a4147', 0.85, 0.6, -0.2);
  // POS card terminal on stand (customer side)
  f.m.box(0.03, 0.18, 0.03, '#55606a', 0.15, 0.96, 0.35);
  f.s.box(0.1, 0.16, 0.05, '#2b3035', 0.15, 1.1, 0.36, { rx: -0.4 });
  f.e.box(0.07, 0.05, 0.005, '#7ad7ff', 0.15, 1.13, 0.39, { rx: -0.4 });
  // lane light pole with number
  f.m.box(0.05, 1.2, 0.05, '#55606a', -1.25, 1.42, -0.3);
  f.e.box(0.3, 0.22, 0.08, '#ffffff', -1.25, 2.1, -0.3);
  return f.build();
}

export function selfCheckout(): FurnGeo {
  const f = new FB();
  f.s.rbox(0.7, 1.0, 0.6, 0.05, '#eceff1', 0, 0.5, 0);
  f.s.boxB(0.72, 0.05, 0.62, '#2b7de9', 0, 0.98, 0);
  f.s.box(0.5, 0.36, 0.06, '#263238', 0, 1.35, -0.12, { rx: -0.35 });
  f.e.box(0.44, 0.3, 0.005, '#4fc3f7', 0, 1.35, -0.09, { rx: -0.35 });
  f.g.box(0.26, 0.01, 0.26, '#ffffff', 0, 1.04, 0.12);
  f.e.box(0.16, 0.004, 0.02, '#ff3030', 0, 1.046, 0.12);
  f.s.boxB(0.5, 0.03, 0.4, '#90a4ae', 0.62, 0.76, 0);
  f.m.box(0.03, 0.78, 0.03, '#78909c', 0.84, 0.39, 0.18);
  f.m.box(0.03, 0.78, 0.03, '#78909c', 0.84, 0.39, -0.18);
  f.m.box(0.03, 1.8, 0.03, '#78909c', -0.3, 0.9, -0.25);
  f.e.box(0.12, 0.12, 0.12, '#66bb6a', -0.3, 1.86, -0.25);
  return f.build();
}

export function trashBin(): FurnGeo {
  const f = new FB();
  f.s.cyl(0.24, 0.21, 0.82, '#3b6e4f', 0, 0.41, 0, { seg: 14 });
  f.s.cyl(0.255, 0.255, 0.05, '#2e5a40', 0, 0.84, 0, { seg: 14 });
  f.s.sphere(0.25, '#3b6e4f', 0, 0.86, 0, { thetaLength: Math.PI / 2, sy: 0.4, ws: 14, hs: 4 });
  f.s.box(0.24, 0.08, 0.1, '#111111', 0, 0.86, 0.2);
  f.s.box(0.16, 0.1, 0.005, '#ffffff', 0, 0.55, 0.235);
  return f.build();
}

export function recycleBins(): FurnGeo {
  const f = new FB();
  const cols = ['#1e66c9', '#2e8b3a', '#e3b505'];
  cols.forEach((c, i) => {
    const x = -0.4 + i * 0.4;
    f.s.rbox(0.38, 0.95, 0.5, 0.03, c, x, 0.475, 0);
    f.s.box(0.2, 0.04, 0.1, '#111111', x, 0.96, 0.15);
  });
  f.s.box(0.3, 0.3, 0.005, '#ffffff', -0.4, 0.6, 0.253);
  return f.build();
}

export function storageRack(): FurnGeo {
  const f = new FB();
  const w = 2.4, d = 1.0, h = 2.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.m.boxB(0.07, h, 0.07, '#1f5fb4', sx * (w / 2 - 0.035), 0, sz * (d / 2 - 0.035));
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 6; k++) f.m.box(0.03, 0.03, d - 0.07, '#1f5fb4', sx * (w / 2 - 0.035), 0.3 + k * 0.4, 0, { rx: k % 2 ? 0.6 : -0.6 });
  }
  for (const y of [0.12, 0.95, 1.78]) {
    for (const sz of [-1, 1]) f.m.box(w, 0.1, 0.06, '#f28c1e', 0, y - 0.05, sz * (d / 2 - 0.035));
    f.m.box(w - 0.1, 0.02, d - 0.1, '#9aa5ae', 0, y, 0);
  }
  return f.build();
}

export function basketStand(): FurnGeo {
  const f = new FB();
  f.m.boxB(0.5, 0.06, 0.38, '#90a4ae', 0, 0, 0);
  for (let i = 0; i < 6; i++) basketMesh(f.s, 0, 0.08 + i * 0.07, 0, '#d32f2f');
  f.m.box(0.03, 0.9, 0.03, '#90a4ae', 0.22, 0.45, -0.17);
  f.s.box(0.3, 0.16, 0.02, '#ffffff', 0.22, 0.92, -0.17);
  return f.build();
}

export function basketMesh(b: GeoBuilder, x: number, y: number, z: number, color: string) {
  b.boxB(0.44, 0.02, 0.3, color, x, y, z);
  b.boxB(0.46, 0.2, 0.015, color, x, y, z + 0.155);
  b.boxB(0.46, 0.2, 0.015, color, x, y, z - 0.155);
  b.boxB(0.015, 0.2, 0.32, color, x + 0.23, y, z);
  b.boxB(0.015, 0.2, 0.32, color, x - 0.23, y, z);
}

export function cartMesh(b: GeoBuilder, m: GeoBuilder, x: number, z: number, ry = 0) {
  const base = trs(x, 0, z, { ry });
  const pb = b.base, pm = m.base;
  b.base = base;
  m.base = base;
  // basket (wire look via metal)
  m.boxB(0.5, 0.02, 0.8, '#b0bec5', 0, 0.5, 0);
  m.boxB(0.52, 0.42, 0.02, '#b0bec5', 0, 0.5, 0.4);
  m.boxB(0.52, 0.42, 0.02, '#b0bec5', 0, 0.5, -0.4);
  m.boxB(0.02, 0.42, 0.8, '#b0bec5', 0.26, 0.5, 0);
  m.boxB(0.02, 0.42, 0.8, '#b0bec5', -0.26, 0.5, 0);
  // handle
  b.box(0.54, 0.04, 0.04, '#d32f2f', 0, 1.0, 0.5);
  m.box(0.03, 0.15, 0.03, '#90a4ae', 0.25, 0.95, 0.46);
  m.box(0.03, 0.15, 0.03, '#90a4ae', -0.25, 0.95, 0.46);
  // chassis + wheels
  m.box(0.04, 0.04, 0.8, '#90a4ae', 0.2, 0.15, 0);
  m.box(0.04, 0.04, 0.8, '#90a4ae', -0.2, 0.15, 0);
  m.box(0.03, 0.4, 0.03, '#90a4ae', 0.2, 0.32, 0.38);
  m.box(0.03, 0.4, 0.03, '#90a4ae', -0.2, 0.32, 0.38);
  for (const wx of [-0.2, 0.2]) for (const wz of [-0.35, 0.35]) b.cyl(0.05, 0.05, 0.03, '#212121', wx, 0.06, wz, { rz: Math.PI / 2, seg: 8 });
  b.base = pb;
  m.base = pm;
}

export function cartCorral(): FurnGeo {
  const f = new FB();
  for (let i = 0; i < 4; i++) cartMesh(f.s, f.m, 0, -0.45 + i * 0.18);
  f.m.box(0.04, 1.0, 0.04, '#78909c', 0.36, 0.5, -0.7);
  f.m.box(0.04, 1.0, 0.04, '#78909c', -0.36, 0.5, -0.7);
  f.s.box(0.7, 0.22, 0.03, '#d32f2f', 0, 1.05, -0.7);
  return f.build();
}

export function plantDecor(): FurnGeo {
  const f = new FB();
  f.s.cyl(0.26, 0.2, 0.45, '#e0ddd5', 0, 0.225, 0, { seg: 14 });
  f.s.cyl(0.24, 0.24, 0.02, '#4e342e', 0, 0.44, 0, { seg: 14 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    f.s.sphere(0.14, i % 2 ? '#2e7d32' : '#43a047', Math.cos(a) * 0.17, 0.75 + (i % 3) * 0.18, Math.sin(a) * 0.17, { sx: 0.5, sy: 1.6, ry: a, rz: 0.4, ws: 6, hs: 5 });
  }
  f.s.sphere(0.2, '#388e3c', 0, 1.25, 0, { sy: 1.3, ws: 8, hs: 6 });
  return f.build();
}

export function promoStand(): FurnGeo {
  const f = new FB();
  f.s.boxB(1.2, 0.3, 0.8, '#c62828', 0, 0, 0);
  f.s.boxB(1.1, 0.3, 0.5, '#d32f2f', 0, 0.3, -0.1);
  f.s.boxB(1.0, 0.3, 0.25, '#e53935', 0, 0.6, -0.2);
  f.m.box(0.04, 0.6, 0.04, STEEL_D, 0, 1.15, -0.32);
  f.e.box(1.0, 0.3, 0.04, '#fff59d', 0, 1.45, -0.32);
  return f.build();
}

export function bench(): FurnGeo {
  const f = new FB();
  for (let i = 0; i < 3; i++) f.s.boxB(1.6, 0.04, 0.12, WOOD, 0, 0.44, -0.15 + i * 0.15);
  for (let i = 0; i < 2; i++) f.s.box(1.6, 0.12, 0.04, WOOD, 0, 0.75 + i * 0.16, -0.24, { rx: -0.15 });
  for (const sx of [-0.7, 0.7]) {
    f.m.boxB(0.05, 0.44, 0.45, '#37474f', sx, 0, 0);
    f.m.box(0.05, 0.5, 0.05, '#37474f', sx, 0.7, -0.24, { rx: -0.15 });
  }
  return f.build();
}

export function atmMachine(): FurnGeo {
  const f = new FB();
  f.s.rbox(0.7, 1.7, 0.6, 0.04, '#37474f', 0, 0.85, 0);
  f.s.box(0.62, 0.3, 0.05, '#1b5e20', 0, 1.55, 0.29);
  f.e.box(0.36, 0.26, 0.01, '#80deea', 0, 1.2, 0.3, { rx: -0.2 });
  f.s.box(0.5, 0.12, 0.2, '#263238', 0, 0.95, 0.35);
  f.e.box(0.2, 0.02, 0.01, '#76ff03', 0, 0.98, 0.45);
  return f.build();
}

export function bakeryOven(): FurnGeo {
  const f = new FB();
  f.s.boxB(1.4, 1.8, 1.0, '#b0bec5', 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    f.s.box(1.2, 0.6, 0.04, '#37474f', 0, 0.55 + i * 0.7, 0.5);
    f.g.box(0.8, 0.35, 0.01, '#ffffff', 0, 0.55 + i * 0.7, 0.525);
    f.e.box(0.78, 0.33, 0.005, '#ff8a3d', 0, 0.55 + i * 0.7, 0.51);
    f.m.box(0.9, 0.04, 0.05, '#cfd8dc', 0, 0.85 + i * 0.7, 0.55);
  }
  f.s.box(0.3, 0.15, 0.03, '#263238', 0.45, 1.65, 0.51);
  f.e.box(0.22, 0.08, 0.01, '#ff5252', 0.45, 1.65, 0.53);
  return f.build();
}

// ---------------------------------------------------------------------------
// Room props (fixed)
// ---------------------------------------------------------------------------

export function desk(): FurnGeo {
  const f = new FB();
  f.s.boxB(1.6, 0.04, 0.75, WOOD, 0, 0.72, 0);
  f.s.boxB(0.04, 0.72, 0.7, '#6d4c41', -0.76, 0, 0);
  f.s.boxB(0.45, 0.72, 0.7, '#8d6e63', 0.55, 0, 0);
  for (let i = 0; i < 3; i++) f.m.box(0.12, 0.02, 0.02, '#cfd8dc', 0.55, 0.15 + i * 0.22, 0.36);
  // monitor + keyboard
  f.s.box(0.62, 0.38, 0.04, '#212121', -0.1, 1.05, -0.2);
  f.e.box(0.58, 0.34, 0.005, '#2a8af6', -0.1, 1.05, -0.177);
  f.m.box(0.05, 0.2, 0.05, '#424242', -0.1, 0.84, -0.22);
  f.s.boxB(0.45, 0.02, 0.15, '#303030', -0.1, 0.76, 0.12);
  f.s.boxB(0.07, 0.02, 0.1, '#303030', 0.25, 0.76, 0.12);
  // papers + mug
  f.s.boxB(0.25, 0.02, 0.32, '#fafafa', 0.45, 0.76, 0.05, { ry: 0.2 });
  f.s.cyl(0.04, 0.04, 0.1, '#ef5350', -0.6, 0.81, 0.1, { seg: 8 });
  return f.build();
}

export function officeChair(): FurnGeo {
  const f = new FB();
  f.s.boxB(0.5, 0.08, 0.5, '#263238', 0, 0.45, 0);
  f.s.box(0.48, 0.55, 0.07, '#263238', 0, 0.82, -0.24, { rx: -0.1 });
  f.m.box(0.05, 0.4, 0.05, '#90a4ae', 0, 0.25, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    f.m.box(0.3, 0.03, 0.04, '#90a4ae', Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15, { ry: -a });
  }
  return f.build();
}

export function filingCabinet(): FurnGeo {
  const f = new FB();
  f.s.boxB(0.5, 1.3, 0.6, '#90a4ae', 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    f.s.box(0.46, 0.28, 0.01, '#a7b6bf', 0, 0.18 + i * 0.31, 0.305);
    f.m.box(0.14, 0.025, 0.03, '#eceff1', 0, 0.26 + i * 0.31, 0.32);
  }
  return f.build();
}

export function safeBox(): FurnGeo {
  const f = new FB();
  f.s.rbox(0.7, 0.9, 0.65, 0.03, '#37474f', 0, 0.45, 0);
  f.m.cyl(0.09, 0.09, 0.04, '#cfd8dc', 0.1, 0.5, 0.33, { rx: Math.PI / 2, seg: 14 });
  f.m.box(0.04, 0.2, 0.04, '#cfd8dc', -0.2, 0.5, 0.34);
  f.e.box(0.12, 0.05, 0.005, '#76ff03', 0.1, 0.72, 0.326);
  return f.build();
}

export function whiteboard(): FurnGeo {
  const f = new FB();
  f.m.box(1.6, 1.0, 0.04, '#cfd8dc', 0, 1.5, 0);
  f.s.box(1.52, 0.92, 0.01, '#fdfdfd', 0, 1.5, 0.025);
  const lines = ['#1e88e5', '#e53935', '#43a047'];
  for (let i = 0; i < 6; i++) f.s.box(0.4 + (i % 3) * 0.3, 0.03, 0.005, lines[i % 3], -0.4 + (i % 2) * 0.1, 1.8 - i * 0.12, 0.032);
  return f.build();
}

export function breakTable(): FurnGeo {
  const f = new FB();
  f.s.cyl(0.6, 0.6, 0.04, '#f5f5f5', 0, 0.74, 0, { seg: 20 });
  f.m.cyl(0.04, 0.04, 0.72, '#90a4ae', 0, 0.36, 0, { seg: 8 });
  f.m.cyl(0.25, 0.28, 0.03, '#90a4ae', 0, 0.015, 0, { seg: 14 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 0.85, z = Math.sin(a) * 0.85;
    const prev = f.s.base;
    f.s.base = trs(x, 0, z, { ry: -a - Math.PI / 2 });
    f.s.boxB(0.42, 0.04, 0.42, '#ff8a65', 0, 0.44, 0);
    f.s.box(0.42, 0.42, 0.04, '#ff8a65', 0, 0.68, -0.2);
    for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) f.s.boxB(0.03, 0.44, 0.03, '#546e7a', lx, 0, lz);
    f.s.base = prev;
  }
  f.s.cyl(0.05, 0.04, 0.1, '#ffffff', 0.2, 0.81, 0.1, { seg: 8 });
  return f.build();
}

export function sofa(): FurnGeo {
  const f = new FB();
  const c = '#5c6bc0', c2 = '#3f51b5';
  f.s.rbox(2.0, 0.42, 0.85, 0.06, c2, 0, 0.21, 0);
  f.s.rbox(1.8, 0.16, 0.7, 0.06, c, 0, 0.5, 0.05);
  f.s.rbox(2.0, 0.55, 0.22, 0.08, c2, 0, 0.7, -0.32);
  f.s.rbox(0.2, 0.3, 0.85, 0.06, c2, -0.9, 0.55, 0);
  f.s.rbox(0.2, 0.3, 0.85, 0.06, c2, 0.9, 0.55, 0);
  f.s.rbox(0.4, 0.3, 0.12, 0.05, '#ffca28', -0.5, 0.75, -0.18, { rx: -0.2 });
  return f.build();
}

export function coffeeMachine(): FurnGeo {
  const f = new FB();
  f.s.boxB(1.2, 0.9, 0.6, '#eceff1', 0, 0, 0);
  f.s.boxB(1.24, 0.04, 0.64, '#455a64', 0, 0.9, 0);
  f.s.boxB(0.4, 0.5, 0.4, '#212121', -0.25, 0.94, -0.05);
  f.s.box(0.3, 0.06, 0.15, '#424242', -0.25, 1.18, 0.15);
  f.e.box(0.16, 0.08, 0.005, '#4fc3f7', -0.25, 1.32, 0.152);
  f.s.cyl(0.04, 0.035, 0.09, '#ffffff', -0.25, 0.99, 0.12, { seg: 8 });
  // microwave
  f.s.boxB(0.5, 0.3, 0.38, '#cfd8dc', 0.3, 0.94, -0.05);
  f.g.box(0.3, 0.2, 0.005, '#ffffff', 0.25, 1.09, 0.143);
  f.s.box(0.08, 0.22, 0.01, '#37474f', 0.48, 1.09, 0.145);
  return f.build();
}

export function vendingMachine(): FurnGeo {
  const f = new FB();
  f.s.rbox(1.0, 1.9, 0.8, 0.04, '#c62828', 0, 0.95, 0);
  f.s.box(0.62, 1.4, 0.02, '#1a1a1a', -0.12, 1.1, 0.4);
  f.e.box(0.58, 1.36, 0.01, '#e3f2fd', -0.12, 1.1, 0.405);
  const cols = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00'];
  for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) f.s.box(0.1, 0.16, 0.06, cols[(r + k) % cols.length], -0.36 + k * 0.16, 0.55 + r * 0.26, 0.38);
  f.g.box(0.6, 1.38, 0.01, '#ffffff', -0.12, 1.1, 0.415);
  f.s.box(0.2, 0.5, 0.02, '#424242', 0.35, 1.2, 0.41);
  f.s.box(0.6, 0.15, 0.04, '#212121', -0.12, 0.25, 0.4);
  return f.build();
}

export function kitchenFridge(): FurnGeo {
  const f = new FB();
  f.s.rbox(0.7, 1.8, 0.7, 0.04, '#eceff1', 0, 0.9, 0);
  f.s.box(0.66, 0.01, 0.01, '#9e9e9e', 0, 1.25, 0.351);
  f.m.box(0.03, 0.4, 0.04, '#9e9e9e', 0.28, 1.5, 0.37);
  f.m.box(0.03, 0.4, 0.04, '#9e9e9e', 0.28, 0.9, 0.37);
  f.s.box(0.12, 0.1, 0.005, '#ffeb3b', -0.1, 1.5, 0.352, { rz: 0.1 });
  return f.build();
}

export function tvWall(): FurnGeo {
  const f = new FB();
  f.s.box(1.3, 0.75, 0.06, '#111111', 0, 1.7, 0);
  f.e.box(1.24, 0.69, 0.005, '#3a7bd5', 0, 1.7, 0.032);
  return f.build();
}

export function lockers(): FurnGeo {
  const f = new FB();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) * 0.4) / 2 + i * 0.4;
    f.s.boxB(0.39, 1.9, 0.5, i % 2 ? '#1e88e5' : '#1976d2', x, 0.05, 0);
    f.s.box(0.2, 0.02, 0.005, '#0d47a1', x, 1.7, 0.252);
    f.s.box(0.2, 0.02, 0.005, '#0d47a1', x, 1.66, 0.252);
    f.m.box(0.03, 0.12, 0.03, '#cfd8dc', x + 0.14, 1.0, 0.26);
    f.s.box(0.08, 0.05, 0.005, '#ffffff', x, 1.82, 0.252);
  }
  f.s.boxB(n * 0.4, 0.05, 0.5, '#37474f', 0, 0, 0);
  return f.build();
}

export function lockerBench(): FurnGeo {
  const f = new FB();
  f.s.boxB(1.8, 0.05, 0.35, WOOD, 0, 0.42, 0);
  for (const sx of [-0.8, 0.8]) f.m.boxB(0.05, 0.42, 0.3, '#78909c', sx, 0, 0);
  return f.build();
}

export function toilet(): FurnGeo {
  const f = new FB();
  f.s.cyl(0.18, 0.15, 0.38, '#fafafa', 0, 0.19, 0.08, { seg: 14 });
  f.s.cyl(0.2, 0.2, 0.05, '#ffffff', 0, 0.42, 0.08, { seg: 14, sz: 1.2 });
  f.s.boxB(0.42, 0.4, 0.18, '#fafafa', 0, 0.4, -0.2);
  f.m.box(0.06, 0.02, 0.02, '#b0bec5', 0.12, 0.82, -0.2);
  return f.build();
}

export function sinkMirror(): FurnGeo {
  const f = new FB();
  f.s.boxB(0.6, 0.12, 0.45, '#fafafa', 0, 0.78, 0);
  f.s.boxB(0.12, 0.78, 0.12, '#eceff1', 0, 0, -0.1);
  f.m.box(0.03, 0.15, 0.03, '#cfd8dc', 0, 0.95, -0.15);
  f.m.box(0.03, 0.03, 0.12, '#cfd8dc', 0, 1.02, -0.1);
  f.g.box(0.6, 0.7, 0.01, '#dfefff', 0, 1.45, -0.22);
  f.m.box(0.64, 0.74, 0.01, '#90a4ae', 0, 1.45, -0.225);
  return f.build();
}

export function stallWalls(): FurnGeo {
  const f = new FB();
  f.s.boxB(0.04, 1.9, 1.4, '#90caf9', -0.6, 0.12, 0);
  f.s.boxB(0.04, 1.9, 1.4, '#90caf9', 0.6, 0.12, 0);
  f.s.boxB(1.16, 1.9, 0.04, '#64b5f6', 0, 0.12, 0.7);
  f.m.box(0.03, 0.12, 0.05, '#cfd8dc', 0.4, 1.0, 0.73);
  return f.build();
}

export function breakerPanel(): FurnGeo {
  const f = new FB();
  f.s.box(0.8, 1.1, 0.18, '#9e9e9e', 0, 1.4, 0);
  f.s.box(0.74, 1.04, 0.01, '#bdbdbd', 0, 1.4, 0.092);
  for (let r = 0; r < 5; r++) for (let k = 0; k < 6; k++) f.s.box(0.06, 0.1, 0.03, '#212121', -0.28 + k * 0.11, 1.08 + r * 0.16, 0.1);
  f.s.box(0.2, 0.2, 0.01, '#ffeb3b', 0.0, 1.98, 0.1);
  f.e.box(0.05, 0.05, 0.01, '#76ff03', 0.3, 1.88, 0.1);
  return f.build();
}

export function hvacUnit(): FurnGeo {
  const f = new FB();
  f.s.boxB(1.4, 1.6, 0.9, '#cfd8dc', 0, 0, 0);
  f.s.cyl(0.42, 0.42, 0.02, '#263238', 0, 0.9, 0.455, { rx: Math.PI / 2, seg: 20 });
  for (let i = 0; i < 4; i++) f.m.box(0.8, 0.03, 0.01, '#90a4ae', 0, 0.9, 0.47, { rz: (i * Math.PI) / 4 });
  f.m.cyl(0.15, 0.15, 1.2, '#b0bec5', 0.5, 2.2, -0.2, { seg: 10 });
  f.s.box(0.3, 0.15, 0.01, '#263238', -0.45, 1.4, 0.455);
  f.e.box(0.22, 0.08, 0.005, '#4fc3f7', -0.45, 1.4, 0.462);
  return f.build();
}

export function waterHeater(): FurnGeo {
  const f = new FB();
  f.s.cyl(0.3, 0.3, 1.5, '#eceff1', 0, 0.75, 0, { seg: 16 });
  f.m.cyl(0.03, 0.03, 0.8, '#b87333', 0.15, 1.9, 0, { seg: 6 });
  f.m.cyl(0.03, 0.03, 0.8, '#1565c0', -0.15, 1.9, 0, { seg: 6 });
  return f.build();
}

export function mopBucket(): FurnGeo {
  const f = new FB();
  f.s.cyl(0.22, 0.2, 0.32, '#fdd835', 0, 0.2, 0, { seg: 12 });
  f.s.cyl(0.2, 0.2, 0.02, '#64b5f6', 0, 0.33, 0, { seg: 12 });
  for (const sx of [-0.15, 0.15]) for (const sz of [-0.15, 0.15]) f.s.cyl(0.03, 0.03, 0.03, '#212121', sx, 0.03, sz, { rz: Math.PI / 2, seg: 6 });
  f.m.cyl(0.015, 0.015, 1.4, '#9e9e9e', 0.1, 0.9, -0.05, { rz: 0.12, seg: 6 });
  f.s.cyl(0.08, 0.05, 0.12, '#eeeeee', 0.04, 0.25, -0.05, { seg: 8 });
  return f.build();
}

export function floorScrubber(): FurnGeo {
  const f = new FB();
  f.s.rbox(0.6, 0.6, 0.85, 0.06, '#1e88e5', 0, 0.45, 0);
  f.s.cyl(0.3, 0.3, 0.12, '#263238', 0, 0.08, 0.25, { seg: 14 });
  f.m.box(0.05, 0.6, 0.05, '#90a4ae', 0.22, 0.95, -0.4, { rx: 0.4 });
  f.m.box(0.05, 0.6, 0.05, '#90a4ae', -0.22, 0.95, -0.4, { rx: 0.4 });
  f.s.box(0.55, 0.05, 0.05, '#212121', 0, 1.2, -0.52);
  f.e.box(0.1, 0.05, 0.01, '#76ff03', 0, 0.75, 0.43);
  return f.build();
}

export function supplyShelf(): FurnGeo {
  const f = new FB();
  for (const sx of [-0.58, 0.58]) for (const sz of [-0.2, 0.2]) f.m.boxB(0.04, 1.8, 0.04, '#9e9e9e', sx, 0, sz);
  const cols = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa'];
  for (let k = 0; k < 4; k++) {
    const y = 0.15 + k * 0.5;
    f.m.box(1.2, 0.03, 0.45, '#bdbdbd', 0, y, 0);
    for (let i = 0; i < 5; i++) f.s.cyl(0.05, 0.05, 0.2, cols[(i + k) % 5], -0.45 + i * 0.22, y + 0.115, 0, { seg: 8 });
  }
  return f.build();
}

export function dumpster(): FurnGeo {
  const f = new FB();
  f.s.boxB(2.0, 1.1, 1.2, '#2e7d32', 0, 0.15, 0);
  f.s.box(2.06, 0.08, 1.26, '#1b5e20', 0, 1.29, 0);
  f.s.box(1.0, 0.06, 1.2, '#263238', -0.5, 1.36, 0, { rz: 0.06 });
  f.s.box(1.0, 0.06, 1.2, '#263238', 0.5, 1.36, 0, { rz: -0.06 });
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.5, 0.5]) f.s.cyl(0.08, 0.08, 0.06, '#212121', sx, 0.08, sz, { rx: Math.PI / 2, seg: 8 });
  return f.build();
}

export function baler(): FurnGeo {
  const f = new FB();
  f.s.boxB(1.4, 2.2, 1.1, '#f9a825', 0, 0, 0);
  f.s.box(1.0, 0.8, 0.04, '#424242', 0, 0.9, 0.55);
  f.m.box(1.0, 0.05, 0.05, '#cfd8dc', 0, 1.35, 0.6);
  f.s.box(0.3, 0.3, 0.05, '#212121', 0.4, 1.8, 0.56);
  f.e.box(0.08, 0.08, 0.01, '#ff1744', 0.35, 1.85, 0.59);
  f.e.box(0.08, 0.08, 0.01, '#76ff03', 0.47, 1.85, 0.59);
  return f.build();
}

export function palletJack(): FurnGeo {
  const f = new FB();
  f.m.box(0.55, 0.06, 1.15, '#d32f2f', 0, 0.06, 0.15);
  f.s.box(0.5, 0.25, 0.25, '#c62828', 0, 0.25, -0.5);
  f.m.box(0.04, 1.0, 0.04, '#b71c1c', 0, 0.75, -0.62, { rx: -0.25 });
  f.s.box(0.35, 0.05, 0.05, '#212121', 0, 1.2, -0.75);
  f.s.cyl(0.09, 0.09, 0.1, '#212121', 0, 0.09, -0.5, { rz: Math.PI / 2, seg: 10 });
  return f.build();
}

export function pallet(): FurnGeo {
  const f = new FB();
  for (let i = 0; i < 5; i++) f.s.boxB(1.2, 0.025, 0.14, '#c9a06a', 0, 0.12, -0.45 + i * 0.225);
  for (const sx of [-0.55, 0, 0.55]) f.s.boxB(0.1, 0.1, 1.0, '#a77d48', sx, 0.02, 0);
  for (let i = 0; i < 3; i++) f.s.boxB(1.2, 0.02, 0.1, '#b48b56', 0, 0, -0.45 + i * 0.45);
  return f.build();
}

export function counterCabinet(w = 2.4): FurnGeo {
  const f = new FB();
  f.s.boxB(w, 0.86, 0.6, '#eceff1', 0, 0, 0);
  f.s.boxB(w + 0.02, 0.04, 0.62, '#546e7a', 0, 0.86, 0);
  f.m.box(0.45, 0.02, 0.35, '#b0bec5', w / 2 - 0.4, 0.9, 0);
  f.m.box(0.03, 0.25, 0.03, '#b0bec5', w / 2 - 0.4, 1.0, -0.2);
  for (let i = 0; i < Math.floor(w / 0.6); i++) f.m.box(0.12, 0.02, 0.02, '#90a4ae', -w / 2 + 0.3 + i * 0.6, 0.7, 0.305);
  return f.build();
}

export function wallClock(): FurnGeo {
  const f = new FB();
  f.s.cyl(0.18, 0.18, 0.04, '#fafafa', 0, 2.2, 0, { rx: Math.PI / 2, seg: 16 });
  f.s.torus(0.18, 0.02, '#263238', 0, 2.2, 0.01, { rs: 4, ts: 18 });
  f.s.box(0.015, 0.12, 0.01, '#212121', 0, 2.25, 0.03);
  f.s.box(0.09, 0.015, 0.01, '#212121', 0.04, 2.2, 0.03);
  return f.build();
}

export function computerKiosk(): FurnGeo {
  // small counter-top PC for the starter store checkout area
  const f = new FB();
  f.s.boxB(0.8, 0.9, 0.5, '#cfd8dc', 0, 0, 0);
  f.s.boxB(0.84, 0.04, 0.54, '#455a64', 0, 0.9, 0);
  f.s.box(0.5, 0.32, 0.04, '#212121', 0, 1.18, -0.1, { rx: -0.1 });
  f.e.box(0.46, 0.28, 0.005, '#2a8af6', 0, 1.18, -0.077, { rx: -0.1 });
  f.s.boxB(0.38, 0.02, 0.13, '#303030', 0, 0.94, 0.12);
  return f.build();
}

export function bannerStand(): FurnGeo {
  const f = new FB();
  f.m.rbox(0.92, 0.08, 0.32, 0.03, '#9aa5ae', 0, 0.04, 0);
  // pole behind the banner (+z = back), the printed face looks toward -z (front)
  f.m.cyl(0.014, 0.014, 2.2, '#b0bac3', 0, 1.1, 0.05, { seg: 6 });
  f.m.box(0.88, 0.035, 0.035, '#9aa5ae', 0, 2.19, 0.0);
  f.s.box(0.84, 0.02, 0.03, '#e0e0e0', 0, 0.12, 0.0);
  f.s.box(0.84, 2.0, 0.006, '#d5d9dc', 0, 1.17, 0.006);
  return f.build();
}
