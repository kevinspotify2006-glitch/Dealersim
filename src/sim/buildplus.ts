/**
 * Build-mode depth (v6): bulldozing with refunds and safety checks, area
 * demolition, upgrades, placeable room templates, "create room", dealership
 * styles, the identity that grows out of what you build, traffic flows and
 * the capacity numbers of the whole site.
 *
 * Everything works on the same lot data as sim/lot.ts and goes through the
 * same ledger, so undo/redo and the economy see it like any other build.
 */
import type { GameState, Location, Lot, LotObject, ZoneCode } from './types';
import { OBJ_BY_ID, ZONE_BY_CODE } from '../data/lot';
import type { ObjDef } from '../data/lot';
import { CRITICAL_IDS, DEALER_STYLES, MAX_OBJ_LEVEL, OBJ_UPGRADES, ROOM_TEMPLATE_BY_ID, STYLE_BY_ID } from '../data/buildplus';
import type { RoomTemplate, UpgradeStep } from '../data/buildplus';
import {
  assignSlots, assignStations, bumpLot, canPlace, findDoorSpot, footprint, isDoor, isIndoor, lotStats, newId, objectSpeed, occupancy,
  paintZone, placeObject, refundFor, removeObject, rentFor, roomsOf, setZones, spend, styleChangeCost, unlockReason, zoneAt, zoneCost,
} from './lot';
import type { Refund } from './lot';
import { visitorCapacity } from './customers';

// ------------------------------------------------------------ bulldoze --

export interface Critical { level: 'required' | 'warn'; text: string }

/** Why removing this might hurt: the only entrance, someone's workstation, a car on the lift… */
export function criticalOf(state: GameState, loc: Location, o: LotObject, alsoGone: Set<string> = new Set()): Critical[] {
  const def = OBJ_BY_ID[o.defId];
  if (!def) return [];
  const out: Critical[] = [];
  const others = loc.lot.objects.filter((x) => x.id !== o.id && !alsoGone.has(x.id));
  const sameKind = (ids: string[]): number => others.filter((x) => ids.includes(x.defId)).length;
  if ((def.id === 'gate' || def.id === 'grandgate') && sameKind(['gate', 'grandgate']) === 0) out.push({ level: 'required', text: 'This facility is required: it is your only entrance — customers cannot get in without it.' });
  if (def.station?.includes('reception') && sameKind(['receptiondesk', 'welcomecounter', 'receptionpod', 'luxreception', 'infodesk']) === 0) out.push({ level: 'warn', text: 'Removing this facility may disable part of your dealership: it is your only reception.' });
  if (def.station?.includes('sales') && def.id !== 'financedesk' && sameKind(['salesdesk', 'premiumdesk']) === 0) out.push({ level: 'required', text: 'This facility is required: without a sales desk your salespeople cannot work.' });
  if (def.slot === 'lift' && sameKind(['lift', 'inspectionlane']) === 0 && state.serviceJobs.some((j) => j.locationId === loc.id && j.status !== 'done')) out.push({ level: 'warn', text: 'Removing this facility may disable part of your dealership: it is your only lift and service jobs are booked.' });
  if (def.slot === 'lift' || def.slot === 'bay') {
    const busy = state.vehicles.some((v) => v.slotId === o.id && v.status === 'prep') || state.serviceJobs.some((j) => j.liftId === o.id && j.status !== 'done');
    if (busy) out.push({ level: 'warn', text: 'A car is being worked on here — the job waits for another bay.' });
  }
  if (def.id === 'servicedesk' && sameKind(['servicedesk']) === 0 && state.serviceJobs.some((j) => j.locationId === loc.id && j.status !== 'done')) out.push({ level: 'warn', text: 'Removing this facility may disable part of your dealership: service customers have nowhere to check in.' });
  const worker = state.employees.find((e) => e.stationId === o.id);
  if (worker) out.push({ level: 'warn', text: `${worker.name} works here and will look for another desk.` });
  const car = state.vehicles.find((v) => v.slotId === o.id && v.status !== 'sold');
  if (car && (def.slot === 'parking' || def.slot === 'display' || def.slot === 'storage')) out.push({ level: 'warn', text: `${car.brand} ${car.model} stands here and will be moved to another space.` });
  if (isDoor(o.defId)) {
    // The only door of a room people must use.
    const room = roomsOf(loc.lot).find((r) => r.indoor && r.objects.includes(o.id));
    if (room && room.doors <= 1 && others.every((x) => !isDoor(x.defId) || !room.objects.includes(x.id))) out.push({ level: 'warn', text: `It is the only door of the ${ZONE_BY_CODE[room.code].name.toLowerCase()} — nobody will be able to get in.` });
  }
  void CRITICAL_IDS;
  return out;
}

