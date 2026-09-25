/**
 * Planning: every service job, sales visit, test drive and handover is an
 * appointment in a day plan (08:00–18:00 with a lunch hour).
 *
 * Service work now happens hour by hour at its appointment: the customer
 * arrives at reception, the car waits, goes onto a free lift when its mechanic
 * starts, is checked and parked outside ready for collection. Each mechanic can
 * do one job at a time; a job needs parts on the shelf and a free lift. When
 * two jobs need the same person at the same time, someone is off sick, or
 * there are more jobs than lifts, the plan shows a conflict you can fix by
 * dragging, reassigning or letting the planner sort it out.
 */
import type { Appointment, Employee, GameState, Location, ServiceJob } from '../types';
import { SERVICE_BY_ID } from '../../data/service';
import { clamp } from '../util';
import { locationById, nextId, pushNotice, staffAt } from '../state';
import { lotStats, objectSpeed } from '../lot';
import { serviceFlowFactor } from '../buildplus';
import { effectiveSkill, hoursFactor, addWork, skillOf } from '../staff';
import { emit } from '../bus';
import { canServiceEv, finishJob, reservePartsFor, takeParts } from './service';
import { gameRng } from '../rng';

export const DAY_START = 8;
export const DAY_END = 18;
export const LUNCH = 12;

/** When an appointment really ends (work stops for lunch). */
export function endOf(a: Pick<Appointment, 'start' | 'duration'>): number {
  const end = a.start + a.duration;
  return a.start < LUNCH + 1 && end > LUNCH && a.start < LUNCH ? end + 1 : end;
}

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - 1e-6 && b0 < a1 - 1e-6;
}

/** Who can do this job. */
export function eligibleStaff(state: GameState, loc: Location, job: ServiceJob): Employee[] {
  const def = SERVICE_BY_ID[job.type];
  const team = staffAt(state, loc.id);
  if (def.bay) return team.filter((e) => e.role === 'detailer' || e.role === 'prep');
  const techs = team.filter((e) => e.role === 'mechanic' || e.role === 'technician');
  if (def.ev || job.electric) return techs.filter((e) => e.role === 'technician' || skillOf(e, 'ev') >= 40 || canServiceEv(state, loc));
  return techs;
}

/** Hours of work per clock hour for this person. */
export function workRate(e: Employee | undefined): number {
  if (!e) return 0;
  const base = (0.6 + effectiveSkill(e) / 180) * (e.role === 'technician' ? 1.15 : 1);
  return clamp(base * (0.75 + hoursFactor(e) * 0.25), 0.3, 1.6);
}

function dayAppointments(state: GameState, locationId: string, day: number): Appointment[] {
  return state.appointments.filter((a) => a.locationId === locationId && a.day === day && a.status !== 'cancelled' && a.status !== 'missed');
}

function staffFree(state: GameState, staffId: string, day: number, start: number, end: number, ignore?: string): boolean {
  return !state.appointments.some((a) => a.id !== ignore && a.staffId === staffId && a.day === day && a.status !== 'cancelled' && a.status !== 'missed' && a.status !== 'done' && overlaps(start, end, a.start, endOf(a)));
}

function liftsFree(state: GameState, loc: Location, day: number, start: number, end: number, bay: boolean, ignore?: string): boolean {
  const ls = lotStats(loc.lot);
  const cap = bay ? ls.slots.bay.length : ls.slots.lift.length;
  const busy = dayAppointments(state, loc.id, day).filter((a) => a.id !== ignore && a.kind === 'service' && a.status !== 'done' && overlaps(start, end, a.start, endOf(a)) && !!SERVICE_BY_ID[state.serviceJobs.find((j) => j.id === a.jobId)?.type ?? 'oil']?.bay === bay).length;
  return busy < cap;
}

