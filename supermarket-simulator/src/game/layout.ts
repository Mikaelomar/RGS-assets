// Store layout: expansion plots, back-of-house rooms, doors and fixed room props.

export const PLOT = 8;
export const COLS = 8;
export const ROWS = 4;
export const SALES_H = 4.4;
export const BLD_H = 5.2;
export const ROOM_H = 3.0;
export const WALL_T = 0.3;
export const FLOOR_Y = 0.02;

export type PlotKey = `${number},${number}`;
export const plotKey = (c: number, r: number): PlotKey => `${c},${r}`;
/** Plot rect: x0..x1, z0..z1 (z0 < z1) */
export function plotRect(c: number, r: number): [number, number, number, number] {
  return [c * PLOT, -(r + 1) * PLOT, (c + 1) * PLOT, -r * PLOT];
}

export const START_PLOTS: [number, number][] = [[0, 0], [1, 0]];
export const ENTRANCE_COLS = [1, 5];

export interface ExpansionDef { plots: [number, number][]; level: number; cost: number; }
export const EXPANSIONS: ExpansionDef[] = [
  { plots: [[0, 1], [1, 1]], level: 4, cost: 1500 },
  { plots: [[2, 0], [2, 1]], level: 8, cost: 3200 },
  { plots: [[3, 0], [3, 1]], level: 12, cost: 5500 },
  { plots: [[0, 2], [1, 2], [2, 2], [3, 2]], level: 18, cost: 9500 },
  { plots: [[4, 0], [4, 1]], level: 25, cost: 15000 },
  { plots: [[4, 2], [5, 0], [5, 1], [5, 2]], level: 33, cost: 24000 },
  { plots: [[0, 3], [1, 3], [2, 3]], level: 42, cost: 34000 },
  { plots: [[3, 3], [4, 3], [5, 3]], level: 52, cost: 47000 },
  { plots: [[6, 0], [6, 1]], level: 64, cost: 62000 },
  { plots: [[6, 2], [6, 3]], level: 78, cost: 82000 },
  { plots: [[7, 0], [7, 1]], level: 94, cost: 108000 },
  { plots: [[7, 2], [7, 3]], level: 112, cost: 145000 },
];

export const TIERS = [
  { name: 'Corner Shop', minPlots: 2 },
  { name: 'Small Supermarket', minPlots: 4 },
  { name: 'Medium Supermarket', minPlots: 8 },
  { name: 'Large Supermarket', minPlots: 14 },
  { name: 'Hypermarket', minPlots: 20 },
  { name: 'Mega Hypermarket', minPlots: 32 },
];
export function tierFor(plotCount: number) {
  let t = 0;
  TIERS.forEach((tier, i) => { if (plotCount >= tier.minPlots) t = i; });
  return t;
}

export type RoomId = 'storage' | 'storage2' | 'office' | 'corridor' | 'breakroom' | 'electrical' | 'lockers' | 'staffwc' | 'custwc' | 'trashroom';
export type FloorKind = 'sales' | 'concrete' | 'vinyl' | 'wood' | 'smalltile';

export interface RoomDef {
  id: RoomId;
  name: string;
  rect: [number, number, number, number];
  level: number;
  cost: number;
  requires?: RoomId;
  requiresPlot?: [number, number];
  floor: FloorKind;
  height: number;
  wall: string;
  band: string;
  desc: string;
  /** customers may enter */
  public?: boolean;
}