/** Everything standing (at least partly) inside a rectangle of tiles. */
export function objectsInRect(lot: Lot, x0: number, y0: number, x1: number, y1: number): LotObject[] {
  const ax = Math.min(x0, x1); const bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1); const by = Math.max(y0, y1);
  return lot.objects.filter((o) => {
    const def = OBJ_BY_ID[o.defId];
    if (!def || def.hidden) return false;
    const f = footprint(o);
    return f.x <= bx && f.x + f.w - 1 >= ax && f.y <= by && f.y + f.h - 1 >= ay;
  });
}

export interface BulldozePlan {
  items: { o: LotObject; def: ObjDef; refund: Refund }[];
  build: number;
  upgrades: number;
  refund: number;
  net: number;
  warnings: Critical[];
  required: boolean;
}

export function bulldozePlan(state: GameState, loc: Location, ids: string[]): BulldozePlan {
  const set = new Set(ids);
  const items = loc.lot.objects.filter((o) => set.has(o.id) && OBJ_BY_ID[o.defId] && !OBJ_BY_ID[o.defId].hidden).map((o) => ({ o, def: OBJ_BY_ID[o.defId], refund: refundFor(state, o) }));
  const warnings: Critical[] = [];
  const seen = new Set<string>();
  for (const it of items) for (const c of criticalOf(state, loc, it.o, set)) if (!seen.has(c.text)) { seen.add(c.text); warnings.push(c); }
  const build = items.reduce((s, i) => s + i.refund.build, 0);
  const upgrades = items.reduce((s, i) => s + i.refund.upgrades, 0);
  const refund = items.reduce((s, i) => s + i.refund.refund, 0);
  return { items, build, upgrades, refund, net: build + upgrades - refund, warnings, required: warnings.some((w) => w.level === 'required') };
}

/**
 * Bulldozes objects (one or a whole area). Cars on removed spaces move to
 * other spaces; anything that cannot be emptied is kept. Optionally clears
 * the floor under the area back to bare land.
 */
export function bulldoze(state: GameState, loc: Location, ids: string[], clearFloor?: { x0: number; y0: number; x1: number; y1: number }): { ok: boolean; message: string; count: number; refund: number } {
  const plan = bulldozePlan(state, loc, ids);
  if (!plan.items.length && !clearFloor) return { ok: false, message: 'Nothing to bulldoze here.', count: 0, refund: 0 };
  const before = state.cash;
  // Fixtures first, vehicle spaces last (so their cars have somewhere to go).
  const order = [...plan.items].sort((a, b) => (a.def.slot ? 1 : 0) - (b.def.slot ? 1 : 0));
  let count = 0;
  const kept: string[] = [];
  for (const it of order) {
    const r = removeObject(state, loc, it.o.id);
    if (r.ok) count += 1; else kept.push(it.def.name);
  }
  let cleared = false;
  if (clearFloor) {
    const r = paintZone(state, loc, clearFloor.x0, clearFloor.y0, clearFloor.x1, clearFloor.y1, '.');
    cleared = r.ok;
  }
  assignSlots(state, loc);
  assignStations(state, loc);
  loc.rentMonthly = rentFor(loc);
  const refund = Math.round(state.cash - before);
  if (!count && !cleared) return { ok: false, message: kept.length ? `Could not bulldoze: cars on ${kept[0].toLowerCase()} have nowhere to go.` : 'Nothing was bulldozed.', count: 0, refund: 0 };
  const note = kept.length ? ` Kept ${kept.length} (cars have nowhere to go).` : '';
  return { ok: true, count, refund, message: `💥 Bulldozed ${count} object${count === 1 ? '' : 's'}${cleared ? ' and cleared the floor' : ''} · +€${Math.max(0, refund).toLocaleString('en-GB')} back.${note}` };
}

