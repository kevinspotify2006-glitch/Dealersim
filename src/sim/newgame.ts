/**
 * Creating a new game, and the legacy that carries over between games.
 */
import { BRAND_POSITIONS } from '../data/group';
import type { GameState, Legacy, Location } from './types';
import { CHALLENGES } from '../data/game';
import { CATEGORIES, FUELS } from '../data/vehicles';
import { reseedGameRng } from './rng';
import { DEFAULT_SETTINGS, SAVE_VERSION, OPEN_HOUR, emptyFunnel, emptyKpi } from './state';
import { defaultEconomy } from './systems/economy';
import { initSystems } from './systems/init';
import { grantFreeResearch } from './systems/research';
import { generateVehicle } from './vehicles';
import { bookValue, roundPrice, suggestedPrice } from './market';
import { makeEmployee, refreshCandidates } from './staff';
import { seedCompetitors } from './world';
import { refreshOffers } from './trading';
import { companyValue, monthlyPayment } from './finance';
import { scheduleArrivals } from './customers';
import { TEMPLATES, assignSlots, assignStations, buildTemplate, emptyLot, rentFor, templateCost } from './lot';

const LEGACY_KEY = 'cdmt:legacy';

export function emptyLegacy(): Legacy {
  return { points: 0, totalPrestiges: 0, perks: {}, bestCompanyValue: 0 };
}

export function loadLegacy(): Legacy {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return emptyLegacy();
    const parsed = JSON.parse(raw) as Partial<Legacy>;
    return {
      points: Number(parsed.points) || 0,
      totalPrestiges: Number(parsed.totalPrestiges) || 0,
      perks: typeof parsed.perks === 'object' && parsed.perks ? parsed.perks as Record<string, number> : {},
      bestCompanyValue: Number(parsed.bestCompanyValue) || 0,
    };
  } catch {
    return emptyLegacy();
  }
}

export function saveLegacy(legacy: Legacy): void {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));
  } catch {
    /* storage unavailable: legacy lasts for this session only */
  }
}

export interface NewGameOptions {
  companyName: string;
  ownerName: string;
  challenge: string;
  seed?: number;
  /** Starting layout (see TEMPLATES). Defaults to the challenge's own premises. */
  template?: string;
  /** Company colour and logo (shown on signs, the HUD and reports). */
  color?: string;
  logo?: string;
  /** Brand promise (BRAND_POSITIONS id): which buyers you attract. */
  position?: string;
}

export function defaultTemplate(challengeId: string): string {
  return challengeId === 'luxury' ? 'premium' : challengeId === 'ev' ? 'ev' : 'small';
}

/**
 * The starting layouts a new company can choose from. The challenge's default
 * premises are included in the price; a cheaper layout returns the difference
 * as cash and a dearer one costs the difference.
 */
export function startingTemplates(challengeId: string, perks: Record<string, number> = loadLegacy().perks): { id: string; name: string; description: string; cashDelta: number; allowed: boolean }[] {
  const challenge = CHALLENGES.find((c) => c.id === challengeId) ?? CHALLENGES[0];
  const tier = (perks.lot ?? 0) > 0 ? 1 : 0;
  const base = templateCost(defaultTemplate(challenge.id), tier, 1);
  return TEMPLATES.map((t) => {
    const cashDelta = Math.round((base - templateCost(t.id, tier, 1)) / 100) * 100;
    return { id: t.id, name: t.name, description: t.description, cashDelta, allowed: challenge.cash + (perks.capital ?? 0) * 25000 + cashDelta >= 6000 };
  });
}

