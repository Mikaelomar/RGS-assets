// Renders 3D product / furniture thumbnails for the UI (once, cached as data URLs).
import * as THREE from 'three';
import { productGeometry, productMaterial } from './ProductMeshes';
import { PRODUCTS } from '../data/products';
import { FURNITURE } from '../data/furniture';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const cache = new Map<string, string>();

export function productIcon(id: string) { return cache.get('p:' + id) ?? ''; }
export function furnitureIcon(id: string) { return cache.get('f:' + id) ?? ''; }

export function renderAllIcons(renderer: THREE.WebGLRenderer, onProgress?: (f: number) => void) {
  const size = 128;
  const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2);
  dl.position.set(2, 4, 3);
  scene.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const pixels = new Uint8Array(size * size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.setClearColor(0x000000, 0);
  const snap = (obj: THREE.Object3D, key: string, dir: THREE.Vector3) => {
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.05;
    cam.position.copy(sphere.center).addScaledVector(dir.clone().normalize(), dist);
    cam.lookAt(sphere.center);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4;
      img.data.set(pixels.subarray(src, src + size * 4), y * size * 4);
    }
    ctx.putImageData(img, 0, 0);
    cache.set(key, canvas.toDataURL('image/png'));
    scene.remove(obj);
  };
  const total = PRODUCTS.length + FURNITURE.length;
  let n = 0;
  for (const p of PRODUCTS) {
    const m = new THREE.Mesh(productGeometry(p.id), productMaterial());
    snap(m, 'p:' + p.id, new THREE.Vector3(0.45, 0.45, 1));
    onProgress?.(++n / total);
  }
  const mats = {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.2, roughness: 0.05 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  for (const f of FURNITURE) {
    if (f.placement === 'fixed') continue;
    const geo = f.build();
    const g = new THREE.Group();
    for (const part of ['solid', 'metal', 'glass', 'glow'] as const) if (geo[part]) g.add(new THREE.Mesh(geo[part]!, mats[part]));
    snap(g, 'f:' + f.id, new THREE.Vector3(0.7, 0.55, 1));
    onProgress?.(++n / total);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;
  rt.dispose();
  pmrem.dispose();
}
