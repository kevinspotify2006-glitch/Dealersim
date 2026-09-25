/**
 * Retail finance and F&I products.
 *
 * A customer's credit score, monthly limit and the economy's interest rate
 * decide whether they are approved and what they pay per month. The dealer
 * earns commission on the amount financed (more with a better lender panel,
 * a finance manager at a finance desk and the Advanced finance research) and
 * margin on each product. Products also change satisfaction, warranty claims
 * and whether the car comes back for service.
 */
import type { Customer, FinanceKind, FinancePlan, GameState, Location, Vehicle } from '../types';
import { FINANCE_BY_ID, FINANCE_KINDS, LENDER_TIERS, PRODUCTS, PRODUCT_BY_ID } from '../../data/products';
import type { ProductDef } from '../../data/products';
import { ARCHETYPE_BY_ID } from '../../data/game';
import { clamp } from '../util';
import { hasTech, locationById, staffAt, upgradeLevel } from '../state';
import { lendingRate } from './economy';
import { lotStats } from '../lot';

/** Lender panel tier at a location (0 = no finance). */
export function lenderTier(loc: Location | undefined): number {
  return loc ? Math.min(3, upgradeLevel(loc, 'finance')) : 0;
}

export function financeKinds(state: GameState, loc: Location | undefined): FinanceKind[] {
  if (lenderTier(loc) === 0) return ['cash'];
  return FINANCE_KINDS.filter((k) => !k.requires || hasTech(state, k.requires.split(':')[1])).map((k) => k.id);
}

/** The best finance manager at the location (with a workstation). */
export function financeManager(state: GameState, locationId: string) {
  return staffAt(state, locationId).filter((e) => e.role === 'finance' && e.trainingDaysLeft <= 0).sort((a, b) => financeSkill(b) - financeSkill(a))[0];
}

function financeSkill(e: { skill: number; skills?: Partial<Record<string, number>>; stationId?: string }): number {
  return Math.max(e.skill, e.skills?.finance ?? 0) * (e.stationId ? 1 : 0.6);
}

/** Annual rate for this customer: market rate + risk premium for their credit + the lender's markup. */
export function aprFor(state: GameState, c: Customer, kind: FinanceKind, loc: Location | undefined): number {
  if (kind === 'cash') return 0;
  const credit = c.credit ?? 650;
  const risk = clamp((720 - credit) / 1000, -0.01, 0.12);
  const markup = LENDER_TIERS[lenderTier(loc)].markup;
  const leaseAdj = kind === 'lease' ? -0.005 : kind === 'balloon' ? 0.004 : 0;
  return clamp(lendingRate(state) + risk + markup + leaseAdj, 0.019, 0.24);
}

/** Monthly payment for an amount, rate, term and final (balloon/residual) payment. */
export function payment(amount: number, apr: number, months: number, residual = 0): number {
  if (months <= 0) return 0;
  const r = apr / 12;
  if (r === 0) return (amount - residual) / months;
  const pvResidual = residual / Math.pow(1 + r, months);
  return ((amount - pvResidual) * r) / (1 - Math.pow(1 + r, -months));
}

export function makePlan(state: GameState, c: Customer, v: Vehicle, price: number, kind: FinanceKind, term: number, deposit: number): FinancePlan {
  const loc = locationById(state, v.locationId);
  if (kind === 'cash') return { kind, term: 0, deposit: 1, apr: 0, monthly: 0 };
  const def = FINANCE_BY_ID[kind];
  const apr = aprFor(state, c, kind, loc);
  const financed = price * (1 - deposit);
  const monthly = Math.round(payment(financed, apr, term, price * def.residual));
  return { kind, term, deposit, apr, monthly };
}

/** How likely the lender says yes (0..1). */
export function approvalChance(state: GameState, c: Customer, plan: FinancePlan, locationId: string): number {
  if (plan.kind === 'cash') return 1;
  const loc = locationById(state, locationId);
  const credit = c.credit ?? 650;
  let p = clamp((credit - 430) / 380, 0.03, 0.96);
  const limit = c.monthlyLimit ?? 400;
  const ratio = plan.monthly / Math.max(50, limit);
  if (ratio > 1) p *= clamp(1 - (ratio - 1) * 2.5, 0, 1);
  p += Math.min(0.12, plan.deposit * 0.4);
  const fm = financeManager(state, locationId);
  if (fm) p += financeSkill(fm) / 100 * 0.12;
  p += LENDER_TIERS[lenderTier(loc)].approval;
  if (hasTech(state, 'creditscoring')) p += 0.1;
  p -= Math.max(0, state.economy.rate - 4) * 0.02;
  // A finance desk next to the sales desks gets the paperwork right.
  if (loc) p += Math.min(4, lotStats(loc.lot).effects.finance ?? 0) * 0.015;
  return clamp(p, 0.02, 0.98);
}

/** Dealer commission on a financed deal. */
export function commission(state: GameState, plan: FinancePlan, price: number, locationId: string): number {
  if (plan.kind === 'cash') return 0;
  const loc = locationById(state, locationId);
  const def = FINANCE_BY_ID[plan.kind];
  const tier = LENDER_TIERS[lenderTier(loc)];
  const fm = financeManager(state, locationId);
  let rate = def.commission * tier.commission + (hasTech(state, 'advancedfinance') ? 0.005 : 0);
  rate *= 1 + (fm ? financeSkill(fm) / 400 : 0);
  if ((state.group?.departments.finance ?? 0) >= 2) rate *= 1.15;
  // Longer terms pay the dealer a little more.
  rate *= 1 + Math.max(0, plan.term - 36) / 240;
  return Math.round(price * (1 - plan.deposit) * rate);
}

