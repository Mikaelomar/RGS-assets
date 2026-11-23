// Physical boxes: product cartons, produce crates, cold boxes, flat-pack furniture, trash bags and litter.
// Rendered with per-size InstancedMeshes; labels come from the box atlas via a per-instance tile rect.
import * as THREE from 'three';
import { PRODUCT_MAP, boxSizeFor, boxStyleFor, type ProductDef } from '../data/products';
import { FURN_MAP } from '../data/furniture';
import { boxAtlas, artFor, ICONS } from '../gfx/ProductArt';
import { GeoBuilder } from '../gfx/GeoBuilder';
import type { BoxState } from './state';
import type { Collision } from './Collision';
import { computeLayout, type StockRenderer, type StockView } from './Stock';
import { FLOOR_Y } from './layout';
import { makeCanvas } from '../gfx/Textures';
import { productGeometry, productMaterial } from '../gfx/ProductMeshes';

export type BoxStyle = 'cardboard' | 'crate' | 'cold' | 'trash' | 'litter' | 'furniture' | 'pallet';

export interface BoxRT {
  s: BoxState;
  def: ProductDef | null;
  size: [number, number, number];
  style: BoxStyle;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: number;
  resting: boolean;
  held: boolean;
  bucket: string;
  index: number;
  view: StockView | null;
  box: THREE.Box3;
  tile: THREE.Vector4;
  pallet?: number;
}

interface Bucket { key: string; mesh: THREE.InstancedMesh; owners: BoxRT[]; capacity: number; geo: THREE.BufferGeometry; mat: THREE.Material; }

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0);

function tileMaterial(base: THREE.MeshStandardMaterial) {
  base.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aTileRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = aTileRect.xy + vMapUv * aTileRect.zw;\n#endif');
  };
  base.customProgramCacheKey = () => 'tile-rect';
  return base;
}

/** Box geometry: labeled sides use UV 0..1; top/bottom use the tile corner (plain cardboard). */
function cartonGeometry(w: number, h: number, d: number, style: BoxStyle): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const full = { u0: 0, v0: 0, u1: 1, v1: 1 };
  const corner = { u0: 0.02, v0: 0.96, u1: 0.05, v1: 0.99 };
  if (style === 'crate') {
    const wall = 0.025;
    b.box(w, 0.025, d, '#ffffff', 0, 0.0125, 0, { faces: { py: corner, ny: corner } });
    b.box(w, h, wall, '#ffffff', 0, h / 2, d / 2 - wall / 2, { faces: { pz: full, nz: corner, py: corner, px: corner, nx: corner } });
    b.box(w, h, wall, '#ffffff', 0, h / 2, -d / 2 + wall / 2, { faces: { nz: full, pz: corner, py: corner, px: corner, nx: corner } });
    b.box(wall, h, d - wall * 2, '#ffffff', w / 2 - wall / 2, h / 2, 0, { faces: { px: corner, nx: corner, py: corner } });
    b.box(wall, h, d - wall * 2, '#ffffff', -w / 2 + wall / 2, h / 2, 0, { faces: { px: corner, nx: corner, py: corner } });
    // hand holes
    b.box(0.12, 0.035, 0.03, '#3b2a18', w / 2 - 0.0, h * 0.75, 0, { ry: Math.PI / 2 });
    b.box(0.12, 0.035, 0.03, '#3b2a18', -w / 2 + 0.0, h * 0.75, 0, { ry: Math.PI / 2 });
  } else if (style === 'trash') {
    b.sphere(0.32, '#1f2a24', 0, 0.3, 0, { sy: 0.95, ws: 10, hs: 8 });
    b.cone(0.09, 0.18, '#1f2a24', 0, 0.66, 0, { seg: 7 });
    b.box(0.2, 0.03, 0.03, '#1f2a24', 0, 0.74, 0, { rz: 0.4 });
  } else if (style === 'pallet') {
    for (let i = 0; i < 5; i++) b.boxB(w, 0.025, 0.14, '#c9a06a', 0, h - 0.025, -d / 2 + 0.07 + i * ((d - 0.14) / 4));
    for (const sx of [-w / 2 + 0.05, 0, w / 2 - 0.05]) b.boxB(0.1, h - 0.045, d, '#a77d48', sx, 0.02, 0);
    for (let i = 0; i < 3; i++) b.boxB(w, 0.02, 0.1, '#b48b56', 0, 0, -d / 2 + 0.05 + i * ((d - 0.1) / 2));
  } else if (style === 'litter') {
    b.sphere(0.05, '#f2f2ee', 0, 0.04, 0, { sx: 1.3, sy: 0.7, ws: 6, hs: 4 });
    b.sphere(0.035, '#e8e3d8', 0.04, 0.03, 0.02, { ws: 5, hs: 4 });
  } else {
    b.box(w, h, d, '#ffffff', 0, h / 2, 0, { faces: { pz: full, nz: full, px: full, nx: full, py: corner, ny: corner } });
    if (style === 'cardboard' || style === 'furniture') {
      b.box(w * 0.08, 0.004, d + 0.002, '#e3d1a8', 0, h + 0.001, 0);
      b.box(0.004, h + 0.002, w * 0.08, '#e3d1a8', w / 2 + 0.001, h / 2, 0, { ry: Math.PI / 2, sx: 1, sz: 1 });
    }
  }
  return b.build()!;
}

