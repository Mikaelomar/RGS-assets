// Leveling (1-500), upgrades and per-level unlock lists.
import { PRODUCTS, CATEGORIES } from './products';
import { SHOP_FURNITURE } from './furniture';
import { ROOMS, EXPANSIONS } from '../game/layout';
import { ROLES } from './staff';

export const MAX_LEVEL = 500;

export function xpToNext(level: number): number {
  return Math.round(30 + level * 9 + Math.pow(level, 1.75) * 0.35);
}

export function levelReward(level: number): number {
  let cash = 25 + level * 12;
  if (level % 10 === 0) cash *= 3;
  if (level % 50 === 0) cash *= 2;
  return Math.round(cash);
}

export const TITLES: [number, string][] = [
  [1, 'Shop Assistant'], [10, 'Store Keeper'], [25, 'Shop Owner'], [50, 'Retail Pro'], [75, 'Grocery Boss'], [100, 'Supermarket Manager'],
  [150, 'Retail Expert'], [200, 'Hypermarket Director'], [250, 'Retail Tycoon'], [300, 'Grocery Mogul'], [350, 'Commerce Legend'],
  [400, 'Retail Mastermind'], [450, 'Market King'], [500, 'Supermarket Legend'],
];
export function titleFor(level: number) {
  let t = TITLES[0][1];
  for (const [l, n] of TITLES) if (level >= l) t = n;
  return t;
}

export interface UpgradeDef { id: string; name: string; icon: string; level: number; cost: number; desc: string; }
export const UPGRADES: UpgradeDef[] = [
  { id: 'music', name: 'In-store Music', icon: '🎵', level: 3, cost: 150, desc: 'Relaxing background music. Customers are a bit happier and stay longer.' },
  { id: 'express', name: 'Express Delivery Contract', icon: '⚡', level: 5, cost: 300, desc: 'Unlocks express deliveries (arrive in ~10 minutes).' },
  { id: 'flyers', name: 'Flyer Campaign', icon: '📰', level: 6, cost: 400, desc: 'Permanent +10% customers from local advertising.' },
  { id: 'palletjack', name: 'Pallet Jack', icon: '🛻', level: 10, cost: 600, desc: 'Big deliveries arrive on pallets. Move a whole pallet of boxes at once.' },
  { id: 'forklift', name: 'Forklift', icon: '🚜', level: 25, cost: 6500, desc: 'Drive a forklift in the warehouse and receiving area: lift whole pallets of boxes and move them fast.' },
  { id: 'scrubber', name: 'Floor Scrubber Machine', icon: '🧽', level: 14, cost: 2500, desc: 'Ride-on scrubber in the maintenance room. Cleans floors 4x faster.' },
  { id: 'led', name: 'LED Lighting', icon: '💡', level: 15, cost: 2500, desc: 'Lighting uses 40% less electricity.' },
  { id: 'loadingdock', name: 'Loading Dock', icon: '🚛', level: 20, cost: 4000, desc: 'Trucks unload directly inside the warehouse.' },
  { id: 'cameras', name: 'Security Cameras', icon: '📹', level: 25, cost: 3000, desc: 'Shoplifting drops by 50%.' },
  { id: 'generator', name: 'Backup Generator', icon: '🔋', level: 30, cost: 8000, desc: 'Keeps the store running during power outages.' },
  { id: 'loyalty', name: 'Loyalty Card Program', icon: '💳', level: 35, cost: 5000, desc: 'Regular customers return more often and spend 5% more.' },
  { id: 'tvads', name: 'Radio & TV Ads', icon: '📺', level: 45, cost: 15000, desc: 'Permanent +20% customers.' },
  { id: 'hvac2', name: 'Smart HVAC', icon: '🌀', level: 55, cost: 18000, desc: 'Heating & cooling use 35% less electricity.' },
  { id: 'parking', name: 'Big Parking Lot', icon: '🅿️', level: 60, cost: 25000, desc: 'More parking: +15% customers, bigger shopping baskets.' },
  { id: 'app', name: 'Store App & Online Coupons', icon: '📱', level: 90, cost: 45000, desc: '+10% customers and +5% spending.' },
  { id: 'solar', name: 'Solar Panels', icon: '☀️', level: 100, cost: 60000, desc: 'Electricity bills drop by 30%.' },
  { id: 'premium', name: 'Premium Interior', icon: '✨', level: 150, cost: 120000, desc: 'Beautiful renovated interior: +satisfaction, +10% spending.' },
  { id: 'cafe', name: 'In-store Café', icon: '☕', level: 200, cost: 180000, desc: 'Customers grab a coffee: +$0.80 per customer.' },
  { id: 'pharmacy', name: 'Pharmacy Corner', icon: '💊', level: 250, cost: 250000, desc: '+8% customers, +6% spending.' },
  { id: 'fuel', name: 'Fuel Station', icon: '⛽', level: 300, cost: 400000, desc: 'Fuel sales add $0.03 profit per customer... times thousands.' },
  { id: 'homedelivery', name: 'Home Delivery Service', icon: '🛵', level: 350, cost: 600000, desc: 'Online orders: +15% revenue.' },
  { id: 'flagship', name: 'Flagship Status', icon: '🏆', level: 450, cost: 1500000, desc: 'Your store becomes the city landmark. +25% customers.' },
];
export const UPGRADE_MAP = new Map(UPGRADES.map((u) => [u.id, u]));

export interface Unlock { kind: string; name: string; icon: string; }

/** Everything that becomes available at a given level. */
export function unlocksAt(level: number): Unlock[] {
  const out: Unlock[] = [];
  for (const c of CATEGORIES) if (c.license && c.license.level === level) out.push({ kind: 'License', name: c.license.name, icon: '📜' });
  for (const p of PRODUCTS) if (p.level === level && p.level > 1) out.push({ kind: 'Product', name: p.name, icon: '🛍️' });
  for (const f of SHOP_FURNITURE) if (f.level === level && f.level > 1) out.push({ kind: 'Furniture', name: f.name, icon: f.icon });
  for (const r of ROOMS) if (r.level === level && r.cost > 0) out.push({ kind: 'Room', name: r.name, icon: '🚪' });
  EXPANSIONS.forEach((e, i) => { if (e.level === level) out.push({ kind: 'Expansion', name: `Store expansion #${i + 1}`, icon: '🏗️' }); });
  for (const r of ROLES) if (r.level === level) out.push({ kind: 'Staff', name: r.name, icon: r.icon });
  for (const u of UPGRADES) if (u.level === level) out.push({ kind: 'Upgrade', name: u.name, icon: u.icon });
  for (const [l, t] of TITLES) if (l === level && l > 1) out.push({ kind: 'Title', name: t, icon: '🎖️' });
  return out;
}
