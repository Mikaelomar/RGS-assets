// Employees: hiring, shifts, wages, energy/breaks, and role behaviours.
import * as THREE from 'three';
import type { Game } from './Game';
import { Agent } from './Agent';
import { staffLook, type HumanLook } from '../gfx/Human';
import type { EmployeeState, RoleId } from './state';
import { ROLES, ROLE_MAP, FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES } from '../data/staff';
import type { FurnRT } from './Furniture';
import type { BoxRT } from './Boxes';
import type { SlotRef } from './Shelves';
import { PRODUCT_MAP } from '../data/products';
import { clamp, pick, rand, chance, nextUid, round2 } from '../core/util';
import { DELIVERY_SPOT } from './layout';
import { audio } from '../core/Audio';

type Status = 'off' | 'arriving' | 'lockers' | 'working' | 'break' | 'wc' | 'leaving';

interface Task {
  kind: string;
  step: number;
  t: number;
  box?: BoxRT;
  ref?: SlotRef;
  f?: FurnRT;
  spill?: number;
  pos?: THREE.Vector3;
}

const UNIFORM: Record<RoleId, HumanLook['uniform']> = {
  cashier: 'polo', stocker: 'polo', cleaner: 'polo', warehouse: 'vest', security: 'security', technician: 'overalls',
  baker: 'chef', butcher: 'apron', deptmanager: 'suit', manager: 'suit',
};

export class Employee {
  agent: Agent | null = null;
  status: Status = 'off';
  task: Task | null = null;
  atStation = false;
  station: FurnRT | null = null;
  private idleT = 0;
  statusT = 0;
  carrying: BoxRT | null = null;
  nextWC = rand(90, 240);
  /** Energy level at which this person takes a break (staggered between employees). */
  breakAt = rand(16, 32);
  constructor(public s: EmployeeState, private g: Game) {}

  get role() { return ROLE_MAP.get(this.s.role)!; }
  get onDuty() { return this.status === 'working' || this.status === 'break' || this.status === 'wc' || this.status === 'lockers'; }
  get speedMul() {
    const boost = this.g.staff.managerBoost();
    return (0.75 + this.s.skill * 0.13) * (0.75 + 0.25 * (this.s.morale / 100)) * boost * (this.s.energy < 20 ? 0.7 : 1);
  }
  get wagePerHour() { return this.s.wage; }
}

export class StaffSystem {
  list: Employee[] = [];
  private uiTimer = 0;

  constructor(private g: Game) {}

  load() {
    for (const e of this.list) e.agent?.dispose();
    this.list = this.g.state.employees.map((s) => new Employee(s, this.g));
  }

  agents(): Agent[] {
    const out: Agent[] = [];
    for (const e of this.list) if (e.agent) out.push(e.agent);
    return out;
  }
  get(uid: number) { return this.list.find((e) => e.s.uid === uid); }
  byRole(r: RoleId) { return this.list.filter((e) => e.s.role === r); }
  onShiftCount() { return this.list.filter((e) => e.onDuty).length; }
  managerBoost() { return this.list.some((e) => e.s.role === 'deptmanager' && e.onDuty) ? 1.15 : 1; }

  // ------------------------------------------------------------------ HR
  makeCandidate(role?: RoleId): EmployeeState {
    const s = this.g.state;
    const roles = ROLES.filter((r) => r.level <= s.level);
    const r = role ? ROLE_MAP.get(role)! : pick(roles);
    const female = chance(0.5);
    const skill = chance(0.08) ? 4 : chance(0.25) ? 3 : chance(0.45) ? 2 : 1;
    const wage = round2(r.wage * (1 + 0.22 * (skill - 1)) * rand(0.92, 1.12));
    return {
      uid: nextUid(),
      name: `${pick(female ? FIRST_NAMES_F : FIRST_NAMES_M)} ${pick(LAST_NAMES)}`,
      role: r.id, skill, wage, shiftStart: 8, shiftEnd: 16, energy: 100, morale: 75, look: Math.floor(Math.random() * 1e6), female, daysWorked: 0,
    };
  }

