// FPS / draw-call check on the busy title scene and in-game
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/?fixedres', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.waitForTimeout(5000);
const info = await page.evaluate(() => { const r = window.game.engine.renderer; const t0 = performance.now(); let js = 0; for (let i = 0; i < 20; i++) { const a = performance.now(); window.game.frame(0.016); js += performance.now() - a; } return { calls: r.info.render.calls, tris: r.info.render.triangles, geos: r.info.memory.geometries, tex: r.info.memory.textures, msPerFrame: ((performance.now() - t0) / 20).toFixed(1), customers: window.game.customers.list.length, quality: window.game.engine.quality }; });
console.log('title scene', JSON.stringify(info));
// profile JS-only cost (no render) of one sim step
const sim = await page.evaluate(() => { const G = window.game; const t0 = performance.now(); for (let i = 0; i < 60; i++) { G.customers.update(0.016); G.staff.update(0.016); G.checkout.update(0.016); G.boxes.update(0.016); G.stock.update(0.016, G.engine.camera.position); } return ((performance.now() - t0) / 60).toFixed(2); });
console.log('sim js ms/frame', sim);
await page.screenshot({ path: 'tests/out/p_title.png' });
await browser.close();
