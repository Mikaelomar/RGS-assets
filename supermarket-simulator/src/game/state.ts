// Serializable game state (everything needed to continue exactly where the player left off).
import type { RoomId } from './layout';
import type { CategoryId } from '../data/products';

export const SAVE_VERSION = 1;

export interface Batch { n: number; exp: number; }
export interface SlotStock { pid: string | null; count: number; batches: Batch[]; }

export interface FurnitureState {
  uid: number;
  id: string;
  x: number;
  z: number;
  ry: number;
  slots?: SlotStock[];
  cond: number;
  broken: boolean;
  temp?: number;
  warmMin?: number;
  dirt?: number;
  fill?: number;
  fixed?: boolean;
  room?: RoomId;
  /** rack spots: box uids */
  rack?: (number | 0)[];
  /** checkout: cash collected in drawer today */
  cash?: number;
  /** oven: baking state */
  bake?: { pid: string; count: number; doneAt: number } | null;
  laneNo?: number;
}

export interface BoxState {
  uid: number;
  pid: string;
  count: number;
  exp: number;
  x: number;
  y: number;
  z: number;
  ry: number;
  rack?: { f: number; spot: number } | null;
  furn?: string;
  kind?: 'box' | 'trash' | 'furniture' | 'litter';
}

export type RoleId = 'cashier' | 'stocker' | 'cleaner' | 'warehouse' | 'security' | 'technician' | 'baker' | 'butcher' | 'deptmanager' | 'manager';

export interface EmployeeState {
  uid: number;
  name: string;
  role: RoleId;
  skill: number;
  wage: number;
  shiftStart: number;
  shiftEnd: number;
  energy: number;
  morale: number;
  look: number;
  female: boolean;
  daysWorked: number;
  sick?: boolean;
  trainedDay?: number;
  station?: number;
}

export interface OrderLine { pid?: string; fid?: string; qty: number; }
export interface OrderState {
  uid: number;
  lines: OrderLine[];
  placedDay: number;
  placedMin: number;
  etaDay: number;
  etaMin: number;
  total: number;
  status: 'pending' | 'arriving' | 'delivered';
  express: boolean;
  wrongItem?: string;
}

export interface DayStats {
  day: number;
  revenue: number;
  tips: number;
  cogs: number;
  expenses: Record<string, number>;
  income: Record<string, number>;
  customers: number;
  served: number;
  walkouts: number;
  itemsSold: number;
  satSum: number;
  satCount: number;
  sold: Record<string, number>;
  xp: number;
}

export interface Review { day: number; stars: number; text: string; name: string; }

export interface ActiveEvent {
  id: string;
  kind: string;
  startDay: number;
  startMin: number;
  data: Record<string, any>;
  resolved?: boolean;
}

export interface GameState {
  version: number;
  created: number;
  storeName: string;
  money: number;
  loan: number;
  level: number;
  xp: number;
  day: number;
  minutes: number;
  open: boolean;
  phase: 'prep' | 'open' | 'closing' | 'night';
  openHour: number;
  closeHour: number;
  plots: string[];
  rooms: RoomId[];
  licenses: CategoryId[];
  upgrades: string[];
  prices: Record<string, number>;
  promos: Record<string, number>;
  furniture: FurnitureState[];
  boxes: BoxState[];
  employees: EmployeeState[];
  candidates: EmployeeState[];
  orders: OrderState[];
  reputation: number;
  reviews: Review[];
  dirt: number[];
  spills: { uid: number; x: number; z: number; size: number; kind: 'water' | 'milk' | 'juice' | 'leak' }[];
  wcDirt: { staff: number; cust: number };
  today: DayStats;
  history: DayStats[];
  energy: number;
  tutorial: number;
  tutorialDone: boolean;
  events: ActiveEvent[];
  power: { outageMin: number; tripped: boolean };
  weather: 'sunny' | 'cloudy' | 'rain';
  player: { x: number; y: number; z: number; yaw: number; pitch: number; carry: number | null; tool: 'none' | 'mop' };
  playtime: number;
  totals: { revenue: number; customers: number; itemsSold: number; days: number };
  negativeDays: number;
  lastAdMin: number;
  marketing: number;
  bakeries: number;
  nextUid: number;
  seenTips: string[];
  stats: Record<string, number>;
}

export function newDayStats(day: number): DayStats {
  return { day, revenue: 0, tips: 0, cogs: 0, expenses: {}, income: {}, customers: 0, served: 0, walkouts: 0, itemsSold: 0, satSum: 0, satCount: 0, sold: {}, xp: 0 };
}
