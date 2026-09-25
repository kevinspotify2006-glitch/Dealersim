/**
 * Interactive negotiation between the player and a customer.
 *
 * The customer has a hidden willingness to pay (wtp). The player sees clues:
 * interest, a budget range whose width depends on analytics and staff, and the
 * customer's mood. Every counter that asks too much burns patience. How they
 * haggle depends on their style (haggler, fair, decisive, analytical).
 *
 * Around the price: F&I products, a finance application (cash, loan, balloon,
 * lease — the lender may say no) and the trade-in (inspect it, adjust for
 * repairs, offer low/fair/high, or refuse it).
 */
import type { Customer, FinanceKind, GameState, Negotiation, Vehicle } from './types';
import { ARCHETYPE_BY_ID } from '../data/game';
import { PRODUCT_BY_ID } from '../data/products';
import { gameRng } from './rng';
import { clamp } from './util';
import { funnelStep, locationById, upgradeLevel, vehicleName } from './state';
import { lotStats } from './lot';
import { bookValue, roundPrice, totalCost, trueValue } from './market';
import { bestAt, skillOf } from './staff';
import { completeSale, SaleResult } from './sales';
import { approvalChance, financeKinds, makePlan, productPrice, productsFor, takeChance } from './systems/retail';
import { runInspection } from './vehicles';

export function negotiationParties(state: GameState): { n: Negotiation; c: Customer; v: Vehicle } | null {
  const n = state.negotiation;
  if (!n) return null;
  const c = state.customers.find((x) => x.id === n.customerId);
  const v = state.vehicles.find((x) => x.id === n.vehicleId);
  if (!c || !v) return null;
  return { n, c, v };
}

function round50(x: number): number {
  return x < 5000 ? Math.round(x / 50) * 50 : Math.round(x / 100) * 100;
}

/** Salesperson at the location coaches the owner. */
function coachBonus(state: GameState, v: Vehicle): number {
  const s = bestAt(state, v.locationId, 'sales');
  const loc = locationById(state, v.locationId);
  // Premium desks, screens and brochures help whoever is selling — you included.
  const boost = loc ? Math.min(25, lotStats(loc.lot).effects.sales ?? 0) / 1000 : 0;
  return (s ? (s.skill + skillOf(s, 'negotiation')) / 4400 : 0) + boost;
}

export function effectiveWtp(state: GameState, n: Negotiation, c: Customer, v: Vehicle): number {
  let w = Math.round(c.wtp * (1 + n.mood * 0.035 + coachBonus(state, v)));
  // A declined finance application leaves only what they can pay in cash.
  if (n.plan?.declined) w = Math.min(w, Math.round(c.budget * 1.02));
  return w;
}

export function startNegotiation(state: GameState, customerId: string): { ok: boolean; message: string } {
  if (state.negotiation && !state.negotiation.done) {
    const cur = state.customers.find((c) => c.id === state.negotiation?.customerId);
    if (cur && cur.id !== customerId) return { ok: false, message: `You are already talking to ${cur.name}.` };
    if (cur) return { ok: true, message: '' };
  }
  const c = state.customers.find((x) => x.id === customerId);
  if (!c || (c.status !== 'waiting' && c.status !== 'negotiating')) return { ok: false, message: 'That customer has left.' };
  const v = state.vehicles.find((x) => x.id === c.vehicleId && x.status === 'listed');
  if (!v) {
    c.status = 'left';
    return { ok: false, message: 'The vehicle they wanted is no longer for sale.' };
  }
  c.status = 'negotiating';
  c.stage = 'negotiation';
  c.waited = 0;
  funnelStep(state, 'negotiation');
  const styleOpen = c.style === 'haggler' ? -0.06 : c.style === 'decisive' ? 0.04 : 0;
  const opening = Math.min(v.askingPrice, round50(c.wtp * (0.8 + (1 - c.negotiation) * 0.1 + styleOpen)));
  const n: Negotiation = {
    customerId: c.id,
    vehicleId: v.id,
    round: 0,
    patienceLeft: c.patience,
    lastCustomerOffer: opening,
    lastPlayerPrice: v.askingPrice,
    extras: {},
    tradeInIncluded: false,
    log: [],
    mood: 0,
    done: false,
  };
  const a = ARCHETYPE_BY_ID[c.archetype];
  n.log.push({ who: 'system', text: `${c.name} (${a.name}${c.clientId ? ', returning customer' : ''}) is looking at the ${vehicleName(v)}, listed at €${v.askingPrice.toLocaleString('en-GB')}.` });
  if (opening >= v.askingPrice) {
    n.log.push({ who: 'them', text: `I like it. I'll pay the asking price — €${v.askingPrice.toLocaleString('en-GB')}.` });
  } else {
    const lines = c.style === 'analytical'
      ? [`I've compared prices online. Similar cars go for about €${opening.toLocaleString('en-GB')}.`]
      : c.style === 'haggler'
        ? [`Come on, €${opening.toLocaleString('en-GB')} and I'll take it today.`, `€${opening.toLocaleString('en-GB')}, cash in hand. What do you say?`]
        : [
          `Nice car. Would you take €${opening.toLocaleString('en-GB')}?`,
          `I've seen similar ones cheaper. €${opening.toLocaleString('en-GB')} and we have a deal.`,
          `My budget is tight — I can do €${opening.toLocaleString('en-GB')}.`,
        ];
    n.log.push({ who: 'them', text: gameRng.pick(lines) });
  }
  if (c.wantsFinance) n.log.push({ who: 'them', text: `I'd like to spread the cost — something around €${c.monthlyLimit ?? 300} a month.` });
  if (c.tradeIn) {
    n.log.push({ who: 'them', text: `I'd like to part-exchange my ${vehicleName(c.tradeIn)}. I reckon it's worth about €${(c.tradeInExpectation ?? 0).toLocaleString('en-GB')}.` });
  }
  state.negotiation = n;
  return { ok: true, message: '' };
}

