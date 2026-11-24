// Title screen, new game, load / save slots, settings, pause menu and help.
import type { Game } from '../game/Game';
import { h, money } from '../core/util';
import { audio } from '../core/Audio';
import { SLOTS, listSaves, deleteSave, saveSettings, type SlotId, type Settings, type SaveMeta } from '../game/Save';
import { requestFullscreen, isNative } from '../core/Platform';

const SLOT_NAMES: Record<SlotId, string> = { auto: 'Autosave', slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3' };

export interface MenuHandlers {
  newGame: (name: string, tutorial: boolean) => void;
  load: (slot: SlotId) => void;
  applySettings: (s: Settings) => void;
  quitToTitle: () => void;
}

export class Menus {
  private titleEl: HTMLElement | null = null;
  constructor(private g: Game, private settings: Settings, private hnd: MenuHandlers) {}

  async showTitle() {
    this.hideTitle();
    const saves = await listSaves();
    const latest = saves.sort((a, b) => b.savedAt - a.savedAt)[0];
    const btn = (label: string, cls: string, fn: () => void) => h('button', { class: 'btn big ' + cls, style: { minWidth: '260px' }, onclick: () => { audio.unlock(); audio.play('click'); fn(); } }, label);
    const card = h('div', { class: 'title-card' },
      h('div', { class: 'title-logo' }, h('div', null, 'SUPERMARKET'), h('span', null, 'LIFE SIMULATOR')),
      h('div', { class: 'title-sub' }, 'From corner shop to mega hypermarket'),
      h('div', { class: 'title-btns' },
        latest ? btn(`▶ CONTINUE`, 'green', () => this.hnd.load(latest.slot)) : null,
        latest ? h('div', { class: 'title-meta' }, `${latest.storeName} · Day ${latest.day} · Level ${latest.level} · ${money(latest.money, 0)}`) : null,
        btn('✨ NEW GAME', latest ? '' : 'green', () => this.newGame(!!latest)),
        saves.length ? btn('📂 LOAD GAME', 'dark', () => this.loadDialog()) : null,
        btn('⚙️ SETTINGS', 'dark', () => this.settingsDialog()),
      ),
      h('div', { class: 'title-foot' }, h('span', { onclick: () => this.credits() }, 'Credits'), ' · ', h('span', { onclick: () => this.help() }, 'How to play'), !isNative ? ' · ' : null, !isNative ? h('span', { onclick: () => requestFullscreen() }, 'Fullscreen') : null, ` · v${__APP_VERSION__.replace(/\.0$/, '')}`),
    );
    this.titleEl = h('div', { class: 'title-screen' }, card);
    this.titleEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.g.ui.root.appendChild(this.titleEl);
  }

  hideTitle() {
    this.titleEl?.remove();
    this.titleEl = null;
  }

  private newGame(hasSave: boolean) {
    const input = h('input', { value: 'My Supermarket', maxlength: '22', style: { fontSize: '20px', padding: '8px 12px', borderRadius: '10px', border: '3px solid #b8c9d6', width: '100%', fontFamily: 'var(--font-display)' } }) as HTMLInputElement;
    const tut = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
    const body = h('div', null,
      h('div', { class: 'section-title' }, 'Name your store'),
      input,
      h('label', { class: 'row', style: { marginTop: '12px', fontWeight: '800' } }, tut, 'Play the tutorial (recommended)'),
      hasSave ? h('div', { class: 'note', style: { marginTop: '8px' } }, 'Your autosave will be replaced by the new game. Use Load → Slots to keep old stores.') : null,
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
        h('button', { class: 'btn big green', onclick: () => { close(); this.hnd.newGame(input.value.trim() || 'My Supermarket', tut.checked); } }, 'OPEN MY SHOP')));
    const close = this.g.ui.modal('NEW GAME', body, { size: 'small' });
    setTimeout(() => input.select(), 50);
  }

  async loadDialog(saveMode = false) {
    const saves = await listSaves();
    const byslot = new Map<SlotId, SaveMeta>(saves.map((m) => [m.slot, m]));
    const list = h('div');
    let close: () => void = () => {};
    for (const slot of SLOTS) {
      if (saveMode && slot === 'auto') continue;
      const m = byslot.get(slot);
      list.appendChild(h('div', { class: 'card light', style: { minHeight: '0', marginBottom: '8px', alignItems: 'center' } },
        h('div', { class: 'cimg', style: { width: '54px', height: '54px' } }, h('span', { class: 'emoji', style: { fontSize: '30px' } }, slot === 'auto' ? '🔄' : '💾')),
        h('div', { class: 'cbody' },
          h('div', { class: 'cname' }, SLOT_NAMES[slot]),
          h('div', { class: 'cmeta' }, m ? `${m.storeName} · Day ${m.day} · Lv ${m.level} · ${money(m.money, 0)} · ${new Date(m.savedAt).toLocaleString()}` : 'Empty')),
        saveMode
          ? h('button', { class: 'btn small green', onclick: async () => { await this.g.save(slot); close(); } }, 'Save here')
          : m ? h('div', { class: 'row' },
            h('button', { class: 'btn small green', onclick: () => { close(); this.hnd.load(slot); } }, 'Load'),
            h('button', { class: 'btn small red', onclick: async () => { if (await this.g.ui.confirm('Delete save', `Delete ${SLOT_NAMES[slot]}?`, 'Delete', 'Cancel', 'red')) { await deleteSave(slot); close(); this.loadDialog(); } } }, '🗑️')) : null));
    }
    close = this.g.ui.modal(saveMode ? 'SAVE GAME' : 'LOAD GAME', list, { size: 'medium' });
  }

  settingsDialog() {
    const s = this.settings;
    const apply = () => {
      this.hnd.applySettings(s);
      saveSettings(s);
    };
    const seg = (label: string, opts: [string, string][], get: () => string, set: (v: string) => void) => {
      const row = h('div', { class: 'row' });
      const render = () => {
        row.innerHTML = '';
        for (const [v, l] of opts) row.appendChild(h('button', { class: 'btn small ' + (get() === v ? '' : 'gray'), onclick: () => { set(v); apply(); render(); } }, l));
      };
      render();
      return h('div', { style: { marginBottom: '10px' } }, h('div', { class: 'section-title', style: { margin: '0 0 4px' } }, label), row);
    };
    const slider = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void) => {
      const val = h('span', { class: 'note' }, get().toFixed(2));
      const inp = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(get()), style: { width: '100%' } }) as HTMLInputElement;
      inp.addEventListener('input', () => { set(parseFloat(inp.value)); val.textContent = parseFloat(inp.value).toFixed(2); apply(); });
      return h('div', { style: { marginBottom: '10px' } }, h('div', { class: 'row' }, h('div', { class: 'section-title', style: { margin: 0 } }, label), h('div', { class: 'spacer' }), val), inp);
    };
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => seg(label, [['1', 'On'], ['0', 'Off']], () => (get() ? '1' : '0'), (v) => set(v === '1'));
    const body = h('div', null,
      seg('Graphics quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => s.quality, (v) => (s.quality = v as Settings['quality'])),
      slider('Look sensitivity', 0.3, 2.5, 0.05, () => s.sensitivity, (v) => (s.sensitivity = v)),
      slider('Field of view', 55, 90, 1, () => s.fov, (v) => (s.fov = v)),
      toggle('Invert look up/down', () => s.invertY, (v) => (s.invertY = v)),
      slider('Sound effects', 0, 1, 0.05, () => s.sfx, (v) => (s.sfx = v)),
      slider('Music', 0, 1, 0.05, () => s.music, (v) => (s.music = v)),
      toggle('Vibration', () => s.vibration, (v) => (s.vibration = v)),
      toggle('Show FPS', () => s.showFps, (v) => (s.showFps = v)),
      toggle('Seasonal events (Christmas…)', () => s.seasonal !== false, (v) => (s.seasonal = v)),
      h('div', { class: 'row', style: { marginTop: '6px' } },
        h('button', { class: 'btn small dark', onclick: () => this.g.ads.showPrivacyOptions() }, '🔒 Ad privacy options'),
        this.g.state?.tutorialDone === false ? h('button', { class: 'btn small orange', onclick: () => { this.g.tutorial.skip(); this.g.ui.toast('Tutorial skipped', 'info'); } }, 'Skip tutorial') : null),
      h('div', { class: 'note', style: { marginTop: '8px' } }, 'Auto adjusts resolution and shadows to keep the game smooth on your phone. Anti-aliasing changes apply after restarting the app.'));
    this.g.ui.modal('SETTINGS', body, { size: 'medium' });
  }

  pauseMenu() {
    const g = this.g;
    if (g.ui.modalOpen) return;
    g.input.exitPointerLock();
    let close: () => void = () => {};
    const b = (label: string, cls: string, fn: () => void) => h('button', { class: 'btn big block ' + cls, style: { marginBottom: '8px' }, onclick: () => { audio.play('click'); fn(); } }, label);
    const body = h('div', null,
      b('▶ RESUME', 'green', () => close()),
      b('💾 SAVE GAME', '', () => { close(); this.loadDialog(true); }),
      b('📂 LOAD GAME', 'dark', () => { close(); this.loadDialog(); }),
      b('⚙️ SETTINGS', 'dark', () => { close(); this.settingsDialog(); }),
      b('❓ HOW TO PLAY', 'dark', () => { close(); this.help(); }),
      b('🏠 SAVE & QUIT TO MENU', 'orange', async () => { close(); await g.save('auto', true); this.hnd.quitToTitle(); }));
    close = g.ui.modal('PAUSED', body, { size: 'small' });
  }

  help() {
    const items: [string, string][] = [
      ['🕹️', 'Left side: joystick to walk. Right side: drag to look. 🏃 toggles running. On PC: WASD + mouse, E = use, Q = drop, Tab = manager app.'],
      ['✋', 'Look at things and tap the hand button. Hold it to fill shelves quickly, mop, repair and clean.'],
      ['📦', 'Order products on the computer (📱). A truck drops the boxes at the yellow delivery spot. Carry them inside and stock the shelves, or store them on warehouse racks.'],
      ['🏷️', 'Look at a price tag and tap to change the price. Too expensive = customers walk away. Sales bring more shoppers.'],
      ['🔓', 'Open the store with the sign at the entrance. Serve customers at the checkout: scan items, take card or cash. Exact change earns tips!'],
      ['🧹', 'Keep it clean: mop spills and dirty floors, empty trash bins, clean restrooms and fridge glass.'],
      ['🧊', 'Coolers need power. Broken fridges warm up and food spoils. Repair them fast or hire a technician.'],
      ['👥', 'From level 5 you can hire cashiers, stockers, cleaners and more. They need breaks — build a break room!'],
      ['🏗️', 'Use the 🏗️ button to move furniture. Expand the store and unlock rooms as you level up, all the way to level 500.'],
      ['🌙', 'Close at night, finish your work, then end the day with 🌙. Pay your bills — and don’t go bankrupt!'],
    ];
    const body = h('div', null, ...items.map(([i, t]) => h('div', { class: 'row', style: { alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'nowrap' } }, h('div', { style: { fontSize: '26px' } }, i), h('div', { style: { fontWeight: '700' } }, t))));
    this.g.ui.modal('HOW TO PLAY', body, { size: 'medium' });
  }

  credits() {
    const body = h('div', { style: { textAlign: 'center', fontWeight: '700' } },
      h('p', null, 'Supermarket Life Simulator'),
      h('p', null, 'Game design, code, 3D models, textures, music & sounds generated procedurally.'),
      h('p', null, 'Built with three.js and Capacitor. Fonts: Lilita One & Nunito (SIL Open Font License).'),
      h('p', null, 'All brands in the game are fictional.'));
    this.g.ui.modal('CREDITS', body, { size: 'small' });
  }
}
