// The store computer / manager tablet: market (orders), prices, staff, store upgrades, finance, reviews.
import type { Game } from '../game/Game';
import { h, money, round2, clamp, clockText } from '../core/util';
import { PRODUCTS, PRODUCT_MAP, CATEGORIES, CATEGORY_MAP, type ProductDef } from '../data/products';
import { SHOP_FURNITURE, FURN_MAP } from '../data/furniture';
import { ROLES, ROLE_MAP } from '../data/staff';
import { UPGRADES, xpToNext, titleFor } from '../data/levels';
import { ROOMS, EXPANSIONS, TIERS, tierFor } from '../game/layout';
import { productIcon, furnitureIcon } from '../gfx/Icons';
import { iconDataURL } from '../gfx/ProductArt';
import { CONFIG } from '../data/config';
import { audio } from '../core/Audio';
import { CAMPAIGNS, daysLeft, launchCampaign } from '../game/Marketing';
import { dayProfit, dayCashFlow } from '../game/Sim';

type Tab = 'market' | 'prices' | 'staff' | 'store' | 'finance' | 'reviews' | 'orders';

const TABS: [Tab, string, string][] = [
  ['market', '🛒', 'Market'], ['prices', '🏷️', 'Prices'], ['orders', '🚚', 'Orders'], ['staff', '👥', 'Staff'],
  ['store', '🏪', 'Store'], ['finance', '💰', 'Finance'], ['reviews', '⭐', 'Reviews'],
];

export class ManagerApp {
  private closeFn: (() => void) | null = null;
  private tab: Tab = 'market';
  private sub: 'products' | 'furniture' = 'products';
  private cat = 'all';
  private cart = new Map<string, number>();
  private express = false;
  private main!: HTMLElement;
  private side!: HTMLElement;
  private tabsEl!: HTMLElement;
  private bought = false;

  constructor(private g: Game) {}

  get isOpen() { return !!this.closeFn; }

  open(tab?: Tab) {
    const g = this.g;
    if (tab) this.tab = tab;
    if (this.closeFn) { this.render(); return; }
    g.input.exitPointerLock();
    this.bought = false;
    this.tabsEl = h('div', { class: 'app-tabs' });
    this.main = h('div', { class: 'app-main' });
    this.side = h('div', { class: 'app-side' });
    const body = h('div', { class: 'app' }, this.tabsEl, this.main, this.side);
    this.closeFn = g.ui.modal('STORE MANAGER', body, {
      nopad: true,
      onClose: () => {
        this.closeFn = null;
        g.onAppClosed(this.bought);
      },
    });
    this.render();
    audio.play('tab');
  }

  close() { this.closeFn?.(); }

  private render() {
    this.tabsEl.innerHTML = '';
    for (const [id, ico, label] of TABS) {
      const t = h('div', { class: 'app-tab' + (this.tab === id ? ' on' : ''), onclick: () => { audio.play('tab'); this.tab = id; this.render(); } }, h('div', null, ico, h('small', null, label)));
      this.tabsEl.appendChild(t);
    }
    this.main.innerHTML = '';
    this.side.innerHTML = '';
    this.side.style.display = this.tab === 'market' ? '' : 'none';
    switch (this.tab) {
      case 'market': return this.renderMarket();
      case 'prices': return this.renderPrices();
      case 'staff': return this.renderStaff();
      case 'store': return this.renderStore();
      case 'finance': return this.renderFinance();
      case 'reviews': return this.renderReviews();
      case 'orders': return this.renderOrders();
    }
  }

  // ---------------------------------------------------------------- market
  private productAvailable(p: ProductDef): { ok: boolean; why?: string } {
    const s = this.g.state;
    if (p.level > s.level) return { ok: false, why: `Level ${p.level}` };
    const cat = CATEGORY_MAP.get(p.category)!;
    if (cat.license && !s.licenses.includes(p.category)) return { ok: false, why: `Needs ${cat.license.name}` };
    return { ok: true };
  }

