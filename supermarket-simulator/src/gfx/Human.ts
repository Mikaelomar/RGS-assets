// Procedural rigged human: one SkinnedMesh per person (1 draw call), 18 bones, procedural animation.
import * as THREE from 'three';
import { GeoBuilder } from './GeoBuilder';
import { Rng, dampTo } from '../core/util';
import { basketMesh, cartMesh } from './FurnitureModels';

export const SKIN = ['#f6d8c8', '#efc7ad', '#e2b08f', '#d29a74', '#bd8158', '#a36a45', '#875234', '#6a3e26', '#4d2c1b'];
export const HAIR = ['#141414', '#2b1d13', '#3f2817', '#5b3920', '#7c4e2a', '#a46b35', '#c99852', '#e0c587', '#9a9a9a', '#d8d8d8', '#7a2e1a', '#b5462a'];
const SHIRTS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00897b', '#5d4037', '#212121', '#eceff1', '#3949ab', '#d81b60', '#6d4c41', '#c0ca33', '#26c6da', '#f48fb1', '#90a4ae', '#ffffff', '#455a64'];
const PANTS = ['#1f3a5f', '#2b4c7e', '#16263b', '#212121', '#424242', '#6d5a3f', '#8d7b5c', '#3e2723', '#546e7a', '#1b5e20'];
const SHOES = ['#f5f5f5', '#212121', '#5d4037', '#1e88e5', '#9e9e9e', '#d32f2f'];

export type HairStyle = 'short' | 'buzz' | 'long' | 'bun' | 'ponytail' | 'curly' | 'bald' | 'bob';

export interface HumanLook {
  female: boolean;
  height: number;
  width: number;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  shirt2: string;
  pants: string;
  shoes: string;
  longSleeves: boolean;
  skirt: boolean;
  shorts: boolean;
  beard: boolean;
  glasses: boolean;
  hat: string | null;
  uniform?: 'polo' | 'apron' | 'vest' | 'security' | 'overalls' | 'suit' | 'chef';
  badge?: boolean;
  age: number;
}

export function randomLook(seed: number, opts: { female?: boolean } = {}): HumanLook {
  const r = new Rng(seed * 9973 + 17);
  const female = opts.female ?? r.chance(0.5);
  const age = r.pick([0, 1, 1, 1, 2, 2, 3]); // 0 teen, 1 adult, 2 middle, 3 senior
  const height = (female ? r.range(1.55, 1.75) : r.range(1.66, 1.92)) * (age === 0 ? 0.95 : 1);
  const hair = age === 3 ? r.pick(['#9a9a9a', '#d8d8d8', '#bdbdbd']) : r.pick(HAIR.slice(0, 8).concat(['#7a2e1a']));
  const styles: HairStyle[] = female ? ['long', 'long', 'bun', 'ponytail', 'bob', 'curly', 'short'] : ['short', 'short', 'buzz', 'curly', 'bald', 'short', 'ponytail'];
  return {
    female,
    height,
    width: r.range(0.92, 1.18) * (female ? 0.94 : 1),
    skin: r.pick(SKIN),
    hair,
    hairStyle: age === 3 && !female && r.chance(0.5) ? 'bald' : r.pick(styles),
    shirt: r.pick(SHIRTS),
    shirt2: r.pick(SHIRTS),
    pants: r.pick(PANTS),
    shoes: r.pick(SHOES),
    longSleeves: r.chance(0.45),
    skirt: female && r.chance(0.3),
    shorts: !female && r.chance(0.15),
    beard: !female && age > 0 && r.chance(0.35),
    glasses: r.chance(age >= 2 ? 0.45 : 0.15),
    hat: r.chance(0.1) ? r.pick(['#d32f2f', '#1565c0', '#212121', '#f9a825']) : null,
    age,
  };
}

export function staffLook(seed: number, female: boolean, color: string, uniform: HumanLook['uniform']): HumanLook {
  const l = randomLook(seed, { female });
  l.shirt = color;
  l.longSleeves = uniform === 'security' || uniform === 'suit' || uniform === 'overalls';
  l.skirt = false;
  l.shorts = false;
  l.hat = uniform === 'chef' ? '#ffffff' : null;
  l.pants = uniform === 'overalls' ? color : uniform === 'suit' ? '#263238' : '#22262a';
  l.shoes = '#1a1a1a';
  l.uniform = uniform;
  l.badge = true;
  return l;
}

