/**
 * What a test drive you drove yourself means for the business: fuel, what
 * you felt (hidden faults found on the road), the customer's confidence,
 * records per route. The drive's own damage never touches the real car.
 */
import type { Customer, GameState, Vehicle } from './types';
import type { DriveResult } from '../drive/session';
import { handlingOf } from '../drive/physics';
import { record } from './finance';
import { gameRng } from './rng';
import { clamp } from './util';
import { locationById, vehicleName } from './state';
import { testDrive } from './customers';

export type DriveContext =
  | { kind: 'offer'; vehicleId: string; locationId: string }
  | { kind: 'stock'; vehicleId: string; locationId: string }
  | { kind: 'customer'; vehicleId: string; customerId: string; locationId: string };

export interface DriveOutcome {
  ok: boolean;
  message: string;
  cost: number;
  found: string[];
  confidenceBefore?: number;
  confidenceAfter?: number;
  record: boolean;
}

/** Fuel or electricity for one drive. Kept small on purpose. */
export function driveCost(v: Pick<Vehicle, 'fuel'>): number {
  return v.fuel === 'Electric' ? 8 : 15;
}

/** The car the context points at (an offer on the market, or one you own). */
export function driveVehicle(state: GameState, ctx: DriveContext): Vehicle | undefined {
  if (ctx.kind === 'offer') return state.offers.find((o) => o.id === ctx.vehicleId);
  return state.vehicles.find((v) => v.id === ctx.vehicleId);
}

/** Purchase confidence shown to the player (the customer's interest as a %). */
export function confidenceOf(c: Customer): number {
  return Math.round(clamp(c.interest, 0, 1) * 100);
}

/** Applies a finished (or stopped) drive to the game. */
export function applyDrive(state: GameState, ctx: DriveContext, routeId: string, r: DriveResult): DriveOutcome {
  const v = driveVehicle(state, ctx);
  if (!v) return { ok: false, message: 'That car is no longer available.', cost: 0, found: [], record: false };
  const cost = driveCost(v);
  record(state, 'Utilities', -cost, `Test drive: ${vehicleName(v)} (${(r.distance / 1000).toFixed(2)} km)`, ctx.locationId);
  state.stats.playerDrives = (state.stats.playerDrives ?? 0) + 1;
  const best = state.stats.driveBest ?? (state.stats.driveBest = {});
  const isRecord = r.finished && r.overall > (best[routeId] ?? 0);
  if (isRecord) best[routeId] = r.overall;
  // Driving a car tells you things an inspection might not: a gearbox that
  // slips, soft brakes, a clunk over bumps. The further and cleaner you
  // drive, the more you notice.
  const found: string[] = [];
  const feel = v.issues.filter((i) => !i.fixed && !i.discovered && ['Engine', 'Transmission', 'Suspension', 'Brakes', 'Steering'].includes(i.system));
  const chance = clamp(0.2 + (r.distance / 1000) * 0.2 + r.route / 400, 0.2, 0.8);
  for (const issue of feel) {
    if (found.length >= 2) break;
    if (gameRng.chance(chance)) { issue.discovered = true; found.push(issue.name); }
  }
  v.testDriven = true;
  // Real miles on a car you own; the drive's knocks are not real.
  if (ctx.kind === 'stock') v.mileage += Math.max(1, Math.round(r.distance / 1000));
  const feltText = found.length ? ` You felt: ${found.map((f) => f.toLowerCase()).join(', ')}.` : ' No faults felt — it drives as it should.';
  if (ctx.kind === 'customer') {
    const c = state.customers.find((x) => x.id === ctx.customerId);
    if (!c) return { ok: true, message: `Test drive done.${feltText}`, cost, found, record: isRecord };
    const before = confidenceOf(c);
    const out = testDrive(state, c.id, { route: r.distance > 1000 ? 'long' : 'short', playerScore: r.overall, drivenBy: 'you' });
    const after = confidenceOf(c);
    return { ok: out.ok, message: out.ok ? out.message : out.message, cost, found, confidenceBefore: before, confidenceAfter: after, record: isRecord };
  }
  if (ctx.kind === 'offer') return { ok: true, message: `You drove the ${vehicleName(v)} (${r.stars}★).${feltText}`, cost, found, record: isRecord };
  return { ok: true, message: `You drove your ${vehicleName(v)} (${r.stars}★).${feltText}`, cost, found, record: isRecord };
}

/**
 * How a customer who drives the car themselves likes its character: an
 * enthusiast wants pull and sharp steering, a family a smooth, steady car.
 */
export function aiDriveFeedback(c: Pick<Customer, 'archetype'>, v: Vehicle): { delta: number; text: string } {
  const hd = handlingOf(v);
  const fast = hd.accel >= 6;
  const slow = hd.accel < 3.6;
  const sharp = hd.grip >= 1;
  const smooth = hd.label === 'smooth and quiet' || hd.label === 'stable and high' || v.fuel === 'Electric';
  switch (c.archetype) {
    case 'enthusiast':
    case 'young':
      if (fast && sharp) return { delta: 0.05, text: 'Loved the acceleration and the handling.' };
      if (slow) return { delta: -0.04, text: 'Didn’t enjoy the acceleration.' };
      return { delta: 0.01, text: 'Liked the handling.' };
    case 'family':
    case 'senior':
    case 'suv':
      if (smooth) return { delta: 0.04, text: 'Liked how smooth and calm it drives.' };
      if (fast && sharp) return { delta: -0.02, text: 'Found it a bit harsh.' };
      return { delta: 0.01, text: 'Liked the handling.' };
    case 'luxury':
    case 'prestige':
    case 'business':
      if (smooth || hd.label === 'smooth and quiet') return { delta: 0.04, text: 'Appreciated the refinement.' };
      if (slow) return { delta: -0.03, text: 'Expected more power.' };
      return { delta: 0, text: 'Found it competent.' };
    case 'ev':
      if (v.fuel === 'Electric') return { delta: 0.04, text: 'Loved the instant, silent pull.' };
      return { delta: -0.02, text: 'Missed the electric feel.' };
    default:
      if (slow) return { delta: -0.02, text: 'Didn’t enjoy the acceleration.' };
      return { delta: 0.02, text: 'Liked the handling.' };
  }
}

export { locationById };
