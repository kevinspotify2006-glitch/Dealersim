/**
 * Build Mode 2.0 — room-based, contextual building.
 *
 * The dealership is built room by room. Each room type lists its own build
 * categories and, per category, the items that belong there. That list IS the
 * data: an item's `allowedRooms` is simply every room type whose categories
 * name it (and whose floor it may actually stand on — `ObjDef.zones`). Adding
 * an item to a room is one id in one list; nothing in the UI changes.
 *
 * Entries are object ids from `data/lot.ts`, or `zone:<code>` for surfaces that
 * are painted rather than placed (roads, paving, grass, asphalt).
 */
import type { ZoneCode } from '../sim/types';
import { OBJ_BY_ID, OBJECTS, ZONE_BY_CODE } from './lot';
import type { ObjDef } from './lot';

export type RoomTypeId = 'showroom' | 'customer' | 'office' | 'workshop' | 'storage' | 'outdoor';

/** How an item is placed: on the floor, against a wall, drawn as a line, or painted as a surface. */
export type PlacementType = 'floor' | 'wall' | 'line' | 'surface';

export interface BuildRoomCategory {
  id: string;
  name: string;
  icon: string;
  items: string[];
}

export interface BuildRoomType {
  id: RoomTypeId;
  name: string;
  icon: string;
  /** Floor types that belong to this room type (tapping one opens this menu). */
  zones: ZoneCode[];
  blurb: string;
  categories: BuildRoomCategory[];
}

const WALLS = ['wall', 'glasswall', 'partition', 'walldoor', 'door', 'glassdoor', 'window', 'bigwindow', 'pillar'];
const LIGHTS = ['spotlight', 'pendant', 'ledstrip', 'floorlamp'];

