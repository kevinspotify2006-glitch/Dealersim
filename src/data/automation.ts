/**
 * Management & automation data (v7.3): departments and who runs them, HR
 * manager capacity, headhunter levels, the logistics fleet, default policies
 * and the vocabulary of player-made rules. Balance lives here, not in code.
 */
import type { AutoMode, AutoPriority, AutomationPolicies, Dept, LogiAssetType, Role, RuleAction, RuleMetric, SkillId } from '../sim/types';

export interface DeptDef {
  id: Dept;
  name: string;
  icon: string;
  /** Roles that can run the department, best first. */
  roles: Role[];
  /** The skill that decides how well they run it. */
  skill: SkillId;
  /** What each mode means here. */
  modes: Record<AutoMode, string>;
  description: string;
}

export const DEPARTMENTS: DeptDef[] = [
  { id: 'procurement', name: 'Procurement', icon: 'search', roles: ['procurement', 'buyer'], skill: 'buying', description: 'Keeps the lot stocked: your buyers search to the policy when stock runs low.',
    modes: { manual: 'You buy every car yourself.', assisted: 'Buyers search to the policy; you approve each deal.', auto: 'Buyers buy good deals themselves under the approval limit.' } },
  { id: 'inventory', name: 'Inventory & pricing', icon: 'tag', roles: ['inventory', 'manager'], skill: 'management', description: 'Lists prepared cars, prices to the policy, reprices ageing stock and clears old cars.',
    modes: { manual: 'You list and price every car.', assisted: 'The manager flags what needs a new price or a sale.', auto: 'Cars are listed, priced, repriced and cleared automatically.' } },
  { id: 'sales', name: 'Sales', icon: 'handshake', roles: ['manager', 'sales'], skill: 'sales', description: 'Advisors serve customers from the first minute and close deals within your limits.',
    modes: { manual: 'Advisors only step in when nobody served a customer.', assisted: 'Advisors do everything up to the handshake; deals outside the policy wait for you.', auto: 'Advisors close deals within the policy; big ones wait for your approval.' } },
  { id: 'service', name: 'Service', icon: 'wrench', roles: ['manager', 'advisor'], skill: 'service', description: 'Assigns jobs and mechanics and fixes planning conflicts.',
    modes: { manual: 'You plan the workshop.', assisted: 'Conflicts are flagged for you to fix.', auto: 'The planning is fixed every day by itself.' } },
  { id: 'parts', name: 'Parts', icon: 'box', roles: ['inventory', 'advisor'], skill: 'management', description: 'Keeps the parts store between minimum and target stock.',
    modes: { manual: 'You order every part.', assisted: 'Low stock is flagged with a one-tap order.', auto: 'Parts are reordered automatically (express when out).' } },
  { id: 'hr', name: 'HR', icon: 'people', roles: ['hr'], skill: 'management', description: 'Training, promotions, pay reviews, cover for absences and recruitment to target headcount.',
    modes: { manual: 'You train, promote and hire everyone.', assisted: 'HR suggests training, promotions and hires.', auto: 'HR managers run their people and the headhunter recruits to target.' } },
  { id: 'logistics', name: 'Logistics', icon: 'car', roles: ['logistics', 'inventory'], skill: 'management', description: 'Collects bought cars sooner and moves stock between locations.',
    modes: { manual: 'Cars arrive by carrier; you move them yourself.', assisted: 'Your fleet collects bought cars; transfers are suggested.', auto: 'Your fleet collects cars and balances stock between locations.' } },
  { id: 'marketing', name: 'Marketing', icon: 'marketing', roles: ['marketing'], skill: 'sales', description: 'Runs campaigns within a monthly budget and stops the ones that do not pay.',
    modes: { manual: 'You launch every campaign.', assisted: 'Campaign ideas and poor performers are flagged.', auto: 'Campaigns run within the budget; poor ones are stopped.' } },
];
export const DEPT_BY_ID = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d])) as Record<Dept, DeptDef>;

