// Customers: arrive from the street, shop from their list, react to prices / stock / cleanliness,
// queue at checkouts, pay, leave and write reviews. Also passers-by for street life.
import * as THREE from 'three';
import type { Game } from './Game';
import { Agent } from './Agent';
import { randomLook } from '../gfx/Human';
import { PRODUCT_MAP, PRODUCTS, CATEGORY_MAP, type ProductDef } from '../data/products';
import type { SlotRef } from './Shelves';
import type { FurnRT } from './Furniture';
import { CONFIG } from '../data/config';
import { CUSTOMER_REVIEWS, FIRST_NAMES_F, FIRST_NAMES_M } from '../data/staff';
import { clamp, h, pick, rand, chance, weightedPick, round2 } from '../core/util';
import { DOORS, tierFor } from './layout';
import { audio } from '../core/Audio';

export type CState =
  | 'walkby' | 'approach' | 'enter' | 'basket' | 'shop' | 'reach' | 'toCheckout' | 'queue' | 'counter' | 'leave' | 'exit' | 'wc' | 'steal' | 'caught';

export interface ListItem { pid: string; qty: number; done: boolean; tried: number; }
export interface BasketItem { pid: string; exp: number; price: number; from?: SlotRef; }

export class Customer {
  agent: Agent;
  state: CState = 'walkby';
  list: ListItem[] = [];
  basket: BasketItem[] = [];
  budget = 0;
  sensitivity = 1;
  mood = 70;
  patience = CONFIG.maxQueuePatienceSec;
  waitT = 0;
  stateT = 0;
  pay: 'cash' | 'card' = 'card';
  name: string;
  shoplifter = false;
  counter: FurnRT | null = null;
  queueIdx = -1;
  current: { item: ListItem; ref: SlotRef } | null = null;
  notes = new Set<string>();
  thought: HTMLElement | null = null;
  private thoughtRemove: (() => void) | null = null;
  private thoughtT = 0;
  exitX = 0;
  shopper = true;
  usedWC = false;
  removed = false;
  impulse = 0;
  spent = 0;
  returning = false;
  coupon = 0;

  constructor(public g: Game, seed: number) {
    const look = randomLook(seed);
    this.agent = new Agent(look, g.scene);
    this.name = pick(look.female ? FIRST_NAMES_F : FIRST_NAMES_M);
    this.agent.maxSpeed = rand(1.15, 1.45) * (look.age === 3 ? 0.8 : 1);
  }

  get pos() { return this.agent.pos; }

  think(emoji: string, secs = 2.2) {
    if (!this.thought) {
      this.thought = h('div', { class: 'thought' });
      this.thoughtRemove = this.g.ui.anchor(this.thought, () => (this.agent.hidden ? null : new THREE.Vector3(this.pos.x, this.pos.y + this.agent.human.look.height + 0.35, this.pos.z)));
    }
    this.thought.textContent = emoji;
    this.thought.style.display = '';
    this.thoughtT = secs;
  }

  updateThought(dt: number) {
    if (this.thoughtT > 0) {
      this.thoughtT -= dt;
      if (this.thoughtT <= 0 && this.thought) this.thought.style.visibility = 'hidden';
      else if (this.thought) this.thought.style.visibility = '';
    }
  }

  setState(s: CState) {
    this.state = s;
    this.stateT = 0;
  }

  total() { return round2(this.basket.reduce((a, b) => a + b.price, 0)); }

  dispose() {
    this.removed = true;
    this.thoughtRemove?.();
    this.agent.dispose();
  }
}

const TIME_CURVE = (h: number) => {
  if (h < 8) return 0.3;
  if (h < 10) return 0.65;
  if (h < 12) return 0.95;
  if (h < 14) return 1.35;
  if (h < 16) return 0.9;
  if (h < 19) return 1.45;
  if (h < 21) return 0.85;
  return 0.5;
};

export class CustomerSystem {
  list: Customer[] = [];
  private spawnAcc = 0;
  private walkbyT = 0;
  private seed = Math.floor(Math.random() * 1e6);
  lostSales: Record<string, number> = {};
  demand: Record<string, number> = {};

  constructor(private g: Game) {}

