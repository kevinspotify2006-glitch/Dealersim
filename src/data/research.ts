/**
 * The technology tree. One project runs at a time; each one changes a rule
 * of the simulation (the effect text says exactly what).
 */
export type ResearchCategory = 'Sales' | 'Marketing' | 'Finance' | 'Service' | 'EV' | 'Customer Experience' | 'Inventory' | 'Operations' | 'Management' | 'Technology';

export interface ResearchDef {
  id: string;
  name: string;
  icon: string;
  category: ResearchCategory;
  cost: number;
  days: number;
  minLevel: number;
  requires: string[];
  effect: string;
}

export const RESEARCH: ResearchDef[] = [
  // Sales
  { id: 'salesplaybook', name: 'Sales playbook', icon: '📘', category: 'Sales', cost: 6000, days: 6, minLevel: 1, requires: [], effect: 'Salespeople close +5% more deals and customers wait an hour longer for them.' },
  { id: 'crm', name: 'CRM system', icon: '🗂️', category: 'Sales', cost: 12000, days: 8, minLevel: 1, requires: [], effect: 'Client profiles: see preferences and buying cycles. Returning customers come back 30% more often and email campaigns reach twice as many.' },
  { id: 'onlinesales', name: 'Online sales', icon: '🖱️', category: 'Sales', cost: 30000, days: 12, minLevel: 2, requires: ['digitalshowroom'], effect: 'Customers reserve cars online, book test drives and apply for finance before they visit. Reserved cars sell far more often.' },
  { id: 'fleetsales', name: 'Fleet sales desk', icon: '🚐', category: 'Sales', cost: 25000, days: 10, minLevel: 2, requires: ['crm'], effect: 'Unlocks fleet orders from taxi firms, rental companies, builders, couriers, councils and corporates.' },
  // Marketing
  { id: 'digitalshowroom', name: 'Digital showroom', icon: '📲', category: 'Marketing', cost: 14000, days: 8, minLevel: 1, requires: [], effect: '360° photos and video walkarounds: +25% online leads.' },
  { id: 'socialads', name: 'Social advertising', icon: '🤳', category: 'Marketing', cost: 9000, days: 6, minLevel: 1, requires: [], effect: 'Unlocks influencer campaigns; social media campaigns +20% leads.' },
  { id: 'mktanalytics', name: 'Marketing analytics', icon: '📊', category: 'Marketing', cost: 16000, days: 8, minLevel: 2, requires: ['socialads'], effect: 'Every campaign costs 10% less and shows cost per lead and ROI live.' },
  // Finance
  { id: 'advancedfinance', name: 'Advanced finance', icon: '🏦', category: 'Finance', cost: 22000, days: 10, minLevel: 2, requires: [], effect: 'Offer private lease and balloon finance; +0.5% commission on every finance deal.' },
  { id: 'creditscoring', name: 'Credit scoring', icon: '📈', category: 'Finance', cost: 18000, days: 8, minLevel: 2, requires: ['advancedfinance'], effect: 'Approval chance on finance applications +10 points; see each customer\'s credit band.' },
  // Service
  { id: 'servicebooking', name: 'Online service booking', icon: '📅', category: 'Service', cost: 10000, days: 6, minLevel: 1, requires: [], effect: '+30% service bookings; fewer no-shows.' },
  { id: 'techdiag', name: 'Advanced diagnostics', icon: '🩺', category: 'Service', cost: 20000, days: 10, minLevel: 2, requires: ['servicebooking'], effect: 'Inspections find 15% more hidden faults; diagnostic jobs take half the time.' },
  { id: 'certified', name: 'Certified pre-owned programme', icon: '✅', category: 'Service', cost: 24000, days: 10, minLevel: 2, requires: [], effect: 'Certify inspected, serviced and detailed cars: they sell for more and to more people.' },
  // EV
  { id: 'evdiag', name: 'EV diagnostics', icon: '⚡', category: 'EV', cost: 18000, days: 8, minLevel: 1, requires: [], effect: 'Take EV service jobs and check battery health: EV repairs 20% cheaper, EV buyers trust you more.' },
  { id: 'evcharging', name: 'Fast-charging network', icon: '🔌', category: 'EV', cost: 26000, days: 10, minLevel: 2, requires: ['evdiag'], effect: 'Every charger counts double for EV customer demand.' },
  // Customer experience
  { id: 'customerexp', name: 'Customer experience', icon: '😊', category: 'Customer Experience', cost: 12000, days: 7, minLevel: 1, requires: [], effect: 'Waiting customers stay 1 hour longer; +3 satisfaction on every sale.' },
  { id: 'loyalty', name: 'Loyalty programme', icon: '🎟️', category: 'Customer Experience', cost: 20000, days: 10, minLevel: 2, requires: ['crm'], effect: 'Clients return more often for service and their next car; unlocks maintenance packages.' },
  { id: 'deliveryexp', name: 'Delivery experience', icon: '🎁', category: 'Customer Experience', cost: 15000, days: 7, minLevel: 2, requires: ['customerexp'], effect: 'Unlocks the premium handover; every delivery option adds more to reviews.' },
  // Inventory
  { id: 'aipricing', name: 'AI pricing', icon: '🤖', category: 'Inventory', cost: 28000, days: 12, minLevel: 2, requires: ['predictive'], effect: 'Suggested prices use live market data (sharper, +2%); ageing cars are repriced automatically every week.' },
  { id: 'predictive', name: 'Predictive demand', icon: '🔮', category: 'Inventory', cost: 16000, days: 8, minLevel: 1, requires: [], effect: 'Shows which categories and fuels will rise next week; buyers bring more of what is trending.' },
  { id: 'autoinventory', name: 'Automated inventory', icon: '📦', category: 'Inventory', cost: 14000, days: 7, minLevel: 1, requires: [], effect: 'Parts reorder themselves; finished cars are listed automatically without a manager.' },
  // Operations
  { id: 'leanops', name: 'Lean operations', icon: '⚙️', category: 'Operations', cost: 18000, days: 9, minLevel: 2, requires: [], effect: 'Utilities −12%; preparation jobs a day shorter where possible.' },
  { id: 'multibrand', name: 'Multi-brand retailing', icon: '🏷️', category: 'Operations', cost: 40000, days: 14, minLevel: 3, requires: ['fleetsales'], effect: '+1 brand contract slot; manufacturer relationship grows faster.' },
  // Management
  { id: 'hr', name: 'HR academy', icon: '🎓', category: 'Management', cost: 15000, days: 8, minLevel: 1, requires: [], effect: 'Candidates are better; training costs 25% less and takes a day less.' },
  { id: 'groupmgmt', name: 'Group management', icon: '🏛️', category: 'Management', cost: 60000, days: 16, minLevel: 4, requires: ['hr', 'multibrand'], effect: 'Unlocks the group headquarters and regional managers.' },
  // Technology
  { id: 'dms', name: 'Dealer management system', icon: '💻', category: 'Technology', cost: 20000, days: 9, minLevel: 1, requires: [], effect: 'Paperwork in minutes: every salesperson handles 2 more customers a day.' },
  { id: 'telematics', name: 'Connected-car telematics', icon: '📡', category: 'Technology', cost: 32000, days: 12, minLevel: 3, requires: ['servicebooking', 'crm'], effect: 'Cars you sold report when they need service: +40% service visits from clients.' },
];
export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r])) as Record<string, ResearchDef>;
export const RESEARCH_CATEGORIES: ResearchCategory[] = ['Sales', 'Marketing', 'Finance', 'Service', 'EV', 'Customer Experience', 'Inventory', 'Operations', 'Management', 'Technology'];