/** Employees one HR manager can look after, by HR grade 1..10. */
export const HR_CAPACITY = [10, 15, 25, 40, 60, 100, 150, 250, 500, 1000];

/** Actions per day a department manager gets through, by quality band. */
export const MANAGER_ACTIONS = (quality: number, level: number): number => 2 + Math.floor(quality / 18) + level;

export interface HeadhunterLevel {
  level: number;
  name: string;
  /** One-off price to sign (level 1) or upgrade to this level. */
  cost: number;
  retainer: number;            // per month
  searchFee: number;           // per search
  successFee: number;          // share of a year's salary on a hire
  searches: number;            // at the same time
  candidates: number;          // per search
  days: [number, number];      // search time
  quality: number;             // skill added to the pool
  fit: number;                 // chance each criterion is met
  traits: boolean;             // hidden traits checked
  negotiate: boolean;          // negotiates salary down
  passive: boolean;            // approaches people at rival dealers
  executive: boolean;          // senior hires (managers, HR, procurement) at level 3+
  minCompanyLevel: number;
  description: string;
}

export const HEADHUNTER_LEVELS: HeadhunterLevel[] = [
  { level: 1, name: 'Local recruiter', cost: 3000, retainer: 500, searchFee: 600, successFee: 0.08, searches: 1, candidates: 3, days: [4, 6], quality: 4, fit: 0.6, traits: false, negotiate: false, passive: false, executive: false, minCompanyLevel: 1, description: 'One search at a time, basic filters, three candidates.' },
  { level: 2, name: 'Regional agency', cost: 9000, retainer: 1100, searchFee: 900, successFee: 0.1, searches: 2, candidates: 5, days: [3, 5], quality: 9, fit: 0.72, traits: false, negotiate: false, passive: false, executive: false, minCompanyLevel: 2, description: 'Better candidates, five per search, stricter skill filtering.' },
  { level: 3, name: 'Automotive specialists', cost: 22000, retainer: 2200, searchFee: 1300, successFee: 0.12, searches: 3, candidates: 5, days: [3, 5], quality: 14, fit: 0.82, traits: true, negotiate: true, passive: false, executive: false, minCompanyLevel: 3, description: 'Several searches, hidden traits checked, salaries negotiated.' },
  { level: 4, name: 'Talent partners', cost: 45000, retainer: 3800, searchFee: 1900, successFee: 0.14, searches: 4, candidates: 6, days: [2, 4], quality: 19, fit: 0.9, traits: true, negotiate: true, passive: true, executive: false, minCompanyLevel: 4, description: 'Approaches people at rival dealers; finds rare specialists.' },
  { level: 5, name: 'Executive search', cost: 90000, retainer: 6500, searchFee: 2800, successFee: 0.18, searches: 6, candidates: 6, days: [2, 4], quality: 24, fit: 0.95, traits: true, negotiate: true, passive: true, executive: true, minCompanyLevel: 5, description: 'Elite candidates, confidential searches and experienced managers.' },
];

/** Roles only an executive search finds at senior level. */
export const EXECUTIVE_ROLES: Role[] = ['manager', 'hr', 'procurement', 'logistics', 'inventory'];

export interface LogiAssetDef {
  type: LogiAssetType;
  name: string;
  icon: string;
  price: number;
  monthly: number;              // driver, fuel base, insurance, maintenance
  capacity: number;             // cars moved per day
  perMove: number;              // fuel and tolls per car moved
  reliability: number;          // chance per day it is available
  speed: number;                // days saved when collecting a bought car
  minLevel: number;
  description: string;
}

