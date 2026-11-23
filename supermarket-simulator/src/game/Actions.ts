// Player interaction: what the crosshair points at, the prompt shown, and what tap / hold does.
import * as THREE from 'three';
import type { Game } from './Game';
import type { BoxRT } from './Boxes';
import type { FurnRT } from './Furniture';
import type { SlotRef } from './Shelves';
import type { WallSign } from '../world/Building';
import { PRODUCT_MAP } from '../data/products';
import { FURN_MAP } from '../data/furniture';
import { ROOM_MAP, EXPANSIONS, FLOOR_Y } from './layout';
import { audio } from '../core/Audio';
import { haptic } from '../core/Platform';
import { money } from '../core/util';
import { CONFIG } from '../data/config';

export type Target =
  | { t: 'box'; box: BoxRT }
  | { t: 'slot'; ref: SlotRef }
  | { t: 'rack'; f: FurnRT; spot: number; pos: THREE.Vector3 }
  | { t: 'furn'; f: FurnRT }
  | { t: 'sign'; sign: WallSign }
  | { t: 'opensign' }
  | { t: 'floor'; point: THREE.Vector3 }
  | { t: 'person'; kind: 'customer' | 'staff'; obj: any };

interface PromptInfo { text: string; sub?: string; icon: string; label: string; hold?: boolean; warn?: boolean; repeat?: boolean; holdTime?: number; }

const REACH = 2.7;
const _box = new THREE.Box3();
const _p = new THREE.Vector3();
const _ray = new THREE.Ray();

export class Actions {
  target: Target | null = null;
  info: PromptInfo | null = null;
  private holdT = 0;
  private repeatT = 0;
  private holdKey = '';
  private xpAcc = 0;
  hasMop = false;

  constructor(private g: Game) {}

  get carry(): BoxRT | null { return this.g.carry; }

  // ----------------------------------------------------------------- targeting
  private pick(): Target | null {
    const g = this.g;
    const ray = g.player.ray(_ray);
    let best: Target | null = null;
    let bestD = REACH;
    const consider = (box: THREE.Box3, t: Target, pad = 0, reach = REACH) => {
      if (pad) box = _box.copy(box).expandByScalar(pad);
      const hit = ray.intersectBox(box, _p);
      if (!hit) return;
      const d = hit.distanceTo(ray.origin);
      if (d < bestD && d <= reach) {
        bestD = d;
        best = t;
      }
    };
    const px = g.player.pos.x, pz = g.player.pos.z;
    const near = (b: THREE.Box3, r = 4) => b.max.x > px - r && b.min.x < px + r && b.max.z > pz - r && b.min.z < pz + r;
    // boxes
    for (const b of g.boxes.items.values()) {
      if (b.held || !near(b.box)) continue;
      consider(b.box, { t: 'box', box: b }, 0.04);
    }
    // furniture + slots + rack spots
    for (const f of g.furniture.items.values()) {
      if (f.hidden || !near(f.box, 5)) continue;
      const hitF = ray.intersectBox(f.box, _p);
      if (!hitF) continue;
      const df = hitF.distanceTo(ray.origin);
      if (df > REACH + 0.6) continue;
      let sub = false;
      if (f.slots.length) {
        const refs = f.slots.map((sl) => g.shelves.refs.get(`${f.s.uid}:${sl.index}`)!).filter(Boolean);
        for (const ref of refs) {
          const before: Target | null = best;
          consider(ref.slot.box, { t: 'slot', ref }, 0.01, REACH + 0.3);
          if (best !== before) sub = true;
        }
      }
      if (f.def.rackSpots && this.carry) {
        f.def.rackSpots.forEach((sp, i) => {
          if (f.s.rack && f.s.rack[i]) return;
          const pos = g.furniture.local(f, sp[0], sp[1], sp[2]);
          const bb = new THREE.Box3(new THREE.Vector3(pos.x - 0.3, pos.y, pos.z - 0.3), new THREE.Vector3(pos.x + 0.3, pos.y + 0.7, pos.z + 0.3));
          const before: Target | null = best;
          consider(bb, { t: 'rack', f, spot: i, pos }, 0, REACH + 0.4);
          if (best !== before) sub = true;
        });
      }
      if (!sub && df < bestD) {
        bestD = df;
        best = { t: 'furn', f };
      }
    }
    // signs
    for (const s of g.building.signs) consider(s.box, { t: 'sign', sign: s }, 0, 3.5);
    consider(g.building.openSignBox, { t: 'opensign' }, 0, 3.2);
    // people
    const person = g.people.pick(ray, bestD);
    if (person) {
      best = { t: 'person', kind: person.kind, obj: person.obj };
      bestD = person.dist;
    }
    // floor
    if (ray.direction.y < -0.05) {
      const tF = (FLOOR_Y - ray.origin.y) / ray.direction.y;
      if (tF > 0 && tF < Math.min(bestD, 3.4)) {
        const point = ray.at(tF, new THREE.Vector3());
        best = { t: 'floor', point };
        bestD = tF;
      }
    }
    // occlusion by walls
    if (best) {
      const tg = best as Target;
      const tp = tg.t === 'floor' ? tg.point : ray.at(bestD, new THREE.Vector3());
      if (g.col.segmentBlocked(ray.origin.x, ray.origin.z, tp.x - (tp.x - ray.origin.x) * 0.06, tp.z - (tp.z - ray.origin.z) * 0.06, Math.min(1.6, ray.origin.y - 0.1), (c) => c.tag !== 'wall' && c.tag !== 'glass')) {
        return null;
      }
    }
    return best;
  }