  refreshCandidates() {
    const s = this.g.state;
    if (s.level < 5) { s.candidates = []; return; }
    const n = 5;
    s.candidates = [];
    for (let i = 0; i < n; i++) s.candidates.push(this.makeCandidate());
  }

  hire(c: EmployeeState): boolean {
    const g = this.g;
    const fee = Math.round(c.wage * 4);
    if (!g.sim.pay(fee, 'hiring')) return false;
    g.state.candidates = g.state.candidates.filter((x) => x.uid !== c.uid);
    // sensible default shift: fill the gap
    const sameRole = this.list.filter((e) => e.s.role === c.role).length;
    if (sameRole % 2 === 1) { c.shiftStart = 14; c.shiftEnd = 22; } else { c.shiftStart = 8; c.shiftEnd = 16; }
    g.state.employees.push(c);
    this.list.push(new Employee(c, g));
    g.ui.toast(`${c.name} joined as ${ROLE_MAP.get(c.role)!.name}!`, 'good', ROLE_MAP.get(c.role)!.icon);
    audio.play('success');
    g.tutorial.event('hire');
    return true;
  }

  fire(uid: number) {
    const g = this.g;
    const e = this.get(uid);
    if (!e) return;
    g.sim.spend(round2(e.s.wage * 8), 'wages');
    this.release(e);
    e.agent?.dispose();
    this.list = this.list.filter((x) => x !== e);
    g.state.employees = g.state.employees.filter((x) => x.uid !== uid);
    g.ui.toast(`${e.s.name} was let go (1 day severance paid).`, 'info', '👋');
  }

  train(uid: number): boolean {
    const g = this.g;
    const e = this.get(uid);
    if (!e || e.s.skill >= 5) return false;
    if (e.s.trainedDay === g.state.day) {
      g.ui.toast('Already trained today', 'bad');
      return false;
    }
    const cost = 150 * e.s.skill;
    if (!g.sim.pay(cost, 'training')) return false;
    e.s.skill++;
    e.s.trainedDay = g.state.day;
    e.s.wage = round2(e.s.wage * 1.12);
    e.s.morale = Math.min(100, e.s.morale + 10);
    g.ui.toast(`${e.s.name} is now skill ${e.s.skill} ★`, 'good', '🎓');
    return true;
  }

  promote(uid: number): boolean {
    const g = this.g;
    const e = this.get(uid);
    if (!e) return false;
    const to = e.role.promoteTo ? ROLE_MAP.get(e.role.promoteTo)! : null;
    if (!to || to.level > g.state.level) return false;
    this.release(e);
    e.s.role = to.id;
    e.s.wage = round2(Math.max(e.s.wage * 1.2, to.wage * (1 + 0.15 * (e.s.skill - 1))));
    e.s.morale = Math.min(100, e.s.morale + 25);
    // new uniform
    if (e.agent) {
      const pos = e.agent.pos.clone();
      e.agent.dispose();
      e.agent = this.makeAgent(e);
      e.agent.pos.copy(pos);
    }
    g.ui.toast(`${e.s.name} promoted to ${to.name}!`, 'good', to.icon);
    return true;
  }

  setShift(uid: number, start: number, end: number) {
    const e = this.get(uid);
    if (!e) return;
    e.s.shiftStart = clamp(start, 0, 23);
    e.s.shiftEnd = clamp(end, e.s.shiftStart + 2, 26);
  }

  private makeAgent(e: Employee) {
    const look = staffLook(e.s.look, e.s.female, e.role.uniform, UNIFORM[e.s.role]);
    const a = new Agent(look, this.g.scene);
    a.staff = true;
    a.maxSpeed = 1.55;
    return a;
  }

