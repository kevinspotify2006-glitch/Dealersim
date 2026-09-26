/**
 * Explanations built from the game data: what a build item does, what a car
 * is worth to you, what a model is. Used by tooltips, the build menu and the
 * selection cards, so there is one source of truth.
 */
import type { GameState, Location, LotObject, Vehicle } from '../../sim/types';
import { h } from '../dom';
import { money } from '../../sim/format';
import { EFFECTS, OBJ_BY_ID, ZONE_BY_CODE } from '../../data/lot';
import type { EffectKey, ObjDef } from '../../data/lot';
import { ROLE_BY_ID } from '../../data/game';
import { tabsOf } from '../../data/buildcats';
import { footprint, spotBonus } from '../../sim/lot';
import { modelProfile } from '../../sim/catalog';
import type { ModelProfile } from '../../sim/catalog';
import { demandScore, suggestedPrice, totalCost } from '../../sim/market';
import { vehicleName } from '../../sim/state';

const SLOT_TEXT: Record<string, string> = {
  parking: 'Holds 1 car for sale (customers can see it) · +1 space',
  display: 'Holds 1 car for sale indoors · +1 space',
  storage: 'Holds 1 car out of sight · +1 space',
  lift: 'Holds 1 car being repaired',
  bay: 'Holds 1 car being cleaned',
  floor: 'A car parked by hand',
};

/** "+8% sales efficiency" style lines for an object's effects. */
export function effectLines(def: ObjDef): { text: string; hint: string }[] {
  const out: { text: string; hint: string }[] = [];
  for (const [k, v] of Object.entries(def.effects ?? {}) as [EffectKey, number][]) {
    if (!v) continue;
    const e = EFFECTS[k];
    const amount = k === 'sales' ? `+${v}%` : `+${Math.round(v * 100) / 100}`;
    out.push({ text: `${amount} ${e.label.toLowerCase()}`, hint: e.per + (e.cap ? ` (counts up to ${e.cap})` : '') });
  }
  if (def.spot && def.spot.attention) {
    const fit = def.spot.fit === 'premium' ? ' for premium & luxury cars' : def.spot.fit === 'ev' ? ' for electric cars' : def.spot.fit === 'budget' ? ' for cars under €12k' : '';
    out.push({ text: `+${def.spot.attention}% customer attention${fit}`, hint: 'Customers notice a car here first and are more likely to pick it.' });
    if (def.spot.wtp) out.push({ text: `+${Math.round(def.spot.wtp * 1000) / 10}% on the price buyers accept${fit}`, hint: 'Willingness to pay when the car suits the spot.' });
  }
  return out;
}

export function capacityText(def: ObjDef): string {
  if (def.slot) return SLOT_TEXT[def.slot] ?? '';
  if (def.station) return `Workstation for 1 ${def.station.map((r) => ROLE_BY_ID[r].name.toLowerCase()).join(' or ')}`;
  if (def.effects?.visitorParking) return `Parking for ${def.effects.visitorParking * 4} visiting customers a day`;
  return '';
}

