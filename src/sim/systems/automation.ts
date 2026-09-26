/**
 * The automation engine (v7.3).
 *
 * Every department can run MANUAL, ASSISTED or AUTO per location (the HQ
 * policy, with local overrides). Each day the engine walks a data-driven list
 * of rules — IF a metric THEN an action — highest priority first, for every
 * location. A rule only runs when the department is assisted or automated and
 * someone runs it: their quality decides how many things they get through in a
 * day and how often they get something wrong. Assisted rules raise exceptions
 * for you to act on; automated rules act and log it in the management report.
 * Player-made rules (Management → Rules) run after the built-in ones.
 *
 * Automation costs money: an overhead per automated department, the
 * headhunter's retainer and your fleet — and it never takes the wheel away:
 * a car you priced by hand keeps its price, and big or off-policy deals wait
 * for your approval.
 */
import type { AutoMode, AutoPriority, CustomRule, Dept, GameState, Location, PartId, Role, RuleMetric, Vehicle } from '../types';
import { CHANNEL_BY_ID, ROLE_BY_ID } from '../../data/game';
import { PARTS } from '../../data/service';
import { DEPARTMENTS, DEPT_BY_ID, DEPT_OVERHEAD, HEADHUNTER_LEVELS, PRIORITY_RANK, RULE_ACTIONS, RULE_METRICS } from '../../data/automation';
import { gameRng } from '../rng';
import { clamp } from '../util';
import { locationById, nextId, pushNotice, vehicleName } from '../state';
import { record } from '../finance';
import { roundPrice, suggestedPrice, totalCost } from '../market';
import { listVehicle, quickSell } from '../trading';
import { completeSale } from '../sales';
import { payCommission, hire } from '../staff';
import { lotStats } from '../lot';
import { campaignRoi, channelAvailable, launchCampaign } from '../world';
import { autoFix, conflicts } from './planning';
import { canServiceEv, orderParts, partsPriceMult, partsStock } from './service';
import { buyers, defaultMandate, mandateFor } from './procurement';
import { defaultCriteria, headhunterLevel, startSearch } from './headhunter';
import {
  bump, inventoryPolicy, managerFor, marketingPolicy, modeFor, procurementPolicy, raise, reportTotals, settle, stockAt,
} from './autocore';
import type { DeptManager } from './autocore';

// ------------------------------------------------------------------ rules --

interface RuleCtx {
  state: GameState;
  loc: Location;
  mode: AutoMode;
  mgr: DeptManager | undefined;
  /** Actions the department still has today at this location. */
  budget: { left: number };
  seen: Set<string>;
}

export interface BuiltInRule {
  id: string;
  dept: Dept;
  priority: AutoPriority;
  name: string;
  /** IF … (human readable, for the rules screen). */
  when: string;
  /** THEN … */
  then: string;
  /** Needs someone running the department to act (assisted rules only flag). */
  needsManager: boolean;
  run: (ctx: RuleCtx) => void;
}

const eur = (n: number): string => `€${Math.round(n).toLocaleString('en-GB')}`;

function flag(ctx: RuleCtx, dept: Dept, key: string, text: string, priority: AutoPriority = 'normal', route?: string, params?: Record<string, string>): void {
  raise(ctx.state, { dept, priority, text, locationId: ctx.loc.id, route, params, key: `${key}:${ctx.loc.id}` }, ctx.seen);
}

/** Uses one action; false when the department is out of time today. */
function spend(ctx: RuleCtx): boolean {
  if (ctx.budget.left <= 0) return false;
  ctx.budget.left -= 1;
  return true;
}

function erred(ctx: RuleCtx): boolean {
  return !!ctx.mgr && gameRng.chance(ctx.mgr.err);
}

function yardCars(state: GameState, loc: Location): Vehicle[] {
  return state.vehicles.filter((v) => v.locationId === loc.id && v.status === 'yard' && !v.prep?.length);
}

function listedCars(state: GameState, loc: Location): Vehicle[] {
  return state.vehicles.filter((v) => v.locationId === loc.id && v.status === 'listed');
}

function busy(state: GameState, v: Vehicle): boolean {
  return state.customers.some((c) => c.vehicleId === v.id && (c.status === 'negotiating' || c.status === 'waiting'))
    || state.automation.approvals.some((a) => a.vehicleId === v.id);
}

