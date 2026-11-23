// DOM UI root: HUD, toasts, floating world texts, markers, modals.
import * as THREE from 'three';
import './hud.css';
import { h } from '../core/util';
import { audio } from '../core/Audio';
import { HUD } from './HUD';
import type { Input } from '../core/Input';

interface Anchor { el: HTMLElement; pos: THREE.Vector3 | (() => THREE.Vector3 | null); ttl: number; rise: number; t: number; edge?: boolean; }

const _v = new THREE.Vector3();

export class UI {
  readonly root: HTMLElement;
  readonly layer: HTMLElement;
  readonly hud: HUD;
  private toastBox: HTMLElement;
  private anchors: Anchor[] = [];
  private modals: { el: HTMLElement; onClose?: () => void }[] = [];
  onModalChange: (open: boolean) => void = () => {};

  constructor(root: HTMLElement, private input: Input) {
    this.root = root;
    this.layer = h('div', { class: 'hud' });
    root.appendChild(this.layer);
    this.hud = new HUD(this.layer, input);
    this.toastBox = h('div', { class: 'toasts' });
    root.appendChild(this.toastBox);
  }

  toast(msg: string, kind: 'good' | 'bad' | 'info' | '' = '', icon = '', ms = 2600) {
    const el = h('div', { class: 'toast ' + kind }, icon ? h('span', null, icon) : null, h('span', null, msg));
    this.toastBox.appendChild(el);
    while (this.toastBox.children.length > 4) this.toastBox.firstElementChild?.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 380);
    }, ms);
  }

  floaty(pos: THREE.Vector3, text: string, cls = '') {
    const el = h('div', { class: 'floaty ' + cls }, text);
    this.root.appendChild(el);
    this.anchors.push({ el, pos: pos.clone(), ttl: 1.3, rise: 60, t: 0 });
  }

  /** Persistent anchored element (thought bubble / marker); returns remover. */
  anchor(el: HTMLElement, pos: () => THREE.Vector3 | null, edge = false): () => void {
    this.root.appendChild(el);
    const a: Anchor = { el, pos, ttl: Infinity, rise: 0, t: 0, edge };
    this.anchors.push(a);
    return () => {
      a.ttl = 0;
    };
  }

  update(dt: number, camera: THREE.PerspectiveCamera, w: number, hgt: number) {
    for (let i = this.anchors.length - 1; i >= 0; i--) {
      const a = this.anchors[i];
      a.t += dt;
      if (a.t >= a.ttl) {
        a.el.remove();
        this.anchors.splice(i, 1);
        continue;
      }
      const p = typeof a.pos === 'function' ? a.pos() : a.pos;
      if (!p) {
        a.el.style.display = 'none';
        continue;
      }
      _v.copy(p).project(camera);
      const behind = _v.z > 1;
      let x = (_v.x * 0.5 + 0.5) * w;
      let y = (-_v.y * 0.5 + 0.5) * hgt;
      if (a.edge) {
        const margin = 40;
        const off = behind || x < margin || x > w - margin || y < margin || y > hgt - margin;
        if (off) {
          let dx = _v.x, dy = -_v.y;
          if (behind) { dx = -dx; dy = -dy; }
          const ang = Math.atan2(dy, dx);
          const r = Math.min(w, hgt) * 0.42;
          x = w / 2 + Math.cos(ang) * r;
          y = hgt / 2 + Math.sin(ang) * r;
          a.el.classList.add('edge');
          (a.el.firstElementChild as HTMLElement | null)?.style.setProperty('transform', `rotate(${ang + Math.PI / 2}rad)`);
        } else {
          a.el.classList.remove('edge');
          (a.el.firstElementChild as HTMLElement | null)?.style.setProperty('transform', '');
        }
        a.el.style.display = '';
        a.el.style.left = x + 'px';
        a.el.style.top = y + 'px';
        continue;
      }
      if (behind || x < -50 || x > w + 50 || y < -50 || y > hgt + 50) {
        a.el.style.display = 'none';
        continue;
      }
      a.el.style.display = '';
      const k = a.ttl === Infinity ? 0 : a.t / a.ttl;
      a.el.style.left = x + 'px';
      a.el.style.top = y - a.rise * k + 'px';
      if (a.ttl !== Infinity) a.el.style.opacity = String(1 - Math.max(0, k - 0.6) / 0.4);
    }
  }

  get modalOpen() { return this.modals.length > 0; }

  /** Opens a window. Returns a close function. */
  modal(title: string, body: HTMLElement, opts: { size?: 'small' | 'medium' | 'large'; color?: string; onClose?: () => void; noClose?: boolean; nopad?: boolean } = {}): () => void {
    this.input.reset();
    const close = () => {
      const idx = this.modals.findIndex((m) => m.el === overlay);
      if (idx < 0) return;
      this.modals.splice(idx, 1);
      overlay.remove();
      opts.onClose?.();
      this.onModalChange(this.modals.length > 0);
    };
    const titleEl = h('div', { class: 'wtitle ' + (opts.color ?? '') }, title, opts.noClose ? null : h('div', { class: 'wclose', onclick: () => { audio.play('click'); close(); } }, '✕'));
    const win = h('div', { class: 'window ' + (opts.size && opts.size !== 'large' ? opts.size : '') }, titleEl, h('div', { class: 'wbody' + (opts.nopad ? ' nopad' : '') }, body));
    const overlay = h('div', { class: 'overlay' }, win);
    overlay.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.root.appendChild(overlay);
    this.modals.push({ el: overlay, onClose: opts.onClose });
    this.onModalChange(true);
    return close;
  }

  closeAll() {
    for (const m of [...this.modals]) {
      m.el.remove();
      m.onClose?.();
    }
    this.modals = [];
    this.onModalChange(false);
  }

  confirm(title: string, text: string, ok = 'OK', cancel = 'Cancel', color = ''): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: boolean) => {
        if (done) return;
        done = true;
        close();
        resolve(v);
      };
      const body = h('div', null,
        h('p', { style: { fontWeight: '700', fontSize: '16px', textAlign: 'center', margin: '6px 4px 16px' } }, text),
        h('div', { class: 'row', style: { justifyContent: 'center' } },
          cancel ? h('button', { class: 'btn gray', onclick: () => { audio.play('click'); finish(false); } }, cancel) : null,
          h('button', { class: 'btn green', onclick: () => { audio.play('click'); finish(true); } }, ok)));
      const close = this.modal(title, body, { size: 'small', color, onClose: () => { if (!done) { done = true; resolve(false); } } });
    });
  }
}
