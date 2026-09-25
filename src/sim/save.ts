/**
 * Save system (built on Business Manager's slot index + storage probe).
 *
 * Saves live in localStorage — in the browser and inside the Android WebView,
 * which persists it between launches. Every loaded save is validated and
 * back-filled with defaults so an older or damaged file never crashes the game.
 */
import type { Location, Lot } from './types';
import type { GameState, SaveSlotMeta } from './types';
import { DEFAULT_SETTINGS, PHYSICAL_UPGRADES, SAVE_VERSION } from './state';
import { UPGRADE_BY_ID } from '../data/game';
import { assignSlots, assignStations, buildTemplate, bumpLot, emptyLot, lotStats, occupancy, rentFor } from './lot';
import { companyValue } from './finance';
import { reseedGameRng } from './rng';
import { isRecord, num, str } from './util';
import { emptyLegacy } from './newgame';
import { initSystems } from './systems/init';

const INDEX_KEY = 'cdmt:saves';
const SLOT_PREFIX = 'cdmt:save:';
export const AUTOSAVE_ID = 'autosave';
export const MANUAL_SLOTS = ['slot1', 'slot2', 'slot3'];

function storage(): Storage | null {
  try {
    const probe = '__cdmt_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function storageAvailable(): boolean {
  return storage() !== null;
}

export function listSaves(): SaveSlotMeta[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecord)
      .map((e) => ({
        slot: str(e.slot, ''),
        companyName: str(e.companyName, 'Dealership'),
        day: num(e.day, 1),
        cash: num(e.cash, 0),
        companyValue: num(e.companyValue, 0),
        savedAt: num(e.savedAt, 0),
        level: num(e.level, 1),
      }))
      .filter((s) => s.slot !== '' && store.getItem(SLOT_PREFIX + s.slot) !== null)
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

function writeIndex(slots: SaveSlotMeta[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(INDEX_KEY, JSON.stringify(slots));
  } catch {
    /* quota — the caller reports the failed save */
  }
}

export function saveGame(state: GameState, slot: string): { ok: boolean; message: string } {
  const store = storage();
  if (!store) return { ok: false, message: 'Storage is blocked in this browser, so the game cannot be saved.' };
  state.lastSavedAt = Date.now();
  const negotiation = state.negotiation;
  try {
    // An open negotiation is saved and resumes on load; a finished one is dropped.
    if (negotiation?.done) state.negotiation = undefined;
    store.setItem(SLOT_PREFIX + slot, JSON.stringify(state));
  } catch {
    state.negotiation = negotiation;
    return { ok: false, message: 'Saving failed: device storage is full.' };
  }
  state.negotiation = negotiation;
  const slots = listSaves().filter((s) => s.slot !== slot);
  slots.push({
    slot,
    companyName: state.companyName,
    day: state.day,
    cash: state.cash,
    companyValue: companyValue(state),
    savedAt: state.lastSavedAt,
    level: state.companyLevel,
  });
  writeIndex(slots);
  try {
    store.setItem('cdmt:last', slot);
  } catch { /* ignore */ }
  return { ok: true, message: slot === AUTOSAVE_ID ? 'Autosaved.' : 'Game saved.' };
}

export function lastSlot(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const slot = store.getItem('cdmt:last');
    if (slot && store.getItem(SLOT_PREFIX + slot)) return slot;
    const saves = listSaves();
    return saves[0]?.slot ?? null;
  } catch {
    return null;
  }
}

export function loadGame(slot: string): GameState | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(SLOT_PREFIX + slot);
    if (!raw) return null;
    return parseSave(raw);
  } catch {
    return null;
  }
}

export function parseSave(raw: string): GameState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const state = migrate(parsed);
    if (state) reseedGameRng((state.seed + state.day * 7919) >>> 0);
    return state;
  } catch {
    return null;
  }
}

export function deleteSave(slot: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SLOT_PREFIX + slot);
  } catch { /* ignore */ }
  writeIndex(listSaves().filter((s) => s.slot !== slot));
}

export function exportSave(state: GameState): string {
  return JSON.stringify({ format: 'cdmt-save', version: SAVE_VERSION, state });
}

export function importSave(text: string): GameState | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (isRecord(parsed) && parsed.format === 'cdmt-save' && isRecord(parsed.state)) return migrate(parsed.state);
    return migrate(parsed);
  } catch {
    return null;
  }
}

