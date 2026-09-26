/**
 * Logistics (v7.3): your own transport fleet. Vans, trucks, car carriers and a
 * regional logistics centre each move a number of cars a day. The fleet
 * collects bought cars sooner, moves stock between locations cheaper than a
 * carrier and — with logistics automated and a logistics manager in charge —
 * balances stock: surplus cars go to locations that run short.
 *
 * Vehicles wear, break down now and then (reliability) and cost money every
 * month whether they drive or not.
 */
import type { GameState, LogiAssetType, Vehicle } from '../types';
import { LOGI_ASSETS, LOGI_BY_TYPE } from '../../data/automation';
import { gameRng } from '../rng';
import { clamp } from '../util';
import { locationById, nextId, pushNotice } from '../state';
import { record } from '../finance';
import { transferVehicle } from '../trading';
import { freeSpaces } from '../state';
import { bump, fleetFree, fleetSlot, inventoryPolicy, managerFor, modeFor, raise, settle, stockAt } from './autocore';

export function fleetAt(state: GameState, locationId?: string) {
  return state.logistics.fleet.filter((a) => !locationId || a.locationId === locationId);
}

export function fleetCapacity(state: GameState): number {
  return state.logistics.fleet.reduce((s, a) => s + LOGI_BY_TYPE[a.type].capacity, 0);
}

export function fleetMonthlyCost(state: GameState): number {
  return state.logistics.fleet.reduce((s, a) => s + LOGI_BY_TYPE[a.type].monthly, 0);
}

/** Days your fleet takes off a purchase's delivery (the fastest vehicle available). */
export function fleetSpeed(state: GameState): number {
  const up = state.logistics.fleet.filter((a) => !a.downUntil || a.downUntil <= state.day);
  return up.reduce((m, a) => Math.max(m, LOGI_BY_TYPE[a.type].speed), 0);
}

export function buyAsset(state: GameState, type: LogiAssetType, locationId: string): { ok: boolean; message: string } {
  const def = LOGI_BY_TYPE[type];
  const loc = locationById(state, locationId);
  if (!def || !loc) return { ok: false, message: 'Unknown vehicle or location.' };
  if (state.companyLevel < def.minLevel) return { ok: false, message: `A ${def.name.toLowerCase()} is available from company level ${def.minLevel}.` };
  if (type === 'hub' && state.logistics.fleet.some((a) => a.type === 'hub')) return { ok: false, message: 'You already run a regional logistics centre.' };
  if (state.cash < def.price) return { ok: false, message: `A ${def.name.toLowerCase()} costs €${def.price.toLocaleString('en-GB')}.` };
  record(state, 'Logistics', -def.price, `Bought: ${def.name}`, locationId);
  state.logistics.fleet.push({ id: nextId(state, 'lg'), type, locationId, boughtDay: state.day, condition: 100 });
  bump(state, 'logistics', 'bought');
  return { ok: true, message: `${def.icon} ${def.name} based at ${loc.name}: ${def.capacity} car${def.capacity > 1 ? 's' : ''} a day, €${def.monthly.toLocaleString('en-GB')}/month.` };
}

export function assetValue(state: GameState, id: string): number {
  const a = state.logistics.fleet.find((x) => x.id === id);
  if (!a) return 0;
  const def = LOGI_BY_TYPE[a.type];
  const years = (state.day - a.boughtDay) / 360;
  return Math.round(def.price * Math.max(0.2, 0.7 - years * 0.12) * (0.5 + a.condition / 200) / 100) * 100;
}

export function sellAsset(state: GameState, id: string): { ok: boolean; message: string } {
  const a = state.logistics.fleet.find((x) => x.id === id);
  if (!a) return { ok: false, message: 'Unknown vehicle.' };
  const value = assetValue(state, id);
  record(state, 'Logistics', value, `Sold: ${LOGI_BY_TYPE[a.type].name}`, a.locationId);
  state.logistics.fleet = state.logistics.fleet.filter((x) => x.id !== id);
  return { ok: true, message: `${LOGI_BY_TYPE[a.type].name} sold for €${value.toLocaleString('en-GB')}.` };
}

/** Workshop visit: back to full condition. */
export function serviceAsset(state: GameState, id: string): { ok: boolean; message: string } {
  const a = state.logistics.fleet.find((x) => x.id === id);
  if (!a) return { ok: false, message: 'Unknown vehicle.' };
  if (a.condition >= 95) return { ok: false, message: 'It is in top condition already.' };
  const cost = Math.round(LOGI_BY_TYPE[a.type].price * (100 - a.condition) / 100 * 0.08 / 10) * 10 + 150;
  if (state.cash < cost) return { ok: false, message: `The service costs €${cost.toLocaleString('en-GB')}.` };
  record(state, 'Logistics', -cost, `Fleet service: ${LOGI_BY_TYPE[a.type].name}`, a.locationId);
  a.condition = 100;
  a.downUntil = undefined;
  return { ok: true, message: `${LOGI_BY_TYPE[a.type].name} serviced (€${cost.toLocaleString('en-GB')}).` };
}

/** Collects bought cars with your own fleet: they arrive sooner. */
function pickUps(state: GameState): number {
  const speed = fleetSpeed(state);
  if (!speed || !state.automation.policies.logistics.pickUp) return 0;
  let n = 0;
  const waiting = state.vehicles
    .filter((v): v is Vehicle => v.status === 'transit' && !v.pickedUp && v.arrivalDay > state.day + 1 && modeFor(state, v.locationId, 'logistics') !== 'manual')
    .sort((a, b) => b.arrivalDay - a.arrivalDay);
  for (const v of waiting) {
    const cost = fleetSlot(state);
    if (cost === undefined) break;
    v.arrivalDay = Math.max(state.day + 1, v.arrivalDay - speed);
    v.pickedUp = true;
    v.costs.transport += cost;
    record(state, 'Logistics', -cost, `Own fleet collects ${v.brand} ${v.model}`, v.locationId);
    bump(state, 'logistics', 'collected');
    n += 1;
  }
  return n;
}

