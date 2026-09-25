/**
 * The national economy. Six indicators drift every week (mean-reverting random
 * walks) and jump when market events start. They feed straight into the
 * market: fuel prices move demand between fuels and body styles, confidence
 * and growth move traffic and budgets, interest rates move finance approvals
 * and monthly payments, the import cost moves purchase prices.
 */
import type { BodyType, Category, Economy, FuelType, GameState, GameEventDef } from '../types';
import { clamp } from '../util';
import { gameRng } from '../rng';

export function defaultEconomy(): Economy {
  return { fuel: 1, rate: 4, growth: 1.5, confidence: 55, evIncentive: 0.15, importCost: 1, history: [] };
}

const MEAN: Omit<Economy, 'history'> = { fuel: 1, rate: 4, growth: 1.5, confidence: 55, evIncentive: 0.15, importCost: 1 };
const RANGE: Record<keyof Omit<Economy, 'history'>, [number, number]> = {
  fuel: [0.65, 1.7], rate: [0.5, 9.5], growth: [-4, 5], confidence: [15, 95], evIncentive: [0, 1], importCost: [0.85, 1.4],
};
const NOISE: Record<keyof Omit<Economy, 'history'>, number> = { fuel: 0.05, rate: 0.15, growth: 0.3, confidence: 3, evIncentive: 0.02, importCost: 0.015 };

/** Weekly drift. */
export function economyWeekly(state: GameState): void {
  const e = state.economy;
  for (const k of Object.keys(MEAN) as (keyof typeof MEAN)[]) {
    const cur = e[k];
    const next = cur + (MEAN[k] - cur) * 0.08 + gameRng.around(0, NOISE[k]);
    e[k] = clamp(next, RANGE[k][0], RANGE[k][1]);
  }
  // Confidence follows growth.
  e.confidence = clamp(e.confidence + (e.growth - 1.5) * 0.8, RANGE.confidence[0], RANGE.confidence[1]);
  e.history.push({ day: state.day, fuel: round2(e.fuel), rate: round2(e.rate), growth: round2(e.growth), confidence: Math.round(e.confidence) });
  if (e.history.length > 60) e.history.shift();
}

/** A market event pushes the economy when it starts. */
export function applyEconomyPush(state: GameState, def: GameEventDef): void {
  if (!def.economy) return;
  const e = state.economy;
  for (const [k, v] of Object.entries(def.economy) as [keyof typeof MEAN, number][]) {
    e[k] = clamp(e[k] + v, RANGE[k][0], RANGE[k][1]);
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export interface EconomyFactors {
  fuel: Record<FuelType, number>;
  body: Partial<Record<BodyType, number>>;
  category: Partial<Record<Category, number>>;
  demand: number;       // walk-ins and online leads
  budget: number;       // how much buyers can spend
  importCost: number;
}

/** How the current economy shifts demand and value. */
export function economyFactors(e: Economy): EconomyFactors {
  const f = e.fuel - 1;
  const conf = (e.confidence - 55) / 100;
  const growth = (e.growth - 1.5) / 100;
  const rate = (e.rate - 4) / 100;
  return {
    fuel: {
      Electric: 1 + f * 0.35 + e.evIncentive * 0.12,
      Hybrid: 1 + f * 0.22 + e.evIncentive * 0.04,
      Petrol: 1 - f * 0.12,
      Diesel: 1 - f * 0.1,
    },
    body: {
      SUV: 1 - f * 0.1,
      Pickup: 1 - f * 0.08,
      Offroader: 1 - f * 0.12,
      Hatchback: 1 + f * 0.05,
    },
    category: {
      Luxury: 1 + conf * 0.25 + growth * 3,
      Performance: 1 + conf * 0.25 + growth * 3 - f * 0.08,
      Premium: 1 + conf * 0.15 + growth * 2,
      Economy: 1 - conf * 0.08 + f * 0.04,
      Commercial: 1 + growth * 4,
      Van: 1 + growth * 3,
    },
    demand: clamp(1 + conf * 0.6 + growth * 4 - rate * 1.5, 0.7, 1.35),
    budget: clamp(1 + growth * 3 + conf * 0.1, 0.85, 1.15),
    importCost: e.importCost,
  };
}

/** Base annual rate lenders charge a prime customer right now. */
export function lendingRate(state: GameState): number {
  return clamp(state.economy.rate / 100 + 0.025, 0.02, 0.14);
}

export function economyMood(e: Economy): { label: string; tone: 'good' | 'info' | 'warn' | 'bad' } {
  const score = (e.confidence - 55) / 40 + (e.growth - 1.5) / 3 - (e.rate - 4) / 6;
  if (score > 0.5) return { label: 'Booming', tone: 'good' };
  if (score > 0.1) return { label: 'Healthy', tone: 'good' };
  if (score > -0.3) return { label: 'Steady', tone: 'info' };
  if (score > -0.7) return { label: 'Cooling', tone: 'warn' };
  return { label: 'Recession', tone: 'bad' };
}
