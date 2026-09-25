/**
 * Stock management: ageing, automatic repricing and the certified
 * pre-owned programme.
 *
 * A car that sits for weeks ties up money (insurance, floor-plan interest),
 * loses buyer interest and is expected to get cheaper. An inventory manager,
 * a regional manager or AI pricing trims the price of ageing stock every
 * week; without them it is up to you.
 */
import type { GameState, Vehicle } from '../types';
import { agingBucket, roundPrice, suggestedPrice, totalCost, trueValue } from '../market';
import { hasTech, locationById, pushNotice, staffAt, vehicleName } from '../state';
import { record } from '../finance';
import { regionalManager } from './group';
import { lendingRate } from './economy';

export const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+'] as const;

export function agingReport(state: GameState, locationId?: string): Record<(typeof AGING_BUCKETS)[number], { count: number; cost: number }> {
  const out = { '0-30': { count: 0, cost: 0 }, '31-60': { count: 0, cost: 0 }, '61-90': { count: 0, cost: 0 }, '90+': { count: 0, cost: 0 } };
  for (const v of state.vehicles) {
    if (v.status === 'transit' || v.status === 'transfer' || v.status === 'sold') continue;
    if (locationId && v.locationId !== locationId) continue;
    const b = agingBucket(v);
    out[b].count += 1;
    out[b].cost += totalCost(v);
  }
  return out;
}

/** Who reprices ageing stock at a location (if anyone). */
export function autoPricer(state: GameState, locationId: string): string | undefined {
  const inv = staffAt(state, locationId).find((e) => e.role === 'inventory' && e.trainingDaysLeft <= 0);
  if (inv) return inv.name;
  const rm = regionalManager(state, locationId);
  if (rm) return rm.name;
  if (hasTech(state, 'aipricing')) return 'AI pricing';
  return undefined;
}

/** Weekly: automatic repricing of ageing cars, and stock-holding (floor-plan) interest. */
export function inventoryWeekly(state: GameState): void {
  const cut: string[] = [];
  for (const v of state.vehicles) {
    if (v.status !== 'listed' || v.daysInStock < 40) continue;
    if (!autoPricer(state, v.locationId)) continue;
    const target = suggestedPrice(state, v);
    if (v.askingPrice > target * 1.01) {
      v.askingPrice = target;
      v.floorPrice = Math.min(v.floorPrice, roundPrice(target * 0.92));
      v.priceCuts = (v.priceCuts ?? 0) + 1;
      cut.push(vehicleName(v));
    }
  }
  if (cut.length) pushNotice(state, 'info', `📦 Repriced ${cut.length} ageing car${cut.length > 1 ? 's' : ''}: ${cut.slice(0, 3).join(', ')}${cut.length > 3 ? '…' : ''}.`);
  // Money tied up in stock costs interest (the bank's floor-plan line).
  const stock = state.vehicles.filter((v) => v.status !== 'sold' && v.status !== 'transit').reduce((s, v) => s + totalCost(v), 0);
  const interest = Math.round(stock * (lendingRate(state) * 0.5) / 52);
  if (interest > 0) record(state, 'Loan interest', -interest, 'Stock financing (floor plan)');
}

// ---------------------------------------------------------- certification --

export function certifyCost(state: GameState, v: Vehicle): number {
  return Math.round((250 + trueValue(state, v) * 0.012) / 10) * 10;
}

export function certifyCheck(state: GameState, v: Vehicle): { ok: boolean; missing: string[]; cost: number } {
  const missing: string[] = [];
  if (!hasTech(state, 'certified')) missing.push('Research the certified programme');
  if (v.isNew) missing.push('New cars have a factory warranty already');
  if (v.certified) missing.push('Already certified');
  if (v.inspectionLevel < 2) missing.push('Advanced inspection');
  if (v.issues.some((i) => i.discovered && !i.fixed && i.system !== 'History')) missing.push('Fix every known fault');
  if (!v.history.includes('Fresh service') && v.serviceHistory !== 'Full') missing.push('A full service');
  if (v.presentation < 70) missing.push('Presentation 70+ (detail it)');
  if (v.status !== 'yard' && v.status !== 'listed') missing.push('The car must be on the lot');
  return { ok: missing.length === 0, missing, cost: certifyCost(state, v) };
}

/** Certify a car: checks, 12-month warranty and a badge. Sells for more, to more people. */
export function certify(state: GameState, vehicleId: string): { ok: boolean; message: string } {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v) return { ok: false, message: 'Unknown vehicle.' };
  const check = certifyCheck(state, v);
  if (!check.ok) return { ok: false, message: `Not yet: ${check.missing.join(', ').toLowerCase()}.` };
  if (state.cash < check.cost) return { ok: false, message: `Certification costs €${check.cost}.` };
  record(state, 'Inspection', -check.cost, `Certified pre-owned: ${vehicleName(v)}`, v.locationId);
  v.costs.other += check.cost;
  v.certified = true;
  const loc = locationById(state, v.locationId);
  if (loc) loc.certified = true;
  const before = v.askingPrice;
  v.askingPrice = Math.max(v.askingPrice, suggestedPrice(state, v));
  return { ok: true, message: `${vehicleName(v)} is certified.${v.askingPrice > before ? ` Price raised to €${v.askingPrice.toLocaleString('en-GB')}.` : ''}` };
}
