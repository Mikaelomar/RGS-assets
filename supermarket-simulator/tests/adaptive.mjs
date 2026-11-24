// adaptive resolution: on the slow software renderer the scale should drop, then quality
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 450 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(4000);
  console.log(await page.evaluate(() => { const e = window.game.engine; return `adaptive=${e.adaptive} scale=${e.renderScale.toFixed(2)} q=${e.quality} dropped=${e.autoDropped} pr=${e.renderer.getPixelRatio().toFixed(2)} buf=${e.renderer.domElement.width}x${e.renderer.domElement.height}`; }));
}
console.log(logs.join('\n') || 'no errors');
await browser.close();
