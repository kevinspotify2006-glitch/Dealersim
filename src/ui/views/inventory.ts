import type { Ctx, View } from '../app';
import type { Vehicle } from '../../sim/types';
import { empty, h, icon, table } from '../dom';
import { money, moneySigned } from '../../sim/format';
import { bookValue, demandLabel, demandScore, knownCondition, marketMods, totalCost, suggestedPrice } from '../../sim/market';
import { carArt } from '../art';
import { activeLocation, capacityOf, locationName, occupying } from '../../sim/state';
import { listVehicle } from '../../sim/trading';
import { startPrep, canPrep } from '../../sim/vehicles';
import { conditionTag, demandTag, pageHead, riskTag, segmented, statusTag, helpButton, richTipped } from '../kit';
import { vehicleInfo } from '../world/info';
import { openVehicle } from '../modals/vehicle';
import { isPhone, isWide } from '../layout';
import { vehicleCard } from '../mobile/cards';
import { activeExtra, collapsibleToolbar, emptyFilters, extraFilterControls, passesExtra } from '../filters';

const extra = emptyFilters();
import { BODIES, FUELS, MANUFACTURERS } from '../../data/vehicles';

type StatusFilter = 'all' | 'yard' | 'prep' | 'listed' | 'transit';
const filters = { status: 'all' as StatusFilter, q: '', sort: 'days', make: '', fuel: '', body: '', loc: 'all' };

let layout: 'cards' | 'table' = 'cards';

