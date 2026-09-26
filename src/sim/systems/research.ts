/**
 * Research: one project at a time. You pay up front; it finishes after its
 * days have passed. Finished projects switch on rules elsewhere via hasTech().
 */
import type { GameState } from '../types';
import { RESEARCH, RESEARCH_BY_ID } from '../../data/research';
import { hasTech, pushNotice } from '../state';
import { record } from '../finance';

export function researchState(state: GameState, id: string): 'done' | 'active' | 'available' | 'locked' {
  if (hasTech(state, id)) return 'done';
  if (state.research.active?.id === id) return 'active';
  const def = RESEARCH_BY_ID[id];
  if (!def) return 'locked';
  if (def.minLevel > state.companyLevel) return 'locked';
  if (!def.requires.every((r) => hasTech(state, r))) return 'locked';
  return 'available';
}

export function lockReason(state: GameState, id: string): string {
  const def = RESEARCH_BY_ID[id];
  if (!def) return '';
  if (def.minLevel > state.companyLevel) return `Needs company level ${def.minLevel}.`;
  const missing = def.requires.filter((r) => !hasTech(state, r)).map((r) => RESEARCH_BY_ID[r]?.name ?? r);
  return missing.length ? `Needs: ${missing.join(', ')}.` : '';
}

export function startResearch(state: GameState, id: string): { ok: boolean; message: string } {
  const def = RESEARCH_BY_ID[id];
  if (!def) return { ok: false, message: 'Unknown project.' };
  const st = researchState(state, id);
  if (st === 'done') return { ok: false, message: 'Already researched.' };
  if (st === 'locked') return { ok: false, message: lockReason(state, id) };
  if (state.research.active) return { ok: false, message: `${RESEARCH_BY_ID[state.research.active.id]?.name} is still running (${state.research.active.daysLeft} days).` };
  if (state.cash < def.cost) return { ok: false, message: `This project costs €${def.cost.toLocaleString('en-GB')}.` };
  record(state, 'Research', -def.cost, `Research: ${def.name}`);
  state.research.active = { id, daysLeft: def.days };
  return { ok: true, message: `${def.name} started — ready in ${def.days} days.` };
}

/** Speeds the running project up by a number of days (mission rewards). */
export function speedUpResearch(state: GameState, days: number): void {
  if (state.research.active) state.research.active.daysLeft = Math.max(1, state.research.active.daysLeft - days);
}

export function researchDaily(state: GameState): void {
  const a = state.research.active;
  if (!a) return;
  a.daysLeft -= 1;
  if (a.daysLeft > 0) return;
  const def = RESEARCH_BY_ID[a.id];
  state.research.done[a.id] = state.day;
  state.research.active = undefined;
  state.stats.researchDone = Object.keys(state.research.done).length;
  if (def) pushNotice(state, 'good', `🧪 Research complete: ${def.name}. ${def.effect}`);
  // Queued projects start by themselves if affordable.
  while (state.research.queue.length) {
    const next = state.research.queue.shift()!;
    if (startResearch(state, next).ok) break;
  }
}

export function researchProgress(state: GameState): { done: number; total: number } {
  return { done: Object.keys(state.research.done).length, total: RESEARCH.length };
}

/** Grants finished projects for free (legacy perk "Head start"): the cheapest available ones. */
export function grantFreeResearch(state: GameState, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const next = RESEARCH.filter((r) => researchState(state, r.id) === 'available').sort((a, b) => a.cost - b.cost)[0];
    if (!next) return;
    state.research.done[next.id] = state.day;
  }
}
