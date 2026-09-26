/**
 * Build-mode depth (v6): upgrade levels for fixtures, dealership styles,
 * placeable room templates and the demolition rules. Everything here is
 * plain data; sim/buildplus.ts applies it.
 */
import type { ArchetypeId, ZoneCode } from '../sim/types';
import type { BuildCategory, EffectKey } from './lot';

// ------------------------------------------------------------ upgrades --

export interface UpgradeStep {
  name: string;
  cost: number;
  /** Extra effects on top of the base item (cumulative with earlier steps). */
  effects?: Partial<Record<EffectKey, number>>;
  /** Extra customer attention for a car standing here (vehicle spaces). */
  attention?: number;
  /** Extra willingness to pay for a car standing here. */
  wtp?: number;
  /** Faster work on this lift / bay (1.2 = 20% faster). */
  speed?: number;
  text: string;
}

/** Level 2 and level 3 of every upgradable fixture. */
export const OBJ_UPGRADES: Record<string, [UpgradeStep, UpgradeStep]> = {
  receptiondesk: [
    { name: 'Modern reception', cost: 900, effects: { reception: 0.5, satisfaction: 1 }, text: 'A curved desk with a screen: visitors are checked in quicker.' },
    { name: 'Premium reception', cost: 2400, effects: { reception: 0.5, satisfaction: 2, appeal: 0.5 }, text: 'Stone top, backlit logo, a welcome drink.' },
  ],
  welcomecounter: [
    { name: 'Lit welcome counter', cost: 1500, effects: { satisfaction: 1, appeal: 0.4 }, text: 'Light lines and a logo wall behind it.' },
    { name: 'Concierge counter', cost: 3800, effects: { satisfaction: 2, reception: 0.5 }, text: 'Appointments, coffee and a cloakroom in one place.' },
  ],
  salesdesk: [
    { name: 'Sales desk + CRM screen', cost: 700, effects: { sales: 1 }, text: 'Customer history and stock on a second screen.' },
    { name: 'Executive sales desk', cost: 1800, effects: { sales: 2, satisfaction: 1 }, text: 'A proper desk with good chairs: deals feel serious.' },
  ],
  lift: [
    { name: 'Twin-post lift', cost: 2500, effects: { workshop: 0.5 }, speed: 1.2, text: '20% faster work on this lift.' },
    { name: 'Four-post lift with ADAS rig', cost: 6000, effects: { workshop: 1, equipment: 0.5 }, speed: 1.4, text: '40% faster and calibrates driver-assist cameras.' },
  ],
  inspectionlane: [
    { name: 'Brake & emissions tester', cost: 3000, effects: { equipment: 0.5 }, speed: 1.15, text: 'Inspections take less time and find more.' },
    { name: 'Automated test lane', cost: 7000, effects: { equipment: 1, service: 0.5 }, speed: 1.3, text: 'A fully automated inspection line.' },
  ],
  washbay: [
    { name: 'Foam & dry bay', cost: 1500, effects: { detailing: 0.5 }, speed: 1.15, text: 'Snow foam and a blower: faster cleaning.' },
    { name: 'Ceramic studio bay', cost: 4000, effects: { detailing: 1 }, speed: 1.3, text: 'Paint correction lights and coatings.' },
  ],
  display: [
    { name: 'Lit display', cost: 1500, effects: { appeal: 0.5 }, attention: 3, text: 'Spotlights on the car: +3% attention.' },
    { name: 'Hero display', cost: 3500, effects: { appeal: 1, lighting: 0.5 }, attention: 6, wtp: 0.005, text: 'A mirrored floor and a spec screen: +6% attention and firmer prices.' },
  ],
  premiumdisplay: [
    { name: 'Gallery podium', cost: 2800, effects: { appeal: 0.6 }, attention: 3, wtp: 0.005, text: 'Gallery lighting and velvet ropes.' },
    { name: 'Signature podium', cost: 6500, effects: { appeal: 1.2, lighting: 0.5 }, attention: 6, wtp: 0.01, text: 'A slowly turning plinth with a story screen.' },
  ],
  evdisplay: [
    { name: 'Charging display', cost: 1800, effects: { ev: 0.5 }, attention: 3, text: 'Shows real charging speeds on a screen.' },
    { name: 'EV experience pad', cost: 4200, effects: { ev: 1, appeal: 0.5 }, attention: 6, wtp: 0.005, text: 'Range calculator and a home-charger demo.' },
  ],
  parking: [
    { name: 'Marked & lit space', cost: 400, effects: { curb: 0.1 }, attention: 2, text: 'Fresh lines and a light: +2% attention.' },
    { name: 'Covered space', cost: 1200, effects: { curb: 0.2 }, attention: 4, text: 'A canopy keeps the car clean: +4% attention.' },
  ],
  frontrow: [
    { name: 'Lit front-row space', cost: 700, effects: { curb: 0.2 }, attention: 3, text: 'Floodlit at night.' },
    { name: 'Front-row podium', cost: 2200, effects: { curb: 0.4, footfall: 0.2 }, attention: 6, text: 'A raised pad facing the road.' },
  ],
  servicedesk: [
    { name: 'Service desk + booking screen', cost: 900, effects: { service: 0.5 }, text: 'Online bookings land straight on this desk.' },
    { name: 'Service lounge desk', cost: 2200, effects: { service: 1, satisfaction: 1 }, text: 'Customers sit down to discuss the job.' },
  ],
  coffee: [
    { name: 'Bean-to-cup machine', cost: 400, effects: { lounge: 0.5 }, text: 'Real coffee.' },
    { name: 'Barista station', cost: 1500, effects: { lounge: 1, satisfaction: 1 }, text: 'Flat whites and hot chocolate.' },
  ],
  sofa: [
    { name: 'Leather sofa', cost: 500, effects: { lounge: 0.5 }, text: 'Softer, nicer, lasts longer.' },
    { name: 'Designer sofa', cost: 1400, effects: { lounge: 1, decor: 0.5 }, text: 'A piece people comment on.' },
  ],
  charger: [
    { name: '22 kW charger', cost: 900, effects: { ev: 0.5 }, text: 'Twice the speed.' },
    { name: '50 kW DC charger', cost: 2600, effects: { ev: 1 }, text: 'A full battery during the paperwork.' },
  ],
  officedesk: [
    { name: 'Dual-screen desk', cost: 500, effects: { management: 0.3 }, text: 'More done in less time.' },
    { name: 'Sit-stand desk', cost: 1200, effects: { management: 0.5, morale: 0.3 }, text: 'Healthier, happier staff.' },
  ],
  camera: [
    { name: 'HD camera', cost: 500, effects: { security: 1 }, text: 'Sharper pictures, lower premiums.' },
    { name: 'Smart camera', cost: 1500, effects: { security: 2 }, text: 'Spots trouble before it happens.' },
  ],
  pylon: [
    { name: 'LED pylon', cost: 1800, effects: { footfall: 0.4 }, text: 'Bright at night.' },
    { name: 'Animated pylon', cost: 4000, effects: { footfall: 0.8, curb: 0.5 }, text: 'Shows your offers to passing traffic.' },
  ],
  gate: [
    { name: 'Branded entrance', cost: 1500, effects: { curb: 0.5, footfall: 0.2 }, text: 'Your name over the way in.' },
    { name: 'Lit gateway', cost: 3500, effects: { curb: 1, footfall: 0.5 }, text: 'A lit arch that is visible from the whole street.' },
  ],
  tdcheckin: [
    { name: 'Digital check-in', cost: 1200, effects: { testdrive: 0.5 }, text: 'Licence scan and e-signature.' },
    { name: 'Concierge check-in', cost: 3000, effects: { testdrive: 1, satisfaction: 1 }, text: 'A route briefing on a tablet and a bottle of water.' },
  ],
  tdparking: [
    { name: 'Charging test bay', cost: 900, effects: { testdrive: 0.5, ev: 0.3 }, text: 'Test cars are always full.' },
    { name: 'Covered test bay', cost: 2000, effects: { testdrive: 1 }, attention: 3, text: 'Clean, dry and ready to go.' },
  ],
  loungeset: [
    { name: 'Comfort lounge', cost: 900, effects: { lounge: 0.5 }, text: 'Deeper seats, better lighting.' },
    { name: 'Club lounge', cost: 2400, effects: { lounge: 1, satisfaction: 1 }, text: 'Feels like a members’ club.' },
  ],
  kiosk: [
    { name: 'Finance kiosk', cost: 900, effects: { finance: 0.5 }, text: 'Monthly payments on the spot.' },
    { name: 'Configurator wall', cost: 2600, effects: { sales: 1, appeal: 0.5 }, text: 'A big screen to build your car.' },
  ],
  visitorparking: [
    { name: 'Marked visitor bays', cost: 500, effects: { visitorParking: 0.25 }, text: 'Room for one more visitor a day.' },
    { name: 'Visitor bays with charger', cost: 1600, effects: { visitorParking: 0.5, ev: 0.3 }, text: 'Visitors top up while they browse.' },
  ],
  storage: [
    { name: 'Gravel & fence', cost: 300, effects: { security: 0.2 }, text: 'Tidier and safer.' },
    { name: 'Covered storage', cost: 900, effects: { security: 0.4 }, text: 'Cars stay clean while they wait.' },
  ],
  marketingdesk: [
    { name: 'Content studio', cost: 1400, effects: { marketing: 0.5 }, text: 'Video and photos for social.' },
    { name: 'Campaign war-room', cost: 3200, effects: { marketing: 1 }, text: 'Live results on screen, budgets moved daily.' },
  ],
};

