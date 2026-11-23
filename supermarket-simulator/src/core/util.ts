// General helpers shared by every system.

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential smoothing factor. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
export const dampTo = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * damp(rate, dt);
export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const dampAngle = (cur: number, target: number, rate: number, dt: number) => cur + wrapAngle(target - cur) * damp(rate, dt);
export const dist2 = (ax: number, az: number, bx: number, bz: number) => {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
};

/** Seeded PRNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed = 1234567) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
}

export const rand = (a = 0, b = 1) => a + (b - a) * Math.random();
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p: number) => Math.random() < p;
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function weightedPick<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return undefined;
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

let _uid = 1;
export const nextUid = () => _uid++;
export const bumpUid = (min: number) => { if (_uid <= min) _uid = min + 1; };
export const peekUid = () => _uid;

export function money(v: number, decimals = 2): string {
  const neg = v < 0;
  const abs = Math.abs(v);
  const fixed = abs.toFixed(decimals);
  const [i, d] = fixed.split('.');
  const withSep = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-$' : '$') + withSep + (d ? '.' + d : '');
}
export function moneyShort(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return (v < 0 ? '-$' : '$') + (abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2) + 'M';
  if (abs >= 1e4) return (v < 0 ? '-$' : '$') + (abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1) + 'K';
  return money(v, abs >= 1000 ? 0 : 2);
}
export const round2 = (v: number) => Math.round(v * 100) / 100;

/** Minutes since midnight -> "09:05 AM". */
export function clockText(minutes: number): string {
  const m = Math.floor(minutes) % (24 * 60);
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const am = h < 12;
  h = h % 12;
  if (h === 0) h = 12;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')} ${am ? 'AM' : 'PM'}`;
}
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, any> | null,
  ...children: (Node | string | number | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export class Emitter<E extends Record<string, any>> {
  private map = new Map<keyof E, Set<(p: any) => void>>();
  on<K extends keyof E>(k: K, fn: (p: E[K]) => void): () => void {
    let s = this.map.get(k);
    if (!s) this.map.set(k, (s = new Set()));
    s.add(fn);
    return () => s!.delete(fn);
  }
  emit<K extends keyof E>(k: K, p: E[K]) {
    const s = this.map.get(k);
    if (s) for (const fn of [...s]) fn(p);
  }
}
