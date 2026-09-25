/**
 * The service department: jobs customers bring in, and the parts they use.
 */
import type { PartId, ServiceTypeId } from '../sim/types';

export interface PartDef { id: PartId; name: string; icon: string; cost: number; price: number; days: [number, number]; min: number; description: string }

export const PARTS: PartDef[] = [
  { id: 'oil', name: 'Engine oil', icon: '🛢️', cost: 28, price: 55, days: [1, 1], min: 8, description: 'For services and oil changes.' },
  { id: 'filters', name: 'Filters', icon: '🧻', cost: 18, price: 38, days: [1, 2], min: 8, description: 'Oil, air and cabin filters.' },
  { id: 'tyres', name: 'Tyres', icon: '🛞', cost: 85, price: 135, days: [1, 2], min: 8, description: 'Sold in fours.' },
  { id: 'brakes', name: 'Brake kits', icon: '🛑', cost: 95, price: 170, days: [1, 2], min: 4, description: 'Discs and pads.' },
  { id: 'batteries', name: 'Batteries', icon: '🔋', cost: 90, price: 165, days: [1, 2], min: 3, description: '12-volt batteries for any car.' },
  { id: 'ev', name: 'EV components', icon: '⚡', cost: 240, price: 420, days: [2, 4], min: 2, description: 'Coolant pumps, contactors, charge ports.' },
  { id: 'body', name: 'Body panels & paint', icon: '🎨', cost: 160, price: 290, days: [2, 3], min: 2, description: 'Bumpers, wings, paint.' },
  { id: 'other', name: 'Other parts', icon: '🔩', cost: 60, price: 115, days: [1, 3], min: 6, description: 'Belts, bulbs, wipers, sensors.' },
];
export const PART_BY_ID = Object.fromEntries(PARTS.map((p) => [p.id, p])) as Record<PartId, PartDef>;

export interface ServiceTypeDef {
  id: ServiceTypeId;
  name: string;
  icon: string;
  hours: number;              // labour hours
  rate: number;               // labour price per hour
  parts: Partial<Record<PartId, number>>;
  weight: number;             // how common it is
  bay?: boolean;              // done in a detailing bay, not on a lift
  ev?: boolean;               // EV only (needs EV skills or EV diagnostics)
  skill: 'technical' | 'ev' | 'speed';
  description: string;
}

export const SERVICE_TYPES: ServiceTypeDef[] = [
  { id: 'maintenance', name: 'Maintenance service', icon: '🧰', hours: 2.5, rate: 85, parts: { oil: 1, filters: 2, other: 1 }, weight: 3, skill: 'technical', description: 'Scheduled service: fluids, filters and checks.' },
  { id: 'oil', name: 'Oil change', icon: '🛢️', hours: 1, rate: 75, parts: { oil: 1, filters: 1 }, weight: 2.5, skill: 'technical', description: 'Quick oil and filter change.' },
  { id: 'tyres', name: 'Tyre change', icon: '🛞', hours: 1, rate: 70, parts: { tyres: 4 }, weight: 2, skill: 'speed', description: 'Four new tyres, balanced and aligned.' },
  { id: 'brakes', name: 'Brake job', icon: '🛑', hours: 2, rate: 85, parts: { brakes: 1 }, weight: 1.4, skill: 'technical', description: 'Discs and pads.' },
  { id: 'diagnostics', name: 'Diagnostics', icon: '🩺', hours: 1.5, rate: 110, parts: {}, weight: 1, skill: 'technical', description: 'Finding a warning light\'s cause.' },
  { id: 'inspection', name: 'Roadworthiness test', icon: '📋', hours: 1, rate: 65, parts: { other: 1 }, weight: 1.8, skill: 'technical', description: 'Annual roadworthiness inspection (APK).' },
  { id: 'repair', name: 'Mechanical repair', icon: '⚙️', hours: 5, rate: 90, parts: { other: 3, batteries: 1 }, weight: 1, skill: 'technical', description: 'Clutches, suspension, starters.' },
  { id: 'body', name: 'Body repair', icon: '🎨', hours: 6, rate: 80, parts: { body: 2 }, weight: 0.7, skill: 'technical', description: 'Dents, bumpers and respray.' },
  { id: 'detailing', name: 'Valet & detailing', icon: '🧽', hours: 2.5, rate: 60, parts: {}, weight: 1.2, bay: true, skill: 'speed', description: 'Customer car valet in the detailing bay.' },
  { id: 'ev', name: 'EV service', icon: '⚡', hours: 3, rate: 120, parts: { ev: 1, filters: 1 }, weight: 0.9, ev: true, skill: 'ev', description: 'Battery health, coolant, high-voltage checks.' },
];
export const SERVICE_BY_ID = Object.fromEntries(SERVICE_TYPES.map((t) => [t.id, t])) as Record<ServiceTypeId, ServiceTypeDef>;
