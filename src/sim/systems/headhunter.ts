/**
 * The headhunter (v7.3): an agency you sign and upgrade. You brief it — role,
 * minimum skill, experience, traits, salary cap, age, contract — and a few
 * days later it brings candidates. Better agencies search in parallel, meet
 * more of your criteria, check hidden traits, negotiate pay, approach people
 * at rival dealers and, at the top, run executive searches.
 */
import type { ContractKind, Employee, GameState, HeadCriteria, HeadSearch, Role, SkillId } from '../types';
import { EXECUTIVE_ROLES, HEADHUNTER_LEVELS } from '../../data/automation';
import type { HeadhunterLevel } from '../../data/automation';
import { ROLE_BY_ID } from '../../data/game';
import { gameRng } from '../rng';
import { clamp } from '../util';
import { locationById, nextId, pushNotice } from '../state';
import { record } from '../finance';
import { makeEmployee, salaryFor, skillOf } from '../staff';
import { freeStation, stationName } from '../lot';
import { bump } from './autocore';

export function headhunterLevel(state: GameState): HeadhunterLevel | undefined {
  const l = state.headhunter?.level ?? 0;
  return l > 0 ? HEADHUNTER_LEVELS[l - 1] : undefined;
}

/** Signs the agency (level 1) or moves up a level. */
export function upgradeHeadhunter(state: GameState): { ok: boolean; message: string } {
  const next = HEADHUNTER_LEVELS[state.headhunter.level];
  if (!next) return { ok: false, message: 'You already work with the best executive search firm there is.' };
  if (state.companyLevel < next.minCompanyLevel) return { ok: false, message: `${next.name} works with companies from level ${next.minCompanyLevel}.` };
  if (state.cash < next.cost) return { ok: false, message: `Signing ${next.name} costs €${next.cost.toLocaleString('en-GB')}.` };
  record(state, 'Recruitment', -next.cost, `Headhunter: ${next.name}`);
  state.headhunter.level = next.level;
  state.headhunter.since ??= state.day;
  return { ok: true, message: `${next.name} now works for you: ${next.searches} search${next.searches > 1 ? 'es' : ''} at a time, ${next.candidates} candidates each.` };
}

export function endHeadhunter(state: GameState): { ok: boolean; message: string } {
  if (!state.headhunter.level) return { ok: false, message: 'No headhunter under contract.' };
  state.headhunter.level = 0;
  for (const s of state.headhunter.searches) s.status = 'closed';
  return { ok: true, message: 'The headhunter contract has ended. Open searches are closed.' };
}

export function defaultCriteria(role: Role): HeadCriteria {
  return { minSkill: 55, maxSalary: Math.round(ROLE_BY_ID[role].baseSalary * 1.35 / 100) * 100, minExperience: 0, traits: {}, contract: 'any', ageMin: 18, ageMax: 67 };
}

export function openSearches(state: GameState): HeadSearch[] {
  return state.headhunter.searches.filter((s) => s.status !== 'closed');
}

/** Briefs the headhunter. `auto` searches come from HR (target headcount, replacements). */
export function startSearch(state: GameState, role: Role, locationId: string, criteria: HeadCriteria, auto = false): { ok: boolean; message: string; search?: HeadSearch } {
  const lv = headhunterLevel(state);
  if (!lv) return { ok: false, message: 'Sign a headhunter first (People → Headhunter).' };
  if (!locationById(state, locationId)) return { ok: false, message: 'Unknown location.' };
  if (ROLE_BY_ID[role].minLevel > state.companyLevel) return { ok: false, message: `${ROLE_BY_ID[role].name}s join companies from level ${ROLE_BY_ID[role].minLevel}.` };
  if (openSearches(state).filter((s) => s.status === 'searching').length >= lv.searches) return { ok: false, message: `${lv.name} runs ${lv.searches} search${lv.searches > 1 ? 'es' : ''} at a time. Close one or upgrade.` };
  if (state.cash < lv.searchFee) return { ok: false, message: `A search costs €${lv.searchFee.toLocaleString('en-GB')}.` };
  record(state, 'Recruitment', -lv.searchFee, `Headhunter search: ${ROLE_BY_ID[role].name}`, locationId);
  const days = gameRng.int(lv.days[0], lv.days[1]);
  const search: HeadSearch = {
    id: nextId(state, 'hs'), role, locationId, criteria: { ...criteria, traits: { ...criteria.traits } }, status: 'searching',
    startDay: state.day, readyDay: state.day + days, expires: state.day + days + 10, candidates: [], auto, fee: lv.searchFee,
  };
  state.headhunter.searches.unshift(search);
  if (state.headhunter.searches.length > 30) state.headhunter.searches = state.headhunter.searches.filter((s, i) => i < 20 || s.status !== 'closed');
  bump(state, 'hr', 'searches');
  return { ok: true, message: `${lv.name} is looking for a ${ROLE_BY_ID[role].name.toLowerCase()} — candidates in about ${days} days.`, search };
}

