// complaints, receipts, construction time, finance KPIs, posters, supplier issues
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 500 } });
const logs = [];
page.on('console', (m) => { if (!m.text().includes('GPU stall') && !m.text().includes('vite')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/?fixedres', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('input[type=checkbox]'); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `tests/out/${name}.png` }); console.log('shot', name); };
await g(() => { const G = window.game; G.state.tutorialDone = true; G.state.money = 90000; G.sim.addXP(2500); });
await page.waitForTimeout(600);
await g(() => window.game.ui.closeAll()); await page.waitForTimeout(200); await g(() => window.game.ui.closeAll());
console.log('level', await g(() => window.game.state.level));

// ---------- construction
await g(() => { const G = window.game; G.sim.openStore(); });
const p1 = g(() => window.game.tryExpansion(0));
await page.waitForTimeout(400);
await shot('f3_expand_confirm');
await page.click('text=Build it!');
await p1;
await page.waitForTimeout(500);
console.log('construction', await g(() => JSON.stringify(window.game.state.construction)), 'plots', await g(() => window.game.state.plots.length), 'time', await g(() => window.game.state.minutes));
await g(() => { const G = window.game; G.player.pos.set(14, 0, -2); G.player.yaw = 2.2; G.player.pitch = -0.05; });
await page.waitForTimeout(1200);
await shot('f3_construction_sign');
// jump time forward
await g(() => { const G = window.game; G.state.minutes = G.state.construction.doneMin - 1; });
await page.waitForTimeout(2500);
console.log('after time: construction', await g(() => JSON.stringify(window.game.state.construction)), 'plots', await g(() => window.game.state.plots.length));
await page.waitForTimeout(800);
await shot('f3_construction_done');

// ---------- posters
await g(() => { const G = window.game; G.spawnCarry({ kind: 'furniture', furn: 'poster_sale' }); G.player.pos.set(12, 0, -8); G.player.yaw = 0; G.player.pitch = -0.2; });
await page.waitForTimeout(400);
await g(() => { const G = window.game; G.build.startAssemble(G.carry, new G.player.pos.constructor(12, 0, -10.5)); });
await page.waitForTimeout(400);
await g(() => window.game.build.confirm());
await page.waitForTimeout(800);
console.log('posters', await g(() => window.game.furniture.byDef('poster_sale').length), 'beauty', await g(() => window.game.furniture.beauty()));
await shot('f3_poster');

// ---------- complaint
await g(() => {
  const G = window.game;
  const c = G.customers.spawn(true);
  c.agent.pos.set(10, 0, -4);
  c.mood = 10; c.notes.add('missing');
  G.player.pos.set(12, 0, -4); G.player.yaw = -Math.PI / 2; G.player.pitch = -0.1;
  window.__cc = c;
  const r = Math.random; Math.random = () => 0.1; G.customers.finishVisit(c); Math.random = r;
});
console.log('complainer state', await g(() => window.__cc.state));
await page.waitForTimeout(2500);
console.log('distance', await g(() => window.__cc.agent.pos.distanceTo(window.game.player.pos)), 'prompt', await g(() => document.querySelector('.prompt')?.textContent ?? '-'));
await shot('f3_complainer');
await g(() => window.game.dialogs.complaint(window.__cc));
await page.waitForTimeout(400);
await shot('f3_complaint_dialog');
const m0 = await g(() => window.game.state.money);
await page.click('text=Give $5 voucher');
await page.waitForTimeout(500);
console.log('after voucher state', await g(() => window.__cc.state), 'money diff', (await g(() => window.game.state.money)) - m0, 'mood', await g(() => window.__cc.mood));

// ---------- receipt (player checkout)
await g(() => {
  const G = window.game;
  for (const ref of G.shelves.refs.values()) {
    if (ref.f.def.cat === 'fixed') continue;
    if (ref.stock.count > 0) continue;
    const pid = ref.slot.def.kind === 'produce' ? 'apple' : ref.slot.def.kind === 'shelf' ? 'cereal' : null;
    if (pid) G.shelves.place(ref, pid, 30, 0);
  }
  G.timeScale = 6;
  for (let i = 0; i < 2; i++) { const c = G.customers.spawn(true); c.agent.pos.set(8 + i, 0, 3); c.agent.goTo(12, 1.6, G.nav); }
});
await page.waitForTimeout(6000);
await g(() => { const G = window.game; const f = [...G.furniture.items.values()].find(f => f.def.id === 'checkout'); G.checkout.enter(f); });
let ok = false;
for (let t = 0; t < 40; t++) {
  await page.waitForTimeout(1000);
  const st = await g(() => { const c = [...window.game.checkout.counters.values()][0]; return c ? c.phase : 'none'; });
  if (st === 'scan') { ok = true; break; }
}
console.log('reached scan', ok);
for (let i = 0; i < 25; i++) { await g(() => window.game.input.buttonDown('action')); await page.waitForTimeout(120); await g(() => window.game.input.buttonUp('action')); await page.waitForTimeout(120); }
await page.waitForTimeout(600);
const pay = await g(() => { const c = [...window.game.checkout.counters.values()][0]; return { phase: c.phase, pay: c.serving?.pay, total: c.scannedTotal, given: c.cashGiven }; });
console.log('pay', JSON.stringify(pay));
if (pay.phase === 'pay') {
  if (pay.pay === 'card') {
    for (const d of String(Math.round(pay.total * 100))) await page.click(`.pospad .keys button:text-is("${d}")`);
    await page.click('.pospad .keys button.ok');
  } else {
    let due = Math.round((pay.given - pay.total) * 100);
    const den = [10000, 5000, 2000, 1000, 500, 100, 25, 10, 5, 1];
    const labels = { 10000: '$100', 5000: '$50', 2000: '$20', 1000: '$10', 500: '$5', 100: '$1', 25: '25¢', 10: '10¢', 5: '5¢', 1: '1¢' };
    for (const d of den) while (due >= d) { await page.click(`.drawer .cash button:text-is("${labels[d]}")`); due -= d; }
    await page.click('text=GIVE CHANGE');
  }
}
await page.waitForTimeout(900);
console.log('receipt visible', await g(() => !!document.querySelector('.receipt')));
await shot('f3_receipt');
await g(() => window.game.checkout.leave?.());
await page.waitForTimeout(400);

// ---------- supplier issues: force a few orders
const ordersBefore = await g(() => window.game.state.boxes.length);
await g(() => { const G = window.game; G.orders.place([{ pid: 'cereal', qty: 3 }, { pid: 'eggs', qty: 2 }], true); G.timeScale = 1; });
for (let t = 0; t < 60; t++) { await page.waitForTimeout(1000); const n = await g(() => window.game.state.boxes.length); if (n >= ordersBefore + 5) { console.log('delivered after', t, 's'); break; } if (t % 10 === 0) console.log('order', await g(() => JSON.stringify(window.game.state.orders.map((o) => o.status)))); }
console.log('forced issues:', await g(() => { const G = window.game; const r = Math.random; Math.random = () => 0.01; const a = G.orders.supplierIssues('cereal'); const b = G.orders.deliveredCount(window.__allProducts.find((p) => p.id === 'eggs')); Math.random = r; return a + ' / eggs count ' + b; }));
await page.waitForTimeout(500);
console.log('delivered boxes', await g(() => window.game.state.boxes.slice(-5).map((b) => `${b.pid}:${b.count}`).join(' ')), 'damaged stat', await g(() => window.game.state.stats.damaged ?? 0));

// ---------- finance
await g(() => window.game.app.open('finance'));
await page.waitForTimeout(600);
await shot('f3_finance');
const kpis = await g(() => [...document.querySelectorAll('.kpi')].map((k) => k.textContent).join(' | '));
console.log('kpis', kpis);
await g(() => window.game.ui.closeAll());
// save / load keeps construction field
await g(() => window.game.save('slot2'));
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
