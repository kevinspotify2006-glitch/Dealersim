/**
 * Fleet business: taxi firms, rental companies, builders, couriers, councils
 * and corporates order cars in batches. Big volume, thin margins, deadlines —
 * and a service contract plus repeat orders if you deliver well.
 */
import { creditBuyer } from './procurement';
import type { FleetRequest, GameState, Location, Vehicle } from '../types';
import { FLEET_BY_ID, FLEET_SECTORS } from '../../data/group';
import { LOCATION_TYPES, CITY_BY_ID } from '../../data/game';
import { gameRng } from '../rng';
import { clamp } from '../util';
import { SOLD_ARCHIVE_LIMIT, hasTech, locationById, nextId, pushNotice, vehicleName } from '../state';
import { bookSaleProfit, record } from '../finance';
import { totalCost } from '../market';

export function fleetUnlocked(state: GameState): boolean {
  return hasTech(state, 'fleetsales') || state.companyLevel >= 3;
}

export function createFleetRequest(state: GameState, loc: Location, sectorId: string, opts: { client?: string; qty?: number; discount?: number; repeat?: number; serviceCost?: number } = {}): FleetRequest | undefined {
  const sector = FLEET_BY_ID[sectorId as keyof typeof FLEET_BY_ID] ?? gameRng.pick(FLEET_SECTORS);
  const qty = opts.qty ?? gameRng.int(sector.qty[0], sector.qty[1]);
  const r: FleetRequest = {
    id: nextId(state, 'fl'),
    client: opts.client || gameRng.pick(sector.clients),
    sector: sector.id,
    qty,
    delivered: 0,
    categories: sector.categories,
    bodies: sector.bodies,
    maxUnit: Math.round(gameRng.range(sector.maxUnit[0], sector.maxUnit[1]) / 500) * 500,
    discount: opts.discount ?? Math.round(gameRng.range(sector.discount[0], sector.discount[1]) * 100) / 100,
    deadline: state.day + gameRng.int(sector.days[0], sector.days[1]),
    status: 'open',
    repeatMonths: opts.repeat ?? gameRng.int(0, 3),
    serviceContract: opts.serviceCost ?? 0,
    freeService: (opts.serviceCost ?? 0) > 0 || undefined,
    locationId: loc.id,
    revenue: 0,
  };
  state.fleet.unshift(r);
  if (state.fleet.length > 40) state.fleet = state.fleet.filter((x) => x.status === 'open' || x.status === 'accepted').concat(state.fleet.filter((x) => x.status !== 'open' && x.status !== 'accepted').slice(0, 20));
  return r;
}

