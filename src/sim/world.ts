/**
 * The world around the dealership: market events, competitors and marketing.
 */
import type { Campaign, Competitor, GameState } from './types';
import { CHANNEL_BY_ID, CITY_BY_ID, COMPETITOR_NAMES, EVENTS, EVENT_BY_ID } from '../data/game';
import { MANUFACTURERS } from '../data/vehicles';
import type { Category } from './types';
import { gameRng } from './rng';
import { clamp, sum } from './util';
import { hasTech, locationById, logEvent, nextId, pushNotice } from './state';
import { record } from './finance';
import { applyEconomyPush } from './systems/economy';
import { marketMods } from './market';
import { reachableClients } from './systems/crm';
import { CITIES } from '../data/game';

// ----------------------------------------------------------------- events --

export function eventsDaily(state: GameState): void {
  // Expire finished events.
  const ending = state.events.filter((e) => e.endDay <= state.day);
  for (const e of ending) {
    const def = EVENT_BY_ID[e.defId];
    if (def) {
      pushNotice(state, 'event', `${def.name} is over. The market is settling.`);
      logEvent(state, `${def.name} ended.`);
    }
  }
  state.events = state.events.filter((e) => e.endDay > state.day);

  if (state.events.length >= 2) return;
  const chance = state.day < 6 ? 0 : 0.09;
  if (!gameRng.chance(chance)) return;
  const pool = EVENTS.filter((d) => d.minDay <= state.day && !state.events.some((e) => e.defId === d.id));
  if (pool.length === 0) return;
  const total = sum(pool, (d) => d.weight);
  let roll = gameRng.next() * total;
  let def = pool[0];
  for (const d of pool) {
    roll -= d.weight;
    if (roll <= 0) { def = d; break; }
  }
  const duration = gameRng.int(def.duration[0], def.duration[1]);
  const active = { id: nextId(state, 'ev'), defId: def.id, startDay: state.day, endDay: state.day + duration, targetBrand: undefined as string | undefined, note: undefined as string | undefined };
  let text = def.description;
  if (def.special === 'recall' || def.special === 'promotion') {
    const brand = gameRng.pick(MANUFACTURERS);
    active.targetBrand = brand.id;
    active.note = brand.name;
    text = def.special === 'recall'
      ? `${brand.name} recalls thousands of cars. Used ${brand.name} values drop while buyers wait for fixes.`
      : `${brand.name} launches big new-car discounts. Used ${brand.name} prices soften.`;
  }
  if (def.special === 'competitor') {
    const city = state.locations[gameRng.int(0, state.locations.length - 1)]?.cityId ?? 'riverton';
    const comp = makeCompetitor(state, city);
    comp.promoDaysLeft = 21;
    comp.pricing = 'Discount';
    state.competitors.push(comp);
    active.note = comp.name;
    text = `${comp.name} opens in ${CITY_BY_ID[city]?.name ?? 'town'} with launch discounts.`;
  }
  state.events.push(active);
  applyEconomyPush(state, def);
  pushNotice(state, 'event', `${def.icon} ${def.name}: ${text}`);
  logEvent(state, `${def.name}: ${text}`);
}

export function eventText(state: GameState, id: string): string {
  const e = state.events.find((x) => x.id === id);
  if (!e) return '';
  const def = EVENT_BY_ID[e.defId];
  if (!def) return '';
  if (def.special === 'recall' && e.note) return `${e.note} recall: values of ${e.note} vehicles are down ~14%.`;
  if (def.special === 'promotion' && e.note) return `${e.note} new-car promotion: used ${e.note} values down ~8%.`;
  if (def.special === 'competitor' && e.note) return `${e.note} has opened with launch discounts.`;
  return def.description;
}

// ------------------------------------------------------------ competitors --

const NAME_SPECIAL: Record<string, Category | 'Mixed'> = {
  'Budget Wheels': 'Economy', 'Prestige Motors': 'Premium', 'Green Garage EV': 'Electric', 'Classic & Co.': 'Classic',
  'Luxe Auto Gallery': 'Luxury', 'Family Motors': 'Family', 'Velocity Cars': 'Sport', 'Premier Autos': 'Premium',
};

