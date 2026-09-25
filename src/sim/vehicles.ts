/**
 * Vehicle generation, inspection and preparation.
 */
import { emit } from './bus';
import type { GameState, Issue, Location, SourceId, Vehicle } from './types';
import { BRAND_BY_ID, COLORS, INTERIORS, MODELS, OPTIONS, drivetrainOf } from '../data/vehicles';
import { AUCTION_SOURCES, ISSUE_TEMPLATES, PREP_BY_ID, SOURCE_BY_ID, TRADEIN_SOURCE, SELLER_NAMES, STRATEGY_BY_ID } from '../data/game';
import type { PrepActionDef, SourceDef } from '../data/game';
import { gameRng } from './rng';
import { clamp } from './util';
import { yearOf } from './format';
import { activeLocation, hasTech, locationById, nextId, pushNotice, staffAt, upgradeLevel, vehicleName } from './state';
import { assignSlots, findFreeSlot, isIndoorSlot, isVisibleSlot, lotStats, slotKindOf, spotBonus } from './lot';
import { TRADE_FACTOR, bookValue, marketMods, roundPrice, suggestedPrice, trueValue } from './market';
import { record } from './finance';

export interface GenOptions {
  source: SourceId;
  categories?: string[];
  locationId: string;
  quality?: number; // -1..1 skews condition
  maxBase?: number; // only models whose new price is at most this
  modelId?: string; // a specific model (sourcing on request)
  brandId?: string; // only this brand (manufacturer contracts)
}

function pickModel(state: GameState, opts: GenOptions) {
  const year = yearOf(state.day);
  if (opts.modelId) {
    const m = MODELS.find((x) => x.id === opts.modelId);
    if (m) return m;
  }
  const rnd = gameRng;
  let pool = MODELS.filter((m) => m.yearFrom <= year);
  if (opts.source === 'manufacturer') {
    // Current models of the contracted brand only.
    const current = pool.filter((m) => m.brandId === opts.brandId && m.yearTo >= year && m.category !== 'Classic' && m.category !== 'Rare');
    if (current.length) return rnd.pick(current);
  }
  if (opts.brandId) {
    const b = pool.filter((m) => m.brandId === opts.brandId);
    if (b.length) pool = b;
  }
  if (opts.maxBase) {
    const cheap = pool.filter((m) => m.basePrice <= opts.maxBase!);
    if (cheap.length) pool = cheap;
  }
  if (opts.categories && opts.categories.length) {
    const filtered = pool.filter((m) => opts.categories!.includes(m.category));
    if (filtered.length) pool = filtered;
  }
  if (opts.source === 'special') {
    const rare = pool.filter((m) => m.rarity >= 0.45);
    if (rare.length) pool = rare;
  } else if (opts.source === 'network') {
    const premium = pool.filter((m) => ['Premium', 'Luxury', 'SUV', 'Electric', 'Performance', 'Family'].includes(m.category));
    if (premium.length) pool = premium;
  } else if (opts.source === 'importer') {
    const premium = pool.filter((m) => ['Premium', 'Luxury', 'Sport', 'Performance', 'Electric', 'Offroad'].includes(m.category) && m.rarity < 0.8);
    if (premium.length) pool = premium;
  } else if (opts.source === 'fleet') {
    const fleet = pool.filter((m) => ['Economy', 'Compact', 'Family', 'Van', 'Commercial', 'Electric'].includes(m.category) && m.rarity < 0.3);
    if (fleet.length) pool = fleet;
  } else if (opts.source === 'lease') {
    const lease = pool.filter((m) => m.yearTo >= year - 5 && m.rarity < 0.5 && m.category !== 'Classic' && m.category !== 'Rare');
    if (lease.length) pool = lease.filter((m) => rnd.next() < 0.35 + m.popularity * 0.75);
    if (pool.length === 0) pool = lease;
  } else {
    // Common cars are common.
    // Common cars are common, and popular ones turn up more often.
    pool = pool.filter((m) => rnd.next() > m.rarity * 0.9 && rnd.next() < 0.35 + m.popularity * 0.75);
    if (pool.length === 0) pool = MODELS.filter((m) => m.yearFrom <= year);
  }
  return rnd.pick(pool);
}

function makeIssues(state: GameState, source: SourceDef, age: number, mileage: number, reliability: number): Issue[] {
  const rnd = gameRng;
  const issues: Issue[] = [];
  const ageRisk = clamp(age / 18, 0, 1.2);
  const mileRisk = clamp(mileage / 220000, 0, 1.2);
  const chance = source.issueChance * (0.6 + ageRisk * 0.5 + mileRisk * 0.5) * (1.35 - reliability * 0.7);
  for (let i = 0; i < source.issueRolls; i += 1) {
    if (!rnd.chance(chance)) continue;
    // Severity skews up with age and mileage.
    const pool = ISSUE_TEMPLATES.filter((t) => {
      if (t.severity === 3) return rnd.chance(0.25 + (ageRisk + mileRisk) * 0.15);
      return true;
    });
    const t = rnd.pick(pool);
    if (issues.some((x) => x.name === t.name)) continue;
    const cost = Math.round(rnd.range(t.cost[0], t.cost[1]) / 10) * 10;
    issues.push({
      id: nextId(state, 'i'),
      system: t.system,
      name: t.name,
      severity: t.severity,
      repairCost: cost,
      valueImpact: Math.round(cost * (t.severity === 3 ? 1.9 : 1.5)),
      discovered: false,
      fixed: false,
      visible: rnd.chance(t.visible),
    });
  }
  return issues;
}

