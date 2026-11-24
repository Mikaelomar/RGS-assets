// Real (hit-tested) touch input through CDP, like a finger on a phone screen.
// Synthetic events dispatched straight on the canvas would miss overlays that swallow touches.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/?fixedres&season=none';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.waitForTimeout(800);
await page.tap('text=NEW GAME'); await page.waitForTimeout(400);
await page.tap('input[type=checkbox]').catch(() => {});
await page.tap('text=OPEN MY SHOP'); await page.waitForTimeout(2500);
await page.evaluate(() => window.game.ui.closeAll());
await page.waitForTimeout(300);
const hit = await page.evaluate(() => [[120, 300], [600, 200], [422, 195]].map(([x, y]) => { const el = document.elementFromPoint(x, y); return `${x},${y}: ${el?.tagName}.${(el?.className && typeof el.className === 'string') ? el.className : el?.id}`; }));
console.log('top element at joystick / look / centre:', hit.join(' | '));
const p0 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z, yaw: window.game.player.yaw }));
// joystick: press bottom-left and drag up
await touch('touchStart', 120, 300);
for (let i = 1; i <= 8; i++) { await touch('touchMove', 120, 300 - i * 8); await page.waitForTimeout(40); }
await page.waitForTimeout(2000);
const mid = await page.evaluate(() => ({ mx: window.game.input.moveX, my: window.game.input.moveY }));
await touch('touchEnd', 120, 236);
const p1 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z, yaw: window.game.player.yaw }));
// look: drag on the right half
await touch('touchStart', 640, 200);
for (let i = 1; i <= 10; i++) { await touch('touchMove', 640 - i * 14, 200); await page.waitForTimeout(30); }
await touch('touchEnd', 500, 200);
await page.waitForTimeout(400);
const p2 = await page.evaluate(() => ({ x: window.game.player.pos.x, z: window.game.player.pos.z, yaw: window.game.player.yaw }));
console.log('joystick input while held', JSON.stringify(mid));
console.log('moved by joystick:', Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2), 'm; turned by look:', (p2.yaw - p1.yaw).toFixed(2), 'rad');
await page.screenshot({ path: 'tests/out/rt_after.png' });
console.log(logs.join('\n') || 'no errors');
await browser.close();
