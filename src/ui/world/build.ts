/**
 * Build mode: the dealership editor's palette — rooms, every placeable item
 * (searchable and filterable, with tooltips built from the game data), your
 * cars to drag onto the floor, finishes per room, land and templates — and
 * the strip of numbers that tells you what the layout does.
 */
import type { Ctx } from '../app';
import type { GameState, Location, Vehicle, ZoneCode } from '../../sim/types';
import { confirmDialog, h } from '../dom';
import { icon } from '../icons';
import { money } from '../../sim/format';
import { EFFECTS, FLOOR_STYLES, LAND_TIERS, LIGHT_STYLES, OBJECTS, WALL_STYLES, ZONES, ZONE_BY_CODE } from '../../data/lot';
import type { EffectKey, ObjDef, StyleOption } from '../../data/lot';
import { QUICK_ROOMS, TEMPLATES, applyTemplate, buildQuickRoom, buyLand, currentStyle, lotStats, nextLandTier, quickRoomCost, rentFor, setStyle, styleChangeCost, templateCost } from '../../sim/lot';
import type { StyleTarget } from '../../sim/lot';
import { CITY_BY_ID, ROLE_BY_ID } from '../../data/game';
import { BRAND_BY_ID } from '../../data/vehicles';
import { BUILD_TABS, BUILD_TAB_BY_ID, LEGACY_TAB, PANEL_TABS, tabsOf } from '../../data/buildcats';
import type { BuildTabId } from '../../data/buildcats';
import { capacityOf, occupying, staffAt, vehicleName } from '../../sim/state';
import { helpButton, richTipped } from '../kit';
import { effectLines, objectInfo, vehicleInfo } from './info';
import { canRedo, canUndo, redoLabel, undoLabel } from './history';

export type Tool =
  | { kind: 'select' }
  | { kind: 'place'; defId: string; rot: 0 | 1; x?: number; y?: number; line?: { x0: number; y0: number; x1: number; y1: number } }
  | { kind: 'move'; objId: string; defId: string; rot: 0 | 1; x: number; y: number; grab?: { dx: number; dy: number }; dragging?: boolean }
  | { kind: 'paint'; code: ZoneCode; start?: { x: number; y: number }; end?: { x: number; y: number } }
  | { kind: 'car'; vehicleId: string; rot: 0 | 1; cx?: number; cy?: number; dragging?: boolean };

export type Filter = 'all' | 'unlocked' | 'cheap' | 'expensive' | 'small' | 'large' | 'impact' | 'showroom' | 'service' | 'customer' | 'staff' | 'decoration' | 'vehicle';

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
}

const FILTERS: { id: Filter; label: string; title: string }[] = [
  { id: 'all', label: 'All', title: 'Everything in this category' },
  { id: 'unlocked', label: 'Unlocked', title: 'Only what your company level allows' },
  { id: 'cheap', label: 'Cheap', title: 'Up to €500' },
  { id: 'expensive', label: 'Expensive', title: '€5,000 and up' },
  { id: 'small', label: 'Small', title: 'Up to 2 m²' },
  { id: 'large', label: 'Large', title: '12 m² and up' },
  { id: 'impact', label: 'High impact', title: 'Holds a car, is a workstation, or has strong effects' },
  { id: 'showroom', label: 'Showroom', title: 'Works in or for the showroom' },
  { id: 'service', label: 'Service', title: 'Workshop, detailing, diagnostics and parts' },
  { id: 'customer', label: 'Customer', title: 'Makes customers happier or more patient' },
  { id: 'staff', label: 'Staff', title: 'Workstations and staff comfort' },
  { id: 'decoration', label: 'Decoration', title: 'Decor, lighting and branding' },
  { id: 'vehicle', label: 'Vehicle', title: 'Holds a car' },
];

const FILTER_TAB: Partial<Record<Filter, BuildTabId>> = { showroom: 'showroom', service: 'service', customer: 'customers', staff: 'staff', decoration: 'decoration', vehicle: 'vehicles' };

export function impactScore(def: ObjDef): number {
  let s = def.slot ? 3 : 0;
  if (def.station) s += 3;
  for (const [k, v] of Object.entries(def.effects ?? {}) as [EffectKey, number][]) s += k === 'sales' || k === 'satisfaction' ? v / 3 : v;
  return s;
}

