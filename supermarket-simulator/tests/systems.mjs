// Manager app, ordering + truck, end of day, night view, mobile layout
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [, , W = '844', H = '390'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (!m.text().includes('GPU stall') && !m.text().includes('vite')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/?fixedres', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.screenshot({ path: 'tests/out/m_title.png' });
await page.tap('text=NEW GAME'); await page.waitForTimeout(300);
await page.tap('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
await page.screenshot({ path: 'tests/out/m_start.png' });
// manager app
await g(() => window.game.app.open('market'));
await page.waitForTimeout(800);
await page.screenshot({ path: 'tests/out/m_app_market.png' });
// add apples + oranges and buy
await g(() => { const A = window.game.app; A.cart.set('p:orange', 2); A.cart.set('p:chips', 1); A.cart.set('f:shelf_small', 1); A.renderCart(); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'tests/out/m_app_cart.png' });
await g(() => window.game.app.buy());
await page.waitForTimeout(300);
await g(() => window.game.app.open('store'));
await page.waitForTimeout(500);
await page.screenshot({ path: 'tests/out/m_app_store.png' });
await g(() => window.game.app.open('finance'));
await page.waitForTimeout(500);
await page.screenshot({ path: 'tests/out/m_app_finance.png' });
await g(() => window.game.app.close());
// fast forward the truck
await g(() => { const G = window.game; G.timeScale = 10; G.player.pos.set(-1, 0, 4.5); G.player.yaw = 1.0; G.player.pitch = -0.15; });
for (let i = 0; i < 40; i++) { await page.waitForTimeout(1000); const n = await g(() => window.game.boxes.items.size); if (n >= 6) break; }
await page.waitForTimeout(1500);
console.log('boxes', await g(() => [...window.game.boxes.items.values()].map(b => (b.s.kind||'box') + ':' + (b.def?.id||b.s.furn)).join(',')));
await page.screenshot({ path: 'tests/out/m_truck.png' });
// end of day: open, close, end
await g(() => { const G = window.game; G.timeScale = 1; G.sim.openStore(); G.state.minutes = 21.9 * 60; });
await page.waitForTimeout(4000);
await g(() => { const G = window.game; G.sim.closeStore(); G.state.minutes = 22.5 * 60; G.state.phase = 'night'; G.player.pos.set(6, 0, 7); G.player.yaw = 0.1; G.player.pitch = 0.05; G.customers.clearAll(); });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tests/out/m_night.png' });
await g(() => window.game.requestEndDay(false));
await page.waitForTimeout(1500);
await page.screenshot({ path: 'tests/out/m_summary.png' });
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
