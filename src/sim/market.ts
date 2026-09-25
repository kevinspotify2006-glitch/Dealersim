/**
 * Vehicle valuation and market conditions.
 *
 * There are two values for every vehicle:
 *   trueValue   — what the car is really worth, including defects nobody has
 *                 found yet. Customers pay against this.
 *   bookValue   — what the dealer believes it is worth from what they know:
 *                 the claimed or inspected condition and the defects found.
 * The gap between them is where the risk (and the occasional bargain) lives.
 */
import type { BodyType, Category, ConditionGrade, Drivetrain, FuelType, GameState, Vehicle } from './types';
import { BRAND_BY_ID, CATEGORIES, FUELS, MODEL_BY_ID, OPTIONS, COLORS, INTERIOR_BY_NAME } from '../data/vehicles';
import { economyFactors } from './systems/economy';
import { calendar } from './format';
import { EVENT_BY_ID, STRATEGY_BY_ID } from '../data/game';
import { seasonOf, yearOf } from './format';
import { clamp } from './util';

export interface MarketMods {
  category: Record<string, number>;
  fuel: Record<string, number>;
  body: Record<string, number>;
  brand: Record<string, number>;
  demand: number;
  supply: number;
  purchase: number;
}

const OPTION_VALUE: Record<string, number> = Object.fromEntries(OPTIONS.map((o) => [o.name, o.value]));
const COLOR_APPEAL: Record<string, number> = Object.fromEntries(COLORS.map((c) => [c.name, c.appeal]));

/** Season effects on body styles, categories and drivetrains. */
function seasonal(day: number, body: BodyType, category: Category, fuel: FuelType, drive?: Drivetrain): number {
  const season = seasonOf(day);
  const month = calendar(day).month;
  let f = 1;
  // Winter: four-wheel drive and high cars; summer holidays: space for the family.
  if (drive === 'AWD' || drive === '4x4') f *= season === 'Winter' ? 1.05 : season === 'Summer' ? 0.99 : 1;
  if ((month === 6 || month === 7) && (category === 'Family' || body === 'Wagon' || body === 'Van')) f *= 1.04;
  if (body === 'Convertible' || body === 'Roadster') {
    f *= season === 'Summer' ? 1.12 : season === 'Spring' ? 1.07 : season === 'Winter' ? 0.88 : 0.96;
  }
  if (body === 'SUV' || body === 'Pickup') f *= season === 'Winter' ? 1.05 : 1;
  if (category === 'Sport' || category === 'Performance') f *= season === 'Summer' ? 1.04 : season === 'Winter' ? 0.96 : 1;
  if (fuel === 'Electric') f *= season === 'Winter' ? 0.97 : 1.01;
  return f;
}

const modsCache = new WeakMap<GameState, { key: string; mods: MarketMods }>();

/** Combined multipliers from trends, events and the economy (cached per day; callers must not mutate it). */
export function marketMods(state: GameState): MarketMods {
  const e = state.economy;
  const key = `${state.day}|${state.events.map((x) => x.id + (x.targetBrand ?? '')).join(',')}|${e ? `${e.fuel}|${e.rate}|${e.growth}|${e.confidence}|${e.evIncentive}|${e.importCost}` : ''}|${state.trendHistory.length}|${state.trends.Economy ?? 1}`;
  const hit = modsCache.get(state);
  if (hit && hit.key === key) return hit.mods;
  const mods = computeMods(state);
  modsCache.set(state, { key, mods });
  return mods;
}

function computeMods(state: GameState): MarketMods {
  const mods: MarketMods = { category: {}, fuel: {}, body: {}, brand: {}, demand: 1, supply: 1, purchase: 1 };
  for (const c of CATEGORIES) mods.category[c] = state.trends[c] ?? 1;
  for (const f of FUELS) mods.fuel[f] = state.trends[f] ?? 1;
  // The economy: fuel prices, confidence, growth and interest rates.
  if (state.economy) {
    const e = economyFactors(state.economy);
    for (const [k, v] of Object.entries(e.fuel)) mods.fuel[k] = (mods.fuel[k] ?? 1) * v;
    for (const [k, v] of Object.entries(e.body)) mods.body[k] = (mods.body[k] ?? 1) * (v as number);
    for (const [k, v] of Object.entries(e.category)) mods.category[k] = (mods.category[k] ?? 1) * (v as number);
    mods.demand *= e.demand;
    mods.purchase *= 1 + (e.importCost - 1) * 0.3;
  }
  for (const active of state.events) {
    const def = EVENT_BY_ID[active.defId];
    if (!def) continue;
    for (const [k, v] of Object.entries(def.category ?? {})) mods.category[k] = (mods.category[k] ?? 1) * (v as number);
    for (const [k, v] of Object.entries(def.fuel ?? {})) mods.fuel[k] = (mods.fuel[k] ?? 1) * (v as number);
    for (const [k, v] of Object.entries(def.body ?? {})) mods.body[k] = (mods.body[k] ?? 1) * (v as number);
    if (def.demand) mods.demand *= def.demand;
    if (def.supply) mods.supply *= def.supply;
    if (def.purchasePrice) mods.purchase *= def.purchasePrice;
    if (active.targetBrand) {
      const hit = def.special === 'recall' ? 0.86 : def.special === 'promotion' ? 0.92 : 1;
      mods.brand[active.targetBrand] = (mods.brand[active.targetBrand] ?? 1) * hit;
    }
  }
  return mods;
}

