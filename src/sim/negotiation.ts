/**
 * Interactive negotiation between the player and a customer.
 *
 * The customer has a hidden willingness to pay (wtp). The player sees clues:
 * interest, a budget range whose width depends on analytics and staff, and the
 * customer's mood. Every counter that asks too much burns patience.
 */
import type { Customer, GameState, Negotiation, Vehicle } from './types';
import { ARCHETYPE_BY_ID } from '../data/game';
import { gameRng } from './rng';
import { clamp } from './util';
import { locationById, upgradeLevel, vehicleName } from './state';
import { lotStats } from './lot';
import { bookValue, roundPrice, totalCost } from './market';
import { bestAt } from './staff';
import { completeSale, SaleResult } from './sales';
import { EXTRA_DEFS } from './sales';

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
  return (s ? s.skill / 2200 : 0) + boost;
}

export function effectiveWtp(state: GameState, n: Negotiation, c: Customer, v: Vehicle): number {
  return Math.round(c.wtp * (1 + n.mood * 0.035 + coachBonus(state, v)));
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
  const opening = Math.min(v.askingPrice, round50(c.wtp * (0.8 + (1 - c.negotiation) * 0.1)));
  const n: Negotiation = {
    customerId: c.id,
    vehicleId: v.id,
    round: 0,
    patienceLeft: c.patience,
    lastCustomerOffer: opening,
    lastPlayerPrice: v.askingPrice,
    extras: { warranty: false, service: false, accessory: false, finance: false },
    tradeInIncluded: false,
    log: [],
    mood: 0,
    done: false,
  };
  const a = ARCHETYPE_BY_ID[c.archetype];
  n.log.push({ who: 'system', text: `${c.name} (${a.name}) is looking at the ${vehicleName(v)}, listed at €${v.askingPrice.toLocaleString('en-GB')}.` });
  if (opening >= v.askingPrice) {
    n.log.push({ who: 'them', text: `I like it. I'll pay the asking price — €${v.askingPrice.toLocaleString('en-GB')}.` });
  } else {
    const lines = [
      `Nice car. Would you take €${opening.toLocaleString('en-GB')}?`,
      `I've seen similar ones cheaper. €${opening.toLocaleString('en-GB')} and we have a deal.`,
      `My budget is tight — I can do €${opening.toLocaleString('en-GB')}.`,
    ];
    n.log.push({ who: 'them', text: gameRng.pick(lines) });
  }
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
    const err = [0.18, 0.12, 0.06][tc] ?? 0.18;
    out.tradeInValue = book;
    out.tradeInLow = roundPrice(book * (1 - err));
    out.tradeInHigh = roundPrice(book * (1 + err * 0.6));
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
  const wtp = effectiveWtp(state, n, c, v);
  if (offer <= wtp) {
    say(n, 'them', offer <= n.lastCustomerOffer * 1.01 ? 'Deal!' : gameRng.pick(['Alright, you have a deal.', 'Fine — let\'s do it.', 'OK, shake on it.']));
    const sale = finish(state, offer);
    return { outcome: 'accepted', sale };
  }
  const gap = (offer - wtp) / Math.max(1, wtp);
  n.patienceLeft -= gap > 0.15 ? 2 : 1;
  n.mood = clamp(n.mood - (gap > 0.15 ? 0.3 : 0.12), -1, 1);
  if (n.patienceLeft <= 0) {
    say(n, 'them', gameRng.pick(['We are too far apart. I\'ll look elsewhere.', 'Forget it. Thanks for your time.', 'That\'s not happening. Goodbye.']));
    endWalk(state);
    return { outcome: 'walked' };
  }
  // Close to a deal, some customers ask for a sweetener instead of a discount.
  if (gap <= 0.07 && !n.request && gameRng.chance(0.35)) {
    const extra = !n.extras.service ? 'service' : !n.extras.accessory ? 'accessory' : undefined;
    if (extra) {
      n.request = { extra, price: Math.min(offer, Math.round(wtp / 50) * 50) };
      say(n, 'them', `Throw in the ${extra === 'service' ? 'service plan' : 'accessory pack'} for free and I'll pay €${n.request.price.toLocaleString('en-GB')}.`);
      return { outcome: 'countered' };
    }
  }
  const step = 0.35 + (1 - c.negotiation) * 0.3;
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
  say(n, 'you', `Deal — ${req.extra === 'service' ? 'service plan' : 'accessory pack'} on the house.`);
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

/** Adds or removes an extra; the customer reacts. */
export function toggleExtra(state: GameState, key: 'warranty' | 'service' | 'accessory' | 'finance'): string {
  const p = negotiationParties(state);
  if (!p) return '';
  const { n, c, v } = p;
  if (n.extras[key]) {
    n.extras[key] = false;
    return 'Removed.';
  }
  if (key === 'finance') {
    const loc = locationById(state, v.locationId);
    if (!loc || upgradeLevel(loc, 'finance') === 0) return 'You need a Finance Desk to offer finance.';
  }
  const affinity = ARCHETYPE_BY_ID[c.archetype].extrasAffinity;
  const chance = key === 'finance' ? 0.35 + (1 - c.budget / 80000) * 0.3 : affinity * (key === 'warranty' ? 1 : 0.8) + 0.1;
  if (!gameRng.chance(clamp(chance, 0.05, 0.95))) {
    // Pushing extras on someone who does not want them costs a little goodwill.
    n.mood = clamp(n.mood - 0.08, -1, 1);
    say(n, 'you', `How about adding the ${label(key)}?`);
    say(n, 'them', gameRng.pick(['No thanks, just the car.', 'I don\'t need that.', 'Let\'s keep it simple.']));
    return `${c.name.split(' ')[0]} is not interested.`;
  }
  n.extras[key] = true;
  n.mood = clamp(n.mood + 0.15, -1, 1);
  say(n, 'you', `I'll include the ${label(key)}.`);
  say(n, 'them', gameRng.pick(['That sounds good, actually.', 'Oh, that helps.', 'Nice — I was worried about that.']));
  return 'Added to the deal.';
}

function label(key: string): string {
  return key === 'warranty' ? EXTRA_DEFS.warranty.name.toLowerCase() : key === 'service' ? 'service plan' : key === 'accessory' ? 'accessory pack' : 'finance package';
}

/** Player makes a trade-in offer. */
export function tradeInOffer(state: GameState, amount: number): string {
  const p = negotiationParties(state);
  if (!p || !p.c.tradeIn) return '';
  const { n, c } = p;
  const expect = c.tradeInExpectation ?? 0;
  n.tradeInOffer = Math.max(0, Math.round(amount));
  say(n, 'you', `For your ${vehicleName(c.tradeIn!)} I can give you €${n.tradeInOffer.toLocaleString('en-GB')}.`);
  const ratio = n.tradeInOffer / Math.max(1, expect);
  if (ratio >= 0.93) {
    n.tradeInIncluded = true;
    n.mood = clamp(n.mood + (ratio >= 1 ? 0.3 : 0.1), -1, 1);
    // A generous allowance makes the car price easier to swallow.
    if (ratio > 1) c.wtp = Math.round(c.wtp + (n.tradeInOffer - expect) * 0.5);
    say(n, 'them', ratio >= 1 ? 'That\'s more than fair!' : 'OK, I can live with that.');
    return 'Trade-in accepted.';
  }
  if (ratio >= 0.8) {
    n.tradeInIncluded = true;
    n.mood = clamp(n.mood - 0.12, -1, 1);
    c.wtp = Math.round(c.wtp - (expect - n.tradeInOffer) * 0.35);
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

function finish(state: GameState, price: number): SaleResult | undefined {
  const p = negotiationParties(state);
  if (!p) return undefined;
  const { n, c, v } = p;
  const trade = n.tradeInIncluded && c.tradeIn && n.tradeInOffer !== undefined ? { vehicle: c.tradeIn, allowance: n.tradeInOffer } : undefined;
  const result = completeSale(state, v, c, price, n.extras, { byStaff: false, patienceUsed: c.patience - n.patienceLeft, tradeIn: trade, freeExtra: n.freeExtra });
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
