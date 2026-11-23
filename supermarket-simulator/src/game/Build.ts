// Furniture placement: assemble flat-pack boxes and move / sell existing furniture with a ghost preview.
import * as THREE from 'three';
import type { Game } from './Game';
import type { FurnRT } from './Furniture';
import type { BoxRT } from './Boxes';
import { FURN_MAP, type FurnDef } from '../data/furniture';
import { DOORS, FLOOR_Y } from './layout';
import { audio } from '../core/Audio';
import { h, money, nextUid } from '../core/util';

export class BuildMode {
  active = false;
  def: FurnDef | null = null;
  private ghost: THREE.Group | null = null;
  private ghostMats: THREE.MeshBasicMaterial[] = [];
  private pos = new THREE.Vector3();
  private ry = 0;
  private valid = false;
  private reason = '';
  private source: { kind: 'box'; box: BoxRT } | { kind: 'move'; f: FurnRT } | null = null;
  private ui: HTMLElement | null = null;
  private msg!: HTMLElement;
  /** Selecting furniture to move */
  selecting = false;
  private selUI: HTMLElement | null = null;

  constructor(private g: Game) {}

  startAssemble(box: BoxRT, point: THREE.Vector3) {
    const def = FURN_MAP.get(box.s.furn!)!;
    this.source = { kind: 'box', box };
    this.ry = this.g.player.yaw + Math.PI;
    this.begin(def, point);
  }

  startMove(f: FurnRT) {
    this.source = { kind: 'move', f };
    this.ry = f.s.ry;
    this.g.furniture.setHidden(f, true);
    this.g.shelves.markTags();
    for (const sl of f.slots) {
      const ref = this.g.shelves.refs.get(`${f.s.uid}:${sl.index}`);
      if (ref) this.g.stock.setHidden(ref.view, true);
    }
    if (f.collider) this.g.col.setEnabled(f.collider, false);
    this.begin(f.def, new THREE.Vector3(f.s.x, 0, f.s.z));
  }

