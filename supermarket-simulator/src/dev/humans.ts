// Dev-only: line-up of procedural humans (open with ?humans).
import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { Human, randomLook, staffLook } from '../gfx/Human';

export function runHumans(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, 'high');
  const scene = engine.scene;
  scene.background = new THREE.Color('#b8c7d3');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.1));
  const dl = new THREE.DirectionalLight(0xffffff, 1.8);
  dl.position.set(3, 6, 5);
  dl.castShadow = true;
  scene.add(dl);
  engine.renderer.shadowMap.enabled = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#d6d2c8' }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const humans: Human[] = [];
  const poses = ['idle', 'walk', 'basket', 'carry', 'reach', 'scan', 'wave', 'sit', 'cart', 'talk', 'mop', 'angry'] as const;
  for (let i = 0; i < 12; i++) {
    const look = i < 9 ? randomLook(i + 3) : staffLook(i, i % 2 === 0, ['#1e88e5', '#43a047', '#263238'][i - 9], (['polo', 'vest', 'security'] as const)[i - 9]);
    const h = new Human(look);
    h.root.position.set((i - 5.5) * 0.75, 0, 0);
    h.root.rotation.y = 0.3;
    const pose = poses[i];
    h.pose = pose === 'walk' ? 'idle' : (pose as any);
    if (pose === 'walk') h.speed = 1.3;
    if (pose === 'basket') h.setProp('basket');
    if (pose === 'carry') h.setProp('box');
    if (pose === 'cart') h.setProp('cart');
    if (pose === 'mop') h.setProp('mop');
    scene.add(h.root);
    humans.push(h);
  }
  const cam = engine.camera;
  const params = new URLSearchParams(location.search);
  const close = params.has('close');
  cam.position.set(close ? -3.2 : 0, close ? 1.55 : 1.5, close ? 1.6 : 6.5);
  cam.lookAt(close ? -3.2 : 0, close ? 1.45 : 0.9, 0);
  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const h of humans) h.update(dt);
    engine.render();
    requestAnimationFrame(loop);
  };
  loop();
}
