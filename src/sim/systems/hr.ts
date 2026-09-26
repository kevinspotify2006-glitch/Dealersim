/**
 * HR managers (v7.3). Every HR manager looks after a number of employees that
 * grows with their HR grade (HR_CAPACITY). The people they look after are off
 * sick less often; with AUTO MANAGE on (and the HR department assisted or
 * automated) the manager also trains them within the training budget,
 * promotes them against your thresholds, reviews pay, takes care of morale and
 * stress and — group-wide — recruits to your target headcount and replaces
 * people who leave, through the headhunter or the open candidate pool.
 *
 * Every manager gets through a limited number of actions a day and a weak one
 * makes mistakes (the wrong course, a premature promotion, a needless raise).
 */
import type { AutoMode, Employee, GameState, Role } from '../types';
import { ROLE_BY_ID, TRAINING } from '../../data/game';
import { HEADHUNTER_LEVELS } from '../../data/automation';
import { gameRng } from '../rng';
import { clamp } from '../util';
import { locationById } from '../state';
import { canPromote, giveRaise, hire, promote, salaryFor, skillOf, train, trainingCost } from '../staff';
import { freeStation } from '../lot';
import { bump, errorRate, hrCapacity, managerQuality, modeFor, raise, settle } from './autocore';
import { MANAGER_ACTIONS } from '../../data/automation';
import { defaultCriteria, headhunterLevel, hireCandidate, misses, openSearches, startSearch } from './headhunter';

export function hrManagers(state: GameState): Employee[] {
  return state.employees.filter((e) => e.role === 'hr');
}

export function managedBy(state: GameState, hrId: string): Employee[] {
  return state.employees.filter((e) => e.hrBy === hrId);
}

/** Assigns an employee to an HR manager (or removes the link with `hrId` undefined). */
export function assignHr(state: GameState, employeeId: string, hrId: string | undefined): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === employeeId);
  if (!e) return { ok: false, message: 'Unknown employee.' };
  if (!hrId) {
    e.hrBy = undefined;
    return { ok: true, message: `${e.name} no longer has an HR manager.` };
  }
  const m = state.employees.find((x) => x.id === hrId && x.role === 'hr');
  if (!m) return { ok: false, message: 'That HR manager has left.' };
  if (e.role === 'hr') return { ok: false, message: 'HR managers look after themselves.' };
  if (e.hrBy === hrId) return { ok: true, message: `${e.name} is already with ${m.name}.` };
  const cap = hrCapacity(m);
  if (managedBy(state, hrId).length >= cap) return { ok: false, message: `${m.name} already looks after ${cap} people (HR grade limit).` };
  e.hrBy = hrId;
  return { ok: true, message: `${m.name} now looks after ${e.name}.` };
}

/** Everyone without an HR manager goes to one with room — at their own location first. Returns how many were assigned. */
export function autoAssignHr(state: GameState): number {
  const hrs = hrManagers(state);
  if (!hrs.length) return 0;
  const load = new Map(hrs.map((h) => [h.id, managedBy(state, h.id).length]));
  let n = 0;
  for (const e of state.employees) {
    if (e.role === 'hr' || e.hrBy) continue;
    const room = hrs.filter((h) => (load.get(h.id) ?? 0) < hrCapacity(h));
    const pick = room.find((h) => h.locationId === e.locationId) ?? room[0];
    if (!pick) break;
    e.hrBy = pick.id;
    load.set(pick.id, (load.get(pick.id) ?? 0) + 1);
    n += 1;
  }
  return n;
}

/** Turns an HR manager's AUTO MANAGE on or off. Turning it on with HR on manual switches their location to automated. */
export function setHrAuto(state: GameState, hrId: string, on: boolean): { ok: boolean; message: string } {
  const m = state.employees.find((x) => x.id === hrId && x.role === 'hr');
  if (!m) return { ok: false, message: 'Unknown HR manager.' };
  m.hrAuto = on;
  if (on && modeFor(state, m.locationId, 'hr') === 'manual') {
    const l = (state.automation.local[m.locationId] ??= {});
    l.modes = { ...(l.modes ?? {}), hr: 'auto' };
    return { ok: true, message: `${m.name} now runs their people automatically (HR set to automated at this location).` };
  }
  return { ok: true, message: on ? `${m.name} now runs their people automatically.` : `${m.name} only advises now — you decide.` };
}

export interface HrKpi {
  managers: number;
  capacity: number;
  covered: number;
  uncovered: number;
  avgMorale: number;
  avgPerformance: number;
  absentToday: number;
  inTraining: number;
  promotable: number;
  payroll: number;
  vacancies: number;
  searches: number;
  trainingLeft: number;
}