/** Cuts a car's price by a share, never under cost + a little, and logs it. */
function cutPrice(state: GameState, v: Vehicle, share: number): boolean {
  if (v.manualPrice) return false;
  const floor = totalCost(v) + 200;
  const next = Math.max(floor, roundPrice(v.askingPrice * (1 - share)));
  if (next >= v.askingPrice) return false;
  v.askingPrice = next;
  v.floorPrice = Math.min(v.floorPrice, roundPrice(next * 0.92));
  v.priceCuts = (v.priceCuts ?? 0) + 1;
  v.repricedDay = state.day;
  return true;
}

export const RULES: BuiltInRule[] = [
  {
    id: 'proc-stock', dept: 'procurement', priority: 'high', name: 'Keep the lot stocked', needsManager: false,
    when: 'Stock below the minimum', then: 'Activate buyers on the policy brief; pause them at target',
    run: (ctx) => {
      const { state, loc, mode } = ctx;
      const pol = procurementPolicy(state, loc.id);
      const stock = stockAt(state, loc);
      const team = buyers(state, loc.id);
      if (!team.length) {
        if (stock < pol.stockMin) flag(ctx, 'procurement', 'pr:nobuyer', `${loc.name} has ${stock} cars (minimum ${pol.stockMin}) and no buyer — hire one.`, stock < pol.stockMin / 2 ? 'critical' : 'high', 'people');
        return;
      }
      const left = Math.max(0, pol.monthlyBudget - state.automation.spent.procurement);
      const need = stock < pol.stockMin || (stock < pol.stockTarget && team.some((e) => mandateFor(state, e.id)?.active));
      for (const e of team) {
        let m = mandateFor(state, e.id);
        if (!m) { m = defaultMandate(state, e); state.procurement.mandates.push(m); }
        // The brief follows the policy.
        m.maxPrice = pol.maxPrice;
        m.minMargin = pol.minMargin;
        m.risk = pol.risk;
        m.categories = [...pol.categories];
        m.fuels = [...pol.fuels];
        m.kmMax = pol.kmMax;
        m.autoApprove = mode === 'auto';
        m.autoLimit = pol.autoBuyUnder;
        m.budget = m.spent + Math.round(left / team.length);
        const was = m.active;
        m.active = need && left >= 1000;
        if (m.active !== was) bump(state, 'procurement', m.active ? 'started' : 'paused');
      }
      if (stock < pol.stockMin && left < 1000) flag(ctx, 'procurement', 'pr:budget', `The procurement budget for this month is used up — ${loc.name} is below minimum stock.`, 'high', 'management', { tab: 'procurement' });
      const waiting = state.procurement.proposals.filter((p) => p.locationId === loc.id).length;
      if (mode === 'assisted' && waiting) flag(ctx, 'procurement', 'pr:proposals', `${waiting} purchase proposal${waiting > 1 ? 's' : ''} at ${loc.name} wait for your approval.`, 'normal', 'inventory', { tab: 'buyers' });
    },
  },
  {
    id: 'inv-list', dept: 'inventory', priority: 'normal', name: 'List ready cars', needsManager: true,
    when: 'A prepared car stands in the yard', then: 'Price it to the policy and put it on sale',
    run: (ctx) => {
      const { state, loc, mode } = ctx;
      const pol = inventoryPolicy(state, loc.id);
      loc.pricing = pol.pricing;
      state.autoList[loc.id] = pol.autoList;
      if (!pol.autoList) return;
      const cars = yardCars(state, loc);
      if (!cars.length) return;
      if (mode === 'assisted') { flag(ctx, 'inventory', 'inv:yard', `${cars.length} ready car${cars.length > 1 ? 's' : ''} at ${loc.name} not on sale yet.`, 'normal', 'inventory'); return; }
      for (const v of cars) {
        if (!spend(ctx)) break;
        if (!v.manualPrice) {
          v.askingPrice = suggestedPrice(state, v);
          // A careless manager sometimes lists a car too cheap.
          if (erred(ctx)) { v.askingPrice = roundPrice(v.askingPrice * 0.94); bump(state, 'inventory', 'errors'); }
          v.floorPrice = roundPrice(v.askingPrice * 0.92);
        }
        const r = listVehicle(state, v.id);
        if (r.ok) bump(state, 'inventory', 'listed');
        else { flag(ctx, 'inventory', 'inv:space', `${loc.name} has no free show space to list cars — build more spaces.`, 'high', 'dealership'); break; }
      }
    },
  },
  {
    id: 'inv-reprice', dept: 'inventory', priority: 'normal', name: 'Reprice ageing stock', needsManager: true,
    when: 'A car is on sale longer than the reprice age', then: 'Cut its price by 3% (weekly), never below cost',
    run: (ctx) => {
      const { state, loc, mode } = ctx;
      const pol = inventoryPolicy(state, loc.id);
      const old = listedCars(state, loc).filter((v) => v.daysInStock >= pol.repriceDays && !v.manualPrice && (v.repricedDay ?? -99) <= state.day - 7 && !busy(state, v))
        .sort((a, b) => b.daysInStock - a.daysInStock);
      if (!old.length) return;
      if (mode === 'assisted') { flag(ctx, 'inventory', 'inv:reprice', `${old.length} car${old.length > 1 ? 's' : ''} at ${loc.name} on sale over ${pol.repriceDays} days — time for a new price.`, 'normal', 'inventory'); return; }
      for (const v of old) {
        if (!spend(ctx)) break;
        const deep = erred(ctx);
        if (deep) bump(state, 'inventory', 'errors');
        if (cutPrice(state, v, deep ? 0.08 : 0.03)) bump(state, 'inventory', 'repriced');
      }
    },
  },
  {
    id: 'inv-clear', dept: 'inventory', priority: 'high', name: 'Clear old stock', needsManager: true,
    when: 'A car is older than the clearance age', then: 'Sell it to the trade',
    run: (ctx) => {
      const { state, loc, mode } = ctx;
      const pol = inventoryPolicy(state, loc.id);
      const old = state.vehicles.filter((v) => v.locationId === loc.id && (v.status === 'listed' || v.status === 'yard') && v.daysInStock >= pol.clearDays && !busy(state, v));
      if (!old.length) return;
      if (mode === 'assisted') { flag(ctx, 'inventory', 'inv:clear', `${old.length} car${old.length > 1 ? 's' : ''} at ${loc.name} older than ${pol.clearDays} days — sell to the trade?`, 'high', 'inventory'); return; }
      for (const v of old) {
        if (!spend(ctx)) break;
        const r = quickSell(state, v.id);
        if (r.ok) { bump(state, 'inventory', 'cleared'); bump(state, 'inventory', 'clearLoss', Math.min(0, r.profit ?? 0)); }
      }
    },
  },
  {
    id: 'inv-over', dept: 'inventory', priority: 'normal', name: 'Watch overstock', needsManager: false,
    when: 'Stock above the maximum', then: 'Pause buying and tell you',
    run: (ctx) => {
      const { state, loc } = ctx;
      const pol = inventoryPolicy(state, loc.id);
      const stock = stockAt(state, loc);
      if (stock <= pol.maxStock) return;
      for (const e of buyers(state, loc.id)) { const m = mandateFor(state, e.id); if (m?.active) { m.active = false; bump(state, 'procurement', 'paused'); } }
      flag(ctx, 'inventory', 'inv:over', `${loc.name} holds ${stock} cars — above the maximum of ${pol.maxStock}. Buying is paused.`, 'normal', 'inventory');
    },
  },
  {
    id: 'svc-plan', dept: 'service', priority: 'high', name: 'Fix the workshop planning', needsManager: true,
    when: 'The planning has a conflict', then: 'Reassign or reschedule the jobs',
    run: (ctx) => {
      const { state, loc, mode } = ctx;
      if (!state.automation.policies.service.autoFix) return;
      for (const day of [state.day, state.day + 1]) {
        const list = conflicts(state, loc.id, day);
        if (!list.length) continue;
        if (mode === 'assisted') { flag(ctx, 'service', `svc:conf:${day}`, `${list.length} planning conflict${list.length > 1 ? 's' : ''} at ${loc.name}${day > state.day ? ' tomorrow' : ''}.`, 'normal', 'service'); continue; }
        if (!spend(ctx)) break;
        const r = autoFix(state, loc.id, day);
        bump(state, 'service', 'fixed', list.length);
        if (!r.ok) flag(ctx, 'service', `svc:left:${day}`, `${loc.name}: ${r.message}`, 'high', 'service');
      }
    },
  },
  {
    id: 'parts-reorder', dept: 'parts', priority: 'normal', name: 'Reorder parts', needsManager: true,
    when: 'A part is below its minimum', then: 'Order up to the target (express when out)',
    run: (ctx) => {
      const { state, loc, mode } = ctx;
      const lifts = lotStats(loc.lot).slots.lift.length;
      if (!lifts) return;
      const pol = state.automation.policies.parts;
      const stock = partsStock(loc);
      const low: { id: PartId; qty: number; out: boolean }[] = [];
      for (const p of PARTS) {
        if (p.id === 'ev' && !canServiceEv(state, loc)) continue;
        const onOrder = (loc.partsOrders ?? []).filter((o) => o.part === p.id).reduce((s, o) => s + o.qty, 0);
        const min = Math.ceil(p.min * (0.6 + lifts * 0.4) * pol.minFactor);
        const have = (stock[p.id] ?? 0) + onOrder;
        if (have < min) low.push({ id: p.id, qty: Math.ceil(min * pol.targetFactor) - have, out: (stock[p.id] ?? 0) === 0 });
      }
      if (!low.length) return;
      if (mode === 'assisted') { flag(ctx, 'parts', 'parts:low', `${low.length} part${low.length > 1 ? 's' : ''} below minimum at ${loc.name}.`, low.some((l) => l.out) ? 'high' : 'normal', 'service', { tab: 'parts' }); return; }
      for (const l of low) {
        if (!spend(ctx)) break;
        const def = PARTS.find((p) => p.id === l.id)!;
        // A careless order: too many.
        const qty = erred(ctx) ? Math.ceil(l.qty * 1.6) : l.qty;
        const cost = Math.round(def.cost * partsPriceMult(state)) * qty;
        if (state.cash < cost + 3000) { flag(ctx, 'parts', 'parts:cash', `Not enough cash to reorder parts at ${loc.name}.`, 'high', 'finance'); break; }
        const r = orderParts(state, loc.id, l.id, qty, pol.express && l.out);
        if (r.ok) { bump(state, 'parts', 'ordered', qty); bump(state, 'parts', 'spent', cost); }
      }
    },
  },
  {
    id: 'mkt-run', dept: 'marketing', priority: 'low', name: 'Run campaigns in budget', needsManager: true,
    when: 'No campaign runs and budget is left', then: 'Launch the best-paying channel; stop poor performers',
    run: (ctx) => {
      const { state, loc, mode } = ctx;
      const pol = marketingPolicy(state, loc.id);
      const running = state.campaigns.filter((c) => c.locationId === loc.id && c.endDay >= state.day && c.startDay <= state.day);
      // Stop what doesn't pay after a fair trial.
      for (const c of running) {
        if (state.day - c.startDay < 4 || campaignRoi(c) >= pol.minRoi) continue;
        if (mode === 'assisted') { flag(ctx, 'marketing', `mkt:poor:${c.id}`, `${CHANNEL_BY_ID[c.channelId]?.name ?? 'A campaign'} at ${loc.name} returns ${Math.round(campaignRoi(c) * 100)}% — below your minimum.`, 'normal', 'marketing'); continue; }
        if (!spend(ctx)) break;
        c.endDay = state.day;
        bump(state, 'marketing', 'stopped');
      }
      if (running.some((c) => c.endDay > state.day)) return;
      const left = pol.monthlyBudget - state.automation.spent.marketing;
      const channels = pol.channels.filter((id) => CHANNEL_BY_ID[id] && channelAvailable(state, id).ok);
      if (!channels.length || left <= 0) return;
      // Best past return first; a weak marketer picks at random.
      const past = (id: string): number => {
        const own = state.campaigns.filter((c) => c.channelId === id && c.cost > 0);
        return own.length ? own.reduce((s, c) => s + campaignRoi(c), 0) / own.length : 0.5;
      };
      const pick = erred(ctx) ? gameRng.pick(channels) : [...channels].sort((a, b) => past(b) - past(a))[0];
      const def = CHANNEL_BY_ID[pick];
      const cost = def.costPerDay * def.days;
      if (cost > left) return;
      if (mode === 'assisted') { flag(ctx, 'marketing', 'mkt:idea', `No campaign runs at ${loc.name}: ${def.name} fits the budget (${eur(cost)}).`, 'low', 'marketing'); return; }
      if (!spend(ctx)) return;
      const before = state.cash;
      const r = launchCampaign(state, pick, loc.id, 1);
      if (r.ok) {
        const paid = before - state.cash;
        state.automation.spent.marketing += paid;
        bump(state, 'marketing', 'launched');
        bump(state, 'marketing', 'spent', paid);
      }
    },
  },
];

