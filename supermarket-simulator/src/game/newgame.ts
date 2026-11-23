// Creates the starting state: a tiny corner shop, a little money and one crate of apples outside.
import { SAVE_VERSION, newDayStats, type GameState, type FurnitureState } from './state';
import { START_PLOTS, plotKey, ROOM_PROPS, ALWAYS_PROPS, DELIVERY_SPOT } from './layout';
import { FURN_MAP } from '../data/furniture';
import { PRODUCTS } from '../data/products';

export function createNewGame(storeName: string): GameState {
  let uid = 1;
  const furniture: FurnitureState[] = [];
  const addF = (id: string, x: number, z: number, ry: number, extra: Partial<FurnitureState> = {}) => {
    const def = FURN_MAP.get(id)!;
    const f: FurnitureState = { uid: uid++, id, x, z, ry, cond: 100, broken: false, ...extra };
    if (def.slots) f.slots = def.slots.map(() => ({ pid: null, count: 0, batches: [] }));
    if (def.rackSpots) f.rack = def.rackSpots.map(() => 0);
    if (def.coolTarget !== undefined) f.temp = def.coolTarget;
    furniture.push(f);
    return f;
  };
  // starter shop
  addF('checkout', 8.0, -2.6, -Math.PI / 2, { laneNo: 1, cash: 0 });
  addF('kiosk', 15.55, -2.2, -Math.PI / 2);
  addF('fruit_rack', 3.0, -7.25, 0);
  addF('shelf_small', 6.6, -7.62, 0);
  addF('shelf_small', 9.0, -7.62, 0);
  addF('trash_bin', 15.0, -4.6, 0);
  addF('basket_stand', 14.3, -0.75, 0);
  for (const p of ROOM_PROPS) addF(p.id, p.x, p.z, p.ry, { fixed: true, room: p.room });
  for (const p of ALWAYS_PROPS) addF(p.id, p.x, p.z, p.ry, { fixed: true });

  const prices: Record<string, number> = {};
  for (const p of PRODUCTS) prices[p.id] = p.price;

  const state: GameState = {
    version: SAVE_VERSION,
    created: Date.now(),
    storeName,
    money: 400,
    loan: 0,
    level: 1,
    xp: 0,
    day: 1,
    minutes: 8 * 60,
    open: false,
    phase: 'prep',
    openHour: 8,
    closeHour: 22,
    plots: START_PLOTS.map(([c, r]) => plotKey(c, r)),
    rooms: [],
    licenses: ['produce', 'pantry', 'snacks'],
    upgrades: [],
    prices,
    promos: {},
    furniture,
    boxes: [
      { uid: uid++, pid: 'apple', count: 12, exp: 9, x: DELIVERY_SPOT.x + 0.6, y: 0, z: DELIVERY_SPOT.z, ry: 0.2, kind: 'box' },
      { uid: uid++, pid: 'cereal', count: 12, exp: 0, x: DELIVERY_SPOT.x - 0.8, y: 0, z: DELIVERY_SPOT.z - 0.3, ry: -0.1, kind: 'box' },
    ],
    employees: [],
    candidates: [],
    orders: [],
    reputation: 3.0,
    reviews: [],
    dirt: [],
    spills: [],
    wcDirt: { staff: 0, cust: 0 },
    today: newDayStats(1),
    history: [],
    energy: 100,
    tutorial: 0,
    tutorialDone: false,
    events: [],
    power: { outageMin: 0, tripped: false },
    weather: 'sunny',
    player: { x: 6.5, y: 0, z: 3.6, yaw: 0.25, pitch: -0.05, carry: null, tool: 'none' },
    playtime: 0,
    totals: { revenue: 0, customers: 0, itemsSold: 0, days: 0 },
    negativeDays: 0,
    lastAdMin: 0,
    marketing: 0,
    bakeries: 0,
    nextUid: uid,
    seenTips: [],
    stats: {},
  };
  return state;
}
