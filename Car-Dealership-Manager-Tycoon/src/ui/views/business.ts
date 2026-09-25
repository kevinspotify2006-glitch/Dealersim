/**
 * The business screens: Sales & F&I, Customers (CRM and the sales funnel),
 * Service & parts, and Fleet. Every control changes the simulation directly.
 */
import type { Ctx, View } from '../app';
import type { FunnelStage, Location, PricingPolicy } from '../../sim/types';
import { confirmDialog, empty, h, kpi, table } from '../dom';
import { money, moneyShort, pct, shortDate } from '../../sim/format';
import { ARCHETYPE_BY_ID, CITY_BY_ID, LOCATION_TYPES } from '../../data/game';
import { DELIVERY_OPTIONS, FINANCE_KINDS, LENDER_TIERS, PRODUCTS } from '../../data/products';
import { PARTS, PART_BY_ID, SERVICE_TYPES, SERVICE_BY_ID } from '../../data/service';
import { FLEET_BY_ID } from '../../data/group';
import { PRICING_POLICY, totalCost } from '../../sim/market';
import { activeLocation, hasTech, locationName, vehicleName } from '../../sim/state';
import { financeSummary, lenderTier, productPrice } from '../../sim/systems/retail';
import { lifetimeValue, reachableClients, returnChance } from '../../sim/systems/crm';
import { canServiceEv, openJobs, orderParts, partsPriceMult, partsStock, serviceCapacity, walkInServiceRate } from '../../sim/systems/service';
import { acceptFleet, candidatesFor, declineFleet, deliverFleetCar, fleetPrice, fleetUnlocked } from '../../sim/systems/fleet';
import { lotStats } from '../../sim/lot';
import { helpButton, kv, pageHead, panel, panelTitle, progressBar, tipped } from '../kit';
import { isWide } from '../layout';

/** Pick which location a screen shows (only when there is more than one). */
export function locationPicker(ctx: Ctx, label = 'Location'): HTMLElement | null {
  const s = ctx.state;
  if (s.locations.length < 2) return null;
  const loc = activeLocation(s);
  return h('div', { class: 'pill-row scroll-x' }, h('span', { class: 'tiny muted', text: `${label}:` }),
    ...s.locations.map((l) => h('button', { class: `pill${l.id === loc.id ? ' active' : ''}`, data: { loc: l.id }, on: { click: () => { s.activeLocationId = l.id; ctx.refresh(); } } }, l.name)));
}

const pctOf = (a: number, b: number): string => (b > 0 ? pct((a / b) * 100) : '—');

// ------------------------------------------------------------ Sales & F&I --