export function hrKpi(state: GameState): HrKpi {
  const staff = state.employees;
  const hrs = hrManagers(state);
  const n = Math.max(1, staff.length);
  return {
    managers: hrs.length,
    capacity: hrs.reduce((s, h) => s + hrCapacity(h), 0),
    covered: staff.filter((e) => e.hrBy).length,
    uncovered: staff.filter((e) => e.role !== 'hr' && !e.hrBy).length,
    avgMorale: Math.round(staff.reduce((s, e) => s + e.morale, 0) / n),
    avgPerformance: Math.round(staff.reduce((s, e) => s + (e.performance ?? 55), 0) / n),
    absentToday: staff.filter((e) => e.absentDay === state.day).length,
    inTraining: staff.filter((e) => e.trainingDaysLeft > 0).length,
    promotable: staff.filter((e) => canPromote(e)).length,
    payroll: staff.reduce((s, e) => s + e.salary, 0),
    vacancies: vacancies(state).reduce((s, v) => s + v.short, 0),
    searches: openSearches(state).length,
    trainingLeft: Math.max(0, state.automation.policies.hr.trainingBudget - state.automation.spent.training),
  };
}

/** Roles short of the target headcount (per location) plus recent leavers to replace. */
export function vacancies(state: GameState): { role: Role; locationId: string; short: number; reason: 'target' | 'left' }[] {
  const pol = state.automation.policies.hr;
  const out: { role: Role; locationId: string; short: number; reason: 'target' | 'left' }[] = [];
  const pending = (role: Role, loc: string): number => openSearches(state).filter((s) => s.role === role && s.locationId === loc).length;
  for (const loc of state.locations) {
    for (const [role, target] of Object.entries(pol.targets) as [Role, number][]) {
      if (!target || !ROLE_BY_ID[role] || ROLE_BY_ID[role].minLevel > state.companyLevel) continue;
      const have = state.employees.filter((e) => e.role === role && e.locationId === loc.id).length;
      const short = target - have - pending(role, loc.id);
      if (short > 0) out.push({ role, locationId: loc.id, short, reason: 'target' });
    }
  }
  if (pol.autoReplace) {
    for (const l of state.automation.left) {
      if (state.day - l.day > 30 || !locationById(state, l.locationId)) continue;
      if (out.some((o) => o.role === l.role && o.locationId === l.locationId)) continue;
      if (pending(l.role, l.locationId)) continue;
      out.push({ role: l.role, locationId: l.locationId, short: 1, reason: 'left' });
    }
  }
  return out;
}

function pickTrack(e: Employee, wrong: boolean): string | undefined {
  const fits = TRAINING.filter((t) => t.roles.includes(e.role) && skillOf(e, t.skill) < 95);
  if (wrong) {
    const off = TRAINING.filter((t) => !t.roles.includes(e.role));
    return off.length ? gameRng.pick(off).id : undefined;
  }
  if (!fits.length) return undefined;
  // The weakest relevant skill first.
  return [...fits].sort((a, b) => skillOf(e, a.skill) - skillOf(e, b.skill))[0].id;
}

