// Save slots (autosave + 3 manual) and settings, stored with Capacitor Preferences / localStorage.
import { storage } from '../core/Platform';
import type { GameState } from './state';
import { SAVE_VERSION } from './state';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];

export interface SaveMeta { slot: SlotId; storeName: string; day: number; level: number; money: number; savedAt: number; playtime: number; }

const PREFIX = 'smsim.v1.';

export interface Settings {
  quality: 'auto' | 'low' | 'medium' | 'high';
  sensitivity: number;
  invertY: boolean;
  sfx: number;
  music: number;
  vibration: boolean;
  showFps: boolean;
  headBob: boolean;
  fov: number;
}

export const DEFAULT_SETTINGS: Settings = { quality: 'auto', sensitivity: 1, invertY: false, sfx: 0.8, music: 0.35, vibration: true, showFps: false, headBob: true, fov: 70 };

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await storage.get(PREFIX + 'settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}
export async function saveSettings(s: Settings) {
  await storage.set(PREFIX + 'settings', JSON.stringify(s));
}

export async function writeSave(slot: SlotId, state: GameState): Promise<boolean> {
  try {
    const json = JSON.stringify(state);
    await storage.set(PREFIX + 'save.' + slot, json);
    const meta: SaveMeta = { slot, storeName: state.storeName, day: state.day, level: state.level, money: state.money, savedAt: Date.now(), playtime: state.playtime };
    const idx = await listSaves();
    const others = idx.filter((m) => m.slot !== slot);
    await storage.set(PREFIX + 'index', JSON.stringify([...others, meta]));
    return true;
  } catch (e) {
    console.error('save failed', e);
    return false;
  }
}

export async function readSave(slot: SlotId): Promise<GameState | null> {
  try {
    const raw = await storage.get(PREFIX + 'save.' + slot);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return migrate(s);
  } catch (e) {
    console.error('load failed', e);
    return null;
  }
}

export async function listSaves(): Promise<SaveMeta[]> {
  try {
    const raw = await storage.get(PREFIX + 'index');
    if (!raw) return [];
    return JSON.parse(raw) as SaveMeta[];
  } catch {
    return [];
  }
}

export async function deleteSave(slot: SlotId) {
  await storage.remove(PREFIX + 'save.' + slot);
  const idx = (await listSaves()).filter((m) => m.slot !== slot);
  await storage.set(PREFIX + 'index', JSON.stringify(idx));
}

function migrate(s: GameState): GameState {
  if (!s.version) s.version = SAVE_VERSION;
  s.stats ??= {};
  s.seenTips ??= [];
  s.promos ??= {};
  s.events ??= [];
  s.spills ??= [];
  s.wcDirt ??= { staff: 0, cust: 0 };
  s.power ??= { outageMin: 0, tripped: false };
  s.candidates ??= [];
  return s;
}
