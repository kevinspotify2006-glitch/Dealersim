/**
 * The service department: customers bring their cars in for work.
 *
 * Bookings come from your client list (cars you sold come back), from the
 * town (more with a good reputation, online booking and a service advisor)
 * and from decisions such as recall work. Every lift gives about eight
 * working hours a day, minus the lifts your own stock is using; mechanics and
 * technicians do the hours (faster with skill, a service advisor and the
 * service network). Jobs use parts from stock: no parts, no progress. Done
 * jobs earn labour and parts margin, bring the client back and sometimes a
 * review.
 */
import type { GameState, Location, PartId, ServiceJob, ServiceTypeId } from '../types';
import { PARTS, PART_BY_ID, SERVICE_BY_ID, SERVICE_TYPES } from '../../data/service';
import { CITY_BY_ID, FIRST_NAMES, LAST_NAMES, LOCATION_TYPES } from '../../data/game';
import { MODELS } from '../../data/vehicles';
import { gameRng } from '../rng';
import { clamp } from '../util';
import { boostMult, hasTech, locationById, nextId, pushNotice, staffAt } from '../state';
import { lotStats, objectSpeed } from '../lot';
import { serviceFlowFactor } from '../buildplus';
import { record, bookSaleProfit } from '../finance';
import { clientById, recordService } from './crm';
import { effectiveSkill, hoursFactor } from '../staff';
import { findSlot, planningDayEnd, scheduleJob } from './planning';
import { emit } from '../bus';
import { applyReview } from '../sales';

export const PART_IDS = PARTS.map((p) => p.id);

/** Price multiplier for buying parts (events, express delivery, service network). */
export function partsPriceMult(state: GameState): number {
  let m = boostMult(state, 'parts');
  for (const e of state.events) {
    if (e.defId === 'partsshortage') m *= 1.35;
    if (e.defId === 'importduty') m *= 1.15;
  }
  if ((state.group?.departments.service ?? 0) >= 1) m *= 0.88;
  return m;
}

export function partsStock(loc: Location): Partial<Record<PartId, number>> {
  if (!loc.parts) loc.parts = {};
  return loc.parts;
}

export function partsValue(state: GameState): number {
  let v = 0;
  for (const loc of state.locations) for (const p of PARTS) v += (loc.parts?.[p.id] ?? 0) * p.cost;
  return v;
}

/** Orders parts; they arrive in a day or two. */
export function orderParts(state: GameState, locationId: string, part: PartId, qty: number, express = false): { ok: boolean; message: string } {
  const loc = locationById(state, locationId);
  const def = PART_BY_ID[part];
  if (!loc || !def || qty <= 0) return { ok: false, message: 'Nothing to order.' };
  const unit = Math.round(def.cost * partsPriceMult(state) * (express ? 1.25 : 1));
  const cost = unit * qty;
  if (state.cash < cost) return { ok: false, message: `That order costs €${cost.toLocaleString('en-GB')}.` };
  record(state, 'Parts purchase', -cost, `${qty}× ${def.name}${express ? ' (express)' : ''}`, loc.id);
  const eta = express ? state.day + 1 : state.day + gameRng.int(def.days[0], def.days[1]) + (state.events.some((e) => e.defId === 'partsshortage') ? 2 : 0);
  if (!loc.partsOrders) loc.partsOrders = [];
  loc.partsOrders.push({ part, qty, day: eta, cost });
  return { ok: true, message: `${qty}× ${def.name.toLowerCase()} ordered — arrives ${eta <= state.day + 1 ? 'tomorrow' : `in ${eta - state.day} days`}.` };
}

/** Takes parts from stock if they are all there. */
export function takeParts(loc: Location, parts: Partial<Record<PartId, number>>): boolean {
  const stock = partsStock(loc);
  for (const [k, n] of Object.entries(parts) as [PartId, number][]) if ((stock[k] ?? 0) < n) return false;
  for (const [k, n] of Object.entries(parts) as [PartId, number][]) stock[k] = (stock[k] ?? 0) - n;
  return true;
}