export function salesFiView(ctx: Ctx): View {
  const s = ctx.state;
  const loc = activeLocation(s);
  const view = h('div', { class: 'view' });
  const fin = financeSummary(s, loc);
  const k = s.kpi;
  const sold = loc.month.sold || s.locations.reduce((a, l) => a + l.month.sold, 0);
  view.appendChild(pageHead('Sales & F&I', `How ${loc.name} prices, finances and hands over its cars`, helpButton('negotiation')));
  const picker = locationPicker(ctx);
  if (picker) view.appendChild(picker);
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Finance penetration', value: pctOf(k.financeDeals, Math.max(sold, k.financeOffers)), sub: `${k.financeDeals} financed this month`, icon: 'finance', tone: 'tech' }),
    kpi({ label: 'Finance income', value: moneyShort(k.financeIncome), sub: `last month ${moneyShort(s.kpiLast?.financeIncome ?? 0)}`, icon: 'profit', tone: 'good' }),
    kpi({ label: 'Products sold', value: String(k.productsSold), sub: `${(k.productsSold / Math.max(1, sold)).toFixed(1)} per car`, icon: 'sparkle', tone: 'accent' }),
    kpi({ label: 'Deliveries', value: String(k.deliveries), sub: `${s.stats.sold} cars sold in total`, icon: 'car', tone: 'info' })));

  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });

  // Pricing policy.
  const current = loc.pricing ?? 'market';
  left.appendChild(panel(panelTitle('Pricing policy', h('span', { class: 'sub', text: loc.name })),
    h('p', { class: 'tiny muted', text: 'Sets suggested prices for every car here and how many buyers come in. You can still price each car by hand.' }),
    h('div', { class: 'choice-list' }, ...(Object.entries(PRICING_POLICY) as [PricingPolicy, (typeof PRICING_POLICY)[PricingPolicy]][]).map(([id, p]) => h('button', {
      class: `choice${id === current ? ' active' : ''}`, data: { pricing: id },
      on: { click: () => { loc.pricing = id; ctx.act({ ok: true, message: `${loc.name} now prices ${p.name.toLowerCase()}. Suggested prices ${p.price < 1 ? 'drop' : p.price > 1 ? 'rise' : 'follow the market'}.` }); } },
    }, h('div', { class: 'card-title', text: p.name }), h('div', { class: 'tiny muted', text: `${p.description} Prices ${p.price === 1 ? '±0' : `${p.price > 1 ? '+' : ''}${Math.round((p.price - 1) * 100)}%`}, interest ${p.interest === 0 ? '±0' : `${p.interest > 0 ? '+' : ''}${Math.round(p.interest * 100)}%`}.` }))))));

  // Finance setup.
  const tier = lenderTier(loc);
  left.appendChild(panel(panelTitle('Finance department', h('span', { class: 'sub', text: fin.tier })),
    kv('Lender panel', LENDER_TIERS[tier].name, tier ? undefined : 'warn'),
    kv('Market interest rate', pct(fin.rate * 100, 1)),
    kv('Finance manager', fin.manager ?? 'None — salespeople do the paperwork', fin.manager ? undefined : 'muted'),
    kv('Commission multiplier', `×${LENDER_TIERS[tier].commission.toFixed(2)}`),
    tier === 0 ? h('p', { class: 'tiny warn', text: 'Without a lender panel every buyer pays cash, and buyers who need monthly payments walk away. Add the Finance desk service.' }) : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn small', on: { click: () => ctx.go('company', { tab: 'services' }) } }, tier < 3 ? 'Upgrade the lender panel' : 'Services'),
      h('button', { class: 'btn small', on: { click: () => ctx.go('dealership', { build: '1', cat: 'finance' }) } }, 'Build finance desks'))));
  left.appendChild(panel('Finance products', table(['Type', 'Terms', 'Final payment', 'Commission', 'Status'], FINANCE_KINDS.map((f) => {
    const ok = fin.kinds.includes(f.id);
    return [
      h('span', { text: `${f.icon} ${f.name}` }),
      h('span', { class: 'tiny', text: f.terms[0] ? `${f.terms.join('/')} mo` : '—' }),
      h('span', { class: 'num', text: f.residual ? pct(f.residual * 100) : '—' }),
      h('span', { class: 'num', text: f.commission ? pct(f.commission * 100, 1) : '—' }),
      h('span', { class: `tag ${ok ? 'good' : ''}`, text: ok ? 'Offered' : f.requires ? 'Research: advanced finance' : 'Needs a lender' }),
    ];
  }))));

  // F&I products.
  right.appendChild(panel(panelTitle('Protection & add-on products', h('span', { class: 'sub', text: 'offered in every negotiation' })),
    ...PRODUCTS.map((p) => {
      const req = p.requires;
      const ok = !req || (req === 'finance' ? tier > 0 : req === 'detailing' ? lotStats(loc.lot).slots.bay.length > 0 : hasTech(s, req.split(':')[1]));
      return tipped(h('div', { class: `prod-row${ok ? '' : ' muted'}` }, h('span', { class: 'syn-ic', text: p.icon }),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: p.name }), h('div', { class: 'tiny muted', text: p.description })),
        h('div', { class: 'prod-side' }, h('span', { class: 'num', text: money(productPrice(p, 15000)) }), h('span', { class: 'tiny muted', text: ok ? `~${Math.round(p.take * 100)}% take it` : 'locked' }))),
      `${p.name}: on a €15,000 car it sells for ${money(productPrice(p, 15000))}; you keep ${pct((1 - p.costShare) * 100)} of it. ${p.financeOnly ? 'Only with finance. ' : ''}${p.warranty ? `Covers ${p.warranty} warranty claims. ` : ''}${p.serviceVisits ? `Brings the car back for ${p.serviceVisits} service visits.` : ''}`);
    })));

  // Delivery experience.
  if (!loc.delivery) loc.delivery = { flowers: false, photos: false, welcome: false, premium: false };
  right.appendChild(panel(panelTitle('Delivery experience', h('span', { class: 'sub', text: 'cost per car handed over' })),
    h('p', { class: 'tiny muted', text: 'A memorable handover earns better reviews and more repeat buyers. A delivery bay and a delivery specialist make it even better.' }),
    ...DELIVERY_OPTIONS.map((o) => {
      const locked = !!o.requires && !hasTech(s, o.requires);
      const on = !!loc.delivery?.[o.id];
      return h('label', { class: `toggle-row${locked ? ' muted' : ''}` },
        h('input', { type: 'checkbox', checked: on, disabled: locked, data: { delivery: o.id }, on: { change: (e: Event) => { loc.delivery![o.id] = (e.target as HTMLInputElement).checked; ctx.refresh(); } } }),
        h('span', { class: 'syn-ic', text: o.icon }),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: o.name }), h('div', { class: 'tiny muted', text: locked ? 'Research: delivery experience' : o.description })),
        h('span', { class: 'num', text: money(o.cost) }));
    })));
  view.appendChild(h('div', { class: 'grid split' }, left, right));
  return { el: view };
}

