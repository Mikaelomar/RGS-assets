// desktop mouse: click captures the mouse (or falls back to drag-to-look), WASD walks
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
await page.goto('http://localhost:5173/?fixedres&season=none', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('input[type=checkbox]'); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(2000);
await g(() => window.game.ui.closeAll());
const y0 = await g(() => window.game.player.yaw);
await page.mouse.move(600, 260);
await page.mouse.down();
await page.mouse.move(400, 260, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(400);
const y1 = await g(() => window.game.player.yaw);
console.log('pointer locked:', await g(() => document.pointerLockElement?.id ?? null), 'yaw change by mouse:', (y1 - y0).toFixed(2));
// if locked, move the mouse (movementX) to look
if (await g(() => !!document.pointerLockElement)) { await page.mouse.move(200, 260, { steps: 10 }); await page.waitForTimeout(300); console.log('yaw after locked move', (await g(() => window.game.player.yaw) - y1).toFixed(2)); }
const p0 = await g(() => [window.game.player.pos.x, window.game.player.pos.z]);
await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
const p1 = await g(() => [window.game.player.pos.x, window.game.player.pos.z]);
console.log('walked with W:', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2), 'm');
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