/** Weekly: new enquiries (more at airports, industrial areas and with a good name). */
export function fleetWeekly(state: GameState): void {
  if (!fleetUnlocked(state)) return;
  for (const loc of state.locations) {
    const type = CITY_BY_ID[loc.cityId]?.type ?? 'town';
    const typeBoost = type === 'airport' || type === 'industrial' ? 1.8 : type === 'highway' ? 1.3 : type === 'city' ? 1.2 : 0.8;
    const chance = clamp(0.2 * typeBoost * (0.6 + loc.reputation / 100) * (1 + state.contracts.length * 0.15) * (hasTech(state, 'fleetsales') ? 1.4 : 1), 0.05, 0.7);
    if (!gameRng.chance(chance)) continue;
    const weights = FLEET_SECTORS.map((s) => (type === 'airport' && (s.id === 'rental' || s.id === 'taxi') ? 3 : type === 'industrial' && (s.id === 'construction' || s.id === 'delivery') ? 3 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = gameRng.next() * total;
    let sector = FLEET_SECTORS[0];
    for (let i = 0; i < FLEET_SECTORS.length; i += 1) { roll -= weights[i]; if (roll <= 0) { sector = FLEET_SECTORS[i]; break; } }
    const r = createFleetRequest(state, loc, sector.id);
    if (r) pushNotice(state, 'info', `🚐 Fleet enquiry: ${r.client} wants ${r.qty} ${sector.name.toLowerCase()} cars (${r.categories.slice(0, 2).join('/').toLowerCase()}) up to €${r.maxUnit.toLocaleString('en-GB')} each, ${Math.round(r.discount * 100)}% fleet discount.`);
  }
  void LOCATION_TYPES;
}

export function acceptFleet(state: GameState, id: string): { ok: boolean; message: string } {
  const r = state.fleet.find((x) => x.id === id);
  if (!r || r.status !== 'open') return { ok: false, message: 'That enquiry is no longer open.' };
  r.status = 'accepted';
  return { ok: true, message: `Order accepted: deliver ${r.qty} cars to ${r.client} within ${r.deadline - state.day} days.` };
}

export function declineFleet(state: GameState, id: string): { ok: boolean; message: string } {
  const r = state.fleet.find((x) => x.id === id);
  if (!r || r.status !== 'open') return { ok: false, message: 'That enquiry is no longer open.' };
  r.status = 'declined';
  return { ok: true, message: `You passed on ${r.client}'s order.` };
}

/** Does this car fit the order? */
export function fitsFleet(r: FleetRequest, v: Vehicle): boolean {
  return (v.status === 'yard' || v.status === 'listed') && (r.categories.includes(v.category) || r.bodies.includes(v.body)) && fleetPrice(r, v) <= r.maxUnit * 1.02 && v.condition >= 55;
}

/** What the fleet client pays for a car: the asking price minus their fleet discount, capped at their budget. */
export function fleetPrice(r: FleetRequest, v: Vehicle): number {
  const asking = v.askingPrice > 0 ? v.askingPrice : Math.round(totalCost(v) * 1.1);
  return Math.round(Math.min(r.maxUnit, asking * (1 - r.discount)) / 10) * 10;
}

export function candidatesFor(state: GameState, r: FleetRequest): Vehicle[] {
  return state.vehicles.filter((v) => fitsFleet(r, v) && !state.customers.some((c) => c.vehicleId === v.id && c.status === 'negotiating')).sort((a, b) => fleetPrice(r, b) - totalCost(b) - (fleetPrice(r, a) - totalCost(a)));
}

/** Delivers one car against an accepted order. */
export function deliverFleetCar(state: GameState, requestId: string, vehicleId: string): { ok: boolean; message: string } {
  const r = state.fleet.find((x) => x.id === requestId);
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!r || r.status !== 'accepted') return { ok: false, message: 'Accept the order first.' };
  if (!v || !fitsFleet(r, v)) return { ok: false, message: 'That car does not meet the order spec.' };
  const price = fleetPrice(r, v);
  const profit = price - totalCost(v);
  record(state, 'Vehicle sale', price, `Fleet: ${vehicleName(v)} to ${r.client}`, v.locationId);
  bookSaleProfit(state, profit, v.locationId);
  creditBuyer(state, v, profit);
  v.status = 'sold';
  v.soldPrice = price;
  v.soldDay = state.day;
  v.soldTo = r.client;
  v.slotId = undefined;
  v.listedOnline = false;
  state.vehicles = state.vehicles.filter((x) => x.id !== v.id);
  state.customers = state.customers.filter((c) => c.vehicleId !== v.id || c.status === 'negotiating');
  state.soldArchive.unshift(v);
  if (state.soldArchive.length > SOLD_ARCHIVE_LIMIT) state.soldArchive.length = SOLD_ARCHIVE_LIMIT;
  r.delivered += 1;
  r.revenue += price;
  state.stats.sold += 1;
  state.stats.fleetDelivered = (state.stats.fleetDelivered ?? 0) + 1;
  state.stats.lifetimeRevenue += price;
  state.stats.lifetimeProfit += profit;
  state.today.sold += 1;
  state.month.sold += 1;
  const loc = locationById(state, v.locationId);
  if (loc) { loc.stats.sold += 1; loc.month.sold += 1; }
  const contract = state.contracts.find((c) => c.brandId === v.brandId);
  if (contract) { contract.soldMonth += 1; contract.soldTotal += 1; }
  if (r.delivered >= r.qty) completeFleet(state, r);
  return { ok: true, message: `${vehicleName(v)} delivered to ${r.client} for €${price.toLocaleString('en-GB')} (${profit >= 0 ? '+' : ''}€${profit.toLocaleString('en-GB')}). ${r.delivered}/${r.qty}.` };
}

function completeFleet(state: GameState, r: FleetRequest): void {
  r.status = 'done';
  // Every fleet customer brings their cars back to you for service for a year.
  const perCar = FLEET_BY_ID[r.sector]?.service ?? 40;
  if (!r.freeService) r.serviceContract = Math.max(r.serviceContract, Math.round(perCar * r.qty * 0.5));
  r.serviceLeft = 12;
  state.reputation = clamp(state.reputation + 1.5, 0, 100);
  pushNotice(state, 'good', `🚐 ${r.client}'s order is complete: ${r.qty} cars, €${r.revenue.toLocaleString('en-GB')}.${r.serviceContract ? ` Their fleet is serviced here from now on.` : ''}${r.repeatMonths > 0 ? ' They want to order again next month.' : ''}`);
}

/** Daily: deadlines. */
export function fleetDaily(state: GameState): void {
  for (const r of state.fleet) {
    if (r.status === 'open' && state.day > r.deadline - 3) {
      r.status = 'expired';
      continue;
    }
    if (r.status === 'accepted' && state.day > r.deadline) {
      r.status = 'failed';
      state.reputation = clamp(state.reputation - 3, 0, 100);
      pushNotice(state, 'bad', `🚐 ${r.client}'s order is overdue: ${r.delivered}/${r.qty} delivered. They cancelled — reputation −3.`);
    }
  }
}

/** Monthly: service contracts pay, loyal clients order again. */
export function fleetMonthly(state: GameState): void {
  for (const r of [...state.fleet]) {
    if (r.status !== 'done') continue;
    if (r.serviceContract > 0 && (r.serviceLeft ?? 0) > 0) {
      r.serviceLeft = (r.serviceLeft ?? 0) - 1;
      if (r.freeService) {
        record(state, 'Maintenance', -r.serviceContract, `Free fleet maintenance: ${r.client}`, r.locationId);
      } else {
        const revenue = Math.round(r.serviceContract * 1.4);
        record(state, 'Service', revenue, `Fleet service contract: ${r.client}`, r.locationId);
        bookSaleProfit(state, revenue - r.serviceContract, r.locationId);
      }
    }
    if (r.repeatMonths > 0) {
      const loc = locationById(state, r.locationId) ?? state.locations[0];
      const again = createFleetRequest(state, loc, r.sector, { client: r.client, qty: Math.max(2, Math.round(r.qty * gameRng.range(0.5, 1))), discount: r.discount, repeat: r.repeatMonths - 1, serviceCost: 0 });
      if (again) {
        again.status = 'accepted';
        pushNotice(state, 'good', `🔁 ${r.client} places a repeat order: ${again.qty} cars.`);
      }
      r.repeatMonths = 0;
    }
  }
}
