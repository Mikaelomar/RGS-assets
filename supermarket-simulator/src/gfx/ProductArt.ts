// Draws product labels and shipping box labels into texture atlases.
import * as THREE from 'three';
import { makeCanvas } from './Textures';
import type { UVRect } from './GeoBuilder';
import { PRODUCTS, type Icon, type ProductDef, isLooseProduce, boxStyleFor } from '../data/products';

export class Atlas {
  readonly size = 2048;
  readonly tile = 128;
  readonly cols = 16;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private nextTile = 1;

  constructor() {
    [this.canvas, this.ctx] = makeCanvas(this.size, this.size);
    this.ctx.fillStyle = '#808080';
    this.ctx.fillRect(0, 0, this.size, this.size);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.tile, this.tile); // tile 0 = white
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
  }
  alloc(): number {
    if (this.nextTile >= this.cols * this.cols) throw new Error('Atlas full');
    return this.nextTile++;
  }
  xy(tile: number): [number, number] {
    return [(tile % this.cols) * this.tile, Math.floor(tile / this.cols) * this.tile];
  }
  rect(tile: number, pad = 3): UVRect {
    const [x, y] = this.xy(tile);
    const S = this.size;
    return { u0: (x + pad) / S, u1: (x + this.tile - pad) / S, v1: 1 - (y + pad) / S, v0: 1 - (y + this.tile - pad) / S };
  }
  /** Sub-rectangle of a tile (fractions 0..1, y down). */
  subRect(tile: number, fx0: number, fy0: number, fx1: number, fy1: number, pad = 3): UVRect {
    const [x, y] = this.xy(tile);
    const S = this.size, T = this.tile - pad * 2;
    return {
      u0: (x + pad + fx0 * T) / S, u1: (x + pad + fx1 * T) / S,
      v1: 1 - (y + pad + fy0 * T) / S, v0: 1 - (y + pad + fy1 * T) / S,
    };
  }
  /** Draw into a tile with a given content aspect (w/h): content is laid out in a w x h space then squeezed into the tile. */
  draw(tile: number, aspect: number, fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const W = 256, H = Math.round(256 / aspect);
    const [c, ctx] = makeCanvas(W, Math.max(16, H));
    fn(ctx, W, Math.max(16, H));
    const [x, y] = this.xy(tile);
    this.ctx.drawImage(c, x, y, this.tile, this.tile);
  }
}

// ---------------------------------------------------------------------------
// Icon library: each draws centered at (x,y) with size s.
// ---------------------------------------------------------------------------
type IconFn = (c: CanvasRenderingContext2D, x: number, y: number, s: number, p?: ProductDef) => void;