  private renderMarket() {
    const g = this.g;
    const subtabs = h('div', { class: 'subtabs' },
      h('div', { class: 'subtab' + (this.sub === 'products' ? ' on' : ''), onclick: () => { this.sub = 'products'; this.render(); } }, 'PRODUCTS'),
      h('div', { class: 'subtab' + (this.sub === 'furniture' ? ' on' : ''), onclick: () => { this.sub = 'furniture'; this.render(); } }, 'FURNITURE'));
    const bar = h('div', { class: 'searchbar' });
    if (this.sub === 'products') {
      const sel = h('select', { onchange: (e: Event) => { this.cat = (e.target as HTMLSelectElement).value; this.render(); } }) as HTMLSelectElement;
      sel.appendChild(h('option', { value: 'all' }, 'All categories'));
      sel.appendChild(h('option', { value: 'stocked' }, '★ Sold in my store'));
      sel.appendChild(h('option', { value: 'unlocked' }, 'Available now'));
      for (const c of CATEGORIES) sel.appendChild(h('option', { value: c.id }, c.name));
      sel.value = this.cat;
      bar.appendChild(sel);
    }
    bar.appendChild(h('div', { class: 'spacer' }));
    bar.appendChild(h('span', { class: 'note' }, `Cash: ${money(g.state.money)}`));
    const grid = h('div', { class: 'grid' });
    const scroll = h('div', { class: 'scroll' }, grid);
    this.main.append(subtabs, bar, scroll);
    if (this.sub === 'products') {
      let list = PRODUCTS.slice();
      const stocked = new Set(g.shelves.refs.size ? [...g.shelves.refs.values()].map((r) => r.stock.pid).filter(Boolean) as string[] : []);
      if (this.cat === 'stocked') list = list.filter((p) => stocked.has(p.id));
      else if (this.cat === 'unlocked') list = list.filter((p) => this.productAvailable(p).ok);
      else if (this.cat !== 'all') list = list.filter((p) => p.category === this.cat);
      list.sort((a, b) => Number(!this.productAvailable(a).ok) - Number(!this.productAvailable(b).ok) || a.level - b.level);
      for (const p of list) grid.appendChild(this.productCard(p));
    } else {
      const list = SHOP_FURNITURE.slice().sort((a, b) => Number(a.level > g.state.level) - Number(b.level > g.state.level) || a.level - b.level);
      for (const f of list) {
        const locked = f.level > g.state.level;
        const key = 'f:' + f.id;
        const img = furnitureIcon(f.id);
        const qty = h('span', null, String(this.cart.get(key) ?? 0));
        const card = h('div', { class: 'card' + (locked ? ' locked' : '') },
          h('div', { class: 'cimg' }, img ? h('img', { src: img }) : h('span', { class: 'emoji' }, f.icon)),
          h('div', { class: 'cbody' },
            h('div', { class: 'cname' }, f.name),
            h('div', { class: 'cmeta' }, f.desc),
            f.power ? h('div', { class: 'cmeta' }, `⚡ ${f.power} kW`) : null,
            h('div', { class: 'crow' }, h('div', { class: 'cprice' }, money(f.price, 0)), h('div', { class: 'spacer' }),
              h('button', { class: 'btn small', onclick: () => { this.addCart(key, 1); qty.textContent = String(this.cart.get(key) ?? 0); } }, 'ADD'))),
          locked ? h('div', { class: 'lockinfo' }, `🔒 Level ${f.level}`) : null);
        grid.appendChild(card);
      }
    }
    this.renderCart();
  }

  private productCard(p: ProductDef) {
    const g = this.g;
    const av = this.productAvailable(p);
    const key = 'p:' + p.id;
    let n = 1;
    const qty = h('span', null, '1');
    const img = productIcon(p.id) || iconDataURL(p);
    const boxPrice = round2(p.cost * p.perBox);
    const owned = g.shelves.shelfCount(p.id) + g.boxes.byPid(p.id).reduce((a, b) => a + b.s.count, 0);
    const card = h('div', { class: 'card' + (av.ok ? '' : ' locked') },
      h('div', { class: 'cimg' }, h('img', { src: img })),
      h('div', { class: 'cbody' },
        h('div', { class: 'cname' }, p.name),
        h('div', { class: 'cmeta' }, `📦 ${p.perBox} per box · sells ~${money(p.price)}`),
        h('div', { class: 'cmeta' }, `${displayName(p)}${p.shelfLife ? ` · fresh ${p.shelfLife} d` : ''}${owned ? ` · you have ${owned}` : ''}`),
        h('div', { class: 'crow' },
          h('div', { class: 'cprice' }, money(boxPrice)),
          h('div', { class: 'qty' },
            h('button', { onclick: () => { n = Math.max(1, n - 1); qty.textContent = String(n); } }, '−'), qty,
            h('button', { onclick: () => { n = Math.min(50, n + 1); qty.textContent = String(n); } }, '+')),
          h('button', { class: 'btn small', onclick: () => { this.addCart(key, n); } }, 'ADD'))),
      av.ok ? null : h('div', { class: 'lockinfo' }, `🔒 ${av.why}`));
    return card;
  }

  private addCart(key: string, n: number) {
    this.cart.set(key, (this.cart.get(key) ?? 0) + n);
    audio.play('click');
    this.renderCart();
  }

  private cartTotal() {
    let t = 0;
    for (const [k, q] of this.cart) {
      const [type, id] = k.split(':');
      if (type === 'p') {
        const p = PRODUCT_MAP.get(id)!;
        t += p.cost * p.perBox * q;
      } else t += FURN_MAP.get(id)!.price * q;
    }
    return round2(t);
  }

