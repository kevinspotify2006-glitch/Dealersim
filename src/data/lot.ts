/**
 * The physical dealership catalogue: land, zones (rooms/areas), placeable
 * objects, visual styles and what every effect does in the game.
 *
 * One tile is roughly one metre. A parking space is 3×5 tiles, a showroom
 * display pad 4×6 — so a car physically fits where it is shown.
 *
 * Everything the build menu, the tooltips and the simulation know about an
 * object comes from here: add an entry and it is buildable, searchable,
 * explained and has its effect.
 */
import type { Role, ZoneCode } from '../sim/types';

export interface ZoneDef {
  code: ZoneCode;
  id: string;
  name: string;
  icon: string;
  costPerTile: number;
  indoor: boolean;
  customers: boolean;           // customers may walk here
  color: string;                // base floor colour on the map
  description: string;
}

export const ZONES: ZoneDef[] = [
  { code: 'a', id: 'lot', name: 'Car lot (asphalt)', icon: '🅿️', costPerTile: 14, indoor: false, customers: true, color: '#2c3036', description: 'Outdoor paving for parking spaces, walkways and the entrance.' },
  { code: 'x', id: 'walkway', name: 'Walkway (paving)', icon: '🧱', costPerTile: 18, indoor: false, customers: true, color: '#6b6258', description: 'Paved footpath. Looks tidy and gives customers a clear route.' },
  { code: 's', id: 'showroom', name: 'Showroom', icon: '✨', costPerTile: 55, indoor: true, customers: true, color: '#c9ced6', description: 'Indoor display hall. Cars shown here get more interest and higher offers.' },
  { code: 'r', id: 'reception', name: 'Reception', icon: '🛎️', costPerTile: 40, indoor: true, customers: true, color: '#b9a88f', description: 'Greets customers. A reception desk here makes people wait longer and happier.' },
  { code: 'l', id: 'lounge', name: 'Customer lounge', icon: '☕', costPerTile: 40, indoor: true, customers: true, color: '#8a6a4a', description: 'Where customers wait. Sofas and coffee raise satisfaction and patience.' },
  { code: 'b', id: 'toilets', name: 'Toilets', icon: '🚻', costPerTile: 60, indoor: true, customers: true, color: '#a8c4cc', description: 'Customer toilets. Facilities keep people comfortable while they decide.' },
  { code: 'v', id: 'service', name: 'Service reception', icon: '🧾', costPerTile: 40, indoor: true, customers: true, color: '#8f9aa6', description: 'Where customers drop off and collect cars for work. Service desks here raise service capacity.' },
  { code: 'f', id: 'financeoffice', name: 'Finance office', icon: '🏦', costPerTile: 45, indoor: true, customers: true, color: '#4f6b5a', description: 'A quiet room for finance paperwork. Finance desks here close more applications.' },
  { code: 'e', id: 'delivery', name: 'Delivery area', icon: '🎁', costPerTile: 50, indoor: true, customers: true, color: '#6f6497', description: 'Where customers collect their new car. A delivery bay here makes every handover special.' },
  { code: 'o', id: 'office', name: 'Office', icon: '🏢', costPerTile: 35, indoor: true, customers: false, color: '#51606f', description: 'Desks for buyers, accountants and marketing staff.' },
  { code: 'm', id: 'manager', name: 'Manager office', icon: '👔', costPerTile: 45, indoor: true, customers: false, color: '#5b5470', description: 'A private office. A manager’s desk here improves management and morale.' },
  { code: 'k', id: 'staffroom', name: 'Staff room', icon: '🍽️', costPerTile: 30, indoor: true, customers: false, color: '#6d6a52', description: 'Break room for the team. Lockers and a kitchen keep morale up.' },
  { code: 'w', id: 'workshop', name: 'Workshop', icon: '🔧', costPerTile: 45, indoor: true, customers: false, color: '#5d6168', description: 'Repair bays. Each lift is a place where a mechanic can fix a car.' },
  { code: 'd', id: 'detailing', name: 'Detailing / car wash', icon: '🧽', costPerTile: 40, indoor: true, customers: false, color: '#3f5d6e', description: 'Cleaning and paint correction. Each detailing bay holds one car.' },
  { code: 'p', id: 'parts', name: 'Parts store', icon: '📦', costPerTile: 30, indoor: true, customers: false, color: '#5a5048', description: 'Shelving for parts and tyres. Makes the workshop faster and cheaper.' },
  { code: 't', id: 'storage', name: 'Storage yard', icon: '🚧', costPerTile: 12, indoor: false, customers: false, color: '#4a4538', description: 'Cheap fenced parking for cars waiting for work. Customers never see it.' },
  { code: 'j', id: 'road', name: 'Road & driveway', icon: '🛣️', costPerTile: 20, indoor: false, customers: true, color: '#26292e', description: 'A drivable road on your land: service and delivery traffic, test-drive exits and a clear route for visitors.' },
  { code: 'q', id: 'testdrive', name: 'Test-drive centre', icon: '🗝️', costPerTile: 50, indoor: true, customers: true, color: '#3d5a6e', description: 'A dedicated room for test drives: check-in, key handover and a lounge. A check-in desk here makes every test drive better.' },
  { code: 'n', id: 'marketingroom', name: 'Marketing studio', icon: '📣', costPerTile: 40, indoor: true, customers: false, color: '#6a4f7a', description: 'Where campaigns are made. A marketing desk here makes every campaign bring more leads.' },
  { code: 'u', id: 'training', name: 'Training room', icon: '🎓', costPerTile: 38, indoor: true, customers: false, color: '#4f6a7a', description: 'Screens and desks for courses. Staff training finishes sooner.' },
  { code: 'g', id: 'grass', name: 'Landscaping', icon: '🌳', costPerTile: 3, indoor: false, customers: true, color: '#2f5a3a', description: 'Grass and planting. Curb appeal brings passers-by in.' },
  { code: '.', id: 'bare', name: 'Bare land', icon: '🟫', costPerTile: 0, indoor: false, customers: true, color: '#3b342c', description: 'Undeveloped ground. Paint zones on it to build.' },
];
export const ZONE_BY_CODE = Object.fromEntries(ZONES.map((z) => [z.code, z])) as Record<ZoneCode, ZoneDef>;

/** `floor` is a car standing loose on open floor (placed by hand, not in a marked space). */
export type SlotKind = 'parking' | 'display' | 'storage' | 'lift' | 'bay' | 'floor';

export type EffectKey = 'appeal' | 'decor' | 'lighting' | 'curb' | 'footfall' | 'lounge' | 'satisfaction' | 'facilities' | 'sales' | 'management'
  | 'service' | 'workshop' | 'detailing' | 'equipment' | 'reception' | 'photo' | 'ev' | 'security' | 'visitorParking' | 'morale' | 'finance'
  | 'testdrive' | 'marketing' | 'training' | 'logistics' | 'wayfinding';

/**
 * What each effect does. `cap` is where extra points stop helping; `per`
 * describes one point. The simulation reads the same keys (sim/lot.ts
 * lotStats → effects; used in customers, sales, staff, finance, vehicles).
 */
export const EFFECTS: Record<EffectKey, { label: string; per: string; cap?: number }> = {
  appeal: { label: 'Showroom appeal', per: 'raises the showroom level (more interest, better offers)' },
  decor: { label: 'Decor', per: 'raises the showroom level when placed in the showroom' },
  lighting: { label: 'Lighting', per: 'raises the showroom level when placed in the showroom' },
  curb: { label: 'Curb appeal', per: '+2.5% walk-ins per point', cap: 8 },
  footfall: { label: 'Foot traffic', per: '+7% walk-ins per point', cap: 3 },
  lounge: { label: 'Comfort', per: 'raises the lounge level: customers wait longer and leave happier' },
  satisfaction: { label: 'Customer satisfaction', per: '+1 review score per point', cap: 12 },
  facilities: { label: 'Facilities', per: '+1.5 review score per point; 2+ points keep people an hour longer', cap: 4 },
  sales: { label: 'Sales efficiency', per: '+1% sales skill for staff deals and your coaching', cap: 25 },
  management: { label: 'Management', per: '+0.3 staff morale per day per point', cap: 5 },
  service: { label: 'Service capacity', per: '−3% prep cost per point; every 2 points = 1 extra outsourced job a day', cap: 5 },
  workshop: { label: 'Workshop', per: 'raises the workshop level: cheaper, faster repairs, major repairs at level 2' },
  detailing: { label: 'Detailing', per: 'raises the detailing level: cheaper, better cleaning' },
  equipment: { label: 'Diagnostics', per: '+15% chance to find hidden faults per level', cap: 3 },
  reception: { label: 'Reception', per: 'customers wait an hour longer; better customer flow' },
  photo: { label: 'Photo studio', per: 'professional listing photos for free' },
  ev: { label: 'EV charging', per: 'electric cars on this lot sell for ~2% more; more EV buyers visit (+8% each, max 3)' },
  security: { label: 'Security', per: '−4% insurance on your stock per point', cap: 6 },
  visitorParking: { label: 'Visitor parking', per: 'room for 4 more visiting customers a day before traffic gets turned away' },
  morale: { label: 'Staff morale', per: '+0.25 morale per day per point', cap: 6 },
  finance: { label: 'Finance take-up', per: '+3% chance buyers take finance through you', cap: 5 },
  testdrive: { label: 'Test-drive facilities', per: 'customers like test drives more (+0.6% interest per point) and new routes unlock', cap: 10 },
  marketing: { label: 'Marketing power', per: '+6% leads from every campaign per point', cap: 5 },
  training: { label: 'Training', per: 'staff courses finish faster (a day saved now and then per point)', cap: 4 },
  logistics: { label: 'Logistics', per: '−8% transport cost per point; 2+ points: bought cars arrive a day sooner', cap: 3 },
  wayfinding: { label: 'Wayfinding', per: '+2% customer flow per point (signs, arrows, crossings)', cap: 4 },
};

export type BuildCategory = 'structure' | 'showroom' | 'vehicles' | 'office' | 'customer' | 'service' | 'decoration' | 'outdoor' | 'security'
  | 'ev' | 'technology' | 'marketing' | 'storage' | 'premium' | 'testdrive' | 'staff' | 'parking';

/** Extra unlock requirements besides company level (reputation, sales, staff, land, profit, test drives). */
export interface Unlock { rep?: number; sold?: number; staff?: number; land?: number; profit?: number; testDrives?: number; evSold?: number }

export interface SpotBonus {
  attention: number;            // % more customer attention for a car standing here
  wtp?: number;                 // extra willingness to pay (fraction) when the car fits
  fit?: 'premium' | 'ev' | 'budget' | 'any' | 'new' | 'used';
  frontRow?: boolean;           // must be near the road
}

export interface ObjDef {
  id: string;
  name: string;
  icon: string;
  category: BuildCategory;
  w: number;
  h: number;
  cost: number;
  upkeep: number;               // € per month
  power: number;                // € per day of utilities
  zones: ZoneCode[];            // where it may stand
  slot?: SlotKind;              // holds a vehicle
  spot?: SpotBonus;             // what standing here does for a car
  station?: Role[];             // a workplace for these roles
  effects?: Partial<Record<EffectKey, number>>;
  minLevel?: number;
  /** Further unlock conditions (all must be met). */
  unlock?: Unlock;
  edge?: 'boundary' | 'road';   // must touch a room boundary (doors/windows) or the road
  walkable?: boolean;           // people can walk over it (doors, rugs, ceiling lights)
  line?: boolean;               // drawn in lines (walls, fences, hedges)
  hidden?: boolean;             // not in the build menu (loose car positions)
  tags?: string[];              // extra search words
  color: string;
  description: string;
  /** Layout synergy: standing within `range` metres of one of `near` adds `effects`. */
  synergy?: { near: string[]; range: number; effects: Partial<Record<EffectKey, number>>; text: string };
  /** What it lets you handle, shown in tooltips (e.g. "2 finance customers at a time"). */
  capacity?: string;
  /** Which customers it matters most to (tooltips). */
  audience?: string;
}

