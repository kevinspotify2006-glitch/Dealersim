// Static game-design data: customers, cities, upgrades, preparation, events, marketing, staff, progression.
import { Archetype, ArchetypeId, Category, City, GameEventDef, IssueSystem, Role, SkillId, SourceId, Strategy, UpgradeDef } from '../sim/types';

export const ARCHETYPES: Archetype[] = [
  { id: 'budget', name: 'Budget buyer', icon: '🪙', budget: [3000, 11000], bodies: ['Hatchback', 'Sedan', 'Wagon'], categories: ['Economy', 'Compact', 'Family'], fuels: ['Petrol', 'Diesel', 'Hybrid'], maxMileage: 240000, minYearAge: 20, priceSensitivity: 0.9, patience: [2, 4], negotiation: [0.4, 0.8], tradeInChance: 0.35, extrasAffinity: 0.2, weight: 1.3, age: [19, 72], households: ['single', 'couple', 'retired'], credit: [470, 720], financeShare: 0.35, styles: ['haggler', 'fair'], luxury: 0.05, eco: 0.2, loyalty: 0.3 },
  { id: 'family', name: 'Family buyer', icon: '👨‍👩‍👧', budget: [12000, 34000], bodies: ['Wagon', 'SUV', 'Van', 'Sedan', 'Crossover'], categories: ['Family', 'SUV', 'Van', 'Compact'], fuels: ['Petrol', 'Diesel', 'Hybrid', 'Electric'], maxMileage: 160000, minYearAge: 12, priceSensitivity: 0.65, patience: [3, 5], negotiation: [0.3, 0.6], tradeInChance: 0.55, extrasAffinity: 0.7, weight: 1.2, age: [29, 52], households: ['family'], credit: [560, 800], financeShare: 0.6, styles: ['fair', 'analytical'], luxury: 0.3, eco: 0.4, loyalty: 0.65 },
  { id: 'young', name: 'Young driver', icon: '🧢', budget: [5000, 16000], bodies: ['Hatchback', 'Coupe', 'Roadster', 'Convertible', 'Crossover'], categories: ['Economy', 'Compact', 'Sport'], fuels: ['Petrol', 'Hybrid', 'Diesel'], maxMileage: 200000, minYearAge: 16, priceSensitivity: 0.75, patience: [2, 4], negotiation: [0.2, 0.5], tradeInChance: 0.15, extrasAffinity: 0.3, weight: 0.9, age: [18, 28], households: ['single'], credit: [420, 700], financeShare: 0.55, styles: ['decisive', 'haggler'], luxury: 0.25, eco: 0.35, loyalty: 0.25 },
  { id: 'enthusiast', name: 'Enthusiast', icon: '🏁', budget: [18000, 90000], bodies: ['Coupe', 'Roadster', 'Convertible', 'Sedan'], categories: ['Sport', 'Performance', 'Classic', 'Rare'], fuels: ['Petrol'], maxMileage: 150000, minYearAge: 60, priceSensitivity: 0.4, patience: [3, 6], negotiation: [0.5, 0.9], tradeInChance: 0.35, extrasAffinity: 0.2, weight: 0.55, age: [25, 68], households: ['single', 'couple'], credit: [600, 840], financeShare: 0.3, styles: ['analytical', 'haggler'], luxury: 0.6, eco: 0.05, loyalty: 0.5 },
  { id: 'luxury', name: 'Luxury buyer', icon: '💎', budget: [45000, 260000], bodies: ['Sedan', 'SUV', 'Coupe', 'Convertible'], categories: ['Luxury', 'Premium', 'Performance', 'Rare'], fuels: ['Petrol', 'Hybrid', 'Electric', 'Diesel'], maxMileage: 90000, minYearAge: 8, priceSensitivity: 0.25, patience: [2, 4], negotiation: [0.3, 0.7], tradeInChance: 0.5, extrasAffinity: 0.8, weight: 0.35, age: [35, 72], households: ['couple', 'family', 'business'], credit: [680, 850], financeShare: 0.45, styles: ['decisive', 'fair'], luxury: 0.95, eco: 0.35, loyalty: 0.55 },
  { id: 'firsttime', name: 'First-time buyer', icon: '🔑', budget: [4000, 12000], bodies: ['Hatchback', 'Sedan', 'Crossover'], categories: ['Economy', 'Compact'], fuels: ['Petrol', 'Hybrid', 'Diesel', 'Electric'], maxMileage: 180000, minYearAge: 15, priceSensitivity: 0.7, patience: [3, 5], negotiation: [0.1, 0.35], tradeInChance: 0.02, extrasAffinity: 0.6, weight: 1.0, age: [18, 26], households: ['single'], credit: [380, 650], financeShare: 0.75, styles: ['fair', 'decisive'], luxury: 0.1, eco: 0.3, loyalty: 0.45 },
  { id: 'business', name: 'Business customer', icon: '💼', budget: [20000, 70000], bodies: ['Sedan', 'Wagon', 'Van', 'SUV'], categories: ['Premium', 'Family', 'Van', 'Electric', 'Commercial'], fuels: ['Diesel', 'Hybrid', 'Electric'], maxMileage: 120000, minYearAge: 6, priceSensitivity: 0.55, patience: [2, 3], negotiation: [0.5, 0.85], tradeInChance: 0.4, extrasAffinity: 0.6, weight: 0.6, age: [30, 62], households: ['business'], credit: [640, 830], financeShare: 0.7, styles: ['analytical', 'decisive'], luxury: 0.55, eco: 0.5, loyalty: 0.6 },
  { id: 'suv', name: 'SUV buyer', icon: '🚙', budget: [14000, 60000], bodies: ['SUV', 'Pickup', 'Crossover', 'Offroader'], categories: ['SUV', 'Premium', 'Luxury', 'Electric', 'Offroad'], fuels: ['Petrol', 'Diesel', 'Hybrid', 'Electric'], maxMileage: 150000, minYearAge: 12, priceSensitivity: 0.55, patience: [3, 5], negotiation: [0.3, 0.7], tradeInChance: 0.5, extrasAffinity: 0.5, weight: 1.0, age: [28, 62], households: ['family', 'couple'], credit: [560, 800], financeShare: 0.5, styles: ['fair', 'haggler'], luxury: 0.45, eco: 0.2, loyalty: 0.5 },
  { id: 'ev', name: 'EV buyer', icon: '⚡', budget: [15000, 70000], bodies: ['Hatchback', 'Sedan', 'SUV', 'Coupe', 'Crossover'], categories: ['Electric'], fuels: ['Electric', 'Hybrid'], maxMileage: 120000, minYearAge: 7, priceSensitivity: 0.55, patience: [3, 5], negotiation: [0.3, 0.6], tradeInChance: 0.45, extrasAffinity: 0.55, weight: 0.6, age: [25, 58], households: ['single', 'couple', 'family'], credit: [600, 830], financeShare: 0.55, styles: ['analytical', 'fair'], luxury: 0.5, eco: 0.95, loyalty: 0.55 },
  { id: 'commuter', name: 'Practical commuter', icon: '🚆', budget: [7000, 22000], bodies: ['Hatchback', 'Sedan', 'Wagon', 'Crossover'], categories: ['Economy', 'Compact', 'Family', 'Electric'], fuels: ['Diesel', 'Hybrid', 'Petrol', 'Electric'], maxMileage: 200000, minYearAge: 14, priceSensitivity: 0.7, patience: [2, 5], negotiation: [0.3, 0.6], tradeInChance: 0.4, extrasAffinity: 0.4, weight: 1.2, age: [22, 62], households: ['single', 'couple'], credit: [520, 780], financeShare: 0.5, styles: ['fair', 'analytical'], luxury: 0.15, eco: 0.45, loyalty: 0.45 },
  { id: 'bargain', name: 'Bargain hunter', icon: '🏷️', budget: [2500, 14000], bodies: ['Hatchback', 'Sedan', 'Wagon', 'SUV', 'Crossover', 'Van'], categories: ['Economy', 'Compact', 'Family', 'SUV'], fuels: ['Petrol', 'Diesel', 'Hybrid'], maxMileage: 260000, minYearAge: 22, priceSensitivity: 0.98, patience: [2, 6], negotiation: [0.7, 0.95], tradeInChance: 0.3, extrasAffinity: 0.1, weight: 0.8, age: [25, 72], households: ['single', 'couple', 'family', 'retired'], credit: [450, 720], financeShare: 0.2, styles: ['haggler', 'analytical'], luxury: 0, eco: 0.2, loyalty: 0.2 },
  { id: 'prestige', name: 'Prestige buyer', icon: '👑', budget: [90000, 450000], bodies: ['Sedan', 'Coupe', 'SUV', 'Convertible'], categories: ['Luxury', 'Performance', 'Rare', 'Premium'], fuels: ['Petrol', 'Hybrid', 'Electric'], maxMileage: 40000, minYearAge: 4, priceSensitivity: 0.15, patience: [2, 3], negotiation: [0.2, 0.6], tradeInChance: 0.6, extrasAffinity: 0.9, weight: 0.15, age: [35, 76], households: ['business', 'couple'], credit: [720, 850], financeShare: 0.5, styles: ['decisive'], luxury: 1, eco: 0.3, loyalty: 0.6 },
  { id: 'senior', name: 'Older buyer', icon: '🧓', budget: [9000, 38000], bodies: ['Sedan', 'Wagon', 'Hatchback', 'Crossover', 'SUV'], categories: ['Family', 'Compact', 'Premium', 'SUV'], fuels: ['Petrol', 'Hybrid', 'Diesel'], maxMileage: 120000, minYearAge: 10, priceSensitivity: 0.55, patience: [4, 7], negotiation: [0.3, 0.6], tradeInChance: 0.7, extrasAffinity: 0.8, weight: 0.7, age: [62, 86], households: ['retired', 'couple'], credit: [620, 840], financeShare: 0.15, styles: ['fair'], luxury: 0.4, eco: 0.25, loyalty: 0.85 },
  { id: 'fleet', name: 'Fleet manager', icon: '🚐', budget: [15000, 45000], bodies: ['Van', 'Wagon', 'Sedan', 'Pickup'], categories: ['Van', 'Commercial', 'Family', 'Electric'], fuels: ['Diesel', 'Hybrid', 'Electric'], maxMileage: 120000, minYearAge: 5, priceSensitivity: 0.7, patience: [2, 4], negotiation: [0.6, 0.9], tradeInChance: 0.5, extrasAffinity: 0.7, weight: 0.35, age: [30, 62], households: ['business'], credit: [650, 830], financeShare: 0.8, styles: ['analytical'], luxury: 0.1, eco: 0.5, loyalty: 0.75 },
];
export const ARCHETYPE_BY_ID = Object.fromEntries(ARCHETYPES.map(a => [a.id, a])) as Record<ArchetypeId, Archetype>;

