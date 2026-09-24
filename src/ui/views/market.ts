import type { Ctx, View } from '../app';
import type { SourceId, Vehicle } from '../../sim/types';
import { empty, h, icon, table } from '../dom';
import { money, moneySigned } from '../../sim/format';
import { SOURCES } from '../../data/game';
import { BODIES, FUELS, CATEGORIES } from '../../data/vehicles';
import { bookValue, demandScore, marketMods } from '../../sim/market';
import { SOURCE_REP, offerPotential, sourceUnlocked } from '../../sim/trading';
import { activeLocation, freeSpaces } from '../../sim/state';
import { conditionTag, demandTag, helpButton, pageHead, riskTag, segmented, vehicleCard, tipped } from '../kit';
import { openOffer } from '../modals/offer';
import { isWide } from '../layout';
import { activeExtra, collapsibleToolbar, emptyFilters, extraFilterControls, passesExtra } from '../filters';

const extra = emptyFilters();

const f = { source: 'all' as 'all' | SourceId, q: '', sort: 'potential', cat: '', fuel: '', body: '', maxPrice: 0 };

export function marketView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const loc = activeLocation(s);
  const space = freeSpaces(s, loc.id);
  view.appendChild(pageHead('Vehicle market', `${s.offers.length} vehicles available · ${space} free space${space === 1 ? '' : 's'} at ${loc.name} · cash ${money(s.cash)}`, helpButton('market')));

  const tabs: { value: 'all' | SourceId; label: string; count?: number }[] = [{ value: 'all', label: 'All sources', count: s.offers.length }];
  for (const src of SOURCES) {
    tabs.push({ value: src.id, label: sourceUnlocked(s, src.id) ? `${src.icon} ${src.name}` : `🔒 ${src.name}`, count: s.offers.filter((o) => o.source === src.id).length });
  }
  view.appendChild(segmented(tabs, f.source, (v) => { f.source = v; ctx.refresh(); }, 'scroll-x'));

  if (f.source !== 'all') {
    const src = SOURCES.find((x) => x.id === f.source)!;
    view.appendChild(h('div', { class: 'source-info' },
      h('span', { class: 'source-icon', text: src.icon }),
      h('div', {}, h('div', { class: 'card-title', text: src.name }), h('div', { class: 'tiny muted', text: src.description })),
      h('span', { class: `tag ${src.risk.includes('High') || src.risk.includes('Very high') ? 'bad' : src.risk === 'Medium' ? 'warn' : 'good'}`, text: `Risk: ${src.risk}` }),
      !sourceUnlocked(s, src.id) ? h('span', { class: 'tag muted', text: `Needs level ${src.minLevel}${SOURCE_REP[src.id] ? ` and reputation ${SOURCE_REP[src.id]}` : ''}` }) : null));
  }

  const search = h('input', { type: 'search', placeholder: 'Search make or model…', value: f.q, aria: { label: 'Search market' } });
  search.addEventListener('input', () => { f.q = search.value; render(); });
  const sel = (label: string, opts: [string, string][], key: 'sort' | 'cat' | 'fuel' | 'body'): HTMLElement => {
    const el = h('select', { aria: { label } }, ...opts.map(([v, l]) => h('option', { value: v, selected: f[key] === v }, l)));
    el.addEventListener('change', () => { f[key] = el.value; render(); });
    return el;
  };
  const maxIn = h('input', { type: 'number', placeholder: 'Max price', value: f.maxPrice ? String(f.maxPrice) : '', inputmode: 'numeric', aria: { label: 'Maximum price' } });
  maxIn.addEventListener('change', () => { f.maxPrice = Number(maxIn.value) || 0; render(); });
  view.appendChild(collapsibleToolbar('market', h('div', { class: 'toolbar' },
    h('div', { class: 'search' }, icon('search', 15), search),
    sel('Sort', [['potential', 'Best potential'], ['price', 'Price: low → high'], ['priceDesc', 'Price: high → low'], ['demand', 'Demand'], ['mileage', 'Mileage'], ['year', 'Newest'], ['expiry', 'Ending soon']], 'sort'),
    sel('Category', [['', 'All categories'], ...CATEGORIES.map((c) => [c, c] as [string, string])], 'cat'),
    sel('Fuel', [['', 'All fuels'], ...FUELS.map((x) => [x, x] as [string, string])], 'fuel'),
    sel('Body', [['', 'All bodies'], ...BODIES.map((x) => [x, x] as [string, string])], 'body'),
    maxIn, ...extraFilterControls(extra, () => render())), activeExtra(extra) + (f.cat ? 1 : 0) + (f.fuel ? 1 : 0) + (f.body ? 1 : 0) + (f.maxPrice ? 1 : 0)));

  const host = h('div', {});
  view.appendChild(host);
  const mods = marketMods(s);
  const priceOf = (o: Vehicle): number => (o.auction ? Math.max(o.auction.currentBid, o.auction.myBid) : o.offerPrice);

  function render(): void {
    const q = f.q.trim().toLowerCase();
    let list = s.offers.filter((o) => (f.source === 'all' || o.source === f.source)
      && (!f.cat || o.category === f.cat) && (!f.fuel || o.fuel === f.fuel) && (!f.body || o.body === f.body)
      && (!f.maxPrice || priceOf(o) <= f.maxPrice)
      && (!q || `${o.year} ${o.brand} ${o.model} ${o.trim}`.toLowerCase().includes(q)) && passesExtra(o, extra));
    const pot = new Map(list.map((o) => [o.id, offerPotential(s, o)]));
    const sorters: Record<string, (a: Vehicle, b: Vehicle) => number> = {
      potential: (a, b) => (pot.get(b.id)!.profit / Math.max(1, priceOf(b))) - (pot.get(a.id)!.profit / Math.max(1, priceOf(a))),
      price: (a, b) => priceOf(a) - priceOf(b),
      priceDesc: (a, b) => priceOf(b) - priceOf(a),
      demand: (a, b) => demandScore(s, b, mods) - demandScore(s, a, mods),
      mileage: (a, b) => a.mileage - b.mileage,
      year: (a, b) => b.year - a.year,
      expiry: (a, b) => (a.expiresDay ?? 0) - (b.expiresDay ?? 0),
    };
    list = list.sort(sorters[f.sort] ?? sorters.potential);
    host.replaceChildren();
    if (!list.length) {
      host.appendChild(empty(f.source !== 'all' && !sourceUnlocked(s, f.source as SourceId) ? 'Grow your company to unlock this source.' : 'No vehicles match. New stock appears every day.', { title: 'Nothing on offer', icon: 'store' }));
      return;
    }
    const expires = (o: Vehicle): string => (o.expiresDay === s.day ? 'Today' : `${(o.expiresDay ?? s.day) - s.day}d`);
    if (isWide()) {
      const rows = list.map((o) => {
        const p = pot.get(o.id)!;
        return [
          h('div', { class: 'cell-car' }, h('span', { class: 'mini-dot', style: `background:${o.colorHex}` }), h('div', {}, h('div', { class: 'cell-person-name', text: `${o.year} ${o.brand} ${o.model}` }), h('div', { class: 'tiny muted', text: `${o.trim} · ${o.fuel} · ${o.transmission} · ${Math.round(o.mileage / 1000)}k km` }))),
          h('span', { class: 'tiny', text: SOURCES.find((x) => x.id === o.source)?.name ?? o.source }),
          conditionTag(o),
          demandTag(s, o),
          riskTag(o),
          h('span', { class: 'num', text: `${o.auction ? '🔨 ' : ''}${money(priceOf(o))}` }),
          h('span', { class: 'num', text: money(bookValue(s, o, mods)) }),
          tipped(h('span', { class: `num ${p.profit >= 0 ? 'good' : 'bad'}`, text: moneySigned(p.profit) }), `Deal quality: ${p.label}`),
          h('span', { class: 'num', text: expires(o) }),
          h('button', { class: 'btn small primary', on: { click: () => openOffer(ctx, o.id) } }, o.auction ? 'Bid' : 'View'),
        ];
      });
      host.appendChild(table(['Vehicle', 'Source', 'Condition', 'Demand', 'Risk', 'Price', 'Retail est.', 'Potential', 'Ends', ''], rows, { onRowClick: (i) => openOffer(ctx, list[i].id), rowIds: list.map((v) => v.id) }));
    } else {
      const grid = h('div', { class: 'vcard-list' });
      for (const o of list) {
        const p = pot.get(o.id)!;
        grid.appendChild(vehicleCard(s, o, {
          price: `${o.auction ? '🔨 ' : ''}${money(priceOf(o))}`,
          priceSub: `potential ${moneySigned(p.profit)} · ${expires(o)}`,
          badges: [h('span', { class: `tag ${p.tone}`, text: p.label }), conditionTag(o), riskTag(o)],
          onClick: () => openOffer(ctx, o.id),
        }));
      }
      host.appendChild(grid);
    }
  }
  render();
  return { el: view };
}
