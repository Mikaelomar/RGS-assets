// Heads-up display: top bar, status, hint card, prompt, action buttons, side buttons.
import { h, money, moneyShort, clockText } from '../core/util';
import type { Input, ButtonName } from '../core/Input';
import { audio } from '../core/Audio';
import { haptic } from '../core/Platform';

export class HUD {
  readonly el: HTMLElement;
  private dayD: HTMLElement;
  private dayT: HTMLElement;
  private lvlNum: HTMLElement;
  private xpFill: HTMLElement;
  private energyV: HTMLElement;
  private moneyV: HTMLElement;
  private openPill: HTMLElement;
  private custV: HTMLElement;
  private rateV: HTMLElement;
  private hintEl: HTMLElement;
  private hintIco: HTMLElement;
  private hintText: HTMLElement;
  private hintProg: HTMLElement;
  private promptEl: HTMLElement;
  private cross: HTMLElement;
  private mainBtn: HTMLElement;
  private mainIco: HTMLElement;
  private mainLbl: HTMLElement;
  private dropBtn: HTMLElement;
  private toolBtn: HTMLElement;
  private runBtn: HTMLElement;
  private holdRing: SVGSVGElement;
  private holdCircle: SVGCircleElement;
  private fpsEl: HTMLElement;
  readonly side: HTMLElement;
  private badges = new Map<string, HTMLElement>();
  readonly avatarImg: HTMLImageElement;
  onGear: () => void = () => {};
  onMoney: () => void = () => {};
  onEnergy: () => void = () => {};
  private last = { money: NaN, energy: NaN, min: NaN, lvl: NaN, xp: NaN, day: NaN };

