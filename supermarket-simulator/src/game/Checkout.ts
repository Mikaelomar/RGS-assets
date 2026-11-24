// Checkout counters: queues, belt items, scanning, card & cash payments (player or cashier employee),
// and self-checkout kiosks.
import * as THREE from 'three';
import type { Game } from './Game';
import type { FurnRT } from './Furniture';
import type { Customer } from './Customers';
import { CHECKOUT_SPOTS } from '../data/furniture';
import { PRODUCT_MAP } from '../data/products';
import { productGeometry, productMaterial } from '../gfx/ProductMeshes';
import { audio } from '../core/Audio';
import { haptic } from '../core/Platform';
import { h, money, round2, rand, chance, clamp } from '../core/util';

interface BeltItem { mesh: THREE.Mesh; pid: string; price: number; scanned: boolean; anim: number; from: THREE.Vector3; to: THREE.Vector3; }

interface Counter {
  f: FurnRT;
  queue: Customer[];
  serving: Customer | null;
  items: BeltItem[];
  phase: 'idle' | 'walk' | 'scan' | 'pay' | 'done' | 'return';
  timer: number;
  cashier: number | null; // employee uid
  helpNeeded: boolean;
  self: boolean;
  scannedTotal: number;
  wrongTries: number;
  cashGiven: number;
  lines: { name: string; price: number }[];
}

const DENOMS = [100, 50, 20, 10, 5, 1, 0.25, 0.1, 0.05, 0.01];

export class CheckoutSystem {
  counters = new Map<number, Counter>();
  active: Counter | null = null; // the one the player is working
  private ui: HTMLElement | null = null;
  private screenTot!: HTMLElement;
  private screenLines!: HTMLElement;
  private helpEl!: HTMLElement;
  private padEl: HTMLElement | null = null;
  private drawerEl: HTMLElement | null = null;
  private retEl: HTMLElement | null = null;
  private padValue = '';
  private given: number[] = [];
  private raycaster = new THREE.Raycaster();
  private group = new THREE.Group();
  savedCam: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  private servedHere = 0;

  constructor(private g: Game) {
    g.scene.add(this.group);
  }

  private counter(f: FurnRT): Counter {
    let c = this.counters.get(f.s.uid);
    if (!c) {
      c = { f, queue: [], serving: null, items: [], phase: 'idle', timer: 0, cashier: null, helpNeeded: false, self: f.def.id === 'self_checkout', scannedTotal: 0, wrongTries: 0, cashGiven: 0, lines: [] };
      this.counters.set(f.s.uid, c);
    }
    c.f = f;
    return c;
  }

  sync() {
    for (const f of this.g.furniture.items.values()) if (f.def.interact === 'checkout' || f.def.interact === 'selfcheckout') this.counter(f);
    for (const [uid, c] of [...this.counters]) {
      if (this.g.furniture.items.has(uid)) continue;
      // remove the counter first: re-routing its customers calls pickCounter() -> sync() again
      const waiting = [...c.queue, ...(c.serving ? [c.serving] : [])];
      this.clearBelt(c);
      this.counters.delete(uid);
      if (this.active === c) this.leave();
      for (const cu of waiting) if (!cu.removed) this.g.customers.goToCheckout(cu);
    }
  }

  /** Forget every counter (a different game was loaded). */
  clearAll() {
    if (this.active) this.leave();
    for (const c of this.counters.values()) this.clearBelt(c);
    this.counters.clear();
  }

  queueLength(f: FurnRT) {
    const c = this.counters.get(f.s.uid);
    return c ? c.queue.length + (c.serving ? 1 : 0) : 0;
  }
  selfNeedsHelp(f: FurnRT) { return !!this.counters.get(f.s.uid)?.helpNeeded; }

  isStaffed(c: Counter) {
    if (c.self) return !c.f.s.broken;
    if (c.f.s.broken) return false;
    if (this.active === c) return true;
    if (c.cashier !== null) {
      const e = this.g.staff.get(c.cashier);
      return !!e && e.onDuty && e.atStation;
    }
    return false;
  }

  waitingCustomers() {
    let n = 0;
    for (const c of this.counters.values()) if (!c.self && !this.isStaffed(c)) n += c.queue.length + (c.serving ? 1 : 0);
    return n;
  }

