/**
 * Automation core (v7.3): policies per location, who runs each department and
 * how well, exceptions, approvals and the daily management report.
 *
 * Kept free of the customer/sales modules so those can call into it (policy
 * limits, report counters) without an import cycle.
 */
import type { AutoException, AutoMode, AutoPriority, AutoReport, AutomationState, Customer, Dept, Employee, GameState, InventoryPolicy, Location, MarketingPolicy, ProcurementPolicy, Vehicle } from '../types';
import { DEPT_BY_ID, DEPARTMENTS, HR_CAPACITY, LOGI_BY_TYPE, MANAGER_ACTIONS, PRIORITY_RANK, defaultPolicies } from '../../data/automation';
import { isRecord } from '../util';
import { nextId, pushNotice } from '../state';
import { skillOf } from '../staff';

export function emptyAutomation(): AutomationState {
  return { policies: defaultPolicies(), local: {}, exceptions: [], approvals: [], reports: [], rules: [], spent: { training: 0, marketing: 0, procurement: 0 }, left: [] };
}

/** Fills in automation, headhunter and logistics state for new games and older saves. */
export function initAutomation(s: GameState): void {
  const a = isRecord(s.automation) ? s.automation as Partial<AutomationState> : {};
  const base = emptyAutomation();
  const pol = isRecord(a.policies) ? a.policies : undefined;
  const merged = { ...base.policies } as AutomationState['policies'];
  if (pol) {
    for (const k of Object.keys(base.policies) as (keyof AutomationState['policies'])[]) {
      const v = (pol as Record<string, unknown>)[k];
      if (isRecord(v)) (merged as unknown as Record<string, unknown>)[k] = { ...(base.policies[k] as object), ...v };
    }
  }
  s.automation = {
    policies: merged,
    local: isRecord(a.local) ? a.local as AutomationState['local'] : {},
    exceptions: Array.isArray(a.exceptions) ? a.exceptions : [],
    approvals: Array.isArray(a.approvals) ? a.approvals : [],
    reports: Array.isArray(a.reports) ? a.reports : [],
    rules: Array.isArray(a.rules) ? a.rules : [],
    spent: { ...base.spent, ...(isRecord(a.spent) ? a.spent : {}) },
    left: Array.isArray(a.left) ? a.left : [],
  };
  const hh = isRecord(s.headhunter) ? s.headhunter : undefined;
  s.headhunter = { level: typeof hh?.level === 'number' ? hh.level : 0, searches: Array.isArray(hh?.searches) ? hh!.searches : [], placed: typeof hh?.placed === 'number' ? hh.placed : 0, since: hh?.since };
  const lg = isRecord(s.logistics) ? s.logistics : undefined;
  s.logistics = { fleet: Array.isArray(lg?.fleet) ? lg!.fleet : [], movedMonth: typeof lg?.movedMonth === 'number' ? lg.movedMonth : 0, costMonth: typeof lg?.costMonth === 'number' ? lg.costMonth : 0 };
  // Everyone that is not an HR manager can be looked after by one; drop links to people who left.
  const hrIds = new Set(s.employees.filter((e) => e.role === 'hr').map((e) => e.id));
  for (const e of s.employees) {
    if (e.hrBy && !hrIds.has(e.hrBy)) e.hrBy = undefined;
    if (e.role === 'hr' && e.hrAuto === undefined) e.hrAuto = true;
  }
}

// ---------------------------------------------------------------- policy --

export function modeFor(state: GameState, locationId: string, dept: Dept): AutoMode {
  return state.automation?.local[locationId]?.modes?.[dept] ?? state.automation?.policies.modes[dept] ?? 'manual';
}

export function procurementPolicy(state: GameState, locationId: string): ProcurementPolicy {
  const p = state.automation.policies.procurement;
  const l = state.automation.local[locationId];
  return { ...p, stockMin: l?.stockMin ?? p.stockMin, stockTarget: l?.stockTarget ?? p.stockTarget };
}

export function inventoryPolicy(state: GameState, locationId: string): InventoryPolicy {
  const p = state.automation.policies.inventory;
  const l = state.automation.local[locationId];
  return { ...p, minStock: l?.stockMin ?? p.minStock, targetStock: l?.stockTarget ?? p.targetStock, maxStock: l?.stockMax ?? p.maxStock };
}