export function closeSearch(state: GameState, id: string): { ok: boolean; message: string } {
  const s = state.headhunter.searches.find((x) => x.id === id);
  if (!s || s.status === 'closed') return { ok: false, message: 'That search is already closed.' };
  s.status = 'closed';
  return { ok: true, message: 'Search closed.' };
}

/** What a candidate misses of the brief (empty = a full match). */
export function misses(e: Employee, c: HeadCriteria): string[] {
  const out: string[] = [];
  if (e.skill < c.minSkill) out.push(`skill ${e.skill} < ${c.minSkill}`);
  if (e.salary > c.maxSalary) out.push(`asks €${e.salary.toLocaleString('en-GB')}`);
  if ((e.experience ?? 0) < c.minExperience) out.push(`${e.experience ?? 0} yrs experience`);
  for (const [k, v] of Object.entries(c.traits) as [SkillId, number][]) if (v && skillOf(e, k) < v) out.push(`${k} ${skillOf(e, k)} < ${v}`);
  if (c.contract !== 'any' && e.contract !== c.contract) out.push(`wants ${e.contract}`);
  if ((e.age ?? 30) < c.ageMin || (e.age ?? 30) > c.ageMax) out.push(`age ${e.age}`);
  if (c.specialization && e.specialization !== c.specialization) out.push(`${e.specialization}`);
  return out;
}

function makeCandidate(state: GameState, s: HeadSearch, lv: HeadhunterLevel, passive: boolean): Employee {
  const c = s.criteria;
  const exec = lv.executive && EXECUTIVE_ROLES.includes(s.role);
  const cap = !lv.executive && EXECUTIVE_ROLES.includes(s.role) ? 72 : 97;
  const lo = clamp(c.minSkill - 14 + lv.quality, 15, cap - 5);
  const hi = clamp(c.minSkill + 18 + lv.quality + (passive ? 8 : 0), lo + 5, cap);
  const e = makeEmployee(state, s.role, s.locationId, [lo, hi]);
  const fits = (): boolean => gameRng.chance(lv.fit);
  e.experience = Math.round(clamp(((e.age ?? 30) - 20) * gameRng.range(0.25, 0.6), 0, 35));
  // The agency looks for people who meet the brief; the better it is, the more often they do.
  if (e.skill < c.minSkill && fits()) e.skill = Math.min(cap, c.minSkill + gameRng.int(0, 8));
  if (e.skills) e.skills[ROLE_BY_ID[s.role].skill] = e.skill;
  if ((e.experience ?? 0) < c.minExperience && fits()) e.experience = c.minExperience + gameRng.int(0, 4);
  for (const [k, v] of Object.entries(c.traits) as [SkillId, number][]) {
    if (!v || skillOf(e, k) >= v || !fits()) continue;
    e.skills = { ...(e.skills ?? {}), [k]: clamp(v + gameRng.int(0, 10), 1, 99) };
  }
  if (((e.age ?? 30) < c.ageMin || (e.age ?? 30) > c.ageMax) && fits()) e.age = gameRng.int(Math.max(18, c.ageMin), Math.min(67, c.ageMax));
  if (c.contract !== 'any' && e.contract !== c.contract && fits()) {
    e.contract = c.contract as ContractKind;
    e.hours = c.contract === 'parttime' ? 24 : 40;
    e.contractEnd = c.contract === 'temporary' ? state.day + 180 : undefined;
  }
  if (c.specialization && ROLE_BY_ID[s.role].specializations.includes(c.specialization) && fits()) e.specialization = c.specialization;
  // Seniority: executive searches bring experienced people.
  e.level = exec ? (gameRng.chance(0.4) ? 4 : 3) : e.skill > 75 ? 3 : e.skill > 55 ? 2 : 1;
  if (exec) e.experience = Math.max(e.experience ?? 0, 8 + gameRng.int(0, 10));
  const base = salaryFor(e.role, e.skill, e.level) * (e.contract === 'parttime' ? 0.6 : 1) * (passive ? 1.1 : 1);
  // Negotiation: they try to land the candidate inside your salary cap.
  let salary = base;
  if (lv.negotiate && salary > c.maxSalary) salary = Math.max(base * 0.9, c.maxSalary);
  else if (lv.negotiate) salary = base * gameRng.range(0.93, 0.98);
  e.salary = Math.round(salary / 10) * 10;
  e.traitsKnown = lv.traits;
  if (passive) {
    const rival = gameRng.pick(state.competitors.length ? state.competitors.map((r) => r.name) : ['a rival dealer']);
    e.source = `Currently at ${rival}`;
    e.morale = clamp(e.morale + 5, 0, 100);
  }
  e.xp = 0;
  return e;
}