// ----------------------------------------------------------- custom rules --

export function metricValue(state: GameState, loc: Location, metric: RuleMetric, arg?: string): number {
  switch (metric) {
    case 'stock': return stockAt(state, loc);
    case 'cash': return Math.round(state.cash);
    case 'aged': {
      const days = Number(arg) || 60;
      return listedCars(state, loc).filter((v) => v.daysInStock > days).length;
    }
    case 'partsLow': {
      const lifts = lotStats(loc.lot).slots.lift.length;
      if (!lifts) return 0;
      const stock = partsStock(loc);
      return PARTS.filter((p) => (p.id !== 'ev' || canServiceEv(state, loc)) && (stock[p.id] ?? 0) < Math.ceil(p.min * (0.6 + lifts * 0.4))).length;
    }
    case 'waiting': return state.customers.filter((c) => c.locationId === loc.id && c.status === 'waiting').length;
    case 'staff': return state.employees.filter((e) => e.locationId === loc.id && e.role === arg).length;
    default: return 0;
  }
}

export function describeRule(r: CustomRule): string {
  const m = RULE_METRICS[r.metric];
  const a = RULE_ACTIONS[r.action];
  const metric = m.arg === 'days' ? `Cars on sale > ${r.arg ?? 60} days` : m.arg === 'role' ? `${ROLE_BY_ID[r.arg as Role]?.name ?? r.arg}s` : m.name;
  const action = a.param === 'percent' ? `cut prices ${r.param ?? 3}%` : a.param === 'channel' ? `launch ${CHANNEL_BY_ID[r.param ?? '']?.name ?? 'a campaign'}` : a.param === 'role' ? `recruit a ${(ROLE_BY_ID[r.param as Role]?.name ?? 'employee').toLowerCase()}` : a.name.toLowerCase();
  return `IF ${metric} ${r.op} ${r.value.toLocaleString('en-GB')} THEN ${action}`;
}