export const CITIES: City[] = [
  { id: 'riverton', name: 'Riverton', region: 'Home county', type: 'town', traffic: 1.0, space: 3, demand: 1.0, competition: 0.35, rent: 1500, openCost: 0, wealth: 1.0, mix: {}, difficulty: 'Easy', blurb: 'Your hometown. Steady, forgiving, lots of commuters.' },
  { id: 'littlebrook', name: 'Little Brook', region: 'Market town', type: 'town', traffic: 0.7, space: 4, demand: 0.75, competition: 0.15, rent: 900, openCost: 40000, wealth: 0.9, mix: { senior: 2.2, family: 1.3, budget: 1.2 }, difficulty: 'Easy', blurb: 'A quiet market town: loyal older buyers, very few rivals, cheap rent.' },
  { id: 'highmoor', name: 'Highmoor', region: 'Countryside', type: 'town', traffic: 0.8, space: 5, demand: 0.85, competition: 0.2, rent: 1100, openCost: 50000, wealth: 0.95, mix: { suv: 2.0, family: 1.3, senior: 1.2 }, difficulty: 'Easy', blurb: 'Farms and villages: pickups, 4x4s and tow bars.' },
  { id: 'millbrook', name: 'Millbrook', region: 'Industrial belt', type: 'industrial', traffic: 0.9, space: 5, demand: 0.95, competition: 0.3, rent: 1400, openCost: 60000, wealth: 0.85, mix: { budget: 1.6, commuter: 1.3, business: 1.2, fleet: 1.5 }, difficulty: 'Easy', blurb: 'Cheap rent, budget buyers, lots of vans and diesels.' },
  { id: 'dockside', name: 'Dockside Works', region: 'Port industry', type: 'industrial', traffic: 0.9, space: 5, demand: 0.95, competition: 0.35, rent: 1700, openCost: 80000, wealth: 0.95, mix: { fleet: 2.4, business: 1.4, budget: 1.3, bargain: 1.2 }, difficulty: 'Easy', blurb: 'Warehouses and haulage firms: vans, pickups and fleet deals.' },
  { id: 'harborview', name: 'Harborview', region: 'Coast', type: 'suburb', traffic: 1.05, space: 4, demand: 1.15, competition: 0.5, rent: 3200, openCost: 95000, wealth: 1.15, mix: { family: 1.4, suv: 1.3 }, difficulty: 'Medium', blurb: 'Growing port town with young families and SUV fans.' },
  { id: 'oakridge', name: 'Oakridge', region: 'Commuter belt', type: 'suburb', traffic: 1.0, space: 4, demand: 1.1, competition: 0.45, rent: 2600, openCost: 120000, wealth: 1.2, mix: { family: 1.8, suv: 1.4, commuter: 1.2, senior: 1.1 }, difficulty: 'Medium', blurb: 'Leafy suburb: family cars, school runs and loyal customers.' },
  { id: 'motorway', name: 'Junction 12 Plaza', region: 'Motorway', type: 'highway', traffic: 1.6, space: 5, demand: 1.15, competition: 0.4, rent: 3000, openCost: 150000, wealth: 1.05, mix: { commuter: 1.5, bargain: 1.6, fleet: 1.3, budget: 1.2 }, difficulty: 'Medium', blurb: 'A huge lot by the motorway: passing trade, bargain hunters and vans.' },
  { id: 'techpark', name: 'Nova Park', region: 'Tech valley', type: 'city', traffic: 1.1, space: 3, demand: 1.25, competition: 0.55, rent: 4800, openCost: 150000, wealth: 1.3, mix: { ev: 2.6, young: 1.3, business: 1.3 }, difficulty: 'Medium', blurb: 'Tech workers who want electric everything.' },
  { id: 'solano', name: 'Solano Bay', region: 'Riviera', type: 'luxury', traffic: 0.95, space: 3, demand: 1.2, competition: 0.6, rent: 5200, openCost: 180000, wealth: 1.35, mix: { enthusiast: 2.2, luxury: 1.6, young: 1.2, prestige: 1.4 }, difficulty: 'Medium', blurb: 'Sunshine, cabriolets and collectors.' },
  { id: 'skyport', name: 'Skyport', region: 'Airport', type: 'airport', traffic: 1.1, space: 4, demand: 1.3, competition: 0.5, rent: 6800, openCost: 260000, wealth: 1.25, mix: { business: 2.2, fleet: 2.5, commuter: 1.2, prestige: 1.2 }, difficulty: 'Hard', blurb: 'Rental fleets, business travellers and company cars.' },
  { id: 'kingsbridge', name: 'Kingsbridge', region: 'Capital', type: 'city', traffic: 1.2, space: 3, demand: 1.45, competition: 0.75, rent: 7500, openCost: 260000, wealth: 1.45, mix: { luxury: 2.2, business: 1.8, ev: 1.5 }, difficulty: 'Hard', blurb: 'Big money, big competition. Premium and business buyers.' },
  { id: 'belmont', name: 'Belmont Heights', region: 'Luxury district', type: 'luxury', traffic: 0.8, space: 2, demand: 1.1, competition: 0.55, rent: 9000, openCost: 380000, wealth: 2.0, mix: { prestige: 3, luxury: 2.5, enthusiast: 1.4, budget: 0.3, bargain: 0.2 }, difficulty: 'Hard', blurb: 'Old money and new millionaires. Tiny plots, enormous prices.' },
  { id: 'grandport', name: 'Grand Port', region: 'Metropolis', type: 'city', traffic: 1.4, space: 4, demand: 1.7, competition: 0.9, rent: 11000, openCost: 480000, wealth: 1.6, mix: { luxury: 2.0, enthusiast: 1.4, business: 1.6, ev: 1.4, prestige: 1.5 }, difficulty: 'Expert', blurb: 'The national stage. Huge demand, ruthless rivals.' },
];

