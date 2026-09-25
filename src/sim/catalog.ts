/**
 * The model catalogue as a buyer sees it: what each model is, who wants it,
 * what one typically costs to buy and sells for, and how hot it is right now.
 * Everything is computed from the vehicle data and the live market, so the
 * numbers move with trends, seasons and events.
 */
import type { ArchetypeId, BodyType, Category, FuelType, GameState, ModelSpec, Vehicle } from './types';
import { BRAND_BY_ID, MANUFACTURERS, MODELS, MODEL_BY_ID } from '../data/vehicles';
import { ARCHETYPES } from '../data/game';
import { TRADE_FACTOR, demandScore, marketMods, roundPrice, suggestedPrice, trueValue } from './market';
import { yearOf } from './format';
import { clamp } from './util';
import { gameRng } from './rng';
import { SOURCE_BY_ID } from '../data/game';
import { createOffer, generateVehicle, buyingPower } from './vehicles';
import { record } from './finance';
import { sourceUnlocked } from './trading';

export type Segment = 'Budget' | 'Mainstream' | 'Premium' | 'Luxury' | 'Exotic' | 'Classic';

export interface ModelProfile {
  id: string;
  brandId: string;
  brand: string;
  model: string;
  body: BodyType;
  category: Category;
  type: string;
  segment: Segment;
  fuels: FuelType[];
  purchasePrice: number;     // typical trade price for a representative used example
  salePrice: number;         // typical retail asking price for it
  margin: number;            // expected gross margin after prep and transport
  demand: number;            // 0..100 right now
  demandLabel: 'Very high' | 'High' | 'Medium' | 'Low';
  popularity: number;        // 0..100
  performance: number;       // 0..100
  luxury: number;            // 0..100
  reliability: number;       // 0..100
  brandReputation: number;   // 0..100
  customerSegments: { id: ArchetypeId; name: string; icon: string }[];
  typicalYear: number;
  typicalMileage: number;
  maxHp: number;
  available: boolean;        // built in the current game year
}

export function modelType(m: Pick<ModelSpec, 'body' | 'category' | 'basePrice' | 'fuels'>): string {
  if (m.category === 'Classic' || m.category === 'Rare') return `Classic ${m.body.toLowerCase()}`;
  if (m.category === 'Performance') return m.basePrice >= 150000 ? 'Supercar' : 'Sports car';
  if (m.category === 'Sport') return m.body === 'Convertible' || m.body === 'Roadster' ? 'Convertible' : 'Sports car';
  if (m.category === 'Luxury' && m.body === 'Sedan') return 'Luxury sedan';
  if (m.fuels.length === 1 && m.fuels[0] === 'Electric') return `EV ${m.body === 'SUV' ? 'SUV' : m.body.toLowerCase()}`;
  if (m.fuels.includes('Hybrid') && m.fuels.every((f) => f === 'Hybrid' || f === 'Electric')) return `Hybrid ${m.body.toLowerCase()}`;
  return m.body === 'SUV' ? 'SUV' : m.body;
}

export function modelSegment(m: ModelSpec): Segment {
  if (m.category === 'Classic' || m.category === 'Rare') return 'Classic';
  if (m.basePrice >= 150000 || (m.category === 'Performance' && m.basePrice >= 100000)) return 'Exotic';
  if (m.category === 'Luxury' || m.basePrice >= 70000) return 'Luxury';
  if (m.category === 'Premium' || m.basePrice >= 40000) return 'Premium';
  if (m.basePrice < 20000 || m.category === 'Economy') return 'Budget';
  return 'Mainstream';
}

/** A representative used example of the model, for price estimates. */
function typicalExample(state: GameState, m: ModelSpec): Vehicle {
  const now = yearOf(state.day);
  const classic = m.category === 'Classic' || m.category === 'Rare';
  const year = classic ? Math.round((m.yearFrom + m.yearTo) / 2) : clamp(now - 4, m.yearFrom, Math.min(m.yearTo, now));
  const age = Math.max(1, now - year);
  const mileage = Math.round(age * (classic ? 3500 : m.category === 'Van' ? 22000 : 14000) / 1000) * 1000;
  const engine = m.engines[Math.floor((m.engines.length - 1) / 2)];
  const brand = BRAND_BY_ID[m.brandId];
  return {
    id: `typ-${m.id}`, modelId: m.id, brand: brand.name, brandId: brand.id, model: m.name, generation: '', year,
    trim: m.trims[Math.floor((m.trims.length - 1) / 2)], body: m.body, category: m.category, fuel: engine.fuel,
    transmission: 'Automatic', engine: engine.label, hp: engine.hp, mileage, color: 'Graphite Grey', colorHex: '#4b5059',
    options: [], condition: 74, apparentCondition: 74, presentation: 60, issues: [], inspectionLevel: 2, photosPro: false,
    reliability: brand.reliability, popularity: m.popularity, rarity: m.rarity, source: 'wholesale', seller: '', history: [],
    purchasePrice: 0, offerPrice: 0, costs: { transport: 0, inspection: 0, repairs: 0, detailing: 0, other: 0 },
    askingPrice: 0, floorPrice: 0, status: 'offer', locationId: state.activeLocationId, daysInStock: 0, boughtDay: 0, arrivalDay: 0,
    prep: [], listedOnline: false,
  };
}

const cache = new Map<string, { day: number; p: ModelProfile }>();

