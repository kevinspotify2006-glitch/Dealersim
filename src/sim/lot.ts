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
import type { Employee, GameState, Location, Lot, LotObject, Role, Vehicle, ZoneCode } from './types';
import { FLOOR_STYLES, LAND_TIERS, LIGHT_STYLES, OBJ_BY_ID, WALL_STYLES, ZONE_BY_CODE } from '../data/lot';
import type { ObjDef, SlotKind } from '../data/lot';
import { CITY_BY_ID, PREP_BY_ID } from '../data/game';
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

function setZones(lot: Lot, x0: number, y0: number, x1: number, y1: number, code: ZoneCode): void {
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
function newId(state: GameState | null, prefix: string): string {
  if (state) {
    state.idCounter += 1;
    return `${prefix}${state.idCounter.toString(36)}`;
  }
  idc += 1;
  return `${prefix}t${idc.toString(36)}`;
}

// --------------------------------------------------------------- stats --

export interface LotIssue { level: 'bad' | 'warn'; text: string; x?: number; y?: number }

export interface LotStats {
  slots: Record<SlotKind, LotObject[]>;
  capacity: number;
  visibleSpaces: number;
  stations: Record<string, LotObject[]>;
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
}

const cache = new Map<Lot, { version: number; stats: LotStats }>();

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

export function lotStats(lot: Lot): LotStats {
  const hit = cache.get(lot);
  if (hit && hit.version === lot.version) return hit.stats;
  const slots: Record<SlotKind, LotObject[]> = { parking: [], display: [], storage: [], lift: [], bay: [] };
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
  const showroomDecor = { n: 0 };
  let entrance: { x: number; y: number } | undefined;
  for (const o of lot.objects) {
    const def = OBJ_BY_ID[o.defId];
    if (!def) continue;
    upkeep += def.upkeep;
    power += def.power;
    if (def.slot) slots[def.slot].push(o);
    if (def.station) {
      const key = def.station.includes('sales') ? 'sales' : def.station.includes('mechanic') ? 'mechanic' : def.station.includes('detailer') ? 'detailer' : 'office';
      stations[key].push(o);
    }
    for (const [k, v] of Object.entries(def.effects ?? {})) effects[k] = (effects[k] ?? 0) + (v as number);
    if (def.effects?.decor && zoneAt(lot, o.x, o.y) === 's') showroomDecor.n += def.effects.decor;
    if (def.id === 'gate' && !entrance) {
      const f = footprint(o);
      entrance = { x: f.x + Math.floor(f.w / 2), y: f.y + f.h - 1 };
    }
  }
  const floorTier = FLOOR_STYLES.find((s) => s.id === lot.style.floor)?.tier ?? 0;
  const wallTier = WALL_STYLES.find((s) => s.id === lot.style.walls)?.tier ?? 0;
  const lightTier = LIGHT_STYLES.find((s) => s.id === lot.style.lighting)?.tier ?? 0;
  const windows = lot.objects.filter((o) => o.defId === 'window' && zoneAt(lot, o.x, o.y) === 's').length;

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
    if (o.defId !== 'door' && o.defId !== 'gate') continue;
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
  for (const o of [...slots.parking, ...slots.display]) {
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
  const flow = entrance ? Math.max(0, Math.min(1, reachRatio * 0.55 + crowd * 0.25 + distScore * 0.1 + ((effects.reception ?? 0) > 0 ? 0.1 : 0))) : 0;

  const issues: LotIssue[] = [];
  if (!entrance) issues.push({ level: 'bad', text: 'No entrance — customers cannot get in. Place an Entrance on the road edge.' });
  if (visible === 0) issues.push({ level: 'bad', text: 'No parking spaces or displays — there is nowhere to show cars.' });
  const unreachable = [...slots.parking, ...slots.display].filter((o) => !reachable.has(o.id));
  for (const o of unreachable.slice(0, 6)) issues.push({ level: 'warn', text: 'Customers cannot walk to this space.', x: o.x, y: o.y });
  if (unreachable.length > 6) issues.push({ level: 'warn', text: `${unreachable.length} spaces cannot be reached by customers.` });
  if (stations.sales.length === 0) issues.push({ level: 'warn', text: 'No sales desk — salespeople have nowhere to work.' });
  if (crowd < 0.25 && visible > 3) issues.push({ level: 'warn', text: 'The lot is crowded: customers struggle to get around.' });
  const cap = slots.parking.length + slots.display.length + slots.storage.length;
  const stats: LotStats = {
    slots, capacity: cap, visibleSpaces: visible, stations, levels, effects, reachable, flow, issues,
    indoorTiles, tiles, upkeep, power, entrance, dist,
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
  if ((def.minLevel ?? 1) > state.companyLevel) return { ok: false, reason: `Unlocks at company level ${def.minLevel}.`, cost };
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
      if (other && other !== ignoreId) return { ok: false, reason: 'Something is already there.', cost };
    }
  }
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
  const o: LotObject = { id: newId(state, 'o'), defId, x, y, rot };
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
  loc.lot.objects = loc.lot.objects.filter((ob) => ob.id !== objId);
  for (const e of state.employees) if (e.stationId === objId) e.stationId = undefined;
  bumpLot(loc.lot);
  const refund = Math.round((def?.cost ?? 0) * 0.5);
  if (refund) refundTo(state, loc, refund, `Sold: ${def?.name}`);
  assignStations(state, loc);
  return { ok: true, message: `${def?.name ?? 'Object'} removed (+€${refund.toLocaleString('en-GB')}).` };
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

export function styleChangeCost(lot: Lot, kind: 'floor' | 'walls' | 'lighting', id: string): number {
  const list = kind === 'floor' ? FLOOR_STYLES : kind === 'walls' ? WALL_STYLES : LIGHT_STYLES;
  const opt = list.find((s) => s.id === id);
  if (!opt) return 0;
  const tiles = lotStats(lot).indoorTiles;
  return Math.round(opt.costPerTile * tiles * (kind === 'walls' ? 0.6 : 1) + 300);
}

export function setStyle(state: GameState, loc: Location, kind: 'floor' | 'walls' | 'lighting', id: string): { ok: boolean; message: string } {
  const list = kind === 'floor' ? FLOOR_STYLES : kind === 'walls' ? WALL_STYLES : LIGHT_STYLES;
  const opt = list.find((s) => s.id === id);
  if (!opt) return { ok: false, message: 'Unknown style.' };
  if ((opt.minLevel ?? 1) > state.companyLevel) return { ok: false, message: `Unlocks at company level ${opt.minLevel}.` };
  if (loc.lot.style[kind] === id) return { ok: false, message: 'Already chosen.' };
  const cost = styleChangeCost(loc.lot, kind, id);
  if (state.cash < cost) return { ok: false, message: `Refitting costs €${cost.toLocaleString('en-GB')}.` };
  loc.lot.style[kind] = id;
  bumpLot(loc.lot);
  spend(state, loc, cost, `Refit: ${opt.name}`);
  return { ok: true, message: `${opt.name} fitted.` };
}

export function nextLandTier(state: GameState, loc: Location) {
  return LAND_TIERS[loc.lot.landTier + 1];
}

export function buyLand(state: GameState, loc: Location): { ok: boolean; message: string } {
  const next = nextLandTier(state, loc);
  if (!next) return { ok: false, message: 'You own the largest plot available here.' };
  if (state.companyLevel < next.minLevel) return { ok: false, message: `The neighbours will only sell to a level ${next.minLevel} company.` };
  const city = CITY_BY_ID[loc.cityId];
  const cost = Math.round(next.cost * (city?.rent ?? 1500) / 1500);
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
  spend(state, loc, cost, `Bought land: now ${next.w}×${next.h} m`);
  return { ok: true, message: `Your plot is now ${next.w} × ${next.h} m. Rent is now €${loc.rentMonthly.toLocaleString('en-GB')}/month.` };
}

export function rentFor(loc: Location, w = loc.lot.w, h = loc.lot.h): number {
  const city = CITY_BY_ID[loc.cityId];
  const area = w * h;
  const indoor = lotStats(loc.lot).indoorTiles;
  return Math.round(((city?.rent ?? 1500) * Math.pow(area / 600, 0.75) * (loc.rentFactor ?? 1) + indoor * 1.5) / 10) * 10;
}

function spend(state: GameState, loc: Location, amount: number, text: string): void {
  if (amount <= 0) return;
  record(state, 'Construction', -amount, text, loc.id);
}

function refundTo(state: GameState, loc: Location, amount: number, text: string): void {
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
  const k = slotKindOf(loc, slotId);
  return k === 'parking' || k === 'display';
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
  if (v.status === 'listed' && def.slot === 'storage') {
    v.status = 'yard';
    v.listedOnline = false;
  }
  v.slotId = slotId;
  return { ok: true, message: other ? 'Swapped places.' : 'Moved.' };
}

// ------------------------------------------------------------ staff --

function stationKey(role: Role): string {
  return role === 'sales' ? 'sales' : role === 'mechanic' ? 'mechanic' : role === 'detailer' ? 'detailer' : 'office';
}

export function freeStation(state: GameState, loc: Location, role: Role, except?: string): LotObject | undefined {
  const stats = lotStats(loc.lot);
  const used = new Set(state.employees.filter((e) => e.locationId === loc.id && e.id !== except).map((e) => e.stationId));
  return stats.stations[stationKey(role)].find((o) => !used.has(o.id));
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
  return role === 'sales' ? 'a sales desk' : role === 'mechanic' ? 'a workshop lift' : role === 'detailer' ? 'a detailing bay' : 'an office desk';
}

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

function findDoorSpot(lot: Lot, occ: { any: (string | null)[] }, x: number, y: number, w: number, h: number): { x: number; y: number; rot: 0 | 1 } | undefined {
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
