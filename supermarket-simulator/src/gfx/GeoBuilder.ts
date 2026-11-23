// Compose many primitives into one vertex-colored BufferGeometry (few draw calls, mobile friendly).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface UVRect { u0: number; v0: number; u1: number; v1: number; }
export type UVMode = UVRect | 'white' | 'keep';
export type ColorLike = THREE.ColorRepresentation;

/** UV that samples the white tile of the shared atlas (top-left tile). */
export const WHITE_UV: [number, number] = [0.5 / 16, 1 - 0.5 / 16];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export interface PartOpts {
  rx?: number; ry?: number; rz?: number;
  sx?: number; sy?: number; sz?: number;
  uv?: UVMode;
  bone?: number;
  matrix?: THREE.Matrix4;
}

export function trs(x: number, y: number, z: number, o: PartOpts = {}): THREE.Matrix4 {
  _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ');
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  return new THREE.Matrix4().compose(_v, _q, _s);
}

function ensureIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.index) return g;
  const n = g.attributes.position.count;
  const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

export class GeoBuilder {
  private parts: THREE.BufferGeometry[] = [];
  /** When set, every part gets skinIndex/skinWeight bound to `bone`. */
  skinned = false;
  /** Optional parent transform applied to every part added afterwards. */
  base: THREE.Matrix4 | null = null;

  get count() { return this.parts.length; }

  add(geoIn: THREE.BufferGeometry, color: ColorLike, matrix?: THREE.Matrix4, uv: UVMode = 'white', bone = 0): this {
    let g = geoIn.index ? geoIn : ensureIndexed(geoIn);
    // keep only the attributes we care about
    const pos = g.attributes.position;
    const keep = new THREE.BufferGeometry();
    keep.setAttribute('position', pos.clone());
    keep.setIndex(g.index!.clone());
    if (g.attributes.normal) keep.setAttribute('normal', g.attributes.normal.clone());
    else keep.computeVertexNormals();
    const n = pos.count;
    const uvArr = new Float32Array(n * 2);
    const src = g.attributes.uv;
    if (uv === 'keep' && src) {
      for (let i = 0; i < n; i++) { uvArr[i * 2] = src.getX(i); uvArr[i * 2 + 1] = src.getY(i); }
    } else if (uv !== 'white' && uv !== 'keep' && src) {
      for (let i = 0; i < n; i++) {
        uvArr[i * 2] = uv.u0 + (uv.u1 - uv.u0) * src.getX(i);
        uvArr[i * 2 + 1] = uv.v0 + (uv.v1 - uv.v0) * src.getY(i);
      }
    } else {
      for (let i = 0; i < n; i++) { uvArr[i * 2] = WHITE_UV[0]; uvArr[i * 2 + 1] = WHITE_UV[1]; }
    }
    keep.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    const col = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    keep.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (this.skinned) {
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
      keep.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      keep.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    }
    if (matrix || this.base) {
      _m.identity();
      if (this.base) _m.copy(this.base);
      if (matrix) _m.multiply(matrix);
      keep.applyMatrix4(_m);
    }
    this.parts.push(keep);
    if (geoIn !== g) g.dispose();
    return this;
  }

  /** Axis aligned box with optional per-face UV rects: faces order px,nx,py,ny,pz,nz */
  box(w: number, h: number, d: number, color: ColorLike, x = 0, y = 0, z = 0, o: PartOpts & { faces?: Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', UVRect>> } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (o.faces) {
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const order: ('px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz')[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
      for (let f = 0; f < 6; f++) {
        const r = o.faces[order[f]];
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          if (r) uv.setXY(i, r.u0 + (r.u1 - r.u0) * uv.getX(i), r.v0 + (r.v1 - r.v0) * uv.getY(i));
          else uv.setXY(i, WHITE_UV[0], WHITE_UV[1]);
        }
      }
      return this.add(g, color, o.matrix ?? trs(x, y, z, o), 'keep', o.bone ?? 0);
    }
    return this.add(g, color, o.matrix ?? trs(x, y, z, o), o.uv ?? 'white', o.bone ?? 0);
  }

  /** Box whose bottom sits at y. */
  boxB(w: number, h: number, d: number, color: ColorLike, x: number, y: number, z: number, o: PartOpts = {}) {
    return this.box(w, h, d, color, x, y + h / 2, z, o);
  }

