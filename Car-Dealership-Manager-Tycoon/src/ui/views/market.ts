import type { Ctx, View } from '../app';
import type { SourceId, Vehicle } from '../../sim/types';
import { empty, h, icon, table } from '../dom';
import { money, moneySigned } from '../../sim/format';
import { SOURCES } from '../../data/game';
import { BODIES, FUELS, CATEGORIES } from '../../data/vehicles';
import { bookValue, demandScore, marketMods } from '../../sim/market';
import { SOURCE_REP, offerPotential, sourceUnlocked } from '../../sim/trading';
import { activeLocation, freeSpaces } from '../../sim/state';
import { conditionTag, demandTag, helpButton, pageHead, riskTag, segmented, vehicleCard, tipped, richTipped } from '../kit';
import { allProfiles, brands, modelProfile, sourceModel, sourcingFee, sourcingLeft, SOURCING_PER_DAY } from '../../sim/catalog';
import type { ModelProfile } from '../../sim/catalog';
import { modelInfo } from '../world/info';
import { openOffer } from '../modals/offer';
import { openDrive } from '../drive/driveview';
import { isWide } from '../layout';
import { activeExtra, collapsibleToolbar, emptyFilters, extraFilterControls, passesExtra } from '../filters';

const extra = emptyFilters();

const f = { mode: 'offers' as 'offers' | 'models', source: 'all' as 'all' | SourceId, q: '', sort: 'potential', cat: '', fuel: '', body: '', maxPrice: 0, model: '' };
const mb = { brand: '', q: '', type: '', segment: '', sort: 'margin' };

export function marketView(ctx: Ctx): View {
  const s = ctx.state;
  currentState = s;
  // Other screens can open the market on one source (e.g. "Order new cars" from a brand contract).
  if (ctx.params.source && SOURCES.some((x) => x.id === ctx.params.source)) { f.mode = 'offers'; f.source = ctx.params.source as SourceId; delete ctx.params.source; }
  const view = h('div', { class: 'view' });
  const loc = activeLocation(s);
  const space = freeSpaces(s, loc.id);
  view.appendChild(pageHead('Vehicle market', `${s.offers.length} vehicles available · ${space} free space${space === 1 ? '' : 's'} at ${loc.name} · cash ${money(s.cash)}`, helpButton('market')));

  view.appendChild(segmented<'offers' | 'models'>([
    { value: 'offers', label: '🚗 Cars for sale', count: s.offers.length },
    { value: 'models', label: '📘 Model browser' },
  ], f.mode, (v) => { f.mode = v; ctx.refresh(); }, 'market-mode'));
  if (f.mode === 'models') {
    view.appendChild(modelBrowser(ctx));
    return { el: view };
  }

  if (f.model) {
    const p = modelProfile(s, f.model);
    view.appendChild(h('div', { class: 'source-info' },
      h('span', { class: 'source-icon', text: '📘' }),
      h('div', {}, h('div', { class: 'card-title', text: `Showing only: ${p ? `${p.brand} ${p.model}` : f.model}` }), h('div', { class: 'tiny muted', text: 'Picked in the model browser.' })),
      h('button', { class: 'btn small ghost', data: { act: 'clear-model' }, on: { click: () => { f.model = ''; ctx.refresh(); } } }, icon('close', 13), 'Show all')));
  }

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
    let list = s.offers.filter((o) => (f.source === 'all' || o.source === f.source) && (!f.model || o.modelId === f.model)
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
          modelTip(h('div', { class: 'cell-car' }, h('span', { class: 'mini-dot', style: `background:${o.colorHex}` }), h('div', {}, h('div', { class: 'cell-person-name', text: `${o.year} ${o.brand} ${o.model}` }), h('div', { class: 'tiny muted', text: `${o.trim} · ${o.fuel} · ${o.transmission} · ${Math.round(o.mileage / 1000)}k km` })), o.sourced ? h('span', { class: 'tag info', text: 'Sourced' }) : null), o.modelId),
          h('span', { class: 'tiny', text: SOURCES.find((x) => x.id === o.source)?.name ?? o.source }),
          conditionTag(o),
          demandTag(s, o),
          riskTag(o),
          h('span', { class: 'num', text: `${o.auction ? '🔨 ' : ''}${money(priceOf(o))}` }),
          h('span', { class: 'num', text: money(bookValue(s, o, mods)) }),
          tipped(h('span', { class: `num ${p.profit >= 0 ? 'good' : 'bad'}`, text: moneySigned(p.profit) }), `Deal quality: ${p.label}`),
          h('span', { class: 'num', text: expires(o) }),
          h('span', { class: 'row-btns' },
            o.auction ? null : h('button', { class: 'btn small', data: { drive: o.id }, title: 'Test drive it yourself', on: { click: (e: Event) => { e.stopPropagation(); openDrive(ctx, { kind: 'offer', vehicleId: o.id, locationId: s.activeLocationId }); } } }, '🗝️'),
            h('button', { class: 'btn small primary', on: { click: () => openOffer(ctx, o.id) } }, o.auction ? 'Bid' : 'View')),
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
          badges: [h('span', { class: `tag ${p.tone}`, text: p.label }), conditionTag(o), riskTag(o), o.sourced ? h('span', { class: 'tag info', text: 'Sourced' }) : null].filter((x): x is HTMLElement => !!x),
          onClick: () => openOffer(ctx, o.id),
        }));
      }
      host.appendChild(grid);
    }
  }
  render();
  return { el: view };
}

