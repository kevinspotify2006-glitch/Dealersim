/**
 * Progression: company levels, upgrades, expansion, achievements and legacy.
 */
import type { GameState, Location } from './types';
import { ACHIEVEMENTS, CITY_BY_ID, COMPANY_LEVELS, LEGACY_PERKS, MAX_LOCATIONS_BY_LEVEL, UPGRADE_BY_ID } from '../data/game';
import { PHYSICAL_UPGRADES, capacityOf, locationById, nextId, occupying, pushNotice, repStars, staffAt } from './state';
import { RESEARCH } from '../data/research';
import { seedParts } from './systems/service';
import { buildTemplate, emptyLot, rentFor } from './lot';
import { companyValue, locationUpgradeValue, record } from './finance';
import { emit } from './bus';
import { seedCompetitors } from './world';
import { clamp } from './util';

export function levelDef(level: number) {
  return COMPANY_LEVELS[clamp(level, 1, COMPANY_LEVELS.length) - 1];
}

/** Progress 0..1 towards the next company level (both value and sales count). */
export function levelProgress(state: GameState): { value: number; sold: number; overall: number; next?: typeof COMPANY_LEVELS[number] } {
  const next = COMPANY_LEVELS[state.companyLevel];
  if (!next) return { value: 1, sold: 1, overall: 1 };
  const value = clamp(companyValue(state) / next.value, 0, 1);
  const sold = clamp(state.stats.sold / next.sold, 0, 1);
  return { value, sold, overall: Math.min(value, sold), next };
}

export function checkLevel(state: GameState): void {
  let changed = false;
  while (state.companyLevel < COMPANY_LEVELS.length) {
    const next = COMPANY_LEVELS[state.companyLevel];
    if (companyValue(state) >= next.value && state.stats.sold >= next.sold) {
      state.companyLevel += 1;
      changed = true;
      pushNotice(state, 'good', `🏆 Level up! You are now a ${next.name}. Unlocked: ${next.unlocks.join(', ')}.`);
      emit('levelup', { level: state.companyLevel });
    } else break;
  }
  if (changed && state.companyLevel >= 7) unlock(state, 'empire');
}

// ----------------------------------------------------------------- upgrades --

export interface UpgradeCheck { ok: boolean; reason?: string; cost?: number; level: number; max: number; }

export function upgradeCheck(state: GameState, loc: Location, id: string): UpgradeCheck {
  const def = UPGRADE_BY_ID[id];
  const level = loc.upgrades[id] ?? 0;
  if (!def) return { ok: false, reason: 'Unknown upgrade.', level, max: 0 };
  if (PHYSICAL_UPGRADES.includes(id) || id === 'parking' || id === 'office' || id === 'storage') return { ok: false, reason: 'Build this in the dealership (Build mode).', level, max: 0 };
  const max = def.costs.length;
  if (level >= max) return { ok: false, reason: 'Fully upgraded.', level, max };
  const cost = def.costs[level];
  const need = def.minCompanyLevel[level] ?? 1;
  if (state.companyLevel < need) return { ok: false, reason: `Requires company level ${need}.`, cost, level, max };
  if (state.cash < cost) return { ok: false, reason: 'Not enough cash.', cost, level, max };
  return { ok: true, cost, level, max };
}

export function buyUpgrade(state: GameState, locationId: string, id: string): { ok: boolean; message: string } {
  const loc = locationById(state, locationId);
  if (!loc) return { ok: false, message: 'Unknown location.' };
  const check = upgradeCheck(state, loc, id);
  if (!check.ok || check.cost === undefined) return { ok: false, message: check.reason ?? 'Not possible.' };
  const def = UPGRADE_BY_ID[id];
  record(state, 'Upgrades', -check.cost, `${def.name} → level ${check.level + 1} at ${loc.name}`, loc.id);
  loc.upgrades[id] = check.level + 1;
  // Bigger premises cost more to run.
  loc.rentMonthly = Math.round(loc.rentMonthly + check.cost * 0.004);
  if (id === 'parking' && occupying(state, loc.id) >= capacityOf(loc)) unlock(state, 'fleet');
  return { ok: true, message: `${def.name} upgraded: ${def.effect[check.level + 1] ?? ''}` };
}

// --------------------------------------------------------------- expansion --

export function maxLocations(state: GameState): number {
  return MAX_LOCATIONS_BY_LEVEL[state.companyLevel - 1] ?? 1;
}

export function openLocation(state: GameState, cityId: string): { ok: boolean; message: string } {
  const city = CITY_BY_ID[cityId];
  if (!city) return { ok: false, message: 'Unknown city.' };
  if (state.locations.some((l) => l.cityId === cityId)) return { ok: false, message: `You already have a dealership in ${city.name}.` };
  if (state.locations.length >= maxLocations(state)) {
    return { ok: false, message: `Your company level allows ${maxLocations(state)} location(s). Grow the business first.` };
  }
  if (state.cash < city.openCost) return { ok: false, message: `Opening in ${city.name} costs €${city.openCost.toLocaleString('en-GB')}.` };
  record(state, 'Expansion', -city.openCost, `Opened a dealership in ${city.name}`);
  const loc: Location = {
    id: nextId(state, 'loc'),
    cityId,
    name: `${city.name}`,
    openedDay: state.day,
    upgrades: {},
    lot: emptyLot(0),
    reputation: clamp(state.reputation - 10, 20, 90),
    stats: { revenue: 0, profit: 0, sold: 0, leads: 0 },
    month: { revenue: 0, profit: 0, sold: 0, leads: 0 },
    rentMonthly: city.rent,
  };
  // New branches open as a ready-to-trade small lot; rebuild them freely in Build mode.
  buildTemplate(state, loc.lot, 'small', state.companyLevel);
  for (const o of loc.lot.objects) o.id = `o${(state.idCounter += 1).toString(36)}`;
  loc.lot.version += 1;
  seedParts(loc);
  loc.rentMonthly = rentFor(loc);
  state.locations.push(loc);
  state.autoList[loc.id] = true;
  if (!state.competitors.some((c) => c.cityId === cityId)) seedCompetitors(state, cityId);
  if (state.locations.length >= 2) unlock(state, 'second');
  return { ok: true, message: `Welcome to ${city.name}! Stock it, staff it, and it will start trading.` };
}