function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
function ell(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) {
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
}
function leafShape(c: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, fill: string) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(s * 0.5, -s * 0.35, s, 0);
  c.quadraticCurveTo(s * 0.5, s * 0.35, 0, 0);
  c.fill();
  c.restore();
}
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, points = 5) {
  c.fillStyle = fill;
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 === 0 ? r : r * 0.45;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

export const ICONS: Record<Icon, IconFn> = {
  apple: (c, x, y, s) => {
    ell(c, x - s * 0.17, y + s * 0.05, s * 0.3, s * 0.36, '#d32f2f');
    ell(c, x + s * 0.17, y + s * 0.05, s * 0.3, s * 0.36, '#d32f2f');
    ell(c, x - s * 0.12, y - s * 0.08, s * 0.1, s * 0.14, 'rgba(255,255,255,0.35)');
    c.fillStyle = '#5d4037';
    c.fillRect(x - s * 0.03, y - s * 0.42, s * 0.06, s * 0.2);
    leafShape(c, x + s * 0.02, y - s * 0.32, s * 0.3, -0.5, '#43a047');
  },
  apple2: (c, x, y, s) => {
    ell(c, x - s * 0.17, y + s * 0.05, s * 0.3, s * 0.36, '#8bc34a');
    ell(c, x + s * 0.17, y + s * 0.05, s * 0.3, s * 0.36, '#8bc34a');
    c.fillStyle = '#5d4037';
    c.fillRect(x - s * 0.03, y - s * 0.42, s * 0.06, s * 0.2);
    leafShape(c, x + s * 0.02, y - s * 0.32, s * 0.3, -0.5, '#2e7d32');
  },
  orange: (c, x, y, s) => {
    circle(c, x, y + s * 0.04, s * 0.4, '#fb8c00');
    circle(c, x - s * 0.12, y - s * 0.08, s * 0.1, 'rgba(255,255,255,0.3)');
    leafShape(c, x, y - s * 0.34, s * 0.3, -0.3, '#43a047');
  },
  lemon: (c, x, y, s) => {
    ell(c, x, y, s * 0.42, s * 0.3, '#fdd835');
    ell(c, x + s * 0.42, y, s * 0.07, s * 0.05, '#fbc02d');
    ell(c, x - s * 0.42, y, s * 0.07, s * 0.05, '#fbc02d');
  },
  banana: (c, x, y, s) => {
    c.strokeStyle = '#fdd835';
    c.lineCap = 'round';
    c.lineWidth = s * 0.16;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(x + i * s * 0.08 - s * 0.1, y - s * 0.4, s * 0.55, Math.PI * 0.25, Math.PI * 0.75);
      c.stroke();
    }
    c.fillStyle = '#5d4037';
    c.fillRect(x + s * 0.28, y - s * 0.05, s * 0.08, s * 0.08);
  },
  bread: (c, x, y, s) => {
    c.fillStyle = '#c98a3e';
    c.beginPath();
    c.moveTo(x - s * 0.42, y + s * 0.25);
    c.lineTo(x - s * 0.42, y - s * 0.05);
    c.quadraticCurveTo(x - s * 0.42, y - s * 0.35, x - s * 0.15, y - s * 0.32);
    c.quadraticCurveTo(x, y - s * 0.45, x + s * 0.15, y - s * 0.32);
    c.quadraticCurveTo(x + s * 0.42, y - s * 0.35, x + s * 0.42, y - s * 0.05);
    c.lineTo(x + s * 0.42, y + s * 0.25);
    c.fill();
    c.strokeStyle = '#8d5a24';
    c.lineWidth = s * 0.04;
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(x + i * s * 0.18 - s * 0.06, y - s * 0.2);
      c.lineTo(x + i * s * 0.18 + s * 0.06, y - s * 0.05);
      c.stroke();
    }
  },
  wheat: (c, x, y, s) => {
    c.strokeStyle = '#c49a3a';
    c.lineWidth = s * 0.05;
    c.beginPath();
    c.moveTo(x, y + s * 0.45);
    c.lineTo(x, y - s * 0.4);
    c.stroke();
    for (let i = 0; i < 4; i++) {
      ell(c, x - s * 0.09, y - s * 0.3 + i * s * 0.16, s * 0.07, s * 0.12, '#e0b04a', -0.5);
      ell(c, x + s * 0.09, y - s * 0.3 + i * s * 0.16, s * 0.07, s * 0.12, '#e0b04a', 0.5);
    }
  },
  milk: (c, x, y, s) => {
    c.fillStyle = '#e3f2fd';
    c.fillRect(x - s * 0.22, y - s * 0.2, s * 0.44, s * 0.6);
    c.fillStyle = '#1e88e5';
    c.beginPath();
    c.moveTo(x - s * 0.22, y - s * 0.2);
    c.lineTo(x, y - s * 0.45);
    c.lineTo(x + s * 0.22, y - s * 0.2);
    c.fill();
  },
  cow: (c, x, y, s) => {
    ell(c, x, y, s * 0.42, s * 0.32, '#ffffff');
    c.strokeStyle = '#212121';
    c.lineWidth = s * 0.04;
    c.beginPath();
    c.ellipse(x, y, s * 0.42, s * 0.32, 0, 0, Math.PI * 2);
    c.stroke();
    ell(c, x - s * 0.15, y - s * 0.1, s * 0.12, s * 0.09, '#212121', 0.4);
    ell(c, x + s * 0.18, y + s * 0.1, s * 0.1, s * 0.07, '#212121', -0.3);
    ell(c, x + s * 0.05, y + s * 0.18, s * 0.18, s * 0.09, '#f8bbd0');
  },
  cereal: (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(x, y + s * 0.05, s * 0.45, s * 0.12, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e3f2fd';
    c.beginPath();
    c.moveTo(x - s * 0.45, y + s * 0.05);
    c.quadraticCurveTo(x, y + s * 0.6, x + s * 0.45, y + s * 0.05);
    c.fill();
    const cols = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00', '#8e24aa'];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      circle(c, x + Math.cos(a) * s * (0.1 + (i % 3) * 0.1), y - s * 0.02 + Math.sin(a) * s * 0.06 - (i % 2) * s * 0.05, s * 0.06, cols[i % cols.length]);
    }
  },
  chips: (c, x, y, s) => {
    for (let i = 0; i < 4; i++) {
      ell(c, x - s * 0.2 + i * s * 0.13, y + Math.sin(i * 2) * s * 0.12, s * 0.2, s * 0.14, i % 2 ? '#ffca28' : '#ffb300', i * 0.6);
    }
  },
  drop: (c, x, y, s) => {
    c.fillStyle = '#29b6f6';
    c.beginPath();
    c.moveTo(x, y - s * 0.45);
    c.bezierCurveTo(x + s * 0.4, y, x + s * 0.35, y + s * 0.4, x, y + s * 0.4);
    c.bezierCurveTo(x - s * 0.35, y + s * 0.4, x - s * 0.4, y, x, y - s * 0.45);
    c.fill();
    ell(c, x - s * 0.1, y + s * 0.1, s * 0.06, s * 0.12, 'rgba(255,255,255,0.6)', 0.3);
  },
  bubbles: (c, x, y, s) => {
    c.strokeStyle = '#ffffff';
    c.lineWidth = s * 0.05;
    [[0, 0, 0.25], [0.28, -0.22, 0.14], [-0.25, -0.25, 0.1], [0.22, 0.25, 0.1], [-0.28, 0.22, 0.08]].forEach(([dx, dy, r]) => {
      c.beginPath();
      c.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      c.stroke();
    });
  },
  cheese: (c, x, y, s) => {
    c.fillStyle = '#ffca28';
    c.beginPath();
    c.moveTo(x - s * 0.42, y + s * 0.3);
    c.lineTo(x + s * 0.42, y + s * 0.3);
    c.lineTo(x + s * 0.42, y - s * 0.05);
    c.lineTo(x - s * 0.42, y - s * 0.3);
    c.fill();
    circle(c, x - s * 0.15, y + s * 0.1, s * 0.07, '#f9a825');
    circle(c, x + s * 0.18, y + s * 0.15, s * 0.05, '#f9a825');
    circle(c, x + s * 0.1, y - s * 0.02, s * 0.04, '#f9a825');
  },
  fish: (c, x, y, s) => {
    ell(c, x - s * 0.05, y, s * 0.35, s * 0.18, '#4fc3f7');
    c.fillStyle = '#29b6f6';
    c.beginPath();
    c.moveTo(x + s * 0.25, y);
    c.lineTo(x + s * 0.48, y - s * 0.18);
    c.lineTo(x + s * 0.48, y + s * 0.18);
    c.fill();
    circle(c, x - s * 0.25, y - s * 0.04, s * 0.04, '#0d1b2a');
  },
  meat: (c, x, y, s) => {
    ell(c, x, y, s * 0.4, s * 0.28, '#c0392b', 0.2);
    ell(c, x + s * 0.08, y - s * 0.02, s * 0.18, s * 0.1, '#f5b7b1', 0.2);
    ell(c, x - s * 0.18, y + s * 0.08, s * 0.08, s * 0.05, '#f5b7b1', 0.2);
  },
  chicken: (c, x, y, s) => {
    ell(c, x - s * 0.05, y, s * 0.3, s * 0.24, '#e0a070');
    c.fillStyle = '#fff3e0';
    c.fillRect(x + s * 0.18, y - s * 0.05, s * 0.22, s * 0.08);
    circle(c, x + s * 0.4, y - s * 0.07, s * 0.06, '#fff3e0');
    circle(c, x + s * 0.4, y + s * 0.05, s * 0.06, '#fff3e0');
  },
  sausage: (c, x, y, s) => {
    c.strokeStyle = '#a0522d';
    c.lineCap = 'round';
    c.lineWidth = s * 0.16;
    for (let i = 0; i < 2; i++) {
      c.beginPath();
      c.arc(x, y + s * 0.5 + i * s * 0.16, s * 0.55, Math.PI * 1.25, Math.PI * 1.75);
      c.stroke();
    }
  },
  shrimp: (c, x, y, s) => {
    c.strokeStyle = '#ff7043';
    c.lineCap = 'round';
    c.lineWidth = s * 0.16;
    c.beginPath();
    c.arc(x, y, s * 0.25, Math.PI * 0.1, Math.PI * 1.5);
    c.stroke();
  },
  pizza: (c, x, y, s) => {
    circle(c, x, y, s * 0.42, '#e0a040');
    circle(c, x, y, s * 0.36, '#e53935');
    circle(c, x, y, s * 0.3, '#ffe082');
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      circle(c, x + Math.cos(a) * s * 0.18, y + Math.sin(a) * s * 0.18, s * 0.06, '#c62828');
    }
  },
  icecream: (c, x, y, s) => {
    c.fillStyle = '#d7a86e';
    c.beginPath();
    c.moveTo(x - s * 0.2, y);
    c.lineTo(x, y + s * 0.48);
    c.lineTo(x + s * 0.2, y);
    c.fill();
    circle(c, x, y - s * 0.08, s * 0.22, '#fff8e1');
    circle(c, x - s * 0.08, y - s * 0.24, s * 0.15, '#f8bbd0');
  },
  coffee: (c, x, y, s) => {
    ell(c, x - s * 0.15, y, s * 0.16, s * 0.24, '#6d4c41', 0.5);
    ell(c, x + s * 0.15, y, s * 0.16, s * 0.24, '#6d4c41', -0.5);
    c.strokeStyle = '#3e2723';
    c.lineWidth = s * 0.03;
    c.beginPath();
    c.moveTo(x - s * 0.22, y - s * 0.12);
    c.quadraticCurveTo(x - s * 0.1, y, x - s * 0.18, y + s * 0.15);
    c.moveTo(x + s * 0.22, y - s * 0.12);
    c.quadraticCurveTo(x + s * 0.1, y, x + s * 0.18, y + s * 0.15);
    c.stroke();
  },
  leaf: (c, x, y, s) => {
    leafShape(c, x - s * 0.4, y + s * 0.2, s * 0.85, -0.5, '#43a047');
    c.strokeStyle = '#1b5e20';
    c.lineWidth = s * 0.03;
    c.beginPath();
    c.moveTo(x - s * 0.4, y + s * 0.2);
    c.lineTo(x + s * 0.3, y - s * 0.2);
    c.stroke();
  },
  candy: (c, x, y, s) => {
    ell(c, x, y, s * 0.25, s * 0.18, '#e91e63');
    c.fillStyle = '#f48fb1';
    c.beginPath();
    c.moveTo(x - s * 0.22, y);
    c.lineTo(x - s * 0.45, y - s * 0.18);
    c.lineTo(x - s * 0.45, y + s * 0.18);
    c.fill();
    c.beginPath();
    c.moveTo(x + s * 0.22, y);
    c.lineTo(x + s * 0.45, y - s * 0.18);
    c.lineTo(x + s * 0.45, y + s * 0.18);
    c.fill();
  },
  choco: (c, x, y, s) => {
    c.fillStyle = '#4e342e';
    c.fillRect(x - s * 0.4, y - s * 0.25, s * 0.8, s * 0.5);
    c.strokeStyle = '#3e2723';
    c.lineWidth = s * 0.03;
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(x - s * 0.4 + i * s * 0.2, y - s * 0.25);
      c.lineTo(x - s * 0.4 + i * s * 0.2, y + s * 0.25);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(x - s * 0.4, y);
    c.lineTo(x + s * 0.4, y);
    c.stroke();
  },
  cookie: (c, x, y, s) => {
    circle(c, x, y, s * 0.38, '#c58b4e');
    for (let i = 0; i < 7; i++) circle(c, x + Math.cos(i * 2.3) * s * 0.22, y + Math.sin(i * 2.3) * s * 0.2, s * 0.05, '#4e342e');
  },
  pasta: (c, x, y, s) => {
    c.strokeStyle = '#ffd54f';
    c.lineWidth = s * 0.1;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(x - s * 0.3 + i * s * 0.2, y - s * 0.3);
      c.lineTo(x - s * 0.15 + i * s * 0.2, y + s * 0.3);
      c.stroke();
    }
  },
  rice: (c, x, y, s) => {
    ell(c, x, y + s * 0.15, s * 0.4, s * 0.16, '#ffffff');
    c.fillStyle = '#e53935';
    c.beginPath();
    c.moveTo(x - s * 0.4, y + s * 0.15);
    c.quadraticCurveTo(x, y + s * 0.55, x + s * 0.4, y + s * 0.15);
    c.fill();
    for (let i = 0; i < 10; i++) ell(c, x - s * 0.25 + (i % 5) * s * 0.12, y + s * 0.05 - Math.floor(i / 5) * s * 0.08, s * 0.04, s * 0.02, '#fafafa', i);
  },
  tomato: (c, x, y, s) => {
    circle(c, x, y + s * 0.05, s * 0.38, '#e53935');
    star(c, x, y - s * 0.3, s * 0.15, '#2e7d32', 5);
    circle(c, x - s * 0.13, y - s * 0.05, s * 0.08, 'rgba(255,255,255,0.35)');
  },
  sparkle: (c, x, y, s) => {
    star(c, x, y, s * 0.4, '#ffffff', 4);
    star(c, x + s * 0.3, y - s * 0.3, s * 0.12, '#ffffff', 4);
    star(c, x - s * 0.32, y + s * 0.28, s * 0.1, '#ffffff', 4);
  },
  star: (c, x, y, s) => star(c, x, y, s * 0.45, '#ffeb3b'),
  heart: (c, x, y, s) => {
    c.fillStyle = '#e91e63';
    c.beginPath();
    c.moveTo(x, y + s * 0.35);
    c.bezierCurveTo(x - s * 0.5, y, x - s * 0.3, y - s * 0.4, x, y - s * 0.15);
    c.bezierCurveTo(x + s * 0.3, y - s * 0.4, x + s * 0.5, y, x, y + s * 0.35);
    c.fill();
  },
  egg: (c, x, y, s) => {
    ell(c, x - s * 0.18, y + s * 0.05, s * 0.2, s * 0.27, '#fff8e1');
    ell(c, x + s * 0.18, y + s * 0.05, s * 0.2, s * 0.27, '#ffe0b2');
  },
  sun: (c, x, y, s) => {
    c.strokeStyle = '#ffb300';
    c.lineWidth = s * 0.06;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      c.beginPath();
      c.moveTo(x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3);
      c.lineTo(x + Math.cos(a) * s * 0.46, y + Math.sin(a) * s * 0.46);
      c.stroke();
    }
    circle(c, x, y, s * 0.25, '#ffca28');
  },
  bolt: (c, x, y, s) => {
    c.fillStyle = '#76ff03';
    c.beginPath();
    c.moveTo(x + s * 0.08, y - s * 0.48);
    c.lineTo(x - s * 0.25, y + s * 0.05);
    c.lineTo(x - s * 0.02, y + s * 0.05);
    c.lineTo(x - s * 0.1, y + s * 0.48);
    c.lineTo(x + s * 0.25, y - s * 0.08);
    c.lineTo(x + s * 0.02, y - s * 0.08);
    c.fill();
  },
  snow: (c, x, y, s) => {
    c.strokeStyle = '#e1f5fe';
    c.lineWidth = s * 0.06;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      c.beginPath();
      c.moveTo(x + Math.cos(a) * s * 0.42, y + Math.sin(a) * s * 0.42);
      c.lineTo(x - Math.cos(a) * s * 0.42, y - Math.sin(a) * s * 0.42);
      c.stroke();
    }
  },
  paw: (c, x, y, s) => {
    ell(c, x, y + s * 0.12, s * 0.2, s * 0.17, '#ffffff');
    circle(c, x - s * 0.24, y - s * 0.08, s * 0.08, '#ffffff');
    circle(c, x - s * 0.09, y - s * 0.22, s * 0.08, '#ffffff');
    circle(c, x + s * 0.09, y - s * 0.22, s * 0.08, '#ffffff');
    circle(c, x + s * 0.24, y - s * 0.08, s * 0.08, '#ffffff');
  },
  baby: (c, x, y, s) => {
    circle(c, x, y, s * 0.34, '#ffe0b2');
    circle(c, x - s * 0.12, y - s * 0.04, s * 0.04, '#3e2723');
    circle(c, x + s * 0.12, y - s * 0.04, s * 0.04, '#3e2723');
    c.strokeStyle = '#e57373';
    c.lineWidth = s * 0.04;
    c.beginPath();
    c.arc(x, y + s * 0.06, s * 0.1, 0.2, Math.PI - 0.2);
    c.stroke();
  },
  flower: (c, x, y, s) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      circle(c, x + Math.cos(a) * s * 0.2, y + Math.sin(a) * s * 0.2, s * 0.15, '#f48fb1');
    }
    circle(c, x, y, s * 0.12, '#ffeb3b');
  },
  battery: (c, x, y, s) => {
    c.fillStyle = '#ffc107';
    c.fillRect(x - s * 0.15, y - s * 0.35, s * 0.3, s * 0.7);
    c.fillStyle = '#212121';
    c.fillRect(x - s * 0.15, y + s * 0.05, s * 0.3, s * 0.3);
    c.fillStyle = '#bdbdbd';
    c.fillRect(x - s * 0.06, y - s * 0.43, s * 0.12, s * 0.08);
  },
  note: (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(x + s * 0.05, y - s * 0.38, s * 0.07, s * 0.62);
    ell(c, x - s * 0.04, y + s * 0.25, s * 0.14, s * 0.1, '#ffffff', -0.4);
    c.fillRect(x + s * 0.05, y - s * 0.38, s * 0.25, s * 0.08);
  },
  berry: (c, x, y, s) => {
    for (let i = 0; i < 5; i++) circle(c, x + Math.cos(i * 1.3) * s * 0.18, y + Math.sin(i * 1.3) * s * 0.15, s * 0.16, i % 2 ? '#5c6bc0' : '#3949ab');
    leafShape(c, x - s * 0.05, y - s * 0.3, s * 0.3, -0.4, '#43a047');
  },
  bee: (c, x, y, s) => {
    ell(c, x, y, s * 0.3, s * 0.2, '#ffc107');
    c.fillStyle = '#212121';
    c.fillRect(x - s * 0.08, y - s * 0.2, s * 0.07, s * 0.4);
    c.fillRect(x + s * 0.08, y - s * 0.2, s * 0.07, s * 0.4);
    ell(c, x - s * 0.05, y - s * 0.25, s * 0.14, s * 0.1, 'rgba(255,255,255,0.8)', -0.5);
  },
  pepper: (c, x, y, s) => {
    ell(c, x, y + s * 0.05, s * 0.32, s * 0.36, '#e53935');
    c.fillStyle = '#2e7d32';
    c.fillRect(x - s * 0.04, y - s * 0.42, s * 0.08, s * 0.14);
  },
  tooth: (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(x - s * 0.3, y - s * 0.25);
    c.quadraticCurveTo(x, y - s * 0.45, x + s * 0.3, y - s * 0.25);
    c.lineTo(x + s * 0.2, y + s * 0.4);
    c.lineTo(x + s * 0.05, y + s * 0.05);
    c.lineTo(x - s * 0.05, y + s * 0.05);
    c.lineTo(x - s * 0.2, y + s * 0.4);
    c.fill();
  },
  shirt: (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(x - s * 0.15, y - s * 0.35);
    c.lineTo(x - s * 0.42, y - s * 0.15);
    c.lineTo(x - s * 0.3, y);
    c.lineTo(x - s * 0.25, y - s * 0.05);
    c.lineTo(x - s * 0.25, y + s * 0.38);
    c.lineTo(x + s * 0.25, y + s * 0.38);
    c.lineTo(x + s * 0.25, y - s * 0.05);
    c.lineTo(x + s * 0.3, y);
    c.lineTo(x + s * 0.42, y - s * 0.15);
    c.lineTo(x + s * 0.15, y - s * 0.35);
    c.quadraticCurveTo(x, y - s * 0.25, x - s * 0.15, y - s * 0.35);
    c.fill();
  },
  cup: (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(x - s * 0.25, y - s * 0.25, s * 0.4, s * 0.5);
    c.strokeStyle = '#ffffff';
    c.lineWidth = s * 0.07;
    c.beginPath();
    c.arc(x + s * 0.2, y, s * 0.13, -Math.PI / 2, Math.PI / 2);
    c.stroke();
  },
  pea: (c, x, y, s) => {
    ell(c, x, y, s * 0.45, s * 0.18, '#558b2f', -0.3);
    for (let i = 0; i < 4; i++) circle(c, x - s * 0.24 + i * s * 0.16, y + s * 0.07 - i * s * 0.05, s * 0.08, '#9ccc65');
  },
  fries: (c, x, y, s) => {
    c.fillStyle = '#ffd54f';
    for (let i = 0; i < 6; i++) c.fillRect(x - s * 0.3 + i * s * 0.1, y - s * 0.4 + (i % 2) * s * 0.08, s * 0.07, s * 0.5);
    c.fillStyle = '#d32f2f';
    c.beginPath();
    c.moveTo(x - s * 0.35, y);
    c.lineTo(x + s * 0.35, y);
    c.lineTo(x + s * 0.28, y + s * 0.42);
    c.lineTo(x - s * 0.28, y + s * 0.42);
    c.fill();
  },
  beer: (c, x, y, s) => {
    c.fillStyle = '#ffb300';
    c.fillRect(x - s * 0.22, y - s * 0.2, s * 0.38, s * 0.55);
    ell(c, x - s * 0.03, y - s * 0.24, s * 0.24, s * 0.1, '#ffffff');
    circle(c, x - s * 0.12, y - s * 0.28, s * 0.08, '#ffffff');
    c.strokeStyle = '#ffb300';
    c.lineWidth = s * 0.06;
    c.beginPath();
    c.arc(x + s * 0.2, y + s * 0.05, s * 0.12, -Math.PI / 2, Math.PI / 2);
    c.stroke();
  },
  flame: (c, x, y, s) => {
    c.fillStyle = '#ff6f00';
    c.beginPath();
    c.moveTo(x, y - s * 0.45);
    c.bezierCurveTo(x + s * 0.35, y - s * 0.1, x + s * 0.3, y + s * 0.4, x, y + s * 0.4);
    c.bezierCurveTo(x - s * 0.3, y + s * 0.4, x - s * 0.35, y, x, y - s * 0.45);
    c.fill();
    ell(c, x, y + s * 0.2, s * 0.12, s * 0.16, '#ffeb3b');
  },
  drink: (c, x, y, s) => ICONS.cup(c, x, y, s),
  nut: (c, x, y, s) => {
    ell(c, x - s * 0.12, y, s * 0.2, s * 0.28, '#a1662f', 0.4);
    ell(c, x + s * 0.15, y + s * 0.05, s * 0.18, s * 0.24, '#c58b4e', -0.4);
  },
  oat: (c, x, y, s) => {
    for (let i = 0; i < 7; i++) ell(c, x + Math.cos(i * 0.9) * s * 0.22, y + Math.sin(i * 0.9) * s * 0.18, s * 0.12, s * 0.06, '#e0c08a', i);
  },
  jar: (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(x - s * 0.25, y - s * 0.25, s * 0.5, s * 0.6);
  },
  can: (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    c.fillRect(x - s * 0.2, y - s * 0.32, s * 0.4, s * 0.64);
  },
};