  private renderCart() {
    const g = this.g;
    if (this.tab !== 'market') return;
    this.side.innerHTML = '';
    const list = h('div', { class: 'cart-list' });
    if (!this.cart.size) list.appendChild(h('div', { class: 'note', style: { padding: '10px', textAlign: 'center' } }, 'Your cart is empty. Add products or furniture.'));
    for (const [k, q] of this.cart) {
      const [type, id] = k.split(':');
      const name = type === 'p' ? PRODUCT_MAP.get(id)!.name : FURN_MAP.get(id)!.name;
      const price = type === 'p' ? PRODUCT_MAP.get(id)!.cost * PRODUCT_MAP.get(id)!.perBox * q : FURN_MAP.get(id)!.price * q;
      list.appendChild(h('div', { class: 'cart-row' },
        h('span', { class: 'n' }, `${q}× ${name}`), h('span', null, money(price)),
        h('span', { class: 'x', onclick: () => { this.cart.delete(k); this.renderCart(); } }, '✕')));
    }
    const hasExpress = g.state.upgrades.includes('express');
    const fee = this.express && hasExpress ? CONFIG.expressFee : CONFIG.deliveryFee;
    const total = this.cartTotal();
    const deliv = h('div', { class: 'row' },
      h('button', { class: 'btn small ' + (!this.express ? '' : 'gray'), onclick: () => { this.express = false; this.renderCart(); } }, `🚚 Standard $${CONFIG.deliveryFee}`),
      h('button', { class: 'btn small ' + (this.express && hasExpress ? 'orange' : 'gray') + (hasExpress ? '' : ' disabled'), onclick: () => { this.express = true; this.renderCart(); } }, `⚡ Express $${CONFIG.expressFee}`));
    const buy = h('button', { class: 'btn big green block' + (this.cart.size ? '' : ' disabled'), onclick: () => this.buy() }, 'BUY');
    this.side.append(
      h('div', { class: 'section-title', style: { margin: '0' } }, 'CART'),
      list,
      deliv,
      h('div', { class: 'total-row' }, h('span', null, 'TOTAL'), h('span', null, money(total + (this.cart.size ? fee : 0)))),
      h('div', { class: 'row' }, buy, h('button', { class: 'btn red', onclick: () => { this.cart.clear(); this.renderCart(); } }, '🗑️')),
    );
  }

  private buy() {
    const g = this.g;
    if (!this.cart.size) return;
    const lines = [...this.cart].map(([k, q]) => {
      const [type, id] = k.split(':');
      return type === 'p' ? { pid: id, qty: q } : { fid: id, qty: q };
    });
    const express = this.express && g.state.upgrades.includes('express');
    if (g.orders.place(lines, express)) {
      this.cart.clear();
      this.bought = true;
      this.render();
    }
  }

  // ---------------------------------------------------------------- prices
  private renderPrices() {
    const g = this.g;
    const s = g.state;
    const relevant = PRODUCTS.filter((p) => g.shelves.assignedSlots(p.id).length || g.boxes.byPid(p.id).length || s.today.sold[p.id]);
    const tools = h('div', { class: 'row' },
      h('div', { class: 'section-title', style: { margin: 0 } }, 'Prices & Promotions'), h('div', { class: 'spacer' }),
      h('button', { class: 'btn small', onclick: () => this.bulkPrice(1) }, 'All → market price'),
      h('button', { class: 'btn small orange', onclick: () => this.bulkPrice(1.1) }, 'Market +10%'),
      h('button', { class: 'btn small green', onclick: () => this.bulkPrice(0.95) }, 'Market −5%'));
    const tbl = h('table', { class: 'tbl' }, h('tr', null, ...['Product', 'Cost', 'Market', 'Your price', 'Margin', 'Shelf', 'Sold today', 'Sale'].map((t) => h('th', null, t))));
    if (!relevant.length) {
      this.main.append(tools, h('div', { class: 'note', style: { padding: '20px' } }, 'Products you stock will appear here. You can also look at a shelf and tap ✋ on the price tag.'));
      return;
    }
    for (const p of relevant) {
      const priceEl = h('b', null, money(g.shelves.priceOf(p.id)));
      const margin = h('span');
      const upd = () => {
        const price = s.prices[p.id];
        priceEl.textContent = money(g.shelves.priceOf(p.id));
        const m = (price - p.cost) / price;
        margin.textContent = `${Math.round(m * 100)}%`;
        margin.style.color = price > p.price * 1.15 ? '#d32f2f' : m < 0.1 ? '#e65100' : '#1f9e42';
      };
      const step = (d: number) => {
        s.prices[p.id] = round2(clamp((s.prices[p.id] ?? p.price) + d, 0.05, p.price * 5));
        g.shelves.refreshPriceTag(p.id);
        audio.play('key');
        upd();
      };
      const promo = h('select', { onchange: (e: Event) => {
        const v = parseInt((e.target as HTMLSelectElement).value, 10);
        if (v) s.promos[p.id] = v; else delete s.promos[p.id];
        g.shelves.refreshPriceTag(p.id);
        upd();
      } }) as HTMLSelectElement;
      for (const v of [0, 10, 20, 30, 50]) promo.appendChild(h('option', { value: String(v) }, v ? `-${v}%` : '—'));
      promo.value = String(s.promos[p.id] ?? 0);
      upd();
      tbl.appendChild(h('tr', null,
        h('td', null, p.name),
        h('td', null, money(p.cost)),
        h('td', null, money(p.price)),
        h('td', null, h('div', { class: 'row', style: { gap: '4px', flexWrap: 'nowrap' } },
          h('button', { class: 'btn small gray', onclick: () => step(-0.1) }, '−'), priceEl,
          h('button', { class: 'btn small gray', onclick: () => step(0.1) }, '+'))),
        h('td', null, margin),
        h('td', null, String(g.shelves.shelfCount(p.id))),
        h('td', null, String(s.today.sold[p.id] ?? 0)),
        h('td', null, promo)));
    }
    this.main.append(tools, h('div', { class: 'note' }, 'Customers compare your price with the market price. Above +15% many walk away; sales attract more shoppers.'), h('div', { class: 'scroll' }, tbl));
  }

