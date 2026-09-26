/**
 * Undo / redo for Build mode.
 *
 * Every build action (place, move, rotate, delete, paint, duplicate, move a
 * car, refit…) is run through `track()`, which snapshots the location's
 * layout, car positions and workstations before and after. Undo puts the
 * "before" back and reverses the money through the ledger; redo does the
 * opposite (and has to be affordable again).
 */
import type { GameState, Location, Lot } from '../../sim/types';
import { record } from '../../sim/finance';
import { assignSlots, assignStations, rentFor } from '../../sim/lot';

interface Snapshot {
  lot: string;
  rent: number;
  cars: [string, string | undefined, string, boolean][];
  staff: [string, string | undefined][];
}

interface Entry {
  label: string;
  locId: string;
  before: Snapshot;
  after: Snapshot;
  cost: number;   // change in cash the action caused (negative = money spent)
}

const LIMIT = 80;
let gameId = '';
let undoStack: Entry[] = [];
let redoStack: Entry[] = [];

function snap(state: GameState, loc: Location): Snapshot {
  return {
    lot: JSON.stringify({ ...loc.lot, version: 0 }),
    rent: loc.rentMonthly,
    cars: state.vehicles.filter((v) => v.locationId === loc.id).map((v) => [v.id, v.slotId, v.status, v.listedOnline]),
    staff: state.employees.filter((e) => e.locationId === loc.id).map((e) => [e.id, e.stationId]),
  };
}

function restore(state: GameState, loc: Location, s: Snapshot): void {
  const version = loc.lot.version + 1;
  const lot = JSON.parse(s.lot) as Lot;
  lot.version = version;
  loc.lot = lot;
  loc.rentMonthly = s.rent;
  const ids = new Set(lot.objects.map((o) => o.id));
  for (const [id, slotId, status, online] of s.cars) {
    const v = state.vehicles.find((x) => x.id === id);
    // Cars sold or booked into work since then keep their current state.
    if (!v || v.locationId !== loc.id || (v.status !== 'yard' && v.status !== 'listed')) continue;
    if (status !== 'yard' && status !== 'listed') continue;
    v.slotId = slotId && ids.has(slotId) ? slotId : undefined;
    v.status = status;
    v.listedOnline = online;
  }
  for (const [id, stationId] of s.staff) {
    const e = state.employees.find((x) => x.id === id);
    if (e && e.locationId === loc.id) e.stationId = stationId && ids.has(stationId) ? stationId : undefined;
  }
  assignSlots(state, loc);
  assignStations(state, loc);
  loc.rentMonthly = rentFor(loc);
}

function ensureGame(state: GameState): void {
  if (state.id !== gameId) {
    gameId = state.id;
    undoStack = [];
    redoStack = [];
  }
}

/**
 * Runs a build action and remembers how to undo it. The action must be
 * synchronous; only a successful action that changed something is kept.
 */
export function track<T extends { ok: boolean }>(state: GameState, loc: Location, label: string, run: () => T): T {
  ensureGame(state);
  const before = snap(state, loc);
  const cash = state.cash;
  const result = run();
  if (!result.ok) return result;
  const after = snap(state, loc);
  if (after.lot === before.lot && JSON.stringify(after.cars) === JSON.stringify(before.cars) && JSON.stringify(after.staff) === JSON.stringify(before.staff)) return result;
  undoStack.push({ label, locId: loc.id, before, after, cost: state.cash - cash });
  if (undoStack.length > LIMIT) undoStack.shift();
  redoStack = [];
  return result;
}

export function canUndo(state: GameState): boolean {
  ensureGame(state);
  return undoStack.length > 0;
}

export function canRedo(state: GameState): boolean {
  ensureGame(state);
  return redoStack.length > 0;
}

export function undoLabel(state: GameState): string {
  ensureGame(state);
  return undoStack[undoStack.length - 1]?.label ?? '';
}

export function redoLabel(state: GameState): string {
  ensureGame(state);
  return redoStack[redoStack.length - 1]?.label ?? '';
}

export function undo(state: GameState): { ok: boolean; message: string } {
  ensureGame(state);
  const e = undoStack.pop();
  if (!e) return { ok: false, message: 'Nothing to undo.' };
  const loc = state.locations.find((l) => l.id === e.locId);
  if (!loc) return { ok: false, message: 'That dealership is gone.' };
  restore(state, loc, e.before);
  if (e.cost !== 0) record(state, 'Construction', -e.cost, `Undo: ${e.label}`, loc.id);
  redoStack.push(e);
  return { ok: true, message: `Undone: ${e.label}${e.cost < 0 ? ` (+€${Math.round(-e.cost).toLocaleString('en-GB')} back)` : ''}` };
}

export function redo(state: GameState): { ok: boolean; message: string } {
  ensureGame(state);
  const e = redoStack[redoStack.length - 1];
  if (!e) return { ok: false, message: 'Nothing to redo.' };
  if (e.cost < 0 && state.cash < -e.cost) return { ok: false, message: `Redoing that costs €${Math.round(-e.cost).toLocaleString('en-GB')}.` };
  const loc = state.locations.find((l) => l.id === e.locId);
  if (!loc) return { ok: false, message: 'That dealership is gone.' };
  redoStack.pop();
  restore(state, loc, e.after);
  if (e.cost !== 0) record(state, 'Construction', e.cost, `Redo: ${e.label}`, loc.id);
  undoStack.push(e);
  return { ok: true, message: `Redone: ${e.label}` };
}

/** Forget everything (new game, load). */
export function clearHistory(): void {
  gameId = '';
  undoStack = [];
  redoStack = [];
}