  // ----------------------------------------------------------------- prompts
  private prompt(t: Target): PromptInfo | null {
    const g = this.g;
    const c = this.carry;
    const keyE = 'E';
    void keyE;
    switch (t.t) {
      case 'box': {
        if (c) return null;
        const b = t.box;
        const kind = b.s.kind ?? 'box';
        if (kind === 'trash') return { text: 'Pick up trash bag', icon: '🗑️', label: 'Pick up' };
        if (kind === 'litter') return { text: 'Pick up litter', icon: '🧻', label: 'Pick up' };
        if (kind === 'furniture') return { text: `Pick up ${FURN_MAP.get(b.s.furn!)!.name} (flat-pack)`, sub: 'Carry it where you want it and assemble', icon: '📦', label: 'Pick up' };
        const p = b.def!;
        const expTxt = p.shelfLife && b.s.count > 0 ? ` · best before day ${b.s.exp}` : '';
        return { text: `Pick up ${p.name}`, sub: b.s.count > 0 ? `${b.s.count} items${expTxt}` : 'Empty box', icon: '✋', label: 'Pick up' };
      }
      case 'slot': {
        const ref = t.ref;
        const st = ref.stock;
        const cap = st.pid ? g.shelves.capacity(ref, st.pid) : 0;
        const expired = g.shelves.expiredCount(ref);
        if (c && (c.s.kind ?? 'box') === 'box' && c.def) {
          const p = c.def;
          if (c.s.count <= 0) {
            if (st.pid && st.count > 0) return { text: `Take ${PRODUCT_MAP.get(st.pid)!.name} back into the box`, sub: `${st.count} on shelf`, icon: '↩️', label: 'Take', hold: true, repeat: true };
            return { text: 'The box is empty', sub: 'Throw it in a trash or recycling bin', icon: '📦', label: '', warn: true };
          }
          const ok = g.shelves.canPlace(ref, p.id);
          if (!ok.ok) {
            if (st.pid && st.pid !== p.id && st.count > 0) return { text: ok.reason!, sub: 'Use an empty box to clear the slot first', icon: '⛔', label: '', warn: true };
            const kinds = p.display.map((k) => k).join(' / ');
            return { text: ok.reason!, sub: ok.reason === 'Slot is full' ? '' : `Needs: ${kinds}`, icon: '⛔', label: '', warn: true };
          }
          return { text: `Place ${p.name}`, sub: `${st.pid === p.id ? st.count : 0}/${g.shelves.capacity(ref, p.id)} on shelf · ${c.s.count} in box`, icon: '📥', label: 'Place', repeat: true };
        }
        if (c) return null;
        if (expired > 0) return { text: `Remove ${expired} expired items`, sub: 'Customers hate expired food!', icon: '🗑️', label: 'Remove', warn: false };
        if (!st.pid) return { text: 'Empty slot', sub: `${ref.slot.def.kind} · bring a box of products`, icon: 'ℹ️', label: '' };
        const p = PRODUCT_MAP.get(st.pid)!;
        return { text: `${p.name} · ${money(g.shelves.priceOf(p.id))}`, sub: `${st.count}/${cap} on shelf · tap to change price`, icon: '🏷️', label: 'Price' };
      }
      case 'rack': {
        if (!c) return null;
        if ((c.s.kind ?? 'box') !== 'box') return { text: 'Only product boxes go on racks', icon: '⛔', label: '', warn: true };
        return { text: 'Store the box on the rack', icon: '📦', label: 'Store' };
      }
      case 'furn': return this.furnPrompt(t.f);
      case 'sign': {
        if (c) return null;
        const s = t.sign;
        if (s.kind === 'expansion') {
          const e = EXPANSIONS[s.index];
          return { text: `Expand the store (${money(e.cost, 0)})`, sub: g.state.level < e.level ? `Requires level ${e.level}` : `${e.plots.length} new areas (+${e.plots.length * 64} m²)`, icon: '🏗️', label: 'Expand', warn: g.state.level < e.level };
        }
        const room = ROOM_MAP.get(s.room!)!;
        return { text: `Unlock ${room.name} (${money(room.cost, 0)})`, sub: g.state.level < room.level ? `Requires level ${room.level}` : room.desc, icon: '🔓', label: 'Unlock', warn: g.state.level < room.level };
      }
      case 'opensign': {
        if (c) return null;
        const open = g.state.open;
        return { text: open ? 'Close the store' : 'Open the store', sub: open ? 'No new customers will come in' : g.state.phase === 'night' ? 'Too late today' : `Open until ${g.state.closeHour}:00`, icon: open ? '🔒' : '🔓', label: open ? 'Close' : 'Open' };
      }
      case 'person': return g.people.prompt(t.kind, t.obj, c);
      case 'floor': {
        const pt = t.point;
        if (c) {
          if (c.s.kind === 'furniture') return { text: `Assemble ${FURN_MAP.get(c.s.furn!)!.name} here`, sub: 'Then position and rotate it', icon: '🔨', label: 'Build' };
          return null;
        }
        const spill = g.cleaning.spillAt(pt.x, pt.z);
        if (spill) {
          if (g.player.tool !== 'mop') return { text: spill.kind === 'leak' ? 'Water leak puddle' : 'Spill on the floor!', sub: 'Get the mop (🧹) to clean it', icon: '💧', label: '', warn: true };
          return { text: 'Mop the spill', sub: 'Hold to clean', icon: '🧹', label: 'Mop', hold: true, holdTime: 1.6 + spill.size };
        }
        if (g.player.tool === 'mop') {
          const dirt = g.cleaning.dirtAt(pt.x, pt.z);
          if (dirt > 0.08) return { text: 'Mop the dirty floor', sub: `Dirt ${Math.round(dirt * 100)}% · hold to clean`, icon: '🧹', label: 'Mop', hold: true, holdTime: 999 };
        }
        return null;
      }
    }
  }

