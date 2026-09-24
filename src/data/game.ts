// Static game-design data: customers, cities, upgrades, preparation, events, marketing, staff, progression.
import { Archetype, ArchetypeId, Category, City, GameEventDef, IssueSystem, Role, SourceId, Strategy, UpgradeDef } from '../sim/types';

export const ARCHETYPES: Archetype[] = [
  { id: 'budget', name: 'Budget buyer', icon: '🪙', budget: [3000, 11000], bodies: ['Hatchback', 'Sedan', 'Wagon'], categories: ['Economy', 'Compact', 'Family'], fuels: ['Petrol', 'Diesel', 'Hybrid'], maxMileage: 240000, minYearAge: 20, priceSensitivity: 0.9, patience: [2, 4], negotiation: [0.4, 0.8], tradeInChance: 0.35, extrasAffinity: 0.2, weight: 1.3 },
  { id: 'family', name: 'Family buyer', icon: '👨‍👩‍👧', budget: [12000, 34000], bodies: ['Wagon', 'SUV', 'Van', 'Sedan', 'Crossover'], categories: ['Family', 'SUV', 'Van', 'Compact'], fuels: ['Petrol', 'Diesel', 'Hybrid', 'Electric'], maxMileage: 160000, minYearAge: 12, priceSensitivity: 0.65, patience: [3, 5], negotiation: [0.3, 0.6], tradeInChance: 0.55, extrasAffinity: 0.7, weight: 1.2 },
  { id: 'young', name: 'Young driver', icon: '🧢', budget: [5000, 16000], bodies: ['Hatchback', 'Coupe', 'Roadster', 'Convertible', 'Crossover'], categories: ['Economy', 'Compact', 'Sport'], fuels: ['Petrol', 'Hybrid', 'Diesel'], maxMileage: 200000, minYearAge: 16, priceSensitivity: 0.75, patience: [2, 4], negotiation: [0.2, 0.5], tradeInChance: 0.15, extrasAffinity: 0.3, weight: 0.9 },
  { id: 'enthusiast', name: 'Enthusiast', icon: '🏁', budget: [18000, 90000], bodies: ['Coupe', 'Roadster', 'Convertible', 'Sedan'], categories: ['Sport', 'Performance', 'Classic', 'Rare'], fuels: ['Petrol'], maxMileage: 150000, minYearAge: 60, priceSensitivity: 0.4, patience: [3, 6], negotiation: [0.5, 0.9], tradeInChance: 0.35, extrasAffinity: 0.2, weight: 0.55 },
  { id: 'luxury', name: 'Luxury buyer', icon: '💎', budget: [45000, 260000], bodies: ['Sedan', 'SUV', 'Coupe', 'Convertible'], categories: ['Luxury', 'Premium', 'Performance', 'Rare'], fuels: ['Petrol', 'Hybrid', 'Electric', 'Diesel'], maxMileage: 90000, minYearAge: 8, priceSensitivity: 0.25, patience: [2, 4], negotiation: [0.3, 0.7], tradeInChance: 0.5, extrasAffinity: 0.8, weight: 0.35 },
  { id: 'firsttime', name: 'First-time buyer', icon: '🔑', budget: [4000, 12000], bodies: ['Hatchback', 'Sedan', 'Crossover'], categories: ['Economy', 'Compact'], fuels: ['Petrol', 'Hybrid', 'Diesel', 'Electric'], maxMileage: 180000, minYearAge: 15, priceSensitivity: 0.7, patience: [3, 5], negotiation: [0.1, 0.35], tradeInChance: 0.02, extrasAffinity: 0.6, weight: 1.0 },
  { id: 'business', name: 'Business customer', icon: '💼', budget: [20000, 70000], bodies: ['Sedan', 'Wagon', 'Van', 'SUV'], categories: ['Premium', 'Family', 'Van', 'Electric'], fuels: ['Diesel', 'Hybrid', 'Electric'], maxMileage: 120000, minYearAge: 6, priceSensitivity: 0.55, patience: [2, 3], negotiation: [0.5, 0.85], tradeInChance: 0.4, extrasAffinity: 0.6, weight: 0.6 },
  { id: 'suv', name: 'SUV buyer', icon: '🚙', budget: [14000, 60000], bodies: ['SUV', 'Pickup', 'Crossover'], categories: ['SUV', 'Premium', 'Luxury', 'Electric'], fuels: ['Petrol', 'Diesel', 'Hybrid', 'Electric'], maxMileage: 150000, minYearAge: 12, priceSensitivity: 0.55, patience: [3, 5], negotiation: [0.3, 0.7], tradeInChance: 0.5, extrasAffinity: 0.5, weight: 1.0 },
  { id: 'ev', name: 'EV buyer', icon: '⚡', budget: [15000, 70000], bodies: ['Hatchback', 'Sedan', 'SUV', 'Coupe', 'Crossover'], categories: ['Electric'], fuels: ['Electric', 'Hybrid'], maxMileage: 120000, minYearAge: 7, priceSensitivity: 0.55, patience: [3, 5], negotiation: [0.3, 0.6], tradeInChance: 0.45, extrasAffinity: 0.55, weight: 0.6 },
  { id: 'commuter', name: 'Practical commuter', icon: '🚆', budget: [7000, 22000], bodies: ['Hatchback', 'Sedan', 'Wagon', 'Crossover'], categories: ['Economy', 'Compact', 'Family', 'Electric'], fuels: ['Diesel', 'Hybrid', 'Petrol', 'Electric'], maxMileage: 200000, minYearAge: 14, priceSensitivity: 0.7, patience: [2, 5], negotiation: [0.3, 0.6], tradeInChance: 0.4, extrasAffinity: 0.4, weight: 1.2 },
];
export const ARCHETYPE_BY_ID = Object.fromEntries(ARCHETYPES.map(a => [a.id, a])) as Record<ArchetypeId, Archetype>;