/** Finds the first free slot within the horizon, or nothing (the customer goes elsewhere). */
export function findSlot(state: GameState, loc: Location, job: ServiceJob, fromDay = state.day, fromHour = state.hour, horizon = 5): { day: number; start: number; staffId: string; duration: number } | undefined {
  const staff = eligibleStaff(state, loc, job).sort((a, b) => effectiveSkill(b) - effectiveSkill(a));
  const bay = !!SERVICE_BY_ID[job.type].bay;
  for (let d = fromDay; d < fromDay + horizon; d += 1) {
    const first = d === state.day ? Math.max(DAY_START, Math.ceil((fromHour + 1) * 2) / 2) : DAY_START;
    for (let start = first; start < DAY_END - 0.5; start += 0.5) {
      if (start >= LUNCH && start < LUNCH + 1) continue;
      for (const e of staff) {
        if (e.absentDay === d || e.trainingDaysLeft > d - state.day) continue;
        const duration = Math.min(8, Math.max(0.5, Math.ceil((job.hours / workRate(e)) * 2) / 2));
        const end = endOf({ start, duration });
        if (end > DAY_END + 0.01) continue;
        if (!staffFree(state, e.id, d, start, end)) continue;
        if (!liftsFree(state, loc, d, start, end, bay)) continue;
        return { day: d, start, staffId: e.id, duration };
      }
    }
  }
  return undefined;
}

/** Finds the first free slot and books it (an unassigned slot tomorrow if the plan is full). */
export function scheduleJob(state: GameState, loc: Location, job: ServiceJob, fromDay = state.day, fromHour = state.hour): Appointment {
  const slot = findSlot(state, loc, job, fromDay, fromHour, 7);
  const best = slot ? { day: slot.day, start: slot.start, duration: slot.duration, e: state.employees.find((x) => x.id === slot.staffId) } : undefined;
  const def = SERVICE_BY_ID[job.type];
  const a: Appointment = {
    id: nextId(state, 'ap'), kind: 'service', locationId: loc.id,
    day: best?.day ?? fromDay + 1, start: best?.start ?? 9, duration: best?.duration ?? Math.min(8, Math.ceil(job.hours * 2) / 2),
    staffId: best?.e?.id, jobId: job.id, clientId: job.clientId, customer: job.customer, vehicle: job.vehicle,
    title: `${def.icon} ${def.name}`, revenue: job.labour, status: 'planned',
  };
  job.apptId = a.id;
  job.staffId = a.staffId;
  job.stage = job.stage && job.stage !== 'expected' && job.stage !== 'collected' ? 'waiting' : 'expected';
  job.dueDay = Math.max(job.dueDay, a.day + (a.duration > 5 ? 1 : 0));
  state.appointments.push(a);
  return a;
}

/** A plain appointment (sales visit, handover, test drive). */
export function addAppointment(state: GameState, a: Omit<Appointment, 'id' | 'status'> & { status?: Appointment['status'] }): Appointment {
  const full: Appointment = { status: 'planned', ...a, id: nextId(state, 'ap') };
  state.appointments.push(full);
  return full;
}

/** The best free person of a role for a slot (for sales visits and handovers). */
export function freePerson(state: GameState, locationId: string, roles: Employee['role'][], day: number, start: number, duration: number): Employee | undefined {
  return staffAt(state, locationId).filter((e) => roles.includes(e.role) && e.absentDay !== day && staffFree(state, e.id, day, start, start + duration))
    .sort((a, b) => effectiveSkill(b) - effectiveSkill(a))[0];
}

// ------------------------------------------------------------ the day, hour by hour --

function freeLift(state: GameState, loc: Location, job: ServiceJob): string | undefined {
  const ls = lotStats(loc.lot);
  const slots = SERVICE_BY_ID[job.type].bay ? ls.slots.bay : ls.slots.lift;
  const taken = new Set<string>();
  for (const v of state.vehicles) if (v.locationId === loc.id && v.slotId) taken.add(v.slotId);
  for (const j of state.serviceJobs) if (j !== job && j.liftId && j.locationId === loc.id && (j.stage === 'lift' || j.stage === 'check')) taken.add(j.liftId);
  return slots.find((o) => !taken.has(o.id))?.id;
}

