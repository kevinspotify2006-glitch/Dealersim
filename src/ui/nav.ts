/**
 * Navigation structure (same two-level idea as Business Manager: a handful of
 * sections, the screens inside them).
 *
 * Desktop draws every screen in a grouped sidebar — a PC has the room and the
 * player benefits from seeing everything. Six sections: the dealership itself
 * and five hubs whose screens are tabs at the top, so every screen is one tap
 * to the section and one to the tab — on a phone as well.
 */
export interface NavSection {
  id: string;
  label: string;
  short?: string;
  icon: string;
  routes: string[];
}

export const SECTIONS: NavSection[] = [
  { id: 'dealership', label: 'Dealership', short: 'Dealer', icon: 'garage', routes: ['dealership'] },
  { id: 'inventory', label: 'Inventory', short: 'Inventory', icon: 'car', routes: ['inventory'] },
  { id: 'people', label: 'People', short: 'People', icon: 'people', routes: ['people'] },
  { id: 'service', label: 'Service', short: 'Service', icon: 'wrench', routes: ['service'] },
  { id: 'business', label: 'Business', short: 'Business', icon: 'report', routes: ['business'] },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: 'settings', routes: ['settings'] },
];

export function sectionOfRoute(route: string): NavSection | undefined {
  return SECTIONS.find((s) => s.routes.includes(route));
}
