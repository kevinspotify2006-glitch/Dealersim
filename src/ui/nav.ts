/**
 * Navigation structure (same two-level idea as Business Manager: a handful of
 * sections, the screens inside them).
 *
 * Desktop draws every screen in a grouped sidebar — a PC has the room and the
 * player benefits from seeing everything. A phone gets six thumb-sized tabs
 * along the bottom; a tab with several screens raises a sheet, so every
 * screen is at most two taps away (three for a tab inside a screen).
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
  { id: 'market', label: 'Cars', short: 'Cars', icon: 'store', routes: ['market', 'stock'] },
  { id: 'business', label: 'Business', short: 'Business', icon: 'handshake', routes: ['retail', 'clients', 'service', 'staff', 'marketing', 'fleet'] },
  { id: 'growth', label: 'Growth', short: 'Growth', icon: 'progress', routes: ['missions', 'research', 'brands'] },
  { id: 'company', label: 'Company', short: 'Company', icon: 'trophy', routes: ['company', 'locations', 'group', 'rivals', 'identity'] },
  { id: 'reports', label: 'Reports & settings', short: 'Reports', icon: 'report', routes: ['reports', 'settings'] },
];

export function sectionOfRoute(route: string): NavSection | undefined {
  return SECTIONS.find((s) => s.routes.includes(route));
}
