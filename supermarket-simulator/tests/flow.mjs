// Customer -> checkout -> payment flow test (fast-forwarded)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 560 } });
const logs = [];
page.on('console', (m) => { if (!m.text().includes('GPU stall') && !m.text().includes('vite')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300);
await page.click('input[type=checkbox]');
await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `tests/out/${name}.png` }); console.log('shot', name); };
// stock shelves directly
await g(() => {
  const G = window.game;
  for (const ref of G.shelves.refs.values()) {
    if (ref.f.def.cat === 'fixed') continue;
    const pid = ref.slot.def.kind === 'produce' ? ['apple', 'orange', 'banana', 'apple'][ref.slot.index] : ['cereal', 'pasta', 'chips', 'cereal'][ref.slot.index];
    G.shelves.place(ref, pid, 40, 0);
  }
  G.timeScale = 8;
  G.sim.openStore();
  for (let i = 0; i < 4; i++) { const c = G.customers.spawn(true); c.agent.pos.set(8 + i, 0, 3); c.agent.goTo(12, 1.6, G.nav); }
  G.player.pos.set(11, 0, -4.5); G.player.yaw = 2.2; G.player.pitch = -0.1;
});
await page.waitForTimeout(9000);
console.log('states:', await g(() => window.game.customers.list.filter(c=>c.shopper).map(c => `${c.state}(${c.basket.length}/${c.list.length})`).join(' ')));
await shot('flow_1_shopping');
await g(() => { const G = window.game; const f = [...G.furniture.items.values()].find(f => f.def.id === 'checkout'); G.checkout.enter(f); });
for (let t = 0; t < 30; t++) {
  await page.waitForTimeout(1000);
  const st = await g(() => { const c = [...window.game.checkout.counters.values()][0]; return c ? `${c.phase}|q${c.queue.length}|${c.serving ? c.serving.state : '-'}|items${c.items.length}` : 'none'; });
  if (st.startsWith('scan')) { console.log('at counter:', st); break; }
  if (t % 5 === 0) console.log('waiting', st, await g(() => window.game.customers.list.filter(c=>c.shopper).map(c => c.state).join(',')));
}
await shot('flow_2_belt');
// scan everything
for (let i = 0; i < 20; i++) { await g(() => { window.game.input.buttonDown('action'); }); await page.waitForTimeout(150); await g(() => window.game.input.buttonUp('action')); await page.waitForTimeout(150); }
await page.waitForTimeout(800);
const pay = await g(() => { const c = [...window.game.checkout.counters.values()][0]; return { phase: c.phase, pay: c.serving?.pay, total: c.scannedTotal, given: c.cashGiven }; });
console.log('pay', JSON.stringify(pay));
await shot('flow_3_pay');
if (pay.phase === 'pay') {
  if (pay.pay === 'card') {
    const digits = String(Math.round(pay.total * 100));
    for (const d of digits) await page.click(`.pospad .keys button:text-is("${d}")`);
    await page.click('.pospad .keys button.ok');
  } else {
    // give exact change greedily
    let due = Math.round((pay.given - pay.total) * 100);
    const den = [10000, 5000, 2000, 1000, 500, 100, 25, 10, 5, 1];
    const labels = { 10000: '$100', 5000: '$50', 2000: '$20', 1000: '$10', 500: '$5', 100: '$1', 25: '25¢', 10: '10¢', 5: '5¢', 1: '1¢' };
    for (const d of den) while (due >= d) { await page.click(`.drawer .cash button:text-is("${labels[d]}")`); due -= d; }
    await page.click('text=GIVE CHANGE');
  }
}
await page.waitForTimeout(1500);
console.log('money', await g(() => window.game.state.money), 'revenue', await g(() => window.game.state.today.revenue), 'xp', await g(() => window.game.state.xp), 'lvl', await g(() => window.game.state.level));
await shot('flow_4_after');
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