/** Lifts free for customer work today, and the staff hours to use them. */
export function serviceCapacity(state: GameState, loc: Location): { lifts: number; bays: number; hours: number; bayHours: number; staff: number; speed: number } {
  const ls = lotStats(loc.lot);
  const liftsUsed = state.vehicles.filter((v) => v.locationId === loc.id && v.status === 'prep' && ls.slots.lift.some((o) => o.id === v.slotId)).length;
  const baysUsed = state.vehicles.filter((v) => v.locationId === loc.id && v.status === 'prep' && ls.slots.bay.some((o) => o.id === v.slotId)).length;
  const lifts = Math.max(0, ls.slots.lift.length - liftsUsed);
  const bays = Math.max(0, ls.slots.bay.length - baysUsed);
  const techs = staffAt(state, loc.id).filter((e) => (e.role === 'mechanic' || e.role === 'technician') && e.trainingDaysLeft <= 0);
  const detailers = staffAt(state, loc.id).filter((e) => e.role === 'detailer' && e.trainingDaysLeft <= 0);
  const advisor = staffAt(state, loc.id).some((e) => e.role === 'advisor' && e.trainingDaysLeft <= 0);
  let speed = 1;
  if (advisor && techs.length >= 2) speed *= 1.15;                // service advisor + mechanics synergy
  if ((state.group?.departments.service ?? 0) >= 2) speed *= 1.15;
  if (staffAt(state, loc.id).some((e) => e.role === 'manager' && e.focus === 'service' && e.stationId)) speed *= 1.1;  // a service manager
  speed *= boostMult(state, 'service', loc.id);
  speed *= 1 + Math.min(5, ls.effects.service ?? 0) * 0.03 + Math.min(4, ls.effects.workshop ?? 0) * 0.04;
  // Upgraded lifts work faster; a clear route to the workshop helps too.
  const liftSpeed = ls.slots.lift.length ? ls.slots.lift.reduce((s, o) => s + objectSpeed(o), 0) / ls.slots.lift.length : 1;
  speed *= liftSpeed * serviceFlowFactor(loc);
  const staffHours = techs.reduce((s, e) => s + 8 * hoursFactor(e) * (0.6 + effectiveSkill(e) / 180) * (e.role === 'technician' ? 1.15 : 1), 0);
  const hours = Math.min(lifts * 8, staffHours) * speed;
  const bayHours = Math.min(bays * 8, detailers.reduce((s, e) => s + 8 * (0.6 + effectiveSkill(e) / 180), 0)) * speed;
  return { lifts, bays, hours, bayHours, staff: techs.length, speed };
}

/** Can this location take EV work? */
export function canServiceEv(state: GameState, loc: Location): boolean {
  if (hasTech(state, 'evdiag')) return true;
  return staffAt(state, loc.id).some((e) => (e.skills?.ev ?? 0) >= 40 || e.specialization === 'EV systems');
}

function pickType(state: GameState, loc: Location, electric: boolean): ServiceTypeId {
  const ls = lotStats(loc.lot);
  const pool = SERVICE_TYPES.filter((t) => (!t.ev || electric) && (!t.bay || ls.slots.bay.length > 0) && !(electric && (t.id === 'oil')));
  const total = pool.reduce((s, t) => s + t.weight, 0);
  let roll = gameRng.next() * total;
  for (const t of pool) {
    roll -= t.weight;
    if (roll <= 0) return t.id;
  }
  return pool[0].id;
}

/** Creates a booking. */
export function bookJob(state: GameState, loc: Location, opts: { clientId?: string; type?: ServiceTypeId; electric?: boolean; customer?: string; vehicle?: string; recall?: boolean }): ServiceJob | undefined {
  const electric = opts.electric ?? gameRng.chance(0.12 + state.economy.evIncentive * 0.08);
  if (electric && !canServiceEv(state, loc) && opts.type === 'ev') return undefined;
  const type = opts.type ?? pickType(state, loc, electric && canServiceEv(state, loc));
  const def = SERVICE_BY_ID[type];
  const hours = def.hours * (type === 'diagnostics' && hasTech(state, 'techdiag') ? 0.5 : 1) * gameRng.range(0.8, 1.25);
  const model = gameRng.pick(MODELS.filter((m) => (electric ? m.fuels.includes('Electric') : !m.fuels.every((f) => f === 'Electric'))));
  const job: ServiceJob = {
    id: nextId(state, 'sj'),
    locationId: loc.id,
    type,
    customer: opts.customer ?? `${gameRng.pick(FIRST_NAMES)} ${gameRng.pick(LAST_NAMES)}`,
    clientId: opts.clientId,
    vehicle: opts.vehicle ?? `${model.name}`,
    electric,
    hours,
    totalHours: hours,
    labour: Math.round(hours * def.rate * (opts.recall ? 0.9 : 1) / 5) * 5,
    parts: { ...def.parts },
    partsReserved: false,
    status: 'booked',
    bookedDay: state.day,
    dueDay: state.day + (def.hours > 4 ? 3 : 2),
  };
  // Is there room in the plan in the next few days? If not, the customer goes elsewhere.
  if (!opts.recall && !findSlot(state, loc, job)) {
    state.kpi.serviceTurnedAway = (state.kpi.serviceTurnedAway ?? 0) + 1;
    return undefined;
  }
  state.serviceJobs.push(job);
  // Into the planning: the first slot with a free mechanic and lift.
  const a = scheduleJob(state, loc, job);
  reservePartsFor(state, loc, job, a.day);
  if (job.clientId || gameRng.chance(0.25)) emit('fx', { locationId: loc.id, kind: 'appointment', ref: a.id, label: `📅 ${job.customer.split(' ')[0]}` });
  return job;
}

