// Full tutorial run-through with real interactions
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/?fixedres', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
const step = () => g(() => window.game.state.tutorial);
const hint = () => g(() => document.querySelector('.hint .bubble')?.textContent);
const frames = (n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); }, n);
const tap = async () => { await g(() => window.game.input.buttonDown('action')); await frames(3); await g(() => window.game.input.buttonUp('action')); await frames(3); };
const hold = async (ms) => { await g(() => window.game.input.buttonDown('action')); await page.waitForTimeout(ms); await g(() => window.game.input.buttonUp('action')); await frames(3); };
const face = (x, y, z) => g(([x, y, z]) => { const G = window.game; const p = G.player.pos; const dx = x - p.x, dz = z - p.z; G.player.yaw = Math.atan2(-dx, -dz); G.player.pitch = Math.atan2(y - 1.62, Math.hypot(dx, dz)); }, [x, y, z]);
const log = async (label) => console.log(label, 'step', await step(), '|', (await hint())?.slice(0, 70));
await log('start');
// 1 look
for (let i = 0; i < 12; i++) { await g(() => { window.game.input.lookDX += 60; }); await frames(2); }
await frames(5); await log('after look');
// 2 walk
await g(() => { const G = window.game; G.player.pos.set(-3.2, 0, 4.6); }); await frames(5); await log('after walk');
// 3 pick apples
await g(() => window.game.timeScale = 1);
const apple = await g(() => { const b = [...window.game.boxes.items.values()].find(b => b.def?.id === 'apple'); return [b.pos.x, b.pos.y + 0.15, b.pos.z]; });
await g(([x, z]) => window.game.player.pos.set(x, 0, z + 1.2), [apple[0], apple[2]]);
await face(...apple); await frames(5); await tap(); await log('after pickup');
// 4 stock apples (hold until empty)
await g(() => { const G = window.game; const f = G.furniture.byDef('fruit_rack')[0]; G.player.pos.set(f.s.x, 0, f.s.z + 1.5); });
await face(3.0, 0.62, -7.1);
for (let i = 0; i < 6 && (await g(() => window.game.carry?.s.count ?? 0)) > 0; i++) await hold(4000);
await log('after stocking (box count ' + (await g(() => window.game.carry?.s.count)) + ')');
// 5 trash
await g(() => { const G = window.game; const f = G.furniture.byDef('trash_bin')[0]; G.player.pos.set(f.s.x - 1.2, 0, f.s.z); });
await face(15.0, 0.7, -4.6); await frames(5); await tap(); await log('after trash');
// 6 cereal
const cer = await g(() => { const b = [...window.game.boxes.items.values()].find(b => b.def?.id === 'cereal'); return [b.pos.x, b.pos.y + 0.15, b.pos.z]; });
await g(([x, z]) => window.game.player.pos.set(x + 0.3, 0, z + 1.2), [cer[0], cer[2]]);
await face(...cer); await frames(5); await tap();
await g(() => { const G = window.game; G.player.pos.set(6.6, 0, -6.2); });
await face(6.6, 0.6, -7.6);
for (let i = 0; i < 6 && (await g(() => window.game.carry?.s.count ?? 0)) > 0; i++) await hold(4000);
await log('after cereal (box ' + (await g(() => window.game.carry?.s.count)) + ')');
await g(() => { const G = window.game; const f = G.furniture.byDef('trash_bin')[0]; G.player.pos.set(f.s.x - 1.2, 0, f.s.z); });
await face(15.0, 0.7, -4.6); await frames(5); await tap();
await log('after cereal trash');
// 7 price
await g(() => { const G = window.game; G.player.pos.set(6.6, 0, -6.2); }); await face(6.6, 0.55, -7.5); await frames(5); await tap(); await frames(10);
await g(() => window.game.ui.closeAll()); await frames(5); await log('after price');
// 8 computer order
await g(() => { const G = window.game; G.app.open('market'); G.app.cart.set('p:orange', 1); G.app.buy(); G.app.close(); }); await frames(10); await log('after order');
// 9 open sign
await g(() => { const G = window.game; G.player.pos.set(14.2, 0, -1.8); }); await face(14.2, 1.95, -0.22); await frames(5); await tap(); await frames(5); await log('after open');
// 10 checkout
await g(() => { const G = window.game; G.timeScale = 6; for (let i = 0; i < 2; i++) { const c = G.customers.spawn(true); c.agent.pos.set(11 + i, 0, 1.5); c.agent.goTo(12, -1.5, G.nav); } });
await g(() => { const G = window.game; const f = G.furniture.byDef('checkout')[0]; G.player.pos.set(9.2, 0, -1.6); G.checkout.enter(f); }); await frames(5); await log('after checkout');
// 11 sale: wait for a customer and pay
for (let t = 0; t < 40; t++) { await page.waitForTimeout(1000); const ph = await g(() => [...window.game.checkout.counters.values()][0].phase); if (ph === 'scan') break; }
for (let i = 0; i < 25; i++) { await tap(); }
await page.waitForTimeout(800);
const pay = await g(() => { const c = [...window.game.checkout.counters.values()][0]; return { phase: c.phase, pay: c.serving?.pay, total: c.scannedTotal, given: c.cashGiven }; });
if (pay.phase === 'pay') {
  if (pay.pay === 'card') { for (const d of String(Math.round(pay.total * 100))) await page.click(`.pospad .keys button:text-is("${d}")`); await page.click('.pospad .keys button.ok'); }
  else { let due = Math.round((pay.given - pay.total) * 100); const den = [10000, 5000, 2000, 1000, 500, 100, 25, 10, 5, 1]; const lab = { 10000: '$100', 5000: '$50', 2000: '$20', 1000: '$10', 500: '$5', 100: '$1', 25: '25¢', 10: '10¢', 5: '5¢', 1: '1¢' }; for (const d of den) while (due >= d) { await page.click(`.drawer .cash button:text-is("${lab[d]}")`); due -= d; } await page.click('text=GIVE CHANGE'); }
}
await page.waitForTimeout(1000);
await log('after sale');
await g(() => window.game.checkout.leave());
await page.waitForTimeout(12000);
await log('final');
await page.screenshot({ path: 'tests/out/tut_final.png' });
console.log('errors', errors.length, errors.slice(0, 5).join('\n'));
await browser.close();
