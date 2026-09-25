/**
 * Typed event bus (carried over from Business Manager).
 *
 * The simulation publishes; the UI subscribes. No simulation module imports a
 * UI module, which keeps the engine testable and the render layer replaceable —
 * the same engine drives the desktop layout and the Android build.
 */
import type { Notice, Vehicle } from './types';

export type EventMap = {
  /** Time moved (hourly). The chrome refreshes, views update in place. */
  tick: { day: number; hour: number };
  /** A whole day was settled. Views rebuild. */
  day: { day: number };
  /** Something the player should notice. */
  notice: Notice;
  /** A customer walked in. */
  customer: { customerId: string };
  /** A vehicle was sold (by the player or by staff). */
  sale: { vehicle: Vehicle; price: number; profit: number; byStaff: boolean };
  /** Something visible happened on the lot (for the little animations). */
  fx: { locationId: string; kind: 'service-start' | 'service-ready' | 'appointment' | 'bought' | 'prep-done' | 'arrived'; ref?: string; label: string };
  /** Company level went up. */
  levelup: { level: number };
  /** Achievement unlocked. */
  achievement: { id: string };
  /** The active save was replaced (new game or load). */
  reset: void;
  /** State changed by a player action; views should refresh. */
  changed: void;
};

type Listener<K extends keyof EventMap> = (payload: EventMap[K]) => void;

const listeners = new Map<keyof EventMap, Set<(payload: never) => void>>();

export function on<K extends keyof EventMap>(event: K, listener: Listener<K>): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  set.add(listener as (payload: never) => void);
  return () => void set?.delete(listener as (payload: never) => void);
}

export function emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
  const set = listeners.get(event);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      (listener as Listener<K>)(payload);
    } catch (error) {
      // A broken listener must never stop the simulation.
      console.error(`[cdmt] listener for "${String(event)}" failed`, error);
    }
  }
}

/** Removes every listener. Used when a new game replaces the old one. */
export function resetBus(): void {
  listeners.clear();
}