/** Layout synergies, kept apart from the object list so they are easy to tune. */
export const SYNERGIES: Record<string, NonNullable<ObjDef['synergy']>> = {
  financedesk: { near: ['salesdesk', 'premiumdesk'], range: 6, effects: { finance: 1, sales: 1 }, text: 'Within 6 m of a sales desk: +1 finance take-up, +1% sales' },
  financebooth: { near: ['salesdesk', 'premiumdesk', 'financedesk'], range: 8, effects: { finance: 1 }, text: 'Within 8 m of a sales desk: +1 finance take-up' },
  coffee: { near: ['sofa', 'armchair', 'loungechair', 'waitingbench', 'vipsofa', 'bistrotable'], range: 5, effects: { satisfaction: 1.5 }, text: 'Within 5 m of seating: +1.5 satisfaction' },
  coffeebar: { near: ['sofa', 'armchair', 'loungechair', 'waitingbench', 'vipsofa', 'bistrotable'], range: 6, effects: { satisfaction: 2 }, text: 'Within 6 m of seating: +2 satisfaction' },
  receptiondesk: { near: ['gate', 'grandgate', 'door', 'glassdoor'], range: 12, effects: { reception: 0.5, satisfaction: 1 }, text: 'Within 12 m of the entrance: customers are greeted at once (+1 satisfaction)' },
  welcomecounter: { near: ['gate', 'grandgate', 'door', 'glassdoor'], range: 12, effects: { reception: 0.5, satisfaction: 1 }, text: 'Within 12 m of the entrance: +1 satisfaction' },
  premiumdisplay: { near: ['premiumdisplay', 'turntable', 'premiumdesk'], range: 8, effects: { appeal: 0.6 }, text: 'Next to other premium displays or a premium desk: a premium corner (+0.6 appeal)' },
  servicedesk: { near: ['lift', 'evdiagstation'], range: 14, effects: { service: 1 }, text: 'Within 14 m of a lift: +1 service capacity' },
  deliverybay: { near: ['display', 'premiumdisplay', 'turntable', 'salesdesk', 'premiumdesk'], range: 10, effects: { satisfaction: 1 }, text: 'Near the showroom displays: +1 satisfaction' },
  tyrerack: { near: ['lift', 'tyremachine'], range: 8, effects: { service: 0.5 }, text: 'Near a lift or tyre machine: +0.5 service' },
  partsshelf: { near: ['lift'], range: 10, effects: { service: 0.5 }, text: 'Near a lift: +0.5 service' },
  partscounter: { near: ['servicedesk', 'lift'], range: 10, effects: { service: 0.5 }, text: 'Near the service desk: +0.5 service' },
  charger: { near: ['evparking', 'evdisplay', 'solarcarport'], range: 4, effects: { ev: 0.5 }, text: 'Next to an EV space or display: +0.5 EV' },
  hpcharger: { near: ['evparking', 'evdisplay', 'solarcarport'], range: 5, effects: { ev: 0.5 }, text: 'Next to an EV space: +0.5 EV' },
  managerdesk: { near: ['officedesk', 'meetingtable'], range: 10, effects: { management: 0.5 }, text: 'Near the office desks: +0.5 management' },
  kids: { near: ['sofa', 'armchair', 'waitingbench', 'bistrotable'], range: 6, effects: { satisfaction: 1 }, text: 'Near seating: parents relax (+1 satisfaction)' },
  toilet: { near: ['sink'], range: 4, effects: { facilities: 0.5 }, text: 'With a wash basin nearby: +0.5 facilities' },
  crmterminal: { near: ['salesdesk', 'premiumdesk', 'financedesk'], range: 5, effects: { sales: 1 }, text: 'Next to a sales or finance desk: +1% sales' },
  brandportal: { near: ['display', 'premiumdisplay', 'evdisplay', 'turntable'], range: 8, effects: { appeal: 0.4 }, text: 'Behind the displays: +0.4 appeal' },
  champagnebar: { near: ['vipsofa', 'loungechair', 'premiumdisplay'], range: 8, effects: { satisfaction: 1 }, text: 'In a premium corner: +1 satisfaction' },
  // v6 combinations
  promodisplay: { near: ['display', 'premiumdisplay', 'evdisplay', 'platform', 'outdoordisplay'], range: 6, effects: { footfall: 0.3 }, text: 'Next to a display: showroom + marketing = more visitors (+0.3 foot traffic)' },
  digiscreen: { near: ['display', 'premiumdisplay', 'evdisplay', 'platform', 'luxplatform', 'turntable'], range: 5, effects: { footfall: 0.2, sales: 1 }, text: 'Next to a display: +0.2 foot traffic, +1% sales' },
  servicewait: { near: ['servicedesk'], range: 8, effects: { service: 0.5, satisfaction: 0.5 }, text: 'Near the service desk: faster service (+0.5) and happier customers' },
  loungeset: { near: ['receptiondesk', 'welcomecounter', 'infodesk', 'receptionpod', 'luxreception'], range: 10, effects: { satisfaction: 1 }, text: 'Lounge + reception: +1 satisfaction' },
  multicharger: { near: ['evparking', 'solarcarport', 'evdisplay'], range: 6, effects: { ev: 0.5 }, text: 'Next to EV spaces: +0.5 EV appeal' },
  vipsofa: { near: ['premiumdisplay', 'luxplatform', 'turntable'], range: 10, effects: { appeal: 0.6, satisfaction: 0.5 }, text: 'Premium showroom + VIP lounge: +0.6 appeal (premium reputation)' },
  premiumlounge: { near: ['premiumdisplay', 'luxplatform', 'turntable', 'premiumdesk'], range: 12, effects: { appeal: 0.8 }, text: 'Near premium displays: +0.8 appeal' },
  tdcheckin: { near: ['tdparking'], range: 12, effects: { testdrive: 1 }, text: 'Near test-drive parking: +1 test-drive facilities' },
  handover: { near: ['tdparking', 'deliverybay', 'evdelivery'], range: 6, effects: { testdrive: 0.5 }, text: 'Next to the test-drive or delivery bay: +0.5 test drives' },
  repairstation: { near: ['lift', 'inspectionlane'], range: 4, effects: { workshop: 0.3 }, text: 'Next to a lift: +0.3 workshop' },
  trainingscreen: { near: ['trainingdesk'], range: 6, effects: { training: 0.5 }, text: 'With training desks: +0.5 training' },
  marketingdesk: { near: ['digiscreen', 'screen', 'ledwall', 'promodisplay'], range: 8, effects: { marketing: 0.5 }, text: 'Near screens and promo displays: +0.5 marketing' },
  batteryservice: { near: ['evdiagstation', 'charger', 'hpcharger'], range: 8, effects: { ev: 0.5 }, text: 'With EV diagnostics or a charger: +0.5 EV' },
  crossing: { near: ['gate', 'grandgate', 'canopy'], range: 10, effects: { wayfinding: 0.5 }, text: 'Near the entrance: +0.5 wayfinding' },
};

/** Capacity and audience notes for tooltips. */
export const OBJECT_NOTES: Record<string, { capacity?: string; audience?: string }> = {
  salesdesk: { capacity: '1 salesperson, ~5 customers a day', audience: 'Every buyer' },
  premiumdesk: { capacity: '1 salesperson, ~5 customers a day', audience: 'Luxury, prestige and business buyers' },
  financedesk: { capacity: '1 finance manager or salesperson; 2 finance customers at a time', audience: 'Families, young and first-time buyers, business customers' },
  financebooth: { capacity: '1 finance manager; 2 finance customers at a time', audience: 'Anyone paying monthly' },
  receptiondesk: { capacity: '1 receptionist', audience: 'Every visitor' },
  welcomecounter: { capacity: '1 receptionist', audience: 'Every visitor' },
  coffee: { audience: 'Waiting customers, families, seniors' },
  coffeebar: { audience: 'Waiting customers' },
  champagnebar: { audience: 'Luxury and prestige buyers' },
  kids: { audience: 'Family buyers' },
  premiumdisplay: { capacity: '1 car on show', audience: 'Luxury, prestige and enthusiast buyers' },
  evdisplay: { capacity: '1 car on show', audience: 'EV buyers, business customers' },
  lift: { capacity: '1 car · ~8 workshop hours a day', audience: 'Service customers' },
  servicedesk: { capacity: '1 service advisor', audience: 'Service customers' },
  deliverybay: { capacity: '1 delivery specialist', audience: 'Every buyer at handover' },
  charger: { audience: 'EV buyers' },
  hpcharger: { audience: 'EV buyers' },
  visitorparking: { capacity: '4 visiting customers a day' },
  toilet: { audience: 'Every visitor (keeps them longer)' },
  carwash: { capacity: '1 car · valets for customers', audience: 'Service customers' },
  inspectionlane: { capacity: '1 car · ~8 workshop hours a day', audience: 'Service and inspection customers' },
  platform: { capacity: '1 car on show', audience: 'Every buyer' },
  luxplatform: { capacity: '1 car on show', audience: 'Luxury and prestige buyers' },
  tdcheckin: { capacity: '1 salesperson; 1 test drive at a time', audience: 'Everyone who wants to drive before buying' },
  tdparking: { capacity: '1 test car', audience: 'Test-drive customers' },
  vipparking: { capacity: '2 visiting VIPs a day', audience: 'Luxury and business buyers' },
  multicharger: { capacity: '4 cars charging', audience: 'EV buyers' },
  eventstage: { capacity: 'Open days for 100+ visitors', audience: 'The whole town' },
};

const IN: ZoneCode[] = ['s', 'r', 'l', 'o', 'w', 'd', 'b', 'v', 'm', 'k', 'p', 'e', 'f', 'q', 'n', 'u'];
const PUBLIC_IN: ZoneCode[] = ['s', 'r', 'l', 'v', 'b', 'e', 'f', 'q'];
const OUT: ZoneCode[] = ['a', 'g', 'x', '.', 'j'];
const DESKS: ZoneCode[] = ['s', 'r', 'o', 'm', 'v', 'f', 'e', 'q', 'n', 'u'];
const ALL: ZoneCode[] = [...IN, 'a', 'g', 'x', 't', '.', 'j'];