export const CITIES: City[] = [
  { id: 'riverton', name: 'Riverton', region: 'Home county', demand: 1.0, competition: 0.35, rent: 1500, openCost: 0, wealth: 1.0, mix: {}, difficulty: 'Easy', blurb: 'Your hometown. Steady, forgiving, lots of commuters.' },
  { id: 'harborview', name: 'Harborview', region: 'Coast', demand: 1.15, competition: 0.5, rent: 3200, openCost: 95000, wealth: 1.15, mix: { family: 1.4, suv: 1.3 }, difficulty: 'Medium', blurb: 'Growing port town with young families and SUV fans.' },
  { id: 'kingsbridge', name: 'Kingsbridge', region: 'Capital', demand: 1.45, competition: 0.75, rent: 7500, openCost: 260000, wealth: 1.45, mix: { luxury: 2.2, business: 1.8, ev: 1.5 }, difficulty: 'Hard', blurb: 'Big money, big competition. Premium and business buyers.' },
  { id: 'millbrook', name: 'Millbrook', region: 'Industrial belt', demand: 0.95, competition: 0.3, rent: 1400, openCost: 60000, wealth: 0.85, mix: { budget: 1.6, commuter: 1.3, business: 1.2 }, difficulty: 'Easy', blurb: 'Cheap rent, budget buyers, lots of vans and diesels.' },
  { id: 'solano', name: 'Solano Bay', region: 'Riviera', demand: 1.2, competition: 0.6, rent: 5200, openCost: 180000, wealth: 1.35, mix: { enthusiast: 2.2, luxury: 1.6, young: 1.2 }, difficulty: 'Medium', blurb: 'Sunshine, cabriolets and collectors.' },
  { id: 'techpark', name: 'Nova Park', region: 'Tech valley', demand: 1.25, competition: 0.55, rent: 4800, openCost: 150000, wealth: 1.3, mix: { ev: 2.6, young: 1.3, business: 1.3 }, difficulty: 'Medium', blurb: 'Tech workers who want electric everything.' },
  { id: 'highmoor', name: 'Highmoor', region: 'Countryside', demand: 0.85, competition: 0.2, rent: 1100, openCost: 50000, wealth: 0.95, mix: { suv: 2.0, family: 1.3 }, difficulty: 'Easy', blurb: 'Farms and villages: pickups, 4x4s and tow bars.' },
  { id: 'grandport', name: 'Grand Port', region: 'Metropolis', demand: 1.7, competition: 0.9, rent: 11000, openCost: 480000, wealth: 1.6, mix: { luxury: 2.0, enthusiast: 1.4, business: 1.6, ev: 1.4 }, difficulty: 'Expert', blurb: 'The national stage. Huge demand, ruthless rivals.' },
];
export const CITY_BY_ID = Object.fromEntries(CITIES.map(c => [c.id, c])) as Record<string, City>;

export const CAPACITY_BY_PARKING = [5, 10, 15, 25, 40, 60, 100, 140];