function runCustomAction(state: GameState, loc: Location, r: CustomRule, seen: Set<string>): boolean {
  const key = `rule:${r.id}:${loc.id}`;
  switch (r.action) {
    case 'reprice': {
      const days = r.metric === 'aged' ? Number(r.arg) || 60 : inventoryPolicy(state, loc.id).repriceDays;
      const pct = clamp(Number(r.param) || 3, 1, 25) / 100;
      let n = 0;
      for (const v of listedCars(state, loc)) if (v.daysInStock > days && !busy(state, v) && cutPrice(state, v, pct)) n += 1;
      if (n) bump(state, 'inventory', 'repriced', n);
      return n > 0;
    }
    case 'startBuying':
    case 'pauseBuying': {
      let n = 0;
      for (const e of buyers(state, loc.id)) {
        let m = mandateFor(state, e.id);
        if (!m) { m = defaultMandate(state, e); state.procurement.mandates.push(m); }
        const on = r.action === 'startBuying';
        if (m.active !== on) { m.active = on; if (on && m.budget - m.spent < 5000) m.budget = m.spent + procurementPolicy(state, loc.id).monthlyBudget / 2; n += 1; }
      }
      return n > 0;
    }
    case 'orderParts': {
      const lifts = lotStats(loc.lot).slots.lift.length;
      if (!lifts) return false;
      const stock = partsStock(loc);
      let n = 0;
      for (const p of PARTS) {
        if (p.id === 'ev' && !canServiceEv(state, loc)) continue;
        const onOrder = (loc.partsOrders ?? []).filter((o) => o.part === p.id).reduce((s, o) => s + o.qty, 0);
        const target = Math.ceil(p.min * (0.6 + lifts * 0.4) * state.automation.policies.parts.targetFactor);
        const qty = target - (stock[p.id] ?? 0) - onOrder;
        if (qty > 0 && orderParts(state, loc.id, p.id, qty).ok) n += 1;
      }
      return n > 0;
    }
    case 'campaign': {
      const ok = launchCampaign(state, r.param ?? 'social', loc.id, 1).ok;
      if (ok) bump(state, 'marketing', 'launched');
      return ok;
    }
    case 'recruit': {
      const role = (r.param as Role) || 'sales';
      if (!ROLE_BY_ID[role]) return false;
      if (headhunterLevel(state) && startSearch(state, role, loc.id, defaultCriteria(role), true).ok) return true;
      const c = state.candidates.filter((x) => x.role === role).sort((a, b) => b.skill - a.skill)[0];
      if (c && hire(state, c.id, loc.id).ok) { bump(state, 'hr', 'recruited'); return true; }
      raise(state, { dept: 'hr', priority: r.priority, text: `Rule "${r.name}": no ${ROLE_BY_ID[role].name.toLowerCase()} could be recruited for ${loc.name}.`, locationId: loc.id, route: 'people', key }, seen);
      return false;
    }
    case 'notify':
      raise(state, { dept: RULE_ACTIONS[r.action].dept, priority: r.priority, text: `${r.name} — ${loc.name}: ${describeRule(r)}`, locationId: loc.id, route: 'management', params: { tab: 'rules' }, key }, seen);
      return true;
    default:
      return false;
  }
}

