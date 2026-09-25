/**
 * Procurement: vehicle buyers buy stock for you.
 *
 * You give a buyer a mandate — a budget and what to look for (brands, segment,
 * fuel, gearbox, years, mileage, maximum price, minimum margin, risk). Every
 * working day the buyer looks at cars from the sources your risk appetite
 * allows, values each one with their appraisal skill (good buyers are close,
 * poor ones are optimistic), checks it for faults (good buyers find hidden
 * damage, poor ones miss it), haggles with their negotiation and buying
 * skills, and proposes the deals that clear your margin. You approve, decline
 * or ask them to push the price. Approved cars go straight into "Arriving".
 *
 * When a car a buyer found is sold, its real margin is booked against that
 * buyer, so you can see what each buyer earns you against what they cost.
 */
import type { BuyMandate, BuyProposal, Category, Employee, FuelType, GameState, RiskAppetite, SourceId, Vehicle } from '../types';
import { SOURCE_BY_ID } from '../../data/game';
import { MANUFACTURERS } from '../../data/vehicles';
import { gameRng } from '../rng';
import { clamp } from '../util';
import { freeSpaces, locationById, nextId, pushNotice, staffAt, vehicleName, hasTech } from '../state';
import { createOffer } from '../vehicles';
import { roundPrice, trueValue } from '../market';
import { buyOffer, sourceUnlocked } from '../trading';
import { addWork, effectiveSkill, skillOf, synergyActive } from '../staff';
import { yearOf } from '../format';
import { emit } from '../bus';

/** Sources a buyer uses per risk appetite. */
export const RISK_SOURCES: Record<RiskAppetite, SourceId[]> = {
  low: ['wholesale', 'lease', 'fleet', 'network', 'manufacturer'],
  medium: ['wholesale', 'lease', 'fleet', 'network', 'private', 'importer'],
  high: ['wholesale', 'private', 'importer', 'auction', 'liquidation', 'special'],
};
export const RISK_NAMES: Record<RiskAppetite, string> = { low: 'Low — clean, documented cars', medium: 'Medium — private sellers and imports too', high: 'High — auctions and liquidations, bigger bargains' };

export const PROPOSAL_DAYS = 2;

export function buyers(state: GameState, locationId?: string): Employee[] {
  return state.employees.filter((e) => (e.role === 'buyer' || e.role === 'procurement') && (!locationId || e.locationId === locationId));
}

export function mandateFor(state: GameState, buyerId: string): BuyMandate | undefined {
  return state.procurement.mandates.find((m) => m.buyerId === buyerId);
}

/** A sensible first mandate for a buyer. */
export function defaultMandate(state: GameState, e: Employee): BuyMandate {
  const year = yearOf(state.day);
  return {
    id: nextId(state, 'bm'), buyerId: e.id, locationId: e.locationId, active: false,
    budget: Math.max(20000, Math.round(state.cash * 0.4 / 5000) * 5000), spent: 0,
    brands: [], categories: [], fuels: [], transmission: undefined,
    yearMin: year - 8, yearMax: year, kmMax: 150000, maxPrice: 20000, minMargin: 1500,
    risk: 'medium', autoApprove: false, searchDays: 0,
  };
}

export function saveMandate(state: GameState, m: BuyMandate): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === m.buyerId);
  if (!e) return { ok: false, message: 'That buyer has left.' };
  if (m.yearMin > m.yearMax) return { ok: false, message: 'The oldest year must be before the newest.' };
  if (m.maxPrice < 1000) return { ok: false, message: 'Set a maximum price of at least €1,000.' };
  m.locationId = e.locationId;
  const i = state.procurement.mandates.findIndex((x) => x.buyerId === m.buyerId);
  if (i >= 0) state.procurement.mandates[i] = m; else state.procurement.mandates.push(m);
  return { ok: true, message: m.active ? `${e.name} is searching: up to ${fmt(m.maxPrice)} a car, at least ${fmt(m.minMargin)} margin, budget ${fmt(m.budget - m.spent)} left.` : `${e.name}'s brief is saved (paused).` };
}

export function topUpBudget(state: GameState, buyerId: string, amount: number): { ok: boolean; message: string } {
  const m = mandateFor(state, buyerId);
  if (!m) return { ok: false, message: 'Give this buyer a brief first.' };
  m.budget += amount;
  return { ok: true, message: `Budget raised to ${fmt(m.budget)} (${fmt(m.budget - m.spent)} left).` };
}

const fmt = (n: number): string => `€${Math.round(n).toLocaleString('en-GB')}`;