export interface Clues {
  interest: number;
  budgetLow: number;
  budgetHigh: number;
  wtpLow?: number;
  wtpHigh?: number;
  mood: string;
  moodTone: 'good' | 'warn' | 'bad' | 'info';
  patience: string;
  bookValue: number;
  cost: number;
  tradeInValue?: number;
  tradeInLow?: number;
  tradeInHigh?: number;
  tradeInRepairs?: number;
}

export function clues(state: GameState): Clues | null {
  const p = negotiationParties(state);
  if (!p) return null;
  const { n, c, v } = p;
  const loc = locationById(state, v.locationId);
  const analytics = loc ? upgradeLevel(loc, 'analytics') : 0;
  const seller = bestAt(state, v.locationId, 'sales');
  // Width of the budget hint shrinks with analytics and a good salesperson.
  const width = clamp(0.3 - analytics * 0.06 - (seller?.skill ?? 0) / 600, 0.06, 0.3);
  // The hint is centred on a stable, slightly noisy anchor so it does not jump around.
  const seed = (c.id.charCodeAt(1) % 7) / 100 - 0.03;
  const anchor = c.budget * (1 + seed);
  const out: Clues = {
    interest: c.interest,
    budgetLow: roundPrice(anchor * (1 - width)),
    budgetHigh: roundPrice(anchor * (1 + width * 0.6)),
    mood: '',
    moodTone: 'info',
    patience: '',
    bookValue: bookValue(state, v),
    cost: totalCost(v),
  };
  if (analytics >= 3) {
    const w = effectiveWtp(state, n, c, v);
    out.wtpLow = roundPrice(w * 0.95);
    out.wtpHigh = roundPrice(w * 1.04);
  }
  const ratio = n.patienceLeft / Math.max(1, c.patience);
  if (n.mood > 0.4) { out.mood = 'Excited'; out.moodTone = 'good'; }
  else if (n.mood > 0) { out.mood = 'Warm'; out.moodTone = 'good'; }
  else if (n.mood > -0.4) { out.mood = 'Neutral'; out.moodTone = 'info'; }
  else { out.mood = 'Annoyed'; out.moodTone = 'bad'; }
  out.patience = ratio > 0.66 ? 'Relaxed' : ratio > 0.34 ? 'Checking the time' : 'About to leave';
  if (c.tradeIn) {
    const book = bookValue(state, c.tradeIn);
    const tc = loc ? upgradeLevel(loc, 'tradein') : 0;
    const inspected = c.tradeIn.inspectionLevel >= 2;
    const err = inspected ? 0.04 : [0.18, 0.12, 0.06][tc] ?? 0.18;
    out.tradeInValue = book;
    out.tradeInLow = roundPrice(book * (1 - err));
    out.tradeInHigh = roundPrice(book * (1 + err * 0.6));
    out.tradeInRepairs = c.tradeIn.issues.filter((i) => i.discovered && !i.fixed).reduce((s, i) => s + i.repairCost, 0);
  }
  return out;
}