/** Generates a vehicle with a history. Prices are filled by the caller. */
export function generateVehicle(state: GameState, opts: GenOptions): Vehicle {
  const rnd = gameRng;
  const source = opts.source === 'tradein' ? TRADEIN_SOURCE : SOURCE_BY_ID[opts.source];
  const model = pickModel(state, opts);
  const brand = BRAND_BY_ID[model.brandId];
  const nowYear = yearOf(state.day);
  const maxYear = Math.min(model.yearTo, nowYear);
  let year: number;
  const isNew = opts.source === 'manufacturer';
  if (isNew) {
    year = maxYear;
  } else if (model.category === 'Classic' || model.category === 'Rare') {
    year = rnd.int(model.yearFrom, maxYear);
  } else if (opts.source === 'lease') {
    year = clamp(maxYear - rnd.int(2, 5), model.yearFrom, maxYear);
  } else if (opts.source === 'fleet') {
    year = clamp(maxYear - rnd.int(2, 6), model.yearFrom, maxYear);
  } else {
    // Most stock is 2–12 years old.
    const minYear = Math.max(model.yearFrom, nowYear - 18);
    const age = Math.min(maxYear - minYear, Math.round(Math.abs(rnd.around(0, 1)) * 11 + rnd.range(1, 3)));
    year = clamp(maxYear - age, minYear, maxYear);
  }
  const age = Math.max(0, nowYear - year);
  const gen = model.generations.find((g) => year >= g.from && year <= g.to) ?? model.generations[0];
  const engine = rnd.pick(model.engines);
  const perYear = model.category === 'Van' || model.category === 'Commercial' ? 22000 : model.category === 'Classic' || model.category === 'Rare' ? 3500 : model.category === 'Performance' || model.category === 'Luxury' ? 9000 : 15000;
  const usage = opts.source === 'fleet' ? rnd.range(1.4, 2.4) : opts.source === 'lease' ? rnd.range(0.8, 1.2) : rnd.range(0.45, 1.6);
  const mileage = isNew ? rnd.int(5, 60) : Math.max(900, Math.round((Math.max(0.4, age) * perYear * usage) / 100) * 100);
  const color = rnd.pick(COLORS);
  const optionCount = clamp(Math.round(rnd.range(0, 3) + model.trims.length * 0.3 + (model.basePrice > 45000 ? 3 : 0)), 0, 9);
  const optionPool = OPTIONS.filter((o) => (o.id !== 'heatpump' || engine.fuel === 'Electric') && (o.id !== 'offroad' || ['SUV', 'Pickup', 'Offroader'].includes(model.body)));
  const options = rnd.sample(optionPool, optionCount).map((o) => o.name);
  const quality = (opts.quality ?? 0) + (opts.source === 'lease' ? 0.3 : opts.source === 'liquidation' ? -0.4 : 0);
  const condition = isNew ? 100 : clamp(Math.round(92 - age * 2.1 - mileage / 9000 + rnd.around(0, 14) + quality * 10), 18, 99);
  const overstatement = isNew ? 0 : Math.max(0, rnd.around(source.conditionSpread * 0.55, source.conditionSpread * 0.6));
  const apparentCondition = clamp(Math.round(condition + overstatement), 20, 100);
  const issues = isNew ? [] : makeIssues(state, source, age, mileage, brand.reliability);
  const transmission = model.category === 'Electric' || engine.fuel === 'Electric' ? 'Automatic'
    : model.basePrice > 55000 ? (rnd.chance(0.9) ? 'Automatic' : 'Manual')
    : rnd.chance(0.45 + Math.max(0, year - 2012) * 0.03) ? 'Automatic' : 'Manual';
  const owners = clamp(Math.round(age / 4 + rnd.range(0, 2)), 1, 9);
  const serviceHistory = isNew || opts.source === 'lease' ? 'Full' as const
    : opts.source === 'fleet' ? (rnd.chance(0.85) ? 'Full' as const : 'Partial' as const)
    : opts.source === 'liquidation' ? (rnd.chance(0.5) ? 'None' as const : 'Partial' as const)
    : rnd.chance(0.55) ? 'Full' as const : rnd.chance(0.7) ? 'Partial' as const : 'None' as const;
  const history: string[] = isNew ? ['New — factory warranty', 'Delivery mileage only'] : [
    `${owners} previous owner${owners > 1 ? 's' : ''}`,
    serviceHistory === 'Full' ? 'Service book present' : serviceHistory === 'Partial' ? 'Partial service history' : 'No service records',
  ];
  if (!isNew && (opts.source === 'importer' || rnd.chance(0.12))) history.push('Imported');
  if (opts.source === 'fleet' || (!isNew && rnd.chance(0.08))) history.push('Ex-fleet vehicle');
  if (opts.source === 'lease') history.push('Lease return');
  if (opts.source === 'liquidation') history.push('Repossessed — sold as seen');
  const leatherOpt = options.includes('Leather');
  const lux = model.category === 'Luxury' || model.category === 'Performance' || model.category === 'Premium';
  const interior = leatherOpt || (lux && rnd.chance(0.7))
    ? rnd.pick(INTERIORS.filter((i) => i.luxury >= (model.category === 'Luxury' ? 0.55 : 0.5)))
    : rnd.pick(INTERIORS.filter((i) => i.luxury === 0 || (model.category === 'Sport' && i.name.includes('Alcantara'))));

  const v: Vehicle = {
    id: nextId(state, 'v'),
    modelId: model.id,
    brand: brand.name,
    brandId: brand.id,
    model: model.name,
    generation: gen.code,
    year,
    trim: rnd.pick(model.trims),
    body: model.body,
    category: model.category,
    fuel: engine.fuel,
    transmission,
    engine: engine.label,
    hp: engine.hp,
    mileage,
    color: color.name,
    colorHex: color.hex,
    options,
    condition,
    apparentCondition,
    presentation: isNew ? 95 : clamp(Math.round(rnd.range(20, 55) + quality * 10), 5, 80),
    issues,
    inspectionLevel: isNew ? 2 : 0,
    photosPro: false,
    drivetrain: drivetrainOf(model.body, model.category, engine.label, rnd.next()),
    interior: interior.name,
    serviceHistory,
    isNew: isNew || undefined,
    reliability: brand.reliability,
    popularity: clamp(model.popularity * 0.8 + rnd.range(0, 0.2), 0, 1),
    rarity: model.rarity,
    source: opts.source,
    seller: opts.source === 'private' ? 'Private seller' : opts.source === 'tradein' ? 'Customer trade-in' : isNew ? `${brand.name} Distribution` : opts.source === 'lease' ? rnd.pick(['FleetLease Returns', 'Lease-End Direct', 'CarLease Remarketing']) : opts.source === 'fleet' ? rnd.pick(['CityCab Co.', 'Metro Rentals', 'Company car pool', 'EuroDrive Hire']) : opts.source === 'importer' ? rnd.pick(['EuroImport BV', 'Continental Cars', 'Channel Imports']) : opts.source === 'liquidation' ? rnd.pick(['Receiver: AutoPlaza', 'Bailiff auction', 'Finance repossessions']) : rnd.pick(SELLER_NAMES.filter((s) => s !== 'Private seller')),
    history,
    purchasePrice: 0,
    offerPrice: 0,
    costs: { transport: 0, inspection: 0, repairs: 0, detailing: 0, other: 0 },
    askingPrice: 0,
    floorPrice: 0,
    status: 'offer',
    locationId: opts.locationId,
    daysInStock: 0,
    boughtDay: 0,
    arrivalDay: 0,
    prep: [],
    listedOnline: false,
  };
  // Visible defects are known to everyone.
  for (const issue of v.issues) if (issue.visible) issue.discovered = true;
  return v;
}

