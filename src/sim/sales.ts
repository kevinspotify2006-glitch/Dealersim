/**
 * Completing a sale, customer satisfaction, reviews and after-sale complaints.
 */
import type { Customer, GameState, Review, Vehicle } from './types';
import { SOLD_ARCHIVE_LIMIT, locationById, nextId, pushNotice, upgradeLevel, vehicleName } from './state';
import { bookSaleProfit, record } from './finance';
import { totalCost, trueValue } from './market';
import { gameRng } from './rng';
import { clamp } from './util';
import { emit } from './bus';
import { ARCHETYPE_BY_ID } from '../data/game';

export interface Extras { warranty: boolean; service: boolean; accessory: boolean; finance: boolean }

export const EXTRA_DEFS = {
  warranty: { name: '12-month warranty', priceRate: 0.045, costRate: 0.018, wtpRate: 0.035 },
  service: { name: 'Service plan', price: 390, cost: 170, wtp: 260 },
  accessory: { name: 'Accessory pack', price: 290, cost: 110, wtp: 200 },
  finance: { name: 'Dealer finance', commissionByLevel: [0, 0.02, 0.03, 0.04] },
};

export function extrasIncome(state: GameState, price: number, extras: Extras, locationId: string, free?: string): { income: number; cost: number; lines: string[] } {
  let income = 0;
  let cost = 0;
  const lines: string[] = [];
  if (extras.warranty) {
    const p = Math.round((price * EXTRA_DEFS.warranty.priceRate) / 10) * 10;
    income += p;
    cost += Math.round(price * EXTRA_DEFS.warranty.costRate);
    lines.push(`Warranty €${p}`);
  }
  if (extras.service && free === 'service') {
    cost += EXTRA_DEFS.service.cost;
    lines.push('Free service plan');
  } else if (extras.service) {
    income += EXTRA_DEFS.service.price;
    cost += EXTRA_DEFS.service.cost;
    lines.push(`Service plan €${EXTRA_DEFS.service.price}`);
  }
  if (extras.accessory && free === 'accessory') {
    cost += EXTRA_DEFS.accessory.cost;
    lines.push('Free accessory pack');
  } else if (extras.accessory) {
    income += EXTRA_DEFS.accessory.price;
    cost += EXTRA_DEFS.accessory.cost;
    lines.push(`Accessories €${EXTRA_DEFS.accessory.price}`);
  }
  if (extras.finance) {
    const loc = locationById(state, locationId);
    const lvl = loc ? upgradeLevel(loc, 'finance') : 0;
    const commission = Math.round(price * (EXTRA_DEFS.finance.commissionByLevel[lvl] ?? 0));
    if (commission > 0) {
      income += commission;
      lines.push(`Finance commission €${commission}`);
    }
  }
  return { income, cost, lines };
}

export interface SaleResult { price: number; profit: number; stars: number; review: Review }

