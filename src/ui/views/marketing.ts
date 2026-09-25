import type { Ctx, View } from '../app';
import { confirmDialog, h, table } from '../dom';
import { money, moneySigned, pct } from '../../sim/format';
import { CHANNELS, CHANNEL_BY_ID } from '../../data/game';
import { campaignCost, campaignReach, campaignRoi, channelAvailable, conversion, costPerLead, launchCampaign } from '../../sim/world';
import { reachableClients } from '../../sim/systems/crm';
import { expectedLeads, listedAt } from '../../sim/customers';
import { listingQuality } from '../../sim/vehicles';
import { activeLocation, locationName, upgradeLevel } from '../../sim/state';
import { pageHead, panel, panelTitle, progressBar, tipped } from '../kit';

const BUDGETS = [{ v: 0.5, label: 'Small' }, { v: 1, label: 'Normal' }, { v: 2, label: 'Big' }];
const budgetFor: Record<string, number> = {};

export function marketingView(ctx: Ctx): View {
  const s = ctx.state;
  const view = h('div', { class: 'view' });
  const loc = activeLocation(s);
  const running = s.campaigns.filter((c) => c.endDay >= s.day);
  view.appendChild(pageHead('Marketing', `${running.length} campaign${running.length === 1 ? '' : 's'} running · ${loc.name}: ~${expectedLeads(s, loc).total.toFixed(1)} customers a day`));

  if (s.locations.length > 1) {
    view.appendChild(h('div', { class: 'pill-row' }, h('span', { class: 'tiny muted', text: 'Campaign location:' }),
      ...s.locations.map((l) => h('button', { class: `pill${l.id === loc.id ? ' active' : ''}`, on: { click: () => { s.activeLocationId = l.id; ctx.refresh(); } } }, l.name))));
  }

  const grid = h('div', { class: 'grid cols-3' });
  for (const ch of CHANNELS) {
    const budget = budgetFor[ch.id] ?? 1;
    const cost = campaignCost(s, ch.id, budget);
    const avail = channelAvailable(s, ch.id);
    const locked = !avail.ok;
    const active = running.find((c) => c.channelId === ch.id && c.locationId === loc.id);
    const reach = campaignReach(s, ch.id, budget);
    const history = s.campaigns.filter((c) => c.channelId === ch.id && c.endDay < s.day);
    const hLeads = history.reduce((a, c) => a + c.leads, 0);
    const hCost = history.reduce((a, c) => a + c.cost, 0);
    const hRev = history.reduce((a, c) => a + c.revenue, 0);
    grid.appendChild(h('article', { class: `card channel${locked ? ' muted-card' : ''}`, data: { channel: ch.id } },
      h('div', { class: 'card-head' }, h('div', {}, h('div', { class: 'card-title', text: `${ch.icon} ${ch.name}` }), h('div', { class: 'card-sub', text: `${ch.reach}${ch.online ? ` · ${Math.round(ch.online * 100)}% online` : ''}` })),
        active ? h('span', { class: 'tag good', text: `${active.endDay - s.day + 1}d left` }) : locked ? h('span', { class: 'tag', text: ch.minLevel > s.companyLevel ? `Level ${ch.minLevel}` : 'Locked' }) : null),
      h('p', { class: 'tiny muted', text: ch.description }),
      locked ? h('p', { class: 'tiny warn', text: avail.reason ?? '' }) : null,
      h('div', { class: 'seg small', role: 'tablist' }, ...BUDGETS.map((b) => h('button', {
        class: `seg-btn${b.v === budget ? ' active' : ''}`, data: { budget: String(b.v) }, disabled: !!active || locked,
        on: { click: () => { budgetFor[ch.id] = b.v; ctx.refresh(); } },
      }, b.label))),
      h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Cost' }), h('span', { class: 'stat-value', text: `${money(cost)} / ${ch.days} days` })),
      tipped(h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Reach' }), h('span', { class: 'stat-value', text: ch.crm ? `${reachableClients(s)} clients` : `${reach.toLocaleString('en-GB')} people` })), 'How many people see it. A bigger budget reaches more, with diminishing returns.'),
      tipped(h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Extra customers' }), h('span', { class: 'stat-value good', text: `+${Math.round(ch.leadBoost * Math.sqrt(budget) * 100)}%` })), 'Boost to walk-in and online leads while it runs (more with a marketing specialist).'),
      history.length ? h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Your track record' }), h('span', { class: `stat-value ${hRev >= hCost ? 'good' : 'bad'}`, text: `${hLeads} leads · ${hLeads ? money(Math.round(hCost / hLeads)) : '—'}/lead` })) : null,
      h('button', {
        class: 'btn primary block', disabled: locked || !!active, data: { launch: ch.id },
        on: {
          click: async () => {
            if (cost >= s.settings.confirmBigSpend && !(await confirmDialog('Launch campaign?', `Spend ${money(cost)} on ${ch.name} at ${loc.name}?`, 'Launch'))) return;
            ctx.act(launchCampaign(s, ch.id, loc.id, budget), { sound: 'buy', money: -cost });
          },
        },
      }, active ? 'Running' : locked ? 'Locked' : `Launch · ${money(cost)}`)));
  }
  view.appendChild(panel('Campaigns', grid));

  const past = s.campaigns.slice(0, 20);
  view.appendChild(panel(panelTitle('Campaign results', h('span', { class: 'sub', text: 'revenue from customers the campaign brought in' })),
    past.length ? table(['Campaign', 'Location', 'Days', 'Cost', 'Reach', 'Leads', 'Per lead', 'Sold', 'Conv.', 'Revenue', 'ROI'], past.map((c) => {
      const def = CHANNEL_BY_ID[c.channelId];
      const roi = campaignRoi(c);
      return [
        h('span', { text: `${def?.icon ?? ''} ${def?.name ?? c.channelId}${c.budget && c.budget !== 1 ? ` (${c.budget < 1 ? 'small' : 'big'})` : ''}` }),
        h('span', { class: 'tiny', text: locationName(s, c.locationId) }),
        h('span', { class: 'num', text: c.endDay >= s.day ? `day ${s.day - c.startDay + 1}/${c.endDay - c.startDay + 1}` : 'done' }),
        h('span', { class: 'num', text: money(c.cost) }),
        h('span', { class: 'num', text: (c.reach ?? 0).toLocaleString('en-GB') }),
        h('span', { class: 'num', text: String(c.leads) }),
        h('span', { class: 'num', text: c.leads ? money(costPerLead(c)) : '—' }),
        h('span', { class: 'num', text: String(c.sales ?? 0) }),
        h('span', { class: 'num', text: c.leads ? pct(conversion(c) * 100) : '—' }),
        h('span', { class: 'num', text: money(c.revenue) }),
        h('span', { class: `num ${roi >= 0 ? 'good' : 'bad'}`, text: `${roi >= 0 ? '+' : ''}${pct(roi * 100)}` }),
      ];
    })) : h('p', { class: 'empty', text: 'Launch a campaign to bring more customers through the door.' })));

  const listed = listedAt(s, loc.id);
  const online = listed.filter((v) => v.listedOnline);
  const avgQ = online.length ? online.reduce((a, v) => a + listingQuality(s, v), 0) / online.length : 0;
  view.appendChild(panel(panelTitle('Online listings', h('span', { class: 'sub', text: `${online.length} of ${listed.length} cars online · €3/day each` })),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label', text: 'Average listing quality' }), h('span', { class: 'stat-value', text: `${Math.round(avgQ * 100)}/100` })),
    progressBar(avgQ, 'good'),
    h('p', { class: 'tiny muted', text: `Quality comes from presentation, pro photos, price versus value, reputation and your Digital Marketing upgrade (level ${upgradeLevel(loc, 'marketing')}).` }),
    online.length ? table(['Vehicle', 'Quality', 'Asking', 'Days'], online.slice(0, 20).map((v) => [
      h('span', { text: `${v.year} ${v.brand} ${v.model}` }),
      h('span', { class: 'num', text: `${Math.round(listingQuality(s, v) * 100)}` }),
      h('span', { class: 'num', text: money(v.askingPrice) }),
      h('span', { class: 'num', text: String(v.daysInStock) }),
    ])) : h('p', { class: 'empty', text: 'Tick “Advertise online” on a listed vehicle to reach buyers beyond your street.' })));
  void moneySigned;
  return { el: view };
}
