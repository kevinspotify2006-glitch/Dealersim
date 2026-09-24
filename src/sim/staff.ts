/**
 * Dealership staff: hiring, training, promotion, morale and pay.
 */
import type { Employee, GameState, Role } from './types';
import { FIRST_NAMES, LAST_NAMES, ROLES, ROLE_BY_ID } from '../data/game';
import { gameRng } from './rng';
import { clamp } from './util';
import { locationById, nextId, pushNotice, staffAt } from './state';
import { freeStation, stationName } from './lot';
import { record } from './finance';

export const MAX_LEVEL = 5;

export function xpForLevel(level: number): number {
  return level * 120;
}

export function salaryFor(role: Role, skill: number, level: number): number {
  const base = ROLE_BY_ID[role].baseSalary;
  return Math.round((base * (0.72 + (skill / 100) * 0.85) * (1 + (level - 1) * 0.12)) / 10) * 10;
}

export function makeEmployee(state: GameState, role: Role, locationId: string, skillRange: [number, number]): Employee {
  const rnd = gameRng;
  const skill = Math.round(clamp(rnd.range(skillRange[0], skillRange[1]), 5, 95));
  const level = skill > 75 ? 3 : skill > 55 ? 2 : 1;
  const def = ROLE_BY_ID[role];
  return {
    id: nextId(state, 'e'),
    name: `${rnd.pick(FIRST_NAMES)} ${rnd.pick(LAST_NAMES)}`,
    role,
    skill,
    xp: 0,
    level,
    salary: salaryFor(role, skill, level),
    morale: Math.round(rnd.range(62, 85)),
    specialization: rnd.pick(def.specializations),
    locationId,
    hiredDay: state.day,
    trainingDaysLeft: 0,
    dealsClosed: 0,
  };
}

/** Candidate pool refresh. Better reputation and bigger companies attract better people. */
export function refreshCandidates(state: GameState): void {
  const rnd = gameRng;
  const count = 5 + Math.min(4, state.companyLevel);
  const lo = 18 + state.reputation * 0.2 + state.companyLevel * 3;
  const hi = 45 + state.reputation * 0.35 + state.companyLevel * 5;
  const roles: Role[] = ROLES.map((r) => r.id);
  const out: Employee[] = [];
  // Always at least one salesperson and one mechanic on offer.
  const must: Role[] = ['sales', 'mechanic', 'detailer'];
  for (let i = 0; i < count; i += 1) {
    const role = i < must.length ? must[i] : rnd.pick(roles);
    out.push(makeEmployee(state, role, state.activeLocationId, [lo, hi]));
  }
  state.candidates = out;
}

export function hire(state: GameState, candidateId: string, locationId: string): { ok: boolean; message: string } {
  const c = state.candidates.find((x) => x.id === candidateId);
  if (!c) return { ok: false, message: 'That candidate is no longer available.' };
  const loc = locationById(state, locationId);
  if (!loc) return { ok: false, message: 'Unknown location.' };
  const station = freeStation(state, loc, c.role);
  if (!station) return { ok: false, message: `A ${ROLE_BY_ID[c.role].name.toLowerCase()} needs ${stationName(c.role)} to work at. Build one at ${loc.name} first.` };
  const signing = Math.round(c.salary * 0.25);
  if (state.cash < signing) return { ok: false, message: `Hiring costs a signing fee of €${signing}.` };
  record(state, 'Salaries', -signing, `Signing fee: ${c.name}`, locationId);
  c.locationId = locationId;
  c.stationId = station.id;
  c.hiredDay = state.day;
  state.employees.push(c);
  state.candidates = state.candidates.filter((x) => x.id !== candidateId);
  return { ok: true, message: `${c.name} joins ${loc.name} as ${ROLE_BY_ID[c.role].name}.` };
}

export function fire(state: GameState, id: string): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Unknown employee.' };
  const severance = Math.round(e.salary * 0.5);
  record(state, 'Salaries', -severance, `Severance: ${e.name}`, e.locationId);
  state.employees = state.employees.filter((x) => x.id !== id);
  for (const other of state.employees) if (other.locationId === e.locationId) other.morale = clamp(other.morale - 4, 0, 100);
  return { ok: true, message: `${e.name} has left the company (severance €${severance}).` };
}

export function trainingCost(e: Employee): number {
  return 900 + e.level * 700 + Math.round(e.skill * 12);
}

export function train(state: GameState, id: string): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Unknown employee.' };
  if (e.trainingDaysLeft > 0) return { ok: false, message: `${e.name} is already on a course.` };
  if (e.skill >= 98) return { ok: false, message: `${e.name} is already at the top of their game.` };
  const cost = trainingCost(e);
  if (state.cash < cost) return { ok: false, message: `The course costs €${cost}.` };
  record(state, 'Training', -cost, `Training course: ${e.name}`, e.locationId);
  e.trainingDaysLeft = 4;
  e.morale = clamp(e.morale + 6, 0, 100);
  return { ok: true, message: `${e.name} starts a 4-day course.` };
}