/** How each kind of place plays: walk-in vs online traffic, and what the land is like. */
export const LOCATION_TYPES: Record<NonNullable<City['type']>, { name: string; icon: string; walkIn: number; online: number; service: number; note: string }> = {
  town: { name: 'Small town', icon: '🏘️', walkIn: 0.9, online: 0.8, service: 1.2, note: 'Few customers but loyal ones; service work keeps you busy.' },
  suburb: { name: 'Suburb', icon: '🏡', walkIn: 1.0, online: 1.0, service: 1.1, note: 'Families and commuters; balanced traffic.' },
  city: { name: 'City', icon: '🏙️', walkIn: 1.05, online: 1.3, service: 0.9, note: 'Lots of online shoppers and strong competition; small plots.' },
  industrial: { name: 'Industrial area', icon: '🏭', walkIn: 0.85, online: 0.9, service: 1.3, note: 'Vans, fleets and trade customers; big cheap plots.' },
  luxury: { name: 'Luxury district', icon: '🥂', walkIn: 0.8, online: 1.1, service: 1.0, note: 'Few visitors, very rich ones. Presentation is everything.' },
  airport: { name: 'Airport', icon: '✈️', walkIn: 1.0, online: 1.2, service: 1.1, note: 'Business travellers, rental and fleet deals.' },
  highway: { name: 'Highway', icon: '🛣️', walkIn: 1.45, online: 0.8, service: 0.9, note: 'Huge passing trade; people stop on impulse.' },
};
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
  { id: 'wholesale', name: 'Trade wholesale', icon: '🏭', description: 'Trade stock from remarketing companies. Fair prices, few surprises.', priceFactor: [0.86, 0.96], issueChance: 0.14, issueRolls: 2, conditionSpread: 4, transport: [150, 350], arrivalDays: [1, 2], offers: 5, minLevel: 1, risk: 'Low' },
  { id: 'lease', name: 'Lease returns', icon: '📄', description: '3–5 year old cars back from lease: full service history, predictable condition, fair prices.', priceFactor: [0.91, 0.99], issueChance: 0.08, issueRolls: 2, conditionSpread: 3, transport: [150, 350], arrivalDays: [1, 2], offers: 3, minLevel: 1, risk: 'Very low' },
  { id: 'private', name: 'Private sellers', icon: '🏠', description: 'Classifieds. Bargains and horror stories in equal measure.', priceFactor: [0.72, 0.95], issueChance: 0.26, issueRolls: 3, conditionSpread: 14, transport: [80, 260], arrivalDays: [1, 2], offers: 5, minLevel: 1, risk: 'Medium' },
  { id: 'auction', name: 'Used-car auctions', icon: '🔨', description: 'Bid against other dealers. Cheap stock, sold as seen.', priceFactor: [0.66, 0.92], issueChance: 0.32, issueRolls: 3, conditionSpread: 18, transport: [200, 450], arrivalDays: [2, 3], offers: 6, minLevel: 2, risk: 'High' },
  { id: 'fleet', name: 'Fleet disposals', icon: '🚕', description: 'Ex-taxi, ex-rental and company cars in batches. Cheap, high mileage, honest records.', priceFactor: [0.84, 0.95], issueChance: 0.2, issueRolls: 2, conditionSpread: 5, transport: [150, 300], arrivalDays: [1, 3], offers: 4, minLevel: 2, risk: 'Low' },
  { id: 'manufacturer', name: 'Manufacturer (new)', icon: '🏢', description: 'Brand-new cars at dealer price from the brands you hold a dealer contract for. Small margins, zero risk, factory warranty.', priceFactor: [0.86, 0.92], issueChance: 0, issueRolls: 0, conditionSpread: 0, transport: [250, 450], arrivalDays: [3, 6], offers: 4, minLevel: 2, risk: 'None' },
  { id: 'importer', name: 'Importers', icon: '🚢', description: 'Cars brought in from abroad: cheaper premium metal, import duty, long delivery.', priceFactor: [0.84, 0.95], issueChance: 0.18, issueRolls: 2, conditionSpread: 7, transport: [700, 1400], arrivalDays: [5, 9], offers: 3, minLevel: 3, risk: 'Medium' },
  { id: 'network', name: 'Other dealers', icon: '🤝', description: 'Part-exchanges and surplus stock from franchised dealers. Pricier, very clean.', priceFactor: [0.9, 0.98], issueChance: 0.08, issueRolls: 2, conditionSpread: 3, transport: [250, 600], arrivalDays: [2, 3], offers: 4, minLevel: 4, risk: 'Very low' },
  { id: 'liquidation', name: 'Liquidation auctions', icon: '⚖️', description: 'Stock from bankrupt dealers and repossessions. Very cheap, anything goes.', priceFactor: [0.6, 0.88], issueChance: 0.45, issueRolls: 4, conditionSpread: 20, transport: [150, 400], arrivalDays: [2, 4], offers: 5, minLevel: 3, risk: 'Very high' },
  { id: 'special', name: 'Special auctions', icon: '🏆', description: 'Collector cars and rare metal. Big stakes, big margins.', priceFactor: [0.68, 0.95], issueChance: 0.3, issueRolls: 3, conditionSpread: 15, transport: [600, 1500], arrivalDays: [3, 4], offers: 3, minLevel: 3, risk: 'Very high' },
];
/** Sources where you bid rather than pay a fixed price. */
export const AUCTION_SOURCES: SourceId[] = ['auction', 'special', 'liquidation'];
export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map(s => [s.id, s])) as Record<SourceId, SourceDef>;
export const TRADEIN_SOURCE: SourceDef = { id: 'tradein', name: 'Trade-in', icon: '🔄', description: 'Part-exchange from your own customers.', priceFactor: [0.7, 0.9], issueChance: 0.2, issueRolls: 2, conditionSpread: 8, transport: [0, 0], arrivalDays: [0, 0], offers: 0, minLevel: 1, risk: 'Medium' };