export const UPGRADES: UpgradeDef[] = [
  { id: 'parking', name: 'Parking & Lot', icon: '🅿️', description: 'More space for stock. Capacity is the hard cap on vehicles at this location.', effect: ['5 vehicles', '10 vehicles', '15 vehicles', '25 vehicles', '40 vehicles', '60 vehicles', '100 vehicles', '140 vehicles'], costs: [4500, 11000, 26000, 55000, 110000, 220000, 420000], minCompanyLevel: [1, 1, 2, 3, 4, 5, 6] },
  { id: 'showroom', name: 'Showroom', icon: '✨', description: 'Indoor display. Raises customer interest and willingness to pay.', effect: ['Open lot', '+4% interest', '+8% interest, +1% price', '+12% interest, +2% price', '+16% interest, +3% price', '+20% interest, +4% price'], costs: [6000, 16000, 38000, 80000, 160000], minCompanyLevel: [1, 2, 3, 4, 5] },
  { id: 'workshop', name: 'Workshop', icon: '🔧', description: 'In-house repairs. Cheaper, faster work and unlocks major repairs.', effect: ['Outsourced (+25% cost)', 'Basic bay (+10% cost)', 'Full bay (list price), major repairs', 'Two lifts (-10% cost, faster)', 'Pro workshop (-20% cost, fastest)'], costs: [7000, 18000, 42000, 90000], minCompanyLevel: [1, 2, 3, 4] },
  { id: 'detailing', name: 'Detailing Bay', icon: '🧽', description: 'Clean and polish in-house. Better presentation for less money.', effect: ['Hand wash only', 'Detailing bay (-15% cost)', 'Paint correction booth (-25%, +quality)', 'Studio (-35%, pro photos free)'], costs: [3500, 12000, 30000], minCompanyLevel: [1, 2, 3] },
  { id: 'lounge', name: 'Customer Lounge', icon: '☕', description: 'Comfortable buyers are patient buyers. Improves satisfaction and patience.', effect: ['Plastic chairs', 'Coffee corner (+1 patience)', 'Lounge (+1 patience, +satisfaction)', 'Premium lounge (+2 patience, ++satisfaction)'], costs: [2500, 9000, 25000], minCompanyLevel: [1, 2, 4] },
  { id: 'office', name: 'Offices', icon: '🏢', description: 'Desk space. Determines how many staff this location can hold.', effect: ['3 staff', '5 staff', '8 staff', '12 staff', '18 staff', '25 staff'], costs: [5000, 14000, 32000, 70000, 140000], minCompanyLevel: [1, 2, 3, 5, 6] },
  { id: 'storage', name: 'Storage Yard', icon: '📦', description: 'Overflow yard for vehicles awaiting preparation.', effect: ['None', '+3 capacity', '+6 capacity', '+10 capacity', '+16 capacity'], costs: [6000, 15000, 34000, 70000], minCompanyLevel: [2, 3, 4, 5] },
  { id: 'equipment', name: 'Diagnostic Equipment', icon: '🩺', description: 'Scanners and lifts. Advanced inspections find more hidden defects.', effect: ['Torch & ears', 'OBD scanner (+15% detection)', 'Full diagnostics (+30%)', 'Dealer-grade (+45%)'], costs: [3000, 11000, 28000], minCompanyLevel: [1, 2, 3] },
  { id: 'marketing', name: 'Digital Marketing', icon: '📣', description: 'Website, photo studio and listing tools. More online leads.', effect: ['Basic listings', '+15% online leads', '+30% online leads', '+50% online leads'], costs: [4000, 14000, 36000], minCompanyLevel: [1, 2, 4] },
  { id: 'finance', name: 'Finance Desk', icon: '🏦', description: 'Offer car finance. Earns commission and raises what buyers can afford.', effect: ['No finance', 'Finance offers (2% commission)', 'Preferred lender (3%, +budget)', 'Captive finance (4%, ++budget)'], costs: [9000, 30000, 75000], minCompanyLevel: [2, 3, 5] },
  { id: 'tradein', name: 'Trade-in Center', icon: '🔄', description: 'More customers bring trade-ins, and you appraise them more accurately.', effect: ['Ad-hoc appraisals', 'Appraisal desk (+trade-ins)', 'Trade-in center (+accuracy)'], costs: [5000, 18000], minCompanyLevel: [2, 3] },
  { id: 'analytics', name: 'Market Analytics', icon: '📈', description: 'Data tools. Reveals customer budgets, demand forecasts and price hints.', effect: ['Gut feeling', 'Price guide (tighter hints)', 'Demand forecasts', 'Predictive pricing (best hints)'], costs: [6000, 20000, 50000], minCompanyLevel: [2, 3, 5] },
];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u])) as Record<string, UpgradeDef>;
export const OFFICE_STAFF = [3, 5, 8, 12, 18, 25];
export const STORAGE_EXTRA = [0, 3, 6, 10, 16];

export interface PrepActionDef {
  id: string;
  name: string;
  icon: string;
  cost: number;           // base cost, scaled for vehicle value tier
  days: number;
  condition: number;      // condition gain
  presentation: number;   // presentation gain (absolute target lift)
  fixes?: IssueSystem[];  // fixes discovered issue in these systems (cost = issue repairCost)
  requiresWorkshop?: number;
  staff: 'mechanic' | 'detailer';
  description: string;
  repeatable?: boolean;
}

