/**
 * Build mode: the dealership editor's palette — rooms, every placeable item
 * (searchable and filterable, with tooltips built from the game data), your
 * cars to drag onto the floor, finishes per room, land and templates — and
 * the strip of numbers that tells you what the layout does.
 */
import type { Ctx } from '../app';
import type { GameState, Location, Vehicle, ZoneCode } from '../../sim/types';
import { confirmDialog, h, modal } from '../dom';
import { haptic } from '../../platform/platform';
import { icon } from '../icons';
import { money } from '../../sim/format';
import { EFFECTS, FLOOR_STYLES, LAND_TIERS, LIGHT_STYLES, OBJECTS, OBJ_BY_ID, WALL_STYLES, ZONES, ZONE_BY_CODE } from '../../data/lot';
import { OBJ_UPGRADES, ROOM_TEMPLATES } from '../../data/buildplus';
import { DEALER_STYLES, applyDealerStyle, dealershipIdentity, focusMatch, siteCapacity, siteFlows, styleCost } from '../../sim/buildplus';
import { availableRoutes } from '../../drive/routes';
import type { EffectKey, ObjDef, StyleOption } from '../../data/lot';
import { QUICK_ROOMS, TEMPLATES, applyTemplate, buildQuickRoom, currentStyle, lotStats, nextPlot, quickRoomCost, rentFor, setStyle, styleChangeCost, templateCost, unlockReason } from '../../sim/lot';
import type { StyleTarget } from '../../sim/lot';
import { ARCHETYPE_BY_ID, CITY_BY_ID, ROLE_BY_ID, STRATEGIES } from '../../data/game';
import { BRAND_BY_ID } from '../../data/vehicles';
import { BUILD_TABS, BUILD_TAB_BY_ID, LEGACY_TAB, PANEL_TABS, tabsOf } from '../../data/buildcats';
import type { BuildTabId } from '../../data/buildcats';
import { capacityOf, occupying, staffAt, vehicleName } from '../../sim/state';
import { helpButton, richTipped } from '../kit';
import { effectLines, objectInfo, vehicleInfo } from './info';
import { canRedo, canUndo, redoLabel, undoLabel } from './history';

export type Tool =
  | { kind: 'select' }
  | { kind: 'pick' }
  | { kind: 'bulldoze' }
  | { kind: 'area'; start?: { x: number; y: number }; end?: { x: number; y: number } }
  | { kind: 'stamp'; templateId: string; rot: 0 | 1; x?: number; y?: number }
  | { kind: 'room'; start?: { x: number; y: number }; end?: { x: number; y: number } }
  | { kind: 'place'; defId: string; rot: 0 | 1; x?: number; y?: number; line?: { x0: number; y0: number; x1: number; y1: number }; placed?: number }
  | { kind: 'move'; objId: string; defId: string; rot: 0 | 1; x: number; y: number; grab?: { dx: number; dy: number }; dragging?: boolean }
  | { kind: 'paint'; code: ZoneCode; start?: { x: number; y: number }; end?: { x: number; y: number } }
  | { kind: 'car'; vehicleId: string; rot: 0 | 1; cx?: number; cy?: number; dragging?: boolean };

export type Filter = 'all' | 'unlocked' | 'cheap' | 'expensive' | 'small' | 'large' | 'showroom' | 'workshop' | 'service' | 'customer' | 'staff' | 'parking' | 'exterior' | 'ev' | 'technology' | 'security' | 'premium' | 'decoration';

export interface BuildHost {
  ctx: Ctx;
  loc: () => Location;
  tool: () => Tool;
  setTool: (t: Tool) => void;
  category: () => string;
  setCategory: (c: string) => void;
  search: () => string;
  setSearch: (q: string) => void;
  filter: () => Filter;
  setFilter: (f: Filter) => void;
  styleTarget: () => StyleTarget;
  setStyleTarget: (t: StyleTarget) => void;
  grid: () => boolean;
  toggleGrid: () => void;
  snap: () => boolean;
  toggleSnap: () => void;
  flow: () => boolean;
  toggleFlow: () => void;
  undo: () => void;
  redo: () => void;
  done: () => void;
  after: () => void;
  /** Press-and-drag from the palette onto the map (desktop and touch). */
  paletteDrag: (e: PointerEvent, what: { defId?: string; vehicleId?: string }) => void;
  /** Centre the map on a point (a room in the list). */
  focus: (x: number, y: number) => void;
  /** Buy the next plot (with the expansion animation). */
  buyLand: () => void;
  /** Phone bottom sheet height: peek (modes + categories), half or full. */
  sheet?: () => SheetSize;
  setSheet?: (size: SheetSize) => void;
}

export type SheetSize = 'peek' | 'half' | 'full';

/** The filter sheet's extra dimensions (the category chip is `host.filter()`). */
export interface AdvFilter {
  avail: 'all' | 'unlocked' | 'locked';
  price: 'any' | 'cheap' | 'mid' | 'expensive';
  size: 'any' | 'small' | 'medium' | 'large';
  level: 'any' | 'now' | 'soon';
}
const ADV_DEFAULT: AdvFilter = { avail: 'all', price: 'any', size: 'any', level: 'any' };
export const adv: AdvFilter = { ...ADV_DEFAULT };
export function resetAdv(): void { Object.assign(adv, ADV_DEFAULT); }
/** How many filters are switched on (for the badge on the Filter button). */
export function activeFilters(f: Filter): number {
  return (f !== 'all' ? 1 : 0) + (Object.keys(ADV_DEFAULT) as (keyof AdvFilter)[]).filter((k) => adv[k] !== ADV_DEFAULT[k]).length;
}
function matchesAdv(def: ObjDef, level: number): boolean {
  const area = def.w * def.h;
  const lv = def.minLevel ?? 1;
  const locked = lv > level || !!lockedFor(def);
  if (adv.avail === 'unlocked' && locked) return false;
  if (adv.avail === 'locked' && !locked) return false;
  if (adv.price === 'cheap' && def.cost > 500) return false;
  if (adv.price === 'mid' && (def.cost <= 500 || def.cost >= 5000)) return false;
  if (adv.price === 'expensive' && def.cost < 5000) return false;
  if (adv.size === 'small' && area > 2) return false;
  if (adv.size === 'medium' && (area <= 2 || area >= 12)) return false;
  if (adv.size === 'large' && area < 12) return false;
  if (adv.level === 'now' && lv > level) return false;
  if (adv.level === 'soon' && (lv <= level || lv > level + 2)) return false;
  return true;
}

/** The search field stays open on a phone while it has text (or was just opened). */
let searchOpen = false;

const FILTERS: { id: Filter; label: string; title: string }[] = [
  { id: 'all', label: 'All', title: 'Everything in this category' },
  { id: 'unlocked', label: 'Unlocked', title: 'Only what you can build right now' },
  { id: 'cheap', label: 'Cheap', title: 'Up to €500' },
  { id: 'expensive', label: 'Expensive', title: '€5,000 and up' },
  { id: 'small', label: 'Small', title: 'Up to 2 m²' },
  { id: 'large', label: 'Large', title: '12 m² and up' },
  { id: 'showroom', label: 'Showroom', title: 'Works in or for the showroom' },
  { id: 'workshop', label: 'Workshop', title: 'Stands in the workshop: lifts, tools, diagnostics' },
  { id: 'service', label: 'Service', title: 'Workshop, detailing, diagnostics, parts and service desks' },
  { id: 'customer', label: 'Customer', title: 'Makes customers happier or more patient' },
  { id: 'staff', label: 'Staff', title: 'Workstations and staff comfort' },
  { id: 'parking', label: 'Parking', title: 'Car spaces, visitor and staff parking' },
  { id: 'exterior', label: 'Exterior', title: 'Outside: entrances, roads, signs, greenery' },
  { id: 'ev', label: 'EV', title: 'Chargers and everything electric' },
  { id: 'technology', label: 'Technology', title: 'Screens, scanners, systems' },
  { id: 'security', label: 'Security', title: 'Cameras, alarms, barriers, guards' },
  { id: 'premium', label: 'Premium', title: 'High-end items for luxury buyers' },
  { id: 'decoration', label: 'Decoration', title: 'Decor, lighting and branding' },
];