  private bulkPrice(mul: number) {
    const g = this.g;
    for (const p of PRODUCTS) {
      g.state.prices[p.id] = round2(Math.max(0.05, p.price * mul));
      g.shelves.refreshPriceTag(p.id);
    }
    audio.play('success');
    this.render();
  }

  // ---------------------------------------------------------------- orders
  private renderOrders() {
    const g = this.g;
    const list = h('div', { class: 'scroll' });
    const orders = g.state.orders;
    if (!orders.length) list.appendChild(h('div', { class: 'note', style: { padding: '20px' } }, 'No deliveries on the way. Order products in the Market tab.'));
    for (const o of orders) {
      const items = o.lines.map((l) => `${l.qty}× ${l.pid ? PRODUCT_MAP.get(l.pid)!.name : FURN_MAP.get(l.fid!)!.name}`).join(', ');
      list.appendChild(h('div', { class: 'card light', style: { minHeight: '0', marginBottom: '8px' } },
        h('div', { class: 'cimg' }, h('span', { class: 'emoji' }, o.express ? '⚡' : '🚚')),
        h('div', { class: 'cbody' }, h('div', { class: 'cname' }, `Order #${o.uid} · ${money(o.total)}`), h('div', { class: 'cmeta' }, items),
          h('div', { class: 'cmeta' }, o.status === 'pending' ? `Arrives in ~${Math.max(1, Math.ceil(g.orders.secondsLeft(o.uid)))} s` : 'Truck is unloading…'))));
    }
    const rush = h('button', { class: 'btn orange' + (orders.some((o) => o.status === 'pending') ? '' : ' disabled'), onclick: () => g.ads.rewarded('rush') }, '▶️ Watch ad: instant delivery');
    this.main.append(h('div', { class: 'row' }, h('div', { class: 'section-title', style: { margin: 0 } }, 'Deliveries'), h('div', { class: 'spacer' }), rush), list);
  }