/** Stock balancing between locations: surplus to where it runs short. */
function balance(state: GameState, seen: Set<string>): number {
  if (state.locations.length < 2 || !state.automation.policies.logistics.balanceStock) return 0;
  const info = state.locations.map((l) => ({ l, stock: stockAt(state, l), pol: inventoryPolicy(state, l.id) }));
  const short = info.filter((x) => x.stock < x.pol.minStock && freeSpaces(state, x.l.id) > 0).sort((a, b) => a.stock - b.stock);
  const surplus = info.filter((x) => x.stock > x.pol.targetStock).sort((a, b) => b.stock - a.stock);
  let moved = 0;
  for (const to of short) {
    for (const from of surplus) {
      const mode = modeFor(state, from.l.id, 'logistics');
      if (mode === 'manual') continue;
      const key = `lg:bal:${from.l.id}:${to.l.id}`;
      if (mode === 'assisted') {
        raise(state, { dept: 'logistics', priority: 'normal', text: `Move cars from ${from.l.name} (${from.stock}) to ${to.l.name} (${to.stock}, below minimum).`, locationId: from.l.id, route: 'inventory', key }, seen);
        continue;
      }
      const mgr = managerFor(state, from.l.id, 'logistics');
      if (!mgr) {
        raise(state, { dept: 'logistics', priority: 'high', text: `${to.l.name} runs short but nobody at ${from.l.name} runs logistics — hire a logistics or inventory manager.`, locationId: from.l.id, route: 'people', key }, seen);
        continue;
      }
      let actions = Math.min(mgr.actions, from.stock - from.pol.targetStock, to.pol.targetStock - to.stock);
      // Oldest stock moves first — a fresh market often sells it.
      const cars = state.vehicles
        .filter((v) => v.locationId === from.l.id && (v.status === 'yard' || v.status === 'listed') && !state.customers.some((c) => c.vehicleId === v.id))
        .sort((a, b) => b.daysInStock - a.daysInStock);
      for (const v of cars) {
        if (actions <= 0 || freeSpaces(state, to.l.id) <= 0) break;
        // A weak manager sometimes sends the wrong car (a fresh one).
        const car = gameRng.chance(mgr.err) ? cars[cars.length - 1] : v;
        if (!car || car.status === 'transfer') continue;
        const r = transferVehicle(state, car.id, to.l.id);
        if (!r.ok) break;
        from.stock -= 1;
        to.stock += 1;
        moved += 1;
        actions -= 1;
        bump(state, 'logistics', 'transfers');
      }
    }
  }
  return moved;
}

/** Morning run: wear, breakdowns, pick-ups and balancing. */
export function logisticsDaily(state: GameState): void {
  const seen = new Set<string>();
  const lg = state.logistics;
  lg.usedDay = state.day;
  lg.used = 0;
  for (const a of lg.fleet) {
    const def = LOGI_BY_TYPE[a.type];
    a.condition = clamp(a.condition - gameRng.range(0.05, 0.25), 0, 100);
    if (a.downUntil && a.downUntil <= state.day) a.downUntil = undefined;
    const rel = def.reliability * (0.75 + a.condition / 400);
    if (!a.downUntil && !gameRng.chance(rel)) {
      a.downUntil = state.day + gameRng.int(1, 2);
      const repair = Math.round(def.monthly * gameRng.range(0.1, 0.3) / 10) * 10;
      record(state, 'Logistics', -repair, `Breakdown: ${def.name}`, a.locationId);
      lg.costMonth += repair;
      bump(state, 'logistics', 'breakdowns');
      raise(state, { dept: 'logistics', priority: 'low', text: `${def.icon} ${def.name} broke down (€${repair.toLocaleString('en-GB')}); back in ${a.downUntil - state.day} day(s).`, locationId: a.locationId, route: 'management', params: { tab: 'logistics' }, key: `lg:down:${a.id}` }, seen);
    } else if (a.downUntil) {
      seen.add(`lg:down:${a.id}`);
    }
    if (a.condition < 40) raise(state, { dept: 'logistics', priority: 'normal', text: `${def.name} is worn (${Math.round(a.condition)}%) — service it to avoid breakdowns.`, locationId: a.locationId, route: 'management', params: { tab: 'logistics' }, key: `lg:worn:${a.id}` }, seen);
  }
  pickUps(state);
  balance(state, seen);
  settle(state, 'lg:', seen);
}

export function logisticsMonthly(state: GameState): void {
  const lg = state.logistics;
  const cost = fleetMonthlyCost(state);
  if (cost > 0) {
    record(state, 'Logistics', -cost, `Fleet: ${lg.fleet.length} vehicle${lg.fleet.length === 1 ? '' : 's'} (drivers, insurance, upkeep)`);
    pushNotice(state, 'info', `🚚 Logistics last month: ${lg.movedMonth} moves, running costs €${(cost + lg.costMonth).toLocaleString('en-GB')}.`, undefined, 'auto');
  }
  lg.movedMonth = 0;
  lg.costMonth = 0;
}

export { LOGI_ASSETS, fleetFree };