// Bone indices
const B = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5,
  uaL: 6, faL: 7, handL: 8, uaR: 9, faR: 10, handR: 11,
  thL: 12, shL: 13, ftL: 14, thR: 15, shR: 16, ftR: 17,
};

interface Joints { [k: string]: THREE.Vector3 }

function joints(H: number, W: number): Joints {
  return {
    root: new THREE.Vector3(0, 0, 0),
    hips: new THREE.Vector3(0, 0.53 * H, 0),
    spine: new THREE.Vector3(0, 0.6 * H, 0),
    chest: new THREE.Vector3(0, 0.69 * H, 0),
    neck: new THREE.Vector3(0, 0.815 * H, 0),
    head: new THREE.Vector3(0, 0.855 * H, 0),
    uaL: new THREE.Vector3(0.112 * H * W, 0.8 * H, 0),
    faL: new THREE.Vector3(0.118 * H * W, 0.64 * H, 0),
    handL: new THREE.Vector3(0.121 * H * W, 0.495 * H, 0.004 * H),
    uaR: new THREE.Vector3(-0.112 * H * W, 0.8 * H, 0),
    faR: new THREE.Vector3(-0.118 * H * W, 0.64 * H, 0),
    handR: new THREE.Vector3(-0.121 * H * W, 0.495 * H, 0.004 * H),
    thL: new THREE.Vector3(0.052 * H * W, 0.51 * H, 0),
    shL: new THREE.Vector3(0.054 * H * W, 0.285 * H, 0),
    ftL: new THREE.Vector3(0.055 * H * W, 0.045 * H, 0),
    thR: new THREE.Vector3(-0.052 * H * W, 0.51 * H, 0),
    shR: new THREE.Vector3(-0.054 * H * W, 0.285 * H, 0),
    ftR: new THREE.Vector3(-0.055 * H * W, 0.045 * H, 0),
  };
}

const PARENT: Record<string, string | null> = {
  root: null, hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  uaL: 'chest', faL: 'uaL', handL: 'faL', uaR: 'chest', faR: 'uaR', handR: 'faR',
  thL: 'hips', shL: 'thL', ftL: 'shL', thR: 'hips', shR: 'thR', ftR: 'shR',
};
const ORDER = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'uaL', 'faL', 'handL', 'uaR', 'faR', 'handR', 'thL', 'shL', 'ftL', 'thR', 'shR', 'ftR'];

const geoCache = new Map<string, THREE.BufferGeometry>();
let sharedMat: THREE.MeshStandardMaterial | null = null;
export function humanMaterial() {
  if (!sharedMat) sharedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0 });
  return sharedMat;
}

function lookKey(l: HumanLook) { return JSON.stringify(l); }