export const MAX_OBJ_LEVEL = 3;

// ----------------------------------------------------------- demolition --

/** Base share of the build cost that comes back when bulldozed (50–70%). */
export const REFUND_BASE: Record<BuildCategory, number> = {
  structure: 0.5, showroom: 0.62, vehicles: 0.58, office: 0.62, customer: 0.62, service: 0.58, decoration: 0.66, outdoor: 0.55,
  security: 0.56, ev: 0.6, technology: 0.52, marketing: 0.58, storage: 0.64, premium: 0.66, testdrive: 0.6, staff: 0.62, parking: 0.55,
};

/** Fixtures the dealership cannot run without (a warning, then the player decides). */
export const CRITICAL_IDS = new Set(['gate', 'grandgate', 'receptiondesk', 'welcomecounter', 'receptionpod', 'luxreception', 'salesdesk', 'premiumdesk', 'lift', 'inspectionlane', 'servicedesk', 'door', 'glassdoor']);

// --------------------------------------------------------------- styles --

export interface DealerStyle {
  id: string;
  name: string;
  icon: string;
  description: string;
  floor: string;
  walls: string;
  lighting: string;
  minLevel: number;
  /** Who it attracts (multipliers on customer types). */
  mix: Partial<Record<ArchetypeId, number>>;
  /** Extra effects of the look as a whole. */
  effects: Partial<Record<EffectKey, number>>;
  /** Reputation drift per month while the style is kept (small, both ways). */
  rep: number;
  accent: string;
}