  private begin(def: FurnDef, point: THREE.Vector3) {
    const g = this.g;
    this.def = def;
    this.active = true;
    g.mode = 'build';
    this.ry = Math.round(this.ry / (Math.PI / 2)) * (Math.PI / 2);
    this.pos.copy(point);
    // ghost from the furniture geometry
    const geo = def.build();
    this.ghost = new THREE.Group();
    this.ghostMats = [];
    for (const part of ['solid', 'metal', 'glass', 'glow'] as const) {
      const gg = geo[part];
      if (!gg) continue;
      const m = new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.45, depthWrite: false });
      this.ghostMats.push(m);
      this.ghost.add(new THREE.Mesh(gg, m));
    }
    // footprint outline
    const [w, d] = def.size;
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x40ff70, transparent: true, opacity: 0.25, depthWrite: false }));
    fp.rotation.x = -Math.PI / 2;
    fp.position.y = 0.01;
    this.ghostMats.push(fp.material as THREE.MeshBasicMaterial);
    this.ghost.add(fp);
    g.scene.add(this.ghost);
    if (g.carry && this.source?.kind === 'box') g.player.setHeld(null);
    this.buildUI();
  }

  private buildUI() {
    this.ui?.remove();
    this.msg = h('div', { class: 'co-help' }, '');
    const rot = h('button', { class: 'btn big', onclick: () => this.rotate() }, '⟳ Rotate');
    const ok = h('button', { class: 'btn big green', onclick: () => this.confirm() }, '✓ Place');
    const cancel = h('button', { class: 'btn big red', onclick: () => this.cancel() }, '✕');
    const extra = this.source?.kind === 'move' && this.def!.cat !== 'fixed'
      ? h('button', { class: 'btn big orange', onclick: () => this.sell() }, `Sell ${money(Math.round(this.def!.price * 0.5), 0)}`)
      : null;
    const bar = h('div', { style: { position: 'absolute', right: 'calc(14px + var(--safe-r))', bottom: 'calc(14px + var(--safe-b))', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '60vw' } }, extra, cancel, rot, ok);
    this.ui = h('div', { class: 'checkout-ui' }, this.msg, bar);
    this.ui.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.g.ui.root.appendChild(this.ui);
    this.g.ui.hud.showTouchControls(false);
  }

  rotate() {
    this.ry += Math.PI / 2;
    audio.play('click');
  }

  private allowedArea(def: FurnDef, x0: number, z0: number, x1: number, z1: number): string | null {
    const b = this.g.building;
    const pts = [[x0 + 0.05, z0 + 0.05], [x1 - 0.05, z0 + 0.05], [x0 + 0.05, z1 - 0.05], [x1 - 0.05, z1 - 0.05], [(x0 + x1) / 2, (z0 + z1) / 2]];
    for (const [x, z] of pts) {
      const a = b.areaAt(x, z);
      if (def.placement === 'sales' && a !== 'sales') return 'Must be on the sales floor';
      if (def.placement === 'storage' && a !== 'storage' && a !== 'storage2') return 'Must be in the warehouse';
      if (def.placement === 'any' && (a === 'outside' || (a !== 'sales' && !b.hasRoom(a as any)))) return 'Must be indoors';
    }
    return null;
  }

  private validate() {
    const g = this.g;
    const def = this.def!;
    const [x0, z0, x1, z1] = g.furniture.footprint(def, this.pos.x, this.pos.z, this.ry);
    const area = this.allowedArea(def, x0, z0, x1, z1);
    if (area) return area;
    const self = this.source?.kind === 'move' ? this.source.f : null;
    if (!g.col.boxFree(x0 + 0.02, z0 + 0.02, x1 - 0.02, z1 - 0.02, (c) => c.owner === self || c.tag === 'door' && !(c.owner as any)?.locked)) return 'Blocked by something';
    // keep doorways clear
    for (const d of DOORS) {
      const rt = g.building.doorById(d.id);
      if (!rt?.active) continue;
      const half = d.w / 2 + 0.3;
      const dx0 = d.axis === 'x' ? d.x - half : d.x - 1.6, dx1 = d.axis === 'x' ? d.x + half : d.x + 1.6;
      const dz0 = d.axis === 'x' ? d.z - 1.6 : d.z - half, dz1 = d.axis === 'x' ? d.z + 1.6 : d.z + half;
      if (x1 > dx0 && x0 < dx1 && z1 > dz0 && z0 < dz1) return 'Keep the doorway free';
    }
    // keep the player out of the footprint
    const p = g.player.pos;
    if (p.x > x0 - 0.3 && p.x < x1 + 0.3 && p.z > z0 - 0.3 && p.z < z1 + 0.3) return 'Step back a little';
    // boxes on the floor inside the footprint
    for (const b of g.boxes.items.values()) {
      if (b.held || b === (this.source?.kind === 'box' ? this.source.box : null)) continue;
      if (b.pos.x > x0 && b.pos.x < x1 && b.pos.z > z0 && b.pos.z < z1 && b.pos.y < 0.5) return 'Move the boxes out of the way';
    }
    return null;
  }

  update(dt: number) {
    if (this.selecting) return this.updateSelect();
    if (!this.active || !this.ghost) return;
    const g = this.g;
    const ray = g.player.ray();
    if (ray.direction.y < -0.03) {
      const t = (FLOOR_Y - ray.origin.y) / ray.direction.y;
      const dist = Math.min(Math.max(t, 1.2), 5.5);
      const p = ray.at(dist, new THREE.Vector3());
      const snap = 0.25;
      this.pos.set(Math.round(p.x / snap) * snap, 0, Math.round(p.z / snap) * snap);
    }
    if (g.input.wasPressed('tool') || g.input.keyDown('KeyR') && g.input.wasPressed('tool')) this.rotate();
    if (g.input.wasPressed('drop')) this.cancel();
    this.reason = this.validate() ?? '';
    this.valid = !this.reason;
    this.ghost.position.set(this.pos.x, FLOOR_Y, this.pos.z);
    this.ghost.rotation.y = this.ry;
    for (const m of this.ghostMats) m.color.setHex(this.valid ? 0x40ff70 : 0xff4040);
    this.msg.textContent = this.valid ? `Place ${this.def!.name} · look at the floor to move it` : `⛔ ${this.reason}`;
    if (g.input.wasPressed('action')) this.confirm();
    void dt;
  }

  confirm() {
    const g = this.g;
    if (!this.active || !this.def) return;
    if (!this.valid) {
      audio.play('error');
      g.ui.toast(this.reason || 'Cannot place here', 'bad');
      return;
    }
    const def = this.def;
    if (this.source?.kind === 'box') {
      const box = this.source.box;
      const fs = g.newFurnitureState(def.id, this.pos.x, this.pos.z, this.ry);
      g.addFurniture(fs);
      g.destroyCarry();
      g.ui.toast(`${def.name} assembled!`, 'good', '🔨');
      g.actions.gainXP(5);
      g.tutorial.event('furniture');
      void box;
    } else if (this.source?.kind === 'move') {
      const f = this.source.f;
      f.s.x = this.pos.x;
      f.s.z = this.pos.z;
      f.s.ry = this.ry;
      g.furniture.setHidden(f, false);
      g.furniture.place(f);
      if (f.collider) g.col.setEnabled(f.collider, true);
      g.shelves.attach(f);
      for (const sl of f.slots) {
        const ref = g.shelves.refs.get(`${f.s.uid}:${sl.index}`);
        if (ref) g.stock.setHidden(ref.view, false);
      }
      g.checkout.sync();
    }
    audio.play('thud');
    this.end();
  }

  cancel() {
    const g = this.g;
    if (this.source?.kind === 'move') {
      const f = this.source.f;
      g.furniture.setHidden(f, false);
      g.furniture.place(f);
      if (f.collider) g.col.setEnabled(f.collider, true);
      for (const sl of f.slots) {
        const ref = g.shelves.refs.get(`${f.s.uid}:${sl.index}`);
        if (ref) g.stock.setHidden(ref.view, false);
      }
      g.shelves.markTags();
    }
    this.end();
    g.refreshHeld();
  }

  private async sell() {
    const g = this.g;
    if (this.source?.kind !== 'move') return;
    const f = this.source.f;
    const items = (f.s.slots ?? []).reduce((a, s) => a + s.count, 0) + (f.s.rack ?? []).filter((x) => x).length;
    if (items > 0) {
      g.ui.toast('Empty it first (take the products / boxes off)', 'bad');
      return;
    }
    const ok = await g.ui.confirm('Sell furniture', `Sell ${f.def.name} for ${money(Math.round(f.def.price * 0.5), 0)}?`, 'Sell');
    if (!ok) return;
    g.removeFurniture(f.s.uid);
    g.sim.earn(Math.round(f.def.price * 0.5), 'sold');
    this.source = null;
    this.end();
  }

  private end() {
    const g = this.g;
    if (this.ghost) {
      this.ghost.removeFromParent();
      this.ghost = null;
    }
    this.ui?.remove();
    this.ui = null;
    this.active = false;
    this.def = null;
    this.source = null;
    g.mode = 'walk';
    g.ui.hud.showTouchControls(true);
    g.refreshHeld();
  }

  // ------------------------------------------------------------------ move tool
  toggleSelect() {
    const g = this.g;
    if (this.active) return;
    if (g.carry) {
      g.ui.toast('Put down what you are carrying first', 'bad');
      return;
    }
    this.selecting = !this.selecting;
    this.selUI?.remove();
    this.selUI = null;
    if (this.selecting) {
      g.mode = 'build';
      const close = h('button', { class: 'btn big red', onclick: () => this.toggleSelect() }, '✕ Exit build mode');
      this.selUI = h('div', { class: 'checkout-ui' }, h('div', { class: 'co-help' }, '🏗️ Look at furniture and tap ✋ to move it'), h('div', { style: { position: 'absolute', right: 'calc(14px + var(--safe-r))', bottom: 'calc(14px + var(--safe-b))' } }, close));
      g.ui.root.appendChild(this.selUI);
    } else g.mode = 'walk';
  }

  private updateSelect() {
    const g = this.g;
    const ray = g.player.ray();
    let best: FurnRT | null = null;
    let bd = 5;
    for (const f of g.furniture.items.values()) {
      if (f.def.cat === 'fixed' || f.hidden) continue;
      const hit = ray.intersectBox(f.box, new THREE.Vector3());
      if (!hit) continue;
      const d = hit.distanceTo(ray.origin);
      if (d < bd) { bd = d; best = f; }
    }
    g.ui.hud.setPrompt(best ? `Move ${best.def.name}` : 'Look at furniture to move it', best ? 'Tap ✋' : undefined, !best);
    g.ui.hud.setAction(best ? '🏗️' : '✋', best ? 'Move' : '', !!best);
    if (best && g.input.wasPressed('action')) {
      this.selecting = false;
      this.selUI?.remove();
      this.selUI = null;
      this.startMove(best);
    }
    if (g.input.wasPressed('drop')) this.toggleSelect();
  }
}

export function newUid() { return nextUid(); }