/** Expected new service bookings per day from the town (not counting your clients). */
export function walkInServiceRate(state: GameState, loc: Location): number {
  const ls = lotStats(loc.lot);
  if (ls.slots.lift.length === 0 && ls.slots.bay.length === 0) return 0;
  const city = CITY_BY_ID[loc.cityId];
  const type = LOCATION_TYPES[city?.type ?? 'town'];
  let rate = 0.6 + ls.slots.lift.length * 0.55 + ls.slots.bay.length * 0.25;
  rate *= (0.5 + loc.reputation / 100) * (city?.demand ?? 1) * type.service;
  if (hasTech(state, 'servicebooking')) rate *= 1.3;
  if (staffAt(state, loc.id).some((e) => e.role === 'advisor')) rate *= 1.25;
  if ((state.group?.departments.service ?? 0) >= 1) rate *= 1.2;
  rate *= 1 + Math.min(3, ls.effects.reception ?? 0) * 0.05;
  if ((ls.tiles.v ?? 0) > 0) rate *= 1.15;       // a service reception
  return rate;
}

/** Daily: new bookings, parts deliveries, work, completions. */
export function serviceDaily(state: GameState): void {
  // Today's cars go home or stay for tomorrow; then new bookings go into the plan.
  planningDayEnd(state);
  for (const loc of state.locations) {
    // A new workshop comes with a starter kit of parts (once).
    if (Object.keys(partsStock(loc)).length === 0 && lotStats(loc.lot).slots.lift.length > 0) seedParts(loc);
    // Parts deliveries.
    const stock = partsStock(loc);
    if (loc.partsOrders?.length) {
      for (const o of loc.partsOrders.filter((x) => x.day <= state.day)) stock[o.part] = (stock[o.part] ?? 0) + o.qty;
      loc.partsOrders = loc.partsOrders.filter((x) => x.day > state.day);
    }
    const ls = lotStats(loc.lot);
    const hasWorkshop = ls.slots.lift.length + ls.slots.bay.length > 0;
    // New bookings from the town.
    if (hasWorkshop) {
      const n = poisson(walkInServiceRate(state, loc));
      for (let i = 0; i < n; i += 1) bookJob(state, loc, {});
    }
    // Your clients' cars come back.
    for (const client of state.clients) {
      if (client.locationId !== loc.id || client.lost || !client.nextServiceDay || client.nextServiceDay > state.day) continue;
      client.nextServiceDay = state.day + gameRng.int(60, 120);
      if (!hasWorkshop) continue;
      const chance = clamp(0.35 + (client.satisfaction - 3) * 0.12 + (hasTech(state, 'loyalty') ? 0.15 : 0) + (hasTech(state, 'telematics') ? 0.2 : 0), 0.05, 0.95);
      if (gameRng.chance(chance)) bookJob(state, loc, { clientId: client.id, customer: client.name, vehicle: client.car?.name, electric: client.car?.fuel === 'Electric' });
    }
    autoReorder(state, loc);
  }
  // Keep the list bounded: finished jobs are only kept for a while.
  state.serviceJobs = state.serviceJobs.filter((j) => j.status !== 'done' || j.dueDay >= state.day - 7);
}