function runCustomRules(state: GameState, seen: Set<string>): void {
  const rules = [...state.automation.rules].filter((r) => r.enabled).sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  for (const r of rules) {
    if (r.lastDay !== undefined && state.day - r.lastDay < r.cooldown) {
      // A notify rule that still holds keeps its exception.
      for (const x of state.automation.exceptions) if (x.key.startsWith(`rule:${r.id}:`)) seen.add(x.key);
      continue;
    }
    let fired = false;
    for (const loc of state.locations) {
      const v = metricValue(state, loc, r.metric, r.arg);
      const hit = r.op === '<' ? v < r.value : v > r.value;
      if (hit && runCustomAction(state, loc, r, seen)) fired = true;
      if (r.metric === 'cash') break;       // company-wide metric: once
    }
    if (fired) {
      r.lastDay = state.day;
      r.fired = (r.fired ?? 0) + 1;
      bump(state, RULE_ACTIONS[r.action].dept, 'rules');
    }
  }
}

export function addRule(state: GameState, r: Omit<CustomRule, 'id' | 'fired' | 'lastDay'>): { ok: boolean; message: string } {
  if (!RULE_METRICS[r.metric] || !RULE_ACTIONS[r.action]) return { ok: false, message: 'Pick a condition and an action.' };
  if (!Number.isFinite(r.value)) return { ok: false, message: 'Enter a number for the condition.' };
  if (state.automation.rules.length >= 20) return { ok: false, message: 'Twenty rules is the limit — remove one first.' };
  if (RULE_ACTIONS[r.action].param === 'channel' && !CHANNEL_BY_ID[r.param ?? '']) return { ok: false, message: 'Pick a campaign channel.' };
  if (RULE_ACTIONS[r.action].param === 'role' && !ROLE_BY_ID[r.param as Role]) return { ok: false, message: 'Pick a role to recruit.' };
  const rule: CustomRule = { ...r, name: r.name.trim().slice(0, 40) || 'My rule', id: nextId(state, 'ru'), cooldown: clamp(Math.round(r.cooldown), 1, 30), fired: 0 };
  state.automation.rules.push(rule);
  return { ok: true, message: `Rule added: ${describeRule(rule)}.` };
}

