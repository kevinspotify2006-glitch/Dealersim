/**
 * Customers: how many come, who they are, what they want, how they move
 * through the sales funnel, and what happens if nobody talks to them.
 *
 * Funnel: ad → visit → browse → interest → test drive → negotiation →
 * finance → trade-in → sale → delivery → review → repeat. Every step is
 * counted (state.funnel) and every step can fail.
 */
import type { ArchetypeId, Customer, GameState, Location, Vehicle } from './types';
import { BRAND_POSITIONS } from '../data/group';
import { STYLE_BY_ID } from '../data/buildplus';
import { focusMatch } from './buildplus';
import { aiDriveFeedback } from './testdrive';
import { ARCHETYPES, ARCHETYPE_BY_ID, CHANNEL_BY_ID, CITY_BY_ID, FIRST_NAMES, LAST_NAMES, LOCATION_TYPES, STRATEGY_BY_ID } from '../data/game';
import { BRAND_BY_ID, MANUFACTURERS, OPTION_BY_NAME } from '../data/vehicles';
import { gameRng } from './rng';
import { clamp } from './util';
import { yearOf, seasonOf } from './format';
import { CLOSE_HOUR, OPEN_HOUR, absHour, boostMult, funnelStep, hasTech, locationById, nextId, pushNotice, staffAt, upgradeLevel, vehicleName } from './state';
import { demandScore, marketMods, trueValue, PRICING_POLICY } from './market';
import { appealScore, generateVehicle, listingQuality } from './vehicles';
import { addWork, bestAt, effectiveSkill, payCommission, skillOf, synergyActive } from './staff';
import { completeSale } from './sales';
import { roundPrice, bookValue } from './market';
import { emit } from './bus';
import { competitorPressure } from './world';
import { lotStats, spotBonus } from './lot';
import { economyFactors } from './systems/economy';
import { approvalChance, commission, financeKinds, financeReach, makePlan, productsFor, takeChance } from './systems/retail';
import { applyReturning, returningToday } from './systems/crm';
import { addAppointment, freePerson, DAY_START, DAY_END } from './systems/planning';

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

/** Lead multiplier from running campaigns at a location (central marketing spreads them). */
export function campaignBoost(state: GameState, loc: Location): number {
  let campaign = 0;
  const central = (state.group?.departments.marketing ?? 0) >= 2;
  for (const c of state.campaigns) {
    if (state.day > c.endDay || state.day < c.startDay) continue;
    const def = CHANNEL_BY_ID[c.channelId];
    if (!def) continue;
    let boost = def.leadBoost * Math.sqrt(c.budget ?? 1);
    if (def.crm) boost = Math.min(1.2, (state.clients.filter((x) => !x.lost && x.locationId === loc.id).length * (hasTech(state, 'crm') ? 2 : 1)) / 60) * Math.sqrt(c.budget ?? 1);
    if (c.channelId === 'social' && hasTech(state, 'socialads')) boost *= 1.2;
    if (c.locationId === loc.id) campaign += boost;
    else if (central) campaign += boost / 3;
  }
  const mkStaff = state.employees.filter((e) => e.role === 'marketing' && e.locationId === loc.id).reduce((m, e) => Math.max(m, e.skill), 0);
  campaign *= 1 + mkStaff / 200;
  // A marketing studio, marketing desks and promo displays make every campaign work harder.
  campaign *= 1 + Math.min(5, lotStats(loc.lot).effects.marketing ?? 0) * 0.06;
  if (synergyActive(state, loc.id, 'marketingpush')) campaign *= 1.2;
  return campaign;
}

/** Dealer contracts bring manufacturer marketing support (national ads, website). */
export function brandSupport(state: GameState, loc: Location): number {
  let s = 0;
  for (const c of state.contracts ?? []) {
    if (c.locationId !== loc.id) continue;
    s += (BRAND_BY_ID[c.brandId]?.dealer?.support ?? 0.08) * (0.7 + c.tier * 0.3);
  }
  return s;
}

