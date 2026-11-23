// Furniture runtime: instanced rendering per type, colliders, slot transforms and world boxes.
import * as THREE from 'three';
import { FURN_MAP, type FurnDef, type SlotDef } from '../data/furniture';
import type { FurnGeo } from '../gfx/FurnitureModels';
import type { FurnitureState } from './state';
import type { Collision, Collider } from './Collision';
import { FLOOR_Y } from './layout';

export interface SlotRT {
  index: number;
  def: SlotDef;
  matrix: THREE.Matrix4; // slot frame -> world
  center: THREE.Vector3; // world center of slot volume
  box: THREE.Box3;
  access: THREE.Vector3; // where a customer stands (floor)
  face: number; // world yaw the customer faces to look at the slot
}

export interface FurnRT {
  s: FurnitureState;
  def: FurnDef;
  matrix: THREE.Matrix4;
  box: THREE.Box3;
  collider: Collider | null;
  slots: SlotRT[];
  handles: { part: Part; index: number }[];
  hidden: boolean;
}

type Part = 'solid' | 'metal' | 'glass' | 'glow';

interface TypeRender {
  geo: FurnGeo;
  meshes: Partial<Record<Part, THREE.InstancedMesh>>;
  owners: FurnRT[];
  capacity: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();
const _c = new THREE.Color();
const ONE = new THREE.Color(1, 1, 1);
const DIM = new THREE.Color(0.08, 0.08, 0.1);

export class FurnitureSystem {
  readonly group = new THREE.Group();
  readonly items = new Map<number, FurnRT>();
  private types = new Map<string, TypeRender>();
  private mats: Record<Part, THREE.Material>;
  version = 0;
  powerOn = true;

