/**
 * The extra vehicle filters shared by Inventory and Market: gearbox, age,
 * mileage and condition. Kept per screen so each remembers its own choices.
 */
import type { Vehicle } from '../sim/types';
import { h } from './dom';
import { knownCondition } from '../sim/market';

export interface ExtraFilters { gearbox: string; year: string; mileage: string; condition: string }

export function emptyFilters(): ExtraFilters {
  return { gearbox: '', year: '', mileage: '', condition: '' };
}

export function extraFilterControls(f: ExtraFilters, onChange: () => void): HTMLElement[] {
  const sel = (label: string, key: keyof ExtraFilters, options: [string, string][]): HTMLElement => {
    const el = h('select', { aria: { label } }, ...options.map(([v, l]) => h('option', { value: v, selected: f[key] === v }, l)));
    el.addEventListener('change', () => { f[key] = el.value; onChange(); });
    return el;
  };
  return [
    sel('Gearbox', 'gearbox', [['', 'Any gearbox'], ['Manual', 'Manual'], ['Automatic', 'Automatic']]),
    sel('Year', 'year', [['', 'Any year'], ['2022', '2022 or newer'], ['2018', '2018 or newer'], ['2014', '2014 or newer'], ['2008', '2008 or newer']]),
    sel('Mileage', 'mileage', [['', 'Any mileage'], ['50000', 'Under 50,000 km'], ['100000', 'Under 100,000 km'], ['150000', 'Under 150,000 km'], ['200000', 'Under 200,000 km']]),
    sel('Condition', 'condition', [['', 'Any condition'], ['60', 'Fair or better'], ['74', 'Good or better'], ['88', 'Excellent']]),
  ];
}

export function passesExtra(v: Vehicle, f: ExtraFilters): boolean {
  if (f.gearbox && v.transmission !== f.gearbox) return false;
  if (f.year && v.year < Number(f.year)) return false;
  if (f.mileage && v.mileage >= Number(f.mileage)) return false;
  if (f.condition && knownCondition(v) < Number(f.condition)) return false;
  return true;
}

const openState: Record<string, boolean> = {};

/** On phones the filter selects fold away behind one button; search stays visible. */
export function collapsibleToolbar(key: string, toolbar: HTMLElement, activeCount: number): HTMLElement {
  toolbar.classList.add('collapsible');
  toolbar.classList.toggle('open', !!openState[key]);
  const btn = h('button', {
    class: `btn filter-toggle${activeCount ? ' primary' : ''}`,
    aria: { expanded: String(!!openState[key]) },
    on: {
      click: () => {
        openState[key] = !openState[key];
        toolbar.classList.toggle('open', openState[key]);
        btn.setAttribute('aria-expanded', String(openState[key]));
      },
    },
  }, activeCount ? `Filters (${activeCount})` : 'Filters');
  toolbar.insertBefore(btn, toolbar.children[1] ?? null);
  return toolbar;
}

export function activeExtra(f: ExtraFilters): number {
  return Object.values(f).filter(Boolean).length;
}