  private furnPrompt(f: FurnRT): PromptInfo | null {
    const g = this.g;
    const c = this.carry;
    const s = f.s;
    const def = f.def;
    const kind = c ? c.s.kind ?? 'box' : null;
    if (s.broken && !c) {
      const cost = this.repairCost(f);
      return { text: `Repair ${def.name}`, sub: `Broken! Parts ${money(cost)} · hold to repair`, icon: '🔧', label: 'Repair', hold: true, holdTime: 3.2 };
    }
    if ((def.coolTarget !== undefined) && !c && (s.dirt ?? 0) > 0.35) {
      return { text: `Clean the ${def.name} glass`, sub: 'Smudged glass looks bad · hold', icon: '🧽', label: 'Wipe', hold: true, holdTime: 1.4 };
    }
    switch (def.interact) {
      case 'trash': {
        const fill = s.fill ?? 0;
        if (c && kind === 'box' && c.s.count <= 0) return fill >= 10 ? { text: 'Trash bin is full!', sub: 'Empty it first', icon: '🗑️', label: '', warn: true } : { text: 'Throw away the empty box', sub: `Bin ${Math.round(fill)}/10`, icon: '🗑️', label: 'Throw' };
        if (c && kind === 'litter') return { text: 'Throw away litter', icon: '🗑️', label: 'Throw' };
        if (c && kind === 'box' && c.s.count > 0) return { text: 'Throw away the box with products?', sub: `${c.s.count} items will be wasted`, icon: '⚠️', label: 'Waste', warn: true, hold: true, holdTime: 1.2 };
        if (!c) return fill > 0 ? { text: 'Take out the trash', sub: `Bin ${Math.round(fill)}/10 · take the bag to a dumpster`, icon: '🗑️', label: 'Empty' } : { text: 'Trash bin (empty)', icon: '🗑️', label: '' };
        return null;
      }
      case 'recycle':
      case 'baler':
        if (c && kind === 'box' && c.s.count <= 0) return { text: def.interact === 'baler' ? 'Bale the cardboard' : 'Recycle the empty box', sub: `+${money(def.interact === 'baler' ? CONFIG.recyclingPerBox * 3 : CONFIG.recyclingPerBox)}`, icon: '♻️', label: 'Recycle' };
        return c ? null : { text: def.interact === 'baler' ? 'Cardboard baler' : 'Cardboard recycling', sub: 'Bring empty boxes here for a small refund', icon: '♻️', label: '' };
      case 'dumpster':
        if (c && (kind === 'trash' || kind === 'litter' || (kind === 'box' && c.s.count <= 0))) return { text: 'Throw it in the dumpster', icon: '🗑️', label: 'Throw' };
        return c ? null : { text: 'Dumpster', sub: 'Trash bags go here', icon: '🗑️', label: '' };
      case 'checkout':
        if (c) return null;
        return { text: 'Work the register', sub: `${g.checkout.queueLength(f)} customers waiting`, icon: '🧾', label: 'Checkout' };
      case 'selfcheckout':
        if (c) return null;
        return g.checkout.selfNeedsHelp(f) ? { text: 'Help the customer at the self-checkout', icon: '🙋', label: 'Help' } : { text: 'Self-checkout', sub: 'Customers pay by themselves', icon: '🖥️', label: '' };
      case 'computer':
        if (c) return null;
        return { text: 'Use the computer', sub: 'Order products & furniture, manage the store', icon: '🖥️', label: 'Open' };
      case 'safe':
        if (c) return null;
        return { text: 'Safe', sub: 'Count the registers and store the cash', icon: '🔐', label: 'Count' };
      case 'coffee':
        if (c) return null;
        return { text: 'Make a coffee (+30 energy)', sub: '$1.00', icon: '☕', label: 'Drink' };
      case 'vending':
        if (c) return null;
        return { text: 'Buy a snack (+15 energy)', sub: '$2.00', icon: '🍫', label: 'Buy' };
      case 'sofa':
        if (c) return null;
        return { text: 'Rest on the sofa', sub: 'Hold to recover energy', icon: '🛋️', label: 'Rest', hold: true, holdTime: 999 };
      case 'breaker':
        if (c) return null;
        return g.power.outage ? { text: g.power.tripped ? 'Reset the main breaker' : 'Grid outage - start the generator', sub: 'Hold to restore power', icon: '⚡', label: 'Reset', hold: true, holdTime: 2.5 } : { text: 'Breaker panel', sub: `Power use: ${g.power.currentKW.toFixed(1)} kW`, icon: '⚡', label: '' };
      case 'hvac':
        if (c) return null;
        return { text: 'HVAC unit', sub: `Indoor ${g.power.indoorTemp.toFixed(0)}°C · outdoor ${g.power.outdoorTemp.toFixed(0)}°C`, icon: '🌀', label: '' };
      case 'toilet':
      case 'sink': {
        if (c) return null;
        const which = s.room === 'custwc' ? 'cust' : 'staff';
        const dirt = g.state.wcDirt[which];
        return dirt > 0.25 ? { text: 'Clean the restroom', sub: `Dirty ${Math.round(dirt * 100)}% · hold`, icon: '🧽', label: 'Clean', hold: true, holdTime: 2.5 } : { text: 'Restroom is clean', icon: '✨', label: '' };
      }
      case 'mop':
        if (c) return null;
        return g.player.tool === 'mop' ? { text: 'Put the mop back', icon: '🧹', label: 'Return' } : { text: 'Take the mop', sub: 'Clean spills and dirty floors', icon: '🧹', label: 'Take' };
      case 'scrubber':
        if (c) return null;
        return g.state.upgrades.includes('scrubber') ? { text: 'Start the floor scrubber', sub: 'Cleans the whole sales floor automatically for $5', icon: '🧽', label: 'Start' } : { text: 'Floor scrubber', sub: 'Buy the upgrade in Store → Upgrades', icon: '🧽', label: '' };
      case 'lockers':
        if (c) return null;
        return { text: 'Staff lockers', sub: `${g.staff.onShiftCount()} employees on shift`, icon: '🔒', label: '' };
      case 'whiteboard':
        if (c) return null;
        return { text: 'Staff schedule', sub: 'Manage shifts', icon: '📋', label: 'Open' };
      case 'basket':
      case 'carts':
        return c ? null : { text: def.name, sub: 'Customers use these while shopping', icon: def.icon, label: '' };
      case 'oven':
        return g.bakery.prompt(f, c);
      case 'tv':
        return c ? null : { text: 'TV', sub: 'Today\'s weather: ' + g.state.weather, icon: '📺', label: '' };
      case 'atm':
        return c ? null : { text: 'ATM', sub: 'Earns small fees every day', icon: '🏧', label: '' };
      default:
        break;
    }
    if (c && kind === 'box' && c.s.count <= 0 && def.cat !== 'fixed') return null;
    if (!c && def.cat !== 'fixed') {
      return { text: def.name, sub: def.slots ? 'Look at a shelf level to stock it' : 'Use Build mode (🏗️) to move it', icon: def.icon, label: '' };
    }
    return null;
  }

