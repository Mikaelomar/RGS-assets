// Furniture & fixture definitions: price, unlock level, footprint, product slots, power use.
import * as M from '../gfx/FurnitureModels';
import type { FurnGeo } from '../gfx/FurnitureModels';
import type { DisplayKind } from './products';
import { POSTERS } from '../gfx/Posters';

export interface SlotDef {
  x: number; y: number; z: number;
  ry: number; tilt: number;
  w: number; d: number; h: number;
  kind: DisplayKind;
  layout: 'upright' | 'pile' | 'flat';
}

export type FurnCat = 'display' | 'cold' | 'checkout' | 'storage' | 'utility' | 'decor' | 'fixed';

export type InteractKind =
  | 'checkout' | 'selfcheckout' | 'trash' | 'recycle' | 'computer' | 'safe' | 'coffee' | 'vending' | 'sofa'
  | 'breaker' | 'hvac' | 'toilet' | 'sink' | 'mop' | 'scrubber' | 'dumpster' | 'baler' | 'lockers' | 'palletjack'
  | 'tv' | 'oven' | 'basket' | 'carts' | 'atm' | 'heater' | 'whiteboard' | 'none';

export interface FurnDef {
  id: string;
  name: string;
  desc: string;
  cat: FurnCat;
  price: number;
  level: number;
  size: [number, number, number];
  build: () => FurnGeo;
  slots?: SlotDef[];
  rackSpots?: [number, number, number][];
  power?: number;
  coolTarget?: number;
  placement: 'sales' | 'storage' | 'any' | 'fixed';
  beauty?: number;
  interact?: InteractKind;
  icon: string;
  /** Can break down (needs repairs). */
  breaks?: boolean;
  /** extra floor clearance in front (m) kept free for customers */
  frontClear?: number;
  /** roll-up banner poster design id */
  poster?: string;
  /** Seasonal decoration: only sold while that season runs. */
  season?: string;
}

function shelfSlots(levels: number[], heights: number[], perLevel: number, w: number, d: number, kind: DisplayKind, zc: number, ry = 0, tilt = 0): SlotDef[] {
  const out: SlotDef[] = [];
  const sw = (w - 0.1) / perLevel;
  levels.forEach((y, i) => {
    for (let k = 0; k < perLevel; k++) {
      const x = -w / 2 + 0.05 + sw * (k + 0.5);
      out.push({ x: ry ? -x : x, y: y + 0.013, z: zc, ry, tilt, w: sw - 0.04, d, h: heights[i], kind, layout: 'upright' });
    }
  });
  return out;
}

const CHECKOUT_SPOTS = {
  cashier: [0.85, -0.85] as [number, number],
  pay: [0.25, 0.85] as [number, number],
  queue0: [-0.7, 0.85] as [number, number],
};
export { CHECKOUT_SPOTS };