/**
 * The most a customer can spend when paying monthly: their monthly limit over a
 * 48-month loan with a 10% deposit (a lease or balloon stretches it further).
 */
export function financeReach(state: GameState, c: Customer, loc: Location | undefined): number {
  if (!c.wantsFinance || lenderTier(loc) === 0) return c.budget;
  const kinds = financeKinds(state, loc);
  const apr = lendingRate(state) + clamp((720 - (c.credit ?? 650)) / 1000, -0.01, 0.12) + LENDER_TIERS[lenderTier(loc)].markup;
  const r = apr / 12;
  const n = 48;
  const annuity = (1 - Math.pow(1 + r, -n)) / r;
  let reach = ((c.monthlyLimit ?? 300) * annuity) / 0.9;
  if (kinds.includes('balloon')) reach *= 1.3;
  // Nobody stretches beyond what they would feel comfortable with.
  return Math.round(clamp(reach, c.budget * 0.8, c.budget * 1.45));
}

// ---------------------------------------------------------------- products --

export function productPrice(p: ProductDef, carPrice: number): number {
  return Math.round((carPrice * p.rate + p.fixed) / 10) * 10;
}

export function productsFor(state: GameState, v: Vehicle, financed: boolean): ProductDef[] {
  const loc = locationById(state, v.locationId);
  return PRODUCTS.filter((p) => {
    if (p.financeOnly && !financed) return false;
    if (p.newCarOnly && !v.isNew) return false;
    if (p.requires === 'finance' && lenderTier(loc) === 0) return false;
    if (p.requires?.startsWith('research:') && !hasTech(state, p.requires.split(':')[1])) return false;
    if (p.requires === 'detailing' && !(loc && (upgradeLevel(loc, 'detailing') >= 1 || staffAt(state, loc.id).some((e) => e.role === 'detailer')))) return false;
    // New cars come with a factory warranty: only the extended one makes sense.
    if (v.isNew && p.id === 'warranty') return false;
    return true;
  });
}

/** Chance a customer takes a product when it is offered. */
export function takeChance(state: GameState, c: Customer, p: ProductDef, locationId: string): number {
  const a = ARCHETYPE_BY_ID[c.archetype];
  let chance = p.take * (p.affinity[c.archetype] ?? 1) * (0.6 + (a?.extrasAffinity ?? 0.5) * 0.8);
  const fm = financeManager(state, locationId);
  if (fm) chance *= 1 + financeSkill(fm) / 250;
  if (c.style === 'haggler') chance *= 0.8;
  if (c.style === 'decisive') chance *= 1.1;
  return clamp(chance, 0.02, 0.9);
}

export interface ProductsResult { income: number; cost: number; lines: string[]; satisfaction: number; warranty?: 'basic' | 'extended'; serviceDays?: number; count: number }

/** Money and effects of the products in a deal (free ones cost you without income). */
export function productsIncome(state: GameState, carPrice: number, extras: Record<string, boolean>, free?: string, isNew = false): ProductsResult {
  const out: ProductsResult = { income: 0, cost: 0, lines: [], satisfaction: 0, count: 0 };
  for (const [id, on] of Object.entries(extras)) {
    if (!on) continue;
    const p = PRODUCT_BY_ID[id];
    if (!p) continue;
    const price = productPrice(p, carPrice);
    const cost = Math.round(price * p.costShare);
    out.cost += cost;
    out.count += 1;
    out.satisfaction += p.satisfaction + (free === id ? 2 : 0);
    if (free === id) out.lines.push(`Free ${p.name.toLowerCase()}`);
    else {
      out.income += price;
      out.lines.push(`${p.name} €${price.toLocaleString('en-GB')}`);
    }
    if (p.warranty) out.warranty = p.warranty === 'extended' || out.warranty === 'extended' ? 'extended' : 'basic';
    if (p.serviceVisits) out.serviceDays = Math.min(out.serviceDays ?? 999, p.serviceVisits);
  }
  if (isNew && !out.warranty) out.warranty = 'basic'; // factory warranty
  return out;
}

/** What the finance desk can do right now, for the UI. */
export function financeSummary(state: GameState, loc: Location): { tier: string; kinds: FinanceKind[]; manager?: string; rate: number } {
  const fm = financeManager(state, loc.id);
  return { tier: LENDER_TIERS[lenderTier(loc)].name, kinds: financeKinds(state, loc), manager: fm?.name, rate: lendingRate(state) };
}

export function creditBand(credit: number): { label: string; tone: 'good' | 'info' | 'warn' | 'bad' } {
  if (credit >= 760) return { label: 'Excellent credit', tone: 'good' };
  if (credit >= 680) return { label: 'Good credit', tone: 'good' };
  if (credit >= 600) return { label: 'Fair credit', tone: 'info' };
  if (credit >= 520) return { label: 'Weak credit', tone: 'warn' };
  return { label: 'Poor credit', tone: 'bad' };
}