export function toggleRule(state: GameState, id: string): { ok: boolean; message: string } {
  const r = state.automation.rules.find((x) => x.id === id);
  if (!r) return { ok: false, message: 'Unknown rule.' };
  r.enabled = !r.enabled;
  return { ok: true, message: `${r.name} is ${r.enabled ? 'on' : 'off'}.` };
}

export function removeRule(state: GameState, id: string): { ok: boolean; message: string } {
  const before = state.automation.rules.length;
  state.automation.rules = state.automation.rules.filter((x) => x.id !== id);
  state.automation.exceptions = state.automation.exceptions.filter((x) => !x.key.startsWith(`rule:${id}:`));
  return { ok: state.automation.rules.length < before, message: 'Rule removed.' };
}

// -------------------------------------------------------------- approvals --

export function approveSale(state: GameState, id: string): { ok: boolean; message: string } {
  const a = state.automation.approvals.find((x) => x.id === id);
  if (!a) return { ok: false, message: 'That deal is gone.' };
  state.automation.approvals = state.automation.approvals.filter((x) => x !== a);
  const v = state.vehicles.find((x) => x.id === a.vehicleId && x.status === 'listed');
  if (!v) return { ok: false, message: 'The car is no longer for sale.' };
  v.reservedBy = undefined;
  v.reservedUntil = undefined;
  const e = state.employees.find((x) => x.id === a.staffId);
  const result = completeSale(state, v, { ...a.customer, status: 'negotiating' }, a.price, {}, { byStaff: true, staffId: e?.id, patienceUsed: 1 });
  payCommission(state, e, result.profit, v.locationId);
  bump(state, 'sales', 'approved');
  bump(state, 'sales', 'sold');
  bump(state, 'sales', 'revenue', a.price);
  bump(state, 'sales', 'profit', result.profit);
  return { ok: true, message: `Approved: ${vehicleName(v)} sold to ${a.customer.name} for ${eur(a.price)} (${result.profit >= 0 ? '+' : ''}${eur(result.profit)}).` };
}

