/**
 * Money. Every euro that moves goes through record(), so the ledger, the daily
 * figures and the reports always agree (the same rule Business Manager used).
 */
import type { GameState, Loan, Transaction, TxCategory } from './types';
import { TX_LIMIT, capacityOf, locationById, nextId, pushNotice, upgradeLevel } from './state';
import { bookValue, marketMods } from './market';
import { UPGRADE_BY_ID, CITY_BY_ID } from '../data/game';
import { OBJ_BY_ID } from '../data/lot';
import { PARTS } from '../data/service';
import { lotStats } from './lot';
import { clamp, sum } from './util';

export const INCOME_CATEGORIES: TxCategory[] = ['Vehicle sale', 'Extras', 'Finance income', 'Service', 'Parts', 'Dealer bonus'];
/** Money out that buys an asset (stock, parts, premises) rather than being a cost. */
export const CAPITAL_CATEGORIES: TxCategory[] = ['Vehicle purchase', 'Loan', 'Expansion', 'Upgrades', 'Construction', 'Transport', 'Repairs', 'Detailing', 'Inspection', 'Parts purchase', 'Acquisition'];

export function record(state: GameState, category: TxCategory, amount: number, description: string, locationId?: string): Transaction {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  state.cash += safe;
  state.txCounter += 1;
  const tx: Transaction = { id: state.txCounter, day: state.day, category, amount: safe, description, locationId };
  state.transactions.unshift(tx);
  if (state.transactions.length > TX_LIMIT) state.transactions.length = TX_LIMIT;
  // Revenue here means operating income; purchases of stock are an asset swap
  // for profit purposes (cost of sale is booked when the vehicle is sold).
  if (safe > 0 && INCOME_CATEGORIES.includes(category)) {
    state.today.revenue += safe;
    state.month.revenue += safe;
  } else if (safe < 0 && !CAPITAL_CATEGORIES.includes(category)) {
    state.today.expenses += -safe;
    state.month.expenses += -safe;
  }
  if (locationId) {
    const loc = locationById(state, locationId);
    if (loc && safe > 0 && INCOME_CATEGORIES.includes(category)) {
      loc.stats.revenue += safe;
      loc.month.revenue += safe;
    }
  }
  return tx;
}

/** Books the gross profit of a sale (price minus everything invested in the car). */
export function bookSaleProfit(state: GameState, profit: number, locationId: string): void {
  state.today.profit += profit;
  state.month.profit += profit;
  const loc = locationById(state, locationId);
  if (loc) {
    loc.stats.profit += profit;
    loc.month.profit += profit;
  }
}

export function inventoryValue(state: GameState): number {
  const mods = marketMods(state);
  return sum(state.vehicles.filter((v) => v.status !== 'sold'), (v) => bookValue(state, v, mods));
}

export function partsStockValue(state: GameState): number {
  let v = 0;
  for (const loc of state.locations) for (const p of PARTS) v += (loc.parts?.[p.id] ?? 0) * p.cost;
  return v;
}

export function inventoryCost(state: GameState): number {
  return sum(state.vehicles.filter((v) => v.status !== 'sold'), (v) => v.purchasePrice + v.costs.repairs + v.costs.detailing + v.costs.transport);
}

export function debt(state: GameState): number {
  return sum(state.loans, (l) => l.balance);
}

export function propertyValue(state: GameState): number {
  let total = 0;
  for (const loc of state.locations) {
    const city = CITY_BY_ID[loc.cityId];
    total += (city?.openCost ?? 0) * 0.5;
    // What is built on the lot keeps about half its value.
    for (const o of loc.lot.objects) total += (OBJ_BY_ID[o.defId]?.cost ?? 0) * 0.5;
    total += lotStats(loc.lot).indoorTiles * 20;
    for (const [id, level] of Object.entries(loc.upgrades)) {
      const def = UPGRADE_BY_ID[id];
      if (!def) continue;
      for (let i = 0; i < level && i < def.costs.length; i += 1) total += def.costs[i] * 0.55;
    }
  }
  return total;
}

/** Company value: cash + stock at book value (with a dealer haircut) + property − debt, plus goodwill. */
export function companyValue(state: GameState): number {
  const goodwill = Math.max(0, state.reputation - 40) * 400 * state.locations.length;
  // A client list and brand contracts are worth something to a buyer of the business.
  const clients = (state.clients ?? []).filter((c) => !c.lost).length * 150;
  const franchises = (state.contracts ?? []).reduce((s, c) => s + c.tier * 40000, 0);
  const hq = state.group?.hq ? 150000 : 0;
  return Math.round(state.cash + inventoryValue(state) * 0.92 + partsStockValue(state) * 0.8 + propertyValue(state) - debt(state) + goodwill + clients + franchises + hq);
}