export const EVENTS: GameEventDef[] = [
  { id: 'suvboom', name: 'SUV boom', icon: '🚙', description: 'Everyone wants a high seating position. SUV and pickup prices climb.', duration: [20, 40], weight: 1, minDay: 10, category: { SUV: 1.12, Offroad: 1.1 }, body: { SUV: 1.35, Pickup: 1.25, Offroader: 1.2 } },
  { id: 'evboom', name: 'EV boom', icon: '⚡', description: 'New charging subsidies. Electric demand surges.', duration: [25, 45], weight: 1, minDay: 15, category: { Electric: 1.15 }, fuel: { Electric: 1.4, Hybrid: 1.15 }, economy: { evIncentive: 0.3 } },
  { id: 'fuelspike', name: 'Fuel price spike', icon: '⛽', description: 'Pump prices jump. Economical cars and EVs are suddenly in favour; big SUVs cool off.', duration: [15, 30], weight: 1, minDay: 8, fuel: { Petrol: 0.95, Diesel: 0.93, Electric: 1.1, Hybrid: 1.08 }, category: { Economy: 1.06, Performance: 0.94 }, economy: { fuel: 0.35 } },
  { id: 'fuelcrash', name: 'Cheap fuel', icon: '🛢️', description: 'Oil prices collapse. Big engines are back.', duration: [15, 30], weight: 0.7, minDay: 20, fuel: { Petrol: 1.03, Diesel: 1.02 }, category: { Performance: 1.06, Sport: 1.05 }, economy: { fuel: -0.25 } },
  { id: 'downturn', name: 'Economic downturn', icon: '📉', description: 'Budgets are tight. Fewer buyers, cheaper stock at auctions, more finance declined.', duration: [25, 45], weight: 0.8, minDay: 30, demand: 0.85, purchasePrice: 0.93, category: { Luxury: 0.92, Performance: 0.92, Economy: 1.05 }, economy: { growth: -2.5, confidence: -18 } },
  { id: 'recovery', name: 'Economic recovery', icon: '📈', description: 'Jobs are back, confidence is up. People treat themselves to a better car.', duration: [25, 45], weight: 0.7, minDay: 45, demand: 1.1, category: { Premium: 1.06, Luxury: 1.05 }, economy: { growth: 2, confidence: 15 } },
  { id: 'ratehike', name: 'Interest rate rise', icon: '🏦', description: 'The central bank raises rates. Monthly payments go up and fewer finance deals are approved.', duration: [30, 60], weight: 0.7, minDay: 35, demand: 0.96, economy: { rate: 1.5, confidence: -6 } },
  { id: 'ratecut', name: 'Interest rate cut', icon: '💸', description: 'Cheaper money: finance deals get easier and buyers stretch their budgets.', duration: [30, 60], weight: 0.6, minDay: 50, demand: 1.04, economy: { rate: -1.25, confidence: 5 } },
  { id: 'shortage', name: 'Used-car shortage', icon: '📦', description: 'New-car deliveries delayed. Used values rise, supply is thin.', duration: [20, 40], weight: 0.9, minDay: 20, supply: 0.6, purchasePrice: 1.08, demand: 1.12 },
  { id: 'sportsseason', name: 'Sports car fever', icon: '🏎️', description: 'A hit racing film. Everyone wants something fast.', duration: [14, 28], weight: 0.8, minDay: 12, category: { Sport: 1.18, Performance: 1.12 }, body: { Coupe: 1.2, Roadster: 1.25, Convertible: 1.15 } },
  { id: 'recall', name: 'Manufacturer recall', icon: '⚠️', description: 'A major recall hits one brand. Its values dip while buyers stay away.', duration: [14, 28], weight: 0.9, minDay: 15, special: 'recall' },
  { id: 'competitor', name: 'Competitor opening', icon: '🏪', description: 'A new dealer opens nearby with aggressive launch pricing.', duration: [20, 30], weight: 0.7, minDay: 25, demand: 0.9, special: 'competitor' },
  { id: 'auctionopp', name: 'Fleet dispersal auction', icon: '🔨', description: 'A rental company is dumping its fleet. Extra cheap auction lots this week.', duration: [5, 8], weight: 0.9, minDay: 10, supply: 1.5, purchasePrice: 0.9, special: 'auction' },
  { id: 'localboom', name: 'Local market boom', icon: '🎉', description: 'A new employer moved into town. Foot traffic is up.', duration: [15, 30], weight: 0.9, minDay: 10, demand: 1.3 },
  { id: 'promo', name: 'Manufacturer promotion', icon: '🏷️', description: 'A brand runs new-car incentives, pushing down its used values.', duration: [14, 24], weight: 0.7, minDay: 20, special: 'promotion' },
  { id: 'supplyglut', name: 'Supply glut', icon: '🚛', description: 'Lease returns flood the market. Buy cheap, but selling is harder.', duration: [14, 28], weight: 0.7, minDay: 30, supply: 1.4, purchasePrice: 0.93, demand: 0.93 },
  { id: 'taxbreak', name: 'Green tax break', icon: '🌱', description: 'Company car tax cut for hybrids and EVs.', duration: [30, 50], weight: 0.6, minDay: 40, fuel: { Hybrid: 1.15, Electric: 1.15, Diesel: 0.95 }, economy: { evIncentive: 0.2 } },
  { id: 'lowemission', name: 'Low-emission zone', icon: '🚫', description: 'The city bans older diesels from the centre. Diesel values sink, hybrids and EVs rise.', duration: [40, 70], weight: 0.5, minDay: 60, fuel: { Diesel: 0.84, Hybrid: 1.08, Electric: 1.1 } },
  { id: 'importduty', name: 'Import duty increase', icon: '🛃', description: 'New import tariffs: imported cars and parts cost more.', duration: [30, 60], weight: 0.5, minDay: 50, parts: 1.15, economy: { importCost: 0.18 } },
  { id: 'partsshortage', name: 'Parts shortage', icon: '🔩', description: 'Supply-chain trouble: parts are dear and slow. Stocked-up workshops win.', duration: [15, 30], weight: 0.7, minDay: 25, parts: 1.35 },
  { id: 'evsubsidy', name: 'EV purchase subsidy', icon: '🔌', description: 'The government pays part of every electric car. EV buyers flood the showrooms.', duration: [30, 60], weight: 0.6, minDay: 30, fuel: { Electric: 1.12 }, economy: { evIncentive: 0.45 } },
  { id: 'modellaunch', name: 'New model launch', icon: '🆕', description: 'A brand launches a new generation. Its older used models get cheaper, the brand gets attention.', duration: [20, 35], weight: 0.6, minDay: 25, special: 'promotion' },
  { id: 'holiday', name: 'Holiday season', icon: '🏖️', description: 'Families shop for a bigger car before the summer trip.', duration: [14, 21], weight: 0.6, minDay: 20, category: { Family: 1.08, SUV: 1.05, Van: 1.06 }, body: { Wagon: 1.1 } },
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e])) as Record<string, GameEventDef>;

