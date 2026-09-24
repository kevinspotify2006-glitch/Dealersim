import type { Ctx, View } from '../app';
import { confirmDialog, h, table } from '../dom';
import { money, moneySigned } from '../../sim/format';
import { ARCHETYPE_BY_ID, CITIES, CITY_BY_ID } from '../../data/game';
import { closeLocation, maxLocations, openLocation } from '../../sim/progress';
import { capacityOf, occupying, staffAt } from '../../sim/state';
import { competitorPressure } from '../../sim/world';
import { expectedLeads } from '../../sim/customers';
import { pageHead, panel, panelTitle, tipped } from '../kit';
import type { ArchetypeId } from '../../sim/types';

export function expansionView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const max = maxLocations(s);
  view.appendChild(pageHead('Expansion', `${s.locations.length} of ${max} location${max === 1 ? '' : 's'} allowed at company level ${s.companyLevel}`));

  view.appendChild(panel(panelTitle('Your dealerships'), table(['Location', 'Stock', 'Staff', 'Reputation', 'Customers/day', 'Month revenue', 'Month profit', 'Rent', ''], s.locations.map((l) => [
    h('div', {}, h('div', { class: 'cell-person-name', text: l.name }), h('div', { class: 'tiny muted', text: CITY_BY_ID[l.cityId]?.region ?? '' })),
    h('span', { class: 'num', text: `${occupying(s, l.id)}/${capacityOf(l)}` }),
    h('span', { class: 'num', text: String(staffAt(s, l.id).length) }),
    h('span', { class: 'num', text: String(Math.round(l.reputation)) }),
    h('span', { class: 'num', text: expectedLeads(s, l).total.toFixed(1) }),
    h('span', { class: 'num', text: money(l.month.revenue) }),
    h('span', { class: `num ${l.month.profit >= 0 ? 'good' : 'bad'}`, text: moneySigned(l.month.profit) }),
    h('span', { class: 'num', text: money(l.rentMonthly) }),
    h('div', { class: 'btn-row' },
      h('button', { class: `btn small${l.id === s.activeLocationId ? ' primary' : ''}`, on: { click: () => { s.activeLocationId = l.id; ctx.go('dealership'); } } }, l.id === s.activeLocationId ? 'Managing' : 'Manage'),
      s.locations.length > 1 ? h('button', {
        class: 'btn small danger', on: {
          click: async () => {
            if (await confirmDialog(`Close ${l.name}?`, 'The premises and fittings are sold for part of what you paid. All vehicles and staff must be moved first.', 'Close dealership', true)) ctx.act(closeLocation(s, l.id));
          },
        },
      }, 'Close') : null),
  ]))));

  const grid = h('div', { class: 'grid cols-3' });
  for (const c of CITIES) {
    const mine = s.locations.find((l) => l.cityId === c.id);
    const mix = Object.entries(c.mix).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 3).map(([k]) => ARCHETYPE_BY_ID[k as ArchetypeId]?.name).filter(Boolean);
    const blocked = !!mine || s.locations.length >= max || s.cash < c.openCost;
    grid.appendChild(h('article', { class: `card city${mine ? ' owned' : ''}` },
      h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title', text: c.name }), h('div', { class: 'card-sub', text: c.region })),
        h('span', { class: `tag ${c.difficulty === 'Easy' ? 'good' : c.difficulty === 'Medium' ? 'info' : c.difficulty === 'Hard' ? 'warn' : 'bad'}`, text: c.difficulty })),
      h('p', { class: 'tiny muted', text: c.blurb }),
      h('div', { class: 'spec-grid two' },
        spec('Demand', `×${c.demand.toFixed(2)}`),
        spec('Wealth', `×${c.wealth.toFixed(2)}`),
        tipped(spec('Competition', `${Math.round((mine ? competitorPressure(s, c.id) : c.competition) * 100)}%`), 'How much of the local market rival dealers hold.'),
        spec('Rent', `${money(c.rent)}/mo`),
        spec('Opening cost', c.openCost ? money(c.openCost) : '—'),
        spec('Buyers', mix.length ? mix.join(', ') : 'Mixed')),
      mine ? h('span', { class: 'tag good', text: 'You trade here' }) : h('button', {
        class: `btn block ${blocked ? '' : 'primary'}`,
        disabled: blocked,
        on: {
          click: async () => {
            if (await confirmDialog(`Open in ${c.name}?`, `Opening costs ${money(c.openCost)} and ${money(c.rent)} rent per month. You will need to stock and staff it.`, 'Open dealership')) {
              ctx.act(openLocation(s, c.id), { sound: 'buy', money: -c.openCost });
            }
          },
        },
      }, s.locations.length >= max ? `Needs a higher company level` : s.cash < c.openCost ? `Need ${money(c.openCost)}` : `Open for ${money(c.openCost)}`)));
  }
  view.appendChild(panel(panelTitle('New locations', h('span', { class: 'sub', text: 'each town has its own buyers, rivals and rent' })), grid));
  return { el: view };
}

function spec(label: string, value: string): HTMLElement {
  return h('div', { class: 'spec' }, h('span', { class: 'spec-label', text: label }), h('span', { class: 'spec-value', text: value }));
}