/** How good this buyer is, all things considered (0..100). */
export function buyerScore(state: GameState, e: Employee): { buying: number; appraisal: number; negotiation: number; detail: number } {
  const lead = staffAt(state, e.locationId).find((x) => x.role === 'procurement' && x.id !== e.id && x.stationId);
  const desk = synergyActive(state, e.locationId, 'buyingdesk') ? 6 : 0;
  const lift = lead ? Math.round(skillOf(lead, 'management') / 12) : 0;
  const mood = effectiveSkill(e) / Math.max(1, e.skill);   // morale, stress, absence, workstation
  const f = (v: number): number => clamp(v * mood + lift + desk, 0, 100);
  return { buying: f(skillOf(e, 'buying')), appraisal: f(skillOf(e, 'appraisal')), negotiation: f(skillOf(e, 'negotiation')), detail: f(skillOf(e, 'detail')) };
}

function matches(m: BuyMandate, v: Vehicle, price: number): boolean {
  if (m.brands.length && !m.brands.includes(v.brandId)) return false;
  if (m.categories.length && !m.categories.includes(v.category as Category)) return false;
  if (m.fuels.length && !m.fuels.includes(v.fuel as FuelType)) return false;
  if (m.transmission && v.transmission !== m.transmission) return false;
  if (v.year < m.yearMin || v.year > m.yearMax) return false;
  if (v.mileage > m.kmMax) return false;
  if (price > m.maxPrice) return false;
  return true;
}

/** Looks at one car the way this buyer would. */
function appraise(state: GameState, e: Employee, m: BuyMandate, v: Vehicle): Omit<BuyProposal, 'id' | 'day' | 'expires' | 'rounds'> | null {
  const sk = buyerScore(state, e);
  const asking = v.auction ? v.auction.reserve : v.offerPrice;
  // Haggling: better buyers take more off; weak ones sometimes pay over the odds.
  const room = 0.015 + sk.negotiation / 100 * 0.07 + sk.buying / 100 * 0.02;
  let price = roundPrice(asking * (1 - gameRng.range(0.2, 1) * room));
  if (sk.negotiation < 40 && gameRng.chance(0.3)) price = roundPrice(asking * gameRng.range(1.0, 1.04));
  if (!matches(m, v, price)) return null;
  // Fault finding: hidden faults are found with appraisal and attention to detail.
  const notes: string[] = [];
  let knownRepairs = 0;
  let worst = 0;
  for (const i of v.issues) {
    if (i.fixed) continue;
    const find = i.discovered || gameRng.chance(clamp(0.15 + sk.appraisal / 140 + sk.detail / 400, 0, 0.95));
    if (find) {
      knownRepairs += i.repairCost;
      worst = Math.max(worst, i.severity);
      if (!i.discovered) notes.push(`Found: ${i.name.toLowerCase()} (~${fmt(i.repairCost)})`);
    }
  }
  const risk: RiskAppetite = worst >= 3 ? 'high' : worst >= 2 ? 'medium' : 'low';
  if (m.risk === 'low' && risk !== 'low') return null;
  if (m.risk === 'medium' && risk === 'high') return null;
  // Valuation: close for a good buyer; a poor one is off and often optimistic.
  const potential = trueValue(state, v) * 0.99 + knownRepairs * 0.6;   // value once the known faults are fixed
  const spread = (100 - sk.appraisal) / 100 * 0.14;
  const optimism = Math.max(0, 55 - sk.appraisal) / 1000;
  const estRetail = roundPrice(potential * (1 + gameRng.range(-spread, spread) + optimism));
  const transport = (SOURCE_BY_ID[v.source as SourceId]?.transport[1] ?? 300);
  const estPrep = Math.round((knownRepairs + 250 + transport) / 10) * 10;
  const estMargin = estRetail - price - estPrep;
  if (estMargin < m.minMargin) return null;
  if (v.history.includes('Service book present')) notes.push('Full service history');
  if (v.source === 'auction' || v.source === 'liquidation') notes.push('Bought at auction: sold as seen');
  if (!notes.length) notes.push(risk === 'low' ? 'Nothing found — looks clean' : 'Checked it over');
  return { mandateId: m.id, buyerId: e.id, locationId: m.locationId, vehicle: v, asking, price, estRetail, estPrep, estMargin, risk, notes };
}

