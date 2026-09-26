/**
 * The physical dealership.
 *
 * Land is a tile grid. The player paints zones (showroom, workshop, lot, …)
 * and places objects (parking spaces, lifts, desks, sofas, signs, doors…).
 * Everything the business can do follows from what is physically there:
 *
 *   capacity        = vehicle spaces (parking + displays + storage)
 *   repairs/cleans  = cars actually standing on a lift / in a detailing bay
 *   staff           = workstations (a mechanic needs a lift, a salesperson a desk)
 *   showroom quality, lounge comfort, diagnostics = what is in those rooms
 *   customer flow   = whether customers can walk from the entrance to the cars
 *
 * Nothing here touches the DOM; the renderer only reads it.
 */
import type { Employee, GameState, Location, Lot, LotObject, LotStyle, Role, Vehicle, ZoneCode } from './types';
import { EFFECTS, FLOOR_STYLES, LAND_TIERS, LIGHT_STYLES, OBJ_BY_ID, SYNERGIES, WALL_STYLES, ZONE_BY_CODE } from '../data/lot';
import type { EffectKey, ObjDef, SlotKind } from '../data/lot';
import { OBJ_UPGRADES, REFUND_BASE, STYLE_BY_ID } from '../data/buildplus';
import { CITY_BY_ID, PREP_BY_ID, ROLE_BY_ID } from '../data/game';
import { record } from './finance';

// ------------------------------------------------------------------ grid --

export function zoneAt(lot: Lot, x: number, y: number): ZoneCode {
  if (x < 0 || y < 0 || x >= lot.w || y >= lot.h) return '.';
  return lot.zones[y * lot.w + x] as ZoneCode;
}

export function isIndoor(code: ZoneCode): boolean {
  return ZONE_BY_CODE[code]?.indoor ?? false;
}

export function footprint(o: LotObject): { x: number; y: number; w: number; h: number } {
  const def = OBJ_BY_ID[o.defId];
  const w = def ? (o.rot ? def.h : def.w) : 1;
  const h = def ? (o.rot ? def.w : def.h) : 1;
  return { x: o.x, y: o.y, w, h };
}

export function setZones(lot: Lot, x0: number, y0: number, x1: number, y1: number, code: ZoneCode): void {
  const chars = lot.zones.split('');
  for (let y = Math.max(0, y0); y <= Math.min(lot.h - 1, y1); y += 1) {
    for (let x = Math.max(0, x0); x <= Math.min(lot.w - 1, x1); x += 1) chars[y * lot.w + x] = code;
  }
  lot.zones = chars.join('');
}

/** Object id occupying each tile (non-walkable objects and walkable ones separately). */
const occCache = new WeakMap<Lot, { version: number; n: number; occ: { solid: (string | null)[]; any: (string | null)[] } }>();

export function occupancy(lot: Lot): { solid: (string | null)[]; any: (string | null)[] } {
  const hit = occCache.get(lot);
  if (hit && hit.version === lot.version && hit.n === lot.objects.length) return hit.occ;
  const occ = computeOccupancy(lot);
  occCache.set(lot, { version: lot.version, n: lot.objects.length, occ });
  return occ;
}

function computeOccupancy(lot: Lot): { solid: (string | null)[]; any: (string | null)[] } {
  const solid: (string | null)[] = new Array(lot.w * lot.h).fill(null);
  const any: (string | null)[] = new Array(lot.w * lot.h).fill(null);
  for (const o of lot.objects) {
    const f = footprint(o);
    const def = OBJ_BY_ID[o.defId];
    for (let y = f.y; y < f.y + f.h; y += 1) {
      for (let x = f.x; x < f.x + f.w; x += 1) {
        if (x < 0 || y < 0 || x >= lot.w || y >= lot.h) continue;
        any[y * lot.w + x] = o.id;
        if (!def?.walkable) solid[y * lot.w + x] = o.id;
      }
    }
  }
  return { solid, any };
}

let idc = 0;
export function newId(state: GameState | null, prefix: string): string {
  if (state) {
    state.idCounter += 1;
    return `${prefix}${state.idCounter.toString(36)}`;
  }
  idc += 1;
  return `${prefix}t${idc.toString(36)}`;
}

// ----------------------------------------------------- upgrades & rooms --

/** An object's effects including its upgrade levels. */
export function objectEffects(o: LotObject): Partial<Record<EffectKey, number>> {
  const def = OBJ_BY_ID[o.defId];
  const out: Partial<Record<EffectKey, number>> = { ...(def?.effects ?? {}) };
  const steps = OBJ_UPGRADES[o.defId];
  const level = Math.max(1, Math.min(3, o.level ?? 1));
  if (steps) for (let i = 0; i < level - 1; i += 1) for (const [k, v] of Object.entries(steps[i].effects ?? {})) out[k as EffectKey] = (out[k as EffectKey] ?? 0) + (v as number);
  return out;
}

/** How much faster a lift or bay works at its upgrade level. */
export function objectSpeed(o: LotObject | undefined): number {
  if (!o) return 1;
  const steps = OBJ_UPGRADES[o.defId];
  const level = Math.max(1, Math.min(3, o.level ?? 1));
  return level > 1 && steps ? steps[level - 2].speed ?? 1 : 1;
}

export interface Room {
  code: ZoneCode;
  tiles: number;
  x0: number; y0: number; x1: number; y1: number;
  cx: number; cy: number;
  indoor: boolean;
  doors: number;
  objects: string[];
  /** What the room is for, in a few words. */
  purpose: string;
  complete: boolean;
  quality: number;               // 0 incomplete, 1 basic, 2 good, 3 excellent
  needs: string[];               // what is missing to make it work
  bonus: Partial<Record<EffectKey, number>>;
}

interface RoomFunc { purpose: string; needs: [string, string[]][]; bonus: Partial<Record<EffectKey, number>> }

const SEATS = ['sofa', 'armchair', 'loungechair', 'waitingbench', 'loungeset', 'cornersofa', 'vipsofa', 'premiumlounge', 'servicewait', 'showroomseat', 'bistrotable'];
/** What makes each kind of room work, and what a working room adds. */
export const ROOM_FUNCS: Partial<Record<ZoneCode, RoomFunc>> = {
  s: { purpose: 'Sells cars: more interest, better offers', needs: [['a car display', ['display', 'premiumdisplay', 'evdisplay', 'turntable', 'platform', 'luxplatform']]], bonus: { appeal: 0.5 } },
  r: { purpose: 'Customer processing: visitors are greeted', needs: [['a reception desk', ['receptiondesk', 'welcomecounter', 'receptionpod', 'luxreception', 'infodesk']]], bonus: { reception: 0.3, satisfaction: 0.5 } },
  l: { purpose: 'Customer satisfaction: people wait happily', needs: [['seating', SEATS], ['drinks', ['coffee', 'coffeebar', 'watercooler', 'vending', 'champagnebar']]], bonus: { satisfaction: 1 } },
  o: { purpose: 'Staff productivity', needs: [['a desk', ['officedesk', 'cubicle', 'hrdesk', 'managerdesk', 'marketingdesk']]], bonus: { management: 0.5 } },
  m: { purpose: 'Management: the whole team works better', needs: [['a manager desk', ['officedesk', 'managerdesk', 'execdesk']]], bonus: { management: 0.5, morale: 0.3 } },
  w: { purpose: 'Service capacity: repairs and servicing', needs: [['a lift', ['lift', 'inspectionlane']], ['tools', ['toolwall', 'repairstation', 'toolcabinet', 'workbench', 'tyremachine']]], bonus: { workshop: 0.5 } },
  d: { purpose: 'Cleaning and detailing', needs: [['a detailing bay', ['washbay', 'carwash']]], bonus: { detailing: 0.3 } },
  p: { purpose: 'Parts on hand: repairs do not wait', needs: [['shelving', ['partsshelf', 'tyrerack', 'partscounter', 'storagerack', 'tyrestore']]], bonus: { service: 0.5 } },
  t: { purpose: 'Inventory capacity out of sight', needs: [['storage spaces', ['storage', 'securestorage', 'tradein', 'deliveryparking', 'prepspot']]], bonus: {} },
  k: { purpose: 'Staff morale', needs: [['a kitchen, table or lockers', ['kitchen', 'breaktable', 'lockers']]], bonus: { morale: 0.5 } },
  b: { purpose: 'Facilities: customers stay longer', needs: [['a toilet', ['toilet']]], bonus: { facilities: 0.3 } },
  v: { purpose: 'Service bookings', needs: [['a service desk', ['servicedesk']]], bonus: { service: 0.5 } },
  f: { purpose: 'Finance: more buyers take finance', needs: [['a finance desk', ['financedesk', 'financebooth']]], bonus: { finance: 0.5 } },
  e: { purpose: 'Handovers customers remember', needs: [['a delivery bay or desk', ['deliverybay', 'handoverdesk', 'evdelivery', 'vipdelivery']]], bonus: { satisfaction: 0.5 } },
  q: { purpose: 'Test drives: better drives, more routes', needs: [['a check-in desk', ['tdcheckin']], ['keys or seating', ['handover', 'coffee', ...SEATS]]], bonus: { testdrive: 2 } },
  n: { purpose: 'Campaign effectiveness', needs: [['a marketing desk', ['marketingdesk']]], bonus: { marketing: 1 } },
  u: { purpose: 'Training speed', needs: [['training desks or a screen', ['trainingdesk', 'trainingscreen']]], bonus: { training: 1 } },
};

const roomCache = new WeakMap<Lot, { version: number; n: number; rooms: Room[] }>();

/** Every painted room or area, what it is for and whether it works. */
export function roomsOf(lot: Lot): Room[] {
  const hit = roomCache.get(lot);
  if (hit && hit.version === lot.version && hit.n === lot.objects.length) return hit.rooms;
  const idOf = new Int32Array(lot.w * lot.h).fill(-1);
  const rooms: Room[] = [];
  for (let i = 0; i < lot.zones.length; i += 1) {
    if (idOf[i] >= 0) continue;
    const code = lot.zones[i] as ZoneCode;
    if (code === '.' || code === 'a' || code === 'g' || code === 'x' || code === 'j') continue;
    const q = [i];
    idOf[i] = rooms.length;
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity; let sx = 0; let sy = 0;
    for (let k = 0; k < q.length; k += 1) {
      const j = q[k];
      const x = j % lot.w;
      const y = Math.floor(j / lot.w);
      sx += x; sy += y;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= lot.w || ny >= lot.h) continue;
        const ni = ny * lot.w + nx;
        if (idOf[ni] >= 0 || lot.zones[ni] !== code) continue;
        idOf[ni] = rooms.length;
        q.push(ni);
      }
    }
    rooms.push({ code, tiles: q.length, x0, y0, x1, y1, cx: sx / q.length + 0.5, cy: sy / q.length + 0.5, indoor: isIndoor(code), doors: 0, objects: [], purpose: ROOM_FUNCS[code]?.purpose ?? ZONE_BY_CODE[code]?.description ?? '', complete: false, quality: 0, needs: [], bonus: {} });
  }
  for (const o of lot.objects) {
    const f = footprint(o);
    const seen = new Set<number>();
    for (let y = f.y; y < f.y + f.h; y += 1) for (let x = f.x; x < f.x + f.w; x += 1) {
      if (x < 0 || y < 0 || x >= lot.w || y >= lot.h) continue;
      const r = idOf[y * lot.w + x];
      if (r >= 0) seen.add(r);
    }
    for (const r of seen) {
      rooms[r].objects.push(o.id);
      if (isDoor(o.defId)) rooms[r].doors += 1;
    }
  }
  const byId = new Map(lot.objects.map((o) => [o.id, o]));
  const rewarded = new Set<ZoneCode>();
  for (const r of rooms) {
    const fn = ROOM_FUNCS[r.code];
    const defs = r.objects.map((id) => byId.get(id)?.defId ?? '');
    if (fn) for (const [label, ids] of fn.needs) if (!defs.some((d) => ids.includes(d))) r.needs.push(label);
    if (r.indoor && r.doors === 0) r.needs.push('a door');
    r.complete = !!fn && r.needs.length === 0;
    if (r.complete) {
      const decor = defs.filter((d) => { const e = OBJ_BY_ID[d]?.effects; return !!e && ((e.decor ?? 0) > 0 || (e.lighting ?? 0) > 0); }).length;
      r.quality = 1 + (decor >= 2 ? 1 : 0) + (r.tiles >= 40 && decor >= 1 ? 1 : 0);
      // One working room of each kind adds its bonus (a second office does not double it).
      if (!rewarded.has(r.code)) {
        rewarded.add(r.code);
        const mult = r.quality >= 3 ? 1.5 : r.quality >= 2 ? 1.25 : 1;
        for (const [k, v] of Object.entries(fn!.bonus)) r.bonus[k as EffectKey] = Math.round((v as number) * mult * 100) / 100;
      }
    }
  }
  roomCache.set(lot, { version: lot.version, n: lot.objects.length, rooms });
  return rooms;
}