export const OBJECTS: ObjDef[] = [
  // ---------------------------------------------------------------- structure
  { id: 'wall', name: 'Interior wall', icon: '🧱', category: 'structure', w: 1, h: 1, cost: 60, upkeep: 0, power: 0, zones: ALL, line: true, tags: ['wall', 'partition', 'muur'], color: '#9aa3ad', description: 'A solid wall section. Drag to draw a straight wall; people walk around it.' },
  { id: 'glasswall', name: 'Glass wall', icon: '🪟', category: 'structure', w: 1, h: 1, cost: 180, upkeep: 1, power: 0, zones: IN, line: true, effects: { appeal: 0.05 }, tags: ['wall', 'glass', 'partition', 'muur'], color: '#9fd8ff', description: 'A glass partition. Keeps the view open and looks premium.' },
  { id: 'walldoor', name: 'Door in wall', icon: '🚪', category: 'structure', w: 1, h: 1, cost: 250, upkeep: 0, power: 0, zones: ALL, walkable: true, tags: ['door', 'deur', 'opening', 'gap'], color: '#c8ccd2', description: 'A doorway you can place in a gap of a wall you have drawn.' },
  { id: 'door', name: 'Door', icon: '🚪', category: 'structure', w: 2, h: 1, cost: 400, upkeep: 1, power: 0, zones: IN, edge: 'boundary', walkable: true, tags: ['entrance', 'deur', 'opening'], color: '#a3abb6', description: 'An opening in a room’s wall. Place it on the edge of a room.' },
  { id: 'glassdoor', name: 'Glass entrance', icon: '🚪', category: 'structure', w: 3, h: 1, cost: 2400, upkeep: 6, power: 1, zones: IN, edge: 'boundary', walkable: true, effects: { appeal: 0.8, footfall: 0.3 }, tags: ['entrance', 'entree', 'door', 'deur', 'glass', 'automatic'], color: '#9fd8ff', description: 'Wide automatic glass doors. A proper showroom entrance that invites people in.' },
  { id: 'window', name: 'Window', icon: '🪟', category: 'structure', w: 3, h: 1, cost: 350, upkeep: 0, power: 0, zones: IN, edge: 'boundary', effects: { appeal: 0.3, decor: 0.3 }, tags: ['glass', 'raam'], color: '#9fd8ff', description: 'Daylight and a view of the cars. Place it on a room’s edge.' },
  { id: 'bigwindow', name: 'Showroom glazing', icon: '🪟', category: 'structure', w: 5, h: 1, cost: 1600, upkeep: 2, power: 0, zones: IN, edge: 'boundary', effects: { appeal: 0.8, decor: 0.5, curb: 0.5 }, minLevel: 2, tags: ['glass', 'window', 'raam', 'facade'], color: '#9fd8ff', description: 'Floor-to-ceiling glass. Passers-by see your cars from the street.' },
  { id: 'pillar', name: 'Pillar', icon: '🏛️', category: 'structure', w: 1, h: 1, cost: 300, upkeep: 0, power: 0, zones: IN, effects: { decor: 0.1 }, tags: ['column', 'zuil'], color: '#c8ccd2', description: 'A structural column. Mostly decorative.' },

  // ---------------------------------------------------------------- showroom
  { id: 'display', name: 'Showroom display', icon: '✨', category: 'showroom', w: 4, h: 6, cost: 3800, upkeep: 30, power: 3, zones: ['s'], slot: 'display', spot: { attention: 10, wtp: 0.015, fit: 'any' }, effects: { appeal: 1 }, tags: ['car', 'vehicle', 'pad', 'auto'], color: '#ff9a4d', description: 'A lit display pad indoors. Cars here draw more interest and higher offers.' },
  { id: 'premiumdisplay', name: 'Premium display', icon: '💎', category: 'showroom', w: 4, h: 6, cost: 7500, upkeep: 55, power: 5, zones: ['s'], slot: 'display', spot: { attention: 15, wtp: 0.03, fit: 'premium' }, effects: { appeal: 1.6, lighting: 0.5 }, minLevel: 2, tags: ['car', 'vehicle', 'luxury', 'podium', 'auto'], color: '#ffc233', description: 'A spot-lit podium for premium and luxury cars. The customers who want them pay more when they see one here.' },
  { id: 'evdisplay', name: 'EV display', icon: '⚡', category: 'showroom', w: 4, h: 6, cost: 5200, upkeep: 40, power: 6, zones: ['s'], slot: 'display', spot: { attention: 12, wtp: 0.025, fit: 'ev' }, effects: { appeal: 1, ev: 0.5 }, tags: ['car', 'vehicle', 'electric', 'charger', 'auto'], color: '#2fd18b', description: 'A display with a built-in charger for electric cars.' },
  { id: 'turntable', name: 'Turntable display', icon: '🔄', category: 'showroom', w: 6, h: 6, cost: 9500, upkeep: 60, power: 8, zones: ['s'], slot: 'display', spot: { attention: 20, wtp: 0.03, fit: 'any' }, effects: { appeal: 3, decor: 1 }, minLevel: 3, tags: ['car', 'vehicle', 'rotating', 'hero', 'auto'], color: '#ffc233', description: 'A rotating podium for your hero car. Big boost to showroom appeal.' },
  { id: 'salesdesk', name: 'Sales desk', icon: '🤝', category: 'showroom', w: 2, h: 2, cost: 900, upkeep: 5, power: 1, zones: [...DESKS, 'a'], station: ['sales'], tags: ['desk', 'bureau', 'salesperson', 'table'], color: '#a3abb6', description: 'Where a salesperson works and closes deals.' },
  { id: 'premiumdesk', name: 'Premium sales desk', icon: '🤝', category: 'showroom', w: 3, h: 2, cost: 2500, upkeep: 50, power: 1, zones: DESKS, station: ['sales'], effects: { sales: 8, satisfaction: 5, appeal: 0.3 }, minLevel: 2, tags: ['desk', 'bureau', 'salesperson', 'luxury'], color: '#d9c7a8', description: 'A luxury sales desk for sales conversations. Customers feel valued and deals go more smoothly.' },
  { id: 'financedesk', name: 'Finance desk', icon: '🏦', category: 'showroom', w: 2, h: 2, cost: 1800, upkeep: 20, power: 1, zones: DESKS, station: ['finance', 'accountant', 'sales'], effects: { finance: 1, sales: 2 }, tags: ['desk', 'bureau', 'loan', 'finance'], color: '#9b8cff', description: 'Where buyers sign finance agreements. More of them take finance through you.' },
  { id: 'receptiondesk', name: 'Reception desk', icon: '🛎️', category: 'showroom', w: 3, h: 1, cost: 1600, upkeep: 8, power: 1, zones: ['r', 's', 'v'], station: ['reception'], effects: { reception: 1 }, tags: ['desk', 'welcome', 'counter', 'balie', 'receptie'], color: '#d9c7a8', description: 'Customers are greeted and wait longer before giving up.' },
  { id: 'welcomecounter', name: 'Welcome counter', icon: '🛎️', category: 'showroom', w: 4, h: 2, cost: 4200, upkeep: 20, power: 2, zones: ['r', 's'], station: ['reception'], effects: { reception: 1, satisfaction: 3, appeal: 0.5 }, minLevel: 2, tags: ['desk', 'reception', 'receptie', 'counter', 'balie'], color: '#e6dccb', description: 'A large curved welcome counter. First impressions count.' },
  { id: 'kiosk', name: 'Configurator kiosk', icon: '🖥️', category: 'showroom', w: 1, h: 1, cost: 1900, upkeep: 12, power: 2, zones: ['s', 'r'], effects: { appeal: 0.5, sales: 1 }, tags: ['screen', 'scherm', 'touch', 'computer'], color: '#3cc7ff', description: 'Customers browse your stock on a touch screen while they wait.' },
  { id: 'infoboard', name: 'Vehicle info board', icon: '📋', category: 'showroom', w: 1, h: 1, cost: 250, upkeep: 1, power: 0, zones: ['s', 'a', 'x'], effects: { appeal: 0.4 }, tags: ['sign', 'price', 'spec'], color: '#eef1f4', description: 'Specs and prices next to the cars. Customers decide faster.' },
  { id: 'brochure', name: 'Brochure stand', icon: '📰', category: 'showroom', w: 1, h: 1, cost: 150, upkeep: 1, power: 0, zones: PUBLIC_IN, effects: { sales: 0.5, decor: 0.1 }, tags: ['leaflet', 'rack'], color: '#ff7a1a', description: 'Brochures for people who want to think about it at home.' },
  { id: 'ropes', name: 'Display ropes', icon: '🎗️', category: 'showroom', w: 2, h: 1, cost: 220, upkeep: 0, power: 0, zones: ['s'], effects: { decor: 0.4 }, tags: ['barrier', 'stanchion'], color: '#c9a36b', description: 'Velvet ropes around your best cars.' },

  // ---------------------------------------------------------------- vehicles
  { id: 'parking', name: 'Parking space', icon: '🅿️', category: 'vehicles', w: 3, h: 5, cost: 1500, upkeep: 15, power: 0.5, zones: ['a'], slot: 'parking', spot: { attention: 0 }, tags: ['car', 'auto', 'space', 'lot', 'outdoor', 'parkeerplaats'], color: '#e9ecef', description: 'Holds one car on the outdoor lot. Customers can view it.' },
  { id: 'frontrow', name: 'Front-row space', icon: '⭐', category: 'vehicles', w: 3, h: 5, cost: 2600, upkeep: 20, power: 1, zones: ['a', 'x'], slot: 'parking', spot: { attention: 12, fit: 'any', frontRow: true }, effects: { curb: 0.3 }, tags: ['car', 'auto', 'space', 'road', 'street', 'best', 'parking'], color: '#ffc233', description: 'A marked space along the road where passers-by see the car. Must be within 7 m of the street.' },
  { id: 'occasion', name: 'Bargain corner space', icon: '🏷️', category: 'vehicles', w: 3, h: 5, cost: 1200, upkeep: 10, power: 0, zones: ['a'], slot: 'parking', spot: { attention: 8, wtp: 0.01, fit: 'budget' }, tags: ['car', 'auto', 'space', 'cheap', 'occasion', 'budget', 'parking'], color: '#2fd18b', description: 'A “deal of the week” space. Cheap cars (under €12,000) here get more attention from budget buyers.' },
  { id: 'evparking', name: 'EV charging space', icon: '🔌', category: 'vehicles', w: 3, h: 5, cost: 2900, upkeep: 25, power: 4, zones: ['a'], slot: 'parking', spot: { attention: 6, wtp: 0.02, fit: 'ev' }, effects: { ev: 0.5 }, tags: ['car', 'auto', 'space', 'electric', 'charger', 'parking'], color: '#2fd18b', description: 'A space with its own charger. Electric cars parked here sell for more.' },
  { id: 'premiumparking', name: 'Premium outdoor space', icon: '💎', category: 'vehicles', w: 4, h: 6, cost: 3400, upkeep: 30, power: 2, zones: ['a', 'x'], slot: 'parking', spot: { attention: 10, wtp: 0.02, fit: 'premium' }, effects: { curb: 0.4 }, minLevel: 2, tags: ['car', 'auto', 'space', 'luxury', 'podium', 'parking', 'display'], color: '#ffc233', description: 'A wider, lit outdoor pad for premium cars.' },
  { id: 'storage', name: 'Storage space', icon: '📦', category: 'vehicles', w: 3, h: 5, cost: 700, upkeep: 6, power: 0, zones: ['t'], slot: 'storage', tags: ['car', 'auto', 'space', 'yard', 'hidden', 'parking'], color: '#b8a878', description: 'Cheap space for cars waiting for work or for a buyer. Not visible to customers.' },
  { id: 'prepspot', name: 'Prep area space', icon: '🧰', category: 'vehicles', w: 3, h: 5, cost: 900, upkeep: 8, power: 1, zones: ['w', 'd', 't', 'p'], slot: 'storage', effects: { service: 0.5 }, tags: ['car', 'auto', 'space', 'service', 'workshop', 'waiting', 'parking'], color: '#6b7480', description: 'A marked space next to the workshop for cars queued for work.' },
  { id: 'visitorparking', name: 'Visitor parking', icon: '🚙', category: 'vehicles', w: 3, h: 5, cost: 900, upkeep: 6, power: 0, zones: ['a'], effects: { visitorParking: 1 }, tags: ['customer', 'guest', 'space', 'parking'], color: '#3cc7ff', description: 'Parking for customers, not stock. Without enough, busy days turn visitors away.' },
  { id: 'charger', name: 'EV charger', icon: '🔌', category: 'vehicles', w: 1, h: 1, cost: 1400, upkeep: 15, power: 4, zones: ['a', 's', 'x'], effects: { ev: 1 }, tags: ['electric', 'charging', 'laadpaal'], color: '#2fd18b', description: 'Electric cars on the lot stay charged — EV buyers pay more. Cars parked next to it count as charging.' },
  { id: 'carpos', name: 'Car (placed by hand)', icon: '🚗', category: 'vehicles', w: 2, h: 4, cost: 0, upkeep: 0, power: 0, zones: ['a', 'x', 's', 't', 'g', '.', 'w', 'd', 'v'], slot: 'floor', spot: { attention: 0 }, hidden: true, color: '#6b7480', description: 'A car you parked by hand.' },

  // ------------------------------------------------------------------ office
  { id: 'officedesk', name: 'Office desk', icon: '🗂️', category: 'office', w: 2, h: 2, cost: 700, upkeep: 4, power: 1, zones: ['o', 'm'], station: ['manager', 'accountant', 'buyer', 'marketing', 'inventory', 'admin', 'procurement'], tags: ['desk', 'bureau', 'buyer', 'accountant', 'marketing', 'inventory'], color: '#8b949e', description: 'A desk for a manager, buyer, accountant or marketing specialist.' },
  { id: 'managerdesk', name: 'Manager’s desk', icon: '👔', category: 'office', w: 3, h: 2, cost: 3200, upkeep: 25, power: 1, zones: ['m', 'o'], station: ['manager', 'inventory', 'procurement'], effects: { management: 2, morale: 0.5 }, minLevel: 2, tags: ['desk', 'bureau', 'manager', 'executive'], color: '#5b4b8a', description: 'An executive desk. The manager who sits here keeps the whole team sharper.' },
  { id: 'computer', name: 'Workstation PC', icon: '💻', category: 'office', w: 1, h: 1, cost: 900, upkeep: 8, power: 1, zones: [...DESKS, 'w', 'p'], effects: { sales: 1, management: 0.3 }, tags: ['computer', 'screen', 'it'], color: '#3cc7ff', description: 'Faster admin and quotes.' },
  { id: 'officechair', name: 'Office chair', icon: '🪑', category: 'office', w: 1, h: 1, cost: 150, upkeep: 0, power: 0, zones: IN, effects: { morale: 0.1 }, tags: ['chair', 'stoel', 'seat'], color: '#51606f', description: 'A proper chair. Small things matter to staff.' },
  { id: 'meetingtable', name: 'Meeting table', icon: '🪑', category: 'office', w: 3, h: 2, cost: 1100, upkeep: 2, power: 0, zones: ['o', 'm', 'k', 's'], effects: { management: 0.5, sales: 1 }, tags: ['table', 'tafel', 'conference'], color: '#8a6a4a', description: 'Somewhere to close big deals and hold team meetings.' },
  { id: 'filing', name: 'Filing cabinet', icon: '🗄️', category: 'office', w: 1, h: 1, cost: 250, upkeep: 0, power: 0, zones: ['o', 'm', 'r', 'v', 'p'], effects: { management: 0.2 }, tags: ['cabinet', 'kast', 'storage'], color: '#6b7480', description: 'Keeps the paperwork in order.' },
  { id: 'bookcase', name: 'Bookcase', icon: '📚', category: 'office', w: 2, h: 1, cost: 400, upkeep: 0, power: 0, zones: IN, effects: { decor: 0.3 }, tags: ['kast', 'shelf', 'cabinet'], color: '#8a6a4a', description: 'Catalogues, manuals and a bit of character.' },
  { id: 'printer', name: 'Printer', icon: '🖨️', category: 'office', w: 1, h: 1, cost: 350, upkeep: 6, power: 1, zones: ['o', 'm', 'r', 'v'], effects: { sales: 0.5 }, tags: ['copier', 'paperwork'], color: '#a3abb6', description: 'Contracts printed on the spot.' },
  { id: 'whiteboard', name: 'Sales board', icon: '📈', category: 'office', w: 2, h: 1, cost: 300, upkeep: 0, power: 0, zones: ['o', 'm', 'k'], effects: { morale: 0.3, management: 0.3 }, tags: ['board', 'targets'], color: '#eef1f4', description: 'Targets on the wall. The team likes to see progress.' },
  { id: 'safe', name: 'Safe', icon: '🔐', category: 'office', w: 1, h: 1, cost: 1200, upkeep: 0, power: 0, zones: ['o', 'm'], effects: { security: 1 }, tags: ['security', 'keys'], color: '#51606f', description: 'Keys and cash locked away. Insurers like it.' },

  // ---------------------------------------------------------------- customer
  { id: 'sofa', name: 'Sofa', icon: '🛋️', category: 'customer', w: 3, h: 1, cost: 800, upkeep: 3, power: 0, zones: PUBLIC_IN, effects: { lounge: 1 }, tags: ['seat', 'bank', 'couch', 'seating'], color: '#5b4b8a', description: 'Somewhere comfortable to wait.' },
  { id: 'armchair', name: 'Armchair', icon: '💺', category: 'customer', w: 1, h: 1, cost: 300, upkeep: 1, power: 0, zones: PUBLIC_IN, effects: { lounge: 0.4 }, tags: ['seat', 'chair', 'stoel', 'seating'], color: '#7a5d9a', description: 'A single comfy seat.' },
  { id: 'loungechair', name: 'Designer lounge chair', icon: '💺', category: 'customer', w: 1, h: 1, cost: 900, upkeep: 2, power: 0, zones: PUBLIC_IN, effects: { lounge: 0.6, decor: 0.3 }, minLevel: 2, tags: ['seat', 'chair', 'stoel', 'luxury', 'seating'], color: '#c9a36b', description: 'Leather and walnut. Comfortable and a statement.' },
  { id: 'waitingbench', name: 'Waiting bench', icon: '🪑', category: 'customer', w: 3, h: 1, cost: 450, upkeep: 1, power: 0, zones: PUBLIC_IN, effects: { lounge: 0.6 }, tags: ['seat', 'bank', 'seating'], color: '#6b7480', description: 'Simple seating for three.' },
  { id: 'coffeetable', name: 'Coffee table', icon: '🪑', category: 'customer', w: 2, h: 1, cost: 220, upkeep: 1, power: 0, zones: PUBLIC_IN, effects: { lounge: 0.3 }, tags: ['table', 'tafel'], color: '#8a6a4a', description: 'Magazines and brochures.' },
  { id: 'bistrotable', name: 'Bistro table & chairs', icon: '🍽️', category: 'customer', w: 2, h: 2, cost: 600, upkeep: 1, power: 0, zones: ['l', 'r', 's', 'k'], effects: { lounge: 0.5, satisfaction: 0.5 }, tags: ['table', 'tafel', 'chairs', 'stoelen', 'seating'], color: '#8a6a4a', description: 'A table to talk numbers over a coffee.' },
  { id: 'coffee', name: 'Coffee machine', icon: '☕', category: 'customer', w: 1, h: 1, cost: 900, upkeep: 12, power: 2, zones: ['l', 'r', 's', 'v', 'k', 'q', 'e'], effects: { lounge: 1 }, tags: ['drink', 'koffie'], color: '#3a2a20', description: 'Free coffee. Customers stay patient.' },
  { id: 'coffeebar', name: 'Coffee bar', icon: '☕', category: 'customer', w: 3, h: 1, cost: 3200, upkeep: 45, power: 4, zones: ['l', 'r', 's'], effects: { lounge: 1.5, satisfaction: 3 }, minLevel: 2, tags: ['drink', 'barista', 'koffie', 'corner'], color: '#6b4a32', description: 'A proper coffee bar with a barista machine. Customers love it.' },
  { id: 'watercooler', name: 'Water cooler', icon: '🚰', category: 'customer', w: 1, h: 1, cost: 250, upkeep: 4, power: 1, zones: IN, effects: { lounge: 0.3, morale: 0.1 }, tags: ['drink', 'water'], color: '#9fd8ff', description: 'Cold water for everyone.' },
  { id: 'vending', name: 'Vending machine', icon: '🥤', category: 'customer', w: 1, h: 1, cost: 700, upkeep: 5, power: 2, zones: ['l', 'r', 'v', 'k'], effects: { lounge: 0.3 }, tags: ['snacks', 'drinks'], color: '#ff4d5e', description: 'Snacks and drinks.' },
  { id: 'tv', name: 'TV screen', icon: '📺', category: 'customer', w: 2, h: 1, cost: 1200, upkeep: 4, power: 2, zones: ['l', 's', 'r', 'v', 'k'], effects: { lounge: 0.6, decor: 0.5 }, tags: ['screen', 'scherm', 'television'], color: '#111418', description: 'Keeps waiting customers entertained.' },
  { id: 'magazines', name: 'Magazine rack', icon: '📰', category: 'customer', w: 1, h: 1, cost: 120, upkeep: 1, power: 0, zones: PUBLIC_IN, effects: { lounge: 0.2 }, tags: ['reading'], color: '#ff7a1a', description: 'Car magazines for the wait.' },
  { id: 'kids', name: 'Kids corner', icon: '🧸', category: 'customer', w: 3, h: 3, cost: 1500, upkeep: 6, power: 0, zones: ['l', 'r', 's'], effects: { lounge: 1.2, satisfaction: 1 }, minLevel: 2, tags: ['children', 'family', 'play'], color: '#ff6b81', description: 'Families relax when the children are busy.' },
  { id: 'toilet', name: 'Toilet cubicle', icon: '🚻', category: 'customer', w: 2, h: 2, cost: 2200, upkeep: 15, power: 1, zones: ['b'], effects: { facilities: 1 }, tags: ['wc', 'restroom', 'toilets', 'toiletten'], color: '#a8c4cc', description: 'A customer toilet. Nobody buys a car in a hurry to leave.' },
  { id: 'sink', name: 'Wash basin', icon: '🚰', category: 'customer', w: 1, h: 1, cost: 400, upkeep: 2, power: 0, zones: ['b', 'k'], effects: { facilities: 0.3 }, tags: ['wc', 'restroom', 'toilets'], color: '#eef1f4', description: 'Every toilet needs one.' },

  // ----------------------------------------------------------------- service
  { id: 'lift', name: 'Workshop lift', icon: '🔧', category: 'service', w: 4, h: 6, cost: 5500, upkeep: 55, power: 6, zones: ['w'], slot: 'lift', station: ['mechanic', 'technician'], effects: { workshop: 1 }, tags: ['repair', 'mechanic', 'bay', 'hefbrug', 'werkplaats'], color: '#ffc233', description: 'A repair bay. Each lift works on one car and is a workstation for a mechanic.' },
  { id: 'toolwall', name: 'Tool wall', icon: '🧰', category: 'service', w: 3, h: 1, cost: 1200, upkeep: 8, power: 0, zones: ['w'], effects: { workshop: 1 }, tags: ['tools', 'gereedschap'], color: '#d84a3a', description: 'Proper tools: faster, cheaper repairs.' },
  { id: 'tyremachine', name: 'Tyre machine', icon: '🛞', category: 'service', w: 2, h: 2, cost: 2500, upkeep: 12, power: 2, zones: ['w'], effects: { workshop: 1 }, tags: ['tyres', 'wheels', 'banden', 'tools'], color: '#6b7480', description: 'Tyres and wheel balancing in-house.' },
  { id: 'workbench', name: 'Workbench', icon: '🪚', category: 'service', w: 2, h: 1, cost: 600, upkeep: 2, power: 0, zones: ['w', 'd', 'p'], station: ['prep'], effects: { service: 1 }, tags: ['bench', 'tools', 'table'], color: '#8a6a4a', description: 'Somewhere to strip down parts. Service gets quicker.' },
  { id: 'compressor', name: 'Air compressor', icon: '💨', category: 'service', w: 1, h: 1, cost: 800, upkeep: 6, power: 2, zones: ['w', 'd'], effects: { service: 0.5, workshop: 0.5 }, tags: ['air', 'tools'], color: '#3cc7ff', description: 'Air tools make light work.' },
  { id: 'oilstation', name: 'Oil & fluids station', icon: '🛢️', category: 'service', w: 2, h: 1, cost: 1500, upkeep: 10, power: 1, zones: ['w'], effects: { service: 1 }, tags: ['oil', 'service'], color: '#51606f', description: 'Services done in half the time.' },
  { id: 'scanner', name: 'OBD scanner', icon: '🩺', category: 'service', w: 1, h: 1, cost: 3000, upkeep: 10, power: 1, zones: ['w'], effects: { equipment: 1 }, tags: ['diagnostics', 'computer', 'tools'], color: '#3cc7ff', description: 'Reads fault codes: inspections find more hidden problems.' },
  { id: 'diagbench', name: 'Diagnostics bench', icon: '🖥️', category: 'service', w: 2, h: 2, cost: 11000, upkeep: 40, power: 3, zones: ['w'], effects: { equipment: 2 }, minLevel: 2, tags: ['diagnostics', 'computer', 'tools'], color: '#3cc7ff', description: 'Full diagnostics. Much better detection of hidden defects.' },
  { id: 'dealerdiag', name: 'Dealer-grade diagnostics', icon: '📡', category: 'service', w: 3, h: 2, cost: 28000, upkeep: 90, power: 5, zones: ['w'], effects: { equipment: 3 }, minLevel: 3, tags: ['diagnostics', 'computer', 'tools'], color: '#9b8cff', description: 'The best diagnostic kit money can buy.' },
  { id: 'washbay', name: 'Detailing bay', icon: '🧽', category: 'service', w: 4, h: 6, cost: 3200, upkeep: 30, power: 4, zones: ['d'], slot: 'bay', station: ['detailer', 'prep'], effects: { detailing: 1 }, tags: ['wash', 'clean', 'wasstraat', 'detailer', 'detailing'], color: '#3cc7ff', description: 'Cleaning and detailing station for one car. A workstation for a detailer.' },
  { id: 'pressurewasher', name: 'Pressure washer', icon: '💦', category: 'service', w: 1, h: 1, cost: 700, upkeep: 6, power: 2, zones: ['d'], effects: { detailing: 0.5 }, tags: ['wash', 'clean', 'detailing'], color: '#3cc7ff', description: 'Faster pre-wash.' },
  { id: 'paintbooth', name: 'Paint booth', icon: '🎨', category: 'service', w: 5, h: 7, cost: 12000, upkeep: 70, power: 8, zones: ['d'], effects: { detailing: 1 }, minLevel: 2, tags: ['paint', 'spray', 'bodywork', 'detailing'], color: '#e74c3c', description: 'Paint correction in-house: better, cheaper detailing.' },
  { id: 'photocorner', name: 'Photo corner', icon: '📷', category: 'service', w: 3, h: 3, cost: 1400, upkeep: 6, power: 1, zones: ['s', 'd', 'a', 'x'], station: ['photographer'], effects: { photo: 0.5 }, tags: ['photos', 'camera', 'marketing', 'backdrop', 'photographer'], color: '#d9dde2', description: 'A backdrop and lights where a photographer shoots your cars for the listings.' },
  { id: 'photostudio', name: 'Photo studio', icon: '📸', category: 'service', w: 5, h: 6, cost: 9000, upkeep: 30, power: 4, zones: ['d', 's'], station: ['photographer'], effects: { detailing: 1, photo: 1 }, minLevel: 3, tags: ['photos', 'camera', 'marketing'], color: '#eef1f4', description: 'Professional photos for every online listing, free.' },
  { id: 'partsshelf', name: 'Parts shelving', icon: '🗃️', category: 'service', w: 3, h: 1, cost: 700, upkeep: 2, power: 0, zones: ['p', 'w'], effects: { service: 1 }, tags: ['parts', 'storage', 'kast', 'onderdelen'], color: '#b8a878', description: 'Common parts in stock: repairs don’t wait for deliveries.' },
  { id: 'tyrerack', name: 'Tyre rack', icon: '🛞', category: 'service', w: 3, h: 1, cost: 500, upkeep: 1, power: 0, zones: ['p', 'w', 't'], effects: { service: 0.5 }, tags: ['tyres', 'storage', 'banden'], color: '#51606f', description: 'Seasonal tyres ready to fit.' },
  { id: 'servicedesk', name: 'Service desk', icon: '🧾', category: 'service', w: 2, h: 2, cost: 1600, upkeep: 10, power: 1, zones: ['v', 'r'], station: ['advisor'], effects: { service: 1.5, satisfaction: 1 }, tags: ['desk', 'bureau', 'service', 'balie', 'advisor'], color: '#8f9aa6', description: 'Where work is booked in. Keeps the workshop organised.' },
  { id: 'lockers', name: 'Staff lockers', icon: '🔒', category: 'service', w: 2, h: 1, cost: 600, upkeep: 1, power: 0, zones: ['k', 'w', 'p'], effects: { morale: 0.5 }, tags: ['staff', 'kast', 'personeel'], color: '#6b7480', description: 'A place for the team’s things.' },
  { id: 'kitchen', name: 'Staff kitchenette', icon: '🍳', category: 'service', w: 3, h: 1, cost: 2200, upkeep: 12, power: 3, zones: ['k'], effects: { morale: 1.5 }, tags: ['staff', 'break', 'personeel', 'personeelsruimte'], color: '#d9d2c4', description: 'Coffee, a fridge and a microwave for the team.' },

  // -------------------------------------------------------------- decoration
  { id: 'plant', name: 'Plant', icon: '🪴', category: 'decoration', w: 1, h: 1, cost: 120, upkeep: 2, power: 0, zones: [...IN, 'a', 'g', 'x'], effects: { decor: 0.5 }, tags: ['green', 'plant', 'plantje'], color: '#2f8a4a', description: 'Greenery makes any room nicer.' },
  { id: 'bigplant', name: 'Large indoor tree', icon: '🌴', category: 'decoration', w: 2, h: 2, cost: 650, upkeep: 6, power: 0, zones: IN, effects: { decor: 1.2 }, tags: ['green', 'plant', 'palm'], color: '#2f7a4a', description: 'A statement piece of greenery.' },
  { id: 'poster', name: 'Poster', icon: '🖼️', category: 'decoration', w: 1, h: 1, cost: 80, upkeep: 0, power: 0, zones: IN, effects: { decor: 0.3 }, tags: ['sign', 'print', 'advert'], color: '#ff7a1a', description: 'Promotional posters.' },
  { id: 'artwork', name: 'Artwork', icon: '🖼️', category: 'decoration', w: 2, h: 1, cost: 900, upkeep: 0, power: 0, zones: IN, effects: { decor: 0.8 }, minLevel: 2, tags: ['painting', 'art'], color: '#9b8cff', description: 'Framed art for a classier feel.' },
  { id: 'sculpture', name: 'Engine sculpture', icon: '⚙️', category: 'decoration', w: 1, h: 1, cost: 1500, upkeep: 0, power: 0, zones: ['s', 'r', 'l'], effects: { decor: 1, appeal: 0.3 }, minLevel: 2, tags: ['art', 'engine', 'statue'], color: '#c8ccd2', description: 'A polished V8 on a plinth. Enthusiasts love it.' },
  { id: 'trophy', name: 'Trophy cabinet', icon: '🏆', category: 'decoration', w: 2, h: 1, cost: 800, upkeep: 0, power: 1, zones: IN, effects: { decor: 0.6, satisfaction: 0.5 }, tags: ['awards', 'kast', 'cabinet'], color: '#ffc233', description: 'Awards and five-star reviews on show.' },
  { id: 'neon', name: 'Neon sign', icon: '💡', category: 'decoration', w: 2, h: 1, cost: 1400, upkeep: 6, power: 2, zones: ['s', 'r', 'l'], effects: { decor: 1.5, appeal: 0.5 }, tags: ['light', 'sign', 'logo', 'reclame'], color: '#ff4dd2', description: 'A glowing brand statement.' },
  { id: 'logowall', name: 'Logo wall', icon: '🏷️', category: 'decoration', w: 3, h: 1, cost: 2800, upkeep: 8, power: 2, zones: ['s', 'r'], effects: { decor: 1.5, appeal: 1, satisfaction: 1 }, tags: ['logo', 'branding', 'sign'], color: '#ff7a1a', description: 'Your company name and logo, lit, behind the reception. Showroom branding.' },
  { id: 'brandbanner', name: 'Brand banner', icon: '🎌', category: 'decoration', w: 1, h: 1, cost: 300, upkeep: 1, power: 0, zones: IN, effects: { decor: 0.4 }, tags: ['banner', 'branding', 'flag', 'logo'], color: '#ff7a1a', description: 'A hanging banner with your colours.' },
  { id: 'ledwall', name: 'LED video wall', icon: '🖥️', category: 'decoration', w: 3, h: 1, cost: 3500, upkeep: 15, power: 6, zones: ['s', 'r'], effects: { decor: 2, appeal: 0.8 }, minLevel: 2, tags: ['screen', 'scherm', 'video'], color: '#3cc7ff', description: 'Big screen with your stock on rotation.' },
  { id: 'screen', name: 'Info screen', icon: '📺', category: 'decoration', w: 1, h: 1, cost: 700, upkeep: 3, power: 1, zones: IN, effects: { decor: 0.3, sales: 0.5 }, tags: ['screen', 'scherm', 'digital'], color: '#111418', description: 'Offers and finance examples on a loop.' },
  { id: 'rug', name: 'Showroom rug', icon: '🟥', category: 'decoration', w: 3, h: 2, cost: 400, upkeep: 1, power: 0, zones: PUBLIC_IN, effects: { decor: 0.6 }, walkable: true, tags: ['carpet', 'floor', 'mat'], color: '#7a2a2a', description: 'Adds warmth to a room.' },
  { id: 'runner', name: 'Carpet runner', icon: '🟥', category: 'decoration', w: 1, h: 3, cost: 250, upkeep: 1, power: 0, zones: IN, effects: { decor: 0.3 }, walkable: true, tags: ['carpet', 'floor', 'path'], color: '#5b2020', description: 'A walkable strip that guides people through.' },
  { id: 'spotlight', name: 'Ceiling spotlights', icon: '💡', category: 'decoration', w: 1, h: 1, cost: 350, upkeep: 2, power: 1, zones: IN, walkable: true, effects: { lighting: 0.4 }, tags: ['light', 'lamp', 'ceiling', 'verlichting'], color: '#fff7e8', description: 'Aimed at the cars. Hangs from the ceiling, so people walk under it.' },
  { id: 'pendant', name: 'Pendant lights', icon: '💡', category: 'decoration', w: 1, h: 1, cost: 450, upkeep: 2, power: 1, zones: IN, walkable: true, effects: { lighting: 0.3, decor: 0.3 }, tags: ['light', 'lamp', 'ceiling', 'verlichting'], color: '#ffe8a8', description: 'Warm designer lights over desks and lounges.' },
  { id: 'ledstrip', name: 'LED light strip', icon: '💡', category: 'decoration', w: 2, h: 1, cost: 500, upkeep: 2, power: 1, zones: IN, walkable: true, effects: { lighting: 0.5 }, minLevel: 2, tags: ['light', 'ceiling', 'verlichting'], color: '#ffffff', description: 'Clean light lines across the ceiling.' },
  { id: 'floorlamp', name: 'Floor lamp', icon: '🪔', category: 'decoration', w: 1, h: 1, cost: 250, upkeep: 1, power: 1, zones: IN, effects: { lighting: 0.2, lounge: 0.1 }, tags: ['light', 'lamp', 'verlichting'], color: '#ffe8a8', description: 'Soft light in a corner.' },

  // ----------------------------------------------------------------- outdoor
  { id: 'gate', name: 'Entrance', icon: '🚪', category: 'outdoor', w: 4, h: 2, cost: 1000, upkeep: 2, power: 0, zones: OUT, edge: 'road', walkable: true, tags: ['entry', 'entree', 'drive', 'gate'], color: '#ff7a1a', description: 'Where customers come in from the street. Must touch the road (bottom edge).' },
  { id: 'grandgate', name: 'Grand entrance', icon: '🏁', category: 'outdoor', w: 6, h: 2, cost: 6500, upkeep: 12, power: 3, zones: OUT, edge: 'road', walkable: true, effects: { footfall: 1, curb: 1.5 }, minLevel: 2, tags: ['entry', 'entree', 'gate', 'arch'], color: '#ffc233', description: 'A wide, lit entrance with your name over it. More people turn in.' },
  { id: 'pylon', name: 'Pylon sign', icon: '🪧', category: 'outdoor', w: 2, h: 2, cost: 2500, upkeep: 10, power: 3, zones: OUT, effects: { footfall: 1, curb: 1 }, tags: ['sign', 'reclame', 'logo', 'totem'], color: '#ff7a1a', description: 'A tall sign visible from the road. More walk-ins.' },
  { id: 'billboard', name: 'Billboard', icon: '📢', category: 'outdoor', w: 4, h: 1, cost: 3800, upkeep: 30, power: 2, zones: OUT, effects: { footfall: 1, curb: 0.5 }, minLevel: 2, tags: ['sign', 'reclame', 'advert'], color: '#ffc233', description: 'Your offers, huge, facing the road.' },
  { id: 'banner', name: 'Banner', icon: '🎌', category: 'outdoor', w: 2, h: 1, cost: 400, upkeep: 2, power: 0, zones: ['a', 'g', 'x'], effects: { footfall: 0.3, curb: 0.3 }, tags: ['sale', 'sign', 'reclame'], color: '#ffc233', description: '"SALE" banners catch the eye.' },
  { id: 'flag', name: 'Flag pole', icon: '🚩', category: 'outdoor', w: 1, h: 1, cost: 150, upkeep: 1, power: 0, zones: OUT, effects: { curb: 0.4 }, tags: ['vlag'], color: '#3cc7ff', description: 'Flags make the lot look busy and bright.' },
  { id: 'lamp', name: 'Lamp post', icon: '💡', category: 'outdoor', w: 1, h: 1, cost: 600, upkeep: 3, power: 2, zones: [...OUT, 't'], effects: { curb: 0.4, security: 1 }, tags: ['light', 'verlichting', 'outdoor lighting', 'buitenverlichting'], color: '#ffe8a8', description: 'Lighting for the lot. Safer and more inviting.' },
  { id: 'floodlight', name: 'Floodlight', icon: '🔦', category: 'outdoor', w: 1, h: 1, cost: 1100, upkeep: 6, power: 4, zones: [...OUT, 't'], effects: { security: 1.5, curb: 0.3 }, tags: ['light', 'verlichting', 'security', 'buitenverlichting'], color: '#ffffff', description: 'Lights up the whole yard at night.' },
  { id: 'tree', name: 'Tree', icon: '🌳', category: 'outdoor', w: 2, h: 2, cost: 400, upkeep: 2, power: 0, zones: ['g', '.'], effects: { curb: 0.6 }, tags: ['green', 'boom'], color: '#2f7a4a', description: 'Shade and curb appeal.' },
  { id: 'palm', name: 'Palm tree', icon: '🌴', category: 'outdoor', w: 2, h: 2, cost: 900, upkeep: 5, power: 0, zones: ['g', '.', 'x'], effects: { curb: 1 }, minLevel: 2, tags: ['green', 'boom'], color: '#3f8a4a', description: 'A touch of the Riviera.' },
  { id: 'planter', name: 'Planter', icon: '🌼', category: 'outdoor', w: 1, h: 1, cost: 200, upkeep: 1, power: 0, zones: ['a', 'g', 'x'], effects: { curb: 0.3 }, tags: ['flowers', 'bloembak', 'green'], color: '#e1a84a', description: 'Flowers by the walkway.' },
  { id: 'flowerbed', name: 'Flower bed', icon: '🌷', category: 'outdoor', w: 3, h: 1, cost: 450, upkeep: 4, power: 0, zones: ['g', 'x', 'a'], effects: { curb: 0.7 }, tags: ['flowers', 'bloembak', 'green'], color: '#ff6b81', description: 'A bright strip of flowers.' },
  { id: 'hedge', name: 'Hedge', icon: '🌿', category: 'outdoor', w: 1, h: 1, cost: 60, upkeep: 1, power: 0, zones: ['g', '.', 'a', 'x', 't'], line: true, effects: { curb: 0.05 }, tags: ['green', 'haag', 'border'], color: '#2f6a3a', description: 'A low hedge. Drag to plant a line.' },
  { id: 'bench', name: 'Bench', icon: '🪑', category: 'outdoor', w: 2, h: 1, cost: 300, upkeep: 1, power: 0, zones: ['a', 'g', 'x'], effects: { lounge: 0.3, curb: 0.2 }, tags: ['seat', 'bank', 'street furniture', 'straatmeubilair'], color: '#8a6a4a', description: 'Outdoor seating.' },
  { id: 'bin', name: 'Litter bin', icon: '🗑️', category: 'outdoor', w: 1, h: 1, cost: 90, upkeep: 1, power: 0, zones: ['a', 'g', 'x'], effects: { curb: 0.1 }, tags: ['street furniture', 'straatmeubilair', 'clean'], color: '#51606f', description: 'A tidy lot is a welcoming lot.' },
  { id: 'bikerack', name: 'Bike rack', icon: '🚲', category: 'outdoor', w: 2, h: 1, cost: 250, upkeep: 0, power: 0, zones: ['a', 'x', 'g'], effects: { visitorParking: 0.5 }, tags: ['street furniture', 'straatmeubilair', 'fiets'], color: '#a3abb6', description: 'Some customers come by bike.' },
  { id: 'fountain', name: 'Fountain', icon: '⛲', category: 'outdoor', w: 3, h: 3, cost: 5500, upkeep: 20, power: 2, zones: ['g', 'x'], effects: { curb: 2, satisfaction: 1 }, minLevel: 3, tags: ['water', 'feature'], color: '#3cc7ff', description: 'A landmark in front of your showroom.' },
  { id: 'fence', name: 'Fence', icon: '🚧', category: 'outdoor', w: 1, h: 1, cost: 45, upkeep: 0, power: 0, zones: ['a', 'g', '.', 't', 'x'], line: true, effects: { security: 0.05 }, tags: ['hek', 'border', 'security'], color: '#6b7480', description: 'A metal fence. Drag to draw a line. People go around it.' },

  // ---------------------------------------------------------------- security
  { id: 'camera', name: 'Security camera', icon: '📹', category: 'security', w: 1, h: 1, cost: 900, upkeep: 12, power: 1, zones: ['a', 't', 'g', 'x', ...IN], effects: { security: 2 }, tags: ['cctv', 'camera', 'beveiliging'], color: '#6b7480', description: 'Lowers insurance on your stock.' },
  { id: 'alarm', name: 'Alarm panel', icon: '🚨', category: 'security', w: 1, h: 1, cost: 1400, upkeep: 15, power: 1, zones: IN, effects: { security: 2 }, tags: ['alarm', 'sensor', 'beveiliging'], color: '#ff4d5e', description: 'Motion sensors and a monitored alarm.' },
  { id: 'bollard', name: 'Bollard', icon: '⛔', category: 'security', w: 1, h: 1, cost: 150, upkeep: 0, power: 0, zones: ['a', 'x', 'g', '.'], effects: { security: 0.3 }, tags: ['post', 'paal', 'barrier'], color: '#ffc233', description: 'Stops cars being driven out after hours.' },
  { id: 'barrier', name: 'Barrier gate', icon: '🚧', category: 'security', w: 3, h: 1, cost: 1800, upkeep: 8, power: 1, zones: ['a', 't'], walkable: true, effects: { security: 1.5 }, tags: ['gate', 'slagboom', 'hek'], color: '#ff4d5e', description: 'A lifting barrier at the yard entrance.' },
  { id: 'securitybooth', name: 'Security booth', icon: '💂', category: 'security', w: 2, h: 2, cost: 4500, upkeep: 40, power: 2, zones: ['a', 't', 'x'], station: ['security'], effects: { security: 3 }, minLevel: 2, tags: ['guard', 'beveiliging'], color: '#51606f', description: 'A guarded booth for the lot. Big insurance savings on large stock.' },
  // ------------------------------------------------------------ v4 additions
  { id: 'deliverybay', name: 'Delivery bay', icon: '🎁', category: 'customer', w: 4, h: 6, cost: 4200, upkeep: 25, power: 3, zones: ['e', 's'], station: ['delivery'], effects: { satisfaction: 2 }, minLevel: 2, tags: ['handover', 'delivery', 'aflevering', 'reveal'], color: '#8e7cc3', description: 'A lit stage where customers collect their new car. Better reviews for every handover, and a workplace for a delivery specialist.' },
  { id: 'financebooth', name: 'Finance booth', icon: '🏦', category: 'showroom', w: 2, h: 2, cost: 2600, upkeep: 25, power: 1, zones: ['f', 's', 'r'], station: ['finance'], effects: { finance: 1.5, satisfaction: 1 }, minLevel: 2, tags: ['desk', 'finance', 'loan', 'lease', 'office'], color: '#6fb08a', description: 'A private booth for a finance manager: more applications approved and more protection products sold.' },
  { id: 'janitor', name: 'Cleaning cupboard', icon: '🧹', category: 'service', w: 1, h: 1, cost: 350, upkeep: 3, power: 0, zones: ['k', 'b', 'o', 'r', 's', 'l', 'w', 'd', 'p', 'v', 'e', 'f'], station: ['cleaner'], tags: ['cleaner', 'schoonmaak', 'storage', 'staff'], color: '#7a8a99', description: 'Where a cleaner keeps their kit. Needed to hire a cleaner.' },
  { id: 'evdiagstation', name: 'EV diagnostic station', icon: '⚡', category: 'service', w: 2, h: 1, cost: 6500, upkeep: 40, power: 3, zones: ['w'], station: ['technician'], effects: { equipment: 0.5, ev: 0.5 }, minLevel: 2, tags: ['ev', 'electric', 'battery', 'technician', 'diagnostics', 'technology'], color: '#2fd18b', description: 'High-voltage test gear for electric cars. A technician works here; EV buyers trust you more.' },
  { id: 'crmterminal', name: 'CRM terminal', icon: '💻', category: 'office', w: 1, h: 1, cost: 1500, upkeep: 12, power: 1, zones: ['s', 'r', 'o', 'f', 'm'], effects: { sales: 2 }, tags: ['computer', 'technology', 'crm', 'software', 'sales'], color: '#4f8cff', description: 'Customer history at a glance: salespeople close a little more.' },
  { id: 'serverrack', name: 'Server & network rack', icon: '🖧', category: 'office', w: 1, h: 1, cost: 2500, upkeep: 20, power: 3, zones: ['o', 'm', 'k'], effects: { sales: 1, finance: 0.5 }, minLevel: 2, tags: ['technology', 'it', 'computer', 'network'], color: '#51606f', description: 'Fast systems for quotes and finance: small boost to sales and finance.' },
  { id: 'partscounter', name: 'Parts counter', icon: '🧾', category: 'service', w: 3, h: 1, cost: 1400, upkeep: 8, power: 1, zones: ['p', 'v'], effects: { service: 1 }, tags: ['parts', 'storage', 'counter', 'balie', 'onderdelen'], color: '#a3876b', description: 'Hands parts to the workshop and sells them over the counter.' },
  { id: 'champagnebar', name: 'Champagne bar', icon: '🥂', category: 'customer', w: 3, h: 1, cost: 6500, upkeep: 45, power: 2, zones: ['l', 's', 'e'], effects: { satisfaction: 4, appeal: 0.4, lounge: 0.5 }, minLevel: 3, tags: ['premium', 'luxury', 'vip', 'bar', 'coffee'], color: '#e6c56b', description: 'For buyers who spend six figures. Premium customers leave very happy.' },
  { id: 'vipsofa', name: 'VIP lounge suite', icon: '🛋️', category: 'customer', w: 4, h: 2, cost: 5200, upkeep: 25, power: 0, zones: ['l', 's', 'e'], effects: { lounge: 1.2, satisfaction: 2 }, minLevel: 3, tags: ['premium', 'luxury', 'vip', 'seating', 'sofa'], color: '#6c4a3a', description: 'A private seating area for premium customers.' },
  { id: 'digitalpylon', name: 'Digital pylon', icon: '📺', category: 'outdoor', w: 2, h: 2, cost: 7500, upkeep: 40, power: 5, zones: OUT, effects: { footfall: 1.2, curb: 1 }, minLevel: 3, tags: ['sign', 'screen', 'marketing', 'advertising', 'reclame', 'technology'], color: '#4f8cff', description: 'A tall LED sign showing today\'s offers to passing traffic.' },
  { id: 'flagrow', name: 'Flag row', icon: '🎌', category: 'outdoor', w: 3, h: 1, cost: 450, upkeep: 2, power: 0, zones: OUT, effects: { curb: 0.6, footfall: 0.2 }, tags: ['flag', 'vlag', 'marketing', 'branding'], color: '#ff7a1a', description: 'Three branded flags along the road.' },
  { id: 'solarcarport', name: 'Solar carport space', icon: '☀️', category: 'vehicles', w: 3, h: 5, cost: 5200, upkeep: 15, power: 0, zones: ['a'], slot: 'parking', spot: { attention: 5, wtp: 0.015, fit: 'ev' }, effects: { ev: 1, curb: 0.3 }, minLevel: 2, tags: ['car', 'space', 'parking', 'electric', 'ev', 'solar', 'charger'], color: '#f1c40f', description: 'A covered parking space with solar panels and a charger. Great for showing EVs.' },
  { id: 'hpcharger', name: 'Fast charger', icon: '⚡', category: 'vehicles', w: 1, h: 1, cost: 6500, upkeep: 35, power: 8, zones: ['a', 'x'], effects: { ev: 2 }, minLevel: 2, tags: ['electric', 'ev', 'charging', 'laadpaal', 'snellader', 'technology'], color: '#2fd18b', description: 'A 150 kW fast charger. EV buyers notice — and so does the council.' },
  { id: 'carwash', name: 'Automatic car wash', icon: '🚿', category: 'service', w: 4, h: 8, cost: 18000, upkeep: 90, power: 10, zones: ['d'], slot: 'bay', station: ['detailer', 'prep'], effects: { detailing: 1.3 }, minLevel: 2, tags: ['wash', 'wasstraat', 'detailing', 'clean'], color: '#3f8fd1', description: 'A drive-through wash tunnel: detailing is faster and cheaper, and it takes customer valets.' },
  { id: 'deliverylight', name: 'Reveal spotlights', icon: '💡', category: 'decoration', w: 1, h: 1, cost: 600, upkeep: 3, power: 1, zones: ['e', 's'], walkable: true, effects: { lighting: 1, satisfaction: 0.5 }, tags: ['light', 'lamp', 'spot', 'delivery'], color: '#fff3b0', description: 'Theatre lights for the big reveal.' },
  { id: 'brandportal', name: 'Brand portal', icon: '🏷️', category: 'decoration', w: 4, h: 1, cost: 4800, upkeep: 20, power: 2, zones: ['s', 'r'], effects: { appeal: 1, decor: 1 }, minLevel: 2, tags: ['logo', 'branding', 'brand', 'sign', 'marketing', 'premium'], color: '#d4af37', description: 'A backlit wall with the brands you sell. Required look for official dealers.' },
  // ---------------------------------------------------- v6: structure
  { id: 'canopy', name: 'Entrance canopy', icon: '⛱️', category: 'structure', w: 4, h: 2, cost: 2200, upkeep: 6, power: 1, zones: [...OUT, 'x'], walkable: true, effects: { curb: 0.6, footfall: 0.2, satisfaction: 0.3 }, tags: ['roof', 'dak', 'entrance', 'shelter', 'overkapping'], color: '#c8ccd2', description: 'A lit roof over the way in. Visitors arrive dry and the entrance looks like a real dealership.' },
  { id: 'roofcanopy', name: 'Covered walkway', icon: '🏗️', category: 'structure', w: 3, h: 3, cost: 1600, upkeep: 4, power: 0.5, zones: ['a', 'x', 'j'], walkable: true, effects: { satisfaction: 0.4, curb: 0.2 }, tags: ['roof', 'dak', 'shelter', 'column'], color: '#9aa3ad', description: 'Columns and a roof over the walkway between the lot and the showroom.' },
  { id: 'partition', name: 'Office partition', icon: '▮', category: 'structure', w: 1, h: 1, cost: 90, upkeep: 0, power: 0, zones: IN, line: true, effects: { decor: 0.03 }, tags: ['wall', 'partition', 'office', 'muur'], color: '#b8bec6', description: 'A light partition screen. Drag to draw; divides open offices into desks.' },
  { id: 'receptionpod', name: 'Reception pod', icon: '🛎️', category: 'structure', w: 3, h: 3, cost: 3600, upkeep: 12, power: 1, zones: ['r', 's', 'q'], station: ['reception'], effects: { reception: 1, satisfaction: 1.5, appeal: 0.3 }, minLevel: 2, tags: ['reception', 'receptie', 'desk', 'island', 'balie'], color: '#e6dccb', description: 'A round reception island in the middle of the room. Visitors see someone at once from every side.' },
  { id: 'cubicle', name: 'Office cubicle', icon: '🗂️', category: 'office', w: 2, h: 2, cost: 850, upkeep: 4, power: 1, zones: ['o', 'm', 'n', 'u'], station: ['admin', 'buyer', 'marketing', 'accountant', 'inventory', 'procurement'], effects: { management: 0.2 }, tags: ['desk', 'bureau', 'office', 'workstation'], color: '#9aa3ad', description: 'A screened desk for back-office staff. Quieter than an open desk.' },
  // ---------------------------------------------------- v6: showroom
  { id: 'platform', name: 'Display platform', icon: '🔶', category: 'showroom', w: 5, h: 7, cost: 6200, upkeep: 40, power: 4, zones: ['s', 'q'], slot: 'display', spot: { attention: 14, wtp: 0.02, fit: 'any' }, effects: { appeal: 1.3, lighting: 0.3 }, minLevel: 2, unlock: { sold: 15 }, tags: ['car', 'vehicle', 'podium', 'raised', 'auto', 'display'], color: '#ff9a4d', description: 'A raised, lit platform. The car on it is the first thing people walk to.' },
  { id: 'featurewall', name: 'Feature wall', icon: '🧱', category: 'showroom', w: 3, h: 1, cost: 1900, upkeep: 4, power: 1, zones: ['s', 'r', 'l', 'q'], effects: { decor: 1.2, appeal: 0.6 }, tags: ['wall', 'branding', 'backdrop'], color: '#8a6a4a', description: 'A textured, lit wall behind your best cars.' },
  { id: 'digiscreen', name: 'Digital screen', icon: '🖥️', category: 'technology', w: 2, h: 1, cost: 1600, upkeep: 8, power: 2, zones: ['s', 'r', 'l', 'v', 'q'], effects: { appeal: 0.5, sales: 1 }, tags: ['screen', 'scherm', 'digital', 'technology', 'showroom'], color: '#3cc7ff', description: 'Specs, finance examples and reviews of the car in front of it.' },
  { id: 'showroomseat', name: 'Showroom seating', icon: '💺', category: 'customer', w: 2, h: 1, cost: 480, upkeep: 1, power: 0, zones: PUBLIC_IN, effects: { lounge: 0.5, appeal: 0.1 }, tags: ['seat', 'seating', 'chair', 'stoel', 'showroom'], color: '#51606f', description: 'Two seats facing the cars. People sit, look and imagine owning one.' },
  // ---------------------------------------------------- v6: workshop & service
  { id: 'inspectionlane', name: 'Inspection lane', icon: '🔎', category: 'service', w: 4, h: 6, cost: 7800, upkeep: 50, power: 5, zones: ['w'], slot: 'lift', station: ['mechanic', 'technician'], effects: { workshop: 0.6, equipment: 0.5 }, minLevel: 2, tags: ['inspection', 'apk', 'mot', 'pit', 'bay', 'keuring', 'werkplaats'], color: '#ffc233', description: 'A lane with a pit and test gear. Works like a lift for inspections and repairs and finds more hidden faults.' },
  { id: 'repairstation', name: 'Repair station', icon: '🛠️', category: 'service', w: 2, h: 2, cost: 2100, upkeep: 10, power: 2, zones: ['w'], effects: { workshop: 0.8, service: 0.3 }, tags: ['repair', 'tools', 'mechanic', 'gereedschap'], color: '#d84a3a', description: 'A mobile station with the tools for most repairs. Work at the lifts next to it goes faster.' },
  { id: 'toolcabinet', name: 'Tool cabinet', icon: '🧰', category: 'storage', w: 2, h: 1, cost: 750, upkeep: 2, power: 0, zones: ['w', 'p', 'd'], effects: { workshop: 0.3, service: 0.3 }, tags: ['tools', 'storage', 'cabinet', 'kast', 'gereedschap'], color: '#b3202a', description: 'Every tool in its place: less time looking, more time fixing.' },
  { id: 'alignment', name: 'Wheel alignment rig', icon: '🎯', category: 'service', w: 2, h: 2, cost: 4600, upkeep: 15, power: 2, zones: ['w'], effects: { workshop: 0.6, service: 0.4 }, minLevel: 2, tags: ['tyres', 'banden', 'alignment', 'uitlijnen', 'tools'], color: '#6b7480', description: 'Laser wheel alignment. Tyre and suspension jobs done in-house.' },
  { id: 'aircon', name: 'Air-con service unit', icon: '❄️', category: 'service', w: 1, h: 1, cost: 1900, upkeep: 8, power: 1, zones: ['w'], effects: { service: 0.5 }, tags: ['airco', 'aircon', 'climate', 'service'], color: '#9fd8ff', description: 'Refills and checks air-conditioning while the car is in.' },
  { id: 'batteryservice', name: 'Battery service bay', icon: '🔋', category: 'ev', w: 3, h: 2, cost: 8200, upkeep: 40, power: 4, zones: ['w'], station: ['technician'], effects: { ev: 0.5, equipment: 0.5, service: 0.5 }, minLevel: 2, unlock: { evSold: 2 }, tags: ['ev', 'electric', 'battery', 'accu', 'technician', 'high voltage'], color: '#2fd18b', description: 'Insulated tools and a battery lift for electric cars. EV owners trust your workshop.' },
  { id: 'servicewait', name: 'Service waiting area', icon: '🪑', category: 'customer', w: 3, h: 2, cost: 1300, upkeep: 4, power: 1, zones: ['v', 'l', 'r', 'q'], effects: { lounge: 0.8, satisfaction: 0.5 }, tags: ['waiting', 'seating', 'service', 'wachtruimte'], color: '#6b7480', description: 'Seats, sockets and a view of the workshop for customers waiting on their car.' },
  // ---------------------------------------------------- v6: staff
  { id: 'hrdesk', name: 'HR desk', icon: '🧑‍💼', category: 'staff', w: 2, h: 2, cost: 1700, upkeep: 12, power: 1, zones: ['o', 'm'], station: ['admin', 'manager'], effects: { morale: 0.6, management: 0.3 }, unlock: { staff: 4 }, tags: ['hr', 'personnel', 'personeel', 'desk', 'office'], color: '#8e7cc3', description: 'Someone who handles contracts, holidays and complaints. The team feels looked after.' },
  { id: 'trainingscreen', name: 'Training screen', icon: '🎓', category: 'staff', w: 2, h: 1, cost: 1400, upkeep: 6, power: 2, zones: ['u', 'o', 'k', 'n'], effects: { training: 1 }, tags: ['training', 'course', 'cursus', 'screen', 'education'], color: '#4f8cff', description: 'E-learning and manufacturer courses on a big screen.' },
  { id: 'trainingdesk', name: 'Training desks', icon: '📝', category: 'staff', w: 3, h: 2, cost: 2600, upkeep: 8, power: 1, zones: ['u'], effects: { training: 1.5, morale: 0.2 }, minLevel: 2, unlock: { staff: 5 }, tags: ['training', 'course', 'desk', 'classroom'], color: '#6f8fa8', description: 'A classroom setup: staff learn faster and like being invested in.' },
  { id: 'breaktable', name: 'Break table', icon: '🍽️', category: 'staff', w: 2, h: 2, cost: 700, upkeep: 1, power: 0, zones: ['k'], effects: { morale: 0.6 }, tags: ['staff', 'break', 'lunch', 'table', 'personeel'], color: '#8a6a4a', description: 'Lunch together. Small thing, big difference to morale.' },
  { id: 'staffparking', name: 'Staff parking', icon: '🅿️', category: 'parking', w: 3, h: 5, cost: 900, upkeep: 4, power: 0, zones: ['a', 't'], effects: { morale: 0.4 }, tags: ['parking', 'staff', 'personeel', 'space'], color: '#8e7cc3', description: 'Reserved spaces for your team, away from customers’ view.' },
  // ---------------------------------------------------- v6: customer
  { id: 'infodesk', name: 'Information desk', icon: 'ℹ️', category: 'customer', w: 2, h: 1, cost: 1100, upkeep: 5, power: 1, zones: ['r', 's', 'v', 'q'], station: ['reception'], effects: { reception: 0.5, satisfaction: 0.5, wayfinding: 0.5 }, tags: ['info', 'desk', 'welcome', 'balie'], color: '#3cc7ff', description: 'Directions and a friendly face. Visitors find the right person sooner.' },
  { id: 'loungeset', name: 'Lounge set', icon: '🛋️', category: 'customer', w: 3, h: 3, cost: 2400, upkeep: 6, power: 0, zones: ['l', 'r', 's', 'q'], effects: { lounge: 1.5, satisfaction: 0.5 }, tags: ['sofa', 'seating', 'lounge', 'bank'], color: '#5b4b8a', description: 'Sofas around a low table: the heart of a customer lounge.' },
  { id: 'handoverdesk', name: 'Handover desk', icon: '🔑', category: 'customer', w: 2, h: 2, cost: 1500, upkeep: 6, power: 1, zones: ['e', 's'], station: ['delivery', 'sales'], effects: { satisfaction: 1 }, tags: ['delivery', 'handover', 'aflevering', 'keys', 'desk'], color: '#9b8cff', description: 'Where the paperwork is signed and the keys change hands.' },
  // ---------------------------------------------------- v6: vehicles & parking
  { id: 'outdoordisplay', name: 'Outdoor display pad', icon: '🔆', category: 'vehicles', w: 4, h: 6, cost: 2600, upkeep: 18, power: 1.5, zones: ['a', 'x'], slot: 'parking', spot: { attention: 9, wtp: 0.01, fit: 'any' }, effects: { curb: 0.4 }, tags: ['car', 'auto', 'display', 'outdoor', 'pad', 'lit'], color: '#ff9a4d', description: 'A lit, raised pad on the lot. Draws the eye from the road.' },
  { id: 'newcarrow', name: 'New-car row space', icon: '🆕', category: 'vehicles', w: 3, h: 5, cost: 1900, upkeep: 14, power: 0.5, zones: ['a'], slot: 'parking', spot: { attention: 7, wtp: 0.012, fit: 'new' }, effects: { curb: 0.1 }, tags: ['car', 'auto', 'space', 'new', 'nieuw', 'parking'], color: '#3cc7ff', description: 'A branded space for brand-new cars. New cars here get more attention and firmer prices.' },
  { id: 'usedrow', name: 'Used-car row space', icon: '🔁', category: 'vehicles', w: 3, h: 5, cost: 1300, upkeep: 10, power: 0, zones: ['a'], slot: 'parking', spot: { attention: 7, wtp: 0.008, fit: 'used' }, tags: ['car', 'auto', 'space', 'used', 'occasion', 'tweedehands', 'parking'], color: '#e1a84a', description: 'A row for used cars with price boards. Used-car buyers browse here first.' },
  { id: 'tradein', name: 'Trade-in bay', icon: '🔄', category: 'vehicles', w: 3, h: 5, cost: 1100, upkeep: 8, power: 0, zones: ['a', 't'], slot: 'storage', effects: { logistics: 0.3 }, tags: ['car', 'space', 'trade-in', 'inruil', 'storage', 'parking'], color: '#b8a878', description: 'Where part-exchanged cars wait for appraisal. Keeps the lot tidy.' },
  { id: 'deliveryparking', name: 'Delivery parking', icon: '🚚', category: 'parking', w: 3, h: 5, cost: 1200, upkeep: 8, power: 0, zones: ['a', 't', 'j'], slot: 'storage', effects: { logistics: 0.5 }, tags: ['car', 'space', 'delivery', 'transport', 'logistics', 'parking'], color: '#8d949c', description: 'A drop-off space for transporters. Deliveries are unloaded without blocking the lot.' },
  { id: 'vipparking', name: 'VIP parking', icon: '🎩', category: 'parking', w: 3, h: 5, cost: 2400, upkeep: 12, power: 0.5, zones: ['a'], effects: { visitorParking: 0.5, satisfaction: 1 }, minLevel: 2, tags: ['parking', 'vip', 'premium', 'customer', 'guest'], color: '#d4af37', description: 'Reserved spaces by the door for your best customers.' },
  // ---------------------------------------------------- v6: EV
  { id: 'multicharger', name: 'Charging hub (4 points)', icon: '⚡', category: 'ev', w: 3, h: 1, cost: 9800, upkeep: 45, power: 10, zones: ['a', 'j'], effects: { ev: 2.5 }, minLevel: 3, unlock: { evSold: 3 }, tags: ['ev', 'electric', 'charger', 'charging', 'laadpaal', 'hub'], color: '#2fd18b', description: 'Four charging points on one cabinet. EV buyers see you as the EV dealer in town.' },
  { id: 'evdelivery', name: 'EV handover bay', icon: '🔌', category: 'ev', w: 4, h: 6, cost: 5400, upkeep: 30, power: 4, zones: ['e', 's', 'q'], station: ['delivery'], effects: { ev: 0.5, satisfaction: 1 }, minLevel: 2, tags: ['ev', 'electric', 'delivery', 'handover', 'aflevering'], color: '#2fd18b', description: 'A handover bay with a charger: every EV leaves at 100% with a charging lesson.' },
  // ---------------------------------------------------- v6: exterior & infrastructure
  { id: 'directionsign', name: 'Direction sign', icon: '🪧', category: 'outdoor', w: 1, h: 1, cost: 250, upkeep: 0, power: 0, zones: [...OUT, 't'], effects: { wayfinding: 1 }, tags: ['sign', 'bord', 'route', 'signage', 'directions'], color: '#3cc7ff', description: '“Showroom →”, “Service ←”. Visitors find their way without asking.' },
  { id: 'arrows', name: 'Road arrows', icon: '⬆️', category: 'outdoor', w: 1, h: 2, cost: 120, upkeep: 0, power: 0, zones: ['a', 'j'], walkable: true, effects: { wayfinding: 0.5 }, tags: ['markings', 'road', 'arrow', 'lines', 'parking lines'], color: '#e9ecef', description: 'Painted arrows that guide traffic through the lot.' },
  { id: 'crossing', name: 'Pedestrian crossing', icon: '🦓', category: 'outdoor', w: 3, h: 2, cost: 400, upkeep: 1, power: 0, zones: ['a', 'j'], walkable: true, effects: { wayfinding: 1, satisfaction: 0.3 }, tags: ['crossing', 'zebra', 'pedestrian', 'road', 'markings', 'route'], color: '#e9ecef', description: 'A zebra crossing between the parking and the showroom. Safer and clearer.' },
  { id: 'bollardlight', name: 'Bollard light', icon: '🕯️', category: 'outdoor', w: 1, h: 1, cost: 380, upkeep: 2, power: 1, zones: ['a', 'x', 'g', 'j'], effects: { curb: 0.2, security: 0.4, wayfinding: 0.3 }, tags: ['light', 'lamp', 'verlichting', 'path', 'street lights'], color: '#ffe8a8', description: 'Low lights along the path. Pretty at dusk, safer at night.' },
  { id: 'serviceentrance', name: 'Service entrance', icon: '🔧', category: 'outdoor', w: 4, h: 2, cost: 3200, upkeep: 6, power: 1, zones: OUT, edge: 'road', walkable: true, effects: { service: 1, wayfinding: 0.5 }, minLevel: 2, unlock: { land: 1 }, tags: ['entrance', 'entree', 'service', 'workshop', 'road', 'infrastructure'], color: '#3cc7ff', description: 'A separate way in for service customers. Workshop traffic stops clogging the sales lot.' },
  { id: 'deliveryentrance', name: 'Delivery entrance', icon: '🚛', category: 'outdoor', w: 4, h: 2, cost: 3800, upkeep: 6, power: 1, zones: OUT, edge: 'road', walkable: true, effects: { logistics: 1 }, minLevel: 2, unlock: { land: 2 }, tags: ['entrance', 'delivery', 'transport', 'logistics', 'road', 'infrastructure'], color: '#8d949c', description: 'A gate for car transporters. Cheaper, quicker deliveries.' },
  { id: 'carsculpture', name: 'Car sculpture', icon: '🗿', category: 'outdoor', w: 2, h: 2, cost: 4200, upkeep: 4, power: 1, zones: ['g', 'x', 'a'], effects: { curb: 1.2, footfall: 0.3 }, minLevel: 2, tags: ['art', 'statue', 'landmark', 'decoration'], color: '#c8ccd2', description: 'A classic car on a plinth at the front. People stop to take photos.' },
  // ---------------------------------------------------- v6: technology
  { id: 'digishowroom', name: 'Digital showroom wall', icon: '📺', category: 'technology', w: 4, h: 1, cost: 12500, upkeep: 45, power: 8, zones: ['s', 'q'], effects: { appeal: 1, sales: 2, decor: 1 }, minLevel: 3, unlock: { profit: 100000 }, tags: ['screen', 'digital', 'technology', 'configurator', 'video'], color: '#4f8cff', description: 'A life-size configurator: customers build their car on the wall and see stock you do not have on the floor.' },
  { id: 'pricedisplay', name: 'Digital price board', icon: '💲', category: 'technology', w: 1, h: 1, cost: 650, upkeep: 3, power: 1, zones: ['s', 'a', 'x'], effects: { sales: 1, wayfinding: 0.3 }, tags: ['price', 'screen', 'digital', 'technology', 'sign'], color: '#111418', description: 'Always-correct prices next to the car. Fewer questions, faster decisions.' },
  { id: 'vehiclescanner', name: 'Drive-through scanner', icon: '📡', category: 'technology', w: 4, h: 2, cost: 16000, upkeep: 60, power: 6, zones: ['w', 'v', 'a', 'j'], walkable: true, effects: { equipment: 1, service: 0.5 }, minLevel: 3, tags: ['scanner', 'technology', 'diagnostics', 'tyres', 'damage', 'inspection'], color: '#9b8cff', description: 'Cameras scan tyres, damage and underbody as cars drive in. Nothing is missed.' },
  { id: 'wifi', name: 'Wi-Fi access point', icon: '📶', category: 'technology', w: 1, h: 1, cost: 300, upkeep: 3, power: 0.5, zones: IN, effects: { lounge: 0.3, sales: 0.5 }, tags: ['wifi', 'internet', 'technology', 'network'], color: '#3cc7ff', description: 'Free Wi-Fi. Waiting customers browse your stock instead of your rivals’.' },
  { id: 'digisign', name: 'Digital signage', icon: '🪧', category: 'technology', w: 1, h: 1, cost: 900, upkeep: 4, power: 1, zones: [...IN, 'a', 'x'], effects: { wayfinding: 0.5, appeal: 0.2 }, tags: ['sign', 'screen', 'digital', 'technology', 'directions'], color: '#4f8cff', description: 'Screens that point the way and show today’s offers.' },
  // ---------------------------------------------------- v6: security
  { id: 'securityoffice', name: 'Security office', icon: '🛡️', category: 'security', w: 3, h: 3, cost: 7200, upkeep: 45, power: 2, zones: ['o', 'a', 't'], station: ['security'], effects: { security: 3 }, minLevel: 2, unlock: { staff: 6 }, tags: ['guard', 'security', 'beveiliging', 'cctv', 'office'], color: '#51606f', description: 'Screens for every camera and a desk for a guard.' },
  { id: 'securestorage', name: 'Secure vehicle storage', icon: '🔐', category: 'security', w: 3, h: 5, cost: 2600, upkeep: 14, power: 0.5, zones: ['t'], slot: 'storage', effects: { security: 0.8 }, minLevel: 2, tags: ['storage', 'secure', 'car', 'space', 'hidden', 'parking'], color: '#51606f', description: 'A caged, alarmed space for your most valuable stock.' },
  // ---------------------------------------------------- v6: marketing
  { id: 'digibillboard', name: 'Digital billboard', icon: '🖼️', category: 'marketing', w: 4, h: 1, cost: 11000, upkeep: 60, power: 6, zones: OUT, effects: { footfall: 1.3, curb: 0.5, marketing: 0.5 }, minLevel: 3, tags: ['billboard', 'screen', 'advert', 'reclame', 'marketing', 'digital'], color: '#4f8cff', description: 'Rotating ads for today’s offers, facing the traffic.' },
  { id: 'promodisplay', name: 'Promo display', icon: '🏷️', category: 'marketing', w: 2, h: 1, cost: 700, upkeep: 2, power: 0.5, zones: ['s', 'a', 'x', 'q'], effects: { appeal: 0.4, marketing: 0.5 }, tags: ['promo', 'offer', 'marketing', 'sign', 'actie'], color: '#ff7a1a', description: '“This week only” — a stand with your current deal.' },
  { id: 'eventstage', name: 'Event stage', icon: '🎤', category: 'marketing', w: 5, h: 4, cost: 8500, upkeep: 30, power: 4, zones: ['a', 'x', 's', 'g'], effects: { footfall: 1, marketing: 1, satisfaction: 0.5 }, minLevel: 3, unlock: { land: 2 }, tags: ['event', 'stage', 'launch', 'marketing', 'podium'], color: '#9b8cff', description: 'For launch evenings and open days. The whole town comes to see.' },
  { id: 'marketingdesk', name: 'Marketing desk', icon: '📣', category: 'marketing', w: 2, h: 2, cost: 1500, upkeep: 8, power: 1, zones: ['n', 'o'], station: ['marketing'], effects: { marketing: 1 }, tags: ['marketing', 'desk', 'campaign', 'social', 'office'], color: '#ff7a1a', description: 'Two screens and a camera: a marketing specialist here runs better campaigns.' },
  // ---------------------------------------------------- v6: storage
  { id: 'documents', name: 'Vehicle document cabinet', icon: '🗄️', category: 'storage', w: 1, h: 1, cost: 450, upkeep: 0, power: 0, zones: ['o', 'm', 'r', 'f'], effects: { management: 0.3, finance: 0.2 }, tags: ['documents', 'papers', 'kast', 'storage', 'cabinet', 'keys'], color: '#6b7480', description: 'Registration papers and spare keys, filed per car.' },
  { id: 'storagerack', name: 'Storage rack', icon: '📦', category: 'storage', w: 3, h: 1, cost: 600, upkeep: 1, power: 0, zones: ['p', 't', 'o', 'k', 'w'], effects: { service: 0.3 }, tags: ['storage', 'rack', 'shelf', 'kast', 'opslag'], color: '#b8a878', description: 'Heavy shelving for everything else.' },
  { id: 'tyrestore', name: 'Tyre hotel', icon: '🛞', category: 'storage', w: 4, h: 2, cost: 2200, upkeep: 6, power: 0, zones: ['p', 't', 'w'], effects: { service: 0.8 }, tags: ['tyres', 'banden', 'storage', 'seasonal', 'opslag'], color: '#51606f', description: 'Customers’ summer and winter tyres stored for a fee — they come back every season.' },
  // ---------------------------------------------------- v6: decoration
  { id: 'cornersofa', name: 'Corner sofa', icon: '🛋️', category: 'customer', w: 3, h: 3, cost: 1300, upkeep: 3, power: 0, zones: PUBLIC_IN, effects: { lounge: 1.2 }, tags: ['sofa', 'seating', 'bank', 'lounge'], color: '#6c4a3a', description: 'Room for a whole family.' },
  { id: 'carart', name: 'Classic car print', icon: '🖼️', category: 'decoration', w: 2, h: 1, cost: 450, upkeep: 0, power: 0, zones: IN, effects: { decor: 0.6 }, tags: ['art', 'poster', 'print', 'car-related'], color: '#c9a36b', description: 'A framed print of a racing legend.' },
  { id: 'wheeldisplay', name: 'Chrome wheel stand', icon: '⚙️', category: 'decoration', w: 1, h: 1, cost: 600, upkeep: 0, power: 0, zones: ['s', 'r', 'l', 'q'], effects: { decor: 0.5, appeal: 0.2 }, tags: ['wheel', 'rim', 'velg', 'car-related', 'display'], color: '#c8ccd2', description: 'Polished alloys on a stand. Upsells come naturally.' },
  { id: 'brandclock', name: 'Brand clock', icon: '🕰️', category: 'decoration', w: 1, h: 1, cost: 350, upkeep: 0, power: 0, zones: IN, effects: { decor: 0.4 }, tags: ['clock', 'branding', 'logo', 'brand decorations'], color: '#ff7a1a', description: 'A big clock with your logo.' },
  // ---------------------------------------------------- v6: premium
  { id: 'luxreception', name: 'Luxury reception', icon: '🏛️', category: 'premium', w: 5, h: 2, cost: 9500, upkeep: 45, power: 2, zones: ['r', 's', 'q'], station: ['reception'], effects: { reception: 1.5, satisfaction: 4, appeal: 1 }, minLevel: 3, tags: ['reception', 'receptie', 'luxury', 'premium', 'marble', 'desk'], color: '#f2efe9', description: 'Marble, brass and a concierge. Premium buyers feel at home.' },
  { id: 'premiumlounge', name: 'Premium lounge suite', icon: '🥃', category: 'premium', w: 5, h: 3, cost: 8800, upkeep: 40, power: 1, zones: ['l', 's', 'e', 'q'], effects: { lounge: 2, satisfaction: 3 }, minLevel: 3, tags: ['lounge', 'premium', 'vip', 'luxury', 'seating'], color: '#6c4a3a', description: 'Leather, a bar and quiet. Where six-figure deals are closed.' },
  { id: 'vipdelivery', name: 'VIP delivery stage', icon: '🎆', category: 'premium', w: 5, h: 7, cost: 14500, upkeep: 60, power: 6, zones: ['e', 's', 'q'], station: ['delivery'], effects: { satisfaction: 3.5, appeal: 0.6 }, minLevel: 4, unlock: { rep: 70 }, tags: ['delivery', 'handover', 'vip', 'premium', 'luxury', 'reveal'], color: '#d4af37', description: 'A curtain, lights and champagne. Every handover becomes a story they tell their friends.' },
  { id: 'execdesk', name: 'Executive desk', icon: '👔', category: 'premium', w: 3, h: 2, cost: 6500, upkeep: 30, power: 1, zones: ['m'], station: ['manager'], effects: { management: 3, morale: 1 }, minLevel: 3, unlock: { staff: 8 }, tags: ['desk', 'executive', 'manager', 'office', 'premium'], color: '#3a2a20', description: 'The corner office. The general manager who sits here runs a tighter ship.' },
  { id: 'luxplatform', name: 'Luxury display platform', icon: '💠', category: 'premium', w: 6, h: 7, cost: 18500, upkeep: 90, power: 9, zones: ['s'], slot: 'display', spot: { attention: 22, wtp: 0.04, fit: 'premium' }, effects: { appeal: 3, lighting: 1 }, minLevel: 4, unlock: { rep: 70 }, tags: ['car', 'display', 'luxury', 'premium', 'podium', 'hero'], color: '#d4af37', description: 'Mirrored plinth, gallery lights. For the car that sells the whole showroom.' },
  // ---------------------------------------------------- v6: test drive
  { id: 'tdexit', name: 'Test-drive exit', icon: '🏁', category: 'testdrive', w: 4, h: 2, cost: 2400, upkeep: 4, power: 0.5, zones: OUT, edge: 'road', walkable: true, effects: { testdrive: 1.5 }, unlock: { land: 1 }, tags: ['test drive', 'proefrit', 'entrance', 'exit', 'road', 'route'], color: '#ffc233', description: 'A separate exit to the test route. Test drives start without crossing the customer car park.' },
  { id: 'tdparking', name: 'Test-drive parking', icon: '🗝️', category: 'testdrive', w: 3, h: 5, cost: 1800, upkeep: 10, power: 0.5, zones: ['a', 'j'], slot: 'parking', spot: { attention: 4 }, effects: { testdrive: 1 }, tags: ['test drive', 'proefrit', 'parking', 'car', 'space'], color: '#ffc233', description: 'A marked bay where the test car waits, cleaned and fuelled.' },
  { id: 'tdcheckin', name: 'Test-drive check-in', icon: '📋', category: 'testdrive', w: 2, h: 2, cost: 2200, upkeep: 10, power: 1, zones: ['r', 's', 'q', 'v'], station: ['sales', 'delivery'], effects: { testdrive: 1.5, satisfaction: 0.5 }, unlock: { testDrives: 3 }, tags: ['test drive', 'proefrit', 'desk', 'check-in', 'licence'], color: '#ffc233', description: 'Licence scan, insurance and a route briefing in two minutes.' },
  { id: 'handover', name: 'Key handover point', icon: '🔑', category: 'testdrive', w: 1, h: 1, cost: 450, upkeep: 1, power: 0, zones: ['r', 's', 'q', 'a', 'e'], effects: { testdrive: 0.5, satisfaction: 0.3 }, tags: ['keys', 'sleutels', 'handover', 'test drive', 'proefrit'], color: '#ffc233', description: 'A key cabinet by the door. Nobody waits for keys.' },
  { id: 'tdlane', name: 'Test-drive lane', icon: '🟨', category: 'testdrive', w: 1, h: 1, cost: 70, upkeep: 0, power: 0, zones: ['a', 'j', '.', 'g', 'x'], line: true, walkable: true, effects: { testdrive: 0.05 }, tags: ['lane', 'road', 'test drive', 'proefrit', 'markings', 'route'], color: '#ffc233', description: 'Yellow lane markings from the test-drive bays to the exit. Drag to draw.' },
  { id: 'tdgate', name: 'Test-drive barrier', icon: '🚧', category: 'testdrive', w: 3, h: 1, cost: 1600, upkeep: 6, power: 1, zones: ['a', 'j'], walkable: true, effects: { testdrive: 0.5, security: 0.5 }, tags: ['barrier', 'gate', 'test drive', 'proefrit', 'slagboom'], color: '#ff4d5e', description: 'Opens for booked test drives only.' },
  { id: 'tdsign', name: 'Test-drive sign', icon: '🚗', category: 'testdrive', w: 1, h: 1, cost: 300, upkeep: 0, power: 0, zones: [...OUT, 't'], effects: { testdrive: 0.3, wayfinding: 0.3, footfall: 0.2 }, tags: ['sign', 'test drive', 'proefrit', 'bord'], color: '#ffc233', description: '“Test drive today!” — people who see it ask for one.' },
];
// Tooltip notes and layout synergies live in their own tables; attach them to the items.
for (const o of OBJECTS) {
  const note = OBJECT_NOTES[o.id];
  if (note?.capacity && !o.capacity) o.capacity = note.capacity;
  if (note?.audience && !o.audience) o.audience = note.audience;
  if (SYNERGIES[o.id] && !o.synergy) o.synergy = SYNERGIES[o.id];
}
export const OBJ_BY_ID = Object.fromEntries(OBJECTS.map((o) => [o.id, o])) as Record<string, ObjDef>;