  repairCost(f: FurnRT) {
    return Math.round(f.def.price * 0.06 + 8);
  }

  // ----------------------------------------------------------------- update
  update(dt: number) {
    const g = this.g;
    const input = g.input;
    if (g.mode !== 'walk') {
      g.ui.hud.setPrompt(null);
      g.ui.hud.setHold(null);
      return;
    }
    this.target = this.pick();
    this.info = this.target ? this.prompt(this.target) : null;
    const info = this.info;
    const hud = g.ui.hud;
    if (info) {
      hud.setPrompt(info.text, info.sub, !!info.warn, info.label ? (info.hold ? 'Hold E' : 'E') : undefined);
      hud.setAction(info.icon, info.label, !!info.label && !info.warn);
    } else {
      hud.setPrompt(null);
      hud.setAction(this.carry ? '📦' : '✋', '', false);
    }
    hud.showDrop(!!this.carry);
    hud.showTool(this.hasMop || g.player.tool === 'mop', g.player.tool === 'mop' ? '✋' : '🧹');

    if (input.wasPressed('tool') && (this.hasMop || g.player.tool === 'mop')) {
      if (this.carry) g.ui.toast('Put the box down first', 'bad');
      else {
        g.player.setTool(g.player.tool === 'mop' ? 'none' : 'mop');
        audio.play('pickup');
      }
    }
    if (input.wasPressed('drop') && this.carry) this.dropCarry();

    const key = this.target ? this.keyOf(this.target) : '';
    if (key !== this.holdKey) {
      this.holdKey = key;
      this.holdT = 0;
      this.repeatT = 0;
    }
    if (!info || !info.label || !this.target) {
      hud.setHold(null);
      return;
    }
    if (info.hold) {
      if (input.isDown('action')) {
        this.holdT += dt;
        const ht = info.holdTime ?? 1;
        hud.setHold(ht >= 999 ? (this.holdT % 1) : this.holdT / ht);
        this.whileHold(this.target, dt);
        if (ht < 999 && this.holdT >= ht) {
          this.holdT = 0;
          this.act(this.target, 'hold');
          hud.setHold(null);
        }
      } else {
        this.holdT = 0;
        hud.setHold(null);
      }
      return;
    }
    hud.setHold(null);
    if (input.wasPressed('action')) {
      this.act(this.target, 'tap');
      this.repeatT = -0.35;
    } else if (info.repeat && input.isDown('action')) {
      this.repeatT += dt;
      if (this.repeatT >= 0.11) {
        this.repeatT = 0;
        this.act(this.target, 'repeat');
      }
    }
  }