  // ---------------------------------------------------------------- staff
  private renderStaff() {
    const g = this.g;
    const s = g.state;
    const wrap = h('div', { class: 'scroll' });
    if (s.level < 5) {
      wrap.appendChild(h('div', { class: 'note', style: { padding: '20px', fontSize: '16px' } }, `You run the shop alone for now. Hiring unlocks at level 5 (Cashier). You are level ${s.level}.`));
      for (const r of ROLES) wrap.appendChild(h('div', { class: 'note' }, `${r.icon} ${r.name} — level ${r.level}: ${r.desc}`));
      this.main.appendChild(wrap);
      return;
    }
    const total = g.staff.list.reduce((a, e) => a + e.s.wage * (e.s.shiftEnd - e.s.shiftStart), 0);
    wrap.appendChild(h('div', { class: 'section-title' }, `Your team (${g.staff.list.length}) · est. wages ${money(total, 0)}/day`));
    if (!g.staff.list.length) wrap.appendChild(h('div', { class: 'note' }, 'No employees yet. Hire candidates below.'));
    const hours = Array.from({ length: 19 }, (_, i) => i + 6);
    for (const e of g.staff.list) {
      const r = e.role;
      const startSel = h('select') as HTMLSelectElement;
      const endSel = h('select') as HTMLSelectElement;
      for (const hh of hours) {
        startSel.appendChild(h('option', { value: String(hh) }, `${hh}:00`));
        endSel.appendChild(h('option', { value: String(hh) }, `${hh}:00`));
      }
      startSel.value = String(e.s.shiftStart);
      endSel.value = String(e.s.shiftEnd);
      const apply = () => { g.staff.setShift(e.s.uid, parseInt(startSel.value, 10), parseInt(endSel.value, 10)); this.render(); };
      startSel.onchange = apply;
      endSel.onchange = apply;
      const promoteTo = r.promoteTo ? ROLE_MAP.get(r.promoteTo)! : null;
      wrap.appendChild(h('div', { class: 'card light', style: { marginBottom: '8px' } },
        h('div', { class: 'cimg' }, h('span', { class: 'emoji' }, r.icon)),
        h('div', { class: 'cbody' },
          h('div', { class: 'cname' }, `${e.s.name} — ${r.name}`, e.s.sick ? h('span', { class: 'tag red', style: { marginLeft: '6px' } }, 'SICK') : null),
          h('div', { class: 'cmeta' }, h('span', { class: 'stars' }, '★'.repeat(e.s.skill) + '☆'.repeat(5 - e.s.skill)), ` · ${money(e.s.wage)}/h · energy ${Math.round(e.s.energy)}% · morale ${Math.round(e.s.morale)}% · ${e.status}`),
          h('div', { class: 'row searchbar' }, h('span', { class: 'note' }, 'Shift'), startSel, h('span', null, '→'), endSel,
            h('div', { class: 'spacer' }),
            e.s.skill < 5 ? h('button', { class: 'btn small', onclick: () => { if (g.staff.train(e.s.uid)) this.render(); } }, `🎓 Train ${money(150 * e.s.skill, 0)}`) : null,
            promoteTo ? h('button', { class: 'btn small green' + (promoteTo.level > s.level ? ' disabled' : ''), onclick: () => { if (g.staff.promote(e.s.uid)) this.render(); } }, `⬆ ${promoteTo.name}`) : null,
            h('button', { class: 'btn small red', onclick: async () => { if (await g.ui.confirm('Fire employee', `Let ${e.s.name} go? You pay one day of severance.`, 'Fire', 'Cancel', 'red')) { g.staff.fire(e.s.uid); this.render(); } } }, 'Fire')))));
    }
    wrap.appendChild(h('div', { class: 'section-title' }, 'Job applicants (new ones every day)'));
    if (!s.candidates.length) g.staff.refreshCandidates();
    for (const c of s.candidates) {
      const r = ROLE_MAP.get(c.role)!;
      const fee = Math.round(c.wage * 4);
      wrap.appendChild(h('div', { class: 'card light', style: { marginBottom: '8px', minHeight: '0' } },
        h('div', { class: 'cimg' }, h('span', { class: 'emoji' }, r.icon)),
        h('div', { class: 'cbody' },
          h('div', { class: 'cname' }, `${c.name} — ${r.name}`),
          h('div', { class: 'cmeta' }, h('span', { class: 'stars' }, '★'.repeat(c.skill) + '☆'.repeat(5 - c.skill)), ` · asks ${money(c.wage)}/h`),
          h('div', { class: 'cmeta' }, r.desc),
          h('div', { class: 'crow' }, h('div', { class: 'spacer' }), h('button', { class: 'btn small green', onclick: () => { if (g.staff.hire(c)) this.render(); } }, `Hire (fee ${money(fee, 0)})`)))));
    }
    wrap.appendChild(h('div', { class: 'note', style: { marginTop: '8px' } }, 'Tip: a Break Room, Locker Room and Staff Restroom keep morale high. Tired employees work slower.'));
    this.main.appendChild(wrap);
  }

