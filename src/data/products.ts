/**
 * Finance & insurance ("F&I"): the products sold alongside a car, and the
 * ways a customer can pay. All numbers here drive the simulation directly.
 */
import type { ArchetypeId, FinanceKind } from '../sim/types';

export interface ProductDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Price: a share of the car price, plus a fixed part. */
  rate: number;
  fixed: number;
  /** What it costs you (share of its price). */
  costShare: number;
  /** Base chance a customer says yes when offered. */
  take: number;
  /** Who wants it more (or less). */
  affinity: Partial<Record<ArchetypeId, number>>;
  /** Extra satisfaction points on the review. */
  satisfaction: number;
  /** Cuts complaints: a warranty turns a complaint into a claim you pay. */
  warranty?: 'basic' | 'extended';
  /** Brings the customer back for service (days until first visit). */
  serviceVisits?: number;
  /** Needs this to be offered. */
  requires?: 'finance' | 'research:advancedfinance' | 'research:loyalty' | 'detailing';
  /** Only with finance (e.g. GAP insurance). */
  financeOnly?: boolean;
  newCarOnly?: boolean;
}

export const PRODUCTS: ProductDef[] = [
  { id: 'warranty', name: '12-month warranty', icon: '🛡️', description: 'Covers mechanical faults for a year. Customers love the peace of mind; you pay the claims.', rate: 0.045, fixed: 0, costShare: 0.4, take: 0.35, affinity: { family: 1.4, senior: 1.5, firsttime: 1.4, bargain: 0.5, enthusiast: 0.6 }, satisfaction: 4, warranty: 'basic' },
  { id: 'extwarranty', name: '36-month extended warranty', icon: '🛡️', description: 'Three years of cover. High margin, higher claims risk on older cars.', rate: 0.075, fixed: 0, costShare: 0.45, take: 0.18, affinity: { family: 1.5, senior: 1.8, luxury: 1.2, business: 1.2, bargain: 0.4 }, satisfaction: 5, warranty: 'extended' },
  { id: 'service', name: 'Service plan', icon: '🛢️', description: 'Pre-paid servicing for two years — and the car comes back to your workshop.', rate: 0, fixed: 390, costShare: 0.44, take: 0.3, affinity: { business: 1.5, family: 1.3, fleet: 1.8, senior: 1.3 }, satisfaction: 2, serviceVisits: 60 },
  { id: 'maintenance', name: 'Maintenance package', icon: '🧰', description: 'Tyres, brakes and wear parts for three years at a fixed monthly price.', rate: 0.012, fixed: 250, costShare: 0.5, take: 0.15, affinity: { business: 1.6, fleet: 2, commuter: 1.3 }, satisfaction: 2, serviceVisits: 45, requires: 'research:loyalty' },
  { id: 'gap', name: 'GAP insurance', icon: '📑', description: 'Pays off the loan if the car is written off. Only with finance.', rate: 0.012, fixed: 150, costShare: 0.35, take: 0.3, affinity: { young: 1.5, firsttime: 1.6, family: 1.2 }, satisfaction: 1, financeOnly: true },
  { id: 'roadside', name: 'Roadside assistance', icon: '🚨', description: 'Breakdown cover for two years. Cheap, popular, pure margin.', rate: 0, fixed: 120, costShare: 0.3, take: 0.4, affinity: { senior: 1.6, family: 1.3, young: 1.2, firsttime: 1.3 }, satisfaction: 1 },
  { id: 'accessory', name: 'Accessory pack', icon: '🎒', description: 'Mats, boot liner, roof bars or a charging cable — whatever suits the car.', rate: 0, fixed: 290, costShare: 0.38, take: 0.3, affinity: { young: 1.4, family: 1.3, suv: 1.4, ev: 1.3 }, satisfaction: 1 },
  { id: 'protection', name: 'Paint & interior protection', icon: '✨', description: 'Ceramic coating and fabric guard, applied before delivery.', rate: 0.006, fixed: 320, costShare: 0.3, take: 0.2, affinity: { luxury: 1.8, prestige: 2, enthusiast: 1.5, bargain: 0.3 }, satisfaction: 2, requires: 'detailing' },
  { id: 'detailpack', name: 'Premium detailing plan', icon: '🧽', description: 'Four professional valets in the first year.', rate: 0, fixed: 260, costShare: 0.45, take: 0.15, affinity: { luxury: 1.6, prestige: 1.8, business: 1.2 }, satisfaction: 2, serviceVisits: 90, requires: 'detailing' },
];
export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p])) as Record<string, ProductDef>;

export interface FinanceKindDef {
  id: FinanceKind;
  name: string;
  icon: string;
  description: string;
  terms: number[];
  /** Share of the price still owed at the end (balloon / lease residual). */
  residual: number;
  /** Dealer commission as a share of the amount financed. */
  commission: number;
  requires?: 'research:advancedfinance';
}

export const FINANCE_KINDS: FinanceKindDef[] = [
  { id: 'cash', name: 'Cash', icon: '💶', description: 'Pays in full. No commission, no approval needed.', terms: [0], residual: 0, commission: 0 },
  { id: 'loan', name: 'Car loan', icon: '🏦', description: 'Classic instalment loan. The customer owns the car at the end.', terms: [24, 36, 48, 60, 72], residual: 0, commission: 0.025 },
  { id: 'balloon', name: 'Balloon finance', icon: '🎈', description: 'Low monthly payments with a big final payment — lets buyers reach a nicer car.', terms: [24, 36, 48], residual: 0.35, commission: 0.03, requires: 'research:advancedfinance' },
  { id: 'lease', name: 'Private lease', icon: '📄', description: 'The lowest monthly payment. The car comes back to you at the end.', terms: [24, 36, 48], residual: 0.5, commission: 0.035, requires: 'research:advancedfinance' },
];
export const FINANCE_BY_ID = Object.fromEntries(FINANCE_KINDS.map((f) => [f.id, f])) as Record<FinanceKind, FinanceKindDef>;

/** Lender panel tiers by finance-desk service level (Company → Services). */
export const LENDER_TIERS = [
  { name: 'No lender', markup: 0, approval: 0, commission: 0 },
  { name: 'Broker panel', markup: 0.025, approval: 0, commission: 1 },
  { name: 'Preferred lender', markup: 0.02, approval: 0.06, commission: 1.2 },
  { name: 'Captive finance', markup: 0.015, approval: 0.12, commission: 1.45 },
];

/** Delivery-experience upgrades a location can switch on (cost per car handed over). */
export const DELIVERY_OPTIONS: { id: 'flowers' | 'photos' | 'welcome' | 'premium'; name: string; icon: string; cost: number; stars: number; loyalty: number; description: string; requires?: string }[] = [
  { id: 'flowers', name: 'Flowers & a card', icon: '💐', cost: 35, stars: 2, loyalty: 0.02, description: 'A bouquet on the passenger seat.' },
  { id: 'photos', name: 'Handover photos', icon: '📸', cost: 20, stars: 2, loyalty: 0.02, description: 'A photo of the proud new owner — shared online, too.' },
  { id: 'welcome', name: 'Welcome pack', icon: '🎁', cost: 60, stars: 3, loyalty: 0.04, description: 'Branded key ring, full tank, first service voucher.' },
  { id: 'premium', name: 'Premium handover', icon: '🥂', cost: 180, stars: 5, loyalty: 0.06, description: 'Covered car, reveal, champagne, a walk-through of every feature.', requires: 'deliveryexp' },
];