// ---------------------------------------------------------------------------
// Product label layout
// ---------------------------------------------------------------------------

function fitText(c: CanvasRenderingContext2D, text: string, maxW: number, size: number, family: string) {
  let fs = size;
  c.font = `${fs}px ${family}`;
  while (c.measureText(text).width > maxW && fs > 8) {
    fs *= 0.9;
    c.font = `${fs}px ${family}`;
  }
  return fs;
}

const DISPLAY_FONT = "'Lilita One', 'Arial Black', sans-serif";

function splitName(name: string): [string, string] {
  const words = name.split(' ');
  if (words.length === 1) return [name, ''];
  return [words[0], words.slice(1).join(' ')];
}

/** Draw a front label (brand + icon + name) filling w x h. */
export function drawFrontLabel(c: CanvasRenderingContext2D, w: number, h: number, p: ProductDef) {
  c.fillStyle = p.label;
  c.fillRect(0, 0, w, h);
  // decorative band
  c.fillStyle = p.color2;
  c.globalAlpha = 0.85;
  c.beginPath();
  c.moveTo(0, h * 0.72);
  c.quadraticCurveTo(w * 0.5, h * 0.6, w, h * 0.74);
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.fill();
  c.globalAlpha = 1;
  const [brand, rest] = splitName(p.name);
  const light = new THREE.Color(p.label).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6;
  c.fillStyle = light ? '#1a1a1a' : '#ffffff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const minSide = Math.min(w, h);
  fitText(c, brand.toUpperCase(), w * 0.9, minSide * 0.2, DISPLAY_FONT);
  c.strokeStyle = light ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.35)';
  c.lineWidth = minSide * 0.02;
  c.strokeText(brand.toUpperCase(), w / 2, h * 0.14);
  c.fillText(brand.toUpperCase(), w / 2, h * 0.14);
  ICONS[p.icon](c, w / 2, h * 0.45, minSide * 0.52, p);
  if (rest) {
    const bandLight = new THREE.Color(p.color2).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6;
    c.fillStyle = bandLight ? '#1a1a1a' : '#ffffff';
    fitText(c, rest, w * 0.9, minSide * 0.14, DISPLAY_FONT);
    c.fillText(rest, w / 2, h * 0.86);
  }
}

