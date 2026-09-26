/**
 * Dealership staff: hiring, skills, training, promotion, stress, morale, pay,
 * bonuses, commission and the team synergies that make a department more
 * than the sum of its people.
 */
import type { Employee, GameState, Role, SkillId } from './types';
import { FIRST_NAMES, LAST_NAMES, ROLES, ROLE_BY_ID, TRAINING_BY_ID } from '../data/game';
import { gameRng } from './rng';
import { clamp } from './util';
import { hasTech, locationById, nextId, pushNotice, staffAt } from './state';
import { freeStation, lotStats, stationName } from './lot';
import { record } from './finance';

export const MAX_LEVEL = 5;

export function xpForLevel(level: number): number {
  return level * 120;
}

export function salaryFor(role: Role, skill: number, level: number): number {
  const base = ROLE_BY_ID[role].baseSalary;
  return Math.round((base * (0.72 + (skill / 100) * 0.85) * (1 + (level - 1) * 0.12)) / 10) * 10;
}

/** Job title, e.g. "Senior Salesperson" from level 3. */
export function titleOf(e: Pick<Employee, 'role' | 'level'> & { focus?: string }): string {
  if (e.role === 'manager') return managerTitle(e as Employee);
  const name = ROLE_BY_ID[e.role]?.name ?? e.role;
  const low = name.charAt(0).toLowerCase() + name.slice(1);
  if (e.level >= 5) return `Lead ${low}`;
  if (e.level >= 3) return `Senior ${low}`;
  return name;
}

/** How each role's secondary skills relate to its main one. */
const SKILL_PROFILE: Record<Role, Partial<Record<SkillId, number>>> = {
  sales: { negotiation: 0.8, service: 0.7, finance: 0.35, luxury: 0.3, ev: 0.25 },
  reception: { service: 1, sales: 0.3, speed: 0.6 },
  mechanic: { technical: 1, speed: 0.7, ev: 0.25 },
  technician: { technical: 1, ev: 0.8, speed: 0.6 },
  detailer: { speed: 1, technical: 0.3, service: 0.3 },
  cleaner: { speed: 1, service: 0.3 },
  buyer: { negotiation: 1, technical: 0.4, luxury: 0.3 },
  manager: { management: 1, sales: 0.6, finance: 0.4, negotiation: 0.5 },
  accountant: { finance: 1, management: 0.4 },
  marketing: { sales: 0.7, service: 0.4 },
  finance: { finance: 1, sales: 0.5, service: 0.5, negotiation: 0.5 },
  advisor: { service: 1, technical: 0.5, sales: 0.6 },
  delivery: { service: 1, luxury: 0.4, speed: 0.5 },
  security: { speed: 0.8 },
  inventory: { management: 0.8, negotiation: 0.6, finance: 0.4 },
  photographer: { detail: 1, speed: 0.6, sales: 0.3 },
  prep: { speed: 1, technical: 0.55, detail: 0.7 },
  procurement: { buying: 1, appraisal: 0.9, negotiation: 0.85, management: 0.7 },
  admin: { reliability: 1, finance: 0.5, service: 0.5, detail: 0.7 },
};

/** Buyers need buying and appraisal on top of negotiation. */
SKILL_PROFILE.buyer = { negotiation: 1, buying: 0.95, appraisal: 0.85, technical: 0.4, luxury: 0.3 };
SKILL_PROFILE.mechanic = { technical: 1, speed: 0.7, ev: 0.25, detail: 0.6 };
SKILL_PROFILE.technician = { technical: 1, ev: 0.8, speed: 0.6, detail: 0.75 };
SKILL_PROFILE.detailer = { speed: 1, technical: 0.3, service: 0.3, detail: 0.8 };
SKILL_PROFILE.advisor = { service: 1, technical: 0.5, sales: 0.6, appraisal: 0.4 };

/** Personal traits everyone has, whatever the job. */
export const PERSONAL_TRAITS: SkillId[] = ['reliability', 'composure', 'detail'];

