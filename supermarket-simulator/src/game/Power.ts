// Electricity, HVAC & temperatures, cooler temperatures / spoilage, breakdowns and power outages.
import * as THREE from 'three';
import type { Game } from './Game';
import type { FurnRT } from './Furniture';
import { clamp, chance, rand } from '../core/util';
import { audio } from '../core/Audio';

export class PowerSystem {
  currentKW = 0;
  outdoorTemp = 18;
  indoorTemp = 21;
  private minuteAcc = 0;
  private hvacBroken = false;
  private alarmT = 0;

  constructor(private g: Game) {
    g.sim.on('minute', () => this.tickMinute());
    g.sim.on('hour', () => this.tickHour());
  }

  get outage() { return this.g.state.power.outageMin > 0 || this.g.state.power.tripped; }
  get tripped() { return this.g.state.power.tripped; }

  capacityKW() {
    const s = this.g.state;
    return 6 + s.plots.length * 2.2 + (s.rooms.includes('electrical') ? 6 : 0);
  }

  private computeKW() {
    const g = this.g;
    const s = g.state;
    let kw = 0;
    const led = s.upgrades.includes('led') ? 0.6 : 1;
    const lightsOn = s.phase !== 'night' || g.building.isIndoors(g.player.pos.x, g.player.pos.z);
    if (lightsOn) kw += (s.plots.length * 0.32 + s.rooms.length * 0.08) * led;
    for (const f of g.furniture.items.values()) {
      if (f.s.broken || !f.def.power) continue;
      if (f.s.room && !g.building.hasRoom(f.s.room)) continue;
      if (f.def.interact === 'oven') kw += f.s.bake ? f.def.power : 0.05;
      else kw += f.def.power;
    }
    const hvacFactor = s.upgrades.includes('hvac2') ? 0.65 : 1;
    if (!this.hvacBroken) kw += Math.abs(this.outdoorTemp - 21) * 0.025 * s.plots.length * hvacFactor;
    return kw;
  }

  private outdoorFor(minutes: number) {
    const h = minutes / 60;
    const day = this.g.state.day;
    const season = Math.sin((day / 28) * Math.PI * 2) * 6;
    let t = 15 + season + Math.sin(((h - 9) / 24) * Math.PI * 2) * 6;
    if (this.g.events.has('heatwave')) t += 10;
    if (this.g.events.has('coldsnap')) t -= 14;
    if (this.g.state.weather === 'rain') t -= 3;
    return t;
  }

  private tickMinute() {
    const g = this.g;
    const s = g.state;
    this.outdoorTemp = this.outdoorFor(s.minutes);
    const out = this.outage && !s.upgrades.includes('generator');
    this.currentKW = out ? 0 : this.computeKW();
    g.sim.kwhToday += this.currentKW / 60;
    // indoor temperature
    const hvac = g.furniture.byDef('hvac')[0];
    this.hvacBroken = !!hvac && hvac.s.broken;
    const target = out || this.hvacBroken ? this.outdoorTemp : 21;
    this.indoorTemp += (target - this.indoorTemp) * (out || this.hvacBroken ? 0.01 : 0.05);
    // outage countdown (grid)
    if (s.power.outageMin > 0) {
      s.power.outageMin--;
      if (s.power.outageMin <= 0 && !s.power.tripped) this.restore('The power is back!');
    }
    // overload trips the breaker
    if (!this.outage && this.currentKW > this.capacityKW() && chance(0.02)) {
      s.power.tripped = true;
      this.applyPower();
      g.ui.toast('Overload! The main breaker tripped. Reset it in the Electrical room.', 'bad', '⚡', 5000);
      audio.play('buzz');
    }
    if (s.power.tripped && !g.building.hasRoom('electrical')) {
      // no access to the panel: the landlord's electrician fixes it after a while
      s.power.outageMin = Math.max(s.power.outageMin, 1);
      if (chance(1 / 25)) {
        s.power.tripped = false;
        s.power.outageMin = 0;
        g.sim.spend(40, 'repairs');
        this.restore('An electrician reset the breaker ($40).');
      }
    }
    // coolers
    for (const f of g.furniture.items.values()) {
      if (f.def.coolTarget === undefined) continue;
      const tgt = f.def.coolTarget;
      const working = !f.s.broken && !out;
      const ambient = this.indoorTemp;
      const tNow = f.s.temp ?? tgt;
      f.s.temp = working ? tNow + (tgt - tNow) * 0.12 : tNow + (ambient - tNow) * 0.02;
      const safe = tgt < -5 ? -10 : tgt + 4.5;
      if (f.s.temp > safe) {
        f.s.warmMin = (f.s.warmMin ?? 0) + 1;
        if (f.s.warmMin === 60) this.spoil(f);
      } else f.s.warmMin = 0;
    }
  }

