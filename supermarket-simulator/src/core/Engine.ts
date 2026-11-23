import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type Quality = 'low' | 'medium' | 'high';

export interface QualityProfile {
  pixelRatio: number;
  shadows: boolean;
  shadowSize: number;
  maxCustomers: number;
  drawDistance: number;
  antialias: boolean;
}

export function qualityProfile(q: Quality): QualityProfile {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  switch (q) {
    case 'low':
      return { pixelRatio: Math.min(dpr, 1) * 0.8, shadows: false, shadowSize: 512, maxCustomers: 10, drawDistance: 45, antialias: false };
    case 'medium':
      return { pixelRatio: Math.min(dpr, 1.5), shadows: true, shadowSize: 1024, maxCustomers: 20, drawDistance: 70, antialias: false };
    default:
      return { pixelRatio: Math.min(dpr, 2), shadows: true, shadowSize: 2048, maxCustomers: 32, drawDistance: 110, antialias: true };
  }
}

/** Guess a sensible default quality for the device. */
export function detectQuality(): Quality {
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const mem = (navigator as any).deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (!mobile) return 'high';
  if (mem >= 6 && cores >= 8) return 'high';
  if (mem >= 3 && cores >= 6) return 'medium';
  return 'low';
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** Scene drawn on top (held items, tools) after clearing depth. */
  readonly overlayScene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  quality: Quality;
  profile: QualityProfile;
  width = 1;
  height = 1;
  envMap: THREE.Texture | null = null;
  /** Set while something is drawn in the overlay scene (held box, tool). */
  overlayActive = false;
  private resizeHandlers: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.canvas = canvas;
    this.quality = quality;
    this.profile = qualityProfile(quality);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.profile.antialias,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envMap = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.42;
    this.overlayScene.environment = this.envMap;
    this.overlayScene.environmentIntensity = 0.6;
    const oh = new THREE.HemisphereLight(0xffffff, 0x8a7f70, 1.6);
    this.overlayScene.add(oh);
    const od = new THREE.DirectionalLight(0xffffff, 1.6);
    od.position.set(0.4, 1, 0.6);
    this.overlayScene.add(od);

    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    this.resize();
  }

  onResize(fn: () => void) { this.resizeHandlers.push(fn); }

  setQuality(q: Quality) {
    this.quality = q;
    this.profile = qualityProfile(q);
    this.applyQuality();
    this.resize();
  }

  private applyQuality() {
    this.renderer.setPixelRatio(this.profile.pixelRatio);
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.renderer.shadowMap.needsUpdate = true;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    // Portrait phones need a wider vertical FOV to stay playable.
    this.camera.updateProjectionMatrix();
    for (const fn of this.resizeHandlers) fn();
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.overlayActive) {
      r.clearDepth();
      r.render(this.overlayScene, this.camera);
    }
  }
}
