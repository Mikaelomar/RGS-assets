// forklift: buy, enter, lift a loaded pallet, drive it into the warehouse, lower, exit
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 500 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/?fixedres&season=none', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('input[type=checkbox]'); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `tests/out/${name}.png` }); console.log('shot', name); };
await g(() => { const G = window.game; G.state.money = 50000; G.sim.addXP(6000); });
await page.waitForTimeout(500);
await g(() => window.game.ui.closeAll()); await page.waitForTimeout(200); await g(() => window.game.ui.closeAll());
await g(() => { const G = window.game; G.state.rooms.push('storage'); G.rebuildStore(); G.buyUpgrade('forklift'); });
await page.waitForTimeout(500);
console.log('level', await g(() => window.game.state.level), 'forklift', await g(() => JSON.stringify(window.game.state.forklift)));
// a delivered pallet with 4 boxes at the delivery spot
await g(() => {
  const G = window.game;
  G.addBoxState({ uid: 91000, pid: 'apple', count: 0, exp: 0, x: -4.6, y: 0.02, z: 2.6, ry: 0, kind: 'pallet' });
  let k = 0;
  for (const [dx, dz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) G.addBoxState({ uid: 91001 + k++, pid: 'cereal', count: 12, exp: 0, x: -4.6 + dx, y: 0.4, z: 2.6 + dz, ry: 0, kind: 'box' });
  G.player.pos.set(-8.5, 0, 6.2); G.player.yaw = 0.9; G.player.pitch = -0.2;
});
await page.waitForTimeout(2500);
await shot('fk_1_parked');
// walk next to it, look at it and tap to drive
await g(() => { const G = window.game; G.player.pos.set(-10.4, 0, 4.6); G.player.yaw = 0; G.player.pitch = -0.35; });
await page.waitForTimeout(600);
console.log('prompt target', await g(() => window.game.actions.target?.t));
await g(() => { const G = window.game; if (G.actions.target?.t === 'vehicle') G.forklift.enter(); });
await page.waitForTimeout(500);
console.log('driving', await g(() => window.game.forklift.driving));
// line up exactly: forks under the pallet, facing the roll-up door (-z)
await g(() => { const G = window.game; const s = G.state.forklift; s.x = -4.6; s.z = 2.6 + 1.85; s.ry = 0; G.player.yaw = 0; });
await page.waitForTimeout(600);
await shot('fk_2_approach');
await g(() => window.game.forklift.toggleForks());
await page.waitForTimeout(1200);
console.log('carrying', await g(() => window.game.forklift.carrying));
// drive through the roll-up door into the warehouse
await page.keyboard.down('KeyW');
for (let i = 0; i < 30; i++) { await page.waitForTimeout(200); if (await g(() => window.game.state.forklift.z < -1.5)) break; }
await page.keyboard.up('KeyW');
await page.waitForTimeout(900);
await shot('fk_3_carrying');
console.log('forklift now', await g(() => JSON.stringify(window.game.state.forklift)), 'pallet', await g(() => { const p = window.game.boxes.items.get(91000).pos; return p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2); }));
// try to get onto the sales floor (should be blocked) by teleporting near it and driving
await g(() => { const G = window.game; G.state.forklift.x = 3.5; G.state.forklift.z = 3.0; G.state.forklift.ry = 0; });
await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
console.log('after trying sales floor', await g(() => JSON.stringify(window.game.state.forklift)), 'area', await g(() => window.game.building.areaAt(window.game.state.forklift.x, window.game.state.forklift.z)));
await g(() => window.game.forklift.toggleForks());
await page.waitForTimeout(1500);
console.log('after lower: carrying', await g(() => window.game.forklift.carrying), 'riders on pallet', await g(() => window.game.boxes.ridersOf(window.game.boxes.items.get(91000)).length));
await g(() => window.game.forklift.exit());
await page.waitForTimeout(800);
console.log('exited', await g(() => !window.game.forklift.driving), 'player', await g(() => { const p = window.game.player.pos; return p.x.toFixed(2) + ',' + p.z.toFixed(2); }));
await g(() => { const G = window.game; const s = G.state.forklift; G.player.pos.set(s.x + 3.2, 0, s.z + 2.2); G.player.yaw = Math.atan2(3.2, 2.2); G.player.pitch = -0.15; });
await page.waitForTimeout(1000);
await shot('fk_4_parked_again');
// save / load keeps the forklift
await g(() => window.game.save('slot3'));
await page.waitForTimeout(300);
await g(async () => { const { readSave } = await import('/src/game/Save.ts'); const s = await readSave('slot3'); window.game.load(s); });
await page.waitForTimeout(500);
console.log('after load', await g(() => JSON.stringify(window.game.state.forklift)), 'visible', await g(() => window.game.forklift.root.visible));
console.log(logs.slice(0, 20).join('\n') || 'no errors');
await browser.close();