/** A skill value, falling back to the main skill scaled by the role's profile. */
export function skillOf(e: Employee, id: SkillId): number {
  const own = e.skills?.[id];
  if (own !== undefined) return own;
  const main = ROLE_BY_ID[e.role]?.skill;
  if (main === id) return e.skill;
  return Math.round(e.skill * (SKILL_PROFILE[e.role]?.[id] ?? 0.2));
}

export function makeSkills(role: Role, skill: number): Partial<Record<SkillId, number>> {
  const out: Partial<Record<SkillId, number>> = {};
  const main = ROLE_BY_ID[role].skill;
  out[main] = skill;
  for (const [k, f] of Object.entries(SKILL_PROFILE[role]) as [SkillId, number][]) {
    if (k === main) continue;
    out[k] = Math.round(clamp(skill * f + gameRng.range(-8, 8), 1, 99));
  }
  // Character: some people are simply more reliable, calmer or more precise.
  for (const t of PERSONAL_TRAITS) if (out[t] === undefined) out[t] = Math.round(clamp(gameRng.range(30, 92), 1, 99));
  return out;
}

/** Fills in the people fields (age, contract, hours…) for older saves and new hires. */
export function ensurePeopleFields(e: Employee): void {
  if (!e.skills) e.skills = makeSkills(e.role, e.skill);
  for (const t of PERSONAL_TRAITS) if (e.skills[t] === undefined) e.skills[t] = Math.round(clamp(gameRng.range(35, 85), 1, 99));
  if (e.age === undefined) e.age = gameRng.int(21, 58);
  if (!e.contract) e.contract = 'permanent';
  if (e.hours === undefined) e.hours = e.contract === 'parttime' ? 24 : 40;
  if (e.performance === undefined) e.performance = 55;
  if (e.role === 'manager' && !e.focus) e.focus = 'general';
}

/** Capacity factor from contracted hours (part-timers do less). */
export function hoursFactor(e: Employee): number {
  return clamp((e.hours ?? 40) / 40, 0.3, 1);
}

/** Not at work today (sick, day off)? */
export function isAbsent(state: GameState, e: Employee): boolean {
  return e.absentDay === state.day;
}

export const CONTRACT_NAMES: Record<string, string> = { permanent: 'Permanent', temporary: 'Temporary (6 months)', parttime: 'Part-time (24 h)' };

/** Title for a manager depends on their focus. */
export function managerTitle(e: Employee): string {
  return e.focus === 'sales' ? 'Sales manager' : e.focus === 'service' ? 'Service manager' : 'General manager';
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
    skills: makeSkills(role, skill),
    stress: Math.round(rnd.range(10, 30)),
    tracks: {},
    commission: 0,
    ...contractTerms(state, role, skill, level),
  };
}

/** Age, contract and hours for a new candidate. */
function contractTerms(state: GameState, role: Role, skill: number, level: number): Partial<Employee> {
  const rnd = gameRng;
  const roll = rnd.next();
  const contract: Employee['contract'] = roll < 0.7 ? 'permanent' : roll < 0.85 ? 'temporary' : 'parttime';
  const hours = contract === 'parttime' ? 24 : 40;
  const base = salaryFor(role, skill, level);
  const salary = Math.round((base * (contract === 'parttime' ? 0.6 : contract === 'temporary' ? 0.95 : 1)) / 10) * 10;
  return {
    age: Math.round(clamp(rnd.range(19, 34) + level * rnd.range(2, 9), 19, 64)),
    contract, hours, salary,
    contractEnd: contract === 'temporary' ? state.day + 180 : undefined,
    focus: role === 'manager' ? rnd.pick(['general', 'sales', 'service'] as const) : undefined,
    performance: 55,
  };
}

/** Turns a temporary or part-time contract into a permanent full-time one (a raise). */
export function makePermanent(state: GameState, id: string): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Unknown employee.' };
  if (e.contract === 'permanent' && (e.hours ?? 40) >= 40) return { ok: false, message: `${e.name} is already permanent and full time.` };
  const before = e.salary;
  if ((e.hours ?? 40) < 40) e.salary = Math.round((e.salary / 0.6) / 10) * 10;
  else e.salary = Math.round((e.salary * 1.05) / 10) * 10;
  e.contract = 'permanent';
  e.hours = 40;
  e.contractEnd = undefined;
  e.morale = clamp(e.morale + 12, 0, 100);
  return { ok: true, message: `${e.name} now has a permanent full-time contract (€${before} → €${e.salary}/month).` };
}