/** Validates and back-fills a loaded save. Returns null when it is not a save at all. */
export function migrate(input: unknown): GameState | null {
  if (!isRecord(input)) return null;
  if (!Array.isArray(input.vehicles) || !Array.isArray(input.locations) || input.locations.length === 0) return null;
  const s = input as unknown as GameState;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  s.version = SAVE_VERSION;
  s.day = Math.max(1, num(s.day, 1));
  s.hour = Math.min(19, Math.max(8, num(s.hour, 8)));
  s.speed = 0;
  s.cash = num(s.cash, 0);
  s.reputation = num(s.reputation, 50);
  s.companyLevel = Math.max(1, num(s.companyLevel, 1));
  s.companyName = str(s.companyName, 'Dealership');
  s.ownerName = str(s.ownerName, 'You');
  s.challenge = str(s.challenge, 'standard');
  s.seed = num(s.seed, 1);
  s.vehicles = arr(s.vehicles);
  s.soldArchive = arr(s.soldArchive);
  s.offers = arr(s.offers);
  s.customers = arr(s.customers);
  s.employees = arr(s.employees);
  s.candidates = arr(s.candidates);
  s.transactions = arr(s.transactions);
  s.txCounter = num(s.txCounter, s.transactions.length);
  s.loans = arr(s.loans);
  s.events = arr(s.events);
  s.eventLog = arr(s.eventLog);
  s.trends = isRecord(s.trends) ? (s.trends as Record<string, number>) : {};
  s.trendHistory = arr(s.trendHistory);
  s.competitors = arr(s.competitors);
  s.campaigns = arr(s.campaigns);
  s.reviews = arr(s.reviews);
  s.history = arr(s.history);
  s.notices = arr(s.notices);
  s.noticeCounter = num(s.noticeCounter, s.notices.length);
  s.achievements = isRecord(s.achievements) ? (s.achievements as Record<string, number>) : {};
  s.lostLeads = arr(s.lostLeads);
  s.autoList = isRecord(s.autoList) ? (s.autoList as Record<string, boolean>) : {};
  s.settings = { ...DEFAULT_SETTINGS, ...(isRecord(s.settings) ? s.settings : {}) };
  s.tutorial = isRecord(s.tutorial) ? s.tutorial : { done: {}, dismissed: false };
  if (!isRecord(s.tutorial.done)) s.tutorial.done = {};
  s.legacy = isRecord(s.legacy) ? { ...emptyLegacy(), ...s.legacy } : emptyLegacy();
  s.idCounter = num(s.idCounter, 5000);
  s.overdraftDays = num(s.overdraftDays, 0);
  s.bankrupt = Boolean(s.bankrupt);
  const statsDefaults = {
    sold: 0, customersServed: 0, customersTotal: 0, lifetimeRevenue: 0, lifetimeProfit: 0, biggestDeal: 0,
    bestMonthProfit: 0, perfectReviews: 0, vehiclesBought: 0, peakCompanyValue: 0, evSold: 0, lostLeads: 0,
    loansRepaid: 0, rareBought: 0,
  };
  s.stats = { ...statsDefaults, ...(isRecord(s.stats) ? s.stats : {}) };
  s.month = { revenue: 0, expenses: 0, profit: 0, sold: 0, ...(isRecord(s.month) ? s.month : {}) };
  s.today = { revenue: 0, expenses: 0, profit: 0, sold: 0, leads: 0, ...(isRecord(s.today) ? s.today : {}) };
  // An open negotiation resumes if its customer and car are still there.
  const n = isRecord(s.negotiation) ? s.negotiation : undefined;
  const keep = n && !n.done && Array.isArray(n.log) && s.customers.some((c) => c.id === n.customerId && c.status === 'negotiating')
    && s.vehicles.some((v) => v.id === n.vehicleId && v.status === 'listed');
  s.negotiation = keep ? n : undefined;
  for (const c of s.customers) if (c.status === 'negotiating' && (!keep || c.id !== n?.customerId)) c.status = 'waiting';
  for (const loc of s.locations) {
    loc.upgrades = isRecord(loc.upgrades) ? loc.upgrades : {};
    loc.stats = Object.assign({ revenue: 0, profit: 0, sold: 0, leads: 0 }, loc.stats ?? {});
    loc.month = Object.assign({ revenue: 0, profit: 0, sold: 0, leads: 0 }, loc.month ?? {});
    loc.reputation = num(loc.reputation, 50);
    loc.rentMonthly = num(loc.rentMonthly, 1800);
    if (!isValidLot(loc.lot)) convertPremises(s, loc);
  }
  for (const loc of s.locations) {
    assignSlots(s, loc);
    assignStations(s, loc);
  }
  if (!s.locations.some((l) => l.id === s.activeLocationId)) s.activeLocationId = s.locations[0].id;
  // Remove any duplicated vehicles (defensive against corrupted saves).
  const seen = new Set<string>();
  s.vehicles = s.vehicles.filter((v) => {
    if (!v || typeof v.id !== 'string' || seen.has(v.id)) return false;
    seen.add(v.id);
    v.issues = Array.isArray(v.issues) ? v.issues : [];
    v.prep = Array.isArray(v.prep) ? v.prep : [];
    v.options = Array.isArray(v.options) ? v.options : [];
    v.history = Array.isArray(v.history) ? v.history : [];
    v.costs = Object.assign({ transport: 0, inspection: 0, repairs: 0, detailing: 0, other: 0 }, v.costs ?? {});
    return v.status !== 'sold';
  });
  initSystems(s);
  return s;
}

