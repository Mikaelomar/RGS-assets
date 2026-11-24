// The game: owns all systems, carrying/boxes/racks helpers, purchases, the day cycle and the main update.
import * as THREE from 'three';
import { Engine, type Quality } from '../core/Engine';
import { Input } from '../core/Input';
import { audio } from '../core/Audio';
import { Daylight } from '../world/Daylight';
import { City } from '../world/City';
import { Building } from '../world/Building';
import { Rain } from '../world/Rain';
import { Collision } from './Collision';
import { FurnitureSystem, type FurnRT } from './Furniture';
import { StockRenderer } from './Stock';
import { ShelfSystem } from './Shelves';
import { BoxSystem, type BoxRT } from './Boxes';
import { Player } from './Player';
import { NavGrid } from './Nav';
import { Sim } from './Sim';
import { Actions } from './Actions';
import { CustomerSystem } from './Customers';
import { CheckoutSystem } from './Checkout';
import { StaffSystem } from './Staff';
import { CleaningSystem } from './Cleaning';
import { PowerSystem } from './Power';
import { EventSystem } from './Events';
import { BakerySystem } from './Bakery';
import { OrderSystem } from './Orders';
import { BuildMode } from './Build';
import { People, Markers } from './People';
import { Tutorial, drawAvatar } from './Tutorial';
import { AdManager } from './Ads';
import { Missions } from './Missions';
import { Forklift } from './Forklift';
import { recomputeMarketing, activeCampaigns } from './Marketing';
import { UI } from '../ui/UI';
import { ManagerApp } from '../ui/ManagerApp';
import { Dialogs } from '../ui/Dialogs';
import type { GameState, BoxState, FurnitureState } from './state';
import { setMaxAnisotropy } from '../gfx/Textures';
import { bumpUid, nextUid, peekUid, money, round2, WEEKDAYS } from '../core/util';
import { FURN_MAP } from '../data/furniture';
import { CATEGORY_MAP, type CategoryId } from '../data/products';
import { UPGRADE_MAP } from '../data/levels';
import { EXPANSIONS, ROOM_MAP, type RoomId, FLOOR_Y, tierFor, TIERS, DELIVERY_SPOT } from './layout';
import { Snow } from '../world/Snow';
import { currentSeason, isChristmas } from './Season';
import { writeSave, type SlotId } from './Save';
import { CONFIG } from '../data/config';
import { haptic } from '../core/Platform';

export type Mode = 'walk' | 'checkout' | 'build' | 'menu';