/** Legacy / buyer-staff discount multiplier on purchase prices. */
export function buyingPower(state: GameState): number {
  const buyers = state.employees.filter((e) => e.role === 'buyer');
  const best = buyers.reduce((m, e) => Math.max(m, e.skill), 0);
  const perk = (state.legacy.perks.network ?? 0) * 0.03;
  return clamp(1 - best / 1000 - buyers.length * 0.005 - perk, 0.82, 1);
}

/** Creates a market offer from a source with a price and expiry. */
/** What the market shows depends on how big you are: nobody offers a small lot a supercar. */
const LEVEL_PRICE_CAP = [26000, 45000, 85000, 160000, 320000, 600000, 1500000];

/** Supplier relationship 0..100 turns into a price factor (±3%) and more offers. */
export function supplierFactor(state: GameState, sourceId: SourceId): number {
  const rel = state.suppliers?.[sourceId] ?? 50;
  return 1 - (rel - 50) / 1650;
}

export function createOffer(state: GameState, sourceId: SourceId, locationId: string, brandId?: string): Vehicle {
  const rnd = gameRng;
  const source = SOURCE_BY_ID[sourceId];
  const mods = marketMods(state);
  const cap = Math.max(LEVEL_PRICE_CAP[state.companyLevel - 1] ?? 26000, state.cash * 0.9);
  // Buyers find more of what the dealership specialises in; with predictive demand, of what is trending.
  const focus = STRATEGY_BY_ID[state.locations.find((l) => l.id === locationId)?.strategy ?? 'balanced'];
  let categories: string[] | undefined = focus?.categories && rnd.chance(0.55) ? focus.categories : undefined;
  if (!categories && hasTech(state, 'predictive') && rnd.chance(0.35)) {
    const hot = Object.entries(mods.category).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
    categories = hot;
  }
  let v = generateVehicle(state, { source: sourceId, locationId, categories, brandId });
  for (let i = 0; i < 6 && sourceId !== 'special' && sourceId !== 'manufacturer' && bookValue(state, v, mods) * TRADE_FACTOR > cap; i += 1) {
    v = generateVehicle(state, { source: sourceId, locationId, maxBase: cap * 1.6, brandId });
  }
  if (sourceId === 'manufacturer') {
    // Dealer price: list price minus the franchise margin (better at higher tiers).
    const brand = BRAND_BY_ID[v.brandId];
    const contract = state.contracts?.find((c) => c.brandId === v.brandId);
    const margin = (brand.dealer?.margin ?? 0.08) + (contract ? (contract.tier - 1) * 0.012 : 0);
    const list = bookValue(state, v, mods);
    v.offerPrice = roundPrice(list * (1 - margin));
    v.expiresDay = state.day + rnd.int(4, 8);
    return v;
  }
  const apparent = bookValue(state, v, mods) * TRADE_FACTOR;
  // A good name opens doors: reputable dealers are offered slightly better prices.
  const repTerms = 1.03 - state.reputation * 0.0006;
  const importDuty = sourceId === 'importer' ? state.economy?.importCost ?? 1 : 1;
  const factor = rnd.range(source.priceFactor[0], source.priceFactor[1]) * mods.purchase * buyingPower(state) * repTerms * supplierFactor(state, sourceId) * importDuty;
  v.offerPrice = roundPrice(apparent * factor);
  v.expiresDay = state.day + rnd.int(2, 5);
  if (AUCTION_SOURCES.includes(sourceId)) {
    const start = roundPrice(apparent * rnd.range(0.4, 0.6));
    v.auction = {
      currentBid: start,
      bids: rnd.int(0, 4),
      myBid: 0,
      reserve: roundPrice(apparent * factor),
    };
    v.offerPrice = start;
    v.expiresDay = state.day + rnd.int(1, 3);
  }
  return v;
}