const FILTER_TAB: Partial<Record<Filter, BuildTabId>> = { showroom: 'showroom', service: 'service', customer: 'customers', staff: 'staff', decoration: 'decoration', parking: 'parking', exterior: 'exterior', ev: 'ev', technology: 'technology', security: 'security', premium: 'premium' };

/** One icon family for the category row (the items keep their own art). */
const TAB_ICONS: Record<string, string> = {
  all: 'grid', zones: 'garage', structure: 'brick', showroom: 'sparkle', vehicles: 'car', customers: 'customer', staff: 'people',
  service: 'wrench', finance: 'finance', marketing: 'marketing', storage: 'box', decoration: 'plant', exterior: 'tree', parking: 'parking',
  ev: 'bolt', technology: 'screen', security: 'shield', premium: 'gem', testdrive: 'key', style: 'palette', land: 'map', templates: 'ruler',
};

/** Why an item cannot be built yet (set per palette paint, so filters know the player's progress). */
let lockedFor: (def: ObjDef) => string | undefined = () => undefined;

export function impactScore(def: ObjDef): number {
  let s = def.slot ? 3 : 0;
  if (def.station) s += 3;
  for (const [k, v] of Object.entries(def.effects ?? {}) as [EffectKey, number][]) s += k === 'sales' || k === 'satisfaction' ? v / 3 : v;
  return s;
}

export function matchesFilter(def: ObjDef, f: Filter, level: number): boolean {
  switch (f) {
    case 'all': return true;
    case 'unlocked': return (def.minLevel ?? 1) <= level && !lockedFor(def);
    case 'workshop': return def.zones.includes('w') && (def.zones.length <= 6 || !!def.slot);
    case 'cheap': return def.cost <= 500;
    case 'expensive': return def.cost >= 5000;
    case 'small': return def.w * def.h <= 2;
    case 'large': return def.w * def.h >= 12;
    default: {
      const tab = FILTER_TAB[f];
      return tab ? !!BUILD_TAB_BY_ID[tab].test?.(def) : true;
    }
  }
}

/** What a car spot suits, in words people search for. */
const FIT_WORDS: Record<string, string> = {
  any: 'any car suv sedan hatchback estate wagon coupe convertible van pickup offroader',
  premium: 'premium luxury prestige sports coupe suv',
  ev: 'electric ev hybrid battery',
  budget: 'budget cheap occasion small city hatchback',
};

const haystacks = new Map<string, string>();
/** Everything an item can be found by: name, categories, description, tags, effects, function, rooms, unlock, cost, capacity, audience, synergy and the cars it suits. */
export function haystack(def: ObjDef): string {
  const hit = haystacks.get(def.id);
  if (hit) return hit;
  const parts = [
    def.name, def.category, def.description, ...(def.tags ?? []), ...tabsOf(def),
    ...Object.keys(def.effects ?? {}).map((k) => EFFECTS[k as EffectKey]?.label ?? k),
    def.slot ? `car vehicle auto space ${def.slot} ${FIT_WORDS[def.spot?.fit ?? 'any'] ?? ''}` : '',
    def.station ? `desk station workstation ${def.station.map((r) => `${r} ${ROLE_BY_ID[r]?.name ?? ''}`).join(' ')}` : '',
    ...def.zones.map((z) => ZONE_BY_CODE[z]?.name ?? ''),
    `level ${def.minLevel ?? 1} lv${def.minLevel ?? 1}`, (def.minLevel ?? 1) > 1 ? 'unlock locked' : 'starter',
    def.capacity ?? '', def.audience ?? '', def.synergy?.text ?? '', def.synergy ? 'synergy combo bonus' : '',
    def.line ? 'line draw' : '',
  ];
  const text = parts.join(' ').toLowerCase();
  haystacks.set(def.id, text);
  return text;
}

/** A search word: plain text, or a price rule like "<500", ">5000", "€900". */
function wordMatches(def: ObjDef, hay: string, w: string): boolean {
  const price = /^([<>]=?|€)?(\d+)(k?)$/.exec(w.replace(/[.,]/g, ''));
  if (price && price[1]) {
    const n = Number(price[2]) * (price[3] ? 1000 : 1);
    if (price[1].startsWith('<')) return def.cost <= n;
    if (price[1].startsWith('>')) return def.cost >= n;
    return Math.abs(def.cost - n) <= n * 0.25;
  }
  // Short words ("ev", "it", "tv") match whole words only, so "ev" does not find "level".
  if (w.length <= 2) return new RegExp(`(^|[^a-z0-9])${w.replace(/[^a-z0-9]/g, '')}([^a-z0-9]|$)`).test(hay);
  return hay.includes(w);
}

/** Search across name, category, description, tags, effect, function, rooms, unlock, cost, capacity, audience, synergy and car types. */
export function matchesSearch(def: ObjDef, q: string): boolean {
  if (!q) return true;
  const hay = haystack(def);
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => wordMatches(def, hay, w));
}

export function searchItems(q: string, f: Filter, cat: string, level: number): ObjDef[] {
  const tab = BUILD_TAB_BY_ID[(LEGACY_TAB[cat] ?? cat) as BuildTabId];
  return OBJECTS.filter((d) => !d.hidden && (q || !tab?.test || tab.test(d)) && matchesSearch(d, q) && matchesFilter(d, f, level) && matchesAdv(d, level));
}

/** Rooms that match a search. */
function searchZones(q: string): typeof ZONES {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return ZONES.filter((z) => z.code !== '.' && words.every((w) => `${z.name} ${z.id} ${z.description} room area zone`.toLowerCase().includes(w)));
}

/** Your cars that match a search (brand, model, body, fuel, category, year, colour). */
function searchCars(s: GameState, loc: Location, q: string): Vehicle[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return s.vehicles.filter((v) => v.locationId === loc.id && (v.status === 'yard' || v.status === 'listed') && words.every((w) => {
    const hay = `${vehicleName(v)} ${BRAND_BY_ID[v.brandId]?.name ?? ''} ${v.body} ${v.fuel} ${v.category} ${v.year} ${v.color} ${v.drivetrain ?? ''} car vehicle auto`.toLowerCase();
    return hay.includes(w);
  }));
}

/** The four ways to work on the map: build, move, bulldoze, bulldoze an area. */
export type BuildMode = 'build' | 'move' | 'bulldoze' | 'area';

export function modeOf(t: Tool): BuildMode {
  if (t.kind === 'pick' || t.kind === 'move') return 'move';
  if (t.kind === 'bulldoze') return 'bulldoze';
  if (t.kind === 'area') return 'area';
  return 'build';
}