export const PREP_ACTIONS: PrepActionDef[] = [
  { id: 'wash', name: 'Basic cleaning', icon: '🫧', cost: 60, days: 0, condition: 0, presentation: 15, staff: 'detailer', description: 'Wash, vacuum, windows. Same day.' },
  { id: 'deepclean', name: 'Deep cleaning', icon: '🧴', cost: 180, days: 1, condition: 1, presentation: 28, staff: 'detailer', description: 'Shampoo seats, engine bay, full interior.' },
  { id: 'detail', name: 'Full detailing', icon: '💎', cost: 420, days: 1, condition: 2, presentation: 45, staff: 'detailer', description: 'Showroom finish inside and out.' },
  { id: 'paint', name: 'Paint correction', icon: '🎨', cost: 650, days: 2, condition: 4, presentation: 30, staff: 'detailer', description: 'Machine polish removes swirls and light scratches.' },
  { id: 'service', name: 'Full service', icon: '🛢️', cost: 320, days: 1, condition: 6, presentation: 0, staff: 'mechanic', description: 'Oil, filters, fluids and a fresh service stamp.' },
  { id: 'tyres', name: 'New tyres', icon: '🛞', cost: 520, days: 0, condition: 5, presentation: 6, staff: 'mechanic', description: 'Four new mid-range tyres.', fixes: ['Tyres'] },
  { id: 'brakes', name: 'Brakes', icon: '🛑', cost: 450, days: 1, condition: 5, presentation: 0, staff: 'mechanic', description: 'Discs and pads all round.', fixes: ['Brakes'] },
  { id: 'cosmetic', name: 'Cosmetic repair', icon: '🩹', cost: 380, days: 1, condition: 5, presentation: 8, staff: 'mechanic', description: 'Dents, kerbed wheels, bumper scuffs.', fixes: ['Body'] },
  { id: 'interior', name: 'Interior repair', icon: '💺', cost: 350, days: 1, condition: 4, presentation: 10, staff: 'detailer', description: 'Seat bolsters, headliner, trim pieces.', fixes: ['Interior'] },
  { id: 'minor', name: 'Minor repair', icon: '🔩', cost: 400, days: 1, condition: 7, presentation: 0, staff: 'mechanic', description: 'Fixes discovered minor faults (electronics, suspension).', fixes: ['Electronics', 'Suspension'] },
  { id: 'major', name: 'Major repair', icon: '⚙️', cost: 1500, days: 3, condition: 14, presentation: 0, staff: 'mechanic', requiresWorkshop: 2, description: 'Gearbox, head gasket, timing chain. Needs a full workshop.', fixes: ['Transmission', 'Engine'] },
  { id: 'photos', name: 'Pro photo shoot', icon: '📸', cost: 90, days: 0, condition: 0, presentation: 0, staff: 'detailer', description: 'Professional photos for online listings (+listing quality).' },
];
export const PREP_BY_ID = Object.fromEntries(PREP_ACTIONS.map(p => [p.id, p])) as Record<string, PrepActionDef>;

export interface IssueTemplate { system: IssueSystem; name: string; severity: 1 | 2 | 3; cost: [number, number]; visible: number; }
export const ISSUE_TEMPLATES: IssueTemplate[] = [
  { system: 'Body', name: 'Dented rear door', severity: 1, cost: [250, 600], visible: 0.9 },
  { system: 'Body', name: 'Rust on sills', severity: 2, cost: [600, 1600], visible: 0.4 },
  { system: 'Body', name: 'Poor previous accident repair', severity: 2, cost: [900, 2600], visible: 0.2 },
  { system: 'Interior', name: 'Torn driver seat', severity: 1, cost: [200, 500], visible: 0.95 },
  { system: 'Interior', name: 'Water leak / damp carpet', severity: 2, cost: [400, 1100], visible: 0.3 },
  { system: 'Tyres', name: 'Worn tyres', severity: 1, cost: [350, 700], visible: 0.8 },
  { system: 'Brakes', name: 'Warped brake discs', severity: 1, cost: [300, 650], visible: 0.35 },
  { system: 'Electronics', name: 'Infotainment fault', severity: 1, cost: [250, 900], visible: 0.4 },
  { system: 'Electronics', name: 'Intermittent ABS sensor', severity: 2, cost: [300, 800], visible: 0.15 },
  { system: 'Suspension', name: 'Worn shock absorbers', severity: 1, cost: [450, 1100], visible: 0.2 },
  { system: 'Suspension', name: 'Broken coil spring', severity: 2, cost: [350, 800], visible: 0.1 },
  { system: 'Engine', name: 'Oil leak', severity: 2, cost: [500, 1400], visible: 0.25 },
  { system: 'Engine', name: 'Timing chain rattle', severity: 3, cost: [1400, 3200], visible: 0.05 },
  { system: 'Engine', name: 'Head gasket failure', severity: 3, cost: [2000, 4800], visible: 0.05 },
  { system: 'Transmission', name: 'Clutch slipping', severity: 2, cost: [900, 1800], visible: 0.2 },
  { system: 'Transmission', name: 'Gearbox mechatronic fault', severity: 3, cost: [1800, 4200], visible: 0.05 },
  { system: 'History', name: 'Clocked mileage', severity: 3, cost: [0, 0], visible: 0.0 },
  { system: 'History', name: 'Missing service history', severity: 1, cost: [0, 0], visible: 0.3 },
];

export interface SourceDef {
  id: SourceId;
  name: string;
  icon: string;
  description: string;
  priceFactor: [number, number];  // purchase price vs apparent value
  issueChance: number;            // base chance for each hidden issue roll
  issueRolls: number;
  conditionSpread: number;        // how much apparent can overstate true condition
  transport: [number, number];
  arrivalDays: [number, number];
  offers: number;                 // offers per refresh
  minLevel: number;
  risk: string;
}