export function closeLocation(state: GameState, locationId: string): { ok: boolean; message: string } {
  const loc = locationById(state, locationId);
  if (!loc) return { ok: false, message: 'Unknown location.' };
  if (state.locations.length <= 1) return { ok: false, message: 'You cannot close your only dealership.' };
  const stock = state.vehicles.filter((v) => v.locationId === locationId || v.transferTo === locationId);
  if (stock.length) return { ok: false, message: 'Move or sell the vehicles there first.' };
  if (staffAt(state, locationId).length) return { ok: false, message: 'Transfer or let go of the staff there first.' };
  const city = CITY_BY_ID[loc.cityId];
  const refund = Math.round((city?.openCost ?? 0) * 0.45 + locationUpgradeValue(state, locationId) * 0.35);
  if (refund > 0) record(state, 'Expansion', refund, `Sold premises in ${loc.name}`);
  state.locations = state.locations.filter((l) => l.id !== locationId);
  if (state.activeLocationId === locationId) state.activeLocationId = state.locations[0].id;
  state.campaigns = state.campaigns.filter((c) => c.locationId !== locationId);
  return { ok: true, message: `${loc.name} closed. Premises and fittings sold for €${refund.toLocaleString('en-GB')}.` };
}

// ------------------------------------------------------------ achievements --

export function unlock(state: GameState, id: string): void {
  if (state.achievements[id]) return;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return;
  state.achievements[id] = state.day;
  pushNotice(state, 'good', `${def.icon} Achievement: ${def.name}`);
  emit('achievement', { id });
}

export function checkAchievements(state: GameState): void {
  const value = companyValue(state);
  const st = state.stats;
  state.stats.peakCompanyValue = Math.max(state.stats.peakCompanyValue, value);
  const rules: [string, boolean][] = [
    ['firstsale', st.sold >= 1], ['tensales', st.sold >= 10], ['sold100', st.sold >= 100], ['sold500', st.sold >= 500], ['sold1000', st.sold >= 1000],
    ['value100k', value >= 100000], ['value1m', value >= 1000000], ['value10m', value >= 10000000],
    ['second', state.locations.length >= 2], ['multi', state.locations.length >= 4], ['empire', state.companyLevel >= 7],
    ['customers1000', st.customersTotal >= 1000], ['perfect', st.perfectReviews >= 1], ['fivestar50', st.perfectReviews >= 50],
    ['rep4', repStars(state.reputation) >= 4], ['rep90', state.reputation >= 90], ['bigdeal', st.biggestDeal >= 100000], ['bestmonth', st.bestMonthProfit >= 50000],
    ['hire5', state.employees.length >= 5], ['hire25', state.employees.length >= 25], ['fullteam', new Set(state.employees.map((e) => e.role)).size >= 10],
    ['evspecial', (st.evSold ?? 0) >= 25], ['luxurydealer', (st.luxurySold ?? 0) >= 25], ['newcar', (st.newSold ?? 0) >= 1],
    ['official', state.contracts.length >= 1], ['gold', state.contracts.some((c) => c.tier >= 3)], ['repeat10', (st.repeatSales ?? 0) >= 10],
    ['financier', (st.financeDeals ?? 0) >= 50], ['certified', (st.certifiedSold ?? 0) >= 10], ['service100', (st.serviceJobs ?? 0) >= 100],
    ['fleetdeal', state.fleet.some((f) => f.status === 'done')], ['research5', Object.keys(state.research.done).length >= 5],
    ['researchall', Object.keys(state.research.done).length >= RESEARCH.length], ['hq', state.group.hq], ['acquirer', state.group.acquisitions >= 1],
    ['online10', (st.onlineSales ?? 0) >= 10], ['testdrive100', (st.testDrives ?? 0) >= 100], ['decisions20', (st.decisionsMade ?? 0) >= 20],
    ['missions10', Object.keys(state.missions.done).length >= 10], ['nodebt1m', state.cash >= 1000000],
    ['debtfree', (st.loansRepaid ?? 0) >= 1], ['rarefind', (st.rareBought ?? 0) >= 1],
  ];
  for (const [id, ok] of rules) if (ok) unlock(state, id);
  for (const loc of state.locations) {
    if (occupying(state, loc.id) >= capacityOf(loc)) unlock(state, 'fleet');
  }
  if (state.vehicles.some((v) => v.issues.some((i) => i.discovered && i.severity === 3 && !i.visible))) unlock(state, 'lemon');
}

// ------------------------------------------------------------------ legacy --

export function canPrestige(state: GameState): boolean {
  return state.companyLevel >= 6 || companyValue(state) >= 4_500_000;
}

export function legacyPointsFor(state: GameState): number {
  const value = Math.max(0, companyValue(state));
  return Math.max(1, Math.floor(Math.sqrt(value / 100000)) + Math.floor(state.companyLevel / 2));
}

export function perkCost(id: string, level: number): number {
  const def = LEGACY_PERKS.find((p) => p.id === id);
  return def ? def.cost * (level + 1) : 99;
}