export function matchesFilter(def: ObjDef, f: Filter, level: number): boolean {
  switch (f) {
    case 'all': return true;
    case 'unlocked': return (def.minLevel ?? 1) <= level;
    case 'cheap': return def.cost <= 500;
    case 'expensive': return def.cost >= 5000;
    case 'small': return def.w * def.h <= 2;
    case 'large': return def.w * def.h >= 12;
    case 'impact': return impactScore(def) >= 2.5;
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
  return OBJECTS.filter((d) => !d.hidden && (q || !tab?.test || tab.test(d)) && matchesSearch(d, q) && matchesFilter(d, f, level));
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

export function buildPalette(host: BuildHost): HTMLElement {
  const s = host.ctx.state;
  const loc = host.loc();
  const cat = host.category();
  const tool = host.tool();
  const root = h('div', { class: 'build-palette' });
  const tb = (id: string, label: string, ic: string, on: boolean, run: () => void, title: string, disabled = false): HTMLElement =>
    h('button', { class: `bp-tool${on ? ' active' : ''}`, data: { bt: id }, title, aria: { label: title, pressed: String(on) }, disabled, on: { click: run } }, icon(ic, 15), h('span', { text: label }));
  root.appendChild(h('div', { class: 'bp-head' },
    h('span', { class: 'bp-title' }, icon('hammer', 16), 'Build', helpButton('build')),
    h('span', { class: 'bp-cash', text: money(s.cash) }),
    h('button', { class: 'btn small primary', data: { bt: 'done' }, on: { click: host.done } }, icon('check', 14), 'Done')));
  root.appendChild(h('div', { class: 'bp-tools' },
    tb('select', 'Select', 'move', tool.kind === 'select', () => host.setTool({ kind: 'select' }), 'Select, drag, rotate, copy or delete what is built'),
    tb('undo', 'Undo', 'back', false, host.undo, canUndo(s) ? `Undo: ${undoLabel(s)} (Ctrl+Z)` : 'Nothing to undo', !canUndo(s)),
    tb('redo', 'Redo', 'next', false, host.redo, canRedo(s) ? `Redo: ${redoLabel(s)} (Ctrl+Y)` : 'Nothing to redo', !canRedo(s)),
    tb('grid', 'Grid', 'dashboard', host.grid(), host.toggleGrid, 'Show the 1 m grid (G)'),
    tb('snap', 'Snap', 'layers', host.snap(), host.toggleSnap, 'Snap: line things up against walls and drop cars into the nearest space'),
    tb('flow', 'Flow', 'customer', host.flow(), host.toggleFlow, 'Show where customers can walk')));

  // Search and filters: typing only redraws the list, so the field keeps focus.
  const search = h('input', { type: 'search', class: 'bp-search-input', placeholder: 'Search build items… (desk, parking, light, EV)', value: host.search(), aria: { label: 'Search build items' } });
  const listHost = h('div', { class: 'bp-body' });
  const filters = h('div', { class: 'bp-filters scroll-x' });
  const tabs = h('div', { class: 'bp-tabs', role: 'tablist' });
  const paintFilters = (): void => {
    filters.replaceChildren(...FILTERS.map((f) => h('button', { class: `bp-chip${host.filter() === f.id ? ' active' : ''}`, data: { filter: f.id }, title: f.title, on: { click: () => { host.setFilter(f.id); paintFilters(); paintList(); } } }, f.label)));
  };
  const paintList = (): void => {
    const scroll = listHost.scrollTop;
    listHost.replaceChildren(...body(host, host.category(), loc));
    listHost.scrollTop = scroll;
  };
  search.addEventListener('input', () => { host.setSearch(search.value); paintList(); });
  root.appendChild(h('div', { class: 'bp-search' }, icon('search', 14), search));
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
      on: { click: () => { host.setSearch(''); host.setCategory(t.id); } },
    }, h('span', { class: 'bp-tab-ic', text: t.icon }), h('span', { class: 'bp-tab-name', text: t.name }), t.test && t.id !== 'all' ? h('span', { class: 'bp-tab-n', text: String(count) }) : null));
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
  requestAnimationFrame(() => {
    const active = tabs.querySelector<HTMLElement>('.bp-tab.active');
    const hidden = active && (active.offsetLeft < tabs.scrollLeft || active.offsetLeft + active.offsetWidth > tabs.scrollLeft + tabs.clientWidth);
    if (active && hidden && tabs.scrollWidth > tabs.clientWidth) {
      const target = active.offsetLeft - (tabs.clientWidth - active.offsetWidth) / 2;
      tabs.scrollLeft = Math.max(0, target);
    }
    edges();
  });
  root.appendChild(tabWrap);
  root.appendChild(listHost);
  paintList();
  return root;
}

