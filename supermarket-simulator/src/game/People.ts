// Facade for picking and interacting with customers / employees, plus world markers.
import * as THREE from 'three';
import type { Game } from './Game';
import type { Customer } from './Customers';
import type { Employee } from './Staff';
import type { BoxRT } from './Boxes';
import { h } from '../core/util';

const _b = new THREE.Box3();
const _p = new THREE.Vector3();

export class People {
  constructor(private g: Game) {}

  pick(ray: THREE.Ray, maxD: number): { kind: 'customer' | 'staff'; obj: any; dist: number } | null {
    let best: { kind: 'customer' | 'staff'; obj: any; dist: number } | null = null;
    const test = (pos: THREE.Vector3, height: number, kind: 'customer' | 'staff', obj: any) => {
      _b.min.set(pos.x - 0.28, pos.y, pos.z - 0.28);
      _b.max.set(pos.x + 0.28, pos.y + height, pos.z + 0.28);
      const hit = ray.intersectBox(_b, _p);
      if (!hit) return;
      const d = hit.distanceTo(ray.origin);
      if (d < maxD && (!best || d < best.dist)) best = { kind, obj, dist: d };
    };
    for (const c of this.g.customers.list) if (!c.agent.hidden) test(c.pos, c.agent.human.look.height, 'customer', c);
    for (const e of this.g.staff.list) if (e.agent && !e.agent.hidden) test(e.agent.pos, e.agent.human.look.height, 'staff', e);
    return best;
  }

  prompt(kind: 'customer' | 'staff', obj: any, carry: BoxRT | null) {
    if (kind === 'customer') {
      const c = obj as Customer;
      if (c.state === 'steal') return { text: 'Stop the shoplifter!', sub: 'They are leaving without paying', icon: '🚨', label: 'Stop' };
      if (carry) return null;
      const mood = c.mood >= 75 ? '😊' : c.mood >= 50 ? '🙂' : c.mood >= 30 ? '😐' : '😠';
      const left = c.list.filter((x) => !x.done).length;
      return { text: `${c.name} ${mood}`, sub: c.state === 'queue' || c.state === 'counter' ? 'Waiting to pay' : left ? `Shopping · ${left} items left on the list` : 'Customer', icon: '💬', label: 'Greet' };
    }
    const e = obj as Employee;
    if (carry) return null;
    return { text: `${e.s.name} · ${e.role.name}`, sub: `Energy ${Math.round(e.s.energy)}% · ${e.status}${e.task ? ' · ' + e.task.kind : ''}`, icon: e.role.icon, label: 'Manage' };
  }

  interact(kind: 'customer' | 'staff', obj: any) {
    const g = this.g;
    if (kind === 'customer') {
      const c = obj as Customer;
      if (c.state === 'steal') {
        g.customers.catchThief(c, 'player');
        return;
      }
      c.mood = Math.min(100, c.mood + 4);
      c.think('👋', 1.5);
      c.agent.human.pose = 'wave';
      setTimeout(() => { if (!c.removed && c.agent.human.pose === 'wave') c.agent.human.pose = 'idle'; }, 1200);
      return;
    }
    g.app.open('staff');
  }
}

/** Floating world markers (⚠️ broken, 📦 delivery, tutorial arrows). */
export class Markers {
  private items = new Map<string, { remove: () => void; ttl: number }>();
  constructor(private g: Game) {}

  add(id: string, pos: THREE.Vector3 | (() => THREE.Vector3 | null), emoji: string, ttl = Infinity, edge = false) {
    this.remove(id);
    const el = h('div', { class: edge ? 'marker edgewrap' : 'marker' }, h('span', null, emoji));
    const fn = typeof pos === 'function' ? pos : () => pos;
    const remove = this.g.ui.anchor(el, fn, edge);
    this.items.set(id, { remove, ttl });
  }

  remove(id: string) {
    const m = this.items.get(id);
    if (m) {
      m.remove();
      this.items.delete(id);
    }
  }

  update(dt: number) {
    for (const [id, m] of this.items) {
      if (m.ttl === Infinity) continue;
      m.ttl -= dt;
      if (m.ttl <= 0) this.remove(id);
    }
  }

  clear() {
    for (const id of [...this.items.keys()]) this.remove(id);
  }
}