export function transportCost(sourceId: SourceId, v: Vehicle): number {
  const source = sourceId === 'tradein' ? TRADEIN_SOURCE : SOURCE_BY_ID[sourceId];
  const base = gameRng.range(source.transport[0], source.transport[1]);
  const heavy = v.body === 'Van' || v.body === 'Pickup' ? 1.2 : 1;
  const special = v.category === 'Rare' || v.category === 'Classic' || v.category === 'Luxury' ? 1.4 : 1;
  return Math.round((base * heavy * special) / 10) * 10;
}

/** Chance that an inspection finds a given hidden issue. */
export function detectionChance(state: GameState, locationId: string, advanced: boolean): number {
  const location = locationById(state, locationId) ?? activeLocation(state);
  const mechanics = staffAt(state, location.id).filter((e) => e.role === 'mechanic');
  const best = mechanics.reduce((m, e) => Math.max(m, e.skill), 0);
  const equipment = upgradeLevel(location, 'equipment');
  const eye = (state.legacy.perks.eye ?? 0) * 0.1;
  const base = advanced ? 0.5 : 0.25;
  const tech = hasTech(state, 'techdiag') ? 0.15 : 0;
  const technicians = staffAt(state, location.id).some((e) => e.role === 'technician') ? 0.05 : 0;
  return clamp(base + best / 250 + equipment * 0.15 + eye + tech + technicians, 0.1, 0.97);
}

export function inspectionCost(state: GameState, v: Vehicle, advanced: boolean): number {
  const location = locationById(state, v.locationId) ?? activeLocation(state);
  const hasMechanic = staffAt(state, location.id).some((e) => e.role === 'mechanic');
  const tier = v.purchasePrice > 40000 || v.offerPrice > 40000 ? 1.6 : 1;
  if (!advanced) return Math.round(90 * tier);
  const inHouse = hasMechanic || upgradeLevel(location, 'equipment') > 0;
  return Math.round((inHouse ? 160 : 290) * tier);
}

/** Runs a detection roll over the hidden defects. Returns the newly found ones. */
export function runInspection(state: GameState, v: Vehicle, advanced: boolean): Issue[] {
  const chance = detectionChance(state, v.locationId, advanced);
  const found: Issue[] = [];
  for (const issue of v.issues) {
    if (issue.discovered || issue.fixed) continue;
    const severityBonus = issue.severity === 3 ? 0.08 : 0;
    if (gameRng.chance(chance + severityBonus)) {
      issue.discovered = true;
      found.push(issue);
    }
  }
  return found;
}