/** Cylindrical wrap: content repeated twice around. */
export function drawWrapLabel(c: CanvasRenderingContext2D, w: number, h: number, p: ProductDef) {
  c.fillStyle = p.label;
  c.fillRect(0, 0, w, h);
  for (let k = 0; k < 2; k++) {
    c.save();
    c.translate(k * (w / 2), 0);
    drawFrontLabel(c, w / 2, h, p);
    c.restore();
  }
}

export interface ProductArtInfo {
  tile: number;
  boxTile: number;
}

export const productAtlas = new Atlas();
export const boxAtlas = new Atlas();
const artInfo = new Map<string, ProductArtInfo>();

/** Aspect ratio (w/h) of the label surface for a product shape. */
export function labelAspect(p: ProductDef): number {
  const [w, hh, d] = p.dims;
  switch (p.shape) {
    case 'can':
    case 'jar':
    case 'tub':
    case 'cup':
      return (Math.PI * w) / (hh * (p.shape === 'jar' ? 0.6 : p.shape === 'tub' ? 0.7 : 0.8));
    case 'bottle':
      return (Math.PI * w) / (hh * 0.35);
    case 'carton':
      return (w * 4) / (hh * 0.75);
    case 'bar':
    case 'butter':
      return w / d;
    case 'tp':
      return 1.4;
    case 'box':
      if (hh < Math.min(w, d) * 0.7) return w / d; // flat box: label on top
      return w / hh;
    case 'potatoBag':
      return w / hh;
    default:
      return w / Math.max(hh, 0.01);
  }
}