  constructor(scene: THREE.Scene, private col: Collision) {
    scene.add(this.group);
    this.mats = {
      solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }),
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.55 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0.1, depthWrite: false, envMapIntensity: 1.6 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    };
  }

  private typeRender(def: FurnDef): TypeRender {
    let t = this.types.get(def.id);
    if (!t) {
      t = { geo: def.build(), meshes: {}, owners: [], capacity: 0 };
      this.types.set(def.id, t);
    }
    return t;
  }

  private ensureCapacity(t: TypeRender, n: number) {
    if (n <= t.capacity) return;
    const cap = Math.max(4, 1 << Math.ceil(Math.log2(n)));
    for (const part of ['solid', 'metal', 'glass', 'glow'] as Part[]) {
      const g = t.geo[part];
      if (!g) continue;
      const old = t.meshes[part];
      const im = new THREE.InstancedMesh(g, this.mats[part], cap);
      im.count = 0;
      im.castShadow = part === 'solid' || part === 'metal';
      im.receiveShadow = part !== 'glow' && part !== 'glass';
      if (part === 'glass') im.renderOrder = 3;
      im.frustumCulled = false;
      if (part === 'glow') {
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      }
      if (old) {
        for (let i = 0; i < old.count; i++) {
          old.getMatrixAt(i, _m);
          im.setMatrixAt(i, _m);
          if (part === 'glow' && old.instanceColor) {
            old.getColorAt(i, _c);
            im.setColorAt(i, _c);
          }
        }
        im.count = old.count;
        this.group.remove(old);
        old.dispose();
      }
      t.meshes[part] = im;
      this.group.add(im);
    }
    t.capacity = cap;
  }

  computeMatrix(s: { x: number; z: number; ry: number }, out = new THREE.Matrix4()) {
    _e.set(0, s.ry, 0);
    _q.setFromEuler(_e);
    _v.set(s.x, FLOOR_Y, s.z);
    return out.compose(_v, _q, _s);
  }

  /** World AABB of a footprint (rotation multiple of 90°). */
  footprint(def: FurnDef, x: number, z: number, ry: number): [number, number, number, number] {
    const [w, d] = def.size;
    const q = Math.round(ry / (Math.PI / 2)) & 1;
    const hw = (q ? d : w) / 2, hd = (q ? w : d) / 2;
    return [x - hw, z - hd, x + hw, z + hd];
  }

  add(s: FurnitureState): FurnRT {
    const def = FURN_MAP.get(s.id)!;
    const t = this.typeRender(def);
    const rt: FurnRT = { s, def, matrix: new THREE.Matrix4(), box: new THREE.Box3(), collider: null, slots: [], handles: [], hidden: false };
    this.ensureCapacity(t, t.owners.length + 1);
    const index = t.owners.length;
    t.owners.push(rt);
    for (const part of Object.keys(t.meshes) as Part[]) {
      const im = t.meshes[part]!;
      im.count = t.owners.length;
      rt.handles.push({ part, index });
    }
    this.items.set(s.uid, rt);
    this.place(rt);
    this.version++;
    return rt;
  }

  remove(uid: number) {
    const rt = this.items.get(uid);
    if (!rt) return;
    const t = this.types.get(rt.def.id)!;
    const idx = t.owners.indexOf(rt);
    const last = t.owners.length - 1;
    if (idx !== last) {
      const moved = t.owners[last];
      t.owners[idx] = moved;
      for (const part of Object.keys(t.meshes) as Part[]) {
        const im = t.meshes[part]!;
        im.getMatrixAt(last, _m);
        im.setMatrixAt(idx, _m);
        if (part === 'glow') {
          im.getColorAt(last, _c);
          im.setColorAt(idx, _c);
          im.instanceColor!.needsUpdate = true;
        }
        im.instanceMatrix.needsUpdate = true;
      }
      for (const h of moved.handles) h.index = idx;
    }
    t.owners.pop();
    for (const part of Object.keys(t.meshes) as Part[]) t.meshes[part]!.count = t.owners.length;
    this.col.remove(rt.collider);
    this.items.delete(uid);
    this.version++;
  }

  /** (Re)computes transform, collider and slot frames after a move. */
  place(rt: FurnRT) {
    const { s, def } = rt;
    this.computeMatrix(s, rt.matrix);
    const t = this.types.get(def.id)!;
    for (const h of rt.handles) {
      const im = t.meshes[h.part]!;
      im.setMatrixAt(h.index, rt.hidden ? _m.makeScale(0, 0, 0) : rt.matrix);
      im.instanceMatrix.needsUpdate = true;
    }
    const [x0, z0, x1, z1] = this.footprint(def, s.x, s.z, s.ry);
    rt.box.set(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, def.size[2], z1));
    const tall = def.id === 'whiteboard' || def.id === 'tv' || def.id === 'clock';
    if (!tall && def.id !== 'pallet') {
      const shrink = 0.03;
      if (rt.collider) this.col.move(rt.collider, x0 + shrink, z0 + shrink, x1 - shrink, z1 - shrink);
      else rt.collider = this.col.add(x0 + shrink, z0 + shrink, x1 - shrink, z1 - shrink, 0, def.size[2], 'furniture', rt);
    }
    // slots
    rt.slots = (def.slots ?? []).map((sd, i) => this.slotFrame(rt, sd, i));
    this.updateGlow(rt);
    this.version++;
  }

  private slotFrame(rt: FurnRT, sd: SlotDef, index: number): SlotRT {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(sd.x, sd.y, sd.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(sd.tilt, sd.ry, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    const matrix = new THREE.Matrix4().multiplyMatrices(rt.matrix, local);
    const box = new THREE.Box3();
    const corners = [
      [-sd.w / 2, 0, -sd.d / 2], [sd.w / 2, 0, -sd.d / 2], [-sd.w / 2, 0, sd.d / 2], [sd.w / 2, 0, sd.d / 2],
      [-sd.w / 2, sd.h, -sd.d / 2], [sd.w / 2, sd.h, -sd.d / 2], [-sd.w / 2, sd.h, sd.d / 2], [sd.w / 2, sd.h, sd.d / 2],
    ];
    for (const c of corners) box.expandByPoint(new THREE.Vector3(c[0], c[1], c[2]).applyMatrix4(matrix));
    const center = box.getCenter(new THREE.Vector3());
    // access point in front of the furniture on the slot's side
    const side = Math.cos(sd.ry) >= 0 ? 1 : -1;
    const accessLocal = new THREE.Vector3(sd.x, 0, side * (rt.def.size[1] / 2 + 0.5));
    const access = accessLocal.applyMatrix4(rt.matrix);
    access.y = 0;
    const face = rt.s.ry + (side > 0 ? 0 : Math.PI) + Math.PI; // look toward -front
    return { index, def: sd, matrix, center, box, access, face };
  }

  /** World position of a point given in furniture-local coords. */
  local(rt: FurnRT, x: number, y: number, z: number, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyMatrix4(rt.matrix);
  }

  setHidden(rt: FurnRT, hidden: boolean) {
    if (rt.hidden === hidden) return;
    rt.hidden = hidden;
    this.place(rt);
  }

  updateGlow(rt: FurnRT) {
    const t = this.types.get(rt.def.id)!;
    const im = t.meshes.glow;
    if (!im) return;
    const h = rt.handles.find((x) => x.part === 'glow');
    if (!h) return;
    const on = this.powerOn && !rt.s.broken;
    im.setColorAt(h.index, on ? ONE : DIM);
    im.instanceColor!.needsUpdate = true;
  }

  setPower(on: boolean) {
    this.powerOn = on;
    for (const rt of this.items.values()) this.updateGlow(rt);
  }

  /** Decoration score (capped). */
  beauty(): number {
    let b = 0;
    for (const rt of this.items.values()) b += rt.def.beauty ?? 0;
    return Math.min(8, b);
  }

  byDef(id: string): FurnRT[] {
    const out: FurnRT[] = [];
    for (const rt of this.items.values()) if (rt.def.id === id) out.push(rt);
    return out;
  }
}
