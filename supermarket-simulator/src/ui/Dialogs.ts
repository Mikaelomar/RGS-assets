// Smaller dialogs: price editor, level up, end-of-day summary, bankruptcy.
import type { Game } from '../game/Game';
import { h, money, round2, clamp, WEEKDAYS } from '../core/util';
import { PRODUCT_MAP } from '../data/products';
import { productIcon } from '../gfx/Icons';
import { iconDataURL } from '../gfx/ProductArt';
import { audio } from '../core/Audio';
import { titleFor, xpToNext } from '../data/levels';
import type { DayStats } from '../game/state';
import type { Customer } from '../game/Customers';
import { dayProfit, dayCashFlow } from '../game/Sim';

export class Dialogs {
  constructor(private g: Game) {}

  price(pid: string) {
    const g = this.g;
    const s = g.state;
    const p = PRODUCT_MAP.get(pid)!;
    const big = h('div', { class: 'price-big' });
    const info = h('div', { class: 'note', style: { textAlign: 'center' } });
    const update = () => {
      const price = s.prices[pid];
      big.textContent = money(price);
      const margin = (price - p.cost) / price;
      const ratio = price / p.price;
      const verdict = ratio > 1.25 ? '😠 Customers think this is way too expensive' : ratio > 1.1 ? '😒 A bit pricey — some customers will skip it' : ratio < 0.9 ? '🤑 Bargain! Customers love it (low margin)' : '🙂 Fair price';
      info.innerHTML = '';
      info.append(
        h('div', null, `Cost ${money(p.cost)} · Market price ${money(p.price)} · Margin ${Math.round(margin * 100)}%`),
        h('div', { style: { marginTop: '4px', fontSize: '15px' } }, verdict));
      g.shelves.refreshPriceTag(pid);
    };
    const step = (d: number) => {
      s.prices[pid] = round2(clamp(s.prices[pid] + d, 0.05, p.price * 5));
      audio.play('key');
      update();
    };
    const body = h('div', null,
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('img', { src: productIcon(pid) || iconDataURL(p), style: { width: '84px', height: '84px' } }),
        h('div', null, h('div', { class: 'section-title', style: { margin: 0 } }, p.name), info)),
      big,
      h('div', { class: 'stepper' },
        h('button', { class: 'btn red', onclick: () => step(-1) }, '−1'),
        h('button', { class: 'btn red', onclick: () => step(-0.1) }, '−0.10'),
        h('button', { class: 'btn red', onclick: () => step(-0.01) }, '−0.01'),
        h('button', { class: 'btn green', onclick: () => step(0.01) }, '+0.01'),
        h('button', { class: 'btn green', onclick: () => step(0.1) }, '+0.10'),
        h('button', { class: 'btn green', onclick: () => step(1) }, '+1')),
      h('div', { class: 'stepper', style: { marginTop: '10px' } },
        h('button', { class: 'btn gray', onclick: () => { s.prices[pid] = p.price; update(); } }, 'Market price'),
        h('button', { class: 'btn gray', onclick: () => { s.prices[pid] = round2(Math.floor(s.prices[pid]) + 0.99); update(); } }, 'Round to .99'),
        h('button', { class: 'btn', onclick: () => close() }, 'Done')));
    update();
    const close = this.g.ui.modal('SET PRICE', body, { size: 'medium', onClose: () => { g.tutorial.event('price'); g.onDialogClosed(); } });
  }

  levelUp(level: number, fromLevel = level) {
    const g = this.g;
    const unlocks = [];
    for (let l = fromLevel; l <= level; l++) unlocks.push(...g.sim.unlocks(l));
    const list = h('div', { class: 'row', style: { justifyContent: 'center', gap: '6px', maxHeight: '40vh', overflowY: 'auto' } },
      ...unlocks.slice(0, 18).map((u) => h('span', { class: 'tag blue', style: { fontSize: '13px', padding: '4px 8px' } }, `${u.icon} ${u.name}`)));
    const body = h('div', { style: { textAlign: 'center' } },
      h('div', { style: { fontSize: '64px', lineHeight: '1' } }, '⭐'),
      h('div', { class: 'price-big' }, `LEVEL ${level}`),
      h('div', { class: 'section-title' }, titleFor(level)),
      unlocks.length ? h('div', { class: 'note', style: { marginBottom: '6px' } }, 'New unlocks:') : h('div', { class: 'note' }, 'Keep growing your store!'),
      list,
      h('div', { class: 'note', style: { margin: '10px 0' } }, `Bonus cash received! Next level: ${xpToNext(level)} XP`),
      h('button', { class: 'btn big green', onclick: () => close() }, 'AWESOME!'));
    const close = g.ui.modal('LEVEL UP!', body, { size: 'small', color: 'green', onClose: () => g.onDialogClosed(true) });
  }

  daySummary(d: DayStats, bills: Record<string, number>, onContinue: () => void) {
    const g = this.g;
    const s = g.state;
    const profit = dayProfit(d);
    const sat = d.satCount ? Math.round(d.satSum / d.satCount) : 0;
    const tbl = h('table', { class: 'tbl' });
    const row = (k: string, v: number) => tbl.appendChild(h('tr', null, h('td', null, k), h('td', { style: { textAlign: 'right', color: v < 0 ? '#d32f2f' : '#1f9e42' } }, money(v))));
    row('Sales', d.revenue);
    if (d.tips) row('Tips', d.tips);
    for (const [k, v] of Object.entries(d.income)) row(k.charAt(0).toUpperCase() + k.slice(1), v);
    row('Cost of goods sold', -d.cogs);
    for (const [k, v] of Object.entries(bills)) if (v > 0) row(`Bill: ${k}`, -v);
    const other = Object.entries(d.expenses).filter(([k]) => !(k in bills));
    for (const [k, v] of other) row(k.charAt(0).toUpperCase() + k.slice(1), -v);
    const best = Object.entries(d.sold).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([pid, n]) => `${PRODUCT_MAP.get(pid)!.name} ×${n}`).join(', ');
    const rewardBtn = profit > 20 ? h('button', { class: 'btn orange', onclick: () => { g.ads.rewarded('bonus', Math.round(Math.min(profit * 0.5, 2000))); rewardBtn!.classList.add('disabled'); } }, `▶️ Watch ad: +${money(Math.round(Math.min(profit * 0.5, 2000)), 0)} bonus`) : null;
    const body = h('div', null,
      h('div', { class: 'kpis' },
        kpiBox('Customers', `${d.served}/${d.customers}`),
        kpiBox('Items sold', String(d.itemsSold)),
        kpiBox('Satisfaction', d.satCount ? `${sat}%` : '—'),
        kpiBox('Profit', money(profit), profit >= 0 ? 'pos' : 'neg'),
        kpiBox('Cash', money(s.money), s.money >= 0 ? '' : 'neg'),
        kpiBox('Rating', `${s.reputation.toFixed(1)} ★`)),
      best ? h('div', { class: 'note', style: { margin: '8px 0' } }, `🔥 Best sellers: ${best}`) : null,
      d.walkouts ? h('div', { class: 'note', style: { color: '#d32f2f' } }, `😠 ${d.walkouts} customers left without buying (long waits)`) : null,
      h('div', { class: 'section-title' }, 'Today’s money'),
      tbl,
      h('div', { class: 'note', style: { margin: '6px 0' } }, `Net cash change: ${money(dayCashFlow(d))}`),
      s.money < 0 ? h('div', { class: 'note', style: { color: '#d32f2f', fontSize: '15px' } }, `⚠️ You are in debt! ${3 - s.negativeDays} day(s) left before bankruptcy. Take a loan in Finance or cut costs.`) : null,
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } },
        rewardBtn,
        h('button', { class: 'btn big green', onclick: () => close() }, `START DAY ${s.day + 1} ▶`)));
    const close = g.ui.modal(`END OF DAY ${d.day} · ${WEEKDAYS[(d.day - 1) % 7].toUpperCase()}`, body, { size: 'medium', color: 'orange', noClose: true, onClose: onContinue });
  }

  complaint(c: Customer) {
    const g = this.g;
    const reasons: Record<string, string> = {
      missing: 'I could not find half of the things on my list! Your shelves are empty.',
      expensive: 'Your prices are way too high. I can get this cheaper elsewhere!',
      dirty: 'This place is dirty. Do you ever clean the floor?',
      wait: 'I waited forever at the checkout. Hire more cashiers!',
      expired: 'I found expired food on your shelves. That is disgusting!',
      change: 'The cashier gave me the wrong change!',
      refund: 'You refused to refund a faulty product! I want my money back.',
    };
    const key = ['refund', 'expired', 'change', 'wait', 'missing', 'dirty', 'expensive'].find((k) => c.notes.has(k)) ?? 'missing';
    let done = false;
    const finish = (mood: number, rep: number, cost: number, msg: string, xp: number) => {
      if (done) return;
      done = true;
      close();
      if (cost > 0) g.sim.spend(cost, 'compensation');
      c.mood += mood;
      g.state.reputation = Math.max(0.5, Math.min(5, g.state.reputation + rep));
      c.agent.human.pose = 'idle';
      c.think(mood > 10 ? '🙂' : '😤', 2.5);
      g.ui.toast(msg, mood > 0 ? 'good' : 'bad', mood > 0 ? '🤝' : '😤');
      if (xp) g.actions.gainXP(xp, c.pos.clone().setY(1.8));
      g.customers.finishVisit(c, true);
    };
    const body = h('div', null,
      h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } },
        h('div', { style: { fontSize: '48px' } }, '😡'),
        h('div', null, h('div', { class: 'section-title', style: { margin: 0 } }, c.name), h('p', { style: { fontWeight: '800', fontSize: '16px', margin: '4px 0 12px' } }, `“${reasons[key]}”`))),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn green', onclick: () => finish(30, 0.04, 5, 'You gave a $5 voucher. The customer is happy again.', 4) }, '🎟️ Give $5 voucher'),
        h('button', { class: 'btn', onclick: () => finish(12, 0.01, 0, 'You apologized and promised to improve.', 3) }, '🙏 Apologize'),
        h('button', { class: 'btn red', onclick: () => finish(-10, -0.03, 0, 'The customer leaves furious...', 0) }, '🙅 Not my problem')));
    const close = g.ui.modal('CUSTOMER COMPLAINT', body, { size: 'medium', color: 'red', onClose: () => { if (!done) finish(0, -0.01, 0, 'The customer walked away.', 0); } });
  }

  seasonWelcome() {
    const g = this.g;
    const li = (t: string) => h('li', { style: { margin: '5px 0' } }, t);
    const body = h('div', null,
      h('div', { style: { fontSize: '54px', textAlign: 'center', lineHeight: '1' } }, '🎄'),
      h('p', { style: { fontWeight: '800', fontSize: '16px', textAlign: 'center', margin: '6px 0 8px' } }, 'The Christmas season has started in town!'),
      h('ul', { style: { fontWeight: '700', fontSize: '14px', paddingLeft: '18px', margin: '0 0 8px' } },
        li('🎁 A free Christmas tree was delivered to your delivery spot. Carry it inside and build it!'),
        li('🍪 Christmas specials in the Market: gingerbread, chocolate boxes, candy canes, stollen, a winter berry drink and more.'),
        li('🛍️ Christmas shoppers: about 15% more customers until 6 January.'),
        li('❄️ Snowy days bring more dirt inside. Keep the mop ready!')),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn green', onclick: () => close() }, 'MERRY CHRISTMAS!')));
    const close = g.ui.modal("SEASON'S GREETINGS", body, { size: 'medium', color: 'red' });
  }

  bankrupt(onRestart: () => void, onLoan: () => void) {
    const g = this.g;
    const body = h('div', { style: { textAlign: 'center' } },
      h('div', { style: { fontSize: '60px' } }, '📉'),
      h('p', { style: { fontWeight: '800', fontSize: '17px' } }, 'Your store has been in debt for too long. The bank is closing your business!'),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn orange', onclick: () => { close(); onLoan(); } }, '🏦 Emergency loan'),
        h('button', { class: 'btn red', onclick: () => { close(); onRestart(); } }, 'Start over')));
    const close = g.ui.modal('BANKRUPT', body, { size: 'small', color: 'red', noClose: true });
  }
}

function kpiBox(k: string, v: string, cls = '') {
  return h('div', { class: 'kpi' }, h('div', { class: 'k' }, k), h('div', { class: 'v ' + cls }, v));
}