export function createGame(opts: NewGameOptions): GameState {
  const seed = (opts.seed ?? Date.now()) >>> 0;
  reseedGameRng(seed);
  const challenge = CHALLENGES.find((c) => c.id === opts.challenge) ?? CHALLENGES[0];
  const legacy = loadLegacy();
  const perks = legacy.perks;
  const home: Location = {
    id: 'loc1',
    cityId: challenge.id === 'ev' ? 'techpark' : challenge.id === 'luxury' ? 'solano' : 'riverton',
    name: challenge.id === 'ev' ? 'Nova Park' : challenge.id === 'luxury' ? 'Solano Bay' : 'Riverton',
    openedDay: 1,
    upgrades: {},
    lot: emptyLot((perks.lot ?? 0) > 0 ? 1 : 0),
    reputation: challenge.rep + (perks.rep ?? 0) * 5,
    stats: { revenue: 0, profit: 0, sold: 0, leads: 0 },
    month: { revenue: 0, profit: 0, sold: 0, leads: 0 },
    rentMonthly: challenge.id === 'luxury' ? 3600 : challenge.id === 'ev' ? 2600 : 1500,
  };
  const options = startingTemplates(challenge.id, perks);
  const chosen = options.find((t) => t.id === opts.template && t.allowed) ?? options.find((t) => t.id === defaultTemplate(challenge.id))!;
  buildTemplate(null, home.lot, chosen.id, 1);
  // Challenge towns come with a negotiated founder's lease.
  home.rentFactor = challenge.id === 'luxury' ? 0.7 : challenge.id === 'ev' ? 0.55 : 1;
  home.rentMonthly = rentFor(home);

  const trends: Record<string, number> = {};
  for (const k of [...CATEGORIES, ...FUELS]) trends[k] = 1;

  const state: GameState = {
    version: SAVE_VERSION,
    id: `g${seed.toString(36)}`,
    companyName: opts.companyName.trim().slice(0, 32) || 'Riverton Motors',
    ownerName: opts.ownerName.trim().slice(0, 32) || 'You',
    challenge: challenge.id,
    seed,
    day: 1,
    hour: OPEN_HOUR,
    speed: 0,
    cash: challenge.cash + (perks.capital ?? 0) * 25000 + chosen.cashDelta,
    reputation: challenge.rep + (perks.rep ?? 0) * 5,
    companyLevel: 1,
    vehicles: [],
    soldArchive: [],
    offers: [],
    customers: [],
    employees: [],
    candidates: [],
    locations: [home],
    activeLocationId: home.id,
    transactions: [],
    txCounter: 0,
    loans: [],
    events: [],
    eventLog: [],
    trends,
    trendHistory: [],
    competitors: [],
    campaigns: [],
    reviews: [],
    history: [],
    notices: [],
    noticeCounter: 0,
    achievements: {},
    stats: {
      sold: 0, customersServed: 0, customersTotal: 0, lifetimeRevenue: 0, lifetimeProfit: 0, biggestDeal: 0,
      bestMonthProfit: 0, perfectReviews: 0, vehiclesBought: 0, peakCompanyValue: 0, evSold: 0, lostLeads: 0,
      loansRepaid: 0, rareBought: 0,
    },
    month: { revenue: 0, expenses: 0, profit: 0, sold: 0 },
    today: { revenue: 0, expenses: 0, profit: 0, sold: 0, leads: 0 },
    negotiation: undefined,
    lostLeads: [],
    settings: { ...DEFAULT_SETTINGS },
    autoList: { [home.id]: true },
    overdraftDays: 0,
    bankrupt: false,
    tutorial: { done: {}, dismissed: false },
    legacy,
    idCounter: 0,
    lastSavedAt: 0,
    economy: defaultEconomy(),
    funnel: { month: emptyFunnel(), last: emptyFunnel(), total: emptyFunnel() },
    clients: [],
    serviceJobs: [],
    contracts: [],
    brandRelations: {},
    research: { done: {}, queue: [] },
    decisions: [],
    fleet: [],
    missions: { active: [], done: {} },
    group: { hq: false, departments: {}, regional: {}, acquisitions: 0 },
    suppliers: {},
    branding: { color: opts.color ?? '#ff7a1a', logo: opts.logo ?? '🚗', tagline: BRAND_POSITIONS.find((p) => p.id === opts.position)?.tagline ?? 'Quality cars, honest prices', position: BRAND_POSITIONS.some((p) => p.id === opts.position) ? opts.position : 'honest' },
    kpi: emptyKpi(),
    boosts: [],
    procurement: { mandates: [], proposals: [], log: [] },
    appointments: [],
  };

  // Starting stock: one ready to sell, one that needs a clean, one that needs a proper look.
  const focus = challenge.focus ? [challenge.focus] : ['Economy', 'Compact', 'Family'];
  for (let i = 0; i < challenge.vehicles; i += 1) {
    const v = generateVehicle(state, { source: i === 2 ? 'private' : 'wholesale', locationId: home.id, categories: challenge.id === 'shoestring' ? ['Economy'] : focus, quality: i === 0 ? 0.6 : 0, maxBase: challenge.focus ? undefined : 30000 });
    v.status = 'yard';
    v.inspectionLevel = 1;
    v.boughtDay = 0;
    v.arrivalDay = 0;
    v.purchasePrice = roundPrice(bookValue(state, v) * (i === 2 ? 0.7 : 0.8));
    v.costs.transport = 150;
    if (i === 0) {
      v.presentation = 70;
      v.issues = v.issues.filter((x) => x.severity === 1);
    }
    if (i === 1) v.presentation = 24;
    v.askingPrice = suggestedPrice(state, v);
    v.floorPrice = roundPrice(v.askingPrice * 0.92);
    if (i === 0) v.status = 'listed';
    v.listedOnline = i === 0;
    state.vehicles.push(v);
  }

  const starter = makeEmployee(state, 'sales', home.id, [34, 46]);
  starter.salary = Math.round(starter.salary * 0.9);
  state.employees.push(starter);

  if (challenge.loan) {
    const rate = 0.075;
    state.loans.push({
      id: 'l0', name: 'Founder loan', principal: challenge.loan, balance: challenge.loan, rate,
      termMonths: 60, monthsLeft: 60, payment: Math.round(monthlyPayment(challenge.loan, rate, 60)), takenDay: 1,
    });
    state.cash += challenge.loan;
  }

  // Ids from the template builder are temporary; give the lot proper save ids.
  for (const o of home.lot.objects) o.id = `o${(state.idCounter += 1).toString(36)}`;
  home.lot.version += 1;
  // The first car for sale goes on the best spot; the others wait in the yard.
  assignSlots(state, home);
  assignStations(state, home);

  initSystems(state);
  grantFreeResearch(state, perks.research ?? 0);
  seedCompetitors(state, home.cityId);
  refreshCandidates(state);
  refreshOffers(state, true);
  scheduleArrivals(state);
  state.stats.peakCompanyValue = companyValue(state);
  state.history.push({
    day: 0, revenue: 0, expenses: 0, profit: 0, cash: state.cash,
    inventoryValue: 0, sold: 0, leads: 0, companyValue: companyValue(state),
  });
  return state;
}