export interface ChannelDef {
  id: string; name: string; icon: string; costPerDay: number; days: number; leadBoost: number; reach: string; description: string; minLevel: number;
  mix?: Partial<Record<ArchetypeId, number>>;
  online?: number;          // share of its leads that arrive online (0..1)
  rep?: number;             // reputation gained over the campaign
  audience: number;         // people reached per day at budget 1
  requires?: string;        // research needed
  crm?: boolean;            // reaches your existing customers (scales with your client list)
  burst?: boolean;          // everything happens in a few days
}
export const CHANNELS: ChannelDef[] = [
  { id: 'google', name: 'Search ads', icon: '🔎', costPerDay: 70, days: 7, leadBoost: 0.28, reach: 'People searching now', description: 'Pay per click on "used cars near me". The most direct leads: they already want a car.', minLevel: 1, online: 0.8, audience: 900 },
  { id: 'social', name: 'Social media', icon: '📱', costPerDay: 45, days: 7, leadBoost: 0.18, reach: 'Local, young', description: 'Cheap, targeted posts. Attracts young drivers and first-time buyers.', minLevel: 1, mix: { young: 1.8, firsttime: 1.5, ev: 1.2 }, online: 0.6, audience: 2500 },
  { id: 'local', name: 'Flyers & local print', icon: '📬', costPerDay: 60, days: 7, leadBoost: 0.2, reach: 'Local, older', description: 'Door-to-door flyers and the local paper. Families, seniors and budget buyers.', minLevel: 1, mix: { family: 1.5, budget: 1.4, commuter: 1.2, senior: 1.8 }, online: 0.1, audience: 1800 },
  { id: 'listings', name: 'Website & featured listings', icon: '🌐', costPerDay: 80, days: 7, leadBoost: 0.3, reach: 'Online, regional', description: 'Boosts every vehicle you have listed online and your own website.', minLevel: 1, online: 0.9, audience: 1500 },
  { id: 'email', name: 'Email to your customers', icon: '✉️', costPerDay: 12, days: 5, leadBoost: 0.05, reach: 'Your client list', description: 'Offers to people who bought or serviced here before. Cheap and effective — if you have a client list.', minLevel: 1, crm: true, online: 0.5, audience: 0 },
  { id: 'radio', name: 'Radio', icon: '📻', costPerDay: 190, days: 10, leadBoost: 0.45, reach: 'Regional', description: 'Broad reach across the region.', minLevel: 2, mix: { commuter: 1.4, business: 1.3, senior: 1.2 }, online: 0.2, audience: 9000 },
  { id: 'events', name: 'Open day event', icon: '🎈', costPerDay: 650, days: 2, leadBoost: 2.2, reach: 'Local, everyone', description: 'Food truck, balloons and test drives. A weekend of crowds and a reputation bump.', minLevel: 2, rep: 1.5, online: 0, audience: 3000, burst: true },
  { id: 'influencers', name: 'Influencers', icon: '🤳', costPerDay: 240, days: 7, leadBoost: 0.35, reach: 'Young, online', description: 'A car creator features your stock. Big swings: young drivers, enthusiasts and EV fans.', minLevel: 2, mix: { young: 2.2, enthusiast: 1.6, ev: 1.6 }, online: 0.7, audience: 12000, requires: 'socialads' },
  { id: 'billboard', name: 'Billboards', icon: '🪧', costPerDay: 260, days: 14, leadBoost: 0.5, reach: 'City-wide', description: 'Big, slow burn brand awareness. Also nudges reputation.', minLevel: 3, rep: 1, online: 0.25, audience: 15000 },
  { id: 'sponsorship', name: 'Local sponsorship', icon: '⚽', costPerDay: 110, days: 30, leadBoost: 0.12, reach: 'Community', description: 'Shirt sponsor of the local football club. Few leads, steady reputation and loyal locals.', minLevel: 2, rep: 3, mix: { family: 1.3, senior: 1.2 }, online: 0.1, audience: 2500 },
  { id: 'premium', name: 'Premium magazines', icon: '🥂', costPerDay: 420, days: 14, leadBoost: 0.35, reach: 'Affluent', description: 'Glossy placement for luxury and enthusiast buyers.', minLevel: 4, mix: { luxury: 3, enthusiast: 2.5, business: 1.4, prestige: 3 }, online: 0.3, audience: 5000 },
];
export const CHANNEL_BY_ID = Object.fromEntries(CHANNELS.map(c => [c.id, c])) as Record<string, ChannelDef>;

