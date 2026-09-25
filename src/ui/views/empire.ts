/**
 * Company-level screens: the dealer group (HQ, departments, regional
 * managers, acquisitions), rivals, brand identity, the economy, KPIs and the
 * stock-ageing desk.
 */
import type { Ctx, View } from '../app';
import { confirmDialog, empty, h, kpi, table } from '../dom';
import { money, moneyShort, moneySigned, pct, shortDate } from '../../sim/format';
import { CITY_BY_ID } from '../../data/game';
import { BRAND_COLORS, BRAND_LOGOS, BRAND_POSITIONS, DEPARTMENTS, HQ_COST, HQ_MONTHLY } from '../../data/group';
import { activeLocation, locationName, staffAt, vehicleName } from '../../sim/state';
import { acquire, acquisitionTargets, appointRegional, buyDepartment, canAcquire, canOpenHq, identityCost, liquidate, openHq, regionalManager, setIdentity } from '../../sim/systems/group';
import { competitorPressure, marketShare } from '../../sim/world';
import { economyMood, lendingRate } from '../../sim/systems/economy';
import { AGING_BUCKETS, agingReport, autoPricer, certify, certifyCheck } from '../../sim/systems/inventory';
import { agingBucket, conditionGrade, roundPrice, suggestedPrice, totalCost } from '../../sim/market';
import { categoryTotals, inventoryValue } from '../../sim/finance';
import { campaignRoi } from '../../sim/world';
import { chartLegend, multiChart, barChart, lineChart, SERIES_COLORS } from '../chart';
import { helpButton, kv, pageHead, panel, panelTitle, progressBar, tipped } from '../kit';
import { openVehicle } from '../modals/vehicle';
import { invalidateStatic } from '../world/render';
import { toggleDemo } from '../../sim/customers';
import { locationPicker } from './business';

// ----------------------------------------------------------------- Group --

