// Drivable forklift (upgrade "forklift"): pick up whole pallets of boxes and move them fast
// between the delivery spot and the warehouse. Not allowed on the customer sales floor.
import * as THREE from 'three';
import type { Game } from './Game';
import type { BoxRT } from './Boxes';
import type { Collider } from './Collision';
import { GeoBuilder } from '../gfx/GeoBuilder';
import { FLOOR_Y } from './layout';
import { audio } from '../core/Audio';
import { clamp } from '../core/util';
import { haptic } from '../core/Platform';

/** Where a new forklift is parked: on the sidewalk next to the delivery spot, facing it. */
export const FORKLIFT_PARK = { x: -10.4, z: 2.6, ry: -Math.PI / 2 };

const BODY_R = 0.8;
const FORK_Z = -1.85; // fork centre in local coordinates (forward = -z)
const EYE_Y = 1.98;
const MAX_FWD = 4.4;
const MAX_REV = 2.0;

export interface ForkliftState { x: number; z: number; ry: number }

export class Forklift {
  readonly root = new THREE.Group();
  private carriage = new THREE.Group();
  private collider: Collider | null = null;
  driving = false;
  private speed = 0;
  private forkY = 0.06;
  private load: { pallet: BoxRT; riders: { b: BoxRT; off: THREE.Vector3; y: number }[]; ry0: number } | null = null;
  private beepT = 0;
  private warnT = 0;
  private built = false;

  constructor(private g: Game) {
    this.root.visible = false;
    g.scene.add(this.root);
  }

  get st(): ForkliftState | null { return this.g.state?.forklift ?? null; }
  get carrying() { return !!this.load; }
  get box3(): THREE.Box3 {
    const s = this.st!;
    return new THREE.Box3(new THREE.Vector3(s.x - 1.1, 0, s.z - 1.1), new THREE.Vector3(s.x + 1.1, 2.3, s.z + 1.1));
  }

  /** Called on load / after buying the upgrade. */
  sync() {
    const g = this.g;
    const owned = g.state.upgrades.includes('forklift');
    if (owned && !g.state.forklift) g.state.forklift = { ...FORKLIFT_PARK };
    if (!owned) g.state.forklift = null;
    if (this.driving) {
      // a save was loaded while driving: just leave the seat (the save has the player's position)
      this.driving = false;
      this.speed = 0;
      g.player.locked = false;
      audio.setLoop('engine', 0);
    }
    this.load = null;
    this.root.visible = !!g.state.forklift;
    if (!g.state.forklift) {
      g.col.remove(this.collider);
      this.collider = null;
      return;
    }
    if (!this.built) this.buildModel();
    this.forkY = 0.06;
    this.place();
    this.updateCollider();
  }

