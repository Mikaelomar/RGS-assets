// Random events: rush days, weather, heat waves, breakdowns, late trucks, leaks, outages, recalls, inspections.
import * as THREE from 'three';
import type { Game } from './Game';
import { chance, pick, rand, nextUid, round2 } from '../core/util';
import { PRODUCT_MAP } from '../data/products';
import { audio } from '../core/Audio';

export class EventSystem {
  constructor(private g: Game) {
    g.sim.on('hour', (h) => this.hourly(h));
  }

  get list() { return this.g.state.events; }
  has(kind: string) { return this.list.some((e) => e.kind === kind && !e.resolved); }

  customerMul() {
    let m = 1;
    if (this.has('rush')) m *= 1.8;
    if (this.has('heatwave')) m *= 1.1;
    if (this.has('inspection')) m *= 0.9;
    return m;
  }
  spillMul() { return this.g.state.weather === 'rain' ? 1.6 : 1; }

  private add(kind: string, data: Record<string, any> = {}) {
    const s = this.g.state;
    const ev = { id: String(nextUid()), kind, startDay: s.day, startMin: s.minutes, data };
    s.events.push(ev);
    return ev;
  }

  resolve(kind: string, ref?: number) {
    for (const e of this.list) if (e.kind === kind && (ref === undefined || e.data.ref === ref)) e.resolved = true;
  }

  /** Called when a new day starts. */
  dayStart() {
    const g = this.g;
    const s = g.state;
    // drop finished day events
    s.events = s.events.filter((e) => !e.resolved && (e.kind === 'leak' || e.kind === 'recall'));
    // weather
    const r = Math.random();
    s.weather = r < 0.55 ? 'sunny' : r < 0.8 ? 'cloudy' : 'rain';
    g.daylight.rain = s.weather === 'rain' ? 1 : 0;
    if (s.day < 3) return;
    if (chance(0.12)) {
      this.add('rush');
      g.ui.toast('Town festival today: expect lots of customers!', 'info', '🎉', 5000);
    } else if (chance(0.07)) {
      this.add('heatwave');
      g.ui.toast('Heat wave! Drinks and ice cream will sell fast.', 'info', '🥵', 5000);
    } else if (chance(0.05)) {
      this.add('coldsnap');
      g.ui.toast('Cold snap! Heating bills go up today.', 'info', '🥶', 5000);
    }
  }

  private hourly(hour: number) {
    const g = this.g;
    const s = g.state;
    if (s.phase !== 'open' || s.day < 2 || s.tutorial < 11 && !s.tutorialDone) return;
    // power outage
    if (chance(0.012)) g.power.startOutage(Math.round(rand(25, 80)));
    // water leak
    if (chance(0.015) && !this.has('leak')) {
      const spots: [number, number][] = [[-3, -6], [-5, -9]];
      if (g.building.hasRoom('staffwc')) spots.push([-2, -20.5]);
      if (g.building.hasRoom('custwc')) spots.push([-2.2, -24.8]);
      const [x, z] = pick(spots);
      if (g.building.isIndoors(x, z) && (g.building.hasRoom('storage') || x >= 0)) {
        g.cleaning.addSpill(x, z, 'leak', 0.9);
        const sp = s.spills[s.spills.length - 1];
        this.add('leak', { ref: sp?.uid });
        g.ui.toast('A water pipe is leaking! Mop it up before it spreads.', 'bad', '💧', 5000);
        audio.play('warn');
      }
    }
    // product recall
    if (chance(0.01) && s.level >= 8) {
      const stocked = g.shelves.stockedProducts();
      if (stocked.length) {
        const pid = pick(stocked);
        const p = PRODUCT_MAP.get(pid)!;
        // supplier refunds the recalled items and they are removed automatically after you confirm
        let n = 0;
        for (const ref of g.shelves.assignedSlots(pid)) {
          n += ref.stock.count;
          g.shelves.take(ref, ref.stock.count);
        }
        if (n > 0) {
          const refund = round2(n * p.cost);
          g.sim.earn(refund, 'refund');
          g.ui.toast(`Product recall: ${p.name} was removed from the shelves (refund $${refund.toFixed(2)}).`, 'info', '⚠️', 6000);
        }
      }
    }
    // health inspection
    if (chance(0.01) && s.level >= 10 && !this.has('inspection')) {
      this.add('inspection');
      g.ui.toast('A health inspector arrived! Keep it clean for the next hour.', 'info', '🕵️', 5000);
      setTimeout(() => this.inspect(), 30000);
    }
    // late truck
    const pending = s.orders.filter((o) => o.status === 'pending');
    if (pending.length && chance(0.04)) {
      const o = pick(pending);
      g.orders.delay(o.uid, 25);
      g.ui.toast('The delivery truck is stuck in traffic and will be late.', 'info', '🚚', 4000);
    }
    void hour;
  }

  private inspect() {
    const g = this.g;
    const s = g.state;
    const ev = this.list.find((e) => e.kind === 'inspection' && !e.resolved);
    if (!ev) return;
    ev.resolved = true;
    const clean = g.cleaning.cleanliness();
    let expired = 0;
    for (const ref of g.shelves.refs.values()) expired += g.shelves.expiredCount(ref);
    const warm = [...g.furniture.items.values()].some((f) => f.def.coolTarget !== undefined && (f.s.temp ?? 0) > f.def.coolTarget + 5);
    const pass = clean > 0.65 && expired === 0 && !warm;
    if (pass) {
      g.sim.earn(150 + s.level * 10, 'inspection');
      s.reputation = Math.min(5, s.reputation + 0.15);
      g.ui.toast('Health inspection PASSED! Bonus received and reputation up.', 'good', '✅', 5000);
      audio.play('success');
    } else {
      const fine = 120 + s.level * 8;
      g.sim.spend(fine, 'fines');
      s.reputation = Math.max(0.5, s.reputation - 0.25);
      const why = clean <= 0.65 ? 'dirty store' : expired ? 'expired products' : 'warm coolers';
      g.ui.toast(`Health inspection FAILED (${why}). Fine: $${fine}.`, 'bad', '❌', 6000);
      audio.play('error');
    }
  }

  update(dt: number) {
    // leaks spread slowly and raise the water bill
    const s = this.g.state;
    for (const e of this.list) {
      if (e.kind !== 'leak' || e.resolved) continue;
      const sp = s.spills.find((x) => x.uid === e.data.ref);
      if (!sp) { e.resolved = true; continue; }
      if (sp.size < 1.6) sp.size += dt * 0.004;
      this.g.sim.kwhToday += 0; // water cost handled at day end
      e.data.water = (e.data.water ?? 0) + dt * 0.02;
    }
  }

  extraWaterCost() {
    let w = 0;
    for (const e of this.list) if (e.kind === 'leak') w += e.data.water ?? 0;
    return round2(w);
  }

  pos(): THREE.Vector3 | null { return null; }
}
