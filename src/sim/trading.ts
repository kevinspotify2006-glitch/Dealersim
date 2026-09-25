/**
 * Buying and handling stock: market offers, auctions, haggling, arrivals,
 * listing, pricing, transfers and quick wholesale disposal.
 */
import type { GameState, SourceId, Vehicle } from './types';
import { SOURCES, SOURCE_BY_ID } from '../data/game';
import { gameRng } from './rng';
import { clamp } from './util';
import { activeLocation, freeSpaces, locationById, pushNotice, vehicleName } from './state';
import { roundPrice, suggestedPrice, totalCost, trueValue, marketMods } from './market';
import { arrivalInspection, createOffer, showSpaceFor, transportCost } from './vehicles';
import { assignSlots, lotStats } from './lot';
import { logisticsFactor } from './buildplus';
import { record, bookSaleProfit } from './finance';

/** Reputation needed before a source will deal with you. */
export const SOURCE_REP: Partial<Record<SourceId, number>> = { network: 55, special: 45, importer: 40 };

export function sourceUnlocked(state: GameState, id: SourceId): boolean {
  const s = SOURCE_BY_ID[id];
  if (id === 'manufacturer') return (state.contracts ?? []).length > 0;
  return !!s && state.companyLevel >= s.minLevel && state.reputation >= (SOURCE_REP[id] ?? 0);
}

/** Relationship with a purchase channel grows with every car you buy there. */
export function supplierRelation(state: GameState, id: SourceId): number {
  return state.suppliers?.[id] ?? 50;
}

/** Keeps the market stocked: expires old offers, adds new ones. */
export function refreshOffers(state: GameState, full = false): void {
  const mods = marketMods(state);
  state.offers = state.offers.filter((o) => (o.expiresDay ?? 0) >= state.day && !(o.auction && (o.expiresDay ?? 0) < state.day));
  const buyers = state.employees.filter((e) => e.role === 'buyer').length;
  const central = (state.group?.departments.inventory ?? 0) >= 2 ? 1.2 : 1;
  // New cars from each brand you hold a contract for.
  for (const c of state.contracts ?? []) {
    const target = 2 + c.tier * 2;
    const have = state.offers.filter((o) => o.source === 'manufacturer' && o.brandId === c.brandId).length;
    const add = full ? target - have : Math.min(target - have, 2);
    for (let i = 0; i < add; i += 1) state.offers.push(createOffer(state, 'manufacturer', c.locationId, c.brandId));
  }
  state.offers = state.offers.filter((o) => o.source !== 'manufacturer' || (state.contracts ?? []).some((c) => c.brandId === o.brandId));
  for (const s of SOURCES) {
    if (s.id === 'manufacturer' || !sourceUnlocked(state, s.id)) continue;
    const rel = supplierRelation(state, s.id);
    const target = Math.round(s.offers * mods.supply * (1 + buyers * 0.25) * (1 + (state.companyLevel - 1) * 0.12) * (0.85 + rel / 330) * central);
    const have = state.offers.filter((o) => o.source === s.id).length;
    const add = full ? target - have : Math.min(target - have, Math.max(1, Math.round(target / 3)));
    for (let i = 0; i < add; i += 1) state.offers.push(createOffer(state, s.id, state.activeLocationId));
  }
}

export function confirmThreshold(state: GameState): number {
  return state.settings.confirmBigSpend;
}

/** Buys a fixed-price offer. */
export function buyOffer(state: GameState, offerId: string, locationId = state.activeLocationId, priceOverride?: number): { ok: boolean; message: string } {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, message: 'That offer is gone.' };
  if (o.auction) return { ok: false, message: 'This is an auction lot — place a bid instead.' };
  const loc = locationById(state, locationId) ?? activeLocation(state);
  if (freeSpaces(state, loc.id) <= 0) return { ok: false, message: `${loc.name} is full. Sell something or build more parking spaces.` };
  const price = priceOverride ?? o.offerPrice;
  const transport = Math.round(transportCost(o.source, o) * logisticsFactor(loc));
  if (state.cash < price + transport) return { ok: false, message: 'Not enough cash for the car plus transport.' };
  acquire(state, o, price, transport, loc.id);
  return { ok: true, message: `Bought ${vehicleName(o)} for €${price.toLocaleString('en-GB')}. Arrives in ${Math.max(0, o.arrivalDay - state.day)} day(s).` };
}