// ------------------------------------------------------------ upgrades --

export function upgradeInfo(o: LotObject): { level: number; max: number; next?: UpgradeStep; steps?: [UpgradeStep, UpgradeStep] } {
  const steps = OBJ_UPGRADES[o.defId];
  const level = Math.max(1, Math.min(MAX_OBJ_LEVEL, o.level ?? 1));
  return { level, max: steps ? MAX_OBJ_LEVEL : 1, next: steps && level < MAX_OBJ_LEVEL ? steps[level - 1] : undefined, steps };
}

export function upgradeObject(state: GameState, loc: Location, objId: string): { ok: boolean; message: string } {
  const o = loc.lot.objects.find((x) => x.id === objId);
  if (!o) return { ok: false, message: 'Nothing selected.' };
  const def = OBJ_BY_ID[o.defId];
  const info = upgradeInfo(o);
  if (!info.next) return { ok: false, message: info.steps ? `${def.name} is fully upgraded.` : `${def.name} cannot be upgraded.` };
  if (info.level + 1 >= 3 && state.companyLevel < 2) return { ok: false, message: 'Level 3 upgrades unlock at company level 2.' };
  if (state.cash < info.next.cost) return { ok: false, message: `The upgrade costs €${info.next.cost.toLocaleString('en-GB')}.` };
  o.level = info.level + 1;
  o.upgradeSpent = (o.upgradeSpent ?? 0) + info.next.cost;
  bumpLot(loc.lot);
  spend(state, loc, info.next.cost, `Upgrade: ${def.name} → ${info.next.name}`);
  return { ok: true, message: `⬆️ ${def.name} upgraded to level ${o.level}: ${info.next.name}.` };
}

// ------------------------------------------------------ room templates --

export interface StampPlan {
  w: number;
  h: number;
  zones: [number, number, number, number, ZoneCode][];
  objects: [string, number, number, 0 | 1][];
}

/** A room template turned 0° or 90° (clockwise). */
export function templatePlan(t: RoomTemplate, rot: 0 | 1): StampPlan {
  const zones: StampPlan['zones'] = [[0, 0, t.w - 1, t.h - 1, t.zone], ...(t.zones ?? [])];
  if (!rot) return { w: t.w, h: t.h, zones, objects: t.objects };
  const H = t.h;
  return {
    w: t.h,
    h: t.w,
    zones: zones.map(([x0, y0, x1, y1, c]) => [H - 1 - y1, x0, H - 1 - y0, x1, c] as [number, number, number, number, ZoneCode]),
    objects: t.objects.map(([id, x, y, r]) => {
      const def = OBJ_BY_ID[id];
      const fh = def ? (r ? def.w : def.h) : 1;
      return [id, H - y - fh, x, (r ? 0 : 1) as 0 | 1];
    }),
  };
}

export interface StampCheck { ok: boolean; reason?: string; cost: number; skipped: string[]; placed: number; plan: StampPlan }

const OPEN_LAND = new Set(['.', 'g', 'a', 'x', 'j']);