// ----------------------------------------------------------- Customers --

const FUNNEL: { id: FunnelStage; label: string }[] = [
  { id: 'ad', label: 'Saw an ad' }, { id: 'visit', label: 'Visited' }, { id: 'browse', label: 'Browsed' }, { id: 'interest', label: 'Interested' },
  { id: 'testdrive', label: 'Test drive' }, { id: 'negotiation', label: 'Negotiated' }, { id: 'finance', label: 'Finance' }, { id: 'tradein', label: 'Trade-in' },
  { id: 'sale', label: 'Bought' }, { id: 'delivery', label: 'Delivered' }, { id: 'review', label: 'Reviewed' }, { id: 'repeat', label: 'Came back' },
];
let funnelPeriod: 'month' | 'last' | 'total' = 'month';
let clientSort: 'value' | 'recent' | 'return' = 'value';

export function clientsView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const active = s.clients.filter((c) => !c.lost);
  view.appendChild(pageHead('Customers & CRM', `${s.clients.length} people on your client list · ${reachableClients(s)} reachable by email`, helpButton('crm')));
  const repeat = s.stats.repeatSales ?? 0;
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Clients', value: String(active.length), sub: `${s.clients.length - active.length} lost after a bad experience`, icon: 'people', tone: 'info' }),
    kpi({ label: 'Lifetime value', value: moneyShort(lifetimeValue(s)), sub: 'gross profit from your clients', icon: 'worth', tone: 'good' }),
    kpi({ label: 'Repeat sales', value: String(repeat), sub: pctOf(repeat, s.stats.sold) + ' of all sales', icon: 'rotate', tone: 'accent' }),
    kpi({ label: 'Average wait', value: s.kpi.waitCount ? `${(s.kpi.waitHours / s.kpi.waitCount).toFixed(1)} h` : '—', sub: 'before someone helps a visitor', icon: 'clock', tone: 'tech' })));

  // Funnel.
  const f = s.funnel[funnelPeriod];
  const top = Math.max(1, ...FUNNEL.map((x) => f[x.id]));
  view.appendChild(panel(panelTitle('Sales funnel', h('div', { class: 'seg small' }, ...(['month', 'last', 'total'] as const).map((p) => h('button', { class: `seg-btn${p === funnelPeriod ? ' active' : ''}`, data: { period: p }, on: { click: () => { funnelPeriod = p; ctx.refresh(); } } }, p === 'month' ? 'This month' : p === 'last' ? 'Last month' : 'All time')))),
    h('div', { class: 'funnel' }, ...FUNNEL.map((x, i) => {
      const prev = i > 0 ? f[FUNNEL[i - 1].id] : 0;
      return h('div', { class: 'funnel-row', data: { stage: x.id } },
        h('span', { class: 'funnel-label', text: x.label }),
        h('div', { class: 'funnel-bar' }, h('div', { class: 'funnel-fill', style: `width:${((f[x.id] / top) * 100).toFixed(1)}%` })),
        h('span', { class: 'num', text: String(f[x.id]) }),
        h('span', { class: 'tiny muted funnel-conv', text: i > 0 && prev ? pctOf(f[x.id], prev) : '' }));
    })),
    h('p', { class: 'tiny muted', text: 'Where people drop out tells you what to fix: few visits → marketing; few test drives → presentation and stock; few sales after negotiating → prices, finance and trade-ins; few reviews → the handover.' })));

  // Client list.
  const list = [...s.clients].sort((a, b) => clientSort === 'value' ? b.lifetimeValue - a.lifetimeValue : clientSort === 'recent' ? b.lastDay - a.lastDay : returnChance(s, b) - returnChance(s, a)).slice(0, 60);
  view.appendChild(panel(panelTitle('Client list', h('div', { class: 'seg small' }, ...(['value', 'recent', 'return'] as const).map((p) => h('button', { class: `seg-btn${p === clientSort ? ' active' : ''}`, on: { click: () => { clientSort = p; ctx.refresh(); } } }, p === 'value' ? 'Most valuable' : p === 'recent' ? 'Recent' : 'Likely to return')))),
    list.length ? table(['Client', 'Type', 'Car', 'Bought', 'Service', 'Value', 'Rating', 'Comes back', 'Next'], list.map((c) => [
      h('span', { text: c.name }),
      h('span', { class: 'tiny', text: `${ARCHETYPE_BY_ID[c.archetype]?.icon ?? ''} ${ARCHETYPE_BY_ID[c.archetype]?.name ?? c.archetype}` }),
      h('span', { class: 'tiny', text: c.car?.name ?? '—' }),
      h('span', { class: 'num', text: String(c.purchases) }),
      h('span', { class: 'num', text: String(c.serviceVisits) }),
      h('span', { class: 'num', text: money(c.lifetimeValue) }),
      h('span', { class: 'num', text: `${c.satisfaction.toFixed(1)}★` }),
      c.lost ? h('span', { class: 'tag bad', text: 'Lost' }) : h('span', { class: 'num', text: pct(returnChance(s, c) * 100) }),
      h('span', { class: 'tiny', text: c.lost ? '—' : [c.nextServiceDay ? `service ${shortDate(c.nextServiceDay)}` : '', c.nextPurchaseDay ? `buy ~${shortDate(c.nextPurchaseDay)}` : ''].filter(Boolean).join(' · ') || '—' }),
    ])) : empty('Everyone who buys a car or has one serviced joins your client list. They come back for service and, if they were happy, for their next car.', { title: 'No clients yet', icon: 'people' }),
    h('p', { class: 'tiny muted', text: `${hasTech(s, 'crm') ? 'CRM software is doubling your email reach and bringing clients back more often.' : 'Research CRM software to reach more clients and bring them back more often.'} ${hasTech(s, 'loyalty') ? 'Your loyalty programme is running.' : ''}` })));
  return { el: view };
}