  private release(e: Employee) {
    if (e.s.role === 'cashier') this.g.checkout.releaseCashier(e.s.uid);
    if (e.carrying) {
      this.g.boxes.setHeld(e.carrying, false);
      const p = e.agent?.pos ?? new THREE.Vector3();
      this.g.boxes.placeAt(e.carrying, p.x, 0.02, p.z, 0);
      e.carrying = null;
    }
    e.task = null;
    e.atStation = false;
    e.station = null;
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    const g = this.g;
    const s = g.state;
    const hour = s.minutes / 60;
    const others = g.customers.list.map((c) => c.agent).concat(this.agents());
    for (const e of this.list) {
      const es = e.s;
      const inShift = !es.sick && hour >= es.shiftStart && hour < es.shiftEnd && s.phase !== 'night' || (!es.sick && s.phase === 'prep' && es.shiftStart <= s.openHour);
      e.statusT += dt;
      // arrive / leave
      if (inShift && e.status === 'off') {
        e.agent = this.makeAgent(e);
        const fromLeft = chance(0.5);
        e.agent.pos.set(fromLeft ? rand(-30, -24) : rand(70, 78), 0, rand(2, 4));
        const door = g.building.doorById('d_entr1')!;
        e.agent.goTo(door.def.x, -1.8, g.nav);
        e.status = 'arriving';
        e.statusT = 0;
      } else if (!inShift && e.onDuty && e.status !== 'leaving') {
        this.release(e);
        e.status = 'leaving';
        e.statusT = 0;
        e.agent?.goTo(rand(-32, -26), rand(2, 4), g.nav);
      }
      if (!e.agent) continue;
      const a = e.agent;
      if (e.status === 'arriving') {
        if (a.arrived || e.statusT > 40) {
          if (g.building.hasRoom('lockers')) {
            e.status = 'lockers';
            e.statusT = 0;
            a.goTo(-2.2, -15 + rand(-1, 1), g.nav);
          } else {
            e.status = 'working';
            e.statusT = 0;
          }
        }
      } else if (e.status === 'lockers') {
        if (a.arrived) {
          a.hidden = true;
          if (e.statusT > 6) {
            a.hidden = false;
            es.morale = Math.min(100, es.morale + 2);
            e.status = 'working';
            e.statusT = 0;
          }
        } else if (e.statusT > 40) {
          e.status = 'working';
        }
      } else if (e.status === 'leaving') {
        if (a.arrived || e.statusT > 60) {
          a.dispose();
          e.agent = null;
          e.status = 'off';
        }
      } else if (e.status === 'break') {
        if (a.arrived) a.human.pose = g.building.hasRoom('breakroom') ? 'sit' : 'idle';
        es.energy = Math.min(100, es.energy + dt * (g.building.hasRoom('breakroom') ? 1.6 : 0.6) * 1.45);
        if (es.energy >= 98) {
          a.human.pose = 'idle';
          e.status = 'working';
          e.statusT = 0;
        }
      } else if (e.status === 'wc') {
        if (a.arrived) {
          a.hidden = true;
          if (e.statusT > 8) {
            a.hidden = false;
            g.state.wcDirt.staff = Math.min(1, g.state.wcDirt.staff + 0.06);
            e.status = 'working';
            e.statusT = 0;
          }
        } else if (e.statusT > 40) e.status = 'working';
      } else if (e.status === 'working') {
        // wages
        g.sim.wagesToday += (es.wage / 60) * dt * (s.phase === 'prep' ? 0 : g.sim.clockRate());
        // energy
        es.energy = Math.max(0, es.energy - dt * g.sim.clockRate() * 0.28 * (1.2 - es.skill * 0.05));
        const onBreak = this.list.filter((o) => o !== e && o.s.role === es.role && o.status === 'break').length;
        const sameRole = this.list.filter((o) => o.s.role === es.role && o.onDuty).length;
        const breakOk = es.energy < 8 || onBreak < Math.max(1, Math.floor(sameRole / 2));
        if (es.energy < e.breakAt && !e.carrying && breakOk) {
          this.release(e);
          e.status = 'break';
          e.statusT = 0;
          if (g.building.hasRoom('breakroom')) a.goTo(-12.2 + rand(-0.8, 0.8), -21.3 + rand(-0.4, 0.4), g.nav);
          else a.stop();
        } else if (g.building.hasRoom('staffwc') && e.statusT > e.nextWC && !e.carrying && !e.task) {
          e.nextWC = e.statusT + rand(200, 400);
          this.release(e);
          e.status = 'wc';
          e.statusT = 0;
          a.goTo(-1.2, -20.2, g.nav);
        } else this.work(e, dt);
      }
      a.update(dt, g.nav, g.col, others, g.player.pos);
    }
    this.uiTimer -= dt;
  }