/** The full tooltip / card for a build item. */
export function objectInfo(state: GameState, def: ObjDef, placed?: { loc: Location; o: LotObject }): HTMLElement {
  const locked = (def.minLevel ?? 1) > state.companyLevel;
  const el = h('div', { class: 'info-card' },
    h('div', { class: 'ic-head' }, h('span', { class: 'ic-icon', text: def.icon }), h('div', {}, h('div', { class: 'ic-title', text: def.name.toUpperCase() }), h('div', { class: 'ic-sub', text: `${tabsOf(def).slice(0, 4).join(' · ') || def.category} · ${def.w}×${def.h} m${def.line ? ' · drawn in lines' : ''}` }))),
    h('p', { class: 'ic-desc', text: def.description }));
  const fx = effectLines(def);
  if (fx.length) el.appendChild(h('div', { class: 'ic-block' }, h('div', { class: 'ic-k', text: 'Effects' }), ...fx.map((f) => h('div', { class: 'ic-fx' }, h('span', { class: 'good', text: f.text }), h('span', { class: 'ic-hint', text: f.hint })))));
  const cap = [capacityText(def), def.capacity].filter(Boolean).join(' · ');
  if (cap) el.appendChild(h('div', { class: 'ic-block' }, h('div', { class: 'ic-k', text: 'Capacity' }), h('div', { text: cap })));
  if (def.synergy) el.appendChild(h('div', { class: 'ic-block' }, h('div', { class: 'ic-k', text: 'Synergy' }), h('div', { class: 'good', text: def.synergy.text }),
    h('div', { class: 'ic-hint', text: `With: ${def.synergy.near.map((id) => OBJ_BY_ID[id]?.name ?? id).join(', ')}` })));
  const users = def.station ? def.station.map((r) => ROLE_BY_ID[r]?.name ?? r).join(', ') : def.slot ? 'Cars (placed by you or your staff)' : '';
  if (users || def.audience) el.appendChild(h('div', { class: 'ic-grid' },
    users ? h('div', {}, h('div', { class: 'ic-k', text: 'Used by' }), h('div', { text: users })) : null,
    def.audience ? h('div', {}, h('div', { class: 'ic-k', text: 'Matters to' }), h('div', { text: def.audience })) : null));
  el.appendChild(h('div', { class: 'ic-grid' },
    h('div', {}, h('div', { class: 'ic-k', text: 'Cost' }), h('div', { text: money(def.cost) })),
    h('div', {}, h('div', { class: 'ic-k', text: 'Upkeep' }), h('div', { text: `${money(def.upkeep)}/month` })),
    def.power ? h('div', {}, h('div', { class: 'ic-k', text: 'Power' }), h('div', { text: `${money(def.power)}/day` })) : null,
    h('div', {}, h('div', { class: 'ic-k', text: 'Required' }), h('div', { class: locked ? 'bad' : '', text: def.minLevel && def.minLevel > 1 ? `Company level ${def.minLevel}` : 'Nothing' }))));
  el.appendChild(h('div', { class: 'ic-block' }, h('div', { class: 'ic-k', text: 'Placement' }),
    h('div', { class: 'ic-hint', text: `${def.edge === 'road' ? 'Must touch the street. ' : def.edge === 'boundary' ? 'On the edge of a room. ' : ''}${def.spot?.frontRow ? 'Within 7 m of the street. ' : ''}In: ${def.zones.map((z) => ZONE_BY_CODE[z].name).join(', ')}.` })));
  if (placed) {
    const f = footprint(placed.o);
    const user = state.employees.find((e) => e.stationId === placed.o.id);
    const car = state.vehicles.find((v) => v.slotId === placed.o.id && v.status !== 'sold');
    el.appendChild(h('div', { class: 'ic-grid' },
      h('div', {}, h('div', { class: 'ic-k', text: 'Position' }), h('div', { text: `X ${f.x} · Y ${f.y}` })),
      h('div', {}, h('div', { class: 'ic-k', text: 'Rotation' }), h('div', { text: `${placed.o.rot ? 90 : 0}°` })),
      def.station ? h('div', {}, h('div', { class: 'ic-k', text: 'Used by' }), h('div', { text: user ? user.name : 'Nobody yet' })) : null,
      def.slot ? h('div', {}, h('div', { class: 'ic-k', text: 'Holds' }), h('div', { text: car ? vehicleName(car) : 'Empty' })) : null));
  }
  return el;
}