export const DEALER_STYLES: DealerStyle[] = [
  { id: 'modern', name: 'Modern', icon: '🔷', description: 'Clean tiles, white walls, LED panels. Works for everyone; young buyers and businesses like it.', floor: 'tile', walls: 'modern', lighting: 'led', minLevel: 1, mix: { young: 1.15, business: 1.1 }, effects: { appeal: 0.5 }, rep: 0.1, accent: '#3cc7ff' },
  { id: 'industrial', name: 'Industrial', icon: '🏭', description: 'Concrete, exposed brick and steel. Cheap to fit, loved by enthusiasts and bargain hunters.', floor: 'industrial', walls: 'brick', lighting: 'led', minLevel: 1, mix: { enthusiast: 1.3, young: 1.2, bargain: 1.15 }, effects: { decor: 0.5, curb: 0.3 }, rep: 0, accent: '#c85400' },
  { id: 'classic', name: 'Classic', icon: '🕰️', description: 'Oak floors and warm light. Seniors and families feel at home; classics sell well.', floor: 'wood', walls: 'brick', lighting: 'basic', minLevel: 1, mix: { senior: 1.4, family: 1.15, enthusiast: 1.1 }, effects: { decor: 1, lounge: 0.5 }, rep: 0.1, accent: '#8a6a4a' },
  { id: 'minimal', name: 'Minimal', icon: '◻️', description: 'Pale floors, glass and nothing else. EV and tech buyers love the calm.', floor: 'premium', walls: 'glass', lighting: 'showroom', minLevel: 2, mix: { ev: 1.35, business: 1.15, young: 1.1 }, effects: { appeal: 0.8, lighting: 0.4 }, rep: 0.1, accent: '#eef1f4' },
  { id: 'premium', name: 'Premium', icon: '🥈', description: 'Premium tiles, soft walls, showroom lighting. Business and luxury buyers expect it.', floor: 'premium', walls: 'premium', lighting: 'showroom', minLevel: 2, mix: { business: 1.3, luxury: 1.2, senior: 1.1, bargain: 0.8 }, effects: { appeal: 1, satisfaction: 1 }, rep: 0.2, accent: '#c8ccd2' },
  { id: 'sport', name: 'Sport', icon: '🏁', description: 'A dark floor, your brand colour on the walls and gallery spots. Pure theatre for petrolheads.', floor: 'dark', walls: 'brand', lighting: 'gallery', minLevel: 3, mix: { enthusiast: 1.6, young: 1.2, prestige: 1.1, family: 0.8 }, effects: { appeal: 1, decor: 0.5 }, rep: 0.1, accent: '#ff4d5e' },
  { id: 'luxury', name: 'Luxury', icon: '💎', description: 'Marble, premium walls and gallery lighting. Prestige buyers arrive; bargain hunters stay away.', floor: 'marble', walls: 'premium', lighting: 'gallery', minLevel: 3, mix: { luxury: 1.4, prestige: 1.4, business: 1.15, budget: 0.7, bargain: 0.6 }, effects: { appeal: 1.5, satisfaction: 2 }, rep: 0.3, accent: '#d4af37' },
];
export const STYLE_BY_ID = Object.fromEntries(DEALER_STYLES.map((s) => [s.id, s])) as Record<string, DealerStyle>;