export const SOURCES: SourceDef[] = [
  { id: 'wholesale', name: 'Wholesale', icon: '🏭', description: 'Ex-fleet and lease returns. Fair prices, few surprises.', priceFactor: [0.86, 0.96], issueChance: 0.14, issueRolls: 2, conditionSpread: 4, transport: [150, 350], arrivalDays: [1, 2], offers: 5, minLevel: 1, risk: 'Low' },
  { id: 'private', name: 'Private sellers', icon: '🏠', description: 'Classifieds. Bargains and horror stories in equal measure.', priceFactor: [0.72, 0.95], issueChance: 0.26, issueRolls: 3, conditionSpread: 14, transport: [80, 260], arrivalDays: [1, 2], offers: 5, minLevel: 1, risk: 'Medium' },
  { id: 'auction', name: 'Auctions', icon: '🔨', description: 'Bid against other dealers. Cheap stock, sold as seen.', priceFactor: [0.66, 0.92], issueChance: 0.32, issueRolls: 3, conditionSpread: 18, transport: [200, 450], arrivalDays: [2, 3], offers: 6, minLevel: 2, risk: 'High' },
  { id: 'network', name: 'Dealer network', icon: '🤝', description: 'Premium part-exchanges from franchised dealers. Pricier, very clean.', priceFactor: [0.9, 0.98], issueChance: 0.08, issueRolls: 2, conditionSpread: 3, transport: [250, 600], arrivalDays: [2, 3], offers: 4, minLevel: 4, risk: 'Very low' },
  { id: 'special', name: 'Special auctions', icon: '🏆', description: 'Collector cars and rare metal. Big stakes, big margins.', priceFactor: [0.68, 0.95], issueChance: 0.3, issueRolls: 3, conditionSpread: 15, transport: [600, 1500], arrivalDays: [3, 4], offers: 3, minLevel: 3, risk: 'Very high' },
];
export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map(s => [s.id, s])) as Record<SourceId, SourceDef>;
export const TRADEIN_SOURCE: SourceDef = { id: 'tradein', name: 'Trade-in', icon: '🔄', description: 'Part-exchange from your own customers.', priceFactor: [0.7, 0.9], issueChance: 0.2, issueRolls: 2, conditionSpread: 8, transport: [0, 0], arrivalDays: [0, 0], offers: 0, minLevel: 1, risk: 'Medium' };

export const EVENTS: GameEventDef[] = [
  { id: 'suvboom', name: 'SUV boom', icon: '🚙', description: 'Everyone wants a high seating position. SUV and pickup prices climb.', duration: [20, 40], weight: 1, minDay: 10, category: { SUV: 1.12 }, body: { SUV: 1.35, Pickup: 1.25 } },
  { id: 'evboom', name: 'EV boom', icon: '⚡', description: 'New charging subsidies. Electric demand surges.', duration: [25, 45], weight: 1, minDay: 15, category: { Electric: 1.15 }, fuel: { Electric: 1.4, Hybrid: 1.15 } },
  { id: 'fuelspike', name: 'Fuel price spike', icon: '⛽', description: 'Pump prices jump. Economical cars and EVs are suddenly in favour.', duration: [15, 30], weight: 1, minDay: 8, fuel: { Petrol: 0.92, Diesel: 0.9, Electric: 1.25, Hybrid: 1.2 }, category: { Economy: 1.06, Performance: 0.9 } },
  { id: 'fuelcrash', name: 'Cheap fuel', icon: '🛢️', description: 'Oil prices collapse. Big engines are back.', duration: [15, 30], weight: 0.7, minDay: 20, fuel: { Petrol: 1.06, Diesel: 1.04, Electric: 0.92 }, category: { Performance: 1.1, Sport: 1.08 } },
  { id: 'downturn', name: 'Economic downturn', icon: '📉', description: 'Budgets are tight. Fewer buyers, cheaper stock at auctions.', duration: [25, 45], weight: 0.8, minDay: 30, demand: 0.78, purchasePrice: 0.92, category: { Luxury: 0.9, Performance: 0.9, Economy: 1.05 } },
  { id: 'shortage', name: 'Used-car shortage', icon: '📦', description: 'New-car deliveries delayed. Used values rise, supply is thin.', duration: [20, 40], weight: 0.9, minDay: 20, supply: 0.6, purchasePrice: 1.08, demand: 1.12 },
  { id: 'sportsseason', name: 'Sports car fever', icon: '🏎️', description: 'A hit racing film. Everyone wants something fast.', duration: [14, 28], weight: 0.8, minDay: 12, category: { Sport: 1.18, Performance: 1.12 }, body: { Coupe: 1.2, Roadster: 1.25, Convertible: 1.15 } },
  { id: 'recall', name: 'Manufacturer recall', icon: '⚠️', description: 'A major recall hits one brand. Its values dip while buyers stay away.', duration: [14, 28], weight: 0.9, minDay: 15, special: 'recall' },
  { id: 'competitor', name: 'Competitor opening', icon: '🏪', description: 'A new dealer opens nearby with aggressive launch pricing.', duration: [20, 30], weight: 0.7, minDay: 25, demand: 0.9, special: 'competitor' },
  { id: 'auctionopp', name: 'Fleet dispersal auction', icon: '🔨', description: 'A rental company is dumping its fleet. Extra cheap auction lots this week.', duration: [5, 8], weight: 0.9, minDay: 10, supply: 1.5, purchasePrice: 0.9, special: 'auction' },
  { id: 'localboom', name: 'Local market boom', icon: '🎉', description: 'A new employer moved into town. Foot traffic is up.', duration: [15, 30], weight: 0.9, minDay: 10, demand: 1.3 },
  { id: 'promo', name: 'Manufacturer promotion', icon: '🏷️', description: 'A brand runs new-car incentives, pushing down its used values.', duration: [14, 24], weight: 0.7, minDay: 20, special: 'promotion' },
  { id: 'supplyglut', name: 'Supply glut', icon: '🚛', description: 'Lease returns flood the market. Buy cheap, but selling is harder.', duration: [14, 28], weight: 0.7, minDay: 30, supply: 1.4, purchasePrice: 0.93, demand: 0.93 },
  { id: 'taxbreak', name: 'Green tax break', icon: '🌱', description: 'Company car tax cut for hybrids and EVs.', duration: [30, 50], weight: 0.6, minDay: 40, fuel: { Hybrid: 1.15, Electric: 1.15, Diesel: 0.95 } },
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e])) as Record<string, GameEventDef>;

