// Walking character with path following, separation and simple stuck recovery.
import * as THREE from 'three';
import { Human, type HumanLook } from '../gfx/Human';
import type { NavGrid } from './Nav';
import type { Collision } from './Collision';
import { dampAngle } from '../core/util';
import { STREET } from '../world/City';

let nextAgentId = 1;

export class Agent {
  readonly id = nextAgentId++;
  human: Human;
  pos = new THREE.Vector3();
  yaw = 0;
  path: [number, number][] = [];
  pathIdx = 0;
  maxSpeed = 1.3;
  speed = 0;
  staff = false;
  arrived = true;
  private stuckT = 0;
  private lastPos = new THREE.Vector3();
  private goal: [number, number] | null = null;
  faceYaw: number | null = null;
  radius = 0.26;
  hidden = false;
  /** small random offset so crowds don't walk single file */
  private jitter = (Math.random() - 0.5) * 0.3;

  constructor(look: HumanLook, scene: THREE.Object3D) {
    this.human = new Human(look);
    scene.add(this.human.root);
  }

  /** Returns false if no path could be found. */
  goTo(x: number, z: number, nav: NavGrid): boolean {
    const p = nav.find(this.pos.x, this.pos.z, x, z, this.staff);
    this.goal = [x, z];
    if (!p) {
      this.path = [];
      this.arrived = true;
      return false;
    }
    this.path = p;
    this.pathIdx = 0;
    this.arrived = false;
    this.stuckT = 0;
    this.faceYaw = null;
    return true;
  }

  stop() {
    this.path = [];
    this.arrived = true;
  }

  get destination() { return this.goal; }

  update(dt: number, nav: NavGrid, col: Collision, others: Agent[], player: THREE.Vector3) {
    const h = this.human;
    let vx = 0, vz = 0;
    if (!this.arrived && this.path.length) {
      const [tx, tz] = this.path[this.pathIdx];
      const last = this.pathIdx === this.path.length - 1;
      let dx = tx - this.pos.x, dz = tz - this.pos.z;
      // sideways offset on long legs (lane keeping)
      const d = Math.hypot(dx, dz);
      const reach = last ? 0.12 : 0.45;
      if (d < reach) {
        if (last) {
          this.arrived = true;
          this.path = [];
        } else this.pathIdx++;
      } else {
        dx /= d; dz /= d;
        const target = this.maxSpeed * (last ? Math.min(1, d / 0.6 + 0.25) : 1);
        this.speed += (target - this.speed) * Math.min(1, dt * 4);
        vx = dx * this.speed;
        vz = dz * this.speed;
        if (!last && d > 2) {
          vx += -dz * this.jitter * 0.3;
          vz += dx * this.jitter * 0.3;
        }
      }
    }
    if (this.arrived) this.speed += (0 - this.speed) * Math.min(1, dt * 8);
    // separation
    let sx = 0, sz = 0;
    for (const o of others) {
      if (o === this || o.hidden) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz;
      if (d2 > 0.6 * 0.6 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (0.6 - d) / 0.6;
      sx += (ox / d) * push;
      sz += (oz / d) * push;
    }
    const px = this.pos.x - player.x, pz = this.pos.z - player.z;
    const pd = Math.hypot(px, pz);
    if (pd < 0.7 && pd > 1e-4) {
      sx += (px / pd) * (0.7 - pd) * 2;
      sz += (pz / pd) * (0.7 - pd) * 2;
    }
    const sepK = this.arrived ? 0.6 : 1.1;
    let nx = this.pos.x + (vx + sx * sepK) * dt;
    let nz = this.pos.z + (vz + sz * sepK) * dt;
    [nx, nz] = col.resolveCircle(nx, nz, this.radius, 0.3, 1.6, (c) => c.tag === 'door' || (c.tag === 'furniture' && !this.arrived && this.path.length > 0 && false));
    this.pos.x = nx;
    this.pos.z = nz;
    this.pos.y = this.pos.z > STREET.roadZ0 && this.pos.z < STREET.roadZ1 ? STREET.roadY : 0;
    // facing
    const mv = Math.hypot(vx, vz);
    if (mv > 0.15) this.yaw = dampAngle(this.yaw, Math.atan2(vx, vz), 10, dt);
    else if (this.faceYaw !== null) this.yaw = dampAngle(this.yaw, this.faceYaw, 8, dt);
    // stuck detection
    if (!this.arrived) {
      const moved = this.pos.distanceTo(this.lastPos);
      if (moved < 0.15 * dt) this.stuckT += dt;
      else this.stuckT = Math.max(0, this.stuckT - dt);
      if (this.stuckT > 2.5 && this.goal) {
        this.stuckT = 0;
        // nudge and re-path
        this.pos.x += (Math.random() - 0.5) * 0.4;
        this.pos.z += (Math.random() - 0.5) * 0.4;
        this.goTo(this.goal[0], this.goal[1], nav);
      }
    }
    this.lastPos.copy(this.pos);
    h.speed = Math.hypot(vx, vz);
    h.root.position.copy(this.pos);
    h.root.rotation.y = this.yaw;
    h.root.visible = !this.hidden;
    h.update(dt);
  }

  dispose() {
    this.human.dispose();
  }
}