/** Can a room template go here? Only on open land with nothing standing on it. */
export function stampCheck(state: GameState, loc: Location, templateId: string, x: number, y: number, rot: 0 | 1): StampCheck {
  const t = ROOM_TEMPLATE_BY_ID[templateId];
  const plan = t ? templatePlan(t, rot) : { w: 1, h: 1, zones: [], objects: [] };
  const fail = (reason: string): StampCheck => ({ ok: false, reason, cost: 0, skipped: [], placed: 0, plan });
  if (!t) return fail('Unknown template.');
  if (t.minLevel > state.companyLevel) return fail(`Unlocks at company level ${t.minLevel}.`);
  const lot = loc.lot;
  if (x < 0 || y < 0 || x + plan.w > lot.w || y + plan.h > lot.h) return fail('Outside your land — buy more land or move it.');
  const occ = occupancy(lot);
  for (let ty = y; ty < y + plan.h; ty += 1) {
    for (let tx = x; tx < x + plan.w; tx += 1) {
      if (!OPEN_LAND.has(zoneAt(lot, tx, ty))) return fail(`It overlaps your ${ZONE_BY_CODE[zoneAt(lot, tx, ty)].name.toLowerCase()} — pick open land.`);
      const other = occ.any[ty * lot.w + tx];
      if (other) {
        const what = lot.objects.find((o) => o.id === other);
        return fail(`The ${OBJ_BY_ID[what?.defId ?? '']?.name.toLowerCase() ?? 'object'} is in the way.`);
      }
    }
  }
  // Try it on a copy of the lot.
  const trial: Lot = JSON.parse(JSON.stringify(lot));
  trial.version = -Math.random();
  let cost = 0;
  for (const [x0, y0, x1, y1, code] of plan.zones) {
    cost += zoneCost(trial, x + x0, y + y0, x + x1, y + y1, code);
    setZones(trial, x + x0, y + y0, x + x1, y + y1, code);
  }
  const probe: Location = { ...loc, lot: trial };
  const skipped: string[] = [];
  let placed = 0;
  for (const [id, ox, oy, r] of plan.objects) {
    const def = OBJ_BY_ID[id];
    if (!def) continue;
    const locked = unlockReason(state, def, loc);
    if (locked) { skipped.push(def.name); continue; }
    if (!canPlace(state, probe, id, x + ox, y + oy, r, undefined, true).ok) { skipped.push(def.name); continue; }
    trial.objects.push({ id: `__t${placed}`, defId: id, x: x + ox, y: y + oy, rot: r });
    trial.version = -Math.random();
    cost += def.cost;
    placed += 1;
  }
  const before = lotStats(lot);
  const after = lotStats(trial);
  if (after.reachable.size < before.reachable.size) return { ok: false, reason: 'It would cut customers off from some of your cars.', cost, skipped, placed, plan };
  if (before.entrance && !after.entrance) return { ok: false, reason: 'It would block the entrance.', cost, skipped, placed, plan };
  if (state.cash < cost) return { ok: false, reason: `Not enough cash (€${cost.toLocaleString('en-GB')}).`, cost, skipped, placed, plan };
  return { ok: true, cost, skipped, placed, plan };
}

/** Places a room template: floor, walls (automatic), door and furniture. */
export function stampTemplate(state: GameState, loc: Location, templateId: string, x: number, y: number, rot: 0 | 1): { ok: boolean; message: string } {
  const check = stampCheck(state, loc, templateId, x, y, rot);
  if (!check.ok) return { ok: false, message: check.reason ?? 'It does not fit here.' };
  const t = ROOM_TEMPLATE_BY_ID[templateId];
  const lot = loc.lot;
  for (const [x0, y0, x1, y1, code] of check.plan.zones) setZones(lot, x + x0, y + y0, x + x1, y + y1, code);
  bumpLot(lot);
  for (const [id, ox, oy, r] of check.plan.objects) {
    const def = OBJ_BY_ID[id];
    if (!def || unlockReason(state, def, loc)) continue;
    if (!canPlace(state, loc, id, x + ox, y + oy, r, undefined, true).ok) continue;
    lot.objects.push({ id: newId(state, 'o'), defId: id, x: x + ox, y: y + oy, rot: r, built: state.day });
    bumpLot(lot);
  }
  spend(state, loc, check.cost, `Built: ${t.name}`);
  assignStations(state, loc);
  assignSlots(state, loc);
  loc.rentMonthly = rentFor(loc);
  return { ok: true, message: `${t.icon} ${t.name} built for €${check.cost.toLocaleString('en-GB')}${check.skipped.length ? ` (${check.skipped.length} item${check.skipped.length > 1 ? 's' : ''} not unlocked yet)` : ''}. Adjust it as you like.` };
}

