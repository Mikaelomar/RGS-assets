// Rain streaks around the camera (only drawn while outdoors).
import * as THREE from 'three';

const N = 1400;
const SIZE = 24;

export class Rain {
  readonly mesh: THREE.LineSegments;
  private pos: Float32Array;
  private speed: Float32Array;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(N * 6);
    this.speed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.reset(i, Math.random() * 14);
      this.speed[i] = 11 + Math.random() * 5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xaec6d8, transparent: true, opacity: 0.45, depthWrite: false });
    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  private reset(i: number, y = 14) {
    const x = (Math.random() - 0.5) * SIZE, z = (Math.random() - 0.5) * SIZE;
    const p = this.pos;
    p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.02; p[i * 6 + 4] = y - 0.45; p[i * 6 + 5] = z;
  }

  update(dt: number, center: THREE.Vector3, intensity: number, indoors: boolean) {
    this.mesh.visible = intensity > 0.05 && !indoors;
    if (!this.mesh.visible) return;
    (this.mesh.material as THREE.LineBasicMaterial).opacity = 0.45 * intensity;
    this.mesh.position.set(center.x, 0, center.z);
    const p = this.pos;
    for (let i = 0; i < N; i++) {
      const d = this.speed[i] * dt;
      p[i * 6 + 1] -= d;
      p[i * 6 + 4] -= d;
      if (p[i * 6 + 4] < 0) this.reset(i);
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