// ------------------------------------------------------ Service & parts --

export function serviceView(ctx: Ctx): View {
  const s = ctx.state;
  const loc = activeLocation(s);
  const view = h('div', { class: 'view' });
  const cap = serviceCapacity(s, loc);
  const ls = lotStats(loc.lot);
  const jobs = openJobs(s, loc.id);
  view.appendChild(pageHead('Service & parts', `${loc.name}: ${ls.slots.lift.length} lift${ls.slots.lift.length === 1 ? '' : 's'}, ${cap.staff} mechanic${cap.staff === 1 ? '' : 's'} · ${jobs.length} open job${jobs.length === 1 ? '' : 's'}`, helpButton('service')));
  const picker = locationPicker(ctx);
  if (picker) view.appendChild(picker);
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Service revenue', value: moneyShort(s.kpi.serviceRevenue), sub: `last month ${moneyShort(s.kpiLast?.serviceRevenue ?? 0)}`, icon: 'wrench', tone: 'tech' }),
    kpi({ label: 'Parts revenue', value: moneyShort(s.kpi.partsRevenue), sub: `last month ${moneyShort(s.kpiLast?.partsRevenue ?? 0)}`, icon: 'layers', tone: 'info' }),
    kpi({ label: 'Workshop hours today', value: cap.hours.toFixed(0), sub: `${cap.lifts} free lift${cap.lifts === 1 ? '' : 's'} · speed ×${cap.speed.toFixed(2)}`, icon: 'clock', tone: 'accent' }),
    kpi({ label: 'Jobs done', value: String(s.stats.serviceJobs ?? 0), sub: `~${walkInServiceRate(s, loc).toFixed(1)} new bookings a day`, icon: 'check', tone: 'good' })));

  if (!ls.slots.lift.length && !ls.slots.bay.length) {
    view.appendChild(panel('No workshop yet', empty('Service customers need a lift (workshop) or a detailing bay, and a mechanic or detailer to do the work. Service brings steady income between car sales and brings buyers back.', {
      title: 'Build a workshop', icon: 'wrench',
      action: h('button', { class: 'btn primary', on: { click: () => ctx.go('dealership', { build: '1', cat: 'service' }) } }, 'Build a workshop'),
    })));
  }

  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });
  const statusTone: Record<string, string> = { booked: '', waiting: 'warn', working: 'info', parts: 'bad', done: 'good' };
  left.appendChild(panel(panelTitle('Workshop jobs', h('span', { class: 'sub', text: canServiceEv(s, loc) ? 'EV work possible' : 'no EV work (needs EV skills or EV diagnostics)' })),
    jobs.length ? table(['Job', 'Customer', 'Car', 'Status', 'Hours left', 'Labour', 'Due'], jobs.map((j) => [
      h('span', { text: `${SERVICE_BY_ID[j.type]?.icon ?? '🔧'} ${SERVICE_BY_ID[j.type]?.name ?? j.type}` }),
      h('span', { class: 'tiny', text: j.customer }),
      h('span', { class: 'tiny', text: `${j.vehicle}${j.electric ? ' ⚡' : ''}` }),
      h('span', { class: `tag ${statusTone[j.status] ?? ''}`, text: j.status === 'parts' ? 'waiting for parts' : j.status }),
      h('div', { class: 'skill-cell' }, progressBar(1 - j.hours / Math.max(0.1, j.totalHours), 'good'), h('span', { class: 'tiny', text: j.hours.toFixed(1) })),
      h('span', { class: 'num', text: money(j.labour + (j.upsell ?? 0)) }),
      h('span', { class: `tiny ${j.dueDay < s.day ? 'bad' : ''}`, text: shortDate(j.dueDay) }),
    ])) : h('p', { class: 'empty', text: 'No open jobs. Bookings come from your clients, the town (reputation, a service advisor, online booking) and recalls.' })));
  left.appendChild(panel('Services you offer', table(['Service', 'Hours', 'Price', 'Parts', 'Needs'], SERVICE_TYPES.map((t) => [
    h('span', { text: `${t.icon} ${t.name}` }),
    h('span', { class: 'num', text: String(t.hours) }),
    h('span', { class: 'num', text: money(Math.round(t.hours * t.rate)) }),
    h('span', { class: 'tiny', text: Object.entries(t.parts).map(([p, n]) => `${n}× ${PART_BY_ID[p as keyof typeof PART_BY_ID]?.name ?? p}`).join(', ') || '—' }),
    h('span', { class: 'tiny', text: t.bay ? 'detailing bay' : t.ev ? 'lift + EV skills' : 'lift' }),
  ]))));

  // Parts.
  const stock = partsStock(loc);
  const mult = partsPriceMult(s);
  const order = (part: (typeof PARTS)[number], qty: number, express = false) => async (): Promise<void> => {
    const cost = Math.round(part.cost * mult * (express ? 1.25 : 1)) * qty;
    if (cost >= s.settings.confirmBigSpend && !(await confirmDialog('Order parts?', `${qty}× ${part.name} for ${money(cost)}.`, 'Order'))) return;
    ctx.act(orderParts(s, loc.id, part.id, qty, express), { sound: 'buy', money: -cost });
  };
  right.appendChild(panel(panelTitle('Parts store', h('span', { class: 'sub', text: mult > 1.01 ? `prices ${pct((mult - 1) * 100)} above normal` : 'normal prices' })),
    h('p', { class: 'tiny muted', text: 'Jobs and car preparation use parts. In stock means faster, cheaper work; out of stock means cars wait. An inventory manager reorders by himself.' }),
    ...PARTS.map((p) => {
      const have = stock[p.id] ?? 0;
      const low = have < p.min;
      return h('div', { class: 'part-row', data: { part: p.id } },
        h('span', { class: 'syn-ic', text: p.icon }),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: p.name }), h('div', { class: `tiny ${low ? 'warn' : 'muted'}`, text: `${have} in stock · keep ${p.min}+ · ${money(Math.round(p.cost * mult))} each · sells ${money(p.price)}` })),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn small', data: { order: '5' }, on: { click: order(p, 5) } }, '+5'),
          h('button', { class: 'btn small', data: { order: '20' }, on: { click: order(p, 20) } }, '+20'),
          h('button', { class: 'btn small', title: 'Express: tomorrow, 25% dearer', on: { click: order(p, 5, true) } }, '⚡5')));
    }),
    (loc.partsOrders ?? []).length ? h('div', { class: 'tiny muted', style: 'margin-top:8px', text: `On the way: ${(loc.partsOrders ?? []).map((o) => `${o.qty}× ${PART_BY_ID[o.part]?.name ?? o.part} (${shortDate(o.day)})`).join(', ')}` }) : null));
  view.appendChild(h('div', { class: 'grid split' }, left, right));
  return { el: view };
}