  // ---------------------------------------------------------------- store
  private renderStore() {
    const g = this.g;
    const s = g.state;
    const wrap = h('div', { class: 'scroll' });
    const tier = tierFor(s.plots.length);
    const nameInput = h('input', { value: s.storeName, maxlength: '22', style: { width: '180px' } }) as HTMLInputElement;
    const closeSel = h('select') as HTMLSelectElement;
    for (let hh = 17; hh <= 24; hh++) closeSel.appendChild(h('option', { value: String(hh) }, hh === 24 ? '24:00' : `${hh}:00`));
    closeSel.value = String(s.closeHour);
    closeSel.onchange = () => { s.closeHour = parseInt(closeSel.value, 10); g.ui.toast(`Store now closes at ${s.closeHour}:00`, 'info', '🕒'); };
    wrap.append(
      h('div', { class: 'kpis' },
        kpi('Store', s.storeName), kpi('Type', TIERS[tier].name), kpi('Size', `${s.plots.length * 64} m²`), kpi('Level', `${s.level} · ${titleFor(s.level)}`)),
      h('div', { class: 'row searchbar', style: { marginTop: '8px' } },
        h('span', { class: 'note' }, 'Store name'), nameInput,
        h('button', { class: 'btn small', onclick: () => { const v = nameInput.value.trim(); if (v) { s.storeName = v; g.rebuildStore(); g.ui.toast('Store renamed!', 'good'); } } }, 'Rename'),
        h('span', { class: 'note', style: { marginLeft: '12px' } }, `Opens ${s.openHour}:00 · closes`), closeSel),
    );
    // marketing
    const boost = Math.round(s.marketing * 100);
    wrap.appendChild(h('div', { class: 'section-title' }, `📣 Marketing${boost > 0 ? ` · now +${boost}% customers` : ''}`));
    const mGrid = h('div', { class: 'grid' });
    for (const cdef of CAMPAIGNS) {
      const locked = s.level < cdef.level;
      const left = daysLeft(s, cdef.id);
      mGrid.appendChild(h('div', { class: 'card light campaign' + (locked ? ' locked' : '') + (left ? ' running' : ''), style: { minHeight: '0' } },
        h('div', { class: 'cimg' }, h('span', { class: 'emoji' }, cdef.icon)),
        h('div', { class: 'cbody' },
          h('div', { class: 'cname' }, cdef.name),
          h('div', { class: 'cmeta' }, `${cdef.desc} +${Math.round(cdef.boost * 100)}% customers for ${cdef.days} day${cdef.days > 1 ? 's' : ''}.`),
          h('div', { class: 'crow' },
            left ? h('span', { class: 'tag green' }, `RUNNING · ${left} day${left > 1 ? 's' : ''} left`) : h('div', { class: 'cprice' }, money(cdef.cost, 0)),
            h('div', { class: 'spacer' }),
            h('button', { class: 'btn small orange' + (locked ? ' disabled' : ''), onclick: () => { if (launchCampaign(g, cdef.id)) this.render(); } }, locked ? `🔒 Lv ${cdef.level}` : left ? `Extend ${money(cdef.cost, 0)}` : 'Launch')))));
    }
    wrap.appendChild(mGrid);
    // expansion
    const nextIdx = EXPANSIONS.findIndex((e) => e.plots.some(([c, r]) => !s.plots.includes(`${c},${r}`)));
    wrap.appendChild(h('div', { class: 'section-title' }, '🏗️ Store expansion'));
    if (nextIdx < 0) wrap.appendChild(h('div', { class: 'note' }, 'Your store is fully expanded — a true Mega Hypermarket!'));
    else {
      const e = EXPANSIONS[nextIdx];
      const after = s.plots.length + e.plots.length;
      wrap.appendChild(h('div', { class: 'card light', style: { minHeight: '0' } },
        h('div', { class: 'cimg' }, h('span', { class: 'emoji' }, '🏗️')),
        h('div', { class: 'cbody' },
          h('div', { class: 'cname' }, `Expansion ${nextIdx + 1} of ${EXPANSIONS.length}: +${e.plots.length * 64} m²`),
          h('div', { class: 'cmeta' }, `After: ${TIERS[tierFor(after)].name} · more customers, more shelves`),
          h('div', { class: 'crow' }, h('div', { class: 'cprice' }, money(e.cost, 0)), h('div', { class: 'spacer' }),
            s.construction
              ? h('span', { class: 'tag' }, `🚧 Building · ready ${s.construction.doneDay > s.day ? 'tomorrow' : `at ${Math.floor(s.construction.doneMin / 60)}:${String(s.construction.doneMin % 60).padStart(2, '0')}`}`)
              : h('button', { class: 'btn small green' + (s.level < e.level ? ' disabled' : ''), onclick: () => { g.tryExpansion(nextIdx); this.close(); } }, s.level < e.level ? `🔒 Level ${e.level}` : 'Expand')))));
    }
    // rooms
    wrap.appendChild(h('div', { class: 'section-title' }, '🚪 Rooms'));
    const roomGrid = h('div', { class: 'grid' });
    for (const r of ROOMS) {
      if (r.cost <= 0) continue;
      const has = s.rooms.includes(r.id);
      const locked = s.level < r.level;
      roomGrid.appendChild(h('div', { class: 'card light' + (locked ? ' locked' : ''), style: { minHeight: '0' } },
        h('div', { class: 'cbody' },
          h('div', { class: 'cname' }, r.name),
          h('div', { class: 'cmeta' }, r.desc),
          h('div', { class: 'crow' }, has ? h('span', { class: 'tag green' }, 'OPEN') : h('div', { class: 'cprice' }, money(r.cost, 0)), h('div', { class: 'spacer' }),
            has ? null : h('button', { class: 'btn small green' + (locked ? ' disabled' : ''), onclick: () => { g.tryUnlockRoom(r.id); this.render(); } }, locked ? `🔒 Lv ${r.level}` : 'Unlock')))));
    }
    wrap.appendChild(roomGrid);
    // licenses
    wrap.appendChild(h('div', { class: 'section-title' }, '📜 Licenses'));
    const licGrid = h('div', { class: 'grid' });
    for (const c of CATEGORIES) {
      if (!c.license) continue;
      const has = s.licenses.includes(c.id);
      const locked = s.level < c.license.level;
      licGrid.appendChild(h('div', { class: 'card light' + (locked ? ' locked' : ''), style: { minHeight: '0' } },
        h('div', { class: 'cbody' },
          h('div', { class: 'cname' }, c.license.name),
          h('div', { class: 'cmeta' }, `Sell ${c.name}`),
          h('div', { class: 'crow' }, has ? h('span', { class: 'tag green' }, 'OWNED') : h('div', { class: 'cprice' }, money(c.license.cost, 0)), h('div', { class: 'spacer' }),
            has ? null : h('button', { class: 'btn small green' + (locked ? ' disabled' : ''), onclick: () => { g.buyLicense(c.id); this.render(); } }, locked ? `🔒 Lv ${c.license.level}` : 'Buy')))));
    }
    wrap.appendChild(licGrid);
    // upgrades
    wrap.appendChild(h('div', { class: 'section-title' }, '⭐ Upgrades'));
    const upGrid = h('div', { class: 'grid' });
    for (const u of UPGRADES) {
      const has = s.upgrades.includes(u.id);
      const locked = s.level < u.level;
      upGrid.appendChild(h('div', { class: 'card light' + (locked ? ' locked' : ''), style: { minHeight: '0' } },
        h('div', { class: 'cimg' }, h('span', { class: 'emoji' }, u.icon)),
        h('div', { class: 'cbody' },
          h('div', { class: 'cname' }, u.name),
          h('div', { class: 'cmeta' }, u.desc),
          h('div', { class: 'crow' }, has ? h('span', { class: 'tag green' }, 'ACTIVE') : h('div', { class: 'cprice' }, money(u.cost, 0)), h('div', { class: 'spacer' }),
            has ? null : h('button', { class: 'btn small green' + (locked ? ' disabled' : ''), onclick: () => { g.buyUpgrade(u.id); this.render(); } }, locked ? `🔒 Lv ${u.level}` : 'Buy')))));
    }
    wrap.appendChild(upGrid);
    this.main.appendChild(wrap);
  }

