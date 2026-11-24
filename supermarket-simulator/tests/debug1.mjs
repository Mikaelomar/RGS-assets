import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/?fixedres', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
await g(() => { const G = window.game; const b = [...G.boxes.items.values()].find(b => b.def?.id === 'apple'); G.pickUp(b); const f = [...G.furniture.items.values()].find(f => f.def.id === 'fruit_rack'); G.player.pos.set(f.s.x, 0, f.s.z + 1.6); G.player.yaw = 0; G.player.pitch = -0.45; });
await page.waitForTimeout(500);
await g(() => window.game.input.buttonDown('action'));
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(250);
  console.log(await g(() => { const A = window.game.actions; return JSON.stringify({ t: A.target?.t, key: A.holdKey, rep: A.repeatT?.toFixed(2), info: A.info?.text, down: window.game.input.isDown('action'), cnt: window.game.carry?.s.count, fps: window.game.time.toFixed(1) }); }));
}
await browser.close();
