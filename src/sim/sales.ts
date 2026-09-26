/**
 * Completing a sale: money (car, products, finance commission, dealer
 * bonus), the handover, customer satisfaction, reviews, the client profile
 * and after-sale complaints and warranty claims.
 */
import { creditBuyer } from './systems/procurement';
import { addAppointment, freePerson } from './systems/planning';
import type { Customer, FinancePlan, GameState, Review, Vehicle } from './types';
import { SOLD_ARCHIVE_LIMIT, funnelStep, hasTech, locationById, nextId, pushNotice, staffAt, upgradeLevel, vehicleName } from './state';
import { bookSaleProfit, record } from './finance';
import { totalCost, trueValue } from './market';
import { gameRng } from './rng';
import { clamp } from './util';
import { emit } from './bus';
import { ARCHETYPE_BY_ID } from '../data/game';
import { BRAND_BY_ID } from '../data/vehicles';
import { DELIVERY_OPTIONS } from '../data/products';
import { commission, productsIncome } from './systems/retail';
import { recordPurchase } from './systems/crm';
import { skillOf } from './staff';

export interface SaleResult { price: number; profit: number; stars: number; review: Review; finance: number; products: number }

export interface SaleOptions {
  byStaff: boolean;
  staffId?: string;
  patienceUsed: number;
  tradeIn?: { vehicle: Vehicle; allowance: number };
  freeExtra?: string;
  plan?: FinancePlan;
}

/** Cost and review effect of the delivery experience at a location. */
export function deliveryPackage(state: GameState, locationId: string): { cost: number; stars: number; loyalty: number; lines: string[] } {
  const loc = locationById(state, locationId);
  const out = { cost: 0, stars: 0, loyalty: 0, lines: [] as string[] };
  if (!loc?.delivery) return out;
  const boost = hasTech(state, 'deliveryexp') ? 1.4 : 1;
  for (const opt of DELIVERY_OPTIONS) {
    if (!loc.delivery[opt.id]) continue;
    if (opt.requires && !hasTech(state, opt.requires)) continue;
    out.cost += opt.cost;
    out.stars += opt.stars * boost;
    out.loyalty += opt.loyalty;
    out.lines.push(opt.name);
  }
  return out;
}