export function declineSale(state: GameState, id: string): { ok: boolean; message: string } {
  const a = state.automation.approvals.find((x) => x.id === id);
  if (!a) return { ok: false, message: 'That deal is gone.' };
  state.automation.approvals = state.automation.approvals.filter((x) => x !== a);
  const v = state.vehicles.find((x) => x.id === a.vehicleId);
  if (v && v.reservedBy === a.customer.id) { v.reservedBy = undefined; v.reservedUntil = undefined; }
  state.lostLeads.unshift({ day: state.day, archetype: a.customer.archetype, reason: 'You declined their offer', wanted: v ? vehicleName(v) : 'a car', locationId: a.locationId });
  if (state.lostLeads.length > 60) state.lostLeads.length = 60;
  bump(state, 'sales', 'declined');
  return { ok: true, message: `Declined — ${a.customer.name} will look elsewhere.` };
}

function expireApprovals(state: GameState): void {
  for (const a of [...state.automation.approvals]) {
    if (state.day < a.expires) continue;
    state.automation.approvals = state.automation.approvals.filter((x) => x !== a);
    const v = state.vehicles.find((x) => x.id === a.vehicleId);
    if (v && v.reservedBy === a.customer.id) { v.reservedBy = undefined; v.reservedUntil = undefined; }
    state.lostLeads.unshift({ day: state.day, archetype: a.customer.archetype, reason: 'Waited too long for your approval', wanted: v ? vehicleName(v) : 'a car', locationId: a.locationId });
    bump(state, 'sales', 'expired');
  }
}

/** Hands a car's price back to the inventory automation. */
export function releasePrice(state: GameState, vehicleId: string): { ok: boolean; message: string } {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v) return { ok: false, message: 'Unknown vehicle.' };
  v.manualPrice = false;
  if (v.status === 'listed' || v.status === 'yard') {
    v.askingPrice = suggestedPrice(state, v);
    v.floorPrice = roundPrice(v.askingPrice * 0.92);
  }
  return { ok: true, message: `Automation prices the ${v.model} again (${eur(v.askingPrice)}).` };
}

// ---------------------------------------------------------------- control --

export function setMode(state: GameState, dept: Dept, mode: AutoMode, locationId?: string): { ok: boolean; message: string } {
  if (!DEPT_BY_ID[dept]) return { ok: false, message: 'Unknown department.' };
  if (locationId) {
    const loc = locationById(state, locationId);
    if (!loc) return { ok: false, message: 'Unknown location.' };
    const l = (state.automation.local[locationId] ??= {});
    l.modes = { ...(l.modes ?? {}), [dept]: mode };
    return { ok: true, message: `${DEPT_BY_ID[dept].name} at ${loc.name}: ${mode}.` };
  }
  state.automation.policies.modes[dept] = mode;
  // A group-wide switch overrides local choices for that department.
  for (const l of Object.values(state.automation.local)) if (l.modes) delete l.modes[dept];
  return { ok: true, message: `${DEPT_BY_ID[dept].name}: ${mode} everywhere.` };
}

/** Everything on or off at once (keeps the policies). */
export function setAllModes(state: GameState, mode: AutoMode): { ok: boolean; message: string } {
  for (const d of DEPARTMENTS) state.automation.policies.modes[d.id] = mode;
  for (const l of Object.values(state.automation.local)) l.modes = {};
  return { ok: true, message: mode === 'manual' ? 'Automation off: you run every department.' : `Every department is now ${mode}.` };
}

export function clearLocalMode(state: GameState, locationId: string, dept: Dept): void {
  const l = state.automation.local[locationId];
  if (l?.modes) delete l.modes[dept];
}

// ------------------------------------------------------------------ ticks --

