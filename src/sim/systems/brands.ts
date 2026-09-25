/**
 * Manufacturers and dealer contracts.
 *
 * Becoming an official dealer of a brand gives you its new cars at dealer
 * price (a small, safe margin), a volume bonus on every new car, marketing
 * support (more leads) and — at higher tiers — better terms. In return the
 * brand wants a real showroom, service capacity, trained staff, a good
 * reputation and a monthly sales target. Miss targets or requirements and
 * you get warnings; two warnings and the contract is gone.
 */
import type { ContractState, GameState, Location } from '../types';
import { BRAND_BY_ID, MANUFACTURERS } from '../../data/vehicles';
import { MAX_CONTRACTS_BY_LEVEL, TRAINING_BY_ID } from '../../data/game';
import { clamp } from '../util';
import { hasTech, locationById, pushNotice, staffAt } from '../state';
import { lotStats } from '../lot';
import { record } from '../finance';

export const TIER_NAMES = ['', 'Authorised dealer', 'Silver partner', 'Gold partner'];

export function maxContracts(state: GameState): number {
  return (MAX_CONTRACTS_BY_LEVEL[state.companyLevel - 1] ?? 0) + (hasTech(state, 'multibrand') ? 1 : 0);
}

export function contractFor(state: GameState, brandId: string): ContractState | undefined {
  return state.contracts.find((c) => c.brandId === brandId);
}

/** Monthly sales target at a tier. */
export function salesTarget(brandId: string, tier: number): number {
  const base = BRAND_BY_ID[brandId]?.dealer?.minSales ?? 3;
  return Math.max(1, Math.round(base * [1, 1, 1.6, 2.4][tier]));
}

export interface Requirement { label: string; ok: boolean; have: string; need: string }

/** What a brand asks of a location for a given tier. */
export function requirements(state: GameState, brandId: string, loc: Location, tier = 1): Requirement[] {
  const b = BRAND_BY_ID[brandId];
  const d = b?.dealer;
  if (!d) return [];
  const ls = lotStats(loc.lot);
  const showroom = ls.tiles.s ?? 0;
  const lifts = ls.slots.lift.length;
  const scale = [1, 1, 1.3, 1.6][tier];
  const out: Requirement[] = [
    { label: 'Company level', ok: state.companyLevel >= d.minLevel + (tier - 1), have: String(state.companyLevel), need: String(d.minLevel + (tier - 1)) },
    { label: 'Showroom floor', ok: showroom >= d.minShowroom * scale, have: `${showroom} m²`, need: `${Math.round(d.minShowroom * scale)} m²` },
    { label: 'Workshop lifts', ok: lifts >= Math.ceil(d.minLifts * scale), have: String(lifts), need: String(Math.ceil(d.minLifts * scale)) },
    { label: 'Reputation', ok: loc.reputation >= d.minRep + (tier - 1) * 5 || state.reputation >= d.minRep + (tier - 1) * 5, have: String(Math.round(Math.max(loc.reputation, state.reputation))), need: String(d.minRep + (tier - 1) * 5) },
  ];
  if (d.training) {
    const track = TRAINING_BY_ID[d.training];
    const trained = staffAt(state, loc.id).filter((e) => (e.tracks?.[d.training!] ?? 0) > 0 || (e.skills?.[track.skill] ?? 0) >= 50).length;
    out.push({ label: `Staff with ${track.name.toLowerCase()}`, ok: trained >= tier, have: String(trained), need: String(tier) });
  }
  return out;
}

export function canSign(state: GameState, brandId: string, locationId: string): { ok: boolean; reason?: string } {
  const loc = locationById(state, locationId);
  const b = BRAND_BY_ID[brandId];
  if (!loc || !b?.dealer) return { ok: false, reason: 'Unknown brand.' };
  if (contractFor(state, brandId)) return { ok: false, reason: 'You already represent this brand.' };
  if (state.contracts.length >= maxContracts(state)) return { ok: false, reason: `Your company level allows ${maxContracts(state)} brand contract${maxContracts(state) === 1 ? '' : 's'}.` };
  const missing = requirements(state, brandId, loc, 1).filter((r) => !r.ok);
  if (missing.length) return { ok: false, reason: `Not yet: ${missing.map((m) => `${m.label.toLowerCase()} ${m.have}/${m.need}`).join(', ')}.` };
  if (state.cash < b.dealer.fee) return { ok: false, reason: `The franchise fee is €${b.dealer.fee.toLocaleString('en-GB')}.` };
  return { ok: true };
}