// ------------------------------------------------------ refunds & unlocks --

export interface Refund { build: number; upgrades: number; rate: number; refund: number; net: number; condition: number; ageDays: number }

/**
 * What bulldozing gives back: 50–70% of what it cost (and of its upgrades),
 * depending on the kind of object, how old and worn it is.
 */
export function refundFor(state: GameState, o: LotObject): Refund {
  const def = OBJ_BY_ID[o.defId];
  const build = def?.cost ?? 0;
  const upgrades = o.upgradeSpent ?? 0;
  const ageDays = Math.max(0, state.day - (o.built ?? state.day - 90));
  const condition = Math.round(Math.max(55, Math.min(100, 100 - ageDays / 6)));
  let rate = REFUND_BASE[def?.category ?? 'structure'] ?? 0.55;
  if (ageDays < 7) rate += 0.06;                                  // as good as new
  rate -= Math.min(0.1, Math.max(0, ageDays - 30) * 0.0005);      // wear
  rate += (condition - 80) / 1000;
  rate = Math.max(0.5, Math.min(0.7, rate));
  const refund = Math.round((build + upgrades) * rate);
  return { build, upgrades, rate, refund, net: build + upgrades - refund, condition, ageDays };
}

/** Why an item is not available yet, or undefined when it is. */
export function unlockReason(state: GameState, def: ObjDef, loc?: Location): string | undefined {
  if ((def.minLevel ?? 1) > state.companyLevel) return `Unlocks at company level ${def.minLevel}.`;
  const u = def.unlock;
  if (!u) return undefined;
  const st = state.stats;
  if (u.rep !== undefined && state.reputation < u.rep) return `Needs ${u.rep}+ reputation (you have ${Math.round(state.reputation)}).`;
  if (u.sold !== undefined && st.sold < u.sold) return `Unlocks after ${u.sold} cars sold (${st.sold} so far).`;
  if (u.staff !== undefined && state.employees.length < u.staff) return `Needs a team of ${u.staff} (you have ${state.employees.length}).`;
  if (u.land !== undefined && loc && loc.lot.landTier < u.land) return `Needs a ${LAND_TIERS[u.land]?.name.toLowerCase() ?? 'bigger plot'} or larger.`;
  if (u.profit !== undefined && st.lifetimeProfit < u.profit) return `Unlocks after €${u.profit.toLocaleString('en-GB')} total profit.`;
  if (u.testDrives !== undefined && (st.testDrives ?? 0) < u.testDrives) return `Unlocks after ${u.testDrives} test drives (${st.testDrives ?? 0} so far).`;
  if (u.evSold !== undefined && (st.evSold ?? 0) < u.evSold) return `Unlocks after ${u.evSold} electric cars sold.`;
  return undefined;
}

export function effectLabel(k: EffectKey): string {
  return EFFECTS[k]?.label ?? k;
}

// --------------------------------------------------------------- stats --

export interface LotIssue { level: 'bad' | 'warn'; text: string; x?: number; y?: number }

export interface LotStats {
  slots: Record<SlotKind, LotObject[]>;
  capacity: number;
  visibleSpaces: number;
  stations: Record<string, LotObject[]>;
  stationCount: number;          // workstation objects (each seats one person)
  synergies: { id: string; objId: string; name: string; active: boolean; text: string }[];
  levels: Record<string, number>;
  effects: Record<string, number>;
  reachable: Set<string>;       // vehicle-slot object ids customers can walk up to
  flow: number;                 // 0..1 customer flow quality
  issues: LotIssue[];
  indoorTiles: number;
  tiles: Record<string, number>;
  upkeep: number;
  power: number;
  entrance?: { x: number; y: number };
  dist: Int16Array;             // walking distance from the entrance (customers), -1 unreachable
  rooms: Room[];                // every painted room or area, recognised by what is in it
}

const cache = new Map<Lot, { version: number; stats: LotStats }>();

/** Distance in metres between two rectangles (0 when they touch). */
export function rectGap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
  return Math.hypot(dx, dy);
}

export function bumpLot(lot: Lot): void {
  lot.version = (lot.version ?? 0) + 1;
}

/** Can someone step from tile a to tile b? Walls are room boundaries without a door. */
export function passable(lot: Lot, occ: { solid: (string | null)[]; any: (string | null)[] }, doorTiles: Set<number>, ax: number, ay: number, bx: number, by: number, customer: boolean): boolean {
  if (bx < 0 || by < 0 || bx >= lot.w || by >= lot.h) return false;
  const bi = by * lot.w + bx;
  if (occ.solid[bi]) return false;
  const zb = zoneAt(lot, bx, by);
  if (customer && !ZONE_BY_CODE[zb].customers) return false;
  const za = zoneAt(lot, ax, ay);
  if (za !== zb && (isIndoor(za) || isIndoor(zb))) {
    const ai = ay * lot.w + ax;
    if (!doorTiles.has(ai) && !doorTiles.has(bi)) return false;
  }
  return true;
}

/** Doorways people can walk through: doors, entrances, gaps placed in walls. */
export function isDoor(defId: string): boolean {
  const def = OBJ_BY_ID[defId];
  return !!def && !!def.walkable && (def.edge !== undefined || def.id === 'walldoor');
}

/** A room's finishes: its own if it has them, otherwise the building's. */
export function styleFor(lot: Lot, code: ZoneCode): LotStyle {
  const own = lot.roomStyles?.[code];
  return own ? { ...lot.style, ...own } : lot.style;
}