export function marketingPolicy(state: GameState, locationId: string): MarketingPolicy {
  const p = state.automation.policies.marketing;
  return { ...p, monthlyBudget: state.automation.local[locationId]?.marketingBudget ?? p.monthlyBudget };
}

/** HQ spreads its policy: every location follows the group settings again. */
export function applyHqPolicy(state: GameState): { ok: boolean; message: string } {
  const n = Object.keys(state.automation.local).length;
  state.automation.local = {};
  return { ok: true, message: n ? `Every location now follows the group policy (${n} override${n === 1 ? '' : 's'} removed).` : 'Every location already follows the group policy.' };
}

// -------------------------------------------------------------- managers --

/** How well someone runs a department: 0..100 (skill, management, reliability, level). */
export function managerQuality(e: Employee, dept: Dept): number {
  const d = DEPT_BY_ID[dept];
  const q = skillOf(e, d.skill) * 0.45 + skillOf(e, 'management') * 0.25 + skillOf(e, 'reliability') * 0.15 + e.level * 3;
  return Math.max(1, Math.min(100, Math.round(q)));
}

/** Chance per decision of a mistake (overpaying, over-discounting, the wrong course…). Never zero. */
export function errorRate(quality: number): number {
  return Math.max(0.02, Math.min(0.25, 0.25 - quality / 450));
}

export interface DeptManager { e: Employee; quality: number; actions: number; err: number }

/** Who runs a department at a location (the best person in one of its roles who is at work). */
export function managerFor(state: GameState, locationId: string, dept: Dept): DeptManager | undefined {
  const d = DEPT_BY_ID[dept];
  let best: DeptManager | undefined;
  for (const role of d.roles) {
    for (const e of state.employees) {
      if (e.role !== role || e.locationId !== locationId || e.trainingDaysLeft > 0 || e.absentDay === state.day) continue;
      // Managers with a sales or service focus run that department; a general manager runs anything.
      if (role === 'manager' && (dept === 'sales' || dept === 'service') && e.focus && e.focus !== 'general' && e.focus !== dept) continue;
      const q = managerQuality(e, dept);
      if (!best || q > best.quality) best = { e, quality: q, actions: MANAGER_ACTIONS(q, e.level), err: errorRate(q) };
    }
    if (best) break;
  }
  return best;
}

// -------------------------------------------------------------------- HR --

/** HR grade 1..10: two per level, one more with strong management. */
export function hrGrade(e: Employee): number {
  return Math.max(1, Math.min(10, e.level * 2 - 1 + (skillOf(e, 'management') >= 70 ? 1 : 0)));
}

export function hrCapacity(e: Employee): number {
  return HR_CAPACITY[hrGrade(e) - 1] ?? HR_CAPACITY[0];
}

// --------------------------------------------------------------- reports --

export function todayReport(state: GameState): AutoReport {
  const reps = state.automation.reports;
  if (!reps[0] || reps[0].day !== state.day) {
    reps.unshift({ day: state.day, lines: {} });
    if (reps.length > 35) reps.length = 35;
  }
  return reps[0];
}

/** Adds to today's management report ("bought", "spent", "sold"…). */
export function bump(state: GameState, dept: Dept, key: string, n = 1): void {
  if (!state.automation) return;
  const r = todayReport(state);
  const line = (r.lines[dept] ??= {});
  line[key] = (line[key] ?? 0) + n;
}

/** Sum of the last `days` reports. */
export function reportTotals(state: GameState, days: number): Partial<Record<Dept, Record<string, number>>> {
  const out: Partial<Record<Dept, Record<string, number>>> = {};
  for (const r of state.automation.reports) {
    if (r.day <= state.day - days) break;
    for (const [dept, line] of Object.entries(r.lines) as [Dept, Record<string, number>][]) {
      const o = (out[dept] ??= {});
      for (const [k, v] of Object.entries(line)) o[k] = (o[k] ?? 0) + v;
    }
  }
  return out;
}

// ------------------------------------------------------------ exceptions --