/** Depreciation curve for a model at a given age. */
export function ageFactor(depreciation: number, age: number): number {
  if (age <= 0) return 0.92;
  if (depreciation < 0) {
    // Classics: normal depreciation until 20 years, then appreciation.
    if (age < 20) return Math.max(0.1, 0.8 * Math.pow(0.9, age - 1));
    const base = 0.8 * Math.pow(0.9, 19);
    return clamp(base * Math.pow(1 + Math.abs(depreciation) * 4, age - 19), 0.1, 3.2);
  }
  return Math.max(0.06, 0.82 * Math.pow(1 - depreciation, age - 1));
}

export function mileageFactor(mileage: number, age: number): number {
  const expected = Math.max(1, age) * 14000;
  const diff = (mileage - expected) / 100000;
  let f = 1 - diff * 0.22;
  if (mileage > 250000) f *= 0.85;
  return clamp(f, 0.55, 1.12);
}

export function conditionFactor(condition: number): number {
  return 0.52 + 0.63 * (clamp(condition, 0, 100) / 100);
}

/** Value before condition and defects: model, age, mileage, spec, market. */
function baseValue(state: GameState, v: Vehicle, mods: MarketMods): number {
  const model = MODEL_BY_ID[v.modelId];
  const brand = BRAND_BY_ID[v.brandId];
  if (!model || !brand) return 1000;
  const age = yearOf(state.day) - v.year;
  const trimIndex = Math.max(0, model.trims.indexOf(v.trim));
  const minHp = Math.min(...model.engines.map((e) => e.hp));
  const hpBonus = clamp((v.hp / minHp - 1) * 0.3, 0, 0.45);
  let value = model.basePrice * (1 + trimIndex * 0.045 + hpBonus);
  // A new car is worth its list price; a used one depreciates with age and miles.
  if (!v.isNew) {
    value *= ageFactor(model.depreciation, age);
    value *= mileageFactor(v.mileage, age);
  }
  value *= 1 + (v.interior ? INTERIOR_BY_NAME[v.interior]?.value ?? 0 : 0);
  if (v.serviceHistory === 'Full') value *= 1.02;
  else if (v.serviceHistory === 'None') value *= 0.95;
  if (v.certified) value *= 1.035;
  if (v.demo) value *= 0.97;              // ex-demo: a little cheaper
  let optionBonus = 0;
  for (const o of v.options) optionBonus += OPTION_VALUE[o] ?? 0;
  value *= 1 + optionBonus;
  value *= COLOR_APPEAL[v.color] ?? 1;
  value *= 1 + v.rarity * 0.08;
  value *= mods.category[v.category] ?? 1;
  value *= mods.fuel[v.fuel] ?? 1;
  value *= mods.body[v.body] ?? 1;
  value *= mods.brand[v.brandId] ?? 1;
  value *= 0.9 + brand.popularity * 0.12;
  if (v.transmission === 'Automatic' && v.category !== 'Classic' && v.category !== 'Rare') value *= 1.03;
  value *= seasonal(state.day, v.body, v.category, v.fuel, v.drivetrain);
  return value;
}

function defectPenalty(v: Vehicle, knownOnly: boolean): { amount: number; factor: number } {
  let amount = 0;
  let factor = 1;
  for (const issue of v.issues) {
    if (issue.fixed) continue;
    if (knownOnly && !issue.discovered) continue;
    if (issue.system === 'History') {
      factor *= issue.severity === 3 ? 0.72 : 0.95;
    } else {
      amount += issue.valueImpact;
    }
  }
  return { amount, factor };
}

