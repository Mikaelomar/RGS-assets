// Christmas season: title screen, greeting + gift, snow, lights, specials, tree
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 500 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/?fixedres&season=christmas', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'tests/out/xm_0_title.png' });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('input[type=checkbox]'); await page.click('text=OPEN MY SHOP');
await page.waitForTimeout(3500);
const g = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `tests/out/${name}.png` }); console.log('shot', name); };
console.log('weather', await g(() => window.game.state.weather), 'seen', await g(() => JSON.stringify(window.game.state.seasonsSeen)), 'modal', await g(() => document.querySelector('.wtitle')?.textContent));
await shot('xm_1_greeting');
await page.click('text=MERRY CHRISTMAS!').catch(() => console.log('no greeting button'));
await page.waitForTimeout(300);
await g(() => window.game.ui.closeAll());
// look at the store from across the street (day, snowing)
await g(() => { const G = window.game; G.player.pos.set(12, 0, 13.5); G.player.yaw = 0; G.player.pitch = 0.08; });
await page.waitForTimeout(2500);
await shot('xm_2_street_day');
// gift box at the delivery spot
await g(() => { const G = window.game; G.player.pos.set(-4.5, 0, 6.5); G.player.yaw = 0; G.player.pitch = -0.35; });
await page.waitForTimeout(1200);
await shot('xm_3_gift');
// evening lights
await g(() => { const G = window.game; G.state.minutes = 22.2 * 60; G.player.pos.set(11, 0, 9.5); G.player.yaw = 0.15; G.player.pitch = 0.12; });
await page.waitForTimeout(3000);
await shot('xm_4_evening');
// assemble the tree inside
await g(() => { const G = window.game; G.state.minutes = 10 * 60; G.spawnCarry({ kind: 'furniture', furn: 'xmas_tree' }); G.player.pos.set(18, 0, -2); G.player.yaw = 0; G.player.pitch = -0.25; });
await page.waitForTimeout(500);
for (const [tx, tz] of [[14.6, -2.4], [13.8, -6], [4.5, -10], [10, -12]]) {
  await g(([tx, tz]) => { const G = window.game; if (!G.carry) G.spawnCarry({ kind: 'furniture', furn: 'xmas_tree' }); G.player.pos.set(tx, 0, tz + 2.6); G.player.yaw = 0; G.player.pitch = -0.55; G.build.startAssemble(G.carry, new G.player.pos.constructor(tx, 0, tz)); }, [tx, tz]);
  await page.waitForTimeout(400);
  console.log('build reason at', tx, tz, ':', await g(() => window.game.build.reason || 'ok'), await g(() => { const p = window.game.build.pos; return p.x.toFixed(2) + ',' + p.z.toFixed(2); }));
  await g(() => window.game.build.confirm());
  await page.waitForTimeout(600);
  if (await g(() => window.game.furniture.byDef('xmas_tree').length)) { console.log('tree placed at', tx, tz); break; }
  await g(() => { const G = window.game; if (G.build.active) G.build.cancel?.(); });
}
await g(() => { const G = window.game; const t = G.furniture.byDef('xmas_tree')[0]; if (t) { G.player.pos.set(t.s.x - 0.6, 0, t.s.z + 3.2); G.player.yaw = -0.15; G.player.pitch = 0.05; } });
await page.waitForTimeout(1200);
console.log('trees', await g(() => window.game.furniture.byDef('xmas_tree').length), 'beauty', await g(() => window.game.furniture.beauty()));
await shot('xm_5_tree');
// specials in the market
await g(() => window.game.app.open('market'));
await page.waitForTimeout(400);
await page.selectOption('.searchbar select', 'season');
await page.waitForTimeout(500);
await shot('xm_6_market');
console.log('season products listed', await g(() => document.querySelectorAll('.grid .card').length));
await g(() => window.game.ui.closeAll());
// customers want specials
console.log('list share', await g(() => { const G = window.game; let n = 0, sp = 0; for (let i = 0; i < 60; i++) { const c = G.customers.spawn(true); for (const it of c.list) { n++; if (window.__allProducts.find((p) => p.id === it.pid)?.season) sp++; } c.dispose(); } G.customers.list = G.customers.list.filter((c) => !c.removed); return `${sp}/${n}`; }));
console.log(logs.slice(0, 20).join('\n') || 'no errors');
await browser.close();