  // ------------------------------------------------------------------ roles
  private work(e: Employee, dt: number) {
    switch (e.s.role) {
      case 'cashier': return this.cashier(e, dt);
      case 'stocker': return this.stocker(e, dt, (p) => true);
      case 'baker': return this.stocker(e, dt, (p) => p.category === 'bakery', true);
      case 'butcher': return this.stocker(e, dt, (p) => p.category === 'meat' || p.category === 'fish');
      case 'cleaner': return this.cleaner(e, dt);
      case 'warehouse': return this.warehouse(e, dt);
      case 'security': return this.security(e, dt);
      case 'technician': return this.technician(e, dt);
      case 'deptmanager': return this.deptManager(e, dt);
      case 'manager': return this.manager(e, dt);
    }
  }

  private cashier(e: Employee, dt: number) {
    const g = this.g;
    const a = e.agent!;
    if (!e.station || !g.furniture.items.has(e.station.s.uid)) {
      e.station = g.checkout.freeCounterFor(e.s.uid);
      e.atStation = false;
      if (!e.station) {
        this.wander(e, dt);
        return;
      }
      const p = g.checkout.cashierSpot(e.station);
      a.goTo(p.x, p.z, g.nav);
    }
    if (!e.atStation && a.arrived) {
      e.atStation = true;
      a.faceYaw = e.station.s.ry;
    }
    if (e.atStation) a.human.pose = g.checkout.hasWaiting(e.station) ? 'scan' : 'idle';
  }

  private findNeed(filter: (p: ReturnType<typeof PRODUCT_MAP.get> & {}) => boolean): { ref: SlotRef; box: BoxRT } | null {
    const g = this.g;
    let best: { ref: SlotRef; box: BoxRT; score: number } | null = null;
    for (const ref of g.shelves.refs.values()) {
      const pid = ref.stock.pid;
      if (!pid) continue;
      const p = PRODUCT_MAP.get(pid)!;
      if (!filter(p)) continue;
      const cap = g.shelves.capacity(ref, pid);
      if (ref.stock.count > cap * 0.5) continue;
      if (this.list.some((o) => o.task?.ref === ref)) continue;
      const boxes = g.boxes.byPid(pid).filter((b) => b.s.count > 0 && !b.held && !this.list.some((o) => o.task?.box === b) && g.carry !== b);
      if (!boxes.length) continue;
      const box = boxes.reduce((x, y) => (x.pos.distanceTo(ref.slot.access) < y.pos.distanceTo(ref.slot.access) ? x : y));
      const score = ref.stock.count / cap;
      if (!best || score < best.score) best = { ref, box, score };
    }
    return best;
  }

