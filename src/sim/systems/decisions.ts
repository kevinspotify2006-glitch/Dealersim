/**
 * Business decisions. Now and then something happens that needs an answer
 * (a fleet enquiry, a viral post, a rival poaching your best salesperson).
 * Each option has real effects (data/decisions.ts). Ignore it long enough
 * and the fallback option happens by itself.
 */
import type { DecisionState, GameState, Location } from '../types';
import { DECISIONS, DECISION_BY_ID } from '../../data/decisions';
import type { DecisionDef, DecisionEffect } from '../../data/decisions';
import { FLEET_SECTORS } from '../../data/group';
import { BRAND_BY_ID } from '../../data/vehicles';
import { FIRST_NAMES, LAST_NAMES, SOURCE_BY_ID } from '../../data/game';
import { PARTS } from '../../data/service';
import { gameRng } from '../rng';
import { clamp } from '../util';
import { hasTech, locationById, nextId, pushNotice, staffAt } from '../state';
import { lotStats, buyLand, nextLandTier } from '../lot';
import { bookSaleProfit, record } from '../finance';
import { createOffer } from '../vehicles';
import { suggestedPrice, roundPrice } from '../market';
import { giveRaise, promote, canPromote } from '../staff';
import { addRecallJobs, partsPriceMult } from './service';
import { createFleetRequest } from './fleet';
import { sourceUnlocked } from '../trading';
import type { SourceId } from '../types';

/** Can this decision happen now? */
function eligible(state: GameState, def: DecisionDef, loc: Location): boolean {
  if (state.day < def.minDay || state.companyLevel < def.minLevel) return false;
  switch (def.needs) {
    case 'contract': return state.contracts.length > 0;
    case 'employee': return staffAt(state, loc.id).length > 0;
    case 'rival': return state.competitors.some((c) => c.cityId === loc.cityId);
    case 'workshop': return lotStats(loc.lot).slots.lift.length > 0;
    case 'lowSecurity': return (lotStats(loc.lot).effects.security ?? 0) < 2 && !staffAt(state, loc.id).some((e) => e.role === 'security');
    case 'nextLand': return !!nextLandTier(state, loc);
    case 'loans': return state.loans.length > 0;
    case 'fleetResearch': return hasTech(state, 'fleetsales') || state.companyLevel >= 3;
    default: return true;
  }
}

/** Numbers the decision's text and effects refer to. */
function makeData(state: GameState, def: DecisionDef, loc: Location): Record<string, number | string> {
  const d: Record<string, number | string> = {};
  const sector = gameRng.pick(FLEET_SECTORS);
  switch (def.id) {
    case 'fleetorder': {
      d.client = gameRng.pick(sector.clients);
      d.sector = sector.id;
      d.qty = gameRng.int(sector.qty[0], sector.qty[1]);
      d.serviceCost = Number(d.qty) * 45;
      break;
    }
    case 'badreview': d.refund = Math.round(gameRng.range(600, 2400) / 50) * 50; break;
    case 'celebrity': {
      d.name = `${gameRng.pick(FIRST_NAMES)} ${gameRng.pick(LAST_NAMES)}`;
      const car = state.vehicles.filter((v) => v.locationId === loc.id && v.status === 'listed').sort((a, b) => b.askingPrice - a.askingPrice)[0];
      const price = car?.askingPrice ?? 30000;
      d.discount = Math.round(price * 0.1 / 50) * 50;
      d.profit = Math.round(price * 0.05 / 50) * 50;
      break;
    }
    case 'supplierdeal': {
      const sources: SourceId[] = (['wholesale', 'lease', 'fleet', 'network'] as SourceId[]).filter((s) => sourceUnlocked(state, s));
      const src = gameRng.pick(sources.length ? sources : ['wholesale'] as SourceId[]);
      d.sourceId = src;
      d.source = SOURCE_BY_ID[src]?.name ?? 'A supplier';
      d.count = gameRng.int(4, 6);
      d.pct = gameRng.int(8, 14);
      break;
    }
    case 'partsshortage': d.cost = Math.round(PARTS.reduce((s, p) => s + p.cost * 6, 0) * partsPriceMult(state)); break;
    case 'poached': {
      const e = gameRng.pick(staffAt(state, loc.id));
      d.employeeId = e.id;
      d.employee = e.name;
      d.rival = gameRng.pick(state.competitors.filter((c) => c.cityId === loc.cityId))?.name ?? 'A rival dealer';
      break;
    }
    case 'rateoffer': d.fee = Math.round(state.loans.reduce((s, l) => s + l.balance, 0) * 0.006 / 50) * 50 + 500; break;
    case 'target': {
      const c = gameRng.pick(state.contracts);
      d.brandId = c.brandId;
      d.brand = BRAND_BY_ID[c.brandId]?.name ?? 'Your brand';
      break;
    }
    case 'theft': d.damage = Math.round(gameRng.range(4000, 12000) / 100) * 100; break;
    case 'clearance': d.rival = gameRng.pick(state.competitors.filter((c) => c.cityId === loc.cityId))?.name ?? 'A rival'; break;
    case 'recallwork': d.count = gameRng.int(4, 9); break;
    case 'staffparty': {
      const n = staffAt(state, loc.id).length;
      d.cost = 300 + n * 120;
      d.cost2 = n * 150;
      break;
    }
    case 'tvtest': {
      // Honest dealers pass: few undiscovered faults in the cars on sale.
      const listed = state.vehicles.filter((v) => v.locationId === loc.id && v.status === 'listed');
      const hidden = listed.filter((v) => v.issues.some((i) => !i.discovered && !i.fixed && i.severity >= 2)).length;
      d.honesty = listed.length ? 1 - hidden / listed.length : 0.7;
      break;
    }
    default: break;
  }
  return d;
}