function acquire(state: GameState, o: Vehicle, price: number, transport: number, locationId: string): void {
  state.offers = state.offers.filter((x) => x.id !== o.id);
  record(state, 'Vehicle purchase', -price, `Bought ${vehicleName(o)} (${SOURCE_BY_ID[o.source as SourceId]?.name ?? o.source})`, locationId);
  if (transport > 0) record(state, 'Transport', -transport, `Transport: ${vehicleName(o)}`, locationId);
  const s = SOURCE_BY_ID[o.source as SourceId];
  o.purchasePrice = price;
  o.costs.transport = transport;
  o.locationId = locationId;
  o.boughtDay = state.day;
  o.arrivalDay = state.day + (s ? gameRng.int(s.arrivalDays[0], s.arrivalDays[1]) : 1);
  // A delivery entrance and unloading bays: transporters drop cars off a day sooner.
  const dest = locationById(state, locationId);
  if (dest && (lotStats(dest.lot).effects.logistics ?? 0) >= 2 && o.arrivalDay > state.day + 1) o.arrivalDay -= 1;
  o.status = 'transit';
  o.auction = undefined;
  o.expiresDay = undefined;
  state.vehicles.push(o);
  state.stats.vehiclesBought += 1;
  if (o.category === 'Classic' || o.category === 'Rare') state.stats.rareBought = (state.stats.rareBought ?? 0) + 1;
  if (state.suppliers) state.suppliers[o.source] = clamp((state.suppliers[o.source] ?? 50) + 1.5, 0, 100);
}

/** Haggle with a private or wholesale seller. One attempt per offer. */
export function haggle(state: GameState, offerId: string, price: number): { ok: boolean; accepted: boolean; message: string; counter?: number } {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o || o.auction) return { ok: false, accepted: false, message: 'Cannot haggle on this.' };
  const flag = o;
  if ((flag.haggled ?? 0) >= 2) return { ok: false, accepted: false, message: 'The seller will not negotiate any further.' };
  flag.haggled = (flag.haggled ?? 0) + 1;
  const buyers = state.employees.filter((e) => e.role === 'buyer');
  const skill = buyers.reduce((m, e) => Math.max(m, e.skill, e.skills?.negotiation ?? 0), 0);
  const flexibility = o.source === 'private' ? 0.1 : o.source === 'wholesale' || o.source === 'fleet' ? 0.05 : o.source === 'manufacturer' ? 0.015 : 0.04;
  // Loyal customers of a supplier get a little more room; volume buyers too.
  const rel = (supplierRelation(state, o.source) - 50) / 2000;
  const volume = Math.min(0.02, state.offers.length ? state.vehicles.filter((v) => v.source === o.source && v.boughtDay >= state.day - 30).length * 0.004 : 0);
  const reservation = roundPrice(o.offerPrice * (1 - flexibility * gameRng.range(0.4, 1) - skill / 2500 - rel - volume));
  if (price >= reservation) {
    o.offerPrice = Math.round(price);
    return { ok: true, accepted: true, message: `Seller accepts €${Math.round(price).toLocaleString('en-GB')}.` };
  }
  if (price < o.offerPrice * 0.75) {
    flag.haggled = 2;
    if (state.suppliers) state.suppliers[o.source] = clamp((state.suppliers[o.source] ?? 50) - 2, 0, 100);
    return { ok: true, accepted: false, message: 'The seller is offended and will not negotiate further.' };
  }
  const counter = roundPrice((reservation + o.offerPrice) / 2);
  o.offerPrice = Math.min(o.offerPrice, counter);
  return { ok: true, accepted: false, message: `Seller counters at €${counter.toLocaleString('en-GB')}.`, counter };
}