export function lotStats(lot: Lot): LotStats {
  const hit = cache.get(lot);
  if (hit && hit.version === lot.version) return hit.stats;
  const slots: Record<SlotKind, LotObject[]> = { parking: [], display: [], storage: [], lift: [], bay: [], floor: [] };
  const stations: Record<string, LotObject[]> = { sales: [], mechanic: [], detailer: [], office: [] };
  const effects: Record<string, number> = {};
  const tiles: Record<string, number> = {};
  let indoorTiles = 0;
  for (const c of lot.zones) {
    tiles[c] = (tiles[c] ?? 0) + 1;
    if (isIndoor(c as ZoneCode)) indoorTiles += 1;
  }
  let upkeep = 0;
  let power = 0;
  let stationCount = 0;
  const showroomDecor = { n: 0 };
  let entrance: { x: number; y: number } | undefined;
  for (const o of lot.objects) {
    const def = OBJ_BY_ID[o.defId];
    if (!def) continue;
    upkeep += def.upkeep * (1 + ((o.level ?? 1) - 1) * 0.25);
    power += def.power;
    if (def.slot) slots[def.slot].push(o);
    if (def.station) {
      // Every role that can work here, plus 'office' for the back-office roles.
      for (const r of def.station) (stations[r] ??= []).push(o);
      if (def.station.some((r) => OFFICE_ROLES.includes(r))) stations.office.push(o);
      stationCount += 1;
    }
    const own = objectEffects(o);
    for (const [k, v] of Object.entries(own)) effects[k] = (effects[k] ?? 0) + (v as number);
    // Decoration and lighting count towards the showroom only when they are in it.
    if (zoneAt(lot, o.x, o.y) === 's') showroomDecor.n += (own.decor ?? 0) + (own.lighting ?? 0) * 1.5;
    if ((def.id === 'gate' || def.id === 'grandgate') && !entrance) {
      const f = footprint(o);
      entrance = { x: f.x + Math.floor(f.w / 2), y: f.y + f.h - 1 };
    }
  }
  // Layout synergies: things that work better next to each other.
  const synergies: LotStats['synergies'] = [];
  for (const o of lot.objects) {
    const syn = SYNERGIES[o.defId];
    if (!syn) continue;
    const a = footprint(o);
    const hit = lot.objects.some((b) => b.id !== o.id && syn.near.includes(b.defId) && rectGap(a, footprint(b)) <= syn.range);
    synergies.push({ id: o.defId, objId: o.id, name: OBJ_BY_ID[o.defId]?.name ?? o.defId, active: hit, text: syn.text });
    if (hit) for (const [k, v] of Object.entries(syn.effects)) effects[k] = (effects[k] ?? 0) + (v as number);
  }
  // The dealership style adds its own character.
  const theme = lot.theme ? STYLE_BY_ID[lot.theme] : undefined;
  if (theme) for (const [k, v] of Object.entries(theme.effects)) effects[k] = (effects[k] ?? 0) + (v as number);
  // Complete rooms (the right furniture and a way in) work better than loose items.
  const rooms = roomsOf(lot);
  for (const r of rooms) for (const [k, v] of Object.entries(r.bonus)) effects[k] = (effects[k] ?? 0) + (v as number);
  // The showroom's own finishes (floor, walls, ceiling lighting).
  const sr = styleFor(lot, 's');
  const floorTier = FLOOR_STYLES.find((s) => s.id === sr.floor)?.tier ?? 0;
  const wallTier = WALL_STYLES.find((s) => s.id === sr.walls)?.tier ?? 0;
  const lightTier = LIGHT_STYLES.find((s) => s.id === sr.lighting)?.tier ?? 0;
  const windows = lot.objects.filter((o) => (o.defId === 'window' || o.defId === 'bigwindow' || o.defId === 'glassdoor') && zoneAt(lot, o.x, o.y) === 's').length;

  // Derived facility levels (these replace the old abstract upgrades).
  const displays = slots.display.length;
  const showroomScore = (tiles.s ?? 0) < 12 || displays === 0 ? 0
    : 1 + Math.min(1, displays / 3) + floorTier * 0.45 + wallTier * 0.35 + lightTier * 0.55 + Math.min(1.4, showroomDecor.n * 0.2) + (windows ? 0.3 : 0) + Math.min(1, (effects.appeal ?? 0) * 0.08);
  const lifts = slots.lift.length;
  const workshop = lifts === 0 ? 0 : Math.min(4, 1 + (lifts >= 2 ? 1 : 0) + ((effects.workshop ?? 0) - lifts >= 1 ? 1 : 0) + (lifts >= 3 && (effects.workshop ?? 0) - lifts >= 2 ? 1 : 0));
  const bays = slots.bay.length;
  const detailing = bays === 0 ? 0 : Math.min(3, 1 + Math.min(2, (effects.detailing ?? 0) - bays));
  const loungePts = (effects.lounge ?? 0) * (((tiles.l ?? 0) + (tiles.r ?? 0)) >= 6 ? 1 : 0.5);
  const lounge = loungePts >= 5 ? 3 : loungePts >= 2.5 ? 2 : loungePts >= 1 ? 1 : 0;
  const levels: Record<string, number> = {
    showroom: Math.max(0, Math.min(5, Math.floor(showroomScore))),
    workshop,
    detailing,
    lounge,
    equipment: Math.min(3, Math.max(0, ...lot.objects.map((o) => OBJ_BY_ID[o.defId]?.effects?.equipment ?? 0))),
  };

  // Customer walking distances from the entrance.
  const occ = occupancy(lot);
  const doorTiles = new Set<number>();
  for (const o of lot.objects) {
    if (!isDoor(o.defId)) continue;
    const f = footprint(o);
    for (let y = f.y; y < f.y + f.h; y += 1) for (let x = f.x; x < f.x + f.w; x += 1) doorTiles.add(y * lot.w + x);
  }
  const dist = new Int16Array(lot.w * lot.h).fill(-1);
  if (entrance) {
    const q: number[] = [entrance.y * lot.w + entrance.x];
    dist[q[0]] = 0;
    for (let qi = 0; qi < q.length; qi += 1) {
      const i = q[qi];
      const x = i % lot.w;
      const y = Math.floor(i / lot.w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const ni = ny * lot.w + nx;
        if (nx < 0 || ny < 0 || nx >= lot.w || ny >= lot.h || dist[ni] >= 0) continue;
        if (!passable(lot, occ, doorTiles, x, y, nx, ny, true)) continue;
        dist[ni] = dist[i] + 1;
        q.push(ni);
      }
    }
  }
  const reachable = new Set<string>();
  const distances: number[] = [];
  // Cars placed by hand on open floor where customers go count as on show too.
  const shownFloor = slots.floor.filter((o) => ZONE_BY_CODE[zoneAt(lot, o.x, o.y)]?.customers);
  for (const o of [...slots.parking, ...slots.display, ...shownFloor]) {
    const f = footprint(o);
    let best = -1;
    for (let x = f.x - 1; x <= f.x + f.w; x += 1) {
      for (let y = f.y - 1; y <= f.y + f.h; y += 1) {
        const edge = x === f.x - 1 || x === f.x + f.w || y === f.y - 1 || y === f.y + f.h;
        if (!edge || x < 0 || y < 0 || x >= lot.w || y >= lot.h) continue;
        const d = dist[y * lot.w + x];
        if (d >= 0 && (best < 0 || d < best)) best = d;
      }
    }
    if (best >= 0) {
      reachable.add(o.id);
      distances.push(best);
    }
  }
  const visible = slots.parking.length + slots.display.length;
  const reachRatio = visible ? reachable.size / visible : 0;
  const avgDist = distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
  // Crowding: walkable customer tiles per visible car.
  let walkable = 0;
  for (let i = 0; i < dist.length; i += 1) if (dist[i] >= 0) walkable += 1;
  const space = visible ? walkable / visible : 20;
  const crowd = Math.max(0, Math.min(1, (space - 4) / 12));
  const distScore = Math.max(0, Math.min(1, 1 - (avgDist - 12) / 50));
  const flow = entrance ? Math.max(0, Math.min(1, reachRatio * 0.55 + crowd * 0.25 + distScore * 0.1 + ((effects.reception ?? 0) > 0 ? 0.1 : 0) + Math.min(4, effects.wayfinding ?? 0) * 0.02)) : 0;

  const issues: LotIssue[] = [];
  if (!entrance) issues.push({ level: 'bad', text: 'No entrance — customers cannot get in. Place an Entrance on the road edge.' });
  if (visible === 0) issues.push({ level: 'bad', text: 'No parking spaces or displays — there is nowhere to show cars.' });
  const unreachable = [...slots.parking, ...slots.display].filter((o) => !reachable.has(o.id));
  const far = slots.parking.filter((o) => OBJ_BY_ID[o.defId]?.spot?.frontRow && footprint(o).y + footprint(o).h < lot.h - 7);
  if (far.length) issues.push({ level: 'warn', text: 'A front-row space is too far from the street to count as front row.', x: far[0].x, y: far[0].y });
  for (const o of unreachable.slice(0, 6)) issues.push({ level: 'warn', text: 'Customers cannot walk to this space.', x: o.x, y: o.y });
  if (unreachable.length > 6) issues.push({ level: 'warn', text: `${unreachable.length} spaces cannot be reached by customers.` });
  if (stations.sales.length === 0) issues.push({ level: 'warn', text: 'No sales desk — salespeople have nowhere to work.' });
  if (crowd < 0.25 && visible > 3) issues.push({ level: 'warn', text: 'The lot is crowded: customers struggle to get around.' });
  if (visible >= 10 && (effects.visitorParking ?? 0) < 1) issues.push({ level: 'warn', text: 'No visitor parking: on busy days customers drive on. Add visitor parking spaces.' });
  if ((tiles.s ?? 0) >= 12 && !lot.objects.some((o) => isDoor(o.defId) && zoneAt(lot, o.x, o.y) === 's')) issues.push({ level: 'warn', text: 'The showroom has no door or entrance — customers cannot get in.' });
  for (const r of rooms) if (r.indoor && r.tiles >= 6 && r.doors === 0 && r.code !== 's') issues.push({ level: 'warn', text: `The ${ZONE_BY_CODE[r.code].name.toLowerCase()} has no door — nobody can get in.`, x: r.x0, y: r.y0 });
  const cap = slots.parking.length + slots.display.length + slots.storage.length;
  const stats: LotStats = {
    slots, capacity: cap, visibleSpaces: visible, stations, stationCount, synergies, levels, effects, reachable, flow, issues,
    indoorTiles, tiles, upkeep, power, entrance, dist, rooms,
  };
  cache.set(lot, { version: lot.version, stats });
  return stats;
}

// --------------------------------------------------------- placement --

export interface PlaceCheck { ok: boolean; reason?: string; cost: number }

export function canPlace(state: GameState, loc: Location, defId: string, x: number, y: number, rot: 0 | 1, ignoreId?: string, free = false): PlaceCheck {
  const lot = loc.lot;
  const def = OBJ_BY_ID[defId];
  if (!def) return { ok: false, reason: 'Unknown object.', cost: 0 };
  const cost = free ? 0 : def.cost;
  const locked = free ? ((def.minLevel ?? 1) > state.companyLevel ? `Unlocks at company level ${def.minLevel}.` : undefined) : unlockReason(state, def, loc);
  if (locked) return { ok: false, reason: locked, cost };
  const w = rot ? def.h : def.w;
  const h = rot ? def.w : def.h;
  if (x < 0 || y < 0 || x + w > lot.w || y + h > lot.h) return { ok: false, reason: 'Outside your land.', cost };
  const occ = occupancy(lot);
  let zone: ZoneCode | null = null;
  for (let ty = y; ty < y + h; ty += 1) {
    for (let tx = x; tx < x + w; tx += 1) {
      const z = zoneAt(lot, tx, ty);
      if (!def.zones.includes(z)) return { ok: false, reason: `${def.name} must stand in: ${def.zones.map((c) => ZONE_BY_CODE[c].name).join(', ')}.`, cost };
      if (zone === null) zone = z;
      else if (isIndoor(z) && z !== zone) return { ok: false, reason: 'It cannot straddle two rooms.', cost };
      const other = occ.any[ty * lot.w + tx];
      if (other && other !== ignoreId) {
        const what = lot.objects.find((o) => o.id === other);
        const name = what ? OBJ_BY_ID[what.defId] : undefined;
        return { ok: false, reason: name?.slot === 'floor' ? 'A car is parked there.' : `The ${name?.name.toLowerCase() ?? 'space'} is in the way.`, cost };
      }
    }
  }
  if (def.spot?.frontRow && y + h < lot.h - 7) return { ok: false, reason: 'A front-row space must be within 7 m of the street.', cost };
  if (def.edge === 'road' && y + h !== lot.h) return { ok: false, reason: 'The entrance must touch the road at the bottom edge.', cost };
  if (def.edge === 'boundary') {
    let touches = false;
    for (let ty = y; ty < y + h; ty += 1) {
      for (let tx = x; tx < x + w; tx += 1) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (zoneAt(lot, tx + dx, ty + dy) !== zoneAt(lot, tx, ty)) touches = true;
        }
      }
    }
    if (!touches) return { ok: false, reason: 'Place it on the edge of a room.', cost };
  }
  if (!free && state.cash < cost) return { ok: false, reason: 'Not enough cash.', cost };
  return { ok: true, cost };
}

export function placeObject(state: GameState, loc: Location, defId: string, x: number, y: number, rot: 0 | 1): { ok: boolean; message: string; id?: string } {
  const check = canPlace(state, loc, defId, x, y, rot);
  if (!check.ok) return { ok: false, message: check.reason ?? 'Cannot place here.' };
  const def = OBJ_BY_ID[defId];
  const o: LotObject = { id: newId(state, 'o'), defId, x, y, rot, built: state.day };
  loc.lot.objects.push(o);
  bumpLot(loc.lot);
  spend(state, loc, check.cost, `Built: ${def.name}`);
  return { ok: true, message: `${def.name} built.`, id: o.id };
}

export function moveObject(state: GameState, loc: Location, objId: string, x: number, y: number, rot: 0 | 1): { ok: boolean; message: string } {
  const o = loc.lot.objects.find((ob) => ob.id === objId);
  if (!o) return { ok: false, message: 'Object not found.' };
  const check = canPlace(state, loc, o.defId, x, y, rot, o.id, true);
  if (!check.ok) return { ok: false, message: check.reason ?? 'Cannot move there.' };
  const fee = Math.min(250, Math.round((OBJ_BY_ID[o.defId]?.cost ?? 0) * 0.05));
  if (state.cash < fee) return { ok: false, message: `Moving it costs €${fee}.` };
  o.x = x;
  o.y = y;
  o.rot = rot;
  bumpLot(loc.lot);
  if (fee) spend(state, loc, fee, `Moved: ${OBJ_BY_ID[o.defId]?.name}`);
  return { ok: true, message: 'Moved.' };
}

