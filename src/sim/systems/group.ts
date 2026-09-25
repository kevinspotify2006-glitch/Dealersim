/**
 * The dealer group: headquarters, central departments, regional managers and
 * acquisitions of rival dealerships.
 */
import type { Competitor, GameState, Location } from '../types';
import { BRAND_POSITIONS, DEPARTMENTS, DEPARTMENT_BY_ID, HQ_COST, HQ_MONTHLY, REBRAND_COST_PER_LOCATION } from '../../data/group';
import { CITY_BY_ID } from '../../data/game';
import { gameRng } from '../rng';
import { clamp } from '../util';
import { hasTech, locationById, nextId, pushNotice, staffAt } from '../state';
import { record, monthlyPayment } from '../finance';
import { buildTemplate, emptyLot, rentFor, assignSlots, assignStations, lotStats } from '../lot';
import { createOffer } from '../vehicles';
import { suggestedPrice, roundPrice } from '../market';
import { makeEmployee } from '../staff';
import { maxLocations } from '../progress';
import { seedParts } from './service';

export function canOpenHq(state: GameState): { ok: boolean; reason?: string } {
  if (state.group.hq) return { ok: false, reason: 'Your headquarters is already open.' };
  if (state.companyLevel < 5) return { ok: false, reason: 'A headquarters makes sense from company level 5.' };
  if (!hasTech(state, 'groupmgmt')) return { ok: false, reason: 'Research "Group management" first.' };
  if (state.locations.length < 2) return { ok: false, reason: 'You need at least two dealerships.' };
  if (state.cash < HQ_COST) return { ok: false, reason: `The headquarters costs €${HQ_COST.toLocaleString('en-GB')}.` };
  return { ok: true };
}

export function openHq(state: GameState): { ok: boolean; message: string } {
  const c = canOpenHq(state);
  if (!c.ok) return { ok: false, message: c.reason ?? '' };
  record(state, 'Expansion', -HQ_COST, 'Group headquarters');
  state.group.hq = true;
  state.group.hqDay = state.day;
  return { ok: true, message: 'Headquarters open. Set up central departments and appoint regional managers.' };
}

export function departmentCost(id: string, level: number): number | undefined {
  return DEPARTMENT_BY_ID[id]?.costs[level];
}

export function buyDepartment(state: GameState, id: string): { ok: boolean; message: string } {
  const def = DEPARTMENT_BY_ID[id];
  if (!def) return { ok: false, message: 'Unknown department.' };
  if (!state.group.hq) return { ok: false, message: 'Open a headquarters first.' };
  const level = state.group.departments[id] ?? 0;
  const cost = def.costs[level];
  if (cost === undefined) return { ok: false, message: `${def.name} is fully built.` };
  if (state.cash < cost) return { ok: false, message: `That costs €${cost.toLocaleString('en-GB')}.` };
  record(state, 'Expansion', -cost, `${def.name} level ${level + 1}`);
  state.group.departments[id] = level + 1;
  return { ok: true, message: `${def.name}: ${def.effect[level]}.` };
}

/** Monthly running cost of HQ and departments. */
export function groupMonthly(state: GameState): void {
  if (!state.group.hq) return;
  let cost = HQ_MONTHLY;
  for (const d of DEPARTMENTS) {
    const lvl = state.group.departments[d.id] ?? 0;
    if (lvl > 0) cost += d.monthly[lvl - 1];
  }
  record(state, 'Salaries', -cost, 'Headquarters & group departments');
}

/** A regional manager (a level 3+ manager) runs a dealership for you. */
export function appointRegional(state: GameState, locationId: string, employeeId: string): { ok: boolean; message: string } {
  if (!state.group.hq) return { ok: false, message: 'Open a headquarters first.' };
  const e = state.employees.find((x) => x.id === employeeId);
  const loc = locationById(state, locationId);
  if (!e || !loc) return { ok: false, message: 'Unknown manager or location.' };
  if (e.role !== 'manager' || e.level < 3) return { ok: false, message: 'A regional manager must be a level 3+ manager.' };
  if (e.locationId !== locationId) return { ok: false, message: `${e.name} must work at ${loc.name}.` };
  state.group.regional[locationId] = employeeId;
  e.salary = Math.round(e.salary * 1.15 / 10) * 10;
  e.morale = clamp(e.morale + 10, 0, 100);
  state.autoList[locationId] = true;
  return { ok: true, message: `${e.name} now runs ${loc.name}: automatic listing, repricing and parts, +5% leads, better morale.` };
}