const SPECIALS: (Category | 'Mixed')[] = ['Mixed', 'Economy', 'Family', 'SUV', 'Premium', 'Luxury', 'Electric', 'Sport', 'Classic'];

export function makeCompetitor(state: GameState, cityId: string): Competitor {
  const used = new Set(state.competitors.map((c) => c.name));
  const names = COMPETITOR_NAMES.filter((n) => !used.has(n));
  const name = names.length ? gameRng.pick(names) : `${gameRng.pick(COMPETITOR_NAMES)} ${gameRng.int(2, 9)}`;
  const city = CITY_BY_ID[cityId];
  return {
    id: nextId(state, 'k'),
    name,
    cityId,
    reputation: Math.round(gameRng.range(35, 75)),
    size: Math.round(gameRng.range(8, 30) * (city?.demand ?? 1) * (0.6 + (city?.competition ?? 0.4))),
    pricing: gameRng.pick(['Discount', 'Market', 'Premium'] as const),
    specialization: NAME_SPECIAL[name] ?? gameRng.pick(SPECIALS),
    promoDaysLeft: 0,
    trend: 0,
    sold: 0,
    staff: gameRng.int(3, 12),
    marketing: gameRng.range(0.2, 0.7),
    strategy: gameRng.pick(['undercut', 'premium', 'volume', 'specialist'] as const),
    debt: Math.round(gameRng.range(20000, 250000) / 1000) * 1000,
    priceIndex: 1,
  };
}

export function seedCompetitors(state: GameState, cityId: string): void {
  const city = CITY_BY_ID[cityId];
  const n = Math.max(2, Math.round((city?.competition ?? 0.4) * 5));
  for (let i = 0; i < n; i += 1) state.competitors.push(makeCompetitor(state, cityId));
}

/** 0..1 share of the local market held by competitors (higher = more pressure). */
export function competitorPressure(state: GameState, cityId: string): number {
  const rivals = state.competitors.filter((c) => c.cityId === cityId);
  const strength = sum(rivals, (c) => c.size * (c.reputation / 60) * (c.promoDaysLeft > 0 ? 1.4 : 1) * (c.pricing === 'Discount' ? 1.15 : 1) * (2 - (c.priceIndex ?? 1)) * (1 + (c.marketing ?? 0.4) * 0.3));
  const mine = sum(state.locations.filter((l) => l.cityId === cityId), (l) => {
    const stock = state.vehicles.filter((v) => v.locationId === l.id && v.status === 'listed').length;
    return (stock + 4) * ((state.reputation + l.reputation) / 110);
  });
  return clamp(strength / Math.max(1, strength + mine * 1.5), 0, 0.85);
}

export function marketShare(state: GameState, cityId: string): { name: string; share: number; mine: boolean }[] {
  const rivals = state.competitors.filter((c) => c.cityId === cityId);
  const rows = rivals.map((c) => ({ name: c.name, weight: c.size * (c.reputation / 60) * (c.promoDaysLeft > 0 ? 1.3 : 1), mine: false }));
  const mine = sum(state.locations.filter((l) => l.cityId === cityId), (l) => {
    const stock = state.vehicles.filter((v) => v.locationId === l.id && v.status === 'listed').length;
    return (stock + 2) * ((state.reputation + l.reputation) / 110) * 1.2;
  });
  if (mine > 0) rows.push({ name: state.companyName, weight: mine, mine: true });
  const total = sum(rows, (r) => r.weight) || 1;
  return rows.map((r) => ({ name: r.name, share: r.weight / total, mine: r.mine })).sort((a, b) => b.share - a.share);
}

/**
 * Rival dealers act every week: they react to your market share by cutting
 * prices, chase whatever category is hot, advertise harder, borrow to grow,
 * open new branches in booming towns — and go bust if they overreach.
 */