/** One HR manager's day for the people they look after. */
function runManager(state: GameState, m: Employee, mode: AutoMode, seen: Set<string>): void {
  const pol = state.automation.policies.hr;
  const q = managerQuality(m, 'hr');
  let actions = MANAGER_ACTIONS(q, m.level);
  const err = errorRate(q);
  const people = managedBy(state, m.id).filter((e) => state.employees.includes(e));
  const cash = (): number => state.cash;
  const suggest = (key: string, text: string, params?: Record<string, string>): void =>
    raise(state, { dept: 'hr', priority: 'normal', text, locationId: m.locationId, route: 'people', params, key }, seen);

  // Welfare first: a talk for the unhappy, a day off before burn-out.
  for (const e of people) {
    if (actions <= 0) break;
    if ((e.stress ?? 0) > 85 && e.absentDay !== state.day + 1) {
      if (mode === 'assisted') { suggest(`hr:stress:${e.id}`, `${e.name} is close to burning out (stress ${Math.round(e.stress ?? 0)}). Give them a day off.`); continue; }
      e.absentDay = state.day + 1;
      e.stress = clamp((e.stress ?? 0) - 22, 0, 100);
      bump(state, 'hr', 'daysOff');
      actions -= 1;
    } else if (e.morale < 35) {
      if (mode === 'assisted') { suggest(`hr:morale:${e.id}`, `${e.name}'s morale is low (${Math.round(e.morale)}). A raise or bonus would help.`); continue; }
      e.morale = clamp(e.morale + 6 + q / 25, 0, 100);
      bump(state, 'hr', 'talks');
      actions -= 1;
    }
  }

  // Training within the monthly budget.
  const trainees = people
    .filter((e) => e.trainingDaysLeft === 0 && e.absentDay !== state.day && e.skill < pol.trainBelow)
    .sort((a, b) => a.skill - b.skill);
  for (const e of trainees) {
    if (actions <= 0) break;
    const wrong = gameRng.chance(err);
    const track = pickTrack(e, wrong);
    const cost = trainingCost(e, track, state);
    if (state.automation.spent.training + cost > pol.trainingBudget || cash() < cost + 5000) break;
    if (mode === 'assisted') { suggest(`hr:train:${e.id}`, `${e.name} (skill ${e.skill}) is due a course — €${cost.toLocaleString('en-GB')}.`); continue; }
    const r = train(state, e.id, track);
    if (!r.ok) continue;
    state.automation.spent.training += cost;
    bump(state, 'hr', 'trained');
    bump(state, 'hr', 'spent', cost);
    if (wrong) bump(state, 'hr', 'errors');
    actions -= 1;
  }

  // Promotions against your thresholds (a weak manager sometimes promotes too early).
  for (const e of people) {
    if (actions <= 0) break;
    if (!canPromote(e)) continue;
    const months = (state.day - e.hiredDay) / 30;
    const early = gameRng.chance(err);
    const meets = e.skill >= pol.promoteSkill && (e.performance ?? 55) >= pol.promotePerf && months >= pol.promoteMonths;
    if (!meets && !early) continue;
    if (mode === 'assisted') { if (meets) suggest(`hr:promote:${e.id}`, `${e.name} meets your promotion criteria.`); continue; }
    const r = promote(state, e.id);
    if (!r.ok) continue;
    bump(state, 'hr', 'promoted');
    if (!meets) {
      bump(state, 'hr', 'errors');
      // Colleagues notice a premature promotion.
      for (const o of people) if (o.id !== e.id && o.role === e.role) o.morale = clamp(o.morale - 3, 0, 100);
    }
    actions -= 1;
  }
}

/** Monthly pay review for the people HR looks after. */
function salaryReview(state: GameState, m: Employee, mode: AutoMode, seen: Set<string>): void {
  const q = managerQuality(m, 'hr');
  const err = errorRate(q);
  let actions = MANAGER_ACTIONS(q, m.level);
  for (const e of managedBy(state, m.id)) {
    if (actions <= 0) break;
    const fair = salaryFor(e.role, e.skill, e.level);
    const underpaid = e.salary < fair * 0.93 && e.morale < 65;
    const mistake = !underpaid && gameRng.chance(err * 0.3);
    if (!underpaid && !mistake) continue;
    if (mode === 'assisted') {
      if (underpaid) raise(state, { dept: 'hr', priority: 'normal', text: `${e.name} earns €${e.salary.toLocaleString('en-GB')} — fair pay is about €${fair.toLocaleString('en-GB')}.`, locationId: e.locationId, route: 'people', key: `hr:pay:${e.id}` }, seen);
      continue;
    }
    giveRaise(state, e.id);
    bump(state, 'hr', 'raises');
    if (mistake) bump(state, 'hr', 'errors');
    actions -= 1;
  }
}

function hireFromPool(state: GameState, role: Role, locationId: string): boolean {
  const pool = state.candidates.filter((c) => c.role === role).sort((a, b) => b.skill - a.skill);
  const c = pool[0];
  if (!c) return false;
  return hire(state, c.id, locationId).ok;
}