/** Places a maximum bid on an auction lot; resolved when the auction closes. */
export function placeBid(state: GameState, offerId: string, maxBid: number): { ok: boolean; message: string } {
  const o = state.offers.find((x) => x.id === offerId);
  if (!o || !o.auction) return { ok: false, message: 'Not an auction lot.' };
  const minBid = o.auction.currentBid + (o.auction.currentBid < 10000 ? 100 : 250);
  if (maxBid < minBid) return { ok: false, message: `Minimum bid is €${minBid.toLocaleString('en-GB')}.` };
  const committed = state.offers.filter((x) => x.auction && x.auction.myBid > 0 && x.id !== o.id).reduce((s, x) => s + (x.auction?.myBid ?? 0), 0);
  if (state.cash - committed < maxBid) return { ok: false, message: 'You cannot cover this bid alongside your other bids.' };
  if (freeSpaces(state, state.activeLocationId) <= 0) return { ok: false, message: 'No space on the lot for another vehicle.' };
  o.auction.myBid = Math.round(maxBid);
  o.auction.currentBid = minBid;
  o.auction.bids += 1;
  return { ok: true, message: `Max bid of €${o.auction.myBid.toLocaleString('en-GB')} placed. Lot closes ${o.expiresDay === state.day ? 'tonight' : `in ${(o.expiresDay ?? state.day) - state.day} day(s)`}.` };
}

/** Resolves closing auctions (called at end of day). */
export function resolveAuctions(state: GameState): void {
  const closing = state.offers.filter((o) => o.auction && (o.expiresDay ?? 0) <= state.day);
  for (const o of closing) {
    const a = o.auction!;
    // Rival dealers bid up to a value drawn around the reserve.
    const rival = roundPrice(a.reserve * gameRng.range(0.85, 1.18));
    if (a.myBid > 0) {
      if (a.myBid >= rival && a.myBid >= a.reserve * 0.92) {
        const price = Math.min(a.myBid, Math.max(a.currentBid, rival + (rival < 10000 ? 100 : 250)));
        const loc = freeSpaces(state, state.activeLocationId) > 0 ? state.activeLocationId : state.locations.find((l) => freeSpaces(state, l.id) > 0)?.id;
        const transport = Math.round(transportCost(o.source, o) * logisticsFactor(loc ? locationById(state, loc) : undefined));
        if (loc && state.cash >= price + transport) {
          acquire(state, o, price, transport, loc);
          pushNotice(state, 'good', `🔨 Won the auction: ${vehicleName(o)} for €${price.toLocaleString('en-GB')}.`);
        } else {
          pushNotice(state, 'bad', `🔨 Won ${vehicleName(o)} but could not pay or park it. The lot was re-sold.`);
          state.offers = state.offers.filter((x) => x.id !== o.id);
        }
      } else {
        pushNotice(state, 'info', `🔨 Outbid on ${vehicleName(o)} (hammer price €${rival.toLocaleString('en-GB')}).`);
        state.offers = state.offers.filter((x) => x.id !== o.id);
      }
    } else {
      state.offers = state.offers.filter((x) => x.id !== o.id);
    }
  }
  // Open lots creep up as other dealers bid.
  for (const o of state.offers) {
    if (!o.auction) continue;
    if (gameRng.chance(0.6)) {
      o.auction.currentBid = roundPrice(Math.min(o.auction.reserve * 1.05, o.auction.currentBid * gameRng.range(1.04, 1.15)));
      o.auction.bids += gameRng.int(1, 3);
    }
  }
}