/** Pre-purchase inspection of a market offer. */
export function prePurchaseInspect(state: GameState, v: Vehicle): { ok: boolean; message: string; found: Issue[] } {
  if (v.preInspected) return { ok: false, message: 'Already inspected.', found: [] };
  const cost = inspectionCost(state, v, true);
  if (state.cash < cost) return { ok: false, message: 'Not enough cash for an inspection.', found: [] };
  record(state, 'Other', -cost, `Pre-purchase inspection: ${vehicleName(v)}`);
  v.preInspected = true;
  const found = runInspection(state, v, true);
  // A proper look also reveals the real condition within a few points.
  v.apparentCondition = Math.round((v.apparentCondition + v.condition * 3) / 4);
  return { ok: true, message: found.length ? `Found ${found.length} problem${found.length > 1 ? 's' : ''}.` : 'No hidden problems found.', found };
}

/** Advanced inspection of an owned vehicle. */
export function inspectOwned(state: GameState, v: Vehicle): { ok: boolean; message: string; found: Issue[] } {
  if (v.inspectionLevel >= 2) return { ok: false, message: 'Already fully inspected.', found: [] };
  if (v.status === 'transit' || v.status === 'transfer') return { ok: false, message: 'The vehicle has not arrived yet.', found: [] };
  const cost = inspectionCost(state, v, true);
  if (state.cash < cost) return { ok: false, message: `An advanced inspection costs €${cost}.`, found: [] };
  v.costs.inspection += cost;
  record(state, 'Inspection', -cost, `Advanced inspection: ${vehicleName(v)}`, v.locationId);
  v.inspectionLevel = 2;
  const found = runInspection(state, v, true);
  giveXp(state, v.locationId, 'mechanic', 8);
  return {
    ok: true,
    message: found.length ? `Found ${found.length} hidden problem${found.length > 1 ? 's' : ''}.` : 'Clean bill of health.',
    found,
  };
}

/** Basic arrival inspection, free, always done on arrival. */
export function arrivalInspection(state: GameState, v: Vehicle): Issue[] {
  if (v.inspectionLevel >= 1) return [];
  v.inspectionLevel = 1;
  return runInspection(state, v, false);
}

function giveXp(state: GameState, locationId: string, role: string, xp: number): void {
  const staff = staffAt(state, locationId).filter((e) => e.role === role);
  if (staff.length === 0) return;
  const e = gameRng.pick(staff);
  e.xp += xp;
}

// ------------------------------------------------------------ preparation --

export function workshopMultiplier(state: GameState, locationId: string, action: PrepActionDef): number {
  const location = locationById(state, locationId) ?? activeLocation(state);
  if (action.staff === 'mechanic') {
    const w = upgradeLevel(location, 'workshop');
    return [1.25, 1.1, 1, 0.9, 0.8][w] ?? 1;
  }
  const d = upgradeLevel(location, 'detailing');
  return [1, 0.85, 0.75, 0.65][d] ?? 1;
}

function staffSkillFor(state: GameState, locationId: string, role: 'mechanic' | 'detailer'): number {
  return staffAt(state, locationId).filter((e) => e.role === role && e.trainingDaysLeft <= 0).reduce((m, e) => Math.max(m, e.skill), 0);
}

export function valueTier(state: GameState, v: Vehicle): number {
  return clamp(0.8 + bookValue(state, v) / 50000, 0.8, 3);
}

/** Issues a given prep action would fix. */
export function fixableIssues(v: Vehicle, action: PrepActionDef): Issue[] {
  if (!action.fixes) return [];
  return v.issues.filter((i) => !i.fixed && i.discovered && action.fixes!.includes(i.system));
}

export function prepCost(state: GameState, v: Vehicle, actionId: string): number {
  const action = PREP_BY_ID[actionId];
  if (!action) return 0;
  if (actionId === 'photos') {
    const location = locationById(state, v.locationId) ?? activeLocation(state);
    if (upgradeLevel(location, 'detailing') >= 3 || (lotStats(location.lot).effects.photo ?? 0) > 0 || photographer(state, location.id)) return 0;
    return action.cost;
  }
  const mult = workshopMultiplier(state, v.locationId, action);
  const skill = staffSkillFor(state, v.locationId, action.staff);
  const discount = 1 - skill / 700;
  let cost = action.cost * valueTier(state, v);
  const issues = fixableIssues(v, action);
  if (issues.length) cost = action.cost * 0.35 + issues.reduce((s, i) => s + i.repairCost, 0);
  const location = locationById(state, v.locationId);
  const service = location ? Math.min(5, lotStats(location.lot).effects.service ?? 0) : 0;
  // Parts already on the shelf are paid for: in-stock jobs cost less now.
  const parts = PREP_PARTS[actionId];
  const stocked = parts && location && Object.entries(parts).every(([k, n]) => (location.parts?.[k as keyof typeof parts] ?? 0) >= (n ?? 0)) ? 0.7 : 1;
  const ev = v.fuel === 'Electric' && action.staff === 'mechanic' && hasTech(state, 'evdiag') ? 0.8 : 1;
  // A vehicle prep specialist does the small stuff in-house for less.
  const prepper = PREP_SPECIALIST_JOBS.includes(actionId) ? prepSpecialist(state, v.locationId) : undefined;
  const prepDiscount = prepper ? 1 - Math.min(0.3, 0.12 + prepper.skill / 500) : 1;
  return Math.round((cost * mult * discount * (1 - service * 0.03) * stocked * ev * prepDiscount) / 10) * 10;
}

