// Soak test: busy store with all systems for a whole fast-forwarded day. Reports runtime errors.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [, , secs = '150'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`); });
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('input[type=checkbox]'); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
await g(() => {
  const G = window.game, S = G.state;
  S.money = 200000; S.level = 26; S.reputation = 4.2;
  S.licenses = ['produce','pantry','snacks','drinks','bakery','dairy','frozen','household','personal','meat','fish'];
  S.rooms = ['storage','office','corridor','breakroom','lockers','staffwc','electrical','trashroom','custwc'];
  S.upgrades.push('palletjack','express','loadingdock','music','flyers','scrubber','led');
  for (const k of ['0,1','1,1','2,0','2,1','3,0','3,1','0,2','1,2','2,2','3,2']) if (!S.plots.includes(k)) S.plots.push(k);
  G.rebuildStore();
  const add = (id, x, z, ry) => G.addFurniture(G.newFurnitureState(id, x, z, ry));
  for (let i = 0; i < 4; i++) add('gondola', 4 + i * 3.6, -11.5, 0);
  for (let i = 0; i < 3; i++) add('gondola', 4 + i * 3.6, -16.5, 0);
  for (let i = 0; i < 4; i++) add('fridge_2', 3 + i * 1.7, -23.5, 0);
  add('freezer_chest', 18, -13, 0); add('freezer_glass', 26, -23.5, 0);
  add('produce_table', 22, -6, 0); add('bread_rack', 27, -9, 0); add('meat_counter', 20, -20, 0); add('fish_counter', 24, -18, 0);
  add('checkout', 4.0, -5.5, -Math.PI / 2); add('self_checkout', 20.5, -2.0, Math.PI);
  add('trash_bin', 18, -4, 0); add('recycle_bin', 29.5, -2.0, 0); add('bakery_oven', 30.5, -14, -Math.PI / 2);
  add('rack', -4, -9.5, 0); add('rack', -4, -6, 0);
  add('basket_stand', 10, -1.0, 0); add('plant_decor', 15.2, -0.8, 0);
  // stock
  const { PRODUCTS } = window.__products || {};
  let k = 0;
  for (const ref of G.shelves.refs.values()) {
    if (ref.f.def.cat === 'fixed') continue;
    const list = [...G.app.constructor ? [] : []];
    const kind = ref.slot.def.kind;
    const cands = window.__allProducts.filter(p => p.display.includes(kind) && p.level <= 26 && S.licenses.includes(p.category));
    if (!cands.length) continue;
    const p = cands[k++ % cands.length];
    G.shelves.place(ref, p.id, 20, p.shelfLife ? S.day + p.shelfLife : 0);
  }
  // boxes on racks for restocking
  let uid = 80000;
  for (const pid of ['cereal','pasta','chips','milk','cola','water','bread','apple']) {
    const p = window.__allProducts.find(x => x.id === pid);
    const rt = G.addBoxState({ uid: uid++, pid, count: p.perBox, exp: p.shelfLife ? S.day + p.shelfLife : 0, x: -6, y: 0.02, z: -3, ry: 0, kind: 'box' });
    const spot = G.findRackSpot(rt.pos);
    if (spot) G.putOnRack(rt, spot.f, spot.spot);
  }
  // staff
  for (const role of ['cashier','cashier','stocker','cleaner','warehouse','security','technician','baker','butcher']) {
    const c = G.staff.makeCandidate(role); S.candidates.push(c); G.staff.hire(c);
  }
  for (const e of G.staff.list) { e.s.shiftStart = 7; e.s.shiftEnd = 23; }
  G.timeScale = 10;
  G.sim.openStore();
  G.player.pos.set(12, 0, -8); G.player.yaw = Math.PI; G.player.pitch = -0.1;
}).catch(e => errors.push('setup: ' + e.message));
const t0 = Date.now();
let phase = 0;
while ((Date.now() - t0) / 1000 < +secs) {
  await page.waitForTimeout(5000);
  const st = await g(() => { const G = window.game, S = G.state; return { t: Math.round(S.minutes), open: S.open, phase: S.phase, cust: G.customers.list.filter(c => c.shopper).length, served: S.today.served, rev: S.today.revenue, money: Math.round(S.money), staff: G.staff.list.map(e => e.status[0] + (e.task ? e.task.kind[0] : '')).join(''), states: Object.entries(G.customers.list.filter(c=>c.shopper).reduce((a,c)=>{a[c.state]=(a[c.state]||0)+1;return a;},{})).map(([k,v])=>k+v).join(' '), counters: [...G.checkout.counters.values()].map(c => `${c.self?'S':'C'}:${c.phase}:q${c.queue.length}:${c.cashier!==null?'cash':''}${G.checkout.isStaffed(c)?'+':'-'}`).join(' '), boxes: G.boxes.items.size, spills: S.spills.length, outage: G.power.outage, lvl: S.level, dirt: G.cleaning.cleanliness().toFixed(2) }; });
  console.log(JSON.stringify(st));
  if (phase === 0 && st.t > 11 * 60) { phase = 1; await g(() => { const G = window.game; const f = G.furniture.byDef('fridge_2')[0]; G.power.breakDown(f); G.cleaning.addSpill(12, -9, 'milk'); }); }
  if (phase === 1 && st.t > 13 * 60) { phase = 2; await g(() => { const G = window.game; G.power.startOutage(30); }); }
  if (phase === 2 && st.t > 15 * 60) { phase = 3; await g(() => { const G = window.game; G.orders.place([{ pid: 'cola', qty: 2 }, { pid: 'milk', qty: 2 }, { fid: 'shelf_wall', qty: 1 }], true); }); }
  if (st.phase === 'night' && phase < 9) { phase = 9; break; }
}
await page.screenshot({ path: 'tests/out/soak_1.png' });
// end the day
await g(() => window.game.requestEndDay(true));
await page.waitForTimeout(2000);
await page.screenshot({ path: 'tests/out/soak_2_summary.png' });
await g(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('START DAY')); btn && btn.click(); });
await page.waitForTimeout(6000);
console.log('next day', await g(() => JSON.stringify({ day: window.game.state.day, phase: window.game.state.phase, money: Math.round(window.game.state.money), weather: window.game.state.weather })));
await page.screenshot({ path: 'tests/out/soak_3_nextday.png' });
console.log('ERRORS:', errors.length);
console.log([...new Set(errors)].slice(0, 15).join('\n'));
await browser.close();