/** Executes a sale. Assumes price already agreed. */
export function completeSale(
  state: GameState,
  v: Vehicle,
  customer: Customer,
  price: number,
  extras: Extras,
  opts: { byStaff: boolean; staffId?: string; patienceUsed: number; tradeIn?: { vehicle: Vehicle; allowance: number }; freeExtra?: string },
): SaleResult {
  const cost = totalCost(v);
  const ex = extrasIncome(state, price, extras, v.locationId, opts.freeExtra);
  record(state, 'Vehicle sale', price, `Sold ${vehicleName(v)} to ${customer.name}`, v.locationId);
  if (ex.income > 0) record(state, 'Extras', ex.income, `Add-ons: ${ex.lines.join(', ')}`, v.locationId);
  if (ex.cost > 0) record(state, 'Other', -ex.cost, `Add-on costs for ${vehicleName(v)}`, v.locationId);
  // Extras' costs are booked as an operating expense, so the gross profit booked
  // here is the sale margin plus extras income; the player is shown the net.
  const grossProfit = price - cost + ex.income;
  bookSaleProfit(state, grossProfit, v.locationId);

  // Trade-in joins stock.
  if (opts.tradeIn) {
    const t = opts.tradeIn.vehicle;
    record(state, 'Vehicle purchase', -opts.tradeIn.allowance, `Trade-in: ${vehicleName(t)}`, v.locationId);
    t.purchasePrice = opts.tradeIn.allowance;
    t.status = 'yard';
    t.locationId = v.locationId;
    t.boughtDay = state.day;
    t.arrivalDay = state.day;
    t.inspectionLevel = Math.max(1, t.inspectionLevel) as 1 | 2;
    state.vehicles.push(t);
    state.stats.vehiclesBought += 1;
  }

  v.status = 'sold';
  v.soldPrice = price;
  v.soldDay = state.day;
  v.soldTo = customer.name;
  v.warranty = extras.warranty;
  v.listedOnline = false;
  state.vehicles = state.vehicles.filter((x) => x.id !== v.id);
  state.soldArchive.unshift(v);
  if (state.soldArchive.length > SOLD_ARCHIVE_LIMIT) state.soldArchive.length = SOLD_ARCHIVE_LIMIT;

  customer.status = 'bought';
  if (customer.campaignId) {
    const camp = state.campaigns.find((x) => x.id === customer.campaignId);
    if (camp) camp.revenue += price + ex.income;
  }
  state.stats.sold += 1;
  state.stats.customersServed += 1;
  state.stats.lifetimeRevenue += price + ex.income;
  state.stats.lifetimeProfit += grossProfit;
  state.stats.biggestDeal = Math.max(state.stats.biggestDeal, price);
  state.today.sold += 1;
  state.month.sold += 1;
  const loc = locationById(state, v.locationId);
  if (loc) {
    loc.stats.sold += 1;
    loc.month.sold += 1;
  }
  if (v.fuel === 'Electric') state.stats.evSold = (state.stats.evSold ?? 0) + 1;

  if (opts.staffId) {
    const e = state.employees.find((x) => x.id === opts.staffId);
    if (e) {
      e.xp += 20 + Math.round(price / 2500);
      e.dealsClosed += 1;
    }
  }

  // Satisfaction
  const value = trueValue(state, v);
  const dealFeel = clamp(((value - price) / Math.max(1, value)) * 120, -25, 20);
  const lounge = loc ? upgradeLevel(loc, 'lounge') * 3 : 0;
  const showroom = loc ? upgradeLevel(loc, 'showroom') * 1.5 : 0;
  if (v.slotId) v.slotId = undefined;
  const staff = opts.staffId ? (state.employees.find((x) => x.id === opts.staffId)?.skill ?? 40) / 12 : 4;
  const extrasFeel = (extras.warranty ? 4 : 0) + (extras.service ? 2 : 0);
  const pressure = -opts.patienceUsed * 3;
  const score = clamp(50 + dealFeel + v.presentation / 9 + (v.condition - 70) / 3 + lounge + showroom + staff + extrasFeel + pressure + customer.satisfactionBonus + gameRng.range(-8, 8), 0, 100);
  const stars = score >= 86 ? 5 : score >= 70 ? 4 : score >= 52 ? 3 : score >= 34 ? 2 : 1;
  const review = makeReview(state, customer, v, stars, { price, value, opts, extras });
  applyReview(state, review);

  // Hidden problems may come back to bite.
  const hidden = v.issues.filter((i) => !i.fixed && !i.discovered && i.system !== 'History');
  if (hidden.length && gameRng.chance(0.35 + hidden.length * 0.2)) {
    v.complaintDay = state.day + gameRng.int(3, 25);
  }
  const clocked = v.issues.find((i) => i.name === 'Clocked mileage' && !i.discovered);
  if (clocked && gameRng.chance(0.4)) v.complaintDay = v.complaintDay ?? state.day + gameRng.int(5, 30);

  emit('sale', { vehicle: v, price, profit: grossProfit - ex.cost, byStaff: opts.byStaff });
  return { price, profit: grossProfit - ex.cost, stars, review };
}

// ---------------------------------------------------------------- reviews --

const GOOD = [
  'Spotless car and zero pressure.', 'Fair price, honest description.', 'Handed over the keys with a full tank and a smile.',
  'The car looked better than the photos.', 'Quick, friendly, sorted the paperwork in minutes.', 'Would buy here again.',
  'Knew their stuff about the car.', 'Great value for money.',
];
const MID = [
  'Decent car, a bit pricey.', 'Took a while to agree on a price.', 'Car was fine, the waiting area could be better.',
  'OK experience overall.', 'Needed a better clean before handover.',
];
const BAD = [
  'Felt overcharged.', 'Car was not as clean as advertised.', 'Pushy and slow.', 'Would not recommend.',
  'The car had marks nobody mentioned.',
];

