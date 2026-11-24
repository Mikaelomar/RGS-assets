// Cleanliness: floor dirt map (rendered as a shader overlay), spills (puddles), litter, restrooms, fridge glass.
import * as THREE from 'three';
import type { Game } from './Game';
import { FLOOR_Y } from './layout';
import { clamp, nextUid, rand } from '../core/util';
import { audio } from '../core/Audio';
import * as T from '../gfx/Textures';

const GX0 = -16, GZ0 = -32, GW = 80, GH = 32; // 1 m cells covering BOH + sales floor

const dirtVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const dirtFrag = /* glsl */ `
uniform sampler2D uDirt;
uniform sampler2D uNoise;
uniform float uLight;
varying vec2 vUv;
varying vec3 vW;
void main() {
  float d = texture2D(uDirt, vUv).r;
  float n = texture2D(uNoise, vW.xz * 0.35).r;
  float n2 = texture2D(uNoise, vW.xz * 1.3 + 0.37).r;
  float a = smoothstep(0.05, 1.0, d) * (0.35 + 0.65 * n) * (0.7 + 0.5 * n2);
  vec3 col = mix(vec3(0.28, 0.22, 0.15), vec3(0.42, 0.36, 0.28), n2) * uLight;
  gl_FragColor = vec4(col, clamp(a * 0.85, 0.0, 0.8));
}`;

export class CleaningSystem {
  private tex: THREE.DataTexture;
  private data = new Uint8Array(GW * GH * 4);
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private dirty = true;
  private accT = 0;
  private spillMeshes = new Map<number, THREE.Mesh>();
  private spillMats: Record<string, THREE.MeshBasicMaterial> = {};

