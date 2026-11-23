// Guided first day with the regional manager "Mike", plus contextual tips afterwards.
import * as THREE from 'three';
import type { Game } from './Game';
import { DELIVERY_SPOT } from './layout';
import { makeCanvas } from '../gfx/Textures';
import { audio } from '../core/Audio';

interface Step { icon: string; text: string; target?: () => THREE.Vector3 | null; done: () => boolean; on?: string; }

export function drawAvatar(): string {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#5aa9f0');
  g.addColorStop(1, '#2f6fb3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // shirt
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(64, 132, 50, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1e5fa8';
  ctx.beginPath();
  ctx.moveTo(44, 104); ctx.lineTo(64, 128); ctx.lineTo(84, 104); ctx.lineTo(90, 128); ctx.lineTo(38, 128); ctx.closePath();
  ctx.fill();
  // neck + head
  ctx.fillStyle = '#e2aa86';
  ctx.fillRect(54, 84, 20, 18);
  ctx.beginPath();
  ctx.ellipse(64, 62, 27, 32, 0, 0, Math.PI * 2);
  ctx.fill();
  // hair + beard
  ctx.fillStyle = '#4a2c1b';
  ctx.beginPath();
  ctx.ellipse(64, 40, 29, 17, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(35, 38, 58, 8);
  ctx.beginPath();
  ctx.moveTo(38, 62); ctx.quadraticCurveTo(40, 98, 64, 98); ctx.quadraticCurveTo(88, 98, 90, 62); ctx.quadraticCurveTo(86, 84, 64, 86); ctx.quadraticCurveTo(42, 84, 38, 62);
  ctx.fill();
  // eyes, brows, smile
  ctx.fillStyle = '#ffffff';
  for (const x of [53, 75]) { ctx.beginPath(); ctx.ellipse(x, 60, 5.5, 4, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#2b1a10';
  for (const x of [54, 76]) { ctx.beginPath(); ctx.arc(x, 60, 2.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillRect(46, 50, 13, 3);
  ctx.fillRect(69, 50, 13, 3);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(64, 76, 8, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.fillStyle = '#d08f6c';
  ctx.beginPath();
  ctx.ellipse(64, 68, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  return c.toDataURL();
}

export class Tutorial {
  private steps: Step[];
  private flags = new Set<string>();
  private lookAcc = 0;
  private lastYaw = 0;
  private stocked = 0;
  private tipT = 8;

  constructor(private g: Game) {
    const furn = (id: string) => () => {
      for (const f of g.furniture.items.values()) if (f.def.id === id) return f.box.getCenter(new THREE.Vector3()).setY(f.def.size[2] + 0.35);
      return null;
    };
    const boxOf = (pid: string) => () => {
      for (const b of g.boxes.items.values()) if (b.def?.id === pid && !b.held) return b.pos.clone().setY(b.pos.y + b.size[1] + 0.4);
      return null;
    };
    this.steps = [
      { icon: '👀', text: 'Welcome to your new shop! Drag on the right side of the screen to look around.', done: () => this.lookAcc > 1.6 },
      { icon: '🚶', text: 'Use the joystick (left side) to walk to the yellow DELIVERY SPOT.', target: () => new THREE.Vector3(DELIVERY_SPOT.x, 1.2, DELIVERY_SPOT.z), done: () => g.player.pos.distanceTo(new THREE.Vector3(DELIVERY_SPOT.x, 0, DELIVERY_SPOT.z)) < 3.2 },
      { icon: '🍎', text: 'See those apples? Look at the crate and tap ✋ to pick it up!', target: boxOf('apple'), done: () => g.carry?.def?.id === 'apple' || this.flags.has('stock:apple') },
      { icon: '🧺', text: 'Carry the apples inside and place them on the Produce Rack (hold ✋ to fill fast).', target: furn('fruit_rack'), done: () => this.flags.has('stock:apple') && (!g.carry || g.carry.s.count === 0) },
      { icon: '🗑️', text: 'That empty crate is just clutter. Toss it in the trash bin!', target: furn('trash_bin'), done: () => this.flags.has('trash') || (!g.carry && this.flags.has('stock:apple') && this.flags.has('boxEmpty') && this.flags.has('trash')) },
      { icon: '🥣', text: 'Now get the box of Fruity Bites cereal from the delivery spot and fill a shelf.', target: boxOf('cereal'), done: () => this.flags.has('stock:cereal') && (!g.carry || g.carry.s.count === 0) },
      { icon: '🏷️', text: 'Look at a price tag on the shelf and tap ✋ to check / change the price.', target: furn('shelf_small'), done: () => this.flags.has('price') },
      { icon: '🖥️', text: 'Order more stock: use the computer next to the entrance (or the 📱 button).', target: furn('kiosk'), done: () => this.flags.has('order') },
      { icon: '🔓', text: 'Time to open! Tap the CLOSED sign at the entrance to open your store.', target: () => g.building.openSign ? g.building.openSign.position.clone().setY(2.5) : null, done: () => g.state.open },
      { icon: '🧾', text: 'Customers are coming! Go to the checkout counter and tap ✋ to work the register.', target: furn('checkout'), done: () => this.flags.has('checkout') },
      { icon: '💳', text: 'Tap each item on the belt to scan it, then take the payment. Give exact change for tips!', done: () => this.flags.has('sale') },
      { icon: '🎉', text: 'Great job! Keep the shelves full, prices fair and the store clean. Grow from a corner shop to a hypermarket!', done: () => this.flags.has('finale') },
    ];
  }

  get active() { return !this.g.state.tutorialDone; }

  event(name: string, data?: string) {
    this.flags.add(name);
    if (data) this.flags.add(`${name}:${data}`);
    if (name === 'stock') this.stocked++;
  }

  skip() {
    const s = this.g.state;
    s.tutorialDone = true;
    s.tutorial = this.steps.length;
    this.g.markers.remove('tut');
    this.g.ui.hud.setHint(null);
  }

  update(dt: number) {
    const g = this.g;
    const s = g.state;
    if (s.tutorialDone) {
      this.tips(dt);
      return;
    }
    // look tracking
    const dy = Math.abs(g.player.yaw - this.lastYaw);
    this.lastYaw = g.player.yaw;
    if (dy < 1) this.lookAcc += dy;
    const step = this.steps[s.tutorial];
    if (!step) {
      this.skip();
      return;
    }
    const progress = `Step ${s.tutorial + 1}/${this.steps.length}`;
    g.ui.hud.setHint(step.icon, step.text, progress);
    if (step.target) {
      g.markers.add('tut', () => step.target!(), '⬇️', Infinity);
    } else g.markers.remove('tut');
    if (step.done()) {
      s.tutorial++;
      audio.play('success');
      g.markers.remove('tut');
      if (s.tutorial === this.steps.length - 1) {
        setTimeout(() => this.event('finale'), 9000);
      }
      if (s.tutorial >= this.steps.length) {
        s.tutorialDone = true;
        g.ui.hud.setHint(null);
        g.sim.addXP(10);
      }
    }
  }

  /** After the tutorial: contextual hints about what needs attention. */
  private tips(dt: number) {
    const g = this.g;
    const s = g.state;
    this.tipT -= dt;
    if (this.tipT > 0) return;
    this.tipT = 3;
    const waiting = g.checkout.waitingCustomers();
    let hint: [string, string] | null = null;
    if (waiting > 0 && g.mode === 'walk') hint = ['🧾', `${waiting} customer${waiting > 1 ? 's are' : ' is'} waiting at the checkout!`];
    else if (s.energy < 20) hint = ['😴', 'You are exhausted! Drink a coffee in the break room or end the day.'];
    else if (g.power.outage) hint = ['⚡', g.power.tripped ? 'Power is out! Reset the breaker in the Electrical room.' : 'Power outage! Coolers are warming up.'];
    else if ([...g.furniture.items.values()].some((f) => f.s.broken)) hint = ['🔧', 'Something is broken! Look at it and hold ✋ to repair.'];
    else if (s.spills.length) hint = ['💧', 'There is a spill on the floor. Take the mop 🧹 and clean it.'];
    else if ([...g.furniture.items.values()].some((f) => f.def.interact === 'trash' && (f.s.fill ?? 0) >= 10)) hint = ['🗑️', 'A trash bin is full. Empty it and take the bag to the dumpster.'];
    else if (s.phase === 'prep') hint = ['🔓', 'The store is closed. Stock up, then open it with the sign at the entrance.'];
    else if (s.phase === 'night' || s.phase === 'closing') hint = ['🌙', 'Closed for today. Restock and clean, then tap 🌙 to end the day.'];
    else {
      const empty = [...g.shelves.refs.values()].filter((r) => r.stock.pid && r.stock.count === 0).length;
      if (empty > 0) hint = ['📦', `${empty} shelf spot${empty > 1 ? 's are' : ' is'} empty. Restock or order more!`];
    }
    if (hint) g.ui.hud.setHint(hint[0], hint[1]);
    else g.ui.hud.setHint(null);
  }
}