function itemCard(host: BuildHost, def: ObjDef): HTMLElement {
  const s = host.ctx.state;
  const tool = host.tool();
  const locked = (def.minLevel ?? 1) > s.companyLevel;
  const active = (tool.kind === 'place' || tool.kind === 'move') && tool.defId === def.id;
  const fx = effectLines(def)[0];
  const card = h('button', {
    class: `bp-item${active ? ' active' : ''}${locked ? ' locked' : ''}`,
    data: { obj: def.id },
    disabled: locked,
    aria: { label: `${def.name}, ${money(def.cost)}` },
    on: { click: () => host.setTool({ kind: 'place', defId: def.id, rot: 0 }) },
  }, h('span', { class: 'bp-swatch', style: `border-color:${def.color}` }, def.icon), h('span', { class: 'bp-name', text: def.name }),
  h('span', { class: 'bp-cost', text: locked ? `level ${def.minLevel}` : money(def.cost) }),
  h('span', { class: 'bp-eff', text: `${def.w}×${def.h}${def.line ? ' · line' : ''}${fx ? ` · ${fx.text}` : def.slot ? ' · +1 space' : def.station ? ` · ${def.station[0]} desk` : ''}` }));
  // Press and drag the card straight onto the map.
  card.addEventListener('pointerdown', (e) => { if (!locked && e.button === 0) host.paletteDrag(e, { defId: def.id }); });
  return richTipped(card, () => objectInfo(s, def), def.name);
}

