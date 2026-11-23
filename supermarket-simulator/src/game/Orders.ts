// Ordering from suppliers and truck deliveries to the delivery spot (or inside, with a loading dock).
import * as THREE from 'three';
import type { Game } from './Game';
import type { OrderLine, OrderState } from './state';
import { PRODUCT_MAP, boxSizeFor } from '../data/products';
import { FURN_MAP } from '../data/furniture';
import { CONFIG } from '../data/config';
import { GeoBuilder } from '../gfx/GeoBuilder';
import { STREET } from '../world/City';
import { DELIVERY_SPOT } from './layout';
import { audio } from '../core/Audio';
import { nextUid, round2, rand, clamp } from '../core/util';
import * as T from '../gfx/Textures';

const REAL_SEC_STANDARD = 32;
const REAL_SEC_EXPRESS = 9;

interface Truck {
  root: THREE.Group;
  order: OrderState;
  x: number;
  phase: 'in' | 'unload' | 'out';
  t: number;
  queue: { pid?: string; fid?: string }[];
  speed: number;
  wheels: THREE.Object3D[];
}

export class OrderSystem {
  private trucks: Truck[] = [];
  private timers = new Map<number, number>();
  private truckGeo: { body: THREE.BufferGeometry; logo: THREE.Material } | null = null;
  private autoT = 0;

  constructor(private g: Game) {}

  linePrice(l: OrderLine) {
    if (l.pid) {
      const p = PRODUCT_MAP.get(l.pid)!;
      return round2(p.cost * p.perBox * l.qty);
    }
    if (l.fid) return FURN_MAP.get(l.fid)!.price * l.qty;
    return 0;
  }

  place(lines: OrderLine[], express: boolean): boolean {
    const g = this.g;
    const goods = round2(lines.reduce((a, l) => a + this.linePrice(l), 0));
    const fee = express ? CONFIG.expressFee : CONFIG.deliveryFee;
    if (!g.sim.canAfford(goods + fee)) {
      g.ui.toast('Not enough money for this order', 'bad', '💸');
      audio.play('error');
      return false;
    }
    const stockCost = round2(lines.filter((l) => l.pid).reduce((a, l) => a + this.linePrice(l), 0));
    const furnCost = round2(goods - stockCost);
    if (stockCost) g.sim.spend(stockCost, 'stock');
    if (furnCost) g.sim.spend(furnCost, 'furniture');
    g.sim.spend(fee, 'delivery');
    const o: OrderState = {
      uid: nextUid(), lines, placedDay: g.state.day, placedMin: g.state.minutes, etaDay: g.state.day, etaMin: g.state.minutes,
      total: round2(goods + fee), status: 'pending', express,
    };
    g.state.orders.push(o);
    this.timers.set(o.uid, express ? REAL_SEC_EXPRESS : REAL_SEC_STANDARD);
    audio.play('chaching');
    g.ui.toast(`Order placed! The truck arrives in ~${express ? 'a few seconds' : 'half a minute'}.`, 'good', '🚚');
    g.tutorial.event('order');
    return true;
  }

  delay(uid: number, sec: number) {
    this.timers.set(uid, (this.timers.get(uid) ?? 0) + sec);
  }

  secondsLeft(uid: number) { return this.timers.get(uid) ?? 0; }

  /** Instantly deliver (rewarded ad perk). */
  rushAll() {
    for (const o of this.g.state.orders) if (o.status === 'pending') this.timers.set(o.uid, 0.5);
  }

  load() {
    for (const t of this.trucks) t.root.removeFromParent();
    this.trucks = [];
    this.timers.clear();
    for (const o of this.g.state.orders) {
      if (o.status !== 'delivered') {
        o.status = 'pending';
        this.timers.set(o.uid, 6);
      }
    }
    this.g.state.orders = this.g.state.orders.filter((o) => o.status !== 'delivered');
  }