// ------------------------------------------------------------------ loans --

export interface LoanProduct { id: string; name: string; amount: number; rate: number; months: number; minLevel: number; }

export const LOAN_PRODUCTS: LoanProduct[] = [
  { id: 'starter', name: 'Starter loan', amount: 20000, rate: 0.089, months: 24, minLevel: 1 },
  { id: 'stock', name: 'Stock finance', amount: 50000, rate: 0.079, months: 36, minLevel: 1 },
  { id: 'expansion', name: 'Expansion loan', amount: 150000, rate: 0.072, months: 48, minLevel: 2 },
  { id: 'growth', name: 'Growth facility', amount: 400000, rate: 0.066, months: 60, minLevel: 3 },
  { id: 'corporate', name: 'Corporate credit', amount: 1200000, rate: 0.059, months: 84, minLevel: 5 },
];

export function creditLimit(state: GameState): number {
  const value = companyValue(state) + debt(state);
  return Math.max(30000, Math.round(value * 0.85 + state.reputation * 800));
}

export function accountantDiscount(state: GameState): number {
  const acc = state.employees.filter((e) => e.role === 'accountant');
  return clamp(acc.reduce((m, e) => Math.max(m, e.skill), 0) / 100 * 0.2 + (acc.length > 1 ? 0.03 : 0), 0, 0.25);
}

export function loanRate(state: GameState, product: LoanProduct): number {
  const repAdj = (50 - state.reputation) / 1000;
  const market = state.economy ? (state.economy.rate - 4) / 100 * 0.7 : 0;
  const group = (state.group?.departments.finance ?? 0) >= 1 ? 0.008 : 0;
  return clamp(product.rate + repAdj + market - accountantDiscount(state) * 0.02 - group, 0.03, 0.2);
}