  get inStore() { return this.list.filter((c) => c.state !== 'walkby' && c.state !== 'exit' && c.state !== 'approach').length; }
  get count() { return this.list.filter((c) => c.shopper && c.state !== 'walkby' && c.state !== 'exit').length; }

  /** Expected customers per game minute. */
  rate(): number {
    const g = this.g;
    const s = g.state;
    const tier = tierFor(s.plots.length);
    const tierMul = [1, 1.7, 2.8, 4.2, 6.2, 8.5][tier];
    const rep = clamp(s.reputation, 0.5, 5);
    const repMul = 0.35 + rep * 0.25;
    const variety = clamp(g.shelves.stockedProducts().length / 8, 0.25, 1.6);
    let mul = 1;
    if (s.upgrades.includes('flyers')) mul += 0.1;
    if (s.upgrades.includes('tvads')) mul += 0.2;
    if (s.upgrades.includes('parking')) mul += 0.15;
    if (s.upgrades.includes('app')) mul += 0.1;
    if (s.upgrades.includes('pharmacy')) mul += 0.08;
    if (s.upgrades.includes('flagship')) mul += 0.25;
    if (s.upgrades.includes('loyalty')) mul += 0.08;
    mul += s.marketing;
    if (g.sim.isWeekend) mul *= 1.3;
    if (s.weather === 'rain') mul *= 0.8;
    mul *= g.events.customerMul();
    return (CONFIG.baseCustomersPerHour / 60) * tierMul * repMul * variety * mul * TIME_CURVE(g.sim.hour);
  }

  maxActive() {
    const tier = tierFor(this.g.state.plots.length);
    const byTier = [6, 10, 16, 22, 30, 36][tier];
    return Math.min(byTier, this.g.engine.profile.maxCustomers);
  }

  private entrances() {
    return DOORS.filter((d) => d.kind === 'auto' && this.g.building.doorById(d.id)?.active);
  }

  spawn(shopper: boolean) {
    const g = this.g;
    const c = new Customer(g, this.seed++);
    const fromLeft = chance(0.5);
    const x = fromLeft ? rand(-34, -22) : rand(70, 86);
    const z = rand(1.6, 4.4);
    c.agent.pos.set(x, 0, z);
    c.exitX = fromLeft ? rand(70, 86) : rand(-34, -22);
    c.shopper = shopper;
    c.sensitivity = rand(0.6, 1.5);
    c.patience = CONFIG.maxQueuePatienceSec * rand(0.8, 1.4);
    c.pay = chance(0.65) ? 'card' : 'cash';
    if (chance(0.12)) c.coupon = pick([0.5, 1, 1, 1.5, 2]);
    const sec = (g.state.upgrades.includes('cameras') ? 0.5 : 1) * 0.025;
    c.shoplifter = shopper && g.state.level >= 6 && chance(sec);
    if (shopper) {
      this.makeList(c);
      const ent = this.entrances();
      const door = ent.reduce((a, b) => (Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b));
      c.setState('approach');
      c.agent.goTo(door.x + rand(-0.4, 0.4), 1.6, g.nav);
      g.state.today.customers++;
      g.state.totals.customers++;
    } else {
      c.setState('walkby');
      c.agent.goTo(c.exitX, z, g.nav);
    }
    this.list.push(c);
    return c;
  }

  private makeList(c: Customer) {
    const g = this.g;
    const s = g.state;
    const tier = tierFor(s.plots.length);
    const maxItems = [3, 5, 7, 9, 12, 14][tier];
    const n = Math.max(1, Math.round(rand(1, maxItems) * (chance(0.15) ? 1.6 : 1)));
    const stocked = new Set(g.shelves.stockedProducts());
    const licensed = PRODUCTS.filter((p) => p.level <= s.level + 3 && (CATEGORY_MAP.get(p.category)!.license === null || s.licenses.includes(p.category) || chance(0.08)));
    const picks: ListItem[] = [];
    for (let i = 0; i < n; i++) {
      const p = weightedPick(licensed, (p) => p.popularity * (stocked.has(p.id) ? 4 : 0.35) * (picks.some((x) => x.pid === p.id) ? 0 : 1) * (1 + (s.promos[p.id] ?? 0) / 25));
      if (!p) break;
      picks.push({ pid: p.id, qty: p.price < 1.2 && chance(0.4) ? Math.ceil(rand(1, 4)) : 1, done: false, tried: 0 });
    }
    c.list = picks;
    const est = picks.reduce((a, it) => a + PRODUCT_MAP.get(it.pid)!.price * it.qty, 0);
    c.budget = est * rand(1.15, 1.7) + rand(2, 8);
  }