function say(n: Negotiation, who: 'you' | 'them' | 'system', text: string): void {
  n.log.push({ who, text });
  if (n.log.length > 40) n.log.shift();
}

/** Player proposes a price. */
export function counterOffer(state: GameState, price: number): { outcome: 'accepted' | 'countered' | 'walked'; sale?: SaleResult } {
  const p = negotiationParties(state);
  if (!p) return { outcome: 'walked' };
  const { n, c, v } = p;
  const offer = Math.max(n.lastCustomerOffer, Math.round(price));
  n.request = undefined;
  n.round += 1;
  n.lastPlayerPrice = offer;
  say(n, 'you', `I can do €${offer.toLocaleString('en-GB')}.`);
  let wtp = effectiveWtp(state, n, c, v);
  // An analytical buyer accepts a price that is fair against the market.
  if (c.style === 'analytical' && offer <= bookValue(state, v) * 1.02) wtp = Math.max(wtp, offer);
  if (offer <= wtp) {
    say(n, 'them', offer <= n.lastCustomerOffer * 1.01 ? 'Deal!' : gameRng.pick(['Alright, you have a deal.', 'Fine — let\'s do it.', 'OK, shake on it.']));
    const sale = finish(state, offer);
    return { outcome: 'accepted', sale };
  }
  const gap = (offer - wtp) / Math.max(1, wtp);
  const decisive = c.style === 'decisive';
  n.patienceLeft -= gap > 0.15 ? 2 : decisive && gap > 0.08 ? 2 : 1;
  n.mood = clamp(n.mood - (gap > 0.15 ? 0.3 : 0.12), -1, 1);
  if (n.patienceLeft <= 0) {
    say(n, 'them', gameRng.pick(['We are too far apart. I\'ll look elsewhere.', 'Forget it. Thanks for your time.', 'That\'s not happening. Goodbye.']));
    endWalk(state);
    return { outcome: 'walked' };
  }
  // Close to a deal, some customers ask for a sweetener instead of a discount.
  if (gap <= 0.07 && !n.request && gameRng.chance(c.style === 'haggler' ? 0.5 : 0.35)) {
    const options = productsFor(state, v, !!n.plan?.approved).filter((x) => !n.extras[x.id] && x.fixed > 0 && x.fixed < 500);
    const pick = options.length ? gameRng.pick(options) : undefined;
    if (pick) {
      n.request = { extra: pick.id, price: Math.min(offer, Math.round(wtp / 50) * 50) };
      say(n, 'them', `Throw in the ${pick.name.toLowerCase()} for free and I'll pay €${n.request.price.toLocaleString('en-GB')}.`);
      return { outcome: 'countered' };
    }
  }
  const step = (0.35 + (1 - c.negotiation) * 0.3) * (c.style === 'haggler' ? 0.75 : c.style === 'decisive' ? 1.2 : 1);
  let next = n.lastCustomerOffer + (wtp - n.lastCustomerOffer) * step;
  if (n.patienceLeft === 1) next = wtp * gameRng.range(0.97, 1);
  next = Math.min(round50(next), offer - 50, wtp);
  n.lastCustomerOffer = Math.max(n.lastCustomerOffer, next);
  if (n.patienceLeft === 1) {
    say(n, 'them', `This is my final offer: €${n.lastCustomerOffer.toLocaleString('en-GB')}.`);
  } else if (gap > 0.15) {
    say(n, 'them', `That's way over what I had in mind. €${n.lastCustomerOffer.toLocaleString('en-GB')}.`);
  } else if (gap > 0.05) {
    say(n, 'them', `Hmm. I could stretch to €${n.lastCustomerOffer.toLocaleString('en-GB')}.`);
  } else {
    say(n, 'them', `We're close. €${n.lastCustomerOffer.toLocaleString('en-GB')}?`);
  }
  return { outcome: 'countered' };
}

/** Player agrees to the customer's "include an extra for free" request. */
export function acceptRequest(state: GameState): SaleResult | undefined {
  const p = negotiationParties(state);
  if (!p || !p.n.request) return undefined;
  const { n } = p;
  const req = n.request!;
  say(n, 'you', `Deal — ${PRODUCT_BY_ID[req.extra]?.name.toLowerCase() ?? req.extra} on the house.`);
  n.freeExtra = req.extra;
  n.extras[req.extra] = true;
  return finish(state, req.price);
}