  // ---------------------------------------------------------------- finance
  private renderFinance() {
    const g = this.g;
    const s = g.state;
    const t = s.today;
    const wrap = h('div', { class: 'scroll' });
    const profit = dayProfit(t);
    const sat = t.satCount ? Math.round(t.satSum / t.satCount) : 0;
    wrap.append(h('div', { class: 'kpis' },
      kpi('Cash', money(s.money), s.money < 0 ? 'neg' : ''),
      kpi('Revenue today', money(t.revenue)),
      kpi('Profit today', money(profit), profit >= 0 ? 'pos' : 'neg'),
      kpi('Customers', `${t.served}/${t.customers}`),
      kpi('Satisfaction', t.satCount ? `${sat}%` : '—'),
      kpi('Reputation', `${s.reputation.toFixed(2)} ★`),
      kpi('Level', `${s.level} (${Math.floor(s.xp)}/${xpToNext(s.level)} XP)`),
      kpi('Loan', money(s.loan), s.loan > 0 ? 'neg' : ''),
      kpi('Profit 7 days', money(this.periodProfit(7)), this.periodProfit(7) >= 0 ? 'pos' : 'neg'),
      kpi('Profit 28 days', money(this.periodProfit(28)), this.periodProfit(28) >= 0 ? 'pos' : 'neg'),
      kpi('Inventory value', money(this.inventoryValue(), 0))));
    // ledger
    wrap.appendChild(h('div', { class: 'section-title' }, `Today (Day ${s.day}, ${clockText(s.minutes)})`));
    const tbl = h('table', { class: 'tbl' });
    const row = (k: string, v: number, cls = '') => tbl.appendChild(h('tr', null, h('td', null, k), h('td', { style: { textAlign: 'right', color: cls === 'neg' ? '#d32f2f' : '#1f9e42' } }, money(v))));
    row('Sales', t.revenue);
    if (t.tips) row('Tips', t.tips);
    for (const [k, v] of Object.entries(t.income)) row(cap(k), v);
    row('Cost of goods sold', -t.cogs, 'neg');
    for (const [k, v] of Object.entries(t.expenses)) row(cap(k), -v, 'neg');
    row('Cash flow today', dayCashFlow(t), dayCashFlow(t) >= 0 ? '' : 'neg');
    wrap.appendChild(tbl);
    // history chart
    const hist = [...s.history.slice(-13), t];
    wrap.appendChild(h('div', { class: 'section-title' }, 'Last days: revenue (blue) & profit (green/red)'));
    const canvas = h('canvas', { class: 'chart', width: '900', height: '220' }) as HTMLCanvasElement;
    wrap.appendChild(canvas);
    requestAnimationFrame(() => drawChart(canvas, hist.map((d) => ({ day: d.day, rev: d.revenue, profit: dayProfit(d) }))));
    // loans
    const limit = 2000 + s.level * 1500;
    wrap.appendChild(h('div', { class: 'section-title' }, '🏦 Bank loan'));
    wrap.appendChild(h('div', { class: 'note' }, `Interest ${(CONFIG.loanInterestDaily * 100).toFixed(1)}% per day. Limit ${money(limit, 0)}.`));
    const lrow = h('div', { class: 'row' });
    for (const amt of [500, 2000, 10000, 50000]) {
      if (amt > limit) continue;
      lrow.appendChild(h('button', { class: 'btn small' + (s.loan + amt > limit ? ' disabled' : ''), onclick: () => { g.takeLoan(amt); this.render(); } }, `Borrow ${money(amt, 0)}`));
    }
    if (s.loan > 0) {
      lrow.appendChild(h('button', { class: 'btn small green', onclick: () => { g.repayLoan(Math.min(s.loan, Math.max(0, s.money))); this.render(); } }, `Repay ${money(Math.min(s.loan, Math.max(0, s.money)), 0)}`));
    }
    wrap.appendChild(lrow);
    wrap.appendChild(h('div', { class: 'section-title' }, '📈 All-time'));
    wrap.appendChild(h('div', { class: 'kpis' }, kpi('Days', String(s.totals.days)), kpi('Revenue', money(s.totals.revenue, 0)), kpi('Customers', String(s.totals.customers)), kpi('Items sold', String(s.totals.itemsSold))));
    this.main.appendChild(wrap);
  }