export interface RoleDef { id: Role; name: string; icon: string; baseSalary: number; description: string; specializations: string[]; skill: SkillId; minLevel: number; station: string }
export const ROLES: RoleDef[] = [
  { id: 'sales', name: 'Sales advisor', icon: '🤝', baseSalary: 2300, description: 'Handles customers you do not serve yourself and improves negotiation outcomes.', specializations: ['Luxury', 'Family', 'EV', 'Sports', 'Closer', 'Trade-ins'], skill: 'sales', minLevel: 1, station: 'a sales desk' },
  { id: 'reception', name: 'Receptionist', icon: '🛎️', baseSalary: 1900, description: 'Greets every visitor, keeps waiting customers happy and hands them to the right person.', specializations: ['Hospitality', 'Multilingual', 'Scheduling'], skill: 'service', minLevel: 1, station: 'a reception desk' },
  { id: 'mechanic', name: 'Mechanic', icon: '🔧', baseSalary: 2600, description: 'Speeds up repairs, lowers repair cost, finds hidden defects and does service jobs.', specializations: ['Diagnostics', 'Engines', 'EV systems', 'Classics'], skill: 'technical', minLevel: 1, station: 'a workshop lift' },
  { id: 'detailer', name: 'Detailer', icon: '🧽', baseSalary: 1900, description: 'Improves presentation results and cuts detailing time.', specializations: ['Paint', 'Interiors', 'Photography'], skill: 'speed', minLevel: 1, station: 'a detailing bay' },
  { id: 'cleaner', name: 'Cleaner', icon: '🧹', baseSalary: 1700, description: 'Keeps the showroom and the cars spotless: cars gather dust slower and visitors are happier.', specializations: ['Showroom', 'Vehicles'], skill: 'speed', minLevel: 1, station: 'a cleaning cupboard' },
  { id: 'buyer', name: 'Vehicle buyer', icon: '🔎', baseSalary: 2800, description: 'Buys cars for you: give them a budget and criteria and they search, appraise, haggle and propose deals. Also finds cheaper market offers and spots risky cars.', specializations: ['Auctions', 'Private sales', 'Premium', 'Classics'], skill: 'negotiation', minLevel: 1, station: 'an office desk' },
  { id: 'manager', name: 'Manager', icon: '🧭', baseSalary: 3800, description: 'Keeps staff motivated and lets the location run itself (auto-pricing & listing). Choose a focus: general manager (morale everywhere), sales manager (a stronger sales team) or service manager (a faster workshop).', specializations: ['Operations', 'People', 'Growth'], skill: 'management', minLevel: 1, station: 'an office or manager\'s desk' },
  { id: 'accountant', name: 'Accountant', icon: '🧮', baseSalary: 3200, description: 'Reduces tax, insurance and loan interest.', specializations: ['Tax', 'Treasury'], skill: 'finance', minLevel: 1, station: 'an office desk' },
  { id: 'marketing', name: 'Marketing Specialist', icon: '📣', baseSalary: 2900, description: 'Improves campaign returns and online listing quality.', specializations: ['Social', 'Brand', 'Performance ads'], skill: 'sales', minLevel: 1, station: 'an office desk' },
  { id: 'finance', name: 'F&I specialist', icon: '🏦', baseSalary: 3400, description: 'Structures loans and leases, gets more applications approved and sells protection products.', specializations: ['Leasing', 'Credit repair', 'Insurance'], skill: 'finance', minLevel: 2, station: 'a finance desk' },
  { id: 'advisor', name: 'Service Advisor', icon: '🧾', baseSalary: 2500, description: 'Books service customers, explains the work and sells extra jobs. Keeps the workshop full.', specializations: ['Upselling', 'Fleet accounts', 'Scheduling'], skill: 'service', minLevel: 2, station: 'a service desk' },
  { id: 'technician', name: 'Diagnostic technician', icon: '🛠️', baseSalary: 2900, description: 'Diagnoses faults and services EVs and complex cars, faster than a general mechanic.', specializations: ['EV systems', 'Diagnostics', 'Electronics'], skill: 'technical', minLevel: 2, station: 'a lift or workbench' },
  { id: 'delivery', name: 'Delivery Specialist', icon: '🎁', baseSalary: 2100, description: 'Hands over sold cars in style — better reviews and more repeat customers.', specializations: ['VIP handovers', 'Photography', 'Paperwork'], skill: 'service', minLevel: 2, station: 'a delivery bay' },
  { id: 'security', name: 'Security Guard', icon: '🛡️', baseSalary: 2000, description: 'Deters theft and vandalism and lowers the insurance bill.', specializations: ['Night watch', 'CCTV'], skill: 'speed', minLevel: 2, station: 'a security booth' },
  { id: 'photographer', name: 'Photographer', icon: '📸', baseSalary: 2200, description: 'Shoots every car for sale: better online listings and more online leads; pro photo jobs take half the time.', specializations: ['Studio', 'Outdoor', 'Video'], skill: 'detail', minLevel: 1, station: 'a photo studio' },
  { id: 'prep', name: 'Vehicle prep specialist', icon: '🧰', baseSalary: 2300, description: 'Gets bought cars ready for sale: cleaning, small repairs and cosmetic work go faster and cheaper.', specializations: ['Cosmetic', 'Smart repair', 'Interiors'], skill: 'speed', minLevel: 1, station: 'a workbench or detailing bay' },
  { id: 'admin', name: 'Administration', icon: '🗂️', baseSalary: 2100, description: 'Registrations, invoices and paperwork: lower running costs, faster handovers and fewer mistakes.', specializations: ['Registrations', 'Invoicing', 'Planning'], skill: 'reliability', minLevel: 1, station: 'an office desk' },
  { id: 'procurement', name: 'Procurement manager', icon: '📋', baseSalary: 4200, description: 'Leads your buyers: every buyer at the location searches faster, appraises better and haggles harder.', specializations: ['Remarketing', 'Auctions', 'Import'], skill: 'buying', minLevel: 3, station: 'an office or manager\'s desk' },
  { id: 'inventory', name: 'Inventory Manager', icon: '📦', baseSalary: 3100, description: 'Reprices ageing stock, reorders parts and keeps the lot turning.', specializations: ['Pricing', 'Logistics', 'Parts'], skill: 'management', minLevel: 3, station: 'an office desk' },
];
export const ROLE_BY_ID = Object.fromEntries(ROLES.map(r => [r.id, r])) as Record<Role, RoleDef>;

export const SKILL_NAMES: Record<SkillId, string> = {
  sales: 'Sales', negotiation: 'Negotiation', finance: 'Finance', service: 'Customer service', technical: 'Mechanical knowledge',
  ev: 'EV', luxury: 'Luxury', management: 'Management', speed: 'Speed',
  reliability: 'Reliability', composure: 'Stress resistance', detail: 'Attention to detail', buying: 'Buying', appraisal: 'Appraisal',
};