function drawBoxLabel(c: CanvasRenderingContext2D, w: number, h: number, p: ProductDef) {
  const style = boxStyleFor(p);
  if (style === 'crate') {
    // wooden crate end with a paper sticker
    c.fillStyle = '#c8955a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(90,55,20,0.35)';
    for (let i = 0; i < 4; i++) c.fillRect(0, (i * h) / 4, w, 3);
  } else if (style === 'cold') {
    c.fillStyle = '#eef6fb';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1e88e5';
    c.fillRect(0, h * 0.85, w, h * 0.15);
  } else {
    c.fillStyle = '#c49a64';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(110,75,40,0.25)';
    for (let i = 0; i < h; i += 7) c.fillRect(0, i, w, 1);
    c.fillStyle = 'rgba(210,190,150,0.9)';
    c.fillRect(w * 0.45, 0, w * 0.1, h * 0.25);
  }
  // sticker
  const sx = w * 0.12, sy = h * 0.18, sw = w * 0.76, sh = h * 0.66;
  c.fillStyle = '#ffffff';
  c.fillRect(sx, sy, sw, sh);
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 2;
  c.strokeRect(sx, sy, sw, sh);
  ICONS[p.icon](c, sx + sw * 0.25, sy + sh * 0.5, Math.min(sw * 0.4, sh * 0.8), p);
  c.fillStyle = '#212121';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const [brand, rest] = splitName(p.name);
  fitText(c, brand, sw * 0.5, sh * 0.26, DISPLAY_FONT);
  c.fillText(brand, sx + sw * 0.7, sy + sh * 0.3);
  if (rest) {
    fitText(c, rest, sw * 0.5, sh * 0.18, "'Nunito', sans-serif");
    c.fillText(rest, sx + sw * 0.7, sy + sh * 0.55);
  }
  c.fillStyle = '#d32f2f';
  fitText(c, `x${p.perBox}`, sw * 0.4, sh * 0.2, DISPLAY_FONT);
  c.fillText(`x${p.perBox}`, sx + sw * 0.7, sy + sh * 0.8);
}