/** Expected walk-ins + online leads per day at a location. */
export function expectedLeads(state: GameState, loc: Location): { walkIn: number; online: number; total: number } {
  const city = CITY_BY_ID[loc.cityId];
  const type = LOCATION_TYPES[city?.type ?? 'town'];
  const listed = listedAt(state, loc.id).filter((v) => onShow(state, v));
  const mods = marketMods(state);
  const layout = layoutFootfall(loc);
  if (layout <= 0) return { walkIn: 0, online: 0, total: 0 };
  const rep = (0.45 + ((state.reputation + loc.reputation) / 2) / 90);
  const stock = listed.length === 0 ? 0.25 : 0.45 + Math.sqrt(listed.length) * 0.36;
  const showroom = 1 + upgradeLevel(loc, 'showroom') * 0.04;
  const season = seasonOf(state.day);
  const seasonMult = season === 'Spring' ? 1.08 : season === 'Summer' ? 1.02 : season === 'Winter' ? 0.9 : 1;
  const campaign = campaignBoost(state, loc);
  const support = brandSupport(state, loc);
  const pressure = 1 - competitorPressure(state, loc.cityId) * 0.35;
  const focus = STRATEGY_BY_ID[loc.strategy ?? 'balanced'];
  const policy = 1 + PRICING_POLICY[loc.pricing ?? 'market'].interest * 1.5;
  const boost = boostMult(state, 'leads', loc.id) * focusMatch(loc).mult;
  let walkIn = focus.footfall * 1.5 * city.demand * type.walkIn * (city.traffic ?? 1) * rep * stock * showroom * seasonMult * mods.demand * pressure * (1 + campaign + support) * layout * policy * boost;
  // Visitors need somewhere to park: the street takes a few, visitor parking the rest.
  const parkingCap = visitorCapacity(loc);
  if (walkIn > parkingCap) walkIn = parkingCap + (walkIn - parkingCap) * 0.35;
  const marketingUp = 1 + [0, 0.15, 0.3, 0.5][Math.min(3, upgradeLevel(loc, 'marketing'))];
  let quality = 0;
  for (const v of listed) if (v.listedOnline) quality += listingQuality(state, v);
  let online = Math.sqrt(quality) * 0.6 * type.online;
  online *= marketingUp * mods.demand * pressure * (1 + campaign * 0.5 + support) * boost;
  if (hasTech(state, 'digitalshowroom')) online *= 1.25;
  if (hasTech(state, 'onlinesales')) online *= 1.15;
  return { walkIn, online, total: walkIn + online };
}

