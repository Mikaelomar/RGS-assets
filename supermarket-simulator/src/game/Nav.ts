// Grid navigation (0.5 m cells) with A* and path smoothing. Rebuilt lazily when colliders change.
import type { Collision, Collider } from './Collision';
import type { Building } from '../world/Building';
import { ROOM_MAP } from './layout';

const CELL = 0.5;
const X0 = -60, Z0 = -52, X1 = 135, Z1 = 19.5;
const W = Math.ceil((X1 - X0) / CELL), H = Math.ceil((Z1 - Z0) / CELL);

/** 0 = blocked, 1 = public walkable, 2 = staff-only walkable */
export class NavGrid {
  grid = new Uint8Array(W * H);
  private builtVersion = -1;
  private open: Int32Array = new Int32Array(W * H);
  private g = new Float32Array(W * H);
  private came = new Int32Array(W * H);
  private stamp = new Uint32Array(W * H);
  private closedStamp = new Uint32Array(W * H);
  private cur = 1;
  private heap: number[] = [];
  private f = new Float32Array(W * H);

  constructor(private col: Collision, private building: Building) {}

  idx(x: number, z: number) {
    const cx = Math.floor((x - X0) / CELL), cz = Math.floor((z - Z0) / CELL);
    if (cx < 0 || cz < 0 || cx >= W || cz >= H) return -1;
    return cz * W + cx;
  }
  cellCenter(i: number): [number, number] {
    return [X0 + ((i % W) + 0.5) * CELL, Z0 + (Math.floor(i / W) + 0.5) * CELL];
  }

  ensure() {
    if (this.builtVersion === this.col.structVersion) return;
    this.builtVersion = this.col.structVersion;
    this.rebuild();
  }

  private rebuild() {
    const grid = this.grid;
    // area classification
    for (let cz = 0; cz < H; cz++) {
      for (let cx = 0; cx < W; cx++) {
        const x = X0 + (cx + 0.5) * CELL, z = Z0 + (cz + 0.5) * CELL;
        const a = this.building.areaAt(x, z);
        let v = 1;
        if (a !== 'outside' && a !== 'sales') {
          const room = ROOM_MAP.get(a)!;
          v = room.public ? 1 : 2;
        }
        // keep people off the road except at the zebra crossing
        if (z > 5.25 && z < 15.25 && !(x > 20 && x < 24)) v = 0;
        if (z > 19.5) v = 0;
        grid[cz * W + cx] = v;
      }
    }
    // blockers (inflated by agent radius)
    const r = 0.28;
    for (const c of this.col.all()) {
      if (!c.enabled && c.tag !== 'door') continue;
      if (c.y0 > 1.6 || c.y1 < 0.3) continue;
      if (c.tag === 'door') {
        // doors: passable unless locked
        const rt = c.owner as { locked: boolean } | undefined;
        if (rt && !rt.locked) continue;
      }
      this.stamp_(c, r);
    }
  }