  private keyOf(t: Target): string {
    switch (t.t) {
      case 'box': return 'b' + t.box.s.uid;
      case 'slot': return `s${t.ref.f.s.uid}:${t.ref.slot.index}`;
      case 'rack': return `r${t.f.s.uid}:${t.spot}`;
      case 'furn': return 'f' + t.f.s.uid;
      case 'sign': return 'g' + t.sign.kind + t.sign.index + t.sign.room;
      case 'opensign': return 'open';
      case 'person': return 'p' + (t.obj.id ?? '');
      case 'floor': {
        const sp = this.g.cleaning.spillAt(t.point.x, t.point.z);
        return sp ? 'spill' + sp.uid : 'floor';
      }
    }
  }

  /** Continuous effects while holding the action button. */
  private whileHold(t: Target, dt: number) {
    const g = this.g;
    if (t.t === 'floor' && g.player.tool === 'mop') {
      g.player.toolAnim = 0.25;
      if (!g.cleaning.spillAt(t.point.x, t.point.z)) {
        const cleaned = g.cleaning.mopAt(t.point.x, t.point.z, dt);
        if (cleaned > 0) this.gainXP(cleaned * 6);
      }
      if (Math.random() < dt * 2.2) audio.play('mop', t.point, 0.6);
      this.useEnergy(dt * 0.1);
    }
    if (t.t === 'furn' && t.f.def.interact === 'sofa') {
      g.state.energy = Math.min(100, g.state.energy + dt * 4);
      if (Math.random() < dt) g.ui.floaty(t.f.box.getCenter(new THREE.Vector3()), '+⚡', 'gold');
    }
    if (t.t === 'furn' && (t.f.s.broken || (t.f.s.dirt ?? 0) > 0.35) && Math.random() < dt * 3) audio.play(t.f.s.broken ? 'repair' : 'spray', t.f.box.getCenter(new THREE.Vector3()), 0.5);
  }