function pickArchetype(state: GameState, loc: Location, campaignMix?: Partial<Record<ArchetypeId, number>>): ArchetypeId {
  const city = CITY_BY_ID[loc.cityId];
  const fx = lotStats(loc.lot).effects;
  const weights = ARCHETYPES.map((a) => {
    let w = a.weight * (city.mix[a.id] ?? 1) * (campaignMix?.[a.id] ?? 1) * (STRATEGY_BY_ID[loc.strategy ?? 'balanced'].mix[a.id] ?? 1);
    // Your brand promise draws its own crowd.
    w *= BRAND_POSITIONS.find((p) => p.id === state.branding?.position)?.mix[a.id] ?? 1;
    // The dealership's style draws its own crowd too.
    w *= (loc.lot.theme ? STYLE_BY_ID[loc.lot.theme]?.mix[a.id] : undefined) ?? 1;
    if (state.challenge === 'ev' && a.id === 'ev') w *= 2.5;
    // Chargers on the lot draw electric-car buyers (twice as much with a fast-charging network).
    if (a.id === 'ev') w *= (1 + Math.min(3, fx.ev ?? 0) * 0.08 * (hasTech(state, 'evcharging') ? 2 : 1)) * boostMult(state, 'ev', loc.id) * (1 + state.economy.evIncentive * 0.4);
    if (state.challenge === 'luxury' && (a.id === 'luxury' || a.id === 'enthusiast')) w *= 1.8;
    // Rich buyers need a name you can trust.
    if ((a.id === 'luxury' || a.id === 'enthusiast') && state.reputation < 45) w *= 0.6;
    if (a.id === 'prestige') w *= state.reputation < 60 ? 0.2 : state.reputation < 75 ? 0.6 : 1;
    // Fleet managers come to dealers who can do fleet business.
    if (a.id === 'fleet' && !hasTech(state, 'fleetsales')) w *= 0.4;
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
  if (v.reservedBy && v.reservedBy !== c.id) return 0;
  const age = yearOf(state.day) - v.year;
  const classic = v.category === 'Classic' || v.category === 'Rare';
  const brand = BRAND_BY_ID[v.brandId];
  let s = 0.2;
  if (c.categories.includes(v.category)) s += 0.3;
  if (c.bodies.includes(v.body)) s += 0.2;
  if (c.fuels.includes(v.fuel)) s += 0.12; else s -= 0.15;
  if (c.brandPref && c.brandPref === v.brandId) s += 0.12;
  if (c.favBrands?.includes(v.brandId)) s += 0.08;
  if (!c.categories.includes(v.category) && !c.bodies.includes(v.body)) s -= 0.3;
  if (v.mileage > c.maxMileage) s -= 0.25;
  if (!classic && age > c.maxAge) s -= 0.25;
  // Taste: premium brands for those who care, electrified cars for the eco-minded.
  if (brand) s += ((c.luxuryPref ?? 0.3) - 0.4) * (brand.prestige - 0.5) * 0.3;
  if (v.fuel === 'Electric' || v.fuel === 'Hybrid') s += ((c.ecoPref ?? 0.3) - 0.35) * 0.2;
  // Options this kind of buyer looks for.
  let opt = 0;
  for (const o of v.options) if (OPTION_BY_NAME[o]?.appeal.includes(c.archetype)) opt += 0.025;
  s += Math.min(0.1, opt);
  if (c.archetype === 'suv' && (v.drivetrain === '4x4' || v.drivetrain === 'AWD')) s += 0.05;
  if (v.isNew && (c.archetype === 'prestige' || c.archetype === 'luxury' || c.archetype === 'business')) s += 0.1;
  if (v.certified) s += 0.06;
  // Price vs budget (finance stretches it for those who pay monthly).
  const loc = locationById(state, v.locationId);
  const budget = Math.max(c.budget, financeReach(state, c, loc));
  const budgetRatio = v.askingPrice / budget;
  if (budgetRatio > 1.25) return 0;
  if (budgetRatio > 1.05) s -= (budgetRatio - 1.05) * 1.6;
  else if (budgetRatio < 0.35) s -= 0.15; // too cheap for them
  // Price vs value.
  const value = trueValue(state, v);
  const priceRatio = v.askingPrice / Math.max(1, value);
  const sens = c.priceSensitivity * (c.style === 'analytical' ? 1.15 : 1);
  s -= clamp((priceRatio - 1.08) * sens * 1.4, -0.12, 0.6);
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
    if (v.fuel === 'Electric' && hasTech(state, 'evdiag')) f += 0.01;
  }
  if (v.certified) f += 0.03;
  if (v.isNew) f = 0.955 + interest * 0.05 + (state.reputation - 50) / 1200;   // new cars: list price is the anchor
  if (c.clientId) f += 0.02;                      // they trust you
  if (c.style === 'haggler') f -= 0.02;
  if (c.style === 'decisive') f += 0.01;
  f *= boostMult(state, 'wtp', v.locationId);
  f += haggler;
  f += gameRng.range(-0.035, 0.035);
  const budget = Math.max(c.budget, financeReach(state, c, loc));
  const wtp = Math.min(budget * 1.02, value * f);
  return Math.round(wtp / 10) * 10;
}

export function createCustomer(state: GameState, loc: Location, arrivalHour: number, channel: string, campaignId?: string): Customer {
  const campaign = campaignId ? state.campaigns.find((c) => c.id === campaignId) : undefined;
  const mix = campaign ? CHANNEL_BY_ID[campaign.channelId]?.mix : undefined;
  const archetypeId = pickArchetype(state, loc, mix);
  const a = ARCHETYPE_BY_ID[archetypeId];
  const city = CITY_BY_ID[loc.cityId];
  const econ = economyFactors(state.economy);
  const budget = Math.round(gameRng.range(a.budget[0], a.budget[1]) * city.wealth * econ.budget / 100) * 100;
  const lounge = upgradeLevel(loc, 'lounge');
  const ls = lotStats(loc.lot);
  const reception = (ls.effects.reception ?? 0) > 0 ? 1 : 0;
  const receptionist = synergyActive(state, loc.id, 'welcome') ? 1 : 0;
  const facilities = Math.min(4, ls.effects.facilities ?? 0);
  const pleasing = Math.min(12, ls.effects.satisfaction ?? 0) + facilities * 1.5;
  const patience = clamp(gameRng.int(a.patience[0], a.patience[1]) + (lounge >= 3 ? 2 : lounge >= 1 ? 1 : 0), 1, 8);
  const brandPref = gameRng.chance(0.25) ? gameRng.pick(MANUFACTURERS.map((m) => m.id)) : undefined;
  const favBrands = gameRng.sample(MANUFACTURERS.filter((m) => Math.abs(m.prestige - a.luxury) < 0.35), gameRng.int(1, 3)).map((m) => m.id);
  const credit = Math.round(gameRng.range(a.credit[0], a.credit[1]));
  const age = gameRng.int(a.age[0], a.age[1]);
  // What they can spend per month: roughly 2.5% of their budget, more with better credit.
  const monthlyLimit = Math.round(budget * gameRng.range(0.018, 0.03) * (0.8 + (credit - 500) / 900) / 10) * 10;
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
    leaveHour: arrivalHour + gameRng.int(2, 4) + (lounge >= 2 ? 1 : 0) + reception + receptionist + (facilities >= 2 ? 1 : 0) - (ls.flow < 0.4 ? 1 : 0) + (hasTech(state, 'customerexp') ? 1 : 0) + (hasTech(state, 'salesplaybook') ? 1 : 0),
    satisfactionBonus: lounge * 2 + Math.round((ls.flow - 0.6) * 8) + reception * 2 + receptionist * 2 + Math.round(pleasing) + (hasTech(state, 'customerexp') ? 3 : 0),
    status: 'scheduled',
    age,
    household: gameRng.pick(a.households),
    favBrands,
    monthlyLimit,
    credit,
    wantsFinance: gameRng.chance(a.financeShare * (1 + (state.economy.rate < 3 ? 0.15 : state.economy.rate > 6 ? -0.2 : 0))),
    style: gameRng.pick(a.styles),
    loyalty: clamp(a.loyalty + gameRng.range(-0.15, 0.15), 0, 1),
    luxuryPref: clamp(a.luxury + gameRng.range(-0.15, 0.15), 0, 1),
    ecoPref: clamp(a.eco + gameRng.range(-0.15, 0.15), 0, 1),
    stage: 'visit',
    waited: 0,
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
  const returning = returningToday(state);
  for (const loc of state.locations) {
    const leads = expectedLeads(state, loc);
    const walkIns = poisson(leads.walkIn);
    const online = poisson(leads.online);
    const active = state.campaigns.filter((c) => c.locationId === loc.id && state.day <= c.endDay && state.day >= c.startDay);
    const makeOne = (channel: string): Customer => {
      const hour = state.day * 24 + gameRng.int(OPEN_HOUR, CLOSE_HOUR - 1);
      let campaignId: string | undefined;
      if (active.length && gameRng.chance(0.45)) campaignId = gameRng.pick(active).id;
      const c = createCustomer(state, loc, hour, channel, campaignId);
      state.customers.push(c);
      if (campaignId) funnelStep(state, 'ad');
      return c;
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
        c.wantsFinance = false;
        state.customers.push(c);
      }
    }
    for (let i = 0; i < online; i += 1) {
      const c = makeOne('Online');
      // With online sales they reserve the car before they come in.
      if (hasTech(state, 'onlinesales') && gameRng.chance(0.3)) reserveOnline(state, c);
    }
    // Clients whose next car is due walk back in.
    for (const client of returning.filter((x) => x.locationId === loc.id)) {
      const c = makeOne('Returning');
      applyReturning(c, client);
      funnelStep(state, 'repeat');
      bookVisit(state, c, '🔁 Returning client', client.car ? `was: ${client.car.name}` : 'looking for a car');
    }
    const total = walkIns + online;
    loc.stats.leads += total;
    loc.month.leads += total;
    state.today.leads += total;
  }
}

