import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/?fixedres', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('input[type=checkbox]'); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
await g(() => {
  const G = window.game, S = G.state;
  S.level = 10; S.money = 99999;
  for (const ref of G.shelves.refs.values()) { if (ref.f.def.cat === 'fixed') continue; G.shelves.place(ref, ref.slot.def.kind === 'produce' ? 'apple' : 'chips', 30, 0); }
  const c = G.staff.makeCandidate('cashier'); S.candidates.push(c); G.staff.hire(c); G.staff.list[0].s.shiftStart = 6;
  G.timeScale = 6; G.sim.openStore();
  for (let i = 0; i < 6; i++) { const cu = G.customers.spawn(true); cu.agent.pos.set(10 + i * 0.6, 0, 2.5); cu.agent.goTo(12, 1.6, G.nav); }
  window.__log = [];
  const cnt = [...G.checkout.counters.values()][0];
  let last = '';
  window.__iv = setInterval(() => {
    const cu = cnt.serving;
    const k = `${cnt.phase}|${cu ? cu.state : '-'}|${cu ? cu.agent.arrived : ''}|${cu ? cu.agent.path.length : ''}`;
    if (k !== last) { window.__log.push(`${G.state.minutes}:${k}${cu ? ' d=' + cu.agent.pos.distanceTo(G.furniture.local(cnt.f, 0.25, 0, 0.85)).toFixed(2) : ''}`); last = k; }
  }, 50);
});
await page.waitForTimeout(60000);
console.log((await g(() => window.__log)).slice(0, 60).join('\n'));
await browser.close();