export function removeObject(state: GameState, loc: Location, objId: string): { ok: boolean; message: string } {
  const o = loc.lot.objects.find((ob) => ob.id === objId);
  if (!o) return { ok: false, message: 'Object not found.' };
  const def = OBJ_BY_ID[o.defId];
  const parked = state.vehicles.find((v) => v.slotId === o.id && v.status !== 'sold');
  if (parked) {
    // Try to move the car elsewhere first.
    const target = findFreeSlot(state, loc, ['storage', 'parking', 'display'], o.id);
    if (!target) return { ok: false, message: 'A car is parked there and there is no other space for it.' };
    parked.slotId = target.id;
  }
  const { refund } = refundFor(state, o);
  loc.lot.objects = loc.lot.objects.filter((ob) => ob.id !== objId);
  for (const e of state.employees) if (e.stationId === objId) e.stationId = undefined;
  for (const j of state.serviceJobs ?? []) if (j.liftId === objId) j.liftId = undefined;
  bumpLot(loc.lot);
  if (refund) refundTo(state, loc, refund, `Bulldozed: ${def?.name}`);
  state.stats.bulldozed = (state.stats.bulldozed ?? 0) + 1;
  assignStations(state, loc);
  return { ok: true, message: `${def?.name ?? 'Object'} bulldozed (+€${refund.toLocaleString('en-GB')} back).` };
}

export function zoneCost(lot: Lot, x0: number, y0: number, x1: number, y1: number, code: ZoneCode): number {
  let cost = 0;
  const per = ZONE_BY_CODE[code]?.costPerTile ?? 0;
  for (let y = Math.max(0, y0); y <= Math.min(lot.h - 1, y1); y += 1) {
    for (let x = Math.max(0, x0); x <= Math.min(lot.w - 1, x1); x += 1) {
      const cur = zoneAt(lot, x, y);
      if (cur === code) continue;
      cost += per;
      // Converting to indoor needs walls and a roof; finishing styles cost extra.
      if (ZONE_BY_CODE[code].indoor) cost += styleCostPerTile(lot);
    }
  }
  return Math.round(cost);
}

function styleCostPerTile(lot: Lot): number {
  return (FLOOR_STYLES.find((s) => s.id === lot.style.floor)?.costPerTile ?? 0) + (WALL_STYLES.find((s) => s.id === lot.style.walls)?.costPerTile ?? 0) * 0.3 + (LIGHT_STYLES.find((s) => s.id === lot.style.lighting)?.costPerTile ?? 0);
}

export function paintZone(state: GameState, loc: Location, x0: number, y0: number, x1: number, y1: number, code: ZoneCode): { ok: boolean; message: string } {
  const lot = loc.lot;
  const ax = Math.max(0, Math.min(x0, x1));
  const bx = Math.min(lot.w - 1, Math.max(x0, x1));
  const ay = Math.max(0, Math.min(y0, y1));
  const by = Math.min(lot.h - 1, Math.max(y0, y1));
  // Objects standing in the area must still be allowed in the new zone.
  for (const o of lot.objects) {
    const f = footprint(o);
    const overlaps = f.x <= bx && f.x + f.w - 1 >= ax && f.y <= by && f.y + f.h - 1 >= ay;
    if (!overlaps) continue;
    const def = OBJ_BY_ID[o.defId];
    if (def && !def.zones.includes(code)) return { ok: false, message: `Move or remove the ${def.name} first — it cannot stand in ${ZONE_BY_CODE[code].name.toLowerCase()}.` };
  }
  const cost = zoneCost(lot, ax, ay, bx, by, code);
  // Tearing a room down returns a little of what it cost.
  let refund = 0;
  for (let y = ay; y <= by; y += 1) {
    for (let x = ax; x <= bx; x += 1) {
      const cur = zoneAt(lot, x, y);
      if (cur !== code) refund += (ZONE_BY_CODE[cur]?.costPerTile ?? 0) * 0.3;
    }
  }
  const net = Math.round(cost - refund);
  if (net > 0 && state.cash < net) return { ok: false, message: `That costs €${net.toLocaleString('en-GB')}.` };
  setZones(lot, ax, ay, bx, by, code);
  bumpLot(lot);
  if (net > 0) spend(state, loc, net, `Construction: ${ZONE_BY_CODE[code].name} (${(bx - ax + 1) * (by - ay + 1)} m²)`);
  else if (net < 0) refundTo(state, loc, -net, 'Demolition salvage');
  // Doors/windows that no longer sit on a boundary are removed (refunded).
  for (const o of [...lot.objects]) {
    const def = OBJ_BY_ID[o.defId];
    if (def?.edge === 'boundary' && !canPlace(state, loc, o.defId, o.x, o.y, o.rot, o.id, true).ok) removeObject(state, loc, o.id);
  }
  return { ok: true, message: net > 0 ? `${ZONE_BY_CODE[code].name}: €${net.toLocaleString('en-GB')}` : 'Area cleared.' };
}

/** Which rooms a finish can be applied to: all indoor rooms, or one kind of room. */
export type StyleTarget = 'all' | ZoneCode;

function styleTiles(lot: Lot, target: StyleTarget): number {
  const stats = lotStats(lot);
  return target === 'all' ? stats.indoorTiles : stats.tiles[target] ?? 0;
}

export function currentStyle(lot: Lot, kind: 'floor' | 'walls' | 'lighting', target: StyleTarget): string {
  return target === 'all' ? lot.style[kind] : styleFor(lot, target)[kind];
}

export function styleChangeCost(lot: Lot, kind: 'floor' | 'walls' | 'lighting', id: string, target: StyleTarget = 'all'): number {
  const list = kind === 'floor' ? FLOOR_STYLES : kind === 'walls' ? WALL_STYLES : LIGHT_STYLES;
  const opt = list.find((s) => s.id === id);
  if (!opt) return 0;
  const tiles = styleTiles(lot, target);
  return Math.round(opt.costPerTile * tiles * (kind === 'walls' ? 0.6 : 1) + (target === 'all' ? 300 : 150));
}

/**
 * Refits floors, walls or ceiling lighting — in every indoor room, or only in
 * one kind of room (a marble showroom with a concrete workshop).
 */
export function setStyle(state: GameState, loc: Location, kind: 'floor' | 'walls' | 'lighting', id: string, target: StyleTarget = 'all'): { ok: boolean; message: string } {
  const list = kind === 'floor' ? FLOOR_STYLES : kind === 'walls' ? WALL_STYLES : LIGHT_STYLES;
  const opt = list.find((s) => s.id === id);
  if (!opt) return { ok: false, message: 'Unknown style.' };
  if ((opt.minLevel ?? 1) > state.companyLevel) return { ok: false, message: `Unlocks at company level ${opt.minLevel}.` };
  const lot = loc.lot;
  if (currentStyle(lot, kind, target) === id && (target !== 'all' || !Object.values(lot.roomStyles ?? {}).some((r) => r?.[kind] && r[kind] !== id))) return { ok: false, message: 'Already fitted.' };
  if (target !== 'all' && !styleTiles(lot, target)) return { ok: false, message: `You have no ${ZONE_BY_CODE[target].name.toLowerCase()} yet.` };
  const cost = styleChangeCost(lot, kind, id, target);
  if (state.cash < cost) return { ok: false, message: `Refitting costs €${cost.toLocaleString('en-GB')}.` };
  if (target === 'all') {
    lot.style[kind] = id;
    // One finish everywhere: room-specific choices of this kind are replaced.
    for (const r of Object.values(lot.roomStyles ?? {})) if (r) delete r[kind];
  } else {
    lot.roomStyles = lot.roomStyles ?? {};
    lot.roomStyles[target] = { ...(lot.roomStyles[target] ?? {}), [kind]: id };
  }
  bumpLot(lot);
  spend(state, loc, cost, `Refit${target === 'all' ? '' : ` (${ZONE_BY_CODE[target].name})`}: ${opt.name}`);
  return { ok: true, message: `${opt.name} fitted${target === 'all' ? '' : ` in the ${ZONE_BY_CODE[target].name.toLowerCase()}`}.` };
}

// --------------------------------------------------- lines & copies --

/** Tiles of a straight line from (x0,y0) towards (x1,y1): along whichever axis moved more. */
export function lineTiles(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) {
    const s = Math.sign(x1 - x0) || 1;
    for (let x = x0; x !== x1 + s; x += s) out.push({ x, y: y0 });
  } else {
    const s = Math.sign(y1 - y0) || 1;
    for (let y = y0; y !== y1 + s; y += s) out.push({ x: x0, y });
  }
  return out;
}

export function lineCheck(state: GameState, loc: Location, defId: string, x0: number, y0: number, x1: number, y1: number): { tiles: { x: number; y: number; ok: boolean }[]; cost: number; count: number } {
  const def = OBJ_BY_ID[defId];
  const tiles = lineTiles(x0, y0, x1, y1).map((t) => ({ ...t, ok: canPlace(state, loc, defId, t.x, t.y, 0, undefined, true).ok }));
  const count = tiles.filter((t) => t.ok).length;
  return { tiles, cost: count * (def?.cost ?? 0), count };
}

/** Draws a line of walls, fences or hedges. Tiles that are blocked are skipped. */
export function placeLine(state: GameState, loc: Location, defId: string, x0: number, y0: number, x1: number, y1: number): { ok: boolean; message: string; count: number } {
  const def = OBJ_BY_ID[defId];
  if (!def?.line) return { ok: false, message: 'That is not drawn in lines.', count: 0 };
  if ((def.minLevel ?? 1) > state.companyLevel) return { ok: false, message: `Unlocks at company level ${def.minLevel}.`, count: 0 };
  const check = lineCheck(state, loc, defId, x0, y0, x1, y1);
  if (!check.count) return { ok: false, message: 'Nothing can be built along that line.', count: 0 };
  if (state.cash < check.cost) return { ok: false, message: `That line costs €${check.cost.toLocaleString('en-GB')}.`, count: 0 };
  for (const t of check.tiles) if (t.ok) loc.lot.objects.push({ id: newId(state, 'o'), defId, x: t.x, y: t.y, rot: 0, built: state.day });
  bumpLot(loc.lot);
  spend(state, loc, check.cost, `Built: ${check.count} × ${def.name}`);
  const skipped = check.tiles.length - check.count;
  return { ok: true, message: `${check.count} m of ${def.name.toLowerCase()} built${skipped ? ` (${skipped} blocked tile${skipped > 1 ? 's' : ''} skipped)` : ''}.`, count: check.count };
}

/** A free spot right next to an existing object for a copy of it. */
export function duplicateSpot(state: GameState, loc: Location, objId: string): { x: number; y: number; rot: 0 | 1 } | undefined {
  const o = loc.lot.objects.find((x) => x.id === objId);
  if (!o) return undefined;
  const f = footprint(o);
  const tries = [[f.w, 0], [0, f.h], [-f.w, 0], [0, -f.h], [f.w + 1, 0], [0, f.h + 1], [-f.w - 1, 0], [0, -f.h - 1]];
  for (const [dx, dy] of tries) {
    if (canPlace(state, loc, o.defId, o.x + dx, o.y + dy, o.rot, undefined, true).ok) return { x: o.x + dx, y: o.y + dy, rot: o.rot };
  }
  const near = findSpot(state, loc, o.defId);
  return near ? { x: near.x, y: near.y, rot: near.rot } : undefined;
}

export function duplicateObject(state: GameState, loc: Location, objId: string): { ok: boolean; message: string; id?: string } {
  const o = loc.lot.objects.find((x) => x.id === objId);
  if (!o) return { ok: false, message: 'Nothing selected.' };
  const def = OBJ_BY_ID[o.defId];
  if (!def || def.hidden) return { ok: false, message: 'That cannot be copied.' };
  const spot = duplicateSpot(state, loc, objId);
  if (!spot) return { ok: false, message: `There is no room for another ${def.name.toLowerCase()} nearby.` };
  return placeObject(state, loc, o.defId, spot.x, spot.y, spot.rot);
}

