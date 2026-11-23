// Dev-only: renders every product in a grid to check models and labels (open with ?gallery).
import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { PRODUCTS } from '../data/products';
import { buildProductArt } from '../gfx/ProductArt';
import { productGeometry, productMaterial } from '../gfx/ProductMeshes';

export function runGallery(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, 'high');
  buildProductArt();
  const scene = engine.scene;
  scene.background = new THREE.Color('#cfd8dc');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2);
  dl.position.set(2, 5, 4);
  scene.add(dl);
  const params = new URLSearchParams(location.search);
  const page = parseInt(params.get('page') || '-1');
  const list = page >= 0 ? PRODUCTS.slice(page * 24, page * 24 + 24) : PRODUCTS;
  const cols = page >= 0 ? 8 : 14;
  list.forEach((p, i) => {
    const m = new THREE.Mesh(productGeometry(p.id), productMaterial());
    const x = (i % cols) * 0.4 - (cols * 0.4) / 2;
    const z = Math.floor(i / cols) * 0.5;
    m.position.set(x, 0, z);
    const s = 0.3 / Math.max(...p.dims);
    m.scale.setScalar(Math.min(2.2, s));
    scene.add(m);
  });
  const cam = engine.camera;
  if (page >= 0) {
    cam.position.set(-0.2, 1.1, 2.4);
    cam.lookAt(-0.2, 0, 0.5);
  } else {
    cam.position.set(0, 2.6, 6.2);
    cam.lookAt(0, 0, 2.2);
  }
  const loop = () => {
    engine.render();
    requestAnimationFrame(loop);
  };
  loop();
  (window as any).__ready = true;
}