  private stocker(e: Employee, dt: number, filter: (p: any) => boolean, bake = false) {
    const g = this.g;
    const a = e.agent!;
    const t = e.task;
    if (!t) {
      // expired items first
      for (const ref of g.shelves.refs.values()) {
        if (g.shelves.expiredCount(ref) > 0 && ref.stock.pid && filter(PRODUCT_MAP.get(ref.stock.pid)) && !this.list.some((o) => o.task?.ref === ref)) {
          e.task = { kind: 'expired', step: 0, t: 0, ref };
          a.goTo(ref.slot.access.x, ref.slot.access.z, g.nav);
          return;
        }
      }
      if (bake && g.bakery.canBake()) {
        const oven = g.bakery.oven();
        if (oven) {
          e.task = { kind: 'bake', step: 0, t: 0, f: oven };
          const p = g.furniture.local(oven, 0, 0, 1.0);
          a.goTo(p.x, p.z, g.nav);
          return;
        }
      }
      const need = this.findNeed(filter);
      if (!need) {
        this.wander(e, dt);
        return;
      }
      e.task = { kind: 'stock', step: 0, t: 0, ref: need.ref, box: need.box };
      a.goTo(need.box.pos.x, need.box.pos.z, g.nav);
      return;
    }
    t.t += dt * e.speedMul;
    if (t.kind === 'expired') {
      if (a.arrived) {
        a.faceYaw = t.ref!.slot.face;
        a.human.pose = 'reach';
        a.human.reachHeight = t.ref!.slot.center.y;
        if (t.t > 2) {
          g.shelves.removeExpired(t.ref!);
          a.human.pose = 'idle';
          e.task = null;
        }
      }
      return;
    }
    if (t.kind === 'bake') {
      if (a.arrived) {
        a.human.pose = 'reach';
        a.human.reachHeight = 1.2;
        if (t.t > 3) {
          g.bakery.startBake(t.f!);
          a.human.pose = 'idle';
          e.task = null;
        }
      }
      return;
    }
    const box = t.box!;
    const ref = t.ref!;
    if (t.step === 0) {
      if (!g.boxes.items.has(box.s.uid) || box.held || g.carry === box) { e.task = null; return; }
      if (a.arrived || a.pos.distanceTo(box.pos) < 1.0) {
        // pick it up
        if (box.s.rack) this.g.freeRackSpot(box);
        g.boxes.setHeld(box, true);
        e.carrying = box;
        a.human.setProp('box');
        a.human.pose = 'carry';
        t.step = 1;
        a.goTo(ref.slot.access.x, ref.slot.access.z, g.nav);
      } else if (t.t > 30) e.task = null;
    } else if (t.step === 1) {
      if (a.arrived) {
        a.faceYaw = ref.slot.face;
        a.human.pose = 'reach';
        a.human.reachHeight = ref.slot.center.y;
        t.step = 2;
        t.t = 0;
      }
    } else if (t.step === 2) {
      if (t.t > 0.28) {
        t.t = 0;
        const placed = box.s.count > 0 && g.shelves.canPlace(ref, box.def!.id).ok ? g.shelves.place(ref, box.def!.id, 1, box.s.exp) : 0;
        if (placed) {
          box.s.count -= placed;
          if (Math.random() < 0.3) audio.play('pop', ref.slot.center, 0.3);
        } else {
          // done: dispose or return the box
          t.step = 3;
          a.human.pose = 'carry';
          if (box.s.count <= 0) {
            const bin = this.nearestRecycler(a.pos);
            if (bin) {
              const p = g.furniture.local(bin, 0, 0, bin.def.size[1] / 2 + 0.5);
              a.goTo(p.x, p.z, g.nav);
            } else {
              t.step = 4;
            }
          } else {
            const spot = g.findRackSpot(a.pos);
            if (spot) {
              t.f = spot.f;
              t.pos = spot.pos;
              (t as any).spot = spot.spot;
              a.goTo(spot.access.x, spot.access.z, g.nav);
            } else t.step = 4;
          }
        }
      }
    } else if (t.step === 3) {
      if (a.arrived) {
        if (box.s.count <= 0) {
          const bin = this.nearestRecycler(a.pos);
          if (bin && bin.def.interact === 'trash') bin.s.fill = Math.min(10, (bin.s.fill ?? 0) + 1);
          else if (bin) g.sim.earn(0.1, 'recycling');
          e.carrying = null;
          g.boxes.remove(box.s.uid);
          g.removeBoxState(box.s.uid);
        } else if (t.f && (t as any).spot !== undefined) {
          e.carrying = null;
          g.boxes.setHeld(box, false);
          g.putOnRack(box, t.f, (t as any).spot);
        } else t.step = 4;
        if (t.step !== 4) {
          a.human.setProp(null);
          a.human.pose = 'idle';
          e.task = null;
        }
      }
    }
    if (t.step === 4) {
      // drop it here
      e.carrying = null;
      g.boxes.setHeld(box, false);
      g.boxes.placeAt(box, a.pos.x + 0.4, 0.02, a.pos.z + 0.4, a.yaw);
      a.human.setProp(null);
      a.human.pose = 'idle';
      e.task = null;
    }
  }