/** What the car is really worth right now (customers pay against this). */
export function trueValue(state: GameState, v: Vehicle, mods = marketMods(state)): number {
  const base = baseValue(state, v, mods) * (v.isNew ? 1 : conditionFactor(v.condition));
  const pen = defectPenalty(v, false);
  return Math.max(300, Math.round((base * pen.factor - pen.amount) / 10) * 10);
}

/** Condition the dealer believes the car is in. */
export function knownCondition(v: Vehicle): number {
  if (v.inspectionLevel >= 2) return v.condition;
  if (v.inspectionLevel === 1) return Math.round((v.condition * 2 + v.apparentCondition) / 3);
  return v.apparentCondition;
}

/** What the dealer's price guide says, from what is known. */
export function bookValue(state: GameState, v: Vehicle, mods = marketMods(state)): number {
  const base = baseValue(state, v, mods) * (v.isNew ? 1 : conditionFactor(knownCondition(v)));
  const pen = defectPenalty(v, true);
  return Math.max(300, Math.round((base * pen.factor - pen.amount) / 10) * 10);
}

/** Dealers buy at trade prices, well below retail market value. */
export const TRADE_FACTOR = 0.9;

/** Trade (wholesale) value of a vehicle from what is known. */
export function tradeValue(state: GameState, v: Vehicle, mods = marketMods(state)): number {
  return Math.round(bookValue(state, v, mods) * TRADE_FACTOR);
}

/** Suggested retail asking price: book value plus a dealer margin. */
export function suggestedPrice(state: GameState, v: Vehicle, mods = marketMods(state)): number {
  // AI pricing reads the live market: it prices close to what the car is really worth.
  const ai = !!state.research?.done?.aipricing;
  const book = ai ? Math.round((bookValue(state, v, mods) + trueValue(state, v, mods)) / 2) : bookValue(state, v, mods);
  if (v.isNew) return roundPrice(book);
  const margin = (book < 8000 ? 1.06 : book < 30000 ? 1.04 : 1.03) + (ai ? 0.02 : 0);
  const presentation = 0.97 + (v.presentation / 100) * 0.06;
  const loc = state.locations.find((l) => l.id === v.locationId);
  const bias = STRATEGY_BY_ID[loc?.strategy ?? 'balanced']?.priceBias ?? 1;
  const policy = PRICING_POLICY[loc?.pricing ?? 'market'].price;
  return roundPrice(book * margin * presentation * bias * policy * agePriceFactor(v));
}

/** Pricing policy per location: how you pitch prices against the market. */
export const PRICING_POLICY = {
  aggressive: { name: 'Aggressive', price: 0.96, interest: 0.08, description: 'Priced under the market: more interest, faster turnover, thinner margins.' },
  market: { name: 'Market', price: 1, interest: 0, description: 'Priced with the market.' },
  premium: { name: 'Premium', price: 1.05, interest: -0.07, description: 'Priced above the market: fewer bites, bigger margins. Works best with great presentation.' },
} as const;

/** Ageing stock: cars that sat for weeks are expected to be cheaper. */
export function agingBucket(v: Pick<Vehicle, 'daysInStock'>): '0-30' | '31-60' | '61-90' | '90+' {
  const d = v.daysInStock;
  return d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+';
}

export function agePriceFactor(v: Pick<Vehicle, 'daysInStock'>): number {
  const d = v.daysInStock;
  return d <= 30 ? 1 : d <= 60 ? 0.985 : d <= 90 ? 0.965 : 0.94;
}

/** Condition grade shown to buyers. */
export function conditionGrade(v: Pick<Vehicle, 'isNew' | 'condition' | 'issues' | 'mileage'>): ConditionGrade {
  if (v.isNew) return 'New';
  const majorOpen = v.issues.some((i) => !i.fixed && i.discovered && i.severity === 3);
  const bodyDamage = v.issues.some((i) => !i.fixed && i.discovered && i.system === 'Body' && i.severity >= 2);
  if (bodyDamage && v.condition < 55) return 'Damaged';
  if (majorOpen || v.condition < 35) return 'Project';
  if (v.condition >= 92 && v.mileage < 15000) return 'Like New';
  if (v.condition >= 76) return 'Good';
  if (v.condition >= 55) return 'Used';
  return 'Poor';
}

export function roundPrice(value: number): number {
  if (value < 2000) return Math.max(100, Math.round(value / 50) * 50);
  if (value < 20000) return Math.round(value / 100) * 100 - (value > 1000 ? 10 : 0);
  if (value < 100000) return Math.round(value / 250) * 250 - 10;
  return Math.round(value / 1000) * 1000 - 10;
}

