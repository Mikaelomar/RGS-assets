// The store building: generated from purchased plots and unlocked rooms. Walls, floors, ceilings,
// storefront, doors (automatic / swing / roll-up), signs and colliders.
import * as THREE from 'three';
import * as T from '../gfx/Textures';
import { GeoBuilder } from '../gfx/GeoBuilder';
import { Planar } from './City';
import type { Daylight } from './Daylight';
import type { Collision, Collider } from '../game/Collision';
import {
  PLOT, COLS, ROWS, SALES_H, BLD_H, WALL_T, FLOOR_Y, plotKey, plotRect, ROOMS, ROOM_MAP, DOORS, BOH_WALLS,
  type DoorDef, type RoomId, EXPANSIONS, ENTRANCE_COLS,
} from '../game/layout';
import type { GameState } from '../game/state';
import { clamp, money } from '../core/util';

const V3 = THREE.Vector3;

interface FaceStyle { mat: 'paint' | 'brick' | 'plaster'; wall?: string; band?: string; base?: string; }

export interface DoorRT {
  def: DoorDef;
  group: THREE.Group;
  panels: { obj: THREE.Object3D; mode: 'slide' | 'swing' | 'roll'; dir: number; base: THREE.Vector3; baseRot: number; travel: number }[];
  open: number;
  locked: boolean;
  active: boolean;
  collider: Collider | null;
  sign: THREE.Mesh | null;
  center: THREE.Vector3;
}

export interface WallSign { mesh: THREE.Mesh; box: THREE.Box3; kind: 'expansion' | 'room'; index: number; room?: RoomId; }

export class Building {
  readonly group = new THREE.Group();
  readonly dynamic = new THREE.Group();
  doors: DoorRT[] = [];
  signs: WallSign[] = [];
  openSign: THREE.Mesh | null = null;
  openSignBox = new THREE.Box3();
  private colliders: Collider[] = [];
  private mats: Record<string, THREE.Material> = {};
  private signTex: THREE.CanvasTexture | null = null;
  private openTexOpen: THREE.Texture;
  private openTexClosed: THREE.Texture;
  private plots = new Set<string>();
  private rooms = new Set<RoomId>();
  storeName = 'My Supermarket';
  glowMat: THREE.MeshBasicMaterial;
  /** Interior light level 0..1 (power outages). */
  lightLevel = 1;

