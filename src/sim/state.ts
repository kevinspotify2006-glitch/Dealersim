/**
 * Game-state constants and small accessors shared by every simulation module.
 */
import type { Employee, GameState, Location, Notice, Settings, Vehicle } from './types';
import { CITY_BY_ID } from '../data/game';
import { lotStats } from './lot';
import { emit } from './bus';

export const SAVE_VERSION = 7;

/** Opening hours. The clock runs from OPEN_HOUR to CLOSE_HOUR, then the day settles. */
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 20;
export const HOURS_PER_DAY = CLOSE_HOUR - OPEN_HOUR;

/** In-game hours per real second at each speed. Index 0 is pause. */
export const SPEEDS = [0, 0.75, 1.6, 4] as const;
export const SPEED_LABELS = ['❚❚', '1×', '2×', '4×'] as const;

export const HISTORY_LIMIT = 400;
export const TX_LIMIT = 800;
export const NOTICE_LIMIT = 80;
export const SOLD_ARCHIVE_LIMIT = 250;

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: false,
  haptics: true,
  autosave: true,
  confirmBigSpend: 20000,
  reducedMotion: false,
  tutorial: true,
  pauseOnCustomer: true,
  autoStaffDeals: true,
  dailyReport: true,
};

/** A unique id from the save's own counter, so ids survive save/load. */
export function nextId(state: GameState, prefix: string): string {
  state.idCounter += 1;
  return `${prefix}${state.idCounter.toString(36)}`;
}

/** Absolute hour index, used for customer waiting windows. */
export function absHour(state: GameState): number {
  return state.day * 24 + state.hour;
}

export function activeLocation(state: GameState): Location {
  return state.locations.find((l) => l.id === state.activeLocationId) ?? state.locations[0];
}

export function locationById(state: GameState, id: string): Location | undefined {
  return state.locations.find((l) => l.id === id);
}

export function locationName(state: GameState, id: string): string {
  return locationById(state, id)?.name ?? 'Unknown';
}

/** Facilities that are physical things on the lot rather than bought services. */
export const PHYSICAL_UPGRADES = ['showroom', 'workshop', 'detailing', 'lounge', 'equipment'];

/**
 * Facility level. Physical facilities (showroom, workshop, detailing, lounge,
 * diagnostics) come from what is actually built on the lot; services
 * (marketing, finance desk, trade-in centre, analytics) are bought levels.
 */
export function upgradeLevel(location: Location, id: string): number {
  if (PHYSICAL_UPGRADES.includes(id) && location.lot) return lotStats(location.lot).levels[id] ?? 0;
  return location.upgrades[id] ?? 0;
}

/** Vehicles that physically occupy a space at a location. */
export function vehiclesAt(state: GameState, locationId: string): Vehicle[] {
  return state.vehicles.filter((v) => v.locationId === locationId && v.status !== 'sold');
}

export function occupying(state: GameState, locationId: string): number {
  // In-transit purchases have a space reserved for them; transfers reserve at the destination.
  let n = 0;
  for (const v of state.vehicles) {
    if (v.status === 'sold') continue;
    if (v.status === 'transfer') {
      if (v.transferTo === locationId) n += 1;
      continue;
    }
    if (v.locationId === locationId) n += 1;
  }
  return n;
}

/** Vehicle spaces physically built at the location (parking, displays, storage). */
export function capacityOf(location: Location): number {
  return lotStats(location.lot).capacity;
}

export function freeSpaces(state: GameState, locationId: string): number {
  const location = locationById(state, locationId);
  if (!location) return 0;
  return capacityOf(location) - occupying(state, locationId);
}

/** Workstations at the location (desks, lifts, detailing bays). */
export function staffCapacity(location: Location): number {
  return lotStats(location.lot).stationCount;
}

export function staffAt(state: GameState, locationId: string): Employee[] {
  return state.employees.filter((e) => e.locationId === locationId);
}

export function cityOf(location: Location) {
  return CITY_BY_ID[location.cityId];
}

export function ownedVehicles(state: GameState): Vehicle[] {
  return state.vehicles.filter((v) => v.status !== 'sold');
}

export function pushNotice(state: GameState, kind: Notice['kind'], text: string, action?: Notice['action']): Notice {
  state.noticeCounter += 1;
  const notice: Notice = { id: state.noticeCounter, day: state.day, kind, text, read: false, ...(action ? { action } : {}) };
  state.notices.unshift(notice);
  if (state.notices.length > NOTICE_LIMIT) state.notices.length = NOTICE_LIMIT;
  emit('notice', notice);
  return notice;
}

export function logEvent(state: GameState, text: string): void {
  state.eventLog.unshift({ day: state.day, text });
  if (state.eventLog.length > 120) state.eventLog.length = 120;
}

export function vehicleName(v: Pick<Vehicle, 'year' | 'brand' | 'model'>): string {
  return `${v.year} ${v.brand} ${v.model}`;
}

export function vehicleFullName(v: Vehicle): string {
  return `${v.year} ${v.brand} ${v.model} ${v.trim}`;
}

/** Has this research project been finished? */
export function hasTech(state: GameState, id: string): boolean {
  return !!state.research?.done?.[id];
}

/** Combined multiplier of temporary boosts (decisions, events) for a location. */
export function boostMult(state: GameState, what: GameState['boosts'][number]['what'], locationId?: string): number {
  let m = 1;
  for (const b of state.boosts ?? []) {
    if (b.what !== what || b.until < state.day) continue;
    if (b.locationId && locationId && b.locationId !== locationId) continue;
    m *= b.mult;
  }
  return m;
}

/** Reputation 0..100 shown as stars 0..5 (one decimal). */
export function repStars(rep: number): number {
  return Math.round(rep / 2) / 10;
}

export function emptyFunnel(): Record<import('./types').FunnelStage, number> {
  return { ad: 0, visit: 0, browse: 0, interest: 0, testdrive: 0, negotiation: 0, finance: 0, tradein: 0, sale: 0, delivery: 0, review: 0, repeat: 0 };
}

/** Counts a customer reaching a stage of the sales funnel (once per stage). */
export function funnelStep(state: GameState, stage: import('./types').FunnelStage, n = 1): void {
  if (!state.funnel) return;
  state.funnel.month[stage] = (state.funnel.month[stage] ?? 0) + n;
  state.funnel.total[stage] = (state.funnel.total[stage] ?? 0) + n;
}

export function emptyKpi(): GameState['kpi'] {
  return { waitHours: 0, waitCount: 0, financeDeals: 0, financeOffers: 0, productsSold: 0, serviceRevenue: 0, partsRevenue: 0, financeIncome: 0, deliveries: 0, serviceTurnedAway: 0 };
}