  constructor(private g: Game) {
    this.tex = new THREE.DataTexture(this.data, GW, GH, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    const noise = T.concrete({ color: '#808080', size: 256, stains: true });
    noise.colorSpace = THREE.NoColorSpace;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: dirtVert,
      fragmentShader: dirtFrag,
      uniforms: { uDirt: { value: this.tex }, uNoise: { value: noise }, uLight: { value: 1 } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const geo = new THREE.PlaneGeometry(GW, GH);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.set(GX0 + GW / 2, FLOOR_Y + 0.003, GZ0 + GH / 2);
    // UV: u along +x, v along -z after rotation; flip to match row index (z0 at row 0)
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.mesh.renderOrder = 1;
    g.scene.add(this.mesh);
    const mk = (color: string, opacity: number) => {
      const [c, ctx] = T.makeCanvas(128, 128);
      const gr = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
      gr.addColorStop(0, color);
      gr.addColorStop(0.75, color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const r = 50 + Math.sin(k * 2.7) * 9 + Math.cos(k * 1.3) * 6;
        ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
      ctx.fill();
      return new THREE.MeshBasicMaterial({ map: T.toTexture(c, { repeat: false }), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    };
    this.spillMats = {
      water: mk('rgba(150,200,235,0.85)', 0.75),
      leak: mk('rgba(120,180,230,0.9)', 0.8),
      milk: mk('rgba(250,250,245,0.95)', 0.9),
      juice: mk('rgba(255,150,40,0.9)', 0.85),
    };
  }

  load() {
    const s = this.g.state;
    if (!s.dirt || s.dirt.length !== GW * GH) s.dirt = new Array(GW * GH).fill(0);
    for (const m of this.spillMeshes.values()) m.removeFromParent();
    this.spillMeshes.clear();
    for (const sp of s.spills) this.makeSpillMesh(sp);
    this.dirty = true;
  }

  private cell(x: number, z: number) {
    const cx = Math.floor(x - GX0), cz = Math.floor(z - GZ0);
    if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return -1;
    return cz * GW + cx;
  }

  dirtAt(x: number, z: number) {
    const i = this.cell(x, z);
    return i < 0 ? 0 : this.g.state.dirt[i] ?? 0;
  }

  addDirt(x: number, z: number, v: number) {
    const i = this.cell(x, z);
    if (i < 0) return;
    if (!this.g.building.isIndoors(x, z)) return;
    const d = this.g.state.dirt;
    d[i] = clamp((d[i] ?? 0) + v, 0, 1);
    this.dirty = true;
  }

  /** Reduce dirt around a point; returns amount cleaned. */
  mopAt(x: number, z: number, dt: number) {
    const d = this.g.state.dirt;
    let cleaned = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const i = this.cell(x + dx * 0.8, z + dz * 0.8);
      if (i < 0) continue;
      const w = dx === 0 && dz === 0 ? 1 : 0.55;
      const before = d[i] ?? 0;
      d[i] = Math.max(0, before - dt * 0.9 * w);
      cleaned += before - d[i];
    }
    if (cleaned > 0) this.dirty = true;
    return cleaned;
  }

  dirtiestSpot(): { x: number; z: number; dirt: number } | null {
    const d = this.g.state.dirt;
    let best = -1, bv = 0;
    for (let i = 0; i < d.length; i++) if ((d[i] ?? 0) > bv) { bv = d[i]; best = i; }
    if (best < 0) return null;
    return { x: GX0 + (best % GW) + 0.5, z: GZ0 + Math.floor(best / GW) + 0.5, dirt: bv };
  }

  // ------------------------------------------------------------------ spills / litter
  addSpill(x: number, z: number, kind: 'water' | 'milk' | 'juice' | 'leak', size = rand(0.45, 0.8)) {
    const s = this.g.state;
    if (!this.g.building.isIndoors(x, z)) return;
    if (s.spills.length > 12) return;
    const sp = { uid: nextUid(), x, z, size, kind };
    s.spills.push(sp);
    this.makeSpillMesh(sp);
    audio.play('drop', new THREE.Vector3(x, 0, z), 0.4);
  }

  private makeSpillMesh(sp: { uid: number; x: number; z: number; size: number; kind: string }) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sp.size * 2, sp.size * 2), this.spillMats[sp.kind] ?? this.spillMats.water);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI;
    m.position.set(sp.x, FLOOR_Y + 0.006, sp.z);
    m.renderOrder = 2;
    this.g.scene.add(m);
    this.spillMeshes.set(sp.uid, m);
  }

  spillAt(x: number, z: number) {
    for (const sp of this.g.state.spills) if (Math.hypot(sp.x - x, sp.z - z) < sp.size + 0.2) return sp;
    return null;
  }

  removeSpill(uid: number) {
    const s = this.g.state;
    s.spills = s.spills.filter((x) => x.uid !== uid);
    const m = this.spillMeshes.get(uid);
    if (m) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.spillMeshes.delete(uid);
    this.g.events.resolve('leak', uid);
  }

  addLitter(x: number, z: number) {
    const g = this.g;
    if (!g.building.isSales(x, z)) return;
    let n = 0;
    for (const b of g.boxes.items.values()) if (b.s.kind === 'litter') n++;
    if (n > 10) return;
    g.addBoxState({ uid: nextUid(), pid: 'apple', count: 0, exp: 0, x, y: FLOOR_Y, z, ry: Math.random() * 6, kind: 'litter' });
  }

  runScrubber() {
    const g = this.g;
    if (!g.sim.pay(5, 'cleaning')) return;
    const d = g.state.dirt;
    for (let i = 0; i < d.length; i++) d[i] = (d[i] ?? 0) * 0.15;
    this.dirty = true;
    audio.play('scrubber');
    g.ui.toast('The floor scrubber cleaned the whole floor!', 'good', '🧽');
    g.actions.gainXP(5);
  }

  /** 0 (filthy) .. 1 (spotless) for the customer-facing areas. */
  cleanliness(): number {
    const g = this.g;
    const d = g.state.dirt;
    let sum = 0, n = 0;
    for (const k of g.state.plots) {
      const [c, r] = k.split(',').map(Number);
      for (let z = 0; z < 8; z += 2) for (let x = 0; x < 8; x += 2) {
        const i = this.cell(c * 8 + x + 0.5, -r * 8 - z - 0.5);
        if (i >= 0) { sum += d[i] ?? 0; n++; }
      }
    }
    const avg = n ? sum / n : 0;
    let litter = 0;
    for (const b of g.boxes.items.values()) if (b.s.kind === 'litter' || ((b.s.kind ?? 'box') === 'box' && b.s.count <= 0 && g.building.isSales(b.pos.x, b.pos.z))) litter++;
    let fullBins = 0;
    for (const f of g.furniture.items.values()) if (f.def.interact === 'trash' && (f.s.fill ?? 0) >= 10) fullBins++;
    const v = 1 - avg * 1.5 - g.state.spills.length * 0.05 - litter * 0.025 - fullBins * 0.06 - g.state.wcDirt.cust * 0.12;
    return clamp(v, 0, 1);
  }

  update(dt: number) {
    const g = this.g;
    this.accT += dt;
    if (this.accT >= 0.5) {
      const k = this.accT;
      this.accT = 0;
      const rate = g.sim.clockRate();
      if (rate > 0) {
        const rain = g.state.weather === 'rain' || g.state.weather === 'snow' ? 2.2 : 1;
        for (const c of g.customers.list) {
          if (c.agent.speed > 0.2 && c.shopper) this.addDirt(c.pos.x, c.pos.z, 0.0016 * k * rate * rain * (c.pos.z > -3 ? 1.8 : 1));
        }
        for (const a of g.staff.agents()) if (a.speed > 0.2) this.addDirt(a.pos.x, a.pos.z, 0.0006 * k * rate);
        // fridge glass and restrooms get dirtier over time while open
        if (g.state.open) {
          for (const f of g.furniture.items.values()) if (f.def.coolTarget !== undefined && f.def.cat === 'cold') f.s.dirt = Math.min(1, (f.s.dirt ?? 0) + 0.00035 * k * rate);
          if (g.building.hasRoom('custwc')) g.state.wcDirt.cust = Math.min(1, g.state.wcDirt.cust + 0.0002 * k * rate);
        }
      }
    }
    if (this.dirty) {
      this.dirty = false;
      const d = g.state.dirt;
      for (let i = 0; i < GW * GH; i++) {
        const v = Math.round(clamp(d[i] ?? 0, 0, 1) * 255);
        this.data[i * 4] = v;
        this.data[i * 4 + 1] = v;
        this.data[i * 4 + 2] = v;
        this.data[i * 4 + 3] = 255;
      }
      this.tex.needsUpdate = true;
    }
    this.mat.uniforms.uLight.value = g.power.outage ? 0.3 : 1;
  }

  /** Compact dirt for saving. */
  serialize() {
    const d = this.g.state.dirt;
    for (let i = 0; i < d.length; i++) d[i] = Math.round((d[i] ?? 0) * 100) / 100;
  }
}