export function buildPalette(host: BuildHost): HTMLElement {
  const s = host.ctx.state;
  const loc = host.loc();
  const cat = host.category();
  const tool = host.tool();
  lockedFor = (d) => unlockReason(s, d, loc);
  const root = h('div', { class: 'build-palette' });
  const tb = (id: string, label: string, ic: string, on: boolean, run: () => void, title: string, disabled = false): HTMLElement =>
    h('button', { class: `bp-tool${on ? ' active' : ''}`, data: { bt: id }, title, aria: { label: title, pressed: String(on) }, disabled, on: { click: run } }, icon(ic, 15), h('span', { text: label }));
  // Phone: a grip to pull the sheet up and down.
  const size = host.sheet?.() ?? 'half';
  root.dataset.sheet = size;
  const grip = h('button', { class: 'bp-grip', aria: { label: size === 'full' ? 'Shrink the build sheet' : 'Expand the build sheet' } }, h('span', { class: 'bp-grip-bar' }));
  sheetGrip(grip, host);
  root.appendChild(grip);
  root.appendChild(h('div', { class: 'bp-head' },
    h('span', { class: 'bp-title' }, icon('hammer', 16), 'Build', helpButton('build')),
    h('span', { class: 'bp-cash', text: money(s.cash) }),
    h('button', { class: 'btn small primary', data: { bt: 'done' }, on: { click: host.done } }, icon('check', 14), 'Done')));
  // Three modes: BUILD · MOVE · REMOVE (one object, or a whole area).
  const mode = modeOf(tool);
  const removing = mode === 'bulldoze' || mode === 'area';
  root.classList.add(removing ? 'm-remove' : mode === 'move' ? 'm-move' : 'm-build');
  const md = (on: boolean, bt: string, label: string, glyph: string, title: string, run: () => void, danger = false): HTMLElement =>
    h('button', { class: `bp-mode${on ? ' active' : ''}${danger ? ' danger' : ''}`, data: { bt }, title, aria: { label: title, pressed: String(on) }, on: { click: () => { haptic(8); run(); } } }, h('span', { class: 'bp-mode-ic' }, icon(glyph, 18)), h('span', { text: label }));
  root.appendChild(swipeSheet(h('div', { class: 'bp-modes', role: 'group', aria: { label: 'Build mode' } },
    md(mode === 'build', 'select', 'Build', 'hammer', 'Build: place items, tap what is built to select it', () => host.setTool({ kind: 'select' })),
    md(mode === 'move', 'pick', 'Move', 'move', 'Move: tap anything built to pick it up and drop it somewhere else (M)', () => host.setTool({ kind: 'pick' })),
    md(removing, 'bulldoze', 'Remove', 'trash', 'Remove: tap an object to demolish it and get part of its cost back (X · Delete)', () => { if (!removing) host.setTool({ kind: 'bulldoze' }); }, true)), host));
  if (removing) {
    const rm = (id: 'single' | 'area', label: string, glyph: string, title: string, run: () => void): HTMLElement =>
      h('button', { class: `seg-btn bp-rm${(id === 'area') === (mode === 'area') ? ' active' : ''}`, data: { rm: id }, title, aria: { label: title }, on: { click: () => { haptic(6); run(); } } }, icon(glyph, 14), label);
    root.appendChild(h('div', { class: 'seg bp-rmseg', role: 'group', aria: { label: 'Remove what' } },
      rm('single', 'One object', 'trash', 'Tap one object to bulldoze it', () => host.setTool({ kind: 'bulldoze' })),
      rm('area', 'Area', 'layers', 'Bulldoze area: drag a rectangle to demolish everything in it', () => host.setTool({ kind: 'area' }))));
  }
  root.appendChild(h('div', { class: 'bp-tools' },
    tb('undo', 'Undo', 'undo', false, host.undo, canUndo(s) ? `Undo: ${undoLabel(s)} (Ctrl+Z)` : 'Nothing to undo', !canUndo(s)),
    tb('redo', 'Redo', 'redo', false, host.redo, canRedo(s) ? `Redo: ${redoLabel(s)} (Ctrl+Y)` : 'Nothing to redo', !canRedo(s)),
    tb('grid', 'Grid', 'dashboard', host.grid(), host.toggleGrid, 'Show the 1 m grid (G)'),
    tb('snap', 'Snap', 'layers', host.snap(), host.toggleSnap, 'Snap: line things up against walls and drop cars into the nearest space'),
    tb('flow', 'Flow', 'customer', host.flow(), host.toggleFlow, 'Show where customers can walk')));

  // Search and filters: typing only redraws the list, so the field keeps focus.
  if (host.search()) searchOpen = true;
  root.classList.toggle('s-open', searchOpen);
  const search = h('input', { type: 'search', class: 'bp-search-input', placeholder: 'Search 190+ items… (desk, parking, EV, <500)', value: host.search(), aria: { label: 'Search build items' } });
  search.setAttribute('enterkeyhint', 'search');
  const listHost = h('div', { class: 'bp-body' });
  const filters = h('div', { class: 'bp-filters scroll-x' });
  const tabs = h('div', { class: 'bp-tabs', role: 'tablist' });
  const nf = activeFilters(host.filter());
  const filterBtn = (): HTMLElement => h('button', {
    class: `bp-fbtn${nf ? ' on' : ''}`, data: { bt: 'filters' }, title: 'Filters: price, size, availability, category, level', aria: { label: `Filters${nf ? ` (${nf} on)` : ''}` },
    on: { click: () => openFilterSheet(host, () => paintAll()) },
  }, icon('filter', 17), nf ? h('span', { class: 'bp-fcount', text: String(nf) }) : null);
  const paintFilters = (): void => {
    filters.replaceChildren(...FILTERS.map((f) => h('button', { class: `bp-chip${host.filter() === f.id ? ' active' : ''}`, data: { filter: f.id }, title: f.title, on: { click: () => { host.setFilter(f.id); paintFilters(); paintList(); } } }, f.label)));
  };
  const paintList = (): void => {
    const scroll = listHost.scrollTop;
    listHost.replaceChildren(...body(host, host.category(), loc));
    listHost.scrollTop = scroll;
  };
  const paintAll = (): void => { host.setCategory(host.category()); };
  search.addEventListener('input', () => { host.setSearch(search.value); paintList(); });
  search.addEventListener('focus', () => { if ((host.sheet?.() ?? 'half') === 'peek') host.setSheet?.('half'); });
  const closeSearch = (): void => { searchOpen = false; host.setSearch(''); paintAll(); };
  root.appendChild(h('div', { class: 'bp-search' }, icon('search', 14), search,
    filterBtn(),
    h('button', { class: 'bp-sclose', aria: { label: 'Close search' }, on: { click: closeSearch } }, icon('close', 16))));
  paintFilters();
  root.appendChild(filters);
  const current = (LEGACY_TAB[cat] ?? cat) as BuildTabId;
  for (const t of BUILD_TABS) {
    const count = t.test ? OBJECTS.filter((d) => !d.hidden && t.test!(d)).length : 0;
    tabs.appendChild(h('button', {
      class: `bp-tab${t.id === current ? ' active' : ''}`,
      data: { cat: t.id },
      title: t.test && t.id !== 'all' ? `${t.hint} (${count} items)` : t.hint,
      aria: { label: `${t.name}: ${t.hint}`, pressed: String(t.id === current) },
      on: { click: () => { host.setSearch(''); if ((host.sheet?.() ?? 'half') === 'peek') host.setSheet?.('half'); host.setCategory(t.id); } },
    }, h('span', { class: 'bp-tab-ic' }, icon(TAB_ICONS[t.id] ?? 'layers', 16)), h('span', { class: 'bp-tab-name', text: t.name }), t.test && t.id !== 'all' ? h('span', { class: 'bp-tab-n', text: String(count) }) : null));
  }
  // On phones the tabs scroll sideways: arrows and edge fades show there is more.
  const tabWrap = h('div', { class: 'bp-tabwrap' });
  const arrow = (dir: -1 | 1): HTMLElement => h('button', { class: `bp-tabarrow ${dir < 0 ? 'left' : 'right'}`, aria: { label: dir < 0 ? 'Previous categories' : 'More categories' }, on: { click: () => tabs.scrollBy({ left: dir * tabs.clientWidth * 0.7, behavior: 'smooth' }) } }, dir < 0 ? '‹' : '›');
  const left = arrow(-1);
  const right = arrow(1);
  const edges = (): void => {
    const more = tabs.scrollWidth - tabs.clientWidth > 2;
    tabWrap.classList.toggle('at-start', !more || tabs.scrollLeft <= 2);
    tabWrap.classList.toggle('at-end', !more || tabs.scrollLeft >= tabs.scrollWidth - tabs.clientWidth - 2);
  };
  tabs.addEventListener('scroll', edges, { passive: true });
  tabWrap.append(left, tabs, right);
  const openSearch = (): void => {
    searchOpen = true;
    root.classList.add('s-open');
    if ((host.sheet?.() ?? 'half') === 'peek') host.setSheet?.('half');
    requestAnimationFrame(() => (root.querySelector('.bp-search-input') as HTMLInputElement | null)?.focus());
  };
  const catbar = h('div', { class: 'bp-catbar' },
    h('button', { class: 'bp-sbtn', data: { bt: 'search' }, aria: { label: 'Search build items' }, on: { click: openSearch } }, icon('search', 17)),
    filterBtn(),
    tabWrap);
  requestAnimationFrame(() => {
    const active = tabs.querySelector<HTMLElement>('.bp-tab.active');
    const hidden = active && (active.offsetLeft < tabs.scrollLeft || active.offsetLeft + active.offsetWidth > tabs.scrollLeft + tabs.clientWidth);
    if (active && hidden && tabs.scrollWidth > tabs.clientWidth) {
      const target = active.offsetLeft - (tabs.clientWidth - active.offsetWidth) / 2;
      tabs.scrollLeft = Math.max(0, target);
    }
    edges();
  });
  root.appendChild(catbar);
  root.appendChild(listHost);
  paintList();
  return root;
}