/** Player accepts the customer's last offer. */
export function acceptOffer(state: GameState): SaleResult | undefined {
  const p = negotiationParties(state);
  if (!p) return undefined;
  say(p.n, 'you', `Deal at €${p.n.lastCustomerOffer.toLocaleString('en-GB')}.`);
  return finish(state, p.n.lastCustomerOffer);
}

/** Offers (or removes) a product; the customer reacts. */
export function toggleExtra(state: GameState, key: string): string {
  const p = negotiationParties(state);
  if (!p) return '';
  const { n, c, v } = p;
  if (n.extras[key]) {
    n.extras[key] = false;
    return 'Removed.';
  }
  const def = PRODUCT_BY_ID[key];
  if (!def) return '';
  if (!productsFor(state, v, !!n.plan?.approved).some((x) => x.id === key)) return def.financeOnly ? 'Only with an approved finance deal.' : 'Not available here yet.';
  const price = productPrice(def, n.lastPlayerPrice);
  if (!gameRng.chance(takeChance(state, c, def, v.locationId) + (n.mood > 0.3 ? 0.1 : 0))) {
    // Pushing extras on someone who does not want them costs a little goodwill.
    n.mood = clamp(n.mood - 0.08, -1, 1);
    say(n, 'you', `How about the ${def.name.toLowerCase()} for €${price.toLocaleString('en-GB')}?`);
    say(n, 'them', gameRng.pick(['No thanks, just the car.', 'I don\'t need that.', 'Let\'s keep it simple.']));
    return `${c.name.split(' ')[0]} is not interested.`;
  }
  n.extras[key] = true;
  n.mood = clamp(n.mood + 0.1, -1, 1);
  say(n, 'you', `I'll add the ${def.name.toLowerCase()} — €${price.toLocaleString('en-GB')}.`);
  say(n, 'them', gameRng.pick(['That sounds good, actually.', 'Oh, that helps.', 'Nice — I was worried about that.']));
  return 'Added to the deal.';
}

// ----------------------------------------------------------------- finance --

/** A finance quote for the current price. */
export function financeQuote(state: GameState, kind: FinanceKind, term: number, deposit: number): { plan: ReturnType<typeof makePlan>; chance: number } | null {
  const p = negotiationParties(state);
  if (!p) return null;
  const plan = makePlan(state, p.c, p.v, Math.max(p.n.lastCustomerOffer, Math.min(p.n.lastPlayerPrice, p.v.askingPrice)), kind, term, deposit);
  return { plan, chance: approvalChance(state, p.c, plan, p.v.locationId) };
}

export function availableFinance(state: GameState): FinanceKind[] {
  const p = negotiationParties(state);
  return p ? financeKinds(state, locationById(state, p.v.locationId)) : ['cash'];
}

/** Sends the finance application to the lender. */
export function applyForFinance(state: GameState, kind: FinanceKind, term: number, deposit: number): { ok: boolean; message: string } {
  const p = negotiationParties(state);
  if (!p) return { ok: false, message: '' };
  const { n, c } = p;
  if (kind === 'cash') {
    n.plan = { kind: 'cash', term: 0, deposit: 1, apr: 0, monthly: 0 };
    say(n, 'you', 'Let\'s keep it simple — paying in full.');
    return { ok: true, message: 'Cash deal.' };
  }
  if (n.plan?.approved && n.plan.kind === kind) return { ok: false, message: 'Already approved.' };
  if ((n.plan?.declined ? 1 : 0) + (n.round > 6 ? 1 : 0) >= 2) return { ok: false, message: 'The lender will not look at another application today.' };
  const quote = financeQuote(state, kind, term, deposit);
  if (!quote) return { ok: false, message: '' };
  state.kpi.financeOffers += 1;
  funnelStep(state, 'finance');
  say(n, 'you', `Let me run a ${kind === 'lease' ? 'lease' : kind === 'balloon' ? 'balloon finance' : 'loan'} application: ${term} months, ${Math.round(deposit * 100)}% down, about €${quote.plan.monthly} a month.`);
  if (gameRng.chance(quote.chance)) {
    n.plan = { ...quote.plan, approved: true };
    const fits = quote.plan.monthly <= (c.monthlyLimit ?? 300);
    n.mood = clamp(n.mood + (fits ? 0.25 : 0.05), -1, 1);
    // Paying monthly makes a bigger total easier to accept.
    if (fits) c.wtp = Math.round(c.wtp * 1.02);
    say(n, 'system', `Approved at ${(quote.plan.apr * 100).toFixed(1)}% APR — €${quote.plan.monthly}/month.`);
    say(n, 'them', fits ? 'That monthly figure works for me.' : 'Hmm, that is more per month than I hoped.');
    return { ok: true, message: `Finance approved: €${quote.plan.monthly}/month.` };
  }
  n.plan = { ...quote.plan, declined: true };
  n.mood = clamp(n.mood - 0.25, -1, 1);
  n.patienceLeft -= 1;
  say(n, 'system', 'The lender declined the application.');
  say(n, 'them', c.budget >= n.lastCustomerOffer ? 'That\'s embarrassing. I suppose I could pay cash…' : 'Without finance I can\'t afford it.');
  if (n.patienceLeft <= 0 || c.budget * 1.05 < n.lastCustomerOffer * 0.9) {
    say(n, 'them', 'I think I\'ll leave it.');
    endWalk(state);
    return { ok: false, message: 'Finance declined — the customer walked out.' };
  }
  return { ok: false, message: 'Finance declined.' };
}