export const FURNITURE: FurnDef[] = [
  // ---------------------------------------------------------------- display
  {
    id: 'shelf_small', name: 'Small Shelf', desc: 'Compact 4-level shelf for packaged goods.', cat: 'display', icon: '🗄️',
    price: 150, level: 1, size: [1.2, 0.5, 1.75], placement: 'sales', frontClear: 0.9,
    build: () => M.shelfUnit(1.2, 0.5, 1.75, [0.1, 0.5, 0.9, 1.3], { back: '#3f78b5' }),
    slots: shelfSlots([0.1, 0.5, 0.9, 1.3], [0.36, 0.36, 0.36, 0.4], 1, 1.2, 0.42, 'shelf', 0.02),
  },
  {
    id: 'shelf_wall', name: 'Wall Shelf', desc: 'Tall 5-level shelf, fits against walls.', cat: 'display', icon: '🗄️',
    price: 320, level: 3, size: [2.0, 0.55, 1.95], placement: 'sales', frontClear: 0.9,
    build: () => M.shelfUnit(2.0, 0.55, 1.95, [0.1, 0.45, 0.8, 1.15, 1.5], { back: '#2f6aa8', header: '#1f4f80' }),
    slots: shelfSlots([0.1, 0.45, 0.8, 1.15, 1.5], [0.31, 0.31, 0.31, 0.31, 0.4], 2, 2.0, 0.47, 'shelf', 0.02),
  },
  {
    id: 'gondola', name: 'Gondola Shelf', desc: 'Double-sided aisle shelf: products on both sides.', cat: 'display', icon: '🛒',
    price: 520, level: 7, size: [2.0, 1.1, 1.6], placement: 'sales', frontClear: 0.9,
    build: () => M.shelfUnit(2.0, 1.1, 1.6, [0.1, 0.47, 0.84, 1.21], { back: '#3a72ad', double: true }),
    slots: [
      ...shelfSlots([0.1, 0.47, 0.84, 1.21], [0.33, 0.33, 0.33, 0.36], 2, 2.0, 0.47, 'shelf', 0.275),
      ...shelfSlots([0.1, 0.47, 0.84, 1.21], [0.33, 0.33, 0.33, 0.36], 2, 2.0, 0.47, 'shelf', -0.275, Math.PI),
    ],
  },
  {
    id: 'fruit_rack', name: 'Produce Rack', desc: 'Wooden crate rack for fruits and vegetables.', cat: 'display', icon: '🍎',
    price: 100, level: 1, size: [1.2, 0.9, 1.3], placement: 'sales', frontClear: 0.9,
    build: M.fruitRack,
    slots: [0, 1, 2, 3].map((i) => ({ x: 0, y: 0.22 + i * 0.3 + 0.02, z: 0.22 - i * 0.14, ry: 0, tilt: 0.28, w: 1.02, d: 0.38, h: 0.22, kind: 'produce' as DisplayKind, layout: 'pile' as const })),
  },
  {
    id: 'produce_table', name: 'Produce Island', desc: 'Big island table with six crates, accessible from both sides.', cat: 'display', icon: '🥬',
    price: 420, level: 10, size: [2.4, 1.4, 1.6], placement: 'sales', frontClear: 0.9,
    build: M.produceTable,
    slots: [0, 1, 2].flatMap((i) => [
      { x: -0.78 + i * 0.78, y: 0.58, z: 0.32, ry: 0, tilt: 0.22, w: 0.68, d: 0.54, h: 0.22, kind: 'produce' as DisplayKind, layout: 'pile' as const },
      { x: -0.78 + i * 0.78, y: 0.58, z: -0.32, ry: Math.PI, tilt: 0.22, w: 0.68, d: 0.54, h: 0.22, kind: 'produce' as DisplayKind, layout: 'pile' as const },
    ]),
  },
  {
    id: 'bread_rack', name: 'Bakery Rack', desc: 'Wooden rack with wicker baskets for bread and pastries.', cat: 'display', icon: '🥖',
    price: 300, level: 3, size: [1.6, 0.6, 1.8], placement: 'sales', frontClear: 0.9,
    build: M.breadRack,
    slots: [0.25, 0.62, 0.99, 1.36].flatMap((y) => [-0.38, 0.38].map((x) => ({ x, y: y + 0.04, z: 0, ry: 0, tilt: 0.12, w: 0.62, d: 0.44, h: 0.3, kind: 'bakery' as DisplayKind, layout: 'upright' as const }))),
  },
  {
    id: 'promo_stand', name: 'Promo End-Cap', desc: 'Eye-catching sale display. Products here sell 25% faster.', cat: 'display', icon: '🏷️',
    price: 280, level: 12, size: [1.2, 0.8, 1.6], placement: 'sales', frontClear: 0.9, beauty: 1,
    build: M.promoStand,
    slots: [
      { x: 0, y: 0.3, z: 0.25, ry: 0, tilt: 0, w: 1.1, d: 0.28, h: 0.3, kind: 'shelf', layout: 'upright' },
      { x: 0, y: 0.6, z: 0.08, ry: 0, tilt: 0, w: 1.0, d: 0.22, h: 0.3, kind: 'shelf', layout: 'upright' },
      { x: 0, y: 0.9, z: -0.15, ry: 0, tilt: 0, w: 0.9, d: 0.2, h: 0.3, kind: 'shelf', layout: 'upright' },
    ],
  },
  // ---------------------------------------------------------------- cold
  {
    id: 'fridge_1', name: 'Drinks Fridge', desc: 'Glass-door fridge (4°C) for drinks and dairy.', cat: 'cold', icon: '🧊',
    price: 650, level: 2, size: [0.8, 0.75, 2.05], placement: 'sales', power: 0.35, coolTarget: 4, breaks: true, frontClear: 1.0,
    build: () => M.glassFridge(1),
    slots: [0, 1, 2, 3, 4].map((k) => ({ x: 0, y: 0.2 + k * 0.33 + 0.01, z: -0.02, ry: 0, tilt: 0, w: 0.66, d: 0.52, h: 0.29, kind: 'fridge' as DisplayKind, layout: 'upright' as const })),
  },
  {
    id: 'fridge_2', name: 'Double Glass Fridge', desc: 'Two-door fridge (4°C) with ten shelves.', cat: 'cold', icon: '🧊',
    price: 1200, level: 9, size: [1.6, 0.75, 2.05], placement: 'sales', power: 0.6, coolTarget: 4, breaks: true, frontClear: 1.0,
    build: () => M.glassFridge(2),
    slots: [0, 1, 2, 3, 4].flatMap((k) => [-0.4, 0.4].map((x) => ({ x, y: 0.2 + k * 0.33 + 0.01, z: -0.02, ry: 0, tilt: 0, w: 0.66, d: 0.52, h: 0.29, kind: 'fridge' as DisplayKind, layout: 'upright' as const }))),
  },
  {
    id: 'dairy_open', name: 'Open Dairy Cooler', desc: 'Open multi-deck cooler (3°C). Big capacity, uses more power.', cat: 'cold', icon: '🥛',
    price: 2200, level: 16, size: [2.4, 0.95, 2.05], placement: 'sales', power: 1.3, coolTarget: 3, breaks: true, frontClear: 1.0,
    build: M.dairyCooler,
    slots: [0, 1, 2, 3].flatMap((k) => [-0.75, 0, 0.75].map((x) => ({ x, y: 0.5 + k * 0.36 + 0.012, z: -0.12 - k * 0.02, ry: 0, tilt: 0.08, w: 0.7, d: 0.5 - k * 0.04, h: 0.3, kind: 'fridge' as DisplayKind, layout: 'upright' as const }))),
  },
  {
    id: 'freezer_chest', name: 'Chest Freezer', desc: 'Island freezer (-18°C) for frozen food.', cat: 'cold', icon: '❄️',
    price: 750, level: 5, size: [1.6, 0.85, 0.9], placement: 'sales', power: 0.45, coolTarget: -18, breaks: true, frontClear: 0.9,
    build: M.chestFreezer,
    slots: [-0.4, 0.4].flatMap((x) => [0.19, -0.19].map((z) => ({ x, y: 0.42, z, ry: 0, tilt: 0, w: 0.7, d: 0.34, h: 0.4, kind: 'freezer' as DisplayKind, layout: 'flat' as const }))),
  },
  {
    id: 'freezer_glass', name: 'Glass Door Freezer', desc: 'Upright freezer (-20°C) with ten shelves.', cat: 'cold', icon: '❄️',
    price: 1700, level: 14, size: [1.6, 0.75, 2.05], placement: 'sales', power: 1.0, coolTarget: -20, breaks: true, frontClear: 1.0,
    build: () => M.glassFridge(2, true),
    slots: [0, 1, 2, 3, 4].flatMap((k) => [-0.4, 0.4].map((x) => ({ x, y: 0.2 + k * 0.33 + 0.01, z: -0.02, ry: 0, tilt: 0, w: 0.66, d: 0.52, h: 0.29, kind: 'freezer' as DisplayKind, layout: 'upright' as const }))),
  },
  {
    id: 'meat_counter', name: 'Butcher Counter', desc: 'Refrigerated service counter (2°C) for fresh meat.', cat: 'cold', icon: '🥩',
    price: 2800, level: 21, size: [2.4, 1.3, 1.4], placement: 'sales', power: 1.0, coolTarget: 2, breaks: true, frontClear: 1.0,
    build: () => M.serviceCounter(false),
    slots: [-0.78, 0, 0.78].flatMap((x) => [{ x, y: 0.88, z: 0.1, ry: 0, tilt: 0.1, w: 0.7, d: 0.4, h: 0.15, kind: 'meat' as DisplayKind, layout: 'flat' as const }, { x, y: 1.1, z: -0.3, ry: 0, tilt: 0, w: 0.7, d: 0.3, h: 0.15, kind: 'meat' as DisplayKind, layout: 'flat' as const }]),
  },
  {
    id: 'fish_counter', name: 'Seafood Counter', desc: 'Ice-bed counter (1°C) for fish and seafood.', cat: 'cold', icon: '🐟',
    price: 3000, level: 26, size: [2.4, 1.3, 1.4], placement: 'sales', power: 0.9, coolTarget: 1, breaks: true, frontClear: 1.0,
    build: () => M.serviceCounter(true),
    slots: [-0.78, 0, 0.78].flatMap((x) => [{ x, y: 0.93, z: 0.12, ry: 0, tilt: 0.1, w: 0.7, d: 0.36, h: 0.15, kind: 'fish' as DisplayKind, layout: 'flat' as const }, { x, y: 0.93, z: -0.25, ry: 0, tilt: 0.1, w: 0.7, d: 0.3, h: 0.15, kind: 'fish' as DisplayKind, layout: 'flat' as const }]),
  },
  // ---------------------------------------------------------------- checkout
  {
    id: 'checkout', name: 'Checkout Counter', desc: 'Conveyor belt, scanner, register and card terminal.', cat: 'checkout', icon: '🧾',
    price: 450, level: 1, size: [2.6, 0.85, 1.2], placement: 'sales', power: 0.15, breaks: true, interact: 'checkout', frontClear: 1.6,
    build: M.checkoutCounter,
  },
  {
    id: 'self_checkout', name: 'Self-Checkout', desc: 'Customers scan and pay by themselves.', cat: 'checkout', icon: '🖥️',
    price: 1800, level: 22, size: [1.3, 0.7, 1.9], placement: 'sales', power: 0.12, breaks: true, interact: 'selfcheckout', frontClear: 1.2,
    build: M.selfCheckout,
  },
  // ---------------------------------------------------------------- storage
  {
    id: 'rack', name: 'Warehouse Rack', desc: 'Heavy-duty rack: 12 spots for product boxes.', cat: 'storage', icon: '📦',
    price: 350, level: 2, size: [2.4, 1.0, 2.5], placement: 'storage', frontClear: 1.2,
    build: M.storageRack,
    rackSpots: [0.14, 0.97, 1.8].flatMap((y) => [-0.87, -0.29, 0.29, 0.87].map((x) => [x, y, 0] as [number, number, number])),
  },
  {
    id: 'pallet', name: 'Pallet', desc: 'Wooden pallet. Boxes on pallets can be moved with a pallet jack.', cat: 'storage', icon: '🪵',
    price: 25, level: 10, size: [1.2, 1.0, 0.15], placement: 'any',
    build: M.pallet,
  },
  // ---------------------------------------------------------------- utility
  {
    id: 'trash_bin', name: 'Trash Bin', desc: 'For empty boxes and litter. Empty it when full!', cat: 'utility', icon: '🗑️',
    price: 30, level: 1, size: [0.5, 0.5, 1.0], placement: 'any', interact: 'trash',
    build: M.trashBin,
  },
  {
    id: 'recycle_bin', name: 'Cardboard Recycling', desc: 'Recycle empty boxes for a small refund.', cat: 'utility', icon: '♻️',
    price: 120, level: 5, size: [1.2, 0.5, 1.0], placement: 'any', interact: 'recycle',
    build: M.recycleBins,
  },
  {
    id: 'basket_stand', name: 'Basket Stand', desc: 'Customers grab baskets here and buy a bit more.', cat: 'utility', icon: '🧺',
    price: 50, level: 1, size: [0.55, 0.45, 1.0], placement: 'sales', interact: 'basket',
    build: M.basketStand,
  },
  {
    id: 'cart_corral', name: 'Shopping Carts', desc: 'Carts let customers buy much bigger baskets.', cat: 'utility', icon: '🛒',
    price: 400, level: 10, size: [0.8, 1.6, 1.1], placement: 'sales', interact: 'carts',
    build: M.cartCorral,
  },
  {
    id: 'bakery_oven', name: 'Bakery Oven', desc: 'Bake fresh bread from dough boxes. Customers love fresh bread!', cat: 'utility', icon: '🔥',
    price: 3500, level: 20, size: [1.4, 1.0, 1.8], placement: 'any', power: 3.0, breaks: true, interact: 'oven',
    build: M.bakeryOven,
  },
  {
    id: 'atm', name: 'ATM', desc: 'Earns a small fee from customers every day.', cat: 'utility', icon: '🏧',
    price: 2500, level: 30, size: [0.7, 0.6, 1.7], placement: 'sales', power: 0.1, interact: 'atm',
    build: M.atmMachine,
  },
  // ---------------------------------------------------------------- decor
  {
    id: 'plant_decor', name: 'Decorative Plant', desc: 'Makes the store nicer (+satisfaction).', cat: 'decor', icon: '🪴',
    price: 80, level: 5, size: [0.6, 0.6, 1.5], placement: 'any', beauty: 1,
    build: M.plantDecor,
  },
  {
    id: 'bench', name: 'Bench', desc: 'A comfy bench. Customers like a place to rest.', cat: 'decor', icon: '🪑',
    price: 120, level: 8, size: [1.6, 0.55, 1.0], placement: 'any', beauty: 1,
    build: M.bench,
  },
  // ---------------------------------------------------------------- fixed room props
  { id: 'desk', name: 'Office Desk', desc: '', cat: 'fixed', icon: '🖥️', price: 0, level: 1, size: [1.6, 0.75, 1.2], placement: 'fixed', interact: 'computer', build: M.desk },
  { id: 'kiosk', name: 'Store Computer', desc: '', cat: 'fixed', icon: '🖥️', price: 0, level: 1, size: [0.8, 0.5, 1.4], placement: 'fixed', interact: 'computer', build: M.computerKiosk },
  { id: 'officechair', name: 'Office Chair', desc: '', cat: 'fixed', icon: '🪑', price: 0, level: 1, size: [0.6, 0.6, 1.1], placement: 'fixed', build: M.officeChair },
  { id: 'filing', name: 'Filing Cabinet', desc: '', cat: 'fixed', icon: '🗄️', price: 0, level: 1, size: [0.5, 0.6, 1.3], placement: 'fixed', build: M.filingCabinet },
  { id: 'safe', name: 'Safe', desc: '', cat: 'fixed', icon: '🔐', price: 0, level: 1, size: [0.7, 0.65, 0.9], placement: 'fixed', interact: 'safe', build: M.safeBox },
  { id: 'whiteboard', name: 'Staff Schedule', desc: '', cat: 'fixed', icon: '📋', price: 0, level: 1, size: [1.6, 0.1, 2.0], placement: 'fixed', interact: 'whiteboard', build: M.whiteboard },
  { id: 'breaktable', name: 'Break Table', desc: '', cat: 'fixed', icon: '🍽️', price: 0, level: 1, size: [2.2, 2.2, 0.8], placement: 'fixed', build: M.breakTable },
  { id: 'sofa', name: 'Sofa', desc: '', cat: 'fixed', icon: '🛋️', price: 0, level: 1, size: [2.0, 0.85, 0.9], placement: 'fixed', interact: 'sofa', build: M.sofa },
  { id: 'coffee', name: 'Coffee Corner', desc: '', cat: 'fixed', icon: '☕', price: 0, level: 1, size: [1.2, 0.6, 1.4], placement: 'fixed', interact: 'coffee', power: 0.2, build: M.coffeeMachine },
  { id: 'vending', name: 'Vending Machine', desc: '', cat: 'fixed', icon: '🥤', price: 0, level: 1, size: [1.0, 0.8, 1.9], placement: 'fixed', interact: 'vending', power: 0.3, build: M.vendingMachine },
  { id: 'kfridge', name: 'Staff Fridge', desc: '', cat: 'fixed', icon: '🧊', price: 0, level: 1, size: [0.7, 0.7, 1.8], placement: 'fixed', power: 0.1, build: M.kitchenFridge },
  { id: 'tv', name: 'TV', desc: '', cat: 'fixed', icon: '📺', price: 0, level: 1, size: [1.3, 0.1, 2.1], placement: 'fixed', interact: 'tv', power: 0.1, build: M.tvWall },
  { id: 'lockers', name: 'Staff Lockers', desc: '', cat: 'fixed', icon: '🔒', price: 0, level: 1, size: [2.4, 0.5, 2.0], placement: 'fixed', interact: 'lockers', build: M.lockers },
  { id: 'lockerbench', name: 'Bench', desc: '', cat: 'fixed', icon: '🪑', price: 0, level: 1, size: [1.8, 0.35, 0.5], placement: 'fixed', build: M.lockerBench },
  { id: 'toilet', name: 'Toilet', desc: '', cat: 'fixed', icon: '🚽', price: 0, level: 1, size: [0.45, 0.65, 0.85], placement: 'fixed', interact: 'toilet', build: M.toilet },
  { id: 'stall', name: 'Toilet Stall', desc: '', cat: 'fixed', icon: '🚪', price: 0, level: 1, size: [1.2, 1.4, 2.0], placement: 'fixed', build: M.stallWalls },
  { id: 'sink', name: 'Sink', desc: '', cat: 'fixed', icon: '🚰', price: 0, level: 1, size: [0.6, 0.45, 1.8], placement: 'fixed', interact: 'sink', build: M.sinkMirror },
  { id: 'breaker', name: 'Breaker Panel', desc: '', cat: 'fixed', icon: '⚡', price: 0, level: 1, size: [0.8, 0.2, 2.0], placement: 'fixed', interact: 'breaker', build: M.breakerPanel },
  { id: 'hvac', name: 'HVAC Unit', desc: '', cat: 'fixed', icon: '🌀', price: 0, level: 1, size: [1.4, 0.9, 2.8], placement: 'fixed', interact: 'hvac', breaks: true, build: M.hvacUnit },
  { id: 'heater', name: 'Water Heater', desc: '', cat: 'fixed', icon: '🔥', price: 0, level: 1, size: [0.6, 0.6, 2.3], placement: 'fixed', interact: 'heater', build: M.waterHeater },
  { id: 'mopbucket', name: 'Mop & Bucket', desc: '', cat: 'fixed', icon: '🧹', price: 0, level: 1, size: [0.5, 0.5, 1.5], placement: 'fixed', interact: 'mop', build: M.mopBucket },
  { id: 'scrubber', name: 'Floor Scrubber', desc: '', cat: 'fixed', icon: '🧽', price: 0, level: 1, size: [0.6, 0.9, 1.3], placement: 'fixed', interact: 'scrubber', build: M.floorScrubber },
  { id: 'supplies', name: 'Supply Shelf', desc: '', cat: 'fixed', icon: '🧴', price: 0, level: 1, size: [1.2, 0.45, 1.9], placement: 'fixed', build: M.supplyShelf },
  { id: 'dumpster', name: 'Dumpster', desc: '', cat: 'fixed', icon: '🗑️', price: 0, level: 1, size: [2.0, 1.2, 1.4], placement: 'fixed', interact: 'dumpster', build: M.dumpster },
  { id: 'baler', name: 'Cardboard Baler', desc: '', cat: 'fixed', icon: '♻️', price: 0, level: 1, size: [1.4, 1.1, 2.2], placement: 'fixed', interact: 'baler', power: 0.5, build: M.baler },
  { id: 'palletjack', name: 'Pallet Jack', desc: '', cat: 'fixed', icon: '🛻', price: 0, level: 1, size: [0.6, 1.4, 1.2], placement: 'fixed', interact: 'palletjack', build: M.palletJack },
  { id: 'counter', name: 'Kitchen Counter', desc: '', cat: 'fixed', icon: '🚰', price: 0, level: 1, size: [2.4, 0.6, 0.9], placement: 'fixed', build: () => M.counterCabinet(2.4) },
  { id: 'clock', name: 'Clock', desc: '', cat: 'fixed', icon: '🕒', price: 0, level: 1, size: [0.4, 0.05, 2.4], placement: 'fixed', build: M.wallClock },
];

FURNITURE.push({
  id: 'xmas_tree', name: 'Christmas Tree', desc: 'A big decorated tree with lights and presents. Customers love it!', cat: 'decor', icon: '🎄',
  price: 150, level: 1, size: [1.4, 1.4, 2.6], placement: 'any', beauty: 3, season: 'christmas',
  build: M.christmasTree,
});

for (const p of POSTERS) {
  FURNITURE.push({
    id: 'poster_' + p.id, name: `${p.title} Banner`, desc: 'Roll-up poster banner. Decorations make customers happier.', cat: 'decor', icon: '🖼️',
    price: p.price, level: p.level, size: [0.95, 0.45, 2.25], placement: 'any', beauty: p.beauty, poster: p.id,
    build: M.bannerStand,
  });
}

export const FURN_MAP = new Map(FURNITURE.map((f) => [f.id, f]));
export function furn(id: string): FurnDef {
  const f = FURN_MAP.get(id);
  if (!f) throw new Error('Unknown furniture ' + id);
  return f;
}
export const SHOP_FURNITURE = FURNITURE.filter((f) => f.placement !== 'fixed');
