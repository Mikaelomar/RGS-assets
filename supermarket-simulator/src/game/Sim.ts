// Business simulation core: money ledger, XP/levels, clock, open/close and the end-of-day cycle.
import * as THREE from 'three';
import type { Game } from './Game';
import { CONFIG } from '../data/config';
import { xpToNext, levelReward, unlocksAt, MAX_LEVEL } from '../data/levels';
import { newDayStats, type DayStats } from './state';
import { WEEKDAYS, round2, Emitter } from '../core/util';
import { audio } from '../core/Audio';
import { haptic } from '../core/Platform';

export interface SimEvents {
  hour: number;
  minute: number;
  open: boolean;
  close: void;
  dayEnd: DayStats;
  dayStart: number;
  levelUp: number;
  money: number;
}

export class Sim extends Emitter<SimEvents> {
  private minAcc = 0;
  /** kWh used today (filled by Power system) */
  kwhToday = 0;
  wagesToday = 0;

  constructor(private g: Game) { super(); }

  get s() { return this.g.state; }
  get weekday() { return WEEKDAYS[(this.s.day - 1) % 7]; }
  get isWeekend() { return (this.s.day - 1) % 7 >= 5; }

  // ------------------------------------------------------------- money
  canAfford(v: number) { return this.s.money >= v - 1e-6; }

  spend(v: number, cat: string): boolean {
    if (v <= 0) return true;
    this.s.money = round2(this.s.money - v);
    const t = this.s.today;
    t.expenses[cat] = round2((t.expenses[cat] ?? 0) + v);
    this.emit('money', this.s.money);
    return true;
  }

  /** Spend only if affordable. */
  pay(v: number, cat: string): boolean {
    if (!this.canAfford(v)) {
      this.g.ui.toast(`Not enough money (need $${v.toFixed(2)})`, 'bad', '💸');
      audio.play('error');
      return false;
    }
    return this.spend(v, cat);
  }

  earn(v: number, cat: string, at?: THREE.Vector3) {
    if (v <= 0) return;
    this.s.money = round2(this.s.money + v);
    const t = this.s.today;
    if (cat === 'sales') t.revenue = round2(t.revenue + v);
    else if (cat === 'tips') t.tips = round2(t.tips + v);
    else t.income[cat] = round2((t.income[cat] ?? 0) + v);
    if (at) this.g.ui.floaty(at, `+$${v.toFixed(2)}`);
    this.emit('money', this.s.money);
  }

  // ------------------------------------------------------------- xp / level
  addXP(n: number, at?: THREE.Vector3) {
    if (n <= 0 || this.s.level >= MAX_LEVEL) return;
    this.s.xp += n;
    this.s.today.xp += n;
    if (at && n >= 1) this.g.ui.floaty(at.clone().add(new THREE.Vector3(0, 0.35, 0)), `+${Math.round(n)} XP`, 'blue');
    while (this.s.level < MAX_LEVEL && this.s.xp >= xpToNext(this.s.level)) {
      this.s.xp -= xpToNext(this.s.level);
      this.s.level++;
      const reward = levelReward(this.s.level);
      this.s.money = round2(this.s.money + reward);
      this.s.today.income.levelup = round2((this.s.today.income.levelup ?? 0) + reward);
      audio.play('levelup');
      haptic('heavy');
      this.emit('levelUp', this.s.level);
    }
  }

  xpFrac() { return this.s.level >= MAX_LEVEL ? 1 : this.s.xp / xpToNext(this.s.level); }
  unlocks(level: number) { return unlocksAt(level); }

  // ------------------------------------------------------------- clock
  get hour() { return this.s.minutes / 60; }
  get isOpen() { return this.s.open; }

  openStore(): boolean {
    const s = this.s;
    if (s.open) return false;
    if (s.phase === 'night' || s.minutes >= s.closeHour * 60 - 30) {
      this.g.ui.toast('Too late to open today. End the day and open tomorrow!', 'bad', '🌙');
      return false;
    }
    s.open = true;
    s.phase = 'open';
    this.g.building.setOpenSign(true);
    audio.play('chime');
    this.emit('open', true);
    return true;
  }

  closeStore(auto = false) {
    const s = this.s;
    if (!s.open) return;
    s.open = false;
    s.phase = s.minutes >= s.closeHour * 60 ? 'night' : 'closing';
    this.g.building.setOpenSign(false);
    audio.play('chime');
    this.g.ui.toast(auto ? 'Closing time! The store is now closed.' : 'Store closed.', 'info', '🔒');
    this.emit('close', undefined);
    this.emit('open', false);
  }

