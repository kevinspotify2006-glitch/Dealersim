/**
 * Missions: three goals at a time, measured from the real game state.
 */
import type { GameState } from '../types';
import { MISSIONS, MISSION_BY_ID } from '../../data/missions';
import type { MissionDef, MissionMetric } from '../../data/missions';
import { clamp } from '../util';
import { pushNotice, repStars } from '../state';
import { companyValue, record } from '../finance';
import { speedUpResearch } from './research';
import { lotStats, roomsOf } from '../lot';

export const ACTIVE_MISSIONS = 3;

export function metricValue(state: GameState, m: MissionMetric): number {
  const st = state.stats;
  switch (m) {
    case 'sold': return st.sold;
    case 'lifetimeProfit': return st.lifetimeProfit;
    case 'monthProfit': return Math.max(st.bestMonthProfit, state.month.profit - state.month.expenses);
    case 'repStars': return repStars(state.reputation);
    case 'serviceJobs': return st.serviceJobs ?? 0;
    case 'evSold': return st.evSold ?? 0;
    case 'customers': return st.customersTotal;
    case 'locations': return state.locations.length;
    case 'contracts': return state.contracts.length;
    case 'companyValue': return companyValue(state);
    case 'employees': return state.employees.length;
    case 'research': return Object.keys(state.research.done).length;
    case 'financeDeals': return st.financeDeals ?? 0;
    case 'repeatSales': return st.repeatSales ?? 0;
    case 'certifiedSold': return st.certifiedSold ?? 0;
    case 'fleetDelivered': return st.fleetDelivered ?? 0;
    case 'luxurySold': return st.luxurySold ?? 0;
    case 'newSold': return st.newSold ?? 0;
    case 'objects': return state.locations.reduce((s, l) => s + l.lot.objects.filter((o) => o.defId !== 'carpos').length, 0);
    case 'listed': return state.vehicles.filter((v) => v.status === 'listed').length;
    case 'testDrives': return st.testDrives ?? 0;
    case 'decisions': return st.decisionsMade ?? 0;
    case 'onlineSales': return st.onlineSales ?? 0;
    case 'hq': return state.group.hq ? 1 : 0;
    case 'acquisitions': return state.group.acquisitions;
    case 'goldContract': return state.contracts.some((c) => c.tier >= 3) ? 1 : 0;
    case 'roles': return new Set(state.employees.map((e) => e.role)).size;
    case 'productsSold': return st.productsSold ?? 0;
    case 'campaigns': return st.campaignsRun ?? 0;
    case 'companyLevel': return state.companyLevel;
    case 'cash': return state.cash;
    case 'landTier': return Math.max(0, ...state.locations.map((l) => l.lot.landTier));
    case 'lifts': return Math.max(0, ...state.locations.map((l) => lotStats(l.lot).slots.lift.length));
    case 'evCharging': return Math.max(0, ...state.locations.map((l) => l.lot.objects.filter((o) => ['charger', 'hpcharger', 'evparking', 'solarcarport', 'evdisplay', 'evdelivery'].includes(o.defId)).length + l.lot.objects.filter((o) => o.defId === 'multicharger').length * 4));
    case 'capacity': return Math.max(0, ...state.locations.map((l) => lotStats(l.lot).capacity));
    case 'premiumShowroom': return state.locations.some((l) => lotStats(l.lot).levels.showroom >= 3 && l.lot.objects.filter((o) => ['premiumdisplay', 'luxplatform', 'turntable'].includes(o.defId)).length >= 2) ? 1 : 0;
    case 'playerDrives': return st.playerDrives ?? 0;
    case 'testDriveCentre': return state.locations.some((l) => roomsOf(l.lot).some((r) => r.code === 'q' && r.complete)) ? 1 : 0;
    case 'rooms': return Math.max(0, ...state.locations.map((l) => roomsOf(l.lot).filter((r) => r.complete && r.indoor).length));
    default: return 0;
  }
}

export function missionProgress(state: GameState, def: MissionDef): number {
  return clamp(metricValue(state, def.metric) / def.target, 0, 1);
}

/** Fills the active slots with the next missions in order. */
export function refillMissions(state: GameState): void {
  const ms = state.missions;
  ms.active = ms.active.filter((id) => MISSION_BY_ID[id] && !ms.done[id]);
  for (const def of MISSIONS) {
    if (ms.active.length >= ACTIVE_MISSIONS) break;
    if (ms.done[def.id] || ms.active.includes(def.id) || def.minLevel > state.companyLevel) continue;
    ms.active.push(def.id);
  }
}

/** Daily: pay out what is complete. */
export function missionsDaily(state: GameState): void {
  refillMissions(state);
  for (const id of [...state.missions.active]) {
    const def = MISSION_BY_ID[id];
    if (!def || metricValue(state, def.metric) < def.target) continue;
    state.missions.done[id] = state.day;
    state.missions.active = state.missions.active.filter((x) => x !== id);
    const r = def.reward;
    const parts: string[] = [];
    if (r.cash) { record(state, 'Other', r.cash, `Mission reward: ${def.name}`); parts.push(`€${r.cash.toLocaleString('en-GB')}`); }
    if (r.rep) { state.reputation = clamp(state.reputation + r.rep, 0, 100); parts.push(`+${r.rep} reputation`); }
    if (r.research) { speedUpResearch(state, 4); parts.push('research sped up'); }
    if (r.relation) { for (const c of state.contracts) c.relation = clamp(c.relation + r.relation, 0, 100); parts.push('better brand relations'); }
    if (r.note) parts.push(r.note.toLowerCase());
    pushNotice(state, 'good', `🎯 Mission complete: ${def.name}${parts.length ? ` — ${parts.join(', ')}` : ''}.`);
  }
  refillMissions(state);
}

export function missionsDone(state: GameState): number {
  return Object.keys(state.missions.done).length;
}
