// portrait phone layout (web version held upright) + folding the task card by tapping the manager's face
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
for (const [w, hgt, tag] of [[412, 892, 'portrait'], [844, 390, 'landscape']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  const tap = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await page.waitForTimeout(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  await page.goto('http://localhost:5173/?fixedres&season=none', { waitUntil: 'load' });
  await page.waitForFunction(() => window.game && document.querySelector('.title-screen'), null, { timeout: 60000 });
  await page.evaluate(() => { try { localStorage.removeItem('sm_hint_collapsed'); } catch {} });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `tests/out/pt_${tag}_title.png` });
  await page.tap('text=NEW GAME'); await page.waitForTimeout(400); await page.tap('text=OPEN MY SHOP'); await page.waitForTimeout(2500);
  await page.screenshot({ path: `tests/out/pt_${tag}_game.png` });
  // overlap check of the top HUD pieces
  const boxes = await page.evaluate(() => [...document.querySelectorAll('.statusbar > *, .topbar > *, .hint .bubble, .hint .avatar, .sidebtns > .sidebtn')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { c: e.className.split(' ')[0] || e.tagName, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }));
  const overl = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1) overl.push(a.c + '/' + b.c); }
  const off = boxes.filter((b) => b.x0 < -1 || b.x1 > w + 1).map((b) => b.c);
  console.log(tag, 'overlaps:', overl.join(', ') || 'none', '| off-screen:', off.join(', ') || 'none', '| card height:', Math.round((boxes.find((b) => b.c === 'bubble')?.y1 ?? 0) - (boxes.find((b) => b.c === 'bubble')?.y0 ?? 0)));
  // fold / unfold the task card
  const av = await page.locator('.hint .avatar').boundingBox();
  await tap(av.x + av.width / 2, av.y + av.height / 2); await page.waitForTimeout(500);
  const folded = await page.evaluate(() => document.querySelector('.hint').classList.contains('collapsed') && getComputedStyle(document.querySelector('.hint .bubble')).display === 'none');
  await page.screenshot({ path: `tests/out/pt_${tag}_folded.png` });
  const yaw0 = await page.evaluate(() => window.game.player.yaw);
  await tap(av.x + av.width / 2, av.y + av.height / 2); await page.waitForTimeout(500);
  const unfolded = await page.evaluate(() => !document.querySelector('.hint').classList.contains('collapsed'));
  const yaw1 = await page.evaluate(() => window.game.player.yaw);
  console.log(tag, 'fold by tapping the face:', folded, '| unfold:', unfolded, '| camera untouched by the taps:', Math.abs(yaw1 - yaw0) < 1e-6);
  await ctx.close();
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