  private nearestRecycler(from: THREE.Vector3): FurnRT | null {
    const g = this.g;
    let best: FurnRT | null = null;
    let bd = Infinity;
    for (const f of g.furniture.items.values()) {
      const it = f.def.interact;
      if (it !== 'recycle' && it !== 'baler' && !(it === 'trash' && (f.s.fill ?? 0) < 9)) continue;
      if (f.s.room && !g.building.hasRoom(f.s.room)) continue;
      const d = f.box.getCenter(new THREE.Vector3()).distanceTo(from) * (it === 'trash' ? 1.4 : 1);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  private cleaner(e: Employee, dt: number) {
    const g = this.g;
    const a = e.agent!;
    let t = e.task;
    if (!t) {
      // priorities: spills > full bins > restrooms > dirty floor > fridge glass
      const spill = g.state.spills.find((sp) => !this.list.some((o) => o.task?.spill === sp.uid) && g.building.isIndoors(sp.x, sp.z));
      if (spill) {
        t = e.task = { kind: 'spill', step: 0, t: 0, spill: spill.uid };
        a.goTo(spill.x, spill.z, g.nav);
        a.human.setProp('mop');
        return;
      }
      const bin = [...g.furniture.items.values()].find((f) => f.def.interact === 'trash' && (f.s.fill ?? 0) >= 7 && !this.list.some((o) => o.task?.f === f));
      if (bin) {
        t = e.task = { kind: 'bin', step: 0, t: 0, f: bin };
        const p = g.furniture.local(bin, 0, 0, 0.7);
        a.goTo(p.x, p.z, g.nav);
        return;
      }
      for (const which of ['cust', 'staff'] as const) {
        const room = which === 'cust' ? 'custwc' : 'staffwc';
        if (g.state.wcDirt[which] > 0.45 && g.building.hasRoom(room)) {
          t = e.task = { kind: 'wc', step: 0, t: 0, pos: new THREE.Vector3(which === 'cust' ? -2.0 : -1.2, 0, which === 'cust' ? -24.5 : -20.4) };
          (t as any).which = which;
          a.goTo(t.pos!.x, t.pos!.z, g.nav);
          return;
        }
      }
      const litter = [...g.boxes.items.values()].find((b) => b.s.kind === 'litter' && !b.held && !this.list.some((o) => o.task?.box === b));
      if (litter) {
        t = e.task = { kind: 'litter', step: 0, t: 0, box: litter };
        a.goTo(litter.pos.x, litter.pos.z, g.nav);
        return;
      }
      const spot = g.cleaning.dirtiestSpot();
      if (spot && spot.dirt > 0.25) {
        t = e.task = { kind: 'floor', step: 0, t: 0, pos: new THREE.Vector3(spot.x, 0, spot.z) };
        a.goTo(spot.x, spot.z, g.nav);
        a.human.setProp('mop');
        return;
      }
      const fridge = [...g.furniture.items.values()].find((f) => f.def.coolTarget !== undefined && (f.s.dirt ?? 0) > 0.4 && !this.list.some((o) => o.task?.f === f));
      if (fridge) {
        t = e.task = { kind: 'glass', step: 0, t: 0, f: fridge };
        const p = g.furniture.local(fridge, 0, 0, fridge.def.size[1] / 2 + 0.5);
        a.goTo(p.x, p.z, g.nav);
        return;
      }
      a.human.setProp(null);
      this.wander(e, dt);
      return;
    }
    t.t += dt * e.speedMul;
    if (!a.arrived && t.t < 40) return;
    switch (t.kind) {
      case 'spill':
        a.human.pose = 'mop';
        if (t.t > 4) {
          g.cleaning.removeSpill(t.spill!);
          a.human.pose = 'idle';
          e.task = null;
        }
        break;
      case 'floor':
        a.human.pose = 'mop';
        g.cleaning.mopAt(a.pos.x, a.pos.z, dt * e.speedMul * 0.8);
        if (t.t > 6) {
          a.human.pose = 'idle';
          e.task = null;
        }
        break;
      case 'bin':
        if (t.step === 0) {
          a.human.pose = 'reach';
          a.human.reachHeight = 0.8;
          if (t.t > 1.5) {
            t.f!.s.fill = 0;
            a.human.setProp('bag', '#1f2a24');
            a.human.pose = 'idle';
            t.step = 1;
            const d = g.nearestDumpster(a.pos);
            a.goTo(d.x, d.z, g.nav);
          }
        } else if (a.arrived || t.t > 40) {
          a.human.setProp(null);
          audio.play('drop', a.pos, 0.5);
          e.task = null;
        }
        break;
      case 'wc':
        a.human.pose = 'reach';
        a.human.reachHeight = 0.6;
        if (t.t > 5) {
          g.state.wcDirt[(t as any).which as 'cust' | 'staff'] = 0;
          a.human.pose = 'idle';
          e.task = null;
        }
        break;
      case 'litter':
        if (g.boxes.items.has(t.box!.s.uid)) {
          g.boxes.remove(t.box!.s.uid);
          g.removeBoxState(t.box!.s.uid);
        }
        e.task = null;
        break;
      case 'glass':
        a.human.pose = 'reach';
        a.human.reachHeight = 1.2;
        if (t.t > 2.5) {
          t.f!.s.dirt = 0;
          a.human.pose = 'idle';
          e.task = null;
        }
        break;
    }
  }

  private warehouse(e: Employee, dt: number) {
    const g = this.g;
    const a = e.agent!;
    const t = e.task;
    if (!t) {
      // boxes lying around (not on racks) → racks; empty boxes → recycling
      const loose = [...g.boxes.items.values()].filter((b) => !b.held && !b.s.rack && (b.s.kind ?? 'box') === 'box' && g.carry !== b && !this.list.some((o) => o.task?.box === b));
      const empty = loose.find((b) => b.s.count <= 0);
      const full = g.building.hasRoom('storage') ? loose.find((b) => b.s.count > 0 && (g.building.areaAt(b.pos.x, b.pos.z) === 'outside' || g.building.areaAt(b.pos.x, b.pos.z) === 'storage' || g.building.areaAt(b.pos.x, b.pos.z) === 'storage2')) : null;
      const target = empty ?? full;
      if (!target) {
        this.wander(e, dt, new THREE.Vector3(-4, 0, -6));
        return;
      }
      e.task = { kind: target.s.count <= 0 ? 'recycle' : 'rack', step: 0, t: 0, box: target };
      a.goTo(target.pos.x, target.pos.z, g.nav);
      return;
    }
    t.t += dt * e.speedMul;
    const box = t.box!;
    if (t.step === 0) {
      if (!g.boxes.items.has(box.s.uid) || box.held) { e.task = null; return; }
      if (a.arrived || a.pos.distanceTo(box.pos) < 1.1) {
        g.boxes.setHeld(box, true);
        e.carrying = box;
        a.human.setProp('box');
        a.human.pose = 'carry';
        t.step = 1;
        if (t.kind === 'recycle') {
          const bin = this.nearestRecycler(a.pos);
          if (!bin) { t.step = 9; return; }
          t.f = bin;
          const p = g.furniture.local(bin, 0, 0, bin.def.size[1] / 2 + 0.5);
          a.goTo(p.x, p.z, g.nav);
        } else {
          const spot = g.findRackSpot(a.pos);
          if (!spot) { t.step = 9; return; }
          t.f = spot.f;
          (t as any).spot = spot.spot;
          a.goTo(spot.access.x, spot.access.z, g.nav);
        }
      } else if (t.t > 40) e.task = null;
    } else if (t.step === 1 && (a.arrived || t.t > 45)) {
      e.carrying = null;
      a.human.setProp(null);
      a.human.pose = 'idle';
      if (t.kind === 'recycle') {
        if (t.f!.def.interact === 'trash') t.f!.s.fill = Math.min(10, (t.f!.s.fill ?? 0) + 1);
        else g.sim.earn(t.f!.def.interact === 'baler' ? 0.3 : 0.1, 'recycling');
        g.boxes.remove(box.s.uid);
        g.removeBoxState(box.s.uid);
      } else {
        g.boxes.setHeld(box, false);
        if (!g.putOnRack(box, t.f!, (t as any).spot)) g.boxes.placeAt(box, a.pos.x + 0.3, 0.02, a.pos.z + 0.3, 0);
      }
      e.task = null;
    }
    if (t.step === 9) {
      e.carrying = null;
      g.boxes.setHeld(box, false);
      g.boxes.placeAt(box, a.pos.x + 0.3, 0.02, a.pos.z + 0.3, 0);
      a.human.setProp(null);
      a.human.pose = 'idle';
      e.task = null;
    }
  }

  private security(e: Employee, dt: number) {
    const g = this.g;
    const a = e.agent!;
    const door = g.building.doorById('d_entr1')!.def;
    if (a.arrived && Math.random() < dt * 0.05) {
      const p = new THREE.Vector3(door.x + rand(-3, 3), 0, rand(-4, -1.5));
      a.goTo(p.x, p.z, g.nav);
    }
    if (a.arrived) a.human.pose = 'idle';
  }

  private technician(e: Employee, dt: number) {
    const g = this.g;
    const a = e.agent!;
    const t = e.task;
    if (!t) {
      if (g.power.outage && g.building.hasRoom('electrical')) {
        e.task = { kind: 'breaker', step: 0, t: 0 };
        a.goTo(-14.8, -28.8, g.nav);
        return;
      }
      const broken = [...g.furniture.items.values()].find((f) => f.s.broken && !this.list.some((o) => o.task?.f === f));
      const worn = broken ?? [...g.furniture.items.values()].find((f) => f.def.breaks && f.s.cond < 55 && !this.list.some((o) => o.task?.f === f));
      if (!worn) {
        this.wander(e, dt);
        return;
      }
      e.task = { kind: worn.s.broken ? 'repair' : 'service', step: 0, t: 0, f: worn };
      const p = g.furniture.local(worn, 0, 0, worn.def.size[1] / 2 + 0.55);
      a.goTo(p.x, p.z, g.nav);
      return;
    }
    t.t += dt * e.speedMul;
    if (!a.arrived && t.t < 45) return;
    a.human.pose = 'reach';
    a.human.reachHeight = 0.9;
    if (t.kind === 'breaker' && t.t > 3) {
      g.power.resetBreaker();
      e.task = null;
      a.human.pose = 'idle';
    } else if (t.kind !== 'breaker' && t.t > 5) {
      const f = t.f!;
      if (f.s.broken) {
        g.sim.spend(g.actions.repairCost(f), 'repairs');
        g.power.repair(f);
        g.ui.toast(`${e.s.name} repaired the ${f.def.name}`, 'good', '🔧');
      } else f.s.cond = 100;
      if (Math.random() < 0.5) audio.play('repair', f.box.getCenter(new THREE.Vector3()), 0.5);
      e.task = null;
      a.human.pose = 'idle';
    }
  }

  private deptManager(e: Employee, dt: number) {
    this.stocker(e, dt, () => true);
  }

  private manager(e: Employee, dt: number) {
    const g = this.g;
    if (g.state.phase === 'prep' && g.state.minutes >= g.state.openHour * 60) g.sim.openStore();
    g.orders.autoOrder(dt);
    this.wander(e, dt, new THREE.Vector3(-11, 0, -15));
  }

  private wander(e: Employee, dt: number, home?: THREE.Vector3) {
    const g = this.g;
    const a = e.agent!;
    if (a.arrived) {
      a.human.pose = 'idle';
      if (Math.random() < dt * 0.08) {
        const [x0, z0, x1, z1] = g.building.salesBounds();
        const p = home ? home.clone().add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2))) : new THREE.Vector3(rand(x0 + 1, x1 - 1), 0, rand(z0 + 1, z1 - 1));
        a.goTo(p.x, p.z, g.nav);
      }
    }
  }

  /** Daily HR bookkeeping. */
  dayStart() {
    const g = this.g;
    for (const e of this.list) {
      e.s.daysWorked++;
      e.s.energy = 100;
      e.s.sick = chance(0.03) && !g.state.tutorial;
      let mor = e.s.morale;
      if (g.building.hasRoom('breakroom')) mor += 2; else mor -= 2;
      if (g.building.hasRoom('lockers')) mor += 1;
      if (g.building.hasRoom('staffwc')) mor += 1; else mor -= 1;
      e.s.morale = clamp(mor, 10, 100);
      if (e.s.sick) g.ui.toast(`${e.s.name} called in sick today 🤒`, 'bad', '🤒', 4000);
      if (e.s.morale < 20 && chance(0.3)) {
        g.ui.toast(`${e.s.name} quit due to low morale!`, 'bad', '😞', 5000);
        this.fire(e.s.uid);
      }
    }
    this.refreshCandidates();
  }

  clearAgents() {
    for (const e of this.list) {
      this.release(e);
      e.agent?.dispose();
      e.agent = null;
      e.status = 'off';
    }
  }
}
