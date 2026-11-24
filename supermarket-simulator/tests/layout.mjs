// Layout audit: every main screen at several viewport sizes, checking that UI pieces do not overlap
// each other and stay on screen. Run: node tests/layout.mjs [WxH ...]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const sizes = (process.argv.slice(2).length ? process.argv.slice(2) : ['730x304', '640x280', '844x390', '412x892', '1000x500']).map((s) => s.split('x').map(Number));
const browser = await browser0();
async function browser0() { return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); }

const SEL = [
  '.statusbar > *', '.topbar > *', '.sidebtns > .sidebtn', '.hint .bubble', '.hint .avatar', '.prompt',
  '.actions > .btn-round', '.btn-round.main .lbl', '.co-screen', '.co-help', '.co-leave', '.pospad', '.drawer', '.co-return',
  '.checkout-ui .btn', '.title-card', '.title-btns .btn', '.window', '.window .wclose',
];

async function audit(page, w, h, scene) {
  return page.evaluate(([SEL, w, h]) => {
    const vis = (el) => {
      if (!el.isConnected) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      let e = el;
      while (e && e !== document.body) { const c = getComputedStyle(e); if (c.display === 'none' || parseFloat(c.opacity) < 0.1) return false; e = e.parentElement; }
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    };
    const items = [];
    for (const s of SEL) for (const el of document.querySelectorAll(s)) if (vis(el)) items.push({ el, s, r: el.getBoundingClientRect() });
    const name = (it) => `${it.s}${it.el.textContent ? '[' + it.el.textContent.trim().slice(0, 14) + ']' : ''}`;
    const issues = [];
    // a modal window covers the HUD on purpose: only check the window itself then
    const win = items.find((it) => it.s === '.window');
    const pool = win ? items.filter((it) => it.s === '.window' || it.s === '.window .wclose') : items;
    for (const it of pool) {
      const r = it.r;
      if (r.left < -1 || r.top < -1 || r.right > w + 1 || r.bottom > h + 1) issues.push(`off-screen ${name(it)} (${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)})`);
    }
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i], b = pool[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 3 && oy > 3) issues.push(`overlap ${name(a)} / ${name(b)} (${Math.round(ox)}x${Math.round(oy)})`);
    }
    // window body must scroll instead of clipping, title close button reachable
    if (win) {
      const body = win.el.querySelector('.wbody');
      if (body && body.scrollHeight > body.clientHeight + 2 && getComputedStyle(body).overflowY === 'hidden' && !body.classList.contains('nopad')) issues.push('window body clipped (no scroll)');
    }
    return issues;
  }, [SEL, w, h]);
}