export const ROOMS: RoomDef[] = [
  { id: 'storage', name: 'Warehouse', rect: [-8, -12, 0, 0], level: 2, cost: 150, floor: 'concrete', height: SALES_H, wall: '#d9dde0', band: '#f2b705', desc: 'Store boxes on racks. Trucks deliver to the roll-up door.' },
  { id: 'storage2', name: 'Warehouse Extension', rect: [-16, -12, -8, 0], level: 20, cost: 5000, requires: 'storage', floor: 'concrete', height: SALES_H, wall: '#d9dde0', band: '#f2b705', desc: 'Doubles the warehouse space.' },
  { id: 'office', name: "Manager's Office", rect: [-16, -18, -7, -12], level: 4, cost: 500, requires: 'storage', floor: 'vinyl', height: ROOM_H, wall: '#e6eef5', band: '#5b8db8', desc: 'Office computer, safe and staff schedule. Opens the staff corridor.' },
  { id: 'corridor', name: 'Staff Corridor', rect: [-7, -32, -4, -12], level: 4, cost: 0, requires: 'office', floor: 'vinyl', height: ROOM_H, wall: '#eceff1', band: '#90a4ae', desc: '' },
  { id: 'breakroom', name: 'Break Room', rect: [-16, -26, -7, -18], level: 6, cost: 900, requires: 'office', floor: 'wood', height: ROOM_H, wall: '#f6ead8', band: '#e07a3a', desc: 'Coffee, snacks and a sofa. You and your staff recover energy here.' },
  { id: 'electrical', name: 'Electrical & Maintenance', rect: [-16, -32, -7, -26], level: 11, cost: 1200, requires: 'office', floor: 'concrete', height: ROOM_H, wall: '#dfe3e6', band: '#c62828', desc: 'Breaker panel, HVAC, cleaning machines. Fix power outages fast.' },
  { id: 'lockers', name: 'Locker Room', rect: [-4, -18, 0, -12], level: 8, cost: 700, requires: 'office', floor: 'vinyl', height: ROOM_H, wall: '#e3f2fd', band: '#1e88e5', desc: 'Staff change into uniforms here (+staff morale).' },
  { id: 'staffwc', name: 'Staff Restroom', rect: [-4, -22, 0, -18], level: 9, cost: 600, requires: 'office', floor: 'smalltile', height: ROOM_H, wall: '#f5f5f5', band: '#26a69a', desc: 'A restroom for your employees.' },
  { id: 'custwc', name: 'Customer Restroom', rect: [-4, -27, 0, -22], level: 16, cost: 1500, requiresPlot: [0, 2], floor: 'smalltile', height: ROOM_H, wall: '#f5f5f5', band: '#ab47bc', desc: 'Customers stay happier in big stores with a restroom.', public: true },
  { id: 'trashroom', name: 'Trash & Recycling', rect: [-4, -32, 0, -27], level: 13, cost: 1000, requires: 'office', floor: 'concrete', height: ROOM_H, wall: '#dfe3e6', band: '#43a047', desc: 'Cardboard baler (sell bales!) and the back door to the dumpster.' },
];
export const ROOM_MAP = new Map(ROOMS.map((r) => [r.id, r]));

export type DoorKind = 'auto' | 'double' | 'single' | 'rollup' | 'opening';
export interface DoorDef {
  id: string;
  room: RoomId | null;
  x: number;
  z: number;
  axis: 'x' | 'z'; // wall runs along this axis
  w: number;
  h: number;
  kind: DoorKind;
  plot?: [number, number];
  label?: string;
}

export const DOORS: DoorDef[] = [
  { id: 'd_entr1', room: null, x: 12, z: 0, axis: 'x', w: 2.4, h: 2.7, kind: 'auto', plot: [1, 0] },
  { id: 'd_entr2', room: null, x: 44, z: 0, axis: 'x', w: 2.4, h: 2.7, kind: 'auto', plot: [5, 0] },
  { id: 'd_wh_store', room: 'storage', x: 0, z: -4.6, axis: 'z', w: 2.0, h: 2.6, kind: 'double', label: 'STORAGE' },
  { id: 'd_wh_front', room: 'storage', x: -4.5, z: 0, axis: 'x', w: 4.0, h: 3.4, kind: 'rollup', label: 'DELIVERIES' },
  { id: 'd_wh2', room: 'storage2', x: -8, z: -6, axis: 'z', w: 10, h: 3.8, kind: 'opening', label: 'WAREHOUSE EXTENSION' },
  { id: 'd_corr', room: 'office', x: -5.5, z: -12, axis: 'x', w: 1.4, h: 2.3, kind: 'single', label: 'STAFF ONLY' },
  { id: 'd_office', room: 'office', x: -7, z: -15, axis: 'z', w: 1.2, h: 2.2, kind: 'single', label: 'OFFICE' },
  { id: 'd_break', room: 'breakroom', x: -7, z: -22, axis: 'z', w: 1.2, h: 2.2, kind: 'single', label: 'BREAK ROOM' },
  { id: 'd_elec', room: 'electrical', x: -7, z: -29, axis: 'z', w: 1.2, h: 2.2, kind: 'single', label: 'ELECTRICAL' },
  { id: 'd_lockers', room: 'lockers', x: -4, z: -15, axis: 'z', w: 1.2, h: 2.2, kind: 'single', label: 'LOCKERS' },
  { id: 'd_swc', room: 'staffwc', x: -4, z: -20, axis: 'z', w: 1.0, h: 2.2, kind: 'single', label: 'WC' },
  { id: 'd_cwc', room: 'custwc', x: 0, z: -23.4, axis: 'z', w: 1.2, h: 2.2, kind: 'single', label: 'RESTROOM', plot: [0, 2] },
  { id: 'd_trash', room: 'trashroom', x: -4, z: -29.5, axis: 'z', w: 1.2, h: 2.2, kind: 'single', label: 'TRASH ROOM' },
  { id: 'd_trash_out', room: 'trashroom', x: -2, z: -32, axis: 'x', w: 1.4, h: 2.3, kind: 'single', label: 'EXIT' },
];