function buildGeometry(l: HumanLook): THREE.BufferGeometry {
  const H = l.height, W = l.width;
  const J = joints(H, W);
  const b = new GeoBuilder();
  b.skinned = true;
  const skin = l.skin;
  const shirt = l.shirt;
  const pants = l.pants;
  const f = l.female;
  // ---- pelvis
  b.rbox(0.2 * H * W, 0.11 * H, 0.115 * H, 0.04 * H, pants, 0, J.hips.y - 0.015 * H, 0, { bone: B.hips }, 2);
  // ---- abdomen + chest
  b.cyl(0.088 * H * W, (f ? 0.092 : 0.088) * H * W, 0.12 * H, shirt, 0, J.spine.y + 0.03 * H, 0, { bone: B.spine, sz: 0.68, seg: 14 });
  b.lathe([[0.001, 0], [0.09 * H * W, 0.0], [0.103 * H * W, 0.06 * H], [0.106 * H * W, 0.1 * H], [0.085 * H * W, 0.128 * H], [0.03 * H, 0.138 * H], [0.001, 0.14 * H]], shirt, 0, J.chest.y - 0.012 * H, 0, { bone: B.chest, sz: 0.62, seg: 14 });
  if (f) {
    b.sphere(0.038 * H, shirt, 0.036 * H * W, J.chest.y + 0.055 * H, 0.04 * H, { bone: B.chest, ws: 9, hs: 7, sz: 0.8 });
    b.sphere(0.038 * H, shirt, -0.036 * H * W, J.chest.y + 0.055 * H, 0.04 * H, { bone: B.chest, ws: 9, hs: 7, sz: 0.8 });
  }
  // collar
  b.torus(0.033 * H, 0.008 * H, l.uniform === 'polo' || l.uniform === 'security' ? shirt : skin, 0, J.chest.y + 0.124 * H, 0.002 * H, { rx: Math.PI / 2, bone: B.chest, rs: 5, ts: 12, sy: 0.8 });
  // uniform details
  if (l.badge) b.box(0.035 * H, 0.016 * H, 0.004 * H, '#ffffff', 0.05 * H * W, J.chest.y + 0.08 * H, 0.066 * H, { bone: B.chest });
  if (l.uniform === 'apron' || l.uniform === 'chef') {
    const ac = l.uniform === 'chef' ? '#fafafa' : '#ffffff';
    b.box(0.17 * H * W, 0.24 * H, 0.006 * H, ac, 0, J.hips.y + 0.04 * H, 0.068 * H, { bone: B.hips });
    b.box(0.13 * H * W, 0.1 * H, 0.006 * H, ac, 0, J.chest.y + 0.05 * H, 0.067 * H, { bone: B.chest });
  }
  if (l.uniform === 'vest') {
    b.lathe([[0.092 * H * W, 0.0], [0.108 * H * W, 0.06 * H], [0.11 * H * W, 0.1 * H], [0.088 * H * W, 0.125 * H]], '#ffd600', 0, J.chest.y - 0.02 * H, 0, { bone: B.chest, sz: 0.66, seg: 14 });
    b.box(0.2 * H * W, 0.012 * H, 0.15 * H, '#cfd8dc', 0, J.chest.y + 0.02 * H, 0, { bone: B.chest });
    b.box(0.2 * H * W, 0.012 * H, 0.15 * H, '#cfd8dc', 0, J.chest.y + 0.06 * H, 0, { bone: B.chest });
  }
  if (l.uniform === 'suit') {
    b.box(0.012 * H, 0.1 * H, 0.004 * H, '#b71c1c', 0, J.chest.y + 0.06 * H, 0.067 * H, { bone: B.chest });
  }
  // ---- neck & head
  b.cyl(0.03 * H, 0.033 * H, 0.06 * H, skin, 0, J.neck.y + 0.01 * H, 0, { bone: B.neck, seg: 10 });
  const hy = J.head.y + 0.06 * H;
  b.sphere(0.062 * H, skin, 0, hy, 0, { bone: B.head, sx: 0.9, sy: 1.08, sz: 0.98, ws: 14, hs: 10 });
  b.sphere(0.045 * H, skin, 0, hy - 0.032 * H, 0.014 * H, { bone: B.head, sx: 1.0, sy: 0.8, sz: 1.05, ws: 10, hs: 6 }); // jaw
  // ears
  b.sphere(0.014 * H, skin, 0.057 * H, hy, 0, { bone: B.head, sx: 0.5, sy: 1.1, ws: 6, hs: 5 });
  b.sphere(0.014 * H, skin, -0.057 * H, hy, 0, { bone: B.head, sx: 0.5, sy: 1.1, ws: 6, hs: 5 });
  // eyes
  for (const s of [-1, 1]) {
    b.sphere(0.0105 * H, '#fbfbfb', s * 0.022 * H, hy + 0.008 * H, 0.05 * H, { bone: B.head, ws: 8, hs: 6, sz: 0.6 });
    b.sphere(0.0062 * H, '#2a1a10', s * 0.022 * H, hy + 0.008 * H, 0.0555 * H, { bone: B.head, ws: 6, hs: 5, sz: 0.5 });
    b.box(0.024 * H, 0.004 * H, 0.006 * H, l.hair === '#d8d8d8' ? '#9a9a9a' : l.hair, s * 0.023 * H, hy + 0.025 * H, 0.054 * H, { bone: B.head, rz: s * -0.12 });
  }
  // nose + mouth
  b.sphere(0.01 * H, skin, 0, hy - 0.006 * H, 0.06 * H, { bone: B.head, sx: 0.8, sy: 1.3, sz: 1.1, ws: 7, hs: 5 });
  b.box(0.026 * H, 0.0055 * H, 0.004 * H, f ? '#b5525a' : '#9b5a52', 0, hy - 0.027 * H, 0.0565 * H, { bone: B.head });
  if (l.glasses) {
    for (const s of [-1, 1]) b.torus(0.0125 * H, 0.0018 * H, '#1d1d1d', s * 0.022 * H, hy + 0.008 * H, 0.059 * H, { bone: B.head, rs: 4, ts: 10 });
    b.box(0.012 * H, 0.002 * H, 0.002 * H, '#1d1d1d', 0, hy + 0.009 * H, 0.06 * H, { bone: B.head });
  }
  if (l.beard) {
    b.sphere(0.05 * H, l.hair, 0, hy - 0.03 * H, 0.012 * H, { bone: B.head, sx: 0.95, sy: 0.85, sz: 1.02, ws: 12, hs: 8, thetaStart: Math.PI * 0.45, thetaLength: Math.PI * 0.55 });
  }
  // hair
  const hc = l.hair;
  const cap = (r: number, len: number, sy = 1.08) => b.sphere(r * H, hc, 0, hy + 0.002 * H, -0.006 * H, { bone: B.head, sx: 0.93, sy, sz: 1.0, rx: -0.42, ws: 12, hs: 7, thetaLength: Math.PI * len });
  switch (l.hairStyle) {
    case 'short': cap(0.066, 0.52); break;
    case 'buzz': cap(0.064, 0.48); break;
    case 'curly':
      cap(0.068, 0.55);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.sphere(0.022 * H, hc, Math.cos(a) * 0.05 * H, hy + 0.045 * H + Math.sin(i) * 0.01 * H, Math.sin(a) * 0.05 * H - 0.008 * H, { bone: B.head, ws: 6, hs: 5 });
      }
      break;
    case 'long':
      cap(0.067, 0.56);
      b.rbox(0.12 * H, 0.15 * H, 0.03 * H, 0.012 * H, hc, 0, hy - 0.05 * H, -0.048 * H, { bone: B.head });
      b.rbox(0.022 * H, 0.11 * H, 0.06 * H, 0.01 * H, hc, 0.058 * H, hy - 0.035 * H, -0.01 * H, { bone: B.head });
      b.rbox(0.022 * H, 0.11 * H, 0.06 * H, 0.01 * H, hc, -0.058 * H, hy - 0.035 * H, -0.01 * H, { bone: B.head });
      break;
    case 'bob':
      cap(0.068, 0.58);
      b.rbox(0.13 * H, 0.07 * H, 0.1 * H, 0.03 * H, hc, 0, hy - 0.015 * H, -0.012 * H, { bone: B.head });
      break;
    case 'bun':
      cap(0.066, 0.53);
      b.sphere(0.03 * H, hc, 0, hy + 0.055 * H, -0.04 * H, { bone: B.head, ws: 8, hs: 6 });
      break;
    case 'ponytail':
      cap(0.066, 0.53);
      b.capsule(0.016 * H, 0.08 * H, hc, 0, hy - 0.03 * H, -0.07 * H, { bone: B.head, rx: 0.3, radial: 6, cap: 2 });
      break;
    case 'bald':
      break;
  }
  if (l.hat) {
    b.sphere(0.068 * H, l.hat, 0, hy + 0.012 * H, -0.002 * H, { bone: B.head, sx: 0.95, sy: 0.9, ws: 14, hs: 8, thetaLength: Math.PI * 0.45 });
    if (l.uniform === 'chef') b.cyl(0.06 * H, 0.06 * H, 0.06 * H, l.hat, 0, hy + 0.08 * H, 0, { bone: B.head, seg: 12 });
    else b.box(0.08 * H, 0.006 * H, 0.06 * H, l.hat, 0, hy + 0.035 * H, 0.07 * H, { bone: B.head });
  }
  // ---- arms
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const ua = J['ua' + side], fa = J['fa' + side], hd = J['hand' + side];
    const boneUA = side === 'L' ? B.uaL : B.uaR;
    const boneFA = side === 'L' ? B.faL : B.faR;
    const boneH = side === 'L' ? B.handL : B.handR;
    b.sphere(0.033 * H * W, shirt, ua.x - sx * 0.004 * H, ua.y - 0.006 * H, 0, { bone: boneUA, ws: 10, hs: 8, sy: 0.85 }); // shoulder
    const uaLen = ua.y - fa.y;
    if (l.longSleeves) b.capsule(0.028 * H * W, uaLen, shirt, (ua.x + fa.x) / 2, (ua.y + fa.y) / 2, 0, { bone: boneUA, radial: 8, cap: 3 });
    else {
      b.capsule(0.026 * H * W, uaLen, skin, (ua.x + fa.x) / 2, (ua.y + fa.y) / 2, 0, { bone: boneUA, radial: 8, cap: 3 });
      b.cyl(0.033 * H * W, 0.03 * H * W, uaLen * 0.5, shirt, ua.x, ua.y - uaLen * 0.2, 0, { bone: boneUA, seg: 10 });
    }
    const faLen = fa.y - hd.y;
    b.capsule(0.022 * H, faLen, l.longSleeves ? shirt : skin, (fa.x + hd.x) / 2, (fa.y + hd.y) / 2, 0.002 * H, { bone: boneFA, radial: 8, cap: 3 });
    if (l.longSleeves) b.cyl(0.022 * H, 0.022 * H, 0.012 * H, skin, hd.x, hd.y + 0.004 * H, 0.003 * H, { bone: boneFA, seg: 8 });
    b.sphere(0.026 * H, skin, hd.x, hd.y - 0.035 * H, 0.006 * H, { bone: boneH, sx: 0.55, sy: 1.25, sz: 0.95, ws: 8, hs: 7 });
    b.capsule(0.007 * H, 0.025 * H, skin, hd.x - sx * 0.002 * H, hd.y - 0.025 * H, 0.025 * H, { bone: boneH, rx: 0.6, radial: 5, cap: 2 });
  }
  // ---- legs
  for (const side of ['L', 'R'] as const) {
    const th = J['th' + side], sh = J['sh' + side], ft = J['ft' + side];
    const boneT = side === 'L' ? B.thL : B.thR;
    const boneS = side === 'L' ? B.shL : B.shR;
    const boneF = side === 'L' ? B.ftL : B.ftR;
    const thLen = th.y - sh.y;
    const legCol = l.skirt ? skin : pants;
    b.capsule((f ? 0.046 : 0.047) * H * W, thLen, legCol, (th.x + sh.x) / 2, (th.y + sh.y) / 2, 0, { bone: boneT, radial: 8, cap: 3 });
    const shLen = sh.y - ft.y;
    b.capsule(0.033 * H, shLen, l.skirt || l.shorts ? skin : pants, (sh.x + ft.x) / 2, (sh.y + ft.y) / 2, 0, { bone: boneS, radial: 8, cap: 3 });
    if (l.shorts) b.cyl(0.052 * H * W, 0.05 * H * W, thLen * 0.55, pants, th.x, th.y - thLen * 0.3, 0, { bone: boneT, seg: 10 });
    b.rbox(0.058 * H, 0.045 * H, 0.15 * H, 0.016 * H, l.shoes, ft.x, ft.y - 0.022 * H, 0.03 * H, { bone: boneF }, 2);
  }
  if (l.skirt) {
    b.cyl(0.11 * H * W, 0.15 * H * W, 0.2 * H, l.shirt2, 0, J.hips.y - 0.07 * H, 0, { bone: B.hips, seg: 16, sz: 0.85 });
  }
  return b.build()!;
}