  update(dt: number) {
    const g = this.g;
    for (const o of g.state.orders) {
      if (o.status !== 'pending') continue;
      const t = (this.timers.get(o.uid) ?? REAL_SEC_STANDARD) - dt;
      this.timers.set(o.uid, t);
      if (t <= 0 && !this.trucks.some((tr) => tr.phase !== 'out' && tr.order !== o && tr.phase === 'unload')) {
        o.status = 'arriving';
        this.spawnTruck(o);
      }
    }
    for (const tr of [...this.trucks]) this.updateTruck(tr, dt);
    let eng = 0;
    for (const tr of this.trucks) eng = Math.max(eng, clamp(1 - Math.hypot(tr.x - g.player.pos.x, STREET.laneNear - g.player.pos.z) / 30, 0, 1));
    audio.setLoop('engine', eng * 0.6);
  }

  blockers(): { x: number; z: number }[] {
    return this.trucks.map((t) => ({ x: t.x, z: STREET.laneNear }));
  }

  private buildTruck(): THREE.Group {
    if (!this.truckGeo) {
      const b = new GeoBuilder();
      // cab faces -X (driving direction)
      b.rbox(2.2, 2.0, 2.3, 0.18, '#e9eef2', -3.2, 1.45, 0);
      b.box(0.08, 0.9, 2.0, '#1e2a33', -4.33, 1.85, 0);
      b.box(1.3, 0.65, 0.05, '#1e2a33', -3.2, 1.9, 1.16);
      b.box(1.3, 0.65, 0.05, '#1e2a33', -3.2, 1.9, -1.16);
      b.box(0.15, 0.25, 2.2, '#cfd8dc', -4.32, 0.7, 0);
      b.box(0.05, 0.15, 0.4, '#fff8e1', -4.35, 0.85, 0.8);
      b.box(0.05, 0.15, 0.4, '#fff8e1', -4.35, 0.85, -0.8);
      // cargo box
      b.boxB(5.6, 2.9, 2.45, '#fafafa', 0.8, 0.75, 0);
      b.boxB(5.6, 0.35, 2.47, '#d23b2c', 0.8, 0.75, 0);
      b.box(0.06, 2.8, 2.4, '#cfd8dc', 3.62, 2.2, 0);
      b.box(0.08, 0.2, 0.2, '#e53935', 3.65, 1.0, 1.0);
      b.box(0.08, 0.2, 0.2, '#e53935', 3.65, 1.0, -1.0);
      b.boxB(7.6, 0.3, 2.0, '#37474f', -0.2, 0.45, 0);
      for (const wx of [-3.2, 1.4, 2.6]) for (const wz of [-1.05, 1.05]) b.cyl(0.48, 0.48, 0.32, '#1b1b1b', wx, 0.48, wz, { rx: Math.PI / 2, seg: 14 });
      const body = b.build()!;
      const tex = T.signTexture('FRESH DELIVERY', { bg: '#fafafa', fg: '#d23b2c', w: 1024, h: 256, sub: 'Groceries · Daily · Fast' });
      const logo = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
      this.truckGeo = { body, logo };
      this.g.daylight.registerOutdoor(logo);
    }
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 });
    this.g.daylight.registerOutdoor(mat);
    const m = new THREE.Mesh(this.truckGeo.body, mat);
    m.castShadow = true;
    g.add(m);
    for (const side of [1, -1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 1.25), this.truckGeo.logo);
      sign.position.set(0.8, 2.6, side * 1.235);
      if (side < 0) sign.rotation.y = Math.PI;
      g.add(sign);
    }
    return g;
  }

  private spawnTruck(o: OrderState) {
    const g = this.g;
    const root = this.buildTruck();
    const queue: { pid?: string; fid?: string }[] = [];
    for (const l of o.lines) for (let i = 0; i < l.qty; i++) queue.push(l.pid ? { pid: l.pid } : { fid: l.fid });
    const tr: Truck = { root, order: o, x: 130, phase: 'in', t: 0, queue, speed: 11, wheels: [] };
    root.position.set(tr.x, STREET.roadY, STREET.laneNear);
    g.scene.add(root);
    this.trucks.push(tr);
    audio.play('horn', new THREE.Vector3(DELIVERY_SPOT.x, 0, 8), 0.6);
  }

  private updateTruck(tr: Truck, dt: number) {
    const g = this.g;
    const stopX = DELIVERY_SPOT.x - 2.2;
    tr.t += dt;
    if (tr.phase === 'in') {
      const dist = tr.x - stopX;
      const v = Math.min(tr.speed, Math.max(0.6, dist * 0.9));
      tr.x -= v * dt;
      if (dist <= 0.05) {
        tr.x = stopX;
        tr.phase = 'unload';
        tr.t = 0;
        audio.play('reverse', new THREE.Vector3(tr.x, 0, 8), 0.4);
      }
    } else if (tr.phase === 'unload') {
      if (tr.t > 0.9 && tr.queue.length) {
        tr.t = 0.55;
        const item = tr.queue.shift()!;
        this.dropItem(tr, item);
      } else if (!tr.queue.length && tr.t > 1.6) {
        tr.phase = 'out';
        tr.t = 0;
        tr.order.status = 'delivered';
        g.state.orders = g.state.orders.filter((o) => o !== tr.order);
        this.timers.delete(tr.order.uid);
        g.ui.toast('Delivery arrived! Boxes are at the delivery spot.', 'good', '📦');
        g.tutorial.event('delivered');
        g.markers.add('delivery', new THREE.Vector3(DELIVERY_SPOT.x, 1.6, DELIVERY_SPOT.z), '📦', 25);
      }
    } else {
      tr.speed = Math.min(12, 2 + tr.t * 4);
      tr.x -= tr.speed * dt;
      if (tr.x < -170) {
        tr.root.removeFromParent();
        this.trucks = this.trucks.filter((x) => x !== tr);
      }
    }
    tr.root.position.set(tr.x, STREET.roadY, STREET.laneNear);
  }

  private dropItem(tr: Truck, item: { pid?: string; fid?: string }) {
    const g = this.g;
    const dock = g.state.upgrades.includes('loadingdock') && g.building.hasRoom('storage');
    let x: number, z: number;
    const n = g.boxes.items.size;
    if (dock) {
      x = -6.5 + (n % 5) * 0.8 + rand(-0.1, 0.1);
      z = -1.6 - (Math.floor(n / 5) % 4) * 0.8;
    } else {
      x = DELIVERY_SPOT.x + rand(-2.0, 2.0);
      z = DELIVERY_SPOT.z + rand(-1.1, 1.3);
    }
    const uid = nextUid();
    if (item.pid) {
      const p = PRODUCT_MAP.get(item.pid)!;
      const size = boxSizeFor(p);
      void size;
      g.addBoxState({ uid, pid: p.id, count: p.perBox, exp: p.shelfLife ? g.state.day + p.shelfLife : 0, x, y: 1.4, z, ry: rand(-0.3, 0.3), kind: 'box' }, new THREE.Vector3(rand(-0.4, 0.4), 0.5, -1.2));
    } else if (item.fid) {
      g.addBoxState({ uid, pid: 'apple', count: 0, exp: 0, x, y: 1.4, z, ry: rand(-0.2, 0.2), kind: 'furniture', furn: item.fid }, new THREE.Vector3(0, 0.5, -1.0));
    }
    audio.play('thud', new THREE.Vector3(x, 0, z), 0.7);
  }

  /** Store manager auto-ordering. */
  autoOrder(dt: number) {
    const g = this.g;
    this.autoT -= dt;
    if (this.autoT > 0) return;
    this.autoT = 45;
    const lines: OrderLine[] = [];
    const seen = new Set<string>();
    for (const ref of g.shelves.refs.values()) {
      const pid = ref.stock.pid;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      const p = PRODUCT_MAP.get(pid)!;
      const shelf = g.shelves.shelfCount(pid);
      const boxes = g.boxes.byPid(pid).reduce((a, b) => a + b.s.count, 0);
      const pending = g.state.orders.some((o) => o.lines.some((l) => l.pid === pid));
      const slots = g.shelves.assignedSlots(pid).length;
      if (!pending && shelf + boxes < Math.max(p.perBox, slots * 8)) lines.push({ pid, qty: Math.max(1, Math.min(4, Math.ceil(slots / 2))) });
    }
    if (lines.length) {
      const total = lines.reduce((a, l) => a + this.linePrice(l), 0);
      if (g.sim.canAfford(total + 200)) {
        this.place(lines, false);
        g.ui.toast(`Store manager ordered ${lines.length} products`, 'info', '👔');
      }
    }
  }
}
