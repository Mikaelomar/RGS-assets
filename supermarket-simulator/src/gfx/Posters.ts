// Decorative roll-up banner posters (unlock as the store levels up). All designs are original.
import * as THREE from 'three';
import { makeCanvas } from './Textures';
import { ICONS } from './ProductArt';

export interface PosterDef { id: string; title: string; level: number; price: number; beauty: number; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void; }

const DISPLAY = "'Lilita One', 'Arial Black', sans-serif";

function bg(c: CanvasRenderingContext2D, w: number, h: number, a: string, b: string) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}
function text(c: CanvasRenderingContext2D, t: string, x: number, y: number, size: number, color: string, stroke?: string, maxW = 460) {
  let s = size;
  c.font = `${s}px ${DISPLAY}`;
  while (c.measureText(t).width > maxW && s > 10) {
    s *= 0.92;
    c.font = `${s}px ${DISPLAY}`;
  }
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (stroke) {
    c.lineWidth = s * 0.14;
    c.strokeStyle = stroke;
    c.strokeText(t, x, y);
  }
  c.fillStyle = color;
  c.fillText(t, x, y);
}
function rays(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, n = 16) {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = a0 + Math.PI / n;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
    c.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r);
    c.fill();
  }
}

export const POSTERS: PosterDef[] = [
  { id: 'grand', title: 'Grand Opening', level: 3, price: 60, beauty: 1, draw: (c, w, h) => {
    bg(c, w, h, '#d32f2f', '#7f0000');
    rays(c, w / 2, h * 0.42, w, 'rgba(255,210,63,0.18)');
    text(c, 'GRAND', w / 2, h * 0.2, 120, '#ffd23f', '#5a0000');
    text(c, 'OPENING', w / 2, h * 0.32, 110, '#ffffff', '#5a0000');
    ICONS.star(c, w / 2, h * 0.55, 260);
    text(c, 'Welcome to your new', w / 2, h * 0.78, 40, '#ffffff');
    text(c, 'neighborhood store!', w / 2, h * 0.83, 40, '#ffffff');
  } },
  { id: 'fresh', title: 'Fresh Fruit Daily', level: 5, price: 80, beauty: 1, draw: (c, w, h) => {
    bg(c, w, h, '#7cc242', '#2e7d32');
    text(c, 'FRESH', w / 2, h * 0.14, 130, '#ffffff', '#1b5e20');
    text(c, 'FRUIT', w / 2, h * 0.26, 130, '#ffd23f', '#1b5e20');
    ICONS.apple(c, w * 0.3, h * 0.47, 200);
    ICONS.orange(c, w * 0.7, h * 0.47, 200);
    ICONS.banana(c, w * 0.5, h * 0.63, 230);
    text(c, 'EVERY DAY', w / 2, h * 0.85, 80, '#ffffff', '#1b5e20');
  } },
  { id: 'sale', title: 'Big Sale', level: 10, price: 120, beauty: 2, draw: (c, w, h) => {
    bg(c, w, h, '#ffd23f', '#ff9d1c');
    rays(c, w / 2, h * 0.45, w, 'rgba(255,255,255,0.35)', 20);
    text(c, 'BIG', w / 2, h * 0.16, 140, '#d32f2f', '#ffffff');
    text(c, 'SALE', w / 2, h * 0.3, 160, '#d32f2f', '#ffffff');
    c.fillStyle = '#d32f2f';
    c.beginPath();
    c.arc(w / 2, h * 0.56, 150, 0, Math.PI * 2);
    c.fill();
    text(c, '-50%', w / 2, h * 0.56, 120, '#ffffff');
    text(c, 'on selected items', w / 2, h * 0.82, 44, '#5a2d00');
  } },
  { id: 'bbq', title: 'Summer BBQ', level: 18, price: 160, beauty: 2, draw: (c, w, h) => {
    bg(c, w, h, '#ff7043', '#4e1a0a');
    ICONS.sun(c, w * 0.75, h * 0.14, 200);
    text(c, 'SUMMER', w / 2, h * 0.32, 110, '#ffd23f', '#3e1200');
    text(c, 'BBQ', w / 2, h * 0.45, 170, '#ffffff', '#3e1200');
    ICONS.sausage(c, w * 0.5, h * 0.66, 260);
    ICONS.flame(c, w * 0.5, h * 0.78, 140);
    text(c, 'Grill season is here!', w / 2, h * 0.92, 42, '#ffffff');
  } },
  { id: 'icecream', title: 'Ice Cream Time', level: 25, price: 220, beauty: 2, draw: (c, w, h) => {
    bg(c, w, h, '#81d4fa', '#e1f5fe');
    text(c, 'COOL', w / 2, h * 0.14, 140, '#ffffff', '#0277bd');
    text(c, 'OFF!', w / 2, h * 0.27, 140, '#f48fb1', '#0277bd');
    ICONS.icecream(c, w / 2, h * 0.55, 360);
    text(c, 'ICE CREAM', w / 2, h * 0.84, 90, '#0277bd');
  } },
  { id: 'movie', title: 'Space Rangers Movie', level: 35, price: 300, beauty: 2, draw: (c, w, h) => {
    bg(c, w, h, '#0b1026', '#3a1d6e');
    for (let i = 0; i < 120; i++) {
      c.fillStyle = `rgba(255,255,255,${Math.random()})`;
      c.fillRect(Math.random() * w, Math.random() * h * 0.6, 2, 2);
    }
    c.fillStyle = '#ffb300';
    c.beginPath();
    c.arc(w * 0.72, h * 0.22, 90, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 8;
    c.beginPath();
    c.ellipse(w * 0.72, h * 0.22, 150, 30, -0.3, 0, Math.PI * 2);
    c.stroke();
    // rocket
    c.fillStyle = '#eceff1';
    c.beginPath();
    c.moveTo(w * 0.35, h * 0.22); c.lineTo(w * 0.45, h * 0.42); c.lineTo(w * 0.25, h * 0.42); c.closePath();
    c.fill();
    c.fillRect(w * 0.27, h * 0.42, w * 0.16, h * 0.14);
    ICONS.flame(c, w * 0.35, h * 0.61, 120);
    text(c, 'SPACE', w / 2, h * 0.72, 120, '#ffd23f', '#1a0a3a');
    text(c, 'RANGERS', w / 2, h * 0.82, 100, '#ffffff', '#1a0a3a');
    text(c, 'IN CINEMAS NOW', w / 2, h * 0.92, 40, '#b39ddb');
  } },
  { id: 'coffee', title: 'Morning Coffee', level: 50, price: 400, beauty: 2, draw: (c, w, h) => {
    bg(c, w, h, '#6d4c41', '#2b1a12');
    text(c, 'MORNING', w / 2, h * 0.15, 110, '#ffe0b2', '#1b0f0a');
    text(c, 'COFFEE', w / 2, h * 0.27, 130, '#ffffff', '#1b0f0a');
    ICONS.cup(c, w * 0.5, h * 0.52, 320);
    ICONS.coffee(c, w * 0.5, h * 0.52, 120);
    text(c, 'only $1.99', w / 2, h * 0.82, 90, '#ffd23f', '#1b0f0a');
  } },
  { id: 'spooky', title: 'Spooky Sweets', level: 75, price: 600, beauty: 3, draw: (c, w, h) => {
    bg(c, w, h, '#ff6f00', '#1a0a00');
    c.fillStyle = '#ff8f00';
    c.beginPath();
    c.ellipse(w / 2, h * 0.48, 170, 150, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1a0a00';
    c.beginPath(); c.moveTo(w * 0.36, h * 0.42); c.lineTo(w * 0.44, h * 0.46); c.lineTo(w * 0.36, h * 0.5); c.fill();
    c.beginPath(); c.moveTo(w * 0.64, h * 0.42); c.lineTo(w * 0.56, h * 0.46); c.lineTo(w * 0.64, h * 0.5); c.fill();
    c.fillRect(w * 0.38, h * 0.55, w * 0.24, 22);
    text(c, 'SPOOKY', w / 2, h * 0.15, 120, '#ffffff', '#000000');
    text(c, 'SWEETS', w / 2, h * 0.27, 120, '#ffd23f', '#000000');
    ICONS.candy(c, w * 0.5, h * 0.8, 260);
  } },
  { id: 'winter', title: 'Winter Wonderland', level: 100, price: 900, beauty: 3, draw: (c, w, h) => {
    bg(c, w, h, '#1565c0', '#90caf9');
    for (let i = 0; i < 60; i++) ICONS.snow(c, Math.random() * w, Math.random() * h, 20 + Math.random() * 30);
    text(c, 'WINTER', w / 2, h * 0.3, 130, '#ffffff', '#0d47a1');
    text(c, 'WONDERLAND', w / 2, h * 0.42, 90, '#e3f2fd', '#0d47a1');
    ICONS.star(c, w / 2, h * 0.65, 260);
    text(c, 'Warm drinks & treats inside', w / 2, h * 0.88, 40, '#ffffff');
  } },
  { id: 'local', title: 'Proudly Local', level: 150, price: 1500, beauty: 3, draw: (c, w, h) => {
    bg(c, w, h, '#f5f5f5', '#e3f2fd');
    c.fillStyle = '#1e5fa8';
    c.fillRect(0, h * 0.42, w, h * 0.09);
    c.fillRect(w * 0.28, 0, w * 0.1, h);
    text(c, 'PROUDLY', w / 2, h * 0.14, 110, '#1e5fa8');
    text(c, 'LOCAL', w / 2, h * 0.26, 140, '#1e5fa8');
    ICONS.berry(c, w * 0.62, h * 0.68, 280);
    text(c, 'Northern berries, local farms', w / 2, h * 0.9, 38, '#1e5fa8');
  } },
  { id: 'eco', title: 'Go Green', level: 250, price: 2500, beauty: 3, draw: (c, w, h) => {
    bg(c, w, h, '#a5d6a7', '#1b5e20');
    text(c, 'GO', w / 2, h * 0.15, 140, '#ffffff', '#1b5e20');
    text(c, 'GREEN', w / 2, h * 0.28, 150, '#ffffff', '#1b5e20');
    c.strokeStyle = '#ffffff';
    c.lineWidth = 26;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(w / 2, h * 0.56, 130, (i * 2 * Math.PI) / 3 + 0.25, ((i + 1) * 2 * Math.PI) / 3 - 0.25);
      c.stroke();
    }
    ICONS.leaf(c, w / 2, h * 0.56, 150);
    text(c, 'Recycle · Reuse · Reduce', w / 2, h * 0.86, 44, '#ffffff');
  } },
  { id: 'legend', title: 'Supermarket Legend', level: 500, price: 25000, beauty: 6, draw: (c, w, h) => {
    bg(c, w, h, '#3a2a00', '#000000');
    rays(c, w / 2, h * 0.45, w * 1.2, 'rgba(255,210,63,0.22)', 24);
    // trophy
    c.fillStyle = '#ffd23f';
    c.beginPath();
    c.moveTo(w * 0.3, h * 0.3); c.lineTo(w * 0.7, h * 0.3); c.quadraticCurveTo(w * 0.7, h * 0.52, w * 0.5, h * 0.55); c.quadraticCurveTo(w * 0.3, h * 0.52, w * 0.3, h * 0.3);
    c.fill();
    c.fillRect(w * 0.46, h * 0.55, w * 0.08, h * 0.08);
    c.fillRect(w * 0.36, h * 0.63, w * 0.28, h * 0.04);
    c.lineWidth = 18;
    c.strokeStyle = '#ffd23f';
    c.beginPath(); c.arc(w * 0.3, h * 0.37, 50, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
    c.beginPath(); c.arc(w * 0.7, h * 0.37, 50, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
    text(c, 'LEVEL 500', w / 2, h * 0.13, 110, '#ffd23f', '#000000');
    text(c, 'SUPERMARKET', w / 2, h * 0.76, 80, '#ffffff', '#000000');
    text(c, 'LEGEND', w / 2, h * 0.86, 120, '#ffd23f', '#000000');
  } },
];
export const POSTER_MAP = new Map(POSTERS.map((p) => [p.id, p]));

const texCache = new Map<string, THREE.Texture>();
export function posterTexture(id: string): THREE.Texture {
  let t = texCache.get(id);
  if (t) return t;
  const [c, ctx] = makeCanvas(512, 1024);
  POSTER_MAP.get(id)!.draw(ctx, 512, 1024);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 506, 1018);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(id, t);
  return t;
}