/** Runs the hour [hour, hour+1) of today's plan. */
export function planningHour(state: GameState): void {
  const h = state.hour;
  for (const a of state.appointments) {
    if (a.day !== state.day || a.status === 'done' || a.status === 'cancelled' || a.status === 'missed') continue;
    const loc = locationById(state, a.locationId);
    if (!loc) continue;
    const end = endOf(a);
    if (a.kind !== 'service') {
      if (a.status === 'planned' && h + 1 > a.start) { a.status = 'active'; emit('fx', { locationId: a.locationId, kind: 'appointment', ref: a.id, label: `📅 ${a.customer}` }); }
      if (h + 1 >= end) a.status = 'done';
      const e = a.staffId ? state.employees.find((x) => x.id === a.staffId) : undefined;
      if (e && a.status === 'active') e.task = `${a.title}: ${a.customer}`;
      continue;
    }
    const job = state.serviceJobs.find((j) => j.id === a.jobId);
    if (!job || job.status === 'done') { a.status = 'done'; continue; }
    // The customer drops the car off a little before the slot.
    if (a.status === 'planned' && h + 1 > a.start - 0.5) {
      a.status = 'arrived';
      if (job.stage === 'expected' || !job.stage) job.stage = 'reception';
      emit('fx', { locationId: loc.id, kind: 'arrived', ref: job.id, label: `📋 ${job.vehicle}` });
    }
    if (h < a.start - 0.01 || h >= end || (h >= LUNCH && h < LUNCH + 1 && a.start < LUNCH)) {
      if (job.stage === 'reception' && h >= a.start - 0.5) job.stage = 'waiting';
      continue;
    }
    const e = a.staffId ? state.employees.find((x) => x.id === a.staffId && x.locationId === loc.id) : undefined;
    if (!e || e.absentDay === state.day || e.trainingDaysLeft > 0) { job.stage = 'waiting'; a.note = e ? `${e.name.split(' ')[0]} is not in today` : 'Nobody assigned'; continue; }
    if (!job.partsReserved) {
      if (!takeParts(loc, job.parts)) { job.status = 'parts'; job.stage = 'waiting'; a.note = 'Waiting for parts'; continue; }
      job.partsReserved = true;
    }
    if (!job.liftId) {
      const lift = freeLift(state, loc, job);
      if (!lift) { job.stage = 'waiting'; a.note = 'No free lift'; continue; }
      job.liftId = lift;
      emit('fx', { locationId: loc.id, kind: 'service-start', ref: job.id, label: `🔧 ${job.vehicle}` });
    }
    a.status = 'active';
    a.note = undefined;
    job.status = 'working';
    job.stage = 'lift';
    job.staffId = e.id;
    e.task = `🔧 ${job.vehicle} — ${SERVICE_BY_ID[job.type].name.toLowerCase()}`;
    // Service manager and synergies are in the rate via effectiveSkill; the lift layout helps too.
    const fx = lotStats(loc.lot).effects;
    const liftObj = loc.lot.objects.find((o) => o.id === job.liftId);
    const rate = workRate(e) * (1 + Math.min(4, fx.workshop ?? 0) * 0.03 + Math.min(5, fx.service ?? 0) * 0.02) * objectSpeed(liftObj) * serviceFlowFactor(loc);
    job.hours = Math.max(0, job.hours - rate);
    addWork(state, e.id, 1);
    if (job.hours <= 0.01) {
      job.stage = 'ready';
      job.liftId = undefined;
      a.status = 'done';
      const advisor = staffAt(state, loc.id).find((x) => x.role === 'advisor' && x.trainingDaysLeft <= 0 && x.absentDay !== state.day);
      finishJob(state, loc, job, advisor ? effectiveSkill(advisor) : 0, skillOf(e, 'detail'));
      e.task = undefined;
      emit('fx', { locationId: loc.id, kind: 'service-ready', ref: job.id, label: `🟢 ${job.vehicle}` });
    }
  }
}

/** End of the day: cars are collected, unfinished work moves to tomorrow, conflicts for tomorrow are flagged. */
export function planningDayEnd(state: GameState): void {
  const today = state.day;
  for (const j of state.serviceJobs) if (j.stage === 'ready') j.stage = 'collected';
  for (const a of state.appointments.filter((x) => x.day === today && x.kind === 'service' && x.status !== 'done' && x.status !== 'cancelled' && x.status !== 'missed')) {
    const job = state.serviceJobs.find((j) => j.id === a.jobId);
    const loc = locationById(state, a.locationId);
    a.status = job && job.hours < job.totalHours ? 'done' : 'missed';
    if (!job || !loc || job.status === 'done') continue;
    job.liftId = undefined;
    job.stage = 'waiting';
    // The car stays overnight; the rest of the work goes in tomorrow's plan.
    const next = scheduleJob(state, loc, job, today + 1, DAY_START - 1);
    next.note = a.status === 'missed' ? 'Moved from yesterday' : 'Continued from yesterday';
    if (!job.partsReserved) reservePartsFor(state, loc, job, next.day);
  }
  // Keep the plan to the recent past and the future.
  state.appointments = state.appointments.filter((a) => a.day >= today - 3);
  for (const loc of state.locations) {
    const c = conflicts(state, loc.id, today + 1);
    if (c.length) pushNotice(state, 'bad', `🔧 Planning conflict tomorrow at ${loc.name}: ${c[0].text}${c.length > 1 ? ` (+${c.length - 1} more)` : ''}.`, { kind: 'conflict', id: `${loc.id}:${today + 1}` });
  }
}

