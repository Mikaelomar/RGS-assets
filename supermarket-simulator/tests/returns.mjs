// product returns at the checkout: player refund / refuse, cashier auto-refund
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 500 } });
const logs = [];
page.on('console', (m) => { if (!m.text().includes('GPU stall') && !m.text().includes('vite')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('input[type=checkbox]'); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `tests/out/${name}.png` }); console.log('shot', name); };
await g(() => { const G = window.game; G.state.tutorialDone = true; G.state.money = 5000; G.sim.addXP(200); });
await page.waitForTimeout(400);
await g(() => window.game.ui.closeAll()); await page.waitForTimeout(200); await g(() => window.game.ui.closeAll());
// stock some shelves and open
await g(() => {
  const G = window.game;
  for (const ref of G.shelves.refs.values()) {
    if (ref.f.def.cat === 'fixed') continue;
    const pid = ref.slot.def.kind === 'produce' ? 'apple' : ref.slot.def.kind === 'shelf' ? 'cereal' : null;
    if (pid) G.shelves.place(ref, pid, 20, 0);
  }
  G.sim.openStore();
  G.timeScale = 4;
});
// spawn returners until we have one with each reason type we want
const spawnReturner = (reason) => g((reason) => {
  const G = window.game;
  let c = null;
  for (let i = 0; i < 400 && !c; i++) {
    const r = Math.random; Math.random = () => 0.001; const x = G.customers.spawn(true); Math.random = r;
    if (x.returnPid) c = x; else x.dispose();
  }
  c.returnReason = reason;
  c.agent.pos.set(9, 0, 2.5);
  window.__ret = c;
  return c.returnPid;
}, reason);
console.log('returner 1 product', await spawnReturner('Damaged packaging'));
await g(() => { const G = window.game; const f = [...G.furniture.items.values()].find((f) => f.def.id === 'checkout'); G.checkout.enter(f); });
let st = '';
for (let t = 0; t < 40; t++) {
  await page.waitForTimeout(1000);
  st = await g(() => { const c = [...window.game.checkout.counters.values()].find((c) => !c.self); return `${c.phase}|${window.__ret.state}`; });
  if (st.startsWith('return')) break;
  if (t % 5 === 0) console.log('waiting', st);
}
console.log('phase', st);
await page.waitForTimeout(500);
await shot('ret_1_panel');
const m0 = await g(() => window.game.state.money);
await page.click('.co-return .btn.green');
await page.waitForTimeout(600);
console.log('refund: money diff', ((await g(() => window.game.state.money)) - m0).toFixed(2), 'state', await g(() => window.__ret.state), 'mood', await g(() => Math.round(window.__ret.mood)));

console.log('returner 2 product', await spawnReturner('Changed my mind'));
for (let t = 0; t < 40; t++) {
  await page.waitForTimeout(1000);
  st = await g(() => { const c = [...window.game.checkout.counters.values()].find((c) => !c.self); return `${c.phase}|${window.__ret.state}`; });
  if (st.startsWith('return')) break;
}
console.log('phase', st);
await shot('ret_2_panel');
await page.click('.co-return .btn.red');
await page.waitForTimeout(600);
console.log('refuse: state', await g(() => window.__ret.state), 'mood', await g(() => Math.round(window.__ret.mood)), 'panel gone', await g(() => !document.querySelector('.co-return')));
await g(() => window.game.checkout.leave());

// cashier handles it
await g(() => { const G = window.game; const c = G.staff.makeCandidate('cashier'); c.shiftStart = 0; c.shiftEnd = 24; G.state.candidates.push(c); G.staff.hire(c); });
console.log('returner 3 product', await spawnReturner('Expired'));
const m1 = await g(() => window.game.state.money);
for (let t = 0; t < 60; t++) {
  await page.waitForTimeout(1000);
  st = await g(() => `${window.__ret.state}|${window.game.staff.list[0].status}`);
  if (st.startsWith('leave') || st.startsWith('exit')) break;
  if (t % 10 === 0) console.log('waiting', st);
}
console.log('cashier result', st, 'money diff', ((await g(() => window.game.state.money)) - m1).toFixed(2), 'returns stat', await g(() => window.game.state.stats.returns));
console.log(logs.slice(0, 30).join('\n') || 'no console errors');
await browser.close();