/** Sets a manager's focus. */
export function setFocus(state: GameState, id: string, focus: Employee['focus']): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  if (!e || e.role !== 'manager' || !focus) return { ok: false, message: 'Only managers have a focus.' };
  e.focus = focus;
  return { ok: true, message: `${e.name} is now ${managerTitle(e).toLowerCase()}.` };
}

export function rolesUnlocked(state: GameState): Role[] {
  return ROLES.filter((r) => r.minLevel <= state.companyLevel).map((r) => r.id);
}

/** Candidate pool refresh. Better reputation, bigger companies and HR attract better people. */
export function refreshCandidates(state: GameState): void {
  const rnd = gameRng;
  const count = 6 + Math.min(6, state.companyLevel);
  const hr = (hasTech(state, 'hr') ? 5 : 0) + ((state.group?.departments.hr ?? 0) >= 1 ? 8 : 0) + (state.missions?.done['m-rep4'] ? 3 : 0);
  const lo = 18 + state.reputation * 0.2 + state.companyLevel * 3 + hr;
  const hi = 45 + state.reputation * 0.35 + state.companyLevel * 5 + hr;
  const roles = rolesUnlocked(state);
  const out: Employee[] = [];
  // Always at least a salesperson, a mechanic and a detailer on offer.
  const must: Role[] = ['sales', 'mechanic', 'detailer'];
  for (let i = 0; i < count; i += 1) {
    const role = i < must.length ? must[i] : rnd.pick(roles);
    out.push(makeEmployee(state, role, state.activeLocationId, [lo, hi]));
  }
  state.candidates = out;
}

export function hiringFee(state: GameState, e: Employee): number {
  const hr = (state.group?.departments.hr ?? 0) >= 1 ? 0.5 : 1;
  return Math.round(e.salary * 0.25 * hr);
}

export function hire(state: GameState, candidateId: string, locationId: string): { ok: boolean; message: string } {
  const c = state.candidates.find((x) => x.id === candidateId);
  if (!c) return { ok: false, message: 'That candidate is no longer available.' };
  const loc = locationById(state, locationId);
  if (!loc) return { ok: false, message: 'Unknown location.' };
  if (ROLE_BY_ID[c.role].minLevel > state.companyLevel) return { ok: false, message: `${ROLE_BY_ID[c.role].name}s join companies from level ${ROLE_BY_ID[c.role].minLevel}.` };
  const station = freeStation(state, loc, c.role);
  if (!station) return { ok: false, message: `A ${ROLE_BY_ID[c.role].name.toLowerCase()} needs ${stationName(c.role)} to work at. Build one at ${loc.name} first.` };
  const signing = hiringFee(state, c);
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
  for (const r of Object.keys(state.group?.regional ?? {})) if (state.group.regional[r] === id) delete state.group.regional[r];
  for (const other of state.employees) if (other.locationId === e.locationId) other.morale = clamp(other.morale - 4, 0, 100);
  return { ok: true, message: `${e.name} has left the company (severance €${severance}).` };
}

/** Course price: more for senior people; HR academy and the HR department make it cheaper. */
export function trainingCost(e: Employee, trackId?: string, state?: GameState): number {
  const track = trackId ? TRAINING_BY_ID[trackId] : undefined;
  let cost = (track?.cost ?? 900) + e.level * 500 + Math.round(e.skill * 8);
  if (state && hasTech(state, 'hr')) cost *= 0.75;
  if (state && (state.group?.departments.hr ?? 0) >= 1) cost *= 0.85;
  return Math.round(cost / 10) * 10;
}

export function trainingDays(state: GameState, trackId?: string): number {
  const base = trackId ? TRAINING_BY_ID[trackId]?.days ?? 4 : 4;
  return Math.max(1, base - (hasTech(state, 'hr') ? 1 : 0));
}