export function competitorsWeekly(state: GameState): void {
  const mods = marketMods(state);
  const hot = Object.entries(mods.category).sort((a, b) => b[1] - a[1])[0]?.[0] as Category | undefined;
  for (const c of state.competitors) {
    c.trend = clamp(c.trend * 0.6 + gameRng.range(-0.35, 0.35), -1, 1);
    c.reputation = clamp(Math.round(c.reputation + c.trend * 3 + gameRng.range(-1.5, 1.5)), 10, 95);
    c.size = clamp(Math.round(c.size * (1 + c.trend * 0.06) + gameRng.range(-1, 2)), 4, 160);
    c.sold += Math.round(c.size * gameRng.range(0.3, 0.7));
    c.debt = Math.max(0, (c.debt ?? 50000) + (c.trend < 0 ? c.size * 400 : -c.size * 250));
    const share = marketShare(state, c.cityId).find((r) => r.mine)?.share ?? 0;
    // You are taking their customers: the undercutters strike back.
    if (share > 0.3 && (c.strategy === 'undercut' || c.strategy === 'volume') && gameRng.chance(0.25)) {
      c.priceIndex = clamp((c.priceIndex ?? 1) - 0.03, 0.88, 1.1);
      c.pricing = 'Discount';
      c.lastMove = 'cut prices';
      if (state.locations.some((l) => l.cityId === c.cityId)) pushNotice(state, 'event', `${c.name} cuts prices to win back customers in ${CITY_BY_ID[c.cityId]?.name}.`);
    } else {
      c.priceIndex = clamp((c.priceIndex ?? 1) + ((c.strategy === 'premium' ? 1.05 : 1) - (c.priceIndex ?? 1)) * 0.2, 0.88, 1.1);
    }
    // Specialists chase what is hot.
    if (hot && c.strategy !== 'premium' && gameRng.chance(0.08) && c.specialization !== hot) {
      c.specialization = hot;
      c.lastMove = `now focuses on ${hot.toLowerCase()} cars`;
      if (state.locations.some((l) => l.cityId === c.cityId)) pushNotice(state, 'info', `${c.name} is stocking up on ${hot.toLowerCase()} cars — demand is rising.`);
    }
    // Marketing pushes.
    c.marketing = clamp((c.marketing ?? 0.4) + gameRng.range(-0.05, 0.05) + (c.trend > 0.4 ? 0.03 : 0), 0.05, 1);
    if (gameRng.chance(0.08)) {
      c.pricing = gameRng.pick(['Discount', 'Market', 'Premium'] as const);
    }
    if (c.promoDaysLeft === 0 && gameRng.chance(0.04 + (c.marketing ?? 0.4) * 0.05)) {
      c.promoDaysLeft = gameRng.int(7, 14);
      c.lastMove = 'runs a sales promotion';
      if (state.locations.some((l) => l.cityId === c.cityId)) {
        pushNotice(state, 'event', `${c.name} is running a sales promotion in ${CITY_BY_ID[c.cityId]?.name}. Expect fewer walk-ins.`);
      }
    }
    // Rivals grow with the market.
    if (c.trend > 0.6 && gameRng.chance(0.1)) {
      c.size += gameRng.int(3, 8);
      c.staff = (c.staff ?? 5) + 1;
      c.lastMove = 'expanded their lot';
      if (state.locations.some((l) => l.cityId === c.cityId)) pushNotice(state, 'info', `${c.name} expanded their lot.`);
    }
  }
  // A strong rival opens a branch in another town.
  const strong = state.competitors.filter((c) => c.trend > 0.7 && c.reputation > 65 && (c.debt ?? 0) < 150000);
  if (strong.length && gameRng.chance(0.05)) {
    const c = gameRng.pick(strong);
    const city = gameRng.pick(CITIES.filter((x) => x.id !== c.cityId));
    const branch = makeCompetitor(state, city.id);
    branch.name = `${c.name} ${city.name}`;
    branch.strategy = c.strategy;
    branch.reputation = Math.round(c.reputation * 0.9);
    state.competitors.push(branch);
    if (state.locations.some((l) => l.cityId === city.id)) pushNotice(state, 'event', `${c.name} opens a new branch in ${city.name}.`);
    logEvent(state, `${c.name} opened in ${city.name}.`);
  }
  // Very weak or over-borrowed rivals close; strong markets attract new ones.
  const closing = state.competitors.filter((c) => (c.reputation < 18 && c.size < 8) || (c.debt ?? 0) > c.size * 30000);
  for (const c of closing) {
    pushNotice(state, 'good', `${c.name} has closed down.`);
    logEvent(state, `${c.name} closed.`);
  }
  state.competitors = state.competitors.filter((c) => !closing.includes(c));
  for (const loc of state.locations) {
    const n = state.competitors.filter((c) => c.cityId === loc.cityId).length;
    if (n < 2 && gameRng.chance(0.03)) state.competitors.push(makeCompetitor(state, loc.cityId));
  }
}

