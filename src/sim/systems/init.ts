/**
 * Fills in every v4 system on a new game or an older save, so both start
 * from the same, complete state. Safe to run more than once.
 */
import type { GameState } from '../types';
import { defaultEconomy } from './economy';
import { emptyFunnel, emptyKpi } from '../state';
import { isRecord, num } from '../util';
import { drivetrainOf, INTERIORS, MODEL_BY_ID } from '../../data/vehicles';
import { gameRng } from '../rng';
import { refillMissions } from './missions';
import { seedParts } from './service';
import { scheduleJob } from './planning';
import { lotStats } from '../lot';
import { ROLE_BY_ID } from '../../data/game';
import { ensurePeopleFields, skillOf } from '../staff';

const SOURCE_IDS = ['wholesale', 'lease', 'private', 'auction', 'fleet', 'manufacturer', 'importer', 'network', 'liquidation', 'special', 'tradein'];

export function initSystems(s: GameState): void {
  const e = isRecord(s.economy) ? s.economy : undefined;
  s.economy = { ...defaultEconomy(), ...(e ?? {}) };
  if (!Array.isArray(s.economy.history)) s.economy.history = [];
  const f = isRecord(s.funnel) ? s.funnel : undefined;
  s.funnel = { month: { ...emptyFunnel(), ...(f?.month ?? {}) }, last: { ...emptyFunnel(), ...(f?.last ?? {}) }, total: { ...emptyFunnel(), ...(f?.total ?? {}) } };
  s.clients = Array.isArray(s.clients) ? s.clients : [];
  s.serviceJobs = Array.isArray(s.serviceJobs) ? s.serviceJobs : [];
  s.contracts = Array.isArray(s.contracts) ? s.contracts : [];
  s.brandRelations = isRecord(s.brandRelations) ? s.brandRelations as Record<string, number> : {};
  const r = isRecord(s.research) ? s.research : undefined;
  s.research = { done: isRecord(r?.done) ? r!.done as Record<string, number> : {}, active: r?.active, queue: Array.isArray(r?.queue) ? r!.queue : [] };
  s.decisions = Array.isArray(s.decisions) ? s.decisions : [];
  s.fleet = Array.isArray(s.fleet) ? s.fleet : [];
  const m = isRecord(s.missions) ? s.missions : undefined;
  s.missions = { active: Array.isArray(m?.active) ? m!.active : [], done: isRecord(m?.done) ? m!.done as Record<string, number> : {} };
  const g = isRecord(s.group) ? s.group : undefined;
  s.group = { hq: !!g?.hq, hqDay: g?.hqDay, departments: isRecord(g?.departments) ? g!.departments as Record<string, number> : {}, regional: isRecord(g?.regional) ? g!.regional as Record<string, string> : {}, acquisitions: num(g?.acquisitions, 0) };
  s.suppliers = isRecord(s.suppliers) ? s.suppliers as Record<string, number> : {};
  for (const id of SOURCE_IDS) if (typeof s.suppliers[id] !== 'number') s.suppliers[id] = 50;
  s.branding = { color: '#ff7a1a', logo: '🚗', tagline: 'Quality cars, honest prices', ...(isRecord(s.branding) ? s.branding : {}) };
  s.kpi = { ...emptyKpi(), ...(isRecord(s.kpi) ? s.kpi : {}) };
  s.boosts = Array.isArray(s.boosts) ? s.boosts : [];
  const pr = isRecord(s.procurement) ? s.procurement : undefined;
  s.procurement = { mandates: Array.isArray(pr?.mandates) ? pr!.mandates : [], proposals: Array.isArray(pr?.proposals) ? pr!.proposals : [], log: Array.isArray(pr?.log) ? pr!.log : [] };
  s.appointments = Array.isArray(s.appointments) ? s.appointments : [];
  if (typeof s.settings.commission !== 'number') s.settings.commission = 0.03;

  for (const v of [...s.vehicles, ...s.offers]) {
    const model = MODEL_BY_ID[v.modelId];
    if (!v.drivetrain && model) v.drivetrain = drivetrainOf(model.body, model.category, v.engine ?? '', gameRng.next());
    if (!v.interior) v.interior = v.options?.includes('Leather') ? 'Black leather' : INTERIORS[0].name;
    if (!v.serviceHistory) v.serviceHistory = v.history?.includes('Service book present') || v.history?.includes('Fresh service') ? 'Full' : v.history?.includes('Partial service history') ? 'Partial' : 'Partial';
  }
  for (const c of s.customers) {
    if (c.credit === undefined) c.credit = 650;
    if (c.monthlyLimit === undefined) c.monthlyLimit = Math.round(c.budget * 0.025 / 10) * 10;
    if (c.waited === undefined) c.waited = 0;
  }
  for (const emp of [...s.employees, ...s.candidates]) {
    if (!ROLE_BY_ID[emp.role]) emp.role = 'sales';
    if (!emp.skills) {
      emp.skills = {};
      emp.skills[ROLE_BY_ID[emp.role].skill] = emp.skill;
      for (const k of ['sales', 'negotiation', 'finance', 'service', 'technical', 'ev', 'luxury', 'management', 'speed'] as const) {
        if (emp.skills[k] === undefined) emp.skills[k] = skillOf(emp, k);
      }
    }
    if (emp.stress === undefined) emp.stress = 20;
    if (!emp.tracks) emp.tracks = {};
    // v5: buying/appraisal for buyers, personal traits, age, contract and hours.
    if (emp.skills && (emp.role === 'buyer' || emp.role === 'procurement')) {
      if (emp.skills.buying === undefined) emp.skills.buying = Math.round(emp.skill * 0.95);
      if (emp.skills.appraisal === undefined) emp.skills.appraisal = Math.round(emp.skill * 0.85);
    }
    ensurePeopleFields(emp);
  }
  for (const loc of s.locations) {
    if (!loc.pricing) loc.pricing = 'market';
    if (!loc.delivery) loc.delivery = { flowers: false, photos: false, welcome: false, premium: false };
    if (!Array.isArray(loc.partsOrders)) loc.partsOrders = [];
    if (!loc.parts) {
      loc.parts = {};
      if (lotStats(loc.lot).slots.lift.length > 0) seedParts(loc);
    }
  }
  for (const c of s.campaigns) if (typeof c.budget !== 'number') c.budget = 1;
  // Negotiation extras used to be four fixed flags; finance is now a plan.
  if (s.negotiation) {
    const ex = s.negotiation.extras as Record<string, boolean>;
    if (ex && 'finance' in ex) delete ex.finance;
    if (ex && ex.accessory === undefined) delete ex.accessory;
  }
  // v5: open service jobs from older saves get a slot in the planning.
  for (const j of s.serviceJobs) {
    if (j.status === 'done' || j.apptId) continue;
    const loc = s.locations.find((l) => l.id === j.locationId);
    if (loc) scheduleJob(s, loc, j, s.day, s.hour);
  }
  refillMissions(s);
}