  private spoil(f: FurnRT) {
    const g = this.g;
    let n = 0;
    for (const sl of f.slots) {
      const ref = g.shelves.refs.get(`${f.s.uid}:${sl.index}`);
      if (ref && ref.stock.count > 0) {
        g.shelves.spoil(ref);
        n += ref.stock.count;
      }
    }
    if (n > 0) {
      g.ui.toast(`${n} products in the ${f.def.name} spoiled (too warm)! Remove them.`, 'bad', '🌡️', 5000);
      audio.play('alarm', f.box.getCenter(new THREE.Vector3()), 0.6);
    }
  }

  private tickHour() {
    const g = this.g;
    const s = g.state;
    if (s.phase === 'prep') return;
    for (const f of g.furniture.items.values()) {
      if (!f.def.breaks || f.s.broken) continue;
      if (f.s.room && !g.building.hasRoom(f.s.room)) continue;
      f.s.cond = Math.max(0, f.s.cond - rand(0.6, 1.8));
      const p = Math.pow(1 - f.s.cond / 100, 2) * 0.07;
      if (s.day > 2 && chance(p)) this.breakDown(f);
    }
  }

  breakDown(f: FurnRT) {
    const g = this.g;
    f.s.broken = true;
    g.furniture.updateGlow(f);
    const center = f.box.getCenter(new THREE.Vector3());
    g.ui.toast(`${f.def.name} broke down! Repair it (hold ✋) or hire a technician.`, 'bad', '🔧', 5000);
    audio.play('buzz', center);
    g.markers.add('broken' + f.s.uid, center.clone().setY(f.def.size[2] + 0.4), '⚠️');
  }

  repair(f: FurnRT) {
    f.s.broken = false;
    f.s.cond = 100;
    this.g.furniture.updateGlow(f);
    this.g.markers.remove('broken' + f.s.uid);
  }

  startOutage(minutes: number) {
    const s = this.g.state;
    s.power.outageMin = minutes;
    this.applyPower();
    if (s.upgrades.includes('generator')) this.g.ui.toast('Power outage! The backup generator kicked in.', 'info', '🔋', 4000);
    else this.g.ui.toast(`Power outage in the area (~${Math.round(minutes / 60 * 10) / 10} h). Coolers are warming up!`, 'bad', '⚡', 5000);
    audio.play('buzz');
  }

  resetBreaker() {
    const s = this.g.state;
    if (s.power.tripped) {
      s.power.tripped = false;
      if (s.power.outageMin <= 1) s.power.outageMin = 0;
      this.restore('Breaker reset. Power restored!');
    } else if (s.power.outageMin > 0) {
      if (s.upgrades.includes('generator')) this.restore('Generator running.');
      else this.g.ui.toast('This is a grid outage — wait for the power company (or buy a generator).', 'info', '⚡', 4000);
    }
  }

  private restore(msg: string) {
    this.applyPower();
    this.g.ui.toast(msg, 'good', '💡');
    audio.play('unlock');
  }

  applyPower() {
    const on = !this.outage || this.g.state.upgrades.includes('generator');
    this.g.building.setPower(on);
    this.g.furniture.setPower(on);
    this.g.daylight.powerOn = on;
  }

  update(dt: number) {
    // nearby cooler hum + warning beep for warm coolers
    const g = this.g;
    let hum = 0;
    for (const f of g.furniture.items.values()) {
      if (f.def.coolTarget === undefined || f.s.broken || this.outage) continue;
      const d = f.box.getCenter(new THREE.Vector3()).distanceTo(g.player.pos);
      hum = Math.max(hum, clamp(1 - d / 6, 0, 1));
    }
    this.alarmT -= dt;
    audio.setLoop('hum', hum * 0.25);
  }
}