  pickCounter(cu: Customer): FurnRT | null {
    this.sync();
    let best: Counter | null = null;
    let bestScore = Infinity;
    for (const c of this.counters.values()) {
      if (c.f.s.broken) continue;
      if (c.self && cu.basket.length > 15) continue;
      if (c.self && cu.returnPid) continue; // returns need a cashier
      const len = c.queue.length + (c.serving ? 1 : 0);
      let score = len;
      if (c.self) score = len * 1.6 + 0.8 + (c.helpNeeded ? 3 : 0);
      else if (!this.isStaffed(c)) score += 2.5;
      score += c.f.box.getCenter(new THREE.Vector3()).distanceTo(cu.pos) * 0.04;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best?.f ?? null;
  }

  join(f: FurnRT, cu: Customer) {
    const c = this.counter(f);
    if (!c.queue.includes(cu)) c.queue.push(cu);
    this.layoutQueue(c);
  }

  leaveQueue(cu: Customer) {
    for (const c of this.counters.values()) {
      const i = c.queue.indexOf(cu);
      if (i >= 0) {
        c.queue.splice(i, 1);
        this.layoutQueue(c);
      }
      if (c.serving === cu) {
        c.serving = null;
        this.clearBelt(c);
        c.phase = 'idle';
        if (this.active === c) this.refreshUI();
      }
    }
  }

  private spot(c: Counter, k: number): THREE.Vector3 {
    if (c.self) return this.g.furniture.local(c.f, 0, 0, 0.75 + k * 0.85);
    const [qx, qz] = CHECKOUT_SPOTS.queue0;
    return this.g.furniture.local(c.f, qx - k * 0.85, 0, qz);
  }
  private paySpot(c: Counter) {
    if (c.self) return this.g.furniture.local(c.f, 0, 0, 0.62);
    return this.g.furniture.local(c.f, CHECKOUT_SPOTS.pay[0], 0, CHECKOUT_SPOTS.pay[1]);
  }

  private layoutQueue(c: Counter) {
    c.queue.forEach((cu, i) => {
      const p = this.spot(c, i + (c.self ? 1 : 0));
      cu.queueIdx = i;
      const d = cu.agent.destination;
      if (!d || Math.hypot(d[0] - p.x, d[1] - p.z) > 0.2) cu.agent.goTo(p.x, p.z, this.g.nav);
    });
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number) {
    for (const c of this.counters.values()) this.updateCounter(c, dt);
    this.animateBelt(dt);
    if (this.active) this.updatePlayerMode();
  }

  private updateCounter(c: Counter, dt: number) {
    const g = this.g;
    // next customer
    if (!c.serving && c.queue.length) {
      const first = c.queue[0];
      if (first.agent.arrived || first.agent.pos.distanceTo(this.spot(c, c.self ? 1 : 0)) < 0.7) {
        c.queue.shift();
        c.serving = first;
        c.phase = 'walk';
        c.timer = 0;
        c.lines = [];
        c.scannedTotal = 0;
        c.wrongTries = 0;
        const p = this.paySpot(c);
        first.agent.goTo(p.x, p.z, g.nav);
        first.setState('counter');
        this.layoutQueue(c);
      }
    }
    const cu = c.serving;
    if (!cu) return;
    cu.waitT += dt * (this.isStaffed(c) ? 0.3 : 1);
    if (cu.waitT > cu.patience * 1.2 && c.phase !== 'pay') {
      cu.notes.add('wait');
      cu.mood -= 25;
      cu.think('😠', 3);
      c.serving = null;
      this.clearBelt(c);
      c.phase = 'idle';
      g.customers.abandon(cu);
      g.state.today.walkouts++;
      if (this.active === c) this.refreshUI();
      return;
    }
    if (c.phase === 'walk') {
      if (cu.agent.arrived) {
        cu.agent.faceYaw = c.f.s.ry + (c.self ? Math.PI : Math.PI);
        if (cu.returnPid) {
          this.startReturn(c, cu);
          if (this.active === c) this.refreshUI();
          return;
        }
        this.placeBelt(c, cu);
        c.phase = 'scan';
        c.timer = 0;
        cu.agent.human.pose = 'idle';
        if (this.active === c) this.refreshUI();
      }
      return;
    }
    if (c.self) return this.updateSelf(c, cu, dt);
    // employee cashier
    if (this.active !== c && c.cashier !== null && this.isStaffed(c)) {
      const e = g.staff.get(c.cashier)!;
      const speed = e.speedMul;
      c.timer += dt * speed;
      if (c.phase === 'scan') {
        const next = c.items.find((i) => !i.scanned);
        if (next && c.timer > 0.85) {
          c.timer = 0;
          this.scan(c, next);
        } else if (!next && c.timer > 0.4) {
          c.phase = 'pay';
          this.applyCoupon(c);
          c.timer = 0;
        }
      } else if (c.phase === 'pay' && c.timer > 2.2) {
        this.complete(c, { exact: true, tipOk: chance(0.5), byStaff: true });
      } else if (c.phase === 'return' && c.timer > 2.8) {
        // employees follow store policy: faulty goods are refunded, unopened goods too (good service)
        this.processReturn(c, true, true);
      }
    }
  }

  private updateSelf(c: Counter, cu: Customer, dt: number) {
    c.timer += dt;
    if (c.helpNeeded) {
      // a cashier on duty comes over to help after a while
      if (c.timer > 18 && this.g.staff.byRole('cashier').some((e) => e.onDuty)) {
        c.helpNeeded = false;
        c.timer = 0;
        cu.think('🙂');
      }
      return;
    }
    if (c.phase === 'scan') {
      const next = c.items.find((i) => !i.scanned);
      if (next && c.timer > 1.6) {
        c.timer = 0;
        if (cu.needsHelp && c.items.filter((i) => i.scanned).length === Math.floor(c.items.length / 2)) {
          cu.needsHelp = false;
          c.helpNeeded = true;
          cu.think('🙋');
          this.g.ui.toast('A customer needs help at the self-checkout', 'info', '🙋');
          audio.play('warn', c.f.box.getCenter(new THREE.Vector3()), 0.6);
          return;
        }
        this.scan(c, next);
      } else if (!next && c.timer > 0.5) {
        c.phase = 'pay';
        this.applyCoupon(c);
        c.timer = 0;
      }
    } else if (c.phase === 'pay' && c.timer > 2.5) {
      this.complete(c, { exact: true, tipOk: false, byStaff: true });
    }
  }

  helpSelf(f: FurnRT) {
    const c = this.counters.get(f.s.uid);
    if (!c || !c.helpNeeded) return;
    c.helpNeeded = false;
    c.timer = 0;
    audio.play('approved', f.box.getCenter(new THREE.Vector3()));
    this.g.actions.gainXP(3, f.box.getCenter(new THREE.Vector3()));
    c.serving?.think('🙂');
  }

  private beltPos(c: Counter, i: number, n: number): THREE.Vector3 {
    if (c.self) return this.g.furniture.local(c.f, -0.15 + (i % 3) * 0.12, 1.06, 0.18 - Math.floor(i / 3) * 0.1);
    const len = 1.25;
    const per = Math.max(0.09, Math.min(0.18, len / Math.max(1, Math.ceil(n / 2))));
    const col = Math.floor(i / 2), row = i % 2;
    return this.g.furniture.local(c.f, -1.2 + col * per, 0.885, row ? -0.08 : 0.15);
  }

  private placeBelt(c: Counter, cu: Customer) {
    this.clearBelt(c);
    const n = Math.min(cu.basket.length, 30);
    cu.basket.forEach((b, i) => {
      const mesh = new THREE.Mesh(productGeometry(b.pid), productMaterial());
      const p = this.beltPos(c, Math.min(i, n - 1), n);
      mesh.position.copy(p);
      mesh.rotation.y = c.f.s.ry + rand(-0.3, 0.3) + Math.PI / 2;
      const p0 = PRODUCT_MAP.get(b.pid)!;
      const sc = Math.min(1.5, 0.12 / Math.max(0.05, Math.max(...p0.dims)) + 0.55);
      mesh.scale.setScalar(Math.min(1, sc));
      mesh.castShadow = false;
      (mesh as any).userData.beltIndex = i;
      this.group.add(mesh);
      c.items.push({ mesh, pid: b.pid, price: b.price, scanned: false, anim: 0, from: p.clone(), to: p.clone() });
    });
  }

  private clearBelt(c: Counter) {
    for (const it of c.items) {
      this.group.remove(it.mesh);
    }
    c.items = [];
  }

  private scan(c: Counter, it: BeltItem) {
    it.scanned = true;
    it.anim = 0.001;
    it.from.copy(it.mesh.position);
    const k = c.items.filter((x) => x.scanned).length;
    it.to.copy(c.self ? this.g.furniture.local(c.f, 0.62, 0.8 + (k % 3) * 0.03, -0.1 + (k % 4) * 0.06) : this.g.furniture.local(c.f, 0.85 + (k % 3) * 0.12, 0.9 + Math.floor(k / 9) * 0.05, -0.2 + (Math.floor(k / 3) % 3) * 0.15));
    const p = PRODUCT_MAP.get(it.pid)!;
    c.lines.push({ name: p.name, price: it.price });
    c.scannedTotal = round2(c.scannedTotal + it.price);
    audio.play('beep', c.f.box.getCenter(new THREE.Vector3()), 0.8);
    if (this.active === c) {
      haptic('light');
      this.refreshScreen();
    }
  }

  private animateBelt(dt: number) {
    for (const c of this.counters.values()) {
      for (const it of c.items) {
        if (it.anim <= 0 || it.anim >= 1) continue;
        it.anim = Math.min(1, it.anim + dt * 3.2);
        const t = it.anim;
        it.mesh.position.lerpVectors(it.from, it.to, t);
        it.mesh.position.y += Math.sin(t * Math.PI) * 0.12;
      }
    }
  }

  /** Payment done: money in, stats, customer leaves. */
  private complete(c: Counter, o: { exact: boolean; tipOk: boolean; byStaff: boolean; overpaid?: number; underpaid?: number }) {
    const g = this.g;
    const cu = c.serving;
    if (!cu) return;
    const total = round2(Math.max(0, c.scannedTotal || cu.basket.reduce((a, b) => a + b.price, 0)));
    const center = c.f.box.getCenter(new THREE.Vector3());
    let mul = 1;
    if (g.state.upgrades.includes('loyalty')) mul += 0.05;
    if (g.state.upgrades.includes('app')) mul += 0.05;
    if (g.state.upgrades.includes('premium')) mul += 0.1;
    const revenue = round2(total * mul);
    g.sim.earn(revenue, 'sales', center);
    if (cu.pay === 'cash') c.f.s.cash = round2((c.f.s.cash ?? 0) + revenue);
    let cogs = 0;
    for (const b of cu.basket) {
      const p = PRODUCT_MAP.get(b.pid)!;
      cogs += p.cost;
      g.state.today.sold[b.pid] = (g.state.today.sold[b.pid] ?? 0) + 1;
    }
    g.state.today.cogs = round2(g.state.today.cogs + cogs);
    g.state.today.itemsSold += cu.basket.length;
    g.state.today.served++;
    g.state.totals.itemsSold += cu.basket.length;
    g.state.totals.revenue = round2(g.state.totals.revenue + revenue);
    // extra upgrade income
    if (g.state.upgrades.includes('cafe')) g.sim.earn(0.8, 'cafe');
    if (o.overpaid) g.sim.spend(o.overpaid, 'cashErrors');
    if (o.underpaid) {
      cu.mood -= 18;
      cu.notes.add('change');
      cu.think('😡', 3);
    } else if (o.exact && !o.byStaff) {
      cu.mood += 5;
      if (o.tipOk && cu.mood > 70 && chance(0.6)) {
        const tip = round2(Math.max(0.25, total * rand(0.04, 0.12)));
        g.sim.earn(tip, 'tips');
        g.ui.floaty(center.clone().add(new THREE.Vector3(0, 0.4, 0)), `Tip +$${tip.toFixed(2)}`, 'gold');
      }
    }
    if (!o.byStaff) {
      g.actions.gainXP(cu.basket.length * 1 + 3 + (o.exact ? 2 : 0), center);
      this.servedHere++;
      if (this.active === c) this.printReceipt(c, cu, revenue);
      g.missions.bump('serve');
      if (o.exact && cu.pay === 'cash') g.missions.bump('exact');
    }
    else g.actions.gainXP(cu.basket.length * 0.6 + 1);
    cu.spent = revenue;
    audio.play('chaching', center, 0.8);
    g.tutorial.event('sale');
    cu.agent.human.setProp('bag', ['#d32f2f', '#ffffff', '#1e88e5'][Math.floor(Math.random() * 3)]);
    cu.mood += 2;
    this.clearBelt(c);
    c.serving = null;
    c.phase = 'idle';
    c.helpNeeded = false;
    cu.basket = [];
    g.customers.finishVisit(cu);
    if (this.active === c) this.refreshUI();
  }

  // ------------------------------------------------------------------ returns
  private startReturn(c: Counter, cu: Customer) {
    this.clearBelt(c);
    const pid = cu.returnPid!;
    const p = PRODUCT_MAP.get(pid)!;
    const price = this.g.shelves.priceOf(pid);
    const mesh = new THREE.Mesh(productGeometry(pid), productMaterial());
    mesh.position.copy(this.beltPos(c, 0, 1));
    mesh.rotation.y = c.f.s.ry + Math.PI / 2;
    mesh.scale.setScalar(Math.min(1, Math.min(1.5, 0.12 / Math.max(0.05, Math.max(...p.dims)) + 0.55)));
    this.group.add(mesh);
    c.items.push({ mesh, pid, price, scanned: true, anim: 0, from: mesh.position.clone(), to: mesh.position.clone() });
    c.lines = [{ name: `RETURN ${p.name}`, price: -price }];
    c.scannedTotal = -price;
    c.phase = 'return';
    c.timer = 0;
    cu.agent.human.pose = 'talk';
    cu.think('↩️', 3);
  }

  /** Refund or refuse a returned product. */
  processReturn(c: Counter, accept: boolean, byStaff: boolean) {
    const g = this.g;
    const cu = c.serving;
    if (!cu || !cu.returnPid || c.phase !== 'return') return;
    const p = PRODUCT_MAP.get(cu.returnPid)!;
    const price = Math.abs(c.scannedTotal);
    const faulty = cu.returnReason !== 'Changed my mind';
    const center = c.f.box.getCenter(new THREE.Vector3());
    if (accept) {
      g.sim.spend(price, 'returns');
      cu.mood = Math.max(cu.mood, 55) + 15;
      cu.think('😊', 2.5);
      g.state.stats.returns = (g.state.stats.returns ?? 0) + 1;
      let restocked = false;
      if (!faulty) {
        // unopened item goes back on a shelf if there is room
        const ref = g.shelves.slotsFor(p.id).find((r) => r.stock.count < g.shelves.capacity(r, p.id));
        if (ref) restocked = g.shelves.place(ref, p.id, 1, p.shelfLife ? g.state.day + Math.max(1, Math.floor(p.shelfLife / 2)) : 0) > 0;
      }
      audio.play('drawer', center, 0.6);
      if (!byStaff) g.ui.toast(`Refunded ${money(price)} for ${p.name}${restocked ? ' (put back on the shelf)' : ''}`, 'info', '↩️', 2600);
    } else {
      if (faulty) {
        cu.mood -= 35;
        cu.notes.add('refund');
        g.state.reputation = clamp(g.state.reputation - 0.02, 0.5, 5);
        cu.think('😡', 3);
      } else {
        cu.mood -= 10;
        cu.think('😒', 2.5);
      }
      audio.play('error', center, 0.5);
      if (!byStaff) g.ui.toast(faulty ? 'You refused a faulty product. The customer is furious!' : 'Refund refused: the customer accepts store policy.', faulty ? 'bad' : 'info', '🙅', 2600);
    }
    if (!byStaff) g.actions.gainXP(accept || !faulty ? 3 : 1, center);
    cu.returnPid = null;
    cu.agent.human.pose = 'idle';
    this.clearBelt(c);
    c.serving = null;
    c.phase = 'idle';
    c.lines = [];
    c.scannedTotal = 0;
    g.customers.finishVisit(cu);
    if (this.active === c) {
      this.closeReturn();
      this.refreshUI();
    }
  }

  private openReturn(c: Counter) {
    if (this.retEl) return;
    const cu = c.serving!;
    const faulty = cu.returnReason !== 'Changed my mind';
    const p = PRODUCT_MAP.get(cu.returnPid!)!;
    const yes = h('button', { class: 'btn green' }, '✔ REFUND');
    const no = h('button', { class: 'btn red' }, '✖ REFUSE');
    yes.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audio.play('click'); this.processReturn(c, true, false); });
    no.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); audio.play('click'); this.processReturn(c, false, false); });
    this.retEl = h('div', { class: 'co-return' },
      h('div', { class: 'rt-title' }, '↩️ PRODUCT RETURN'),
      h('div', { class: 'rt-item' }, h('span', null, p.name), h('b', null, money(Math.abs(c.scannedTotal)))),
      h('div', { class: 'rt-reason' }, `“${cu.returnReason}”`),
      h('div', { class: 'rt-hint' }, faulty ? 'Faulty goods should be refunded.' : 'Unopened item: refund is your choice. It goes back on the shelf.'),
      h('div', { class: 'rt-btns' }, yes, no));
    this.retEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.ui?.appendChild(this.retEl);
  }

  private closeReturn() {
    this.retEl?.remove();
    this.retEl = null;
  }

  private printReceipt(c: Counter, cu: Customer, paid: number) {
    const lines = c.lines.slice(0, 9);
    const el = h('div', { class: 'receipt' },
      h('div', { class: 'rc-head' }, this.g.state.storeName.toUpperCase()),
      h('div', { class: 'rc-sub' }, `Day ${this.g.state.day} · lane ${c.f.s.laneNo ?? 1}`),
      ...lines.map((l) => h('div', { class: 'rc-ln' }, h('span', null, l.name.slice(0, 18)), h('span', null, money(l.price)))),
      c.lines.length > 9 ? h('div', { class: 'rc-ln' }, h('span', null, `… ${c.lines.length - 9} more`), h('span', null, '')) : null,
      h('div', { class: 'rc-tot' }, h('span', null, 'TOTAL'), h('span', null, money(paid))),
      h('div', { class: 'rc-sub' }, cu.pay === 'card' ? 'Paid by card ✓' : `Cash ${money(c.cashGiven)}`),
      h('div', { class: 'rc-sub' }, 'Thank you for shopping!'));
    this.ui?.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3300);
  }

  /** Some customers bring a coupon: shown on the register and deducted from the total. */
  private applyCoupon(c: Counter) {
    const cu = c.serving;
    if (!cu || cu.coupon <= 0 || c.lines.some((l) => l.name === 'COUPON')) return;
    const v = round2(Math.min(cu.coupon, c.scannedTotal * 0.25));
    if (v <= 0) return;
    c.lines.push({ name: 'COUPON', price: -v });
    c.scannedTotal = round2(c.scannedTotal - v);
    if (this.active === c) {
      this.refreshScreen();
      this.g.ui.toast(`Customer used a coupon: -${money(v)}`, 'info', '🎟️', 2000);
    }
  }

  // ------------------------------------------------------------------ player mode
  enter(f: FurnRT) {
    const g = this.g;
    if (f.s.broken) {
      g.ui.toast('This register is broken. Repair it first!', 'bad', '🔧');
      return;
    }
    const c = this.counter(f);
    if (c.cashier !== null && g.staff.get(c.cashier)?.onDuty) {
      g.ui.toast('A cashier is working this register.', 'info', '🧾');
      return;
    }
    this.active = c;
    g.mode = 'checkout';
    g.player.locked = true;
    g.player.setHeld(null);
    const cam = g.engine.camera;
    this.savedCam = { pos: cam.position.clone(), quat: cam.quaternion.clone() };
    const pos = g.furniture.local(f, 0.95, 1.72, -1.0);
    const look = g.furniture.local(f, -0.25, 0.8, 0.35);
    cam.position.copy(pos);
    cam.lookAt(look);
    g.input.exitPointerLock();
    this.buildUI();
    this.refreshUI();
    g.tutorial.event('checkout');
  }

  leave() {
    const g = this.g;
    if (!this.active) return;
    const served = this.servedHere;
    this.servedHere = 0;
    if (served >= 2) setTimeout(() => g.ads.maybeInterstitial('checkout'), 400);
    this.closePad();
    this.closeDrawer();
    this.closeReturn();
    this.active = null;
    this.ui?.remove();
    this.ui = null;
    g.ui.hud.side.style.display = '';
    g.mode = 'walk';
    g.player.locked = false;
    g.player.update(0);
    g.refreshHeld();
  }

  private buildUI() {
    this.ui?.remove();
    this.screenTot = h('div', { class: 'tot' }, 'TOTAL $0.00');
    this.screenLines = h('div', { class: 'lines' });
    this.helpEl = h('div', { class: 'co-help' });
    const leaveBtn = h('button', { class: 'btn orange big co-leave', onclick: () => { audio.play('click'); this.leave(); } }, '⬅ LEAVE');
    this.ui = h('div', { class: 'checkout-ui' }, h('div', { class: 'co-screen' }, this.screenTot, this.screenLines), leaveBtn, this.helpEl);
    this.g.ui.root.appendChild(this.ui);
    this.g.ui.hud.side.style.display = 'none';
  }

  private refreshScreen() {
    const c = this.active;
    if (!c) return;
    this.screenTot.textContent = `TOTAL ${money(c.scannedTotal)}`;
    this.screenLines.innerHTML = '';
    for (const l of c.lines.slice(-7)) this.screenLines.appendChild(h('div', { class: 'ln' }, h('span', null, l.name.slice(0, 20)), h('span', null, money(l.price))));
  }

  private refreshUI() {
    const c = this.active;
    if (!c) return;
    this.refreshScreen();
    const cu = c.serving;
    if (!cu) {
      this.helpEl.textContent = c.queue.length ? 'Next customer is coming…' : 'No customers. Wait here or press LEAVE.';
      this.closePad();
      this.closeDrawer();
      this.closeReturn();
      return;
    }
    if (c.phase !== 'return') this.closeReturn();
    if (c.phase === 'walk') this.helpEl.textContent = cu.returnPid ? 'Customer is coming to return an item…' : 'Customer is putting items on the belt…';
    else if (c.phase === 'return') {
      this.helpEl.textContent = 'Product return: refund or refuse?';
      this.openReturn(c);
    }
    else if (c.phase === 'scan') {
      this.helpEl.textContent = `Tap each item on the belt to scan it (${c.items.filter((i) => !i.scanned).length} left)`;
      this.g.ui.hud.setAction('📠', 'Scan', true);
    }
    else if (c.phase === 'pay') {
      if (cu.pay === 'card') {
        this.helpEl.textContent = `Customer pays by CARD: enter ${money(c.scannedTotal)} on the terminal`;
        this.openPad();
      } else {
        this.helpEl.textContent = `Customer pays CASH: give the correct change`;
        this.openDrawer();
      }
    }
  }

  private updatePlayerMode() {
    const g = this.g;
    const c = this.active!;
    // keep the scene fresh
    if (c.phase === 'scan') {
      for (const tap of g.input.taps) this.tryScanAt(tap.x, tap.y);
      if (g.input.wasPressed('action')) {
        const next = c.items.find((i) => !i.scanned);
        if (next) this.scan(c, next);
      }
      if (c.items.length && c.items.every((i) => i.scanned) && c.phase === 'scan') {
        c.phase = 'pay';
        this.applyCoupon(c);
        this.refreshScreen();
        const cu = c.serving!;
        if (cu.pay === 'cash') c.cashGiven = cashGivenFor(c.scannedTotal);
        audio.play('drawer', c.f.box.getCenter(new THREE.Vector3()), 0.5);
        this.refreshUI();
      } else if (c.phase === 'scan') {
        const left = c.items.filter((i) => !i.scanned).length;
        this.helpEl.textContent = `Tap each item on the belt to scan it (${left} left)`;
      }
    }
    if (!c.serving && !this.helpEl.textContent?.startsWith('No') && !c.queue.length) this.refreshUI();
    if (!c.serving && c.queue.length && this.helpEl.textContent?.startsWith('No')) this.refreshUI();
    if (c.serving && c.phase === 'walk' && !this.helpEl.textContent?.startsWith('Customer is')) this.refreshUI();
    if (g.input.wasPressed('drop') || g.input.keyDown('Escape')) this.leave();
  }

  private tryScanAt(x: number, y: number) {
    const c = this.active!;
    const cam = this.g.engine.camera;
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, cam);
    const meshes = c.items.filter((i) => !i.scanned).map((i) => i.mesh);
    // generous picking: test enlarged bounding spheres
    let best: BeltItem | null = null;
    let bestD = Infinity;
    for (const it of c.items) {
      if (it.scanned) continue;
      const sp = new THREE.Sphere(it.mesh.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 0.11);
      const hit = this.raycaster.ray.intersectSphere(sp, new THREE.Vector3());
      if (hit) {
        const d = hit.distanceTo(cam.position);
        if (d < bestD) { bestD = d; best = it; }
      }
    }
    void meshes;
    if (best) this.scan(c, best);
  }

  // ------------------------------------------------------------------ card terminal
  private openPad() {
    if (this.padEl) return;
    this.padValue = '';
    const disp = h('div', { class: 'disp' }, h('small', null, 'AMOUNT'), h('span', null, '$0.00'));
    const keys = h('div', { class: 'keys' });
    const update = () => {
      const cents = parseInt(this.padValue || '0', 10);
      (disp.lastChild as HTMLElement).textContent = money(cents / 100);
    };
    const press = (k: string) => {
      audio.play('key');
      haptic('light');
      if (k === 'C') this.padValue = '';
      else if (k === '⌫') this.padValue = this.padValue.slice(0, -1);
      else if (k === 'OK') {
        this.confirmCard();
        return;
      } else if (this.padValue.length < 7) this.padValue += k;
      update();
    };
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'C']) {
      const b = h('button', { class: k === 'C' ? 'c' : '' }, k);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); press(k); });
      keys.appendChild(b);
    }
    const ok = h('button', { class: 'ok', style: { gridColumn: 'span 3' } }, 'OK');
    ok.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); press('OK'); });
    keys.appendChild(ok);
    this.padEl = h('div', { class: 'pospad' }, disp, keys);
    this.padEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.ui?.appendChild(this.padEl);
  }
  private closePad() {
    this.padEl?.remove();
    this.padEl = null;
  }

  private confirmCard() {
    const c = this.active;
    if (!c || !c.serving) return;
    const cents = parseInt(this.padValue || '0', 10);
    const target = Math.round(c.scannedTotal * 100);
    if (cents === target) {
      audio.play('approved');
      haptic('medium');
      this.closePad();
      this.complete(c, { exact: c.wrongTries === 0, tipOk: true, byStaff: false });
    } else {
      c.wrongTries++;
      audio.play('error');
      haptic('heavy');
      c.serving.mood -= 3;
      this.g.ui.toast(cents > target ? 'Too much! Check the total.' : 'Not enough! Check the total.', 'bad', '💳');
      this.padValue = '';
      const disp = this.padEl?.querySelector('.disp span');
      if (disp) disp.textContent = '$0.00';
    }
  }

  // ------------------------------------------------------------------ cash drawer
  private openDrawer() {
    if (this.drawerEl) return;
    const c = this.active!;
    this.given = [];
    const due = round2(c.cashGiven - c.scannedTotal);
    const givenRow = h('div', { class: 'given' });
    const givenTxt = h('b', null, '$0.00');
    const confirm = h('button', { class: 'btn green', style: { marginLeft: 'auto' } }, 'GIVE CHANGE ✓');
    const update = () => {
      const sum = round2(this.given.reduce((a, b) => a + b, 0));
      givenTxt.textContent = money(sum);
      givenRow.innerHTML = '';
      this.given.forEach((v, i) => {
        const chip = h('span', { onclick: () => { this.given.splice(i, 1); update(); } }, v >= 1 ? `$${v}` : `${Math.round(v * 100)}¢`);
        givenRow.appendChild(chip);
      });
      confirm.textContent = sum + 1e-6 < due ? `Need ${money(round2(due - sum))} more` : 'GIVE CHANGE ✓';
      confirm.classList.toggle('disabled', sum + 1e-6 < due);
    };
    const cash = h('div', { class: 'cash' });
    for (const d of DENOMS) {
      const isBill = d >= 1;
      const b = h('button', { class: isBill ? 'bill' : d >= 0.25 ? 'coin' : 'coin silver' }, isBill ? `$${d}` : `${Math.round(d * 100)}¢`);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        audio.play(isBill ? 'cash' : 'coins', null, 0.5);
        this.given.push(d);
        update();
      });
      cash.appendChild(b);
    }
    confirm.addEventListener('click', () => this.confirmCash());
    this.drawerEl = h('div', { class: 'drawer' },
      h('div', { class: 'info' },
        h('span', null, 'Total: ', h('b', null, money(c.scannedTotal))),
        h('span', null, 'Customer gave: ', h('b', null, money(c.cashGiven))),
        h('span', null, 'Change due: ', h('b', { style: { color: '#7dff9a' } }, money(due))),
        h('span', null, 'Giving: ', givenTxt)),
      givenRow,
      h('div', { class: 'row' }, cash, confirm));
    this.drawerEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.ui?.appendChild(this.drawerEl);
    update();
  }
  private closeDrawer() {
    this.drawerEl?.remove();
    this.drawerEl = null;
  }

  private confirmCash() {
    const c = this.active;
    if (!c || !c.serving) return;
    const due = round2(c.cashGiven - c.scannedTotal);
    const sum = round2(this.given.reduce((a, b) => a + b, 0));
    if (sum + 1e-6 < due) return;
    const over = round2(sum - due);
    this.closeDrawer();
    if (over > 0.001) {
      this.g.ui.toast(`You gave ${money(over)} too much change!`, 'bad', '💸');
      audio.play('error');
    } else {
      audio.play('success');
      this.g.ui.toast('Correct change!', 'good', '👍', 1400);
    }
    this.complete(c, { exact: over <= 0.001, tipOk: over <= 0.001, byStaff: false, overpaid: over > 0.001 ? over : 0 });
  }

  /** Count all register cash at the office safe (after closing). */
  countCash() {
    const g = this.g;
    let total = 0;
    for (const f of g.furniture.items.values()) {
      if (f.def.interact === 'checkout' && (f.s.cash ?? 0) > 0) {
        total += f.s.cash!;
        f.s.cash = 0;
      }
    }
    if (total <= 0) {
      g.ui.toast('No cash to count right now. Come back after closing!', 'info', '🔐');
      return;
    }
    g.state.stats.counted = (g.state.stats.counted ?? 0) + 1;
    audio.play('coins');
    g.ui.toast(`Counted ${money(total)} from the registers and locked it in the safe.`, 'good', '🔐');
    g.actions.gainXP(Math.min(40, 5 + total / 50));
  }

  assignCashier(uid: number | null, f: FurnRT) {
    const c = this.counter(f);
    c.cashier = uid;
  }

  freeCounterFor(uid: number): FurnRT | null {
    this.sync();
    for (const c of this.counters.values()) if (!c.self && c.cashier === uid) return c.f;
    for (const c of this.counters.values()) if (!c.self && c.cashier === null && !c.f.s.broken) {
      c.cashier = uid;
      return c.f;
    }
    return null;
  }
  releaseCashier(uid: number) {
    for (const c of this.counters.values()) if (c.cashier === uid) c.cashier = null;
  }
  cashierSpot(f: FurnRT) {
    return this.g.furniture.local(f, CHECKOUT_SPOTS.cashier[0], 0, CHECKOUT_SPOTS.cashier[1]);
  }
  hasWaiting(f: FurnRT) {
    const c = this.counters.get(f.s.uid);
    return !!c && (c.queue.length > 0 || !!c.serving);
  }
  clamp01 = clamp;
}

/** Realistic cash the customer hands over. */
function cashGivenFor(total: number): number {
  const opts: number[] = [];
  for (const d of [1, 5, 10, 20, 50, 100]) {
    const v = Math.ceil(total / d) * d;
    if (v >= total && v - total < d && v <= total + 100) opts.push(v);
  }
  if (chance(0.15)) return Math.ceil(total);
  const nice = opts.filter((v) => v > total);
  const pickV = nice.length ? nice[Math.floor(Math.random() * Math.min(3, nice.length))] : Math.ceil(total + 1);
  return round2(pickV);
}