export function inventoryView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const loc = activeLocation(s);
  view.appendChild(pageHead('Inventory', `${s.vehicles.length} vehicles · ${occupying(s, loc.id)}/${capacityOf(loc)} spaces at ${loc.name}`,
    helpButton('prep'),
    isWide() && ctx.params.compact !== '1' ? segmented<'cards' | 'table'>([{ value: 'cards', label: '▦ Cards' }, { value: 'table', label: '☰ Table' }], layout, (v) => { layout = v; ctx.refresh(); }) : null,
    h('button', { class: 'btn primary', on: { click: () => ctx.go('market') } }, icon('store', 15), 'Buy vehicles')));

  const counts = {
    all: s.vehicles.length,
    yard: s.vehicles.filter((v) => v.status === 'yard').length,
    prep: s.vehicles.filter((v) => v.status === 'prep').length,
    listed: s.vehicles.filter((v) => v.status === 'listed').length,
    transit: s.vehicles.filter((v) => v.status === 'transit' || v.status === 'transfer').length,
  };
  view.appendChild(segmented<StatusFilter>([
    { value: 'all', label: 'All', count: counts.all },
    { value: 'yard', label: 'In yard', count: counts.yard },
    { value: 'prep', label: 'In prep', count: counts.prep },
    { value: 'listed', label: 'On sale', count: counts.listed },
    { value: 'transit', label: 'Arriving', count: counts.transit },
  ], filters.status, (v) => { filters.status = v; ctx.refresh(); }, 'scroll-x'));

  const search = h('input', { type: 'search', placeholder: 'Search make, model, colour…', value: filters.q, aria: { label: 'Search inventory' } });
  search.addEventListener('input', () => { filters.q = search.value; renderList(); });
  const sel = (label: string, options: [string, string][], key: 'sort' | 'make' | 'fuel' | 'body' | 'loc'): HTMLElement => {
    const el = h('select', { aria: { label } }, ...options.map(([v, l]) => h('option', { value: v, selected: filters[key] === v }, l)));
    el.addEventListener('change', () => { filters[key] = el.value; renderList(); });
    return el;
  };
  const toolbar = h('div', { class: 'toolbar' },
    h('div', { class: 'search' }, icon('search', 15), search),
    sel('Sort', [['days', 'Days in stock'], ['price', 'Price'], ['profit', 'Margin'], ['demand', 'Demand'], ['mileage', 'Mileage'], ['year', 'Year'], ['condition', 'Condition']], 'sort'),
    sel('Make', [['', 'All makes'], ...MANUFACTURERS.map((m) => [m.id, m.name] as [string, string])], 'make'),
    sel('Fuel', [['', 'All fuels'], ...FUELS.map((f) => [f, f] as [string, string])], 'fuel'),
    sel('Body', [['', 'All bodies'], ...BODIES.map((b) => [b, b] as [string, string])], 'body'),
    s.locations.length > 1 ? sel('Location', [['all', 'All locations'], ...s.locations.map((l) => [l.id, l.name] as [string, string])], 'loc') : null,
    ...extraFilterControls(extra, () => renderList()),
  );
  view.appendChild(collapsibleToolbar('inventory', toolbar, activeExtra(extra) + (filters.make ? 1 : 0) + (filters.fuel ? 1 : 0) + (filters.body ? 1 : 0)));

  const host = h('div', { class: 'inv-host' });
  view.appendChild(host);
  const mods = marketMods(s);

  function renderList(): void {
    const q = filters.q.trim().toLowerCase();
    let list = s.vehicles.filter((v) => {
      if (filters.status === 'transit' ? !(v.status === 'transit' || v.status === 'transfer') : filters.status !== 'all' && v.status !== filters.status) return false;
      if (filters.make && v.brandId !== filters.make) return false;
      if (filters.fuel && v.fuel !== filters.fuel) return false;
      if (filters.body && v.body !== filters.body) return false;
      if (filters.loc !== 'all' && v.locationId !== filters.loc) return false;
      if (q && !`${v.year} ${v.brand} ${v.model} ${v.trim} ${v.color} ${v.category}`.toLowerCase().includes(q)) return false;
      return passesExtra(v, extra);
    });
    const margin = (v: Vehicle): number => (v.askingPrice || suggestedPrice(s, v, mods)) - totalCost(v);
    const sorters: Record<string, (a: Vehicle, b: Vehicle) => number> = {
      days: (a, b) => b.daysInStock - a.daysInStock,
      price: (a, b) => b.askingPrice - a.askingPrice,
      profit: (a, b) => margin(b) - margin(a),
      demand: (a, b) => demandScore(s, b, mods) - demandScore(s, a, mods),
      mileage: (a, b) => a.mileage - b.mileage,
      year: (a, b) => b.year - a.year,
      condition: (a, b) => knownCondition(b) - knownCondition(a),
    };
    list = list.sort(sorters[filters.sort] ?? sorters.days);
    host.replaceChildren();
    if (!s.vehicles.length) {
      host.appendChild(empty('Your lot is empty. Visit the Market to buy your next car.', { title: 'No vehicles in stock', icon: 'car', action: h('button', { class: 'btn primary', on: { click: () => ctx.go('market') } }, 'Go to the Market') }));
      return;
    }
    if (!list.length) {
      host.appendChild(empty('No vehicles match these filters.', { title: 'Nothing here', icon: 'filter' }));
      return;
    }
    const quick = (v: Vehicle): HTMLElement | null => {
      if (v.status === 'yard') {
        const wash = canPrep(s, v, v.presentation < 55 ? 'wash' : 'deepclean');
        return h('div', { class: 'btn-row' },
          wash.ok && v.presentation < 70 ? h('button', { class: 'btn small', on: { click: () => ctx.act(startPrep(s, v, v.presentation < 55 ? 'wash' : 'deepclean'), { sound: 'buy' }) } }, `Clean ${money(wash.cost)}`) : null,
          h('button', { class: 'btn small primary', on: { click: () => ctx.act(listVehicle(s, v.id, true)) } }, 'List'));
      }
      return null;
    };
    if (isWide() && layout === 'table') {
      const rows = list.map((v) => {
        const m = margin(v);
        return [
          richTipped(h('div', { class: 'cell-car' }, h('span', { class: 'mini-dot', style: `background:${v.colorHex}` }), h('div', {}, h('div', { class: 'cell-person-name', text: `${v.year} ${v.brand} ${v.model}` }), h('div', { class: 'tiny muted', text: `${v.trim} · ${v.fuel} · ${Math.round(v.mileage / 1000)}k km` }))), () => vehicleInfo(ctx.state, ctx.state.locations.find((l) => l.id === v.locationId) ?? activeLocation(ctx.state), v)),
          statusTag(v.status),
          conditionTag(v),
          h('span', { class: 'num', text: `${Math.round(v.presentation)}` }),
          demandTag(s, v),
          riskTag(v),
          h('span', { class: 'num', text: v.askingPrice ? money(v.askingPrice) : '—' }),
          h('span', { class: 'num', text: money(bookValue(s, v, mods)) }),
          h('span', { class: `num ${m >= 0 ? 'good' : 'bad'}`, text: moneySigned(m) }),
          h('span', { class: 'num', text: String(v.daysInStock) }),
          s.locations.length > 1 ? h('span', { class: 'tiny', text: locationName(s, v.locationId) }) : h('span', { class: 'tiny muted', text: v.listedOnline ? 'Online' : '' }),
          quick(v) ?? h('span', {}),
        ];
      });
      host.appendChild(table(['Vehicle', 'Status', 'Condition', 'Pres.', 'Demand', 'Risk', 'Asking', 'Retail est.', 'Margin', 'Days', s.locations.length > 1 ? 'Location' : 'Online', ''], rows, { onRowClick: (i) => openVehicle(ctx, list[i].id), rowIds: list.map((v) => v.id) }));
    } else if (isPhone()) {
      // Phones: one card per car — purchase, market value, profit, status — and Manage.
      host.appendChild(h('div', { class: 'm-list' }, ...list.map((v) => vehicleCard(ctx, v, () => openVehicle(ctx, v.id), quick(v)))));
    } else {
      // Showcase cards: the car, its price, what it earns you, how long it has stood and how wanted it is.
      const grid = h('div', { class: 'stock-grid' });
      for (const v of list) {
        const m = margin(v);
        const d = demandLabel(demandScore(s, v, mods));
        const price = v.askingPrice || suggestedPrice(s, v, mods);
        const art = h('div', { class: 'sc-art' });
        art.appendChild(carArt(v, 210));
        const wanted = s.customers.some((c) => c.vehicleId === v.id && (c.status === 'waiting' || c.status === 'negotiating'));
        const card = h('article', { class: `stock-card st-${v.status}`, data: { id: v.id }, role: 'button', on: { click: (e: Event) => { if (!(e.target as HTMLElement).closest('button')) openVehicle(ctx, v.id); } } },
          h('div', { class: 'sc-ribbon' }, statusTag(v.status), wanted ? h('span', { class: 'tag good', text: '★ customer' }) : null, v.certified ? h('span', { class: 'tag good', text: '✔' }) : null),
          art,
          h('div', { class: 'sc-body' },
            h('div', { class: 'sc-name', text: `${v.brand} ${v.model}` }),
            h('div', { class: 'tiny muted', text: `${v.year} · ${v.trim} · ${Math.round(v.mileage / 1000)}k km · ${v.fuel}` }),
            h('div', { class: 'sc-price', text: money(price) }),
            h('div', { class: 'sc-line' }),
            h('div', { class: `sc-fact ${m >= 0 ? 'good' : 'bad'}` }, icon(m >= 0 ? 'revenue' : 'warning', 15), h('span', { text: `${moneySigned(m)} expected margin` })),
            h('div', { class: 'sc-facts' },
              h('span', { class: `sc-chip ${v.daysInStock > 60 ? 'bad' : v.daysInStock > 30 ? 'warn' : ''}` }, icon('clock', 13), `${v.daysInStock} days`),
              h('span', { class: `sc-chip ${d.tone}` }, icon('gauge', 13), `${d.label} demand`),
              h('span', { class: 'sc-chip', title: 'Presentation' }, icon('sparkle', 13), `${Math.round(v.presentation)}`)),
            quick(v)));
        card.tabIndex = 0;
        grid.appendChild(card);
      }
      host.appendChild(grid);
    }
  }
  renderList();
  return { el: view };
}