/** Training courses: each lifts one skill (and the main skill of roles that use it). */
export interface TrainingDef { id: string; name: string; icon: string; skill: SkillId; cost: number; days: number; description: string; roles: Role[] }
export const TRAINING: TrainingDef[] = [
  { id: 'sales', name: 'Sales technique', icon: '🤝', skill: 'sales', cost: 1100, days: 3, description: 'Reading buyers and closing: better prices and more deals.', roles: ['sales', 'marketing'] },
  { id: 'negotiation', name: 'Negotiation', icon: '⚖️', skill: 'negotiation', cost: 1300, days: 3, description: 'Holds margin in a haggle; buyers get better purchase prices.', roles: ['sales', 'buyer'] },
  { id: 'finance', name: 'Finance & compliance', icon: '🏦', skill: 'finance', cost: 1500, days: 4, description: 'More finance approvals and protection products per deal.', roles: ['finance', 'sales', 'accountant'] },
  { id: 'service', name: 'Customer service', icon: '😊', skill: 'service', cost: 900, days: 2, description: 'Happier customers, better reviews, more patience.', roles: ['reception', 'advisor', 'delivery', 'sales'] },
  { id: 'ev', name: 'EV certification', icon: '🔋', skill: 'ev', cost: 1800, days: 4, description: 'Sell and service electric cars. Required by some brands.', roles: ['technician', 'mechanic', 'sales'] },
  { id: 'luxury', name: 'Luxury brand training', icon: '💎', skill: 'luxury', cost: 2000, days: 4, description: 'Handles premium buyers and premium brands. Required by luxury franchises.', roles: ['sales', 'delivery', 'finance'] },
  { id: 'technical', name: 'Technical skills', icon: '🔧', skill: 'technical', cost: 1400, days: 4, description: 'Faster, cheaper workshop jobs and better fault finding.', roles: ['mechanic', 'technician', 'detailer'] },
  { id: 'appraisal', name: 'Appraisal & market knowledge', icon: '🔍', skill: 'appraisal', cost: 1600, days: 3, description: 'Values cars more accurately and spots hidden damage before buying.', roles: ['buyer', 'procurement', 'advisor'] },
  { id: 'buying', name: 'Remarketing & buying', icon: '🏷️', skill: 'buying', cost: 1500, days: 3, description: 'Finds more deals, faster, from more sources.', roles: ['buyer', 'procurement'] },
  { id: 'detail', name: 'Quality & detail', icon: '🔬', skill: 'detail', cost: 1000, days: 2, description: 'Fewer comebacks and better finishing work.', roles: ['mechanic', 'technician', 'detailer', 'prep', 'photographer'] },
  { id: 'resilience', name: 'Resilience coaching', icon: '🧘', skill: 'composure', cost: 900, days: 2, description: 'Handles busy days without burning out.', roles: ['sales', 'reception', 'advisor', 'finance', 'mechanic', 'manager'] },
  { id: 'management', name: 'Leadership', icon: '🧭', skill: 'management', cost: 2200, days: 4, description: 'Better morale and stronger team bonuses.', roles: ['manager', 'inventory'] },
];
export const TRAINING_BY_ID = Object.fromEntries(TRAINING.map((t) => [t.id, t])) as Record<string, TrainingDef>;

export const COMPANY_LEVELS = [
  { level: 1, name: 'Small used-car lot', value: 0, sold: 0, unlocks: ['Wholesale, lease returns & private sellers', 'Building, service jobs and research'] },
  { level: 2, name: 'Established dealer', value: 120000, sold: 12, unlocks: ['Auctions & fleet disposals', 'Dealer contracts (1 brand)', 'Finance managers, service advisors, technicians', 'Radio, open days, sponsorship'] },
  { level: 3, name: 'Large dealer', value: 300000, sold: 45, unlocks: ['Second location', 'Importers & liquidation auctions', 'Fleet contracts', 'Inventory managers', 'Billboards'] },
  { level: 4, name: 'Premium dealer', value: 750000, sold: 120, unlocks: ['Other-dealer network', 'Premium magazines', 'More brand contracts', 'Bigger plots'] },
  { level: 5, name: 'Regional dealer', value: 1800000, sold: 280, unlocks: ['Group headquarters', 'Acquisitions', 'Captive finance'] },
  { level: 6, name: 'Dealer group', value: 4500000, sold: 600, unlocks: ['Regional managers', 'Legacy: sell the company'] },
  { level: 7, name: 'National automotive group', value: 12000000, sold: 1200, unlocks: ['Endgame: dominate every city'] },
];
export const MAX_LOCATIONS_BY_LEVEL = [1, 1, 2, 3, 5, 8, 12];
/** How many brand contracts you can hold at each company level. */
export const MAX_CONTRACTS_BY_LEVEL = [0, 1, 1, 2, 3, 4, 6];

