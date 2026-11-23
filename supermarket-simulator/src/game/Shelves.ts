// Shelf stock logic: slot views, price tags, placing / taking items, expiry.
import * as THREE from 'three';
import type { FurnitureSystem, FurnRT, SlotRT } from './Furniture';
import { computeLayout, type StockRenderer, type StockView, type Layout } from './Stock';
import { PRODUCT_MAP, PRODUCTS, type ProductDef } from '../data/products';
import type { SlotStock } from './state';
import { makeCanvas } from '../gfx/Textures';
import { money } from '../core/util';

export interface SlotRef { f: FurnRT; slot: SlotRT; stock: SlotStock; view: StockView; }

const TAG_W = 128, TAG_H = 64, TAG_COLS = 16;

class TagAtlas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  tiles = new Map<string, number>();
  next = 0;
  constructor() {
    [this.canvas, this.ctx] = makeCanvas(TAG_W * TAG_COLS, TAG_H * 16);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }
  tile(key: string): number {
    let t = this.tiles.get(key);
    if (t === undefined) {
      t = this.next++;
      this.tiles.set(key, t);
    }
    return t;
  }
  draw(key: string, price: string, name: string, style: 'normal' | 'sale' | 'expired' | 'empty') {
    const t = this.tile(key);
    const x = (t % TAG_COLS) * TAG_W, y = Math.floor(t / TAG_COLS) * TAG_H;
    const c = this.ctx;
    c.fillStyle = style === 'sale' ? '#ffd23f' : style === 'expired' ? '#d32f2f' : style === 'empty' ? '#e0e0e0' : '#ffffff';
    c.fillRect(x, y, TAG_W, TAG_H);
    c.fillStyle = style === 'expired' ? '#ffffff' : '#d32f2f';
    c.fillRect(x, y, TAG_W, 8);
    c.fillStyle = style === 'expired' ? '#ffffff' : '#111111';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `${style === 'expired' ? 22 : 30}px 'Lilita One', 'Arial Black', sans-serif`;
    c.fillText(price, x + TAG_W / 2, y + 30);
    c.font = `14px 'Nunito', sans-serif`;
    let n = name;
    while (c.measureText(n).width > TAG_W - 10 && n.length > 3) n = n.slice(0, -2);
    c.fillText(n, x + TAG_W / 2, y + 52);
    this.texture.needsUpdate = true;
    return t;
  }
  rect(t: number): THREE.Vector4 {
    const W = TAG_W * TAG_COLS, H = TAG_H * 16;
    const x = (t % TAG_COLS) * TAG_W, y = Math.floor(t / TAG_COLS) * TAG_H;
    return new THREE.Vector4(x / W, 1 - (y + TAG_H) / H, TAG_W / W, TAG_H / H);
  }
}

export class ShelfSystem {
  readonly refs = new Map<string, SlotRef>(); // key `${uid}:${i}`
  private byPid = new Map<string, Set<SlotRef>>();
  private tags: TagAtlas;
  private tagMesh: THREE.InstancedMesh;
  private tagSlots: SlotRef[] = [];
  private tagDirty = true;
  prices: Record<string, number> = {};
  promos: Record<string, number> = {};
  day = 1;