function body(host: BuildHost, rawCat: string, loc: Location): HTMLElement[] {
  const s = host.ctx.state;
  const tool = host.tool();
  const out: HTMLElement[] = [];
  const q = host.search().trim();
  const f = host.filter();
  const cat = (LEGACY_TAB[rawCat] ?? (BUILD_TAB_BY_ID[rawCat as BuildTabId] ? rawCat : 'all')) as BuildTabId;
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
    if (cat === 'structure' && !q) out.push(h('div', { class: 'bp-hint', text: 'Walls, fences and hedges are drawn: pick one, then drag a straight line on the map. Rooms get their outer walls automatically — see Rooms. Floors, wall finishes and ceilings are under “Floors & ceilings”.' }));
    return out;
  }
  if (cat === 'zones') {
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
    const rooms = h('div', { class: 'bp-grid' });
    for (const [id, r] of Object.entries(QUICK_ROOMS)) {
      const cost = quickRoomCost(loc, id);
      rooms.appendChild(h('button', {
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
    out.push(rooms);
  } else if (cat === 'style') {
    const target = host.styleTarget();
    const rooms = ZONES.filter((z) => z.indoor && (lotStats(loc.lot).tiles[z.code] ?? 0) > 0);
    out.push(h('div', { class: 'bp-hint', text: 'Choose floors, wall finishes and ceiling lighting for every room at once, or per room. Better finishes in the showroom raise its level.' }));
    out.push(h('div', { class: 'bp-filters scroll-x' },
      h('button', { class: `bp-chip${target === 'all' ? ' active' : ''}`, data: { target: 'all' }, on: { click: () => host.setStyleTarget('all') } }, 'All rooms'),
      ...rooms.map((z) => h('button', { class: `bp-chip${target === z.code ? ' active' : ''}`, data: { target: z.code }, on: { click: () => host.setStyleTarget(z.code) } }, `${z.icon} ${z.name}`))));
    const section = (title: string, kind: 'floor' | 'walls' | 'lighting', list: StyleOption[]): void => {
      out.push(h('div', { class: 'bp-sub', text: title }));
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
  } else if (cat === 'land') {
    const next = nextLandTier(s, loc);
    const city = CITY_BY_ID[loc.cityId];
    out.push(h('div', { class: 'bp-hint', text: `You own ${loc.lot.w} × ${loc.lot.h} m (${loc.lot.w * loc.lot.h} m²) in ${city.name}. Rent is ${money(loc.rentMonthly)}/month and grows with the size of the plot and your indoor space.` }));
    if (next) {
      const cost = Math.round(next.cost * (city?.rent ?? 1500) / 1500);
      const newRent = rentFor(loc, next.w, next.h);
      const locked = s.companyLevel < next.minLevel;
      out.push(h('div', { class: 'bp-card' },
        h('div', { class: 'card-title', text: `Expand to ${next.w} × ${next.h} m` }),
        h('p', { class: 'tiny muted', text: `+${next.w * next.h - loc.lot.w * loc.lot.h} m² of bare land behind your lot. Rent becomes about ${money(newRent)}/month.` }),
        h('button', {
          class: 'btn primary block',
          disabled: locked || s.cash < cost,
          on: {
            click: async () => {
              if (!(await confirmDialog('Buy the land?', `Expand to ${next.w} × ${next.h} m for ${money(cost)}. Rent goes up to about ${money(newRent)}/month.`, 'Buy land'))) return;
              host.ctx.act(tracked(host, 'Buy land', () => buyLand(s, loc)), { sound: 'buy' });
              host.after();
            },
          },
        }, locked ? `Company level ${next.minLevel} needed` : `Buy land · ${money(cost)}`)));
    } else out.push(h('p', { class: 'empty', text: 'You own the largest plot available here. Open another location to keep growing.' }));
    out.push(h('div', { class: 'bp-sub', text: 'All plot sizes' }));
    out.push(h('div', { class: 'bp-list' }, ...LAND_TIERS.map((t, i) => h('div', { class: `bp-row${i === loc.lot.landTier ? ' active' : ''}` },
      h('span', { text: `${t.w} × ${t.h} m` }), h('span', { class: 'tiny muted', text: i <= loc.lot.landTier ? 'owned' : `level ${t.minLevel}` })))));
  } else if (cat === 'templates') {
    out.push(h('div', { class: 'bp-hint', text: 'Optional: replace the whole layout with a ready-made design. What is built now is sold for half its price. You can change everything afterwards — or ignore templates and build it your way.' }));
    const salvage = Math.round(loc.lot.objects.reduce((sum, o) => sum + (OBJECTS.find((d) => d.id === o.defId)?.cost ?? 0), 0) * 0.5);
    for (const t of TEMPLATES) {
      const cost = templateCost(t.id, loc.lot.landTier, s.companyLevel) - salvage;
      out.push(h('div', { class: 'bp-card' },
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
  }
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
  const chip = (label: string, value: string, tone = '', tip = ''): HTMLElement => h('div', { class: `bs-chip ${tone}`, title: tip }, h('span', { class: 'bs-k', text: label }), h('span', { class: 'bs-v', text: value }));
  const staff = staffAt(s, loc.id).length;
  const stations = ls.stations.sales.length + ls.stations.mechanic.length + ls.stations.detailer.length + ls.stations.office.length;
  return h('div', { class: 'build-stats' },
    chip('Spaces', `${occupying(s, loc.id)}/${capacityOf(loc)}`, occupying(s, loc.id) >= capacityOf(loc) ? 'warn' : '', 'Cars here / vehicle spaces built'),
    chip('Workstations', `${staff}/${stations}`, '', 'People / desks, lifts and bays'),
    chip('Showroom', `Lv ${ls.levels.showroom}`, '', 'From displays, finishes, lighting, windows and decor in the showroom'),
    chip('Workshop', `Lv ${ls.levels.workshop}`),
    chip('Lounge', `Lv ${ls.levels.lounge}`),
    chip('Flow', `${Math.round(ls.flow * 100)}%`, ls.flow >= 0.7 ? 'good' : ls.flow >= 0.45 ? 'warn' : 'bad', 'How easily customers reach your cars'),
    chip('Visitors', `${6 + Math.round((ls.effects.visitorParking ?? 0) * 4)}/day`, '', 'Visiting customers that can park'),
    chip('Upkeep', `${money(ls.upkeep)}/mo`),
    ls.issues.length ? h('button', { class: 'bs-chip bad clickable', on: { click: onIssues } }, h('span', { class: 'bs-k', text: 'Problems' }), h('span', { class: 'bs-v', text: String(ls.issues.length) })) : chip('Layout', 'OK', 'good'));
}
