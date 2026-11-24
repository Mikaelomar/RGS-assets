import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 480 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/?fixedres', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('input[type=checkbox]'); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
await g(() => { const G = window.game; G.state.money = 9000; G.state.level = 12; G.state.upgrades.push('palletjack'); G.orders.place([{ pid: 'chips', qty: 3 }, { pid: 'pasta', qty: 2 }], false); G.orders.rushAll(); G.timeScale = 8; G.player.pos.set(-2.5, 0, 5.5); G.player.yaw = 0.6; G.player.pitch = -0.4; });
for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); const n = await g(() => window.game.state.orders.length); if (n === 0) break; }
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tests/out/pl_1_delivered.png' });
const info = await g(() => { const G = window.game; const p = [...G.boxes.items.values()].find(b => b.s.kind === 'pallet'); return { pallet: !!p, riders: p ? G.boxes.ridersOf(p).length : 0, ys: [...G.boxes.items.values()].map(b => (b.s.kind||'box')[0] + b.pos.y.toFixed(2)).join(',') }; });
console.log(JSON.stringify(info));
await g(() => { const G = window.game; G.timeScale = 1; const p = [...G.boxes.items.values()].find(b => b.s.kind === 'pallet'); G.grabPallet(p); });
// walk forward pushing
await g(() => { const G = window.game; G.player.yaw = -1.2; });
await g(() => window.game.input.keyDown('KeyW'));
await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW');
await page.screenshot({ path: 'tests/out/pl_2_pushing.png' });
await g(() => window.game.releasePallet());
const after = await g(() => { const G = window.game; const p = [...G.boxes.items.values()].find(b => b.s.kind === 'pallet'); return { px: p.pos.x.toFixed(2), pz: p.pos.z.toFixed(2), riders: G.boxes.ridersOf(p).length }; });
console.log('after push', JSON.stringify(after));
console.log(logs.join('\n'));
await browser.close();