  private useEnergy(n: number) {
    this.g.state.energy = Math.max(0, this.g.state.energy - n);
  }

  gainXP(n: number, at?: THREE.Vector3) {
    this.xpAcc += n;
    if (this.xpAcc >= 1) {
      const whole = Math.floor(this.xpAcc);
      this.xpAcc -= whole;
      this.g.sim.addXP(whole, at);
    }
  }

  // ----------------------------------------------------------------- actions
  private act(t: Target, kind: 'tap' | 'hold' | 'repeat') {
    const g = this.g;
    const c = this.carry;
    switch (t.t) {
      case 'box':
        if (!c && kind === 'tap') g.pickUp(t.box);
        return;
      case 'slot':
        return this.actSlot(t.ref, kind);
      case 'rack':
        if (c && (c.s.kind ?? 'box') === 'box') g.storeOnRack(c, t.f, t.spot);
        return;
      case 'furn':
        return this.actFurn(t.f, kind);
      case 'sign':
        if (kind !== 'tap') return;
        if (t.sign.kind === 'expansion') g.tryExpansion(t.sign.index);
        else if (t.sign.room) g.tryUnlockRoom(t.sign.room);
        return;
      case 'opensign':
        if (kind !== 'tap') return;
        if (g.state.open) g.sim.closeStore();
        else if (g.sim.openStore()) g.tutorial.event('open');
        return;
      case 'person':
        if (kind === 'tap') g.people.interact(t.kind, t.obj);
        return;
      case 'floor':
        if (c && c.s.kind === 'furniture' && kind === 'tap') g.build.startAssemble(c, t.point);
        else if (kind === 'hold') {
          const sp = g.cleaning.spillAt(t.point.x, t.point.z);
          if (sp && g.player.tool === 'mop') {
            g.cleaning.removeSpill(sp.uid);
            audio.play('success', t.point, 0.6);
            this.gainXP(4, t.point);
            g.tutorial.event('clean');
          }
        }
        return;
    }
  }