/** Online: the customer picks and reserves a car from the website before visiting. */
function reserveOnline(state: GameState, c: Customer): void {
  const loc = locationById(state, c.locationId);
  if (!loc) return;
  const options = listedAt(state, c.locationId).filter((v) => onShow(state, v) && !v.reservedBy)
    .map((v) => ({ v, s: matchScore(state, c, v) })).filter((x) => x.s > 0.45).sort((a, b) => b.s - a.s);
  const pick = options[0];
  if (!pick) return;
  pick.v.reservedBy = c.id;
  pick.v.reservedUntil = state.day + 1;
  c.reservation = true;
  c.vehicleId = pick.v.id;
  c.patience = Math.min(8, c.patience + 1);
  bookVisit(state, c, `🌐 Viewing (reserved online)`, vehicleName(pick.v));
}

/** Puts a customer's visit in the planning with a free sales advisor. */
function bookVisit(state: GameState, c: Customer, title: string, vehicle: string): void {
  const day = Math.floor(c.arrivalHour / 24);
  const start = clamp(c.arrivalHour - day * 24, DAY_START, DAY_END - 1);
  const who = freePerson(state, c.locationId, ['sales', 'manager'], day, start, 1);
  const a = addAppointment(state, { kind: 'sales', locationId: c.locationId, day, start, duration: 1, staffId: who?.id, clientId: c.clientId, customer: c.name, vehicle, title });
  c.appointment = a.id;
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

function lose(state: GameState, c: Customer, reason: string): void {
  c.status = 'left';
  state.lostLeads.unshift({ day: state.day, archetype: c.archetype, reason, wanted: describeWant(c), locationId: c.locationId });
  if (state.lostLeads.length > 60) state.lostLeads.length = 60;
  state.stats.lostLeads = (state.stats.lostLeads ?? 0) + 1;
  // A reserved car becomes available again.
  for (const v of state.vehicles) if (v.reservedBy === c.id) { v.reservedBy = undefined; v.reservedUntil = undefined; }
}

/** Customer walks in: picks the vehicle they are after, or leaves disappointed. */
function arrive(state: GameState, c: Customer): void {
  const all = listedAt(state, c.locationId);
  const listed = all.filter((v) => onShow(state, v));
  state.stats.customersTotal += 1;
  funnelStep(state, 'visit');
  if (c.campaignId) {
    const camp = state.campaigns.find((x) => x.id === c.campaignId);
    if (camp) camp.leads += 1;
  }
  if (listed.length) funnelStep(state, 'browse');
  // A reservation made online: they come straight for that car.
  const reserved = c.reservation ? state.vehicles.find((v) => v.id === c.vehicleId && v.status === 'listed') : undefined;
  if (reserved) {
    c.interest = clamp(matchScore(state, c, reserved) + 0.15, 0.4, 1);
    c.wtp = computeWtp(state, c, reserved, c.interest);
    c.status = 'waiting';
    c.stage = 'interest';
    funnelStep(state, 'interest');
    emit('customer', { customerId: c.id });
    return;
  }
  const scored = listed
    .filter((v) => !state.customers.some((o) => o.vehicleId === v.id && (o.status === 'waiting' || o.status === 'negotiating')))
    // A car in a good spot gets noticed: its attention bonus nudges it up the list.
    .map((v) => { const loc = locationById(state, v.locationId); return { v, s: matchScore(state, c, v) + (loc ? spotBonus(loc, v).attention / 100 * 0.35 : 0) }; })
    .filter((x) => x.s > 0.3)
    .sort((a, b) => b.s - a.s);
  if (scored.length === 0) {
    const tooPricey = listed.some((v) => v.askingPrice > c.budget * 1.25 && (c.categories.includes(v.category) || c.bodies.includes(v.body)));
    lose(state, c, all.length > 0 && listed.length === 0 ? 'Could not get to the cars' : listed.length === 0 ? 'Nothing on the lot' : tooPricey ? 'Everything they liked was over budget' : 'Nothing that matched');
    return;
  }
  const pick = scored[Math.min(scored.length - 1, gameRng.chance(0.7) ? 0 : gameRng.int(0, Math.min(2, scored.length - 1)))];
  c.vehicleId = pick.v.id;
  c.interest = clamp(pick.s + gameRng.range(-0.05, 0.1), 0.2, 1);
  c.wtp = computeWtp(state, c, pick.v, c.interest);
  c.status = 'waiting';
  c.stage = 'interest';
  funnelStep(state, 'interest');
  emit('customer', { customerId: c.id });
}

let handledDay = -1;
const handled: Record<string, number> = {};

/** Customers a salesperson can handle in a day. */
export function salesCapacity(state: GameState, level: number): number {
  return 4 + Math.floor(level / 2) + (hasTech(state, 'dms') ? 2 : 0);
}

/** Staff salesperson handles a customer nobody served. */
/** Send a sales advisor to a waiting customer now (from a notification or their card). */
export function assignSeller(state: GameState, customerId: string): { ok: boolean; message: string } {
  const c = state.customers.find((x) => x.id === customerId);
  if (!c || c.status !== 'waiting') return { ok: false, message: 'They are no longer waiting.' };
  if (!staffAt(state, c.locationId).some((e) => e.role === 'sales' && e.trainingDaysLeft <= 0 && e.absentDay !== state.day)) return { ok: false, message: 'No sales advisor is free — serve them yourself.' };
  const before = state.stats.sold;
  if (!staffDeal(state, c)) return { ok: false, message: 'Your sales advisors have no time left today — serve them yourself.' };
  return { ok: true, message: state.stats.sold > before ? `Your sales advisor sold ${c.name} the car.` : `Your sales advisor talked to ${c.name}; no deal this time.` };
}

/** How keen someone is right now: green (likely to buy), amber (doubting), red (about to leave). */
export function customerMood(state: GameState, c: Customer): 'green' | 'amber' | 'red' {
  const left = c.leaveHour - absHour(state);
  if (c.status === 'waiting' && left <= 1) return 'red';
  if (c.interest >= 0.62 && (c.waited ?? 0) < 2) return 'green';
  if (c.interest < 0.35 || (c.waited ?? 0) >= 2) return left <= 2 ? 'red' : 'amber';
  return 'amber';
}

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
  if ((handled[seller.id] ?? 0) >= salesCapacity(state, seller.level)) {
    const others = state.employees.filter((e) => e.role === 'sales' && e.locationId === c.locationId && e.trainingDaysLeft <= 0 && (handled[e.id] ?? 0) < salesCapacity(state, e.level));
    if (others.length === 0) return false;
    return runStaffDeal(state, c, v, others.sort((a, b) => b.skill - a.skill)[0].id, handled);
  }
  return runStaffDeal(state, c, v, seller.id, handled);
}