/** Back-of-house walls (axis aligned segments). */
export const BOH_WALLS: { a: [number, number]; b: [number, number]; h: number }[] = [
  { a: [-16, 0], b: [0, 0], h: BLD_H },
  { a: [-16, -32], b: [-16, 0], h: BLD_H },
  { a: [-16, -32], b: [0, -32], h: BLD_H },
  { a: [0, -32], b: [0, 0], h: BLD_H },
  { a: [-16, -12], b: [0, -12], h: SALES_H },
  { a: [-8, -12], b: [-8, 0], h: SALES_H },
  { a: [-7, -32], b: [-7, -12], h: ROOM_H },
  { a: [-4, -32], b: [-4, -12], h: ROOM_H },
  { a: [-16, -18], b: [-7, -18], h: ROOM_H },
  { a: [-16, -26], b: [-7, -26], h: ROOM_H },
  { a: [-4, -18], b: [0, -18], h: ROOM_H },
  { a: [-4, -22], b: [0, -22], h: ROOM_H },
  { a: [-4, -27], b: [0, -27], h: ROOM_H },
];

/** Fixed props per room: [furniture id, x, z, rotationY] */
export const ROOM_PROPS: { room: RoomId; id: string; x: number; z: number; ry: number }[] = [
  { room: 'office', id: 'desk', x: -11.5, z: -17.2, ry: 0 },
  { room: 'office', id: 'officechair', x: -11.5, z: -16.3, ry: Math.PI },
  { room: 'office', id: 'filing', x: -15.4, z: -17.4, ry: Math.PI / 2 },
  { room: 'office', id: 'safe', x: -8.0, z: -17.4, ry: 0 },
  { room: 'office', id: 'whiteboard', x: -15.85, z: -14.5, ry: Math.PI / 2 },
  { room: 'office', id: 'plant_decor', x: -15.3, z: -12.7, ry: 0 },
  { room: 'breakroom', id: 'breaktable', x: -12.2, z: -22.3, ry: 0 },
  { room: 'breakroom', id: 'sofa', x: -11.5, z: -25.45, ry: 0 },
  { room: 'breakroom', id: 'coffee', x: -15.65, z: -20.5, ry: Math.PI / 2 },
  { room: 'breakroom', id: 'vending', x: -15.5, z: -24.6, ry: Math.PI / 2 },
  { room: 'breakroom', id: 'kfridge', x: -15.6, z: -18.6, ry: Math.PI / 2 },
  { room: 'breakroom', id: 'tv', x: -11.5, z: -18.12, ry: Math.PI },
  { room: 'breakroom', id: 'clock', x: -7.2, z: -24.5, ry: -Math.PI / 2 },
  { room: 'electrical', id: 'breaker', x: -15.85, z: -28.8, ry: Math.PI / 2 },
  { room: 'electrical', id: 'hvac', x: -13.0, z: -31.4, ry: 0 },
  { room: 'electrical', id: 'heater', x: -15.5, z: -31.4, ry: 0 },
  { room: 'electrical', id: 'supplies', x: -9.0, z: -31.7, ry: 0 },
  { room: 'electrical', id: 'scrubber', x: -10.6, z: -27.0, ry: Math.PI },
  { room: 'lockers', id: 'lockers', x: -0.3, z: -15.0, ry: -Math.PI / 2 },
  { room: 'lockers', id: 'lockerbench', x: -2.3, z: -15.0, ry: Math.PI / 2 },
  { room: 'staffwc', id: 'toilet', x: -0.9, z: -21.55, ry: 0 },
  { room: 'staffwc', id: 'sink', x: -0.25, z: -19.0, ry: -Math.PI / 2 },
  { room: 'custwc', id: 'stall', x: -2.6, z: -26.25, ry: 0 },
  { room: 'custwc', id: 'toilet', x: -2.6, z: -26.6, ry: 0 },
  { room: 'custwc', id: 'sink', x: -3.75, z: -23.2, ry: Math.PI / 2 },
  { room: 'custwc', id: 'sink', x: -3.75, z: -24.2, ry: Math.PI / 2 },
  { room: 'trashroom', id: 'baler', x: -0.65, z: -29.8, ry: -Math.PI / 2 },
  { room: 'trashroom', id: 'recycle_bin', x: -2.0, z: -27.35, ry: Math.PI },
];

/** Things outside or always present. */
export const ALWAYS_PROPS: { id: string; x: number; z: number; ry: number }[] = [
  { id: 'dumpster', x: -2.5, z: -34.6, ry: 0 },
  { id: 'mopbucket', x: 0.6, z: -7.4, ry: 0 },
];

/** Where the store computer sits in the starter shop (next to the checkout). */
export const KIOSK_POS = { x: 6.0, z: -0.75, ry: Math.PI };

export const DELIVERY_SPOT = { x: -4.5, z: 2.8 };
export const TRUCK_STOP = { x: -4.5, z: 8.0 };
export const SIDEWALK_SPAWN_Z = 3.2;