export interface ChannelDef { id: string; name: string; icon: string; costPerDay: number; days: number; leadBoost: number; reach: string; description: string; minLevel: number; mix?: Partial<Record<ArchetypeId, number>>; }
export const CHANNELS: ChannelDef[] = [
  { id: 'social', name: 'Social media', icon: '📱', costPerDay: 45, days: 7, leadBoost: 0.18, reach: 'Local, young', description: 'Cheap, targeted posts. Attracts young drivers and first-time buyers.', minLevel: 1, mix: { young: 1.8, firsttime: 1.5, ev: 1.2 } },
  { id: 'local', name: 'Local newspaper', icon: '📰', costPerDay: 60, days: 7, leadBoost: 0.2, reach: 'Local, older', description: 'Classic print ads. Families and budget buyers.', minLevel: 1, mix: { family: 1.5, budget: 1.4, commuter: 1.2 } },
  { id: 'listings', name: 'Featured listings', icon: '🌐', costPerDay: 80, days: 7, leadBoost: 0.3, reach: 'Online, regional', description: 'Boosts every vehicle you have listed online.', minLevel: 1 },
  { id: 'radio', name: 'Radio', icon: '📻', costPerDay: 190, days: 10, leadBoost: 0.45, reach: 'Regional', description: 'Broad reach across the region.', minLevel: 2, mix: { commuter: 1.4, business: 1.3 } },
  { id: 'billboard', name: 'Billboards', icon: '🪧', costPerDay: 260, days: 14, leadBoost: 0.5, reach: 'City-wide', description: 'Big, slow burn brand awareness. Also nudges reputation.', minLevel: 3 },
  { id: 'premium', name: 'Premium magazines', icon: '🥂', costPerDay: 420, days: 14, leadBoost: 0.35, reach: 'Affluent', description: 'Glossy placement for luxury and enthusiast buyers.', minLevel: 4, mix: { luxury: 3, enthusiast: 2.5, business: 1.4 } },
];
export const CHANNEL_BY_ID = Object.fromEntries(CHANNELS.map(c => [c.id, c])) as Record<string, ChannelDef>;

export interface RoleDef { id: Role; name: string; icon: string; baseSalary: number; description: string; specializations: string[]; }
export const ROLES: RoleDef[] = [
  { id: 'sales', name: 'Salesperson', icon: '🤝', baseSalary: 2300, description: 'Handles customers you do not serve yourself and improves negotiation outcomes.', specializations: ['Luxury', 'Family', 'EV', 'Sports', 'Closer', 'Trade-ins'] },
  { id: 'mechanic', name: 'Mechanic', icon: '🔧', baseSalary: 2600, description: 'Speeds up repairs, lowers repair cost and finds hidden defects.', specializations: ['Diagnostics', 'Engines', 'EV systems', 'Classics'] },
  { id: 'detailer', name: 'Detailer', icon: '🧽', baseSalary: 1900, description: 'Improves presentation results and cuts detailing time.', specializations: ['Paint', 'Interiors', 'Photography'] },
  { id: 'buyer', name: 'Buyer', icon: '🔎', baseSalary: 2800, description: 'Finds more and cheaper market offers, spots risky cars.', specializations: ['Auctions', 'Private sales', 'Premium', 'Classics'] },
  { id: 'manager', name: 'Manager', icon: '🧭', baseSalary: 3800, description: 'Keeps staff motivated and lets the location run itself (auto-pricing & listing).', specializations: ['Operations', 'People', 'Growth'] },
  { id: 'accountant', name: 'Accountant', icon: '🧮', baseSalary: 3200, description: 'Reduces tax, insurance and loan interest.', specializations: ['Tax', 'Treasury'] },
  { id: 'marketing', name: 'Marketing Specialist', icon: '📣', baseSalary: 2900, description: 'Improves campaign returns and online listing quality.', specializations: ['Social', 'Brand', 'Performance ads'] },
];
export const ROLE_BY_ID = Object.fromEntries(ROLES.map(r => [r.id, r])) as Record<Role, RoleDef>;

