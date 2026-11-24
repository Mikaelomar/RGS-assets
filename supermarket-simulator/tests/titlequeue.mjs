// Start a new game / load a save while the title-screen demo has customers queueing at the checkouts.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
await page.goto('http://localhost:5173/?fixedres&season=none', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
let queued = 0;
for (let i = 0; i < 60 && queued === 0; i++) {
  await page.waitForTimeout(1000);
  queued = await g(() => [...window.game.checkout.counters.values()].reduce((a, c) => a + c.queue.length + (c.serving ? 1 : 0), 0));
}
console.log('demo customers at checkouts before NEW GAME:', queued);
await page.tap('text=NEW GAME'); await page.waitForTimeout(300); await page.tap('input[type=checkbox]'); await page.tap('text=OPEN MY SHOP');
await page.waitForTimeout(2500);
await g(() => window.game.ui.closeAll());
console.log('counters after new game:', await g(() => [...window.game.checkout.counters.keys()].join(',')), 'furniture checkouts:', await g(() => window.game.furniture.byDef('checkout').map((f) => f.s.uid).join(',')));
// a customer heads to the checkout (used to recurse forever)
await g(() => { const G = window.game; G.sim.openStore(); const cu = G.customers.spawn(true); cu.basket = [{ pid: 'cereal', exp: 0, price: 2.49 }]; G.customers.goToCheckout(cu); });
await page.waitForTimeout(1500);
console.log('queue at our checkout:', await g(() => [...window.game.checkout.counters.values()].map((c) => c.queue.length + (c.serving ? 1 : 0)).join(',')));
// move with a real touch
const cdp = await ctx.newCDPSession(page);
const p0 = await g(() => [window.game.player.pos.x, window.game.player.pos.z]);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 110, y: 300, id: 1 }] });
for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 110, y: 300 - i * 8, id: 1 }] }); await page.waitForTimeout(30); }
await page.waitForTimeout(1500);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const p1 = await g(() => [window.game.player.pos.x, window.game.player.pos.z]);
console.log('moved', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2), 'm');
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors');
await browser.close();
