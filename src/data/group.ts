/**
 * Late game: fleet customers, the group headquarters and its departments.
 */
import type { BodyType, Category, FleetSector } from '../sim/types';

export interface FleetSectorDef {
  id: FleetSector;
  name: string;
  icon: string;
  clients: string[];
  categories: Category[];
  bodies: BodyType[];
  qty: [number, number];
  maxUnit: [number, number];
  discount: [number, number];
  days: [number, number];
  service: number;               // monthly service revenue per car under contract
  description: string;
}

export const FLEET_SECTORS: FleetSectorDef[] = [
  { id: 'taxi', name: 'Taxi', icon: '🚕', clients: ['CityCab Co.', 'Metro Taxis', 'Blue Line Cabs', 'Airport Shuttle Ltd.'], categories: ['Family', 'Compact', 'Electric'], bodies: ['Sedan', 'Wagon', 'Hatchback', 'Crossover'], qty: [3, 8], maxUnit: [14000, 32000], discount: [0.04, 0.08], days: [10, 20], service: 45, description: 'Reliable saloons and estates; hybrids and EVs preferred.' },
  { id: 'rental', name: 'Rental', icon: '🔑', clients: ['Sunny Rentals', 'EuroDrive Hire', 'QuickCar Rental', 'Skyport Car Hire'], categories: ['Economy', 'Compact', 'Family', 'SUV'], bodies: ['Hatchback', 'Sedan', 'Crossover', 'SUV', 'Wagon'], qty: [4, 12], maxUnit: [10000, 28000], discount: [0.05, 0.1], days: [12, 24], service: 30, description: 'Big batches of young, cheap-to-run cars.' },
  { id: 'construction', name: 'Construction', icon: '🏗️', clients: ['Hartley Builders', 'Stonegate Civils', 'BuildRight Group', 'Northside Roofing'], categories: ['Commercial', 'Van', 'Offroad'], bodies: ['Pickup', 'Van', 'Offroader'], qty: [2, 6], maxUnit: [18000, 48000], discount: [0.03, 0.07], days: [12, 25], service: 60, description: 'Pickups and vans that can take a beating.' },
  { id: 'delivery', name: 'Delivery', icon: '📦', clients: ['ParcelPoint', 'SwiftCourier', 'GreenMile Logistics', 'Metro Deliveries'], categories: ['Van', 'Commercial', 'Electric'], bodies: ['Van'], qty: [3, 10], maxUnit: [16000, 45000], discount: [0.04, 0.08], days: [10, 20], service: 55, description: 'Vans — electric ones win extra points in the city.' },
  { id: 'government', name: 'Government', icon: '🏛️', clients: ['County Council', 'City Police Fleet', 'Parks Department', 'Health Trust'], categories: ['Family', 'SUV', 'Electric', 'Van'], bodies: ['Wagon', 'SUV', 'Van', 'Sedan', 'Crossover'], qty: [2, 7], maxUnit: [18000, 42000], discount: [0.06, 0.1], days: [15, 30], service: 50, description: 'Tenders with strict budgets and long, loyal contracts.' },
  { id: 'corporate', name: 'Corporate', icon: '🏢', clients: ['Northstar Consulting', 'Helios Energy', 'Bright Pharma', 'Atlas Insurance'], categories: ['Premium', 'Luxury', 'Electric', 'Family'], bodies: ['Sedan', 'SUV', 'Wagon', 'Crossover'], qty: [2, 5], maxUnit: [30000, 80000], discount: [0.03, 0.06], days: [12, 25], service: 70, description: 'Company cars for managers: premium brands, low mileage.' },
];
export const FLEET_BY_ID = Object.fromEntries(FLEET_SECTORS.map((f) => [f.id, f])) as Record<FleetSector, FleetSectorDef>;

export interface DepartmentDef { id: string; name: string; icon: string; costs: number[]; monthly: number[]; effect: string[]; description: string }

export const DEPARTMENTS: DepartmentDef[] = [
  { id: 'inventory', name: 'Central inventory', icon: '📦', costs: [80000, 180000], monthly: [3000, 6000], effect: ['Transfers between your dealerships are free and arrive next morning', 'Plus: buyers source for every location (+20% offers)'], description: 'One stock pool for the whole group.' },
  { id: 'marketing', name: 'Central marketing', icon: '📣', costs: [70000, 160000], monthly: [2500, 5000], effect: ['Campaigns cost 15% less', 'Every campaign also boosts every other location by a third'], description: 'One brand, one media budget.' },
  { id: 'hr', name: 'HR department', icon: '🧑‍💼', costs: [60000, 140000], monthly: [2500, 5000], effect: ['Hiring fees halved; candidates +8 skill', 'Staff morale +5 group-wide'], description: 'Recruitment, training and retention.' },
  { id: 'finance', name: 'Group finance', icon: '🏦', costs: [90000, 200000], monthly: [3500, 7000], effect: ['Loan rates −0.8 points; tax −5%', 'Plus: captive-finance commission +15%'], description: 'Treasury, tax and lender negotiations.' },
  { id: 'service', name: 'Service network', icon: '🛠️', costs: [80000, 170000], monthly: [3000, 6000], effect: ['Parts 12% cheaper; +20% service bookings', 'Plus: service jobs 15% faster'], description: 'Shared parts buying and one booking system.' },
];
export const DEPARTMENT_BY_ID = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d])) as Record<string, DepartmentDef>;

export const HQ_COST = 250000;
export const HQ_MONTHLY = 6000;

/** Brand positioning: the promise on your signs. Each draws its own kind of buyer to every location. */
export const BRAND_POSITIONS: { id: string; tagline: string; description: string; mix: Partial<Record<import('../sim/types').ArchetypeId, number>> }[] = [
  { id: 'honest', tagline: 'Quality cars, honest prices', description: 'Balanced. Nobody is put off.', mix: {} },
  { id: 'family', tagline: 'Family cars you can trust', description: 'More families and seniors; fewer sports-car buyers.', mix: { family: 1.3, senior: 1.2, enthusiast: 0.85, young: 0.9 } },
  { id: 'value', tagline: 'Great cars. Low prices.', description: 'More budget and first-time buyers; fewer luxury buyers.', mix: { budget: 1.35, firsttime: 1.25, luxury: 0.75, prestige: 0.6 } },
  { id: 'electric', tagline: 'The future is electric', description: 'More EV and commuter buyers; fewer classic fans.', mix: { ev: 1.5, commuter: 1.15, enthusiast: 0.9 } },
  { id: 'performance', tagline: 'For people who love driving', description: 'More enthusiasts and young drivers; fewer families.', mix: { enthusiast: 1.45, young: 1.2, family: 0.85 } },
  { id: 'luxury', tagline: 'Luxury, perfected', description: 'More luxury, prestige and business buyers; fewer budget buyers.', mix: { luxury: 1.4, prestige: 1.4, business: 1.2, budget: 0.7, firsttime: 0.8 } },
  { id: 'business', tagline: 'Mobility for business', description: 'More business and fleet customers.', mix: { business: 1.4, fleet: 1.5, young: 0.85 } },
];
export const BRAND_COLORS = ['#ff7a1a', '#3cc7ff', '#2fd18b', '#ffc233', '#e74c3c', '#9b8cff', '#eef1f4', '#1f6feb'];
export const BRAND_LOGOS = ['🚗', '🏁', '⚡', '🦁', '🦅', '⭐', '🔰', '💎', '🛞', '🏎️'];
/** A rebrand across every location: new signs, new adverts. */
export const REBRAND_COST_PER_LOCATION = 4000;
