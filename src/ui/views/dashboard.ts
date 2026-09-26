import { isPhone } from '../layout';
import { businessSummary } from '../mobile/summaries';
import type { Ctx, View } from '../app';
import { h, kpi, empty } from '../dom';
import { money, moneyShort, moneySigned, shortDate } from '../../sim/format';
import { companyValue, inventoryValue, periodTotals } from '../../sim/finance';
import { waitingCustomers, interestLabel, expectedLeads } from '../../sim/customers';
import { levelDef, levelProgress } from '../../sim/progress';
import { activeLocation, capacityOf, occupying, vehicleName } from '../../sim/state';
import { EVENT_BY_ID, ARCHETYPE_BY_ID } from '../../data/game';
import { eventText } from '../../sim/world';
import { chartLegend, multiChart, sparkline, barChart } from '../chart';
import { panel, panelTitle, progressBar, reputationStars, stars, tipped } from '../kit';
import { CATEGORIES } from '../../data/vehicles';

export function dashboardView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view dashboard' });
  const loc = activeLocation(s);
  const value = companyValue(s);
  const month = { revenue: s.month.revenue, profit: s.month.profit - s.month.expenses, sold: s.month.sold };
  const last30 = periodTotals(s, 30);
  const stock = s.vehicles.length;
  const listed = s.vehicles.filter((v) => v.status === 'listed').length;
  const avgStars = s.reviews.length ? s.reviews.slice(0, 30).reduce((a, r) => a + r.stars, 0) / Math.min(30, s.reviews.length) : 0;

  // Waiting customers first: this is the thing to act on.
  const waiting = waitingCustomers(s);
  if (waiting.length) {
    const p = h('section', { class: 'panel waiting-panel' },
      panelTitle(`${waiting.length} customer${waiting.length > 1 ? 's' : ''} waiting`, h('span', { class: 'sub', text: 'Serve them before they give up' })));
    for (const c of waiting.slice(0, 4)) {
      const v = s.vehicles.find((x) => x.id === c.vehicleId);
      const il = interestLabel(c.interest);
      p.appendChild(h('div', { class: 'waiting-row' },
        h('span', { class: 'wr-icon', text: ARCHETYPE_BY_ID[c.archetype].icon }),
        h('div', { class: 'wr-body' }, h('div', { class: 'wr-name', text: `${c.name} · ${ARCHETYPE_BY_ID[c.archetype].name}` }),
          h('div', { class: 'tiny muted', text: v ? `Wants the ${vehicleName(v)} (${money(v.askingPrice)})` : '' })),
        h('span', { class: `tag ${il.tone}`, text: il.label }),
        h('button', { class: 'btn primary small', on: { click: () => ctx.serve(c.id) } }, 'Serve')));
    }
    if (waiting.length > 4) p.appendChild(h('button', { class: 'btn ghost small', on: { click: () => ctx.go('customers') } }, `See all ${waiting.length}`));
    view.appendChild(p);
  }

  // Phones: one hero figure and five cards instead of eight equal tiles.
  if (isPhone()) view.appendChild(businessSummary(ctx));
  else view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    tipped(kpi({ label: 'Cash', value: money(s.cash), sub: s.loans.length ? `${s.loans.length} loan(s)` : 'no debt', icon: 'cash', tone: s.cash < 0 ? 'bad' : 'good', valueTone: s.cash < 0 ? 'bad' : undefined }), 'Money available to spend.'),
    tipped(kpi({ label: 'Company value', value: moneyShort(value), sub: `Level ${s.companyLevel} · ${levelDef(s.companyLevel).name}`, icon: 'worth', tone: 'accent' }), 'Cash + stock + premises + goodwill − debt.'),
    kpi({ label: "Today's revenue", value: money(s.today.revenue), sub: `profit ${moneySigned(s.today.profit - s.today.expenses)}`, icon: 'revenue', tone: 'info', subTone: s.today.profit - s.today.expenses >= 0 ? 'good' : 'bad' }),
    kpi({ label: 'This month', value: money(month.revenue), sub: `net ${moneySigned(month.profit)} · ${month.sold} sold`, icon: 'profit', tone: month.profit >= 0 ? 'good' : 'bad', subTone: month.profit >= 0 ? 'good' : 'bad' }),
  ));
  if (!isPhone()) view.appendChild(h('div', { class: 'grid cols-4 kpis' },
    kpi({ label: 'Inventory value', value: moneyShort(inventoryValue(s)), sub: `${stock} vehicles · ${listed} on sale`, icon: 'car', tone: 'tech' }),
    kpi({ label: 'Lot capacity', value: `${occupying(s, loc.id)} / ${capacityOf(loc)}`, sub: loc.name, icon: 'garage', tone: occupying(s, loc.id) >= capacityOf(loc) ? 'warn' : 'info' }),
    tipped(kpi({ label: 'Reputation', value: `${Math.round(s.reputation)}`, sub: reputationStars(s.reputation), icon: 'level', tone: s.reputation >= 60 ? 'good' : s.reputation >= 40 ? 'warn' : 'bad' }), 'Follows what customers say in reviews. More reputation means more customers.'),
    kpi({ label: 'Satisfaction', value: avgStars ? `${avgStars.toFixed(1)} ★` : '—', sub: `${s.stats.sold} sold · ${s.employees.length} staff`, icon: 'customer', tone: avgStars >= 4 ? 'good' : avgStars >= 3 ? 'warn' : 'bad' }),
  ));

  // Level progress
  const lp = levelProgress(s);
  if (lp.next) {
    view.appendChild(h('section', { class: 'panel next-step' },
      h('div', { class: 'next-step-label', text: `Next: level ${s.companyLevel + 1}` }),
      h('div', { class: 'next-step-title', text: lp.next.name }),
      h('div', { class: 'grid cols-2' },
        h('div', {}, h('div', { class: 'tiny muted', text: `Company value ${moneyShort(value)} / ${moneyShort(lp.next.value)}` }), progressBar(lp.value, 'good')),
        h('div', {}, h('div', { class: 'tiny muted', text: `Vehicles sold ${s.stats.sold} / ${lp.next.sold}` }), progressBar(lp.sold, 'good'))),
      h('div', { class: 'next-step-reward', text: `Unlocks: ${lp.next.unlocks.join(' · ')}` })));
  }

  const hist = s.history.slice(-45);
  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });
  const series = [
    { label: 'Cash', values: hist.map((d) => d.cash), color: '#3cc7ff', fill: true },
    { label: 'Company value', values: hist.map((d) => d.companyValue), color: '#ff7a1a' },
  ];
  left.appendChild(panel(panelTitle('Cash & company value', h('span', { class: 'sub', text: 'last 45 days' })), multiChart(series, { height: 170 }), chartLegend(series)));
  left.appendChild(panel(panelTitle('Daily profit', h('span', { class: 'sub', text: `30 days: ${moneySigned(last30.profit)} · ${last30.sold} sold` })), barChart(s.history.slice(-30).map((d) => d.profit), { height: 130 })));

  // Recent sales
  const sales = s.soldArchive.slice(0, 6);
  left.appendChild(panel(panelTitle('Recent sales', h('button', { class: 'btn ghost small', on: { click: () => ctx.go('sales') } }, 'All sales')),
    sales.length ? h('div', { class: 'list tight-rows' }, ...sales.map((v) => {
      const profit = (v.soldPrice ?? 0) - (v.purchasePrice + v.costs.transport + v.costs.inspection + v.costs.repairs + v.costs.detailing + v.costs.other);
      return h('div', { class: 'mini-row' },
        h('span', { class: 'mini-dot', style: `background:${v.colorHex}` }),
        h('span', { class: 'mini-name', text: vehicleName(v) }),
        h('span', { class: 'mini-meta', text: `${shortDate(v.soldDay ?? s.day)} · ${v.soldTo ?? ''}` }),
        h('span', { class: 'mini-num', text: money(v.soldPrice ?? 0) }),
        h('span', { class: `mini-num ${profit >= 0 ? 'good' : 'bad'}`, text: moneySigned(profit) }));
    })) : empty('No sales yet. Serve customers who walk in — or let your salesperson do it.', { title: 'Nothing sold', icon: 'tag' })));

  // Events and market
  const events = s.events;
  right.appendChild(panel(panelTitle('Market news', h('span', { class: 'sub', text: `${events.length} active event${events.length === 1 ? '' : 's'}` })),
    events.length ? h('div', { class: 'list' }, ...events.map((e) => {
      const d = EVENT_BY_ID[e.defId];
      return h('div', { class: 'news-mini' }, h('span', { class: 'event-icon', text: d?.icon ?? '📰' }),
        h('div', { style: 'min-width:0' }, h('div', { class: 'news-headline', text: d?.name ?? 'Event' }), h('div', { class: 'news-body', text: `${eventText(s, e.id)} (${Math.max(0, e.endDay - s.day)} days left)` })));
    })) : h('p', { class: 'empty', text: 'A calm market. Events like an EV boom or a fuel spike will show here.' })));

  const trendRows = CATEGORIES.map((c) => ({ c, v: s.trends[c] ?? 1, hist: s.trendHistory.map((t) => t.values[c] ?? 1) }))
    .sort((a, b) => b.v - a.v);
  right.appendChild(panel(panelTitle('Market trends', h('span', { class: 'sub', text: 'price level by category' })),
    h('div', { class: 'trend-list' }, ...trendRows.map((t) => h('div', { class: 'trend-row' },
      h('span', { class: 'trend-name', text: t.c }),
      sparkline(t.hist.length > 1 ? t.hist : [1, t.v], t.v >= 1 ? '#2fd18b' : '#ff4d5e', 70, 18),
      h('span', { class: `trend-val ${t.v >= 1.02 ? 'good' : t.v <= 0.98 ? 'bad' : 'muted'}`, text: `${t.v >= 1 ? '+' : ''}${((t.v - 1) * 100).toFixed(0)}%` }))))));

  const leads = expectedLeads(s, loc);
  right.appendChild(panel(panelTitle('Footfall', h('span', { class: 'sub', text: loc.name })),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Expected customers / day' }), h('span', { class: 'stat-value', text: leads.total.toFixed(1) })),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Walk-ins · online' }), h('span', { class: 'stat-value', text: `${leads.walkIn.toFixed(1)} · ${leads.online.toFixed(1)}` })),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Customers today' }), h('span', { class: 'stat-value', text: String(s.today.leads) }))));

  // Notices
  const notices = s.notices.slice(0, 7);
  right.appendChild(panel('Latest', notices.length ? h('div', {}, ...notices.map((n) => h('div', { class: 'alert-row' },
    h('span', { class: `alert-dot ${n.kind === 'bad' ? 'critical' : n.kind === 'event' ? 'warning' : n.kind === 'good' || n.kind === 'sale' ? 'success' : ''}` }),
    h('div', { class: 'alert-detail', style: 'flex:1', text: n.text }),
    h('span', { class: 'alert-time', text: `D${n.day}` })))) : h('p', { class: 'empty', text: 'Nothing yet.' })));

  // Recent transactions
  const txs = s.transactions.slice(0, 8);
  left.appendChild(panel(panelTitle('Recent transactions', h('button', { class: 'btn ghost small', on: { click: () => ctx.go('finances') } }, 'Ledger')),
    txs.length ? h('div', {}, ...txs.map((t) => h('div', { class: 'mini-row' },
      h('span', { class: 'mini-name', text: t.description }),
      h('span', { class: 'mini-meta', text: t.category }),
      h('span', { class: `mini-num ${t.amount >= 0 ? 'good' : 'bad'}`, text: moneySigned(t.amount) })))) : h('p', { class: 'empty', text: 'No transactions yet.' })));

  if (s.reviews.length) {
    const r = s.reviews[0];
    right.appendChild(panel(panelTitle('Latest review', h('button', { class: 'btn ghost small', on: { click: () => ctx.go('sales') } }, 'All reviews')),
      h('div', { class: 'review-row' }, h('span', { class: `review-row-stars ${r.stars >= 4 ? 'good' : r.stars <= 2 ? 'bad' : ''}`, text: stars(r.stars) }),
        h('span', { class: 'review-text', text: `“${r.text}” — ${r.customer}` }))));
  }

  view.appendChild(h('div', { class: 'grid split' }, left, right));
  return { el: view };
}