  constructor(private scene: THREE.Scene, private col: Collision, private daylight: Daylight) {
    scene.add(this.group);
    scene.add(this.dynamic);
    const salesTiles = T.floorTiles({ base: '#e3ded4', alt: '#d8d3c8', grout: '#a59f94', tiles: 4, seed: 3 });
    const vinyl = T.floorTiles({ base: '#d9dee2', alt: '#d2d8dc', grout: '#b8c0c6', tiles: 4, seed: 8 });
    const small = T.floorTiles({ base: '#f6f7f8', alt: '#eef0f2', grout: '#c4c9cd', tiles: 8, seed: 5 });
    const brick = T.brick({ color: '#a45843' });
    this.mats.paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    this.mats.brick = new THREE.MeshStandardMaterial({ map: brick.map, normalMap: brick.normalMap ?? undefined, roughness: 0.9, vertexColors: true });
    this.mats.plaster = new THREE.MeshStandardMaterial({ map: T.plaster('#ffffff', 256, 0.04), roughness: 0.85, vertexColors: true });
    this.mats.roof = new THREE.MeshStandardMaterial({ map: T.concrete({ color: '#74777a', size: 256 }), roughness: 1 });
    daylight.registerOutdoor([this.mats.brick, this.mats.plaster, this.mats.roof]);
    this.mats.sales = new THREE.MeshStandardMaterial({ map: salesTiles.map, normalMap: salesTiles.normalMap, roughness: 0.32, metalness: 0.0, envMapIntensity: 0.8 });
    this.mats.concrete = new THREE.MeshStandardMaterial({ map: T.concrete({ color: '#a5a29c', lines: true }), roughness: 0.75 });
    this.mats.vinyl = new THREE.MeshStandardMaterial({ map: vinyl.map, normalMap: vinyl.normalMap, roughness: 0.5 });
    this.mats.wood = new THREE.MeshStandardMaterial({ map: T.woodPlanks({ color: '#b98a5a' }), roughness: 0.6 });
    this.mats.smalltile = new THREE.MeshStandardMaterial({ map: small.map, normalMap: small.normalMap, roughness: 0.35 });
    this.mats.ceiling = new THREE.MeshStandardMaterial({ map: T.ceilingTiles(), roughness: 0.95 });
    this.mats.glass = new THREE.MeshStandardMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.18, roughness: 0.04, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5 });
    this.mats.frame = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.45 });
    this.mats.door = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, toneMapped: false });
    this.mats.glow = this.glowMat;
    this.mats.fence = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 });
    this.openTexOpen = T.signTexture('OPEN', { bg: '#1b8e3b', fg: '#ffffff', w: 512, h: 256, border: '#ffffff' });
    this.openTexClosed = T.signTexture('CLOSED', { bg: '#c62828', fg: '#ffffff', w: 512, h: 256, border: '#ffffff' });
  }

  // ------------------------------------------------------------------ queries
  isPlot(c: number, r: number) { return this.plots.has(plotKey(c, r)); }
  hasRoom(r: RoomId) { return this.rooms.has(r); }

  /** Which area a world point belongs to. */
  areaAt(x: number, z: number): 'sales' | RoomId | 'outside' {
    if (x >= 0 && x <= COLS * PLOT && z <= 0 && z >= -ROWS * PLOT) {
      const c = Math.floor(x / PLOT), r = Math.floor(-z / PLOT);
      return this.isPlot(Math.min(c, COLS - 1), Math.min(r, ROWS - 1)) ? 'sales' : 'outside';
    }
    for (const room of ROOMS) {
      const [x0, z0, x1, z1] = room.rect;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return room.id;
    }
    return 'outside';
  }
  isIndoors(x: number, z: number) { return this.areaAt(x, z) !== 'outside'; }
  isSales(x: number, z: number) { return this.areaAt(x, z) === 'sales'; }

  salesBounds(): [number, number, number, number] {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const k of this.plots) {
      const [c, r] = k.split(',').map(Number);
      const [a, b, cc, d] = plotRect(c, r);
      x0 = Math.min(x0, a); z0 = Math.min(z0, b); x1 = Math.max(x1, cc); z1 = Math.max(z1, d);
    }
    return [x0, z0, x1, z1];
  }

  // ------------------------------------------------------------------ build
  private faceStyle(px: number, pz: number): FaceStyle {
    const a = this.areaAt(px, pz);
    if (a === 'sales') return { mat: 'paint', wall: '#e9e4d8', band: '#d23b2c', base: '#4f5a62' };
    if (a !== 'outside') {
      const room = ROOM_MAP.get(a)!;
      return { mat: 'paint', wall: room.wall, band: room.band, base: '#59646c' };
    }
    return { mat: px < 0 ? 'brick' : 'plaster' };
  }

  rebuild(state: GameState) {
    this.plots = new Set(state.plots);
    this.rooms = new Set(state.rooms);
    if (this.rooms.has('office')) this.rooms.add('corridor');
    this.storeName = state.storeName;
    // clear old
    for (const c of this.colliders) this.col.remove(c);
    this.colliders = [];
    for (const d of this.doors) if (d.collider) this.col.remove(d.collider);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.group.clear();
    this.dynamic.clear();
    this.doors = [];
    this.signs = [];

    const buckets: Record<string, Planar> = {
      paint: new Planar(2, 2), brick: new Planar(4, 4), plaster: new Planar(3, 3), roof: new Planar(6, 6),
      sales: new Planar(2.4, 2.4), concrete: new Planar(4, 4), vinyl: new Planar(2.4, 2.4), wood: new Planar(3, 3), smalltile: new Planar(1.2, 1.2),
      ceiling: new Planar(1.2, 1.2),
    };
    const frame = new GeoBuilder();
    const glass = new GeoBuilder();
    const glow = new GeoBuilder();
    const fence = new GeoBuilder();

    // floors / ceilings / roofs / lights
    for (const k of this.plots) {
      const [c, r] = k.split(',').map(Number);
      const [x0, z0, x1, z1] = plotRect(c, r);
      buckets.sales.floor(x0, z0, x1, z1, FLOOR_Y);
      this.ceiling(buckets.ceiling, x0, z0, x1, z1, SALES_H);
      buckets.roof.floor(x0, z0, x1, z1, BLD_H - 0.45);
      for (let i = 0; i < 3; i++) glow.box(6.2, 0.04, 0.22, '#fffdf4', (x0 + x1) / 2, SALES_H - 0.03, z0 + 1.33 + i * 2.67);
    }
    for (const room of ROOMS) {
      const [x0, z0, x1, z1] = room.rect;
      buckets[room.floor].floor(x0, z0, x1, z1, FLOOR_Y);
      this.ceiling(buckets.ceiling, x0, z0, x1, z1, room.height);
      if (this.rooms.has(room.id)) {
        const nx = Math.max(1, Math.round((x1 - x0) / 4));
        const nz = Math.max(1, Math.round((z1 - z0) / 4));
        for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
          glow.box(1.2, 0.03, 0.3, '#fffdf4', x0 + ((x1 - x0) / nx) * (i + 0.5), room.height - 0.02, z0 + ((z1 - z0) / nz) * (k + 0.5));
        }
      }
    }
    buckets.roof.floor(-16, -32, 0, 0, BLD_H - 0.45);

    // ---- walls
    const xs = new Set<number>([-16, -8, -7, -4, 0]);
    const zs = new Set<number>([0, -12, -18, -22, -26, -27, -32]);
    for (let c = 0; c <= COLS; c++) xs.add(c * PLOT);
    for (let r = 0; r <= ROWS; r++) zs.add(-r * PLOT);
    const breakX = [...xs].sort((a, b) => a - b);
    const breakZ = [...zs].sort((a, b) => a - b);

    const walls: { a: [number, number]; b: [number, number]; h: number; front?: boolean }[] = [];
    for (const w of BOH_WALLS) walls.push(w);
    for (const k of this.plots) {
      const [c, r] = k.split(',').map(Number);
      const [x0, z0, x1, z1] = plotRect(c, r);
      if (r === 0) walls.push({ a: [x0, 0], b: [x1, 0], h: BLD_H, front: true });
      else if (!this.isPlot(c, r - 1)) walls.push({ a: [x0, z1], b: [x1, z1], h: BLD_H });
      if (r === ROWS - 1 || !this.isPlot(c, r + 1)) walls.push({ a: [x0, z0], b: [x1, z0], h: BLD_H });
      if (c > 0 && !this.isPlot(c - 1, r)) walls.push({ a: [x0, z0], b: [x0, z1], h: BLD_H });
      if (c === COLS - 1 || !this.isPlot(c + 1, r)) walls.push({ a: [x1, z0], b: [x1, z1], h: BLD_H });
    }
    const activeDoors = DOORS.filter((d) => this.doorExists(d));
    for (const w of walls) {
      if (w.front) this.storefront(w.a[0], w.b[0], buckets, frame, glass, activeDoors);
      else this.wall(w.a, w.b, w.h, buckets, frame, activeDoors, w.a[1] === w.b[1] ? breakX : breakZ);
    }

    // interior columns where four plots meet
    for (let c = 1; c < COLS; c++) for (let r = 1; r < ROWS; r++) {
      if (this.isPlot(c - 1, r - 1) && this.isPlot(c, r - 1) && this.isPlot(c - 1, r) && this.isPlot(c, r)) {
        const x = c * PLOT, z = -r * PLOT;
        this.colBox(buckets.paint, x - 0.25, z - 0.25, x + 0.25, z + 0.25, SALES_H);
        this.addCollider(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 0, SALES_H, 'wall');
      }
    }

    // ---- fences around the vacant lot + expansion banners
    this.buildFences(fence, state);

    // ---- meshes
    const addMesh = (geo: THREE.BufferGeometry | null, mat: THREE.Material, cast = true, receive = true) => {
      if (!geo) return null;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast;
      m.receiveShadow = receive;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.group.add(m);
      return m;
    };
    for (const key of Object.keys(buckets)) {
      const p = buckets[key];
      if (!p.idx.length) continue;
      const isFloor = ['sales', 'concrete', 'vinyl', 'wood', 'smalltile', 'ceiling', 'roof'].includes(key);
      addMesh(p.geometry(), this.mats[key], !isFloor || key === 'roof', true);
    }
    addMesh(frame.build(), this.mats.frame, true, true);
    const gm = addMesh(glass.build(), this.mats.glass, false, false);
    if (gm) gm.renderOrder = 3;
    addMesh(glow.build(), this.glowMat, false, false);
    addMesh(fence.build(), this.mats.fence, true, true);

    // ---- doors
    for (const d of DOORS) this.makeDoor(d, state);

    // ---- store sign + open sign
    this.buildSigns(state);
    this.applyLight();
  }

  private ceiling(p: Planar, x0: number, z0: number, x1: number, z1: number, y: number) {
    p.quad([new V3(x0, y, z0), new V3(x1, y, z0), new V3(x1, y, z1), new V3(x0, y, z1)], new V3(0, -1, 0),
      [[x0 / 1.2, z0 / 1.2], [x1 / 1.2, z0 / 1.2], [x1 / 1.2, z1 / 1.2], [x0 / 1.2, z1 / 1.2]]);
  }

  doorExists(d: DoorDef): boolean {
    if (d.kind === 'auto' && d.plot) return this.isPlot(d.plot[0], d.plot[1]);
    if (d.id === 'd_cwc') return true;
    return true;
  }

  private addCollider(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tag: string) {
    this.colliders.push(this.col.add(x0, z0, x1, z1, y0, y1, tag));
  }

  /** Painted interior face with baseboard + accent band, or textured exterior face. */
  private face(buckets: Record<string, Planar>, style: FaceStyle, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, n: THREE.Vector3) {
    if (y1 - y0 < 0.001) return;
    const u0 = n.x !== 0 ? (n.x > 0 ? -az : az) : (n.z > 0 ? ax : -ax);
    if (style.mat === 'paint') {
      const bands: [number, number, string][] = [
        [0, 0.12, style.base ?? '#59646c'],
        [0.12, 2.25, style.wall ?? '#f0f0f0'],
        [2.25, 2.6, style.band ?? '#d23b2c'],
        [2.6, 99, style.wall ?? '#f0f0f0'],
      ];
      for (const [b0, b1, col] of bands) {
        const s0 = Math.max(y0, b0), s1 = Math.min(y1, b1);
        if (s1 > s0) buckets.paint.wall(ax, az, bx, bz, s0, s1, n, new THREE.Color(col), u0);
      }
    } else if (style.mat === 'plaster') {
      // exterior with a red fascia band near the top
      const bands: [number, number, string][] = [[0, 0.5, '#7d8083'], [0.5, BLD_H - 1.25, '#dedad2'], [BLD_H - 1.25, BLD_H - 0.25, '#d23b2c'], [BLD_H - 0.25, 99, '#f4f4f4']];
      for (const [b0, b1, col] of bands) {
        const s0 = Math.max(y0, b0), s1 = Math.min(y1, b1);
        if (s1 > s0) buckets.plaster.wall(ax, az, bx, bz, s0, s1, n, new THREE.Color(col), u0);
      }
    } else {
      buckets.brick.wall(ax, az, bx, bz, y0, y1, n, new THREE.Color('#ffffff'), u0);
    }
  }

  /** A straight axis aligned wall with door openings, split at area boundaries for correct styling. */
  private wall(a: [number, number], b: [number, number], h: number, buckets: Record<string, Planar>, frame: GeoBuilder, doors: DoorDef[], breaks: number[]) {
    const alongX = a[1] === b[1];
    const fixed = alongX ? a[1] : a[0];
    const s0 = Math.min(alongX ? a[0] : a[1], alongX ? b[0] : b[1]);
    const s1 = Math.max(alongX ? a[0] : a[1], alongX ? b[0] : b[1]);
    const t = WALL_T / 2;
    // openings on this wall
    const openings = doors
      .filter((d) => (alongX ? d.axis === 'x' && Math.abs(d.z - fixed) < 0.01 : d.axis === 'z' && Math.abs(d.x - fixed) < 0.01))
      .map((d) => {
        const c = alongX ? d.x : d.z;
        return { o0: c - d.w / 2, o1: c + d.w / 2, top: d.h, def: d };
      })
      .filter((o) => o.o1 > s0 && o.o0 < s1);
    // cut points
    const cuts = new Set<number>([s0, s1]);
    for (const bp of breaks) if (bp > s0 && bp < s1) cuts.add(bp);
    for (const o of openings) { cuts.add(Math.max(s0, o.o0)); cuts.add(Math.min(s1, o.o1)); }
    const pts = [...cuts].sort((x, y) => x - y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      if (p1 - p0 < 0.001) continue;
      const mid = (p0 + p1) / 2;
      const op = openings.find((o) => mid > o.o0 && mid < o.o1);
      const yb = op ? op.top : 0;
      if (yb >= h) continue;
      // side styles
      const sampleA = alongX ? this.faceStyle(mid, fixed + 0.5) : this.faceStyle(fixed + 0.5, mid);
      const sampleB = alongX ? this.faceStyle(mid, fixed - 0.5) : this.faceStyle(fixed - 0.5, mid);
      // limit height of interior-only walls inside rooms to wall h
      if (alongX) {
        this.face(buckets, sampleA, p0, fixed + t, p1, fixed + t, yb, h, new V3(0, 0, 1));
        this.face(buckets, sampleB, p1, fixed - t, p0, fixed - t, yb, h, new V3(0, 0, -1));
        buckets.paint.floor(p0, fixed - t, p1, fixed + t, h, new THREE.Color('#d8d8d8'));
        if (op) buckets.paint.quad([new V3(p0, yb, fixed - t), new V3(p1, yb, fixed - t), new V3(p1, yb, fixed + t), new V3(p0, yb, fixed + t)], new V3(0, -1, 0), [[0, 0], [1, 0], [1, 1], [0, 1]], new THREE.Color('#cfcfcf'));
        this.addCollider(p0, fixed - t, p1, fixed + t, yb, h, 'wall');
      } else {
        this.face(buckets, sampleA, fixed + t, p1, fixed + t, p0, yb, h, new V3(1, 0, 0));
        this.face(buckets, sampleB, fixed - t, p0, fixed - t, p1, yb, h, new V3(-1, 0, 0));
        buckets.paint.floor(fixed - t, p0, fixed + t, p1, h, new THREE.Color('#d8d8d8'));
        if (op) buckets.paint.quad([new V3(fixed - t, yb, p1), new V3(fixed + t, yb, p1), new V3(fixed + t, yb, p0), new V3(fixed - t, yb, p0)], new V3(0, -1, 0), [[0, 0], [1, 0], [1, 1], [0, 1]], new THREE.Color('#cfcfcf'));
        this.addCollider(fixed - t, p0, fixed + t, p1, yb, h, 'wall');
      }
    }
    // jambs (end caps) at openings + door frames
    for (const o of openings) {
      for (const e of [o.o0, o.o1]) {
        if (e <= s0 + 0.001 || e >= s1 - 0.001) continue;
        const ax = alongX ? e : fixed - t, az = alongX ? fixed - t : e;
        const bx = alongX ? e : fixed + t, bz = alongX ? fixed + t : e;
        buckets.paint.wall(ax, az, bx, bz, 0, o.top, alongX ? new V3(e === o.o0 ? 1 : -1, 0, 0) : new V3(0, 0, e === o.o0 ? 1 : -1), new THREE.Color('#cfd4d8'));
      }
      if (o.def.kind !== 'opening') {
        const c = (o.o0 + o.o1) / 2, w = o.o1 - o.o0;
        const fc = '#5b6670';
        if (alongX) {
          frame.box(w + 0.16, 0.08, WALL_T + 0.04, fc, c, o.top + 0.04, fixed);
          frame.box(0.08, o.top, WALL_T + 0.04, fc, o.o0 - 0.04, o.top / 2, fixed);
          frame.box(0.08, o.top, WALL_T + 0.04, fc, o.o1 + 0.04, o.top / 2, fixed);
        } else {
          frame.box(WALL_T + 0.04, 0.08, w + 0.16, fc, fixed, o.top + 0.04, c);
          frame.box(WALL_T + 0.04, o.top, 0.08, fc, fixed, o.top / 2, o.o0 - 0.04);
          frame.box(WALL_T + 0.04, o.top, 0.08, fc, fixed, o.top / 2, o.o1 + 0.04);
        }
      }
    }
  }

  private colBox(p: Planar, x0: number, z0: number, x1: number, z1: number, h: number) {
    const col = new THREE.Color('#e8e4dc');
    p.wall(x0, z1, x1, z1, 0, h, new V3(0, 0, 1), col, x0);
    p.wall(x1, z0, x0, z0, 0, h, new V3(0, 0, -1), col, -x1);
    p.wall(x1, z1, x1, z0, 0, h, new V3(1, 0, 0), col, -z1);
    p.wall(x0, z0, x0, z1, 0, h, new V3(-1, 0, 0), col, z0);
    const red = new THREE.Color('#d23b2c');
    p.wall(x0 - 0.002, z1 + 0.002, x1 + 0.002, z1 + 0.002, 1.6, 1.9, new V3(0, 0, 1), red, x0);
    p.wall(x1 + 0.002, z0 - 0.002, x0 - 0.002, z0 - 0.002, 1.6, 1.9, new V3(0, 0, -1), red, -x1);
    p.wall(x1 + 0.002, z1 + 0.002, x1 + 0.002, z0 - 0.002, 1.6, 1.9, new V3(1, 0, 0), red, -z1);
    p.wall(x0 - 0.002, z0 - 0.002, x0 - 0.002, z1 + 0.002, 1.6, 1.9, new V3(-1, 0, 0), red, z0);
  }

  /** Glass storefront along z = 0 from x0 to x1 (one plot). */
  private storefront(x0: number, x1: number, buckets: Record<string, Planar>, frame: GeoBuilder, glass: GeoBuilder, doors: DoorDef[]) {
    const t = WALL_T / 2;
    const door = doors.find((d) => d.kind === 'auto' && d.x > x0 && d.x < x1);
    const inside: FaceStyle = { mat: 'paint', wall: '#e9e4d8', band: '#d23b2c', base: '#4f5a62' };
    const outside: FaceStyle = { mat: 'plaster' };
    const glassTop = 3.3, kick = 0.45;
    // pillars at both ends
    for (const px of [x0, x1]) {
      const a = Math.max(px - 0.3, x0 === px ? px : px - 0.3), b = px === x0 ? px + 0.3 : px;
      const pa = px === x0 ? px : px - 0.3, pb = px === x0 ? px + 0.3 : px;
      void a; void b;
      this.face(buckets, outside, pa, t, pb, t, 0, glassTop, new V3(0, 0, 1));
      this.face(buckets, inside, pb, -t, pa, -t, 0, glassTop, new V3(0, 0, -1));
      this.addCollider(pa, -t, pb, t, 0, BLD_H, 'wall');
    }
    // header above glass
    this.face(buckets, outside, x0, t, x1, t, glassTop, BLD_H, new V3(0, 0, 1));
    this.face(buckets, inside, x1, -t, x0, -t, glassTop, SALES_H + 0.05, new V3(0, 0, -1));
    buckets.paint.floor(x0, -t, x1, t, BLD_H, new THREE.Color('#d8d8d8'));
    buckets.paint.quad([new V3(x0, glassTop, -t), new V3(x1, glassTop, -t), new V3(x1, glassTop, t), new V3(x0, glassTop, t)], new V3(0, -1, 0), [[0, 0], [1, 0], [1, 1], [0, 1]], new THREE.Color('#9aa3aa'));
    // glass span(s) excluding door
    const spans: [number, number][] = [];
    if (door) {
      spans.push([x0 + 0.3, door.x - door.w / 2 - 0.1]);
      spans.push([door.x + door.w / 2 + 0.1, x1 - 0.3]);
    } else spans.push([x0 + 0.3, x1 - 0.3]);
    for (const [g0, g1] of spans) {
      if (g1 - g0 < 0.05) continue;
      frame.box(g1 - g0, kick, WALL_T, '#4a545c', (g0 + g1) / 2, kick / 2, 0);
      glass.plane(g1 - g0, glassTop - kick, '#ffffff', (g0 + g1) / 2, (kick + glassTop) / 2, 0);
      const n = Math.max(1, Math.round((g1 - g0) / 2));
      for (let i = 0; i <= n; i++) frame.box(0.08, glassTop - kick, 0.12, '#4a545c', g0 + ((g1 - g0) / n) * i, (kick + glassTop) / 2, 0);
      frame.box(g1 - g0, 0.08, 0.14, '#4a545c', (g0 + g1) / 2, glassTop - 0.04, 0);
      this.addCollider(g0, -t, g1, t, 0, glassTop, 'glass');
    }
    if (door) {
      const dx0 = door.x - door.w / 2 - 0.1, dx1 = door.x + door.w / 2 + 0.1;
      // transom glass above the door
      glass.plane(dx1 - dx0, glassTop - door.h, '#ffffff', door.x, (door.h + glassTop) / 2, 0);
      frame.box(dx1 - dx0 + 0.1, 0.1, 0.2, '#3d464d', door.x, door.h + 0.05, 0);
      frame.box(0.1, door.h, 0.2, '#3d464d', dx0, door.h / 2, 0);
      frame.box(0.1, door.h, 0.2, '#3d464d', dx1, door.h / 2, 0);
      // entrance mat inside + canopy outside
      frame.box(door.w + 1.2, 0.012, 1.6, '#30353a', door.x, FLOOR_Y + 0.006, -1.0);
      frame.box(door.w + 2.4, 0.14, 1.8, '#d23b2c', door.x, 3.55, 0.9);
    }
  }

  private buildFences(fence: GeoBuilder, state: GameState) {
    const segs: [number, number, number, number][] = [];
    for (let c = 0; c < COLS; c++) {
      if (!this.isPlot(c, 0)) segs.push([c * PLOT, 0.0, (c + 1) * PLOT, 0.0]);
      if (!this.isPlot(c, ROWS - 1)) segs.push([c * PLOT, -ROWS * PLOT, (c + 1) * PLOT, -ROWS * PLOT]);
    }
    for (let r = 0; r < ROWS; r++) if (!this.isPlot(COLS - 1, r)) segs.push([COLS * PLOT, -(r + 1) * PLOT, COLS * PLOT, -r * PLOT]);
    for (const [ax, az, bx, bz] of segs) {
      const alongX = az === bz;
      const len = alongX ? bx - ax : bz - az;
      const n = Math.max(1, Math.round(len / 2.6));
      for (let i = 0; i <= n; i++) {
        const px = alongX ? ax + (len / n) * i : ax, pz = alongX ? az : az + (len / n) * i;
        fence.cyl(0.04, 0.04, 2.0, '#8d969e', px, 1.0, pz, { seg: 6 });
      }
      if (alongX) {
        fence.box(len, 0.04, 0.04, '#8d969e', (ax + bx) / 2, 1.98, az);
        fence.box(len, 1.8, 0.01, '#b0bcc4', (ax + bx) / 2, 1.0, az);
        this.addCollider(ax, az - 0.1, bx, az + 0.1, 0, 2, 'fence');
      } else {
        fence.box(0.04, 0.04, len, '#8d969e', ax, 1.98, (az + bz) / 2);
        fence.box(0.01, 1.8, len, '#b0bcc4', ax, 1.0, (az + bz) / 2);
        this.addCollider(ax - 0.1, az, ax + 0.1, bz, 0, 2, 'fence');
      }
    }
    // expansion signs: on each inside wall facing the next expansion's plots
    const nextIdx = state.plots.length ? EXPANSIONS.findIndex((e) => e.plots.some(([c, r]) => !this.isPlot(c, r))) : -1;
    if (nextIdx >= 0) {
      const e = EXPANSIONS[nextIdx];
      // find a purchased plot adjacent to the expansion plots → sign on that shared wall (inside)
      const [ec, er] = e.plots[0];
      const neigh: [number, number, 'x' | 'z', number][] = [[ec - 1, er, 'z', 1], [ec + 1, er, 'z', -1], [ec, er - 1, 'x', -1], [ec, er + 1, 'x', 1]];
      for (const [nc, nr, axis, dir] of neigh) {
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || !this.isPlot(nc, nr)) continue;
        const [x0, z0, x1, z1] = plotRect(ec, er);
        let x: number, z: number, ry: number;
        if (axis === 'z') {
          x = dir > 0 ? x0 - WALL_T / 2 - 0.02 : x1 + WALL_T / 2 + 0.02;
          z = (z0 + z1) / 2;
          ry = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        } else {
          z = dir < 0 ? z1 + WALL_T / 2 + 0.02 : z0 - WALL_T / 2 - 0.02;
          x = (x0 + x1) / 2;
          ry = dir < 0 ? 0 : Math.PI;
        }
        const building = state.construction && state.construction.index === nextIdx;
        const tex = building
          ? T.signTexture('UNDER CONSTRUCTION', { bg: '#f9a825', fg: '#212121', w: 1024, h: 384, border: '#212121', sub: 'Builders are working on your new floor space' })
          : T.signTexture('EXPANSION AREA', { bg: '#1c3d5a', fg: '#ffd23f', w: 1024, h: 384, border: '#ffd23f', sub: `Level ${e.level} · ${money(e.cost, 0)}  —  tap to expand` });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
        mesh.position.set(x, 2.0, z);
        mesh.rotation.y = ry;
        this.dynamic.add(mesh);
        const box = new THREE.Box3().setFromCenterAndSize(new V3(x, 2.0, z), new V3(axis === 'z' ? 0.3 : 3.2, 1.2, axis === 'z' ? 3.2 : 0.3));
        this.signs.push({ mesh, box, kind: 'expansion', index: nextIdx });
        break;
      }
      // banner on the street fence
      const front = e.plots.find(([, r]) => r === 0);
      if (front) {
        const [x0, , x1] = plotRect(front[0], 0);
        const tex = T.signTexture('FUTURE EXPANSION', { bg: '#ffffff', fg: '#d23b2c', w: 1024, h: 256, border: '#d23b2c', sub: 'Coming soon: a bigger store!' });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
        m.position.set((x0 + x1) / 2, 1.2, 0.12);
        this.dynamic.add(m);
        this.daylight.registerOutdoor(m.material);
      }
    }
  }

  private makeDoor(d: DoorDef, state: GameState) {
    const exists = this.doorExists(d);
    const g = new THREE.Group();
    const rt: DoorRT = { def: d, group: g, panels: [], open: 0, locked: false, active: exists, collider: null, sign: null, center: new V3(d.x, 1, d.z) };
    if (!exists) {
      this.doors.push(rt);
      return;
    }
    const alongX = d.axis === 'x';
    const room = d.room ? ROOM_MAP.get(d.room)! : null;
    let locked = room ? !this.rooms.has(room.id) : false;
    if (d.id === 'd_cwc' && !this.isPlot(0, 2)) locked = true;
    rt.locked = locked;
    const panelMat = this.mats.door;
    const mk = (geo: THREE.BufferGeometry | null, mat: THREE.Material) => {
      const m = new THREE.Mesh(geo!, mat);
      m.castShadow = true;
      return m;
    };
    if (d.kind === 'auto') {
      for (const side of [-1, 1]) {
        const pg = new THREE.Group();
        const f = new GeoBuilder();
        const gl = new GeoBuilder();
        const pw = d.w / 2;
        f.box(pw, 0.06, 0.06, '#3d464d', 0, 0.03, 0);
        f.box(pw, 0.06, 0.06, '#3d464d', 0, d.h - 0.03, 0);
        f.box(0.06, d.h, 0.06, '#3d464d', side * (pw / 2 - 0.03), d.h / 2, 0);
        f.box(0.06, d.h, 0.06, '#3d464d', -side * (pw / 2 - 0.03), d.h / 2, 0);
        f.box(0.2, 0.15, 0.02, '#ffffff', 0, 1.3, 0.04);
        gl.plane(pw - 0.1, d.h - 0.1, '#ffffff', 0, d.h / 2, 0);
        pg.add(mk(f.build(), this.mats.frame));
        const glassMesh = new THREE.Mesh(gl.build()!, this.mats.glass);
        glassMesh.renderOrder = 3;
        pg.add(glassMesh);
        const base = new V3(d.x + side * (pw / 2), 0, d.z);
        pg.position.copy(base);
        g.add(pg);
        rt.panels.push({ obj: pg, mode: 'slide', dir: side, base, baseRot: 0, travel: pw * 0.95 });
      }
      // sensor box
      const f2 = new GeoBuilder();
      f2.box(d.w + 0.3, 0.25, 0.35, '#3d464d', d.x, d.h + 0.15, d.z);
      g.add(mk(f2.build(), this.mats.frame));
    } else if (d.kind === 'rollup') {
      const f = new GeoBuilder();
      const n = 14;
      for (let i = 0; i < n; i++) f.box(d.w, d.h / n - 0.01, 0.05, i % 2 ? '#aeb6bd' : '#bcc4ca', 0, (d.h / n) * (i + 0.5), 0);
      f.box(0.5, 0.2, 0.08, '#f9a825', 0, 0.5, 0.05);
      const pm = mk(f.build(), this.mats.door);
      const pg = new THREE.Group();
      pg.add(pm);
      const base = new V3(d.x, 0, d.z);
      pg.position.copy(base);
      g.add(pg);
      rt.panels.push({ obj: pg, mode: 'roll', dir: 1, base, baseRot: 0, travel: d.h - 0.2 });
      const hood = new GeoBuilder();
      hood.box(d.w + 0.3, 0.45, 0.5, '#7b858d', d.x, d.h + 0.2, d.z + 0.1);
      g.add(mk(hood.build(), this.mats.frame));
    } else if (d.kind === 'opening') {
      if (locked) {
        const f = new GeoBuilder();
        if (alongX) f.box(d.w, d.h, 0.12, '#cfd4d8', d.x, d.h / 2, d.z);
        else f.box(0.12, d.h, d.w, '#cfd4d8', d.x, d.h / 2, d.z);
        g.add(mk(f.build(), this.mats.door));
        // fill above the opening to the ceiling is part of the wall
      }
    } else {
      const leaves = d.kind === 'double' ? [-1, 1] : [1];
      for (const side of leaves) {
        const lw = d.w / leaves.length;
        const f = new GeoBuilder();
        const doorCol = d.room === 'storage' ? '#8a9aa6' : '#6d8fa8';
        // panel extends from hinge (0) to -side*lw along local X
        f.box(lw - 0.03, d.h - 0.04, 0.05, doorCol, (-side * lw) / 2, d.h / 2, 0);
        f.box(0.03, 0.03, 0.06, '#c8d0d6', -side * (lw - 0.12), 1.0, 0.04);
        f.box(0.03, 0.03, 0.06, '#c8d0d6', -side * (lw - 0.12), 1.0, -0.04);
        if (d.kind === 'double') f.box(lw * 0.4, 0.4, 0.06, '#9fc3dc', (-side * lw) / 2, 1.6, 0);
        const pg = new THREE.Group();
        pg.add(mk(f.build(), panelMat));
        const hx = alongX ? d.x + side * (d.w / 2) : d.x;
        const hz = alongX ? d.z : d.z + side * (d.w / 2);
        const base = new V3(hx, 0, hz);
        pg.position.copy(base);
        const baseRot = alongX ? 0 : -Math.PI / 2;
        pg.rotation.y = baseRot;
        g.add(pg);
        rt.panels.push({ obj: pg, mode: 'swing', dir: side, base, baseRot, travel: Math.PI * 0.5 });
      }
    }
    // signs above doors
    if (d.label || room) {
      const label = d.label ?? room!.name.toUpperCase();
      let sub: string | undefined;
      let bg = '#263238', fg = '#ffffff';
      if (locked) {
        bg = '#7a1f1f';
        fg = '#ffe082';
        sub = room ? (d.id === 'd_cwc' && !this.isPlot(0, 2) ? 'Needs store expansion' : `LOCKED · Level ${room.level} · ${money(room.cost, 0)}`) : undefined;
      }
      const tex = T.signTexture(locked ? '🔒 ' + label : label, { bg, fg, w: 768, h: locked ? 288 : 160, sub, border: locked ? '#ffe082' : undefined });
      const sw = locked ? 1.6 : 1.1;
      const sh = locked ? 0.6 : 0.23;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide });
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
      const y = locked ? 1.45 : Math.min(d.h + 0.3, 3.2);
      // place on both sides if locked (visible from where the player is); otherwise one double-sided sign flush with the wall
      const off = WALL_T / 2 + 0.06;
      if (alongX) {
        sm.position.set(d.x, y, d.z + (d.kind === 'rollup' ? off + 0.1 : 0));
        sm.rotation.y = 0;
      } else {
        sm.position.set(d.x, y, d.z);
        sm.rotation.y = Math.PI / 2;
      }
      if (locked) {
        // put sign on the side that faces the accessible area
        const pa = alongX ? this.areaAt(d.x, d.z + 0.6) : this.areaAt(d.x + 0.6, d.z);
        const accessible = pa === 'sales' || (pa !== 'outside' && this.rooms.has(pa as RoomId)) || (pa === 'outside' && d.kind === 'rollup');
        const s = accessible ? 1 : -1;
        if (alongX) sm.position.z = d.z + s * off;
        else sm.position.x = d.x + s * off;
        rt.sign = sm;
        const box = new THREE.Box3().setFromCenterAndSize(sm.position.clone(), alongX ? new V3(sw, sh + 0.8, 0.5) : new V3(0.5, sh + 0.8, sw));
        this.signs.push({ mesh: sm, box, kind: 'room', index: 0, room: room?.id });
      } else {
        // put the label on the side you approach from (not inside the room itself)
        const areaP = alongX ? this.areaAt(d.x, d.z + 0.6) : this.areaAt(d.x + 0.6, d.z);
        let s = areaP === d.room ? -1 : 1;
        if (d.label === 'EXIT') s = -s;
        if (alongX) sm.position.z = d.z + s * off;
        else sm.position.x = d.x + s * off;
      }
      g.add(sm);
    }
    this.dynamic.add(g);
    // collider for the closed door
    const t = 0.12;
    rt.collider = alongX
      ? this.col.add(d.x - d.w / 2, d.z - t, d.x + d.w / 2, d.z + t, 0, d.h, 'door', rt)
      : this.col.add(d.x - t, d.z - d.w / 2, d.x + t, d.z + d.w / 2, 0, d.h, 'door', rt);
    this.doors.push(rt);
  }

  private buildSigns(state: GameState) {
    // main store sign above the first entrance (and second one when available)
    const entrances = ENTRANCE_COLS.filter((c) => this.isPlot(c, 0));
    if (this.signTex) this.signTex.dispose();
    this.signTex = T.signTexture(state.storeName.toUpperCase(), { bg: '#d23b2c', fg: '#ffffff', w: 1024, h: 200, border: '#ffffff' }) as THREE.CanvasTexture;
    const mat = new THREE.MeshStandardMaterial({ map: this.signTex, emissiveMap: this.signTex, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.15, roughness: 0.4 });
    this.daylight.registerNightGlow(mat, 0.9);
    for (const c of entrances) {
      const cx = c * PLOT + PLOT / 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.25, 0.18), [this.mats.frame, this.mats.frame, this.mats.frame, this.mats.frame, mat, this.mats.frame]);
      m.position.set(cx, BLD_H - 0.75, WALL_T / 2 + 0.12);
      this.dynamic.add(m);
    }
    // OPEN / CLOSED sign next to the first entrance (inside the glass, readable from both sides)
    const door = DOORS[0];
    const sm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.03), new THREE.MeshBasicMaterial({ map: state.open ? this.openTexOpen : this.openTexClosed, toneMapped: false }));
    sm.position.set(door.x + 2.2, 1.95, -0.22);
    this.openSign = sm;
    this.openSignBox.setFromCenterAndSize(sm.position, new V3(1.0, 0.7, 0.6));
    // hanging strings
    const f = new GeoBuilder();
    f.box(0.01, 0.6, 0.01, '#222222', sm.position.x - 0.35, 2.48, sm.position.z);
    f.box(0.01, 0.6, 0.01, '#222222', sm.position.x + 0.35, 2.48, sm.position.z);
    this.dynamic.add(new THREE.Mesh(f.build()!, this.mats.frame));
    this.dynamic.add(sm);
  }

  setOpenSign(open: boolean) {
    if (!this.openSign) return;
    (this.openSign.material as THREE.MeshBasicMaterial).map = open ? this.openTexOpen : this.openTexClosed;
    (this.openSign.material as THREE.MeshBasicMaterial).needsUpdate = true;
  }

  setPower(on: boolean) {
    this.lightLevel = on ? 1 : 0.06;
    this.applyLight();
  }
  private applyLight() {
    this.glowMat.color.setScalar(this.lightLevel);
  }

  /** Animate doors; agents = positions of everybody that can open doors. */
  update(dt: number, agents: { x: number; z: number; staff: boolean }[]) {
    for (const d of this.doors) {
      if (!d.active || d.def.kind === 'opening') {
        if (d.collider) this.col.setEnabled(d.collider, d.locked);
        continue;
      }
      let want = 0;
      if (!d.locked) {
        const r = d.def.kind === 'rollup' ? 3.6 : d.def.kind === 'auto' ? 2.6 : 1.7;
        for (const a of agents) {
          if (!a.staff && d.def.room && !ROOM_MAP.get(d.def.room)?.public) continue;
          const dx = a.x - d.def.x, dz = a.z - d.def.z;
          if (dx * dx + dz * dz < r * r) { want = 1; break; }
        }
      }
      const speed = d.def.kind === 'rollup' ? 0.9 : d.def.kind === 'auto' ? 2.2 : 3.2;
      d.open = clamp(d.open + (want ? 1 : -1) * speed * dt, 0, 1);
      const e = d.open * d.open * (3 - 2 * d.open);
      for (const p of d.panels) {
        if (p.mode === 'slide') {
          if (d.def.axis === 'x') p.obj.position.x = p.base.x + p.dir * p.travel * e;
          else p.obj.position.z = p.base.z + p.dir * p.travel * e;
        } else if (p.mode === 'roll') {
          p.obj.position.y = p.base.y + p.travel * e;
          p.obj.scale.y = 1 - 0.85 * e;
        } else {
          p.obj.rotation.y = p.baseRot + p.dir * p.travel * e;
        }
      }
      if (d.collider) this.col.setEnabled(d.collider, d.locked || d.open < 0.7);
    }
  }

  doorById(id: string) { return this.doors.find((d) => d.def.id === id); }
}
