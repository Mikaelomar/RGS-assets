// Seasonal events driven by the device's real calendar date (live-ops style).
// Christmas: 20 November – 6 January. `?season=christmas` / `?season=none` override it for testing.

export type SeasonId = 'christmas';

export interface SeasonInfo {
  id: SeasonId;
  name: string;
  /** Unique per year, e.g. "christmas-2026" (used for one-time gifts). */
  key: string;
}

let enabled = true;
let cache: { t: number; v: SeasonInfo | null } | null = null;

/** Player setting: seasonal events on/off. */
export function setSeasonalEnabled(on: boolean) {
  if (enabled !== on) cache = null;
  enabled = on;
}

export function currentSeason(): SeasonInfo | null {
  const now = Date.now();
  if (cache && now - cache.t < 60_000) return cache.v;
  let v: SeasonInfo | null = null;
  let q: string | null = null;
  try {
    q = new URLSearchParams(location.search).get('season');
  } catch {
    q = null;
  }
  const d = new Date();
  const m = d.getMonth(), day = d.getDate();
  const xmasDates = (m === 10 && day >= 20) || m === 11 || (m === 0 && day <= 6);
  if (q === 'christmas' || (q !== 'none' && enabled && xmasDates)) {
    const year = m === 0 ? d.getFullYear() - 1 : d.getFullYear();
    v = { id: 'christmas', name: 'Christmas', key: `christmas-${year}` };
  }
  cache = { t: now, v };
  return v;
}

export function isChristmas() {
  return currentSeason()?.id === 'christmas';
}

/** True for items without a season, or when their season is running. */
export function inSeason(season?: string) {
  return !season || currentSeason()?.id === season;
}