// ---------------------------------------------------------------- trade-in --

/** Look the trade-in over properly: finds faults and tightens your estimate. Costs a little time. */
export function inspectTradeIn(state: GameState): string {
  const p = negotiationParties(state);
  if (!p || !p.c.tradeIn) return '';
  const { n, c } = p;
  const t = c.tradeIn!;
  if (t.inspectionLevel >= 2) return 'Already inspected.';
  t.locationId = p.v.locationId;
  const found = runInspection(state, t, true);
  t.inspectionLevel = 2;
  n.patienceLeft = Math.max(1, n.patienceLeft - (gameRng.chance(0.5) ? 1 : 0));
  say(n, 'you', `Let me have a proper look at your ${vehicleName(t)}.`);
  if (found.length) {
    say(n, 'system', `Found: ${found.map((f) => f.name.toLowerCase()).join(', ')}.`);
    // Faced with the facts, the customer lowers their expectation.
    const impact = found.reduce((s, f) => s + f.valueImpact, 0);
    c.tradeInExpectation = Math.max(200, roundPrice((c.tradeInExpectation ?? 0) - impact * 0.6));
    say(n, 'them', 'Ah. I didn\'t know about that.');
    return `Found ${found.length} fault${found.length > 1 ? 's' : ''} — they expect less now.`;
  }
  say(n, 'system', 'No hidden faults found.');
  return 'Clean — your estimate is now accurate.';
}

/** Player makes a trade-in offer. With `repairs`, the offer is explained by the repair bill. */
export function tradeInOffer(state: GameState, amount: number, repairs = false): string {
  const p = negotiationParties(state);
  if (!p || !p.c.tradeIn) return '';
  const { n, c } = p;
  const expect = c.tradeInExpectation ?? 0;
  n.tradeInOffer = Math.max(0, Math.round(amount));
  const repairBill = c.tradeIn!.issues.filter((i) => i.discovered && !i.fixed).reduce((s, i) => s + i.repairCost, 0);
  if (repairs && repairBill > 0) say(n, 'you', `Your ${vehicleName(c.tradeIn!)} needs about €${repairBill.toLocaleString('en-GB')} of work, so I can give you €${n.tradeInOffer.toLocaleString('en-GB')}.`);
  else say(n, 'you', `For your ${vehicleName(c.tradeIn!)} I can give you €${n.tradeInOffer.toLocaleString('en-GB')}.`);
  // A repair adjustment that is backed by real faults is accepted more easily.
  const justified = repairs ? Math.min(repairBill, Math.max(0, expect - n.tradeInOffer)) * 0.8 : 0;
  const ratio = (n.tradeInOffer + justified) / Math.max(1, expect);
  if (ratio >= 0.93) {
    n.tradeInIncluded = true;
    n.mood = clamp(n.mood + (ratio >= 1 ? 0.3 : 0.1), -1, 1);
    // A generous allowance makes the car price easier to swallow.
    if (n.tradeInOffer > expect) c.wtp = Math.round(c.wtp + (n.tradeInOffer - expect) * 0.5);
    say(n, 'them', ratio >= 1 ? 'That\'s more than fair!' : repairs ? 'Fair enough, given the work it needs.' : 'OK, I can live with that.');
    return 'Trade-in accepted.';
  }
  if (ratio >= 0.8) {
    n.tradeInIncluded = true;
    n.mood = clamp(n.mood - 0.12, -1, 1);
    c.wtp = Math.round(c.wtp - (expect - n.tradeInOffer - justified) * 0.35);
    say(n, 'them', 'Bit low... fine, but then the price has to come down.');
    return 'Trade-in accepted grudgingly.';
  }
  n.tradeInIncluded = false;
  n.patienceLeft -= 1;
  n.mood = clamp(n.mood - 0.25, -1, 1);
  say(n, 'them', 'That\'s insulting. I\'ll sell it privately.');
  if (n.patienceLeft <= 0) {
    say(n, 'them', 'Actually, I\'m done here.');
    endWalk(state);
    return 'The customer walked out.';
  }
  return 'Trade-in refused.';
}