let furnTiles: Map<string, number> | null = null;
function furnitureTile(fid: string): number {
  if (!furnTiles) furnTiles = new Map();
  let t = furnTiles.get(fid);
  if (t === undefined) {
    t = boxAtlas.alloc();
    const def = FURN_MAP.get(fid)!;
    boxAtlas.draw(t, 1.4, (c, w, h) => {
      c.fillStyle = '#c49a64';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff';
      c.fillRect(w * 0.1, h * 0.15, w * 0.8, h * 0.7);
      c.font = `${h * 0.36}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(def.icon, w * 0.27, h * 0.5);
      c.fillStyle = '#212121';
      c.font = `${h * 0.14}px 'Lilita One', sans-serif`;
      const words = def.name.split(' ');
      c.fillText(words.slice(0, 2).join(' '), w * 0.64, h * 0.42);
      if (words.length > 2) c.fillText(words.slice(2).join(' '), w * 0.64, h * 0.58);
      c.fillStyle = '#d32f2f';
      c.font = `${h * 0.1}px 'Lilita One', sans-serif`;
      c.fillText('ASSEMBLE ME', w * 0.64, h * 0.75);
    });
    furnTiles.set(fid, t);
    boxAtlas.texture.needsUpdate = true;
  }
  return t;
}
void ICONS;

export function boxDims(s: BoxState): { size: [number, number, number]; style: BoxStyle } {
  const kind = s.kind ?? 'box';
  if (kind === 'trash') return { size: [0.55, 0.75, 0.55], style: 'trash' };
  if (kind === 'litter') return { size: [0.14, 0.08, 0.14], style: 'litter' };
  if (kind === 'furniture') return { size: [1.1, 0.32, 0.8], style: 'furniture' };
  if (kind === 'pallet') return { size: [1.2, 0.15, 1.0], style: 'pallet' };
  const p = PRODUCT_MAP.get(s.pid)!;
  const style = boxStyleFor(p) as BoxStyle;
  return { size: boxSizeFor(p), style };
}

export class BoxSystem {
  readonly group = new THREE.Group();
  readonly items = new Map<number, BoxRT>();
  private buckets = new Map<string, Bucket>();
  private matCard: THREE.MeshStandardMaterial;
  private matCrate: THREE.MeshStandardMaterial;
  private matCold: THREE.MeshStandardMaterial;
  private matPlain: THREE.MeshStandardMaterial;
  version = 0;

  constructor(scene: THREE.Scene, private col: Collision, private stock: StockRenderer) {
    scene.add(this.group);
    this.matCard = tileMaterial(new THREE.MeshStandardMaterial({ map: boxAtlas.texture, roughness: 0.85, vertexColors: true }));
    this.matCrate = tileMaterial(new THREE.MeshStandardMaterial({ map: boxAtlas.texture, roughness: 0.75, vertexColors: true }));
    this.matCold = tileMaterial(new THREE.MeshStandardMaterial({ map: boxAtlas.texture, roughness: 0.6, vertexColors: true }));
    this.matPlain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  }

  tileFor(s: BoxState): THREE.Vector4 {
    let tile: number;
    if (s.kind === 'furniture' && s.furn) tile = furnitureTile(s.furn);
    else if (s.kind === 'trash' || s.kind === 'litter' || s.kind === 'pallet') return new THREE.Vector4(0, 0, 0.01, 0.01);
    else tile = artFor(s.pid).boxTile;
    const r = boxAtlas.rect(tile, 2);
    return new THREE.Vector4(r.u0, r.v0, r.u1 - r.u0, r.v1 - r.v0);
  }

  private bucketFor(style: BoxStyle, size: [number, number, number]): Bucket {
    const key = `${style}|${size.map((v) => v.toFixed(2)).join('x')}`;
    let b = this.buckets.get(key);
    if (!b) {
      const geo = cartonGeometry(size[0], size[1], size[2], style);
      const mat = style === 'crate' ? this.matCrate : style === 'cold' ? this.matCold : style === 'trash' || style === 'litter' || style === 'pallet' ? this.matPlain : this.matCard;
      b = { key, mesh: null as any, owners: [], capacity: 0, geo, mat };
      this.grow(b, 16);
      this.buckets.set(key, b);
    }
    return b;
  }

  private grow(b: Bucket, cap: number) {
    const old = b.mesh;
    const mesh = new THREE.InstancedMesh(b.geo, b.mat, cap);
    mesh.geometry = b.geo;
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    mesh.geometry.setAttribute('aTileRect', attr);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    if (old) {
      for (let i = 0; i < old.count; i++) {
        old.getMatrixAt(i, _m);
        mesh.setMatrixAt(i, _m);
      }
      mesh.count = old.count;
      this.group.remove(old);
    }
    b.mesh = mesh;
    b.capacity = cap;
    // re-write tile rects for all owners
    b.owners.forEach((o, i) => attr.setXYZW(i, o.tile.x, o.tile.y, o.tile.z, o.tile.w));
    attr.needsUpdate = true;
    this.group.add(mesh);
  }

  add(s: BoxState): BoxRT {
    const { size, style } = boxDims(s);
    const def = s.kind === 'box' || !s.kind ? PRODUCT_MAP.get(s.pid) ?? null : null;
    const rt: BoxRT = {
      s, def, size, style, pos: new THREE.Vector3(s.x, s.y, s.z), vel: new THREE.Vector3(), spin: 0, resting: true, held: false,
      bucket: '', index: -1, view: null, box: new THREE.Box3(), tile: this.tileFor(s),
    };
    const b = this.bucketFor(style, size);
    if (b.owners.length >= b.capacity) this.grow(b, b.capacity * 2);
    rt.bucket = b.key;
    rt.index = b.owners.length;
    b.owners.push(rt);
    b.mesh.count = b.owners.length;
    const attr = b.mesh.geometry.getAttribute('aTileRect') as THREE.InstancedBufferAttribute;
    attr.setXYZW(rt.index, rt.tile.x, rt.tile.y, rt.tile.z, rt.tile.w);
    attr.needsUpdate = true;
    if (style === 'crate' && def) {
      rt.view = this.stock.createView(new THREE.Matrix4());
    }
    this.items.set(s.uid, rt);
    this.sync(rt);
    if (!s.rack && s.y > FLOOR_Y + 0.05) rt.resting = false;
    this.version++;
    return rt;
  }

  remove(uid: number) {
    const rt = this.items.get(uid);
    if (!rt) return;
    const b = this.buckets.get(rt.bucket)!;
    const last = b.owners.length - 1;
    const idx = rt.index;
    if (idx !== last) {
      const moved = b.owners[last];
      b.owners[idx] = moved;
      moved.index = idx;
      b.mesh.getMatrixAt(last, _m);
      b.mesh.setMatrixAt(idx, _m);
      const attr = b.mesh.geometry.getAttribute('aTileRect') as THREE.InstancedBufferAttribute;
      attr.setXYZW(idx, moved.tile.x, moved.tile.y, moved.tile.z, moved.tile.w);
      attr.needsUpdate = true;
    }
    b.owners.pop();
    b.mesh.count = b.owners.length;
    b.mesh.instanceMatrix.needsUpdate = true;
    if (rt.view) this.stock.removeView(rt.view);
    this.items.delete(uid);
    this.version++;
  }

  /** Push transform to the instanced mesh + crate contents. */
  sync(rt: BoxRT) {
    const b = this.buckets.get(rt.bucket)!;
    rt.s.x = rt.pos.x; rt.s.y = rt.pos.y; rt.s.z = rt.pos.z;
    _e.set(0, rt.s.ry, 0);
    _q.setFromEuler(_e);
    _m.compose(rt.pos, _q, _s);
    b.mesh.setMatrixAt(rt.index, rt.held ? ZERO_SCALE : _m);
    b.mesh.instanceMatrix.needsUpdate = true;
    const [w, h, d] = rt.size;
    const r = Math.max(w, d) / 2;
    rt.box.min.set(rt.pos.x - r, rt.pos.y, rt.pos.z - r);
    rt.box.max.set(rt.pos.x + r, rt.pos.y + h, rt.pos.z + r);
    if (rt.view && rt.def) {
      const inner = { w: w - 0.06, d: d - 0.06, h: h, layout: 'pile' as const };
      const lay = computeLayout(inner, rt.def, 24, 'crate');
      const m = _m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.025, 0));
      this.stock.setMatrix(rt.view, m);
      const shown = Math.round((rt.s.count / rt.def.perBox) * lay.capacity);
      this.stock.set(rt.view, rt.def.id, rt.s.count > 0 ? Math.max(1, shown) : 0, lay);
      this.stock.setHidden(rt.view, rt.held);
    }
  }

  setHeld(rt: BoxRT, held: boolean) {
    rt.held = held;
    rt.s.rack = null;
    if (held) rt.resting = true;
    this.sync(rt);
    this.version++;
  }

  /** Drop the box with an initial velocity. */
  release(rt: BoxRT, pos: THREE.Vector3, vel: THREE.Vector3, ry: number) {
    rt.held = false;
    rt.pos.copy(pos);
    rt.vel.copy(vel);
    rt.s.ry = ry;
    rt.resting = false;
    rt.spin = (Math.random() - 0.5) * 2;
    this.sync(rt);
    this.version++;
  }

  placeAt(rt: BoxRT, x: number, y: number, z: number, ry: number) {
    rt.held = false;
    rt.pos.set(x, y, z);
    rt.vel.set(0, 0, 0);
    rt.s.ry = ry;
    rt.resting = true;
    this.sync(rt);
    this.version++;
  }

  private supportHeight(rt: BoxRT): number {
    const [w, , d] = rt.size;
    const r = Math.min(w, d) * 0.45;
    let best = FLOOR_Y;
    const bottom = rt.pos.y + 0.06;
    for (const c of this.col.query(rt.pos.x - r, rt.pos.z - r, rt.pos.x + r, rt.pos.z + r)) {
      if (c.tag === 'door' || c.tag === 'glass') continue;
      if (c.y1 <= bottom && c.y1 > best) best = c.y1;
    }
    for (const o of this.items.values()) {
      if (o === rt || o.held) continue;
      const top = o.pos.y + o.size[1];
      if (top > bottom || top <= best) continue;
      const ro = Math.min(o.size[0], o.size[2]) * 0.45;
      if (Math.abs(o.pos.x - rt.pos.x) < r + ro && Math.abs(o.pos.z - rt.pos.z) < r + ro) best = top;
    }
    return best;
  }

  update(dt: number) {
    for (const rt of this.items.values()) {
      if (rt.held || rt.resting || rt.s.rack) continue;
      rt.vel.y -= 9.8 * dt;
      const nx = rt.pos.x + rt.vel.x * dt;
      const nz = rt.pos.z + rt.vel.z * dt;
      const r = Math.min(rt.size[0], rt.size[2]) * 0.42;
      const [cx, cz] = this.col.resolveCircle(nx, nz, r, rt.pos.y + 0.05, rt.pos.y + rt.size[1]);
      if (Math.abs(cx - nx) > 1e-4) rt.vel.x *= -0.2;
      if (Math.abs(cz - nz) > 1e-4) rt.vel.z *= -0.2;
      rt.pos.x = cx;
      rt.pos.z = cz;
      // find support from the current height (before moving) so fast falls can't tunnel through
      const sup = this.supportHeight(rt);
      rt.pos.y += rt.vel.y * dt;
      rt.s.ry += rt.spin * dt;
      if (rt.pos.y <= sup) {
        rt.pos.y = sup;
        if (rt.vel.y < -2.5) rt.vel.y *= -0.18;
        else rt.vel.y = 0;
        rt.vel.x *= 0.55;
        rt.vel.z *= 0.55;
        rt.spin *= 0.5;
        if (Math.abs(rt.vel.y) < 0.3 && Math.hypot(rt.vel.x, rt.vel.z) < 0.15) {
          rt.resting = true;
          rt.vel.set(0, 0, 0);
          this.separate(rt);
          this.version++;
        }
      }
      this.sync(rt);
    }
  }

  /** Nudge a freshly landed box so it doesn't intersect boxes at the same height. */
  private separate(rt: BoxRT) {
    const r = Math.min(rt.size[0], rt.size[2]) * 0.48;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const o of this.items.values()) {
        if (o === rt || o.held || o.s.rack) continue;
        if (Math.abs(o.pos.y - rt.pos.y) > 0.05) continue;
        const ro = Math.min(o.size[0], o.size[2]) * 0.48;
        const dx = rt.pos.x - o.pos.x, dz = rt.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        const min = r + ro;
        if (d >= min) continue;
        const nx = d > 1e-3 ? dx / d : Math.random() - 0.5, nz = d > 1e-3 ? dz / d : Math.random() - 0.5;
        const nl = Math.hypot(nx, nz) || 1;
        const [x, z] = this.col.resolveCircle(rt.pos.x + (nx / nl) * (min - d + 0.01), rt.pos.z + (nz / nl) * (min - d + 0.01), r, rt.pos.y + 0.05, rt.pos.y + rt.size[1]);
        rt.pos.x = x;
        rt.pos.z = z;
        moved = true;
      }
      if (!moved) break;
    }
    this.sync(rt);
  }

  /** Make boxes that were resting on `rt` fall (after it was picked up). */
  wake(around: THREE.Vector3, radius = 1.0) {
    for (const o of this.items.values()) {
      if (o.held || o.s.rack) continue;
      if (Math.abs(o.pos.x - around.x) < radius && Math.abs(o.pos.z - around.z) < radius && o.pos.y > FLOOR_Y + 0.02) o.resting = false;
    }
  }

  /** Boxes stacked on top of `base` (directly or indirectly). */
  ridersOf(base: BoxRT): BoxRT[] {
    const out: BoxRT[] = [];
    const queue = [base];
    while (queue.length) {
      const b = queue.shift()!;
      const top = b.pos.y + b.size[1];
      for (const o of this.items.values()) {
        if (o === base || o.held || o.s.rack || out.includes(o)) continue;
        if (Math.abs(o.pos.y - top) > 0.06) continue;
        if (Math.abs(o.pos.x - b.pos.x) < b.size[0] / 2 + 0.05 && Math.abs(o.pos.z - b.pos.z) < Math.max(b.size[0], b.size[2]) / 2 + 0.05) {
          out.push(o);
          queue.push(o);
        }
      }
    }
    return out;
  }

  /** A standalone mesh (for the hand-held overlay). */
  makeHeldMesh(rt: BoxRT): THREE.Object3D {
    const g = new THREE.Group();
    const b = this.buckets.get(rt.bucket)!;
    const geo = b.geo.clone();
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) arr.set([rt.tile.x, rt.tile.y, rt.tile.z, rt.tile.w], i * 4);
    geo.setAttribute('aTileRect', new THREE.BufferAttribute(arr, 4));
    const mesh = new THREE.Mesh(geo, b.mat);
    g.add(mesh);
    if (rt.style === 'crate' && rt.def && rt.s.count > 0) {
      const [w, h, d] = rt.size;
      const lay = computeLayout({ w: w - 0.06, d: d - 0.06, h, layout: 'pile' }, rt.def, 24, 'crate');
      const shown = Math.max(1, Math.round((rt.s.count / rt.def.perBox) * lay.capacity));
      const im = new THREE.InstancedMesh(productGeometry(rt.def.id), productMaterial(), shown);
      for (let i = 0; i < shown; i++) {
        _m.multiplyMatrices(new THREE.Matrix4().makeTranslation(0, 0.025, 0), lay.mats[i]);
        im.setMatrixAt(i, _m);
      }
      g.add(im);
    }
    return g;
  }

  byPid(pid: string): BoxRT[] {
    const out: BoxRT[] = [];
    for (const b of this.items.values()) if (b.def?.id === pid && (b.s.kind ?? 'box') === 'box') out.push(b);
    return out;
  }
}

export function litterTexture() {
  const [c] = makeCanvas(4, 4);
  return c;
}