  private periodProfit(days: number) {
    const s = this.g.state;
    return [...s.history.slice(-(days - 1)), s.today].reduce((a, d) => a + dayProfit(d), 0);
  }

  private inventoryValue() {
    const g = this.g;
    let v = 0;
    for (const ref of g.shelves.refs.values()) if (ref.stock.pid) v += ref.stock.count * PRODUCT_MAP.get(ref.stock.pid)!.cost;
    for (const b of g.boxes.items.values()) if (b.def && (b.s.kind ?? 'box') === 'box') v += b.s.count * b.def.cost;
    return v;
  }

  // ---------------------------------------------------------------- reviews
  private renderReviews() {
    const g = this.g;
    const s = g.state;
    const wrap = h('div', { class: 'scroll' });
    const stars = Math.round(s.reputation * 2) / 2;
    wrap.appendChild(h('div', { class: 'row' }, h('div', { class: 'price-big' }, `${s.reputation.toFixed(1)} `), h('div', { class: 'stars', style: { fontSize: '30px' } }, '★'.repeat(Math.floor(stars)) + (stars % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(stars))),
      h('div', { class: 'note' }, `Cleanliness ${Math.round(g.cleaning.cleanliness() * 100)}% · Indoor ${g.power.indoorTemp.toFixed(0)}°C`)));
    const lost = Object.entries(g.customers.lostSales).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (lost.length) {
      wrap.appendChild(h('div', { class: 'section-title' }, '🔍 Customers asked for (not found / too expensive)'));
      wrap.appendChild(h('div', { class: 'row' }, ...lost.map(([pid, n]) => h('span', { class: 'tag orange' }, `${PRODUCT_MAP.get(pid)!.name} ×${n}`))));
    }
    const best = Object.entries(s.today.sold).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (best.length) {
      wrap.appendChild(h('div', { class: 'section-title' }, '🔥 Best sellers today'));
      wrap.appendChild(h('div', { class: 'row' }, ...best.map(([pid, n]) => h('span', { class: 'tag blue' }, `${PRODUCT_MAP.get(pid)!.name} ×${n}`))));
    }
    wrap.appendChild(h('div', { class: 'section-title' }, '💬 Reviews'));
    if (!s.reviews.length) wrap.appendChild(h('div', { class: 'note' }, 'No reviews yet. Open the store and serve customers!'));
    for (const r of s.reviews.slice(0, 25)) {
      wrap.appendChild(h('div', { class: 'card light', style: { minHeight: '0', marginBottom: '6px' } },
        h('div', { class: 'cbody' }, h('div', { class: 'cname' }, h('span', { class: 'stars' }, '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars)), `  ${r.name} · day ${r.day}`), h('div', { class: 'cmeta' }, `“${r.text}”`))));
    }
    this.main.appendChild(wrap);
  }
}

function kpi(k: string, v: string, cls = '') {
  return h('div', { class: 'kpi' }, h('div', { class: 'k' }, k), h('div', { class: 'v ' + cls }, v));
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).replace(/([A-Z])/g, ' $1'); }
function displayName(p: ProductDef) {
  return p.display.map((d) => ({ shelf: 'shelf', fridge: 'fridge', freezer: 'freezer', produce: 'produce rack', bakery: 'bakery rack', meat: 'meat counter', fish: 'fish counter' }[d])).join(' / ');
}

function drawChart(c: HTMLCanvasElement, data: { day: number; rev: number; profit: number }[]) {
  const ctx = c.getContext('2d')!;
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const max = Math.max(10, ...data.map((d) => Math.max(d.rev, Math.abs(d.profit))));
  const zero = H * 0.72;
  const bw = W / Math.max(1, data.length);
  ctx.strokeStyle = '#c6d4df';
  ctx.beginPath();
  ctx.moveTo(0, zero);
  ctx.lineTo(W, zero);
  ctx.stroke();
  data.forEach((d, i) => {
    const x = i * bw + bw * 0.15;
    const hr = (d.rev / max) * (zero - 14);
    ctx.fillStyle = '#1c9bf0';
    ctx.fillRect(x, zero - hr, bw * 0.34, hr);
    const hp = (d.profit / max) * (zero - 14);
    ctx.fillStyle = d.profit >= 0 ? '#22a845' : '#e53935';
    ctx.fillRect(x + bw * 0.36, d.profit >= 0 ? zero - hp : zero, bw * 0.34, Math.abs(hp));
    ctx.fillStyle = '#2b4357';
    ctx.font = '14px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`D${d.day}`, x + bw * 0.35, H - 8);
  });
}