  /** Game minutes per real second right now. */
  clockRate(): number {
    const s = this.s;
    if (s.phase === 'open') return CONFIG.minutesPerSecond;
    if (s.phase === 'closing' || s.phase === 'night') return s.open ? CONFIG.minutesPerSecond : CONFIG.nightMinutesPerSecond;
    return 0;
  }

  update(dt: number) {
    const s = this.s;
    s.playtime += dt;
    const rate = this.clockRate();
    if (rate <= 0) return;
    this.minAcc += rate * dt;
    while (this.minAcc >= 1) {
      this.minAcc -= 1;
      this.tickMinute();
    }
  }

  private tickMinute() {
    const s = this.s;
    s.minutes += 1;
    this.emit('minute', s.minutes);
    if (s.minutes % 60 === 0) this.emit('hour', s.minutes / 60);
    if (s.open && s.minutes >= s.closeHour * 60) this.closeStore(true);
    if (!s.open && s.phase === 'closing' && s.minutes >= s.closeHour * 60) s.phase = 'night';
    // player energy drains slowly over time
    s.energy = Math.max(0, s.energy - CONFIG.energyDrainPerMin);
    if (s.minutes >= 26 * 60) {
      // 2 AM: forced end of day
      this.g.ui.toast('It is 2 AM… you fell asleep at work!', 'bad', '😴');
      this.g.requestEndDay(true);
    }
  }

  /** Computes and charges the daily bills. Returns the bills breakdown. */
  chargeDailyBills(): Record<string, number> {
    const s = this.s;
    const bills: Record<string, number> = {};
    bills.rent = s.plots.length * CONFIG.rentPerPlot + s.rooms.filter((r) => r !== 'corridor').length * CONFIG.rentPerRoom;
    bills.insurance = CONFIG.insurancePerDay + Math.round(s.plots.length * 0.8);
    const elecMul = s.upgrades.includes('solar') ? 0.7 : 1;
    bills.electricity = round2(this.kwhToday * CONFIG.electricityPrice * elecMul);
    bills.water = round2(2 + s.today.customers * CONFIG.waterPerCustomer + (s.rooms.includes('custwc') ? 3 : 0) + (s.rooms.includes('staffwc') ? 1 : 0));
    bills.wages = round2(this.wagesToday);
    if (s.loan > 0) bills.interest = round2(s.loan * CONFIG.loanInterestDaily);
    if (s.day % 7 === 0) {
      const week = [...s.history.slice(-6), s.today];
      let profit = 0;
      for (const d of week) profit += dayProfit(d);
      profit -= Object.values(bills).reduce((a, b) => a + b, 0);
      if (profit > 0) bills.taxes = round2(profit * CONFIG.taxRate);
    }
    for (const [k, v] of Object.entries(bills)) if (v > 0) this.spend(v, k);
    return bills;
  }

  /** Start a fresh day (after the summary). */
  startNewDay() {
    const s = this.s;
    s.history.push(s.today);
    if (s.history.length > 120) s.history.shift();
    s.totals.days++;
    s.day += 1;
    s.minutes = s.openHour * 60;
    s.phase = 'prep';
    s.open = false;
    s.energy = 100;
    s.today = newDayStats(s.day);
    this.kwhToday = 0;
    this.wagesToday = 0;
    this.g.shelves.setDay(s.day);
    this.g.building.setOpenSign(false);
    this.emit('dayStart', s.day);
  }
}

/** Investments / balance-sheet moves that are not operating costs. */
export const CAPEX = new Set(['stock', 'furniture', 'expansion', 'rooms', 'licenses', 'upgrades', 'loanRepay']);
export const NON_PROFIT_INCOME = new Set(['loan']);

/** Operating profit: sales - cost of goods sold - operating expenses. */
export function dayProfit(d: DayStats): number {
  let inc = d.revenue + d.tips;
  for (const [k, v] of Object.entries(d.income)) if (!NON_PROFIT_INCOME.has(k)) inc += v;
  let exp = d.cogs;
  for (const [k, v] of Object.entries(d.expenses)) if (!CAPEX.has(k)) exp += v;
  return round2(inc - exp);
}

/** Net change of cash during the day. */
export function dayCashFlow(d: DayStats): number {
  const inc = d.revenue + d.tips + Object.values(d.income).reduce((a, b) => a + b, 0);
  const exp = Object.values(d.expenses).reduce((a, b) => a + b, 0);
  return round2(inc - exp);
}