export function groupView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const g = s.group;
  view.appendChild(pageHead('Dealer group', g.hq ? `Headquarters open since ${shortDate(g.hqDay ?? s.day)} · ${g.acquisitions} acquisition${g.acquisitions === 1 ? '' : 's'}` : 'Run several dealerships as one company', helpButton('group')));

  const hqCheck = canOpenHq(s);
  if (!g.hq) {
    view.appendChild(panel('Group headquarters', h('p', { class: 'tiny muted', text: `A headquarters (${money(HQ_COST)}, then ${money(HQ_MONTHLY)}/month) unlocks central departments and regional managers who run branches for you.` }),
      h('button', { class: `btn wrap ${hqCheck.ok ? 'primary' : ''}`, data: { act: 'hq' }, disabled: !hqCheck.ok, on: { click: async () => { if (await confirmDialog('Open a headquarters?', `${money(HQ_COST)} now and ${money(HQ_MONTHLY)} a month.`, 'Open HQ')) ctx.act(openHq(s), { sound: 'success', money: -HQ_COST }); } } }, hqCheck.ok ? `Open headquarters · ${money(HQ_COST)}` : hqCheck.reason ?? 'Not yet')));
  } else {
    view.appendChild(panel(panelTitle('Central departments', h('span', { class: 'sub', text: 'serve every location' })),
      h('div', { class: 'grid cols-3' }, ...DEPARTMENTS.map((d) => {
        const lvl = g.departments[d.id] ?? 0;
        const cost = d.costs[lvl];
        return h('article', { class: 'card', data: { dept: d.id } },
          h('div', { class: 'card-head' }, h('div', { class: 'card-title', text: `${d.icon} ${d.name}` }), h('span', { class: `tag ${lvl ? 'good' : ''}`, text: `Level ${lvl}/${d.costs.length}` })),
          h('p', { class: 'tiny muted', text: d.description }),
          ...d.effect.map((e, i) => h('div', { class: `tiny ${i < lvl ? 'good' : 'muted'}`, text: `${i < lvl ? '✓' : `L${i + 1}`} ${e}` })),
          lvl ? h('div', { class: 'tiny muted', text: `Running cost ${money(d.monthly[lvl - 1])}/month` }) : null,
          cost !== undefined ? h('button', { class: 'btn small primary block', disabled: s.cash < cost, on: { click: async () => { if (await confirmDialog(`${d.name} level ${lvl + 1}?`, `${money(cost)} now, ${money(d.monthly[lvl])}/month.`, 'Build')) ctx.act(buyDepartment(s, d.id), { sound: 'buy', money: -cost }); } } }, `Level ${lvl + 1} · ${money(cost)}`) : h('span', { class: 'tag good', text: 'Complete' }));
      }))));
    view.appendChild(panel(panelTitle('Regional managers', h('span', { class: 'sub', text: 'a level 3+ manager runs a branch: auto-listing, repricing, parts, +5% leads' })),
      table(['Location', 'Regional manager', 'Candidates'], s.locations.map((l) => {
        const rm = regionalManager(s, l.id);
        const cands = staffAt(s, l.id).filter((e) => e.role === 'manager' && e.level >= 3 && e.id !== rm?.id);
        return [
          h('span', { text: l.name }),
          h('span', { class: rm ? 'good' : 'muted', text: rm ? `${rm.name} (L${rm.level})` : 'None' }),
          cands.length ? h('div', { class: 'btn-row' }, ...cands.map((e) => h('button', { class: 'btn small', on: { click: () => ctx.act(appointRegional(s, l.id, e.id), { sound: 'success' }) } }, `Appoint ${e.name}`))) : h('span', { class: 'tiny muted', text: 'Promote a manager at this branch to level 3' }),
        ];
      }))));
  }

  // Acquisitions.
  const can = canAcquire(s);
  const targets = acquisitionTargets(s);
  view.appendChild(panel(panelTitle('Acquisitions', h('span', { class: 'sub', text: can.ok ? 'buy a rival: its premises, stock, staff and customers' : can.reason ?? '' })),
    targets.length ? table(['Dealer', 'City', 'Reputation', 'Cars', 'Staff', 'Debt', 'Price', ''], targets.map(({ c, val }) => [
      h('div', {}, h('div', { class: 'cell-person-name', text: c.name }), h('div', { class: 'tiny muted', text: c.lastMove ?? `${c.strategy ?? 'volume'} strategy` })),
      h('span', { class: 'tiny', text: CITY_BY_ID[c.cityId]?.name ?? c.cityId }),
      h('span', { class: 'num', text: String(Math.round(c.reputation)) }),
      h('span', { class: 'num', text: String(val.cars) }),
      h('span', { class: 'num', text: String(val.staff) }),
      h('span', { class: `num ${val.debt > 50000 ? 'bad' : ''}`, text: money(val.debt) }),
      h('span', { class: 'num', text: money(val.price) }),
      h('button', {
        class: 'btn small primary', data: { acquire: c.id }, disabled: !can.ok || s.cash < val.price,
        on: { click: async () => { if (await confirmDialog(`Buy ${c.name}?`, `${money(val.price)} for ${val.cars} cars, ${val.staff} staff and their customers. Their debt (${money(val.debt)}) becomes your loan.`, 'Buy')) ctx.act(acquire(s, c.id), { sound: 'success', money: -val.price }); } },
      }, 'Buy'),
    ])) : h('p', { class: 'empty', text: 'No rivals left to buy.' })));

  if (s.locations.length > 1) {
    view.appendChild(panel(panelTitle('Wind down a branch', h('span', { class: 'sub', text: 'sell its stock to the trade and let the team go before closing it' })),
      h('div', { class: 'btn-row' }, ...s.locations.map((l) => h('button', { class: 'btn small danger', on: { click: async () => { if (await confirmDialog(`Liquidate ${l.name}?`, 'All its cars are sold to the trade at about 78% of their price and its staff are let go (half a month severance each). Then you can close it.', 'Liquidate', true)) ctx.act(liquidate(s, l.id)); } } }, `Liquidate ${l.name}`)))));
  }
  return { el: view };
}