  constructor(parent: HTMLElement, private input: Input) {
    this.dayD = h('div', { class: 'd' }, 'Day 1');
    this.dayT = h('div', { class: 't' }, '08:00 AM');
    this.lvlNum = h('span', null, '1');
    this.xpFill = h('div');
    this.energyV = h('span', null, '100');
    this.moneyV = h('span', null, '$0');
    const top = h('div', { class: 'topbar' },
      h('div', { class: 'daybox passive' }, this.dayD, this.dayT),
      h('div', { class: 'pill lvl passive' }, h('div', { class: 'star' }, this.lvlNum), h('div', { class: 'xpbar' }, this.xpFill)),
      h('div', { class: 'pill', onclick: () => this.onEnergy() }, h('span', { class: 'ico' }, '⚡'), h('span', { class: 'plus' }, '+'), this.energyV),
      h('div', { class: 'pill', onclick: () => this.onMoney() }, h('span', { class: 'ico' }, '💵'), h('span', { class: 'plus' }, '+'), this.moneyV),
      h('div', { class: 'pill gear', onclick: () => { audio.play('click'); this.onGear(); } }, '⚙️'),
    );
    this.openPill = h('div', { class: 'status-open closed' }, 'CLOSED');
    this.custV = h('span', null, '0');
    this.rateV = h('span', null, '3.0');
    const status = h('div', { class: 'statusbar passive' },
      this.openPill,
      h('div', { class: 'pill minipill' }, h('span', { class: 'ico' }, '👥'), this.custV),
      h('div', { class: 'pill minipill' }, h('span', { class: 'ico' }, '⭐'), this.rateV),
    );
    this.hintIco = h('div', { class: 'hico' }, '💡');
    this.hintText = h('div');
    this.hintProg = h('div', { class: 'progress' });
    this.avatarImg = h('img', { alt: '' }) as HTMLImageElement;
    this.hintEl = h('div', { class: 'hint hide passive' },
      h('div', { class: 'bubble' }, this.hintIco, h('div', null, this.hintText, this.hintProg)),
      h('div', { class: 'avatar' }, this.avatarImg));
    this.cross = h('div', { class: 'crosshair' });
    this.promptEl = h('div', { class: 'prompt', style: { display: 'none' } });
    this.holdRing = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.holdRing.setAttribute('class', 'holdring');
    this.holdRing.setAttribute('viewBox', '0 0 46 46');
    this.holdCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.holdCircle.setAttribute('cx', '23');
    this.holdCircle.setAttribute('cy', '23');
    this.holdCircle.setAttribute('r', '19');
    this.holdCircle.setAttribute('fill', 'none');
    this.holdCircle.setAttribute('stroke', '#ffd23f');
    this.holdCircle.setAttribute('stroke-width', '5');
    this.holdCircle.setAttribute('stroke-linecap', 'round');
    this.holdCircle.setAttribute('transform', 'rotate(-90 23 23)');
    this.holdCircle.setAttribute('stroke-dasharray', '0 200');
    this.holdRing.appendChild(this.holdCircle);
    this.holdRing.style.display = 'none';

    this.mainIco = h('span', null, '✋');
    this.mainLbl = h('span', { class: 'lbl' }, '');
    this.mainBtn = h('div', { class: 'btn-round main' }, this.mainIco, this.mainLbl);
    this.dropBtn = h('div', { class: 'btn-round small drop hidden' }, '⤵️');
    this.toolBtn = h('div', { class: 'btn-round small tool hidden' }, '🧹');
    this.runBtn = h('div', { class: 'btn-round small run' }, '🏃');
    this.bindButton(this.mainBtn, 'action');
    this.bindButton(this.dropBtn, 'drop');
    this.bindButton(this.toolBtn, 'tool');
    const toggleRun = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.runToggle = !this.input.runToggle;
      this.runBtn.classList.toggle('on', this.input.runToggle);
      audio.play('click');
    };
    this.runBtn.addEventListener('touchstart', toggleRun, { passive: false });
    this.runBtn.addEventListener('mousedown', toggleRun);
    const actions = h('div', { class: 'actions' }, this.mainBtn, this.dropBtn, this.toolBtn, this.runBtn);
    this.side = h('div', { class: 'sidebtns' });
    this.fpsEl = h('div', { class: 'fpsmeter', style: { display: 'none' } });
    this.el = h('div', { class: 'hud-inner' }, top, status, this.hintEl, this.cross, this.holdRing as unknown as HTMLElement, this.promptEl, actions, this.side, this.fpsEl);
    parent.appendChild(this.el);
  }

  private bindButton(el: HTMLElement, name: ButtonName) {
    const down = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('down');
      this.input.buttonDown(name);
      haptic('light');
    };
    const up = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('down');
      this.input.buttonUp(name);
    };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', (e) => { if (el.classList.contains('down')) up(e); });
  }

  addSideButton(id: string, icon: string, tip: string, onClick: () => void, cls = ''): HTMLElement {
    const badge = h('div', { class: 'badge', style: { display: 'none' } });
    const b = h('div', { class: 'sidebtn ' + cls, onclick: (e: Event) => { e.stopPropagation(); audio.play('click'); onClick(); } }, icon, badge, h('div', { class: 'tip' }, tip));
    b.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.side.appendChild(b);
    this.badges.set(id, badge);
    return b;
  }
  setBadge(id: string, n: number | string) {
    const b = this.badges.get(id);
    if (!b) return;
    b.style.display = n ? '' : 'none';
    b.textContent = String(n);
  }

  setTop(day: number, weekday: string, minutes: number, level: number, xpFrac: number, energy: number, cash: number) {
    const L = this.last;
    if (L.day !== day) { this.dayD.textContent = `Day ${day} · ${weekday.slice(0, 3)}`; L.day = day; }
    const mm = Math.floor(minutes);
    if (L.min !== mm) { this.dayT.textContent = clockText(mm); L.min = mm; }
    if (L.lvl !== level) { this.lvlNum.textContent = String(level); L.lvl = level; }
    const xp = Math.round(xpFrac * 100);
    if (L.xp !== xp) { this.xpFill.style.width = xp + '%'; L.xp = xp; }
    const en = Math.round(energy);
    if (L.energy !== en) { this.energyV.textContent = String(en); this.energyV.style.color = en < 20 ? '#ff6b6b' : ''; L.energy = en; }
    const c = Math.round(cash * 100);
    if (L.money !== c) { this.moneyV.textContent = Math.abs(cash) >= 10000 ? moneyShort(cash) : money(cash, Math.abs(cash) >= 1000 ? 0 : 2); this.moneyV.style.color = cash < 0 ? '#ff6b6b' : ''; L.money = c; }
  }

  setStatus(open: boolean, label: string, customers: number, rating: number) {
    this.openPill.className = 'status-open ' + (open ? 'open' : 'closed');
    this.openPill.textContent = label;
    this.custV.textContent = String(customers);
    this.rateV.textContent = rating.toFixed(1);
  }

  private promptKey = '';
  setPrompt(text: string | null, sub?: string, warn = false, keyHint?: string) {
    const key = `${text}|${sub}|${warn}|${keyHint}`;
    if (key === this.promptKey) return;
    this.promptKey = key;
    if (!text) {
      this.promptEl.style.display = 'none';
      this.cross.classList.remove('active');
      return;
    }
    this.promptEl.style.display = '';
    this.promptEl.className = 'prompt' + (warn ? ' warn' : '');
    this.promptEl.innerHTML = '';
    if (keyHint && !this.input.isTouch) this.promptEl.appendChild(h('span', { class: 'key' }, keyHint));
    this.promptEl.appendChild(document.createTextNode(text));
    if (sub) this.promptEl.appendChild(h('span', { class: 'sub' }, sub));
    this.cross.classList.toggle('active', !warn);
  }

  setHold(frac: number | null) {
    if (frac === null) {
      this.holdRing.style.display = 'none';
      return;
    }
    this.holdRing.style.display = '';
    const c = 2 * Math.PI * 19;
    this.holdCircle.setAttribute('stroke-dasharray', `${(c * Math.min(1, frac)).toFixed(1)} 200`);
  }

  private actKey = '';
  setAction(icon: string, label: string, ready: boolean) {
    const k = icon + label + ready;
    if (k === this.actKey) return;
    this.actKey = k;
    this.mainIco.textContent = icon;
    this.mainLbl.textContent = label;
    this.mainBtn.classList.toggle('ready', ready);
  }

  showDrop(v: boolean, icon = '⤵️') {
    this.dropBtn.classList.toggle('hidden', !v);
    if (this.dropBtn.firstChild && this.dropBtn.firstChild.textContent !== icon) this.dropBtn.firstChild.textContent = icon;
  }
  showTool(v: boolean, icon = '🧹') {
    this.toolBtn.classList.toggle('hidden', !v);
    if (this.toolBtn.textContent !== icon) this.toolBtn.textContent = icon;
  }

  private hintKey = '';
  setHint(icon: string | null, text = '', progress = '') {
    const k = `${icon}|${text}|${progress}`;
    if (k === this.hintKey) return;
    this.hintKey = k;
    if (!icon) {
      this.hintEl.classList.add('hide');
      return;
    }
    this.hintEl.classList.remove('hide');
    this.hintIco.textContent = icon;
    this.hintText.textContent = text;
    this.hintProg.textContent = progress;
    this.hintProg.style.display = progress ? '' : 'none';
  }

  setFps(text: string | null) {
    this.fpsEl.style.display = text ? '' : 'none';
    if (text) this.fpsEl.textContent = text;
  }

  setVisible(v: boolean) {
    this.el.style.display = v ? '' : 'none';
  }

  showTouchControls(v: boolean) {
    (this.el.querySelector('.actions') as HTMLElement).style.display = v ? '' : 'none';
  }
}
