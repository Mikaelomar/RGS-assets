import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/?fixedres&season=none', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
await g(() => { const G = window.game; G.timeScale = 10; window.__b = []; for (let i = 0; i < 8; i++) { const x = -4.5 + (Math.random()*4-2), z = 2.8 + (Math.random()*2.4-1.1); window.__b.push(G.addBoxState({ uid: 90000 + i, pid: 'chips', count: 12, exp: 0, x, y: 1.4, z, ry: 0, kind: 'box' }, new window.THREE_V(Math.random()*0.8-0.4, 0.5, -1.2))); } }).catch(async () => {
  await g(() => { const G = window.game; G.timeScale = 10; window.__b = []; for (let i = 0; i < 8; i++) { const x = -4.5 + (Math.random()*4-2), z = 2.8 + (Math.random()*2.4-1.1); const rt = G.addBoxState({ uid: 90000 + i, pid: 'chips', count: 12, exp: 0, x, y: 1.4, z, ry: 0, kind: 'box' }); rt.vel.set(Math.random()*0.8-0.4, 0.5, -1.2); rt.resting = false; window.__b.push(rt); } });
});
for (let t = 0; t < 6; t++) { await page.waitForTimeout(1500); console.log(await g(() => window.__b.map(b => `${b.pos.x.toFixed(1)},${b.pos.y.toFixed(2)},${b.pos.z.toFixed(2)}${b.resting ? 'R' : ''}`).join(' | '))); }
await browser.close();