/** Daily: searches finish and bring candidates; old results lapse. */
export function headhunterDaily(state: GameState): void {
  const lv = headhunterLevel(state);
  for (const s of state.headhunter.searches) {
    if (s.status === 'searching' && lv && state.day >= s.readyDay) {
      const list: Employee[] = [];
      for (let i = 0; i < lv.candidates; i += 1) list.push(makeCandidate(state, s, lv, lv.passive && i === 0));
      // Best matches first.
      list.sort((a, b) => misses(a, s.criteria).length - misses(b, s.criteria).length || b.skill - a.skill);
      s.candidates = list;
      s.status = 'ready';
      s.expires = state.day + 10;
      const full = list.filter((e) => !misses(e, s.criteria).length).length;
      s.note = full ? `${full} of ${list.length} meet every requirement` : 'No one meets every requirement';
      bump(state, 'hr', 'candidates', list.length);
      if (!s.auto) pushNotice(state, 'good', `🧑‍💼 Headhunter: ${list.length} ${ROLE_BY_ID[s.role].name.toLowerCase()} candidates found (${s.note.toLowerCase()}).`, undefined, 'auto');
    } else if (s.status === 'ready' && state.day > s.expires) {
      s.status = 'closed';
      s.note = 'Candidates moved on';
    } else if (s.status === 'searching' && !lv) {
      s.status = 'closed';
    }
  }
}

/** Hires a candidate from a search: a workstation is needed, and the agency's success fee is due. */
export function hireCandidate(state: GameState, searchId: string, candidateId: string): { ok: boolean; message: string } {
  const s = state.headhunter.searches.find((x) => x.id === searchId);
  const c = s?.candidates.find((x) => x.id === candidateId);
  if (!s || !c || s.status !== 'ready') return { ok: false, message: 'That candidate is no longer available.' };
  const loc = locationById(state, s.locationId);
  if (!loc) return { ok: false, message: 'Unknown location.' };
  const station = freeStation(state, loc, c.role);
  if (!station) return { ok: false, message: `A ${ROLE_BY_ID[c.role].name.toLowerCase()} needs ${stationName(c.role)} at ${loc.name}. Build one first.` };
  const lv = HEADHUNTER_LEVELS[Math.max(0, state.headhunter.level - 1)];
  const fee = Math.round(c.salary * 12 * lv.successFee / 10) * 10;
  if (state.cash < fee) return { ok: false, message: `The success fee is €${fee.toLocaleString('en-GB')}.` };
  record(state, 'Recruitment', -fee, `Headhunter success fee: ${c.name}`, loc.id);
  c.locationId = loc.id;
  c.stationId = station.id;
  c.hiredDay = state.day;
  state.employees.push(c);
  s.candidates = s.candidates.filter((x) => x.id !== c.id);
  s.status = 'closed';
  s.note = `Hired ${c.name}`;
  state.headhunter.placed += 1;
  bump(state, 'hr', 'hired');
  return { ok: true, message: `${c.name} joins ${loc.name} as ${ROLE_BY_ID[c.role].name} (success fee €${fee.toLocaleString('en-GB')}).` };
}