/** Tooltip for a car standing on the lot. */
export function vehicleInfo(state: GameState, loc: Location, v: Vehicle): HTMLElement {
  const p = modelProfile(state, v.modelId);
  const cost = totalCost(v);
  const price = v.askingPrice || suggestedPrice(state, v);
  const spot = spotBonus(loc, v);
  const el = h('div', { class: 'info-card' },
    h('div', { class: 'ic-head' }, h('span', { class: 'ic-icon', text: '🚗' }), h('div', {}, h('div', { class: 'ic-title', text: `${v.brand} ${v.model}`.toUpperCase() }), h('div', { class: 'ic-sub', text: `${v.year} · ${p?.type ?? v.body} · ${p?.segment ?? v.category}` }))));
  el.appendChild(h('div', { class: 'ic-grid' },
    h('div', {}, h('div', { class: 'ic-k', text: 'Demand' }), h('div', { text: `${Math.round(demandScore(state, v) * 100)} / 100` })),
    h('div', {}, h('div', { class: 'ic-k', text: 'Popularity' }), h('div', { text: `${Math.round(v.popularity * 100)}` })),
    h('div', {}, h('div', { class: 'ic-k', text: v.askingPrice ? 'Asking' : 'Suggested' }), h('div', { text: money(price) })),
    h('div', {}, h('div', { class: 'ic-k', text: 'Expected margin' }), h('div', { class: price - cost >= 0 ? 'good' : 'bad', text: money(price - cost) }))));
  if (p?.customerSegments.length) el.appendChild(h('div', { class: 'ic-block' }, h('div', { class: 'ic-k', text: 'Target customers' }), h('div', { text: p.customerSegments.map((c) => c.name).join(' / ') })));
  if (spot.label) el.appendChild(h('div', { class: 'ic-block' }, h('div', { class: 'ic-k', text: 'Where it stands' }), h('div', { text: `${spot.label}${spot.attention ? ` · +${spot.attention}% attention` : ''}${spot.wtp ? ` · +${Math.round(spot.wtp * 1000) / 10}% price` : ''}` })));
  el.appendChild(h('div', { class: 'ic-hint', text: v.status === 'listed' ? 'Drag it to another spot. Premium cars earn more on premium displays, EVs next to chargers.' : v.status === 'yard' ? 'Not for sale yet. Tap it to list it, or drag it to a space.' : 'Booked in for work.' }));
  return el;
}

/** Card for a model in the catalogue. */
export function modelInfo(p: ModelProfile): HTMLElement {
  const meter = (label: string, value: number): HTMLElement => h('div', { class: 'ic-meter' }, h('span', { class: 'ic-k', text: label }), h('span', { class: 'ic-bar' }, h('i', { style: `width:${value}%` })), h('span', { class: 'ic-num', text: String(value) }));
  return h('div', { class: 'info-card' },
    h('div', { class: 'ic-head' }, h('div', {}, h('div', { class: 'ic-title', text: `${p.brand} ${p.model}`.toUpperCase() }), h('div', { class: 'ic-sub', text: `${p.type} · ${p.segment} · ${p.fuels.join('/')}` }))),
    h('div', { class: 'ic-grid' },
      h('div', {}, h('div', { class: 'ic-k', text: 'Purchase (typical)' }), h('div', { text: money(p.purchasePrice) })),
      h('div', {}, h('div', { class: 'ic-k', text: 'Expected sale' }), h('div', { text: money(p.salePrice) })),
      h('div', {}, h('div', { class: 'ic-k', text: 'Estimated margin' }), h('div', { class: p.margin >= 0 ? 'good' : 'bad', text: money(p.margin) })),
      h('div', {}, h('div', { class: 'ic-k', text: 'Demand' }), h('div', { text: p.demandLabel }))),
    meter('Popularity', p.popularity), meter('Performance', p.performance), meter('Luxury', p.luxury), meter('Reliability', p.reliability), meter('Brand reputation', p.brandReputation),
    p.customerSegments.length ? h('div', { class: 'ic-block' }, h('div', { class: 'ic-k', text: 'Customer segments' }), h('div', { text: p.customerSegments.map((c) => `${c.icon} ${c.name}`).join(' · ') })) : null,
    h('div', { class: 'ic-hint', text: `Typical example: ${p.typicalYear}, ${Math.round(p.typicalMileage / 1000)}k km.` }));
}

export function objDefOf(o: LotObject | undefined): ObjDef | undefined {
  return o ? OBJ_BY_ID[o.defId] : undefined;
}
