// daily missions + marketing campaigns
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 500 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/?fixedres', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('input[type=checkbox]'); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => { await page.screenshot({ path: `tests/out/${name}.png` }); console.log('shot', name); };
console.log('before tutorial done: missions', await g(() => JSON.stringify(window.game.state.missions ?? null)), 'btn', await g(() => document.querySelectorAll('.sidebtn')[2]?.style.display));
await g(() => { const G = window.game; G.tutorial.skip(); G.state.money = 20000; G.sim.addXP(900); });
await page.waitForTimeout(600);
await g(() => window.game.ui.closeAll()); await page.waitForTimeout(200); await g(() => window.game.ui.closeAll());
await page.waitForTimeout(1500);
console.log('level', await g(() => window.game.state.level));
console.log('missions:', await g(() => window.game.state.missions.list.map((m) => `${m.kind}:${window.game.missions.title(m)} ($${m.reward}, ${m.xp}xp)`).join(' | ')));
await page.click('.sidebtn:has-text("🎯")');
await page.waitForTimeout(500);
await shot('ms_1_panel');
await g(() => window.game.ui.closeAll());
// complete two missions by forcing progress
await g(() => {
  const G = window.game;
  const [a, b] = G.state.missions.list;
  for (const m of [a, b]) {
    if (m.kind === 'sell') G.state.today.itemsSold = m.target;
    else if (m.kind === 'revenue') G.state.today.revenue = m.target;
    else if (m.kind === 'category') { const pid = window.__allProducts.find((p) => p.category === m.cat).id; G.state.today.sold[pid] = m.target; }
    else if (m.kind === 'happy') { G.state.today.served = m.target; G.state.today.satSum = 90 * 10; G.state.today.satCount = 10; }
    else G.missions.bump(m.kind, m.target);
  }
});
await page.waitForTimeout(1500);
console.log('done flags', await g(() => window.game.state.missions.list.map((m) => m.done).join(',')), 'badge', await g(() => [...document.querySelectorAll('.sidebtn .badge')].map((b) => b.style.display + ':' + b.textContent).join(' ')));
await page.click('.sidebtn:has-text("🎯")');
await page.waitForTimeout(500);
await shot('ms_2_claimable');
const m0 = await g(() => window.game.state.money);
await page.click('.ms-btns .btn.green >> nth=0');
await page.waitForTimeout(500);
const m1 = await g(() => window.game.state.money);
console.log('claim normal: +', (m1 - m0).toFixed(2));
// double with the demo ad
await page.click('.ms-btns .btn.orange >> nth=0');
await page.waitForTimeout(7500);
await page.click('text=Claim reward ✓').catch((e) => console.log('no ad close btn', e.message));
await page.waitForTimeout(800);
const m2 = await g(() => window.game.state.money);
console.log('claim x2: +', (m2 - m1).toFixed(2), 'claimed', await g(() => window.game.state.missions.list.map((m) => m.claimed).join(',')));
await shot('ms_3_claimed');
await g(() => window.game.ui.closeAll());

// ---------- marketing
await g(() => window.game.app.open('store'));
await page.waitForTimeout(600);
await shot('mk_1_store');
const before = await g(() => window.game.state.marketing);
await page.click('.card.campaign >> nth=0 >> button');
await page.waitForTimeout(500);
console.log('marketing before', before, 'after', await g(() => window.game.state.marketing), 'campaigns', await g(() => JSON.stringify(window.game.state.campaigns)));
await page.click('.card.campaign >> nth=1 >> button');
await page.waitForTimeout(400);
console.log('marketing with two', await g(() => window.game.state.marketing));
await shot('mk_2_running');
await g(() => window.game.ui.closeAll());
// rate check
console.log('spawn rate per minute', await g(() => window.game.customers.rate?.().toFixed?.(3) ?? 'n/a'));
// next day: leaflets (1 day) expire, newspaper (2 days) stays; missions regenerate
await g(() => { const G = window.game; G.state.phase = 'night'; G.state.open = false; G.startNextDay(); });
await page.waitForTimeout(1500);
console.log('day', await g(() => window.game.state.day), 'marketing', await g(() => window.game.state.marketing), 'campaigns', await g(() => JSON.stringify(window.game.state.campaigns)));
console.log('new missions', await g(() => JSON.stringify({ day: window.game.state.missions.day, streak: window.game.state.missions.streak, kinds: window.game.state.missions.list.map((m) => m.kind) })));
// save / load roundtrip keeps missions + campaigns
await g(() => window.game.save('slot3'));
await page.waitForTimeout(400);
await g(async () => { const { readSave } = await import('/src/game/Save.ts'); const s = await readSave('slot3'); window.game.load(s); });
await page.waitForTimeout(600);
console.log('after load', await g(() => JSON.stringify({ m: window.game.state.missions.list.length, c: window.game.state.campaigns, mk: window.game.state.marketing })));
console.log(logs.slice(0, 30).join('\n') || 'no errors');
await browser.close();