/** Paints all product labels and box labels once. */
export function buildProductArt() {
  for (const p of PRODUCTS) {
    const tile = productAtlas.alloc();
    const boxTile = boxAtlas.alloc();
    const aspect = labelAspect(p);
    if (isLooseProduce(p)) {
      // surface texture for natural produce (subtle speckle)
      productAtlas.draw(tile, 1, (c, w, h) => {
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, w, h);
        for (let i = 0; i < 160; i++) {
          c.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`;
          c.fillRect(Math.random() * w, Math.random() * h, 3, 3);
        }
        if (p.shape === 'watermelon') {
          c.fillStyle = 'rgba(10,60,10,0.55)';
          for (let i = 0; i < 8; i++) {
            c.beginPath();
            const x0 = (i * w) / 8;
            c.moveTo(x0, 0);
            for (let y = 0; y <= h; y += 16) c.lineTo(x0 + Math.sin(y * 0.08 + i) * 6 + 10, y);
            c.lineTo(x0, h);
            c.fill();
          }
        }
        if (p.shape === 'pineapple') {
          c.strokeStyle = 'rgba(90,60,10,0.6)';
          c.lineWidth = 3;
          for (let i = -8; i < 16; i++) {
            c.beginPath();
            c.moveTo(i * 24, 0);
            c.lineTo(i * 24 + h, h);
            c.moveTo(i * 24 + h, 0);
            c.lineTo(i * 24, h);
            c.stroke();
          }
        }
      });
    } else if (['can', 'jar', 'tub', 'bottle', 'cup', 'carton', 'tp'].includes(p.shape)) {
      productAtlas.draw(tile, aspect, (c, w, h) => drawWrapLabel(c, w, h, p));
    } else {
      productAtlas.draw(tile, aspect, (c, w, h) => drawFrontLabel(c, w, h, p));
    }
    boxAtlas.draw(boxTile, 1.4, (c, w, h) => drawBoxLabel(c, w, h, p));
    artInfo.set(p.id, { tile, boxTile });
  }
  productAtlas.texture.needsUpdate = true;
  boxAtlas.texture.needsUpdate = true;
}

export function artFor(id: string): ProductArtInfo {
  return artInfo.get(id)!;
}

/** 2D icon canvas for UI (fallback when 3D icons aren't ready). */
export function iconDataURL(p: ProductDef, size = 96): string {
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, size, size);
  ICONS[p.icon](ctx, size / 2, size / 2, size * 0.8, p);
  return c.toDataURL();
}