function runStaffDeal(state: GameState, c: Customer, v: Vehicle, staffId: string, handled: Record<string, number>): boolean {
  const e = state.employees.find((x) => x.id === staffId);
  if (!e) return false;
  handled[staffId] = (handled[staffId] ?? 0) + 1;
  addWork(state, e.id);
  funnelStep(state, 'negotiation');
  const loc = locationById(state, c.locationId);
  const salesBoost = loc ? Math.min(25, lotStats(loc.lot).effects.sales ?? 0) / 100 : 0;
  const team = synergyActive(state, c.locationId, 'salesteam') ? (staffAt(state, c.locationId).some((e) => e.role === 'manager' && e.focus === 'sales' && e.stationId) ? 1.15 : 1.1) : 1;
  const specialist = (e.specialization === 'Luxury' && (v.category === 'Luxury' || v.category === 'Premium')) || (e.specialization === 'EV' && v.fuel === 'Electric')
    || (e.specialization === 'Family' && (v.category === 'Family' || v.category === 'SUV')) || (e.specialization === 'Sports' && (v.category === 'Sport' || v.category === 'Performance'));
  const luxurySkill = (v.category === 'Luxury' || c.archetype === 'prestige') ? skillOf(e, 'luxury') / 800 : 0;
  const skill = effectiveSkill(e) * (1 + salesBoost) * team * (specialist ? 1.08 : 1);
  const negotiation = skillOf(e, 'negotiation');
  const wtp = c.wtp * (1 + skill / 1500 + luxurySkill) * (e.specialization === 'Closer' ? 1.02 : 1) * (hasTech(state, 'salesplaybook') ? 1.01 : 1);
  const floor = v.floorPrice > 0 ? v.floorPrice : Math.round(v.askingPrice * 0.92);
  if (wtp < floor) {
    lose(state, c, 'Could not agree on a price');
    e.xp += 3;
    return false;
  }
  const achieved = Math.min(v.askingPrice, Math.round((floor + (wtp - floor) * (0.5 + skill / 280 + negotiation / 1200)) / 10) * 10);
  const price = Math.max(floor, achieved);
  // Finance: offered when the customer wants to pay monthly and the lender says yes.
  const kinds = financeKinds(state, loc);
  let plan = undefined;
  if (c.wantsFinance && kinds.length > 1) {
    funnelStep(state, 'finance');
    const kind = kinds.includes('balloon') && price > c.budget * 1.1 ? 'balloon' : kinds.includes('lease') && (c.archetype === 'business' || c.archetype === 'luxury') ? 'lease' : 'loan';
    const trial = makePlan(state, c, v, price, kind, 48, 0.1);
    state.kpi.financeOffers += 1;
    if (gameRng.chance(approvalChance(state, c, trial, c.locationId) + (synergyActive(state, c.locationId, 'financepair') ? 0.08 : 0))) {
      plan = { ...trial, approved: true };
    } else if (price > c.budget * 1.02) {
      lose(state, c, 'Finance was declined');
      return false;
    }
  }
  // Products: each offered, taken with its own chance.
  const extras: Record<string, boolean> = {};
  const productBoost = synergyActive(state, c.locationId, 'financepair') ? 1.15 : 1;
  for (const p of productsFor(state, v, !!plan)) {
    if (gameRng.chance(Math.min(0.9, takeChance(state, c, p, c.locationId) * (0.7 + skill / 250) * productBoost))) extras[p.id] = true;
  }
  const result = completeSale(state, v, c, price, extras, { byStaff: true, staffId, patienceUsed: 1, plan });
  payCommission(state, e, result.profit, v.locationId);
  void commission;
  pushNotice(state, 'sale', `${e.name} sold the ${vehicleName(v)} for €${price.toLocaleString('en-GB')}${plan ? ` (${plan.kind === 'lease' ? 'lease' : 'finance'} €${plan.monthly}/month)` : ''}.`);
  return true;
}