export function finishJob(state: GameState, loc: Location, j: ServiceJob, advisorSkill: number, detail = 50): void {
  j.status = 'done';
  const late = state.day > j.dueDay;
  // A good service advisor finds (and sells) extra work.
  if (advisorSkill > 0 && gameRng.chance(0.15 + advisorSkill / 400)) j.upsell = Math.round(gameRng.range(80, 320) / 10) * 10;
  const partsSale = Object.entries(j.parts).reduce((s, [k, n]) => s + (PART_BY_ID[k as PartId]?.price ?? 0) * (n ?? 0), 0);
  const partsCost = Object.entries(j.parts).reduce((s, [k, n]) => s + (PART_BY_ID[k as PartId]?.cost ?? 0) * (n ?? 0), 0);
  const labour = j.labour + (j.upsell ?? 0);
  if (labour > 0) record(state, 'Service', labour, `${SERVICE_BY_ID[j.type].name}: ${j.vehicle} (${j.customer})`, loc.id);
  if (partsSale > 0) record(state, 'Parts', partsSale, `Parts for ${j.vehicle}`, loc.id);
  bookSaleProfit(state, labour + partsSale - partsCost, loc.id);
  state.kpi.serviceRevenue += labour;
  state.kpi.partsRevenue += partsSale;
  state.stats.serviceJobs = (state.stats.serviceJobs ?? 0) + 1;
  // Careful work (attention to detail) means fewer comebacks and happier customers.
  const happy = !late && gameRng.chance(0.62 + loc.reputation / 400 + detail / 500);
  recordService(state, j.clientId, labour + partsSale, labour + partsSale - partsCost, happy);
  if (clientById(state, j.clientId) === undefined && gameRng.chance(0.08)) {
    // A walk-in service customer sometimes becomes a sales lead later.
    loc.reputation = clamp(loc.reputation + 0.05, 0, 100);
  }
  if (gameRng.chance(0.12)) {
    applyReview(state, {
      id: nextId(state, 'r'), day: state.day, stars: happy ? (gameRng.chance(0.5) ? 5 : 4) : late ? 2 : 3, customer: j.customer,
      text: happy ? gameRng.pick(['Car was ready when promised and the bill matched the quote.', 'Friendly service desk, honest advice.', 'Quick and professional workshop.']) : late ? 'The car took days longer than promised.' : 'Service was OK, nothing special.',
      locationId: loc.id, vehicle: j.vehicle,
    });
  }
}

/** With an inventory manager or automated inventory, parts reorder themselves. */
function autoReorder(state: GameState, loc: Location): void {
  const auto = hasTech(state, 'autoinventory') || staffAt(state, loc.id).some((e) => e.role === 'inventory');
  if (!auto) return;
  const stock = partsStock(loc);
  const lifts = lotStats(loc.lot).slots.lift.length;
  if (lifts === 0) return;
  for (const p of PARTS) {
    if (p.id === 'ev' && !canServiceEv(state, loc)) continue;
    const onOrder = (loc.partsOrders ?? []).filter((o) => o.part === p.id).reduce((s, o) => s + o.qty, 0);
    const want = Math.ceil(p.min * (0.6 + lifts * 0.4));
    if ((stock[p.id] ?? 0) + onOrder < want) {
      const qty = want * 2 - (stock[p.id] ?? 0) - onOrder;
      const cost = Math.round(p.cost * partsPriceMult(state)) * qty;
      if (state.cash > cost + 5000) orderParts(state, loc.id, p.id, qty);
    }
  }
}

/**
 * Parts for a booked job: taken from the shelf now if they are there, otherwise
 * ordered so they arrive in time (a parts manager would do the same).
 */
export function reservePartsFor(state: GameState, loc: Location, job: ServiceJob, day: number): void {
  if (job.partsReserved) return;
  if (takeParts(loc, job.parts)) { job.partsReserved = true; return; }
  const stock = partsStock(loc);
  for (const [k, n] of Object.entries(job.parts) as [PartId, number][]) {
    // Order the full amount for this job: what is on the shelf is spoken for by earlier bookings.
    const short = (stock[k] ?? 0) >= (n ?? 0) * 2 ? 0 : (n ?? 0);
    if (short > 0) {
      const def = PART_BY_ID[k];
      const express = day - state.day <= def.days[0];
      orderParts(state, loc.id, k, short, express);
    }
  }
}

/** Starter stock for a workshop. */
export function seedParts(loc: Location): void {
  const stock = partsStock(loc);
  for (const p of PARTS) if (stock[p.id] === undefined) stock[p.id] = p.id === 'ev' || p.id === 'body' ? 1 : Math.ceil(p.min / 2);
}

/** Recall work from a decision: paid jobs spread over the next days. */
export function addRecallJobs(state: GameState, loc: Location, count: number): number {
  let n = 0;
  for (let i = 0; i < count; i += 1) {
    const j = bookJob(state, loc, { type: 'repair', recall: true, customer: 'Manufacturer recall' });
    if (j) {
      j.parts = { other: 1 };
      j.dueDay = state.day + 3 + Math.floor(i / 2);
      n += 1;
    }
  }
  if (n) pushNotice(state, 'info', `${n} recall jobs booked into the workshop at ${loc.name}.`);
  return n;
}

function poisson(mean: number): number {
  if (mean <= 0) return 0;
  const l = Math.exp(-Math.min(mean, 30));
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= gameRng.next();
  } while (p > l && k < 60);
  return k - 1;
}

export function openJobs(state: GameState, locationId: string): ServiceJob[] {
  return state.serviceJobs.filter((j) => j.locationId === locationId && j.status !== 'done');
}