/** One buyer's working day. */
function searchDay(state: GameState, e: Employee, m: BuyMandate): void {
  const loc = locationById(state, m.locationId);
  if (!loc) return;
  const left = m.budget - m.spent;
  const pending = state.procurement.proposals.filter((p) => p.buyerId === e.id).length;
  if (left < 1000 || pending >= 4) { e.task = left < 1000 ? 'Budget used up — waiting for more' : 'Waiting for your answer on their deals'; return; }
  if (freeSpaces(state, loc.id) - pending <= 0) { e.task = 'No free spaces for more cars'; return; }
  const sk = buyerScore(state, e);
  m.searchDays += 1;
  // How much ground they cover in a day.
  const looks = Math.round(3 + sk.buying / 14 + (hasTech(state, 'predictive') ? 2 : 0));
  const sources = RISK_SOURCES[m.risk].filter((id) => sourceUnlocked(state, id) && (id !== 'manufacturer' || state.contracts.length > 0));
  const found: NonNullable<ReturnType<typeof appraise>>[] = [];
  for (let i = 0; i < looks && sources.length; i += 1) {
    const src = gameRng.pick(sources);
    const brand = m.brands.length ? gameRng.pick(m.brands) : undefined;
    let v: Vehicle;
    try { v = createOffer(state, src, loc.id, brand); } catch { continue; }
    if (v.source === 'manufacturer' && !state.contracts.some((c) => c.brandId === v.brandId)) continue;
    const a = appraise(state, e, m, v);
    if (a && a.price <= left) found.push(a);
  }
  addWork(state, e.id, 1 + found.length);
  if (!found.length) { e.task = `Searching: ${m.brands.length ? m.brands.length + ' brand(s)' : 'any brand'}, up to ${fmt(m.maxPrice)}`; return; }
  // They bring you their best one or two.
  found.sort((a, b) => b.estMargin / b.price - a.estMargin / a.price);
  const take = found.slice(0, sk.buying >= 60 ? 2 : 1);
  for (const f of take) {
    const p: BuyProposal = { ...f, id: nextId(state, 'bp'), day: state.day, expires: state.day + PROPOSAL_DAYS, rounds: 0 };
    p.vehicle.auction = undefined;
    // Auto-approve: comfortably inside the brief.
    if (m.autoApprove && p.estMargin >= m.minMargin * 1.3 && p.risk !== 'high') {
      state.procurement.proposals.push(p);
      const r = approveProposal(state, p.id, true);
      if (r.ok) continue;
    } else {
      state.procurement.proposals.push(p);
      pushNotice(state, 'good', `🔎 ${e.name.split(' ')[0]} found ${vehicleName(p.vehicle)}: ${fmt(p.price)}, expected margin ${fmt(p.estMargin)}.`, { kind: 'proposal', id: p.id });
    }
  }
  e.task = `Found ${take.length} deal${take.length > 1 ? 's' : ''} — waiting for you`;
}

/** Daily: buyers search; unanswered proposals lapse (the seller sells to someone else). */
export function procurementDaily(state: GameState): void {
  const pr = state.procurement;
  for (const p of [...pr.proposals]) {
    if (p.expires < state.day) {
      pr.proposals = pr.proposals.filter((x) => x !== p);
      pr.log.unshift({ day: state.day, buyerId: p.buyerId, kind: 'missed', amount: p.estMargin, vehicle: vehicleName(p.vehicle) });
    }
  }
  for (const m of pr.mandates) {
    const e = state.employees.find((x) => x.id === m.buyerId);
    if (!e) { m.active = false; continue; }
    if (!m.active) { e.task = 'No active brief'; continue; }
    if (e.trainingDaysLeft > 0) { e.task = 'On a course'; continue; }
    if (e.absentDay === state.day) { e.task = 'Off sick today'; continue; }
    searchDay(state, e, m);
  }
  pr.mandates = pr.mandates.filter((m) => state.employees.some((e) => e.id === m.buyerId));
  if (pr.log.length > 300) pr.log.length = 300;
}

export function approveProposal(state: GameState, id: string, auto = false): { ok: boolean; message: string } {
  const pr = state.procurement;
  const p = pr.proposals.find((x) => x.id === id);
  if (!p) return { ok: false, message: 'That deal is gone.' };
  const m = pr.mandates.find((x) => x.id === p.mandateId);
  const e = state.employees.find((x) => x.id === p.buyerId);
  const v = p.vehicle;
  v.offerPrice = p.price;
  v.auction = undefined;
  v.expiresDay = state.day + 1;
  state.offers.push(v);
  const r = buyOffer(state, v.id, p.locationId, p.price);
  if (!r.ok) {
    state.offers = state.offers.filter((x) => x.id !== v.id);
    return r;
  }
  v.boughtBy = p.buyerId;
  v.buyerEstimate = p.estMargin;
  // What the buyer found is known now.
  for (const i of v.issues) if (!i.fixed && p.notes.some((n) => n.toLowerCase().includes(i.name.toLowerCase()))) i.discovered = true;
  pr.proposals = pr.proposals.filter((x) => x !== p);
  if (m) m.spent += p.price;
  if (e) {
    const b = e.bought ?? { count: 0, spent: 0, margin: 0, realised: 0, month: 0 };
    b.count += 1; b.spent += p.price; b.margin += p.estMargin;
    e.bought = b;
    e.xp += 6;
  }
  pr.log.unshift({ day: state.day, buyerId: p.buyerId, kind: 'bought', amount: p.price, vehicle: vehicleName(v) });
  emit('fx', { locationId: p.locationId, kind: 'bought', ref: v.id, label: `👤 → 🚗 ${v.model} bought` });
  if (auto) pushNotice(state, 'good', `🚗 ${e?.name.split(' ')[0] ?? 'Your buyer'} bought ${vehicleName(v)} for ${fmt(p.price)} (expected margin ${fmt(p.estMargin)}). It is on its way.`);
  return { ok: true, message: `${vehicleName(v)} bought for ${fmt(p.price)} — it is on its way (Inventory → Arriving).` };
}

