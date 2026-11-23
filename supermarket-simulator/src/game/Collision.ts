// Static axis-aligned collision boxes in a spatial hash; circle-vs-box resolution for walkers.

export interface Collider {
  id: number;
  x0: number; z0: number; x1: number; z1: number;
  y0: number; y1: number;
  tag: string;
  owner?: any;
  /** blocks customers only (e.g. staff-only areas) */
  staffPass?: boolean;
  enabled: boolean;
}

const CELL = 4;

export class Collision {
  private items = new Map<number, Collider>();
  private grid = new Map<number, Set<number>>();
  private nextId = 1;
  version = 0;
  /** Changes only when colliders are added / removed / moved (not when toggled). */
  structVersion = 0;

  private key(cx: number, cz: number) { return (cx + 1000) * 4000 + (cz + 1000); }

  add(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tag: string, owner?: any): Collider {
    const c: Collider = { id: this.nextId++, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1, tag, owner, enabled: true };
    this.items.set(c.id, c);
    this.index(c);
    this.version++;
    this.structVersion++;
    return c;
  }

  private index(c: Collider) {
    for (let cx = Math.floor(c.x0 / CELL); cx <= Math.floor(c.x1 / CELL); cx++)
      for (let cz = Math.floor(c.z0 / CELL); cz <= Math.floor(c.z1 / CELL); cz++) {
        const k = this.key(cx, cz);
        let s = this.grid.get(k);
        if (!s) this.grid.set(k, (s = new Set()));
        s.add(c.id);
      }
  }
  private unindex(c: Collider) {
    for (let cx = Math.floor(c.x0 / CELL); cx <= Math.floor(c.x1 / CELL); cx++)
      for (let cz = Math.floor(c.z0 / CELL); cz <= Math.floor(c.z1 / CELL); cz++) this.grid.get(this.key(cx, cz))?.delete(c.id);
  }

  remove(c: Collider | null | undefined) {
    if (!c) return;
    if (!this.items.has(c.id)) return;
    this.unindex(c);
    this.items.delete(c.id);
    this.version++;
    this.structVersion++;
  }

  removeTag(tag: string) {
    for (const c of [...this.items.values()]) if (c.tag === tag) this.remove(c);
  }

  move(c: Collider, x0: number, z0: number, x1: number, z1: number) {
    this.unindex(c);
    c.x0 = Math.min(x0, x1); c.z0 = Math.min(z0, z1); c.x1 = Math.max(x0, x1); c.z1 = Math.max(z0, z1);
    this.index(c);
    this.version++;
    this.structVersion++;
  }

  setEnabled(c: Collider, on: boolean) {
    if (c.enabled !== on) {
      c.enabled = on;
      this.version++;
    }
  }

  all(): IterableIterator<Collider> { return this.items.values(); }

  query(x0: number, z0: number, x1: number, z1: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    const seen = new Set<number>();
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const s = this.grid.get(this.key(cx, cz));
        if (!s) continue;
        for (const id of s) {
          if (seen.has(id)) continue;
          seen.add(id);
          const c = this.items.get(id)!;
          if (!c.enabled) continue;
          if (c.x1 < x0 || c.x0 > x1 || c.z1 < z0 || c.z0 > z1) continue;
          out.push(c);
        }
      }
    return out;
  }

  private tmp: Collider[] = [];
  /** Push a circle (x,z,r) out of boxes overlapping the vertical span y0..y1. Returns corrected position. */
  resolveCircle(x: number, z: number, r: number, y0: number, y1: number, ignore?: (c: Collider) => boolean): [number, number] {
    for (let iter = 0; iter < 3; iter++) {
      const list = this.query(x - r, z - r, x + r, z + r, this.tmp);
      let moved = false;
      for (const c of list) {
        if (c.y1 <= y0 || c.y0 >= y1) continue;
        if (ignore && ignore(c)) continue;
        const nx = Math.max(c.x0, Math.min(x, c.x1));
        const nz = Math.max(c.z0, Math.min(z, c.z1));
        let dx = x - nx, dz = z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-8) {
          // center inside the box: push out along the smallest axis
          const pl = x - c.x0, pr = c.x1 - x, pb = z - c.z0, pf = c.z1 - z;
          const m = Math.min(pl, pr, pb, pf);
          if (m === pl) x = c.x0 - r;
          else if (m === pr) x = c.x1 + r;
          else if (m === pb) z = c.z0 - r;
          else z = c.z1 + r;
        } else {
          const d = Math.sqrt(d2);
          dx /= d; dz /= d;
          x = nx + dx * r;
          z = nz + dz * r;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return [x, z];
  }

  /** Is the circle free of any blocking collider? */
  freeCircle(x: number, z: number, r: number, y0 = 0.05, y1 = 1.8, ignore?: (c: Collider) => boolean): boolean {
    const list = this.query(x - r, z - r, x + r, z + r, this.tmp);
    for (const c of list) {
      if (c.y1 <= y0 || c.y0 >= y1) continue;
      if (ignore && ignore(c)) continue;
      const nx = Math.max(c.x0, Math.min(x, c.x1));
      const nz = Math.max(c.z0, Math.min(z, c.z1));
      if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) return false;
    }
    return true;
  }

  /** Box overlap test (for furniture placement). */
  boxFree(x0: number, z0: number, x1: number, z1: number, ignore?: (c: Collider) => boolean): boolean {
    const list = this.query(x0, z0, x1, z1, this.tmp);
    for (const c of list) {
      if (ignore && ignore(c)) continue;
      if (c.x1 <= x0 || c.x0 >= x1 || c.z1 <= z0 || c.z0 >= z1) continue;
      return false;
    }
    return true;
  }

  /** 2D segment test against boxes (line of sight on the floor plane). */
  segmentBlocked(ax: number, az: number, bx: number, bz: number, y = 1.0, ignore?: (c: Collider) => boolean): boolean {
    const list = this.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), this.tmp);
    const dx = bx - ax, dz = bz - az;
    for (const c of list) {
      if (c.y1 <= y || c.y0 >= y) continue;
      if (ignore && ignore(c)) continue;
      let t0 = 0, t1 = 1;
      const clip = (p: number, q: number) => {
        if (p === 0) return q >= 0;
        const t = q / p;
        if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
        else { if (t < t0) return false; if (t < t1) t1 = t; }
        return true;
      };
      if (clip(-dx, ax - c.x0) && clip(dx, c.x1 - ax) && clip(-dz, az - c.z0) && clip(dz, c.z1 - az) && t0 <= t1) return true;
    }
    return false;
  }
}
