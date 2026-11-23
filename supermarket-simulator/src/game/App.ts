// App bootstrap: loading screen, title screen with a live 3D store in the background, new / load game.
import * as THREE from 'three';
import { Game } from './Game';
import { createNewGame } from './newgame';
import { buildProductArt } from '../gfx/ProductArt';
import { renderAllIcons } from '../gfx/Icons';
import { detectQuality, type Quality } from '../core/Engine';
import { Menus } from '../ui/Menus';
import { loadSettings, readSave, type Settings, type SlotId } from './Save';
import { audio } from '../core/Audio';
import { nativeSetup, setVibration, requestFullscreen, isNative } from '../core/Platform';
import type { GameState } from './state';
import { FURN_MAP } from '../data/furniture';
import { PRODUCTS, CATEGORIES } from '../data/products';
import { EXPANSIONS } from './layout';

const progress = (f: number, tip?: string) => {
  const el = document.getElementById('boot-fill');
  if (el) el.style.width = `${Math.round(f * 100)}%`;
  if (tip) {
    const t = document.getElementById('boot-tip');
    if (t) t.textContent = tip;
  }
};
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

/** A busy, good-looking store for the title screen background. */
function createDemoState(): GameState {
  const s = createNewGame('SuperMart');
  s.level = 60;
  s.tutorialDone = true;
  s.tutorial = 99;
  s.open = true;
  s.phase = 'open';
  s.minutes = 19.9 * 60;
  s.reputation = 4.6;
  s.licenses = CATEGORIES.map((c) => c.id);
  s.rooms = ['storage', 'office', 'corridor', 'breakroom', 'lockers', 'staffwc', 'electrical', 'trashroom'];
  for (let i = 0; i < 5; i++) for (const [c, r] of EXPANSIONS[i].plots) s.plots.push(`${c},${r}`);
  s.boxes = [];
  let uid = 5000;
  const add = (id: string, x: number, z: number, ry: number) => {
    const def = FURN_MAP.get(id)!;
    const f: any = { uid: uid++, id, x, z, ry, cond: 100, broken: false };
    if (def.slots) f.slots = def.slots.map(() => ({ pid: null, count: 0, batches: [] }));
    if (def.coolTarget !== undefined) f.temp = def.coolTarget;
    s.furniture.push(f);
    return f;
  };
  // drop the starter shelves (we rebuild a nicer layout)
  s.furniture = s.furniture.filter((f) => !['shelf_small', 'fruit_rack'].includes(f.id));
  for (let i = 0; i < 4; i++) add('gondola', 5 + i * 4.2, -11, 0);
  for (let i = 0; i < 4; i++) add('gondola', 5 + i * 4.2, -15.5, 0);
  add('produce_table', 26, -4.5, 0);
  add('produce_table', 26, -9, 0);
  add('fruit_rack', 2.2, -7.2, Math.PI / 2);
  for (let i = 0; i < 5; i++) add('fridge_2', 3 + i * 1.7, -23.55, 0);
  add('freezer_chest', 21, -13, 0);
  add('freezer_chest', 21, -16, 0);
  add('bread_rack', 14, -4.4, 0);
  add('shelf_wall', 31.7, -14, -Math.PI / 2);
  add('shelf_wall', 31.7, -18, -Math.PI / 2);
  add('promo_stand', 18, -2.5, 0);
  add('plant_decor', 16.8, -0.9, 0);
  add('checkout', 5.5, -2.6, -Math.PI / 2);
  add('cart_corral', 20.5, -1.0, Math.PI / 2);
  // stock everything
  const pick = (kind: string, i: number) => {
    const list = PRODUCTS.filter((p) => p.display.includes(kind as any) && p.level <= 60);
    return list[i % list.length];
  };
  let k = 0;
  for (const f of s.furniture) {
    const def = FURN_MAP.get(f.id)!;
    if (!def.slots) continue;
    def.slots.forEach((sd, i) => {
      const p = pick(sd.kind, k++);
      if (!p) return;
      f.slots![i] = { pid: p.id, count: 40, batches: [{ n: 40, exp: 0 }] };
    });
  }
  s.employees = [
    { uid: 9001, name: 'Aino Laine', role: 'cashier', skill: 3, wage: 14, shiftStart: 6, shiftEnd: 24, energy: 100, morale: 90, look: 11, female: true, daysWorked: 50 },
    { uid: 9002, name: 'Omar Khan', role: 'stocker', skill: 3, wage: 14, shiftStart: 6, shiftEnd: 24, energy: 100, morale: 90, look: 22, female: false, daysWorked: 50 },
  ];
  s.nextUid = 10000;
  return s;
}