  private buildModel() {
    this.built = true;
    const b = new GeoBuilder();
    const Y = '#f2b705', D = '#2f3439', G = '#4a5259';
    b.box(1.1, 0.42, 2.0, Y, 0, 0.47, 0.15);
    b.rbox(1.14, 0.72, 0.55, 0.06, D, 0, 0.74, 1.0);
    b.box(0.92, 0.22, 0.95, Y, 0, 0.79, 0.4);
    b.box(0.5, 0.1, 0.46, '#1b1b1b', 0, 0.95, 0.38);
    b.box(0.5, 0.46, 0.1, '#1b1b1b', 0, 1.2, 0.62);
    b.box(0.08, 0.5, 0.08, D, 0, 1.08, -0.28, { rx: -0.35 });
    b.torus(0.17, 0.025, '#1b1b1b', 0, 1.36, -0.38, { rx: -Math.PI / 2 + 0.5, rs: 6, ts: 14 });
    for (const [x, z] of [[-0.51, -0.6], [0.51, -0.6], [-0.51, 0.82], [0.51, 0.82]]) b.box(0.06, 1.4, 0.06, D, x, 1.5, z);
    for (let i = 0; i < 5; i++) b.box(1.08, 0.04, 0.05, D, 0, 2.2, -0.6 + i * 0.355);
    b.box(0.05, 0.05, 1.48, D, -0.51, 2.2, 0.11);
    b.box(0.05, 0.05, 1.48, D, 0.51, 2.2, 0.11);
    for (const x of [-0.5, 0.5]) {
      b.cyl(0.32, 0.32, 0.26, '#1b1b1b', x, 0.32, -0.72, { rz: Math.PI / 2, seg: 14 });
      b.cyl(0.26, 0.26, 0.22, '#1b1b1b', x, 0.26, 0.86, { rz: Math.PI / 2, seg: 12 });
      b.cyl(0.14, 0.14, 0.27, G, x, 0.32, -0.72, { rz: Math.PI / 2, seg: 10 });
    }
    // mast rails
    for (const x of [-0.36, 0.36]) b.box(0.08, 2.35, 0.1, G, x, 1.2, -1.2);
    b.box(0.8, 0.07, 0.1, G, 0, 2.35, -1.2);
    b.box(0.8, 0.07, 0.1, G, 0, 0.12, -1.2);
    // warning stripes on the counterweight
    for (let i = 0; i < 4; i++) b.box(0.12, 0.06, 0.02, '#111111', -0.4 + i * 0.27, 0.62, 1.285, { rz: 0.6 });
    const body = new THREE.Mesh(b.build()!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 }));
    body.castShadow = true;
    body.receiveShadow = true;
    this.root.add(body);
    // beacon (always lit)
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), new THREE.MeshBasicMaterial({ color: 0xff9100, toneMapped: false }));
    beacon.position.set(0, 2.28, 0.6);
    this.root.add(beacon);
    // carriage + forks (moves up and down)
    const c = new GeoBuilder();
    c.box(0.9, 0.42, 0.06, G, 0, 0.26, -1.29);
    for (let i = 0; i < 4; i++) c.box(0.05, 0.62, 0.03, D, -0.33 + i * 0.22, 0.75, -1.31);
    c.box(0.9, 0.04, 0.03, D, 0, 1.06, -1.31);
    for (const x of [-0.3, 0.3]) {
      c.box(0.12, 0.045, 1.18, '#3b4146', x, 0.0225, -1.9);
      c.box(0.12, 0.42, 0.05, '#3b4146', x, 0.22, -1.33);
    }
    const carriage = new THREE.Mesh(c.build()!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5 }));
    carriage.castShadow = true;
    this.carriage.add(carriage);
    this.root.add(this.carriage);
  }

  private place() {
    const s = this.st!;
    this.root.position.set(s.x, FLOOR_Y, s.z);
    this.root.rotation.y = s.ry;
    this.carriage.position.y = this.forkY;
  }

  private updateCollider() {
    const s = this.st;
    if (!s || this.driving) {
      this.g.col.remove(this.collider);
      this.collider = null;
      return;
    }
    const c = Math.abs(Math.cos(s.ry)), sn = Math.abs(Math.sin(s.ry));
    const hw = 0.58 * c + 1.2 * sn, hd = 0.58 * sn + 1.2 * c;
    // shift the box a little toward the forks
    const fx = -Math.sin(s.ry) * 0.35, fz = -Math.cos(s.ry) * 0.35;
    const [x0, z0, x1, z1] = [s.x + fx - hw, s.z + fz - hd, s.x + fx + hw, s.z + fz + hd];
    if (this.collider) this.g.col.move(this.collider, x0, z0, x1, z1);
    else this.collider = this.g.col.add(x0, z0, x1, z1, 0, 2.2, 'furniture', this);
  }

  private local(x: number, z: number, out = new THREE.Vector3()) {
    const s = this.st!;
    const c = Math.cos(s.ry), sn = Math.sin(s.ry);
    return out.set(s.x + x * c + z * sn, 0, s.z - x * sn + z * c);
  }

  /** Point in front of the forks (doors open for it while driving). */
  frontPoint() {
    return this.local(0, FORK_Z - 0.6);
  }

  // ------------------------------------------------------------------ enter / exit
  enter() {
    const g = this.g;
    if (!this.st || this.driving) return;
    if (g.carry || g.pushing) {
      g.ui.toast('Put down what you are carrying first', 'info', '📦');
      return;
    }
    this.driving = true;
    this.speed = 0;
    this.updateCollider();
    g.player.locked = true;
    g.player.yaw = this.st.ry;
    g.player.pitch = -0.18;
    audio.play('pickup');
    haptic('medium');
    g.ui.toast('Forklift: joystick drives and steers. ✋ lifts or lowers the forks, ⤵️ gets out.', 'info', '🚜', 3500);
  }

  exit(silent = false) {
    const g = this.g;
    if (!this.driving || !this.st) return;
    if (this.load) this.lower();
    this.driving = false;
    this.speed = 0;
    const s = this.st;
    // step out on the left side (or the right one if blocked)
    for (const side of [1, -1]) {
      const p = this.local(-1.05 * side, 0.2);
      const [x, z] = g.col.resolveCircle(p.x, p.z, 0.3, 0.25, 1.7);
      if (Math.hypot(x - p.x, z - p.z) < 0.25 || side === -1) {
        g.player.pos.set(x, 0, z);
        break;
      }
    }
    g.player.locked = false;
    g.player.yaw = s.ry;
    this.updateCollider();
    audio.setLoop('engine', 0);
    if (!silent) audio.play('thud');
  }

  // ------------------------------------------------------------------ forks
  /** ✋ while driving: pick up the pallet in front of the forks, or set it down. */
  toggleForks() {
    if (this.load) this.lower();
    else this.lift();
  }

  private lift() {
    const g = this.g;
    const fork = this.local(0, FORK_Z);
    let best: BoxRT | null = null;
    let bd = 0.85;
    for (const b of g.boxes.items.values()) {
      if (b.held || (b.s.kind ?? 'box') !== 'pallet') continue;
      const d = Math.hypot(b.pos.x - fork.x, b.pos.z - fork.z);
      if (d < bd && b.pos.y < 0.5) { bd = d; best = b; }
    }
    if (!best) {
      audio.play('error');
      g.ui.toast('Drive the forks under a pallet first', 'info', '🚜', 1800);
      return;
    }
    const riders = g.boxes.ridersOf(best).map((b) => ({ b, off: b.pos.clone().sub(best!.pos), y: b.pos.y - best!.pos.y }));
    this.load = { pallet: best, riders, ry0: this.st!.ry };
    // pallet snaps onto the forks, aligned with the forklift
    const dry = this.st!.ry - best.s.ry;
    for (const r of riders) r.off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dry);
    best.s.ry = this.st!.ry;
    audio.play('drawer', fork, 0.7);
    haptic('medium');
  }

  private lower() {
    if (!this.load) return;
    const g = this.g;
    const { pallet, riders } = this.load;
    pallet.pos.y = FLOOR_Y;
    pallet.resting = false;
    g.boxes.sync(pallet);
    for (const r of riders) {
      if (!g.boxes.items.has(r.b.s.uid)) continue;
      r.b.pos.y = FLOOR_Y + r.y;
      r.b.resting = false;
      g.boxes.sync(r.b);
    }
    this.load = null;
    audio.play('thud', pallet.pos, 0.7);
    haptic('light');
  }

  // ------------------------------------------------------------------ driving
  update(dt: number) {
    const g = this.g;
    const s = this.st;
    if (!s) return;
    const forkTarget = this.load ? 0.32 : 0.06;
    this.forkY += clamp(forkTarget - this.forkY, -dt * 0.6, dt * 0.6);
    if (!this.driving) {
      this.place();
      return;
    }
    const inp = g.input;
    const my = inp.enabled ? inp.moveY : 0;
    const mx = inp.enabled ? inp.moveX : 0;
    const target = my >= 0 ? my * MAX_FWD : my * MAX_REV;
    const acc = Math.abs(target) > Math.abs(this.speed) ? 3.2 : 5.5;
    this.speed += clamp(target - this.speed, -acc * dt, acc * dt);
    // steering (inverted while reversing, like a real vehicle)
    const steer = -mx * 1.25 * clamp(Math.abs(this.speed) / 1.2, 0.35, 1) * (this.speed < -0.05 ? -1 : 1);
    const dRy = Math.abs(this.speed) > 0.05 || Math.abs(mx) > 0.2 ? steer * dt : 0;
    const ry = s.ry + dRy;
    const fx = -Math.sin(ry), fz = -Math.cos(ry);
    let nx = s.x + fx * this.speed * dt;
    let nz = s.z + fz * this.speed * dt;
    [nx, nz] = g.col.resolveCircle(nx, nz, BODY_R, 0.2, 1.8);
    // front (fork tips or the pallet) must stay clear of walls too
    const frontD = this.load ? 1.9 : 2.2;
    const frontR = this.load ? 0.62 : 0.3;
    const fxp = nx + fx * frontD, fzp = nz + fz * frontD;
    const [rfx, rfz] = g.col.resolveCircle(fxp, fzp, frontR, 0.05, 1.2);
    const frontBlocked = Math.hypot(rfx - fxp, rfz - fzp) > 0.02;
    const onSales = g.building.areaAt(nx, nz) === 'sales' || g.building.areaAt(fxp, fzp) === 'sales';
    if (frontBlocked || onSales) {
      if (onSales && this.warnT <= 0) {
        g.ui.toast('Forklifts are not allowed on the sales floor', 'bad', '⛔', 1800);
        this.warnT = 3;
      }
      if (Math.abs(this.speed) > 1.5) audio.play('thud', null, 0.4);
      this.speed = 0;
    } else {
      s.x = nx;
      s.z = nz;
      s.ry = ry;
      g.player.yaw += dRy;
    }
    this.warnT -= dt;
    // camera in the driver's seat (look around freely)
    const [dx, dy] = inp.consumeLook();
    g.player.yaw -= dx;
    g.player.pitch = clamp(g.player.pitch - dy, -1.2, 1.0);
    const seat = this.local(0, 0.3);
    g.player.pos.set(seat.x, 0, seat.z);
    const cam = g.engine.camera;
    cam.position.set(seat.x, FLOOR_Y + EYE_Y, seat.z);
    cam.rotation.set(g.player.pitch, g.player.yaw, 0);
    cam.updateMatrixWorld();
    this.place();
    // carried pallet follows the forks
    if (this.load) {
      const { pallet, riders, ry0 } = this.load;
      const p = this.local(0, FORK_Z - 0.02);
      pallet.pos.set(p.x, FLOOR_Y + this.forkY + 0.02, p.z);
      pallet.s.ry = s.ry;
      pallet.resting = true;
      g.boxes.sync(pallet);
      const d = s.ry - ry0;
      const c = Math.cos(d), sn = Math.sin(d);
      for (const r of riders) {
        if (r.b.held || !g.boxes.items.has(r.b.s.uid)) continue;
        r.b.pos.set(p.x + r.off.x * c + r.off.z * sn, pallet.pos.y + r.y, p.z - r.off.x * sn + r.off.z * c);
        r.b.resting = true;
        g.boxes.sync(r.b);
      }
    }
    // sounds
    audio.setLoop('engine', 0.22 + Math.abs(this.speed) * 0.07);
    if (this.speed < -0.2) {
      this.beepT -= dt;
      if (this.beepT <= 0) {
        this.beepT = 0.7;
        audio.play('reverse', null, 0.35);
      }
    } else this.beepT = 0;
  }
}