/** Sends someone on a course. Without a track they sharpen their main skill. */
export function train(state: GameState, id: string, trackId?: string): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Unknown employee.' };
  if (e.trainingDaysLeft > 0) return { ok: false, message: `${e.name} is already on a course.` };
  const track = trackId ? TRAINING_BY_ID[trackId] : undefined;
  const skillId = track?.skill ?? ROLE_BY_ID[e.role].skill;
  if (skillOf(e, skillId) >= 98) return { ok: false, message: `${e.name} is already at the top of that skill.` };
  const cost = trainingCost(e, trackId, state);
  if (state.cash < cost) return { ok: false, message: `The course costs €${cost}.` };
  record(state, 'Training', -cost, `${track?.name ?? 'Training course'}: ${e.name}`, e.locationId);
  e.trainingDaysLeft = trainingDays(state, trackId);
  e.training = trackId ?? ROLE_BY_ID[e.role].skill;
  e.morale = clamp(e.morale + 6, 0, 100);
  e.stress = clamp((e.stress ?? 20) - 10, 0, 100);
  return { ok: true, message: `${e.name} starts ${track ? track.name.toLowerCase() : 'a course'} (${e.trainingDaysLeft} days).` };
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
  const main = ROLE_BY_ID[e.role].skill;
  if (e.skills) e.skills[main] = e.skill;
  e.salary = salaryFor(e.role, e.skill, e.level);
  e.morale = clamp(e.morale + 15, 0, 100);
  return { ok: true, message: `${e.name} is now ${titleOf(e)} (level ${e.level}). New salary €${e.salary}/month.` };
}

export function giveRaise(state: GameState, id: string): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Unknown employee.' };
  e.salary = Math.round((e.salary * 1.08) / 10) * 10;
  e.morale = clamp(e.morale + 14, 0, 100);
  return { ok: true, message: `${e.name} gets an 8% raise — morale up.` };
}

/** A one-off bonus: a quick morale and stress fix. Once a month per person. */
export function bonusAmount(e: Employee): number {
  return Math.round((e.salary * 0.3) / 10) * 10;
}

export function giveBonus(state: GameState, id: string): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Unknown employee.' };
  if (e.bonusDay !== undefined && state.day - e.bonusDay < 30) return { ok: false, message: `${e.name} had a bonus ${state.day - e.bonusDay} days ago.` };
  const amount = bonusAmount(e);
  if (state.cash < amount) return { ok: false, message: `A bonus costs €${amount}.` };
  record(state, 'Bonus', -amount, `Bonus: ${e.name}`, e.locationId);
  e.bonusDay = state.day;
  e.morale = clamp(e.morale + 12, 0, 100);
  e.stress = clamp((e.stress ?? 20) - 15, 0, 100);
  return { ok: true, message: `${e.name} gets a €${amount} bonus — morale up, stress down.` };
}

export function changeRole(state: GameState, id: string, role: Role): { ok: boolean; message: string } {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, message: 'Unknown employee.' };
  if (e.role === role) return { ok: false, message: 'Same role.' };
  if (ROLE_BY_ID[role].minLevel > state.companyLevel) return { ok: false, message: `Needs company level ${ROLE_BY_ID[role].minLevel}.` };
  const loc = locationById(state, e.locationId);
  const station = loc ? freeStation(state, loc, role, e.id) : undefined;
  if (!station) return { ok: false, message: `A ${ROLE_BY_ID[role].name.toLowerCase()} needs ${stationName(role)}. Build one first.` };
  e.role = role;
  e.stationId = station.id;
  // Keep what they know: their skill in the new role's main skill becomes the main skill.
  const main = ROLE_BY_ID[role].skill;
  e.skill = Math.max(Math.round(e.skill * 0.65), e.skills?.[main] ?? 0);
  if (e.skills) e.skills[main] = e.skill;
  e.specialization = gameRng.pick(ROLE_BY_ID[role].specializations);
  e.salary = salaryFor(role, e.skill, e.level);
  e.morale = clamp(e.morale - 5, 0, 100);
  return { ok: true, message: `${e.name} is now a ${ROLE_BY_ID[role].name}.` };
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