  private stamp_(c: Collider, r: number) {
    const x0 = Math.floor((c.x0 - r - X0) / CELL), x1 = Math.floor((c.x1 + r - X0) / CELL);
    const z0 = Math.floor((c.z0 - r - Z0) / CELL), z1 = Math.floor((c.z1 + r - Z0) / CELL);
    for (let cz = Math.max(0, z0); cz <= Math.min(H - 1, z1); cz++)
      for (let cx = Math.max(0, x0); cx <= Math.min(W - 1, x1); cx++) {
        const x = X0 + (cx + 0.5) * CELL, z = Z0 + (cz + 0.5) * CELL;
        if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) this.grid[cz * W + cx] = 0;
      }
  }

  walkable(x: number, z: number, staff = false) {
    this.ensure();
    const i = this.idx(x, z);
    if (i < 0) return false;
    const v = this.grid[i];
    return v === 1 || (staff && v === 2);
  }

  /** Nearest walkable cell to (x,z). */
  nearestWalkable(x: number, z: number, staff = false, maxR = 6): [number, number] | null {
    this.ensure();
    const i0 = this.idx(x, z);
    if (i0 >= 0 && (this.grid[i0] === 1 || (staff && this.grid[i0] === 2))) return [x, z];
    const cx0 = Math.floor((x - X0) / CELL), cz0 = Math.floor((z - Z0) / CELL);
    const R = Math.ceil(maxR / CELL);
    let best: number = -1, bd = Infinity;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const cx = cx0 + dx, cz = cz0 + dz;
        if (cx < 0 || cz < 0 || cx >= W || cz >= H) continue;
        const v = this.grid[cz * W + cx];
        if (!(v === 1 || (staff && v === 2))) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = cz * W + cx; }
      }
    return best >= 0 ? this.cellCenter(best) : null;
  }

  private passable(i: number, staff: boolean) {
    const v = this.grid[i];
    return v === 1 || (staff && v === 2);
  }

  /** A* path from a to b. Returns smoothed waypoints (excluding start) or null. */
  find(ax: number, az: number, bx: number, bz: number, staff = false, maxIter = 40000): [number, number][] | null {
    this.ensure();
    const sa = this.nearestWalkable(ax, az, staff, 3);
    const sb = this.nearestWalkable(bx, bz, staff, 4);
    if (!sa || !sb) return null;
    const start = this.idx(sa[0], sa[1]);
    const goal = this.idx(sb[0], sb[1]);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [[bx, bz]];
    this.cur++;
    if (this.cur > 4e9) { this.cur = 1; this.stamp.fill(0); this.closedStamp.fill(0); }
    const cur = this.cur;
    const gx = goal % W, gz = Math.floor(goal / W);
    const heap = this.heap;
    heap.length = 0;
    const g = this.g, f = this.f, came = this.came, stamp = this.stamp, closed = this.closedStamp;
    const hfun = (i: number) => {
      const dx = Math.abs((i % W) - gx), dz = Math.abs(Math.floor(i / W) - gz);
      return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz);
    };
    const push = (i: number) => {
      heap.push(i);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[heap[p]] <= f[heap[k]]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1;
          let m = k;
          if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
          if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    stamp[start] = cur;
    g[start] = 0;
    f[start] = hfun(start);
    came[start] = -1;
    push(start);
    let iter = 0;
    let found = false;
    const DX = [1, -1, 0, 0, 1, 1, -1, -1];
    const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (heap.length && iter++ < maxIter) {
      const i = pop();
      if (closed[i] === cur) continue;
      closed[i] = cur;
      if (i === goal) { found = true; break; }
      const cx = i % W, cz = Math.floor(i / W);
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const ni = nz * W + nx;
        if (!this.passable(ni, staff) || closed[ni] === cur) continue;
        if (k >= 4 && (!this.passable(cz * W + nx, staff) || !this.passable(nz * W + cx, staff))) continue;
        const ng = g[i] + (k >= 4 ? 1.4142 : 1);
        if (stamp[ni] !== cur || ng < g[ni]) {
          stamp[ni] = cur;
          g[ni] = ng;
          f[ni] = ng + hfun(ni);
          came[ni] = i;
          push(ni);
        }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let i = goal; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    // string pulling
    const pts: [number, number][] = [];
    let anchor = 0;
    for (let k = 2; k < cells.length; k++) {
      if (!this.lineWalkable(cells[anchor], cells[k], staff)) {
        pts.push(this.cellCenter(cells[k - 1]));
        anchor = k - 1;
      }
    }
    pts.push([bx, bz]);
    if (!this.walkable(bx, bz, staff)) pts[pts.length - 1] = sb;
    return pts;
  }

  private lineWalkable(a: number, b: number, staff: boolean) {
    let x0 = a % W, z0 = Math.floor(a / W);
    const x1 = b % W, z1 = Math.floor(b / W);
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    for (;;) {
      if (!this.passable(z0 * W + x0, staff)) return false;
      if (x0 === x1 && z0 === z1) return true;
      const e2 = 2 * err;
      if (e2 > -dz && e2 < dx) {
        // diagonal step: both neighbors must be open
        if (!this.passable(z0 * W + x0 + sx, staff) || !this.passable((z0 + sz) * W + x0, staff)) return false;
      }
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
    }
  }
}