export function signContract(state: GameState, brandId: string, locationId: string): { ok: boolean; message: string } {
  const check = canSign(state, brandId, locationId);
  if (!check.ok) return { ok: false, message: check.reason ?? 'Not possible.' };
  const b = BRAND_BY_ID[brandId];
  record(state, 'Expansion', -b.dealer!.fee, `Franchise fee: ${b.name}`, locationId);
  state.contracts.push({ brandId, tier: 1, since: state.day, relation: Math.max(40, state.brandRelations[brandId] ?? 45), soldMonth: 0, soldTotal: 0, warnings: 0, locationId });
  return { ok: true, message: `You are now an official ${b.name} dealer. New ${b.name} cars appear in the market under "Manufacturer".` };
}

export function endContract(state: GameState, brandId: string, reason?: string): void {
  const c = contractFor(state, brandId);
  if (!c) return;
  state.contracts = state.contracts.filter((x) => x !== c);
  state.brandRelations[brandId] = clamp((c.relation ?? 50) - 20, 0, 100);
  state.offers = state.offers.filter((o) => !(o.source === 'manufacturer' && o.brandId === brandId));
  pushNotice(state, 'bad', `${BRAND_BY_ID[brandId]?.name} contract ended${reason ? `: ${reason}` : '.'}`);
}

/** Monthly review by each brand. */
export function contractsMonthly(state: GameState): void {
  for (const c of [...state.contracts]) {
    const b = BRAND_BY_ID[c.brandId];
    const loc = locationById(state, c.locationId) ?? state.locations[0];
    c.locationId = loc.id;
    const target = salesTarget(c.brandId, c.tier);
    const met = c.soldMonth >= target;
    const reqs = requirements(state, c.brandId, loc, c.tier).filter((r) => !r.ok);
    const growth = hasTech(state, 'multibrand') ? 1.3 : 1;
    c.relation = clamp(c.relation + (met ? 8 * growth : -10) + (reqs.length ? -6 : 2), 0, 100);
    if (!met || reqs.length) {
      c.warnings += 1;
      if (c.warnings >= 3 || c.relation < 10) {
        endContract(state, c.brandId, met ? 'standards not met' : 'sales targets missed three months running');
        continue;
      }
      pushNotice(state, 'bad', `${b.name} review: ${met ? '' : `sold ${c.soldMonth}/${target} this month. `}${reqs.length ? `Missing: ${reqs.map((r) => r.label.toLowerCase()).join(', ')}. ` : ''}Warning ${c.warnings}/3.`);
    } else {
      c.warnings = Math.max(0, c.warnings - 1);
      if (c.tier < 3 && c.relation >= 75 && requirements(state, c.brandId, loc, c.tier + 1).every((r) => r.ok)) {
        c.tier = (c.tier + 1) as 2 | 3;
        pushNotice(state, 'good', `🥇 ${b.name} promotes you to ${TIER_NAMES[c.tier]}: better dealer prices, bigger bonuses, more support.`);
      } else {
        pushNotice(state, 'good', `${b.name} review: target met (${c.soldMonth}/${target}). Relationship ${Math.round(c.relation)}.`);
      }
    }
    c.soldMonth = 0;
  }
}

/** Selling used cars of a brand builds a little goodwill with it (helps a future contract). */
export function brandGoodwill(state: GameState, brandId: string): void {
  state.brandRelations[brandId] = clamp((state.brandRelations[brandId] ?? 45) + 0.5, 0, 70);
}

export function brandsForContract(): typeof MANUFACTURERS {
  return MANUFACTURERS.filter((m) => !!m.dealer);
}