export async function startApp(canvas: HTMLCanvasElement) {
  const uiRoot = document.getElementById('ui-root')!;
  progress(0.1, 'Painting product labels…');
  await nextFrame();
  buildProductArt();
  progress(0.3, 'Building the town…');
  await nextFrame();
  const settings = await loadSettings();
  const quality: Quality = settings.quality === 'auto' ? detectQuality() : settings.quality;
  const game = new Game(canvas, uiRoot, quality);
  (window as any).game = game;
  progress(0.5, 'Photographing products…');
  await nextFrame();
  renderAllIcons(game.engine.renderer);
  progress(0.8, 'Opening the store…');
  await nextFrame();

  let demo = true;
  let orbitT = 0;
  const applySettings = (st: Settings) => {
    const q: Quality = st.quality === 'auto' ? detectQuality() : st.quality;
    if (q !== game.engine.quality) {
      game.engine.setQuality(q);
      game.daylight.setShadowSize(game.engine.profile.shadowSize);
      game.stock.receiveShadow = q === 'high';
      game.stock.forceAll();
    }
    game.input.sensitivity = st.sensitivity;
    game.input.invertY = st.invertY;
    audio.setVolumes(st.sfx, st.music);
    setVibration(st.vibration);
    game.showFps = st.showFps;
    game.engine.camera.fov = st.fov;
    game.engine.camera.updateProjectionMatrix();
  };
  applySettings(settings);

  const enterTitle = async () => {
    demo = true;
    game.demo = true;
    game.ui.closeAll();
    if (game.mode === 'checkout') game.checkout.leave();
    game.load(createDemoState());
    game.mode = 'menu';
    game.player.locked = true;
    game.ui.hud.setVisible(false);
    // a lively store right away
    for (let i = 0; i < 6; i++) {
      const c = game.customers.spawn(true);
      c.agent.pos.set(2 + i * 3.5, 0, -2 - (i % 3) * 3);
      c.setState('enter');
      c.agent.goTo(c.agent.pos.x + 0.5, c.agent.pos.z - 1, game.nav);
    }
    for (let i = 0; i < 4; i++) game.customers.spawn(false).agent.pos.x = -10 + i * 12;
    await menus.showTitle();
  };

  const play = (state: GameState) => {
    demo = false;
    game.demo = false;
    menus.hideTitle();
    game.ui.closeAll();
    game.load(state);
    game.mode = 'walk';
    game.player.locked = false;
    game.ui.hud.setVisible(true);
    audio.unlock();
    audio.startMusic();
    if (!isNative && game.input.isTouch) requestFullscreen();
    game.ads.init();
    game.save('auto', true);
  };

  const menus = new Menus(game, settings, {
    newGame: (name, tutorial) => {
      const s = createNewGame(name);
      if (!tutorial) {
        s.tutorialDone = true;
        s.tutorial = 99;
      }
      play(s);
    },
    load: async (slot: SlotId) => {
      const s = await readSave(slot);
      if (!s) {
        game.ui.toast('Could not load this save', 'bad');
        return;
      }
      play(s);
    },
    applySettings,
    quitToTitle: () => enterTitle(),
  });
  game.onPauseMenu = () => { if (!demo) menus.pauseMenu(); };
  game.onExitToMenu = () => enterTitle();

  // title camera: slow cinematic pan along the street
  game.onFrameHook = (dt: number) => {
    if (!demo) return;
    orbitT += dt;
    const cam = game.engine.camera;
    const x = 16 + Math.sin(orbitT * 0.06) * 13;
    cam.position.set(x, 3.1 + Math.sin(orbitT * 0.11) * 0.4, 13.5);
    cam.lookAt(x * 0.8 + 3, 1.7, -5);
    game.player.pos.set(x, 0, 13.5);
  };

  await nativeSetup(
    () => { if (!demo) game.save('auto', true); audio.suspend(); game.setPaused(true, 'background'); },
    () => { audio.resume(); game.setPaused(false, 'background'); },
    () => {
      if (game.ui.modalOpen) game.ui.closeAll();
      else if (game.mode === 'checkout') game.checkout.leave();
      else if (!demo) menus.pauseMenu();
    },
  );

  await enterTitle();
  progress(1, 'Ready!');
  game.start();
  await nextFrame();
  document.getElementById('boot-screen')?.classList.add('hide');
  setTimeout(() => document.getElementById('boot-screen')?.remove(), 800);
  // unlock audio on first interaction
  const unlock = () => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  void THREE;
}