export interface StyleOption { id: string; name: string; tier: number; costPerTile: number; color: string; minLevel?: number }

export const FLOOR_STYLES: StyleOption[] = [
  { id: 'concrete', name: 'Concrete', tier: 0, costPerTile: 0, color: '#9aa0a8' },
  { id: 'industrial', name: 'Industrial', tier: 1, costPerTile: 8, color: '#6f757d' },
  { id: 'tile', name: 'Tile', tier: 1, costPerTile: 12, color: '#d7dbe0' },
  { id: 'wood', name: 'Oak parquet', tier: 1, costPerTile: 16, color: '#a57a52' },
  { id: 'premium', name: 'Premium tile', tier: 2, costPerTile: 28, color: '#ece8e1', minLevel: 2 },
  { id: 'marble', name: 'Marble', tier: 3, costPerTile: 55, color: '#f2efe9', minLevel: 3 },
  { id: 'dark', name: 'Dark showroom floor', tier: 3, costPerTile: 45, color: '#23262c', minLevel: 3 },
];
export const WALL_STYLES: StyleOption[] = [
  { id: 'basic', name: 'Basic', tier: 0, costPerTile: 0, color: '#8a9099' },
  { id: 'modern', name: 'Modern', tier: 1, costPerTile: 10, color: '#c8ccd2' },
  { id: 'brick', name: 'Exposed brick', tier: 1, costPerTile: 12, color: '#9a5a44' },
  { id: 'premium', name: 'Premium', tier: 2, costPerTile: 22, color: '#e6dccb', minLevel: 2 },
  { id: 'glass', name: 'Glass', tier: 2, costPerTile: 30, color: '#9fd8ff', minLevel: 2 },
  { id: 'brand', name: 'Brand wall', tier: 3, costPerTile: 36, color: '#ff7a1a', minLevel: 3 },
];
/** Lighting is the ceiling finish of a room. */
export const LIGHT_STYLES: StyleOption[] = [
  { id: 'basic', name: 'Basic ceiling lights', tier: 0, costPerTile: 0, color: '#fff3d6' },
  { id: 'led', name: 'LED panels', tier: 1, costPerTile: 9, color: '#ffffff' },
  { id: 'showroom', name: 'Showroom lighting', tier: 2, costPerTile: 25, color: '#fff7e8', minLevel: 2 },
  { id: 'gallery', name: 'Gallery track lighting', tier: 3, costPerTile: 40, color: '#fff0d0', minLevel: 3 },
];