/** Parts a preparation job uses from stock when they are there. */
export const PREP_PARTS: Record<string, Partial<Record<import('./types').PartId, number>>> = {
  service: { oil: 1, filters: 2 },
  tyres: { tyres: 4 },
  brakes: { brakes: 1 },
  cosmetic: { body: 1 },
  minor: { other: 2 },
  major: { other: 3 },
};

/** Jobs a vehicle prep specialist speeds up. */
const PREP_SPECIALIST_JOBS = ['wash', 'deepclean', 'detail', 'cosmetic', 'interior', 'minor', 'tyres'];

function prepSpecialist(state: GameState, locationId: string) {
  return state.employees.filter((e) => e.locationId === locationId && e.role === 'prep' && e.trainingDaysLeft <= 0 && e.stationId && e.absentDay !== state.day).sort((a, b) => b.skill - a.skill)[0];
}

function photographer(state: GameState, locationId: string) {
  return state.employees.find((e) => e.locationId === locationId && e.role === 'photographer' && e.trainingDaysLeft <= 0 && e.stationId && e.absentDay !== state.day);
}

export function prepDays(state: GameState, v: Vehicle, actionId: string): number {
  const action = PREP_BY_ID[actionId];
  if (!action || action.days === 0) return 0;
  const location = locationById(state, v.locationId) ?? activeLocation(state);
  let days = action.days;
  if (PREP_SPECIALIST_JOBS.includes(actionId) && prepSpecialist(state, v.locationId) && days > 1) days -= 1;
  if (actionId === 'photos' && photographer(state, v.locationId)) return 0;
  if (hasTech(state, 'leanops') && days > 1) days -= 1;
  if (action.staff === 'mechanic') {
    const w = upgradeLevel(location, 'workshop');
    if (w >= 3) days -= 1;
    const staff = staffSkillFor(state, v.locationId, 'mechanic');
    if (staff >= 70) days -= 1;
    if (staff === 0 && w === 0) days += 1; // outsourced
  } else {
    const staff = staffSkillFor(state, v.locationId, 'detailer');
    if (staff >= 60 || upgradeLevel(location, 'detailing') >= 2) days -= 1;
  }
  return Math.max(action.days > 1 ? 1 : 0, days);
}

export interface PrepCheck { ok: boolean; reason?: string; cost: number; days: number; }

export function canPrep(state: GameState, v: Vehicle, actionId: string): PrepCheck {
  const action = PREP_BY_ID[actionId];
  const cost = prepCost(state, v, actionId);
  const days = prepDays(state, v, actionId);
  if (!action) return { ok: false, reason: 'Unknown job.', cost, days };
  if (v.status === 'transit' || v.status === 'transfer') return { ok: false, reason: 'Not arrived yet.', cost, days };
  if (v.status === 'sold') return { ok: false, reason: 'Sold.', cost, days };
  if (v.prep.some((p) => p.actionId === actionId)) return { ok: false, reason: 'Already queued.', cost, days };
  const location = locationById(state, v.locationId) ?? activeLocation(state);
  if (action.requiresWorkshop && upgradeLevel(location, 'workshop') < action.requiresWorkshop) {
    return { ok: false, reason: `Needs Workshop level ${action.requiresWorkshop}.`, cost, days };
  }
  if ((actionId === 'minor' || actionId === 'major') && fixableIssues(v, action).length === 0) {
    return { ok: false, reason: 'No discovered faults of this kind.', cost, days };
  }
  if (actionId === 'photos' && v.photosPro) return { ok: false, reason: 'Already photographed.', cost, days };
  if (actionId === 'wash' && v.presentation >= 55) return { ok: false, reason: 'Already clean.', cost, days };
  if (actionId === 'deepclean' && v.presentation >= 72) return { ok: false, reason: 'Already spotless.', cost, days };
  if (actionId === 'detail' && v.presentation >= 92) return { ok: false, reason: 'Already detailed.', cost, days };
  if (actionId === 'service' && v.history.includes('Fresh service')) return { ok: false, reason: 'Recently serviced.', cost, days };
  if (state.cash < cost) return { ok: false, reason: 'Not enough cash.', cost, days };
  return { ok: true, cost, days };
}