  update(dt: number) {
    const g = this.g;
    const s = g.state;
    // spawning
    if (s.open && g.sim.isOpen) {
      this.spawnAcc += this.rate() * dt * CONFIG.minutesPerSecond;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.count < this.maxActive()) this.spawn(true);
      }
    }
    this.walkbyT -= dt;
    if (this.walkbyT <= 0) {
      const night = g.daylight.daylight < 0.3;
      this.walkbyT = rand(2.5, 7) * (night ? 3 : 1);
      if (this.list.filter((c) => !c.shopper).length < (night ? 2 : 6)) this.spawn(false);
    }
    const agents = this.list.map((c) => c.agent).concat(g.staff.agents());
    for (const c of [...this.list]) {
      c.stateT += dt;
      c.updateThought(dt);
      this.think(c, dt);
      if (c.removed) continue;
      c.agent.update(dt, g.nav, g.col, agents, g.player.pos);
    }
    this.list = this.list.filter((c) => !c.removed);
  }

  private remove(c: Customer) {
    g_remove(this, c);
  }

  /** Decide what to do next. */
  private think(c: Customer, dt: number) {
    const g = this.g;
    const a = c.agent;
    switch (c.state) {
      case 'walkby':
        if (a.arrived) this.remove(c);
        break;
      case 'approach': {
        if (!g.state.open && c.stateT > 1) {
          c.think('🔒');
          c.shopper = false;
          c.setState('walkby');
          a.goTo(c.exitX, a.pos.z, g.nav);
          g.state.today.customers--;
          break;
        }
        if (a.arrived) {
          c.setState('enter');
          a.goTo(a.pos.x + rand(-0.6, 0.6), -2.0, g.nav);
        }
        break;
      }
      case 'enter':
        if (a.arrived) {
          this.noticeStore(c);
          const baskets = g.furniture.byDef(c.list.length >= 6 ? 'cart_corral' : 'basket_stand');
          const stand = baskets.length ? baskets.reduce((x, y) => (x.s && y.s && dist(x, a) < dist(y, a) ? x : y)) : null;
          if (stand && c.list.length >= 2) {
            const p = g.furniture.local(stand, 0, 0, stand.def.size[1] / 2 + 0.55);
            a.goTo(p.x, p.z, g.nav);
            c.setState('basket');
          } else this.nextItem(c);
        }
        break;
      case 'basket':
        if (a.arrived && c.stateT > 0.6) {
          a.human.setProp(c.list.length >= 6 && g.furniture.byDef('cart_corral').length ? 'cart' : 'basket', pick(['#d32f2f', '#1e88e5', '#43a047']));
          this.nextItem(c);
        } else if (!a.arrived && c.stateT > 15) this.nextItem(c);
        break;
      case 'shop':
        if (!c.current) { this.nextItem(c); break; }
        if (a.arrived) {
          a.faceYaw = c.current.ref.slot.face;
          a.human.pose = 'reach';
          a.human.reachHeight = c.current.ref.slot.center.y;
          c.setState('reach');
        } else if (c.stateT > 25) {
          c.current.item.tried++;
          c.current = null;
          this.nextItem(c);
        }
        break;
      case 'reach':
        if (c.stateT > 1.3) {
          a.human.pose = a.human.propType === 'cart' ? 'cart' : a.human.propType === 'basket' ? 'basket' : 'idle';
          this.takeItem(c);
          this.nextItem(c);
        }
        break;
      case 'wc':
        if (a.arrived && !a.hidden) {
          a.hidden = true;
          c.stateT = 0;
        }
        if (a.hidden && c.stateT > 7) {
          a.hidden = false;
          g.state.wcDirt.cust = Math.min(1, g.state.wcDirt.cust + 0.05);
          c.usedWC = true;
          if (g.state.wcDirt.cust > 0.6) { c.mood -= 8; c.notes.add('dirty'); c.think('🤢'); }
          this.nextItem(c);
        }
        break;
      case 'toCheckout':
        if (!c.counter || c.stateT > 40) {
          this.goToCheckout(c);
        }
        break;
      case 'queue':
        c.waitT += dt;
        if (c.waitT > 30) c.mood -= dt * 0.25;
        if (c.waitT > c.patience * 0.6 && Math.random() < dt * 0.2) c.think('⏳');
        if (c.waitT > c.patience) {
          c.notes.add('wait');
          c.mood -= 25;
          c.think('😠', 3);
          g.checkout.leaveQueue(c);
          this.abandon(c);
          g.state.today.walkouts++;
          g.ui.toast('A customer gave up waiting at the checkout!', 'bad', '😠');
        }
        break;
      case 'counter':
        // the checkout system drives this state
        break;
      case 'steal':
        if (a.arrived) {
          // made it out with stolen goods
          const v = c.total();
          g.state.stats.stolen = round2((g.state.stats.stolen ?? 0) + v);
          if (v > 0) g.ui.toast(`A shoplifter got away with $${v.toFixed(2)} of goods!`, 'bad', '🚨');
          c.basket = [];
          c.setState('exit');
          a.goTo(c.exitX, rand(1.6, 4.4), g.nav);
        } else {
          for (const e of g.staff.byRole('security')) {
            if (e.onDuty && e.agent && e.agent.pos.distanceTo(a.pos) < 6 && Math.random() < dt * 0.9) {
              this.catchThief(c, 'security');
              return;
            }
          }
        }
        break;
      case 'caught':
        if (c.stateT > 2.5) {
          c.setState('exit');
          a.human.pose = 'idle';
          a.goTo(c.exitX, rand(1.6, 4.4), g.nav);
        }
        break;
      case 'leave':
        if (a.arrived) {
          c.setState('exit');
          a.goTo(c.exitX, rand(1.6, 4.4), g.nav);
        }
        break;
      case 'exit':
        if (a.arrived) this.remove(c);
        break;
    }
    // random spills / litter while inside
    if (c.shopper && ['shop', 'reach', 'queue', 'toCheckout'].includes(c.state) && Math.random() < dt * 0.0025 * g.events.spillMul()) {
      g.cleaning.addSpill(a.pos.x, a.pos.z, pick(['water', 'milk', 'juice']));
    }
    if (c.shopper && c.state === 'shop' && Math.random() < dt * 0.002) g.cleaning.addLitter(a.pos.x + rand(-0.3, 0.3), a.pos.z + rand(-0.3, 0.3));
  }

  private noticeStore(c: Customer) {
    const g = this.g;
    const clean = g.cleaning.cleanliness();
    if (clean < 0.55) {
      c.mood -= (0.55 - clean) * 40;
      c.notes.add('dirty');
      c.think('🤢');
    }
    if (g.power.outage) {
      c.mood -= 10;
      c.think('💡❌');
    }
    const temp = g.power.indoorTemp;
    if (temp > 27 || temp < 16) {
      c.mood -= 6;
      c.think(temp > 27 ? '🥵' : '🥶');
    }
    if (g.state.upgrades.includes('music')) c.mood += 3;
    if (g.state.upgrades.includes('premium')) c.mood += 6;
    c.mood += g.furniture.beauty() * 0.8;
    if (!c.usedWC && g.building.hasRoom('custwc') && chance(0.06)) {
      // will use the restroom later
      c.usedWC = false;
    }
  }

  /** Choose the nearest list item that can be found and walk there. */
  private nextItem(c: Customer) {
    const g = this.g;
    const a = c.agent;
    c.current = null;
    // restroom visit
    if (!c.usedWC && g.building.hasRoom('custwc') && g.building.isPlot(0, 2) && chance(0.05)) {
      c.usedWC = true;
      c.setState('wc');
      a.goTo(-1.8, -24.5, g.nav);
      return;
    }
    let best: { item: ListItem; ref: SlotRef; d: number } | null = null;
    for (const it of c.list) {
      if (it.done || it.tried > 1) continue;
      const refs = g.shelves.slotsFor(it.pid);
      for (const ref of refs) {
        if (ref.stock.count <= 0) continue;
        if (ref.f.s.broken && ref.f.def.coolTarget !== undefined && ref.stock.batches.length === 0) continue;
        const d = ref.slot.access.distanceTo(a.pos);
        if (!best || d < best.d) best = { item: it, ref, d };
      }
    }
    if (!best) {
      // impulse buy from promo stands / nearby
      if (c.impulse < 2 && chance(0.25)) {
        const stocked = g.shelves.stockedProducts();
        const pid = stocked.length ? pick(stocked) : null;
        if (pid && !c.list.some((x) => x.pid === pid)) {
          c.list.push({ pid, qty: 1, done: false, tried: 0 });
          c.impulse++;
          this.nextItem(c);
          return;
        }
      }
      // everything not found counts as missing
      for (const it of c.list) {
        if (!it.done) {
          it.done = true;
          c.mood -= 7;
          c.notes.add('missing');
          this.lostSales[it.pid] = (this.lostSales[it.pid] ?? 0) + it.qty;
          const p = PRODUCT_MAP.get(it.pid)!;
          c.think('🔍❌ ' + shortName(p));
        }
      }
      if (c.shoplifter && c.basket.length) {
        c.setState('steal');
        const door = this.entrances()[0];
        a.goTo(door.x, 2.5, g.nav);
        return;
      }
      if (c.basket.length) this.goToCheckout(c);
      else this.leaveEmpty(c);
      return;
    }
    c.current = { item: best.item, ref: best.ref };
    c.setState('shop');
    a.goTo(best.ref.slot.access.x + rand(-0.15, 0.15), best.ref.slot.access.z + rand(-0.1, 0.1), g.nav);
  }

  private takeItem(c: Customer) {
    const g = this.g;
    const cur = c.current;
    if (!cur) return;
    const { item, ref } = cur;
    const p = PRODUCT_MAP.get(item.pid)!;
    if (ref.stock.pid !== item.pid || ref.stock.count <= 0) {
      item.tried++;
      return;
    }
    const price = g.shelves.priceOf(p.id);
    const ratio = price / p.price;
    // promo / price reaction
    let accept = 1;
    if (ratio > 1.0) accept = clamp(1 - ((ratio - 1) * 1.8) / c.sensitivity, 0, 1);
    if (ratio < 0.85) { c.mood += 3; c.think('🤑'); }
    if (Math.random() > accept) {
      item.done = true;
      c.mood -= 5;
      c.notes.add('expensive');
      c.think('💲😒');
      this.lostSales[p.id] = (this.lostSales[p.id] ?? 0) + item.qty;
      return;
    }
    // freshness check
    const expired = g.shelves.expiredCount(ref);
    if (expired > 0 && ref.stock.batches[0] && ref.stock.batches[0].exp > 0 && ref.stock.batches[0].exp < g.state.day) {
      item.done = true;
      c.mood -= 14;
      c.notes.add('expired');
      c.think('🤢');
      return;
    }
    let qty = item.qty;
    if (c.total() + price * qty > c.budget) qty = Math.max(0, Math.floor((c.budget - c.total()) / price));
    if (qty <= 0) {
      item.done = true;
      c.think('💸');
      return;
    }
    const exps = g.shelves.take(ref, qty);
    for (const e of exps) c.basket.push({ pid: p.id, exp: e, price, from: ref });
    item.done = exps.length >= item.qty;
    if (exps.length) {
      c.mood += 2;
      if (ref.f.def.id === 'promo_stand' || (g.state.promos[p.id] ?? 0) > 0) c.mood += 1;
      audio.play('pop', ref.slot.center, 0.35);
      if (ref.f.def.coolTarget !== undefined && (ref.f.s.dirt ?? 0) > 0.5) { c.mood -= 2; c.notes.add('dirty'); }
    } else item.tried++;
  }

  goToCheckout(c: Customer) {
    const g = this.g;
    const counter = g.checkout.pickCounter(c);
    if (!counter) {
      // no checkout at all: wander and leave
      c.think('❓🧾');
      this.abandon(c);
      return;
    }
    c.counter = counter;
    g.checkout.join(counter, c);
    c.setState('queue');
    c.waitT = 0;
  }

  /** Customer leaves without buying: items go back to their shelf slots. */
  abandon(c: Customer) {
    const g = this.g;
    for (const b of c.basket) {
      if (b.from && (b.from.stock.pid === b.pid || !b.from.stock.pid) && g.shelves.refs.has(`${b.from.f.s.uid}:${b.from.slot.index}`)) {
        g.shelves.place(b.from, b.pid, 1, b.exp);
      }
    }
    c.basket = [];
    this.leaveEmpty(c);
  }

  leaveEmpty(c: Customer) {
    c.mood -= 5;
    this.finishVisit(c);
  }

  /** Walk out and write a review. */
  finishVisit(c: Customer) {
    const g = this.g;
    const a = c.agent;
    if (c.state === 'leave' || c.state === 'exit') return;
    this.review(c);
    const ent = this.entrances();
    const door = ent.reduce((x, y) => (Math.abs(x.x - a.pos.x) < Math.abs(y.x - a.pos.x) ? x : y));
    c.setState('leave');
    a.goTo(door.x + rand(-0.4, 0.4), 1.8, g.nav);
  }

  private review(c: Customer) {
    const g = this.g;
    const mood = clamp(c.mood, 0, 100);
    const stars = clamp(Math.round(mood / 20 + 0.3), 1, 5);
    g.state.today.satSum += mood;
    g.state.today.satCount++;
    g.state.reputation = clamp(g.state.reputation * 0.96 + stars * 0.04, 0.5, 5);
    if (mood >= 80) c.think('😊');
    else if (mood < 40) c.think('😠');
    // keep a few written reviews
    if (chance(0.35) || stars <= 2) {
      let text: string;
      if (stars >= 4) text = pick(CUSTOMER_REVIEWS.great);
      else if (stars === 3) text = pick(CUSTOMER_REVIEWS.ok);
      else if (c.notes.has('missing')) text = 'Shelves were empty! Could not find what I needed.';
      else if (c.notes.has('expensive')) text = 'Way too expensive.';
      else if (c.notes.has('expired')) text = 'Found expired food. Gross.';
      else if (c.notes.has('dirty')) text = 'The store was dirty.';
      else if (c.notes.has('wait')) text = 'I waited forever at the checkout.';
      else if (c.notes.has('change')) text = 'The cashier gave me the wrong change!';
      else text = pick(CUSTOMER_REVIEWS.bad);
      g.state.reviews.unshift({ day: g.state.day, stars, text, name: c.name });
      if (g.state.reviews.length > 40) g.state.reviews.pop();
    }
  }

  catchThief(c: Customer, by: 'player' | 'security') {
    const g = this.g;
    if (c.state !== 'steal') return;
    // items are recovered
    for (const b of c.basket) if (b.from && g.shelves.refs.has(`${b.from.f.s.uid}:${b.from.slot.index}`)) g.shelves.place(b.from, b.pid, 1, b.exp);
    c.basket = [];
    c.agent.stop();
    c.agent.human.pose = 'angry';
    c.think('😳', 2.5);
    c.setState('caught');
    audio.play('alarm', c.pos, 0.7);
    g.ui.toast(by === 'player' ? 'You stopped a shoplifter! Items recovered.' : 'Security caught a shoplifter!', 'good', '🚨');
    g.actions.gainXP(by === 'player' ? 15 : 5, c.pos.clone().setY(1.8));
  }

  clearAll() {
    for (const c of this.list) c.dispose();
    this.list = [];
  }
}

function g_remove(sys: CustomerSystem, c: Customer) {
  c.dispose();
  sys.list = sys.list.filter((x) => x !== c);
}

function dist(f: FurnRT, a: Agent) {
  return Math.hypot(f.s.x - a.pos.x, f.s.z - a.pos.z);
}

function shortName(p: ProductDef) {
  const w = p.name.split(' ');
  return w.length > 1 ? w.slice(-1)[0] : p.name;
}
