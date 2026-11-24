// Daily missions: three goals every morning with cash + XP rewards.
// A finished mission can be claimed normally or doubled by watching an opt-in rewarded ad.
import type { Game } from './Game';
import { PRODUCT_MAP, CATEGORY_MAP, type CategoryId } from '../data/products';
import { h, money, pick, rand } from '../core/util';
import { audio } from '../core/Audio';
import { tierFor } from './layout';

export type MissionKind = 'sell' | 'revenue' | 'serve' | 'exact' | 'restock' | 'trash' | 'clean' | 'category' | 'happy' | 'rack';

export interface Mission {
  kind: MissionKind;
  target: number;
  /** Counter for event driven missions (restock, trash, …). */
  count: number;
  reward: number;
  xp: number;
  cat?: string;
  done: boolean;
  claimed: boolean;
}

export interface MissionState {
  day: number;
  list: Mission[];
  /** Days in a row with all missions completed. */
  streak: number;
}

const ICONS: Record<MissionKind, string> = {
  sell: '🛒', revenue: '💵', serve: '🧾', exact: '🪙', restock: '📦', trash: '♻️', clean: '🧹', category: '🏷️', happy: '😊', rack: '🏗️',
};

const HAPPY_MIN = 75;

export class Missions {
  private btn: HTMLElement | null = null;
  private tick = 0;
  private busy = false;

  constructor(private g: Game) {}

  get state(): MissionState | null { return this.g.state?.missions ?? null; }
  get list(): Mission[] { return this.state?.list ?? []; }

  attachButton(btn: HTMLElement) {
    this.btn = btn;
    this.refreshButton();
  }

  /** Called every frame (game time). */
  update(dt: number) {
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 1;
    this.ensure();
    this.check();
  }

  /** Make sure today's missions exist (only after the tutorial). */
  ensure() {
    const g = this.g;
    const s = g.state;
    if (!s) return;
    if (g.demo || !s.tutorialDone) {
      this.refreshButton();
      return;
    }
    if (s.missions && s.missions.day === s.day) return;
    let streak = 0;
    if (s.missions) {
      // finished but unclaimed missions from yesterday are paid out automatically
      for (const m of s.missions.list) if (m.done && !m.claimed) this.grant(m, true);
      const allDone = s.missions.list.length > 0 && s.missions.list.every((m) => m.done);
      streak = allDone && s.missions.day === s.day - 1 ? s.missions.streak + 1 : 0;
    }
    s.missions = { day: s.day, list: this.generate(), streak };
    this.refreshButton();
  }

  /** Reward multiplier from the completion streak (+10% per day, max +50%). */
  streakMul() { return 1 + Math.min(5, this.state?.streak ?? 0) * 0.1; }

