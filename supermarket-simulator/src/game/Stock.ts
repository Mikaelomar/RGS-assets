// Renders products sitting on shelves / in crates using one InstancedMesh per product type.
// Slots are "views": a world matrix + a layout of item transforms; only `count` items are drawn.
import * as THREE from 'three';
import { PRODUCT_MAP, type ProductDef } from '../data/products';
import type { SlotDef } from '../data/furniture';
import { productGeometry, productGeometryLow, productMaterial } from '../gfx/ProductMeshes';
import { Rng } from '../core/util';

export interface StockView {
  id: number;
  pid: string | null;
  count: number;
  matrix: THREE.Matrix4;
  layout: Layout | null;
  center: THREE.Vector3;
  lod: 0 | 1 | 2;
  /** always render at full detail (held crates, checkout belt) */
  noLod?: boolean;
  hidden?: boolean;
}

export interface Layout {
  mats: THREE.Matrix4[];
  frontCount: number;
  capacity: number;
  /** items drawn when close (hidden back rows are skipped) */
  nearCount: number;
}

const STACKABLE = new Set(['box', 'can', 'butter', 'bar', 'eggs', 'tray', 'cheese', 'tp', 'folded', 'jar', 'tub', 'cup', 'blister', 'buns']);
const layoutCache = new Map<string, Layout>();

export function computeLayout(sd: { w: number; d: number; h: number; layout: SlotDef['layout'] }, p: ProductDef, maxCap = 40, seedKey = ''): Layout {
  const key = `${sd.w.toFixed(3)}|${sd.d.toFixed(3)}|${sd.h.toFixed(3)}|${sd.layout}|${p.id}|${maxCap}|${seedKey}`;
  const cached = layoutCache.get(key);
  if (cached) return cached;
  let [w, h, d] = p.dims;
  const mats: THREE.Matrix4[] = [];
  const gap = 0.006;
  let frontCount = 0;
  const rng = new Rng(key.length * 7919 + p.id.charCodeAt(0) * 31 + Math.round(sd.w * 1000));
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  if (sd.layout === 'pile') {
    // heap of loose produce, two layers
    const cols = Math.max(1, Math.floor(sd.w / (w * 1.02)));
    const rows = Math.max(1, Math.floor(sd.d / (d * 1.02)));
    for (let layer = 0; layer < 2; layer++) {
      const ox = layer ? w * 0.5 : 0, oz = layer ? d * 0.5 : 0;
      const lc = layer ? cols - 1 : cols, lr = layer ? rows - 1 : rows;
      for (let r = 0; r < Math.max(1, lr); r++) {
        for (let c = 0; c < Math.max(1, lc); c++) {
          const x = -sd.w / 2 + w / 2 + c * (sd.w - w) / Math.max(1, cols - 1) + ox * (lc > 0 ? 1 : 0) + rng.range(-0.008, 0.008);
          const z = sd.d / 2 - d / 2 - r * (sd.d - d) / Math.max(1, rows - 1) - oz * (lr > 0 ? 1 : 0) + rng.range(-0.008, 0.008);
          const y = layer * h * 0.62;
          e.set(rng.range(-0.25, 0.25), rng.range(0, Math.PI * 2), rng.range(-0.25, 0.25));
          q.setFromEuler(e);
          mats.push(new THREE.Matrix4().compose(new THREE.Vector3(cols === 1 ? 0 : x, y, rows === 1 ? 0 : z), q, new THREE.Vector3(1, 1, 1)));
          if (mats.length >= maxCap) break;
        }
        if (mats.length >= maxCap) break;
      }
      if (layer === 0) frontCount = mats.length;
      if (mats.length >= maxCap) break;
    }
    // sort: lower layer first, then front
  } else {
    let rotY = 0;
    let lieDown = false;
    if (sd.layout === 'flat' && h > Math.min(w, d) * 1.3) {
      lieDown = true;
      [h, d] = [d, h];
    }
    if (d > sd.d && w <= sd.d) {
      rotY = Math.PI / 2;
      [w, d] = [d, w];
    }
    const cols = Math.max(1, Math.floor((sd.w + gap) / (w + gap)));
    const rows = Math.max(1, Math.floor((sd.d + gap) / (d + gap)));
    const stack = STACKABLE.has(p.shape) || sd.layout === 'flat';
    const layers = stack ? Math.max(1, Math.min(sd.layout === 'flat' ? 4 : 3, Math.floor(sd.h / (h + 0.002)))) : 1;
    const totalW = cols * w + (cols - 1) * gap;
    for (let r = 0; r < rows; r++) {
      for (let l = 0; l < layers; l++) {
        for (let c = 0; c < cols; c++) {
          const x = -totalW / 2 + w / 2 + c * (w + gap);
          const z = sd.d / 2 - d / 2 - r * (d + gap);
          const y = l * (h + 0.002);
          e.set(lieDown ? -Math.PI / 2 : 0, rotY, 0, 'YXZ');
          q.setFromEuler(e);
          const pos = new THREE.Vector3(x, lieDown ? y + h / 2 - 0.0 : y, lieDown ? z - d / 2 + 0.0 : z);
          if (lieDown) pos.z = z + d / 2;
          mats.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
          if (mats.length >= maxCap) break;
        }
        if (mats.length >= maxCap) break;
      }
      if (r === 0) frontCount = mats.length;
      if (mats.length >= maxCap) break;
    }
  }
  const fc = Math.max(1, frontCount);
  const nearCount = sd.layout === 'upright' ? Math.min(mats.length, fc * 2) : mats.length;
  const lay = { mats, frontCount: fc, capacity: mats.length, nearCount };
  layoutCache.set(key, lay);
  return lay;
}