/** Executes a sale. Assumes price already agreed. */
export function completeSale(state: GameState, v: Vehicle, customer: Customer, price: number, extras: Record<string, boolean>, opts: SaleOptions): SaleResult {
  const cost = totalCost(v);
  const loc = locationById(state, v.locationId);
  const products = productsIncome(state, price, extras, opts.freeExtra, v.isNew);
  // Certified cars come with their own warranty.
  if (v.certified && !products.warranty) products.warranty = 'basic';
  record(state, 'Vehicle sale', price, `Sold ${vehicleName(v)} to ${customer.name}`, v.locationId);
  if (products.income > 0) record(state, 'Extras', products.income, `Products: ${products.lines.join(', ')}`, v.locationId);
  if (products.cost > 0) record(state, 'Other', -products.cost, `Product costs for ${vehicleName(v)}`, v.locationId);
  // Finance: the lender pays the dealer a commission on the amount financed.
  let financeIncome = 0;
  if (opts.plan && opts.plan.kind !== 'cash' && opts.plan.approved) {
    financeIncome = commission(state, opts.plan, price, v.locationId);
    if (financeIncome > 0) {
      record(state, 'Finance income', financeIncome, `${opts.plan.kind === 'lease' ? 'Lease' : 'Finance'} commission: ${customer.name} (${opts.plan.term} months at ${(opts.plan.apr * 100).toFixed(1)}%)`, v.locationId);
      bookSaleProfit(state, financeIncome, v.locationId);
    }
    state.kpi.financeDeals += 1;
    state.kpi.financeIncome += financeIncome;
    state.stats.financeDeals = (state.stats.financeDeals ?? 0) + 1;
    funnelStep(state, 'finance');
  }
  // New cars: the manufacturer pays a volume bonus.
  const contract = state.contracts?.find((c) => c.brandId === v.brandId);
  if (contract) {
    contract.soldMonth += 1;
    contract.soldTotal += 1;
    if (v.isNew) {
      const bonus = Math.round((BRAND_BY_ID[v.brandId]?.dealer?.bonus ?? 300) * (0.8 + contract.tier * 0.2));
      record(state, 'Dealer bonus', bonus, `${BRAND_BY_ID[v.brandId]?.name} volume bonus`, v.locationId);
      bookSaleProfit(state, bonus, v.locationId);
    }
  }
  // Extras' costs are booked as an operating expense, so the gross profit booked
  // here is the sale margin plus product income; the player is shown the net.
  const grossProfit = price - cost + products.income;
  creditBuyer(state, v, price - cost);
  bookSaleProfit(state, grossProfit, v.locationId);
  state.kpi.productsSold += products.count;
  state.stats.productsSold = (state.stats.productsSold ?? 0) + products.count;

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
    funnelStep(state, 'tradein');
  }

  // Handover: delivery options and the delivery specialist.
  const delivery = deliveryPackage(state, v.locationId);
  if (delivery.cost > 0) record(state, 'Delivery', -delivery.cost, `Handover: ${delivery.lines.join(', ')}`, v.locationId);
  const specialist = staffAt(state, v.locationId).find((e) => e.role === 'delivery' && e.stationId && e.trainingDaysLeft <= 0);
  funnelStep(state, 'delivery');
  // The handover goes into tomorrow's plan with the delivery specialist (or the seller).
  {
    const dayH = state.day + 1;
    const startH = [10, 11, 14, 15, 16][state.stats.sold % 5];
    const who = freePerson(state, v.locationId, ['delivery', 'sales'], dayH, startH, 0.5);
    addAppointment(state, { kind: 'delivery', locationId: v.locationId, day: dayH, start: startH, duration: 0.5, staffId: who?.id ?? opts.staffId, clientId: customer.clientId, customer: customer.name, vehicle: vehicleName(v), title: '🎁 Handover' });
  }
  state.kpi.deliveries += 1;

  v.status = 'sold';
  v.soldPrice = price;
  v.soldDay = state.day;
  v.soldTo = customer.name;
  v.warranty = !!products.warranty;
  v.warrantyUntil = products.warranty ? state.day + (products.warranty === 'extended' ? 360 : v.isNew ? 360 : 120) : undefined;
  v.listedOnline = false;
  v.reservedBy = undefined;
  state.vehicles = state.vehicles.filter((x) => x.id !== v.id);
  state.soldArchive.unshift(v);
  if (state.soldArchive.length > SOLD_ARCHIVE_LIMIT) state.soldArchive.length = SOLD_ARCHIVE_LIMIT;

  customer.status = 'bought';
  customer.stage = 'sale';
  funnelStep(state, 'sale');
  if (customer.campaignId) {
    const camp = state.campaigns.find((x) => x.id === customer.campaignId);
    if (camp) {
      camp.revenue += price + products.income;
      camp.sales = (camp.sales ?? 0) + 1;
    }
  }
  state.stats.sold += 1;
  state.stats.customersServed += 1;
  state.stats.lifetimeRevenue += price + products.income + financeIncome;
  state.stats.lifetimeProfit += grossProfit + financeIncome;
  state.stats.biggestDeal = Math.max(state.stats.biggestDeal, price);
  state.today.sold += 1;
  state.month.sold += 1;
  if (loc) {
    loc.stats.sold += 1;
    loc.month.sold += 1;
  }
  if (v.fuel === 'Electric') state.stats.evSold = (state.stats.evSold ?? 0) + 1;
  if (customer.clientId) state.stats.repeatSales = (state.stats.repeatSales ?? 0) + 1;
  if (v.certified) state.stats.certifiedSold = (state.stats.certifiedSold ?? 0) + 1;
  if (v.isNew) state.stats.newSold = (state.stats.newSold ?? 0) + 1;
  if (v.category === 'Luxury' || v.category === 'Performance') state.stats.luxurySold = (state.stats.luxurySold ?? 0) + 1;
  if (customer.reservation) state.stats.onlineSales = (state.stats.onlineSales ?? 0) + 1;

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
  const staffEmp = opts.staffId ? state.employees.find((x) => x.id === opts.staffId) : undefined;
  const staff = staffEmp ? (staffEmp.skill + skillOf(staffEmp, 'service')) / 24 : 4;
  const pressure = -opts.patienceUsed * 3;
  const waiting = -Math.max(0, (customer.waited ?? 0) - 1) * 2;
  // A monthly payment that fits their budget feels good; a stretch does not.
  const planFeel = opts.plan && opts.plan.kind !== 'cash' ? clamp(((customer.monthlyLimit ?? 300) - opts.plan.monthly) / Math.max(50, customer.monthlyLimit ?? 300) * 10, -6, 4) : 0;
  const handover = delivery.stars + (specialist ? 3 + skillOf(specialist, 'service') / 30 : 0);
  const quality = (v.certified ? 3 : 0) + (v.isNew ? 4 : 0);
  const score = clamp(50 + dealFeel + v.presentation / 9 + (v.condition - 70) / 3 + lounge + showroom + staff + products.satisfaction + pressure + waiting + planFeel + handover + quality + customer.satisfactionBonus + gameRng.range(-8, 8), 0, 100);
  const stars = score >= 86 ? 5 : score >= 70 ? 4 : score >= 52 ? 3 : score >= 34 ? 2 : 1;
  const review = makeReview(state, customer, v, stars, { price, value, opts, products: products.lines, delivery: delivery.lines.length > 0 || !!specialist, waited: customer.waited ?? 0 });
  applyReview(state, review);
  funnelStep(state, 'review');

  // The customer becomes (or stays) a client.
  const client = recordPurchase(state, customer, v, price, grossProfit + financeIncome, stars, products.serviceDays);
  if (delivery.loyalty > 0 || specialist) client.nextPurchaseDay = Math.max(state.day + 120, (client.nextPurchaseDay ?? state.day + 300) - Math.round((delivery.loyalty + (specialist ? 0.05 : 0)) * 600));

  // Hidden problems may come back to bite (a certified car was checked properly).
  const hidden = v.issues.filter((i) => !i.fixed && !i.discovered && i.system !== 'History');
  if (hidden.length && gameRng.chance((0.35 + hidden.length * 0.2) * (v.certified ? 0.4 : 1))) {
    v.complaintDay = state.day + gameRng.int(3, 25);
  }
  const clocked = v.issues.find((i) => i.name === 'Clocked mileage' && !i.discovered);
  if (clocked && gameRng.chance(0.4)) v.complaintDay = v.complaintDay ?? state.day + gameRng.int(5, 30);
  // Extended warranties on older cars: a small chance of a wear-and-tear claim later.
  if (products.warranty === 'extended' && !v.isNew && gameRng.chance(clamp((2026 - v.year) / 40 + v.mileage / 600000, 0.02, 0.35))) {
    v.complaintDay = v.complaintDay ?? state.day + gameRng.int(40, 300);
  }

  emit('sale', { vehicle: v, price, profit: grossProfit - products.cost + financeIncome, byStaff: opts.byStaff });
  return { price, profit: grossProfit - products.cost + financeIncome, stars, review, finance: financeIncome, products: products.income };
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