// ----------------------------------------------------------------- Rivals --

export function rivalsView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  view.appendChild(pageHead('Competitors', `${s.competitors.length} rival dealers across your cities · they react to you every week`));
  const cities = [...new Set([...s.locations.map((l) => l.cityId), ...s.competitors.map((c) => c.cityId)])];
  for (const cityId of cities) {
    const rivals = s.competitors.filter((c) => c.cityId === cityId);
    const mine = s.locations.some((l) => l.cityId === cityId);
    if (!mine && !rivals.length) continue;
    const share = marketShare(s, cityId);
    view.appendChild(panel(panelTitle(`${CITY_BY_ID[cityId]?.name ?? cityId}`, h('span', { class: 'sub', text: `competition ${Math.round(competitorPressure(s, cityId) * 100)}%${mine ? '' : ' · you do not trade here'}` })),
      h('div', { class: 'share-bars' }, ...share.map((r) => h('div', { class: `share-row${r.mine ? ' mine' : ''}` }, h('span', { class: 'tiny', text: r.name }), progressBar(r.share, r.mine ? 'good' : 'info'), h('span', { class: 'tiny num', text: pct(r.share * 100) })))),
      rivals.length ? table(['Dealer', 'Strategy', 'Focus', 'Prices', 'Marketing', 'Stock', 'Staff', 'Reputation', 'Latest move'], rivals.map((c) => [
        h('span', { class: 'cell-person-name', text: `${c.name}${c.promoDaysLeft ? ' 🏷️' : ''}` }),
        h('span', { class: 'tiny', text: c.strategy ?? 'volume' }),
        h('span', { class: 'tiny', text: c.specialization }),
        tipped(h('span', { class: `num ${(c.priceIndex ?? 1) < 0.97 ? 'bad' : ''}`, text: `${Math.round((c.priceIndex ?? 1) * 100)}%` }), 'Their prices versus the market. Under 100% means they undercut.'),
        h('span', { class: 'num', text: pct((c.marketing ?? 0.3) * 100) }),
        h('span', { class: 'num', text: String(c.size) }),
        h('span', { class: 'num', text: String(c.staff ?? '—') }),
        h('span', { class: `tag ${c.reputation >= 70 ? 'bad' : c.reputation >= 45 ? 'warn' : 'good'}`, text: String(Math.round(c.reputation)) }),
        h('span', { class: 'tiny', text: c.lastMove ?? (c.trend > 0.2 ? 'growing' : c.trend < -0.2 ? 'struggling' : 'steady') }),
      ])) : h('p', { class: 'empty', text: 'No rivals in this city.' })));
  }
  return { el: view };
}

// --------------------------------------------------------------- Identity --