/** Hourly customer flow: arrivals, patience running out, staff stepping in. */
export function customersHour(state: GameState): void {
  const now = absHour(state);
  for (const c of state.customers) {
    if (c.status !== 'scheduled' || c.arrivalHour > now) continue;
    const loc = locationById(state, c.locationId);
    // Closed doors: they drive past.
    if (loc && !loc.lot.open) lose(state, c, 'The doors were closed');
    else arrive(state, c);
  }
  for (const c of state.customers) {
    if (c.status !== 'waiting') continue;
    const v = state.vehicles.find((x) => x.id === c.vehicleId);
    if (!v || v.status !== 'listed') {
      lose(state, c, 'Their car was sold to someone else');
      continue;
    }
    // Every hour nobody talks to them costs goodwill.
    c.waited = (c.waited ?? 0) + 1;
    state.kpi.waitHours += 1;
    if (c.waited >= 2) c.satisfactionBonus -= 1;
    if (c.waited === 2 && now < c.leaveHour) pushNotice(state, 'info', `👤 ${c.name} has been waiting two hours for a sales advisor.`, { kind: 'waiting', id: c.id });
    if (now >= c.leaveHour) {
      if (!state.settings.autoStaffDeals || !staffDeal(state, c)) {
        if (c.status === 'waiting') lose(state, c, 'Nobody served them in time');
      }
    }
  }
}