export const BUILD_ROOMS: BuildRoomType[] = [
  {
    id: 'showroom', name: 'Showroom', icon: 'sparkle', zones: ['s'],
    blurb: 'Where cars are shown and sold.',
    categories: [
      { id: 'furniture', name: 'Furniture', icon: 'store', items: ['receptiondesk', 'welcomecounter', 'luxreception', 'salesdesk', 'premiumdesk', 'showroomseat', 'sofa', 'armchair', 'loungechair', 'cornersofa', 'loungeset', 'coffeetable', 'officechair'] },
      { id: 'cars', name: 'Cars', icon: 'car', items: ['display', 'premiumdisplay', 'evdisplay', 'turntable', 'platform', 'luxplatform', 'promodisplay', 'ropes', 'wheeldisplay', 'digishowroom'] },
      { id: 'sales', name: 'Sales', icon: 'handshake', items: ['financedesk', 'financebooth', 'kiosk', 'brochure', 'crmterminal', 'infodesk', 'handoverdesk', 'pricedisplay', 'computer', 'tdcheckin', 'handover'] },
      { id: 'electronics', name: 'Electronics', icon: 'screen', items: ['tv', 'digiscreen', 'screen', 'ledwall', 'digisign', 'wifi', 'camera', 'alarm'] },
      { id: 'decoration', name: 'Decoration', icon: 'plant', items: ['plant', 'bigplant', 'poster', 'artwork', 'sculpture', 'trophy', 'neon', 'logowall', 'brandbanner', 'featurewall', 'brandportal', 'carart', 'brandclock', 'rug', 'runner'] },
      { id: 'lighting', name: 'Lighting', icon: 'opportunity', items: LIGHTS },
      { id: 'storage', name: 'Storage', icon: 'box', items: ['bookcase'] },
      { id: 'walls', name: 'Walls & doors', icon: 'brick', items: WALLS },
    ],
  },
  {
    id: 'customer', name: 'Customer area', icon: 'customer', zones: ['r', 'l', 'b', 'v', 'e', 'f', 'q'],
    blurb: 'Reception, lounge, service desk, finance and delivery.',
    categories: [
      { id: 'seating', name: 'Seating', icon: 'customer', items: ['sofa', 'armchair', 'loungechair', 'waitingbench', 'showroomseat', 'cornersofa', 'loungeset', 'vipsofa', 'servicewait', 'premiumlounge'] },
      { id: 'tables', name: 'Tables', icon: 'dashboard', items: ['coffeetable', 'bistrotable'] },
      { id: 'coffee', name: 'Coffee & drinks', icon: 'opportunity', items: ['coffee', 'coffeebar', 'watercooler', 'vending', 'champagnebar'] },
      { id: 'entertainment', name: 'Entertainment', icon: 'screen', items: ['tv', 'digiscreen', 'magazines', 'kids', 'wifi'] },
      { id: 'desks', name: 'Desks & counters', icon: 'store', items: ['receptiondesk', 'welcomecounter', 'infodesk', 'luxreception', 'receptionpod', 'servicedesk', 'partscounter', 'financedesk', 'financebooth', 'crmterminal', 'deliverybay', 'handoverdesk', 'vipdelivery', 'evdelivery', 'tdcheckin', 'handover'] },
      { id: 'facilities', name: 'Facilities', icon: 'info', items: ['toilet', 'sink', 'janitor'] },
      { id: 'decoration', name: 'Decoration', icon: 'plant', items: ['plant', 'bigplant', 'poster', 'artwork', 'sculpture', 'trophy', 'neon', 'rug', 'runner', 'carart', 'brandclock', 'featurewall', 'wheeldisplay', 'deliverylight', 'brandbanner'] },
      { id: 'lighting', name: 'Lighting', icon: 'opportunity', items: LIGHTS },
      { id: 'walls', name: 'Walls & doors', icon: 'brick', items: WALLS },
    ],
  },
  {
    id: 'office', name: 'Office', icon: 'report', zones: ['o', 'm', 'n', 'u', 'k'],
    blurb: 'Offices, manager, marketing, training and the staff room.',
    categories: [
      { id: 'desks', name: 'Desks', icon: 'store', items: ['officedesk', 'managerdesk', 'execdesk', 'hrdesk', 'cubicle', 'marketingdesk', 'trainingdesk', 'salesdesk', 'financedesk'] },
      { id: 'chairs', name: 'Chairs', icon: 'customer', items: ['officechair'] },
      { id: 'computers', name: 'Computers', icon: 'screen', items: ['computer', 'printer', 'serverrack', 'crmterminal', 'trainingscreen', 'wifi', 'digisign'] },
      { id: 'meeting', name: 'Meeting', icon: 'people', items: ['meetingtable', 'whiteboard'] },
      { id: 'breakroom', name: 'Break room', icon: 'opportunity', items: ['kitchen', 'breaktable', 'lockers', 'coffee', 'vending', 'watercooler', 'sink'] },
      { id: 'storage', name: 'Storage', icon: 'box', items: ['filing', 'bookcase', 'safe', 'documents', 'storagerack'] },
      { id: 'decoration', name: 'Decoration', icon: 'plant', items: ['plant', 'bigplant', 'poster', 'artwork', 'trophy', 'brandclock', 'screen'] },
      { id: 'lighting', name: 'Lighting', icon: 'opportunity', items: LIGHTS },
      { id: 'walls', name: 'Walls & doors', icon: 'brick', items: WALLS },
    ],
  },
  {
    id: 'workshop', name: 'Workshop', icon: 'wrench', zones: ['w', 'd'],
    blurb: 'Repairs, service and detailing.',
    categories: [
      { id: 'benches', name: 'Workbenches', icon: 'hammer', items: ['workbench', 'repairstation', 'toolcabinet'] },
      { id: 'lifts', name: 'Lifts', icon: 'upgrade', items: ['lift', 'inspectionlane', 'alignment'] },
      { id: 'tools', name: 'Tools', icon: 'wrench', items: ['toolwall', 'compressor', 'oilstation', 'aircon', 'pressurewasher'] },
      { id: 'diagnostics', name: 'Diagnostics', icon: 'gauge', items: ['scanner', 'diagbench', 'dealerdiag', 'evdiagstation', 'batteryservice', 'vehiclescanner'] },
      { id: 'tyres', name: 'Tyres', icon: 'swap', items: ['tyremachine', 'tyrerack', 'tyrestore'] },
      { id: 'parts', name: 'Parts', icon: 'box', items: ['partsshelf', 'partsbins', 'storagerack', 'palletrack'] },
      { id: 'detailing', name: 'Detailing', icon: 'sparkle', items: ['washbay', 'carwash', 'paintbooth', 'photostudio', 'photocorner', 'prepspot'] },
      { id: 'safety', name: 'Safety', icon: 'shield', items: ['camera', 'alarm', 'lockers', 'janitor'] },
      { id: 'lighting', name: 'Lighting', icon: 'opportunity', items: ['pendant', 'ledstrip', 'spotlight'] },
      { id: 'walls', name: 'Walls & doors', icon: 'brick', items: WALLS },
    ],
  },
  {
    id: 'storage', name: 'Storage', icon: 'box', zones: ['p', 't'],
    blurb: 'Parts store and the storage yard.',
    categories: [
      { id: 'shelving', name: 'Shelving', icon: 'layers', items: ['storagerack', 'partsshelf', 'tyrerack'] },
      { id: 'cabinets', name: 'Cabinets', icon: 'box', items: ['toolcabinet', 'filing', 'lockers'] },
      { id: 'pallets', name: 'Pallets', icon: 'layers', items: ['palletrack'] },
      { id: 'parts', name: 'Parts storage', icon: 'wrench', items: ['partsbins', 'partscounter', 'tyrestore'] },
      { id: 'containers', name: 'Containers', icon: 'box', items: ['container'] },
      { id: 'cars', name: 'Car storage', icon: 'car', items: ['storage', 'securestorage', 'tradein', 'prepspot', 'deliveryparking', 'staffparking'] },
      { id: 'safety', name: 'Safety', icon: 'shield', items: ['camera', 'alarm', 'barrier', 'securitybooth', 'securityoffice', 'fence', 'floodlight', 'lamp'] },
      { id: 'walls', name: 'Walls & doors', icon: 'brick', items: WALLS },
    ],
  },
  {
    id: 'outdoor', name: 'Outdoor', icon: 'tree', zones: ['a', 'g', 'x', 'j', '.'],
    blurb: 'The lot: parking, roads, charging, greenery and signs.',
    categories: [
      { id: 'parking', name: 'Parking', icon: 'parking', items: ['parking', 'frontrow', 'occasion', 'evparking', 'premiumparking', 'vipparking', 'visitorparking', 'staffparking', 'deliveryparking', 'newcarrow', 'usedrow', 'tdparking', 'tradein'] },
      { id: 'roads', name: 'Roads', icon: 'map', items: ['zone:j', 'zone:x', 'zone:a', 'arrows', 'crossing', 'tdlane', 'directionsign'] },
      { id: 'carspots', name: 'Car spots', icon: 'car', items: ['outdoordisplay', 'solarcarport', 'canopy', 'roofcanopy', 'promodisplay', 'eventstage'] },
      { id: 'charging', name: 'Charging', icon: 'bolt', items: ['charger', 'hpcharger', 'multicharger', 'solarcarport'] },
      { id: 'green', name: 'Greenery', icon: 'plant', items: ['zone:g', 'tree', 'palm', 'planter', 'flowerbed', 'hedge', 'fountain'] },
      { id: 'lighting', name: 'Lighting', icon: 'opportunity', items: ['lamp', 'floodlight', 'bollardlight'] },
      { id: 'signs', name: 'Signs', icon: 'marketing', items: ['pylon', 'digitalpylon', 'billboard', 'digibillboard', 'banner', 'flag', 'flagrow', 'tdsign', 'infoboard', 'pricedisplay'] },
      { id: 'entrances', name: 'Entrances', icon: 'garage', items: ['gate', 'grandgate', 'serviceentrance', 'deliveryentrance', 'tdexit', 'tdgate', 'barrier', 'vehiclescanner'] },
      { id: 'decoration', name: 'Decoration', icon: 'sparkle', items: ['bench', 'bin', 'bikerack', 'carsculpture', 'fence', 'bollard', 'securitybooth', 'photocorner', 'container'] },
    ],
  },
];