export function monthlyPayment(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

export function takeLoan(state: GameState, productId: string): { ok: boolean; message: string } {
  const product = LOAN_PRODUCTS.find((p) => p.id === productId);
  if (!product) return { ok: false, message: 'Unknown loan.' };
  if (state.companyLevel < product.minLevel) return { ok: false, message: `Requires company level ${product.minLevel}.` };
  const limit = creditLimit(state);
  if (debt(state) + product.amount > limit) return { ok: false, message: `The bank will lend up to ${Math.round(limit).toLocaleString('en-GB')} in total. Repay some debt or grow first.` };
  if (state.loans.length >= 4) return { ok: false, message: 'The bank will not open more than four facilities at once.' };
  const rate = loanRate(state, product);
  const loan: Loan = {
    id: nextId(state, 'l'),
    name: product.name,
    principal: product.amount,
    balance: product.amount,
    rate,
    termMonths: product.months,
    monthsLeft: product.months,
    payment: Math.round(monthlyPayment(product.amount, rate, product.months)),
    takenDay: state.day,
  };
  state.loans.push(loan);
  record(state, 'Loan', product.amount, `${product.name} drawn down`);
  return { ok: true, message: `${product.name} approved at ${(rate * 100).toFixed(1)}%.` };
}

export function repayLoan(state: GameState, loanId: string, amount?: number): { ok: boolean; message: string } {
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return { ok: false, message: 'Unknown loan.' };
  const pay = Math.min(loan.balance, amount ?? loan.balance);
  if (pay <= 0) return { ok: false, message: 'Nothing to repay.' };
  if (state.cash < pay) return { ok: false, message: 'Not enough cash to repay that.' };
  record(state, 'Loan', -pay, `Early repayment: ${loan.name}`);
  loan.balance -= pay;
  if (loan.balance <= 1) {
    state.loans = state.loans.filter((l) => l.id !== loanId);
    state.stats.loansRepaid = (state.stats.loansRepaid ?? 0) + 1;
    return { ok: true, message: `${loan.name} fully repaid.` };
  }
  // Keep the term, lower the payment.
  loan.payment = Math.round(monthlyPayment(loan.balance, loan.rate, Math.max(1, loan.monthsLeft)));
  return { ok: true, message: `Repaid part of ${loan.name}.` };
}

/** Monthly: rent, upkeep, insurance, loan payments, tax (salaries are paid weekly). */
export function monthlyCosts(state: GameState): void {
  for (const e of state.employees) e.commission = 0;
  for (const loc of state.locations) {
    record(state, 'Rent', -loc.rentMonthly, `Rent: ${loc.name}`, loc.id);
    const upkeep = Math.round(lotStats(loc.lot).upkeep);
    if (upkeep > 0) record(state, 'Maintenance', -upkeep, `Maintenance of fixtures: ${loc.name}`, loc.id);
  }
  // Insurance on stock and premises
  const stock = inventoryValue(state);
  // Lamps and cameras on the lot make the stock cheaper to insure.
  const guards = state.employees.filter((e) => e.role === 'security' && e.stationId).length;
  const security = state.locations.reduce((m, l) => m + Math.min(6, lotStats(l.lot).effects.security ?? 0), 0) / Math.max(1, state.locations.length) + Math.min(4, guards * 1.5);
  const insurance = Math.round((stock * 0.0035 * (1 - security * 0.04) + 120 * state.locations.length) * (1 - accountantDiscount(state) * 0.5));
  record(state, 'Insurance', -insurance, 'Stock & premises insurance');
  // Loans
  for (const loan of [...state.loans]) {
    const interest = Math.round(loan.balance * (loan.rate / 12));
    const principal = Math.min(loan.balance, Math.max(0, loan.payment - interest));
    record(state, 'Loan interest', -interest, `Interest: ${loan.name}`);
    record(state, 'Loan', -principal, `Repayment: ${loan.name}`);
    loan.balance -= principal;
    loan.monthsLeft -= 1;
    if (loan.balance <= 1 || loan.monthsLeft <= 0) {
      if (loan.balance > 1) record(state, 'Loan', -loan.balance, `Final payment: ${loan.name}`);
      state.loans = state.loans.filter((l) => l.id !== loan.id);
      pushNotice(state, 'good', `${loan.name} is paid off.`);
      state.stats.loansRepaid = (state.stats.loansRepaid ?? 0) + 1;
    }
  }
  // Tax on last month's profit
  const taxable = Math.max(0, state.month.profit - state.month.expenses);
  if (taxable > 0) {
    const rate = 0.21 * (1 - accountantDiscount(state)) * ((state.group?.departments.finance ?? 0) >= 1 ? 0.95 : 1);
    const tax = Math.round(taxable * rate);
    record(state, 'Taxes', -tax, `Corporate tax (${(rate * 100).toFixed(1)}% of ${Math.round(taxable).toLocaleString('en-GB')})`);
  }
}

/** Daily utilities and listing fees. */
export function dailyCosts(state: GameState): void {
  for (const loc of state.locations) {
    // Power for lifts, screens and lighting, plus heating the indoor rooms.
    const ls = lotStats(loc.lot);
    const lighting = loc.lot.style.lighting === 'showroom' ? 1.35 : loc.lot.style.lighting === 'led' ? 0.85 : 1;
    const lean = state.research?.done?.leanops ? 0.88 : 1;
    const utilities = Math.round((18 + ls.power + ls.indoorTiles * 0.12 * lighting + capacityOf(loc) * 0.3) * (loc.lot.open ? 1 : 0.6) * lean);
    record(state, 'Utilities', -utilities, `Utilities: ${loc.name}`, loc.id);
  }
  const online = state.vehicles.filter((v) => v.status === 'listed' && v.listedOnline);
  if (online.length) {
    const fee = online.length * 3;
    record(state, 'Listing fees', -fee, `Online listings: ${online.length} vehicles`);
  }
  // Overdraft interest
  if (state.cash < 0) {
    const interest = Math.round(-state.cash * 0.0006);
    if (interest > 0) record(state, 'Loan interest', -interest, 'Overdraft interest');
  }
}

/** Settles figures for a period from the daily history. */
export function periodTotals(state: GameState, days: number): { revenue: number; expenses: number; profit: number; sold: number } {
  const slice = state.history.slice(-days);
  return {
    revenue: sum(slice, (d) => d.revenue),
    expenses: sum(slice, (d) => d.expenses),
    profit: sum(slice, (d) => d.profit),
    sold: sum(slice, (d) => d.sold),
  };
}

export function categoryTotals(state: GameState, fromDay: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of state.transactions) {
    if (tx.day < fromDay) break;
    out[tx.category] = (out[tx.category] ?? 0) + tx.amount;
  }
  return out;
}

export function locationUpgradeValue(state: GameState, locationId: string): number {
  const loc = locationById(state, locationId);
  if (!loc) return 0;
  let total = 0;
  for (const [id, level] of Object.entries(loc.upgrades)) {
    const def = UPGRADE_BY_ID[id];
    if (!def) continue;
    for (let i = 0; i < level && i < def.costs.length; i += 1) total += def.costs[i];
  }
  void upgradeLevel;
  return total;
}