// ------------------------------------------------------------ conflicts & edits --

export interface Conflict { ids: string[]; text: string; kind: 'double' | 'absent' | 'unassigned' | 'lifts' | 'parts' }

export function conflicts(state: GameState, locationId: string, day: number): Conflict[] {
  const loc = locationById(state, locationId);
  if (!loc) return [];
  const list = dayAppointments(state, locationId, day).filter((a) => a.status !== 'done');
  const out: Conflict[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (a.kind === 'service' && !a.staffId) out.push({ ids: [a.id], text: `${a.vehicle} has nobody assigned`, kind: 'unassigned' });
    const e = a.staffId ? state.employees.find((x) => x.id === a.staffId) : undefined;
    if (a.staffId && (!e || e.locationId !== locationId)) out.push({ ids: [a.id], text: `${a.vehicle}: the assigned person no longer works here`, kind: 'absent' });
    else if (e && (e.absentDay === day || e.trainingDaysLeft > day - state.day)) out.push({ ids: [a.id], text: `${e.name.split(' ')[0]} is ${e.absentDay === day ? 'off sick' : 'on a course'} but booked for ${a.vehicle}`, kind: 'absent' });
    for (let k = i + 1; k < list.length; k += 1) {
      const b = list[k];
      if (a.staffId && a.staffId === b.staffId && overlaps(a.start, endOf(a), b.start, endOf(b))) {
        out.push({ ids: [a.id, b.id], text: `${e?.name.split(' ')[0] ?? 'Someone'} is booked twice at ${fmtHour(Math.max(a.start, b.start))}`, kind: 'double' });
      }
    }
  }
  // More service work at once than lifts.
  const ls = lotStats(loc.lot);
  for (let t = DAY_START; t < DAY_END; t += 0.5) {
    const at = list.filter((a) => a.kind === 'service' && overlaps(t, t + 0.5, a.start, endOf(a)));
    const lifts = at.filter((a) => !SERVICE_BY_ID[state.serviceJobs.find((j) => j.id === a.jobId)?.type ?? 'oil']?.bay);
    if (lifts.length > ls.slots.lift.length) { out.push({ ids: lifts.map((a) => a.id), text: `${lifts.length} cars need a lift at ${fmtHour(t)} but you have ${ls.slots.lift.length}`, kind: 'lifts' }); break; }
  }
  return out;
}

export function fmtHour(h: number): string {
  const hh = Math.floor(h);
  return `${String(hh).padStart(2, '0')}:${h - hh >= 0.5 ? '30' : '00'}`;
}

/** Move an appointment (drag and drop). Conflicts are allowed and shown. */
export function moveAppointment(state: GameState, id: string, day: number, start: number, staffId?: string | null): { ok: boolean; message: string } {
  const a = state.appointments.find((x) => x.id === id);
  if (!a) return { ok: false, message: 'That appointment is gone.' };
  if (a.status === 'done' || a.status === 'active') return { ok: false, message: 'That work has already started.' };
  start = Math.round(start * 2) / 2;
  if (day < state.day || (day === state.day && start < state.hour)) return { ok: false, message: 'That time has already passed.' };
  if (start < DAY_START || endOf({ start, duration: a.duration }) > DAY_END + 0.01) return { ok: false, message: `Appointments run from ${fmtHour(DAY_START)} to ${fmtHour(DAY_END)}.` };
  if (start >= LUNCH && start < LUNCH + 1) return { ok: false, message: 'That is the lunch hour.' };
  a.day = day;
  a.start = start;
  if (staffId !== undefined) a.staffId = staffId ?? undefined;
  a.status = 'planned';
  a.note = undefined;
  const job = a.jobId ? state.serviceJobs.find((j) => j.id === a.jobId) : undefined;
  if (job) { job.staffId = a.staffId; job.dueDay = Math.max(job.dueDay, day); }
  const e = a.staffId ? state.employees.find((x) => x.id === a.staffId) : undefined;
  const c = conflicts(state, a.locationId, day).filter((x) => x.ids.includes(a.id));
  return { ok: true, message: `${a.vehicle}: ${dayName(day)} ${fmtHour(start)}${e ? ` with ${e.name.split(' ')[0]}` : ''}.${c.length ? ` ⚠ ${c[0].text}.` : ''}` };
}