export function declineProposal(state: GameState, id: string): { ok: boolean; message: string } {
  const pr = state.procurement;
  const p = pr.proposals.find((x) => x.id === id);
  if (!p) return { ok: false, message: 'That deal is gone.' };
  pr.proposals = pr.proposals.filter((x) => x !== p);
  return { ok: true, message: `Passed on the ${vehicleName(p.vehicle)}.` };
}

/** Ask the buyer to go back to the seller for a better price. */
export function pushProposal(state: GameState, id: string): { ok: boolean; message: string } {
  const p = state.procurement.proposals.find((x) => x.id === id);
  if (!p) return { ok: false, message: 'That deal is gone.' };
  if (p.rounds >= 2) return { ok: false, message: 'The seller will not move any further.' };
  const e = state.employees.find((x) => x.id === p.buyerId);
  const sk = e ? buyerScore(state, e) : { negotiation: 30, buying: 30, appraisal: 30, detail: 30 };
  p.rounds += 1;
  if (gameRng.chance(0.3 + sk.negotiation / 250)) {
    const cut = roundPrice(p.price * gameRng.range(0.02, 0.05));
    p.price -= cut;
    p.estMargin += cut;
    return { ok: true, message: `${e?.name.split(' ')[0] ?? 'Your buyer'} got another ${fmt(cut)} off: now ${fmt(p.price)}.` };
  }
  if (gameRng.chance(0.28 - sk.negotiation / 500)) {
    state.procurement.proposals = state.procurement.proposals.filter((x) => x !== p);
    return { ok: false, message: `The seller was offended and sold the ${vehicleName(p.vehicle)} to someone else.` };
  }
  return { ok: false, message: 'The seller would not move. The deal still stands at the same price.' };
}

/** When a car a buyer found is sold, the real margin goes on their record. */
export function creditBuyer(state: GameState, v: Vehicle, profit: number): void {
  if (!v.boughtBy) return;
  const e = state.employees.find((x) => x.id === v.boughtBy);
  state.procurement.log.unshift({ day: state.day, buyerId: v.boughtBy, kind: 'sold', amount: Math.round(profit), vehicle: vehicleName(v) });
  if (e) {
    const b = e.bought ?? { count: 0, spent: 0, margin: 0, realised: 0, month: 0 };
    b.realised += Math.round(profit);
    b.month += Math.round(profit);
    e.bought = b;
    addWork(state, e.id, 1);
  }
}

/** Monthly: reset the "this month" figure. */
export function procurementMonthly(state: GameState): void {
  for (const e of state.employees) if (e.bought) e.bought.month = 0;
}

/** A buyer's last 30 days: cars bought, money spent, margin realised on sold cars, deals missed. */
export function buyerStats(state: GameState, buyerId: string, days = 30): { bought: number; spent: number; realised: number; sold: number; missed: number; estimate: number } {
  const since = state.day - days;
  const log = state.procurement.log.filter((l) => l.buyerId === buyerId && l.day > since);
  const boughtCars = state.vehicles.filter((v) => v.boughtBy === buyerId && v.boughtDay > since);
  return {
    bought: log.filter((l) => l.kind === 'bought').length,
    spent: log.filter((l) => l.kind === 'bought').reduce((s, l) => s + l.amount, 0),
    realised: log.filter((l) => l.kind === 'sold').reduce((s, l) => s + l.amount, 0),
    sold: log.filter((l) => l.kind === 'sold').length,
    missed: log.filter((l) => l.kind === 'missed').length,
    estimate: boughtCars.reduce((s, v) => s + (v.buyerEstimate ?? 0), 0),
  };
}

export const ALL_BRANDS = (): { id: string; name: string }[] => MANUFACTURERS.map((b) => ({ id: b.id, name: b.name }));
