// Usage: node tests/shot.mjs <url> <out.png> [waitMs] [width] [height]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [, , url, out, waitMs = '4000', w = '1280', h = '720'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: out });
console.log(logs.slice(0, 60).join('\n'));
await browser.close();