export const BUILD_ROOM_BY_ID = Object.fromEntries(BUILD_ROOMS.map((r) => [r.id, r])) as Record<RoomTypeId, BuildRoomType>;

/** Mounted on a wall: these snap to the nearest wall when placed. */
export const WALL_ITEMS = new Set(['tv', 'poster', 'artwork', 'logowall', 'ledwall', 'screen', 'neon', 'brandbanner', 'digiscreen', 'digisign', 'whiteboard', 'toolwall', 'brandclock', 'featurewall', 'carart', 'trainingscreen', 'camera', 'alarm', 'partsbins', 'ledstrip']);

/** Which room type a floor belongs to. */
export function roomTypeOfZone(code: ZoneCode): RoomTypeId {
  for (const r of BUILD_ROOMS) if (r.zones.includes(code)) return r.id;
  return 'outdoor';
}

export function placementOf(def: ObjDef): PlacementType {
  if (def.line) return 'line';
  if (WALL_ITEMS.has(def.id)) return 'wall';
  return 'floor';
}

/** Can this entry stand in this room type at all (at least one of its floors)? */
function fits(entry: string, room: BuildRoomType): boolean {
  if (entry.startsWith('zone:')) return !!ZONE_BY_CODE[entry.slice(5) as ZoneCode];
  const def = OBJ_BY_ID[entry];
  return !!def && !def.hidden && def.zones.some((z) => room.zones.includes(z));
}

/** The entries of one category of one room, in catalogue order (only what can stand there). */
export function roomEntries(roomId: RoomTypeId, categoryId: string): string[] {
  const room = BUILD_ROOM_BY_ID[roomId];
  const cat = room?.categories.find((c) => c.id === categoryId);
  return cat ? [...new Set(cat.items)].filter((e) => fits(e, room)) : [];
}

/** Every room type an item may be built in: the item's `allowedRooms`. */
const allowedIndex = new Map<string, RoomTypeId[]>();
export function allowedRooms(defId: string): RoomTypeId[] {
  const hit = allowedIndex.get(defId);
  if (hit) return hit;
  const out = BUILD_ROOMS.filter((r) => r.categories.some((c) => c.items.includes(defId)) && fits(defId, r)).map((r) => r.id);
  allowedIndex.set(defId, out);
  return out;
}

/** Objects in the catalogue that no room offers (should be none; checked by the tests). */
export function unassignedObjects(): string[] {
  return OBJECTS.filter((d) => !d.hidden && !allowedRooms(d.id).length).map((d) => d.id);
}