export type Pose = 'idle' | 'walk' | 'carry' | 'basket' | 'cart' | 'reach' | 'scan' | 'mop' | 'sit' | 'talk' | 'wave' | 'angry' | 'stand';

export class Human {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[] = [];
  readonly look: HumanLook;
  pose: Pose = 'idle';
  speed = 0;
  private phase = Math.random() * 10;
  private t = Math.random() * 10;
  reachHeight = 1.0;
  private prop: THREE.Object3D | null = null;
  private propKind: string | null = null;
  private hipBaseY: number;
  private headLook = 0;
  headTarget = 0;

  constructor(look: HumanLook) {
    this.look = look;
    const key = lookKey(look);
    let geo = geoCache.get(key);
    if (!geo) {
      geo = buildGeometry(look);
      geoCache.set(key, geo);
      if (geoCache.size > 160) {
        const first = geoCache.keys().next().value as string;
        geoCache.get(first)?.dispose();
        geoCache.delete(first);
      }
    }
    const J = joints(look.height, look.width);
    const byName: Record<string, THREE.Bone> = {};
    for (const name of ORDER) {
      const bone = new THREE.Bone();
      bone.name = name;
      const p = PARENT[name];
      const pos = J[name].clone();
      if (p) pos.sub(J[p]);
      bone.position.copy(pos);
      byName[name] = bone;
      this.bones.push(bone);
      if (p) byName[p].add(bone);
    }
    this.hipBaseY = byName.hips.position.y;
    this.mesh = new THREE.SkinnedMesh(geo, humanMaterial());
    this.mesh.add(byName.root);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
  }

