/**
 * Build-menu categories. An item can belong to several categories: they are
 * rules over the item data (what it holds, who works there, what it does),
 * not a fixed label, so a new item shows up everywhere it belongs.
 */
import type { ObjDef } from './lot';
import { ZONE_BY_CODE } from './lot';

export type BuildTabId =
  | 'all' | 'zones' | 'structure' | 'showroom' | 'vehicles' | 'customers' | 'staff' | 'service' | 'finance' | 'marketing'
  | 'storage' | 'decoration' | 'exterior' | 'parking' | 'ev' | 'technology' | 'security' | 'premium' | 'testdrive'
  | 'style' | 'land' | 'templates';

export interface BuildTab {
  id: BuildTabId;
  name: string;
  icon: string;
  /** Short explanation for the tab tooltip. */
  hint: string;
  /** Which items the tab lists. Tabs without a rule are panels (rooms, finishes, land, templates). */
  test?: (d: ObjDef) => boolean;
}

const tags = (d: ObjDef, ...words: string[]): boolean => (d.tags ?? []).some((t) => words.includes(t));
const fx = (d: ObjDef, ...keys: string[]): boolean => keys.some((k) => ((d.effects as Record<string, number> | undefined)?.[k] ?? 0) > 0);
const onlyOutdoor = (d: ObjDef): boolean => d.zones.every((z) => !ZONE_BY_CODE[z]?.indoor);
const inShowroom = (d: ObjDef): boolean => d.zones.includes('s');

export const BUILD_TABS: BuildTab[] = [
  { id: 'all', name: 'All', icon: '🗂️', hint: 'Every item you can place', test: () => true },
  { id: 'zones', name: 'Rooms', icon: '🏗️', hint: 'Paint rooms and areas, or drop a ready-made room' },
  { id: 'structure', name: 'Structure', icon: '🧱', hint: 'Walls, doors, windows, pillars and fences', test: (d) => d.category === 'structure' || !!d.line || tags(d, 'wall', 'door', 'window', 'entrance') },
  { id: 'showroom', name: 'Showroom', icon: '✨', hint: 'Displays, desks and anything that sells in the showroom', test: (d) => d.slot === 'display' || d.category === 'showroom' || (inShowroom(d) && fx(d, 'appeal')) },
  { id: 'vehicles', name: 'Vehicles', icon: '🚗', hint: 'Everything that holds a car — plus your own cars to drag onto the floor', test: (d) => !!d.slot },
  { id: 'customers', name: 'Customers', icon: '🧑‍🤝‍🧑', hint: 'Seating, drinks, toilets, reception and delivery: happier, more patient customers', test: (d) => d.category === 'customer' || fx(d, 'lounge', 'satisfaction', 'facilities', 'reception', 'visitorParking') },
  { id: 'staff', name: 'Staff', icon: '👥', hint: 'Workstations for every role and things that keep your team happy', test: (d) => d.category === 'staff' || d.category === 'office' || !!d.station || fx(d, 'morale', 'management', 'training') },
  { id: 'service', name: 'Service', icon: '🔧', hint: 'Workshop, detailing, diagnostics and parts', test: (d) => d.category === 'service' || fx(d, 'service', 'workshop', 'detailing', 'equipment') || d.slot === 'lift' || d.slot === 'bay' },
  { id: 'finance', name: 'Finance', icon: '🏦', hint: 'Finance desks and anything that lifts finance take-up', test: (d) => fx(d, 'finance') || (d.station ?? []).some((r) => r === 'finance' || r === 'accountant') || tags(d, 'finance', 'loan', 'lease', 'keys') },
  { id: 'marketing', name: 'Marketing', icon: '📣', hint: 'Signs, screens, flags and photography: more passers-by and leads', test: (d) => d.category === 'marketing' || fx(d, 'footfall', 'curb', 'photo', 'marketing') && !tags(d, 'green') || tags(d, 'marketing', 'branding', 'advert', 'reclame', 'logo') },
  { id: 'storage', name: 'Storage', icon: '📦', hint: 'Hidden car storage, parts shelving and cabinets', test: (d) => d.category === 'storage' || d.slot === 'storage' || tags(d, 'storage', 'cabinet', 'parts', 'kast') || d.zones.every((z) => z === 'p' || z === 't') },
  { id: 'decoration', name: 'Decoration', icon: '🪴', hint: 'Plants, art, lighting, rugs and branding: decor and appeal', test: (d) => d.category === 'decoration' || (fx(d, 'decor', 'lighting') && !d.slot && !d.station) },
  { id: 'exterior', name: 'Exterior', icon: '🌳', hint: 'Everything that stands outside: gates, signs, lighting, greenery', test: (d) => d.category === 'outdoor' || onlyOutdoor(d) || tags(d, 'road', 'infrastructure') },
  { id: 'parking', name: 'Parking', icon: '🅿️', hint: 'Car spaces for sale, storage and visitor parking', test: (d) => d.category === 'parking' || d.slot === 'parking' || d.slot === 'storage' || fx(d, 'visitorParking') || tags(d, 'parking') },
  { id: 'ev', name: 'EV', icon: '⚡', hint: 'Chargers, EV displays and EV diagnostics', test: (d) => d.category === 'ev' || fx(d, 'ev') || tags(d, 'electric', 'ev', 'charger', 'charging') },
  { id: 'technology', name: 'Technology', icon: '🖥️', hint: 'Computers, screens, diagnostics and systems', test: (d) => d.category === 'technology' || tags(d, 'computer', 'technology', 'screen', 'diagnostics', 'crm', 'it', 'software', 'cctv', 'sensor') || fx(d, 'equipment') },
  { id: 'security', name: 'Security', icon: '🛡️', hint: 'Cameras, alarms, lighting, barriers and guards: lower insurance and theft risk', test: (d) => d.category === 'security' || fx(d, 'security') },
  { id: 'premium', name: 'Premium', icon: '💎', hint: 'High-end items for luxury and prestige buyers', test: (d) => d.category === 'premium' || tags(d, 'luxury', 'premium', 'vip', 'hero') || d.spot?.fit === 'premium' || ((d.minLevel ?? 1) >= 3) || (d.cost >= 7000 && !d.slot) },
  { id: 'testdrive', name: 'Test drive', icon: '🗝️', hint: 'Test-drive exits, bays, check-in, lanes and signs: better test drives and more routes', test: (d) => d.category === 'testdrive' || fx(d, 'testdrive') },
  { id: 'style', name: 'Style & focus', icon: '🎨', hint: 'Dealership style, specialisation, floors, walls and ceilings' },
  { id: 'land', name: 'Land', icon: '🗺️', hint: 'Expand your plot: Starter → Medium → Large → Mega → Automotive Complex' },
  { id: 'templates', name: 'Templates', icon: '📐', hint: 'Place ready-made rooms and areas, or rebuild the whole lot' },
];

export const BUILD_TAB_BY_ID = Object.fromEntries(BUILD_TABS.map((t) => [t.id, t])) as Record<BuildTabId, BuildTab>;

/** Names of the item tabs an item belongs to (for tooltips and search). */
export function tabsOf(d: ObjDef): string[] {
  return BUILD_TABS.filter((t) => t.test && t.id !== 'all' && t.test(d)).map((t) => t.name);
}

/** The panels that are not item lists. */
export const PANEL_TABS: BuildTabId[] = ['zones', 'style', 'land', 'templates'];

/** Old saved tab ids from earlier versions map onto the new tabs. */
export const LEGACY_TAB: Record<string, BuildTabId> = { office: 'staff', customer: 'customers', outdoor: 'exterior' };