/** Applies the effect of a prep action. */
export function applyPrep(state: GameState, v: Vehicle, actionId: string): string {
  const action = PREP_BY_ID[actionId];
  if (!action) return '';
  const skill = staffSkillFor(state, v.locationId, action.staff);
  const quality = 1 + skill / 400;
  const gain = action.condition * quality * (1 - v.condition / 115);
  v.condition = clamp(Math.round(v.condition + gain), 0, 100);
  // Mechanical work also gets reflected in the listed condition.
  v.apparentCondition = clamp(Math.round(Math.max(v.apparentCondition + gain, v.condition)), 0, 100);
  const targets: Record<string, number> = { wash: 55, deepclean: 72, detail: 92 };
  if (targets[actionId]) v.presentation = Math.max(v.presentation, Math.round(targets[actionId] * Math.min(1.08, quality)));
  else if (action.presentation) v.presentation = clamp(v.presentation + Math.round(action.presentation * 0.5 * quality), 0, 100);
  v.presentation = clamp(v.presentation, 0, 100);
  if (actionId === 'photos') v.photosPro = true;
  if (actionId === 'service') {
    v.history = v.history.filter((h) => h !== 'Partial service history');
    v.history.push('Fresh service');
    const missing = v.issues.find((i) => i.name === 'Missing service history' && !i.fixed);
    if (missing) missing.fixed = true;
  }
  const fixed: string[] = [];
  for (const issue of fixableIssues(v, action)) {
    issue.fixed = true;
    fixed.push(issue.name);
  }
  if (action.fixes && (actionId === 'tyres' || actionId === 'brakes' || actionId === 'cosmetic' || actionId === 'interior')) {
    // Replacing a whole system also cures anything hidden in it.
    for (const issue of v.issues) {
      if (!issue.fixed && action.fixes.includes(issue.system)) {
        issue.fixed = true;
        issue.discovered = true;
        fixed.push(issue.name);
      }
    }
  }
  giveXp(state, v.locationId, action.staff, 6 + action.days * 3);
  return fixed.length ? `${action.name} done: fixed ${fixed.join(', ')}.` : `${action.name} done.`;
}

/** Queues (or instantly performs) a preparation job. */
export function startPrep(state: GameState, v: Vehicle, actionId: string): { ok: boolean; message: string } {
  const check = canPrep(state, v, actionId);
  if (!check.ok) return { ok: false, message: check.reason ?? 'Not possible.' };
  const action = PREP_BY_ID[actionId];
  const category = action.staff === 'mechanic' ? 'Repairs' : 'Detailing';
  if (check.cost > 0) record(state, category, -check.cost, `${action.name}: ${vehicleName(v)}`, v.locationId);
  // Use parts from the shelf if they are there (that is why the job was cheaper).
  const parts = PREP_PARTS[actionId];
  const location = locationById(state, v.locationId);
  if (parts && location && Object.entries(parts).every(([k, n]) => (location.parts?.[k as keyof typeof parts] ?? 0) >= (n ?? 0))) {
    for (const [k, n] of Object.entries(parts)) location.parts![k as keyof typeof parts] = (location.parts![k as keyof typeof parts] ?? 0) - (n ?? 0);
  }
  if (action.staff === 'mechanic') v.costs.repairs += check.cost;
  else v.costs.detailing += check.cost;
  if (check.days === 0) {
    const msg = applyPrep(state, v, actionId);
    return { ok: true, message: msg };
  }
  v.prep.push({ actionId, daysLeft: check.days, totalDays: check.days, cost: check.cost });
  if (v.status === 'listed' || v.status === 'yard') {
    v.status = 'prep';
    v.listedOnline = false;
  }
  const loc = locationById(state, v.locationId);
  if (loc) assignSlots(state, loc);
  const where = prepActive(state, v);
  const note = where === 'working' ? (action.staff === 'mechanic' ? ' It is on the lift.' : ' It is in the detailing bay.')
    : where === 'waiting' ? ` It waits for a free ${action.staff === 'mechanic' ? 'lift' : 'detailing bay'}.` : ' The work is outsourced.';
  return { ok: true, message: `${action.name} booked — ${check.days} day${check.days > 1 ? 's' : ''}.${note}` };
}

/**
 * How many cars of one kind of job can be worked on per day.
 * With lifts / detailing bays built, only cars physically standing on one make
 * progress; without any, the work is outsourced (or done by hand on the lot).
 */
export function prepSlots(state: GameState, locationId: string, role: 'mechanic' | 'detailer'): number {
  const location = locationById(state, locationId);
  if (!location) return 1;
  const bays = lotStats(location.lot).slots[role === 'mechanic' ? 'lift' : 'bay'].length;
  if (bays > 0) return bays;
  const staff = staffAt(state, locationId).filter((e) => e.role === role && e.trainingDaysLeft <= 0).length;
  return 1 + staff + Math.floor(Math.min(5, lotStats(location.lot).effects.service ?? 0) / 2);
}

/** Is this car's current job actually being worked on? */
export function prepActive(state: GameState, v: Vehicle): 'working' | 'waiting' | 'outsourced' | 'none' {
  if (v.status !== 'prep' || !v.prep.length) return 'none';
  const location = locationById(state, v.locationId);
  if (!location) return 'outsourced';
  const role = PREP_BY_ID[v.prep[0].actionId]?.staff ?? 'mechanic';
  const kind = role === 'mechanic' ? 'lift' : 'bay';
  if (lotStats(location.lot).slots[kind].length === 0) return 'outsourced';
  return slotKindOf(location, v.slotId) === kind ? 'working' : 'waiting';
}