export function nextLandTier(state: GameState, loc: Location) {
  // Every town has only so much land: city plots are small, industrial ones big.
  const city = CITY_BY_ID[loc.cityId];
  if (city?.space !== undefined && loc.lot.landTier + 1 > city.space) return undefined;
  return LAND_TIERS[loc.lot.landTier + 1];
}

/** The price of the next plot at this location (land costs more in expensive towns). */
export function landCost(state: GameState, loc: Location, discount = 0): number {
  const tier = nextLandTier(state, loc);
  if (!tier) return 0;
  const city = CITY_BY_ID[loc.cityId];
  return Math.round(tier.cost * (city?.rent ?? 1500) / 1500 * (1 - discount));
}

/** The next plot's size, never smaller than what you own. */
export function nextPlot(state: GameState, loc: Location): { w: number; h: number; name: string; icon: string; minLevel: number; cost: number } | undefined {
  const tier = nextLandTier(state, loc);
  if (!tier) return undefined;
  return { w: Math.max(tier.w, loc.lot.w), h: Math.max(tier.h, loc.lot.h), name: tier.name, icon: tier.icon, minLevel: tier.minLevel, cost: landCost(state, loc) };
}

export function buyLand(state: GameState, loc: Location, discount = 0): { ok: boolean; message: string; dy?: number } {
  const next = nextPlot(state, loc);
  if (!next) return { ok: false, message: 'There is no more land for sale next to this lot.' };
  if (state.companyLevel < next.minLevel) return { ok: false, message: `The neighbours will only sell to a level ${next.minLevel} company.` };
  const cost = landCost(state, loc, discount);
  if (state.cash < cost) return { ok: false, message: `The extra land costs €${cost.toLocaleString('en-GB')}.` };
  const lot = loc.lot;
  const rows: string[] = [];
  for (let y = 0; y < next.h; y += 1) {
    let row = '';
    for (let x = 0; x < next.w; x += 1) row += y < lot.h && x < lot.w ? lot.zones[y * lot.w + x] : '.';
    rows.push(row);
  }
  // Keep the road edge where it is: anything that touched the road still does.
  const dy = next.h - lot.h;
  const shifted: string[] = [];
  for (let y = 0; y < next.h; y += 1) shifted.push(y < dy ? '.'.repeat(next.w) : rows[y - dy]);
  lot.zones = shifted.join('');
  for (const o of lot.objects) o.y += dy;
  lot.w = next.w;
  lot.h = next.h;
  lot.landTier += 1;
  bumpLot(lot);
  loc.rentMonthly = rentFor(loc);
  spend(state, loc, cost, `Bought land: ${LAND_TIERS[lot.landTier]?.name ?? 'bigger plot'} (${next.w}×${next.h} m)`);
  state.stats.landBought = (state.stats.landBought ?? 0) + 1;
  return { ok: true, dy, message: `${LAND_TIERS[lot.landTier]?.icon ?? ''} ${LAND_TIERS[lot.landTier]?.name ?? 'New plot'}: ${next.w} × ${next.h} m. Rent is now €${loc.rentMonthly.toLocaleString('en-GB')}/month.` };
}

export function rentFor(loc: Location, w = loc.lot.w, h = loc.lot.h): number {
  const city = CITY_BY_ID[loc.cityId];
  const area = w * h;
  const indoor = lotStats(loc.lot).indoorTiles;
  return Math.round(((city?.rent ?? 1500) * Math.pow(area / 600, 0.75) * (loc.rentFactor ?? 1) + indoor * 1.5) / 10) * 10;
}

export function spend(state: GameState, loc: Location, amount: number, text: string): void {
  if (amount <= 0) return;
  record(state, 'Construction', -amount, text, loc.id);
}

export function refundTo(state: GameState, loc: Location, amount: number, text: string): void {
  if (amount <= 0) return;
  record(state, 'Construction', amount, text, loc.id);
}

// ------------------------------------------------------ vehicles on lot --

function vehiclesUsing(state: GameState): Map<string, Vehicle> {
  const m = new Map<string, Vehicle>();
  for (const v of state.vehicles) if (v.slotId && v.status !== 'sold' && v.status !== 'transit') m.set(v.slotId, v);
  return m;
}

export function slotKindOf(loc: Location, slotId?: string): SlotKind | undefined {
  if (!slotId) return undefined;
  const o = loc.lot.objects.find((ob) => ob.id === slotId);
  return o ? OBJ_BY_ID[o.defId]?.slot : undefined;
}

export function findFreeSlot(state: GameState, loc: Location, kinds: SlotKind[], exclude?: string): LotObject | undefined {
  const used = vehiclesUsing(state);
  const stats = lotStats(loc.lot);
  for (const k of kinds) {
    const list = stats.slots[k].filter((o) => o.id !== exclude && !used.has(o.id));
    // Customer-facing spaces: prefer the ones customers can actually reach, nearest first.
    if (k === 'parking' || k === 'display') {
      const reach = list.filter((o) => stats.reachable.has(o.id));
      if (reach.length) return reach[0];
    }
    if (list.length) return list[0];
  }
  return undefined;
}

export function isVisibleSlot(loc: Location, slotId?: string): boolean {
  if (!slotId) return false;
  const o = loc.lot.objects.find((ob) => ob.id === slotId);
  const k = o ? OBJ_BY_ID[o.defId]?.slot : undefined;
  if (k === 'floor') return !!ZONE_BY_CODE[zoneAt(loc.lot, o!.x, o!.y)]?.customers;
  return k === 'parking' || k === 'display';
}

/** Is this car's spot indoors (a display, or loose on a showroom floor)? */
export function isIndoorSlot(loc: Location, slotId?: string): boolean {
  const o = slotId ? loc.lot.objects.find((x) => x.id === slotId) : undefined;
  return !!o && isIndoor(zoneAt(loc.lot, o.x, o.y));
}

/** Loose car positions nobody stands on any more are cleared away. */
function sweepFloorSpots(state: GameState, loc: Location): void {
  const used = new Set(state.vehicles.filter((v) => v.slotId && v.locationId === loc.id && v.status !== 'sold' && v.status !== 'transit' && v.status !== 'transfer').map((v) => v.slotId));
  const before = loc.lot.objects.length;
  loc.lot.objects = loc.lot.objects.filter((o) => o.defId !== 'carpos' || used.has(o.id));
  if (loc.lot.objects.length !== before) bumpLot(loc.lot);
}

/**
 * Keeps every car in a physically sensible place:
 * being repaired → on a lift; being detailed → in a detailing bay;
 * for sale → on a customer-facing space; otherwise wherever there is room.
 */
export function assignSlots(state: GameState, loc: Location): void {
  const objIds = new Set(loc.lot.objects.map((o) => o.id));
  const here = state.vehicles.filter((v) => v.locationId === loc.id && (v.status === 'yard' || v.status === 'prep' || v.status === 'listed'));
  // Invalid slots are cleared.
  for (const v of here) if (v.slotId && !objIds.has(v.slotId)) v.slotId = undefined;
  for (const v of state.vehicles) if ((v.status === 'transit' || v.status === 'sold' || v.status === 'transfer') && v.slotId) v.slotId = undefined;
  sweepFloorSpots(state, loc);
  // Work first: queued jobs take free lifts/bays in the order they were booked.
  for (const v of here) {
    if (v.status !== 'prep' || !v.prep.length) continue;
    const need: SlotKind = PREP_BY_ID[v.prep[0].actionId]?.staff === 'detailer' ? 'bay' : 'lift';
    if (slotKindOf(loc, v.slotId) === need) continue;
    const free = findFreeSlot(state, loc, [need]);
    if (free) v.slotId = free.id;
  }
  // Finished work leaves the bay.
  for (const v of here) {
    const k = slotKindOf(loc, v.slotId);
    if ((k === 'lift' || k === 'bay') && v.status !== 'prep') {
      const target = v.status === 'listed' ? findFreeSlot(state, loc, ['display', 'parking']) : findFreeSlot(state, loc, ['storage', 'parking', 'display']);
      if (target) v.slotId = target.id;
    }
  }
  // Cars for sale belong where customers can see them.
  for (const v of here) {
    if (v.status !== 'listed' || isVisibleSlot(loc, v.slotId)) continue;
    const target = findFreeSlot(state, loc, ['display', 'parking']);
    if (target) v.slotId = target.id;
  }
  // Everyone else gets any free space.
  for (const v of here) {
    if (v.slotId) continue;
    const target = v.status === 'listed' ? findFreeSlot(state, loc, ['display', 'parking', 'storage']) : findFreeSlot(state, loc, ['storage', 'parking', 'display']);
    if (target) v.slotId = target.id;
  }
}

export function moveVehicleTo(state: GameState, loc: Location, vehicleId: string, slotId: string): { ok: boolean; message: string } {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  const o = loc.lot.objects.find((x) => x.id === slotId);
  if (!v || !o) return { ok: false, message: 'Nothing to move.' };
  const def = OBJ_BY_ID[o.defId];
  if (!def?.slot) return { ok: false, message: 'Cars can only be parked on parking spaces, displays, storage, lifts or bays.' };
  if (v.locationId !== loc.id) return { ok: false, message: 'That car is at another dealership.' };
  if (def.slot === 'lift' || def.slot === 'bay') return { ok: false, message: 'Book a job in the Prep menu — the car moves onto the lift or bay by itself.' };
  const other = state.vehicles.find((x) => x.slotId === slotId && x.id !== v.id && x.status !== 'sold');
  if (other) {
    // Swap places.
    other.slotId = v.slotId;
  }
  v.slotId = slotId;
  if (v.status === 'listed' && !isVisibleSlot(loc, slotId)) {
    v.status = 'yard';
    v.listedOnline = false;
  }
  if (other && other.status === 'listed' && !isVisibleSlot(loc, other.slotId)) {
    other.status = 'yard';
    other.listedOnline = false;
  }
  sweepFloorSpots(state, loc);
  return { ok: true, message: other ? 'Swapped places.' : 'Moved.' };
}

// ------------------------------------------------- cars placed by hand --

export interface CarDrop { ok: boolean; reason?: string; slotId?: string; x: number; y: number; rot: 0 | 1; swap?: string }

/** A car's footprint on open floor: 2 × 4 m, or 4 × 2 m turned. */
export function carSize(rot: 0 | 1): { w: number; h: number } {
  return rot ? { w: 4, h: 2 } : { w: 2, h: 4 };
}

/**
 * Where would a car end up if dropped here? Into the space under it (or,
 * with snapping, the nearest free space close by); otherwise standing on
 * open floor, if there is room.
 */