/** Morning: vehicles in transit arrive and get a basic look-over. */
export function arrivalsDaily(state: GameState): void {
  for (const v of state.vehicles) {
    if (v.status === 'transit' && v.arrivalDay <= state.day) {
      v.status = 'yard';
      const found = arrivalInspection(state, v);
      v.askingPrice = suggestedPrice(state, v);
      v.floorPrice = roundPrice(v.askingPrice * 0.92);
      pushNotice(state, found.length ? 'bad' : 'good',
        `${vehicleName(v)} arrived at ${locationById(state, v.locationId)?.name ?? 'the lot'}.${found.length ? ` Found: ${found.map((f) => f.name).join(', ')}.` : ''}`);
    }
    if (v.status === 'transfer' && v.arrivalDay <= state.day && v.transferTo) {
      v.locationId = v.transferTo;
      v.transferTo = undefined;
      v.status = 'yard';
      pushNotice(state, 'info', `${vehicleName(v)} arrived at ${locationById(state, v.locationId)?.name}.`);
    }
    if (v.status === 'listed' || v.status === 'yard' || v.status === 'prep') v.daysInStock += 1;
  }
  for (const loc of state.locations) assignSlots(state, loc);
}

export function listVehicle(state: GameState, id: string, online = true): { ok: boolean; message: string } {
  const v = state.vehicles.find((x) => x.id === id);
  if (!v) return { ok: false, message: 'Unknown vehicle.' };
  if (v.status !== 'yard') return { ok: false, message: v.status === 'prep' ? 'Still being prepared.' : v.status === 'transit' ? 'Not arrived yet.' : 'Cannot list right now.' };
  const loc = locationById(state, v.locationId);
  const spot = loc ? showSpaceFor(state, loc, v) : undefined;
  if (!loc || !spot) return { ok: false, message: 'No free parking space or display where customers could see it. Build more spaces, or move a car into storage.' };
  if (v.askingPrice <= 0) v.askingPrice = suggestedPrice(state, v);
  if (v.floorPrice <= 0 || v.floorPrice > v.askingPrice) v.floorPrice = roundPrice(v.askingPrice * 0.92);
  v.slotId = spot;
  v.status = 'listed';
  v.listedOnline = online;
  return { ok: true, message: `${vehicleName(v)} is on sale for €${v.askingPrice.toLocaleString('en-GB')}.` };
}

export function unlistVehicle(state: GameState, id: string): { ok: boolean; message: string } {
  const v = state.vehicles.find((x) => x.id === id);
  if (!v || v.status !== 'listed') return { ok: false, message: 'Not listed.' };
  if (state.customers.some((c) => c.vehicleId === id && c.status === 'negotiating')) return { ok: false, message: 'A customer is negotiating for it right now.' };
  v.status = 'yard';
  v.listedOnline = false;
  return { ok: true, message: 'Taken off sale.' };
}

export function setPrice(state: GameState, id: string, asking: number, floor?: number): { ok: boolean; message: string } {
  const v = state.vehicles.find((x) => x.id === id);
  if (!v) return { ok: false, message: 'Unknown vehicle.' };
  const a = Math.round(clamp(asking, 100, 5_000_000));
  v.askingPrice = a;
  if (floor !== undefined) v.floorPrice = Math.round(clamp(floor, 0, a));
  else if (v.floorPrice > a) v.floorPrice = roundPrice(a * 0.92);
  return { ok: true, message: `Price set to €${a.toLocaleString('en-GB')}.` };
}

export function toggleOnline(state: GameState, id: string): void {
  const v = state.vehicles.find((x) => x.id === id);
  if (v && v.status === 'listed') v.listedOnline = !v.listedOnline;
}

/** Wholesale price a trader will pay today — the emergency exit. */
export function wholesalePrice(state: GameState, v: Vehicle): number {
  return roundPrice(trueValue(state, v) * 0.8);
}