interface ProductRender { mesh: THREE.InstancedMesh | null; capacity: number; low: THREE.InstancedMesh | null; lowCap: number; views: Set<StockView>; }

const _m = new THREE.Matrix4();

export class StockRenderer {
  readonly group = new THREE.Group();
  private renders = new Map<string, ProductRender>();
  private dirty = new Set<string>();
  private views = new Map<number, StockView>();
  private nextId = 1;
  private lastCam = new THREE.Vector3(1e9, 0, 0);
  private lodTimer = 0;
  nearDist = 13;
  farDist = 60;
  receiveShadow = false;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  createView(matrix: THREE.Matrix4, noLod = false): StockView {
    const v: StockView = { id: this.nextId++, pid: null, count: 0, matrix: matrix.clone(), layout: null, center: new THREE.Vector3().setFromMatrixPosition(matrix), lod: 0, noLod };
    this.views.set(v.id, v);
    return v;
  }

  removeView(v: StockView) {
    if (v.pid) this.detach(v);
    this.views.delete(v.id);
  }

  private detach(v: StockView) {
    if (!v.pid) return;
    const r = this.renders.get(v.pid);
    if (r) r.views.delete(v);
    this.dirty.add(v.pid);
  }

  /** Assign product + count + layout for a view. */
  set(v: StockView, pid: string | null, count: number, layout: Layout | null) {
    if (v.pid !== pid) {
      this.detach(v);
      v.pid = pid;
      if (pid) {
        let r = this.renders.get(pid);
        if (!r) this.renders.set(pid, (r = { mesh: null, capacity: 0, low: null, lowCap: 0, views: new Set() }));
        r.views.add(v);
      }
    }
    if (v.count !== count || v.layout !== layout) {
      v.count = count;
      v.layout = layout;
    }
    if (pid) this.dirty.add(pid);
  }

  setMatrix(v: StockView, m: THREE.Matrix4) {
    v.matrix.copy(m);
    v.center.setFromMatrixPosition(m);
    if (v.pid) this.dirty.add(v.pid);
  }

  setHidden(v: StockView, hidden: boolean) {
    if (v.hidden === hidden) return;
    v.hidden = hidden;
    if (v.pid) this.dirty.add(v.pid);
  }

  update(dt: number, cam: THREE.Vector3) {
    this.lodTimer -= dt;
    if (this.lodTimer <= 0 && cam.distanceToSquared(this.lastCam) > 1.2) {
      this.lodTimer = 0.35;
      this.lastCam.copy(cam);
      const n2 = this.nearDist * this.nearDist, f2 = this.farDist * this.farDist;
      for (const v of this.views.values()) {
        if (!v.pid || v.noLod) continue;
        const d2 = v.center.distanceToSquared(cam);
        const lod: 0 | 1 | 2 = d2 < n2 ? 0 : d2 < f2 ? 1 : 2;
        if (lod !== v.lod) {
          v.lod = lod;
          this.dirty.add(v.pid);
        }
      }
    }
    for (const pid of this.dirty) this.rebuild(pid);
    this.dirty.clear();
  }

  private rebuild(pid: string) {
    const r = this.renders.get(pid);
    if (!r) return;
    let needHi = 0, needLo = 0;
    for (const v of r.views) {
      if (v.hidden || !v.layout || v.count <= 0) continue;
      if (v.lod === 2 && !v.noLod) continue;
      const n = Math.min(v.count, v.layout.capacity);
      if (v.lod === 1 && !v.noLod) needLo += Math.min(n, v.layout.frontCount);
      else needHi += Math.min(n, v.layout.nearCount);
    }
    const ensure = (lo: boolean, need: number) => {
      const cur = lo ? r.low : r.mesh;
      const cap = lo ? r.lowCap : r.capacity;
      if (cur && need <= cap) return cur;
      const ncap = Math.max(8, 1 << Math.ceil(Math.log2(Math.max(need, 1))));
      if (cur) {
        this.group.remove(cur);
        cur.dispose();
      }
      const m = new THREE.InstancedMesh(lo ? productGeometryLow(pid) : productGeometry(pid), productMaterial(), ncap);
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = !lo && this.receiveShadow;
      this.group.add(m);
      if (lo) { r.low = m; r.lowCap = ncap; } else { r.mesh = m; r.capacity = ncap; }
      return m;
    };
    const hi = needHi > 0 || r.mesh ? ensure(false, needHi) : null;
    const lo = needLo > 0 || r.low ? ensure(true, needLo) : null;
    let i = 0, j = 0;
    for (const v of r.views) {
      if (v.hidden || !v.layout || v.count <= 0) continue;
      if (v.lod === 2 && !v.noLod) continue;
      const n = Math.min(v.count, v.layout.capacity);
      const isLo = v.lod === 1 && !v.noLod;
      const draw = isLo ? Math.min(n, v.layout.frontCount) : Math.min(n, v.layout.nearCount);
      const target = isLo ? lo! : hi!;
      for (let k = 0; k < draw; k++) {
        _m.multiplyMatrices(v.matrix, v.layout.mats[k]);
        target.setMatrixAt(isLo ? j++ : i++, _m);
      }
    }
    if (hi) {
      hi.count = i;
      hi.instanceMatrix.needsUpdate = true;
    }
    if (lo) {
      lo.count = j;
      lo.instanceMatrix.needsUpdate = true;
    }
  }

  forceAll() {
    for (const pid of this.renders.keys()) this.dirty.add(pid);
  }
}

export function productDef(pid: string) { return PRODUCT_MAP.get(pid)!; }
