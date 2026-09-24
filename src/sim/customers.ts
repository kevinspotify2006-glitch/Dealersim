/**
 * Customers: how many come, who they are, what they want, and what happens if
 * nobody talks to them.
 */
import type { ArchetypeId, Customer, GameState, Location, Vehicle } from './types';
import { ARCHETYPES, ARCHETYPE_BY_ID, CHANNEL_BY_ID, CITY_BY_ID, FIRST_NAMES, LAST_NAMES, STRATEGY_BY_ID } from '../data/game';
import { gameRng } from './rng';
import { clamp } from './util';
import { yearOf, seasonOf } from './format';
import { CLOSE_HOUR, OPEN_HOUR, absHour, locationById, nextId, pushNotice, upgradeLevel, vehicleName } from './state';
import { demandScore, marketMods, trueValue } from './market';
import { appealScore, generateVehicle, listingQuality } from './vehicles';
import { bestAt, effectiveSkill } from './staff';
import { completeSale } from './sales';
import { roundPrice, bookValue } from './market';
import { emit } from './bus';
import { competitorPressure } from './world';
import { lotStats, spotBonus } from './lot';
import { MANUFACTURERS } from '../data/vehicles';

/** Can customers actually walk up to this car? */
export function onShow(state: GameState, v: Vehicle): boolean {
  if (v.status !== 'listed' || !v.slotId) return false;
  const loc = locationById(state, v.locationId);
  return !!loc && lotStats(loc.lot).reachable.has(v.slotId);
}

/** How many visiting customers a day can park: a few on the street, four per visitor space. */
export function visitorCapacity(loc: Location): number {
  return 6 + (lotStats(loc.lot).effects.visitorParking ?? 0) * 4;
}

/** How the physical layout changes walk-in traffic (0 when nobody can get in). */
export function layoutFootfall(loc: Location): number {
  const ls = lotStats(loc.lot);
  if (!ls.entrance || !loc.lot.open) return 0;
  const signs = 1 + Math.min(3, ls.effects.footfall ?? 0) * 0.07 + Math.min(8, ls.effects.curb ?? 0) * 0.025;
  return (0.4 + ls.flow * 0.5) * signs;
}

export function listedAt(state: GameState, locationId: string): Vehicle[] {
  return state.vehicles.filter((v) => v.status === 'listed' && v.locationId === locationId);
}

/** Expected walk-ins + online leads per day at a location. */
export function expectedLeads(state: GameState, loc: Location): { walkIn: number; online: number; total: number } {
  const city = CITY_BY_ID[loc.cityId];
  const listed = listedAt(state, loc.id).filter((v) => onShow(state, v));
  const mods = marketMods(state);
  const layout = layoutFootfall(loc);
  if (layout <= 0) return { walkIn: 0, online: 0, total: 0 };
  const rep = (0.45 + ((state.reputation + loc.reputation) / 2) / 90);
  const stock = listed.length === 0 ? 0.25 : 0.45 + Math.sqrt(listed.length) * 0.36;
  const showroom = 1 + upgradeLevel(loc, 'showroom') * 0.04;
  const season = seasonOf(state.day);
  const seasonMult = season === 'Spring' ? 1.08 : season === 'Summer' ? 1.02 : season === 'Winter' ? 0.9 : 1;
  let campaign = 0;
  for (const c of state.campaigns) {
    if (c.locationId !== loc.id || state.day > c.endDay) continue;
    const def = CHANNEL_BY_ID[c.channelId];
    if (def) campaign += def.leadBoost;
  }
  const mkStaff = state.employees.filter((e) => e.role === 'marketing' && e.locationId === loc.id).reduce((m, e) => Math.max(m, e.skill), 0);
  campaign *= 1 + mkStaff / 200;
  const pressure = 1 - competitorPressure(state, loc.cityId) * 0.35;
  const focus = STRATEGY_BY_ID[loc.strategy ?? 'balanced'];
  let walkIn = focus.footfall * 1.5 * city.demand * rep * stock * showroom * seasonMult * mods.demand * pressure * (1 + campaign) * layout;
  // Visitors need somewhere to park: the street takes a few, visitor parking the rest.
  const parkingCap = visitorCapacity(loc);
  if (walkIn > parkingCap) walkIn = parkingCap + (walkIn - parkingCap) * 0.35;
  let online = 0;
  const marketingUp = 1 + upgradeLevel(loc, 'marketing') * [0, 0.15, 0.3, 0.5][Math.min(3, upgradeLevel(loc, 'marketing'))];
  let quality = 0;
  for (const v of listed) if (v.listedOnline) quality += listingQuality(state, v);
  online = Math.sqrt(quality) * 0.6;
  online *= marketingUp * mods.demand * pressure * (1 + campaign * 0.5);
  return { walkIn, online, total: walkIn + online };
}