/** Short lock text for a card: level, reputation, sales… */
function lockLabel(reason: string): string {
  const m = /level (\d+)/i.exec(reason);
  if (m) return `Level ${m[1]}`;
  if (/reputation/i.test(reason)) return 'Reputation';
  if (/sold/i.test(reason)) return 'Sales';
  if (/team/i.test(reason)) return 'Team size';
  if (/plot/i.test(reason)) return 'Bigger plot';
  if (/profit/i.test(reason)) return 'Profit';
  if (/test drives/i.test(reason)) return 'Test drives';
  if (/electric/i.test(reason)) return 'EV sales';
  return 'Locked';
}

function itemCard(host: BuildHost, def: ObjDef): HTMLElement {
  const s = host.ctx.state;
  const tool = host.tool();
  const reason = lockedFor(def);
  const locked = !!reason;
  const poor = !locked && s.cash < def.cost;
  const active = (tool.kind === 'place' || tool.kind === 'move') && tool.defId === def.id;
  const fx = effectLines(def)[0];
  const card = h('button', {
    class: `bp-item${active ? ' active' : ''}${locked ? ' locked' : ''}${poor ? ' poor' : ''}`,
    data: { obj: def.id },
    title: reason ?? '',
    aria: { label: `${def.name}, ${money(def.cost)}${reason ? `. Locked: ${reason}` : ''}` },
    on: { click: () => { if (locked) { openLocked(host, def, reason!); return; } haptic(8); host.setTool({ kind: 'place', defId: def.id, rot: 0 }); } },
  }, h('span', { class: 'bp-swatch', style: `border-color:${def.color}` }, def.icon), h('span', { class: 'bp-name', text: def.name }),
  h('span', { class: 'bp-cost', text: reason ? lockLabel(reason) : money(def.cost) }),
  h('span', { class: 'bp-eff', text: `${def.w}×${def.h} m${def.line ? ' · line' : ''}${OBJ_UPGRADES[def.id] ? ' · upgradable' : ''}${fx ? ` · ${fx.text}` : def.slot ? ' · +1 space' : def.station ? ` · ${def.station[0]} desk` : ''}` }),
  h('span', { class: 'bp-desc', text: def.description }),
  reason ? h('span', { class: 'bp-lockline' }, icon('lock', 12), h('span', { text: reason })) : poor ? h('span', { class: 'bp-lockline poor' }, icon('cash', 12), h('span', { text: `Need ${money(def.cost - s.cash)} more` })) : null);
  // Press and drag the card straight onto the map.
  card.addEventListener('pointerdown', (e) => { if (!locked && e.button === 0) host.paletteDrag(e, { defId: def.id }); });
  return richTipped(card, () => objectInfo(s, def), def.name);
}

/** A locked item explains itself: what it does and what unlocks it. */
function openLocked(host: BuildHost, def: ObjDef, reason: string): void {
  haptic(12);
  const { body, footer, close } = modal({ title: def.name, sub: `${money(def.cost)} · ${def.w}×${def.h} m`, cls: 'lock-sheet', width: 460 });
  body.appendChild(h('div', { class: 'lock-why' }, h('span', { class: 'lock-ic' }, icon('lock', 20)),
    h('div', {}, h('div', { class: 't-label', text: 'Locked' }), h('div', { class: 'lock-reason', text: reason }))));
  body.appendChild(h('p', { class: 't-body', text: def.description }));
  const lines = effectLines(def);
  if (lines.length) body.appendChild(h('ul', { class: 'lock-fx' }, ...lines.slice(0, 5).map((l) => h('li', { text: l.text }))));
  footer.appendChild(h('button', { class: 'btn primary block', on: { click: close } }, 'Got it'));
  void host;
}