export function identityView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const b = s.branding;
  const draft = { color: b.color, logo: b.logo, position: b.position ?? 'honest' };
  const cost = identityCost(s);
  view.appendChild(pageHead('Brand identity', `${b.logo} ${s.companyName} — “${b.tagline}”`));
  const preview = h('div', { class: 'brand-preview' });
  const paintPreview = (): void => {
    const pos = BRAND_POSITIONS.find((p) => p.id === draft.position)!;
    preview.style.setProperty('--brand', draft.color);
    preview.replaceChildren(h('span', { class: 'brand-logo', text: draft.logo }), h('div', {}, h('div', { class: 'brand-name', text: s.companyName }), h('div', { class: 'tiny', text: pos.tagline })));
  };
  paintPreview();
  const colors = h('div', { class: 'swatch-row' }, ...BRAND_COLORS.map((c) => h('button', { class: `swatch${c === draft.color ? ' active' : ''}`, style: `background:${c}`, aria: { label: `Colour ${c}` }, data: { color: c }, on: { click: (e: Event) => { draft.color = c; colors.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('active', x === e.currentTarget)); paintPreview(); } } })));
  const logos = h('div', { class: 'swatch-row' }, ...BRAND_LOGOS.map((l) => h('button', { class: `logo-pick${l === draft.logo ? ' active' : ''}`, data: { logo: l }, on: { click: (e: Event) => { draft.logo = l; logos.querySelectorAll('.logo-pick').forEach((x) => x.classList.toggle('active', x === e.currentTarget)); paintPreview(); } } }, l)));
  const positions = h('div', { class: 'choice-list' }, ...BRAND_POSITIONS.map((p) => h('button', {
    class: `choice${p.id === draft.position ? ' active' : ''}`, data: { position: p.id },
    on: { click: (e: Event) => { draft.position = p.id; positions.querySelectorAll('.choice').forEach((x) => x.classList.toggle('active', x === e.currentTarget)); paintPreview(); } },
  }, h('div', { class: 'card-title', text: `“${p.tagline}”` }), h('div', { class: 'tiny muted', text: p.description }))));
  view.appendChild(h('div', { class: 'grid split' },
    h('div', { class: 'col' },
      panel('Colour', colors), panel('Logo', logos),
      panel(panelTitle('Brand promise', h('span', { class: 'sub', text: 'changes which buyers come to every location' })), positions)),
    h('div', { class: 'col' },
      panel('Preview', preview, h('p', { class: 'tiny muted', text: 'Your colour and logo appear on the signs, flags and banners at your dealerships and in the header.' }),
        h('button', { class: 'btn primary block', data: { act: 'apply-identity' }, on: { click: async () => { if (cost && !(await confirmDialog('Rebrand?', `New signs and adverts at ${s.locations.length} location${s.locations.length === 1 ? '' : 's'}: ${money(cost)}.`, 'Rebrand'))) return; const r = setIdentity(s, draft); if (r.ok) invalidateStatic(); ctx.act(r, { sound: 'success', money: cost && r.ok ? -cost : undefined }); } } }, cost ? `Apply · ${money(cost)}` : 'Apply (free in your first week)')))));
  return { el: view };
}

// ---------------------------------------------------------------- Economy --

export function economyView(ctx: Ctx): View {
  const s = ctx.state;
  const e = s.economy;
  const view = h('div', { class: 'view' });
  const mood = economyMood(e);
  view.appendChild(pageHead('Economy', `The economy is ${mood.label.toLowerCase()} · it moves every week and with market events`));
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Consumer confidence', value: `${Math.round(e.confidence)}/100`, sub: 'more buyers, bigger budgets', icon: 'customer', tone: mood.tone === 'bad' ? 'bad' : 'good' }),
    kpi({ label: 'Interest rate', value: pct(e.rate, 1), sub: `dealer lending ${pct(lendingRate(s) * 100, 1)}`, icon: 'finance', tone: 'tech' }),
    kpi({ label: 'Fuel price', value: `×${e.fuel.toFixed(2)}`, sub: e.fuel > 1.1 ? 'buyers want economy, hybrid & EV' : e.fuel < 0.92 ? 'big engines are popular' : 'normal', icon: 'gauge', tone: 'warn' }),
    kpi({ label: 'Growth', value: `${e.growth >= 0 ? '+' : ''}${e.growth.toFixed(1)}%`, sub: `EV incentive ${pct(e.evIncentive * 100)} · import cost ×${e.importCost.toFixed(2)}`, icon: 'progress', tone: 'info' })));
  const hist = e.history.slice(-52);
  if (hist.length > 1) {
    const series = [
      { label: 'Confidence', values: hist.map((x) => x.confidence), color: SERIES_COLORS.good },
      { label: 'Interest ×10', values: hist.map((x) => x.rate * 10), color: SERIES_COLORS.warn },
      { label: 'Fuel ×50', values: hist.map((x) => x.fuel * 50), color: SERIES_COLORS.info },
    ];
    view.appendChild(panel(panelTitle('The last year', h('span', { class: 'sub', text: 'weekly' })), multiChart(series, { height: 180 }), chartLegend(series)));
  } else view.appendChild(panel('History', h('p', { class: 'empty', text: 'Figures are recorded every week.' })));
  view.appendChild(panel('What it means for you', h('div', { class: 'tiny list' },
    h('p', { text: 'Confidence and growth decide how many buyers come and how much they spend.' }),
    h('p', { text: 'The interest rate sets finance APRs (so approvals and monthly payments), your loan costs and the floor-plan interest on your stock.' }),
    h('p', { text: 'Fuel prices shift demand between big engines and economical, hybrid and electric cars. EV incentives make electric cars easier to sell; import costs change importer prices.' }))));
  return { el: view };
}