// ---------------------------------------------------------------- workload --

/** Customers served by staff today (reset daily) — feeds stress. */
const workload: Record<string, number> = {};
let workloadDay = -1;

export function addWork(state: GameState, id: string, units = 1): void {
  if (workloadDay !== state.day) {
    workloadDay = state.day;
    for (const k of Object.keys(workload)) delete workload[k];
  }
  workload[id] = (workload[id] ?? 0) + units;
}

export function workToday(state: GameState, id: string): number {
  return workloadDay === state.day ? workload[id] ?? 0 : 0;
}

/** Daily staff update: training, stress, morale drift, quitting. */
export function staffDaily(state: GameState): void {
  const commissionRate = state.settings.commission ?? 0.03;
  for (const e of [...state.employees]) {
    e.loyaltyDays = (e.loyaltyDays ?? 0) + 1;
    ensurePeopleFields(e);
    // Performance: a rolling measure of what they got done yesterday.
    const done = workToday(state, e.id);
    const expected = EXPECTED_WORK[e.role] ?? 2;
    const today = e.absentDay === state.day ? 0 : clamp((done / expected) * 70 + effectiveSkill(e) * 0.3, 0, 100);
    e.performance = Math.round(((e.performance ?? 55) * 0.85 + today * 0.15) * 10) / 10;
    // Temporary contracts end unless you make them permanent.
    if (e.contract === 'temporary' && e.contractEnd !== undefined) {
      if (e.contractEnd - state.day === 7) pushNotice(state, 'info', `📄 ${e.name}'s temporary contract ends in a week. Make it permanent (People → Staff) or they leave.`);
      if (state.day >= e.contractEnd) {
        state.employees = state.employees.filter((x) => x.id !== e.id);
        pushNotice(state, 'info', `📄 ${e.name}'s temporary contract has ended and they have left.`);
        continue;
      }
    }
    // Reliability: now and then someone is off sick.
    const rel = skillOf(e, 'reliability');
    if (gameRng.chance(Math.max(0.002, (100 - rel) / 100 * 0.05))) {
      e.absentDay = state.day + 1;
    }
    if (e.trainingDaysLeft > 0) {
      e.trainingDaysLeft -= 1;
      // A training room and screens: now and then a course day is saved.
      const tLoc = locationById(state, e.locationId);
      const training = tLoc ? Math.min(4, lotStats(tLoc.lot).effects.training ?? 0) : 0;
      if (e.trainingDaysLeft > 0 && training > 0 && gameRng.chance(training * 0.12)) e.trainingDaysLeft -= 1;
      if (e.trainingDaysLeft === 0) finishTraining(state, e);
    }
    const loc = locationById(state, e.locationId);
    const fx = loc ? lotStats(loc.lot).effects : {};
    const team = staffAt(state, e.locationId);
    const managers = team.filter((m) => m.role === 'manager');
    // General managers lift everyone, everywhere; others lift their own location.
    const gms = state.employees.filter((m) => m.role === 'manager' && m.focus === 'general' && m.locationId !== e.locationId);
    const managerBoost = managers.reduce((m, x) => Math.max(m, skillOf(x, 'management') * (x.focus === 'general' ? 1.2 : 1)), 0) / 100 * 10 + (gms.length ? 2 : 0);
    const fairPay = salaryFor(e.role, e.skill, e.level);
    const payFeel = clamp((e.salary / fairPay - 1) * 40, -12, 12);
    // Sales staff care about commission.
    const commissionFeel = e.role === 'sales' ? (commissionRate - 0.03) * 150 : 0;
    // Stress: busy days, no workstation and a lack of a staff room push it up.
    const work = workToday(state, e.id);
    const load = e.role === 'sales' ? work / 5 : e.role === 'mechanic' || e.role === 'technician' ? work / 6 : work / 4;
    const relief = Math.min(6, (fx.morale ?? 0)) * 2 + (loc && !loc.lot.open ? 10 : 0);
    // Stress resistance decides how much a busy day gets to them.
    const resist = 1.35 - skillOf(e, 'composure') / 100 * 0.7;
    const targetStress = clamp((18 + load * 35 + (e.stationId ? 0 : 20)) * resist - relief, 0, 100);
    e.stress = clamp((e.stress ?? 20) + (targetStress - (e.stress ?? 20)) * 0.25, 0, 100);
    const hrDept = (state.group?.departments.hr ?? 0) >= 2 ? 5 : 0;
    const target = 62 + managerBoost + payFeel + commissionFeel + (state.reputation - 50) / 8 - Math.max(0, (e.stress ?? 0) - 55) * 0.4 + hrDept;
    e.morale = clamp(e.morale + (target - e.morale) * 0.06 + gameRng.range(-1, 1), 0, 100);
    const burnout = (e.stress ?? 0) > 88 && gameRng.chance(0.04);
    if ((e.morale < 22 && gameRng.chance(0.06)) || burnout) {
      state.employees = state.employees.filter((x) => x.id !== e.id);
      pushNotice(state, 'bad', `${e.name} (${ROLE_BY_ID[e.role].name}) quit — ${burnout ? 'burned out' : 'morale was too low'}.`);
      continue;
    }
    // Skills creep up with experience on the job.
    if (gameRng.chance(0.04 + Math.min(0.04, load * 0.02))) {
      e.skill = clamp(e.skill + 1, 0, 99);
      const main = ROLE_BY_ID[e.role].skill;
      if (e.skills) e.skills[main] = e.skill;
    }
  }
}