/** The filter sheet: availability, price, size, category and required level. */
function openFilterSheet(host: BuildHost, repaint: () => void): void {
  const level = host.ctx.state.companyLevel;
  const { body, footer, close } = modal({ title: 'Filters', cls: 'filter-sheet', width: 520, onClose: () => repaint() });
  const count = h('span');
  const updateCount = (): void => {
    const n = searchItems(host.search().trim(), host.filter(), host.category(), level).length;
    count.textContent = `Show ${n} item${n === 1 ? '' : 's'}`;
  };
  const group = <K extends keyof AdvFilter>(title: string, key: K, opts: [AdvFilter[K], string][]): HTMLElement => {
    const row = h('div', { class: 'seg seg-wrap', role: 'group', aria: { label: title } });
    const paint = (): void => {
      row.replaceChildren(...opts.map(([v, label]) => h('button', {
        class: `seg-btn${adv[key] === v ? ' active' : ''}`, data: { adv: `${key}:${v}` },
        on: { click: () => { adv[key] = v; haptic(6); paint(); updateCount(); } },
      }, label)));
    };
    paint();
    return h('div', { class: 'fs-group' }, h('div', { class: 't-label', text: title }), row);
  };
  body.appendChild(group('Availability', 'avail', [['all', 'All'], ['unlocked', 'Unlocked'], ['locked', 'Locked']]));
  body.appendChild(group('Price', 'price', [['any', 'Any'], ['cheap', '≤ €500'], ['mid', '€500–5k'], ['expensive', '€5k+']]));
  body.appendChild(group('Size', 'size', [['any', 'Any'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]));
  body.appendChild(group('Required level', 'level', [['any', 'Any'], ['now', `Level ≤ ${level}`], ['soon', 'Next levels']]));
  const cats = h('div', { class: 'chip-wrap' });
  const paintCats = (): void => {
    cats.replaceChildren(...FILTERS.filter((f) => f.id !== 'unlocked' && f.id !== 'cheap' && f.id !== 'expensive' && f.id !== 'small' && f.id !== 'large' || f.id === host.filter()).map((f) => h('button', {
      class: `bp-chip${host.filter() === f.id ? ' active' : ''}`, data: { filter: f.id }, title: f.title,
      on: { click: () => { host.setFilter(f.id); haptic(6); paintCats(); updateCount(); } },
    }, f.id === 'all' ? 'Any' : f.label)));
  };
  paintCats();
  body.appendChild(h('div', { class: 'fs-group' }, h('div', { class: 't-label', text: 'Category' }), cats));
  footer.appendChild(h('button', { class: 'btn ghost', data: { act: 'reset-filters' }, on: { click: () => { resetAdv(); host.setFilter('all'); close(); } } }, 'Reset'));
  footer.appendChild(h('button', { class: 'btn primary', data: { act: 'apply-filters' }, on: { click: close } }, count));
  updateCount();
}

/** The toolbar is a handle too: a vertical swipe on it resizes the drawer (taps still press its buttons). */
function swipeSheet(el: HTMLElement, host: BuildHost): HTMLElement {
  let x0 = 0;
  let y0 = 0;
  let live = false;
  const order: SheetSize[] = ['peek', 'half', 'full'];
  el.addEventListener('pointerdown', (e) => { live = e.pointerType !== 'mouse'; x0 = e.clientX; y0 = e.clientY; });
  el.addEventListener('pointerup', (e) => {
    if (!live) return;
    live = false;
    const dy = e.clientY - y0;
    if (Math.abs(dy) < 36 || Math.abs(dy) < Math.abs(e.clientX - x0) * 1.5) return;
    const cur = order.indexOf(host.sheet?.() ?? 'half');
    const next = Math.max(0, Math.min(2, cur + (dy < 0 ? 1 : -1)));
    if (next !== cur) { haptic(6); host.setSheet?.(order[next]); }
  });
  el.addEventListener('pointercancel', () => { live = false; });
  return el;
}

/** Pull the phone sheet up or down by its grip (tap to cycle). */
function sheetGrip(grip: HTMLElement, host: BuildHost): void {
  let y0 = 0;
  let moved = 0;
  let down = false;
  const order: SheetSize[] = ['peek', 'half', 'full'];
  grip.addEventListener('pointerdown', (e) => { down = true; y0 = e.clientY; moved = 0; grip.setPointerCapture?.(e.pointerId); });
  grip.addEventListener('pointermove', (e) => { if (down) moved = e.clientY - y0; });
  const finish = (): void => {
    if (!down) return;
    down = false;
    const cur = order.indexOf(host.sheet?.() ?? 'half');
    let next = cur;
    if (moved < -24) next = Math.min(2, cur + (moved < -160 ? 2 : 1));
    else if (moved > 24) next = Math.max(0, cur - (moved > 160 ? 2 : 1));
    else next = (cur + 1) % 3;
    if (next !== cur) { haptic(6); host.setSheet?.(order[next]); }
  };
  grip.addEventListener('pointerup', finish);
  grip.addEventListener('pointercancel', () => { down = false; });
}

function body(host: BuildHost, rawCat: string, loc: Location): HTMLElement[] {
  const s = host.ctx.state;
  const tool = host.tool();
  const out: HTMLElement[] = [];
  const q = host.search().trim();
  const f = host.filter();
  const cat = (LEGACY_TAB[rawCat] ?? (BUILD_TAB_BY_ID[rawCat as BuildTabId] ? rawCat : 'all')) as BuildTabId;
  const mode = modeOf(tool);
  if (mode === 'bulldoze' || mode === 'area' || tool.kind === 'pick') {
    out.push(h('div', { class: `bp-modehint ${mode}` },
      h('strong', {}, icon(mode === 'bulldoze' ? 'trash' : mode === 'area' ? 'layers' : 'move', 15), mode === 'bulldoze' ? 'Remove one object' : mode === 'area' ? 'Remove an area' : 'Move'),
      h('span', { text: mode === 'bulldoze' ? 'Tap an object on the map. You see what it cost and what you get back before anything is demolished. Undo brings it back.' : mode === 'area' ? 'Drag a rectangle over the map. Everything in it is marked; you confirm with the total refund.' : 'Tap anything built to pick it up, then drop it where you want. Snaps to the grid, R rotates.' }),
      h('button', { class: 'btn small ghost', data: { bt: 'back-to-build' }, on: { click: () => host.setTool({ kind: 'select' }) } }, 'Back to building')));
  }
  if (q || !PANEL_TABS.includes(cat)) {
    const items = searchItems(q, f, cat, s.companyLevel);
    const zones = q ? searchZones(q) : [];
    const cars = q ? searchCars(s, loc, q) : [];
    const total = items.length + zones.length + cars.length;
    const tab = BUILD_TAB_BY_ID[cat];
    if (q) out.push(h('div', { class: 'bp-hint', text: `${total} result${total === 1 ? '' : 's'} for “${q}” — searching names, effects, functions, rooms, unlocks, prices (try <500 or >5000) and car types.` }));
    else out.push(h('div', { class: 'bp-hint', text: `${tab.icon} ${tab.hint}. ${items.length} item${items.length === 1 ? '' : 's'}${f !== 'all' ? ` (filter: ${FILTERS.find((x) => x.id === f)?.label})` : ''}.` }));
    if (cat === 'vehicles' && !q) out.push(...carShelf(host, loc));
    if (cars.length) out.push(...carShelf(host, loc, cars));
    if (zones.length) {
      out.push(h('div', { class: 'bp-sub', text: 'Rooms and areas' }));
      const zg = h('div', { class: 'bp-grid' });
      for (const z of zones) zg.appendChild(zoneCard(host, z));
      out.push(zg);
    }
    if (!total) out.push(h('p', { class: 'empty', text: f !== 'all' ? 'Nothing matches with this filter. Try “All”.' : 'Nothing matches. Try another word — an effect (“satisfaction”), a role (“mechanic”), a room or a price like <1000.' }));
    if (items.length) {
      if (zones.length || cars.length) out.push(h('div', { class: 'bp-sub', text: 'Items' }));
      const grid = h('div', { class: 'bp-grid' });
      for (const def of items) grid.appendChild(itemCard(host, def));
      out.push(grid);
    }
    if (cat === 'structure' && !q) out.push(h('div', { class: 'bp-hint', text: 'Walls, fences, hedges, partitions and lanes are drawn: pick one, then drag a straight line on the map. Rooms get their outer walls automatically — see Rooms. Floors, walls and ceilings are under “Style & focus”.' }));
    if (cat === 'testdrive' && !q) out.push(testDriveCard(host, loc));
    return out;
  }
  if (cat === 'zones') {
    const creating = tool.kind === 'room';
    out.push(h('button', { class: `bp-card bp-create${creating ? ' active' : ''}`, data: { room: 'create' }, on: { click: () => host.setTool({ kind: 'room' }) } },
      h('div', { class: 'card-title', text: '🏗️ Create room' }),
      h('p', { class: 'tiny muted', text: 'Drag a rectangle on the map. The room type is suggested from what already stands there, walls go up automatically and a door is added towards the lot.' })));
    const rooms = lotStats(loc.lot).rooms.filter((r) => r.tiles >= 4);
    if (rooms.length) {
      out.push(h('div', { class: 'bp-sub', text: `Your rooms (${rooms.length})` }));
      out.push(h('div', { class: 'bp-list' }, ...rooms.slice(0, 24).map((r) => h('button', {
        class: `bp-row room-row${r.complete ? ' good' : ''}`,
        data: { roomrow: r.code },
        title: r.purpose,
        on: { click: () => host.focus(r.cx, r.cy) },
      }, h('span', { text: `${ZONE_BY_CODE[r.code].icon} ${ZONE_BY_CODE[r.code].name}` }), h('span', { class: 'tiny muted', text: `${r.tiles} m²` }),
      h('span', { class: `tag ${r.complete ? 'good' : 'warn'}`, text: r.complete ? `✓ ${['', 'Basic', 'Good', 'Excellent'][r.quality]}` : `needs ${r.needs[0] ?? '…'}` })))));
    }
    out.push(h('div', { class: 'bp-sub', text: 'Paint a room or area' }));
    out.push(h('div', { class: 'bp-hint', text: 'Pick an area, then drag on the map to paint it. Indoor rooms get walls automatically — add a door so people can get in.' }));
    const grid = h('div', { class: 'bp-grid' });
    for (const z of ZONES) {
      if (z.code === '.') continue;
      grid.appendChild(zoneCard(host, z));
    }
    const demolish = tool.kind === 'paint' && tool.code === '.';
    grid.appendChild(h('button', { class: `bp-item${demolish ? ' active' : ''}`, data: { zone: '.' }, title: 'Clear back to bare land (30% salvage).', on: { click: () => host.setTool({ kind: 'paint', code: '.' }) } },
      h('span', { class: 'bp-swatch', style: 'background:#3b342c' }, '🧹'), h('span', { class: 'bp-name', text: 'Clear land' }), h('span', { class: 'bp-cost', text: 'salvage' })));
    out.push(grid);
    out.push(h('div', { class: 'bp-sub', text: 'Ready-made rooms (one tap, placed on free land)' }));
    const quick = h('div', { class: 'bp-grid' });
    for (const [id, r] of Object.entries(QUICK_ROOMS)) {
      const cost = quickRoomCost(loc, id);
      quick.appendChild(h('button', {
        class: 'bp-item',
        data: { room: id },
        title: r.description,
        disabled: s.cash < cost,
        on: {
          click: async () => {
            if (cost >= s.settings.confirmBigSpend && !(await confirmDialog(`Build a ${r.name.toLowerCase()}?`, `${r.description} Cost about ${money(cost)}.`, 'Build'))) return;
            host.ctx.act(tracked(host, `Build ${r.name.toLowerCase()}`, () => buildQuickRoom(s, loc, id)), { sound: 'buy' });
            host.after();
          },
        },
      }, h('span', { class: 'bp-swatch' }, r.icon), h('span', { class: 'bp-name', text: r.name }), h('span', { class: 'bp-cost', text: money(cost) })));
    }
    out.push(quick);
  } else if (cat === 'style') {
    out.push(...styleBody(host, loc));
  } else if (cat === 'land') {
    out.push(...landBody(host, loc));
  } else if (cat === 'templates') {
    out.push(h('div', { class: 'bp-hint', text: 'Pick a template, then place it on open land (R rotates). It uses normal build items, so you can move, upgrade or bulldoze any part afterwards.' }));
    const grid = h('div', { class: 'bp-grid tpl-grid' });
    for (const t of ROOM_TEMPLATES) {
      const locked = t.minLevel > s.companyLevel;
      const active = tool.kind === 'stamp' && tool.templateId === t.id;
      const est = Math.round(t.w * t.h * (ZONE_BY_CODE[t.zone].costPerTile + (ZONE_BY_CODE[t.zone].indoor ? 10 : 0)) + t.objects.reduce((sum, [id]) => sum + (OBJ_BY_ID[id]?.cost ?? 0), 0));
      grid.appendChild(richTipped(h('button', {
        class: `bp-item tpl${active ? ' active' : ''}${locked ? ' locked' : ''}`,
        data: { tpl: t.id },
        disabled: locked,
        on: { click: () => host.setTool({ kind: 'stamp', templateId: t.id, rot: 0 }) },
      }, h('span', { class: 'bp-swatch', style: `background:${ZONE_BY_CODE[t.zone].color}` }, t.icon), h('span', { class: 'bp-name', text: t.name }),
      h('span', { class: 'bp-cost', text: locked ? `🔒 level ${t.minLevel}` : `~${money(est)}` }), h('span', { class: 'bp-eff', text: `${t.w}×${t.h} m · ${t.objects.length} items` })),
      () => h('div', { class: 'info-card' }, h('div', { class: 'ic-title', text: t.name.toUpperCase() }), h('p', { class: 'ic-desc', text: t.description }),
        h('div', { class: 'ic-hint', text: t.objects.map(([id]) => OBJ_BY_ID[id]?.name).filter(Boolean).join(', ') })), t.name));
    }
    out.push(grid);
    const salvage = Math.round(loc.lot.objects.reduce((sum, o) => sum + (OBJECTS.find((d) => d.id === o.defId)?.cost ?? 0), 0) * 0.5);
    const rebuild = h('details', { class: 'bp-details' }, h('summary', { text: 'Rebuild the whole lot from a layout' }),
      h('div', { class: 'bp-hint', text: 'Replaces everything that is built. What stands now is sold for half its price.' }));
    for (const t of TEMPLATES) {
      const cost = templateCost(t.id, loc.lot.landTier, s.companyLevel) - salvage;
      rebuild.appendChild(h('div', { class: 'bp-card' },
        h('div', { class: 'card-title', text: t.name }),
        h('p', { class: 'tiny muted', text: t.description }),
        h('button', {
          class: 'btn block',
          data: { template: t.id },
          disabled: cost > s.cash,
          on: {
            click: async () => {
              if (!(await confirmDialog(`Rebuild as "${t.name}"?`, `Everything currently built is replaced. Net cost ${cost >= 0 ? money(cost) : `+${money(-cost)} back`}. Cars and staff move to the new spaces.`, 'Rebuild', true))) return;
              host.ctx.act(tracked(host, `Template: ${t.name}`, () => applyTemplate(s, loc, t.id)), { sound: 'buy' });
              host.after();
            },
          },
        }, cost >= 0 ? `Rebuild · ${money(cost)}` : `Rebuild · +${money(-cost)}`)));
    }
    out.push(rebuild);
  }
  return out;
}

/** Test-drive facilities: what you have and which routes they unlock. */
function testDriveCard(host: BuildHost, loc: Location): HTMLElement {
  const s = host.ctx.state;
  const routes = availableRoutes(s, loc);
  return h('div', { class: 'bp-card' },
    h('div', { class: 'card-title', text: `🗝️ Test-drive facilities: ${Math.round((lotStats(loc.lot).effects.testdrive ?? 0) * 10) / 10}` }),
    h('p', { class: 'tiny muted', text: 'Better facilities make every customer test drive more convincing and unlock new routes for the drive you do yourself.' }),
    h('div', { class: 'bp-list' }, ...routes.map((r) => h('div', { class: `bp-row${r.unlocked ? ' good' : ''}` }, h('span', { text: `${r.icon} ${r.name}` }), h('span', { class: 'tiny muted', text: r.unlocked ? `✓ ${r.length}` : r.requirement })))));
}

function styleBody(host: BuildHost, loc: Location): HTMLElement[] {
  const s = host.ctx.state;
  const out: HTMLElement[] = [];
  // Dealership style.
  out.push(h('div', { class: 'bp-sub', text: 'Dealership style' }));
  out.push(h('div', { class: 'bp-hint', text: 'A style refits every room at once — and draws its own customers.' }));
  const sg = h('div', { class: 'bp-grid' });
  for (const st of DEALER_STYLES) {
    const current = loc.lot.theme === st.id;
    const locked = st.minLevel > s.companyLevel;
    const cost = styleCost(loc, st.id);
    sg.appendChild(richTipped(h('button', {
      class: `bp-item${current ? ' active' : ''}${locked ? ' locked' : ''}`,
      data: { dstyle: st.id },
      disabled: current || locked,
      on: {
        click: async () => {
          if (!(await confirmDialog(`${st.icon} ${st.name} style?`, `${st.description} Refit of every room: ${money(cost)}.`, 'Refit'))) return;
          host.ctx.act(tracked(host, `Style: ${st.name}`, () => applyDealerStyle(s, loc, st.id)), { sound: 'buy' });
          host.after();
        },
      },
    }, h('span', { class: 'bp-swatch', style: `border-color:${st.accent}` }, st.icon), h('span', { class: 'bp-name', text: st.name }),
    h('span', { class: 'bp-cost', text: current ? '✓ current' : locked ? `🔒 level ${st.minLevel}` : money(cost) })),
    () => h('div', { class: 'info-card' }, h('div', { class: 'ic-title', text: `${st.name.toUpperCase()} STYLE` }), h('p', { class: 'ic-desc', text: st.description }),
      h('div', { class: 'ic-hint', text: `Attracts: ${Object.entries(st.mix).filter(([, v]) => (v ?? 1) > 1).map(([k]) => ARCHETYPE_BY_ID[k as keyof typeof ARCHETYPE_BY_ID]?.name ?? k).join(', ')}` })), st.name));
  }
  out.push(sg);
  // Specialisation, and what the building says you are.
  const ids = dealershipIdentity(loc);
  const fm = focusMatch(loc);
  out.push(h('div', { class: 'bp-sub', text: 'Specialisation' }));
  out.push(h('div', { class: `bp-identity${fm.match ? ' good' : ''}` },
    h('span', { text: `Your building says: ${ids[0].icon} ${ids[0].name} (${Math.round(ids[0].share * 100)}%)` }),
    h('span', { class: 'tiny muted', text: fm.match ? '✓ matches your focus: +6% visitors' : 'Pick a focus that matches what you built for +6% visitors.' })));
  out.push(h('div', { class: 'bp-filters wrap' }, ...STRATEGIES.map((st) => h('button', {
    class: `bp-chip${(loc.strategy ?? 'balanced') === st.id ? ' active' : ''}`,
    data: { strategy: st.id },
    title: st.description,
    on: { click: () => { loc.strategy = st.id; host.ctx.act({ ok: true, message: `${loc.name} now focuses on: ${st.name}.` }); host.after(); } },
  }, `${st.icon} ${st.name}`))));
  // Finishes per room.
  const target = host.styleTarget();
  const rooms = ZONES.filter((z) => z.indoor && (lotStats(loc.lot).tiles[z.code] ?? 0) > 0);
  out.push(h('div', { class: 'bp-sub', text: 'Floors, walls & ceilings' }));
  out.push(h('div', { class: 'bp-filters scroll-x' },
    h('button', { class: `bp-chip${target === 'all' ? ' active' : ''}`, data: { target: 'all' }, on: { click: () => host.setStyleTarget('all') } }, 'All rooms'),
    ...rooms.map((z) => h('button', { class: `bp-chip${target === z.code ? ' active' : ''}`, data: { target: z.code }, on: { click: () => host.setStyleTarget(z.code) } }, `${z.icon} ${z.name}`))));
  const section = (title: string, kind: 'floor' | 'walls' | 'lighting', list: StyleOption[]): void => {
    out.push(h('div', { class: 'bp-sub small', text: title }));
    const grid = h('div', { class: 'bp-grid' });
    for (const o of list) {
      const current = currentStyle(loc.lot, kind, target) === o.id;
      const locked = (o.minLevel ?? 1) > s.companyLevel;
      const cost = styleChangeCost(loc.lot, kind, o.id, target);
      grid.appendChild(h('button', {
        class: `bp-item${current ? ' active' : ''}${locked ? ' locked' : ''}`,
        data: { style: `${kind}:${o.id}` },
        title: `${o.name} — quality tier ${o.tier}. ${money(o.costPerTile)}/m².`,
        disabled: current || locked,
        on: {
          click: async () => {
            if (cost >= s.settings.confirmBigSpend && !(await confirmDialog('Refit?', `${o.name} ${target === 'all' ? 'in every room' : `in the ${ZONE_BY_CODE[target].name.toLowerCase()}`}: ${money(cost)}.`, 'Refit'))) return;
            host.ctx.act(tracked(host, `Refit: ${o.name}`, () => setStyle(s, loc, kind, o.id, target)), { sound: 'buy' });
            host.after();
          },
        },
      }, h('span', { class: 'bp-swatch', style: `background:${o.color}` }, current ? '✓' : ''), h('span', { class: 'bp-name', text: o.name }),
      h('span', { class: 'bp-cost', text: current ? 'current' : locked ? `level ${o.minLevel}` : money(cost) })));
    }
    out.push(grid);
  };
  section('Floors', 'floor', FLOOR_STYLES);
  section('Walls', 'walls', WALL_STYLES);
  section('Ceilings & lighting', 'lighting', LIGHT_STYLES);
  return out;
}

function landBody(host: BuildHost, loc: Location): HTMLElement[] {
  const s = host.ctx.state;
  const out: HTMLElement[] = [];
  const next = nextPlot(s, loc);
  const city = CITY_BY_ID[loc.cityId];
  const tier = LAND_TIERS[loc.lot.landTier];
  out.push(h('div', { class: 'bp-card land-now' },
    h('div', { class: 'card-title', text: `${tier?.icon ?? ''} ${tier?.name ?? 'Your plot'} · ${loc.lot.w} × ${loc.lot.h} m` }),
    h('p', { class: 'tiny muted', text: `${loc.lot.w * loc.lot.h} m² in ${city.name}. Rent ${money(loc.rentMonthly)}/month (grows with plot size and indoor space).` })));
  if (next) {
    const newRent = rentFor(loc, next.w, next.h);
    const locked = s.companyLevel < next.minLevel;
    out.push(h('div', { class: 'bp-card land-next' },
      h('div', { class: 'card-title', text: `${next.icon} Expand to ${next.name}` }),
      h('p', { class: 'tiny muted', text: `${next.w} × ${next.h} m: +${next.w * next.h - loc.lot.w * loc.lot.h} m² behind and beside your lot. Everything you built stays where it is. Rent becomes about ${money(newRent)}/month.` }),
      h('p', { class: 'tiny', text: '🔒 The land for sale is shown on the map — tap it to expand from there too.' }),
      h('button', {
        class: 'btn primary block',
        data: { act: 'buy-land' },
        disabled: locked || s.cash < next.cost,
        on: {
          click: async () => {
            if (!(await confirmDialog(`Expand to ${next.name}?`, `${next.w} × ${next.h} m for ${money(next.cost)}. Rent goes up to about ${money(newRent)}/month.`, 'Buy land'))) return;
            host.buyLand();
          },
        },
      }, locked ? `Company level ${next.minLevel} needed` : `Expand dealership · ${money(next.cost)}`)));
  } else out.push(h('p', { class: 'empty', text: city.space !== undefined && loc.lot.landTier >= city.space ? `${city.name} has no bigger plots. Open another location to keep growing.` : 'You own the largest plot there is. Open another location to keep growing.' }));
  out.push(h('div', { class: 'bp-sub', text: 'Plot sizes' }));
  out.push(h('div', { class: 'bp-list' }, ...LAND_TIERS.map((t, i) => {
    const owned = i <= loc.lot.landTier;
    const beyond = city.space !== undefined && i > city.space;
    return h('div', { class: `bp-row${i === loc.lot.landTier ? ' active' : ''}${owned ? ' good' : ''}` },
      h('span', { text: `${t.icon} ${t.name}` }), h('span', { class: 'tiny muted', text: `${t.w} × ${t.h} m` }),
      h('span', { class: 'tiny', text: owned ? '✓ owned' : beyond ? 'not in this town' : `${money(Math.round(t.cost * (city.rent ?? 1500) / 1500))} · lv ${t.minLevel}` }));
  })));
  return out;
}

/** A room or area to paint. */
function zoneCard(host: BuildHost, z: (typeof ZONES)[number]): HTMLElement {
  const tool = host.tool();
  const active = tool.kind === 'paint' && tool.code === z.code;
  const uses = OBJECTS.filter((d) => !d.hidden && d.zones.includes(z.code) && d.zones.length <= 4).slice(0, 6).map((d) => d.name);
  return richTipped(h('button', {
    class: `bp-item${active ? ' active' : ''}`,
    data: { zone: z.code },
    on: { click: () => host.setTool({ kind: 'paint', code: z.code }) },
  }, h('span', { class: 'bp-swatch', style: `background:${z.color}` }, z.icon), h('span', { class: 'bp-name', text: z.name }), h('span', { class: 'bp-cost', text: `${money(z.costPerTile)}/m²` })),
  () => h('div', { class: 'info-card' }, h('div', { class: 'ic-title', text: z.name.toUpperCase() }), h('p', { class: 'ic-desc', text: z.description }),
    h('div', { class: 'ic-grid' }, h('div', {}, h('div', { class: 'ic-k', text: 'Cost' }), h('div', { text: `${money(z.costPerTile)}/m²${z.indoor ? ' + finishes' : ''}` })),
      h('div', {}, h('div', { class: 'ic-k', text: 'Customers' }), h('div', { text: z.customers ? 'Can walk here' : 'Staff only' }))),
    uses.length ? h('div', { class: 'ic-block' }, h('div', { class: 'ic-k', text: 'Made for' }), h('div', { class: 'ic-hint', text: uses.join(', ') })) : null), z.name);
}

/** Your cars, ready to be dragged onto the floor. */
function carShelf(host: BuildHost, loc: Location, only?: Vehicle[]): HTMLElement[] {
  const s = host.ctx.state;
  const cars = only ?? s.vehicles.filter((v) => v.locationId === loc.id && (v.status === 'yard' || v.status === 'listed'));
  if (!cars.length) return [h('div', { class: 'bp-hint', text: 'Your cars appear here to drag onto the floor once you have some in stock.' })];
  const tool = host.tool();
  const card = (v: Vehicle): HTMLElement => {
    const active = tool.kind === 'car' && tool.vehicleId === v.id;
    const el = h('button', {
      class: `bp-car${active ? ' active' : ''}`,
      data: { car: v.id },
      aria: { label: `Place ${vehicleName(v)}` },
      on: { click: () => host.setTool({ kind: 'car', vehicleId: v.id, rot: 0 }) },
    }, h('span', { class: 'mini-dot', style: `background:${v.colorHex}` }), h('span', { class: 'bp-car-name', text: vehicleName(v) }),
    h('span', { class: `tag ${v.status === 'listed' ? 'good' : 'warn'}`, text: v.status === 'listed' ? 'for sale' : 'not listed' }));
    el.addEventListener('pointerdown', (e) => { if (e.button === 0) host.paletteDrag(e, { vehicleId: v.id }); });
    return richTipped(el, () => vehicleInfo(s, loc, v), vehicleName(v));
  };
  return [h('div', { class: 'bp-sub', text: 'Your cars — drag one onto a display, a space or open floor' }), h('div', { class: 'bp-cars' }, ...cars.map(card))];
}

/** Runs a palette action through undo history. */
let tracker: (<T extends { ok: boolean }>(label: string, run: () => T) => T) | null = null;
export function setTracker(fn: <T extends { ok: boolean }>(label: string, run: () => T) => T): void {
  tracker = fn;
}
function tracked<T extends { ok: boolean }>(host: BuildHost, label: string, run: () => T): T {
  void host;
  return tracker ? tracker(label, run) : run();
}

/** The numbers that show what the layout does. */
export function buildStats(ctx: Ctx, loc: Location, onIssues: () => void): HTMLElement {
  const s = ctx.state;
  const ls = lotStats(loc.lot);
  const cap = siteCapacity(s, loc);
  const flows = siteFlows(loc);
  const id = dealershipIdentity(loc)[0];
  const chip = (label: string, value: string, tone = '', tip = ''): HTMLElement => h('div', { class: `bs-chip ${tone}`, title: tip }, h('span', { class: 'bs-k', text: label }), h('span', { class: 'bs-v', text: value }));
  const staff = staffAt(s, loc.id).length;
  return h('div', { class: 'build-stats' },
    chip('Spaces', `${occupying(s, loc.id)}/${capacityOf(loc)}`, occupying(s, loc.id) >= capacityOf(loc) ? 'warn' : '', 'Cars here / vehicle spaces built'),
    chip('Showroom', `${cap.showroom} · Lv ${ls.levels.showroom}`, '', 'Indoor display spaces and showroom level (displays, finishes, lighting, decor)'),
    chip('Parking', String(cap.parking), '', 'Outdoor spaces for cars on sale'),
    chip('Storage', String(cap.storage), '', 'Spaces out of sight'),
    chip('Customers', `${cap.customers}/day`, '', 'Visitors that can park each day'),
    chip('Service', `${cap.service} h/day`, cap.service ? '' : 'dim', 'Lift hours a day (upgraded lifts work faster)'),
    chip('Staff', `${staff}/${cap.staff}`, staff > cap.staff ? 'warn' : '', 'People / workstations'),
    chip('EV', String(cap.ev), cap.ev ? '' : 'dim', 'Charging points and EV spaces'),
    chip('Test drive', String(cap.testdrive), cap.testdrive ? '' : 'dim', 'Test-drive facilities'),
    chip('Flow', `${Math.round(ls.flow * 100)}%`, ls.flow >= 0.7 ? 'good' : ls.flow >= 0.45 ? 'warn' : 'bad', 'How easily customers reach your cars'),
    ...flows.map((f) => chip(f.icon, f.ok ? '✓' : '✕', f.ok ? 'good' : 'bad', `${f.name}: ${f.steps.map((st) => `${st.ok ? '✓' : '✕'} ${st.label}`).join(' → ')}`)),
    chip('Identity', `${id.icon} ${Math.round(id.share * 100)}%`, '', `Your building says: ${id.name}`),
    chip('Upkeep', `${money(ls.upkeep)}/mo`),
    ls.issues.length ? h('button', { class: 'bs-chip bad clickable', on: { click: onIssues } }, h('span', { class: 'bs-k', text: 'Problems' }), h('span', { class: 'bs-v', text: String(ls.issues.length) })) : chip('Layout', 'OK', 'good'));
}