/** Land you can own. Bigger land costs money up front and more rent every month. */
export const LAND_TIERS: { w: number; h: number; cost: number; minLevel: number; name: string; icon: string }[] = [
  { w: 30, h: 20, cost: 0, minLevel: 1, name: 'Starter plot', icon: '🌱' },
  { w: 40, h: 26, cost: 25000, minLevel: 1, name: 'Medium plot', icon: '🏪' },
  { w: 52, h: 32, cost: 75000, minLevel: 2, name: 'Large plot', icon: '🏬' },
  { w: 64, h: 40, cost: 200000, minLevel: 3, name: 'Mega plot', icon: '🏭' },
  { w: 80, h: 48, cost: 500000, minLevel: 4, name: 'Automotive Complex', icon: '🏙️' },
  { w: 96, h: 56, cost: 900000, minLevel: 5, name: 'Automotive Campus', icon: '🌆' },
];

export const BUILD_CATEGORIES: { id: BuildCategory | 'all' | 'zones' | 'style' | 'land' | 'templates'; name: string }[] = [
  { id: 'all', name: 'All' },
  { id: 'zones', name: 'Rooms' },
  { id: 'structure', name: 'Structure' },
  { id: 'showroom', name: 'Showroom' },
  { id: 'vehicles', name: 'Vehicles' },
  { id: 'office', name: 'Office' },
  { id: 'customer', name: 'Customer' },
  { id: 'service', name: 'Service' },
  { id: 'decoration', name: 'Decoration' },
  { id: 'outdoor', name: 'Outdoor' },
  { id: 'security', name: 'Security' },
  { id: 'style', name: 'Floors & ceilings' },
  { id: 'land', name: 'Land' },
  { id: 'templates', name: 'Templates' },
];
