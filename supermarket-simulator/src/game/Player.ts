// First-person player: movement with collisions, head bob, footsteps, held item / tool rendering.
import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { Collision } from './Collision';
import { STREET } from '../world/City';
import { audio } from '../core/Audio';
import { clamp, dampTo } from '../core/util';
import { GeoBuilder } from '../gfx/GeoBuilder';

export const EYE = 1.62;
export const PLAYER_R = 0.3;

export class Player {
  pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  vel = new THREE.Vector3();
  speedMul = 1;
  moving = false;
  private bobPhase = 0;
  private lastStep = 0;
  heldObj: THREE.Object3D | null = null;
  private heldGroup = new THREE.Group();
  private toolGroup = new THREE.Group();
  private mopMesh: THREE.Object3D;
  tool: 'none' | 'mop' = 'none';
  toolAnim = 0;
  locked = false; // camera controlled elsewhere (checkout / menus)
  bounds = { x0: -60, x1: 135, z0: -52, z1: 19.2 };
  private ground = 0;

  constructor(private engine: Engine, private input: Input, private col: Collision) {
    engine.overlayScene.add(this.heldGroup);
    engine.overlayScene.add(this.toolGroup);
    const b = new GeoBuilder();
    b.cyl(0.018, 0.018, 1.3, '#9e9e9e', 0, 0.65, 0, { seg: 6 });
    b.box(0.3, 0.05, 0.08, '#1565c0', 0, 0.02, 0);
    for (let i = 0; i < 9; i++) b.cyl(0.012, 0.01, 0.16, '#f1f1ea', -0.13 + i * 0.033, -0.05, (i % 2) * 0.03 - 0.015, { seg: 4, rz: (i - 4) * 0.05 });
    this.mopMesh = new THREE.Mesh(b.build()!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    this.toolGroup.add(this.mopMesh);
    this.toolGroup.visible = false;
  }

  setHeld(obj: THREE.Object3D | null) {
    if (this.heldObj) this.heldGroup.remove(this.heldObj);
    this.heldObj = obj;
    if (obj) this.heldGroup.add(obj);
    this.engine.overlayActive = !!obj || this.tool !== 'none';
  }

  setTool(t: 'none' | 'mop') {
    this.tool = t;
    this.toolGroup.visible = t === 'mop';
    this.engine.overlayActive = !!this.heldObj || t !== 'none';
  }

  groundAt(x: number, z: number) {
    if (z > STREET.roadZ0 && z < STREET.roadZ1) return STREET.roadY;
    return 0;
  }

  update(dt: number) {
    const cam = this.engine.camera;
    if (!this.locked) {
      const [dx, dy] = this.input.consumeLook();
      this.yaw -= dx;
      this.pitch = clamp(this.pitch - dy, -1.45, 1.45);
      const run = this.input.running;
      const base = (run ? 5.0 : 3.0) * this.speedMul;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const mx = this.input.enabled ? this.input.moveX : 0;
      const my = this.input.enabled ? this.input.moveY : 0;
      const tvx = (fx * my + rx * mx) * base;
      const tvz = (fz * my + rz * mx) * base;
      this.vel.x = dampTo(this.vel.x, tvx, 12, dt);
      this.vel.z = dampTo(this.vel.z, tvz, 12, dt);
      let nx = this.pos.x + this.vel.x * dt;
      let nz = this.pos.z + this.vel.z * dt;
      [nx, nz] = this.col.resolveCircle(nx, nz, PLAYER_R, this.pos.y + 0.25, this.pos.y + 1.7);
      nx = clamp(nx, this.bounds.x0, this.bounds.x1);
      nz = clamp(nz, this.bounds.z0, this.bounds.z1);
      const moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
      this.pos.x = nx;
      this.pos.z = nz;
      this.ground = dampTo(this.ground, this.groundAt(nx, nz), 14, dt);
      this.pos.y = this.ground;
      const speed = moved / Math.max(dt, 1e-4);
      this.moving = speed > 0.4;
      if (this.moving) {
        this.bobPhase += dt * speed * 2.1;
        const stepIdx = Math.floor(this.bobPhase / Math.PI);
        if (stepIdx !== this.lastStep) {
          this.lastStep = stepIdx;
          audio.play('step', null, run ? 0.9 : 0.6);
        }
      } else this.bobPhase = dampTo(this.bobPhase, Math.round(this.bobPhase / Math.PI) * Math.PI, 6, dt);
      const bob = Math.sin(this.bobPhase * 2) * 0.03 * (this.moving ? 1 : 0.3);
      cam.position.set(this.pos.x, this.pos.y + EYE + bob, this.pos.z);
      cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bobPhase) * 0.004);
    }
    cam.updateMatrixWorld();
    // held item in front of camera (overlay pass)
    if (this.heldObj) {
      const sway = Math.sin(this.bobPhase) * 0.015;
      this.heldGroup.position.set(0.0 + sway, -0.52 + Math.abs(Math.cos(this.bobPhase)) * 0.012, -0.85).applyMatrix4(cam.matrixWorld);
      this.heldGroup.quaternion.copy(cam.quaternion);
      this.heldGroup.rotateX(0.32);
    }
    if (this.tool === 'mop') {
      this.toolAnim = Math.max(0, this.toolAnim - dt);
      const swish = this.toolAnim > 0 ? Math.sin(performance.now() * 0.018) * 0.25 : 0;
      this.toolGroup.position.set(0.38 + swish * 0.4, -0.9, -0.75).applyMatrix4(cam.matrixWorld);
      this.toolGroup.quaternion.copy(cam.quaternion);
      this.toolGroup.rotateX(0.5);
      this.toolGroup.rotateZ(0.35 + swish);
    }
  }

  /** Ray from the eye through the screen center. */
  ray(out = new THREE.Ray()) {
    const cam = this.engine.camera;
    out.origin.copy(cam.position);
    out.direction.set(0, 0, -1).applyQuaternion(cam.quaternion);
    return out;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
