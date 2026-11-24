// Marketing campaigns: pay once, get more customers for a few days.
import type { GameState } from './state';
import type { Game } from './Game';
import { money } from '../core/util';
import { audio } from '../core/Audio';

export interface CampaignDef {
  id: string;
  name: string;
  icon: string;
  level: number;
  cost: number;
  days: number;
  /** Extra customer traffic, e.g. 0.25 = +25 %. */
  boost: number;
  desc: string;
}

export const CAMPAIGNS: CampaignDef[] = [
  { id: 'leaflets', name: 'Leaflets in mailboxes', icon: '📬', level: 2, cost: 60, days: 1, boost: 0.15, desc: 'Neighbours find your weekly offers in their mailbox.' },
  { id: 'newspaper', name: 'Local newspaper ad', icon: '📰', level: 5, cost: 180, days: 2, boost: 0.25, desc: 'A half-page ad in the town paper.' },
  { id: 'radio', name: 'Radio commercial', icon: '📻', level: 10, cost: 450, days: 2, boost: 0.35, desc: 'A catchy jingle on the local radio station.' },
  { id: 'social', name: 'Social media campaign', icon: '📱', level: 15, cost: 700, days: 3, boost: 0.3, desc: 'Targeted posts to people living nearby.' },
  { id: 'billboard', name: 'Street billboard', icon: '🪧', level: 22, cost: 1200, days: 6, boost: 0.25, desc: 'A big billboard on the main road for almost a week.' },
  { id: 'influencer', name: 'Food influencer visit', icon: '🤳', level: 35, cost: 2400, days: 1, boost: 0.8, desc: 'A famous food blogger shows your store to thousands of fans.' },
  { id: 'tv', name: 'TV commercial', icon: '📺', level: 60, cost: 6000, days: 4, boost: 0.6, desc: 'A prime-time TV spot across the whole region.' },
];

export const CAMPAIGN_MAP = new Map(CAMPAIGNS.map((c) => [c.id, c]));

/** Combined boost is capped so the store does not drown in customers. */
const MAX_BOOST = 1.2;

export function activeCampaigns(s: GameState) {
  return (s.campaigns ?? []).filter((c) => c.untilDay >= s.day && CAMPAIGN_MAP.has(c.id));
}

/** Drop expired campaigns and update the traffic multiplier used by the customer spawner. */
export function recomputeMarketing(s: GameState) {
  s.campaigns = activeCampaigns(s);
  s.marketing = Math.min(MAX_BOOST, s.campaigns.reduce((a, c) => a + CAMPAIGN_MAP.get(c.id)!.boost, 0));
}

export function daysLeft(s: GameState, id: string) {
  const c = activeCampaigns(s).find((x) => x.id === id);
  return c ? c.untilDay - s.day + 1 : 0;
}

/** Launch (or extend) a campaign. Returns true when paid. */
export function launchCampaign(g: Game, id: string): boolean {
  const s = g.state;
  const def = CAMPAIGN_MAP.get(id);
  if (!def) return false;
  if (s.level < def.level) {
    g.ui.toast(`${def.name} unlocks at level ${def.level}`, 'bad', '🔒');
    return false;
  }
  if (!g.sim.pay(def.cost, 'marketing')) return false;
  s.campaigns = activeCampaigns(s);
  const cur = s.campaigns.find((c) => c.id === id);
  if (cur) cur.untilDay += def.days;
  else {
    // launched after closing time it runs from tomorrow morning
    const start = s.phase === 'closing' || s.phase === 'night' ? s.day + 1 : s.day;
    s.campaigns.push({ id, untilDay: start + def.days - 1 });
  }
  recomputeMarketing(s);
  g.refreshMarketingVisuals();
  audio.play('unlock');
  const left = daysLeft(s, id);
  g.ui.toast(`${def.icon} ${def.name} is running for ${left} day${left > 1 ? 's' : ''}: +${Math.round(def.boost * 100)}% customers! (${money(def.cost, 0)})`, 'good', '📣', 4500);
  return true;
}