function pickArchetype(state: GameState, loc: Location, campaignMix?: Partial<Record<ArchetypeId, number>>): ArchetypeId {
  const city = CITY_BY_ID[loc.cityId];
  const weights = ARCHETYPES.map((a) => {
    let w = a.weight * (city.mix[a.id] ?? 1) * (campaignMix?.[a.id] ?? 1) * (STRATEGY_BY_ID[loc.strategy ?? 'balanced'].mix[a.id] ?? 1);
    if (state.challenge === 'ev' && a.id === 'ev') w *= 2.5;
    // Chargers on the lot draw electric-car buyers.
    if (a.id === 'ev') w *= 1 + Math.min(3, lotStats(loc.lot).effects.ev ?? 0) * 0.08;
    if (state.challenge === 'luxury' && (a.id === 'luxury' || a.id === 'enthusiast')) w *= 1.8;
    // Rich towns bring richer buyers once you have a reputation for it.
    if ((a.id === 'luxury' || a.id === 'enthusiast') && state.reputation < 45) w *= 0.6;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = gameRng.next() * total;
  for (let i = 0; i < ARCHETYPES.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return ARCHETYPES[i].id;
  }
  return ARCHETYPES[0].id;
}

/** How well a vehicle matches what a customer wants, 0..1 (0 = no interest). */
export function matchScore(state: GameState, c: Customer, v: Vehicle): number {
  if (v.askingPrice <= 0) return 0;
  const age = yearOf(state.day) - v.year;
  const classic = v.category === 'Classic' || v.category === 'Rare';
  let s = 0.2;
  if (c.categories.includes(v.category)) s += 0.3;
  if (c.bodies.includes(v.body)) s += 0.2;
  if (c.fuels.includes(v.fuel)) s += 0.12; else s -= 0.15;
  if (c.brandPref && c.brandPref === v.brandId) s += 0.12;
  if (!c.categories.includes(v.category) && !c.bodies.includes(v.body)) s -= 0.3;
  if (v.mileage > c.maxMileage) s -= 0.25;
  if (!classic && age > c.maxAge) s -= 0.25;
  // Price vs budget.
  const budgetRatio = v.askingPrice / c.budget;
  if (budgetRatio > 1.25) return 0;
  if (budgetRatio > 1.05) s -= (budgetRatio - 1.05) * 1.6;
  else if (budgetRatio < 0.35) s -= 0.15; // too cheap for them
  // Price vs value.
  const value = trueValue(state, v);
  const priceRatio = v.askingPrice / Math.max(1, value);
  s -= clamp((priceRatio - 1.08) * c.priceSensitivity * 1.4, -0.12, 0.6);
  s += (appealScore(state, v) - 0.5) * 0.3;
  s += (demandScore(state, v) - 0.5) * 0.2;
  if (v.daysInStock > 60) s -= 0.08;
  return clamp(s, 0, 1);
}

function customerName(): string {
  return `${gameRng.pick(FIRST_NAMES)} ${gameRng.pick(LAST_NAMES)}`;
}

/** Willingness to pay for a specific vehicle (hidden from the player). */
export function computeWtp(state: GameState, c: Customer, v: Vehicle, interest: number): number {
  const loc = locationById(state, v.locationId);
  const value = trueValue(state, v);
  const showroom = loc ? upgradeLevel(loc, 'showroom') : 0;
  const haggler = (state.legacy.perks.haggler ?? 0) * 0.02;
  let f = 0.9 + interest * 0.12 + (v.presentation - 60) / 1100 + (state.reputation - 50) / 600 + c.urgency * 0.04 - c.priceSensitivity * 0.05;
  f += [0, 0, 0.01, 0.02, 0.03, 0.04][showroom] ?? 0;
  if (loc) {
    // Where the car stands matters: a lit display, a premium podium for a premium car, a charger for an EV.
    f += spotBonus(loc, v).wtp;
    if (v.fuel === 'Electric' && (lotStats(loc.lot).effects.ev ?? 0) > 0) f += 0.02;
  }
  f += haggler;
  f += gameRng.range(-0.035, 0.035);
  let budget = c.budget;
  if (loc && upgradeLevel(loc, 'finance') >= 2) budget *= 1 + (upgradeLevel(loc, 'finance') - 1) * 0.08;
  const wtp = Math.min(budget * 1.02, value * f);
  return Math.round(wtp / 10) * 10;
}

export function createCustomer(state: GameState, loc: Location, arrivalHour: number, channel: string, campaignId?: string): Customer {
  const campaign = campaignId ? state.campaigns.find((c) => c.id === campaignId) : undefined;
  const mix = campaign ? CHANNEL_BY_ID[campaign.channelId]?.mix : undefined;
  const archetypeId = pickArchetype(state, loc, mix);
  const a = ARCHETYPE_BY_ID[archetypeId];
  const city = CITY_BY_ID[loc.cityId];
  const mods = marketMods(state);
  const economy = mods.demand < 1 ? 0.92 : 1;
  const budget = Math.round(gameRng.range(a.budget[0], a.budget[1]) * city.wealth * economy / 100) * 100;
  const lounge = upgradeLevel(loc, 'lounge');
  const ls = lotStats(loc.lot);
  const reception = (ls.effects.reception ?? 0) > 0 ? 1 : 0;
  const facilities = Math.min(4, ls.effects.facilities ?? 0);
  const pleasing = Math.min(12, ls.effects.satisfaction ?? 0) + facilities * 1.5;
  const patience = clamp(gameRng.int(a.patience[0], a.patience[1]) + (lounge >= 3 ? 2 : lounge >= 1 ? 1 : 0), 1, 8);
  const brandPref = gameRng.chance(0.25) ? gameRng.pick(MANUFACTURERS.map((m) => m.id)) : undefined;
  const c: Customer = {
    id: nextId(state, 'c'),
    name: customerName(),
    archetype: archetypeId,
    budget,
    bodies: a.bodies,
    categories: a.categories,
    fuels: a.fuels,
    brandPref,
    maxMileage: a.maxMileage,
    maxAge: a.minYearAge,
    priceSensitivity: a.priceSensitivity,
    patience,
    negotiation: gameRng.range(a.negotiation[0], a.negotiation[1]),
    urgency: gameRng.next(),
    interest: 0,
    wtp: 0,
    locationId: loc.id,
    arrivedDay: state.day,
    expiresDay: state.day,
    channel,
    campaignId,
    arrivalHour,
    leaveHour: arrivalHour + gameRng.int(2, 4) + (lounge >= 2 ? 1 : 0) + reception + (facilities >= 2 ? 1 : 0) - (ls.flow < 0.4 ? 1 : 0),
    satisfactionBonus: lounge * 2 + Math.round((ls.flow - 0.6) * 8) + reception * 2 + Math.round(pleasing),
    status: 'scheduled',
  };
  // Trade-in
  const tradeChance = a.tradeInChance * (1 + upgradeLevel(loc, 'tradein') * 0.3);
  if (gameRng.chance(tradeChance)) {
    const t = generateVehicle(state, { source: 'tradein', locationId: loc.id, quality: -0.2 });
    // Trade-ins are usually cheaper than what they are buying.
    const tv = bookValue(state, t);
    if (tv < budget * 1.1) {
      t.status = 'offer';
      c.tradeIn = t;
      c.tradeInExpectation = roundPrice(trueValue(state, t) * gameRng.range(0.76, 0.94));
    }
  }
  return c;
}

/** Schedules today's arrivals for every location. */
export function scheduleArrivals(state: GameState): void {
  for (const loc of state.locations) {
    const leads = expectedLeads(state, loc);
    const walkIns = poisson(leads.walkIn);
    const online = poisson(leads.online);
    const active = state.campaigns.filter((c) => c.locationId === loc.id && state.day <= c.endDay);
    const makeOne = (channel: string): void => {
      const hour = state.day * 24 + gameRng.int(OPEN_HOUR, CLOSE_HOUR - 1);
      let campaignId: string | undefined;
      if (active.length && gameRng.chance(0.45)) campaignId = gameRng.pick(active).id;
      const c = createCustomer(state, loc, hour, channel, campaignId);
      state.customers.push(c);
    };
    for (let i = 0; i < walkIns; i += 1) makeOne('Walk-in');
    // The very first customer of a new game arrives mid-morning on day one and
    // wants what is on the lot, so the first session always has a sale to make.
    if (state.stats.customersTotal === 0 && state.day <= 2 && loc.id === state.locations[0].id) {
      const car = listedAt(state, loc.id)[0];
      if (car) {
        const c = createCustomer(state, loc, state.day * 24 + (state.day === 1 ? 10 : 9), 'Walk-in');
        c.categories = [...new Set([...c.categories, car.category])];
        c.bodies = [...new Set([...c.bodies, car.body])];
        c.fuels = [...new Set([...c.fuels, car.fuel])];
        c.budget = Math.max(c.budget, Math.round(car.askingPrice * 1.15 / 100) * 100);
        c.maxMileage = Math.max(c.maxMileage, car.mileage + 10000);
        c.maxAge = Math.max(c.maxAge, 30);
        c.patience = Math.max(c.patience, 4);
        c.tradeIn = undefined;
        state.customers.push(c);
      }
    }
    for (let i = 0; i < online; i += 1) makeOne('Online');
    loc.stats.leads += walkIns + online;
    loc.month.leads += walkIns + online;
    state.today.leads += walkIns + online;
  }
}

function poisson(mean: number): number {
  if (mean <= 0) return 0;
  const l = Math.exp(-Math.min(mean, 30));
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= gameRng.next();
  } while (p > l && k < 60);
  return k - 1;
}

function describeWant(c: Customer): string {
  const a = ARCHETYPE_BY_ID[c.archetype];
  const kind = c.categories.slice(0, 2).join('/');
  return `${kind} under €${Math.round(c.budget / 1000)}k${a.fuels.length === 1 ? `, ${a.fuels[0].toLowerCase()}` : ''}`;
}

/** Customer walks in: picks the vehicle they are after, or leaves disappointed. */
function arrive(state: GameState, c: Customer): void {
  const all = listedAt(state, c.locationId);
  const listed = all.filter((v) => onShow(state, v));
  state.stats.customersTotal += 1;
  if (c.campaignId) {
    const camp = state.campaigns.find((x) => x.id === c.campaignId);
    if (camp) camp.leads += 1;
  }
  const scored = listed
    .filter((v) => !state.customers.some((o) => o.vehicleId === v.id && (o.status === 'waiting' || o.status === 'negotiating')))
    // A car in a good spot gets noticed: its attention bonus nudges it up the list.
    .map((v) => { const loc = locationById(state, v.locationId); return { v, s: matchScore(state, c, v) + (loc ? spotBonus(loc, v).attention / 100 * 0.35 : 0) }; })
    .filter((x) => x.s > 0.3)
    .sort((a, b) => b.s - a.s);
  if (scored.length === 0) {
    c.status = 'left';
    const tooPricey = listed.some((v) => v.askingPrice > c.budget * 1.25 && (c.categories.includes(v.category) || c.bodies.includes(v.body)));
    state.lostLeads.unshift({
      day: state.day,
      archetype: c.archetype,
      reason: all.length > 0 && listed.length === 0 ? 'Could not get to the cars' : listed.length === 0 ? 'Nothing on the lot' : tooPricey ? 'Everything they liked was over budget' : 'Nothing that matched',
      wanted: describeWant(c),
      locationId: c.locationId,
    });
    if (state.lostLeads.length > 60) state.lostLeads.length = 60;
    return;
  }
  const pick = scored[Math.min(scored.length - 1, gameRng.chance(0.7) ? 0 : gameRng.int(0, Math.min(2, scored.length - 1)))];
  c.vehicleId = pick.v.id;
  c.interest = clamp(pick.s + gameRng.range(-0.05, 0.1), 0.2, 1);
  c.wtp = computeWtp(state, c, pick.v, c.interest);
  c.status = 'waiting';
  emit('customer', { customerId: c.id });
}

let handledDay = -1;
const handled: Record<string, number> = {};

/** Staff salesperson handles a customer nobody served. */
export function staffDeal(state: GameState, c: Customer): boolean {
  const v = state.vehicles.find((x) => x.id === c.vehicleId && x.status === 'listed');
  if (!v) return false;
  const seller = bestAt(state, c.locationId, 'sales');
  if (!seller) return false;
  // Each salesperson handles a limited number of customers per day.
  if (handledDay !== state.day) {
    handledDay = state.day;
    for (const k of Object.keys(handled)) delete handled[k];
  }
  const cap = 4 + Math.floor(seller.level / 2);
  if ((handled[seller.id] ?? 0) >= cap) {
    const others = state.employees.filter((e) => e.role === 'sales' && e.locationId === c.locationId && e.trainingDaysLeft <= 0 && (handled[e.id] ?? 0) < 4 + Math.floor(e.level / 2));
    if (others.length === 0) return false;
    return runStaffDeal(state, c, v, others.sort((a, b) => b.skill - a.skill)[0].id, handled);
  }
  return runStaffDeal(state, c, v, seller.id, handled);
}

function runStaffDeal(state: GameState, c: Customer, v: Vehicle, staffId: string, handled: Record<string, number>): boolean {
  const e = state.employees.find((x) => x.id === staffId);
  if (!e) return false;
  handled[staffId] = (handled[staffId] ?? 0) + 1;
  const le = locationById(state, c.locationId);
  const salesBoost = le ? Math.min(25, lotStats(le.lot).effects.sales ?? 0) / 100 : 0;
  const skill = effectiveSkill(e) * (1 + salesBoost);
  const wtp = c.wtp * (1 + skill / 1500) * (e.specialization === 'Closer' ? 1.02 : 1);
  const floor = v.floorPrice > 0 ? v.floorPrice : Math.round(v.askingPrice * 0.92);
  if (wtp < floor) {
    c.status = 'left';
    e.xp += 3;
    return false;
  }
  const achieved = Math.min(v.askingPrice, Math.round((floor + (wtp - floor) * (0.55 + skill / 250)) / 10) * 10);
  const price = Math.max(floor, achieved);
  const warranty = gameRng.chance(0.15 + skill / 400 + ARCHETYPE_BY_ID[c.archetype].extrasAffinity * 0.2);
  const loc = locationById(state, v.locationId);
  const finance = loc ? upgradeLevel(loc, 'finance') > 0 && gameRng.chance(0.3 + Math.min(5, lotStats(loc.lot).effects.finance ?? 0) * 0.03) : false;
  completeSale(state, v, c, price, { warranty, service: gameRng.chance(skill / 300), accessory: false, finance }, { byStaff: true, staffId, patienceUsed: 1 });
  pushNotice(state, 'sale', `${e.name} sold the ${vehicleName(v)} for €${price.toLocaleString('en-GB')}.`);
  return true;
}

/** Hourly customer flow: arrivals, patience running out, staff stepping in. */
export function customersHour(state: GameState): void {
  const now = absHour(state);
  for (const c of state.customers) {
    if (c.status !== 'scheduled' || c.arrivalHour > now) continue;
    const loc = locationById(state, c.locationId);
    // Closed doors: they drive past.
    if (loc && !loc.lot.open) c.status = 'left';
    else arrive(state, c);
  }
  for (const c of state.customers) {
    if (c.status !== 'waiting') continue;
    const v = state.vehicles.find((x) => x.id === c.vehicleId);
    if (!v || v.status !== 'listed') {
      c.status = 'left';
      continue;
    }
    if (now >= c.leaveHour) {
      if (!state.settings.autoStaffDeals || !staffDeal(state, c)) {
        c.status = 'left';
        state.lostLeads.unshift({ day: state.day, archetype: c.archetype, reason: 'Nobody served them in time', wanted: describeWant(c), locationId: c.locationId });
        if (state.lostLeads.length > 60) state.lostLeads.length = 60;
      }
    }
  }
}

/** End of day: everyone still around is handled or goes home. */
export function customersClose(state: GameState): void {
  for (const c of state.customers) {
    if (c.status !== 'scheduled') continue;
    const loc = locationById(state, c.locationId);
    if (loc && !loc.lot.open) c.status = 'left';
    else arrive(state, c);
  }
  for (const c of state.customers) {
    if (c.status === 'waiting') {
      if (!state.settings.autoStaffDeals || !staffDeal(state, c)) {
        c.status = 'left';
        state.lostLeads.unshift({ day: state.day, archetype: c.archetype, reason: 'Closed before anyone served them', wanted: describeWant(c), locationId: c.locationId });
      }
    }
  }
  if (state.lostLeads.length > 60) state.lostLeads.length = 60;
  // Keep only the negotiating customer, if any.
  state.customers = state.customers.filter((c) => c.status === 'negotiating');
}

export function waitingCustomers(state: GameState): Customer[] {
  return state.customers.filter((c) => c.status === 'waiting');
}

export function interestLabel(i: number): { label: string; tone: 'good' | 'info' | 'warn' | 'bad' } {
  if (i >= 0.8) return { label: 'Very keen', tone: 'good' };
  if (i >= 0.62) return { label: 'Interested', tone: 'good' };
  if (i >= 0.45) return { label: 'Curious', tone: 'info' };
  return { label: 'Lukewarm', tone: 'warn' };
}

// ------------------------------------------------------- on the floor --

/** What you learn by talking to a customer. */
export function customerNeeds(state: GameState, c: Customer): string[] {
  const a = ARCHETYPE_BY_ID[c.archetype];
  const lines = [
    `Looking for: ${[...new Set([...c.categories, ...c.bodies])].slice(0, 4).join(', ').toLowerCase()}.`,
    `Budget: roughly €${Math.round(c.budget * 0.85 / 1000)}k–€${Math.round(c.budget * 1.1 / 1000)}k.`,
    `Fuel: ${c.fuels.join(' or ').toLowerCase()}. No more than ${Math.round(c.maxMileage / 1000)}k km.`,
  ];
  if (c.brandPref) lines.push(`Has a soft spot for ${c.brandPref.charAt(0).toUpperCase()}${c.brandPref.slice(1)}.`);
  if (c.tradeIn) lines.push(`Wants to part-exchange a ${vehicleName(c.tradeIn)}.`);
  lines.push(a.priceSensitivity > 0.6 ? 'Very price-conscious.' : a.priceSensitivity < 0.35 ? 'Cares more about the car than the price.' : 'Wants a fair deal.');
  return lines;
}

/** First chat: the customer feels welcome and waits a little longer. */
export function talkTo(state: GameState, customerId: string): { ok: boolean; message: string; needs: string[] } {
  const c = state.customers.find((x) => x.id === customerId);
  if (!c || (c.status !== 'waiting' && c.status !== 'negotiating')) return { ok: false, message: 'They have left.', needs: [] };
  if (!c.talked) {
    c.talked = true;
    c.leaveHour += 1;
    c.satisfactionBonus += 1;
  }
  return { ok: true, message: `${c.name} is happy to chat.`, needs: customerNeeds(state, c) };
}

/** Cars on show that this customer might go for instead, best first. */
export function recommendations(state: GameState, c: Customer): { v: Vehicle; score: number }[] {
  const taken = new Set(state.customers.filter((o) => o.id !== c.id && (o.status === 'waiting' || o.status === 'negotiating')).map((o) => o.vehicleId));
  return listedAt(state, c.locationId)
    .filter((v) => v.id !== c.vehicleId && onShow(state, v) && !taken.has(v.id))
    .map((v) => ({ v, score: matchScore(state, c, v) }))
    .filter((x) => x.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** Steer the customer to another car. Works if it really suits them. */
export function recommendCar(state: GameState, customerId: string, vehicleId: string): { ok: boolean; message: string } {
  const c = state.customers.find((x) => x.id === customerId);
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!c || c.status !== 'waiting') return { ok: false, message: 'They are not browsing any more.' };
  if (!v || !onShow(state, v)) return { ok: false, message: 'That car is not on show.' };
  if ((c.recommended ?? 0) >= 2) return { ok: false, message: `${c.name} has seen enough alternatives.` };
  c.recommended = (c.recommended ?? 0) + 1;
  const seller = bestAt(state, c.locationId, 'sales');
  const score = matchScore(state, c, v) + (seller ? effectiveSkill(seller) / 1200 : 0);
  if (score < 0.3) {
    c.interest = clamp(c.interest - 0.04, 0.15, 1);
    return { ok: false, message: `${c.name} is not convinced by the ${vehicleName(v)}.` };
  }
  c.vehicleId = v.id;
  c.interest = clamp(score + gameRng.range(0, 0.08), 0.2, 1);
  c.wtp = computeWtp(state, c, v, c.interest);
  c.testDrive = false;
  emit('customer', { customerId: c.id });
  return { ok: true, message: `${c.name} walks over to the ${vehicleName(v)} — ${interestLabel(c.interest).label.toLowerCase()}.` };
}

export function canTestDrive(state: GameState, c: Customer): { ok: boolean; reason?: string } {
  const v = state.vehicles.find((x) => x.id === c.vehicleId);
  if (c.status !== 'waiting' && c.status !== 'negotiating') return { ok: false, reason: 'They have left.' };
  if (!v || v.status !== 'listed') return { ok: false, reason: 'The car is not available.' };
  if (c.testDrive) return { ok: false, reason: 'Already test-driven.' };
  if (state.negotiation && !state.negotiation.done && state.negotiation.customerId !== c.id) return { ok: false, reason: 'You are busy with another customer.' };
  return { ok: true };
}

/**
 * A test drive: most people fall a little more in love with a good car; a
 * tired one can put them off, and a drive may expose a hidden fault.
 */
export function testDrive(state: GameState, customerId: string): { ok: boolean; message: string; delta: number } {
  const c = state.customers.find((x) => x.id === customerId);
  if (!c) return { ok: false, message: 'They have left.', delta: 0 };
  const check = canTestDrive(state, c);
  if (!check.ok) return { ok: false, message: check.reason ?? 'Not possible.', delta: 0 };
  const v = state.vehicles.find((x) => x.id === c.vehicleId)!;
  c.testDrive = true;
  v.testDriven = true;
  v.mileage += gameRng.int(6, 22);
  c.leaveHour += 1;
  const seller = bestAt(state, c.locationId, 'sales');
  let delta = (v.condition - 55) / 260 + (v.presentation - 60) / 700 + gameRng.range(0.02, 0.1) + (seller ? effectiveSkill(seller) / 2500 : 0);
  let note = '';
  const hidden = v.issues.filter((i) => !i.fixed && !i.discovered && i.severity >= 2 && (i.system === 'Engine' || i.system === 'Transmission' || i.system === 'Suspension' || i.system === 'Brakes'));
  if (hidden.length && gameRng.chance(0.3)) {
    const issue = gameRng.pick(hidden);
    issue.discovered = true;
    delta -= 0.12;
    note = ` They noticed a problem: ${issue.name.toLowerCase()}.`;
  }
  const before = c.interest;
  c.interest = clamp(c.interest + delta, 0.1, 1);
  c.wtp = Math.round(c.wtp * (1 + (delta > 0 ? gameRng.range(0.02, 0.04) : delta * 0.3)) / 10) * 10;
  c.satisfactionBonus += delta > 0 ? 3 : -2;
  const up = c.interest - before;
  const mood = up > 0.08 ? 'loved it' : up > 0 ? 'liked it' : 'was not impressed';
  return { ok: true, message: `${c.name} took the ${vehicleName(v)} for a spin and ${mood}.${note}`, delta: up };
}