  private generate(): Mission[] {
    const g = this.g;
    const s = g.state;
    const L = s.level;
    const tier = tierFor(s.plots.length);
    const hist = s.history.slice(-3);
    const avgRev = hist.length ? hist.reduce((a, d) => a + d.revenue, 0) / hist.length : 0;
    const stocked = g.shelves.stockedProducts();
    const cats = [...new Set(stocked.map((pid) => PRODUCT_MAP.get(pid)!.category))];
    const hasRack = [...g.furniture.items.values()].some((f) => !!f.def.rackSpots);
    const round = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);
    const rewardFor = (diff: number) => Math.round((25 + L * 6) * diff / 5) * 5;
    const make = (kind: MissionKind, target: number, diff: number, cat?: string): Mission =>
      ({ kind, target, count: 0, reward: rewardFor(diff), xp: Math.round((8 + L * 0.9) * diff), cat, done: false, claimed: false });
    const pool: (() => Mission | null)[] = [
      () => make('sell', round(20 + L * 2.2 + tier * 12, 5), 1),
      () => make('revenue', round(avgRev > 0 ? avgRev * rand(1.05, 1.2) : 60 + L * 15, 10), 1.1),
      () => make('serve', Math.min(12, 3 + Math.floor(L / 10)), 0.9),
      () => make('exact', Math.min(6, 2 + Math.floor(L / 20)), 0.9),
      () => make('restock', round(Math.min(300, 30 + L * 2), 5), 0.9),
      () => make('trash', Math.min(15, 4 + Math.floor(L / 8)), 0.8),
      () => (L >= 3 ? make('clean', Math.min(5, 2 + Math.floor(L / 25)), 0.9) : null),
      () => (cats.length ? make('category', round(Math.min(80, 8 + L * 0.6), 2), 1, pick(cats)) : null),
      () => (L >= 4 ? make('happy', round(Math.min(40, 10 + L / 3), 5), 1.2) : null),
      () => (hasRack ? make('rack', Math.min(12, 3 + Math.floor(L / 10)), 0.8) : null),
    ];
    const out: Mission[] = [];
    const used = new Set<MissionKind>();
    for (let tries = 0; tries < 40 && out.length < 3; tries++) {
      const m = pick(pool)();
      if (!m || used.has(m.kind)) continue;
      used.add(m.kind);
      out.push(m);
    }
    return out;
  }

  /** Event driven progress (restock, trash, …). */
  bump(kind: MissionKind, n = 1) {
    let changed = false;
    for (const m of this.list) {
      if (m.kind !== kind || m.done) continue;
      m.count += n;
      changed = true;
    }
    if (changed) this.check();
  }

  progress(m: Mission): number {
    const t = this.g.state.today;
    switch (m.kind) {
      case 'sell': return t.itemsSold;
      case 'revenue': return t.revenue;
      case 'category': {
        let n = 0;
        for (const [pid, k] of Object.entries(t.sold)) if (PRODUCT_MAP.get(pid)?.category === m.cat) n += k;
        return n;
      }
      case 'happy': return t.served;
      default: return m.count;
    }
  }

  private satisfaction() {
    const t = this.g.state.today;
    return t.satCount ? t.satSum / t.satCount : 100;
  }

  private isDone(m: Mission) {
    if (this.progress(m) < m.target) return false;
    if (m.kind === 'happy') return this.satisfaction() >= HAPPY_MIN;
    return true;
  }

  check() {
    let any = false;
    for (const m of this.list) {
      if (m.done || !this.isDone(m)) continue;
      m.done = true;
      any = true;
      audio.play('success');
      this.g.ui.toast(`Mission complete: ${this.title(m)}! Claim your reward 🎯`, 'good', ICONS[m.kind], 4000);
    }
    if (any) {
      const st = this.state!;
      if (st.list.every((m) => m.done)) this.g.ui.toast('All daily missions done! Tomorrow’s rewards get a streak bonus 🔥', 'good', '🔥', 4500);
    }
    this.refreshButton();
  }

  title(m: Mission): string {
    switch (m.kind) {
      case 'sell': return `Sell ${m.target} items`;
      case 'revenue': return `Earn ${money(m.target, 0)} in sales`;
      case 'serve': return `Serve ${m.target} customers at a register yourself`;
      case 'exact': return `Give exact change to ${m.target} cash customers`;
      case 'restock': return `Put ${m.target} products on the shelves`;
      case 'trash': return `Throw away or recycle ${m.target} empty boxes`;
      case 'clean': return `Mop up ${m.target} spills`;
      case 'category': return `Sell ${m.target} ${CATEGORY_MAP.get(m.cat as CategoryId)?.name ?? m.cat} products`;
      case 'happy': return `Serve ${m.target} customers with ${HAPPY_MIN}%+ satisfaction`;
      case 'rack': return `Store ${m.target} boxes on storage racks`;
    }
  }

  claimable() { return this.list.filter((m) => m.done && !m.claimed).length; }

  private grant(m: Mission, silent = false) {
    if (m.claimed) return;
    m.claimed = true;
    const cash = Math.round(m.reward * this.streakMul());
    this.g.sim.earn(cash, 'missions');
    this.g.sim.addXP(m.xp);
    if (!silent) {
      audio.play('coins');
      this.g.ui.toast(`+${money(cash, 0)} and +${m.xp} XP`, 'good', '🎯');
    }
  }

  async claim(m: Mission, doubleWithAd: boolean) {
    if (this.busy || !m.done || m.claimed) return;
    this.busy = true;
    try {
      // the rewarded ad pays the same amount again on success; the normal reward is paid either way
      if (doubleWithAd) await this.g.ads.rewarded('bonus', Math.round(m.reward * this.streakMul()));
      this.grant(m);
    } finally {
      this.busy = false;
    }
    this.refreshButton();
  }

  refreshButton() {
    if (!this.btn) return;
    if (!this.g.state) {
      this.btn.style.display = 'none';
      return;
    }
    const has = !!this.state && !this.g.demo && this.g.state.tutorialDone;
    this.btn.style.display = has ? '' : 'none';
    this.g.ui.hud.setBadge('missions', this.claimable());
  }

  // ------------------------------------------------------------------ UI
  open() {
    const g = this.g;
    this.ensure();
    const st = this.state;
    if (!st) {
      g.ui.toast('Finish the tutorial to unlock daily missions', 'info', '🎯');
      return;
    }
    const body = h('div', { class: 'missions' });
    const render = () => {
      body.innerHTML = '';
      const mul = this.streakMul();
      body.appendChild(h('div', { class: 'ms-head' },
        h('span', null, `Day ${st.day} · new missions every morning`),
        st.streak > 0 ? h('span', { class: 'ms-streak' }, `🔥 ${st.streak}-day streak · +${Math.round((mul - 1) * 100)}% rewards`) : null));
      for (const m of st.list) {
        const p = Math.min(m.target, this.progress(m));
        const frac = m.done ? 1 : p / m.target;
        const cash = Math.round(m.reward * mul);
        const shown = m.kind === 'revenue' ? `${money(p, 0)} / ${money(m.target, 0)}` : `${Math.floor(p)} / ${m.target}`;
        const extra = m.kind === 'happy' ? ` · satisfaction now ${Math.round(this.satisfaction())}%` : '';
        let actions: HTMLElement;
        if (m.claimed) actions = h('div', { class: 'ms-claimed' }, '✔ Claimed');
        else if (m.done) {
          actions = h('div', { class: 'ms-btns' },
            h('button', { class: 'btn green small', onclick: async () => { await this.claim(m, false); render(); } }, 'CLAIM'),
            h('button', { class: 'btn orange small', onclick: async () => { await this.claim(m, true); render(); } }, '📺 x2'));
        } else actions = h('div', { class: 'ms-left' }, `${Math.round(frac * 100)}%`);
        body.appendChild(h('div', { class: 'ms-card' + (m.done ? ' done' : '') },
          h('div', { class: 'ms-icon' }, ICONS[m.kind]),
          h('div', { class: 'ms-main' },
            h('div', { class: 'ms-title' }, this.title(m)),
            h('div', { class: 'ms-bar' }, h('div', { style: { width: `${Math.round(frac * 100)}%` } })),
            h('div', { class: 'ms-meta' }, `${shown}${extra} · reward 💵 ${money(cash, 0)} + ⭐ ${m.xp} XP`)),
          actions));
      }
      body.appendChild(h('div', { class: 'note', style: { marginTop: '8px' } }, 'Finish all three missions to start a streak: every day in a row adds +10% to mission rewards (max +50%). Unclaimed rewards are paid automatically the next morning.'));
    };
    render();
    g.ui.modal('DAILY MISSIONS', body, { size: 'medium' });
  }
}