/** End of day: every rule for every location, highest priority first. */
export function automationDaily(state: GameState): void {
  const seen = new Set<string>();
  expireApprovals(state);
  const ordered = [...RULES].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  for (const loc of state.locations) {
    const budgets = new Map<Dept, { left: number }>();
    const mgrs = new Map<Dept, DeptManager | undefined>();
    for (const rule of ordered) {
      const mode = modeFor(state, loc.id, rule.dept);
      if (mode === 'manual') continue;
      if (!mgrs.has(rule.dept)) mgrs.set(rule.dept, managerFor(state, loc.id, rule.dept));
      const mgr = mgrs.get(rule.dept);
      if (!mgr && rule.needsManager && mode === 'auto') {
        const d = DEPT_BY_ID[rule.dept];
        raise(state, { dept: rule.dept, priority: 'high', text: `${d.name} at ${loc.name} is automated but nobody runs it — hire a ${ROLE_BY_ID[d.roles[0]].name.toLowerCase()}.`, locationId: loc.id, route: 'people', key: `mgr:${rule.dept}:${loc.id}` }, seen);
        continue;
      }
      if (!budgets.has(rule.dept)) budgets.set(rule.dept, { left: mgr?.actions ?? 3 });
      rule.run({ state, loc, mode, mgr, budget: budgets.get(rule.dept)!, seen });
    }
  }
  runCustomRules(state, seen);
  for (const prefix of ['pr:', 'inv:', 'svc:', 'parts:', 'mkt:', 'mgr:', 'rule:']) settle(state, prefix, seen);

  // One notice for the day's automated sales instead of one per car.
  const today = state.automation.reports[0];
  const sales = today?.day === state.day ? today.lines.sales : undefined;
  const autoSold = state.locations.some((l) => modeFor(state, l.id, 'sales') === 'auto') ? sales?.sold ?? 0 : 0;
  if (autoSold > 0) {
    pushNotice(state, 'sale', `🤖 Your team sold ${autoSold} car${autoSold > 1 ? 's' : ''} today: ${eur(sales?.revenue ?? 0)} revenue, ${eur(sales?.profit ?? 0)} gross profit.`, undefined, 'auto');
  }
}

/** Weekly management report. */
export function automationWeekly(state: GameState): void {
  if (!state.locations.some((l) => DEPARTMENTS.some((d) => modeFor(state, l.id, d.id) !== 'manual'))) return;
  const t = reportTotals(state, 7);
  const parts: string[] = [];
  if (t.sales?.sold) parts.push(`${t.sales.sold} sold by the team`);
  if (t.procurement?.bought || t.procurement?.autoBought) parts.push(`${(t.procurement.bought ?? 0) + (t.procurement.autoBought ?? 0)} bought`);
  if (t.inventory?.repriced) parts.push(`${t.inventory.repriced} repriced`);
  if (t.inventory?.cleared) parts.push(`${t.inventory.cleared} cleared`);
  if (t.hr?.trained) parts.push(`${t.hr.trained} trained`);
  if (t.hr?.promoted) parts.push(`${t.hr.promoted} promoted`);
  if (t.hr?.hired || t.hr?.recruited) parts.push(`${(t.hr.hired ?? 0) + (t.hr.recruited ?? 0)} recruited`);
  if (t.logistics?.moves) parts.push(`${t.logistics.moves} fleet moves`);
  const errors = Object.values(t).reduce((s, l) => s + (l?.errors ?? 0), 0);
  const open = state.automation.exceptions.length;
  pushNotice(state, 'info', `📋 Weekly management report: ${parts.length ? parts.join(', ') : 'a quiet week'}.${errors ? ` ${errors} manager mistake${errors > 1 ? 's' : ''}.` : ''}${open ? ` ${open} open exception${open > 1 ? 's' : ''}.` : ''}`, undefined, 'auto');
}

/** Monthly: what automation costs, and the budgets start over. */
export function automationMonthly(state: GameState): void {
  let active = 0;
  for (const loc of state.locations) for (const d of DEPARTMENTS) if (modeFor(state, loc.id, d.id) !== 'manual') active += 1;
  if (active) record(state, 'Automation', -active * DEPT_OVERHEAD, `Automation overhead: ${active} department${active > 1 ? 's' : ''} (tools, admin, oversight)`);
  const lv = state.headhunter.level ? HEADHUNTER_LEVELS[state.headhunter.level - 1] : undefined;
  if (lv) record(state, 'Recruitment', -lv.retainer, `Headhunter retainer: ${lv.name}`);
  state.automation.spent = { training: 0, marketing: 0, procurement: 0 };
}

/** What automation costs a month right now (for the overview). */
export function automationMonthlyCost(state: GameState): { overhead: number; retainer: number; departments: number } {
  let active = 0;
  for (const loc of state.locations) for (const d of DEPARTMENTS) if (modeFor(state, loc.id, d.id) !== 'manual') active += 1;
  const lv = state.headhunter.level ? HEADHUNTER_LEVELS[state.headhunter.level - 1] : undefined;
  return { overhead: active * DEPT_OVERHEAD, retainer: lv?.retainer ?? 0, departments: active };
}