export function carDropCheck(state: GameState, loc: Location, vehicleId: string, cx: number, cy: number, rot: 0 | 1, snap: boolean): CarDrop {
  const lot = loc.lot;
  const v = state.vehicles.find((x) => x.id === vehicleId);
  const { w, h } = carSize(rot);
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  if (!v) return { ok: false, reason: 'Unknown car.', x, y, rot };
  if (v.locationId !== loc.id) return { ok: false, reason: 'That car is at another dealership.', x, y, rot };
  if (v.status !== 'yard' && v.status !== 'listed') return { ok: false, reason: v.status === 'prep' ? 'It is booked in for work.' : 'It is not on the lot.', x, y, rot };
  const used = vehiclesUsing(state);
  // A marked space under the pointer (or near it when snapping).
  const tx = Math.floor(cx);
  const ty = Math.floor(cy);
  let best: LotObject | undefined;
  let bestD = 2.5;
  for (const o of lot.objects) {
    const def = OBJ_BY_ID[o.defId];
    if (!def?.slot || def.slot === 'floor') continue;
    const f = footprint(o);
    if (tx >= f.x && tx < f.x + f.w && ty >= f.y && ty < f.y + f.h) { best = o; break; }
    if (!snap || def.slot === 'lift' || def.slot === 'bay') continue;
    const occupant = used.get(o.id);
    if (occupant && occupant.id !== v.id) continue;
    // Distance from the pointer to the space's edge.
    const dx = Math.max(f.x - cx, 0, cx - (f.x + f.w));
    const dy = Math.max(f.y - cy, 0, cy - (f.y + f.h));
    const d = Math.hypot(dx, dy);
    if (d < bestD) { best = o; bestD = d; }
  }
  if (best) {
    const def = OBJ_BY_ID[best.defId];
    const f = footprint(best);
    if (def.slot === 'lift' || def.slot === 'bay') return { ok: false, reason: 'Book a job in Prep — the car goes onto the lift or into the bay by itself.', x: f.x, y: f.y, rot: f.h >= f.w ? 0 : 1, slotId: best.id };
    const occupant = used.get(best.id);
    return { ok: true, x: f.x, y: f.y, rot: f.h >= f.w ? 0 : 1, slotId: best.id, swap: occupant && occupant.id !== v.id ? occupant.id : undefined };
  }
  const def = OBJ_BY_ID.carpos;
  if (x < 0 || y < 0 || x + w > lot.w || y + h > lot.h) return { ok: false, reason: 'Outside your land.', x, y, rot };
  const occ = occupancy(lot);
  const own = v.slotId;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const z = zoneAt(lot, xx, yy);
      if (!def.zones.includes(z)) return { ok: false, reason: `Cars can stand on the lot, walkways, storage, in the showroom, workshop, detailing or service areas — not in the ${ZONE_BY_CODE[z].name.toLowerCase()}.`, x, y, rot };
      const other = occ.any[yy * lot.w + xx];
      if (other && other !== own) {
        const what = lot.objects.find((o) => o.id === other);
        return { ok: false, reason: what?.defId === 'carpos' ? 'Another car is standing there.' : `The ${OBJ_BY_ID[what?.defId ?? '']?.name.toLowerCase() ?? 'object'} is in the way.`, x, y, rot };
      }
    }
  }
  return { ok: true, x, y, rot };
}

/** Puts a car exactly where the player dropped it. */
export function placeVehicle(state: GameState, loc: Location, vehicleId: string, cx: number, cy: number, rot: 0 | 1, snap = true): { ok: boolean; message: string } {
  const drop = carDropCheck(state, loc, vehicleId, cx, cy, rot, snap);
  if (!drop.ok) return { ok: false, message: drop.reason ?? 'It does not fit there.' };
  if (drop.slotId) return moveVehicleTo(state, loc, vehicleId, drop.slotId);
  const v = state.vehicles.find((x) => x.id === vehicleId)!;
  const old = v.slotId ? loc.lot.objects.find((o) => o.id === v.slotId) : undefined;
  if (old && old.defId === 'carpos') {
    // Just move the car's own spot.
    old.x = drop.x;
    old.y = drop.y;
    old.rot = drop.rot;
  } else {
    const o: LotObject = { id: newId(state, 'o'), defId: 'carpos', x: drop.x, y: drop.y, rot: drop.rot };
    loc.lot.objects.push(o);
    v.slotId = o.id;
  }
  bumpLot(loc.lot);
  if (v.status === 'listed' && !isVisibleSlot(loc, v.slotId)) {
    v.status = 'yard';
    v.listedOnline = false;
    sweepFloorSpots(state, loc);
    return { ok: true, message: 'Parked. Customers cannot see it here, so it is off sale for now.' };
  }
  sweepFloorSpots(state, loc);
  return { ok: true, message: 'Parked.' };
}

/**
 * What a car's position does for it: attention from customers and a little
 * extra willingness to pay when the spot suits the car (premium on a premium
 * display, electric next to a charger, a bargain on the bargain corner).
 */
export function spotBonus(loc: Location, v: Vehicle): { attention: number; wtp: number; label: string } {
  const lot = loc.lot;
  const o = v.slotId ? lot.objects.find((x) => x.id === v.slotId) : undefined;
  const def = o ? OBJ_BY_ID[o.defId] : undefined;
  if (!o || !def?.spot) return { attention: 0, wtp: 0, label: '' };
  const premium = v.category === 'Premium' || v.category === 'Luxury' || v.category === 'Performance' || v.category === 'Rare';
  const ev = v.fuel === 'Electric';
  const budget = v.askingPrice > 0 && v.askingPrice < 12000;
  const s = def.spot;
  let attention = s.attention;
  let wtp = 0;
  let label = def.name;
  const used = !v.isNew;
  const fits = !s.fit || s.fit === 'any' || (s.fit === 'premium' && premium) || (s.fit === 'ev' && ev) || (s.fit === 'budget' && budget) || (s.fit === 'new' && !!v.isNew) || (s.fit === 'used' && used);
  // Upgraded spaces (lit, covered, hero displays) get more attention.
  const steps = OBJ_UPGRADES[o.defId];
  for (let i = 0; steps && i < Math.min(2, (o.level ?? 1) - 1); i += 1) { attention += steps[i].attention ?? 0; }
  if (s.frontRow && footprint(o).y + footprint(o).h < lot.h - 7) attention = 0;
  if (fits) wtp = (s.wtp ?? 0) + (steps && (o.level ?? 1) >= 2 ? (steps[Math.min(1, (o.level ?? 1) - 2)].wtp ?? 0) : 0);
  else attention = Math.round(attention * 0.4);
  if (def.slot === 'floor') {
    const z = zoneAt(lot, o.x, o.y);
    if (z === 's') { attention = 6; wtp = 0.008; label = 'Showroom floor'; }
    else if (z === 'x') { attention = 3; label = 'Walkway'; }
    else label = 'Parked by hand';
  }
  // An electric car parked right next to a charger counts as charging.
  if (ev && !(s.fit === 'ev')) {
    const f = footprint(o);
    const near = lot.objects.some((c) => c.defId === 'charger' && c.x >= f.x - 1 && c.x <= f.x + f.w && c.y >= f.y - 1 && c.y <= f.y + f.h);
    if (near) { attention += 5; wtp += 0.02; label += ' + charger'; }
  }
  return { attention, wtp, label };
}

// ------------------------------------------------------------ staff --


export function freeStation(state: GameState, loc: Location, role: Role, except?: string): LotObject | undefined {
  const used = new Set(state.employees.filter((e) => e.locationId === loc.id && e.id !== except).map((e) => e.stationId));
  // Prefer a station made for this role alone (a sales desk for a salesperson, not the finance desk).
  const fits = loc.lot.objects.filter((o) => (OBJ_BY_ID[o.defId]?.station ?? []).includes(role) && !used.has(o.id));
  fits.sort((a, b) => (OBJ_BY_ID[a.defId]?.station?.length ?? 9) - (OBJ_BY_ID[b.defId]?.station?.length ?? 9));
  return fits[0];
}

export function assignStations(state: GameState, loc: Location): void {
  const ids = new Set(loc.lot.objects.map((o) => o.id));
  const staff = state.employees.filter((e) => e.locationId === loc.id);
  for (const e of staff) {
    const o = e.stationId ? loc.lot.objects.find((x) => x.id === e.stationId) : undefined;
    const ok = o && ids.has(o.id) && (OBJ_BY_ID[o.defId]?.station ?? []).includes(e.role);
    if (!ok) e.stationId = undefined;
  }
  for (const e of staff) {
    if (e.stationId) continue;
    const s = freeStation(state, loc, e.role, e.id);
    if (s) e.stationId = s.id;
  }
}

export function stationName(role: Role): string {
  return ROLE_BY_ID[role]?.station ?? 'a workstation';
}

/** Roles that sit at office desks. */
export const OFFICE_ROLES: Role[] = ['manager', 'accountant', 'buyer', 'marketing', 'inventory'];

/** Effective workers: staff without a workstation work at half pace. */
export function hasStation(e: Employee): boolean {
  return !!e.stationId;
}

// ---------------------------------------------------------- templates --

export interface TemplateDef { id: string; name: string; description: string; build: (w: number, h: number) => { zones: [number, number, number, number, ZoneCode][]; objects: [string, number, number, 0 | 1][] }; style?: Partial<Lot['style']> }