export function quickSell(state: GameState, id: string): { ok: boolean; message: string; profit?: number } {
  const v = state.vehicles.find((x) => x.id === id);
  if (!v) return { ok: false, message: 'Unknown vehicle.' };
  if (v.status === 'transit' || v.status === 'transfer') return { ok: false, message: 'Wait until it arrives.' };
  if (state.customers.some((c) => c.vehicleId === id && c.status === 'negotiating')) return { ok: false, message: 'A customer is negotiating for it.' };
  const price = wholesalePrice(state, v);
  const profit = price - totalCost(v);
  record(state, 'Vehicle sale', price, `Sold to trade: ${vehicleName(v)}`, v.locationId);
  bookSaleProfit(state, profit, v.locationId);
  v.status = 'sold';
  v.soldPrice = price;
  v.soldDay = state.day;
  v.soldTo = 'Trade buyer';
  state.vehicles = state.vehicles.filter((x) => x.id !== id);
  state.soldArchive.unshift(v);
  state.customers = state.customers.filter((c) => c.vehicleId !== id || c.status === 'bought');
  state.today.sold += 1;
  state.month.sold += 1;
  state.stats.sold += 1;
  state.stats.lifetimeRevenue += price;
  state.stats.lifetimeProfit += profit;
  return { ok: true, message: `Sold to a trade buyer for €${price.toLocaleString('en-GB')} (${profit >= 0 ? '+' : ''}€${profit.toLocaleString('en-GB')}).`, profit };
}

export function transferVehicle(state: GameState, id: string, toLocationId: string): { ok: boolean; message: string } {
  const v = state.vehicles.find((x) => x.id === id);
  const to = locationById(state, toLocationId);
  if (!v || !to) return { ok: false, message: 'Unknown vehicle or location.' };
  if (v.locationId === toLocationId) return { ok: false, message: 'Already there.' };
  if (v.status !== 'yard' && v.status !== 'listed') return { ok: false, message: 'Only vehicles on the lot can be moved.' };
  if (state.customers.some((c) => c.vehicleId === id && c.status === 'negotiating')) return { ok: false, message: 'A customer is negotiating for it.' };
  if (freeSpaces(state, toLocationId) <= 0) return { ok: false, message: `${to.name} is full.` };
  const cost = 180;
  if (state.cash < cost) return { ok: false, message: 'Transfer costs €180.' };
  record(state, 'Transport', -cost, `Transfer ${vehicleName(v)} to ${to.name}`, v.locationId);
  v.costs.transport += cost;
  v.status = 'transfer';
  v.listedOnline = false;
  v.slotId = undefined;
  v.transferTo = toLocationId;
  v.arrivalDay = state.day + 1;
  return { ok: true, message: `${vehicleName(v)} is on a truck to ${to.name} (arrives tomorrow).` };
}

/** Expected margin at suggested price, for UI hints. */
export function expectedMargin(state: GameState, v: Vehicle, price: number): { profit: number; pct: number } {
  const cost = v.status === 'offer' ? price + 250 : totalCost(v);
  const retail = suggestedPrice(state, v);
  const profit = retail - cost;
  return { profit, pct: profit / Math.max(1, cost) };
}

export function offerPotential(state: GameState, o: Vehicle): { retail: number; profit: number; label: string; tone: 'good' | 'info' | 'warn' | 'bad' } {
  const price = o.auction ? Math.max(o.auction.currentBid, o.auction.myBid) : o.offerPrice;
  const retail = suggestedPrice(state, o);
  const profit = retail - price - 450;
  const pct = profit / Math.max(1, price);
  const label = pct > 0.3 ? 'Excellent' : pct > 0.17 ? 'Good' : pct > 0.07 ? 'Fair' : pct > 0 ? 'Thin' : 'Loss';
  const tone = pct > 0.17 ? 'good' : pct > 0.07 ? 'info' : pct > 0 ? 'warn' : 'bad';
  return { retail, profit, label, tone };
}
