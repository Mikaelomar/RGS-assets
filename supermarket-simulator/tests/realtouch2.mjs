// Real hit-tested touches for the whole UI: buttons, side buttons, pills, windows, checkout taps, tutorial.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/?fixedres&season=none';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const cdp = await ctx.newCDPSession(page);
const tstart = (x, y, id = 1) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
const tmove = (x, y, id = 1) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id }] });
const tend = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const tapAt = async (x, y, hold = 60) => { await tstart(x, y); await page.waitForTimeout(hold); await tend(); };
const center = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return b ? [b.x + b.width / 2, b.y + b.height / 2] : null; };
const g = (fn, arg) => page.evaluate(fn, arg);
const ok = (name, cond) => console.log(cond ? 'PASS' : 'FAIL', name);
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
await page.waitForTimeout(600);
// title footer link + buttons
let c = await center('.title-foot span:text-is("How to play")');
await tapAt(...c); await page.waitForTimeout(400);
ok('title "How to play" link opens a window', await g(() => !!document.querySelector('.overlay .window')));
c = await center('.overlay .wclose'); await tapAt(...c); await page.waitForTimeout(300);
ok('window closes with ✕', await g(() => !document.querySelector('.overlay')));
c = await center('text=NEW GAME'); await tapAt(...c); await page.waitForTimeout(400);
ok('NEW GAME opens the new game window', await g(() => !!document.querySelector('.overlay')));
c = await center('text=OPEN MY SHOP'); await tapAt(...c); await page.waitForTimeout(2500);
ok('game started with tutorial', await g(() => window.game.mode === 'walk' && window.game.state.tutorial === 0));
// tutorial step 1: look around with a drag on the right side
await tstart(640, 200);
for (let i = 1; i <= 25; i++) { await tmove(640 - i * 12, 200); await page.waitForTimeout(25); }
await tend(); await page.waitForTimeout(800);
ok('tutorial look step completed by a real drag', await g(() => window.game.state.tutorial >= 1));
// joystick walk
const p0 = await g(() => [window.game.player.pos.x, window.game.player.pos.z]);
await tstart(110, 300);
for (let i = 1; i <= 8; i++) { await tmove(110, 300 - i * 8); await page.waitForTimeout(30); }
await page.waitForTimeout(1500); await tend();
const p1 = await g(() => [window.game.player.pos.x, window.game.player.pos.z]);
ok('joystick walks', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1);
// skip tutorial for the rest
await g(() => { window.game.tutorial.skip(); window.game.ui.closeAll(); });
await page.waitForTimeout(300);
// gear pill -> pause menu -> resume
c = await center('.pill.gear'); if (!c) console.log('no gear pill; overlays:', await g(() => document.querySelectorAll('.overlay').length), await g(() => document.querySelector('.wtitle')?.textContent)); await tapAt(...c); await page.waitForTimeout(400);
ok('gear opens the pause menu', await g(() => !!document.querySelector('.overlay')));
c = await center('text=RESUME'); if (c) await tapAt(...c); await page.waitForTimeout(300);
ok('RESUME closes it', await g(() => !document.querySelector('.overlay')));
// phone side button -> manager app, scroll the product list with a finger, close
c = await center('.sidebtn:has-text("📱")'); await tapAt(...c); await page.waitForTimeout(500);
ok('phone button opens the manager app', await g(() => !!document.querySelector('.overlay .window')));
const sc0 = await g(() => document.querySelector('.window .scroll')?.scrollTop ?? -1);
c = await center('.window .scroll');
if (c) { await tstart(c[0], c[1] + 60); for (let i = 1; i <= 10; i++) { await tmove(c[0], c[1] + 60 - i * 14); await page.waitForTimeout(20); } await tend(); }
await page.waitForTimeout(400);
const sc1 = await g(() => document.querySelector('.window .scroll')?.scrollTop ?? -1);
ok('product list scrolls with a finger', sc1 > sc0);
c = await center('.overlay .wclose'); await tapAt(...c); await page.waitForTimeout(300);
ok('manager app closes', await g(() => !document.querySelector('.overlay')));
// hand button picks up a box we look at
await g(() => { const G = window.game; G.addBoxState({ uid: 99001, pid: 'cereal', count: 12, exp: 0, x: 6, y: 0.02, z: -4, ry: 0, kind: 'box' }); G.player.pos.set(6, 0, -2.6); G.player.yaw = 0; G.player.pitch = -0.75; });
await page.waitForTimeout(1200);
c = await center('.btn-round.main'); await tapAt(...c, 120); await page.waitForTimeout(500);
ok('hand button picks up the box', await g(() => window.game.carry?.s.uid === 99001));
c = await center('.btn-round.drop'); if (c) await tapAt(...c, 120); await page.waitForTimeout(500);
ok('drop button puts it down', await g(() => !window.game.carry));
// checkout: tap belt items on the 3D view to scan them
await g(() => {
  const G = window.game;
  for (const ref of G.shelves.refs.values()) { if (ref.f.def.cat === 'fixed') continue; const pid = ref.slot.def.kind === 'produce' ? 'apple' : ref.slot.def.kind === 'shelf' ? 'cereal' : null; if (pid) G.shelves.place(ref, pid, 20, 0); }
  G.sim.openStore(); G.timeScale = 6;
  const f0 = [...G.furniture.items.values()].find((f) => f.def.id === 'checkout');
  const cu = G.customers.spawn(true); cu.pay = 'card'; cu.list = []; cu.basket = [{ pid: 'cereal', exp: 0, price: 2.49 }, { pid: 'apple', exp: 0, price: 0.59 }, { pid: 'cereal', exp: 0, price: 2.49 }];
  const q = G.furniture.local(f0, -0.7, 0, 0.85); cu.agent.pos.set(q.x, 0, q.z); G.customers.goToCheckout(cu);
  const f = [...G.furniture.items.values()].find((f) => f.def.id === 'checkout'); G.checkout.enter(f);
});
let phase = '';
for (let i = 0; i < 40; i++) { await page.waitForTimeout(800); phase = await g(() => [...window.game.checkout.counters.values()].find((c) => !c.self)?.phase); if (phase === 'scan') break; }
await g(() => { window.game.timeScale = 1; });
ok('a customer reached the belt', phase === 'scan');
for (let k = 0; k < 20; k++) {
  const pt = await g(() => { const G = window.game; const c = [...G.checkout.counters.values()].find((c) => !c.self); const it = c.items.find((i) => !i.scanned); if (!it) return null; const v = it.mesh.position.clone(); v.y += 0.05; v.project(G.engine.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; });
  if (!pt) break;
  // the software renderer draws this view at ~1 fps, so a CDP touchstart/touchend pair would look like a 1 s hold;
  // check that the 3D view is the element under the finger, then tap there in one go
  await g(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    if (!el || el.id !== 'game-canvas') { window.__notCanvas = (window.__notCanvas ?? 0) + 1; return; }
    const t = new Touch({ identifier: 42, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t], bubbles: true, cancelable: true }));
  }, pt);
  await page.waitForTimeout(600);
}
console.log('belt taps blocked by an overlay:', await g(() => window.__notCanvas ?? 0));
const scan = await g(() => { const c = [...window.game.checkout.counters.values()].find((c) => !c.self); return { phase: c.phase, left: c.items.filter((i) => !i.scanned).length, pay: c.serving?.pay }; });
ok('belt items scanned by tapping the 3D view', scan.left === 0);
if (scan.pay === 'card') {
  const total = await g(() => [...window.game.checkout.counters.values()].find((c) => !c.self).scannedTotal);
  for (const d of String(Math.round(total * 100))) { c = await center(`.pospad .keys button:text-is("${d}")`); await tapAt(...c); await page.waitForTimeout(80); }
  c = await center('.pospad .keys button.ok'); await tapAt(...c); await page.waitForTimeout(600);
  ok('card terminal keys work by touch', await g(() => window.game.state.today.served >= 1));
} else console.log('(cash customer: pay step skipped)');
c = await center('.co-leave'); await tapAt(...c); await page.waitForTimeout(400);
ok('LEAVE button leaves the checkout', await g(() => window.game.mode === 'walk'));
await page.screenshot({ path: 'tests/out/rt2_end.png' });
console.log(logs.join('\n') || 'no errors');
await browser.close();