export function regionalManager(state: GameState, locationId: string) {
  const id = state.group?.regional?.[locationId];
  const e = id ? state.employees.find((x) => x.id === id && x.locationId === locationId) : undefined;
  if (id && !e) delete state.group.regional[locationId];
  return e;
}

// ----------------------------------------------------------- acquisitions --

export function canAcquire(state: GameState): { ok: boolean; reason?: string } {
  if (state.companyLevel < 5) return { ok: false, reason: 'Acquisitions open up at company level 5.' };
  if (state.locations.length >= maxLocations(state) + 1) return { ok: false, reason: 'You run as many dealerships as your level allows (+1 by acquisition).' };
  return { ok: true };
}

/** What a rival dealership is worth: its stock, premises and goodwill, minus its debt. */
export function valuation(c: Competitor): { price: number; debt: number; cars: number; staff: number } {
  const city = CITY_BY_ID[c.cityId];
  const cars = Math.round(c.size * 0.6);
  const staff = Math.max(2, Math.round(c.staff ?? c.size / 5));
  const debt = Math.round(c.debt ?? c.size * 2500);
  const goodwill = c.reputation * 1500;
  const premises = (city?.openCost ?? 100000) * 0.8;
  const stock = cars * 14000 * 0.8;
  const price = Math.round((premises + stock + goodwill - debt * 0.5) / 1000) * 1000;
  return { price: Math.max(50000, price), debt, cars, staff };
}

export function acquire(state: GameState, competitorId: string): { ok: boolean; message: string } {
  const can = canAcquire(state);
  if (!can.ok) return { ok: false, message: can.reason ?? '' };
  const c = state.competitors.find((x) => x.id === competitorId);
  if (!c) return { ok: false, message: 'That dealer is gone.' };
  const val = valuation(c);
  if (state.cash < val.price) return { ok: false, message: `${c.name} costs €${val.price.toLocaleString('en-GB')}.` };
  const city = CITY_BY_ID[c.cityId];
  record(state, 'Acquisition', -val.price, `Acquired ${c.name}`);
  // You take over their debt as a loan.
  if (val.debt > 0) {
    state.loans.push({ id: nextId(state, 'l'), name: `${c.name} debt`, principal: val.debt, balance: val.debt, rate: 0.075, termMonths: 48, monthsLeft: 48, payment: Math.round(monthlyPayment(val.debt, 0.075, 48)), takenDay: state.day });
  }
  let loc = state.locations.find((l) => l.cityId === c.cityId);
  const merged = !!loc;
  if (!loc) {
    loc = {
      id: nextId(state, 'loc'), cityId: c.cityId, name: `${c.name} (${city?.name ?? ''})`.trim(), openedDay: state.day, upgrades: {},
      lot: emptyLot(Math.min(2, city?.space ?? 2)), reputation: c.reputation, stats: { revenue: 0, profit: 0, sold: 0, leads: 0 },
      month: { revenue: 0, profit: 0, sold: 0, leads: 0 }, rentMonthly: city?.rent ?? 2000, acquired: c.name,
    };
    buildTemplate(state, loc.lot, c.size > 25 ? 'volume' : 'small', state.companyLevel);
    for (const o of loc.lot.objects) o.id = `o${(state.idCounter += 1).toString(36)}`;
    loc.lot.version += 1;
    loc.rentMonthly = rentFor(loc);
    state.locations.push(loc);
    state.autoList[loc.id] = true;
    seedParts(loc);
  } else {
    loc.reputation = clamp((loc.reputation + c.reputation) / 2 + 3, 0, 100);
  }
  // Their stock and people join you.
  const cap = lotStats(loc.lot).capacity - state.vehicles.filter((v) => v.locationId === loc!.id).length;
  const cars = Math.max(0, Math.min(val.cars, cap));
  for (let i = 0; i < cars; i += 1) {
    const v = createOffer(state, gameRng.chance(0.5) ? 'wholesale' : 'lease', loc.id);
    v.auction = undefined;
    v.purchasePrice = v.offerPrice;
    v.status = 'yard';
    v.inspectionLevel = 1;
    v.boughtDay = state.day;
    v.arrivalDay = state.day;
    v.expiresDay = undefined;
    v.askingPrice = suggestedPrice(state, v);
    v.floorPrice = roundPrice(v.askingPrice * 0.92);
    state.vehicles.push(v);
  }
  for (let i = 0; i < val.staff; i += 1) {
    const role = (['sales', 'sales', 'mechanic', 'detailer', 'manager'] as const)[i % 5];
    const e = makeEmployee(state, role, loc.id, [30, 60]);
    state.employees.push(e);
  }
  assignSlots(state, loc);
  assignStations(state, loc);
  state.competitors = state.competitors.filter((x) => x.id !== c.id);
  state.group.acquisitions += 1;
  pushNotice(state, 'good', `🤝 You bought ${c.name}${merged ? ` and merged it into ${loc.name}` : ''}: ${cars} cars and ${val.staff} staff join you.`);
  return { ok: true, message: `${c.name} is yours.${val.debt ? ` Their €${val.debt.toLocaleString('en-GB')} debt became a loan.` : ''}` };
}

