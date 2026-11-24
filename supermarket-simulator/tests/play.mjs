// Scripted play-through: node tests/play.mjs <scenario> [w] [h]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [, , scenario = 'start', w = '1280', h = '640'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, hasTouch: scenario.includes('touch'), isMobile: scenario.includes('touch') });
const logs = [];
page.on('console', (m) => { if (!m.text().includes('GPU stall')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/?fixedres&season=none', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.waitForTimeout(1500);
const shot = async (name) => { await page.screenshot({ path: `tests/out/${name}.png` }); console.log('shot', name); };
const g = (fn, arg) => page.evaluate(fn, arg);
// start a new game
await page.click('text=NEW GAME');
await page.waitForTimeout(400);
await page.click('text=OPEN MY SHOP');
await page.waitForTimeout(2500);
await shot(scenario + '_0');
const steps = (n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); }, n);
if (scenario.startsWith('loop')) {
  // walk to the apples, pick up, stock rack, trash crate
  await g(() => { const G = window.game; const b = [...G.boxes.items.values()].find(b => b.def?.id === 'apple'); G.player.pos.set(b.pos.x, 0, b.pos.z + 1.4); G.player.yaw = 0; G.player.pitch = -0.75; });
  await steps(10);
  await shot(scenario + '_1_look_box');
  console.log('prompt:', await g(() => document.querySelector('.prompt')?.textContent));
  await g(() => { window.game.input.buttonDown('action'); });
  await steps(3);
  await g(() => { window.game.input.buttonUp('action'); });
  await steps(5);
  console.log('carry:', await g(() => window.game.carry?.def?.id));
  await shot(scenario + '_2_carry');
  // go to fruit rack
  await g(() => { const G = window.game; const f = [...G.furniture.items.values()].find(f => f.def.id === 'fruit_rack'); G.player.pos.set(f.s.x, 0, f.s.z + 1.6); G.player.yaw = 0; G.player.pitch = -0.45; });
  await steps(10);
  console.log('prompt:', await g(() => document.querySelector('.prompt')?.textContent));
  await g(() => window.game.input.buttonDown('action'));
  await page.waitForTimeout(2500);
  await g(() => window.game.input.buttonUp('action'));
  await steps(5);
  console.log('box count:', await g(() => window.game.carry?.s.count), 'shelf apples:', await g(() => window.game.shelves.shelfCount('apple')));
  await shot(scenario + '_3_stocked');
  // trash the box
  await g(() => { const G = window.game; const f = [...G.furniture.items.values()].find(f => f.def.id === 'trash_bin'); G.player.pos.set(f.s.x - 1.3, 0, f.s.z); G.player.yaw = -Math.PI/2; G.player.pitch = -0.5; });
  await steps(10);
  console.log('prompt:', await g(() => document.querySelector('.prompt')?.textContent));
  await g(() => window.game.input.buttonDown('action')); await steps(3); await g(() => window.game.input.buttonUp('action')); await steps(5);
  console.log('carry after trash:', await g(() => !!window.game.carry), 'tutorial step', await g(() => window.game.state.tutorial));
  // open the store and fast-forward
  await g(() => { const G = window.game; G.sim.openStore(); });
  await page.waitForTimeout(500);
  await g(() => { const G = window.game; G.player.pos.set(12, 0, -4); G.player.yaw = Math.PI; G.player.pitch = -0.1; for (let i = 0; i < 3; i++) G.customers.spawn(true); });
  await page.waitForTimeout(6000);
  await shot(scenario + '_4_open');
  console.log('customers:', await g(() => window.game.customers.list.map(c => c.state + ':' + c.list.length).join(',')));
  // enter checkout
  await g(() => { const G = window.game; const f = [...G.furniture.items.values()].find(f => f.def.id === 'checkout'); G.checkout.enter(f); });
  await page.waitForTimeout(20000);
  await shot(scenario + '_5_checkout');
  console.log('customers:', await g(() => window.game.customers.list.map(c => c.state).join(',')));
}
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