export function competitorsDaily(state: GameState): void {
  for (const c of state.competitors) if (c.promoDaysLeft > 0) c.promoDaysLeft -= 1;
}

// -------------------------------------------------------------- marketing --

export function campaignCost(state: GameState, channelId: string, budget = 1): number {
  const def = CHANNEL_BY_ID[channelId];
  if (!def) return 0;
  const mk = state.employees.filter((e) => e.role === 'marketing').length;
  let cost = def.costPerDay * def.days * budget * (mk > 0 ? 0.9 : 1);
  if (hasTech(state, 'mktanalytics')) cost *= 0.9;
  if ((state.group?.departments.marketing ?? 0) >= 1) cost *= 0.85;
  return Math.round(cost);
}

export function channelAvailable(state: GameState, channelId: string): { ok: boolean; reason?: string } {
  const def = CHANNEL_BY_ID[channelId];
  if (!def) return { ok: false, reason: 'Unknown channel.' };
  if (state.companyLevel < def.minLevel) return { ok: false, reason: `Requires company level ${def.minLevel}.` };
  if (def.requires && !hasTech(state, def.requires)) return { ok: false, reason: 'Needs research: social advertising.' };
  if (def.crm && reachableClients(state) < 5) return { ok: false, reason: 'You need at least 5 clients on your list.' };
  return { ok: true };
}

/** People a campaign reaches (for the metrics). */
export function campaignReach(state: GameState, channelId: string, budget = 1): number {
  const def = CHANNEL_BY_ID[channelId];
  if (!def) return 0;
  if (def.crm) return reachableClients(state);
  return Math.round(def.audience * def.days * Math.sqrt(budget));
}

export function launchCampaign(state: GameState, channelId: string, locationId: string, budget = 1): { ok: boolean; message: string } {
  const def = CHANNEL_BY_ID[channelId];
  const loc = locationById(state, locationId);
  if (!def || !loc) return { ok: false, message: 'Unknown campaign.' };
  const avail = channelAvailable(state, channelId);
  if (!avail.ok) return { ok: false, message: avail.reason ?? '' };
  if (state.campaigns.some((c) => c.channelId === channelId && c.locationId === locationId && c.endDay >= state.day)) {
    return { ok: false, message: `A ${def.name} campaign is already running at ${loc.name}.` };
  }
  const cost = campaignCost(state, channelId, budget);
  if (state.cash < cost) return { ok: false, message: `Needs €${cost.toLocaleString('en-GB')}.` };
  record(state, 'Marketing', -cost, `${def.name} campaign (${def.days} days) — ${loc.name}`, locationId);
  const camp: Campaign = { id: nextId(state, 'm'), channelId, locationId, startDay: state.day, endDay: state.day + def.days - 1, cost, leads: 0, revenue: 0, budget, sales: 0, reach: campaignReach(state, channelId, budget) };
  state.campaigns.unshift(camp);
  if (state.campaigns.length > 40) state.campaigns.length = 40;
  state.stats.campaignsRun = (state.stats.campaignsRun ?? 0) + 1;
  if (def.rep) {
    state.reputation = clamp(state.reputation + def.rep * Math.sqrt(budget) * 0.6, 0, 100);
    loc.reputation = clamp(loc.reputation + def.rep * Math.sqrt(budget), 0, 100);
  }
  return { ok: true, message: `${def.name} campaign launched for ${def.days} days.` };
}

export function campaignRoi(c: Campaign): number {
  return c.cost > 0 ? (c.revenue - c.cost) / c.cost : 0;
}

export function costPerLead(c: Campaign): number {
  return c.leads > 0 ? Math.round(c.cost / c.leads) : c.cost;
}

export function conversion(c: Campaign): number {
  return c.leads > 0 ? (c.sales ?? 0) / c.leads : 0;
}