/** Rebrand an acquired dealership under your own name (reputation moves toward yours). */
export function rebrand(state: GameState, locationId: string): { ok: boolean; message: string } {
  const loc = locationById(state, locationId);
  if (!loc) return { ok: false, message: 'Unknown location.' };
  const cost = 25000;
  if (state.cash < cost) return { ok: false, message: 'Rebranding costs €25,000.' };
  record(state, 'Expansion', -cost, `Rebrand ${loc.name}`);
  const city = CITY_BY_ID[loc.cityId];
  loc.name = `${state.companyName.split(' ')[0]} ${city?.name ?? ''}`.trim();
  loc.reputation = clamp((loc.reputation + state.reputation * 2) / 3, 0, 100);
  loc.acquired = undefined;
  return { ok: true, message: `Rebranded as ${loc.name}.` };
}

/** Sells a location's stock to the trade and lets its staff go, so it can be closed. */
export function liquidate(state: GameState, locationId: string): { ok: boolean; message: string; cars: number } {
  const loc = locationById(state, locationId);
  if (!loc) return { ok: false, message: 'Unknown location.', cars: 0 };
  let cars = 0;
  let money = 0;
  for (const v of state.vehicles.filter((x) => x.locationId === locationId && x.status !== 'transit' && x.status !== 'transfer')) {
    if (state.customers.some((c) => c.vehicleId === v.id && c.status === 'negotiating')) continue;
    const price = roundPrice(suggestedPrice(state, v) * 0.78);
    money += price;
    record(state, 'Vehicle sale', price, `Liquidation: ${v.year} ${v.brand} ${v.model}`, locationId);
    v.status = 'sold';
    state.vehicles = state.vehicles.filter((x) => x.id !== v.id);
    cars += 1;
  }
  for (const e of staffAt(state, locationId)) {
    record(state, 'Salaries', -Math.round(e.salary * 0.5), `Severance: ${e.name}`, locationId);
  }
  state.employees = state.employees.filter((e) => e.locationId !== locationId);
  return { ok: true, message: `Sold ${cars} cars to the trade for €${money.toLocaleString('en-GB')} and let the team go. You can close ${loc.name} now.`, cars };
}

export function acquisitionTargets(state: GameState): { c: Competitor; val: ReturnType<typeof valuation> }[] {
  return state.competitors.map((c) => ({ c, val: valuation(c) })).sort((a, b) => a.val.price - b.val.price);
}

export type { Location };

// ------------------------------------------------------------- identity --

/** What changing the brand costs: new signs at every location (free in the first week). */
export function identityCost(state: GameState): number {
  return state.day <= 7 ? 0 : REBRAND_COST_PER_LOCATION * state.locations.length;
}

/** Changes colours, logo and brand promise. The promise changes which buyers you attract. */
export function setIdentity(state: GameState, next: { color?: string; logo?: string; position?: string }): { ok: boolean; message: string } {
  const pos = next.position ? BRAND_POSITIONS.find((p) => p.id === next.position) : undefined;
  if (next.position && !pos) return { ok: false, message: 'Unknown brand promise.' };
  const b = state.branding;
  const changed = (next.color && next.color !== b.color) || (next.logo && next.logo !== b.logo) || (pos && pos.id !== b.position);
  if (!changed) return { ok: false, message: 'Nothing changed.' };
  const cost = identityCost(state);
  if (state.cash < cost) return { ok: false, message: `New signs for ${state.locations.length} location${state.locations.length === 1 ? '' : 's'} cost €${cost.toLocaleString('en-GB')}.` };
  if (cost > 0) record(state, 'Marketing', -cost, 'Rebrand: new signs and adverts');
  if (next.color) b.color = next.color;
  if (next.logo) b.logo = next.logo;
  if (pos) { b.position = pos.id; b.tagline = pos.tagline; }
  return { ok: true, message: `New look${pos ? ` — “${pos.tagline}”` : ''}.${cost ? ` Signs replaced for €${cost.toLocaleString('en-GB')}.` : ''}` };
}