// ------------------------------------------------------------------- KPIs --

export function kpiView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const days = Math.min(30, s.history.length);
  const hist = s.history.slice(-30);
  const sum = (f: (d: (typeof hist)[number]) => number): number => hist.reduce((a, d) => a + f(d), 0);
  const revenue = sum((d) => d.revenue);
  const net = sum((d) => d.profit);
  const sold = sum((d) => d.sold);
  const leads = sum((d) => d.leads);
  const cats = categoryTotals(s, s.day - 30);
  const neg = (k: string[]): number => -k.reduce((a, c) => a + Math.min(0, cats[c] ?? 0), 0);
  const pos = (k: string[]): number => k.reduce((a, c) => a + Math.max(0, cats[c] ?? 0), 0);
  const staffCost = neg(['Salaries', 'Commission', 'Bonus', 'Training']);
  const rent = neg(['Rent']);
  const opex = neg(['Utilities', 'Insurance', 'Maintenance', 'Listing fees', 'Taxes', 'Loan interest', 'Other', 'Delivery', 'Marketing']);
  const cashStart = hist[0]?.cash ?? s.cash;
  const stock = s.vehicles.filter((v) => v.status !== 'sold');
  const avgAge = stock.length ? stock.reduce((a, v) => a + v.daysInStock, 0) / stock.length : 0;
  const gross = s.month.profit;
  const camp = s.campaigns.filter((c) => c.endDay < s.day).slice(0, 10);
  const roi = camp.length ? camp.reduce((a, c) => a + campaignRoi(c), 0) / camp.length : 0;
  const fin = s.kpi.financeDeals / Math.max(1, s.month.sold);
  view.appendChild(pageHead('Key figures', `Last ${days} days unless noted`));
  view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Revenue', value: moneyShort(revenue), sub: `${sold} cars sold`, icon: 'revenue', tone: 'info' }),
    kpi({ label: 'Gross profit (month)', value: moneyShort(gross), sub: `avg ${money(Math.round(s.stats.lifetimeProfit / Math.max(1, s.stats.sold)))}/car all-time`, icon: 'profit', tone: 'good' }),
    kpi({ label: 'Net profit', value: moneySigned(net), sub: `margin ${revenue ? pct((net / revenue) * 100, 1) : '—'}`, icon: 'worth', tone: net >= 0 ? 'good' : 'bad', valueTone: net >= 0 ? 'good' : 'bad' }),
    kpi({ label: 'Cash flow', value: moneySigned(s.cash - cashStart), sub: `cash now ${moneyShort(s.cash)}`, icon: 'cash', tone: 'accent' }),
    kpi({ label: 'Stock value', value: moneyShort(inventoryValue(s)), sub: `${stock.length} cars · avg ${Math.round(avgAge)} days old`, icon: 'car', tone: 'tech' }),
    kpi({ label: 'Conversion', value: leads ? pct((sold / leads) * 100, 1) : '—', sub: `${leads} leads · ${(leads / Math.max(1, days)).toFixed(1)}/day`, icon: 'customer', tone: 'info' }),
    kpi({ label: 'Finance penetration', value: pct(fin * 100), sub: `${money(s.kpi.financeIncome)} finance income`, icon: 'finance', tone: 'tech' }),
    kpi({ label: 'Service revenue', value: moneyShort(s.kpi.serviceRevenue + s.kpi.partsRevenue), sub: 'labour + parts this month', icon: 'wrench', tone: 'good' }),
    kpi({ label: 'Marketing ROI', value: camp.length ? `${roi >= 0 ? '+' : ''}${pct(roi * 100)}` : '—', sub: `last ${camp.length} campaigns`, icon: 'marketing', tone: roi >= 0 ? 'good' : 'bad' }),
    kpi({ label: 'Staff cost', value: moneyShort(staffCost), sub: 'salaries, commission, bonus, training', icon: 'people', tone: 'warn' }),
    kpi({ label: 'Rent', value: moneyShort(rent), sub: `${s.locations.length} location${s.locations.length === 1 ? '' : 's'}`, icon: 'garage', tone: 'warn' }),
    kpi({ label: 'Operating costs', value: moneyShort(opex), sub: `income besides cars ${moneyShort(pos(['Service', 'Parts', 'Finance income', 'Extras', 'Dealer bonus']))}`, icon: 'report', tone: 'warn' })));
  const h45 = s.history.slice(-45);
  const flow = [
    { label: 'Revenue', values: h45.map((d) => d.revenue), color: SERIES_COLORS.info, fill: true },
    { label: 'Expenses', values: h45.map((d) => d.expenses), color: SERIES_COLORS.bad },
  ];
  view.appendChild(h('div', { class: 'grid cols-2' },
    panel(panelTitle('Revenue & expenses', h('span', { class: 'sub', text: 'per day' })), multiChart(flow, { height: 160 }), chartLegend(flow)),
    panel(panelTitle('Net profit', h('span', { class: 'sub', text: 'per day' })), barChart(h45.map((d) => d.profit), { height: 160 })),
    panel(panelTitle('Stock value'), lineChart(h45.map((d) => d.inventoryValue), { height: 140 })),
    panel(panelTitle('Leads & sales', h('span', { class: 'sub', text: 'per day' })), multiChart([{ label: 'Leads', values: h45.map((d) => d.leads), color: SERIES_COLORS.good }, { label: 'Sold', values: h45.map((d) => d.sold), color: SERIES_COLORS.accent }], { height: 140 }))));
  const aging = agingReport(s);
  view.appendChild(panel(panelTitle('Stock age', h('button', { class: 'btn ghost small', on: { click: () => ctx.go('stock') } }, 'Stock desk')),
    table(['Days in stock', 'Cars', 'Money tied up'], AGING_BUCKETS.map((b) => [h('span', { text: b }), h('span', { class: 'num', text: String(aging[b].count) }), h('span', { class: 'num', text: money(aging[b].cost) })]))));
  return { el: view };
}