/** End of day: everyone still around is handled or goes home; reservations lapse. */
export function customersClose(state: GameState): void {
  for (const c of state.customers) {
    if (c.status !== 'scheduled') continue;
    const loc = locationById(state, c.locationId);
    if (loc && !loc.lot.open) lose(state, c, 'The doors were closed');
    else arrive(state, c);
  }
  for (const c of state.customers) {
    if (c.status === 'waiting') {
      if (!state.settings.autoStaffDeals || !staffDeal(state, c)) {
        if (c.status === 'waiting') lose(state, c, 'Closed before anyone served them');
      }
    }
  }
  state.kpi.waitCount += state.customers.filter((c) => (c.waited ?? 0) > 0).length;
  for (const v of state.vehicles) {
    if (v.reservedBy && (v.reservedUntil ?? 0) <= state.day && !state.customers.some((c) => c.id === v.reservedBy && c.status === 'negotiating')) {
      v.reservedBy = undefined;
      v.reservedUntil = undefined;
    }
  }
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

const STYLE_TEXT: Record<string, string> = {
  haggler: 'A born haggler: expects to knock the price down.',
  fair: 'Wants a fair deal and a straight answer.',
  decisive: 'Decides quickly if the car is right.',
  analytical: 'Has done the research and compares every number.',
};

/** What you learn by talking to a customer. */
export function customerNeeds(state: GameState, c: Customer): string[] {
  const a = ARCHETYPE_BY_ID[c.archetype];
  const lines = [
    `Looking for: ${[...new Set([...c.categories, ...c.bodies])].slice(0, 4).join(', ').toLowerCase()}.`,
    `Budget: roughly €${Math.round(c.budget * 0.85 / 1000)}k–€${Math.round(c.budget * 1.1 / 1000)}k.`,
    `Fuel: ${c.fuels.join(' or ').toLowerCase()}. No more than ${Math.round(c.maxMileage / 1000)}k km.`,
  ];
  if (c.age) lines.push(`${c.age} years old${c.household ? `, ${c.household === 'family' ? 'with a family' : c.household === 'business' ? 'buying for their business' : c.household === 'retired' ? 'retired' : c.household === 'couple' ? 'with a partner' : 'single'}` : ''}.`);
  if (c.wantsFinance) lines.push(`Wants to pay monthly — about €${c.monthlyLimit ?? 0} a month at most.`);
  if (c.brandPref) lines.push(`Has a soft spot for ${BRAND_BY_ID[c.brandPref]?.name ?? c.brandPref}.`);
  if (c.favBrands?.length && hasTech(state, 'crm')) lines.push(`CRM: also likes ${c.favBrands.map((b) => BRAND_BY_ID[b]?.name ?? b).join(', ')}.`);
  if (c.tradeIn) lines.push(`Wants to part-exchange a ${vehicleName(c.tradeIn)}.`);
  if (c.style) lines.push(STYLE_TEXT[c.style]);
  lines.push(a.priceSensitivity > 0.6 ? 'Very price-conscious.' : a.priceSensitivity < 0.35 ? 'Cares more about the car than the price.' : 'Wants a fair deal.');
  if (c.clientId) lines.push('A returning customer — they already trust you.');
  if (c.reservation) lines.push('Reserved this car online and came to see it.');
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
    c.waited = 0;
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

export interface TestDriveOptions {
  /** Who goes along: an employee id, or undefined for you. */
  staffId?: string;
  /** 'short' (20 min round the block) or 'long' (an hour on the motorway). */
  route?: 'short' | 'long';
  /** Use a demo car of the same model instead of the car for sale (it takes the wear). */
  demoId?: string;
  /** You drove it yourself in the test-drive game: your score (0..100) sets how it went. */
  playerScore?: number;
  drivenBy?: 'you';
}

/**
 * A test drive: most people fall a little more in love with a good car; a
 * tired one can put them off, and a drive may expose a hidden fault. A long
 * drive convinces more but wears the car more (and small knocks happen).
 */
export function testDrive(state: GameState, customerId: string, opts: TestDriveOptions = {}): { ok: boolean; message: string; delta: number } {
  const c = state.customers.find((x) => x.id === customerId);
  if (!c) return { ok: false, message: 'They have left.', delta: 0 };
  const check = canTestDrive(state, c);
  if (!check.ok) return { ok: false, message: check.reason ?? 'Not possible.', delta: 0 };
  const forSale = state.vehicles.find((x) => x.id === c.vehicleId)!;
  const demo = opts.demoId ? demoCarsFor(state, forSale).find((x) => x.id === opts.demoId) : undefined;
  // The car that is driven takes the miles; the demo spares the one for sale.
  const v = demo ?? forSale;
  const long = opts.route === 'long';
  c.testDrive = true;
  c.stage = 'testdrive';
  addAppointment(state, { kind: 'testdrive', locationId: c.locationId, day: state.day, start: state.hour, duration: long ? 2 : 1, staffId: opts.staffId, clientId: c.clientId, customer: c.name, vehicle: vehicleName(forSale), title: long ? '🚗 Test drive (long)' : '🚗 Test drive', status: 'active' });
  c.waited = 0;
  funnelStep(state, 'testdrive');
  state.stats.testDrives = (state.stats.testDrives ?? 0) + 1;
  forSale.testDriven = true;
  v.mileage += long ? gameRng.int(40, 90) : gameRng.int(6, 22);
  v.presentation = clamp(v.presentation - (long ? 4 : 1), 0, 100);
  c.leaveHour += long ? 2 : 1;
  const companion = opts.staffId ? state.employees.find((e) => e.id === opts.staffId) : bestAt(state, c.locationId, 'sales');
  if (companion) addWork(state, companion.id);
  const tdLoc = locationById(state, c.locationId);
  const facilities = tdLoc ? Math.min(10, lotStats(tdLoc.lot).effects.testdrive ?? 0) : 0;
  const player = opts.playerScore !== undefined;
  const feedback = aiDriveFeedback(c, v);
  let delta = player
    ? (v.condition - 55) / 400 + (v.presentation - 60) / 900 + ((opts.playerScore ?? 50) - 45) / 230 + facilities * 0.006
    : (v.condition - 55) / 260 + (v.presentation - 60) / 700 + gameRng.range(0.02, 0.1) + (companion ? effectiveSkill(companion) / 2500 : 0) + facilities * 0.006 + feedback.delta;
  if (long) delta *= 1.5;
  if (demo) delta *= 0.85;              // not quite the same car
  let note = demo ? ' (in the demo car)' : '';
  const hidden = v.issues.filter((i) => !i.fixed && !i.discovered && i.severity >= 2 && (i.system === 'Engine' || i.system === 'Transmission' || i.system === 'Suspension' || i.system === 'Brakes'));
  if (!player && hidden.length && gameRng.chance(long ? 0.5 : 0.3)) {
    const issue = gameRng.pick(hidden);
    issue.discovered = true;
    delta -= 0.12;
    note += ` They noticed a problem: ${issue.name.toLowerCase()}.`;
  }
  // Small knocks happen on the road.
  if (!player && gameRng.chance(long ? 0.03 : 0.008)) {
    v.issues.push({ id: nextId(state, 'i'), system: 'Body', name: 'Scuffed wheel and bumper', severity: 1, repairCost: gameRng.int(180, 420), valueImpact: 350, discovered: true, fixed: false, visible: true });
    note += ' On the way back they kerbed a wheel — cosmetic repair needed.';
  }
  const before = c.interest;
  c.interest = clamp(c.interest + delta, 0.1, 1);
  c.wtp = Math.round(c.wtp * (1 + (delta > 0 ? gameRng.range(0.02, 0.04) * (long ? 1.3 : 1) : delta * 0.3)) / 10) * 10;
  c.satisfactionBonus += delta > 0 ? 3 : -2;
  const up = c.interest - before;
  const mood = up > 0.08 ? 'loved it' : up > 0 ? 'liked it' : 'was not impressed';
  if (player) return { ok: true, message: `You drove ${c.name} in the ${vehicleName(forSale)}: purchase confidence ${Math.round(before * 100)}% → ${Math.round(c.interest * 100)}%.`, delta: up };
  return { ok: true, message: `${c.name} took the ${vehicleName(forSale)} for a ${long ? 'long drive' : 'spin'}${companion ? ` with ${companion.name.split(' ')[0]}` : ''} and ${mood}. ${feedback.text}${note}`, delta: up };
}

/** Demo cars of the same model at the same location (marked as demo on the stock desk). */
export function demoCarsFor(state: GameState, v: Vehicle): Vehicle[] {
  return state.vehicles.filter((x) => x.demo && x.id !== v.id && x.modelId === v.modelId && x.locationId === v.locationId && (x.status === 'yard' || x.status === 'listed'));
}

/** Marks or unmarks a demo car. Demo cars can still be sold, as ex-demo, a little cheaper. */
export function toggleDemo(state: GameState, vehicleId: string): { ok: boolean; message: string } {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v) return { ok: false, message: 'Unknown car.' };
  v.demo = !v.demo;
  return { ok: true, message: v.demo ? `${vehicleName(v)} is now a demo car: customers test-drive it instead of the other ${v.model}s here.` : `${vehicleName(v)} is no longer a demo car.` };
}
