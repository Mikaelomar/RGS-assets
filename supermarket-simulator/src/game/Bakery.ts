// Bakery oven: bake fresh bread (cheaper than buying and fresher), by the player or a baker.
import * as THREE from 'three';
import type { Game } from './Game';
import type { FurnRT } from './Furniture';
import type { BoxRT } from './Boxes';
import { PRODUCTS } from '../data/products';
import { nextUid, round2 } from '../core/util';
import { audio } from '../core/Audio';

const BAKE_MIN = 25;

export class BakerySystem {
  constructor(private g: Game) {
    g.sim.on('minute', (m) => this.tick(m));
  }

  oven(): FurnRT | null {
    return [...this.g.furniture.items.values()].find((f) => f.def.interact === 'oven' && !f.s.broken) ?? null;
  }

  /** The bakery product most needed right now. */
  private choose(): string | null {
    const g = this.g;
    const s = g.state;
    const options = PRODUCTS.filter((p) => p.category === 'bakery' && p.level <= s.level && s.licenses.includes('bakery'));
    if (!options.length) return null;
    let best: string | null = null;
    let bestStock = Infinity;
    for (const p of options) {
      const assigned = g.shelves.assignedSlots(p.id).length;
      const stock = g.shelves.shelfCount(p.id) + g.boxes.byPid(p.id).reduce((a, b) => a + b.s.count, 0);
      const score = stock - assigned * 6;
      if (score < bestStock) { bestStock = score; best = p.id; }
    }
    return best;
  }

  canBake() {
    const o = this.oven();
    return !!o && !o.s.bake && !!this.choose();
  }

  startBake(f: FurnRT, pid?: string) {
    const g = this.g;
    const id = pid ?? this.choose();
    if (!id || f.s.bake) return false;
    const p = PRODUCTS.find((x) => x.id === id)!;
    const cost = round2(p.cost * p.perBox * 0.55);
    if (!g.sim.pay(cost, 'stock')) return false;
    f.s.bake = { pid: id, count: p.perBox, doneAt: g.state.day * 1440 + g.state.minutes + BAKE_MIN };
    audio.play('click', f.box.getCenter(new THREE.Vector3()));
    g.ui.toast(`Baking ${p.name}… ready in ${BAKE_MIN} minutes`, 'info', '🔥');
    return true;
  }

  private tick(_m: number) {
    const g = this.g;
    const now = g.state.day * 1440 + g.state.minutes;
    for (const f of g.furniture.items.values()) {
      if (f.def.interact !== 'oven' || !f.s.bake) continue;
      if (now >= f.s.bake.doneAt) {
        const p = PRODUCTS.find((x) => x.id === f.s.bake!.pid)!;
        const pos = g.furniture.local(f, 0, 0, f.def.size[1] / 2 + 0.6);
        g.addBoxState({ uid: nextUid(), pid: p.id, count: f.s.bake.count, exp: g.state.day + p.shelfLife + 1, x: pos.x, y: 0.02, z: pos.z, ry: f.s.ry, kind: 'box' });
        f.s.bake = null;
        audio.play('chime', pos);
        g.ui.toast(`Fresh ${p.name} is ready by the oven!`, 'good', '🥖');
      }
    }
  }

  prompt(f: FurnRT, carry: BoxRT | null) {
    if (carry) return null;
    if (f.s.bake) {
      const left = Math.max(0, f.s.bake.doneAt - (this.g.state.day * 1440 + this.g.state.minutes));
      return { text: 'Baking in progress', sub: `Ready in ${Math.ceil(left)} min`, icon: '🔥', label: '' };
    }
    const id = this.choose();
    if (!id) return { text: 'Bakery oven', sub: 'Unlock the Bakery Permit to bake', icon: '🔥', label: '' };
    const p = PRODUCTS.find((x) => x.id === id)!;
    return { text: `Bake ${p.perBox} × ${p.name}`, sub: `Ingredients $${round2(p.cost * p.perBox * 0.55).toFixed(2)}`, icon: '🔥', label: 'Bake' };
  }

  act(f: FurnRT, kind: 'tap' | 'hold' | 'repeat') {
    if (kind !== 'tap' || f.s.bake) return;
    this.startBake(f);
  }
}