export class Game {
  engine: Engine;
  input: Input;
  ui: UI;
  daylight: Daylight;
  city: City;
  building: Building;
  rain: Rain;
  snow: Snow;
  private seasonT = 0;
  col = new Collision();
  nav: NavGrid;
  furniture: FurnitureSystem;
  stock: StockRenderer;
  shelves: ShelfSystem;
  boxes: BoxSystem;
  player: Player;
  sim: Sim;
  actions: Actions;
  customers: CustomerSystem;
  checkout: CheckoutSystem;
  staff: StaffSystem;
  cleaning: CleaningSystem;
  power: PowerSystem;
  events: EventSystem;
  bakery: BakerySystem;
  orders: OrderSystem;
  build: BuildMode;
  people: People;
  markers: Markers;
  tutorial: Tutorial;
  ads: AdManager;
  app: ManagerApp;
  dialogs: Dialogs;
  missions: Missions;
  forklift: Forklift;
  state!: GameState;
  mode: Mode = 'walk';
  carry: BoxRT | null = null;
  pushing: { pallet: BoxRT; riders: { b: BoxRT; off: THREE.Vector3; y: number }[]; yaw0: number } | null = null;
  private pauseReasons = new Set<string>();
  time = 0;
  private lastT = 0;
  private raf = 0;
  private running = false;
  private autosaveT = 60;
  private levelQueue: number[] = [];
  private fpsAcc = 0;
  private fpsN = 0;
  showFps = false;
  private endDayBtn!: HTMLElement;
  private endingDay = false;
  onExitToMenu: () => void = () => {};
  onPauseMenu: () => void = () => {};
  slot: SlotId = 'auto';
  /** Title screen background game (never saved). */
  demo = false;
  /** Simulation steps per frame (debug / testing fast-forward). */
  timeScale = 1;
  onFrameHook: (dt: number) => void = () => {};

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, quality: Quality) {
    this.engine = new Engine(canvas, quality);
    setMaxAnisotropy(this.engine.renderer.capabilities.getMaxAnisotropy());
    this.input = new Input(canvas, uiRoot);
    this.ui = new UI(uiRoot, this.input);
    this.ui.onModalChange = (open) => {
      this.input.enabled = !open;
      if (open) this.setPaused(true, 'modal');
      else this.setPaused(false, 'modal');
    };
    const scene = this.engine.scene;
    this.daylight = new Daylight(scene);
    this.daylight.setShadowSize(this.engine.profile.shadowSize);
    this.city = new City(this.daylight);
    scene.add(this.city.group);
    this.building = new Building(scene, this.col, this.daylight);
    this.rain = new Rain(scene);
    this.snow = new Snow(scene, (x, z) => !this.building.isIndoors(x, z));
    this.nav = new NavGrid(this.col, this.building);
    this.furniture = new FurnitureSystem(scene, this.col);
    this.stock = new StockRenderer(scene);
    this.stock.receiveShadow = quality === 'high';
    this.stock.farDist = this.engine.profile.drawDistance * 0.6;
    this.shelves = new ShelfSystem(scene, this.furniture, this.stock);
    this.boxes = new BoxSystem(scene, this.col, this.stock);
    this.player = new Player(this.engine, this.input, this.col);
    this.sim = new Sim(this);
    this.actions = new Actions(this);
    this.customers = new CustomerSystem(this);
    this.checkout = new CheckoutSystem(this);
    this.staff = new StaffSystem(this);
    this.cleaning = new CleaningSystem(this);
    this.power = new PowerSystem(this);
    this.events = new EventSystem(this);
    this.bakery = new BakerySystem(this);
    this.orders = new OrderSystem(this);
    this.build = new BuildMode(this);
    this.people = new People(this);
    this.markers = new Markers(this);
    this.tutorial = new Tutorial(this);
    this.ads = new AdManager(this);
    this.app = new ManagerApp(this);
    this.dialogs = new Dialogs(this);
    this.missions = new Missions(this);
    this.forklift = new Forklift(this);
    this.ui.hud.avatarImg.src = drawAvatar();

    this.sim.on('levelUp', (lv) => {
      this.levelQueue.push(lv);
      this.ui.toast(`Level ${lv}!`, 'good', '⭐');
    });
    this.sim.on('minute', () => this.checkConstruction());
    this.sim.on('open', (open) => {
      if (open) this.ui.toast('The store is OPEN! Customers are on their way.', 'good', '🔓');
    });
    this.input.onKeyPress((code) => {
      if (code === 'Escape' && this.mode === 'walk' && !this.ui.modalOpen) this.onPauseMenu();
      if (code === 'Tab' && this.mode === 'walk') this.app.isOpen ? this.app.close() : this.app.open();
      if (code === 'KeyB' && this.mode !== 'checkout') this.build.toggleSelect();
      if (code === 'KeyR' && this.build.active) this.build.rotate();
    });
    // side buttons
    this.ui.hud.addSideButton('app', '📱', 'Manager app (Tab)', () => this.app.open());
    this.ui.hud.addSideButton('build', '🏗️', 'Move furniture (B)', () => this.build.toggleSelect(), 'alt');
    this.missions.attachButton(this.ui.hud.addSideButton('missions', '🎯', 'Daily missions', () => this.missions.open(), 'gold'));
    this.endDayBtn = this.ui.hud.addSideButton('endday', '🌙', 'End the day', () => this.requestEndDay(false), 'green');
    this.ui.hud.onGear = () => this.onPauseMenu();
    this.ui.hud.onMoney = () => this.ads.rewarded('cash');
    this.ui.hud.onEnergy = () => this.ads.rewarded('energy');
    this.engine.onResize(() => this.ui.hud.showTouchControls(true));
  }

  // ------------------------------------------------------------------ lifecycle
  load(state: GameState) {
    this.state = state;
    bumpUid(state.nextUid);
    // reset runtime systems
    this.customers.clearAll();
    this.staff.clearAgents();
    for (const uid of [...this.boxes.items.keys()]) this.boxes.remove(uid);
    for (const f of [...this.furniture.items.values()]) {
      this.shelves.detach(f);
      this.furniture.remove(f.s.uid);
    }
    this.markers.clear();
    this.carry = null;
    this.player.setHeld(null);
    this.player.setTool(state.player.tool === 'mop' ? 'mop' : 'none');
    this.actions.hasMop = state.player.tool === 'mop' || !!state.stats.hasMop;
    this.mode = 'walk';
    this.shelves.prices = state.prices;
    this.shelves.promos = state.promos;
    this.shelves.setDay(state.day);
    this.building.rebuild(state);
    for (const fs of state.furniture) {
      const rt = this.furniture.add(fs);
      this.shelves.attach(rt);
    }
    for (const b of state.boxes) this.boxes.add(b);
    this.checkout.sync();
    this.staff.load();
    this.cleaning.load();
    this.orders.load();
    this.power.applyPower();
    if (state.weather === 'snow' && !isChristmas()) state.weather = 'cloudy';
    this.daylight.rain = state.weather === 'rain' ? 1 : 0;
    this.daylight.snow = state.weather === 'snow' ? 1 : 0;
    const p = state.player;
    this.player.pos.set(p.x, 0, p.z);
    this.player.yaw = p.yaw;
    this.player.pitch = p.pitch;
    if (p.carry) {
      const b = this.boxes.items.get(p.carry);
      if (b) this.pickUp(b, true);
    }
    for (const f of this.furniture.items.values()) if (f.s.broken) this.markers.add('broken' + f.s.uid, f.box.getCenter(new THREE.Vector3()).setY(f.def.size[2] + 0.4), '⚠️');
    if (!state.candidates.length) this.staff.refreshCandidates();
    this.building.setOpenSign(state.open);
    recomputeMarketing(state);
    this.refreshMarketingVisuals();
    this.missions.ensure();
    this.missions.refreshButton();
    this.forklift.sync();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      let dt = (t - this.lastT) / 1000;
      this.lastT = t;
      this.engine.tickPerf(dt);
      if (dt > 0.1) dt = 0.1;
      if (dt <= 0) return;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setPaused(p: boolean, reason: string) {
    if (p) this.pauseReasons.add(reason);
    else this.pauseReasons.delete(reason);
  }
  get paused() { return this.pauseReasons.size > 0; }

  // ------------------------------------------------------------------ frame
  frame(dt: number) {
    this.time += dt;
    this.input.update();
    const s = this.state;
    const sim = !this.paused;
    if (sim) {
      // player
      const speedPenalty = s.energy < 15 ? 0.7 : 1;
      this.player.speedMul = speedPenalty * (this.carry ? (this.carry.s.kind === 'furniture' ? 0.75 : 0.9) : 1) * (this.pushing ? 0.72 : 1);
      this.player.update(dt);
      this.onFrameHook(dt);
      if (this.pushing) this.updatePushing();
      this.forklift.update(dt);
      if (this.player.moving) s.energy = Math.max(0, s.energy - dt * (this.input.running ? CONFIG.energyRunDrain : 0) - dt * (this.carry ? CONFIG.energyCarryDrain : 0));
      for (let k = 0; k < this.timeScale; k++) {
        this.sim.update(dt);
        this.boxes.update(dt);
        this.customers.update(dt);
        this.staff.update(dt);
        this.checkout.update(dt);
        this.orders.update(dt);
        this.cleaning.update(dt);
        this.events.update(dt);
      }
      this.power.update(dt);
      this.markers.update(dt);
      if (this.mode === 'walk') this.actions.update(dt);
      if (this.mode === 'build') this.build.update(dt);
      this.tutorial.update(dt);
      this.missions.update(dt);
      // doors open for everyone nearby
      const agents: { x: number; z: number; staff: boolean }[] = [{ x: this.player.pos.x, z: this.player.pos.z, staff: true }];
      for (const c of this.customers.list) agents.push({ x: c.pos.x, z: c.pos.z, staff: false });
      for (const a of this.staff.agents()) agents.push({ x: a.pos.x, z: a.pos.z, staff: true });
      if (this.forklift.driving) {
        const f = this.forklift.frontPoint();
        agents.push({ x: f.x, z: f.z, staff: true });
      }
      this.building.update(dt, agents);
      this.city.update(dt, [...this.orders.blockers(), { x: this.player.pos.x, z: this.player.pos.z }]);
      // level up dialogs at a calm moment
      if (this.levelQueue.length && this.mode === 'walk' && !this.ui.modalOpen) {
        const levels = this.levelQueue.splice(0);
        this.dialogs.levelUp(levels[levels.length - 1], levels[0]);
      }
      // autosave
      this.autosaveT -= dt;
      if (this.autosaveT <= 0) {
        this.autosaveT = 75;
        if (!this.demo && this.mode !== 'menu') this.save('auto', true);
      }
      // bankruptcy check is done at day end
    } else if (this.mode === 'checkout') {
      this.input.consumeLook();
    }
    this.daylight.update(s.minutes, this.player.pos, dt);
    this.stock.update(dt, this.engine.camera.position);
    this.shelves.updateTags();
    audio.setListener(this.player.pos.x, this.player.pos.z, this.player.yaw);
    const outside = !this.building.isIndoors(this.player.pos.x, this.player.pos.z);
    audio.setLoop('street', outside ? 0.5 : 0.12);
    audio.setLoop('crowd', Math.min(0.5, this.customers.inStore * 0.03));
    audio.setLoop('rain', this.daylight.rain * (outside ? 0.6 : 0.2));
    this.rain.update(dt, this.engine.camera.position, this.daylight.rain, !outside);
    this.snow.update(dt, this.engine.camera.position, this.daylight.snow);
    this.seasonT -= dt;
    if (this.seasonT <= 0) {
      this.seasonT = 2;
      this.checkSeason();
    }
    this.updateHud(dt);
    this.engine.render();
    this.ui.update(dt, this.engine.camera, this.engine.width, this.engine.height);
    this.input.endFrame();
  }

  private updateHud(dt: number) {
    const s = this.state;
    const hud = this.ui.hud;
    hud.setTop(s.day, WEEKDAYS[(s.day - 1) % 7], s.minutes, s.level, this.sim.xpFrac(), s.energy, s.money);
    const label = s.open ? 'OPEN' : s.phase === 'prep' ? 'CLOSED' : 'CLOSED · NIGHT';
    hud.setStatus(s.open, label, this.customers.inStore, s.reputation);
    const showEnd = !s.open && (s.phase === 'closing' || s.phase === 'night' || (s.phase === 'prep' && s.totals.days === 0 && false));
    this.endDayBtn.style.display = showEnd ? '' : 'none';
    hud.setBadge('app', this.state.orders.length);
    if (this.showFps) {
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc > 0.5) {
        const info = this.engine.renderer.info.render;
        hud.setFps(`${Math.round(this.fpsN / this.fpsAcc)} fps · ${info.calls} calls · ${Math.round(info.triangles / 1000)}k tris`);
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
    } else hud.setFps(null);
  }

  // ------------------------------------------------------------------ boxes & carrying
  addBoxState(b: BoxState, vel?: THREE.Vector3): BoxRT {
    this.state.boxes.push(b);
    const rt = this.boxes.add(b);
    if (vel) this.boxes.release(rt, rt.pos.clone(), vel, b.ry);
    return rt;
  }

  removeBoxState(uid: number) {
    this.state.boxes = this.state.boxes.filter((b) => b.uid !== uid);
  }

  pickUp(b: BoxRT, silent = false) {
    if (this.carry) return;
    if (b.s.rack) this.freeRackSpot(b);
    const where = b.pos.clone();
    this.carry = b;
    this.boxes.setHeld(b, true);
    this.boxes.wake(where);
    this.player.setHeld(this.boxes.makeHeldMesh(b));
    this.state.player.carry = b.s.uid;
    if (this.player.tool === 'mop') this.player.setTool('none');
    if (!silent) {
      audio.play('pickup');
      haptic('light');
      if (b.def) this.tutorial.event('pickup', b.def.id);
    }
  }

  refreshHeld() {
    if (this.carry && this.mode === 'walk') this.player.setHeld(this.boxes.makeHeldMesh(this.carry));
    else if (!this.carry) this.player.setHeld(null);
  }

  putDown(pos: THREE.Vector3, vel: THREE.Vector3) {
    const b = this.carry;
    if (!b) return;
    this.carry = null;
    this.state.player.carry = null;
    this.player.setHeld(null);
    this.boxes.release(b, pos, vel, this.player.yaw);
    audio.play('drop', pos, 0.6);
  }

  destroyCarry() {
    const b = this.carry;
    if (!b) return;
    this.carry = null;
    this.state.player.carry = null;
    this.player.setHeld(null);
    this.boxes.remove(b.s.uid);
    this.removeBoxState(b.s.uid);
  }

  spawnCarry(partial: Partial<BoxState>) {
    const p = this.player.pos;
    const b: BoxState = { uid: nextUid(), pid: 'apple', count: 0, exp: 0, x: p.x, y: 0, z: p.z, ry: 0, kind: 'box', ...partial };
    const rt = this.addBoxState(b);
    this.pickUp(rt, true);
  }

  /** Swap the product of an (empty) carried box. */
  retargetBox(b: BoxRT, pid: string) {
    const held = this.carry === b;
    const s = b.s;
    this.boxes.remove(s.uid);
    s.pid = pid;
    const rt = this.boxes.add(s);
    if (held) {
      this.carry = rt;
      this.boxes.setHeld(rt, true);
      this.refreshHeld();
    }
  }

  // ------------------------------------------------------------------ pallet jack
  grabPallet(p: BoxRT) {
    if (this.carry || this.pushing) return;
    if (!this.state.upgrades.includes('palletjack')) {
      if (this.state.upgrades.includes('forklift')) {
        this.ui.toast('Use your forklift to move pallets (or buy the Pallet Jack upgrade)', 'info', '🚜');
        return;
      }
      this.ui.toast('Buy the Pallet Jack upgrade (Store → Upgrades) to move pallets', 'info', '🛻');
      return;
    }
    const riders = this.boxes.ridersOf(p).map((b) => ({ b, off: b.pos.clone().sub(p.pos), y: b.pos.y }));
    this.pushing = { pallet: p, riders, yaw0: this.player.yaw };
    audio.play('pickup');
    this.ui.toast(`Pallet jack: moving ${riders.length} boxes. Tap ✋ or ⤵️ to set it down.`, 'info', '🛻', 2500);
  }

  private updatePushing() {
    const pu = this.pushing!;
    const fwd = this.player.forward(new THREE.Vector3());
    let x = this.player.pos.x + fwd.x * 1.3, z = this.player.pos.z + fwd.z * 1.3;
    [x, z] = this.col.resolveCircle(x, z, 0.55, 0.05, 1.5);
    const p = pu.pallet;
    p.pos.set(x, FLOOR_Y, z);
    p.s.ry = this.player.yaw;
    this.boxes.sync(p);
    const dyaw = this.player.yaw - pu.yaw0;
    const c = Math.cos(dyaw), sn = Math.sin(dyaw);
    for (const r of pu.riders) {
      if (r.b.held || !this.boxes.items.has(r.b.s.uid)) continue;
      r.b.pos.set(x + r.off.x * c + r.off.z * sn, r.y, z - r.off.x * sn + r.off.z * c);
      r.b.resting = true;
      this.boxes.sync(r.b);
    }
  }

  releasePallet() {
    if (!this.pushing) return;
    this.pushing = null;
    audio.play('thud');
  }

  // ------------------------------------------------------------------ racks
  rackSpotPos(f: FurnRT, spot: number) {
    const sp = f.def.rackSpots![spot];
    return this.furniture.local(f, sp[0], sp[1], sp[2]);
  }

  putOnRack(b: BoxRT, f: FurnRT, spot: number): boolean {
    if (!f.s.rack || f.s.rack[spot]) return false;
    f.s.rack[spot] = b.s.uid;
    b.s.rack = { f: f.s.uid, spot };
    const p = this.rackSpotPos(f, spot);
    this.boxes.placeAt(b, p.x, p.y, p.z, f.s.ry);
    b.s.rack = { f: f.s.uid, spot };
    return true;
  }

  storeOnRack(b: BoxRT, f: FurnRT, spot: number) {
    if (this.carry !== b) return;
    this.carry = null;
    this.state.player.carry = null;
    this.player.setHeld(null);
    this.boxes.setHeld(b, false);
    if (!this.putOnRack(b, f, spot)) this.boxes.placeAt(b, this.player.pos.x, FLOOR_Y, this.player.pos.z, 0);
    else this.missions.bump('rack');
    audio.play('thud', b.pos, 0.6);
    this.actions.gainXP(1);
  }

  freeRackSpot(b: BoxRT) {
    const r = b.s.rack;
    if (!r) return;
    const f = this.furniture.items.get(r.f);
    if (f?.s.rack && f.s.rack[r.spot] === b.s.uid) f.s.rack[r.spot] = 0;
    b.s.rack = null;
  }

  findRackSpot(from: THREE.Vector3): { f: FurnRT; spot: number; pos: THREE.Vector3; access: THREE.Vector3 } | null {
    let best: { f: FurnRT; spot: number; pos: THREE.Vector3; access: THREE.Vector3; d: number } | null = null;
    for (const f of this.furniture.items.values()) {
      if (!f.def.rackSpots || !f.s.rack) continue;
      f.s.rack.forEach((v, i) => {
        if (v) return;
        const pos = this.rackSpotPos(f, i);
        const access = this.furniture.local(f, f.def.rackSpots![i][0], 0, f.def.size[1] / 2 + 0.6);
        const d = access.distanceTo(from) + pos.y * 0.5;
        if (!best || d < best.d) best = { f, spot: i, pos, access, d };
      });
    }
    return best;
  }

  nearestDumpster(from: THREE.Vector3) {
    const dumps = this.furniture.byDef('dumpster').map((f) => this.furniture.local(f, 0, 0, f.def.size[1] / 2 + 0.7));
    dumps.push(new THREE.Vector3(-11, 0, 2.2));
    return dumps.reduce((a, b) => (a.distanceTo(from) < b.distanceTo(from) ? a : b));
  }

  // ------------------------------------------------------------------ furniture
  newFurnitureState(id: string, x: number, z: number, ry: number): FurnitureState {
    const def = FURN_MAP.get(id)!;
    const f: FurnitureState = { uid: nextUid(), id, x, z, ry, cond: 100, broken: false };
    if (def.slots) f.slots = def.slots.map(() => ({ pid: null, count: 0, batches: [] }));
    if (def.rackSpots) f.rack = def.rackSpots.map(() => 0);
    if (def.coolTarget !== undefined) f.temp = def.coolTarget + 8;
    if (def.interact === 'checkout') {
      f.cash = 0;
      f.laneNo = this.furniture.byDef('checkout').length + 1;
    }
    return f;
  }

  addFurniture(fs: FurnitureState) {
    this.state.furniture.push(fs);
    const rt = this.furniture.add(fs);
    this.shelves.attach(rt);
    this.checkout.sync();
    return rt;
  }

  removeFurniture(uid: number) {
    const rt = this.furniture.items.get(uid);
    if (!rt) return;
    this.shelves.detach(rt);
    this.furniture.remove(uid);
    this.state.furniture = this.state.furniture.filter((f) => f.uid !== uid);
    this.checkout.sync();
  }

  // ------------------------------------------------------------------ purchases
  rebuildStore() {
    this.building.rebuild(this.state);
    this.checkout.sync();
    this.power.applyPower();
    this.shelves.markTags();
    this.refreshMarketingVisuals();
  }

  /** Seasonal look (winter snow) and the one-time season greeting + gift. */
  checkSeason() {
    const s = this.state;
    if (!s) return;
    const xmas = isChristmas();
    this.city.setWinter(xmas);
    if (!xmas && s.weather === 'snow') {
      s.weather = 'cloudy';
      this.daylight.snow = 0;
    }
    const se = currentSeason();
    if (!se || this.demo || !s.tutorialDone || this.mode !== 'walk' || this.ui.modalOpen) return;
    s.seasonsSeen ??= [];
    if (s.seasonsSeen.includes(se.key)) return;
    s.seasonsSeen.push(se.key);
    if (se.id === 'christmas') {
      const p = new THREE.Vector3(DELIVERY_SPOT.x + 0.9, 1.2, DELIVERY_SPOT.z + 0.2);
      this.addBoxState({ uid: nextUid(), pid: 'apple', count: 0, exp: 0, x: p.x, y: p.y, z: p.z, ry: 0.3, kind: 'furniture', furn: 'xmas_tree' }, new THREE.Vector3(0, 0, 0));
      this.markers.add('xmasgift', p.clone().setY(1.9), '🎁', 90);
      s.weather = 'snow';
      this.daylight.snow = 1;
      this.daylight.rain = 0;
      this.dialogs.seasonWelcome();
    }
  }

  /** The street billboard shows the store's ad while that campaign runs. */
  refreshMarketingVisuals() {
    const s = this.state;
    if (!s) return;
    const on = activeCampaigns(s).some((c) => c.id === 'billboard');
    this.city.setBillboard(on ? s.storeName : null, `${s.openHour}:00–${s.closeHour === 24 ? '24' : s.closeHour}:00`);
  }

  async tryExpansion(index: number) {
    const s = this.state;
    const e = EXPANSIONS[index];
    if (!e) return;
    if (s.construction) {
      this.ui.toast('Construction is already in progress!', 'info', '🏗️');
      return;
    }
    if (s.level < e.level) {
      this.ui.toast(`Expansion requires level ${e.level}`, 'bad', '🔒');
      audio.play('error');
      return;
    }
    const ok = await this.ui.confirm('Expand the store', `Build +${e.plots.length * 64} m² of new sales floor for ${money(e.cost, 0)}? Construction takes about ${Math.round((120 + index * 15) / 60 * 10) / 10} hours.`, 'Build it!');
    if (!ok) return;
    if (!this.sim.pay(e.cost, 'expansion')) return;
    const buildMin = 120 + index * 15;
    let doneMin = s.minutes + buildMin;
    let doneDay = s.day;
    if (doneMin >= 24 * 60) { doneMin -= 24 * 60; doneDay++; }
    s.construction = { index, doneDay, doneMin };
    this.rebuildStore();
    audio.play('unlock');
    haptic('heavy');
    const hh = Math.floor(doneMin / 60), mm = doneMin % 60;
    this.ui.toast(`Builders are on it! The expansion is ready ${doneDay > s.day ? 'tomorrow' : `at ${hh}:${String(mm).padStart(2, '0')}`} (or when the day ends).`, 'good', '🏗️', 5000);
    this.ads.maybeInterstitial('expansion');
  }

  /** Called every game minute and at day start: finish pending construction. */
  checkConstruction(force = false) {
    const s = this.state;
    const c = s.construction;
    if (!c) return;
    if (!force && (s.day < c.doneDay || (s.day === c.doneDay && s.minutes < c.doneMin))) return;
    const e = EXPANSIONS[c.index];
    const tierBefore = tierFor(s.plots.length);
    for (const [cc, r] of e.plots) if (!s.plots.includes(`${cc},${r}`)) s.plots.push(`${cc},${r}`);
    s.construction = null;
    this.rebuildStore();
    audio.play('levelup');
    const tierAfter = tierFor(s.plots.length);
    if (tierAfter > tierBefore) this.ui.toast(`Construction finished! Your store is now a ${TIERS[tierAfter].name}!`, 'good', '🏪', 6000);
    else this.ui.toast('Construction finished! More room for shelves.', 'good', '🏗️', 5000);
    this.sim.addXP(25 + c.index * 10);
  }

  async tryUnlockRoom(id: RoomId) {
    const s = this.state;
    const r = ROOM_MAP.get(id)!;
    if (s.rooms.includes(id)) return;
    if (s.level < r.level) {
      this.ui.toast(`${r.name} unlocks at level ${r.level}`, 'bad', '🔒');
      audio.play('error');
      return;
    }
    if (r.requires && !s.rooms.includes(r.requires)) {
      this.ui.toast(`Unlock the ${ROOM_MAP.get(r.requires)!.name} first`, 'bad', '🔒');
      return;
    }
    if (r.requiresPlot && !s.plots.includes(`${r.requiresPlot[0]},${r.requiresPlot[1]}`)) {
      this.ui.toast('Expand the store next to this room first', 'bad', '🔒');
      return;
    }
    const ok = await this.ui.confirm(`Unlock ${r.name}`, `${r.desc}\n\nCost: ${money(r.cost, 0)}`, 'Unlock');
    if (!ok) return;
    if (!this.sim.pay(r.cost, 'rooms')) return;
    s.rooms.push(id);
    if (id === 'office' && !s.rooms.includes('corridor')) s.rooms.push('corridor');
    this.rebuildStore();
    audio.play('unlock');
    this.ui.toast(`${r.name} unlocked!`, 'good', '🔓');
    this.sim.addXP(15);
  }

  buyLicense(cat: CategoryId) {
    const s = this.state;
    const c = CATEGORY_MAP.get(cat)!;
    if (!c.license || s.licenses.includes(cat)) return;
    if (s.level < c.license.level) return;
    if (!this.sim.pay(c.license.cost, 'licenses')) return;
    s.licenses.push(cat);
    audio.play('unlock');
    this.ui.toast(`${c.license.name} acquired! You can now sell ${c.name}.`, 'good', '📜');
  }

  buyUpgrade(id: string) {
    const s = this.state;
    const u = UPGRADE_MAP.get(id)!;
    if (s.upgrades.includes(id) || s.level < u.level) return;
    if (!this.sim.pay(u.cost, 'upgrades')) return;
    s.upgrades.push(id);
    audio.play('unlock');
    this.ui.toast(`${u.name} installed!`, 'good', u.icon);
    if (id === 'generator') this.power.applyPower();
    if (id === 'forklift') {
      this.forklift.sync();
      this.markers.add('forklift', new THREE.Vector3(s.forklift!.x, 2.8, s.forklift!.z), '🚜', 40);
      this.ui.toast('Your forklift is parked next to the delivery spot. Walk to it and tap ✋ to drive.', 'info', '🚜', 5000);
    }
  }

  takeLoan(v: number) {
    const s = this.state;
    s.loan = round2(s.loan + v);
    this.sim.earn(v, 'loan');
    this.ui.toast(`Borrowed ${money(v, 0)} from the bank`, 'info', '🏦');
  }
  repayLoan(v: number) {
    const s = this.state;
    v = Math.min(v, s.loan, Math.max(0, s.money));
    if (v <= 0) return;
    s.loan = round2(s.loan - v);
    this.sim.spend(v, 'loanRepay');
    this.ui.toast(`Repaid ${money(v, 0)}`, 'good', '🏦');
  }

  // ------------------------------------------------------------------ day cycle
  async requestEndDay(force: boolean) {
    const s = this.state;
    if (this.endingDay) return;
    if (s.open && !force) {
      this.ui.toast('Close the store first (the sign at the entrance).', 'info', '🔒');
      return;
    }
    if (!force && this.customers.inStore > 0) {
      const ok = await this.ui.confirm('Customers inside', 'Some customers are still shopping. End the day anyway? They will leave without buying.', 'End day');
      if (!ok) return;
    }
    if (this.mode === 'checkout') this.checkout.leave();
    if (this.build.active) this.build.cancel();
    this.endDay();
  }

  private endDay() {
    const s = this.state;
    this.endingDay = true;
    if (s.open) this.sim.closeStore(true);
    // everyone leaves
    for (const c of [...this.customers.list]) {
      this.checkout.leaveQueue(c);
      if (c.basket.length) this.customers.abandon(c);
    }
    this.customers.clearAll();
    const extraWater = this.events.extraWaterCost();
    if (extraWater > 0) this.sim.spend(extraWater, 'water');
    // ATM fees
    const atms = this.furniture.byDef('atm').length;
    if (atms) this.sim.earn(atms * (15 + s.today.customers * 0.05), 'atm');
    const bills = this.sim.chargeDailyBills();
    if (extraWater > 0) bills.water = round2((bills.water ?? 0) + extraWater);
    // uncounted register cash goes to the bank anyway (small handling fee)
    let cash = 0;
    for (const f of this.furniture.items.values()) if (f.s.cash) { cash += f.s.cash; f.s.cash = 0; }
    if (cash > 0) {
      const fee = round2(cash * 0.01);
      this.sim.spend(fee, 'cashHandling');
      bills.cashHandling = fee;
    }
    if (s.money < CONFIG.bankruptcyThreshold) s.negativeDays++;
    else s.negativeDays = 0;
    const today = s.today;
    this.dialogs.daySummary(today, bills, async () => {
      if (s.negativeDays >= CONFIG.bankruptcyDays) {
        this.dialogs.bankrupt(() => this.onExitToMenu(), () => {
          this.takeLoan(Math.max(1000, -s.money + 1500));
          s.negativeDays = 0;
          this.startNextDay();
        });
        return;
      }
      await this.ads.maybeInterstitial('dayEnd');
      this.startNextDay();
    });
  }

  private startNextDay() {
    const s = this.state;
    if (this.forklift.driving) this.forklift.exit(true);
    this.sim.startNewDay();
    this.checkConstruction(true);
    recomputeMarketing(s);
    this.refreshMarketingVisuals();
    this.missions.ensure();
    this.staff.dayStart();
    this.events.dayStart();
    this.player.pos.set(6.5, 0, 3.4);
    this.player.yaw = 0.2;
    this.player.pitch = -0.05;
    if (this.carry) this.refreshHeld();
    this.endingDay = false;
    this.ui.toast(`Day ${s.day} · ${WEEKDAYS[(s.day - 1) % 7]} — open the store when you're ready!`, 'info', '☀️', 4000);
    this.save('auto', true);
  }

  // ------------------------------------------------------------------ callbacks
  onAppClosed(bought: boolean) {
    if (bought) this.ads.maybeInterstitial('app');
  }
  onDialogClosed(levelUp = false) {
    if (levelUp) this.ads.maybeInterstitial('levelUp');
  }

  // ------------------------------------------------------------------ saving
  serialize(): GameState {
    const s = this.state;
    s.player.x = round2(this.player.pos.x);
    s.player.y = 0;
    s.player.z = round2(this.player.pos.z);
    s.player.yaw = round2(this.player.yaw);
    s.player.pitch = round2(this.player.pitch);
    s.player.tool = this.player.tool;
    s.stats.hasMop = this.actions.hasMop ? 1 : 0;
    s.player.carry = this.carry ? this.carry.s.uid : null;
    for (const b of this.boxes.items.values()) {
      b.s.x = round2(b.pos.x);
      b.s.y = round2(b.pos.y);
      b.s.z = round2(b.pos.z);
    }
    this.cleaning.serialize();
    s.nextUid = peekUid();
    return s;
  }

  async save(slot: SlotId, silent = false) {
    if (!this.state || this.demo) return false;
    const ok = await writeSave(slot, this.serialize());
    if (!silent) this.ui.toast(ok ? 'Game saved' : 'Saving failed!', ok ? 'good' : 'bad', '💾');
    return ok;
  }

  get scene(): THREE.Scene { return this.engine.scene; }
}