const rowOf = (defId: string, x0: number, y: number, n: number, step: number, rot: 0 | 1 = 0): [string, number, number, 0 | 1][] =>
  Array.from({ length: n }, (_, i) => [defId, x0 + i * step, y, rot] as [string, number, number, 0 | 1]);

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'small', name: 'Small used-car lot', description: 'A sales cabin, five spaces and a sign. The classic start.',
    build: (w, h) => ({
      zones: [[0, 0, w - 1, 6, 'g'], [0, 7, w - 1, h - 1, 'a'], [1, 1, 8, 6, 'r']],
      objects: [
        ['gate', 11, h - 2, 0], ['door', 4, 6, 0], ['salesdesk', 2, 2, 0], ['sofa', 5, 2, 0], ['coffee', 7, 5, 0], ['plant', 1, 5, 0],
        ...rowOf('parking', 10, 9, w >= 38 ? 8 : 5, 3), ['pylon', w - 4, h - 4, 0], ['flag', 1, 8, 0], ['flag', 3, 8, 0], ['tree', 12, 1, 0], ['tree', 20, 2, 0], ['tree', 26, 1, 0], ['planter', 9, 5, 0],
      ],
    }),
  },
  {
    id: 'volume', name: 'High-volume lot', description: 'Rows of parking, a storage yard and a quick sales cabin.',
    build: (w, h) => ({
      zones: [[0, 6, w - 1, h - 1, 'a'], [1, 0, 7, 5, 'r'], [9, 0, w - 1, 5, 't']],
      objects: [
        ['gate', 1, h - 2, 0], ['door', 3, 5, 0], ['salesdesk', 2, 1, 0], ['salesdesk', 5, 1, 0], ['coffee', 6, 4, 0],
        ...rowOf('parking', 6, 7, 7, 3), ...rowOf('storage', 10, 0, 6, 3), ['banner', 1, 13, 0], ['pylon', w - 3, h - 3, 0],
      ],
    }),
  },
  {
    id: 'premium', name: 'Premium showroom', description: 'A glass showroom with three displays, reception and a lounge.',
    style: { floor: 'tile', walls: 'modern', lighting: 'led' },
    build: (w, h) => ({
      zones: [[0, 11, w - 1, h - 1, 'a'], [1, 1, 16, 10, 's'], [17, 1, 24, 5, 'l'], [17, 6, 24, 10, 'r'], [25, 0, w - 1, 10, 'g']],
      objects: [
        ['gate', 18, h - 2, 0], ['door', 8, 10, 0], ['door', 20, 10, 0], ['door', 17, 7, 1], ['display', 2, 2, 0], ['display', 7, 2, 0], ['display', 12, 2, 0],
        ['window', 2, 10, 0], ['window', 12, 10, 0], ['receptiondesk', 19, 7, 0], ['salesdesk', 22, 8, 0], ['sofa', 18, 2, 0], ['sofa', 18, 4, 0],
        ['coffee', 23, 2, 0], ['tv', 22, 1, 0], ['plant', 1, 9, 0], ['plant', 16, 9, 0], ['infoboard', 6, 8, 0],
        ...rowOf('parking', 1, 13, 4, 3), ['pylon', w - 3, h - 4, 0], ['tree', 26, 2, 0],
      ],
    }),
  },
  {
    id: 'sports', name: 'Sports specialist', description: 'Dark, dramatic showroom for fast cars, plus a small workshop.',
    style: { floor: 'industrial', walls: 'modern', lighting: 'led' },
    build: (w, h) => ({
      zones: [[0, 12, w - 1, h - 1, 'a'], [1, 1, 14, 11, 's'], [15, 1, 22, 11, 'w'], [23, 1, w - 1, 6, 'r']],
      objects: [
        ['gate', 24, h - 2, 0], ['door', 6, 11, 0], ['door', 24, 6, 0], ['door', 15, 9, 1], ['display', 2, 2, 0], ['display', 8, 2, 0],
        ['neon', 5, 9, 0], ['window', 10, 11, 0], ['lift', 16, 2, 0], ['toolwall', 17, 10, 0], ['salesdesk', 24, 2, 0], ['sofa', 26, 2, 0],
        ...rowOf('parking', 1, 14, 4, 3), ['flag', 20, 14, 0], ['pylon', w - 3, h - 4, 0],
      ],
    }),
  },
  {
    id: 'ev', name: 'EV specialist', description: 'Bright showroom with chargers on every bay.',
    style: { floor: 'tile', walls: 'modern', lighting: 'led' },
    build: (w, h) => ({
      zones: [[0, 10, w - 1, h - 1, 'a'], [1, 1, 15, 9, 's'], [16, 1, 22, 9, 'r'], [23, 0, w - 1, 9, 'g']],
      objects: [
        ['gate', 17, h - 2, 0], ['door', 7, 9, 0], ['door', 18, 9, 0], ['door', 15, 5, 1], ['display', 2, 2, 0], ['display', 8, 2, 0],
        ['charger', 6, 2, 0], ['charger', 12, 2, 0], ['window', 2, 9, 0], ['salesdesk', 17, 2, 0], ['sofa', 19, 6, 0], ['coffee', 21, 2, 0],
        ...rowOf('parking', 1, 12, 4, 3), ['charger', 13, 12, 0], ['plant', 1, 8, 0], ['tree', 24, 2, 0], ['pylon', w - 3, h - 4, 0],
      ],
    }),
  },
  {
    id: 'empty', name: 'Empty land', description: 'A bare plot and an entrance. Build everything yourself.',
    build: (w, h) => ({ zones: [[0, h - 3, w - 1, h - 1, 'a']], objects: [['gate', Math.floor(w / 2) - 2, h - 2, 0]] }),
  },
];
export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t])) as Record<string, TemplateDef>;

export function emptyLot(tier = 0): Lot {
  const t = LAND_TIERS[tier];
  return { w: t.w, h: t.h, landTier: tier, zones: '.'.repeat(t.w * t.h), objects: [], style: { floor: 'concrete', walls: 'basic', lighting: 'basic' }, open: true, version: 1 };
}

/** Builds a template onto a lot, skipping anything the company has not unlocked. */
export function buildTemplate(state: GameState | null, lot: Lot, templateId: string, companyLevel: number): number {
  const t = TEMPLATE_BY_ID[templateId] ?? TEMPLATES[0];
  const plan = t.build(lot.w, lot.h);
  lot.zones = '.'.repeat(lot.w * lot.h);
  lot.objects = [];
  let cost = 0;
  for (const [x0, y0, x1, y1, code] of plan.zones) {
    cost += zoneCost(lot, x0, y0, x1, y1, code);
    setZones(lot, x0, y0, x1, y1, code);
  }
  if (t.style) lot.style = { ...lot.style, ...t.style };
  for (const [defId, x, y, rot] of plan.objects) {
    const def = OBJ_BY_ID[defId];
    if (!def || (def.minLevel ?? 1) > companyLevel) continue;
    const w = rot ? def.h : def.w;
    const h = rot ? def.w : def.h;
    if (x < 0 || y < 0 || x + w > lot.w || y + h > lot.h) continue;
    lot.objects.push({ id: newId(state, 'o'), defId, x, y, rot });
    cost += def.cost;
  }
  bumpLot(lot);
  return cost;
}

export function templateCost(templateId: string, tier: number, level: number): number {
  const lot = emptyLot(tier);
  return buildTemplate(null, lot, templateId, level);
}

/** Replaces the whole layout with a template. Existing build is sold for half. */
export function applyTemplate(state: GameState, loc: Location, templateId: string): { ok: boolean; message: string } {
  const lot = loc.lot;
  const salvage = Math.round(lot.objects.reduce((s, o) => s + (OBJ_BY_ID[o.defId]?.cost ?? 0), 0) * 0.5);
  const cost = templateCost(templateId, lot.landTier, state.companyLevel);
  const net = cost - salvage;
  if (net > 0 && state.cash < net) return { ok: false, message: `Rebuilding costs €${net.toLocaleString('en-GB')} after salvage.` };
  const capBefore = state.vehicles.filter((v) => v.locationId === loc.id && v.status !== 'sold' && v.status !== 'transit').length;
  const trial: Lot = JSON.parse(JSON.stringify(lot));
  buildTemplate(state, trial, templateId, state.companyLevel);
  if (lotStats(trial).capacity < capBefore) return { ok: false, message: `That layout has ${lotStats(trial).capacity} spaces but you have ${capBefore} cars here.` };
  Object.assign(lot, trial, { version: lot.version + 1 });
  cache.delete(lot);
  for (const v of state.vehicles) if (v.locationId === loc.id) v.slotId = undefined;
  for (const e of state.employees) if (e.locationId === loc.id) e.stationId = undefined;
  if (net > 0) spend(state, loc, net, `Rebuilt as: ${TEMPLATE_BY_ID[templateId].name}`);
  else if (net < 0) refundTo(state, loc, -net, 'Rebuild salvage');
  assignSlots(state, loc);
  assignStations(state, loc);
  loc.rentMonthly = rentFor(loc);
  return { ok: true, message: `Rebuilt as ${TEMPLATE_BY_ID[templateId].name}.` };
}

export function isObjDef(x: unknown): x is ObjDef {
  return typeof x === 'object' && x !== null && 'slot' in x;
}

// -------------------------------------------------------- auto placing --

/**
 * Finds a good free spot for an object: valid, and (for vehicle spaces) one
 * that customers can still walk to without cutting anything else off.
 */
export function findSpot(state: GameState, loc: Location, defId: string, allowPaving = false): { x: number; y: number; rot: 0 | 1; paving: number } | undefined {
  const lot = loc.lot;
  const def = OBJ_BY_ID[defId];
  if (!def) return undefined;
  const before = lotStats(lot);
  const customerFacing = def.slot === 'parking' || def.slot === 'display';
  const tryAt = (trial: Lot, x: number, y: number, rot: 0 | 1): boolean => {
    const probe: Location = { ...loc, lot: trial };
    if (!canPlace(state, probe, defId, x, y, rot, undefined, true).ok) return false;
    const test: Lot = { ...trial, objects: [...trial.objects, { id: '__probe', defId, x, y, rot }], version: -Math.random() };
    const after = lotStats(test);
    cache.delete(test);
    if (after.reachable.size < before.reachable.size) return false;
    if (customerFacing && !after.reachable.has('__probe')) return false;
    if (before.entrance && !after.entrance) return false;
    return true;
  };
  for (const rot of [0, 1] as const) {
    for (let y = 0; y < lot.h; y += 1) {
      for (let x = 0; x < lot.w; x += 1) {
        if (!def.zones.includes(zoneAt(lot, x, y))) continue;
        if (tryAt(lot, x, y, rot)) return { x, y, rot, paving: 0 };
      }
    }
  }
  if (!allowPaving || !def.zones.includes('a')) return undefined;
  // Pave a patch of bare land (with a walkway around it) and place it there.
  const w = def.w;
  const h = def.h;
  for (let y = 0; y + h <= lot.h; y += 1) {
    for (let x = 0; x + w <= lot.w; x += 1) {
      let ok = true;
      for (let ty = y - 1; ty <= y + h && ok; ty += 1) {
        for (let tx = x - 1; tx <= x + w && ok; tx += 1) {
          if (tx < 0 || ty < 0 || tx >= lot.w || ty >= lot.h) continue;
          const z = zoneAt(lot, tx, ty);
          const inside = tx >= x && tx < x + w && ty >= y && ty < y + h;
          if (inside ? z !== '.' && z !== 'a' : z !== '.' && z !== 'a' && z !== 'g') ok = false;
        }
      }
      if (!ok) continue;
      const trial: Lot = JSON.parse(JSON.stringify(lot));
      setZones(trial, x - 1, y - 1, x + w, y + h, 'a');
      // Only bare ground is paved; lawns stay lawns.
      const chars = trial.zones.split('');
      for (let i = 0; i < chars.length; i += 1) if (lot.zones[i] === 'g') chars[i] = 'g';
      trial.zones = chars.join('');
      trial.version = -Math.random();
      if (tryAt(trial, x, y, 0)) {
        const paving = zoneCost(lot, Math.max(0, x - 1), Math.max(0, y - 1), Math.min(lot.w - 1, x + w), Math.min(lot.h - 1, y + h), 'a');
        cache.delete(trial);
        return { x, y, rot: 0, paving };
      }
      cache.delete(trial);
    }
  }
  return undefined;
}

/** One-tap build: puts the object in the best free spot (paving bare land if needed). */
export function autoPlace(state: GameState, loc: Location, defId: string): { ok: boolean; message: string; id?: string } {
  const def = OBJ_BY_ID[defId];
  if (!def) return { ok: false, message: 'Unknown object.' };
  if ((def.minLevel ?? 1) > state.companyLevel) return { ok: false, message: `Unlocks at company level ${def.minLevel}.` };
  const spot = findSpot(state, loc, defId, true);
  if (!spot) return { ok: false, message: `There is no room for a ${def.name.toLowerCase()}. Buy more land or rearrange in Build mode.` };
  if (state.cash < def.cost + spot.paving) return { ok: false, message: `That costs €${(def.cost + spot.paving).toLocaleString('en-GB')}.` };
  if (spot.paving > 0) {
    const w = spot.rot ? def.h : def.w;
    const h = spot.rot ? def.w : def.h;
    const before = lot0(loc.lot);
    setZones(loc.lot, spot.x - 1, spot.y - 1, spot.x + w, spot.y + h, 'a');
    const chars = loc.lot.zones.split('');
    for (let i = 0; i < chars.length; i += 1) if (before[i] === 'g') chars[i] = 'g';
    loc.lot.zones = chars.join('');
    bumpLot(loc.lot);
    spend(state, loc, spot.paving, 'Construction: paving');
  }
  return placeObject(state, loc, defId, spot.x, spot.y, spot.rot);
}