// ----------------------------------------------------- room templates --

export interface RoomTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  w: number;
  h: number;
  /** The floor it paints (one room or area). Extra zones are painted after it. */
  zone: ZoneCode;
  zones?: [number, number, number, number, ZoneCode][];
  /** [defId, x, y, rot] relative to the template's top-left corner. */
  objects: [string, number, number, 0 | 1][];
  minLevel: number;
}

export const ROOM_TEMPLATES: RoomTemplate[] = [
  { id: 'smallshowroom', name: 'Small showroom', icon: '✨', description: 'Two lit displays, a sales desk, spotlights and a door. The start of every serious dealership.', w: 12, h: 9, zone: 's', minLevel: 1,
    objects: [['display', 1, 1, 0], ['display', 6, 1, 0], ['salesdesk', 10, 1, 0], ['plant', 11, 7, 0], ['spotlight', 5, 3, 0], ['infoboard', 10, 4, 0], ['door', 5, 8, 0]] },
  { id: 'basicworkshop', name: 'Basic workshop', icon: '🔧', description: 'One lift, a tool wall, a workbench and an air compressor. Lets you hire a mechanic.', w: 8, h: 9, zone: 'w', minLevel: 1,
    objects: [['lift', 2, 1, 0], ['toolwall', 1, 8, 0], ['workbench', 6, 1, 0], ['compressor', 7, 3, 0], ['door', 5, 8, 0]] },
  { id: 'premiumreception', name: 'Premium reception', icon: '🛎️', description: 'A welcome counter, logo wall, sofa and coffee. First impressions that sell.', w: 8, h: 6, zone: 'r', minLevel: 2,
    objects: [['logowall', 2, 0, 0], ['welcomecounter', 2, 1, 0], ['sofa', 1, 4, 0], ['coffee', 6, 4, 0], ['plant', 7, 1, 0], ['door', 4, 5, 0]] },
  { id: 'staffoffice', name: 'Staff office', icon: '🏢', description: 'Two desks, a computer, a filing cabinet and a sales board for your back office.', w: 7, h: 5, zone: 'o', minLevel: 1,
    objects: [['officedesk', 1, 1, 0], ['officedesk', 4, 1, 0], ['computer', 6, 1, 0], ['filing', 6, 3, 0], ['whiteboard', 1, 0, 0], ['door', 3, 4, 0]] },
  { id: 'evcenter', name: 'EV center', icon: '⚡', description: 'Two EV displays with chargers and a sales desk: a showroom made for electric cars.', w: 14, h: 9, zone: 's', minLevel: 1,
    objects: [['evdisplay', 1, 1, 0], ['evdisplay', 6, 1, 0], ['charger', 11, 1, 0], ['salesdesk', 11, 3, 0], ['plant', 12, 7, 0], ['digisign', 1, 7, 0], ['door', 6, 8, 0]] },
  { id: 'servicecenter', name: 'Service center', icon: '🧾', description: 'A service desk, waiting area, coffee and a screen: where service customers are welcomed.', w: 10, h: 5, zone: 'v', minLevel: 1,
    objects: [['servicedesk', 1, 1, 0], ['servicewait', 4, 1, 0], ['coffee', 8, 1, 0], ['tv', 7, 3, 0], ['door', 4, 4, 0]] },
  { id: 'usedcararea', name: 'Used-car area', icon: '🔁', description: 'Four used-car spaces, a bargain corner, a price board and flags on open paving.', w: 16, h: 7, zone: 'a', minLevel: 1,
    objects: [['usedrow', 0, 0, 0], ['usedrow', 3, 0, 0], ['usedrow', 6, 0, 0], ['usedrow', 9, 0, 0], ['occasion', 12, 0, 0], ['pricedisplay', 15, 0, 0], ['banner', 0, 6, 0], ['flag', 15, 6, 0]] },
  { id: 'viparea', name: 'VIP area', icon: '🥂', description: 'A VIP lounge suite, champagne bar and designer chairs for your best customers.', w: 10, h: 7, zone: 'l', minLevel: 3,
    objects: [['vipsofa', 1, 1, 0], ['champagnebar', 6, 1, 0], ['loungechair', 1, 4, 0], ['loungechair', 2, 4, 0], ['bigplant', 7, 4, 0], ['door', 4, 6, 0]] },
  { id: 'testdrivecenter', name: 'Test-drive center', icon: '🗝️', description: 'Check-in desk, key handover, a lounge and three test-drive bays with a barrier. Unlocks the best routes.', w: 16, h: 13, zone: 'q', minLevel: 2,
    zones: [[0, 7, 15, 12, 'a']],
    objects: [['tdcheckin', 1, 1, 0], ['handover', 4, 1, 0], ['sofa', 6, 1, 0], ['coffee', 10, 1, 0], ['plant', 14, 1, 0], ['door', 7, 6, 0], ['tdparking', 1, 8, 0], ['tdparking', 4, 8, 0], ['tdparking', 7, 8, 0], ['tdgate', 11, 10, 0], ['tdsign', 14, 8, 0]] },
  { id: 'customerlounge', name: 'Customer lounge', icon: '☕', description: 'Sofa, armchair, coffee and a TV: customers wait longer and leave happier.', w: 7, h: 5, zone: 'l', minLevel: 1,
    objects: [['sofa', 1, 1, 0], ['armchair', 5, 1, 0], ['coffee', 6, 3, 0], ['tv', 1, 3, 0], ['door', 3, 4, 0]] },
  { id: 'parkingblock', name: 'Parking block', icon: '🅿️', description: 'Four spaces for stock and four for visitors, with a lamp post.', w: 12, h: 11, zone: 'a', minLevel: 1,
    objects: [['parking', 0, 0, 0], ['parking', 3, 0, 0], ['parking', 6, 0, 0], ['parking', 9, 0, 0], ['visitorparking', 0, 6, 0], ['visitorparking', 3, 6, 0], ['visitorparking', 6, 6, 0], ['lamp', 10, 7, 0]] },
  { id: 'staffroom', name: 'Staff room', icon: '🍽️', description: 'Kitchenette, lockers and a break table for the team.', w: 6, h: 4, zone: 'k', minLevel: 1,
    objects: [['kitchen', 1, 0, 0], ['lockers', 4, 0, 0], ['breaktable', 4, 2, 0], ['door', 1, 3, 0]] },
  { id: 'marketingstudio', name: 'Marketing studio', icon: '📣', description: 'A marketing desk, a screen and a photo corner: campaigns bring in more leads.', w: 8, h: 6, zone: 'n', minLevel: 1,
    objects: [['marketingdesk', 1, 1, 0], ['trainingscreen', 4, 0, 0], ['plant', 7, 1, 0], ['door', 3, 5, 0]] },
  { id: 'trainingroom', name: 'Training room', icon: '🎓', description: 'Training desks and a big screen: courses finish sooner.', w: 7, h: 5, zone: 'u', minLevel: 2,
    objects: [['trainingdesk', 1, 1, 0], ['trainingscreen', 4, 0, 0], ['door', 3, 4, 0]] },
];
export const ROOM_TEMPLATE_BY_ID = Object.fromEntries(ROOM_TEMPLATES.map((t) => [t.id, t])) as Record<string, RoomTemplate>;