export function modelProfile(state: GameState, modelId: string): ModelProfile | undefined {
  const m = MODEL_BY_ID[modelId];
  if (!m) return undefined;
  const hit = cache.get(modelId);
  if (hit && hit.day === state.day) return hit.p;
  const brand = BRAND_BY_ID[m.brandId];
  const mods = marketMods(state);
  const ex = typicalExample(state, m);
  const value = trueValue(state, ex, mods);
  const purchasePrice = roundPrice(value * TRADE_FACTOR * 0.92 * buyingPower(state));
  const salePrice = suggestedPrice(state, ex, mods);
  const demand = Math.round(demandScore(state, ex, mods) * 100);
  const maxHp = Math.max(...m.engines.map((e) => e.hp));
  const luxuryBase: Partial<Record<Category, number>> = { Economy: 10, Compact: 25, Family: 30, Van: 15, SUV: 40, Electric: 45, Sport: 50, Premium: 62, Performance: 70, Luxury: 85, Classic: 55, Rare: 75 };
  const segments = ARCHETYPES.filter((a) => (a.categories.includes(m.category) || a.bodies.includes(m.body))
    && a.fuels.some((f) => m.fuels.includes(f)) && salePrice <= a.budget[1] * 1.25 && salePrice >= a.budget[0] * 0.35);
  const p: ModelProfile = {
    id: m.id,
    brandId: m.brandId,
    brand: brand.name,
    model: m.name,
    body: m.body,
    category: m.category,
    type: modelType(m),
    segment: modelSegment(m),
    fuels: m.fuels,
    purchasePrice,
    salePrice,
    margin: salePrice - purchasePrice - estimatedCosts(salePrice),
    demand,
    demandLabel: demand >= 62 ? 'Very high' : demand >= 45 ? 'High' : demand >= 28 ? 'Medium' : 'Low',
    popularity: Math.round(clamp(m.popularity * 100 * (mods.category[m.category] ?? 1), 1, 100)),
    performance: Math.round(clamp(maxHp / 8, 5, 100)),
    luxury: Math.round(clamp((luxuryBase[m.category] ?? 30) * 0.7 + brand.prestige * 30, 5, 100)),
    reliability: Math.round(clamp(brand.reliability * 100 - (m.category === 'Performance' ? 8 : 0) - (m.category === 'Classic' || m.category === 'Rare' ? 15 : 0), 5, 99)),
    brandReputation: Math.round(brand.prestige * 60 + brand.reliability * 40),
    customerSegments: segments.map((a) => ({ id: a.id, name: a.name, icon: a.icon })),
    typicalYear: ex.year,
    typicalMileage: ex.mileage,
    maxHp,
    available: m.yearFrom <= yearOf(state.day),
  };
  cache.set(modelId, { day: state.day, p });
  return p;
}

/** Transport, a clean and a small repair, on average. */
export function estimatedCosts(salePrice: number): number {
  return Math.round(250 + salePrice * 0.018);
}

export function allProfiles(state: GameState): ModelProfile[] {
  return MODELS.map((m) => modelProfile(state, m.id)).filter((p): p is ModelProfile => !!p && p.available);
}

export function brands() {
  return MANUFACTURERS;
}

/** Your buyer tracks down one example of a model. A fee, and it appears on the market today. */
export function sourcingFee(state: GameState, modelId: string): number {
  const p = modelProfile(state, modelId);
  return p ? Math.max(150, Math.round((p.purchasePrice * 0.02) / 10) * 10) : 0;
}

export const SOURCING_PER_DAY = 3;

export function sourcingLeft(state: GameState): number {
  const used = state.sourcing && state.sourcing.day === state.day ? state.sourcing.count : 0;
  return Math.max(0, SOURCING_PER_DAY - used);
}

export function sourceModel(state: GameState, modelId: string): { ok: boolean; message: string; offerId?: string } {
  const m = MODEL_BY_ID[modelId];
  if (!m) return { ok: false, message: 'Unknown model.' };
  if (m.yearFrom > yearOf(state.day)) return { ok: false, message: 'Not built yet.' };
  if (sourcingLeft(state) <= 0) return { ok: false, message: `Your contacts can chase ${SOURCING_PER_DAY} requests a day. Try again tomorrow.` };
  const fee = sourcingFee(state, modelId);
  if (state.cash < fee) return { ok: false, message: `The finder's fee is €${fee.toLocaleString('en-GB')}.` };
  // Rare and classic cars come through the collector network; everything else from the trade.
  const special = (m.category === 'Classic' || m.category === 'Rare') && sourceUnlocked(state, 'special');
  const sourceId = special ? 'special' : sourceUnlocked(state, 'network') && m.basePrice > 40000 ? 'network' : 'wholesale';
  const base = createOffer(state, sourceId, state.activeLocationId);
  // Keep the offer's price logic, but for the model asked for.
  const v = generateVehicle(state, { source: sourceId, locationId: state.activeLocationId, modelId });
  const ratio = base.offerPrice / Math.max(1, trueValue(state, base));
  v.offerPrice = roundPrice(trueValue(state, v) * clamp(ratio, 0.7, 1.02) * gameRng.range(1.0, 1.05));
  v.expiresDay = state.day + 3;
  v.sourced = true;
  if (base.auction) {
    v.auction = { currentBid: roundPrice(v.offerPrice * 0.5), bids: 0, myBid: 0, reserve: v.offerPrice };
    v.offerPrice = v.auction.currentBid;
    v.expiresDay = state.day + 2;
  }
  state.offers.unshift(v);
  state.sourcing = { day: state.day, count: (state.sourcing && state.sourcing.day === state.day ? state.sourcing.count : 0) + 1 };
  record(state, 'Other', -fee, `Finder's fee: ${BRAND_BY_ID[m.brandId].name} ${m.name}`);
  return { ok: true, message: `Found one: a ${v.year} ${v.brand} ${v.model} from ${SOURCE_BY_ID[sourceId].name.toLowerCase()} for €${v.offerPrice.toLocaleString('en-GB')}.`, offerId: v.id };
}