function lot0(lot: Lot): string {
  return lot.zones;
}

export interface RoomPlan { zone: ZoneCode; w: number; h: number; contents: string[] }

/** Ready-made rooms the player can drop in with one tap (and then tweak). */
export const QUICK_ROOMS: Record<string, RoomPlan & { name: string; icon: string; description: string }> = {
  workshop: { name: 'Workshop with lift', icon: '🔧', zone: 'w', w: 7, h: 9, contents: ['lift', 'toolwall'], description: 'A repair room with one lift and a tool wall. Lets you hire a mechanic.' },
  detailing: { name: 'Detailing bay', icon: '🧽', zone: 'd', w: 7, h: 9, contents: ['washbay'], description: 'A cleaning room with one bay. Lets you hire a detailer.' },
  office: { name: 'Office', icon: '🏢', zone: 'o', w: 6, h: 5, contents: ['officedesk', 'officedesk'], description: 'Two desks for a manager, buyer, accountant or marketing specialist.' },
  lounge: { name: 'Customer lounge', icon: '☕', zone: 'l', w: 7, h: 5, contents: ['sofa', 'coffee', 'armchair'], description: 'Somewhere comfortable to wait. Customers stay longer and leave happier.' },
  showroom: { name: 'Showroom', icon: '✨', zone: 's', w: 12, h: 9, contents: ['display', 'display', 'plant'], description: 'An indoor hall with two lit displays.' },
  storage: { name: 'Storage yard', icon: '📦', zone: 't', w: 10, h: 6, contents: ['storage', 'storage', 'storage'], description: 'Three cheap spaces for cars waiting for work.' },
  toilets: { name: 'Customer toilets', icon: '🚻', zone: 'b', w: 5, h: 4, contents: ['toilet', 'sink'], description: 'A toilet and a basin. Facilities keep customers comfortable.' },
  staffroom: { name: 'Staff room', icon: '🍽️', zone: 'k', w: 6, h: 4, contents: ['kitchen', 'lockers'], description: 'A kitchenette and lockers. Better morale for the whole team.' },
  manager: { name: 'Manager office', icon: '👔', zone: 'm', w: 5, h: 5, contents: ['officedesk', 'computer', 'plant'], description: 'A private office with a desk for a manager.' },
  parts: { name: 'Parts store', icon: '🗃️', zone: 'p', w: 6, h: 4, contents: ['partsshelf', 'tyrerack'], description: 'Shelving for parts and tyres. The workshop gets faster and cheaper.' },
  service: { name: 'Service reception', icon: '🧾', zone: 'v', w: 6, h: 4, contents: ['servicedesk', 'coffee'], description: 'Where work is booked in. More service capacity, happier customers.' },
};

function roomCost(lot: Lot, plan: RoomPlan): number {
  const per = ZONE_BY_CODE[plan.zone].costPerTile + (ZONE_BY_CODE[plan.zone].indoor ? styleCostPerTile(lot) : 0);
  const objects = plan.contents.reduce((s, id) => s + (OBJ_BY_ID[id]?.cost ?? 0), 0) + (ZONE_BY_CODE[plan.zone].indoor ? OBJ_BY_ID.door.cost : 0);
  return Math.round(per * plan.w * plan.h + objects);
}

export function quickRoomCost(loc: Location, id: string): number {
  const plan = QUICK_ROOMS[id];
  return plan ? roomCost(loc.lot, plan) : 0;
}

/** Builds a whole room on free land: zone, door towards the lot, and its contents. */
export function buildQuickRoom(state: GameState, loc: Location, id: string): { ok: boolean; message: string } {
  const plan = QUICK_ROOMS[id];
  if (!plan) return { ok: false, message: 'Unknown room.' };
  const lot = loc.lot;
  const cost = roomCost(lot, plan);
  if (state.cash < cost) return { ok: false, message: `The ${plan.name.toLowerCase()} costs about €${cost.toLocaleString('en-GB')}.` };
  if (lot.objects.length === 0 && !lotStats(lot).entrance) return { ok: false, message: 'Place an entrance first.' };
  const indoor = ZONE_BY_CODE[plan.zone].indoor;
  const before = lotStats(lot);
  // Decorative outdoor pieces (trees, flags, planters, benches, banners) are cleared out of the way.
  const clearable = new Set(['tree', 'planter', 'flag', 'bench', 'banner']);
  const occAll = occupancy(lot);
  const occ = occupancy({ ...lot, objects: lot.objects.filter((o) => !clearable.has(o.defId)) });
  // Bare land and lawns first; empty paving only if nothing else fits.
  for (const land of [['.', 'g'], ['.', 'g', 'a']]) {
    for (const [w, h] of [[plan.w, plan.h], [plan.h, plan.w]]) {
      for (let y = 0; y + h <= lot.h - 2; y += 1) {
        for (let x = 0; x + w <= lot.w; x += 1) {
          let free = true;
          for (let ty = y; ty < y + h && free; ty += 1) {
            for (let tx = x; tx < x + w && free; tx += 1) {
              const z = zoneAt(lot, tx, ty);
              if (!land.includes(z) || occ.any[ty * lot.w + tx]) free = false;
            }
          }
          if (!free) continue;
          const cleared = lot.objects.filter((o) => {
            if (!clearable.has(o.defId)) return false;
            const f = footprint(o);
            return f.x < x + w && f.x + f.w > x && f.y < y + h && f.y + f.h > y;
          });
          const base: Lot = { ...lot, objects: lot.objects.filter((o) => !cleared.includes(o)) };
          const baseOcc = cleared.length ? occupancy(base) : occAll;
          // The room needs a way in: a walkable outdoor tile next to its edge.
          const doorAt = findDoorSpot(base, baseOcc, x, y, w, h);
          if (!doorAt && indoor) continue;
          const trial: Lot = JSON.parse(JSON.stringify(base));
          setZones(trial, x, y, x + w - 1, y + h - 1, plan.zone);
          const objs: LotObject[] = [];
          if (indoor && doorAt) objs.push({ id: newId(null, 'q'), defId: 'door', x: doorAt.x, y: doorAt.y, rot: doorAt.rot });
          trial.objects.push(...objs);
          trial.version = -Math.random();
          const probe: Location = { ...loc, lot: trial };
          let placedAll = true;
          for (const defId of plan.contents) {
            const spot = findSpotIn(state, probe, defId, x, y, w, h);
            if (!spot) { placedAll = false; break; }
            const o = { id: newId(null, 'q'), defId, x: spot.x, y: spot.y, rot: spot.rot };
            trial.objects.push(o);
            objs.push(o);
            trial.version = -Math.random();
          }
          const after = lotStats(trial);
          cache.delete(trial);
          const facing = objs.filter((o) => { const k = OBJ_BY_ID[o.defId]?.slot; return k === 'display' || k === 'parking'; });
          if (!placedAll || after.reachable.size < before.reachable.size || (before.entrance && !after.entrance) || facing.some((o) => !after.reachable.has(o.id))) continue;
          // Public rooms must be reachable for customers through their door.
          if (ZONE_BY_CODE[plan.zone].customers && indoor && doorAt && after.dist[(doorAt.y) * trial.w + doorAt.x] < 0) continue;
          // Commit.
          lot.objects = lot.objects.filter((o) => !cleared.includes(o));
          setZones(lot, x, y, x + w - 1, y + h - 1, plan.zone);
          for (const o of objs) lot.objects.push({ ...o, id: newId(state, 'o') });
          bumpLot(lot);
          spend(state, loc, cost, `Built: ${plan.name}`);
          assignStations(state, loc);
          assignSlots(state, loc);
          loc.rentMonthly = rentFor(loc);
          return { ok: true, message: `${plan.name} built for €${cost.toLocaleString('en-GB')}.` };
        }
      }
    }
  }
  return { ok: false, message: `No free land big enough for a ${plan.name.toLowerCase()} (${plan.w}×${plan.h} m). Buy land or clear space.` };
}

export function findDoorSpot(lot: Lot, occ: { any: (string | null)[] }, x: number, y: number, w: number, h: number): { x: number; y: number; rot: 0 | 1 } | undefined {
  const outsideOk = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= lot.w || ty >= lot.h) return false;
    const z = zoneAt(lot, tx, ty);
    return (z === 'a' || z === 'g' || z === '.') && !occ.any[ty * lot.w + tx];
  };
  // Bottom edge first (towards the road), then the sides, then the top.
  for (let tx = x + 1; tx + 1 < x + w; tx += 1) if (outsideOk(tx, y + h) && outsideOk(tx + 1, y + h) && zoneAt(lot, tx, y + h) === 'a') return { x: tx, y: y + h - 1, rot: 0 };
  for (let ty = y + 1; ty + 1 < y + h; ty += 1) {
    if (outsideOk(x - 1, ty) && outsideOk(x - 1, ty + 1) && zoneAt(lot, x - 1, ty) === 'a') return { x, y: ty, rot: 1 };
    if (outsideOk(x + w, ty) && outsideOk(x + w, ty + 1) && zoneAt(lot, x + w, ty) === 'a') return { x: x + w - 1, y: ty, rot: 1 };
  }
  for (let tx = x + 1; tx + 1 < x + w; tx += 1) if (outsideOk(tx, y + h) && outsideOk(tx + 1, y + h)) return { x: tx, y: y + h - 1, rot: 0 };
  for (let ty = y + 1; ty + 1 < y + h; ty += 1) {
    if (outsideOk(x - 1, ty) && outsideOk(x - 1, ty + 1)) return { x, y: ty, rot: 1 };
    if (outsideOk(x + w, ty) && outsideOk(x + w, ty + 1)) return { x: x + w - 1, y: ty, rot: 1 };
  }
  for (let tx = x + 1; tx + 1 < x + w; tx += 1) if (outsideOk(tx, y - 1) && outsideOk(tx + 1, y - 1)) return { x: tx, y, rot: 0 };
  return undefined;
}

/** A valid spot inside a rectangle, keeping one free tile in front of the door. */
function findSpotIn(state: GameState, loc: Location, defId: string, x0: number, y0: number, w: number, h: number): { x: number; y: number; rot: 0 | 1 } | undefined {
  const def = OBJ_BY_ID[defId];
  const lot = loc.lot;
  const doors = lot.objects.filter((o) => o.defId === 'door').map(footprint);
  // Keep the tiles either side of each door clear so people can walk through.
  const nearDoor = (x: number, y: number, fw: number, fh: number): boolean => doors.some((d) => {
    const r = d.w >= d.h ? { x: d.x, y: d.y - 1, w: d.w, h: d.h + 2 } : { x: d.x - 1, y: d.y, w: d.w + 2, h: d.h };
    return x < r.x + r.w && x + fw > r.x && y < r.y + r.h && y + fh > r.y;
  });
  for (const rot of [0, 1] as const) {
    const fw = rot ? def.h : def.w;
    const fh = rot ? def.w : def.h;
    // Leave a one-tile walkway along the room's edges.
    for (let y = y0 + 1; y + fh <= y0 + h - 1; y += 1) {
      for (let x = x0 + 1; x + fw <= x0 + w - 1; x += 1) {
        if (nearDoor(x, y, fw, fh)) continue;
        if (canPlace(state, loc, defId, x, y, rot, undefined, true).ok) return { x, y, rot };
      }
    }
  }
  return undefined;
}
