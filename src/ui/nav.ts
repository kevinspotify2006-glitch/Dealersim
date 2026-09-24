/**
 * Navigation structure (same two-level idea as Business Manager: a handful of
 * sections, the screens inside them).
 *
 * Desktop draws every screen in a grouped sidebar — a PC has the room and the
 * player benefits from seeing everything. A phone gets five thumb-sized tabs
 * along the bottom; a tab with several screens raises a sheet.
 */
export interface NavSection {
  id: string;
  label: string;
  short?: string;
  icon: string;
  routes: string[];
}

export const SECTIONS: NavSection[] = [
  { id: 'dealership', label: 'Dealership', short: 'Dealership', icon: 'garage', routes: ['dealership'] },
  { id: 'market', label: 'Market', short: 'Market', icon: 'store', routes: ['market'] },
  { id: 'company', label: 'Company', short: 'Company', icon: 'trophy', routes: ['company'] },
  { id: 'reports', label: 'Reports', short: 'Reports', icon: 'report', routes: ['reports'] },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: 'settings', routes: ['settings'] },
];

export function sectionOfRoute(route: string): NavSection | undefined {
  return SECTIONS.find((s) => s.routes.includes(route));
}