export function fillText(text: string, data: Record<string, number | string>): string {
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = data[k];
    return typeof v === 'number' ? v.toLocaleString('en-GB') : v ?? '';
  });
}

/** Daily: maybe a new decision; expired ones fall back to their default. */
export function decisionsDaily(state: GameState): void {
  for (const d of [...state.decisions]) {
    if (d.expires < state.day) {
      const def = DECISION_BY_ID[d.defId];
      if (def) {
        pushNotice(state, 'info', `No answer on "${def.title}" — ${def.options[def.fallback].label.toLowerCase()}.`);
        resolveDecision(state, d.id, def.options[def.fallback].id, true);
      } else state.decisions = state.decisions.filter((x) => x !== d);
    }
  }
  if (state.decisions.length >= 2 || state.day < 10) return;
  if (!gameRng.chance(0.1 + Math.min(0.08, state.locations.length * 0.02))) return;
  const loc = gameRng.pick(state.locations);
  const pool = DECISIONS.filter((def) => eligible(state, def, loc) && !state.decisions.some((x) => x.defId === def.id));
  if (!pool.length) return;
  const total = pool.reduce((s, d) => s + d.weight, 0);
  let roll = gameRng.next() * total;
  let def = pool[0];
  for (const x of pool) { roll -= x.weight; if (roll <= 0) { def = x; break; } }
  const dec: DecisionState = { id: nextId(state, 'dq'), defId: def.id, day: state.day, expires: state.day + (def.id === 'poached' ? 1 : 3), locationId: loc.id, data: makeData(state, def, loc) };
  state.decisions.push(dec);
  pushNotice(state, 'event', `${def.icon} Decision needed: ${fillText(def.text, dec.data)}`, { kind: 'decision', id: dec.id });
}

/** Applies the chosen option. */
export function resolveDecision(state: GameState, decisionId: string, optionId: string, auto = false): { ok: boolean; message: string } {
  const d = state.decisions.find((x) => x.id === decisionId);
  if (!d) return { ok: false, message: 'That has already been decided.' };
  const def = DECISION_BY_ID[d.defId];
  const opt = def?.options.find((o) => o.id === optionId);
  if (!def || !opt) return { ok: false, message: 'Unknown option.' };
  // Can we afford it?
  const cash = opt.effects.filter((e) => e.kind === 'cash').reduce((s, e) => s + amountOf(e as { amount: number | string }, d.data), 0);
  if (!auto && cash < 0 && state.cash < -cash) return { ok: false, message: `That costs €${(-cash).toLocaleString('en-GB')}.` };
  const loc = locationById(state, d.locationId) ?? state.locations[0];
  const notes: string[] = [];
  for (const e of opt.effects) applyEffect(state, e, d, loc, notes);
  if (def.id === 'rateoffer' && opt.id === 'fix') applyRateFix(state);
  state.decisions = state.decisions.filter((x) => x !== d);
  if (!auto) state.stats.decisionsMade = (state.stats.decisionsMade ?? 0) + 1;
  return { ok: true, message: `${def.title}: ${opt.label}.${notes.length ? ` ${notes.join(' ')}` : ''}` };
}

function amountOf(e: { amount: number | string }, data: Record<string, number | string>): number {
  if (typeof e.amount === 'number') return e.amount;
  const neg = e.amount.startsWith('-');
  const v = Number(data[e.amount.replace('-', '')] ?? 0);
  return neg ? -v : v;
}

