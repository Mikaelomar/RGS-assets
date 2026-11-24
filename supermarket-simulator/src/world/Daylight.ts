// Sky dome, sun, ambient light, store key light and the day/night cycle.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/util';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uStars;
uniform float uCloud;
uniform float uTime;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.55, h), 0.7)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.2, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 900.0) * 3.0 + pow(sd, 18.0) * 0.35 + pow(sd, 3.0) * 0.08);
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.25) * 1.6 + vec2(uTime * 0.004, 0.0);
    float n = noise(uv * 2.0) * 0.55 + noise(uv * 4.3) * 0.3 + noise(uv * 9.1) * 0.15;
    float cl = smoothstep(0.52, 0.78, n) * uCloud * smoothstep(0.02, 0.25, h);
    vec3 cloudCol = mix(uHorizon * 1.05, vec3(1.0), 0.6) * (0.55 + 0.45 * (1.0 - uStars));
    col = mix(col, cloudCol, cl * 0.85);
    if (uStars > 0.01) {
      vec3 g = floor(d * 260.0);
      float s = step(0.9975, hash(g));
      float tw = 0.6 + 0.4 * sin(uTime * 3.0 + hash(g + 1.0) * 30.0);
      col += vec3(s * tw * uStars * (1.0 - cl)) * smoothstep(0.05, 0.3, h);
    }
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Daylight {
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight; // angled daylight, no shadows
  readonly key: THREE.DirectionalLight; // store ceiling light, casts shadows, follows the player
  readonly ambient: THREE.AmbientLight;
  readonly sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  readonly fog: THREE.Fog;
  /** 0 = night .. 1 = full day */
  daylight = 1;
  sunDir = new THREE.Vector3(0.3, 0.8, 0.4);
  /** Outdoor materials dimmed at night (color multiplied). */
  private outdoor: { mat: THREE.MeshStandardMaterial; base: THREE.Color }[] = [];
  private nightGlow: { mat: THREE.MeshStandardMaterial; max: number }[] = [];
  private nightOnly: THREE.Object3D[] = [];
  powerOn = true;
  rain = 0;
  /** Snowfall amount (0..1): bright overcast sky. */
  snow = 0;
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7d6a, 1.1);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 1.2);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.key = new THREE.DirectionalLight(0xfffaf0, 1.5);
    this.key.castShadow = true;
    const sc = this.key.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 60;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.03;
    this.key.shadow.radius = 3;
    scene.add(this.key);
    scene.add(this.key.target);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uBottom: { value: new THREE.Color('#3b4a56') },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uStars: { value: 0 },
        uCloud: { value: 0.6 },
        uTime: { value: 0 },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.fog = new THREE.Fog(0xbfd9ee, 70, 330);
    scene.fog = this.fog;
  }

  setShadowSize(size: number) {
    this.key.shadow.mapSize.set(size, size);
    if (this.key.shadow.map) {
      this.key.shadow.map.dispose();
      (this.key.shadow as any).map = null;
    }
  }

  registerOutdoor(mat: THREE.Material | THREE.Material[]) {
    const arr = Array.isArray(mat) ? mat : [mat];
    for (const m of arr) {
      const sm = m as THREE.MeshStandardMaterial;
      if (!sm.color || this.outdoor.some((o) => o.mat === sm)) continue;
      this.outdoor.push({ mat: sm, base: sm.color.clone() });
    }
  }
  registerNightGlow(mat: THREE.MeshStandardMaterial, max = 1) {
    this.nightGlow.push({ mat, max });
  }
  registerNightOnly(obj: THREE.Object3D) { this.nightOnly.push(obj); }

  /** minutes: minutes since midnight; focus: player position. */
  update(minutes: number, focus: THREE.Vector3, dt: number) {
    this.time += dt;
    const hours = minutes / 60;
    // Sun path: rises 05:30 sets 21:00 (Nordic summer feel)
    const t = (hours - 5.5) / (21 - 5.5);
    const elev = Math.sin(clamp(t, -0.25, 1.25) * Math.PI) * 0.95; // -1..1
    const az = lerp(-1.9, 1.9, t);
    this.sunDir.set(Math.sin(az) * Math.cos(elev * 1.2), Math.sin(elev * 1.1), Math.cos(az) * 0.6 + 0.35).normalize();
    const day = smoothstep(-0.12, 0.25, elev);
    const dusk = clamp(1 - Math.abs(elev - 0.05) / 0.28, 0, 1) * smoothstep(-0.2, 0.0, elev);
    this.daylight = day;

    const top = new THREE.Color('#0a1330').lerp(new THREE.Color('#2f7fd6'), day);
    const hor = new THREE.Color('#1a2a48').lerp(new THREE.Color('#b9dcf3'), day);
    hor.lerp(new THREE.Color('#f39a5b'), dusk * 0.75);
    top.lerp(new THREE.Color('#5a4f8e'), dusk * 0.35);
    const rainDark = this.rain * 0.45;
    top.lerp(new THREE.Color('#6b7680'), rainDark);
    hor.lerp(new THREE.Color('#8a949c'), rainDark);
    const snowSky = this.snow * 0.5 * day;
    top.lerp(new THREE.Color('#a9b4be'), snowSky);
    hor.lerp(new THREE.Color('#dfe6ec'), snowSky);
    const sunCol = new THREE.Color('#fff3d6').lerp(new THREE.Color('#ff9a4a'), dusk);
    const u = this.skyMat.uniforms;
    (u.uTop.value as THREE.Color).copy(top);
    (u.uHorizon.value as THREE.Color).copy(hor);
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    (u.uSunColor.value as THREE.Color).copy(sunCol).multiplyScalar(day > 0.02 ? 1 : 0);
    u.uStars.value = 1 - smoothstep(-0.15, 0.05, elev);
    u.uCloud.value = Math.min(1, 0.55 + this.rain * 0.45 + this.snow * 0.4);
    u.uTime.value = this.time;
    this.sky.position.copy(focus);

    this.fog.color.copy(hor).multiplyScalar(0.92);
    this.fog.near = lerp(30, 70, day) * (1 - this.rain * 0.4) * (1 - this.snow * 0.35);
    this.fog.far = lerp(170, 330, day) * (1 - this.rain * 0.35) * (1 - this.snow * 0.3);

    this.hemi.color.copy(new THREE.Color('#2b3b66').lerp(new THREE.Color('#d6ebff'), day));
    this.hemi.groundColor.copy(new THREE.Color('#2a2622').lerp(new THREE.Color('#8f8272'), day));
    this.hemi.intensity = lerp(0.45, 0.8, day) * (1 - this.rain * 0.25);
    this.sun.color.copy(sunCol);
    this.sun.intensity = Math.max(0, day * 0.95 * (1 - this.rain * 0.6) * (1 - this.snow * 0.45));
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 50);
    this.sun.target.position.copy(focus);

    // Store key light: steady artificial light (off during a power outage)
    const keyTarget = this.powerOn ? 1.15 : 0.1;
    this.key.intensity = lerp(this.key.intensity, keyTarget, 1 - Math.exp(-dt * 6));
    this.ambient.intensity = this.powerOn ? 0.18 : 0.05;
    const kd = new THREE.Vector3(0.38, 1, 0.26).normalize();
    this.key.position.copy(focus).addScaledVector(kd, 30);
    this.key.target.position.copy(focus);
    // snap shadow camera to texel grid to avoid shimmering
    const texel = (48 / this.key.shadow.mapSize.x);
    this.key.target.position.x = Math.round(this.key.target.position.x / texel) * texel;
    this.key.target.position.z = Math.round(this.key.target.position.z / texel) * texel;
    this.key.position.set(this.key.target.position.x + kd.x * 30, this.key.target.position.y + kd.y * 30, this.key.target.position.z + kd.z * 30);

    const od = lerp(0.2, 1, day) * (1 - this.rain * 0.2);
    for (const o of this.outdoor) o.mat.color.copy(o.base).multiplyScalar(od);
    const night = 1 - day;
    for (const g of this.nightGlow) g.mat.emissiveIntensity = g.max * smoothstep(0.35, 0.8, night);
    for (const o of this.nightOnly) o.visible = night > 0.5;
  }
}
