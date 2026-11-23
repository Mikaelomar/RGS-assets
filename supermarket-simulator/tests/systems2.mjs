// staff, build mode, expansion, save/load
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 480 } });
const logs = [];
page.on('console', (m) => { if (!m.text().includes('GPU stall') && !m.text().includes('vite')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.click('text=NEW GAME'); await page.waitForTimeout(300); await page.click('input[type=checkbox]'); await page.click('text=OPEN MY SHOP'); await page.waitForTimeout(1500);
const g = (fn, arg) => page.evaluate(fn, arg);
// level up + money
await g(() => { const G = window.game; G.state.money = 50000; G.sim.addXP(3000); });
await page.waitForTimeout(800);
await page.screenshot({ path: 'tests/out/s_levelup.png' });
console.log('level', await g(() => window.game.state.level));
await g(() => window.game.ui.closeAll()); await page.waitForTimeout(300); await g(() => window.game.ui.closeAll());
// unlock storage, office, breakroom via direct state changes + rebuild
await g(() => { const G = window.game; G.state.rooms.push('storage', 'office', 'corridor', 'breakroom', 'lockers'); G.rebuildStore(); });
// expansion 1 & 2
await g(() => { const G = window.game; for (const i of [0,1]) for (const [c, r] of [[0,1],[1,1],[2,0],[2,1]]) if (!G.state.plots.includes(`${c},${r}`)) G.state.plots.push(`${c},${r}`); G.rebuildStore(); });
await g(() => { const G = window.game; G.player.pos.set(14, 0, -2); G.player.yaw = 2.6; G.player.pitch = -0.1; });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'tests/out/s_expanded.png' });
// hire a stocker and a cashier
await g(() => { const G = window.game; const c1 = G.staff.makeCandidate('stocker'); c1.shiftStart = 6; c1.shiftEnd = 23; G.state.candidates.push(c1); G.staff.hire(c1); const c2 = G.staff.makeCandidate('cashier'); G.state.candidates.push(c2); G.staff.hire(c2); const s2 = G.staff.list[1].s; s2.shiftStart = 6; s2.shiftEnd = 23; G.staff.list[0].s.shiftStart = 6; G.staff.list[0].s.shiftEnd = 23; });
// assign products to shelves (reserved, empty) and put boxes in storage
await g(() => { const G = window.game; for (const ref of G.shelves.refs.values()) { if (ref.slot.def.kind === 'shelf' && ref.f.def.cat !== 'fixed') { G.shelves.place(ref, 'cereal', 1, 0); } }
  G.addBoxState({ uid: 70001, pid: 'cereal', count: 12, exp: 0, x: -3, y: 0.02, z: -6, ry: 0, kind: 'box' });
  G.addBoxState({ uid: 70002, pid: 'cereal', count: 12, exp: 0, x: -4, y: 0.02, z: -6, ry: 0, kind: 'box' });
  G.timeScale = 6; G.sim.openStore(); });
for (let i = 0; i < 12; i++) { await page.waitForTimeout(1500); console.log('staff:', await g(() => window.game.staff.list.map(e => `${e.s.role}:${e.status}:${e.task?.kind ?? '-'}${e.task ? ':' + e.task.step : ''}`).join(' | ')), 'cereal on shelves', await g(() => window.game.shelves.shelfCount('cereal'))); }
await g(() => { const G = window.game; const e = G.staff.list[0]; if (e.agent) { G.player.pos.set(e.agent.pos.x + 2.5, 0, e.agent.pos.z + 1.5); G.player.yaw = Math.atan2(2.5, 1.5); G.player.pitch = -0.1; } });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'tests/out/s_staff.png' });
// furniture assembly via build mode
await g(() => { const G = window.game; G.timeScale = 1; G.spawnCarry({ kind: 'furniture', furn: 'gondola' }); G.player.pos.set(12, 0, -10); G.player.yaw = 0; G.player.pitch = -0.6; });
await page.waitForTimeout(500);
await g(() => { const G = window.game; G.build.startAssemble(G.carry, new window.game.player.pos.constructor(12, 0, -12.5)); });
await page.waitForTimeout(800);
await page.screenshot({ path: 'tests/out/s_build.png' });
await g(() => window.game.build.confirm());
await page.waitForTimeout(500);
console.log('gondolas', await g(() => window.game.furniture.byDef('gondola').length), 'mode', await g(() => window.game.mode));
// save & load roundtrip
await g(() => window.game.save('slot1'));
await page.waitForTimeout(500);
const before = await g(() => JSON.stringify({ f: window.game.state.furniture.length, b: window.game.state.boxes.length, e: window.game.state.employees.length, m: window.game.state.money, lvl: window.game.state.level }));
await g(async () => { const { readSave } = await import('/src/game/Save.ts'); const s = await readSave('slot1'); window.game.load(s); });
await page.waitForTimeout(800);
const after = await g(() => JSON.stringify({ f: window.game.state.furniture.length, b: window.game.state.boxes.length, e: window.game.state.employees.length, m: window.game.state.money, lvl: window.game.state.level }));
console.log('save before', before, 'after', after);
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