export function cancelAppointment(state: GameState, id: string): { ok: boolean; message: string } {
  const a = state.appointments.find((x) => x.id === id);
  if (!a) return { ok: false, message: 'That appointment is gone.' };
  if (a.status === 'done' || a.status === 'active') return { ok: false, message: 'That work has already started.' };
  a.status = 'cancelled';
  const job = a.jobId ? state.serviceJobs.find((j) => j.id === a.jobId) : undefined;
  if (job && job.status !== 'done') {
    state.serviceJobs = state.serviceJobs.filter((j) => j !== job);
    const client = job.clientId ? state.clients.find((c) => c.id === job.clientId) : undefined;
    if (client) client.satisfaction = clamp(client.satisfaction - 0.5, 1, 5);
    const loc = locationById(state, a.locationId);
    if (loc) loc.reputation = clamp(loc.reputation - 0.2, 0, 100);
    if (job.partsReserved && loc) for (const [k, n] of Object.entries(job.parts)) loc.parts![k as keyof typeof job.parts] = (loc.parts![k as keyof typeof job.parts] ?? 0) + (n ?? 0);
  }
  return { ok: true, message: `Cancelled: ${a.title} for ${a.customer}. ${job ? 'The customer is not pleased.' : ''}` };
}

/** Lets the planner sort out a day: reassign or move whatever conflicts. */
export function autoFix(state: GameState, locationId: string, day: number): { ok: boolean; message: string } {
  const loc = locationById(state, locationId);
  if (!loc) return { ok: false, message: 'Unknown location.' };
  let fixed = 0;
  for (let round = 0; round < 3; round += 1) {
    const list = conflicts(state, locationId, day);
    if (!list.length) break;
    for (const c of list) {
      const a = state.appointments.find((x) => x.id === c.ids[c.ids.length - 1]);
      if (!a || a.status !== 'planned') continue;
      const job = a.jobId ? state.serviceJobs.find((j) => j.id === a.jobId) : undefined;
      if (a.kind === 'service' && job) {
        // Someone else free at the same time?
        const other = eligibleStaff(state, loc, job).find((e) => e.id !== a.staffId && e.absentDay !== day && staffFree(state, e.id, day, a.start, endOf(a), a.id));
        if (other && c.kind !== 'lifts') { a.staffId = other.id; job.staffId = other.id; fixed += 1; continue; }
        a.status = 'cancelled';
        const next = scheduleJob(state, loc, job, day, day === state.day ? state.hour : DAY_START - 1);
        next.note = 'Rescheduled by the planner';
        fixed += 1;
      } else {
        const who = freePerson(state, locationId, a.kind === 'delivery' ? ['delivery', 'sales'] : ['sales', 'manager'], day, a.start, a.duration);
        a.staffId = who?.id;
        fixed += 1;
      }
    }
  }
  const left = conflicts(state, locationId, day).length;
  return { ok: left === 0, message: left === 0 ? `Planning sorted: ${fixed} change${fixed === 1 ? '' : 's'}.` : `${fixed} changes made; ${left} conflict${left === 1 ? '' : 's'} left — you may need another mechanic or lift.` };
}

export function dayName(day: number): string {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][((day - 1) % 7 + 7) % 7];
}

/** Service jobs whose cars are on the lot right now, with where they stand. */
export function carsInWorkshop(state: GameState, locationId: string): ServiceJob[] {
  return state.serviceJobs.filter((j) => j.locationId === locationId && j.stage && j.stage !== 'expected' && j.stage !== 'collected');
}

export { gameRng };