function makeReview(state: GameState, c: Customer, v: Vehicle, stars: number, ctx: { price: number; value: number; opts: SaleOptions; products: string[]; delivery: boolean; waited: number }): Review {
  const parts: string[] = [];
  const pool = stars >= 4 ? GOOD : stars === 3 ? MID : BAD;
  parts.push(gameRng.pick(pool));
  if (ctx.price < ctx.value * 0.95) parts.push('Price was a steal.');
  else if (ctx.price > ctx.value * 1.12) parts.push('Paid a bit over the odds.');
  if (v.presentation >= 85) parts.push('Immaculate presentation.');
  else if (v.presentation < 40) parts.push('Could have been cleaner.');
  if (ctx.waited >= 3) parts.push('Had to wait ages before anyone came over.');
  if (ctx.delivery && stars >= 4) parts.push('The handover was a lovely moment.');
  if (ctx.opts.plan && ctx.opts.plan.kind !== 'cash' && stars >= 4) parts.push('Finance sorted on the spot.');
  if (ctx.opts.staffId) {
    const e = state.employees.find((x) => x.id === ctx.opts.staffId);
    if (e) parts.push(stars >= 4 ? `${e.name.split(' ')[0]} was brilliant.` : stars <= 2 ? `${e.name.split(' ')[0]} could have listened more.` : `Dealt with ${e.name.split(' ')[0]}.`);
  } else if (stars >= 4) parts.push('The owner took care of us personally.');
  if (ctx.products.some((p) => /warranty/i.test(p)) && stars >= 3) parts.push('Warranty gives peace of mind.');
  if (c.clientId && stars >= 4) parts.push('Our second car from them.');
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
    const issue = v.issues.find((i) => !i.fixed && !i.discovered && i.system !== 'History') ?? v.issues.find((i) => i.name === 'Clocked mileage')
      ?? { name: 'Worn clutch', repairCost: gameRng.int(400, 1200), severity: 2 as const, system: 'Transmission' as const, discovered: false };
    issue.discovered = true;
    const covered = v.warranty && (v.warrantyUntil ?? state.day + 1) >= state.day;
    if (covered && issue.repairCost > 0) {
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
      // An angry customer does not come back.
      const client = state.clients.find((x) => x.name === v.soldTo);
      if (client) client.lost = true;
    }
  }
}

export function archetypeName(c: Customer): string {
  return ARCHETYPE_BY_ID[c.archetype]?.name ?? 'Customer';
}