  private actSlot(ref: SlotRef, kind: 'tap' | 'hold' | 'repeat') {
    const g = this.g;
    const c = this.carry;
    if (c && (c.s.kind ?? 'box') === 'box' && c.def) {
      if (c.s.count <= 0) {
        // take items back into the empty box
        if (!ref.stock.pid || ref.stock.count <= 0) return;
        if (c.def.id !== ref.stock.pid) g.retargetBox(c, ref.stock.pid);
        const room = c.def!.perBox - c.s.count;
        if (room <= 0) return;
        const exps = g.shelves.take(ref, 1);
        if (!exps.length) return;
        c.s.count += 1;
        c.s.exp = exps[0];
        g.refreshHeld();
        audio.play('pop', ref.slot.center, 0.6);
        return;
      }
      const p = c.def;
      if (!g.shelves.canPlace(ref, p.id).ok) {
        if (kind === 'tap') audio.play('error');
        return;
      }
      const n = g.shelves.place(ref, p.id, 1, c.s.exp);
      if (n > 0) {
        c.s.count -= n;
        g.refreshHeld();
        audio.play('pop', ref.slot.center, 0.8);
        haptic('light');
        this.gainXP(0.25);
        g.tutorial.event('stock', p.id);
        if (c.s.count <= 0) {
          g.ui.toast('Box empty! Throw it in the trash or recycling.', 'info', '📦', 2000);
          g.tutorial.event('boxEmpty');
        }
      }
      return;
    }
    if (c || kind !== 'tap') return;
    const expired = g.shelves.expiredCount(ref);
    if (expired > 0) {
      const n = g.shelves.removeExpired(ref);
      const p = PRODUCT_MAP.get(ref.stock.pid!)!;
      g.sim.spend(0, 'waste');
      g.state.stats.wasted = (g.state.stats.wasted ?? 0) + n;
      g.ui.toast(`Removed ${n} expired ${p.name}`, 'info', '🗑️');
      audio.play('trash', ref.slot.center);
      this.gainXP(2, ref.slot.center);
      return;
    }
    if (ref.stock.pid) g.dialogs.price(ref.stock.pid);
  }

