// Beauty shots of the demo store (title scene) from various angles
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/?fixedres&season=none', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: 'tests/out/v_title.png' });
await page.evaluate(() => { document.querySelector('.title-screen').style.display = 'none'; window.game.onFrameHook = () => {}; });
const shots = [
  ['v_aisle', [14, 1.62, -6.5], [14, 1.2, -20]],
  ['v_fridges', [9, 1.62, -19.5], [6, 1.1, -24]],
  ['v_produce', [22, 1.7, -2.2], [26, 0.9, -7]],
  ['v_front', [10, 1.62, -3.5], [3, 1.0, -2.6]],
];
for (const [name, pos, look] of shots) {
  await page.evaluate(([pos, look]) => { const c = window.game.engine.camera; window.game.onFrameHook = () => { c.position.set(...pos); c.lookAt(...look); window.game.player.pos.set(pos[0], 0, pos[2]); }; }, [pos, look]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `tests/out/${name}.png` });
}
await browser.close();
console.log('done');