/** Recruitment to the target headcount and replacement of leavers (group-wide). */
function recruit(state: GameState, seen: Set<string>): void {
  const hrs = hrManagers(state).filter((h) => h.hrAuto !== false);
  const open = vacancies(state);
  if (!open.length) return;
  if (!hrs.length) {
    raise(state, { dept: 'hr', priority: 'high', text: `${open.length} vacanc${open.length === 1 ? 'y' : 'ies'} but no HR manager to recruit — hire one (People → Hire).`, route: 'people', key: 'hr:nohr' }, seen);
    return;
  }
  const lv = headhunterLevel(state);
  let budget = hrs.reduce((s, h) => s + Math.max(1, Math.floor(managerQuality(h, 'hr') / 30)), 0);
  for (const v of open) {
    if (budget <= 0) break;
    const mode = modeFor(state, v.locationId, 'hr');
    if (mode === 'manual') continue;
    const loc = locationById(state, v.locationId)!;
    const roleName = ROLE_BY_ID[v.role].name;
    const key = `hr:vac:${v.locationId}:${v.role}`;
    if (!freeStation(state, loc, v.role)) {
      raise(state, { dept: 'hr', priority: 'high', text: `${loc.name} needs a ${roleName.toLowerCase()} but has no free workstation for one.`, locationId: loc.id, route: 'dealership', key }, seen);
      continue;
    }
    if (mode === 'assisted') {
      raise(state, { dept: 'hr', priority: 'normal', text: `${loc.name}: ${v.short} ${roleName.toLowerCase()}${v.short > 1 ? 's' : ''} short${v.reason === 'left' ? ' after someone left' : ' of target'}.`, locationId: loc.id, route: 'people', key }, seen);
      continue;
    }
    let done = false;
    if (lv && state.cash > lv.searchFee + 10000) {
      const crit = defaultCriteria(v.role);
      crit.minSkill = Math.max(40, Math.min(75, state.automation.policies.hr.promoteSkill - 5));
      done = startSearch(state, v.role, v.locationId, crit, true).ok;
    }
    if (!done) done = hireFromPool(state, v.role, v.locationId);
    if (done) {
      budget -= 1;
      bump(state, 'hr', v.reason === 'left' ? 'replaced' : 'recruited');
      if (v.reason === 'left') {
        const i = state.automation.left.findIndex((l) => l.role === v.role && l.locationId === v.locationId);
        if (i >= 0) state.automation.left.splice(i, 1);
      }
    } else {
      raise(state, { dept: 'hr', priority: 'normal', text: `No suitable ${roleName.toLowerCase()} found for ${loc.name} yet — HR keeps looking.`, locationId: loc.id, route: 'people', key }, seen);
    }
  }
}

/** Automatic searches that brought candidates: HR hires the best match. */
function closeAutoSearches(state: GameState, seen: Set<string>): void {
  for (const s of state.headhunter.searches) {
    if (s.status !== 'ready' || !s.auto) continue;
    if (modeFor(state, s.locationId, 'hr') !== 'auto') continue;
    const best = [...s.candidates].sort((a, b) => misses(a, s.criteria).length - misses(b, s.criteria).length || b.skill - a.skill)[0];
    if (!best) continue;
    const lv = HEADHUNTER_LEVELS[Math.max(0, state.headhunter.level - 1)];
    const fee = Math.round(best.salary * 12 * lv.successFee / 10) * 10;
    if (state.cash < fee + 5000) {
      raise(state, { dept: 'hr', priority: 'high', text: `Not enough cash for the headhunter's success fee (€${fee.toLocaleString('en-GB')}).`, route: 'people', key: `hr:fee:${s.id}` }, seen);
      continue;
    }
    const r = hireCandidate(state, s.id, best.id);
    if (r.ok) bump(state, 'hr', 'spent', fee);
  }
}

/** Daily HR run. */
export function hrDaily(state: GameState): void {
  const seen = new Set<string>();
  const anyOn = state.locations.some((l) => modeFor(state, l.id, 'hr') !== 'manual');
  if (anyOn) autoAssignHr(state);
  for (const m of hrManagers(state)) {
    const mode = modeFor(state, m.locationId, 'hr');
    const count = managedBy(state, m.id).length;
    if (count > hrCapacity(m)) {
      raise(state, { dept: 'hr', priority: 'high', text: `${m.name} looks after ${count} people but can handle ${hrCapacity(m)}. Hire or promote HR.`, route: 'management', params: { tab: 'hr' }, key: `hr:cap:${m.id}` }, seen);
    }
    if (mode === 'manual' || m.hrAuto === false) continue;
    if (m.trainingDaysLeft > 0 || m.absentDay === state.day) continue;
    runManager(state, m, mode, seen);
  }
  if (anyOn) {
    const loose = state.employees.filter((e) => e.role !== 'hr' && !e.hrBy).length;
    if (loose > 0 && hrManagers(state).length) {
      raise(state, { dept: 'hr', priority: 'normal', text: `${loose} employee${loose === 1 ? '' : 's'} without an HR manager — every HR manager is full.`, route: 'management', params: { tab: 'hr' }, key: 'hr:loose' }, seen);
    }
    recruit(state, seen);
    closeAutoSearches(state, seen);
  }
  // Old leavers are forgotten after a month.
  state.automation.left = state.automation.left.filter((l) => state.day - l.day <= 30);
  // Pay suggestions come from the monthly review and stay for the month.
  for (const x of state.automation.exceptions) if (x.key.startsWith('hr:pay:') && state.day - x.day < 30) seen.add(x.key);
  settle(state, 'hr:', seen);
}

/** Monthly: pay review by HR managers on AUTO MANAGE. */
export function hrMonthly(state: GameState): void {
  if (!state.automation.policies.hr.salaryReview) return;
  const seen = new Set<string>();
  for (const m of hrManagers(state)) {
    const mode = modeFor(state, m.locationId, 'hr');
    if (mode === 'manual' || m.hrAuto === false) continue;
    salaryReview(state, m, mode, seen);
  }
}