/** Refuse to take the trade-in at all. */
export function declineTradeIn(state: GameState): string {
  const p = negotiationParties(state);
  if (!p || !p.c.tradeIn) return '';
  const { n, c } = p;
  n.tradeInIncluded = false;
  n.tradeInOffer = undefined;
  say(n, 'you', 'I\'m afraid I can\'t take your car in part-exchange.');
  n.mood = clamp(n.mood - 0.15, -1, 1);
  // Some people needed the trade-in money to afford the car.
  if ((c.tradeInExpectation ?? 0) > c.budget * 0.3) c.wtp = Math.round(c.wtp - (c.tradeInExpectation ?? 0) * 0.2);
  say(n, 'them', 'Then I\'ll have to sell it myself first… let\'s see.');
  return 'Trade-in declined.';
}

/** Suggested trade-in figures for the quick buttons. */
export function tradeInSuggestions(state: GameState): { low: number; fair: number; high: number; repairs: number } | null {
  const p = negotiationParties(state);
  if (!p || !p.c.tradeIn) return null;
  const t = p.c.tradeIn;
  const book = bookValue(state, t);
  const repairs = t.issues.filter((i) => i.discovered && !i.fixed).reduce((s, i) => s + i.repairCost, 0);
  const trade = book * 0.9;
  return { low: roundPrice(trade * 0.85), fair: roundPrice(trade), high: roundPrice(Math.min(trueValue(state, t) * 0.98, trade * 1.08)), repairs };
}

function finish(state: GameState, price: number): SaleResult | undefined {
  const p = negotiationParties(state);
  if (!p) return undefined;
  const { n, c, v } = p;
  const trade = n.tradeInIncluded && c.tradeIn && n.tradeInOffer !== undefined ? { vehicle: c.tradeIn, allowance: n.tradeInOffer } : undefined;
  // Finance on the agreed price (the quote was on the last figures).
  const plan = n.plan?.approved && n.plan.kind !== 'cash' ? { ...makePlan(state, c, v, price, n.plan.kind, n.plan.term, n.plan.deposit), approved: true } : undefined;
  const result = completeSale(state, v, c, price, n.extras, { byStaff: false, patienceUsed: c.patience - n.patienceLeft, tradeIn: trade, freeExtra: n.freeExtra, plan });
  n.done = true;
  n.outcome = 'sold';
  state.customers = state.customers.filter((x) => x.id !== c.id);
  return result;
}

function endWalk(state: GameState): void {
  const p = negotiationParties(state);
  if (!p) return;
  p.n.done = true;
  p.n.outcome = 'walked';
  p.c.status = 'left';
  state.lostLeads.unshift({ day: state.day, archetype: p.c.archetype, reason: 'Walked out of negotiations', wanted: vehicleName(p.v), locationId: p.c.locationId });
}

/** Player ends the conversation. */
export function rejectCustomer(state: GameState): void {
  const p = negotiationParties(state);
  if (!p) {
    state.negotiation = undefined;
    return;
  }
  say(p.n, 'you', 'Sorry, I can\'t go that low.');
  p.n.done = true;
  p.n.outcome = 'rejected';
  p.c.status = 'left';
}

/** Close the negotiation panel (after it finished, or to hand the customer back to the queue). */
export function closeNegotiation(state: GameState): void {
  const n = state.negotiation;
  if (n && !n.done) {
    const c = state.customers.find((x) => x.id === n.customerId);
    // Stepping away mid-negotiation: they wait a little longer, but lose some goodwill.
    if (c) {
      c.status = 'waiting';
      c.patience = Math.max(1, n.patienceLeft);
      c.leaveHour = Math.max(c.leaveHour, state.day * 24 + state.hour + 1);
    }
  }
  state.negotiation = undefined;
}