  constructor(scene: THREE.Scene, private furniture: FurnitureSystem, private stock: StockRenderer) {
    this.tags = new TagAtlas();
    const mat = new THREE.MeshBasicMaterial({ map: this.tags.texture, toneMapped: false });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aTileRect;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = aTileRect.xy + vMapUv * aTileRect.zw;\n#endif');
    };
    mat.customProgramCacheKey = () => 'tag-rect';
    const geo = new THREE.PlaneGeometry(0.1, 0.05);
    this.tagMesh = new THREE.InstancedMesh(geo, mat, 4096);
    geo.setAttribute('aTileRect', new THREE.InstancedBufferAttribute(new Float32Array(4096 * 4), 4));
    this.tagMesh.count = 0;
    this.tagMesh.frustumCulled = false;
    scene.add(this.tagMesh);
    this.drawTag('__empty', '—', 'empty', 'empty');
  }

  private drawTag(key: string, price: string, name: string, style: 'normal' | 'sale' | 'expired' | 'empty') {
    return this.tags.draw(key, price, name, style);
  }

  refreshPriceTag(pid: string) {
    const p = PRODUCT_MAP.get(pid)!;
    const price = this.priceOf(pid);
    const promo = this.promos[pid] ?? 0;
    this.drawTag(pid, money(price), promo ? `SALE -${promo}%` : p.name, promo ? 'sale' : 'normal');
    this.tagDirty = true;
  }

  priceOf(pid: string) {
    const base = this.prices[pid] ?? PRODUCT_MAP.get(pid)!.price;
    const promo = this.promos[pid] ?? 0;
    return Math.round(base * (1 - promo / 100) * 100) / 100;
  }

  /** Register slot views for a furniture piece (after add/move). */
  attach(f: FurnRT) {
    if (!f.s.slots) return;
    f.slots.forEach((slot, i) => {
      const key = `${f.s.uid}:${i}`;
      let ref = this.refs.get(key);
      const stock = f.s.slots![i];
      if (!ref) {
        const view = this.stock.createView(slot.matrix);
        ref = { f, slot, stock, view };
        this.refs.set(key, ref);
      } else {
        ref.slot = slot;
        ref.f = f;
        this.stock.setMatrix(ref.view, slot.matrix);
      }
      this.syncRef(ref);
    });
    this.tagDirty = true;
  }

  detach(f: FurnRT) {
    if (!f.s.slots) return;
    f.s.slots.forEach((_, i) => {
      const key = `${f.s.uid}:${i}`;
      const ref = this.refs.get(key);
      if (!ref) return;
      if (ref.stock.pid) this.byPid.get(ref.stock.pid)?.delete(ref);
      this.stock.removeView(ref.view);
      this.refs.delete(key);
    });
    this.tagDirty = true;
  }

  layoutFor(ref: SlotRef, p: ProductDef): Layout {
    return computeLayout(ref.slot.def, p, 40);
  }

  capacity(ref: SlotRef, pid: string) {
    return this.layoutFor(ref, PRODUCT_MAP.get(pid)!).capacity;
  }

  syncRef(ref: SlotRef) {
    const { stock } = ref;
    for (const set of this.byPid.values()) set.delete(ref);
    if (stock.pid && stock.count > 0) {
      let s = this.byPid.get(stock.pid);
      if (!s) this.byPid.set(stock.pid, (s = new Set()));
      s.add(ref);
    }
    if (stock.pid && stock.count <= 0) {
      // keep the product assignment (tag stays) so the slot is "reserved" until another product is placed
      stock.count = 0;
      stock.batches = [];
    }
    const p = stock.pid ? PRODUCT_MAP.get(stock.pid)! : null;
    this.stock.set(ref.view, stock.pid, stock.count, p ? this.layoutFor(ref, p) : null);
    this.tagDirty = true;
  }

  slotsFor(pid: string): SlotRef[] {
    return [...(this.byPid.get(pid) ?? [])];
  }

  /** All slots assigned to pid (even empty, reserved ones). */
  assignedSlots(pid: string): SlotRef[] {
    const out: SlotRef[] = [];
    for (const r of this.refs.values()) if (r.stock.pid === pid) out.push(r);
    return out;
  }

  shelfCount(pid: string) {
    let n = 0;
    for (const r of this.byPid.get(pid) ?? []) n += r.stock.count;
    return n;
  }

  canPlace(ref: SlotRef, pid: string): { ok: boolean; reason?: string } {
    const p = PRODUCT_MAP.get(pid)!;
    if (!p.display.includes(ref.slot.def.kind)) return { ok: false, reason: `${p.name} doesn't belong here` };
    if (ref.f.s.broken && (ref.f.def.coolTarget !== undefined)) return { ok: false, reason: 'This cooler is broken' };
    if (ref.stock.pid && ref.stock.pid !== pid && ref.stock.count > 0) return { ok: false, reason: `Slot has ${PRODUCT_MAP.get(ref.stock.pid)!.name}` };
    if (ref.stock.pid === pid && ref.stock.count >= this.capacity(ref, pid)) return { ok: false, reason: 'Slot is full' };
    return { ok: true };
  }

  /** Place n items with expiry. Returns how many were placed. */
  place(ref: SlotRef, pid: string, n: number, exp: number): number {
    if (!this.canPlace(ref, pid).ok) return 0;
    if (ref.stock.pid !== pid) {
      ref.stock.pid = pid;
      ref.stock.count = 0;
      ref.stock.batches = [];
    }
    const cap = this.capacity(ref, pid);
    const k = Math.min(n, cap - ref.stock.count);
    if (k <= 0) return 0;
    ref.stock.count += k;
    const last = ref.stock.batches[ref.stock.batches.length - 1];
    if (last && last.exp === exp) last.n += k;
    else ref.stock.batches.push({ n: k, exp });
    this.syncRef(ref);
    return k;
  }

  /** Take up to n items (oldest first). Returns expiry list of taken items. */
  take(ref: SlotRef, n: number): number[] {
    const out: number[] = [];
    while (n > 0 && ref.stock.count > 0) {
      const b = ref.stock.batches[0];
      if (!b) break;
      b.n--;
      ref.stock.count--;
      out.push(b.exp);
      if (b.n <= 0) ref.stock.batches.shift();
      n--;
    }
    this.syncRef(ref);
    return out;
  }

  /** Items that are already past their best-before date. */
  expiredCount(ref: SlotRef): number {
    let n = 0;
    for (const b of ref.stock.batches) if (b.exp > 0 && b.exp < this.day) n += b.n;
    return n;
  }

  removeExpired(ref: SlotRef): number {
    const n = this.expiredCount(ref);
    if (!n) return 0;
    ref.stock.batches = ref.stock.batches.filter((b) => !(b.exp > 0 && b.exp < this.day));
    ref.stock.count = ref.stock.batches.reduce((a, b) => a + b.n, 0);
    this.syncRef(ref);
    return n;
  }

  /** Spoil everything in a slot (broken cooler). Marks batches as expired yesterday. */
  spoil(ref: SlotRef) {
    for (const b of ref.stock.batches) b.exp = Math.min(b.exp || this.day - 1, this.day - 1);
    this.tagDirty = true;
  }

  clearAssignment(ref: SlotRef) {
    if (ref.stock.count > 0) return;
    ref.stock.pid = null;
    this.syncRef(ref);
  }

  // ---------------------------------------------------------------- price tags
  updateTags() {
    if (!this.tagDirty) return;
    this.tagDirty = false;
    const attr = this.tagMesh.geometry.getAttribute('aTileRect') as THREE.InstancedBufferAttribute;
    const m = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    let i = 0;
    this.tagSlots = [];
    for (const ref of this.refs.values()) {
      if (ref.f.hidden) continue;
      const sd = ref.slot.def;
      const pid = ref.stock.pid;
      let tile: number;
      if (!pid) tile = this.tags.tile('__empty');
      else if (this.expiredCount(ref) > 0) {
        if (!this.tags.tiles.has('__expired')) this.drawTag('__expired', 'EXPIRED', 'Remove items!', 'expired');
        tile = this.tags.tile('__expired');
      } else {
        if (!this.tags.tiles.has(pid)) this.refreshPriceTag(pid);
        tile = this.tags.tile(pid);
      }
      const rect = this.tags.rect(tile);
      // tag at the slot's front edge, slightly below the shelf surface
      local.makeTranslation(sd.layout === 'pile' ? 0 : -sd.w / 2 + 0.08, sd.layout === 'pile' ? 0.03 : -0.012, sd.d / 2 + 0.03);
      if (sd.layout === 'pile') local.makeTranslation(0, sd.h * 0.6, sd.d / 2 + 0.03);
      m.multiplyMatrices(ref.slot.matrix, local);
      this.tagMesh.setMatrixAt(i, m);
      attr.setXYZW(i, rect.x, rect.y, rect.z, rect.w);
      this.tagSlots.push(ref);
      i++;
      if (i >= 4096) break;
    }
    this.tagMesh.count = i;
    this.tagMesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
  }

  markTags() { this.tagDirty = true; }

  setDay(day: number) {
    this.day = day;
    this.tagDirty = true;
  }

  /** Products currently stocked anywhere on display. */
  stockedProducts(): string[] {
    const out: string[] = [];
    for (const [pid, s] of this.byPid) if (s.size) out.push(pid);
    return out;
  }

  allProducts() { return PRODUCTS; }
}