const report = [];
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shotName = (scene) => `tests/out/lay_${w}x${h}_${scene}.png`;
  const check = async (scene, opts = {}) => {
    await page.waitForTimeout(opts.wait ?? 700);
    const issues = await audit(page, w, h, scene);
    report.push(`${w}x${h} ${scene}: ${issues.length ? '\n    ' + issues.join('\n    ') : 'ok'}`);
    if (opts.shot !== false) await page.screenshot({ path: shotName(scene) });
  };
  await page.goto('http://localhost:5173/?fixedres&season=none', { waitUntil: 'load' });
  await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 90000 });
  await g(() => { try { localStorage.clear(); } catch {} });
  await check('title', { wait: 1500 });
  await g(() => [...document.querySelectorAll('.title-btns .btn')].find((b) => b.textContent.includes('NEW GAME'))?.click());
  await check('newgame-dialog');
  await g(() => [...document.querySelectorAll('.overlay .btn')].find((b) => b.textContent.includes('OPEN MY SHOP'))?.click());
  await page.waitForTimeout(2500);
  await check('walk-tutorial');
  // after the tutorial: missions button, money, a held box and the mop
  await g(() => { const G = window.game; G.tutorial.skip(); G.ui.closeAll(); G.state.money = 25000; G.sim.addXP(400); });
  await page.waitForTimeout(400);
  await g(() => window.game.ui.closeAll());
  await g(() => { const G = window.game; G.player.setTool('mop'); G.actions.hasMop = true; G.spawnCarry({ kind: 'box', pid: 'cereal', count: 12, exp: 0 }); G.ui.hud.setHint('🧹', 'There is a spill on the floor. Take the mop and clean it up before someone slips.', ''); });
  await check('walk-carry');
  await g(() => { const G = window.game; G.destroyCarry?.(); });
  // checkout: scan phase
  await g(() => {
    const G = window.game; G.sim.openStore();
    for (const ref of G.shelves.refs.values()) { if (ref.f.def.cat === 'fixed') continue; const pid = ref.slot.def.kind === 'produce' ? 'apple' : ref.slot.def.kind === 'shelf' ? 'cereal' : null; if (pid) G.shelves.place(ref, pid, 20, 0); }
    const f0 = [...G.furniture.items.values()].find((f) => f.def.id === 'checkout');
    const cu = G.customers.spawn(true); cu.returnPid = null; cu.pay = 'card'; cu.list = []; cu.basket = [{ pid: 'cereal', exp: 0, price: 2.49 }, { pid: 'apple', exp: 0, price: 0.59 }, { pid: 'cereal', exp: 0, price: 2.49 }];
    const q = G.furniture.local(f0, -0.7, 0, 0.85); cu.agent.pos.set(q.x, 0, q.z); G.customers.goToCheckout(cu);
    G.timeScale = 6; G.checkout.enter(f0);
  });
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(700); if (await g(() => [...window.game.checkout.counters.values()].find((c) => !c.self)?.phase === 'scan')) break; }
  await g(() => { window.game.timeScale = 1; });
  await check('checkout-scan');
  // pay with card
  await g(() => { const G = window.game; const c = [...G.checkout.counters.values()].find((c) => !c.self); for (const it of c.items) if (!it.scanned) G.checkout.scan(c, it); });
  await check('checkout-card', { wait: 1200 });
  // cash drawer for the same customer (switch payment)
  await g(() => { const G = window.game; const c = [...G.checkout.counters.values()].find((c) => !c.self); G.checkout.closePad(); c.serving.pay = 'cash'; c.cashGiven = 20; G.checkout.openDrawer(); });
  await check('checkout-cash');
  await g(() => { const G = window.game; G.checkout.closeDrawer(); G.checkout.leave(); });
  // build mode
  await g(() => { const G = window.game; G.spawnCarry({ kind: 'furniture', furn: 'gondola' }); G.player.pos.set(12, 0, -5); G.player.yaw = 0; G.player.pitch = -0.55; G.build.startAssemble(G.carry, new G.player.pos.constructor(12, 0, -7.5)); });
  await check('build');
  await g(() => window.game.build.cancel());
  // windows
  await g(() => window.game.app.open('market'));
  await check('app-market');
  await g(() => window.game.app.open('store'));
  await check('app-store');
  await g(() => window.game.app.open('finance'));
  await check('app-finance');
  await g(() => window.game.ui.closeAll());
  await g(() => window.game.missions.open());
  await check('missions');
  await g(() => window.game.ui.closeAll());
  await g(() => window.game.onPauseMenu());
  await check('pause');
  await g(() => window.game.ui.closeAll());
  await g(() => window.game.dialogs.seasonWelcome());
  await check('season-dialog');
  await g(() => window.game.ui.closeAll());
  // forklift
  await g(() => { const G = window.game; G.state.level = 30; G.state.rooms.push('storage'); G.rebuildStore(); G.state.money = 20000; G.buyUpgrade('forklift'); const s = G.state.forklift; G.player.pos.set(s.x, 0, s.z + 2); G.forklift.enter(); });
  await check('forklift', { wait: 1200 });
  await g(() => window.game.forklift.exit());
  report.push(errors.length ? `  page errors: ${[...new Set(errors)].join(' | ')}` : '');
  await ctx.close();
}
console.log(report.filter(Boolean).join('\n'));
await browser.close();
