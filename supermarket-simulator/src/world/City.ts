// Street, sidewalks, neighbor buildings, parking lot, trees, lamps and traffic.
import * as THREE from 'three';
import { GeoBuilder, trs } from '../gfx/GeoBuilder';
import * as T from '../gfx/Textures';
import { Rng } from '../core/util';
import type { Daylight } from './Daylight';

/** Rounded rectangle path (CanvasRenderingContext2D.roundRect is missing on older Android WebViews). */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export const STREET = {
  sidewalkZ0: 0,
  sidewalkZ1: 5,
  roadZ0: 5.25,
  roadZ1: 15.25,
  farWalkZ1: 20,
  roadY: -0.15,
  laneNear: 8.0, // driving -X
  laneFar: 12.5, // driving +X
};

/** Accumulates world-space quads with planar UVs (uv = world meters / scale). */
class Planar {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  constructor(public uScale = 1, public vScale = 1) {}
  quad(p: THREE.Vector3[], n: THREE.Vector3, uvs: [number, number][], color = new THREE.Color(1, 1, 1)) {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i].x, p[i].y, p[i].z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.col.push(color.r, color.g, color.b);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** Horizontal rect at height y, UV from world xz. */
  floor(x0: number, z0: number, x1: number, z1: number, y: number, color?: THREE.Color) {
    const V = THREE.Vector3;
    this.quad([new V(x0, y, z1), new V(x1, y, z1), new V(x1, y, z0), new V(x0, y, z0)], new V(0, 1, 0),
      [[x0 / this.uScale, -z1 / this.vScale], [x1 / this.uScale, -z1 / this.vScale], [x1 / this.uScale, -z0 / this.vScale], [x0 / this.uScale, -z0 / this.vScale]], color);
  }
  /** Vertical rect facing direction n (axis aligned). */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, n: THREE.Vector3, color?: THREE.Color, u0 = 0) {
    const V = THREE.Vector3;
    const len = Math.hypot(bx - ax, bz - az);
    this.quad([new V(ax, y0, az), new V(bx, y0, bz), new V(bx, y1, bz), new V(ax, y1, az)], n,
      [[u0 / this.uScale, y0 / this.vScale], [(u0 + len) / this.uScale, y0 / this.vScale], [(u0 + len) / this.uScale, y1 / this.vScale], [u0 / this.uScale, y1 / this.vScale]], color);
  }
  /** Box with all faces (except bottom). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color?: THREE.Color) {
    const V = THREE.Vector3;
    this.wall(x0, z1, x1, z1, y0, y1, new V(0, 0, 1), color, x0);
    this.wall(x1, z0, x0, z0, y0, y1, new V(0, 0, -1), color, -x1);
    this.wall(x1, z1, x1, z0, y0, y1, new V(1, 0, 0), color, -z1);
    this.wall(x0, z0, x0, z1, y0, y1, new V(-1, 0, 0), color, z0);
    this.floor(x0, z0, x1, z1, y1, color);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
export { Planar };

interface Car { mesh: THREE.Group; speed: number; lane: number; dir: number; wheels: THREE.Object3D[]; }

export class City {
  readonly group = new THREE.Group();
  private cars: Car[] = [];
  private rng = new Rng(2024);
  lampLights: THREE.Mesh[] = [];

  constructor(private daylight: Daylight) {
    this.build();
  }

  private stdMat(map: THREE.Texture | null, opts: THREE.MeshStandardMaterialParameters = {}, outdoor = true) {
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.92, ...opts });
    if (outdoor) this.daylight.registerOutdoor(m);
    return m;
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = { cast: false, receive: true }) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow.cast;
    m.receiveShadow = shadow.receive;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.group.add(m);
    return m;
  }

  private build() {
    const S = STREET;
    // ---- ground (outer)
    const groundTex = T.grass(256);
    const ground = new Planar(6, 6);
    ground.floor(-260, -260, 360, 260, -0.2);
    this.add(ground.geometry(), this.stdMat(groundTex, { color: 0x9aa58f }));

    // ---- road
    const asphaltTex = T.asphalt(512);
    const road = new Planar(8, 8);
    road.floor(-260, S.roadZ0, 360, S.roadZ1, S.roadY);
    // parking lot + service roads use asphalt too
    road.floor(66, -34, 104, 0, -0.01); // parking
    road.floor(-24, -50, 110, -32, -0.01); // back service road
    road.floor(-24, -32, -16.2, 0, -0.01); // side alley
    this.add(road.geometry(), this.stdMat(asphaltTex, { color: 0xffffff, roughness: 0.95 }));

    // ---- road markings (white / yellow)
    const marks = new GeoBuilder();
    for (let x = -250; x < 350; x += 6) marks.box(3, 0.01, 0.15, '#f4f4f4', x, S.roadY + 0.006, (S.roadZ0 + S.roadZ1) / 2);
    marks.box(610, 0.01, 0.12, '#f4f4f4', 50, S.roadY + 0.006, S.roadZ0 + 0.35);
    marks.box(610, 0.01, 0.12, '#f4f4f4', 50, S.roadY + 0.006, S.roadZ1 - 0.35);
    // zebra crossing near the store entrance
    for (let i = 0; i < 8; i++) marks.box(3.5, 0.012, 0.5, '#f4f4f4', 22, S.roadY + 0.008, S.roadZ0 + 0.8 + i * 1.2, { ry: 0 });
    // parking spaces
    for (let i = 0; i < 8; i++) {
      marks.box(0.12, 0.01, 5, '#f4f4f4', 70 + i * 4, 0.0, -26);
      marks.box(0.12, 0.01, 5, '#f4f4f4', 70 + i * 4, 0.0, -12);
    }
    // delivery spot box (front of warehouse roll-up door)
    marks.box(5.2, 0.012, 0.14, '#ffd600', -4.5, 0.012, 1.0);
    marks.box(5.2, 0.012, 0.14, '#ffd600', -4.5, 0.012, 4.6);
    marks.box(0.14, 0.012, 3.6, '#ffd600', -7.1, 0.012, 2.8);
    marks.box(0.14, 0.012, 3.6, '#ffd600', -1.9, 0.012, 2.8);
    for (let i = 0; i < 6; i++) marks.box(0.12, 0.012, 1.4, '#ffd600', -6.6 + i * 0.85, 0.012, 2.8, { ry: 0.7 });
    const markGeo = marks.build()!;
    const markMat = this.stdMat(null, { vertexColors: true, roughness: 0.8 });
    this.add(markGeo, markMat);

    // ---- sidewalks
    const paver = T.pavers({ color: '#c9c6bf' });
    const walk = new Planar(2.5, 2.5);
    walk.floor(-260, S.sidewalkZ0 - 0.0, 360, S.sidewalkZ1, 0);
    walk.floor(-260, S.roadZ1, 360, S.farWalkZ1, 0);
    // left of the BOH wing / alley mouth
    const walkMat = this.stdMat(paver.map, { normalMap: paver.normalMap, color: 0xffffff, roughness: 0.9 });
    this.add(walk.geometry(), walkMat);
    // curbs
    const curb = new Planar(1, 1);
    curb.box(-260, -0.2, S.sidewalkZ1, 360, 0.01, S.roadZ0);
    curb.box(-260, -0.2, S.roadZ1 - 0.25, 360, 0.01, S.roadZ1);
    this.add(curb.geometry(), this.stdMat(T.concrete({ color: '#b8b5ae', size: 256 }), { roughness: 0.9 }));

    // ---- vacant store lot (gravel) - visible where the store hasn't expanded yet
    const lot = new Planar(4, 4);
    lot.floor(0, -32, 66, 0, -0.005);
    lot.floor(-16, -48, 0, -32, -0.005);
    this.add(lot.geometry(), this.stdMat(T.gravel(256), { roughness: 1 }));

    // ---- buildings across the street + neighbors
    this.buildBlocks();
    this.buildStreetFurniture();
    this.buildBillboard();
    this.buildTraffic();
  }

  private buildBlocks() {
    const variants = [
      { wall: '#b4553f', brick: true, floors: 3, cols: 4, frame: '#e8e2d6' },
      { wall: '#d9c7a3', brick: false, floors: 3, cols: 4, frame: '#ffffff' },
      { wall: '#8f9ba6', brick: false, floors: 4, cols: 5, frame: '#e0e6eb' },
      { wall: '#9c6b4e', brick: true, floors: 3, cols: 3, frame: '#f0ebe1' },
      { wall: '#e8dccb', brick: false, floors: 4, cols: 4, frame: '#8a7a68' },
      { wall: '#6f8f7f', brick: false, floors: 3, cols: 4, frame: '#f4f4f4' },
    ];
    const mats = variants.map((v, i) => {
      const f = T.facade({ wall: v.wall, brick: v.brick, floors: v.floors, cols: v.cols, frame: v.frame, seed: 100 + i });
      f.map.wrapS = f.map.wrapT = THREE.RepeatWrapping;
      f.emissiveMap.wrapS = f.emissiveMap.wrapT = THREE.RepeatWrapping;
      const m = this.stdMat(f.map, { emissiveMap: f.emissiveMap, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0, roughness: 0.85 });
      this.daylight.registerNightGlow(m, 1.1);
      return { m, v };
    });
    const planars = mats.map(() => new Planar(1, 1));
    const roofs = new Planar(4, 4);
    const tileW = 3.2; // meters per window column
    const tileH = 3.4; // meters per floor
    const addBuilding = (vi: number, x0: number, z0: number, x1: number, z1: number, h: number, faceDir: 'z+' | 'z-' | 'x+' | 'x-') => {
      const p = planars[vi];
      const v = variants[vi];
      p.uScale = tileW * v.cols;
      p.vScale = tileH * v.floors;
      const V = THREE.Vector3;
      p.wall(x0, z1, x1, z1, 0, h, new V(0, 0, 1), undefined, x0);
      p.wall(x1, z0, x0, z0, 0, h, new V(0, 0, -1), undefined, -x1);
      p.wall(x1, z1, x1, z0, 0, h, new V(1, 0, 0), undefined, -z1);
      p.wall(x0, z0, x0, z1, 0, h, new V(-1, 0, 0), undefined, z0);
      roofs.floor(x0, z0, x1, z1, h);
      void faceDir;
    };
    // across the street
    let x = -150;
    while (x < 230) {
      const w = this.rng.range(11, 20);
      const h = this.rng.pick([7, 10.2, 10.2, 13.6, 13.6, 17]);
      const vi = this.rng.int(0, variants.length - 1);
      addBuilding(vi, x, 21.5, x + w, 21.5 + this.rng.range(12, 18), h, 'z-');
      this.shopFront(x + 0.5, x + w - 0.5, 21.5, -1);
      x += w + this.rng.range(0, 1.5);
    }
    // left neighbor (3-story brick)
    addBuilding(0, -46, -26, -18, 0, 10.2, 'z+');
    this.shopFront(-45, -19, 0, 1);
    // further left
    addBuilding(3, -80, -24, -47, 0, 13.6, 'z+');
    this.shopFront(-79, -48, 0, 1);
    // right neighbor beyond the parking lot
    addBuilding(2, 106, -30, 140, 0, 17, 'z+');
    addBuilding(4, 141, -24, 175, 0, 13.6, 'z+');
    // behind (back row)
    for (let bx = -60; bx < 160; bx += 26) addBuilding(this.rng.int(0, 5), bx, -90, bx + 22, -60, this.rng.pick([10.2, 13.6, 17, 20.4]), 'z+');
    planars.forEach((p, i) => this.add(p.geometry(), mats[i].m, { cast: false, receive: true }));
    this.add(roofs.geometry(), this.stdMat(T.concrete({ color: '#7d7f82', size: 256 }), { roughness: 1 }));

    // distant skyline silhouettes
    const sky = new GeoBuilder();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = this.rng.range(190, 260);
      const hh = this.rng.range(20, 70);
      sky.box(this.rng.range(15, 35), hh, this.rng.range(15, 35), '#7f8b96', Math.cos(a) * r + 40, hh / 2, Math.sin(a) * r, { ry: a });
    }
    this.add(sky.build()!, this.stdMat(null, { vertexColors: true, roughness: 1 }));
  }

  /** Ground floor shop window with an awning. dir: +1 faces +Z, -1 faces -Z */
  private shopFront(x0: number, x1: number, z: number, dir: number) {
    const b = new GeoBuilder();
    const e = new GeoBuilder();
    const n = Math.max(1, Math.floor((x1 - x0) / 6));
    const w = (x1 - x0) / n;
    const awningCols = [['#d32f2f', '#ffffff'], ['#2e7d32', '#ffffff'], ['#1565c0', '#ffffff'], ['#f9a825', '#ffffff'], ['#6a1b9a', '#fce4ec']];
    for (let i = 0; i < n; i++) {
      const cx = x0 + w * (i + 0.5);
      const [c1, c2] = this.rng.pick(awningCols);
      // dark window
      b.box(w - 1.2, 2.4, 0.06, '#24323d', cx, 1.6, z + dir * 0.04);
      e.box(w - 1.4, 2.2, 0.02, '#ffe7b0', cx, 1.6, z + dir * 0.08);
      // awning stripes
      const stripes = 8;
      for (let k = 0; k < stripes; k++) {
        const sx = cx - (w - 0.6) / 2 + ((w - 0.6) / stripes) * (k + 0.5);
        b.box((w - 0.6) / stripes, 0.05, 1.4, k % 2 ? c1 : c2, sx, 3.25, z + dir * 0.7, { rx: dir * 0.35 });
      }
      b.box(w - 0.6, 0.25, 0.05, c1, cx, 3.0, z + dir * 1.35);
      // sign
      b.box(w - 1.5, 0.5, 0.08, this.rng.pick(['#263238', '#4e342e', '#1a237e', '#3e2723']), cx, 3.9, z + dir * 0.06);
    }
    const g = b.build()!;
    const m = this.stdMat(null, { vertexColors: true, roughness: 0.8 });
    this.add(g, m, { cast: false, receive: false });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true });
    this.daylight.registerNightGlow(glowMat, 0.9);
    this.add(e.build()!, glowMat, { cast: false, receive: false });
  }

  private buildStreetFurniture() {
    const S = STREET;
    const b = new GeoBuilder();
    const glow = new GeoBuilder();
    // street lamps along the store side
    for (let x = -66; x <= 130; x += 15) {
      b.cyl(0.08, 0.11, 6.5, '#3b4248', x, 3.25, S.sidewalkZ1 - 0.5, { seg: 8 });
      b.box(0.1, 0.1, 1.8, '#3b4248', x, 6.45, S.sidewalkZ1 + 0.35);
      b.box(0.35, 0.12, 0.6, '#2b3036', x, 6.4, S.sidewalkZ1 + 1.2);
      glow.box(0.3, 0.03, 0.5, '#fff3c4', x, 6.33, S.sidewalkZ1 + 1.2);
    }
    for (let x = -60; x <= 130; x += 15) {
      b.cyl(0.08, 0.11, 6.5, '#3b4248', x + 7, 3.25, S.roadZ1 + 0.7, { seg: 8 });
      b.box(0.1, 0.1, 1.8, '#3b4248', x + 7, 6.45, S.roadZ1 - 0.15);
      b.box(0.35, 0.12, 0.6, '#2b3036', x + 7, 6.4, S.roadZ1 - 1.0);
      glow.box(0.3, 0.03, 0.5, '#fff3c4', x + 7, 6.33, S.roadZ1 - 1.0);
    }
    // parking lot lamps
    for (const [lx, lz] of [[72, -19], [88, -19], [100, -19]]) {
      b.cyl(0.1, 0.12, 7, '#3b4248', lx, 3.5, lz, { seg: 8 });
      b.box(1.4, 0.14, 0.4, '#2b3036', lx, 7, lz);
      glow.box(1.2, 0.03, 0.3, '#fff3c4', lx, 6.93, lz);
    }
    // trees on the far sidewalk and around the parking
    const treeSpots: [number, number][] = this.treeSpots;
    for (let x = -64; x <= 140; x += 12) treeSpots.push([x + 3, 18.2]);
    for (let z = -30; z <= -4; z += 8) treeSpots.push([105, z]);
    treeSpots.push([-20, -44], [10, -46], [40, -46], [70, -45], [95, -44]);
    for (const [tx, tz] of treeSpots) {
      b.cyl(0.12, 0.18, 2.6, '#6d4c41', tx, 1.3, tz, { seg: 7 });
      const g1 = this.rng.pick(['#3f7d3a', '#4f8f3f', '#2f6b34', '#5a9446']);
      b.sphere(1.5, g1, tx, 3.6, tz, { ws: 9, hs: 7 });
      b.sphere(1.1, g1, tx + 0.7, 3.0, tz + 0.3, { ws: 8, hs: 6 });
      b.sphere(1.0, g1, tx - 0.6, 3.2, tz - 0.4, { ws: 8, hs: 6 });
      b.box(1.4, 0.06, 1.4, '#5d4037', tx, 0.03, tz);
    }
    // benches + bus stop on the store sidewalk (left side)
    b.box(3.5, 0.08, 1.2, '#455a64', -32, 2.6, 2.6);
    b.box(0.08, 2.6, 0.08, '#455a64', -33.6, 1.3, 2.1);
    b.box(0.08, 2.6, 0.08, '#455a64', -30.4, 1.3, 2.1);
    b.box(3.4, 1.8, 0.04, '#90caf9', -32, 1.5, 2.05);
    b.box(2.6, 0.08, 0.45, '#8d6e63', -32, 0.48, 2.4);
    b.box(0.6, 2.4, 0.08, '#fdd835', -34.2, 1.4, 4.3);
    // fire hydrant + mailbox + bike rack
    b.cyl(0.12, 0.14, 0.7, '#d32f2f', 30, 0.35, 4.2, { seg: 8 });
    b.sphere(0.12, '#d32f2f', 30, 0.72, 4.2, { ws: 8, hs: 5 });
    b.box(0.5, 1.1, 0.4, '#1565c0', 52, 0.55, 4.3);
    for (let i = 0; i < 5; i++) b.torus(0.35, 0.025, '#9e9e9e', 58 + i * 0.6, 0.35, 4.2, { rs: 4, ts: 10, arc: Math.PI });
    // fence + sign at the vacant lot is built by the store building (depends on expansions)
    // parking "P" sign
    b.cyl(0.05, 0.05, 2.8, '#9e9e9e', 66.5, 1.4, 1.2, { seg: 6 });
    b.box(0.9, 0.9, 0.06, '#1565c0', 66.5, 3.0, 1.2);
    b.box(0.3, 0.6, 0.07, '#ffffff', 66.4, 3.0, 1.2);
    // parked cars (decor)
    const parked = [[72, -26], [80, -26], [92, -12], [96, -26], [76, -12]];
    for (const [px, pz] of parked) this.carGeometry(b, px, pz, this.rng.pick(['#c62828', '#1565c0', '#eeeeee', '#212121', '#9e9e9e', '#2e7d32']), Math.PI / 2);

    const mat = this.stdMat(null, { vertexColors: true, roughness: 0.7 });
    this.add(b.build()!, mat, { cast: true, receive: true });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff3c4, emissiveIntensity: 0, vertexColors: true });
    this.daylight.registerNightGlow(glowMat, 2.0);
    this.add(glow.build()!, glowMat, { cast: false, receive: false });

    // light pools on the ground at night (additive)
    const poolTex = (() => {
      const [c, ctx] = T.makeCanvas(128, 128);
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,235,180,0.55)');
      g.addColorStop(0.5, 'rgba(255,225,160,0.18)');
      g.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      return T.toTexture(c, { repeat: false });
    })();
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    const pools = new GeoBuilder();
    for (let x = -66; x <= 130; x += 15) pools.plane(9, 9, '#ffffff', x, 0.03, S.sidewalkZ1 + 0.6, { rx: -Math.PI / 2, uv: 'keep' });
    for (let x = -60; x <= 130; x += 15) pools.plane(9, 9, '#ffffff', x + 7, S.roadY + 0.03, S.roadZ1 - 1.2, { rx: -Math.PI / 2, uv: 'keep' });
    for (const lx of [72, 88, 100]) pools.plane(11, 11, '#ffffff', lx, 0.03, -19, { rx: -Math.PI / 2, uv: 'keep' });
    const poolMesh = this.add(pools.build()!, poolMat, { cast: false, receive: false });
    poolMesh.renderOrder = 2;
    this.daylight.registerNightOnly(poolMesh);
  }

  // ------------------------------------------------------------------ billboard across the street
  private treeSpots: [number, number][] = [];
  private winter: THREE.Group | null = null;

  /** Winter look: snow on sidewalks, curbs, the parking lot and on the trees. */
  setWinter(on: boolean) {
    if (!on) {
      if (this.winter) this.winter.visible = false;
      return;
    }
    if (!this.winter) this.winter = this.buildWinter();
    this.winter.visible = true;
  }

  private buildWinter(): THREE.Group {
    const S = STREET;
    const grp = new THREE.Group();
    const [c, ctx] = T.makeCanvas(256, 256);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    const img = ctx.getImageData(0, 0, 256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const x = i % 256, y = Math.floor(i / 256);
      const n = 0.5 + 0.25 * Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) + 0.25 * Math.sin(y * 0.09 + Math.cos(x * 0.05) * 3);
      const v = 236 + Math.floor(n * 19);
      img.data[i * 4] = v - 6;
      img.data[i * 4 + 1] = v - 2;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.floor(205 + n * 50);
    }
    ctx.putImageData(img, 0, 0);
    const tex = T.toTexture(c, { repeat: true });
    const mk = (opacity: number) => {
      const m = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.88, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
      this.daylight.registerOutdoor(m);
      return m;
    };
    const thick = mk(0.97), trampled = mk(0.5), slush = mk(0.75);
    const plane = (x0: number, z0: number, x1: number, z1: number, y: number, mat: THREE.Material) => {
      const w = x1 - x0, d = z1 - z0;
      const geo = new THREE.PlaneGeometry(w, d);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 5, uv.getY(i) * d / 5);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      m.receiveShadow = true;
      m.renderOrder = 1;
      grp.add(m);
    };
    plane(-70, S.roadZ1 + 0.05, 140, S.farWalkZ1, 0.025, thick); // far sidewalk
    plane(-70, 0.15, 140, S.sidewalkZ1, 0.025, trampled); // store sidewalk (people walk here)
    plane(-70, S.roadZ0, 140, S.roadZ0 + 0.7, S.roadY + 0.02, slush); // curb slush
    plane(-70, S.roadZ1 - 0.7, 140, S.roadZ1, S.roadY + 0.02, slush);
    plane(66, -32, 106, -2, 0.02, trampled); // parking lot
    // snow caps on the trees
    const b = new GeoBuilder();
    for (const [tx, tz] of this.treeSpots) {
      b.sphere(1.32, '#f4f8fc', tx, 4.72, tz, { sy: 0.42, ws: 9, hs: 6 });
      b.sphere(0.8, '#f4f8fc', tx + 0.7, 3.78, tz + 0.3, { sy: 0.4, ws: 8, hs: 5 });
    }
    const capMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.daylight.registerOutdoor(capMat);
    const caps = new THREE.Mesh(b.build()!, capMat);
    caps.castShadow = true;
    grp.add(caps);
    this.group.add(grp);
    return grp;
  }

  private billboardMat: THREE.MeshStandardMaterial | null = null;
  private billboardKey = '';
  private billboardTex: THREE.Texture | null = null;

  private buildBillboard() {
    const x = 17, z = 19.3;
    const b = new GeoBuilder();
    b.box(0.25, 4.7, 0.25, '#5f6a72', x - 2.2, 2.35, z + 0.2);
    b.box(0.25, 4.7, 0.25, '#5f6a72', x + 2.2, 2.35, z + 0.2);
    b.box(6.4, 3.4, 0.22, '#37474f', x, 6.1, z + 0.12);
    b.box(6.2, 0.1, 0.7, '#5f6a72', x, 4.36, z - 0.15);
    for (const lx of [-1.8, 0, 1.8]) b.box(0.08, 0.5, 0.08, '#37474f', x + lx, 4.6, z - 0.45);
    this.add(b.build()!, this.stdMat(null, { vertexColors: true, roughness: 0.7 }), { cast: true, receive: true });
    const mat = this.stdMat(null, { roughness: 0.55 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 3.0), mat);
    panel.position.set(x, 6.1, z - 0.012);
    panel.rotation.y = Math.PI; // faces the store (-z)
    this.group.add(panel);
    this.billboardMat = mat;
    this.setBillboard(null);
  }

  /** Shows the store's own ad while a billboard campaign runs, otherwise a cola ad. */
  setBillboard(storeName: string | null, hours = '8:00–22:00') {
    const key = storeName ? `store:${storeName}:${hours}` : 'cola';
    if (!this.billboardMat || key === this.billboardKey) return;
    this.billboardKey = key;
    const [c, ctx] = T.makeCanvas(1024, 512);
    if (storeName) {
      const gr = ctx.createLinearGradient(0, 0, 1024, 512);
      gr.addColorStop(0, '#d23b2c');
      gr.addColorStop(1, '#ff8f00');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 1024, 512);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 9; i++) ctx.fillRect(-200 + i * 160, 0, 60, 512);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      let fs = 120;
      ctx.font = `${fs}px 'Lilita One', 'Arial Black', sans-serif`;
      const name = storeName.toUpperCase();
      while (ctx.measureText(name).width > 900 && fs > 40) { fs *= 0.92; ctx.font = `${fs}px 'Lilita One', 'Arial Black', sans-serif`; }
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowOffsetY = 6;
      ctx.fillText(name, 512, 150);
      ctx.shadowColor = 'transparent';
      ctx.font = `800 54px 'Nunito', sans-serif`;
      ctx.fillText('Fresh deals every day!', 512, 285);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      roundRectPath(ctx, 262, 352, 500, 92, 46);
      ctx.fill();
      ctx.fillStyle = '#7a1e12';
      ctx.font = `46px 'Lilita One', 'Arial Black', sans-serif`;
      ctx.fillText(`🛒 OPEN ${hours}`, 512, 400);
    } else {
      const gr = ctx.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, '#0d47a1');
      gr.addColorStop(1, '#1e88e5');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.2})`;
        ctx.beginPath();
        ctx.arc(Math.random() * 1024, Math.random() * 512, 4 + Math.random() * 16, 0, Math.PI * 2);
        ctx.fill();
      }
      // bottle
      ctx.fillStyle = '#c62828';
      ctx.beginPath();
      roundRectPath(ctx, 110, 120, 150, 330, 40);
      ctx.fill();
      ctx.fillRect(160, 60, 50, 80);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(110, 250, 150, 70);
      ctx.fillStyle = '#c62828';
      ctx.font = `34px 'Lilita One', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FIZZY', 185, 286);
      ctx.fillStyle = '#ffffff';
      ctx.font = `140px 'Lilita One', 'Arial Black', sans-serif`;
      ctx.fillText('FIZZY COLA', 640, 210);
      ctx.font = `800 52px 'Nunito', sans-serif`;
      ctx.fillText('Ice cold. Every day.', 640, 340);
    }
    this.billboardTex?.dispose();
    this.billboardTex = T.toTexture(c, { repeat: false });
    this.billboardMat.map = this.billboardTex;
    this.billboardMat.needsUpdate = true;
  }

  carGeometry(b: GeoBuilder, x: number, z: number, color: string, ry: number) {
    const prev = b.base;
    b.base = trs(x, 0, z, { ry });
    b.rbox(1.8, 0.7, 4.3, 0.18, color, 0, 0.62, 0);
    b.rbox(1.6, 0.6, 2.3, 0.2, color, 0, 1.18, -0.2);
    b.box(1.62, 0.45, 2.0, '#1e2a33', 0, 1.2, -0.2);
    b.box(1.5, 0.08, 0.1, '#fff8e1', 0, 0.75, 2.15);
    b.box(1.5, 0.08, 0.1, '#e53935', 0, 0.8, -2.15);
    for (const wx of [-0.82, 0.82]) for (const wz of [-1.35, 1.35]) b.cyl(0.33, 0.33, 0.24, '#1b1b1b', wx, 0.33, wz, { rz: Math.PI / 2, seg: 10 });
    b.base = prev;
  }

  private buildTraffic() {
    const colors = ['#c62828', '#1565c0', '#f5f5f5', '#212121', '#9e9e9e', '#2e7d32', '#f9a825', '#6a1b9a'];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const b = new GeoBuilder();
      this.carGeometry(b, 0, 0, colors[i % colors.length], 0);
      const mat = this.stdMat(null, { vertexColors: true, roughness: 0.45, metalness: 0.2 });
      const mesh = new THREE.Mesh(b.build()!, mat);
      mesh.castShadow = true;
      g.add(mesh);
      const dir = i % 2 ? 1 : -1;
      const lane = dir < 0 ? STREET.laneNear : STREET.laneFar;
      g.position.set(-150 + this.rng.range(0, 400), STREET.roadY, lane);
      g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.group.add(g);
      this.cars.push({ mesh: g, speed: this.rng.range(8, 13), lane, dir, wheels: [] });
    }
  }

  /** Cars avoid the truck stopped at the delivery spot (simple slow-down). */
  update(dt: number, blockers: { x: number; z: number }[]) {
    for (const c of this.cars) {
      let speed = c.speed;
      for (const bl of blockers) {
        if (Math.abs(bl.z - c.lane) > 2.5) continue;
        const ahead = (bl.x - c.mesh.position.x) * c.dir;
        if (ahead > 0 && ahead < 14) speed = Math.min(speed, Math.max(0, (ahead - 7) * 1.5));
      }
      for (const o of this.cars) {
        if (o === c || o.lane !== c.lane) continue;
        const ahead = (o.mesh.position.x - c.mesh.position.x) * c.dir;
        if (ahead > 0 && ahead < 9) speed = Math.min(speed, Math.max(0, (ahead - 6) * 2));
      }
      c.mesh.position.x += speed * c.dir * dt;
      if (c.dir > 0 && c.mesh.position.x > 260) c.mesh.position.x = -160;
      if (c.dir < 0 && c.mesh.position.x < -160) c.mesh.position.x = 260;
    }
  }
}