/** Raises (or refreshes) an exception. Critical and high ones also reach the notifications once. */
export function raise(state: GameState, ex: Omit<AutoException, 'id' | 'day'>, seen?: Set<string>): void {
  seen?.add(ex.key);
  const list = state.automation.exceptions;
  const old = list.find((x) => x.key === ex.key);
  if (old) {
    old.text = ex.text;
    old.priority = ex.priority;
    old.day = state.day;
    return;
  }
  list.unshift({ ...ex, id: nextId(state, 'ax'), day: state.day });
  if (list.length > 60) list.length = 60;
  if (PRIORITY_RANK[ex.priority] >= 2) pushNotice(state, ex.priority === 'critical' ? 'bad' : 'info', `${ex.priority === 'critical' ? '⚠ ' : ''}${ex.text}`, undefined, 'auto');
}

/** Drops exceptions of a family (key prefix) that were not raised again today: the problem is gone. */
export function settle(state: GameState, prefix: string, seen: Set<string>): void {
  state.automation.exceptions = state.automation.exceptions.filter((x) => !x.key.startsWith(prefix) || seen.has(x.key));
}

export function dismissException(state: GameState, id: string): { ok: boolean; message: string } {
  const before = state.automation.exceptions.length;
  state.automation.exceptions = state.automation.exceptions.filter((x) => x.id !== id);
  return { ok: before !== state.automation.exceptions.length, message: 'Dismissed.' };
}

export function sortedExceptions(state: GameState): AutoException[] {
  return [...state.automation.exceptions].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.day - a.day);
}

/** Departments that run assisted or automated somewhere. */
export function activeDepartments(state: GameState): Dept[] {
  return DEPARTMENTS.map((d) => d.id).filter((d) => state.locations.some((l) => modeFor(state, l.id, d) !== 'manual'));
}

export function stockAt(state: GameState, loc: Location): number {
  return state.vehicles.filter((v) => (v.locationId === loc.id && v.status !== 'sold' && v.status !== 'offer' && v.status !== 'transfer') || (v.status === 'transfer' && v.transferTo === loc.id)).length;
}

// ----------------------------------------------------------------- sales --

/** The lowest price your sales policy allows for a car (margin over cost and maximum discount). */
export function salesFloor(state: GameState, v: Vehicle, cost: number): number {
  const p = state.automation.policies.sales;
  return Math.min(v.askingPrice, Math.max(cost + p.minMargin, Math.round(v.askingPrice * (1 - p.maxDiscount))));
}

/** A deal your advisor can't close alone: it waits (two days) for your yes or no; the car stays reserved. */
export function requestApproval(state: GameState, c: Customer, v: Vehicle, staffId: string, price: number, margin: number, reason: string): void {
  state.automation.approvals.unshift({
    id: nextId(state, 'ap'), day: state.day, expires: state.day + 2, locationId: c.locationId, vehicleId: v.id, staffId, price, margin, reason,
    customer: { ...c, status: 'negotiating' },
  });
  if (state.automation.approvals.length > 30) state.automation.approvals.length = 30;
  v.reservedBy = c.id;
  v.reservedUntil = state.day + 2;
  // They go home to wait for the call; not a lost lead.
  c.status = 'left';
  bump(state, 'sales', 'approvals');
  pushNotice(state, 'info', `✋ Approval needed: ${c.name} offers €${price.toLocaleString('en-GB')} for the ${v.brand} ${v.model} (${reason}).`, undefined, 'auto');
}

// ------------------------------------------------------------- logistics --

/** Your own fleet's moves still free today (vehicles that broke down don't count). */
export function fleetFree(state: GameState): number {
  const lg = state.logistics;
  if (!lg) return 0;
  const cap = lg.fleet.filter((a) => !a.downUntil || a.downUntil <= state.day).reduce((s, a) => s + LOGI_BY_TYPE[a.type].capacity, 0);
  return Math.max(0, cap - (lg.usedDay === state.day ? lg.used ?? 0 : 0));
}

/** Uses one fleet move today; returns its cost, or undefined when the fleet is busy (a third party moves it). */
export function fleetSlot(state: GameState): number | undefined {
  if (fleetFree(state) <= 0) return undefined;
  const lg = state.logistics;
  const avail = lg.fleet.filter((a) => !a.downUntil || a.downUntil <= state.day);
  const cost = Math.min(...avail.map((a) => LOGI_BY_TYPE[a.type].perMove));
  if (lg.usedDay !== state.day) { lg.usedDay = state.day; lg.used = 0; }
  lg.used = (lg.used ?? 0) + 1;
  lg.movedMonth += 1;
  lg.costMonth += cost;
  bump(state, 'logistics', 'moves');
  return cost;
}

export type { AutoPriority };