export const LOGI_ASSETS: LogiAssetDef[] = [
  { type: 'van', name: 'Delivery van', icon: '🚐', price: 16000, monthly: 420, capacity: 1, perMove: 45, reliability: 0.94, speed: 1, minLevel: 1, description: 'A trade plate and a driver: one car a day, collected or delivered.' },
  { type: 'truck', name: 'Transport truck', icon: '🚚', price: 42000, monthly: 1150, capacity: 3, perMove: 55, reliability: 0.93, speed: 1, minLevel: 2, description: 'Three cars a day between suppliers and your locations.' },
  { type: 'carrier', name: 'Car carrier', icon: '🚛', price: 96000, monthly: 2500, capacity: 8, perMove: 60, reliability: 0.9, speed: 2, minLevel: 4, description: 'Eight cars at a time; auctions and imports arrive two days sooner.' },
  { type: 'hub', name: 'Regional logistics centre', icon: '🏭', price: 260000, monthly: 4200, capacity: 12, perMove: 35, reliability: 0.99, speed: 2, minLevel: 5, description: 'A depot with its own drivers: twelve moves a day and the cheapest transport.' },
];
export const LOGI_BY_TYPE = Object.fromEntries(LOGI_ASSETS.map((a) => [a.type, a])) as Record<LogiAssetType, LogiAssetDef>;
/** Third-party carriers when you have no fleet (or it is full). */
export const THIRD_PARTY_MOVE = 180;

export function defaultPolicies(): AutomationPolicies {
  return {
    modes: { procurement: 'manual', inventory: 'manual', sales: 'manual', service: 'manual', parts: 'manual', hr: 'manual', logistics: 'manual', marketing: 'manual' },
    procurement: { stockMin: 6, stockTarget: 10, maxPrice: 25000, minMargin: 1500, risk: 'medium', categories: [], fuels: [], kmMax: 160000, autoBuyUnder: 15000, monthlyBudget: 60000 },
    inventory: { minStock: 6, targetStock: 10, maxStock: 18, repriceDays: 45, clearDays: 120, pricing: 'market', autoList: true },
    sales: { minMargin: 800, maxDiscount: 0.08, finance: true, tradeIns: true, approveAbove: 40000 },
    hr: { targets: {}, autoReplace: true, trainingBudget: 3000, trainBelow: 60, promoteSkill: 60, promotePerf: 60, promoteMonths: 2, salaryReview: true },
    service: { autoFix: true, vipFirst: true },
    parts: { minFactor: 1, targetFactor: 2, express: true },
    marketing: { monthlyBudget: 3000, minRoi: 0.5, channels: ['social', 'listings', 'google'] },
    logistics: { balanceStock: true, pickUp: true },
  };
}

export const PRIORITY_RANK: Record<AutoPriority, number> = { critical: 3, high: 2, normal: 1, low: 0 };
export const PRIORITY_NAMES: Record<AutoPriority, string> = { critical: 'Critical', high: 'High', normal: 'Normal', low: 'Low' };

export const RULE_METRICS: Record<RuleMetric, { name: string; arg?: 'role' | 'days'; unit: string }> = {
  stock: { name: 'Cars in stock', unit: 'cars' },
  cash: { name: 'Cash', unit: '€' },
  aged: { name: 'Cars older than … days', arg: 'days', unit: 'cars' },
  partsLow: { name: 'Parts below minimum', unit: 'parts' },
  waiting: { name: 'Customers waiting', unit: 'customers' },
  staff: { name: 'Employees in role …', arg: 'role', unit: 'people' },
};

export const RULE_ACTIONS: Record<RuleAction, { name: string; param?: 'percent' | 'channel' | 'role'; dept: Dept }> = {
  reprice: { name: 'Cut the price of those cars by … %', param: 'percent', dept: 'inventory' },
  startBuying: { name: 'Start buying (activate buyers)', dept: 'procurement' },
  pauseBuying: { name: 'Pause buying', dept: 'procurement' },
  orderParts: { name: 'Order parts up to target', dept: 'parts' },
  campaign: { name: 'Launch a campaign …', param: 'channel', dept: 'marketing' },
  recruit: { name: 'Recruit a …', param: 'role', dept: 'hr' },
  notify: { name: 'Just tell me', dept: 'inventory' },
};

/** Monthly overhead per department that runs assisted or automated (tools, admin, oversight). */
export const DEPT_OVERHEAD = 120;