  rbox(w: number, h: number, d: number, r: number, color: ColorLike, x = 0, y = 0, z = 0, o: PartOpts = {}, seg = 2) {
    const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
    return this.add(g, color, o.matrix ?? trs(x, y, z, o), o.uv ?? 'white', o.bone ?? 0);
  }

  cyl(rTop: number, rBot: number, h: number, color: ColorLike, x = 0, y = 0, z = 0, o: PartOpts & { seg?: number; open?: boolean; thetaStart?: number; thetaLength?: number } = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 12, 1, o.open ?? false, o.thetaStart ?? 0, o.thetaLength ?? Math.PI * 2);
    return this.add(g, color, o.matrix ?? trs(x, y, z, o), o.uv ?? 'white', o.bone ?? 0);
  }

  sphere(r: number, color: ColorLike, x = 0, y = 0, z = 0, o: PartOpts & { ws?: number; hs?: number; phiStart?: number; phiLength?: number; thetaStart?: number; thetaLength?: number } = {}) {
    const g = new THREE.SphereGeometry(r, o.ws ?? 14, o.hs ?? 10, o.phiStart ?? 0, o.phiLength ?? Math.PI * 2, o.thetaStart ?? 0, o.thetaLength ?? Math.PI);
    return this.add(g, color, o.matrix ?? trs(x, y, z, o), o.uv ?? 'white', o.bone ?? 0);
  }

  capsule(r: number, len: number, color: ColorLike, x = 0, y = 0, z = 0, o: PartOpts & { cap?: number; radial?: number } = {}) {
    const g = new THREE.CapsuleGeometry(r, len, o.cap ?? 4, o.radial ?? 10);
    return this.add(g, color, o.matrix ?? trs(x, y, z, o), o.uv ?? 'white', o.bone ?? 0);
  }

  lathe(points: [number, number][], color: ColorLike, x = 0, y = 0, z = 0, o: PartOpts & { seg?: number } = {}) {
    const g = new THREE.LatheGeometry(points.map(([r, yy]) => new THREE.Vector2(r, yy)), o.seg ?? 14);
    return this.add(g, color, o.matrix ?? trs(x, y, z, o), o.uv ?? 'white', o.bone ?? 0);
  }

  cone(r: number, h: number, color: ColorLike, x = 0, y = 0, z = 0, o: PartOpts & { seg?: number } = {}) {
    const g = new THREE.ConeGeometry(r, h, o.seg ?? 12);
    return this.add(g, color, o.matrix ?? trs(x, y, z, o), o.uv ?? 'white', o.bone ?? 0);
  }

  torus(r: number, tube: number, color: ColorLike, x = 0, y = 0, z = 0, o: PartOpts & { arc?: number; rs?: number; ts?: number } = {}) {
    const g = new THREE.TorusGeometry(r, tube, o.rs ?? 6, o.ts ?? 16, o.arc ?? Math.PI * 2);
    return this.add(g, color, o.matrix ?? trs(x, y, z, o), o.uv ?? 'white', o.bone ?? 0);
  }

  plane(w: number, h: number, color: ColorLike, x = 0, y = 0, z = 0, o: PartOpts = {}) {
    const g = new THREE.PlaneGeometry(w, h);
    return this.add(g, color, o.matrix ?? trs(x, y, z, o), o.uv ?? 'white', o.bone ?? 0);
  }

  /** Extruded 2D shape (in XY), extruded along +Z by depth. */
  extrude(shape: THREE.Shape, depth: number, color: ColorLike, x = 0, y = 0, z = 0, o: PartOpts & { bevel?: number } = {}) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: !!o.bevel, bevelSize: o.bevel ?? 0, bevelThickness: o.bevel ?? 0, bevelSegments: 2, curveSegments: 8 });
    return this.add(g, color, o.matrix ?? trs(x, y, z, o), o.uv ?? 'white', o.bone ?? 0);
  }

  /** Merge into a single geometry. Returns null when empty. */
  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!merged) return null;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Quick helper to make a mesh from a builder. */
export function meshFrom(b: GeoBuilder, mat: THREE.Material): THREE.Mesh | null {
  const g = b.build();
  return g ? new THREE.Mesh(g, mat) : null;
}