export const ACHIEVEMENTS: { id: string; name: string; icon: string; description: string }[] = [
  { id: 'firstsale', name: 'First Sale', icon: '🎉', description: 'Sell your first vehicle.' },
  { id: 'tensales', name: 'Getting Rolling', icon: '🚗', description: 'Sell 10 vehicles.' },
  { id: 'sold100', name: '100 Cars Sold', icon: '💯', description: 'Sell 100 vehicles.' },
  { id: 'sold500', name: 'Volume King', icon: '📦', description: 'Sell 500 vehicles.' },
  { id: 'sold1000', name: '1000 Cars Sold', icon: '🏁', description: 'Sell 1,000 vehicles.' },
  { id: 'value100k', name: '€100K Company', icon: '💶', description: 'Reach a company value of €100,000.' },
  { id: 'value1m', name: 'Millionaire', icon: '💰', description: 'Reach a company value of €1,000,000.' },
  { id: 'value10m', name: 'Eight Figures', icon: '🏦', description: 'Reach a company value of €10,000,000.' },
  { id: 'second', name: 'Second Dealership', icon: '🏬', description: 'Open a second location.' },
  { id: 'multi', name: 'Multi-location', icon: '🗺️', description: 'Run 4 dealerships at once.' },
  { id: 'empire', name: 'Dealership Empire', icon: '👑', description: 'Reach company level 7.' },
  { id: 'customers1000', name: '1000 Customers', icon: '👥', description: 'Welcome 1,000 customers through your doors.' },
  { id: 'perfect', name: 'Perfect Review', icon: '⭐', description: 'Receive a 5-star review.' },
  { id: 'fivestar50', name: 'Beloved', icon: '🌟', description: 'Collect 50 five-star reviews.' },
  { id: 'rep4', name: 'Four Stars', icon: '✨', description: 'Reach a 4.0-star reputation.' },
  { id: 'rep90', name: 'Pillar of the Community', icon: '🏅', description: 'Reach 90 reputation (4.5 stars).' },
  { id: 'bigdeal', name: 'Biggest Deal', icon: '🤑', description: 'Close a single deal worth €100,000 or more.' },
  { id: 'bestmonth', name: 'Most Profitable Month', icon: '📈', description: 'Make €50,000 profit in a single month.' },
  { id: 'hire5', name: 'Team Builder', icon: '🧑‍🔧', description: 'Employ 5 staff at once.' },
  { id: 'hire25', name: 'Employer', icon: '🏢', description: 'Employ 25 staff at once.' },
  { id: 'fullteam', name: 'Full House Team', icon: '🎽', description: 'Employ 10 different kinds of role.' },
  { id: 'rarefind', name: 'Barn Find', icon: '🏚️', description: 'Buy a Classic or Rare vehicle.' },
  { id: 'lemon', name: 'Lemon Squeezer', icon: '🍋', description: 'Discover a major hidden defect before selling.' },
  { id: 'debtfree', name: 'Debt Free', icon: '🕊️', description: 'Fully repay a business loan.' },
  { id: 'fleet', name: 'Full House', icon: '🅿️', description: 'Fill a lot to 100% capacity.' },
  { id: 'evspecial', name: 'EV Pioneer', icon: '🔋', description: 'Sell 25 electric vehicles.' },
  { id: 'luxurydealer', name: 'Luxury Dealer', icon: '💎', description: 'Sell 25 Luxury or Performance cars.' },
  { id: 'newcar', name: 'Showroom Fresh', icon: '🆕', description: 'Sell a brand-new car from a dealer contract.' },
  { id: 'official', name: 'Official Dealer', icon: '🏢', description: 'Sign your first brand contract.' },
  { id: 'gold', name: 'Gold Partner', icon: '🥇', description: 'Reach Gold tier with a brand.' },
  { id: 'repeat10', name: 'Regulars', icon: '🔁', description: 'Sell to 10 returning customers.' },
  { id: 'financier', name: 'Financier', icon: '🏦', description: 'Close 50 finance deals.' },
  { id: 'certified', name: 'Certified Quality', icon: '✅', description: 'Sell 10 certified pre-owned cars.' },
  { id: 'service100', name: 'Busy Workshop', icon: '🛠️', description: 'Complete 100 service jobs.' },
  { id: 'fleetdeal', name: 'Fleet Contract', icon: '🚐', description: 'Complete a fleet order.' },
  { id: 'research5', name: 'Innovator', icon: '🧪', description: 'Finish 5 research projects.' },
  { id: 'researchall', name: 'Future Proof', icon: '🚀', description: 'Finish every research project.' },
  { id: 'hq', name: 'Headquarters', icon: '🏛️', description: 'Open a group headquarters.' },
  { id: 'acquirer', name: 'Takeover', icon: '🤝', description: 'Acquire a competing dealership.' },
  { id: 'online10', name: 'Click & Drive', icon: '🖱️', description: 'Sell 10 cars through online reservations.' },
  { id: 'testdrive100', name: 'Keys Please', icon: '🗝️', description: 'Take customers on 100 test drives.' },
  { id: 'decisions20', name: 'Decision Maker', icon: '🧠', description: 'Handle 20 business decisions.' },
  { id: 'missions10', name: 'Mission Driven', icon: '🎯', description: 'Complete 10 missions.' },
  { id: 'nodebt1m', name: 'Cash Rich', icon: '🪙', description: 'Hold €1,000,000 in cash.' },
  { id: 'legacy', name: 'Legacy', icon: '🏛️', description: 'Sell your company and start a new legacy.' },
];
export const LEGACY_PERKS: { id: string; name: string; description: string; cost: number; max: number }[] = [
  { id: 'capital', name: 'Seed capital', description: '+€25,000 starting cash per level.', cost: 2, max: 5 },
  { id: 'rep', name: 'Known name', description: '+5 starting reputation per level.', cost: 2, max: 4 },
  { id: 'haggler', name: 'Silver tongue', description: '+2% willingness to pay per level.', cost: 3, max: 3 },
  { id: 'eye', name: 'Trained eye', description: '+10% hidden defect detection per level.', cost: 2, max: 3 },
  { id: 'lot', name: 'Bigger first lot', description: 'Start on a bigger plot (38 × 24 m) with extra parking.', cost: 4, max: 1 },
  { id: 'network', name: 'Old contacts', description: 'Buy 3% cheaper from every source per level.', cost: 3, max: 3 },
  { id: 'research', name: 'Head start', description: 'Start with one research project finished per level.', cost: 2, max: 3 },
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
  { id: 'budget', name: 'Budget cars', icon: '🪙', description: 'Cheap, cheerful stock. More budget and first-time buyers.', mix: { budget: 1.8, firsttime: 1.6, young: 1.3, bargain: 1.4, luxury: 0.4, prestige: 0.2 }, categories: ['Economy', 'Compact'], priceBias: 0.98, footfall: 1.1 },
  { id: 'volume', name: 'High volume', icon: '📦', description: 'Sharp prices, lots of traffic. Thinner margins.', mix: { commuter: 1.3, family: 1.2, bargain: 1.3 }, priceBias: 0.96, footfall: 1.25 },
  { id: 'used', name: 'Used-car specialist', icon: '🔧', description: 'Older, cheaper cars with bigger margins — and more risk. Bargain hunters love you.', mix: { bargain: 2, budget: 1.5, young: 1.2, prestige: 0.3 }, categories: ['Economy', 'Compact', 'Family'], priceBias: 1.03, footfall: 1.05 },
  { id: 'family', name: 'Family dealer', icon: '👨‍👩‍👧', description: 'Estates, SUVs and vans for families. Loyal customers who come back.', mix: { family: 2.2, senior: 1.3, suv: 1.3, young: 0.7 }, categories: ['Family', 'SUV', 'Van'], priceBias: 1, footfall: 1.05 },
  { id: 'margin', name: 'High margin', icon: '💰', description: 'Fewer buyers, but they pay more. Presentation matters.', mix: { luxury: 1.3, business: 1.3, budget: 0.6, bargain: 0.4 }, priceBias: 1.05, footfall: 0.85 },
  { id: 'premium', name: 'Premium dealer', icon: '🥈', description: 'Near-new premium cars, immaculate showroom, high service.', mix: { luxury: 1.6, business: 1.5, senior: 1.1, bargain: 0.3, budget: 0.4 }, categories: ['Premium', 'Luxury', 'Electric'], priceBias: 1.04, footfall: 0.9 },
  { id: 'luxury', name: 'Luxury & prestige', icon: '💎', description: 'Premium metal for wealthy buyers.', mix: { luxury: 2.4, business: 1.6, prestige: 2, budget: 0.4, firsttime: 0.4, bargain: 0.2 }, categories: ['Luxury', 'Premium'], priceBias: 1.03, footfall: 0.9 },
  { id: 'suv', name: 'SUV & 4x4', icon: '🚙', description: 'High seating positions for families and farmers.', mix: { suv: 2.4, family: 1.4 }, categories: ['SUV', 'Family', 'Offroad'], priceBias: 1, footfall: 1 },
  { id: 'ev', name: 'EV specialist', icon: '⚡', description: 'EVs and hybrids for early adopters.', mix: { ev: 3, business: 1.3 }, categories: ['Electric'], priceBias: 1.02, footfall: 0.95 },
  { id: 'sports', name: 'Sports & classics', icon: '🏁', description: 'Enthusiasts pay for passion, not practicality.', mix: { enthusiast: 3, young: 1.3, family: 0.6 }, categories: ['Sport', 'Performance', 'Classic'], priceBias: 1.04, footfall: 0.85 },
  { id: 'performance', name: 'Performance dealer', icon: '🏎️', description: 'Fast, loud and expensive. Prestige buyers and petrolheads.', mix: { enthusiast: 2.5, prestige: 1.6, luxury: 1.2, family: 0.5, bargain: 0.3 }, categories: ['Performance', 'Sport'], priceBias: 1.05, footfall: 0.8 },
];
export const STRATEGY_BY_ID = Object.fromEntries(STRATEGIES.map((x) => [x.id, x])) as Record<Strategy, StrategyDef>;
