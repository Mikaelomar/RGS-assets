// Touch controls test (synthetic multi-touch)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/?fixedres&season=none', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.tap('text=NEW GAME'); await page.waitForTimeout(300); await page.tap('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const touch = (type, id, x, y) => page.evaluate(([type, id, x, y]) => {
  const c = document.getElementById('game-canvas');
  const t = new Touch({ identifier: id, target: c, clientX: x, clientY: y });
  const ev = new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true });
  c.dispatchEvent(ev);
}, [type, id, x, y]);
const pos0 = await page.evaluate(() => [window.game.player.pos.x.toFixed(2), window.game.player.pos.z.toFixed(2), window.game.player.yaw.toFixed(2)]);
// joystick forward
await touch('touchstart', 1, 120, 300);
for (let i = 0; i < 8; i++) { await touch('touchmove', 1, 120, 300 - i * 8); await page.waitForTimeout(50); }
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tests/out/t_joystick.png' });
await touch('touchend', 1, 120, 236);
const pos1 = await page.evaluate(() => [window.game.player.pos.x.toFixed(2), window.game.player.pos.z.toFixed(2), window.game.player.yaw.toFixed(2)]);
// look drag on the right side
await touch('touchstart', 2, 600, 200);
for (let i = 0; i < 10; i++) { await touch('touchmove', 2, 600 - i * 15, 200); await page.waitForTimeout(30); }
await touch('touchend', 2, 450, 200);
await page.waitForTimeout(500);
const pos2 = await page.evaluate(() => [window.game.player.pos.x.toFixed(2), window.game.player.pos.z.toFixed(2), window.game.player.yaw.toFixed(2), window.game.state.tutorial]);
console.log('start', pos0, 'after joystick', pos1, 'after look', pos2);
// tap the hand button
const btn = await page.$('.btn-round.main');
const bb = await btn.boundingBox();
console.log('hand button at', bb);
await browser.close();