  private actFurn(f: FurnRT, kind: 'tap' | 'hold' | 'repeat') {
    const g = this.g;
    const c = this.carry;
    const s = f.s;
    const center = f.box.getCenter(new THREE.Vector3());
    if (s.broken && !c) {
      if (kind === 'hold') {
        const cost = this.repairCost(f);
        if (!g.sim.pay(cost, 'repairs')) return;
        g.power.repair(f);
        g.ui.toast(`${f.def.name} repaired!`, 'good', '🔧');
        audio.play('success', center);
        this.gainXP(10, center);
      }
      return;
    }
    if (f.def.coolTarget !== undefined && !c && (s.dirt ?? 0) > 0.35) {
      if (kind === 'hold') {
        s.dirt = 0;
        audio.play('success', center, 0.6);
        this.gainXP(3, center);
      }
      return;
    }
    const kindC = c ? c.s.kind ?? 'box' : null;
    switch (f.def.interact) {
      case 'trash': {
        const fill = s.fill ?? 0;
        if (c && kindC === 'box' && c.s.count <= 0 && kind === 'tap') {
          if (fill >= 10) { audio.play('error'); return; }
          s.fill = fill + 1;
          g.destroyCarry();
          audio.play('trash', center);
          this.gainXP(1, center);
          g.tutorial.event('trash');
        } else if (c && kindC === 'litter' && kind === 'tap') {
          s.fill = Math.min(10, fill + 0.25);
          g.destroyCarry();
          audio.play('trash', center);
          this.gainXP(1, center);
        } else if (c && kindC === 'box' && c.s.count > 0 && kind === 'hold') {
          const p = c.def!;
          g.state.stats.wasted = (g.state.stats.wasted ?? 0) + c.s.count;
          s.fill = Math.min(10, fill + 1);
          g.destroyCarry();
          audio.play('trash', center);
          g.ui.toast(`Threw away ${p.name}`, 'bad', '🗑️');
        } else if (!c && fill > 0 && kind === 'tap') {
          s.fill = 0;
          g.spawnCarry({ kind: 'trash', pid: 'apple', count: 0, exp: 0 });
          audio.play('trash', center);
          g.ui.toast('Take the trash bag to a dumpster (outside)', 'info', '🗑️');
        }
        return;
      }
      case 'recycle':
      case 'baler':
        if (c && kindC === 'box' && c.s.count <= 0 && kind === 'tap') {
          const v = f.def.interact === 'baler' ? CONFIG.recyclingPerBox * 3 : CONFIG.recyclingPerBox;
          g.destroyCarry();
          g.sim.earn(v, 'recycling', center);
          audio.play('trash', center);
          this.gainXP(1.5, center);
          g.tutorial.event('trash');
        }
        return;
      case 'dumpster':
        if (c && kind === 'tap' && (kindC === 'trash' || kindC === 'litter' || (kindC === 'box' && c.s.count <= 0))) {
          g.destroyCarry();
          audio.play('drop', center);
          this.gainXP(2, center);
          g.tutorial.event('trash');
        }
        return;
      case 'checkout':
        if (!c && kind === 'tap') g.checkout.enter(f);
        return;
      case 'selfcheckout':
        if (!c && kind === 'tap') g.checkout.helpSelf(f);
        return;
      case 'computer':
        if (!c && kind === 'tap') g.app.open();
        return;
      case 'whiteboard':
        if (!c && kind === 'tap') g.app.open('staff');
        return;
      case 'safe':
        if (!c && kind === 'tap') g.checkout.countCash();
        return;
      case 'coffee':
        if (!c && kind === 'tap' && g.sim.pay(1, 'coffee')) {
          g.state.energy = Math.min(100, g.state.energy + 30);
          audio.play('coffee', center);
          g.ui.floaty(center, '+30 ⚡', 'gold');
        }
        return;
      case 'vending':
        if (!c && kind === 'tap' && g.sim.pay(2, 'coffee')) {
          g.state.energy = Math.min(100, g.state.energy + 15);
          audio.play('drop', center, 0.5);
          g.ui.floaty(center, '+15 ⚡', 'gold');
        }
        return;
      case 'breaker':
        if (kind === 'hold' && g.power.outage) {
          g.power.resetBreaker();
          audio.play('unlock', center);
          this.gainXP(8, center);
        }
        return;
      case 'toilet':
      case 'sink':
        if (kind === 'hold') {
          const which = s.room === 'custwc' ? 'cust' : 'staff';
          g.state.wcDirt[which] = 0;
          audio.play('flush', center);
          this.gainXP(4, center);
        }
        return;
      case 'mop':
        if (!c && kind === 'tap') {
          this.hasMop = true;
          g.player.setTool(g.player.tool === 'mop' ? 'none' : 'mop');
          audio.play('pickup', center);
          if (g.player.tool === 'mop') g.ui.toast('Mop ready! Hold ✋ on spills or dirty floor. 🧹 button switches tools.', 'info', '🧹', 3500);
        }
        return;
      case 'scrubber':
        if (!c && kind === 'tap' && g.state.upgrades.includes('scrubber')) g.cleaning.runScrubber();
        return;
      case 'oven':
        g.bakery.act(f, kind);
        return;
    }
  }

  dropCarry() {
    const g = this.g;
    const c = this.carry;
    if (!c) return;
    const t = this.target;
    const fwd = g.player.forward(new THREE.Vector3());
    let pos = g.player.pos.clone().addScaledVector(fwd, 0.85);
    if (t && t.t === 'floor' && t.point.distanceTo(g.player.pos) < 2.6) pos = t.point.clone();
    pos.y = g.player.pos.y + 0.9;
    // keep inside reachable space
    const [x, z] = g.col.resolveCircle(pos.x, pos.z, Math.max(c.size[0], c.size[2]) * 0.5, 0.05, 1.8);
    pos.x = x;
    pos.z = z;
    g.putDown(pos, new THREE.Vector3(fwd.x * 0.4, 0, fwd.z * 0.4));
  }
}