/** Hover card with the model's profile (desktop). */
function modelTip<T extends HTMLElement>(el: T, modelId: string): T {
  return richTipped(el, () => {
    const st = currentState;
    const p = st ? modelProfile(st, modelId) : undefined;
    return p ? modelInfo(p) : h('div', { text: 'Unknown model' });
  });
}
let currentState: import('../../sim/types').GameState | null = null;

const SORTS: [string, string, (a: ModelProfile, b: ModelProfile) => number][] = [
  ['margin', 'Best margin', (a, b) => b.margin - a.margin],
  ['demand', 'Highest demand', (a, b) => b.demand - a.demand],
  ['popularity', 'Most popular', (a, b) => b.popularity - a.popularity],
  ['cheap', 'Purchase: low → high', (a, b) => a.purchasePrice - b.purchasePrice],
  ['dear', 'Purchase: high → low', (a, b) => b.purchasePrice - a.purchasePrice],
  ['name', 'Brand & model', (a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`)],
];

/** Every model on the market with what it costs, what it sells for and who buys it. */
function modelBrowser(ctx: Ctx): HTMLElement {
  const s = ctx.state;
  currentState = s;
  const wrap = h('div', { class: 'model-browser' });
  const profiles = allProfiles(s);
  const offerCount = new Map<string, number>();
  for (const o of s.offers) offerCount.set(o.modelId, (offerCount.get(o.modelId) ?? 0) + 1);
  const brandList = brands().filter((b) => profiles.some((p) => p.brandId === b.id));
  const types = [...new Set(profiles.map((p) => p.type))].sort();
  const segments = [...new Set(profiles.map((p) => p.segment))];

  wrap.appendChild(h('div', { class: 'mb-intro' }, h('p', { class: 'muted small', text: `${profiles.length} models from ${brandList.length} brands. Prices are for a typical used example today and move with trends and seasons. Your buyer can track down a specific model for a finder's fee (${sourcingLeft(s)} of ${SOURCING_PER_DAY} requests left today).` }), helpButton('models')));

  const brandRow = h('div', { class: 'mb-brands scroll-x' });
  const paintBrands = (): void => {
    brandRow.replaceChildren(
      h('button', { class: `bp-chip${!mb.brand ? ' active' : ''}`, data: { brand: '' }, on: { click: () => { mb.brand = ''; paintBrands(); render(); } } }, 'All brands'),
      ...brandList.map((b) => h('button', { class: `bp-chip${mb.brand === b.id ? ' active' : ''}`, data: { brand: b.id }, on: { click: () => { mb.brand = b.id; paintBrands(); render(); } } }, b.name)));
  };
  paintBrands();
  wrap.appendChild(brandRow);

  const search = h('input', { type: 'search', placeholder: 'Search brand, model or type…', value: mb.q, aria: { label: 'Search models' } });
  search.addEventListener('input', () => { mb.q = search.value; render(); });
  const sel = (label: string, opts: [string, string][], key: 'type' | 'segment' | 'sort'): HTMLElement => {
    const el = h('select', { aria: { label } }, ...opts.map(([v, l]) => h('option', { value: v, selected: mb[key] === v }, l)));
    el.addEventListener('change', () => { mb[key] = el.value; render(); });
    return el;
  };
  wrap.appendChild(h('div', { class: 'toolbar' },
    h('div', { class: 'search' }, icon('search', 15), search),
    sel('Type', [['', 'All types'], ...types.map((t) => [t, t] as [string, string])], 'type'),
    sel('Segment', [['', 'All segments'], ...segments.map((t) => [t, t] as [string, string])], 'segment'),
    sel('Sort', SORTS.map(([v, l]) => [v, l] as [string, string]), 'sort')));

  const host = h('div', { class: 'mb-grid' });
  wrap.appendChild(host);
  const render = (): void => {
    const q = mb.q.trim().toLowerCase();
    const list = profiles.filter((p) => (!mb.brand || p.brandId === mb.brand) && (!mb.type || p.type === mb.type) && (!mb.segment || p.segment === mb.segment)
      && (!q || `${p.brand} ${p.model} ${p.type} ${p.segment} ${p.fuels.join(' ')}`.toLowerCase().includes(q)))
      .sort((SORTS.find((x) => x[0] === mb.sort) ?? SORTS[0])[2]);
    if (!list.length) { host.replaceChildren(empty('No models match.', { title: 'Nothing found', icon: 'search' })); return; }
    host.replaceChildren(...list.map((p) => {
      const n = offerCount.get(p.id) ?? 0;
      const fee = sourcingFee(s, p.id);
      const card = h('div', { class: 'card mb-card', data: { model: p.id } }, modelInfo(p));
      card.appendChild(h('div', { class: 'mb-actions' },
        h('button', { class: 'btn small', disabled: !n, data: { act: 'offers' }, on: { click: () => { f.mode = 'offers'; f.model = p.id; f.source = 'all'; ctx.refresh(); } } }, icon('eye', 13), n ? `${n} for sale` : 'None for sale'),
        h('button', { class: 'btn small primary', data: { act: 'source' }, disabled: sourcingLeft(s) <= 0 || s.cash < fee, title: `Your buyer finds one within the day. Finder's fee ${money(fee)}.`, on: { click: () => {
          const r = sourceModel(s, p.id);
          ctx.act(r, { sound: r.ok ? 'buy' : undefined });
          if (r.ok && r.offerId) { f.mode = 'offers'; f.model = p.id; f.source = 'all'; ctx.refresh(); openOffer(ctx, r.offerId); }
        } } }, icon('search', 13), `Find one · ${money(fee)}`)));
      return card;
    }));
  };
  render();
  return wrap;
}