function makeReview(state: GameState, c: Customer, v: Vehicle, stars: number, ctx: { price: number; value: number; opts: { byStaff: boolean; staffId?: string }; extras: Extras }): Review {
  const parts: string[] = [];
  const pool = stars >= 4 ? GOOD : stars === 3 ? MID : BAD;
  parts.push(gameRng.pick(pool));
  if (ctx.price < ctx.value * 0.95) parts.push('Price was a steal.');
  else if (ctx.price > ctx.value * 1.12) parts.push('Paid a bit over the odds.');
  if (v.presentation >= 85) parts.push('Immaculate presentation.');
  else if (v.presentation < 40) parts.push('Could have been cleaner.');
  if (ctx.opts.staffId) {
    const e = state.employees.find((x) => x.id === ctx.opts.staffId);
    if (e) parts.push(stars >= 4 ? `${e.name.split(' ')[0]} was brilliant.` : stars <= 2 ? `${e.name.split(' ')[0]} could have listened more.` : `Dealt with ${e.name.split(' ')[0]}.`);
  } else if (stars >= 4) parts.push('The owner took care of us personally.');
  if (ctx.extras.warranty && stars >= 3) parts.push('Warranty gives peace of mind.');
  return {
    id: nextId(state, 'r'),
    day: state.day,
    stars,
    customer: c.name,
    text: parts.join(' '),
    locationId: v.locationId,
    vehicle: vehicleName(v),
  };
}

export function applyReview(state: GameState, review: Review): void {
  state.reviews.unshift(review);
  if (state.reviews.length > 150) state.reviews.length = 150;
  // Reputation drifts towards what your customers say about you.
  const target = [0, 5, 25, 52, 74, 96][review.stars] ?? 50;
  const rate = review.stars <= 2 ? 0.045 : 0.025;
  state.reputation = clamp(state.reputation + (target - state.reputation) * rate, 0, 100);
  const loc = locationById(state, review.locationId);
  if (loc) loc.reputation = clamp(loc.reputation + (target - loc.reputation) * rate * 1.4, 0, 100);
  if (review.stars === 5) {
    state.stats.perfectReviews += 1;
  }
}

/** Customers who bought cars with hidden faults come back. */
export function complaintsDaily(state: GameState): void {
  for (const v of state.soldArchive) {
    if (!v.complaintDay || v.complaintDay !== state.day) continue;
    const issue = v.issues.find((i) => !i.fixed && !i.discovered && i.system !== 'History') ?? v.issues.find((i) => i.name === 'Clocked mileage');
    if (!issue) continue;
    issue.discovered = true;
    if (v.warranty && issue.repairCost > 0) {
      const claim = Math.round(issue.repairCost * 0.8);
      record(state, 'Warranty claim', -claim, `Warranty claim: ${issue.name} on ${vehicleName(v)}`, v.locationId);
      pushNotice(state, 'bad', `${v.soldTo ?? 'A customer'} claimed on the warranty: ${issue.name} (€${claim}).`);
      applyReview(state, {
        id: nextId(state, 'r'), day: state.day, stars: 3, customer: v.soldTo ?? 'Customer',
        text: `${issue.name} after purchase, but the warranty covered it without fuss.`, locationId: v.locationId, vehicle: vehicleName(v),
      });
    } else {
      const goodwill = issue.repairCost > 0 ? Math.round(issue.repairCost * 0.3) : 0;
      if (goodwill > 0) record(state, 'Warranty claim', -goodwill, `Goodwill contribution: ${issue.name}`, v.locationId);
      pushNotice(state, 'bad', `Complaint: ${v.soldTo ?? 'A customer'} found ${issue.name.toLowerCase()} on their ${vehicleName(v)}.`);
      applyReview(state, {
        id: nextId(state, 'r'), day: state.day, stars: issue.severity >= 2 ? 1 : 2, customer: v.soldTo ?? 'Customer',
        text: `${issue.name} within weeks of buying. ${issue.severity >= 2 ? 'Avoid!' : 'Disappointing.'}`, locationId: v.locationId, vehicle: vehicleName(v),
      });
    }
  }
}

export function archetypeName(c: Customer): string {
  return ARCHETYPE_BY_ID[c.archetype]?.name ?? 'Customer';
}