// ----------------------------------------------------------- create room --

/** Which room fits the furniture already standing in a rectangle. */
export function suggestRoom(lot: Lot, x0: number, y0: number, x1: number, y1: number): ZoneCode | undefined {
  const inside = objectsInRect(lot, x0, y0, x1, y1).map((o) => OBJ_BY_ID[o.defId]).filter((d) => d && !d.hidden && !d.walkable);
  if (!inside.length) return undefined;
  const counts = new Map<ZoneCode, number>();
  for (const d of inside) for (const z of d.zones) if (isIndoor(z)) counts.set(z, (counts.get(z) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best?.[0];
}

/** Paints a room and gives it a door towards the lot if it has none. */
export function createRoom(state: GameState, loc: Location, x0: number, y0: number, x1: number, y1: number, code: ZoneCode): { ok: boolean; message: string } {
  const ax = Math.min(x0, x1); const bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1); const by = Math.max(y0, y1);
  if ((bx - ax + 1) * (by - ay + 1) < 4) return { ok: false, message: 'A room needs at least 2 × 2 m.' };
  const r = paintZone(state, loc, ax, ay, bx, by, code);
  if (!r.ok) return r;
  let door = '';
  if (isIndoor(code)) {
    const room = roomsOf(loc.lot).find((rm) => rm.code === code && rm.x0 <= ax && rm.x1 >= bx && rm.y0 <= ay && rm.y1 >= by);
    if (room && room.doors === 0) {
      const spot = findDoorSpot(loc.lot, occupancy(loc.lot), ax, ay, bx - ax + 1, by - ay + 1);
      if (spot && canPlace(state, loc, 'door', spot.x, spot.y, spot.rot).ok) {
        const d = placeObject(state, loc, 'door', spot.x, spot.y, spot.rot);
        if (d.ok) door = ' A door was added.';
      } else door = ' Add a door so people can get in.';
    }
  }
  loc.rentMonthly = rentFor(loc);
  return { ok: true, message: `${ZONE_BY_CODE[code].icon} ${ZONE_BY_CODE[code].name} created (${bx - ax + 1}×${by - ay + 1} m).${door}` };
}

// ---------------------------------------------------------------- styles --

export function styleCost(loc: Location, styleId: string): number {
  const st = STYLE_BY_ID[styleId];
  if (!st) return 0;
  const lot = loc.lot;
  let cost = 400;
  if (lot.style.floor !== st.floor || lot.roomStyles) cost += styleChangeCost(lot, 'floor', st.floor, 'all');
  if (lot.style.walls !== st.walls || lot.roomStyles) cost += styleChangeCost(lot, 'walls', st.walls, 'all');
  if (lot.style.lighting !== st.lighting || lot.roomStyles) cost += styleChangeCost(lot, 'lighting', st.lighting, 'all');
  return Math.round(cost);
}

/** Refits the whole dealership in one style. The style also shapes who comes in. */
export function applyDealerStyle(state: GameState, loc: Location, styleId: string): { ok: boolean; message: string } {
  const st = STYLE_BY_ID[styleId];
  if (!st) return { ok: false, message: 'Unknown style.' };
  if (st.minLevel > state.companyLevel) return { ok: false, message: `The ${st.name} style unlocks at company level ${st.minLevel}.` };
  if (loc.lot.theme === styleId) return { ok: false, message: `${loc.name} already has the ${st.name} style.` };
  const cost = styleCost(loc, styleId);
  if (state.cash < cost) return { ok: false, message: `The refit costs €${cost.toLocaleString('en-GB')}.` };
  loc.lot.style = { floor: st.floor, walls: st.walls, lighting: st.lighting };
  loc.lot.roomStyles = undefined;
  loc.lot.theme = styleId;
  bumpLot(loc.lot);
  spend(state, loc, cost, `Refit: ${st.name} style`);
  return { ok: true, message: `${st.icon} ${loc.name} now has the ${st.name} style.` };
}

export { DEALER_STYLES };

/** A kept style slowly builds (or costs) local reputation. */
export function styleMonthly(state: GameState): void {
  for (const loc of state.locations) {
    const st = loc.lot.theme ? STYLE_BY_ID[loc.lot.theme] : undefined;
    if (st && st.rep) loc.reputation = Math.max(0, Math.min(100, loc.reputation + st.rep));
  }
}

// --------------------------------------------------------------- identity --

export interface Identity { id: string; name: string; icon: string; share: number; strategies: string[] }

const IDENTITIES: { id: string; name: string; icon: string; strategies: string[] }[] = [
  { id: 'retail', name: 'Retail-focused', icon: '🛍️', strategies: ['balanced', 'volume', 'budget'] },
  { id: 'service', name: 'Service-focused', icon: '🔧', strategies: ['balanced', 'family', 'used'] },
  { id: 'luxury', name: 'Luxury-focused', icon: '💎', strategies: ['luxury', 'premium', 'margin'] },
  { id: 'ev', name: 'EV-focused', icon: '⚡', strategies: ['ev'] },
  { id: 'used', name: 'Used-car specialist', icon: '🔁', strategies: ['used', 'budget', 'volume'] },
  { id: 'performance', name: 'Performance-focused', icon: '🏎️', strategies: ['performance', 'sports'] },
  { id: 'family', name: 'Family-focused', icon: '👨‍👩‍👧', strategies: ['family', 'suv'] },
];

/** What kind of dealership the building says you are (it grows out of what you build). */
export function dealershipIdentity(loc: Location): Identity[] {
  const lot = loc.lot;
  const ls = lotStats(lot);
  const count = (ids: string[]): number => lot.objects.filter((o) => ids.includes(o.defId)).length;
  const premiumItems = lot.objects.filter((o) => { const d = OBJ_BY_ID[o.defId]; return d && (d.category === 'premium' || (d.tags ?? []).some((t) => t === 'premium' || t === 'luxury' || t === 'vip')); }).length;
  const score: Record<string, number> = {
    retail: ls.slots.display.length * 3 + ls.slots.parking.length + (ls.levels.showroom ?? 0) * 2,
    service: ls.slots.lift.length * 4 + ls.slots.bay.length * 2 + count(['servicedesk', 'partsshelf', 'partscounter', 'repairstation', 'tyrestore']) * 1.5,
    luxury: premiumItems * 2 + count(['premiumdisplay', 'turntable']) * 3 + count(['luxplatform']) * 5,
    ev: Math.min(12, ls.effects.ev ?? 0) * 2,
    used: count(['usedrow', 'occasion', 'tradein', 'storage']) * 2,
    performance: count(['turntable', 'neon', 'platform']) * 2 + (lot.theme === 'sport' ? 6 : 0),
    family: count(['kids', 'loungeset', 'cornersofa', 'bistrotable']) * 3 + (ls.levels.lounge ?? 0) * 2,
  };
  const total = Object.values(score).reduce((a, b) => a + b, 0) || 1;
  return IDENTITIES.map((i) => ({ ...i, share: score[i.id] / total })).sort((a, b) => b.share - a.share);
}

/** Leads bonus when the chosen specialisation matches what you have built. */
export function focusMatch(loc: Location): { match: boolean; mult: number; identity?: Identity } {
  const top = dealershipIdentity(loc)[0];
  if (!top || top.share < 0.3) return { match: false, mult: 1, identity: top };
  const match = top.strategies.includes(loc.strategy ?? 'balanced');
  return { match, mult: match ? 1.06 : 1, identity: top };
}

// ------------------------------------------------------------------ flows --

export interface FlowStep { label: string; ok: boolean }
export interface Flow { id: 'customer' | 'vehicle' | 'service'; name: string; icon: string; steps: FlowStep[]; ok: boolean; hint?: string }

const flowCache = new WeakMap<Lot, { version: number; flows: Flow[] }>();
const DRIVABLE = new Set(['a', 'j', 't', 'x', '.']);

/**
 * Can customers, delivered cars and service cars get where they need to go?
 * Customers walk from the entrance; vehicles drive over paving, roads and
 * yards (through entrances and walkable objects, not through buildings).
 */
export function siteFlows(loc: Location): Flow[] {
  const lot = loc.lot;
  const hit = flowCache.get(lot);
  if (hit && hit.version === lot.version) return hit.flows;
  const ls = lotStats(lot);
  const occ = occupancy(lot);
  const byDef = (ids: string[]): LotObject[] => lot.objects.filter((o) => ids.includes(o.defId));
  const touches = (o: LotObject, test: (x: number, y: number) => boolean): boolean => {
    const f = footprint(o);
    for (let x = f.x - 1; x <= f.x + f.w; x += 1) for (let y = f.y - 1; y <= f.y + f.h; y += 1) {
      const edge = x === f.x - 1 || x === f.x + f.w || y === f.y - 1 || y === f.y + f.h;
      if (edge && x >= 0 && y >= 0 && x < lot.w && y < lot.h && test(x, y)) return true;
    }
    return false;
  };
  const walk = (x: number, y: number): boolean => ls.dist[y * lot.w + x] >= 0;
  // Vehicles: breadth-first over drivable ground from a road entrance.
  const drive = (starts: LotObject[]): Uint8Array => {
    const seen = new Uint8Array(lot.w * lot.h);
    const q: number[] = [];
    for (const s of starts) {
      const f = footprint(s);
      for (let x = f.x; x < f.x + f.w; x += 1) for (let y = f.y; y < f.y + f.h; y += 1) { const i = y * lot.w + x; if (!seen[i]) { seen[i] = 1; q.push(i); } }
    }
    for (let k = 0; k < q.length; k += 1) {
      const i = q[k];
      const x = i % lot.w;
      const y = Math.floor(i / lot.w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= lot.w || ny >= lot.h) continue;
        const ni = ny * lot.w + nx;
        if (seen[ni] || occ.solid[ni] || !DRIVABLE.has(lot.zones[ni])) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    return seen;
  };
  const gates = byDef(['gate', 'grandgate']);
  const serviceGates = byDef(['serviceentrance']);
  const deliveryGates = byDef(['deliveryentrance']);
  const doorsIn = (code: ZoneCode): LotObject[] => lot.objects.filter((o) => isDoor(o.defId) && zoneAt(lot, o.x, o.y) === code);
  const flows: Flow[] = [];
  // Customers.
  const hasShowroom = (ls.tiles.s ?? 0) >= 12;
  const salesDesks = [...(ls.stations.sales ?? [])];
  const cust: FlowStep[] = [
    { label: 'Entrance', ok: !!ls.entrance },
    { label: 'Parking', ok: (ls.effects.visitorParking ?? 0) > 0 || ls.visibleSpaces < 10 },
    { label: 'Cars on show', ok: ls.reachable.size > 0 },
  ];
  if (hasShowroom) cust.push({ label: 'Showroom', ok: doorsIn('s').some((d) => { const f = footprint(d); for (let x = f.x; x < f.x + f.w; x += 1) for (let y = f.y; y < f.y + f.h; y += 1) if (walk(x, y)) return true; return false; }) });
  cust.push({ label: 'Sales desk', ok: salesDesks.some((d) => touches(d, walk)) });
  cust.push({ label: 'Exit', ok: !!ls.entrance });
  flows.push({ id: 'customer', name: 'Customers', icon: '🚶', steps: cust, ok: cust.every((s) => s.ok), hint: 'Entrance → parking → showroom → sales → exit' });
  // Deliveries.
  const vReach = drive(deliveryGates.length ? deliveryGates : gates);
  const drivable = (x: number, y: number): boolean => vReach[y * lot.w + x] === 1;
  const storage = [...ls.slots.storage, ...ls.slots.parking];
  const veh: FlowStep[] = [
    { label: deliveryGates.length ? 'Delivery entrance' : 'Entrance', ok: (deliveryGates.length || gates.length) > 0 },
    { label: 'Unloading', ok: storage.some((o) => touches(o, drivable)) },
    { label: 'Parking', ok: ls.slots.parking.length === 0 || ls.slots.parking.some((o) => touches(o, drivable)) },
  ];
  if (hasShowroom) veh.push({ label: 'Showroom', ok: doorsIn('s').some((d) => touches(d, drivable)) || ls.slots.display.length === 0 });
  flows.push({ id: 'vehicle', name: 'Deliveries', icon: '🚚', steps: veh, ok: veh.every((s) => s.ok), hint: 'Delivery → parking → showroom' });
  // Service.
  if (ls.slots.lift.length || ls.stations.advisor?.length) {
    const sReach = drive(serviceGates.length ? serviceGates : gates);
    const sDrive = (x: number, y: number): boolean => sReach[y * lot.w + x] === 1;
    const workshopDoor = doorsIn('w').some((d) => touches(d, sDrive));
    const srv: FlowStep[] = [
      { label: serviceGates.length ? 'Service entrance' : 'Entrance', ok: (serviceGates.length || gates.length) > 0 },
      { label: 'Service desk', ok: (ls.stations.advisor ?? []).some((d) => touches(d, walk)) },
      { label: 'Workshop', ok: workshopDoor },
      { label: 'Inspection', ok: ls.slots.lift.length > 0 },
      { label: 'Ready', ok: storage.some((o) => touches(o, sDrive)) },
    ];
    flows.push({ id: 'service', name: 'Service', icon: '🔧', steps: srv, ok: srv.every((s) => s.ok), hint: 'Entrance → service desk → workshop → inspection → ready' });
  }
  flowCache.set(lot, { version: lot.version, flows });
  return flows;
}

/** Service moves faster with a clean route to the workshop, slower without. */
export function serviceFlowFactor(loc: Location): number {
  const f = siteFlows(loc).find((x) => x.id === 'service');
  if (!f) return 1;
  return f.ok ? 1.05 : f.steps.find((s) => s.label === 'Workshop')?.ok === false ? 0.92 : 1;
}

// ------------------------------------------------------------- capacity --

export interface SiteCapacity { showroom: number; parking: number; storage: number; customers: number; service: number; staff: number; ev: number; testdrive: number; vehicles: number }

export function siteCapacity(state: GameState, loc: Location): SiteCapacity {
  const ls = lotStats(loc.lot);
  const count = (ids: string[]): number => loc.lot.objects.filter((o) => ids.includes(o.defId)).length;
  const serviceHours = [...ls.slots.lift].reduce((s, o) => s + 8 * objectSpeed(o), 0);
  void state;
  return {
    showroom: ls.slots.display.length,
    parking: ls.slots.parking.length,
    storage: ls.slots.storage.length,
    vehicles: ls.capacity,
    customers: Math.round(visitorCapacity(loc)),
    service: Math.round(serviceHours),
    staff: ls.stationCount,
    ev: count(['charger', 'hpcharger', 'evparking', 'solarcarport', 'evdisplay', 'evdelivery']) + count(['multicharger']) * 4,
    testdrive: Math.round((ls.effects.testdrive ?? 0) * 10) / 10,
  };
}

/** Transport discount from delivery infrastructure. */
export function logisticsFactor(loc: Location | undefined): number {
  if (!loc) return 1;
  return 1 - Math.min(3, lotStats(loc.lot).effects.logistics ?? 0) * 0.08;
}