/** Daily progress of queued preparation. */
export function prepDaily(state: GameState): void {
  for (const loc of state.locations) assignSlots(state, loc);
  const used: Record<string, number> = {};
  for (const v of state.vehicles) {
    if (v.status !== 'prep' || v.prep.length === 0) continue;
    const task = v.prep[0];
    const action = PREP_BY_ID[task.actionId];
    const role = action?.staff ?? 'mechanic';
    const mode = prepActive(state, v);
    if (mode === 'waiting') continue;
    if (mode === 'outsourced') {
      const key = `${v.locationId}:${role}`;
      if ((used[key] ?? 0) >= prepSlots(state, v.locationId, role)) continue;
      used[key] = (used[key] ?? 0) + 1;
    }
    task.daysLeft -= 1;
    if (task.daysLeft <= 0) {
      v.prep.shift();
      const msg = applyPrep(state, v, task.actionId);
      if (v.prep.length === 0) {
        v.status = 'yard';
        const auto = state.autoList[v.locationId];
        const hasManager = staffAt(state, v.locationId).some((e) => e.role === 'manager' || e.role === 'inventory') || hasTech(state, 'autoinventory');
        if (auto && hasManager) {
          v.askingPrice = v.askingPrice || suggestedPrice(state, v);
          v.floorPrice = v.floorPrice || roundPrice(v.askingPrice * 0.92);
          const loc = locationById(state, v.locationId);
          if (loc && showSpaceFor(state, loc, v)) {
            v.status = 'listed';
            v.listedOnline = true;
          }
        }
        pushNotice(state, 'good', `${vehicleName(v)} is ready. ${msg}`);
        emit('fx', { locationId: v.locationId, kind: 'prep-done', ref: v.id, label: `🔧 → 🟢 ${v.model} ready` });
      }
    }
  }
  for (const loc of state.locations) assignSlots(state, loc);
}

/** A customer-facing space for this car (its own, or a free one), or undefined. */
export function showSpaceFor(state: GameState, loc: Location, v: Vehicle): string | undefined {
  if (isVisibleSlot(loc, v.slotId)) return v.slotId;
  return findFreeSlot(state, loc, ['display', 'parking'])?.id;
}

/** Customer-perceived appeal score 0..1 of a listed vehicle. */
export function appealScore(state: GameState, v: Vehicle): number {
  const location = locationById(state, v.locationId);
  const showroom = location ? upgradeLevel(location, 'showroom') : 0;
  // A car on a lit indoor display looks better than the same car on the lot.
  const bonus = location ? spotBonus(location, v) : { attention: 0 };
  const indoor = location && (slotKindOf(location, v.slotId) === 'display' || (slotKindOf(location, v.slotId) === 'floor' && isIndoorSlot(location, v.slotId)));
  const spot = (indoor ? 0.02 + showroom * 0.02 : showroom * 0.01) + bonus.attention / 400;
  const ev = location && v.fuel === 'Electric' && (lotStats(location.lot).effects.ev ?? 0) > 0 ? 0.03 : 0;
  return clamp(0.25 + v.presentation / 200 + v.condition / 400 + spot + ev + (v.photosPro ? 0.04 : 0), 0, 1);
}

/** Online listing quality 0..1. */
export function listingQuality(state: GameState, v: Vehicle): number {
  const location = locationById(state, v.locationId);
  const marketing = location ? upgradeLevel(location, 'marketing') : 0;
  const mktStaff = state.employees.filter((e) => e.role === 'marketing').reduce((m, e) => Math.max(m, e.skill), 0);
  const value = trueValue(state, v);
  const priceComp = v.askingPrice > 0 ? clamp(1.25 - v.askingPrice / Math.max(1, value) * 0.9 + 0.2, 0, 1) : 0.5;
  // A photographer makes every listing look better, pro photos or not.
  const photo = photographer(state, v.locationId);
  const photoBonus = photo ? 0.05 + photo.skill / 1000 : 0;
  return clamp(
    0.28 * (v.presentation / 100) + (v.photosPro ? 0.22 : 0.04) + 0.12 * (marketing / 3) + 0.2 * priceComp + 0.1 * (state.reputation / 100) + mktStaff / 1000 + photoBonus,
    0.05,
    1,
  );
}

/** Nightly decay of presentation for vehicles standing on the lot. */
export function presentationDecay(state: GameState): void {
  for (const v of state.vehicles) {
    if (v.status !== 'listed' && v.status !== 'yard') continue;
    const location = locationById(state, v.locationId);
    // Indoors, cars stay clean; outside they gather dust and rain spots.
    const indoor = location && (slotKindOf(location, v.slotId) === 'display' || isIndoorSlot(location, v.slotId));
    const showroom = location ? upgradeLevel(location, 'showroom') : 0;
    // A cleaner keeps the cars dusted.
    const cleaner = location && staffAt(state, location.id).some((e) => e.role === 'cleaner' && e.stationId) ? 0.4 : 1;
    const decay = (indoor ? 0.35 - showroom * 0.03 : 1.2) * cleaner;
    v.presentation = clamp(v.presentation - Math.max(0.1, decay), 0, 100);
  }
}