export function canPromote(e: Employee): boolean {
  return e.level < MAX_LEVEL && e.xp >= xpForLevel(e.level);
}

export function promote(state: GameState, id: string): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Unknown employee.' };
  if (!canPromote(e)) return { ok: false, message: `${e.name} needs ${xpForLevel(e.level) - e.xp} more experience.` };
  e.xp -= xpForLevel(e.level);
  e.level += 1;
  e.skill = clamp(e.skill + 5, 0, 99);
  e.salary = salaryFor(e.role, e.skill, e.level);
  e.morale = clamp(e.morale + 15, 0, 100);
  return { ok: true, message: `${e.name} promoted to level ${e.level}. New salary €${e.salary}/month.` };
}

export function giveRaise(state: GameState, id: string): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Unknown employee.' };
  e.salary = Math.round((e.salary * 1.08) / 10) * 10;
  e.morale = clamp(e.morale + 14, 0, 100);
  return { ok: true, message: `${e.name} gets an 8% raise — morale up.` };
}

export function changeRole(state: GameState, id: string, role: Role): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Unknown employee.' };
  if (e.role === role) return { ok: false, message: 'Same role.' };
  const loc = locationById(state, e.locationId);
  const station = loc ? freeStation(state, loc, role, e.id) : undefined;
  if (!station) return { ok: false, message: `A ${ROLE_BY_ID[role].name.toLowerCase()} needs ${stationName(role)}. Build one first.` };
  e.role = role;
  e.stationId = station.id;
  e.skill = Math.round(e.skill * 0.65);
  e.specialization = gameRng.pick(ROLE_BY_ID[role].specializations);
  e.salary = salaryFor(role, e.skill, e.level);
  e.morale = clamp(e.morale - 5, 0, 100);
  return { ok: true, message: `${e.name} is now a ${ROLE_BY_ID[role].name}. Skill resets partially while they learn.` };
}

export function transfer(state: GameState, id: string, locationId: string): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  const loc = locationById(state, locationId);
  if (!e || !loc) return { ok: false, message: 'Unknown employee or location.' };
  if (e.locationId === locationId) return { ok: false, message: 'Already works there.' };
  const station = freeStation(state, loc, e.role);
  if (!station) return { ok: false, message: `${loc.name} has no free ${stationName(e.role).replace(/^an? /, '')}.` };
  e.locationId = locationId;
  e.stationId = station.id;
  e.morale = clamp(e.morale - 3, 0, 100);
  return { ok: true, message: `${e.name} moves to ${loc.name}.` };
}

/** Daily staff update: training, morale drift, quitting. */
export function staffDaily(state: GameState): void {
  for (const e of [...state.employees]) {
    if (e.trainingDaysLeft > 0) {
      e.trainingDaysLeft -= 1;
      if (e.trainingDaysLeft === 0) {
        const gain = Math.round(gameRng.range(6, 12) * (1 - e.skill / 130));
        e.skill = clamp(e.skill + gain, 0, 99);
        e.xp += 25;
        pushNotice(state, 'good', `${e.name} finished training: skill +${gain}.`);
      }
    }
    const managers = staffAt(state, e.locationId).filter((m) => m.role === 'manager');
    const managerBoost = managers.reduce((m, x) => Math.max(m, x.skill), 0) / 100 * 10;
    const fairPay = salaryFor(e.role, e.skill, e.level);
    const payFeel = clamp((e.salary / fairPay - 1) * 40, -12, 12);
    const loungeCrowd = 0;
    const target = 62 + managerBoost + payFeel + loungeCrowd + (state.reputation - 50) / 8;
    e.morale = clamp(e.morale + (target - e.morale) * 0.06 + gameRng.range(-1, 1), 0, 100);
    if (e.morale < 22 && gameRng.chance(0.06)) {
      state.employees = state.employees.filter((x) => x.id !== e.id);
      pushNotice(state, 'bad', `${e.name} (${ROLE_BY_ID[e.role].name}) quit — morale was too low.`);
      continue;
    }
    // Skills creep up with experience on the job.
    if (gameRng.chance(0.04)) e.skill = clamp(e.skill + 1, 0, 99);
  }
}

/** Effective skill including morale. */
export function effectiveSkill(e: Employee): number {
  if (e.trainingDaysLeft > 0) return 0;
  // Without a workstation (desk, lift, bay) people work far less effectively.
  return e.skill * (0.75 + e.morale / 400) * (e.stationId ? 1 : 0.6);
}

export function bestAt(state: GameState, locationId: string, role: Role): Employee | undefined {
  return staffAt(state, locationId)
    .filter((e) => e.role === role && e.trainingDaysLeft <= 0)
    .sort((a, b) => effectiveSkill(b) - effectiveSkill(a))[0];
}