function finishTraining(state: GameState, e: Employee): void {
  const trackId = e.training;
  const track = trackId ? TRAINING_BY_ID[trackId] : undefined;
  const skillId: SkillId = track?.skill ?? ROLE_BY_ID[e.role].skill;
  const before = skillOf(e, skillId);
  const gain = Math.round(gameRng.range(7, 13) * (1 - before / 130));
  if (!e.skills) e.skills = {};
  e.skills[skillId] = clamp(before + gain, 0, 99);
  if (skillId === ROLE_BY_ID[e.role].skill) e.skill = e.skills[skillId]!;
  if (track) e.tracks = { ...(e.tracks ?? {}), [track.id]: (e.tracks?.[track.id] ?? 0) + 1 };
  e.xp += 25;
  e.training = undefined;
  pushNotice(state, 'good', `${e.name} finished ${track ? track.name.toLowerCase() : 'training'}: ${skillId} +${gain}.`);
}

/** Weekly payroll (salaries are quoted per month). */
/** The simulation day, so pure helpers can tell whether someone is off today. */
let currentDay = 0;
export function setStaffDay(day: number): void {
  currentDay = day;
}

export function payrollWeekly(state: GameState): void {
  const weekly = state.employees.reduce((s, e) => s + e.salary * 7 / 30, 0);
  if (weekly > 0) record(state, 'Salaries', -Math.round(weekly), `Weekly payroll: ${state.employees.length} staff`);
}

/** Pays sales commission on a deal; returns the amount. */
export function payCommission(state: GameState, e: Employee | undefined, grossProfit: number, locationId: string): number {
  if (!e || grossProfit <= 0) return 0;
  const rate = state.settings.commission ?? 0.03;
  const amount = Math.round(grossProfit * rate);
  if (amount <= 0) return 0;
  record(state, 'Commission', -amount, `Commission: ${e.name}`, locationId);
  e.commission = (e.commission ?? 0) + amount;
  e.morale = clamp(e.morale + Math.min(3, amount / 200), 0, 100);
  return amount;
}

/** Effective skill including morale, stress and having somewhere to work. */
/** Work units a normal day brings per role (for the performance score). */
const EXPECTED_WORK: Partial<Record<Role, number>> = { sales: 3, mechanic: 5, technician: 5, advisor: 4, buyer: 2, procurement: 2, detailer: 3, prep: 3, finance: 2, delivery: 1, reception: 5, photographer: 3 };