export const COMPANY_LEVELS = [
  { level: 1, name: 'Small used-car lot', value: 0, sold: 0, unlocks: ['Wholesale & private sellers', 'Parking, showroom, workshop and lounge building'] },
  { level: 2, name: 'Local dealership', value: 120000, sold: 12, unlocks: ['Auctions', 'Radio ads', 'Finance desk', 'Trade-in desk', 'Market analytics'] },
  { level: 3, name: 'Established dealership', value: 300000, sold: 45, unlocks: ['Second location', 'Special auctions', 'Billboards', 'Turntables, dealer-grade diagnostics, photo studio'] },
  { level: 4, name: 'Large dealership', value: 750000, sold: 120, unlocks: ['Dealer network', 'Premium magazines', 'Bigger plots of land'] },
  { level: 5, name: 'Premium dealership', value: 1800000, sold: 280, unlocks: ['Captive finance', 'Predictive analytics', 'The largest plots'] },
  { level: 6, name: 'Regional dealer group', value: 4500000, sold: 600, unlocks: ['Legacy: sell the company'] },
  { level: 7, name: 'National automotive company', value: 12000000, sold: 1200, unlocks: ['Endgame: dominate Grand Port'] },
];
export const MAX_LOCATIONS_BY_LEVEL = [1, 1, 2, 3, 4, 6, 8];

export const ACHIEVEMENTS: { id: string; name: string; icon: string; description: string }[] = [
  { id: 'firstsale', name: 'First Sale', icon: '🎉', description: 'Sell your first vehicle.' },
  { id: 'tensales', name: 'Getting Rolling', icon: '🚗', description: 'Sell 10 vehicles.' },
  { id: 'value100k', name: '€100K Company', icon: '💶', description: 'Reach a company value of €100,000.' },
  { id: 'sold100', name: 'Century', icon: '💯', description: 'Sell 100 vehicles.' },
  { id: 'value1m', name: '€1M Company', icon: '💰', description: 'Reach a company value of €1,000,000.' },
  { id: 'second', name: 'Second Dealership', icon: '🏬', description: 'Open a second location.' },
  { id: 'customers1000', name: '1000 Customers', icon: '👥', description: 'Welcome 1,000 customers through your doors.' },
  { id: 'perfect', name: 'Perfect Review', icon: '⭐', description: 'Receive a 5-star review.' },
  { id: 'bigdeal', name: 'Biggest Deal', icon: '🤑', description: 'Close a single deal worth €100,000 or more.' },
  { id: 'bestmonth', name: 'Most Profitable Month', icon: '📈', description: 'Make €50,000 profit in a single month.' },
  { id: 'empire', name: 'Automotive Empire', icon: '👑', description: 'Reach company level 7.' },
  { id: 'hire5', name: 'Team Builder', icon: '🧑‍🔧', description: 'Employ 5 staff at once.' },
  { id: 'rarefind', name: 'Barn Find', icon: '🏚️', description: 'Buy a Classic or Rare vehicle.' },
  { id: 'lemon', name: 'Lemon Squeezer', icon: '🍋', description: 'Discover a major hidden defect before selling.' },
  { id: 'debtfree', name: 'Debt Free', icon: '🕊️', description: 'Fully repay a business loan.' },
  { id: 'rep90', name: 'Pillar of the Community', icon: '🏅', description: 'Reach 90 reputation.' },
  { id: 'fleet', name: 'Full House', icon: '🅿️', description: 'Fill a lot to 100% capacity.' },
  { id: 'evspecial', name: 'Charged Up', icon: '🔋', description: 'Sell 25 electric vehicles.' },
  { id: 'legacy', name: 'Legacy', icon: '🏛️', description: 'Sell your company and start a new legacy.' },
];

export const LEGACY_PERKS: { id: string; name: string; description: string; cost: number; max: number }[] = [
  { id: 'capital', name: 'Seed capital', description: '+€25,000 starting cash per level.', cost: 2, max: 5 },
  { id: 'rep', name: 'Known name', description: '+5 starting reputation per level.', cost: 2, max: 4 },
  { id: 'haggler', name: 'Silver tongue', description: '+2% willingness to pay per level.', cost: 3, max: 3 },
  { id: 'eye', name: 'Trained eye', description: '+10% hidden defect detection per level.', cost: 2, max: 3 },
  { id: 'lot', name: 'Bigger first lot', description: 'Start on a bigger plot (38 × 24 m) with extra parking.', cost: 4, max: 1 },
  { id: 'network', name: 'Old contacts', description: 'Buy 3% cheaper from every source per level.', cost: 3, max: 3 },
];

export const CHALLENGES: { id: string; name: string; description: string; cash: number; rep: number; loan?: number; vehicles: number; focus?: string }[] = [
  { id: 'standard', name: 'Standard', description: '€50,000, three cars and one salesperson. The classic start.', cash: 50000, rep: 50, vehicles: 3 },
  { id: 'shoestring', name: 'Shoestring', description: '€20,000 and one tired hatchback. Every euro counts.', cash: 20000, rep: 40, vehicles: 1 },
  { id: 'ev', name: 'Electric pioneer', description: 'EV-focused town, EV-heavy market. Specialise or struggle.', cash: 60000, rep: 50, vehicles: 2, focus: 'Electric' },
  { id: 'luxury', name: 'Borrowed luxury', description: '€40,000 cash plus a €150,000 loan and a premium starter lot.', cash: 40000, rep: 55, loan: 150000, vehicles: 2, focus: 'Luxury' },
];