  bone(i: number) { return this.bones[i]; }

  /** Attach a carried prop ('basket' | 'cart' | 'box' | 'bag' | 'mop' | null). */
  setProp(kind: string | null, color = '#d32f2f') {
    if (this.propKind === kind) return;
    if (this.prop) {
      this.prop.parent?.remove(this.prop);
      this.prop = null;
    }
    this.propKind = kind;
    if (!kind) return;
    const H = this.look.height;
    if (kind === 'basket') {
      const b = new GeoBuilder();
      basketMesh(b, 0, -0.2, 0, color);
      b.box(0.02, 0.22, 0.02, '#333333', 0, -0.06, 0);
      const m = new THREE.Mesh(b.build()!, propMat());
      m.scale.setScalar(0.72);
      m.rotation.y = Math.PI / 2;
      m.castShadow = true;
      this.bones[B.handR].add(m);
      m.position.set(0, -0.02 * H, 0.0);
      this.prop = m;
    } else if (kind === 'cart') {
      const s = new GeoBuilder();
      const mm = new GeoBuilder();
      cartMesh(s, mm, 0, 0);
      const g = new THREE.Group();
      const m1 = new THREE.Mesh(s.build()!, propMat());
      const m2 = new THREE.Mesh(mm.build()!, propMetal());
      m1.castShadow = m2.castShadow = true;
      g.add(m1, m2);
      g.rotation.y = Math.PI;
      g.position.set(0, 0, 0.95);
      this.root.add(g);
      this.prop = g;
    } else if (kind === 'box') {
      const b = new GeoBuilder();
      b.box(0.42, 0.28, 0.32, '#c49a64', 0, 0, 0);
      b.box(0.04, 0.285, 0.325, '#e3d1a8', 0, 0, 0);
      const m = new THREE.Mesh(b.build()!, propMat());
      m.castShadow = true;
      this.bones[B.chest].add(m);
      m.position.set(0, -0.02 * H, 0.24);
      this.prop = m;
    } else if (kind === 'bag') {
      const b = new GeoBuilder();
      b.rbox(0.28, 0.3, 0.14, 0.04, color, 0, -0.18, 0);
      b.torus(0.06, 0.008, color, 0, -0.01, 0, { rs: 4, ts: 10, arc: Math.PI });
      const m = new THREE.Mesh(b.build()!, propMat());
      m.castShadow = true;
      this.bones[B.handL].add(m);
      m.position.set(0, -0.02, 0);
      this.prop = m;
    } else if (kind === 'mop') {
      const b = new GeoBuilder();
      b.cyl(0.015, 0.015, 1.35, '#9e9e9e', 0, 0, 0, { seg: 6 });
      b.box(0.3, 0.05, 0.08, '#1565c0', 0, -0.68, 0);
      const m = new THREE.Mesh(b.build()!, propMat());
      this.bones[B.handR].add(m);
      m.position.set(0, -0.05, 0.05);
      m.rotation.x = 0.6;
      this.prop = m;
    }
  }

