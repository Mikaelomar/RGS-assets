// Falling snow around the camera. Flakes only spawn outdoors, so they stay visible
// through the shop windows but never fall inside the building.
import * as THREE from 'three';

const N = 1500;
const SIZE = 34;
const TOP = 14;

function flakeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Snow {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private speed: Float32Array;
  private phase: Float32Array;
  private t = 0;
  private frame = 0;

  constructor(scene: THREE.Scene, private isOutdoor: (x: number, z: number) => boolean) {
    this.pos = new Float32Array(N * 3);
    this.speed = new Float32Array(N);
    this.phase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.speed[i] = 0.7 + Math.random() * 0.8;
      this.phase[i] = Math.random() * Math.PI * 2;
      this.pos[i * 3 + 1] = -100; // spawned on first update
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.11, map: flakeTexture(), transparent: true, depthWrite: false, color: 0xffffff, sizeAttenuation: true, opacity: 0.95 });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  private spawn(i: number, cx: number, cz: number, anyHeight: boolean) {
    for (let k = 0; k < 4; k++) {
      const x = cx + (Math.random() - 0.5) * SIZE;
      const z = cz + (Math.random() - 0.5) * SIZE;
      if (!this.isOutdoor(x, z)) continue;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = anyHeight ? Math.random() * TOP : TOP - Math.random() * 2;
      this.pos[i * 3 + 2] = z;
      return;
    }
    this.pos[i * 3 + 1] = -100; // try again next frame
  }

  update(dt: number, center: THREE.Vector3, intensity: number) {
    this.points.visible = intensity > 0.05;
    if (!this.points.visible) return;
    (this.points.material as THREE.PointsMaterial).opacity = 0.95 * Math.min(1, intensity);
    this.t += dt;
    this.frame++;
    const p = this.pos;
    const half = SIZE / 2;
    const active = Math.floor(N * Math.min(1, intensity));
    for (let i = 0; i < N; i++) {
      const y = p[i * 3 + 1];
      if (i >= active) {
        p[i * 3 + 1] = -100;
        continue;
      }
      if (y < -50) {
        this.spawn(i, center.x, center.z, true);
        continue;
      }
      const ph = this.phase[i];
      p[i * 3] += Math.sin(this.t * 0.9 + ph) * 0.35 * dt + 0.12 * dt;
      p[i * 3 + 2] += Math.cos(this.t * 0.7 + ph * 1.3) * 0.3 * dt;
      p[i * 3 + 1] = y - this.speed[i] * dt;
      if (p[i * 3 + 1] < 0 || Math.abs(p[i * 3] - center.x) > half || Math.abs(p[i * 3 + 2] - center.z) > half) this.spawn(i, center.x, center.z, p[i * 3 + 1] >= 0);
      else if ((i & 1) === (this.frame & 1) && !this.isOutdoor(p[i * 3], p[i * 3 + 2])) this.spawn(i, center.x, center.z, false); // drifted into the building
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