function applyEffect(state: GameState, e: DecisionEffect, d: DecisionState, loc: Location, notes: string[]): void {
  switch (e.kind) {
    case 'cash': {
      const amount = amountOf(e, d.data);
      if (amount !== 0) record(state, amount > 0 ? 'Extras' : 'Other', amount, `${DECISION_BY_ID[d.defId]?.title}`, loc.id);
      if (amount > 0) bookSaleProfit(state, amount, loc.id);
      break;
    }
    case 'rep':
      state.reputation = clamp(state.reputation + e.amount, 0, 100);
      loc.reputation = clamp(loc.reputation + e.amount * 1.3, 0, 100);
      break;
    case 'boost':
      state.boosts.push({ what: e.what, mult: e.mult, until: state.day + e.days, locationId: e.what === 'parts' ? undefined : loc.id, source: DECISION_BY_ID[d.defId]?.title ?? 'Decision' });
      break;
    case 'morale':
      for (const emp of staffAt(state, loc.id)) {
        emp.morale = clamp(emp.morale + e.amount, 0, 100);
        if (e.stress) emp.stress = clamp((emp.stress ?? 20) + e.stress, 0, 100);
      }
      break;
    case 'fleet': {
      if (gameRng.chance(e.chance)) {
        const r = createFleetRequest(state, loc, String(d.data.sector ?? 'corporate'), { client: String(d.data.client ?? ''), qty: Number(d.data.qty ?? 3), discount: e.discount, repeat: e.repeat, serviceCost: e.serviceCost ? Number(d.data.serviceCost ?? 0) : 0 });
        if (r) {
          r.status = 'accepted';
          notes.push(`${r.client} signed: ${r.qty} cars by ${r.deadline - state.day} days from now. Assign cars in Business → Fleet.`);
        }
      } else notes.push(`${d.data.client ?? 'They'} went to another dealer.`);
      break;
    }
    case 'relation': {
      const c = state.contracts.find((x) => x.brandId === d.data.brandId);
      if (c) c.relation = clamp(c.relation + e.amount, 0, 100);
      break;
    }
    case 'supplier': {
      const src = String(d.data.sourceId ?? 'wholesale');
      state.suppliers[src] = clamp((state.suppliers[src] ?? 50) + e.amount, 0, 100);
      break;
    }
    case 'offers': {
      const src = String(d.data.sourceId ?? 'wholesale') as SourceId;
      const count = e.count || Number(d.data.count ?? 4);
      const disc = e.discount || Number(d.data.pct ?? 10) / 100;
      for (let i = 0; i < count; i += 1) {
        const o = createOffer(state, src, loc.id);
        if (o.auction) continue;
        o.offerPrice = roundPrice(o.offerPrice * (1 - disc));
        o.expiresDay = state.day + 3;
        o.seller = `${o.seller} (special offer)`;
        state.offers.unshift(o);
      }
      notes.push('The offers are in the market now.');
      break;
    }
    case 'parts': {
      if (!loc.parts) loc.parts = {};
      for (const p of PARTS) loc.parts[p.id] = (loc.parts[p.id] ?? 0) + e.qty;
      break;
    }
    case 'employee': {
      const emp = state.employees.find((x) => x.id === d.data.employeeId);
      if (!emp) break;
      if (e.action === 'raise') { giveRaise(state, emp.id); emp.salary = Math.round(emp.salary * 1.065 / 10) * 10; }
      else if (e.action === 'promote') {
        if (canPromote(emp)) promote(state, emp.id);
        else {
          emp.xp = Math.max(emp.xp, (emp.level) * 120);
          promote(state, emp.id);
        }
      } else {
        state.employees = state.employees.filter((x) => x.id !== emp.id);
        notes.push(`${emp.name} has left.`);
      }
      break;
    }
    case 'repriceListed':
      for (const v of state.vehicles) {
        if (v.locationId !== loc.id || v.status !== 'listed') continue;
        v.askingPrice = roundPrice(v.askingPrice * (1 + e.pct));
        if (v.floorPrice > v.askingPrice) v.floorPrice = roundPrice(v.askingPrice * 0.92);
      }
      break;
    case 'serviceJobs':
      addRecallJobs(state, loc, e.count || Number(d.data.count ?? 5));
      break;
    case 'land': {
      const r = buyLand(state, loc, e.discount);
      notes.push(r.message);
      break;
    }
    case 'gamble': {
      // The TV test is decided by how honest your stock is.
      const chance = d.defId === 'tvtest' ? Number(d.data.honesty ?? 0.7) : e.chance;
      const win = gameRng.chance(chance);
      for (const x of win ? e.win : e.lose) applyEffect(state, x, d, loc, notes);
      notes.push(win ? 'It went well.' : 'It did not go well.');
      break;
    }
    default: break;
  }
  void suggestedPrice;
}

/** Fixing loan rates (the rateoffer decision) is applied here so the effect is visible. */
export function applyRateFix(state: GameState): void {
  for (const l of state.loans) l.rate = Math.max(0.02, l.rate - 0.004);
}
