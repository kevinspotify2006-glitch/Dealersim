/**
 * The physical dealership catalogue: land, zones (rooms/areas), placeable
 * objects, visual styles and optional starting templates.
 *
 * One tile is roughly one metre. A parking space is 3×5 tiles, a showroom
 * display pad 4×6 — so a car physically fits where it is shown.
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
  { code: 's', id: 'showroom', name: 'Showroom', icon: '✨', costPerTile: 55, indoor: true, customers: true, color: '#c9ced6', description: 'Indoor display hall. Cars shown here get more interest and higher offers.' },
  { code: 'r', id: 'reception', name: 'Reception', icon: '🛎️', costPerTile: 40, indoor: true, customers: true, color: '#b9a88f', description: 'Greets customers. A reception desk here makes people wait longer and happier.' },
  { code: 'l', id: 'lounge', name: 'Customer lounge', icon: '☕', costPerTile: 40, indoor: true, customers: true, color: '#8a6a4a', description: 'Where customers wait. Sofas and coffee raise satisfaction and patience.' },
  { code: 'o', id: 'office', name: 'Office', icon: '🏢', costPerTile: 35, indoor: true, customers: false, color: '#51606f', description: 'Desks for managers, buyers, accountants and marketing staff.' },
  { code: 'w', id: 'workshop', name: 'Workshop', icon: '🔧', costPerTile: 45, indoor: true, customers: false, color: '#5d6168', description: 'Repair bays. Each lift is a place where a mechanic can fix a car.' },
  { code: 'd', id: 'detailing', name: 'Detailing bay', icon: '🧽', costPerTile: 40, indoor: true, customers: false, color: '#3f5d6e', description: 'Cleaning and paint correction. Each detailing bay holds one car.' },
  { code: 't', id: 'storage', name: 'Storage yard', icon: '📦', costPerTile: 12, indoor: false, customers: false, color: '#4a4538', description: 'Cheap fenced parking for cars waiting for work. Customers never see it.' },
  { code: 'g', id: 'grass', name: 'Landscaping', icon: '🌳', costPerTile: 3, indoor: false, customers: true, color: '#2f5a3a', description: 'Grass and planting. Curb appeal brings passers-by in.' },
  { code: '.', id: 'bare', name: 'Bare land', icon: '🟫', costPerTile: 0, indoor: false, customers: true, color: '#3b342c', description: 'Undeveloped ground. Paint zones on it to build.' },
];
export const ZONE_BY_CODE = Object.fromEntries(ZONES.map((z) => [z.code, z])) as Record<ZoneCode, ZoneDef>;

export type SlotKind = 'parking' | 'display' | 'storage' | 'lift' | 'bay';

export interface ObjDef {
  id: string;
  name: string;
  icon: string;
  category: 'vehicles' | 'work' | 'furniture' | 'decor' | 'exterior' | 'structure';
  w: number;
  h: number;
  cost: number;
  upkeep: number;               // € per month
  power: number;                // € per day of utilities
  zones: ZoneCode[];            // where it may stand
  slot?: SlotKind;              // holds a vehicle
  station?: Role[];             // a workplace for these roles
  effects?: Partial<Record<'appeal' | 'decor' | 'curb' | 'lounge' | 'footfall' | 'workshop' | 'detailing' | 'equipment' | 'reception' | 'photo' | 'ev' | 'security', number>>;
  minLevel?: number;
  edge?: 'boundary' | 'road';   // must touch a room boundary (doors/windows) or the road
  walkable?: boolean;           // people can walk over it (doors, rugs)
  color: string;
  description: string;
}

const IN: ZoneCode[] = ['s', 'r', 'l', 'o', 'w', 'd'];
const PUBLIC_IN: ZoneCode[] = ['s', 'r', 'l'];

export const OBJECTS: ObjDef[] = [
  // ---- vehicles
  { id: 'parking', name: 'Parking space', icon: '🅿️', category: 'vehicles', w: 3, h: 5, cost: 1500, upkeep: 15, power: 0.5, zones: ['a'], slot: 'parking', color: '#e9ecef', description: 'Holds one car on the outdoor lot. Customers can view it.' },
  { id: 'display', name: 'Showroom display', icon: '✨', category: 'vehicles', w: 4, h: 6, cost: 3800, upkeep: 30, power: 3, zones: ['s'], slot: 'display', effects: { appeal: 1 }, color: '#ff9a4d', description: 'A lit display pad indoors. Cars here draw more interest and higher offers.' },
  { id: 'turntable', name: 'Turntable display', icon: '🔄', category: 'vehicles', w: 6, h: 6, cost: 9500, upkeep: 60, power: 8, zones: ['s'], slot: 'display', effects: { appeal: 3, decor: 1 }, minLevel: 3, color: '#ffc233', description: 'A rotating podium for your hero car. Big boost to showroom appeal.' },
  { id: 'storage', name: 'Storage space', icon: '📦', category: 'vehicles', w: 3, h: 5, cost: 700, upkeep: 6, power: 0, zones: ['t'], slot: 'storage', color: '#b8a878', description: 'Cheap space for cars waiting for work or for a buyer. Not visible to customers.' },
  { id: 'charger', name: 'EV charger', icon: '🔌', category: 'vehicles', w: 1, h: 1, cost: 1400, upkeep: 15, power: 4, zones: ['a', 's'], effects: { ev: 1 }, color: '#2fd18b', description: 'Electric cars on the lot stay charged — EV buyers pay more.' },

  // ---- work
  { id: 'lift', name: 'Workshop lift', icon: '🔧', category: 'work', w: 4, h: 6, cost: 5500, upkeep: 55, power: 6, zones: ['w'], slot: 'lift', station: ['mechanic'], effects: { workshop: 1 }, color: '#ffc233', description: 'A repair bay. Each lift works on one car and is a workstation for a mechanic.' },
  { id: 'toolwall', name: 'Tool wall', icon: '🧰', category: 'work', w: 3, h: 1, cost: 1200, upkeep: 8, power: 0, zones: ['w'], effects: { workshop: 1 }, color: '#d84a3a', description: 'Proper tools: faster, cheaper repairs.' },
  { id: 'tyremachine', name: 'Tyre machine', icon: '🛞', category: 'work', w: 2, h: 2, cost: 2500, upkeep: 12, power: 2, zones: ['w'], effects: { workshop: 1 }, color: '#6b7480', description: 'Tyres and wheel balancing in-house.' },
  { id: 'scanner', name: 'OBD scanner', icon: '🩺', category: 'work', w: 1, h: 1, cost: 3000, upkeep: 10, power: 1, zones: ['w'], effects: { equipment: 1 }, color: '#3cc7ff', description: 'Reads fault codes: inspections find more hidden problems.' },
  { id: 'diagbench', name: 'Diagnostics bench', icon: '🖥️', category: 'work', w: 2, h: 2, cost: 11000, upkeep: 40, power: 3, zones: ['w'], effects: { equipment: 2 }, minLevel: 2, color: '#3cc7ff', description: 'Full diagnostics. Much better detection of hidden defects.' },
  { id: 'dealerdiag', name: 'Dealer-grade diagnostics', icon: '📡', category: 'work', w: 3, h: 2, cost: 28000, upkeep: 90, power: 5, zones: ['w'], effects: { equipment: 3 }, minLevel: 3, color: '#9b8cff', description: 'The best diagnostic kit money can buy.' },
  { id: 'washbay', name: 'Detailing bay', icon: '🧽', category: 'work', w: 4, h: 6, cost: 3200, upkeep: 30, power: 4, zones: ['d'], slot: 'bay', station: ['detailer'], effects: { detailing: 1 }, color: '#3cc7ff', description: 'Cleaning and detailing station for one car. A workstation for a detailer.' },
  { id: 'paintbooth', name: 'Paint booth', icon: '🎨', category: 'work', w: 5, h: 7, cost: 12000, upkeep: 70, power: 8, zones: ['d'], effects: { detailing: 1 }, minLevel: 2, color: '#e74c3c', description: 'Paint correction in-house: better, cheaper detailing.' },
  { id: 'photostudio', name: 'Photo studio', icon: '📸', category: 'work', w: 5, h: 6, cost: 9000, upkeep: 30, power: 4, zones: ['d', 's'], effects: { detailing: 1, photo: 1 }, minLevel: 3, color: '#eef1f4', description: 'Professional photos for every online listing, free.' },
  { id: 'salesdesk', name: 'Sales desk', icon: '🤝', category: 'work', w: 2, h: 2, cost: 900, upkeep: 5, power: 1, zones: ['s', 'r', 'o', 'a'], station: ['sales'], color: '#a3abb6', description: 'Where a salesperson works and closes deals.' },
  { id: 'officedesk', name: 'Office desk', icon: '🗂️', category: 'work', w: 2, h: 2, cost: 700, upkeep: 4, power: 1, zones: ['o'], station: ['manager', 'accountant', 'buyer', 'marketing'], color: '#8b949e', description: 'A desk for a manager, buyer, accountant or marketing specialist.' },
  { id: 'receptiondesk', name: 'Reception desk', icon: '🛎️', category: 'work', w: 3, h: 1, cost: 1600, upkeep: 8, power: 1, zones: ['r', 's'], effects: { reception: 1 }, color: '#d9c7a8', description: 'Customers are greeted and wait longer before giving up.' },

  // ---- furniture
  { id: 'sofa', name: 'Sofa', icon: '🛋️', category: 'furniture', w: 3, h: 1, cost: 800, upkeep: 3, power: 0, zones: PUBLIC_IN, effects: { lounge: 1 }, color: '#5b4b8a', description: 'Somewhere comfortable to wait.' },
  { id: 'armchair', name: 'Armchair', icon: '💺', category: 'furniture', w: 1, h: 1, cost: 300, upkeep: 1, power: 0, zones: PUBLIC_IN, effects: { lounge: 0.4 }, color: '#7a5d9a', description: 'A single comfy seat.' },
  { id: 'coffeetable', name: 'Coffee table', icon: '🪑', category: 'furniture', w: 2, h: 1, cost: 220, upkeep: 1, power: 0, zones: PUBLIC_IN, effects: { lounge: 0.3 }, color: '#8a6a4a', description: 'Magazines and brochures.' },
  { id: 'coffee', name: 'Coffee machine', icon: '☕', category: 'furniture', w: 1, h: 1, cost: 900, upkeep: 12, power: 2, zones: ['l', 'r', 's'], effects: { lounge: 1 }, color: '#3a2a20', description: 'Free coffee. Customers stay patient.' },
  { id: 'tv', name: 'TV screen', icon: '📺', category: 'furniture', w: 2, h: 1, cost: 1200, upkeep: 4, power: 2, zones: ['l', 's', 'r'], effects: { lounge: 0.6, decor: 0.5 }, color: '#111418', description: 'Keeps waiting customers entertained.' },
  { id: 'kids', name: 'Kids corner', icon: '🧸', category: 'furniture', w: 3, h: 3, cost: 1500, upkeep: 6, power: 0, zones: ['l'], effects: { lounge: 1.2 }, minLevel: 2, color: '#ff6b81', description: 'Families relax when the children are busy.' },

  // ---- decor
  { id: 'plant', name: 'Plant', icon: '🪴', category: 'decor', w: 1, h: 1, cost: 120, upkeep: 2, power: 0, zones: [...IN, 'a', 'g'], effects: { decor: 0.5 }, color: '#2f8a4a', description: 'Greenery makes any room nicer.' },
  { id: 'poster', name: 'Poster', icon: '🖼️', category: 'decor', w: 1, h: 1, cost: 80, upkeep: 0, power: 0, zones: IN, effects: { decor: 0.3 }, color: '#ff7a1a', description: 'Promotional posters.' },
  { id: 'neon', name: 'Neon sign', icon: '💡', category: 'decor', w: 2, h: 1, cost: 1400, upkeep: 6, power: 2, zones: ['s', 'r', 'l'], effects: { decor: 1.5, appeal: 0.5 }, color: '#ff4dd2', description: 'A glowing brand statement.' },
  { id: 'infoboard', name: 'Vehicle info board', icon: '📋', category: 'decor', w: 1, h: 1, cost: 250, upkeep: 1, power: 0, zones: ['s', 'a'], effects: { appeal: 0.4 }, color: '#eef1f4', description: 'Specs and prices next to the cars. Customers decide faster.' },
  { id: 'ledwall', name: 'LED video wall', icon: '🖥️', category: 'decor', w: 3, h: 1, cost: 3500, upkeep: 15, power: 6, zones: ['s', 'r'], effects: { decor: 2, appeal: 0.8 }, minLevel: 2, color: '#3cc7ff', description: 'Big screen with your stock on rotation.' },
  { id: 'rug', name: 'Showroom rug', icon: '🟥', category: 'decor', w: 3, h: 2, cost: 400, upkeep: 1, power: 0, zones: PUBLIC_IN, effects: { decor: 0.6 }, walkable: true, color: '#7a2a2a', description: 'Adds warmth to a room.' },

  // ---- exterior
  { id: 'gate', name: 'Entrance', icon: '🚪', category: 'exterior', w: 4, h: 2, cost: 1000, upkeep: 2, power: 0, zones: ['a', 'g', '.'], edge: 'road', walkable: true, color: '#ff7a1a', description: 'Where customers come in from the street. Must touch the road (bottom edge).' },
  { id: 'pylon', name: 'Pylon sign', icon: '🪧', category: 'exterior', w: 2, h: 2, cost: 2500, upkeep: 10, power: 3, zones: ['a', 'g', '.'], effects: { footfall: 1, curb: 1 }, color: '#ff7a1a', description: 'A tall sign visible from the road. More walk-ins.' },
  { id: 'banner', name: 'Banner', icon: '🎌', category: 'exterior', w: 2, h: 1, cost: 400, upkeep: 2, power: 0, zones: ['a', 'g'], effects: { footfall: 0.3, curb: 0.3 }, color: '#ffc233', description: '"SALE" banners catch the eye.' },
  { id: 'flag', name: 'Flag pole', icon: '🚩', category: 'exterior', w: 1, h: 1, cost: 150, upkeep: 1, power: 0, zones: ['a', 'g', '.'], effects: { curb: 0.4 }, color: '#3cc7ff', description: 'Flags make the lot look busy and bright.' },
  { id: 'lamp', name: 'Lamp post', icon: '💡', category: 'exterior', w: 1, h: 1, cost: 600, upkeep: 3, power: 2, zones: ['a', 'g', 't'], effects: { curb: 0.4, security: 1 }, color: '#ffe8a8', description: 'Lighting for the lot. Safer and more inviting.' },
  { id: 'tree', name: 'Tree', icon: '🌳', category: 'exterior', w: 2, h: 2, cost: 400, upkeep: 2, power: 0, zones: ['g', '.'], effects: { curb: 0.6 }, color: '#2f7a4a', description: 'Shade and curb appeal.' },
  { id: 'planter', name: 'Planter', icon: '🌼', category: 'exterior', w: 1, h: 1, cost: 200, upkeep: 1, power: 0, zones: ['a', 'g'], effects: { curb: 0.3 }, color: '#e1a84a', description: 'Flowers by the walkway.' },
  { id: 'bench', name: 'Bench', icon: '🪑', category: 'exterior', w: 2, h: 1, cost: 300, upkeep: 1, power: 0, zones: ['a', 'g'], effects: { lounge: 0.3, curb: 0.2 }, color: '#8a6a4a', description: 'Outdoor seating.' },
  { id: 'camera', name: 'Security camera', icon: '📹', category: 'exterior', w: 1, h: 1, cost: 900, upkeep: 12, power: 1, zones: ['a', 't', 'g'], effects: { security: 2 }, color: '#6b7480', description: 'Lowers insurance on the stock outside.' },

  // ---- structure
  { id: 'door', name: 'Door', icon: '🚪', category: 'structure', w: 2, h: 1, cost: 400, upkeep: 1, power: 0, zones: IN, edge: 'boundary', walkable: true, color: '#a3abb6', description: 'An opening in a room\'s wall. Place it on the edge of a room.' },
  { id: 'window', name: 'Window', icon: '🪟', category: 'structure', w: 3, h: 1, cost: 350, upkeep: 0, power: 0, zones: IN, edge: 'boundary', effects: { appeal: 0.3, decor: 0.3 }, color: '#9fd8ff', description: 'Daylight and a view of the cars. Place it on a room\'s edge.' },
];
export const OBJ_BY_ID = Object.fromEntries(OBJECTS.map((o) => [o.id, o])) as Record<string, ObjDef>;

export interface StyleOption { id: string; name: string; tier: number; costPerTile: number; color: string; minLevel?: number }

export const FLOOR_STYLES: StyleOption[] = [
  { id: 'concrete', name: 'Concrete', tier: 0, costPerTile: 0, color: '#9aa0a8' },
  { id: 'industrial', name: 'Industrial', tier: 1, costPerTile: 8, color: '#6f757d' },
  { id: 'tile', name: 'Tile', tier: 1, costPerTile: 12, color: '#d7dbe0' },
  { id: 'premium', name: 'Premium tile', tier: 2, costPerTile: 28, color: '#ece8e1', minLevel: 2 },
  { id: 'dark', name: 'Dark showroom floor', tier: 3, costPerTile: 45, color: '#23262c', minLevel: 3 },
];
export const WALL_STYLES: StyleOption[] = [
  { id: 'basic', name: 'Basic', tier: 0, costPerTile: 0, color: '#8a9099' },
  { id: 'modern', name: 'Modern', tier: 1, costPerTile: 10, color: '#c8ccd2' },
  { id: 'premium', name: 'Premium', tier: 2, costPerTile: 22, color: '#e6dccb', minLevel: 2 },
  { id: 'glass', name: 'Glass', tier: 2, costPerTile: 30, color: '#9fd8ff', minLevel: 2 },
  { id: 'brand', name: 'Brand wall', tier: 3, costPerTile: 36, color: '#ff7a1a', minLevel: 3 },
];
export const LIGHT_STYLES: StyleOption[] = [
  { id: 'basic', name: 'Basic lighting', tier: 0, costPerTile: 0, color: '#fff3d6' },
  { id: 'led', name: 'LED', tier: 1, costPerTile: 9, color: '#ffffff' },
  { id: 'showroom', name: 'Premium showroom lighting', tier: 2, costPerTile: 25, color: '#fff7e8', minLevel: 2 },
];

/** Land you can own. Bigger land costs money up front and more rent every month. */
export const LAND_TIERS: { w: number; h: number; cost: number; minLevel: number }[] = [
  { w: 30, h: 20, cost: 0, minLevel: 1 },
  { w: 38, h: 24, cost: 18000, minLevel: 1 },
  { w: 46, h: 30, cost: 45000, minLevel: 2 },
  { w: 56, h: 36, cost: 100000, minLevel: 3 },
  { w: 68, h: 42, cost: 200000, minLevel: 4 },
  { w: 82, h: 50, cost: 400000, minLevel: 5 },
];

export const BUILD_CATEGORIES: { id: ObjDef['category'] | 'zones' | 'style' | 'land' | 'templates'; name: string }[] = [
  { id: 'zones', name: 'Rooms & areas' },
  { id: 'vehicles', name: 'Vehicle spaces' },
  { id: 'work', name: 'Work & desks' },
  { id: 'furniture', name: 'Furniture' },
  { id: 'decor', name: 'Decoration' },
  { id: 'exterior', name: 'Exterior' },
  { id: 'structure', name: 'Doors & windows' },
  { id: 'style', name: 'Style' },
  { id: 'land', name: 'Land' },
  { id: 'templates', name: 'Templates' },
];