/** Demand score 0..1 for a vehicle: how many buyers want this sort of thing right now. */
export function demandScore(state: GameState, v: Vehicle, mods = marketMods(state)): number {
  const brand = BRAND_BY_ID[v.brandId];
  let d = 0.1 + 0.45 * (brand?.popularity ?? 0.5) + 0.3 * v.popularity;
  d *= (mods.category[v.category] ?? 1) * (mods.fuel[v.fuel] ?? 1) * (mods.body[v.body] ?? 1) * (mods.brand[v.brandId] ?? 1);
  const age = yearOf(state.day) - v.year;
  if (v.category !== 'Classic' && v.category !== 'Rare') d *= age > 15 ? 0.8 : age > 10 ? 0.9 : 1;
  d *= seasonal(state.day, v.body, v.category, v.fuel, v.drivetrain);
  // Niche categories have fewer buyers.
  const niche: Partial<Record<Category, number>> = { Luxury: 0.7, Performance: 0.65, Classic: 0.55, Rare: 0.5, Van: 0.8, Commercial: 0.75, Offroad: 0.85 };
  d *= niche[v.category] ?? 1;
  // Buyers notice when a car has been for sale for months.
  d *= v.daysInStock > 90 ? 0.85 : v.daysInStock > 60 ? 0.92 : 1;
  if (v.certified) d *= 1.08;
  return clamp(d, 0.05, 1);
}

export function demandLabel(score: number): { label: string; tone: 'good' | 'warn' | 'bad' | 'info' } {
  if (score >= 0.75) return { label: 'Very high', tone: 'good' };
  if (score >= 0.6) return { label: 'High', tone: 'good' };
  if (score >= 0.45) return { label: 'Medium', tone: 'info' };
  if (score >= 0.32) return { label: 'Low', tone: 'warn' };
  return { label: 'Very low', tone: 'bad' };
}

/** Risk the dealer perceives: hidden-issue probability given source and what was checked. */
export function riskScore(v: Vehicle): number {
  const hidden = v.issues.filter((i) => !i.discovered && !i.fixed);
  if (v.isNew) return 0.01;
  const sourceRisk: Record<string, number> = { wholesale: 0.18, private: 0.4, auction: 0.55, network: 0.1, special: 0.5, tradein: 0.3, lease: 0.12, fleet: 0.25, importer: 0.35, liquidation: 0.7, manufacturer: 0.01 };
  let r = sourceRisk[v.source] ?? 0.3;
  const age = 2026 - v.year;
  r += clamp(age / 40, 0, 0.3);
  if (v.serviceHistory === 'None') r += 0.08;
  r += clamp((v.mileage - 120000) / 400000, 0, 0.2);
  r *= 1.1 - v.reliability * 0.5;
  if (v.inspectionLevel >= 2 || v.preInspected) r *= 0.45;
  else if (v.inspectionLevel === 1) r *= 0.8;
  // Once everything has been found there is nothing left to fear.
  if (hidden.length === 0 && (v.inspectionLevel >= 2 || v.preInspected)) r *= 0.5;
  return clamp(r, 0.02, 0.95);
}

export function riskLabel(score: number): { label: string; tone: 'good' | 'warn' | 'bad' | 'info' } {
  if (score < 0.15) return { label: 'Low risk', tone: 'good' };
  if (score < 0.3) return { label: 'Moderate', tone: 'info' };
  if (score < 0.45) return { label: 'Risky', tone: 'warn' };
  return { label: 'High risk', tone: 'bad' };
}

export function conditionLabel(c: number): { label: string; tone: 'good' | 'warn' | 'bad' | 'info' } {
  if (c >= 88) return { label: 'Excellent', tone: 'good' };
  if (c >= 74) return { label: 'Good', tone: 'good' };
  if (c >= 60) return { label: 'Fair', tone: 'info' };
  if (c >= 45) return { label: 'Worn', tone: 'warn' };
  return { label: 'Poor', tone: 'bad' };
}

/** Total invested in a vehicle so far. */
export function totalCost(v: Vehicle): number {
  const c = v.costs;
  return v.purchasePrice + c.transport + c.inspection + c.repairs + c.detailing + c.other;
}

/** Weekly drift of market trends (random walk, mean-reverting). */
export function driftTrends(state: GameState, rnd: () => number): void {
  const keys = [...CATEGORIES, ...FUELS];
  for (const k of keys) {
    const cur = state.trends[k] ?? 1;
    const target = 1;
    const next = cur + (target - cur) * 0.15 + (rnd() - 0.5) * 0.05;
    state.trends[k] = clamp(next, 0.82, 1.2);
  }
  state.trendHistory.push({ day: state.day, values: { ...state.trends } });
  if (state.trendHistory.length > 60) state.trendHistory.shift();
}