function isValidLot(lot: unknown): lot is Lot {
  if (!isRecord(lot)) return false;
  const l = lot as unknown as Lot;
  if (typeof l.w !== 'number' || typeof l.h !== 'number' || typeof l.zones !== 'string' || l.zones.length !== l.w * l.h || !Array.isArray(l.objects)) return false;
  l.style = Object.assign({ floor: 'concrete', walls: 'basic', lighting: 'basic' }, isRecord(l.style) ? l.style : {});
  l.open = l.open !== false;
  l.version = num(l.version, 1) + 1;
  l.landTier = num(l.landTier, 0);
  l.objects = l.objects.filter((o) => isRecord(o) && typeof o.id === 'string' && typeof o.defId === 'string');
  return true;
}

/**
 * Saves from before the physical dealership had abstract upgrade levels. The
 * premises are rebuilt as a real lot big enough for the stock, and what the
 * old upgrades were worth comes back as a construction credit.
 */
function convertPremises(s: GameState, loc: Location): void {
  let credit = 0;
  for (const id of [...PHYSICAL_UPGRADES, 'parking', 'office', 'storage']) {
    const def = UPGRADE_BY_ID[id];
    const level = loc.upgrades[id] ?? 0;
    if (def) for (let i = 0; i < level && i < def.costs.length; i += 1) credit += def.costs[i] * 0.6;
    delete loc.upgrades[id];
  }
  const cars = s.vehicles.filter((v) => (v.locationId === loc.id && v.status !== 'sold') || v.transferTo === loc.id).length;
  const staff = s.employees.filter((e) => e.locationId === loc.id).length;
  let tier = 0;
  const lot = emptyLot(0);
  loc.lot = lot;
  buildTemplate(s, lot, cars > 6 ? 'volume' : 'small', s.companyLevel);
  while (lotStats(lot).capacity < cars + 2 && tier < 5) {
    tier += 1;
    const next = emptyLot(tier);
    loc.lot = next;
    buildTemplate(s, next, 'volume', s.companyLevel);
    addParkingRows(s, next, cars + 2);
    if (lotStats(next).capacity >= cars + 2) break;
  }
  // Enough sales desks for the sales team (other roles build their own stations).
  const sellers = s.employees.filter((e) => e.locationId === loc.id && e.role === 'sales').length;
  addDesks(s, loc.lot, sellers);
  if (credit > 0) {
    s.cash += Math.round(credit);
    s.notices.unshift({ id: (s.noticeCounter += 1), day: s.day, kind: 'good', text: `${loc.name} is now a real, buildable dealership. Your old upgrades were converted into a €${Math.round(credit).toLocaleString('en-GB')} building credit — open Build mode to design it.`, read: false });
  }
  void staff;
  loc.rentMonthly = rentFor(loc);
}

/** Fills bare land above the lot with customer-accessible parking rows. */
function addParkingRows(s: GameState, lot: Lot, target: number): void {
  for (let y = 0; y + 6 <= lot.h - 3 && lotStats(lot).capacity < target; y += 7) {
    for (let x = 1; x + 3 <= lot.w - 1 && lotStats(lot).capacity < target; x += 3) {
      let free = true;
      for (let ty = y; ty < y + 6 && free; ty += 1) for (let tx = x; tx < x + 3; tx += 1) if (lot.zones[ty * lot.w + tx] !== '.' && lot.zones[ty * lot.w + tx] !== 'a') free = false;
      if (!free) continue;
      const occ = occupancy(lot);
      let clear = true;
      for (let ty = y; ty < y + 6 && clear; ty += 1) for (let tx = x; tx < x + 3; tx += 1) if (occ.any[ty * lot.w + tx]) clear = false;
      if (!clear) continue;
      const chars = lot.zones.split('');
      for (let ty = y; ty < y + 7 && ty < lot.h; ty += 1) for (let tx = x - 1; tx < x + 4 && tx < lot.w; tx += 1) if (tx >= 0 && chars[ty * lot.w + tx] === '.') chars[ty * lot.w + tx] = 'a';
      lot.zones = chars.join('');
      lot.objects.push({ id: `o${(s.idCounter += 1).toString(36)}`, defId: 'parking', x, y, rot: 0 });
      bumpLot(lot);
    }
  }
}

function addDesks(s: GameState, lot: Lot, needed: number): void {
  for (let y = 0; y < lot.h - 1 && lotStats(lot).stations.sales.length < needed; y += 1) {
    for (let x = 0; x < lot.w - 1 && lotStats(lot).stations.sales.length < needed; x += 1) {
      const z = lot.zones[y * lot.w + x];
      if (z !== 'r' && z !== 's') continue;
      const occ = occupancy(lot);
      let ok = true;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = (y + dy) * lot.w + x + dx;
        if (lot.zones[i] !== z || occ.any[i]) ok = false;
      }
      // Keep a clear tile around desks so nobody gets boxed in.
      if (ok) {
        lot.objects.push({ id: `o${(s.idCounter += 1).toString(36)}`, defId: 'salesdesk', x, y, rot: 0 });
        bumpLot(lot);
        x += 2;
      }
    }
  }
}
