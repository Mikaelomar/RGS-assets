// Renders the app icon + splash screen with canvas in Chromium.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
const draw = async (kind, size) => page.evaluate(([kind, size]) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const S = size / 1024;
  if (kind === 'icon' || kind === 'fg') {
    if (kind === 'icon') {
      const g = x.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, '#ff5a4a'); g.addColorStop(1, '#c4161c');
      x.fillStyle = g; x.fillRect(0, 0, size, size);
    }
    const pad = kind === 'fg' ? 0.22 : 0.0;
    x.save();
    x.translate(size / 2, size / 2);
    x.scale(1 - pad, 1 - pad);
    x.translate(-size / 2, -size / 2);
    // awning
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      x.fillStyle = i % 2 ? '#ffffff' : '#ffd23f';
      x.beginPath();
      const x0 = (140 + i * 124) * S, x1 = (140 + (i + 1) * 124) * S;
      x.moveTo(x0, 250 * S); x.lineTo(x1, 250 * S); x.lineTo(x1, 380 * S);
      x.quadraticCurveTo((x0 + x1) / 2, 440 * S, x0, 380 * S); x.closePath(); x.fill();
    }
    x.fillStyle = '#ffffff';
    x.fillRect(120 * S, 220 * S, 784 * S, 40 * S);
    // cart
    x.strokeStyle = '#ffffff'; x.lineWidth = 46 * S; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(250 * S, 520 * S); x.lineTo(320 * S, 520 * S); x.lineTo(400 * S, 760 * S); x.lineTo(720 * S, 760 * S); x.lineTo(780 * S, 580 * S); x.lineTo(360 * S, 580 * S);
    x.stroke();
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(430 * S, 850 * S, 46 * S, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(690 * S, 850 * S, 46 * S, 0, Math.PI * 2); x.fill();
    // apples in cart
    const fruit = [[470, 560, '#3ccf5a'], [560, 545, '#ffd23f'], [650, 560, '#1c9bf0']];
    for (const [fx, fy, col] of fruit) { x.fillStyle = col; x.beginPath(); x.arc(fx * S, fy * S, 58 * S, 0, Math.PI * 2); x.fill(); }
    x.restore();
  } else if (kind === 'bg') {
    const g = x.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#ff5a4a'); g.addColorStop(1, '#c4161c');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
  } else {
    // splash
    const g = x.createRadialGradient(size / 2, size * 0.4, 0, size / 2, size / 2, size * 0.7);
    g.addColorStop(0, '#2f6fa3'); g.addColorStop(1, '#0c1d2c');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    x.textAlign = 'center';
    x.fillStyle = '#ffffff';
    x.font = `${size * 0.075}px Arial Black, sans-serif`;
    x.fillText('SUPERMARKET', size / 2, size * 0.49);
    x.fillStyle = '#ffd23f';
    x.font = `${size * 0.04}px Arial Black, sans-serif`;
    x.fillText('LIFE SIMULATOR', size / 2, size * 0.55);
  }
  return c.toDataURL('image/png').split(',')[1];
}, [kind, size]);
fs.writeFileSync('assets/icon-only.png', Buffer.from(await draw('icon', 1024), 'base64'));
fs.writeFileSync('assets/icon-foreground.png', Buffer.from(await draw('fg', 1024), 'base64'));
fs.writeFileSync('assets/icon-background.png', Buffer.from(await draw('bg', 1024), 'base64'));
fs.writeFileSync('assets/splash.png', Buffer.from(await draw('splash', 2732), 'base64'));
fs.writeFileSync('assets/splash-dark.png', Buffer.from(await draw('splash', 2732), 'base64'));
fs.writeFileSync('public/icon.png', Buffer.from(await draw('icon', 192), 'base64'));
await browser.close();
console.log('ok');