  get propType() { return this.propKind; }

  update(dt: number) {
    this.t += dt;
    const b = this.bones;
    const H = this.look.height;
    const k = Math.min(1, dt * 10);
    const set = (i: number, x: number, y = 0, z = 0) => {
      const r = b[i].rotation;
      r.x += (x - r.x) * k;
      r.y += (y - r.y) * k;
      r.z += (z - r.z) * k;
    };
    const walking = this.speed > 0.05;
    if (walking) this.phase += dt * (this.speed / (0.62 * H)) * Math.PI;
    const ph = this.phase;
    const amp = walking ? Math.min(1, this.speed / 1.3) : 0;
    const sw = Math.sin(ph);
    // legs
    if (this.pose === 'sit') {
      set(B.thL, -1.45, 0, 0.05); set(B.thR, -1.45, 0, -0.05);
      set(B.shL, 1.4); set(B.shR, 1.4);
      set(B.ftL, 0); set(B.ftR, 0);
      b[B.hips].position.y = dampTo(b[B.hips].position.y, 0.46, 8, dt);
    } else {
      set(B.thL, -sw * 0.48 * amp, 0, 0.02);
      set(B.thR, sw * 0.48 * amp, 0, -0.02);
      set(B.shL, Math.max(0, Math.sin(ph - 1.1)) * 0.85 * amp + 0.03);
      set(B.shR, Math.max(0, Math.sin(ph + Math.PI - 1.1)) * 0.85 * amp + 0.03);
      set(B.ftL, -Math.min(0, Math.sin(ph + 0.6)) * 0.3 * amp);
      set(B.ftR, -Math.min(0, Math.sin(ph + Math.PI + 0.6)) * 0.3 * amp);
      const bob = walking ? Math.abs(Math.cos(ph)) * 0.022 * H - 0.012 * H : Math.sin(this.t * 1.7) * 0.002;
      b[B.hips].position.y = dampTo(b[B.hips].position.y, this.hipBaseY + bob, 12, dt);
    }
    set(B.hips, 0, sw * 0.07 * amp, 0);
    set(B.spine, walking ? 0.04 : 0, -sw * 0.05 * amp, 0);
    const breathe = Math.sin(this.t * 2.2) * 0.015;
    set(B.chest, breathe, -sw * 0.06 * amp, 0);
    // arms
    const armSwing = sw * 0.42 * amp;
    let uaL = armSwing, faL = -0.18 - Math.max(0, armSwing) * 0.3, uaR = -armSwing, faR = -0.18 - Math.max(0, -armSwing) * 0.3;
    let zL = -0.06, zR = 0.06;
    switch (this.pose) {
      case 'carry':
        uaL = uaR = -0.55; faL = faR = -0.95; zL = 0.12; zR = -0.12;
        break;
      case 'basket':
        uaR = 0.05; faR = -0.25; zR = 0.12;
        break;
      case 'cart':
        uaL = uaR = -0.75; faL = faR = -0.55; zL = 0.05; zR = -0.05;
        break;
      case 'reach': {
        const h = Math.max(0.3, Math.min(1.9, this.reachHeight));
        const a = -0.6 - (h - 0.6) * 0.75;
        uaR = a + Math.sin(this.t * 3) * 0.05; faR = -0.25; zR = 0.05;
        if (h < 0.7) set(B.spine, 0.45, 0, 0);
        break;
      }
      case 'scan':
        uaL = -0.55 + Math.sin(this.t * 5) * 0.15; faL = -0.9;
        uaR = -0.6 + Math.sin(this.t * 5 + 1.5) * 0.2; faR = -0.8; zL = 0.25; zR = -0.25;
        break;
      case 'mop':
        uaL = -0.7; faL = -0.6; uaR = -0.45; faR = -0.7;
        zL = 0.2 + Math.sin(this.t * 4) * 0.25; zR = -0.1 + Math.sin(this.t * 4) * 0.25;
        set(B.spine, 0.18, Math.sin(this.t * 4) * 0.2, 0);
        break;
      case 'talk':
        uaR = -0.3 + Math.sin(this.t * 4) * 0.15; faR = -1.1 + Math.sin(this.t * 6) * 0.2;
        break;
      case 'wave':
        uaR = -2.6; faR = -0.4 + Math.sin(this.t * 9) * 0.35; zR = 0.2;
        break;
      case 'angry':
        uaL = uaR = 0.05; faL = faR = -1.9; zL = 0.45; zR = -0.45;
        break;
      case 'sit':
        uaL = uaR = -0.35; faL = faR = -0.8;
        break;
    }
    set(B.uaL, uaL, 0, zL);
    set(B.faL, faL);
    set(B.uaR, uaR, 0, zR);
    set(B.faR, faR);
    set(B.handL, 0); set(B.handR, 0);
    // head
    this.headLook += (this.headTarget - this.headLook) * Math.min(1, dt * 4);
    const idleLook = !walking && this.pose === 'idle' ? Math.sin(this.t * 0.5) * 0.35 : 0;
    set(B.head, this.pose === 'reach' ? -0.15 + (1.2 - this.reachHeight) * 0.35 : walking ? 0.05 : 0, this.headLook + idleLook, 0);
    set(B.neck, 0, 0, 0);
  }

  dispose() {
    this.setProp(null);
    this.root.removeFromParent();
    this.mesh.skeleton.dispose();
  }
}

let pm: THREE.MeshStandardMaterial | null = null;
let pmm: THREE.MeshStandardMaterial | null = null;
function propMat() { return (pm ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); }
function propMetal() { return (pmm ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6 })); }
