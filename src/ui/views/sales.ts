import type { Ctx, View } from '../app';
import { empty, h, icon, table } from '../dom';
import { money, moneySigned, shortDate } from '../../sim/format';
import { totalCost } from '../../sim/market';
import { locationName } from '../../sim/state';
import { helpButton, pageHead, panel, panelTitle, stars, kv } from '../kit';
import { barChart } from '../chart';
import { isWide } from '../layout';

let q = '';

export function salesView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const sold = s.soldArchive;
  const avgProfit = sold.length ? sold.reduce((a, v) => a + (v.soldPrice ?? 0) - totalCost(v), 0) / sold.length : 0;
  const avgDays = sold.length ? sold.reduce((a, v) => a + v.daysInStock, 0) / sold.length : 0;
  view.appendChild(pageHead('Sales', `${s.stats.sold} vehicles sold · lifetime revenue ${money(s.stats.lifetimeRevenue)} · lifetime gross profit ${money(s.stats.lifetimeProfit)}`, helpButton('reputation')));

  const left = h('div', { class: 'col' });
  const right = h('div', { class: 'col' });

  const search = h('input', { type: 'search', placeholder: 'Search sales…', value: q, aria: { label: 'Search sales' } });
  const host = h('div', {});
  const draw = (): void => {
    const list = sold.filter((v) => !q || `${v.year} ${v.brand} ${v.model} ${v.soldTo ?? ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 80);
    if (!list.length) {
      host.replaceChildren(empty(sold.length ? 'No sales match your search.' : 'Your first sale will appear here, with the profit it made.', { title: 'No sales yet', icon: 'tag' }));
      return;
    }
    if (!isWide()) {
      host.replaceChildren(h('div', { class: 'compact-list' }, ...list.map((v) => {
        const profit = (v.soldPrice ?? 0) - totalCost(v);
        return h('div', { class: 'compact-row' },
          h('span', { class: 'mini-dot', style: `background:${v.colorHex}` }),
          h('div', { class: 'compact-main' }, h('div', { class: 'compact-title', text: `${v.year} ${v.brand} ${v.model}` }), h('div', { class: 'compact-sub', text: `${shortDate(v.soldDay ?? s.day)} · ${v.soldTo ?? ''} · ${v.daysInStock}d in stock` })),
          h('div', { class: 'compact-side' }, h('span', { text: money(v.soldPrice ?? 0) }), h('span', { class: profit >= 0 ? 'good' : 'bad', text: moneySigned(profit) })));
      })));
      return;
    }
    const rows = list.map((v) => {
      const profit = (v.soldPrice ?? 0) - totalCost(v);
      return [
        h('div', { class: 'cell-car' }, h('span', { class: 'mini-dot', style: `background:${v.colorHex}` }), h('span', { class: 'cell-person-name', text: `${v.year} ${v.brand} ${v.model}` })),
        h('span', { class: 'tiny', text: v.soldTo ?? '' }),
        h('span', { class: 'num', text: shortDate(v.soldDay ?? s.day) }),
        h('span', { class: 'num', text: money(v.soldPrice ?? 0) }),
        h('span', { class: 'num', text: money(totalCost(v)) }),
        h('span', { class: `num ${profit >= 0 ? 'good' : 'bad'}`, text: moneySigned(profit) }),
        h('span', { class: 'num', text: `${v.daysInStock}d` }),
        isWide() && s.locations.length > 1 ? h('span', { class: 'tiny', text: locationName(s, v.locationId) }) : h('span', { class: 'tiny muted', text: v.warranty ? 'Warranty' : '' }),
      ];
    });
    host.replaceChildren(table(['Vehicle', 'Buyer', 'Date', 'Price', 'Cost', 'Profit', 'Stock time', isWide() && s.locations.length > 1 ? 'Location' : 'Extras'], rows));
  };
  search.addEventListener('input', () => { q = search.value; draw(); });
  draw();
  left.appendChild(panel(panelTitle('Sales history'), h('div', { class: 'search wide' }, icon('search', 15), search), host));

  right.appendChild(panel('Performance',
    kv('Average profit per car', moneySigned(avgProfit), avgProfit >= 0 ? 'good' : 'bad'),
    kv('Average days in stock', avgDays.toFixed(1)),
    kv('Biggest deal', money(s.stats.biggestDeal)),
    kv('Best month (net)', money(s.stats.bestMonthProfit)),
    kv('Vehicles bought', String(s.stats.vehiclesBought))));
  right.appendChild(panel(panelTitle('Units sold per day', h('span', { class: 'sub', text: 'last 30 days' })), barChart(s.history.slice(-30).map((d) => d.sold), { height: 110, color: '#ff7a1a' })));

  const reviews = s.reviews;
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.stars, 0) / reviews.length : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => reviews.filter((r) => r.stars === n).length);
  const revPanel = panel(panelTitle('Customer reviews', h('span', { class: 'sub', text: `${reviews.length} reviews` })));
  if (!reviews.length) revPanel.appendChild(h('p', { class: 'empty', text: 'Every buyer leaves a review. They drive your reputation.' }));
  else {
    revPanel.appendChild(h('div', { class: 'review-summary' },
      h('div', { class: 'review-score', text: avg.toFixed(1) }),
      h('div', {}, h('div', { class: 'review-stars', text: stars(avg) }), h('div', { class: 'tiny muted', text: `Reputation ${Math.round(s.reputation)}/100` })),
      h('div', { class: 'review-dist' }, ...dist.map((n, i) => h('div', { class: 'dist-row' }, h('span', { class: 'tiny', text: `${5 - i}★` }), h('div', { class: 'bar' }, h('div', { class: 'bar-fill warn', style: `width:${reviews.length ? (n / reviews.length) * 100 : 0}%` })), h('span', { class: 'tiny muted', text: String(n) }))))));
    for (const r of reviews.slice(0, 25)) {
      revPanel.appendChild(h('div', { class: 'review-row' },
        h('span', { class: `review-row-stars ${r.stars >= 4 ? 'good' : r.stars <= 2 ? 'bad' : ''}`, text: stars(r.stars) }),
        h('div', {}, h('div', { class: 'review-text', text: `“${r.text}”` }), h('div', { class: 'tiny muted', text: `${r.customer} · ${r.vehicle} · day ${r.day}` }))));
    }
  }
  right.appendChild(revPanel);
  view.appendChild(h('div', { class: 'grid split' }, left, right));
  return { el: view };
}