// ------------------------------------------------------------- Stock desk --

let stockFilter: 'all' | '31-60' | '61-90' | '90+' | 'certify' = 'all';

export function stockView(ctx: Ctx): View {
  const s = ctx.state;
  const loc = activeLocation(s);
  const view = h('div', { class: 'view' });
  const aging = agingReport(s, loc.id);
  const pricer = autoPricer(s, loc.id);
  view.appendChild(pageHead('Stock desk', `${loc.name}: ageing, repricing and certified pre-owned · ${pricer ? `${pricer} reprices ageing cars weekly` : 'nobody reprices automatically (hire an inventory manager)'}`));
  const picker = locationPicker(ctx);
  if (picker) view.appendChild(picker);
  view.appendChild(h('div', { class: 'grid cols-4 kpis' }, ...AGING_BUCKETS.map((b, i) => kpi({ label: `${b} days`, value: String(aging[b].count), sub: money(aging[b].cost), icon: 'clock', tone: (['good', 'info', 'warn', 'bad'] as const)[i] }))));
  const cars = s.vehicles.filter((v) => v.locationId === loc.id && (v.status === 'listed' || v.status === 'yard'))
    .filter((v) => stockFilter === 'all' || (stockFilter === 'certify' ? certifyCheck(s, v).ok : agingBucket(v) === stockFilter))
    .sort((a, b) => b.daysInStock - a.daysInStock);
  view.appendChild(panel(panelTitle('Cars on the lot', h('div', { class: 'seg small' }, ...(['all', '31-60', '61-90', '90+', 'certify'] as const).map((f) => h('button', { class: `seg-btn${f === stockFilter ? ' active' : ''}`, data: { stock: f }, on: { click: () => { stockFilter = f; ctx.refresh(); } } }, f === 'all' ? 'All' : f === 'certify' ? 'Ready to certify' : `${f} d`)))),
    cars.length ? table(['Car', 'Grade', 'Days', 'Asking', 'Suggested', 'Cost', 'Margin', ''], cars.map((v) => {
      const sug = suggestedPrice(s, v);
      const cost = totalCost(v);
      const cert = certifyCheck(s, v);
      return [
        h('div', {}, h('div', { class: 'cell-person-name', text: vehicleName(v) }), h('div', { class: 'tiny muted', text: `${v.status === 'listed' ? 'for sale' : 'not listed'}${v.demo ? ' · demo car' : ''}${v.certified ? ' · ✔ certified' : ''}${v.priceCuts ? ` · cut ${v.priceCuts}×` : ''}` })),
        h('span', { class: 'tag plain', text: conditionGrade(v) }),
        h('span', { class: `num ${v.daysInStock > 60 ? 'bad' : v.daysInStock > 30 ? 'warn' : ''}`, text: String(v.daysInStock) }),
        h('span', { class: 'num', text: v.askingPrice ? money(v.askingPrice) : '—' }),
        h('span', { class: 'num', text: money(sug) }),
        h('span', { class: 'num', text: money(cost) }),
        h('span', { class: `num ${(v.askingPrice || sug) - cost >= 0 ? 'good' : 'bad'}`, text: moneySigned((v.askingPrice || sug) - cost) }),
        h('div', { class: 'btn-row' },
          v.askingPrice && Math.abs(v.askingPrice - sug) > 50 ? h('button', { class: 'btn small', data: { reprice: v.id }, on: { click: () => { v.askingPrice = sug; v.floorPrice = Math.min(v.floorPrice || sug, roundPrice(sug * 0.92)); if (sug < v.askingPrice) v.priceCuts = (v.priceCuts ?? 0) + 1; ctx.act({ ok: true, message: `${vehicleName(v)} now ${money(sug)}.` }); } } }, 'Reprice') : null,
          !v.certified && !v.isNew ? tipped(h('button', { class: `btn small${cert.ok ? ' primary' : ''}`, data: { certify: v.id }, disabled: !cert.ok, on: { click: () => ctx.act(certify(s, v.id), { sound: 'success', money: -cert.cost }) } }, `Certify ${money(cert.cost)}`), cert.ok ? 'Checks, a 12-month warranty and a badge: sells for more, to more people.' : `Missing: ${cert.missing.join(', ')}`) : null,
          tipped(h('button', { class: `btn small${v.demo ? ' primary' : ''}`, data: { demo: v.id }, on: { click: () => ctx.act(toggleDemo(s, v.id)) } }, v.demo ? 'Demo ✓' : 'Demo'), 'A demo car is test-driven instead of the other cars of the same model here: they keep their low miles. It sells for about 3% less.'),
          h('button', { class: 'btn small ghost', on: { click: () => openVehicle(ctx, v.id) } }, 'Open')),
      ];
    })) : empty(stockFilter === 'certify' ? 'No car meets the certified standard yet: advanced inspection, all faults fixed, a full service and presentation 70+ (and the research).' : 'No cars here.', { icon: 'car' })));
  void kv; void locationName; void lineChart;
  return { el: view };
}