// ---------------------------------------------------------------- Fleet --

export function fleetView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const open = s.fleet.filter((r) => r.status === 'open');
  const accepted = s.fleet.filter((r) => r.status === 'accepted');
  const past = s.fleet.filter((r) => r.status !== 'open' && r.status !== 'accepted').slice(0, 20);
  view.appendChild(pageHead('Fleet & business sales', `${open.length} enquir${open.length === 1 ? 'y' : 'ies'} · ${accepted.length} order${accepted.length === 1 ? '' : 's'} to deliver · ${s.stats.fleetDelivered ?? 0} fleet cars delivered`));
  if (!fleetUnlocked(s)) {
    view.appendChild(panel('Fleet sales are not open yet', empty('Companies, taxi firms and councils buy cars by the dozen at a discount — with repeat orders and service contracts. Reach company level 3 or research fleet sales to receive enquiries.', {
      title: 'Locked', icon: 'key', action: h('button', { class: 'btn primary', on: { click: () => ctx.go('research') } }, 'Research'),
    })));
    return { el: view };
  }
  const reqCard = (r: (typeof s.fleet)[number]): HTMLElement => {
    const sector = FLEET_BY_ID[r.sector];
    const cands = r.status === 'accepted' ? candidatesFor(s, r) : [];
    const card = h('article', { class: 'card fleet-card', data: { fleet: r.id } },
      h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title', text: `${sector?.icon ?? '🚐'} ${r.client}` }), h('div', { class: 'card-sub', text: `${sector?.name ?? r.sector} · ${locationName(s, r.locationId)}` })),
        h('span', { class: `tag ${r.deadline - s.day < 7 ? 'warn' : ''}`, text: `${Math.max(0, r.deadline - s.day)} days left` })),
      h('div', { class: 'grid cols-2' },
        kv('Cars', `${r.delivered}/${r.qty}`), kv('Up to', `${money(r.maxUnit)} each`),
        kv('Discount asked', pct(r.discount * 100)), kv('Wants', [...r.categories, ...r.bodies].slice(0, 4).join(', ')),
        kv('Service contract', r.freeService ? 'free maintenance (a cost)' : r.serviceContract ? `${money(r.serviceContract)}/month` : '—'),
        kv('Repeat orders', r.repeatMonths ? `every ${r.repeatMonths} months if delivered well` : '—')),
      progressBar(r.delivered / r.qty, 'good'));
    if (r.status === 'open') {
      card.appendChild(h('div', { class: 'btn-row' },
        h('button', { class: 'btn', data: { act: 'decline' }, on: { click: () => ctx.act(declineFleet(s, r.id)) } }, 'Decline'),
        h('button', { class: 'btn primary', data: { act: 'accept' }, on: { click: () => ctx.act(acceptFleet(s, r.id), { sound: 'success' }) } }, 'Accept order')));
      card.appendChild(h('p', { class: 'tiny muted', text: 'Accepting commits you: missing the deadline costs reputation and the client.' }));
    } else if (r.status === 'accepted') {
      card.appendChild(h('div', { class: 'bp-sub', text: cands.length ? `Cars in stock that fit (${cands.length})` : 'No car in stock fits yet — buy matching cars in the Market' }));
      for (const v of cands.slice(0, 6)) {
        const price = fleetPrice(r, v);
        const profit = price - totalCost(v);
        card.appendChild(h('div', { class: 'fleet-cand' },
          h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'card-title', text: vehicleName(v) }), h('div', { class: `tiny ${profit >= 0 ? 'good' : 'bad'}`, text: `${money(price)} · ${profit >= 0 ? '+' : ''}${money(profit)} profit` })),
          h('button', { class: 'btn small primary', data: { deliver: v.id }, on: { click: () => ctx.act(deliverFleetCar(s, r.id, v.id), { sound: 'sale', money: price }) } }, 'Deliver')));
      }
      if (!cands.length) card.appendChild(h('button', { class: 'btn small', on: { click: () => ctx.go('market') } }, 'Go to the market'));
    }
    return card;
  };
  view.appendChild(panel(panelTitle('New enquiries', h('span', { class: 'sub', text: 'arrive weekly; more with a good reputation and fleet research' })),
    open.length ? h('div', { class: 'grid cols-2' }, ...open.map(reqCard)) : h('p', { class: 'empty', text: 'No open enquiries this week.' })));
  view.appendChild(panel('Orders to deliver', accepted.length ? h('div', { class: 'grid cols-2' }, ...accepted.map(reqCard)) : h('p', { class: 'empty', text: 'Accept an enquiry to start an order.' })));
  if (past.length) {
    view.appendChild(panel('History', table(['Client', 'Sector', 'Cars', 'Revenue', 'Result'], past.map((r) => [
      h('span', { text: r.client }), h('span', { class: 'tiny', text: FLEET_BY_ID[r.sector]?.name ?? r.sector }),
      h('span', { class: 'num', text: `${r.delivered}/${r.qty}` }), h('span', { class: 'num', text: money(r.revenue) }),
      h('span', { class: `tag ${r.status === 'done' ? 'good' : r.status === 'failed' ? 'bad' : ''}`, text: r.status }),
    ]))));
  }
  void isWide;
  return { el: view };
}

/** Location type text (used by the locations screen). */
export function locationTypeLine(loc: Location): string {
  const city = CITY_BY_ID[loc.cityId];
  const t = LOCATION_TYPES[city?.type ?? 'town'];
  return `${city?.type ?? 'town'} · ${t?.note ?? ''}`;
}