export function effectiveSkill(e: Employee): number {
  if (e.trainingDaysLeft > 0) return 0;
  if (e.absentDay !== undefined && e.absentDay === currentDay) return 0;
  const stress = (e.stress ?? 0) > 70 ? 0.88 : 1;
  return e.skill * (0.75 + e.morale / 400) * (e.stationId ? 1 : 0.6) * stress;
}

export function bestAt(state: GameState, locationId: string, role: Role): Employee | undefined {
  return staffAt(state, locationId)
    .filter((e) => e.role === role && e.trainingDaysLeft <= 0)
    .sort((a, b) => effectiveSkill(b) - effectiveSkill(a))[0];
}

// --------------------------------------------------------------- synergies --

export interface Synergy { id: string; name: string; icon: string; active: boolean; effect: string; needs: string }

/** Team combinations that unlock a bonus at a location. */
export function synergies(state: GameState, locationId: string): Synergy[] {
  const team = staffAt(state, locationId).filter((e) => e.trainingDaysLeft <= 0);
  const count = (r: Role) => team.filter((e) => e.role === r && e.stationId).length;
  const loc = locationById(state, locationId);
  const ls = loc ? lotStats(loc.lot) : undefined;
  const activeCampaign = state.campaigns.some((c) => c.locationId === locationId && c.endDay >= state.day);
  const financeNearSales = !!ls?.synergies?.some((s) => s.id === 'financedesk' && s.active);
  return [
    { id: 'salesteam', name: 'Led sales team', icon: '🧭', active: team.some((e) => e.role === 'manager' && e.stationId && e.focus !== 'service') && count('sales') >= 2, effect: 'Sales advisors get 10% more out of every deal (15% with a sales manager).', needs: 'A general or sales manager and 2+ sales advisors' },
    { id: 'buyingdesk', name: 'Buying desk', icon: '📋', active: count('procurement') >= 1 && count('buyer') >= 1, effect: 'Buyers search faster, appraise better and haggle harder.', needs: 'A procurement manager and a vehicle buyer' },
    { id: 'showready', name: 'Show-ready', icon: '📸', active: count('photographer') >= 1 && count('prep') + count('detailer') >= 1, effect: 'Every car for sale gets pro-quality listings the day it is ready.', needs: 'A photographer and a prep specialist or detailer' },
    { id: 'financepair', name: 'Finance on the floor', icon: '🏦', active: count('finance') >= 1 && financeNearSales, effect: '+8 points finance approval and +15% product take-up.', needs: 'A finance manager, and a finance desk next to a sales desk' },
    { id: 'serviceflow', name: 'Organised workshop', icon: '🧾', active: count('advisor') >= 1 && count('mechanic') + count('technician') >= 2, effect: 'Service jobs 15% faster, more upsell.', needs: 'A service advisor and 2+ mechanics or technicians' },
    { id: 'marketingpush', name: 'Campaign manager', icon: '📣', active: count('marketing') >= 1 && activeCampaign, effect: 'Running campaigns bring 20% more leads.', needs: 'A marketing specialist and a running campaign' },
    { id: 'welcome', name: 'Warm welcome', icon: '🛎️', active: count('reception') >= 1 && (ls?.effects.reception ?? 0) > 0, effect: 'Visitors wait an hour longer and are happier.', needs: 'A receptionist at a reception desk' },
    { id: 'handover', name: 'Perfect handover', icon: '🎁', active: count('delivery') >= 1, effect: '+1 star chance on every sale, more repeat customers.', needs: 'A delivery specialist at a delivery bay' },
    { id: 'spotless', name: 'Spotless showroom', icon: '🧹', active: count('cleaner') >= 1, effect: 'Cars gather dust 60% slower; visitors are happier.', needs: 'A cleaner' },
    { id: 'lean', name: 'Lean stock', icon: '📦', active: count('inventory') >= 1, effect: 'Ageing cars are repriced weekly; parts reorder themselves.', needs: 'An inventory manager' },
  ];
}

export function synergyActive(state: GameState, locationId: string, id: string): boolean {
  return synergies(state, locationId).some((s) => s.id === id && s.active);
}
