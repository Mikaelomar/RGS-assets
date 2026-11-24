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
  /** Automatic performance tuning (graphics quality "Auto"). */
  adaptive = false;
  /** Multiplier on the profile pixel ratio chosen by the adaptive controller. */
  renderScale = 1;
  /** Quality the adaptive controller fell back to (null = not dropped). */
  autoDropped: Quality | null = null;
  onQualityDrop: ((q: Quality) => void) | null = null;
  private perfT = 0;
  private perfFrames = 0;
  private perfWorst = 0;
  private perfWarmup = 6;
  private slowStreak = 0;
  private fastStreak = 0;

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

  /** Measures real frame times and trades resolution (then shadows) for a smooth frame rate. */
  tickPerf(dt: number) {
    if (!this.adaptive || document.hidden) return;
    if (this.perfWarmup > 0) {
      this.perfWarmup -= dt;
      return;
    }
    this.perfT += dt;
    this.perfFrames++;
    this.perfWorst = Math.max(this.perfWorst, dt);
    if (this.perfT < 2) return;
    const fps = this.perfFrames / this.perfT;
    const hitch = this.perfWorst > 0.35 && fps > 12; // one-off spike (loading / shader compile) on an otherwise fast device
    this.perfT = 0;
    this.perfFrames = 0;
    this.perfWorst = 0;
    if (hitch) return;
    if (fps < 40) {
      this.fastStreak = 0;
      if (this.renderScale > this.minScale() + 0.02) this.setRenderScale(this.renderScale * 0.86);
      else if (++this.slowStreak >= 3 && this.quality !== 'low') {
        this.slowStreak = 0;
        const q: Quality = this.quality === 'high' ? 'medium' : 'low';
        this.autoDropped = q;
        this.setQuality(q);
        this.setRenderScale(0.86);
        this.onQualityDrop?.(q);
      }
    } else if (fps > 56) {
      this.slowStreak = 0;
      if (this.renderScale < 1 && ++this.fastStreak >= 2) {
        this.fastStreak = 0;
        this.setRenderScale(this.renderScale * 1.1);
      }
    } else {
      this.slowStreak = 0;
      this.fastStreak = 0;
    }
  }

  /** Never go below ~0.6 device pixels per CSS pixel: too blurry to read labels. */
  private minScale() {
    return Math.min(1, Math.max(0.55, 0.6 / this.profile.pixelRatio));
  }

  setRenderScale(s: number) {
    this.renderScale = Math.max(this.minScale(), Math.min(1, s));
    this.renderer.setPixelRatio(this.profile.pixelRatio * this.renderScale);
    this.renderer.setSize(this.width, this.height, false);
  }

  private applyQuality() {
    this.renderer.setPixelRatio(this.profile.pixelRatio * this.renderScale);
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