export const FIRST_NAMES = ['Anna', 'Ben', 'Carla', 'David', 'Eva', 'Finn', 'Grace', 'Hugo', 'Iris', 'Jonas', 'Kira', 'Liam', 'Maya', 'Noah', 'Olga', 'Pieter', 'Quinn', 'Rosa', 'Sam', 'Tessa', 'Umar', 'Vera', 'Wes', 'Xena', 'Yara', 'Zoe', 'Mila', 'Lucas', 'Sofie', 'Daan', 'Emma', 'Milan', 'Julia', 'Sem', 'Nora', 'Levi', 'Lotte', 'Bram', 'Fleur', 'Thijs', 'Amira', 'Karim', 'Mei', 'Ravi', 'Ines', 'Mateo', 'Freya', 'Oskar'];
export const LAST_NAMES = ['de Vries', 'Jansen', 'Bakker', 'Visser', 'Smit', 'Meijer', 'Mulder', 'Bos', 'Vos', 'Peters', 'Hendriks', 'Dekker', 'Brouwer', 'Kramer', 'Novak', 'Rossi', 'Keller', 'Laurent', 'Hughes', 'Okafor', 'Silva', 'Kowalski', 'Nguyen', 'Haddad', 'Berg', 'Lind', 'Moreau', 'Fischer', 'Costa', 'Walsh'];
export const SELLER_NAMES = ['FleetLease Returns', 'Metro Rentals', 'CityCab Co.', 'Autohaus Remarketing', 'Private seller', 'Estate sale', 'Company car pool', 'Northside Motors', 'Lease-End Direct', 'Gov. surplus'];
export const COMPETITOR_NAMES = ['AutoPoint', 'Budget Wheels', 'Prestige Motors', 'CarNation', 'Drive Direct', 'Motor Mile', 'Velocity Cars', 'Green Garage EV', 'Classic & Co.', 'Premier Autos', 'Wheelhouse', 'Carmart Express', 'Luxe Auto Gallery', 'Family Motors'];

export interface StrategyDef {
  id: Strategy;
  name: string;
  icon: string;
  description: string;
  mix: Partial<Record<ArchetypeId, number>>;   // who you attract
  categories?: Category[];                      // what your buyers find for you
  priceBias: number;                            // multiplier on suggested prices
  footfall: number;                             // multiplier on walk-ins
}

export const STRATEGIES: StrategyDef[] = [
  { id: 'balanced', name: 'Balanced', icon: '⚖️', description: 'A bit of everything. No bonuses, no blind spots.', mix: {}, priceBias: 1, footfall: 1 },
  { id: 'budget', name: 'Budget cars', icon: '🪙', description: 'Cheap, cheerful stock. More budget and first-time buyers.', mix: { budget: 1.8, firsttime: 1.6, young: 1.3, luxury: 0.4 }, categories: ['Economy', 'Compact'], priceBias: 0.98, footfall: 1.1 },
  { id: 'volume', name: 'High volume', icon: '📦', description: 'Sharp prices, lots of traffic. Thinner margins.', mix: { commuter: 1.3, family: 1.2 }, priceBias: 0.96, footfall: 1.25 },
  { id: 'margin', name: 'High margin', icon: '💰', description: 'Fewer buyers, but they pay more. Presentation matters.', mix: { luxury: 1.3, business: 1.3, budget: 0.6 }, priceBias: 1.05, footfall: 0.85 },
  { id: 'luxury', name: 'Luxury & premium', icon: '💎', description: 'Premium metal for wealthy buyers.', mix: { luxury: 2.4, business: 1.6, budget: 0.4, firsttime: 0.4 }, categories: ['Luxury', 'Premium'], priceBias: 1.03, footfall: 0.9 },
  { id: 'suv', name: 'SUV & 4x4', icon: '🚙', description: 'High seating positions for families and farmers.', mix: { suv: 2.4, family: 1.4 }, categories: ['SUV', 'Family'], priceBias: 1, footfall: 1 },
  { id: 'ev', name: 'Electric specialist', icon: '⚡', description: 'EVs and hybrids for early adopters.', mix: { ev: 3, business: 1.3 }, categories: ['Electric'], priceBias: 1.02, footfall: 0.95 },
  { id: 'sports', name: 'Sports & classics', icon: '🏁', description: 'Enthusiasts pay for passion, not practicality.', mix: { enthusiast: 3, young: 1.3, family: 0.6 }, categories: ['Sport', 'Performance', 'Classic'], priceBias: 1.04, footfall: 0.85 },
];
export const STRATEGY_BY_ID = Object.fromEntries(STRATEGIES.map((x) => [x.id, x])) as Record<Strategy, StrategyDef>;
