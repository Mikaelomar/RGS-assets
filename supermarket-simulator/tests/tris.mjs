import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.goto('http://localhost:5173/?gallery', { waitUntil: 'load' });
await page.waitForTimeout(4000);
const res = await page.evaluate(async () => {
  const { PRODUCTS } = await import('/src/data/products.ts');
  const { productGeometry } = await import('/src/gfx/ProductMeshes.ts');
  const { Human, randomLook } = await import('/src/gfx/Human.ts');
  const out = PRODUCTS.map(p => [p.id, productGeometry(p.id).index.count / 3]).sort((a, b) => b[1] - a[1]);
  const hm = new Human(randomLook(5));
  return { top: out.slice(0, 15), avg: out.reduce((a, b) => a + b[1], 0) / out.length, human: hm.mesh.geometry.index.count / 3 };
});
console.log(JSON.stringify(res));
await browser.close();
