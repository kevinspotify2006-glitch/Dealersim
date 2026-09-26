/**
 * Test-drive routes. You start with the Dealership Loop; the others unlock
 * through what you build (test-drive facilities, a bigger plot, a workshop,
 * a test-drive centre) and the direction you choose (performance, EV).
 */
import type { GameState, Location } from '../sim/types';
import type { Scenery, Step, TrackRecipe } from './track';
import { buildTrack } from './track';
import { lotStats, roomsOf } from '../sim/lot';

export interface RouteDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  requirement: string;
  recipe: TrackRecipe;
  /** Par time in seconds for a clean drive (for the time score). */
  par: number;
  unlocked: (state: GameState, loc: Location) => boolean;
}

const r = (seed: number, width: number, scenery: Scenery, steps: Step[], checkpoints?: string[]): TrackRecipe => ({ seed, width, scenery, steps, checkpoints });
const fx = (loc: Location): number => lotStats(loc.lot).effects.testdrive ?? 0;

export const ROUTES: RouteDef[] = [
  {
    id: 'loop', name: 'Dealership Loop', icon: '🏁', description: 'Out of the gate, a crossroads, a car park, a roundabout, a cone slalom and back.', requirement: 'Always open',
    par: 80,
    recipe: r(11, 9, 'town', [['S', 110], ['R', 22, 90], ['S', 100], ['X'], ['S', 100], ['L', 24, 90], ['P', 46], ['S', 70], ['O', 16], ['S', 90], ['R', 20, 90], ['C', 100], ['S', 40], ['R', 22, 90], ['S', 70]], ['Crossroads', 'Car park', 'Slalom']),
    unlocked: () => true,
  },
  {
    id: 'suburban', name: 'Suburban Route', icon: '🏡', description: 'Quiet streets with houses and trees, two crossroads and a long curve.', requirement: 'Medium plot or 2+ test-drive facilities',
    par: 85,
    recipe: r(23, 8, 'suburb', [['S', 80], ['L', 30, 60], ['S', 70], ['X'], ['S', 80], ['R', 40, 120], ['S', 60], ['X'], ['S', 70], ['L', 26, 90], ['S', 90], ['O', 14], ['S', 80], ['R', 30, 60], ['S', 60]], ['Main street', 'School zone', 'Roundabout']),
    unlocked: (_s, loc) => loc.lot.landTier >= 1 || fx(loc) >= 2,
  },
  {
    id: 'industrial', name: 'Industrial Route', icon: '🏭', description: 'Wide roads between warehouses, a depot car park and tight corners.', requirement: 'A workshop lift and 3+ test-drive facilities',
    par: 80,
    recipe: r(37, 10, 'industrial', [['S', 120], ['R', 16, 90], ['S', 80], ['P', 60], ['L', 16, 90], ['S', 110], ['X'], ['S', 80], ['R', 18, 90], ['C', 100], ['L', 20, 90], ['S', 90]], ['Loading bay', 'Depot', 'Slalom']),
    unlocked: (_s, loc) => lotStats(loc.lot).slots.lift.length > 0 && fx(loc) >= 3,
  },
  {
    id: 'highway', name: 'Highway Section', icon: '🛣️', description: 'An on-ramp, a fast motorway stretch with barriers and a sweeping exit.', requirement: 'Company level 3 or 4+ test-drive facilities',
    par: 75,
    recipe: r(41, 13, 'highway', [['S', 80], ['L', 60, 45], ['S', 220], ['R', 140, 40], ['S', 260], ['L', 120, 35], ['S', 200], ['R', 50, 60], ['S', 80]], ['On-ramp', 'Motorway', 'Exit']),
    unlocked: (s, loc) => s.companyLevel >= 3 || fx(loc) >= 4,
  },
  {
    id: 'scenic', name: 'Scenic Route', icon: '🌲', description: 'Winding through the woods past a lake. Smooth steering pays off.', requirement: '6+ test-drive facilities (exit, check-in, bays…)',
    par: 95,
    recipe: r(53, 8, 'scenic', [['S', 60], ['L', 40, 70], ['R', 35, 110], ['S', 60], ['L', 28, 120], ['R', 45, 80], ['S', 90], ['R', 30, 90], ['L', 50, 100], ['S', 70], ['R', 36, 60], ['S', 60]], ['Forest', 'Lakeside', 'Hilltop']),
    unlocked: (_s, loc) => fx(loc) >= 6,
  },
  {
    id: 'premium', name: 'Premium Route', icon: '💎', description: 'Past villas and a golf club: the drive luxury buyers expect.', requirement: 'A complete test-drive centre room',
    par: 90,
    recipe: r(67, 9, 'premium', [['S', 90], ['R', 36, 80], ['S', 80], ['O', 18], ['S', 90], ['L', 40, 100], ['S', 70], ['X'], ['S', 80], ['R', 30, 110], ['S', 90]], ['Villa lane', 'Golf club', 'Harbour']),
    unlocked: (_s, loc) => roomsOf(loc.lot).some((rm) => rm.code === 'q' && rm.complete),
  },
  {
    id: 'performance', name: 'Performance Route', icon: '🏎️', description: 'A closed handling circuit with a chicane, a hairpin and tyre walls.', requirement: 'Performance or sports focus',
    par: 70,
    recipe: r(79, 11, 'circuit', [['S', 140], ['R', 30, 90], ['C', 70], ['R', 14, 180], ['S', 120], ['L', 24, 90], ['S', 100], ['R', 40, 90], ['S', 90], ['L', 18, 120], ['S', 80]], ['Chicane', 'Hairpin', 'Back straight']),
    unlocked: (_s, loc) => loc.strategy === 'performance' || loc.strategy === 'sports',
  },
  {
    id: 'evroute', name: 'EV Route', icon: '⚡', description: 'Silent city streets with a stop at the fast charger.', requirement: 'EV focus or 3+ EV facilities',
    par: 85,
    recipe: r(97, 9, 'ev', [['S', 90], ['L', 26, 90], ['S', 80], ['X'], ['S', 70], ['R', 24, 90], ['P', 40], ['S', 70], ['O', 15], ['S', 90], ['L', 30, 90], ['S', 80]], ['City centre', 'Charging stop', 'Green quarter']),
    unlocked: (_s, loc) => loc.strategy === 'ev' || (lotStats(loc.lot).effects.ev ?? 0) >= 3,
  },
];
export const ROUTE_BY_ID = Object.fromEntries(ROUTES.map((x) => [x.id, x])) as Record<string, RouteDef>;

const lengthCache = new Map<string, number>();
export function routeLength(id: string): number {
  let v = lengthCache.get(id);
  if (v === undefined) {
    v = buildTrack(ROUTE_BY_ID[id].recipe).length;
    lengthCache.set(id, v);
  }
  return v;
}

export interface RouteStatus { id: string; name: string; icon: string; unlocked: boolean; requirement: string; length: string; description: string }

export function availableRoutes(state: GameState, loc: Location): RouteStatus[] {
  return ROUTES.map((rt) => ({
    id: rt.id, name: rt.name, icon: rt.icon, description: rt.description, requirement: rt.requirement,
    unlocked: rt.unlocked(state, loc),
    length: `${(routeLength(rt.id) / 1000).toFixed(2)} km`,
  }));
}
